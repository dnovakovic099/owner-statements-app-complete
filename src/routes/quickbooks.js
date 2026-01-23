const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const QuickBooksService = require('../services/QuickBooksService');
const FileDataService = require('../services/FileDataService');

const router = express.Router();
const quickBooksService = new QuickBooksService();

/**
 * GET /api/quickbooks/transactions
 * Fetch transactions from QuickBooks
 */
router.get('/transactions', async (req, res) => {
    try {
        const { startDate, endDate, accountType } = req.query;
        
        const transactions = await quickBooksService.getTransactions({
            startDate,
            endDate,
            accountType
        });

        res.json({
            success: true,
            data: transactions,
            count: transactions.length
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'fetchTransactions' });
        
        // If QuickBooks is not configured, return empty array
        if (error.message && error.message.includes('QuickBooks not connected')) {
            res.json({
                success: true,
                data: [],
                count: 0,
                message: 'QuickBooks not connected'
            });
        } else {
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch transactions'
            });
        }
    }
});

/**
 * GET /api/quickbooks/status
 * Quick check if QuickBooks is connected (with auto-refresh)
 */
router.get('/status', async (req, res) => {
    try {
        // This will try to load from DB and refresh token if needed
        const isConnected = await quickBooksService.isConnectedAsync();

        if (isConnected) {
            // Try to verify by refreshing token
            try {
                await quickBooksService.ensureFreshToken();
                res.json({
                    success: true,
                    connected: true,
                    message: 'QuickBooks is connected and ready'
                });
            } catch (refreshError) {
                res.json({
                    success: true,
                    connected: false,
                    message: 'QuickBooks token expired. Please reconnect.',
                    authUrl: '/api/quickbooks/auth-url'
                });
            }
        } else {
            res.json({
                success: true,
                connected: false,
                message: 'QuickBooks not connected',
                authUrl: '/api/quickbooks/auth-url'
            });
        }
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'checkStatus' });
        res.json({
            success: true,
            connected: false,
            message: error.message || 'Unable to check QuickBooks status',
            authUrl: '/api/quickbooks/auth-url'
        });
    }
});

/**
 * GET /api/quickbooks/accounts
 * Fetch accounts from QuickBooks
 */
router.get('/accounts', async (req, res) => {
    try {
        const accounts = await quickBooksService.getAccounts();
        
        res.json({
            success: true,
            data: accounts
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'fetchAccounts' });
        
        // If QuickBooks is not configured, return error (consistent with financials API)
        if (error.message && error.message.includes('QuickBooks access token not configured')) {
            res.status(503).json({
                success: false,
                error: 'QuickBooks not connected',
                message: 'Please connect to QuickBooks in Settings.',
                authUrl: '/api/quickbooks/auth-url'
            });
        } else {
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch accounts'
            });
        }
    }
});

/**
 * GET /api/quickbooks/departments
 * Fetch departments from QuickBooks (with defaults)
 */
router.get('/departments', async (req, res) => {
    try {
        const departments = await quickBooksService.getDepartments();
        
        res.json({
            success: true,
            data: departments
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'fetchDepartments' });
        
        // If QuickBooks is not configured, return default departments
        if (error.message && error.message.includes('QuickBooks access token not configured')) {
            const defaultDepartments = [
                { Name: 'Maintenance', Id: null },
                { Name: 'Cleaning', Id: null },
                { Name: 'Utilities', Id: null },
                { Name: 'Marketing', Id: null },
                { Name: 'Management', Id: null },
                { Name: 'Insurance', Id: null },
                { Name: 'Legal', Id: null },
                { Name: 'Accounting', Id: null },
                { Name: 'Technology', Id: null },
                { Name: 'Other', Id: null }
            ];
            
            res.json({
                success: true,
                data: defaultDepartments,
                message: 'QuickBooks not connected - using default departments'
            });
        } else {
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch departments'
            });
        }
    }
});

/**
 * GET /api/quickbooks/properties
 * Get available properties for categorization with owner mapping
 */
