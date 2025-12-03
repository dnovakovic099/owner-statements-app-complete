const axios = require('axios');

class HostawayService {
    constructor() {
        this.baseURL = process.env.HOSTAWAY_API_URL || 'https://api.hostaway.com/v1';
        this.accountId = process.env.HOSTAWAY_ACCOUNT_ID;
        this.apiKey = process.env.HOSTAWAY_API_KEY;
        this.authToken = null;
        this.tokenExpires = 0;
    }

    async getAuthToken() {
        if (this.authToken && this.tokenExpires > Date.now()) {
            return this.authToken;
        }

        try {
            const params = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.accountId,
                client_secret: this.apiKey,
                scope: 'general'
            });

            console.log('Getting Hostaway access token...');
            console.log(`Account ID: ${this.accountId}`);
            console.log(`API Key: ${this.apiKey ? this.apiKey.substring(0, 20) + '...' : 'Not set'}`);

            const response = await axios.post(
                `${this.baseURL}/accessTokens`,
                params,
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );

            this.authToken = response.data.access_token;
            this.tokenExpires = Date.now() + (response.data.expires_in * 1000) - 300000; // 5 min buffer

            console.log('Hostaway access token obtained successfully');
            return this.authToken;
        } catch (error) {
            console.error('Hostaway auth error:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Hostaway');
        }
    }

    async makeRequest(endpoint, params = {}) {
        if (!this.accountId || !this.apiKey) {
            throw new Error('Hostaway Account ID and API Key are required. Please check your .env file.');
        }
        
        try {
            const token = await this.getAuthToken();
            
            console.log(`Making Hostaway API request to: ${this.baseURL}${endpoint}`);
            console.log(`Using access token: ${token ? token.substring(0, 20) + '...' : 'Not set'}`);
            
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };
            
            console.log('Request headers:', headers);
            console.log('Request params:', params);
            
            const response = await axios.get(`${this.baseURL}${endpoint}`, {
                headers,
                params,
                timeout: 30000
            });
            
            return response.data;
        } catch (error) {
            console.error(`Hostaway API request failed: ${endpoint}`, error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                
                if (error.response.status === 401) {
                    // Token might be expired, clear it
                    this.authToken = null;
                    this.tokenExpires = 0;
                    throw new Error(`Hostaway API Authentication Error: ${error.response.data.message || 'Invalid credentials'}. Please check your API key permissions in Hostaway dashboard.`);
                }
                if (error.response.status === 403) {
                    throw new Error(`Hostaway API Authentication Error: ${error.response.data.message || 'Invalid credentials'}. Please check your API key permissions in Hostaway dashboard.`);
                }
            }
            throw new Error(`Hostaway API Error: ${error.message}`);
        }
    }

    async getReservations(startDate, endDate, limit = 100, offset = 0, propertyId = null) {
        const params = {
            departureStartDate: startDate,
            departureEndDate: endDate,
            limit,
            offset
        };

        // Add property filter if specified
        if (propertyId) {
            params.listingId = propertyId;
            console.log(`Property filter enabled for listingId: ${propertyId}`);
        }

        return await this.makeRequest('/reservations', params);
    }

    async getAllReservations(startDate, endDate, propertyId = null) {
        console.log(`Fetching reservations for period: ${startDate} to ${endDate}${propertyId ? ` for property ${propertyId}` : ''}`);

        let allReservations = [];
        let offset = 0;
        const limit = 100; // Maximum allowed by Hostaway API
        let hasMore = true;
        let page = 1;

        while (hasMore) {
            console.log(`Fetching reservations page ${page} (offset: ${offset})`);
            
            const response = await this.getReservations(startDate, endDate, limit, offset, propertyId);
            
            if (response.result && response.result.length > 0) {
                allReservations = allReservations.concat(response.result);
                console.log(`Page ${page}: Got ${response.result.length} reservations (total so far: ${allReservations.length})`);
                
                // Check if there are more results
                hasMore = response.result.length === limit;
                offset += limit;
                page++;
                
                // Safety check to prevent infinite loops - much lower for property-specific calls
                if (page > 10) { // Max 1000 reservations per property
                    console.log('Reached maximum reservation pages for safety');
                    break;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`Total reservations fetched: ${allReservations.length}`);
        
        // Transform all reservations to our format (without detailed finance data for now)
        const transformedReservations = allReservations.map(reservation => this.transformReservation(reservation));
        
        return { result: transformedReservations };
    }

    // Get reservations with detailed financial data for statement generation
    async getAllReservationsWithFinanceData(startDate, endDate, propertyId = null) {
        console.log(`Fetching reservations with detailed finance data for period: ${startDate} to ${endDate}${propertyId ? ` for property ${propertyId}` : ''}`);
        
        // Get raw reservation data from Hostaway API (before transformation)
        let allReservations = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        let page = 1;

        while (hasMore && page <= 10) {
            console.log(`Fetching reservations page ${page} (offset: ${offset})`);
            
            const response = await this.getReservations(startDate, endDate, limit, offset, propertyId);
            
            if (response && response.result && response.result.length > 0) {
                allReservations = allReservations.concat(response.result);
                console.log(`Page ${page}: Got ${response.result.length} reservations (total so far: ${allReservations.length})`);
                
                if (response.result.length < limit) {
                    hasMore = false;
                } else {
                    offset += limit;
                    page++;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`Total raw reservations fetched: ${allReservations.length}`);
        
        if (allReservations.length === 0) {
            console.log('No reservations found to enrich');
            return { result: [] };
        }
        
        // Now enrich each reservation with detailed financial data
        console.log(`Enriching ${allReservations.length} reservations with detailed financial data...`);
        const enrichedReservations = [];
        
        for (const rawReservation of allReservations) {
            try {
                // Get detailed financial fields for this reservation
                const financeFields = await this.getReservationFinanceFields(rawReservation.id);
                
                // Transform with financial data
                const enrichedReservation = this.transformReservation(rawReservation, financeFields);
                enrichedReservations.push(enrichedReservation);
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`Error enriching reservation ${rawReservation.id}:`, error);
                // Fall back to basic transformation
                const basicReservation = this.transformReservation(rawReservation);
                enrichedReservations.push(basicReservation);
            }
        }
        
        console.log(`Successfully enriched ${enrichedReservations.length} reservations`);
        return { result: enrichedReservations };
    }

    async getReservationsForWeek(weekStartDate) {
        // Convert Tuesday start to Monday end (7 days)
        const startDate = new Date(weekStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6); // Tuesday to Monday

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        console.log(`Fetching reservations for week: ${startDateStr} to ${endDateStr}`);

        let allReservations = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const response = await this.getReservations(startDateStr, endDateStr, limit, offset);
            
            if (response.result && response.result.length > 0) {
                allReservations = allReservations.concat(response.result);
                offset += limit;
                
                // Check if there are more results
                hasMore = response.result.length === limit;
            } else {
                hasMore = false;
            }
        }

        console.log(`Found ${allReservations.length} reservations for the week`);
        return allReservations;
    }

    async getProperties() {
        return await this.makeRequest('/listings');
    }

    async getAllProperties() {
        console.log(`Fetching ALL properties/listings with pagination...`);

        let allProperties = [];
        let offset = 0;
        const limit = 100; // Maximum allowed by Hostaway API
        let hasMore = true;
        let page = 1;

        while (hasMore) {
            console.log(`Fetching properties page ${page} (offset: ${offset})`);
            
            const response = await this.makeRequest('/listings', { limit, offset });
            
            if (response.result && response.result.length > 0) {
                allProperties = allProperties.concat(response.result);
                console.log(`Page ${page}: Got ${response.result.length} properties (total so far: ${allProperties.length})`);
                
                // Check if there are more results
                hasMore = response.result.length === limit;
                offset += limit;
                page++;
                
                // Safety check to prevent infinite loops
                if (page > 50) { // Max 5000 properties
                    console.log('Reached maximum property pages for safety');
                    break;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`Total properties fetched: ${allProperties.length}`);
        return { result: allProperties };
    }

    async getProperty(listingId) {
        return await this.makeRequest(`/listings/${listingId}`);
    }

    // Get financial standard fields for a specific reservation
    async getReservationFinanceFields(reservationId) {
        try {
            console.log(`Fetching finance fields for reservation ${reservationId}`);
            
            const response = await this.makeRequest(`/financeStandardField/reservation/${reservationId}`);

            if (response && response.result) {
                console.log(`Got finance fields for reservation ${reservationId}`);
                return response.result;
            }

            console.log(`No finance fields found for reservation ${reservationId}`);
            return null;
        } catch (error) {
            console.error(`Error fetching finance fields for reservation ${reservationId}:`, error.response?.data || error.message);
            return null;
        }
    }

    // Transform Hostaway reservation data to our format
    transformReservation(hostawayReservation, financeFields = null) {
        // console.log(`DEBUG: Transforming reservation - ID: ${hostawayReservation.id}, Status: ${hostawayReservation.status}, ListingMapId: ${hostawayReservation.listingMapId}`);
        
        const baseReservation = {
            hostawayId: hostawayReservation.id ? hostawayReservation.id.toString() : 'undefined',
            propertyId: parseInt(hostawayReservation.listingMapId), // Use the Hostaway listingMapId as our property ID
            guestName: `${hostawayReservation.guestFirstName || ''} ${hostawayReservation.guestLastName || ''}`.trim(),
            guestEmail: hostawayReservation.guestEmail,
            checkInDate: hostawayReservation.arrivalDate,
            checkOutDate: hostawayReservation.departureDate,
            nights: parseInt(hostawayReservation.nights || 0),
            status: this.mapStatus(hostawayReservation.status),
            source: hostawayReservation.channelName || 'Unknown',
            isProrated: false, // Will be determined by business rules
            weeklyPayoutDate: null // Will be set when processing
        };

            // If we have detailed finance fields, use those; otherwise fall back to basic fields
            if (financeFields) {
                // Calculate cleaning and other fees (cleaning + other fees + taxes)
                const cleaningFees = parseFloat(financeFields.cleaningFeeValue || 0) + 
                                   parseFloat(financeFields.otherFees || 0);
                
                // Calculate total platform fees (host channel fee + guest channel fee)
                const platformFees = parseFloat(financeFields.hostChannelFee || 0) + 
                                   parseFloat(financeFields.guestChannelFee || 0);
                
                // Calculate total revenue (base rate + cleaning + taxes)
                const totalRevenue = parseFloat(financeFields.baseRate || 0) + 
                                   cleaningFees + 
                                   parseFloat(financeFields.cityTax || 0) + 
                                   parseFloat(financeFields.salesTax || 0) + 
                                   parseFloat(financeFields.lodgingTax || 0);
                
                // Use airbnbPayoutSum if available, otherwise calculate
                const clientPayout = parseFloat(financeFields.airbnbPayoutSum || 0) || 
                                   (totalRevenue - platformFees);
                
                return {
                    ...baseReservation,
                    // Detailed financial breakdown from Finance Standard Fields API
                    baseRate: parseFloat(financeFields.baseRate || 0),
                    cleaningAndOtherFees: cleaningFees,
                    platformFees: platformFees,
                    clientRevenue: totalRevenue,
                    luxuryLodgingFee: parseFloat(financeFields.hostChannelFee || 0), // Use host channel fee as luxury lodging fee
                    clientTaxResponsibility: parseFloat(financeFields.cityTax || 0) + 
                                           parseFloat(financeFields.salesTax || 0) + 
                                           parseFloat(financeFields.lodgingTax || 0),
                    clientPayout: clientPayout,
                    // Keep legacy fields for compatibility
                    grossAmount: totalRevenue,
                    hostPayoutAmount: clientPayout,
                    hasDetailedFinance: true
                };
            } else {
            return {
                ...baseReservation,
                // Legacy fields from basic reservation data
                grossAmount: parseFloat(hostawayReservation.totalPrice || 0),
                hostPayoutAmount: parseFloat(hostawayReservation.hostPayout || 0),
                platformFees: parseFloat(hostawayReservation.channelCommission || 0),
                // Set detailed fields to null to indicate they're not available
                baseRate: null,
                cleaningAndOtherFees: null,
                clientRevenue: null,
                luxuryLodgingFee: null,
                clientTaxResponsibility: null,
                clientPayout: null,
                hasDetailedFinance: false
            };
        }
    }


    mapStatus(hostawayStatus) {
        const statusMap = {
            'new': 'new',
            'modified': 'modified', 
            'confirmed': 'confirmed',
            'cancelled': 'cancelled',
            'cancelled_by_guest': 'cancelled',
            'cancelled_by_host': 'cancelled',
            'completed': 'completed',
            // Explicitly map invalid statuses that should be excluded
            'inquiry': 'inquiry',
            'expired': 'expired',
            'declined': 'declined',
            'request': 'inquiry',  // Some systems use 'request' for inquiries
            'inquiryNotPossible': 'inquiry'  // Another inquiry variant
        };
        
        // Log any unmapped statuses to catch unexpected ones
        if (!statusMap[hostawayStatus]) {
            console.log(`WARNING: Unknown Hostaway status '${hostawayStatus}' - mapping to 'unknown'`);
            return 'unknown'; // Don't default to 'confirmed' anymore
        }
        
        // console.log(`DEBUG: Mapping Hostaway status '${hostawayStatus}' to '${statusMap[hostawayStatus]}'`);
        return statusMap[hostawayStatus];
    }

    /**
     * Get overlapping reservations for calendar-based calculations
     * Fetches all reservations that have any overlap with the specified date range
     * @param {Array} listingIds - Array of listing IDs
     * @param {string} fromDate - Start date (YYYY-MM-DD)
     * @param {string} toDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} - Array of unique reservation data
     */
    async getOverlappingReservations(listingIds, fromDate, toDate) {
        try {
            console.log(`Fetching overlapping reservations for listings: ${listingIds.join(',')}, dates: ${fromDate} to ${toDate}`);
            
            const allReservations = new Map(); // Use Map to deduplicate by reservation ID
            
            // 1. Get reservations that arrive during the period
            console.log('Fetching arrivals during period...');
            const arrivals = await this.getConsolidatedFinanceReport({
                listingMapIds: listingIds,
                fromDate,
                toDate,
                dateType: 'arrivalDate'
            });
            arrivals.forEach(res => allReservations.set(res.id, res));
            
            // 2. Get reservations that depart during the period
            console.log('Fetching departures during period...');
            const departures = await this.getConsolidatedFinanceReport({
                listingMapIds: listingIds,
                fromDate,
                toDate,
                dateType: 'departureDate'
            });
            departures.forEach(res => allReservations.set(res.id, res));
            
            // 3. Get long-staying reservations that might straddle the period
            // Look back 12 months to catch long-term stays that started months ago
            const lookbackDate = new Date(fromDate);
            lookbackDate.setDate(lookbackDate.getDate() - 365);
            const lookbackDateStr = lookbackDate.toISOString().split('T')[0];
            
            console.log(`Fetching long stays (arrivals from ${lookbackDateStr} to ${toDate})...`);
            const longStays = await this.getConsolidatedFinanceReport({
                listingMapIds: listingIds,
                fromDate: lookbackDateStr,
                toDate,
                dateType: 'arrivalDate'
            });
            
            // Filter long stays to only include those that actually overlap our period
            longStays.forEach(res => {
                const arrivalDate = new Date(res.arrivalDate);
                const departureDate = new Date(res.departureDate);
                const periodStart = new Date(fromDate);
                const periodEnd = new Date(toDate);
                
                // Check if reservation overlaps with our period
                if (arrivalDate <= periodEnd && departureDate >= periodStart) {
                    allReservations.set(res.id, res);
                }
            });
            
            const uniqueReservations = Array.from(allReservations.values());
            console.log(`Found ${uniqueReservations.length} unique overlapping reservations`);
            
            return uniqueReservations;
            
        } catch (error) {
            console.error('Error fetching overlapping reservations:', error);
            throw error;
        }
    }

    async getConsolidatedFinanceReport(params = {}) {
        try {
            const {
                listingMapIds = [],
                fromDate,
                toDate,
                dateType = 'departureDate',
                statuses = [],
                format = 'json'
            } = params;

            console.log(`Fetching consolidated finance report for listings: ${listingMapIds.join(', ')}, dates: ${fromDate} to ${toDate}`);

            const requestBody = {
                listingMapIds,
                fromDate,
                toDate,
                dateType,
                format
            };

            // Only add statuses if provided
            if (statuses.length > 0) {
                requestBody.statuses = statuses;
            }

            const response = await axios.post(
                `${this.baseURL}/finance/report/consolidated`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${await this.getAuthToken()}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.result) {
                console.log(`Got ${response.data.result.rows.length} reservations from consolidated finance report`);
                return this.transformConsolidatedFinanceData(response.data.result);
            }

            console.log('No data returned from consolidated finance report');
            return [];
        } catch (error) {
            console.error('Consolidated finance report error:', error.response?.data || error.message);
            throw new Error('Failed to fetch consolidated finance report');
        }
    }

    transformConsolidatedFinanceData(result) {
        const { columns, rows } = result;
        
        // Create a mapping of column names to indices
        const columnMap = {};
        columns.forEach((col, index) => {
            columnMap[col.name] = index;
        });

        // console.log('DEBUG: Available columns:', Object.keys(columnMap));

        return rows.map(row => {
            // Extract basic reservation info
            const hostawayId = row[columnMap.id]?.toString() || 'undefined';
            const propertyId = parseInt(row[columnMap.listingMapId]);
            const guestName = row[columnMap.guestName] || '';
            const status = this.mapStatus(row[columnMap.status]);
            const source = row[columnMap.channelName] || 'Unknown';
            // Handle dates properly to avoid timezone issues
            const checkInDate = row[columnMap.arrivalDate];
            const checkOutDate = row[columnMap.departureDate];
            const nights = parseInt(row[columnMap.nights] || 0);

            // Extract detailed financial data - using the exact field names from consolidated report
            const baseRate = parseFloat(row[columnMap.baseRate] || 0);
            const cleaningAndOtherFees = parseFloat(row[columnMap.CleaningAndOtherFees] || 0);
            const platformFees = parseFloat(row[columnMap.PlatformFees] || 0);
            const clientRevenue = parseFloat(row[columnMap.ClientRevenue] || 0);
            const luxuryLodgingFee = parseFloat(row[columnMap.LuxuryLodgingFee] || 0);
            const clientTaxResponsibility = parseFloat(row[columnMap.ClientTaxResponsibility] || 0);
            const clientPayout = parseFloat(row[columnMap.ClientPayout] || 0);
            
            // Fallback to legacy fields if the new ones aren't available
            const ownerPayout = clientPayout || parseFloat(row[columnMap.ownerPayout] || 0);
            const rentalRevenue = clientRevenue || parseFloat(row[columnMap.rentalRevenue] || 0);

            return {
                hostawayId,
                propertyId,
                guestName,
                guestEmail: '', // Not available in consolidated report
                checkInDate,
                checkOutDate,
                nights,
                status,
                source,
                isProrated: false, // Will be determined by business rules
                weeklyPayoutDate: null, // Will be set when processing
                
                // Detailed financial breakdown - using the exact fields from consolidated report
                baseRate,
                cleaningAndOtherFees,
                platformFees,
                clientRevenue,
                luxuryLodgingFee,
                clientTaxResponsibility,
                clientPayout,
                
                // Legacy fields for compatibility
                grossAmount: rentalRevenue,
                hostPayoutAmount: ownerPayout,
                hasDetailedFinance: true
            };
        });
    }
}

module.exports = new HostawayService();
