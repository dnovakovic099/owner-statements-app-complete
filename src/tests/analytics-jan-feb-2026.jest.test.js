/**
 * Analytics accuracy test — Jan 1 to Feb 28 2026, top 15 properties
 *
 * For each of the 15 highest-revenue properties in this period:
 *   1. Run the same deduplication logic used by the analytics API
 *   2. Re-calculate financials using StatementCalculationService + real DB data
 *   3. Assert the re-calculated numbers match what is stored in the statement(s)
 *
 * This catches any regression where the analytics shows different numbers
 * than the actual statements.
 *
 * Run:  npx jest src/tests/analytics-jan-feb-2026.jest.test.js --verbose
 */

require('dotenv').config();
const { Op } = require('sequelize');
const { Statement, Listing, sequelize } = require('../models');
const StatementCalculationService = require('../services/StatementCalculationService');

const QUERY_START = '2026-01-01';
const QUERY_END   = '2026-02-28';

// ─── deduplication (mirrors analytics.js step 2, including the fullCover fix) ─

function selectStatementIds(rows, qStart, qEnd) {
    const byProp = new Map();
    for (const r of rows) {
        if (!byProp.has(r.propertyId)) byProp.set(r.propertyId, []);
        byProp.get(r.propertyId).push(r);
    }

    const selectedIds = [];
    for (const [, propRows] of byProp) {
        // propRows already sorted id DESC (newest first)

        // If one statement covers the entire query range, use it alone
        const fullCover = propRows.find(row => {
            const s = row.weekStartDate ? String(row.weekStartDate).slice(0, 10) : null;
            const e = row.weekEndDate   ? String(row.weekEndDate).slice(0, 10)   : null;
            return s && e && s <= qStart && e >= qEnd;
        });
        if (fullCover) {
            selectedIds.push(fullCover.id);
            continue;
        }

        // Otherwise build a non-overlapping set, clipping to the query window.
        // When a wider interval subsumes a narrower one, remove the narrower one.
        const propSelected = []; // { id, effS?, effE? }
        for (const row of propRows) {
            const s = row.weekStartDate ? String(row.weekStartDate).slice(0, 10) : null;
            const e = row.weekEndDate   ? String(row.weekEndDate).slice(0, 10)   : null;
            if (s && e) {
                const effS = s < qStart ? qStart : s;
                const effE = e > qEnd   ? qEnd   : e;
                if (effS <= effE) {
                    if (propSelected.some(p => p.effS !== undefined && p.effS <= effS && p.effE >= effE)) continue;
                    for (let i = propSelected.length - 1; i >= 0; i--) {
                        if (propSelected[i].effS !== undefined && effS <= propSelected[i].effS && effE >= propSelected[i].effE) {
                            propSelected.splice(i, 1);
                        }
                    }
                    propSelected.push({ id: row.id, effS, effE });
                    continue;
                }
            }
            propSelected.push({ id: row.id });
        }
        selectedIds.push(...propSelected.map(p => p.id));
    }
    return selectedIds;
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeAll(() => sequelize.authenticate());
afterAll(() => sequelize.close());

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseJson(raw) {
    if (!raw) return [];
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return []; }
}

function buildListingInfoMap(listing) {
    return { [listing.id]: listing };
}

// ─── main test suite ──────────────────────────────────────────────────────────

