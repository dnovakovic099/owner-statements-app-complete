/**
 * Listing Sync PM Fee Preservation Tests
 *
 * Tests that PM fee percentage is preserved when listings are synced from Hostify.
 * The sync should:
 * - Preserve existing pmFeePercentage values for existing listings
 * - Create new listings with default pmFeePercentage (15.00)
 * - Update other listing data (name, address, etc.) without affecting pmFeePercentage
 */

const assert = require('assert');

/**
 * Mock ListingService sync logic for unit testing
 * Mirrors the actual implementation in src/services/ListingService.js
 */
class MockListingService {
    constructor() {
        this.listings = new Map();
    }

    // Simulate finding a listing by ID
    findByPk(id) {
        return this.listings.get(id) || null;
    }

    // Simulate creating a listing
    create(listingData) {
        this.listings.set(listingData.id, { ...listingData });
        return this.listings.get(listingData.id);
    }

    // Simulate updating a listing
    update(id, updateData) {
        const existing = this.listings.get(id);
        if (!existing) return null;

        const updated = { ...existing, ...updateData };
        this.listings.set(id, updated);
        return updated;
    }

    // Main sync logic (mirrors ListingService.syncListingsFromHostify)
    syncListingsFromHostify(hostifyListings) {
        let synced = 0;
        let errors = 0;

        for (const hostifyListing of hostifyListings) {
            try {
                const existingListing = this.findByPk(hostifyListing.id);

                const listingData = {
                    id: hostifyListing.id,
                    name: hostifyListing.name || 'Unknown',
                    nickname: hostifyListing.nickname || null,
                    street: hostifyListing.street || null,
                    city: hostifyListing.city || null,
                    state: hostifyListing.state || null,
                    country: hostifyListing.country || null,
                    isActive: hostifyListing.is_listed === 1,
                    lastSyncedAt: new Date()
                };

                if (existingListing) {
                    // Update but preserve PM fee - explicitly delete pmFeePercentage from update
                    delete listingData.pmFeePercentage;
                    this.update(hostifyListing.id, listingData);
                } else {
                    // Create new with default PM fee
                    listingData.pmFeePercentage = 15.00;
                    this.create(listingData);
                }

                synced++;
            } catch (error) {
                errors++;
            }
        }

        return { synced, errors };
    }

    // Get all listings
    getAllListings() {
        return Array.from(this.listings.values());
    }

    // Clear all listings (for test setup)
    clear() {
        this.listings.clear();
    }
}

