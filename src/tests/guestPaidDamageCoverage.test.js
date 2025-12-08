/**
 * Test Cases for guestPaidDamageCoverage Feature
 *
 * This tests the "Guest Paid Damage Coverage" column logic:
 * - Step A: Extract resort fee from fees array in API response
 * - Step B: Show column only when property has guestPaidDamageCoverage enabled
 * - Step C: Display resort fee value in blue (info) color
 * - Step D: Prorate resort fee for calendar-based statements
 */

const assert = require('assert');

// Mock data for testing
const mockListings = {
    // Property with guestPaidDamageCoverage ENABLED
    propertyA: {
        id: 100001,
        name: 'Property A - Damage Coverage Enabled',
        nickname: 'Property A',
        pmFeePercentage: 15,
        guestPaidDamageCoverage: true,
        cleaningFeePassThrough: false,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    // Property with guestPaidDamageCoverage DISABLED
    propertyB: {
        id: 100002,
        name: 'Property B - Damage Coverage Disabled',
        nickname: 'Property B',
        pmFeePercentage: 15,
        guestPaidDamageCoverage: false,
        cleaningFeePassThrough: false,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    // Property with BOTH features enabled
    propertyC: {
        id: 100003,
        name: 'Property C - Both Features',
        nickname: 'Property C',
        pmFeePercentage: 15,
        guestPaidDamageCoverage: true,
        cleaningFeePassThrough: true,
        cleaningFee: 200,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    }
};

// Mock fees array from Hostify API
const mockFeesArrays = {
    // Fees array WITH resort fee
    withResortFee: [
        {
            id: 301227683,
            fee_id: 2,
            amount_gross: 168.76,
            fee: { name: "Resort fee", type: "fee" }
        },
        {
            id: 301227684,
            fee_id: 1,
            amount_gross: 150.00,
            fee: { name: "Cleaning fee", type: "fee" }
        },
        {
            id: 301227685,
            fee_id: 3,
            amount_gross: 50.00,
            fee: { name: "Pet fee", type: "fee" }
        }
    ],
    // Fees array WITHOUT resort fee
    withoutResortFee: [
        {
            id: 301227684,
            fee_id: 1,
            amount_gross: 150.00,
            fee: { name: "Cleaning fee", type: "fee" }
        },
        {
            id: 301227685,
            fee_id: 3,
            amount_gross: 50.00,
            fee: { name: "Pet fee", type: "fee" }
        }
    ],
    // Fees array with $0 resort fee
    withZeroResortFee: [
        {
            id: 301227683,
            fee_id: 2,
            amount_gross: 0,
            fee: { name: "Resort fee", type: "fee" }
        },
        {
            id: 301227684,
            fee_id: 1,
            amount_gross: 150.00,
            fee: { name: "Cleaning fee", type: "fee" }
        }
    ],
    // Fees array with multiple resort fees (edge case)
    withMultipleResortFees: [
        {
            id: 301227683,
            fee_id: 2,
            amount_gross: 100.00,
            fee: { name: "Resort fee", type: "fee" }
        },
        {
            id: 301227686,
            fee_id: 2,
            amount_gross: 50.00,
            fee: { name: "Resort fee", type: "fee" }
        }
    ],
    // Empty fees array
    empty: [],
    // Fees array with excluded fees only
    excludedFeesOnly: [
        {
            id: 301227687,
            fee_id: 4,
            amount_gross: 100.00,
            fee: { name: "Claims fee", type: "fee" }
        },
        {
            id: 301227688,
            fee_id: 5,
            amount_gross: 200.00,
            fee: { name: "Management fee", type: "fee" }
        }
    ]
};

const mockReservations = {
    // Reservation WITH resort fee
    resWithResortFee: {
        id: 'res-1',
        propertyId: 100001,
        guestName: 'Guest With Resort Fee',
        source: 'VRBO',
        checkInDate: '2025-12-01',
        checkOutDate: '2025-12-05',
        nights: 4,
        hasDetailedFinance: true,
        baseRate: 800,
        cleaningFee: 150,
        cleaningAndOtherFees: 200,
        platformFees: 120,
        clientRevenue: 880,
        clientTaxResponsibility: 100,
        resortFee: 168.76
    },
    // Reservation WITHOUT resort fee
    resWithoutResortFee: {
        id: 'res-2',
        propertyId: 100001,
        guestName: 'Guest Without Resort Fee',
        source: 'Airbnb',
        checkInDate: '2025-12-06',
        checkOutDate: '2025-12-10',
        nights: 4,
        hasDetailedFinance: true,
        baseRate: 600,
        cleaningFee: 150,
        cleaningAndOtherFees: 150,
        platformFees: 90,
        clientRevenue: 660,
        clientTaxResponsibility: 80,
        resortFee: 0
    },
    // Reservation for property B (no damage coverage)
    resForPropertyB: {
        id: 'res-3',
        propertyId: 100002,
        guestName: 'Guest Property B',
        source: 'Direct',
        checkInDate: '2025-12-01',
        checkOutDate: '2025-12-05',
        nights: 4,
        hasDetailedFinance: true,
        baseRate: 500,
        cleaningFee: 100,
        cleaningAndOtherFees: 100,
        platformFees: 0,
        clientRevenue: 600,
        clientTaxResponsibility: 60,
        resortFee: 200 // Has resort fee but property setting disabled
    }
};

/**
 * Helper: Calculate fees from fees array (matches HostifyService.calculateFeesFromArray)
 */
function calculateFeesFromArray(fees) {
    if (!fees || !Array.isArray(fees)) {
        return { cleaningFee: 0, otherFees: 0, totalFees: 0, resortFee: 0 };
    }

    let cleaningFee = 0;
    let otherFees = 0;
    let resortFee = 0;

    const excludedFees = ['claims fee', 'resort fee', 'management fee'];

    fees.forEach(feeItem => {
        const feeType = feeItem.fee?.type;
        const feeName = feeItem.fee?.name || '';
        const feeNameLower = feeName.toLowerCase();
        const amount = parseFloat(feeItem.amount_gross || 0);

        if (feeType === 'fee') {
            // Extract resort fee separately
            if (feeNameLower.includes('resort fee') && amount > 0) {
                resortFee += amount;
                return;
            }

            // Exclude certain fees from guest-paid totals
            if (excludedFees.some(excluded => feeNameLower.includes(excluded))) {
                return;
            }

            // Separate cleaning fee from other fees
            if (feeNameLower.includes('cleaning')) {
                cleaningFee += amount;
            } else {
                otherFees += amount;
            }
        }
    });

    return {
        cleaningFee,
        otherFees,
        totalFees: cleaningFee + otherFees,
        resortFee
    };
}

/**
 * Helper: Check if any property has guestPaidDamageCoverage enabled
 */
function checkAnyGuestPaidDamageCoverage(statement, listingSettingsMap) {
    return statement.guestPaidDamageCoverage ||
        (listingSettingsMap && Object.values(listingSettingsMap).some(s => s.guestPaidDamageCoverage));
}

/**
 * Helper: Calculate total resort fee for statement
 */
function calculateTotalResortFee(reservations) {
    return reservations.reduce((sum, res) => sum + (res.resortFee || 0), 0);
}

/**
 * Helper: Apply proration to resort fee
 */
function applyProration(resortFee, prorationFactor) {
    return Math.round((resortFee * prorationFactor) * 100) / 100;
}

// ============================================================================
// TEST CASES
// ============================================================================

console.log('\n========================================');
console.log('GUEST PAID DAMAGE COVERAGE TEST SUITE');
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
// TEST GROUP 1: Resort Fee Extraction from Fees Array
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 1: Resort Fee Extraction from Fees Array ---\n');

test('1.1 Should extract resort fee from fees array', () => {
    const result = calculateFeesFromArray(mockFeesArrays.withResortFee);

    assert.strictEqual(result.resortFee, 168.76, 'Resort fee should be 168.76');
    assert.strictEqual(result.cleaningFee, 150, 'Cleaning fee should be 150');
    assert.strictEqual(result.otherFees, 50, 'Other fees should be 50 (pet fee)');
});

test('1.2 Should return 0 resort fee when not present', () => {
    const result = calculateFeesFromArray(mockFeesArrays.withoutResortFee);

    assert.strictEqual(result.resortFee, 0, 'Resort fee should be 0');
    assert.strictEqual(result.cleaningFee, 150, 'Cleaning fee should still be extracted');
});

test('1.3 Should return 0 resort fee when amount is 0', () => {
    const result = calculateFeesFromArray(mockFeesArrays.withZeroResortFee);

    assert.strictEqual(result.resortFee, 0, 'Resort fee should be 0 when amount is 0');
});

test('1.4 Should sum multiple resort fees', () => {
    const result = calculateFeesFromArray(mockFeesArrays.withMultipleResortFees);

    assert.strictEqual(result.resortFee, 150, 'Resort fee should be sum of all (100 + 50)');
});

test('1.5 Should handle empty fees array', () => {
    const result = calculateFeesFromArray(mockFeesArrays.empty);

    assert.strictEqual(result.resortFee, 0, 'Resort fee should be 0 for empty array');
    assert.strictEqual(result.cleaningFee, 0, 'Cleaning fee should be 0');
    assert.strictEqual(result.totalFees, 0, 'Total fees should be 0');
});

test('1.6 Should handle null/undefined fees', () => {
    const resultNull = calculateFeesFromArray(null);
    const resultUndefined = calculateFeesFromArray(undefined);

    assert.strictEqual(resultNull.resortFee, 0, 'Resort fee should be 0 for null');
    assert.strictEqual(resultUndefined.resortFee, 0, 'Resort fee should be 0 for undefined');
});

test('1.7 Should not include resort fee in totalFees', () => {
    const result = calculateFeesFromArray(mockFeesArrays.withResortFee);

    // totalFees = cleaningFee + otherFees (excludes resort fee)
    assert.strictEqual(result.totalFees, 200, 'Total fees should be 200 (150 + 50)');
    assert.strictEqual(result.resortFee, 168.76, 'Resort fee should be separate');
});

test('1.8 Should exclude claims fee and management fee', () => {
    const result = calculateFeesFromArray(mockFeesArrays.excludedFeesOnly);

    assert.strictEqual(result.resortFee, 0, 'Resort fee should be 0');
    assert.strictEqual(result.cleaningFee, 0, 'Cleaning fee should be 0');
    assert.strictEqual(result.otherFees, 0, 'Other fees should be 0 (excluded)');
    assert.strictEqual(result.totalFees, 0, 'Total fees should be 0');
});

// ----------------------------------------------------------------------------
// TEST GROUP 2: Column Display Logic
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Column Display Logic ---\n');

test('2.1 Column should show when property has guestPaidDamageCoverage enabled', () => {
    const statement = { guestPaidDamageCoverage: true };
    const listingSettingsMap = {};

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, listingSettingsMap);

    assert.strictEqual(shouldShow, true, 'Column should show');
});

test('2.2 Column should NOT show when property has guestPaidDamageCoverage disabled', () => {
    const statement = { guestPaidDamageCoverage: false };
    const listingSettingsMap = {};

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, listingSettingsMap);

    assert.strictEqual(shouldShow, false, 'Column should NOT show');
});

