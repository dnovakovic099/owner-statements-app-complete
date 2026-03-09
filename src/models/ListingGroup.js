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
    wiseRecipientId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'wise_recipient_id',
        comment: 'Wise recipient ID for the group owner (overrides individual listings)',
        get() {
            const value = this.getDataValue('wiseRecipientId');
            if (!value) return null;
            try {
                return decryptOptional(value);
            } catch (e) {
                return value;
            }
        },
        set(value) {
            if (value) {
                this.setDataValue('wiseRecipientId', encryptOptional(value));
            } else {
                this.setDataValue('wiseRecipientId', null);
            }
        }
    },
    wiseStatus: {
        type: DataTypes.STRING(30),
        allowNull: true,
        defaultValue: 'missing',
        field: 'wise_status',
        comment: 'Wise setup status: missing, pending, verified, requires_action'
    },
    payoutInviteToken: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'payout_invite_token',
        comment: 'Token for payout setup invite link'
    },
    bankAccountHolder: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'bank_account_holder',
        comment: 'Encrypted: account holder name for payouts',
        get() {
            const v = this.getDataValue('bankAccountHolder');
            if (!v) return null;
            try { return decryptOptional(v); } catch (e) { return v; }
        },
        set(value) { this.setDataValue('bankAccountHolder', value ? encryptOptional(value) : null); }
    },
    bankEmail: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'bank_email',
        comment: 'Encrypted: email associated with bank account',
        get() {
            const v = this.getDataValue('bankEmail');
            if (!v) return null;
            try { return decryptOptional(v); } catch (e) { return v; }
        },
        set(value) { this.setDataValue('bankEmail', value ? encryptOptional(value) : null); }
    },
    bankRoutingNumber: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'bank_routing_number',
        comment: 'Encrypted: ABA routing number',
        get() {
            const v = this.getDataValue('bankRoutingNumber');
            if (!v) return null;
            try { return decryptOptional(v); } catch (e) { return v; }
        },
        set(value) { this.setDataValue('bankRoutingNumber', value ? encryptOptional(value) : null); }
    },
    bankAccountNumber: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'bank_account_number',
        comment: 'Encrypted: bank account number',
        get() {
            const v = this.getDataValue('bankAccountNumber');
            if (!v) return null;
            try { return decryptOptional(v); } catch (e) { return v; }
        },
        set(value) { this.setDataValue('bankAccountNumber', value ? encryptOptional(value) : null); }
    },
    bankAccountType: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'bank_account_type',
        comment: 'CHECKING or SAVINGS'
    },
    bankAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'bank_address',
        comment: 'Encrypted: JSON with street, city, state, zip',
        get() {
            const v = this.getDataValue('bankAddress');
            if (!v) return null;
            try { return decryptOptional(v); } catch (e) { return v; }
        },
        set(value) { this.setDataValue('bankAddress', value ? encryptOptional(value) : null); }
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
