const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const ListingService = require('../services/ListingService');
const IncreaseService = require('../services/IncreaseService');
const { Listing } = require('../models');
const { encryptOptional, decryptOptional } = require('../utils/fieldEncryption');

const ListingGroup = require('../models/ListingGroup');
const { Statement } = require('../models');

const SAFE_PAYOUT_STATUSES = [null, 'failed', 'cancelled', 'awaiting_funding'];

/** Round to 2 decimal places to avoid floating-point drift in currency math */
const toCents = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
const payoutReceiptTemplate = require('../templates/emails/payoutReceipt');
const collectionInvoiceTemplate = require('../templates/emails/collectionInvoice');
const EmailService = require('../services/EmailService');

/**
 * Sample data for the receipt preview / test-email endpoints. Numbers are
 * recognizable as fake (round dollar amounts, "Sample Owner") so a misrouted
 * test cannot be confused with a real payout.
 */
function buildSampleReceiptParams() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtFull = (d) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    return {
        statementId: 'TEST-0001',
        payoutStatus: 'paid',
        propertyName: 'Sample Beach House',
        ownerName: 'Sample Owner',
        periodStart: fmtDate(monthStart),
        periodEnd: fmtDate(monthEnd),
        totalRevenue: 4500.00,
        pmCommission: 675.00,
        totalExpenses: 350.00,
        payoutAmount: 3475.00,
        wiseFee: 0.00,
        totalTransferAmount: 3475.00,
        transferId: 'ach_transfer_sample_preview_only',
        paidAtDate: fmtDate(now),
        paidAtFull: fmtFull(now),
    };
}

/**
 * Fire-and-forget: send the payout receipt email to the owner after a
 * successful Increase ACH transfer. Never throws or blocks the caller.
 */
function sendPayoutReceiptAsync(statement, transferId, payoutAmount, wiseFee, totalTransferAmount, paidAt) {
    (async () => {
        try {
            const listingId = statement.propertyId || (Array.isArray(statement.propertyIds) ? statement.propertyIds[0] : null);
            const listing = listingId ? await Listing.findByPk(listingId) : null;
            const recipientEmail = listing?.ownerEmail || null;
            await EmailService.sendPayoutReceiptEmail({
                statement, recipientEmail, transferId,
                payoutAmount, wiseFee, totalTransferAmount, paidAt,
            });
        } catch (e) {
            logger.warn(`Failed to send payout receipt for statement ${statement?.id}: ${e.message}`, { context: 'Payouts', action: 'receiptEmail' });
        }
    })();
}

/**
 * Detect Increase's "no such external_account" error so we can auto-clear the
 * stale id rather than letting the same payout fail repeatedly. Returns the
 * dangling external_account id when matched, otherwise null.
 */
function extractMissingExternalAccountId(error) {
    const data = error?.response?.data;
    if (!data || data.status !== 400) return null;
    const errors = Array.isArray(data.errors) ? data.errors : [];
    const match = errors.find((e) => e?.field === 'external_account' && /No resource of type external_account was found/i.test(e?.message || ''));
    if (!match) return null;
    const idMatch = /ID `([^`]+)`/i.exec(match.message);
    return idMatch ? idMatch[1] : 'unknown';
}

/**
 * Clear a stale wiseRecipientId from the listing or group it lives on so the
 * next attempt doesn't re-send the same dangling id to Increase.
 */
async function clearStaleRecipient(statement) {
    try {
        if (statement.groupId) {
            const group = await ListingGroup.findByPk(statement.groupId);
            if (group && group.wiseRecipientId) {
                await group.update({ wiseRecipientId: null, wiseStatus: 'missing' });
                return { entity: 'group', id: group.id };
            }
        }
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
        if (listingId) {
            const listing = await Listing.findByPk(listingId);
            if (listing) {
                if (listing.wiseRecipientId) {
                    await listing.update({ wiseRecipientId: null, wiseStatus: 'missing', payoutStatus: 'missing' });
                    return { entity: 'listing', id: listing.id };
                }
                // Listing has no recipient of its own but inherits one from its
                // group — that's the dangling id we just sent, so clear it on
                // the group instead.
                if (listing.groupId) {
                    const group = await ListingGroup.findByPk(listing.groupId);
                    if (group && group.wiseRecipientId) {
                        await group.update({ wiseRecipientId: null, wiseStatus: 'missing' });
                        return { entity: 'group', id: group.id };
                    }
                }
            }
        }
    } catch (e) {
        logger.warn('Failed to clear stale Increase recipient', { statementId: statement.id, error: e.message });
    }
    return null;
}

// Max length for the ACH statement_descriptor (shown as "Description" in the Increase
// dashboard, and—shortened by ACH/NACHA limits—on the recipient's bank statement).
// Increase accepts at least this many characters for ACH transfers.
const MAX_PAYOUT_DESCRIPTOR = 30;

/**
 * ACH-safe payout label — prefer the statement's display name / property over
 * the (often generic "Default") owner name so each payout is identifiable in
 * the Increase "Description" column. Strips characters outside the NACHA-safe
 * set (letters, digits, space, dash, period, hash).
 */
function statementPayoutLabel(statement) {
    const raw = statement.statementDisplayName || statement.propertyName || statement.ownerName || 'Owner';
    return String(raw).replace(/[^A-Za-z0-9 #.\-]/g, ' ').replace(/\s+/g, ' ').trim() || 'Owner';
}

/**
 * Build the ACH statement descriptor: "Payout #<statementId>". The property /
 * owner identity goes in the transfer's individual_name (see statementPayoutLabel);
 * Increase shows the dashboard "Description" as individual_name + this descriptor,
 * so keeping this short avoids duplicating the property name. The "#<id>" is
 * preserved for reconciliation.
 */
function buildPayoutDescriptor(statementId) {
    return `Payout #${statementId}`.slice(0, MAX_PAYOUT_DESCRIPTOR);
}

/**
 * Resolve the Increase external account ID for a statement.
 *
 * Priority order:
 *   1. Group-level recipient when the statement is a group statement.
 *   2. Listing's own recipient.
 *   3. Listing's group's recipient — when the listing is a member of a group
 *      with a verified recipient, single-listing statements inherit it.
 *      This matches what the Listings UI now shows ("Routed via group …")
 *      and how operators actually set things up: most owners only configure
 *      payout once on the group, not per child listing.
 *
 * Returns { wiseRecipientId, source, groupId?, listingId?, error? } so
 * callers don't have to re-derive which entity the recipient came from.
 */
