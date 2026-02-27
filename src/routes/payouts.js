const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const logger = require('../utils/logger');
const ListingService = require('../services/ListingService');
const { Listing } = require('../models');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

const ListingGroup = require('../models/ListingGroup');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
// Use default API version from account; explicit version here caused invalid version errors.
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

/**
 * Resolve the Stripe account ID for a statement.
 * Priority: group Stripe account > individual listing Stripe account
 */
async function resolveStripeAccountId(statement) {
    // Check group-level Stripe account first (if statement belongs to a group)
    if (statement.groupId) {
        try {
            const group = await ListingGroup.findByPk(statement.groupId);
            if (group && group.stripeAccountId) {
                return { stripeAccountId: group.stripeAccountId, source: 'group' };
            }
        } catch (e) {
            logger.warn('Failed to check group Stripe account', { groupId: statement.groupId, error: e.message });
        }
    }

    // Fall back to individual listing Stripe account
    const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
    if (!listingId) {
        return { stripeAccountId: null, source: null, error: 'Statement has no associated listing' };
    }

    const listing = await Listing.findByPk(listingId);
    if (!listing) {
        return { stripeAccountId: null, source: null, error: 'Listing not found' };
    }

    let stripeAccountId = listing.stripeAccountId;
    try {
        stripeAccountId = decryptOptional(stripeAccountId);
    } catch (e) {
        stripeAccountId = null;
    }

    return { stripeAccountId: stripeAccountId || null, source: stripeAccountId ? 'listing' : null };
}

const getBaseReturnUrl = () => {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
};

const ensureStripe = (res) => {
    if (!stripe) {
        res.status(500).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
        return false;
    }
    return true;
};

// Check which payout features are available based on env config
router.get('/config', (req, res) => {
    res.json({
        stripeConfigured: !!stripeSecretKey,
        connectOAuthEnabled: !!process.env.STRIPE_CONNECT_CLIENT_ID,
    });
});

// Create a new Stripe Connect Express account for a listing or group and generate onboarding link
router.post('/connect/create', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const { email, businessType, entityType, entityId } = req.body;

        if (!email || !businessType || !entityType || !entityId) {
            return res.status(400).json({ error: 'email, businessType, entityType, and entityId are required' });
        }

        if (!['individual', 'company'].includes(businessType)) {
            return res.status(400).json({ error: 'businessType must be "individual" or "company"' });
        }

        if (!['listing', 'group'].includes(entityType)) {
            return res.status(400).json({ error: 'entityType must be "listing" or "group"' });
        }

        // Look up entity and check it doesn't already have an account
        let entity;
        if (entityType === 'group') {
            entity = await ListingGroup.findByPk(parseInt(entityId, 10));
            if (!entity) return res.status(404).json({ error: 'Group not found' });
            if (entity.stripeAccountId) {
                return res.status(409).json({ error: 'This group already has a Stripe account. Use resend link instead.' });
            }
        } else {
            entity = await Listing.findByPk(parseInt(entityId, 10));
            if (!entity) return res.status(404).json({ error: 'Listing not found' });
            let existingId = entity.stripeAccountId;
            try { existingId = decryptOptional(existingId); } catch (e) { existingId = null; }
            if (existingId) {
                return res.status(409).json({ error: 'This listing already has a Stripe account. Use resend link instead.' });
            }
        }

        // Create Stripe Connect Express account
        const account = await stripe.accounts.create({
            type: 'express',
            email: email.trim(),
            business_type: businessType,
            capabilities: {
                transfers: { requested: true },
            },
        });

        // Save account ID to entity
        if (entityType === 'group') {
            // ListingGroup model setter handles encryption automatically
            await entity.update({ stripeAccountId: account.id, stripeOnboardingStatus: 'pending' });
        } else {
            // Listing requires manual encryption at route level
            await entity.update({ stripeAccountId: encryptOptional(account.id), stripeOnboardingStatus: 'pending' });
        }

        // Generate onboarding link
        const baseUrl = getBaseReturnUrl();
        const refreshUrl = process.env.STRIPE_ONBOARDING_REFRESH_URL || `${baseUrl}/payout-onboarding/refresh`;
        const returnUrl = process.env.STRIPE_ONBOARDING_RETURN_URL || `${baseUrl}/payout-onboarding/complete`;

        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
        });

        logger.info(`Created Stripe Connect account ${account.id} for ${entityType} ${entityId}`, { context: 'Payouts', action: 'connectCreate' });

        res.json({
            success: true,
            stripeAccountId: account.id,
            onboardingUrl: accountLink.url,
            status: 'pending'
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'connectCreate' });
        res.status(500).json({ error: error.message || 'Failed to create Stripe Connect account' });
    }
});

