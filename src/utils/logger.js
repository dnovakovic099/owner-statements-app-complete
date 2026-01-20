/**
 * Structured Logger Utility
 *
 * Provides consistent, structured logging across the application.
 * Uses Winston for log management with different transports based on environment.
 *
 * Usage:
 *   const logger = require('../utils/logger');
 *
 *   logger.info('User logged in', { userId: 123 });
 *   logger.error('Failed to process', { error: err.message, stack: err.stack });
 *   logger.warn('Deprecated API called', { endpoint: '/old-api' });
 *   logger.debug('Processing items', { count: items.length });
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Determine log level based on environment
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    return env === 'development' ? 'debug' : 'info';
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
};

winston.addColors(colors);

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
);

// JSON format for file output (production)
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Define transports
const transports = [
    // Console transport - always enabled
    new winston.transports.Console({
        format: consoleFormat,
    }),
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
    const logsDir = path.join(__dirname, '../../logs');

    transports.push(
        // Error log file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Combined log file
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    );
}

// Create the logger
const logger = winston.createLogger({
    level: level(),
    levels,
    transports,
    // Don't exit on handled exceptions
    exitOnError: false,
});

// Add helper methods for common logging patterns
logger.logRequest = (req, message = 'Request received') => {
    logger.http(message, {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
    });
};

logger.logError = (error, context = {}) => {
    logger.error(error.message, {
        ...context,
        stack: error.stack,
        name: error.name,
    });
};

logger.logDuration = (operation, startTime, meta = {}) => {
    const duration = Date.now() - startTime;
    logger.info(`${operation} completed`, { ...meta, durationMs: duration });
};

module.exports = logger;
