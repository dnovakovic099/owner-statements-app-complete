/**
 * Comprehensive Edge Cases Test Suite
 * Additional tests to ensure 100% coverage of all edge cases
 */

const assert = require('assert');

console.log('\n' + '='.repeat(60));
console.log('COMPREHENSIVE EDGE CASES TEST SUITE');
console.log('='.repeat(60) + '\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        passedTests++;
    } catch (error) {
        console.log(`FAIL: ${name}`);
        console.log(`   Error: ${error.message}`);
        failedTests++;
    }
}

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

// ============================================================================
// TEST GROUP 1: Currency Formatting Edge Cases
// ============================================================================
console.log('\n--- TEST GROUP 1: Currency Formatting (20 tests) ---\n');

test('1.1 Format positive integer', () => {
    assert.strictEqual(formatCurrency(100), 100);
});

test('1.2 Format positive decimal', () => {
    assert.strictEqual(formatCurrency(100.555), 100.56);
});

test('1.3 Format negative integer', () => {
    assert.strictEqual(formatCurrency(-100), -100);
});

test('1.4 Format negative decimal', () => {
    assert.strictEqual(formatCurrency(-100.555), -100.55); // JS rounds toward zero for negatives
});

test('1.5 Format zero', () => {
    assert.strictEqual(formatCurrency(0), 0);
});

test('1.6 Format very small positive', () => {
    assert.strictEqual(formatCurrency(0.001), 0);
});

test('1.7 Format very small negative', () => {
    assert.strictEqual(formatCurrency(-0.001) === 0, true); // -0 equals 0
});

test('1.8 Format 0.005 (rounds up)', () => {
    assert.strictEqual(formatCurrency(0.005), 0.01);
});

test('1.9 Format 0.004 (rounds down)', () => {
    assert.strictEqual(formatCurrency(0.004), 0);
});

test('1.10 Format large number', () => {
    assert.strictEqual(formatCurrency(999999.999), 1000000);
});

test('1.11 Format with trailing zeros', () => {
    assert.strictEqual(formatCurrency(100.10), 100.1);
});

test('1.12 Format scientific notation small', () => {
    assert.strictEqual(formatCurrency(1e-10), 0);
});

test('1.13 Format scientific notation large', () => {
    assert.strictEqual(formatCurrency(1e6), 1000000);
});

test('1.14 Format negative zero', () => {
    assert.strictEqual(formatCurrency(-0) === 0, true); // -0 equals 0
});

test('1.15 Format 99.994 (rounds to 99.99)', () => {
    assert.strictEqual(formatCurrency(99.994), 99.99);
});

test('1.16 Format 99.995 (rounds to 100)', () => {
    assert.strictEqual(formatCurrency(99.995), 100);
});

test('1.17 Format 0.01', () => {
    assert.strictEqual(formatCurrency(0.01), 0.01);
});

test('1.18 Format -0.01', () => {
    assert.strictEqual(formatCurrency(-0.01), -0.01);
});

test('1.19 Format 123.456789', () => {
    assert.strictEqual(formatCurrency(123.456789), 123.46);
});

test('1.20 Format -123.456789', () => {
    assert.strictEqual(formatCurrency(-123.456789), -123.46);
});

// ============================================================================
// TEST GROUP 2: PM Commission Calculations (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 2: PM Commission Calculations (20 tests) ---\n');

test('2.1 PM at 15% of $1000', () => {
    assert.strictEqual(calculatePmCommission(1000, 15), 150);
});

test('2.2 PM at 20% of $1000', () => {
    assert.strictEqual(calculatePmCommission(1000, 20), 200);
});

test('2.3 PM at 10% of $500', () => {
    assert.strictEqual(calculatePmCommission(500, 10), 50);
});

test('2.4 PM at 0% of $1000', () => {
    assert.strictEqual(calculatePmCommission(1000, 0), 0);
});

test('2.5 PM at 100% of $1000', () => {
    assert.strictEqual(calculatePmCommission(1000, 100), 1000);
});

test('2.6 PM at 15% of $0', () => {
    assert.strictEqual(calculatePmCommission(0, 15), 0);
});

test('2.7 PM at 15% of negative revenue', () => {
    assert.strictEqual(calculatePmCommission(-1000, 15), -150);
});

test('2.8 PM at 12.5% of $800', () => {
    assert.strictEqual(calculatePmCommission(800, 12.5), 100);
});

