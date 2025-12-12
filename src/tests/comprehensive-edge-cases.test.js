/**
 * Comprehensive Edge Cases Test Suite
 * Converted to Jest format
 */

// ============================================================================
// HELPER FUNCTIONS (mirrors app logic)
// ============================================================================

function isAirbnbSource(source) {
    if (!source || typeof source !== 'string') return false;
    return source.toLowerCase().includes('airbnb');
}

function shouldAddTax(source, disregardTax, airbnbPassThroughTax) {
    if (disregardTax) return false;
    const isAirbnb = isAirbnbSource(source);
    if (isAirbnb && !airbnbPassThroughTax) return false;
    return true;
}

function calculatePmCommission(revenue, pmPercentage) {
    return Math.round((revenue * (pmPercentage / 100)) * 100) / 100;
}

function calculateGrossPayout(clientRevenue, pmFee, tax, shouldAddTaxFlag) {
    return clientRevenue - pmFee + (shouldAddTaxFlag ? tax : 0);
}

function formatCurrency(amount) {
    return Math.round(amount * 100) / 100;
}

function getGrossPayoutColorClass(amount) {
    return amount >= 0 ? 'revenue-amount' : 'expense-amount';
}

function getTaxColorClass(source, disregardTax, airbnbPassThroughTax) {
    if (disregardTax) return 'info-amount';
    if (isAirbnbSource(source) && !airbnbPassThroughTax) return 'info-amount';
    return 'revenue-amount';
}

function sumArray(arr, key) {
    return arr.reduce((sum, item) => sum + (item[key] || 0), 0);
}

function filterByProperty(arr, key, value) {
    return arr.filter(item => item[key] === value);
}

function groupByProperty(arr, key) {
    return arr.reduce((groups, item) => {
        const val = item[key];
        groups[val] = groups[val] || [];
        groups[val].push(item);
        return groups;
    }, {});
}

function isDateInRange(date, startDate, endDate) {
    const d = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return d >= start && d <= end;
}

function getDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function isBeforeDate(date1, date2) {
    return new Date(date1) < new Date(date2);
}

function sanitizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().toLowerCase();
}

function truncateString(str, maxLength) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

// Test data
const testReservations = [
    { id: 1, propertyId: 100, revenue: 500, source: 'Airbnb' },
    { id: 2, propertyId: 100, revenue: 600, source: 'VRBO' },
    { id: 3, propertyId: 200, revenue: 700, source: 'Airbnb' },
    { id: 4, propertyId: 200, revenue: 800, source: 'Direct' },
    { id: 5, propertyId: 300, revenue: 900, source: 'Marriott' }
];

// ============================================================================
// TEST GROUP 1: Currency Formatting Edge Cases (20 tests)
// ============================================================================
describe('Currency Formatting Edge Cases', () => {
    test('1.1 Format positive integer', () => {
        expect(formatCurrency(100)).toBe(100);
    });

    test('1.2 Format positive decimal', () => {
        expect(formatCurrency(100.555)).toBe(100.56);
    });

    test('1.3 Format negative integer', () => {
        expect(formatCurrency(-100)).toBe(-100);
    });

    test('1.4 Format negative decimal', () => {
        expect(formatCurrency(-100.555)).toBe(-100.55);
    });

    test('1.5 Format zero', () => {
        expect(formatCurrency(0)).toBe(0);
    });

    test('1.6 Format very small positive', () => {
        expect(formatCurrency(0.001)).toBe(0);
    });

    test('1.7 Format very small negative', () => {
        expect(formatCurrency(-0.001) === 0).toBe(true);
    });

    test('1.8 Format 0.005 (rounds up)', () => {
        expect(formatCurrency(0.005)).toBe(0.01);
    });

    test('1.9 Format 0.004 (rounds down)', () => {
        expect(formatCurrency(0.004)).toBe(0);
    });

    test('1.10 Format large number', () => {
        expect(formatCurrency(999999.999)).toBe(1000000);
    });

    test('1.11 Format with trailing zeros', () => {
        expect(formatCurrency(100.10)).toBe(100.1);
    });

    test('1.12 Format scientific notation small', () => {
        expect(formatCurrency(1e-10)).toBe(0);
    });

    test('1.13 Format scientific notation large', () => {
        expect(formatCurrency(1e6)).toBe(1000000);
    });

    test('1.14 Format negative zero', () => {
        expect(formatCurrency(-0) === 0).toBe(true);
    });

    test('1.15 Format 99.994 (rounds to 99.99)', () => {
        expect(formatCurrency(99.994)).toBe(99.99);
    });

    test('1.16 Format 99.995 (rounds to 100)', () => {
        expect(formatCurrency(99.995)).toBe(100);
    });

    test('1.17 Format 0.01', () => {
        expect(formatCurrency(0.01)).toBe(0.01);
    });

    test('1.18 Format -0.01', () => {
        expect(formatCurrency(-0.01)).toBe(-0.01);
    });

    test('1.19 Format 123.456789', () => {
        expect(formatCurrency(123.456789)).toBe(123.46);
    });

    test('1.20 Format -123.456789', () => {
        expect(formatCurrency(-123.456789)).toBe(-123.46);
    });
});

