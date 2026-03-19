/**
 * Base email layout with consistent Luxury Lodging PM branding.
 * Wraps body content in a styled HTML document with header and footer.
 *
 * @param {string} bodyContent - Inner HTML to place between header and footer
 * @returns {string} Full HTML document string
 */
module.exports = function baseLayout(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Luxury Lodging PM</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
          <!-- Header -->
          <tr>
            <td style="background:#111827;color:#ffffff;padding:20px 28px;text-align:center">
              <h1 style="margin:0;font-size:18px;font-weight:700;letter-spacing:0.02em">Luxury Lodging PM</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">
                Luxury Lodging PM &middot; Property Management Services
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:#d1d5db">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
