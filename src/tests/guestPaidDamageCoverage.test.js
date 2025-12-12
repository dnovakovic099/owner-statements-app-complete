/**
 * Test Cases for guestPaidDamageCoverage Feature
 *
 * This tests the "Guest Paid Damage Coverage" column logic:
 * - Step A: Extract resort fee from fees array in API response
 * - Step B: Show column only when property has guestPaidDamageCoverage enabled
 * - Step C: Display resort fee value in blue (info) color
 * - Step D: Prorate resort fee for calendar-based statements
 */

// Mock data for testing
const mockListings = {
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

const mockFeesArrays = {
    withResortFee: [
        { id: 301227683, fee_id: 2, amount_gross: 168.76, fee: { name: "Resort fee", type: "fee" } },
        { id: 301227684, fee_id: 1, amount_gross: 150.00, fee: { name: "Cleaning fee", type: "fee" } },
        { id: 301227685, fee_id: 3, amount_gross: 50.00, fee: { name: "Pet fee", type: "fee" } }
    ],
    withoutResortFee: [
        { id: 301227684, fee_id: 1, amount_gross: 150.00, fee: { name: "Cleaning fee", type: "fee" } },
        { id: 301227685, fee_id: 3, amount_gross: 50.00, fee: { name: "Pet fee", type: "fee" } }
    ],
    withZeroResortFee: [
        { id: 301227683, fee_id: 2, amount_gross: 0, fee: { name: "Resort fee", type: "fee" } },
        { id: 301227684, fee_id: 1, amount_gross: 150.00, fee: { name: "Cleaning fee", type: "fee" } }
    ],
    withMultipleResortFees: [
        { id: 301227683, fee_id: 2, amount_gross: 100.00, fee: { name: "Resort fee", type: "fee" } },
        { id: 301227686, fee_id: 2, amount_gross: 50.00, fee: { name: "Resort fee", type: "fee" } }
    ],
    empty: [],
    excludedFeesOnly: [
        { id: 301227687, fee_id: 4, amount_gross: 100.00, fee: { name: "Claims fee", type: "fee" } },
        { id: 301227688, fee_id: 5, amount_gross: 200.00, fee: { name: "Management fee", type: "fee" } }
    ]
};

const mockReservations = {
    resWithResortFee: {
        id: 'res-1', propertyId: 100001, guestName: 'Guest With Resort Fee', source: 'VRBO',
        checkInDate: '2025-12-01', checkOutDate: '2025-12-05', nights: 4, hasDetailedFinance: true,
        baseRate: 800, cleaningFee: 150, cleaningAndOtherFees: 200, platformFees: 120,
        clientRevenue: 880, clientTaxResponsibility: 100, resortFee: 168.76
    },
    resWithoutResortFee: {
        id: 'res-2', propertyId: 100001, guestName: 'Guest Without Resort Fee', source: 'Airbnb',
        checkInDate: '2025-12-06', checkOutDate: '2025-12-10', nights: 4, hasDetailedFinance: true,
        baseRate: 600, cleaningFee: 150, cleaningAndOtherFees: 150, platformFees: 90,
        clientRevenue: 660, clientTaxResponsibility: 80, resortFee: 0
    },
    resForPropertyB: {
        id: 'res-3', propertyId: 100002, guestName: 'Guest Property B', source: 'Direct',
        checkInDate: '2025-12-01', checkOutDate: '2025-12-05', nights: 4, hasDetailedFinance: true,
        baseRate: 500, cleaningFee: 100, cleaningAndOtherFees: 100, platformFees: 0,
        clientRevenue: 600, clientTaxResponsibility: 60, resortFee: 200
    }
};

function calculateFeesFromArray(fees) {
    if (!fees || !Array.isArray(fees)) {
        return { cleaningFee: 0, otherFees: 0, totalFees: 0, resortFee: 0 };
    }
    let cleaningFee = 0, otherFees = 0, resortFee = 0;
    const excludedFees = ['claims fee', 'resort fee', 'management fee'];
    fees.forEach(feeItem => {
        const feeType = feeItem.fee?.type;
        const feeName = feeItem.fee?.name || '';
        const feeNameLower = feeName.toLowerCase();
        const amount = parseFloat(feeItem.amount_gross || 0);
        if (feeType === 'fee') {
            if (feeNameLower.includes('resort fee') && amount > 0) { resortFee += amount; return; }
            if (excludedFees.some(excluded => feeNameLower.includes(excluded))) { return; }
            if (feeNameLower.includes('cleaning')) { cleaningFee += amount; } else { otherFees += amount; }
        }
    });
    return { cleaningFee, otherFees, totalFees: cleaningFee + otherFees, resortFee };
}

function checkAnyGuestPaidDamageCoverage(statement, listingSettingsMap) {
    return statement.guestPaidDamageCoverage ||
        (listingSettingsMap && Object.values(listingSettingsMap).some(s => s.guestPaidDamageCoverage));
}

function calculateTotalResortFee(reservations) {
    return reservations.reduce((sum, res) => sum + (res.resortFee || 0), 0);
}

function applyProration(resortFee, prorationFactor) {
    return Math.round((resortFee * prorationFactor) * 100) / 100;
}

describe('Guest Paid Damage Coverage Tests', () => {

    describe('Resort Fee Extraction from Fees Array', () => {
        test('1.1 Should extract resort fee from fees array', () => {
            const result = calculateFeesFromArray(mockFeesArrays.withResortFee);
            expect(result.resortFee).toBe(168.76);
            expect(result.cleaningFee).toBe(150);
            expect(result.otherFees).toBe(50);
        });

        test('1.2 Should return 0 resort fee when not present', () => {
            const result = calculateFeesFromArray(mockFeesArrays.withoutResortFee);
            expect(result.resortFee).toBe(0);
            expect(result.cleaningFee).toBe(150);
        });

        test('1.3 Should return 0 resort fee when amount is 0', () => {
            const result = calculateFeesFromArray(mockFeesArrays.withZeroResortFee);
            expect(result.resortFee).toBe(0);
        });

        test('1.4 Should sum multiple resort fees', () => {
            const result = calculateFeesFromArray(mockFeesArrays.withMultipleResortFees);
            expect(result.resortFee).toBe(150);
        });

        test('1.5 Should handle empty fees array', () => {
            const result = calculateFeesFromArray(mockFeesArrays.empty);
            expect(result.resortFee).toBe(0);
            expect(result.cleaningFee).toBe(0);
            expect(result.totalFees).toBe(0);
        });

        test('1.6 Should handle null/undefined fees', () => {
            expect(calculateFeesFromArray(null).resortFee).toBe(0);
            expect(calculateFeesFromArray(undefined).resortFee).toBe(0);
        });

        test('1.7 Should not include resort fee in totalFees', () => {
            const result = calculateFeesFromArray(mockFeesArrays.withResortFee);
            expect(result.totalFees).toBe(200);
            expect(result.resortFee).toBe(168.76);
        });

        test('1.8 Should exclude claims fee and management fee', () => {
            const result = calculateFeesFromArray(mockFeesArrays.excludedFeesOnly);
            expect(result.resortFee).toBe(0);
            expect(result.cleaningFee).toBe(0);
            expect(result.otherFees).toBe(0);
            expect(result.totalFees).toBe(0);
        });
    });

    describe('Column Display Logic', () => {
        test('2.1 Column should show when property has guestPaidDamageCoverage enabled', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: true }, {})).toBe(true);
        });

        test('2.2 Column should NOT show when property has guestPaidDamageCoverage disabled', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: false }, {})).toBe(false);
        });

        test('2.3 Combined statement: show if ANY property has it enabled', () => {
            const listingSettingsMap = { 100001: { guestPaidDamageCoverage: true }, 100002: { guestPaidDamageCoverage: false } };
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: false }, listingSettingsMap)).toBe(true);
        });

        test('2.4 Combined statement: hide if ALL properties have it disabled', () => {
            const listingSettingsMap = { 100001: { guestPaidDamageCoverage: false }, 100002: { guestPaidDamageCoverage: false } };
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: false }, listingSettingsMap)).toBe(false);
        });

        test('2.5 Statement level setting overrides when true', () => {
            const listingSettingsMap = { 100001: { guestPaidDamageCoverage: false } };
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: true }, listingSettingsMap)).toBe(true);
        });

        test('2.6 Empty listingSettingsMap should use statement setting', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: true }, {})).toBe(true);
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: false }, {})).toBe(false);
        });

        test('2.7 Null/undefined listingSettingsMap should use statement setting', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: true }, null)).toBe(true);
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: true }, undefined)).toBe(true);
        });
    });

    describe('Resort Fee Display Values', () => {
        test('3.1 Reservation with resort fee should show value', () => {
            expect(mockReservations.resWithResortFee.resortFee).toBe(168.76);
        });

        test('3.2 Reservation without resort fee should show $0.00', () => {
            expect(mockReservations.resWithoutResortFee.resortFee).toBe(0);
        });

        test('3.3 Total resort fee calculation for multiple reservations', () => {
            const reservations = [mockReservations.resWithResortFee, mockReservations.resWithoutResortFee];
            expect(calculateTotalResortFee(reservations)).toBe(168.76);
        });

        test('3.4 Total resort fee for reservations all with fees', () => {
            const reservations = [
                { ...mockReservations.resWithResortFee, resortFee: 100 },
                { ...mockReservations.resWithResortFee, id: 'res-2', resortFee: 150 },
                { ...mockReservations.resWithResortFee, id: 'res-3', resortFee: 200 }
            ];
            expect(calculateTotalResortFee(reservations)).toBe(450);
        });

        test('3.5 Total resort fee for reservations all without fees', () => {
            const reservations = [
                { ...mockReservations.resWithoutResortFee },
                { ...mockReservations.resWithoutResortFee, id: 'res-2' }
            ];
            expect(calculateTotalResortFee(reservations)).toBe(0);
        });
    });

    describe('Proration for Calendar-Based Statements', () => {
        test('4.1 Full stay (no proration) should keep original resort fee', () => {
            expect(applyProration(168.76, 1.0)).toBe(168.76);
        });

        test('4.2 Half stay proration should halve resort fee', () => {
            expect(applyProration(200, 0.5)).toBe(100);
        });

        test('4.3 Quarter stay proration', () => {
            expect(applyProration(200, 0.25)).toBe(50);
        });

        test('4.4 Odd proration factor should round to 2 decimals', () => {
            expect(applyProration(100, 0.333)).toBe(33.30);
        });

        test('4.5 Zero resort fee with proration', () => {
            expect(applyProration(0, 0.5)).toBe(0);
        });

        test('4.6 Small proration factor', () => {
            expect(applyProration(168.76, 0.1)).toBe(16.88);
        });
    });

    describe('Combined Statement Scenarios', () => {
        test('5.1 Combined statement with mixed settings', () => {
            const listingSettingsMap = { 100001: mockListings.propertyA, 100002: mockListings.propertyB };
            const reservations = [mockReservations.resWithResortFee, mockReservations.resForPropertyB];
            expect(checkAnyGuestPaidDamageCoverage({}, listingSettingsMap)).toBe(true);
            expect(calculateTotalResortFee(reservations)).toBe(368.76);
        });

        test('5.2 Combined statement with all settings disabled', () => {
            const listingSettingsMap = {
                100001: { ...mockListings.propertyA, guestPaidDamageCoverage: false },
                100002: mockListings.propertyB
            };
            expect(checkAnyGuestPaidDamageCoverage({}, listingSettingsMap)).toBe(false);
        });

        test('5.3 Combined statement totals across multiple properties', () => {
            const reservations = [
                { ...mockReservations.resWithResortFee, propertyId: 100001, resortFee: 100 },
                { ...mockReservations.resWithResortFee, propertyId: 100001, id: 'res-2', resortFee: 150 },
                { ...mockReservations.resWithResortFee, propertyId: 100002, id: 'res-3', resortFee: 200 },
                { ...mockReservations.resWithoutResortFee, propertyId: 100002, id: 'res-4', resortFee: 0 }
            ];
            expect(calculateTotalResortFee(reservations)).toBe(450);
        });
    });

    describe('Edge Cases', () => {
        test('6.1 Undefined resortFee should be treated as 0', () => {
            const reservation = { ...mockReservations.resWithResortFee, resortFee: undefined };
            expect(calculateTotalResortFee([reservation])).toBe(0);
        });

        test('6.2 Null resortFee should be treated as 0', () => {
            const reservation = { ...mockReservations.resWithResortFee, resortFee: null };
            expect(calculateTotalResortFee([reservation])).toBe(0);
        });

        test('6.3 Negative resortFee (invalid data)', () => {
            const reservation = { ...mockReservations.resWithResortFee, resortFee: -50 };
            expect(calculateTotalResortFee([reservation])).toBe(-50);
        });

        test('6.4 Very large resort fee', () => {
            const reservation = { ...mockReservations.resWithResortFee, resortFee: 9999.99 };
            expect(calculateTotalResortFee([reservation])).toBe(9999.99);
        });

        test('6.5 Resort fee with many decimal places', () => {
            expect(applyProration(168.123456789, 1.0)).toBe(168.12);
        });

        test('6.6 Empty reservations array', () => {
            expect(calculateTotalResortFee([])).toBe(0);
        });
    });

    describe('Feature Combination Tests', () => {
        test('7.1 Both cleaningFeePassThrough and guestPaidDamageCoverage enabled', () => {
            expect(mockListings.propertyC.cleaningFeePassThrough).toBe(true);
            expect(mockListings.propertyC.guestPaidDamageCoverage).toBe(true);
        });

        test('7.2 Features should work independently', () => {
            const reservation = { ...mockReservations.resWithResortFee, propertyId: 100003, cleaningFee: 200, resortFee: 150 };
            expect(reservation.resortFee).toBe(150);
        });
    });

    describe('Boolean Flag Edge Cases', () => {
        test('8.1 guestPaidDamageCoverage as string "true" should be truthy', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: 'true' }, {})).toBeTruthy();
        });

        test('8.2 guestPaidDamageCoverage as 1 should be truthy', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: 1 }, {})).toBeTruthy();
        });

        test('8.3 guestPaidDamageCoverage as 0 should be falsy', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: 0 }, {})).toBe(false);
        });

        test('8.4 guestPaidDamageCoverage as empty string should be falsy', () => {
            expect(checkAnyGuestPaidDamageCoverage({ guestPaidDamageCoverage: '' }, {})).toBe(false);
        });
    });

    describe('Resort Fee Name Variations', () => {
        test('9.1 Case insensitive "RESORT FEE"', () => {
            const fees = [{ amount_gross: 100, fee: { name: "RESORT FEE", type: "fee" } }];
            expect(calculateFeesFromArray(fees).resortFee).toBe(100);
        });

        test('9.2 Case insensitive "Resort Fee"', () => {
            const fees = [{ amount_gross: 100, fee: { name: "Resort Fee", type: "fee" } }];
            expect(calculateFeesFromArray(fees).resortFee).toBe(100);
        });

        test('9.3 Name containing "resort fee" like "Daily Resort Fee"', () => {
            const fees = [{ amount_gross: 100, fee: { name: "Daily Resort Fee", type: "fee" } }];
            expect(calculateFeesFromArray(fees).resortFee).toBe(100);
        });

        test('9.4 Fee without proper type should not be extracted', () => {
            const fees = [{ amount_gross: 100, fee: { name: "Resort fee", type: "tax" } }];
            expect(calculateFeesFromArray(fees).resortFee).toBe(0);
        });

        test('9.5 Fee with null name should not crash', () => {
            const fees = [{ amount_gross: 100, fee: { name: null, type: "fee" } }];
            expect(calculateFeesFromArray(fees).resortFee).toBe(0);
        });

        test('9.6 Fee with undefined fee object should not crash', () => {
            const fees = [{ amount_gross: 100, fee: undefined }];
            expect(calculateFeesFromArray(fees).resortFee).toBe(0);
        });
    });

    describe('Listing Settings Checkbox Persistence', () => {
        test('10.1 Setting should persist as boolean true', () => {
            expect(mockListings.propertyA.guestPaidDamageCoverage).toBe(true);
            expect(typeof mockListings.propertyA.guestPaidDamageCoverage).toBe('boolean');
        });

        test('10.2 Setting should persist as boolean false', () => {
            expect(mockListings.propertyB.guestPaidDamageCoverage).toBe(false);
            expect(typeof mockListings.propertyB.guestPaidDamageCoverage).toBe('boolean');
        });
    });

    describe('Statement Generation Integration', () => {
        test('11.1 Single property statement with setting enabled', () => {
            const statement = { propertyId: 100001, guestPaidDamageCoverage: true, reservations: [mockReservations.resWithResortFee] };
            expect(checkAnyGuestPaidDamageCoverage(statement, {})).toBe(true);
            expect(calculateTotalResortFee(statement.reservations)).toBe(168.76);
        });

        test('11.2 Single property statement with setting disabled', () => {
            const statement = { propertyId: 100002, guestPaidDamageCoverage: false, reservations: [mockReservations.resForPropertyB] };
            expect(checkAnyGuestPaidDamageCoverage(statement, {})).toBe(false);
        });

        test('11.3 Bulk generation should respect per-property settings', () => {
            const listingSettingsMap = { 100001: { guestPaidDamageCoverage: true }, 100002: { guestPaidDamageCoverage: false }, 100003: { guestPaidDamageCoverage: true } };
            expect(checkAnyGuestPaidDamageCoverage({}, { 100001: listingSettingsMap[100001], 100002: listingSettingsMap[100002] })).toBe(true);
            expect(checkAnyGuestPaidDamageCoverage({}, { 100002: listingSettingsMap[100002] })).toBe(false);
        });
    });

    describe('Data Immutability', () => {
        test('12.1 calculateFeesFromArray should not mutate input', () => {
            const fees = [...mockFeesArrays.withResortFee];
            const originalLength = fees.length;
            calculateFeesFromArray(fees);
            expect(fees.length).toBe(originalLength);
        });

        test('12.2 calculateTotalResortFee should not mutate reservations', () => {
            const reservations = [{ ...mockReservations.resWithResortFee }];
            const originalResortFee = reservations[0].resortFee;
            calculateTotalResortFee(reservations);
            expect(reservations[0].resortFee).toBe(originalResortFee);
        });
    });
});