describe(`Analytics Jan 1–Feb 28 2026 · top-15 properties`, () => {
    // Populated in beforeAll
    let top15 = [];

    beforeAll(async () => {
        // Fetch all overlapping statement meta rows
        const metaRows = await Statement.findAll({
            attributes: ['id', 'propertyId', 'propertyName', 'weekStartDate', 'weekEndDate',
                         'totalRevenue', 'pmCommission', 'ownerPayout',
                         'reservations', 'expenses',
                         'pmPercentage', 'calculationType',
                         'waiveCommission', 'waiveCommissionUntil',
                         'isCohostOnAirbnb', 'disregardTax', 'airbnbPassThroughTax',
                         'cleaningFeePassThrough'],
            where: {
                weekStartDate: { [Op.lte]: QUERY_END },
                weekEndDate:   { [Op.gte]: QUERY_START },
                propertyId:    { [Op.ne]: null },
            },
            order: [['id', 'DESC']],
            raw: true,
        });

        // Deduplicate
        const selectedIds = selectStatementIds(metaRows, QUERY_START, QUERY_END);
        const selectedStmts = metaRows.filter(r => selectedIds.includes(r.id));

        // Fetch listing configs for all selected property IDs
        const propIds = [...new Set(selectedStmts.map(s => s.propertyId))];
        const listings = await Listing.findAll({
            where: { id: { [Op.in]: propIds } },
            raw: true,
        });
        const listingById = Object.fromEntries(listings.map(l => [l.id, l]));

        // Aggregate per property
        const propMap = new Map();
        for (const stmt of selectedStmts) {
            const pid = stmt.propertyId;
            if (!propMap.has(pid)) {
                propMap.set(pid, {
                    propertyId: pid,
                    propertyName: stmt.propertyName,
                    listing: listingById[pid] || null,
                    statements: [],
                    storedRevenue: 0,
                    storedPmCommission: 0,
                    storedOwnerPayout: 0,
                });
            }
            const entry = propMap.get(pid);
            entry.statements.push(stmt);
            entry.storedRevenue      += parseFloat(stmt.totalRevenue)   || 0;
            entry.storedPmCommission += parseFloat(stmt.pmCommission)    || 0;
            entry.storedOwnerPayout  += parseFloat(stmt.ownerPayout)    || 0;
        }

        // Pick top 15 by stored revenue
        top15 = [...propMap.values()]
            .sort((a, b) => b.storedRevenue - a.storedRevenue)
            .slice(0, 15);
    });

    test('at least 15 properties found in the date range', () => {
        expect(top15.length).toBeGreaterThanOrEqual(15);
    });

    // ── per-property tests, generated dynamically ─────────────────────────────

    describe.each(
        // We reference top15 here; Jest collects describe.each at module load time
        // so we use a lazy getter pattern — the array is filled by beforeAll above.
        // To make this work we wrap in a function and call it inside a test.
        [[0],[1],[2],[3],[4],[5],[6],[7],[8],[9],[10],[11],[12],[13],[14]]
    )('property #%i', (idx) => {

        function getProp() { return top15[idx]; }

        test('listing config is available in DB', () => {
            const prop = getProp();
            if (!prop) return; // fewer than 15 properties — skip
            expect(prop.listing).not.toBeNull();
        });

        test('recalculated totalRevenue matches stored value', () => {
            const prop = getProp();
            if (!prop || !prop.listing) return;

            const listingInfoMap = buildListingInfoMap(prop.listing);
            let calcRevenue = 0;

            for (const stmt of prop.statements) {
                const reservations = parseJson(stmt.reservations);
                const expenses     = parseJson(stmt.expenses);
                // Use the ORIGINAL statement dates, not the query-clamped range.
                // The stored totalRevenue reflects the full statement period,
                // so recalculating with original dates gives a comparable result.
                const stmtStart = String(stmt.weekStartDate).slice(0, 10);
                const stmtEnd   = String(stmt.weekEndDate).slice(0, 10);

                const result = StatementCalculationService.calculateStatementFinancials({
                    reservations,
                    expenses,
                    listingInfoMap,
                    propertyIds: [prop.propertyId],
                    startDate:   stmtStart,
                    endDate:     stmtEnd,
                    calculationType: stmt.calculationType || 'checkout',
                });
                calcRevenue += result.totalRevenue;
            }

            const storedRounded = Math.round(prop.storedRevenue * 100) / 100;
            const calcRounded   = Math.round(calcRevenue * 100) / 100;

            console.log(`[${prop.propertyName}] stored=$${storedRounded} calc=$${calcRounded}`);
            expect(calcRounded).toBeCloseTo(storedRounded, 1);
        });

        test('recalculated pmCommission matches stored value', () => {
            const prop = getProp();
            if (!prop || !prop.listing) return;

            const listingInfoMap = buildListingInfoMap(prop.listing);
            let calcPm = 0;

            for (const stmt of prop.statements) {
                const reservations = parseJson(stmt.reservations);
                const expenses     = parseJson(stmt.expenses);
                const stmtStart = String(stmt.weekStartDate).slice(0, 10);
                const stmtEnd   = String(stmt.weekEndDate).slice(0, 10);

                const result = StatementCalculationService.calculateStatementFinancials({
                    reservations,
                    expenses,
                    listingInfoMap,
                    propertyIds: [prop.propertyId],
                    startDate:   stmtStart,
                    endDate:     stmtEnd,
                    calculationType: stmt.calculationType || 'checkout',
                });
                calcPm += result.pmCommission;
            }

            const storedRounded = Math.round(prop.storedPmCommission * 100) / 100;
            const calcRounded   = Math.round(calcPm * 100) / 100;
            expect(calcRounded).toBeCloseTo(storedRounded, 1);
        });

        test('recalculated ownerPayout matches stored value', () => {
            const prop = getProp();
            if (!prop || !prop.listing) return;

            const listingInfoMap = buildListingInfoMap(prop.listing);
            let calcPayout = 0;

            for (const stmt of prop.statements) {
                const reservations = parseJson(stmt.reservations);
                const expenses     = parseJson(stmt.expenses);
                const stmtStart = String(stmt.weekStartDate).slice(0, 10);
                const stmtEnd   = String(stmt.weekEndDate).slice(0, 10);

                const result = StatementCalculationService.calculateStatementFinancials({
                    reservations,
                    expenses,
                    listingInfoMap,
                    propertyIds: [prop.propertyId],
                    startDate:   stmtStart,
                    endDate:     stmtEnd,
                    calculationType: stmt.calculationType || 'checkout',
                });
                calcPayout += result.ownerPayout;
            }

            const storedRounded = Math.round(prop.storedOwnerPayout * 100) / 100;
            const calcRounded   = Math.round(calcPayout * 100) / 100;
            expect(calcRounded).toBeCloseTo(storedRounded, 1);
        });

        test('pmCommission is positive in DB (analytics displays it as negative)', () => {
            const prop = getProp();
            if (!prop) return;
            // Each individual statement's PM commission should be non-negative
            for (const stmt of prop.statements) {
                expect(parseFloat(stmt.pmCommission)).toBeGreaterThanOrEqual(0);
            }
        });
    });

    // ── deduplication: no property has two overlapping selected statements ────

    test('dedup: each property is represented by exactly one statement (or a non-overlapping set)', async () => {
        const metaRows = await Statement.findAll({
            attributes: ['id', 'propertyId', 'weekStartDate', 'weekEndDate'],
            where: {
                weekStartDate: { [Op.lte]: QUERY_END },
                weekEndDate:   { [Op.gte]: QUERY_START },
                propertyId:    { [Op.ne]: null },
            },
            order: [['id', 'DESC']],
            raw: true,
        });

        const selectedIds = selectStatementIds(metaRows, QUERY_START, QUERY_END);
        const selected = metaRows.filter(r => selectedIds.includes(r.id));

        // For each property, check none of the selected statements overlap each other
        const byProp = new Map();
        for (const r of selected) {
            if (!byProp.has(r.propertyId)) byProp.set(r.propertyId, []);
            byProp.get(r.propertyId).push(r);
        }

        for (const [propId, stmts] of byProp) {
            for (let i = 0; i < stmts.length; i++) {
                for (let j = i + 1; j < stmts.length; j++) {
                    const a = stmts[i], b = stmts[j];
                    const aStart = String(a.weekStartDate).slice(0, 10);
                    const aEnd   = String(a.weekEndDate).slice(0, 10);
                    const bStart = String(b.weekStartDate).slice(0, 10);
                    const bEnd   = String(b.weekEndDate).slice(0, 10);
                    // They overlap if aStart <= bEnd AND bStart <= aEnd
                    const overlap = aStart <= bEnd && bStart <= aEnd;
                    expect(overlap).toBe(false);
                }
            }
        }
    });

    // ── summary printout ─────────────────────────────────────────────────────

    test('summary: print top-15 properties with stored vs recalculated numbers', () => {
        console.log('\n=== Jan 1–Feb 28 2026 · Top 15 Properties ===');
        console.log(
            'Rank | Property                         | Stored Rev   | Stored PM     | Stored Payout | Stmts'
        );
        console.log('-'.repeat(105));
        top15.forEach((p, i) => {
            const name   = (p.propertyName || 'Unknown').substring(0, 33).padEnd(33);
            const rev    = `$${p.storedRevenue.toFixed(2)}`.padStart(12);
            const pm     = `-$${p.storedPmCommission.toFixed(2)}`.padStart(13);
            const payout = `$${p.storedOwnerPayout.toFixed(2)}`.padStart(13);
            const cnt    = p.statements.length;
            console.log(`  ${String(i + 1).padStart(2)} | ${name} | ${rev} | ${pm} | ${payout} | ${cnt}`);
        });
        console.log('='.repeat(105));
        expect(top15.length).toBeGreaterThan(0);
    });
});
