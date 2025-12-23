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
const EmailLog = require('../models/EmailLog');
const { EmailTemplate } = require('../models');

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
     * Format currency with commas (e.g., 2513.57 -> "2,513.57")
     */
    formatCurrency(amount) {
        const num = Math.abs(parseFloat(amount) || 0);
        return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Format period display for email templates
     * @param {string} start - Period start date
     * @param {string} end - Period end date
     * @returns {string} Formatted period string (e.g., "Dec 1-14, 2025")
     */
    formatPeriodDisplay(start, end) {
        try {
            const startDate = new Date(start);
            const endDate = new Date(end);
            const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
            const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
            const startDay = startDate.getDate();
            const endDay = endDate.getDate();
            const year = endDate.getFullYear();

            if (startMonth === endMonth) {
                return `${startMonth} ${startDay}-${endDay}, ${year}`;
            }
            return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
        } catch {
            return `${start} to ${end}`;
        }
    }

    /**
     * Get email template based on frequency tag
     * @param {string} frequencyTag - 'Weekly', 'Bi-Weekly', or 'Monthly'
     * @param {Object} data - Template data (ownerName, propertyName, period, etc.)
     */
    getEmailTemplate(frequencyTag, data, calculationType = 'checkout') {
        // Normalize the frequency tag (handle WEEKLY, BI-WEEKLY A, BI-WEEKLY B, MONTHLY)
        const normalizedTag = (frequencyTag || '').toUpperCase().trim();

        let templateKey = 'Monthly'; // Default
        if (normalizedTag === 'WEEKLY') {
            templateKey = 'Weekly';
        } else if (normalizedTag.startsWith('BI-WEEKLY')) {
            templateKey = 'Bi-Weekly';
        } else if (normalizedTag === 'MONTHLY') {
            templateKey = 'Monthly';
        }

        const templates = {
            'Weekly': this.getWeeklyTemplate(data),
            'Bi-Weekly': this.getBiWeeklyTemplate(data),
            'Monthly': this.getMonthlyTemplate(data, calculationType)
        };

        return templates[templateKey];
    }

    /**
     * Get email template from database by calculation type
     * Uses the default template for the given calculationType
     * @param {string} calculationType - 'checkout' or 'calendar'
     * @param {Object} data - Template data for variable replacement
     * @returns {Object|null} Template with subject, html, and text
     */
    async getTemplateFromDatabase(calculationType, data) {
        try {
            let template = null;

            // Step 1: Find template by calculationType, prefer the default one
            if (calculationType) {
                // First try to find one that is both matching type AND marked as default
                template = await EmailTemplate.findOne({
                    where: {
                        isActive: true,
                        calculationType: calculationType,
                        isDefault: true
                    }
                });

                // If no default for this type, find any active template with this type
                if (!template) {
                    template = await EmailTemplate.findOne({
                        where: {
                            isActive: true,
                            calculationType: calculationType
                        }
                    });
                }

                if (template) {
                    console.log(`[EmailService] Found template for '${calculationType}': ${template.name}`);
                }
            }

            // Step 2: Fall back to any default template
            if (!template) {
                template = await EmailTemplate.findOne({
                    where: {
                        isActive: true,
                        isDefault: true
                    }
                });
                if (template) {
                    console.log(`[EmailService] Using default template: ${template.name}`);
                }
            }

            if (!template) {
                return null;
            }

            // Apply variable replacements
            const subject = EmailTemplate.replaceVariables(template.subject, data);
            const html = EmailTemplate.replaceVariables(template.htmlBody, data);
            const text = template.textBody ? EmailTemplate.replaceVariables(template.textBody, data) : '';

            return {
                subject,
                html,
                text,
                templateName: template.name
            };
        } catch (error) {
            console.error('[EmailService] Error fetching template from database:', error);
            return null;
        }
    }

    /**
     * Weekly Statement Email Template
     */
    getWeeklyTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "Nov 24-Dec 1, 2025" style for weekly
        const formatWeeklyPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
                const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
                const startDay = startDate.getDate();
                const endDay = endDate.getDate();
                const year = endDate.getFullYear();

                if (startMonth === endMonth) {
                    return `${startMonth} ${startDay}-${endDay}, ${year}`;
                }
                return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        // Format for subject line: "11.24-12.1.2025"
        const formatSubjectPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startStr = `${startDate.getMonth() + 1}.${startDate.getDate()}`;
                const endStr = `${endDate.getMonth() + 1}.${endDate.getDate()}.${endDate.getFullYear()}`;
                return `${startStr}-${endStr}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        const periodDisplay = formatWeeklyPeriod(periodStart, periodEnd);
        const subjectPeriod = formatSubjectPeriod(periodStart, periodEnd);
        const formattedAmount = this.formatCurrency(ownerPayout);
        const balanceSuffix = ownerPayout < 0 ? ' (Balance Due)' : '';

        return {
            subject: `Owner Statement - ${subjectPeriod}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${formattedAmount}${balanceSuffix}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: WEEKLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period ${periodDisplay}.

STATEMENT TOTAL
$${formattedAmount}${balanceSuffix}

Payment will be sent shortly to your provided account.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: WEEKLY PAYOUTS
If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
            `
        };
    }

    /**
     * Bi-Weekly Statement Email Template
     */
    getBiWeeklyTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "Nov 17-Dec 1, 2025" style for bi-weekly
        const formatBiWeeklyPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
                const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
                const startDay = startDate.getDate();
                const endDay = endDate.getDate();
                const year = endDate.getFullYear();

                if (startMonth === endMonth) {
                    return `${startMonth} ${startDay}-${endDay}, ${year}`;
                }
                return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        // Format for subject line: "11.17-12.1.2025"
        const formatSubjectPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startStr = `${startDate.getMonth() + 1}.${startDate.getDate()}`;
                const endStr = `${endDate.getMonth() + 1}.${endDate.getDate()}.${endDate.getFullYear()}`;
                return `${startStr}-${endStr}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        const periodDisplay = formatBiWeeklyPeriod(periodStart, periodEnd);
        const subjectPeriod = formatSubjectPeriod(periodStart, periodEnd);
        const formattedAmount = this.formatCurrency(ownerPayout);
        const balanceSuffix = ownerPayout < 0 ? ' (Balance Due)' : '';

        return {
            subject: `Owner Statement - ${subjectPeriod}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${formattedAmount}${balanceSuffix}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: BI-WEEKLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period ${periodDisplay}.

STATEMENT TOTAL
$${formattedAmount}${balanceSuffix}

Payment will be sent shortly to your provided account.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: BI-WEEKLY PAYOUTS
If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
            `
        };
    }

    /**
     * Monthly Statement Email Template - Calendar (Prorated) basis
     * Standard calendar-based template without transition notice
     */
    getMonthlyCalendarTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "November 2025" style - use the actual statement period month
        // Monthly statements are for a complete month, so use the month from the statement dates
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                // Use the month from the statement dates (which should be the full month period)
                return startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } catch {
                return `${start} to ${end}`;
            }
        };
        const periodDisplay = formatPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${periodDisplay}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${this.formatCurrency(ownerPayout)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: MONTHLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period of ${periodDisplay}.

STATEMENT TOTAL
$${this.formatCurrency(ownerPayout)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

Payment will be sent shortly to your provided account.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: MONTHLY PAYOUTS
This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
            `
        };
    }

    /**
     * Monthly Statement Email Template - Calendar to Checkout Transition
     * Used for November 2025 to notify owners of upcoming change
     */
    getMonthlyCalendarToCheckoutTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "November 2025" style
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                return startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } catch {
                return `${start} to ${end}`;
            }
        };
        const periodDisplay = formatPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${periodDisplay}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${this.formatCurrency(ownerPayout)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: MONTHLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.</p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period of ${periodDisplay}.

STATEMENT TOTAL
$${this.formatCurrency(ownerPayout)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

Payment will be sent shortly to your provided account.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: MONTHLY PAYOUTS
This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.

Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.

This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
            `
        };
    }

    /**
     * Co-Host Negative Balance Email Template
     * Used when isCohostOnAirbnb is true and statement has negative balance
     * Includes Stripe invoice link placeholder
     */
    getCohostNegativeBalanceTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName, stripeInvoiceUrl } = data;

        // Format period as "Nov 17-Dec 1, 2025" style
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
                const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
                const startDay = startDate.getDate();
                const endDay = endDate.getDate();
                const year = endDate.getFullYear();

                if (startMonth === endMonth) {
                    return `${startMonth} ${startDay}-${endDay}, ${year}`;
                }
                return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        // Format for subject line: "11.17-12.1.2025"
        const formatSubjectPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                const endDate = new Date(end);
                const startStr = `${startDate.getMonth() + 1}.${startDate.getDate()}`;
                const endStr = `${endDate.getMonth() + 1}.${endDate.getDate()}.${endDate.getFullYear()}`;
                return `${startStr}-${endStr}`;
            } catch {
                return `${start} to ${end}`;
            }
        };

        const periodDisplay = formatPeriod(periodStart, periodEnd);
        const subjectPeriod = formatSubjectPeriod(periodStart, periodEnd);
        const balanceAmount = this.formatCurrency(ownerPayout);

        // Stripe invoice link - use provided URL or placeholder
        const invoiceLink = stripeInvoiceUrl || '[Stripe Invoice Link]';
        const invoiceLinkHtml = stripeInvoiceUrl
            ? `<a href="${stripeInvoiceUrl}" style="color: #2563eb;">this secure Stripe invoice link</a>`
            : '<strong>[Stripe Invoice Link]</strong>';

        return {
            subject: `Owner Statement - ${subjectPeriod}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">- $${balanceAmount}</p>
<p style="margin: 0 0 12px 0;">Since we're on a co-host setup on Airbnb, payouts for Airbnb reservations go directly to your account. This means this statement reflects a negative balance as we need to collect our management commission and any expenses we've covered on your behalf during the period.</p>
<p style="margin: 0 0 16px 0;">You can pay the balance using ${invoiceLinkHtml}.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: CO-HOST ON AIRBNB</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Airbnb sends the reservation payouts directly to you. Our management commission and any other covered expenses are then invoiced and reflected as a balance due.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: RESERVATION CALCULATION</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.</p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.</p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period ${periodDisplay}.

STATEMENT TOTAL
- $${balanceAmount}

Since we're on a co-host setup on Airbnb, payouts for Airbnb reservations go directly to your account. This means this statement reflects a negative balance as we need to collect our management commission and any expenses we've covered on your behalf during the period.

You can pay the balance using ${invoiceLink}.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: CO-HOST ON AIRBNB
Airbnb sends the reservation payouts directly to you. Our management commission and any other covered expenses are then invoiced and reflected as a balance due.

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: RESERVATION CALCULATION
This statement is calculated on a calendar (prorated) basis. For reservations that span different months, amounts are automatically prorated based on the number of nights within the current statement period.

Starting December 2025, we will shift to a check-out-based model. Meaning, reservations will be fully accounted for in the statement covering their check-out date. For stays longer than 14 nights, we will still apply calendar (prorated) basis to better reflect earnings throughout the stay.

This transition ensures more accurate tracking of adjustments such as extensions, mid-stay issues, or early check-outs.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
            `
        };
    }

    /**
     * Monthly Statement Email Template - Checkout basis
     * Used for December 2025 onwards
     */
    getMonthlyCheckoutTemplate(data) {
        const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

        // Format period as "November 2025" style
        const formatPeriod = (start, end) => {
            try {
                const startDate = new Date(start);
                return startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } catch {
                return `${start} to ${end}`;
            }
        };
        const periodDisplay = formatPeriod(periodStart, periodEnd);

        return {
            subject: `Owner Statement - ${periodDisplay}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
<p style="margin: 0 0 8px 0;">Hi${ownerName ? ' ' + ownerName : ''},</p>
<p style="margin: 0 0 12px 0;">Attached is your statement for the period of ${periodDisplay}.</p>
<p style="margin: 0;"><strong>STATEMENT TOTAL</strong></p>
<p style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold;">$${this.formatCurrency(ownerPayout)}${ownerPayout < 0 ? ' (Balance Due)' : ''}</p>
<p style="margin: 0 0 16px 0;">Payment will be sent shortly to your provided account.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>CALCULATING YOUR STATEMENT</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Base Rate + Guest Fees - Platform Fee = Revenue<br>
Revenue - PM Commission = Gross Payout<br>
Gross Payout - Expenses + Additional Payouts = Net Payout</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: EXPENSES AND ADDITIONAL PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Some items may appear on a later statement if they were recorded at the time the payment was actually made.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: TAXES</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">Any tax responsibilities that need to be remitted will be added to your Gross Payout.</p>
<p style="margin: 0 0 6px 0; font-size: 10px; color: #333;"><strong>NOTE: MONTHLY PAYOUTS</strong></p>
<p style="margin: 0 0 12px 0; font-size: 10px; color: #333;">If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 2px solid #999;"></td></tr></table>
<p style="margin: 0 0 8px 0;">If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.</p>
<p style="margin: 0 0 20px 0;">Thank you again for your trust and partnership.</p>
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.</p>
</body>
</html>`,
            text: `Hi${ownerName ? ' ' + ownerName : ''},

Attached is your statement for the period of ${periodDisplay}.

STATEMENT TOTAL
$${this.formatCurrency(ownerPayout)}${ownerPayout < 0 ? ' (Balance Due)' : ''}

Payment will be sent shortly to your provided account.

---

CALCULATING YOUR STATEMENT
Base Rate + Guest Fees - Platform Fee = Revenue
Revenue - PM Commission = Gross Payout
Gross Payout - Expenses + Additional Payouts = Net Payout

NOTE: EXPENSES AND ADDITIONAL PAYOUTS
Some items may appear on a later statement if they were recorded at the time the payment was actually made.

NOTE: TAXES
Any tax responsibilities that need to be remitted will be added to your Gross Payout.

NOTE: MONTHLY PAYOUTS
If a reservation's check-out falls beyond the current payout period, the associated earnings will carry over to the next statement.

---

If you have any questions, need clarification, or would like to provide feedback, feel free to reach out.

Thank you again for your trust and partnership.

---
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
            `
        };
    }

    /**
     * Get Monthly template based on calculation type
     * @param {Object} data - Template data
     * @param {string} calculationType - 'calendar' or 'checkout'
     */
    getMonthlyTemplate(data, calculationType = 'calendar') {
        if (calculationType === 'checkout') {
            return this.getMonthlyCheckoutTemplate(data);
        }
        return this.getMonthlyCalendarTemplate(data);
    }

    /**
     * Check if statement can be sent (Guardrails)
     * - Blocks negative balance statements
     * - Blocks statements where both revenue and payout are $0 (nothing to report)
     * @param {Object} statement - Statement object
     * @returns {Object} { canSend: boolean, reason: string }
     */
    checkNegativeBalanceGuardrail(statement) {
        const ownerPayout = parseFloat(statement.ownerPayout) || 0;
        const totalRevenue = parseFloat(statement.totalRevenue) || 0;

        // Block if both revenue and payout are $0 (nothing to report)
        if (totalRevenue === 0 && ownerPayout === 0) {
            return {
                canSend: false,
                reason: 'ZERO_ACTIVITY',
                message: 'Statement has $0 revenue and $0 payout. No activity to report.',
                ownerPayout,
                totalRevenue
            };
        }

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
        const { to, statement, frequencyTag, calculationType, pdfAttachment, pdfFilename, testNote } = options;

        // CRITICAL: PDF attachment is REQUIRED - no email without statement PDF
        if (!pdfAttachment) {
            console.error(`[EmailService] BLOCKED: No PDF attachment for statement ${statement?.id} - email cannot be sent without statement`);
            return {
                success: false,
                error: 'PDF_REQUIRED',
                message: 'Cannot send email without statement PDF attached. PDF attachment is required.'
            };
        }

        // Check SMTP configuration
        if (!this.isConfigured) {
            return {
                success: false,
                error: 'SMTP_NOT_CONFIGURED',
                message: 'Email service is not configured. Please set SMTP environment variables.'
            };
        }

        // Guardrail Check (negative balance, zero activity, etc.)
        const guardrailCheck = this.checkNegativeBalanceGuardrail(statement);
        if (!guardrailCheck.canSend) {
            console.log(`[EmailService] BLOCKED: Statement ${statement.id} - ${guardrailCheck.message}`);
            return {
                success: false,
                error: guardrailCheck.reason === 'ZERO_ACTIVITY' ? 'ZERO_ACTIVITY_BLOCKED' : 'NEGATIVE_BALANCE_BLOCKED',
                message: guardrailCheck.message,
                flaggedForReview: guardrailCheck.reason === 'NEGATIVE_BALANCE',
                ownerPayout: guardrailCheck.ownerPayout,
                totalRevenue: guardrailCheck.totalRevenue
            };
        }

        // Prepare template data for variable replacement
        const ownerPayout = parseFloat(statement.ownerPayout) || 0;
        const formattedPayout = Math.abs(ownerPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const templateData = {
            ownerName: (statement.ownerName || '').trim(),
            propertyName: statement.propertyName || 'Multiple Properties',
            periodStart: statement.weekStartDate,
            periodEnd: statement.weekEndDate,
            periodDisplay: this.formatPeriodDisplay(statement.weekStartDate, statement.weekEndDate),
            ownerPayout: formattedPayout,
            rawPayout: ownerPayout.toFixed(2),
            totalRevenue: statement.totalRevenue || '0.00',
            totalExpenses: statement.totalExpenses || '0.00',
            pmCommission: statement.pmCommission || '0.00',
            balanceSuffix: ownerPayout < 0 ? ' (Credit Due)' : '',
            isNegativeBalance: ownerPayout < 0 ? 'true' : 'false',
            companyName: process.env.COMPANY_NAME || 'Luxury Lodging PM',
            currentDate: new Date().toLocaleDateString(),
            currentYear: new Date().getFullYear().toString()
        };

        // Get calculation type from statement or options (default to checkout)
        const statementCalcType = calculationType || statement.calculationType || 'checkout';

        // Try to get template from database based on calculationType
        let template = await this.getTemplateFromDatabase(statementCalcType, templateData);

        // Fall back to hardcoded template if no database template found
        if (!template) {
            console.log(`[EmailService] No database template found for '${statementCalcType}', using hardcoded template`);
            template = this.getEmailTemplate(frequencyTag, templateData, statementCalcType);
        }

        // If testNote is provided, prepend it to the email body
        let emailHtml = template.html;
        let emailText = template.text;
        let emailSubject = template.subject;

        if (testNote) {
            const testNoteHtml = `
                <div style="background-color: #fff3cd; border: 2px solid #ffc107; padding: 20px; margin-bottom: 20px; border-radius: 8px; font-family: monospace;">
                    <h2 style="color: #856404; margin-top: 0;">TEST EMAIL - DO NOT FORWARD TO OWNER</h2>
                    <pre style="white-space: pre-wrap; color: #856404;">${testNote}</pre>
                </div>
            `;
            emailHtml = emailHtml.replace('<body>', '<body>' + testNoteHtml);
            emailText = testNote + '\n\n' + emailText;
            emailSubject = '[TEST] ' + emailSubject;
        }

        // Prepare email with dynamic CC recipients from environment
        // Default CC: admin@luxurylodgingpm.com, ferdinand@luxurylodgingpm.com
        const ccRecipients = process.env.STATEMENT_EMAIL_CC
            ? process.env.STATEMENT_EMAIL_CC.split(',').map(e => e.trim()).filter(e => e)
            : ['admin@luxurylodgingpm.com', 'ferdinand@luxurylodgingpm.com'];

        const mailOptions = {
            from: `"Luxury Lodging" <${process.env.FROM_EMAIL || 'statements@luxurylodgingpm.com'}>`,
            to: to,
            cc: ccRecipients,
            subject: emailSubject,
            html: emailHtml,
            text: emailText,
            attachments: []
        };

        // Add PDF attachment if provided
        if (pdfAttachment) {
            console.log(`[EmailService] PDF attachment type: ${typeof pdfAttachment}, isBuffer: ${Buffer.isBuffer(pdfAttachment)}, size: ${pdfAttachment.length || 'N/A'}`);
            if (Buffer.isBuffer(pdfAttachment)) {
                mailOptions.attachments.push({
                    filename: pdfFilename || `statement-${statement.id}.pdf`,
                    content: pdfAttachment,
                    contentType: 'application/pdf'
                });
                console.log(`[EmailService] Attached PDF: ${pdfFilename}, size: ${pdfAttachment.length} bytes`);
            } else if (typeof pdfAttachment === 'string') {
                mailOptions.attachments.push({
                    filename: pdfFilename || path.basename(pdfAttachment),
                    path: pdfAttachment,
                    contentType: 'application/pdf'
                });
            }
        } else {
            console.log(`[EmailService] No PDF attachment provided`);
        }

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log(`[EmailService] Email sent successfully to ${to} for statement ${statement.id}`);

            // Log successful email
            await this.logEmailAttempt({
                statementId: statement.id,
                propertyId: statement.propertyId,
                recipientEmail: to,
                recipientName: statement.ownerName,
                propertyName: statement.propertyName,
                frequencyTag,
                subject: emailSubject,
                status: 'sent',
                messageId: result.messageId,
                sentAt: new Date()
            });

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

            // Log failed email
            await this.logEmailAttempt({
                statementId: statement.id,
                propertyId: statement.propertyId,
                recipientEmail: to,
                recipientName: statement.ownerName,
                propertyName: statement.propertyName,
                frequencyTag,
                subject: emailSubject,
                status: 'failed',
                errorMessage: error.message,
                errorCode: error.code || 'SEND_FAILED',
                attemptedAt: new Date()
            });

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
     * Log email attempt to database
     * @param {Object} data - Email log data
     */
    async logEmailAttempt(data) {
        try {
            await EmailLog.create({
                statementId: data.statementId,
                propertyId: data.propertyId,
                recipientEmail: data.recipientEmail,
                recipientName: data.recipientName,
                propertyName: data.propertyName,
                frequencyTag: data.frequencyTag,
                subject: data.subject,
                status: data.status,
                messageId: data.messageId,
                errorMessage: data.errorMessage,
                errorCode: data.errorCode,
                attemptedAt: data.attemptedAt || new Date(),
                sentAt: data.sentAt,
                metadata: data.metadata
            });
            console.log(`[EmailService] Logged email ${data.status} for statement ${data.statementId}`);
        } catch (error) {
            console.error(`[EmailService] Failed to log email:`, error.message);
            // Don't throw - logging failure shouldn't break email sending
        }
    }

    /**
     * Get frequency tag from listing tags
     * @param {Array|string} tags - Listing tags
     * @returns {string} Frequency tag ('Weekly', 'Bi-Weekly', 'Monthly')
     */
    getFrequencyFromTags(tags) {
        const tagArray = Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim());

        for (const tag of tagArray) {
            const normalizedTag = tag.trim().toUpperCase();

            if (normalizedTag === 'WEEKLY') {
                return 'Weekly';
            }
            if (normalizedTag.startsWith('BI-WEEKLY') || normalizedTag === 'BIWEEKLY') {
                return 'Bi-Weekly';
            }
            if (normalizedTag === 'MONTHLY') {
                return 'Monthly';
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

                // Log failed email attempt due to missing email
                await this.logEmailAttempt({
                    statementId: statement.id,
                    propertyId: statement.propertyId,
                    recipientEmail: null,
                    recipientName: statement.ownerName || `Owner ${statement.ownerId}`,
                    propertyName: statement.propertyName,
                    frequencyTag: this.getFrequencyFromTags(listingTags[statement.propertyId] || []),
                    subject: null,
                    status: 'failed',
                    errorMessage: 'No email address configured for owner',
                    errorCode: 'NO_EMAIL',
                    attemptedAt: new Date()
                });

                continue;
            }

            // Get frequency tag from listing
            const tags = listingTags[statement.propertyId] || [];
            const frequencyTag = this.getFrequencyFromTags(tags);

            // Use sendStatementEmailWithPdf to ensure PDF is always attached
            const sendResult = await this.sendStatementEmailWithPdf({
                to: ownerEmail,
                statement,
                frequencyTag,
                attachPdf: true // REQUIRED - no email without statement PDF
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
            } else if (sendResult.error === 'ZERO_ACTIVITY_BLOCKED') {
                // Skip $0/$0 statements silently - no activity to report
                results.blocked.push({
                    statementId: statement.id,
                    ownerId: statement.ownerId,
                    ownerName: statement.ownerName,
                    propertyName: statement.propertyName,
                    ownerPayout: sendResult.ownerPayout,
                    totalRevenue: sendResult.totalRevenue,
                    reason: 'ZERO_ACTIVITY'
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
     * Generate PDF buffer for a statement by calling the existing download endpoint
     * This uses the same HTML template as the "Download PDF" button in the UI
     * @param {string} statementId - Statement ID
     * @param {Object} statement - Statement object (for filename)
     * @param {string} authHeader - Authorization header for internal API call
     * @returns {Object} { pdfBuffer, filename }
     */
    async generateStatementPdf(statementId, statement, authHeader = null) {
        try {
            const port = process.env.PORT || 3003;
            const downloadUrl = `http://localhost:${port}/api/statements/${statementId}/download`;

            // Call the existing download endpoint to get the PDF
            const pdfBuffer = await new Promise((resolve, reject) => {
                // Use provided auth header or fall back to internal basic auth
                const internalAuth = authHeader || 'Basic ' + Buffer.from(`${process.env.BASIC_AUTH_USER || 'LL'}:${process.env.BASIC_AUTH_PASS || 'bnb547!'}`).toString('base64');

                const options = {
                    headers: { 'Authorization': internalAuth },
                    timeout: 120000 // 2 minute timeout for PDF generation
                };

                const req = http.get(downloadUrl, options, (response) => {
                    // Check if response is successful
                    if (response.statusCode !== 200) {
                        reject(new Error(`Download failed with status ${response.statusCode}`));
                        return;
                    }

                    // Collect binary data
                    const chunks = [];
                    response.on('data', chunk => chunks.push(chunk));
                    response.on('end', () => resolve(Buffer.concat(chunks)));
                    response.on('error', reject);
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('PDF download timeout'));
                });
            });

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
        const { to, statement, frequencyTag, calculationType, attachPdf = true, authHeader, refetchStatement } = options;

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
                // BLOCK: Do not send email without PDF statement attached
                console.error(`[EmailService] PDF generation failed for statement ${statement.id} - email blocked`);
                return {
                    success: false,
                    error: 'PDF_GENERATION_FAILED',
                    message: `Cannot send email without statement PDF attached. PDF generation failed: ${pdfResult.error}`
                };
            }
        }

        // Verify PDF is attached before sending
        if (attachPdf && !pdfAttachment) {
            console.error(`[EmailService] No PDF attachment for statement ${statement.id} - email blocked`);
            return {
                success: false,
                error: 'NO_PDF_ATTACHMENT',
                message: 'Cannot send email without statement PDF attached'
            };
        }

        // Call the existing send method with updated statement
        // Template is auto-selected based on statement's calculationType
        return this.sendStatementEmail({
            to,
            statement: updatedStatement,
            frequencyTag,
            calculationType: calculationType || statement.calculationType,
            pdfAttachment,
            pdfFilename
        });
    }

    /**
     * Send user invitation email
     * @param {string} email - Recipient email
     * @param {string} username - Username for the new account
     * @param {string} role - User role (admin, editor, viewer)
     * @param {string} inviteUrl - URL to accept the invite
     */
    async sendInviteEmail(email, username, role, inviteUrl) {
        if (!this.isConfigured) {
            throw new Error('Email service is not configured');
        }

        const companyName = process.env.COMPANY_NAME || 'Luxury Lodging PM';
        const roleDescriptions = {
            admin: 'full administrative access including user management',
            editor: 'create, edit, and send owner statements',
            viewer: 'view statements and listings (read-only)'
        };

        const mailOptions = {
            from: `"${companyName}" <${process.env.FROM_EMAIL || 'noreply@luxurylodgingpm.com'}>`,
            to: email,
            subject: `You're invited to ${companyName} Owner Statements`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${companyName}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Owner Statements Portal</p>
    </div>

    <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
        <h2 style="color: #1f2937; margin-top: 0;">You've Been Invited!</h2>

        <p>Hello,</p>

        <p>You have been invited to join the ${companyName} Owner Statements portal with the following account:</p>

        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Username:</strong> ${username}</p>
            <p style="margin: 0 0 10px 0;"><strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">This role allows you to ${roleDescriptions[role] || 'access the portal'}.</p>
        </div>

        <p>Click the button below to set your password and activate your account:</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: bold; font-size: 16px;">Accept Invitation</a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">This invitation link will expire in 7 days.</p>

        <p style="color: #6b7280; font-size: 14px;">If you didn't expect this invitation or have questions, please contact your administrator.</p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

        <p style="color: #9ca3af; font-size: 12px; margin: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color: #6b7280; font-size: 12px; word-break: break-all;">${inviteUrl}</p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
</body>
</html>`,
            text: `You've Been Invited to ${companyName} Owner Statements Portal

Hello,

You have been invited to join the ${companyName} Owner Statements portal.

Username: ${username}
Role: ${role.charAt(0).toUpperCase() + role.slice(1)}
This role allows you to ${roleDescriptions[role] || 'access the portal'}.

To accept this invitation and set your password, visit:
${inviteUrl}

This invitation link will expire in 7 days.

If you didn't expect this invitation or have questions, please contact your administrator.

---
${companyName}
`
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailService] Invite email sent to ${email} for user ${username}`);
        return result;
    }

    /**
     * Send announcement email to owner
     */
    async sendAnnouncementEmail(recipientEmail, subject, htmlBody, ownerGreeting = 'Owner') {
        if (!this.isConfigured) {
            throw new Error('Email service is not configured');
        }

        const companyName = process.env.COMPANY_NAME || 'Luxury Lodging';

        // Extract base64 images and convert to CID attachments (Gmail blocks inline base64)
        const attachments = [];
        let processedHtml = htmlBody;
        const base64Regex = /<img[^>]+src="(data:image\/(png|jpeg|jpg|gif);base64,([^"]+))"[^>]*>/gi;
        let match;
        let imgIndex = 0;

        while ((match = base64Regex.exec(htmlBody)) !== null) {
            const fullMatch = match[0];
            const dataUrl = match[1];
            const imageType = match[2];
            const base64Data = match[3];
            const cid = `image${imgIndex}@announcement`;

            attachments.push({
                filename: `image${imgIndex}.${imageType}`,
                content: Buffer.from(base64Data, 'base64'),
                cid: cid
            });

            // Replace base64 src with cid reference
            processedHtml = processedHtml.replace(dataUrl, `cid:${cid}`);
            imgIndex++;
        }

        if (attachments.length > 0) {
            console.log(`[EmailService] Converted ${attachments.length} inline image(s) to CID attachments`);
        }

        const mailOptions = {
            from: `"${companyName}" <${process.env.FROM_EMAIL}>`,
            to: recipientEmail,
            subject: subject,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #333; margin: 0; padding: 0;">
${processedHtml}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
<tr><td style="border-top: 1px solid #ccc; padding-top: 15px;">
<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">
This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
</p>
</td></tr>
</table>
</body>
</html>`,
            text: `${htmlBody.replace(/<[^>]*>/g, '')}\n\n---\n${companyName}`,
            attachments: attachments
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailService] Announcement email sent to ${recipientEmail}`);
        return result;
    }
}

module.exports = new EmailService();
