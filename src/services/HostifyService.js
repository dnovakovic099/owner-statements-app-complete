const axios = require('axios');

class HostifyService {
    constructor() {
        this.baseURL = process.env.HOSTIFY_API_URL || 'https://api-rms.hostify.com';
        this.apiKey = process.env.HOSTIFY_API_KEY || 'aOGSVrcPGOvvSsGD4idPKvxKaD0HGaAW';

        // AGGRESSIVE CACHING — longer TTLs reduce redundant API calls across
        // back-to-back statement generations
        this._reservationsCache = new Map(); // key: "startDate|endDate|listingId|dateType"
        this._reservationsCacheTTL = 5 * 60 * 1000; // 5 minutes (up from 2)
        this._propertiesCache = null;
        this._propertiesCacheTime = null;
        this._propertiesCacheTTL = 30 * 60 * 1000; // 30 minutes (up from 10) — listings rarely change
        this._usersCache = null;
        this._usersCacheTime = null;
        this._usersCacheTTL = 30 * 60 * 1000; // 30 minutes (up from 10)

        // Fee details cache - stores fee details for individual reservations
        this._feeDetailsCache = new Map(); // key: reservationId, value: { fees, time }
        this._feeDetailsCacheTTL = 15 * 60 * 1000; // 15 minutes (up from 5) — fees don't change mid-session

        // Child listings cache - stores child listing IDs for parent listings
        this._childListingsCache = new Map(); // key: parentId, value: { childIds, time }
        this._childListingsCacheTTL = 30 * 60 * 1000; // 30 minutes (up from 10) — parent-child rarely changes

        // All listings cache (without service_pms filter) - for child lookup by parent_id
        this._allListingsCache = null;
        this._allListingsCacheTime = null;
        this._allListingsCacheTTL = 30 * 60 * 1000; // 30 minutes (up from 10)
        this._allListingsFetchPromise = null; // Lock for concurrent fetches

        // Exchange rate cache (for converting non-USD currencies)
        this._exchangeRates = new Map(); // key: currency code, value: { rate, time }
        this._exchangeRateTTL = 60 * 60 * 1000; // 1 hour

        // Offboarded listing cache - stores service_pms status for listings
        this._offboardedCache = new Map(); // key: listingId, value: { isOffboarded, time }
        this._offboardedCacheTTL = 30 * 60 * 1000; // 30 minutes (up from 10)

        // Global concurrency limiter — ensures the ENTIRE app never exceeds this
        // many concurrent Hostify API calls, regardless of how many statements
        // are generating simultaneously
        this._maxConcurrent = 5;
        this._defaultMaxConcurrent = 5;
        this._activeRequests = 0;
        this._requestQueue = [];
        this._lastRequestTime = 0;
        this._minRequestSpacing = 100; // ms between requests to smooth traffic
        this._rateLimitCooldownUntil = 0; // timestamp: global pause after 429
    }

    /**
     * Acquire a slot from the global concurrency limiter.
     * If all slots are in use, waits until one frees up.
     * Also enforces minimum spacing between requests and rate-limit cooldowns.
     */
    async _acquireSlot() {
        // If we're in a rate-limit cooldown, wait it out
        const now = Date.now();
        if (now < this._rateLimitCooldownUntil) {
            const cooldownMs = this._rateLimitCooldownUntil - now;
            console.log(`[HOSTIFY] Rate-limit cooldown: waiting ${(cooldownMs / 1000).toFixed(1)}s before next request`);
            await new Promise(resolve => setTimeout(resolve, cooldownMs));
        }

        // Wait for a free slot
        if (this._activeRequests >= this._maxConcurrent) {
            await new Promise(resolve => {
                this._requestQueue.push(resolve);
            });
        } else {
            this._activeRequests++;
        }

        // Enforce minimum spacing between requests to smooth traffic
        const elapsed = Date.now() - this._lastRequestTime;
        if (elapsed < this._minRequestSpacing) {
            await new Promise(resolve => setTimeout(resolve, this._minRequestSpacing - elapsed));
        }
        this._lastRequestTime = Date.now();
    }