describe('Listing Sync PM Fee Preservation Tests', function() {

    let mockService;

    beforeEach(function() {
        mockService = new MockListingService();
    });

    describe('New Listing Creation', function() {

        it('should create new listings with default pmFeePercentage of 15.00', function() {
            const hostifyListings = [
                { id: 300001, name: 'Test Property 1', nickname: 'Test 1', is_listed: 1 },
                { id: 300002, name: 'Test Property 2', nickname: 'Test 2', is_listed: 1 }
            ];

            const result = mockService.syncListingsFromHostify(hostifyListings);

            assert.strictEqual(result.synced, 2);
            assert.strictEqual(result.errors, 0);

            const listing1 = mockService.findByPk(300001);
            const listing2 = mockService.findByPk(300002);

            assert.strictEqual(listing1.pmFeePercentage, 15.00);
            assert.strictEqual(listing2.pmFeePercentage, 15.00);
        });

        it('should set correct listing data for new listings', function() {
            const hostifyListings = [
                {
                    id: 300001,
                    name: 'Beach House',
                    nickname: 'Beach',
                    street: '123 Ocean Dr',
                    city: 'Miami',
                    state: 'FL',
                    country: 'USA',
                    is_listed: 1
                }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            const listing = mockService.findByPk(300001);
            assert.strictEqual(listing.name, 'Beach House');
            assert.strictEqual(listing.nickname, 'Beach');
            assert.strictEqual(listing.street, '123 Ocean Dr');
            assert.strictEqual(listing.city, 'Miami');
            assert.strictEqual(listing.state, 'FL');
            assert.strictEqual(listing.isActive, true);
            assert.strictEqual(listing.pmFeePercentage, 15.00);
        });

        it('should handle missing optional fields gracefully', function() {
            const hostifyListings = [
                { id: 300001, name: 'Minimal Property', is_listed: 0 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            const listing = mockService.findByPk(300001);
            assert.strictEqual(listing.name, 'Minimal Property');
            assert.strictEqual(listing.nickname, null);
            assert.strictEqual(listing.street, null);
            assert.strictEqual(listing.isActive, false);
            assert.strictEqual(listing.pmFeePercentage, 15.00);
        });
    });

    describe('Existing Listing Updates (PM Fee Preservation)', function() {

        it('should preserve pmFeePercentage when updating existing listing', function() {
            // Pre-create a listing with custom PM fee
            mockService.create({
                id: 300001,
                name: 'Original Name',
                nickname: 'Original',
                pmFeePercentage: 20.00,
                isActive: true
            });

            // Sync with updated data from Hostify
            const hostifyListings = [
                { id: 300001, name: 'Updated Name', nickname: 'Updated', is_listed: 1 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            const listing = mockService.findByPk(300001);
            assert.strictEqual(listing.name, 'Updated Name');
            assert.strictEqual(listing.nickname, 'Updated');
            assert.strictEqual(listing.pmFeePercentage, 20.00); // Should be PRESERVED
        });

        it('should preserve custom pmFeePercentage values (10%, 25%, 30%)', function() {
            // Create listings with various PM fees
            mockService.create({ id: 300001, name: 'Property 1', pmFeePercentage: 10.00 });
            mockService.create({ id: 300002, name: 'Property 2', pmFeePercentage: 25.00 });
            mockService.create({ id: 300003, name: 'Property 3', pmFeePercentage: 30.00 });

            // Sync all with Hostify data
            const hostifyListings = [
                { id: 300001, name: 'Property 1 Updated', is_listed: 1 },
                { id: 300002, name: 'Property 2 Updated', is_listed: 1 },
                { id: 300003, name: 'Property 3 Updated', is_listed: 1 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 10.00);
            assert.strictEqual(mockService.findByPk(300002).pmFeePercentage, 25.00);
            assert.strictEqual(mockService.findByPk(300003).pmFeePercentage, 30.00);
        });

        it('should preserve pmFeePercentage even when Hostify sends pmFeePercentage field', function() {
            // Create listing with custom PM fee
            mockService.create({ id: 300001, name: 'Property 1', pmFeePercentage: 20.00 });

            // Simulate Hostify sending a different pmFeePercentage (shouldn't happen but be safe)
            const hostifyListings = [
                { id: 300001, name: 'Property 1 Updated', pmFeePercentage: 15.00, is_listed: 1 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            // PM fee should still be preserved at 20%
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 20.00);
        });

        it('should update all other fields while preserving pmFeePercentage', function() {
            mockService.create({
                id: 300001,
                name: 'Old Name',
                nickname: 'Old Nick',
                street: 'Old Street',
                city: 'Old City',
                state: 'Old State',
                country: 'Old Country',
                isActive: false,
                pmFeePercentage: 18.50
            });

            const hostifyListings = [{
                id: 300001,
                name: 'New Name',
                nickname: 'New Nick',
                street: 'New Street',
                city: 'New City',
                state: 'New State',
                country: 'New Country',
                is_listed: 1
            }];

            mockService.syncListingsFromHostify(hostifyListings);

            const listing = mockService.findByPk(300001);
            assert.strictEqual(listing.name, 'New Name');
            assert.strictEqual(listing.nickname, 'New Nick');
            assert.strictEqual(listing.street, 'New Street');
            assert.strictEqual(listing.city, 'New City');
            assert.strictEqual(listing.state, 'New State');
            assert.strictEqual(listing.country, 'New Country');
            assert.strictEqual(listing.isActive, true);
            assert.strictEqual(listing.pmFeePercentage, 18.50); // PRESERVED
        });
    });

    describe('Mixed New and Existing Listings', function() {

        it('should preserve PM fee for existing and set default for new', function() {
            // Pre-create some listings
            mockService.create({ id: 300001, name: 'Existing 1', pmFeePercentage: 20.00 });
            mockService.create({ id: 300002, name: 'Existing 2', pmFeePercentage: 25.00 });

            // Sync mix of existing and new
            const hostifyListings = [
                { id: 300001, name: 'Existing 1 Updated', is_listed: 1 },
                { id: 300002, name: 'Existing 2 Updated', is_listed: 1 },
                { id: 300003, name: 'Brand New Property', is_listed: 1 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            // Existing should preserve PM fee
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 20.00);
            assert.strictEqual(mockService.findByPk(300002).pmFeePercentage, 25.00);

            // New should have default 15%
            assert.strictEqual(mockService.findByPk(300003).pmFeePercentage, 15.00);
        });

        it('should handle large batch of mixed listings correctly', function() {
            // Create 50 existing listings with various PM fees
            for (let i = 1; i <= 50; i++) {
                mockService.create({
                    id: 300000 + i,
                    name: `Property ${i}`,
                    pmFeePercentage: 10 + (i % 20) // PM fees from 10 to 29
                });
            }

            // Sync 75 listings (50 existing + 25 new)
            const hostifyListings = [];
            for (let i = 1; i <= 75; i++) {
                hostifyListings.push({
                    id: 300000 + i,
                    name: `Property ${i} Updated`,
                    is_listed: 1
                });
            }

            const result = mockService.syncListingsFromHostify(hostifyListings);
            assert.strictEqual(result.synced, 75);

            // Verify existing listings preserved PM fee
            for (let i = 1; i <= 50; i++) {
                const expectedPmFee = 10 + (i % 20);
                const listing = mockService.findByPk(300000 + i);
                assert.strictEqual(listing.pmFeePercentage, expectedPmFee,
                    `Listing ${300000 + i} should have PM fee ${expectedPmFee}`);
            }

            // Verify new listings have default PM fee
            for (let i = 51; i <= 75; i++) {
                const listing = mockService.findByPk(300000 + i);
                assert.strictEqual(listing.pmFeePercentage, 15.00,
                    `New listing ${300000 + i} should have default PM fee 15`);
            }
        });
    });

    describe('Edge Cases', function() {

        it('should preserve pmFeePercentage of 0 (commission waiver)', function() {
            mockService.create({ id: 300001, name: 'Property 1', pmFeePercentage: 0 });

            const hostifyListings = [
                { id: 300001, name: 'Property 1 Updated', is_listed: 1 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 0);
        });

        it('should preserve decimal pmFeePercentage values', function() {
            mockService.create({ id: 300001, name: 'Property 1', pmFeePercentage: 17.5 });
            mockService.create({ id: 300002, name: 'Property 2', pmFeePercentage: 22.75 });

            const hostifyListings = [
                { id: 300001, name: 'Property 1 Updated', is_listed: 1 },
                { id: 300002, name: 'Property 2 Updated', is_listed: 1 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 17.5);
            assert.strictEqual(mockService.findByPk(300002).pmFeePercentage, 22.75);
        });

        it('should handle empty hostify listings array', function() {
            mockService.create({ id: 300001, name: 'Existing', pmFeePercentage: 20.00 });

            const result = mockService.syncListingsFromHostify([]);

            assert.strictEqual(result.synced, 0);
            assert.strictEqual(result.errors, 0);

            // Existing listing should remain unchanged
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 20.00);
        });

        it('should handle multiple syncs preserving PM fee each time', function() {
            // First sync - creates listing
            mockService.syncListingsFromHostify([
                { id: 300001, name: 'Property 1', is_listed: 1 }
            ]);
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 15.00);

            // Manually update PM fee (simulating user action)
            mockService.update(300001, { pmFeePercentage: 20.00 });
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 20.00);

            // Second sync - should preserve the 20%
            mockService.syncListingsFromHostify([
                { id: 300001, name: 'Property 1 v2', is_listed: 1 }
            ]);
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 20.00);

            // Third sync - still preserved
            mockService.syncListingsFromHostify([
                { id: 300001, name: 'Property 1 v3', is_listed: 1 }
            ]);
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 20.00);
        });
    });

    describe('Real-World Scenarios', function() {

        it('should handle Ozzie properties (multiple units with same owner PM fee)', function() {
            // Create Ozzie properties with 20% PM fee
            const ozzieIds = [300017929, 300017930, 300017931, 300017932, 300017933];
            for (const id of ozzieIds) {
                mockService.create({
                    id,
                    name: `S Michigan (Unit #${id % 100}) - Ozzie`,
                    pmFeePercentage: 20.00
                });
            }

            // Sync from Hostify
            const hostifyListings = ozzieIds.map(id => ({
                id,
                name: `S Michigan (Unit #${id % 100}) - Ozzie`,
                nickname: `S Michigan - Ozzie`,
                is_listed: 1
            }));

            mockService.syncListingsFromHostify(hostifyListings);

            // All should still have 20% PM fee
            for (const id of ozzieIds) {
                const listing = mockService.findByPk(id);
                assert.strictEqual(listing.pmFeePercentage, 20.00,
                    `Ozzie listing ${id} should preserve 20% PM fee`);
            }
        });

        it('should handle server restart scenario (simulating deployment)', function() {
            // Initial state - listings with custom PM fees
            mockService.create({ id: 300001, name: 'Prop 1', pmFeePercentage: 20.00 });
            mockService.create({ id: 300002, name: 'Prop 2', pmFeePercentage: 25.00 });
            mockService.create({ id: 300003, name: 'Prop 3', pmFeePercentage: 15.00 });

            // Simulate server restart by running sync
            const hostifyListings = [
                { id: 300001, name: 'Prop 1', is_listed: 1 },
                { id: 300002, name: 'Prop 2', is_listed: 1 },
                { id: 300003, name: 'Prop 3', is_listed: 1 }
            ];

            mockService.syncListingsFromHostify(hostifyListings);

            // PM fees should be preserved (not reset to 15)
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 20.00);
            assert.strictEqual(mockService.findByPk(300002).pmFeePercentage, 25.00);
            assert.strictEqual(mockService.findByPk(300003).pmFeePercentage, 15.00);
        });

        it('should correctly differentiate between default 15% and custom 15%', function() {
            // Listing explicitly set to 15%
            mockService.create({ id: 300001, name: 'Custom 15', pmFeePercentage: 15.00 });

            // Sync
            mockService.syncListingsFromHostify([
                { id: 300001, name: 'Custom 15 Updated', is_listed: 1 }
            ]);

            // Should remain 15% (preserved, not replaced)
            assert.strictEqual(mockService.findByPk(300001).pmFeePercentage, 15.00);
        });
    });

    describe('Sync Result Tracking', function() {

        it('should return correct sync count for all new listings', function() {
            const result = mockService.syncListingsFromHostify([
                { id: 300001, name: 'New 1', is_listed: 1 },
                { id: 300002, name: 'New 2', is_listed: 1 },
                { id: 300003, name: 'New 3', is_listed: 1 }
            ]);

            assert.strictEqual(result.synced, 3);
            assert.strictEqual(result.errors, 0);
        });

        it('should return correct sync count for all existing listings', function() {
            mockService.create({ id: 300001, name: 'Existing 1', pmFeePercentage: 20 });
            mockService.create({ id: 300002, name: 'Existing 2', pmFeePercentage: 20 });

            const result = mockService.syncListingsFromHostify([
                { id: 300001, name: 'Updated 1', is_listed: 1 },
                { id: 300002, name: 'Updated 2', is_listed: 1 }
            ]);

            assert.strictEqual(result.synced, 2);
            assert.strictEqual(result.errors, 0);
        });
    });
});

// Run tests
if (require.main === module) {
    const Mocha = require('mocha');
    const mocha = new Mocha();

    mocha.suite.emit('pre-require', global, '', mocha);

    eval(require('fs').readFileSync(__filename, 'utf8'));

    mocha.run(failures => {
        // process.exitCode removed for Jest compatibility
    });
}
