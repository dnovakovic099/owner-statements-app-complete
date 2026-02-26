const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

const ListingGroup = sequelize.define('ListingGroup', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'Unique name for the group (e.g., "Smith Properties")'
    },
    tags: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Comma-separated schedule tags (e.g., "WEEKLY" or "WEEKLY,MONTHLY")',
        get() {
            const value = this.getDataValue('tags');
            return value ? value.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        },
        set(value) {
            if (Array.isArray(value)) {
                this.setDataValue('tags', value.filter(tag => tag).join(','));
            } else if (typeof value === 'string') {
                this.setDataValue('tags', value);
            } else {
                this.setDataValue('tags', null);
            }
        }
    },
    calculationType: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: 'checkout',
        field: 'calculation_type',
        comment: 'Statement calculation method: checkout or calendar'
    },
    stripeAccountId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'stripe_account_id',
        comment: 'Stripe Connect account ID for the group owner (overrides individual listings)',
        get() {
            const value = this.getDataValue('stripeAccountId');
            if (!value) return null;
            try {
                return decryptOptional(value);
            } catch (e) {
                return value;
            }
        },
        set(value) {
            if (value) {
                this.setDataValue('stripeAccountId', encryptOptional(value));
            } else {
                this.setDataValue('stripeAccountId', null);
            }
        }
    },
    stripeOnboardingStatus: {
        type: DataTypes.STRING(30),
        allowNull: true,
        defaultValue: 'missing',
        field: 'stripe_onboarding_status',
        comment: 'Stripe onboarding status: missing, pending, verified, requires_action'
    }
}, {
    tableName: 'listing_groups',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['name'],
            unique: true
        }
    ]
});

module.exports = ListingGroup;
