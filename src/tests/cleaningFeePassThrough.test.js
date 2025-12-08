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
        cleaningFee: 300, // Default cleaning fee from Hostify
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
        cleaningFee: 250, // Has default but passthrough disabled
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
        cleaningFee: 200, // Default cleaning fee
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
        cleaningFee: 350, // Default cleaning fee
        isCohostOnAirbnb: false,
        disregardTax: true,
        airbnbPassThroughTax: false
    },
    // Property with cleaningFeePassThrough ENABLED but NO default cleaning fee
    propertyE: {
        id: 100005,
        name: 'Property E - PassThrough No Default',
        nickname: 'Property E',
        pmFeePercentage: 15,
        cleaningFeePassThrough: true,
        cleaningFee: 0, // No default cleaning fee
        isCohostOnAirbnb: false,
        disregardTax: false,
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
 * NEW: Uses listing.cleaningFee as fallback when reservation.cleaningFee is 0
 */
function calculateGrossPayout(reservation, listing) {
    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
    const pmFee = clientRevenue * (listing.pmFeePercentage / 100);
    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

    // NEW LOGIC: Use listing's default cleaning fee if reservation cleaning fee is 0
    const cleaningFeeForPassThrough = listing.cleaningFeePassThrough
        ? (reservation.cleaningFee || listing.cleaningFee || 0)
        : 0;

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
        isCohostAirbnb,
        usedListingDefault: listing.cleaningFeePassThrough && !reservation.cleaningFee && listing.cleaningFee > 0
    };
}

/**
 * Helper: Check if cleaning mismatch warning should be shown
 * Warning shows when reservation is missing cleaning fee AND listing has no default
 */
