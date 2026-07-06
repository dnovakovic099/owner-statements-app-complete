/**
 * Expense / statement-item classification helpers.
 *
 * These decide how an expense is treated when a statement is generated:
 *   - LL Cover expenses are company-covered and excluded from the owner payout.
 *   - Canceled expenses (SecureStay status = "Canceled") are excluded from the
 *     generated statement/PDF but kept visible (greyed) in the edit view.
 *   - Hidden items (any reason) are omitted from the PDF.
 *
 * Kept in a standalone module so the same logic is shared by every statement
 * generation path in statements-file.js and can be unit-tested in isolation.
 */

/** True when an expense is flagged "LL Cover" (company-covered). */
const isLlCoverExpense = (expense) => Boolean(expense && expense.llCover && expense.llCover !== 0);

/** True when a statement item is hidden from the PDF (any reason). */
const isHiddenItem = (item) => Boolean(item && item.hidden);

/**
 * True when a SecureStay expense is marked canceled. Matches any status whose
 * text contains "cancel" (case-insensitive), so "Canceled", "Cancelled" and
 * "CANCELED" all qualify. Expenses without a status are never canceled.
 */
const isCanceledExpense = (expense) => {
    const status = expense && expense.status != null ? String(expense.status).trim().toLowerCase() : '';
    return status.includes('cancel');
};

/**
 * True when an expense is STANDARD turnover cleaning — the cleaning that a
 * property's guest-paid cleaning fee is meant to cover. This is the category
 * that a cleaning-fee-passthrough property should NOT bill to the owner.
 *
 * The SecureStay `category` field can be a comma-separated list (e.g.
 * "Cleaning, Supplies"), so we split into tokens and match an EXACT "cleaning"
 * token (falling back to type === "cleaning"). Qualified cleaning such as
 * "Extra Cleaning" or "Special Cleaning" is an ADDITIONAL service — it is NOT
 * standard cleaning and therefore stays on the statement even under passthrough.
 */
const isStandardCleaning = (expense) => {
    if (!expense) return false;
    const categoryTokens = String(expense.category || '')
        .toLowerCase()
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    if (categoryTokens.includes('cleaning')) return true;
    return String(expense.type || '').trim().toLowerCase() === 'cleaning';
};

module.exports = { isLlCoverExpense, isHiddenItem, isCanceledExpense, isStandardCleaning };
