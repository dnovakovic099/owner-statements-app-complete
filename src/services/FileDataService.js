const fs = require('fs').promises;
const path = require('path');
const DatabaseService = require('./DatabaseService');

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

    // Listings operations - now pulls directly from Hostify
    async getListings() {
        try {
            console.log('📋 Fetching listings directly from Hostify API...');
            const hostifyService = require('./HostifyService');
            const response = await hostifyService.getAllProperties();
            
            if (!response.result || response.result.length === 0) {
                console.warn('⚠️  No listings found in Hostify');
                return [];
            }

            // Transform to our format
            const listings = response.result.map(listing => ({
                id: listing.id,
                name: listing.name || listing.nickname || `Property ${listing.id}`,
                nickname: listing.nickname || null,
                address: this.formatHostifyAddress(listing),
                country: listing.country || '',
                city: listing.city || '',
                personCapacity: listing.guests_included || 0,
                bedroomsNumber: listing.details?.bedroomsNumber || 0,
                bathroomsNumber: listing.details?.bathroomsNumber || 0,
                currency: listing.currency || 'USD',
                price: listing.default_daily_price || 0,
                cleaningFee: listing.cleaning_fee || 0,
                checkInTimeStart: listing.checkin_start ? parseInt(listing.checkin_start.split(':')[0]) : 15,
                checkInTimeEnd: listing.checkin_end ? parseInt(listing.checkin_end.split(':')[0]) : 22,
                checkOutTime: listing.checkout ? parseInt(listing.checkout.split(':')[0]) : 11,
                minNights: listing.min_nights || 1,
                maxNights: listing.max_nights || 365,
                isActive: listing.is_listed === 1,
                syncedAt: new Date().toISOString()
            }));

            console.log(`✅ Fetched ${listings.length} listings from Hostify`);
            return listings;
        } catch (error) {
            console.error('❌ Failed to fetch listings from Hostify, falling back to cached file:', error.message);
            // Fallback to cached file if API fails
            return await this.readJSONFile(this.listingsFile, []);
        }
    }

    formatHostifyAddress(listing) {
        if (!listing) return 'Address not available';
        
        const parts = [];
        if (listing.street) parts.push(listing.street);
        if (listing.city) parts.push(listing.city);
        if (listing.state) parts.push(listing.state);
        if (listing.country) parts.push(listing.country);
        if (listing.zipcode) parts.push(listing.zipcode);
        
        return parts.length > 0 ? parts.join(', ') : 'Address not available';
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
        
        const hostifyService = require('./HostifyService');
        
        try {
            const listingIds = propertyId ? [parseInt(propertyId)] : [];
            
            if (calculationType === 'calendar') {
                console.log(`Fetching overlapping reservations for calendar-based calculation: ${startDate} to ${endDate}${propertyId ? ` for property ${propertyId}` : ''}`);
                
                const reservations = await hostifyService.getOverlappingReservations(listingIds, startDate, endDate);
                
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
                console.log(`Fetching reservations from Hostify for period: ${startDate} to ${endDate}${propertyId ? ` for property ${propertyId}` : ''}`);
                
                // Prepare parameters for Hostify
                const params = {
                    fromDate: startDate,
                    toDate: endDate,
                    dateType: 'departureDate'
                };
                
                // Add property filter if specified
                if (propertyId) {
                    params.listingMapIds = [parseInt(propertyId)];
                }
                
                // Use Hostify to get reservations
                const apiReservations = await hostifyService.getConsolidatedFinanceReport(params);
                
                console.log(`Fetched ${apiReservations.length} reservations from Hostify API`);
                
                // Load and merge imported reservations
                const importedReservations = await this.getImportedReservations(startDate, endDate, propertyId);
                
                // Combine API and imported reservations
                const allReservations = [...apiReservations, ...importedReservations];
                
                console.log(`Total reservations: ${allReservations.length} (API: ${apiReservations.length}, Imported: ${importedReservations.length})`);
                return allReservations;
            }
        } catch (error) {
            console.error('Error fetching reservations:', error);
            // Try to return imported reservations even if API fails
            try {
                const importedReservations = await this.getImportedReservations(startDate, endDate, propertyId);
                console.log(`API failed, returning ${importedReservations.length} imported reservations only`);
                return importedReservations;
            } catch (importError) {
                console.error('Error fetching imported reservations:', importError);
                return [];
            }
        }
    }

    async getImportedReservations(startDate = null, endDate = null, propertyId = null) {
        try {
            const importedFile = path.join(this.dataDir, 'imported-reservations.json');
            
            // Check if file exists
            try {
                await this.fs.access(importedFile);
            } catch {
                // File doesn't exist, return empty array
                return [];
            }
            
            const data = await this.readJSONFile(importedFile);
            
            if (!Array.isArray(data) || data.length === 0) {
                return [];
            }
            
            // Filter by date range and property if specified
            let filtered = data;
            
            if (startDate && endDate) {
                const periodStart = new Date(startDate);
                const periodEnd = new Date(endDate);
                
                filtered = filtered.filter(res => {
                    const checkOutDate = new Date(res.checkOutDate);
                    return checkOutDate >= periodStart && checkOutDate <= periodEnd;
                });
            }
            
            if (propertyId) {
                filtered = filtered.filter(res => 
                    res.propertyId === parseInt(propertyId)
                );
            }
            
            console.log(`Loaded ${filtered.length} imported reservations (out of ${data.length} total)`);
            return filtered;
            
        } catch (error) {
            console.warn('Error loading imported reservations:', error.message);
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
        // Use checkInDate/checkOutDate (from Hostify) or fallback to arrivalDate/departureDate
        const checkIn = reservation.checkInDate || reservation.arrivalDate;
        const checkOut = reservation.checkOutDate || reservation.departureDate;
        
        if (!checkIn || !checkOut) {
            console.warn(`Missing check-in/check-out dates for reservation ${reservation.id}`);
            return { factor: 1, daysInPeriod: reservation.nights || 0, totalDays: reservation.nights || 1 };
        }
        
        // Parse dates at noon UTC to avoid timezone issues
        const arrivalDate = new Date(checkIn + 'T12:00:00Z');
        const departureDate = new Date(checkOut + 'T12:00:00Z');
        const periodStartDate = new Date(periodStart + 'T12:00:00Z');
        const periodEndDate = new Date(periodEnd + 'T12:00:00Z');
        
        // For proration, period end is inclusive (the last night of the period)
        // So we need to add 1 day to make the comparison work correctly
        // E.g., period 10/1-10/31 means nights from 10/1 through 10/31
        // Check-out on 11/1 means last night was 10/31, so it should be fully included
        const periodEndInclusive = new Date(periodEndDate);
        periodEndInclusive.setDate(periodEndInclusive.getDate() + 1);
        
        // Calculate the overlap between reservation and period
        // Check-in is inclusive (guest stays starting this night)
        // Check-out is exclusive (guest leaves this day, doesn't stay this night)
        // Period start is inclusive (first night of the period)
        // Period end is inclusive (last night of the period)
        const overlapStart = new Date(Math.max(arrivalDate.getTime(), periodStartDate.getTime()));
        const overlapEnd = new Date(Math.min(departureDate.getTime(), periodEndInclusive.getTime()));
        
        // Calculate nights (not calendar days)
        // Use Math.round to avoid floating point issues
        const totalNights = Math.round((departureDate - arrivalDate) / (1000 * 60 * 60 * 24));
        const nightsInPeriod = Math.max(0, Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)));
        
        // Ensure we don't divide by zero
        const safeTotalNights = Math.max(1, totalNights);
        const safeNightsInPeriod = Math.max(0, nightsInPeriod);
        
        const factor = safeNightsInPeriod / safeTotalNights;
        
        console.log(`Proration for reservation ${reservation.id || reservation.hostifyId}: ${checkIn} to ${checkOut} - ${safeNightsInPeriod}/${safeTotalNights} nights (${(factor * 100).toFixed(1)}%) overlap with period ${periodStart} to ${periodEnd}`);
        
        return {
            factor: factor,
            daysInPeriod: safeNightsInPeriod,
            totalDays: safeTotalNights
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

    // Owners operations - now pulls directly from Hostify
    async getOwners() {
        try {
            console.log('👥 Fetching owners directly from Hostify API...');
            const hostifyService = require('./HostifyService');
            const owners = await hostifyService.getAllOwners();
            
            if (!owners || owners.length === 0) {
                console.warn('⚠️  No owners found in Hostify, creating default owner');
                // If no owners exist, create a default one
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
                return [defaultOwner];
            }
            
            console.log(`✅ Fetched ${owners.length} owners from Hostify`);
            return owners;
        } catch (error) {
            console.error('❌ Failed to fetch owners from Hostify, falling back to cached file:', error.message);
            // Fallback to cached file if API fails
            const owners = await this.readJSONFile(this.ownersFile, []);
            
            // If no cached owners exist, create a default one
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
                return [defaultOwner];
            }
            
            return owners;
        }
    }

    async saveOwners(owners) {
        await this.writeJSONFile(this.ownersFile, owners);
        console.log(`Saved ${owners.length} owners to file`);
    }

    async findOwnerById(id) {
        const owners = await this.getOwners();
        return owners.find(owner => owner.id === parseInt(id));
    }

    // Statements operations - now uses DATABASE
    async saveStatement(statement) {
        return await DatabaseService.saveStatement(statement);
    }

    async deleteStatement(id) {
        return await DatabaseService.deleteStatement(id);
    }

    async getStatements(filters = {}) {
        return await DatabaseService.getStatements(filters);
    }

    async getStatementById(id) {
        return await DatabaseService.getStatementById(id);
    }

    async updateStatement(id, updates) {
        return await DatabaseService.updateStatement(id, updates);
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
