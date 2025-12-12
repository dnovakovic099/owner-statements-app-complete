/**
 * Test Cases for cleaningFeePassThrough Feature
 * Converted to Jest format
 *
 * Tests the "Swap" Logic:
 * - Step A: Show guest-paid cleaning fee in "Cleaning Expense" column
 * - Step B: Deduct from Gross Payout calculation
 * - Step C: Suppress standard cleaning expenses from expense list
 */

// Mock data for testing
const mockListings = {
    propertyA: {
        id: 100001,
        name: 'Property A - PassThrough Enabled',
        nickname: 'Property A',
        pmFeePercentage: 15,
        cleaningFeePassThrough: true,
        cleaningFee: 300,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    propertyB: {
        id: 100002,
        name: 'Property B - PassThrough Disabled',
        nickname: 'Property B',
        pmFeePercentage: 15,
        cleaningFeePassThrough: false,
        cleaningFee: 250,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    propertyC: {
        id: 100003,
        name: 'Property C - PassThrough + CoHost',
        nickname: 'Property C',
        pmFeePercentage: 15,
        cleaningFeePassThrough: true,
        cleaningFee: 200,
        isCohostOnAirbnb: true,
        disregardTax: false,
        airbnbPassThroughTax: false
    },
    propertyD: {
        id: 100004,
        name: 'Property D - PassThrough + DisregardTax',
        nickname: 'Property D',
        pmFeePercentage: 20,
        cleaningFeePassThrough: true,
        cleaningFee: 350,
        isCohostOnAirbnb: false,
        disregardTax: true,
        airbnbPassThroughTax: false
    },
    propertyE: {
        id: 100005,
        name: 'Property E - PassThrough No Default',
        nickname: 'Property E',
        pmFeePercentage: 15,
        cleaningFeePassThrough: true,
        cleaningFee: 0,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false
    }
};

const mockReservations = {
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
        cleaningFee: 0,
        cleaningAndOtherFees: 0,
        platformFees: 0,
        clientRevenue: 400,
        clientTaxResponsibility: 40,
        grossAmount: 440
    }
};

const mockExpenses = {
    cleaningExpA: {
        id: 'exp-clean-a',
        propertyId: 100001,
        description: 'Cleaning Service',
        category: 'Cleaning',
        type: 'expense',
        amount: -150,
        date: '2025-12-05'
    },
    cleaningExpB: {
        id: 'exp-clean-b',
        propertyId: 100002,
        description: 'Cleaning Service',
        category: 'Cleaning',
        type: 'expense',
        amount: -120,
        date: '2025-12-05'
    },
    otherExpA: {
        id: 'exp-other-a',
        propertyId: 100001,
        description: 'Lawn Service',
        category: 'Lawn',
        type: 'expense',
        amount: -50,
        date: '2025-12-05'
    },
    otherExpB: {
        id: 'exp-other-b',
        propertyId: 100002,
        description: 'Pest Control',
        category: 'Pest Control',
        type: 'expense',
        amount: -75,
        date: '2025-12-05'
    },
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

// Helper functions
function calculateGrossPayout(reservation, listing) {
    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
    const pmFee = clientRevenue * (listing.pmFeePercentage / 100);
    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

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

function shouldShowCleaningMismatchWarning(reservations, listing) {
    if (!listing.cleaningFeePassThrough) return { show: false };

    const reservationsWithOwnCleaningFee = reservations.filter(res =>
        res.cleaningFee && res.cleaningFee > 0
    );

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

function calculateTotalExpenses(expenses) {
    return expenses.reduce((sum, exp) => {
        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell');
        return isUpsell ? sum : sum + Math.abs(exp.amount);
    }, 0);
}

// ============================================================================
// TEST GROUP 1: Single Property - PassThrough ENABLED
// ============================================================================
describe('Single Property - PassThrough ENABLED', () => {
    test('1.1 Cleaning fee should be deducted from gross payout', () => {
        const result = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
        const expected = 1030 - (1030 * 0.15) - 350;
        expect(result.cleaningFeeForPassThrough).toBe(350);
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });

    test('1.2 Cleaning expenses should be filtered out', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [mockExpenses.cleaningExpA, mockExpenses.otherExpA];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(1);
        expect(filtered[0].id).toBe('exp-other-a');
    });

    test('1.3 Expense with "cleaning" in description should be filtered', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [mockExpenses.cleaningDescExp, mockExpenses.otherExpA];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(1);
        expect(filtered[0].id).toBe('exp-other-a');
    });

    test('1.4 Reservation with $0 cleaning fee should use listing default', () => {
        const result = calculateGrossPayout(mockReservations.resA2, mockListings.propertyA);
        const expected = 400 - (400 * 0.15) + 40 - 300;
        expect(result.cleaningFeeForPassThrough).toBe(300);
        expect(result.usedListingDefault).toBe(true);
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });
});

// ============================================================================
// TEST GROUP 2: Single Property - PassThrough DISABLED
// ============================================================================
describe('Single Property - PassThrough DISABLED', () => {
    test('2.1 Cleaning fee should NOT be deducted from gross payout', () => {
        const result = calculateGrossPayout(mockReservations.resB1, mockListings.propertyB);
        const expected = 760 - (760 * 0.15) + 80;
        expect(result.cleaningFeeForPassThrough).toBe(0);
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });

    test('2.2 Cleaning expenses should NOT be filtered', () => {
        const listingInfoMap = { 100002: mockListings.propertyB };
        const expenses = [mockExpenses.cleaningExpB, mockExpenses.otherExpB];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(2);
    });
});

// ============================================================================
// TEST GROUP 3: Combined Statement - MIXED Settings
// ============================================================================
describe('Combined Statement - MIXED Settings', () => {
    test('3.1 Property A should deduct cleaning, Property B should not', () => {
        const resultA = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
        const resultB = calculateGrossPayout(mockReservations.resB1, mockListings.propertyB);
        expect(resultA.cleaningFeeForPassThrough).toBe(350);
        expect(resultB.cleaningFeeForPassThrough).toBe(0);
    });

    test('3.2 Expense filtering should be per-property', () => {
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
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(3);
        expect(filtered.find(e => e.id === 'exp-clean-a')).toBeUndefined();
        expect(filtered.find(e => e.id === 'exp-clean-b')).toBeTruthy();
    });

    test('3.3 Combined gross payout sum should be correct', () => {
        const resultA = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
        const resultB = calculateGrossPayout(mockReservations.resB1, mockListings.propertyB);
        const combinedGrossPayout = resultA.grossPayout + resultB.grossPayout;
        const expectedA = 1030 - (1030 * 0.15) - 350;
        const expectedB = 760 - (760 * 0.15) + 80;
        const expectedCombined = Math.round((expectedA + expectedB) * 100) / 100;
        expect(combinedGrossPayout).toBe(expectedCombined);
    });

    test('3.4 Combined total expenses should exclude Property A cleaning only', () => {
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
        const filtered = filterExpenses(expenses, listingInfoMap);
        const totalExpenses = calculateTotalExpenses(filtered);
        expect(totalExpenses).toBe(245);
    });
});

// ============================================================================
// TEST GROUP 4: Co-Host Airbnb with PassThrough
// ============================================================================
describe('Co-Host Airbnb with PassThrough', () => {
    test('4.1 CoHost Airbnb should have negative gross payout minus cleaning', () => {
        const result = calculateGrossPayout(mockReservations.resC1, mockListings.propertyC);
        const pmFee = 625 * 0.15;
        const expected = -pmFee - 200;
        expect(result.isCohostAirbnb).toBe(true);
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });
});

// ============================================================================
// TEST GROUP 5: DisregardTax with PassThrough
// ============================================================================
describe('DisregardTax with PassThrough', () => {
    test('5.1 DisregardTax should not add tax but still deduct cleaning', () => {
        const reservation = {
            ...mockReservations.resA1,
            propertyId: 100004,
            source: 'VRBO'
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyD);
        const expected = 1030 - (1030 * 0.20) - 350;
        expect(result.shouldAddTax).toBe(false);
        expect(result.cleaningFeeForPassThrough).toBe(350);
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });
});

// ============================================================================
// TEST GROUP 6: Edge Cases
// ============================================================================
describe('Edge Cases', () => {
    test('6.1 Null/undefined cleaning fee should use listing default', () => {
        const reservation = {
            ...mockReservations.resA1,
            cleaningFee: null
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        expect(result.cleaningFeeForPassThrough).toBe(300);
        expect(result.usedListingDefault).toBe(true);
    });

    test('6.1b Null cleaning fee with NO listing default should be 0', () => {
        const reservation = {
            ...mockReservations.resA1,
            propertyId: 100005,
            cleaningFee: null
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyE);
        expect(result.cleaningFeeForPassThrough).toBe(0);
        expect(result.usedListingDefault).toBe(false);
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
        expect(filtered.length).toBe(1);
    });

    test('6.3 Unknown propertyId should not be filtered', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [{
            id: 'exp-unknown',
            propertyId: 999999,
            description: 'Cleaning Service',
            category: 'Cleaning',
            amount: -100
        }];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(1);
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
        expect(filtered.length).toBe(1);
        expect(filtered[0].id).toBe('other1');
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
        expect(filtered.length).toBe(1);
    });
});

// ============================================================================
// TEST GROUP 7: Net Payout Calculation
// ============================================================================
describe('Net Payout Calculation', () => {
    test('7.1 Single property net payout: grossPayout - expenses', () => {
        const result = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [mockExpenses.cleaningExpA, mockExpenses.otherExpA];
        const filtered = filterExpenses(expenses, listingInfoMap);
        const totalExpenses = calculateTotalExpenses(filtered);
        const netPayout = result.grossPayout - totalExpenses;
        const expectedNet = result.grossPayout - 50;
        expect(netPayout).toBe(expectedNet);
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
        const expected = grossPayoutSum - 245;
        expect(Math.round(netPayout * 100) / 100).toBe(Math.round(expected * 100) / 100);
    });
});

// ============================================================================
// TEST GROUP 8: Consistency Check (List vs PDF)
// ============================================================================
describe('Consistency Check (List vs PDF)', () => {
    test('8.1 List calculation should match PDF calculation', () => {
        const listResult = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
        const pdfResult = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
        expect(listResult.grossPayout).toBe(pdfResult.grossPayout);
        expect(listResult.cleaningFeeForPassThrough).toBe(pdfResult.cleaningFeeForPassThrough);
    });
});

// ============================================================================
// TEST GROUP 9: Listing Default Cleaning Fee Fallback
// ============================================================================
describe('Listing Default Cleaning Fee Fallback', () => {
    test('9.1 Reservation with own cleaning fee should use reservation fee', () => {
        const result = calculateGrossPayout(mockReservations.resA1, mockListings.propertyA);
        expect(result.cleaningFeeForPassThrough).toBe(350);
        expect(result.usedListingDefault).toBe(false);
    });

    test('9.2 Reservation with $0 cleaning fee should use listing default', () => {
        const reservation = {
            ...mockReservations.resA1,
            cleaningFee: 0
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        expect(result.cleaningFeeForPassThrough).toBe(300);
        expect(result.usedListingDefault).toBe(true);
    });

    test('9.3 Reservation with undefined cleaning fee should use listing default', () => {
        const reservation = {
            ...mockReservations.resA1,
            cleaningFee: undefined
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        expect(result.cleaningFeeForPassThrough).toBe(300);
        expect(result.usedListingDefault).toBe(true);
    });

    test('9.4 Listing with $0 default should result in $0 when reservation also $0', () => {
        const reservation = {
            ...mockReservations.resA1,
            propertyId: 100005,
            cleaningFee: 0
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyE);
        expect(result.cleaningFeeForPassThrough).toBe(0);
        expect(result.usedListingDefault).toBe(false);
    });

    test('9.5 Mixed reservations: some with own fee, some using default', () => {
        const reservations = [
            mockReservations.resA1,
            { ...mockReservations.resA2, cleaningFee: 0 }
        ];
        const result1 = calculateGrossPayout(reservations[0], mockListings.propertyA);
        const result2 = calculateGrossPayout(reservations[1], mockListings.propertyA);
        expect(result1.cleaningFeeForPassThrough).toBe(350);
        expect(result1.usedListingDefault).toBe(false);
        expect(result2.cleaningFeeForPassThrough).toBe(300);
        expect(result2.usedListingDefault).toBe(true);
        const totalCleaningFees = result1.cleaningFeeForPassThrough + result2.cleaningFeeForPassThrough;
        expect(totalCleaningFees).toBe(650);
    });

    test('9.6 PassThrough disabled should not use listing default', () => {
        const reservation = {
            ...mockReservations.resB1,
            cleaningFee: 0
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyB);
        expect(result.cleaningFeeForPassThrough).toBe(0);
        expect(result.usedListingDefault).toBe(false);
    });
});

// ============================================================================
// TEST GROUP 10: Cleaning Mismatch Warning Logic
// ============================================================================
describe('Cleaning Mismatch Warning Logic', () => {
    test('10.1 Warning should show when some reservations missing cleaning fee', () => {
        const reservations = [
            mockReservations.resA1,
            { ...mockReservations.resA2, cleaningFee: 0 }
        ];
        const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);
        expect(warning.show).toBe(true);
        expect(warning.reservationCount).toBe(2);
        expect(warning.cleaningExpenseCount).toBe(1);
        expect(warning.message).toContain('1 of 2');
    });

    test('10.2 Warning should NOT show when all reservations have own cleaning fee', () => {
        const reservations = [
            mockReservations.resA1,
            { ...mockReservations.resA1, id: 'res-a1b', cleaningFee: 250 }
        ];
        const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);
        expect(warning.show).toBe(false);
    });

    test('10.3 Warning should NOT show when passthrough disabled', () => {
        const reservations = [
            { ...mockReservations.resB1, cleaningFee: 0 }
        ];
        const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyB);
        expect(warning.show).toBe(false);
    });

    test('10.4 Warning should show for all reservations missing fees', () => {
        const reservations = [
            { ...mockReservations.resA1, cleaningFee: 0 },
            { ...mockReservations.resA2, cleaningFee: 0 }
        ];
        const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);
        expect(warning.show).toBe(true);
        expect(warning.cleaningExpenseCount).toBe(0);
        expect(warning.message).toContain('0 of 2');
    });

    test('10.5 Single reservation with own fee should NOT trigger warning', () => {
        const reservations = [mockReservations.resA1];
        const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);
        expect(warning.show).toBe(false);
    });

    test('10.6 Single reservation missing fee should trigger warning', () => {
        const reservations = [{ ...mockReservations.resA1, cleaningFee: 0 }];
        const warning = shouldShowCleaningMismatchWarning(reservations, mockListings.propertyA);
        expect(warning.show).toBe(true);
        expect(warning.message).toContain('0 of 1');
    });
});