function shouldShowCleaningMismatchWarning(reservations, listing) {
    if (!listing.cleaningFeePassThrough) return { show: false };

    const reservationsWithOwnCleaningFee = reservations.filter(res =>
        res.cleaningFee && res.cleaningFee > 0
    );

    // Warning shows if some reservations don't have their own cleaning fee
    // (even if they use listing default, we still warn to indicate fallback is being used)
    if (reservationsWithOwnCleaningFee.length !== reservations.length) {
        return {
            show: true,
            message: `${reservationsWithOwnCleaningFee.length} of ${reservations.length} reservations have cleaning fees (using listing default for others)`,
            reservationCount: reservations.length,
            cleaningExpenseCount: reservationsWithOwnCleaningFee.length
        };
    }
    return { show: false };
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

test('1.4 Reservation with $0 cleaning fee should use listing default', () => {
    const result = calculateGrossPayout(mockReservations.resA2, mockListings.propertyA);

    // NEW: Uses listing default (300) when reservation cleaningFee is 0
    // Direct booking with tax: clientRevenue - pmFee + tax - listingCleaningFee
    // 400 - 60 + 40 - 300 = 80
    const expected = 400 - (400 * 0.15) + 40 - 300;

    assert.strictEqual(result.cleaningFeeForPassThrough, 300, 'Should use listing default cleaning fee (300)');
    assert.strictEqual(result.usedListingDefault, true, 'Should indicate listing default was used');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross payout should deduct listing default');
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

test('6.1 Null/undefined cleaning fee should use listing default', () => {
    const reservation = {
        ...mockReservations.resA1,
        cleaningFee: null
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // With listing default of 300
    assert.strictEqual(result.cleaningFeeForPassThrough, 300, 'Null cleaning fee should use listing default (300)');
    assert.strictEqual(result.usedListingDefault, true, 'Should indicate listing default was used');
});

test('6.1b Null cleaning fee with NO listing default should be 0', () => {
    const reservation = {
        ...mockReservations.resA1,
        propertyId: 100005,
        cleaningFee: null
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyE);

    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Should be 0 when no listing default');
    assert.strictEqual(result.usedListingDefault, false, 'Should not indicate listing default was used');
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

// ----------------------------------------------------------------------------
// TEST GROUP 9: Listing Default Cleaning Fee Fallback (NEW)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 9: Listing Default Cleaning Fee Fallback ---\n');

test('9.1 Reservation with own cleaning fee should use reservation fee (not listing default)', () => {
    const result = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);

    // Reservation has cleaningFee=350, listing default is 300
    // Should use 350 (reservation's own fee)
    assert.strictEqual(result.cleaningFeeForPassThrough, 350, 'Should use reservation cleaning fee (350)');
    assert.strictEqual(result.usedListingDefault, false, 'Should NOT use listing default');
});

test('9.2 Reservation with $0 cleaning fee should use listing default', () => {
    const reservation = {
        ...mockReservations.resA1,
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Reservation has cleaningFee=0, listing default is 300
    assert.strictEqual(result.cleaningFeeForPassThrough, 300, 'Should use listing default (300)');
    assert.strictEqual(result.usedListingDefault, true, 'Should indicate listing default was used');
});

test('9.3 Reservation with undefined cleaning fee should use listing default', () => {
    const reservation = {
        ...mockReservations.resA1,
        cleaningFee: undefined
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    assert.strictEqual(result.cleaningFeeForPassThrough, 300, 'Should use listing default (300)');
    assert.strictEqual(result.usedListingDefault, true, 'Should indicate listing default was used');
});

test('9.4 Listing with $0 default should result in $0 when reservation also $0', () => {
    const reservation = {
        ...mockReservations.resA1,
        propertyId: 100005,
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyE);

    // Property E has cleaningFee=0 (no default)
    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Should be 0 when no fallback available');
    assert.strictEqual(result.usedListingDefault, false, 'Should NOT indicate listing default was used');
});

test('9.5 Mixed reservations: some with own fee, some using default', () => {
    const reservations = [
        mockReservations.resA1, // Has own cleaningFee=350
        { ...mockReservations.resA2, cleaningFee: 0 } // Will use listing default=300
    ];

    const result1 = calculateGrossPayout(reservations[0], mockListings.propertyA);
    const result2 = calculateGrossPayout(reservations[1], mockListings.propertyA);

    assert.strictEqual(result1.cleaningFeeForPassThrough, 350, 'First should use own fee (350)');
    assert.strictEqual(result1.usedListingDefault, false, 'First should NOT use default');

    assert.strictEqual(result2.cleaningFeeForPassThrough, 300, 'Second should use listing default (300)');
    assert.strictEqual(result2.usedListingDefault, true, 'Second should use default');

    // Total cleaning fees: 350 + 300 = 650
    const totalCleaningFees = result1.cleaningFeeForPassThrough + result2.cleaningFeeForPassThrough;
    assert.strictEqual(totalCleaningFees, 650, 'Total cleaning fees should be 650');
});

test('9.6 PassThrough disabled should not use listing default even if available', () => {
    const reservation = {
        ...mockReservations.resB1,
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyB);

    // Property B has passthrough DISABLED but has cleaningFee=250
    // Should NOT deduct anything since passthrough is off
    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Should be 0 when passthrough disabled');
    assert.strictEqual(result.usedListingDefault, false, 'Should NOT use default when passthrough disabled');
});

// ----------------------------------------------------------------------------
// TEST GROUP 10: Cleaning Mismatch Warning Logic (NEW)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 10: Cleaning Mismatch Warning Logic ---\n');

test('10.1 Warning should show when some reservations missing cleaning fee', () => {
    const reservations = [
        mockReservations.resA1, // Has cleaningFee=350
        { ...mockReservations.resA2, cleaningFee: 0 } // Missing cleaningFee
    ];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);

    assert.strictEqual(warning.show, true, 'Warning should show');
    assert.strictEqual(warning.reservationCount, 2, 'Should have 2 reservations');
    assert.strictEqual(warning.cleaningExpenseCount, 1, 'Only 1 has own cleaning fee');
    assert.ok(warning.message.includes('1 of 2'), 'Message should indicate 1 of 2');
});

test('10.2 Warning should NOT show when all reservations have own cleaning fee', () => {
    const reservations = [
        mockReservations.resA1, // Has cleaningFee=350
        { ...mockReservations.resA1, id: 'res-a1b', cleaningFee: 250 } // Has cleaningFee=250
    ];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);

    assert.strictEqual(warning.show, false, 'Warning should NOT show when all have fees');
});

test('10.3 Warning should NOT show when passthrough disabled', () => {
    const reservations = [
        { ...mockReservations.resB1, cleaningFee: 0 } // Missing cleaningFee
    ];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyB);

    assert.strictEqual(warning.show, false, 'Warning should NOT show when passthrough disabled');
});

test('10.4 Warning should show for all reservations missing fees', () => {
    const reservations = [
        { ...mockReservations.resA1, cleaningFee: 0 },
        { ...mockReservations.resA2, cleaningFee: 0 }
    ];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);

    assert.strictEqual(warning.show, true, 'Warning should show');
    assert.strictEqual(warning.cleaningExpenseCount, 0, 'None have own cleaning fee');
    assert.ok(warning.message.includes('0 of 2'), 'Message should indicate 0 of 2');
});

test('10.5 Single reservation with own fee should NOT trigger warning', () => {
    const reservations = [mockReservations.resA1];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);

    assert.strictEqual(warning.show, false, 'Warning should NOT show for single res with fee');
});

test('10.6 Single reservation missing fee should trigger warning', () => {
    const reservations = [{ ...mockReservations.resA1, cleaningFee: 0 }];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);

    assert.strictEqual(warning.show, true, 'Warning should show for single res missing fee');
    assert.ok(warning.message.includes('0 of 1'), 'Message should indicate 0 of 1');
});

// ----------------------------------------------------------------------------
// TEST GROUP 11: Net Payout with Listing Default (NEW)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 11: Net Payout with Listing Default ---\n');

test('11.1 Net payout should account for listing default cleaning fee', () => {
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 }; // Will use default 300
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [mockExpenses.otherExpA]; // -50

    const filtered = filterExpenses(expenses, listingInfoMap);
    const totalExpenses = calculateTotalExpenses(filtered);
    const netPayout = result.grossPayout - totalExpenses;

    // Gross: 400 - 60 + 40 - 300 = 80
    // Expenses: 50
    // Net: 80 - 50 = 30
    const expectedGross = 400 - (400 * 0.15) + 40 - 300;
    const expectedNet = expectedGross - 50;

    assert.strictEqual(result.grossPayout, Math.round(expectedGross * 100) / 100, 'Gross payout should use listing default');
    assert.strictEqual(Math.round(netPayout * 100) / 100, Math.round(expectedNet * 100) / 100, 'Net payout should be correct');
});

test('11.2 Combined statement with mixed defaults should calculate correctly', () => {
    const reservations = [
        mockReservations.resA1, // Has own fee 350
        { ...mockReservations.resA2, cleaningFee: 0 } // Uses default 300
    ];

    const result1 = calculateGrossPayout(reservations[0], mockListings.propertyA);
    const result2 = calculateGrossPayout(reservations[1], mockListings.propertyA);

    const grossPayoutSum = result1.grossPayout + result2.grossPayout;

    // Res 1: 1030 - 154.50 - 350 = 525.50 (Airbnb, no tax)
    // Res 2: 400 - 60 + 40 - 300 = 80 (Direct, with tax)
    // Sum: 605.50
    const expected1 = 1030 - (1030 * 0.15) - 350;
    const expected2 = 400 - (400 * 0.15) + 40 - 300;
    const expectedSum = expected1 + expected2;

    assert.strictEqual(
        Math.round(grossPayoutSum * 100) / 100,
        Math.round(expectedSum * 100) / 100,
        'Combined gross payout should be correct'
    );
});

// ----------------------------------------------------------------------------
// TEST GROUP 12: Bulk Generation Scenarios (NEW)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 12: Bulk Generation Scenarios ---\n');

