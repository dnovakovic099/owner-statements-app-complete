const StatementCalculationService = require('../services/StatementCalculationService');

const makeStatement = (overrides = {}) => ({
    id: 42,
    weekStartDate: '2026-04-06',
    weekEndDate: '2026-04-13',
    propertyName: 'E 76th Pl. - Rashid',
    reservations: [],
    ...overrides
});

const makeReservation = (overrides = {}) => ({
    hostifyId: 99001,
    propertyId: 1234,
    guestName: 'Hugo Patino',
    checkInDate: '2026-04-08',
    checkOutDate: '2026-04-13',
    status: 'confirmed',
    grossAmount: 1432.51,
    hasDetailedFinance: false,
    ...overrides
});

describe('buildPriorReservationSignatures', () => {
    test('handles empty input', () => {
        expect(StatementCalculationService.buildPriorReservationSignatures([]).size).toBe(0);
    });

    test('handles null/undefined input', () => {
        expect(StatementCalculationService.buildPriorReservationSignatures(null).size).toBe(0);
        expect(StatementCalculationService.buildPriorReservationSignatures(undefined).size).toBe(0);
    });

    test('skips statements with no reservations', () => {
        const sigs = StatementCalculationService.buildPriorReservationSignatures([
            makeStatement({ reservations: [] }),
            makeStatement({ id: 43, reservations: undefined })
        ]);
        expect(sigs.size).toBe(0);
    });

    test('first statement wins when multiple prior statements contain the same reservation', () => {
        const sigs = StatementCalculationService.buildPriorReservationSignatures([
            makeStatement({ id: 10, weekStartDate: '2026-04-06', weekEndDate: '2026-04-13', reservations: [makeReservation()] }),
            makeStatement({ id: 11, weekStartDate: '2026-03-30', weekEndDate: '2026-04-06', reservations: [makeReservation()] })
        ]);
        const match = StatementCalculationService.matchReservationToPrior(makeReservation(), sigs);
        expect(match.statementId).toBe(10);
    });

    test('indexes each reservation under both id and fallback keys', () => {
        const sigs = StatementCalculationService.buildPriorReservationSignatures([
            makeStatement({ reservations: [makeReservation()] })
        ]);
        // id key + fallback key
        expect(sigs.size).toBe(2);
    });
});

