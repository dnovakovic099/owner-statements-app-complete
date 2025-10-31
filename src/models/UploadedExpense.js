const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UploadedExpense = sequelize.define('UploadedExpense', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    propertyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'property_id'
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'other'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'manual'
    },
    sourceId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'source_id'
    },
    invoiceNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'invoice_number'
    },
    vendor: {
        type: DataTypes.STRING,
        allowNull: true
    },
    category: {
        type: DataTypes.STRING,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    listing: {
        type: DataTypes.STRING,
        allowNull: true
    },
    uploadFilename: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'upload_filename'
    }
}, {
    tableName: 'uploaded_expenses',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = UploadedExpense;