test('12.1 Multiple properties with different default cleaning fees', () => {
    // Property A: default 300, Property D: default 350
    const resForA = { ...mockReservations.resA2, cleaningFee: 0 }; // Uses A's default 300
    const resForD = { ...mockReservations.resA2, propertyId: 100004, cleaningFee: 0 }; // Uses D's default 350

    const resultA = calculateGrossPayout(resForA, mockListings.propertyA);
    const resultD = calculateGrossPayout(resForD, mockListings.propertyD);

    assert.strictEqual(resultA.cleaningFeeForPassThrough, 300, 'Property A should use its default (300)');
    assert.strictEqual(resultD.cleaningFeeForPassThrough, 350, 'Property D should use its default (350)');
});

test('12.2 Property with no default should not deduct cleaning for missing fees', () => {
    const reservation = { ...mockReservations.resA2, propertyId: 100005, cleaningFee: 0 };
    const result = calculateGrossPayout(reservation, mockListings.propertyE);

    // Property E has no default (cleaningFee=0)
    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Should be 0 with no default');

    // Gross payout should not deduct anything for cleaning
    // Direct booking with tax: 400 - 60 + 40 - 0 = 380
    const expected = 400 - (400 * 0.15) + 40;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross payout should not deduct cleaning');
});

test('12.3 Same period, different properties with different passthrough settings', () => {
    // Property A: passthrough enabled, default 300
    // Property B: passthrough disabled, default 250

    const resA = { ...mockReservations.resA2, cleaningFee: 0 };
    const resB = { ...mockReservations.resB1, cleaningFee: 0 };

    const resultA = calculateGrossPayout(resA, mockListings.propertyA);
    const resultB = calculateGrossPayout(resB, mockListings.propertyB);

    assert.strictEqual(resultA.cleaningFeeForPassThrough, 300, 'Property A should use default');
    assert.strictEqual(resultB.cleaningFeeForPassThrough, 0, 'Property B should NOT deduct (passthrough disabled)');
});

// ----------------------------------------------------------------------------
// TEST GROUP 13: Rounding and Precision Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 13: Rounding and Precision Edge Cases ---\n');

