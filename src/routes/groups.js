const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const ListingGroupService = require('../services/ListingGroupService');
const { ActivityLog } = require('../models');

/**
 * Listing Groups API Routes
 * Manage groups of listings for combined statement generation
 */

// GET /api/groups - List all groups with member counts
router.get('/', async (req, res) => {
    try {
        const { tag } = req.query;

        let groups;
        if (tag) {
            // Filter groups by tag
            groups = await ListingGroupService.getGroupsByTag(tag);
        } else {
            groups = await ListingGroupService.getAllGroups();
        }

        res.json({
            success: true,
            count: groups.length,
            groups
        });
    } catch (error) {
        logger.logError(error, { context: 'Groups', action: 'fetchGroups' });
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /api/groups - Create a new group
router.post('/', async (req, res) => {
    try {
        const { name, tags, listingIds, calculationType } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Group name is required' });
        }

        const group = await ListingGroupService.createGroup(name, tags, listingIds, calculationType);

        // Log activity
        await ActivityLog.log(req, 'CREATE_GROUP', 'listing_group', group.id, {
            groupName: group.name,
            tags: group.tags,
            memberCount: group.memberCount,
            listingIds: listingIds || []
        });

        res.status(201).json({
            success: true,
            message: 'Group created successfully',
            group
        });
    } catch (error) {
        logger.logError(error, { context: 'Groups', action: 'createGroup' });

        // Handle duplicate name error
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }

        res.status(500).json({ error: error.message || 'Failed to create group' });
    }
});

// GET /api/groups/:id - Get a single group with all member listings
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const group = await ListingGroupService.getGroupById(parseInt(id));

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        res.json({
            success: true,
            group
        });
    } catch (error) {
        logger.logError(error, { context: 'Groups', action: 'fetchGroup', groupId: req.params.id });
        res.status(500).json({ error: 'Failed to fetch group' });
    }
});

// PUT /api/groups/:id - Update group details (name, tags, calculationType)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, tags, calculationType, stripeAccountId, stripeOnboardingStatus } = req.body;

        if (name === undefined && tags === undefined && calculationType === undefined && stripeAccountId === undefined && stripeOnboardingStatus === undefined) {
            return res.status(400).json({ error: 'At least one field is required to update' });
        }

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (tags !== undefined) updates.tags = tags;
        if (calculationType !== undefined) updates.calculationType = calculationType;
        if (stripeAccountId !== undefined) updates.stripeAccountId = stripeAccountId;
        if (stripeOnboardingStatus !== undefined) updates.stripeOnboardingStatus = stripeOnboardingStatus;

        const group = await ListingGroupService.updateGroup(parseInt(id), updates);

        // Log activity
        await ActivityLog.log(req, 'UPDATE_GROUP', 'listing_group', id, {
            groupName: group.name,
            changes: Object.keys(updates)
        });

        res.json({
            success: true,
            message: 'Group updated successfully',
            group
        });
    } catch (error) {
        logger.logError(error, { context: 'Groups', action: 'updateGroup', groupId: req.params.id });

        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }
        if (error.message.includes('cannot be empty')) {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ error: error.message || 'Failed to update group' });
    }
});

// DELETE /api/groups/:id - Delete a group (ungroups all member listings)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await ListingGroupService.deleteGroup(parseInt(id));

        // Log activity
        await ActivityLog.log(req, 'DELETE_GROUP', 'listing_group', id, {
            deletedGroupName: result.deletedGroup.name,
            ungroupedListings: result.ungroupedListings
        });

        res.json({
            success: true,
            message: `Group "${result.deletedGroup.name}" deleted successfully`,
            ...result
        });
    } catch (error) {
        logger.logError(error, { context: 'Groups', action: 'deleteGroup', groupId: req.params.id });

        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({ error: error.message || 'Failed to delete group' });
    }
});

// POST /api/groups/:id/listings - Add listings to a group
router.post('/:id/listings', async (req, res) => {
    try {
        const { id } = req.params;
        const { listingIds } = req.body;

        if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
            return res.status(400).json({ error: 'listingIds array is required' });
        }

        // Convert to integers
        const parsedListingIds = listingIds.map(lid => parseInt(lid)).filter(lid => !isNaN(lid));

        if (parsedListingIds.length === 0) {
            return res.status(400).json({ error: 'At least one valid listing ID is required' });
        }

        const result = await ListingGroupService.addListingsToGroup(parseInt(id), parsedListingIds);

        // Log activity
        await ActivityLog.log(req, 'ADD_LISTINGS_TO_GROUP', 'listing_group', id, {
            groupName: result.groupName,
            addedCount: result.added.length,
            movedFromOtherGroups: result.movedFrom.length,
            notFound: result.notFound
        });

        res.json({
            success: true,
            message: `Added ${result.added.length} listing(s) to group "${result.groupName}"`,
            ...result
        });
    } catch (error) {
        logger.logError(error, { context: 'Groups', action: 'addListingsToGroup', groupId: req.params.id });

        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({ error: error.message || 'Failed to add listings to group' });
    }
});

// DELETE /api/groups/:id/listings/:listingId - Remove a listing from a group
router.delete('/:id/listings/:listingId', async (req, res) => {
    try {
        const { id, listingId } = req.params;

        // Verify the listing is actually in this group
        const group = await ListingGroupService.getGroupById(parseInt(id));

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const listingInGroup = group.members.find(m => m.id === parseInt(listingId));

        if (!listingInGroup) {
            return res.status(400).json({ error: 'Listing is not in this group' });
        }

        const result = await ListingGroupService.removeListingFromGroup(parseInt(listingId));

        // Log activity
        await ActivityLog.log(req, 'REMOVE_LISTING_FROM_GROUP', 'listing_group', id, {
            groupName: group.name,
            listingId: parseInt(listingId),
            listingName: result.listingName
        });

        res.json({
            success: true,
            message: `Removed "${result.listingName}" from group "${group.name}"`,
            ...result
        });
    } catch (error) {
        logger.logError(error, { context: 'Groups', action: 'removeListingFromGroup', groupId: req.params.id, listingId: req.params.listingId });

        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({ error: error.message || 'Failed to remove listing from group' });
    }
});

module.exports = router;
