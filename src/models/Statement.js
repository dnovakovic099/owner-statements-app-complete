const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Statement = sequelize.define('Statement', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'owner_id'
    },
    ownerName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'owner_name'
    },
    propertyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'property_id'
    },
    propertyIds: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'property_ids',
        comment: 'Array of property IDs for combined statements'
    },
    propertyName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'property_name'
    },
    propertyNames: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'property_names',
        comment: 'Full list of property names for combined statements'
    },
    isCombinedStatement: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_combined_statement'
    },
    weekStartDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'week_start_date'
    },
    weekEndDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'week_end_date'
    },
    calculationType: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'checkout',
        field: 'calculation_type'
    },
    totalRevenue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'total_revenue'
    },
    totalExpenses: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'total_expenses'
    },
    pmCommission: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'pm_commission'
    },
    pmPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 15,
        field: 'pm_percentage'
    },
    techFees: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'tech_fees'
    },
    insuranceFees: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'insurance_fees'
    },
    adjustments: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    ownerPayout: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'owner_payout'
    },
    isCohostOnAirbnb: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_cohost_on_airbnb'
    },
    cleaningFeePassThrough: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'cleaning_fee_pass_through'
    },
    totalCleaningFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'total_cleaning_fee'
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'draft'
    },
    sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'sent_at'
    },
    // Store complex data as JSON
    reservations: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    expenses: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    items: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    duplicateWarnings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        field: 'duplicate_warnings'
    },
    cleaningMismatchWarning: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        field: 'cleaning_mismatch_warning'
    },
    shouldConvertToCalendar: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'should_convert_to_calendar'
    },
    internalNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        field: 'internal_notes',
        comment: 'Snapshot of internal notes at time of statement creation/finalization'
    }
}, {
    tableName: 'statements',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['property_id'] },
        { fields: ['owner_id'] },
        { fields: ['status'] },
        { fields: ['week_start_date', 'week_end_date'] },
        { fields: ['property_id', 'week_start_date', 'week_end_date'] }
    ]
});

module.exports = Statement;

