#!/usr/bin/env node

/**
 * Analyze the simplified Hostaway listings CSV
 * Usage: node scripts/analyze-listings-simple.js
 */

const fs = require('fs');
const path = require('path');

function parseSimpleCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return [];
    
    // Parse header
    const headers = lines[0].split(',');
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return data;
}

function analyzeListings(listings) {
    console.log('Hostaway Listings Analysis Report\n');
    console.log(`Total Listings: ${listings.length}\n`);

    // Basic coverage stats
    const stats = {
        withNames: listings.filter(l => l.name && l.name.trim()).length,
        withNicknames: listings.filter(l => l.nickname && l.nickname.trim()).length,
        withBedrooms: listings.filter(l => l.bedrooms && l.bedrooms !== '').length,
        withBathrooms: listings.filter(l => l.bathrooms && l.bathrooms !== '').length,
        withAccommodates: listings.filter(l => l.accommodates && l.accommodates !== '').length,
        withPricing: listings.filter(l => l.basePrice && l.basePrice !== '').length,
        withCleaning: listings.filter(l => l.cleaningFee && l.cleaningFee !== '').length,
        withOwner: listings.filter(l => l.ownerId && l.ownerId !== '').length,
    };

    console.log('Data Coverage:');
    Object.entries(stats).forEach(([key, count]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        console.log(`  ${label}: ${count} (${(count/listings.length*100).toFixed(1)}%)`);
    });
    console.log();
    
    // Property type analysis
    const propertyTypes = {};
    listings.forEach(listing => {
        const type = listing.propertyTypeName || 'Unknown';
        propertyTypes[type] = (propertyTypes[type] || 0) + 1;
    });
    
    console.log('Property Types:');
    Object.entries(propertyTypes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([type, count]) => {
            console.log(`  ${type}: ${count} (${(count/listings.length*100).toFixed(1)}%)`);
        });
    console.log();
    
    // Accommodates distribution
    const accommodates = {};
    listings.forEach(listing => {
        const acc = listing.accommodates || 'Unknown';
        accommodates[acc] = (accommodates[acc] || 0) + 1;
    });
    
    console.log('Guest Capacity Distribution:');
    Object.entries(accommodates)
        .sort(([a], [b]) => {
            const numA = parseInt(a) || 0;
            const numB = parseInt(b) || 0;
            return numA - numB;
        })
        .forEach(([acc, count]) => {
            console.log(`  ${acc} guests: ${count} (${(count/listings.length*100).toFixed(1)}%)`);
        });
    console.log();
    
    // Pricing analysis (for listings with pricing)
    const withPricing = listings.filter(l => l.basePrice && l.basePrice !== '' && !isNaN(parseFloat(l.basePrice)));
    if (withPricing.length > 0) {
        const prices = withPricing.map(l => parseFloat(l.basePrice)).sort((a, b) => a - b);
        const minPrice = prices[0];
        const maxPrice = prices[prices.length - 1];
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const medianPrice = prices[Math.floor(prices.length / 2)];
        
        console.log('Pricing Analysis (Base Price):');
        console.log(`  Listings with pricing: ${withPricing.length}`);
        console.log(`  Min price: $${minPrice.toFixed(2)}`);
        console.log(`  Max price: $${maxPrice.toFixed(2)}`);
        console.log(`  Average price: $${avgPrice.toFixed(2)}`);
        console.log(`  Median price: $${medianPrice.toFixed(2)}`);
        console.log();
    }
    
    // Cleaning fee analysis
    const withCleaningFee = listings.filter(l => l.cleaningFee && l.cleaningFee !== '' && !isNaN(parseFloat(l.cleaningFee)));
    if (withCleaningFee.length > 0) {
        const fees = withCleaningFee.map(l => parseFloat(l.cleaningFee)).sort((a, b) => a - b);
        const avgFee = fees.reduce((sum, fee) => sum + fee, 0) / fees.length;
        
        console.log('Cleaning Fee Analysis:');
        console.log(`  Listings with cleaning fees: ${withCleaningFee.length}`);
        console.log(`  Average cleaning fee: $${avgFee.toFixed(2)}`);
        console.log(`  Min cleaning fee: $${fees[0].toFixed(2)}`);
        console.log(`  Max cleaning fee: $${fees[fees.length - 1].toFixed(2)}`);
        console.log();
    }
    
    // Owner distribution
    const owners = {};
    listings.forEach(listing => {
        const owner = listing.ownerId || 'Unknown';
        owners[owner] = (owners[owner] || 0) + 1;
    });
    
    console.log('Owner Distribution (Top 10):');
    Object.entries(owners)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([owner, count]) => {
            const ownerLabel = owner === '' ? 'No Owner ID' : `Owner ${owner}`;
            console.log(`  ${ownerLabel}: ${count} listings`);
        });
    console.log();
    
    // Sample listings with most complete data
    const completeListings = listings.filter(l => 
        l.name && l.name.trim() && 
        l.accommodates && l.accommodates !== '' &&
        l.basePrice && l.basePrice !== ''
    );
    
    console.log(`Sample Complete Listings (${Math.min(10, completeListings.length)} of ${completeListings.length}):`);
    completeListings.slice(0, 10).forEach((listing, index) => {
        console.log(`\n${index + 1}. ${listing.name}`);
        console.log(`   ID: ${listing.id}`);
        console.log(`   Accommodates: ${listing.accommodates} guests`);
        console.log(`   Base Price: $${listing.basePrice}`);
        if (listing.cleaningFee) {
            console.log(`   Cleaning Fee: $${listing.cleaningFee}`);
        }
        if (listing.ownerId) {
            console.log(`   Owner ID: ${listing.ownerId}`);
        }
    });
    
    console.log('\nAnalysis Complete!');
}

async function main() {
    try {
        // Get the most recent simplified CSV file
        const exportsDir = path.join(__dirname, '../exports');
        const files = fs.readdirSync(exportsDir)
            .filter(f => f.startsWith('hostaway-listings-simple-') && f.endsWith('.csv'))
            .sort()
            .reverse();
        
        if (files.length === 0) {
            console.error('No simplified CSV files found in exports directory');
            process.exit(1);
        }
        
        const csvPath = path.join(exportsDir, files[0]);
        console.log(`Using CSV: ${files[0]}\n`);

        // Read and parse CSV
        console.log('Reading CSV file...');
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const listings = parseSimpleCSV(csvContent);
        
        if (listings.length === 0) {
            console.error('No data found in CSV file');
            process.exit(1);
        }

        // Analyze the data
        analyzeListings(listings);

    } catch (error) {
        console.error('Error analyzing listings:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

