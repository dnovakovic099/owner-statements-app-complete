const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmailLog = sequelize.define('EmailLog', {
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
        allowNull: true,
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
    subject: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending'
        // Values: pending, sent, failed, bounced
    },
    messageId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'message_id'
    },
    errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'error_message'
    },
    errorCode: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'error_code'
    },
    attemptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'attempted_at'
    },
    sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'sent_at'
    },
    retryCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'retry_count'
    },
    metadata: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
            const value = this.getDataValue('metadata');
            return value ? JSON.parse(value) : null;
        },
        set(value) {
            this.setDataValue('metadata', value ? JSON.stringify(value) : null);
        }
    }
}, {
    tableName: 'email_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['statement_id'] },
        { fields: ['status'] },
        { fields: ['recipient_email'] },
        { fields: ['created_at'] }
    ]
});

module.exports = EmailLog;
