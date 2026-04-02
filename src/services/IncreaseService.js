const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class IncreaseService {
    constructor() {
        this.apiKey = process.env.INCREASE_API_KEY;
        this.accountId = process.env.INCREASE_ACCOUNT_ID; // Your Increase source account ID
        this.fundingAccountId = process.env.INCREASE_FUNDING_ACCOUNT_ID; // External account ID for your business bank (funding source)
        this.minBalance = parseFloat(process.env.INCREASE_MIN_BALANCE) || 3000;   // Replenish trigger threshold (dollars)
        this.replenishAmount = parseFloat(process.env.INCREASE_REPLENISH_AMOUNT) || 5000; // Amount to pull when replenishing (dollars)
        this.baseUrl = process.env.INCREASE_SANDBOX === 'true'
            ? 'https://sandbox.increase.com'
            : 'https://api.increase.com';
    }

    _client() {
        return axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
        });
    }

    isConfigured() {
        const configured = !!(this.apiKey && this.accountId);
        if (!configured) {
            logger.warn(`[INCREASE] NOT configured — apiKey: ${this.apiKey ? 'set' : 'MISSING'}, accountId: ${this.accountId ? 'set' : 'MISSING'}`);
        }
        return configured;
    }

    /**
     * Create an external account (owner's recipient bank account)
     * Returns Increase external_account object with { id, status, description, ... }
     */
    async createRecipient({ name, routingNumber, accountNumber, accountType = 'CHECKING' }) {
        try {
            const res = await this._client().post('/external_accounts', {
                account_number: accountNumber,
                routing_number: routingNumber,
                description: name,
                account_holder: 'individual',
                funding: accountType.toLowerCase() === 'savings' ? 'savings' : 'checking',
            });
            return res.data;
        } catch (err) {
            if (err.response && err.response.status === 409) {
                const detail = err.response.data?.detail || '';
                // "No institution found for routing number" = invalid routing number, not a duplicate
                if (detail.toLowerCase().includes('no institution found')) {
                    const userMsg = 'Invalid routing number — no bank found for this ABA routing number. Please double-check and try again.';
                    const validationErr = new Error(userMsg);
                    validationErr.isValidation = true;
                    throw validationErr;
                }
                // Otherwise it's a true duplicate — find and reuse the existing account
                logger.info('External account already exists in Increase (409 conflict)', {
                    routingNumber,
                    accountNumberLast4: accountNumber.slice(-4),
                });
                const existing = await this.findExternalAccount(routingNumber, accountNumber);
                if (existing) {
                    logger.info('Found existing external account, reusing', { id: existing.id });
                    if (existing.description !== name) {
                        try {
                            const updated = await this._client().patch(`/external_accounts/${existing.id}`, { description: name });
                            return updated.data;
                        } catch (updateErr) {
                            logger.warn('Could not update existing external account description', { error: updateErr.message });
                        }
                    }
                    return existing;
                }
            }
            throw err;
        }
    }

    /**
     * Find an existing external account by routing and account number
     */
    async findExternalAccount(routingNumber, accountNumber) {
        try {
            const res = await this._client().get('/external_accounts', {
                params: { routing_number: routingNumber, account_number: accountNumber },
            });
            const accounts = res.data.data || [];
            return accounts.length > 0 ? accounts[0] : null;
        } catch (err) {
            logger.warn('Failed to search external accounts', { error: err.message });
            // Fallback: list all and filter
            try {
                const all = await this.listRecipients();
                return all.find(a => a.routing_number === routingNumber && a.account_number === accountNumber) || null;
            } catch (e) {
                return null;
            }
        }
    }

    /**
     * Archive (deactivate) an external account in Increase
     */
    async archiveRecipient(externalAccountId) {
        const res = await this._client().patch(`/external_accounts/${externalAccountId}`, {
            status: 'archived',
        });
        return res.data;
    }

    /**
     * Get external account by ID
     * Returns shape compatible with legacy WiseService: { active, accountHolderName, ...raw }
     */
    async getRecipient(externalAccountId) {
        const res = await this._client().get(`/external_accounts/${externalAccountId}`);
        const acct = res.data;
        return {
            ...acct,
            active: acct.status === 'active',
            accountHolderName: acct.description,
        };
    }

    /**
     * List all external accounts
     */
    async listRecipients() {
        const res = await this._client().get('/external_accounts');
        return res.data.data || [];
    }

    /**
     * Get available balance in dollars
     * Increase returns balance in cents (integer)
     */
    async getBalance() {
        const res = await this._client().get(`/accounts/${this.accountId}/balance`);
        return res.data.available_balance / 100;
    }

    /**
     * Get raw balance details object
     */
    async getBalanceDetails() {
        const res = await this._client().get(`/accounts/${this.accountId}/balance`);
        return res.data;
    }

    /**
     * Get your Increase account's bank details for receiving inbound payments.
     * Used when an owner owes money (negative statement) and needs to send funds to us.
     */
    async getAccountBankDetails() {
        // Try Increase account numbers API first
        try {
            const res = await this._client().get(`/account_numbers?account_id=${this.accountId}`);
            const numbers = res.data.data || [];
            if (numbers.length > 0) {
                return [{
                    bankName: 'Increase',
                    routingNumber: numbers[0].routing_number,
                    accountNumber: numbers[0].account_number,
                    accountType: 'CHECKING',
                    source: 'api',
                }];
            }
        } catch (e) {
            logger.warn('Could not fetch account numbers from Increase', { error: e.message });
        }

        // Fallback to env variables
        if (process.env.INCREASE_BANK_ROUTING && process.env.INCREASE_BANK_ACCOUNT) {
            return [{
                bankName: process.env.INCREASE_BANK_NAME || 'Increase',
                routingNumber: process.env.INCREASE_BANK_ROUTING,
                accountNumber: process.env.INCREASE_BANK_ACCOUNT,
                accountType: 'CHECKING',
                source: 'env',
            }];
        }

        return null;
    }

    /**
     * Create a single ACH transfer to an external account.
     * Increase expects amount in cents (integer).
     */
    async createTransfer({ externalAccountId, amount, statementDescriptor, statementId, individualName, idempotencyKey }) {
        const amountCents = Math.round(amount * 100);
        const descriptor = (statementDescriptor || `Payout #${statementId}`).substring(0, 22);
        const body = {
            account_id: this.accountId,
            external_account_id: externalAccountId,
            amount: amountCents,
            statement_descriptor: descriptor,
            standard_entry_class_code: 'prearranged_payments_and_deposit',
            company_entry_description: 'PAYOUT',
        };
        // individual_name is required for PPD (prearranged_payments_and_deposit) SEC code
        if (individualName) {
            body.individual_name = individualName.substring(0, 22);
        }
        const headers = {};
        if (idempotencyKey) {
            headers['Idempotency-Key'] = idempotencyKey;
        }
        const res = await this._client().post('/ach_transfers', body, { headers });
        return res.data;
    }

    /**
     * Get ACH transfer status
     */
    async getTransfer(transferId) {
        const res = await this._client().get(`/ach_transfers/${transferId}`);
        return res.data;
    }

    /**
     * List ACH transfers
     */
    async listTransfers({ limit = 10 } = {}) {
        const res = await this._client().get(`/ach_transfers?limit=${limit}`);
        return res.data.data || [];
    }

    /**
     * Full single payout flow — create ACH transfer.
     * Returns { transfer, wiseFee: 0 } (Increase fees are billed separately, not per-API-call)
     */
    async sendPayout({ recipientId, amount, reference, statementId, individualName }) {
        const descriptor = (reference || `Payout #${statementId}`).substring(0, 22);
        const idempotencyKey = crypto.createHash('sha256').update(`payout-${statementId}-${amount}-${recipientId}`).digest('hex');
        const transfer = await this.createTransfer({
            externalAccountId: recipientId,
            amount,
            statementDescriptor: descriptor,
            statementId,
            individualName,
            idempotencyKey,
        });
        logger.info('Increase ACH transfer created', {
            transferId: transfer.id,
            amount,
            status: transfer.status,
            statementId,
        });
        return { transfer, wiseFee: 0 };
    }

    /**
     * Batch payouts — creates individual ACH transfers for each payout.
     * Returns { transfers } compatible with former WiseService.sendBatchPayouts shape.
     */
    async sendBatchPayouts(payouts) {
        const transfers = [];
        for (const payout of payouts) {
            const descriptor = (payout.reference || `Payout #${payout.statementId}`).substring(0, 22);
            const idempotencyKey = crypto.createHash('sha256').update(`batch-${payout.statementId}-${payout.amount}-${payout.recipientId}`).digest('hex');
            const transfer = await this.createTransfer({
                externalAccountId: payout.recipientId,
                amount: payout.amount,
                statementDescriptor: descriptor,
                statementId: payout.statementId,
                individualName: payout.individualName,
                idempotencyKey,
            });
            transfers.push({ transfer, wiseFee: 0, statementId: payout.statementId });
            logger.info('Increase batch transfer created', {
                transferId: transfer.id,
                statementId: payout.statementId,
                amount: payout.amount,
            });
        }
        logger.info('Increase batch payouts complete', { count: transfers.length });
        return { transfers };
    }

    /**
     * Whether a funding source (business bank external account) is configured.
     */
    isFundingConfigured() {
        return !!(this.apiKey && this.accountId && this.fundingAccountId);
    }

    /**
     * Pull funds from your business bank into the Increase account via ACH debit.
     * Creates an inbound ACH transfer by debiting the funding external account.
     * Amount is in dollars. Returns the ACH transfer object.
     *
     * Note: ACH debits typically settle same-day or next business day.
     */
    async requestFunding(amountDollars) {
        if (!this.isFundingConfigured()) {
            throw new Error('Funding source not configured — set INCREASE_FUNDING_ACCOUNT_ID');
        }
        const amountCents = Math.round(amountDollars * 100);
        const idempotencyKey = crypto.createHash('sha256')
            .update(`funding-${this.accountId}-${amountCents}-${new Date().toISOString().slice(0, 10)}`)
            .digest('hex');
        const body = {
            account_id: this.accountId,
            external_account_id: this.fundingAccountId,
            amount: -amountCents,  // negative = ACH debit (pull funds IN)
            statement_descriptor: 'ACCOUNT FUNDING',
            standard_entry_class_code: 'prearranged_payments_and_deposit',
            company_entry_description: 'FUNDING',
        };
        const res = await this._client().post('/ach_transfers', body, {
            headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        });
        logger.info('Funding transfer initiated', {
            transferId: res.data.id,
            amount: amountDollars,
            status: res.data.status,
        });
        return res.data;
    }

    /**
     * Check balance and auto-fund if insufficient for the given payout amount.
     * Returns { balance, funded, fundingTransferId, deficit }.
     * - funded=false means balance was already sufficient.
     * - funded=true means a funding ACH debit was initiated (payouts should be queued).
     */
    async checkAndAutoFund(neededAmountDollars) {
        let balance;
        try {
            balance = await this.getBalance();
        } catch (e) {
            logger.warn('Failed to check Increase balance', { error: e.message });
            return { balance: null, funded: false, fundingTransferId: null, deficit: 0 };
        }

        if (balance >= neededAmountDollars) {
            return { balance, funded: false, fundingTransferId: null, deficit: 0 };
        }

        // Insufficient — pull funds from business bank
        const deficit = neededAmountDollars - balance;
        // Pull at least the replenish amount, or the deficit + buffer, whichever is larger
        const fundingAmount = Math.max(this.replenishAmount, Math.ceil((deficit * 1.1) * 100) / 100);

        if (!this.isFundingConfigured()) {
            logger.warn('Insufficient balance and no funding source configured', { balance, needed: neededAmountDollars });
            return { balance, funded: false, fundingTransferId: null, deficit, error: 'No funding source configured' };
        }

        const transfer = await this.requestFunding(fundingAmount);
        return {
            balance,
            funded: true,
            fundingTransferId: transfer.id,
            fundingAmount,
            deficit,
        };
    }

    /**
     * Proactive threshold-based replenish.
     * Called during reconciliation — if balance drops below INCREASE_MIN_BALANCE,
     * pull INCREASE_REPLENISH_AMOUNT from the business bank.
     * Returns { replenished, balance, fundingTransferId } or null if not needed.
     */
    async checkAndReplenish() {
        if (!this.isFundingConfigured()) return null;

        let balance;
        try {
            balance = await this.getBalance();
        } catch (e) {
            logger.warn('Failed to check balance for replenish', { error: e.message });
            return null;
        }

        if (balance >= this.minBalance) {
            logger.info('Balance above threshold, no replenish needed', { balance, minBalance: this.minBalance });
            return { replenished: false, balance };
        }

        logger.info('Balance below threshold, initiating replenish', {
            balance, minBalance: this.minBalance, replenishAmount: this.replenishAmount,
        });

        try {
            const transfer = await this.requestFunding(this.replenishAmount);
            return {
                replenished: true,
                balance,
                fundingTransferId: transfer.id,
                fundingAmount: this.replenishAmount,
            };
        } catch (e) {
            logger.logError(e, { context: 'IncreaseService', action: 'autoReplenishIfNeeded', balance });
            return { replenished: false, balance, error: e.message };
        }
    }

    /**
     * Get transaction history for reconciliation.
     * Returns { transactions } compatible with former WiseService.getBalanceStatement shape.
     */
    async getBalanceStatement(intervalStart, intervalEnd) {
        const res = await this._client().get('/transactions', {
            params: {
                account_id: this.accountId,
                'created_at.after': intervalStart.toISOString(),
                'created_at.before': intervalEnd.toISOString(),
                limit: 100,
            },
        });
        // Normalize to legacy shape used by inbound-transactions endpoint
        const transactions = (res.data.data || []).map(t => ({
            ...t,
            type: t.amount > 0 ? 'CREDIT' : 'DEBIT',
            amount: { value: Math.abs(t.amount) / 100, currency: 'USD' },
        }));
        return { transactions };
    }
}

module.exports = new IncreaseService();
