const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class IncreaseService {
    constructor() {
        this.apiKey = process.env.INCREASE_API_KEY;
        this.accountId = process.env.INCREASE_ACCOUNT_ID; // Your Increase source account ID
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
            console.log('[IncreaseService] NOT configured — apiKey:', this.apiKey ? `set (${this.apiKey.substring(0, 8)}...)` : 'MISSING', '| accountId:', this.accountId ? `set (${this.accountId.substring(0, 10)}...)` : 'MISSING', '| baseUrl:', this.baseUrl);
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
            // 409 = duplicate external account already exists in Increase
            // (can happen if a previous setup attempt created the account in Increase
            //  but the app DB update failed, leaving 0 "connected" accounts in the UI)
            if (err.response && err.response.status === 409) {
                logger.info('External account already exists in Increase (409 conflict)', {
                    routingNumber,
                    accountNumberLast4: accountNumber.slice(-4),
                    increaseResponse: err.response.data,
                });
                const existing = await this.findExternalAccount(routingNumber, accountNumber);
                if (existing) {
                    logger.info('Found existing external account, reusing', { id: existing.id });
                    // Update description if name changed
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
                logger.error('409 conflict but could not find existing external account');
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
