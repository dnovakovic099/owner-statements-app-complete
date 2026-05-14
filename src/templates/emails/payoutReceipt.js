/**
 * Payout receipt rendered as HTML. Used both as an in-browser receipt and as
 * the body of the payout-sent email. Designed as a clean, classic receipt —
 * Gmail and most email clients ignore flexbox/grid, so the layout is built
 * with `<table>` rows and inline styles to guarantee alignment.
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
  const isCollected = payoutStatus === 'collected';
  const statusLabel = isCollected ? 'Collected' : 'Paid';
  const heroLabel = isCollected ? 'Amount Collected' : 'Amount Paid';

  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Escape every user-controlled string. ownerName, propertyName, and
  // transferId are settable by app users; email clients including Gmail will
  // execute event-handler attributes on rendered HTML (e.g. img onerror).
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Legacy group statements arrive as 'Listing A, Listing B, Listing C, ...'.
  // Show only the first listing followed by '+N more' so the document keeps
  // its hierarchy instead of being dominated by a wall of unit names.
  const condenseProperty = (raw) => {
    const parts = String(raw || '').split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1) return { primary: esc(raw || 'Property'), extra: 0 };
    if (parts.length <= 3) return { primary: esc(parts.join(', ')), extra: 0 };
    return { primary: esc(parts[0]), extra: parts.length - 1 };
  };
  const prop = condenseProperty(propertyName);
  const propertyHtml = prop.extra
    ? `${prop.primary} <span style="color:#9ca3af;font-weight:400;">+ ${prop.extra} more</span>`
    : prop.primary;

  const escOwnerName = esc(ownerName);
  const escTransferId = esc(transferId);
  const escPeriodStart = esc(periodStart);
  const escPeriodEnd = esc(periodEnd);
  const escPaidAtDate = esc(paidAtDate);
  const escPaidAtFull = esc(paidAtFull);

  const fontStack = `font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif`;
  const fontMono = `font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace`;
  const ink = '#111827';
  const muted = '#6b7280';
  const faint = '#9ca3af';
  const hairline = '#e5e7eb';
  const statusColor = isCollected ? '#b45309' : '#047857';

  // A row in the breakdown table: label left, value right, hairline below.
  const row = (label, value, opts = {}) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid ${hairline};${fontStack};font-size:14px;color:${muted};">${label}</td>
          <td style="padding:14px 0;border-bottom:1px solid ${hairline};${fontStack};font-size:14px;color:${opts.color || ink};font-weight:${opts.weight || 400};text-align:right;font-variant-numeric:tabular-nums;">${value}</td>
        </tr>`;

  // A row in the transfer details table (no hairline; tighter).
  const meta = (label, value, mono = false) => `
        <tr>
          <td style="padding:8px 0;${fontStack};font-size:13px;color:${muted};vertical-align:top;width:40%;">${label}</td>
          <td style="padding:8px 0;${mono ? fontMono : fontStack};font-size:13px;color:${ink};text-align:right;word-break:break-all;">${value}</td>
        </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Payout Receipt &middot; Statement ${statementId}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;${fontStack};color:${ink};-webkit-text-size-adjust:100%;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f5f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${hairline};">

      <!-- Header -->
      <tr>
        <td style="padding:32px 36px 20px;border-bottom:1px solid ${hairline};">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:top;">
                <div style="${fontStack};font-size:15px;font-weight:600;color:${ink};letter-spacing:-0.005em;">Luxury Lodging</div>
                <div style="${fontStack};font-size:12px;color:${muted};margin-top:2px;">Property Management</div>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <div style="${fontStack};font-size:12px;color:${muted};">Statement</div>
                <div style="${fontStack};font-size:14px;font-weight:500;color:${ink};margin-top:2px;">#${statementId}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Hero amount -->
      <tr>
        <td style="padding:36px 36px 28px;text-align:center;border-bottom:1px solid ${hairline};">
          <div style="${fontStack};font-size:12px;color:${muted};text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">${heroLabel}</div>
          <div style="${fontStack};font-size:36px;font-weight:600;color:${ink};margin-top:10px;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;line-height:1.1;">${fmt(payoutAmount)}</div>
          <div style="${fontStack};font-size:13px;color:${muted};margin-top:10px;">
            <span style="color:${statusColor};font-weight:500;">${statusLabel}</span> on ${escPaidAtDate}
          </div>
        </td>
      </tr>

      <!-- Property / Owner / Period -->
      <tr>
        <td style="padding:24px 36px;border-bottom:1px solid ${hairline};">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:top;padding-bottom:14px;">
                <div style="${fontStack};font-size:12px;color:${muted};">Property</div>
                <div style="${fontStack};font-size:14px;font-weight:500;color:${ink};margin-top:3px;line-height:1.4;">${propertyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="vertical-align:top;padding-top:12px;border-top:1px solid ${hairline};">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:top;width:50%;padding-right:10px;">
                      <div style="${fontStack};font-size:12px;color:${muted};">Owner</div>
                      <div style="${fontStack};font-size:14px;color:${ink};margin-top:3px;">${escOwnerName}</div>
                    </td>
                    <td style="vertical-align:top;width:50%;padding-left:10px;">
                      <div style="${fontStack};font-size:12px;color:${muted};">Statement Period</div>
                      <div style="${fontStack};font-size:14px;color:${ink};margin-top:3px;">${escPeriodStart} – ${escPeriodEnd}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Breakdown -->
      <tr>
        <td style="padding:24px 36px 8px;">
          <div style="${fontStack};font-size:12px;color:${muted};text-transform:uppercase;letter-spacing:0.06em;font-weight:500;margin-bottom:6px;">Breakdown</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
            <tbody>
              ${row('Revenue', fmt(totalRevenue))}
              ${row('PM Commission', `&minus;${fmt(pmCommission)}`)}
              ${row('Expenses', `&minus;${fmt(totalExpenses)}`)}
              <tr>
                <td style="padding:18px 0 0;${fontStack};font-size:14px;color:${ink};font-weight:600;">Owner Payout</td>
                <td style="padding:18px 0 0;${fontStack};font-size:16px;color:${ink};font-weight:600;text-align:right;font-variant-numeric:tabular-nums;">${fmt(payoutAmount)}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>

      <!-- Transfer details -->
      <tr>
        <td style="padding:28px 36px 24px;border-top:1px solid ${hairline};margin-top:16px;">
          <div style="${fontStack};font-size:12px;color:${muted};text-transform:uppercase;letter-spacing:0.06em;font-weight:500;margin-bottom:8px;">Transfer Details</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
            <tbody>
              ${meta('Method', 'Increase &middot; ACH')}
              ${meta('Transfer ID', escTransferId || '&mdash;', true)}
              ${meta('Fee', fmt(wiseFee))}
              ${meta('Sent', escPaidAtFull)}
              <tr>
                <td style="padding:14px 0 0;border-top:1px solid ${hairline};${fontStack};font-size:13px;color:${ink};font-weight:600;">Total Transferred</td>
                <td style="padding:14px 0 0;border-top:1px solid ${hairline};${fontStack};font-size:14px;color:${ink};font-weight:600;text-align:right;font-variant-numeric:tabular-nums;">${fmt(totalTransferAmount)}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:18px 36px 22px;text-align:center;background:#fafafa;border-top:1px solid ${hairline};">
          <div style="${fontStack};font-size:11px;color:${faint};line-height:1.5;">
            Automated receipt &middot; Luxury Lodging Property Management
          </div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
};
