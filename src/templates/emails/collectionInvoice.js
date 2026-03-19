const baseLayout = require('./baseLayout');

/**
 * Collection/payment-due email sent to owners with a negative statement balance.
 *
 * @param {object} params
 * @param {string} params.ownerName       - Owner display name
 * @param {number} params.collectAmount   - Positive dollar amount owed
 * @param {string} params.paymentPageUrl  - Link to the payment details page
 * @param {string} params.bankDetailsHtml - Pre-rendered bank details block (or empty string)
 * @param {number} params.statementId     - Statement ID for reference
 * @param {string} params.startDate       - Statement period start (e.g. "2026-01-06")
 * @param {string} params.endDate         - Statement period end (e.g. "2026-01-12")
 * @returns {string} Full HTML email string
 */
module.exports = function collectionInvoice({ ownerName, collectAmount, paymentPageUrl, bankDetailsHtml, statementId, startDate, endDate }) {
  const body = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Dear ${ownerName},</p>

<p style="margin:0 0 16px;font-size:15px;line-height:1.6">
  Your statement for <strong>${startDate}</strong> to <strong>${endDate}</strong> shows a balance due of
  <strong style="color:#dc2626">$${collectAmount.toFixed(2)}</strong>.
</p>

<p style="margin:0 0 20px;font-size:15px;line-height:1.6">
  Please send payment using one of the following methods:
</p>

<div style="text-align:center;margin:24px 0">
  <a href="${paymentPageUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
    View Payment Details
  </a>
</div>

${bankDetailsHtml || ''}

<p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.5">
  When making a wire transfer, please include <strong>"Statement #${statementId}"</strong> as the reference
  so we can match your payment.
</p>

<p style="margin:24px 0 0;font-size:15px;line-height:1.6">
  Thank you,<br/>
  <strong>Luxury Lodging PM</strong>
</p>`;

  return baseLayout(body);
};