async function resolveWiseRecipientId(statement) {
    // 1. Group statement → group recipient
    if (statement.groupId) {
        try {
            const group = await ListingGroup.findByPk(statement.groupId);
            if (group && group.wiseRecipientId) {
                return { wiseRecipientId: group.wiseRecipientId, source: 'group', groupId: statement.groupId };
            }
        } catch (e) {
            logger.warn('Failed to check group Increase recipient', { groupId: statement.groupId, error: e.message });
        }
    }

    const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
    if (!listingId) {
        return { wiseRecipientId: null, source: null, error: 'Statement has no associated listing' };
    }

    const listing = await Listing.findByPk(listingId);
    if (!listing) {
        return { wiseRecipientId: null, source: null, error: 'Listing not found' };
    }

    // 2. Listing's own recipient (model getter auto-decrypts)
    if (listing.wiseRecipientId) {
        return { wiseRecipientId: listing.wiseRecipientId, source: 'listing', listingId };
    }

    // 3. Inherited from listing's group
    if (listing.groupId) {
        try {
            const group = await ListingGroup.findByPk(listing.groupId);
            if (group && group.wiseRecipientId) {
                return { wiseRecipientId: group.wiseRecipientId, source: 'group', groupId: listing.groupId, listingId };
            }
        } catch (e) {
            logger.warn('Failed to check listing-group Increase recipient', { groupId: listing.groupId, error: e.message });
        }
    }

    return { wiseRecipientId: null, source: null, error: 'No Increase external account configured for this listing' };
}

// ─── POST /disconnect ────────────────────────────────────────
// Disconnect (remove) an Increase external account from a listing or group
router.post('/disconnect', async (req, res) => {
    try {
        const { entityType, entityId } = req.body;
        if (!['listing', 'group'].includes(entityType) || !entityId) {
            return res.status(400).json({ error: 'entityType (listing|group) and entityId are required' });
        }

        let entity;
        if (entityType === 'group') {
            entity = await ListingGroup.findByPk(parseInt(entityId));
        } else {
            entity = await Listing.findByPk(parseInt(entityId));
        }
        if (!entity) return res.status(404).json({ error: `${entityType} not found` });

        // Block disconnect if there are in-flight payouts referencing this entity.
        // Includes `awaiting_funding`: those statements are mid-funding-cycle and
        // will be promoted to `queued` once the ACH debit settles — disconnecting
        // the recipient now would strand them when reconciliation runs.
        const pendingFilter = entityType === 'group'
            ? { groupId: parseInt(entityId) }
            : { propertyId: parseInt(entityId) };
        const pendingCount = await Statement.count({
            where: { ...pendingFilter, payoutStatus: { [Op.in]: ['pending', 'queued', 'awaiting_funding'] } },
        });
        if (pendingCount > 0) {
            return res.status(409).json({
                error: `Cannot disconnect — ${pendingCount} payout(s) are currently in flight (pending, queued, or awaiting funding). Wait for them to complete first.`,
            });
        }

        const oldRecipientId = entity.wiseRecipientId;

        // Only archive in Increase if no OTHER entity shares this recipient ID.
        // wiseRecipientId is encrypted with a random IV so SQL equality won't work —
        // fetch all non-null rows and compare decrypted values in JS.
        if (oldRecipientId && IncreaseService.isConfigured()) {
            let shared = false;
            try {
                const allListings = await Listing.findAll({ where: { wiseRecipientId: { [Op.ne]: null } }, attributes: ['id', 'wiseRecipientId'] });
                const allGroups = await ListingGroup.findAll({ where: { wiseRecipientId: { [Op.ne]: null } }, attributes: ['id', 'wiseRecipientId'] });
                shared = allListings.some(l => l.wiseRecipientId === oldRecipientId && !(entityType === 'listing' && l.id === parseInt(entityId)))
                      || allGroups.some(g => g.wiseRecipientId === oldRecipientId && !(entityType === 'group' && g.id === parseInt(entityId)));
            } catch (e) {
                logger.warn('Could not check for shared recipients, skipping archive', { error: e.message });
                shared = true; // err on the safe side
            }

            if (!shared) {
                try {
                    await IncreaseService.archiveRecipient(oldRecipientId);
                    logger.info('Archived Increase external account', { entityType, entityId, recipientId: oldRecipientId });
                } catch (archiveErr) {
                    logger.warn('Could not archive Increase external account', { error: archiveErr.message });
                }
            } else {
                logger.info('Skipped archiving — recipient shared with other entities', { recipientId: oldRecipientId });
            }
        }

        // Clear payout fields on this entity only
        await entity.update({
            wiseRecipientId: null,
            wiseStatus: null,
            bankAccountHolder: null,
            bankEmail: null,
            bankRoutingNumber: null,
            bankAccountNumber: null,
            bankAccountType: null,
            bankAddress: null,
        });

        logger.info('Payout account disconnected', { entityType, entityId });
        res.json({ success: true, message: 'Payout account disconnected' });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'disconnect' });
        res.status(500).json({ error: 'Failed to disconnect payout account' });
    }
});

// ─── GET /config ─────────────────────────────────────────────
router.get('/config', async (req, res) => {
    res.json({
        wiseConfigured: IncreaseService.isConfigured(),
        increaseConfigured: IncreaseService.isConfigured(),
        fundingConfigured: IncreaseService.isFundingConfigured(),
    });
});

