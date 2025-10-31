#!/usr/bin/env node

/**
 * Import listings from CSV to database
 * Preserves PM fees if already set, updates listing info from Hostify
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');
const { Listing, syncDatabase } = require('../src/models');

async function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

async function importListings() {
    console.log('='.repeat(60));
    console.log('📊 IMPORTING LISTINGS TO DATABASE');
    console.log('='.repeat(60));
    console.log('');

    try {
        // Initialize database
        console.log('🔧 Initializing database...');
        await syncDatabase();
        console.log('✅ Database ready\n');

        // Find CSV file
        const csvFile = path.join(__dirname, '../data/all-listings-2025-10-31T13-03-55 - all-listings-2025-10-31T13-03-55.csv');
        
        console.log(`📖 Reading CSV file: ${path.basename(csvFile)}`);
        const listings = await parseCSV(csvFile);
        console.log(`✅ Loaded ${listings.length} listings from CSV\n`);

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        console.log('🔄 Processing listings...\n');

        for (const row of listings) {
            try {
                const listingId = parseInt(row.ID || row.id);
                
                if (!listingId) {
                    console.log(`⚠️  Skipping row - no ID found`);
                    skipped++;
                    continue;
                }

                // Check if listing exists
                const existingListing = await Listing.findByPk(listingId);

                const listingData = {
                    id: listingId,
                    name: row.Name || row.name || 'Unknown',
                    nickname: row['Internal Name'] || row.nickname || null,
                    street: row.Street || row.street || null,
                    city: row.City || row.city || null,
                    state: row.State || row.state || null,
                    country: row.Country || row.country || null,
                    isActive: true,
                    lastSyncedAt: new Date()
                };

                // Set PM fee if provided in CSV, handle percentage format (e.g., "15.00%")
                if (row['PM %'] || row['PM Fee'] || row['pm_fee']) {
                    let pmFeeStr = row['PM %'] || row['PM Fee'] || row['pm_fee'];
                    // Remove % sign and convert to number
                    pmFeeStr = String(pmFeeStr).replace('%', '').trim();
                    const pmFee = parseFloat(pmFeeStr);
                    if (!isNaN(pmFee) && pmFee >= 0) {
                        listingData.pmFeePercentage = pmFee;
                    }
                }

                if (existingListing) {
                    // Update existing - preserve PM fee if already set and not in CSV
                    if (existingListing.pmFeePercentage && !listingData.pmFeePercentage) {
                        delete listingData.pmFeePercentage; // Keep existing
                    }
                    
                    await existingListing.update(listingData);
                    console.log(`✅ Updated: ${listingData.name} (ID: ${listingId}) - PM Fee: ${existingListing.pmFeePercentage || 'default'}%`);
                    updated++;
                } else {
                    // Create new listing
                    if (!listingData.pmFeePercentage) {
                        listingData.pmFeePercentage = 15.00; // Default
                    }
                    
                    await Listing.create(listingData);
                    console.log(`🆕 Created: ${listingData.name} (ID: ${listingId}) - PM Fee: ${listingData.pmFeePercentage}%`);
                    created++;
                }

            } catch (error) {
                console.error(`❌ Error processing listing: ${error.message}`);
                errors++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ IMPORT COMPLETE!');
        console.log('='.repeat(60));
        console.log(`\n📊 Summary:`);
        console.log(`   🆕 Created: ${created}`);
        console.log(`   ♻️  Updated: ${updated}`);
        console.log(`   ⏭️  Skipped: ${skipped}`);
        console.log(`   ❌ Errors: ${errors}`);
        console.log(`   📋 Total processed: ${created + updated + skipped + errors}`);
        console.log('');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ IMPORT FAILED:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run import
importListings();

