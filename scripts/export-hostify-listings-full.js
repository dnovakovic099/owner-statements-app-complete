#!/usr/bin/env node

/**
 * Export all listings from Hostify API with complete data
 * This saves the raw API response to see all available fields
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const HostifyService = require('../src/services/HostifyService');

async function exportAllListings() {
    console.log('='.repeat(60));
    console.log('📋 EXPORTING ALL HOSTIFY LISTINGS DATA');
    console.log('='.repeat(60));
    console.log('');

    try {
        // Fetch all properties from Hostify
        console.log('🔄 Fetching all listings from Hostify API...');
        const response = await HostifyService.getAllProperties();
        
        if (!response || !response.result || !Array.isArray(response.result) || response.result.length === 0) {
            console.error('❌ No listings data received from Hostify');
            return;
        }
        
        const listings = response.result;
        console.log(`✅ Fetched ${listings.length} listings from Hostify\n`);

        // Create exports directory
        const exportsDir = path.join(__dirname, '../exports');
        await fs.mkdir(exportsDir, { recursive: true });

        // Generate timestamp for filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        
        // Save complete listings array with all data
        const fullResponseFile = path.join(exportsDir, `hostify-listings-complete-${timestamp}.json`);
        await fs.writeFile(
            fullResponseFile,
            JSON.stringify({ success: true, count: listings.length, listings }, null, 2),
            'utf8'
        );
        console.log(`💾 Saved complete listings data to: ${path.basename(fullResponseFile)}`);

        // Save just the listings array
        const listingsFile = path.join(exportsDir, `hostify-listings-${timestamp}.json`);
        await fs.writeFile(
            listingsFile,
            JSON.stringify(listings, null, 2),
            'utf8'
        );
        console.log(`💾 Saved listings array to: ${path.basename(listingsFile)}`);

        // Create a summary with all unique fields across all listings
        console.log('\n📊 Analyzing listing data structure...');
        const allFields = new Set();
        const fieldExamples = {};

        listings.forEach(listing => {
            Object.keys(listing).forEach(key => {
                allFields.add(key);
                if (!fieldExamples[key] && listing[key] !== null && listing[key] !== undefined) {
                    fieldExamples[key] = listing[key];
                }
            });
        });

        const summary = {
            totalListings: listings.length,
            timestamp: new Date().toISOString(),
            allFields: Array.from(allFields).sort(),
            fieldCount: allFields.size,
            fieldExamples: fieldExamples,
            sampleListing: listings[0] || null
        };

        const summaryFile = path.join(exportsDir, `hostify-listings-summary-${timestamp}.json`);
        await fs.writeFile(
            summaryFile,
            JSON.stringify(summary, null, 2),
            'utf8'
        );
        console.log(`💾 Saved data summary to: ${path.basename(summaryFile)}`);

        // Print field list to console
        console.log('\n' + '='.repeat(60));
        console.log(`📋 FOUND ${allFields.size} UNIQUE FIELDS IN HOSTIFY DATA`);
        console.log('='.repeat(60));
        Array.from(allFields).sort().forEach((field, index) => {
            console.log(`${(index + 1).toString().padStart(3)}. ${field}`);
        });

        // Show sample data
        console.log('\n' + '='.repeat(60));
        console.log('📄 SAMPLE LISTING (first property):');
        console.log('='.repeat(60));
        console.log(JSON.stringify(listings[0], null, 2));

        console.log('\n' + '='.repeat(60));
        console.log('✅ EXPORT COMPLETE!');
        console.log('='.repeat(60));
        console.log(`\n📁 Files saved to: ${exportsDir}`);
        console.log(`   1. Full API response: ${path.basename(fullResponseFile)}`);
        console.log(`   2. Listings array: ${path.basename(listingsFile)}`);
        console.log(`   3. Data summary: ${path.basename(summaryFile)}`);
        console.log('');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the export
exportAllListings();

