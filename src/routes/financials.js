const express = require('express');
const QuickBooksService = require('../services/QuickBooksService');
const FileDataService = require('../services/FileDataService');
const statementsFinancialService = require('../services/StatementsFinancialService');
const {
    mapToCategory,
    groupByCategory,
    getCategorySummary,
    ALL_CATEGORIES,
    getUnmappedAccounts,
} = require('../utils/categoryMapping');

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
    if (!listing) return 'uncategorized';

    // First check explicit homeCategory field
    if (listing.homeCategory) {
        const cat = listing.homeCategory.toLowerCase();
        if (cat.includes('arb')) return 'arbitrage';
        if (cat.includes('pm') || cat.includes('manage')) return 'pm';
        if (cat.includes('own')) return 'owned';
        if (cat.includes('share') || cat.includes('partner')) return 'shared';
    }

    // Then check tags
    const tags = Array.isArray(listing.tags) ? listing.tags : [];
    const tagsLower = tags.map(t => (t || '').toLowerCase());

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

    // Heuristic: If pmFeePercentage > 0, likely a PM property
    const pmFee = parseFloat(listing.pmFeePercentage) || 0;
    if (pmFee > 0) {
        return 'pm';
    }

    // Heuristic: If has ownerEmail, likely PM (managing for someone else)
    if (listing.ownerEmail && listing.ownerEmail.length > 0) {
        return 'pm';
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

        // Helper to extract totals from QuickBooks P&L report
        const extractPLTotals = (plReport) => {
            let totalIncome = 0;
            let totalExpenses = 0;
            let qbNetIncome = null;

            if (plReport && plReport.Rows && plReport.Rows.Row) {
                const getSummaryTotal = (section) => {
                    if (!section.Summary || !section.Summary.ColData) return 0;
                    for (const col of section.Summary.ColData) {
                        const val = parseFloat(col.value);
                        if (!isNaN(val)) return val;
                    }
                    return 0;
                };

                for (const section of plReport.Rows.Row) {
                    const groupName = (section.group || '').toLowerCase();
                    if (groupName === 'income') {
                        totalIncome += getSummaryTotal(section);
                    } else if (groupName === 'otherincome') {
                        totalIncome += getSummaryTotal(section);
                    } else if (groupName === 'costofgoodssold' || groupName === 'cogs') {
                        totalExpenses += getSummaryTotal(section);
                    } else if (groupName === 'expenses') {
                        totalExpenses += getSummaryTotal(section);
                    } else if (groupName === 'otherexpenses') {
                        totalExpenses += getSummaryTotal(section);
                    } else if (groupName === 'netincome') {
                        qbNetIncome = getSummaryTotal(section);
                    }
                }

                // ENFORCE QuickBooks Net Income - adjust expenses if parsing missed something
                if (qbNetIncome !== null) {
                    const calculatedNet = totalIncome - totalExpenses;
                    if (Math.abs(calculatedNet - qbNetIncome) > 1) {
                        totalExpenses = totalIncome - qbNetIncome;
                    }
                }
            }

            const netIncome = totalIncome - totalExpenses;
            const profitMargin = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;
            return { totalIncome, totalExpenses, netIncome, profitMargin };
        };

        // Fetch P&L from QuickBooks for both periods
        let currentSummary, previousSummary;
        try {
            const [currentPL, previousPL] = await Promise.all([
                quickBooksService.getProfitAndLoss(currentStart, currentEnd),
                quickBooksService.getProfitAndLoss(compareStart, compareEnd)
            ]);
            currentSummary = extractPLTotals(currentPL);
            previousSummary = extractPLTotals(previousPL);
        } catch (qbError) {
            console.error('QuickBooks P&L fetch failed for comparison:', qbError.message);
            return res.status(503).json({
                success: false,
                error: 'QuickBooks connection failed',
                message: 'Unable to fetch comparison data from QuickBooks.',
                authUrl: '/api/quickbooks/auth-url'
            });
        }

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
                    },
                    profitMargin: {
                        percent: calculatePercentChange(currentSummary.profitMargin, previousSummary.profitMargin)
                    }
                },
                // Add previousPeriod format for frontend compatibility
                previousPeriod: {
                    totalIncome: previousSummary.totalIncome,
                    totalExpenses: previousSummary.totalExpenses,
                    netIncome: previousSummary.netIncome,
                    profitMargin: previousSummary.profitMargin
                },
                preset: preset || null,
                dataSource: 'quickbooks'
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
 * Get total income/expenses for date range from QuickBooks
 */
