const OAuthClient = require('intuit-oauth');
const QuickBooks = require('node-quickbooks');
const fs = require('fs');
const path = require('path');

class QuickBooksService {
    constructor() {
        this.companyId = process.env.QUICKBOOKS_COMPANY_ID;
        this.accessToken = process.env.QUICKBOOKS_ACCESS_TOKEN;
        this.refreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN;
        this.clientId = process.env.QUICKBOOKS_CLIENT_ID;
        this.clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
        this.redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
        
        // Initialize OAuth client - exactly like working example
        this.oauthClient = new OAuthClient({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            environment: 'production', // Production environment
            redirectUri: this.redirectUri,
        });
        
        // Store tokens like working example
        this.tokenSet = null;
        this.realmId = this.companyId;
        
        // Set tokens if available
        if (this.accessToken && this.refreshToken && this.companyId) {
            this.tokenSet = {
                access_token: this.accessToken,
                refresh_token: this.refreshToken,
                expires_in: 3600,
                token_type: 'Bearer'
            };
            this.oauthClient.setToken(this.tokenSet);
            this.realmId = this.companyId;
        }
        
        console.log(`QuickBooks service initialized for PRODUCTION environment`);
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
    }

    /**
     * Helper: ensure valid access token (refresh if needed) - like working example
     */
    async ensureFreshToken() {
        if (!this.tokenSet) {
            throw new Error('Not connected yet. Complete OAuth flow first.');
        }

        // intuit-oauth tracks expiry for you:
        if (this.oauthClient.isAccessTokenValid()) {
            return this.oauthClient.getToken().access_token;
        }

        // Refresh
        console.log('Refreshing access token...');
        const refreshResponse = await this.oauthClient.refresh();
        this.tokenSet = refreshResponse.getJson();
        return this.oauthClient.getToken().access_token;
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
                    false,                           // useSandbox? false for production
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
                    false, // production
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
                    false, // production
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
                    false, // production
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
     * Get OAuth client for advanced operations
     * @returns {OAuthClient} OAuth client instance
     */
    getOAuthClient() {
        return this.oauthClient;
    }
}

module.exports = QuickBooksService;