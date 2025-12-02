#!/usr/bin/env node

/**
 * Test Hostify API connection and data retrieval
 * Usage: node scripts/test-hostify-api.js
 */

require('dotenv').config();
const HostifyService = require('../src/services/HostifyService');

async function testHostifyAPI() {
    console.log('='.repeat(60));
    console.log('Testing Hostify API Connection');
    console.log('='.repeat(60));
    console.log('');
    
    try {
        // Test 1: Fetch listings
        console.log('TEST 1: Fetching listings...');
        console.log('-'.repeat(60));

        const listingsResponse = await HostifyService.getAllProperties();

        if (listingsResponse.result && listingsResponse.result.length > 0) {
            console.log(`SUCCESS: Found ${listingsResponse.result.length} listings`);
            console.log('');
            console.log('First 3 listings:');
            listingsResponse.result.slice(0, 3).forEach((listing, index) => {
                console.log(`\n  ${index + 1}. Listing ID: ${listing.id}`);
                console.log(`     Name: ${listing.name || 'N/A'}`);
                console.log(`     Nickname: ${listing.nickname || 'N/A'}`);
                console.log(`     City: ${listing.city || 'N/A'}`);
                console.log(`     Currency: ${listing.currency || 'N/A'}`);
                console.log(`     Price: ${listing.default_daily_price || 'N/A'}`);
                console.log(`     Listed: ${listing.is_listed === 1 ? 'Yes' : 'No'}`);
            });
        } else {
            console.log('WARNING: No listings found');
        }
        
        console.log('');
        console.log('='.repeat(60));
        
        // Test 2: Fetch reservations (last 30 days)
        console.log('TEST 2: Fetching reservations (last 30 days)...');
        console.log('-'.repeat(60));
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        console.log(`Date range: ${startDateStr} to ${endDateStr}`);
        console.log('');
        
        const reservationsResponse = await HostifyService.getAllReservations(startDateStr, endDateStr);
        
        if (reservationsResponse.result && reservationsResponse.result.length > 0) {
            console.log(`SUCCESS: Found ${reservationsResponse.result.length} reservations`);
            console.log('');
            console.log('First 3 reservations:');
            reservationsResponse.result.slice(0, 3).forEach((res, index) => {
                console.log(`\n  ${index + 1}. Reservation ID: ${res.hostifyId}`);
                console.log(`     Property ID: ${res.propertyId}`);
                console.log(`     Guest: ${res.guestName || 'N/A'}`);
                console.log(`     Check-in: ${res.checkInDate}`);
                console.log(`     Check-out: ${res.checkOutDate}`);
                console.log(`     Nights: ${res.nights}`);
                console.log(`     Status: ${res.status}`);
                console.log(`     Source: ${res.source}`);
                console.log(`     Base Rate: $${res.baseRate?.toFixed(2) || '0.00'}`);
                console.log(`     Total Revenue: $${res.clientRevenue?.toFixed(2) || '0.00'}`);
                console.log(`     Payout: $${res.clientPayout?.toFixed(2) || '0.00'}`);
            });
        } else {
            console.log('WARNING: No reservations found in the last 30 days');
        }
        
        console.log('');
        console.log('='.repeat(60));
        
        // Test 3: Get a specific listing (if we have any)
        if (listingsResponse.result && listingsResponse.result.length > 0) {
            console.log('TEST 3: Fetching detailed listing info...');
            console.log('-'.repeat(60));

            const firstListingId = listingsResponse.result[0].id;
            console.log(`Getting details for listing ID: ${firstListingId}`);
            console.log('');

            const detailedListing = await HostifyService.getProperty(firstListingId);

            if (detailedListing.success && detailedListing.listing) {
                console.log('SUCCESS: Retrieved detailed listing');
                const listing = detailedListing.listing;
                console.log(`\n  ID: ${listing.id}`);
                console.log(`  Name: ${listing.name}`);
                console.log(`  Nickname: ${listing.nickname || 'N/A'}`);
                console.log(`  Address: ${listing.street || ''}, ${listing.city || ''}, ${listing.state || ''} ${listing.zipcode || ''}`);
                console.log(`  Country: ${listing.country || 'N/A'}`);
                console.log(`  Guests: ${listing.guests_included || 'N/A'}`);
                console.log(`  Min Nights: ${listing.min_nights || 'N/A'}`);
                console.log(`  Max Nights: ${listing.max_nights || 'N/A'}`);
                console.log(`  Check-in: ${listing.checkin_start || 'N/A'}`);
                console.log(`  Check-out: ${listing.checkout || 'N/A'}`);
                console.log(`  Cleaning Fee: $${listing.cleaning_fee || 0}`);
                console.log(`  Security Deposit: $${listing.security_deposit || 0}`);
            } else {
                console.log('WARNING: Could not retrieve detailed listing');
            }
        }

        console.log('');
        console.log('='.repeat(60));
        console.log('All tests completed successfully!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('');
        console.error('ERROR during testing:');
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

// Run the test
testHostifyAPI();

