/**
 * Category Mapping Utility
 *
 * Maps QuickBooks account names to standardized business expense categories.
 * This allows flexible matching of various QuickBooks account naming conventions
 * to a consistent set of reporting categories.
 */

// Standard expense categories for reporting
const STANDARD_CATEGORIES = {
    DARKO_DISTRIBUTION: 'Darko Distribution',
    LOUIS_DISTRIBUTION: 'Louis Distribution',
    OWNER_PAYOUT: 'Owner Payout',
    RENT: 'Rent',
    MORTGAGE: 'Mortgage',
    UTILITY: 'Utility',
    CLEANING: 'Cleaning',
    MAINTENANCE: 'Maintenance',
    REVIEW_REFUND: 'Review refund',
    CHARGEBACK: 'Chargeback',
    EMPLOYEE_BASE_PAY: 'Employee base pay',
    EMPLOYEE_COMMISSION: 'Employee commission',
    PHOTOGRAPHY_PAY: 'Photography pay',
    LEGAL: 'Legal',
    TAX: 'Tax',
    SOFTWARE_SUBSCRIPTION: 'Software subscription',
    ARBITRAGE_ACQUISITION: 'Arbitrage acquisition',
    HOME_OWNER_ACQUISITION: 'Home owner acquisition',
    OTHER: 'Other'
};

// Export list of all categories for frontend display
const ALL_CATEGORIES = Object.values(STANDARD_CATEGORIES).filter(c => c !== 'Other');

/**
 * Mapping rules: Each standard category has patterns to match against QuickBooks account names.
 * Patterns are case-insensitive and can be:
 * - Exact matches
 * - Partial matches (substring)
 * - Regex patterns
 */