// ============================================================================
// TEST GROUP 2: PM Commission Calculations (20 tests)
// ============================================================================
describe('PM Commission Calculations', () => {
    test('2.1 PM at 15% of $1000', () => {
        expect(calculatePmCommission(1000, 15)).toBe(150);
    });

    test('2.2 PM at 20% of $1000', () => {
        expect(calculatePmCommission(1000, 20)).toBe(200);
    });

    test('2.3 PM at 10% of $500', () => {
        expect(calculatePmCommission(500, 10)).toBe(50);
    });

    test('2.4 PM at 0% of $1000', () => {
        expect(calculatePmCommission(1000, 0)).toBe(0);
    });

    test('2.5 PM at 100% of $1000', () => {
        expect(calculatePmCommission(1000, 100)).toBe(1000);
    });

    test('2.6 PM at 15% of $0', () => {
        expect(calculatePmCommission(0, 15)).toBe(0);
    });

    test('2.7 PM at 15% of negative revenue', () => {
        expect(calculatePmCommission(-1000, 15)).toBe(-150);
    });

    test('2.8 PM at 12.5% of $800', () => {
        expect(calculatePmCommission(800, 12.5)).toBe(100);
    });

    test('2.9 PM at 17.5% of $1000', () => {
        expect(calculatePmCommission(1000, 17.5)).toBe(175);
    });

    test('2.10 PM at 15% of $1 (small amount)', () => {
        expect(calculatePmCommission(1, 15)).toBe(0.15);
    });

    test('2.11 PM at 15% of $0.01', () => {
        expect(calculatePmCommission(0.01, 15)).toBe(0);
    });

    test('2.12 PM at 33.33% of $300', () => {
        expect(calculatePmCommission(300, 33.33)).toBe(99.99);
    });

    test('2.13 PM at 15% of $999.99', () => {
        expect(calculatePmCommission(999.99, 15)).toBe(150);
    });

    test('2.14 PM at 15% of $10000', () => {
        expect(calculatePmCommission(10000, 15)).toBe(1500);
    });

    test('2.15 PM at 15% of $100000', () => {
        expect(calculatePmCommission(100000, 15)).toBe(15000);
    });

    test('2.16 PM at 1% of $10000', () => {
        expect(calculatePmCommission(10000, 1)).toBe(100);
    });

    test('2.17 PM at 99% of $1000', () => {
        expect(calculatePmCommission(1000, 99)).toBe(990);
    });

    test('2.18 PM at 50% of $500', () => {
        expect(calculatePmCommission(500, 50)).toBe(250);
    });

    test('2.19 PM at 25% of $400', () => {
        expect(calculatePmCommission(400, 25)).toBe(100);
    });

    test('2.20 PM at 15.5% of $1000', () => {
        expect(calculatePmCommission(1000, 15.5)).toBe(155);
    });
});

