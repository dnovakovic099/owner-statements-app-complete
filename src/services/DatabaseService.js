const { Statement, UploadedExpense } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

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
            console.log(`[DatabaseService] resetStatementSequence() - dialect: ${dialectName}`);

            if (dialectName !== 'postgres') {
                console.log('[DatabaseService] Sequence reset skipped (not PostgreSQL)');
                return;
            }

            // First, get current max ID for logging
            const [maxResult] = await sequelize.query("SELECT MAX(id) as max_id FROM statements");
            const currentMaxId = maxResult[0]?.max_id || 0;
            console.log(`[DatabaseService] Current max statement ID: ${currentMaxId}`);

            // Get current sequence value
            const [seqResult] = await sequelize.query("SELECT last_value FROM statements_id_seq");
            const currentSeqValue = seqResult[0]?.last_value || 0;
            console.log(`[DatabaseService] Current sequence value: ${currentSeqValue}`);

            // Reset sequence to max + 1
            const [results] = await sequelize.query(
                "SELECT setval('statements_id_seq', COALESCE((SELECT MAX(id) FROM statements), 0) + 1, false)"
            );
            const newSeqValue = results[0]?.setval;
            console.log(`[DatabaseService] Reset statements_id_seq: ${currentSeqValue} -> ${newSeqValue}`);
        } catch (err) {
            console.error('[DatabaseService] Error resetting sequence:', err.message);
            console.error('[DatabaseService] Full error:', err);
        }
    }

    async saveStatement(statementData, retryCount = 0) {
        const logPrefix = `[DatabaseService.saveStatement]`;

        console.log(`${logPrefix} Called with retryCount=${retryCount}`);
        console.log(`${logPrefix} Input data - id: ${statementData.id}, groupId: ${statementData.groupId}, groupName: ${statementData.groupName}, propertyName: ${statementData.propertyName}`);

        try {
            // Check if statement already exists
            if (statementData.id) {
                console.log(`${logPrefix} Checking for existing statement with id=${statementData.id}`);
                const existing = await Statement.findByPk(statementData.id);
                if (existing) {
                    console.log(`${logPrefix} Found existing statement, updating...`);
                    // Remove fields that Sequelize manages automatically
                    const { createdAt, updatedAt, created_at, updated_at, ...dataToUpdate } = statementData;

                    // Update existing statement
                    // Sequelize will automatically update the updated_at timestamp
                    await existing.update(dataToUpdate);

                    // Reload to get the updated timestamp
                    await existing.reload();

                    console.log(`${logPrefix} Updated statement ${statementData.id} (updated_at: ${existing.updatedAt})`);
                    return existing.toJSON();
                } else {
                    console.log(`${logPrefix} Statement with id=${statementData.id} not found, will create new`);
                }
            }

            // Create new statement if it doesn't exist
            // Remove any id field to let the database auto-generate it
            console.log(`${logPrefix} Creating new statement (removing id field to let DB auto-generate)`);
            const { id, createdAt, updatedAt, created_at, updated_at, ...dataToCreate } = statementData;

            console.log(`${logPrefix} Calling Statement.create()...`);
            const statement = await Statement.create(dataToCreate);
            console.log(`${logPrefix} SUCCESS - Created statement with id=${statement.id} for "${dataToCreate.propertyName || dataToCreate.groupName}"`);
            return statement.toJSON();
        } catch (error) {
            console.log(`${logPrefix} ERROR caught: ${error.name} - ${error.message}`);

            // Handle duplicate key constraint error (sequence out of sync)
            const isUniqueConstraintError = error.name === 'SequelizeUniqueConstraintError';
            const hasIdError = error.errors && error.errors.some(e => e.path === 'id');
            const canRetry = retryCount < 3;

            console.log(`${logPrefix} Error analysis: isUniqueConstraintError=${isUniqueConstraintError}, hasIdError=${hasIdError}, canRetry=${canRetry}`);

            if (error.errors) {
                console.log(`${logPrefix} Error details:`, error.errors.map(e => ({ path: e.path, type: e.type, message: e.message })));
            }

            if (isUniqueConstraintError && hasIdError && canRetry) {
                console.log(`${logPrefix} Duplicate key error on 'id' field - will reset sequence and retry (attempt ${retryCount + 1}/3)`);
                await this.resetStatementSequence();

                // Retry without the id field
                const { id, ...dataWithoutId } = statementData;
                console.log(`${logPrefix} Retrying saveStatement...`);
                return this.saveStatement(dataWithoutId, retryCount + 1);
            }

            console.error(`${logPrefix} FAILED - Error saving statement:`, error);
            console.error(`${logPrefix} Statement data (truncated):`, JSON.stringify(statementData, null, 2).substring(0, 500));
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
            console.error('Error fetching statements from database:', error);
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
            console.error(`Error fetching statement ${id} from database:`, error);
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
            console.log(`Updated statement ${id} in database`);
            return statement.toJSON();
        } catch (error) {
            console.error(`Error updating statement ${id}:`, error);
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
            console.log(`Deleted statement ${id} from database`);
            return true;
        } catch (error) {
            console.error(`Error deleting statement ${id}:`, error);
            throw error;
        }
    }

    async generateId(existingStatements) {
        // For database, we don't need this - auto-increment handles it
        // But keep for compatibility
        const maxId = await Statement.max('id');
        return (maxId || 0) + 1;
    }

    // ==================== UPLOADED EXPENSES ====================

    async saveUploadedExpense(expenseData) {
        try {
            const expense = await UploadedExpense.create(expenseData);
            console.log(`Saved uploaded expense ${expense.id} to database`);
            return expense.toJSON();
        } catch (error) {
            console.error('Error saving uploaded expense to database:', error);
            throw error;
        }
    }

    async saveUploadedExpenses(expensesArray) {
        try {
            const expenses = await UploadedExpense.bulkCreate(expensesArray);
            console.log(`Saved ${expenses.length} uploaded expenses to database`);
            return expenses.map(e => e.toJSON());
        } catch (error) {
            console.error('Error bulk saving uploaded expenses:', error);
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
            console.error('Error fetching uploaded expenses from database:', error);
            throw error;
        }
    }

    async deleteUploadedExpensesByFilename(filename) {
        try {
            const count = await UploadedExpense.destroy({
                where: { uploadFilename: filename }
            });
            console.log(`Deleted ${count} uploaded expenses with filename ${filename}`);
            return count;
        } catch (error) {
            console.error(`Error deleting uploaded expenses for ${filename}:`, error);
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
            console.error('Error fetching upload filenames:', error);
            throw error;
        }
    }
}

module.exports = new DatabaseService();

