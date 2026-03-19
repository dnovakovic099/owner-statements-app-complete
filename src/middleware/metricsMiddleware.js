/**
 * Express middleware that captures per-request timing and feeds it
 * into the in-memory MetricsCollector.
 *
 * Designed to add <1 ms overhead — it only grabs a high-resolution
 * timestamp on entry and on response finish, then fires a synchronous
 * call to metrics.recordRequest().
 */

'use strict';

const metrics = require('../utils/metrics');

// ---------------------------------------------------------------------------
// Path normalizer — collapses numeric / UUID segments to `:id` so that
// e.g. /api/statements/42 and /api/statements/99 roll up together.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePath(raw) {
    // Strip query string
    const qIdx = raw.indexOf('?');
    const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw;

    return pathname
        .split('/')
        .map(segment => {
            if (segment === '') return segment;
            // Pure numeric IDs
            if (/^\d+$/.test(segment)) return ':id';
            // UUIDs
            if (UUID_RE.test(segment)) return ':id';
            return segment;
        })
        .join('/');
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function metricsMiddleware(req, res, next) {
    const start = process.hrtime.bigint();

    // Track active connections
    metrics.connectionOpened();

    // Monkey-patch res.end so we can capture the moment the response
    // is actually flushed, regardless of whether it goes through
    // res.json(), res.send(), res.sendFile(), etc.
    const originalEnd = res.end;

    res.end = function patchedEnd(...args) {
        // Restore original immediately to avoid double-patching
        res.end = originalEnd;

        const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ns → ms
        const durationMs = Math.round(elapsed * 100) / 100;
        const normalizedPath = normalizePath(req.originalUrl || req.url);

        metrics.recordRequest(req.method, normalizedPath, res.statusCode, durationMs);

        // Record errors (4xx/5xx)
        if (res.statusCode >= 400) {
            const errorType = res.statusCode >= 500 ? 'ServerError' : 'ClientError';
            metrics.recordError(normalizedPath, `${res.statusCode}_${errorType}`);
        }

        metrics.connectionClosed();

        return originalEnd.apply(res, args);
    };

    next();
}

module.exports = metricsMiddleware;