router.get('/properties', async (req, res) => {
    try {
        const [listings, owners] = await Promise.all([
            FileDataService.getListings(),
            FileDataService.getOwners()
        ]);
        
        // Create a map of listing IDs to owner IDs
        const listingToOwnerMap = new Map();
        owners.forEach(owner => {
            if (owner.listingIds && Array.isArray(owner.listingIds)) {
                owner.listingIds.forEach(listingId => {
                    listingToOwnerMap.set(listingId, owner);
                });
            }
        });

        // Transform to match expected format with proper owner mapping
        const properties = listings.map(listing => {
            const owner = listingToOwnerMap.get(listing.id);
            
            // If we found an owner for this listing, use their data
            if (owner) {
                return {
                    id: listing.id,
                    hostawayId: listing.id.toString(),
                    name: listing.name,
                    address: listing.address,
                    ownerId: owner.id,
                    pmPercentage: null,
                    techFeeAmount: 50.00,
                    insuranceFeeAmount: 25.00,
                    isActive: listing.isActive,
                    Owner: {
                        id: owner.id,
                        name: owner.name,
                        email: owner.email,
                        defaultPmPercentage: owner.defaultPmPercentage
                    }
                };
            }
            
            // Fallback to default owner if no owner found for this listing
            const defaultOwner = owners.find(o => o.email === 'owner@example.com') || owners[0];
            return {
                id: listing.id,
                hostawayId: listing.id.toString(),
                name: listing.name,
                address: listing.address,
                ownerId: defaultOwner?.id || 1,
                pmPercentage: null,
                techFeeAmount: 50.00,
                insuranceFeeAmount: 25.00,
                isActive: listing.isActive,
                Owner: {
                    id: defaultOwner?.id || 1,
                    name: defaultOwner?.name || 'Default Owner',
                    email: defaultOwner?.email || 'owner@example.com',
                    defaultPmPercentage: defaultOwner?.defaultPmPercentage || 15
                }
            };
        });
        
        res.json({
            success: true,
            data: properties
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'fetchProperties' });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch properties'
        });
    }
});

/**
 * GET /api/quickbooks/listings
 * Get available listings for categorization
 */
router.get('/listings', async (req, res) => {
    try {
        const listings = await FileDataService.getListings();
        
        res.json({
            success: true,
            data: listings
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'fetchListings' });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch listings'
        });
    }
});

/**
 * PUT /api/quickbooks/transactions/:id/categorize
 * Categorize a transaction with property, listing, and department
 */
router.put('/transactions/:id/categorize', async (req, res) => {
    try {
        const { id } = req.params;
        const { propertyId, listingId, department } = req.body;
        
        if (!propertyId || !department) {
            return res.status(400).json({
                success: false,
                error: 'Property ID and department are required'
            });
        }

        // Update the transaction in QuickBooks
        const updatedTransaction = await quickBooksService.updateTransaction(id, {
            propertyId,
            listingId,
            department
        });

        // Also save the categorization locally for reference
        await saveTransactionCategorization(id, propertyId, listingId, department);

        res.json({
            success: true,
            data: updatedTransaction,
            message: 'Transaction categorized successfully'
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'categorizeTransaction' });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to categorize transaction'
        });
    }
});

/**
 * GET /api/quickbooks/auth-url
 * Get QuickBooks OAuth authorization URL
 */
router.get('/auth-url', async (req, res) => {
    try {
        const authUrl = quickBooksService.getAuthorizationUrl();
        
        res.json({
            success: true,
            authUrl
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'generateAuthUrl' });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate authorization URL'
        });
    }
});

/**
 * POST /api/quickbooks/save-tokens
 * Manually save QuickBooks tokens
 */
router.post('/save-tokens', async (req, res) => {
    try {
        const { companyId, accessToken, refreshToken } = req.body;
        
        if (!companyId || !accessToken || !refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: companyId, accessToken, refreshToken'
            });
        }

        // Read current .env file
        const envPath = path.join(__dirname, '../../.env');
        let envContent = '';
        
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            logger.info('Creating new .env file', { context: 'QuickBooks' });
        }

        // Update or add QuickBooks tokens
        const updates = {
            'QUICKBOOKS_COMPANY_ID': companyId,
            'QUICKBOOKS_ACCESS_TOKEN': accessToken,
            'QUICKBOOKS_REFRESH_TOKEN': refreshToken
        };

        let updatedContent = envContent;
        
        Object.entries(updates).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(updatedContent)) {
                // Update existing
                updatedContent = updatedContent.replace(regex, `${key}=${value}`);
            } else {
                // Add new
                updatedContent += `\n${key}=${value}`;
            }
        });

        // Write back to .env file
        fs.writeFileSync(envPath, updatedContent);

        // Update environment variables in current process
        process.env.QUICKBOOKS_COMPANY_ID = companyId;
        process.env.QUICKBOOKS_ACCESS_TOKEN = accessToken;
        process.env.QUICKBOOKS_REFRESH_TOKEN = refreshToken;

        // Reinitialize the QuickBooks client with new tokens
        quickBooksService.initializeClient(accessToken, refreshToken, companyId);

        // Also save to database for multi-worker support
        try {
            await quickBooksService.saveTokensToDatabase(accessToken, refreshToken, companyId);
            logger.info('QuickBooks tokens saved to database for multi-worker support', { context: 'QuickBooks' });
        } catch (dbErr) {
            logger.logError(dbErr, { context: 'QuickBooks', action: 'saveTokensToDatabase' });
        }

        res.json({
            success: true,
            message: 'Tokens saved and service reinitialized successfully'
        });

    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'saveTokens' });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to save tokens'
        });
    }
});

