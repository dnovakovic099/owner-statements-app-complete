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
    },
    // Group fields for auto-generated group statements
    groupId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'group_id',
        comment: 'Reference to listing_groups for group-based statements'
    },
    groupName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'group_name',
        comment: 'Name of the group at time of statement generation'
    },
    groupTags: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'group_tags',
        comment: 'Tags of the group at time of statement generation'
    },
    // Payout tracking fields
    payoutTransferId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'payout_transfer_id',
        comment: 'Stripe transfer ID when owner has been paid'
    },
    payoutStatus: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'payout_status',
        comment: 'pending | paid | failed'
    },
    paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'paid_at',
        comment: 'Timestamp when payout was completed'
    },
    payoutError: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'payout_error',
        comment: 'Error message if payout failed'
    },
    stripeFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'stripe_fee',
        comment: 'Stripe Connect fee (0.25%) added on top of payout'
    },
    totalTransferAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'total_transfer_amount',
        comment: 'Total amount transferred (ownerPayout + stripeFee)'
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
        { fields: ['property_id', 'week_start_date', 'week_end_date'] },
        // Composite indexes for analytics queries (overlap conditions)
        { fields: ['week_start_date', 'property_id'] },
        { fields: ['group_id', 'week_start_date'] },
        { fields: ['status', 'week_start_date'] },
        // For owner payment queries and reporting
        { fields: ['owner_id', 'week_start_date'] },
        // For filtering by total_revenue/owner_payout (excludes $0 activity)
        { fields: ['week_start_date', 'total_revenue'] },
        { fields: ['week_start_date', 'owner_payout'] }
    ]
});

module.exports = Statement;