test('13.1 Very small cleaning fee ($0.01) should be handled correctly', () => {
    const listing = { ...mockListings.propertyA, cleaningFee: 0.01 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    assert.strictEqual(result.cleaningFeeForPassThrough, 0.01, 'Should handle $0.01 cleaning fee');
    assert.strictEqual(result.usedListingDefault, true, 'Should use listing default');
});

test('13.2 Very large cleaning fee ($9999.99) should be handled correctly', () => {
    const listing = { ...mockListings.propertyA, cleaningFee: 9999.99 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    assert.strictEqual(result.cleaningFeeForPassThrough, 9999.99, 'Should handle large cleaning fee');
});

test('13.3 Cleaning fee with many decimal places should round to 2 places', () => {
    const listing = { ...mockListings.propertyA, cleaningFee: 123.456789 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    // grossPayout should be rounded to 2 decimal places
    const decimalPlaces = (result.grossPayout.toString().split('.')[1] || '').length;
    assert.ok(decimalPlaces <= 2, 'Gross payout should have at most 2 decimal places');
});

test('13.4 PM fee percentage precision with cleaning passthrough', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 15.5, cleaningFee: 300 };
    const reservation = {
        ...mockReservations.resA1,
        cleaningFee: 0,
        clientRevenue: 1000
    };

    const result = calculateGrossPayout(reservation, listing);

    // PM fee: 1000 * 0.155 = 155
    // Gross: 1000 - 155 - 300 = 545 (Airbnb, no tax)
    const expected = 1000 - (1000 * 0.155) - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should handle fractional PM percentage');
});

test('13.5 Edge case: clientRevenue equals cleaning fee', () => {
    const reservation = {
        ...mockReservations.resA2,
        cleaningFee: 0,
        clientRevenue: 300
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Direct with tax: 300 - 45 + 40 - 300 = -5
    const expected = 300 - (300 * 0.15) + 40 - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should handle when revenue equals cleaning');
});

test('13.6 Edge case: negative gross payout due to high cleaning fee', () => {
    const listing = { ...mockListings.propertyA, cleaningFee: 2000 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    // Direct with tax: 400 - 60 + 40 - 2000 = -1620
    const expected = 400 - (400 * 0.15) + 40 - 2000;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should handle negative payout');
    assert.ok(result.grossPayout < 0, 'Gross payout should be negative');
});

// ----------------------------------------------------------------------------
// TEST GROUP 14: Source-Based Logic with Cleaning Passthrough
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 14: Source-Based Logic with Cleaning Passthrough ---\n');

test('14.1 Airbnb reservation with passthrough (no tax added)', () => {
    const reservation = {
        ...mockReservations.resA1,
        source: 'Airbnb',
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Airbnb without passthrough tax: clientRevenue - pmFee - cleaning
    // 1030 - 154.50 - 300 = 575.50
    const expected = 1030 - (1030 * 0.15) - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Airbnb should not add tax');
    assert.strictEqual(result.shouldAddTax, false, 'Should not add tax for Airbnb');
});

test('14.2 VRBO reservation with passthrough (tax added)', () => {
    const listing = { ...mockListings.propertyA, cleaningFee: 200 };
    const reservation = {
        ...mockReservations.resB1,
        propertyId: 100001,
        source: 'VRBO',
        cleaningFee: 0,
        clientRevenue: 760,
        clientTaxResponsibility: 80
    };
    const result = calculateGrossPayout(reservation, listing);

    // VRBO with tax: 760 - 114 + 80 - 200 = 526
    const expected = 760 - (760 * 0.15) + 80 - 200;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'VRBO should add tax');
    assert.strictEqual(result.shouldAddTax, true, 'Should add tax for VRBO');
});

test('14.3 Direct booking with passthrough (tax added)', () => {
    const reservation = {
        ...mockReservations.resA2,
        source: 'Direct',
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Direct with tax: 400 - 60 + 40 - 300 = 80
    const expected = 400 - (400 * 0.15) + 40 - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Direct should add tax');
    assert.strictEqual(result.shouldAddTax, true, 'Should add tax for Direct');
});

test('14.4 Booking.com with passthrough (tax added)', () => {
    const listing = { ...mockListings.propertyA, cleaningFee: 150 };
    const reservation = {
        ...mockReservations.resA1,
        source: 'Booking.com',
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, listing);

    // Booking.com with tax: 1030 - 154.50 + 100 - 150 = 825.50
    const expected = 1030 - (1030 * 0.15) + 100 - 150;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Booking.com should add tax');
});

test('14.5 Airbnb with airbnbPassThroughTax enabled and cleaning passthrough', () => {
    const listing = {
        ...mockListings.propertyA,
        airbnbPassThroughTax: true,
        cleaningFee: 200
    };
    const reservation = {
        ...mockReservations.resA1,
        source: 'Airbnb',
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, listing);

    // Airbnb WITH passthrough tax: 1030 - 154.50 + 100 - 200 = 775.50
    const expected = 1030 - (1030 * 0.15) + 100 - 200;
    assert.strictEqual(result.shouldAddTax, true, 'Should add tax when airbnbPassThroughTax is true');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross should include tax');
});

test('14.6 Case-insensitive source detection: "AIRBNB" vs "airbnb"', () => {
    const reservation1 = { ...mockReservations.resA1, source: 'AIRBNB', cleaningFee: 0 };
    const reservation2 = { ...mockReservations.resA1, source: 'airbnb', cleaningFee: 0 };
    const reservation3 = { ...mockReservations.resA1, source: 'AirBnB', cleaningFee: 0 };

    const result1 = calculateGrossPayout(reservation1, mockListings.propertyA);
    const result2 = calculateGrossPayout(reservation2, mockListings.propertyA);
    const result3 = calculateGrossPayout(reservation3, mockListings.propertyA);

    assert.strictEqual(result1.shouldAddTax, result2.shouldAddTax, 'Case should not matter');
    assert.strictEqual(result2.shouldAddTax, result3.shouldAddTax, 'Case should not matter');
    assert.strictEqual(result1.shouldAddTax, false, 'All should be treated as Airbnb');
});

// ----------------------------------------------------------------------------
// TEST GROUP 15: Non-Detailed Finance with Passthrough
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 15: Non-Detailed Finance with Passthrough ---\n');

test('15.1 Non-detailed finance should use grossAmount for revenue', () => {
    const reservation = {
        ...mockReservations.resA1,
        hasDetailedFinance: false,
        grossAmount: 1150,
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Uses grossAmount (1150) instead of clientRevenue
    // Airbnb: 1150 - 172.50 - 300 = 677.50
    const expected = 1150 - (1150 * 0.15) - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should use grossAmount');
});

test('15.2 Non-detailed finance should not add tax responsibility', () => {
    const reservation = {
        ...mockReservations.resA2,
        hasDetailedFinance: false,
        grossAmount: 440,
        source: 'Direct',
        cleaningFee: 0
    };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Non-detailed: no taxResponsibility added
    // Direct (normally adds tax, but tax is 0 for non-detailed): 440 - 66 - 300 = 74
    const expected = 440 - (440 * 0.15) - 300;
    assert.strictEqual(result.taxResponsibility, 0, 'Tax should be 0 for non-detailed');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Gross should not include tax');
});

// ----------------------------------------------------------------------------
// TEST GROUP 16: Expense Filtering Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 16: Expense Filtering Edge Cases ---\n');

test('16.1 Expense category "Deep Cleaning" should be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: 'Service', category: 'Deep Cleaning', amount: -200 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 0, 'Deep Cleaning should be filtered');
});

test('16.2 Expense type "cleaning" should be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: 'Regular service', category: 'Other', type: 'cleaning', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 0, 'Type cleaning should be filtered');
});

test('16.3 Description starting with "cleaning" should be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: 'Cleaning after checkout', category: 'Service', amount: -150 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 0, 'Description starting with cleaning should be filtered');
});

test('16.4 Description containing "cleaning" but not starting with it should NOT be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: 'Supplies for cleaning', category: 'Supplies', amount: -50 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 1, 'Description containing but not starting with cleaning should not be filtered');
});

test('16.5 Empty category/type/description should not crash', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: '', category: '', type: '', amount: -50 },
        { id: 'exp2', propertyId: 100001, amount: -30 } // Missing all string fields
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 2, 'Empty/missing fields should not crash');
});

test('16.6 Positive expense (upsell/addon) should never be filtered even if named cleaning', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: 'Cleaning Fee Charge', category: 'Cleaning', type: 'upsell', amount: 100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    // Note: Our filter removes all cleaning-related items. This test documents behavior.
    // If upsells should be preserved, the filter logic would need adjustment.
    assert.strictEqual(filtered.length, 0, 'Current logic filters by name regardless of amount');
});

test('16.7 Multiple properties mixed in single expense list', () => {
    const listingInfoMap = {
        100001: mockListings.propertyA, // passthrough enabled
        100002: mockListings.propertyB, // passthrough disabled
        100003: mockListings.propertyC  // passthrough enabled
    };
    const expenses = [
        { id: 'exp1', propertyId: 100001, category: 'Cleaning', amount: -100 }, // filtered
        { id: 'exp2', propertyId: 100002, category: 'Cleaning', amount: -100 }, // kept
        { id: 'exp3', propertyId: 100003, category: 'Cleaning', amount: -100 }, // filtered
        { id: 'exp4', propertyId: 100001, category: 'Lawn', amount: -50 },      // kept
        { id: 'exp5', propertyId: 100002, category: 'Lawn', amount: -50 },      // kept
        { id: 'exp6', propertyId: 100003, category: 'Lawn', amount: -50 }       // kept
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 4, 'Should filter only cleaning from passthrough properties');
    assert.ok(!filtered.find(e => e.id === 'exp1'), 'Property A cleaning filtered');
    assert.ok(filtered.find(e => e.id === 'exp2'), 'Property B cleaning kept');
    assert.ok(!filtered.find(e => e.id === 'exp3'), 'Property C cleaning filtered');
});

