const express = require('express');
const router = express.Router();
const { ActivityLog } = require('../models');
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

        res.json({
            success: true,
            logs,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching activity logs:', error);
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
        console.error('Error fetching filter options:', error);
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
        console.error('Error fetching activity stats:', error);
        res.status(500).json({ error: 'Failed to fetch activity stats' });
    }
});

module.exports = router;
