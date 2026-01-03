const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * QuickBooks OAuth Tokens
 * Stored in database for multi-worker support
 */
const QuickBooksToken = sequelize.define('QuickBooksToken', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    companyId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        field: 'company_id',
        comment: 'QuickBooks Company/Realm ID'
    },
    accessToken: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'access_token'
    },
    refreshToken: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'refresh_token'
    },
    tokenExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'token_expires_at',
        comment: 'When the access token expires'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
    }
}, {
    tableName: 'quickbooks_tokens',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = QuickBooksToken;
