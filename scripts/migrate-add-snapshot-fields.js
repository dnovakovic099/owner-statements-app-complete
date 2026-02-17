#!/usr/bin/env node

/**
 * Migration: Add listing settings snapshot fields to statements table
 * These fields store listing settings at statement generation time to prevent
 * retroactive changes when listing settings are modified after generation.
 *
 * Usage: node scripts/migrate-add-snapshot-fields.js
 *
 * Idempotent: Safe to run multiple times - skips columns that already exist.
 */

require('dotenv').config();
const sequelize = require('../src/config/database');

const columns = [
    { name: 'waive_commission', type: { postgres: 'BOOLEAN', sqlite: 'INTEGER' }, defaultVal: 'NULL' },
    { name: 'waive_commission_until', type: { postgres: 'DATE', sqlite: 'TEXT' }, defaultVal: 'NULL' },
    { name: 'disregard_tax', type: { postgres: 'BOOLEAN', sqlite: 'INTEGER' }, defaultVal: 'NULL' },
    { name: 'airbnb_pass_through_tax', type: { postgres: 'BOOLEAN', sqlite: 'INTEGER' }, defaultVal: 'NULL' },
    { name: 'guest_paid_damage_coverage', type: { postgres: 'BOOLEAN', sqlite: 'INTEGER' }, defaultVal: 'NULL' },
    { name: 'listing_settings_snapshot', type: { postgres: 'JSONB', sqlite: 'TEXT' }, defaultVal: 'NULL' }
];

async function migrate() {
    console.log('Adding listing settings snapshot fields to statements table...');
    console.log('='.repeat(60));

    const dialect = sequelize.getDialect();
    const isPostgres = dialect === 'postgres';
    console.log(`Database dialect: ${dialect}`);

    let added = 0;
    let skipped = 0;
    let errors = 0;

    for (const col of columns) {
        const colType = isPostgres ? col.type.postgres : col.type.sqlite;
        const sql = isPostgres
            ? `ALTER TABLE statements ADD COLUMN IF NOT EXISTS ${col.name} ${colType} DEFAULT ${col.defaultVal}`
            : `ALTER TABLE statements ADD COLUMN ${col.name} ${colType} DEFAULT ${col.defaultVal}`;

        try {
            await sequelize.query(sql);
            console.log(`  Added column: ${col.name} (${colType})`);
            added++;
        } catch (error) {
            // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so handle duplicate column error
            if (error.message && (error.message.includes('duplicate column') || error.message.includes('already exists'))) {
                console.log(`  Column ${col.name} already exists, skipping`);
                skipped++;
            } else {
                console.error(`  Error adding column ${col.name}:`, error.message);
                errors++;
            }
        }
    }

    console.log('\nMigration Summary:');
    console.log(`  Added: ${added}`);
    console.log(`  Skipped (already exist): ${skipped}`);
    console.log(`  Errors: ${errors}`);

    if (errors > 0) {
        process.exit(1);
    }
}

migrate()
    .then(() => {
        console.log('\nMigration complete.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
