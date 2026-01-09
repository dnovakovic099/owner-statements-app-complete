const sequelize = require('../config/database');
const Statement = require('./Statement');
const UploadedExpense = require('./UploadedExpense');
const Listing = require('./Listing');
const ListingGroup = require('./ListingGroup');
const EmailLog = require('./EmailLog');
const TagSchedule = require('./TagSchedule');
const TagNotification = require('./TagNotification');
const ScheduledEmail = require('./ScheduledEmail');
const EmailTemplate = require('./EmailTemplate');
const User = require('./User');
const ActivityLog = require('./ActivityLog');

// Set up associations
// ListingGroup has many Listings
ListingGroup.hasMany(Listing, {
    foreignKey: 'groupId',
    as: 'listings',
    onDelete: 'SET NULL'
});

// Listing belongs to ListingGroup
Listing.belongsTo(ListingGroup, {
    foreignKey: 'groupId',
    as: 'group'
});

// Initialize models
const models = {
    Statement,
    UploadedExpense,
    Listing,
    ListingGroup,
    EmailLog,
    TagSchedule,
    TagNotification,
    ScheduledEmail,
    EmailTemplate,
    User,
    ActivityLog,
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

