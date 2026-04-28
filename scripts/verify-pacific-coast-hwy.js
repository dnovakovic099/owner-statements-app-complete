#!/usr/bin/env node
/**
 * Real end-to-end verification for the screenshot Louis sent.
 *
 * Property: Pacific Coast Hwy - Wafa  (Hostify id 300017901, PM 10%)
 * Period:   2026-04-13 → 2026-04-27, check-out based
 * Setting:  excludeCleaningFromCommission = true
 *
 * Three reservations from the rental-activity table:
 *
 *   Guest                  Base       GuestFees  Platform   Revenue    Cleaning
 *   ---------------------- ---------- ---------- ---------- ---------- --------
 *   Nicholas Villanueva    $812.00    $600.00    -$118.40   $1,293.60  $600
 *   Alejandra Montano      $936.00    $900.00    -$284.58   $1,551.42  $600
 *   Briana Desaulniers     $1,759.63  $400.00    -$334.74   $1,824.89  $400
 *
 * Spec from Louis: PM Commission = (Revenue - Cleaning) x 10%
 *
 * Expected results vs what the app showed before the fix:
 *
 *   Guest                  Before fix     After fix (spec)
 *   ---------------------- -------------- ----------------
 *   Nicholas Villanueva    -$129.36       -$69.36
 *   Alejandra Montano      -$155.14       -$95.14
 *   Briana Desaulniers     -$182.49       -$142.49
 *
 * This script invokes the real production calc service — no mocks, no
 * inlined math copies — and prints the values. Compare them to the
 * "After fix (spec)" column above.
 */

const StatementCalculationService = require('../src/services/StatementCalculationService');

const round2 = n => Math.round(n * 100) / 100;
const fmt = n => `${n < 0 ? '-' : ''}$${Math.abs(round2(n)).toFixed(2)}`;

const listing = {
    id: 300017901,
    nickname: 'Pacific Coast Hwy - Wafa',
    pmFeePercentage: 10,
    excludeCleaningFromCommission: true,
    isCohostOnAirbnb: false,
    disregardTax: false,
    airbnbPassThroughTax: true,         // VRBO/Airbnb pass-through banner is on
    cleaningFeePassThrough: false,
    waiveCommission: false
};

const listingInfoMap = { [listing.id]: listing };

const reservations = [
    {
        id: 'r1',
        propertyId: listing.id,
        guestName: 'Nicholas Villanueva',
        source: 'VRBO',
        status: 'confirmed',
        checkInDate: '2026-04-14',
        checkOutDate: '2026-04-17',
        nights: 3,
        hasDetailedFinance: true,
        baseRate: 812.00,
        cleaningAndOtherFees: 600.00,
        platformFees: 118.40,
        clientRevenue: 1293.60,
        cleaningFee: 600,
        clientTaxResponsibility: 225.92
    },
    {
        id: 'r2',
        propertyId: listing.id,
        guestName: 'Alejandra Montano',
        source: 'Airbnb',
        status: 'confirmed',
        checkInDate: '2026-04-17',
        checkOutDate: '2026-04-20',
        nights: 3,
        hasDetailedFinance: true,
        baseRate: 936.00,
        cleaningAndOtherFees: 900.00,
        platformFees: 284.58,
        clientRevenue: 1551.42,
        cleaningFee: 600,
        clientTaxResponsibility: 0
    },
    {
        id: 'r3',
        propertyId: listing.id,
        guestName: 'Briana Desaulniers',
        source: 'Airbnb',
        status: 'confirmed',
        checkInDate: '2026-04-23',
        checkOutDate: '2026-04-26',
        nights: 3,
        hasDetailedFinance: true,
        baseRate: 1759.63,
        cleaningAndOtherFees: 400.00,
        platformFees: 334.74,
        clientRevenue: 1824.89,
        cleaningFee: 400,
        clientTaxResponsibility: 345.54
    }
];

const startDate = '2026-04-13';
const endDate = '2026-04-27';

console.log('='.repeat(78));
console.log('Pacific Coast Hwy - Wafa  •  Period 2026-04-13 → 2026-04-27');
console.log('Listing config: PM 10%, excludeCleaningFromCommission = ON');
console.log('='.repeat(78));
console.log();

// ---------------------------------------------------------------------------
// Per-reservation commission base (this is what the renderer uses for each row)
// ---------------------------------------------------------------------------
console.log('Per-reservation commission (real getCommissionBase helper):');
console.log();
console.log('  Guest                 Revenue   Cleaning  Base       Commission');
console.log('  --------------------  --------- --------- ---------- ----------');

let totalCommission = 0;
for (const res of reservations) {
    const base = StatementCalculationService.getCommissionBase(res, listing, res.clientRevenue);
    const commission = base * (listing.pmFeePercentage / 100);
    totalCommission += commission;
    console.log(
        `  ${res.guestName.padEnd(20)}  ${fmt(res.clientRevenue).padStart(9)} ${fmt(res.cleaningFee).padStart(9)} ${fmt(base).padStart(10)} ${fmt(-commission).padStart(10)}`
    );
}
console.log();

// ---------------------------------------------------------------------------
// End-to-end through calculateRevenueAndCommission
// ---------------------------------------------------------------------------
const revAndComm = StatementCalculationService.calculateRevenueAndCommission(reservations, listingInfoMap);
console.log('calculateRevenueAndCommission (totals):');
console.log(`  totalRevenue   = ${fmt(revAndComm.totalRevenue)}`);
console.log(`  pmCommission   = ${fmt(-revAndComm.pmCommission)}  (avg ${revAndComm.avgPmPercentage.toFixed(2)}%)`);
console.log();

// ---------------------------------------------------------------------------
// End-to-end gross payout
// ---------------------------------------------------------------------------
const grossPayoutSum = StatementCalculationService.calculateGrossPayoutSum(
    reservations, listingInfoMap, endDate, 'checkout'
);
console.log('calculateGrossPayoutSum (gross payout for the period):');
console.log(`  grossPayout    = ${fmt(grossPayoutSum)}`);
console.log();

// ---------------------------------------------------------------------------
// Compare to Louis's spec
// ---------------------------------------------------------------------------
const specCommission = {
    'Nicholas Villanueva': 69.36,
    'Alejandra Montano':   95.14,
    'Briana Desaulniers':  142.49
};

let allMatch = true;
console.log('Match against Louis\'s spec:');
for (const res of reservations) {
    const base = StatementCalculationService.getCommissionBase(res, listing, res.clientRevenue);
    const actual = round2(base * (listing.pmFeePercentage / 100));
    const expected = specCommission[res.guestName];
    const ok = actual === expected;
    allMatch = allMatch && ok;
    console.log(`  ${res.guestName.padEnd(20)}  actual=${fmt(-actual).padStart(8)}  expected=${fmt(-expected).padStart(8)}  ${ok ? 'PASS' : 'FAIL'}`);
}

console.log();
console.log('='.repeat(78));
console.log(allMatch ? 'RESULT: ALL MATCH SPEC' : 'RESULT: MISMATCH — fix is broken');
console.log('='.repeat(78));

process.exit(allMatch ? 0 : 1);
