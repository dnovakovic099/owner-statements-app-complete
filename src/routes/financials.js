const express = require('express');
const QuickBooksService = require('../services/QuickBooksService');
const FileDataService = require('../services/FileDataService');
const statementsFinancialService = require('../services/StatementsFinancialService');

const router = express.Router();
const quickBooksService = new QuickBooksService();

// Simple in-memory cache for financials data
const financialsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
    const cached = financialsCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCache(key, data) {
    financialsCache.set(key, { data, time: Date.now() });
}

/**
 * Helper: Get default date range (last 30 days)
 */
function getDefaultDateRange() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

/**
 * Helper: Get date range for last N months
 */
function getMonthsDateRange(months = 6) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

/**
 * Helper: Parse date range from query params
 */
function parseDateRange(query) {
    const { startDate, endDate } = query;

    if (startDate && endDate) {
        return { startDate, endDate };
    }

    return getDefaultDateRange();
}

/**
 * Helper: Determine home category from listing tags
 * Categories: arbitrage, pm (property management), owned, shared
 */
function getHomeCategory(listing) {
    if (!listing || !listing.tags) return 'uncategorized';

    const tags = Array.isArray(listing.tags) ? listing.tags : [];
    const tagsLower = tags.map(t => t.toLowerCase());

    if (tagsLower.includes('arbitrage') || tagsLower.includes('arb')) {
        return 'arbitrage';
    }
    if (tagsLower.includes('pm') || tagsLower.includes('property management') || tagsLower.includes('managed')) {
        return 'pm';
    }
    if (tagsLower.includes('owned') || tagsLower.includes('own') || tagsLower.includes('owner')) {
        return 'owned';
    }
    if (tagsLower.includes('shared') || tagsLower.includes('partner') || tagsLower.includes('partnership')) {
        return 'shared';
    }

    return 'uncategorized';
}

/**
 * Helper: Calculate comparison period dates based on preset
 * @param {string} preset - 'mom' (month over month), 'yoy' (year over year), 'qoq' (quarter over quarter)
 * @param {string} currentStartDate - Current period start date
 * @param {string} currentEndDate - Current period end date
 * @returns {Object} { currentStart, currentEnd, compareStart, compareEnd }
 */
function getComparisonDates(preset, currentStartDate = null, currentEndDate = null) {
    const today = new Date();
    let currentStart, currentEnd, compareStart, compareEnd;

    switch (preset) {
        case 'mom': {
            // Month over month: current month vs previous month
            const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

            currentStart = currentMonthStart.toISOString().split('T')[0];
            currentEnd = currentMonthEnd.toISOString().split('T')[0];
            compareStart = prevMonthStart.toISOString().split('T')[0];
            compareEnd = prevMonthEnd.toISOString().split('T')[0];
            break;
        }
        case 'yoy': {
            // Year over year: use provided dates or default to current month
            if (currentStartDate && currentEndDate) {
                currentStart = currentStartDate;
                currentEnd = currentEndDate;

                // Same period last year
                const startDate = new Date(currentStartDate);
                const endDate = new Date(currentEndDate);
                startDate.setFullYear(startDate.getFullYear() - 1);
                endDate.setFullYear(endDate.getFullYear() - 1);

                compareStart = startDate.toISOString().split('T')[0];
                compareEnd = endDate.toISOString().split('T')[0];
            } else {
                // Default: current month vs same month last year
                const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                const lastYearMonthStart = new Date(today.getFullYear() - 1, today.getMonth(), 1);
                const lastYearMonthEnd = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0);

                currentStart = currentMonthStart.toISOString().split('T')[0];
                currentEnd = currentMonthEnd.toISOString().split('T')[0];
                compareStart = lastYearMonthStart.toISOString().split('T')[0];
                compareEnd = lastYearMonthEnd.toISOString().split('T')[0];
            }
            break;
        }
        case 'qoq': {
            // Quarter over quarter: current quarter vs previous quarter
            const currentQuarter = Math.floor(today.getMonth() / 3);
            const currentQuarterStart = new Date(today.getFullYear(), currentQuarter * 3, 1);
            const currentQuarterEnd = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0);

            const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
            const prevQuarterYear = currentQuarter === 0 ? today.getFullYear() - 1 : today.getFullYear();
            const prevQuarterStart = new Date(prevQuarterYear, prevQuarter * 3, 1);
            const prevQuarterEnd = new Date(prevQuarterYear, (prevQuarter + 1) * 3, 0);

            currentStart = currentQuarterStart.toISOString().split('T')[0];
            currentEnd = currentQuarterEnd.toISOString().split('T')[0];
            compareStart = prevQuarterStart.toISOString().split('T')[0];
            compareEnd = prevQuarterEnd.toISOString().split('T')[0];
            break;
        }
        default:
            throw new Error(`Invalid preset: ${preset}. Must be 'mom', 'yoy', or 'qoq'`);
    }

    return { currentStart, currentEnd, compareStart, compareEnd };
}