// Regenerate onboarding link for an existing Stripe Connect account
router.post('/connect/onboarding-link', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const { stripeAccountId } = req.body;

        if (!stripeAccountId) {
            return res.status(400).json({ error: 'stripeAccountId is required' });
        }

        const baseUrl = getBaseReturnUrl();
        const refreshUrl = process.env.STRIPE_ONBOARDING_REFRESH_URL || `${baseUrl}/payout-onboarding/refresh`;
        const returnUrl = process.env.STRIPE_ONBOARDING_RETURN_URL || `${baseUrl}/payout-onboarding/complete`;

        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
        });

        res.json({
            success: true,
            onboardingUrl: accountLink.url
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'connectOnboardingLink' });
        res.status(500).json({ error: error.message || 'Failed to generate onboarding link' });
    }
});

// Create or reuse a Connect account and generate onboarding link for a listing/owner
router.post('/listings/:id/onboarding-link', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const listingId = parseInt(req.params.id, 10);
        const listing = await Listing.findByPk(listingId);
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        let stripeAccountId = listing.stripeAccountId;
        try {
            stripeAccountId = decryptOptional(stripeAccountId);
        } catch (e) {
            stripeAccountId = null;
        }

        // Require pre-created Stripe account ID (client must enter it manually)
        if (!stripeAccountId) {
            return res.status(400).json({
                error: 'No Stripe account configured. Enter the Stripe Account ID first in the listing settings.'
            });
        }

        const baseUrl = getBaseReturnUrl();
        const refreshUrl = process.env.STRIPE_ONBOARDING_REFRESH_URL || `${baseUrl}/payout-onboarding/refresh`;
        const returnUrl = process.env.STRIPE_ONBOARDING_RETURN_URL || `${baseUrl}/payout-onboarding/complete`;

        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding'
        });

        // Update status to pending when onboarding link is generated
        if (listing.stripeOnboardingStatus === 'missing') {
            await listing.update({ stripeOnboardingStatus: 'pending' });
        }

        res.json({
            success: true,
            url: accountLink.url,
            stripeAccountId,
            status: listing.stripeOnboardingStatus === 'missing' ? 'pending' : listing.stripeOnboardingStatus
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'createOnboardingLink', listingId: req.params.id });
        res.status(500).json({ error: 'Failed to create onboarding link' });
    }
});

// Get current onboarding/payout status for a listing
router.get('/listings/:id/status', async (req, res) => {
    try {
        const listingId = parseInt(req.params.id, 10);
        const listing = await Listing.findByPk(listingId);
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        res.json({
            success: true,
            status: listing.stripeOnboardingStatus || 'missing',
            payoutStatus: listing.payoutStatus || 'missing',
            stripeAccountId: listing.stripeAccountId ? '[configured]' : null
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'getStatus', listingId: req.params.id });
        res.status(500).json({ error: 'Failed to get payout status' });
    }
});

// Refresh Stripe onboarding status by querying Stripe API for a specific account ID
// Updates the status on both listing and group level
router.post('/refresh-status', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const { stripeAccountId, listingId, groupId } = req.body;

        if (!stripeAccountId) {
            return res.status(400).json({ error: 'stripeAccountId is required' });
        }

        // Query Stripe for the real account status
        const account = await stripe.accounts.retrieve(stripeAccountId);

        // Determine status from Stripe's response
        let newStatus = 'pending';
        if (account.charges_enabled && account.payouts_enabled) {
            newStatus = 'verified';
        } else if (account.requirements?.disabled_reason) {
            newStatus = 'requires_action';
        } else if (account.details_submitted) {
            newStatus = 'pending';
        } else {
            newStatus = 'pending';
        }

        // Update listing if provided
        if (listingId) {
            const listing = await Listing.findByPk(parseInt(listingId, 10));
            if (listing && listing.stripeAccountId) {
                await listing.update({ stripeOnboardingStatus: newStatus });
            }
        }

        // Update group if provided
        if (groupId) {
            const group = await ListingGroup.findByPk(parseInt(groupId, 10));
            if (group && group.stripeAccountId) {
                await group.update({ stripeOnboardingStatus: newStatus });
            }
        }

        res.json({
            success: true,
            stripeAccountId,
            status: newStatus,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            disabledReason: account.requirements?.disabled_reason || null,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'refreshStatus' });
        res.status(500).json({ error: error.message || 'Failed to refresh Stripe status' });
    }
});

