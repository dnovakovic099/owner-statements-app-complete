const { Statement, UploadedExpense } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');

class DatabaseService {
    // ==================== STATEMENTS ====================

    /**
     * Reset the PostgreSQL sequence for statements table
     * This is needed when manual inserts or imports leave the sequence out of sync
     */
    async resetStatementSequence() {
        try {
            // Only works for PostgreSQL
            const dialectName = sequelize.getDialect();
            logger.debug(`resetStatementSequence() - dialect: ${dialectName}`, { context: 'DatabaseService', action: 'resetStatementSequence' });

            if (dialectName !== 'postgres') {
                logger.debug('Sequence reset skipped (not PostgreSQL)', { context: 'DatabaseService', action: 'resetStatementSequence' });
                return;
            }

            // First, get current max ID for logging
            const [maxResult] = await sequelize.query("SELECT MAX(id) as max_id FROM statements");
            const currentMaxId = maxResult[0]?.max_id || 0;
            logger.debug(`Current max statement ID: ${currentMaxId}`, { context: 'DatabaseService', action: 'resetStatementSequence' });

            // Get current sequence value
            const [seqResult] = await sequelize.query("SELECT last_value FROM statements_id_seq");
            const currentSeqValue = seqResult[0]?.last_value || 0;
            logger.debug(`Current sequence value: ${currentSeqValue}`, { context: 'DatabaseService', action: 'resetStatementSequence' });

            // Reset sequence to max + 1
            const [results] = await sequelize.query(
                "SELECT setval('statements_id_seq', COALESCE((SELECT MAX(id) FROM statements), 0) + 1, false)"
            );
            const newSeqValue = results[0]?.setval;
            logger.info(`Reset statements_id_seq: ${currentSeqValue} -> ${newSeqValue}`, { context: 'DatabaseService', action: 'resetStatementSequence' });
        } catch (err) {
            logger.logError(err, { context: 'DatabaseService', action: 'resetStatementSequence' });
        }
    }

    async saveStatement(statementData, retryCount = 0) {
        const logContext = { context: 'DatabaseService', action: 'saveStatement' };

        logger.debug(`Called with retryCount=${retryCount}`, logContext);
        logger.debug(`Input data - id: ${statementData.id}, groupId: ${statementData.groupId}, groupName: ${statementData.groupName}, propertyName: ${statementData.propertyName}`, logContext);

        try {
            // Check if statement already exists
            if (statementData.id) {
                logger.debug(`Checking for existing statement with id=${statementData.id}`, logContext);
                const existing = await Statement.findByPk(statementData.id);
                if (existing) {
                    logger.debug('Found existing statement, updating...', logContext);
                    // Remove fields that Sequelize manages automatically
                    const { createdAt, updatedAt, created_at, updated_at, ...dataToUpdate } = statementData;

                    // Update existing statement
                    // Sequelize will automatically update the updated_at timestamp
                    await existing.update(dataToUpdate);

                    // Reload to get the updated timestamp
                    await existing.reload();

                    logger.info(`Updated statement ${statementData.id} (updated_at: ${existing.updated_at})`, logContext);
                    return existing.toJSON();
                } else {
                    logger.debug(`Statement with id=${statementData.id} not found, will create new`, logContext);
                }
            }

            // Create new statement if it doesn't exist
            // Remove any id field to let the database auto-generate it
            logger.debug('Creating new statement (removing id field to let DB auto-generate)', logContext);
            const { id, createdAt, updatedAt, created_at, updated_at, ...dataToCreate } = statementData;

            logger.debug('Calling Statement.create()...', logContext);
            const statement = await Statement.create(dataToCreate);
            logger.info(`SUCCESS - Created statement with id=${statement.id} for "${dataToCreate.propertyName || dataToCreate.groupName}"`, logContext);
            return statement.toJSON();
        } catch (error) {
            logger.debug(`ERROR caught: ${error.name} - ${error.message}`, logContext);

            // Handle duplicate key constraint error (sequence out of sync)
            const isUniqueConstraintError = error.name === 'SequelizeUniqueConstraintError';
            const hasIdError = error.errors && error.errors.some(e => e.path === 'id');
            const canRetry = retryCount < 3;

            logger.debug(`Error analysis: isUniqueConstraintError=${isUniqueConstraintError}, hasIdError=${hasIdError}, canRetry=${canRetry}`, logContext);

            if (error.errors) {
                logger.debug(`Error details: ${JSON.stringify(error.errors.map(e => ({ path: e.path, type: e.type, message: e.message })))}`, logContext);
            }

            if (isUniqueConstraintError && hasIdError && canRetry) {
                logger.info(`Duplicate key error on 'id' field - will reset sequence and retry (attempt ${retryCount + 1}/3)`, logContext);
                await this.resetStatementSequence();

                // Retry without the id field
                const { id, ...dataWithoutId } = statementData;
                logger.debug('Retrying saveStatement...', logContext);
                return this.saveStatement(dataWithoutId, retryCount + 1);
            }

            logger.logError(error, { ...logContext, statementData: JSON.stringify(statementData).substring(0, 500) });
            throw error;
        }
    }