// ─── POST /generate-invite ──────────────────────────────────
// Generate an invite link for an owner to add their bank details
router.post('/generate-invite', async (req, res) => {
    try {
        const { entityType, entityId, email } = req.body;

        if (!['listing', 'group'].includes(entityType) || !entityId) {
            return res.status(400).json({ error: 'entityType (listing|group) and entityId are required' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3003}`;

        if (entityType === 'group') {
            const group = await ListingGroup.findByPk(parseInt(entityId));
            if (!group) return res.status(404).json({ error: 'Group not found' });
            await group.update({ payoutInviteToken: token, payoutInviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), wiseStatus: 'pending' });
        } else {
            const listing = await Listing.findByPk(parseInt(entityId));
            if (!listing) return res.status(404).json({ error: 'Listing not found' });
            await listing.update({ payoutInviteToken: token, payoutInviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), wiseStatus: 'pending' });
        }

        const inviteUrl = `${appUrl}/payout-setup/${token}`;

        logger.info('Payout invite generated', { entityType, entityId, inviteUrl });

        res.json({
            success: true,
            inviteUrl,
            token,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'generateInvite' });
        res.status(500).json({ error: 'Failed to generate invite link' });
    }
});

// ─── POST /refresh-status ───────────────────────────────────
// Check Increase recipient status
router.post('/refresh-status', async (req, res) => {
    try {
        const { wiseRecipientId, listingId, groupId } = req.body;

        if (!wiseRecipientId) {
            return res.status(400).json({ error: 'wiseRecipientId is required' });
        }

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const recipient = await IncreaseService.getRecipient(wiseRecipientId);
        const isActive = recipient.active !== false;
        const newStatus = isActive ? 'verified' : 'requires_action';

        // Update entity
        if (groupId) {
            const group = await ListingGroup.findByPk(parseInt(groupId));
            if (group) await group.update({ wiseStatus: newStatus });
        }
        if (listingId) {
            const listing = await Listing.findByPk(parseInt(listingId));
            if (listing) {
                await listing.update({ wiseStatus: newStatus });
            }
        }

        res.json({
            success: true,
            status: newStatus,
            recipientActive: isActive,
            recipientName: recipient.accountHolderName,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'refreshStatus' });
        res.status(500).json({ error: 'Failed to refresh payout status' });
    }
});

// ─── GET /listings/:id/status ───────────────────────────────
// ─── GET /recipients/:externalAccountId/check ────────────────
// Admin diagnostic: ask Increase whether a given external_account ID still exists.
// Useful when a transfer fails with "no resource of type external_account" and you
// want to confirm the account was archived/deleted on Increase's side.
router.get('/recipients/:externalAccountId/check', async (req, res) => {
    const externalAccountId = req.params.externalAccountId;
    if (!IncreaseService.isConfigured()) {
        return res.status(500).json({ error: 'Increase is not configured' });
    }
    try {
        const account = await IncreaseService.getRecipient(externalAccountId);
        return res.json({
            success: true,
            exists: true,
            externalAccountId,
            account: {
                id: account?.id,
                status: account?.status,
                description: account?.description,
                accountHolder: account?.account_holder,
                routingNumber: account?.routing_number,
                createdAt: account?.created_at,
                idempotencyKey: account?.idempotency_key,
            },
        });
    } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;
        if (status === 404 || status === 400) {
            return res.json({
                success: true,
                exists: false,
                externalAccountId,
                increaseStatus: status,
                detail: data?.detail || data?.title || error.message,
            });
        }
        logger.logError(error, { context: 'Payouts', action: 'checkRecipient', externalAccountId, increaseResponse: data });
        return res.status(500).json({ success: false, error: 'Failed to check recipient', detail: data?.detail || error.message });
    }
});

// ─── GET /receipt/preview ────────────────────────────────────
// Render the payout-receipt HTML with sample data and serve it directly so
// the team can review the in-browser layout. Does NOT send an email.
router.get('/receipt/preview', (req, res) => {
    try {
        const html = payoutReceiptTemplate(buildSampleReceiptParams());
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'receiptPreview' });
        return res.status(500).json({ error: 'Failed to render preview', detail: error.message });
    }
});

// ─── POST /receipt/test-email ────────────────────────────────
// Send the payout-receipt template to the requested address using sample
// data, so the team can verify how it renders in real email clients (Gmail,
// Outlook, etc.) without paying anyone.
router.post('/receipt/test-email', async (req, res) => {
    try {
        const { to } = req.body || {};
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
            return res.status(400).json({ error: 'A valid `to` email is required' });
        }

        const params = buildSampleReceiptParams();
        const html = payoutReceiptTemplate(params);
        const subject = `[TEST] Payout sent — $${params.payoutAmount.toFixed(2)} for ${params.propertyName}`;

        if (!EmailService.isConfigured) {
            return res.status(500).json({ error: 'SMTP is not configured on the server' });
        }

        const result = await EmailService.transporter.sendMail({
            from: `"Luxury Lodging" <${process.env.FROM_EMAIL || 'statements@luxurylodgingpm.com'}>`,
            to,
            subject,
            html,
        });

        logger.info('Test payout receipt sent', { to, messageId: result.messageId });
        return res.json({ success: true, to, messageId: result.messageId });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'receiptTestEmail' });
        return res.status(500).json({ error: 'Failed to send test email', detail: error.message });
    }
});

// ─── GET /statements/:id/verify-transfer ─────────────────────
// Fetches the live transfer status from Increase for a paid statement so
// the team can verify the payout actually happened without logging into
// the Increase dashboard.
router.get('/statements/:id/verify-transfer', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        const statement = await Statement.findByPk(statementId);
        if (!statement) return res.status(404).json({ error: 'Statement not found' });

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const storedId = statement.payoutTransferId;
        if (!storedId) {
            return res.status(400).json({ error: 'Statement has no payout transfer to verify' });
        }

        // Statements queued awaiting funding store the funding ACH debit ID as `funding:<id>`
        const isFundingTransfer = storedId.startsWith('funding:');
        const transferId = isFundingTransfer ? storedId.slice('funding:'.length) : storedId;

        const transfer = await IncreaseService.getTransfer(transferId);

        // Surface only the fields the UI needs — keep the response stable as
        // Increase adds new fields.
        res.json({
            success: true,
            statementId,
            payoutStatus: statement.payoutStatus,
            paidAt: statement.paidAt,
            isFundingTransfer,
            transfer: {
                id: transfer.id,
                status: transfer.status,
                amount: transfer.amount,
                currency: transfer.currency,
                statementDescriptor: transfer.statement_descriptor,
                companyEntryDescription: transfer.company_entry_description,
                individualName: transfer.individual_name,
                externalAccountId: transfer.external_account_id,
                routingNumber: transfer.routing_number,
                accountNumberLast4: transfer.account_number ? String(transfer.account_number).slice(-4) : null,
                effectiveDate: transfer.effective_date,
                network: transfer.network,
                createdAt: transfer.created_at,
                submission: transfer.submission || null,
                acknowledgement: transfer.acknowledgement || null,
                pendingTransactionId: transfer.pending_transaction_id || null,
                transactionId: transfer.transaction_id || null,
                return: transfer.return || null,
            },
        });
    } catch (error) {
        const data = error?.response?.data;
        logger.logError(error, { context: 'Payouts', action: 'verifyTransfer', increaseResponse: data });
        res.status(error?.response?.status === 404 ? 404 : 500).json({
            error: 'Failed to fetch transfer from Increase',
            detail: data?.detail || data?.title || error.message,
        });
    }
});

// ─── GET /statements/:id/recipient-preview ───────────────────
// Resolve the recipient that a payout would actually be sent to. Used by the
// pay-owner confirmation modal so the operator sees the bank account holder
// and last4 before triggering money movement, instead of a bare owner name
// that can read as "Default".
/**
 * Build the recipient-preview payload for a single statement. Handles both
 * group and listing recipients, falls back to encrypted bank fields if the
 * Increase API call fails, and surfaces a structured `error` when no
 * recipient is configured. Returned shape matches the single GET endpoint.
 */
async function buildRecipientPreview(statement) {
    const statementId = statement.id;
    const payoutAmount = parseFloat(statement.ownerPayout) || 0;
    const {
        wiseRecipientId,
        source,
        groupId: resolvedGroupId,
        listingId: resolvedListingId,
        error: resolveError,
    } = await resolveWiseRecipientId(statement);

    let sourceEntity = null;
    let sourceLabel = null;
    let bankFallback = { holder: null, last4: null, routing: null };

    if (source === 'group' && resolvedGroupId) {
        sourceEntity = await ListingGroup.findByPk(resolvedGroupId);
        if (sourceEntity) {
            // resolvedListingId is set when the recipient was inherited from
            // the listing's group (per-listing statement); flag the indirection
            // so the operator can see why the recipient differs from the
            // listed property.
            const inherited = !!resolvedListingId && !statement.groupId;
            sourceLabel = inherited
                ? `Group: ${sourceEntity.name} (inherited from listing's group)`
                : `Group: ${sourceEntity.name}`;
            bankFallback = {
                holder: sourceEntity.bankAccountHolder || null,
                last4: sourceEntity.bankAccountNumber ? String(sourceEntity.bankAccountNumber).slice(-4) : null,
                routing: sourceEntity.bankRoutingNumber || null,
            };
        }
    } else if (source === 'listing') {
        const listingId = resolvedListingId
            || statement.propertyId
            || (statement.propertyIds && statement.propertyIds[0]);
        sourceEntity = await Listing.findByPk(listingId);
        if (sourceEntity) {
            const label = sourceEntity.nickname || sourceEntity.displayName || sourceEntity.name;
            sourceLabel = `Listing: ${label}`;
            bankFallback = {
                holder: sourceEntity.bankAccountHolder || null,
                last4: sourceEntity.bankAccountNumber ? String(sourceEntity.bankAccountNumber).slice(-4) : null,
                routing: sourceEntity.bankRoutingNumber || null,
            };
        }
    }

    let propertyName = null;
    if (statement.groupId) {
        const grp = sourceEntity && sourceEntity.constructor && sourceEntity.constructor.name === 'ListingGroup'
            ? sourceEntity
            : await ListingGroup.findByPk(statement.groupId);
        if (grp) propertyName = grp.statementDisplayName || grp.name;
    } else {
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
        if (listingId) {
            const l = sourceEntity && sourceEntity.constructor && sourceEntity.constructor.name === 'Listing'
                ? sourceEntity
                : await Listing.findByPk(listingId);
            if (l) propertyName = l.statementDisplayName || l.nickname || l.displayName || l.name;
        }
    }

    if (!wiseRecipientId) {
        return {
            statementId,
            payoutAmount,
            ownerName: statement.ownerName || null,
            propertyName,
            source,
            sourceLabel,
            externalAccountId: null,
            holderName: bankFallback.holder,
            routingNumber: bankFallback.routing,
            accountNumberLast4: bankFallback.last4,
            increaseStatus: null,
            error: resolveError || 'No Increase external account configured',
        };
    }

    let increaseAccount = null;
    if (IncreaseService.isConfigured()) {
        try {
            increaseAccount = await IncreaseService.getRecipient(wiseRecipientId);
        } catch (e) {
            logger.warn('Failed to fetch Increase external_account for recipient preview', {
                statementId, externalAccountId: wiseRecipientId, error: e.message,
            });
        }
    }

    return {
        statementId,
        payoutAmount,
        ownerName: statement.ownerName || null,
        propertyName,
        source,
        sourceLabel,
        externalAccountId: wiseRecipientId,
        holderName: increaseAccount?.description || bankFallback.holder,
        routingNumber: increaseAccount?.routing_number || bankFallback.routing,
        accountNumberLast4: increaseAccount?.account_number
            ? String(increaseAccount.account_number).slice(-4)
            : bankFallback.last4,
        increaseStatus: increaseAccount?.status || null,
        funding: increaseAccount?.funding || null,
    };
}

router.get('/statements/:id/recipient-preview', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        const statement = await Statement.findByPk(statementId);
        if (!statement) return res.status(404).json({ error: 'Statement not found' });
        const preview = await buildRecipientPreview(statement);
        res.json({ success: true, ...preview });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'recipientPreview', statementId: req.params.id });
        res.status(500).json({ error: 'Failed to load recipient preview', detail: error.message });
    }
});

