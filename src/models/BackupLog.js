const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BackupLog = sequelize.define('BackupLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    success: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    tiers: {
        type: DataTypes.TEXT, // JSON array: ["3-hourly","daily"]
        allowNull: true,
        get() {
            const raw = this.getDataValue('tiers');
            try { return raw ? JSON.parse(raw) : []; } catch { return []; }
        },
        set(val) {
            this.setDataValue('tiers', JSON.stringify(val));
        }
    },
    backupMethod: {
        type: DataTypes.STRING(20), // pg_dump | sequelize_json
        allowNull: true,
        field: 'backup_method'
    },
    rawSizeMB: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'raw_size_mb'
    },
    compressedSizeMB: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'compressed_size_mb'
    },
    emailed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    emailPending: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'email_pending'
    },
    emailRetries: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'email_retries'
    },
    verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    elapsed: {
        type: DataTypes.STRING(10),
        allowNull: true
    },
    filename: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    error: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'backup_logs',
    timestamps: false,
    indexes: [
        { fields: ['timestamp'] },
        { fields: ['success'] },
        { fields: ['email_pending'] }
    ]
});

module.exports = BackupLog;