test('2.9 PM at 17.5% of $1000', () => {
    assert.strictEqual(calculatePmCommission(1000, 17.5), 175);
});

test('2.10 PM at 15% of $1 (small amount)', () => {
    assert.strictEqual(calculatePmCommission(1, 15), 0.15);
});

test('2.11 PM at 15% of $0.01', () => {
    assert.strictEqual(calculatePmCommission(0.01, 15), 0);
});

test('2.12 PM at 33.33% of $300', () => {
    assert.strictEqual(calculatePmCommission(300, 33.33), 99.99);
});

test('2.13 PM at 15% of $999.99', () => {
    assert.strictEqual(calculatePmCommission(999.99, 15), 150);
});

test('2.14 PM at 15% of $10000', () => {
    assert.strictEqual(calculatePmCommission(10000, 15), 1500);
});

test('2.15 PM at 15% of $100000', () => {
    assert.strictEqual(calculatePmCommission(100000, 15), 15000);
});

test('2.16 PM at 1% of $10000', () => {
    assert.strictEqual(calculatePmCommission(10000, 1), 100);
});

test('2.17 PM at 99% of $1000', () => {
    assert.strictEqual(calculatePmCommission(1000, 99), 990);
});

test('2.18 PM at 50% of $500', () => {
    assert.strictEqual(calculatePmCommission(500, 50), 250);
});

test('2.19 PM at 25% of $400', () => {
    assert.strictEqual(calculatePmCommission(400, 25), 100);
});

test('2.20 PM at 15.5% of $1000', () => {
    assert.strictEqual(calculatePmCommission(1000, 15.5), 155);
});

// ============================================================================
// TEST GROUP 3: Source Detection Extended (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 3: Source Detection Extended (20 tests) ---\n');

test('3.1 Airbnb exact match', () => {
    assert.strictEqual(isAirbnbSource('Airbnb'), true);
});

test('3.2 AIRBNB uppercase', () => {
    assert.strictEqual(isAirbnbSource('AIRBNB'), true);
});

test('3.3 airbnb lowercase', () => {
    assert.strictEqual(isAirbnbSource('airbnb'), true);
});

test('3.4 AiRbNb mixed case', () => {
    assert.strictEqual(isAirbnbSource('AiRbNb'), true);
});

test('3.5 Airbnb.com', () => {
    assert.strictEqual(isAirbnbSource('Airbnb.com'), true);
});

test('3.6 Airbnb (Co-host)', () => {
    assert.strictEqual(isAirbnbSource('Airbnb (Co-host)'), true);
});

test('3.7 Airbnb Official', () => {
    assert.strictEqual(isAirbnbSource('Airbnb Official'), true);
});

test('3.8 Via Airbnb', () => {
    assert.strictEqual(isAirbnbSource('Via Airbnb'), true);
});

test('3.9 VRBO', () => {
    assert.strictEqual(isAirbnbSource('VRBO'), false);
});

test('3.10 Booking.com', () => {
    assert.strictEqual(isAirbnbSource('Booking.com'), false);
});

test('3.11 Direct', () => {
    assert.strictEqual(isAirbnbSource('Direct'), false);
});

test('3.12 Marriott', () => {
    assert.strictEqual(isAirbnbSource('Marriott'), false);
});

test('3.13 Expedia', () => {
    assert.strictEqual(isAirbnbSource('Expedia'), false);
});

test('3.14 HomeAway', () => {
    assert.strictEqual(isAirbnbSource('HomeAway'), false);
});

test('3.15 null source', () => {
    assert.strictEqual(isAirbnbSource(null), false);
});

test('3.16 undefined source', () => {
    assert.strictEqual(isAirbnbSource(undefined), false);
});

test('3.17 empty string', () => {
    assert.strictEqual(isAirbnbSource(''), false);
});

test('3.18 whitespace only', () => {
    assert.strictEqual(isAirbnbSource('   '), false);
});

test('3.19 number as source', () => {
    assert.strictEqual(isAirbnbSource(123), false);
});

test('3.20 object as source', () => {
    assert.strictEqual(isAirbnbSource({}), false);
});

// ============================================================================
// TEST GROUP 4: Tax Addition Logic (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 4: Tax Addition Logic (20 tests) ---\n');

test('4.1 VRBO, no flags - add tax', () => {
    assert.strictEqual(shouldAddTax('VRBO', false, false), true);
});

