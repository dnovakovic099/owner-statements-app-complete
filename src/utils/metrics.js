/**
 * In-memory application metrics collector.
 *
 * Tracks request latencies, DB query durations, endpoint usage,
 * error counts, and basic system stats. Data is kept in circular
 * buffers so memory usage stays bounded regardless of traffic volume.
 *
 * No external dependencies — pure Node.js.
 */

'use strict';

// ---------------------------------------------------------------------------
// Circular buffer for time-bucketed data
// ---------------------------------------------------------------------------

class CircularBuffer {
    /**
     * @param {number} size      – number of slots
     * @param {number} bucketMs  – duration each slot covers (ms)
     */
    constructor(size, bucketMs) {
        this.size = size;
        this.bucketMs = bucketMs;
        this.slots = new Array(size).fill(null).map(() => this._emptySlot());
        this.currentIndex = 0;
        this.currentBucketStart = this._bucketStart(Date.now());
    }

    _bucketStart(ts) {
        return Math.floor(ts / this.bucketMs) * this.bucketMs;
    }

    _emptySlot() {
        return { count: 0, totalMs: 0, maxMs: 0, values: [] };
    }

    /** Advance the ring if the clock has moved past the current bucket. */
    _advance(now) {
        const newBucket = this._bucketStart(now);
        if (newBucket === this.currentBucketStart) return;

        const elapsed = Math.min(
            Math.floor((newBucket - this.currentBucketStart) / this.bucketMs),
            this.size
        );

        for (let i = 0; i < elapsed; i++) {
            this.currentIndex = (this.currentIndex + 1) % this.size;
            this.slots[this.currentIndex] = this._emptySlot();
        }
        this.currentBucketStart = newBucket;
    }

    /** Record a single duration value. */
    record(durationMs) {
        const now = Date.now();
        this._advance(now);
        const slot = this.slots[this.currentIndex];
        slot.count += 1;
        slot.totalMs += durationMs;
        if (durationMs > slot.maxMs) slot.maxMs = durationMs;
        // Keep individual values for percentile calculation (capped per slot)
        if (slot.values.length < 1000) {
            slot.values.push(durationMs);
        }
    }