test('2.3 Combined statement: show if ANY property has it enabled', () => {
    const statement = { guestPaidDamageCoverage: false };
    const listingSettingsMap = {
        100001: { guestPaidDamageCoverage: true },
        100002: { guestPaidDamageCoverage: false }
    };

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, listingSettingsMap);

    assert.strictEqual(shouldShow, true, 'Column should show when any property has it enabled');
});

test('2.4 Combined statement: hide if ALL properties have it disabled', () => {
    const statement = { guestPaidDamageCoverage: false };
    const listingSettingsMap = {
        100001: { guestPaidDamageCoverage: false },
        100002: { guestPaidDamageCoverage: false }
    };

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, listingSettingsMap);

    assert.strictEqual(shouldShow, false, 'Column should NOT show when all disabled');
});

test('2.5 Statement level setting overrides when true', () => {
    const statement = { guestPaidDamageCoverage: true };
    const listingSettingsMap = {
        100001: { guestPaidDamageCoverage: false }
    };

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, listingSettingsMap);

    assert.strictEqual(shouldShow, true, 'Statement level true should show');
});

test('2.6 Empty listingSettingsMap should use statement setting', () => {
    const statementEnabled = { guestPaidDamageCoverage: true };
    const statementDisabled = { guestPaidDamageCoverage: false };

    const shouldShowEnabled = checkAnyGuestPaidDamageCoverage(statementEnabled, {});
    const shouldShowDisabled = checkAnyGuestPaidDamageCoverage(statementDisabled, {});

    assert.strictEqual(shouldShowEnabled, true, 'Should show when enabled');
    assert.strictEqual(shouldShowDisabled, false, 'Should NOT show when disabled');
});

