const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for authentication endpoints (login, verify, refresh, invite).
 * Strict limit: 5 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

/**
 * General API rate limiter.
 * 1000 requests per 15 minutes per IP.
 * Dashboard loads ~19 calls per page, so needs headroom for normal use.
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

/**
 * Payout operation rate limiter.
 * 30 requests per 15 minutes per IP — financial operations should be controlled.
 */
const payoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    message: { error: 'Too many payout requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

/**
 * Public payout-setup PAGE loads (GET /payout-setup/:token).
 * Loading/refreshing the owner invite page is cheap and safe — an invalid token
 * just 404s — so allow generous refreshes. A tight limit here only locks a
 * legitimate owner out of their own setup page (and, because express-rate-limit
 * replies with the JSON `message`, shows them a raw-JSON error), which is exactly
 * the failure we saw. 100 per 15 minutes per IP.
 */
const payoutSetupPageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many payout setup requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

/**
 * Public payout-setup SUBMISSIONS (POST /api/payouts/setup/:token).
 * This creates an Increase external account, so keep a firm cap — but
 * `skipFailedRequests` means validation errors (400s) don't count, so an owner
 * fixing a mistyped routing/account number and resubmitting is never locked out.
 * Only accepted submissions count. 30 per 15 minutes per IP.
 */
const payoutSetupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    message: { error: 'Too many payout setup requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    skipFailedRequests: true,
});

module.exports = { authLimiter, apiLimiter, payoutLimiter, payoutSetupLimiter, payoutSetupPageLimiter };
