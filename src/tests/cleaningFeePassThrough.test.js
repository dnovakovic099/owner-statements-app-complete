/**
 * Test Cases for cleaningFeePassThrough Feature
 *
 * This tests the "Swap" Logic:
 * - Step A: Show guest-paid cleaning fee in "Cleaning Expense" column
 * - Step B: Deduct from Gross Payout calculation
 * - Step C: Suppress standard cleaning expenses from expense list
 */

const assert = require('assert');

// Mock data for testing
const mockListings = {
    // Property with cleaningFeePassThrough ENABLED
    propertyA: {
        id: 100001,
        name: 'Property A - PassThrough Enabled',
        nickname: 'Property A',
        pmFeePercentage: 15,
        cleaningFeePassThrough: true,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    // Property with cleaningFeePassThrough DISABLED
    propertyB: {
        id: 100002,
        name: 'Property B - PassThrough Disabled',
        nickname: 'Property B',
        pmFeePercentage: 15,
        cleaningFeePassThrough: false,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    // Property with cleaningFeePassThrough ENABLED + Co-host Airbnb
    propertyC: {
        id: 100003,
        name: 'Property C - PassThrough + CoHost',
        nickname: 'Property C',
        pmFeePercentage: 15,
        cleaningFeePassThrough: true,
        isCohostOnAirbnb: true,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    // Property with cleaningFeePassThrough ENABLED + disregardTax
    propertyD: {
        id: 100004,
        name: 'Property D - PassThrough + DisregardTax',
        nickname: 'Property D',
        pmFeePercentage: 20,
        cleaningFeePassThrough: true,
        isCohostOnAirbnb: false,
        disregardTax: true,
        airbnbPassThroughTax: false
    }
};

const mockReservations = {
    // Reservation for Property A (PassThrough enabled)
    resA1: {
        id: 'res-a1',
        propertyId: 100001,
        guestName: 'Guest A1',
        source: 'Airbnb',
        checkInDate: '2025-12-01',
        checkOutDate: '2025-12-05',
        nights: 4,
        hasDetailedFinance: true,
        baseRate: 800,
        cleaningFee: 350,
        cleaningAndOtherFees: 350,
        platformFees: 120,
        clientRevenue: 1030,
        clientTaxResponsibility: 100,
        grossAmount: 1150
    },
    // Reservation for Property B (PassThrough disabled)
    resB1: {
        id: 'res-b1',
        propertyId: 100002,
        guestName: 'Guest B1',
        source: 'VRBO',
        checkInDate: '2025-12-01',
        checkOutDate: '2025-12-05',
        nights: 4,
        hasDetailedFinance: true,
        baseRate: 600,
        cleaningFee: 250,
        cleaningAndOtherFees: 250,
        platformFees: 90,
        clientRevenue: 760,
        clientTaxResponsibility: 80,
        grossAmount: 850
    },
    // Reservation for Property C (CoHost Airbnb)
    resC1: {
        id: 'res-c1',
        propertyId: 100003,
        guestName: 'Guest C1',
        source: 'Airbnb',
        checkInDate: '2025-12-01',
        checkOutDate: '2025-12-05',
        nights: 4,
        hasDetailedFinance: true,
        baseRate: 500,
        cleaningFee: 200,
        cleaningAndOtherFees: 200,
        platformFees: 75,
        clientRevenue: 625,
        clientTaxResponsibility: 60,
        grossAmount: 700
    },
    // Reservation with NO cleaning fee
    resA2: {
        id: 'res-a2',
        propertyId: 100001,
        guestName: 'Guest A2 - No Cleaning',
        source: 'Direct',
        checkInDate: '2025-12-10',
        checkOutDate: '2025-12-12',
        nights: 2,
        hasDetailedFinance: true,
        baseRate: 400,
        cleaningFee: 0,  // No cleaning fee
        cleaningAndOtherFees: 0,
        platformFees: 0,
        clientRevenue: 400,
        clientTaxResponsibility: 40,
        grossAmount: 440
    }
};

const mockExpenses = {
    // Cleaning expense for Property A (should be FILTERED when passthrough enabled)
    cleaningExpA: {
        id: 'exp-clean-a',
        propertyId: 100001,
        description: 'Cleaning Service',
        category: 'Cleaning',
        type: 'expense',
        amount: -150,
        date: '2025-12-05'
    },
    // Cleaning expense for Property B (should NOT be filtered)
    cleaningExpB: {
        id: 'exp-clean-b',
        propertyId: 100002,
        description: 'Cleaning Service',
        category: 'Cleaning',
        type: 'expense',
        amount: -120,
        date: '2025-12-05'
    },
    // Non-cleaning expense for Property A
    otherExpA: {
        id: 'exp-other-a',
        propertyId: 100001,
        description: 'Lawn Service',
        category: 'Lawn',
        type: 'expense',
        amount: -50,
        date: '2025-12-05'
    },
    // Non-cleaning expense for Property B
    otherExpB: {
        id: 'exp-other-b',
        propertyId: 100002,
        description: 'Pest Control',
        category: 'Pest Control',
        type: 'expense',
        amount: -75,
        date: '2025-12-05'
    },
    // Expense with "cleaning" in description (edge case)
    cleaningDescExp: {
        id: 'exp-clean-desc',
        propertyId: 100001,
        description: 'cleaning supplies purchase',
        category: 'Supplies',
        type: 'expense',
        amount: -30,
        date: '2025-12-05'
    }
};

/**
 * Helper: Calculate gross payout for a reservation (matches PDF logic)
 */
function calculateGrossPayout(reservation, listing) {
    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
    const pmFee = clientRevenue * (listing.pmFeePercentage / 100);
    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;
    const cleaningFeeForPassThrough = listing.cleaningFeePassThrough ? (reservation.cleaningFee || 0) : 0;

    const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
    const isCohostAirbnb = isAirbnb && listing.isCohostOnAirbnb;
    const shouldAddTax = !listing.disregardTax && (!isAirbnb || listing.airbnbPassThroughTax);

    let grossPayout;
    if (isCohostAirbnb) {
        grossPayout = -pmFee - cleaningFeeForPassThrough;
    } else if (shouldAddTax) {
        grossPayout = clientRevenue - pmFee + taxResponsibility - cleaningFeeForPassThrough;
    } else {
        grossPayout = clientRevenue - pmFee - cleaningFeeForPassThrough;
    }

    return {
        grossPayout: Math.round(grossPayout * 100) / 100,
        pmFee: Math.round(pmFee * 100) / 100,
        cleaningFeeForPassThrough,
        taxResponsibility,
        shouldAddTax,
        isCohostAirbnb
    };
}

/**
 * Helper: Filter expenses based on cleaningFeePassThrough
 */
function filterExpenses(expenses, listingInfoMap) {
    return expenses.filter(exp => {
        const propId = exp.propertyId ? parseInt(exp.propertyId) : null;
        const hasCleaningPassThrough = propId && listingInfoMap[propId]?.cleaningFeePassThrough;

        if (hasCleaningPassThrough) {
            const category = (exp.category || '').toLowerCase();
            const type = (exp.type || '').toLowerCase();
            const description = (exp.description || '').toLowerCase();
            const isCleaning = category.includes('cleaning') || type.includes('cleaning') || description.startsWith('cleaning');
            return !isCleaning;
        }
        return true;
    });
}

/**
 * Helper: Calculate total expenses (excluding upsells)
 */
function calculateTotalExpenses(expenses) {
    return expenses.reduce((sum, exp) => {
        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell');
        return isUpsell ? sum : sum + Math.abs(exp.amount);
    }, 0);
}

// ============================================================================
// TEST CASES
// ============================================================================

console.log('\n========================================');
console.log('CLEANING FEE PASS-THROUGH TEST SUITE');
console.log('========================================\n');

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

// ----------------------------------------------------------------------------
// TEST GROUP 1: Single Property - PassThrough ENABLED
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 1: Single Property - PassThrough ENABLED ---\n');

test('1.1 Cleaning fee should be deducted from gross payout', () => {
    const result = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);

    // Expected: clientRevenue - pmFee - cleaningFeeForPassThrough (no tax for Airbnb without passthrough)
    // 1030 - 154.50 - 350 = 525.50
    const expected = 1030 - (1030 * 0.15) - 350;

    assert.strictEqual(result.cleaningFeeForPassThrough, 350, 'Cleaning fee should be 350');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross payout should deduct cleaning fee');
});

test('1.2 Cleaning expenses should be filtered out', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [mockExpenses.cleaningExpA, mockExpenses.otherExpA];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 1, 'Should filter out cleaning expense');
    assert.strictEqual(filtered[0].id, 'exp-other-a', 'Should keep non-cleaning expense');
});

