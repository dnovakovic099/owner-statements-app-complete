const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * EmailTemplate Model
 * Stores customizable email templates with variable placeholders
 *
 * Available variables:
 * - {{ownerName}} - Owner's name
 * - {{propertyName}} - Property name
 * - {{periodStart}} - Statement period start date
 * - {{periodEnd}} - Statement period end date
 * - {{periodDisplay}} - Formatted period (e.g., "Nov 24-Dec 1, 2025")
 * - {{ownerPayout}} - Payout amount (formatted with currency)
 * - {{balanceSuffix}} - "(Balance Due)" if negative, empty if positive
 * - {{companyName}} - Company name
 */
const EmailTemplate = sequelize.define('EmailTemplate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Template name for identification'
    },
    frequencyType: {
        type: DataTypes.ENUM('weekly', 'bi-weekly', 'monthly', 'custom'),
        allowNull: false,
        defaultValue: 'custom',
        comment: 'Which frequency this template is used for'
    },
    isDefault: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'If true, this is the default template for the frequency type'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'If false, template is disabled'
    },
    subject: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'Email subject line (supports variables)'
    },
    htmlBody: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'HTML email body (supports variables)'
    },
    textBody: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Plain text email body (supports variables)'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Optional description of what this template is for'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'email_templates',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['frequency_type', 'is_default']
        },
        {
            fields: ['is_active']
        }
    ]
});

/**
 * Available template variables with descriptions
 */
EmailTemplate.AVAILABLE_VARIABLES = [
    // Owner & Property
    { name: 'ownerName', description: 'Owner\'s name (e.g., "John")', category: 'owner' },
    { name: 'propertyName', description: 'Property name (e.g., "Beach House")', category: 'property' },

    // Period
    { name: 'periodStart', description: 'Period start date (e.g., "2025-12-01")', category: 'period' },
    { name: 'periodEnd', description: 'Period end date (e.g., "2025-12-14")', category: 'period' },
    { name: 'periodDisplay', description: 'Formatted period (e.g., "Dec 1-14, 2025")', category: 'period' },

    // Statement Amounts
    { name: 'ownerPayout', description: 'Final payout amount (e.g., "$2,513.57")', category: 'amount' },
    { name: 'rawPayout', description: 'Raw payout number (e.g., "2513.57")', category: 'amount' },
    { name: 'totalRevenue', description: 'Total revenue (e.g., "$3,500.00")', category: 'amount' },
    { name: 'totalExpenses', description: 'Total expenses (e.g., "$500.00")', category: 'amount' },
    { name: 'pmCommission', description: 'PM commission amount (e.g., "$350.00")', category: 'amount' },
    { name: 'pmPercentage', description: 'PM commission percentage (e.g., "10%")', category: 'amount' },
    { name: 'techFees', description: 'Tech fees amount (e.g., "$50.00")', category: 'amount' },
    { name: 'insuranceFees', description: 'Insurance fees (e.g., "$25.00")', category: 'amount' },
    { name: 'adjustments', description: 'Adjustments amount (e.g., "$100.00")', category: 'amount' },
    { name: 'cleaningFees', description: 'Total cleaning fees (e.g., "$150.00")', category: 'amount' },

    // Status
    { name: 'balanceSuffix', description: '"(Balance Due)" if negative, empty if positive', category: 'status' },
    { name: 'isNegativeBalance', description: '"true" if negative balance, "false" otherwise', category: 'status' },

    // General
    { name: 'companyName', description: 'Company name from settings', category: 'general' },
    { name: 'currentDate', description: 'Today\'s date', category: 'general' },
    { name: 'currentYear', description: 'Current year (e.g., "2025")', category: 'general' }
];

/**
 * Replace variables in template text
 * @param {string} text - Template text with {{variable}} placeholders
 * @param {Object} data - Data object with variable values
 * @returns {string} Text with variables replaced
 */
EmailTemplate.replaceVariables = (text, data) => {
    if (!text) return text;

    let result = text;

    // Replace each variable
    for (const variable of EmailTemplate.AVAILABLE_VARIABLES) {
        const placeholder = `{{${variable.name}}}`;
        const value = data[variable.name] ?? '';
        result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return result;
};

module.exports = EmailTemplate;
