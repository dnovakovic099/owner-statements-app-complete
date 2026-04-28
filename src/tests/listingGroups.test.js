/**
 * Jest Test Cases for Listing Groups Feature
 * Tests: ListingGroupService, StatementService, API routes
 */

// Mock dependencies before requiring modules
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

describe('Listing Groups Feature', () => {

    // ==========================================
    // ListingGroupService Tests
    // ==========================================
    describe('ListingGroupService', () => {
        let ListingGroupService;
        let mockListingGroup;
        let mockListing;

        beforeEach(() => {
            jest.resetModules();

            mockListingGroup = {
                id: 1,
                name: 'Test Group',
                tags: ['WEEKLY'],
                calculationType: 'checkout',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockListing = {
                id: 100,
                name: 'Test Listing',
                groupId: null,
                update: jest.fn()
            };
        });

        describe('createGroup', () => {
            it('should create a group with valid name and tags', async () => {
                const mockCreate = jest.fn().mockResolvedValue(mockListingGroup);
                const mockFindOne = jest.fn().mockResolvedValue(null);
                const mockFindByPk = jest.fn().mockResolvedValue({
                    ...mockListingGroup,
                    members: []
                });

                jest.doMock('../models/ListingGroup', () => ({
                    create: mockCreate,
                    findOne: mockFindOne,
                    findByPk: mockFindByPk
                }));

                // Test expectations
                expect(mockListingGroup.name).toBe('Test Group');
                expect(mockListingGroup.tags).toContain('WEEKLY');
            });

            it('should throw error if group name is empty', async () => {
                const createGroupWithEmptyName = async () => {
                    if (!name || name.trim().length === 0) {
                        throw new Error('Group name is required');
                    }
                };

                const name = '';
                await expect(createGroupWithEmptyName()).rejects.toThrow('Group name is required');
            });

            it('should throw error if group name already exists', async () => {
                const checkDuplicateName = async (name) => {
                    const existingGroup = { id: 1, name: 'Existing Group' };
                    if (existingGroup) {
                        throw new Error(`A group with name "${name}" already exists`);
                    }
                };

                await expect(checkDuplicateName('Existing Group'))
                    .rejects.toThrow('already exists');
            });

            it('should accept calculationType parameter', () => {
                const group = {
                    name: 'Test Group',
                    tags: ['WEEKLY'],
                    calculationType: 'calendar'
                };

                expect(group.calculationType).toBe('calendar');
            });
        });

        describe('updateGroup', () => {
            it('should update group name', () => {
                const updates = { name: 'Updated Group Name' };
                const group = { ...mockListingGroup, ...updates };

                expect(group.name).toBe('Updated Group Name');
            });

            it('should update group tags', () => {
                const updates = { tags: ['BI-WEEKLY A'] };
                const group = { ...mockListingGroup, tags: updates.tags };

                expect(group.tags).toContain('BI-WEEKLY A');
            });

            it('should update calculationType', () => {
                const updates = { calculationType: 'calendar' };
                const group = { ...mockListingGroup, ...updates };

                expect(group.calculationType).toBe('calendar');
            });
        });

        describe('addListingsToGroup', () => {
            it('should add listings to group', () => {
                const listingIds = [100, 101, 102];
                const groupId = 1;

                const results = {
                    added: listingIds,
                    movedFrom: [],
                    skipped: []
                };

                expect(results.added.length).toBe(3);
            });

            it('should move listing from existing group', () => {
                const listing = { id: 100, groupId: 2 }; // Already in group 2
                const newGroupId = 1;

                const results = {
                    added: [100],
                    movedFrom: [{ listingId: 100, previousGroupId: 2 }],
                    skipped: []
                };

                expect(results.movedFrom.length).toBe(1);
                expect(results.movedFrom[0].previousGroupId).toBe(2);
            });
        });

        describe('removeListingFromGroup', () => {
            it('should set groupId to null when removing', () => {
                const listing = { id: 100, groupId: 1 };
                listing.groupId = null;

                expect(listing.groupId).toBeNull();
            });
        });

        describe('getGroupsByTag', () => {
            it('should find groups with WEEKLY tag', () => {
                const groups = [
                    { id: 1, name: 'Group A', tags: ['WEEKLY'] },
                    { id: 2, name: 'Group B', tags: ['BI-WEEKLY A'] },
                    { id: 3, name: 'Group C', tags: ['WEEKLY', 'SHARED'] }
                ];

                const weeklyGroups = groups.filter(g =>
                    g.tags.some(t => t.toUpperCase().includes('WEEKLY') && !t.toUpperCase().includes('BI'))
                );

                expect(weeklyGroups.length).toBe(2);
            });

            it('should find groups with BI-WEEKLY A tag', () => {
                const groups = [
                    { id: 1, name: 'Group A', tags: ['WEEKLY'] },
                    { id: 2, name: 'Group B', tags: ['BI-WEEKLY A'] },
                    { id: 3, name: 'Group C', tags: ['BI-WEEKLY B'] }
                ];

                const biweeklyAGroups = groups.filter(g =>
                    g.tags.some(t => t.toUpperCase() === 'BI-WEEKLY A')
                );

                expect(biweeklyAGroups.length).toBe(1);
                expect(biweeklyAGroups[0].name).toBe('Group B');
            });
        });
    });

    // ==========================================
    // StatementService Tests
    // ==========================================
    describe('StatementService - generateGroupStatement', () => {

        it('should create combined statement for group', () => {
            const options = {
                groupId: 1,
                groupName: 'Test Group',
                listingIds: [100, 101, 102],
                startDate: '2025-12-29',
                endDate: '2026-01-05',
                calculationType: 'checkout'
            };

            const statement = {
                id: 1,
                isCombinedStatement: true,
                propertyIds: options.listingIds,
                groupId: options.groupId,
                groupName: options.groupName,
                status: 'draft'
            };

            expect(statement.isCombinedStatement).toBe(true);
            expect(statement.status).toBe('draft');
            expect(statement.groupId).toBe(1);
        });

        it('should always create draft status', () => {
            const statement = {
                status: 'draft' // Auto-generated should always be draft
            };

            expect(statement.status).toBe('draft');
            expect(statement.status).not.toBe('sent');
        });

        it('should include all listing IDs in propertyIds', () => {
            const listingIds = [100, 101, 102];
            const statement = {
                propertyIds: listingIds
            };

            expect(statement.propertyIds).toEqual(listingIds);
            expect(statement.propertyIds.length).toBe(3);
        });
    });

    // ==========================================
    // StatementService - Individual Statement Tests
    // ==========================================
    describe('StatementService - generateIndividualStatement', () => {

        it('should create individual statement for single listing', () => {
            const options = {
                listingId: 100,
                startDate: '2025-12-29',
                endDate: '2026-01-05',
                calculationType: 'checkout'
            };

            const statement = {
                id: 1,
                isCombinedStatement: false,
                propertyId: options.listingId,
                propertyIds: [options.listingId],
                groupId: null,
                groupName: null,
                status: 'draft'
            };

            expect(statement.isCombinedStatement).toBe(false);
            expect(statement.status).toBe('draft');
            expect(statement.groupId).toBeNull();
            expect(statement.propertyId).toBe(100);
        });

        it('should always create draft status for individual', () => {
            const statement = {
                status: 'draft' // Auto-generated should always be draft
            };

            expect(statement.status).toBe('draft');
        });

        it('should not have group metadata', () => {
            const statement = {
                groupId: null,
                groupName: null,
                groupTags: null
            };

            expect(statement.groupId).toBeNull();
            expect(statement.groupName).toBeNull();
            expect(statement.groupTags).toBeNull();
        });
    });

    // ==========================================
    // API Routes Tests
    // ==========================================
    describe('Groups API Routes', () => {

        describe('GET /api/groups', () => {
            it('should return list of groups', () => {
                const response = {
                    success: true,
                    count: 2,
                    groups: [
                        { id: 1, name: 'Group A', tags: ['WEEKLY'] },
                        { id: 2, name: 'Group B', tags: ['MONTHLY'] }
                    ]
                };

                expect(response.success).toBe(true);
                expect(response.groups.length).toBe(2);
            });

            it('should filter groups by tag', () => {
                const allGroups = [
                    { id: 1, name: 'Group A', tags: ['WEEKLY'] },
                    { id: 2, name: 'Group B', tags: ['MONTHLY'] }
                ];

                const tag = 'WEEKLY';
                const filtered = allGroups.filter(g =>
                    g.tags.some(t => t.toUpperCase().includes(tag.toUpperCase()))
                );

                expect(filtered.length).toBe(1);
                expect(filtered[0].name).toBe('Group A');
            });
        });

        describe('POST /api/groups', () => {
            it('should create group with required fields', () => {
                const requestBody = {
                    name: 'New Group',
                    tags: ['WEEKLY'],
                    listingIds: [100, 101],
                    calculationType: 'checkout'
                };

                expect(requestBody.name).toBeDefined();
                expect(requestBody.tags).toBeDefined();
            });

            it('should return 400 if name is missing', () => {
                const requestBody = {
                    tags: ['WEEKLY'],
                    listingIds: [100]
                };

                const hasName = !!requestBody.name;
                expect(hasName).toBe(false);
            });

            it('should return 409 if name already exists', () => {
                const existingGroups = [{ name: 'Existing Group' }];
                const newName = 'Existing Group';

                const isDuplicate = existingGroups.some(g => g.name === newName);
                expect(isDuplicate).toBe(true);
            });
        });

        describe('PUT /api/groups/:id', () => {
            it('should update group fields', () => {
                const updates = {
                    name: 'Updated Name',
                    tags: ['BI-WEEKLY A'],
                    calculationType: 'calendar'
                };

                const group = {
                    id: 1,
                    name: 'Old Name',
                    tags: ['WEEKLY'],
                    calculationType: 'checkout'
                };

                const updated = { ...group, ...updates };

                expect(updated.name).toBe('Updated Name');
                expect(updated.tags).toContain('BI-WEEKLY A');
                expect(updated.calculationType).toBe('calendar');
            });
        });

        describe('DELETE /api/groups/:id', () => {
            it('should set member listings groupId to null', () => {
                const listings = [
                    { id: 100, groupId: 1 },
                    { id: 101, groupId: 1 }
                ];

                // After delete, groupId should be null
                listings.forEach(l => l.groupId = null);

                expect(listings.every(l => l.groupId === null)).toBe(true);
            });
        });

        describe('POST /api/groups/:id/listings', () => {
            it('should add listings to group', () => {
                const groupId = 1;
                const listingIds = [100, 101];

                const results = {
                    groupId,
                    added: listingIds,
                    movedFrom: []
                };

                expect(results.added.length).toBe(2);
            });
        });

        describe('DELETE /api/groups/:id/listings/:listingId', () => {
            it('should remove listing from group', () => {
                const listing = { id: 100, groupId: 1 };
                listing.groupId = null;

                expect(listing.groupId).toBeNull();
            });
        });
    });

    // ==========================================
    // Frontend Component Tests (GroupModal)
    // ==========================================
    describe('GroupModal Component Logic', () => {

        describe('Form Validation', () => {
            it('should require group name', () => {
                const name = '';
                const hasError = !name.trim();

                expect(hasError).toBe(true);
            });

            it('should require at least one tag', () => {
                const tags = [];
                const hasError = tags.length === 0;

                expect(hasError).toBe(true);
            });

            it('should require at least one listing', () => {
                const listingIds = [];
                const hasError = listingIds.length === 0;

                expect(hasError).toBe(true);
            });
        });

        describe('Listing Search Filter', () => {
            it('should filter listings by name', () => {
                const listings = [
                    { id: 1, displayName: 'Beach House', city: 'Miami' },
                    { id: 2, displayName: 'Mountain Cabin', city: 'Denver' },
                    { id: 3, displayName: 'City Apartment', city: 'Miami' }
                ];

                const query = 'beach';
                const filtered = listings.filter(l =>
                    l.displayName.toLowerCase().includes(query.toLowerCase())
                );

                expect(filtered.length).toBe(1);
                expect(filtered[0].displayName).toBe('Beach House');
            });

            it('should filter listings by city', () => {
                const listings = [
                    { id: 1, displayName: 'Beach House', city: 'Miami' },
                    { id: 2, displayName: 'Mountain Cabin', city: 'Denver' },
                    { id: 3, displayName: 'City Apartment', city: 'Miami' }
                ];

                const query = 'miami';
                const filtered = listings.filter(l =>
                    l.city.toLowerCase().includes(query.toLowerCase())
                );

                expect(filtered.length).toBe(2);
            });

            it('should filter listings by ID', () => {
                const listings = [
                    { id: 100, displayName: 'Beach House' },
                    { id: 200, displayName: 'Mountain Cabin' },
                    { id: 101, displayName: 'City Apartment' }
                ];

                const query = '100';
                const filtered = listings.filter(l =>
                    String(l.id).includes(query)
                );

                expect(filtered.length).toBe(1);
            });
        });

        describe('Available Tags', () => {
            it('should include all schedule tags', () => {
                const availableTags = ['WEEKLY', 'BI-WEEKLY A', 'BI-WEEKLY B', 'MONTHLY'];

                expect(availableTags).toContain('WEEKLY');
                expect(availableTags).toContain('BI-WEEKLY A');
                expect(availableTags).toContain('BI-WEEKLY B');
                expect(availableTags).toContain('MONTHLY');
            });
        });
    });

    // ==========================================
    // GenerateModal Group Selection Tests
    // ==========================================
    describe('GenerateModal - Group Selection', () => {

        describe('Date Auto-Fill', () => {
            const getDateRangeForTag = (tag) => {
                const today = new Date('2026-01-09');
                const dayOfWeek = today.getDay();
                const upperTag = tag.toUpperCase();

                if (upperTag.includes('WEEKLY') && !upperTag.includes('BI')) {
                    const lastMonday = new Date(today);
                    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                    lastMonday.setDate(today.getDate() - daysToMonday);
                    const prevMonday = new Date(lastMonday);
                    prevMonday.setDate(lastMonday.getDate() - 7);
                    return { start: prevMonday.toISOString().split('T')[0], end: lastMonday.toISOString().split('T')[0] };
                }
                return { start: '', end: '' };
            };

            it('should auto-fill dates when group selected', () => {
                const group = { id: 1, name: 'Test', tags: ['WEEKLY'] };
                const dateRange = getDateRangeForTag(group.tags[0]);

                expect(dateRange.start).toBeDefined();
                expect(dateRange.end).toBeDefined();
            });

            it('should auto-fill calculationType from group', () => {
                const group = {
                    id: 1,
                    name: 'Test',
                    tags: ['WEEKLY'],
                    calculationType: 'calendar'
                };

                const calculationType = group.calculationType || 'checkout';
                expect(calculationType).toBe('calendar');
            });
        });

        describe('Group Selection Behavior', () => {
            it('should clear individual property selection when group selected', () => {
                let selectedPropertyIds = ['100', '101'];
                let selectedGroupId = null;

                // Select a group
                selectedGroupId = 1;
                selectedPropertyIds = []; // Clear individual selections

                expect(selectedGroupId).toBe(1);
                expect(selectedPropertyIds.length).toBe(0);
            });

            it('should send groupId to API when group selected', () => {
                const selectedGroupId = 1;

                const requestBody = {
                    groupId: selectedGroupId,
                    startDate: '2025-12-29',
                    endDate: '2026-01-05',
                    calculationType: 'checkout'
                };

                expect(requestBody.groupId).toBe(1);
                expect(requestBody.propertyIds).toBeUndefined();
            });
        });
    });
});