// ─── POST /statements/recipient-preview-bulk ──────────────────
// Resolve recipients for many statements at once. Used by the bulk-pay
// confirmation modal so the operator can scan every recipient (and catch
// e.g. a misrouted group) before pushing N transfers at once. Increase
// calls are issued in parallel — the response order matches the input.
router.post('/statements/recipient-preview-bulk', async (req, res) => {
    try {
        const { statementIds } = req.body;
        if (!Array.isArray(statementIds) || statementIds.length === 0) {
            return res.status(400).json({ error: 'statementIds array is required' });
        }
        const statements = await Statement.findAll({ where: { id: statementIds } });
        const byId = new Map(statements.map(s => [s.id, s]));

        const results = await Promise.all(statementIds.map(async (id) => {
            const stmt = byId.get(Number(id));
            if (!stmt) {
                return { statementId: Number(id), error: 'Statement not found' };
            }
            try {
                return await buildRecipientPreview(stmt);
            } catch (err) {
                logger.warn('buildRecipientPreview failed', { statementId: id, error: err.message });
                return {
                    statementId: stmt.id,
                    payoutAmount: parseFloat(stmt.ownerPayout) || 0,
                    ownerName: stmt.ownerName || null,
                    error: err.message || 'Failed to resolve recipient',
                };
            }
        }));

        res.json({ success: true, previews: results });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'recipientPreviewBulk' });
        res.status(500).json({ error: 'Failed to load bulk recipient preview', detail: error.message });
    }
});

router.get('/listings/:id/status', async (req, res) => {
    try {
        const listing = await Listing.findByPk(parseInt(req.params.id));
        if (!listing) return res.status(404).json({ error: 'Listing not found' });

        let recipientId = listing.wiseRecipientId;
        try { recipientId = decryptOptional(recipientId); } catch (e) { /* already plain */ }

        res.json({
            success: true,
            wiseRecipientId: recipientId,
            wiseStatus: listing.wiseStatus,
            payoutStatus: listing.payoutStatus,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'listingStatus' });
        res.status(500).json({ error: 'Failed to fetch listing status' });
    }
});

// Receipt route is handled in server.js (public, uses short-lived JWT token in query string)

