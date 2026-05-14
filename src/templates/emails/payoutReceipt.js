/**
 * Payout receipt rendered as HTML. Used both as an in-browser receipt and as
 * the body of the payout-sent email. Designed as an editorial financial
 * document — Gmail and most email clients ignore flexbox/grid, so the layout
 * is built with `<table>` rows and inline styles to guarantee alignment.
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
  const statusLabel = isCollected ? 'Collected' : 'Sent';
  const heroLabel = isCollected ? 'Collected from owner' : 'Payout to owner';

  // Tabular currency: $17,460.73
  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Escape everything that originates from the statement record. ownerName,
  // propertyName, and transferId are settable by app users (Hostify import,
  // manual edits, /mark-paid request body), and email clients including Gmail
  // execute event-handler attributes on rendered HTML (e.g. img onerror).
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Multi-listing group statements (legacy ones without statementDisplayName)
  // arrive here as 'Listing A, Listing B, Listing C, ...'. Show the first
  // listing followed by a muted '+ N more' so the document doesn't lose its
  // hierarchy to a 12-line property field.
  const condenseProperty = (raw) => {
    const parts = String(raw || '').split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1) return { primary: esc(raw || 'Property'), extra: 0 };
    if (parts.length <= 3) return { primary: esc(parts.join(', ')), extra: 0 };
    return { primary: esc(parts[0]), extra: parts.length - 1 };
  };
  const prop = condenseProperty(propertyName);
  const propertyHeadline = prop.extra
    ? `${prop.primary}<span style="color:#9c917f;font-style:italic;font-family:'EB Garamond','Cormorant Garamond',Georgia,serif;font-weight:400;"> &nbsp;+ ${prop.extra} more</span>`
    : prop.primary;

  const escOwnerName = esc(ownerName);
  const escTransferId = esc(transferId);
  const escPeriodStart = esc(periodStart);
  const escPeriodEnd = esc(periodEnd);
  const escPaidAtDate = esc(paidAtDate);
  const escPaidAtFull = esc(paidAtFull);

  // Shared inline styles
  const fontSans = `font-family:'IBM Plex Sans','Helvetica Neue',Helvetica,Arial,sans-serif`;
  const fontSerif = `font-family:'Cormorant Garamond','EB Garamond',Georgia,'Times New Roman',serif`;
  const fontMono = `font-family:'IBM Plex Mono',Menlo,Consolas,monospace`;
  const ink = '#1a1614';
  const muted = '#857c6e';
  const faint = '#9c917f';
  const hairline = '#e6dfd1';
  const paper = '#f4f0e7';
  const card = '#fdfbf6';
  const accent = isCollected ? '#7a3a2a' : '#2c5f3f';

  // One ledger row: small-caps label on the left, tabular figures on the right.
  const ledgerRow = (label, value, opts = {}) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid ${hairline};${fontSans};font-size:11px;font-weight:500;color:${muted};text-transform:uppercase;letter-spacing:0.12em;">${label}</td>
          <td style="padding:14px 0;border-bottom:1px solid ${hairline};${fontSans};font-size:${opts.size || '15px'};font-weight:${opts.weight || 500};color:${opts.color || ink};text-align:right;font-variant-numeric:tabular-nums;letter-spacing:0.01em;">${value}</td>
        </tr>`;

  // Compact two-column block (Method/Transfer ID/Fee/Date) — used inside the
  // muted transfer card.
  const detailRow = (label, value, mono = false) => `
        <tr>
          <td style="padding:9px 0;${fontSans};font-size:11px;font-weight:500;color:${faint};text-transform:uppercase;letter-spacing:0.1em;width:40%;vertical-align:top;">${label}</td>
          <td style="padding:9px 0;${mono ? fontMono : fontSans};font-size:12px;font-weight:500;color:${ink};text-align:right;word-break:break-all;">${value}</td>
        </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Payout Receipt &middot; Statement ${statementId}</title>
<!-- Web fonts: Apple Mail, Gmail, and Yahoo load these; Outlook falls back to Georgia/Helvetica -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${paper};${fontSans};color:${ink};-webkit-text-size-adjust:100%;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${paper};padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="620" style="max-width:620px;width:100%;background:${card};border:1px solid ${hairline};">

      <!-- Masthead -->
      <tr>
        <td style="padding:28px 40px 18px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <div style="${fontSerif};font-size:18px;font-weight:600;color:${ink};letter-spacing:0.04em;line-height:1;">Luxury Lodging</div>
                <div style="${fontSans};font-size:10px;font-weight:500;color:${faint};text-transform:uppercase;letter-spacing:0.22em;margin-top:6px;">Property Management</div>
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <div style="${fontSans};font-size:10px;font-weight:500;color:${faint};text-transform:uppercase;letter-spacing:0.18em;">Statement</div>
                <div style="${fontMono};font-size:14px;font-weight:500;color:${ink};margin-top:4px;letter-spacing:0.05em;">№ ${statementId}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Hairline under masthead -->
      <tr><td style="padding:0 40px;"><div style="border-top:1px solid ${hairline};line-height:0;font-size:0;">&nbsp;</div></td></tr>

      <!-- Hero: payout amount -->
      <tr>
        <td style="padding:40px 40px 32px;text-align:center;">
          <div style="${fontSans};font-size:10px;font-weight:500;color:${muted};text-transform:uppercase;letter-spacing:0.28em;">${heroLabel}</div>
          <div style="${fontSerif};font-size:54px;font-weight:500;color:${ink};line-height:1.05;margin-top:14px;letter-spacing:-0.01em;font-variant-numeric:tabular-nums;">${fmt(payoutAmount)}</div>
          <div style="${fontSerif};font-style:italic;font-size:15px;color:${muted};margin-top:14px;line-height:1.4;">
            ${statusLabel} on <span style="color:${accent};font-style:normal;font-weight:500;">${escPaidAtDate}</span>
          </div>
        </td>
      </tr>

      <!-- Property + period card -->
      <tr>
        <td style="padding:0 40px;">
          <div style="background:${paper};border:1px solid ${hairline};padding:20px 22px;">
            <div style="${fontSans};font-size:10px;font-weight:500;color:${muted};text-transform:uppercase;letter-spacing:0.22em;">Property</div>
            <div style="${fontSerif};font-size:22px;font-weight:500;color:${ink};line-height:1.25;margin-top:6px;letter-spacing:0.005em;">${propertyHeadline}</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:18px;">
              <tr>
                <td style="vertical-align:top;width:50%;padding-right:12px;">
                  <div style="${fontSans};font-size:10px;font-weight:500;color:${faint};text-transform:uppercase;letter-spacing:0.18em;">Owner</div>
                  <div style="${fontSans};font-size:13px;color:${ink};margin-top:5px;font-weight:500;">${escOwnerName}</div>
                </td>
                <td style="vertical-align:top;width:50%;padding-left:12px;border-left:1px solid ${hairline};">
                  <div style="${fontSans};font-size:10px;font-weight:500;color:${faint};text-transform:uppercase;letter-spacing:0.18em;">Period</div>
                  <div style="${fontSans};font-size:13px;color:${ink};margin-top:5px;font-weight:500;">${escPeriodStart} <span style="color:${faint};">—</span> ${escPeriodEnd}</div>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>

      <!-- Ledger -->
      <tr>
        <td style="padding:36px 40px 8px;">
          <div style="${fontSans};font-size:10px;font-weight:500;color:${muted};text-transform:uppercase;letter-spacing:0.28em;margin-bottom:8px;">Breakdown</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;border-top:1px solid ${hairline};">
            <tbody>
              ${ledgerRow('Revenue', fmt(totalRevenue))}
              ${ledgerRow('PM commission', `&minus;${fmt(pmCommission)}`)}
              ${ledgerRow('Expenses', `&minus;${fmt(totalExpenses)}`)}
            </tbody>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;margin-top:6px;border-top:2px solid ${ink};">
            <tbody>
              <tr>
                <td style="padding:18px 0 4px;${fontSans};font-size:11px;font-weight:600;color:${ink};text-transform:uppercase;letter-spacing:0.16em;">Owner payout</td>
                <td style="padding:18px 0 4px;${fontSerif};font-size:22px;font-weight:600;color:${accent};text-align:right;font-variant-numeric:tabular-nums;letter-spacing:-0.005em;">${fmt(payoutAmount)}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>

      <!-- Transfer card -->
      <tr>
        <td style="padding:28px 40px 4px;">
          <div style="${fontSans};font-size:10px;font-weight:500;color:${muted};text-transform:uppercase;letter-spacing:0.28em;margin-bottom:10px;">Transfer</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${paper};border:1px solid ${hairline};">
            <tr><td style="padding:14px 22px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tbody>
                  ${detailRow('Method', 'Increase &middot; ACH')}
                  ${detailRow('Transfer ID', escTransferId || '&mdash;', true)}
                  ${detailRow('Fee', fmt(wiseFee))}
                  ${detailRow('Sent', escPaidAtFull)}
                  <tr>
                    <td style="padding:14px 0 0;border-top:1px solid ${hairline};${fontSans};font-size:11px;font-weight:600;color:${ink};text-transform:uppercase;letter-spacing:0.14em;">Total transferred</td>
                    <td style="padding:14px 0 0;border-top:1px solid ${hairline};${fontSans};font-size:14px;font-weight:600;color:${ink};text-align:right;font-variant-numeric:tabular-nums;">${fmt(totalTransferAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- Colophon -->
      <tr>
        <td style="padding:32px 40px 36px;text-align:center;">
          <div style="border-top:1px solid ${hairline};padding-top:22px;">
            <div style="${fontSerif};font-style:italic;font-size:13px;color:${muted};line-height:1.5;">
              On record &middot; <span style="color:${ink};">Luxury Lodging Property Management</span>
            </div>
            <div style="${fontSans};font-size:10px;color:${faint};margin-top:8px;letter-spacing:0.04em;">
              This receipt is an automated record of an ACH transfer. Please retain for your files.
            </div>
          </div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
};
