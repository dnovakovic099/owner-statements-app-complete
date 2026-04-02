/**
 * Analytics Events API Routes
 *
 * Lightweight in-memory storage for frontend usage analytics.
 * Events are stored in memory with automatic cleanup of data older than 30 days.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { requireAdmin } = require('../middleware/auth');

// ================================
// In-Memory Storage
// ================================

// Raw events: array of { type, name, metadata, timestamp, sessionId }
const events = [];

// Running totals for efficiency
const pageViewCounts = new Map();   // name -> count
const featureCounts = new Map();    // name -> count
const hourlyBuckets = new Map();    // hour (0-23) -> count
const sessionLastSeen = new Map();  // sessionId -> timestamp (ms)

const MAX_EVENTS_PER_BATCH = 100;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run cleanup every hour

/**
 * Cleanup events older than 30 days.
 * Rebuilds running totals from remaining events.
 */
function cleanupOldEvents() {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const originalLength = events.length;

    // Remove old events
    let i = 0;
    while (i < events.length) {
        const ts = new Date(events[i].timestamp).getTime();
        if (ts < cutoff) {
            events.splice(i, 1);
        } else {
            i++;
        }
    }

    if (events.length < originalLength) {
        // Rebuild running totals from remaining events
        pageViewCounts.clear();
        featureCounts.clear();
        hourlyBuckets.clear();

        for (const event of events) {
            updateRunningTotals(event);
        }

        logger.info(`[AnalyticsEvents] Cleanup removed ${originalLength - events.length} old events, ${events.length} remaining`);
    }

    // Clean up stale sessions (not seen in 24 hours)
    const sessionCutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [sessionId, lastSeen] of sessionLastSeen) {
        if (lastSeen < sessionCutoff) {
            sessionLastSeen.delete(sessionId);
        }
    }
}

/**
 * Update running totals for a single event.
 */
function updateRunningTotals(event) {
    const { type, name, timestamp } = event;

    if (type === 'page_view') {
        pageViewCounts.set(name, (pageViewCounts.get(name) || 0) + 1);
    }

    if (type === 'feature') {
        featureCounts.set(name, (featureCounts.get(name) || 0) + 1);
    }

    // Track hourly distribution
    const hour = new Date(timestamp).getHours();
    hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);

    // Track session activity
    if (event.sessionId) {
        sessionLastSeen.set(event.sessionId, new Date(timestamp).getTime());
    }
}

// Start periodic cleanup
const cleanupTimer = setInterval(cleanupOldEvents, CLEANUP_INTERVAL_MS);
// Allow process to exit without waiting for this timer
if (cleanupTimer.unref) {
    cleanupTimer.unref();
}

// ================================
// Routes
// ================================

/**
 * POST / — Receive batched analytics events from the frontend
 *
 * Body: { events: [{ type, name, metadata, timestamp, sessionId }] }
 * Max 100 events per batch.
 */
router.post('/', (req, res) => {
    try {
        const { events: incoming } = req.body;

        if (!Array.isArray(incoming)) {
            return res.status(400).json({ error: 'events must be an array' });
        }

        if (incoming.length > MAX_EVENTS_PER_BATCH) {
            return res.status(400).json({ error: `Maximum ${MAX_EVENTS_PER_BATCH} events per batch` });
        }

        let accepted = 0;
        for (const event of incoming) {
            // Validate required fields
            if (!event.type || !event.name) {
                continue;
            }

            const normalized = {
                type: String(event.type),
                name: String(event.name),
                metadata: event.metadata || {},
                timestamp: event.timestamp || new Date().toISOString(),
                sessionId: event.sessionId || null,
            };

            events.push(normalized);
            updateRunningTotals(normalized);
            accepted++;
        }

        res.status(200).json({ ok: true, accepted });
    } catch (error) {
        logger.logError(error, { context: 'AnalyticsEvents', action: 'processEvents' });
        res.status(500).json({ error: 'Failed to process events' });
    }
});

/**
 * GET /summary — Admin-only endpoint returning usage summary
 *
 * Returns:
 * - Page view counts (last 24h, 7d, 30d)
 * - Most used features (sorted by count)
 * - Active sessions in last 15 minutes
 * - Peak usage hours
 */
router.get('/summary', requireAdmin, (req, res) => {
    try {
        const now = Date.now();
        const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        const fifteenMinutesAgo = now - 15 * 60 * 1000;

        // Count page views by time window
        let pageViews24h = 0;
        let pageViews7d = 0;
        let pageViews30d = 0;

        for (const event of events) {
            if (event.type !== 'page_view') continue;
            const ts = new Date(event.timestamp).getTime();
            if (ts >= thirtyDaysAgo) {
                pageViews30d++;
                if (ts >= sevenDaysAgo) {
                    pageViews7d++;
                    if (ts >= twentyFourHoursAgo) {
                        pageViews24h++;
                    }
                }
            }
        }

        // Most used features (from running totals, sorted desc)
        const mostUsedFeatures = Array.from(featureCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        // Active sessions in last 15 minutes
        let activeSessions = 0;
        for (const [, lastSeen] of sessionLastSeen) {
            if (lastSeen >= fifteenMinutesAgo) {
                activeSessions++;
            }
        }

        // Peak usage hours (from running totals, sorted by count desc)
        const peakUsageHours = Array.from(hourlyBuckets.entries())
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => b.count - a.count);

        res.json({
            pageViews: {
                last24h: pageViews24h,
                last7d: pageViews7d,
                last30d: pageViews30d,
            },
            mostUsedFeatures,
            activeSessions,
            peakUsageHours,
            totalEventsStored: events.length,
        });
    } catch (error) {
        logger.logError(error, { context: 'AnalyticsEvents', action: 'generateSummary' });
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

module.exports = router;
