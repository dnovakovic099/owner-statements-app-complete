/**
 * Input sanitization middleware.
 * Trims whitespace from string values and strips HTML tags from all
 * request body fields.  Runs on every POST/PUT/PATCH request after
 * body parsing and before route handlers.
 *
 * Routes that legitimately carry rich-text HTML (email templates, mass
 * announcements) are skipped so template authors can submit real markup.
 * Those routes are admin-only and enforce their own safety at render time.
 */

const HTML_TAG_RE = /<[^>]*>/g;

// Routes where HTML input is expected (admin-authored email content). Prefixes
// matched against req.originalUrl so mounted paths like /api/* still work.
const HTML_ALLOWED_PREFIXES = [
    '/api/email-templates',
    '/api/email/announcement',
    '/api/email/send-bulk',
    '/api/email/schedule'
];

// Top-level body fields to preserve as-is (never strip HTML tags from these)
// for any route — belt-and-braces so a future route using htmlBody is safe.
const HTML_ALLOWED_FIELDS = new Set(['htmlBody', 'announcementBody', 'body']);

/**
 * Recursively sanitize a value:
 *  - strings: trim whitespace, strip HTML tags
 *  - arrays / plain objects: recurse into children
 *  - everything else: pass through untouched
 */
function sanitizeValue(value, fieldName) {
    if (typeof value === 'string') {
        if (fieldName && HTML_ALLOWED_FIELDS.has(fieldName)) {
            return value; // preserve markup in HTML-bearing fields
        }
        return value.trim().replace(HTML_TAG_RE, '');
    }
    if (Array.isArray(value)) {
        return value.map((v) => sanitizeValue(v, fieldName));
    }
    if (value !== null && typeof value === 'object') {
        return sanitizeObject(value);
    }
    return value;
}

function sanitizeObject(obj) {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
        cleaned[key] = sanitizeValue(obj[key], key);
    }
    return cleaned;
}

function isHtmlAllowedPath(req) {
    const url = req.originalUrl || req.url || '';
    return HTML_ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function sanitizeMiddleware(req, res, next) {
    if (req.body && typeof req.body === 'object' && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (isHtmlAllowedPath(req)) {
            // Skip tag stripping entirely for HTML-bearing admin routes.
            return next();
        }
        req.body = sanitizeObject(req.body);
    }
    next();
}

module.exports = sanitizeMiddleware;
