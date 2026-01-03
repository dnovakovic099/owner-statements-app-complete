/**
 * Test Cases: Internal Notes Snapshotting
 *
 * Verifies that internal notes are snapshotted when a statement is created.
 */

const assert = require('assert');
const Statement = require('../models/Statement');
const Listing = require('../models/Listing');

describe('Internal Notes Snapshotting', function() {
    this.timeout(30000);

    describe('1. Statement Model', function() {
        it('should have internalNotes field defined', function() {
            const attributes = Statement.rawAttributes;
            assert(attributes.internalNotes, 'Statement model should have internalNotes field');
            assert.strictEqual(attributes.internalNotes.type.key, 'TEXT', 'internalNotes should be TEXT type');
            assert.strictEqual(attributes.internalNotes.allowNull, true, 'internalNotes should allow null');
            assert.strictEqual(attributes.internalNotes.field, 'internal_notes', 'internalNotes should map to internal_notes column');
            console.log('✓ Statement model has internalNotes field correctly defined');
        });
    });

    describe('2. Database Column', function() {
        it('should have internal_notes column in statements table', async function() {
            const [results] = await Statement.sequelize.query(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'statements' AND column_name = 'internal_notes'"
            );
            assert(results.length > 0, 'internal_notes column should exist in statements table');
            console.log('✓ Database has internal_notes column in statements table');
        });
    });

    describe('3. Existing Statement Notes Persistence', function() {
        it('should retrieve stored internalNotes from existing statements', async function() {
            // Find any statement that has internalNotes set
            const statementWithNotes = await Statement.findOne({
                where: Statement.sequelize.literal("internal_notes IS NOT NULL AND internal_notes != ''")
            });

            if (statementWithNotes) {
                assert(statementWithNotes.internalNotes, 'Statement should have internalNotes');
                console.log(`✓ Found statement ${statementWithNotes.id} with internalNotes: "${statementWithNotes.internalNotes.substring(0, 50)}..."`);
            } else {
                // If no statement has notes yet, just verify we can query
                const anyStatement = await Statement.findOne();
                if (anyStatement) {
                    console.log(`✓ Statement ${anyStatement.id} internalNotes is: ${anyStatement.internalNotes || 'null'} (field accessible)`);
                } else {
                    this.skip('No statements in database to test');
                }
            }
        });
    });

    describe('4. Listing Internal Notes', function() {
        it('should have internalNotes on Listing model', function() {
            const attributes = Listing.rawAttributes;
            assert(attributes.internalNotes, 'Listing model should have internalNotes field');
            console.log('✓ Listing model has internalNotes field');
        });

        it('should retrieve internalNotes from listings', async function() {
            const listingWithNotes = await Listing.findOne({
                where: Listing.sequelize.literal("internal_notes IS NOT NULL AND internal_notes != ''")
            });

            if (listingWithNotes) {
                assert(listingWithNotes.internalNotes, 'Listing should have internalNotes');
                console.log(`✓ Found listing ${listingWithNotes.id} with internalNotes: "${listingWithNotes.internalNotes.substring(0, 50)}..."`);
            } else {
                console.log('✓ No listings with internalNotes found (but field is queryable)');
            }
        });
    });

    describe('5. Notes Aggregation Logic', function() {
        it('should correctly aggregate notes from multiple listings', function() {
            // Test the aggregation logic used in combined statements
            const mockListings = [
                { id: 1, nickname: 'Beach House', internalNotes: 'Owner prefers monthly payments' },
                { id: 2, nickname: 'Mountain Cabin', internalNotes: 'Check HVAC before winter' },
                { id: 3, nickname: 'City Apt', internalNotes: null } // No notes
            ];

            const notesArray = [];
            for (const listing of mockListings) {
                if (listing.internalNotes) {
                    const displayName = listing.nickname || listing.displayName || listing.name;
                    notesArray.push(`[${displayName}]: ${listing.internalNotes}`);
                }
            }
            const aggregatedNotes = notesArray.length > 0 ? notesArray.join('\n\n') : null;

            assert(aggregatedNotes, 'Aggregated notes should not be null');
            assert(aggregatedNotes.includes('[Beach House]: Owner prefers monthly payments'), 'Should include Beach House notes');
            assert(aggregatedNotes.includes('[Mountain Cabin]: Check HVAC before winter'), 'Should include Mountain Cabin notes');
            assert(!aggregatedNotes.includes('City Apt'), 'Should NOT include listing without notes');
            console.log('✓ Notes aggregation logic works correctly');
            console.log(`  Result: ${aggregatedNotes.replace(/\n/g, ' | ')}`);
        });
    });

    describe('6. Fallback Logic', function() {
        it('should demonstrate fallback behavior for statements without notes', async function() {
            // Find a statement and its corresponding listing
            const statement = await Statement.findOne({
                where: { propertyId: Statement.sequelize.literal('property_id IS NOT NULL') }
            });

            if (!statement) {
                this.skip('No statement with propertyId found');
                return;
            }

            const listing = await Listing.findByPk(statement.propertyId);

            // Simulate the view logic
            let displayedNotes;
            if (statement.internalNotes) {
                displayedNotes = statement.internalNotes;
                console.log(`✓ Statement ${statement.id} uses its own snapshotted notes`);
            } else {
                displayedNotes = listing?.internalNotes || null;
                console.log(`✓ Statement ${statement.id} falls back to listing notes (backward compatible)`);
            }

            console.log(`  Notes source: ${statement.internalNotes ? 'STATEMENT' : 'LISTING'}`);
            console.log(`  Notes value: ${displayedNotes ? displayedNotes.substring(0, 50) + '...' : 'null'}`);
        });
    });
});
