const sequelize = require('../config/database');
const Statement = require('./Statement');
const UploadedExpense = require('./UploadedExpense');
const Listing = require('./Listing');
const EmailLog = require('./EmailLog');
const TagSchedule = require('./TagSchedule');
const TagNotification = require('./TagNotification');
const ScheduledEmail = require('./ScheduledEmail');
const EmailTemplate = require('./EmailTemplate');

// Initialize models
const models = {
    Statement,
    UploadedExpense,
    Listing,
    EmailLog,
    TagSchedule,
    TagNotification,
    ScheduledEmail,
    EmailTemplate,
    sequelize
};

// Sync database - DISABLED to prevent any schema/data modifications
// Tables already exist in production - use manual migrations for changes
async function syncDatabase() {
    try {
        // Just verify connection, don't sync models
        await sequelize.authenticate();
        console.log('Database connection verified');
    } catch (error) {
        console.error('Error connecting to database:', error);
        throw error;
    }
}

module.exports = {
    ...models,
    syncDatabase
};

