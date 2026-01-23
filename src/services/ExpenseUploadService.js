/**
 * Service for handling expense file uploads and parsing
 * Supports CSV and Excel files, converts them to standardized JSON format
 * Now saves to DATABASE instead of JSON files
 */

const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { createReadStream } = require('fs');
const DatabaseService = require('./DatabaseService');
const logger = require('../utils/logger');

class ExpenseUploadService {
    constructor() {
        this.uploadsDir = path.join(process.cwd(), 'uploads', 'expenses');
        this.ensureUploadDirectory();
    }

    async ensureUploadDirectory() {
        try {
            await fs.access(this.uploadsDir);
        } catch (error) {
            await fs.mkdir(this.uploadsDir, { recursive: true });
        }
    }

    /**
     * Parse uploaded file and convert to standardized expense format
     * @param {string} filePath - Path to uploaded file
     * @param {string} originalName - Original filename
     * @returns {Promise<Array>} - Array of parsed expenses
     */
    async parseExpenseFile(filePath, originalName) {
        const fileExtension = path.extname(originalName).toLowerCase();
        
        try {
            let expenses = [];
            
            if (fileExtension === '.csv') {
                expenses = await this.parseCSV(filePath);
            } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
                expenses = await this.parseExcel(filePath);
            } else {
                throw new Error(`Unsupported file format: ${fileExtension}. Please upload CSV or Excel files.`);
            }

            // Validate and standardize the parsed data
            const standardizedExpenses = expenses.map((expense, index) => this.standardizeExpense(expense, index, originalName));

            logger.info(`Parsed ${standardizedExpenses.length} expenses from ${originalName}`, { context: 'ExpenseUploadService', action: 'parseExpenseFile' });
            return standardizedExpenses;

        } catch (error) {
            logger.logError(error, { context: 'ExpenseUploadService', action: 'parseExpenseFile', filename: originalName });
            throw error;
        }
    }

    /**
     * Parse CSV file
     * @param {string} filePath - Path to CSV file
     * @returns {Promise<Array>} - Array of parsed rows
     */
    async parseCSV(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            
            createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    /**
     * Parse Excel file
     * @param {string} filePath - Path to Excel file
     * @returns {Promise<Array>} - Array of parsed rows
     */
    async parseExcel(filePath) {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Use first sheet
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON with header row as keys
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        return jsonData;
    }

    /**
     * Standardize expense data to match our internal format
     * @param {Object} rawExpense - Raw expense data from file
     * @param {number} index - Row index for error reporting
     * @param {string} filename - Source filename
     * @returns {Object} - Standardized expense object
     */
    standardizeExpense(rawExpense, index, filename) {
        // Common field mappings (case-insensitive)
        const fieldMappings = {
            // Date fields
            date: ['date', 'expense_date', 'expensedate', 'transaction_date', 'transactiondate', 'dateadded', 'date_added'],
            // Description fields
            description: ['description', 'desc', 'expense_description', 'expensedescription', 'item', 'expense_item'],
            // Amount fields
            amount: ['amount', 'expense_amount', 'expenseamount', 'cost', 'price', 'total', 'expense_total'],
            // Category fields
            category: ['category', 'type', 'expense_type', 'expensetype', 'categories'],
            // Vendor fields
            vendor: ['vendor', 'supplier', 'contractor', 'contractorname', 'contractor_name', 'company'],
            // Property/Listing fields
            listing: ['listing', 'property', 'listing_name', 'listingname', 'property_name', 'propertyname'],
            // Property ID fields
            propertyId: ['property_id', 'propertyid', 'listing_id', 'listingid']
        };

        const standardized = {
            id: `upload_${filename}_${index}`,
            type: 'expense',
            source: 'upload',
            uploadedFile: filename,
            uploadedAt: new Date().toISOString()
        };

        // Map fields using case-insensitive matching
        Object.keys(fieldMappings).forEach(standardField => {
            const possibleFields = fieldMappings[standardField];
            const rawKeys = Object.keys(rawExpense);
            
            for (const possibleField of possibleFields) {
                const matchingKey = rawKeys.find(key => 
                    key.toLowerCase().trim() === possibleField.toLowerCase()
                );
                
                if (matchingKey && rawExpense[matchingKey] !== undefined && rawExpense[matchingKey] !== '') {
                    standardized[standardField] = rawExpense[matchingKey];
                    break;
                }
            }
        });

        // Required field validation and defaults
        if (!standardized.date) {
            throw new Error(`Row ${index + 1}: Missing required 'date' field. Expected columns: ${fieldMappings.date.join(', ')}`);
        }

        if (!standardized.description) {
            throw new Error(`Row ${index + 1}: Missing required 'description' field. Expected columns: ${fieldMappings.description.join(', ')}`);
        }

        if (!standardized.amount) {
            throw new Error(`Row ${index + 1}: Missing required 'amount' field. Expected columns: ${fieldMappings.amount.join(', ')}`);
        }

        // Clean and validate data
        standardized.date = this.parseDate(standardized.date);
        standardized.amount = this.parseAmount(standardized.amount);
        standardized.description = String(standardized.description).trim();
        standardized.category = standardized.category ? String(standardized.category).trim() : 'General';
        standardized.vendor = standardized.vendor ? String(standardized.vendor).trim() : null;
        standardized.listing = standardized.listing ? String(standardized.listing).trim() : null;
        standardized.propertyId = standardized.propertyId ? parseInt(standardized.propertyId) : null;

        return standardized;
    }

    /**
     * Parse date string to YYYY-MM-DD format
     * @param {string} dateStr - Date string in various formats
     * @returns {string} - Standardized date string
     */
    parseDate(dateStr) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format: ${dateStr}. Please use formats like MM/DD/YYYY, YYYY-MM-DD, etc.`);
        }
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    /**
     * Parse amount string to number
     * @param {string|number} amountStr - Amount as string or number
     * @returns {number} - Parsed amount
     */
    parseAmount(amountStr) {
        // Remove currency symbols and commas
        const cleanAmount = String(amountStr).replace(/[$,\s]/g, '');
        const amount = parseFloat(cleanAmount);
        
        if (isNaN(amount)) {
            throw new Error(`Invalid amount format: ${amountStr}. Please use numeric values like 123.45 or $123.45`);
        }
        
        // Preserve original sign - expenses are negative, upsells are positive
        return amount;
    }

    /**
     * Save parsed expenses to JSON file
     * @param {Array} expenses - Array of standardized expenses
     * @param {string} originalFilename - Original uploaded filename
     * @returns {Promise<string>} - Path to saved JSON file
     */
    /**
     * Save expenses to DATABASE (replaced saveExpensesToJSON)
     * @param {Array} expenses - Array of expense objects
     * @param {string} originalFilename - Original uploaded filename
     * @returns {Promise<Array>} - Saved expense records
     */
    async saveExpensesToDatabase(expenses, originalFilename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const uploadFilename = `${path.parse(originalFilename).name}_${timestamp}`;

        // Add upload metadata to each expense
        const expensesWithMetadata = expenses.map(expense => ({
            ...expense,
            uploadFilename,
            source: 'manual'
        }));

        // Save to database
        const savedExpenses = await DatabaseService.saveUploadedExpenses(expensesWithMetadata);
        logger.info(`Saved ${savedExpenses.length} expenses to database with filename: ${uploadFilename}`, { context: 'ExpenseUploadService', action: 'saveExpensesToDatabase' });

        return savedExpenses;
    }

    // Keep old method for backward compatibility (redirects to new method)
    async saveExpensesToJSON(expenses, originalFilename) {
        return await this.saveExpensesToDatabase(expenses, originalFilename);
    }

    /**
     * Get all uploaded expenses from DATABASE (replaced file reading)
     * @returns {Promise<Array>} - Array of uploaded expense data
     */
    async getAllUploadedExpenses() {
        try {
            const expenses = await DatabaseService.getUploadedExpenses();
            logger.debug(`Loaded ${expenses.length} uploaded expenses from database`, { context: 'ExpenseUploadService', action: 'getAllUploadedExpenses' });
            return expenses;
        } catch (error) {
            logger.warn(`Error fetching uploaded expenses from database: ${error.message}`, { context: 'ExpenseUploadService', action: 'getAllUploadedExpenses' });
            return [];
        }
    }

    /**
     * Get unique upload filenames from database
     * @returns {Promise<Array>} - Array of unique filenames
     */
    async getUploadFilenames() {
        try {
            return await DatabaseService.getUploadFilenames();
        } catch (error) {
            logger.warn(`Error fetching upload filenames: ${error.message}`, { context: 'ExpenseUploadService', action: 'getUploadFilenames' });
            return [];
        }
    }

    /**
     * Delete expenses by upload filename
     * @param {string} filename - Upload filename to delete
     * @returns {Promise<number>} - Number of deleted expenses
     */
    async deleteExpensesByFilename(filename) {
        try {
            const count = await DatabaseService.deleteUploadedExpensesByFilename(filename);
            logger.info(`Deleted ${count} expenses with filename: ${filename}`, { context: 'ExpenseUploadService', action: 'deleteExpensesByFilename' });
            return count;
        } catch (error) {
            logger.logError(error, { context: 'ExpenseUploadService', action: 'deleteExpensesByFilename', filename });
            throw error;
        }
    }

    /**
     * Detect potential duplicates between different expense sources
     * @param {Array} expenses1 - First set of expenses
     * @param {Array} expenses2 - Second set of expenses
     * @returns {Array} - Array of potential duplicate pairs
     */
    detectDuplicates(expenses1, expenses2) {
        const duplicates = [];
        const tolerance = 0.01; // $0.01 tolerance for amount comparison
        const dateTolerance = 1; // 1 day tolerance for date comparison

        expenses1.forEach(expense1 => {
            expenses2.forEach(expense2 => {
                // Skip if same source
                if (expense1.source === expense2.source && expense1.id === expense2.id) {
                    return;
                }

                const amountMatch = Math.abs(expense1.amount - expense2.amount) <= tolerance;
                const dateMatch = Math.abs(new Date(expense1.date) - new Date(expense2.date)) <= (dateTolerance * 24 * 60 * 60 * 1000);
                const descriptionMatch = expense1.description.toLowerCase().includes(expense2.description.toLowerCase()) ||
                                      expense2.description.toLowerCase().includes(expense1.description.toLowerCase());

                if (amountMatch && dateMatch && descriptionMatch) {
                    duplicates.push({
                        expense1: {
                            id: expense1.id,
                            source: expense1.source,
                            date: expense1.date,
                            amount: expense1.amount,
                            description: expense1.description,
                            uploadFile: expense1.uploadFile || expense1.uploadedFile
                        },
                        expense2: {
                            id: expense2.id,
                            source: expense2.source,
                            date: expense2.date,
                            amount: expense2.amount,
                            description: expense2.description,
                            uploadFile: expense2.uploadFile || expense2.uploadedFile
                        },
                        confidence: 'high'
                    });
                }
            });
        });

        return duplicates;
    }

    /**
     * Clean up uploaded files (remove original uploaded files, keep JSON)
     * @param {string} filePath - Path to original uploaded file
     */
    async cleanupUploadedFile(filePath) {
        try {
            await fs.unlink(filePath);
            logger.debug(`Cleaned up original uploaded file: ${path.basename(filePath)}`, { context: 'ExpenseUploadService', action: 'cleanupUploadedFile' });
        } catch (error) {
            logger.warn(`Failed to cleanup file ${filePath}: ${error.message}`, { context: 'ExpenseUploadService', action: 'cleanupUploadedFile' });
        }
    }
}

module.exports = new ExpenseUploadService();
