/**
 * Test Cases for Financial Dashboard Features
 *
 * Tests:
 * 1. Monthly trend data calculation for by-home-category
 * 2. Comparison period date calculations
 * 3. ROI/Profit margin calculations
 */

// =============================================================================
// Mock Data
// =============================================================================

const mockStatementData = [
    // Property 1 - PM category
    { propertyId: 100001, month: '2025-11', income: 5000, expenses: 2000 },
    { propertyId: 100001, month: '2025-12', income: 6000, expenses: 2500 },
    // Property 2 - PM category
    { propertyId: 100002, month: '2025-11', income: 4000, expenses: 1500 },
    { propertyId: 100002, month: '2025-12', income: 4500, expenses: 1800 },
    // Property 3 - Arbitrage category
    { propertyId: 100003, month: '2025-11', income: 3000, expenses: 2000 },
    { propertyId: 100003, month: '2025-12', income: 3500, expenses: 2200 },
];

const mockCategoryMapping = {
    100001: 'pm',
    100002: 'pm',
    100003: 'arbitrage',
    100004: 'owned',
    100005: 'shared',
};

// =============================================================================
// Helper Functions (replicating backend logic)
// =============================================================================

/**
 * Aggregate monthly data by category
 * This replicates the logic in financials.js by-home-category endpoint
 */
function aggregateMonthlyByCategory(statementData, categoryMapping) {
    const monthlyTrendByCategory = {
        pm: {},
        arbitrage: {},
        owned: {},
        shared: {},
    };

    statementData.forEach(({ propertyId, month, income, expenses }) => {
        const categoryKey = categoryMapping[propertyId];
        if (categoryKey && monthlyTrendByCategory[categoryKey]) {
            if (!monthlyTrendByCategory[categoryKey][month]) {
                monthlyTrendByCategory[categoryKey][month] = { income: 0, expenses: 0 };
            }
            monthlyTrendByCategory[categoryKey][month].income += income;
            monthlyTrendByCategory[categoryKey][month].expenses += expenses;
        }
    });

    return monthlyTrendByCategory;
}

/**
 * Format monthly trend objects to sorted arrays
 * This replicates the formatMonthlyTrend function in financials.js
 */