// ============================================================================
// TEST GROUP 11: Net Payout with Listing Default
// ============================================================================
describe('Net Payout with Listing Default', () => {
    test('11.1 Net payout should account for listing default cleaning fee', () => {
        const reservation = { ...mockReservations.resA2, cleaningFee: 0 };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [mockExpenses.otherExpA];
        const filtered = filterExpenses(expenses, listingInfoMap);
        const totalExpenses = calculateTotalExpenses(filtered);
        const netPayout = result.grossPayout - totalExpenses;
        const expectedGross = 400 - (400 * 0.15) + 40 - 300;
        const expectedNet = expectedGross - 50;
        expect(result.grossPayout).toBe(Math.round(expectedGross * 100) / 100);
        expect(Math.round(netPayout * 100) / 100).toBe(Math.round(expectedNet * 100) / 100);
    });

    test('11.2 Combined statement with mixed defaults should calculate correctly', () => {
        const reservations = [
            mockReservations.resA1,
            { ...mockReservations.resA2, cleaningFee: 0 }
        ];
        const result1 = calculateGrossPayout(reservations[0], mockListings.propertyA);
        const result2 = calculateGrossPayout(reservations[1], mockListings.propertyA);
        const grossPayoutSum = result1.grossPayout + result2.grossPayout;
        const expected1 = 1030 - (1030 * 0.15) - 350;
        const expected2 = 400 - (400 * 0.15) + 40 - 300;
        const expectedSum = expected1 + expected2;
        expect(Math.round(grossPayoutSum * 100) / 100).toBe(Math.round(expectedSum * 100) / 100);
    });
});

