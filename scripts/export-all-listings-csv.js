#!/usr/bin/env node

/**
 * Export all listings from Hostify to CSV
 * Creates a CSV file with listing ID and name for all properties in the system
 * Usage: node scripts/export-all-listings-csv.js
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const HostifyService = require('../src/services/HostifyService');

async function exportAllListingsToCSV() {
    console.log('='.repeat(60));
    console.log('Exporting All Listings to CSV');
    console.log('='.repeat(60));
    console.log('');

    try {
        // Fetch all listings from Hostify
        console.log('Fetching all listings from Hostify...');
        const response = await HostifyService.getAllProperties();

        if (!response.result || response.result.length === 0) {
            console.log('No listings found in Hostify');
            return;
        }

        const listings = response.result;
        console.log(`Found ${listings.length} listings`);
        console.log('');

        // Create CSV header
        const csvLines = ['ID,Name'];

        // Add each listing
        listings.forEach(listing => {
            const id = listing.id;
            const name = (listing.name || listing.nickname || `Property ${listing.id}`).replace(/"/g, '""'); // Escape quotes
            csvLines.push(`${id},"${name}"`);
        });

        const csvContent = csvLines.join('\n');

        // Create exports directory if it doesn't exist
        const exportsDir = path.join(__dirname, '../exports');
        await fs.mkdir(exportsDir, { recursive: true });

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const filename = `all-listings-${timestamp}.csv`;
        const filepath = path.join(exportsDir, filename);

        // Write CSV file
        await fs.writeFile(filepath, csvContent, 'utf8');

        console.log('CSV File Details:');
        console.log(`   Filename: ${filename}`);
        console.log(`   Location: ${filepath}`);
        console.log(`   Total Listings: ${listings.length}`);
        console.log('');

        // Show first 10 listings as preview
        console.log('Preview (first 10 listings):');
        console.log('-'.repeat(60));
        listings.slice(0, 10).forEach((listing, index) => {
            console.log(`${index + 1}. ID: ${listing.id} - ${listing.name || listing.nickname || 'N/A'}`);
        });
        if (listings.length > 10) {
            console.log(`... and ${listings.length - 10} more`);
        }
        console.log('-'.repeat(60));
        console.log('');
        console.log('Export completed successfully!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('');
        console.error('ERROR during export:');
        console.error('='.repeat(60));
        console.error('Error message:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('='.repeat(60));
        process.exit(1);
    }
}

// Run the export
exportAllListingsToCSV();