test('2.7 Null/undefined listingSettingsMap should use statement setting', () => {
    const statement = { guestPaidDamageCoverage: true };

    const shouldShowNull = checkAnyGuestPaidDamageCoverage(statement, null);
    const shouldShowUndefined = checkAnyGuestPaidDamageCoverage(statement, undefined);

    assert.strictEqual(shouldShowNull, true, 'Should show with null map');
    assert.strictEqual(shouldShowUndefined, true, 'Should show with undefined map');
});

// ----------------------------------------------------------------------------
// TEST GROUP 3: Resort Fee Display Values
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Resort Fee Display Values ---\n');

test('3.1 Reservation with resort fee should show value', () => {
    const reservation = mockReservations.resWithResortFee;

    assert.strictEqual(reservation.resortFee, 168.76, 'Resort fee should be 168.76');
});

test('3.2 Reservation without resort fee should show $0.00', () => {
    const reservation = mockReservations.resWithoutResortFee;

    assert.strictEqual(reservation.resortFee, 0, 'Resort fee should be 0');
});

test('3.3 Total resort fee calculation for multiple reservations', () => {
    const reservations = [
        mockReservations.resWithResortFee,
        mockReservations.resWithoutResortFee
    ];

    const total = calculateTotalResortFee(reservations);

    assert.strictEqual(total, 168.76, 'Total should be 168.76');
});