const CATEGORY_PATTERNS = {
    [STANDARD_CATEGORIES.DARKO_DISTRIBUTION]: [
        'darko distribution',
        'darko dist',
        'darko payout',
        'darko owner payout',
        'distribution:darko',
        'owner distribution:darko',
    ],
    [STANDARD_CATEGORIES.LOUIS_DISTRIBUTION]: [
        'louis distribution',
        'louis dist',
        'louis payout',
        'louis owner payout',
        'distribution:louis',
        'owner distribution:louis',
    ],
    [STANDARD_CATEGORIES.OWNER_PAYOUT]: [
        'owner payout',
        'owner distribution',
        'owner payment',
        'payout:owner',
        'property owner payout',
        'homeowner payout',
        // Note: More specific distributions (Darko/Louis) should match first
    ],
    [STANDARD_CATEGORIES.RENT]: [
        'rent',
        'rent expense',
        'lease payment',
        'rental expense',
        'property rent',
        'office rent',
        'monthly rent',
    ],
    [STANDARD_CATEGORIES.MORTGAGE]: [
        'mortgage',
        'mortgage payment',
        'mortgage expense',
        'loan payment:mortgage',
        'home loan',
        'property mortgage',
    ],
    [STANDARD_CATEGORIES.UTILITY]: [
        'utility',
        'utilities',
        'utility expense',
        'electric',
        'electricity',
        'gas',
        'water',
        'sewer',
        'internet',
        'cable',
        'phone',
        'utility:',
        'utilities:',
    ],
    [STANDARD_CATEGORIES.CLEANING]: [
        'cleaning',
        'cleaning expense',
        'cleaning service',
        'housekeeping',
        'janitorial',
        'turnover cleaning',
        'deep clean',
        'cleaning supplies',
        'laundry',
    ],
    [STANDARD_CATEGORIES.MAINTENANCE]: [
        'maintenance',
        'maintenance expense',
        'repair',
        'repairs',
        'repairs and maintenance',
        'r&m',
        'property maintenance',
        'building maintenance',
        'hvac',
        'plumbing',
        'electrical repair',
        'handyman',
        'fix',
    ],
    [STANDARD_CATEGORIES.REVIEW_REFUND]: [
        'review refund',
        'guest refund',
        'refund:review',
        'review compensation',
        'guest compensation',
        'review remedy',
        'bad review refund',
    ],
    [STANDARD_CATEGORIES.CHARGEBACK]: [
        'chargeback',
        'charge back',
        'disputed charge',
        'payment dispute',
        'credit card dispute',
        'cc dispute',
        'reversal',
        'payment reversal',
    ],
    [STANDARD_CATEGORIES.EMPLOYEE_BASE_PAY]: [
        'employee base pay',
        'base pay',
        'salary',
        'wages',
        'payroll',
        'employee wages',
        'hourly pay',
        'regular pay',
        'employee salary',
        'staff pay',
        // Exclude commission patterns
    ],
    [STANDARD_CATEGORIES.EMPLOYEE_COMMISSION]: [
        'employee commission',
        'commission',
        'sales commission',
        'bonus',
        'incentive pay',
        'performance bonus',
        'commission:',
    ],
    [STANDARD_CATEGORIES.PHOTOGRAPHY_PAY]: [
        'photography pay',
        'photography',
        'photo expense',
        'photographer',
        'photo shoot',
        'listing photos',
        'property photos',
        'videography',
        'media production',
    ],
    [STANDARD_CATEGORIES.LEGAL]: [
        'legal',
        'legal expense',
        'legal fees',
        'attorney',
        'lawyer',
        'legal services',
        'court fees',
        'legal settlement',
        'contract review',
        'legal:',
    ],
    [STANDARD_CATEGORIES.TAX]: [
        'tax',
        'tax expense',
        'taxes',
        'property tax',
        'income tax',
        'sales tax',
        'tax payment',
        'tax:',
        'lodging tax',
        'occupancy tax',
        'tot', // Transient Occupancy Tax
    ],
    [STANDARD_CATEGORIES.SOFTWARE_SUBSCRIPTION]: [
        'software subscription',
        'software',
        'subscription',
        'saas',
        'app subscription',
        'software expense',
        'tech subscription',
        'cloud service',
        'hosting',
        'pms software', // Property Management Software
        'pricelabs',
        'hostaway',
        'guesty',
        'wheelhouse',
        'beyond pricing',
    ],
    [STANDARD_CATEGORIES.ARBITRAGE_ACQUISITION]: [
        'arbitrage acquisition',
        'arbitrage furnishing',
        'arbitrage setup',
        'arbitrage property',
        'arb acquisition',
        'arb furnishing',
        'rental arbitrage',
        'furnishing:arbitrage',
        'acquisition:arbitrage',
        'furniture:arbitrage',
        'startup cost:arbitrage',
    ],
    [STANDARD_CATEGORIES.HOME_OWNER_ACQUISITION]: [
        'home owner acquisition',
        'homeowner acquisition',
        'owner acquisition',
        'pm acquisition',
        'property management acquisition',
        'onboarding expense',
        'owner furnishing',
        'pm furnishing',
        'furnishing:pm',
        'acquisition:pm',
        'acquisition:owner',
        'furniture:owner',
        'startup cost:pm',
    ],
};

/**
 * Maps a QuickBooks account name to a standard category.
 *
 * @param {string} accountName - The QuickBooks account name
 * @param {string} [vendorName] - Optional vendor name for additional context
 * @param {string} [description] - Optional transaction description for additional context
 * @returns {string} The mapped standard category name
 */
function mapToCategory(accountName, vendorName = '', description = '') {
    if (!accountName) {
        return STANDARD_CATEGORIES.OTHER;
    }

    // Combine all text for matching, prioritizing account name
    const searchText = accountName.toLowerCase();
    const vendorText = (vendorName || '').toLowerCase();
    const descText = (description || '').toLowerCase();

    // Check each category's patterns
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        for (const pattern of patterns) {
            const patternLower = pattern.toLowerCase();

            // Check if pattern matches account name (primary)
            if (searchText.includes(patternLower) || searchText === patternLower) {
                return category;
            }

            // Check vendor name (secondary)
            if (vendorText.includes(patternLower)) {
                return category;
            }

            // Check description (tertiary)
            if (descText.includes(patternLower)) {
                return category;
            }
        }
    }

    // If no pattern matched, return the original account name as the category
    // This preserves visibility of unmapped categories for future mapping
    return accountName;
}