    /**
     * Release a slot back to the global concurrency limiter.
     */
    _releaseSlot() {
        if (this._requestQueue.length > 0) {
            const next = this._requestQueue.shift();
            next(); // hand slot to next waiter (activeRequests stays the same)
        } else {
            this._activeRequests--;
        }
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

        // Fetch all needed rates (throttled to avoid 429s)
        const rates = {};
        const RATE_CONCURRENCY = 3;
        for (let i = 0; i < currencies.length; i += RATE_CONCURRENCY) {
            const batch = currencies.slice(i, i + RATE_CONCURRENCY);
            await Promise.all(batch.map(async (cur) => {
                try {
                    rates[cur] = await this.getExchangeRateToUSD(cur);
                } catch (err) {
                    console.error(`[CURRENCY] Failed to get rate for ${cur}: ${err.message} — defaulting to 1.0`);
                    rates[cur] = 1.0;
                }
            }));
        }

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
                console.error(`[LISTINGS-CACHE] Failed to fetch all listings for child lookup: ${error.message}`);
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

    async makeRequest(endpoint, params = {}, method = 'GET', maxRetries = 5) {
        if (!this.apiKey) {
            throw new Error('Hostify API Key is required.');
        }

        // Wait for a global concurrency slot before making ANY Hostify API call
        await this._acquireSlot();

        try {
            return await this._makeRequestInner(endpoint, params, method, maxRetries);
        } finally {
            this._releaseSlot();
        }
    }

    async _makeRequestInner(endpoint, params, method, maxRetries) {
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

                // Successful request — gradually restore concurrency if it was reduced
                if (this._maxConcurrent < this._defaultMaxConcurrent) {
                    this._successesSinceRateLimit = (this._successesSinceRateLimit || 0) + 1;
                    // Only increase concurrency after 20 consecutive successes
                    if (this._successesSinceRateLimit >= 20) {
                        this._maxConcurrent = Math.min(this._maxConcurrent + 1, this._defaultMaxConcurrent);
                        this._minRequestSpacing = Math.max(100, this._minRequestSpacing - 100);
                        this._successesSinceRateLimit = 0;
                        console.log(`[HOSTIFY] Restored concurrency to ${this._maxConcurrent}, spacing=${this._minRequestSpacing}ms`);
                    }
                }
                return response.data;
            } catch (error) {
                lastError = error;

                // Auth errors - don't retry
                if (error.response?.status === 401 || error.response?.status === 403) {
                    throw new Error('Hostify API Authentication Error. Check API key.');
                }

                // Check if it's a retryable error (timeout, network, server error, rate limit)
                const isRateLimit = error.response?.status === 429;
                const isRetryable = isRateLimit ||
                                    error.code === 'ECONNABORTED' ||
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
                    let delay;
                    if (isRateLimit) {
                        // Aggressive backoff for 429s: 10s, 20s, 40s
                        delay = 10000 * Math.pow(2, attempt - 1);
                        // Drop to single concurrency and set global cooldown
                        this._maxConcurrent = 1;
                        this._minRequestSpacing = 500; // 500ms between requests after rate limit
                        this._successesSinceRateLimit = 0;
                        this._rateLimitCooldownUntil = Math.max(this._rateLimitCooldownUntil, Date.now() + delay);
                        console.log(`[HOSTIFY] 429 on ${endpoint} — concurrency=1, spacing=500ms, cooldown=${(delay / 1000).toFixed(0)}s (retry ${attempt}/${maxRetries})`);
                    } else {
                        delay = 1000 * attempt;
                        console.log(`[HOSTIFY] Retry ${attempt}/${maxRetries} for ${endpoint}: ${error.message} (waiting ${delay}ms)`);
                    }

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
                    if (page > 50) { // Safety limit
                        console.warn(`[LISTING-FETCH] Listing ${listingId}: hit 50-page safety limit with ${allReservations.length} reservations`);
                        break;
                    }
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
            console.log(`[LISTING-FETCH-ERR] Listing ${listingId}: ${error.message} | status=${error.response?.status} | code=${error.code}`);
            return [];
        }

        if (allReservations.length === 0) {
            console.log(`[LISTING-EMPTY] Listing ${listingId}: 0 reservations for ${startDate} to ${endDate} (dateType=${dateType})`);
        }

        return allReservations.map(r => this.transformReservation(r));
    }

