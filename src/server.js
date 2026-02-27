const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const logger = require('./utils/logger');

// Database initialization
const { syncDatabase } = require('./models');
const ListingService = require('./services/ListingService');
const TagScheduleService = require('./services/TagScheduleService');

// Authentication middleware
const { authenticate, requireAdmin, requireEditor, requireViewer } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3003;

// Trust proxy for deployment behind reverse proxies (Railway, Heroku, etc.)
// This enables express-rate-limit to correctly identify client IPs via X-Forwarded-For
app.set('trust proxy', 1);

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

// Body parsing (skip JSON parsing for Stripe webhook — it needs raw body)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe/webhook') {
        return next();
    }
    express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting configuration
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per window
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit login attempts to 10 per window
    message: { error: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const statementGenerationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit statement generation to 20 per minute
    message: { error: 'Too many statement generation requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply general rate limiter to all API routes
app.use('/api/', generalLimiter);
// Stricter limits for auth endpoints
app.use('/api/auth/login', authLimiter);
// Limit statement generation (expensive operation)
app.use('/api/statements/generate', statementGenerationLimiter);

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
        logger.info('QuickBooks callback received', { url: req.url });

        const tokens = await quickBooksService.exchangeCodeForTokens(req.url);

        // Save tokens to .env file
        const envPath = path.join(__dirname, '../.env');
        let envContent = '';

        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            logger.info('Creating new .env file');
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

        logger.info('QuickBooks connected successfully');

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
        logger.error('OAuth error', { error: error.message });
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

// Listing Groups - Editors/Admins can manage groups
app.use('/api/groups', authenticate, require('./routes/groups'));

// Properties - Any authenticated user
app.use('/api/properties', authenticate, require('./routes/properties-file'));

// Reservations - Editors/Admins can manage
app.use('/api/reservations', authenticate, require('./routes/reservations-file'));
app.use('/api/reservations-import', authenticate, require('./routes/reservations'));

// Expenses - Editors/Admins can manage
app.use('/api/expenses', authenticate, require('./routes/expenses'));

// QuickBooks - Editors/Admins
app.use('/api/quickbooks', authenticate, require('./routes/quickbooks'));

// Financials - QuickBooks financial reports and transaction queries
app.use('/api/financials', authenticate, require('./routes/financials'));

// Email - Editors/Admins can send, all can view logs
app.use('/api/email', authenticate, require('./routes/email'));
app.use('/api/email-templates', authenticate, require('./routes/email-templates'));

// Stripe Connect OAuth callback (public — owner's browser is redirected here by Stripe)
app.get('/api/connect/callback', async (req, res) => {
    const connectLogger = require('./utils/logger');
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            connectLogger.warn('Stripe Connect OAuth denied', { error, error_description });
            return res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Connection Cancelled</h2><p>The Stripe account was not connected.</p></body></html>');
        }

        if (!code || !state) {
            return res.status(400).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Invalid Request</h2><p>Missing authorization code or state.</p></body></html>');
        }

        const Stripe = require('stripe');
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) {
            return res.status(500).send('Stripe not configured');
        }
        const stripe = new Stripe(stripeKey);

        // Decode state to get entity info
        let entityInfo;
        try {
            entityInfo = JSON.parse(Buffer.from(state, 'base64url').toString());
        } catch (e) {
            return res.status(400).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Invalid State</h2><p>Could not decode connection state.</p></body></html>');
        }

        const { entityType, entityId } = entityInfo;
        if (!['listing', 'group'].includes(entityType) || !entityId) {
            return res.status(400).send('Invalid entity info in state');
        }

        // Exchange authorization code for connected account ID
        const response = await stripe.oauth.token({
            grant_type: 'authorization_code',
            code,
        });

        const connectedAccountId = response.stripe_user_id;

        // Save to entity
        const { encryptOptional } = require('./utils/fieldEncryption');
        const ListingGroup = require('./models/ListingGroup');
        const { Listing } = require('./models');

        if (entityType === 'group') {
            const group = await ListingGroup.findByPk(parseInt(entityId, 10));
            if (group) {
                await group.update({ stripeAccountId: connectedAccountId, stripeOnboardingStatus: 'verified' });
            }
        } else {
            const listing = await Listing.findByPk(parseInt(entityId, 10));
            if (listing) {
                await listing.update({ stripeAccountId: encryptOptional(connectedAccountId), stripeOnboardingStatus: 'verified' });
            }
        }

        connectLogger.info('Stripe Connect OAuth completed', { entityType, entityId, connectedAccountId });

        res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
            <div style="max-width:400px;margin:0 auto">
                <div style="width:64px;height:64px;border-radius:50%;background:#ecfdf5;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
                    <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><path stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg>
                </div>
                <h2 style="color:#111827;margin-bottom:8px">Stripe Account Connected!</h2>
                <p style="color:#6b7280">Your Stripe account <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${connectedAccountId}</code> has been successfully linked.</p>
                <p style="color:#9ca3af;font-size:14px;margin-top:24px">You can close this window.</p>
            </div>
        </body></html>`);
    } catch (err) {
        const connectLogger2 = require('./utils/logger');
        connectLogger2.logError(err, { context: 'StripeConnectCallback' });
        res.status(500).send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Connection Failed</h2><p>${err.message || 'Something went wrong connecting your Stripe account.'}</p></body></html>`);
    }
});

