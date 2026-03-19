const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AppLog = sequelize.define('AppLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    level: {
        type: DataTypes.STRING(10),
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    context: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'app_logs',
    timestamps: false,
    indexes: [
        { fields: ['level'] },
        { fields: ['timestamp'] },
        { fields: ['context'] }
    ]
});

module.exports = AppLog;
