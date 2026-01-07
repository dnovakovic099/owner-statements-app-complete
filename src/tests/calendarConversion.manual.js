/**
 * Calendar Conversion Logic Tests
 *
 * Tests the bulk generation logic that:
 * 1. Creates statements when ANY reservation overlaps with the period (not just checkouts)
 * 2. Shows $0 revenue for checkout mode when no checkouts in period
 * 3. Flags statements that should be converted to calendar mode
 * 4. Includes overlapping reservations info in the notice
 */

const assert = require('assert');

// Helper to run tests
function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${error.message}`);
        process.exitCode = 1;
    }
}

console.log('\n========================================');
console.log('Calendar Conversion Logic Tests');
console.log('========================================\n');

// ----------------------------------------------------------------------------
// Mock Data Setup
// ----------------------------------------------------------------------------

const mockListings = {
    propertyA: {
        id: 100001,
        name: 'Test Property A',
        nickname: 'Property A',
        pmFeePercentage: 15,
        cleaningFeePassThrough: false,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false,
        isActive: true,
        tags: ['test']
    },
    propertyB: {
        id: 100002,
        name: 'Test Property B',
        nickname: 'Property B',
        pmFeePercentage: 20,
        cleaningFeePassThrough: false,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false,
        isActive: true,
        tags: ['test']
    }
};

// Reservations for different test scenarios
const mockReservations = {
    // Reservation that checks out WITHIN Nov 2025 period
    checkoutInPeriod: {
        id: 'res1',
        hostifyId: 'hfy1',
        propertyId: 100001,
        guestName: 'John Checkout',
        checkInDate: '2025-11-01',
        checkOutDate: '2025-11-15', // Checks out within Nov
        source: 'Airbnb',
        status: 'confirmed',
        grossAmount: 1500,
        clientRevenue: 1500,
        hasDetailedFinance: true,
        clientTaxResponsibility: 0
    },
    // Reservation that spans the ENTIRE period (checks in before, checks out after)
    longStaySpanning: {
        id: 'res2',
        hostifyId: 'hfy2',
        propertyId: 100001,
        guestName: 'Jane LongStay',
        checkInDate: '2025-10-15', // Checks in BEFORE Nov
        checkOutDate: '2025-12-15', // Checks out AFTER Nov
        source: 'VRBO',
        status: 'confirmed',
        grossAmount: 4500,
        clientRevenue: 4500,
        hasDetailedFinance: true,
        clientTaxResponsibility: 0
    },
    // Reservation that starts in period but checks out AFTER
    checkoutAfterPeriod: {
        id: 'res3',
        hostifyId: 'hfy3',
        propertyId: 100001,
        guestName: 'Bob Extended',
        checkInDate: '2025-11-20', // Checks in within Nov
        checkOutDate: '2025-12-05', // Checks out in Dec
        source: 'Direct',
        status: 'confirmed',
        grossAmount: 2000,
        clientRevenue: 2000,
        hasDetailedFinance: true,
        clientTaxResponsibility: 0
    },
    // Reservation completely outside period
    outsidePeriod: {
        id: 'res4',
        hostifyId: 'hfy4',
        propertyId: 100001,
        guestName: 'Carol Outside',
        checkInDate: '2025-12-01',
        checkOutDate: '2025-12-10',
        source: 'Airbnb',
        status: 'confirmed',
        grossAmount: 1000,
        clientRevenue: 1000,
        hasDetailedFinance: true,
        clientTaxResponsibility: 0
    }
};

// Statement period: November 2025
const periodStart = new Date('2025-11-01');
const periodEnd = new Date('2025-11-30');

// ----------------------------------------------------------------------------
// Helper Functions (mirroring the actual logic from statements-file.js)
// ----------------------------------------------------------------------------

/**
 * Filters reservations based on calculation type
 */
function filterPeriodReservations(allReservations, propertyId, calculationType, periodStart, periodEnd) {
    const allowedStatuses = ['confirmed', 'modified', 'new', 'accepted'];

    return allReservations.filter(res => {
        const propMatch = parseInt(res.propertyId) === parseInt(propertyId);
        if (!propMatch) return false;

        let dateMatch = true;
        if (calculationType === 'calendar') {
            // Calendar: any reservation that overlaps with the period
            const checkIn = new Date(res.checkInDate);
            const checkOut = new Date(res.checkOutDate);
            if (checkIn > periodEnd || checkOut <= periodStart) dateMatch = false;
        } else {
            // Checkout: only reservations that check out within the period
            const checkoutDate = new Date(res.checkOutDate);
            if (checkoutDate < periodStart || checkoutDate > periodEnd) dateMatch = false;
        }

        const statusMatch = allowedStatuses.includes(res.status);
        return dateMatch && statusMatch;
    });
}

/**
 * Finds ALL overlapping reservations (regardless of calculation type)
 */
function findOverlappingReservations(allReservations, propertyId, periodStart, periodEnd) {
    const allowedStatuses = ['confirmed', 'modified', 'new', 'accepted'];

    return allReservations.filter(res => {
        const propMatch = parseInt(res.propertyId) === parseInt(propertyId);
        if (!propMatch) return false;

        const checkIn = new Date(res.checkInDate);
        const checkOut = new Date(res.checkOutDate);
        const statusMatch = allowedStatuses.includes(res.status);

        // Overlaps if: checkIn <= periodEnd AND checkOut > periodStart
        return checkIn <= periodEnd && checkOut > periodStart && statusMatch;
    });
}

/**
 * Determines if statement should be flagged for calendar conversion
 */
function shouldConvertToCalendar(calculationType, periodReservations, overlappingReservations, periodStart, periodEnd) {
    if (calculationType === 'checkout') {
        // For checkout mode: flag if there are overlapping reservations but no checkouts in period
        if (overlappingReservations.length > 0 && periodReservations.length === 0) {
            return true;
        }
    } else {
        // For calendar mode: flag if any reservation spans beyond the period (long stay)
        const longStayReservations = overlappingReservations.filter(res => {
            const checkIn = new Date(res.checkInDate);
            const checkOut = new Date(res.checkOutDate);
            return checkIn < periodStart || checkOut > periodEnd;
        });
        if (longStayReservations.length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Determines if a statement should be skipped (no activity)
 */
function shouldSkipStatement(overlappingReservations, periodExpenses) {
    // NEW LOGIC: Skip ONLY if no overlapping reservations AND no expenses
    return overlappingReservations.length === 0 && periodExpenses.length === 0;
}

/**
 * Generates the calendar conversion notice message
 */
function generateCalendarNotice(calculationType, overlappingReservations) {
    if (calculationType === 'checkout') {
        return `This property has ${overlappingReservations.length} reservation(s) during this period but no checkouts. Revenue shows $0 because checkout-based calculation is selected. Consider converting to calendar-based calculation to see prorated revenue.`;
    } else {
        return `This property has long-stay reservation(s) spanning beyond the statement period. Prorated calendar calculation is applied.`;
    }
}

// ----------------------------------------------------------------------------
// TEST GROUP 1: Checkout Mode - Reservation Filtering
// ----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Checkout Mode - Reservation Filtering ---\n');

test('1.1 Checkout mode: Reservation checking out in period is included', () => {
    const allRes = [mockReservations.checkoutInPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Should include 1 reservation');
    assert.strictEqual(periodRes[0].guestName, 'John Checkout');
});

test('1.2 Checkout mode: Reservation checking out AFTER period is NOT included', () => {
    const allRes = [mockReservations.checkoutAfterPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 0, 'Should NOT include reservation checking out after period');
});

test('1.3 Checkout mode: Long-stay spanning period is NOT included (no checkout in period)', () => {
    const allRes = [mockReservations.longStaySpanning];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 0, 'Long-stay should NOT be in period reservations for checkout mode');
});

test('1.4 Checkout mode: Reservation outside period is NOT included', () => {
    const allRes = [mockReservations.outsidePeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 0, 'Outside period reservation should NOT be included');
});

// ----------------------------------------------------------------------------
// TEST GROUP 2: Calendar Mode - Reservation Filtering
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Calendar Mode - Reservation Filtering ---\n');

test('2.1 Calendar mode: Reservation checking out in period is included', () => {
    const allRes = [mockReservations.checkoutInPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'calendar', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Should include 1 reservation');
});

test('2.2 Calendar mode: Reservation checking out AFTER period IS included (overlaps)', () => {
    const allRes = [mockReservations.checkoutAfterPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'calendar', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Should include reservation that overlaps');
    assert.strictEqual(periodRes[0].guestName, 'Bob Extended');
});

test('2.3 Calendar mode: Long-stay spanning period IS included', () => {
    const allRes = [mockReservations.longStaySpanning];
    const periodRes = filterPeriodReservations(allRes, 100001, 'calendar', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Long-stay should be included in calendar mode');
    assert.strictEqual(periodRes[0].guestName, 'Jane LongStay');
});

test('2.4 Calendar mode: Reservation outside period is NOT included', () => {
    const allRes = [mockReservations.outsidePeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'calendar', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 0, 'Outside period reservation should NOT be included');
});

// ----------------------------------------------------------------------------
// TEST GROUP 3: Overlapping Reservations Detection
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Overlapping Reservations Detection ---\n');

test('3.1 Long-stay spanning period is detected as overlapping', () => {
    const allRes = [mockReservations.longStaySpanning];
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    assert.strictEqual(overlapping.length, 1, 'Long-stay should be detected as overlapping');
});

test('3.2 Reservation checking out after period is detected as overlapping', () => {
    const allRes = [mockReservations.checkoutAfterPeriod];
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    assert.strictEqual(overlapping.length, 1, 'Should detect as overlapping');
});

test('3.3 Reservation outside period is NOT detected as overlapping', () => {
    const allRes = [mockReservations.outsidePeriod];
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    assert.strictEqual(overlapping.length, 0, 'Should NOT detect as overlapping');
});

test('3.4 Multiple reservations - only overlapping ones detected', () => {
    const allRes = [
        mockReservations.checkoutInPeriod,     // overlaps
        mockReservations.longStaySpanning,     // overlaps
        mockReservations.checkoutAfterPeriod,  // overlaps
        mockReservations.outsidePeriod         // does NOT overlap
    ];
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    assert.strictEqual(overlapping.length, 3, 'Should detect 3 overlapping reservations');
});

// ----------------------------------------------------------------------------
// TEST GROUP 4: Calendar Conversion Flag Logic
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Calendar Conversion Flag Logic ---\n');

test('4.1 Checkout mode: Flag when overlapping but no checkouts', () => {
    const allRes = [mockReservations.longStaySpanning];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 0, 'Should have 0 period reservations');
    assert.strictEqual(overlapping.length, 1, 'Should have 1 overlapping reservation');
    assert.strictEqual(shouldConvert, true, 'Should flag for calendar conversion');
});

test('4.2 Checkout mode: NO flag when there ARE checkouts in period', () => {
    const allRes = [mockReservations.checkoutInPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Should have 1 period reservation');
    assert.strictEqual(shouldConvert, false, 'Should NOT flag for calendar conversion');
});

test('4.3 Calendar mode: Flag when long-stay spans beyond period', () => {
    const allRes = [mockReservations.longStaySpanning];
    const periodRes = filterPeriodReservations(allRes, 100001, 'calendar', periodStart, periodEnd);
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    const shouldConvert = shouldConvertToCalendar('calendar', periodRes, overlapping, periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Should have 1 period reservation');
    assert.strictEqual(shouldConvert, true, 'Should flag for prorated calculation notice');
});

test('4.4 Calendar mode: NO flag when reservation fully within period', () => {
    const allRes = [mockReservations.checkoutInPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'calendar', periodStart, periodEnd);
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    const shouldConvert = shouldConvertToCalendar('calendar', periodRes, overlapping, periodStart, periodEnd);

    assert.strictEqual(shouldConvert, false, 'Should NOT flag when reservation is fully within period');
});

// ----------------------------------------------------------------------------
// TEST GROUP 5: Skip Logic (New vs Old)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: Statement Skip Logic ---\n');

test('5.1 Should NOT skip when overlapping reservations exist (even with no checkouts)', () => {
    const allRes = [mockReservations.longStaySpanning];
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);
    const expenses = [];

    const skip = shouldSkipStatement(overlapping, expenses);

    assert.strictEqual(skip, false, 'Should NOT skip - overlapping reservations exist');
});

test('5.2 Should NOT skip when expenses exist (even with no reservations)', () => {
    const overlapping = [];
    const expenses = [{ id: 'exp1', amount: -100 }];

    const skip = shouldSkipStatement(overlapping, expenses);

    assert.strictEqual(skip, false, 'Should NOT skip - expenses exist');
});

test('5.3 Should skip when NO overlapping reservations AND NO expenses', () => {
    const overlapping = [];
    const expenses = [];

    const skip = shouldSkipStatement(overlapping, expenses);

    assert.strictEqual(skip, true, 'Should skip - no activity');
});

// ----------------------------------------------------------------------------
// TEST GROUP 6: Notice Message Generation
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Notice Message Generation ---\n');

test('6.1 Checkout mode notice includes reservation count', () => {
    const overlapping = [mockReservations.longStaySpanning, mockReservations.checkoutAfterPeriod];
    const notice = generateCalendarNotice('checkout', overlapping);

    assert.ok(notice.includes('2 reservation(s)'), 'Notice should include reservation count');
    assert.ok(notice.includes('no checkouts'), 'Notice should mention no checkouts');
    assert.ok(notice.includes('$0'), 'Notice should mention $0 revenue');
    assert.ok(notice.includes('calendar-based'), 'Notice should suggest calendar mode');
});

test('6.2 Calendar mode notice mentions long-stay', () => {
    const overlapping = [mockReservations.longStaySpanning];
    const notice = generateCalendarNotice('calendar', overlapping);

    assert.ok(notice.includes('long-stay'), 'Notice should mention long-stay');
    assert.ok(notice.toLowerCase().includes('prorated'), 'Notice should mention prorated calculation');
});

// ----------------------------------------------------------------------------
// TEST GROUP 7: Revenue Calculation (Checkout mode with $0)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 7: Revenue Calculation ---\n');

test('7.1 Checkout mode with no checkouts = $0 revenue', () => {
    const allRes = [mockReservations.longStaySpanning];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);

    // Calculate revenue from period reservations only
    const totalRevenue = periodRes.reduce((sum, res) => sum + (res.clientRevenue || 0), 0);

    assert.strictEqual(periodRes.length, 0, 'Should have 0 period reservations');
    assert.strictEqual(totalRevenue, 0, 'Revenue should be $0');
});

test('7.2 Checkout mode with checkout in period = full revenue', () => {
    const allRes = [mockReservations.checkoutInPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);

    const totalRevenue = periodRes.reduce((sum, res) => sum + (res.clientRevenue || 0), 0);

    assert.strictEqual(periodRes.length, 1, 'Should have 1 period reservation');
    assert.strictEqual(totalRevenue, 1500, 'Revenue should be full amount ($1500)');
});

test('7.3 Calendar mode with overlapping = includes overlapping revenue', () => {
    const allRes = [mockReservations.longStaySpanning, mockReservations.checkoutAfterPeriod];
    const periodRes = filterPeriodReservations(allRes, 100001, 'calendar', periodStart, periodEnd);

    const totalRevenue = periodRes.reduce((sum, res) => sum + (res.clientRevenue || 0), 0);

    assert.strictEqual(periodRes.length, 2, 'Should have 2 period reservations');
    assert.strictEqual(totalRevenue, 6500, 'Revenue should include both ($4500 + $2000)');
});

// ----------------------------------------------------------------------------
// TEST GROUP 8: Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 8: Edge Cases ---\n');

test('8.1 Reservation checking out exactly on period end date', () => {
    const edgeRes = {
        ...mockReservations.checkoutInPeriod,
        checkOutDate: '2025-11-30' // Exactly on end date
    };
    const allRes = [edgeRes];

    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Should include reservation checking out on last day');
});

test('8.2 Reservation checking in exactly on period end date', () => {
    const edgeRes = {
        ...mockReservations.checkoutInPeriod,
        checkInDate: '2025-11-30',
        checkOutDate: '2025-12-05'
    };
    const allRes = [edgeRes];

    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    assert.strictEqual(overlapping.length, 1, 'Should detect as overlapping (checks in on last day)');
});

test('8.3 Reservation checking out exactly on period start date (boundary)', () => {
    const edgeRes = {
        ...mockReservations.checkoutInPeriod,
        checkInDate: '2025-10-25',
        checkOutDate: '2025-11-01' // Exactly on start date
    };
    const allRes = [edgeRes];

    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Checkout mode should include (checkout on start date)');
    // Note: Overlap check is checkOut > periodStart, so checkout ON start date is NOT overlapping
    assert.strictEqual(overlapping.length, 0, 'Should NOT overlap (checkout is exactly on start, not after)');
});

test('8.4 Mixed scenario: Some checkouts, some long-stays', () => {
    const allRes = [
        mockReservations.checkoutInPeriod,   // Checkout in period
        mockReservations.longStaySpanning    // No checkout in period
    ];

    const periodRes = filterPeriodReservations(allRes, 100001, 'checkout', periodStart, periodEnd);
    const overlapping = findOverlappingReservations(allRes, 100001, periodStart, periodEnd);
    const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, periodStart, periodEnd);

    assert.strictEqual(periodRes.length, 1, 'Should have 1 checkout in period');
    assert.strictEqual(overlapping.length, 2, 'Should have 2 overlapping');
    assert.strictEqual(shouldConvert, false, 'Should NOT flag - there IS a checkout');
});

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------
console.log('\n========================================');
console.log('All Calendar Conversion Tests Complete');
console.log('========================================\n');
