#!/usr/bin/env node

/**
 * Export Hostify listings to CSV (simplified version)
 * Usage: node scripts/export-listings-simple.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const HostifyService = require('../src/services/HostifyService');

// Simple CSV escape function
function escapeCSV(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Convert to string and handle special characters
    const str = String(value);
    
    // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

// Extract key listing information
function extractListingData(listing) {
    return {
        id: listing.id || '',
        name: listing.name || '',
        nickname: listing.nickname || '',
        status: listing.status || '',
        bedrooms: listing.bedrooms || '',
        bathrooms: listing.bathrooms || '',
        accommodates: listing.accommodates || '',
        propertyTypeId: listing.propertyTypeId || '',
        propertyTypeName: listing.propertyTypeName || '',
        roomTypeId: listing.roomTypeId || '',
        roomTypeName: listing.roomTypeName || '',
        city: listing.address?.city || '',
        state: listing.address?.state || '',
        country: listing.address?.country || '',
        zipcode: listing.address?.zipcode || '',
        latitude: listing.address?.latitude || '',
        longitude: listing.address?.longitude || '',
        basePrice: listing.basePrice || '',
        currency: listing.currency || '',
        weeklyDiscount: listing.weeklyDiscount || '',
        monthlyDiscount: listing.monthlyDiscount || '',
        cleaningFee: listing.cleaningFee || '',
        securityDeposit: listing.securityDeposit || '',
        minimumStay: listing.minimumStay || '',
        maximumStay: listing.maximumStay || '',
        checkInTime: listing.checkInTime || '',
        checkOutTime: listing.checkOutTime || '',
        ownerId: listing.ownerId || '',
        createdAt: listing.createdAt || '',
        updatedAt: listing.updatedAt || '',
        channelCount: listing.channels ? listing.channels.length : 0,
        photoCount: listing.photos ? listing.photos.length : 0,
        amenityCount: listing.amenities ? listing.amenities.length : 0
    };
}

async function exportListingsToCSV() {
    console.log('Exporting Hostaway Listings (Simplified)...\n');

    try {
        // Initialize Hostaway service
        const hostawayService = HostawayService;

        // Fetch all listings
        console.log('Fetching all listings from Hostaway...');
        const response = await hostawayService.getAllProperties();

        if (!response.result || response.result.length === 0) {
            console.log('No listings found');
            return;
        }

        console.log(`Found ${response.result.length} listings\n`);

        // Extract core data
        console.log('Processing listings data...');
        const processedListings = response.result.map(extractListingData);
        
        // Create CSV headers
        const headers = Object.keys(processedListings[0]);
        
        // Generate CSV content
        console.log('Generating CSV content...');
        const csvLines = [
            // Header row
            headers.map(escapeCSV).join(','),
            // Data rows
            ...processedListings.map(listing => 
                headers.map(header => escapeCSV(listing[header])).join(',')
            )
        ];
        
        const csvContent = csvLines.join('\n');
        
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, '../exports');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `hostaway-listings-simple-${timestamp}.csv`;
        const filepath = path.join(outputDir, filename);
        
        // Write CSV file
        fs.writeFileSync(filepath, csvContent, 'utf8');
        
        console.log(`CSV file created successfully!`);
        console.log(`File location: ${filepath}`);
        console.log(`Total listings exported: ${processedListings.length}`);

        // Display summary statistics
        console.log('\nQuick Summary:');
        
        const withNames = processedListings.filter(l => l.name).length;
        const withAddresses = processedListings.filter(l => l.city).length;
        const withPricing = processedListings.filter(l => l.basePrice).length;
        const withBedrooms = processedListings.filter(l => l.bedrooms).length;
        
        console.log(`  Listings with names: ${withNames} (${(withNames/processedListings.length*100).toFixed(1)}%)`);
        console.log(`  Listings with addresses: ${withAddresses} (${(withAddresses/processedListings.length*100).toFixed(1)}%)`);
        console.log(`  Listings with pricing: ${withPricing} (${(withPricing/processedListings.length*100).toFixed(1)}%)`);
        console.log(`  Listings with bedroom info: ${withBedrooms} (${(withBedrooms/processedListings.length*100).toFixed(1)}%)`);
        
        // Show sample of listings with complete data
        const completeListings = processedListings.filter(l => 
            l.name && l.city && l.bedrooms && l.accommodates
        );
        
        console.log(`\nSample Complete Listings (${Math.min(5, completeListings.length)} of ${completeListings.length}):`);
        completeListings.slice(0, 5).forEach((listing, index) => {
            console.log(`\n${index + 1}. ${listing.name}`);
            console.log(`   ID: ${listing.id}`);
            console.log(`   Location: ${listing.city}, ${listing.state} ${listing.country}`);
            console.log(`   Type: ${listing.propertyTypeName || 'N/A'}`);
            console.log(`   Bedrooms: ${listing.bedrooms}, Accommodates: ${listing.accommodates}`);
            if (listing.basePrice) {
                console.log(`   Base Price: ${listing.currency}${listing.basePrice}`);
            }
        });
        
        console.log(`\nExport completed successfully!`);

    } catch (error) {
        console.error('Error exporting listings:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

// Run the export
if (require.main === module) {
    exportListingsToCSV();
}

module.exports = { exportListingsToCSV };

