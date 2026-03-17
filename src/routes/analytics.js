/**
 * Analytics API Routes
 *
 * Provides aggregated analytics data for the Analytics Dashboard.
 * Uses the Statement model with PostgreSQL/Sequelize for efficient queries.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { Statement, Listing, ListingGroup, sequelize } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const FileDataService = require('../services/FileDataService');

/**
 * Cache control middleware for analytics endpoints
 * Sets appropriate cache headers to reduce database load
 */
const setCacheHeaders = (maxAge = 300) => (req, res, next) => {
    // Cache for 5 minutes by default (300 seconds)
    res.set('Cache-Control', `private, max-age=${maxAge}`);
    next();
};

/**
 * Helper: Parse a date string safely
 */
function parseDate(dateStr) {
    if (!dateStr) return null;
    // Validate YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const date = new Date(dateStr + 'T00:00:00');
    return isNaN(date.getTime()) ? null : date;
}

function validateDateRange(req, res) {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        res.status(400).json({ error: 'Missing required parameters', message: 'startDate and endDate are required' });
        return null;
    }
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end) {
        res.status(400).json({ error: 'Invalid date format', message: 'Dates must be in YYYY-MM-DD format' });
        return null;
    }
    if (start > end) {
        res.status(400).json({ error: 'Invalid date range', message: 'startDate must be before or equal to endDate' });
        return null;
    }
    return { start, end, startDate, endDate };
}

/**
 * Helper: Calculate percent change between two values
 */
