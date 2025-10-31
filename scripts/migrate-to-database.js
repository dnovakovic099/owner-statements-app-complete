#!/usr/bin/env node

/**
 * Migrate existing file-based data to PostgreSQL/SQLite database
 * Run this once to move all existing statements and uploaded expenses to the database
 * Usage: node scripts/migrate-to-database.js
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { Statement, UploadedExpense, syncDatabase } = require('../src/models');

async function migrateStatements() {
    console.log('\n📄 Migrating Statements from JSON files...');
    console.log('='.repeat(60));
    
    const statementsDir = path.join(__dirname, '../statements');
    
    try {
        const files = await fs.readdir(statementsDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        console.log(`Found ${jsonFiles.length} statement files`);
        
        let migrated = 0;
        let skipped = 0;
        let errors = 0;
        
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(statementsDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const statementData = JSON.parse(content);
                
                // Check if statement already exists in database
                const existing = await Statement.findByPk(statementData.id);
                if (existing) {
                    console.log(`  ⏭️  Statement ${statementData.id} already exists, skipping`);
                    skipped++;
                    continue;
                }
                
                // Create statement in database
                await Statement.create(statementData);
                console.log(`  ✅ Migrated statement ${statementData.id} - ${statementData.propertyName}`);
                migrated++;
                
            } catch (error) {
                console.error(`  ❌ Error migrating ${file}:`, error.message);
                errors++;
            }
        }
        
        console.log('\n📊 Statement Migration Summary:');
        console.log(`  Migrated: ${migrated}`);
        console.log(`  Skipped: ${skipped}`);
        console.log(`  Errors: ${errors}`);
        
    } catch (error) {
        console.error('❌ Error reading statements directory:', error.message);
    }
}

async function migrateUploadedExpenses() {
    console.log('\n💰 Migrating Uploaded Expenses from JSON files...');
    console.log('='.repeat(60));
    
    const uploadsDir = path.join(__dirname, '../uploads/expenses');
    
    try {
        const files = await fs.readdir(uploadsDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        console.log(`Found ${jsonFiles.length} expense upload files`);
        
        let migrated = 0;
        let skipped = 0;
        let errors = 0;
        
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(uploadsDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const expenseData = JSON.parse(content);
                
                if (!expenseData.expenses || !Array.isArray(expenseData.expenses)) {
                    console.log(`  ⚠️  Invalid format in ${file}, skipping`);
                    skipped++;
                    continue;
                }
                
                // Check if expenses from this file already exist
                const uploadFilename = path.parse(file).name;
                const existingCount = await UploadedExpense.count({
                    where: { uploadFilename }
                });
                
                if (existingCount > 0) {
                    console.log(`  ⏭️  Expenses from ${file} already migrated, skipping`);
                    skipped++;
                    continue;
                }
                
                // Add upload metadata to each expense
                const expensesWithMetadata = expenseData.expenses.map(expense => ({
                    ...expense,
                    uploadFilename,
                    source: expense.source || 'manual'
                }));
                
                // Bulk create expenses
                await UploadedExpense.bulkCreate(expensesWithMetadata);
                console.log(`  ✅ Migrated ${expensesWithMetadata.length} expenses from ${file}`);
                migrated += expensesWithMetadata.length;
                
            } catch (error) {
                console.error(`  ❌ Error migrating ${file}:`, error.message);
                errors++;
            }
        }
        
        console.log('\n📊 Expense Migration Summary:');
        console.log(`  Migrated: ${migrated} expenses`);
        console.log(`  Skipped: ${skipped} files`);
        console.log(`  Errors: ${errors}`);
        
    } catch (error) {
        console.error('❌ Error reading uploads directory:', error.message);
        console.log('   (This is OK if you have no uploaded expenses yet)');
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('🔄 DATABASE MIGRATION SCRIPT');
    console.log('='.repeat(60));
    console.log('This will migrate your existing JSON files to the database.');
    console.log('');
    
    try {
        // Initialize database first
        console.log('🔧 Initializing database...');
        await syncDatabase();
        console.log('✅ Database initialized\n');
        
        // Migrate statements
        await migrateStatements();
        
        // Migrate uploaded expenses
        await migrateUploadedExpenses();
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log('\n💡 Next steps:');
        console.log('   1. Test your app locally to verify everything works');
        console.log('   2. Deploy to Railway');
        console.log('   3. Run this script on Railway if needed');
        console.log('');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ MIGRATION FAILED:', error);
        process.exit(1);
    }
}

// Run migration
main();