// Generate Stripe Connect OAuth link for an owner to connect their existing Stripe account
router.post('/connect/oauth-link', async (req, res) => {
    try {
        const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
        if (!clientId) {
            return res.status(500).json({ error: 'STRIPE_CONNECT_CLIENT_ID is not configured' });
        }

        const { email, entityType, entityId } = req.body;

        if (!entityType || !entityId) {
            return res.status(400).json({ error: 'entityType and entityId are required' });
        }
        if (!['listing', 'group'].includes(entityType)) {
            return res.status(400).json({ error: 'entityType must be "listing" or "group"' });
        }

        // Validate entity exists and doesn't already have an account
        let entity;
        if (entityType === 'group') {
            entity = await ListingGroup.findByPk(parseInt(entityId, 10));
        } else {
            entity = await Listing.findByPk(parseInt(entityId, 10));
        }
        if (!entity) {
            return res.status(404).json({ error: `${entityType} not found` });
        }

        let existingId = entity.stripeAccountId;
        if (entityType === 'listing') {
            try { existingId = decryptOptional(existingId); } catch (e) { existingId = null; }
        }
        if (existingId) {
            return res.status(409).json({ error: 'This entity already has a Stripe account connected' });
        }

        // Encode entity info into state parameter
        const state = Buffer.from(JSON.stringify({ entityType, entityId: parseInt(entityId, 10) })).toString('base64url');

        const baseUrl = getBaseReturnUrl();
        const redirectUri = `${baseUrl}/api/connect/callback`;

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            scope: 'read_write',
            redirect_uri: redirectUri,
            state,
        });
        if (email) {
            params.set('stripe_user[email]', email);
        }

        const oauthUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

        res.json({ success: true, oauthUrl });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'generateOAuthLink' });
        res.status(500).json({ error: error.message || 'Failed to generate OAuth link' });
    }
});

// Transfer statement payout to listing's connected Stripe account
router.post('/statements/:id/transfer', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const statementId = parseInt(req.params.id, 10);
        const { Statement, Listing } = require('../models');

        const statement = await Statement.findByPk(statementId);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Validate payout amount
        const payoutAmount = parseFloat(statement.ownerPayout);
        if (payoutAmount <= 0) {
            return res.status(400).json({ error: 'Cannot transfer: payout amount must be positive' });
        }

        // Already paid?
        if (statement.payoutStatus === 'paid') {
            return res.status(400).json({
                error: 'Statement already paid',
                transferId: statement.payoutTransferId,
                paidAt: statement.paidAt
            });
        }

        // Resolve Stripe account (group-level takes priority over listing-level)
        const resolved = await resolveStripeAccountId(statement);
        if (resolved.error) {
            return res.status(400).json({ error: resolved.error });
        }
        if (!resolved.stripeAccountId) {
            return res.status(400).json({ error: 'No connected Stripe account (checked group and listing)' });
        }
        const stripeAccountId = resolved.stripeAccountId;
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);

        // Mark as pending before attempting transfer
        await statement.update({ payoutStatus: 'pending', payoutError: null });

        // Calculate Stripe Connect fee (0.25%) and add on top of payout
        const STRIPE_FEE_PERCENT = 0.0025; // 0.25%
        const stripeFee = Math.round(payoutAmount * STRIPE_FEE_PERCENT * 100) / 100; // Round to 2 decimals
        const totalTransferAmount = payoutAmount + stripeFee;

        // Create Stripe transfer
        // Amount is in cents for Stripe
        const amountInCents = Math.round(totalTransferAmount * 100);

        const transfer = await stripe.transfers.create({
            amount: amountInCents,
            currency: 'usd',
            destination: stripeAccountId,
            description: `Payout for statement #${statementId} - ${statement.propertyName || 'Property ' + listingId}`,
            metadata: {
                statementId: statementId.toString(),
                listingId: listingId.toString(),
                ownerName: statement.ownerName,
                periodStart: statement.weekStartDate,
                periodEnd: statement.weekEndDate,
                ownerPayout: payoutAmount.toString(),
                stripeFee: stripeFee.toString(),
                totalTransfer: totalTransferAmount.toString()
            }
        });

        // Update statement with success and fee info
        await statement.update({
            payoutStatus: 'paid',
            payoutTransferId: transfer.id,
            paidAt: new Date(),
            payoutError: null,
            stripeFee: stripeFee,
            totalTransferAmount: totalTransferAmount
        });

        logger.info('Payout transfer successful', {
            statementId,
            transferId: transfer.id,
            ownerPayout: payoutAmount,
            stripeFee,
            totalTransferAmount,
            destination: stripeAccountId
        });

        res.json({
            success: true,
            message: 'Payout transfer completed',
            transferId: transfer.id,
            ownerPayout: payoutAmount,
            stripeFee,
            totalTransferAmount,
            paidAt: new Date()
        });

    } catch (error) {
        // Update statement with failure
        try {
            const { Statement } = require('../models');
            const statement = await Statement.findByPk(parseInt(req.params.id, 10));
            if (statement) {
                await statement.update({
                    payoutStatus: 'failed',
                    payoutError: error.message
                });
            }
        } catch (updateError) {
            logger.error('Failed to update statement after transfer error', { error: updateError.message });
        }

        logger.logError(error, { context: 'Payouts', action: 'transferToOwner', statementId: req.params.id });
        res.status(500).json({ error: error.message || 'Failed to transfer payout' });
    }
});