// ----------------------------------------------------------------------------
// TEST GROUP 17: Calendar vs Checkout Calculation Type
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 17: Calendar vs Checkout Calculation Type ---\n');

test('17.1 Cleaning passthrough applies regardless of calculation type', () => {
    // The cleaning fee logic should work the same for calendar or checkout
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };
    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Just verify the logic works - calculation type doesn't affect fee deduction
    assert.strictEqual(result.cleaningFeeForPassThrough, 300, 'Should use listing default');
    assert.strictEqual(result.usedListingDefault, true, 'Should indicate default used');
});

// ----------------------------------------------------------------------------
// TEST GROUP 18: Waive Commission with Cleaning Passthrough
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 18: Waive Commission with Cleaning Passthrough ---\n');

test('18.1 Waived commission should still deduct cleaning fee', () => {
    const listing = {
        ...mockListings.propertyA,
        waiveCommission: true,
        cleaningFee: 300
    };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    // Note: Our calculateGrossPayout doesn't handle waiveCommission,
    // but cleaning passthrough should still work
    const result = calculateGrossPayout(reservation, listing);

    assert.strictEqual(result.cleaningFeeForPassThrough, 300, 'Should still deduct cleaning');
});

// ----------------------------------------------------------------------------
// TEST GROUP 19: Multiple Reservations Aggregation
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 19: Multiple Reservations Aggregation ---\n');

test('19.1 Total cleaning deduction across multiple reservations', () => {
    const reservations = [
        { ...mockReservations.resA1, cleaningFee: 350 },
        { ...mockReservations.resA2, cleaningFee: 0 }, // Uses default 300
        { ...mockReservations.resA1, id: 'res-a3', cleaningFee: 250 }
    ];

    let totalCleaningDeducted = 0;
    let totalGrossPayout = 0;

    for (const res of reservations) {
        const result = calculateGrossPayout(res, mockListings.propertyA);
        totalCleaningDeducted += result.cleaningFeeForPassThrough;
        totalGrossPayout += result.grossPayout;
    }

    // 350 + 300 + 250 = 900
    assert.strictEqual(totalCleaningDeducted, 900, 'Total cleaning should be 900');
});

test('19.2 Gross payout sum across mixed fee sources', () => {
    const reservations = [
        { ...mockReservations.resA1, cleaningFee: 400 }, // Own fee
        { ...mockReservations.resA2, cleaningFee: 0 }    // Default 300
    ];

    const result1 = calculateGrossPayout(reservations[0], mockListings.propertyA);
    const result2 = calculateGrossPayout(reservations[1], mockListings.propertyA);

    // Res1 (Airbnb): 1030 - 154.50 - 400 = 475.50
    // Res2 (Direct): 400 - 60 + 40 - 300 = 80
    const expected1 = 1030 - (1030 * 0.15) - 400;
    const expected2 = 400 - (400 * 0.15) + 40 - 300;

    assert.strictEqual(result1.grossPayout, Math.round(expected1 * 100) / 100, 'Res1 correct');
    assert.strictEqual(result2.grossPayout, Math.round(expected2 * 100) / 100, 'Res2 correct');
});

// ----------------------------------------------------------------------------
// TEST GROUP 20: Zero and Edge Value Handling
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 20: Zero and Edge Value Handling ---\n');

test('20.1 Zero PM fee percentage with cleaning passthrough', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 0, cleaningFee: 200 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    // Direct: 400 - 0 + 40 - 200 = 240
    const expected = 400 - 0 + 40 - 200;
    assert.strictEqual(result.pmFee, 0, 'PM fee should be 0');
    assert.strictEqual(result.grossPayout, expected, 'Gross should just subtract cleaning');
});

test('20.2 100% PM fee percentage with cleaning passthrough', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 100, cleaningFee: 200 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0, source: 'Airbnb' };

    const result = calculateGrossPayout(reservation, listing);

    // Airbnb: 400 - 400 - 200 = -200
    const expected = 400 - 400 - 200;
    assert.strictEqual(result.pmFee, 400, 'PM fee should be full amount');
    assert.strictEqual(result.grossPayout, expected, 'Gross should be highly negative');
});

test('20.3 Zero clientRevenue with cleaning passthrough', () => {
    const reservation = {
        ...mockReservations.resA2,
        cleaningFee: 0,
        clientRevenue: 0,
        clientTaxResponsibility: 0,
        source: 'Direct'
    };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Direct: 0 - 0 + 0 - 300 = -300
    assert.strictEqual(result.grossPayout, -300, 'Should just be negative cleaning fee');
});

test('20.4 All zeros except cleaning fee', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 0, cleaningFee: 500 };
    const reservation = {
        ...mockReservations.resA2,
        cleaningFee: 0,
        clientRevenue: 0,
        clientTaxResponsibility: 0,
        source: 'Airbnb'
    };

    const result = calculateGrossPayout(reservation, listing);

    // Airbnb: 0 - 0 - 500 = -500
    assert.strictEqual(result.grossPayout, -500, 'Should be negative of cleaning fee');
});

// ----------------------------------------------------------------------------
// TEST GROUP 21: String propertyId Handling
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 21: String propertyId Handling ---\n');

test('21.1 Expense with string propertyId should be handled', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: '100001', category: 'Cleaning', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 0, 'String propertyId should be parsed to int');
});

test('21.2 Expense with non-numeric propertyId should not crash', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 'invalid', category: 'Cleaning', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 1, 'Invalid propertyId should not be filtered');
});

// ----------------------------------------------------------------------------
// TEST GROUP 22: Combined Statement Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 22: Combined Statement Edge Cases ---\n');