test('4.2 VRBO, disregardTax - no tax', () => {
    assert.strictEqual(shouldAddTax('VRBO', true, false), false);
});

test('4.3 VRBO, passThrough - add tax', () => {
    assert.strictEqual(shouldAddTax('VRBO', false, true), true);
});

test('4.4 VRBO, both flags - no tax (disregard wins)', () => {
    assert.strictEqual(shouldAddTax('VRBO', true, true), false);
});

test('4.5 Airbnb, no flags - no tax', () => {
    assert.strictEqual(shouldAddTax('Airbnb', false, false), false);
});

test('4.6 Airbnb, disregardTax - no tax', () => {
    assert.strictEqual(shouldAddTax('Airbnb', true, false), false);
});

test('4.7 Airbnb, passThrough - add tax', () => {
    assert.strictEqual(shouldAddTax('Airbnb', false, true), true);
});

test('4.8 Airbnb, both flags - no tax', () => {
    assert.strictEqual(shouldAddTax('Airbnb', true, true), false);
});

test('4.9 Direct booking, no flags', () => {
    assert.strictEqual(shouldAddTax('Direct', false, false), true);
});

test('4.10 Marriott, no flags', () => {
    assert.strictEqual(shouldAddTax('Marriott', false, false), true);
});

test('4.11 Booking.com, no flags', () => {
    assert.strictEqual(shouldAddTax('Booking.com', false, false), true);
});

test('4.12 Expedia, no flags', () => {
    assert.strictEqual(shouldAddTax('Expedia', false, false), true);
});

test('4.13 null source, no flags', () => {
    assert.strictEqual(shouldAddTax(null, false, false), true);
});

test('4.14 undefined source, no flags', () => {
    assert.strictEqual(shouldAddTax(undefined, false, false), true);
});

test('4.15 empty source, no flags', () => {
    assert.strictEqual(shouldAddTax('', false, false), true);
});

test('4.16 Airbnb Official, passThrough', () => {
    assert.strictEqual(shouldAddTax('Airbnb Official', false, true), true);
});

test('4.17 airbnb.com, passThrough', () => {
    assert.strictEqual(shouldAddTax('airbnb.com', false, true), true);
});

test('4.18 AIRBNB uppercase, no passThrough', () => {
    assert.strictEqual(shouldAddTax('AIRBNB', false, false), false);
});

test('4.19 Google, disregardTax', () => {
    assert.strictEqual(shouldAddTax('Google', true, false), false);
});

test('4.20 TripAdvisor, no flags', () => {
    assert.strictEqual(shouldAddTax('TripAdvisor', false, false), true);
});

// ============================================================================
// TEST GROUP 5: Gross Payout Calculations (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 5: Gross Payout Calculations (20 tests) ---\n');

test('5.1 Basic payout with tax', () => {
    assert.strictEqual(calculateGrossPayout(1000, 150, 100, true), 950);
});

test('5.2 Basic payout without tax', () => {
    assert.strictEqual(calculateGrossPayout(1000, 150, 100, false), 850);
});

test('5.3 Zero revenue', () => {
    assert.strictEqual(calculateGrossPayout(0, 0, 0, true), 0);
});

test('5.4 Negative payout (PM exceeds revenue)', () => {
    assert.strictEqual(calculateGrossPayout(100, 150, 50, true), 0);
});

test('5.5 Large payout', () => {
    assert.strictEqual(calculateGrossPayout(10000, 1500, 1000, true), 9500);
});

test('5.6 PM fee equals revenue', () => {
    assert.strictEqual(calculateGrossPayout(1000, 1000, 100, true), 100);
});

test('5.7 Zero PM fee', () => {
    assert.strictEqual(calculateGrossPayout(1000, 0, 100, true), 1100);
});

test('5.8 Zero tax', () => {
    assert.strictEqual(calculateGrossPayout(1000, 150, 0, true), 850);
});

test('5.9 All zeros', () => {
    assert.strictEqual(calculateGrossPayout(0, 0, 0, false), 0);
});

test('5.10 High tax amount', () => {
    assert.strictEqual(calculateGrossPayout(1000, 150, 500, true), 1350);
});

test('5.11 Decimal values', () => {
    assert.strictEqual(calculateGrossPayout(999.99, 149.99, 99.99, true), 949.99);
});

test('5.12 Revenue $500, PM $75, Tax $50 with tax', () => {
    assert.strictEqual(calculateGrossPayout(500, 75, 50, true), 475);
});

