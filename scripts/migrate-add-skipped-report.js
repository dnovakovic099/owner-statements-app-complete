#!/usr/bin/env node

/**
 * Migration: Add skipped_report column to tag_notifications table
 * Stores JSON report of listings that were skipped during generation with reasons.
 *
 * Usage: node scripts/migrate-add-skipped-report.js
 *
 * Idempotent: Safe to run multiple times - skips column if it already exists.
 */

require('dotenv').config();
const sequelize = require('../src/config/database');

async function migrate() {
    console.log('Adding skipped_report column to tag_notifications table...');
    console.log('='.repeat(60));

    const dialect = sequelize.getDialect();
    const isPostgres = dialect === 'postgres';

    try {
        await sequelize.authenticate();
        console.log(`Connected to ${dialect} database`);

        // Check if column already exists
        let columnExists = false;
        try {
            if (isPostgres) {
                const [results] = await sequelize.query(
                    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tag_notifications' AND column_name = 'skipped_report'`
                );
                columnExists = results.length > 0;
            } else {
                const [results] = await sequelize.query(`PRAGMA table_info(tag_notifications)`);
                columnExists = results.some(col => col.name === 'skipped_report');
            }
        } catch (e) {
            // Table might not exist yet
        }

        if (columnExists) {
            console.log('Column skipped_report already exists - skipping');
        } else {
            const colType = isPostgres ? 'TEXT' : 'TEXT';
            await sequelize.query(`ALTER TABLE tag_notifications ADD COLUMN skipped_report ${colType} DEFAULT NULL`);
            console.log('Added column: skipped_report (TEXT)');
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
