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
 * Public payout setup rate limiter.
 * 10 requests per 15 minutes per IP — public-facing endpoints need tight limits.
 */
const payoutSetupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many payout setup requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

module.exports = { authLimiter, apiLimiter, payoutLimiter, payoutSetupLimiter };
