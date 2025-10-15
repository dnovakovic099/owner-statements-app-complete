const fs = require('fs').promises;
const path = require('path');

class FileDataService {
    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.statementsDir = path.join(__dirname, '../../statements');
        this.listingsFile = path.join(this.dataDir, 'listings.json');
        this.reservationsFile = path.join(this.dataDir, 'reservations.json');
        this.expensesFile = path.join(this.dataDir, 'expenses.json');
        this.ownersFile = path.join(this.dataDir, 'owners.json');
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            await fs.mkdir(this.statementsDir, { recursive: true });
        } catch (error) {
            console.error('Error creating directories:', error);
        }
    }

    async readJSONFile(filePath, defaultValue = []) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, return default value
                return defaultValue;
            }
            throw error;
        }
    }

    async writeJSONFile(filePath, data) {
        await this.ensureDirectories();
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    // Listings operations
    async getListings() {
        return await this.readJSONFile(this.listingsFile, []);
    }

    async saveListings(listings) {
        await this.writeJSONFile(this.listingsFile, listings);
        console.log(`Saved ${listings.length} listings to file`);
    }

    async findListingById(id) {
        const listings = await this.getListings();
        return listings.find(listing => listing.id === id);
    }

    // Reservations operations - optimized for specific date ranges and properties
    async getReservations(startDate = null, endDate = null, propertyId = null, calculationType = 'checkout') {
        // If no date range specified, use a reasonable default (last 6 months to next 6 months)
        if (!startDate || !endDate) {
            const now = new Date();
            const sixMonthsAgo = new Date(now);
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            const sixMonthsFromNow = new Date(now);
            sixMonthsFromNow.setMonth(now.getMonth() + 6);
            
            startDate = sixMonthsAgo.toISOString().split('T')[0];
            endDate = sixMonthsFromNow.toISOString().split('T')[0];
        }
        
        const hostawayService = require('./HostawayService');
        
        try {
            const listingIds = propertyId ? [parseInt(propertyId)] : [];
            
            if (calculationType === 'calendar') {
                console.log(`Fetching overlapping reservations for calendar-based calculation: ${startDate} to ${endDate}${propertyId ? ` for property ${propertyId}` : ''}`);
                
                const reservations = await hostawayService.getOverlappingReservations(listingIds, startDate, endDate);
                
                // Apply proration for calendar-based calculations
                const proratedReservations = reservations.map(reservation => {
                    const proration = this.calculateProration(reservation, startDate, endDate);
                    return {
                        ...reservation,
                        originalBaseRate: reservation.baseRate,
                        originalCleaningAndOtherFees: reservation.cleaningAndOtherFees,
                        originalPlatformFees: reservation.platformFees,
                        originalClientRevenue: reservation.clientRevenue,
                        originalLuxuryLodgingFee: reservation.luxuryLodgingFee,
                        originalClientTaxResponsibility: reservation.clientTaxResponsibility,
                        originalClientPayout: reservation.clientPayout,
                        baseRate: reservation.baseRate * proration.factor,
                        cleaningAndOtherFees: reservation.cleaningAndOtherFees * proration.factor,
                        platformFees: reservation.platformFees * proration.factor,
                        clientRevenue: reservation.clientRevenue * proration.factor,
                        luxuryLodgingFee: reservation.luxuryLodgingFee * proration.factor,
                        clientTaxResponsibility: reservation.clientTaxResponsibility * proration.factor,
                        clientPayout: reservation.clientPayout * proration.factor,
                        prorationFactor: proration.factor,
                        prorationDays: proration.daysInPeriod,
                        totalDays: proration.totalDays,
                        prorationNote: `${proration.daysInPeriod}/${proration.totalDays} days in period`
                    };
                });
                
                console.log(`Applied proration to ${proratedReservations.length} overlapping reservations`);
                return proratedReservations;
                
            } else {
                // Default checkout-based calculation
                console.log(`Fetching reservations using consolidated finance report for period: ${startDate} to ${endDate}${propertyId ? ` for property ${propertyId}` : ''}`);
                
                // Prepare parameters for consolidated finance report
                const params = {
                    fromDate: startDate,
                    toDate: endDate,
                    dateType: 'departureDate'
                };
                
                // Add property filter if specified
                if (propertyId) {
                    params.listingMapIds = [parseInt(propertyId)];
                }
                
                // Use the new consolidated finance report endpoint
                const transformedReservations = await hostawayService.getConsolidatedFinanceReport(params);
                
                console.log(`Fetched ${transformedReservations.length} reservations using consolidated finance report`);
                return transformedReservations;
            }
        } catch (error) {
            console.error('Error fetching reservations using consolidated finance report:', error);
            // Fallback to empty array if API fails
            return [];
        }
    }

    async saveReservations(reservations) {
        await this.writeJSONFile(this.reservationsFile, reservations);
        console.log(`Saved ${reservations.length} reservations to file`);
    }

    async findReservationsByPropertyId(propertyId, startDate = null, endDate = null) {
        const reservations = await this.getReservations();
        let filtered = reservations.filter(res => res.propertyId === propertyId);
        
        if (startDate && endDate) {
            filtered = filtered.filter(res => {
                const checkoutDate = new Date(res.checkOutDate);
                const start = new Date(startDate);
                const end = new Date(endDate);
                return checkoutDate >= start && checkoutDate <= end;
            });
        }
        
        return filtered;
    }

    async findReservationsByDateRange(startDate, endDate) {
        const reservations = await this.getReservations();
        return reservations.filter(res => {
            const checkoutDate = new Date(res.checkOutDate);
            const start = new Date(startDate);
            const end = new Date(endDate);
            return checkoutDate >= start && checkoutDate <= end;
        });
    }

    // Expenses operations
    async getExpenses(startDate = null, endDate = null, propertyId = null) {
        const allExpenses = [];
        const duplicateWarnings = [];
        
        // 1. Try to fetch from SecureStay API first
        let secureStayExpenses = [];
        try {
            const secureStayService = require('./SecureStayService');
            const propertyMappingService = require('./PropertyMappingService');
            
            // Get all expenses for the period from SecureStay
            const apiExpenses = await secureStayService.getExpensesForPeriod(startDate, endDate, null);
            
            if (apiExpenses && apiExpenses.length > 0) {
                console.log(`Fetched ${apiExpenses.length} expenses from SecureStay API for period ${startDate} to ${endDate}`);
                
                // Filter by property if propertyId is provided
                if (propertyId) {
                    const secureStayListingName = await propertyMappingService.getSecureStayListingName(propertyId);
                    if (secureStayListingName) {
                        secureStayExpenses = apiExpenses.filter(expense => 
                            expense.listing === secureStayListingName
                        );
                        console.log(`Filtered to ${secureStayExpenses.length} SecureStay expenses for property ${propertyId} (${secureStayListingName})`);
                    } else {
                        console.warn(`No SecureStay mapping found for property ${propertyId}, skipping SecureStay expenses`);
                    }
                } else {
                    secureStayExpenses = apiExpenses;
                }
                
                allExpenses.push(...secureStayExpenses);
            }
        } catch (error) {
            console.warn('Failed to fetch expenses from SecureStay API:', error.message);
        }
        
        // 2. Get uploaded expenses
        let uploadedExpenses = [];
        try {
            const expenseUploadService = require('./ExpenseUploadService');
            const allUploadedExpenses = await expenseUploadService.getAllUploadedExpenses();
            
            // Filter uploaded expenses by date and property
            uploadedExpenses = allUploadedExpenses.filter(expense => {
                // Date filtering
                if (startDate && endDate) {
                    const expenseDate = new Date(expense.date);
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    if (expenseDate < start || expenseDate > end) {
                        return false;
                    }
                }
                
                // Property filtering
                if (propertyId) {
                    // If expense has propertyId, match it
                    if (expense.propertyId && expense.propertyId !== parseInt(propertyId)) {
                        return false;
                    }
                    // If expense has listing name, try to match it
                    // For now, include all uploaded expenses if no propertyId match
                    // TODO: Implement property name mapping for uploaded expenses
                }
                
                return true;
            });
            
            console.log(`Found ${uploadedExpenses.length} uploaded expenses for the period`);
            allExpenses.push(...uploadedExpenses);
            
        } catch (error) {
            console.warn('Failed to fetch uploaded expenses:', error.message);
        }
        
        // 3. Detect duplicates between SecureStay and uploaded expenses
        if (secureStayExpenses.length > 0 && uploadedExpenses.length > 0) {
            try {
                const expenseUploadService = require('./ExpenseUploadService');
                const duplicates = expenseUploadService.detectDuplicates(secureStayExpenses, uploadedExpenses);
                
                if (duplicates.length > 0) {
                    console.warn(`⚠️  Detected ${duplicates.length} potential duplicate expenses:`);
                    duplicates.forEach((dup, index) => {
                        console.warn(`   ${index + 1}. ${dup.expense1.description} ($${dup.expense1.amount}) vs ${dup.expense2.description} ($${dup.expense2.amount})`);
                        duplicateWarnings.push(dup);
                    });
                }
            } catch (error) {
                console.warn('Failed to detect duplicates:', error.message);
            }
        }
        
        // 4. Fallback to legacy file-based expenses if no other sources
        if (allExpenses.length === 0) {
            try {
                const fileExpenses = await this.readJSONFile(this.expensesFile, []);
                console.log(`Using ${fileExpenses.length} expenses from legacy file data`);
                allExpenses.push(...fileExpenses);
            } catch (error) {
                console.warn('Failed to load legacy file expenses:', error.message);
            }
        }
        
        console.log(`📊 Total expenses: ${allExpenses.length} (${secureStayExpenses.length} SecureStay + ${uploadedExpenses.length} uploaded)`);
        
        // Attach duplicate warnings to the expenses array for later use
        allExpenses.duplicateWarnings = duplicateWarnings;
        
        return allExpenses;
    }

    /**
     * Calculate proration factor for calendar-based reservations
     * @param {Object} reservation - Reservation object with arrivalDate and departureDate
     * @param {string} periodStart - Period start date (YYYY-MM-DD)
     * @param {string} periodEnd - Period end date (YYYY-MM-DD)
     * @returns {Object} - Proration details { factor, daysInPeriod, totalDays }
     */
    calculateProration(reservation, periodStart, periodEnd) {
        const arrivalDate = new Date(reservation.arrivalDate);
        const departureDate = new Date(reservation.departureDate);
        const periodStartDate = new Date(periodStart);
        const periodEndDate = new Date(periodEnd);
        
        // Calculate the overlap between reservation and period
        const overlapStart = new Date(Math.max(arrivalDate.getTime(), periodStartDate.getTime()));
        const overlapEnd = new Date(Math.min(departureDate.getTime(), periodEndDate.getTime()));
        
        // Calculate days
        const totalDays = Math.ceil((departureDate - arrivalDate) / (1000 * 60 * 60 * 24));
        const daysInPeriod = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));
        
        // Ensure we don't have negative days or divide by zero
        const safeDaysInPeriod = Math.max(0, daysInPeriod);
        const safeTotalDays = Math.max(1, totalDays);
        
        const factor = safeDaysInPeriod / safeTotalDays;
        
        console.log(`Proration for reservation ${reservation.id}: ${safeDaysInPeriod}/${safeTotalDays} days = ${(factor * 100).toFixed(1)}%`);
        
        return {
            factor: factor,
            daysInPeriod: safeDaysInPeriod,
            totalDays: safeTotalDays
        };
    }

    async saveExpenses(expenses) {
        await this.writeJSONFile(this.expensesFile, expenses);
        console.log(`Saved ${expenses.length} expenses to file`);
    }

    async findExpensesByPropertyId(propertyId, startDate = null, endDate = null) {
        const expenses = await this.getExpenses();
        let filtered = expenses.filter(exp => exp.propertyId === propertyId);
        
        if (startDate && endDate) {
            filtered = filtered.filter(exp => {
                const expenseDate = new Date(exp.date);
                const start = new Date(startDate);
                const end = new Date(endDate);
                return expenseDate >= start && expenseDate <= end;
            });
        }
        
        return filtered;
    }

    // Owners operations
    async getOwners() {
        const owners = await this.readJSONFile(this.ownersFile, []);
        
        // If no owners exist, create a default one
        if (owners.length === 0) {
            const defaultOwner = {
                id: 1,
                name: 'Default Owner',
                email: 'owner@example.com',
                phone: '(555) 123-4567',
                address: 'Address not specified',
                defaultPmPercentage: 15.00,
                techFeeEnabled: true,
                insuranceFeeEnabled: true,
                createdAt: new Date().toISOString()
            };
            owners.push(defaultOwner);
            await this.saveOwners(owners);
        }
        
        return owners;
    }

    async saveOwners(owners) {
        await this.writeJSONFile(this.ownersFile, owners);
        console.log(`Saved ${owners.length} owners to file`);
    }

    async findOwnerById(id) {
        const owners = await this.getOwners();
        return owners.find(owner => owner.id === parseInt(id));
    }

    // Statements operations
    async saveStatement(statement) {
        await this.ensureDirectories();
        const filename = `statement-${statement.id}-${statement.weekStartDate}-to-${statement.weekEndDate}.json`;
        const filePath = path.join(this.statementsDir, filename);
        await fs.writeFile(filePath, JSON.stringify(statement, null, 2), 'utf8');
        console.log(`Saved statement ${statement.id} to ${filename}`);
        return filePath;
    }

    async getStatements() {
        await this.ensureDirectories();
        try {
            const files = await fs.readdir(this.statementsDir);
            const statements = [];
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.statementsDir, file);
                    const data = await this.readJSONFile(filePath, null);
                    if (data) {
                        statements.push(data);
                    }
                }
            }
            
            // Sort by creation date, newest first (with revenue first)
            return statements.sort((a, b) => {
                // First sort by revenue (descending), then by date (descending)
                if (a.totalRevenue !== b.totalRevenue) {
                    return b.totalRevenue - a.totalRevenue;
                }
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
        } catch (error) {
            console.error('Error reading statements directory:', error);
            return [];
        }
    }

    async getStatementById(id) {
        const statements = await this.getStatements();
        return statements.find(stmt => stmt.id === parseInt(id));
    }

    // Dashboard data - optimized to not fetch all reservations
    async getDashboardData() {
        const listings = await this.getListings();
        const statements = await this.getStatements();

        // Calculate total revenue from statements only
        const totalRevenue = statements.reduce((sum, stmt) => sum + (stmt.totalRevenue || 0), 0);

        return {
            totalProperties: listings.length,
            totalOwners: 1, // We'll have one default owner for now
            pendingStatements: statements.filter(s => s.status === 'draft').length,
            totalRevenue: totalRevenue,
            revenueChange: 90.4 // Placeholder
        };
    }

    // Utility function to generate unique IDs
    generateId(existingItems) {
        const ids = existingItems.map(item => item.id || 0);
        return Math.max(0, ...ids) + 1;
    }
}

module.exports = new FileDataService();
