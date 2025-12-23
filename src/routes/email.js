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
const { Statement, Listing, EmailLog, ScheduledEmail, ActivityLog } = require('../models');
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

        // Get calculation type from statement (checkout or calendar)
        const calculationType = statement.calculationType || 'checkout';

        // Send email with PDF attachment
        const attachPdf = req.body.attachPdf !== false; // Default to true
        const result = await EmailService.sendStatementEmailWithPdf({
            to: recipientEmail,
            statement: statementData,
            frequencyTag: frequency,
            calculationType: calculationType, // Template selected based on statement's calculation type
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

            // Log activity
            await ActivityLog.log(req, 'SEND_EMAIL', 'statement', statementId, {
                recipientEmail,
                ownerName: statement.ownerName,
                propertyName: statement.propertyName
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

        // Generate PDF attachment (REQUIRED - no email without statement PDF)
        const pdfResult = await EmailService.generateStatementPdf(
            statementId,
            statement.toJSON(),
            req.headers.authorization
        );

        if (!pdfResult.success) {
            return res.status(400).json({
                success: false,
                error: 'PDF_GENERATION_FAILED',
                message: `Cannot send email without statement PDF attached. PDF generation failed: ${pdfResult.error}`
            });
        }

        mailOptions.attachments.push({
            filename: pdfResult.filename,
            content: pdfResult.pdfBuffer,
            contentType: 'application/pdf'
        });

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

// ============================================
// EMAIL LOGS ROUTES
// ============================================

/**
 * GET /api/email/logs
 * Get email logs with optional filtering
 */
router.get('/logs', async (req, res) => {
    try {
        const {
            status,
            startDate,
            endDate,
            recipientEmail,
            statementId,
            limit = 100,
            offset = 0
        } = req.query;

        const where = {};

        if (status) {
            where.status = status;
        }

        if (recipientEmail) {
            where.recipientEmail = { [Op.like]: `%${recipientEmail}%` };
        }

        if (statementId) {
            where.statementId = parseInt(statementId);
        }

        if (startDate && endDate) {
            where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')] };
        } else if (startDate) {
            where.createdAt = { [Op.gte]: new Date(startDate) };
        } else if (endDate) {
            where.createdAt = { [Op.lte]: new Date(endDate + 'T23:59:59') };
        }

        const { count, rows: logs } = await EmailLog.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            total: count,
            logs: logs.map(log => ({
                id: log.id,
                statementId: log.statementId,
                propertyId: log.propertyId,
                recipientEmail: log.recipientEmail,
                recipientName: log.recipientName,
                propertyName: log.propertyName,
                frequencyTag: log.frequencyTag,
                subject: log.subject,
                status: log.status,
                messageId: log.messageId,
                errorMessage: log.errorMessage,
                errorCode: log.errorCode,
                attemptedAt: log.attemptedAt,
                sentAt: log.sentAt,
                retryCount: log.retryCount,
                createdAt: log.created_at
            }))
        });
    } catch (error) {
        console.error('Error fetching email logs:', error);
        res.status(500).json({ error: 'Failed to fetch email logs' });
    }
});

/**
 * GET /api/email/logs/stats
 * Get email statistics summary
 */
router.get('/logs/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const where = {};
        if (startDate && endDate) {
            where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')] };
        }

        // Get counts by status
        const totalSent = await EmailLog.count({ where: { ...where, status: 'sent' } });
        const totalFailed = await EmailLog.count({ where: { ...where, status: 'failed' } });
        const totalBounced = await EmailLog.count({ where: { ...where, status: 'bounced' } });
        const totalPending = await EmailLog.count({ where: { ...where, status: 'pending' } });

        // Get recent failures
        const recentFailures = await EmailLog.findAll({
            where: { ...where, status: 'failed' },
            order: [['created_at', 'DESC']],
            limit: 10
        });

        res.json({
            success: true,
            stats: {
                totalSent,
                totalFailed,
                totalBounced,
                totalPending,
                total: totalSent + totalFailed + totalBounced + totalPending,
                successRate: totalSent + totalFailed > 0
                    ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
                    : 0
            },
            recentFailures: recentFailures.map(log => ({
                id: log.id,
                statementId: log.statementId,
                recipientEmail: log.recipientEmail,
                propertyName: log.propertyName,
                errorMessage: log.errorMessage,
                createdAt: log.created_at
            }))
        });
    } catch (error) {
        console.error('Error fetching email stats:', error);
        res.status(500).json({ error: 'Failed to fetch email stats' });
    }
});

