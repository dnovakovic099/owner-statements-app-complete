const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const basicAuth = require('express-basic-auth');
const fs = require('fs');
require('dotenv').config();

// Database initialization
const { syncDatabase } = require('./models');

const app = express();
const PORT = process.env.PORT || 3003;

// Load authentication config
let authConfig;
try {
    authConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/auth.json'), 'utf8'));
} catch (error) {
    console.warn('Could not load auth config, using defaults');
    authConfig = {
        users: { 'LL': 'bnb547!' },
        realm: 'Luxury Lodging PM - Owner Statements'
    };
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for QuickBooks setup
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            upgradeInsecureRequests: [],
        },
    },
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files - serve React build in production, uploads in development
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/build')));
} else {
    app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
    // Serve public files (like quickbooks-setup.html)
    app.use(express.static(path.join(__dirname, '../public')));
}

// Auth routes (no authentication required for login)
app.use('/api/auth', require('./routes/auth'));

// QuickBooks OAuth callback (no authentication required - QuickBooks needs to access this)
const QuickBooksService = require('./services/QuickBooksService');
const quickBooksService = new QuickBooksService();

app.get('/api/quickbooks/auth/callback', async (req, res) => {
    try {
        console.log('QuickBooks callback received:', req.url);
        
        // Pass the full req.url like working example
        const tokens = await quickBooksService.exchangeCodeForTokens(req.url);
        
        // Save tokens to .env file
        const envPath = path.join(__dirname, '../.env');
        let envContent = '';
        
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            console.log('Creating new .env file');
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
        
        console.log('QuickBooks connected successfully!');
        
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
                <div class="success">✅ Connected to QuickBooks!</div>
                <p>You can now access QuickBooks data. You can close this window.</p>
                <a href="http://localhost:3000" class="button">Return to Application</a>
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
        console.error('OAuth error:', error);
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
                <div class="error">❌ OAuth Error</div>
                <p>Error: ${error.message}</p>
                <a href="http://localhost:3000" class="button">Return to Application</a>
            </body>
            </html>
        `);
    }
});

// Basic Authentication for protected routes only
const authMiddleware = basicAuth({
    users: authConfig.users,
    challenge: true,
    realm: authConfig.realm || 'Luxury Lodging PM - Owner Statements'
});

// Protected Routes - File-based (new)
app.use('/api/dashboard', authMiddleware, require('./routes/dashboard-file'));
app.use('/api/reservations', authMiddleware, require('./routes/reservations-file'));
app.use('/api/statements', authMiddleware, require('./routes/statements-file'));
app.use('/api/properties', authMiddleware, require('./routes/properties-file'));
app.use('/api/expenses', authMiddleware, require('./routes/expenses'));
app.use('/api/quickbooks', authMiddleware, require('./routes/quickbooks'));

// Removed unused database routes

// Serve main page
app.get('/', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
    } else {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});


async function startServer() {
    try {
        // Initialize database (PostgreSQL on Railway, SQLite locally)
        console.log('🔄 Initializing database...');
        await syncDatabase();
        console.log('✅ Database initialized successfully');
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Owner Statements Server running on port ${PORT}`);
            console.log(`📊 Dashboard available at: http://localhost:${PORT}`);
            console.log(`📝 API documentation: http://localhost:${PORT}/api`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