/**
 * Helper: Calculate percentage change between two values
 * @param {number} current - Current value
 * @param {number} previous - Previous value
 * @returns {number} Percentage change (null if previous is 0)
 */
function calculatePercentChange(current, previous) {
    if (previous === 0) {
        return current === 0 ? 0 : null; // null indicates infinite change
    }
    return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

/**
 * GET /api/financials/comparison
 * Compare financial data between two periods
 *
 * Query params:
 * - preset: 'mom' (month over month), 'yoy' (year over year), 'qoq' (quarter over quarter)
 * OR
 * - currentStartDate, currentEndDate: current period dates
 * - compareStartDate, compareEndDate: comparison period dates
 */
router.get('/comparison', async (req, res) => {
    try {
        const { preset, currentStartDate, currentEndDate, compareStartDate, compareEndDate } = req.query;

        let currentStart, currentEnd, compareStart, compareEnd;

        if (preset) {
            // Use preset to calculate dates
            const dates = getComparisonDates(preset, currentStartDate, currentEndDate);
            currentStart = dates.currentStart;
            currentEnd = dates.currentEnd;
            compareStart = dates.compareStart;
            compareEnd = dates.compareEnd;
        } else if (currentStartDate && currentEndDate && compareStartDate && compareEndDate) {
            // Use explicitly provided dates
            currentStart = currentStartDate;
            currentEnd = currentEndDate;
            compareStart = compareStartDate;
            compareEnd = compareEndDate;
        } else {
            return res.status(400).json({
                success: false,
                error: 'Must provide either preset (mom, yoy, qoq) or all four date parameters (currentStartDate, currentEndDate, compareStartDate, compareEndDate)'
            });
        }

        // Check cache
        const cacheKey = `comparison-${currentStart}-${currentEnd}-${compareStart}-${compareEnd}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Fetch summary data for both periods in parallel
        const [currentSummary, previousSummary] = await Promise.all([
            statementsFinancialService.getSummary(currentStart, currentEnd),
            statementsFinancialService.getSummary(compareStart, compareEnd)
        ]);

        // Calculate changes
        const incomeChange = currentSummary.totalIncome - previousSummary.totalIncome;
        const expensesChange = currentSummary.totalExpenses - previousSummary.totalExpenses;
        const netIncomeChange = currentSummary.netIncome - previousSummary.netIncome;

        const response = {
            success: true,
            data: {
                current: {
                    period: {
                        startDate: currentStart,
                        endDate: currentEnd
                    },
                    income: currentSummary.totalIncome,
                    expenses: currentSummary.totalExpenses,
                    netIncome: currentSummary.netIncome,
                    profitMargin: currentSummary.profitMargin,
                    statementCount: currentSummary.statementCount
                },
                previous: {
                    period: {
                        startDate: compareStart,
                        endDate: compareEnd
                    },
                    income: previousSummary.totalIncome,
                    expenses: previousSummary.totalExpenses,
                    netIncome: previousSummary.netIncome,
                    profitMargin: previousSummary.profitMargin,
                    statementCount: previousSummary.statementCount
                },
                changes: {
                    income: {
                        amount: incomeChange,
                        percent: calculatePercentChange(currentSummary.totalIncome, previousSummary.totalIncome)
                    },
                    expenses: {
                        amount: expensesChange,
                        percent: calculatePercentChange(currentSummary.totalExpenses, previousSummary.totalExpenses)
                    },
                    netIncome: {
                        amount: netIncomeChange,
                        percent: calculatePercentChange(currentSummary.netIncome, previousSummary.netIncome)
                    }
                },
                preset: preset || null
            }
        };

        setCache(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching financial comparison:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financial comparison'
        });
    }
});

/**
 * GET /api/financials/summary
 * Get total income/expenses for date range
 */
router.get('/summary', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);

        // Use StatementsFinancialService for database queries
        const summary = await statementsFinancialService.getSummary(startDate, endDate);

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                summary: {
                    totalIncome: summary.totalIncome,
                    totalExpenses: summary.totalExpenses,
                    netIncome: summary.netIncome,
                    profitMargin: summary.profitMargin
                },
                incomeBreakdown: {
                    total: summary.totalIncome,
                    count: summary.statementCount,
                    byType: { 'Statements': summary.totalIncome }
                },
                expenseBreakdown: {
                    total: summary.totalExpenses,
                    count: summary.statementCount,
                    byType: { 'Statements': summary.totalExpenses }
                }
            }
        });
    } catch (error) {
        console.error('Error fetching financial summary:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financial summary'
        });
    }
});

/**
 * GET /api/financials/time-series
 * Get monthly income/expenses for trend chart
 */
router.get('/time-series', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);

        // Check cache first
        const cacheKey = `time-series-${startDate}-${endDate}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Use StatementsFinancialService for database queries
        const timeSeriesData = await statementsFinancialService.getTimeSeries(startDate, endDate);

        const response = {
            success: true,
            data: timeSeriesData
        };
        setCache(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching financial time series:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financial time series'
        });
    }
});