// Stripe webhook — must be BEFORE body parsing for raw body verification
// Note: express.json() is applied globally above, so we use express.raw() for this specific route
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        logger.warn('Stripe webhook received but STRIPE_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        logger.warn('Stripe webhook signature verification failed', { error: err.message });
        return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    logger.info('Stripe webhook received', { type: event.type, id: event.id });

    if (event.type === 'topup.succeeded') {
        try {
            const { processQueuedPayouts } = require('./routes/payouts');
            const result = await processQueuedPayouts();
            logger.info('Processed queued payouts after top-up success', result);
        } catch (err) {
            logger.error('Failed to process queued payouts after top-up', { error: err.message });
        }
    } else if (event.type === 'topup.failed') {
        try {
            const { Statement } = require('./models');
            const { Op } = require('sequelize');
            const queued = await Statement.findAll({ where: { payoutStatus: 'queued' } });
            for (const s of queued) {
                await s.update({ payoutStatus: 'topup_failed', payoutError: 'Bank top-up failed' });
            }
            logger.warn('Top-up failed, marked queued statements as topup_failed', { count: queued.length });
        } catch (err) {
            logger.error('Failed to update queued statements after top-up failure', { error: err.message });
        }
    }

    res.json({ received: true });
});

// Payouts - Stripe Connect onboarding and status
app.use('/api/payouts', authenticate, require('./routes/payouts'));

// Tag Schedules - Editors/Admins
app.use('/api/tag-schedules', authenticate, require('./routes/tag-schedules'));

// Activity Logs - Admin only
app.use('/api/activity-logs', authenticate, require('./routes/activity-logs'));

// Analytics - Any authenticated user can view
app.use('/api/analytics', authenticate, require('./routes/analytics'));

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
    logger.error('Unhandled error', { error: err.message, stack: err.stack });

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

let server;

async function startServer() {
    try {
        // Initialize database
        logger.info('Initializing database...');
        await syncDatabase();
        logger.info('Database initialized successfully');

        // Sync listings from Hostify on startup (runs in background)
        logger.info('Syncing listings from Hostify...');
        ListingService.syncListingsFromHostify()
            .then(result => {
                logger.info('Synced listings from Hostify', { synced: result.synced });
            })
            .catch(err => {
                logger.warn('Listing sync failed (will retry later)', { error: err.message });
            });

        // Start TagScheduleService for auto-generating statements
        logger.info('Starting TagScheduleService for automatic statement generation...');
        TagScheduleService.start();
        logger.info('TagScheduleService started - checking schedules every minute at 8:00 AM EST');

        // Start server
        server = app.listen(PORT, () => {
            logger.info('Owner Statements Server started', {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                dashboard: `http://localhost:${PORT}`
            });
        });
    } catch (error) {
        logger.error('Failed to start server', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// ================================
// GRACEFUL SHUTDOWN & CRASH HANDLERS
// ================================

let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received, starting graceful shutdown...`);

    // Force exit after 10 seconds if cleanup stalls
    const forceExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    // Stop accepting new connections
    if (server) {
        server.close(() => {
            logger.info('HTTP server closed');
        });
    }

    // Stop TagScheduleService cron
    TagScheduleService.stop();

    // Close database connections
    try {
        const sequelize = require('./config/database');
        await sequelize.close();
        logger.info('Database connections closed');
    } catch (err) {
        logger.error('Error closing database connections', { error: err.message });
    }

    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
        error: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
    });
});

startServer();

module.exports = app;
