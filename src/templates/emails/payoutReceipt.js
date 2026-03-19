/**
 * Payout receipt — rendered as an HTML page (served directly, not emailed).
 * Uses its own self-contained styles (not the email base layout) because
 * this is displayed in-browser and printed, not sent via email.
 *
 * @param {object} params
 * @param {number} params.statementId       - Statement ID
 * @param {string} params.payoutStatus      - 'paid' | 'collected'
 * @param {string} params.propertyName      - Property display name
 * @param {string} params.ownerName         - Owner display name
 * @param {string} params.periodStart       - Formatted start date string
 * @param {string} params.periodEnd         - Formatted end date string
 * @param {number} params.totalRevenue      - Total revenue amount
 * @param {number} params.pmCommission      - PM commission amount
 * @param {number} params.totalExpenses     - Total expenses amount
 * @param {number} params.payoutAmount      - Net owner payout
 * @param {number} params.wiseFee           - Transfer fee
 * @param {number} params.totalTransferAmount - Total transferred (payout + fee)
 * @param {string} params.transferId        - Increase transfer ID
 * @param {string} params.paidAtDate        - Formatted date (e.g. "Mar 19, 2026")
 * @param {string} params.paidAtFull        - Formatted date+time (e.g. "Wed, Mar 19, 2026 10:30 AM")
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

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Payout Receipt #${statementId}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #fff; color: #111827; padding: 40px; max-width: 600px; margin: 0 auto; }
  .receipt { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
  .receipt-header { background: #111827; color: white; padding: 24px 28px; display: flex; justify-content: space-between; align-items: center; }
  .receipt-header h1 { font-size: 16px; font-weight: 600; }
  .receipt-header .id { font-size: 12px; color: rgba(255,255,255,0.6); }
  .receipt-body { padding: 28px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
  .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: #059669; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
  .row:last-child { border-bottom: none; }
  .row .label { color: #6b7280; }
  .row .value { font-weight: 500; text-align: right; }
  .total-row { display: flex; justify-content: space-between; padding: 14px 0; margin-top: 8px; border-top: 2px solid #111827; font-size: 15px; font-weight: 700; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .footer { text-align: center; padding: 16px 28px; background: #f9fafb; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  @media print { body { padding: 0; } .receipt { border: none; } }
</style>
</head>
<body>
<div class="receipt">
  <div class="receipt-header">
    <div>
      <h1>Payout Receipt</h1>
      <div class="id">Luxury Lodging PM</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:600">#${statementId}</div>
      <div class="id">${paidAtDate}</div>
    </div>
  </div>
  <div class="receipt-body">
    <div class="badge"><span class="dot"></span> ${statusLabel}</div>

    <div class="section">
      <div class="section-title">Property Details</div>
      <div class="row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="row"><span class="label">Owner</span><span class="value">${ownerName}</span></div>
      <div class="row"><span class="label">Statement Period</span><span class="value">${periodStart} - ${periodEnd}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Payment Details</div>
      <div class="row"><span class="label">Revenue</span><span class="value">$${totalRevenue.toFixed(2)}</span></div>
      <div class="row"><span class="label">PM Commission</span><span class="value">-$${pmCommission.toFixed(2)}</span></div>
      <div class="row"><span class="label">Expenses</span><span class="value">-$${totalExpenses.toFixed(2)}</span></div>
      <div class="row"><span class="label">Owner Payout</span><span class="value" style="color:#059669;font-weight:700">$${payoutAmount.toFixed(2)}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Transfer Details</div>
      <div class="row"><span class="label">Method</span><span class="value">Increase (ACH)</span></div>
      <div class="row"><span class="label">Transfer ID</span><span class="value" style="font-family:monospace;font-size:12px">${transferId}</span></div>
      <div class="row"><span class="label">Fee</span><span class="value">$${wiseFee.toFixed(2)}</span></div>
      <div class="row"><span class="label">Date Sent</span><span class="value">${paidAtFull}</span></div>
    </div>

    <div class="total-row">
      <span>Total Transferred</span>
      <span>$${totalTransferAmount.toFixed(2)}</span>
    </div>
  </div>
  <div class="footer">This is an internal record. Generated by Luxury Lodging PM.</div>
</div>
</body></html>`;
};