// ─── POST /statements/:id/mark-paid ─────────────────────────
// Manually mark a statement as paid (admin use — for transfers done outside the app)
router.post('/statements/:id/mark-paid', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        const { transferId, wiseFee } = req.body;
        const statement = await Statement.findByPk(statementId);
        if (!statement) return res.status(404).json({ error: 'Statement not found' });

        const payoutAmount = parseFloat(statement.ownerPayout) || 0;
        const fee = parseFloat(wiseFee) || 0;

        // The endpoint is for transfers done outside the app — only valid on
        // rows that have no payout record yet. Allow null/failed/cancelled
        // and refuse anything else so we don't overwrite the original
        // payoutTransferId/paidAt for a real ACH transfer, race with an
        // in-flight one, or break the negative-balance/collection flow.
        const inFlightStatuses = new Set(['paid', 'pending', 'awaiting_funding', 'queued', 'collected', 'invoice_sent']);
        if (inFlightStatuses.has(statement.payoutStatus)) {
            return res.status(409).json({
                error: `Cannot mark-paid — statement has payoutStatus '${statement.payoutStatus}'. The existing record would be overwritten.`,
                payoutStatus: statement.payoutStatus,
            });
        }

        if (payoutAmount <= 0) {
            return res.status(400).json({
                error: `Cannot mark-paid — statement has non-positive owner payout ($${payoutAmount.toFixed(2)}). Use the collect flow for negative balances.`,
                ownerPayout: payoutAmount,
            });
        }

        await statement.update({
            payoutStatus: 'paid',
            payoutTransferId: transferId ? String(transferId) : null,
            paidAt: new Date(),
            wiseFee: fee,
            totalTransferAmount: payoutAmount + fee,
            payoutError: null,
        });

        logger.info('Statement manually marked as paid', { statementId, transferId, wiseFee: fee });
        res.json({ success: true, message: `Statement ${statementId} marked as paid` });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'markPaid' });
        res.status(500).json({ error: 'Failed to mark statement as paid' });
    }
});

// ─── POST /statements/:id/transfer ─────────────────────────
// Pay owner via Wise for a single statement
router.post('/statements/:id/transfer', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        logger.info(`[PAYOUT] Transfer requested for statement ${statementId}`, { context: 'Payouts', action: 'transfer' });
        const statement = await Statement.findByPk(statementId);

        if (!statement) return res.status(404).json({ error: 'Statement not found' });

        const payoutAmount = parseFloat(statement.ownerPayout) || 0;
        if (payoutAmount <= 0) {
            return res.status(400).json({ error: 'Statement has no positive payout amount' });
        }

        // Block any in-flight or settled state. `awaiting_funding` is the
        // critical addition — without it, a retry would pass through the atomic
        // claim (awaiting_funding is in SAFE_PAYOUT_STATUSES so concurrent
        // failures can be retried by reconciliation), then re-invoke
        // checkAndAutoFund, potentially creating a duplicate ACH funding debit
        // and overwriting the prior funding:<id> payoutTransferId. The right
        // path for a stuck awaiting_funding row is reconciliation, not retry.
        const blockingStatuses = ['paid', 'pending', 'awaiting_funding', 'queued', 'collected', 'invoice_sent'];
        if (blockingStatuses.includes(statement.payoutStatus)) {
            return res.status(400).json({ error: `Statement already ${statement.payoutStatus}` });
        }

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        // Resolve recipient
        const { wiseRecipientId, error: resolveError } = await resolveWiseRecipientId(statement);
        if (!wiseRecipientId) {
            return res.status(400).json({ error: resolveError || 'No Increase external account found' });
        }

        // Atomic mark as pending — prevents double-payout from concurrent requests
        const [affectedRows] = await Statement.update(
            { payoutStatus: 'pending', payoutError: null },
            { where: { id: statementId, payoutStatus: { [Op.or]: [{ [Op.in]: SAFE_PAYOUT_STATUSES }, { [Op.is]: null }] } } }
        );
        if (affectedRows === 0) {
            return res.status(409).json({ error: 'Statement is already being processed' });
        }

        // Check balance — auto-fund from business bank if insufficient
        const fundResult = await IncreaseService.checkAndAutoFund(payoutAmount);

        if (fundResult.funded) {
            // Funding ACH debit initiated — queue payout until funds arrive
            await statement.update({
                payoutStatus: 'awaiting_funding',
                payoutError: null,
                payoutTransferId: `funding:${fundResult.fundingTransferId}`,
            });
            logger.info('Payout queued awaiting funding', {
                statementId, balance: fundResult.balance,
                deficit: fundResult.deficit, fundingAmount: fundResult.fundingAmount,
            });
            return res.json({
                success: true,
                queued: true,
                awaitingFunding: true,
                message: `Insufficient balance ($${fundResult.balance.toFixed(2)}). Funding transfer of $${fundResult.fundingAmount.toFixed(2)} initiated from your business bank. Payout will process automatically when funds arrive.`,
                fundingTransferId: fundResult.fundingTransferId,
                balance: fundResult.balance,
                needed: payoutAmount,
            });
        }

        if (fundResult.balance !== null && fundResult.balance < payoutAmount && fundResult.error) {
            // No funding source configured and balance insufficient
            await statement.update({ payoutStatus: 'failed', payoutError: `Insufficient balance ($${fundResult.balance.toFixed(2)}, need $${payoutAmount.toFixed(2)})` });
            return res.status(400).json({
                error: `Insufficient Increase balance ($${fundResult.balance.toFixed(2)}, need $${payoutAmount.toFixed(2)}). Configure INCREASE_FUNDING_ACCOUNT_ID for auto-funding or manually fund your Increase account.`,
                balance: fundResult.balance,
                needed: payoutAmount,
            });
        }

        // Execute payout via ACH
        const ownerName = statement.ownerName || 'Owner';
        const reference = buildPayoutDescriptor(statementId);

        const { transfer, wiseFee } = await IncreaseService.sendPayout({
            recipientId: wiseRecipientId,
            amount: payoutAmount,
            reference,
            statementId,
            individualName: statementPayoutLabel(statement),
        });

        const totalTransferAmount = payoutAmount + wiseFee;

        const paidAt = new Date();
        await statement.update({
            payoutStatus: 'paid',
            payoutTransferId: transfer.id,
            paidAt,
            wiseFee: wiseFee,
            totalTransferAmount: totalTransferAmount,
            payoutError: null,
        });

        logger.info('Payout completed', { statementId, transferId: transfer.id, amount: payoutAmount });

        sendPayoutReceiptAsync(statement, transfer.id, payoutAmount, wiseFee, totalTransferAmount, paidAt);

        res.json({
            success: true,
            queued: false,
            message: 'Payout sent via ACH',
            transferId: transfer.id,
            ownerPayout: payoutAmount,
            wiseFee,
            totalTransferAmount,
            paidAt: paidAt.toISOString(),
        });
    } catch (error) {
        const staleId = extractMissingExternalAccountId(error);

        // Update statement with error + auto-clear dangling recipient if Increase
        // says the external_account doesn't exist anymore.
        let cleared = null;
        try {
            const statement = await Statement.findByPk(parseInt(req.params.id));
            if (statement) {
                if (staleId) {
                    cleared = await clearStaleRecipient(statement);
                    await statement.update({
                        payoutStatus: 'failed',
                        payoutError: `Increase external_account ${staleId} no longer exists. Cleared the stored recipient — re-register a payout account before retrying.`,
                    });
                } else if (statement.payoutStatus === 'pending') {
                    await statement.update({
                        payoutStatus: 'failed',
                        payoutError: error.response?.data?.detail || error.response?.data?.title || error.message || 'Increase transfer failed',
                    });
                }
            }
        } catch (e) {
            logger.warn('Failed to update statement status after payout error', { statementId: req.params.id, error: e.message });
        }

        logger.logError(error, {
            context: 'Payouts', action: 'transfer', statementId: req.params.id,
            wiseResponse: error.response?.data,
            wiseStatus: error.response?.status,
            staleExternalAccountId: staleId,
            clearedRecipient: cleared,
        });

        if (staleId) {
            return res.status(400).json({
                success: false,
                error: `Increase external_account ${staleId} no longer exists`,
                detail: cleared
                    ? `Cleared stale recipient from ${cleared.entity} #${cleared.id}. Re-register a payout account before retrying this statement.`
                    : 'Stored recipient ID was already absent. Re-register a payout account before retrying.',
                staleExternalAccountId: staleId,
            });
        }
        const msg = error.response?.data?.errors?.[0]?.message || error.response?.data?.message || error.message || 'Transfer failed';
        res.status(500).json({ error: msg });
    }
});