/**
 * GET /api/email/logs/:id
 * Get a specific email log
 */
router.get('/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const log = await EmailLog.findByPk(id);
        if (!log) {
            return res.status(404).json({ error: 'Email log not found' });
        }

        res.json({
            success: true,
            log: {
                id: log.id,
                statementId: log.statementId,
                propertyId: log.propertyId,
                recipientEmail: log.recipientEmail,
                recipientName: log.recipientName,
                propertyName: log.propertyName,
                frequencyTag: log.frequencyTag,
                subject: log.subject,
                status: log.status,
                messageId: log.messageId,
                errorMessage: log.errorMessage,
                errorCode: log.errorCode,
                attemptedAt: log.attemptedAt,
                sentAt: log.sentAt,
                retryCount: log.retryCount,
                metadata: log.metadata,
                createdAt: log.created_at,
                updatedAt: log.updated_at
            }
        });
    } catch (error) {
        console.error('Error fetching email log:', error);
        res.status(500).json({ error: 'Failed to fetch email log' });
    }
});

/**
 * POST /api/email/logs/:id/retry
 * Retry a failed email
 */
router.post('/logs/:id/retry', async (req, res) => {
    try {
        const { id } = req.params;

        const log = await EmailLog.findByPk(id);
        if (!log) {
            return res.status(404).json({ error: 'Email log not found' });
        }

        if (log.status !== 'failed') {
            return res.status(400).json({ error: 'Can only retry failed emails' });
        }

        // Get the statement
        const statement = await Statement.findByPk(log.statementId);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Increment retry count
        await log.update({ retryCount: log.retryCount + 1 });

        // Resend the email
        const result = await EmailService.sendStatementEmailWithPdf({
            to: log.recipientEmail,
            statement: statement.toJSON(),
            frequencyTag: log.frequencyTag || 'Monthly',
            attachPdf: true,
            authHeader: req.headers.authorization
        });

        res.json({
            success: result.success,
            message: result.success ? 'Email resent successfully' : 'Failed to resend email',
            result
        });
    } catch (error) {
        console.error('Error retrying email:', error);
        res.status(500).json({ error: 'Failed to retry email' });
    }
});

/**
 * POST /api/email/logs/failed
 * Log a failed email attempt (e.g., no owner email configured)
 */
router.post('/logs/failed', async (req, res) => {
    try {
        const { statementId, propertyId, propertyName, ownerName, reason, errorCode } = req.body;

        if (!statementId) {
            return res.status(400).json({ error: 'statementId is required' });
        }

        // Create failed email log
        const log = await EmailLog.create({
            statementId,
            propertyId: propertyId || null,
            recipientEmail: null,
            recipientName: ownerName || null,
            propertyName: propertyName || null,
            frequencyTag: null,
            subject: null,
            status: 'failed',
            errorMessage: reason || 'No email address configured for owner',
            errorCode: errorCode || 'NO_EMAIL',
            attemptedAt: new Date()
        });

        res.json({
            success: true,
            message: 'Failed email logged',
            log
        });
    } catch (error) {
        console.error('Error logging failed email:', error);
        res.status(500).json({ error: 'Failed to log email failure' });
    }
});

// ============================================
// SCHEDULED EMAILS ROUTES
// ============================================

/**
 * POST /api/email/schedule
 * Schedule emails for later delivery
 */
