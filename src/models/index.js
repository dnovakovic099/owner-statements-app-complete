const sequelize = require('../config/database');
const Statement = require('./Statement');
const UploadedExpense = require('./UploadedExpense');
const Listing = require('./Listing');
const PropertyMapping = require('./PropertyMapping');

// Initialize models
const models = {
    Statement,
    UploadedExpense,
    Listing,
    PropertyMapping,
    sequelize
};

// Sync database
async function syncDatabase() {
    try {
        // In production, use { alter: true } to automatically adjust schema
        // In development, use { force: false } to preserve data
        const syncOptions = process.env.NODE_ENV === 'production' 
            ? { alter: true } 
            : { force: false };
        
        await sequelize.sync(syncOptions);
        console.log('✅ Database models synchronized');
    } catch (error) {
        console.error('❌ Error synchronizing database:', error);
        throw error;
    }
}

module.exports = {
    ...models,
    syncDatabase
};

