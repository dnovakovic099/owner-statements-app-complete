const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

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
    airbnbPassThroughTax: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'airbnb_pass_through_tax',
        comment: 'If true, Airbnb tax is passed to client (not remitted by Airbnb), so tax is added to gross payout'
    },
    disregardTax: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'disregard_tax',
        comment: 'If true, tax is never added to gross payout (company remits tax on behalf of owner)'
    },
    cleaningFeePassThrough: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'cleaning_fee_pass_through',
        comment: 'If true, owner pays guest cleaning fee instead of actual cleaning expense'
    },
    excludeCleaningFromCommission: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'exclude_cleaning_from_commission',
        comment: 'If true, guest-paid cleaning fee is subtracted from revenue before computing PM commission'
    },
    cleaningFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        field: 'cleaning_fee',
        comment: 'Default cleaning fee amount from Hostify (used when reservation cleaningFee is 0)'
    },
    guestPaidDamageCoverage: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'guest_paid_damage_coverage',
        comment: 'If true, show Guest Paid Damage Coverage column (resort fee) on statements'
    },
    includeChildListings: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'include_child_listings',
        comment: 'If true, reservations from child listings will be included in statements'
    },
    waiveCommission: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'waive_commission',
        comment: 'If true, PM commission is waived (shown but not deducted from payout)'
    },
    waiveCommissionUntil: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'waive_commission_until',
        comment: 'Date until which commission waiver is active (inclusive)'
    },
    newPmFeeEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'new_pm_fee_enabled',
        comment: 'If true, a new PM fee percentage is applied to reservations created on/after the start date'
    },
    newPmFeePercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'new_pm_fee_percentage',
        comment: 'New PM fee percentage for reservations created on/after newPmFeeStartDate'
    },
    newPmFeeStartDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'new_pm_fee_start_date',
        comment: 'Date from which the new PM fee percentage applies (based on reservation created_at)'
    },
    defaultPetFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        field: 'default_pet_fee',
        comment: 'Default pet fee amount for this listing (used when not available from API)'
    },
    tags: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Comma-separated tags for grouping and filtering listings',
        get() {
            const value = this.getDataValue('tags');
            return value ? value.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        },
        set(value) {
            if (Array.isArray(value)) {
                const filtered = value.filter(tag => tag && tag.trim()).join(',');
                // Only update if new value is non-empty — prevents accidental clearing
                if (filtered) {
                    this.setDataValue('tags', filtered);
                }
                // To explicitly clear tags, pass null directly
            } else if (typeof value === 'string' && value.trim()) {
                this.setDataValue('tags', value);
            } else if (value === null) {
                // Only explicit null clears tags (not empty string or empty array)
                this.setDataValue('tags', null);
            }
        }
    },
    ownerEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'owner_email',
        comment: 'Owner email address for automated statement emails'
    },
    ownerGreeting: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'owner_greeting',
        comment: 'Name to use in email greeting (e.g., "John" for "Dear John,")'
    },
    autoSendStatements: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'auto_send_statements',
        comment: 'If true, automatically send statements via email for this listing'
    },
    internalNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'internal_notes',
        comment: 'Internal notes about this listing (visible in app, NOT on PDF statements)'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
    },
    groupId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'group_id',
        comment: 'Foreign key to listing_groups table (null = ungrouped)'
    },
    payoutStatus: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'missing',
        field: 'payout_status',
        comment: 'Payout info status for this listing (missing, pending, on_file)'
    },
    payoutNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'payout_notes',
        comment: 'Notes about payout collection/status'
    },
    wiseRecipientId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'wise_recipient_id',
        comment: 'Encrypted: Wise recipient account ID for owner payouts',
        get() {
            const value = this.getDataValue('wiseRecipientId');
            if (!value) return null;
            try { return decryptOptional(value); } catch (e) { return value; }
        },
        set(value) {
            this.setDataValue('wiseRecipientId', value ? encryptOptional(value) : null);
        }
    },
    wiseStatus: {
        type: DataTypes.STRING(30),
        allowNull: false,
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
    payoutInviteExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'payout_invite_expires_at'
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