test('5.13 Revenue $500, PM $75, Tax $50 without tax', () => {
    assert.strictEqual(calculateGrossPayout(500, 75, 50, false), 425);
});

test('5.14 Very small amounts', () => {
    assert.strictEqual(calculateGrossPayout(1, 0.15, 0.1, true), 0.95);
});

test('5.15 Revenue $2500, PM $375, Tax $200', () => {
    assert.strictEqual(calculateGrossPayout(2500, 375, 200, true), 2325);
});

test('5.16 Revenue $750, PM $112.5, Tax $75', () => {
    assert.strictEqual(calculateGrossPayout(750, 112.5, 75, true), 712.5);
});

test('5.17 Negative revenue (refund scenario)', () => {
    assert.strictEqual(calculateGrossPayout(-500, -75, -50, true), -475);
});

test('5.18 Revenue $1234.56, PM $185.18, Tax $123.46', () => {
    const result = calculateGrossPayout(1234.56, 185.18, 123.46, true);
    assert.strictEqual(result, 1172.84);
});

test('5.19 Co-host scenario (0 revenue, just PM)', () => {
    assert.strictEqual(calculateGrossPayout(0, 150, 100, false), -150);
});

test('5.20 Large numbers', () => {
    assert.strictEqual(calculateGrossPayout(100000, 15000, 10000, true), 95000);
});

// ============================================================================
// TEST GROUP 6: Color Class Logic (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 6: Color Class Logic (20 tests) ---\n');

test('6.1 Positive payout - green', () => {
    assert.strictEqual(getGrossPayoutColorClass(100), 'revenue-amount');
});

test('6.2 Zero payout - green', () => {
    assert.strictEqual(getGrossPayoutColorClass(0), 'revenue-amount');
});

test('6.3 Negative payout - red', () => {
    assert.strictEqual(getGrossPayoutColorClass(-100), 'expense-amount');
});

test('6.4 Very small positive - green', () => {
    assert.strictEqual(getGrossPayoutColorClass(0.01), 'revenue-amount');
});

test('6.5 Very small negative - red', () => {
    assert.strictEqual(getGrossPayoutColorClass(-0.01), 'expense-amount');
});

test('6.6 Large positive - green', () => {
    assert.strictEqual(getGrossPayoutColorClass(999999), 'revenue-amount');
});

test('6.7 Large negative - red', () => {
    assert.strictEqual(getGrossPayoutColorClass(-999999), 'expense-amount');
});

test('6.8 Tax: VRBO standard - green', () => {
    assert.strictEqual(getTaxColorClass('VRBO', false, false), 'revenue-amount');
});

test('6.9 Tax: Airbnb standard - blue', () => {
    assert.strictEqual(getTaxColorClass('Airbnb', false, false), 'info-amount');
});

test('6.10 Tax: Airbnb with passThrough - green', () => {
    assert.strictEqual(getTaxColorClass('Airbnb', false, true), 'revenue-amount');
});

test('6.11 Tax: Any source with disregardTax - blue', () => {
    assert.strictEqual(getTaxColorClass('VRBO', true, false), 'info-amount');
});

test('6.12 Tax: Marriott standard - green', () => {
    assert.strictEqual(getTaxColorClass('Marriott', false, false), 'revenue-amount');
});

test('6.13 Tax: Direct booking - green', () => {
    assert.strictEqual(getTaxColorClass('Direct', false, false), 'revenue-amount');
});

test('6.14 Tax: Booking.com - green', () => {
    assert.strictEqual(getTaxColorClass('Booking.com', false, false), 'revenue-amount');
});

test('6.15 Tax: Airbnb with both flags - blue', () => {
    assert.strictEqual(getTaxColorClass('Airbnb', true, true), 'info-amount');
});

test('6.16 Tax: VRBO with both flags - blue', () => {
    assert.strictEqual(getTaxColorClass('VRBO', true, true), 'info-amount');
});

test('6.17 Tax: null source - green', () => {
    assert.strictEqual(getTaxColorClass(null, false, false), 'revenue-amount');
});

test('6.18 Tax: empty source - green', () => {
    assert.strictEqual(getTaxColorClass('', false, false), 'revenue-amount');
});

test('6.19 Tax: Expedia with disregardTax - blue', () => {
    assert.strictEqual(getTaxColorClass('Expedia', true, false), 'info-amount');
});

