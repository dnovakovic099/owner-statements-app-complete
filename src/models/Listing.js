const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Listing = sequelize.define('Listing', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        comment: 'Hostify listing ID'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Original name from Hostify (used for mapping)'
    },
    displayName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'display_name',
        comment: 'Custom display name (used in dropdowns and UI)'
    },
    nickname: {
        type: DataTypes.STRING,
        allowNull: true
    },
    street: {
        type: DataTypes.STRING,
        allowNull: true
    },
    city: {
        type: DataTypes.STRING,
        allowNull: true
    },
    state: {
        type: DataTypes.STRING,
        allowNull: true
    },
    country: {
        type: DataTypes.STRING,
        allowNull: true
    },
    pmFeePercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 15.00,
        field: 'pm_fee_percentage',
        comment: 'Property Management fee percentage (e.g., 15.00 for 15%)'
    },
    isCohostOnAirbnb: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_cohost_on_airbnb',
        comment: 'If true, Airbnb revenue will be excluded from statement calculations'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
    },
    lastSyncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_synced_at',
        comment: 'Last time data was synced from Hostify'
    }
}, {
    tableName: 'listings',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['name']
        },
        {
            fields: ['is_active']
        }
    ]
});

module.exports = Listing;

