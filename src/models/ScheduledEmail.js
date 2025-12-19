const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScheduledEmail = sequelize.define('ScheduledEmail', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    statementId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'statement_id'
    },
    propertyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'property_id'
    },
    recipientEmail: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'recipient_email'
    },
    recipientName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'recipient_name'
    },
    propertyName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'property_name'
    },
    frequencyTag: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'frequency_tag'
    },
    scheduledFor: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'scheduled_for'
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending'
        // Values: pending, sent, cancelled, failed
    },
    sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'sent_at'
    },
    errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'error_message'
    }
}, {
    tableName: 'scheduled_emails',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['statement_id'] },
        { fields: ['status'] },
        { fields: ['scheduled_for'] },
        { fields: ['created_at'] }
    ]
});

module.exports = ScheduledEmail;