    // Fetch reservations for multiple listings in parallel
    async getReservationsForListings(listingIds, startDate, endDate, dateType = 'checkIn') {
        console.log(`[PARALLEL] Fetching reservations for ${listingIds.length} listings (max 2 concurrent)...`);

        // Limit concurrency to avoid Hostify 429 rate limits
        const CONCURRENCY = 2;
        const results = [];
        const failedListingIds = [];
        for (let i = 0; i < listingIds.length; i += CONCURRENCY) {
            const batch = listingIds.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(async listingId => {
                    try {
                        const reservations = await this.getReservationsForListing(listingId, startDate, endDate, dateType);
                        return { listingId, reservations, failed: false };
                    } catch (err) {
                        console.error(`[PARALLEL] Listing ${listingId} fetch failed after retries: ${err.message} — skipping (reservations may be missing)`);
                        failedListingIds.push(listingId);
                        return { listingId, reservations: [], failed: true };
                    }
                })
            );
            results.push(...batchResults);
        }

        // Merge all reservations
        let allReservations = [];
        results.forEach(({ listingId, reservations }) => {
            if (reservations.length > 0) {
                console.log(`[PARALLEL] Listing ${listingId}: ${reservations.length} reservations`);
            }
            allReservations = allReservations.concat(reservations);
        });

        if (failedListingIds.length > 0) {
            console.error(`[PARALLEL] WARNING: ${failedListingIds.length}/${listingIds.length} listing fetches FAILED — reservations may be incomplete. Failed IDs: ${failedListingIds.join(', ')}`);
        }

        console.log(`[PARALLEL] Total: ${allReservations.length} reservations from ${listingIds.length} listings (${failedListingIds.length} failed)`);
        // Attach metadata so callers can detect data loss
        allReservations._fetchFailures = failedListingIds;
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
        const batchSize = 5; // Conservative to avoid API rate limits
        const enrichedReservations = [];