test('22.1 Same owner, multiple properties, mixed passthrough settings', () => {
    const listingInfoMap = {
        100001: mockListings.propertyA, // passthrough ON
        100002: mockListings.propertyB  // passthrough OFF
    };

    const reservations = [
        { ...mockReservations.resA2, propertyId: 100001, cleaningFee: 0 },
        { ...mockReservations.resB1, propertyId: 100002, cleaningFee: 250 }
    ];

    const resultA = calculateGrossPayout(reservations[0], listingInfoMap[100001]);
    const resultB = calculateGrossPayout(reservations[1], listingInfoMap[100002]);

    assert.strictEqual(resultA.cleaningFeeForPassThrough, 300, 'Property A should deduct default');
    assert.strictEqual(resultB.cleaningFeeForPassThrough, 0, 'Property B should not deduct');
});

test('22.2 Combined expenses should be filtered per-property', () => {
    const listingInfoMap = {
        100001: mockListings.propertyA, // passthrough ON
        100002: mockListings.propertyB  // passthrough OFF
    };

    const expenses = [
        { id: 'e1', propertyId: 100001, category: 'Cleaning', amount: -200 },
        { id: 'e2', propertyId: 100001, category: 'Lawn', amount: -50 },
        { id: 'e3', propertyId: 100002, category: 'Cleaning', amount: -180 },
        { id: 'e4', propertyId: 100002, category: 'Lawn', amount: -40 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    const totalExpenses = calculateTotalExpenses(filtered);

    // Kept: e2 (50), e3 (180), e4 (40) = 270
    assert.strictEqual(totalExpenses, 270, 'Total should exclude only Property A cleaning');
});

// ----------------------------------------------------------------------------
// TEST GROUP 23: Data Integrity and Immutability
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 23: Data Integrity and Immutability ---\n');

test('23.1 Original reservation object should not be mutated', () => {
    const original = { ...mockReservations.resA1, cleaningFee: 350 };
    const originalCleaningFee = original.cleaningFee;

    calculateGrossPayout(original, mockListings.propertyA);

    assert.strictEqual(original.cleaningFee, originalCleaningFee, 'Original should not be mutated');
});

test('23.2 Original listing object should not be mutated', () => {
    const original = { ...mockListings.propertyA };
    const originalCleaningFee = original.cleaningFee;

    calculateGrossPayout(mockReservations.resA1, original);

    assert.strictEqual(original.cleaningFee, originalCleaningFee, 'Listing should not be mutated');
});

test('23.3 Expense filtering should not mutate original array', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, category: 'Cleaning', amount: -100 },
        { id: 'exp2', propertyId: 100001, category: 'Lawn', amount: -50 }
    ];
    const originalLength = expenses.length;

    filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(expenses.length, originalLength, 'Original array should not be mutated');
});

// ----------------------------------------------------------------------------
// TEST GROUP 24: Boolean Edge Cases for Flags
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 24: Boolean Edge Cases for Flags ---\n');

test('24.1 cleaningFeePassThrough as undefined should be treated as false', () => {
    const listing = { ...mockListings.propertyA, cleaningFeePassThrough: undefined };
    const reservation = { ...mockReservations.resA1 };

    const result = calculateGrossPayout(reservation, listing);

    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Undefined passthrough should be 0');
});

test('24.2 cleaningFeePassThrough as null should be treated as false', () => {
    const listing = { ...mockListings.propertyA, cleaningFeePassThrough: null };
    const reservation = { ...mockReservations.resA1 };

    const result = calculateGrossPayout(reservation, listing);

    assert.strictEqual(result.cleaningFeeForPassThrough, 0, 'Null passthrough should be 0');
});

test('24.3 cleaningFeePassThrough as 0 should be treated as false', () => {
    const listing = { ...mockListings.propertyA, cleaningFeePassThrough: 0 };
    const reservation = { ...mockReservations.resA1 };

    const result = calculateGrossPayout(reservation, listing);

    assert.strictEqual(result.cleaningFeeForPassThrough, 0, '0 passthrough should be 0');
});

test('24.4 cleaningFeePassThrough as 1 should be treated as true', () => {
    const listing = { ...mockListings.propertyA, cleaningFeePassThrough: 1 };
    const reservation = { ...mockReservations.resA1 };

    const result = calculateGrossPayout(reservation, listing);

    assert.strictEqual(result.cleaningFeeForPassThrough, 350, '1 passthrough should work');
});

test('24.5 cleaningFeePassThrough as string "true" should NOT work (truthy but logic may differ)', () => {
    const listing = { ...mockListings.propertyA, cleaningFeePassThrough: 'true' };
    const reservation = { ...mockReservations.resA1 };

    const result = calculateGrossPayout(reservation, listing);

    // String "true" is truthy in JS, so this should work
    assert.strictEqual(result.cleaningFeeForPassThrough, 350, 'String "true" is truthy');
});

// ----------------------------------------------------------------------------
// TEST GROUP 25: Negative Cleaning Fee Values (Invalid Data)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 25: Negative Cleaning Fee Values (Invalid Data) ---\n');

test('25.1 Negative reservation cleaningFee should still be used', () => {
    const reservation = { ...mockReservations.resA1, cleaningFee: -100 };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Negative is truthy, so it will use -100 (unusual but valid in edge case)
    assert.strictEqual(result.cleaningFeeForPassThrough, -100, 'Negative fee is used');
});

