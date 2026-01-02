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

        // Token expired - try to refresh
        console.log('Access token expired, refreshing...');
        try {
            const refreshResponse = await this.oauthClient.refresh();
            this.tokenSet = refreshResponse.getJson();
            console.log('Token refreshed successfully');
            return this.oauthClient.getToken().access_token;
        } catch (refreshError) {
            console.error('Token refresh failed:', refreshError.message);
            throw new Error('Token refresh failed. Please reconnect to QuickBooks.');
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
    async _getQboClient() {
        const accessToken = await this.ensureFreshToken();
        if (!this.realmId) throw new Error('Missing realmId from OAuth callback.');

        return new QuickBooks(
            this.clientId,
            this.clientSecret,
            accessToken,
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
     * Get Profit and Loss report from QuickBooks
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} P&L report data
     */
    async getProfitAndLoss(startDate, endDate) {
        try {
            const qbo = await this._getQboClient();

            return new Promise((resolve, reject) => {
                qbo.reportProfitAndLoss({
                    start_date: startDate,
                    end_date: endDate
                }, (err, data) => {
                    if (err) {
                        console.error('QBO P&L Report error:', err);
                        reject(new Error(`QBO API error: ${err.message || JSON.stringify(err)}`));
                        return;
                    }
                    resolve(data);
                });
            });
        } catch (error) {
            console.error('P&L report fetch error:', error);
            throw new Error(`Failed to fetch P&L report: ${error.message}`);
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
        return {
            Id: bill.Id,
            Type: 'Bill',
            SubType: null,
            TxnDate: bill.TxnDate,
            DueDate: bill.DueDate,
            Amount: bill.TotalAmt || 0,
            Balance: bill.Balance || 0,
            Description: bill.PrivateNote || this._getLineDescription(bill.Line),
            AccountRef: null,
            AccountName: null,
            VendorRef: bill.VendorRef,
            VendorName: bill.VendorRef?.name || null,
            CategoryRef: this._getCategoryFromLines(bill.Line),
            CategoryName: this._getCategoryNameFromLines(bill.Line),
            DocNumber: bill.DocNumber || null,
            Line: bill.Line || [],
            raw: bill
        };
    }

    /**
     * Helper: Normalize an Invoice to common format
     */
    _normalizeInvoice(invoice) {
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
            CategoryRef: this._getCategoryFromLines(invoice.Line),
            CategoryName: this._getCategoryNameFromLines(invoice.Line),
            DocNumber: invoice.DocNumber || null,
            Line: invoice.Line || [],
            raw: invoice
        };
    }

    /**
     * Helper: Normalize a SalesReceipt to common format
     */
    _normalizeSalesReceipt(salesReceipt) {
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
            CategoryRef: this._getCategoryFromLines(salesReceipt.Line),
            CategoryName: this._getCategoryNameFromLines(salesReceipt.Line),
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
}

module.exports = QuickBooksService;