/**
 * Reservation Logic Tests - Jest Test Suite
 *
 * Tests for reservation filtering, date calculations,
 * prorated revenue, and multi-property scenarios.
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const ALLOWED_STATUSES = ['confirmed', 'modified', 'new', 'accepted'];

function isValidStatus(status) {
    return ALLOWED_STATUSES.includes(status);
}

function isReservationInDateRange(checkIn, checkOut, periodStart, periodEnd, calculationType) {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    if (calculationType === 'calendar') {
        // Calendar: Any overlap with period
        return checkInDate <= end && checkOutDate > start;
    } else {
        // Checkout: Checkout falls within period
        return checkOutDate >= start && checkOutDate <= end;
    }
}

function getDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateProratedRevenue(reservation, periodStart, periodEnd) {
    const checkIn = new Date(reservation.checkInDate);
    const checkOut = new Date(reservation.checkOutDate);
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    // Total nights in reservation
    const totalNights = getDaysBetween(checkIn, checkOut);
    if (totalNights === 0) return 0;

    // Calculate overlap
    const overlapStart = checkIn > start ? checkIn : start;
    const overlapEnd = checkOut < end ? checkOut : new Date(end.getTime() + 86400000); // Include end date

    const nightsInPeriod = Math.max(0, getDaysBetween(overlapStart, overlapEnd));

    // Prorate revenue
    const nightlyRate = reservation.clientRevenue / totalNights;
    return Math.round(nightlyRate * nightsInPeriod * 100) / 100;
}

function isOverlappingReservation(reservation, periodStart, periodEnd) {
    const checkIn = new Date(reservation.checkInDate);
    const checkOut = new Date(reservation.checkOutDate);
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    return checkIn <= end && checkOut > start;
}

function sortReservationsByCheckout(reservations) {
    return [...reservations].sort((a, b) => {
        return new Date(a.checkOutDate) - new Date(b.checkOutDate);
    });
}

function groupReservationsByProperty(reservations) {
    const groups = {};
    for (const res of reservations) {
        const propId = res.propertyId;
        if (!groups[propId]) groups[propId] = [];
        groups[propId].push(res);
    }
    return groups;
}

function getTotalRevenue(reservations) {
    return reservations.reduce((sum, res) => sum + (res.clientRevenue || 0), 0);
}

function getTotalNights(reservations) {
    return reservations.reduce((sum, res) => {
        return sum + getDaysBetween(res.checkInDate, res.checkOutDate);
    }, 0);
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Reservation Status Validation', () => {

    describe('isValidStatus', () => {
        test('confirmed is valid', () => {
            expect(isValidStatus('confirmed')).toBe(true);
        });

        test('modified is valid', () => {
            expect(isValidStatus('modified')).toBe(true);
        });

        test('new is valid', () => {
            expect(isValidStatus('new')).toBe(true);
        });

        test('accepted is valid', () => {
            expect(isValidStatus('accepted')).toBe(true);
        });

        test('cancelled is NOT valid', () => {
            expect(isValidStatus('cancelled')).toBe(false);
        });

        test('pending is NOT valid', () => {
            expect(isValidStatus('pending')).toBe(false);
        });

        test('declined is NOT valid', () => {
            expect(isValidStatus('declined')).toBe(false);
        });

        test('null is NOT valid', () => {
            expect(isValidStatus(null)).toBe(false);
        });

        test('undefined is NOT valid', () => {
            expect(isValidStatus(undefined)).toBe(false);
        });

        test('empty string is NOT valid', () => {
            expect(isValidStatus('')).toBe(false);
        });
    });
});

describe('Date Range Calculations', () => {

    describe('isReservationInDateRange - Checkout Mode', () => {
        const periodStart = '2025-11-01';
        const periodEnd = '2025-11-30';

        test('checkout within period', () => {
            expect(isReservationInDateRange('2025-11-01', '2025-11-15', periodStart, periodEnd, 'checkout')).toBe(true);
        });

        test('checkout on period start', () => {
            expect(isReservationInDateRange('2025-10-25', '2025-11-01', periodStart, periodEnd, 'checkout')).toBe(true);
        });

        test('checkout on period end', () => {
            expect(isReservationInDateRange('2025-11-25', '2025-11-30', periodStart, periodEnd, 'checkout')).toBe(true);
        });

        test('checkout before period', () => {
            expect(isReservationInDateRange('2025-10-15', '2025-10-25', periodStart, periodEnd, 'checkout')).toBe(false);
        });

        test('checkout after period', () => {
            expect(isReservationInDateRange('2025-11-20', '2025-12-05', periodStart, periodEnd, 'checkout')).toBe(false);
        });
    });

    describe('isReservationInDateRange - Calendar Mode', () => {
        const periodStart = '2025-11-01';
        const periodEnd = '2025-11-30';

        test('fully within period', () => {
            expect(isReservationInDateRange('2025-11-05', '2025-11-10', periodStart, periodEnd, 'calendar')).toBe(true);
        });

        test('spans entire period (long-stay)', () => {
            expect(isReservationInDateRange('2025-10-15', '2025-12-15', periodStart, periodEnd, 'calendar')).toBe(true);
        });

        test('starts before, ends within', () => {
            expect(isReservationInDateRange('2025-10-25', '2025-11-10', periodStart, periodEnd, 'calendar')).toBe(true);
        });

        test('starts within, ends after', () => {
            expect(isReservationInDateRange('2025-11-20', '2025-12-05', periodStart, periodEnd, 'calendar')).toBe(true);
        });

        test('completely before period', () => {
            expect(isReservationInDateRange('2025-10-01', '2025-10-15', periodStart, periodEnd, 'calendar')).toBe(false);
        });

        test('completely after period', () => {
            expect(isReservationInDateRange('2025-12-05', '2025-12-15', periodStart, periodEnd, 'calendar')).toBe(false);
        });

        test('ends exactly on period start (no overlap)', () => {
            expect(isReservationInDateRange('2025-10-25', '2025-11-01', periodStart, periodEnd, 'calendar')).toBe(false);
        });
    });
});

describe('Overlap Detection', () => {

    describe('isOverlappingReservation', () => {
        const periodStart = '2025-11-01';
        const periodEnd = '2025-11-30';

        test('fully contained reservation overlaps', () => {
            const res = { checkInDate: '2025-11-05', checkOutDate: '2025-11-10' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(true);
        });

        test('long-stay spanning period overlaps', () => {
            const res = { checkInDate: '2025-10-15', checkOutDate: '2025-12-15' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(true);
        });

        test('starts before, ends within overlaps', () => {
            const res = { checkInDate: '2025-10-20', checkOutDate: '2025-11-10' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(true);
        });

        test('starts within, ends after overlaps', () => {
            const res = { checkInDate: '2025-11-20', checkOutDate: '2025-12-10' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(true);
        });

        test('completely before does not overlap', () => {
            const res = { checkInDate: '2025-10-01', checkOutDate: '2025-10-15' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(false);
        });

        test('completely after does not overlap', () => {
            const res = { checkInDate: '2025-12-10', checkOutDate: '2025-12-20' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(false);
        });

        test('checkout on period start does not overlap', () => {
            const res = { checkInDate: '2025-10-25', checkOutDate: '2025-11-01' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(false);
        });

        test('checkin on period end overlaps', () => {
            const res = { checkInDate: '2025-11-30', checkOutDate: '2025-12-05' };
            expect(isOverlappingReservation(res, periodStart, periodEnd)).toBe(true);
        });
    });
});

describe('Prorated Revenue Calculation', () => {

    describe('calculateProratedRevenue', () => {
        test('reservation fully within period gets full revenue', () => {
            const res = {
                checkInDate: '2025-11-05',
                checkOutDate: '2025-11-10',
                clientRevenue: 500
            };
            const prorated = calculateProratedRevenue(res, '2025-11-01', '2025-11-30');
            expect(prorated).toBeCloseTo(500, 0);
        });

        test('long-stay spanning gets prorated portion', () => {
            const res = {
                checkInDate: '2025-10-15',
                checkOutDate: '2025-12-15',
                clientRevenue: 6000 // 61 nights, ~$98/night
            };
            // Nov 1-30 is 30 nights out of 61 total
            const prorated = calculateProratedRevenue(res, '2025-11-01', '2025-11-30');
            expect(prorated).toBeGreaterThan(2900);
            expect(prorated).toBeLessThan(3100);
        });

        test('zero revenue returns zero', () => {
            const res = {
                checkInDate: '2025-11-05',
                checkOutDate: '2025-11-10',
                clientRevenue: 0
            };
            const prorated = calculateProratedRevenue(res, '2025-11-01', '2025-11-30');
            expect(prorated).toBe(0);
        });

        test('one night stay', () => {
            const res = {
                checkInDate: '2025-11-15',
                checkOutDate: '2025-11-16',
                clientRevenue: 150
            };
            const prorated = calculateProratedRevenue(res, '2025-11-01', '2025-11-30');
            expect(prorated).toBeCloseTo(150, 0);
        });
    });
});

describe('Reservation Sorting', () => {

    describe('sortReservationsByCheckout', () => {
        test('sorts by checkout date ascending', () => {
            const reservations = [
                { id: 'r3', checkOutDate: '2025-11-25' },
                { id: 'r1', checkOutDate: '2025-11-05' },
                { id: 'r2', checkOutDate: '2025-11-15' }
            ];
            const sorted = sortReservationsByCheckout(reservations);
            expect(sorted[0].id).toBe('r1');
            expect(sorted[1].id).toBe('r2');
            expect(sorted[2].id).toBe('r3');
        });

        test('handles same checkout dates', () => {
            const reservations = [
                { id: 'r1', checkOutDate: '2025-11-15' },
                { id: 'r2', checkOutDate: '2025-11-15' }
            ];
            const sorted = sortReservationsByCheckout(reservations);
            expect(sorted).toHaveLength(2);
        });

        test('empty array returns empty', () => {
            const sorted = sortReservationsByCheckout([]);
            expect(sorted).toHaveLength(0);
        });

        test('single reservation', () => {
            const sorted = sortReservationsByCheckout([{ id: 'r1', checkOutDate: '2025-11-15' }]);
            expect(sorted).toHaveLength(1);
        });

        test('does not mutate original array', () => {
            const original = [
                { id: 'r2', checkOutDate: '2025-11-15' },
                { id: 'r1', checkOutDate: '2025-11-05' }
            ];
            const sorted = sortReservationsByCheckout(original);
            expect(original[0].id).toBe('r2');
            expect(sorted[0].id).toBe('r1');
        });
    });
});

describe('Reservation Grouping', () => {

    describe('groupReservationsByProperty', () => {
        test('groups reservations by propertyId', () => {
            const reservations = [
                { id: 'r1', propertyId: 100001 },
                { id: 'r2', propertyId: 100002 },
                { id: 'r3', propertyId: 100001 },
                { id: 'r4', propertyId: 100002 },
                { id: 'r5', propertyId: 100003 }
            ];
            const groups = groupReservationsByProperty(reservations);

            expect(Object.keys(groups)).toHaveLength(3);
            expect(groups[100001]).toHaveLength(2);
            expect(groups[100002]).toHaveLength(2);
            expect(groups[100003]).toHaveLength(1);
        });

        test('empty array returns empty object', () => {
            const groups = groupReservationsByProperty([]);
            expect(Object.keys(groups)).toHaveLength(0);
        });

        test('single property', () => {
            const reservations = [
                { id: 'r1', propertyId: 100001 },
                { id: 'r2', propertyId: 100001 }
            ];
            const groups = groupReservationsByProperty(reservations);
            expect(Object.keys(groups)).toHaveLength(1);
            expect(groups[100001]).toHaveLength(2);
        });
    });
});

describe('Revenue Aggregation', () => {

    describe('getTotalRevenue', () => {
        test('sums revenue from multiple reservations', () => {
            const reservations = [
                { clientRevenue: 500 },
                { clientRevenue: 750 },
                { clientRevenue: 1000 }
            ];
            expect(getTotalRevenue(reservations)).toBe(2250);
        });

        test('handles zero revenue', () => {
            const reservations = [
                { clientRevenue: 500 },
                { clientRevenue: 0 },
                { clientRevenue: 500 }
            ];
            expect(getTotalRevenue(reservations)).toBe(1000);
        });

        test('handles missing clientRevenue', () => {
            const reservations = [
                { clientRevenue: 500 },
                { grossAmount: 750 }, // Missing clientRevenue
                { clientRevenue: 500 }
            ];
            expect(getTotalRevenue(reservations)).toBe(1000);
        });

        test('empty array returns 0', () => {
            expect(getTotalRevenue([])).toBe(0);
        });

        test('large revenue amounts', () => {
            const reservations = [
                { clientRevenue: 50000 },
                { clientRevenue: 75000 },
                { clientRevenue: 100000 }
            ];
            expect(getTotalRevenue(reservations)).toBe(225000);
        });
    });

    describe('getTotalNights', () => {
        test('sums nights from multiple reservations', () => {
            const reservations = [
                { checkInDate: '2025-11-01', checkOutDate: '2025-11-05' }, // 4 nights
                { checkInDate: '2025-11-10', checkOutDate: '2025-11-15' }, // 5 nights
                { checkInDate: '2025-11-20', checkOutDate: '2025-11-22' }  // 2 nights
            ];
            expect(getTotalNights(reservations)).toBe(11);
        });

        test('handles one-night stays', () => {
            const reservations = [
                { checkInDate: '2025-11-01', checkOutDate: '2025-11-02' },
                { checkInDate: '2025-11-05', checkOutDate: '2025-11-06' }
            ];
            expect(getTotalNights(reservations)).toBe(2);
        });

        test('empty array returns 0', () => {
            expect(getTotalNights([])).toBe(0);
        });
    });
});

describe('Days Between Calculation', () => {

    describe('getDaysBetween', () => {
        test('same day returns 0', () => {
            expect(getDaysBetween('2025-11-15', '2025-11-15')).toBe(0);
        });

        test('one day', () => {
            expect(getDaysBetween('2025-11-15', '2025-11-16')).toBe(1);
        });

        test('one week', () => {
            expect(getDaysBetween('2025-11-01', '2025-11-08')).toBe(7);
        });

        test('handles reverse order (absolute)', () => {
            expect(getDaysBetween('2025-11-16', '2025-11-15')).toBe(1);
        });

        test('year boundary', () => {
            expect(getDaysBetween('2025-12-31', '2026-01-01')).toBe(1);
        });

        test('month boundary', () => {
            expect(getDaysBetween('2025-11-30', '2025-12-01')).toBe(1);
        });

        test('30 days', () => {
            expect(getDaysBetween('2025-11-01', '2025-12-01')).toBe(30);
        });

        test('leap year February', () => {
            expect(getDaysBetween('2024-02-01', '2024-03-01')).toBe(29);
        });

        test('non-leap year February', () => {
            expect(getDaysBetween('2025-02-01', '2025-03-01')).toBe(28);
        });
    });
});

describe('Complex Scenarios', () => {

    describe('Multi-property Combined Statement', () => {
        test('aggregates revenue across properties', () => {
            const reservations = [
                { propertyId: 100001, clientRevenue: 1000 },
                { propertyId: 100001, clientRevenue: 1500 },
                { propertyId: 100002, clientRevenue: 2000 },
                { propertyId: 100002, clientRevenue: 2500 },
                { propertyId: 100003, clientRevenue: 3000 }
            ];

            const groups = groupReservationsByProperty(reservations);
            const totals = {};

            for (const [propId, propRes] of Object.entries(groups)) {
                totals[propId] = getTotalRevenue(propRes);
            }

            expect(totals[100001]).toBe(2500);
            expect(totals[100002]).toBe(4500);
            expect(totals[100003]).toBe(3000);
        });

        test('total revenue matches sum of property totals', () => {
            const reservations = [
                { propertyId: 100001, clientRevenue: 1000 },
                { propertyId: 100002, clientRevenue: 2000 },
                { propertyId: 100003, clientRevenue: 3000 }
            ];

            const totalDirect = getTotalRevenue(reservations);
            const groups = groupReservationsByProperty(reservations);
            const totalFromGroups = Object.values(groups).reduce((sum, propRes) => {
                return sum + getTotalRevenue(propRes);
            }, 0);

            expect(totalDirect).toBe(totalFromGroups);
            expect(totalDirect).toBe(6000);
        });
    });

    describe('Mixed Calculation Types', () => {
        test('checkout mode excludes long-stay revenue', () => {
            const reservations = [
                { id: 'checkout', checkInDate: '2025-11-01', checkOutDate: '2025-11-15', clientRevenue: 1500 },
                { id: 'longstay', checkInDate: '2025-10-15', checkOutDate: '2025-12-15', clientRevenue: 6000 }
            ];
            const periodStart = '2025-11-01';
            const periodEnd = '2025-11-30';

            const checkoutRes = reservations.filter(r =>
                isReservationInDateRange(r.checkInDate, r.checkOutDate, periodStart, periodEnd, 'checkout')
            );
            const checkoutRevenue = getTotalRevenue(checkoutRes);

            expect(checkoutRevenue).toBe(1500);
        });

        test('calendar mode includes long-stay revenue', () => {
            const reservations = [
                { id: 'checkout', checkInDate: '2025-11-01', checkOutDate: '2025-11-15', clientRevenue: 1500 },
                { id: 'longstay', checkInDate: '2025-10-15', checkOutDate: '2025-12-15', clientRevenue: 6000 }
            ];
            const periodStart = '2025-11-01';
            const periodEnd = '2025-11-30';

            const calendarRes = reservations.filter(r =>
                isReservationInDateRange(r.checkInDate, r.checkOutDate, periodStart, periodEnd, 'calendar')
            );
            const calendarRevenue = getTotalRevenue(calendarRes);

            expect(calendarRevenue).toBe(7500);
        });
    });
});
