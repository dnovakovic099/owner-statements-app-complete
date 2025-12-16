/**
 * Script to import internal notes from CSV to listings
 * Run with: node import-internal-notes.js
 */

const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();

const { Listing } = require('./src/models');

async function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const entries = [];
    let currentEntry = null;

    for (let i = 2; i < lines.length; i++) { // Skip header rows
        const line = lines[i];
        if (!line.trim()) continue;

        // Check if this is a new entry or continuation of previous notes
        const parts = line.split(',');

        // If starts with comma and has schedule, it's a new entry
        if (parts[0] === '' && parts[1] && (parts[1].includes('Weekly') || parts[1].includes('Bi-Weekly'))) {
            if (currentEntry) {
                entries.push(currentEntry);
            }

            // Parse the listing name - remove trailing spaces and owner name portion for matching
            let listingName = parts[2] ? parts[2].trim() : '';

            // Get the internal notes - might span multiple columns due to commas in content
            let notes = '';
            if (parts.length > 4) {
                // Notes might be quoted and contain commas
                const notesPart = line.substring(line.indexOf(parts[3]) + parts[3].length + 1);
                notes = notesPart.replace(/^,?"?|"?$/g, '').trim();
            }

            currentEntry = {
                schedule: parts[1].trim(),
                listingName: listingName,
                notes: notes
            };
        } else if (currentEntry && line.startsWith('►')) {
            // This is a continuation of notes
            currentEntry.notes += '\n' + line.trim();
        }
    }

    if (currentEntry) {
        entries.push(currentEntry);
    }

    return entries;
}

async function importNotes() {
    console.log('Starting internal notes import...\n');

    // Parse CSV
    const csvPath = path.join(__dirname, 'Owner Statements Tracker - 12.15.csv');

    // Read and parse manually for better control
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');

    const entries = [];

    for (let i = 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Simple CSV parsing - find the columns
        let inQuotes = false;
        let columns = [];
        let currentCol = '';

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                columns.push(currentCol.trim());
                currentCol = '';
            } else {
                currentCol += char;
            }
        }
        columns.push(currentCol.trim());

        // columns: [empty, schedule, listingName, payout, internalNotes]
        if (columns.length >= 3 && columns[2]) {
            const listingName = columns[2].trim();
            const notes = columns[4] ? columns[4].replace(/^"|"$/g, '').trim() : '';

            if (listingName && notes) {
                entries.push({
                    listingName,
                    notes
                });
            }
        }
    }

    console.log(`Found ${entries.length} entries with internal notes\n`);

    // Get all listings from database
    const listings = await Listing.findAll();
    console.log(`Found ${listings.length} listings in database\n`);

    let updated = 0;
    let notFound = [];

    for (const entry of entries) {
        // Extract the property identifier from the listing name (before the dash and owner name)
        // e.g., "Skyline Dr - Arthur and Mary Elliot" -> "Skyline Dr"
        const nameParts = entry.listingName.split(' - ');
        const propertyPart = nameParts[0].trim();

        // Find matching listing by nickname containing the property part
        const matchingListing = listings.find(l => {
            const nickname = (l.nickname || '').toLowerCase();
            const displayName = (l.displayName || '').toLowerCase();
            const name = (l.name || '').toLowerCase();
            const searchTerm = propertyPart.toLowerCase();

            return nickname.includes(searchTerm) ||
                   displayName.includes(searchTerm) ||
                   name.includes(searchTerm);
        });

        if (matchingListing) {
            // Update the listing with internal notes
            await matchingListing.update({ internalNotes: entry.notes });
            console.log(`✓ Updated: ${entry.listingName}`);
            console.log(`  Notes: ${entry.notes.substring(0, 50)}${entry.notes.length > 50 ? '...' : ''}`);
            updated++;
        } else {
            notFound.push(entry.listingName);
        }
    }

    console.log(`\n========================================`);
    console.log(`Updated: ${updated} listings`);
    console.log(`Not found: ${notFound.length} listings`);

    if (notFound.length > 0) {
        console.log(`\nListings not found:`);
        notFound.forEach(name => console.log(`  - ${name}`));
    }
}

importNotes()
    .then(() => {
        console.log('\nImport completed!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Import failed:', err);
        process.exit(1);
    });
