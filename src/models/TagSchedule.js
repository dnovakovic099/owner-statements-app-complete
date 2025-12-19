const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TagSchedule = sequelize.define('TagSchedule', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    tagName: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        field: 'tag_name',
        comment: 'The tag name this schedule applies to (e.g., WEEKLY, BI-WEEKLY A)'
    },
    isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_enabled',
        comment: 'Whether this schedule is active'
    },
    frequencyType: {
        type: DataTypes.ENUM('weekly', 'biweekly', 'monthly'),
        allowNull: false,
        field: 'frequency_type',
        comment: 'Type of schedule frequency'
    },
    dayOfWeek: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'day_of_week',
        comment: 'Day of week (0=Sunday, 1=Monday, ..., 6=Saturday) for weekly/biweekly'
    },
    dayOfMonth: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'day_of_month',
        comment: 'Day of month (1-31) for monthly schedules'
    },
    timeOfDay: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: '09:00',
        field: 'time_of_day',
        comment: 'Time of day in HH:MM format (24-hour)'
    },
    biweeklyWeek: {
        type: DataTypes.ENUM('A', 'B'),
        allowNull: true,
        field: 'biweekly_week',
        comment: 'For biweekly: A=odd weeks, B=even weeks'
    },
    lastNotifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_notified_at',
        comment: 'Last time a notification was generated for this schedule'
    },
    nextScheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'next_scheduled_at',
        comment: 'Next scheduled notification time (calculated)'
    }
}, {
    tableName: 'tag_schedules',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = TagSchedule;