// ─── POST /statements/:id/collect ───────────────────────────
// For negative balance — generate payment page + send invoice with bank details
router.post('/statements/:id/collect', async (req, res) => {
    try {
        const statementId = parseInt(req.params.id);
        const statement = await Statement.findByPk(statementId);

        if (!statement) return res.status(404).json({ error: 'Statement not found' });

        const payoutAmount = parseFloat(statement.ownerPayout) || 0;
        if (payoutAmount >= 0) {
            return res.status(400).json({ error: 'Statement does not have a negative balance' });
        }

        // `invoice_sent` is the status set after a successful /collect. Without
        // blocking it here, a second call would mint a new token (overwriting
        // the prior one in payoutError so the original payment URL stops
        // working) and email the owner a duplicate invoice.
        if (['collected', 'paid', 'invoice_sent'].includes(statement.payoutStatus)) {
            return res.status(400).json({ error: `Already ${statement.payoutStatus}` });
        }

        const collectAmount = Math.abs(payoutAmount);

        // Generate a payment token for the collection page. The token is
        // committed to payoutError on success only — see the final update
        // below — so a request that errors mid-flight doesn't leave an active
        // token attached to a statement that wasn't actually invoiced.
        const paymentToken = crypto.randomBytes(32).toString('hex');

        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3003}`;
        const paymentPageUrl = `${appUrl}/pay/${paymentToken}`;

        // Look up owner email
        const listingId = statement.propertyId || (statement.propertyIds && statement.propertyIds[0]);
        let recipientEmail = null;
        if (listingId) {
            const listing = await Listing.findByPk(listingId);
            recipientEmail = listing?.ownerEmail || null;
        }

        // Get Increase bank details for the payment page
        let bankDetails = null;
        try {
            bankDetails = await IncreaseService.getAccountBankDetails();
        } catch (e) {
            logger.warn('Could not fetch Increase bank details', { error: e.message });
        }

        // Send invoice email with payment link and bank details
        let invoiceSent = false;
        if (recipientEmail && process.env.SENDGRID_API_KEY) {
            try {
                const sgMail = require('@sendgrid/mail');
                sgMail.setApiKey(process.env.SENDGRID_API_KEY);

                // Escape every value before splicing it into raw HTML — the
                // Increase API response is trusted but defensive escaping
                // costs nothing, and statement.ownerName comes from the app's
                // own user-controlled data.
                const escEmail = (s) => String(s == null ? '' : s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                const bankDetailsHtml = bankDetails && bankDetails.length > 0
                    ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
                        <p style="font-weight:600;margin:0 0 8px">Wire Transfer Details:</p>
                        <p style="margin:4px 0;font-family:monospace">Bank: ${escEmail(bankDetails[0].bankName) || 'N/A'}</p>
                        <p style="margin:4px 0;font-family:monospace">Routing: ${escEmail(bankDetails[0].routingNumber) || 'N/A'}</p>
                        <p style="margin:4px 0;font-family:monospace">Account: ${escEmail(bankDetails[0].accountNumber) || 'N/A'}</p>
                        <p style="margin:4px 0;font-size:12px;color:#6b7280">Reference: Statement #${statementId} - ${escEmail(statement.ownerName)}</p>
                    </div>`
                    : '';

                await sgMail.send({
                    to: recipientEmail,
                    from: process.env.SENDGRID_FROM_EMAIL || 'statements@luxurylodgingpm.com',
                    subject: `Balance Due: $${collectAmount.toFixed(2)} - ${statement.ownerName}`,
                    html: collectionInvoiceTemplate({
                        ownerName: statement.ownerName,
                        collectAmount,
                        paymentPageUrl,
                        bankDetailsHtml,
                        statementId,
                        startDate: statement.weekStartDate,
                        endDate: statement.weekEndDate,
                    }),
                });
                invoiceSent = true;
            } catch (emailErr) {
                logger.warn('Failed to send collection email', { error: emailErr.message });
            }
        }

        // Only stamp paidAt when the statement is actually settled. An
        // `invoice_sent` row means the owner has been asked to pay — the
        // money hasn't moved. Marking paidAt here would misrepresent state
        // in analytics, on the receipt page, and in the dashboard payout
        // status column. paidAt is set later when the payment is reconciled
        // (or when an admin manually marks the statement collected/paid).
        const settledNow = !invoiceSent;
        await statement.update({
            payoutStatus: invoiceSent ? 'invoice_sent' : 'collected',
            paidAt: settledNow ? new Date() : null,
            payoutError: `payment_token:${paymentToken}`,
        });

        res.json({
            success: true,
            message: invoiceSent ? 'Invoice sent to owner with payment details' : 'Marked as collected',
            collectAmount,
            invoiceSent,
            recipientEmail,
            paymentPageUrl,
            paidAt: settledNow ? new Date().toISOString() : null,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'collect', statementId: req.params.id });
        res.status(500).json({ error: error.message || 'Collection failed' });
    }
});

// ─── GET /bank-details ──────────────────────────────────────
// Get Increase bank details for receiving payments
router.get('/bank-details', async (req, res) => {
    try {
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }
        const details = await IncreaseService.getAccountBankDetails();
        res.json({ success: true, bankDetails: details });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'bankDetails' });
        res.status(500).json({ error: 'Failed to get bank details' });
    }
});

// ─── GET /inbound-transactions ──────────────────────────────
// Check for inbound payments (for reconciliation)
router.get('/inbound-transactions', async (req, res) => {
    try {
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const days = parseInt(req.query.days) || 30;
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

        const statementData = await IncreaseService.getBalanceStatement(start, end);

        // Filter for inbound (CREDIT) transactions
        const inbound = (statementData.transactions || []).filter(t => t.type === 'CREDIT');

        res.json({
            success: true,
            transactions: inbound,
            period: { start: start.toISOString(), end: end.toISOString() },
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'inboundTransactions' });
        res.status(500).json({ error: 'Failed to fetch inbound transactions' });
    }
});

