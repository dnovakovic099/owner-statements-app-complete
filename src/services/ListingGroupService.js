const { Op } = require('sequelize');

/**
 * Service for managing Listing Groups
 * Groups allow multiple listings to be combined into single statements
 */
class ListingGroupService {
    constructor() {
        // Models will be loaded lazily to avoid circular dependencies
        this._ListingGroup = null;
        this._Listing = null;
    }

    /**
     * Get the ListingGroup model (lazy load)
     */
    get ListingGroup() {
        if (!this._ListingGroup) {
            this._ListingGroup = require('../models/ListingGroup');
        }
        return this._ListingGroup;
    }

    /**
     * Get the Listing model (lazy load)
     */
    get Listing() {
        if (!this._Listing) {
            this._Listing = require('../models/Listing');
        }
        return this._Listing;
    }

    /**
     * Get all groups with member counts
     * @returns {Promise<Array>} Array of groups with memberCount
     */
    async getAllGroups() {
        try {
            const groups = await this.ListingGroup.findAll({
                order: [['name', 'ASC']]
            });

            // Get member counts for each group
            const groupsWithCounts = await Promise.all(
                groups.map(async (group) => {
                    const memberCount = await this.Listing.count({
                        where: { groupId: group.id }
                    });
                    return {
                        ...group.toJSON(),
                        memberCount
                    };
                })
            );

            return groupsWithCounts;
        } catch (error) {
            console.error('[ListingGroupService] Error getting all groups:', error);
            throw error;
        }
    }

    /**
     * Get a group by ID with all member listings
     * @param {number} id - Group ID
     * @returns {Promise<Object|null>} Group with members array, or null if not found
     */
    async getGroupById(id) {
        try {
            const group = await this.ListingGroup.findByPk(id);

            if (!group) {
                return null;
            }

            // Get all member listings
            const members = await this.Listing.findAll({
                where: { groupId: id },
                attributes: ['id', 'name', 'displayName', 'nickname', 'city', 'state', 'tags', 'ownerEmail', 'isActive'],
                order: [['name', 'ASC']]
            });

            return {
                ...group.toJSON(),
                members: members.map(m => m.toJSON()),
                memberCount: members.length
            };
        } catch (error) {
            console.error(`[ListingGroupService] Error getting group ${id}:`, error);
            throw error;
        }
    }

