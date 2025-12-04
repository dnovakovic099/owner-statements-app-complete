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
        const batchSize = 10; // Process 10 at a time to avoid rate limits
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

    // Get individual reservation details (includes pets_fee and other detailed fields)
    async getReservationDetails(reservationId) {
        return await this.makeRequest(`/reservations/${reservationId}`);
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

    async getOverlappingReservations(listingIds, fromDate, toDate) {
        try {
            const allReservations = new Map();

            // Look back/forward to catch long stays
            const lookbackDate = new Date(fromDate);
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookforwardDate = new Date(toDate);
            lookforwardDate.setDate(lookforwardDate.getDate() + 90);

            // Fetch all reservations at once (uses cache)
            const response = await this.getAllReservations(
                lookbackDate.toISOString().split('T')[0],
                lookforwardDate.toISOString().split('T')[0],
                null
            );

            if (response.result) {
                const listingIdSet = new Set(listingIds.map(id => parseInt(id)));
                const periodStart = new Date(fromDate);
                const periodEnd = new Date(toDate);

                response.result.forEach(res => {
                    // Filter by listing
                    if (!listingIdSet.has(res.propertyId)) return;

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
            }

            // Enrich with detailed financial data (pets_fee, extras, etc.)
            const filteredReservations = Array.from(allReservations.values());
            console.log(`[OVERLAP] Enriching ${filteredReservations.length} reservations with detailed financial data...`);

            const batchSize = 10;
            const enrichedReservations = [];

            for (let i = 0; i < filteredReservations.length; i += batchSize) {
                const batch = filteredReservations.slice(i, i + batchSize);
                const detailedBatch = await Promise.all(
                    batch.map(async (res) => {
                        try {
                            const details = await this.getReservationDetails(res.hostifyId);

                            if (details.success && details.reservation) {
                                const detailData = details.reservation;
                                // Get pet fee: try from reservation first, then from listing endpoint
                                const resPetFee = parseFloat(detailData.pets_fee || 0);
                                const listingPetFee = resPetFee === 0 ? await this.getListingPetFee(res.propertyId) : 0;
                                const petsFee = resPetFee || listingPetFee;
                                const extrasPrice = parseFloat(detailData.extras_price || 0);
                                const addonsPrice = parseFloat(detailData.addons_price || 0);
                                const extraPersonFee = parseFloat(detailData.extra_person || 0);
                                const cleaningFee = parseFloat(detailData.cleaning_fee || res.cleaningFee || 0);
                                const newCleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraPersonFee;

                                // Log if we found extra fees
                                if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraPersonFee > 0) {
                                    console.log(`[FEE] ${res.guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraPerson=${extraPersonFee} => TOTAL=${newCleaningAndOtherFees}`);
                                }

                                // Preserve original reservation data, only update financial fields
                                return {
                                    ...res,
                                    cleaningFee: cleaningFee,
                                    cleaningAndOtherFees: newCleaningAndOtherFees,
                                    // Recalculate revenue with new fees
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
        const { listingMapIds = [], fromDate, toDate, dateType = 'checkOut' } = params;

        // Fetch all reservations at once (uses cache)
        const response = await this.getAllReservations(fromDate, toDate, null, dateType);
        let allReservations = response.result || [];

        // Filter by property IDs if specified
        if (listingMapIds.length > 0) {
            const listingIdSet = new Set(listingMapIds.map(id => parseInt(id)));
            allReservations = allReservations.filter(res => listingIdSet.has(res.propertyId));
        }

        // Fetch detailed financial data for filtered reservations only (pets_fee, extras, etc.)
        const batchSize = 10;
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
                            // Get pet fee: try from reservation first, then from listing endpoint
                            const resPetFee = parseFloat(detailData.pets_fee || 0);
                            const listingPetFee = resPetFee === 0 ? await this.getListingPetFee(res.propertyId) : 0;
                            const petsFee = resPetFee || listingPetFee;
                            const extrasPrice = parseFloat(detailData.extras_price || 0);
                            const addonsPrice = parseFloat(detailData.addons_price || 0);
                            const extraPersonFee = parseFloat(detailData.extra_person || 0);
                            const cleaningFee = parseFloat(detailData.cleaning_fee || res.cleaningFee || 0);
                            const newCleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraPersonFee;

                            // Log if we found extra fees
                            if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraPersonFee > 0) {
                                console.log(`[FEE] ${res.guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraPerson=${extraPersonFee} => TOTAL=${newCleaningAndOtherFees}`);
                            }

                            // Preserve original reservation data, only update financial fields
                            return {
                                ...res,
                                cleaningFee: cleaningFee,
                                cleaningAndOtherFees: newCleaningAndOtherFees,
                                // Recalculate revenue with new fees
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