// ─── POST /fund-and-queue ───────────────────────────────────
// Bulk pay multiple statements via Increase
router.post('/fund-and-queue', async (req, res) => {
    try {
        const { statementIds } = req.body;
        if (!statementIds || !Array.isArray(statementIds) || statementIds.length === 0) {
            return res.status(400).json({ error: 'statementIds array is required' });
        }

        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const statements = await Statement.findAll({
            where: { id: statementIds }
        });

        // Filter valid payouts
        const valid = [];
        const skipped = [];

        // Statuses that mean a transfer or funding is already in motion. Including
        // these in the skip set prevents (a) double-pay of a `pending` row and
        // (b) requesting a duplicate funding ACH debit for rows that are already
        // `awaiting_funding`. `collected` and `invoice_sent` are negative-payout
        // states that shouldn't reach this loop (amount <= 0 catches them) but
        // we list them here for safety.
        const IN_FLIGHT_STATUSES = new Set(['paid', 'pending', 'awaiting_funding', 'queued', 'collected', 'invoice_sent']);

        for (const stmt of statements) {
            const amount = parseFloat(stmt.ownerPayout) || 0;
            if (amount <= 0) {
                skipped.push({ id: stmt.id, reason: 'Non-positive payout' });
                continue;
            }
            if (IN_FLIGHT_STATUSES.has(stmt.payoutStatus)) {
                skipped.push({ id: stmt.id, reason: `Already ${stmt.payoutStatus}` });
                continue;
            }

            const { wiseRecipientId, error: resolveError } = await resolveWiseRecipientId(stmt);
            if (!wiseRecipientId) {
                skipped.push({ id: stmt.id, reason: resolveError || 'No Increase recipient' });
                continue;
            }

            valid.push({ statement: stmt, wiseRecipientId });
        }

        if (valid.length === 0) {
            return res.json({
                success: true,
                mode: 'none',
                processed: 0,
                failed: 0,
                skipped,
                message: 'No valid statements to process',
            });
        }

        // Check balance — auto-fund from business bank if insufficient
        const totalAmount = valid.reduce((sum, v) => sum + toCents(v.statement.ownerPayout), 0);
        const fundResult = await IncreaseService.checkAndAutoFund(totalAmount);

        if (fundResult.funded) {
            // Funding initiated — queue all payouts until funds arrive
            for (const { statement } of valid) {
                await statement.update({
                    payoutStatus: 'awaiting_funding',
                    payoutError: null,
                    payoutTransferId: `funding:${fundResult.fundingTransferId}`,
                });
            }
            logger.info('Bulk payouts queued awaiting funding', {
                count: valid.length, totalAmount,
                balance: fundResult.balance, fundingAmount: fundResult.fundingAmount,
            });
            return res.json({
                success: true,
                mode: 'awaiting_funding',
                awaitingFunding: true,
                message: `Insufficient balance ($${fundResult.balance.toFixed(2)}). Funding transfer of $${fundResult.fundingAmount.toFixed(2)} initiated. ${valid.length} payout(s) will process automatically when funds arrive.`,
                fundingTransferId: fundResult.fundingTransferId,
                queuedCount: valid.length,
                totalAmount,
                balance: fundResult.balance,
                skipped,
            });
        }

        if (fundResult.balance !== null && fundResult.balance < totalAmount && fundResult.error) {
            return res.status(400).json({
                error: `Insufficient Increase balance ($${fundResult.balance.toFixed(2)}, need $${totalAmount.toFixed(2)}). Configure INCREASE_FUNDING_ACCOUNT_ID for auto-funding or manually fund your Increase account.`,
                balance: fundResult.balance,
                needed: totalAmount,
            });
        }

        // Sufficient balance — process transfers one row at a time so each
        // success is committed to the DB before we attempt the next. This
        // prevents the partial-batch failure mode where Increase had created
        // some transfers but the caller couldn't tell which, and a fallback
        // path then re-sent them under a different idempotency key.
        let processed = 0;
        let failed = 0;
        const results = [];

        for (const { statement, wiseRecipientId } of valid) {
            // Atomic claim — skip if a concurrent request already grabbed this row.
            const [claimedRows] = await Statement.update(
                { payoutStatus: 'pending', payoutError: null },
                { where: { id: statement.id, payoutStatus: { [Op.or]: [{ [Op.in]: SAFE_PAYOUT_STATUSES }, { [Op.is]: null }] } } }
            );
            if (claimedRows === 0) {
                skipped.push({ id: statement.id, reason: 'Already being processed' });
                continue;
            }

            try {
                const amount = parseFloat(statement.ownerPayout);
                const reference = buildPayoutDescriptor(statement.id);

                const { transfer, wiseFee } = await IncreaseService.sendPayout({
                    recipientId: wiseRecipientId,
                    amount,
                    reference,
                    statementId: statement.id,
                    individualName: statementPayoutLabel(statement),
                });

                const paidAt = new Date();
                const totalTransferAmount = amount + wiseFee;
                await statement.update({
                    payoutStatus: 'paid',
                    payoutTransferId: transfer.id,
                    paidAt,
                    wiseFee,
                    totalTransferAmount,
                    payoutError: null,
                });
                sendPayoutReceiptAsync(statement, transfer.id, amount, wiseFee, totalTransferAmount, paidAt);

                processed++;
                results.push({ id: statement.id, success: true, transferId: transfer.id });
            } catch (err) {
                failed++;
                const errorMsg = err.response?.data?.message || err.message || 'Transfer failed';
                await statement.update({ payoutStatus: 'failed', payoutError: errorMsg });
                results.push({ id: statement.id, success: false, error: errorMsg });
                logger.logError(err, { context: 'Payouts', action: 'bulkTransfer', statementId: statement.id });
            }
        }

        res.json({
            success: true,
            mode: 'immediate',
            processed,
            failed,
            totalPayout: totalAmount,
            skipped,
            results,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'fundAndQueue' });
        res.status(500).json({ error: error.message || 'Bulk payout failed' });
    }
});

// ─── POST /process-queued ─────────────────────────────────
// Process all queued payouts (called manually or by scheduler)
router.post('/process-queued', async (req, res) => {
    try {
        const result = await processQueuedPayouts();
        res.json(result);
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'processQueued' });
        res.status(500).json({ error: error.message || 'Failed to process queued payouts' });
    }
});

