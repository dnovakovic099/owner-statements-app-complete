const axios = require('axios');

class HostifyService {
    constructor() {
        this.baseURL = process.env.HOSTIFY_API_URL || 'https://api-rms.hostify.com';
        this.apiKey = process.env.HOSTIFY_API_KEY || 'aOGSVrcPGOvvSsGD4idPKvxKaD0HGaAW';

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

        // All listings cache (without service_pms filter) - for child lookup by parent_id
        this._allListingsCache = null;
        this._allListingsCacheTime = null;
        this._allListingsCacheTTL = 10 * 60 * 1000; // 10 minutes
        this._allListingsFetchPromise = null; // Lock for concurrent fetches

        // Exchange rate cache (for converting non-USD currencies)
        this._exchangeRates = new Map(); // key: currency code, value: { rate, time }
        this._exchangeRateTTL = 60 * 60 * 1000; // 1 hour

        // Offboarded listing cache - stores service_pms status for listings
        this._offboardedCache = new Map(); // key: listingId, value: { isOffboarded, time }
        this._offboardedCacheTTL = 10 * 60 * 1000; // 10 minutes
    }

    /**
     * Get exchange rate to USD for a given currency.
     * Uses Frankfurter API (free, no key, daily ECB rates).
     * Returns 1.0 for USD. Caches rates for 1 hour.
     */
    async getExchangeRateToUSD(currency) {
        if (!currency || currency.toUpperCase() === 'USD') return 1.0;

        const code = currency.toUpperCase();
        const cached = this._exchangeRates.get(code);
        if (cached && Date.now() - cached.time < this._exchangeRateTTL) {
            return cached.rate;
        }

        try {
            const response = await axios.get(`https://api.frankfurter.dev/v1/latest?base=${code}&symbols=USD`, { timeout: 10000 });
            const rate = response.data?.rates?.USD;
            if (rate) {
                this._exchangeRates.set(code, { rate, time: Date.now() });
                console.log(`[CURRENCY] Fetched exchange rate: 1 ${code} = ${rate} USD`);
                return rate;
            }
        } catch (error) {
            console.log(`[CURRENCY] Failed to fetch rate for ${code}, using cached or fallback`);
            if (cached) return cached.rate; // Use stale cache if available
        }

        // Fallback rates for common currencies if API fails
        const fallbackRates = { CAD: 0.73, EUR: 1.08, GBP: 1.26, AUD: 0.65, MXN: 0.058 };
        return fallbackRates[code] || 1.0;
    }

    /**
     * Convert all financial fields of a transformed reservation from source currency to USD.
     */
    convertReservationToUSD(reservation, exchangeRate) {
        if (exchangeRate === 1.0) return reservation;

        const financialFields = [
            'baseRate', 'cleaningFee', 'cleaningAndOtherFees', 'platformFees',
            'clientRevenue', 'clientTaxResponsibility', 'clientPayout',
            'resortFee', 'grossAmount', 'hostPayoutAmount'
        ];

        const converted = { ...reservation, originalCurrency: reservation.currency, exchangeRate };
        for (const field of financialFields) {
            if (typeof converted[field] === 'number') {
                converted[field] = Math.round(converted[field] * exchangeRate * 100) / 100;
            }
        }
        converted.currency = 'USD';
        return converted;
    }

    /**
     * Convert an array of reservations to USD. Fetches exchange rates for any non-USD currencies found.
     */
    async convertReservationsBatchToUSD(reservations) {
        // Find unique non-USD currencies
        const currencies = [...new Set(reservations.map(r => r.currency).filter(c => c && c !== 'USD'))];
        if (currencies.length === 0) return reservations;

        // Fetch all needed rates in parallel
        const rates = {};
        await Promise.all(currencies.map(async (cur) => {
            rates[cur] = await this.getExchangeRateToUSD(cur);
        }));

        return reservations.map(r => {
            if (!r.currency || r.currency === 'USD') return r;
            const rate = rates[r.currency] || 1.0;
            return this.convertReservationToUSD(r, rate);
        });
    }

