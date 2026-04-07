const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AppConfig = sequelize.define('AppConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
    },
    value: {
        type: DataTypes.TEXT, // JSON string
        allowNull: true,
        get() {
            const raw = this.getDataValue('value');
            try { return raw ? JSON.parse(raw) : null; } catch { return raw; }
        },
        set(val) {
            this.setDataValue('value', typeof val === 'string' ? val : JSON.stringify(val));
        }
    }
}, {
    tableName: 'app_configs',
    timestamps: true
});

module.exports = AppConfig;
