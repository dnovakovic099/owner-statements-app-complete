const logger = require('../utils/logger');
const IncreaseService = require('./IncreaseService');
const { Statement } = require('../models');
const { Op } = require('sequelize');

class ReconciliationService {
    /**
     * Check all statements with payoutStatus='paid' and a sandbox/real transfer ID.
     * Update status if the transfer was returned, rejected, or completed.
     */
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
                const transfer = await IncreaseService.getTransfer(stmt.payoutTransferId);
                const newStatus = this._mapTransferStatus(transfer.status);

                if (newStatus && newStatus !== stmt.payoutStatus) {
                    await stmt.update({
                        payoutStatus: newStatus,
                        payoutError: transfer.status === 'returned' ? `ACH returned: ${transfer.return_reason || 'unknown'}` : null,
                    });
                    updated++;
                    logger.info('Reconciliation updated statement', {
                        statementId: stmt.id,
                        transferId: stmt.payoutTransferId,
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
}

module.exports = new ReconciliationService();
