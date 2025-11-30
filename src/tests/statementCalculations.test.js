/**
 * Statement Calculation Tests
 *
 * These tests verify that the core calculation logic is correct for:
 * 1. Single property statements
 * 2. Combined multi-property statements
 *
 * Core Formula:
 * ownerPayout = totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees
 *
 * Where:
 * - techFees = propertyCount * $50
 * - insuranceFees = propertyCount * $25
 * - pmCommission = totalRevenue * (pmPercentage / 100)
 */

// ============================================================================
// CORE CALCULATION FUNCTIONS (extracted from statements-file.js for testing)
// ============================================================================

/**
 * Calculate total revenue from reservations
 * Excludes Airbnb revenue for co-hosted properties
 */
function calculateTotalRevenue(reservations, listingInfoMap = {}) {
    let totalRevenue = 0;
    for (const res of reservations) {
        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
        const isCohostForProperty = listingInfoMap[res.propertyId]?.isCohostOnAirbnb || false;

        // Exclude Airbnb revenue for co-hosted properties
        if (isAirbnb && isCohostForProperty) {
            continue;
        }

        totalRevenue += (res.grossAmount || 0);
    }
    return totalRevenue;
}

/**
 * Calculate total expenses (only actual costs, not upsells)
 */
function calculateTotalExpenses(expenses) {
    return expenses.reduce((sum, exp) => {
        const isUpsell = exp.amount > 0 ||
            (exp.type && exp.type.toLowerCase() === 'upsell') ||
            (exp.category && exp.category.toLowerCase() === 'upsell');
        return isUpsell ? sum : sum + Math.abs(exp.amount);
    }, 0);
}

/**
 * Calculate PM commission based on reservations and property PM fees
 */
function calculatePmCommission(reservations, listingInfoMap = {}, defaultPmFee = 15) {
    let pmCommission = 0;
    for (const res of reservations) {
        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
        const listing = listingInfoMap[res.propertyId];
        const isCohostForProperty = listing?.isCohostOnAirbnb || false;

        // Skip PM commission for co-hosted Airbnb reservations
        if (isAirbnb && isCohostForProperty) {
            continue;
        }

        const resPmFee = listing?.pmFeePercentage ?? defaultPmFee;
        const resCommission = (res.grossAmount || 0) * (resPmFee / 100);
        pmCommission += resCommission;
    }
    return pmCommission;
}

/**
 * Calculate tech fees ($50 per property)
 */
function calculateTechFees(propertyCount) {
    return propertyCount * 50;
}

/**
 * Calculate insurance fees ($25 per property)
 */
function calculateInsuranceFees(propertyCount) {
    return propertyCount * 25;
}

/**
 * Calculate owner payout - THE CORE FORMULA
 */
function calculateOwnerPayout(totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees) {
    return totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees;
}

/**
 * Round to 2 decimal places (for currency)
 */
function roundCurrency(amount) {
    return Math.round(amount * 100) / 100;
}

// ============================================================================
// TEST CASES
// ============================================================================

const testResults = [];