// ============================================================================
// TEST GROUP 3: Source Detection Extended (20 tests)
// ============================================================================
describe('Source Detection Extended', () => {
    test('3.1 Airbnb exact match', () => {
        expect(isAirbnbSource('Airbnb')).toBe(true);
    });

    test('3.2 AIRBNB uppercase', () => {
        expect(isAirbnbSource('AIRBNB')).toBe(true);
    });

    test('3.3 airbnb lowercase', () => {
        expect(isAirbnbSource('airbnb')).toBe(true);
    });

    test('3.4 AiRbNb mixed case', () => {
        expect(isAirbnbSource('AiRbNb')).toBe(true);
    });

    test('3.5 Airbnb.com', () => {
        expect(isAirbnbSource('Airbnb.com')).toBe(true);
    });

    test('3.6 Airbnb (Co-host)', () => {
        expect(isAirbnbSource('Airbnb (Co-host)')).toBe(true);
    });

    test('3.7 Airbnb Official', () => {
        expect(isAirbnbSource('Airbnb Official')).toBe(true);
    });

    test('3.8 Via Airbnb', () => {
        expect(isAirbnbSource('Via Airbnb')).toBe(true);
    });

    test('3.9 VRBO', () => {
        expect(isAirbnbSource('VRBO')).toBe(false);
    });

    test('3.10 Booking.com', () => {
        expect(isAirbnbSource('Booking.com')).toBe(false);
    });

    test('3.11 Direct', () => {
        expect(isAirbnbSource('Direct')).toBe(false);
    });

    test('3.12 Marriott', () => {
        expect(isAirbnbSource('Marriott')).toBe(false);
    });

    test('3.13 Expedia', () => {
        expect(isAirbnbSource('Expedia')).toBe(false);
    });

    test('3.14 HomeAway', () => {
        expect(isAirbnbSource('HomeAway')).toBe(false);
    });

    test('3.15 null source', () => {
        expect(isAirbnbSource(null)).toBe(false);
    });

    test('3.16 undefined source', () => {
        expect(isAirbnbSource(undefined)).toBe(false);
    });

    test('3.17 empty string', () => {
        expect(isAirbnbSource('')).toBe(false);
    });

    test('3.18 whitespace only', () => {
        expect(isAirbnbSource('   ')).toBe(false);
    });

    test('3.19 number as source', () => {
        expect(isAirbnbSource(123)).toBe(false);
    });

    test('3.20 object as source', () => {
        expect(isAirbnbSource({})).toBe(false);
    });
});

