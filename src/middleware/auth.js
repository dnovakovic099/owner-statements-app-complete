/**
 * Authentication and Authorization Middleware with JWT
 *
 * Provides role-based access control:
 * - Admin: Full access to everything including user management
 * - Editor: Can create, edit, send statements, manage listings
 * - Viewer: Read-only access to statements and listings
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// JWT Secret. The dev fallback string is checked into the public repo;
// running with it in production would let anyone with the source forge
// admin tokens, so we refuse to start with it (or with no secret at all)
// when NODE_ENV is production.
const DEV_JWT_SECRET = 'luxury-lodging-pm-jwt-secret-key-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET === DEV_JWT_SECRET)) {
    // Fail fast — don't keep accepting forgeable tokens in a live deployment.
    throw new Error('JWT_SECRET must be set to a non-default value in production. Refusing to start.');
}
if (JWT_SECRET === DEV_JWT_SECRET) {
    logger.warn('Using built-in development JWT secret — set JWT_SECRET in your environment for any non-local deployment', { context: 'Auth' });
}

// Load legacy authentication config for backward compatibility
let legacyAuthConfig;
try {
    legacyAuthConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/auth.json'), 'utf8'));
} catch (error) {
    logger.warn('Could not load legacy auth config, using defaults', { context: 'Auth' });
    legacyAuthConfig = {
        users: { 'LL': 'bnb547!' },
        realm: 'Luxury Lodging PM - Owner Statements'
    };
}

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isSystemUser: user.isSystemUser || false
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Parse Bearer token from Authorization header.
 *
 * Tokens are NOT accepted via query parameters here — query strings
 * leak into server access logs, browser history, and Referer headers,
 * any of which would let an observer replay the user's session.
 *
 * Endpoints that genuinely need a query-string token (the receipt page,
 * the SSE /api/events stream — both of which are loaded directly by
 * the browser without auth headers) verify their own purpose-bound
 * tokens manually rather than going through this helper.
 */
function parseBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
}

/**
 * Parse Basic Auth credentials from request (for backward compatibility)
 */
function parseBasicAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return null;
    }

    try {
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
        const [username, password] = credentials.split(':');
        return { username, password };
    } catch {
        return null;
    }
}

/**
 * Authenticate user from credentials (for login)
 * Supports both database users and legacy config users
 */
async function authenticateUser(username, password) {
    // First try database user
    try {
        const dbUser = await User.findOne({
            where: {
                username,
                isActive: true,
                inviteAccepted: true
            }
        });

        if (dbUser) {
            const isValid = await dbUser.verifyPassword(password);
            if (isValid) {
                // Update last login
                dbUser.lastLogin = new Date();
                await dbUser.save();

                return {
                    id: dbUser.id,
                    username: dbUser.username,
                    email: dbUser.email,
                    role: dbUser.role,
                    isSystemUser: dbUser.isSystemUser,
                    source: 'database'
                };
            }
        }
    } catch (error) {
        logger.warn('Database auth check failed', { context: 'Auth', error: error.message });
    }

    // Fall back to legacy config users (backward compatibility)
    if (legacyAuthConfig.users[username] && legacyAuthConfig.users[username] === password) {
        // Check if user exists in database to get their role
        try {
            const dbUser = await User.findOne({ where: { username } });
            if (dbUser) {
                return {
                    id: dbUser.id,
                    username: dbUser.username,
                    email: dbUser.email,
                    role: dbUser.role,
                    isSystemUser: dbUser.isSystemUser,
                    source: 'legacy-with-db'
                };
            }
        } catch (e) {
            // Ignore DB errors, use defaults
        }

        return {
            id: 0,
            username,
            email: null,
            role: 'admin',
            isSystemUser: true,
            source: 'legacy'
        };
    }

    return null;
}

/**
 * Re-validate a JWT subject against the live users table.
 *
 * The JWT alone isn't enough — a fired employee's token stays valid for
 * up to 7 days unless we look the user up. We also rehydrate role/email
 * from the row so a demoted user loses elevated access on their next
 * request, not after their token expires.
 *
 * Returns the live user payload (or null to reject). Cached briefly to
 * avoid a DB hit on every request from the same session.
 *
 * Skips the DB check for `isSystemUser` tokens (the legacy LL admin
 * account, which has id=0 and isn't represented in the users table).
 */
const _userCheckCache = new Map(); // userId → { user, expiresAt }
const USER_CHECK_TTL_MS = 30 * 1000; // 30s — short, so deactivations propagate fast