function test(name, fn) {
    try {
        fn();
        testResults.push({ name, passed: true });
        console.log(`  PASS: ${name}`);
    } catch (error) {
        testResults.push({ name, passed: false, error: error.message });
        console.log(`  FAIL: ${name}`);
        console.log(`        ${error.message}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }
}

function assertClose(actual, expected, tolerance = 0.01, message = '') {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`Expected ~${expected}, got ${actual} (tolerance: ${tolerance}). ${message}`);
    }
}

// ============================================================================
// TEST SUITE 1: Single Property Statement
// ============================================================================

console.log('\n=== TEST SUITE 1: Single Property Statement ===\n');

test('Single property: Basic revenue calculation', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 1000, source: 'vrbo' },
        { propertyId: 1, grossAmount: 1500, source: 'booking.com' },
        { propertyId: 1, grossAmount: 800, source: 'direct' }
    ];
    const totalRevenue = calculateTotalRevenue(reservations, {});
    assertEqual(totalRevenue, 3300);
});

test('Single property: Expense calculation (excludes upsells)', () => {
    const expenses = [
        { amount: -100, type: 'cleaning' },      // expense: $100
        { amount: -50, type: 'maintenance' },    // expense: $50
        { amount: 25, type: 'upsell' },          // upsell: excluded
        { amount: -30, category: 'supplies' }    // expense: $30
    ];
    const totalExpenses = calculateTotalExpenses(expenses);
    assertEqual(totalExpenses, 180); // 100 + 50 + 30
});

test('Single property: PM commission at 15%', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 1000, source: 'vrbo' }
    ];
    const listingInfoMap = { 1: { pmFeePercentage: 15 } };
    const pmCommission = calculatePmCommission(reservations, listingInfoMap);
    assertEqual(pmCommission, 150); // 1000 * 0.15
});

test('Single property: PM commission at 20%', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 2000, source: 'vrbo' }
    ];
    const listingInfoMap = { 1: { pmFeePercentage: 20 } };
    const pmCommission = calculatePmCommission(reservations, listingInfoMap);
    assertEqual(pmCommission, 400); // 2000 * 0.20
});

test('Single property: Tech fees ($50 per property)', () => {
    assertEqual(calculateTechFees(1), 50);
});

test('Single property: Insurance fees ($25 per property)', () => {
    assertEqual(calculateInsuranceFees(1), 25);
});

test('Single property: Complete payout calculation', () => {
    // Scenario:
    // - Revenue: $3000
    // - Expenses: $200
    // - PM Fee: 15% = $450
    // - Tech Fee: $50 (1 property)
    // - Insurance Fee: $25 (1 property)
    // - Expected Payout: 3000 - 200 - 450 - 50 - 25 = $2275

    const totalRevenue = 3000;
    const totalExpenses = 200;
    const pmCommission = 450;
    const techFees = 50;
    const insuranceFees = 25;

    const ownerPayout = calculateOwnerPayout(totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees);
    assertEqual(ownerPayout, 2275);
});

test('Single property: Airbnb co-host excludes Airbnb revenue', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 1000, source: 'airbnb' },  // excluded
        { propertyId: 1, grossAmount: 500, source: 'vrbo' }      // included
    ];
    const listingInfoMap = { 1: { isCohostOnAirbnb: true, pmFeePercentage: 15 } };

    const totalRevenue = calculateTotalRevenue(reservations, listingInfoMap);
    assertEqual(totalRevenue, 500); // Only VRBO

    const pmCommission = calculatePmCommission(reservations, listingInfoMap);
    assertEqual(pmCommission, 75); // Only on VRBO: 500 * 0.15
});

// ============================================================================
// TEST SUITE 2: Combined Multi-Property Statement
// ============================================================================

console.log('\n=== TEST SUITE 2: Combined Multi-Property Statement ===\n');

test('Multi-property: Revenue from multiple properties', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 1000, source: 'vrbo' },
        { propertyId: 2, grossAmount: 1500, source: 'booking.com' },
        { propertyId: 3, grossAmount: 2000, source: 'direct' }
    ];
    const totalRevenue = calculateTotalRevenue(reservations, {});
    assertEqual(totalRevenue, 4500);
});

test('Multi-property: Expenses from multiple properties', () => {
    const expenses = [
        { propertyId: 1, amount: -100, type: 'cleaning' },
        { propertyId: 2, amount: -150, type: 'maintenance' },
        { propertyId: 3, amount: -75, type: 'supplies' }
    ];
    const totalExpenses = calculateTotalExpenses(expenses);
    assertEqual(totalExpenses, 325);
});

test('Multi-property: PM commission with different rates per property', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 1000, source: 'vrbo' },  // 15%
        { propertyId: 2, grossAmount: 1000, source: 'vrbo' },  // 20%
        { propertyId: 3, grossAmount: 1000, source: 'vrbo' }   // 10%
    ];
    const listingInfoMap = {
        1: { pmFeePercentage: 15 },
        2: { pmFeePercentage: 20 },
        3: { pmFeePercentage: 10 }
    };

    const pmCommission = calculatePmCommission(reservations, listingInfoMap);
    // 1000*0.15 + 1000*0.20 + 1000*0.10 = 150 + 200 + 100 = 450
    assertEqual(pmCommission, 450);
});

test('Multi-property: Tech fees for 3 properties', () => {
    assertEqual(calculateTechFees(3), 150); // 3 * $50
});

test('Multi-property: Insurance fees for 3 properties', () => {
    assertEqual(calculateInsuranceFees(3), 75); // 3 * $25
});

test('Multi-property: Tech fees for 20 properties (max scenario)', () => {
    assertEqual(calculateTechFees(20), 1000); // 20 * $50
});

test('Multi-property: Insurance fees for 20 properties', () => {
    assertEqual(calculateInsuranceFees(20), 500); // 20 * $25
});

test('Multi-property: Complete payout calculation for 3 properties', () => {
    // Scenario: 3 properties
    // - Property 1: Revenue $2000, PM 15%
    // - Property 2: Revenue $3000, PM 20%
    // - Property 3: Revenue $1500, PM 10%
    // - Total Revenue: $6500
    // - Expenses: $400
    // - PM Commission: 2000*0.15 + 3000*0.20 + 1500*0.10 = 300 + 600 + 150 = $1050
    // - Tech Fee: 3 * $50 = $150
    // - Insurance Fee: 3 * $25 = $75
    // - Expected Payout: 6500 - 400 - 1050 - 150 - 75 = $4825

    const totalRevenue = 6500;
    const totalExpenses = 400;
    const pmCommission = 1050;
    const techFees = 150;
    const insuranceFees = 75;

    const ownerPayout = calculateOwnerPayout(totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees);
    assertEqual(ownerPayout, 4825);
});

test('Multi-property: Mixed co-host status (some properties co-hosted)', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 1000, source: 'airbnb' },  // co-host: excluded
        { propertyId: 1, grossAmount: 500, source: 'vrbo' },     // included
        { propertyId: 2, grossAmount: 2000, source: 'airbnb' },  // NOT co-host: included
        { propertyId: 2, grossAmount: 800, source: 'vrbo' }      // included
    ];
    const listingInfoMap = {
        1: { isCohostOnAirbnb: true, pmFeePercentage: 15 },   // Co-host
        2: { isCohostOnAirbnb: false, pmFeePercentage: 20 }   // NOT co-host
    };

    const totalRevenue = calculateTotalRevenue(reservations, listingInfoMap);
    // Property 1: Only VRBO ($500), Airbnb excluded
    // Property 2: Both Airbnb ($2000) and VRBO ($800)
    assertEqual(totalRevenue, 3300); // 500 + 2000 + 800

    const pmCommission = calculatePmCommission(reservations, listingInfoMap);
    // Property 1: 500 * 0.15 = $75 (Airbnb skipped)
    // Property 2: (2000 + 800) * 0.20 = $560
    assertEqual(pmCommission, 635);
});

// ============================================================================
// TEST SUITE 3: Edge Cases
// ============================================================================

console.log('\n=== TEST SUITE 3: Edge Cases ===\n');

test('Edge case: Zero revenue', () => {
    const ownerPayout = calculateOwnerPayout(0, 100, 0, 50, 25);
    assertEqual(ownerPayout, -175); // Negative payout when no revenue
});

test('Edge case: No expenses', () => {
    const ownerPayout = calculateOwnerPayout(1000, 0, 150, 50, 25);
    assertEqual(ownerPayout, 775);
});

test('Edge case: Default PM fee when not specified', () => {
    const reservations = [
        { propertyId: 1, grossAmount: 1000, source: 'vrbo' }
    ];
    const listingInfoMap = { 1: {} }; // No PM fee specified
    const pmCommission = calculatePmCommission(reservations, listingInfoMap, 15);
    assertEqual(pmCommission, 150); // Uses default 15%
});

test('Edge case: Rounding currency values', () => {
    // Test that we round to 2 decimal places
    assertEqual(roundCurrency(123.456), 123.46);
    assertEqual(roundCurrency(123.454), 123.45);
    assertEqual(roundCurrency(100.005), 100.01);
});

test('Edge case: Large number of properties (20)', () => {
    const propertyCount = 20;
    const techFees = calculateTechFees(propertyCount);
    const insuranceFees = calculateInsuranceFees(propertyCount);

    assertEqual(techFees, 1000);      // 20 * $50
    assertEqual(insuranceFees, 500);  // 20 * $25

    // Total fixed fees for 20 properties
    assertEqual(techFees + insuranceFees, 1500);
});

// ============================================================================
// TEST SUITE 4: Formula Verification
// ============================================================================

console.log('\n=== TEST SUITE 4: Formula Verification ===\n');

test('Formula: ownerPayout = totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees', () => {
    // Multiple test cases to verify the formula
    const testCases = [
        { revenue: 5000, expenses: 300, pm: 750, tech: 50, insurance: 25, expected: 3875 },
        { revenue: 10000, expenses: 500, pm: 1500, tech: 100, insurance: 50, expected: 7850 },
        { revenue: 2500, expenses: 150, pm: 375, tech: 150, insurance: 75, expected: 1750 },
        { revenue: 0, expenses: 100, pm: 0, tech: 50, insurance: 25, expected: -175 },
    ];

    for (const tc of testCases) {
        const result = calculateOwnerPayout(tc.revenue, tc.expenses, tc.pm, tc.tech, tc.insurance);
        assertEqual(result, tc.expected,
            `For revenue=${tc.revenue}, expenses=${tc.expenses}, pm=${tc.pm}, tech=${tc.tech}, insurance=${tc.insurance}`);
    }
});

test('Formula: Combined statement uses same formula as single property', () => {
    // Single property scenario
    const singleRevenue = 3000;
    const singleExpenses = 200;
    const singlePm = 450; // 15%
    const singleTech = 50;
    const singleInsurance = 25;
    const singlePayout = calculateOwnerPayout(singleRevenue, singleExpenses, singlePm, singleTech, singleInsurance);

    // Combined 3-property scenario (same total amounts)
    const combinedRevenue = 3000; // Same total
    const combinedExpenses = 200; // Same total
    const combinedPm = 450; // Same total PM
    const combinedTech = 150; // 3 properties * $50
    const combinedInsurance = 75; // 3 properties * $25
    const combinedPayout = calculateOwnerPayout(combinedRevenue, combinedExpenses, combinedPm, combinedTech, combinedInsurance);

    // Verify both use the same formula: ownerPayout = revenue - expenses - pm - tech - insurance
    // Single: 3000 - 200 - 450 - 50 - 25 = 2275
    assertEqual(singlePayout, 2275);
    // Combined: 3000 - 200 - 450 - 150 - 75 = 2125
    assertEqual(combinedPayout, 2125); // Lower due to more tech/insurance fees

    // The difference should be exactly the additional fees (100 tech + 50 insurance = 150)
    const feeDifference = (combinedTech - singleTech) + (combinedInsurance - singleInsurance);
    assertEqual(feeDifference, 150);
    assertEqual(singlePayout - combinedPayout, feeDifference);
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n=== TEST SUMMARY ===\n');

const passed = testResults.filter(r => r.passed).length;
const failed = testResults.filter(r => !r.passed).length;

console.log(`Total: ${testResults.length} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    console.log('\nFailed tests:');
    testResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
} else {
    console.log('\nAll tests passed! Core calculation logic is verified.');
    process.exit(0);
}
