/**
 * Structured Logger Utility
 *
 * Provides consistent, structured logging across the application.
 * Uses Winston for log management with different transports based on environment.
 *
 * In production, error and warn logs are persisted to the database (app_logs table)
 * so they survive Railway redeploys. Writes are batched every 10 seconds to minimize
 * DB overhead. Logs older than 30 days are auto-cleaned on startup.
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
const Transport = require('winston-transport');
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

// ============================================================
// Database Transport - persists error/warn logs to app_logs table
// ============================================================
class DatabaseTransport extends Transport {
    constructor(opts = {}) {
        super(opts);
        this.level = 'warn'; // Only capture error and warn
        this.buffer = [];
        this.flushInterval = opts.flushInterval || 10000; // 10 seconds
        this.maxBufferSize = opts.maxBufferSize || 200;
        this.dbReady = false;
        this.AppLog = null;
        this._flushTimer = null;
        this._startFlushing();
    }

    /**
     * Called by Winston for each log entry at or below our level threshold.
     */
    log(info, callback) {
        const { level: logLevel, message, timestamp, ...meta } = info;

        // Only persist error and warn
        if (logLevel !== 'error' && logLevel !== 'warn') {
            callback();
            return;
        }

        // Extract context from meta if present
        const context = meta.context || null;
        // Remove context from metadata to avoid duplication
        const metadata = { ...meta };
        delete metadata.context;

        this.buffer.push({
            level: logLevel,
            message: typeof message === 'string' ? message.substring(0, 5000) : String(message),
            context: context ? String(context).substring(0, 100) : null,
            metadata: Object.keys(metadata).length > 0 ? metadata : null,
            timestamp: timestamp || new Date()
        });

        // Flush immediately if buffer is getting large
        if (this.buffer.length >= this.maxBufferSize) {
            this._flush();
        }

        callback();
    }

    /**
     * Connect to the database model. Called once the DB is ready.
     */
    setModel(AppLog) {
        this.AppLog = AppLog;
        this.dbReady = true;
        // Flush any buffered logs
        this._flush();
    }

    _startFlushing() {
        this._flushTimer = setInterval(() => {
            this._flush();
        }, this.flushInterval);

        // Don't let this timer prevent process exit
        if (this._flushTimer.unref) {
            this._flushTimer.unref();
        }
    }

    async _flush() {
        if (!this.dbReady || !this.AppLog || this.buffer.length === 0) {
            return;
        }

        // Swap buffer so new logs don't interfere
        const toFlush = this.buffer;
        this.buffer = [];

        try {
            await this.AppLog.bulkCreate(toFlush);
        } catch (err) {
            // Put logs back in buffer to retry later, but cap size to prevent memory issues
            this.buffer = [...toFlush.slice(-50), ...this.buffer].slice(0, this.maxBufferSize);
            // Log to console only to avoid infinite recursion
            console.error('[DatabaseTransport] Failed to flush logs to DB:', err.message);
        }
    }

    /**
     * Flush remaining logs on close.
     */
    async close() {
        if (this._flushTimer) {
            clearInterval(this._flushTimer);
        }
        await this._flush();
    }
}

// ============================================================
// Auto-cleanup: delete logs older than 30 days
// ============================================================
async function cleanupOldLogs(AppLog) {
    try {
        const { Op } = require('sequelize');
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const deleted = await AppLog.destroy({
            where: {
                timestamp: { [Op.lt]: thirtyDaysAgo }
            }
        });
        if (deleted > 0) {
            console.log(`[Logger] Cleaned up ${deleted} log entries older than 30 days`);
        }
    } catch (err) {
        console.error('[Logger] Failed to cleanup old logs:', err.message);
    }
}

// ============================================================
// Build transports
// ============================================================
const dbTransport = new DatabaseTransport();

const transports = [
    // Console transport - always enabled
    new winston.transports.Console({
        format: consoleFormat,
    }),
    // Database transport - always added, but only writes once DB is ready
    dbTransport,
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

// ============================================================
// Initialize DB transport once database is ready
// ============================================================
logger.initDbTransport = async function () {
    try {
        const AppLog = require('../models/AppLog');
        dbTransport.setModel(AppLog);
        // Run cleanup on startup
        await cleanupOldLogs(AppLog);
        console.log('[Logger] Database transport initialized');
    } catch (err) {
        console.error('[Logger] Failed to initialize DB transport:', err.message);
    }
};

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

    // Also send to Sentry if configured
    const monitoring = require('./monitoring');
    monitoring.captureException(error, context);
};

logger.logDuration = (operation, startTime, meta = {}) => {
    const duration = Date.now() - startTime;
    logger.info(`${operation} completed`, { ...meta, durationMs: duration });
};

module.exports = logger;
