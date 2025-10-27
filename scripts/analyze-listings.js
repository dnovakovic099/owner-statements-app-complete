#!/usr/bin/env node

/**
 * Analyze the exported Hostaway listings CSV
 * Usage: node scripts/analyze-listings.js [csv-file-path]
 */

const fs = require('fs');
const path = require('path');

function parseCSV(csvContent) {
    const lines = csvContent.split('\n');
    if (lines.length < 2) return [];
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Simple CSV parsing (handles quoted fields)
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.replace(/^"|"$/g, ''));
        
        // Create object
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return data;
}

function analyzeListings(listings) {
    console.log('📊 Hostaway Listings Analysis Report\n');
    console.log(`Total Listings: ${listings.length}\n`);
    
    // Basic stats
    const stats = {
        withNames: listings.filter(l => l.name && l.name.trim()).length,
        withNicknames: listings.filter(l => l.nickname && l.nickname.trim()).length,
        withDescriptions: listings.filter(l => l.description && l.description.trim()).length,
        withAddresses: listings.filter(l => l.address_city && l.address_city.trim()).length,
        withPricing: listings.filter(l => l.basePrice && l.basePrice !== '').length,
    };
    
    console.log('📋 Basic Information Coverage:');
    console.log(`  With Names: ${stats.withNames} (${(stats.withNames/listings.length*100).toFixed(1)}%)`);
    console.log(`  With Nicknames: ${stats.withNicknames} (${(stats.withNicknames/listings.length*100).toFixed(1)}%)`);
    console.log(`  With Descriptions: ${stats.withDescriptions} (${(stats.withDescriptions/listings.length*100).toFixed(1)}%)`);
    console.log(`  With Addresses: ${stats.withAddresses} (${(stats.withAddresses/listings.length*100).toFixed(1)}%)`);
    console.log(`  With Base Pricing: ${stats.withPricing} (${(stats.withPricing/listings.length*100).toFixed(1)}%)\n`);
    
    // Property types
    const propertyTypes = {};
    listings.forEach(listing => {
        const type = listing.propertyTypeName || listing.type || 'Unknown';
        propertyTypes[type] = (propertyTypes[type] || 0) + 1;
    });
    
    console.log('🏠 Property Types:');
    Object.entries(propertyTypes)
        .sort(([,a], [,b]) => b - a)
        .forEach(([type, count]) => {
            console.log(`  ${type}: ${count} (${(count/listings.length*100).toFixed(1)}%)`);
        });
    console.log();
    
    // Room types
    const roomTypes = {};
    listings.forEach(listing => {
        const type = listing.roomTypeName || 'Unknown';
        roomTypes[type] = (roomTypes[type] || 0) + 1;
    });
    
    console.log('🛏️ Room Types:');
    Object.entries(roomTypes)
        .sort(([,a], [,b]) => b - a)
        .forEach(([type, count]) => {
            console.log(`  ${type}: ${count} (${(count/listings.length*100).toFixed(1)}%)`);
        });
    console.log();
    
    // Cities
    const cities = {};
    listings.forEach(listing => {
        const city = listing.address_city || 'Unknown';
        cities[city] = (cities[city] || 0) + 1;
    });
    
    console.log('🌆 Top Cities:');
    Object.entries(cities)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([city, count]) => {
            console.log(`  ${city}: ${count} (${(count/listings.length*100).toFixed(1)}%)`);
        });
    console.log();
    
    // Bedrooms distribution
    const bedrooms = {};
    listings.forEach(listing => {
        const beds = listing.bedrooms || 'Unknown';
        bedrooms[beds] = (bedrooms[beds] || 0) + 1;
    });
    
    console.log('🛏️ Bedrooms Distribution:');
    Object.entries(bedrooms)
        .sort(([a], [b]) => {
            const numA = parseInt(a) || 0;
            const numB = parseInt(b) || 0;
            return numA - numB;
        })
        .forEach(([beds, count]) => {
            console.log(`  ${beds} bedrooms: ${count} (${(count/listings.length*100).toFixed(1)}%)`);
        });
    console.log();
    
    // Sample listings with full data
    const completeListings = listings.filter(l => 
        l.name && l.name.trim() && 
        l.address_city && l.address_city.trim() &&
        l.bedrooms && l.bedrooms !== '' &&
        l.accommodates && l.accommodates !== ''
    );
    
    console.log(`📝 Sample Complete Listings (${Math.min(5, completeListings.length)} of ${completeListings.length}):`);
    completeListings.slice(0, 5).forEach((listing, index) => {
        console.log(`\n${index + 1}. ${listing.name}`);
        console.log(`   ID: ${listing.id}`);
        console.log(`   Location: ${listing.address_city}, ${listing.address_state} ${listing.address_country}`);
        console.log(`   Type: ${listing.propertyTypeName || listing.type || 'N/A'}`);
        console.log(`   Bedrooms: ${listing.bedrooms}, Accommodates: ${listing.accommodates}`);
        if (listing.basePrice) {
            console.log(`   Base Price: ${listing.currency || ''}${listing.basePrice}`);
        }
    });
    
    console.log('\n🎉 Analysis Complete!');
}

async function main() {
    try {
        // Get the most recent CSV file or use provided path
        let csvPath = process.argv[2];
        
        if (!csvPath) {
            const exportsDir = path.join(__dirname, '../exports');
            const files = fs.readdirSync(exportsDir)
                .filter(f => f.startsWith('hostaway-listings-') && f.endsWith('.csv'))
                .sort()
                .reverse();
            
            if (files.length === 0) {
                console.error('❌ No CSV files found in exports directory');
                process.exit(1);
            }
            
            csvPath = path.join(exportsDir, files[0]);
            console.log(`📁 Using most recent CSV: ${files[0]}\n`);
        }
        
        // Read and parse CSV
        console.log('📖 Reading CSV file...');
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const listings = parseCSV(csvContent);
        
        if (listings.length === 0) {
            console.error('❌ No data found in CSV file');
            process.exit(1);
        }
        
        // Analyze the data
        analyzeListings(listings);
        
    } catch (error) {
        console.error('❌ Error analyzing listings:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