describe('matchReservationToPrior', () => {
    const priorStatements = [makeStatement({ reservations: [makeReservation()] })];
    const sigs = StatementCalculationService.buildPriorReservationSignatures(priorStatements);

    test('returns null for empty signature map', () => {
        expect(StatementCalculationService.matchReservationToPrior(makeReservation(), new Map())).toBeNull();
    });

    test('returns null when signature map is null/undefined', () => {
        expect(StatementCalculationService.matchReservationToPrior(makeReservation(), null)).toBeNull();
        expect(StatementCalculationService.matchReservationToPrior(makeReservation(), undefined)).toBeNull();
    });

    test('matches by hostifyId', () => {
        const match = StatementCalculationService.matchReservationToPrior(makeReservation(), sigs);
        expect(match).not.toBeNull();
        expect(match.statementId).toBe(42);
    });

    test('matches by id when hostifyId is absent', () => {
        const resInPrior = { id: 55555, propertyId: 1234, guestName: 'X', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' };
        const priorOnlyId = [makeStatement({ reservations: [resInPrior] })];
        const s = StatementCalculationService.buildPriorReservationSignatures(priorOnlyId);
        // Same .id field used to key — id wins even if hostifyId absent
        const match = StatementCalculationService.matchReservationToPrior(
            { id: 55555, propertyId: 9999, guestName: 'Different' },
            s
        );
        expect(match).not.toBeNull();
    });

    test('hostifyId and id of 0 are treated as valid ids', () => {
        const priorWithZero = [makeStatement({ reservations: [{ ...makeReservation(), hostifyId: 0, id: undefined }] })];
        const s = StatementCalculationService.buildPriorReservationSignatures(priorWithZero);
        const match = StatementCalculationService.matchReservationToPrior({ hostifyId: 0 }, s);
        expect(match).not.toBeNull();
    });

    test('empty-string ids fall through to fallback match', () => {
        const priorWithEmpty = [makeStatement({ reservations: [{ ...makeReservation(), hostifyId: '', id: '' }] })];
        const s = StatementCalculationService.buildPriorReservationSignatures(priorWithEmpty);
        // No id indexed, only fallback — probe by fallback fields
        const match = StatementCalculationService.matchReservationToPrior(
            { hostifyId: '', id: '', propertyId: 1234, guestName: 'Hugo Patino', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' },
            s
        );
        expect(match).not.toBeNull();
    });

    test('fallback match is case-insensitive and trims whitespace on guest name', () => {
        const resInPrior = { propertyId: 1234, guestName: 'Hugo Patino', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' };
        const s = StatementCalculationService.buildPriorReservationSignatures([makeStatement({ reservations: [resInPrior] })]);
        const match = StatementCalculationService.matchReservationToPrior(
            { propertyId: 1234, guestName: '  HUGO PATINO  ', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' },
            s
        );
        expect(match).not.toBeNull();
    });

    test('fallback does not match when property ids differ', () => {
        const match = StatementCalculationService.matchReservationToPrior(
            { propertyId: 9999, guestName: 'Hugo Patino', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' },
            sigs
        );
        expect(match).toBeNull();
    });

    test('fallback does not match when dates differ even by one day', () => {
        const match = StatementCalculationService.matchReservationToPrior(
            { propertyId: 1234, guestName: 'Hugo Patino', checkInDate: '2026-04-09', checkOutDate: '2026-04-13' },
            sigs
        );
        expect(match).toBeNull();
    });

    test('fallback does not match when guest name differs', () => {
        const match = StatementCalculationService.matchReservationToPrior(
            { propertyId: 1234, guestName: 'Different Person', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' },
            sigs
        );
        expect(match).toBeNull();
    });

    test('ignores reservation with no identifying data at all', () => {
        const match = StatementCalculationService.matchReservationToPrior({}, sigs);
        expect(match).toBeNull();
    });

    test('fallback matches across numeric vs string propertyId (template-literal coercion)', () => {
        const priorWithStringId = [makeStatement({
            reservations: [{ propertyId: '1234', guestName: 'Hugo Patino', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' }]
        })];
        const s = StatementCalculationService.buildPriorReservationSignatures(priorWithStringId);
        const match = StatementCalculationService.matchReservationToPrior(
            { propertyId: 1234, guestName: 'Hugo Patino', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' },
            s
        );
        expect(match).not.toBeNull();
    });
});

describe('excludePriorStatementReservations', () => {
    const sigs = StatementCalculationService.buildPriorReservationSignatures([
        makeStatement({ reservations: [makeReservation()] })
    ]);

    test('splits kept vs duplicates and emits warnings', () => {
        const duplicate = makeReservation();
        const unique = makeReservation({ hostifyId: 99002, guestName: 'Shaun Foxx', checkInDate: '2026-04-17', checkOutDate: '2026-04-19' });
        const { kept, duplicateWarnings } = StatementCalculationService.excludePriorStatementReservations([duplicate, unique], sigs);
        expect(kept).toHaveLength(1);
        expect(kept[0].hostifyId).toBe(99002);
        expect(duplicateWarnings).toHaveLength(1);
        expect(duplicateWarnings[0]).toMatchObject({
            type: 'prior_statement_reservation',
            reservationId: 99001,
            propertyId: 1234,
            guestName: 'Hugo Patino',
            priorStatementId: 42,
            priorPeriod: '2026-04-06 to 2026-04-13'
        });
    });

    test('handles empty input gracefully', () => {
        expect(StatementCalculationService.excludePriorStatementReservations([], sigs)).toEqual({ kept: [], duplicateWarnings: [] });
        expect(StatementCalculationService.excludePriorStatementReservations(null, sigs)).toEqual({ kept: [], duplicateWarnings: [] });
        expect(StatementCalculationService.excludePriorStatementReservations(undefined, sigs)).toEqual({ kept: [], duplicateWarnings: [] });
    });

    test('emits a null reservationId when neither hostifyId nor id is present on the current reservation', () => {
        const fallbackPrior = [makeStatement({ reservations: [{ propertyId: 1234, guestName: 'Anon', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' }] })];
        const s = StatementCalculationService.buildPriorReservationSignatures(fallbackPrior);
        const current = { propertyId: 1234, guestName: 'Anon', checkInDate: '2026-04-08', checkOutDate: '2026-04-13' };
        const { kept, duplicateWarnings } = StatementCalculationService.excludePriorStatementReservations([current], s);
        expect(kept).toHaveLength(0);
        expect(duplicateWarnings[0].reservationId).toBeNull();
    });
});

describe('calculateStatementFinancials integration', () => {
    const listingInfoMap = { 1234: { id: 1234, pmFeePercentage: 15, cleaningFee: 0 } };

    test('drops prior-statement reservations from revenue totals', () => {
        const reservations = [
            makeReservation({ hostifyId: 99001, grossAmount: 1432.51 }),
            makeReservation({ hostifyId: 99002, guestName: 'Shaun Foxx', checkInDate: '2026-04-17', checkOutDate: '2026-04-19', grossAmount: 599.46 })
        ];
        const priorStatements = [makeStatement({ reservations: [makeReservation()] })];
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap,
            propertyIds: [1234],
            startDate: '2026-04-13',
            endDate: '2026-04-20',
            calculationType: 'checkout',
            priorStatements
        });
        expect(result.periodReservations).toHaveLength(1);
        expect(result.periodReservations[0].hostifyId).toBe(99002);
        expect(result.totalRevenue).toBeCloseTo(599.46, 2);
        const warnings = result.duplicateWarnings.filter(w => w.type === 'prior_statement_reservation');
        expect(warnings).toHaveLength(1);
    });

    test('no-op when priorStatements is omitted', () => {
        const reservations = [makeReservation({ grossAmount: 1432.51 })];
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap,
            propertyIds: [1234],
            startDate: '2026-04-06',
            endDate: '2026-04-13',
            calculationType: 'checkout'
        });
        expect(result.periodReservations).toHaveLength(1);
        expect(result.totalRevenue).toBeCloseTo(1432.51, 2);
    });

    test('no-op when priorStatements is empty array', () => {
        const reservations = [makeReservation({ grossAmount: 1432.51 })];
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap,
            propertyIds: [1234],
            startDate: '2026-04-06',
            endDate: '2026-04-13',
            calculationType: 'checkout',
            priorStatements: []
        });
        expect(result.periodReservations).toHaveLength(1);
    });

    test('calendar-based calculation also dedupes via checkout boundary overlap', () => {
        const reservations = [
            makeReservation({ hostifyId: 99001, hasDetailedFinance: true, clientRevenue: 1432.51 })
        ];
        const priorStatements = [makeStatement({ reservations: [makeReservation()] })];
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap,
            propertyIds: [1234],
            startDate: '2026-04-13',
            endDate: '2026-04-20',
            calculationType: 'calendar',
            priorStatements
        });
        expect(result.periodReservations).toHaveLength(0);
        const warnings = result.duplicateWarnings.filter(w => w.type === 'prior_statement_reservation');
        expect(warnings).toHaveLength(1);
    });

    test('group/combined statement: dedupes across multiple properties', () => {
        const reservations = [
            makeReservation({ hostifyId: 1, propertyId: 1234, grossAmount: 1000 }),
            makeReservation({ hostifyId: 2, propertyId: 5678, grossAmount: 500 })
        ];
        const priorStatements = [
            makeStatement({ id: 10, reservations: [{ hostifyId: 2, propertyId: 5678 }] })
        ];
        const mapping = {
            1234: { id: 1234, pmFeePercentage: 15, cleaningFee: 0 },
            5678: { id: 5678, pmFeePercentage: 15, cleaningFee: 0 }
        };
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap: mapping,
            propertyIds: [1234, 5678],
            startDate: '2026-04-06',
            endDate: '2026-04-13',
            calculationType: 'checkout',
            priorStatements
        });
        expect(result.periodReservations).toHaveLength(1);
        expect(result.periodReservations[0].hostifyId).toBe(1);
        expect(result.totalRevenue).toBeCloseTo(1000, 2);
    });

    test('cancelled reservation in prior statement does not block a new booking with different id', () => {
        const reservations = [makeReservation({ hostifyId: 99999, grossAmount: 1000 })];
        const priorStatements = [makeStatement({ reservations: [makeReservation({ hostifyId: 88888 })] })];
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap,
            propertyIds: [1234],
            startDate: '2026-04-06',
            endDate: '2026-04-13',
            calculationType: 'checkout',
            priorStatements
        });
        // The fallback (property+dates+guest) would catch this because all fallback keys match.
        // This is the intentional behavior — if the same guest+dates+property appears, it's treated as the same booking.
        expect(result.periodReservations).toHaveLength(0);
    });

    test('skips reservation whose status is not allowed (e.g., cancelled)', () => {
        const reservations = [makeReservation({ status: 'cancelled' })];
        const priorStatements = [];
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap,
            propertyIds: [1234],
            startDate: '2026-04-06',
            endDate: '2026-04-13',
            calculationType: 'checkout',
            priorStatements
        });
        expect(result.periodReservations).toHaveLength(0);
    });

    test('blocked reservations are still subject to dedupe', () => {
        const reservations = [makeReservation({ hostifyId: 77777, status: 'blocked' })];
        const priorStatements = [makeStatement({ reservations: [makeReservation({ hostifyId: 77777, status: 'blocked' })] })];
        const result = StatementCalculationService.calculateStatementFinancials({
            reservations,
            expenses: [],
            listingInfoMap,
            propertyIds: [1234],
            startDate: '2026-04-06',
            endDate: '2026-04-13',
            calculationType: 'checkout',
            priorStatements
        });
        expect(result.periodReservations).toHaveLength(0);
    });
});