// ============================================================================
// TEST GROUP 12: Bulk Generation Scenarios
// ============================================================================
describe('Bulk Generation Scenarios', () => {
    test('12.1 Multiple properties with different default cleaning fees', () => {
        const resForA = { ...mockReservations.resA2, cleaningFee: 0 };
        const resForD = { ...mockReservations.resA2, propertyId: 100004, cleaningFee: 0 };
        const resultA = calculateGrossPayout(resForA, mockListings.propertyA);
        const resultD = calculateGrossPayout(resForD, mockListings.propertyD);
        expect(resultA.cleaningFeeForPassThrough).toBe(300);
        expect(resultD.cleaningFeeForPassThrough).toBe(350);
    });

    test('12.2 Property with no default should not deduct cleaning for missing fees', () => {
        const reservation = { ...mockReservations.resA2, propertyId: 100005, cleaningFee: 0 };
        const result = calculateGrossPayout(reservation, mockListings.propertyE);
        expect(result.cleaningFeeForPassThrough).toBe(0);
        const expected = 400 - (400 * 0.15) + 40;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });

    test('12.3 Same period, different properties with different passthrough settings', () => {
        const resA = { ...mockReservations.resA2, cleaningFee: 0 };
        const resB = { ...mockReservations.resB1, cleaningFee: 0 };
        const resultA = calculateGrossPayout(resA, mockListings.propertyA);
        const resultB = calculateGrossPayout(resB, mockListings.propertyB);
        expect(resultA.cleaningFeeForPassThrough).toBe(300);
        expect(resultB.cleaningFeeForPassThrough).toBe(0);
    });
});