    async getStatements(filters = {}) {
        try {
            const where = {};

            if (filters.ownerId) {
                where.ownerId = filters.ownerId;
            }

            if (filters.propertyId) {
                where.propertyId = filters.propertyId;
            }

            if (filters.status) {
                where.status = filters.status;
            }

            if (filters.startDate && filters.endDate) {
                where.weekStartDate = {
                    [Op.gte]: filters.startDate
                };
                where.weekEndDate = {
                    [Op.lte]: filters.endDate
                };
            }

            const statements = await Statement.findAll({
                where,
                order: [
                    ['totalRevenue', 'DESC'],
                    ['created_at', 'DESC']
                ]
            });

            return statements.map(s => {
                const json = s.toJSON();
                // Ensure createdAt and updatedAt are in camelCase for frontend
                if (json.created_at && !json.createdAt) {
                    json.createdAt = json.created_at;
                }
                if (json.updated_at && !json.updatedAt) {
                    json.updatedAt = json.updated_at;
                }
                return json;
            });
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'getStatements' });
            throw error;
        }
    }

    async getStatementById(id) {
        try {
            const statement = await Statement.findByPk(id);
            if (!statement) return null;
            
            const json = statement.toJSON();
            // Ensure createdAt and updatedAt are in camelCase for frontend
            if (json.created_at && !json.createdAt) {
                json.createdAt = json.created_at;
            }
            if (json.updated_at && !json.updatedAt) {
                json.updatedAt = json.updated_at;
            }
            return json;
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'getStatementById', id });
            throw error;
        }
    }

    async updateStatement(id, updates) {
        try {
            const statement = await Statement.findByPk(id);
            if (!statement) {
                throw new Error(`Statement ${id} not found`);
            }

            await statement.update(updates);
            logger.info(`Updated statement ${id} in database`, { context: 'DatabaseService', action: 'updateStatement' });
            return statement.toJSON();
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'updateStatement', id });
            throw error;
        }
    }

    async deleteStatement(id) {
        try {
            const statement = await Statement.findByPk(id);
            if (!statement) {
                throw new Error(`Statement ${id} not found`);
            }

            await statement.destroy();
            logger.info(`Deleted statement ${id} from database`, { context: 'DatabaseService', action: 'deleteStatement' });
            return true;
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'deleteStatement', id });
            throw error;
        }
    }

    async generateId(existingStatements) {
        // For database, we don't need this - auto-increment handles it
        // But keep for compatibility
        const maxId = await Statement.max('id');
        return (maxId || 0) + 1;
    }

    /**
     * Get expenses from prior finalized/sent/paid statements for duplicate detection.
     * Checks both single-property and group statements that share any of the given property IDs.
     * @param {number[]} propertyIds - Array of property IDs to check
     * @param {number|null} excludeStatementId - Statement ID to exclude (the one being generated)
     * @returns {Array<{id, expenses, weekStartDate, weekEndDate, propertyName}>}
     */
    async getPriorStatementExpenses(propertyIds, excludeStatementId = null) {
        try {
            const where = {
                status: { [Op.in]: ['final', 'sent', 'paid'] }
            };

            if (excludeStatementId) {
                where.id = { [Op.ne]: excludeStatementId };
            }

            const statements = await Statement.findAll({
                where,
                attributes: ['id', 'expenses', 'weekStartDate', 'weekEndDate', 'propertyName', 'propertyId', 'propertyIds'],
                order: [['created_at', 'DESC']],
                limit: 20
            });

            // Filter to only statements that overlap with the given propertyIds
            const propertyIdSet = new Set(propertyIds.map(id => parseInt(id)));
            const matching = statements.filter(s => {
                const json = s.toJSON();
                // Check single propertyId
                if (json.propertyId && propertyIdSet.has(parseInt(json.propertyId))) return true;
                // Check propertyIds array (for group/combined statements)
                const stmtPropertyIds = json.propertyIds || [];
                if (Array.isArray(stmtPropertyIds)) {
                    return stmtPropertyIds.some(pid => propertyIdSet.has(parseInt(pid)));
                }
                return false;
            });

            return matching.map(s => {
                const json = s.toJSON();
                return {
                    id: json.id,
                    expenses: json.expenses || [],
                    weekStartDate: json.weekStartDate,
                    weekEndDate: json.weekEndDate,
                    propertyName: json.propertyName
                };
            });
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'getPriorStatementExpenses' });
            return [];
        }
    }

    // ==================== UPLOADED EXPENSES ====================

    async saveUploadedExpense(expenseData) {
        try {
            const expense = await UploadedExpense.create(expenseData);
            logger.debug(`Saved uploaded expense ${expense.id} to database`, { context: 'DatabaseService', action: 'saveUploadedExpense' });
            return expense.toJSON();
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'saveUploadedExpense' });
            throw error;
        }
    }

    async saveUploadedExpenses(expensesArray) {
        try {
            const expenses = await UploadedExpense.bulkCreate(expensesArray);
            logger.info(`Saved ${expenses.length} uploaded expenses to database`, { context: 'DatabaseService', action: 'saveUploadedExpenses' });
            return expenses.map(e => e.toJSON());
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'saveUploadedExpenses' });
            throw error;
        }
    }

    async getUploadedExpenses(filters = {}) {
        try {
            const where = {};

            if (filters.propertyId) {
                where.propertyId = filters.propertyId;
            }

            if (filters.startDate && filters.endDate) {
                where.date = {
                    [Op.between]: [filters.startDate, filters.endDate]
                };
            } else if (filters.startDate) {
                where.date = {
                    [Op.gte]: filters.startDate
                };
            } else if (filters.endDate) {
                where.date = {
                    [Op.lte]: filters.endDate
                };
            }

            if (filters.uploadFilename) {
                where.uploadFilename = filters.uploadFilename;
            }

            const expenses = await UploadedExpense.findAll({
                where,
                order: [['date', 'DESC']]
            });

            return expenses.map(e => e.toJSON());
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'getUploadedExpenses' });
            throw error;
        }
    }

    async deleteUploadedExpensesByFilename(filename) {
        try {
            const count = await UploadedExpense.destroy({
                where: { uploadFilename: filename }
            });
            logger.info(`Deleted ${count} uploaded expenses with filename ${filename}`, { context: 'DatabaseService', action: 'deleteUploadedExpensesByFilename' });
            return count;
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'deleteUploadedExpensesByFilename', filename });
            throw error;
        }
    }

    async getUploadFilenames() {
        try {
            const results = await UploadedExpense.findAll({
                attributes: ['uploadFilename'],
                group: ['uploadFilename'],
                where: {
                    uploadFilename: {
                        [Op.ne]: null
                    }
                }
            });
            return results.map(r => r.uploadFilename).filter(Boolean);
        } catch (error) {
            logger.logError(error, { context: 'DatabaseService', action: 'getUploadFilenames' });
            throw error;
        }
    }
}

module.exports = new DatabaseService();

