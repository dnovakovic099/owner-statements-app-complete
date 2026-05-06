/**
 * Payout receipt rendered as HTML. Used both as an in-browser receipt and as
 * the body of the payout-sent email. Gmail and most email clients ignore
 * flexbox/grid, so the layout is built with `<table>` rows and explicit
 * column widths to guarantee alignment everywhere.
 *
 * @param {object} params
 * @param {number} params.statementId
 * @param {string} params.payoutStatus           - 'paid' | 'collected'
 * @param {string} params.propertyName
 * @param {string} params.ownerName
 * @param {string} params.periodStart
 * @param {string} params.periodEnd
 * @param {number} params.totalRevenue
 * @param {number} params.pmCommission
 * @param {number} params.totalExpenses
 * @param {number} params.payoutAmount
 * @param {number} params.wiseFee
 * @param {number} params.totalTransferAmount
 * @param {string} params.transferId
 * @param {string} params.paidAtDate
 * @param {string} params.paidAtFull
 * @returns {string} Full HTML document string
 */
module.exports = function payoutReceipt({
  statementId,
  payoutStatus,
  propertyName,
  ownerName,
  periodStart,
  periodEnd,
  totalRevenue,
  pmCommission,
  totalExpenses,
  payoutAmount,
  wiseFee,
  totalTransferAmount,
  transferId,
  paidAtDate,
  paidAtFull,
}) {
  const statusLabel = payoutStatus === 'collected' ? 'Collected' : 'Payment Sent';
  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
  // Escape any string that comes from the statement record. ownerName,
  // propertyName, and transferId are all settable by app users (Hostify
  // import, manual edits, /mark-paid request body), and even Gmail will
  // execute event-handler attributes on rendered HTML (e.g. img onerror).
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const escPropertyName = esc(propertyName);
  const escOwnerName = esc(ownerName);
  const escTransferId = esc(transferId);
  const escPeriodStart = esc(periodStart);
  const escPeriodEnd = esc(periodEnd);
  const escPaidAtDate = esc(paidAtDate);
  const escPaidAtFull = esc(paidAtFull);

  // Each row is a 2-col table with fixed widths. Inline styles only.
  const row = (label, value, valueStyle = '') => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">${label}</td>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:500;text-align:right;${valueStyle}">${value}</td>
        </tr>`;

  const section = (title, rowsHtml) => `
    <div style="margin-bottom:20px;">
      <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${title}</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Payout Receipt #${statementId}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;color:#111827;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#111827;color:#ffffff;padding:24px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:top;">
                <div style="font-size:16px;font-weight:600;color:#ffffff;">Payout Receipt</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">Luxury Lodging PM</div>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <div style="font-size:13px;font-weight:600;color:#ffffff;">#${statementId}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">${escPaidAtDate}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <div style="display:inline-block;background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;margin-bottom:20px;">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#059669;vertical-align:middle;margin-right:6px;"></span>${statusLabel}
          </div>

          ${section('Property Details', [
            row('Property', escPropertyName),
            row('Owner', escOwnerName),
            row('Statement Period', `${escPeriodStart} to ${escPeriodEnd}`),
          ].join(''))}

          ${section('Payment Details', [
            row('Revenue', fmt(totalRevenue)),
            row('PM Commission', `-${fmt(pmCommission)}`),
            row('Expenses', `-${fmt(totalExpenses)}`),
            row('Owner Payout', fmt(payoutAmount), 'color:#059669;font-weight:700;'),
          ].join(''))}

          ${section('Transfer Details', [
            row('Method', 'Increase (ACH)'),
            row('Transfer ID', `<span style="font-family:monospace;font-size:12px;word-break:break-all;">${escTransferId}</span>`),
            row('Fee', fmt(wiseFee)),
            row('Date Sent', escPaidAtFull),
          ].join(''))}

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;border-top:2px solid #111827;">
            <tr>
              <td style="padding:14px 0;font-size:15px;font-weight:700;">Total Transferred</td>
              <td style="padding:14px 0;font-size:15px;font-weight:700;text-align:right;">${fmt(totalTransferAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding:16px 28px;background:#f9fafb;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
          This is an internal record. Generated by Luxury Lodging PM.
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
};
