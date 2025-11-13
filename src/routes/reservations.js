/**
 * Reservation import and management routes
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

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
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (fileExtension === '.csv') {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file format: ${fileExtension}. Please upload CSV files.`), false);
        }
    }
});

// GET /api/reservations/template - Download CSV template
router.get('/template', async (req, res) => {
    try {
        const templatePath = path.join(process.cwd(), 'uploads', 'temp', `reservation_template_${Date.now()}.csv`);
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(templatePath), { recursive: true });
        
        const csvWriter = createObjectCsvWriter({
            path: templatePath,
            header: [
                { id: 'guestName', title: 'Guest Name' },
                { id: 'guestEmail', title: 'Guest Email' },
                { id: 'checkInDate', title: 'Check-in Date (YYYY-MM-DD)' },
                { id: 'checkOutDate', title: 'Check-out Date (YYYY-MM-DD)' },
                { id: 'nights', title: 'Nights' },
                { id: 'baseRate', title: 'Base Rate' },
                { id: 'cleaningFee', title: 'Cleaning Fee' },
                { id: 'petsFee', title: 'Pets Fee' },
                { id: 'extraPersonFee', title: 'Extra Person Fee' },
                { id: 'platformFees', title: 'Platform Fees (Channel + Transaction)' },
                { id: 'taxAmount', title: 'Tax Amount' },
                { id: 'grossAmount', title: 'Gross Amount (Revenue)' },
                { id: 'propertyId', title: 'Property ID' },
                { id: 'propertyName', title: 'Property Name' },
                { id: 'status', title: 'Status (confirmed/cancelled)' },
                { id: 'source', title: 'Source' },
                { id: 'description', title: 'Description (optional)' }
            ]
        });
        
        // Write example row
        await csvWriter.writeRecords([
            {
                guestName: 'John Doe',
                guestEmail: 'john@example.com',
                checkInDate: '2025-01-15',
                checkOutDate: '2025-01-18',
                nights: '3',
                baseRate: '400.00',
                cleaningFee: '100.00',
                petsFee: '50.00',
                extraPersonFee: '25.00',
                platformFees: '75.00',
                taxAmount: '50.00',
                grossAmount: '500.00',
                propertyId: '123',
                propertyName: 'Beach House',
                status: 'confirmed',
                source: 'direct',
                description: 'Direct booking via phone'
            }
        ]);
        
        res.download(templatePath, 'reservation_template.csv', async (err) => {
            // Clean up temp file after download
            try {
                await fs.unlink(templatePath);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup template file:', cleanupErr.message);
            }
            
            if (err) {
                console.error('Error sending template:', err);
            }
        });
        
    } catch (error) {
        console.error('Error generating template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate template'
        });
    }
});

// POST /api/reservations/upload - Upload reservations CSV
router.post('/upload', upload.single('reservationFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded. Please select a CSV file.'
            });
        }

        console.log(`📤 Processing uploaded reservation file: ${req.file.originalname}`);
        
        // Parse CSV file
        const reservations = [];
        const errors = [];
        
        await new Promise((resolve, reject) => {
            const stream = require('fs').createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (row) => {
                    try {
                        // Validate required fields
                        const requiredFields = ['guestName', 'checkInDate', 'checkOutDate', 'grossAmount'];
                        const missingFields = requiredFields.filter(field => !row[field] || row[field].trim() === '');
                        
                        if (missingFields.length > 0) {
                            errors.push(`Row with guest "${row.guestName || 'Unknown'}" missing required fields: ${missingFields.join(', ')}`);
                            return;
                        }
                        
                        // Parse and validate dates
                        const checkInDate = new Date(row['checkInDate'] || row['Check-in Date (YYYY-MM-DD)']);
                        const checkOutDate = new Date(row['checkOutDate'] || row['Check-out Date (YYYY-MM-DD)']);
                        
                        if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
                            errors.push(`Invalid dates for guest "${row.guestName}"`);
                            return;
                        }
                        
                        // Parse financial fields
                        const baseRate = parseFloat(row.baseRate || row['Base Rate'] || 0);
                        const cleaningFee = parseFloat(row.cleaningFee || row['Cleaning Fee'] || 0);
                        const petsFee = parseFloat(row.petsFee || row['Pets Fee'] || 0);
                        const extraPersonFee = parseFloat(row.extraPersonFee || row['Extra Person Fee'] || 0);
                        const platformFees = parseFloat(row.platformFees || row['Platform Fees (Channel + Transaction)'] || 0);
                        const taxAmount = parseFloat(row.taxAmount || row['Tax Amount'] || 0);
                        
                        // Calculate totals if not provided
                        const cleaningAndOtherFees = cleaningFee + petsFee + extraPersonFee;
                        const calculatedRevenue = baseRate + cleaningAndOtherFees - platformFees;
                        const grossAmount = parseFloat(row.grossAmount || row['Gross Amount (Revenue)']) || calculatedRevenue;
                        
                        if (isNaN(grossAmount) || grossAmount <= 0) {
                            errors.push(`Invalid amount for guest "${row.guestName}"`);
                            return;
                        }
                        
                        // Create reservation object with full financial breakdown
                        const reservation = {
                            id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            guestName: row.guestName || row['Guest Name'],
                            guestEmail: row.guestEmail || row['Guest Email'] || '',
                            checkInDate: checkInDate.toISOString().split('T')[0],
                            checkOutDate: checkOutDate.toISOString().split('T')[0],
                            nights: parseInt(row.nights || row['Nights']) || Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)),
                            // Financial breakdown
                            baseRate: baseRate,
                            cleaningAndOtherFees: cleaningAndOtherFees,
                            platformFees: platformFees,
                            clientRevenue: grossAmount,
                            luxuryLodgingFee: 0, // PM commission calculated by statement
                            clientTaxResponsibility: taxAmount,
                            clientPayout: grossAmount - taxAmount,
                            // Legacy fields
                            grossAmount: grossAmount,
                            hostPayoutAmount: grossAmount - taxAmount,
                            // Property info
                            propertyId: parseInt(row.propertyId || row['Property ID']) || null,
                            propertyName: row.propertyName || row['Property Name'] || null,
                            status: (row.status || row['Status (confirmed/cancelled)'] || 'confirmed').toLowerCase(),
                            source: row.source || row['Source'] || 'imported',
                            description: row.description || row['Description (optional)'] || null,
                            isImported: true,
                            importedAt: new Date().toISOString(),
                            importedFrom: req.file.originalname
                        };
                        
                        reservations.push(reservation);
                    } catch (err) {
                        errors.push(`Error parsing row: ${err.message}`);
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });
        
        if (reservations.length === 0) {
            // Clean up temp file
            await fs.unlink(req.file.path);
            
            return res.status(400).json({
                success: false,
                error: 'No valid reservations found in the uploaded file.',
                errors: errors
            });
        }
        
        // Save to imported reservations file
        const importedReservationsFile = path.join(process.cwd(), 'data', 'imported-reservations.json');
        
        // Read existing imported reservations
        let existingReservations = [];
        try {
            const fileContent = await fs.readFile(importedReservationsFile, 'utf8');
            existingReservations = JSON.parse(fileContent);
        } catch (err) {
            // File doesn't exist or is empty, start with empty array
            existingReservations = [];
        }
        
        // Merge with new reservations
        const allReservations = [...existingReservations, ...reservations];
        
        // Save to file
        await fs.writeFile(
            importedReservationsFile,
            JSON.stringify(allReservations, null, 2),
            'utf8'
        );
        
        // Clean up temp file
        await fs.unlink(req.file.path);
        
        res.json({
            success: true,
            message: `Successfully imported ${reservations.length} reservations`,
            data: {
                totalReservations: reservations.length,
                filename: req.file.originalname,
                errors: errors.length > 0 ? errors : undefined,
                reservations: reservations.slice(0, 5) // Return first 5 as preview
            }
        });
        
    } catch (error) {
        console.error('❌ Error uploading reservations:', error);
        
        // Clean up temp file on error
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.warn('Failed to cleanup temp file:', cleanupError.message);
            }
        }
        
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to process uploaded file'
        });
    }
});

module.exports = router;

