const OAuthClient = require('intuit-oauth');
const QuickBooks = require('node-quickbooks');
const fs = require('fs');
const path = require('path');

// Import database model for multi-worker token sharing
let QuickBooksToken = null;
try {
    QuickBooksToken = require('../models/QuickBooksToken');
} catch (e) {
    console.log('[QuickBooks] Token model not available, using memory-only storage');
}

class QuickBooksService {
    constructor() {
        this.companyId = process.env.QUICKBOOKS_COMPANY_ID;
        this.accessToken = process.env.QUICKBOOKS_ACCESS_TOKEN;
        this.refreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN;
        this.clientId = process.env.QUICKBOOKS_CLIENT_ID;
        this.clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
        this.redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;

        // Central sandbox/production setting - controlled by env var (default: true for sandbox)
        this.useSandbox = process.env.QUICKBOOKS_USE_SANDBOX !== 'false';
        this.environment = this.useSandbox ? 'sandbox' : 'production';

        // Initialize OAuth client
        this.oauthClient = new OAuthClient({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            environment: this.environment,
            redirectUri: this.redirectUri,
        });

        // Store tokens like working example
        this.tokenSet = null;
        this.realmId = this.companyId;

        // Set tokens if available - assume they're valid until proven otherwise
        if (this.accessToken && this.refreshToken && this.companyId) {
            this.tokenSet = {
                access_token: this.accessToken,
                refresh_token: this.refreshToken,
                expires_in: 86400, // Assume valid for 24 hours, will refresh if needed
                token_type: 'Bearer'
            };
            this.oauthClient.setToken(this.tokenSet);
            this.realmId = this.companyId;
        }

        console.log(`QuickBooks service initialized for ${this.environment.toUpperCase()} environment`);
        console.log(`Client ID: ${this.clientId}`);
        console.log(`Redirect URI: ${this.redirectUri}`);
        
        // Default departments for categorization
        this.defaultDepartments = [
            'Maintenance',
            'Cleaning',
            'Utilities',
            'Marketing',
            'Management',
            'Insurance',
            'Legal',
            'Accounting',
            'Technology',
            'Other'
        ];
    }

    /**
     * Generate OAuth authorization URL - exactly like working example
     * @returns {string} Authorization URL
     */
    getAuthorizationUrl() {
        try {
            const url = this.oauthClient.authorizeUri({
                scope: [OAuthClient.scopes.Accounting], // Use proper scope constant
                state: 'secureRandomState123',
            });
            console.log('Generated auth URI:', url);
            return url;
        } catch (error) {
            console.error('Error generating auth URL:', error);
            throw error;
        }
    }

    /**
     * Exchange authorization code for tokens - exactly like working example
     * @param {string} reqUrl - Full request URL from callback
     * @returns {Promise<Object>} Token response
     */
    async exchangeCodeForTokens(reqUrl) {
        try {
            console.log('Exchanging code for tokens with URL:', reqUrl);
            
            // This parses the full redirect URL (including ?code= & realmId=)
            const authResponse = await this.oauthClient.createToken(reqUrl);
            this.tokenSet = authResponse.getJson();
            this.realmId = this.oauthClient.getToken().realmId;
            
            console.log('Token exchange successful');
            console.log('Realm ID:', this.realmId);
            
            return {
                accessToken: this.tokenSet.access_token,
                refreshToken: this.tokenSet.refresh_token,
                realmId: this.realmId,
                expiresIn: this.tokenSet.expires_in,
                tokenType: this.tokenSet.token_type
            };
        } catch (error) {
            console.error('Token exchange error:', error);
            throw new Error(`Token exchange failed: ${error.message}`);
        }
    }

    /**
     * Initialize QuickBooks client with tokens
     * @param {string} accessToken - Access token
     * @param {string} refreshToken - Refresh token
     * @param {string} companyId - Company ID
     */
    initializeClient(accessToken, refreshToken, companyId) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.companyId = companyId;
        this.realmId = companyId;

        // Update token set
        this.tokenSet = {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
            token_type: 'Bearer'
        };

        // Update OAuth client with tokens
        this.oauthClient.setToken(this.tokenSet);

        console.log('QuickBooks client initialized with company ID:', companyId);