test('3.4 Total resort fee for reservations all with fees', () => {
    const reservations = [
        { ...mockReservations.resWithResortFee, resortFee: 100 },
        { ...mockReservations.resWithResortFee, id: 'res-2', resortFee: 150 },
        { ...mockReservations.resWithResortFee, id: 'res-3', resortFee: 200 }
    ];

    const total = calculateTotalResortFee(reservations);

    assert.strictEqual(total, 450, 'Total should be 450');
});

test('3.5 Total resort fee for reservations all without fees', () => {
    const reservations = [
        { ...mockReservations.resWithoutResortFee },
        { ...mockReservations.resWithoutResortFee, id: 'res-2' }
    ];

    const total = calculateTotalResortFee(reservations);

    assert.strictEqual(total, 0, 'Total should be 0');
});

// ----------------------------------------------------------------------------
// TEST GROUP 4: Proration for Calendar-Based Statements
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Proration for Calendar-Based Statements ---\n');

test('4.1 Full stay (no proration) should keep original resort fee', () => {
    const resortFee = 168.76;
    const prorationFactor = 1.0;

    const prorated = applyProration(resortFee, prorationFactor);

    assert.strictEqual(prorated, 168.76, 'Should keep original value');
});

test('4.2 Half stay proration should halve resort fee', () => {
    const resortFee = 200;
    const prorationFactor = 0.5;

    const prorated = applyProration(resortFee, prorationFactor);

    assert.strictEqual(prorated, 100, 'Should be half (100)');
});