function calculatePercentChange(current, previous) {
    if (!previous || previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Helper: Get date truncation expression based on granularity
 */
function getDateTruncExpression(granularity) {
    // PostgreSQL DATE_TRUNC function
    switch (granularity) {
        case 'day':
            return literal("DATE_TRUNC('day', week_start_date)");
        case 'week':
            return literal("DATE_TRUNC('week', week_start_date)");
        case 'quarter':
            return literal("DATE_TRUNC('quarter', week_start_date)");
        case 'month':
        default:
            return literal("DATE_TRUNC('month', week_start_date)");
    }
}

/**
 * Helper: Format period label based on granularity
 */
function formatPeriodLabel(date, granularity) {
    const d = new Date(date);
    switch (granularity) {
        case 'day':
            // Format: "Jan 1"
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        case 'week':
            // Format: "Jan 1, 2025"
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        case 'quarter':
            // Format: "Q1 2025"
            const quarter = Math.floor(d.getMonth() / 3) + 1;
            return `Q${quarter} ${d.getFullYear()}`;
        case 'month':
        default:
            // Format: "Jan 2025"
            return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
}

/**
 * GET /api/analytics/summary
 *
 * Returns aggregated summary metrics for a date range with optional comparison period.
 *
 * Query params:
 *   - startDate: Start of current period (YYYY-MM-DD)
 *   - endDate: End of current period (YYYY-MM-DD)
 *   - compareStart: Start of comparison period (optional)
 *   - compareEnd: End of comparison period (optional)
 *
 * Response: {
 *   current: { totalRevenue, ownerPayout, pmCommission, totalExpenses, statementCount },
 *   previous: { ... } (if comparison params provided),
 *   percentChange: { totalRevenue, ownerPayout, pmCommission, totalExpenses, statementCount }
 * }
 */
router.get('/summary', setCacheHeaders(300), async (req, res) => {
    try {
        const { startDate, endDate, compareStart, compareEnd } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Aggregate current period (using overlap logic - statement period overlaps with selected range)
        // Exclude $0 activity statements (where both revenue = 0 AND payout = 0) to match dashboard
        const currentResult = await Statement.findOne({
            attributes: [
                [fn('SUM', col('total_revenue')), 'totalRevenue'],
                [fn('SUM', col('owner_payout')), 'ownerPayout'],
                [fn('SUM', col('pm_commission')), 'pmCommission'],
                [fn('SUM', col('total_expenses')), 'totalExpenses'],
                [fn('SUM', col('tech_fees')), 'techFees'],
                [fn('SUM', col('insurance_fees')), 'insuranceFees'],
                [fn('SUM', col('total_cleaning_fee')), 'totalCleaningFee'],
                [fn('SUM', col('adjustments')), 'adjustments'],
                [fn('COUNT', col('id')), 'statementCount']
            ],
            where: {
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            raw: true
        });

        // Get additional metrics separately
        const negativePayoutResult = await Statement.count({
            where: {
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                ownerPayout: { [Op.lt]: 0 }
            }
        });

        const propertyCountResult = await Statement.count({
            distinct: true,
            col: 'property_id',
            where: {
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            }
        });

        const statementCount = parseInt(currentResult?.statementCount) || 0;
        const ownerPayout = parseFloat(currentResult?.ownerPayout) || 0;

        const current = {
            totalRevenue: parseFloat(currentResult?.totalRevenue) || 0,
            ownerPayout: ownerPayout,
            pmCommission: parseFloat(currentResult?.pmCommission) || 0,
            totalExpenses: parseFloat(currentResult?.totalExpenses) || 0,
            techFees: parseFloat(currentResult?.techFees) || 0,
            insuranceFees: parseFloat(currentResult?.insuranceFees) || 0,
            totalCleaningFee: parseFloat(currentResult?.totalCleaningFee) || 0,
            adjustments: parseFloat(currentResult?.adjustments) || 0,
            statementCount: statementCount,
            negativePayoutCount: negativePayoutResult || 0,
            propertyCount: propertyCountResult || 0,
            avgPayoutPerStatement: statementCount > 0 ? ownerPayout / statementCount : 0
        };

        // Get detailed breakdown from reservations JSON (exclude $0 activity)
        const statementsWithReservations = await Statement.findAll({
            attributes: ['reservations'],
            where: {
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            raw: true
        });

        // Parse reservations to get detailed breakdown
        let baseRate = 0, guestFees = 0, platformFees = 0, taxes = 0, grossPayout = 0;
        let reservationCount = 0;

        for (const stmt of statementsWithReservations) {
            const reservations = stmt.reservations || [];
            reservationCount += reservations.length;
            for (const res of reservations) {
                // baseRate is the accommodation base rate
                baseRate += parseFloat(res.baseRate || res.accommodationTotal || 0);
                // guestFees includes cleaning fee and other guest-paid fees
                guestFees += parseFloat(res.cleaningAndOtherFees || res.cleaningFee || 0);
                // platformFees are the channel/platform fees (Airbnb service fee, etc.)
                platformFees += parseFloat(res.platformFees || res.hostServiceFee || 0);
                // taxes paid by guests
                taxes += parseFloat(res.clientTaxResponsibility || res.taxAmount || res.tax || 0);
                // grossPayout is the client/host payout
                grossPayout += parseFloat(res.clientPayout || res.hostPayoutAmount || 0);
            }
        }

        current.baseRate = baseRate;
        current.guestFees = guestFees;
        current.platformFees = platformFees;
        current.taxes = taxes;
        current.grossPayout = grossPayout;
        current.reservationCount = reservationCount;

        let previous = null;
        let percentChange = {};

        // Aggregate comparison period if provided
        if (compareStart && compareEnd) {
            const compStart = parseDate(compareStart);
            const compEnd = parseDate(compareEnd);

            if (compStart && compEnd) {
                const previousResult = await Statement.findOne({
                    attributes: [
                        [fn('SUM', col('total_revenue')), 'totalRevenue'],
                        [fn('SUM', col('owner_payout')), 'ownerPayout'],
                        [fn('SUM', col('pm_commission')), 'pmCommission'],
                        [fn('SUM', col('total_expenses')), 'totalExpenses'],
                        [fn('SUM', col('tech_fees')), 'techFees'],
                        [fn('SUM', col('insurance_fees')), 'insuranceFees'],
                        [fn('SUM', col('total_cleaning_fee')), 'totalCleaningFee'],
                        [fn('SUM', col('adjustments')), 'adjustments'],
                        [fn('COUNT', col('id')), 'statementCount']
                    ],
                    where: {
                        weekStartDate: { [Op.lte]: compEnd },
                        weekEndDate: { [Op.gte]: compStart },
                        [Op.or]: [
                            { totalRevenue: { [Op.ne]: 0 } },
                            { ownerPayout: { [Op.ne]: 0 } }
                        ]
                    },
                    raw: true
                });

                const prevNegativePayoutResult = await Statement.count({
                    where: {
                        weekStartDate: { [Op.lte]: compEnd },
                        weekEndDate: { [Op.gte]: compStart },
                        ownerPayout: { [Op.lt]: 0 }
                    }
                });

                const prevPropertyCountResult = await Statement.count({
                    distinct: true,
                    col: 'property_id',
                    where: {
                        weekStartDate: { [Op.lte]: compEnd },
                        weekEndDate: { [Op.gte]: compStart },
                        [Op.or]: [
                            { totalRevenue: { [Op.ne]: 0 } },
                            { ownerPayout: { [Op.ne]: 0 } }
                        ]
                    }
                });

                const prevStatementCount = parseInt(previousResult?.statementCount) || 0;
                const prevOwnerPayout = parseFloat(previousResult?.ownerPayout) || 0;

                previous = {
                    totalRevenue: parseFloat(previousResult?.totalRevenue) || 0,
                    ownerPayout: prevOwnerPayout,
                    pmCommission: parseFloat(previousResult?.pmCommission) || 0,
                    totalExpenses: parseFloat(previousResult?.totalExpenses) || 0,
                    techFees: parseFloat(previousResult?.techFees) || 0,
                    insuranceFees: parseFloat(previousResult?.insuranceFees) || 0,
                    totalCleaningFee: parseFloat(previousResult?.totalCleaningFee) || 0,
                    adjustments: parseFloat(previousResult?.adjustments) || 0,
                    statementCount: prevStatementCount,
                    negativePayoutCount: prevNegativePayoutResult || 0,
                    propertyCount: prevPropertyCountResult || 0,
                    avgPayoutPerStatement: prevStatementCount > 0 ? prevOwnerPayout / prevStatementCount : 0
                };

                // Get previous period detailed breakdown (exclude $0 activity)
                const prevStatementsWithReservations = await Statement.findAll({
                    attributes: ['reservations'],
                    where: {
                        weekStartDate: { [Op.lte]: compEnd },
                        weekEndDate: { [Op.gte]: compStart },
                        [Op.or]: [
                            { totalRevenue: { [Op.ne]: 0 } },
                            { ownerPayout: { [Op.ne]: 0 } }
                        ]
                    },
                    raw: true
                });

                let prevBaseRate = 0, prevGuestFees = 0, prevPlatformFees = 0, prevTaxes = 0, prevGrossPayout = 0;
                let prevReservationCount = 0;
                for (const stmt of prevStatementsWithReservations) {
                    const reservations = stmt.reservations || [];
                    prevReservationCount += reservations.length;
                    for (const res of reservations) {
                        prevBaseRate += parseFloat(res.baseRate || res.accommodationTotal || 0);
                        prevGuestFees += parseFloat(res.cleaningAndOtherFees || res.cleaningFee || 0);
                        prevPlatformFees += parseFloat(res.platformFees || res.hostServiceFee || 0);
                        prevTaxes += parseFloat(res.clientTaxResponsibility || res.taxAmount || res.tax || 0);
                        prevGrossPayout += parseFloat(res.clientPayout || res.hostPayoutAmount || 0);
                    }
                }

                previous.baseRate = prevBaseRate;
                previous.guestFees = prevGuestFees;
                previous.platformFees = prevPlatformFees;
                previous.taxes = prevTaxes;
                previous.grossPayout = prevGrossPayout;
                previous.reservationCount = prevReservationCount;

                // Calculate percent changes
                percentChange = {
                    totalRevenue: calculatePercentChange(current.totalRevenue, previous.totalRevenue),
                    ownerPayout: calculatePercentChange(current.ownerPayout, previous.ownerPayout),
                    pmCommission: calculatePercentChange(current.pmCommission, previous.pmCommission),
                    totalExpenses: calculatePercentChange(current.totalExpenses, previous.totalExpenses),
                    techFees: calculatePercentChange(current.techFees, previous.techFees),
                    insuranceFees: calculatePercentChange(current.insuranceFees, previous.insuranceFees),
                    totalCleaningFee: calculatePercentChange(current.totalCleaningFee, previous.totalCleaningFee),
                    baseRate: calculatePercentChange(current.baseRate, previous.baseRate),
                    guestFees: calculatePercentChange(current.guestFees, previous.guestFees),
                    platformFees: calculatePercentChange(current.platformFees, previous.platformFees),
                    taxes: calculatePercentChange(current.taxes, previous.taxes),
                    grossPayout: calculatePercentChange(current.grossPayout, previous.grossPayout),
                    statementCount: calculatePercentChange(current.statementCount, previous.statementCount),
                    reservationCount: calculatePercentChange(current.reservationCount, previous.reservationCount),
                    propertyCount: calculatePercentChange(current.propertyCount, previous.propertyCount),
                    avgPayoutPerStatement: calculatePercentChange(current.avgPayoutPerStatement, previous.avgPayoutPerStatement),
                    negativePayoutCount: calculatePercentChange(current.negativePayoutCount, previous.negativePayoutCount)
                };
            }
        }

        res.json({
            current,
            previous,
            percentChange
        });

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getSummary' });
        res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
});

/**
 * GET /api/analytics/revenue-trend
 *
 * Returns revenue, expenses, and payout trends over time.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *   - granularity: 'week' | 'month' | 'quarter' (default: 'month')
 *
 * Response: [
 *   { period: "Jan 2025", revenue: 10000, expenses: 2000, payout: 8000 },
 *   ...
 * ]
 */
router.get('/revenue-trend', setCacheHeaders(300), async (req, res) => {
    try {
        const { startDate, endDate, granularity = 'month' } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Validate granularity
        const validGranularities = ['day', 'week', 'month', 'quarter'];
        const normalizedGranularity = validGranularities.includes(granularity) ? granularity : 'month';

        // Query with date truncation for grouping (using overlap logic, exclude $0 activity)
        const results = await Statement.findAll({
            attributes: [
                [getDateTruncExpression(normalizedGranularity), 'periodDate'],
                [fn('SUM', col('total_revenue')), 'revenue'],
                [fn('SUM', col('total_expenses')), 'expenses'],
                [fn('SUM', col('owner_payout')), 'payout']
            ],
            where: {
                // Overlap condition
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                // Exclude $0 activity statements
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            group: [literal("DATE_TRUNC('" + normalizedGranularity + "', week_start_date)")],
            order: [[literal("DATE_TRUNC('" + normalizedGranularity + "', week_start_date)"), 'ASC']],
            raw: true
        });

        // Format results
        const trend = results.map(row => ({
            period: formatPeriodLabel(row.periodDate, normalizedGranularity),
            periodDate: row.periodDate,
            revenue: parseFloat(row.revenue) || 0,
            expenses: parseFloat(row.expenses) || 0,
            payout: parseFloat(row.payout) || 0
        }));

        res.json(trend);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getRevenueTrend' });
        res.status(500).json({ error: 'Failed to fetch revenue trend' });
    }
});

/**
 * GET /api/analytics/payout-trend
 *
 * Returns owner payout trends over time.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *   - granularity: 'day' | 'week' | 'month' | 'quarter' (default: 'month')
 *
 * Response: [
 *   { period: "Jan 2025", periodDate: "2025-01-01", payout: 8000 },
 *   ...
 * ]
 */
router.get('/payout-trend', setCacheHeaders(300), async (req, res) => {
    try {
        const { startDate, endDate, granularity = 'month' } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Validate granularity
        const validGranularities = ['day', 'week', 'month', 'quarter'];
        const normalizedGranularity = validGranularities.includes(granularity) ? granularity : 'month';

        // Query with date truncation for grouping (using overlap logic, exclude $0 activity)
        const results = await Statement.findAll({
            attributes: [
                [getDateTruncExpression(normalizedGranularity), 'periodDate'],
                [fn('SUM', col('owner_payout')), 'payout']
            ],
            where: {
                // Overlap condition: statement period overlaps with selected range
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                // Exclude $0 activity statements (where both totalRevenue = 0 AND ownerPayout = 0)
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            group: [literal("DATE_TRUNC('" + normalizedGranularity + "', week_start_date)")],
            order: [[literal("DATE_TRUNC('" + normalizedGranularity + "', week_start_date)"), 'ASC']],
            raw: true
        });

        // Format results
        const trend = results.map(row => ({
            period: formatPeriodLabel(row.periodDate, normalizedGranularity),
            periodDate: row.periodDate,
            payout: parseFloat(row.payout) || 0
        }));

        res.json(trend);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getPayoutTrend' });
        res.status(500).json({ error: 'Failed to fetch payout trend' });
    }
});

/**
 * GET /api/analytics/expense-breakdown
 *
 * Returns expense breakdown by category.
 * Parses the items JSON field from statements, filters for type='expense',
 * and aggregates by category.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *
 * Response: [
 *   { category: "Cleaning", amount: 5000, percentage: 40 },
 *   { category: "Maintenance", amount: 3000, percentage: 24 },
 *   ...
 * ]
 */
router.get('/expense-breakdown', setCacheHeaders(300), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Fetch all statements in the date range (using overlap logic, exclude $0 activity)
        const statements = await Statement.findAll({
            attributes: ['items'],
            where: {
                // Overlap condition
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                // Exclude $0 activity statements
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            raw: true
        });

        // Parse items and aggregate by category
        const categoryTotals = {};

        for (const statement of statements) {
            const items = statement.items || [];

            for (const item of items) {
                // Filter for expense items only
                if (item.type === 'expense' && !item.hidden) {
                    const category = item.category || item.name || 'Other';
                    const amount = parseFloat(item.amount) || 0;

                    if (!categoryTotals[category]) {
                        categoryTotals[category] = 0;
                    }
                    categoryTotals[category] += Math.abs(amount); // Expenses are often negative
                }
            }
        }

        // Calculate total for percentages
        const totalExpenses = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

        // Format response
        const breakdown = Object.entries(categoryTotals)
            .map(([category, amount]) => ({
                category,
                amount: Math.round(amount * 100) / 100,
                percentage: totalExpenses > 0
                    ? Math.round((amount / totalExpenses) * 10000) / 100
                    : 0
            }))
            .sort((a, b) => b.amount - a.amount); // Sort by amount descending

        res.json(breakdown);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getExpenseBreakdown' });
        res.status(500).json({ error: 'Failed to fetch expense breakdown' });
    }
});

/**
 * GET /api/analytics/property-performance
 *
 * Returns performance metrics grouped by property.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *   - sortBy: 'revenue' | 'payout' | 'pmFee' (default: 'revenue')
 *
 * Response: [
 *   { propertyId: 123, name: "Beach House", revenue: 15000, payout: 12000, pmFee: 2250 },
 *   ...
 * ]
 */
router.get('/property-performance', setCacheHeaders(300), async (req, res) => {
    try {
        const { startDate, endDate, sortBy = 'revenue' } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Validate sortBy
        const sortFieldMap = {
            'revenue': 'revenue',
            'payout': 'payout',
            'pmFee': 'pmFee'
        };
        const sortField = sortFieldMap[sortBy] || 'revenue';

        // Aggregate by property (using overlap logic, exclude $0 activity)
        const results = await Statement.findAll({
            attributes: [
                'propertyId',
                'propertyName',
                [fn('SUM', col('total_revenue')), 'revenue'],
                [fn('SUM', col('owner_payout')), 'payout'],
                [fn('SUM', col('pm_commission')), 'pmFee']
            ],
            where: {
                // Overlap condition
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                propertyId: { [Op.ne]: null },
                // Exclude $0 activity statements
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            group: ['propertyId', 'propertyName'],
            raw: true
        });

        // Format and sort results
        let performance = results.map(row => ({
            propertyId: row.propertyId,
            name: row.propertyName || `Property ${row.propertyId}`,
            revenue: parseFloat(row.revenue) || 0,
            payout: parseFloat(row.payout) || 0,
            pmFee: parseFloat(row.pmFee) || 0
        }));

        // Sort by requested field (descending)
        performance.sort((a, b) => b[sortField] - a[sortField]);

        // Enrich with listing data if available
        try {
            const propertyIds = performance.map(p => parseInt(p.propertyId)).filter(id => id && !isNaN(id));
            if (propertyIds.length > 0) {
                const listings = await Listing.findAll({
                    attributes: ['id', 'name', 'displayName', 'nickname', 'pmFeePercentage'],
                    where: {
                        id: { [Op.in]: propertyIds }
                    },
                    raw: true
                });

                // Create map with integer keys
                const listingMap = new Map(listings.map(l => [parseInt(l.id), l]));

                // Get owner names from statements (not on listings table)
                const ownerResults = await Statement.findAll({
                    attributes: [
                        'propertyId',
                        [fn('MAX', col('owner_name')), 'ownerName']
                    ],
                    where: {
                        propertyId: { [Op.in]: propertyIds },
                        ownerName: { [Op.ne]: null }
                    },
                    group: ['propertyId'],
                    raw: true
                });
                const ownerMap = new Map(ownerResults.map(r => [parseInt(r.propertyId), r.ownerName]));

                performance = performance.map(p => {
                    const listing = listingMap.get(parseInt(p.propertyId));
                    const propertyName = listing?.displayName || listing?.nickname || listing?.name || p.name;
                    return {
                        ...p,
                        propertyName: propertyName,
                        name: propertyName,
                        pmFeePercentage: listing?.pmFeePercentage != null ? parseFloat(listing.pmFeePercentage) : null,
                        ownerName: ownerMap.get(parseInt(p.propertyId)) || null,
                    };
                });
            }
        } catch (listingError) {
            // If listing lookup fails, continue with statement data
            logger.warn('Could not enrich with listing names', { context: 'Analytics', error: listingError.message });
        }

        res.json(performance);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getPropertyPerformance' });
        res.status(500).json({ error: 'Failed to fetch property performance' });
    }
});

/**
 * GET /api/analytics/damage-coverage
 *
 * Returns Guest Paid Damage Coverage totals grouped by property.
 * Extracts resortFee from the reservations JSON for statements
 * that have guestPaidDamageCoverage enabled.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 */
router.get('/damage-coverage', setCacheHeaders(300), async (req, res) => {
    try {
        const dates = validateDateRange(req, res);
        if (!dates) return;
        const { start, end, startDate, endDate } = dates;

        // Fetch all statements in date range (resortFee is inside reservations JSON)
        const statements = await Statement.findAll({
            attributes: ['id', 'propertyId', 'propertyName', 'ownerName', 'reservations'],
            where: {
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                propertyId: { [Op.ne]: null },
            },
            raw: true
        });

        // Aggregate resortFee per property from reservations JSON
        // Deduplicate by hostifyId and filter by checkout date within report period
        const propertyMap = new Map();

        for (const stmt of statements) {
            const reservations = typeof stmt.reservations === 'string'
                ? JSON.parse(stmt.reservations)
                : (stmt.reservations || []);

            for (const reservation of reservations) {
                const resortFee = parseFloat(reservation.resortFee) || 0;
                if (resortFee === 0) continue;

                // Determine property ID for this reservation (for combined statements)
                const propId = reservation.propertyId || stmt.propertyId;
                const propName = reservation.propertyName || stmt.propertyName;

                if (!propertyMap.has(propId)) {
                    propertyMap.set(propId, {
                        propertyId: propId,
                        name: propName || `Property ${propId}`,
                        ownerName: stmt.ownerName || null,
                        totalDamageCoverage: 0,
                        reservationCount: 0,
                        _seenIds: new Set(),
                    });
                }
                const entry = propertyMap.get(propId);

                // Deduplicate by hostifyId
                const resId = reservation.hostifyId || reservation.id;
                if (resId && entry._seenIds.has(resId)) continue;

                // Filter by checkout date within report period
                const resCheckout = reservation.checkOutDate || reservation.checkOut || reservation.checkout || reservation.departureDate;
                if (resCheckout) {
                    const coDate = new Date(resCheckout);
                    if (!isNaN(coDate.getTime())) {
                        const y = coDate.getFullYear();
                        const m = String(coDate.getMonth() + 1).padStart(2, '0');
                        const d = String(coDate.getDate()).padStart(2, '0');
                        const coStr = `${y}-${m}-${d}`;
                        if (coStr < startDate || coStr > endDate) continue;
                    }
                }

                if (resId) entry._seenIds.add(resId);
                entry.totalDamageCoverage += resortFee;
                entry.reservationCount += 1;
            }
        }

        // Remove internal tracking sets
        for (const entry of propertyMap.values()) {
            delete entry._seenIds;
        }

        let results = Array.from(propertyMap.values());

        // Enrich with listing display names
        try {
            const propertyIds = results.map(p => parseInt(p.propertyId)).filter(id => id && !isNaN(id));
            if (propertyIds.length > 0) {
                const listings = await Listing.findAll({
                    attributes: ['id', 'name', 'displayName', 'nickname'],
                    where: { id: { [Op.in]: propertyIds } },
                    raw: true
                });
                const listingMap = new Map(listings.map(l => [parseInt(l.id), l]));
                results = results.map(p => {
                    const listing = listingMap.get(parseInt(p.propertyId));
                    return {
                        ...p,
                        name: listing?.displayName || listing?.nickname || listing?.name || p.name,
                    };
                });
            }
        } catch (e) {
            logger.warn('Could not enrich damage coverage with listing names', { error: e.message });
        }

        // Sort by totalDamageCoverage descending
        results.sort((a, b) => b.totalDamageCoverage - a.totalDamageCoverage);

        res.json(results);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getDamageCoverage' });
        res.status(500).json({ error: 'Failed to fetch damage coverage data' });
    }
});

/**
 * GET /api/analytics/property-financials
 *
 * Comprehensive per-property financial breakdown extracted from reservation data.
 * Returns base rate, guest fees, platform fees, taxes, gross payout per property.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 */
router.get('/property-financials', setCacheHeaders(300), async (req, res) => {
    try {
        const dates = validateDateRange(req, res);
        if (!dates) return;
        const { start, end, startDate, endDate } = dates;
        const { ownerId, propertyId, groupId, tag, includeZero } = req.query;

        // Build where clause with optional filters
        const whereClause = {
            weekStartDate: { [Op.lte]: end },
            weekEndDate: { [Op.gte]: start },
            propertyId: { [Op.ne]: null },
        };

        // By default exclude zero-activity statements unless includeZero=true
        if (includeZero !== 'true') {
            whereClause[Op.or] = [
                { totalRevenue: { [Op.ne]: 0 } },
                { ownerPayout: { [Op.ne]: 0 } }
            ];
        }

        // Optional filters
        if (ownerId && ownerId !== 'default') {
            whereClause.ownerId = ownerId;
        }
        if (propertyId) {
            whereClause.propertyId = propertyId;
        }
        if (groupId) {
            whereClause.groupId = groupId;
        }
        if (tag) {
            whereClause.groupTags = { [Op.like]: `%${tag}%` };
        }

        // Fetch statements with reservations in date range
        const statements = await Statement.findAll({
            attributes: ['id', 'propertyId', 'propertyName', 'ownerName', 'reservations',
                         'totalRevenue', 'pmCommission', 'totalExpenses', 'ownerPayout',
                         'weekStartDate', 'weekEndDate', 'createdAt'],
            where: whereClause,
            order: [['createdAt', 'DESC']], // newest first for date-range dedup
            raw: true
        });

        // Group statements by property, then apply date-range deduplication:
        // If multiple statements exist for the same property and their periods overlap
        // (e.g. a Jan stmt + Feb stmt + a combined Jan-Feb stmt), keep only the newest
        // statement(s) that together cover the period without double-counting.
        // A statement is skipped if its [weekStartDate, weekEndDate] is fully contained
        // within an already-selected statement's period.
        const statementsByProperty = new Map();
        for (const stmt of statements) {
            const propId = stmt.propertyId;
            if (!statementsByProperty.has(propId)) statementsByProperty.set(propId, []);
            statementsByProperty.get(propId).push(stmt);
        }

        // For each property select non-overlapping statements (newest wins)
        const selectedStatements = [];
        for (const [, propStmts] of statementsByProperty) {
            const coveredIntervals = []; // list of [start, end] strings already included
            for (const stmt of propStmts) { // already sorted newest-first
                const s = stmt.weekStartDate ? String(stmt.weekStartDate).slice(0, 10) : null;
                const e = stmt.weekEndDate   ? String(stmt.weekEndDate).slice(0, 10)   : null;
                if (s && e) {
                    const alreadyCovered = coveredIntervals.some(([a, b]) => a <= s && b >= e);
                    if (alreadyCovered) continue; // skip — a newer wider statement already covers this
                    coveredIntervals.push([s, e]);
                }
                selectedStatements.push(stmt);
            }
        }

        // Aggregate per property from the deduplicated statement set.
        // Revenue is computed from reservation-level fields (baseRate + guestFees + platformFees)
        // which the statement service already stores as prorated amounts for calendar-based stmts.
        // Reservations are further deduplicated by hostifyId to handle edge cases.
        const propertyMap = new Map();

        for (const stmt of selectedStatements) {
            const propId = stmt.propertyId;
            if (!propertyMap.has(propId)) {
                propertyMap.set(propId, {
                    propertyId: propId,
                    name: stmt.propertyName || `Property ${propId}`,
                    ownerName: stmt.ownerName || null,
                    baseRate: 0,
                    guestFees: 0,
                    platformFees: 0,
                    revenue: 0,
                    pmCommission: 0,
                    taxes: 0,
                    expenses: 0,
                    ownerPayout: 0,
                    reservationCount: 0,
                    statementCount: 0,
                    _seenReservationIds: new Set(),
                });
            }
            const entry = propertyMap.get(propId);
            entry.statementCount += 1;

            // Expenses are statement-level — safe to add directly since we've already
            // deduped overlapping statements above
            entry.expenses += parseFloat(stmt.totalExpenses) || 0;

            // Extract reservations — use stored (prorated) fields, dedup by hostifyId
            const reservations = typeof stmt.reservations === 'string'
                ? JSON.parse(stmt.reservations)
                : (stmt.reservations || []);

            for (const r of reservations) {
                const resId = r.hostifyId || r.id;
                if (resId && entry._seenReservationIds.has(resId)) continue;
                if (resId) entry._seenReservationIds.add(resId);

                const resBaseRate  = parseFloat(r.baseRate || r.accommodationTotal || 0);
                const resGuestFees = parseFloat(r.cleaningAndOtherFees || r.cleaningFee || 0);
                const resPlatform  = parseFloat(r.platformFees || r.hostServiceFee || 0);
                const resTaxes     = parseFloat(r.clientTaxResponsibility || r.taxAmount || r.tax || 0);

                entry.reservationCount += 1;
                entry.baseRate    += resBaseRate;
                entry.guestFees   += resGuestFees;
                entry.platformFees += resPlatform;
                entry.taxes       += resTaxes;
                // Revenue = baseRate + guestFees + platformFees (platformFees is already negative)
                entry.revenue += resBaseRate + resGuestFees + resPlatform;
            }
        }

        // Fetch listing metadata (display name, PM fee percentage) for result enrichment
        const allPropertyIds = Array.from(propertyMap.keys()).map(id => parseInt(id)).filter(id => id && !isNaN(id));
        const listingMap = new Map();
        if (allPropertyIds.length > 0) {
            try {
                const listings = await Listing.findAll({
                    attributes: ['id', 'name', 'displayName', 'nickname', 'pmFeePercentage'],
                    where: { id: { [Op.in]: allPropertyIds } },
                    raw: true
                });
                listings.forEach(l => listingMap.set(parseInt(l.id), l));
            } catch (e) {
                logger.warn('Could not fetch listing PM fees', { error: e.message });
            }
        }

        let results = Array.from(propertyMap.values());

        // Compute pmCommission and ownerPayout from aggregated revenue
        results = results.map(({ _seenReservationIds, ...p }) => {
            const listing = listingMap.get(parseInt(p.propertyId));
            const pmFeeRate = listing?.pmFeePercentage != null ? parseFloat(listing.pmFeePercentage) / 100 : 0;
            const pmCommission = p.revenue * pmFeeRate;
            const ownerPayout = p.revenue - pmCommission - p.expenses;

            return {
                ...p,
                name: listing?.displayName || listing?.nickname || listing?.name || p.name,
                pmFeePercentage: listing?.pmFeePercentage != null ? parseFloat(listing.pmFeePercentage) : null,
                revenue: Math.round(p.revenue * 100) / 100,
                pmCommission: Math.round(pmCommission * 100) / 100,
                ownerPayout: Math.round(ownerPayout * 100) / 100,
                baseRate: Math.round(p.baseRate * 100) / 100,
                guestFees: Math.round(p.guestFees * 100) / 100,
                platformFees: Math.round(p.platformFees * 100) / 100,
                taxes: Math.round(p.taxes * 100) / 100,
                expenses: Math.round(p.expenses * 100) / 100,
            };
        });

        // When includeZero is true, also include listings that have NO statements at all
        if (includeZero === 'true') {
            try {
                const listingWhere = { isActive: true };
                if (ownerId && ownerId !== 'default') {
                    // Filter by owner — match listings whose ownerEmail/ownerGreeting relates to the owner
                    // Since listings don't have ownerId directly, we skip this filter for zero-statement listings
                }
                if (groupId) {
                    listingWhere.groupId = groupId;
                }

                const allListings = await Listing.findAll({
                    attributes: ['id', 'name', 'displayName', 'nickname', 'pmFeePercentage', 'tags'],
                    where: listingWhere,
                    raw: true
                });

                const existingIds = new Set(results.map(r => String(r.propertyId)));
                for (const listing of allListings) {
                    if (existingIds.has(String(listing.id))) continue;
                    // Apply tag filter if specified
                    if (tag) {
                        const listingTags = listing.tags || '';
                        if (!listingTags.toLowerCase().includes(tag.toLowerCase())) continue;
                    }
                    results.push({
                        propertyId: listing.id,
                        name: listing.displayName || listing.nickname || listing.name,
                        ownerName: null,
                        pmFeePercentage: listing.pmFeePercentage != null ? parseFloat(listing.pmFeePercentage) : null,
                        baseRate: 0,
                        guestFees: 0,
                        platformFees: 0,
                        revenue: 0,
                        pmCommission: 0,
                        taxes: 0,
                        grossPayout: 0,
                        expenses: 0,
                        ownerPayout: 0,
                        reservationCount: 0,
                        statementCount: 0,
                    });
                }
            } catch (e) {
                logger.warn('Could not fetch zero-statement listings', { error: e.message });
            }
        }

        // Sort by revenue descending
        results.sort((a, b) => b.revenue - a.revenue);

        res.json(results);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getPropertyFinancials' });
        res.status(500).json({ error: 'Failed to fetch property financials' });
    }
});

/**
 * GET /api/analytics/owner-breakdown
 *
 * Returns revenue and payout breakdown by owner.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *
 * Response: [
 *   { ownerName: "John Smith", totalRevenue: 15000, ownerPayout: 12000, pmCommission: 2250, statementCount: 5 },
 *   ...
 * ]
 */
router.get('/owner-breakdown', setCacheHeaders(300), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Aggregate by owner (using overlap logic, exclude $0 activity)
        const results = await Statement.findAll({
            attributes: [
                'ownerName',
                [fn('SUM', col('total_revenue')), 'totalRevenue'],
                [fn('SUM', col('owner_payout')), 'ownerPayout'],
                [fn('SUM', col('pm_commission')), 'pmCommission'],
                [fn('COUNT', col('id')), 'statementCount']
            ],
            where: {
                // Overlap condition
                weekStartDate: { [Op.lte]: end },
                weekEndDate: { [Op.gte]: start },
                ownerName: { [Op.ne]: null },
                // Exclude $0 activity statements
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            group: ['ownerName'],
            raw: true
        });

        // Format and sort by payout descending
        const ownerBreakdown = results
            .map(row => ({
                ownerName: row.ownerName || 'Unknown Owner',
                totalRevenue: parseFloat(row.totalRevenue) || 0,
                ownerPayout: parseFloat(row.ownerPayout) || 0,
                pmCommission: parseFloat(row.pmCommission) || 0,
                statementCount: parseInt(row.statementCount) || 0
            }))
            .sort((a, b) => b.ownerPayout - a.ownerPayout);

        res.json(ownerBreakdown);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getOwnerBreakdown' });
        res.status(500).json({ error: 'Failed to fetch owner breakdown' });
    }
});

/**
 * GET /api/analytics/statement-status
 *
 * Returns statement count grouped by status.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *
 * Response: [
 *   { status: "sent", count: 45 },
 *   { status: "draft", count: 10 },
 *   ...
 * ]
 */
router.get('/statement-status', setCacheHeaders(300), async (req, res) => {
    try {
        const { startDate, endDate, ownerId, propertyId, tag, groupId } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Build where clause with optional filters
        const whereClause = {
            // Overlap condition
            weekStartDate: { [Op.lte]: end },
            weekEndDate: { [Op.gte]: start },
            // Exclude $0 activity statements
            [Op.or]: [
                { totalRevenue: { [Op.ne]: 0 } },
                { ownerPayout: { [Op.ne]: 0 } }
            ]
        };

        // Add optional filters
        // Skip ownerId filter if it's "default" (special virtual owner, not in database)
        if (ownerId && ownerId !== 'default') {
            whereClause.ownerId = ownerId;
        }
        if (propertyId) {
            whereClause.propertyId = propertyId;
        }
        if (tag) {
            whereClause.groupTags = { [Op.like]: `%${tag}%` };
        }
        if (groupId) {
            whereClause.groupId = groupId;
        }

        // Aggregate by status (using overlap logic, exclude $0 activity)
        const results = await Statement.findAll({
            attributes: [
                'status',
                [fn('COUNT', col('id')), 'count']
            ],
            where: whereClause,
            group: ['status'],
            raw: true
        });

        // Format results
        const statusBreakdown = results.map(row => ({
            status: row.status || 'unknown',
            count: parseInt(row.count) || 0
        }));

        res.json(statusBreakdown);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getStatementStatus' });
        res.status(500).json({ error: 'Failed to fetch statement status' });
    }
});

/**
 * GET /api/analytics/recent-statements
 *
 * Returns the most recent statements (limit 10).
 *
 * Query params:
 *   - startDate: Optional start of date range (YYYY-MM-DD)
 *   - endDate: Optional end of date range (YYYY-MM-DD)
 *   - ownerId: Optional owner ID filter
 *   - propertyId: Optional property ID filter
 *   - tag: Optional tag filter
 *
 * Response: [
 *   { id: 1, propertyName: "Beach House", weekStartDate: "2025-01-01", weekEndDate: "2025-01-07", totalRevenue: 5000, ownerPayout: 4000, status: "sent" },
 *   ...
 * ]
 */
router.get('/recent-statements', async (req, res) => {
    try {
        const { startDate, endDate, ownerId, propertyId, tag, groupId } = req.query;

        // Build where clause with optional filters
        const whereClause = {
            // Exclude $0 activity statements
            [Op.or]: [
                { totalRevenue: { [Op.ne]: 0 } },
                { ownerPayout: { [Op.ne]: 0 } }
            ]
        };

        // Add date range filter if provided
        if (startDate && endDate) {
            const start = parseDate(startDate);
            const end = parseDate(endDate);
            if (start && end) {
                whereClause.weekStartDate = { [Op.lte]: end };
                whereClause.weekEndDate = { [Op.gte]: start };
            }
        }

        // Add optional filters
        // Skip ownerId filter if it's "default" (special virtual owner, not in database)
        if (ownerId && ownerId !== 'default') {
            whereClause.ownerId = ownerId;
        }
        if (propertyId) {
            whereClause.propertyId = propertyId;
        }
        if (tag) {
            whereClause.groupTags = { [Op.like]: `%${tag}%` };
        }
        if (groupId) {
            whereClause.groupId = groupId;
        }

        // Fetch the 10 most recent statements (exclude $0 activity)
        const statements = await Statement.findAll({
            attributes: [
                'id',
                'propertyName',
                'weekStartDate',
                'weekEndDate',
                'totalRevenue',
                'ownerPayout',
                'status'
            ],
            where: whereClause,
            order: [['created_at', 'DESC']],
            limit: 10,
            raw: true
        });

        // Format results
        const recentStatements = statements.map(stmt => ({
            id: stmt.id,
            propertyName: stmt.propertyName || 'Unknown Property',
            weekStartDate: stmt.weekStartDate,
            weekEndDate: stmt.weekEndDate,
            totalRevenue: parseFloat(stmt.totalRevenue) || 0,
            ownerPayout: parseFloat(stmt.ownerPayout) || 0,
            status: stmt.status || 'unknown'
        }));

        res.json(recentStatements);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getRecentStatements' });
        res.status(500).json({ error: 'Failed to fetch recent statements' });
    }
});

/**
 * GET /api/analytics/monthly-comparison
 *
 * Returns monthly comparison data for the last N months.
 *
 * Query params:
 *   - months: Number of months to compare (default: 6)
 *
 * Response: [
 *   { month: "Jan", year: 2025, revenue: 50000, payout: 40000, expenses: 8000, count: 15 },
 *   ...
 * ]
 */
router.get('/monthly-comparison', setCacheHeaders(300), async (req, res) => {
    try {
        const { months = 6 } = req.query;
        const numMonths = parseInt(months) || 6;

        // Calculate date range for the last N months
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - numMonths);

        // Query with monthly grouping (exclude $0 activity)
        const results = await Statement.findAll({
            attributes: [
                [literal("DATE_TRUNC('month', week_start_date)"), 'periodDate'],
                [fn('SUM', col('total_revenue')), 'revenue'],
                [fn('SUM', col('owner_payout')), 'payout'],
                [fn('SUM', col('total_expenses')), 'expenses'],
                [fn('COUNT', col('id')), 'count']
            ],
            where: {
                weekStartDate: { [Op.gte]: startDate },
                weekEndDate: { [Op.lte]: endDate },
                // Exclude $0 activity statements
                [Op.or]: [
                    { totalRevenue: { [Op.ne]: 0 } },
                    { ownerPayout: { [Op.ne]: 0 } }
                ]
            },
            group: [literal("DATE_TRUNC('month', week_start_date)")],
            order: [[literal("DATE_TRUNC('month', week_start_date)"), 'ASC']],
            raw: true
        });

        // Format results
        const comparison = results.map(row => {
            const date = new Date(row.periodDate);
            return {
                month: date.toLocaleDateString('en-US', { month: 'short' }),
                year: date.getFullYear(),
                revenue: parseFloat(row.revenue) || 0,
                payout: parseFloat(row.payout) || 0,
                expenses: parseFloat(row.expenses) || 0,
                count: parseInt(row.count) || 0
            };
        });

        res.json(comparison);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getMonthlyComparison' });
        res.status(500).json({ error: 'Failed to fetch monthly comparison' });
    }
});

/**
 * GET /api/analytics/export
 *
 * Exports all analytics data combined for a date range.
 *
 * Query params:
 *   - startDate: Start date (YYYY-MM-DD)
 *   - endDate: End date (YYYY-MM-DD)
 *   - format: 'csv' | 'json' (default: 'json')
 *
 * Response:
 *   - For JSON: { summary, propertyPerformance, expenseBreakdown, revenueTrend }
 *   - For CSV: downloadable CSV file with all data
 */
router.get('/export', async (req, res) => {
    try {
        const { startDate, endDate, format = 'json' } = req.query;

        // Validate required params
        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'startDate and endDate are required'
            });
        }

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (!start || !end) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Dates must be in YYYY-MM-DD format'
            });
        }

        // Base where clause for all queries (overlap condition, exclude $0 activity)
        const baseWhere = {
            weekStartDate: { [Op.lte]: end },
            weekEndDate: { [Op.gte]: start },
            [Op.or]: [
                { totalRevenue: { [Op.ne]: 0 } },
                { ownerPayout: { [Op.ne]: 0 } }
            ]
        };

        // 1. Summary data
        const summaryResult = await Statement.findOne({
            attributes: [
                [fn('SUM', col('total_revenue')), 'totalRevenue'],
                [fn('SUM', col('owner_payout')), 'ownerPayout'],
                [fn('SUM', col('pm_commission')), 'pmCommission'],
                [fn('SUM', col('total_expenses')), 'totalExpenses'],
                [fn('SUM', col('tech_fees')), 'techFees'],
                [fn('SUM', col('insurance_fees')), 'insuranceFees'],
                [fn('SUM', col('total_cleaning_fee')), 'totalCleaningFee'],
                [fn('SUM', col('adjustments')), 'adjustments'],
                [fn('COUNT', col('id')), 'statementCount']
            ],
            where: baseWhere,
            raw: true
        });

        const summary = {
            totalRevenue: parseFloat(summaryResult?.totalRevenue) || 0,
            ownerPayout: parseFloat(summaryResult?.ownerPayout) || 0,
            pmCommission: parseFloat(summaryResult?.pmCommission) || 0,
            totalExpenses: parseFloat(summaryResult?.totalExpenses) || 0,
            techFees: parseFloat(summaryResult?.techFees) || 0,
            insuranceFees: parseFloat(summaryResult?.insuranceFees) || 0,
            totalCleaningFee: parseFloat(summaryResult?.totalCleaningFee) || 0,
            adjustments: parseFloat(summaryResult?.adjustments) || 0,
            statementCount: parseInt(summaryResult?.statementCount) || 0
        };

        // 2. Property performance data
        const propertyResults = await Statement.findAll({
            attributes: [
                'propertyId',
                'propertyName',
                [fn('SUM', col('total_revenue')), 'revenue'],
                [fn('SUM', col('owner_payout')), 'payout'],
                [fn('SUM', col('pm_commission')), 'pmFee']
            ],
            where: {
                ...baseWhere,
                propertyId: { [Op.ne]: null }
            },
            group: ['propertyId', 'propertyName'],
            raw: true
        });

        let propertyPerformance = propertyResults.map(row => ({
            propertyId: row.propertyId,
            name: row.propertyName || `Property ${row.propertyId}`,
            revenue: parseFloat(row.revenue) || 0,
            payout: parseFloat(row.payout) || 0,
            pmFee: parseFloat(row.pmFee) || 0
        }));

        // Enrich with listing names
        try {
            const propertyIds = propertyPerformance.map(p => parseInt(p.propertyId)).filter(id => id && !isNaN(id));
            if (propertyIds.length > 0) {
                const listings = await Listing.findAll({
                    attributes: ['id', 'name', 'displayName', 'nickname'],
                    where: { id: { [Op.in]: propertyIds } },
                    raw: true
                });
                const listingMap = new Map(listings.map(l => [parseInt(l.id), l]));
                propertyPerformance = propertyPerformance.map(p => {
                    const listing = listingMap.get(parseInt(p.propertyId));
                    return {
                        ...p,
                        name: listing?.displayName || listing?.nickname || listing?.name || p.name
                    };
                });
            }
        } catch (e) {
            logger.warn('Could not enrich with listing names', { context: 'Analytics', error: e.message });
        }

        propertyPerformance.sort((a, b) => b.revenue - a.revenue);

        // 3. Owner breakdown data
        const ownerResults = await Statement.findAll({
            attributes: [
                'ownerName',
                [fn('SUM', col('total_revenue')), 'totalRevenue'],
                [fn('SUM', col('owner_payout')), 'ownerPayout'],
                [fn('SUM', col('pm_commission')), 'pmCommission'],
                [fn('COUNT', col('id')), 'statementCount']
            ],
            where: {
                ...baseWhere,
                ownerName: { [Op.ne]: null }
            },
            group: ['ownerName'],
            raw: true
        });

        const ownerBreakdown = ownerResults
            .map(row => ({
                ownerName: row.ownerName || 'Unknown Owner',
                totalRevenue: parseFloat(row.totalRevenue) || 0,
                ownerPayout: parseFloat(row.ownerPayout) || 0,
                pmCommission: parseFloat(row.pmCommission) || 0,
                statementCount: parseInt(row.statementCount) || 0
            }))
            .sort((a, b) => b.ownerPayout - a.ownerPayout);

        // 4. Expense breakdown
        const expenseStatements = await Statement.findAll({
            attributes: ['items'],
            where: baseWhere,
            raw: true
        });

        const categoryTotals = {};
        for (const statement of expenseStatements) {
            const items = statement.items || [];
            for (const item of items) {
                if (item.type === 'expense' && !item.hidden) {
                    const category = item.category || item.name || 'Other';
                    const amount = parseFloat(item.amount) || 0;
                    categoryTotals[category] = (categoryTotals[category] || 0) + Math.abs(amount);
                }
            }
        }

        const totalExpenses = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
        const expenseBreakdown = Object.entries(categoryTotals)
            .map(([category, amount]) => ({
                category,
                amount: Math.round(amount * 100) / 100,
                percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 10000) / 100 : 0
            }))
            .sort((a, b) => b.amount - a.amount);

        // 5. Monthly revenue trend
        const trendResults = await Statement.findAll({
            attributes: [
                [literal("DATE_TRUNC('month', week_start_date)"), 'periodDate'],
                [fn('SUM', col('total_revenue')), 'revenue'],
                [fn('SUM', col('total_expenses')), 'expenses'],
                [fn('SUM', col('owner_payout')), 'payout']
            ],
            where: baseWhere,
            group: [literal("DATE_TRUNC('month', week_start_date)")],
            order: [[literal("DATE_TRUNC('month', week_start_date)"), 'ASC']],
            raw: true
        });

        const revenueTrend = trendResults.map(row => ({
            period: formatPeriodLabel(row.periodDate, 'month'),
            periodDate: row.periodDate,
            revenue: parseFloat(row.revenue) || 0,
            expenses: parseFloat(row.expenses) || 0,
            payout: parseFloat(row.payout) || 0
        }));

        // Combine all data
        const exportData = {
            dateRange: { startDate, endDate },
            exportedAt: new Date().toISOString(),
            summary,
            propertyPerformance,
            ownerBreakdown,
            expenseBreakdown,
            revenueTrend
        };

        // Return based on format
        if (format === 'csv') {
            // Build CSV content
            let csv = '';

            // Header with date range
            csv += 'Analytics Export\n';
            csv += `Date Range:,${startDate},to,${endDate}\n`;
            csv += `Exported At:,${exportData.exportedAt}\n`;
            csv += '\n';

            // Summary section
            csv += 'SUMMARY\n';
            csv += 'Metric,Value\n';
            csv += `Total Revenue,${summary.totalRevenue.toFixed(2)}\n`;
            csv += `Owner Payout,${summary.ownerPayout.toFixed(2)}\n`;
            csv += `PM Commission,${summary.pmCommission.toFixed(2)}\n`;
            csv += `Total Expenses,${summary.totalExpenses.toFixed(2)}\n`;
            csv += `Tech Fees,${summary.techFees.toFixed(2)}\n`;
            csv += `Insurance Fees,${summary.insuranceFees.toFixed(2)}\n`;
            csv += `Cleaning Fees,${summary.totalCleaningFee.toFixed(2)}\n`;
            csv += `Adjustments,${summary.adjustments.toFixed(2)}\n`;
            csv += `Statement Count,${summary.statementCount}\n`;
            csv += '\n';

            // Property Performance section
            csv += 'PROPERTY PERFORMANCE\n';
            csv += 'Property ID,Property Name,Revenue,Payout,PM Fee\n';
            for (const prop of propertyPerformance) {
                const escapedName = `"${(prop.name || '').replace(/"/g, '""')}"`;
                csv += `${prop.propertyId},${escapedName},${prop.revenue.toFixed(2)},${prop.payout.toFixed(2)},${prop.pmFee.toFixed(2)}\n`;
            }
            csv += '\n';

            // Owner Breakdown section
            csv += 'OWNER BREAKDOWN\n';
            csv += 'Owner Name,Total Revenue,Owner Payout,PM Commission,Statement Count\n';
            for (const owner of ownerBreakdown) {
                const escapedName = `"${(owner.ownerName || '').replace(/"/g, '""')}"`;
                csv += `${escapedName},${owner.totalRevenue.toFixed(2)},${owner.ownerPayout.toFixed(2)},${owner.pmCommission.toFixed(2)},${owner.statementCount}\n`;
            }
            csv += '\n';

            // Expense Breakdown section
            csv += 'EXPENSE BREAKDOWN\n';
            csv += 'Category,Amount,Percentage\n';
            for (const exp of expenseBreakdown) {
                const escapedCategory = `"${(exp.category || '').replace(/"/g, '""')}"`;
                csv += `${escapedCategory},${exp.amount.toFixed(2)},${exp.percentage.toFixed(2)}%\n`;
            }
            csv += '\n';

            // Revenue Trend section
            csv += 'MONTHLY REVENUE TREND\n';
            csv += 'Period,Revenue,Expenses,Payout\n';
            for (const trend of revenueTrend) {
                csv += `${trend.period},${trend.revenue.toFixed(2)},${trend.expenses.toFixed(2)},${trend.payout.toFixed(2)}\n`;
            }

            // Set headers for CSV download
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-export-${startDate}-to-${endDate}.csv"`);
            return res.send(csv);
        }

        // Default: return JSON
        res.json(exportData);

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'exportData' });
        res.status(500).json({ error: 'Failed to export analytics data' });
    }
});

