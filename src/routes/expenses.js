/**
 * Expense upload and management routes
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const ExpenseUploadService = require('../services/ExpenseUploadService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
        try {
            await fs.access(uploadDir);
        } catch (error) {
            await fs.mkdir(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${sanitizedName}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.csv', '.xlsx', '.xls'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file format: ${fileExtension}. Please upload CSV or Excel files.`), false);
        }
    }
});

// POST /api/expenses/upload - Upload expense file
router.post('/upload', upload.single('expenseFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded. Please select a CSV or Excel file.'
            });
        }

        logger.info('Processing uploaded expense file', { context: 'Expenses', filename: req.file.originalname });
        
        // Parse the uploaded file
        const expenses = await ExpenseUploadService.parseExpenseFile(req.file.path, req.file.originalname);
        
        if (expenses.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid expenses found in the uploaded file. Please check the file format and required columns.'
            });
        }

        // Save parsed expenses to DATABASE
        const savedExpenses = await ExpenseUploadService.saveExpensesToDatabase(expenses, req.file.originalname);
        
        // Clean up the temporary uploaded file
        await ExpenseUploadService.cleanupUploadedFile(req.file.path);
        
        res.json({
            success: true,
            message: `Successfully uploaded and processed ${expenses.length} expenses to database`,
            data: {
                totalExpenses: expenses.length,
                filename: req.file.originalname,
                savedCount: savedExpenses.length,
                expenses: savedExpenses.slice(0, 5) // Return first 5 expenses as preview
            }
        });

    } catch (error) {
        logger.logError(error, { context: 'Expenses', action: 'uploadExpenses' });

        // Clean up temp file on error
        if (req.file && req.file.path) {
            try {
                await ExpenseUploadService.cleanupUploadedFile(req.file.path);
            } catch (cleanupError) {
                logger.warn('Failed to cleanup temp file', { context: 'Expenses', error: cleanupError.message });
            }
        }

        res.status(400).json({
            success: false,
            error: error.message || 'Failed to process uploaded file'
        });
    }
});

// GET /api/expenses/uploaded - Get all uploaded expenses
router.get('/uploaded', async (req, res) => {
    try {
        const expenses = await ExpenseUploadService.getAllUploadedExpenses();
        
        // Group by upload file for better organization
        const groupedExpenses = expenses.reduce((acc, expense) => {
            const fileName = expense.uploadFile || 'unknown';
            if (!acc[fileName]) {
                acc[fileName] = {
                    fileName,
                    uploadedAt: expense.uploadedAt,
                    expenses: []
                };
            }
            acc[fileName].expenses.push(expense);
            return acc;
        }, {});

                    res.json({
            success: true,
            data: {
                totalExpenses: expenses.length,
                totalFiles: Object.keys(groupedExpenses).length,
                files: Object.values(groupedExpenses)
            }
        });

    } catch (error) {
        logger.logError(error, { context: 'Expenses', action: 'fetchUploadedExpenses' });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch uploaded expenses'
        });
    }
});

// GET /api/expenses/duplicates - Check for duplicates across all sources
router.get('/duplicates', async (req, res) => {
    try {
        const { startDate, endDate, propertyId } = req.query;
        
        // Get all expenses from all sources
        const FileDataService = require('../services/FileDataService');
        const allExpenses = await FileDataService.getExpenses(startDate, endDate, propertyId);
        
        res.json({
            success: true,
            data: {
                totalExpenses: allExpenses.length,
                duplicateWarnings: allExpenses.duplicateWarnings || [],
                duplicateCount: (allExpenses.duplicateWarnings || []).length
            }
        });

    } catch (error) {
        logger.logError(error, { context: 'Expenses', action: 'checkDuplicates' });
        res.status(500).json({
            success: false,
            error: 'Failed to check for duplicates'
        });
    }
});

// DELETE /api/expenses/uploaded/:filename - Delete uploaded expense file
router.delete('/uploaded/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(process.cwd(), 'uploads', 'expenses', filename);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'Expense file not found'
            });
        }
        
        // Delete the file
        await fs.unlink(filePath);
        logger.info('Deleted uploaded expense file', { context: 'Expenses', filename });

        res.json({
            success: true,
            message: `Successfully deleted expense file: ${filename}`
        });

    } catch (error) {
        logger.logError(error, { context: 'Expenses', action: 'deleteExpenseFile' });
        res.status(500).json({
            success: false,
            error: 'Failed to delete expense file'
        });
    }
});

// GET /api/expenses/template - Download CSV template for expense uploads
router.get('/template', (req, res) => {
    const csvTemplate = `date,description,amount,category,vendor,listing,property_id
2024-01-15,Pool Maintenance,150.00,Maintenance,Pool Service Co,Property Name,170031
2024-01-16,Cleaning Supplies,45.50,Supplies,Home Depot,Property Name,170031
2024-01-17,Lawn Care,75.00,Landscaping,Green Thumb Lawn,Property Name,170031`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="expense_template.csv"');
    res.send(csvTemplate);
});

module.exports = router;