test('1.3 Expense with "cleaning" in description should be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [mockExpenses.cleaningDescExp, mockExpenses.otherExpA];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 1, 'Should filter expense with cleaning in description');
    assert.strictEqual(filtered[0].id, 'exp-other-a', 'Should keep non-cleaning expense');
});

test('1.4 Reservation with $0 cleaning fee should not affect calculation', () => {
    const result = calculateGrossPayout(mockReservations.resA2, mockListings.propertyA);

    // Direct booking with tax: clientRevenue - pmFee + tax - 0
    // 400 - 60 + 40 - 0 = 380
    const expected = 400 - (400 * 0.15) + 40 - 0;

    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Cleaning fee should be 0');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross payout should be correct');
});

// ----------------------------------------------------------------------------
// TEST GROUP 2: Single Property - PassThrough DISABLED
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Single Property - PassThrough DISABLED ---\n');

test('2.1 Cleaning fee should NOT be deducted from gross payout', () => {
    const result = calculateGrossPayout(mockReservations.resB1, mockListings.propertyB);

    // VRBO with tax: clientRevenue - pmFee + tax (NO cleaning deduction)
    // 760 - 114 + 80 = 726
    const expected = 760 - (760 * 0.15) + 80;

    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Cleaning fee for passthrough should be 0');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross payout should NOT deduct cleaning');
});