/**
 * GET /api/analytics/filters
 *
 * Returns available filter options for the analytics dashboard.
 *
 * Response: {
 *   owners: [{ id: "...", name: "John Doe" }, ...],
 *   properties: [{ id: 1, name: "Beach House" }, ...],
 *   tags: ["WEEKLY", "BI-WEEKLY_A", "BI-WEEKLY_B", "MONTHLY"]
 * }
 */
router.get('/filters', setCacheHeaders(600), async (req, res) => {
    try {
        // Get properties from Listing model
        const listings = await Listing.findAll({
            attributes: ['id', 'name', 'displayName', 'nickname'],
            order: [['displayName', 'ASC'], ['name', 'ASC']],
            raw: true
        });

        const properties = listings.map(l => ({
            id: l.id,
            name: l.displayName || l.nickname || l.name
        }));

        // Get owners from FileDataService
        // Filter to match the specific owners shown in GenerateModal
        const ownersData = await FileDataService.getOwners();

        // Allowed owner IDs - matching GenerateModal's owner list
        const allowedOwnerIds = new Set([
            'default',
            300004593,  // Darko Novakovic
            300004594,  // Angelica Chua
            300004597,  // Ferdy
            300004599,  // Prasanna KB
        ]);

        const owners = ownersData
            .filter(o => allowedOwnerIds.has(o.id))
            .map(o => ({ id: o.id, name: o.name }))
            .sort((a, b) => {
                // Keep Default at top
                if (a.id === 'default') return -1;
                if (b.id === 'default') return 1;
                return a.name.localeCompare(b.name);
            });

        // Get unique tags from Listings
        const listingsWithTags = await Listing.findAll({
            attributes: ['tags'],
            where: {
                tags: { [Op.ne]: null }
            },
            raw: true
        });

        // Parse and deduplicate tags
        const tagSet = new Set();
        listingsWithTags.forEach(l => {
            if (l.tags) {
                l.tags.split(',').forEach(tag => {
                    const trimmed = tag.trim();
                    if (trimmed) tagSet.add(trimmed);
                });
            }
        });
        const tags = Array.from(tagSet).sort();

        // Get groups from ListingGroup model
        const groupsData = await ListingGroup.findAll({
            attributes: ['id', 'name'],
            order: [['name', 'ASC']],
            raw: true
        });
        const groups = groupsData.map(g => ({ id: g.id, name: g.name }));

        res.json({
            owners,
            properties,
            tags,
            groups
        });

    } catch (error) {
        logger.logError(error, { context: 'Analytics', action: 'getFilters' });
        res.status(500).json({ error: 'Failed to fetch analytics filters' });
    }
});

module.exports = router;
