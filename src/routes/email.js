/**
 * Email Automation Routes
 *
 * Endpoints for:
 * - Sending individual statement emails
 * - Bulk sending statements by frequency tag
 * - Checking negative balance statements (flagged for review)
 * - Email configuration verification
 */

const express = require('express');
const router = express.Router();
const EmailService = require('../services/EmailService');
const { Statement, Listing } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/email/status
 * Check email service configuration status
 */
router.get('/status', async (req, res) => {
    try {
        const verification = await EmailService.verifyConnection();

        res.json({
            success: true,
            configured: EmailService.isConfigured,
            verification,
            config: {
                host: process.env.SMTP_HOST || 'Not set',
                port: process.env.SMTP_PORT || '587',
                fromEmail: process.env.FROM_EMAIL || 'Not set'
            }
        });
    } catch (error) {
        console.error('Error checking email status:', error);
        res.status(500).json({ error: 'Failed to check email status' });
    }
});

/**
 * POST /api/email/send/:statementId
 * Send email for a specific statement
 */
router.post('/send/:statementId', async (req, res) => {
    try {
        const { statementId } = req.params;
        const { recipientEmail, frequencyTag } = req.body;

        if (!recipientEmail) {
            return res.status(400).json({ error: 'recipientEmail is required' });
        }

        // Get statement
        const statement = await Statement.findByPk(statementId);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Get listing for tags, owner greeting and nickname
        let frequency = frequencyTag;
        let listingNickname = null;
        let ownerGreeting = null;
        if (statement.propertyId) {
            const listing = await Listing.findByPk(statement.propertyId);
            if (listing) {
                if (!frequency) {
                    frequency = EmailService.getFrequencyFromTags(listing.tags);
                }
                // Get listing nickname for property name
                listingNickname = listing.nickname;
                // Get owner greeting for email personalization (e.g., "Ellen", "Scott")
                ownerGreeting = listing.ownerGreeting;
            }
        }
        frequency = frequency || 'Monthly';

        // Use owner greeting for email greeting, nickname for property name
        const statementData = statement.toJSON();
        if (ownerGreeting) {
            statementData.ownerName = ownerGreeting;
        }
        if (listingNickname) {
            statementData.propertyName = listingNickname;
        }

        // Send email with PDF attachment
        const attachPdf = req.body.attachPdf !== false; // Default to true
        const result = await EmailService.sendStatementEmailWithPdf({
            to: recipientEmail,
            statement: statementData,
            frequencyTag: frequency,
            attachPdf: attachPdf,
            authHeader: req.headers.authorization,
            // Callback to refetch statement after PDF generation (to get recalculated values)
            refetchStatement: async (id) => {
                const refreshed = await Statement.findByPk(id);
                if (refreshed) {
                    const data = refreshed.toJSON();
                    // Use owner greeting for email, nickname for property name
                    if (ownerGreeting) {
                        data.ownerName = ownerGreeting;
                    }
                    if (listingNickname) {
                        data.propertyName = listingNickname;
                    }
                    return data;
                }
                return null;
            }
        });

        if (result.success) {
            // Update statement status
            await statement.update({
                status: 'sent',
                sentAt: new Date()
            });

            res.json({
                success: true,
                message: 'Statement email sent successfully',
                result
            });
        } else if (result.error === 'NEGATIVE_BALANCE_BLOCKED') {
            // Statement stays as draft, just return error
            res.status(400).json({
                success: false,
                error: 'NEGATIVE_BALANCE',
                message: result.message,
                ownerPayout: result.ownerPayout
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Error sending statement email:', error);
        res.status(500).json({ error: 'Failed to send statement email' });
    }
});

/**
 * POST /api/email/send-bulk
 * Send emails for multiple statements
 */
router.post('/send-bulk', async (req, res) => {
    try {
        const { statementIds, ownerEmails } = req.body;

        if (!statementIds || !Array.isArray(statementIds)) {
            return res.status(400).json({ error: 'statementIds array is required' });
        }

        if (!ownerEmails || typeof ownerEmails !== 'object') {
            return res.status(400).json({ error: 'ownerEmails object is required (ownerId -> email mapping)' });
        }

        // Get statements
        const statements = await Statement.findAll({
            where: { id: { [Op.in]: statementIds } }
        });

        if (statements.length === 0) {
            return res.status(404).json({ error: 'No statements found' });
        }

        // Get listing tags for frequency detection
        const propertyIds = [...new Set(statements.map(s => s.propertyId).filter(Boolean))];
        const listings = await Listing.findAll({
            where: { id: { [Op.in]: propertyIds } }
        });

        const listingTags = {};
        listings.forEach(l => {
            listingTags[l.id] = l.tags;
        });

        // Send bulk emails
        const results = await EmailService.sendBulkStatements(
            statements.map(s => s.toJSON()),
            ownerEmails,
            listingTags
        );

        // Update statement statuses
        for (const sent of results.sent) {
            await Statement.update(
                { status: 'sent', sentAt: new Date() },
                { where: { id: sent.statementId } }
            );
        }

        // Blocked statements stay as draft, no status change needed

        res.json({
            success: true,
            message: `Processed ${results.summary.total} statements`,
            results
        });
    } catch (error) {
        console.error('Error sending bulk emails:', error);
        res.status(500).json({ error: 'Failed to send bulk emails' });
    }
});

/**
 * GET /api/email/flagged
 * Get draft statements with negative balance (need manual review)
 */
router.get('/flagged', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const where = {
            status: 'draft',
            ownerPayout: { [Op.lt]: 0 }
        };

        if (startDate && endDate) {
            where.weekStartDate = { [Op.between]: [startDate, endDate] };
        }

        const flaggedStatements = await Statement.findAll({
            where,
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            count: flaggedStatements.length,
            statements: flaggedStatements.map(s => ({
                id: s.id,
                ownerId: s.ownerId,
                ownerName: s.ownerName,
                propertyId: s.propertyId,
                propertyName: s.propertyName,
                weekStartDate: s.weekStartDate,
                weekEndDate: s.weekEndDate,
                ownerPayout: s.ownerPayout,
                totalRevenue: s.totalRevenue,
                totalExpenses: s.totalExpenses,
                status: s.status,
                createdAt: s.created_at
            }))
        });
    } catch (error) {
        console.error('Error fetching flagged statements:', error);
        res.status(500).json({ error: 'Failed to fetch flagged statements' });
    }
});

/**
 * POST /api/email/review/:statementId
 * Mark a flagged statement as reviewed (manual handling complete)
 */
router.post('/review/:statementId', async (req, res) => {
    try {
        const { statementId } = req.params;
        const { action, notes } = req.body; // action: 'approved', 'sent_manually', 'waived'

        const statement = await Statement.findByPk(statementId);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        const validActions = ['approved', 'sent_manually', 'waived', 'pending'];
        if (!validActions.includes(action)) {
            return res.status(400).json({
                error: `Invalid action. Must be one of: ${validActions.join(', ')}`
            });
        }

        await statement.update({
            status: `reviewed_${action}`
        });

        res.json({
            success: true,
            message: `Statement ${statementId} marked as ${action}`,
            statement: {
                id: statement.id,
                status: `reviewed_${action}`,
                ownerPayout: statement.ownerPayout
            }
        });
    } catch (error) {
        console.error('Error reviewing statement:', error);
        res.status(500).json({ error: 'Failed to review statement' });
    }
});

/**
 * POST /api/email/force-send/:statementId
 * Force send a statement email (bypasses negative balance check)
 * Requires explicit confirmation
 */
router.post('/force-send/:statementId', async (req, res) => {
    try {
        const { statementId } = req.params;
        const { recipientEmail, frequencyTag, confirmNegativeBalance } = req.body;

        if (!recipientEmail) {
            return res.status(400).json({ error: 'recipientEmail is required' });
        }

        const statement = await Statement.findByPk(statementId);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        const ownerPayout = parseFloat(statement.ownerPayout) || 0;

        // Require explicit confirmation for negative balance
        if (ownerPayout < 0 && !confirmNegativeBalance) {
            return res.status(400).json({
                error: 'CONFIRMATION_REQUIRED',
                message: `Statement has negative balance ($${ownerPayout.toFixed(2)}). Set confirmNegativeBalance: true to force send.`,
                ownerPayout
            });
        }

        // Get frequency tag
        let frequency = frequencyTag || 'Monthly';
        if (!frequencyTag && statement.propertyId) {
            const listing = await Listing.findByPk(statement.propertyId);
            if (listing) {
                frequency = EmailService.getFrequencyFromTags(listing.tags);
            }
        }

        // Build email manually (bypassing guardrail)
        if (!EmailService.isConfigured) {
            return res.status(500).json({
                error: 'SMTP_NOT_CONFIGURED',
                message: 'Email service is not configured'
            });
        }

        const templateData = {
            ownerName: statement.ownerName,
            propertyName: statement.propertyName || 'Multiple Properties',
            periodStart: statement.weekStartDate,
            periodEnd: statement.weekEndDate,
            ownerPayout: ownerPayout,
            companyName: process.env.COMPANY_NAME || 'Luxury Lodging PM'
        };

        const template = EmailService.getEmailTemplate(frequency, templateData);

        const mailOptions = {
            from: process.env.FROM_EMAIL || 'statements@luxurylodgingpm.com',
            to: recipientEmail,
            subject: template.subject,
            html: template.html,
            text: template.text,
            attachments: []
        };

        // Generate PDF attachment if requested (default: true)
        const attachPdf = req.body.attachPdf !== false;
        if (attachPdf) {
            const pdfResult = await EmailService.generateStatementPdf(
                statementId,
                statement.toJSON(),
                req.headers.authorization
            );
            if (pdfResult.success) {
                mailOptions.attachments.push({
                    filename: pdfResult.filename,
                    content: pdfResult.pdfBuffer,
                    contentType: 'application/pdf'
                });
            }
        }

        const result = await EmailService.transporter.sendMail(mailOptions);

        // Update statement
        await statement.update({
            status: ownerPayout < 0 ? 'sent_negative_balance' : 'sent',
            sentAt: new Date()
        });

        res.json({
            success: true,
            message: 'Statement email sent (force)',
            messageId: result.messageId,
            forceSent: true,
            wasNegativeBalance: ownerPayout < 0,
            ownerPayout
        });
    } catch (error) {
        console.error('Error force sending email:', error);
        res.status(500).json({ error: 'Failed to force send email' });
    }
});

/**
 * GET /api/email/queue
 * Get statements ready to be emailed (positive balance, not yet sent)
 */
router.get('/queue', async (req, res) => {
    try {
        const { frequencyTag, startDate, endDate } = req.query;

        // Get statements that haven't been sent
        const where = {
            status: { [Op.in]: ['draft', 'pending'] },
            ownerPayout: { [Op.gte]: 0 } // Only positive balance
        };

        if (startDate && endDate) {
            where.weekStartDate = { [Op.between]: [startDate, endDate] };
        }

        const statements = await Statement.findAll({
            where,
            order: [['week_start_date', 'DESC']]
        });

        // Filter by frequency tag if specified
        let filteredStatements = statements;
        if (frequencyTag) {
            const propertyIds = [...new Set(statements.map(s => s.propertyId).filter(Boolean))];
            const listings = await Listing.findAll({
                where: { id: { [Op.in]: propertyIds } }
            });

            const listingMap = {};
            listings.forEach(l => {
                listingMap[l.id] = l;
            });

            filteredStatements = statements.filter(s => {
                const listing = listingMap[s.propertyId];
                if (!listing) return frequencyTag === 'Monthly'; // Default
                const freq = EmailService.getFrequencyFromTags(listing.tags);
                return freq === frequencyTag;
            });
        }

        res.json({
            success: true,
            count: filteredStatements.length,
            statements: filteredStatements.map(s => ({
                id: s.id,
                ownerId: s.ownerId,
                ownerName: s.ownerName,
                propertyId: s.propertyId,
                propertyName: s.propertyName,
                weekStartDate: s.weekStartDate,
                weekEndDate: s.weekEndDate,
                ownerPayout: s.ownerPayout,
                status: s.status
            }))
        });
    } catch (error) {
        console.error('Error fetching email queue:', error);
        res.status(500).json({ error: 'Failed to fetch email queue' });
    }
});

/**
 * GET /api/email/summary
 * Get summary of email statuses
 */
router.get('/summary', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const where = {};
        if (startDate && endDate) {
            where.weekStartDate = { [Op.between]: [startDate, endDate] };
        }

        const allStatements = await Statement.findAll({ where });

        const summary = {
            total: allStatements.length,
            byStatus: {},
            positiveBalance: 0,
            negativeBalance: 0,
            totalPayout: 0
        };

        allStatements.forEach(s => {
            // Count by status
            summary.byStatus[s.status] = (summary.byStatus[s.status] || 0) + 1;

            // Count by balance
            const payout = parseFloat(s.ownerPayout) || 0;
            if (payout >= 0) {
                summary.positiveBalance++;
            } else {
                summary.negativeBalance++;
            }
            summary.totalPayout += payout;
        });

        res.json({
            success: true,
            summary: {
                ...summary,
                totalPayout: Math.round(summary.totalPayout * 100) / 100
            }
        });
    } catch (error) {
        console.error('Error fetching email summary:', error);
        res.status(500).json({ error: 'Failed to fetch email summary' });
    }
});

module.exports = router;
