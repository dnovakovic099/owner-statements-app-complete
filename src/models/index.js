const sequelize = require('../config/database');
const Statement = require('./Statement');
const UploadedExpense = require('./UploadedExpense');
const Listing = require('./Listing');

// Initialize models
const models = {
    Statement,
    UploadedExpense,
    Listing,
    sequelize
};

// Sync database
async function syncDatabase() {
    try {
        // Use force: false to only create tables if they don't exist
        // Schema changes should be done via manual migrations
        await sequelize.sync({ force: false });
        console.log('Database models synchronized');
    } catch (error) {
        console.error('Error synchronizing database:', error);
        throw error;
    }
}

module.exports = {
    ...models,
    syncDatabase
};