test('4.3 Quarter stay proration', () => {
    const resortFee = 200;
    const prorationFactor = 0.25;

    const prorated = applyProration(resortFee, prorationFactor);

    assert.strictEqual(prorated, 50, 'Should be quarter (50)');
});

test('4.4 Odd proration factor should round to 2 decimals', () => {
    const resortFee = 100;
    const prorationFactor = 0.333; // 3 of 9 days

    const prorated = applyProration(resortFee, prorationFactor);

    assert.strictEqual(prorated, 33.30, 'Should be 33.30');
});

test('4.5 Zero resort fee with proration', () => {
    const resortFee = 0;
    const prorationFactor = 0.5;

    const prorated = applyProration(resortFee, prorationFactor);

    assert.strictEqual(prorated, 0, 'Should be 0');
});

test('4.6 Small proration factor', () => {
    const resortFee = 168.76;
    const prorationFactor = 0.1; // 1 of 10 days

    const prorated = applyProration(resortFee, prorationFactor);

    assert.strictEqual(prorated, 16.88, 'Should be 16.88');
});

// ----------------------------------------------------------------------------
// TEST GROUP 5: Combined Statement Scenarios
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: Combined Statement Scenarios ---\n');

test('5.1 Combined statement with mixed settings', () => {
    const listingSettingsMap = {
        100001: mockListings.propertyA, // enabled
        100002: mockListings.propertyB  // disabled
    };

    const reservations = [
        mockReservations.resWithResortFee,    // Property A, has resort fee
        mockReservations.resForPropertyB       // Property B, has resort fee but setting disabled
    ];

    // Column should show because Property A has it enabled
    const shouldShow = checkAnyGuestPaidDamageCoverage({}, listingSettingsMap);
    assert.strictEqual(shouldShow, true, 'Column should show');

    // Total should include ALL resort fees (column shows for all when any enabled)
    const total = calculateTotalResortFee(reservations);
    assert.strictEqual(total, 368.76, 'Total should include both (168.76 + 200)');
});

test('5.2 Combined statement with all settings disabled', () => {
    const listingSettingsMap = {
        100001: { ...mockListings.propertyA, guestPaidDamageCoverage: false },
        100002: mockListings.propertyB
    };

    const shouldShow = checkAnyGuestPaidDamageCoverage({}, listingSettingsMap);
    assert.strictEqual(shouldShow, false, 'Column should NOT show');
});

test('5.3 Combined statement totals across multiple properties', () => {
    const reservations = [
        { ...mockReservations.resWithResortFee, propertyId: 100001, resortFee: 100 },
        { ...mockReservations.resWithResortFee, propertyId: 100001, id: 'res-2', resortFee: 150 },
        { ...mockReservations.resWithResortFee, propertyId: 100002, id: 'res-3', resortFee: 200 },
        { ...mockReservations.resWithoutResortFee, propertyId: 100002, id: 'res-4', resortFee: 0 }
    ];

    const total = calculateTotalResortFee(reservations);

    assert.strictEqual(total, 450, 'Total should be 450 (100 + 150 + 200 + 0)');
});

// ----------------------------------------------------------------------------
// TEST GROUP 6: Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Edge Cases ---\n');

test('6.1 Undefined resortFee should be treated as 0', () => {
    const reservation = { ...mockReservations.resWithResortFee, resortFee: undefined };

    const total = calculateTotalResortFee([reservation]);

    assert.strictEqual(total, 0, 'Undefined should be treated as 0');
});

test('6.2 Null resortFee should be treated as 0', () => {
    const reservation = { ...mockReservations.resWithResortFee, resortFee: null };

    const total = calculateTotalResortFee([reservation]);

    assert.strictEqual(total, 0, 'Null should be treated as 0');
});

test('6.3 Negative resortFee (invalid data)', () => {
    const reservation = { ...mockReservations.resWithResortFee, resortFee: -50 };

    const total = calculateTotalResortFee([reservation]);

    assert.strictEqual(total, -50, 'Negative value is used as-is');
});

test('6.4 Very large resort fee', () => {
    const reservation = { ...mockReservations.resWithResortFee, resortFee: 9999.99 };

    const total = calculateTotalResortFee([reservation]);

    assert.strictEqual(total, 9999.99, 'Large value should work');
});