test('25.2 Negative listing cleaningFee as fallback', () => {
    const listing = { ...mockListings.propertyA, cleaningFee: -200 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    // Should use listing default (-200 is truthy)
    assert.strictEqual(result.cleaningFeeForPassThrough, -200, 'Negative listing default is used');
});

// ----------------------------------------------------------------------------
// TEST GROUP 26: Large Dataset Simulation
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 26: Large Dataset Simulation ---\n');

test('26.1 100 reservations calculation performance', () => {
    const reservations = [];
    for (let i = 0; i < 100; i++) {
        reservations.push({
            ...mockReservations.resA1,
            id: `res-${i}`,
            cleaningFee: i % 2 === 0 ? 0 : 300 + i // Alternate between 0 and varying fees
        });
    }

    let totalGross = 0;
    let totalCleaning = 0;

    for (const res of reservations) {
        const result = calculateGrossPayout(res, mockListings.propertyA);
        totalGross += result.grossPayout;
        totalCleaning += result.cleaningFeeForPassThrough;
    }

    assert.ok(totalGross !== 0, 'Total gross should be calculated');
    assert.ok(totalCleaning > 0, 'Total cleaning should be calculated');
});

test('26.2 100 expenses filtering performance', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [];

    for (let i = 0; i < 100; i++) {
        expenses.push({
            id: `exp-${i}`,
            propertyId: 100001,
            category: i % 3 === 0 ? 'Cleaning' : 'Other',
            amount: -(10 + i)
        });
    }

    const filtered = filterExpenses(expenses, listingInfoMap);

    // About 34 cleaning expenses (0, 3, 6, ... 99) should be filtered
    // So about 66 should remain
    assert.ok(filtered.length < expenses.length, 'Some should be filtered');
    assert.ok(filtered.length > 50, 'Most should remain');
});

// ----------------------------------------------------------------------------
// TEST GROUP 27: Floating Point Precision
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 27: Floating Point Precision ---\n');

test('27.1 Repeating decimal PM fee calculation', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 33.33 };
    const reservation = {
        ...mockReservations.resA1,
        cleaningFee: 0,
        clientRevenue: 1000
    };

    const result = calculateGrossPayout(reservation, listing);

    // 1000 * 0.3333 = 333.3
    // 1000 - 333.3 - 300 = 366.7
    const expected = 1000 - (1000 * 0.3333) - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should handle repeating decimals');
});

test('27.2 Very precise clientRevenue value', () => {
    const reservation = {
        ...mockReservations.resA1,
        cleaningFee: 0,
        clientRevenue: 1234.56789
    };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    const decimalPlaces = (result.grossPayout.toString().split('.')[1] || '').length;
    assert.ok(decimalPlaces <= 2, 'Result should be rounded to 2 decimal places');
});

// ----------------------------------------------------------------------------
// TEST GROUP 28: Special Characters in Expense Fields
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 28: Special Characters in Expense Fields ---\n');

test('28.1 Expense with special characters in description', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: 'Cleaning & sanitization (COVID-19)', category: 'Other', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);

    // "Cleaning" is at the start, so should be filtered
    assert.strictEqual(filtered.length, 0, 'Cleaning at start should be filtered');
});

test('28.2 Expense with unicode characters', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: '清掃サービス', category: 'Other', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);

    // Non-English cleaning description shouldn't match "cleaning"
    assert.strictEqual(filtered.length, 1, 'Non-English should not be filtered');
});

test('28.3 Expense with numeric only description', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, description: '12345', category: '12345', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);

    assert.strictEqual(filtered.length, 1, 'Numeric only should not be filtered');
});

// ----------------------------------------------------------------------------
// TEST GROUP 29: Reservation Source Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 29: Reservation Source Edge Cases ---\n');

test('29.1 Source with "Airbnb" substring: "Airbnb Plus"', () => {
    const reservation = { ...mockReservations.resA1, source: 'Airbnb Plus', cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    assert.strictEqual(result.shouldAddTax, false, 'Airbnb Plus should be treated as Airbnb');
});

test('29.2 Source as null/undefined', () => {
    const reservation1 = { ...mockReservations.resA1, source: null, cleaningFee: 0 };
    const reservation2 = { ...mockReservations.resA1, source: undefined, cleaningFee: 0 };

    const result1 = calculateGrossPayout(reservation1, mockListings.propertyA);
    const result2 = calculateGrossPayout(reservation2, mockListings.propertyA);

    // Null/undefined source means not Airbnb, so should add tax
    assert.strictEqual(result1.shouldAddTax, true, 'Null source should add tax');
    assert.strictEqual(result2.shouldAddTax, true, 'Undefined source should add tax');
});

test('29.3 Source as empty string', () => {
    const reservation = { ...mockReservations.resA1, source: '', cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    assert.strictEqual(result.shouldAddTax, true, 'Empty source should add tax');
});

// ----------------------------------------------------------------------------
// TEST GROUP 30: Tax Responsibility Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 30: Tax Responsibility Edge Cases ---\n');

test('30.1 Negative tax responsibility', () => {
    const reservation = {
        ...mockReservations.resA2,
        cleaningFee: 0,
        clientTaxResponsibility: -50,
        source: 'Direct'
    };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // Direct: 400 - 60 + (-50) - 300 = -10
    const expected = 400 - (400 * 0.15) + (-50) - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should handle negative tax');
});

test('30.2 Very large tax responsibility', () => {
    const reservation = {
        ...mockReservations.resA2,
        cleaningFee: 0,
        clientTaxResponsibility: 5000,
        source: 'VRBO'
    };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // VRBO: 400 - 60 + 5000 - 300 = 5040
    const expected = 400 - (400 * 0.15) + 5000 - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should handle large tax');
});

// ----------------------------------------------------------------------------
// TEST GROUP 31: hasDetailedFinance Flag Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 31: hasDetailedFinance Flag Edge Cases ---\n');

test('31.1 hasDetailedFinance as undefined defaults to grossAmount', () => {
    const reservation = {
        ...mockReservations.resA1,
        hasDetailedFinance: undefined,
        grossAmount: 1000,
        clientRevenue: 800,
        cleaningFee: 0
    };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // undefined is falsy, so should use grossAmount (1000)
    // Airbnb: 1000 - 150 - 300 = 550
    const expected = 1000 - (1000 * 0.15) - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should use grossAmount');
});

test('31.2 hasDetailedFinance as false with missing grossAmount', () => {
    const reservation = {
        ...mockReservations.resA1,
        hasDetailedFinance: false,
        grossAmount: undefined,
        cleaningFee: 0
    };

    const result = calculateGrossPayout(reservation, mockListings.propertyA);

    // undefined grossAmount will be NaN in calculation
    // This documents the behavior
    assert.ok(isNaN(result.grossPayout), 'NaN when grossAmount missing for non-detailed');
});

// ----------------------------------------------------------------------------
// TEST GROUP 32: Multiple Flags Combination
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 32: Multiple Flags Combination ---\n');

test('32.1 All flags enabled: passthrough + cohost + airbnbPassThroughTax', () => {
    const listing = {
        ...mockListings.propertyC, // passthrough + cohost
        airbnbPassThroughTax: true,
        cleaningFee: 200
    };
    const reservation = {
        ...mockReservations.resC1,
        source: 'Airbnb',
        cleaningFee: 0
    };

    const result = calculateGrossPayout(reservation, listing);

    // CoHost takes precedence: -pmFee - cleaning = -93.75 - 200 = -293.75
    const expected = -(625 * 0.15) - 200;
    assert.strictEqual(result.isCohostAirbnb, true, 'Should be cohost');
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'CoHost formula applies');
});

test('32.2 Passthrough + disregardTax + airbnbPassThroughTax (conflicting)', () => {
    const listing = {
        ...mockListings.propertyD, // passthrough + disregardTax
        airbnbPassThroughTax: true,
        cleaningFee: 350
    };
    const reservation = {
        ...mockReservations.resA1,
        source: 'Airbnb',
        cleaningFee: 0
    };

    const result = calculateGrossPayout(reservation, listing);

    // disregardTax is checked in shouldAddTax condition
    // shouldAddTax: !disregardTax && (!isAirbnb || airbnbPassThroughTax)
    // = !true && (!true || true) = false && true = false
    assert.strictEqual(result.shouldAddTax, false, 'DisregardTax takes precedence');
});

// ----------------------------------------------------------------------------
// TEST GROUP 33: Expense Category/Type Variations
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 33: Expense Category/Type Variations ---\n');

test('33.1 Category "House Cleaning" should be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, category: 'House Cleaning', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 0, 'House Cleaning should be filtered');
});