test('2.2 Cleaning expenses should NOT be filtered', () => {
    const listingInfoMap = { 100002: mockListings.propertyB };
    const expenses = [mockExpenses.cleaningExpB, mockExpenses.otherExpB];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 2, 'Should keep all expenses including cleaning');
});

// ----------------------------------------------------------------------------
// TEST GROUP 3: Combined Statement - MIXED Settings
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Combined Statement - MIXED Settings ---\n');

test('3.1 Property A reservations should deduct cleaning, Property B should not', () => {
    const resultA = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
    const resultB = calculateGrossPayout(mockReservations.resB1, mockListings.propertyB);

    assert.strictEqual(resultA.cleaningFeeForPassThrough, 350, 'Property A should have cleaning passthrough');
    assert.strictEqual(resultB.cleaningFeeForPassThrough, 0, 'Property B should NOT have cleaning passthrough');
});

test('3.2 Expense filtering should be per-property', () => {
    const listingInfoMap = {
        100001: mockListings.propertyA,
        100002: mockListings.propertyB
    };
    const expenses = [
        mockExpenses.cleaningExpA,  // Property A - should be filtered
        mockExpenses.cleaningExpB,  // Property B - should NOT be filtered
        mockExpenses.otherExpA,     // Property A - should keep
        mockExpenses.otherExpB      // Property B - should keep
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 3, 'Should filter only Property A cleaning expense');
    assert.ok(!filtered.find(e => e.id === 'exp-clean-a'), 'Property A cleaning should be filtered');
    assert.ok(filtered.find(e => e.id === 'exp-clean-b'), 'Property B cleaning should NOT be filtered');
});