    // Get all listings (without service_pms filter) for child lookup by parent_id
    // Cached separately from getAllProperties to avoid breaking existing logic
    async _getAllListingsForChildLookup() {
        // Check cache first
        if (this._allListingsCache && this._allListingsCacheTime &&
            (Date.now() - this._allListingsCacheTime) < this._allListingsCacheTTL) {
            return this._allListingsCache;
        }

        // Prevent duplicate concurrent fetches
        if (this._allListingsFetchPromise) {
            return this._allListingsFetchPromise;
        }

        this._allListingsFetchPromise = (async () => {
            try {
                // Single API call with high per_page, include inactive listings for child lookup
                const response = await this.makeRequest('/listings', { per_page: 500, is_active: 'all' });
                const allListings = response.success && response.listings ? response.listings : [];

                this._allListingsCache = allListings;
                this._allListingsCacheTime = Date.now();
                return allListings;
            } catch (error) {
                return [];
            } finally {
                this._allListingsFetchPromise = null;
            }
        })();

        return this._allListingsFetchPromise;
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

    /**
     * Check if a listing is offboarded (service_pms=0) in Hostify.
     * Uses caching to avoid repeated API calls.
     */
    async isListingOffboarded(listingId) {
        const id = parseInt(listingId);
        const cached = this._offboardedCache.get(id);
        if (cached && (Date.now() - cached.time) < this._offboardedCacheTTL) {
            return cached.isOffboarded;
        }

        try {
            const response = await this.makeRequest(`/listings/${id}`);
            const isOffboarded = response.success && response.listing && response.listing.service_pms === 0;
            this._offboardedCache.set(id, { isOffboarded, time: Date.now() });
            return isOffboarded;
        } catch (error) {
            console.log(`[OFFBOARDED] Failed to check listing ${id}: ${error.message}`);
            return false;
        }
    }

    clearAllCaches() {
        this._reservationsCache.clear();
        this._propertiesCache = null;
        this._propertiesCacheTime = null;
        this._usersCache = null;
        this._usersCacheTime = null;
        this._feeDetailsCache.clear();
        this._childListingsCache.clear();
        this._allListingsCache = null;
        this._allListingsCacheTime = null;
        this._allListingsFetchPromise = null;
        this._offboardedCache.clear();
    }

    async makeRequest(endpoint, params = {}, method = 'GET', maxRetries = 3) {
        if (!this.apiKey) {
            throw new Error('Hostify API Key is required.');
        }

        const config = {
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 45000 // 45 second timeout (increased for bulk scheduler operations)
        };

        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                let response;
                if (method === 'GET') {
                    config.params = params;
                    response = await axios.get(`${this.baseURL}${endpoint}`, config);
                } else if (method === 'POST') {
                    response = await axios.post(`${this.baseURL}${endpoint}`, params, config);
                }

                return response.data;
            } catch (error) {
                lastError = error;

                // Auth errors - don't retry
                if (error.response?.status === 401 || error.response?.status === 403) {
                    throw new Error('Hostify API Authentication Error. Check API key.');
                }

                // Check if it's a retryable error (timeout, network, server error)
                const isRetryable = error.code === 'ECONNABORTED' ||
                                    error.code === 'ETIMEDOUT' ||
                                    error.code === 'ENOTFOUND' ||
                                    error.code === 'ECONNRESET' ||
                                    error.message?.includes('timeout') ||
                                    error.response?.status >= 500;

                // If not retryable, throw immediately
                if (!isRetryable) {
                    throw new Error(`Hostify API Error: ${error.message}`);
                }

                // If we have more retries left, wait and retry
                if (attempt < maxRetries) {
                    const delay = 1000 * attempt; // 1s, 2s, 3s, 4s, 5s, 6s
                    console.log(`[HOSTIFY] Retry ${attempt}/${maxRetries} for ${endpoint}: ${error.message} (waiting ${delay}ms)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All retries exhausted
        throw new Error(`Hostify API Error after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
    }

    async getReservations(startDate, endDate, page = 1, perPage = 100, listingId = null, dateType = 'checkIn', useListingFilter = false) {
        const params = {
            page,
            per_page: perPage,
            fees: 1  // Include detailed fees (pets_fee, extras, addons) in response
        };

        // Add listing filter if specified
        // useListingFilter=true puts listing_id in the filters array instead of query param
        // This is needed for offboarded listings (service_pms=0) which are hidden from the query param approach
        if (listingId && !useListingFilter) {
            params.listing_id = listingId;
        }

        if (dateType === 'checkOut' || dateType === 'departureDate') {
            const filters = [
                { field: 'checkOut', operator: '>=', value: startDate },
                { field: 'checkOut', operator: '<=', value: endDate }
            ];
            if (listingId && useListingFilter) {
                filters.push({ field: 'listing_id', operator: '=', value: String(listingId) });
            }
            params.filters = JSON.stringify(filters);
        } else {
            params.start_date = startDate;
            params.end_date = endDate;
            if (listingId && useListingFilter) {
                params.filters = JSON.stringify([
                    { field: 'listing_id', operator: '=', value: String(listingId) }
                ]);
            }
        }

        return await this.makeRequest('/reservations', params);
    }

    // Fetch reservations for a specific listing ID
    // Includes fallback for offboarded listings (service_pms=0) using filter-based approach
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

            // Fallback for offboarded listings: if 0 results, check if listing is offboarded
            // and retry using listing_id as a filter field (bypasses Hostify's service_pms exclusion)
            if (allReservations.length === 0) {
                const offboarded = await this.isListingOffboarded(listingId);
                if (offboarded) {
                    console.log(`[OFFBOARDED] Listing ${listingId} is offboarded (service_pms=0), retrying with filter-based approach...`);
                    page = 1;
                    hasMore = true;
                    while (hasMore) {
                        const response = await this.getReservations(startDate, endDate, page, perPage, listingId, dateType, true);

                        if (response.success && response.reservations?.length > 0) {
                            allReservations = allReservations.concat(response.reservations);
                            hasMore = response.reservations.length === perPage && response.total > allReservations.length;
                            page++;
                            if (page > 50) break;
                        } else {
                            hasMore = false;
                        }
                    }
                    if (allReservations.length > 0) {
                        console.log(`[OFFBOARDED] Found ${allReservations.length} reservations for offboarded listing ${listingId} via filter approach`);
                    } else {
                        console.log(`[OFFBOARDED] No reservations found for offboarded listing ${listingId} even with filter approach`);
                    }
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

        // Fallback for offboarded listings: retry with listing_id as filter field
        if (allReservations.length === 0 && listingId) {
            const offboarded = await this.isListingOffboarded(listingId);
            if (offboarded) {
                console.log(`[OFFBOARDED] Listing ${listingId} is offboarded, retrying getAllReservations with filter approach...`);
                page = 1;
                hasMore = true;
                while (hasMore) {
                    const response = await this.getReservations(startDate, endDate, page, perPage, listingId, dateType, true);
                    if (response.success && response.reservations?.length > 0) {
                        allReservations = allReservations.concat(response.reservations);
                        hasMore = response.reservations.length === perPage && response.total > allReservations.length;
                        page++;
                        if (page > 100) break;
                    } else {
                        hasMore = false;
                    }
                }
                if (allReservations.length > 0) {
                    console.log(`[OFFBOARDED] Found ${allReservations.length} reservations for offboarded listing ${listingId} via filter approach`);
                }
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
        const batchSize = 20; // Reduced to avoid API rate limits
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

        // Convert any non-USD reservations to USD
        const usdReservations = await this.convertReservationsBatchToUSD(enrichedReservations);
        return { result: usdReservations };
    }

    /**
     * BULK FETCH: Get ALL reservations for bulk statement generation
     * - Fetches reservations for the specified date range (or past 365 days if not specified)
     * - Handles pagination to get every reservation
     * - Builds child-to-parent listing map
     * - Attributes child reservations to parent listings
     * - Enriches with detailed financial data
     *
     * This is designed for "Generate All" bulk operations where reliability > speed
     */
    async bulkFetchAllReservations(progressCallback = null, requestedStartDate = null, requestedEndDate = null) {
        const startTime = Date.now();

        // Use requested date range or default to past 365 days
        let fromDate, toDate;
        if (requestedStartDate && requestedEndDate) {
            fromDate = requestedStartDate;
            toDate = requestedEndDate;
            console.log(`[BULK-FETCH] Starting bulk reservation fetch for requested period: ${fromDate} to ${toDate}`);
        } else {
            // Default: past 365 days to today + 30 days
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 30);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
            fromDate = startDate.toISOString().split('T')[0];
            toDate = endDate.toISOString().split('T')[0];
            console.log(`[BULK-FETCH] Starting bulk reservation fetch for past 365 days...`);
        }

        console.log(`[BULK-FETCH] Date range: ${fromDate} to ${toDate}`);

        // Step 1: Fetch ALL reservations with PARALLEL pagination (much faster!)
        let allRawReservations = [];
        const perPage = 100;
        const parallelBatchSize = 10; // Fetch 10 pages at a time to avoid API rate limits

        console.log('[BULK-FETCH] Step 1: Fetching all reservations with PARALLEL pagination...');

        // First, get page 1 to know total count
        const firstResponse = await this.getReservations(fromDate, toDate, 1, perPage, null, 'checkIn');
        if (!firstResponse.success || !firstResponse.reservations?.length) {
            console.log('[BULK-FETCH] No reservations found');
            return { reservations: [], childToParentMap: new Map(), listings: [], dateRange: { fromDate, toDate }, fetchTime: '0' };
        }

        allRawReservations = firstResponse.reservations;
        const totalExpected = firstResponse.total || allRawReservations.length;
        const totalPages = Math.ceil(totalExpected / perPage);

        console.log(`[BULK-FETCH] Total: ${totalExpected} reservations across ${totalPages} pages`);
        if (progressCallback) {
            progressCallback(`Fetching reservations: ${allRawReservations.length}/${totalExpected}`);
        }

        // Fetch remaining pages in parallel batches
        for (let batchStart = 2; batchStart <= totalPages; batchStart += parallelBatchSize) {
            const batchEnd = Math.min(batchStart + parallelBatchSize - 1, totalPages);
            const pageNumbers = [];
            for (let p = batchStart; p <= batchEnd; p++) {
                pageNumbers.push(p);
            }

            console.log(`[BULK-FETCH] Fetching pages ${batchStart}-${batchEnd} in parallel...`);

            const batchResults = await Promise.all(
                pageNumbers.map(async (pageNum) => {
                    try {
                        const response = await this.getReservations(fromDate, toDate, pageNum, perPage, null, 'checkIn');
                        return response.success ? response.reservations : [];
                    } catch (error) {
                        console.error(`[BULK-FETCH] Error on page ${pageNum}: ${error.message}`);
                        return [];
                    }
                })
            );

            // Merge results
            batchResults.forEach(reservations => {
                if (reservations && reservations.length > 0) {
                    allRawReservations = allRawReservations.concat(reservations);
                }
            });

            if (progressCallback) {
                progressCallback(`Fetching reservations: ${allRawReservations.length}/${totalExpected}`);
            }
            console.log(`[BULK-FETCH] Progress: ${allRawReservations.length}/${totalExpected} reservations`);

            // Small delay between batches to avoid overwhelming the API
            if (batchEnd < totalPages) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        console.log(`[BULK-FETCH] Fetched ${allRawReservations.length} raw reservations`);

        // Step 2: Get all listings and build child-to-parent map
        console.log('[BULK-FETCH] Step 2: Building child-to-parent listing map...');
        if (progressCallback) {
            progressCallback('Building listing hierarchy map...');
        }

        const propertiesResponse = await this.getAllProperties();
        const allListings = propertiesResponse.result || [];
        console.log(`[BULK-FETCH] Found ${allListings.length} listings`);

        const childToParentMap = new Map();
        const parentListingIds = allListings.map(l => parseInt(l.id));

        // Fetch children for all listings in parallel batches (20 at a time to avoid API rate limits)
        const batchSize = 20;
        for (let i = 0; i < parentListingIds.length; i += batchSize) {
            const batch = parentListingIds.slice(i, i + batchSize);
            const childResults = await Promise.all(
                batch.map(async parentId => ({
                    parentId,
                    childIds: await this.getChildListings(parentId)
                }))
            );

            childResults.forEach(({ parentId, childIds }) => {
                childIds.forEach(childId => {
                    childToParentMap.set(childId, parentId);
                });
            });

            // Small delay between batches to avoid overwhelming the API
            if (i + batchSize < parentListingIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (progressCallback) {
                progressCallback(`Building listing map: ${Math.min(i + batchSize, parentListingIds.length)}/${parentListingIds.length}`);
            }
        }

        console.log(`[BULK-FETCH] Built child-to-parent map with ${childToParentMap.size} child listings`);

        // Step 3: Transform and attribute reservations to parent listings
        console.log('[BULK-FETCH] Step 3: Transforming and attributing reservations...');
        if (progressCallback) {
            progressCallback('Processing reservations...');
        }

        const transformedReservations = allRawReservations.map(rawRes => {
            const transformed = this.transformReservation(rawRes);

            // If this reservation's listing is a child, attribute to parent
            if (childToParentMap.has(transformed.propertyId)) {
                const parentId = childToParentMap.get(transformed.propertyId);
                transformed.childListingId = transformed.propertyId;
                transformed.propertyId = parentId;
            }

            return transformed;
        });

        // Deduplicate by hostifyId (in case of any duplicates from pagination)
        const uniqueReservations = new Map();
        transformedReservations.forEach(res => {
            uniqueReservations.set(res.hostifyId, res);
        });
        const dedupedReservations = Array.from(uniqueReservations.values());

        console.log(`[BULK-FETCH] Transformed ${dedupedReservations.length} unique reservations`);

        // Note: Fee data (pets_fee, extras_price, addons_price, extra_person) is already
        // extracted in transformReservation() from the list API with fees=1 parameter.
        // The fees=1 parameter should include all fee details - no enrichment needed.

        // Convert any non-USD reservations to USD
        const usdReservations = await this.convertReservationsBatchToUSD(dedupedReservations);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[BULK-FETCH] Complete! ${usdReservations.length} reservations fetched in ${elapsed}s`);

        return {
            reservations: usdReservations,
            childToParentMap,
            listings: allListings,
            dateRange: { fromDate, toDate },
            fetchTime: elapsed
        };
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

    /**
     * Get ALL listings from Hostify including offboarded/inactive ones (with pagination)
     */
    async getAllPropertiesIncludingOffboarded() {
        let allProperties = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
            const response = await this.makeRequest('/listings', { page, per_page: perPage });

            if (response.success && response.listings?.length > 0) {
                allProperties = allProperties.concat(response.listings);
                hasMore = response.listings.length === perPage && response.total > allProperties.length;
                page++;
                if (page > 50) break; // Safety limit
            } else {
                hasMore = false;
            }
        }

        return allProperties;
    }

    async getProperty(listingId) {
        return await this.makeRequest(`/listings/${listingId}`);
    }

    /**
     * Get all owners from /users API with pagination
     * Much more efficient than calling contract endpoint for each listing
     * @returns {Promise<{ownerMap: Object, ownerCount: number, listingCount: number}>}
     * ownerMap: { listingId: { email, firstName } }
     */
    async getAllOwners() {
        console.log('[HostifyService] Fetching all owners from /users API...');
        const ownerMap = {};  // listingId -> { email, firstName }
        let ownerCount = 0;
        let page = 1;
        const maxPages = 20;  // Safety limit

        try {
            while (page <= maxPages) {
                const response = await this.makeRequest(`/users?page=${page}`);

                if (!response.success || !response.users || response.users.length === 0) {
                    break;
                }

                for (const user of response.users) {
                    const role = (user.roles || '').toLowerCase();
                    // Check if role contains 'owner'
                    if (role.includes('owner')) {
                        ownerCount++;
                        const email = user.username;
                        const firstName = user.first_name || '';

                        // Map each listing to this owner
                        for (const listing of (user.listings || [])) {
                            ownerMap[listing.id] = { email, firstName };
                        }
                    }
                }

                console.log(`[HostifyService] Page ${page}: ${ownerCount} owners, ${Object.keys(ownerMap).length} listings mapped`);

                // Check if there are more pages
                if (!response.next_page) {
                    break;
                }
                page++;
            }

            console.log(`[HostifyService] Done: ${ownerCount} owners, ${Object.keys(ownerMap).length} listings with owner emails`);
            return {
                success: true,
                ownerMap,
                ownerCount,
                listingCount: Object.keys(ownerMap).length
            };
        } catch (error) {
            console.error('[HostifyService] Error fetching owners:', error.message);
            return { success: false, ownerMap: {}, ownerCount: 0, listingCount: 0 };
        }
    }

    /**
     * Get listing contract info including owner details
     * @param {number} listingId - The listing ID
     * @returns {Promise<{success: boolean, ownerEmail: string|null, ownerName: string|null, ownerPhone: string|null}>}
     */
    async getListingContract(listingId) {
        try {
            const response = await this.makeRequest(`/listings/${listingId}/contract`);

            if (!response.success || !response.listing || !response.listing.users) {
                return { success: false, ownerEmail: null, ownerName: null, ownerPhone: null };
            }

            // Find owner in the users array (match any owner role variant)
            const ownerRoles = ['Standard Listing Owner', 'Standard Owner', 'Owner'];
            const owner = response.listing.users.find(user =>
                user.roles && ownerRoles.some(role => user.roles.includes(role))
            );

            if (owner) {
                return {
                    success: true,
                    ownerEmail: owner.username || null,  // username is the email
                    ownerFirstName: owner.first_name || null,  // For greeting: "Hi Ozzie,"
                    ownerName: `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || null,
                    ownerPhone: owner.phone ? String(owner.phone) : null
                };
            }

            return { success: false, ownerEmail: null, ownerName: null, ownerPhone: null };
        } catch (error) {
            console.log(`[WARN] Failed to get contract for listing ${listingId}: ${error.message}`);
            return { success: false, ownerEmail: null, ownerName: null, ownerPhone: null };
        }
    }

    // Get child listings for a parent listing (with caching and retry)
    async getChildListings(parentId, retries = 2) {
        const cacheKey = parseInt(parentId);

        // Check cache first
        const cached = this._childListingsCache.get(cacheKey);
        if (cached && (Date.now() - cached.time) < this._childListingsCacheTTL) {
            return cached.childIds;
        }

        for (let attempt = 1; attempt <= retries + 1; attempt++) {
            try {
                // Fetch children from API
                const response = await this.makeRequest(`/listings/children/${parentId}`);
                const childIdSet = new Set();

                if (response.success && response.listings && response.listings.length > 0) {
                    response.listings.forEach(l => childIdSet.add(parseInt(l.id)));
                }

                // Also check all listings for parent_id match (catches channel-specific children like Bcom)
                // Use cached all-listings if available, otherwise fetch once
                const allListings = await this._getAllListingsForChildLookup();
                if (allListings && allListings.length > 0) {
                    allListings.forEach(l => {
                        if (parseInt(l.parent_id) === parseInt(parentId) && parseInt(l.id) !== parseInt(parentId)) {
                            childIdSet.add(parseInt(l.id));
                        }
                    });
                }

                const childIds = Array.from(childIdSet);

                if (childIds.length > 0) {
                    console.log(`[PARENT-CHILD] Parent ${parentId} has ${childIds.length} children: ${childIds.join(', ')}`);
                }

                // Cache the result
                this._childListingsCache.set(cacheKey, { childIds, time: Date.now() });
                return childIds;
            } catch (error) {
                if (attempt <= retries) {
                    console.log(`[PARENT-CHILD] Retry ${attempt}/${retries} for listing ${parentId}: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
                } else {
                    console.log(`[PARENT-CHILD] Failed after ${retries + 1} attempts for listing ${parentId}: ${error.message}`);
                    // Don't cache errors - network issues should be retried next time
                    return [];
                }
            }
        }
        return [];
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
    // Also include "Extra guest fee" (type: "accommodation") in guest fees
    // Also extract Resort Fee separately for "Guest Paid Damage Coverage" column
    calculateFeesFromArray(fees) {
        if (!fees || !Array.isArray(fees)) {
            return { cleaningFee: 0, otherFees: 0, totalFees: 0, resortFee: 0 };
        }

        let cleaningFee = 0;
        let otherFees = 0;
        let resortFee = 0;

        // Fees to exclude from guest-paid totals (but extract resort fee separately)
        const excludedFees = ['claims fee', 'resort fee', 'management fee'];

        fees.forEach(feeItem => {
            const feeType = feeItem.fee?.type;
            const feeName = feeItem.fee?.name || '';
            const feeNameLower = feeName.toLowerCase();
            // Use amount_gross_total for total fee amount (handles per-night fees like extra guest fee)
            const amount = parseFloat(feeItem.amount_gross_total || feeItem.amount_gross || 0);

            // Process "Extra guest fee" (type: accommodation) as guest fees
            if (feeType === 'accommodation' && feeNameLower.includes('extra guest')) {
                otherFees += amount;
                return;
            }

            // Process fees of type "fee" (not "accommodation" or "tax")
            if (feeType === 'fee') {
                // Extract resort fee for "Guest Paid Damage Coverage" column
                if (feeNameLower.includes('resort fee') && amount > 0) {
                    resortFee += amount;
                    return;
                }

                // Exclude certain fees from guest-paid totals
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
            totalFees: cleaningFee + otherFees,
            resortFee
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
            weeklyPayoutDate: null, // Will be set when processing
            currency: hostifyReservation.currency || 'USD',
            createdAt: hostifyReservation.created_at || null
        };

        // Extract detailed financial data from Hostify response
        const baseRate = parseFloat(hostifyReservation.base_price || 0);
        const channelCommission = parseFloat(hostifyReservation.channel_commission || 0);
        const transactionFee = parseFloat(hostifyReservation.transaction_fee || 0);
        const platformFees = channelCommission + transactionFee;
        const taxAmount = parseFloat(hostifyReservation.tax_amount || 0);
        const clientPayout = parseFloat(hostifyReservation.payout_price || 0);

        // Check if fees array is available (from list API with fees=1)
        // The fees array is in hostifyReservation.fees.fees format
        let cleaningFee = 0;
        let cleaningAndOtherFees = 0;
        let resortFee = 0;

        const feesArray = hostifyReservation.fees?.fees || hostifyReservation.fees;
        if (Array.isArray(feesArray) && feesArray.length > 0) {
            // Use calculateFeesFromArray to extract fees from detailed array
            const feeCalc = this.calculateFeesFromArray(feesArray);
            cleaningFee = feeCalc.cleaningFee;
            cleaningAndOtherFees = feeCalc.totalFees;
            resortFee = feeCalc.resortFee || 0;

            if (feeCalc.otherFees > 0) {
                console.log(`[FEE-ARRAY] ${guestName}: cleaning=${cleaningFee}, otherFees=${feeCalc.otherFees} => TOTAL=${cleaningAndOtherFees}`);
            }
        } else {
            // Fallback to flat fields if fees array not available
            cleaningFee = parseFloat(hostifyReservation.cleaning_fee || 0);
            const petsFee = parseFloat(hostifyReservation.pets_fee || 0);
            const extrasPrice = parseFloat(hostifyReservation.extras_price || 0);
            const addonsPrice = parseFloat(hostifyReservation.addons_price || 0);
            const extraGuestFee = parseFloat(hostifyReservation.extra_guest_price || hostifyReservation.extra_person || 0);
            cleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraGuestFee;

            if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraGuestFee > 0) {
                console.log(`[FEE-FLAT] ${guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraGuest=${extraGuestFee} => TOTAL=${cleaningAndOtherFees}`);
            }
        }

        // Calculate totals - Revenue = base + fees - platform
        const clientRevenue = baseRate + cleaningAndOtherFees - platformFees;
        
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
            resortFee: resortFee,
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
            'checked_in': 'confirmed',
            'checkedin': 'confirmed',
            'pending': 'new',
            'new': 'new',
            'cancelled': 'cancelled',
            'cancelled_by_guest': 'cancelled',
            'cancelled_by_host': 'cancelled',
            'denied': 'cancelled',
            'completed': 'confirmed',
            'no_show': 'cancelled',
            'inquiry': 'inquiry',
            'expired': 'expired',
            'declined': 'declined',
            'declined_inq': 'inquiry',
            'offer': 'new',
            'withdrawn': 'cancelled',
            'not_possible': 'cancelled'
        };
        const mapped = statusMap[hostifyStatus] || 'unknown';
        if (mapped === 'unknown') {
            console.log(`[STATUS-UNKNOWN] Hostify returned unmapped status: "${hostifyStatus}"`);
        }
        return mapped;
    }

    async getOverlappingReservations(listingIds, fromDate, toDate) {
        try {
            const allReservations = new Map();

            // If no listing IDs provided, get ALL listings first (for bulk generation)
            let baseListingIds = listingIds.map(id => parseInt(id));
            if (baseListingIds.length === 0) {
                console.log('[OVERLAP] No listing IDs provided, fetching ALL listings for bulk generation...');
                const propertiesResponse = await this.getAllProperties();
                const allListings = propertiesResponse.result || [];
                baseListingIds = allListings.map(l => parseInt(l.id));
                console.log(`[OVERLAP] Found ${baseListingIds.length} listings to fetch reservations for`);
            }

            // Always expand listing IDs to include children (parallel fetch for performance)
            let expandedListingIds = [...baseListingIds];
            const childToParentMap = new Map();

            // Fetch all children in parallel and build maps at once
            const childResults = await Promise.all(
                baseListingIds.map(async parentId => ({
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

            // Also include inactive/old children by scanning all listings
            const allListings = await this._getAllListingsForChildLookup();
            const baseIdSetInt = new Set(baseListingIds.map(id => parseInt(id)));

            allListings.forEach(listing => {
                const listingId = parseInt(listing.id);
                const parentId = parseInt(listing.parent_id);
                if (parentId && baseIdSetInt.has(parentId) && !childToParentMap.has(listingId) && !baseIdSetInt.has(listingId)) {
                    expandedListingIds.push(listingId);
                    childToParentMap.set(listingId, parentId);
                }
            });

            if (childToParentMap.size > 0) {
                console.log(`[EXPAND] Expanded ${baseListingIds.length} listing(s) to ${expandedListingIds.length} (including ${childToParentMap.size} children)`);
            }

            // Look back 12 months to catch long-term stays that started months ago
            // Look forward 12 months because Hostify API filters by CHECKOUT date (not check-in)
            // This catches long-term stays that check out up to a year after the statement period
            const lookbackDate = new Date(fromDate);
            lookbackDate.setDate(lookbackDate.getDate() - 365);
            const lookforwardDate = new Date(toDate);
            lookforwardDate.setDate(lookforwardDate.getDate() + 365);

            // Fetch reservations for all expanded listings (parents + children)
            // Note: Hostify listing_id filter returns direct matches only, so we need both
            let reservationsList = await this.getReservationsForListings(
                expandedListingIds,
                lookbackDate.toISOString().split('T')[0],
                lookforwardDate.toISOString().split('T')[0],
                'checkIn'
            );

            // Also fetch ALL reservations to catch child reservations on inactive/old listings
            if (baseListingIds.length > 0 && baseListingIds.length <= 10) {
                try {
                    const baseIdSet = new Set(baseListingIds.map(id => String(id)));
                    const existingIds = new Set(reservationsList.map(r => r.hostifyId));
                    const startDateStr = lookbackDate.toISOString().split('T')[0];
                    const endDateStr = lookforwardDate.toISOString().split('T')[0];

                    // Build a map of listing_id -> parent_id from all listings (including inactive)
                    const allListings = await this._getAllListingsForChildLookup();
                    const listingParentMap = new Map();
                    allListings.forEach(l => {
                        if (l.parent_id) {
                            listingParentMap.set(String(l.id), String(l.parent_id));
                        }
                    });

                    // Helper to check if reservation belongs to our listings
                    const belongsToOurListings = (r) => {
                        const listingId = String(r.listing_id || '');
                        const parentListingId = String(r.parent_listing_id || '');
                        // Also check if the listing's parent_id matches our base IDs
                        const listingsParent = listingParentMap.get(listingId) || '';
                        // Match if listing_id, parent_listing_id, or listing's parent_id is one of our base parents
                        return (baseIdSet.has(listingId) || baseIdSet.has(parentListingId) || baseIdSet.has(listingsParent)) && !existingIds.has(String(r.id));
                    };

                    // For archived listings not in allListings, fetch their parent_id directly
                    const fetchListingParent = async (listingId) => {
                        try {
                            const response = await this.makeRequest(`/listings/${listingId}`);
                            if (response.success && response.listing) {
                                return String(response.listing.parent_id || '');
                            }
                        } catch (e) { }
                        return '';
                    };

                    // First call to get total count
                    const firstRes = await this.getReservations(startDateStr, endDateStr, 1, 100, null, 'checkIn');

                    if (firstRes.success && firstRes.reservations?.length > 0) {
                        const total = firstRes.total || firstRes.reservations.length;
                        const totalPages = Math.ceil(total / 100); // Fetch all pages dynamically

                        // Fetch all pages in parallel
                        const pageNumbers = [];
                        for (let p = 2; p <= totalPages; p++) {
                            pageNumbers.push(p);
                        }

                        // Collect all reservations first
                        const allPageResults = await Promise.all([
                            Promise.resolve(firstRes.reservations),
                            ...pageNumbers.map(async (pageNum) => {
                                try {
                                    const res = await this.getReservations(startDateStr, endDateStr, pageNum, 100, null, 'checkIn');
                                    return res.success && res.reservations?.length > 0 ? res.reservations : [];
                                } catch (err) { return []; }
                            })
                        ]);
                        const allReservationsRaw = allPageResults.flat();

                        // Find reservations on unknown listings (archived) and fetch their parent_id
                        const unknownListingIds = new Set();
                        allReservationsRaw.forEach(r => {
                            const listingId = String(r.listing_id || '');
                            if (listingId && !listingParentMap.has(listingId) && !baseIdSet.has(listingId)) {
                                unknownListingIds.add(listingId);
                            }
                        });

                        // Fetch parent_id for unknown (archived) listings
                        if (unknownListingIds.size > 0) {
                            const unknownList = Array.from(unknownListingIds);
                            const unknownResults = await Promise.all(
                                unknownList.map(async (listingId) => {
                                    const parentId = await fetchListingParent(listingId);
                                    return { listingId, parentId };
                                })
                            );
                            unknownResults.forEach(({ listingId, parentId }) => {
                                if (parentId) {
                                    listingParentMap.set(listingId, parentId);
                                    // Also add to childToParentMap so reservations get attributed correctly
                                    if (baseIdSet.has(parentId)) {
                                        childToParentMap.set(parseInt(listingId), parseInt(parentId));
                                    }
                                }
                            });
                        }

                        // Now filter using updated listingParentMap
                        const allChildRes = allReservationsRaw.filter(belongsToOurListings);
                        if (allChildRes.length > 0) {
                            const childReservations = allChildRes.map(r => this.transformReservation(r));
                            reservationsList = reservationsList.concat(childReservations);
                        }
                    }
                } catch (err) {
                    console.log(`[OVERLAP-CHILD] Failed to fetch additional reservations: ${err.message}`);
                }
            }

            const periodStart = new Date(fromDate);
            const periodEnd = new Date(toDate);

            // Only include confirmed/accepted reservations - filter out expired, cancelled, new, etc.
            const allowedStatuses = ['confirmed', 'accepted'];

            reservationsList.forEach(res => {
                // Skip reservations with non-allowed statuses (expired, cancelled, inquiry, etc.)
                if (!allowedStatuses.includes(res.status)) {
                    console.log(`[OVERLAP-SKIP] Reservation ${res.hostifyId} (${res.guestName}): status "${res.status}" not allowed`);
                    return;
                }

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

            const batchSize = 100; // Increased for better performance with caching
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
                                        clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees,
                                        resortFee: feeCalc.resortFee || 0
                                    };
                                }

                                // Fallback to old method if fees array not available
                                const resPetFee = parseFloat(detailData.pets_fee || 0);
                                const listingPetFee = resPetFee === 0 ? await this.getListingPetFee(res.propertyId) : 0;
                                const petsFee = resPetFee || listingPetFee;
                                const extrasPrice = parseFloat(detailData.extras_price || 0);
                                const addonsPrice = parseFloat(detailData.addons_price || 0);
                                const extraGuestFee = parseFloat(detailData.extra_guest_price || detailData.extra_person || 0);
                                const cleaningFee = parseFloat(detailData.cleaning_fee || res.cleaningFee || 0);
                                const newCleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraGuestFee;

                                if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraGuestFee > 0) {
                                    console.log(`[FEE-FALLBACK] ${res.guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraGuest=${extraGuestFee} => TOTAL=${newCleaningAndOtherFees}`);
                                }

                                return {
                                    ...res,
                                    cleaningFee: cleaningFee,
                                    cleaningAndOtherFees: newCleaningAndOtherFees,
                                    clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees,
                                    resortFee: 0
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
            // Convert any non-USD reservations to USD
            return await this.convertReservationsBatchToUSD(enrichedReservations);
        } catch (error) {
            throw error;
        }
    }

    async getConsolidatedFinanceReport(params = {}) {
        const { listingMapIds = [], fromDate, toDate, dateType = 'checkOut' } = params;

        // If no listing IDs provided, get ALL listings first (for bulk generation)
        let baseListingIds = listingMapIds.map(id => parseInt(id));
        if (baseListingIds.length === 0) {
            console.log('[FINANCE] No listing IDs provided, fetching ALL listings for bulk generation...');
            const propertiesResponse = await this.getAllProperties();
            const allListings = propertiesResponse.result || [];
            baseListingIds = allListings.map(l => parseInt(l.id));
            console.log(`[FINANCE] Found ${baseListingIds.length} listings to fetch reservations for`);
        }

        // Always expand listing IDs to include children (parallel fetch for performance)
        let expandedListingIds = [...baseListingIds];
        const childToParentMap = new Map();

        // Fetch all children in parallel and build maps at once
        const childResults = await Promise.all(
            baseListingIds.map(async parentId => ({
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
            console.log(`[FINANCE-EXPAND] Expanded ${baseListingIds.length} listing(s) to ${expandedListingIds.length} (including ${childToParentMap.size} children)`);
        }

        // Fetch reservations for each listing in PARALLEL (much faster than fetching all and filtering)
        let allReservations = [];
        allReservations = await this.getReservationsForListings(expandedListingIds, fromDate, toDate, dateType);

        // Also fetch ALL reservations (no listing filter) to catch child reservations on inactive listings
        // Then filter to include those with parent_id matching our base listings
        if (baseListingIds.length > 0 && baseListingIds.length <= 10) {
            try {
                const baseIdSet = new Set(baseListingIds.map(id => String(id)));
                const existingIds = new Set(allReservations.map(r => r.hostifyId));

                // First call to get total count
                const firstRes = await this.getReservations(fromDate, toDate, 1, 100, null, dateType);
                if (firstRes.success && firstRes.reservations?.length > 0) {
                    const total = firstRes.total || firstRes.reservations.length;
                    const totalPages = Math.min(Math.ceil(total / 100), 50);

                    // Fetch all pages in parallel (skip page 1 since we already have it)
                    const pageNumbers = [];
                    for (let p = 2; p <= totalPages; p++) {
                        pageNumbers.push(p);
                    }

                    const [firstPageChildren, ...otherResults] = await Promise.all([
                        // Process first page
                        Promise.resolve(firstRes.reservations.filter(r => {
                            const parentListingId = String(r.parent_listing_id || '');
                            return baseIdSet.has(parentListingId) && !existingIds.has(String(r.id));
                        })),
                        // Fetch remaining pages in parallel
                        ...pageNumbers.map(async (pageNum) => {
                            try {
                                const res = await this.getReservations(fromDate, toDate, pageNum, 100, null, dateType);
                                if (res.success && res.reservations?.length > 0) {
                                    return res.reservations.filter(r => {
                                        const parentListingId = String(r.parent_listing_id || '');
                                        return baseIdSet.has(parentListingId) && !existingIds.has(String(r.id));
                                    });
                                }
                            } catch (err) { }
                            return [];
                        })
                    ]);

                    // Combine all child reservations
                    const allChildRes = [firstPageChildren, ...otherResults].flat();
                    if (allChildRes.length > 0) {
                        const childReservations = allChildRes.map(r => this.transformReservation(r));
                        allReservations = allReservations.concat(childReservations);
                    }
                }
            } catch (err) {
                console.log(`[FINANCE-CHILD] Failed to fetch additional reservations: ${err.message}`);
            }
        }

        // Filter out expired, cancelled, inquiry reservations - only keep confirmed/accepted
        const allowedStatuses = ['confirmed', 'accepted'];
        allReservations = allReservations.filter(res => {
            if (!allowedStatuses.includes(res.status)) {
                console.log(`[FINANCE-SKIP] Reservation ${res.hostifyId} (${res.guestName}): status "${res.status}" not allowed`);
                return false;
            }
            return true;
        });

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

        // Fetch detailed financial data for filtered reservations only (pets_fee, extras, etc.)
        const batchSize = 20; // Reduced to avoid API rate limits
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
                                    clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees,
                                    resortFee: feeCalc.resortFee || 0
                                };
                            }

                            // Fallback to old method if fees array not available
                            const resPetFee = parseFloat(detailData.pets_fee || 0);
                            const listingPetFee = resPetFee === 0 ? await this.getListingPetFee(res.propertyId) : 0;
                            const petsFee = resPetFee || listingPetFee;
                            const extrasPrice = parseFloat(detailData.extras_price || 0);
                            const addonsPrice = parseFloat(detailData.addons_price || 0);
                            const extraGuestFee = parseFloat(detailData.extra_guest_price || detailData.extra_person || 0);
                            const cleaningFee = parseFloat(detailData.cleaning_fee || res.cleaningFee || 0);
                            const newCleaningAndOtherFees = cleaningFee + petsFee + extrasPrice + addonsPrice + extraGuestFee;

                            if (petsFee > 0 || extrasPrice > 0 || addonsPrice > 0 || extraGuestFee > 0) {
                                console.log(`[FEE-FALLBACK] ${res.guestName}: cleaning=${cleaningFee}, pets=${petsFee}, extras=${extrasPrice}, addons=${addonsPrice}, extraGuest=${extraGuestFee} => TOTAL=${newCleaningAndOtherFees}`);
                            }

                            return {
                                ...res,
                                cleaningFee: cleaningFee,
                                cleaningAndOtherFees: newCleaningAndOtherFees,
                                clientRevenue: res.baseRate + newCleaningAndOtherFees - res.platformFees,
                                resortFee: 0
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
        // Convert any non-USD reservations to USD
        return await this.convertReservationsBatchToUSD(enrichedReservations);
    }
}

module.exports = new HostifyService();
