const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TagNotification = sequelize.define('TagNotification', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    tagName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'tag_name',
        comment: 'The tag name this notification is for'
    },
    scheduleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'schedule_id',
        comment: 'Reference to the TagSchedule that triggered this notification'
    },
    message: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Notification message to display'
    },
    status: {
        type: DataTypes.ENUM('unread', 'read', 'dismissed', 'actioned'),
        allowNull: false,
        defaultValue: 'unread',
        comment: 'Notification status'
    },
    listingCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'listing_count',
        comment: 'Number of listings with this tag at time of notification'
    },
    scheduledFor: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'scheduled_for',
        comment: 'The scheduled time this notification was created for'
    },
    readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'read_at',
        comment: 'When the notification was read'
    },
    actionedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'actioned_at',
        comment: 'When the user took action (clicked through to send emails)'
    }
}, {
    tableName: 'tag_notifications',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['status']
        },
        {
            fields: ['tag_name']
        },
        {
            fields: ['scheduled_for']
        }
    ]
});

module.exports = TagNotification;