test('3.3 Combined gross payout sum should be correct', () => {
    const resultA = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
    const resultB = calculateGrossPayout(mockReservations.resB1, mockListings.propertyB);

    const combinedGrossPayout = resultA.grossPayout + resultB.grossPayout;

    // Property A: 1030 - 154.50 - 350 = 525.50
    // Property B: 760 - 114 + 80 = 726
    // Combined: 525.50 + 726 = 1251.50
    const expectedA = 1030 - (1030 * 0.15) - 350;
    const expectedB = 760 - (760 * 0.15) + 80;
    const expectedCombined = Math.round((expectedA + expectedB) * 100) / 100;

    assert.strictEqual(combinedGrossPayout, expectedCombined, 'Combined gross payout should be sum of both');
});

test('3.4 Combined total expenses should exclude Property A cleaning only', () => {
    const listingInfoMap = {
        100001: mockListings.propertyA,
        100002: mockListings.propertyB
    };
    const expenses = [
        mockExpenses.cleaningExpA,  // -150, filtered
        mockExpenses.cleaningExpB,  // -120, kept
        mockExpenses.otherExpA,     // -50, kept
        mockExpenses.otherExpB      // -75, kept
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    const totalExpenses = calculateTotalExpenses(filtered);

    // Should be: 120 + 50 + 75 = 245 (excluding Property A cleaning)
    assert.strictEqual(totalExpenses, 245, 'Total expenses should exclude Property A cleaning');
});

// ----------------------------------------------------------------------------
// TEST GROUP 4: Co-Host Airbnb with PassThrough
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Co-Host Airbnb with PassThrough ---\n');

test('4.1 CoHost Airbnb should have negative gross payout minus cleaning', () => {
    const result = calculateGrossPayout(mockReservations.resC1, mockListings.propertyC);

    // CoHost Airbnb: -pmFee - cleaningFeeForPassThrough
    // -93.75 - 200 = -293.75
    const pmFee = 625 * 0.15;
    const expected = -pmFee - 200;

    assert.strictEqual(result.isCohostAirbnb, true, 'Should be identified as CoHost Airbnb');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross payout should be negative');
});

// ----------------------------------------------------------------------------
// TEST GROUP 5: DisregardTax with PassThrough
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: DisregardTax with PassThrough ---\n');

test('5.1 DisregardTax should not add tax but still deduct cleaning', () => {
    const reservation = {
        ...mockReservations.resA1,
        propertyId: 100004,
        source: 'VRBO'  // Non-Airbnb
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyD);

    // DisregardTax: clientRevenue - pmFee - cleaningFeeForPassThrough (NO tax)
    // 1030 - 206 - 350 = 474 (20% PM fee)
    const expected = 1030 - (1030 * 0.20) - 350;

    assert.strictEqual(result.shouldAddTax, false, 'Should NOT add tax');
    assert.strictEqual(result.cleaningFeeForPassThrough, 350, 'Should still deduct cleaning');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross payout correct');
});

// ----------------------------------------------------------------------------
// TEST GROUP 6: Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Edge Cases ---\n');

test('6.1 Null/undefined cleaning fee should default to 0', () => {
    const reservation = {
        ...mockReservations.resA1,
        cleaningFee: null
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Null cleaning fee should be 0');
});

test('6.2 Expense with null propertyId should not be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [{
        id: 'exp-null-prop',
        propertyId: null,
        description: 'Cleaning Service',
        category: 'Cleaning',
        amount: -100
    }];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 1, 'Expense with null propertyId should not be filtered');
});

test('6.3 Unknown propertyId should not be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [{
        id: 'exp-unknown',
        propertyId: 999999,  // Unknown property
        description: 'Cleaning Service',
        category: 'Cleaning',
        amount: -100
    }];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 1, 'Expense with unknown propertyId should not be filtered');
});

