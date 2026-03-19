const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const ScheduledReportService = require('../services/ScheduledReportService');

// Middleware to check if user is admin or system
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== 'admin' && req.user.role !== 'system') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

/**
 * POST /api/reports/send-summary
 *
 * Send an analytics summary report via email.
 * Admin only.
 *
 * Body: { recipientEmail, startDate, endDate }
 */
router.post('/send-summary', requireAdmin, async (req, res) => {
    try {
        const { recipientEmail, startDate, endDate } = req.body;

        if (!recipientEmail || !startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'recipientEmail, startDate, and endDate are required',
            });
        }

        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        // Basic date validation (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format',
            });
        }

        const result = await ScheduledReportService.sendReport(recipientEmail, startDate, endDate);
        res.json(result);
    } catch (error) {
        logger.error('Failed to send summary report', { error: error.message });
        res.status(500).json({ error: 'Failed to send summary report' });
    }
});

/**
 * GET /api/reports/preview
 *
 * Preview the analytics summary data without sending an email.
 * Admin only.
 *
 * Query params: startDate, endDate (YYYY-MM-DD)
 */
router.get('/preview', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required',
            });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format',
            });
        }

        const summary = await ScheduledReportService.generateSummary(startDate, endDate);
        res.json(summary);
    } catch (error) {
        logger.error('Failed to generate summary preview', { error: error.message });
        res.status(500).json({ error: 'Failed to generate summary preview' });
    }
});

module.exports = router;