// ============================================================================
// TEST GROUP 4: Tax Addition Logic (20 tests)
// ============================================================================
describe('Tax Addition Logic', () => {
    test('4.1 VRBO, no flags - add tax', () => {
        expect(shouldAddTax('VRBO', false, false)).toBe(true);
    });

    test('4.2 VRBO, disregardTax - no tax', () => {
        expect(shouldAddTax('VRBO', true, false)).toBe(false);
    });

    test('4.3 VRBO, passThrough - add tax', () => {
        expect(shouldAddTax('VRBO', false, true)).toBe(true);
    });

    test('4.4 VRBO, both flags - no tax (disregard wins)', () => {
        expect(shouldAddTax('VRBO', true, true)).toBe(false);
    });

    test('4.5 Airbnb, no flags - no tax', () => {
        expect(shouldAddTax('Airbnb', false, false)).toBe(false);
    });

    test('4.6 Airbnb, disregardTax - no tax', () => {
        expect(shouldAddTax('Airbnb', true, false)).toBe(false);
    });

    test('4.7 Airbnb, passThrough - add tax', () => {
        expect(shouldAddTax('Airbnb', false, true)).toBe(true);
    });

    test('4.8 Airbnb, both flags - no tax', () => {
        expect(shouldAddTax('Airbnb', true, true)).toBe(false);
    });

    test('4.9 Direct booking, no flags', () => {
        expect(shouldAddTax('Direct', false, false)).toBe(true);
    });

    test('4.10 Marriott, no flags', () => {
        expect(shouldAddTax('Marriott', false, false)).toBe(true);
    });

    test('4.11 Booking.com, no flags', () => {
        expect(shouldAddTax('Booking.com', false, false)).toBe(true);
    });

    test('4.12 Expedia, no flags', () => {
        expect(shouldAddTax('Expedia', false, false)).toBe(true);
    });

    test('4.13 null source, no flags', () => {
        expect(shouldAddTax(null, false, false)).toBe(true);
    });

    test('4.14 undefined source, no flags', () => {
        expect(shouldAddTax(undefined, false, false)).toBe(true);
    });

    test('4.15 empty source, no flags', () => {
        expect(shouldAddTax('', false, false)).toBe(true);
    });

    test('4.16 Airbnb Official, passThrough', () => {
        expect(shouldAddTax('Airbnb Official', false, true)).toBe(true);
    });

    test('4.17 airbnb.com, passThrough', () => {
        expect(shouldAddTax('airbnb.com', false, true)).toBe(true);
    });

    test('4.18 AIRBNB uppercase, no passThrough', () => {
        expect(shouldAddTax('AIRBNB', false, false)).toBe(false);
    });

    test('4.19 Google, disregardTax', () => {
        expect(shouldAddTax('Google', true, false)).toBe(false);
    });

    test('4.20 TripAdvisor, no flags', () => {
        expect(shouldAddTax('TripAdvisor', false, false)).toBe(true);
    });
});

// ============================================================================
// TEST GROUP 5: Gross Payout Calculations (20 tests)
// ============================================================================
describe('Gross Payout Calculations', () => {
    test('5.1 Basic payout with tax', () => {
        expect(calculateGrossPayout(1000, 150, 100, true)).toBe(950);
    });

    test('5.2 Basic payout without tax', () => {
        expect(calculateGrossPayout(1000, 150, 100, false)).toBe(850);
    });

    test('5.3 Zero revenue', () => {
        expect(calculateGrossPayout(0, 0, 0, true)).toBe(0);
    });

    test('5.4 Negative payout (PM exceeds revenue)', () => {
        expect(calculateGrossPayout(100, 150, 50, true)).toBe(0);
    });

    test('5.5 Large payout', () => {
        expect(calculateGrossPayout(10000, 1500, 1000, true)).toBe(9500);
    });

    test('5.6 PM fee equals revenue', () => {
        expect(calculateGrossPayout(1000, 1000, 100, true)).toBe(100);
    });

    test('5.7 Zero PM fee', () => {
        expect(calculateGrossPayout(1000, 0, 100, true)).toBe(1100);
    });

    test('5.8 Zero tax', () => {
        expect(calculateGrossPayout(1000, 150, 0, true)).toBe(850);
    });

    test('5.9 All zeros', () => {
        expect(calculateGrossPayout(0, 0, 0, false)).toBe(0);
    });

    test('5.10 High tax amount', () => {
        expect(calculateGrossPayout(1000, 150, 500, true)).toBe(1350);
    });

    test('5.11 Decimal values', () => {
        expect(calculateGrossPayout(999.99, 149.99, 99.99, true)).toBe(949.99);
    });

    test('5.12 Revenue $500, PM $75, Tax $50 with tax', () => {
        expect(calculateGrossPayout(500, 75, 50, true)).toBe(475);
    });

    test('5.13 Revenue $500, PM $75, Tax $50 without tax', () => {
        expect(calculateGrossPayout(500, 75, 50, false)).toBe(425);
    });

    test('5.14 Very small amounts', () => {
        expect(calculateGrossPayout(1, 0.15, 0.1, true)).toBe(0.95);
    });

    test('5.15 Revenue $2500, PM $375, Tax $200', () => {
        expect(calculateGrossPayout(2500, 375, 200, true)).toBe(2325);
    });

    test('5.16 Revenue $750, PM $112.5, Tax $75', () => {
        expect(calculateGrossPayout(750, 112.5, 75, true)).toBe(712.5);
    });

    test('5.17 Negative revenue (refund scenario)', () => {
        expect(calculateGrossPayout(-500, -75, -50, true)).toBe(-475);
    });

    test('5.18 Revenue $1234.56, PM $185.18, Tax $123.46', () => {
        const result = calculateGrossPayout(1234.56, 185.18, 123.46, true);
        expect(result).toBe(1172.84);
    });

    test('5.19 Co-host scenario (0 revenue, just PM)', () => {
        expect(calculateGrossPayout(0, 150, 100, false)).toBe(-150);
    });

    test('5.20 Large numbers', () => {
        expect(calculateGrossPayout(100000, 15000, 10000, true)).toBe(95000);
    });
});

