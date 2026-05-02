#!/usr/bin/env node
/**
 * Backfill historical statement payouts using the canonical per-reservation
 * gross-payout formula (StatementCalculationService.calculateStatementFinancials).
 *
 * Why: from ~Dec 2025 through May 2026 the PUT edit and PUT reconfigure
 * handlers in routes/statements-file.js used a naive
 *   totalRevenue - pmCommission + totalUpsells - totalExpenses - adjustments
 * formula that silently dropped clientTaxResponsibility for non-Airbnb /
 * Airbnb-pass-through reservations, the cleaningFeePassThrough deduction,
 * and the cohost-on-Airbnb special case. Any statement that was edited or
 * reconfigured during that window had its stored ownerPayout overwritten
 * with the wrong value.
 *
 * The GET /:id/view handler already self-heals on read (line 3597), so any
 * statement that has been viewed since Dec 2025 is already correct. This
 * script handles the long tail of statements that have not been viewed.
 *
 * Usage:
 *   node scripts/backfill-statement-payouts.js              # dry run
 *   node scripts/backfill-statement-payouts.js --write      # apply changes
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('dotenv').config();

const Statement = require('../src/models/Statement');
const ListingService = require('../src/services/ListingService');
const StatementCalculationService = require('../src/services/StatementCalculationService');
const FileDataService = require('../src/services/FileDataService');

const WRITE = process.argv.includes('--write');

function fmt(n) {
    return Number(n || 0).toFixed(2);
}

function buildListingInfoMap(dbListings, snapshot) {
    const map = {};
    for (const l of dbListings) map[l.id] = l;
    if (snapshot && typeof snapshot === 'object') {
        for (const [pid, snap] of Object.entries(snapshot)) {
            const id = parseInt(pid);
            map[id] = { ...(map[id] || {}), ...snap, id };
        }
    }
    return map;
}

(async () => {
    console.log(`Backfill statement payouts (${WRITE ? 'WRITE' : 'DRY RUN'})`);
    console.log('─'.repeat(72));

    // Use explicit attributes + raw rows to dodge any schema-vs-model column drift
    // on the local dev DB. Production migrations may have added columns the local
    // schema lacks; we only need this subset anyway.
    const statements = await Statement.findAll({
        attributes: [
            'id', 'propertyId', 'propertyIds', 'propertyName',
            'weekStartDate', 'weekEndDate', 'calculationType',
            'totalRevenue', 'totalExpenses', 'pmCommission', 'ownerPayout',
            'adjustments', 'status',
            'reservations', 'expenses', 'listingSettingsSnapshot'
        ],
        order: [['id', 'ASC']],
        raw: true
    });
    console.log(`Loaded ${statements.length} statements\n`);

    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    const drifts = [];
    let totalAbsoluteDrift = 0;

    for (const json of statements) {
        const propertyIds = (json.propertyIds && Array.isArray(json.propertyIds) && json.propertyIds.length > 0)
            ? json.propertyIds.map(p => parseInt(p))
            : (json.propertyId ? [parseInt(json.propertyId)] : []);

        if (propertyIds.length === 0) {
            skipped++;
            continue;
        }

        const reservations = Array.isArray(json.reservations) ? json.reservations
            : (typeof json.reservations === 'string' ? JSON.parse(json.reservations) : []);
        const expenses = Array.isArray(json.expenses) ? json.expenses
            : (typeof json.expenses === 'string' ? JSON.parse(json.expenses) : []);

        // Pull current listing settings + overlay the snapshot saved on the
        // statement so PM-fee transitions are honored and the recompute uses
        // the same listing settings the original generation used.
        let dbListings = [];
        try {
            dbListings = await ListingService.getListingsWithPmFees(propertyIds);
        } catch (err) {
            console.log(`  ! Stmt ${json.id}: failed to load listings — skipping (${err.message})`);
            skipped++;
            continue;
        }
        const listingInfoMap = buildListingInfoMap(dbListings, json.listingSettingsSnapshot);

        const stmtStart = String(json.weekStartDate).slice(0, 10);
        const stmtEnd = String(json.weekEndDate).slice(0, 10);

        let result;
        try {
            result = StatementCalculationService.calculateStatementFinancials({
                reservations,
                expenses,
                listingInfoMap,
                propertyIds,
                startDate: stmtStart,
                endDate: stmtEnd,
                calculationType: json.calculationType || 'checkout'
            });
        } catch (err) {
            console.log(`  ! Stmt ${json.id}: recompute failed — skipping (${err.message})`);
            skipped++;
            continue;
        }

        const newPayout = Math.round(result.ownerPayout * 100) / 100;
        const newRevenue = Math.round(result.totalRevenue * 100) / 100;
        const newPm = Math.round(result.pmCommission * 100) / 100;
        const newExpenses = Math.round(result.totalExpenses * 100) / 100;

        const diff = Math.abs(parseFloat(json.ownerPayout || 0) - newPayout);

        if (diff > 0.01) {
            drifts.push({ id: json.id, name: json.propertyName, status: json.status, diff, stored: json.ownerPayout, fresh: newPayout });
            totalAbsoluteDrift += diff;
            console.log(`  ${WRITE ? '✓' : '·'} #${String(json.id).padStart(5)} [${(json.propertyName || '?').slice(0, 30).padEnd(30)}] ${json.status.padEnd(6)} ${fmt(json.ownerPayout).padStart(10)} → ${fmt(newPayout).padStart(10)}  (Δ ${fmt(newPayout - json.ownerPayout)})`);

            if (WRITE) {
                try {
                    await Statement.update({
                        ownerPayout: newPayout,
                        totalRevenue: newRevenue,
                        pmCommission: newPm,
                        totalExpenses: newExpenses
                    }, { where: { id: json.id } });
                    updated++;
                } catch (err) {
                    console.log(`    ! update failed: ${err.message}`);
                }
            } else {
                updated++;
            }
        } else {
            unchanged++;
        }
    }

    console.log('\n─'.repeat(72));
    console.log(`Total statements:  ${statements.length}`);
    console.log(`Drifted (would update / updated): ${updated}`);
    console.log(`Already correct:   ${unchanged}`);
    console.log(`Skipped:           ${skipped}`);
    console.log(`Sum of |drift|:    $${fmt(totalAbsoluteDrift)}`);

    if (drifts.length > 0) {
        const byStatus = {};
        for (const d of drifts) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
        console.log(`\nDrift by status: ${JSON.stringify(byStatus)}`);

        const top = [...drifts].sort((a, b) => b.diff - a.diff).slice(0, 10);
        console.log(`\nTop 10 drifts by absolute difference:`);
        for (const d of top) {
            console.log(`  #${d.id} [${(d.name || '?').slice(0, 30).padEnd(30)}] ${d.status.padEnd(6)} stored=$${fmt(d.stored)} → fresh=$${fmt(d.fresh)} (|Δ| $${fmt(d.diff)})`);
        }
    }

    if (!WRITE && updated > 0) {
        console.log(`\nThis was a DRY RUN. Re-run with --write to apply.`);
    }

    process.exit(0);
})().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
