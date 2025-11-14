const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * PropertyMapping Model
 * Maps Hostify property IDs to SecureStay listing names
 * This allows for manual overrides when automatic name matching fails
 */
const PropertyMapping = sequelize.define('PropertyMapping', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    hostifyPropertyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        field: 'hostify_property_id',
        comment: 'Hostify property ID (e.g., 300017826)'
    },
    hostifyPropertyName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'hostify_property_name',
        comment: 'Hostify property name/nickname for reference'
    },
    secureStayListingName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'securestay_listing_name',
        comment: 'SecureStay listing name (e.g., "101st full house - Kurush")'
    },
    secureStayListingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'securestay_listing_id',
        comment: 'SecureStay internal listing ID (listingMapId)'
    },
    mappingType: {
        type: DataTypes.ENUM('auto', 'manual'),
        defaultValue: 'manual',
        field: 'mapping_type',
        comment: 'Whether this mapping was auto-detected or manually created'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
        comment: 'Whether this mapping is currently active'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Optional notes about this mapping'
    },
    createdBy: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'created_by',
        comment: 'User who created this mapping'
    },
    lastVerified: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_verified',
        comment: 'When this mapping was last verified as correct'
    }
}, {
    tableName: 'property_mappings',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['hostify_property_id']
        },
        {
            fields: ['securestay_listing_name']
        },
        {
            fields: ['is_active']
        }
    ]
});

module.exports = PropertyMapping;