// ============================================================================
// TEST GROUP 6: Color Class Logic (20 tests)
// ============================================================================
describe('Color Class Logic', () => {
    test('6.1 Positive payout - green', () => {
        expect(getGrossPayoutColorClass(100)).toBe('revenue-amount');
    });

    test('6.2 Zero payout - green', () => {
        expect(getGrossPayoutColorClass(0)).toBe('revenue-amount');
    });

    test('6.3 Negative payout - red', () => {
        expect(getGrossPayoutColorClass(-100)).toBe('expense-amount');
    });

    test('6.4 Very small positive - green', () => {
        expect(getGrossPayoutColorClass(0.01)).toBe('revenue-amount');
    });

    test('6.5 Very small negative - red', () => {
        expect(getGrossPayoutColorClass(-0.01)).toBe('expense-amount');
    });

    test('6.6 Large positive - green', () => {
        expect(getGrossPayoutColorClass(999999)).toBe('revenue-amount');
    });

    test('6.7 Large negative - red', () => {
        expect(getGrossPayoutColorClass(-999999)).toBe('expense-amount');
    });

    test('6.8 Tax: VRBO standard - green', () => {
        expect(getTaxColorClass('VRBO', false, false)).toBe('revenue-amount');
    });

    test('6.9 Tax: Airbnb standard - blue', () => {
        expect(getTaxColorClass('Airbnb', false, false)).toBe('info-amount');
    });

    test('6.10 Tax: Airbnb with passThrough - green', () => {
        expect(getTaxColorClass('Airbnb', false, true)).toBe('revenue-amount');
    });

    test('6.11 Tax: Any source with disregardTax - blue', () => {
        expect(getTaxColorClass('VRBO', true, false)).toBe('info-amount');
    });

    test('6.12 Tax: Marriott standard - green', () => {
        expect(getTaxColorClass('Marriott', false, false)).toBe('revenue-amount');
    });

    test('6.13 Tax: Direct booking - green', () => {
        expect(getTaxColorClass('Direct', false, false)).toBe('revenue-amount');
    });

    test('6.14 Tax: Booking.com - green', () => {
        expect(getTaxColorClass('Booking.com', false, false)).toBe('revenue-amount');
    });

    test('6.15 Tax: Airbnb with both flags - blue', () => {
        expect(getTaxColorClass('Airbnb', true, true)).toBe('info-amount');
    });

    test('6.16 Tax: VRBO with both flags - blue', () => {
        expect(getTaxColorClass('VRBO', true, true)).toBe('info-amount');
    });

    test('6.17 Tax: null source - green', () => {
        expect(getTaxColorClass(null, false, false)).toBe('revenue-amount');
    });

    test('6.18 Tax: empty source - green', () => {
        expect(getTaxColorClass('', false, false)).toBe('revenue-amount');
    });

    test('6.19 Tax: Expedia with disregardTax - blue', () => {
        expect(getTaxColorClass('Expedia', true, false)).toBe('info-amount');
    });

    test('6.20 Tax: HomeAway standard - green', () => {
        expect(getTaxColorClass('HomeAway', false, false)).toBe('revenue-amount');
    });
});