    /**
     * Create a new group and assign listings to it
     * @param {string} name - Group name (required, must be unique)
     * @param {string|Array} tags - Tags as comma-separated string or array
     * @param {Array<number>} listingIds - Array of listing IDs to add to the group
     * @returns {Promise<Object>} Created group with members
     */
    async createGroup(name, tags, listingIds = [], calculationType = 'checkout') {
        try {
            // Validate name
            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                throw new Error('Group name is required');
            }

            // Check for duplicate name
            const existingGroup = await this.ListingGroup.findOne({
                where: { name: name.trim() }
            });
            if (existingGroup) {
                throw new Error(`A group with name "${name.trim()}" already exists`);
            }

            // Normalize tags
            let normalizedTags = '';
            if (Array.isArray(tags)) {
                normalizedTags = tags.filter(t => t && t.trim()).join(',');
            } else if (typeof tags === 'string') {
                normalizedTags = tags;
            }

            // Create the group
            const group = await this.ListingGroup.create({
                name: name.trim(),
                tags: normalizedTags,
                calculationType: calculationType || 'checkout'
            });

            console.log(`[ListingGroupService] Created group: ${group.name} (ID: ${group.id})`);

            // Assign listings to the group if provided
            if (listingIds && listingIds.length > 0) {
                await this.addListingsToGroup(group.id, listingIds);
            }

            // Return the group with members
            return await this.getGroupById(group.id);
        } catch (error) {
            console.error('[ListingGroupService] Error creating group:', error);
            throw error;
        }
    }

    /**
     * Update group details (name and/or tags)
     * @param {number} id - Group ID
     * @param {Object} updates - Object with name and/or tags to update
     * @returns {Promise<Object>} Updated group with members
     */
    async updateGroup(id, updates) {
        try {
            const group = await this.ListingGroup.findByPk(id);

            if (!group) {
                throw new Error(`Group ${id} not found`);
            }

            const updateData = {};

            // Update name if provided
            if (updates.name !== undefined) {
                if (!updates.name || typeof updates.name !== 'string' || updates.name.trim().length === 0) {
                    throw new Error('Group name cannot be empty');
                }

                // Check for duplicate name (excluding current group)
                const existingGroup = await this.ListingGroup.findOne({
                    where: {
                        name: updates.name.trim(),
                        id: { [Op.ne]: id }
                    }
                });
                if (existingGroup) {
                    throw new Error(`A group with name "${updates.name.trim()}" already exists`);
                }

                updateData.name = updates.name.trim();
            }

            // Update tags if provided
            if (updates.tags !== undefined) {
                if (Array.isArray(updates.tags)) {
                    updateData.tags = updates.tags.filter(t => t && t.trim()).join(',');
                } else if (typeof updates.tags === 'string') {
                    updateData.tags = updates.tags;
                } else {
                    updateData.tags = '';
                }
            }

            // Update calculationType if provided
            if (updates.calculationType !== undefined) {
                updateData.calculationType = updates.calculationType || 'checkout';
            }

            if (Object.keys(updateData).length > 0) {
                await group.update(updateData);
                console.log(`[ListingGroupService] Updated group ${id}:`, updateData);
            }

            // Return the updated group with members
            return await this.getGroupById(id);
        } catch (error) {
            console.error(`[ListingGroupService] Error updating group ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete a group (sets all member listings' group_id to null)
     * @param {number} id - Group ID
     * @returns {Promise<Object>} Deletion result with affected listing count
     */
    async deleteGroup(id) {
        try {
            const group = await this.ListingGroup.findByPk(id);

            if (!group) {
                throw new Error(`Group ${id} not found`);
            }

            const groupName = group.name;

            // Count affected listings before deletion
            const affectedCount = await this.Listing.count({
                where: { groupId: id }
            });

            // Clear group_id from all member listings
            await this.Listing.update(
                { groupId: null },
                { where: { groupId: id } }
            );

            // Delete the group
            await group.destroy();

            console.log(`[ListingGroupService] Deleted group "${groupName}" (ID: ${id}), ungrouped ${affectedCount} listings`);

            return {
                success: true,
                deletedGroup: { id, name: groupName },
                ungroupedListings: affectedCount
            };
        } catch (error) {
            console.error(`[ListingGroupService] Error deleting group ${id}:`, error);
            throw error;
        }
    }

    /**
     * Add listings to a group (removes from any existing group first)
     * @param {number} groupId - Group ID to add listings to
     * @param {Array<number>} listingIds - Array of listing IDs to add
     * @returns {Promise<Object>} Result with added listings and any warnings
     */
    async addListingsToGroup(groupId, listingIds) {
        try {
            const group = await this.ListingGroup.findByPk(groupId);

            if (!group) {
                throw new Error(`Group ${groupId} not found`);
            }

            if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
                throw new Error('At least one listing ID is required');
            }

            const results = {
                added: [],
                movedFrom: [],
                notFound: [],
                alreadyInGroup: []
            };

            for (const listingId of listingIds) {
                const listing = await this.Listing.findByPk(listingId);

                if (!listing) {
                    results.notFound.push(listingId);
                    continue;
                }

                // Check if already in this group
                if (listing.groupId === groupId) {
                    results.alreadyInGroup.push({
                        id: listingId,
                        name: listing.displayName || listing.nickname || listing.name
                    });
                    continue;
                }

                // Check if in another group (will be moved)
                if (listing.groupId) {
                    const previousGroup = await this.ListingGroup.findByPk(listing.groupId);
                    results.movedFrom.push({
                        listingId,
                        listingName: listing.displayName || listing.nickname || listing.name,
                        previousGroupId: listing.groupId,
                        previousGroupName: previousGroup ? previousGroup.name : 'Unknown'
                    });
                }

                // Update the listing's group
                await listing.update({ groupId });
                results.added.push({
                    id: listingId,
                    name: listing.displayName || listing.nickname || listing.name
                });
            }

            console.log(`[ListingGroupService] Added ${results.added.length} listings to group "${group.name}" (${results.movedFrom.length} moved from other groups)`);

            return {
                success: true,
                groupId,
                groupName: group.name,
                ...results
            };
        } catch (error) {
            console.error(`[ListingGroupService] Error adding listings to group ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Remove a listing from its group (sets group_id to null)
     * @param {number} listingId - Listing ID to remove from its group
     * @returns {Promise<Object>} Result with removed listing info
     */
    async removeListingFromGroup(listingId) {
        try {
            const listing = await this.Listing.findByPk(listingId);

            if (!listing) {
                throw new Error(`Listing ${listingId} not found`);
            }

            if (!listing.groupId) {
                return {
                    success: true,
                    message: 'Listing was not in any group',
                    listingId,
                    listingName: listing.displayName || listing.nickname || listing.name,
                    previousGroupId: null
                };
            }

            const previousGroupId = listing.groupId;
            const previousGroup = await this.ListingGroup.findByPk(previousGroupId);

            // Remove from group
            await listing.update({ groupId: null });

            console.log(`[ListingGroupService] Removed listing ${listingId} from group "${previousGroup?.name || previousGroupId}"`);

            return {
                success: true,
                listingId,
                listingName: listing.displayName || listing.nickname || listing.name,
                previousGroupId,
                previousGroupName: previousGroup ? previousGroup.name : null
            };
        } catch (error) {
            console.error(`[ListingGroupService] Error removing listing ${listingId} from group:`, error);
            throw error;
        }
    }

    /**
     * Get all listings in a group (convenience method)
     * @param {number} groupId - Group ID
     * @returns {Promise<Array>} Array of listings in the group
     */
    async getGroupListings(groupId) {
        try {
            const listings = await this.Listing.findAll({
                where: { groupId },
                order: [['name', 'ASC']]
            });

            return listings.map(l => l.toJSON());
        } catch (error) {
            console.error(`[ListingGroupService] Error getting listings for group ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Get groups that match specific tags (for dropdown filtering)
     * @param {string} tag - Tag to filter by
     * @returns {Promise<Array>} Array of groups matching the tag
     */
    async getGroupsByTag(tag) {
        try {
            const groups = await this.getAllGroups();

            if (!tag) {
                return groups;
            }

            const tagUpper = tag.toUpperCase().trim();

            // Pattern matching for WEEKLY, BI-WEEKLY, MONTHLY tags
            return groups.filter(group => {
                const groupTags = group.tags ? group.tags.split(',').map(t => t.trim().toUpperCase()) : [];

                // For BI-WEEKLY schedule, match any group tag containing "BI-WEEKLY"
                if (tagUpper.includes('BI-WEEKLY') || tagUpper.includes('BIWEEKLY')) {
                    return groupTags.some(t => t.includes('BI-WEEKLY') || t.includes('BIWEEKLY'));
                }

                // For WEEKLY schedule, match tags with "WEEKLY" but NOT "BI-WEEKLY"
                if (tagUpper === 'WEEKLY') {
                    return groupTags.some(t => t.includes('WEEKLY') && !t.includes('BI-WEEKLY') && !t.includes('BIWEEKLY'));
                }

                // For MONTHLY schedule, match any tag containing "MONTHLY"
                if (tagUpper.includes('MONTHLY')) {
                    return groupTags.some(t => t.includes('MONTHLY'));
                }

                // Default: exact match
                return groupTags.includes(tagUpper);
            });
        } catch (error) {
            console.error(`[ListingGroupService] Error getting groups by tag "${tag}":`, error);
            throw error;
        }
    }
}

module.exports = new ListingGroupService();
