#!/usr/bin/env node

/**
 * Convert Hostify listings JSON to CSV format
 * Handles nested fields and arrays
 */

const fs = require('fs').promises;
const path = require('path');

// Helper function to flatten nested objects
function flattenObject(obj, prefix = '') {
    const flattened = {};
    
    for (const key in obj) {
        if (obj[key] === null || obj[key] === undefined) {
            flattened[prefix + key] = '';
        } else if (Array.isArray(obj[key])) {
            // Convert arrays to comma-separated strings
            if (obj[key].length === 0) {
                flattened[prefix + key] = '';
            } else if (typeof obj[key][0] === 'object') {
                // Array of objects - convert to JSON string
                flattened[prefix + key] = JSON.stringify(obj[key]);
            } else {
                // Array of primitives - join with semicolon
                flattened[prefix + key] = obj[key].join('; ');
            }
        } else if (typeof obj[key] === 'object') {
            // Nested object - flatten it
            Object.assign(flattened, flattenObject(obj[key], prefix + key + '_'));
        } else {
            flattened[prefix + key] = obj[key];
        }
    }
    
    return flattened;
}

// Escape CSV values
function escapeCsvValue(value) {
    if (value === null || value === undefined) return '';
    
    const stringValue = String(value);
    
    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
    }
    
    return stringValue;
}

async function convertJsonToCsv(inputFile) {
    console.log('='.repeat(60));
    console.log('📊 CONVERTING JSON TO CSV');
    console.log('='.repeat(60));
    console.log('');

    try {
        // Read JSON file
        console.log(`📖 Reading JSON file: ${path.basename(inputFile)}`);
        const jsonContent = await fs.readFile(inputFile, 'utf8');
        const listings = JSON.parse(jsonContent);
        
        if (!Array.isArray(listings)) {
            console.error('❌ JSON file must contain an array of listings');
            return;
        }
        
        console.log(`✅ Loaded ${listings.length} listings\n`);

        // Flatten all listings and collect all unique fields
        console.log('🔄 Flattening nested data structures...');
        const flattenedListings = listings.map(listing => flattenObject(listing));
        
        // Get all unique column names
        const allColumns = new Set();
        flattenedListings.forEach(listing => {
            Object.keys(listing).forEach(key => allColumns.add(key));
        });
        
        const columns = Array.from(allColumns).sort();
        console.log(`📋 Found ${columns.length} columns\n`);

        // Create CSV header
        const csvHeader = columns.map(col => escapeCsvValue(col)).join(',');
        
        // Create CSV rows
        const csvRows = flattenedListings.map(listing => {
            return columns.map(col => escapeCsvValue(listing[col] || '')).join(',');
        });

        // Combine header and rows
        const csvContent = [csvHeader, ...csvRows].join('\n');

        // Save to file
        const outputFile = inputFile.replace('.json', '.csv');
        await fs.writeFile(outputFile, csvContent, 'utf8');
        
        console.log('='.repeat(60));
        console.log('✅ CSV EXPORT COMPLETE!');
        console.log('='.repeat(60));
        console.log(`\n📁 Saved to: ${path.basename(outputFile)}`);
        console.log(`📊 Total rows: ${listings.length} listings`);
        console.log(`📋 Total columns: ${columns.length} fields`);
        console.log(`💾 File size: ${(csvContent.length / 1024).toFixed(2)} KB`);
        console.log('');

        // Show column names
        console.log('📋 Columns included:');
        columns.slice(0, 20).forEach((col, i) => {
            console.log(`   ${(i + 1).toString().padStart(2)}. ${col}`);
        });
        if (columns.length > 20) {
            console.log(`   ... and ${columns.length - 20} more columns`);
        }
        console.log('');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Get input file from command line or use default
const inputFile = process.argv[2] || path.join(__dirname, '../exports/hostify-listings-2025-10-31T14-36-09.json');

console.log(`Input file: ${inputFile}\n`);
convertJsonToCsv(inputFile);

