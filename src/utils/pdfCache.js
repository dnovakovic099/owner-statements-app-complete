/**
 * In-memory PDF cache with TTL (time-to-live).
 *
 * Key format: `statement_${statementId}_${updatedAt}`
 *   - Edits change updatedAt, so stale entries are never served.
 *
 * Limits:
 *   - Max 100 entries (LRU-style eviction of oldest entry when full)
 *   - 1-hour TTL per entry
 *   - Cleanup sweep every 10 minutes
 */

const logger = require('./logger');

const TTL_MS = 3600000;          // 1 hour
const MAX_ENTRIES = 100;
const CLEANUP_INTERVAL_MS = 600000; // 10 minutes

// Internal store: key -> { buffer, generatedAt }
const cache = new Map();

/**
 * Build the cache key for a statement.
 */
function buildKey(statementId, updatedAt) {
    return `statement_${statementId}_${updatedAt}`;
}

/**
 * Return a cached PDF buffer, or null if not found / expired.
 */
function get(statementId, updatedAt) {
    const key = buildKey(statementId, updatedAt);
    const entry = cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.generatedAt.getTime() > TTL_MS) {
        cache.delete(key);
        return null;
    }

    return entry.buffer;
}

/**
 * Store a generated PDF buffer in the cache.
 */
function set(statementId, updatedAt, buffer) {
    const key = buildKey(statementId, updatedAt);

    // Evict oldest entry when the cache is full
    if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }

    cache.set(key, {
        buffer,
        generatedAt: new Date()
    });
}

/**
 * Remove all cached entries for a given statement (any updatedAt).
 */
function invalidate(statementId) {
    const prefix = `statement_${statementId}_`;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
}

/**
 * Return basic cache statistics.
 */
function getStats() {
    return {
        size: cache.size,
        maxEntries: MAX_ENTRIES,
        ttlMs: TTL_MS
    };
}

/**
 * Remove all expired entries.
 */
function cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of cache.entries()) {
        if (now - entry.generatedAt.getTime() > TTL_MS) {
            cache.delete(key);
            removed++;
        }
    }
    if (removed > 0) {
        logger.info(`PDF cache cleanup: removed ${removed} expired entries, ${cache.size} remaining`, {
            context: 'PdfCache'
        });
    }
}

// Periodic cleanup (unref so it doesn't keep the process alive)
const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
if (cleanupTimer.unref) {
    cleanupTimer.unref();
}

module.exports = { get, set, invalidate, getStats };
