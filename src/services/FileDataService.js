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

        // In-memory cache for listings (reduces API calls)
        this._listingsCache = null;
        this._listingsCacheTime = null;
        this._listingsCacheTTL = 5 * 60 * 1000; // 5 minutes TTL

        // In-memory cache for owners
        this._ownersCache = null;
        this._ownersCacheTime = null;
        this._ownersCacheTTL = 10 * 60 * 1000; // 10 minutes TTL
    }

    clearListingsCache() {
        this._listingsCache = null;
        this._listingsCacheTime = null;
    }

    clearOwnersCache() {
        this._ownersCache = null;
        this._ownersCacheTime = null;
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            await fs.mkdir(this.statementsDir, { recursive: true });
        } catch (error) {
            // Ignore directory creation errors
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

    // Listings operations - now pulls directly from Hostify with caching
    async getListings() {
        // Check cache first
        if (this._listingsCache && this._listingsCacheTime &&
            (Date.now() - this._listingsCacheTime) < this._listingsCacheTTL) {
            return this._listingsCache;
        }

        try {
            const hostifyService = require('./HostifyService');
            const response = await hostifyService.getAllProperties();

            if (!response.result || response.result.length === 0) {
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

            // Merge database fields
            try {
                const ListingService = require('./ListingService');
                const dbListings = await ListingService.getListingsWithPmFees();
                // Use parseInt to ensure proper type comparison for IDs
                const dbListingMap = new Map(dbListings.map(l => [parseInt(l.id), l]));

                listings.forEach(listing => {
                    const dbListing = dbListingMap.get(parseInt(listing.id));
                    if (dbListing) {
                        listing.tags = dbListing.tags || [];
                        listing.displayName = dbListing.displayName;
                        listing.pmFeePercentage = dbListing.pmFeePercentage;
                        listing.isCohostOnAirbnb = Boolean(dbListing.isCohostOnAirbnb);
                        listing.cleaningFeePassThrough = Boolean(dbListing.cleaningFeePassThrough);
                        listing.disregardTax = Boolean(dbListing.disregardTax);
                        listing.airbnbPassThroughTax = Boolean(dbListing.airbnbPassThroughTax);
                        listing.guestPaidDamageCoverage = Boolean(dbListing.guestPaidDamageCoverage);
                        listing.waiveCommission = Boolean(dbListing.waiveCommission);
                        listing.waiveCommissionUntil = dbListing.waiveCommissionUntil || null;
                        listing.internalNotes = dbListing.internalNotes || null;
                        listing.payoutStatus = dbListing.payoutStatus || 'missing';
                        listing.payoutNotes = dbListing.payoutNotes || null;
                        listing.stripeAccountId = dbListing.stripeAccountId || null;
                        listing.stripeOnboardingStatus = dbListing.stripeOnboardingStatus || 'missing';
                    } else {
                        listing.tags = [];
                        listing.pmFeePercentage = 15.00;
                        listing.isCohostOnAirbnb = false;
                        listing.cleaningFeePassThrough = false;
                        listing.disregardTax = false;
                        listing.airbnbPassThroughTax = false;
                        listing.guestPaidDamageCoverage = false;
                        listing.waiveCommission = false;
                        listing.waiveCommissionUntil = null;
                        listing.internalNotes = null;
                        listing.payoutStatus = 'missing';
                        listing.payoutNotes = null;
                        listing.stripeAccountId = null;
                        listing.stripeOnboardingStatus = 'missing';
                    }
                });
            } catch (dbError) {
                listings.forEach(listing => {
                    listing.tags = [];
                    listing.pmFeePercentage = 15.00;
                    listing.isCohostOnAirbnb = false;
                    listing.cleaningFeePassThrough = false;
                    listing.disregardTax = false;
                    listing.airbnbPassThroughTax = false;
                    listing.guestPaidDamageCoverage = false;
                    listing.waiveCommission = false;
                    listing.waiveCommissionUntil = null;
                    listing.internalNotes = null;
                    listing.payoutStatus = 'missing';
                    listing.payoutNotes = null;
                    listing.stripeAccountId = null;
                    listing.stripeOnboardingStatus = 'missing';
                });
            }

            // Cache results
            this._listingsCache = listings;
            this._listingsCacheTime = Date.now();

            return listings;
        } catch (error) {
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
    }

    async findListingById(id) {
        const listings = await this.getListings();
        return listings.find(listing => listing.id === id);
    }

    // Reservations operations - optimized for specific date ranges and properties
    // Child listings are always fetched automatically for better coverage
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
                        originalResortFee: reservation.resortFee || 0,
                        baseRate: reservation.baseRate * proration.factor,
                        cleaningAndOtherFees: reservation.cleaningAndOtherFees * proration.factor,
                        platformFees: reservation.platformFees * proration.factor,
                        clientRevenue: reservation.clientRevenue * proration.factor,
                        luxuryLodgingFee: reservation.luxuryLodgingFee * proration.factor,
                        clientTaxResponsibility: reservation.clientTaxResponsibility * proration.factor,
                        clientPayout: reservation.clientPayout * proration.factor,
                        resortFee: (reservation.resortFee || 0) * proration.factor,
                        prorationFactor: proration.factor,
                        prorationDays: proration.daysInPeriod,
                        totalDays: proration.totalDays,
                        prorationNote: `${proration.daysInPeriod}/${proration.totalDays} days in period`
                    };
                });

                return proratedReservations;

            } else {
                // Default checkout-based calculation

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

                // Load and merge imported reservations
                const importedReservations = await this.getImportedReservations(startDate, endDate, propertyId);

                // Combine API and imported reservations
                return [...apiReservations, ...importedReservations];
            }
        } catch (error) {
            // Try to return imported reservations even if API fails
            try {
                return await this.getImportedReservations(startDate, endDate, propertyId);
            } catch (importError) {
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
            
            return filtered;

        } catch (error) {
            return [];
        }
    }

    async saveReservations(reservations) {
        await this.writeJSONFile(this.reservationsFile, reservations);
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

    /**
     * OPTIMIZED: Batch fetch reservations for multiple properties in a single API call
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {Array<number>} propertyIds - Array of property IDs
     * @param {string} calculationType - 'checkout' or 'calendar'
     * @param {Object} listingInfoMap - Map of propertyId -> listing settings (optional)
     * @returns {Promise<Object>} - Map of propertyId -> reservations
     */
    async getReservationsBatch(startDate, endDate, propertyIds, calculationType = 'checkout', listingInfoMap = {}) {
        const hostifyService = require('./HostifyService');

        // Child listings are always fetched automatically for better coverage

        try {
            if (calculationType === 'calendar') {
                // For calendar mode, use overlapping reservations
                const reservations = await hostifyService.getOverlappingReservations(propertyIds, startDate, endDate);

                // Apply proration and group by propertyId
                const reservationsByProperty = {};
                propertyIds.forEach(id => { reservationsByProperty[id] = []; });

                reservations.forEach(res => {
                    const proration = this.calculateProration(res, startDate, endDate);
                    const proratedRes = {
                        ...res,
                        originalBaseRate: res.baseRate,
                        originalCleaningAndOtherFees: res.cleaningAndOtherFees,
                        originalPlatformFees: res.platformFees,
                        originalClientRevenue: res.clientRevenue,
                        originalLuxuryLodgingFee: res.luxuryLodgingFee,
                        originalClientTaxResponsibility: res.clientTaxResponsibility,
                        originalClientPayout: res.clientPayout,
                        originalResortFee: res.resortFee || 0,
                        baseRate: res.baseRate * proration.factor,
                        cleaningAndOtherFees: res.cleaningAndOtherFees * proration.factor,
                        platformFees: res.platformFees * proration.factor,
                        clientRevenue: res.clientRevenue * proration.factor,
                        luxuryLodgingFee: res.luxuryLodgingFee * proration.factor,
                        clientTaxResponsibility: res.clientTaxResponsibility * proration.factor,
                        clientPayout: res.clientPayout * proration.factor,
                        resortFee: (res.resortFee || 0) * proration.factor,
                        prorationFactor: proration.factor,
                        prorationDays: proration.daysInPeriod,
                        totalDays: proration.totalDays,
                        prorationNote: `${proration.daysInPeriod}/${proration.totalDays} days in period`
                    };

                    if (reservationsByProperty[proratedRes.propertyId]) {
                        reservationsByProperty[proratedRes.propertyId].push(proratedRes);
                    }
                });

                return reservationsByProperty;
            } else {
                // Checkout-based: fetch all reservations at once
                const params = {
                    fromDate: startDate,
                    toDate: endDate,
                    dateType: 'departureDate',
                    listingMapIds: propertyIds
                };

                const apiReservations = await hostifyService.getConsolidatedFinanceReport(params);

                // Group by propertyId
                const reservationsByProperty = {};
                propertyIds.forEach(id => { reservationsByProperty[id] = []; });

                apiReservations.forEach(res => {
                    if (reservationsByProperty[res.propertyId]) {
                        reservationsByProperty[res.propertyId].push(res);
                    }
                });

                // Add imported reservations per property
                for (const propId of propertyIds) {
                    const imported = await this.getImportedReservations(startDate, endDate, propId);
                    reservationsByProperty[propId].push(...imported);
                }

                return reservationsByProperty;
            }
        } catch (error) {
            // Fall back to per-property fetching
            const reservationsByProperty = {};
            for (const propId of propertyIds) {
                reservationsByProperty[propId] = await this.getReservations(startDate, endDate, propId, calculationType);
            }
            return reservationsByProperty;
        }
    }

    /**
     * OPTIMIZED: Batch fetch expenses for multiple properties
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @param {Array<number>} propertyIds - Array of property IDs
     * @returns {Promise<Object>} - Map of propertyId -> { expenses, duplicateWarnings }
     */
    async getExpensesBatch(startDate, endDate, propertyIds) {

        // Fetch all expenses for the date range at once
        const allApiExpenses = await this._fetchAllSecureStayExpenses(startDate, endDate);
        const allUploadedExpenses = await this._fetchAllUploadedExpenses(startDate, endDate);

        // Group expenses by propertyId
        const result = {};
        for (const propId of propertyIds) {
            const propIdInt = parseInt(propId);

            // Filter SecureStay expenses for this property
            const secureStayExpenses = allApiExpenses.filter(exp => {
                if (exp.secureStayListingId) {
                    return parseInt(exp.secureStayListingId) === propIdInt;
                }
                return false;
            });

            // Filter uploaded expenses for this property
            const uploadedExpenses = allUploadedExpenses.filter(exp => {
                return exp.propertyId === propIdInt;
            });

            const expenses = [...secureStayExpenses, ...uploadedExpenses];

            // Detect duplicates
            let duplicateWarnings = [];
            if (secureStayExpenses.length > 0 && uploadedExpenses.length > 0) {
                try {
                    const expenseUploadService = require('./ExpenseUploadService');
                    duplicateWarnings = expenseUploadService.detectDuplicates(secureStayExpenses, uploadedExpenses);
                } catch (error) {
                    // Ignore duplicate detection errors
                }
            }

            result[propId] = { expenses, duplicateWarnings };
        }

        return result;
    }

    /**
     * Internal: Fetch all SecureStay expenses for a date range (cached per call)
     */
    async _fetchAllSecureStayExpenses(startDate, endDate) {
        try {
            const secureStayService = require('./SecureStayService');
            const apiExpenses = await secureStayService.getExpensesForPeriod(startDate, endDate, null);
            return apiExpenses || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Internal: Fetch all uploaded expenses for a date range
     */
    async _fetchAllUploadedExpenses(startDate, endDate) {
        try {
            const expenseUploadService = require('./ExpenseUploadService');
            const allUploaded = await expenseUploadService.getAllUploadedExpenses();

            // Filter by date range
            const periodStart = new Date(startDate);
            const periodEnd = new Date(endDate);

            return allUploaded.filter(exp => {
                const expenseDate = new Date(exp.date);
                return expenseDate >= periodStart && expenseDate <= periodEnd;
            });
        } catch (error) {
            return [];
        }
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
                // Filter by property if propertyId is provided
                if (propertyId) {
                    const propertyIdInt = parseInt(propertyId);
                    
                    // First, try to match by SecureStay listingMapId (should match Hostify property ID)
                    secureStayExpenses = apiExpenses.filter(expense => {
                        if (expense.secureStayListingId) {
                            return parseInt(expense.secureStayListingId) === propertyIdInt;
                        }
                        return false;
                    });

                    if (secureStayExpenses.length === 0) {
                        // Fall back to name-based matching if ID matching doesn't work
                        const secureStayListingName = await propertyMappingService.getSecureStayListingName(propertyId);
                        if (secureStayListingName) {
                            const uniqueListings = [...new Set(apiExpenses.map(e => e.listing).filter(Boolean))];

                            secureStayExpenses = apiExpenses.filter(expense =>
                                expense.listing === secureStayListingName
                            );

                            if (secureStayExpenses.length === 0 && apiExpenses.length > 0) {
                                // Try case-insensitive and trimmed matching
                                const matchingExpenses = apiExpenses.filter(expense => {
                                    if (!expense.listing) return false;
                                    return expense.listing.trim().toLowerCase() === secureStayListingName.trim().toLowerCase();
                                });
                                if (matchingExpenses.length > 0) {
                                    secureStayExpenses = matchingExpenses;
                                } else {
                                    // Find close matches (same words, just punctuation differences)
                                    const closeMatches = uniqueListings.filter(l => {
                                        if (!l) return false;
                                        const lNormalized = l.toLowerCase().replace(/[.,]/g, '').trim();
                                        const expectedNormalized = secureStayListingName.toLowerCase().replace(/[.,]/g, '').trim();
                                        return lNormalized === expectedNormalized;
                                    });
                                    if (closeMatches.length > 0) {
                                        secureStayExpenses = apiExpenses.filter(expense =>
                                            expense.listing === closeMatches[0]
                                        );
                                    }
                                }
                            }
                        }
                    }
                } else {
                    secureStayExpenses = apiExpenses;
                }
                
                allExpenses.push(...secureStayExpenses);
            }
        } catch (error) {
            // SecureStay API failed, continue with other sources
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
                    // If expense has propertyId, it must match
                    if (expense.propertyId) {
                        if (expense.propertyId !== parseInt(propertyId)) {
                            return false;
                        }
                    } else {
                        // If expense doesn't have propertyId, try to match by listing name
                        // If listing name doesn't match or is missing, exclude it
                        if (!expense.listing) {
                            return false; // No propertyId and no listing name - exclude
                        }
                        // TODO: Implement property name mapping for uploaded expenses
                        // For now, exclude expenses without propertyId when filtering for specific property
                        return false;
                    }
                }
                
                return true;
            });
            
            allExpenses.push(...uploadedExpenses);

        } catch (error) {
            // Uploaded expenses failed, continue
        }
        
        // 3. Detect duplicates between SecureStay and uploaded expenses
        if (secureStayExpenses.length > 0 && uploadedExpenses.length > 0) {
            try {
                const expenseUploadService = require('./ExpenseUploadService');
                const duplicates = expenseUploadService.detectDuplicates(secureStayExpenses, uploadedExpenses);

                if (duplicates.length > 0) {
                    duplicates.forEach(dup => duplicateWarnings.push(dup));
                }
            } catch (error) {
                // Duplicate detection failed, continue
            }
        }
        
        // 4. Fallback to legacy file-based expenses if no other sources
        if (allExpenses.length === 0) {
            try {
                const fileExpenses = await this.readJSONFile(this.expensesFile, []);
                allExpenses.push(...fileExpenses);
            } catch (error) {
                // Legacy file failed, continue
            }
        }
        
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
        
        return {
            factor: factor,
            daysInPeriod: safeNightsInPeriod,
            totalDays: safeTotalNights
        };
    }

    async saveExpenses(expenses) {
        await this.writeJSONFile(this.expensesFile, expenses);
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

    // Owners operations - now pulls directly from Hostify with caching
    async getOwners() {
        // Check if we have valid cached owners
        if (this._ownersCache && this._ownersCacheTime) {
            const cacheAge = Date.now() - this._ownersCacheTime;
            if (cacheAge < this._ownersCacheTTL) {
                return this._ownersCache;
            }
        }

        try {
            const hostifyService = require('./HostifyService');
            const owners = await hostifyService.getAllOwners();
            
            // Always include "Default" option at the beginning
            const defaultOwner = {
                id: 'default',
                name: 'Default',
                email: null,
                phone: null,
                address: null,
                defaultPmPercentage: 15.00,
                techFeeEnabled: true,
                insuranceFeeEnabled: true,
                createdAt: new Date().toISOString()
            };
            
            if (!owners || owners.length === 0) {
                const result = [defaultOwner];
                this._ownersCache = result;
                this._ownersCacheTime = Date.now();
                return result;
            }
            const result = [defaultOwner, ...owners];
            this._ownersCache = result;
            this._ownersCacheTime = Date.now();
            return result;
        } catch (error) {
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
