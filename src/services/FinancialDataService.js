const sequelize = require('../config/database');
const { QueryTypes, Op } = require('sequelize');

/**
 * FinancialDataService
 *
 * Service for managing financial dashboard data including:
 * - Property category assignments (arbitrage, home_owned, pm, shared, unrelated)
 * - QuickBooks account to expense category mappings
 * - Financial data caching for performance optimization
 */
class FinancialDataService {
    constructor() {
        this.sequelize = sequelize;

        // Valid home categories
        this.validHomeCategories = ['arbitrage', 'home_owned', 'pm', 'shared', 'unrelated'];
    }

    // ==================== PROPERTY CATEGORIES ====================

    /**
     * Assign a property to a home category
     * @param {number} propertyId - The property ID
     * @param {string} homeCategory - One of: arbitrage, home_owned, pm, shared, unrelated
     * @param {string|null} bankAccountId - Optional bank account ID
     * @param {string|null} notes - Optional notes
     * @returns {Promise<Object>} The created or updated property category
     */
    async assignPropertyCategory(propertyId, homeCategory, bankAccountId = null, notes = null) {
        try {
            // Validate home category
            if (!this.validHomeCategories.includes(homeCategory)) {
                throw new Error(`Invalid home category: ${homeCategory}. Must be one of: ${this.validHomeCategories.join(', ')}`);
            }

            // Upsert the property category
            const [result] = await this.sequelize.query(`
                INSERT INTO property_categories (property_id, home_category, bank_account_id, notes, created_at, updated_at)
                VALUES (:propertyId, :homeCategory, :bankAccountId, :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (property_id)
                DO UPDATE SET
                    home_category = EXCLUDED.home_category,
                    bank_account_id = EXCLUDED.bank_account_id,
                    notes = EXCLUDED.notes,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, {
                replacements: { propertyId, homeCategory, bankAccountId, notes },
                type: QueryTypes.SELECT
            });

            console.log(`Assigned property ${propertyId} to category ${homeCategory}`);
            return result;
        } catch (error) {
            console.error(`Error assigning property category for property ${propertyId}:`, error);
            throw error;
        }
    }

    /**
     * Get the category assignment for a property
     * @param {number} propertyId - The property ID
     * @returns {Promise<Object|null>} The property category or null if not found
     */
    async getPropertyCategory(propertyId) {
        try {
            const [result] = await this.sequelize.query(`
                SELECT * FROM property_categories WHERE property_id = :propertyId
            `, {
                replacements: { propertyId },
                type: QueryTypes.SELECT
            });

            return result || null;
        } catch (error) {
            console.error(`Error getting property category for property ${propertyId}:`, error);
            throw error;
        }
    }

    /**
     * Get all property category assignments
     * @param {string|null} homeCategory - Optional filter by home category
     * @returns {Promise<Array>} Array of property categories
     */
    async getAllPropertyCategories(homeCategory = null) {
        try {
            let query = 'SELECT * FROM property_categories';
            const replacements = {};

            if (homeCategory) {
                if (!this.validHomeCategories.includes(homeCategory)) {
                    throw new Error(`Invalid home category filter: ${homeCategory}`);
                }
                query += ' WHERE home_category = :homeCategory';
                replacements.homeCategory = homeCategory;
            }

            query += ' ORDER BY property_id';

            const results = await this.sequelize.query(query, {
                replacements,
                type: QueryTypes.SELECT
            });

            return results;
        } catch (error) {
            console.error('Error getting all property categories:', error);
            throw error;
        }
    }

    /**
     * Delete a property category assignment
     * @param {number} propertyId - The property ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async deletePropertyCategory(propertyId) {
        try {
            const [, metadata] = await this.sequelize.query(`
                DELETE FROM property_categories WHERE property_id = :propertyId
            `, {
                replacements: { propertyId }
            });

            const deleted = metadata.rowCount > 0;
            if (deleted) {
                console.log(`Deleted property category for property ${propertyId}`);
            }
            return deleted;
        } catch (error) {
            console.error(`Error deleting property category for property ${propertyId}:`, error);
            throw error;
        }
    }

    // ==================== QB CATEGORY MAPPINGS ====================

    /**
     * Map a QuickBooks account to an expense category
     * @param {string} qbAccountId - QuickBooks account ID
     * @param {string} qbAccountName - QuickBooks account display name
     * @param {string} expenseCategory - Internal expense category
     * @param {string|null} homeCategory - Optional home category filter
     * @param {boolean} isShared - Whether expense is shared across properties
     * @param {string|null} department - Optional department classification
     * @returns {Promise<Object>} The created or updated mapping
     */
    async mapQBCategory(qbAccountId, qbAccountName, expenseCategory, homeCategory = null, isShared = false, department = null) {
        try {
            // Validate home category if provided
            if (homeCategory && !this.validHomeCategories.includes(homeCategory)) {
                throw new Error(`Invalid home category: ${homeCategory}. Must be one of: ${this.validHomeCategories.join(', ')}`);
            }

            // Upsert the QB category mapping
            const [result] = await this.sequelize.query(`
                INSERT INTO qb_category_mappings (
                    qb_account_id, qb_account_name, expense_category,
                    home_category, is_shared, department, is_active,
                    created_at, updated_at
                )
                VALUES (
                    :qbAccountId, :qbAccountName, :expenseCategory,
                    :homeCategory, :isShared, :department, TRUE,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (qb_account_id, home_category)
                DO UPDATE SET
                    qb_account_name = EXCLUDED.qb_account_name,
                    expense_category = EXCLUDED.expense_category,
                    is_shared = EXCLUDED.is_shared,
                    department = EXCLUDED.department,
                    is_active = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, {
                replacements: {
                    qbAccountId,
                    qbAccountName,
                    expenseCategory,
                    homeCategory,
                    isShared,
                    department
                },
                type: QueryTypes.SELECT
            });

            console.log(`Mapped QB account ${qbAccountId} (${qbAccountName}) to category ${expenseCategory}`);
            return result;
        } catch (error) {
            console.error(`Error mapping QB category for account ${qbAccountId}:`, error);
            throw error;
        }
    }

    /**
     * Get QB category mapping by account ID
     * @param {string} qbAccountId - QuickBooks account ID
     * @param {string|null} homeCategory - Optional home category filter
     * @returns {Promise<Object|null>} The mapping or null if not found
     */
    async getQBCategoryMapping(qbAccountId, homeCategory = null) {
        try {
            let query = 'SELECT * FROM qb_category_mappings WHERE qb_account_id = :qbAccountId AND is_active = TRUE';
            const replacements = { qbAccountId };

            if (homeCategory !== null) {
                query += ' AND (home_category = :homeCategory OR home_category IS NULL)';
                replacements.homeCategory = homeCategory;
            }

            query += ' ORDER BY home_category NULLS LAST LIMIT 1';

            const [result] = await this.sequelize.query(query, {
                replacements,
                type: QueryTypes.SELECT
            });

            return result || null;
        } catch (error) {
            console.error(`Error getting QB category mapping for account ${qbAccountId}:`, error);
            throw error;
        }
    }

    /**
     * Get all QB category mappings
     * @param {Object} filters - Optional filters
     * @param {string} filters.expenseCategory - Filter by expense category
     * @param {string} filters.homeCategory - Filter by home category
     * @param {boolean} filters.isShared - Filter by shared flag
     * @param {boolean} filters.includeInactive - Include inactive mappings
     * @returns {Promise<Array>} Array of QB category mappings
     */
    async getAllQBCategoryMappings(filters = {}) {
        try {
            let query = 'SELECT * FROM qb_category_mappings WHERE 1=1';
            const replacements = {};

            if (!filters.includeInactive) {
                query += ' AND is_active = TRUE';
            }

            if (filters.expenseCategory) {
                query += ' AND expense_category = :expenseCategory';
                replacements.expenseCategory = filters.expenseCategory;
            }

            if (filters.homeCategory) {
                query += ' AND (home_category = :homeCategory OR home_category IS NULL)';
                replacements.homeCategory = filters.homeCategory;
            }

            if (filters.isShared !== undefined) {
                query += ' AND is_shared = :isShared';
                replacements.isShared = filters.isShared;
            }

            query += ' ORDER BY qb_account_name';

            const results = await this.sequelize.query(query, {
                replacements,
                type: QueryTypes.SELECT
            });

            return results;
        } catch (error) {
            console.error('Error getting all QB category mappings:', error);
            throw error;
        }
    }

    /**
     * Deactivate a QB category mapping
     * @param {number} mappingId - The mapping ID
     * @returns {Promise<boolean>} True if deactivated
     */
    async deactivateQBCategoryMapping(mappingId) {
        try {
            const [, metadata] = await this.sequelize.query(`
                UPDATE qb_category_mappings
                SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
                WHERE id = :mappingId
            `, {
                replacements: { mappingId }
            });

            const updated = metadata.rowCount > 0;
            if (updated) {
                console.log(`Deactivated QB category mapping ${mappingId}`);
            }
            return updated;
        } catch (error) {
            console.error(`Error deactivating QB category mapping ${mappingId}:`, error);
            throw error;
        }
    }

    // ==================== FINANCIAL CACHE ====================

    /**
     * Cache financial data for a property and month
     * @param {number} propertyId - The property ID
     * @param {Date|string} month - The month (first day of month)
     * @param {Object} data - Financial data to cache
     * @param {number} data.revenue - Total revenue
     * @param {number} data.expenses - Total expenses
     * @param {number} data.netIncome - Net income
     * @param {number} data.occupancyRate - Occupancy rate percentage
     * @param {number} data.reservationCount - Number of reservations
     * @param {number} data.averageDailyRate - Average daily rate
     * @param {Object} data.revenueBreakdown - Detailed revenue breakdown
     * @param {Object} data.expenseBreakdown - Detailed expense breakdown
     * @param {Object} data.metadata - Additional metadata
     * @param {Date|string} expiresAt - Optional expiration timestamp
     * @returns {Promise<Object>} The cached data entry
     */
    async cacheFinancialData(propertyId, month, data, expiresAt = null) {
        try {
            // Normalize month to first day of month
            const monthDate = new Date(month);
            const normalizedMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
            const monthStr = normalizedMonth.toISOString().split('T')[0];

            // Calculate net income if not provided
            const netIncome = data.netIncome !== undefined
                ? data.netIncome
                : (data.revenue || 0) - (data.expenses || 0);

            // Default expiration: end of next month
            const defaultExpiration = new Date(normalizedMonth);
            defaultExpiration.setMonth(defaultExpiration.getMonth() + 2);
            defaultExpiration.setDate(0); // Last day of next month
            const expiresAtStr = expiresAt ? new Date(expiresAt).toISOString() : defaultExpiration.toISOString();

            const [result] = await this.sequelize.query(`
                INSERT INTO financial_cache (
                    property_id, month, revenue, expenses, net_income,
                    occupancy_rate, reservation_count, average_daily_rate,
                    revenue_breakdown, expense_breakdown, metadata,
                    cache_version, expires_at, created_at, updated_at
                )
                VALUES (
                    :propertyId, :month, :revenue, :expenses, :netIncome,
                    :occupancyRate, :reservationCount, :averageDailyRate,
                    :revenueBreakdown, :expenseBreakdown, :metadata,
                    1, :expiresAt, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (property_id, month)
                DO UPDATE SET
                    revenue = EXCLUDED.revenue,
                    expenses = EXCLUDED.expenses,
                    net_income = EXCLUDED.net_income,
                    occupancy_rate = EXCLUDED.occupancy_rate,
                    reservation_count = EXCLUDED.reservation_count,
                    average_daily_rate = EXCLUDED.average_daily_rate,
                    revenue_breakdown = EXCLUDED.revenue_breakdown,
                    expense_breakdown = EXCLUDED.expense_breakdown,
                    metadata = EXCLUDED.metadata,
                    cache_version = financial_cache.cache_version + 1,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, {
                replacements: {
                    propertyId,
                    month: monthStr,
                    revenue: data.revenue || 0,
                    expenses: data.expenses || 0,
                    netIncome,
                    occupancyRate: data.occupancyRate || null,
                    reservationCount: data.reservationCount || 0,
                    averageDailyRate: data.averageDailyRate || null,
                    revenueBreakdown: data.revenueBreakdown ? JSON.stringify(data.revenueBreakdown) : null,
                    expenseBreakdown: data.expenseBreakdown ? JSON.stringify(data.expenseBreakdown) : null,
                    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
                    expiresAt: expiresAtStr
                },
                type: QueryTypes.SELECT
            });

            console.log(`Cached financial data for property ${propertyId}, month ${monthStr}`);
            return this._parseFinancialCacheResult(result);
        } catch (error) {
            console.error(`Error caching financial data for property ${propertyId}:`, error);
            throw error;
        }
    }

    /**
     * Get cached financial data for a property within a date range
     * @param {number} propertyId - The property ID
     * @param {Date|string} startDate - Start date
     * @param {Date|string} endDate - End date
     * @param {boolean} includeExpired - Whether to include expired cache entries
     * @returns {Promise<Array>} Array of cached financial data
     */
    async getFinancialCache(propertyId, startDate, endDate, includeExpired = false) {
        try {
            // Normalize dates to first day of month
            const startMonth = new Date(startDate);
            const startStr = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1).toISOString().split('T')[0];

            const endMonth = new Date(endDate);
            const endStr = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1).toISOString().split('T')[0];

            let query = `
                SELECT * FROM financial_cache
                WHERE property_id = :propertyId
                AND month >= :startDate
                AND month <= :endDate
            `;

            if (!includeExpired) {
                query += ' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)';
            }

            query += ' ORDER BY month ASC';

            const results = await this.sequelize.query(query, {
                replacements: {
                    propertyId,
                    startDate: startStr,
                    endDate: endStr
                },
                type: QueryTypes.SELECT
            });

            return results.map(r => this._parseFinancialCacheResult(r));
        } catch (error) {
            console.error(`Error getting financial cache for property ${propertyId}:`, error);
            throw error;
        }
    }

    /**
     * Get cached financial data for a specific month
     * @param {number} propertyId - The property ID
     * @param {Date|string} month - The month
     * @returns {Promise<Object|null>} Cached data or null if not found/expired
     */
    async getFinancialCacheForMonth(propertyId, month) {
        try {
            const monthDate = new Date(month);
            const monthStr = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString().split('T')[0];

            const [result] = await this.sequelize.query(`
                SELECT * FROM financial_cache
                WHERE property_id = :propertyId
                AND month = :month
                AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            `, {
                replacements: { propertyId, month: monthStr },
                type: QueryTypes.SELECT
            });

            return result ? this._parseFinancialCacheResult(result) : null;
        } catch (error) {
            console.error(`Error getting financial cache for property ${propertyId}, month ${month}:`, error);
            throw error;
        }
    }

    /**
     * Invalidate cached financial data for a property
     * @param {number} propertyId - The property ID
     * @param {Date|string|null} month - Optional specific month to invalidate
     * @returns {Promise<number>} Number of cache entries invalidated
     */
    async invalidateFinancialCache(propertyId, month = null) {
        try {
            let query = `
                UPDATE financial_cache
                SET expires_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE property_id = :propertyId
            `;
            const replacements = { propertyId };

            if (month) {
                const monthDate = new Date(month);
                const monthStr = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString().split('T')[0];
                query += ' AND month = :month';
                replacements.month = monthStr;
            }

            const [, metadata] = await this.sequelize.query(query, { replacements });

            console.log(`Invalidated ${metadata.rowCount} cache entries for property ${propertyId}`);
            return metadata.rowCount;
        } catch (error) {
            console.error(`Error invalidating financial cache for property ${propertyId}:`, error);
            throw error;
        }
    }

    /**
     * Delete expired cache entries (cleanup job)
     * @param {number} olderThanDays - Delete entries expired more than this many days ago
     * @returns {Promise<number>} Number of entries deleted
     */
    async cleanupExpiredCache(olderThanDays = 30) {
        try {
            const [, metadata] = await this.sequelize.query(`
                DELETE FROM financial_cache
                WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '${olderThanDays} days'
            `);

            console.log(`Cleaned up ${metadata.rowCount} expired cache entries`);
            return metadata.rowCount;
        } catch (error) {
            console.error('Error cleaning up expired cache:', error);
            throw error;
        }
    }

    /**
     * Get aggregated financial summary across multiple properties
     * @param {Array<number>} propertyIds - Array of property IDs
     * @param {Date|string} startDate - Start date
     * @param {Date|string} endDate - End date
     * @returns {Promise<Object>} Aggregated financial summary
     */
    async getAggregatedFinancialSummary(propertyIds, startDate, endDate) {
        try {
            const startMonth = new Date(startDate);
            const startStr = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1).toISOString().split('T')[0];

            const endMonth = new Date(endDate);
            const endStr = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1).toISOString().split('T')[0];

            const [result] = await this.sequelize.query(`
                SELECT
                    COUNT(DISTINCT property_id) as property_count,
                    SUM(revenue) as total_revenue,
                    SUM(expenses) as total_expenses,
                    SUM(net_income) as total_net_income,
                    AVG(occupancy_rate) as avg_occupancy_rate,
                    SUM(reservation_count) as total_reservations,
                    AVG(average_daily_rate) as avg_daily_rate
                FROM financial_cache
                WHERE property_id IN (:propertyIds)
                AND month >= :startDate
                AND month <= :endDate
                AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            `, {
                replacements: {
                    propertyIds,
                    startDate: startStr,
                    endDate: endStr
                },
                type: QueryTypes.SELECT
            });

            return {
                propertyCount: parseInt(result.property_count) || 0,
                totalRevenue: parseFloat(result.total_revenue) || 0,
                totalExpenses: parseFloat(result.total_expenses) || 0,
                totalNetIncome: parseFloat(result.total_net_income) || 0,
                avgOccupancyRate: parseFloat(result.avg_occupancy_rate) || null,
                totalReservations: parseInt(result.total_reservations) || 0,
                avgDailyRate: parseFloat(result.avg_daily_rate) || null
            };
        } catch (error) {
            console.error('Error getting aggregated financial summary:', error);
            throw error;
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Parse JSON fields in financial cache result
     * @private
     */
    _parseFinancialCacheResult(result) {
        if (!result) return null;

        return {
            ...result,
            revenue: parseFloat(result.revenue) || 0,
            expenses: parseFloat(result.expenses) || 0,
            net_income: parseFloat(result.net_income) || 0,
            occupancy_rate: result.occupancy_rate ? parseFloat(result.occupancy_rate) : null,
            reservation_count: parseInt(result.reservation_count) || 0,
            average_daily_rate: result.average_daily_rate ? parseFloat(result.average_daily_rate) : null,
            revenue_breakdown: typeof result.revenue_breakdown === 'string'
                ? JSON.parse(result.revenue_breakdown)
                : result.revenue_breakdown,
            expense_breakdown: typeof result.expense_breakdown === 'string'
                ? JSON.parse(result.expense_breakdown)
                : result.expense_breakdown,
            metadata: typeof result.metadata === 'string'
                ? JSON.parse(result.metadata)
                : result.metadata
        };
    }

    /**
     * Check database connection
     * @returns {Promise<boolean>} True if connected
     */
    async checkConnection() {
        try {
            await this.sequelize.authenticate();
            return true;
        } catch (error) {
            console.error('Database connection check failed:', error);
            return false;
        }
    }
}

module.exports = new FinancialDataService();
