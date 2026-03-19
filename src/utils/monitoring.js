/**
 * Sentry Error Monitoring Utility
 *
 * Initializes Sentry for error tracking and performance monitoring.
 * Gracefully degrades when SENTRY_DSN is not configured.
 *
 * Usage:
 *   const monitoring = require('./utils/monitoring');
 *   monitoring.captureException(error, { userId: 123 });
 *   monitoring.captureMessage('Something happened', 'warning');
 */

let Sentry = null;
let initialized = false;

function init() {
    const dsn = process.env.SENTRY_DSN;

    if (!dsn) {
        return;
    }

    try {
        Sentry = require('@sentry/node');

        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'development',
            tracesSampleRate: 0.1,
        });

        initialized = true;
    } catch (err) {
        console.error('Failed to initialize Sentry:', err.message);
        Sentry = null;
        initialized = false;
    }
}

// Initialize on module load
init();

/**
 * Check if Sentry is configured and initialized
 * @returns {boolean}
 */
function isConfigured() {
    return initialized && Sentry !== null;
}

/**
 * Capture an exception in Sentry
 * @param {Error} error - The error to capture
 * @param {Object} [context={}] - Additional context to attach
 */
function captureException(error, context = {}) {
    if (!isConfigured()) return;

    Sentry.withScope((scope) => {
        Object.entries(context).forEach(([key, value]) => {
            scope.setExtra(key, value);
        });
        Sentry.captureException(error);
    });
}

/**
 * Capture a message in Sentry
 * @param {string} message - The message to capture
 * @param {'fatal'|'error'|'warning'|'log'|'info'|'debug'} [level='info'] - Severity level
 */
function captureMessage(message, level = 'info') {
    if (!isConfigured()) return;

    Sentry.captureMessage(message, level);
}

/**
 * Get the Sentry request handler middleware for Express.
 * In Sentry v8, this adds request data to the current scope.
 * @returns {Function} Express middleware
 */
function requestHandler() {
    if (!isConfigured()) return (req, res, next) => next();

    // Sentry v8 uses Handlers.requestHandler if available,
    // otherwise provide a middleware that adds request context
    if (Sentry.Handlers && Sentry.Handlers.requestHandler) {
        return Sentry.Handlers.requestHandler();
    }

    // Sentry v8: request instrumentation is automatic via the init,
    // return a no-op middleware
    return (req, res, next) => next();
}

/**
 * Get the Sentry error handler middleware for Express.
 * Must be registered after all routes but before other error handlers.
 * @returns {Function} Express error-handling middleware
 */
function errorHandler() {
    if (!isConfigured()) return (err, req, res, next) => next(err);

    // Sentry v8 provides Handlers.errorHandler
    if (Sentry.Handlers && Sentry.Handlers.errorHandler) {
        return Sentry.Handlers.errorHandler();
    }

    // Fallback: manually capture and pass through
    return (err, req, res, next) => {
        Sentry.captureException(err);
        next(err);
    };
}

module.exports = {
    captureException,
    captureMessage,
    isConfigured,
    requestHandler,
    errorHandler,
};