// ============================================================================
// TEST GROUP 7: Array and Object Operations (20 tests)
// ============================================================================
describe('Array and Object Operations', () => {
    test('7.1 Sum revenue of all reservations', () => {
        expect(sumArray(testReservations, 'revenue')).toBe(3500);
    });

    test('7.2 Sum with empty array', () => {
        expect(sumArray([], 'revenue')).toBe(0);
    });

    test('7.3 Sum with missing key', () => {
        expect(sumArray(testReservations, 'nonexistent')).toBe(0);
    });

    test('7.4 Filter by propertyId 100', () => {
        const result = filterByProperty(testReservations, 'propertyId', 100);
        expect(result.length).toBe(2);
    });

    test('7.5 Filter by propertyId 200', () => {
        const result = filterByProperty(testReservations, 'propertyId', 200);
        expect(result.length).toBe(2);
    });

    test('7.6 Filter by propertyId 300', () => {
        const result = filterByProperty(testReservations, 'propertyId', 300);
        expect(result.length).toBe(1);
    });

    test('7.7 Filter by non-existent propertyId', () => {
        const result = filterByProperty(testReservations, 'propertyId', 999);
        expect(result.length).toBe(0);
    });

    test('7.8 Filter by source Airbnb', () => {
        const result = filterByProperty(testReservations, 'source', 'Airbnb');
        expect(result.length).toBe(2);
    });

    test('7.9 Filter by source VRBO', () => {
        const result = filterByProperty(testReservations, 'source', 'VRBO');
        expect(result.length).toBe(1);
    });

    test('7.10 Group by propertyId', () => {
        const result = groupByProperty(testReservations, 'propertyId');
        expect(Object.keys(result).length).toBe(3);
    });

    test('7.11 Group by source', () => {
        const result = groupByProperty(testReservations, 'source');
        expect(Object.keys(result).length).toBe(4);
    });

    test('7.12 Sum revenue for property 100', () => {
        const filtered = filterByProperty(testReservations, 'propertyId', 100);
        expect(sumArray(filtered, 'revenue')).toBe(1100);
    });

    test('7.13 Sum revenue for property 200', () => {
        const filtered = filterByProperty(testReservations, 'propertyId', 200);
        expect(sumArray(filtered, 'revenue')).toBe(1500);
    });

    test('7.14 Sum revenue for Airbnb reservations', () => {
        const filtered = filterByProperty(testReservations, 'source', 'Airbnb');
        expect(sumArray(filtered, 'revenue')).toBe(1200);
    });

    test('7.15 Group count for propertyId 100', () => {
        const groups = groupByProperty(testReservations, 'propertyId');
        expect(groups[100].length).toBe(2);
    });

    test('7.16 Group count for source Airbnb', () => {
        const groups = groupByProperty(testReservations, 'source');
        expect(groups['Airbnb'].length).toBe(2);
    });

    test('7.17 Filter empty array', () => {
        const result = filterByProperty([], 'propertyId', 100);
        expect(result.length).toBe(0);
    });

    test('7.18 Group empty array', () => {
        const result = groupByProperty([], 'propertyId');
        expect(Object.keys(result).length).toBe(0);
    });

    test('7.19 Sum IDs', () => {
        expect(sumArray(testReservations, 'id')).toBe(15);
    });

    test('7.20 Filter and sum chain', () => {
        const airbnbRevenue = sumArray(filterByProperty(testReservations, 'source', 'Airbnb'), 'revenue');
        const vrboRevenue = sumArray(filterByProperty(testReservations, 'source', 'VRBO'), 'revenue');
        expect(airbnbRevenue + vrboRevenue).toBe(1800);
    });
});