router.get('/summary', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);

        let totalIncome = 0;
        let totalExpenses = 0;
        let incomeBreakdown = {};
        let expenseBreakdown = {};
        let dataSource = 'quickbooks';

        // Try to get P&L from QuickBooks - ensureFreshToken() handles token refresh automatically
        try {
                // Get P&L report from QuickBooks for accurate totals
                const plReport = await quickBooksService.getProfitAndLoss(startDate, endDate);

                // Debug: Log the full P&L report structure (first 5000 chars to avoid log overflow)
                const reportJson = JSON.stringify(plReport, null, 2);
                console.log('[Financials] P&L Report Structure (truncated):', reportJson.substring(0, 5000));
                console.log('[Financials] P&L Report total length:', reportJson.length);

                // Parse the P&L report to extract totals
                // QuickBooks P&L report structure has these main sections (group values):
                // - Income: All revenue accounts
                // - CostOfGoodsSold: COGS accounts (counts as expense)
                // - GrossProfit: Income - COGS (computed, skip)
                // - Expenses: Operating expenses
                // - NetOperatingIncome: Gross Profit - Expenses (computed, skip)
                // - OtherIncome: Non-operating income
                // - OtherExpenses: Non-operating expenses
                // - NetOtherIncome: OtherIncome - OtherExpenses (computed, skip)
                // - NetIncome: Final net income (use for validation)
                if (plReport && plReport.Rows && plReport.Rows.Row) {
                    // Helper function to recursively extract amounts from rows
                    const extractRowAmounts = (rows, breakdown, prefix = '') => {
                        if (!rows || !Array.isArray(rows)) return;
                        for (const row of rows) {
                            // Handle rows with ColData (actual data rows)
                            if (row.ColData && row.ColData.length >= 2) {
                                const name = row.ColData[0]?.value || 'Other';
                                const amount = parseFloat(row.ColData[1]?.value) || 0;
                                // Skip total/subtotal rows and zero amounts
                                if (amount !== 0 && name && !name.toLowerCase().startsWith('total')) {
                                    const fullName = prefix ? `${prefix}: ${name}` : name;
                                    breakdown[fullName] = (breakdown[fullName] || 0) + amount;
                                }
                            }
                            // Handle nested rows (sub-sections within a category)
                            if (row.Rows && row.Rows.Row) {
                                // Get header name for nested section if available
                                const nestedPrefix = row.Header?.ColData?.[0]?.value || prefix;
                                extractRowAmounts(row.Rows.Row, breakdown, nestedPrefix);
                            }
                        }
                    };

                    // Helper function to get total from Summary.ColData
                    const getSummaryTotal = (section) => {
                        if (!section.Summary || !section.Summary.ColData) return 0;
                        // Find the numeric value column (usually the last one or second one)
                        for (const col of section.Summary.ColData) {
                            const val = parseFloat(col.value);
                            if (!isNaN(val)) {
                                return val;
                            }
                        }
                        return 0;
                    };

                    // Track what we find for validation
                    let qbNetIncome = null;
                    let cogsTotal = 0;
                    let expensesTotal = 0;
                    let otherExpensesTotal = 0;
                    let otherIncomeTotal = 0;

                    // Log all sections found
                    console.log('[Financials] P&L Sections found:');
                    for (const section of plReport.Rows.Row) {
                        const groupName = (section.group || '').toLowerCase();
                        const headerValue = section.Header?.ColData?.[0]?.value || '';
                        const summaryValue = getSummaryTotal(section);
                        console.log(`  - group="${section.group}", header="${headerValue}", summary=${summaryValue}`);
                    }

                    for (const section of plReport.Rows.Row) {
                        const groupName = (section.group || '').toLowerCase();
                        const headerName = section.Header?.ColData?.[0]?.value?.toLowerCase() || '';

                        // Income section
                        if (groupName === 'income') {
                            totalIncome = getSummaryTotal(section);
                            console.log(`[Financials] Income section total: ${totalIncome}`);
                            if (section.Rows && section.Rows.Row) {
                                extractRowAmounts(section.Rows.Row, incomeBreakdown);
                            }
                        }

                        // Cost of Goods Sold section (QuickBooks uses CostOfGoodsSold as group name)
                        if (groupName === 'costofgoodssold' || groupName === 'cogs') {
                            cogsTotal = getSummaryTotal(section);
                            console.log(`[Financials] COGS section total: ${cogsTotal}`);
                            expenseBreakdown['Cost of Goods Sold'] = cogsTotal;
                            if (section.Rows && section.Rows.Row) {
                                extractRowAmounts(section.Rows.Row, expenseBreakdown, 'COGS');
                            }
                        }

                        // Expenses section (operating expenses)
                        if (groupName === 'expenses') {
                            expensesTotal = getSummaryTotal(section);
                            console.log(`[Financials] Expenses section total: ${expensesTotal}`);
                            if (section.Rows && section.Rows.Row) {
                                extractRowAmounts(section.Rows.Row, expenseBreakdown);
                            }
                        }

                        // Other Income section (non-operating income)
                        if (groupName === 'otherincome') {
                            otherIncomeTotal = getSummaryTotal(section);
                            console.log(`[Financials] Other Income section total: ${otherIncomeTotal}`);
                            if (section.Rows && section.Rows.Row) {
                                extractRowAmounts(section.Rows.Row, incomeBreakdown, 'Other Income');
                            }
                        }

                        // Other Expenses section (non-operating expenses)
                        if (groupName === 'otherexpenses') {
                            otherExpensesTotal = getSummaryTotal(section);
                            console.log(`[Financials] Other Expenses section total: ${otherExpensesTotal}`);
                            expenseBreakdown['Other Expenses'] = otherExpensesTotal;
                            if (section.Rows && section.Rows.Row) {
                                extractRowAmounts(section.Rows.Row, expenseBreakdown, 'Other');
                            }
                        }

                        // Net Income section - use for validation
                        if (groupName === 'netincome') {
                            qbNetIncome = getSummaryTotal(section);
                            console.log(`[Financials] QuickBooks Net Income from report: ${qbNetIncome}`);
                        }
                    }

                    // Calculate totals
                    // Total Income = Income + Other Income
                    totalIncome = totalIncome + otherIncomeTotal;
                    // Total Expenses = COGS + Expenses + Other Expenses
                    totalExpenses = cogsTotal + expensesTotal + otherExpensesTotal;

                    console.log(`[Financials] Calculated totals:`);
                    console.log(`  Income: ${totalIncome} (base + other: ${totalIncome - otherIncomeTotal} + ${otherIncomeTotal})`);
                    console.log(`  Expenses: ${totalExpenses} (COGS + Expenses + Other: ${cogsTotal} + ${expensesTotal} + ${otherExpensesTotal})`);
                    console.log(`  Net Income: ${totalIncome - totalExpenses}`);

                    // ENFORCE QuickBooks Net Income - adjust expenses if needed
                    if (qbNetIncome !== null) {
                        const calculatedNet = totalIncome - totalExpenses;
                        const diff = Math.abs(calculatedNet - qbNetIncome);
                        if (diff > 1) {
                            console.log(`[Financials] WARNING: Calculated Net (${calculatedNet}) differs from QB Net (${qbNetIncome}) by ${diff}`);
                            console.log(`[Financials] ADJUSTING: Using QB Net Income and back-calculating expenses`);
                            // Back-calculate expenses to match QB Net Income exactly
                            totalExpenses = totalIncome - qbNetIncome;
                            console.log(`[Financials] Adjusted expenses to: ${totalExpenses}`);
                        } else {
                            console.log(`[Financials] SUCCESS: Calculated Net matches QB Net Income`);
                        }
                    }
                }

            console.log(`[Financials] QuickBooks P&L FINAL: Income=${totalIncome}, Expenses=${totalExpenses}, Net=${totalIncome - totalExpenses}`);
        } catch (qbError) {
            console.error('QuickBooks P&L fetch failed:', qbError.message);
            // Check if it's a token/auth issue
            const errorMsg = qbError.message || '';
            const isAuthError = errorMsg.includes('refresh') || errorMsg.includes('token') ||
                               errorMsg.includes('OAuth') || errorMsg.includes('Not connected');
            return res.status(503).json({
                success: false,
                error: isAuthError ? 'QuickBooks not connected' : 'QuickBooks connection failed',
                message: isAuthError
                    ? 'Please connect to QuickBooks to view financial data.'
                    : 'Unable to fetch data from QuickBooks. Please try again.',
                authUrl: '/api/quickbooks/auth-url'
            });
        }

        const netIncome = totalIncome - totalExpenses;
        const profitMargin = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                dataSource,
                summary: {
                    totalIncome,
                    totalExpenses,
                    netIncome,
                    profitMargin
                },
                incomeBreakdown: {
                    total: totalIncome,
                    byType: incomeBreakdown
                },
                expenseBreakdown: {
                    total: totalExpenses,
                    byType: expenseBreakdown
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
 * GET /api/financials/debug-pl
 * Debug endpoint to see raw QuickBooks P&L report structure
 */
router.get('/debug-pl', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);

        // Check if QuickBooks is connected
        const isConnected = quickBooksService.isConnected();

        if (!isConnected) {
            return res.json({
                success: false,
                error: 'QuickBooks not connected',
                message: 'Connect to QuickBooks first to see P&L debug data'
            });
        }

        // Get P&L report from QuickBooks
        const plReport = await quickBooksService.getProfitAndLoss(startDate, endDate);

        // Extract section info for debugging
        const sections = [];
        if (plReport && plReport.Rows && plReport.Rows.Row) {
            for (const section of plReport.Rows.Row) {
                const sectionInfo = {
                    group: section.group || null,
                    type: section.type || null,
                    header: section.Header?.ColData?.[0]?.value || null,
                    summary: null,
                    rowCount: 0,
                    hasNestedRows: false
                };

                // Get summary value
                if (section.Summary && section.Summary.ColData) {
                    for (const col of section.Summary.ColData) {
                        const val = parseFloat(col.value);
                        if (!isNaN(val)) {
                            sectionInfo.summary = val;
                            break;
                        }
                    }
                }

                // Count rows
                if (section.Rows && section.Rows.Row) {
                    sectionInfo.rowCount = section.Rows.Row.length;
                    // Check for nested rows
                    for (const row of section.Rows.Row) {
                        if (row.Rows && row.Rows.Row) {
                            sectionInfo.hasNestedRows = true;
                            break;
                        }
                    }
                }

                sections.push(sectionInfo);
            }
        }

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                reportHeader: plReport?.Header || null,
                columns: plReport?.Columns?.Column?.map(c => c.ColTitle || c.ColType) || [],
                sectionSummary: sections,
                rawReport: plReport
            }
        });
    } catch (error) {
        console.error('Error fetching P&L debug:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch P&L debug data'
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
 *
 * Standard expense categories (mapped from QuickBooks accounts):
 * - Darko Distribution, Louis Distribution, Owner Payout
 * - Rent, Mortgage, Utility, Cleaning, Maintenance
 * - Review refund, Chargeback
 * - Employee base pay, Employee commission, Photography pay
 * - Legal, Tax, Software subscription
 * - Arbitrage acquisition, Home owner acquisition
 *
 * Query params:
 * - startDate: Start date (YYYY-MM-DD)
 * - endDate: End date (YYYY-MM-DD)
 * - mapped: If 'true', use category mapping to standardize categories (default: true)
 */
router.get('/by-category', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);
        const useMappedCategories = req.query.mapped !== 'false'; // Default to true

        // Check cache first
        const cacheKey = `by-category-${startDate}-${endDate}-mapped-${useMappedCategories}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Try to fetch from QuickBooks for actual account categories
        let income = [];
        let expenses = [];
        let usingQuickBooks = false;

        // Try to fetch from QuickBooks directly (like /summary does)
        try {
            console.log('[by-category] Fetching from QuickBooks...');
            const results = await Promise.all([
                quickBooksService.getAllIncome(startDate, endDate),
                quickBooksService.getAllExpenses(startDate, endDate)
            ]);
            income = results[0] || [];
            expenses = results[1] || [];
            usingQuickBooks = true;
            console.log(`[by-category] Fetched ${income.length} income and ${expenses.length} expense transactions from QuickBooks`);
        } catch (qbError) {
            console.warn('[by-category] QuickBooks fetch failed:', qbError.message);
        }

        // If QuickBooks data available, group by mapped or raw categories
        if (usingQuickBooks && (income.length > 0 || expenses.length > 0)) {
            let incomeCategories, expenseCategories;
            let unmappedAccounts = [];

            if (useMappedCategories) {
                // Use category mapping to standardize QuickBooks account names
                console.log('[by-category] Using category mapping to standardize accounts');

                // Get expense summary with mapped categories
                const expenseSummary = getCategorySummary(expenses, 'expense');
                expenseCategories = expenseSummary.map(cat => ({
                    name: cat.name,
                    total: cat.total,
                    count: cat.count,
                    originalAccounts: cat.originalAccounts,
                    transactions: cat.recentTransactions
                }));

                // Get income summary with mapped categories
                const incomeSummary = getCategorySummary(income, 'income');
                incomeCategories = incomeSummary.map(cat => ({
                    name: cat.name,
                    total: cat.total,
                    count: cat.count,
                    originalAccounts: cat.originalAccounts,
                    transactions: cat.recentTransactions
                }));

                // Track unmapped accounts for debugging/improvement
                unmappedAccounts = [
                    ...getUnmappedAccounts(expenses),
                    ...getUnmappedAccounts(income)
                ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

                if (unmappedAccounts.length > 0) {
                    console.log('[by-category] Unmapped QuickBooks accounts:', unmappedAccounts);
                }
            } else {
                // Group by raw QuickBooks account/category names (original behavior)
                const incomeByCategory = {};
                income.forEach(t => {
                    const category = t.AccountName || t.CategoryName || t.CustomerName || 'Other Income';
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
                        description: t.Description,
                        customer: t.CustomerName
                    });
                });

                const expensesByCategory = {};
                expenses.forEach(t => {
                    const category = t.AccountName || t.CategoryName || t.VendorName || 'Other Expenses';
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

                incomeCategories = Object.values(incomeByCategory).sort((a, b) => b.total - a.total);
                expenseCategories = Object.values(expensesByCategory).sort((a, b) => b.total - a.total);
            }

            const response = {
                success: true,
                data: {
                    period: { startDate, endDate },
                    source: 'quickbooks',
                    categoryMapping: useMappedCategories,
                    standardCategories: useMappedCategories ? ALL_CATEGORIES : null,
                    unmappedAccounts: useMappedCategories ? unmappedAccounts : null,
                    income: {
                        categories: incomeCategories,
                        total: incomeCategories.reduce((sum, c) => sum + c.total, 0)
                    },
                    expenses: {
                        categories: expenseCategories,
                        total: expenseCategories.reduce((sum, c) => sum + c.total, 0)
                    }
                }
            };
            setCache(cacheKey, response);
            return res.json(response);
        }

        // QuickBooks not available - return error instead of fallback
        console.log('[by-category] QuickBooks not available, returning error');
        return res.status(503).json({
            success: false,
            error: 'QuickBooks not connected',
            message: 'Please connect to QuickBooks to view financial data by category.',
            authUrl: '/api/quickbooks/auth-url'
        });
    } catch (error) {
        console.error('Error fetching financials by category:', error);

        // Return proper error for QuickBooks issues
        const isQBError = error.message && (
            error.message.includes('Not connected') ||
            error.message.includes('qbo') ||
            error.message.includes('token') ||
            error.message.includes('Token') ||
            error.message.includes('refresh') ||
            error.message.includes('Refresh')
        );

        if (isQBError) {
            return res.status(503).json({
                success: false,
                error: 'QuickBooks connection failed',
                message: 'QuickBooks connection expired. Please re-authenticate.',
                authUrl: '/api/quickbooks/auth-url'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch financials by category'
        });
    }
});

/**
 * GET /api/financials/category-mapping
 * Get information about category mapping configuration
 */
router.get('/category-mapping', (req, res) => {
    const { validateCategoryMapping } = require('../utils/categoryMapping');
    const validation = validateCategoryMapping();

    res.json({
        success: true,
        data: {
            standardCategories: ALL_CATEGORIES,
            validation,
            description: 'These are the standard expense categories that QuickBooks account names are mapped to.'
        }
    });
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

        // Fetch listings from DATABASE (not FileDataService) to get pmFeePercentage, ownerEmail, tags
        const Listing = require('../models/Listing');
        const dbListings = await Listing.findAll({
            attributes: ['id', 'name', 'displayName', 'nickname', 'pmFeePercentage', 'ownerEmail', 'tags', 'isActive']
        });
        const listings = dbListings.map(l => l.toJSON());
        console.log(`[by-home-category] Found ${listings.length} listings from database`);

        // Initialize categories
        const categories = {
            arbitrage: { name: 'Arbitrage', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            pm: { name: 'Property Management', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            owned: { name: 'Owned Properties', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            shared: { name: 'Shared/Partnership', income: 0, expenses: 0, properties: [], propertyCount: 0 },
            uncategorized: { name: 'Uncategorized', income: 0, expenses: 0, properties: [], propertyCount: 0 }
        };

        // Categorize listings using database fields (pmFeePercentage, ownerEmail, tags)
        listings.forEach(listing => {
            const category = getHomeCategory(listing);
            if (categories[category]) {
                categories[category].properties.push({
                    id: listing.id,
                    name: listing.displayName || listing.nickname || listing.name
                });
                categories[category].propertyCount++;
            }
        });

        console.log(`[by-home-category] Categorized: PM=${categories.pm.propertyCount}, Arb=${categories.arbitrage.propertyCount}, Owned=${categories.owned.propertyCount}, Shared=${categories.shared.propertyCount}, Uncategorized=${categories.uncategorized.propertyCount}`);

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
                plReport: { available: false } // P&L report skipped for performance
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
 * GET /api/financials/transactions-by-account
 * Get TransactionList report from QuickBooks grouped by Account
 * This matches exactly what QuickBooks P&L shows
 *
 * Query params:
 * - startDate: Start date (YYYY-MM-DD)
 * - endDate: End date (YYYY-MM-DD)
 * - debug: If 'true', include raw response from QuickBooks
 */
router.get('/transactions-by-account', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);
        const includeDebug = req.query.debug === 'true';

        // Check cache first (skip for debug mode)
        if (!includeDebug) {
            const cacheKey = `transactions-by-account-${startDate}-${endDate}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return res.json(cached);
            }
        }

        console.log(`[transactions-by-account] Fetching for ${startDate} to ${endDate}`);

        const data = await quickBooksService.getTransactionListByAccount(startDate, endDate);

        const response = {
            success: true,
            data: {
                period: { startDate, endDate },
                accounts: data.accounts,
                transactions: data.transactions,
                totals: data.totals,
                source: 'quickbooks-transaction-list-report',
                ...(includeDebug && { raw: data.raw })
            }
        };

        if (!includeDebug) {
            const cacheKey = `transactions-by-account-${startDate}-${endDate}`;
            setCache(cacheKey, response);
        }
        res.json(response);
    } catch (error) {
        console.error('Error fetching transactions by account:', error);

        const isQBError = error.message && (
            error.message.includes('Not connected') ||
            error.message.includes('qbo') ||
            error.message.includes('token') ||
            error.message.includes('Token') ||
            error.message.includes('refresh')
        );

        if (isQBError) {
            return res.status(503).json({
                success: false,
                error: 'QuickBooks connection failed',
                message: 'QuickBooks connection expired. Please re-authenticate.',
                authUrl: '/api/quickbooks/auth-url'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch transactions by account'
        });
    }
});

