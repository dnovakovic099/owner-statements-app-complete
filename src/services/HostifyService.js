const axios = require('axios');

class HostifyService {
    constructor() {
        this.baseURL = process.env.HOSTIFY_API_URL || 'https://api-rms.hostify.com';
        this.apiKey = process.env.HOSTIFY_API_KEY || 'CePFsroZu03LA6C5szMsRuA2Eh62rGDS';

        // AGGRESSIVE CACHING
        this._reservationsCache = new Map(); // key: "startDate|endDate|listingId|dateType"
        this._reservationsCacheTTL = 2 * 60 * 1000; // 2 minutes
        this._propertiesCache = null;
        this._propertiesCacheTime = null;
        this._propertiesCacheTTL = 10 * 60 * 1000; // 10 minutes
        this._usersCache = null;
        this._usersCacheTime = null;
        this._usersCacheTTL = 10 * 60 * 1000; // 10 minutes

        // Fee details cache - stores fee details for individual reservations
        this._feeDetailsCache = new Map(); // key: reservationId, value: { fees, time }
        this._feeDetailsCacheTTL = 5 * 60 * 1000; // 5 minutes

        // Child listings cache - stores child listing IDs for parent listings
        this._childListingsCache = new Map(); // key: parentId, value: { childIds, time }
        this._childListingsCacheTTL = 10 * 60 * 1000; // 10 minutes
    }

    // Get listing's pets_fee from Hostify RMS API /listings endpoint
    async getListingPetFee(listingId) {
        try {
            // Use cache if available (from getAllProperties)
            if (this._propertiesCache && this._propertiesCacheTime &&
                (Date.now() - this._propertiesCacheTime) < this._propertiesCacheTTL) {
                const listings = this._propertiesCache.result || [];
                const listing = listings.find(l => l.id === parseInt(listingId));
                const petFee = listing?.pets_fee ? parseFloat(listing.pets_fee) : 0;
                return petFee;
            }

            // Load all listings to cache (more efficient than individual calls)
            await this.getAllProperties();

            // Now get from cache
            const listings = this._propertiesCache?.result || [];
            const listing = listings.find(l => l.id === parseInt(listingId));
            const petFee = listing?.pets_fee ? parseFloat(listing.pets_fee) : 0;
            return petFee;
        } catch (error) {
            console.log(`[WARN] Failed to get pets_fee for listing ${listingId}: ${error.message}`);
            return 0;
        }
    }

    _getCacheKey(startDate, endDate, listingId, dateType) {
        return `${startDate}|${endDate}|${listingId || 'all'}|${dateType}`;
    }

    _isReservationsCacheValid(key) {
        const cached = this._reservationsCache.get(key);
        if (!cached) return false;
        return (Date.now() - cached.time) < this._reservationsCacheTTL;
    }

    clearAllCaches() {
        this._reservationsCache.clear();
        this._propertiesCache = null;
        this._propertiesCacheTime = null;
        this._usersCache = null;
        this._usersCacheTime = null;
        this._feeDetailsCache.clear();
        this._childListingsCache.clear();
    }