/**
 * GET /api/quickbooks/auth/callback
 * Handle OAuth callback from QuickBooks - exactly like working example
 */
router.get('/auth/callback', async (req, res) => {
    try {
        logger.info('QuickBooks callback received', { context: 'QuickBooks', url: req.url });
        
        // Pass the full req.url like working example
        const tokens = await quickBooksService.exchangeCodeForTokens(req.url);
        
        // Save tokens to .env file
        const envPath = path.join(__dirname, '../../.env');
        let envContent = '';
        
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            logger.info('Creating new .env file', { context: 'QuickBooks' });
        }

        // Update or add QuickBooks tokens
        const updates = {
            'QUICKBOOKS_COMPANY_ID': tokens.realmId,
            'QUICKBOOKS_ACCESS_TOKEN': tokens.accessToken,
            'QUICKBOOKS_REFRESH_TOKEN': tokens.refreshToken
        };

        let updatedContent = envContent;
        
        Object.entries(updates).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(updatedContent)) {
                // Update existing
                updatedContent = updatedContent.replace(regex, `${key}=${value}`);
            } else {
                // Add new
                updatedContent += `\n${key}=${value}`;
            }
        });

        // Write back to .env file
        fs.writeFileSync(envPath, updatedContent);

        // Update environment variables in current process
        process.env.QUICKBOOKS_COMPANY_ID = tokens.realmId;
        process.env.QUICKBOOKS_ACCESS_TOKEN = tokens.accessToken;
        process.env.QUICKBOOKS_REFRESH_TOKEN = tokens.refreshToken;

        // Initialize the QuickBooks client with new tokens
        quickBooksService.initializeClient(tokens.accessToken, tokens.refreshToken, tokens.realmId);

        // Also save directly to database for multi-worker support
        try {
            await quickBooksService.saveTokensToDatabase(tokens.accessToken, tokens.refreshToken, tokens.realmId);
            logger.info('QuickBooks tokens saved to database for multi-worker support', { context: 'QuickBooks' });
        } catch (dbErr) {
            logger.logError(dbErr, { context: 'QuickBooks', action: 'saveTokensToDatabaseCallback' });
        }

        logger.info('QuickBooks connected successfully!', { context: 'QuickBooks' });

        // Determine return URL based on environment
        const appUrl = process.env.APP_URL || 'http://localhost:3000';

        // Return success page like working example
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QuickBooks Connected</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .success { color: green; font-size: 24px; margin: 20px; }
                    .button { background: #0077c5; color: white; padding: 15px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px; }
                </style>
            </head>
            <body>
                <div class="success">Connected to QuickBooks!</div>
                <p>You can now access QuickBooks data. You can close this window.</p>
                <a href="${appUrl}" class="button">Return to Application</a>
                <script>
                    // Auto-close if opened in popup
                    if (window.opener) {
                        window.opener.location.reload();
                        window.close();
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'oauthCallback' });
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Error</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .error { color: red; font-size: 24px; margin: 20px; }
                    .button { background: #0077c5; color: white; padding: 15px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px; }
                </style>
            </head>
            <body>
                <div class="error">OAuth Error</div>
                <p>Error: ${error.message}</p>
                <a href="${appUrl}" class="button">Return to Application</a>
            </body>
            </html>
        `);
    }
});

/**
 * GET /api/quickbooks/customers
 * Test endpoint like working example - list first 10 customers
 */
router.get('/customers', async (req, res) => {
    try {
        const customers = await quickBooksService.getCustomers();
        res.json({
            success: true,
            data: customers,
            count: customers?.QueryResponse?.Customer?.length || 0
        });
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'fetchCustomers' });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch customers'
        });
    }
});

/**
 * Save transaction categorization locally
 * @param {string} transactionId - QuickBooks transaction ID
 * @param {string} propertyId - Property ID
 * @param {string} listingId - Listing ID (optional)
 * @param {string} department - Department name
 */
async function saveTransactionCategorization(transactionId, propertyId, listingId, department) {
    try {
        const categorizationsFile = path.join(__dirname, '../data/transaction-categorizations.json');
        
        let categorizations = {};
        try {
            const data = fs.readFileSync(categorizationsFile, 'utf8');
            categorizations = JSON.parse(data);
        } catch (error) {
            // File doesn't exist yet, start with empty object
        }
        
        categorizations[transactionId] = {
            propertyId,
            listingId: listingId || null,
            department,
            categorizedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(categorizationsFile, JSON.stringify(categorizations, null, 2));
    } catch (error) {
        logger.logError(error, { context: 'QuickBooks', action: 'saveTransactionCategorization' });
        // Don't throw error as this is not critical
    }
}

module.exports = router;