/**
 * GET /api/financials/account-transactions/:accountName
 * Get transactions for a specific account (category drill-down)
 * Matches exactly what QuickBooks shows for that P&L category
 *
 * Query params:
 * - startDate: Start date (YYYY-MM-DD)
 * - endDate: End date (YYYY-MM-DD)
 */
router.get('/account-transactions/:accountName', async (req, res) => {
    try {
        const { startDate, endDate } = parseDateRange(req.query);
        const accountName = decodeURIComponent(req.params.accountName);

        if (!accountName) {
            return res.status(400).json({
                success: false,
                error: 'Account name is required'
            });
        }

        console.log(`[account-transactions] Fetching transactions for "${accountName}" from ${startDate} to ${endDate}`);

        const data = await quickBooksService.getTransactionsForAccount(accountName, startDate, endDate);

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                account: accountName,
                total: data.total,
                transactionCount: data.transactionCount,
                transactions: data.transactions.map(t => ({
                    date: t.date,
                    type: t.type,
                    docNumber: t.docNumber,
                    name: t.name,
                    memo: t.memo,
                    amount: t.amount,
                    debit: t.debit,
                    credit: t.credit,
                    account: t.account
                })),
                source: 'quickbooks-transaction-list-report'
            }
        });
    } catch (error) {
        console.error('Error fetching account transactions:', error);

        const isQBError = error.message && (
            error.message.includes('Not connected') ||
            error.message.includes('qbo') ||
            error.message.includes('token') ||
            error.message.includes('Token') ||
            error.message.includes('refresh')
        );

        if (isQBError) {
            return res.status(503).json({
                success: false,
                error: 'QuickBooks connection failed',
                message: 'QuickBooks connection expired. Please re-authenticate.',
                authUrl: '/api/quickbooks/auth-url'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch account transactions'
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

        // Fetch all transactions from QuickBooks directly (like /summary does)
        let income = [];
        let expenses = [];
        try {
            console.log('[transactions] Fetching from QuickBooks...');
            const results = await Promise.all([
                quickBooksService.getAllIncome(startDate, endDate),
                quickBooksService.getAllExpenses(startDate, endDate)
            ]);
            income = results[0] || [];
            expenses = results[1] || [];
            console.log(`[transactions] Fetched ${income.length} income and ${expenses.length} expense transactions`);
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