/**
 * Groups an array of transactions by their mapped category.
 *
 * @param {Array} transactions - Array of transaction objects with AccountName, VendorName, Description, Amount
 * @returns {Object} Object with categories as keys and aggregated data as values
 */
function groupByCategory(transactions) {
    const grouped = {};

    for (const txn of transactions) {
        const category = mapToCategory(
            txn.AccountName || txn.CategoryName,
            txn.VendorName,
            txn.Description
        );

        if (!grouped[category]) {
            grouped[category] = {
                name: category,
                total: 0,
                count: 0,
                transactions: [],
                // Track original QuickBooks accounts that mapped to this category
                originalAccounts: new Set(),
            };
        }

        grouped[category].total += txn.Amount || 0;
        grouped[category].count++;
        grouped[category].transactions.push({
            id: txn.Id,
            type: txn.Type,
            date: txn.TxnDate,
            amount: txn.Amount,
            description: txn.Description,
            vendor: txn.VendorName,
            customer: txn.CustomerName,
            originalAccount: txn.AccountName || txn.CategoryName,
        });

        if (txn.AccountName) {
            grouped[category].originalAccounts.add(txn.AccountName);
        }
    }

    // Convert Set to Array for JSON serialization
    for (const category of Object.values(grouped)) {
        category.originalAccounts = Array.from(category.originalAccounts);
    }

    return grouped;
}

/**
 * Creates a summary of categories with totals, sorted by amount.
 *
 * @param {Array} transactions - Array of transaction objects
 * @param {string} type - 'income' or 'expense' to determine sort order
 * @returns {Array} Array of category summaries sorted by absolute amount
 */
function getCategorySummary(transactions, type = 'expense') {
    const grouped = groupByCategory(transactions);

    const summary = Object.values(grouped).map(cat => ({
        name: cat.name,
        total: cat.total,
        count: cat.count,
        originalAccounts: cat.originalAccounts,
        // Include only limited transaction details in summary
        recentTransactions: cat.transactions.slice(0, 5),
    }));

    // Sort by absolute amount descending
    summary.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    return summary;
}

/**
 * Validates that all standard categories are properly defined.
 * Useful for testing and debugging.
 *
 * @returns {Object} Validation results
 */
function validateCategoryMapping() {
    const results = {
        valid: true,
        totalCategories: ALL_CATEGORIES.length,
        categoriesWithPatterns: 0,
        categoriesWithoutPatterns: [],
        totalPatterns: 0,
    };

    for (const category of ALL_CATEGORIES) {
        const patterns = CATEGORY_PATTERNS[category];
        if (patterns && patterns.length > 0) {
            results.categoriesWithPatterns++;
            results.totalPatterns += patterns.length;
        } else {
            results.valid = false;
            results.categoriesWithoutPatterns.push(category);
        }
    }

    return results;
}

/**
 * Gets all unmapped account names from a set of transactions.
 * Useful for identifying new QuickBooks accounts that need mapping.
 *
 * @param {Array} transactions - Array of transaction objects
 * @returns {Array} Array of account names that didn't match any pattern
 */
function getUnmappedAccounts(transactions) {
    const unmapped = new Set();

    for (const txn of transactions) {
        const originalAccount = txn.AccountName || txn.CategoryName;
        const category = mapToCategory(originalAccount, txn.VendorName, txn.Description);

        // If the category is the same as the original account, it wasn't mapped
        if (category === originalAccount && !ALL_CATEGORIES.includes(category)) {
            unmapped.add(originalAccount);
        }
    }

    return Array.from(unmapped).sort();
}

module.exports = {
    STANDARD_CATEGORIES,
    ALL_CATEGORIES,
    CATEGORY_PATTERNS,
    mapToCategory,
    groupByCategory,
    getCategorySummary,
    validateCategoryMapping,
    getUnmappedAccounts,
};