/**
 * GET /api/financials/by-category
 * Get financials grouped by QuickBooks category (account)
 */
router.get('/by-category', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);

        // Use StatementsFinancialService for database queries
        const { income, expenses } = await statementsFinancialService.getByCategory(startDate, endDate);

        // Group income by category
        const incomeByCategory = {};
        income.forEach(t => {
            const category = t.CategoryName || t.CustomerName || 'Uncategorized';
            if (!incomeByCategory[category]) {
                incomeByCategory[category] = {
                    name: category,
                    total: 0,
                    count: 0,
                    transactions: []
                };
            }
            incomeByCategory[category].total += t.Amount || 0;
            incomeByCategory[category].count++;
            incomeByCategory[category].transactions.push({
                id: t.Id,
                type: t.Type,
                date: t.TxnDate,
                amount: t.Amount,
                description: t.Description
            });
        });

        // Group expenses by category
        const expensesByCategory = {};
        expenses.forEach(t => {
            const category = t.CategoryName || t.VendorName || 'Uncategorized';
            if (!expensesByCategory[category]) {
                expensesByCategory[category] = {
                    name: category,
                    total: 0,
                    count: 0,
                    transactions: []
                };
            }
            expensesByCategory[category].total += t.Amount || 0;
            expensesByCategory[category].count++;
            expensesByCategory[category].transactions.push({
                id: t.Id,
                type: t.Type,
                date: t.TxnDate,
                amount: t.Amount,
                description: t.Description,
                vendor: t.VendorName
            });
        });

        // Convert to arrays and sort by total
        const incomeCategories = Object.values(incomeByCategory)
            .sort((a, b) => b.total - a.total);
        const expenseCategories = Object.values(expensesByCategory)
            .sort((a, b) => b.total - a.total);

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                income: {
                    categories: incomeCategories,
                    total: incomeCategories.reduce((sum, c) => sum + c.total, 0)
                },
                expenses: {
                    categories: expenseCategories,
                    total: expenseCategories.reduce((sum, c) => sum + c.total, 0)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching financials by category:', error);

        // Return empty data if QuickBooks not connected or any QB error
        const isQBError = error.message && (
            error.message.includes('Not connected') ||
            error.message.includes('qbo') ||
            error.message.includes('token') ||
            error.message.includes('Token') ||
            error.message.includes('refresh') ||
            error.message.includes('Refresh')
        );

        if (isQBError) {
            return res.json({
                success: true,
                data: {
                    period: parseDateRange(req.query),
                    income: { categories: [], total: 0 },
                    expenses: { categories: [], total: 0 }
                },
                message: 'QuickBooks connection expired. Please reconnect in Settings.'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financials by category'
        });
    }
});

