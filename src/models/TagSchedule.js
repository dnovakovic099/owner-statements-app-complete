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
        comment: 'DEPRECATED: For biweekly A/B system (no longer used)'
    },
    biweeklyStartDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'biweekly_start_date',
        defaultValue: '2026-01-19',
        comment: 'Reference start date for bi-weekly schedule (runs every 2 weeks from this date)'
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
    },
    // Period config fields for email sending
    periodDays: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'period_days',
        comment: 'Number of days for the statement period (e.g., 7 for weekly, 14 for bi-weekly)'
    },
    calculationType: {
        type: DataTypes.ENUM('checkout', 'calendar'),
        allowNull: true,
        field: 'calculation_type',
        defaultValue: 'checkout',
        comment: 'Statement calculation type: checkout or calendar based'
    },
    templateId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'template_id',
        comment: 'ID of the email template to use for this tag'
    },
    skipDates: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'skip_dates',
        comment: 'JSON array of dates (YYYY-MM-DD) to skip auto-generation',
        get() {
            const value = this.getDataValue('skipDates');
            return value ? JSON.parse(value) : [];
        },
        set(value) {
            this.setDataValue('skipDates', value ? JSON.stringify(value) : null);
        }
    }
}, {
    tableName: 'tag_schedules',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = TagSchedule;
