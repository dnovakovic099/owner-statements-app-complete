const express = require('express');
const router = express.Router();
const { EmailTemplate } = require('../models');

/**
 * GET /api/email-templates
 * Get all email templates
 */
router.get('/', async (req, res) => {
    try {
        const { frequencyType, isActive } = req.query;

        const where = {};
        if (frequencyType) where.frequencyType = frequencyType;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const templates = await EmailTemplate.findAll({
            where,
            order: [['frequencyType', 'ASC'], ['isDefault', 'DESC'], ['name', 'ASC']]
        });

        res.json({
            templates,
            variables: EmailTemplate.AVAILABLE_VARIABLES
        });
    } catch (error) {
        console.error('Error fetching email templates:', error);
        res.status(500).json({ error: 'Failed to fetch email templates' });
    }
});

/**
 * GET /api/email-templates/variables
 * Get available template variables
 */
router.get('/variables', async (req, res) => {
    try {
        res.json({
            variables: EmailTemplate.AVAILABLE_VARIABLES
        });
    } catch (error) {
        console.error('Error fetching template variables:', error);
        res.status(500).json({ error: 'Failed to fetch template variables' });
    }
});

/**
 * GET /api/email-templates/:id
 * Get a single email template
 */
router.get('/:id', async (req, res) => {
    try {
        const template = await EmailTemplate.findByPk(req.params.id);

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ template });
    } catch (error) {
        console.error('Error fetching email template:', error);
        res.status(500).json({ error: 'Failed to fetch email template' });
    }
});

/**
 * POST /api/email-templates
 * Create a new email template
 */
router.post('/', async (req, res) => {
    try {
        const { name, frequencyType, calculationType, tags, subject, htmlBody, textBody, description, isDefault } = req.body;

        if (!name || !subject || !htmlBody) {
            return res.status(400).json({ error: 'Name, subject, and htmlBody are required' });
        }

        // If setting as default, unset other defaults for same calculationType
        if (isDefault) {
            const calcType = calculationType || 'checkout';
            await EmailTemplate.update(
                { isDefault: false },
                { where: { calculationType: calcType, isDefault: true } }
            );
        }

        const template = await EmailTemplate.create({
            name,
            frequencyType: frequencyType || 'custom',
            calculationType: calculationType || 'checkout',
            tags: tags || [],
            subject,
            htmlBody,
            textBody,
            description,
            isDefault: isDefault || false,
            isActive: true
        });

        res.status(201).json({ template });
    } catch (error) {
        console.error('Error creating email template:', error);
        res.status(500).json({ error: 'Failed to create email template' });
    }
});

/**
 * PUT /api/email-templates/:id
 * Update an email template
 */
router.put('/:id', async (req, res) => {
    try {
        const template = await EmailTemplate.findByPk(req.params.id);

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const { name, frequencyType, calculationType, tags, subject, htmlBody, textBody, description, isDefault, isActive } = req.body;

        // If setting as default, unset other defaults for same calculationType
        if (isDefault) {
            const calcType = calculationType || template.calculationType || 'checkout';
            await EmailTemplate.update(
                { isDefault: false },
                { where: { calculationType: calcType, isDefault: true, id: { [require('sequelize').Op.ne]: template.id } } }
            );
        }

        await template.update({
            name: name !== undefined ? name : template.name,
            frequencyType: frequencyType !== undefined ? frequencyType : template.frequencyType,
            calculationType: calculationType !== undefined ? calculationType : template.calculationType,
            tags: tags !== undefined ? tags : template.tags,
            subject: subject !== undefined ? subject : template.subject,
            htmlBody: htmlBody !== undefined ? htmlBody : template.htmlBody,
            textBody: textBody !== undefined ? textBody : template.textBody,
            description: description !== undefined ? description : template.description,
            isDefault: isDefault !== undefined ? isDefault : template.isDefault,
            isActive: isActive !== undefined ? isActive : template.isActive
        });

        res.json({ template });
    } catch (error) {
        console.error('Error updating email template:', error);
        res.status(500).json({ error: 'Failed to update email template' });
    }
});

/**
 * DELETE /api/email-templates/:id
 * Delete an email template
 */
router.delete('/:id', async (req, res) => {
    try {
        const template = await EmailTemplate.findByPk(req.params.id);

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Don't allow deleting system templates
        if (template.isSystem) {
            return res.status(400).json({ error: 'Cannot delete system template. This is a protected template.' });
        }

        // Don't allow deleting default templates
        if (template.isDefault) {
            return res.status(400).json({ error: 'Cannot delete default template. Set another template as default first.' });
        }

        await template.destroy();

        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Error deleting email template:', error);
        res.status(500).json({ error: 'Failed to delete email template' });
    }
});

/**
 * POST /api/email-templates/:id/set-default
 * Set a template as the default for its frequency type
 */
router.post('/:id/set-default', async (req, res) => {
    try {
        const template = await EmailTemplate.findByPk(req.params.id);

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Unset other defaults for this frequency type
        await EmailTemplate.update(
            { isDefault: false },
            { where: { frequencyType: template.frequencyType, isDefault: true } }
        );

        // Set this template as default
        await template.update({ isDefault: true });

        res.json({ template, message: `Template "${template.name}" is now the default for ${template.frequencyType}` });
    } catch (error) {
        console.error('Error setting default template:', error);
        res.status(500).json({ error: 'Failed to set default template' });
    }
});

/**
 * POST /api/email-templates/preview
 * Preview a template with sample data
 */
router.post('/preview', async (req, res) => {
    try {
        const { subject, htmlBody, textBody } = req.body;

        // Sample data for preview
        const sampleData = {
            ownerName: 'John Smith',
            propertyName: 'Oceanview Beach House',
            periodStart: '2025-12-01',
            periodEnd: '2025-12-14',
            periodDisplay: 'Dec 1-14, 2025',
            ownerPayout: '$2,513.57',
            rawPayout: '2513.57',
            totalRevenue: '$3,500.00',
            totalExpenses: '$500.00',
            pmCommission: '$350.00',
            pmPercentage: '10%',
            techFees: '$50.00',
            insuranceFees: '$25.00',
            adjustments: '$100.00',
            cleaningFees: '$150.00',
            balanceSuffix: '',
            isNegativeBalance: 'false',
            companyName: 'Luxury Lodging PM',
            currentDate: new Date().toLocaleDateString(),
            currentYear: new Date().getFullYear().toString()
        };

        const previewSubject = EmailTemplate.replaceVariables(subject, sampleData);
        const previewHtml = EmailTemplate.replaceVariables(htmlBody, sampleData);
        const previewText = EmailTemplate.replaceVariables(textBody, sampleData);

        res.json({
            subject: previewSubject,
            htmlBody: previewHtml,
            textBody: previewText,
            sampleData
        });
    } catch (error) {
        console.error('Error previewing template:', error);
        res.status(500).json({ error: 'Failed to preview template' });
    }
});

module.exports = router;