    async makeRequest(endpoint, params = {}, method = 'GET') {
        if (!this.apiKey) {
            throw new Error('Hostify API Key is required.');
        }

        try {
            const config = {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // Reduced from 30s to 15s for faster failures
            };

            let response;
            if (method === 'GET') {
                config.params = params;
                response = await axios.get(`${this.baseURL}${endpoint}`, config);
            } else if (method === 'POST') {
                response = await axios.post(`${this.baseURL}${endpoint}`, params, config);
            }

            return response.data;
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                throw new Error('Hostify API Authentication Error. Check API key.');
            }
            throw new Error(`Hostify API Error: ${error.message}`);
        }
    }

    async getReservations(startDate, endDate, page = 1, perPage = 100, listingId = null, dateType = 'checkIn') {
        const params = { page, per_page: perPage };

        // Add listing filter if specified
        if (listingId) {
            params.listing_id = listingId;
        }

        if (dateType === 'checkOut' || dateType === 'departureDate') {
            params.filters = JSON.stringify([
                { field: 'checkOut', operator: '>=', value: startDate },
                { field: 'checkOut', operator: '<=', value: endDate }
            ]);
        } else {
            params.start_date = startDate;
            params.end_date = endDate;
        }

        return await this.makeRequest('/reservations', params);
    }

    // Fetch reservations for a specific listing ID
    async getReservationsForListing(listingId, startDate, endDate, dateType = 'checkIn') {
        let allReservations = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        try {
            while (hasMore) {
                const response = await this.getReservations(startDate, endDate, page, perPage, listingId, dateType);

                if (response.success && response.reservations?.length > 0) {
                    allReservations = allReservations.concat(response.reservations);
                    hasMore = response.reservations.length === perPage && response.total > allReservations.length;
                    page++;
                    if (page > 50) break; // Safety limit
                } else {
                    if (!response.success) {
                        console.log(`[LISTING-FETCH-ERR] Listing ${listingId}: API returned success=false`);
                    }
                    hasMore = false;
                }
            }
        } catch (error) {
            console.log(`[LISTING-FETCH-ERR] Listing ${listingId}: ${error.message}`);
            return [];
        }

        return allReservations.map(r => this.transformReservation(r));
    }

    // Fetch reservations for multiple listings in parallel
    async getReservationsForListings(listingIds, startDate, endDate, dateType = 'checkIn') {
        console.log(`[PARALLEL] Fetching reservations for ${listingIds.length} listings in parallel...`);

        const results = await Promise.all(
            listingIds.map(async listingId => {
                const reservations = await this.getReservationsForListing(listingId, startDate, endDate, dateType);
                return { listingId, reservations };
            })
        );

        // Merge all reservations
        let allReservations = [];
        results.forEach(({ listingId, reservations }) => {
            if (reservations.length > 0) {
                console.log(`[PARALLEL] Listing ${listingId}: ${reservations.length} reservations`);
            }
            allReservations = allReservations.concat(reservations);
        });

        console.log(`[PARALLEL] Total: ${allReservations.length} reservations from ${listingIds.length} listings`);
        return allReservations;
    }

    async getAllReservations(startDate, endDate, listingId = null, dateType = 'checkIn') {
        // Check cache first
        const cacheKey = this._getCacheKey(startDate, endDate, listingId, dateType);
        if (this._isReservationsCacheValid(cacheKey)) {
            return this._reservationsCache.get(cacheKey).data;
        }

        let allReservations = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
            const response = await this.getReservations(startDate, endDate, page, perPage, listingId, dateType);

            if (response.success && response.reservations?.length > 0) {
                allReservations = allReservations.concat(response.reservations);
                hasMore = response.reservations.length === perPage && response.total > allReservations.length;
                page++;
                if (page > 100) break; // Safety limit
            } else {
                hasMore = false;
            }
        }

        // Filter by parent_listing_id if listing filter was specified
        if (listingId) {
            allReservations = allReservations.filter(res => {
                const parentId = res.parent_listing_id || res.listing_id;
                return parseInt(parentId) === parseInt(listingId);
            });
        }

        const result = { result: allReservations.map(r => this.transformReservation(r)) };

        // Cache the result
        this._reservationsCache.set(cacheKey, { data: result, time: Date.now() });

        return result;
    }

    async getAllReservationsWithFinanceData(startDate, endDate, listingId = null) {
        // Get basic reservation list
        const response = await this.getAllReservations(startDate, endDate, listingId);
        const reservations = response.result || [];

        // Fetch detailed financial data for each reservation (in parallel batches)
        const batchSize = 20; // Increased from 10 for better performance
        const enrichedReservations = [];

        for (let i = 0; i < reservations.length; i += batchSize) {
            const batch = reservations.slice(i, i + batchSize);
            const detailedBatch = await Promise.all(
                batch.map(async (res) => {
                    try {
                        const details = await this.getReservationDetails(res.hostifyId);
                        if (details.success && details.reservation) {
                            // Re-transform with full financial details
                            return this.transformReservation(details.reservation);
                        }
                        return res; // Fallback to basic data
                    } catch (error) {
                        console.log(`[WARN] Failed to fetch details for reservation ${res.hostifyId}: ${error.message}`);
                        return res; // Fallback to basic data
                    }
                })
            );
            enrichedReservations.push(...detailedBatch);
        }

        return { result: enrichedReservations };
    }

    async getReservationsForWeek(weekStartDate) {
        const startDate = new Date(weekStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        const response = await this.getAllReservations(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
        return response.result || [];
    }

    async getProperties() {
        return await this.makeRequest('/listings', { service_pms: 1 });
    }

    async getAllProperties() {
        // Check cache first
        if (this._propertiesCache && this._propertiesCacheTime &&
            (Date.now() - this._propertiesCacheTime) < this._propertiesCacheTTL) {
            return this._propertiesCache;
        }

        let allProperties = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
            const response = await this.makeRequest('/listings', { page, per_page: perPage, service_pms: 1 });

            if (response.success && response.listings?.length > 0) {
                allProperties = allProperties.concat(response.listings);
                hasMore = response.listings.length === perPage && response.total > allProperties.length;
                page++;
                if (page > 50) break; // Safety limit
            } else {
                hasMore = false;
            }
        }

        const result = { result: allProperties };
        this._propertiesCache = result;
        this._propertiesCacheTime = Date.now();

        return result;
    }

    async getProperty(listingId) {
        return await this.makeRequest(`/listings/${listingId}`);
    }

    // Get child listings for a parent listing (with caching)
    async getChildListings(parentId) {
        const cacheKey = parseInt(parentId);

        // Check cache first
        const cached = this._childListingsCache.get(cacheKey);
        if (cached && (Date.now() - cached.time) < this._childListingsCacheTTL) {
            return cached.childIds;
        }

        try {
            const response = await this.makeRequest(`/listings/children/${parentId}`, { service_pms: 1 });
            if (response.success && response.listings && response.listings.length > 0) {
                const childIds = response.listings.map(l => parseInt(l.id));
                console.log(`[PARENT-CHILD] Parent ${parentId} has ${childIds.length} children: ${childIds.join(', ')}`);

                // Cache the result
                this._childListingsCache.set(cacheKey, { childIds, time: Date.now() });
                return childIds;
            }

            // Cache empty result too
            this._childListingsCache.set(cacheKey, { childIds: [], time: Date.now() });
            return [];
        } catch (error) {
            console.log(`[PARENT-CHILD] Error fetching children for listing ${parentId}: ${error.message}`);
            // Don't cache errors - network issues should be retried
            return [];
        }
    }

    // Expand listing IDs to include child listings
    async expandListingIdsWithChildren(listingIds) {
        if (!listingIds || listingIds.length === 0) {
            return [];
        }

        const expandedIds = new Set(listingIds.map(id => parseInt(id)));

        // For each listing, check if it has children and add them
        for (const listingId of listingIds) {
            const childIds = await this.getChildListings(listingId);
            childIds.forEach(childId => expandedIds.add(childId));
        }

        const result = Array.from(expandedIds);
        if (result.length > listingIds.length) {
            console.log(`[EXPAND] Expanded ${listingIds.length} listing(s) to ${result.length} (including children)`);
        }
        return result;
    }

    // Get individual reservation details with fees breakdown (with caching)
    async getReservationDetails(reservationId) {
        // Check cache first
        const cached = this._feeDetailsCache.get(reservationId);
        if (cached && (Date.now() - cached.time) < this._feeDetailsCacheTTL) {
            return cached.data;
        }

        const result = await this.makeRequest(`/reservations/${reservationId}`, { fees: 1 });

        // Cache the result
        this._feeDetailsCache.set(reservationId, { data: result, time: Date.now() });

        return result;
    }

    // Calculate cleaningAndOtherFees from fees array
    // Sum all fees where fee.type === "fee" (excluding Claims Fee, Resort Fee, Management Fee)
    calculateFeesFromArray(fees) {
        if (!fees || !Array.isArray(fees)) {
            return { cleaningFee: 0, otherFees: 0, totalFees: 0 };
        }

        let cleaningFee = 0;
        let otherFees = 0;

        // Fees to exclude from guest-paid totals
        const excludedFees = ['claims fee', 'resort fee', 'management fee'];

        fees.forEach(feeItem => {
            const feeType = feeItem.fee?.type;
            const feeName = feeItem.fee?.name || '';
            const feeNameLower = feeName.toLowerCase();
            const amount = parseFloat(feeItem.amount_gross || 0);

            // Only process fees of type "fee" (not "accommodation" or "tax")
            if (feeType === 'fee') {
                // Exclude certain fees
                if (excludedFees.some(excluded => feeNameLower.includes(excluded))) {
                    return;
                }

                // Separate cleaning fee from other fees
                if (feeNameLower.includes('cleaning')) {
                    cleaningFee += amount;
                } else {
                    otherFees += amount;
                }
            }
        });

        return {
            cleaningFee,
            otherFees,
            totalFees: cleaningFee + otherFees
        };
    }

    async getUsers() {
        // Check cache first
        if (this._usersCache && this._usersCacheTime &&
            (Date.now() - this._usersCacheTime) < this._usersCacheTTL) {
            return this._usersCache;
        }

        const result = await this.makeRequest('/users');
        this._usersCache = result;
        this._usersCacheTime = Date.now();
        return result;
    }

    async getUser(userId) {
        return await this.makeRequest(`/users/${userId}`);
    }

    // Transform Hostify user to our Owner format
    transformUser(hostifyUser) {
        return {
            id: hostifyUser.id,
            hostifyId: hostifyUser.id,
            name: `${hostifyUser.first_name || ''} ${hostifyUser.last_name || ''}`.trim() || hostifyUser.username,
            email: hostifyUser.username, // Hostify uses username as email
            phone: hostifyUser.phone || '',
            address: 'Address not specified',
            defaultPmPercentage: 15.00,
            techFeeEnabled: true,
            insuranceFeeEnabled: true,
            isActive: hostifyUser.is_active === 1,
            roles: Array.isArray(hostifyUser.roles) ? hostifyUser.roles : [hostifyUser.roles].filter(Boolean),
            status: hostifyUser.status,
            listingIds: hostifyUser.listings ? hostifyUser.listings.map(l => l.id) : [],
            createdAt: new Date().toISOString()
        };
    }

    async getAllOwners() {
        try {
            const response = await this.getUsers();
            if (!response.success || !response.users) return [];
            return response.users
                .filter(user => user.is_active === 1)
                .map(user => this.transformUser(user));
        } catch (error) {
            throw error;
        }
    }

    // Transform Hostify reservation data to our format
    transformReservation(hostifyReservation) {
        // Try to get guest name from multiple possible fields
        let guestName = 'Guest';
        if (hostifyReservation.guestName) {
            guestName = hostifyReservation.guestName;
        } else if (hostifyReservation.guest_name) {
            guestName = hostifyReservation.guest_name;
        } else if (hostifyReservation.guest?.name) {
            guestName = hostifyReservation.guest.name;
        } else if (hostifyReservation.guest?.first_name || hostifyReservation.guest?.last_name) {
            guestName = `${hostifyReservation.guest.first_name || ''} ${hostifyReservation.guest.last_name || ''}`.trim();
        } else if (hostifyReservation.guestFirstName || hostifyReservation.guestLastName) {
            guestName = `${hostifyReservation.guestFirstName || ''} ${hostifyReservation.guestLastName || ''}`.trim();
        }
        
        // Debug logging for parent_id field
        const parentListingId = hostifyReservation.parent_listing_id || hostifyReservation.parent_id;
        const listingId = hostifyReservation.listing_id;
        const finalPropertyId = parseInt(parentListingId || listingId);
        
        
        const baseReservation = {
            hostifyId: hostifyReservation.id ? hostifyReservation.id.toString() : 'undefined',
            // Use parent_listing_id (or parent_id) if available (for multi-channel/multi-unit properties), otherwise listing_id
            propertyId: finalPropertyId,
            guestName: guestName,
            guestEmail: hostifyReservation.guest?.email || hostifyReservation.guestEmail || '',
            checkInDate: hostifyReservation.checkIn,
            checkOutDate: hostifyReservation.checkOut,
            nights: parseInt(hostifyReservation.nights || 0),
            status: this.mapStatus(hostifyReservation.status),
            source: hostifyReservation.source || 'Unknown',
            isProrated: false, // Will be determined by business rules
            weeklyPayoutDate: null // Will be set when processing
        };

        // Extract detailed financial data from Hostify response
        const baseRate = parseFloat(hostifyReservation.base_price || 0);
        const cleaningFee = parseFloat(hostifyReservation.cleaning_fee || 0);
        // Pet fee is in its own field
        const petsFee = parseFloat(hostifyReservation.pets_fee || 0);
        // extras_price may contain additional fees, addons_price for other add-ons
        const extrasPrice = parseFloat(hostifyReservation.extras_price || 0);
        const addonsPrice = parseFloat(hostifyReservation.addons_price || 0);
        // extra_person fee for additional guests
        const extraPersonFee = parseFloat(hostifyReservation.extra_person || 0);
        const cleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraPersonFee;

        // Debug logging for pet/extra fees (only when non-zero)
        if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraPersonFee > 0) {
            console.log(`[FEE] ${guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraPerson=${extraPersonFee} => TOTAL=${cleaningAndOtherFees}`);
        }
        const channelCommission = parseFloat(hostifyReservation.channel_commission || 0);
        const transactionFee = parseFloat(hostifyReservation.transaction_fee || 0);
        const platformFees = channelCommission + transactionFee;
        const taxAmount = parseFloat(hostifyReservation.tax_amount || 0);
        
        // Calculate totals - Revenue = base + fees - platform
        const clientRevenue = baseRate + cleaningAndOtherFees - platformFees;
        const clientPayout = parseFloat(hostifyReservation.payout_price || 0);
        
        return {
            ...baseReservation,
            // Detailed financial breakdown
            baseRate: baseRate,
            cleaningFee: cleaningFee, // Guest-paid cleaning fee (for pass-through feature)
            cleaningAndOtherFees: cleaningAndOtherFees,
            platformFees: platformFees,
            clientRevenue: clientRevenue,
            luxuryLodgingFee: 0, // PM Commission will be calculated based on property's pmFeePercentage
            clientTaxResponsibility: taxAmount,
            clientPayout: clientPayout,
            // Legacy fields for compatibility
            grossAmount: clientRevenue,
            hostPayoutAmount: clientPayout,
            hasDetailedFinance: true
        };
    }

    mapStatus(hostifyStatus) {
        const statusMap = {
            'accepted': 'confirmed',
            'confirmed': 'confirmed',
            'pending': 'new',
            'new': 'new',
            'cancelled': 'cancelled',
            'cancelled_by_guest': 'cancelled',
            'cancelled_by_host': 'cancelled',
            'denied': 'cancelled',
            'completed': 'completed',
            'no_show': 'cancelled',
            'inquiry': 'inquiry',
            'expired': 'expired',
            'declined': 'declined',
            'declined_inq': 'inquiry',
            'offer': 'new',
            'withdrawn': 'cancelled'
        };
        return statusMap[hostifyStatus] || 'unknown';
    }

    async getOverlappingReservations(listingIds, fromDate, toDate, includeChildListings = false) {
        try {
            const allReservations = new Map();

            // Only expand listing IDs to include children if the setting is enabled
            let expandedListingIds = listingIds.map(id => parseInt(id));
            const childToParentMap = new Map();

            if (includeChildListings) {
                // Fetch all children in parallel and build maps at once
                const childResults = await Promise.all(
                    listingIds.map(async parentId => ({
                        parentId: parseInt(parentId),
                        childIds: await this.getChildListings(parentId)
                    }))
                );

                // Build expanded list and child->parent map in one pass
                childResults.forEach(({ parentId, childIds }) => {
                    childIds.forEach(childId => {
                        expandedListingIds.push(childId);
                        childToParentMap.set(childId, parentId);
                    });
                });

                if (childToParentMap.size > 0) {
                    console.log(`[EXPAND] Expanded ${listingIds.length} listing(s) to ${expandedListingIds.length} (including ${childToParentMap.size} children)`);
                }
            }

            // Look back 12 months to catch long-term stays that started months ago
            // Look forward 12 months because Hostify API filters by CHECKOUT date (not check-in)
            // This catches long-term stays that check out up to a year after the statement period
            const lookbackDate = new Date(fromDate);
            lookbackDate.setDate(lookbackDate.getDate() - 365);
            const lookforwardDate = new Date(toDate);
            lookforwardDate.setDate(lookforwardDate.getDate() + 365);

            // Fetch reservations for each listing in PARALLEL (much faster than fetching all and filtering)
            const reservationsList = await this.getReservationsForListings(
                expandedListingIds,
                lookbackDate.toISOString().split('T')[0],
                lookforwardDate.toISOString().split('T')[0],
                'checkIn'
            );

            const periodStart = new Date(fromDate);
            const periodEnd = new Date(toDate);

            reservationsList.forEach(res => {
                // If this is a child listing, attribute to parent
                if (childToParentMap.has(res.propertyId)) {
                    const originalChildId = res.propertyId;
                    res.childListingId = originalChildId; // Keep original for reference
                    res.propertyId = childToParentMap.get(originalChildId);
                    console.log(`[CHILD-ATTRIB] Reservation ${res.hostifyId}: child ${originalChildId} -> parent ${res.propertyId}`);
                }

                const arrivalDate = new Date(res.checkInDate);
                const departureDate = new Date(res.checkOutDate);

                // Check overlap
                if (arrivalDate <= periodEnd && departureDate > periodStart) {
                    res.arrivalDate = res.checkInDate;
                    res.departureDate = res.checkOutDate;
                    res.id = res.hostifyId;
                    allReservations.set(res.hostifyId, res);
                }
            });

            // Enrich with detailed financial data (pets_fee, extras, etc.)
            const filteredReservations = Array.from(allReservations.values());
            console.log(`[OVERLAP] Enriching ${filteredReservations.length} reservations with detailed financial data...`);

            const batchSize = 50; // Increased for better performance with caching
            const enrichedReservations = [];

            for (let i = 0; i < filteredReservations.length; i += batchSize) {
                const batch = filteredReservations.slice(i, i + batchSize);
                const detailedBatch = await Promise.all(
                    batch.map(async (res) => {
                        try {
                            const details = await this.getReservationDetails(res.hostifyId);

                            if (details.success && details.reservation) {
                                const detailData = details.reservation;

                                // Use fees array if available (from ?fees=1 parameter)
                                if (details.fees && Array.isArray(details.fees)) {
                                    const feeCalc = this.calculateFeesFromArray(details.fees);
                                    const cleaningFee = feeCalc.cleaningFee;
                                    const newCleaningAndOtherFees = feeCalc.totalFees;

                                    // Log fees from API
                                    if (feeCalc.otherFees > 0) {
                                        console.log(`[FEE-API] ${res.guestName}: cleaning=${cleaningFee}, otherFees=${feeCalc.otherFees} => TOTAL=${newCleaningAndOtherFees}`);
                                    }

                                    return {
                                        ...res,
                                        cleaningFee: cleaningFee,
                                        cleaningAndOtherFees: newCleaningAndOtherFees,
                                        clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees
                                    };
                                }

                                // Fallback to old method if fees array not available
                                const resPetFee = parseFloat(detailData.pets_fee || 0);
                                const listingPetFee = resPetFee === 0 ? await this.getListingPetFee(res.propertyId) : 0;
                                const petsFee = resPetFee || listingPetFee;
                                const extrasPrice = parseFloat(detailData.extras_price || 0);
                                const addonsPrice = parseFloat(detailData.addons_price || 0);
                                const extraPersonFee = parseFloat(detailData.extra_person || 0);
                                const cleaningFee = parseFloat(detailData.cleaning_fee || res.cleaningFee || 0);
                                const newCleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraPersonFee;

                                if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraPersonFee > 0) {
                                    console.log(`[FEE-FALLBACK] ${res.guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraPerson=${extraPersonFee} => TOTAL=${newCleaningAndOtherFees}`);
                                }

                                return {
                                    ...res,
                                    cleaningFee: cleaningFee,
                                    cleaningAndOtherFees: newCleaningAndOtherFees,
                                    clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees
                                };
                            }
                            return res;
                        } catch (error) {
                            console.log(`[WARN] Failed to fetch details for ${res.hostifyId}: ${error.message}`);
                            return res;
                        }
                    })
                );
                enrichedReservations.push(...detailedBatch);
            }

            console.log(`[OVERLAP] Enriched ${enrichedReservations.length} reservations`);
            return enrichedReservations;
        } catch (error) {
            throw error;
        }
    }

    async getConsolidatedFinanceReport(params = {}) {
        const { listingMapIds = [], fromDate, toDate, dateType = 'checkOut', includeChildListings = false } = params;

        // Only expand listing IDs to include children if the setting is enabled
        let expandedListingIds = listingMapIds.map(id => parseInt(id));
        const childToParentMap = new Map();

        if (includeChildListings && listingMapIds.length > 0) {
            // Fetch all children in parallel and build maps at once
            const childResults = await Promise.all(
                listingMapIds.map(async parentId => ({
                    parentId: parseInt(parentId),
                    childIds: await this.getChildListings(parentId)
                }))
            );

            // Build expanded list and child->parent map in one pass
            childResults.forEach(({ parentId, childIds }) => {
                childIds.forEach(childId => {
                    expandedListingIds.push(childId);
                    childToParentMap.set(childId, parentId);
                });
            });

            if (childToParentMap.size > 0) {
                console.log(`[FINANCE-EXPAND] Expanded ${listingMapIds.length} listing(s) to ${expandedListingIds.length} (including ${childToParentMap.size} children)`);
            }
        }

        // Fetch reservations for each listing in PARALLEL (much faster than fetching all and filtering)
        let allReservations = [];
        if (expandedListingIds.length > 0) {
            allReservations = await this.getReservationsForListings(expandedListingIds, fromDate, toDate, dateType);

            // Attribute child reservations to parent
            allReservations = allReservations.map(res => {
                if (childToParentMap.has(res.propertyId)) {
                    return {
                        ...res,
                        childListingId: res.propertyId, // Keep original for reference
                        propertyId: childToParentMap.get(res.propertyId)
                    };
                }
                return res;
            });
        }

        // Fetch detailed financial data for filtered reservations only (pets_fee, extras, etc.)
        const batchSize = 50; // Increased for better performance with caching
        const enrichedReservations = [];

        console.log(`[FINANCE] Enriching ${allReservations.length} reservations with detailed financial data...`);

        for (let i = 0; i < allReservations.length; i += batchSize) {
            const batch = allReservations.slice(i, i + batchSize);
            const detailedBatch = await Promise.all(
                batch.map(async (res) => {
                    try {
                        const details = await this.getReservationDetails(res.hostifyId);

                        if (details.success && details.reservation) {
                            const detailData = details.reservation;

                            // Use fees array if available (from ?fees=1 parameter)
                            if (details.fees && Array.isArray(details.fees)) {
                                const feeCalc = this.calculateFeesFromArray(details.fees);
                                const cleaningFee = feeCalc.cleaningFee;
                                const newCleaningAndOtherFees = feeCalc.totalFees;

                                // Log fees from API
                                if (feeCalc.otherFees > 0) {
                                    console.log(`[FEE-API] ${res.guestName}: cleaning=${cleaningFee}, otherFees=${feeCalc.otherFees} => TOTAL=${newCleaningAndOtherFees}`);
                                }

                                return {
                                    ...res,
                                    cleaningFee: cleaningFee,
                                    cleaningAndOtherFees: newCleaningAndOtherFees,
                                    clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees
                                };
                            }

                            // Fallback to old method if fees array not available
                            const resPetFee = parseFloat(detailData.pets_fee || 0);
                            const listingPetFee = resPetFee === 0 ? await this.getListingPetFee(res.propertyId) : 0;
                            const petsFee = resPetFee || listingPetFee;
                            const extrasPrice = parseFloat(detailData.extras_price || 0);
                            const addonsPrice = parseFloat(detailData.addons_price || 0);
                            const extraPersonFee = parseFloat(detailData.extra_person || 0);
                            const cleaningFee = parseFloat(detailData.cleaning_fee || res.cleaningFee || 0);
                            const newCleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraPersonFee;

                            if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraPersonFee > 0) {
                                console.log(`[FEE-FALLBACK] ${res.guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraPerson=${extraPersonFee} => TOTAL=${newCleaningAndOtherFees}`);
                            }

                            return {
                                ...res,
                                cleaningFee: cleaningFee,
                                cleaningAndOtherFees: newCleaningAndOtherFees,
                                clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees
                            };
                        }
                        return res;
                    } catch (error) {
                        console.log(`[WARN] Failed to fetch details for ${res.hostifyId}: ${error.message}`);
                        return res;
                    }
                })
            );
            enrichedReservations.push(...detailedBatch);
        }

        console.log(`[FINANCE] Enriched ${enrichedReservations.length} reservations`);
        return enrichedReservations;
    }
}

module.exports = new HostifyService();