        // Also save to database for multi-worker sharing
        this.saveTokensToDatabase(accessToken, refreshToken, companyId).catch(err => {
            console.error('[QuickBooks] Failed to save tokens to database:', err.message);
        });
    }

    /**
     * Save tokens to database for multi-worker support
     */
    async saveTokensToDatabase(accessToken, refreshToken, companyId) {
        if (!QuickBooksToken) {
            console.log('[QuickBooks] Database model not available, skipping DB save');
            return;
        }

        try {
            const [token, created] = await QuickBooksToken.upsert({
                companyId: companyId,
                accessToken: accessToken,
                refreshToken: refreshToken,
                tokenExpiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
                isActive: true
            }, {
                returning: true
            });
            console.log(`[QuickBooks] Tokens ${created ? 'created' : 'updated'} in database for company ${companyId}`);
        } catch (error) {
            console.error('[QuickBooks] Database save error:', error.message);
            throw error;
        }
    }

    /**
     * Load tokens from database (for multi-worker support)
     * Called before each API request to ensure we have the latest tokens
     */
    async loadTokensFromDatabase() {
        if (!QuickBooksToken) {
            return false;
        }

        try {
            const token = await QuickBooksToken.findOne({
                where: { isActive: true },
                order: [['updated_at', 'DESC']]
            });

            if (token) {
                // Only update if tokens are different (avoid unnecessary reinit)
                if (this.accessToken !== token.accessToken ||
                    this.refreshToken !== token.refreshToken ||
                    this.companyId !== token.companyId) {

                    console.log('[QuickBooks] Loading tokens from database for company:', token.companyId);
                    this.accessToken = token.accessToken;
                    this.refreshToken = token.refreshToken;
                    this.companyId = token.companyId;
                    this.realmId = token.companyId;

                    // Calculate actual seconds until expiry from DB timestamp
                    const expiresAt = token.tokenExpiresAt ? new Date(token.tokenExpiresAt) : null;
                    const now = new Date();
                    const expiresInSeconds = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;

                    console.log(`[QuickBooks] Token expires in ${expiresInSeconds} seconds (at ${expiresAt})`);

                    this.tokenSet = {
                        access_token: token.accessToken,
                        refresh_token: token.refreshToken,
                        expires_in: expiresInSeconds, // Use actual expiry, not hardcoded!
                        token_type: 'Bearer',
                        createdAt: now.getTime() // Track when we loaded it
                    };

                    this.oauthClient.setToken(this.tokenSet);
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('[QuickBooks] Database load error:', error.message);
            return false;
        }
    }

    /**
     * Helper: ensure valid access token (refresh if needed) - bulletproof version
     */
    async ensureFreshToken() {
        // First, try to load latest tokens from database (multi-worker support)
        await this.loadTokensFromDatabase();

        if (!this.tokenSet) {
            throw new Error('QuickBooks not connected. Please connect in Settings.');
        }

        if (!this.tokenSet.refresh_token) {
            throw new Error('QuickBooks refresh token missing. Please reconnect in Settings.');
        }

        // Check if token is valid AND has more than 5 minutes remaining (proactive refresh)
        const token = this.oauthClient.getToken();
        const isValid = this.oauthClient.isAccessTokenValid();
        const expiresIn = this.tokenSet.expires_in || 0;
        const needsProactiveRefresh = expiresIn < 300; // Less than 5 minutes

        if (isValid && !needsProactiveRefresh) {
            console.log(`[QuickBooks] Token valid, expires in ${expiresIn}s`);
            return token.access_token;
        }

        // Token expired or expiring soon - refresh it
        const reason = !isValid ? 'expired' : 'expiring soon';
        console.log(`[QuickBooks] Token ${reason}, refreshing...`);

        return await this._refreshTokenWithRetry();
    }

    /**
     * Refresh token with retry logic for transient failures
     */
    async _refreshTokenWithRetry(retries = 2) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`[QuickBooks] Refresh attempt ${attempt}/${retries}`);
                const refreshResponse = await this.oauthClient.refresh();
                this.tokenSet = refreshResponse.getJson();
                this.accessToken = this.tokenSet.access_token;
                this.refreshToken = this.tokenSet.refresh_token;

                console.log('[QuickBooks] Token refreshed successfully');

                // Save refreshed tokens to database for other workers
                await this.saveTokensToDatabase(this.accessToken, this.refreshToken, this.companyId).catch(err => {
                    console.error('[QuickBooks] Failed to save refreshed tokens:', err.message);
                });

                return this.tokenSet.access_token;
            } catch (refreshError) {
                const errorMsg = refreshError.message || '';
                console.error(`[QuickBooks] Refresh attempt ${attempt} failed:`, errorMsg);

                // Check for specific error types
                if (errorMsg.includes('invalid_grant') || errorMsg.includes('Token has been revoked')) {
                    // Refresh token expired (100 days) or revoked - must reconnect
                    throw new Error('QuickBooks authorization expired (100+ days inactive). Please reconnect in Settings.');
                }

                if (attempt === retries) {
                    // All retries failed
                    if (errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED')) {
                        throw new Error('Cannot reach QuickBooks servers. Please check your internet connection.');
                    }
                    throw new Error('QuickBooks token refresh failed. Please reconnect in Settings.');
                }

                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
        }
    }

    /**
     * Get transactions from QuickBooks - using node-quickbooks like working example
     * @param {Object} params - Query parameters
     * @returns {Promise<Array>} Array of transactions
     */
    async getTransactions(params = {}) {
        try {
            const accessToken = await this.ensureFreshToken();
            if (!this.realmId) throw new Error('Missing realmId from OAuth callback.');

            return new Promise((resolve, reject) => {
                // node-quickbooks (OAuth 2.0) - exactly like working example
                const qbo = new QuickBooks(
                    this.clientId,                    // clientId
                    this.clientSecret,                // clientSecret
                    accessToken,                      // accessToken
                    false,                           // no oauthTokenSecret (OAuth 1.0 only)
                    this.realmId,                    // company ID
                    this.useSandbox,                 // useSandbox - controlled centrally
                    false,                           // debug
                    65,                              // minor version (adjust as needed)
                    '2.0',                           // OAuth version
                    this.tokenSet.refresh_token      // refresh token
                );

                // Simple query for purchases (transactions)
                qbo.findPurchases({ limit: 20 }, (err, data) => {
                    if (err) {
                        console.error('QBO API error:', err);
                        reject(new Error(`QBO API error: ${err.message || err}`));
                        return;
                    }
                    
                    const purchases = data.QueryResponse?.Purchase || [];
                    
                    // Transform to our format
                    const transactions = purchases.map(purchase => ({
                        Id: purchase.Id,
                        TxnDate: purchase.TxnDate,
                        Description: purchase.PaymentMethodRef?.name || 'Purchase',
                        Amount: purchase.TotalAmt,
                        AccountRef: purchase.AccountRef,
                        Type: 'Purchase'
                    }));
                    
                    resolve(transactions);
                });
            });
        } catch (error) {
            console.error('Transaction fetch error:', error);
            throw new Error(`Failed to fetch transactions: ${error.message}`);
        }
    }

    /**
     * Get accounts from QuickBooks - using node-quickbooks like working example
     * @returns {Promise<Array>} Array of accounts
     */
    async getAccounts() {
        try {
            const accessToken = await this.ensureFreshToken();
            if (!this.realmId) throw new Error('Missing realmId from OAuth callback.');

            return new Promise((resolve, reject) => {
                // node-quickbooks (OAuth 2.0)
                const qbo = new QuickBooks(
                    this.clientId,
                    this.clientSecret,
                    accessToken,
                    false,
                    this.realmId,
                    this.useSandbox, // controlled centrally
                    false,
                    65,
                    '2.0',
                    this.tokenSet.refresh_token
                );

                qbo.findAccounts({ limit: 50 }, (err, data) => {
                    if (err) {
                        console.error('QBO API error:', err);
                        reject(new Error(`QBO API error: ${err.message || err}`));
                        return;
                    }
                    
                    const accounts = data.QueryResponse?.Account || [];
                    
                    // Transform to our format
                    const accountList = accounts.map(account => ({
                        Id: account.Id,
                        Name: account.Name,
                        AccountType: account.AccountType,
                        AccountSubType: account.AccountSubType,
                        CurrentBalance: account.CurrentBalance
                    }));
                    
                    resolve(accountList);
                });
            });
        } catch (error) {
            console.error('Accounts fetch error:', error);
            throw new Error(`Failed to fetch accounts: ${error.message}`);
        }
    }

    /**
     * Get customers from QuickBooks - like working example
     * @returns {Promise<Array>} Array of customers
     */
    async getCustomers() {
        try {
            const accessToken = await this.ensureFreshToken();
            if (!this.realmId) throw new Error('Missing realmId from OAuth callback.');

            return new Promise((resolve, reject) => {
                const qbo = new QuickBooks(
                    this.clientId,
                    this.clientSecret,
                    accessToken,
                    false,
                    this.realmId,
                    this.useSandbox, // controlled centrally
                    false,
                    65,
                    '2.0',
                    this.tokenSet.refresh_token
                );

                qbo.findCustomers({ limit: 10 }, (err, data) => {
                    if (err) {
                        console.error('QBO API error:', err);
                        reject(new Error(`QBO API error: ${err.message || err}`));
                        return;
                    }
                    
                    resolve(data);
                });
            });
        } catch (error) {
            console.error('Customers fetch error:', error);
            throw new Error(`Failed to fetch customers: ${error.message}`);
        }
    }

    /**
     * Get departments - return defaults for now
     * @returns {Promise<Array>} Array of departments
     */
    async getDepartments() {
        // Return default departments
        return this.defaultDepartments.map((name, index) => ({
            Id: `default_${index}`,
            Name: name,
            Active: true,
            IsDefault: true
        }));
    }

    /**
     * Get company information
     * @returns {Promise<Object>} Company info
     */
    async getCompanyInfo() {
        try {
            const accessToken = await this.ensureFreshToken();
            if (!this.realmId) throw new Error('Missing realmId from OAuth callback.');

            return new Promise((resolve, reject) => {
                const qbo = new QuickBooks(
                    this.clientId,
                    this.clientSecret,
                    accessToken,
                    false,
                    this.realmId,
                    this.useSandbox, // controlled centrally
                    false,
                    65,
                    '2.0',
                    this.tokenSet.refresh_token
                );

                qbo.getCompanyInfo(this.realmId, (err, data) => {
                    if (err) {
                        console.error('QBO API error:', err);
                        reject(new Error(`QBO API error: ${err.message || err}`));
                        return;
                    }
                    
                    resolve(data?.QueryResponse?.CompanyInfo?.[0] || {});
                });
            });
        } catch (error) {
            console.error('Company info fetch error:', error);
            throw new Error(`Failed to fetch company info: ${error.message}`);
        }
    }

    /**
     * Check if QuickBooks is connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return !!(this.tokenSet && this.realmId);
    }

    /**
     * Check if QuickBooks is connected (async version that checks database)
     * @returns {Promise<boolean>} Connection status
     */
    async isConnectedAsync() {
        // First check memory
        if (this.tokenSet && this.realmId) {
            return true;
        }
        // Then check database
        const loaded = await this.loadTokensFromDatabase();
        return loaded && !!(this.tokenSet && this.realmId);
    }

    /**
     * Get OAuth client for advanced operations
     * @returns {OAuthClient} OAuth client instance
     */
    getOAuthClient() {
        return this.oauthClient;
    }

    /**
     * Helper method to create a configured QuickBooks client instance
     * @returns {Promise<QuickBooks>} Configured QBO client
     */
    async _getQboClient(forceRefresh = false) {
        if (forceRefresh) {
            console.log('[QuickBooks] Force refreshing token before API call');
            await this._refreshTokenWithRetry();
        } else {
            await this.ensureFreshToken();
        }

        if (!this.realmId) throw new Error('Missing realmId from OAuth callback.');

        return new QuickBooks(
            this.clientId,
            this.clientSecret,
            this.tokenSet.access_token,
            false,
            this.realmId,
            this.useSandbox,
            false,
            65,
            '2.0',
            this.tokenSet.refresh_token
        );
    }

    /**
     * Check if error is an auth/token error that should trigger retry
     */
    _isAuthError(err) {
        if (!err) return false;
        const msg = (err.message || JSON.stringify(err)).toLowerCase();
        return msg.includes('401') ||
               msg.includes('403') ||
               msg.includes('unauthorized') ||
               msg.includes('token') ||
               msg.includes('authentication') ||
               msg.includes('authenticationfailed') ||
               msg.includes('expired');
    }

    /**
     * Get Profit and Loss report from QuickBooks (with auth retry)
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} P&L report data
     */
    async getProfitAndLoss(startDate, endDate) {
        // Try up to 2 times - first with current token, then with forced refresh
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const forceRefresh = attempt > 1;
                const qbo = await this._getQboClient(forceRefresh);

                const result = await new Promise((resolve, reject) => {
                    qbo.reportProfitAndLoss({
                        start_date: startDate,
                        end_date: endDate,
                        accounting_method: 'Accrual'
                    }, (err, data) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(data);
                    });
                });

                return result;
            } catch (err) {
                console.error(`[QuickBooks] P&L attempt ${attempt} failed:`, err.message || err);

                // If auth error and first attempt, retry with force refresh
                if (attempt === 1 && this._isAuthError(err)) {
                    console.log('[QuickBooks] Auth error detected, will retry with fresh token');
                    continue;
                }

                // Final attempt failed or non-auth error
                throw new Error(`Failed to fetch P&L report: ${err.message || JSON.stringify(err)}`);
            }
        }
    }

    /**
     * Get transactions for a specific account
     * @param {string} accountId - QuickBooks account ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of transactions
     */
    async getTransactionsByAccount(accountId, startDate, endDate) {
        try {
            const qbo = await this._getQboClient();

            return new Promise((resolve, reject) => {
                qbo.reportTransactionList({
                    start_date: startDate,
                    end_date: endDate,
                    account: accountId
                }, (err, data) => {
                    if (err) {
                        console.error('QBO Transaction List error:', err);
                        reject(new Error(`QBO API error: ${err.message || JSON.stringify(err)}`));
                        return;
                    }

                    // Parse the transaction list report into structured data
                    const transactions = this._parseTransactionListReport(data);
                    resolve(transactions);
                });
            });
        } catch (error) {
            console.error('Transactions by account fetch error:', error);
            throw new Error(`Failed to fetch transactions by account: ${error.message}`);
        }
    }

    /**
     * Get all transactions in a date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of transactions
     */
    async getTransactionsByDateRange(startDate, endDate) {
        try {
            const qbo = await this._getQboClient();

            return new Promise((resolve, reject) => {
                qbo.reportTransactionList({
                    start_date: startDate,
                    end_date: endDate
                }, (err, data) => {
                    if (err) {
                        console.error('QBO Transaction List error:', err);
                        reject(new Error(`QBO API error: ${err.message || JSON.stringify(err)}`));
                        return;
                    }

                    const transactions = this._parseTransactionListReport(data);
                    resolve(transactions);
                });
            });
        } catch (error) {
            console.error('Transactions by date range fetch error:', error);
            throw new Error(`Failed to fetch transactions by date range: ${error.message}`);
        }
    }

    /**
     * Get all expense transactions (Purchases, Bills) for a date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of expense transactions
     */
    async getAllExpenses(startDate, endDate) {
        try {
            const qbo = await this._getQboClient();

            // Fetch both Purchases and Bills in parallel
            const [purchases, bills] = await Promise.all([
                this._fetchPurchases(qbo, startDate, endDate),
                this._fetchBills(qbo, startDate, endDate)
            ]);

            // Combine and normalize expense transactions
            const expenses = [
                ...purchases.map(p => this._normalizePurchase(p)),
                ...bills.map(b => this._normalizeBill(b))
            ];

            // Sort by date descending
            expenses.sort((a, b) => new Date(b.TxnDate) - new Date(a.TxnDate));

            return expenses;
        } catch (error) {
            console.error('All expenses fetch error:', error);
            throw new Error(`Failed to fetch all expenses: ${error.message}`);
        }
    }

    /**
     * Get all income transactions for a date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of income transactions
     */
    async getAllIncome(startDate, endDate) {
        try {
            const qbo = await this._getQboClient();

            // Fetch Invoices, Sales Receipts, and Payments in parallel
            const [invoices, salesReceipts, payments] = await Promise.all([
                this._fetchInvoices(qbo, startDate, endDate),
                this._fetchSalesReceipts(qbo, startDate, endDate),
                this._fetchPayments(qbo, startDate, endDate)
            ]);

            // Combine and normalize income transactions
            const income = [
                ...invoices.map(i => this._normalizeInvoice(i)),
                ...salesReceipts.map(sr => this._normalizeSalesReceipt(sr)),
                ...payments.map(p => this._normalizePayment(p))
            ];

            // Sort by date descending
            income.sort((a, b) => new Date(b.TxnDate) - new Date(a.TxnDate));

            return income;
        } catch (error) {
            console.error('All income fetch error:', error);
            throw new Error(`Failed to fetch all income: ${error.message}`);
        }
    }

    /**
     * Helper: Fetch purchases within date range
     */
    _fetchPurchases(qbo, startDate, endDate) {
        return new Promise((resolve) => {
            // Fetch all purchases then filter by date client-side
            qbo.findPurchases({ limit: 1000 }, (err, data) => {
                if (err) {
                    console.error('QBO Purchases query error:', err);
                    resolve([]);
                    return;
                }
                const purchases = data.QueryResponse?.Purchase || [];
                const filtered = purchases.filter(p => {
                    const txnDate = p.TxnDate;
                    return txnDate >= startDate && txnDate <= endDate;
                });
                resolve(filtered);
            });
        });
    }

    /**
     * Helper: Fetch bills within date range
     */
    _fetchBills(qbo, startDate, endDate) {
        return new Promise((resolve) => {
            qbo.findBills({ limit: 1000 }, (err, data) => {
                if (err) {
                    console.error('QBO Bills query error:', err);
                    resolve([]);
                    return;
                }
                const bills = data.QueryResponse?.Bill || [];
                const filtered = bills.filter(b => {
                    const txnDate = b.TxnDate;
                    return txnDate >= startDate && txnDate <= endDate;
                });
                resolve(filtered);
            });
        });
    }

    /**
     * Helper: Fetch invoices within date range
     */
    _fetchInvoices(qbo, startDate, endDate) {
        return new Promise((resolve) => {
            qbo.findInvoices({ limit: 1000 }, (err, data) => {
                if (err) {
                    console.error('QBO Invoices query error:', err);
                    resolve([]);
                    return;
                }
                const invoices = data.QueryResponse?.Invoice || [];
                const filtered = invoices.filter(i => {
                    const txnDate = i.TxnDate;
                    return txnDate >= startDate && txnDate <= endDate;
                });
                resolve(filtered);
            });
        });
    }

    /**
     * Helper: Fetch sales receipts within date range
     */
    _fetchSalesReceipts(qbo, startDate, endDate) {
        return new Promise((resolve) => {
            qbo.findSalesReceipts({ limit: 1000 }, (err, data) => {
                if (err) {
                    console.error('QBO SalesReceipts query error:', err);
                    resolve([]);
                    return;
                }
                const receipts = data.QueryResponse?.SalesReceipt || [];
                const filtered = receipts.filter(r => {
                    const txnDate = r.TxnDate;
                    return txnDate >= startDate && txnDate <= endDate;
                });
                resolve(filtered);
            });
        });
    }

    /**
     * Helper: Fetch payments within date range
     */
    _fetchPayments(qbo, startDate, endDate) {
        return new Promise((resolve) => {
            qbo.findPayments({ limit: 1000 }, (err, data) => {
                if (err) {
                    console.error('QBO Payments query error:', err);
                    resolve([]);
                    return;
                }
                const payments = data.QueryResponse?.Payment || [];
                const filtered = payments.filter(p => {
                    const txnDate = p.TxnDate;
                    return txnDate >= startDate && txnDate <= endDate;
                });
                resolve(filtered);
            });
        });
    }

    /**
     * Helper: Normalize a Purchase transaction to common format
     */
    _normalizePurchase(purchase) {
        return {
            Id: purchase.Id,
            Type: 'Purchase',
            SubType: purchase.PaymentType || 'Cash',
            TxnDate: purchase.TxnDate,
            Amount: purchase.TotalAmt || 0,
            Description: purchase.PrivateNote || this._getLineDescription(purchase.Line),
            AccountRef: purchase.AccountRef,
            AccountName: purchase.AccountRef?.name || null,
            VendorRef: purchase.EntityRef,
            VendorName: purchase.EntityRef?.name || null,
            CategoryRef: this._getCategoryFromLines(purchase.Line),
            CategoryName: this._getCategoryNameFromLines(purchase.Line),
            DocNumber: purchase.DocNumber || null,
            Line: purchase.Line || [],
            raw: purchase
        };
    }

    /**
     * Helper: Normalize a Bill transaction to common format
     */
    _normalizeBill(bill) {
        // For Bills, account is in line items (AccountBasedExpenseLineDetail)
        const categoryRef = this._getCategoryFromLines(bill.Line);
        const categoryName = this._getCategoryNameFromLines(bill.Line);

        return {
            Id: bill.Id,
            Type: 'Bill',
            SubType: null,
            TxnDate: bill.TxnDate,
            DueDate: bill.DueDate,
            Amount: bill.TotalAmt || 0,
            Balance: bill.Balance || 0,
            Description: bill.PrivateNote || this._getLineDescription(bill.Line),
            AccountRef: categoryRef,
            AccountName: categoryName, // Use category from line items as account
            VendorRef: bill.VendorRef,
            VendorName: bill.VendorRef?.name || null,
            CategoryRef: categoryRef,
            CategoryName: categoryName,
            DocNumber: bill.DocNumber || null,
            Line: bill.Line || [],
            raw: bill
        };
    }

    /**
     * Helper: Normalize an Invoice to common format
     */
    _normalizeInvoice(invoice) {
        // For Invoices, account comes from line items (SalesItemLineDetail or ItemRef)
        const categoryRef = this._getCategoryFromLines(invoice.Line);
        const categoryName = this._getCategoryNameFromLines(invoice.Line);

        return {
            Id: invoice.Id,
            Type: 'Invoice',
            SubType: null,
            TxnDate: invoice.TxnDate,
            DueDate: invoice.DueDate,
            Amount: invoice.TotalAmt || 0,
            Balance: invoice.Balance || 0,
            Description: invoice.PrivateNote || this._getLineDescription(invoice.Line),
            CustomerRef: invoice.CustomerRef,
            CustomerName: invoice.CustomerRef?.name || null,
            AccountRef: categoryRef,
            AccountName: categoryName, // Income account from line items
            CategoryRef: categoryRef,
            CategoryName: categoryName,
            DocNumber: invoice.DocNumber || null,
            Line: invoice.Line || [],
            raw: invoice
        };
    }

    /**
     * Helper: Normalize a SalesReceipt to common format
     */
    _normalizeSalesReceipt(salesReceipt) {
        // For SalesReceipts, use DepositToAccount or line items
        const categoryRef = this._getCategoryFromLines(salesReceipt.Line);
        const categoryName = this._getCategoryNameFromLines(salesReceipt.Line);
        const depositAccountName = salesReceipt.DepositToAccountRef?.name || null;

        return {
            Id: salesReceipt.Id,
            Type: 'SalesReceipt',
            SubType: null,
            TxnDate: salesReceipt.TxnDate,
            Amount: salesReceipt.TotalAmt || 0,
            Description: salesReceipt.PrivateNote || this._getLineDescription(salesReceipt.Line),
            CustomerRef: salesReceipt.CustomerRef,
            CustomerName: salesReceipt.CustomerRef?.name || null,
            DepositToAccountRef: salesReceipt.DepositToAccountRef,
            AccountRef: salesReceipt.DepositToAccountRef || categoryRef,
            AccountName: depositAccountName || categoryName, // Use deposit account or category from lines
            CategoryRef: categoryRef,
            CategoryName: categoryName,
            DocNumber: salesReceipt.DocNumber || null,
            Line: salesReceipt.Line || [],
            raw: salesReceipt
        };
    }

    /**
     * Helper: Normalize a Payment to common format
     */
    _normalizePayment(payment) {
        return {
            Id: payment.Id,
            Type: 'Payment',
            SubType: null,
            TxnDate: payment.TxnDate,
            Amount: payment.TotalAmt || 0,
            UnappliedAmt: payment.UnappliedAmt || 0,
            Description: payment.PrivateNote || 'Payment received',
            CustomerRef: payment.CustomerRef,
            CustomerName: payment.CustomerRef?.name || null,
            DepositToAccountRef: payment.DepositToAccountRef,
            PaymentMethodRef: payment.PaymentMethodRef,
            DocNumber: null,
            Line: payment.Line || [],
            raw: payment
        };
    }

    /**
     * Helper: Get description from line items
     */
    _getLineDescription(lines) {
        if (!lines || !Array.isArray(lines)) return null;

        for (const line of lines) {
            if (line.Description) return line.Description;
            if (line.AccountBasedExpenseLineDetail?.AccountRef?.name) {
                return line.AccountBasedExpenseLineDetail.AccountRef.name;
            }
            if (line.ItemBasedExpenseLineDetail?.ItemRef?.name) {
                return line.ItemBasedExpenseLineDetail.ItemRef.name;
            }
            if (line.SalesItemLineDetail?.ItemRef?.name) {
                return line.SalesItemLineDetail.ItemRef.name;
            }
        }
        return null;
    }

    /**
     * Helper: Get category reference from line items
     */
    _getCategoryFromLines(lines) {
        if (!lines || !Array.isArray(lines)) return null;

        for (const line of lines) {
            if (line.AccountBasedExpenseLineDetail?.AccountRef) {
                return line.AccountBasedExpenseLineDetail.AccountRef;
            }
            if (line.AccountBasedExpenseLineDetail?.ClassRef) {
                return line.AccountBasedExpenseLineDetail.ClassRef;
            }
        }
        return null;
    }

    /**
     * Helper: Get category name from line items
     */
    _getCategoryNameFromLines(lines) {
        const categoryRef = this._getCategoryFromLines(lines);
        return categoryRef?.name || null;
    }

    /**
     * Helper: Parse transaction list report into structured data
     */
    _parseTransactionListReport(reportData) {
        const transactions = [];

        if (!reportData || !reportData.Rows || !reportData.Rows.Row) {
            return transactions;
        }

        // Get column definitions
        const columns = reportData.Columns?.Column || [];
        const columnNames = columns.map(c => c.ColTitle || c.ColType);

        // Parse rows
        const parseRows = (rows) => {
            if (!rows) return;

            for (const row of rows) {
                if (row.type === 'Data' && row.ColData) {
                    const transaction = {};
                    row.ColData.forEach((col, index) => {
                        const colName = columnNames[index] || `col_${index}`;
                        transaction[colName] = col.value;
                        if (col.id) transaction[`${colName}_id`] = col.id;
                    });
                    transactions.push(transaction);
                }

                // Recurse into nested rows
                if (row.Rows && row.Rows.Row) {
                    parseRows(row.Rows.Row);
                }
            }
        };

        parseRows(reportData.Rows.Row);
        return transactions;
    }

    /**
     * Get General Ledger Detail report grouped by Account - matches P&L categories exactly
     * The General Ledger report shows transactions for each account in the chart of accounts
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {string} sourceAccountType - Optional: filter by account type (Expense, Income, etc.)
     * @returns {Promise<Object>} Transactions grouped by account
     */
    async getTransactionListByAccount(startDate, endDate, sourceAccountType = null) {
        // Try up to 2 times - first with current token, then with forced refresh
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const forceRefresh = attempt > 1;
                const qbo = await this._getQboClient(forceRefresh);

                const result = await new Promise((resolve, reject) => {
                    const params = {
                        start_date: startDate,
                        end_date: endDate,
                        accounting_method: 'Accrual',
                        minorversion: 65
                    };

                    // Filter by account type if specified
                    if (sourceAccountType) {
                        params.source_account_type = sourceAccountType;
                    }

                    console.log('[QuickBooks] Fetching GeneralLedger report with params:', params);

                    // Use General Ledger Detail report - this shows transactions by account
                    qbo.reportGeneralLedgerDetail(params, (err, data) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(data);
                    });
                });

                // Parse the report into structured data grouped by account
                const parsed = this._parseTransactionListByAccount(result);
                return parsed;
            } catch (err) {
                console.error(`[QuickBooks] GeneralLedger attempt ${attempt} failed:`, err.message || err);

                // If auth error and first attempt, retry with force refresh
                if (attempt === 1 && this._isAuthError(err)) {
                    console.log('[QuickBooks] Auth error detected, will retry with fresh token');
                    continue;
                }

                // Final attempt failed or non-auth error
                throw new Error(`Failed to fetch GeneralLedger report: ${err.message || JSON.stringify(err)}`);
            }
        }
    }

    /**
     * Parse TransactionList report grouped by Account into structured data
     * @param {Object} reportData - Raw report from QuickBooks
     * @returns {Object} { accounts: [...], transactions: [...], totals: {...} }
     */
    _parseTransactionListByAccount(reportData) {
        const result = {
            accounts: [],
            transactions: [],
            totals: {
                totalAmount: 0,
                transactionCount: 0
            },
            raw: reportData
        };

        if (!reportData || !reportData.Rows || !reportData.Rows.Row) {
            return result;
        }

        // Get column definitions
        const columns = reportData.Columns?.Column || [];
        const columnNames = columns.map(c => c.ColTitle || c.ColType);
        console.log('[QuickBooks] TransactionList columns:', columnNames);

        // Parse rows - grouped by Account means we have Section rows with account names
        const parseSection = (section, accountName = null) => {
            // Get account name from Header if this is a section
            if (section.Header && section.Header.ColData) {
                const headerName = section.Header.ColData[0]?.value;
                if (headerName) {
                    accountName = headerName;
                }
            }

            // Get summary total from Summary
            let sectionTotal = 0;
            if (section.Summary && section.Summary.ColData) {
                // Find the amount column (usually 'Amount' or 'subt_nat_amount')
                section.Summary.ColData.forEach((col, index) => {
                    const val = parseFloat(col.value);
                    if (!isNaN(val) && columnNames[index]?.toLowerCase().includes('amount')) {
                        sectionTotal = val;
                    }
                });
            }

            // Parse transaction rows within this section
            const sectionTransactions = [];
            if (section.Rows && section.Rows.Row) {
                for (const row of section.Rows.Row) {
                    // If this is a nested section (sub-account), recurse
                    if (row.type === 'Section') {
                        const nestedResult = parseSection(row, accountName);
                        sectionTransactions.push(...nestedResult.transactions);
                        continue;
                    }

                    // Data row - actual transaction
                    if (row.type === 'Data' && row.ColData) {
                        const transaction = {
                            account: accountName
                        };
                        row.ColData.forEach((col, index) => {
                            const colName = columnNames[index] || `col_${index}`;
                            // Map common column names to standard fields
                            const fieldMap = {
                                'Date': 'date',
                                'tx_date': 'date',
                                'Transaction Type': 'type',
                                'txn_type': 'type',
                                'Num': 'docNumber',
                                'doc_num': 'docNumber',
                                'Name': 'name',
                                'name': 'name',
                                'Account': 'account',
                                'account_name': 'account',
                                'Amount': 'amount',
                                'subt_nat_amount': 'amount',
                                'Debit': 'debit',
                                'debt_amt': 'debit',
                                'Credit': 'credit',
                                'credit_amt': 'credit',
                                'Open Balance': 'openBalance',
                                'nat_open_bal': 'openBalance',
                                'Memo': 'memo',
                                'memo': 'memo'
                            };
                            const fieldName = fieldMap[colName] || colName;
                            transaction[fieldName] = col.value;
                            if (col.id) transaction[`${fieldName}_id`] = col.id;
                        });

                        // Ensure account is set from section header if not in row
                        if (!transaction.account && accountName) {
                            transaction.account = accountName;
                        }

                        // Parse amount as number
                        if (transaction.amount) {
                            transaction.amount = parseFloat(transaction.amount) || 0;
                        }
                        if (transaction.debit) {
                            transaction.debit = parseFloat(transaction.debit) || 0;
                        }
                        if (transaction.credit) {
                            transaction.credit = parseFloat(transaction.credit) || 0;
                        }

                        sectionTransactions.push(transaction);
                    }
                }
            }

            return {
                accountName,
                total: sectionTotal,
                transactions: sectionTransactions
            };
        };

        // Process top-level rows (each is typically an account section)
        for (const row of reportData.Rows.Row) {
            if (row.type === 'Section') {
                const sectionResult = parseSection(row);
                if (sectionResult.accountName) {
                    result.accounts.push({
                        name: sectionResult.accountName,
                        total: sectionResult.total,
                        transactionCount: sectionResult.transactions.length
                    });
                }
                result.transactions.push(...sectionResult.transactions);
                result.totals.totalAmount += Math.abs(sectionResult.total);
                result.totals.transactionCount += sectionResult.transactions.length;
            } else if (row.type === 'Data') {
                // Top-level data row without section
                const transaction = {};
                row.ColData.forEach((col, index) => {
                    const colName = columnNames[index] || `col_${index}`;
                    transaction[colName] = col.value;
                });
                result.transactions.push(transaction);
                result.totals.transactionCount++;
            }
        }

        console.log(`[QuickBooks] Parsed ${result.accounts.length} accounts with ${result.transactions.length} transactions`);
        return result;
    }

    /**
     * Get transactions for multiple account names (for category drill-down)
     * Used when a P&L category maps to multiple original QB accounts
     * @param {string[]} accountNames - Array of account names to search for
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Combined transactions from all matching accounts
     */
    async getTransactionsForAccounts(accountNames, startDate, endDate) {
        const allData = await this.getTransactionListByAccount(startDate, endDate);

        // Helper to check if a value matches any of the target accounts
        const matchesAnyAccount = (value) => {
            if (!value) return false;
            const valueLower = value.toLowerCase();
            return accountNames.some(accountName => {
                const accountNameLower = accountName.toLowerCase();
                return valueLower === accountNameLower ||
                       valueLower.startsWith(accountNameLower + ':') ||
                       valueLower.startsWith(accountNameLower + ' ') ||
                       accountNameLower.startsWith(valueLower + ':') ||
                       valueLower.includes(accountNameLower) ||
                       accountNameLower.includes(valueLower);
            });
        };

        // Filter transactions - check both account field and Split field
        const transactions = allData.transactions.filter(t => {
            if (matchesAnyAccount(t.account)) return true;
            if (matchesAnyAccount(t.Split) || matchesAnyAccount(t['Split'])) return true;
            return false;
        });

        // Deduplicate by transaction ID
        const seenIds = new Set();
        const mappedTransactions = [];

        // First pass: collect transactions where the account directly matches
        for (const t of transactions) {
            if (matchesAnyAccount(t.account)) {
                const txnId = t.type_id || `${t.date}-${t.name}-${t.amount}`;
                if (!seenIds.has(txnId)) {
                    seenIds.add(txnId);
                    mappedTransactions.push({
                        ...t,
                        matchedAccount: t.account,
                        amount: Math.abs(t.amount || 0)
                    });
                }
            }
        }

        // Second pass: collect transactions where Split matches
        for (const t of transactions) {
            if (matchesAnyAccount(t.Split || t['Split']) && !matchesAnyAccount(t.account)) {
                const txnId = t.type_id || `${t.date}-${t.name}-${t.amount}`;
                if (!seenIds.has(txnId)) {
                    seenIds.add(txnId);
                    mappedTransactions.push({
                        ...t,
                        matchedAccount: t.Split || t['Split'],
                        account: t.Split || t['Split'],
                        amount: Math.abs(t.amount || 0)
                    });
                }
            }
        }

        // Sum totals from matching accounts
        let total = 0;
        const matchingAccounts = allData.accounts.filter(a => matchesAnyAccount(a.name));
        matchingAccounts.forEach(a => total += Math.abs(a.total || 0));

        if (matchingAccounts.length === 0) {
            total = mappedTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
        }

        console.log(`[QuickBooks] Found ${mappedTransactions.length} transactions for ${accountNames.length} accounts (${accountNames.join(', ')})`);

        return {
            searchedAccounts: accountNames,
            matchingAccounts: matchingAccounts.map(a => a.name),
            total,
            transactions: mappedTransactions,
            transactionCount: mappedTransactions.length
        };
    }

    /**
     * Get transactions for a specific account name (matches P&L category)
     * Handles parent/child account relationships (e.g., "Automobile" matches "Automobile:Fuel")
     * Also checks the Split field for bank transactions where expense is the contra account
     * @param {string} accountName - Account name to filter by
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Transactions for this account
     */
    async getTransactionsForAccount(accountName, startDate, endDate) {
        const allData = await this.getTransactionListByAccount(startDate, endDate);

        const accountNameLower = accountName.toLowerCase();

        // Helper to check if a value matches the target account
        const matchesAccount = (value) => {
            if (!value) return false;
            const valueLower = value.toLowerCase();
            return valueLower === accountNameLower ||
                   valueLower.startsWith(accountNameLower + ':') ||
                   valueLower.startsWith(accountNameLower + ' ') ||
                   accountNameLower.startsWith(valueLower + ':') ||
                   valueLower.includes(accountNameLower);
        };

        // Filter transactions - check both account field and Split field
        // In GL report, bank transactions have the expense account in "Split"
        const transactions = allData.transactions.filter(t => {
            // Check primary account
            if (matchesAccount(t.account)) return true;
            // Check Split account (for bank transactions where expense is contra)
            if (matchesAccount(t.Split) || matchesAccount(t['Split'])) return true;
            return false;
        });

        // Map transactions - prefer the expense account view over bank account view
        // Deduplicate by transaction ID (type_id)
        const seenIds = new Set();
        const mappedTransactions = [];

        // First pass: collect transactions where the account directly matches (expense account view)
        for (const t of transactions) {
            if (matchesAccount(t.account)) {
                const txnId = t.type_id || `${t.date}-${t.name}-${t.amount}`;
                if (!seenIds.has(txnId)) {
                    seenIds.add(txnId);
                    mappedTransactions.push({
                        ...t,
                        matchedAccount: t.account,
                        amount: Math.abs(t.amount || 0) // Expense amounts should be positive
                    });
                }
            }
        }

        // Second pass: collect transactions where Split matches (bank account view)
        // but skip if we already have this transaction from the expense view
        for (const t of transactions) {
            if (matchesAccount(t.Split || t['Split']) && !matchesAccount(t.account)) {
                const txnId = t.type_id || `${t.date}-${t.name}-${t.amount}`;
                if (!seenIds.has(txnId)) {
                    seenIds.add(txnId);
                    mappedTransactions.push({
                        ...t,
                        matchedAccount: t.Split || t['Split'],
                        account: t.Split || t['Split'], // Override account to show expense account
                        amount: Math.abs(t.amount || 0) // From bank negative = expense positive
                    });
                }
            }
        }

        // Sum totals from matching accounts (including sub-accounts)
        let total = 0;
        const matchingAccounts = allData.accounts.filter(a => matchesAccount(a.name));
        matchingAccounts.forEach(a => total += Math.abs(a.total || 0));

        // If no matching accounts found by name, calculate from transactions
        if (matchingAccounts.length === 0) {
            total = mappedTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
        }

        console.log(`[QuickBooks] Found ${mappedTransactions.length} transactions for "${accountName}" from ${matchingAccounts.length} matching accounts`);

        return {
            account: accountName,
            matchingAccounts: matchingAccounts.map(a => a.name),
            total,
            transactions: mappedTransactions,
            transactionCount: mappedTransactions.length
        };
    }
}

module.exports = QuickBooksService;