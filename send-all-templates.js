/**
 * Script to send all email templates to a test email with statement attachment
 */

require('dotenv').config();
const EmailService = require('./src/services/EmailService');
const http = require('http');

const TEST_EMAIL = 'devendravariya73@gmail.com';
const STATEMENT_ID = 38;

// Sample statement data
const sampleStatement = {
    id: STATEMENT_ID,
    propertyId: 300017745,
    propertyName: 'Legacy Hills Dr. - Brent',
    ownerPayout: 386.04,
    weekStartDate: '2025-10-31',
    weekEndDate: '2025-11-29',
    ownerName: 'Brent'
};

// Generate PDF buffer from API
async function generatePdf(statementId) {
    return new Promise((resolve, reject) => {
        const auth = 'Basic ' + Buffer.from('LL:bnb547!').toString('base64');
        const options = {
            hostname: 'localhost',
            port: 3003,
            path: `/api/statements/${statementId}/download`,
            headers: { 'Authorization': auth },
            timeout: 60000
        };

        const req = http.get(options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`PDF download failed: ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// All template types to send
const templates = [
    { name: 'Weekly', frequencyTag: 'WEEKLY', method: 'getWeeklyTemplate' },
    { name: 'Bi-Weekly', frequencyTag: 'BI-WEEKLY A', method: 'getBiWeeklyTemplate' },
    { name: 'Monthly Calendar', frequencyTag: 'MONTHLY', method: 'getMonthlyCalendarTemplate', calculationType: 'calendar' },
    { name: 'Monthly Checkout', frequencyTag: 'MONTHLY', method: 'getMonthlyCheckoutTemplate', calculationType: 'checkout' },
    { name: 'Co-Host Negative Balance', frequencyTag: 'MONTHLY', method: 'getCohostNegativeBalanceTemplate', isNegative: true }
];

async function sendAllTemplates() {
    console.log('='.repeat(60));
    console.log(`Sending all template emails to: ${TEST_EMAIL}`);
    console.log('='.repeat(60));

    // First generate PDF once
    console.log('\nGenerating PDF attachment...');
    let pdfBuffer;
    try {
        pdfBuffer = await generatePdf(STATEMENT_ID);
        console.log(`✓ PDF generated (${pdfBuffer.length} bytes)`);
    } catch (err) {
        console.error('✗ Failed to generate PDF:', err.message);
        console.log('Continuing without attachment...');
    }

    const results = [];

    for (const template of templates) {
        console.log(`\n--- Sending ${template.name} Template ---`);

        // Prepare statement data
        const statementData = { ...sampleStatement };

        // For negative balance template, make payout negative
        if (template.isNegative) {
            statementData.ownerPayout = -386.04;
            statementData.stripeInvoiceUrl = 'https://pay.stripe.com/test-invoice-link';
        }

        // Get the template content
        const templateData = {
            ownerName: statementData.ownerName,
            propertyName: statementData.propertyName,
            periodStart: statementData.weekStartDate,
            periodEnd: statementData.weekEndDate,
            ownerPayout: statementData.ownerPayout,
            companyName: process.env.COMPANY_NAME || 'Luxury Lodging PM',
            stripeInvoiceUrl: statementData.stripeInvoiceUrl
        };

        let emailTemplate;
        if (template.method === 'getMonthlyCalendarTemplate') {
            emailTemplate = EmailService.getMonthlyCalendarTemplate(templateData);
        } else if (template.method === 'getMonthlyCheckoutTemplate') {
            emailTemplate = EmailService.getMonthlyCheckoutTemplate(templateData);
        } else if (template.method === 'getCohostNegativeBalanceTemplate') {
            emailTemplate = EmailService.getCohostNegativeBalanceTemplate(templateData);
        } else if (template.method === 'getWeeklyTemplate') {
            emailTemplate = EmailService.getWeeklyTemplate(templateData);
        } else if (template.method === 'getBiWeeklyTemplate') {
            emailTemplate = EmailService.getBiWeeklyTemplate(templateData);
        }

        // Add test banner to the email
        const testBanner = `
<div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
    <strong style="color: #92400e;">🧪 TEST EMAIL - ${template.name} Template</strong>
    <p style="margin: 5px 0 0 0; color: #92400e; font-size: 12px;">
        This is a test of the ${template.name} email template sent to ${TEST_EMAIL}
    </p>
</div>`;

        const modifiedHtml = emailTemplate.html.replace('<body', '<body>' + testBanner + '<div').replace('</body>', '</div></body>');

        // Prepare mail options
        const mailOptions = {
            from: `"Luxury Lodging" <${process.env.FROM_EMAIL || 'support@luxurylodgingpm.com'}>`,
            to: TEST_EMAIL,
            subject: `[TEST - ${template.name}] ${emailTemplate.subject}`,
            html: modifiedHtml,
            text: `[TEST - ${template.name} Template]\n\n${emailTemplate.text}`,
            attachments: []
        };

        // Add PDF attachment if available
        if (pdfBuffer) {
            mailOptions.attachments.push({
                filename: `${sampleStatement.propertyName} - Statement.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            });
        }

        try {
            const result = await EmailService.transporter.sendMail(mailOptions);
            console.log(`✓ ${template.name} email sent! MessageId: ${result.messageId}`);
            results.push({ template: template.name, success: true, messageId: result.messageId });
        } catch (err) {
            console.error(`✗ ${template.name} email failed:`, err.message);
            results.push({ template: template.name, success: false, error: err.message });
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Total: ${results.length} | Sent: ${sent} | Failed: ${failed}`);
    results.forEach(r => {
        console.log(`  ${r.success ? '✓' : '✗'} ${r.template}: ${r.success ? r.messageId : r.error}`);
    });

    console.log('\n✉️  All template emails sent to:', TEST_EMAIL);
}

sendAllTemplates().catch(console.error);
