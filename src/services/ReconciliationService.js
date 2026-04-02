const logger = require('../utils/logger');
const IncreaseService = require('./IncreaseService');
const { Statement } = require('../models');
const { Op } = require('sequelize');

class ReconciliationService {
    /**
     * Check all statements with payoutStatus='paid' and a sandbox/real transfer ID.
     * Update status if the transfer was returned, rejected, or completed.
     */
    /**
     * Parse a payoutTransferId which may be prefixed with method:
     * e.g. "ach:ach_transfer_xyz" or legacy "ach_transfer_xyz"
     */
    _parseTransferId(payoutTransferId) {
        if (!payoutTransferId) return { method: null, transferId: null };
        // Skip funding references — they aren't payout transfers
        if (payoutTransferId.startsWith('funding:')) return { method: 'funding', transferId: null };
        if (payoutTransferId.startsWith('ach:')) return { method: 'ach', transferId: payoutTransferId.slice(4) };
        // Legacy format (no prefix) — assume ACH
        return { method: 'ach', transferId: payoutTransferId };
    }

    async reconcileTransfers() {
        // Find statements with transfer IDs that need checking
        const statements = await Statement.findAll({
            where: {
                payoutTransferId: { [Op.ne]: null },
                payoutStatus: { [Op.in]: ['paid', 'pending'] },
            },
            attributes: ['id', 'payoutTransferId', 'payoutStatus', 'propertyName'],
            limit: 50,
        });

        if (statements.length === 0) return { checked: 0, updated: 0 };

        let updated = 0;
        for (const stmt of statements) {
            try {
                const { method, transferId } = this._parseTransferId(stmt.payoutTransferId);
                if (!transferId) continue; // skip funding or invalid

                const transfer = await IncreaseService.getTransfer(transferId);
                const newStatus = this._mapTransferStatus(transfer.status);

                if (newStatus && newStatus !== stmt.payoutStatus) {
                    const errorMsg = transfer.status === 'returned'
                        ? `ACH returned: ${transfer.return_reason || 'unknown'}`
                        : (transfer.status === 'rejected' || transfer.status === 'canceled')
                            ? `ACH ${transfer.status}: ${transfer.rejection?.reason || transfer.cancellation?.reason || 'unknown'}`
                            : null;
                    await stmt.update({
                        payoutStatus: newStatus,
                        payoutError: errorMsg,
                    });
                    updated++;
                    logger.info('Reconciliation updated statement', {
                        statementId: stmt.id,
                        transferId: stmt.payoutTransferId,
                        method,
                        oldStatus: stmt.payoutStatus,
                        newStatus,
                        transferStatus: transfer.status,
                    });
                }
            } catch (err) {
                // Transfer not found or API error — log but don't fail
                logger.warn('Reconciliation check failed for statement', {
                    statementId: stmt.id,
                    transferId: stmt.payoutTransferId,
                    error: err.message,
                });
            }
        }

        return { checked: statements.length, updated };
    }

    /**
     * Process statements stuck in 'awaiting_funding' — check if balance is now
     * sufficient and promote them to queued so processQueuedPayouts picks them up.
     */
    async processAwaitingFunding() {
        const awaiting = await Statement.findAll({
            where: { payoutStatus: 'awaiting_funding' },
            order: [['created_at', 'ASC']],
            limit: 50,
        });

        if (awaiting.length === 0) return { awaitingChecked: 0, promoted: 0 };

        let balance;
        try {
            balance = await IncreaseService.getBalance();
        } catch (e) {
            logger.warn('Cannot check balance for awaiting_funding reconciliation', { error: e.message });
            return { awaitingChecked: awaiting.length, promoted: 0, error: 'Balance check failed' };
        }

        const totalNeeded = awaiting.reduce((sum, s) => sum + (parseFloat(s.ownerPayout) || 0), 0);

        if (balance < totalNeeded) {
            logger.info('Awaiting funding: balance still insufficient', { balance, totalNeeded, count: awaiting.length });
            return { awaitingChecked: awaiting.length, promoted: 0, balance, totalNeeded };
        }

        // Balance is sufficient — promote to 'queued' so processQueuedPayouts handles them
        let promoted = 0;
        for (const stmt of awaiting) {
            try {
                await stmt.update({ payoutStatus: 'queued', payoutError: null });
                promoted++;
                logger.info('Promoted awaiting_funding to queued', { statementId: stmt.id });
            } catch (e) {
                logger.warn('Failed to promote awaiting_funding statement', { statementId: stmt.id, error: e.message });
            }
        }

        return { awaitingChecked: awaiting.length, promoted, balance };
    }

    _mapTransferStatus(increaseStatus) {
        switch (increaseStatus) {
            case 'submitted':
            case 'pending_submission':
            case 'pending_approval':
                return 'paid'; // still in progress
            case 'complete':
                return 'paid'; // confirmed complete
            case 'returned':
            case 'rejected':
                return 'failed'; // ACH returned/rejected
            case 'canceled':
                return 'failed';
            default:
                return null; // unknown — don't change
        }
    }

    /**
     * Full reconciliation cycle: check transfers, process awaiting_funding,
     * and proactively replenish balance if below threshold.
     */
    async runFullReconciliation() {
        const transferResult = await this.reconcileTransfers();
        const fundingResult = await this.processAwaitingFunding();

        // Proactive replenish — keep balance above threshold
        let replenishResult = null;
        try {
            replenishResult = await IncreaseService.checkAndReplenish();
        } catch (e) {
            logger.warn('Auto-replenish check failed during reconciliation', { error: e.message });
        }

        return { transfers: transferResult, funding: fundingResult, replenish: replenishResult };
    }
}

module.exports = new ReconciliationService();
