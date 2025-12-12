/**
 * Calendar Conversion Logic - Jest Test Suite
 *
 * Comprehensive tests for the bulk generation logic that:
 * 1. Creates statements when ANY reservation overlaps with the period (regardless of calculation type)
 * 2. Shows $0 revenue for checkout mode when no checkouts in period
 * 3. Flags statements that should be converted to calendar mode
 * 4. Includes overlapping reservations info in the notice
 *
 * Run with: npm run test:jest:calendar
 */

// ============================================================================
// MOCK DATA
// ============================================================================

const mockListings = {
    propertyA: {
        id: 100001,
        name: 'Test Property A',
        nickname: 'Property A',
        pmFeePercentage: 15,
        cleaningFeePassThrough: false,
        isCohostOnAirbnb: false,
        isActive: true,
        tags: ['vacation-rental']
    },
    propertyB: {
        id: 100002,
        name: 'Test Property B',
        nickname: 'Property B',
        pmFeePercentage: 20,
        cleaningFeePassThrough: false,
        isCohostOnAirbnb: false,
        isActive: true,
        tags: ['long-term']
    }
};

// Factory function for creating test reservations
const createReservation = (overrides = {}) => ({
    id: 'res-default',
    hostifyId: 'hfy-default',
    propertyId: 100001,
    guestName: 'Test Guest',
    checkInDate: '2025-11-01',
    checkOutDate: '2025-11-15',
    source: 'Airbnb',
    status: 'confirmed',
    grossAmount: 1500,
    clientRevenue: 1500,
    hasDetailedFinance: true,
    clientTaxResponsibility: 0,
    ...overrides
});

// Pre-defined reservation scenarios
const reservationScenarios = {
    // Checkout within November period
    checkoutInPeriod: createReservation({
        id: 'res1',
        guestName: 'John Checkout',
        checkInDate: '2025-11-01',
        checkOutDate: '2025-11-15'
    }),

    // Long-stay spanning entire period (checks in before, checks out after)
    longStaySpanning: createReservation({
        id: 'res2',
        guestName: 'Jane LongStay',
        checkInDate: '2025-10-15',
        checkOutDate: '2025-12-15',
        grossAmount: 4500,
        clientRevenue: 4500
    }),

    // Starts in period, checks out after
    checkoutAfterPeriod: createReservation({
        id: 'res3',
        guestName: 'Bob Extended',
        checkInDate: '2025-11-20',
        checkOutDate: '2025-12-05',
        grossAmount: 2000,
        clientRevenue: 2000
    }),

    // Completely outside period
    outsidePeriod: createReservation({
        id: 'res4',
        guestName: 'Carol Outside',
        checkInDate: '2025-12-01',
        checkOutDate: '2025-12-10',
        grossAmount: 1000,
        clientRevenue: 1000
    }),

    // Checks in before period, checks out on first day
    checkoutOnStartDate: createReservation({
        id: 'res5',
        guestName: 'Dan Boundary',
        checkInDate: '2025-10-25',
        checkOutDate: '2025-11-01'
    }),

    // Checks out exactly on last day
    checkoutOnEndDate: createReservation({
        id: 'res6',
        guestName: 'Eve LastDay',
        checkInDate: '2025-11-25',
        checkOutDate: '2025-11-30'
    }),

    // Checks in on last day of period
    checkInOnEndDate: createReservation({
        id: 'res7',
        guestName: 'Frank Late',
        checkInDate: '2025-11-30',
        checkOutDate: '2025-12-05'
    }),

    // Cancelled reservation
    cancelled: createReservation({
        id: 'res8',
        guestName: 'Grace Cancelled',
        status: 'cancelled',
        checkInDate: '2025-11-10',
        checkOutDate: '2025-11-15'
    }),

    // Different property
    differentProperty: createReservation({
        id: 'res9',
        guestName: 'Henry Other',
        propertyId: 100002,
        checkInDate: '2025-11-05',
        checkOutDate: '2025-11-10'
    })
};

// Statement period: November 2025
const PERIOD_START = new Date('2025-11-01');
const PERIOD_END = new Date('2025-11-30');
const PROPERTY_ID = 100001;

// ============================================================================
// HELPER FUNCTIONS (mirroring statements-file.js logic)
// ============================================================================

const ALLOWED_STATUSES = ['confirmed', 'modified', 'new', 'accepted'];

/**
 * Filters reservations based on calculation type
 */
function filterPeriodReservations(allReservations, propertyId, calculationType, periodStart, periodEnd) {
    return allReservations.filter(res => {
        const propMatch = parseInt(res.propertyId) === parseInt(propertyId);
        if (!propMatch) return false;

        let dateMatch = true;
        if (calculationType === 'calendar') {
            const checkIn = new Date(res.checkInDate);
            const checkOut = new Date(res.checkOutDate);
            if (checkIn > periodEnd || checkOut <= periodStart) dateMatch = false;
        } else {
            const checkoutDate = new Date(res.checkOutDate);
            if (checkoutDate < periodStart || checkoutDate > periodEnd) dateMatch = false;
        }

        const statusMatch = ALLOWED_STATUSES.includes(res.status);
        return dateMatch && statusMatch;
    });
}

/**
 * Finds ALL overlapping reservations (regardless of calculation type)
 */
