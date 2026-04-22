#!/usr/bin/env node

/**
 * Smoke test for excludeCleaningFromCommission feature.
 *
 * 1. Verifies the new columns exist on listings and statements.
 * 2. Verifies existing rows default to false (no surprise flag flips).
 * 3. Loads a real listing + its reservations from the last ~90 days and runs
 *    the statement calculation twice (flag off, then flag on) to confirm:
 *      - totalRevenue is identical
 *      - pmCommission drops by ~Σ(guestCleaningFee × pm%)
 *      - ownerPayout grows by the same amount
 *
 * READ-ONLY: does not modify the database.
 */

require('dotenv').config();
const sequelize = require('../src/config/database');
const StatementCalculationService = require('../src/services/StatementCalculationService');
const { Listing } = require('../src/models');

async function run() {
    console.log('='.repeat(70));
    console.log('SMOKE TEST: excludeCleaningFromCommission');
    console.log('='.repeat(70));

    // 1. Verify columns exist
    const [listingCols] = await sequelize.query(
        `SELECT column_name, data_type, column_default FROM information_schema.columns
         WHERE table_name = 'listings' AND column_name = 'exclude_cleaning_from_commission'`
    );
    const [statementCols] = await sequelize.query(
        `SELECT column_name, data_type, column_default FROM information_schema.columns
         WHERE table_name = 'statements' AND column_name = 'exclude_cleaning_from_commission'`
    );
    console.log('\n[1] Column existence check');
    console.log('  listings.exclude_cleaning_from_commission:', listingCols[0] || 'MISSING');
    console.log('  statements.exclude_cleaning_from_commission:', statementCols[0] || 'MISSING');
    if (!listingCols[0] || !statementCols[0]) {
        console.error('FAIL: missing column(s)');
        process.exit(1);
    }

    // 2. Verify no existing rows have the flag enabled accidentally
    const [counts] = await sequelize.query(
        `SELECT
            (SELECT COUNT(*) FROM listings) AS total_listings,
            (SELECT COUNT(*) FROM listings WHERE exclude_cleaning_from_commission = true) AS listings_flag_true,
            (SELECT COUNT(*) FROM statements) AS total_statements,
            (SELECT COUNT(*) FROM statements WHERE exclude_cleaning_from_commission = true) AS statements_flag_true`
    );
    console.log('\n[2] Default value check');
    console.log('  ', counts[0]);
    if (parseInt(counts[0].listings_flag_true) > 0 || parseInt(counts[0].statements_flag_true) > 0) {
        console.error('FAIL: existing rows unexpectedly have flag=true');
        process.exit(1);
    }

    // 3. Pull one real listing from DB (for realistic PM% + flags) and use synthetic
    //    reservations so we don't hit Hostify API during the smoke test.
    const startDate = '2026-04-01';
    const endDate = '2026-04-30';
    const sampleListing = await Listing.findOne({
        where: { isActive: true },
        order: [['id', 'ASC']]
    });
    const targetListing = sampleListing ? sampleListing.toJSON() : {
        id: 999999,
        pmFeePercentage: 20,
        isCohostOnAirbnb: false,
        disregardTax: false,
        airbnbPassThroughTax: false,
        cleaningFeePassThrough: false,
        excludeCleaningFromCommission: false
    };
    // Normalize fields we depend on
    targetListing.pmFeePercentage = parseFloat(targetListing.pmFeePercentage) || 15;
    targetListing.cleaningFeePassThrough = false;    // isolate the feature under test
    targetListing.excludeCleaningFromCommission = false;

    const targetReservations = [
        {
            propertyId: targetListing.id,
            status: 'confirmed',
            source: 'vrbo',
            checkInDate: '2026-04-01',
            checkOutDate: '2026-04-05',
            grossAmount: 1200,
            cleaningFee: 250,
            hasDetailedFinance: true,
            clientRevenue: 1200,
            clientTaxResponsibility: 60
        },
        {
            propertyId: targetListing.id,
            status: 'confirmed',
            source: 'airbnb',
            checkInDate: '2026-04-10',
            checkOutDate: '2026-04-14',
            grossAmount: 800,
            cleaningFee: 150,
            hasDetailedFinance: true,
            clientRevenue: 800,
            clientTaxResponsibility: 40
        }
    ];

    console.log('\n[3] Using listing:', targetListing.id, '-', targetListing.nickname || targetListing.name || '(synthetic)');
    console.log('    PM fee:', targetListing.pmFeePercentage + '%');
    console.log('    Reservations:', targetReservations.length);
    console.log('    Total cleaning fees:', targetReservations.reduce((s, r) => s + (parseFloat(r.cleaningFee) || 0), 0));

    const pmPct = parseFloat(targetListing.pmFeePercentage) || 15;

    // 4. Run calc with flag OFF
    const listingOff = { ...targetListing, excludeCleaningFromCommission: false };
    const resultOff = StatementCalculationService.calculateStatementFinancials({
        reservations: targetReservations,
        expenses: [],
        listingInfoMap: { [targetListing.id]: listingOff },
        propertyIds: [targetListing.id],
        startDate,
        endDate,
        calculationType: 'checkout'
    });

    // 5. Run calc with flag ON
    const listingOn = { ...targetListing, excludeCleaningFromCommission: true };
    const resultOn = StatementCalculationService.calculateStatementFinancials({
        reservations: targetReservations,
        expenses: [],
        listingInfoMap: { [targetListing.id]: listingOn },
        propertyIds: [targetListing.id],
        startDate,
        endDate,
        calculationType: 'checkout'
    });

    // 6. Compute expected delta
    // Only reservations that CONTRIBUTE to commission: exclude Airbnb on co-host listings
    const isCohost = Boolean(targetListing.isCohostOnAirbnb);
    const commissionableCleaning = targetReservations.reduce((s, r) => {
        const isAirbnb = r.source && r.source.toLowerCase().includes('airbnb');
        if (isAirbnb && isCohost) return s; // skipped entirely
        const fee = parseFloat(r.cleaningFee) || 0;
        const rev = r.hasDetailedFinance ? (r.clientRevenue || 0) : (r.grossAmount || 0);
        return s + Math.min(fee, rev);  // clamped the same way the service clamps
    }, 0);
    const expectedCommissionDelta = commissionableCleaning * (pmPct / 100);

    console.log('\n[4] Results');
    console.log('  ', 'flag=off: revenue =', resultOff.totalRevenue,
                ' pmCommission =', resultOff.pmCommission,
                ' ownerPayout =', resultOff.ownerPayout);
    console.log('  ', 'flag=on : revenue =', resultOn.totalRevenue,
                ' pmCommission =', resultOn.pmCommission,
                ' ownerPayout =', resultOn.ownerPayout);

    const actualCommissionDelta = Math.round((resultOff.pmCommission - resultOn.pmCommission) * 100) / 100;
    const actualPayoutDelta = Math.round((resultOn.ownerPayout - resultOff.ownerPayout) * 100) / 100;
    const expectedDeltaRounded = Math.round(expectedCommissionDelta * 100) / 100;

    console.log('\n[5] Invariants');
    console.log('  Revenue identical?                ', resultOff.totalRevenue === resultOn.totalRevenue ? 'PASS' : 'FAIL');
    console.log('  pmCommission dropped by Σ(clean×pm%)?', `expected ${expectedDeltaRounded}, got ${actualCommissionDelta}`,
                Math.abs(actualCommissionDelta - expectedDeltaRounded) < 0.05 ? 'PASS' : 'FAIL');
    console.log('  ownerPayout rose by same amount?   ', `expected ${expectedDeltaRounded}, got ${actualPayoutDelta}`,
                Math.abs(actualPayoutDelta - expectedDeltaRounded) < 0.05 ? 'PASS' : 'FAIL');

    const allPass =
        resultOff.totalRevenue === resultOn.totalRevenue &&
        Math.abs(actualCommissionDelta - expectedDeltaRounded) < 0.05 &&
        Math.abs(actualPayoutDelta - expectedDeltaRounded) < 0.05;

    console.log('\n' + '='.repeat(70));
    console.log(allPass ? 'SMOKE TEST: ALL PASS' : 'SMOKE TEST: FAILED');
    console.log('='.repeat(70));

    await sequelize.close();
    process.exit(allPass ? 0 : 1);
}

run().catch(err => {
    console.error('Smoke test crashed:', err);
    process.exit(2);
});