router.post('/schedule', async (req, res) => {
    try {
        const { statementIds, scheduledFor } = req.body;

        if (!statementIds || !Array.isArray(statementIds) || statementIds.length === 0) {
            return res.status(400).json({ error: 'statementIds array is required' });
        }

        if (!scheduledFor) {
            return res.status(400).json({ error: 'scheduledFor datetime is required' });
        }

        const scheduledDate = new Date(scheduledFor);
        if (isNaN(scheduledDate.getTime())) {
            return res.status(400).json({ error: 'Invalid scheduledFor datetime' });
        }

        if (scheduledDate <= new Date()) {
            return res.status(400).json({ error: 'scheduledFor must be in the future' });
        }

        // Get statements
        const statements = await Statement.findAll({
            where: { id: { [Op.in]: statementIds } }
        });

        if (statements.length === 0) {
            return res.status(404).json({ error: 'No statements found' });
        }

        // Get listings for email info
        const propertyIds = [...new Set(statements.map(s => s.propertyId).filter(Boolean))];
        const listings = await Listing.findAll({
            where: { id: { [Op.in]: propertyIds } }
        });

        const listingMap = {};
        listings.forEach(l => {
            listingMap[l.id] = l;
        });

        // Create scheduled email records
        const scheduled = [];
        const skipped = [];

        for (const statement of statements) {
            const listing = listingMap[statement.propertyId];

            if (!listing?.ownerEmail) {
                skipped.push({
                    statementId: statement.id,
                    reason: 'No owner email configured'
                });
                continue;
            }

            const frequencyTag = EmailService.getFrequencyFromTags(listing.tags);

            const scheduledEmail = await ScheduledEmail.create({
                statementId: statement.id,
                propertyId: statement.propertyId,
                recipientEmail: listing.ownerEmail,
                recipientName: listing.ownerGreeting || statement.ownerName,
                propertyName: listing.nickname || statement.propertyName,
                frequencyTag,
                scheduledFor: scheduledDate,
                status: 'pending'
            });

            scheduled.push({
                id: scheduledEmail.id,
                statementId: statement.id,
                propertyName: statement.propertyName,
                recipientEmail: listing.ownerEmail,
                scheduledFor: scheduledDate
            });
        }

        res.json({
            success: true,
            message: `Scheduled ${scheduled.length} email(s) for ${scheduledDate.toISOString()}`,
            scheduled,
            skipped,
            summary: {
                scheduled: scheduled.length,
                skipped: skipped.length,
                total: statementIds.length
            }
        });
    } catch (error) {
        console.error('Error scheduling emails:', error);
        res.status(500).json({ error: 'Failed to schedule emails' });
    }
});

/**
 * GET /api/email/scheduled
 * Get all scheduled emails
 */
router.get('/scheduled', async (req, res) => {
    try {
        const { status, limit = 100, offset = 0 } = req.query;

        const where = {};
        if (status) {
            where.status = status;
        }

        const { count, rows: emails } = await ScheduledEmail.findAndCountAll({
            where,
            order: [['scheduled_for', 'ASC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            total: count,
            emails: emails.map(e => ({
                id: e.id,
                statementId: e.statementId,
                propertyId: e.propertyId,
                recipientEmail: e.recipientEmail,
                recipientName: e.recipientName,
                propertyName: e.propertyName,
                frequencyTag: e.frequencyTag,
                scheduledFor: e.scheduledFor,
                status: e.status,
                sentAt: e.sentAt,
                errorMessage: e.errorMessage,
                createdAt: e.created_at
            }))
        });
    } catch (error) {
        console.error('Error fetching scheduled emails:', error);
        res.status(500).json({ error: 'Failed to fetch scheduled emails' });
    }
});

/**
 * DELETE /api/email/scheduled/:id
 * Cancel a scheduled email
 */
router.delete('/scheduled/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const scheduledEmail = await ScheduledEmail.findByPk(id);
        if (!scheduledEmail) {
            return res.status(404).json({ error: 'Scheduled email not found' });
        }

        if (scheduledEmail.status !== 'pending') {
            return res.status(400).json({
                error: `Cannot cancel email with status: ${scheduledEmail.status}`
            });
        }

        await scheduledEmail.update({ status: 'cancelled' });

        res.json({
            success: true,
            message: 'Scheduled email cancelled',
            email: {
                id: scheduledEmail.id,
                statementId: scheduledEmail.statementId,
                status: 'cancelled'
            }
        });
    } catch (error) {
        console.error('Error cancelling scheduled email:', error);
        res.status(500).json({ error: 'Failed to cancel scheduled email' });
    }
});

/**
 * POST /api/email/scheduled/process
 * Process due scheduled emails (call this via cron job or manually)
 */