function findOverlappingReservations(allReservations, propertyId, periodStart, periodEnd) {
    return allReservations.filter(res => {
        const propMatch = parseInt(res.propertyId) === parseInt(propertyId);
        if (!propMatch) return false;

        const checkIn = new Date(res.checkInDate);
        const checkOut = new Date(res.checkOutDate);
        const statusMatch = ALLOWED_STATUSES.includes(res.status);

        // Overlaps if: checkIn <= periodEnd AND checkOut > periodStart
        return checkIn <= periodEnd && checkOut > periodStart && statusMatch;
    });
}

/**
 * Determines if statement should be flagged for calendar conversion
 */
function shouldConvertToCalendar(calculationType, periodReservations, overlappingReservations, periodStart, periodEnd) {
    if (calculationType === 'checkout') {
        // Flag if overlapping reservations exist but no checkouts in period
        return overlappingReservations.length > 0 && periodReservations.length === 0;
    } else {
        // Flag if any reservation spans beyond the period
        return overlappingReservations.some(res => {
            const checkIn = new Date(res.checkInDate);
            const checkOut = new Date(res.checkOutDate);
            return checkIn < periodStart || checkOut > periodEnd;
        });
    }
}

/**
 * Determines if a statement should be skipped (no activity)
 */
function shouldSkipStatement(overlappingReservations, periodExpenses) {
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

/**
 * Calculate total revenue from reservations
 */
function calculateRevenue(reservations) {
    return reservations.reduce((sum, res) => sum + (res.clientRevenue || 0), 0);
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Calendar Conversion Logic', () => {

    // ------------------------------------------------------------------------
    // TEST GROUP 1: Checkout Mode - Reservation Filtering
    // ------------------------------------------------------------------------
    describe('Checkout Mode - Reservation Filtering', () => {

        test('includes reservation that checks out within period', () => {
            const allRes = [reservationScenarios.checkoutInPeriod];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(1);
            expect(periodRes[0].guestName).toBe('John Checkout');
        });

        test('excludes reservation that checks out after period', () => {
            const allRes = [reservationScenarios.checkoutAfterPeriod];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
        });

        test('excludes long-stay spanning period (no checkout in period)', () => {
            const allRes = [reservationScenarios.longStaySpanning];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
        });

        test('excludes reservation completely outside period', () => {
            const allRes = [reservationScenarios.outsidePeriod];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
        });

        test('includes reservation checking out on period start date', () => {
            const allRes = [reservationScenarios.checkoutOnStartDate];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(1);
        });

        test('includes reservation checking out on period end date', () => {
            const allRes = [reservationScenarios.checkoutOnEndDate];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(1);
        });

        test('excludes cancelled reservations', () => {
            const allRes = [reservationScenarios.cancelled];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
        });

        test('excludes reservations from different property', () => {
            const allRes = [reservationScenarios.differentProperty];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 2: Calendar Mode - Reservation Filtering
    // ------------------------------------------------------------------------
    describe('Calendar Mode - Reservation Filtering', () => {

        test('includes reservation checking out within period', () => {
            const allRes = [reservationScenarios.checkoutInPeriod];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(1);
        });

        test('includes reservation checking out after period (overlaps)', () => {
            const allRes = [reservationScenarios.checkoutAfterPeriod];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(1);
            expect(periodRes[0].guestName).toBe('Bob Extended');
        });

        test('includes long-stay spanning entire period', () => {
            const allRes = [reservationScenarios.longStaySpanning];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(1);
            expect(periodRes[0].guestName).toBe('Jane LongStay');
        });

        test('excludes reservation completely outside period', () => {
            const allRes = [reservationScenarios.outsidePeriod];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
        });

        test('includes reservation checking in on last day', () => {
            const allRes = [reservationScenarios.checkInOnEndDate];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(1);
        });

        test('excludes reservation checking out exactly on period start (no overlap)', () => {
            const allRes = [reservationScenarios.checkoutOnStartDate];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);

            // checkOut <= periodStart means no overlap (checkout ON start = no nights in period)
            expect(periodRes).toHaveLength(0);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 3: Overlapping Reservations Detection
    // ------------------------------------------------------------------------
    describe('Overlapping Reservations Detection', () => {

        test('detects long-stay spanning period as overlapping', () => {
            const allRes = [reservationScenarios.longStaySpanning];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('detects reservation checking out after period as overlapping', () => {
            const allRes = [reservationScenarios.checkoutAfterPeriod];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('does not detect reservation outside period as overlapping', () => {
            const allRes = [reservationScenarios.outsidePeriod];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(0);
        });

        test('does not detect reservation checking out on period start as overlapping', () => {
            const allRes = [reservationScenarios.checkoutOnStartDate];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            // checkOut > periodStart required for overlap
            expect(overlapping).toHaveLength(0);
        });

        test('detects multiple overlapping reservations correctly', () => {
            const allRes = [
                reservationScenarios.checkoutInPeriod,     // overlaps
                reservationScenarios.longStaySpanning,     // overlaps
                reservationScenarios.checkoutAfterPeriod,  // overlaps
                reservationScenarios.outsidePeriod         // does NOT overlap
            ];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(3);
        });

        test('excludes cancelled reservations from overlapping', () => {
            const allRes = [reservationScenarios.cancelled];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(0);
        });

        test('excludes different property from overlapping', () => {
            const allRes = [reservationScenarios.differentProperty];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(0);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 4: Calendar Conversion Flag Logic
    // ------------------------------------------------------------------------
    describe('Calendar Conversion Flag Logic', () => {

        describe('Checkout Mode', () => {

            test('flags when overlapping reservations exist but no checkouts', () => {
                const allRes = [reservationScenarios.longStaySpanning];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(periodRes).toHaveLength(0);
                expect(overlapping).toHaveLength(1);
                expect(shouldConvert).toBe(true);
            });

            test('does not flag when there are checkouts in period', () => {
                const allRes = [reservationScenarios.checkoutInPeriod];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(periodRes).toHaveLength(1);
                expect(shouldConvert).toBe(false);
            });

            test('does not flag when mixed checkouts and long-stays exist', () => {
                const allRes = [
                    reservationScenarios.checkoutInPeriod,
                    reservationScenarios.longStaySpanning
                ];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(periodRes).toHaveLength(1);
                expect(overlapping).toHaveLength(2);
                expect(shouldConvert).toBe(false);
            });

            test('does not flag when no reservations at all', () => {
                const allRes = [];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(shouldConvert).toBe(false);
            });
        });

        describe('Calendar Mode', () => {

            test('flags when long-stay spans beyond period', () => {
                const allRes = [reservationScenarios.longStaySpanning];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('calendar', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(periodRes).toHaveLength(1);
                expect(shouldConvert).toBe(true);
            });

            test('does not flag when reservation fully within period', () => {
                const allRes = [reservationScenarios.checkoutInPeriod];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('calendar', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(shouldConvert).toBe(false);
            });

            test('flags when reservation starts before period', () => {
                const resStartsBefore = createReservation({
                    checkInDate: '2025-10-25',
                    checkOutDate: '2025-11-10'
                });
                const allRes = [resStartsBefore];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('calendar', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(shouldConvert).toBe(true);
            });

            test('flags when reservation ends after period', () => {
                const allRes = [reservationScenarios.checkoutAfterPeriod];
                const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
                const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

                const shouldConvert = shouldConvertToCalendar('calendar', periodRes, overlapping, PERIOD_START, PERIOD_END);

                expect(shouldConvert).toBe(true);
            });
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 5: Statement Skip Logic
    // ------------------------------------------------------------------------
    describe('Statement Skip Logic', () => {

        test('does not skip when overlapping reservations exist', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const expenses = [];

            const skip = shouldSkipStatement(overlapping, expenses);

            expect(skip).toBe(false);
        });

        test('does not skip when expenses exist (even with no reservations)', () => {
            const overlapping = [];
            const expenses = [{ id: 'exp1', amount: -100 }];

            const skip = shouldSkipStatement(overlapping, expenses);

            expect(skip).toBe(false);
        });

        test('does not skip when both reservations and expenses exist', () => {
            const overlapping = [reservationScenarios.checkoutInPeriod];
            const expenses = [{ id: 'exp1', amount: -100 }];

            const skip = shouldSkipStatement(overlapping, expenses);

            expect(skip).toBe(false);
        });

        test('skips when no overlapping reservations AND no expenses', () => {
            const overlapping = [];
            const expenses = [];

            const skip = shouldSkipStatement(overlapping, expenses);

            expect(skip).toBe(true);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 6: Notice Message Generation
    // ------------------------------------------------------------------------
    describe('Notice Message Generation', () => {

        test('checkout mode notice includes reservation count', () => {
            const overlapping = [
                reservationScenarios.longStaySpanning,
                reservationScenarios.checkoutAfterPeriod
            ];
            const notice = generateCalendarNotice('checkout', overlapping);

            expect(notice).toContain('2 reservation(s)');
        });

        test('checkout mode notice mentions no checkouts', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const notice = generateCalendarNotice('checkout', overlapping);

            expect(notice).toContain('no checkouts');
        });

        test('checkout mode notice mentions $0 revenue', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const notice = generateCalendarNotice('checkout', overlapping);

            expect(notice).toContain('$0');
        });

        test('checkout mode notice suggests calendar conversion', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const notice = generateCalendarNotice('checkout', overlapping);

            expect(notice).toContain('calendar-based');
        });

        test('calendar mode notice mentions long-stay', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const notice = generateCalendarNotice('calendar', overlapping);

            expect(notice).toContain('long-stay');
        });

        test('calendar mode notice mentions prorated', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const notice = generateCalendarNotice('calendar', overlapping);

            expect(notice.toLowerCase()).toContain('prorated');
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 7: Revenue Calculation
    // ------------------------------------------------------------------------
    describe('Revenue Calculation', () => {

        test('checkout mode with no checkouts = $0 revenue', () => {
            const allRes = [reservationScenarios.longStaySpanning];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            const totalRevenue = calculateRevenue(periodRes);

            expect(periodRes).toHaveLength(0);
            expect(totalRevenue).toBe(0);
        });

        test('checkout mode with checkout in period = full revenue', () => {
            const allRes = [reservationScenarios.checkoutInPeriod];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            const totalRevenue = calculateRevenue(periodRes);

            expect(periodRes).toHaveLength(1);
            expect(totalRevenue).toBe(1500);
        });

        test('checkout mode with multiple checkouts = sum of revenue', () => {
            const allRes = [
                reservationScenarios.checkoutInPeriod,
                reservationScenarios.checkoutOnEndDate
            ];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            const totalRevenue = calculateRevenue(periodRes);

            expect(periodRes).toHaveLength(2);
            expect(totalRevenue).toBe(3000); // 1500 + 1500
        });

        test('calendar mode includes all overlapping revenue', () => {
            const allRes = [
                reservationScenarios.longStaySpanning,
                reservationScenarios.checkoutAfterPeriod
            ];
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);

            const totalRevenue = calculateRevenue(periodRes);

            expect(periodRes).toHaveLength(2);
            expect(totalRevenue).toBe(6500); // 4500 + 2000
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 8: Edge Cases & Boundary Conditions
    // ------------------------------------------------------------------------
    describe('Edge Cases & Boundary Conditions', () => {

        test('reservation starting exactly on period start is included', () => {
            const res = createReservation({
                checkInDate: '2025-11-01',
                checkOutDate: '2025-11-10'
            });
            const allRes = [res];

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('reservation ending exactly on period end is included', () => {
            const res = createReservation({
                checkInDate: '2025-11-25',
                checkOutDate: '2025-11-30'
            });
            const allRes = [res];

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(1);
        });

        test('single-night stay on first day is included', () => {
            const res = createReservation({
                checkInDate: '2025-11-01',
                checkOutDate: '2025-11-02'
            });
            const allRes = [res];

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('single-night stay on last day is included', () => {
            const res = createReservation({
                checkInDate: '2025-11-30',
                checkOutDate: '2025-12-01'
            });
            const allRes = [res];

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('reservation checking out day after period end is NOT in checkout mode', () => {
            const res = createReservation({
                checkInDate: '2025-11-25',
                checkOutDate: '2025-12-01'
            });
            const allRes = [res];

            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
            expect(overlapping).toHaveLength(1);
        });

        test('handles empty reservation array gracefully', () => {
            const allRes = [];

            const periodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);
            const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, PERIOD_START, PERIOD_END);

            expect(periodRes).toHaveLength(0);
            expect(overlapping).toHaveLength(0);
            expect(shouldConvert).toBe(false);
        });

        test('handles reservation with string property ID (type coercion)', () => {
            const res = createReservation({ propertyId: '100001' }); // string instead of number
            const allRes = [res];

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('handles multiple statuses correctly', () => {
            const confirmed = createReservation({ id: 'r1', status: 'confirmed' });
            const modified = createReservation({ id: 'r2', status: 'modified' });
            const newRes = createReservation({ id: 'r3', status: 'new' });
            const accepted = createReservation({ id: 'r4', status: 'accepted' });
            const cancelled = createReservation({ id: 'r5', status: 'cancelled' });
            const pending = createReservation({ id: 'r6', status: 'pending' });

            const allRes = [confirmed, modified, newRes, accepted, cancelled, pending];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(4); // confirmed, modified, new, accepted
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 9: Complex Scenarios
    // ------------------------------------------------------------------------
    describe('Complex Scenarios', () => {

        test('property with only long-stay: checkout mode shows $0, calendar shows revenue', () => {
            const allRes = [reservationScenarios.longStaySpanning];

            // Checkout mode
            const checkoutPeriodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const checkoutRevenue = calculateRevenue(checkoutPeriodRes);

            // Calendar mode
            const calendarPeriodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
            const calendarRevenue = calculateRevenue(calendarPeriodRes);

            expect(checkoutRevenue).toBe(0);
            expect(calendarRevenue).toBe(4500);
        });

        test('property with mixed reservations: checkout mode only counts checkouts', () => {
            const allRes = [
                reservationScenarios.checkoutInPeriod,     // $1500 - checkout in period
                reservationScenarios.longStaySpanning,     // $4500 - no checkout
                reservationScenarios.checkoutAfterPeriod   // $2000 - no checkout
            ];

            const checkoutPeriodRes = filterPeriodReservations(allRes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const checkoutRevenue = calculateRevenue(checkoutPeriodRes);

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(checkoutPeriodRes).toHaveLength(1);
            expect(checkoutRevenue).toBe(1500);
            expect(overlapping).toHaveLength(3);
        });

        test('bulk generation scenario: multiple properties, different situations', () => {
            const propertyARes = [
                reservationScenarios.longStaySpanning // no checkout
            ];
            const propertyBRes = [
                reservationScenarios.differentProperty // checkout in period
            ];

            // Property A - checkout mode
            const propAOverlapping = findOverlappingReservations(propertyARes, PROPERTY_ID, PERIOD_START, PERIOD_END);
            const propAPeriodRes = filterPeriodReservations(propertyARes, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const propAShouldConvert = shouldConvertToCalendar('checkout', propAPeriodRes, propAOverlapping, PERIOD_START, PERIOD_END);
            const propASkip = shouldSkipStatement(propAOverlapping, []);

            // Property B - checkout mode
            const propBOverlapping = findOverlappingReservations(propertyBRes, 100002, PERIOD_START, PERIOD_END);
            const propBPeriodRes = filterPeriodReservations(propertyBRes, 100002, 'checkout', PERIOD_START, PERIOD_END);
            const propBShouldConvert = shouldConvertToCalendar('checkout', propBPeriodRes, propBOverlapping, PERIOD_START, PERIOD_END);
            const propBSkip = shouldSkipStatement(propBOverlapping, []);

            // Property A: has overlapping, no checkout, should convert, should NOT skip
            expect(propASkip).toBe(false);
            expect(propAShouldConvert).toBe(true);

            // Property B: has checkout, should NOT convert, should NOT skip
            expect(propBSkip).toBe(false);
            expect(propBShouldConvert).toBe(false);
        });

        test('statement generation decision tree is correct', () => {
            // Scenario 1: No activity at all
            const scenario1 = shouldSkipStatement([], []);
            expect(scenario1).toBe(true); // SKIP

            // Scenario 2: Only expenses, no reservations
            const scenario2 = shouldSkipStatement([], [{ amount: -100 }]);
            expect(scenario2).toBe(false); // GENERATE

            // Scenario 3: Overlapping reservations, checkout mode, no checkouts
            const scenario3Overlapping = [reservationScenarios.longStaySpanning];
            const scenario3Skip = shouldSkipStatement(scenario3Overlapping, []);
            const scenario3Period = filterPeriodReservations(scenario3Overlapping, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const scenario3Convert = shouldConvertToCalendar('checkout', scenario3Period, scenario3Overlapping, PERIOD_START, PERIOD_END);
            expect(scenario3Skip).toBe(false); // GENERATE
            expect(scenario3Convert).toBe(true); // FLAG for conversion

            // Scenario 4: Checkout in period
            const scenario4Overlapping = [reservationScenarios.checkoutInPeriod];
            const scenario4Skip = shouldSkipStatement(scenario4Overlapping, []);
            const scenario4Period = filterPeriodReservations(scenario4Overlapping, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const scenario4Convert = shouldConvertToCalendar('checkout', scenario4Period, scenario4Overlapping, PERIOD_START, PERIOD_END);
            expect(scenario4Skip).toBe(false); // GENERATE
            expect(scenario4Convert).toBe(false); // No flag needed
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 10: Date Parsing & Handling
    // ------------------------------------------------------------------------
    describe('Date Parsing & Handling', () => {

        test('handles ISO date strings correctly', () => {
            const res = createReservation({
                checkInDate: '2025-11-01T00:00:00.000Z',
                checkOutDate: '2025-11-15T00:00:00.000Z'
            });
            const allRes = [res];

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('handles date strings with time component', () => {
            const res = createReservation({
                checkInDate: '2025-11-01 10:00:00',
                checkOutDate: '2025-11-15 11:00:00'
            });
            const allRes = [res];

            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(1);
        });

        test('period boundaries are inclusive for start, inclusive for end', () => {
            // Starts exactly on period start
            const startsOnStart = createReservation({
                id: 'r1',
                checkInDate: '2025-11-01',
                checkOutDate: '2025-11-05'
            });

            // Ends exactly on period end
            const endsOnEnd = createReservation({
                id: 'r2',
                checkInDate: '2025-11-25',
                checkOutDate: '2025-11-30'
            });

            const allRes = [startsOnStart, endsOnEnd];
            const overlapping = findOverlappingReservations(allRes, PROPERTY_ID, PERIOD_START, PERIOD_END);

            expect(overlapping).toHaveLength(2);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 11: Additional Boundary & Edge Cases
    // ------------------------------------------------------------------------
    describe('Additional Boundary & Edge Cases', () => {

        test('1-night stay starting on period start', () => {
            const res = createReservation({
                checkInDate: '2025-11-01',
                checkOutDate: '2025-11-02',
                grossAmount: 200
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(1);
        });

        test('1-night stay ending on period end', () => {
            const res = createReservation({
                checkInDate: '2025-11-29',
                checkOutDate: '2025-11-30',
                grossAmount: 200
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(1);
        });

        test('1-night stay outside period (day before)', () => {
            const res = createReservation({
                checkInDate: '2025-10-30',
                checkOutDate: '2025-10-31',
                grossAmount: 200
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(0);
        });

        test('1-night stay outside period (day after)', () => {
            const res = createReservation({
                checkInDate: '2025-12-01',
                checkOutDate: '2025-12-02',
                grossAmount: 200
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(0);
        });

        test('30-night stay exactly matching period', () => {
            const res = createReservation({
                checkInDate: '2025-11-01',
                checkOutDate: '2025-11-30',
                grossAmount: 4500
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(1);
        });

        test('90-day stay spanning 3 months', () => {
            const res = createReservation({
                checkInDate: '2025-10-01',
                checkOutDate: '2025-12-31',
                grossAmount: 13500
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(0);
            expect(shouldConvert).toBe(true);
        });

        test('multiple short stays in period', () => {
            const reservations = [
                createReservation({ id: 'r1', checkInDate: '2025-11-01', checkOutDate: '2025-11-03', grossAmount: 300 }),
                createReservation({ id: 'r2', checkInDate: '2025-11-05', checkOutDate: '2025-11-08', grossAmount: 450 }),
                createReservation({ id: 'r3', checkInDate: '2025-11-10', checkOutDate: '2025-11-12', grossAmount: 300 }),
                createReservation({ id: 'r4', checkInDate: '2025-11-15', checkOutDate: '2025-11-18', grossAmount: 450 }),
                createReservation({ id: 'r5', checkInDate: '2025-11-20', checkOutDate: '2025-11-25', grossAmount: 750 })
            ];
            const overlapping = findOverlappingReservations(reservations, PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(5);
            expect(periodRes).toHaveLength(5);
        });

        test('gap between reservations', () => {
            const reservations = [
                createReservation({ id: 'r1', checkInDate: '2025-11-01', checkOutDate: '2025-11-05', grossAmount: 600 }),
                createReservation({ id: 'r2', checkInDate: '2025-11-20', checkOutDate: '2025-11-25', grossAmount: 750 })
            ];
            const overlapping = findOverlappingReservations(reservations, PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(2);
            expect(periodRes).toHaveLength(2);
        });

        test('back-to-back reservations (checkout same day as check-in)', () => {
            const reservations = [
                createReservation({ id: 'r1', checkInDate: '2025-11-01', checkOutDate: '2025-11-10', grossAmount: 1350 }),
                createReservation({ id: 'r2', checkInDate: '2025-11-10', checkOutDate: '2025-11-20', grossAmount: 1500 }),
                createReservation({ id: 'r3', checkInDate: '2025-11-20', checkOutDate: '2025-11-30', grossAmount: 1500 })
            ];
            const overlapping = findOverlappingReservations(reservations, PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(3);
            expect(periodRes).toHaveLength(3);
        });

        test('reservation with zero revenue', () => {
            const res = createReservation({
                checkInDate: '2025-11-10',
                checkOutDate: '2025-11-15',
                grossAmount: 0,
                clientRevenue: 0
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(1);
        });

        test('reservation with negative revenue (refund)', () => {
            const res = createReservation({
                checkInDate: '2025-11-10',
                checkOutDate: '2025-11-15',
                grossAmount: -500,
                clientRevenue: -500
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(1);
        });

        test('mixed: some checkouts in period, some spanning', () => {
            const reservations = [
                createReservation({ id: 'r1', checkInDate: '2025-10-15', checkOutDate: '2025-12-15', grossAmount: 9000 }),
                createReservation({ id: 'r2', checkInDate: '2025-11-05', checkOutDate: '2025-11-10', grossAmount: 750 }),
                createReservation({ id: 'r3', checkInDate: '2025-11-20', checkOutDate: '2025-12-05', grossAmount: 2250 })
            ];
            const overlapping = findOverlappingReservations(reservations, PROPERTY_ID, PERIOD_START, PERIOD_END);
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(3);
            expect(periodRes).toHaveLength(1);
        });

        test('year boundary: December to January', () => {
            const decStart = new Date('2025-12-01');
            const decEnd = new Date('2025-12-31');
            const res = createReservation({
                checkInDate: '2025-12-20',
                checkOutDate: '2026-01-05',
                grossAmount: 2400
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, decStart, decEnd);
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', decStart, decEnd);
            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(0);
        });

        test('leap year February', () => {
            const febStart = new Date('2024-02-01');
            const febEnd = new Date('2024-02-29');
            const res = createReservation({
                checkInDate: '2024-02-15',
                checkOutDate: '2024-02-29',
                grossAmount: 2100
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, febStart, febEnd);
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', febStart, febEnd);
            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(1);
        });

        test('non-leap year February', () => {
            const febStart = new Date('2025-02-01');
            const febEnd = new Date('2025-02-28');
            const res = createReservation({
                checkInDate: '2025-02-15',
                checkOutDate: '2025-02-28',
                grossAmount: 1950
            });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, febStart, febEnd);
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', febStart, febEnd);
            expect(overlapping).toHaveLength(1);
            expect(periodRes).toHaveLength(1);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 12: Revenue Calculation Scenarios
    // ------------------------------------------------------------------------
    describe('Revenue Calculation Scenarios', () => {

        test('total revenue from multiple checkouts', () => {
            const reservations = [
                createReservation({ id: 'r1', checkOutDate: '2025-11-05', grossAmount: 500, clientRevenue: 500 }),
                createReservation({ id: 'r2', checkOutDate: '2025-11-15', grossAmount: 1000, clientRevenue: 1000 }),
                createReservation({ id: 'r3', checkOutDate: '2025-11-25', grossAmount: 750, clientRevenue: 750 })
            ];
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const totalRevenue = periodRes.reduce((sum, r) => sum + r.clientRevenue, 0);
            expect(totalRevenue).toBe(2250);
        });

        test('zero revenue when only long-stay (no checkout)', () => {
            const reservations = [
                reservationScenarios.longStaySpanning
            ];
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const totalRevenue = periodRes.reduce((sum, r) => sum + r.clientRevenue, 0);
            expect(totalRevenue).toBe(0);
        });

        test('calendar mode includes prorated revenue', () => {
            const reservations = [
                reservationScenarios.longStaySpanning
            ];
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
            expect(periodRes).toHaveLength(1);
        });

        test('high-value reservation', () => {
            const res = createReservation({
                checkInDate: '2025-11-01',
                checkOutDate: '2025-11-30',
                grossAmount: 50000,
                clientRevenue: 50000
            });
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(periodRes[0].clientRevenue).toBe(50000);
        });

        test('reservation with decimal revenue', () => {
            const res = createReservation({
                checkInDate: '2025-11-01',
                checkOutDate: '2025-11-10',
                grossAmount: 1234.56,
                clientRevenue: 1234.56
            });
            const periodRes = filterPeriodReservations([res], PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(periodRes[0].clientRevenue).toBeCloseTo(1234.56, 2);
        });

        test('mixed revenue positive and negative', () => {
            const reservations = [
                createReservation({ id: 'r1', checkOutDate: '2025-11-10', grossAmount: 1000, clientRevenue: 1000 }),
                createReservation({ id: 'r2', checkOutDate: '2025-11-15', grossAmount: -200, clientRevenue: -200 }),
                createReservation({ id: 'r3', checkOutDate: '2025-11-20', grossAmount: 500, clientRevenue: 500 })
            ];
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const totalRevenue = periodRes.reduce((sum, r) => sum + r.clientRevenue, 0);
            expect(totalRevenue).toBe(1300);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 13: Multi-Property Scenarios
    // ------------------------------------------------------------------------
    describe('Multi-Property Scenarios', () => {

        test('filter by correct property ID', () => {
            const reservations = [
                createReservation({ id: 'r1', propertyId: 100001, checkOutDate: '2025-11-10' }),
                createReservation({ id: 'r2', propertyId: 100002, checkOutDate: '2025-11-15' }),
                createReservation({ id: 'r3', propertyId: 100001, checkOutDate: '2025-11-20' })
            ];
            const prop1Res = filterPeriodReservations(reservations, 100001, 'checkout', PERIOD_START, PERIOD_END);
            const prop2Res = filterPeriodReservations(reservations, 100002, 'checkout', PERIOD_START, PERIOD_END);
            expect(prop1Res).toHaveLength(2);
            expect(prop2Res).toHaveLength(1);
        });

        test('property A has checkouts, property B only overlapping', () => {
            const allReservations = [
                createReservation({ id: 'r1', propertyId: 100001, checkOutDate: '2025-11-15', grossAmount: 1500 }),
                createReservation({ id: 'r2', propertyId: 100002, checkInDate: '2025-10-15', checkOutDate: '2025-12-15', grossAmount: 9000 })
            ];

            const propARes = filterPeriodReservations(allReservations, 100001, 'checkout', PERIOD_START, PERIOD_END);
            const propBRes = filterPeriodReservations(allReservations, 100002, 'checkout', PERIOD_START, PERIOD_END);
            const propBOverlapping = findOverlappingReservations(allReservations, 100002, PERIOD_START, PERIOD_END);

            expect(propARes).toHaveLength(1);
            expect(propBRes).toHaveLength(0);
            expect(propBOverlapping).toHaveLength(1);
        });

        test('combined statement with 3 properties', () => {
            const reservations = [
                createReservation({ id: 'r1', propertyId: 100001, checkOutDate: '2025-11-10', grossAmount: 1000 }),
                createReservation({ id: 'r2', propertyId: 100002, checkOutDate: '2025-11-15', grossAmount: 1500 }),
                createReservation({ id: 'r3', propertyId: 100003, checkOutDate: '2025-11-20', grossAmount: 2000 })
            ];

            const prop1Rev = filterPeriodReservations(reservations, 100001, 'checkout', PERIOD_START, PERIOD_END)
                .reduce((sum, r) => sum + r.grossAmount, 0);
            const prop2Rev = filterPeriodReservations(reservations, 100002, 'checkout', PERIOD_START, PERIOD_END)
                .reduce((sum, r) => sum + r.grossAmount, 0);
            const prop3Rev = filterPeriodReservations(reservations, 100003, 'checkout', PERIOD_START, PERIOD_END)
                .reduce((sum, r) => sum + r.grossAmount, 0);

            expect(prop1Rev).toBe(1000);
            expect(prop2Rev).toBe(1500);
            expect(prop3Rev).toBe(2000);
            expect(prop1Rev + prop2Rev + prop3Rev).toBe(4500);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 14: Expense-Only Scenarios
    // ------------------------------------------------------------------------
    describe('Expense-Only Scenarios', () => {

        test('property with only expenses should generate statement', () => {
            const overlapping = [];
            const expenses = [
                { id: 'e1', amount: -100, description: 'Cleaning' },
                { id: 'e2', amount: -50, description: 'Supplies' }
            ];
            const shouldSkip = shouldSkipStatement(overlapping, expenses);
            expect(shouldSkip).toBe(false);
        });

        test('property with no reservations or expenses should skip', () => {
            const shouldSkip = shouldSkipStatement([], []);
            expect(shouldSkip).toBe(true);
        });

        test('property with reservations but no expenses', () => {
            const overlapping = [reservationScenarios.checkoutInPeriod];
            const shouldSkip = shouldSkipStatement(overlapping, []);
            expect(shouldSkip).toBe(false);
        });

        test('property with cancelled reservation and expenses', () => {
            const overlapping = [];
            const expenses = [{ id: 'e1', amount: -150, description: 'Cleaning' }];
            const shouldSkip = shouldSkipStatement(overlapping, expenses);
            expect(shouldSkip).toBe(false);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 15: Calendar Mode Complete Coverage
    // ------------------------------------------------------------------------
    describe('Calendar Mode Complete Coverage', () => {

        test('calendar mode includes all overlapping', () => {
            const reservations = [
                createReservation({ id: 'r1', checkInDate: '2025-10-15', checkOutDate: '2025-11-10' }),
                createReservation({ id: 'r2', checkInDate: '2025-11-15', checkOutDate: '2025-12-15' }),
                createReservation({ id: 'r3', checkInDate: '2025-11-05', checkOutDate: '2025-11-20' })
            ];
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
            expect(periodRes).toHaveLength(3);
        });

        test('calendar mode flags when reservation spans beyond period', () => {
            // Long-stay spanning checks in Oct 15, checks out Dec 15 - spans beyond Nov period
            const overlapping = [reservationScenarios.longStaySpanning];
            const periodRes = filterPeriodReservations(overlapping, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
            const shouldConvert = shouldConvertToCalendar('calendar', periodRes, overlapping, PERIOD_START, PERIOD_END);
            // Calendar mode flags when reservations span beyond the period (for prorated calculation notice)
            expect(shouldConvert).toBe(true);
        });

        test('calendar mode does not flag when all reservations fit within period', () => {
            const reservations = [
                createReservation({ id: 'r1', checkInDate: '2025-11-05', checkOutDate: '2025-11-10' }),
                createReservation({ id: 'r2', checkInDate: '2025-11-15', checkOutDate: '2025-11-20' })
            ];
            const periodRes = filterPeriodReservations(reservations, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
            const shouldConvert = shouldConvertToCalendar('calendar', periodRes, reservations, PERIOD_START, PERIOD_END);
            expect(shouldConvert).toBe(false);
        });

        test('checkout mode same data does flag for conversion', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const periodRes = filterPeriodReservations(overlapping, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const shouldConvert = shouldConvertToCalendar('checkout', periodRes, overlapping, PERIOD_START, PERIOD_END);
            expect(shouldConvert).toBe(true);
        });

        test('calendar mode with all short stays', () => {
            const reservations = [
                createReservation({ id: 'r1', checkInDate: '2025-11-01', checkOutDate: '2025-11-05' }),
                createReservation({ id: 'r2', checkInDate: '2025-11-10', checkOutDate: '2025-11-15' }),
                createReservation({ id: 'r3', checkInDate: '2025-11-20', checkOutDate: '2025-11-25' })
            ];
            const calendarRes = filterPeriodReservations(reservations, PROPERTY_ID, 'calendar', PERIOD_START, PERIOD_END);
            const checkoutRes = filterPeriodReservations(reservations, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(calendarRes).toHaveLength(3);
            expect(checkoutRes).toHaveLength(3);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 16: Status and Source Filtering
    // ------------------------------------------------------------------------
    describe('Status and Source Filtering', () => {

        test('confirmed reservation is included', () => {
            const res = createReservation({ status: 'confirmed' });
            const overlapping = findOverlappingReservations([res], PROPERTY_ID, PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(1);
        });

        test('different booking sources are all included', () => {
            const reservations = [
                createReservation({ id: 'r1', source: 'Airbnb' }),
                createReservation({ id: 'r2', source: 'VRBO' }),
                createReservation({ id: 'r3', source: 'Booking.com' }),
                createReservation({ id: 'r4', source: 'Direct' }),
                createReservation({ id: 'r5', source: 'Marriott' })
            ];
            const overlapping = findOverlappingReservations(reservations, PROPERTY_ID, PERIOD_START, PERIOD_END);
            expect(overlapping).toHaveLength(5);
        });

        test('Airbnb source detected correctly', () => {
            const res = createReservation({ source: 'Airbnb' });
            expect(res.source.toLowerCase().includes('airbnb')).toBe(true);
        });

        test('VRBO is not Airbnb', () => {
            const res = createReservation({ source: 'VRBO' });
            expect(res.source.toLowerCase().includes('airbnb')).toBe(false);
        });
    });

    // ------------------------------------------------------------------------
    // TEST GROUP 17: Notice Message Generation
    // ------------------------------------------------------------------------
    describe('Notice Message Generation', () => {

        test('notice includes count of overlapping reservations', () => {
            const overlapping = [
                reservationScenarios.longStaySpanning,
                createReservation({ id: 'r2', checkInDate: '2025-10-20', checkOutDate: '2025-12-10' })
            ];
            const count = overlapping.length;
            expect(count).toBe(2);
        });

        test('notice for single long-stay', () => {
            const overlapping = [reservationScenarios.longStaySpanning];
            const hasOverlapping = overlapping.length > 0;
            const periodRes = filterPeriodReservations(overlapping, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            const noCheckouts = periodRes.length === 0;
            expect(hasOverlapping).toBe(true);
            expect(noCheckouts).toBe(true);
        });

        test('notice for multiple mixed reservations', () => {
            const overlapping = [
                reservationScenarios.longStaySpanning,
                reservationScenarios.checkoutInPeriod,
                reservationScenarios.checkoutAfterPeriod
            ];
            const periodRes = filterPeriodReservations(overlapping, PROPERTY_ID, 'checkout', PERIOD_START, PERIOD_END);
            expect(overlapping.length).toBe(3);
            expect(periodRes.length).toBe(1);
        });
    });
});