// ============================================================================
// TEST GROUP 13: Rounding and Precision Edge Cases
// ============================================================================
describe('Rounding and Precision Edge Cases', () => {
    test('13.1 Very small cleaning fee ($0.01) should be handled correctly', () => {
        const listing = { ...mockListings.propertyA, cleaningFee: 0.01 };
        const reservation = { ...mockReservations.resA2, cleaningFee: 0 };
        const result = calculateGrossPayout(reservation, listing);
        expect(result.cleaningFeeForPassThrough).toBe(0.01);
        expect(result.usedListingDefault).toBe(true);
    });

    test('13.2 Very large cleaning fee ($9999.99) should be handled correctly', () => {
        const listing = { ...mockListings.propertyA, cleaningFee: 9999.99 };
        const reservation = { ...mockReservations.resA2, cleaningFee: 0 };
        const result = calculateGrossPayout(reservation, listing);
        expect(result.cleaningFeeForPassThrough).toBe(9999.99);
    });

    test('13.3 Cleaning fee with many decimal places should round to 2 places', () => {
        const listing = { ...mockListings.propertyA, cleaningFee: 123.456789 };
        const reservation = { ...mockReservations.resA2, cleaningFee: 0 };
        const result = calculateGrossPayout(reservation, listing);
        const decimalPlaces = (result.grossPayout.toString().split('.')[1] || '').length;
        expect(decimalPlaces <= 2).toBe(true);
    });

    test('13.4 PM fee percentage precision with cleaning passthrough', () => {
        const listing = { ...mockListings.propertyA, pmFeePercentage: 15.5, cleaningFee: 300 };
        const reservation = {
            ...mockReservations.resA1,
            cleaningFee: 0,
            clientRevenue: 1000
        };
        const result = calculateGrossPayout(reservation, listing);
        const expected = 1000 - (1000 * 0.155) - 300;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });

    test('13.5 Edge case: clientRevenue equals cleaning fee', () => {
        const reservation = {
            ...mockReservations.resA2,
            cleaningFee: 0,
            clientRevenue: 300
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        const expected = 300 - (300 * 0.15) + 40 - 300;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });

    test('13.6 Edge case: negative gross payout due to high cleaning fee', () => {
        const listing = { ...mockListings.propertyA, cleaningFee: 2000 };
        const reservation = { ...mockReservations.resA2, cleaningFee: 0 };
        const result = calculateGrossPayout(reservation, listing);
        const expected = 400 - (400 * 0.15) + 40 - 2000;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
        expect(result.grossPayout < 0).toBe(true);
    });
});

// ============================================================================
// TEST GROUP 14: Source-Based Logic with Cleaning Passthrough
// ============================================================================
describe('Source-Based Logic with Cleaning Passthrough', () => {
    test('14.1 Airbnb reservation with passthrough (no tax added)', () => {
        const reservation = {
            ...mockReservations.resA1,
            source: 'Airbnb',
            cleaningFee: 0
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        const expected = 1030 - (1030 * 0.15) - 300;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
        expect(result.shouldAddTax).toBe(false);
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
        const expected = 760 - (760 * 0.15) + 80 - 200;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
        expect(result.shouldAddTax).toBe(true);
    });

    test('14.3 Direct booking with passthrough (tax added)', () => {
        const reservation = {
            ...mockReservations.resA2,
            source: 'Direct',
            cleaningFee: 0
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        const expected = 400 - (400 * 0.15) + 40 - 300;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
        expect(result.shouldAddTax).toBe(true);
    });

    test('14.4 Booking.com with passthrough (tax added)', () => {
        const listing = { ...mockListings.propertyA, cleaningFee: 150 };
        const reservation = {
            ...mockReservations.resA1,
            source: 'Booking.com',
            cleaningFee: 0
        };
        const result = calculateGrossPayout(reservation, listing);
        const expected = 1030 - (1030 * 0.15) + 100 - 150;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
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
        const expected = 1030 - (1030 * 0.15) + 100 - 200;
        expect(result.shouldAddTax).toBe(true);
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });

    test('14.6 Case-insensitive source detection', () => {
        const reservation1 = { ...mockReservations.resA1, source: 'AIRBNB', cleaningFee: 0 };
        const reservation2 = { ...mockReservations.resA1, source: 'airbnb', cleaningFee: 0 };
        const reservation3 = { ...mockReservations.resA1, source: 'AirBnB', cleaningFee: 0 };
        const result1 = calculateGrossPayout(reservation1, mockListings.propertyA);
        const result2 = calculateGrossPayout(reservation2, mockListings.propertyA);
        const result3 = calculateGrossPayout(reservation3, mockListings.propertyA);
        expect(result1.shouldAddTax).toBe(result2.shouldAddTax);
        expect(result2.shouldAddTax).toBe(result3.shouldAddTax);
        expect(result1.shouldAddTax).toBe(false);
    });
});

// ============================================================================
// TEST GROUP 15: Non-Detailed Finance with Passthrough
// ============================================================================
describe('Non-Detailed Finance with Passthrough', () => {
    test('15.1 Non-detailed finance should use grossAmount for revenue', () => {
        const reservation = {
            ...mockReservations.resA1,
            hasDetailedFinance: false,
            grossAmount: 1150,
            cleaningFee: 0
        };
        const result = calculateGrossPayout(reservation, mockListings.propertyA);
        const expected = 1150 - (1150 * 0.15) - 300;
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
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
        const expected = 440 - (440 * 0.15) - 300;
        expect(result.taxResponsibility).toBe(0);
        expect(result.grossPayout).toBe(Math.round(expected * 100) / 100);
    });
});

// ============================================================================
// TEST GROUP 16: Expense Filtering Edge Cases
// ============================================================================
describe('Expense Filtering Edge Cases', () => {
    test('16.1 Expense category "Deep Cleaning" should be filtered', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [
            { id: 'exp1', propertyId: 100001, description: 'Service', category: 'Deep Cleaning', amount: -200 }
        ];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(0);
    });

    test('16.2 Expense type "cleaning" should be filtered', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [
            { id: 'exp1', propertyId: 100001, description: 'Regular service', category: 'Other', type: 'cleaning', amount: -100 }
        ];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(0);
    });

    test('16.3 Description starting with "cleaning" should be filtered', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [
            { id: 'exp1', propertyId: 100001, description: 'Cleaning after checkout', category: 'Service', amount: -150 }
        ];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(0);
    });

    test('16.4 Description containing "cleaning" but not starting with it should NOT be filtered', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [
            { id: 'exp1', propertyId: 100001, description: 'Supplies for cleaning', category: 'Supplies', amount: -50 }
        ];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(1);
    });

    test('16.5 Empty category/type/description should not crash', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [
            { id: 'exp1', propertyId: 100001, description: '', category: '', type: '', amount: -50 },
            { id: 'exp2', propertyId: 100001, amount: -30 }
        ];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(2);
    });

    test('16.6 Positive expense (upsell/addon) should be filtered if named cleaning', () => {
        const listingInfoMap = { 100001: mockListings.propertyA };
        const expenses = [
            { id: 'exp1', propertyId: 100001, description: 'Cleaning Fee Charge', category: 'Cleaning', type: 'upsell', amount: 100 }
        ];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(0);
    });

    test('16.7 Multiple properties mixed in single expense list', () => {
        const listingInfoMap = {
            100001: mockListings.propertyA,
            100002: mockListings.propertyB,
            100003: mockListings.propertyC
        };
        const expenses = [
            { id: 'exp1', propertyId: 100001, category: 'Cleaning', amount: -100 },
            { id: 'exp2', propertyId: 100002, category: 'Cleaning', amount: -100 },
            { id: 'exp3', propertyId: 100003, category: 'Cleaning', amount: -100 },
            { id: 'exp4', propertyId: 100001, category: 'Lawn', amount: -50 },
            { id: 'exp5', propertyId: 100002, category: 'Lawn', amount: -50 },
            { id: 'exp6', propertyId: 100003, category: 'Lawn', amount: -50 }
        ];
        const filtered = filterExpenses(expenses, listingInfoMap);
        expect(filtered.length).toBe(4);
    });
});

module.exports = {
    calculateGrossPayout,
    shouldShowCleaningMismatchWarning,
    filterExpenses,
    calculateTotalExpenses
};