router.post('/scheduled/process', async (req, res) => {
    try {
        const now = new Date();

        // Find all pending emails that are due
        const dueEmails = await ScheduledEmail.findAll({
            where: {
                status: 'pending',
                scheduledFor: { [Op.lte]: now }
            },
            limit: 50 // Process in batches
        });

        if (dueEmails.length === 0) {
            return res.json({
                success: true,
                message: 'No scheduled emails to process',
                processed: 0
            });
        }

        const results = {
            sent: [],
            failed: []
        };

        for (const scheduledEmail of dueEmails) {
            try {
                // Get statement
                const statement = await Statement.findByPk(scheduledEmail.statementId);
                if (!statement) {
                    await scheduledEmail.update({
                        status: 'failed',
                        errorMessage: 'Statement not found'
                    });
                    results.failed.push({
                        id: scheduledEmail.id,
                        error: 'Statement not found'
                    });
                    continue;
                }

                // Send the email
                const result = await EmailService.sendStatementEmailWithPdf({
                    to: scheduledEmail.recipientEmail,
                    statement: {
                        ...statement.toJSON(),
                        ownerName: scheduledEmail.recipientName || statement.ownerName,
                        propertyName: scheduledEmail.propertyName || statement.propertyName
                    },
                    frequencyTag: scheduledEmail.frequencyTag || 'Monthly',
                    attachPdf: true,
                    authHeader: req.headers.authorization
                });

                if (result.success) {
                    await scheduledEmail.update({
                        status: 'sent',
                        sentAt: new Date()
                    });

                    // Update statement status
                    await statement.update({
                        status: 'sent',
                        sentAt: new Date()
                    });

                    results.sent.push({
                        id: scheduledEmail.id,
                        statementId: scheduledEmail.statementId
                    });
                } else {
                    await scheduledEmail.update({
                        status: 'failed',
                        errorMessage: result.message || 'Failed to send'
                    });
                    results.failed.push({
                        id: scheduledEmail.id,
                        error: result.message
                    });
                }
            } catch (error) {
                await scheduledEmail.update({
                    status: 'failed',
                    errorMessage: error.message
                });
                results.failed.push({
                    id: scheduledEmail.id,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Processed ${dueEmails.length} scheduled emails`,
            processed: dueEmails.length,
            sent: results.sent.length,
            failed: results.failed.length,
            results
        });
    } catch (error) {
        console.error('Error processing scheduled emails:', error);
        res.status(500).json({ error: 'Failed to process scheduled emails' });
    }
});

/**
 * GET /api/email/owners
 * Get all unique owner emails for announcement
 */
router.get('/owners', async (req, res) => {
    try {
        const { tags } = req.query;

        let whereClause = {
            ownerEmail: {
                [Op.and]: [
                    { [Op.ne]: null },
                    { [Op.ne]: '' }
                ]
            }
        };

        // Filter by tags if provided
        if (tags) {
            const tagList = tags.split(',').map(t => t.trim().toLowerCase());
            // Get listings that have any of the specified tags
            const listings = await Listing.findAll({
                where: whereClause,
                attributes: ['id', 'nickname', 'ownerEmail', 'ownerGreeting', 'tags']
            });

            const filtered = listings.filter(l => {
                const listingTags = (l.tags || []).map(t => t.toLowerCase());
                return tagList.some(tag => listingTags.includes(tag));
            });

            // Get unique emails
            const uniqueEmails = new Map();
            filtered.forEach(l => {
                if (l.ownerEmail && !uniqueEmails.has(l.ownerEmail)) {
                    uniqueEmails.set(l.ownerEmail, {
                        email: l.ownerEmail,
                        greeting: l.ownerGreeting || 'Owner',
                        listings: []
                    });
                }
                if (l.ownerEmail) {
                    uniqueEmails.get(l.ownerEmail).listings.push(l.nickname);
                }
            });

            return res.json({
                success: true,
                count: uniqueEmails.size,
                owners: Array.from(uniqueEmails.values())
            });
        }

        // Get all owners with email
        const listings = await Listing.findAll({
            where: whereClause,
            attributes: ['id', 'nickname', 'ownerEmail', 'ownerGreeting', 'tags']
        });

        // Get unique emails
        const uniqueEmails = new Map();
        listings.forEach(l => {
            if (l.ownerEmail && !uniqueEmails.has(l.ownerEmail)) {
                uniqueEmails.set(l.ownerEmail, {
                    email: l.ownerEmail,
                    greeting: l.ownerGreeting || 'Owner',
                    listings: []
                });
            }
            if (l.ownerEmail) {
                uniqueEmails.get(l.ownerEmail).listings.push(l.nickname);
            }
        });

        res.json({
            success: true,
            count: uniqueEmails.size,
            owners: Array.from(uniqueEmails.values())
        });
    } catch (error) {
        console.error('Error fetching owners:', error);
        res.status(500).json({ error: 'Failed to fetch owners' });
    }
});

/**
 * POST /api/email/announcement
 * Send announcement email to owners
 */
router.post('/announcement', async (req, res) => {
    try {
        const { subject, body, tags, sendToAll, testEmail } = req.body;

        if (!subject || !body) {
            return res.status(400).json({ error: 'Subject and body are required' });
        }

        // If testEmail is provided, send only to test email
        if (testEmail) {
            const results = { sent: [], failed: [] };
            try {
                // Convert newlines to <br> and personalize
                const personalizedBody = body.replace(/\n/g, '<br/>').replace(/{{ownerGreeting}}/g, 'Test User');
                const personalizedSubject = subject.replace(/{{ownerGreeting}}/g, 'Test User');
                await EmailService.sendAnnouncementEmail(
                    testEmail,
                    `[TEST] ${personalizedSubject}`,
                    personalizedBody,
                    'Test User'
                );
                results.sent.push(testEmail);

                // Log activity
                await ActivityLog.log(req, 'SEND_TEST_ANNOUNCEMENT', 'email', null, {
                    testEmail,
                    subject
                });
            } catch (err) {
                console.error(`Failed to send test announcement to ${testEmail}:`, err.message);
                results.failed.push({ email: testEmail, error: err.message });
            }

            return res.json({
                success: results.sent.length > 0,
                message: results.sent.length > 0 ? `Test announcement sent to ${testEmail}` : 'Failed to send test',
                sent: results.sent.length,
                failed: results.failed.length,
                results
            });
        }

        let whereClause = {
            ownerEmail: {
                [Op.and]: [
                    { [Op.ne]: null },
                    { [Op.ne]: '' }
                ]
            }
        };

        // Get listings
        const listings = await Listing.findAll({
            where: whereClause,
            attributes: ['id', 'nickname', 'ownerEmail', 'ownerGreeting', 'tags']
        });

        let targetListings = listings;

        // Filter by tags if not sending to all
        if (!sendToAll && tags && tags.length > 0) {
            const tagList = tags.map(t => t.toLowerCase());
            targetListings = listings.filter(l => {
                const listingTags = (l.tags || []).map(t => t.toLowerCase());
                return tagList.some(tag => listingTags.includes(tag));
            });
        }

        // Get unique emails
        const uniqueEmails = new Map();
        targetListings.forEach(l => {
            if (l.ownerEmail && !uniqueEmails.has(l.ownerEmail)) {
                uniqueEmails.set(l.ownerEmail, {
                    email: l.ownerEmail,
                    greeting: l.ownerGreeting || 'Owner'
                });
            }
        });

        const recipients = Array.from(uniqueEmails.values());

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No recipients found with configured email addresses' });
        }

        // Send emails
        const results = {
            sent: [],
            failed: []
        };

        for (const recipient of recipients) {
            try {
                // Convert newlines to <br> and personalize
                const personalizedBody = body.replace(/\n/g, '<br/>').replace(/{{ownerGreeting}}/g, recipient.greeting);
                const personalizedSubject = subject.replace(/{{ownerGreeting}}/g, recipient.greeting);

                await EmailService.sendAnnouncementEmail(
                    recipient.email,
                    personalizedSubject,
                    personalizedBody,
                    recipient.greeting
                );

                results.sent.push(recipient.email);

                // Log to email_logs table
                await EmailLog.create({
                    statementId: null,
                    propertyId: null,
                    recipientEmail: recipient.email,
                    recipientName: recipient.greeting,
                    propertyName: 'Announcement',
                    frequencyTag: 'Announcement',
                    subject: personalizedSubject,
                    status: 'sent',
                    sentAt: new Date()
                });

                // Log activity
                await ActivityLog.log(req, 'SEND_ANNOUNCEMENT', 'email', null, {
                    recipientEmail: recipient.email,
                    subject: personalizedSubject
                });
            } catch (err) {
                console.error(`Failed to send announcement to ${recipient.email}:`, err.message);
                results.failed.push({ email: recipient.email, error: err.message });

                // Log failed email
                await EmailLog.create({
                    statementId: null,
                    propertyId: null,
                    recipientEmail: recipient.email,
                    recipientName: recipient.greeting,
                    propertyName: 'Announcement',
                    frequencyTag: 'Announcement',
                    subject: subject,
                    status: 'failed',
                    errorMessage: err.message
                });
            }
        }

        res.json({
            success: true,
            message: `Announcement sent to ${results.sent.length} recipients`,
            sent: results.sent.length,
            failed: results.failed.length,
            results
        });
    } catch (error) {
        console.error('Error sending announcement:', error);
        res.status(500).json({ error: 'Failed to send announcement' });
    }
});

module.exports = router;
