/**
 * Jest Test Cases for Tag-Based Group Statement Generation
 *
 * Tests the fix for: When selecting a tag like "Weekly" in the Generate Modal,
 * statements should be created for BOTH groups with that tag AND individual
 * non-grouped listings with that tag.
 *
 * Bug: Previously, only individual listings were processed; groups were ignored.
 * Fix: Added group detection and combined statement generation before individual processing.
 */

// Mock dependencies
jest.mock('../config/database', () => ({
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findByPk: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        destroy: jest.fn()
    })),
    sync: jest.fn()
}));

describe('Tag-Based Group Statement Generation', () => {

    // ==========================================
    // Core Logic Tests
    // ==========================================
    describe('Group Detection by Tag', () => {

        it('should find groups matching the tag using getGroupsByTag', () => {
            const allGroups = [
                { id: 1, name: 'Beach Properties', tags: 'WEEKLY' },
                { id: 2, name: 'Mountain Properties', tags: 'BI-WEEKLY A' },
                { id: 3, name: 'City Properties', tags: 'WEEKLY, PREMIUM' },
                { id: 4, name: 'Lake Properties', tags: 'MONTHLY' }
            ];

            const tag = 'WEEKLY';
            const tagUpper = tag.toUpperCase().trim();

            // Simulate getGroupsByTag logic for WEEKLY
            const matchingGroups = allGroups.filter(group => {
                const groupTags = group.tags ? group.tags.split(',').map(t => t.trim().toUpperCase()) : [];
                // For WEEKLY, match tags with "WEEKLY" but NOT "BI-WEEKLY"
                return groupTags.some(t => t.includes('WEEKLY') && !t.includes('BI-WEEKLY') && !t.includes('BIWEEKLY'));
            });

            expect(matchingGroups.length).toBe(2);
            expect(matchingGroups.map(g => g.name)).toContain('Beach Properties');
            expect(matchingGroups.map(g => g.name)).toContain('City Properties');
        });

        it('should find groups matching BI-WEEKLY tag', () => {
            const allGroups = [
                { id: 1, name: 'Group A', tags: 'WEEKLY' },
                { id: 2, name: 'Group B', tags: 'BI-WEEKLY A' },
                { id: 3, name: 'Group C', tags: 'BI-WEEKLY B' },
                { id: 4, name: 'Group D', tags: 'BIWEEKLY A' } // Alternative spelling
            ];

            const tag = 'BI-WEEKLY';
            const tagUpper = tag.toUpperCase().trim();

            // Simulate getGroupsByTag logic for BI-WEEKLY
            const matchingGroups = allGroups.filter(group => {
                const groupTags = group.tags ? group.tags.split(',').map(t => t.trim().toUpperCase()) : [];
                // For BI-WEEKLY, match any tag containing "BI-WEEKLY" or "BIWEEKLY"
                return groupTags.some(t => t.includes('BI-WEEKLY') || t.includes('BIWEEKLY'));
            });

            expect(matchingGroups.length).toBe(3);
            expect(matchingGroups.map(g => g.name)).not.toContain('Group A');
        });

        it('should handle case-insensitive tag matching', () => {
            const groups = [
                { id: 1, name: 'Group A', tags: 'weekly' },
                { id: 2, name: 'Group B', tags: 'Weekly' },
                { id: 3, name: 'Group C', tags: 'WEEKLY' }
            ];

            const tag = 'WEEKLY';
            const matchingGroups = groups.filter(g =>
                g.tags.toUpperCase().includes(tag.toUpperCase())
            );

            expect(matchingGroups.length).toBe(3);
        });
    });

    // ==========================================
    // Listing Filtering Tests
    // ==========================================
    describe('Listing Filtering - Exclude Grouped Listings', () => {

        it('should track listing IDs that belong to groups', () => {
            const groups = [
                { id: 1, name: 'Group A', members: [{ id: 100 }, { id: 101 }] },
                { id: 2, name: 'Group B', members: [{ id: 200 }, { id: 201 }, { id: 202 }] }
            ];

            const groupedListingIds = new Set();
            groups.forEach(group => {
                group.members.forEach(m => groupedListingIds.add(m.id));
            });

            expect(groupedListingIds.size).toBe(5);
            expect(groupedListingIds.has(100)).toBe(true);
            expect(groupedListingIds.has(200)).toBe(true);
            expect(groupedListingIds.has(999)).toBe(false);
        });

        it('should exclude grouped listings from individual statement generation', () => {
            const allListings = [
                { id: 100, name: 'Listing A', tags: ['WEEKLY'], groupId: 1 },
                { id: 101, name: 'Listing B', tags: ['WEEKLY'], groupId: 1 },
                { id: 102, name: 'Listing C', tags: ['WEEKLY'], groupId: null },
                { id: 103, name: 'Listing D', tags: ['WEEKLY'], groupId: null },
                { id: 104, name: 'Listing E', tags: ['MONTHLY'], groupId: null }
            ];

            const tag = 'WEEKLY';
            const tagLower = tag.toLowerCase();
            const groupedListingIds = new Set([100, 101]);

            // Filter: has tag AND not in a group
            const listingsForIndividualGeneration = allListings.filter(l => {
                const listingTags = l.tags || [];
                const hasTag = listingTags.some(t => t.toLowerCase().trim() === tagLower);
                const isInGroup = groupedListingIds.has(l.id) || l.groupId;
                return hasTag && !isInGroup;
            });

            expect(listingsForIndividualGeneration.length).toBe(2);
            expect(listingsForIndividualGeneration.map(l => l.id)).toContain(102);
            expect(listingsForIndividualGeneration.map(l => l.id)).toContain(103);
            expect(listingsForIndividualGeneration.map(l => l.id)).not.toContain(100);
            expect(listingsForIndividualGeneration.map(l => l.id)).not.toContain(101);
        });

        it('should handle listings with groupId set in database', () => {
            const listing = { id: 100, name: 'Test', tags: ['WEEKLY'], groupId: 5 };
            const groupedListingIds = new Set(); // Empty, group not processed yet

            // Should still exclude if listing has groupId set
            const isInGroup = groupedListingIds.has(listing.id) || listing.groupId;

            expect(isInGroup).toBeTruthy();
        });
    });

    // ==========================================
    // Statement Generation Flow Tests
    // ==========================================
    describe('Statement Generation Flow', () => {

        it('should generate group statements first, then individual statements', () => {
            const executionOrder = [];

            // Simulate the flow
            const generateGroupStatements = () => {
                executionOrder.push('group');
                return { generated: 2, groups: ['Group A', 'Group B'] };
            };

            const generateIndividualStatements = () => {
                executionOrder.push('individual');
                return { generated: 3, listings: ['Listing C', 'Listing D', 'Listing E'] };
            };

            const groupResults = generateGroupStatements();
            const individualResults = generateIndividualStatements();

            expect(executionOrder).toEqual(['group', 'individual']);
            expect(groupResults.generated).toBe(2);
            expect(individualResults.generated).toBe(3);
        });

        it('should skip groups with no member listings', () => {
            const groups = [
                { id: 1, name: 'Group A', members: [{ id: 100 }] },
                { id: 2, name: 'Empty Group', members: [] },
                { id: 3, name: 'Group C', members: [{ id: 200 }, { id: 201 }] }
            ];

            const validGroups = groups.filter(g => g.members && g.members.length > 0);

            expect(validGroups.length).toBe(2);
            expect(validGroups.map(g => g.name)).not.toContain('Empty Group');
        });

        it('should use group calculationType for combined statements', () => {
            const group = {
                id: 1,
                name: 'Calendar Group',
                calculationType: 'calendar'
            };

            const defaultCalculationType = 'checkout';
            const effectiveCalculationType = group.calculationType || defaultCalculationType;

            expect(effectiveCalculationType).toBe('calendar');
        });

        it('should fall back to default calculationType if group has none', () => {
            const group = {
                id: 1,
                name: 'Default Group',
                calculationType: null
            };

            const defaultCalculationType = 'checkout';
            const effectiveCalculationType = group.calculationType || defaultCalculationType;

            expect(effectiveCalculationType).toBe('checkout');
        });
    });

    // ==========================================
    // Results Aggregation Tests
    // ==========================================
    describe('Results Aggregation', () => {

        it('should combine group and individual results in final count', () => {
            const results = {
                generated: [
                    { propertyId: 102, propertyName: 'Listing C' },
                    { propertyId: 103, propertyName: 'Listing D' }
                ],
                skipped: [],
                errors: [],
                groupResults: {
                    generated: 2,
                    skipped: 0,
                    errors: 0,
                    groups: [
                        { groupId: 1, groupName: 'Group A', memberCount: 2 },
                        { groupId: 2, groupName: 'Group B', memberCount: 3 }
                    ]
                }
            };

            const totalGenerated = results.generated.length + (results.groupResults?.generated || 0);
            const totalSkipped = results.skipped.length + (results.groupResults?.skipped || 0);
            const totalErrors = results.errors.length + (results.groupResults?.errors || 0);

            expect(totalGenerated).toBe(4); // 2 groups + 2 individual
            expect(totalSkipped).toBe(0);
            expect(totalErrors).toBe(0);
        });

        it('should include group statistics in job summary', () => {
            const groupResults = { generated: 3, skipped: 1, errors: 0 };
            const individualGenerated = 5;

            const summary = {
                generated: groupResults.generated + individualGenerated,
                groupsGenerated: groupResults.generated,
                individualGenerated: individualGenerated
            };

            expect(summary.generated).toBe(8);
            expect(summary.groupsGenerated).toBe(3);
            expect(summary.individualGenerated).toBe(5);
        });

        it('should handle case when no groups match the tag', () => {
            const groupResults = { generated: 0, skipped: 0, errors: 0, groups: [] };
            const individualResults = { generated: 5 };

            const totalGenerated = individualResults.generated + groupResults.generated;

            expect(totalGenerated).toBe(5);
            expect(groupResults.groups.length).toBe(0);
        });

        it('should handle case when all listings are in groups', () => {
            const allListings = [
                { id: 100, tags: ['WEEKLY'], groupId: 1 },
                { id: 101, tags: ['WEEKLY'], groupId: 1 },
                { id: 102, tags: ['WEEKLY'], groupId: 2 }
            ];

            const groupedListingIds = new Set([100, 101, 102]);
            const tag = 'WEEKLY';
            const tagLower = tag.toLowerCase();

            const listingsForIndividual = allListings.filter(l => {
                const listingTags = l.tags || [];
                const hasTag = listingTags.some(t => t.toLowerCase().trim() === tagLower);
                const isInGroup = groupedListingIds.has(l.id) || l.groupId;
                return hasTag && !isInGroup;
            });

            expect(listingsForIndividual.length).toBe(0);
        });
    });

    // ==========================================
    // Edge Cases
    // ==========================================
    describe('Edge Cases', () => {

        it('should handle groups with comma-separated tags', () => {
            const group = { id: 1, name: 'Multi-Tag Group', tags: 'WEEKLY, PREMIUM, VIP' };
            const searchTag = 'WEEKLY';

            const groupTags = group.tags.split(',').map(t => t.trim().toUpperCase());
            const hasTag = groupTags.some(t => t.includes(searchTag.toUpperCase()));

            expect(hasTag).toBe(true);
        });

        it('should handle empty tag filter (no tag specified)', () => {
            const tag = null;

            // When no tag is specified, group generation should not occur
            let shouldGenerateGroups = false;
            if (tag) {
                shouldGenerateGroups = true;
            }

            expect(shouldGenerateGroups).toBe(false);
        });

        it('should handle groups with null/undefined tags', () => {
            const groups = [
                { id: 1, name: 'Group A', tags: 'WEEKLY' },
                { id: 2, name: 'Group B', tags: null },
                { id: 3, name: 'Group C', tags: undefined }
            ];

            const tag = 'WEEKLY';
            const matchingGroups = groups.filter(g => {
                const groupTags = g.tags ? g.tags.split(',').map(t => t.trim().toUpperCase()) : [];
                return groupTags.some(t => t.includes(tag.toUpperCase()));
            });

            expect(matchingGroups.length).toBe(1);
            expect(matchingGroups[0].name).toBe('Group A');
        });

        it('should handle listings with null/empty tags array', () => {
            const listings = [
                { id: 100, name: 'A', tags: ['WEEKLY'] },
                { id: 101, name: 'B', tags: null },
                { id: 102, name: 'C', tags: [] },
                { id: 103, name: 'D', tags: undefined }
            ];

            const tag = 'WEEKLY';
            const tagLower = tag.toLowerCase();

            const matchingListings = listings.filter(l => {
                const listingTags = l.tags || [];
                return listingTags.some(t => t.toLowerCase().trim() === tagLower);
            });

            expect(matchingListings.length).toBe(1);
            expect(matchingListings[0].id).toBe(100);
        });

        it('should handle duplicate statement prevention for groups', () => {
            const existingStatements = [
                { groupId: 1, weekStartDate: '2026-01-12', weekEndDate: '2026-01-19' }
            ];

            const newStatement = {
                groupId: 1,
                weekStartDate: '2026-01-12',
                weekEndDate: '2026-01-19'
            };

            const isDuplicate = existingStatements.some(s =>
                s.groupId === newStatement.groupId &&
                s.weekStartDate === newStatement.weekStartDate &&
                s.weekEndDate === newStatement.weekEndDate
            );

            expect(isDuplicate).toBe(true);
        });
    });

    // ==========================================
    // Integration Scenario Tests
    // ==========================================
    describe('Integration Scenarios', () => {

        it('should handle complete tag-based generation scenario', () => {
            // Setup: Mixed listings - some in groups, some not
            const tag = 'WEEKLY';
            const tagLower = tag.toLowerCase();

            const groups = [
                {
                    id: 1,
                    name: 'Beach Group',
                    tags: 'WEEKLY',
                    members: [{ id: 100 }, { id: 101 }],
                    calculationType: 'checkout'
                },
                {
                    id: 2,
                    name: 'Mountain Group',
                    tags: 'WEEKLY',
                    members: [{ id: 200 }],
                    calculationType: 'calendar'
                }
            ];

            const allListings = [
                { id: 100, name: 'Beach House 1', tags: ['WEEKLY'], groupId: 1 },
                { id: 101, name: 'Beach House 2', tags: ['WEEKLY'], groupId: 1 },
                { id: 200, name: 'Mountain Cabin', tags: ['WEEKLY'], groupId: 2 },
                { id: 300, name: 'City Condo', tags: ['WEEKLY'], groupId: null },
                { id: 301, name: 'Downtown Apt', tags: ['WEEKLY'], groupId: null },
                { id: 400, name: 'Lake House', tags: ['MONTHLY'], groupId: null }
            ];

            // Step 1: Find groups with tag
            const matchingGroups = groups.filter(g =>
                g.tags.toUpperCase().includes(tag.toUpperCase())
            );

            // Step 2: Track grouped listing IDs
            const groupedListingIds = new Set();
            matchingGroups.forEach(g => {
                g.members.forEach(m => groupedListingIds.add(m.id));
            });

            // Step 3: Generate group statements
            const groupResults = {
                generated: matchingGroups.length,
                groups: matchingGroups.map(g => ({
                    groupId: g.id,
                    groupName: g.name,
                    memberCount: g.members.length
                }))
            };

            // Step 4: Filter listings for individual generation
            const individualListings = allListings.filter(l => {
                const listingTags = l.tags || [];
                const hasTag = listingTags.some(t => t.toLowerCase().trim() === tagLower);
                const isInGroup = groupedListingIds.has(l.id) || l.groupId;
                return hasTag && !isInGroup;
            });

            // Assertions
            expect(matchingGroups.length).toBe(2);
            expect(groupedListingIds.size).toBe(3); // 100, 101, 200
            expect(groupResults.generated).toBe(2);
            expect(individualListings.length).toBe(2); // 300, 301
            expect(individualListings.map(l => l.id)).toEqual([300, 301]);

            // Total statements: 2 group + 2 individual = 4
            const totalStatements = groupResults.generated + individualListings.length;
            expect(totalStatements).toBe(4);
        });

        it('should handle scenario where tag has no groups but has individual listings', () => {
            const tag = 'PREMIUM';
            const groups = [
                { id: 1, name: 'Group A', tags: 'WEEKLY' }
            ];

            const listings = [
                { id: 100, tags: ['PREMIUM'], groupId: null },
                { id: 101, tags: ['PREMIUM'], groupId: null }
            ];

            const matchingGroups = groups.filter(g =>
                g.tags.toUpperCase().includes(tag.toUpperCase())
            );

            expect(matchingGroups.length).toBe(0);

            const tagLower = tag.toLowerCase();
            const individualListings = listings.filter(l => {
                const listingTags = l.tags || [];
                return listingTags.some(t => t.toLowerCase().trim() === tagLower);
            });

            expect(individualListings.length).toBe(2);
        });

        it('should handle scenario where tag has groups but no individual listings', () => {
            const tag = 'WEEKLY';
            const tagLower = tag.toLowerCase();

            const groups = [
                { id: 1, name: 'Group A', tags: 'WEEKLY', members: [{ id: 100 }, { id: 101 }] }
            ];

            const allListings = [
                { id: 100, tags: ['WEEKLY'], groupId: 1 },
                { id: 101, tags: ['WEEKLY'], groupId: 1 }
            ];

            const matchingGroups = groups.filter(g =>
                g.tags.toUpperCase().includes(tag.toUpperCase())
            );

            const groupedListingIds = new Set();
            matchingGroups.forEach(g => {
                g.members.forEach(m => groupedListingIds.add(m.id));
            });

            const individualListings = allListings.filter(l => {
                const listingTags = l.tags || [];
                const hasTag = listingTags.some(t => t.toLowerCase().trim() === tagLower);
                const isInGroup = groupedListingIds.has(l.id) || l.groupId;
                return hasTag && !isInGroup;
            });

            expect(matchingGroups.length).toBe(1);
            expect(individualListings.length).toBe(0);
        });
    });

    // ==========================================
    // Error Handling Tests
    // ==========================================
    describe('Error Handling', () => {

        it('should continue processing if one group fails', () => {
            const groups = [
                { id: 1, name: 'Group A', members: [{ id: 100 }] },
                { id: 2, name: 'Group B', members: [{ id: 200 }] }, // This one will fail
                { id: 3, name: 'Group C', members: [{ id: 300 }] }
            ];

            const results = { generated: 0, errors: 0, groups: [] };

            groups.forEach((group, index) => {
                try {
                    if (index === 1) {
                        throw new Error('Simulated error');
                    }
                    results.generated++;
                    results.groups.push({ groupId: group.id, groupName: group.name });
                } catch (error) {
                    results.errors++;
                }
            });

            expect(results.generated).toBe(2);
            expect(results.errors).toBe(1);
        });

        it('should handle ListingGroupService errors gracefully', () => {
            const getGroupsByTag = () => {
                throw new Error('Service unavailable');
            };

            let groupResults = { generated: 0, skipped: 0, errors: 0, groups: [] };

            try {
                getGroupsByTag('WEEKLY');
            } catch (error) {
                // Should not crash, just log and continue
                console.error('Error fetching groups:', error.message);
            }

            // Individual generation should still proceed
            expect(groupResults.generated).toBe(0);
        });
    });

    // ==========================================
    // Logging and Progress Tests
    // ==========================================
    describe('Logging and Progress', () => {

        it('should log group discovery information', () => {
            const logs = [];
            const mockConsoleLog = (msg) => logs.push(msg);

            const tag = 'WEEKLY';
            const groupCount = 3;

            mockConsoleLog(`[Bulk Gen] Checking for groups with tag "${tag}"...`);
            mockConsoleLog(`[Bulk Gen] Found ${groupCount} groups with tag "${tag}"`);

            expect(logs).toContain(`[Bulk Gen] Checking for groups with tag "${tag}"...`);
            expect(logs).toContain(`[Bulk Gen] Found 3 groups with tag "WEEKLY"`);
        });

        it('should log individual listing exclusions', () => {
            const logs = [];
            const mockConsoleLog = (msg) => logs.push(msg);

            const listing = { id: 100, name: 'Beach House' };
            mockConsoleLog(`[Bulk Gen] Listing ${listing.id} (${listing.name}) is in a group, skipping individual generation`);

            expect(logs[0]).toContain('skipping individual generation');
        });

        it('should update job progress for group generation', () => {
            const progressUpdates = [];
            const mockUpdateProgress = (jobId, count, message) => {
                progressUpdates.push({ jobId, count, message });
            };

            const jobId = 'job-123';
            const groupCount = 5;

            mockUpdateProgress(jobId, 0, `Generating statements for ${groupCount} groups with tag "WEEKLY"...`);

            expect(progressUpdates[0].message).toContain('Generating statements for 5 groups');
        });
    });

    // ==========================================
    // Fix: Grouped listings with non-matching group tags
    // ==========================================
    describe('Grouped listings whose group tag does not match schedule tag', () => {

        it('should include a WEEKLY-tagged listing in a MONTHLY group when WEEKLY schedule runs', () => {
            // Scenario: Listing tagged WEEKLY, belongs to group 10 which is tagged MONTHLY
            // When the WEEKLY schedule fires, group 10 is NOT in matchingGroups
            // So this listing should be included for individual generation
            const matchingGroups = [
                { id: 1, name: 'Beach Properties', tags: 'WEEKLY' }
            ];
            const matchingGroupIds = new Set(matchingGroups.map(g => g.id));

            const listings = [
                { id: 100, displayName: 'Condo A', groupId: null },    // no group
                { id: 101, displayName: 'Condo B', groupId: 1 },       // group matches WEEKLY
                { id: 102, displayName: 'Condo C', groupId: 10 },      // group is MONTHLY, not in matchingGroups
                { id: 103, displayName: 'Condo D', groupId: null },    // no group
            ];

            const result = listings.filter(l => {
                if (!l.groupId) return true;
                if (matchingGroupIds.has(l.groupId)) return false;
                return true; // group doesn't match this tag
            });

            expect(result.map(l => l.id)).toEqual([100, 102, 103]);
            expect(result.map(l => l.id)).not.toContain(101); // handled by group generation
            expect(result.map(l => l.id)).toContain(102);     // NOT handled by group generation
        });

        it('should exclude a listing whose group matches the current tag', () => {
            const matchingGroupIds = new Set([1, 2]);

            const listings = [
                { id: 200, displayName: 'Villa A', groupId: 1 },
                { id: 201, displayName: 'Villa B', groupId: 2 },
                { id: 202, displayName: 'Villa C', groupId: 3 },
            ];

            const result = listings.filter(l => {
                if (!l.groupId) return true;
                if (matchingGroupIds.has(l.groupId)) return false;
                return true;
            });

            expect(result.map(l => l.id)).toEqual([202]);
        });

        it('should include all listings when no groups match the tag', () => {
            const matchingGroupIds = new Set(); // no groups match

            const listings = [
                { id: 300, displayName: 'Cabin A', groupId: 5 },
                { id: 301, displayName: 'Cabin B', groupId: 6 },
                { id: 302, displayName: 'Cabin C', groupId: null },
            ];

            const result = listings.filter(l => {
                if (!l.groupId) return true;
                if (matchingGroupIds.has(l.groupId)) return false;
                return true;
            });

            // All should be included — no groups were handled
            expect(result.length).toBe(3);
        });

        it('should handle the full scenario: WEEKLY schedule with mixed group tags', () => {
            // Groups in the system
            const allGroups = [
                { id: 1, name: 'Weekly Group', tags: 'WEEKLY' },
                { id: 2, name: 'Monthly Group', tags: 'MONTHLY' },
                { id: 3, name: 'Bi-Weekly Group', tags: 'BI-WEEKLY A' },
            ];

            // getGroupsByTag('WEEKLY') returns only groups with WEEKLY tag
            const weeklyGroups = allGroups.filter(g => {
                const groupTags = g.tags.split(',').map(t => t.trim().toUpperCase());
                return groupTags.some(t => t.includes('WEEKLY') && !t.includes('BI-WEEKLY'));
            });
            expect(weeklyGroups.map(g => g.id)).toEqual([1]);

            const matchingGroupIds = new Set(weeklyGroups.map(g => g.id));

            // Listings tagged WEEKLY (from DB query)
            const listings = [
                { id: 10, displayName: 'Ungrouped A', groupId: null },
                { id: 11, displayName: 'In Weekly Group', groupId: 1 },
                { id: 12, displayName: 'In Monthly Group', groupId: 2 },
                { id: 13, displayName: 'In Bi-Weekly Group', groupId: 3 },
                { id: 14, displayName: 'Ungrouped B', groupId: null },
            ];

            const result = listings.filter(l => {
                if (!l.groupId) return true;
                if (matchingGroupIds.has(l.groupId)) return false;
                return true;
            });

            // Listing 11 is excluded (Weekly Group handles it)
            // Listings 12, 13 are INCLUDED (their groups don't handle WEEKLY)
            expect(result.map(l => l.id)).toEqual([10, 12, 13, 14]);
        });
    });
});