// Collect payment from owner for negative balance statements
// Uses Stripe Connect to debit the connected account's balance
router.post('/statements/:id/collect', async (req, res) => {
    if (!ensureStripe(res)) return;
    try {
        const statementId = parseInt(req.params.id, 10);
        const { Statement, Listing } = require('../models');

        const statement = await Statement.findByPk(statementId);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        const payoutAmount = parseFloat(statement.ownerPayout);
        if (payoutAmount >= 0) {
            return res.status(400).json({ error: 'Cannot collect: payout amount is not negative. Use transfer instead.' });
        }

        if (statement.payoutStatus === 'paid' || statement.payoutStatus === 'collected') {
            return res.status(400).json({
                error: 'Statement already settled',
                transferId: statement.payoutTransferId,
                paidAt: statement.paidAt
            });
        }

        // Resolve Stripe account (group-level takes priority over listing-level)
        const resolved = await resolveStripeAccountId(statement);
        if (resolved.error) {
            return res.status(400).json({ error: resolved.error });
        }
        if (!resolved.stripeAccountId) {
            return res.status(400).json({ error: 'No connected Stripe account (checked group and listing)' });
        }
        const stripeAccountId = resolved.stripeAccountId;
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);

        await statement.update({ payoutStatus: 'pending', payoutError: null });

        const collectAmount = Math.abs(payoutAmount);
        const amountInCents = Math.round(collectAmount * 100);

        // Pull funds from connected account back to platform
        const charge = await stripe.charges.create({
            amount: amountInCents,
            currency: 'usd',
            source: stripeAccountId,
            description: `Collection for statement #${statementId} - ${statement.propertyName || 'Property ' + (listingId || '')} (owner balance due)`,
            metadata: {
                statementId: statementId.toString(),
                listingId: (listingId || '').toString(),
                ownerName: statement.ownerName,
                periodStart: statement.weekStartDate,
                periodEnd: statement.weekEndDate,
                collectAmount: collectAmount.toString(),
                type: 'collection'
            }
        });

        await statement.update({
            payoutStatus: 'collected',
            payoutTransferId: charge.id,
            paidAt: new Date(),
            payoutError: null,
            stripeFee: 0,
            totalTransferAmount: -collectAmount
        });

        logger.info('Payment collection successful', {
            statementId,
            chargeId: charge.id,
            collectAmount,
            source: stripeAccountId
        });

        res.json({
            success: true,
            message: 'Payment collected from owner',
            transferId: charge.id,
            collectAmount,
            paidAt: new Date()
        });

    } catch (error) {
        try {
            const { Statement } = require('../models');
            const statement = await Statement.findByPk(parseInt(req.params.id, 10));
            if (statement) {
                await statement.update({
                    payoutStatus: 'failed',
                    payoutError: error.message
                });
            }
        } catch (updateError) {
            logger.error('Failed to update statement after collection error', { error: updateError.message });
        }

        logger.logError(error, { context: 'Payouts', action: 'collectFromOwner', statementId: req.params.id });
        res.status(500).json({ error: error.message || 'Failed to collect payment' });
    }
});

module.exports = router;