        for (let i = 0; i < reservations.length; i += batchSize) {
            const batch = reservations.slice(i, i + batchSize);
            const detailedBatch = await Promise.all(
                batch.map(async (res) => {
                    try {
                        const details = await this.getReservationDetails(res.hostifyId, { skipGuestLookup: true });
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
        const parallelBatchSize = 5; // Fetch 5 pages at a time (conservative to avoid 429s)

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
                await new Promise(resolve => setTimeout(resolve, 50));
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

        // Fetch children for all listings in parallel batches
        const batchSize = 5;
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

            // Small delay between batches
            if (i + batchSize < parentListingIds.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
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
    // skipGuestLookup: when true, skips the extra /guests/{id} API call (used during
    // fee enrichment where guest name is already available from the list API)
    async getReservationDetails(reservationId, { skipGuestLookup = false } = {}) {
        // Check cache first
        const cached = this._feeDetailsCache.get(reservationId);
        if (cached && (Date.now() - cached.time) < this._feeDetailsCacheTTL) {
            return cached.data;
        }

        const result = await this.makeRequest(`/reservations/${reservationId}`, { fees: 1 });

        // Individual reservation endpoint doesn't include guest name - fetch from /guests/{id}
        // Skip this during fee enrichment since guest name is already known from list API
        if (!skipGuestLookup && result.success && result.reservation && result.reservation.guest_id) {
            const res = result.reservation;
            const hasGuestName = res.guestName || res.guest_name || res.guest?.name ||
                res.guest?.first_name || res.guestFirstName;
            if (!hasGuestName) {
                try {
                    const guestResp = await this.makeRequest(`/guests/${res.guest_id}`);
                    if (guestResp.success && guestResp.guest && guestResp.guest.name) {
                        result.reservation.guestName = guestResp.guest.name;
                    }
                } catch (e) {
                    // Guest fetch failed, transformReservation will default to 'Guest'
                }
            }
        }

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
        } else if (hostifyReservation.note || hostifyReservation.title) {
            // Block entries (unavailable/owner_stay) carry their label in note/title instead of guest
            guestName = hostifyReservation.note || hostifyReservation.title;
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

        let hasFeeArrayData = false; // true if fees came from detailed array (no re-fetch needed)
        const feesArray = hostifyReservation.fees?.fees || hostifyReservation.fees;
        if (Array.isArray(feesArray) && feesArray.length > 0) {
            // Use calculateFeesFromArray to extract fees from detailed array
            const feeCalc = this.calculateFeesFromArray(feesArray);
            cleaningFee = feeCalc.cleaningFee;
            cleaningAndOtherFees = feeCalc.totalFees;
            resortFee = feeCalc.resortFee || 0;
            hasFeeArrayData = true;

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
            hasDetailedFinance: true,
            hasFeeArrayData: hasFeeArrayData // true = fees came from detailed array, no re-fetch needed
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
            'not_possible': 'cancelled',
            'voided': 'cancelled',
            'timedout': 'expired',
            'timed_out': 'expired',
            'preapproved': 'inquiry',
            'pre_approved': 'inquiry',
            'payment_failed': 'cancelled',
            'unavailable': 'blocked',
            'blocked': 'blocked',
            'block': 'blocked',
            'owner_stay': 'blocked',
            'owner_block': 'blocked',
            'not_available': 'blocked'
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

            // Always expand listing IDs to include children (throttled to avoid 429s)
            let expandedListingIds = [...baseListingIds];
            const childToParentMap = new Map();

            // Fetch children with concurrency limit and per-item error isolation
            const OVERLAP_CHILD_CONCURRENCY = 5;
            const childResults = [];
            for (let i = 0; i < baseListingIds.length; i += OVERLAP_CHILD_CONCURRENCY) {
                const batch = baseListingIds.slice(i, i + OVERLAP_CHILD_CONCURRENCY);
                const batchResults = await Promise.all(
                    batch.map(async parentId => {
                        try {
                            return {
                                parentId: parseInt(parentId),
                                childIds: await this.getChildListings(parentId)
                            };
                        } catch (err) {
                            console.error(`[OVERLAP-EXPAND] Failed to get children for listing ${parentId}: ${err.message} — continuing without children`);
                            return { parentId: parseInt(parentId), childIds: [] };
                        }
                    })
                );
                childResults.push(...batchResults);
            }

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

            // Fetch reservations using per-listing fetch (API does server-side filtering).
            // The ±365-day lookback window creates too many total reservations for a
            // reliable unfiltered bulk fetch — per-listing is more reliable here.
            const startDateStr = lookbackDate.toISOString().split('T')[0];
            const endDateStr = lookforwardDate.toISOString().split('T')[0];

            console.log(`[OVERLAP] Fetching reservations for ${expandedListingIds.length} listing(s) via per-listing fetch, date range: ${startDateStr} to ${endDateStr}`);
            let reservationsList = await this.getReservationsForListings(
                expandedListingIds, startDateStr, endDateStr, 'checkIn'
            );

            // Check for fetch failures and warn loudly
            const fetchFailures = reservationsList._fetchFailures || [];
            if (fetchFailures.length > 0) {
                console.error(`[OVERLAP] WARNING: ${fetchFailures.length} listing(s) failed to fetch reservations — results may be incomplete. Failed: ${fetchFailures.join(', ')}`);
            }

            const periodStart = new Date(fromDate);
            const periodEnd = new Date(toDate);

            // Include confirmed/accepted reservations and blocked entries (owner stays, off-boarding, unavailable blocks)
            const allowedStatuses = ['confirmed', 'accepted', 'blocked'];

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

            // Only enrich reservations that did NOT get fee data from the list API (fees=1).
            // Reservations with hasFeeArrayData=true already have accurate fees from transformReservation().
            const filteredReservations = Array.from(allReservations.values());
            const needsEnrichment = filteredReservations.filter(r => !r.hasFeeArrayData);
            const alreadyComplete = filteredReservations.filter(r => r.hasFeeArrayData);

            console.log(`[OVERLAP] ${alreadyComplete.length}/${filteredReservations.length} reservations already have fee data from list API — skipping enrichment for those`);

            const batchSize = 10;
            const enrichedFromApi = [];

            if (needsEnrichment.length > 0) {
                console.log(`[OVERLAP] Enriching ${needsEnrichment.length} reservations that need detailed fee data...`);

                for (let i = 0; i < needsEnrichment.length; i += batchSize) {
                    const batch = needsEnrichment.slice(i, i + batchSize);
                    const detailedBatch = await Promise.all(
                        batch.map(async (res) => {
                            try {
                                const details = await this.getReservationDetails(res.hostifyId, { skipGuestLookup: true });

                                if (details.success && details.reservation) {
                                    const detailData = details.reservation;

                                    if (details.fees && Array.isArray(details.fees)) {
                                        const feeCalc = this.calculateFeesFromArray(details.fees);
                                        const cleaningFee = feeCalc.cleaningFee;
                                        const newCleaningAndOtherFees = feeCalc.totalFees;

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
                    enrichedFromApi.push(...detailedBatch);
                }
            }

            const enrichedReservations = [...alreadyComplete, ...enrichedFromApi];
            console.log(`[OVERLAP] Total: ${enrichedReservations.length} reservations (${alreadyComplete.length} from list API + ${enrichedFromApi.length} enriched)`);

            // Fetch manual calendar blocks (unavailable/off-boarding) and merge as pseudo-reservations
            const blocks = await this.fetchCalendarBlocks(expandedListingIds, fromDate, toDate, childToParentMap);
            if (blocks.length > 0) {
                console.log(`[OVERLAP] Merging ${blocks.length} manual block pseudo-reservation(s)`);
            }

            // Convert any non-USD reservations to USD
            return await this.convertReservationsBatchToUSD([...enrichedReservations, ...blocks]);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Fetch Hostify calendar for each listing and group contiguous "manual-blockage"
     * days into pseudo-reservations with status='blocked' and $0 financials.
     * These flow through the statement pipeline like real reservations, but contribute
     * nothing to revenue/payout — they just make the block visible to owners.
     */
    async fetchCalendarBlocks(listingIds, fromDate, toDate, childToParentMap = new Map()) {
        // Dedup by (parent listing, start, end, note): children share their parent's
        // calendar in Hostify so the same block surfaces once per child + the parent.
        const byKey = new Map();
        const CAL_CONCURRENCY = 3;

        for (let i = 0; i < listingIds.length; i += CAL_CONCURRENCY) {
            const batch = listingIds.slice(i, i + CAL_CONCURRENCY);
            const results = await Promise.all(batch.map(async (listingId) => {
                try {
                    const data = await this.makeRequest('/calendar', {
                        listing_id: listingId,
                        start_date: fromDate,
                        end_date: toDate,
                    });
                    return { listingId: parseInt(listingId), calendar: data.calendar || [] };
                } catch (err) {
                    console.error(`[CAL-BLOCKS] Failed for listing ${listingId}: ${err.message}`);
                    return { listingId: parseInt(listingId), calendar: [] };
                }
            }));

            for (const { listingId, calendar } of results) {
                const groups = this._groupBlockDays(calendar);
                if (groups.length === 0) continue;

                const isChild = childToParentMap.has(listingId);
                const attributedId = isChild ? childToParentMap.get(listingId) : listingId;

                for (const g of groups) {
                    const key = `${attributedId}|${g.startDate}|${g.checkoutDate}|${g.note || ''}`;
                    if (byKey.has(key)) continue;
                    const hostifyId = `block_${attributedId}_${g.startDate}`;
                    // Informational base rate from Hostify's calendar (price × nights).
                    // Revenue/payout stay $0 — blocks generated no actual income, so they
                    // must not inflate PM commission or gross payout.
                    const baseRate = Math.round(g.totalPrice * 100) / 100;
                    byKey.set(key, {
                        hostifyId,
                        id: hostifyId,
                        propertyId: attributedId,
                        childListingId: isChild ? listingId : undefined,
                        guestName: g.note || 'Blocked',
                        guestEmail: '',
                        checkInDate: g.startDate,
                        checkOutDate: g.checkoutDate,
                        arrivalDate: g.startDate,
                        departureDate: g.checkoutDate,
                        nights: g.nights,
                        status: 'blocked',
                        source: 'Manual Block',
                        isProrated: false,
                        currency: 'USD',
                        createdAt: null,
                        baseRate,
                        cleaningAndOtherFees: 0,
                        cleaningFee: 0,
                        platformFees: 0,
                        clientRevenue: 0,
                        clientPayout: 0,
                        grossAmount: 0,
                        luxuryLodgingFee: 0,
                        clientTaxResponsibility: 0,
                        resortFee: 0,
                        hasDetailedFinance: true,
                        hasFeeArrayData: true,
                    });
                }
            }
        }
        return Array.from(byKey.values());
    }

    _groupBlockDays(calendar) {
        const blockDays = (calendar || [])
            .filter(d => d.status === 'unavailable' && d.statusNote === 'manual-blockage')
            .sort((a, b) => a.date.localeCompare(b.date));

        const groups = [];
        let current = null;
        for (const day of blockDays) {
            const prevDay = current?.days[current.days.length - 1];
            const contiguous = prevDay && this._nextDay(prevDay.date) === day.date && (prevDay.note || '') === (day.note || '');
            if (!current || !contiguous) {
                current = { days: [], note: day.note };
                groups.push(current);
            }
            current.days.push(day);
        }

        return groups.map(g => {
            const firstDate = g.days[0].date;
            const lastDate = g.days[g.days.length - 1].date;
            const totalPrice = g.days.reduce((sum, d) => sum + (parseFloat(d.price) || 0), 0);
            return {
                startDate: firstDate,
                checkoutDate: this._nextDay(lastDate),
                nights: g.days.length,
                note: g.note,
                totalPrice,
            };
        });
    }

    _nextDay(dateStr) {
        const d = new Date(dateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().split('T')[0];
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

        // Always expand listing IDs to include children (throttled to avoid 429s)
        let expandedListingIds = [...baseListingIds];
        const childToParentMap = new Map();

        // Fetch children with concurrency limit and per-item error isolation
        const CHILD_EXPAND_CONCURRENCY = 5;
        const childResults = [];
        for (let i = 0; i < baseListingIds.length; i += CHILD_EXPAND_CONCURRENCY) {
            const batch = baseListingIds.slice(i, i + CHILD_EXPAND_CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(async parentId => {
                    try {
                        return {
                            parentId: parseInt(parentId),
                            childIds: await this.getChildListings(parentId)
                        };
                    } catch (err) {
                        console.error(`[FINANCE-EXPAND] Failed to get children for listing ${parentId}: ${err.message} — continuing without children`);
                        return { parentId: parseInt(parentId), childIds: [] };
                    }
                })
            );
            childResults.push(...batchResults);
        }

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

        // Fetch reservations — strategy depends on property count
        let allReservations = [];

        if (baseListingIds.length > 0 && baseListingIds.length <= 10) {
            // OPTIMIZED: Single bulk fetch for small property counts.
            // Instead of per-listing fetch (N calls) THEN child hunting (15+ pages),
            // fetch ALL reservations in one paginated pass with per_page=500 and filter
            // client-side. Reduces ~30-40 API calls down to 1-3 for typical statements.
            const expandedIdSet = new Set(expandedListingIds.map(id => String(id)));
            const baseIdSet = new Set(baseListingIds.map(id => String(id)));

            // Build listing->parent map for matching archived/inactive children
            const listingParentMap = new Map();
            const allListingsData = await this._getAllListingsForChildLookup();
            allListingsData.forEach(l => {
                if (l.parent_id) {
                    listingParentMap.set(String(l.id), String(l.parent_id));
                }
            });

            const BULK_PER_PAGE = 500;
            const BULK_MAX_PAGES = 20; // Safety net: 20 × 500 = 10K reservations max (or 20 × 100 if API caps)
            let allRawReservations = [];
            let bulkPage = 1;
            let bulkHasMore = true;

            while (bulkHasMore && bulkPage <= BULK_MAX_PAGES) {
                const response = await this.getReservations(fromDate, toDate, bulkPage, BULK_PER_PAGE, null, dateType);
                if (response.success && response.reservations?.length > 0) {
                    allRawReservations = allRawReservations.concat(response.reservations);
                    // Use API-reported total as source of truth — works whether or not per_page=500 is honored
                    const totalAvailable = response.total || 0;
                    bulkHasMore = totalAvailable > 0
                        ? totalAvailable > allRawReservations.length
                        : response.reservations.length > 0; // fallback: continue until empty
                    bulkPage++;
                } else {
                    bulkHasMore = false;
                }
            }

            console.log(`[FINANCE-BULK] Fetched ${allRawReservations.length} total reservations in ${bulkPage - 1} page(s)`);

            // Filter for our listings: match by expanded ID, parent_listing_id, or listing's parent
            const matched = allRawReservations.filter(r => {
                const listingId = String(r.listing_id || '');
                const parentListingId = String(r.parent_listing_id || '');
                const listingsParent = listingParentMap.get(listingId) || '';
                return expandedIdSet.has(listingId) ||
                       baseIdSet.has(listingId) ||
                       baseIdSet.has(parentListingId) ||
                       baseIdSet.has(listingsParent);
            });

            // Track newly-discovered children (archived listings) for attribution
            matched.forEach(r => {
                const listingId = parseInt(r.listing_id || 0);
                if (listingId && !expandedIdSet.has(String(listingId)) && !baseIdSet.has(String(listingId))) {
                    const parentListingId = String(r.parent_listing_id || '');
                    const listingsParent = listingParentMap.get(String(listingId)) || '';
                    const parentId = baseIdSet.has(parentListingId) ? parseInt(parentListingId) :
                                   baseIdSet.has(listingsParent) ? parseInt(listingsParent) : null;
                    if (parentId) {
                        childToParentMap.set(listingId, parentId);
                    }
                }
            });

            allReservations = matched.map(r => this.transformReservation(r));
            console.log(`[FINANCE-BULK] Matched ${allReservations.length}/${allRawReservations.length} reservations for ${expandedListingIds.length} listing IDs`);

            // Safety fallback: if pagination was truncated (hit page limit), some reservations
            // may be in unfetched pages. Fall back to per-listing fetch for reliability.
            const paginationTruncated = bulkPage > BULK_MAX_PAGES;
            if (paginationTruncated) {
                console.warn(`[FINANCE-BULK] WARNING: Pagination capped at ${BULK_MAX_PAGES} pages (${allReservations.length} matches) — falling back to per-listing fetch`);
                allReservations = await this.getReservationsForListings(expandedListingIds, fromDate, toDate, dateType);
            }
        } else {
            // For larger listing counts, use per-listing fetch (API does server-side filtering)
            allReservations = await this.getReservationsForListings(expandedListingIds, fromDate, toDate, dateType);
        }

        // Filter out expired, cancelled, inquiry reservations - keep confirmed/accepted plus blocks
        const preFilterCount = allReservations.length;
        const allowedStatuses = ['confirmed', 'accepted', 'blocked'];
        allReservations = allReservations.filter(res => {
            if (!allowedStatuses.includes(res.status)) {
                console.log(`[FINANCE-SKIP] Reservation ${res.hostifyId} (${res.guestName}): status "${res.status}" not allowed`);
                return false;
            }
            return true;
        });
        console.log(`[FINANCE-FILTER] ${preFilterCount} raw reservations → ${allReservations.length} after status filter (removed ${preFilterCount - allReservations.length})`);

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

        // Only enrich reservations that did NOT get fee data from the list API (fees=1).
        // Reservations with hasFeeArrayData=true already have accurate fees from transformReservation().
        const needsEnrichment = allReservations.filter(r => !r.hasFeeArrayData);
        const alreadyComplete = allReservations.filter(r => r.hasFeeArrayData);

        console.log(`[FINANCE] ${alreadyComplete.length}/${allReservations.length} reservations already have fee data from list API — skipping enrichment for those`);

        const batchSize = 10;
        const enrichedFromApi = [];

        if (needsEnrichment.length > 0) {
            console.log(`[FINANCE] Enriching ${needsEnrichment.length} reservations that need detailed fee data...`);

            for (let i = 0; i < needsEnrichment.length; i += batchSize) {
                const batch = needsEnrichment.slice(i, i + batchSize);
                const detailedBatch = await Promise.all(
                    batch.map(async (res) => {
                        try {
                            const details = await this.getReservationDetails(res.hostifyId, { skipGuestLookup: true });

                            if (details.success && details.reservation) {
                                const detailData = details.reservation;

                                // Use fees array if available (from ?fees=1 parameter)
                                if (details.fees && Array.isArray(details.fees)) {
                                    const feeCalc = this.calculateFeesFromArray(details.fees);
                                    const cleaningFee = feeCalc.cleaningFee;
                                    const newCleaningAndOtherFees = feeCalc.totalFees;

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
                enrichedFromApi.push(...detailedBatch);
            }
        }

        const enrichedReservations = [...alreadyComplete, ...enrichedFromApi];
        console.log(`[FINANCE] Total: ${enrichedReservations.length} reservations (${alreadyComplete.length} from list API + ${enrichedFromApi.length} enriched)`);
        // Convert any non-USD reservations to USD
        return await this.convertReservationsBatchToUSD(enrichedReservations);
    }
}

module.exports = new HostifyService();