    /** Aggregate across all non-empty slots. */
    aggregate() {
        this._advance(Date.now());
        let count = 0;
        let totalMs = 0;
        let maxMs = 0;
        const allValues = [];

        for (const slot of this.slots) {
            count += slot.count;
            totalMs += slot.totalMs;
            if (slot.maxMs > maxMs) maxMs = slot.maxMs;
            for (const v of slot.values) allValues.push(v);
        }

        if (count === 0) {
            return { count: 0, avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
        }

        allValues.sort((a, b) => a - b);
        const p95Idx = Math.min(Math.floor(allValues.length * 0.95), allValues.length - 1);
        const p99Idx = Math.min(Math.floor(allValues.length * 0.99), allValues.length - 1);

        return {
            count,
            avgMs: Math.round((totalMs / count) * 100) / 100,
            p95Ms: allValues[p95Idx] || 0,
            p99Ms: allValues[p99Idx] || 0,
            maxMs,
        };
    }
}

// ---------------------------------------------------------------------------
// Time window definitions
// ---------------------------------------------------------------------------

const TIME_WINDOWS = {
    '1m':  { slots: 6,   bucketMs: 10_000 },    // 6 x 10s = 1 min
    '5m':  { slots: 10,  bucketMs: 30_000 },     // 10 x 30s = 5 min
    '15m': { slots: 15,  bucketMs: 60_000 },     // 15 x 60s = 15 min
    '1h':  { slots: 12,  bucketMs: 300_000 },    // 12 x 5min = 1 hr
    '24h': { slots: 24,  bucketMs: 3_600_000 },  // 24 x 1hr = 24 hr
};

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

class MetricsCollector {
    constructor() {
        this._startTime = Date.now();
        this._activeConnections = 0;

        // Request metrics keyed by "METHOD /normalized/path"
        // Each value: { windows: { '1m': CircularBuffer, ... }, statusCodes: Map<code, count> }
        this._requests = new Map();

        // DB query metrics keyed by "Model.operation"
        // Each value: { windows: { '1m': CircularBuffer, ... } }
        this._dbQueries = new Map();

        // Endpoint hit counts (all-time) keyed by "METHOD /normalized/path"
        this._endpointHits = new Map();

        // Error counts keyed by path → Map<errorType, count>
        this._errorsByRoute = new Map();
        // Error counts keyed by errorType → count
        this._errorsByType = new Map();

        // Global request windows (for overall latency stats)
        this._globalWindows = this._createWindows();
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    _createWindows() {
        const windows = {};
        for (const [name, cfg] of Object.entries(TIME_WINDOWS)) {
            windows[name] = new CircularBuffer(cfg.slots, cfg.bucketMs);
        }
        return windows;
    }

    _getOrCreateRequestEntry(key) {
        if (!this._requests.has(key)) {
            this._requests.set(key, {
                windows: this._createWindows(),
                statusCodes: new Map(),
            });
        }
        return this._requests.get(key);
    }

    _getOrCreateDbEntry(key) {
        if (!this._dbQueries.has(key)) {
            this._dbQueries.set(key, { windows: this._createWindows() });
        }
        return this._dbQueries.get(key);
    }

    // ------------------------------------------------------------------
    // Public recording methods
    // ------------------------------------------------------------------

    /**
     * Record an HTTP request.
     * @param {string} method     – e.g. "GET"
     * @param {string} path       – normalized path, e.g. "/api/statements/:id"
     * @param {number} statusCode – HTTP status
     * @param {number} durationMs – response time in ms
     */
    recordRequest(method, path, statusCode, durationMs) {
        const key = `${method} ${path}`;

        // Per-endpoint
        const entry = this._getOrCreateRequestEntry(key);
        for (const buf of Object.values(entry.windows)) {
            buf.record(durationMs);
        }
        entry.statusCodes.set(statusCode, (entry.statusCodes.get(statusCode) || 0) + 1);

        // Endpoint hit counter (all-time)
        this._endpointHits.set(key, (this._endpointHits.get(key) || 0) + 1);

        // Global
        for (const buf of Object.values(this._globalWindows)) {
            buf.record(durationMs);
        }
    }

    /**
     * Record a database query.
     * @param {string} model     – e.g. "Statement"
     * @param {string} operation – e.g. "findAll"
     * @param {number} durationMs
     */
    recordDbQuery(model, operation, durationMs) {
        const key = `${model}.${operation}`;
        const entry = this._getOrCreateDbEntry(key);
        for (const buf of Object.values(entry.windows)) {
            buf.record(durationMs);
        }
    }

    /**
     * Record an error.
     * @param {string} path      – request path
     * @param {string} errorType – e.g. "ValidationError", "500"
     */
    recordError(path, errorType) {
        // By route
        if (!this._errorsByRoute.has(path)) {
            this._errorsByRoute.set(path, new Map());
        }
        const routeMap = this._errorsByRoute.get(path);
        routeMap.set(errorType, (routeMap.get(errorType) || 0) + 1);

        // By type
        this._errorsByType.set(errorType, (this._errorsByType.get(errorType) || 0) + 1);
    }

    /** Increment active connection count. */
    connectionOpened() {
        this._activeConnections++;
    }

    /** Decrement active connection count. */
    connectionClosed() {
        if (this._activeConnections > 0) this._activeConnections--;
    }

    // ------------------------------------------------------------------
    // Snapshot / Summary
    // ------------------------------------------------------------------

    /**
     * Full metrics snapshot.
     */
    getSnapshot() {
        const requests = {};
        for (const [key, entry] of this._requests) {
            const windows = {};
            for (const [wName, buf] of Object.entries(entry.windows)) {
                windows[wName] = buf.aggregate();
            }
            const statusCodes = {};
            for (const [code, cnt] of entry.statusCodes) {
                statusCodes[code] = cnt;
            }
            requests[key] = { windows, statusCodes };
        }

        const dbQueries = {};
        for (const [key, entry] of this._dbQueries) {
            const windows = {};
            for (const [wName, buf] of Object.entries(entry.windows)) {
                windows[wName] = buf.aggregate();
            }
            dbQueries[key] = windows;
        }

        const endpointUsage = [...this._endpointHits.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([endpoint, hits]) => ({ endpoint, hits }));

        const errorsByRoute = {};
        for (const [route, typeMap] of this._errorsByRoute) {
            errorsByRoute[route] = Object.fromEntries(typeMap);
        }

        const errorsByType = Object.fromEntries(this._errorsByType);

        const globalLatency = {};
        for (const [wName, buf] of Object.entries(this._globalWindows)) {
            globalLatency[wName] = buf.aggregate();
        }

        return {
            system: this._systemStats(),
            globalLatency,
            requests,
            dbQueries,
            endpointUsage,
            errors: { byRoute: errorsByRoute, byType: errorsByType },
        };
    }

    /**
     * Compact summary: top 10 endpoints, error rates, avg latencies.
     */
    getSummary() {
        const topEndpoints = [...this._endpointHits.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([endpoint, hits]) => {
                const entry = this._requests.get(endpoint);
                const latency5m = entry ? entry.windows['5m'].aggregate() : null;
                return {
                    endpoint,
                    hits,
                    avgMs: latency5m ? latency5m.avgMs : 0,
                    p95Ms: latency5m ? latency5m.p95Ms : 0,
                };
            });

        const globalLatency = {};
        for (const [wName, buf] of Object.entries(this._globalWindows)) {
            globalLatency[wName] = buf.aggregate();
        }

        const totalErrors = [...this._errorsByType.values()].reduce((s, c) => s + c, 0);
        const totalRequests = [...this._endpointHits.values()].reduce((s, c) => s + c, 0);

        return {
            system: this._systemStats(),
            globalLatency,
            topEndpoints,
            errorRate: totalRequests > 0
                ? Math.round((totalErrors / totalRequests) * 10000) / 100
                : 0,
            totalRequests,
            totalErrors,
        };
    }

    /** Reset all collected data. */
    reset() {
        this._requests.clear();
        this._dbQueries.clear();
        this._endpointHits.clear();
        this._errorsByRoute.clear();
        this._errorsByType.clear();
        this._globalWindows = this._createWindows();
        this._activeConnections = 0;
        this._startTime = Date.now();
    }

    // ------------------------------------------------------------------
    // Private
    // ------------------------------------------------------------------

    _systemStats() {
        const mem = process.memoryUsage();
        const uptimeMs = Date.now() - this._startTime;
        return {
            uptimeSeconds: Math.floor(uptimeMs / 1000),
            uptimeHuman: this._formatUptime(uptimeMs),
            memoryMB: {
                rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
                external: Math.round(mem.external / 1024 / 1024 * 100) / 100,
            },
            activeConnections: this._activeConnections,
            pid: process.pid,
            nodeVersion: process.version,
        };
    }

    _formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);
        return parts.join(' ');
    }
}

// Export singleton
const metrics = new MetricsCollector();
module.exports = metrics;
module.exports.MetricsCollector = MetricsCollector;
