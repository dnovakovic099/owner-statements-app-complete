/**
 * StatementsFinancialService
 *
 * Encapsulates all financial database queries against the statements table.
 * Uses Sequelize ORM with the existing PostgreSQL connection.
 */

const { Op, fn, col, literal } = require('sequelize');
const Statement = require('../models/Statement');
const sequelize = require('../config/database');

class StatementsFinancialService {
    /**
     * Get financial summary for a date range
     * Returns totals from statements table
     *
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Summary with totalIncome, totalExpenses, statementCount
     */
    async getSummary(startDate, endDate) {
        const result = await Statement.findOne({
            attributes: [
                [fn('COALESCE', fn('SUM', col('total_revenue')), 0), 'total_income'],
                [fn('COALESCE', fn('SUM', col('total_expenses')), 0), 'total_expenses'],
                [fn('COUNT', '*'), 'statement_count']
            ],
            where: {
                // Overlap check: statement overlaps with date range if
                // statement ends >= range start AND statement starts <= range end
                weekEndDate: { [Op.gte]: startDate },
                weekStartDate: { [Op.lte]: endDate }
            },
            raw: true
        });

        const totalIncome = parseFloat(result.total_income) || 0;
        const totalExpenses = parseFloat(result.total_expenses) || 0;

        return {
            totalIncome,
            totalExpenses,
            statementCount: parseInt(result.statement_count) || 0,
            netIncome: totalIncome - totalExpenses,
            profitMargin: totalIncome > 0
                ? (((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(2)
                : 0
        };
    }

    /**
     * Get time series data for monthly income/expenses
     * Used for trend charts
     *
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Monthly data [{month, income, expenses}]
     */
    async getTimeSeries(startDate, endDate) {
        // Initialize all months in range with zero values
        const monthlyData = {};
        const currentDate = new Date(startDate);
        const endDateObj = new Date(endDate);

        while (currentDate <= endDateObj) {
            const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[monthKey] = { income: 0, expenses: 0 };
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        // Get monthly aggregated financials from statements table
        const monthlyStats = await Statement.findAll({
            attributes: [
                [fn('TO_CHAR', col('week_end_date'), 'YYYY-MM'), 'month'],
                [fn('COALESCE', fn('SUM', col('total_revenue')), 0), 'total_income'],
                [fn('COALESCE', fn('SUM', col('total_expenses')), 0), 'total_expenses']
            ],
            where: {
                weekEndDate: { [Op.gte]: startDate },
                weekStartDate: { [Op.lte]: endDate }
            },
            group: [fn('TO_CHAR', col('week_end_date'), 'YYYY-MM')],
            order: [[fn('TO_CHAR', col('week_end_date'), 'YYYY-MM'), 'ASC']],
            raw: true
        });

        // Merge database results with initialized months
        monthlyStats.forEach(row => {
            if (monthlyData[row.month]) {
                monthlyData[row.month].income = parseFloat(row.total_income) || 0;
                monthlyData[row.month].expenses = parseFloat(row.total_expenses) || 0;
            }
        });

        // Convert to array format
        return Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({
                month,
                income: data.income,
                expenses: data.expenses,
                net: data.income - data.expenses
            }));
    }

    /**
     * Get financials grouped by property (home category breakdown)
     * Returns per-property income/expenses for categorization
     *
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Map of property_id -> {income, expenses}
     */
    async getByHomeCategory(startDate, endDate) {
        const results = await Statement.findAll({
            attributes: [
                'propertyId',
                'propertyName',
                [fn('COALESCE', fn('SUM', col('total_revenue')), 0), 'total_income'],
                [fn('COALESCE', fn('SUM', col('total_expenses')), 0), 'total_expenses']
            ],
            where: {
                weekEndDate: { [Op.gte]: startDate },
                weekStartDate: { [Op.lte]: endDate }
            },
            group: ['propertyId', 'propertyName'],
            order: [[fn('SUM', col('total_revenue')), 'DESC']],
            raw: true
        });

        // Build lookup map by property_id
        const financialsByProperty = new Map();
        results.forEach(row => {
            financialsByProperty.set(row.propertyId, {
                propertyId: row.propertyId,
                propertyName: row.propertyName,
                income: parseFloat(row.total_income) || 0,
                expenses: parseFloat(row.total_expenses) || 0,
                netIncome: (parseFloat(row.total_income) || 0) - (parseFloat(row.total_expenses) || 0)
            });
        });

        return {
            byProperty: financialsByProperty,
            properties: results.map(row => ({
                propertyId: row.propertyId,
                propertyName: row.propertyName,
                income: parseFloat(row.total_income) || 0,
                expenses: parseFloat(row.total_expenses) || 0,
                netIncome: (parseFloat(row.total_income) || 0) - (parseFloat(row.total_expenses) || 0)
            }))
        };
    }

    /**
     * Get by-category breakdown (property-level grouping)
     * Used for category pie charts
     *
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {number} limit - Maximum number of categories to return
     * @returns {Promise<Object>} {income: [], expenses: []} category breakdowns
     */
    async getByCategory(startDate, endDate, limit = 20) {
        const results = await Statement.findAll({
            attributes: [
                ['property_name', 'name'],
                [fn('COALESCE', fn('SUM', col('total_revenue')), 0), 'total_income'],
                [fn('COALESCE', fn('SUM', col('total_expenses')), 0), 'total_expenses']
            ],
            where: {
                weekEndDate: { [Op.gte]: startDate },
                weekStartDate: { [Op.lte]: endDate }
            },
            group: ['property_name'],
            order: [[fn('SUM', col('total_revenue')), 'DESC']],
            limit,
            raw: true
        });

        const income = [];
        const expenses = [];

        results.forEach(row => {
            const totalIncome = parseFloat(row.total_income) || 0;
            const totalExpenses = parseFloat(row.total_expenses) || 0;

            if (totalIncome > 0) {
                income.push({
                    CategoryName: row.name,
                    Amount: totalIncome,
                    Type: 'Revenue'
                });
            }
            if (totalExpenses > 0) {
                expenses.push({
                    CategoryName: row.name,
                    Amount: totalExpenses,
                    Type: 'Expense'
                });
            }
        });

        return { income, expenses };
    }

    /**
     * Get performance metrics with trends
     * Returns comprehensive metrics including monthly trends and averages
     *
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {number} months - Number of months in the range (for average calculations)
     * @returns {Promise<Object>} Performance metrics
     */
    async getMetrics(startDate, endDate, months = 12) {
        // Initialize all months in range
        const monthlyTotals = {};
        const currentDate = new Date(startDate);
        const endDateObj = new Date(endDate);

        while (currentDate <= endDateObj) {
            const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            monthlyTotals[monthKey] = { income: 0, expenses: 0, reservations: 0 };
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        // Get monthly aggregated financials
        const monthlyStats = await Statement.findAll({
            attributes: [
                [fn('TO_CHAR', col('week_end_date'), 'YYYY-MM'), 'month'],
                [fn('COALESCE', fn('SUM', col('total_revenue')), 0), 'total_income'],
                [fn('COALESCE', fn('SUM', col('total_expenses')), 0), 'total_expenses'],
                [fn('COUNT', '*'), 'statement_count'],
                [fn('COALESCE', fn('SUM', fn('JSON_ARRAY_LENGTH', col('reservations'))), 0), 'reservation_count']
            ],
            where: {
                weekEndDate: { [Op.gte]: startDate },
                weekStartDate: { [Op.lte]: endDate }
            },
            group: [fn('TO_CHAR', col('week_end_date'), 'YYYY-MM')],
            order: [[fn('TO_CHAR', col('week_end_date'), 'YYYY-MM'), 'ASC']],
            raw: true
        });

        let totalIncome = 0;
        let totalExpenses = 0;
        let totalReservations = 0;

        monthlyStats.forEach(row => {
            const income = parseFloat(row.total_income) || 0;
            const expenses = parseFloat(row.total_expenses) || 0;
            const reservations = parseInt(row.reservation_count) || 0;

            if (monthlyTotals[row.month]) {
                monthlyTotals[row.month].income = income;
                monthlyTotals[row.month].expenses = expenses;
                monthlyTotals[row.month].reservations = reservations;
            }
            totalIncome += income;
            totalExpenses += expenses;
            totalReservations += reservations;
        });

        // Estimate nights (avg 3 nights per reservation)
        const totalNights = totalReservations * 3;

        // Convert to array with net calculation
        const monthlyArray = Object.entries(monthlyTotals)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({
                month,
                income: data.income,
                expenses: data.expenses,
                reservations: data.reservations,
                net: data.income - data.expenses
            }));

        // Calculate month-over-month trends
        const trends = monthlyArray.map((current, index) => {
            if (index === 0) {
                return { ...current, incomeChange: 0, expenseChange: 0, netChange: 0 };
            }
            const previous = monthlyArray[index - 1];
            return {
                ...current,
                incomeChange: previous.income > 0
                    ? Number((((current.income - previous.income) / previous.income) * 100).toFixed(2))
                    : 0,
                expenseChange: previous.expenses > 0
                    ? Number((((current.expenses - previous.expenses) / previous.expenses) * 100).toFixed(2))
                    : 0,
                netChange: previous.net !== 0
                    ? Number((((current.net - previous.net) / Math.abs(previous.net)) * 100).toFixed(2))
                    : 0
            };
        });

        // Calculate averages
        const avgMonthlyIncome = months > 0 ? totalIncome / months : 0;
        const avgMonthlyExpenses = months > 0 ? totalExpenses / months : 0;
        const avgMonthlyNet = months > 0 ? (totalIncome - totalExpenses) / months : 0;
        const avgReservationsPerMonth = months > 0 ? totalReservations / months : 0;
        const avgNightsPerReservation = totalReservations > 0 ? totalNights / totalReservations : 0;
        const avgRevenuePerReservation = totalReservations > 0 ? totalIncome / totalReservations : 0;
        const avgRevenuePerNight = totalNights > 0 ? totalIncome / totalNights : 0;

        // ROI calculations
        const annualizedIncome = avgMonthlyIncome * 12;
        const annualizedExpenses = avgMonthlyExpenses * 12;
        const annualizedNet = avgMonthlyNet * 12;
        const operatingMargin = totalIncome > 0
            ? Number(((totalIncome - totalExpenses) / totalIncome * 100).toFixed(2))
            : 0;

        // Find best and worst months
        const bestMonth = trends.reduce((best, curr) =>
            curr.net > (best?.net ?? -Infinity) ? curr : best, null);
        const worstMonth = trends.reduce((worst, curr) =>
            curr.net < (worst?.net ?? Infinity) ? curr : worst, null);

        // Average monthly growth
        const avgMonthlyGrowth = trends.length > 1
            ? Number((trends.slice(1).reduce((sum, t) => sum + (t.netChange || 0), 0) / (trends.length - 1)).toFixed(2))
            : 0;

        return {
            summary: {
                totalIncome,
                totalExpenses,
                netIncome: totalIncome - totalExpenses,
                operatingMargin,
                totalReservations,
                totalNights,
                activeProperties: totalReservations > 0 ? Math.ceil(totalReservations / months) : 0
            },
            averages: {
                monthlyIncome: avgMonthlyIncome,
                monthlyExpenses: avgMonthlyExpenses,
                monthlyNet: avgMonthlyNet,
                reservationsPerMonth: avgReservationsPerMonth,
                nightsPerReservation: avgNightsPerReservation,
                revenuePerReservation: avgRevenuePerReservation,
                revenuePerNight: avgRevenuePerNight,
                revenuePerProperty: totalIncome / (totalReservations > 0 ? Math.ceil(totalReservations / months) : 1)
            },
            annualized: {
                income: annualizedIncome,
                expenses: annualizedExpenses,
                netIncome: annualizedNet
            },
            trends,
            performance: {
                bestMonth,
                worstMonth,
                averageMonthlyGrowth: avgMonthlyGrowth
            }
        };
    }

    /**
     * Get financial data for a specific property
     *
     * @param {number} propertyId - Property ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Property financial data
     */
    async getPropertyFinancials(propertyId, startDate, endDate) {
        const result = await Statement.findOne({
            attributes: [
                'propertyId',
                'propertyName',
                [fn('COALESCE', fn('SUM', col('total_revenue')), 0), 'total_income'],
                [fn('COALESCE', fn('SUM', col('total_expenses')), 0), 'total_expenses'],
                [fn('COUNT', '*'), 'statement_count']
            ],
            where: {
                propertyId,
                weekEndDate: { [Op.gte]: startDate },
                weekStartDate: { [Op.lte]: endDate }
            },
            group: ['propertyId', 'propertyName'],
            raw: true
        });

        if (!result) {
            return {
                propertyId,
                propertyName: null,
                totalIncome: 0,
                totalExpenses: 0,
                netIncome: 0,
                statementCount: 0
            };
        }

        const totalIncome = parseFloat(result.total_income) || 0;
        const totalExpenses = parseFloat(result.total_expenses) || 0;

        return {
            propertyId: result.propertyId,
            propertyName: result.propertyName,
            totalIncome,
            totalExpenses,
            netIncome: totalIncome - totalExpenses,
            statementCount: parseInt(result.statement_count) || 0
        };
    }

    /**
     * Get statement details with reservations and expenses for a property
     *
     * @param {number} propertyId - Property ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Statement records
     */
    async getPropertyStatements(propertyId, startDate, endDate) {
        const results = await Statement.findAll({
            where: {
                propertyId,
                weekEndDate: { [Op.gte]: startDate },
                weekStartDate: { [Op.lte]: endDate }
            },
            order: [['weekEndDate', 'DESC']]
        });

        return results.map(row => row.toJSON());
    }

    /**
     * Check if database is accessible
     * @returns {Promise<boolean>} True if database is accessible
     */
    async isAvailable() {
        try {
            await sequelize.authenticate();
            return true;
        } catch (error) {
            console.warn('StatementsFinancialService: Database not available:', error.message);
            return false;
        }
    }
}

// Export singleton instance
module.exports = new StatementsFinancialService();
module.exports.StatementsFinancialService = StatementsFinancialService;
