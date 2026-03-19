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

// Body parsing
app.use(express.json({ limit: '10mb' }));
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

// Payout setup page (public — owner visits this link to add bank details)
app.get('/payout-setup/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { Listing } = require('./models');
        const ListingGroup = require('./models/ListingGroup');

        // Find entity by invite token
        let entity = await Listing.findOne({ where: { payoutInviteToken: token } });
        let entityType = 'listing';
        if (!entity) {
            entity = await ListingGroup.findOne({ where: { payoutInviteToken: token } });
            entityType = 'group';
        }

        if (!entity) {
            return res.status(404).send(`<html><body style="font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#111">
                <h2>Invalid or Expired Link</h2><p style="color:#6b7280">This payout setup link is no longer valid. Please contact your property manager for a new link.</p>
            </body></html>`);
        }

        // If already set up, show success
        if (entity.wiseRecipientId && entity.wiseStatus === 'verified') {
            const connectedName = entity.displayName || entity.nickname || entity.name || 'Your Property';
            return res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Payout Connected</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
            <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',system-ui,sans-serif;background:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}</style></head>
            <body><div style="background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:440px;width:100%;text-align:center;padding:48px 32px">
                <div style="width:56px;height:56px;border-radius:50%;background:#ecfdf5;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg>
                </div>
                <h2 style="color:#111827;font-size:17px;font-weight:600;margin-bottom:6px">Bank Account Connected</h2>
                <p style="color:#6b7280;font-size:14px;margin-bottom:4px">${connectedName}</p>
                <p style="color:#9ca3af;font-size:13px">Your bank details are already on file. You can close this window.</p>
            </div></body></html>`);
        }

        // Use displayName or nickname (friendly name), fall back to raw name
        const entityName = entity.displayName || entity.nickname || entity.name || 'Your Property';
        // Owner name for pre-filling
        const ownerName = entity.ownerName || '';
        const ownerEmail = entity.ownerEmail || '';

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Set Up Payout - Luxury Lodging PM</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04); max-width: 480px; width: 100%; overflow: hidden; }
        .header { background: #111827; padding: 28px 24px; text-align: center; }
        .header-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.1); border-radius: 20px; padding: 5px 14px; margin-bottom: 14px; }
        .header-badge svg { flex-shrink: 0; }
        .header-badge span { font-size: 12px; color: rgba(255,255,255,0.7); font-weight: 500; letter-spacing: 0.02em; }
        .header h1 { font-size: 18px; font-weight: 600; color: #fff; line-height: 1.3; }
        .header .property { font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 4px; font-weight: 400; }
        .body { padding: 28px 24px; }
        .section-label { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
        .field { margin-bottom: 16px; }
        .field label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 5px; }
        .field input {
            width: 100%; padding: 11px 14px; border: 1px solid #e5e7eb; border-radius: 10px;
            font-size: 14px; font-family: inherit; color: #111827; outline: none;
            transition: border-color 0.15s, box-shadow 0.15s; background: #fff;
        }
        .field input::placeholder { color: #9ca3af; }
        .field input:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.08); }
        .field .hint { font-size: 11px; color: #9ca3af; margin-top: 3px; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        /* Custom dropdown */
        .custom-select { position: relative; }
        .custom-select .select-trigger {
            width: 100%; padding: 11px 14px; border: 1px solid #e5e7eb; border-radius: 10px;
            font-size: 14px; font-family: inherit; color: #111827; background: #fff;
            cursor: pointer; display: flex; align-items: center; justify-content: space-between;
            transition: border-color 0.15s, box-shadow 0.15s; user-select: none;
        }
        .custom-select .select-trigger:hover { border-color: #d1d5db; }
        .custom-select.open .select-trigger { border-color: #111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.08); }
        .custom-select .select-trigger svg { width: 16px; height: 16px; color: #9ca3af; transition: transform 0.15s; }
        .custom-select.open .select-trigger svg { transform: rotate(180deg); }
        .custom-select .select-options {
            position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;
            background: white; border: 1px solid #e5e7eb; border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.1); overflow: hidden;
            display: none; animation: dropIn 0.12s ease-out;
        }
        .custom-select.open .select-options { display: block; }
        .custom-select .select-option {
            padding: 11px 14px; font-size: 14px; cursor: pointer;
            display: flex; align-items: center; justify-content: space-between;
            transition: background 0.1s;
        }
        .custom-select .select-option:hover { background: #f9fafb; }
        .custom-select .select-option.selected { background: #f3f4f6; font-weight: 500; }
        .custom-select .select-option .check { color: #111827; display: none; }
        .custom-select .select-option.selected .check { display: block; }
        @keyframes dropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .sep { height: 1px; background: #f3f4f6; margin: 20px 0; }
        .btn {
            width: 100%; padding: 13px; background: #111827; color: white; border: none;
            border-radius: 10px; font-size: 14px; font-weight: 600; font-family: inherit;
            cursor: pointer; transition: background 0.15s, transform 0.1s; margin-top: 6px;
        }
        .btn:hover { background: #1f2937; }
        .btn:active { transform: scale(0.99); }
        .btn:disabled { background: #9ca3af; cursor: not-allowed; transform: none; }
        .error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 18px; display: none; line-height: 1.4; }
        .success { text-align: center; padding: 48px 24px; }
        .success .icon { width: 56px; height: 56px; border-radius: 50%; background: #ecfdf5; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
        .footer { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 24px 20px; }
        .footer svg { flex-shrink: 0; }
        .footer span { font-size: 11px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="header-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m4-10h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>LUXURY LODGING PM</span>
            </div>
            <h1>Set Up Your Payout</h1>
            <p class="property">${entityName}</p>
        </div>
        <div class="body" id="formSection">
            <div class="error" id="errorBox"></div>
            <form id="payoutForm" onsubmit="submitForm(event)">
                <div class="section-label">Personal Information</div>
                <div class="field-row">
                    <div class="field">
                        <label for="name">Account Holder Name</label>
                        <input type="text" id="name" name="name" required placeholder="Full legal name" value="${ownerName}" />
                    </div>
                    <div class="field">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" required placeholder="you@email.com" value="${ownerEmail}" />
                    </div>
                </div>
                <div class="field">
                    <label for="street">Street Address</label>
                    <input type="text" id="street" name="street" required placeholder="123 Main St" />
                </div>
                <div class="field-row-3">
                    <div class="field">
                        <label for="city">City</label>
                        <input type="text" id="city" name="city" required placeholder="City" />
                    </div>
                    <div class="field">
                        <label for="state">State</label>
                        <input type="text" id="state" name="state" maxlength="2" placeholder="FL" style="text-transform:uppercase" />
                    </div>
                    <div class="field">
                        <label for="zip">ZIP Code</label>
                        <input type="text" id="zip" name="zip" required maxlength="10" inputmode="numeric" placeholder="33601" />
                    </div>
                </div>

                <div class="sep"></div>
                <div class="section-label">Bank Details</div>

                <div class="field-row">
                    <div class="field">
                        <label for="routingNumber">Routing Number</label>
                        <input type="text" id="routingNumber" name="routingNumber" required maxlength="9" inputmode="numeric" placeholder="9 digits" />
                        <div class="hint">ABA routing number</div>
                    </div>
                    <div class="field">
                        <label>Account Type</label>
                        <input type="hidden" id="accountType" name="accountType" value="CHECKING" />
                        <div class="custom-select" id="accountTypeSelect">
                            <div class="select-trigger" onclick="toggleDropdown()">
                                <span id="selectedLabel">Checking</span>
                                <svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </div>
                            <div class="select-options">
                                <div class="select-option selected" data-value="CHECKING" onclick="selectOption(this)">
                                    <span>Checking</span>
                                    <svg class="check" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                </div>
                                <div class="select-option" data-value="SAVINGS" onclick="selectOption(this)">
                                    <span>Savings</span>
                                    <svg class="check" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="field">
                    <label for="accountNumber">Account Number</label>
                    <input type="text" id="accountNumber" name="accountNumber" required inputmode="numeric" placeholder="Enter account number" />
                </div>
                <div class="field">
                    <label for="confirmAccountNumber">Confirm Account Number</label>
                    <input type="text" id="confirmAccountNumber" name="confirmAccountNumber" required inputmode="numeric" placeholder="Re-enter account number" />
                </div>
                <button type="submit" class="btn" id="submitBtn">Connect Bank Account</button>
            </form>
        </div>
        <div class="footer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>Bank details are encrypted and sent securely</span>
        </div>
    </div>
    <script>
        function toggleDropdown() {
            document.getElementById('accountTypeSelect').classList.toggle('open');
        }
        function selectOption(el) {
            const value = el.dataset.value;
            document.getElementById('accountType').value = value;
            document.getElementById('selectedLabel').textContent = el.querySelector('span').textContent;
            document.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
            el.classList.add('selected');
            document.getElementById('accountTypeSelect').classList.remove('open');
        }
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const sel = document.getElementById('accountTypeSelect');
            if (sel && !sel.contains(e.target)) sel.classList.remove('open');
        });

        async function submitForm(e) {
            e.preventDefault();
            const errorBox = document.getElementById('errorBox');
            errorBox.style.display = 'none';

            const acct = document.getElementById('accountNumber').value.trim();
            const confirmAcct = document.getElementById('confirmAccountNumber').value.trim();
            if (acct !== confirmAcct) {
                errorBox.textContent = 'Account numbers do not match.';
                errorBox.style.display = 'block';
                return;
            }
            const routing = document.getElementById('routingNumber').value.trim();
            if (!/^[0-9]{9}$/.test(routing)) {
                errorBox.textContent = 'Please enter a valid 9-digit routing number.';
                errorBox.style.display = 'block';
                return;
            }
            const street = document.getElementById('street').value.trim();
            const city = document.getElementById('city').value.trim();
            const zip = document.getElementById('zip').value.trim();
            if (!street || !city || !zip) {
                errorBox.textContent = 'Please fill in your street address, city, and ZIP code.';
                errorBox.style.display = 'block';
                return;
            }

            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            btn.textContent = 'Connecting...';
            try {
                const resp = await fetch('/api/payouts/setup/${token}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('name').value.trim(),
                        email: document.getElementById('email').value.trim(),
                        accountType: document.getElementById('accountType').value,
                        routingNumber: routing,
                        accountNumber: acct,
                        street: street,
                        city: city,
                        state: (document.getElementById('state').value || '').trim().toUpperCase(),
                        zip: zip,
                    }),
                });
                const data = await resp.json();
                if (data.success) {
                    document.getElementById('formSection').innerHTML = '<div class="success"><div class="icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg></div><h2 style="color:#111827;font-size:17px;margin-bottom:8px">Bank Account Connected</h2><p style="color:#6b7280;font-size:14px;line-height:1.5">Your payout details have been saved successfully. You can close this window.</p></div>';
                } else {
                    throw new Error(data.error || 'Something went wrong');
                }
            } catch (err) {
                errorBox.textContent = err.message;
                errorBox.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Connect Bank Account';
            }
        }
    </script>
</body>
</html>`);
    } catch (err) {
        logger.error('Payout setup page error', { error: err.message });
        res.status(500).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Error</h2><p>Something went wrong. Please try again later.</p></body></html>');
    }
});