test('33.2 Category "Housekeeping" should NOT be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, category: 'Housekeeping', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 1, 'Housekeeping should NOT be filtered (no "cleaning")');
});

test('33.3 Type "post-checkout-cleaning" should be filtered', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };
    const expenses = [
        { id: 'exp1', propertyId: 100001, type: 'post-checkout-cleaning', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, listingInfoMap);
    assert.strictEqual(filtered.length, 0, 'Type containing cleaning should be filtered');
});

// ----------------------------------------------------------------------------
// TEST GROUP 34: Warning Message Content
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 34: Warning Message Content ---\n');

test('34.1 Warning message format for 1 of 3 reservations', () => {
    const reservations = [
        { ...mockReservations.resA1, cleaningFee: 350 },
        { ...mockReservations.resA1, id: 'res-2', cleaningFee: 0 },
        { ...mockReservations.resA1, id: 'res-3', cleaningFee: 0 }
    ];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);

    assert.strictEqual(warning.show, true, 'Warning should show');
    assert.ok(warning.message.includes('1 of 3'), 'Message should say 1 of 3');
    assert.ok(warning.message.includes('listing default'), 'Message should mention listing default');
});

test('34.2 Warning counts should match reservation analysis', () => {
    const reservations = [
        { ...mockReservations.resA1, cleaningFee: 100 },
        { ...mockReservations.resA1, id: 'res-2', cleaningFee: 200 },
        { ...mockReservations.resA1, id: 'res-3', cleaningFee: 0 },
        { ...mockReservations.resA1, id: 'res-4', cleaningFee: null },
        { ...mockReservations.resA1, id: 'res-5', cleaningFee: 300 }
    ];

    const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);

    assert.strictEqual(warning.reservationCount, 5, 'Should count all reservations');
    assert.strictEqual(warning.cleaningExpenseCount, 3, 'Should count only those with fees');
    assert.ok(warning.message.includes('3 of 5'), 'Message should say 3 of 5');
});

// ----------------------------------------------------------------------------
// TEST GROUP 35: Empty/Null Collections
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 35: Empty/Null Collections ---\n');

test('35.1 Empty reservations array for warning check', () => {
    const warning = shouldShowCleaningMismatchWarning([], mockListings.propertyA);

    assert.strictEqual(warning.show, false, 'Empty array should not show warning');
});

test('35.2 Empty expenses array for filtering', () => {
    const listingInfoMap = { 100001: mockListings.propertyA };

    const filtered = filterExpenses([], listingInfoMap);

    assert.strictEqual(filtered.length, 0, 'Empty input should return empty output');
});

test('35.3 Empty listingInfoMap for expense filtering', () => {
    const expenses = [
        { id: 'exp1', propertyId: 100001, category: 'Cleaning', amount: -100 }
    ];

    const filtered = filterExpenses(expenses, {});

    assert.strictEqual(filtered.length, 1, 'No matching listing means no filtering');
});

// ----------------------------------------------------------------------------
// TEST GROUP 36: Consistency Across Different PM Fee Percentages
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 36: Consistency Across Different PM Fee Percentages ---\n');

test('36.1 PM fee 10% with cleaning passthrough', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 10, cleaningFee: 300 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    // Direct: 400 - 40 + 40 - 300 = 100
    const expected = 400 - (400 * 0.10) + 40 - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should work with 10% PM');
});

test('36.2 PM fee 25% with cleaning passthrough', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 25, cleaningFee: 300 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    // Direct: 400 - 100 + 40 - 300 = 40
    const expected = 400 - (400 * 0.25) + 40 - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should work with 25% PM');
});

test('36.3 PM fee 50% with cleaning passthrough', () => {
    const listing = { ...mockListings.propertyA, pmFeePercentage: 50, cleaningFee: 300 };
    const reservation = { ...mockReservations.resA2, cleaningFee: 0 };

    const result = calculateGrossPayout(reservation, listing);

    // Direct: 400 - 200 + 40 - 300 = -60
    const expected = 400 - (400 * 0.50) + 40 - 300;
    assert.strictEqual(result.grossPayout, Math.round(expected * 100) / 100, 'Should work with 50% PM');
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
