const express = require('express');
const router = express.Router();
const { Statement, Listing } = require('../models');
const ListingGroup = require('../models/ListingGroup');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * GET /api/search?q=term&limit=20
 *
 * Searches across statements, listings, and groups.
 * Returns categorized results.
 */
router.get('/', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q || q.length < 2) {
            return res.json({ results: [], total: 0 });
        }

        const searchTerm = `%${q}%`;
        const maxResults = Math.min(parseInt(limit) || 20, 50);

        // Search in parallel
        const [statements, listings, groups] = await Promise.all([
            // Search statements by property name, owner name
            Statement.findAll({
                attributes: ['id', 'propertyName', 'ownerName', 'weekStartDate', 'weekEndDate', 'totalRevenue', 'ownerPayout', 'status', 'calculationType'],
                where: {
                    [Op.or]: [
                        { propertyName: { [Op.iLike]: searchTerm } },
                        { ownerName: { [Op.iLike]: searchTerm } },
                    ],
                },
                order: [['id', 'DESC']],
                limit: maxResults,
                raw: true,
            }),

            // Search listings by name, nickname, owner email
            Listing.findAll({
                attributes: ['id', 'name', 'nickname', 'ownerEmail', 'city', 'state', 'isActive'],
                where: {
                    [Op.or]: [
                        { name: { [Op.iLike]: searchTerm } },
                        { nickname: { [Op.iLike]: searchTerm } },
                        { ownerEmail: { [Op.iLike]: searchTerm } },
                    ],
                },
                order: [['nickname', 'ASC']],
                limit: maxResults,
                raw: true,
            }),

            // Search groups by name
            ListingGroup.findAll({
                attributes: ['id', 'name', 'tags'],
                where: {
                    name: { [Op.iLike]: searchTerm },
                },
                order: [['name', 'ASC']],
                limit: maxResults,
                raw: true,
            }),
        ]);

        const results = [
            ...statements.map(s => ({
                type: 'statement',
                id: s.id,
                title: s.propertyName || `Statement #${s.id}`,
                subtitle: `${s.ownerName || 'Unknown'} • ${s.weekStartDate} to ${s.weekEndDate}`,
                meta: { revenue: s.totalRevenue, payout: s.ownerPayout, status: s.status, calcType: s.calculationType },
            })),
            ...listings.map(l => ({
                type: 'listing',
                id: l.id,
                title: l.nickname || l.name,
                subtitle: [l.city, l.state].filter(Boolean).join(', ') || l.ownerEmail || '',
                meta: { isActive: l.isActive },
            })),
            ...groups.map(g => ({
                type: 'group',
                id: g.id,
                title: g.name,
                subtitle: (g.tags || []).join(', ') || 'No tags',
                meta: {},
            })),
        ];

        res.json({
            results,
            total: results.length,
            counts: {
                statements: statements.length,
                listings: listings.length,
                groups: groups.length,
            },
        });
    } catch (error) {
        logger.logError(error, { context: 'Search', query: req.query.q });
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;