// Payout setup form submission (public — no auth)
app.post('/api/payouts/setup/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { name, email, accountType, routingNumber, accountNumber, street, city, state, zip } = req.body;

        if (!name || !routingNumber || !accountNumber) {
            return res.status(400).json({ error: 'Name, routing number, and account number are required' });
        }

        if (!street || !city || !zip) {
            return res.status(400).json({ error: 'Street address, city, and ZIP code are required' });
        }

        if (!/^[0-9]{9}$/.test(routingNumber)) {
            return res.status(400).json({ error: 'Routing number must be exactly 9 digits' });
        }

        const { Listing } = require('./models');
        const ListingGroup = require('./models/ListingGroup');
        const IncreaseService = require('./services/IncreaseService');

        // Find entity by token
        let entity = await Listing.findOne({ where: { payoutInviteToken: token } });
        let entityType = 'listing';
        if (!entity) {
            entity = await ListingGroup.findOne({ where: { payoutInviteToken: token } });
            entityType = 'group';
        }

        if (!entity) {
            return res.status(404).json({ error: 'Invalid or expired link' });
        }

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Payment system not configured' });
        }

        // Create Increase external account
        const recipient = await IncreaseService.createRecipient({
            name,
            email,
            routingNumber,
            accountNumber,
            accountType: accountType || 'CHECKING',
        });

        logger.info('Increase external account created via payout setup', { entityType, entityId: entity.id, recipientId: recipient.id });

        // Save recipient ID + bank details (model setters handle encryption automatically)
        await entity.update({
            wiseRecipientId: String(recipient.id),
            wiseStatus: 'verified',
            payoutInviteToken: null,
            bankAccountHolder: name,
            bankEmail: email,
            bankRoutingNumber: routingNumber,
            bankAccountNumber: accountNumber,
            bankAccountType: accountType || 'CHECKING',
            bankAddress: JSON.stringify({ street, city, state, zip }),
        });

        res.json({ success: true, message: 'Bank account connected successfully' });
    } catch (err) {
        logger.error('Payout setup submission error', { error: err.response?.data || err.message });
        const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message || 'Failed to connect bank account';
        res.status(500).json({ error: msg });
    }
});

