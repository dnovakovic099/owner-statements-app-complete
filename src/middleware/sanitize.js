/**
 * Input sanitization middleware.
 * Trims whitespace from string values and strips HTML tags from all
 * request body fields.  Runs on every POST/PUT/PATCH request after
 * body parsing and before route handlers.
 */

const HTML_TAG_RE = /<[^>]*>/g;

/**
 * Recursively sanitize a value:
 *  - strings: trim whitespace, strip HTML tags
 *  - arrays / plain objects: recurse into children
 *  - everything else: pass through untouched
 */
function sanitizeValue(value) {
    if (typeof value === 'string') {
        return value.trim().replace(HTML_TAG_RE, '');
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === 'object') {
        return sanitizeObject(value);
    }
    return value;
}

function sanitizeObject(obj) {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
        cleaned[key] = sanitizeValue(obj[key]);
    }
    return cleaned;
}

function sanitizeMiddleware(req, res, next) {
    // Only process requests that carry a JSON / form body
    if (req.body && typeof req.body === 'object' && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        req.body = sanitizeObject(req.body);
    }
    next();
}

module.exports = sanitizeMiddleware;
