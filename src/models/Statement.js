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
    propertyName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'property_name'
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
    }
}, {
    tableName: 'statements',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = Statement;

