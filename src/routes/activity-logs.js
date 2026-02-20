const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { ActivityLog, Statement } = require('../models');
const { Op } = require('sequelize');

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

// Get activity logs (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            action,
            resource,
            userId,
            username,
            startDate,
            endDate
        } = req.query;

        const where = {};

        if (action) {
            where.action = action;
        }
        if (resource) {
            where.resource = resource;
        }
        if (userId) {
            where.userId = userId;
        }
        if (username) {
            where.username = username;
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt[Op.gte] = new Date(startDate);
            }
            if (endDate) {
                // Add 1 day to include the end date
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1);
                where.createdAt[Op.lt] = end;
            }
        }

        const { count, rows: logs } = await ActivityLog.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Enrich statement-related logs with property/group names
        const statementActions = ['CREATE_STATEMENT', 'VIEW_STATEMENT', 'DOWNLOAD_STATEMENT', 'DELETE', 'SEND_EMAIL', 'STATUS_UPDATE', 'AUTO_GENERATE'];
        const enrichedLogs = logs.map(l => l.toJSON());

        // Safely parse details JSON (handles string, object, or invalid JSON)
        const safeParseDetails = (details) => {
            if (!details) return null;
            if (typeof details === 'object') return details;
            try { return JSON.parse(details); } catch { return null; }
        };

        // First pass: normalize propertyName from existing details (groupName, listingName, etc.)
        // Collect statement IDs that still need enrichment from DB
        const statementIdsToLookup = new Set();
        for (const log of enrichedLogs) {
            if (log.resource === 'statement' && log.resourceId && statementActions.includes(log.action)) {
                const details = safeParseDetails(log.details);
                if (details) {
                    // Use groupName or listingName from details if propertyName is missing
                    if (!details.propertyName && (details.groupName || details.listingName)) {
                        details.propertyName = details.groupName || details.listingName;
                        if (!details.period && details.startDate && details.endDate) {
                            details.period = `${details.startDate} to ${details.endDate}`;
                        }
                        log.details = JSON.stringify(details);
                    } else if (!details.propertyName) {
                        statementIdsToLookup.add(parseInt(log.resourceId));
                    }
                } else {
                    statementIdsToLookup.add(parseInt(log.resourceId));
                }
            }
        }

        // Batch-load statements that still need enrichment from DB
        if (statementIdsToLookup.size > 0) {
            try {
                const statements = await Statement.findAll({
                    where: { id: Array.from(statementIdsToLookup) },
                    attributes: ['id', 'propertyName', 'propertyNames', 'groupName', 'weekStartDate', 'weekEndDate']
                });
                const statementMap = new Map(statements.map(s => [s.id, s]));

                for (const log of enrichedLogs) {
                    if (log.resource === 'statement' && log.resourceId && statementIdsToLookup.has(parseInt(log.resourceId))) {
                        const stmt = statementMap.get(parseInt(log.resourceId));
                        if (stmt) {
                            const details = safeParseDetails(log.details) || {};
                            details.propertyName = stmt.groupName || stmt.propertyName || stmt.propertyNames || details.propertyName;
                            if (!details.period && stmt.weekStartDate && stmt.weekEndDate) {
                                details.period = `${stmt.weekStartDate} to ${stmt.weekEndDate}`;
                            }
                            log.details = JSON.stringify(details);
                        }
                    }
                }
            } catch (enrichError) {
                logger.error('Failed to enrich activity logs with statement data', { context: 'ActivityLogs', error: enrichError.message });
            }
        }

        res.json({
            success: true,
            logs: enrichedLogs,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        logger.logError(error, { context: 'ActivityLogs', action: 'fetchLogs' });
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

// Get filter options (unique users and actions)
router.get('/filters', requireAdmin, async (req, res) => {
    try {
        const [users, actions] = await Promise.all([
            ActivityLog.findAll({
                attributes: [[ActivityLog.sequelize.fn('DISTINCT', ActivityLog.sequelize.col('username')), 'username']],
                where: { username: { [Op.ne]: null } },
                order: [['username', 'ASC']]
            }),
            ActivityLog.findAll({
                attributes: [[ActivityLog.sequelize.fn('DISTINCT', ActivityLog.sequelize.col('action')), 'action']],
                order: [['action', 'ASC']]
            })
        ]);

        res.json({
            success: true,
            users: users.map(u => u.username).filter(Boolean),
            actions: actions.map(a => a.action)
        });
    } catch (error) {
        logger.logError(error, { context: 'ActivityLogs', action: 'fetchFilterOptions' });
        res.status(500).json({ error: 'Failed to fetch filter options' });
    }
});

// Get activity stats (admin only)
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [todayCount, totalCount, actionCounts] = await Promise.all([
            ActivityLog.count({
                where: { createdAt: { [Op.gte]: today } }
            }),
            ActivityLog.count(),
            ActivityLog.findAll({
                attributes: [
                    'action',
                    [ActivityLog.sequelize.fn('COUNT', ActivityLog.sequelize.col('action')), 'count']
                ],
                group: ['action'],
                order: [[ActivityLog.sequelize.fn('COUNT', ActivityLog.sequelize.col('action')), 'DESC']],
                limit: 10
            })
        ]);

        res.json({
            success: true,
            stats: {
                today: todayCount,
                total: totalCount,
                byAction: actionCounts.map(a => ({ action: a.action, count: parseInt(a.dataValues.count) }))
            }
        });
    } catch (error) {
        logger.logError(error, { context: 'ActivityLogs', action: 'fetchStats' });
        res.status(500).json({ error: 'Failed to fetch activity stats' });
    }
});

module.exports = router;
