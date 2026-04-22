#!/usr/bin/env node

/**
 * Migration: Add exclude_cleaning_from_commission column to listings and statements tables.
 *
 * Listings: per-listing toggle. When true, guest-paid cleaning fee is subtracted from
 * revenue before computing PM commission (commission base = revenue - cleaningFee).
 *
 * Statements: snapshot of the listing flag at generation time so prior statements keep
 * their calculations stable if the listing setting changes later.
 *
 * Usage: node scripts/migrate-add-exclude-cleaning-from-commission.js
 *
 * Idempotent: safe to run multiple times - skips columns that already exist.
 */

require('dotenv').config();
const sequelize = require('../src/config/database');

async function columnExists(table, column, isPostgres) {
    try {
        if (isPostgres) {
            const [results] = await sequelize.query(
                `SELECT column_name FROM information_schema.columns WHERE table_name = :table AND column_name = :column`,
                { replacements: { table, column } }
            );
            return results.length > 0;
        } else {
            const [results] = await sequelize.query(`PRAGMA table_info(${table})`);
            return results.some(col => col.name === column);
        }
    } catch (e) {
        return false;
    }
}

async function migrate() {
    console.log('Adding exclude_cleaning_from_commission columns...');
    console.log('='.repeat(60));

    const dialect = sequelize.getDialect();
    const isPostgres = dialect === 'postgres';
    const boolType = isPostgres ? 'BOOLEAN' : 'INTEGER';
    const defaultClause = isPostgres ? 'DEFAULT FALSE' : 'DEFAULT 0';

    try {
        await sequelize.authenticate();
        console.log(`Connected to ${dialect} database`);

        for (const table of ['listings', 'statements']) {
            const exists = await columnExists(table, 'exclude_cleaning_from_commission', isPostgres);
            if (exists) {
                console.log(`${table}.exclude_cleaning_from_commission already exists - skipping`);
            } else {
                await sequelize.query(
                    `ALTER TABLE ${table} ADD COLUMN exclude_cleaning_from_commission ${boolType} NOT NULL ${defaultClause}`
                );
                console.log(`Added ${table}.exclude_cleaning_from_commission (${boolType})`);
            }
        }

        console.log('='.repeat(60));
        console.log('Migration complete!');
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