/**
 * GET /api/financials/by-home-category
 * Get financials grouped by home category (arbitrage, pm, owned, shared)
 */
router.get('/by-home-category', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);

        // Check cache first
        const cacheKey = `by-home-category-${startDate}-${endDate}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Fetch listings to determine home categories
        const listings = await FileDataService.getListings();
        const listingMap = new Map(listings.map(l => [l.id, l]));

        // SKIP P&L report - it's slow and we use DB data now
        // P&L can be fetched separately via /api/financials/summary endpoint
        let plReport = null;

        // Initialize categories
        const categories = {
            arbitrage: { name: 'Arbitrage', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            pm: { name: 'Property Management', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            owned: { name: 'Owned Properties', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            shared: { name: 'Shared/Partnership', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            uncategorized: { name: 'Uncategorized', income: 0, expenses: 0, properties: [], propertyCount: 0 }
        };

        // Categorize listings
        listings.forEach(listing => {
            const category = getHomeCategory(listing);
            if (categories[category]) {
                categories[category].properties.push({
                    id: listing.id,
                    name: listing.displayName || listing.name
                });
                categories[category].propertyCount++;
            }
        });

        // Use StatementsFinancialService to get property financials
        const { byProperty: financialsByProperty } = await statementsFinancialService.getByHomeCategory(startDate, endDate);

        // Aggregate by category and add financials to each property
        for (const [key, category] of Object.entries(categories)) {
            if (category.properties.length > 0) {
                for (const prop of category.properties) {
                    const propFinancials = financialsByProperty.get(prop.id) || { income: 0, expenses: 0 };
                    // Add financials to each property
                    prop.income = propFinancials.income;
                    prop.expenses = propFinancials.expenses;
                    // Aggregate category totals
                    category.income += propFinancials.income;
                    category.expenses += propFinancials.expenses;
                }
                // Sort properties by income descending
                category.properties.sort((a, b) => b.income - a.income);
            }
        }

        // Calculate net and margins - include properties array
        const result = Object.entries(categories).map(([key, cat]) => ({
            category: cat.name, // Use display name for frontend matching
            name: cat.name,
            propertyCount: cat.propertyCount,
            income: cat.income,
            expenses: cat.expenses,
            netIncome: cat.income - cat.expenses,
            profitMargin: cat.income > 0 ? (((cat.income - cat.expenses) / cat.income) * 100).toFixed(2) : 0,
            properties: cat.properties // Include properties with financials
        }));

        // Calculate totals
        const totals = result.reduce((acc, cat) => ({
            income: acc.income + cat.income,
            expenses: acc.expenses + cat.expenses,
            propertyCount: acc.propertyCount + cat.propertyCount
        }), { income: 0, expenses: 0, propertyCount: 0 });

        const response = {
            success: true,
            data: {
                period: { startDate, endDate },
                categories: result,
                totals: {
                    ...totals,
                    netIncome: totals.income - totals.expenses,
                    profitMargin: totals.income > 0 ? (((totals.income - totals.expenses) / totals.income) * 100).toFixed(2) : 0
                },
                plReport: plReport ? {
                    available: true,
                    header: plReport.Header,
                    summary: plReport.Rows?.Row?.[0] || null
                } : { available: false }
            }
        };
        setCache(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching financials by home category:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financials by home category'
        });
    }
});

/**
 * GET /api/financials/by-property
 * Get per-property financials with 6-month history
 */
router.get('/by-property', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        const { startDate, endDate } = getMonthsDateRange(months);

        // Fetch all listings
        const listings = await FileDataService.getListings();
        const activeListings = listings.filter(l => l.isActive !== false);

        // Fetch reservations and expenses for all properties
        const propertyIds = activeListings.map(l => l.id);

        const [reservationsByProperty, expensesByProperty] = await Promise.all([
            FileDataService.getReservationsBatch(startDate, endDate, propertyIds, 'checkout'),
            FileDataService.getExpensesBatch(startDate, endDate, propertyIds)
        ]);

        // Build property financials
        const propertyFinancials = activeListings.map(listing => {
            const reservations = reservationsByProperty[listing.id] || [];
            const { expenses } = expensesByProperty[listing.id] || { expenses: [] };

            // Calculate totals
            const totalIncome = reservations.reduce((sum, r) => sum + (r.clientPayout || r.totalPrice || 0), 0);
            const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const netIncome = totalIncome - totalExpenses;

            // Calculate monthly breakdown
            const monthlyData = {};
            const currentDate = new Date(startDate);
            while (currentDate <= new Date(endDate)) {
                const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                monthlyData[monthKey] = { income: 0, expenses: 0, reservations: 0 };
                currentDate.setMonth(currentDate.getMonth() + 1);
            }

            // Populate monthly income from reservations
            reservations.forEach(r => {
                const checkOut = new Date(r.checkOutDate);
                const monthKey = `${checkOut.getFullYear()}-${String(checkOut.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyData[monthKey]) {
                    monthlyData[monthKey].income += r.clientPayout || r.totalPrice || 0;
                    monthlyData[monthKey].reservations++;
                }
            });

            // Populate monthly expenses
            expenses.forEach(e => {
                const expDate = new Date(e.date);
                const monthKey = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyData[monthKey]) {
                    monthlyData[monthKey].expenses += e.amount || 0;
                }
            });

            // Calculate monthly net
            Object.keys(monthlyData).forEach(key => {
                monthlyData[key].net = monthlyData[key].income - monthlyData[key].expenses;
            });

            return {
                id: listing.id,
                name: listing.displayName || listing.name,
                address: listing.address,
                homeCategory: getHomeCategory(listing),
                tags: listing.tags || [],
                summary: {
                    totalIncome,
                    totalExpenses,
                    netIncome,
                    profitMargin: totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(2) : 0,
                    reservationCount: reservations.length,
                    expenseCount: expenses.length
                },
                monthlyData: Object.entries(monthlyData)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, data]) => ({ month, ...data }))
            };
        });

        // Sort by net income descending
        propertyFinancials.sort((a, b) => b.summary.netIncome - a.summary.netIncome);

        // Calculate totals
        const totals = propertyFinancials.reduce((acc, p) => ({
            income: acc.income + p.summary.totalIncome,
            expenses: acc.expenses + p.summary.totalExpenses,
            reservations: acc.reservations + p.summary.reservationCount
        }), { income: 0, expenses: 0, reservations: 0 });

        res.json({
            success: true,
            data: {
                period: { startDate, endDate, months },
                properties: propertyFinancials,
                totals: {
                    ...totals,
                    netIncome: totals.income - totals.expenses,
                    profitMargin: totals.income > 0 ? (((totals.income - totals.expenses) / totals.income) * 100).toFixed(2) : 0,
                    propertyCount: propertyFinancials.length
                }
            }
        });
    } catch (error) {
        console.error('Error fetching financials by property:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financials by property'
        });
    }
});