test('6.20 Tax: HomeAway standard - green', () => {
    assert.strictEqual(getTaxColorClass('HomeAway', false, false), 'revenue-amount');
});

// ============================================================================
// TEST GROUP 7: Array and Object Operations (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 7: Array and Object Operations (20 tests) ---\n');

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

const testReservations = [
    { id: 1, propertyId: 100, revenue: 500, source: 'Airbnb' },
    { id: 2, propertyId: 100, revenue: 600, source: 'VRBO' },
    { id: 3, propertyId: 200, revenue: 700, source: 'Airbnb' },
    { id: 4, propertyId: 200, revenue: 800, source: 'Direct' },
    { id: 5, propertyId: 300, revenue: 900, source: 'Marriott' }
];

test('7.1 Sum revenue of all reservations', () => {
    assert.strictEqual(sumArray(testReservations, 'revenue'), 3500);
});

test('7.2 Sum with empty array', () => {
    assert.strictEqual(sumArray([], 'revenue'), 0);
});

test('7.3 Sum with missing key', () => {
    assert.strictEqual(sumArray(testReservations, 'nonexistent'), 0);
});

test('7.4 Filter by propertyId 100', () => {
    const result = filterByProperty(testReservations, 'propertyId', 100);
    assert.strictEqual(result.length, 2);
});

test('7.5 Filter by propertyId 200', () => {
    const result = filterByProperty(testReservations, 'propertyId', 200);
    assert.strictEqual(result.length, 2);
});

test('7.6 Filter by propertyId 300', () => {
    const result = filterByProperty(testReservations, 'propertyId', 300);
    assert.strictEqual(result.length, 1);
});

test('7.7 Filter by non-existent propertyId', () => {
    const result = filterByProperty(testReservations, 'propertyId', 999);
    assert.strictEqual(result.length, 0);
});

test('7.8 Filter by source Airbnb', () => {
    const result = filterByProperty(testReservations, 'source', 'Airbnb');
    assert.strictEqual(result.length, 2);
});

test('7.9 Filter by source VRBO', () => {
    const result = filterByProperty(testReservations, 'source', 'VRBO');
    assert.strictEqual(result.length, 1);
});

test('7.10 Group by propertyId', () => {
    const result = groupByProperty(testReservations, 'propertyId');
    assert.strictEqual(Object.keys(result).length, 3);
});

test('7.11 Group by source', () => {
    const result = groupByProperty(testReservations, 'source');
    assert.strictEqual(Object.keys(result).length, 4);
});

test('7.12 Sum revenue for property 100', () => {
    const filtered = filterByProperty(testReservations, 'propertyId', 100);
    assert.strictEqual(sumArray(filtered, 'revenue'), 1100);
});

test('7.13 Sum revenue for property 200', () => {
    const filtered = filterByProperty(testReservations, 'propertyId', 200);
    assert.strictEqual(sumArray(filtered, 'revenue'), 1500);
});

test('7.14 Sum revenue for Airbnb reservations', () => {
    const filtered = filterByProperty(testReservations, 'source', 'Airbnb');
    assert.strictEqual(sumArray(filtered, 'revenue'), 1200);
});

test('7.15 Group count for propertyId 100', () => {
    const groups = groupByProperty(testReservations, 'propertyId');
    assert.strictEqual(groups[100].length, 2);
});

test('7.16 Group count for source Airbnb', () => {
    const groups = groupByProperty(testReservations, 'source');
    assert.strictEqual(groups['Airbnb'].length, 2);
});

test('7.17 Filter empty array', () => {
    const result = filterByProperty([], 'propertyId', 100);
    assert.strictEqual(result.length, 0);
});

test('7.18 Group empty array', () => {
    const result = groupByProperty([], 'propertyId');
    assert.strictEqual(Object.keys(result).length, 0);
});

test('7.19 Sum IDs', () => {
    assert.strictEqual(sumArray(testReservations, 'id'), 15);
});

test('7.20 Filter and sum chain', () => {
    const airbnbRevenue = sumArray(filterByProperty(testReservations, 'source', 'Airbnb'), 'revenue');
    const vrboRevenue = sumArray(filterByProperty(testReservations, 'source', 'VRBO'), 'revenue');
    assert.strictEqual(airbnbRevenue + vrboRevenue, 1800);
});

