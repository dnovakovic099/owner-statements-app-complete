const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for authentication endpoints (login, verify, refresh, invite).
 * Strict limit: 5 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

/**
 * General API rate limiter.
 * 100 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

/**
 * Payout operation rate limiter.
 * 10 requests per 15 minutes per IP — financial operations should be tightly controlled.
 */
const payoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many payout requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

module.exports = { authLimiter, apiLimiter, payoutLimiter };