/**
 * GET /api/financials/property/:id/details
 * Get detailed transactions for one property
 */
router.get('/property/:id/details', async (req, res) => {
    try {
        const propertyId = parseInt(req.params.id);
        const { startDate, endDate } = parseDateRange(req.query);

        if (!propertyId) {
            return res.status(400).json({
                success: false,
                error: 'Property ID is required'
            });
        }

        // Fetch listing details
        const listings = await FileDataService.getListings();
        const listing = listings.find(l => l.id === propertyId);

        if (!listing) {
            return res.status(404).json({
                success: false,
                error: 'Property not found'
            });
        }

        // Fetch reservations and expenses for this property
        const [reservations, expensesData] = await Promise.all([
            FileDataService.getReservations(startDate, endDate, propertyId, 'checkout'),
            FileDataService.getExpenses(startDate, endDate, propertyId)
        ]);

        const expenses = Array.isArray(expensesData) ? expensesData : [];

        // Transform reservations to transaction format
        const incomeTransactions = reservations.map(r => ({
            id: r.id || r.reservationId,
            type: 'Reservation',
            date: r.checkOutDate,
            amount: r.clientPayout || r.totalPrice || 0,
            description: `${r.guestName || 'Guest'} - ${r.nights || 0} nights`,
            checkIn: r.checkInDate,
            checkOut: r.checkOutDate,
            channel: r.channelName || r.channel || 'Direct',
            status: r.status,
            details: {
                baseRate: r.baseRate || 0,
                cleaningFee: r.cleaningFee || 0,
                platformFees: r.platformFees || 0,
                taxes: r.taxes || r.clientTaxResponsibility || 0
            }
        }));

        // Transform expenses to transaction format
        const expenseTransactions = expenses.map(e => ({
            id: e.id,
            type: 'Expense',
            subType: e.category || e.type || 'Other',
            date: e.date,
            amount: e.amount || 0,
            description: e.description || e.name || 'Expense',
            vendor: e.vendor || e.listing || null,
            category: e.category || null
        }));

        // Calculate totals
        const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
        const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

        // Group expenses by category
        const expensesByCategory = {};
        expenseTransactions.forEach(t => {
            const cat = t.subType || 'Other';
            expensesByCategory[cat] = (expensesByCategory[cat] || 0) + t.amount;
        });

        res.json({
            success: true,
            data: {
                property: {
                    id: listing.id,
                    name: listing.displayName || listing.name,
                    address: listing.address,
                    homeCategory: getHomeCategory(listing),
                    tags: listing.tags || [],
                    pmFeePercentage: listing.pmFeePercentage
                },
                period: { startDate, endDate },
                summary: {
                    totalIncome,
                    totalExpenses,
                    netIncome: totalIncome - totalExpenses,
                    profitMargin: totalIncome > 0 ? (((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(2) : 0,
                    reservationCount: incomeTransactions.length,
                    expenseCount: expenseTransactions.length
                },
                income: {
                    transactions: incomeTransactions.sort((a, b) => new Date(b.date) - new Date(a.date)),
                    total: totalIncome
                },
                expenses: {
                    transactions: expenseTransactions.sort((a, b) => new Date(b.date) - new Date(a.date)),
                    total: totalExpenses,
                    byCategory: expensesByCategory
                }
            }
        });
    } catch (error) {
        console.error('Error fetching property financial details:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch property financial details'
        });
    }
});

/**
 * GET /api/financials/metrics
 * Get ROI and trend calculations
 */
router.get('/metrics', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const { startDate, endDate } = getMonthsDateRange(months);

        // Check cache first
        const cacheKey = `metrics-${startDate}-${endDate}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Use StatementsFinancialService for database queries
        const metrics = await statementsFinancialService.getMetrics(startDate, endDate, months);

        const response = {
            success: true,
            data: {
                period: { startDate, endDate, months },
                ...metrics
            }
        };
        setCache(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching financial metrics:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financial metrics'
        });
    }
});

/**
 * GET /api/financials/transactions
 * Get raw transaction list with filters from QuickBooks
 */
router.get('/transactions', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);
        const { type, category, minAmount, maxAmount, search } = req.query;

        // Check if QuickBooks is connected before attempting to fetch (async for multi-worker support)
        const isConnected = await quickBooksService.isConnectedAsync();
        if (!isConnected) {
            // Return empty data instead of trying to fetch from disconnected QB
            return res.json({
                success: true,
                data: {
                    period: { startDate, endDate },
                    transactions: [],
                    pagination: { page: 1, limit: 50, totalCount: 0, totalPages: 0, hasMore: false },
                    totals: { income: 0, expenses: 0, net: 0, transactionCount: 0 }
                },
                message: 'QuickBooks not connected. Please connect in Settings to view transactions.'
            });
        }

        // Fetch all transactions from QuickBooks with timeout
        let income = [];
        let expenses = [];
        try {
            const results = await Promise.race([
                Promise.all([
                    quickBooksService.getAllIncome(startDate, endDate),
                    quickBooksService.getAllExpenses(startDate, endDate)
                ]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('QuickBooks timeout')), 15000))
            ]);
            income = results[0] || [];
            expenses = results[1] || [];
        } catch (qbError) {
            console.error('QuickBooks fetch error:', qbError);
            // Return empty data on any QB error
            return res.json({
                success: true,
                data: {
                    period: { startDate, endDate },
                    transactions: [],
                    pagination: { page: 1, limit: 50, totalCount: 0, totalPages: 0, hasMore: false },
                    totals: { income: 0, expenses: 0, net: 0, transactionCount: 0 }
                },
                message: 'QuickBooks connection error. Please reconnect in Settings.'
            });
        }

        // Combine all transactions
        let allTransactions = [
            ...income.map(t => ({ ...t, transactionClass: 'income' })),
            ...expenses.map(t => ({ ...t, transactionClass: 'expense' }))
        ];

        // Apply filters
        if (type) {
            const types = type.split(',').map(t => t.trim().toLowerCase());
            allTransactions = allTransactions.filter(t =>
                types.includes(t.Type?.toLowerCase()) ||
                types.includes(t.transactionClass)
            );
        }

        if (category) {
            const categories = category.split(',').map(c => c.trim().toLowerCase());
            allTransactions = allTransactions.filter(t =>
                categories.includes(t.CategoryName?.toLowerCase()) ||
                categories.includes(t.VendorName?.toLowerCase()) ||
                categories.includes(t.CustomerName?.toLowerCase())
            );
        }

        if (minAmount) {
            const min = parseFloat(minAmount);
            allTransactions = allTransactions.filter(t => (t.Amount || 0) >= min);
        }

        if (maxAmount) {
            const max = parseFloat(maxAmount);
            allTransactions = allTransactions.filter(t => (t.Amount || 0) <= max);
        }

        if (search) {
            const searchLower = search.toLowerCase();
            allTransactions = allTransactions.filter(t =>
                t.Description?.toLowerCase().includes(searchLower) ||
                t.VendorName?.toLowerCase().includes(searchLower) ||
                t.CustomerName?.toLowerCase().includes(searchLower) ||
                t.CategoryName?.toLowerCase().includes(searchLower) ||
                t.DocNumber?.toLowerCase().includes(searchLower)
            );
        }

        // Sort by date descending
        allTransactions.sort((a, b) => new Date(b.TxnDate) - new Date(a.TxnDate));

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const totalCount = allTransactions.length;
        const paginatedTransactions = allTransactions.slice(offset, offset + limit);

        // Calculate totals for filtered results
        const totals = allTransactions.reduce((acc, t) => {
            if (t.transactionClass === 'income') {
                acc.income += t.Amount || 0;
            } else {
                acc.expenses += t.Amount || 0;
            }
            return acc;
        }, { income: 0, expenses: 0 });

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                transactions: paginatedTransactions.map(t => ({
                    id: t.Id,
                    type: t.Type,
                    subType: t.SubType,
                    transactionClass: t.transactionClass,
                    date: t.TxnDate,
                    amount: t.Amount,
                    description: t.Description,
                    vendor: t.VendorName,
                    customer: t.CustomerName,
                    category: t.CategoryName,
                    account: t.AccountName,
                    docNumber: t.DocNumber,
                    balance: t.Balance,
                    dueDate: t.DueDate
                })),
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    hasMore: offset + limit < totalCount
                },
                totals: {
                    ...totals,
                    net: totals.income - totals.expenses,
                    transactionCount: totalCount
                }
            }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);

        // Return empty data if QuickBooks not connected or any QB error
        const isQBError = error.message && (
            error.message.includes('Not connected') ||
            error.message.includes('qbo') ||
            error.message.includes('token') ||
            error.message.includes('Token') ||
            error.message.includes('refresh') ||
            error.message.includes('Refresh')
        );

        if (isQBError) {
            return res.json({
                success: true,
                data: {
                    period: parseDateRange(req.query),
                    transactions: [],
                    pagination: { page: 1, limit: 50, totalCount: 0, totalPages: 0, hasMore: false },
                    totals: { income: 0, expenses: 0, net: 0, transactionCount: 0 }
                },
                message: 'QuickBooks connection expired. Please reconnect in Settings.'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch transactions'
        });
    }
});

module.exports = router;
