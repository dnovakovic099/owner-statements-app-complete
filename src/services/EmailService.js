/**
 * Email Service for Owner Statement Delivery
 *
 * Features:
 * - SMTP configuration via environment variables
 * - Three email templates: Weekly, Bi-Weekly, Monthly
 * - Negative balance guardrail (prevents sending if ownerPayout < 0)
 * - PDF attachment support
 * - Email queue and logging
 */

const nodemailer = require('nodemailer');
const path = require('path');
const http = require('http');

class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.initializeTransporter();
    }

    /**
     * Initialize the SMTP transporter
     */
    initializeTransporter() {
        const smtpConfig = {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true' // true for 465, false for other ports
        };

        // Add auth only if credentials are provided (supports no-auth SMTP servers)
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            smtpConfig.auth = {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            };
        }

        // Check if SMTP host is configured
        if (!smtpConfig.host) {
            console.warn('[EmailService] SMTP not configured. Email sending disabled.');
            console.warn('[EmailService] Required env var: SMTP_HOST');
            this.isConfigured = false;
            return;
        }

        try {
            this.transporter = nodemailer.createTransport(smtpConfig);
            this.isConfigured = true;
            console.log('[EmailService] SMTP transporter initialized');
            console.log(`[EmailService] Host: ${smtpConfig.host}:${smtpConfig.port}`);
        } catch (error) {
            console.error('[EmailService] Failed to initialize SMTP:', error.message);
            this.isConfigured = false;
        }
    }

    /**
     * Verify SMTP connection
     */
    async verifyConnection() {
        if (!this.isConfigured) {
            return { success: false, error: 'SMTP not configured' };
        }

        try {
            await this.transporter.verify();
            return { success: true, message: 'SMTP connection verified' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get email template based on frequency tag
     * @param {string} frequencyTag - 'Weekly', 'Bi-Weekly', or 'Monthly'
     * @param {Object} data - Template data (ownerName, propertyName, period, etc.)
     */
    getEmailTemplate(frequencyTag, data) {
        const templates = {
            'Weekly': this.getWeeklyTemplate(data),
            'Bi-Weekly': this.getBiWeeklyTemplate(data),
            'Monthly': this.getMonthlyTemplate(data)
        };

        return templates[frequencyTag] || templates['Monthly']; // Default to Monthly
    }

    /**
     * Weekly Statement Email Template
     */
    getWeeklyTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        return {
            subject: `Weekly Owner Statement - ${propertyName} (${periodStart} to ${periodEnd})`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .highlight { background: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .amount { font-size: 24px; font-weight: bold; color: ${ownerPayout >= 0 ? '#059669' : '#dc2626'}; }
        .label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">Weekly Owner Statement</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${periodStart} - ${periodEnd}</p>
        </div>
        <div class="content">
            <p>Dear ${ownerName},</p>
            <p>Please find attached your weekly owner statement for <strong>${propertyName}</strong>.</p>

            <div class="highlight">
                <div class="label">Net Payout</div>
                <div class="amount">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</div>
            </div>

            <p>This statement includes all reservations with check-outs during the statement period, along with any applicable expenses and fees.</p>

            <p>If you have any questions about this statement, please don't hesitate to reach out.</p>

            <p>Best regards,<br><strong>${companyName || 'Luxury Lodging PM'}</strong></p>
        </div>
        <div class="footer">
            <p>This is an automated message. Please do not reply directly to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${companyName || 'Luxury Lodging PM'}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
            `,
            text: `
Weekly Owner Statement
${periodStart} - ${periodEnd}

Dear ${ownerName},

Please find attached your weekly owner statement for ${propertyName}.

Net Payout: $${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

This statement includes all reservations with check-outs during the statement period, along with any applicable expenses and fees.

If you have any questions about this statement, please don't hesitate to reach out.

Best regards,
${companyName || 'Luxury Lodging PM'}
            `
        };
    }

    /**
     * Bi-Weekly Statement Email Template
     */
    getBiWeeklyTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        return {
            subject: `Bi-Weekly Owner Statement - ${propertyName} (${periodStart} to ${periodEnd})`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .highlight { background: #ede9fe; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .amount { font-size: 24px; font-weight: bold; color: ${ownerPayout >= 0 ? '#059669' : '#dc2626'}; }
        .label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">Bi-Weekly Owner Statement</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${periodStart} - ${periodEnd}</p>
        </div>
        <div class="content">
            <p>Dear ${ownerName},</p>
            <p>Please find attached your bi-weekly owner statement for <strong>${propertyName}</strong>.</p>

            <div class="highlight">
                <div class="label">Net Payout</div>
                <div class="amount">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</div>
            </div>

            <p>This statement covers the two-week period and includes all completed reservations and associated charges.</p>

            <p>Thank you for your continued partnership.</p>

            <p>Best regards,<br><strong>${companyName || 'Luxury Lodging PM'}</strong></p>
        </div>
        <div class="footer">
            <p>This is an automated message. Please do not reply directly to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${companyName || 'Luxury Lodging PM'}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
            `,
            text: `
Bi-Weekly Owner Statement
${periodStart} - ${periodEnd}

Dear ${ownerName},

Please find attached your bi-weekly owner statement for ${propertyName}.

Net Payout: $${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

This statement covers the two-week period and includes all completed reservations and associated charges.

Thank you for your continued partnership.

Best regards,
${companyName || 'Luxury Lodging PM'}
            `
        };
    }

    /**
     * Monthly Statement Email Template
     */
    getMonthlyTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        return {
            subject: `Monthly Owner Statement - ${propertyName} (${periodStart} to ${periodEnd})`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .highlight { background: #d1fae5; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .amount { font-size: 24px; font-weight: bold; color: ${ownerPayout >= 0 ? '#059669' : '#dc2626'}; }
        .label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
        .summary-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .summary-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">Monthly Owner Statement</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${periodStart} - ${periodEnd}</p>
        </div>
        <div class="content">
            <p>Dear ${ownerName},</p>
            <p>Please find attached your monthly owner statement for <strong>${propertyName}</strong>.</p>

            <div class="highlight">
                <div class="label">Net Payout for the Month</div>
                <div class="amount">$${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</div>
            </div>

            <p>This comprehensive monthly statement includes:</p>
            <ul>
                <li>All completed reservations</li>
                <li>Operating expenses</li>
                <li>Management fees</li>
                <li>Any applicable adjustments</li>
            </ul>

            <p>We appreciate your trust in our property management services. Please review the attached statement and let us know if you have any questions.</p>

            <p>Warm regards,<br><strong>${companyName || 'Luxury Lodging PM'}</strong></p>
        </div>
        <div class="footer">
            <p>This is an automated message. Please do not reply directly to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${companyName || 'Luxury Lodging PM'}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
            `,
            text: `
Monthly Owner Statement
${periodStart} - ${periodEnd}

Dear ${ownerName},

Please find attached your monthly owner statement for ${propertyName}.

Net Payout for the Month: $${Math.abs(ownerPayout).toFixed(2)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

This comprehensive monthly statement includes:
- All completed reservations
- Operating expenses
- Management fees
- Any applicable adjustments

We appreciate your trust in our property management services. Please review the attached statement and let us know if you have any questions.

Warm regards,
${companyName || 'Luxury Lodging PM'}
            `
        };
    }

    /**
     * Check if statement can be sent (Negative Balance Guardrail)
     * @param {Object} statement - Statement object
     * @returns {Object} { canSend: boolean, reason: string }
     */
    checkNegativeBalanceGuardrail(statement) {
        const ownerPayout = parseFloat(statement.ownerPayout) || 0;

        if (ownerPayout < 0) {
            return {
                canSend: false,
                reason: 'NEGATIVE_BALANCE',
                message: `Statement has negative balance ($${ownerPayout.toFixed(2)}). Flagged for manual review.`,
                ownerPayout
            };
        }

        return {
            canSend: true,
            reason: 'POSITIVE_BALANCE',
            message: 'Statement has positive balance. OK to send.',
            ownerPayout
        };
    }

    /**
     * Send statement email
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {Object} options.statement - Statement object
     * @param {string} options.frequencyTag - 'Weekly', 'Bi-Weekly', or 'Monthly'
     * @param {Buffer|string} options.pdfAttachment - PDF file buffer or path
     * @param {string} options.pdfFilename - Filename for the attachment
     */
    async sendStatementEmail(options) {
        const { to, statement, frequencyTag, pdfAttachment, pdfFilename } = options;

        // Check SMTP configuration
        if (!this.isConfigured) {
            return {
                success: false,
                error: 'SMTP_NOT_CONFIGURED',
                message: 'Email service is not configured. Please set SMTP environment variables.'
            };
        }

        // Negative Balance Guardrail Check
        const guardrailCheck = this.checkNegativeBalanceGuardrail(statement);
        if (!guardrailCheck.canSend) {
            console.log(`[EmailService] BLOCKED: Statement ${statement.id} - ${guardrailCheck.message}`);
            return {
                success: false,
                error: 'NEGATIVE_BALANCE_BLOCKED',
                message: guardrailCheck.message,
                flaggedForReview: true,
                ownerPayout: guardrailCheck.ownerPayout
            };
        }

        // Get email template
        const templateData = {
            ownerName: statement.ownerName,
            propertyName: statement.propertyName || 'Multiple Properties',
            periodStart: statement.weekStartDate,
            periodEnd: statement.weekEndDate,
            ownerPayout: parseFloat(statement.ownerPayout) || 0,
            companyName: process.env.COMPANY_NAME || 'Luxury Lodging PM'
        };

        const template = this.getEmailTemplate(frequencyTag, templateData);

        // Prepare email
        const mailOptions = {
            from: process.env.FROM_EMAIL || 'statements@luxurylodgingpm.com',
            to: to,
            subject: template.subject,
            html: template.html,
            text: template.text,
            attachments: []
        };

        // Add PDF attachment if provided
        if (pdfAttachment) {
            if (Buffer.isBuffer(pdfAttachment)) {
                mailOptions.attachments.push({
                    filename: pdfFilename || `statement-${statement.id}.pdf`,
                    content: pdfAttachment,
                    contentType: 'application/pdf'
                });
            } else if (typeof pdfAttachment === 'string') {
                mailOptions.attachments.push({
                    filename: pdfFilename || path.basename(pdfAttachment),
                    path: pdfAttachment,
                    contentType: 'application/pdf'
                });
            }
        }

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log(`[EmailService] Email sent successfully to ${to} for statement ${statement.id}`);

            return {
                success: true,
                messageId: result.messageId,
                recipient: to,
                statementId: statement.id,
                frequencyTag,
                sentAt: new Date().toISOString()
            };
        } catch (error) {
            console.error(`[EmailService] Failed to send email to ${to}:`, error.message);
            return {
                success: false,
                error: 'SEND_FAILED',
                message: error.message,
                recipient: to,
                statementId: statement.id
            };
        }
    }

    /**
     * Get frequency tag from listing tags
     * @param {Array|string} tags - Listing tags
     * @returns {string} Frequency tag ('Weekly', 'Bi-Weekly', 'Monthly')
     */
    getFrequencyFromTags(tags) {
        const tagArray = Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim());

        const frequencyTags = ['Weekly', 'Bi-Weekly', 'Monthly'];

        for (const tag of tagArray) {
            const normalizedTag = tag.trim();
            for (const freq of frequencyTags) {
                if (normalizedTag.toLowerCase() === freq.toLowerCase()) {
                    return freq;
                }
            }
        }

        return 'Monthly'; // Default frequency
    }

    /**
     * Send bulk statements with guardrail checking
     * @param {Array} statements - Array of statement objects
     * @param {Object} ownerEmails - Map of ownerId to email address
     * @param {Object} listingTags - Map of listingId to tags
     * @returns {Object} Results summary
     */
    async sendBulkStatements(statements, ownerEmails, listingTags = {}) {
        const results = {
            sent: [],
            blocked: [],
            failed: [],
            summary: {
                total: statements.length,
                sentCount: 0,
                blockedCount: 0,
                failedCount: 0
            }
        };

        for (const statement of statements) {
            const ownerEmail = ownerEmails[statement.ownerId];

            if (!ownerEmail) {
                results.failed.push({
                    statementId: statement.id,
                    reason: 'NO_EMAIL',
                    message: `No email address for owner ${statement.ownerId}`
                });
                results.summary.failedCount++;
                continue;
            }

            // Get frequency tag from listing
            const tags = listingTags[statement.propertyId] || [];
            const frequencyTag = this.getFrequencyFromTags(tags);

            const sendResult = await this.sendStatementEmail({
                to: ownerEmail,
                statement,
                frequencyTag
                // Note: PDF attachment would need to be generated separately
            });

            if (sendResult.success) {
                results.sent.push({
                    statementId: statement.id,
                    recipient: ownerEmail,
                    frequencyTag,
                    messageId: sendResult.messageId
                });
                results.summary.sentCount++;
            } else if (sendResult.error === 'NEGATIVE_BALANCE_BLOCKED') {
                results.blocked.push({
                    statementId: statement.id,
                    ownerId: statement.ownerId,
                    ownerName: statement.ownerName,
                    propertyName: statement.propertyName,
                    ownerPayout: sendResult.ownerPayout,
                    reason: 'NEGATIVE_BALANCE'
                });
                results.summary.blockedCount++;
            } else {
                results.failed.push({
                    statementId: statement.id,
                    reason: sendResult.error,
                    message: sendResult.message
                });
                results.summary.failedCount++;
            }
        }

        return results;
    }

    /**
     * Generate PDF buffer for a statement
     * @param {string} statementId - Statement ID
     * @param {Object} statement - Statement object (for filename)
     * @param {string} authHeader - Authorization header for internal API call
     * @returns {Object} { pdfBuffer, filename }
     */
    async generateStatementPdf(statementId, statement, authHeader = null) {
        try {
            const htmlPdf = require('html-pdf-node');
            const port = process.env.PORT || 3003;
            const viewUrl = `http://localhost:${port}/api/statements/${statementId}/view?pdf=true`;

            // Fetch HTML from the view route internally
            const fetchHTML = () => {
                return new Promise((resolve, reject) => {
                    const options = {
                        headers: authHeader ? { 'Authorization': authHeader } : {}
                    };

                    http.get(viewUrl, options, (response) => {
                        let data = '';
                        response.on('data', chunk => data += chunk);
                        response.on('end', () => resolve(data));
                        response.on('error', reject);
                    }).on('error', reject);
                });
            };

            const statementHTML = await fetchHTML();

            const pdfOptions = {
                format: 'A4',
                landscape: false,
                margin: {
                    top: '10mm',
                    right: '10mm',
                    bottom: '10mm',
                    left: '10mm'
                },
                printBackground: true,
                preferCSSPageSize: false,
                displayHeaderFooter: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-extensions'
                ]
            };

            const file = { content: statementHTML };
            const pdfBuffer = await htmlPdf.generatePdf(file, pdfOptions);

            // Generate filename using property nickname
            let propertyNickname = statement.propertyName || 'Statement';
            const cleanPropertyName = propertyNickname
                .replace(/[^a-zA-Z0-9\s\-\.]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const startDate = (statement.weekStartDate || '').replace(/\//g, '-');
            const endDate = (statement.weekEndDate || '').replace(/\//g, '-');
            const statementPeriod = `${startDate} to ${endDate}`;

            const filename = `${cleanPropertyName} - ${statementPeriod}.pdf`;

            console.log(`[EmailService] Generated PDF for statement ${statementId}: ${filename}`);

            return {
                success: true,
                pdfBuffer,
                filename
            };
        } catch (error) {
            console.error(`[EmailService] Failed to generate PDF for statement ${statementId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send statement email with PDF attachment
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {Object} options.statement - Statement object
     * @param {string} options.frequencyTag - 'Weekly', 'Bi-Weekly', or 'Monthly'
     * @param {boolean} options.attachPdf - Whether to attach PDF (default: true)
     * @param {string} options.authHeader - Authorization header for PDF generation
     * @param {Function} options.refetchStatement - Function to refetch statement after PDF generation
     */
    async sendStatementEmailWithPdf(options) {
        const { to, statement, frequencyTag, attachPdf = true, authHeader, refetchStatement } = options;

        let pdfAttachment = null;
        let pdfFilename = null;
        let updatedStatement = statement;

        // Generate PDF if requested (this may trigger recalculation)
        if (attachPdf && statement.id) {
            const pdfResult = await this.generateStatementPdf(statement.id, statement, authHeader);
            if (pdfResult.success) {
                pdfAttachment = pdfResult.pdfBuffer;
                pdfFilename = pdfResult.filename;

                // Re-fetch statement to get updated values after PDF generation
                // (PDF view route may have recalculated and updated the statement)
                if (refetchStatement) {
                    try {
                        const refreshed = await refetchStatement(statement.id);
                        if (refreshed) {
                            updatedStatement = refreshed;
                            console.log(`[EmailService] Refreshed statement ${statement.id}: payout ${updatedStatement.ownerPayout}`);
                        }
                    } catch (err) {
                        console.warn(`[EmailService] Failed to refresh statement, using original values`);
                    }
                }
            } else {
                console.warn(`[EmailService] PDF generation failed, sending email without attachment`);
            }
        }

        // Call the existing send method with updated statement
        return this.sendStatementEmail({
            to,
            statement: updatedStatement,
            frequencyTag,
            pdfAttachment,
            pdfFilename
        });
    }
}

module.exports = new EmailService();
