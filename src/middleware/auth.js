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

// JWT Secret - use environment variable or generate a secure default
const JWT_SECRET = process.env.JWT_SECRET || 'luxury-lodging-pm-jwt-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Load legacy authentication config for backward compatibility
let legacyAuthConfig;
try {
    legacyAuthConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/auth.json'), 'utf8'));
} catch (error) {
    console.warn('[Auth] Could not load legacy auth config, using defaults');
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
 * Parse Bearer token from Authorization header or query parameter
 * Query parameter is used for browser-based PDF viewing where headers can't be set
 */
function parseBearerToken(req) {
    // First try Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }

    // Fall back to query parameter (for PDF viewing in browser)
    if (req.query.token) {
        return req.query.token;
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
        console.warn('[Auth] Database auth check failed:', error.message);
    }

    // Fall back to legacy config users (backward compatibility)
    if (legacyAuthConfig.users[username] && legacyAuthConfig.users[username] === password) {
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
 * Main authentication middleware
 * Supports both JWT (Bearer) and Basic Auth (for backward compatibility)
 */
async function authenticate(req, res, next) {
    // Try JWT first
    const token = parseBearerToken(req);
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
            return next();
        }
        return res.status(401).json({ error: 'Invalid or expired token' });
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
    parseBasicAuth,
    parseBearerToken,
    authenticateUser,
    generateToken,
    verifyToken,
    permissions,
    JWT_SECRET
};
