const axios = require('axios');
const logger = require('../utils/logger');

class WiseService {
    constructor() {
        this.apiToken = process.env.WISE_API_TOKEN;
        this.profileId = process.env.WISE_PROFILE_ID;
        this.baseUrl = process.env.WISE_SANDBOX === 'true'
            ? 'https://api.sandbox.transferwise.tech'
            : 'https://api.wise.com';
    }

    _client() {
        return axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.apiToken}`,
                'Content-Type': 'application/json',
            },
        });
    }

    isConfigured() {
        return !!(this.apiToken && this.profileId);
    }

    /**
     * Create a USD-to-USD quote for a payout
     */
    async createQuote(amount) {
        const res = await this._client().post(`/v3/profiles/${this.profileId}/quotes`, {
            sourceCurrency: 'USD',
            targetCurrency: 'USD',
            sourceAmount: null,
            targetAmount: amount,
            payOut: 'BALANCE',
        });
        return res.data;
    }

    /**
     * Create a recipient (owner's US bank account)
     */
    async createRecipient({ name, email, routingNumber, accountNumber, accountType = 'CHECKING', address = {} }) {
        const res = await this._client().post('/v1/accounts', {
            profile: parseInt(this.profileId),
            accountHolderName: name,
            currency: 'USD',
            type: 'aba',
            details: {
                legalType: 'PRIVATE',
                abartn: routingNumber,
                accountNumber: accountNumber,
                accountType: accountType,
                email: email || undefined,
                address: {
                    country: address.country || 'US',
                    city: address.city,
                    firstLine: address.street,
                    state: address.state || undefined,
                    postCode: address.zip,
                },
            },
        });
        return res.data;
    }

    /**
     * Get recipient details by ID
     */
    async getRecipient(recipientId) {
        const res = await this._client().get(`/v1/accounts/${recipientId}`);
        return res.data;
    }

    /**
     * Create a transfer using a quote and recipient
     */
    async createTransfer({ recipientId, quoteId, reference, statementId }) {
        const res = await this._client().post('/v1/transfers', {
            targetAccount: recipientId,
            quoteUuid: quoteId,
            customerTransactionId: `stmt-${statementId}-${Date.now()}`,
            details: {
                reference: reference || 'Owner Statement Payout',
            },
        });
        return res.data;
    }

    /**
     * Fund a transfer from Wise balance
     */
    async fundTransfer(transferId) {
        const res = await this._client().post(
            `/v3/profiles/${this.profileId}/transfers/${transferId}/payments`,
            { type: 'BALANCE' }
        );
        return res.data;
    }

    /**
     * Get transfer status
     */
    async getTransfer(transferId) {
        const res = await this._client().get(`/v1/transfers/${transferId}`);
        return res.data;
    }

    /**
     * Get USD balance details
     */
    async getBalance() {
        const res = await this._client().get(`/v4/profiles/${this.profileId}/balances?types=STANDARD`);
        const usd = res.data.find(b => b.currency === 'USD');
        return usd ? usd.amount.value : 0;
    }

    /**
     * Get the USD balance object (includes recipientId for top-ups)
     */
    async getBalanceDetails() {
        const res = await this._client().get(`/v4/profiles/${this.profileId}/balances?types=STANDARD`);
        const usd = res.data.find(b => b.currency === 'USD');
        return usd || null;
    }

    /**
     * Top up Wise balance.
     * Preferred funding order (fastest first):
     *   1. DEBIT (instant — debit card on file)
     *   2. DIRECT_DEBIT (same-day ACH)
     *   3. BANK_TRANSFER (1-3 days ACH)
     *
     * If WISE_TOPUP_METHOD env is set, uses that method exclusively.
     * Returns { quote, transfer, funded, estimatedArrival, fundingMethod }
     */
    async topUpBalance(amount) {
        // Get the balance's own recipientId (this is "yourself")
        const balanceDetails = await this.getBalanceDetails();
        if (!balanceDetails || !balanceDetails.recipientId) {
            throw new Error('Could not find USD balance recipientId for top-up');
        }
        const selfRecipientId = balanceDetails.recipientId;

        // 1. Create a quote for topping up balance
        const quote = await this.createQuote(amount);
        logger.info('Wise top-up quote created', { quoteId: quote.id, amount });

        // Log available payment options from quote
        if (quote.paymentOptions) {
            const available = quote.paymentOptions.map(o => `${o.payIn}(fee:${o.fee?.total || 0})`).join(', ');
            logger.info('Available top-up methods', { available });
        }

        // 2. Create transfer to self (balance top-up)
        const transfer = await this.createTransfer({
            recipientId: selfRecipientId,
            quoteId: quote.id,
            reference: `Balance top-up for owner payouts`,
            statementId: `topup-${Date.now()}`,
        });
        logger.info('Wise top-up transfer created', { transferId: transfer.id });

        // 3. Fund the transfer — try fastest method first
        const preferredMethod = process.env.WISE_TOPUP_METHOD; // e.g. 'DEBIT', 'DIRECT_DEBIT', 'BANK_TRANSFER'
        const fundingOrder = preferredMethod
            ? [preferredMethod]
            : ['DEBIT', 'DIRECT_DEBIT', 'BANK_TRANSFER'];

        let funded = null;
        let usedMethod = null;

        for (const method of fundingOrder) {
            try {
                const res = await this._client().post(
                    `/v3/profiles/${this.profileId}/transfers/${transfer.id}/payments`,
                    { type: method }
                );
                funded = res.data;
                usedMethod = method;
                logger.info(`Wise top-up funded via ${method}`, { transferId: transfer.id, status: funded.status });
                break;
            } catch (e) {
                const msg = e.response?.data?.message || e.response?.data?.errors?.[0]?.message || e.message;
                logger.warn(`Top-up funding via ${method} failed`, { error: msg });
            }
        }

        if (!funded) {
            throw new Error(`Failed to fund top-up. Tried: ${fundingOrder.join(', ')}. Ensure a debit card or bank account is linked in Wise.`);
        }

        const estimatedArrival = usedMethod === 'DEBIT'
            ? 'instant'
            : (transfer.estimatedDeliveryDate || null);

        return { quote, transfer, funded, estimatedArrival, fundingMethod: usedMethod };
    }

    /**
     * Get balance statement (inbound/outbound transactions) for reconciliation.
     * Returns array of transactions in the date range.
     */
    async getBalanceStatement(intervalStart, intervalEnd) {
        const balanceDetails = await this.getBalanceDetails();
        if (!balanceDetails) {
            throw new Error('Could not find USD balance');
        }
        const balanceId = balanceDetails.id;

        const res = await this._client().get(
            `/v1/profiles/${this.profileId}/balance-statements/${balanceId}/statement.json`,
            {
                params: {
                    currency: 'USD',
                    intervalStart: intervalStart.toISOString(),
                    intervalEnd: intervalEnd.toISOString(),
                    type: 'COMPACT',
                },
            }
        );
        return res.data;
    }

    /**
     * Get your Wise account's bank details (routing + account number for receiving payments).
     * Tries multiple approaches:
     * 1. Balance statement bankDetails field
     * 2. Borderless accounts bankDetails
     * 3. Env variable fallback
     */
    async getAccountBankDetails() {
        // Approach 1: Get from balance statement (confirmed working)
        try {
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const statementData = await this.getBalanceStatement(weekAgo, now);
            if (statementData.bankDetails && statementData.bankDetails.length > 0) {
                return statementData.bankDetails;
            }
        } catch (e) {
            logger.warn('Could not fetch bank details from balance statement', { error: e.message });
        }

        // Approach 2: Get from borderless-accounts endpoint
        try {
            const res = await this._client().get(
                `/v1/borderless-accounts?profileId=${this.profileId}`
            );
            const accounts = res.data;
            if (Array.isArray(accounts) && accounts.length > 0) {
                const usdBalance = accounts[0].balances?.find(b => b.currency === 'USD');
                if (usdBalance?.bankDetails && usdBalance.bankDetails.length > 0) {
                    return usdBalance.bankDetails;
                }
            }
        } catch (e) {
            logger.warn('Could not fetch bank details from borderless-accounts', { error: e.message });
        }

        // Approach 3: Env variable fallback
        if (process.env.WISE_BANK_ROUTING && process.env.WISE_BANK_ACCOUNT) {
            return [{
                bankName: process.env.WISE_BANK_NAME || 'Community Federal Savings Bank',
                routingNumber: process.env.WISE_BANK_ROUTING,
                accountNumber: process.env.WISE_BANK_ACCOUNT,
                accountType: 'CHECKING',
                address: process.env.WISE_BANK_ADDRESS || '',
                source: 'env',
            }];
        }

        return null;
    }

    /**
     * Get list of transfers (for tracking/reconciliation)
     */
    async listTransfers({ limit = 10, offset = 0, status } = {}) {
        const params = { profile: this.profileId, limit, offset };
        if (status) params.status = status;
        const res = await this._client().get('/v1/transfers', { params });
        return res.data;
    }

    /**
     * Get list of recipients (v2 paginated endpoint with full details)
     */
    async listRecipients({ currency = 'USD' } = {}) {
        const res = await this._client().get(`/v2/accounts?profileId=${this.profileId}&currency=${currency}`);
        return res.data.content || res.data;
    }

    /**
     * Create a batch group for bulk payouts
     */
    async createBatchGroup(name) {
        const res = await this._client().post(`/v3/profiles/${this.profileId}/batch-groups`, {
            name: name || `Owner Payouts ${new Date().toISOString().slice(0, 10)}`,
            sourceCurrency: 'USD',
        });
        return res.data;
    }

    /**
     * Add a transfer to a batch group
     */
    async addToBatch(batchGroupId, transferId) {
        const res = await this._client().post(
            `/v3/profiles/${this.profileId}/batch-groups/${batchGroupId}/transfers/${transferId}/add`
        );
        return res.data;
    }

    /**
     * Complete (finalize) a batch group — no more transfers can be added
     */
    async completeBatch(batchGroupId, version) {
        const res = await this._client().put(
            `/v3/profiles/${this.profileId}/batch-groups/${batchGroupId}/complete`,
            { version }
        );
        return res.data;
    }

    /**
     * Fund a batch group (pays all transfers in the batch at once)
     */
    async fundBatch(batchGroupId) {
        const res = await this._client().post(
            `/v3/profiles/${this.profileId}/batch-groups/${batchGroupId}/fund`,
            { type: 'BALANCE' }
        );
        return res.data;
    }

    /**
     * Get batch group details
     */
    async getBatchGroup(batchGroupId) {
        const res = await this._client().get(
            `/v3/profiles/${this.profileId}/batch-groups/${batchGroupId}`
        );
        return res.data;
    }

    /**
     * Send batch payouts — creates a batch group, adds all transfers, completes and funds.
     * More efficient than individual transfers for bulk payouts.
     * Input: Array of { recipientId, amount, reference, statementId }
     * Returns { batchGroup, transfers, funded }
     */
    async sendBatchPayouts(payouts) {
        // 1. Create batch group
        const batchGroup = await this.createBatchGroup();
        logger.info('Wise batch group created', { batchGroupId: batchGroup.id, count: payouts.length });

        // 2. Create quotes + transfers and add to batch
        const transfers = [];
        for (const payout of payouts) {
            const quote = await this.createQuote(payout.amount);
            const transfer = await this.createTransfer({
                recipientId: payout.recipientId,
                quoteId: quote.id,
                reference: payout.reference,
                statementId: payout.statementId,
            });

            await this.addToBatch(batchGroup.id, transfer.id);

            const wiseFee = quote.paymentOptions
                ? quote.paymentOptions.find(o => o.payIn === 'BALANCE')?.fee?.total || 0
                : 0;

            transfers.push({ transfer, quote, wiseFee, statementId: payout.statementId });
        }

        // 3. Complete the batch
        const batchDetails = await this.getBatchGroup(batchGroup.id);
        const completed = await this.completeBatch(batchGroup.id, batchDetails.version);
        logger.info('Wise batch group completed', { batchGroupId: batchGroup.id });

        // 4. Fund the batch from balance
        const funded = await this.fundBatch(batchGroup.id, completed.version);
        logger.info('Wise batch group funded', { batchGroupId: batchGroup.id, status: funded.status });

        return { batchGroup: completed, transfers, funded };
    }

    /**
     * Full payout flow: quote -> transfer -> fund
     * Returns { transfer, quote, funded }
     */
    async sendPayout({ recipientId, amount, reference, statementId }) {
        // 1. Create quote
        const quote = await this.createQuote(amount);
        logger.info('Wise quote created', { quoteId: quote.id, amount, fee: quote.paymentOptions?.[0]?.fee?.total });

        // 2. Create transfer
        const transfer = await this.createTransfer({
            recipientId,
            quoteId: quote.id,
            reference,
            statementId,
        });
        logger.info('Wise transfer created', { transferId: transfer.id, statementId });

        // 3. Fund from balance
        const funded = await this.fundTransfer(transfer.id);
        logger.info('Wise transfer funded', { transferId: transfer.id, status: funded.status });

        // Extract fee from quote
        const wiseFee = quote.paymentOptions
            ? quote.paymentOptions.find(o => o.payIn === 'BALANCE')?.fee?.total || 0
            : 0;

        return { transfer, quote, funded, wiseFee };
    }
}

module.exports = new WiseService();