function formatMonthlyTrend(monthlyObj) {
    return Object.entries(monthlyObj)
        .map(([month, data]) => ({
            month,
            income: data.income,
            expenses: data.expenses,
            netIncome: data.income - data.expenses
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Calculate period dates from selection
 * This replicates the calculatePeriodDates function in FinancialDashboard.tsx
 * Using local date formatting to avoid timezone issues
 */
function calculatePeriodDates(period, referenceDate = new Date()) {
    const now = new Date(referenceDate);
    const year = now.getFullYear();
    const month = now.getMonth();

    // Format date as YYYY-MM-DD using local timezone
    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    switch (period) {
        case 'this-month': {
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'last-month': {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'this-quarter': {
            const qStart = Math.floor(month / 3) * 3;
            const start = new Date(year, qStart, 1);
            const end = new Date(year, qStart + 3, 0);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'last-quarter': {
            const qStart = Math.floor(month / 3) * 3 - 3;
            const start = new Date(year, qStart, 1);
            const end = new Date(year, qStart + 3, 0);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'this-year': {
            const start = new Date(year, 0, 1);
            const end = new Date(year, 11, 31);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'last-year': {
            const start = new Date(year - 1, 0, 1);
            const end = new Date(year - 1, 11, 31);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'last-30-days': {
            const end = new Date(now);
            const start = new Date(now);
            start.setDate(start.getDate() - 30);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'last-60-days': {
            const end = new Date(now);
            const start = new Date(now);
            start.setDate(start.getDate() - 60);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'last-90-days': {
            const end = new Date(now);
            const start = new Date(now);
            start.setDate(start.getDate() - 90);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        case 'last-6-months': {
            const end = new Date(now);
            const start = new Date(now);
            start.setMonth(start.getMonth() - 6);
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }
        default:
            return { startDate: '', endDate: '' };
    }
}

/**
 * Calculate profit margin (ROI proxy)
 */
function calculateProfitMargin(income, expenses) {
    const net = income - expenses;
    return income > 0 ? (net / income) * 100 : 0;
}

// =============================================================================
// Test Suites
// =============================================================================

describe('Financial Dashboard Features', () => {

    describe('Monthly Trend Data Aggregation', () => {

        test('should aggregate monthly data by category', () => {
            const result = aggregateMonthlyByCategory(mockStatementData, mockCategoryMapping);

            // PM category should have combined data from properties 100001 and 100002
            expect(result.pm['2025-11']).toEqual({ income: 9000, expenses: 3500 });
            expect(result.pm['2025-12']).toEqual({ income: 10500, expenses: 4300 });

            // Arbitrage should have data from property 100003
            expect(result.arbitrage['2025-11']).toEqual({ income: 3000, expenses: 2000 });
            expect(result.arbitrage['2025-12']).toEqual({ income: 3500, expenses: 2200 });

            // Owned and Shared should be empty (no properties)
            expect(Object.keys(result.owned)).toHaveLength(0);
            expect(Object.keys(result.shared)).toHaveLength(0);
        });

        test('should format monthly trend as sorted array', () => {
            const monthlyObj = {
                '2025-12': { income: 10000, expenses: 4000 },
                '2025-10': { income: 8000, expenses: 3000 },
                '2025-11': { income: 9000, expenses: 3500 },
            };

            const result = formatMonthlyTrend(monthlyObj);

            expect(result).toHaveLength(3);
            // Should be sorted by month ascending
            expect(result[0].month).toBe('2025-10');
            expect(result[1].month).toBe('2025-11');
            expect(result[2].month).toBe('2025-12');

            // Should calculate netIncome
            expect(result[0].netIncome).toBe(5000);  // 8000 - 3000
            expect(result[1].netIncome).toBe(5500);  // 9000 - 3500
            expect(result[2].netIncome).toBe(6000);  // 10000 - 4000
        });

        test('should handle empty monthly data', () => {
            const result = formatMonthlyTrend({});
            expect(result).toHaveLength(0);
        });

        test('should handle single month data', () => {
            const result = formatMonthlyTrend({
                '2025-12': { income: 5000, expenses: 2000 }
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                month: '2025-12',
                income: 5000,
                expenses: 2000,
                netIncome: 3000
            });
        });
    });

    describe('Comparison Period Date Calculations', () => {

        // Use a fixed reference date for predictable tests (use local time, not UTC)
        const referenceDate = new Date(2025, 11, 15);  // Dec 15, 2025 (month is 0-indexed)

        test('this-month should return current month range', () => {
            const result = calculatePeriodDates('this-month', referenceDate);

            expect(result.startDate).toBe('2025-12-01');
            expect(result.endDate).toBe('2025-12-31');
        });

        test('last-month should return previous month range', () => {
            const result = calculatePeriodDates('last-month', referenceDate);

            expect(result.startDate).toBe('2025-11-01');
            expect(result.endDate).toBe('2025-11-30');
        });

        test('this-quarter should return current quarter range', () => {
            const result = calculatePeriodDates('this-quarter', referenceDate);

            // December is in Q4 (Oct, Nov, Dec)
            expect(result.startDate).toBe('2025-10-01');
            expect(result.endDate).toBe('2025-12-31');
        });

        test('last-quarter should return previous quarter range', () => {
            const result = calculatePeriodDates('last-quarter', referenceDate);

            // Previous quarter from Q4 is Q3 (Jul, Aug, Sep)
            expect(result.startDate).toBe('2025-07-01');
            expect(result.endDate).toBe('2025-09-30');
        });

        test('this-year should return full year range', () => {
            const result = calculatePeriodDates('this-year', referenceDate);

            expect(result.startDate).toBe('2025-01-01');
            expect(result.endDate).toBe('2025-12-31');
        });

        test('last-year should return previous year range', () => {
            const result = calculatePeriodDates('last-year', referenceDate);

            expect(result.startDate).toBe('2024-01-01');
            expect(result.endDate).toBe('2024-12-31');
        });

        test('last-30-days should return 30 day range', () => {
            const result = calculatePeriodDates('last-30-days', referenceDate);

            expect(result.startDate).toBe('2025-11-15');
            expect(result.endDate).toBe('2025-12-15');
        });

        test('last-6-months should return 6 month range', () => {
            const result = calculatePeriodDates('last-6-months', referenceDate);

            expect(result.startDate).toBe('2025-06-15');
            expect(result.endDate).toBe('2025-12-15');
        });

        test('unknown period should return empty dates', () => {
            const result = calculatePeriodDates('unknown-period', referenceDate);

            expect(result.startDate).toBe('');
            expect(result.endDate).toBe('');
        });

        test('Q1 calculations (January reference)', () => {
            const janRef = new Date(2025, 0, 15);  // Jan 15, 2025
            const thisQ = calculatePeriodDates('this-quarter', janRef);
            const lastQ = calculatePeriodDates('last-quarter', janRef);

            // Q1 = Jan, Feb, Mar
            expect(thisQ.startDate).toBe('2025-01-01');
            expect(thisQ.endDate).toBe('2025-03-31');

            // Previous Q (Q4 of previous year)
            expect(lastQ.startDate).toBe('2024-10-01');
            expect(lastQ.endDate).toBe('2024-12-31');
        });
    });

    describe('ROI / Profit Margin Calculations', () => {

        test('should calculate correct profit margin', () => {
            // 60% profit margin: (1000 - 400) / 1000 * 100 = 60%
            expect(calculateProfitMargin(1000, 400)).toBe(60);

            // 25% profit margin
            expect(calculateProfitMargin(1000, 750)).toBe(25);

            // 0% profit margin (break-even)
            expect(calculateProfitMargin(1000, 1000)).toBe(0);
        });

        test('should return 0 for zero income', () => {
            expect(calculateProfitMargin(0, 500)).toBe(0);
        });

        test('should handle negative margin (loss)', () => {
            // Loss: expenses > income
            // (1000 - 1500) / 1000 * 100 = -50%
            expect(calculateProfitMargin(1000, 1500)).toBe(-50);
        });

        test('should handle 100% margin (no expenses)', () => {
            expect(calculateProfitMargin(1000, 0)).toBe(100);
        });

        test('should calculate category margins from aggregated data', () => {
            const aggregated = aggregateMonthlyByCategory(mockStatementData, mockCategoryMapping);

            // PM totals: income = 9000 + 10500 = 19500, expenses = 3500 + 4300 = 7800
            const pmTotalIncome = 19500;
            const pmTotalExpenses = 7800;
            const pmMargin = calculateProfitMargin(pmTotalIncome, pmTotalExpenses);

            // (19500 - 7800) / 19500 * 100 = 60%
            expect(pmMargin).toBe(60);

            // Arbitrage: income = 3000 + 3500 = 6500, expenses = 2000 + 2200 = 4200
            const arbTotalIncome = 6500;
            const arbTotalExpenses = 4200;
            const arbMargin = calculateProfitMargin(arbTotalIncome, arbTotalExpenses);

            // (6500 - 4200) / 6500 * 100 ≈ 35.38%
            expect(arbMargin).toBeCloseTo(35.38, 1);
        });
    });

    describe('Home Category Data Transformation', () => {

        const mockCategories = [
            {
                category: 'Property Management',
                properties: [
                    { id: 100001, name: 'Beach House', income: 5000, expenses: 2000 },
                    { id: 100002, name: 'Mountain Cabin', income: 4000, expenses: 1500 },
                ],
                monthlyTrend: [
                    { month: '2025-11', income: 9000, expenses: 3500, netIncome: 5500 },
                    { month: '2025-12', income: 10500, expenses: 4300, netIncome: 6200 },
                ]
            },
            {
                category: 'Arbitrage',
                properties: [
                    { id: 100003, name: 'City Apartment', income: 3000, expenses: 2000 },
                ],
                monthlyTrend: [
                    { month: '2025-11', income: 3000, expenses: 2000, netIncome: 1000 },
                    { month: '2025-12', income: 3500, expenses: 2200, netIncome: 1300 },
                ]
            }
        ];

        test('should transform API response to ByHomeTypeTab format', () => {
            const transformed = {
                pm: { income: [], expenses: [], monthlyTrend: [] },
                arbitrage: { income: [], expenses: [], monthlyTrend: [] },
                owned: { income: [], expenses: [], monthlyTrend: [] },
                shared: { employeeCosts: [], refunds: 0, chargebacks: 0, monthlyTrend: [] },
            };

            mockCategories.forEach(c => {
                const key = c.category.toLowerCase().replace(/\s+/g, '-');
                let mappedKey = null;

                if (key.includes('property-management') || key.includes('pm')) {
                    mappedKey = 'pm';
                } else if (key.includes('arbitrage')) {
                    mappedKey = 'arbitrage';
                }

                if (mappedKey && c.properties) {
                    const totalIncome = c.properties.reduce((sum, p) => sum + p.income, 0);

                    transformed[mappedKey].income = c.properties.map(p => ({
                        label: p.name,
                        amount: p.income,
                        percentage: totalIncome > 0 ? (p.income / totalIncome) * 100 : 0
                    }));

                    transformed[mappedKey].monthlyTrend = c.monthlyTrend || [];
                }
            });

            // Verify PM data
            expect(transformed.pm.income).toHaveLength(2);
            expect(transformed.pm.income[0].label).toBe('Beach House');
            expect(transformed.pm.income[0].amount).toBe(5000);
            expect(transformed.pm.monthlyTrend).toHaveLength(2);

            // Verify Arbitrage data
            expect(transformed.arbitrage.income).toHaveLength(1);
            expect(transformed.arbitrage.monthlyTrend).toHaveLength(2);
        });

        test('should handle empty categories', () => {
            const emptyCategories = [
                { category: 'Owned Properties', properties: [], monthlyTrend: [] }
            ];

            const transformed = { owned: { income: [], expenses: [], monthlyTrend: [] } };

            emptyCategories.forEach(c => {
                if (c.category.includes('Owned')) {
                    transformed.owned.monthlyTrend = c.monthlyTrend || [];
                }
            });

            expect(transformed.owned.income).toHaveLength(0);
            expect(transformed.owned.monthlyTrend).toHaveLength(0);
        });
    });
});

describe('Integration: Full Data Pipeline', () => {

    test('should process statement data through complete pipeline', () => {
        // Step 1: Aggregate by category
        const aggregated = aggregateMonthlyByCategory(mockStatementData, mockCategoryMapping);

        // Step 2: Format for each category
        const pmTrend = formatMonthlyTrend(aggregated.pm);
        const arbTrend = formatMonthlyTrend(aggregated.arbitrage);

        // Step 3: Verify PM trend
        expect(pmTrend).toHaveLength(2);
        expect(pmTrend[0].month).toBe('2025-11');
        expect(pmTrend[0].income).toBe(9000);  // 5000 + 4000
        expect(pmTrend[0].expenses).toBe(3500);  // 2000 + 1500
        expect(pmTrend[0].netIncome).toBe(5500);

        expect(pmTrend[1].month).toBe('2025-12');
        expect(pmTrend[1].income).toBe(10500);  // 6000 + 4500
        expect(pmTrend[1].expenses).toBe(4300);  // 2500 + 1800
        expect(pmTrend[1].netIncome).toBe(6200);

        // Step 4: Verify Arbitrage trend
        expect(arbTrend).toHaveLength(2);
        expect(arbTrend[0].netIncome).toBe(1000);  // 3000 - 2000
        expect(arbTrend[1].netIncome).toBe(1300);  // 3500 - 2200

        // Step 5: Calculate overall margins
        const pmTotalIncome = pmTrend.reduce((sum, m) => sum + m.income, 0);
        const pmTotalExpenses = pmTrend.reduce((sum, m) => sum + m.expenses, 0);
        const pmMargin = calculateProfitMargin(pmTotalIncome, pmTotalExpenses);

        expect(pmTotalIncome).toBe(19500);
        expect(pmTotalExpenses).toBe(7800);
        expect(pmMargin).toBe(60);  // 60% profit margin
    });

    test('should handle comparison between two periods', () => {
        const referenceDate = new Date(2025, 11, 15);  // Dec 15, 2025

        // Get current and previous period dates
        const currentPeriod = calculatePeriodDates('this-month', referenceDate);
        const previousPeriod = calculatePeriodDates('last-month', referenceDate);

        // Simulate data for each period
        const currentData = { income: 100000, expenses: 60000 };
        const previousData = { income: 90000, expenses: 55000 };

        // Calculate metrics
        const currentNet = currentData.income - currentData.expenses;
        const previousNet = previousData.income - previousData.expenses;

        const currentMargin = calculateProfitMargin(currentData.income, currentData.expenses);
        const previousMargin = calculateProfitMargin(previousData.income, previousData.expenses);

        // Calculate changes
        const incomeChange = ((currentData.income - previousData.income) / previousData.income) * 100;
        const marginChange = currentMargin - previousMargin;

        expect(currentPeriod.startDate).toBe('2025-12-01');
        expect(previousPeriod.startDate).toBe('2025-11-01');

        expect(currentNet).toBe(40000);
        expect(previousNet).toBe(35000);

        expect(incomeChange).toBeCloseTo(11.11, 1);  // ~11% increase
        expect(currentMargin).toBe(40);  // 40% margin
        expect(previousMargin).toBeCloseTo(38.89, 1);  // ~38.9% margin
        expect(marginChange).toBeCloseTo(1.11, 1);  // ~1.1pp improvement
    });
});
