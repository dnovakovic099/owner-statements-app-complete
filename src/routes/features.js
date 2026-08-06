/**
 * Feature flags API.
 *
 * GET  /api/features          — any authenticated user. The frontend calls this
 *                               on boot so it can hide a disabled feature on the
 *                               first paint instead of flashing it.
 * PUT  /api/features/payouts  — admin/system only. Flips the payout master
 *                               switch and records who did it.
 *
 * Auth is applied at the mount point in server.js; the write route re-checks the
 * role itself because flipping payouts back on re-enables real money movement.
 */

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const { ActivityLog } = require('../models');
const { isPayoutsEnabled, setPayoutsEnabled } = require('../utils/featureFlags');

router.get('/', async (req, res) => {
    try {
        res.json({ payoutsEnabled: await isPayoutsEnabled() });
    } catch (error) {
        logger.logError(error, { context: 'Features', action: 'getFeatures' });
        res.status(500).json({ error: 'Failed to read feature flags' });
    }
});

router.put('/payouts', async (req, res) => {
    try {
        const isPrivileged = req.user?.isSystemUser || req.user?.role === 'admin' || req.user?.role === 'system';
        if (!isPrivileged) {
            return res.status(403).json({ error: 'Only an administrator can change the payout feature' });
        }

        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'Body must include "enabled" as a boolean' });
        }

        const previous = await isPayoutsEnabled();
        const value = await setPayoutsEnabled(enabled);

        if (previous !== value) {
            await ActivityLog.log(
                req,
                value ? 'enable' : 'disable',
                'feature',
                'payouts',
                { feature: 'payouts', previous, next: value }
            );
        }

        res.json({ payoutsEnabled: value, changed: previous !== value });
    } catch (error) {
        logger.logError(error, { context: 'Features', action: 'setPayoutsEnabled' });
        res.status(500).json({ error: 'Failed to update the payout feature' });
    }
});

module.exports = router;