// Payment page (public — owner visits to see amount owed and bank details)
app.get('/pay/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { Statement } = require('./models');
        const { Op } = require('sequelize');

        // Find statement by payment token stored in payoutError field
        const statement = await Statement.findOne({
            where: {
                payoutError: { [Op.like]: `payment_token:${token}` },
            },
        });

        if (!statement) {
            return res.status(404).send(`<html><body style="font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#111">
                <h2>Invalid or Expired Link</h2><p style="color:#6b7280">This payment link is no longer valid.</p>
            </body></html>`);
        }

        const collectAmount = Math.abs(parseFloat(statement.ownerPayout) || 0);
        const ownerName = statement.ownerName || 'Owner';

        // Try to get bank details from Increase
        let bankDetailsHtml = '';
        try {
            const IncreaseService = require('./services/IncreaseService');
            const bankDetails = await IncreaseService.getAccountBankDetails();
            if (bankDetails && bankDetails.length > 0) {
                const bd = bankDetails[0];
                bankDetailsHtml = `
                    <div class="bank-details">
                        <h3>Wire Transfer Details</h3>
                        <div class="detail-row"><span class="label">Bank</span><span class="value">${bd.bankName || 'N/A'}</span></div>
                        <div class="detail-row"><span class="label">Routing Number</span><span class="value">${bd.routingNumber || 'N/A'}</span></div>
                        <div class="detail-row"><span class="label">Account Number</span><span class="value">${bd.accountNumber || 'N/A'}</span></div>
                        <div class="detail-row"><span class="label">Account Type</span><span class="value">${bd.accountType || 'Checking'}</span></div>
                        ${bd.address ? `<div class="detail-row"><span class="label">Bank Address</span><span class="value">${bd.address}</span></div>` : ''}
                        <div class="reference">
                            <strong>Important:</strong> Include <code>Statement #${statement.id} - ${ownerName}</code> as the payment reference/memo.
                        </div>
                    </div>`;
            }
        } catch (e) {
            // Use env fallback
            if (process.env.INCREASE_BANK_ROUTING && process.env.INCREASE_BANK_ACCOUNT) {
                bankDetailsHtml = `
                    <div class="bank-details">
                        <h3>Wire Transfer Details</h3>
                        <div class="detail-row"><span class="label">Bank</span><span class="value">${process.env.INCREASE_BANK_NAME || 'Increase'}</span></div>
                        <div class="detail-row"><span class="label">Routing Number</span><span class="value">${process.env.INCREASE_BANK_ROUTING}</span></div>
                        <div class="detail-row"><span class="label">Account Number</span><span class="value">${process.env.INCREASE_BANK_ACCOUNT}</span></div>
                        <div class="reference">
                            <strong>Important:</strong> Include <code>Statement #${statement.id} - ${ownerName}</code> as the payment reference/memo.
                        </div>
                    </div>`;
            }
        }

        if (!bankDetailsHtml) {
            bankDetailsHtml = `<div class="bank-details"><p style="color:#6b7280">Bank details are being configured. Please contact your property manager for wire transfer instructions.</p></div>`;
        }

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Due - Luxury Lodging PM</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 500px; width: 100%; overflow: hidden; }
        .header { background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 24px; color: white; text-align: center; }
        .header h1 { font-size: 20px; font-weight: 600; }
        .header .amount { font-size: 36px; font-weight: 700; margin-top: 8px; }
        .header .period { font-size: 13px; opacity: 0.9; margin-top: 4px; }
        .body { padding: 24px; }
        .bank-details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
        .bank-details h3 { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
        .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
        .detail-row .label { color: #64748b; font-size: 13px; }
        .detail-row .value { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 600; color: #1e293b; }
        .reference { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px; margin-top: 12px; font-size: 12px; color: #92400e; }
        .reference code { background: white; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
        .footer { text-align: center; padding: 0 24px 24px; color: #9ca3af; font-size: 12px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h1>Balance Due</h1>
            <div class="amount">$${collectAmount.toFixed(2)}</div>
            <div class="period">${ownerName} — ${statement.weekStartDate} to ${statement.weekEndDate}</div>
        </div>
        <div class="body">
            <p style="color:#475569;font-size:14px;margin-bottom:16px">
                Please send payment using the bank details below. Once received, your statement will be updated automatically.
            </p>
            ${bankDetailsHtml}
        </div>
        <div class="footer">
            <p>Luxury Lodging PM — Property Management</p>
        </div>
    </div>
</body>
</html>`);
    } catch (err) {
        logger.error('Payment page error', { error: err.message });
        res.status(500).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Error</h2><p>Something went wrong.</p></body></html>');
    }
});

// Payouts - Increase payout management
// Public receipt endpoint — uses short-lived JWT token in query string so it works in a new browser tab
app.get('/api/payouts/statements/:id/receipt', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) return res.status(401).json({ error: 'Token required. Open receipts from the app.' });
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('./middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.purpose !== 'receipt' || String(decoded.statementId) !== String(req.params.id)) {
            return res.status(403).json({ error: 'Invalid receipt token' });
        }

        const { Statement } = require('./models');
        const statement = await Statement.findByPk(parseInt(req.params.id));
        if (!statement) return res.status(404).json({ error: 'Statement not found' });
        if (statement.payoutStatus !== 'paid' && statement.payoutStatus !== 'collected') {
            return res.status(400).json({ error: 'Statement has not been paid yet' });
        }

        const payoutAmount = parseFloat(statement.ownerPayout) || 0;
        const wiseFee = parseFloat(statement.wiseFee) || 0;
        const totalAmount = parseFloat(statement.totalTransferAmount) || (payoutAmount + wiseFee);
        const paidAt = statement.paidAt ? new Date(statement.paidAt) : new Date();
        const transferId = statement.payoutTransferId || 'N/A';
        const statementId = statement.id;
        const propertyName = statement.propertyName || 'Unknown Property';
        const ownerName = statement.ownerName || 'Owner';
        const periodStart = statement.weekStartDate ? new Date(statement.weekStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const periodEnd = statement.weekEndDate ? new Date(statement.weekEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

        // Get listing nickname for PDF filename
        let listingNickname = propertyName;
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
        if (listingId) {
            const { Listing } = require('./models');
            const listing = await Listing.findByPk(listingId);
            if (listing) listingNickname = listing.nickname || listing.displayName || listing.name || propertyName;
        }
        const fileStart = statement.weekStartDate ? new Date(statement.weekStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const fileEnd = statement.weekEndDate ? new Date(statement.weekEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const pdfFilename = (listingNickname + ' ' + fileStart + '-' + fileEnd).replace(/[^a-zA-Z0-9 \-]/g, '').replace(/\s+/g, ' ').trim();
        const paidDate = paidAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const revenue = (parseFloat(statement.totalRevenue) || 0);
        const pmCommission = (parseFloat(statement.pmCommission) || 0);
        const expenses = (parseFloat(statement.totalExpenses) || 0);
        const pmRate = revenue > 0 ? Math.round((pmCommission / revenue) * 100) : 0;
        const isPaid = statement.payoutStatus === 'paid';
        const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt #${statementId} - Luxury Lodging PM</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;background:#f6f9fc;color:#1a1a1a;padding:40px 20px;-webkit-font-smoothing:antialiased}
  .receipt{max-width:480px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 0 0 1px rgba(0,0,0,0.05),0 2px 8px rgba(0,0,0,0.06),0 8px 24px rgba(0,0,0,0.04);overflow:hidden}
  .inner{padding:40px 48px}
  .brand-header{display:flex;align-items:center;gap:10px;padding-bottom:28px;border-bottom:1px solid #e6ebf1}
  .brand-logo{width:36px;height:36px;background:linear-gradient(135deg,#0a2540,#1a3a5c);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .brand-logo span{color:#fff;font-size:15px;font-weight:700;letter-spacing:-0.5px}
  .brand-name{font-size:14px;font-weight:600;color:#0a2540}
  .brand-label{font-size:12px;color:#8898aa}
  .status-amount{text-align:center;padding:32px 0;border-bottom:1px solid #e6ebf1}
  .paid-badge{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:#1ea672;margin-bottom:12px}
  .paid-badge svg{width:24px;height:24px}
  .paid-text{font-size:15px;font-weight:600;color:#1ea672;margin-bottom:16px}
  .amount{font-size:48px;font-weight:600;color:#0a2540;letter-spacing:-1px;line-height:1;margin-bottom:6px}
  .amount-date{font-size:13px;color:#8898aa}
  .summary{padding:24px 0;border-bottom:1px solid #e6ebf1}
  .section-title{font-size:12px;font-weight:600;color:#3c4257;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px}
  .line-item{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}
  .line-item .desc{color:#697386}
  .line-item .amt{color:#0a2540;font-weight:500}
  .line-item.total{border-top:1px solid #e6ebf1;margin-top:8px;padding-top:12px}
  .line-item.total .desc{color:#0a2540;font-weight:600}
  .line-item.total .amt{font-weight:600;color:#1ea672}
  .details{padding:24px 0;border-bottom:1px solid #e6ebf1}
  .detail-row{display:flex;justify-content:space-between;padding:5px 0;font-size:14px}
  .detail-row .label{color:#697386}
  .detail-row .value{color:#0a2540;font-weight:500}
  .fee-note{font-size:11px;color:#8898aa;margin-top:10px;padding:8px 12px;background:#f6f9fc;border-radius:6px;line-height:1.5}
  .footer{padding:24px 0 0;text-align:center}
  .footer p{font-size:12px;color:#8898aa;line-height:1.6}
  .footer a{color:#556cd6;text-decoration:none}
  .footer-divider{border:none;border-top:1px solid #e6ebf1;margin:20px 0 0}
  .footer-brand{padding:16px 0 0;font-size:11px;color:#c1c9d2;text-align:center}
  .actions{display:flex;gap:12px;padding:24px 0 0;border-top:1px solid #e6ebf1;margin-top:24px}
  .btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:background 0.15s}
  .btn-primary{background:#0a2540;color:#fff}
  .btn-primary:hover{background:#0d3050}
  .btn-secondary{background:#fff;color:#0a2540;border:1px solid #e6ebf1}
  .btn-secondary:hover{background:#f6f9fc}
  .btn svg{width:16px;height:16px}
  @media print{body{background:#fff;padding:0}.receipt{box-shadow:none;border:none}.actions{display:none!important}}
  @media(max-width:520px){body{padding:24px 16px}.inner{padding:28px 24px}.amount{font-size:38px}}
</style>
</head>
<body>
<div class="receipt">
  <div class="inner">
    <div class="brand-header">
      <div class="brand-logo"><span>LL</span></div>
      <div>
        <div class="brand-name">Luxury Lodging PM</div>
        <div class="brand-label">Payout Receipt</div>
      </div>
    </div>
    <div class="status-amount">
      <div class="paid-badge">
        <svg fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <div class="paid-text">${isPaid ? 'Payment Sent' : 'Collected'}</div>
      <div class="amount">$${fmt(payoutAmount)}</div>
      <div class="amount-date">Paid on ${paidDate}</div>
    </div>
    <div class="summary">
      <div class="section-title">Payment Summary</div>
      <div class="line-item"><span class="desc">Revenue</span><span class="amt">$${fmt(revenue)}</span></div>
      <div class="line-item"><span class="desc">PM Commission${pmRate ? ' (' + pmRate + '%)' : ''}</span><span class="amt">-$${fmt(pmCommission)}</span></div>
      <div class="line-item"><span class="desc">Expenses</span><span class="amt">-$${fmt(expenses)}</span></div>
      <div class="line-item total"><span class="desc">Owner Payout</span><span class="amt">$${fmt(payoutAmount)}</span></div>
    </div>
    <div class="details">
      <div class="section-title">Statement Details</div>
      <div class="detail-row"><span class="label">Statement</span><span class="value">#${statementId}</span></div>
      <div class="detail-row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="detail-row"><span class="label">Owner</span><span class="value">${ownerName}</span></div>
      <div class="detail-row"><span class="label">Period</span><span class="value">${periodStart} – ${periodEnd}</span></div>
    </div>
    <div class="details" style="border-bottom:none;padding-bottom:0">
      <div class="section-title">Payment Method</div>
      <div class="detail-row"><span class="label">Method</span><span class="value">Increase (ACH Transfer)</span></div>
      <div class="detail-row"><span class="label">Transfer ID</span><span class="value">${transferId}</span></div>
      <div class="detail-row"><span class="label">Transfer fee</span><span class="value">$${fmt(wiseFee)}</span></div>
      <div class="detail-row"><span class="label">Total debited</span><span class="value">$${fmt(totalAmount)}</span></div>
      <div class="fee-note">The transfer fee ($${fmt(wiseFee)}) is charged for processing the ACH bank transfer. Total debited = Owner Payout + Transfer fee.</div>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" onclick="window.print()">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
        Print
      </button>
      <button class="btn btn-primary" onclick="downloadPDF()">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Download PDF
      </button>
    </div>
    <div class="footer">
      <p>Questions about this payout? Contact<br><a href="mailto:statements@luxurylodgingpm.com">statements@luxurylodgingpm.com</a></p>
      <hr class="footer-divider">
      <div class="footer-brand">Luxury Lodging PM</div>
    </div>
  </div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
<script>
async function downloadPDF(){
  var btn=document.querySelector('.btn-primary');
  var orig=btn.innerHTML;
  btn.innerHTML='Generating...';btn.disabled=true;
  try{
    var el=document.querySelector('.receipt');
    var actions=document.querySelector('.actions');
    actions.style.display='none';
    var canvas=await html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#ffffff'});
    actions.style.display='';
    var jsPDF=window.jspdf.jsPDF;
    var imgW=190;
    var imgH=(canvas.height*imgW)/canvas.width;
    var pdf=new jsPDF('p','mm','a4');
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',10,10,imgW,imgH);
    pdf.save('${pdfFilename}.pdf');
  }catch(e){console.error(e);window.print();}
  btn.innerHTML=orig;btn.disabled=false;
}
<\/script>
</body></html>`;

        res.set('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        if (err.name === 'TokenExpiredError') return res.status(401).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Link Expired</h2><p>This receipt link has expired. Please open it again from the app.</p></body></html>');
        return res.status(401).json({ error: 'Invalid token' });
    }
});

// Token generator for receipts (authenticated)
app.get('/api/payouts/statements/:id/receipt-token', authenticate, (req, res) => {
    try {
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('./middleware/auth');
        const token = jwt.sign(
            { purpose: 'receipt', statementId: req.params.id },
            JWT_SECRET,
            { expiresIn: '10m' }
        );
        res.json({ token });
    } catch (err) {
        console.error('Receipt token error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.use('/api/payouts', authenticate, require('./routes/payouts'));

// Queued payout processor - checks every 5 minutes for queued payouts when balance is sufficient
const startQueuedPayoutChecker = () => {
    const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
    setInterval(async () => {
        try {
            const { processQueuedPayouts } = require('./routes/payouts');
            const { Statement } = require('./models');
            const queuedCount = await Statement.count({ where: { payoutStatus: 'queued' } });
            if (queuedCount === 0) return;

            logger.info(`[QueuedPayoutChecker] ${queuedCount} queued payouts found, attempting to process...`);
            const result = await processQueuedPayouts();
            if (result.processed > 0 || result.failed > 0) {
                logger.info('[QueuedPayoutChecker] Processing complete', result);
            }
        } catch (err) {
            logger.error('[QueuedPayoutChecker] Error', { error: err.message });
        }
    }, CHECK_INTERVAL);
    logger.info('Queued payout checker started - checking every 5 minutes');
};
startQueuedPayoutChecker();

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