// ─── GET /balance ──────────────────────────────────────────
router.get('/balance', async (req, res) => {
    try {
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }
        const balance = await IncreaseService.getBalance();
        const queuedCount = await Statement.count({ where: { payoutStatus: 'queued' } });
        const queuedTotal = queuedCount > 0
            ? (await Statement.sum('ownerPayout', { where: { payoutStatus: 'queued' } })) || 0
            : 0;

        res.json({
            success: true,
            balance,
            queuedCount,
            queuedTotal,
            canProcessQueued: balance >= queuedTotal && queuedCount > 0,
        });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'getBalance' });
        res.status(500).json({ error: 'Failed to get balance' });
    }
});

// ─── POST /fund ────────────────────────────────────────────
// Admin: manually pull funds from the business bank into Increase (ACH debit)
// to top up the balance so awaiting_funding / queued payouts can clear. The
// fixed auto-replenish ($5,000) can't be reused same-day (idempotency key is
// keyed on amount+date), so this takes an explicit amount.
router.post('/fund', async (req, res) => {
    try {
        if (!IncreaseService.isFundingConfigured()) {
            return res.status(400).json({ error: 'Funding source not configured (set INCREASE_FUNDING_ACCOUNT_ID)' });
        }
        const amount = parseFloat(req.body?.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'A positive `amount` (in dollars) is required' });
        }
        if (amount > 50000) {
            return res.status(400).json({ error: 'Amount exceeds the $50,000 manual-funding cap' });
        }
        // Large pulls require a system user. admin/editor can top up routine
        // amounts, but anything above this threshold must be authorized by a
        // system-level account so a single operator can't move large sums.
        const SYSTEM_APPROVAL_THRESHOLD = 15000;
        const isSystemUser = req.user?.isSystemUser === true || req.user?.role === 'system';
        if (amount > SYSTEM_APPROVAL_THRESHOLD && !isSystemUser) {
            return res.status(403).json({
                error: `Funding pulls over $${SYSTEM_APPROVAL_THRESHOLD.toLocaleString()} require system-user approval.`,
                threshold: SYSTEM_APPROVAL_THRESHOLD,
                requested: amount,
            });
        }
        const transfer = await IncreaseService.requestFunding(amount);
        logger.info('Manual funding pull initiated', { amount, transferId: transfer.id, status: transfer.status });
        return res.json({ success: true, transferId: transfer.id, amount, status: transfer.status });
    } catch (error) {
        const data = error?.response?.data;
        logger.logError(error, { context: 'Payouts', action: 'manualFund', increaseResponse: data });
        return res.status(500).json({ error: 'Funding pull failed', detail: data?.detail || data?.title || error.message });
    }
});

// ─── GET /reconcile ──────────────────────────────────────────
// Check Increase transfer statuses and update statements accordingly (admin-only)
router.get('/reconcile', async (req, res) => {
    try {
        logger.info('[RECONCILE] Starting reconciliation cycle', { context: 'Payouts', action: 'reconcile' });
        if (!IncreaseService.isConfigured()) {
            return res.status(500).json({ error: 'Increase is not configured' });
        }

        const reconciliationService = require('../services/ReconciliationService');
        const result = await reconciliationService.runFullReconciliation();

        // If any awaiting_funding were promoted to queued, process them immediately
        let queuedResult = { processed: 0, failed: 0 };
        if (result.funding?.promoted > 0) {
            queuedResult = await processQueuedPayouts();
        }

        logger.info('Reconciliation completed', { ...result, queued: queuedResult });
        res.json({ success: true, ...result, queued: queuedResult });
    } catch (error) {
        logger.logError(error, { context: 'Payouts', action: 'reconcile' });
        res.status(500).json({ error: 'Reconciliation failed' });
    }
});

/**
 * Process all queued payout transfers.
 * Checks balance, and if sufficient, processes all queued statements.
 */
async function processQueuedPayouts() {
    if (!IncreaseService.isConfigured()) {
        logger.warn('Increase not configured, cannot process queued payouts');
        return { success: false, error: 'Increase not configured' };
    }

    // Only fetch rows that the per-row atomic claim below will actually match.
    // `awaiting_funding` rows must first be promoted to `queued` by
    // ReconciliationService.processAwaitingFunding once the funding ACH
    // settles — including them here would silently skip them at claim time.
    const queued = await Statement.findAll({
        where: { payoutStatus: 'queued' },
        order: [['created_at', 'ASC']],
    });

    if (queued.length === 0) {
        logger.info('No queued payouts to process');
        return { success: true, processed: 0, failed: 0 };
    }

    const totalNeeded = queued.reduce((sum, s) => sum + toCents(s.ownerPayout), 0);
    const balance = await IncreaseService.getBalance();

    if (balance < totalNeeded) {
        logger.warn('Insufficient Increase balance for queued payouts', { balance, totalNeeded, queuedCount: queued.length });
        return { success: false, error: 'Insufficient balance', balance, totalNeeded };
    }

    let processed = 0;
    let failed = 0;

    for (const statement of queued) {
        try {
            // Atomic claim — skip if status changed since we queried
            const [claimedRows] = await Statement.update(
                { payoutStatus: 'pending', payoutError: null },
                { where: { id: statement.id, payoutStatus: 'queued' } }
            );
            if (claimedRows === 0) continue;

            const payoutAmount = parseFloat(statement.ownerPayout);
            if (payoutAmount <= 0) {
                await statement.update({ payoutStatus: 'failed', payoutError: 'Payout amount not positive' });
                failed++;
                continue;
            }

            const { wiseRecipientId } = await resolveWiseRecipientId(statement);
            if (!wiseRecipientId) {
                await statement.update({ payoutStatus: 'failed', payoutError: 'No Increase external account found' });
                failed++;
                continue;
            }

            const reference = buildPayoutDescriptor(statement.id);
            const { transfer, wiseFee } = await IncreaseService.sendPayout({
                recipientId: wiseRecipientId,
                amount: payoutAmount,
                reference,
                statementId: statement.id,
                individualName: statementPayoutLabel(statement),
            });

            const paidAt = new Date();
            const totalTransferAmount = payoutAmount + wiseFee;
            await statement.update({
                payoutStatus: 'paid',
                payoutTransferId: transfer.id,
                paidAt,
                payoutError: null,
                wiseFee,
                totalTransferAmount,
            });
            sendPayoutReceiptAsync(statement, transfer.id, payoutAmount, wiseFee, totalTransferAmount, paidAt);
            processed++;
            logger.info('Queued payout processed', { statementId: statement.id, transferId: transfer.id });
        } catch (err) {
            failed++;
            const errorMsg = err.response?.data?.message || err.message || 'Transfer failed';
            await statement.update({ payoutStatus: 'failed', payoutError: errorMsg });
            logger.logError(err, { context: 'Payouts', action: 'processQueued', statementId: statement.id });
        }
    }

    logger.info('Queued payouts processing complete', { processed, failed });
    return { success: true, processed, failed };
}

module.exports = router;
module.exports.processQueuedPayouts = processQueuedPayouts;