async function _validateJwtSubject(decoded) {
    if (decoded.isSystemUser) {
        return decoded; // legacy admin — no DB row exists
    }

    const cached = _userCheckCache.get(decoded.id);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.user;
    }

    try {
        const dbUser = await User.findByPk(decoded.id);
        if (!dbUser || !dbUser.isActive || !dbUser.inviteAccepted) {
            _userCheckCache.delete(decoded.id);
            return null;
        }
        // Rehydrate from the live row so role demotions / email changes /
        // isSystemUser flips take effect immediately on next request.
        const user = {
            id: dbUser.id,
            username: dbUser.username,
            email: dbUser.email,
            role: dbUser.role,
            isSystemUser: dbUser.isSystemUser || false,
        };
        _userCheckCache.set(decoded.id, { user, expiresAt: Date.now() + USER_CHECK_TTL_MS });
        return user;
    } catch (e) {
        logger.warn('User lookup failed during auth — denying request', { context: 'Auth', userId: decoded.id, error: e.message });
        return null;
    }
}

/**
 * Main authentication middleware
 * Supports both JWT (Bearer) and Basic Auth (for backward compatibility)
 */
async function authenticate(req, res, next) {
    // Try JWT first
    const token = parseBearerToken(req);
    if (token) {
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        const liveUser = await _validateJwtSubject(decoded);
        if (!liveUser) {
            return res.status(401).json({ error: 'Account is no longer active' });
        }
        req.user = liveUser;
        return next();
    }

    // Fall back to Basic Auth for backward compatibility
    const credentials = parseBasicAuth(req);
    if (credentials) {
        const user = await authenticateUser(credentials.username, credentials.password);
        if (user) {
            req.user = user;
            return next();
        }
    }

    res.status(401).json({ error: 'Authentication required' });
}

/**
 * Role-based authorization middleware factory
 * @param {string[]} allowedRoles - Array of roles that can access the route
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: `This action requires one of these roles: ${allowedRoles.join(', ')}`,
                yourRole: req.user.role
            });
        }

        next();
    };
}

/**
 * Middleware that requires admin role
 */
const requireAdmin = [authenticate, authorize('admin')];

/**
 * Middleware that requires editor or admin role
 */
const requireEditor = [authenticate, authorize('admin', 'editor')];

/**
 * Method-aware role gate — preserves viewer read access while blocking
 * mutations. Lets GET (and HEAD/OPTIONS) flow through for any
 * authenticated user; everything else requires editor or admin.
 *
 * Use at mount level on routers that mix reads and writes (statements,
 * listings, groups, expenses, etc.) so viewers can still browse data
 * but can't hit POST/PUT/DELETE/PATCH.
 */
const editorWrites = (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }
    return authorize('admin', 'editor')(req, res, next);
};

/**
 * Middleware that requires at least viewer role (any authenticated user)
 */
const requireViewer = [authenticate, authorize('admin', 'editor', 'viewer')];

/**
 * Permission helper - check if user can perform action
 */
const permissions = {
    // User management - admin only
    canManageUsers: (user) => user.role === 'admin',

    // Statement operations
    canCreateStatements: (user) => ['admin', 'editor'].includes(user.role),
    canEditStatements: (user) => ['admin', 'editor'].includes(user.role),
    canDeleteStatements: (user) => ['admin', 'editor'].includes(user.role),
    canSendStatements: (user) => ['admin', 'editor'].includes(user.role),
    canViewStatements: (user) => ['admin', 'editor', 'viewer'].includes(user.role),

    // Listing operations
    canEditListings: (user) => ['admin', 'editor'].includes(user.role),
    canViewListings: (user) => ['admin', 'editor', 'viewer'].includes(user.role),

    // Expense operations
    canManageExpenses: (user) => ['admin', 'editor'].includes(user.role),

    // Email operations
    canSendEmails: (user) => ['admin', 'editor'].includes(user.role),
    canViewEmailLogs: (user) => ['admin', 'editor', 'viewer'].includes(user.role),

    // Settings
    canViewSettings: (user) => user.role === 'admin',
    canEditSettings: (user) => user.role === 'admin'
};

module.exports = {
    authenticate,
    authorize,
    requireAdmin,
    requireEditor,
    requireViewer,
    editorWrites,
    parseBasicAuth,
    parseBearerToken,
    authenticateUser,
    generateToken,
    verifyToken,
    permissions,
    JWT_SECRET
};