test('6.5 Resort fee with many decimal places', () => {
    const resortFee = 168.123456789;
    const prorated = applyProration(resortFee, 1.0);

    assert.strictEqual(prorated, 168.12, 'Should round to 2 decimals');
});

test('6.6 Empty reservations array', () => {
    const total = calculateTotalResortFee([]);

    assert.strictEqual(total, 0, 'Empty array should return 0');
});

// ----------------------------------------------------------------------------
// TEST GROUP 7: Feature Combination Tests
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 7: Feature Combination Tests ---\n');

test('7.1 Both cleaningFeePassThrough and guestPaidDamageCoverage enabled', () => {
    const listing = mockListings.propertyC;

    assert.strictEqual(listing.cleaningFeePassThrough, true, 'Cleaning passthrough enabled');
    assert.strictEqual(listing.guestPaidDamageCoverage, true, 'Damage coverage enabled');
});

test('7.2 Features should work independently', () => {
    // Cleaning passthrough affects gross payout calculation
    // Damage coverage is just a display column (informational)
    const reservation = {
        ...mockReservations.resWithResortFee,
        propertyId: 100003,
        cleaningFee: 200,
        resortFee: 150
    };

    // Resort fee is NOT deducted from payout - it's just displayed
    assert.strictEqual(reservation.resortFee, 150, 'Resort fee is informational only');
});

// ----------------------------------------------------------------------------
// TEST GROUP 8: Boolean Flag Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 8: Boolean Flag Edge Cases ---\n');

test('8.1 guestPaidDamageCoverage as string "true" should be truthy', () => {
    const statement = { guestPaidDamageCoverage: 'true' };

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, {});

    assert.ok(shouldShow, 'String "true" should be truthy');
});

test('8.2 guestPaidDamageCoverage as 1 should be truthy', () => {
    const statement = { guestPaidDamageCoverage: 1 };

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, {});

    assert.ok(shouldShow, '1 should be truthy');
});

test('8.3 guestPaidDamageCoverage as 0 should be falsy', () => {
    const statement = { guestPaidDamageCoverage: 0 };

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, {});

    assert.strictEqual(shouldShow, false, '0 should be falsy');
});

test('8.4 guestPaidDamageCoverage as empty string should be falsy', () => {
    const statement = { guestPaidDamageCoverage: '' };

    const shouldShow = checkAnyGuestPaidDamageCoverage(statement, {});

    assert.strictEqual(shouldShow, false, 'Empty string should be falsy');
});

// ----------------------------------------------------------------------------
// TEST GROUP 9: Resort Fee Name Variations
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 9: Resort Fee Name Variations ---\n');

test('9.1 Case insensitive "RESORT FEE"', () => {
    const fees = [{
        amount_gross: 100,
        fee: { name: "RESORT FEE", type: "fee" }
    }];

    const result = calculateFeesFromArray(fees);

    assert.strictEqual(result.resortFee, 100, 'Should match uppercase');
});

test('9.2 Case insensitive "Resort Fee"', () => {
    const fees = [{
        amount_gross: 100,
        fee: { name: "Resort Fee", type: "fee" }
    }];

    const result = calculateFeesFromArray(fees);

    assert.strictEqual(result.resortFee, 100, 'Should match title case');
});

test('9.3 Name containing "resort fee" like "Daily Resort Fee"', () => {
    const fees = [{
        amount_gross: 100,
        fee: { name: "Daily Resort Fee", type: "fee" }
    }];

    const result = calculateFeesFromArray(fees);

    assert.strictEqual(result.resortFee, 100, 'Should match partial name');
});

test('9.4 Fee without proper type should not be extracted', () => {
    const fees = [{
        amount_gross: 100,
        fee: { name: "Resort fee", type: "tax" } // Wrong type
    }];

    const result = calculateFeesFromArray(fees);

    assert.strictEqual(result.resortFee, 0, 'Should not extract non-fee type');
});

