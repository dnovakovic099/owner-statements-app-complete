#!/usr/bin/env node

/**
 * Export all Hostify listings to CSV
 * Usage: node scripts/export-hostify-listings.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const HostifyService = require('../src/services/HostifyService');

// CSV helper function
function arrayToCSV(data) {
    if (!data || data.length === 0) {
        return '';
    }

    // Get all unique keys from all objects
    const allKeys = new Set();
    data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
    });
    
    const headers = Array.from(allKeys);
    
    // Create CSV content
    const csvContent = [
        // Header row
        headers.map(header => `"${header}"`).join(','),
        // Data rows
        ...data.map(item => 
            headers.map(header => {
                const value = item[header];
                if (value === null || value === undefined) {
                    return '""';
                }
                // Handle arrays and objects
                if (typeof value === 'object') {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                // Escape quotes and wrap in quotes
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',')
        )
    ].join('\n');

    return csvContent;
}

// Flatten nested objects for better CSV representation
function flattenListing(listing) {
    const flattened = {};
    
    // Basic properties
    flattened.id = listing.id;
    flattened.name = listing.name;
    flattened.nickname = listing.nickname;
    flattened.status = listing.status;
    flattened.type = listing.type;
    flattened.bedrooms = listing.bedrooms;
    flattened.bathrooms = listing.bathrooms;
    flattened.accommodates = listing.accommodates;
    flattened.propertyTypeId = listing.propertyTypeId;
    flattened.propertyTypeName = listing.propertyTypeName;
    flattened.roomTypeId = listing.roomTypeId;
    flattened.roomTypeName = listing.roomTypeName;
    
    // Address information
    if (listing.address) {
        flattened.address_line1 = listing.address.line1;
        flattened.address_line2 = listing.address.line2;
        flattened.address_city = listing.address.city;
        flattened.address_state = listing.address.state;
        flattened.address_country = listing.address.country;
        flattened.address_zipcode = listing.address.zipcode;
        flattened.address_latitude = listing.address.latitude;
        flattened.address_longitude = listing.address.longitude;
    }
    
    // Financial information
    flattened.basePrice = listing.basePrice;
    flattened.currency = listing.currency;
    flattened.weeklyDiscount = listing.weeklyDiscount;
    flattened.monthlyDiscount = listing.monthlyDiscount;
    
    // Dates
    flattened.createdAt = listing.createdAt;
    flattened.updatedAt = listing.updatedAt;
    
    // Owner information
    flattened.ownerId = listing.ownerId;
    
    // Channel information
    if (listing.channels && Array.isArray(listing.channels)) {
        flattened.channels = listing.channels.map(c => c.name || c.id).join('; ');
        flattened.channelCount = listing.channels.length;
    }
    
    // Amenities
    if (listing.amenities && Array.isArray(listing.amenities)) {
        flattened.amenities = listing.amenities.join('; ');
        flattened.amenityCount = listing.amenities.length;
    }
    
    // Photos
    if (listing.photos && Array.isArray(listing.photos)) {
        flattened.photoCount = listing.photos.length;
        flattened.mainPhotoUrl = listing.photos.length > 0 ? listing.photos[0].url : '';
    }
    
    // Additional fields that might be present
    flattened.description = listing.description;
    flattened.checkInTime = listing.checkInTime;
    flattened.checkOutTime = listing.checkOutTime;
    flattened.minimumStay = listing.minimumStay;
    flattened.maximumStay = listing.maximumStay;
    flattened.cleaningFee = listing.cleaningFee;
    flattened.securityDeposit = listing.securityDeposit;
    flattened.extraGuestFee = listing.extraGuestFee;
    
    return flattened;
}

async function exportListingsToCSV() {
    console.log('Starting Hostaway Listings Export...\n');

    try {
        // Initialize Hostaway service (it's exported as a singleton)
        const hostawayService = HostawayService;

        // Fetch all listings
        console.log('Fetching all listings from Hostaway...');
        const response = await hostawayService.getAllProperties();

        if (!response.result || response.result.length === 0) {
            console.log('No listings found');
            return;
        }

        console.log(`Found ${response.result.length} listings\n`);

        // Flatten listings for CSV
        console.log('Processing listings data...');
        const flattenedListings = response.result.map(flattenListing);
        
        // Generate CSV content
        console.log('Generating CSV content...');
        const csvContent = arrayToCSV(flattenedListings);
        
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, '../exports');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `hostaway-listings-${timestamp}.csv`;
        const filepath = path.join(outputDir, filename);
        
        // Write CSV file
        fs.writeFileSync(filepath, csvContent, 'utf8');
        
        console.log(`CSV file created successfully!`);
        console.log(`File location: ${filepath}`);
        console.log(`Total listings exported: ${flattenedListings.length}`);

        // Display summary
        console.log('\nListings Summary:');
        const statusCounts = {};
        const typeCounts = {};
        
        flattenedListings.forEach(listing => {
            // Count by status
            const status = listing.status || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
            
            // Count by property type
            const type = listing.propertyTypeName || listing.type || 'Unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        
        console.log('\nBy Status:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
        });
        
        console.log('\nBy Property Type:');
        Object.entries(typeCounts).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
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
