const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const BackupService = require('../services/BackupService');

const BACKUP_DIR = path.join(__dirname, '../../backups');

// GET /api/backup/status — Full backup health dashboard data
router.get('/status', (req, res) => {
    try {
        // Local files
        const localFiles = [];
        if (fs.existsSync(BACKUP_DIR)) {
            const files = fs.readdirSync(BACKUP_DIR)
                .filter(f => f.startsWith('backup_'))
                .map(f => {
                    const stat = fs.statSync(path.join(BACKUP_DIR, f));
                    return {
                        name: f,
                        sizeMB: (stat.size / 1024 / 1024).toFixed(2),
                        sizeBytes: stat.size,
                        created: stat.mtime.toISOString()
                    };
                })
                .sort((a, b) => new Date(b.created) - new Date(a.created));
            localFiles.push(...files);
        }

        const pendingEmailCount = BackupService.history.filter(h => h.emailPending).length;

        res.json({
            success: true,
            status: BackupService.status,
            nextScheduled: BackupService.getNextScheduledTime(),
            diskUsage: BackupService.getDiskUsage(),
            pendingEmailCount,
            history: BackupService.history,
            localFiles,
            localFileCount: localFiles.length
        });
    } catch (error) {
        logger.logError(error, { context: 'BackupRoute', action: 'getStatus' });
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/backup/history — Just the history log
router.get('/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const history = BackupService.history.slice(offset, offset + limit);
        res.json({
            success: true,
            history,
            total: BackupService.history.length,
            limit,
            offset
        });
    } catch (error) {
        logger.logError(error, { context: 'BackupRoute', action: 'getHistory' });
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/backup/trigger — Manually trigger a backup
router.post('/trigger', async (req, res) => {
    try {
        logger.info('Manual backup triggered via API', { context: 'BackupRoute', user: req.user?.username });
        const result = await BackupService.runBackup(['manual']);
        res.json({ success: true, result });
    } catch (error) {
        logger.logError(error, { context: 'BackupRoute', action: 'triggerBackup' });
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/backup/download/:filename — Download a backup file
router.get('/download/:filename', (req, res) => {
    try {
        const { filename } = req.params;

        // Security: only allow backup_ prefixed files, no path traversal
        if (!filename.startsWith('backup_') || filename.includes('..') || filename.includes('/')) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }

        const filePath = path.join(BACKUP_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const stat = fs.statSync(filePath);
        logger.info(`Backup file downloaded: ${filename}`, {
            context: 'BackupRoute', action: 'download', user: req.user?.username, sizeMB: (stat.size / 1024 / 1024).toFixed(2)
        });

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stat.size);
        fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        logger.logError(error, { context: 'BackupRoute', action: 'download' });
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/backup/config — Get current backup configuration
router.get('/config', (req, res) => {
    try {
        res.json({ success: true, config: BackupService.getConfig() });
    } catch (error) {
        logger.logError(error, { context: 'BackupRoute', action: 'getConfig' });
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/backup/config — Update backup configuration
router.put('/config', async (req, res) => {
    try {
        const updated = await BackupService.updateConfig(req.body);
        logger.info('Backup config updated via API', { context: 'BackupRoute', user: req.user?.username });
        res.json({ success: true, config: updated });
    } catch (error) {
        logger.logError(error, { context: 'BackupRoute', action: 'updateConfig' });
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
