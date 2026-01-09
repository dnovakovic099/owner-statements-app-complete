const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

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