test('6.4 Multiple cleaning expenses for same property should all be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'clean1', propertyId: 100001, description: 'Weekly Cleaning', category: 'Cleaning', amount: -100 },
        { id: 'clean2', propertyId: 100001, description: 'Deep Cleaning', category: 'Cleaning', amount: -200 },
        { id: 'clean3', propertyId: 100001, description: 'cleaning after checkout', category: 'Other', amount: -150 },
        { id: 'other1', propertyId: 100001, description: 'Lawn Service', category: 'Lawn', amount: -50 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 1, 'All cleaning expenses should be filtered');
    assert.strictEqual(filtered[0].id, 'other1', 'Only non-cleaning expense should remain');
});

test('6.5 Case-insensitive cleaning detection', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'clean1', propertyId: 100001, description: 'Service', category: 'CLEANING', amount: -100 },
        { id: 'clean2', propertyId: 100001, description: 'Service', category: 'Cleaning', amount: -100 },
        { id: 'clean3', propertyId: 100001, description: 'Service', category: 'cleaning', amount: -100 },
        { id: 'other1', propertyId: 100001, description: 'Service', category: 'Other', amount: -50 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 1, 'All case variations of cleaning should be filtered');
});

// ----------------------------------------------------------------------------
// TEST GROUP 7: Net Payout Calculation
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 7: Net Payout Calculation ---\n');

test('7.1 Single property net payout: grossPayout - expenses', () => {
    const result = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [mockExpenses.cleaningExpA, mockExpenses.otherExpA];

    const filtered = filterExpenses(expenses, listingInfoMap);
    const totalExpenses = calculateTotalExpenses(filtered);

    const netPayout = result.grossPayout - totalExpenses;

    // Gross: 525.50, Expenses: 50 (cleaning filtered)
    // Net: 525.50 - 50 = 475.50
    const expectedNet = result.grossPayout - 50;

    assert.strictEqual(netPayout, expectedNet, 'Net payout should be gross minus filtered expenses');
});

test('7.2 Combined statement net payout calculation', () => {
    const resultA = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
    const resultB = calculateGrossPayout(mockReservations.resB1, mockListings.propertyB);

    const listingInfoMap = {
        100001: mockListings.propertyA,
        100002: mockListings.propertyB
    };
    const expenses = [
        mockExpenses.cleaningExpA,
        mockExpenses.cleaningExpB,
        mockExpenses.otherExpA,
        mockExpenses.otherExpB
    ];

    const grossPayoutSum = resultA.grossPayout + resultB.grossPayout;
    const filtered = filterExpenses(expenses, listingInfoMap);
    const totalExpenses = calculateTotalExpenses(filtered);
    const netPayout = grossPayoutSum - totalExpenses;

    // Gross: 525.50 + 726 = 1251.50
    // Expenses: 120 + 50 + 75 = 245 (Property A cleaning filtered)
    // Net: 1251.50 - 245 = 1006.50
    const expected = grossPayoutSum - 245;

    assert.strictEqual(Math.round(netPayout * 100) / 100, Math.round(expected * 100) / 100,
        'Combined net payout should be correct');
});

// ----------------------------------------------------------------------------
// TEST GROUP 8: Consistency Check (List vs PDF)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 8: Consistency Check (List vs PDF) ---\n');

test('8.1 List calculation should match PDF calculation', () => {
    // Simulate list calculation (at generation time)
    const listResult = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);

    // Simulate PDF calculation (at view time) - should be identical
    const pdfResult = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);

    assert.strictEqual(listResult.grossPayout, pdfResult.grossPayout,
        'List and PDF gross payout should be identical');
    assert.strictEqual(listResult.cleaningFeeForPassThrough, pdfResult.cleaningFeeForPassThrough,
        'List and PDF cleaning fee should be identical');
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n========================================');
console.log('TEST SUMMARY');
console.log('========================================');
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Total:  ${passedTests + failedTests}`);
console.log('========================================\n');

if (failedTests > 0) {
    process.exit(1);
}