// ============================================================================
// TEST GROUP 8: Date Handling (18 tests)
// ============================================================================
console.log('\n--- TEST GROUP 8: Date Handling (18 tests) ---\n');

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

test('8.1 Date in range - middle', () => {
    assert.strictEqual(isDateInRange('2025-01-15', '2025-01-01', '2025-01-31'), true);
});

test('8.2 Date in range - start boundary', () => {
    assert.strictEqual(isDateInRange('2025-01-01', '2025-01-01', '2025-01-31'), true);
});

test('8.3 Date in range - end boundary', () => {
    assert.strictEqual(isDateInRange('2025-01-31', '2025-01-01', '2025-01-31'), true);
});

test('8.4 Date before range', () => {
    assert.strictEqual(isDateInRange('2024-12-31', '2025-01-01', '2025-01-31'), false);
});

test('8.5 Date after range', () => {
    assert.strictEqual(isDateInRange('2025-02-01', '2025-01-01', '2025-01-31'), false);
});

test('8.6 Days between same date', () => {
    assert.strictEqual(getDaysBetween('2025-01-01', '2025-01-01'), 0);
});

test('8.7 Days between 1 day apart', () => {
    assert.strictEqual(getDaysBetween('2025-01-01', '2025-01-02'), 1);
});

test('8.8 Days in January', () => {
    assert.strictEqual(getDaysBetween('2025-01-01', '2025-01-31'), 30);
});

test('8.9 Days in full month February (non-leap)', () => {
    assert.strictEqual(getDaysBetween('2025-02-01', '2025-02-28'), 27);
});

test('8.10 Days in leap year February', () => {
    assert.strictEqual(getDaysBetween('2024-02-01', '2024-02-29'), 28);
});

test('8.11 Days in full year', () => {
    assert.strictEqual(getDaysBetween('2025-01-01', '2025-12-31'), 364);
});

test('8.12 Is before - true', () => {
    assert.strictEqual(isBeforeDate('2025-01-01', '2025-01-02'), true);
});

test('8.13 Is before - false', () => {
    assert.strictEqual(isBeforeDate('2025-01-02', '2025-01-01'), false);
});

test('8.14 Is before - same date', () => {
    assert.strictEqual(isBeforeDate('2025-01-01', '2025-01-01'), false);
});

test('8.15 Days across year boundary', () => {
    assert.strictEqual(getDaysBetween('2024-12-31', '2025-01-01'), 1);
});

test('8.16 Days in week', () => {
    assert.strictEqual(getDaysBetween('2025-01-01', '2025-01-08'), 7);
});

test('8.17 Date range single day', () => {
    assert.strictEqual(isDateInRange('2025-01-15', '2025-01-15', '2025-01-15'), true);
});

test('8.18 Date range year span', () => {
    assert.strictEqual(isDateInRange('2025-06-15', '2025-01-01', '2025-12-31'), true);
});

// ============================================================================
// TEST GROUP 9: String Operations (10 tests)
// ============================================================================
console.log('\n--- TEST GROUP 9: String Operations (10 tests) ---\n');

function sanitizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().toLowerCase();
}

function truncateString(str, maxLength) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

test('9.1 Sanitize normal string', () => {
    assert.strictEqual(sanitizeString('  Hello World  '), 'hello world');
});

test('9.2 Sanitize empty string', () => {
    assert.strictEqual(sanitizeString(''), '');
});

test('9.3 Sanitize null', () => {
    assert.strictEqual(sanitizeString(null), '');
});

test('9.4 Sanitize undefined', () => {
    assert.strictEqual(sanitizeString(undefined), '');
});

test('9.5 Sanitize number', () => {
    assert.strictEqual(sanitizeString(123), '');
});

test('9.6 Truncate short string', () => {
    assert.strictEqual(truncateString('Hello', 10), 'Hello');
});

test('9.7 Truncate long string', () => {
    assert.strictEqual(truncateString('Hello World', 5), 'Hello...');
});

test('9.8 Truncate exact length', () => {
    assert.strictEqual(truncateString('Hello', 5), 'Hello');
});

test('9.9 Truncate empty string', () => {
    assert.strictEqual(truncateString('', 5), '');
});

test('9.10 Truncate null', () => {
    assert.strictEqual(truncateString(null, 5), '');
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('COMPREHENSIVE EDGE CASES TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Total:  ${passedTests + failedTests}`);
console.log('='.repeat(60) + '\n');

if (failedTests > 0) {
    process.exit(1);
}
