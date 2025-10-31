const axios = require('axios');

class HostifyService {
    constructor() {
        this.baseURL = process.env.HOSTIFY_API_URL || 'https://api-rms.hostify.com';
        this.apiKey = process.env.HOSTIFY_API_KEY || 'CePFsroZu03LA6C5szMsRuA2Eh62rGDS';
    }

    async makeRequest(endpoint, params = {}, method = 'GET') {
        if (!this.apiKey) {
            throw new Error('Hostify API Key is required. Please check your .env file.');
        }
        
        try {
            console.log(`Making Hostify API request to: ${this.baseURL}${endpoint}`);
            console.log(`Using API key: ${this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'Not set'}`);
            
            const headers = {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json'
            };
            
            console.log('Request params:', params);
            
            const config = {
                headers,
                timeout: 30000
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
            console.error(`Hostify API request failed: ${endpoint}`, error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                
                if (error.response.status === 401 || error.response.status === 403) {
                    throw new Error(`Hostify API Authentication Error: ${error.response.data.message || 'Invalid API key'}. Please check your API key.`);
                }
            }
            throw new Error(`Hostify API Error: ${error.message}`);
        }
    }

    async getReservations(startDate, endDate, page = 1, perPage = 100, listingId = null) {
        const params = {
            start_date: startDate,
            end_date: endDate,
            page,
            per_page: perPage
        };

        // Add listing filter if specified
        if (listingId) {
            params.listing_id = listingId;
            console.log(`Property filter enabled for listing_id: ${listingId}`);
        }

        return await this.makeRequest('/reservations', params);
    }

    async getAllReservations(startDate, endDate, listingId = null) {
        console.log(`Fetching reservations for period: ${startDate} to ${endDate}${listingId ? ` for listing ${listingId}` : ''}`);

        let allReservations = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
            console.log(`Fetching reservations page ${page}`);
            
            const response = await this.getReservations(startDate, endDate, page, perPage, listingId);
            
            if (response.success && response.reservations && response.reservations.length > 0) {
                allReservations = allReservations.concat(response.reservations);
                console.log(`Page ${page}: Got ${response.reservations.length} reservations (total so far: ${allReservations.length})`);
                
                // Check if there are more results
                hasMore = response.reservations.length === perPage && response.total > allReservations.length;
                page++;
                
                // Safety check to prevent infinite loops
                if (page > 100) {
                    console.log('Reached maximum reservation pages for safety');
                    break;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`Total reservations fetched: ${allReservations.length}`);
        
        // Transform all reservations to our format
        const transformedReservations = allReservations.map(reservation => this.transformReservation(reservation));
        
        return { result: transformedReservations };
    }

    async getAllReservationsWithFinanceData(startDate, endDate, listingId = null) {
        console.log(`Fetching reservations with detailed finance data for period: ${startDate} to ${endDate}${listingId ? ` for listing ${listingId}` : ''}`);
        
        // Hostify includes financial data by default in reservations, so we can just use getAllReservations
        return await this.getAllReservations(startDate, endDate, listingId);
    }

    async getReservationsForWeek(weekStartDate) {
        // Convert Tuesday start to Monday end (7 days)
        const startDate = new Date(weekStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        console.log(`Fetching reservations for week: ${startDateStr} to ${endDateStr}`);

        const response = await this.getAllReservations(startDateStr, endDateStr);
        return response.result || [];
    }

    async getProperties() {
        return await this.makeRequest('/listings', { service_pms: 1 });
    }

    async getAllProperties() {
        console.log(`Fetching ALL properties/listings with pagination...`);

        let allProperties = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
            console.log(`Fetching properties page ${page}`);
            
            const response = await this.makeRequest('/listings', { page, per_page: perPage, service_pms: 1 });
            
            if (response.success && response.listings && response.listings.length > 0) {
                allProperties = allProperties.concat(response.listings);
                console.log(`Page ${page}: Got ${response.listings.length} properties (total so far: ${allProperties.length})`);
                
                // Check if there are more results
                hasMore = response.listings.length === perPage && response.total > allProperties.length;
                page++;
                
                // Safety check to prevent infinite loops
                if (page > 50) {
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

    // Users API (for owners)
    async getUsers() {
        console.log('Fetching all users from Hostify...');
        return await this.makeRequest('/users');
    }

    async getUser(userId) {
        console.log(`Fetching user ${userId} from Hostify...`);
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

    // Get all users and transform them to owners
    async getAllOwners() {
        console.log('Fetching all owners (users with Listing Owner role) from Hostify...');
        
        try {
            const response = await this.getUsers();
            
            // Fix: API returns "users" not "user"
            if (!response.success || !response.users) {
                console.warn('No users found in Hostify response');
                return [];
            }

            // Filter for users with "Listing Owner" role
            const owners = response.users
                .filter(user => {
                    const roles = Array.isArray(user.roles) ? user.roles : [user.roles];
                    return roles.includes('Listing Owner') && user.is_active === 1;
                })
                .map(user => this.transformUser(user));

            console.log(`✅ Found ${owners.length} active listing owners in Hostify`);
            return owners;
        } catch (error) {
            console.error('❌ Failed to fetch owners from Hostify:', error.message);
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
        
        const baseReservation = {
            hostifyId: hostifyReservation.id ? hostifyReservation.id.toString() : 'undefined',
            propertyId: parseInt(hostifyReservation.listing_id), // Use Hostify listing_id
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
        const extrasFees = parseFloat(hostifyReservation.extras_price || 0);
        const platformFees = parseFloat(hostifyReservation.channel_commission || 0);
        const taxAmount = parseFloat(hostifyReservation.tax_amount || 0);
        
        // Calculate totals
        const totalRevenue = parseFloat(hostifyReservation.subtotal || 0);
        const clientPayout = parseFloat(hostifyReservation.payout_price || 0);
        
        return {
            ...baseReservation,
            // Detailed financial breakdown
            baseRate: baseRate,
            cleaningAndOtherFees: cleaningFee + extrasFees,
            platformFees: platformFees,
            clientRevenue: totalRevenue,
            luxuryLodgingFee: platformFees, // Use channel commission as luxury lodging fee
            clientTaxResponsibility: taxAmount,
            clientPayout: clientPayout,
            // Legacy fields for compatibility
            grossAmount: totalRevenue,
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
            // Explicitly map invalid statuses that should be excluded
            'inquiry': 'inquiry',
            'expired': 'expired',
            'declined': 'declined',
            'declined_inq': 'inquiry',
            'offer': 'new',
            'withdrawn': 'cancelled'
        };
        
        // Log any unmapped statuses to catch unexpected ones
        if (!statusMap[hostifyStatus]) {
            console.log(`WARNING: Unknown Hostify status '${hostifyStatus}' - mapping to 'unknown'`);
            return 'unknown';
        }
        
        return statusMap[hostifyStatus];
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
            
            // Look back some days to catch long stays that started before the period
            const lookbackDate = new Date(fromDate);
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackDateStr = lookbackDate.toISOString().split('T')[0];
            
            // Look forward some days to catch reservations that checkout after the period ends
            const lookforwardDate = new Date(toDate);
            lookforwardDate.setDate(lookforwardDate.getDate() + 90);
            const lookforwardDateStr = lookforwardDate.toISOString().split('T')[0];
            
            // For each listing, fetch reservations
            for (const listingId of listingIds) {
                console.log(`Fetching reservations for listing ${listingId}...`);
                const response = await this.getAllReservations(lookbackDateStr, lookforwardDateStr, listingId);
                
                if (response.result) {
                    // Filter to only include reservations that actually overlap our period
                    response.result.forEach(res => {
                        const arrivalDate = new Date(res.checkInDate);
                        const departureDate = new Date(res.checkOutDate);
                        const periodStart = new Date(fromDate);
                        const periodEnd = new Date(toDate);
                        
                        // Check if reservation overlaps with our period
                        if (arrivalDate <= periodEnd && departureDate >= periodStart) {
                            // Add required fields for compatibility
                            res.arrivalDate = res.checkInDate;
                            res.departureDate = res.checkOutDate;
                            res.id = res.hostifyId;
                            
                            allReservations.set(res.hostifyId, res);
                        }
                    });
                }
            }
            
            const uniqueReservations = Array.from(allReservations.values());
            console.log(`✅ Found ${uniqueReservations.length} unique overlapping reservations`);
            
            return uniqueReservations;
            
        } catch (error) {
            console.error('❌ Error fetching overlapping reservations:', error);
            throw error;
        }
    }

    async getConsolidatedFinanceReport(params = {}) {
        try {
            const {
                listingMapIds = [],
                fromDate,
                toDate,
                dateType = 'checkOut'
            } = params;

            console.log(`Fetching reservations for listings: ${listingMapIds.join(', ')}, dates: ${fromDate} to ${toDate}`);

            // Hostify doesn't have a consolidated finance report endpoint
            // We'll fetch reservations and filter them
            let allReservations = [];
            
            if (listingMapIds.length > 0) {
                // Fetch for specific listings
                for (const listingId of listingMapIds) {
                    const response = await this.getAllReservations(fromDate, toDate, listingId);
                    if (response.result) {
                        allReservations = allReservations.concat(response.result);
                    }
                }
            } else {
                // Fetch all reservations
                const response = await this.getAllReservations(fromDate, toDate);
                if (response.result) {
                    allReservations = response.result;
                }
            }

            console.log(`✅ Got ${allReservations.length} reservations`);
            return allReservations;
            
        } catch (error) {
            console.error('❌ Hostify reservations fetch error:', error.response?.data || error.message);
            throw new Error('Failed to fetch reservations from Hostify');
        }
    }
}

module.exports = new HostifyService();