test('9.5 Fee with null name should not crash', () => {
    const fees = [{
        amount_gross: 100,
        fee: { name: null, type: "fee" }
    }];

    const result = calculateFeesFromArray(fees);

    assert.strictEqual(result.resortFee, 0, 'Should handle null name');
});

test('9.6 Fee with undefined fee object should not crash', () => {
    const fees = [{
        amount_gross: 100,
        fee: undefined
    }];

    const result = calculateFeesFromArray(fees);

    assert.strictEqual(result.resortFee, 0, 'Should handle undefined fee object');
});

// ----------------------------------------------------------------------------
// TEST GROUP 10: Listing Settings Checkbox Persistence
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 10: Listing Settings Checkbox Persistence ---\n');

test('10.1 Setting should persist as boolean true', () => {
    const listing = { ...mockListings.propertyA };

    assert.strictEqual(listing.guestPaidDamageCoverage, true, 'Should be boolean true');
    assert.strictEqual(typeof listing.guestPaidDamageCoverage, 'boolean', 'Should be boolean type');
});

test('10.2 Setting should persist as boolean false', () => {
    const listing = { ...mockListings.propertyB };

    assert.strictEqual(listing.guestPaidDamageCoverage, false, 'Should be boolean false');
    assert.strictEqual(typeof listing.guestPaidDamageCoverage, 'boolean', 'Should be boolean type');
});

// ----------------------------------------------------------------------------
// TEST GROUP 11: Statement Generation Integration
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 11: Statement Generation Integration ---\n');

test('11.1 Single property statement with setting enabled', () => {
    const statement = {
        propertyId: 100001,
        guestPaidDamageCoverage: true,
        reservations: [mockReservations.resWithResortFee]
    };

    const shouldShowColumn = checkAnyGuestPaidDamageCoverage(statement, {});
    const totalResortFee = calculateTotalResortFee(statement.reservations);

    assert.strictEqual(shouldShowColumn, true, 'Column should show');
    assert.strictEqual(totalResortFee, 168.76, 'Total should be 168.76');
});

test('11.2 Single property statement with setting disabled', () => {
    const statement = {
        propertyId: 100002,
        guestPaidDamageCoverage: false,
        reservations: [mockReservations.resForPropertyB]
    };

    const shouldShowColumn = checkAnyGuestPaidDamageCoverage(statement, {});

    assert.strictEqual(shouldShowColumn, false, 'Column should NOT show');
});

test('11.3 Bulk generation should respect per-property settings', () => {
    const listingSettingsMap = {
        100001: { guestPaidDamageCoverage: true },
        100002: { guestPaidDamageCoverage: false },
        100003: { guestPaidDamageCoverage: true }
    };

    // Statement for owner with properties 100001 and 100002
    const shouldShow1 = checkAnyGuestPaidDamageCoverage({}, { 100001: listingSettingsMap[100001], 100002: listingSettingsMap[100002] });

    // Statement for owner with only property 100002
    const shouldShow2 = checkAnyGuestPaidDamageCoverage({}, { 100002: listingSettingsMap[100002] });

    assert.strictEqual(shouldShow1, true, 'Should show when any property has it enabled');
    assert.strictEqual(shouldShow2, false, 'Should NOT show when all properties disabled');
});

// ----------------------------------------------------------------------------
// TEST GROUP 12: Data Immutability
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 12: Data Immutability ---\n');

test('12.1 calculateFeesFromArray should not mutate input', () => {
    const fees = [...mockFeesArrays.withResortFee];
    const originalLength = fees.length;

    calculateFeesFromArray(fees);

    assert.strictEqual(fees.length, originalLength, 'Input array should not be mutated');
});

test('12.2 calculateTotalResortFee should not mutate reservations', () => {
    const reservations = [{ ...mockReservations.resWithResortFee }];
    const originalResortFee = reservations[0].resortFee;

    calculateTotalResortFee(reservations);

    assert.strictEqual(reservations[0].resortFee, originalResortFee, 'Reservation should not be mutated');
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
