const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');

const ActivityLog = sequelize.define('ActivityLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'user_id'
    },
    username: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    action: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    resource: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    resourceId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'resource_id'
    },
    details: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'ip_address'
    },
    userAgent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'user_agent'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    }
}, {
    tableName: 'activity_logs',
    timestamps: false,
    indexes: [
        { fields: ['user_id'] },
        { fields: ['action'] },
        { fields: ['resource'] },
        { fields: ['created_at'] }
    ]
});

// Helper to log activity
ActivityLog.log = async function(req, action, resource, resourceId = null, details = null) {
    try {
        // Get username from req.user, or from details if available
        let username = req.user?.username;
        if (!username && details?.username) {
            username = details.username;
        }
        username = username || 'Anonymous';

        await this.create({
            userId: req.user?.id || null,
            username,
            action,
            resource,
            resourceId: resourceId ? String(resourceId) : null,
            details: details ? JSON.stringify(details) : null,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers?.['user-agent']?.substring(0, 500)
        });
    } catch (error) {
        logger.error('Failed to log activity', { context: 'ActivityLog', error: error.message });
    }
};

// Helper to log system-generated activity (no HTTP request)
ActivityLog.logSystem = async function(action, resource, resourceId = null, details = null) {
    try {
        await this.create({
            userId: null,
            username: 'System',
            action,
            resource,
            resourceId: resourceId ? String(resourceId) : null,
            details: details ? JSON.stringify(details) : null,
            ipAddress: null,
            userAgent: 'TagScheduleService/AutoGeneration'
        });
    } catch (error) {
        logger.error('Failed to log system activity', { context: 'ActivityLog', error: error.message });
    }
};

module.exports = ActivityLog;
