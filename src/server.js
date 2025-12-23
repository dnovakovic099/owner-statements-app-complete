const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Database initialization
const { syncDatabase } = require('./models');
const ListingService = require('./services/ListingService');

// Authentication middleware
const { authenticate, requireAdmin, requireEditor, requireViewer } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3003;

// Security Headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            imgSrc: ["'self'", "data:", "blob:"],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
}));

// Additional Security Headers
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // XSS Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions Policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || true
        : true,
    credentials: true,
    exposedHeaders: ['Content-Disposition']
}));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files - serve React build and public files
const reactBuildPath = path.join(__dirname, '../frontend/build');
if (fs.existsSync(reactBuildPath)) {
    app.use(express.static(reactBuildPath));
}
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(express.static(path.join(__dirname, '../public')));

// ================================
// PUBLIC ROUTES (No Authentication)
// ================================

// Auth routes - login, verify, invite acceptance
app.use('/api/auth', require('./routes/auth'));

// QuickBooks OAuth callback (external service needs access)
const QuickBooksService = require('./services/QuickBooksService');
const quickBooksService = new QuickBooksService();

app.get('/api/quickbooks/auth/callback', async (req, res) => {
    try {
        console.log('QuickBooks callback received:', req.url);

        const tokens = await quickBooksService.exchangeCodeForTokens(req.url);

        // Save tokens to .env file
        const envPath = path.join(__dirname, '../.env');
        let envContent = '';

        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            console.log('Creating new .env file');
        }

        const updates = {
            'QUICKBOOKS_COMPANY_ID': tokens.realmId,
            'QUICKBOOKS_ACCESS_TOKEN': tokens.accessToken,
            'QUICKBOOKS_REFRESH_TOKEN': tokens.refreshToken
        };

        let updatedContent = envContent;

        Object.entries(updates).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(updatedContent)) {
                updatedContent = updatedContent.replace(regex, `${key}=${value}`);
            } else {
                updatedContent += `\n${key}=${value}`;
            }
        });

        fs.writeFileSync(envPath, updatedContent);

        process.env.QUICKBOOKS_COMPANY_ID = tokens.realmId;
        process.env.QUICKBOOKS_ACCESS_TOKEN = tokens.accessToken;
        process.env.QUICKBOOKS_REFRESH_TOKEN = tokens.refreshToken;

        quickBooksService.initializeClient(tokens.accessToken, tokens.refreshToken, tokens.realmId);

        console.log('QuickBooks connected successfully!');

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
                <a href="http://localhost:3000" class="button">Return to Application</a>
                <script>
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
                <div class="error">OAuth Error</div>
                <p>Error: ${error.message}</p>
                <a href="http://localhost:3000" class="button">Return to Application</a>
            </body>
            </html>
        `);
    }
});

// ================================
// PROTECTED ROUTES (Role-Based Access)
// ================================

// User Management - Admin Only
app.use('/api/users', authenticate, require('./routes/users'));

// Dashboard - Any authenticated user can view
app.use('/api/dashboard', authenticate, require('./routes/dashboard-file'));

// Statements - Viewers can read, Editors/Admins can modify
app.use('/api/statements', authenticate, require('./routes/statements-file'));

// Listings - Viewers can read, Editors/Admins can modify
app.use('/api/listings', authenticate, require('./routes/listings'));

// Properties - Any authenticated user
app.use('/api/properties', authenticate, require('./routes/properties-file'));

// Reservations - Editors/Admins can manage
app.use('/api/reservations', authenticate, require('./routes/reservations-file'));
app.use('/api/reservations-import', authenticate, require('./routes/reservations'));

// Expenses - Editors/Admins can manage
app.use('/api/expenses', authenticate, require('./routes/expenses'));

// QuickBooks - Editors/Admins
app.use('/api/quickbooks', authenticate, require('./routes/quickbooks'));

// Email - Editors/Admins can send, all can view logs
app.use('/api/email', authenticate, require('./routes/email'));
app.use('/api/email-templates', authenticate, require('./routes/email-templates'));

// Tag Schedules - Editors/Admins
app.use('/api/tag-schedules', authenticate, require('./routes/tag-schedules'));

// Activity Logs - Admin only
app.use('/api/activity-logs', authenticate, require('./routes/activity-logs'));

// ================================
// FRONTEND ROUTES
// ================================

// Accept invite page (public)
app.get('/accept-invite', (req, res) => {
    const indexPath = path.join(__dirname, '../frontend/build/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    }
});

// ================================
// ERROR HANDLING & CATCH-ALL
// ================================

// Serve React app for all non-API routes (catch-all middleware)
app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Route not found' });
    }

    const indexPath = path.join(__dirname, '../frontend/build/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);

    // Don't leak error details in production
    const errorResponse = {
        error: 'Internal server error'
    };

    if (process.env.NODE_ENV !== 'production') {
        errorResponse.message = err.message;
        errorResponse.stack = err.stack;
    }

    res.status(500).json(errorResponse);
});

// ================================
// SERVER STARTUP
// ================================

async function startServer() {
    try {
        // Initialize database
        console.log('Initializing database...');
        await syncDatabase();
        console.log('Database initialized successfully');

        // Sync listings from Hostify on startup (runs in background)
        console.log('Syncing listings from Hostify...');
        ListingService.syncListingsFromHostify()
            .then(result => {
                console.log(`Synced ${result.synced} listings from Hostify`);
            })
            .catch(err => {
                console.warn('Listing sync failed (will retry later):', err.message);
            });

        // Start server
        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`Owner Statements Server`);
            console.log(`========================================`);
            console.log(`Port: ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Dashboard: http://localhost:${PORT}`);
            console.log(`========================================\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
