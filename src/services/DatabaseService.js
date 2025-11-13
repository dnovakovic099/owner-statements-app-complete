const { Statement, UploadedExpense } = require('../models');
const { Op } = require('sequelize');

class DatabaseService {
    // ==================== STATEMENTS ====================
    
    async saveStatement(statementData) {
        try {
            // Check if statement already exists
            if (statementData.id) {
                const existing = await Statement.findByPk(statementData.id);
                if (existing) {
                    // Remove fields that Sequelize manages automatically
                    const { createdAt, updatedAt, created_at, updated_at, ...dataToUpdate } = statementData;
                    
                    // Update existing statement
                    // Sequelize will automatically update the updated_at timestamp
                    await existing.update(dataToUpdate);
                    
                    // Reload to get the updated timestamp
                    await existing.reload();
                    
                    console.log(`✅ Updated statement ${statementData.id} in database (updated_at: ${existing.updatedAt})`);
                    return existing.toJSON();
                }
            }
            
            // Create new statement if it doesn't exist
            const { createdAt, updatedAt, created_at, updated_at, ...dataToCreate } = statementData;
            const statement = await Statement.create(dataToCreate);
            console.log(`✅ Created statement ${statement.id} in database`);
            return statement.toJSON();
        } catch (error) {
            console.error('Error saving statement to database:', error);
            console.error('Statement data:', JSON.stringify(statementData, null, 2).substring(0, 500));
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

            return statements.map(s => s.toJSON());
        } catch (error) {
            console.error('Error fetching statements from database:', error);
            throw error;
        }
    }

    async getStatementById(id) {
        try {
            const statement = await Statement.findByPk(id);
            return statement ? statement.toJSON() : null;
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
            console.log(`✅ Updated statement ${id} in database`);
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
            console.log(`✅ Deleted statement ${id} from database`);
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
            console.log(`✅ Saved uploaded expense ${expense.id} to database`);
            return expense.toJSON();
        } catch (error) {
            console.error('Error saving uploaded expense to database:', error);
            throw error;
        }
    }

    async saveUploadedExpenses(expensesArray) {
        try {
            const expenses = await UploadedExpense.bulkCreate(expensesArray);
            console.log(`✅ Saved ${expenses.length} uploaded expenses to database`);
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
            console.log(`✅ Deleted ${count} uploaded expenses with filename ${filename}`);
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

