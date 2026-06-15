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

module.exports = { isLlCoverExpense, isHiddenItem, isCanceledExpense };
