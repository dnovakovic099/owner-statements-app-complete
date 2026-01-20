const express = require('express');
const router = express.Router();
const TagScheduleService = require('../services/TagScheduleService');
const Listing = require('../models/Listing');
const { Op } = require('sequelize');

// === Schedule Routes ===

// Get all schedules
router.get('/schedules', async (req, res) => {
    try {
        const schedules = await TagScheduleService.getAllSchedules();
        res.json({ success: true, schedules });
    } catch (error) {
        console.error('Error fetching schedules:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get schedule for a specific tag
router.get('/schedules/:tagName', async (req, res) => {
    try {
        const { tagName } = req.params;
        const schedule = await TagScheduleService.getScheduleByTag(decodeURIComponent(tagName));
        if (schedule) {
            res.json({ success: true, schedule });
        } else {
            res.json({ success: true, schedule: null });
        }
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create or update a schedule
router.post('/schedules', async (req, res) => {
    try {
        const { tagName, frequencyType, dayOfWeek, dayOfMonth, timeOfDay, biweeklyStartDate, isEnabled } = req.body;

        if (!tagName) {
            return res.status(400).json({ success: false, error: 'tagName is required' });
        }

        if (!frequencyType || !['weekly', 'biweekly', 'monthly'].includes(frequencyType)) {
            return res.status(400).json({ success: false, error: 'Valid frequencyType is required (weekly, biweekly, monthly)' });
        }

        // Validate based on frequency type
        if (frequencyType === 'weekly' && (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6)) {
            return res.status(400).json({ success: false, error: 'dayOfWeek (0-6) is required for weekly schedules' });
        }

        if (frequencyType === 'biweekly') {
            if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
                return res.status(400).json({ success: false, error: 'dayOfWeek (0-6) is required for biweekly schedules' });
            }
            // biweeklyStartDate is optional, defaults to '2026-01-19' in the model
        }

        if (frequencyType === 'monthly' && (dayOfMonth === undefined || dayOfMonth < 1 || dayOfMonth > 31)) {
            return res.status(400).json({ success: false, error: 'dayOfMonth (1-31) is required for monthly schedules' });
        }

        const schedule = await TagScheduleService.upsertSchedule(tagName, {
            frequencyType,
            dayOfWeek: frequencyType !== 'monthly' ? dayOfWeek : null,
            dayOfMonth: frequencyType === 'monthly' ? dayOfMonth : null,
            timeOfDay: timeOfDay || '09:00',
            biweeklyStartDate: frequencyType === 'biweekly' ? (biweeklyStartDate || '2026-01-19') : null,
            isEnabled: isEnabled !== false
        });

        res.json({ success: true, schedule, message: 'Schedule saved successfully' });
    } catch (error) {
        console.error('Error saving schedule:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a schedule
router.delete('/schedules/:tagName', async (req, res) => {
    try {
        const { tagName } = req.params;
        const deleted = await TagScheduleService.deleteSchedule(decodeURIComponent(tagName));
        if (deleted) {
            res.json({ success: true, message: 'Schedule deleted successfully' });
        } else {
            res.status(404).json({ success: false, error: 'Schedule not found' });
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// === Notification Routes ===

// Get all notifications (with optional status filter)
router.get('/notifications', async (req, res) => {
    try {
        const { status, limit } = req.query;
        const notifications = await TagScheduleService.getNotifications(
            status || null,
            parseInt(limit) || 50
        );
        const unreadCount = await TagScheduleService.getNotificationCount();
        res.json({ success: true, notifications, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get unread notification count
router.get('/notifications/count', async (req, res) => {
    try {
        const count = await TagScheduleService.getNotificationCount();
        res.json({ success: true, count });
    } catch (error) {
        console.error('Error fetching notification count:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark notification as read
router.put('/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await TagScheduleService.markNotificationRead(parseInt(id));
        if (notification) {
            res.json({ success: true, notification });
        } else {
            res.status(404).json({ success: false, error: 'Notification not found' });
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark notification as actioned (user clicked through to send emails)
router.put('/notifications/:id/action', async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await TagScheduleService.markNotificationActioned(parseInt(id));
        if (notification) {
            res.json({ success: true, notification });
        } else {
            res.status(404).json({ success: false, error: 'Notification not found' });
        }
    } catch (error) {
        console.error('Error marking notification as actioned:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dismiss a notification
router.put('/notifications/:id/dismiss', async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await TagScheduleService.dismissNotification(parseInt(id));
        if (notification) {
            res.json({ success: true, notification });
        } else {
            res.status(404).json({ success: false, error: 'Notification not found' });
        }
    } catch (error) {
        console.error('Error dismissing notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get listings for a specific tag (for when user clicks notification)
router.get('/listings-by-tag/:tagName', async (req, res) => {
    try {
        const { tagName } = req.params;
        const decodedTag = decodeURIComponent(tagName);

        const listings = await Listing.findAll({
            where: {
                isActive: true,
                tags: {
                    [Op.or]: [
                        { [Op.like]: decodedTag },
                        { [Op.like]: `${decodedTag},%` },
                        { [Op.like]: `%,${decodedTag}` },
                        { [Op.like]: `%,${decodedTag},%` }
                    ]
                }
            },
            order: [['displayName', 'ASC']]
        });

        res.json({
            success: true,
            tagName: decodedTag,
            count: listings.length,
            listings
        });
    } catch (error) {
        console.error('Error fetching listings by tag:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Manual trigger for testing (development only)
router.post('/trigger-check', async (req, res) => {
    try {
        await TagScheduleService.checkSchedules();
        res.json({ success: true, message: 'Schedule check triggered' });
    } catch (error) {
        console.error('Error triggering schedule check:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// === Period Config Routes ===

// Get all period configs (for all tags)
router.get('/period-configs', async (req, res) => {
    try {
        const configs = await TagScheduleService.getAllPeriodConfigs();
        res.json({ success: true, configs });
    } catch (error) {
        console.error('Error fetching period configs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update period config for a specific tag
router.put('/period-configs/:tagName', async (req, res) => {
    try {
        const { tagName } = req.params;
        const { periodDays, calculationType, templateId } = req.body;

        const config = await TagScheduleService.updatePeriodConfig(
            decodeURIComponent(tagName),
            { periodDays, calculationType, templateId }
        );

        res.json({
            success: true,
            config,
            message: 'Period config updated successfully'
        });
    } catch (error) {
        console.error('Error updating period config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// === Skip Dates Routes ===

// Get skip dates for a schedule
router.get('/schedules/:tagName/skip-dates', async (req, res) => {
    try {
        const { tagName } = req.params;
        const schedule = await TagScheduleService.getScheduleByTag(decodeURIComponent(tagName));
        if (schedule) {
            res.json({ success: true, skipDates: schedule.skipDates || [] });
        } else {
            res.status(404).json({ success: false, error: 'Schedule not found' });
        }
    } catch (error) {
        console.error('Error fetching skip dates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add a skip date
router.post('/schedules/:tagName/skip-dates', async (req, res) => {
    try {
        const { tagName } = req.params;
        const { date } = req.body;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ success: false, error: 'Valid date in YYYY-MM-DD format is required' });
        }

        const schedule = await TagScheduleService.getScheduleByTag(decodeURIComponent(tagName));
        if (!schedule) {
            return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        const skipDates = schedule.skipDates || [];
        if (!skipDates.includes(date)) {
            skipDates.push(date);
            skipDates.sort();
            await schedule.update({ skipDates });
        }

        res.json({ success: true, skipDates, message: `Skip date ${date} added` });
    } catch (error) {
        console.error('Error adding skip date:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove a skip date
router.delete('/schedules/:tagName/skip-dates/:date', async (req, res) => {
    try {
        const { tagName, date } = req.params;

        const schedule = await TagScheduleService.getScheduleByTag(decodeURIComponent(tagName));
        if (!schedule) {
            return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        const skipDates = (schedule.skipDates || []).filter(d => d !== date);
        await schedule.update({ skipDates });

        res.json({ success: true, skipDates, message: `Skip date ${date} removed` });
    } catch (error) {
        console.error('Error removing skip date:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update all skip dates (replace entire list)
router.put('/schedules/:tagName/skip-dates', async (req, res) => {
    try {
        const { tagName } = req.params;
        const { skipDates } = req.body;

        if (!Array.isArray(skipDates)) {
            return res.status(400).json({ success: false, error: 'skipDates must be an array' });
        }

        // Validate all dates
        for (const date of skipDates) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ success: false, error: `Invalid date format: ${date}. Use YYYY-MM-DD` });
            }
        }

        const schedule = await TagScheduleService.getScheduleByTag(decodeURIComponent(tagName));
        if (!schedule) {
            return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        const sortedDates = [...new Set(skipDates)].sort();
        await schedule.update({ skipDates: sortedDates });

        res.json({ success: true, skipDates: sortedDates, message: 'Skip dates updated' });
    } catch (error) {
        console.error('Error updating skip dates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