// ============================================================================
// TEST GROUP 8: Date Handling (18 tests)
// ============================================================================
describe('Date Handling', () => {
    test('8.1 Date in range - middle', () => {
        expect(isDateInRange('2025-01-15', '2025-01-01', '2025-01-31')).toBe(true);
    });

    test('8.2 Date in range - start boundary', () => {
        expect(isDateInRange('2025-01-01', '2025-01-01', '2025-01-31')).toBe(true);
    });

    test('8.3 Date in range - end boundary', () => {
        expect(isDateInRange('2025-01-31', '2025-01-01', '2025-01-31')).toBe(true);
    });

    test('8.4 Date before range', () => {
        expect(isDateInRange('2024-12-31', '2025-01-01', '2025-01-31')).toBe(false);
    });

    test('8.5 Date after range', () => {
        expect(isDateInRange('2025-02-01', '2025-01-01', '2025-01-31')).toBe(false);
    });

    test('8.6 Days between same date', () => {
        expect(getDaysBetween('2025-01-01', '2025-01-01')).toBe(0);
    });

    test('8.7 Days between 1 day apart', () => {
        expect(getDaysBetween('2025-01-01', '2025-01-02')).toBe(1);
    });

    test('8.8 Days in January', () => {
        expect(getDaysBetween('2025-01-01', '2025-01-31')).toBe(30);
    });

    test('8.9 Days in full month February (non-leap)', () => {
        expect(getDaysBetween('2025-02-01', '2025-02-28')).toBe(27);
    });

    test('8.10 Days in leap year February', () => {
        expect(getDaysBetween('2024-02-01', '2024-02-29')).toBe(28);
    });

    test('8.11 Days in full year', () => {
        expect(getDaysBetween('2025-01-01', '2025-12-31')).toBe(364);
    });

    test('8.12 Is before - true', () => {
        expect(isBeforeDate('2025-01-01', '2025-01-02')).toBe(true);
    });

    test('8.13 Is before - false', () => {
        expect(isBeforeDate('2025-01-02', '2025-01-01')).toBe(false);
    });

    test('8.14 Is before - same date', () => {
        expect(isBeforeDate('2025-01-01', '2025-01-01')).toBe(false);
    });

    test('8.15 Days across year boundary', () => {
        expect(getDaysBetween('2024-12-31', '2025-01-01')).toBe(1);
    });

    test('8.16 Days in week', () => {
        expect(getDaysBetween('2025-01-01', '2025-01-08')).toBe(7);
    });

    test('8.17 Date range single day', () => {
        expect(isDateInRange('2025-01-15', '2025-01-15', '2025-01-15')).toBe(true);
    });

    test('8.18 Date range year span', () => {
        expect(isDateInRange('2025-06-15', '2025-01-01', '2025-12-31')).toBe(true);
    });
});

// ============================================================================
// TEST GROUP 9: String Operations (10 tests)
// ============================================================================
describe('String Operations', () => {
    test('9.1 Sanitize normal string', () => {
        expect(sanitizeString('  Hello World  ')).toBe('hello world');
    });

    test('9.2 Sanitize empty string', () => {
        expect(sanitizeString('')).toBe('');
    });

    test('9.3 Sanitize null', () => {
        expect(sanitizeString(null)).toBe('');
    });

    test('9.4 Sanitize undefined', () => {
        expect(sanitizeString(undefined)).toBe('');
    });

    test('9.5 Sanitize number', () => {
        expect(sanitizeString(123)).toBe('');
    });

    test('9.6 Truncate short string', () => {
        expect(truncateString('Hello', 10)).toBe('Hello');
    });

    test('9.7 Truncate long string', () => {
        expect(truncateString('Hello World', 5)).toBe('Hello...');
    });

    test('9.8 Truncate exact length', () => {
        expect(truncateString('Hello', 5)).toBe('Hello');
    });

    test('9.9 Truncate empty string', () => {
        expect(truncateString('', 5)).toBe('');
    });

    test('9.10 Truncate null', () => {
        expect(truncateString(null, 5)).toBe('');
    });
});
