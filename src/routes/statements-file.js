const express = require('express');
const router = express.Router();
const FileDataService = require('../services/FileDataService');
const BackgroundJobService = require('../services/BackgroundJobService');
const ListingService = require('../services/ListingService');

// GET /api/statements/jobs/:jobId - Get background job status
router.get('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = BackgroundJobService.getJob(jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        
        res.json(job);
    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({ error: 'Failed to fetch job status' });
    }
});

// GET /api/statements-file - Get all statements from files
router.get('/', async (req, res) => {
    try {
        const {
            ownerId,
            propertyId,
            propertyIds, // Support multi-select filtering
            status,
            startDate,
            endDate,
            limit = 50,
            offset = 0
        } = req.query;

        let statements = await FileDataService.getStatements();

        // Apply filters
        if (ownerId) {
            statements = statements.filter(s => s.ownerId === parseInt(ownerId));
        }

        // Support both single propertyId and multiple propertyIds
        if (propertyIds) {
            const ids = propertyIds.split(',').map(id => parseInt(id.trim()));
            statements = statements.filter(s => ids.includes(s.propertyId));
        } else if (propertyId) {
            statements = statements.filter(s => s.propertyId === parseInt(propertyId));
        }
        
        if (status) {
            statements = statements.filter(s => s.status === status);
        }
        
        if (startDate && endDate) {
            statements = statements.filter(s => {
                const statementStart = new Date(s.weekStartDate);
                const statementEnd = new Date(s.weekEndDate);
                const filterStart = new Date(startDate);
                const filterEnd = new Date(endDate);
                
                // Check if statement period overlaps with filter period
                return statementStart <= filterEnd && statementEnd >= filterStart;
            });
        } else if (startDate) {
            statements = statements.filter(s => new Date(s.weekEndDate) >= new Date(startDate));
        } else if (endDate) {
            statements = statements.filter(s => new Date(s.weekStartDate) <= new Date(endDate));
        }

        // Sort by creation date (newest first)
        statements.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.created_at || 0);
            const dateB = new Date(b.createdAt || b.created_at || 0);
            return dateB - dateA; // Descending order (newest first)
        });

        // Apply pagination
        const total = statements.length;
        const paginatedStatements = statements.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        // Format for frontend
        const formattedStatements = paginatedStatements.map(s => ({
            id: s.id,
            ownerId: s.ownerId,
            ownerName: s.ownerName || 'Default Owner',
            propertyId: s.propertyId,
            propertyName: s.propertyName || (s.propertyId ? `Property ${s.propertyId}` : 'All Properties'),
            weekStartDate: s.weekStartDate,
            weekEndDate: s.weekEndDate,
            calculationType: s.calculationType || 'checkout',
            totalRevenue: s.totalRevenue,
            totalExpenses: s.totalExpenses,
            pmCommission: s.pmCommission,
            pmPercentage: s.pmPercentage,
            techFees: s.techFees,
            insuranceFees: s.insuranceFees,
            adjustments: s.adjustments,
            ownerPayout: s.ownerPayout,
            status: s.status,
            sentAt: s.sentAt,
            createdAt: s.createdAt || s.created_at,
            updatedAt: s.updatedAt || s.updated_at
        }));

        res.json({
            statements: formattedStatements,
            total: total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Statements get error:', error);
        res.status(500).json({ error: 'Failed to get statements' });
    }
});

// GET /api/statements-file/:id - Get specific statement
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);
        
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        res.json(statement);
    } catch (error) {
        console.error('Statement get error:', error);
        res.status(500).json({ error: 'Failed to get statement' });
    }
});

// Helper function to generate a COMBINED statement for multiple properties
async function generateCombinedStatement(req, res, propertyIds, ownerId, startDate, endDate, calculationType) {
    try {
        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        // Get data from files
        const listings = await FileDataService.getListings();
        const owners = await FileDataService.getOwners();

        // Get the owner - handle both 'default'/1 as default owner
        const owner = owners.find(o => {
            if (ownerId === 'default' || ownerId === 1 || ownerId === '1') {
                return o.id === 'default';
            }
            return o.id === ownerId || o.id === parseInt(ownerId);
        }) || owners[0];

        // Parse property IDs to integers
        const parsedPropertyIds = propertyIds.map(id => parseInt(id));

        // Find all the target listings
        const targetListings = listings.filter(l => parsedPropertyIds.includes(l.id));
        if (targetListings.length === 0) {
            return res.status(404).json({ error: 'No properties found for the given IDs' });
        }

        // OPTIMIZED: Batch fetch all data in parallel

        // Get listing info for PM fees and co-host status (batch fetch)
        const dbListings = await ListingService.getListingsWithPmFees(parsedPropertyIds);
        const listingInfoMap = {};
        dbListings.forEach(l => { listingInfoMap[l.id] = l; });

        // Fetch reservations and expenses in parallel using batch methods
        const [reservationsByProperty, expensesByProperty] = await Promise.all([
            FileDataService.getReservationsBatch(startDate, endDate, parsedPropertyIds, calculationType),
            FileDataService.getExpensesBatch(startDate, endDate, parsedPropertyIds)
        ]);

        // Combine all reservations and expenses
        let allReservations = [];
        let allExpenses = [];
        let allDuplicateWarnings = [];

        for (const propId of parsedPropertyIds) {
            const propReservations = reservationsByProperty[propId] || [];
            const propExpenseData = expensesByProperty[propId] || { expenses: [], duplicateWarnings: [] };

            allReservations.push(...propReservations);
            allExpenses.push(...propExpenseData.expenses);
            allDuplicateWarnings.push(...propExpenseData.duplicateWarnings);
        }

        // Filter reservations by date and status
        const periodReservations = allReservations.filter(res => {
            // Check property ID is in our list
            if (!parsedPropertyIds.includes(res.propertyId)) {
                return false;
            }

            // Check date match based on calculation type
            let dateMatch = true;
            if (calculationType === 'calendar') {
                // For calendar-based calculation, reservations are already filtered and prorated
                dateMatch = true;
            } else {
                // For checkout-based calculation, filter by checkout date
                const checkoutDate = new Date(res.checkOutDate);
                dateMatch = checkoutDate >= periodStart && checkoutDate <= periodEnd;
                if (!dateMatch) return false;
            }

            // Only include confirmed, modified, and new status reservations
            const allowedStatuses = ['confirmed', 'modified', 'new'];
            return allowedStatuses.includes(res.status);
        }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

        // Filter expenses by date
        const periodExpenses = allExpenses.filter(exp => {
            // Check property ID is in our list (or is null for SecureStay)
            if (exp.propertyId !== null && !parsedPropertyIds.includes(exp.propertyId)) {
                return false;
            }
            const expenseDate = new Date(exp.date);
            return expenseDate >= periodStart && expenseDate <= periodEnd;
        });

        // Calculate totals - handle co-host properties per reservation
        let totalRevenue = 0;
        for (const res of periodReservations) {
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const isCohostForProperty = listingInfoMap[res.propertyId]?.isCohostOnAirbnb || false;

            // Exclude Airbnb revenue for co-hosted properties
            if (isAirbnb && isCohostForProperty) {
                continue;
            }

            // Use clientRevenue (prorated) for calendar-based statements, grossAmount for checkout-based
            const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            totalRevenue += revenue;
        }

        // Calculate total expenses (only actual costs, not upsells)
        const totalExpenses = periodExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum : sum + Math.abs(exp.amount);
        }, 0);

        // Calculate total upsells (additional payouts)
        const totalUpsells = periodExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum + exp.amount : sum;
        }, 0);

        // Calculate PM commission per-reservation based on each property's PM fee
        let pmCommission = 0;
        for (const res of periodReservations) {
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const listing = listingInfoMap[res.propertyId];
            const isCohostForProperty = listing?.isCohostOnAirbnb || false;

            // Skip PM commission for co-hosted Airbnb reservations
            if (isAirbnb && isCohostForProperty) {
                continue;
            }

            const resPmFee = listing?.pmFeePercentage ?? 15;
            // Use clientRevenue (prorated) for calendar-based statements
            const resRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            const resCommission = resRevenue * (resPmFee / 100);
            pmCommission += resCommission;
        }

        // Calculate average PM percentage for display
        const avgPmPercentage = totalRevenue > 0 ? (pmCommission / totalRevenue) * 100 : 15;

        // Calculate fees per property
        const propertyCount = targetListings.length;
        const techFees = propertyCount * 50; // $50 per property
        const insuranceFees = propertyCount * 25; // $25 per property

        // Calculate owner payout (GROSS PAYOUT + ADDITIONAL PAYOUTS - EXPENSES)
        // Note: techFees and insuranceFees are stored but not included in payout calculation
        const ownerPayout = totalRevenue - pmCommission + totalUpsells - totalExpenses;

        // Generate unique ID
        const existingStatements = await FileDataService.getStatements();
        const newId = FileDataService.generateId(existingStatements);

        // Create property names string for display
        const propertyNames = targetListings.map(l => l.nickname || l.displayName || l.name).join(', ');
        const shortPropertyNames = targetListings.length <= 3
            ? propertyNames
            : `${targetListings.slice(0, 2).map(l => l.nickname || l.displayName || l.name).join(', ')} +${targetListings.length - 2} more`;

        // Create statement object
        const statement = {
            id: newId,
            ownerId: owner.id === 'default' ? 1 : parseInt(owner.id),
            ownerName: owner.name,
            propertyId: null, // Combined statement has no single property
            propertyIds: parsedPropertyIds, // Store all property IDs
            propertyName: shortPropertyNames,
            propertyNames: propertyNames, // Full list for detail view
            weekStartDate: startDate,
            weekEndDate: endDate,
            calculationType,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            pmCommission: Math.round(pmCommission * 100) / 100,
            pmPercentage: Math.round(avgPmPercentage * 100) / 100,
            techFees: Math.round(techFees * 100) / 100,
            insuranceFees: Math.round(insuranceFees * 100) / 100,
            adjustments: 0,
            ownerPayout: Math.round(ownerPayout * 100) / 100,
            isCombinedStatement: true,
            propertyCount: propertyCount,
            status: 'draft',
            sentAt: null,
            createdAt: new Date().toISOString(),
            reservations: periodReservations,
            expenses: periodExpenses,
            duplicateWarnings: allDuplicateWarnings,
            items: [
                // Revenue items from reservations (grouped by property)
                ...periodReservations.map(res => {
                    const listing = targetListings.find(l => l.id === res.propertyId);
                    const propertyLabel = listing ? (listing.nickname || listing.displayName || listing.name) : `Property ${res.propertyId}`;
                    // Use clientRevenue (prorated) for calendar-based statements
                    const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                    return {
                        type: 'revenue',
                        description: `[${propertyLabel}] ${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                        amount: revenue,
                        date: res.checkOutDate,
                        category: 'booking',
                        propertyId: res.propertyId
                    };
                }),
                // Expenses and upsells
                ...periodExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell') || (exp.expenseType === 'extras');
                    const listing = exp.propertyId ? targetListings.find(l => l.id === exp.propertyId) : null;
                    const propertyLabel = listing ? (listing.nickname || listing.displayName || listing.name) : (exp.listing || 'General');

                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                        description: exp.propertyId ? `[${propertyLabel}] ${exp.description}` : exp.description,
                        amount: Math.abs(exp.amount),
                        date: exp.date,
                        category: exp.type || exp.category || 'expense',
                        vendor: exp.vendor,
                        listing: exp.listing,
                        propertyId: exp.propertyId
                    };
                })
            ]
        };

        // Save statement to file
        await FileDataService.saveStatement(statement);


        res.status(201).json({
            message: `Combined statement generated for ${propertyCount} properties`,
            statement: {
                id: statement.id,
                ownerPayout: statement.ownerPayout,
                totalRevenue: statement.totalRevenue,
                totalExpenses: statement.totalExpenses,
                itemCount: statement.items.length,
                propertyCount: propertyCount,
                isCombinedStatement: true
            }
        });
    } catch (error) {
        console.error('Combined statement generation error:', error);
        res.status(500).json({ error: 'Failed to generate combined statement' });
    }
}

// POST /api/statements-file/generate - Generate statement and save to file
router.post('/generate', async (req, res) => {
    try {
        const { propertyId, propertyIds, ownerId, tag, startDate, endDate, calculationType = 'checkout' } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        if (!propertyId && !propertyIds && !ownerId && !tag) {
            return res.status(400).json({ error: 'Either property ID, property IDs, owner ID, or tag is required' });
        }

        // Handle combined multi-property statement generation
        if (propertyIds && Array.isArray(propertyIds) && propertyIds.length > 1) {
            return await generateCombinedStatement(req, res, propertyIds, ownerId, startDate, endDate, calculationType);
        }

        // Handle "Generate All" option or tag-based generation - run in background
        if (ownerId === 'all' || (tag && !propertyId)) {
            
            const jobId = await BackgroundJobService.runInBackground(
                'bulk_statement_generation',
                async (jobId) => {
                    await generateAllOwnerStatementsBackground(jobId, startDate, endDate, calculationType, tag);
                },
                { startDate, endDate, calculationType, tag }
            );
            
            return res.status(202).json({
                message: tag ? `Tag-based statement generation started for "${tag}"` : 'Bulk statement generation started in background',
                jobId,
                status: 'processing',
                note: 'This may take several minutes to complete. Check back later or use the job status endpoint.',
                statusUrl: `/api/statements/jobs/${jobId}`
            });
        }

        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        if (periodStart > periodEnd) {
            return res.status(400).json({ error: 'Start date must be before end date' });
        }

        // OPTIMIZED: Fetch all data in parallel
        const [listings, reservations, expenses, owners] = await Promise.all([
            FileDataService.getListings(),
            FileDataService.getReservations(startDate, endDate, propertyId, calculationType),
            FileDataService.getExpenses(startDate, endDate, propertyId),
            FileDataService.getOwners()
        ]);
        
        // Check for duplicate warnings
        const duplicateWarnings = expenses.duplicateWarnings || [];
        if (duplicateWarnings.length > 0) {
            console.warn(`[Warning]  Found ${duplicateWarnings.length} potential duplicate expenses in statement`);
        }

        let targetListings, owner;

        if (propertyId) {
            // Generate statement for specific property
            const listing = listings.find(l => l.id === parseInt(propertyId));
            if (!listing) {
                return res.status(404).json({ error: 'Property not found' });
            }
            targetListings = [listing];
            owner = owners[0]; // Default owner
        } else if (tag) {
            // Generate statements for all properties with the specified tag
            // Use case-insensitive matching for tags
            const tagLower = tag.toLowerCase().trim();

            // Debug: Log all listings with tags for troubleshooting
            const listingsWithTags = listings.filter(l => l.tags && l.tags.length > 0);
            console.log(`[Tag Filter] Looking for tag: "${tag}" (normalized: "${tagLower}")`);
            console.log(`[Tag Filter] Total listings: ${listings.length}, Listings with tags: ${listingsWithTags.length}`);

            const taggedListings = listings.filter(l => {
                const listingTags = l.tags || [];
                const matches = listingTags.some(t => t.toLowerCase().trim() === tagLower);
                if (listingTags.length > 0) {
                    console.log(`[Tag Filter] Listing ${l.id} (${l.name}): tags=[${listingTags.join(', ')}], matches=${matches}`);
                }
                return matches;
            });

            console.log(`[Tag Filter] Found ${taggedListings.length} listings matching tag "${tag}"`);

            if (taggedListings.length === 0) {
                return res.status(404).json({ error: `No properties found with tag: ${tag}` });
            }
            
            targetListings = taggedListings;
            owner = owners.find(o => {
                if (ownerId === 'default' || ownerId === 1 || ownerId === '1') {
                    return o.id === 'default';
                }
                return o.id === ownerId || o.id === parseInt(ownerId);
            }) || owners[0];
        } else {
            // Generate consolidated statement for all owner's properties
            // Find owner - handle both 'default'/1 as default owner, and other owner IDs
            owner = owners.find(o => {
                if (ownerId === 'default' || ownerId === 1 || ownerId === '1') {
                    return o.id === 'default';
                }
                return o.id === ownerId || o.id === parseInt(ownerId);
            });
            if (!owner) {
                // Fallback to default owner if not found
                owner = owners[0];
            }
            targetListings = listings; // All properties for now
        }

        // Filter reservations - optimized with reduced logging
        const allowedStatuses = ['confirmed', 'modified', 'new'];
        const periodReservations = reservations.filter(res => {
            if (propertyId && res.propertyId !== parseInt(propertyId)) {
                return false;
            }

            // Check date match based on calculation type
            if (calculationType !== 'calendar') {
                const checkoutDate = new Date(res.checkOutDate);
                if (checkoutDate < periodStart || checkoutDate > periodEnd) {
                    return false;
                }
            }

            return allowedStatuses.includes(res.status);
        }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

        // Get expenses for the date range
        // Note: SecureStay expenses are already filtered by property in FileDataService.getExpenses()
        // so we don't need to filter by propertyId here for SecureStay expenses (they have propertyId: null)
        const periodExpenses = expenses.filter(exp => {
            // For file-based expenses, filter by propertyId
            if (propertyId && exp.propertyId !== null && exp.propertyId !== parseInt(propertyId)) {
                return false;
            }
            const expenseDate = new Date(exp.date);
            return expenseDate >= periodStart && expenseDate <= periodEnd;
        });

        // Check if this is a co-host on Airbnb property (need this early for revenue calculation)
        let isCohostOnAirbnb = false;
        let airbnbPassThroughTax = false;
        let disregardTax = false;
        let listingInfo = null;
        if (propertyId) {
            listingInfo = await ListingService.getListingWithPmFee(parseInt(propertyId));
            isCohostOnAirbnb = listingInfo?.isCohostOnAirbnb || false;
            airbnbPassThroughTax = listingInfo?.airbnbPassThroughTax || false;
            disregardTax = listingInfo?.disregardTax || false;
        }

        // Calculate totals - exclude Airbnb revenue if co-host is enabled
        const totalRevenue = periodReservations.reduce((sum, res) => {
            // Check if this is an Airbnb reservation
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');

            // Exclude Airbnb revenue for co-hosted properties (client gets paid directly)
            if (isAirbnb && isCohostOnAirbnb) {
                return sum;
            }

            // Use clientRevenue (prorated) for calendar-based statements, grossAmount for checkout-based
            const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            return sum + revenue;
        }, 0);
        
        // Separate expenses (negative/costs) from upsells (positive/revenue)
        const totalExpenses = periodExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum : sum + Math.abs(exp.amount); // Only add actual expenses (costs)
        }, 0);

        // Calculate total upsells (additional payouts)
        const totalUpsells = periodExpenses.reduce((sum, exp) => {
            const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
            return isUpsell ? sum + exp.amount : sum;
        }, 0);

        // Calculate PM commission: For multi-property statements, calculate per-reservation based on property PM fee
        // For co-hosted properties, only calculate PM commission on non-Airbnb reservations
        let pmCommission = 0;
        let pmPercentage = 15; // For display purposes
        
        if (propertyId) {
            // Single property - use its PM fee for revenue (excluding co-hosted Airbnb)
            if (listingInfo && listingInfo.pmFeePercentage !== null) {
                pmPercentage = listingInfo.pmFeePercentage;
            }
            pmCommission = totalRevenue * (pmPercentage / 100);
        } else {
            // Multi-property statement - calculate PM commission per reservation
            const propertyPmFees = {}; // Cache PM fees to avoid repeated DB calls
            const propertyListings = {}; // Cache listing info

            for (const res of periodReservations) {
                if (!propertyPmFees[res.propertyId]) {
                    const listing = await ListingService.getListingWithPmFee(res.propertyId);
                    propertyPmFees[res.propertyId] = listing?.pmFeePercentage ?? 15;
                    propertyListings[res.propertyId] = listing;
                }

                // Check if this is Airbnb and co-hosted
                const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                const isCohostForProperty = propertyListings[res.propertyId]?.isCohostOnAirbnb || false;

                // Skip PM commission for co-hosted Airbnb reservations
                if (isAirbnb && isCohostForProperty) {
                    continue;
                }

                const resPmFee = propertyPmFees[res.propertyId];
                // Use clientRevenue (prorated) for calendar-based statements
                const resRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                const resCommission = resRevenue * (resPmFee / 100);
                pmCommission += resCommission;
            }

            // Calculate average PM percentage for display
            pmPercentage = totalRevenue > 0 ? (pmCommission / totalRevenue) * 100 : 15;
        }
        
        // Calculate fees per property
        const propertyCount = targetListings.length;
        const techFees = propertyCount * 50; // $50 per property
        const insuranceFees = propertyCount * 25; // $25 per property

        // Calculate owner payout (GROSS PAYOUT + ADDITIONAL PAYOUTS - EXPENSES)
        // Note: techFees and insuranceFees are stored but not included in payout calculation
        const ownerPayout = totalRevenue - pmCommission + totalUpsells - totalExpenses;

        // Generate unique ID
        const existingStatements = await FileDataService.getStatements();
        const newId = FileDataService.generateId(existingStatements);

        // Create statement object
        const statement = {
            id: newId,
            ownerId: owner.id === 'default' ? 1 : parseInt(owner.id),
            ownerName: owner.name,
            propertyId: propertyId ? parseInt(propertyId) : null,
            propertyName: propertyId ? (targetListings[0].nickname || targetListings[0].displayName || targetListings[0].name) : 'All Properties',
            weekStartDate: startDate,
            weekEndDate: endDate,
            calculationType,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            pmCommission: Math.round(pmCommission * 100) / 100,
            pmPercentage: pmPercentage,
            techFees: Math.round(techFees * 100) / 100,
            insuranceFees: Math.round(insuranceFees * 100) / 100,
            adjustments: 0,
            ownerPayout: Math.round(ownerPayout * 100) / 100,
            isCohostOnAirbnb: isCohostOnAirbnb,
            airbnbPassThroughTax: airbnbPassThroughTax,
            disregardTax: disregardTax,
            status: 'draft',
            sentAt: null,
            createdAt: new Date().toISOString(),
            reservations: periodReservations,
            expenses: periodExpenses,
            duplicateWarnings: duplicateWarnings,
            items: [
                // Revenue items from reservations
                ...periodReservations.map(res => {
                    // Use clientRevenue (prorated) for calendar-based statements
                    const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                    return {
                        type: 'revenue',
                        description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                        amount: revenue,
                        date: res.checkOutDate,
                        category: 'booking'
                    };
                }),
                // Expenses and upsells - categorize based on amount sign and category
                ...periodExpenses.map(exp => {
                    const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell') || (exp.expenseType === 'extras');
                    
                    return {
                        type: isUpsell ? 'upsell' : 'expense',
                    description: exp.description,
                        amount: Math.abs(exp.amount), // Always store as positive, type determines if it's added or subtracted
                    date: exp.date,
                    category: exp.type || exp.category || 'expense',
                    vendor: exp.vendor,
                    listing: exp.listing
                    };
                })
            ]
        };

        // Save statement to file
        await FileDataService.saveStatement(statement);


        res.status(201).json({
            message: 'Statement generated successfully',
            statement: {
                id: statement.id,
                ownerPayout: statement.ownerPayout,
                totalRevenue: statement.totalRevenue,
                totalExpenses: statement.totalExpenses,
                itemCount: statement.items.length
            }
        });
    } catch (error) {
        console.error('Statement generation error:', error);
        res.status(500).json({ error: 'Failed to generate statement' });
    }
});

// PUT /api/statements-file/:id/status - Update statement status
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Update status
        statement.status = status;
        if (status === 'sent') {
            statement.sentAt = new Date().toISOString();
        }

        // Save updated statement
        await FileDataService.saveStatement(statement);

        res.json({ message: 'Statement status updated successfully' });
    } catch (error) {
        console.error('Statement status update error:', error);
        res.status(500).json({ error: 'Failed to update statement status' });
    }
});

// GET /api/statements-file/:id/cancelled-reservations - Get available cancelled reservations for a statement period
router.get('/:id/cancelled-reservations', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);
        
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Make direct API call to Hostaway to get all reservations for this period and property
        const hostawayService = require('../services/HostawayService');

        // Get all reservations for this property and period from Hostaway
        const apiResponse = await hostawayService.getAllReservations(
            statement.weekStartDate,
            statement.weekEndDate,
            statement.propertyId
        );
        
        const allReservations = apiResponse.result || [];

        // Filter for ALL cancelled reservations (including those already in statement)
        const cancelledReservations = allReservations.filter(res => {
            // Only cancelled reservations
            const isCancelled = res.status === 'cancelled';
            if (!isCancelled) {
                return false;
            }

            // Check if already in statement (for informational purposes)
            const alreadyIncluded = statement.reservations?.some(existing => existing.hostawayId === res.hostawayId) || false;
            res.alreadyInStatement = alreadyIncluded;

            return true;
        });

        res.json({ 
            cancelledReservations,
            count: cancelledReservations.length,
            statementPeriod: {
                start: statement.weekStartDate,
                end: statement.weekEndDate,
                propertyId: statement.propertyId
            }
        });
    } catch (error) {
        console.error('Get cancelled reservations error:', error);
        res.status(500).json({ error: 'Failed to get cancelled reservations' });
    }
});

// GET /api/statements-file/:id/available-reservations - Get all available reservations for a statement period
router.get('/:id/available-reservations', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);
        
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Get all reservations for this property and period
        const reservations = await FileDataService.getReservations(
            statement.weekStartDate,
            statement.weekEndDate,
            statement.propertyId,
            statement.calculationType || 'checkout'
        );

        // Separate into included and available
        const includedReservationIds = new Set(
            (statement.reservations || []).map(r => r.hostifyId || r.id)
        );
        
        const availableReservations = reservations.filter(res => {
            const resId = res.hostifyId || res.id;
            return !includedReservationIds.has(resId);
        });

        res.json({ 
            availableReservations,
            count: availableReservations.length,
            statementPeriod: {
                start: statement.weekStartDate,
                end: statement.weekEndDate,
                propertyId: statement.propertyId,
                calculationType: statement.calculationType || 'checkout'
            }
        });
    } catch (error) {
        console.error('Get available reservations error:', error);
        res.status(500).json({ error: 'Failed to get available reservations' });
    }
});

// PUT /api/statements-file/:id - Edit statement (remove expenses, add cancelled reservations, etc.)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { expenseIdsToRemove, cancelledReservationIdsToAdd, reservationIdsToAdd, reservationIdsToRemove, customReservationToAdd } = req.body;

        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        let modified = false;

        // Remove expenses and upsells by global index
        if (expenseIdsToRemove && Array.isArray(expenseIdsToRemove) && expenseIdsToRemove.length > 0) {
            const originalItemsCount = statement.items.length;
            
            // The frontend now sends global indices directly
            const globalIndicesToRemove = new Set(expenseIdsToRemove);
            
            // Filter out items at those global indices
            statement.items = statement.items.filter((item, globalIndex) => {
                return !globalIndicesToRemove.has(globalIndex);
            });

            if (statement.items.length < originalItemsCount) {
                modified = true;
            }
        }

        // Remove reservations
        if (reservationIdsToRemove && Array.isArray(reservationIdsToRemove) && reservationIdsToRemove.length > 0) {
            const originalReservationsCount = (statement.reservations || []).length;

            // First, find the reservations that will be removed (BEFORE filtering them out)
            const removedReservations = (statement.reservations || []).filter(res => {
                const resId = res.hostifyId || res.id;
                return reservationIdsToRemove.includes(resId);
            });

            // Remove reservations from the reservations array
            statement.reservations = (statement.reservations || []).filter(res => {
                const resId = res.hostifyId || res.id;
                return !reservationIdsToRemove.includes(resId);
            });

            // Also remove corresponding revenue items using the stored removed reservations
            statement.items = statement.items.filter(item => {
                if (item.type !== 'revenue') return true;

                // Check if this revenue item corresponds to a removed reservation
                // Match by guest name in the description
                for (const removedRes of removedReservations) {
                    if (removedRes && item.description && item.description.includes(removedRes.guestName)) {
                        return false;
                    }
                }
                return true;
            });

            if (statement.reservations.length < originalReservationsCount) {
                modified = true;
            }
        }

        // Add regular reservations
        if (reservationIdsToAdd && Array.isArray(reservationIdsToAdd) && reservationIdsToAdd.length > 0) {
            // Get all reservations for this statement's period to find the ones to add
            const allReservations = await FileDataService.getReservations(
                statement.weekStartDate,
                statement.weekEndDate,
                statement.propertyId,
                statement.calculationType || 'checkout'
            );
            
            const reservationsToAdd = allReservations.filter(res => {
                const resId = res.hostifyId || res.id;
                return reservationIdsToAdd.includes(resId);
            });

            if (reservationsToAdd.length > 0) {
                // Initialize reservations array if it doesn't exist
                if (!statement.reservations) {
                    statement.reservations = [];
                }

                // Get existing reservation IDs to prevent duplicates
                const existingResIds = new Set(
                    statement.reservations.map(r => r.hostifyId || r.id)
                );

                // Filter out reservations that are already in the statement
                const newReservationsToAdd = reservationsToAdd.filter(res => {
                    const resId = res.hostifyId || res.id;
                    return !existingResIds.has(resId);
                });

                if (newReservationsToAdd.length > 0) {
                    // Add the reservations to the statement
                    statement.reservations.push(...newReservationsToAdd);

                    // Add revenue items for these reservations
                    for (const reservation of newReservationsToAdd) {
                        const revenueItem = {
                            type: 'revenue',
                            description: `${reservation.guestName} - ${reservation.checkInDate} to ${reservation.checkOutDate}`,
                            amount: reservation.grossAmount || reservation.clientRevenue || 0,
                            date: reservation.checkOutDate,
                            category: 'booking'
                        };
                        statement.items.push(revenueItem);
                    }

                    modified = true;
                }
            }
        }

        // Add custom reservation
        if (customReservationToAdd && typeof customReservationToAdd === 'object') {
            // Validate required fields
            const requiredFields = ['guestName', 'checkInDate', 'checkOutDate', 'amount'];
            const missingFields = requiredFields.filter(field => !customReservationToAdd[field]);
            
            if (missingFields.length > 0) {
                return res.status(400).json({ 
                    error: `Missing required fields for custom reservation: ${missingFields.join(', ')}` 
                });
            }

            // Check for duplicate custom reservation (same guest, dates, and amount)
            const isDuplicate = (statement.reservations || []).some(res => 
                res.guestName === customReservationToAdd.guestName &&
                res.checkInDate === customReservationToAdd.checkInDate &&
                res.checkOutDate === customReservationToAdd.checkOutDate &&
                res.grossAmount === parseFloat(customReservationToAdd.amount)
            );

            if (isDuplicate) {
                return res.status(400).json({ 
                    error: `Duplicate reservation: ${customReservationToAdd.guestName} (${customReservationToAdd.checkInDate} - ${customReservationToAdd.checkOutDate}) already exists in this statement` 
                });
            }

            // Initialize reservations array if needed
            if (!statement.reservations) {
                statement.reservations = [];
            }

            // Create custom reservation object
            const nights = parseInt(customReservationToAdd.nights) || 
                Math.ceil((new Date(customReservationToAdd.checkOutDate) - new Date(customReservationToAdd.checkInDate)) / (1000 * 60 * 60 * 24));
            
            const customReservation = {
                id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                guestName: customReservationToAdd.guestName,
                guestEmail: '',
                checkInDate: customReservationToAdd.checkInDate,
                checkOutDate: customReservationToAdd.checkOutDate,
                nights: nights,
                grossAmount: parseFloat(customReservationToAdd.amount),
                clientRevenue: parseFloat(customReservationToAdd.amount),
                baseRate: parseFloat(customReservationToAdd.amount),
                cleaningAndOtherFees: 0,
                platformFees: 0,
                luxuryLodgingFee: 0,
                clientTaxResponsibility: 0,
                clientPayout: parseFloat(customReservationToAdd.amount),
                hostPayoutAmount: parseFloat(customReservationToAdd.amount),
                status: 'confirmed',
                source: 'custom',
                description: customReservationToAdd.description || null,
                isCustom: true,
                isProrated: false,
                weeklyPayoutDate: null,
                hasDetailedFinance: false
            };

            statement.reservations.push(customReservation);

            // Add revenue item for this custom reservation
            const revenueItem = {
                type: 'revenue',
                description: `${customReservation.guestName}${customReservation.description ? ` - ${customReservation.description}` : ''} (${customReservation.checkInDate} to ${customReservation.checkOutDate})`,
                amount: customReservation.grossAmount,
                date: customReservation.checkOutDate,
                category: 'custom-booking'
            };
            statement.items.push(revenueItem);

            modified = true;
        }

        // Add cancelled reservations (legacy support)
        if (cancelledReservationIdsToAdd && Array.isArray(cancelledReservationIdsToAdd) && cancelledReservationIdsToAdd.length > 0) {
            // Get all reservations for this statement's period
            const allReservations = await FileDataService.getReservations(
                statement.weekStartDate,
                statement.weekEndDate,
                statement.propertyId,
                statement.calculationType || 'checkout'
            );
            
            const reservationsToAdd = allReservations.filter(res => {
                const resId = res.hostifyId || res.id;
                return cancelledReservationIdsToAdd.includes(resId) && res.status === 'cancelled';
            });

            if (reservationsToAdd.length > 0) {
                // Initialize reservations array if it doesn't exist
                if (!statement.reservations) {
                    statement.reservations = [];
                }

                // Add the reservations to the statement
                statement.reservations.push(...reservationsToAdd);

                // Add revenue items for these cancelled reservations (typically 0 or negative)
                for (const reservation of reservationsToAdd) {
                    // For cancelled reservations, we might add a cancellation fee or refund adjustment
                    const cancelItem = {
                        type: 'revenue',
                        description: `${reservation.guestName} - CANCELLED (${reservation.checkInDate} to ${reservation.checkOutDate})`,
                        amount: 0, // Cancelled reservations typically don't contribute revenue
                        date: reservation.checkOutDate,
                        category: 'cancellation'
                    };
                    statement.items.push(cancelItem);
                }

                modified = true;
            }
        }

        if (modified) {
            // Recalculate totals after modifications
            const expenses = statement.items.filter(item => item.type === 'expense');

            // Calculate totalRevenue from reservations array (which has correct prorated values)
            // Use clientRevenue for detailed finance, otherwise fall back to grossAmount
            statement.totalRevenue = (statement.reservations || []).reduce((sum, res) => {
                const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
                return sum + revenue;
            }, 0);

            statement.totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);

            // Recalculate PM Commission based on total revenue and percentage
            // PM Commission is calculated from revenue, not from expense items
            const pmPercentage = parseFloat(statement.pmPercentage || 10);
            statement.pmCommission = Math.round((statement.totalRevenue * (pmPercentage / 100)) * 100) / 100;

            // Recalculate other fee types from expense items
            statement.techFees = expenses.filter(e => e.description && e.description.includes('Technology')).reduce((sum, item) => sum + item.amount, 0);
            statement.insuranceFees = expenses.filter(e => e.description && e.description.includes('Insurance')).reduce((sum, item) => sum + item.amount, 0);

            // Calculate total upsells from items
            const totalUpsells = statement.items?.filter(item => item.type === 'upsell').reduce((sum, item) => sum + item.amount, 0) || 0;

            // Recalculate owner payout (GROSS PAYOUT + ADDITIONAL PAYOUTS - EXPENSES)
            // Note: techFees and insuranceFees are stored but not included in payout calculation
            const adjustments = parseFloat(statement.adjustments || 0);
            statement.ownerPayout = Math.round((statement.totalRevenue - statement.pmCommission + totalUpsells - statement.totalExpenses - adjustments) * 100) / 100;

            // Update the statement status (only if not already sent)
            if (statement.status !== 'sent') {
            statement.status = 'modified';
            }
            
            // Save updated statement (Sequelize will automatically update the timestamp)
            const updatedStatement = await FileDataService.saveStatement(statement);
            
            // Use the updated statement data from database
            statement.updatedAt = updatedStatement.updatedAt || updatedStatement.updated_at;

            res.json({ 
                message: 'Statement updated successfully',
                statement: {
                    id: statement.id,
                    totalRevenue: statement.totalRevenue,
                    totalExpenses: statement.totalExpenses,
                    pmCommission: statement.pmCommission,
                    techFees: statement.techFees,
                    insuranceFees: statement.insuranceFees,
                    ownerPayout: statement.ownerPayout,
                    status: statement.status,
                    itemsCount: statement.items.length,
                    reservationsCount: statement.reservations?.length || 0,
                    updatedAt: statement.updatedAt
                }
            });
        } else {
            res.json({ message: 'No changes made to statement' });
        }
    } catch (error) {
        console.error('Statement edit error:', error);
        res.status(500).json({ error: 'Failed to edit statement' });
    }
});

// DELETE /api/statements-file/:id - Delete statement
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if statement exists
        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Delete the statement
        await FileDataService.deleteStatement(id);

        res.json({ 
            message: 'Statement deleted successfully',
            id: parseInt(id)
        });
    } catch (error) {
        console.error('Statement delete error:', error);
        res.status(500).json({ error: 'Failed to delete statement' });
    }
});
// GET /api/statements-file/:id/view - get
router.get('/:id/view/data', async (req, res) => {
      try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);
        console.log("statement-",statement);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }
        res.json({
            data: statement
        });
    } catch (error) {
        console.error('Statement delete error:', error);
        res.status(500).json({ error: 'Failed to delete statement' });
    }
});

// GET /api/statements-file/:id/view - View statement in browser
router.get('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        const isPdf = req.query.pdf === 'true'; // Hide download button for PDF generation
        const bodyClass = isPdf ? 'pdf-mode' : '';
        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        // Fetch CURRENT listing settings to override stored values
        // This allows changes to listing settings (like disregardTax) to affect existing statements

        // For combined statements, we need per-property settings for each reservation
        // Create a map: propertyId -> { isCohostOnAirbnb, disregardTax, airbnbPassThroughTax, pmFeePercentage }
        let listingSettingsMap = {};

        if (statement.propertyIds && Array.isArray(statement.propertyIds) && statement.propertyIds.length > 0) {
            // COMBINED STATEMENT: Fetch settings for ALL properties
            const dbListings = await ListingService.getListingsWithPmFees(statement.propertyIds);
            dbListings.forEach(listing => {
                listingSettingsMap[listing.id] = {
                    isCohostOnAirbnb: Boolean(listing.isCohostOnAirbnb),
                    disregardTax: Boolean(listing.disregardTax),
                    airbnbPassThroughTax: Boolean(listing.airbnbPassThroughTax),
                    pmFeePercentage: listing.pmFeePercentage ?? 15
                };
            });
            console.log('Combined statement - loaded settings for properties:', Object.keys(listingSettingsMap));
        } else if (statement.propertyId) {
            // SINGLE PROPERTY STATEMENT: Fetch settings for just that property
            const currentListing = await ListingService.getListingWithPmFee(parseInt(statement.propertyId));
            if (currentListing) {
                // Use explicit boolean conversion to handle SQLite's 0/1 values
                statement.disregardTax = Boolean(currentListing.disregardTax);
                statement.isCohostOnAirbnb = Boolean(currentListing.isCohostOnAirbnb);
                statement.airbnbPassThroughTax = Boolean(currentListing.airbnbPassThroughTax);
                statement.pmPercentage = currentListing.pmFeePercentage ?? statement.pmPercentage ?? 15;

                // Also add to map for consistency
                listingSettingsMap[statement.propertyId] = {
                    isCohostOnAirbnb: Boolean(currentListing.isCohostOnAirbnb),
                    disregardTax: Boolean(currentListing.disregardTax),
                    airbnbPassThroughTax: Boolean(currentListing.airbnbPassThroughTax),
                    pmFeePercentage: currentListing.pmFeePercentage ?? 15
                };
            }
        }

        // Ensure boolean values are properly set (fallback to false if undefined)
        // These are used as defaults when per-property settings are not available
        statement.disregardTax = Boolean(statement.disregardTax);
        statement.isCohostOnAirbnb = Boolean(statement.isCohostOnAirbnb);
        statement.airbnbPassThroughTax = Boolean(statement.airbnbPassThroughTax);
        statement.pmPercentage = statement.pmPercentage ?? 15;

        // Attach the settings map to the statement for use in HTML generation
        statement._listingSettingsMap = listingSettingsMap;

        // Generate HTML view of the statement
        const statementHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Owner Statement ${id} - Luxury Lodging Host</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --luxury-navy: #1e3a5f;
            --luxury-gold: #d4af37;
            --luxury-light-gold: #f4e7c1;
            --luxury-cream: #faf8f3;
            --luxury-gray: #6b7280;
            --luxury-light-gray: #f8fafc;
            --luxury-green: #059669;
            --luxury-red: #dc2626;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
            max-width: 100%; 
            margin: 0; 
            padding: 0; 
            line-height: 1.4;
            color: var(--luxury-navy);
            background: white;
        }
        
        .document {
            background: white;
            overflow: hidden;
        }
        
        .header {
            background: white;
            padding: 15px 20px;
            border-bottom: 2px solid var(--luxury-navy);
        }
        
        .company-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        
        .company-info h1 {
            font-size: 20px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 4px;
            letter-spacing: 0.5px;
        }
        
        .contact-info {
            font-size: 10px;
            color: var(--luxury-gray);
            font-weight: 500;
        }
        
        .logo-placeholder {
            width: 80px;
            height: 80px;
        }
        
        .logo-box {
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--luxury-gold);
            font-weight: 700;
            font-size: 12px;
        }
        
        .statement-details {
            margin-bottom: 20px;
        }
        
        .detail-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 15px;
            margin-bottom: 10px;
            padding: 10px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .detail-group {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        
        .detail-label {
            font-size: 9px;
            font-weight: 700;
            color: var(--luxury-gray);
            text-transform: uppercase;
            margin-bottom: 2px;
            letter-spacing: 0.3px;
        }
        
        .detail-value {
            font-size: 11px;
            font-weight: 600;
            color: var(--luxury-navy);
        }
        
        .owner-info {
            text-align: right;
            padding: 20px 0;
            border-top: 1px solid #e5e7eb;
        }
        
        .owner-name {
            font-size: 20px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 6px;
        }
        
        .owner-email {
            font-size: 13px;
            color: var(--luxury-gray);
            font-weight: 500;
        }
        
        .brand-title {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 2px;
            margin-bottom: 8px;
            text-transform: uppercase;
            color: var(--luxury-gold);
        }
        
        .statement-title {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 30px;
            letter-spacing: 1px;
        }
        
        .statement-meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            max-width: 600px;
            margin: 0 auto;
        }
        
        .meta-item {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
            border-left: 3px solid var(--luxury-gold);
        }
        
        .meta-label {
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--luxury-light-gold);
            margin-bottom: 5px;
        }
        
        .meta-value {
            font-size: 16px;
            font-weight: 600;
        }
        
        .content {
            padding: 20px;
        }
        
        .section {
            margin-bottom: 20px;
        }
        
        .section-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 12px;
            padding: 8px 0;
            border-bottom: 2px solid var(--luxury-gold);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            position: relative;
        }
        
        .section-title::before {
            content: '';
            width: 6px;
            height: 100%;
            background: var(--luxury-gold);
            position: absolute;
            left: -20px;
            top: 0;
            border-radius: 3px;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .summary-item {
            background: var(--luxury-light-gray);
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #e5e7eb;
            transition: all 0.2s ease;
        }
        
        .summary-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(30, 58, 95, 0.1);
        }
        
        .summary-label {
            font-size: 14px;
            font-weight: 500;
            color: var(--luxury-gray);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .summary-amount {
            font-size: 24px;
            font-weight: 700;
            color: var(--luxury-navy);
        }
        
        .payout-highlight {
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            color: white;
            text-align: center;
            padding: 25px;
            border-radius: 12px;
            border: 3px solid var(--luxury-gold);
            margin: 30px 0;
        }
        
        .payout-label {
            font-size: 16px;
            font-weight: 500;
            color: var(--luxury-light-gold);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .payout-amount {
            font-size: 36px;
            font-weight: 700;
            color: var(--luxury-gold);
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .items-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 16px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .items-table td {
            padding: 14px 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 14px;
        }
        
        .items-table tr:nth-child(even) {
            background: #f8fafc;
        }
        
        .items-table tr:hover {
            background: var(--luxury-light-gold);
        }
        
        .revenue {
            color: var(--luxury-navy);
            font-weight: 600;
        }
        
        .expense {
            color: var(--luxury-red);
            font-weight: 600;
        }
        
        .type-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .type-revenue {
            background: #d1fae5;
            color: var(--luxury-green);
        }
        
        .type-expense {
            background: #fee2e2;
            color: var(--luxury-red);
        }
        
        .footer {
            background: var(--luxury-light-gray);
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer-content {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .generated-info {
            color: var(--luxury-gray);
            font-size: 14px;
            margin-bottom: 20px;
        }
        
        .print-button {
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .print-button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(30, 58, 95, 0.3);
        }
        
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-draft { background: #fef3c7; color: #92400e; }
        .status-generated { background: #dbeafe; color: #1e40af; }
        .status-sent { background: #d1fae5; color: #059669; }
        .status-paid { background: #e0e7ff; color: #5b21b6; }
        
        @media print {
            @page {
                size: A4 portrait;
                margin: 10mm;
            }

            body {
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .document {
                box-shadow: none;
                max-width: 100%;
                margin: 0;
                padding: 0;
            }
            .print-button { display: none; }
            .footer { display: none; }

            /* PDF-specific table styles */
            .rental-table, .expenses-table, .items-table {
                font-size: 9px !important;
                width: 100% !important;
            }

            .rental-table th, .expenses-table th, .items-table th {
                padding: 6px 3px !important;
                font-size: 8px !important;
                background-color: #1e3a5f !important;
                color: white !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            .rental-table td, .expenses-table td, .items-table td {
                padding: 5px 3px !important;
                font-size: 9px !important;
            }

            .totals-row {
                background-color: #1e3a5f !important;
                color: white !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            .totals-row td {
                color: white !important;
            }

            /* Ensure page breaks work properly */
            .section {
                page-break-inside: avoid;
            }

            tr {
                page-break-inside: avoid;
            }

            .header {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
        
        @media (max-width: 768px) {
            body { padding: 20px 10px; }
            .content { padding: 20px 15px; }
            .summary-grid { grid-template-columns: 1fr; }
            .statement-meta { grid-template-columns: 1fr; }
        }
        
        .statement-summary {
            display: flex;
            justify-content: flex-end;
            margin-top: 30px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto;
        }
        
        .summary-box {
            background: white;
            padding: 25px;
            border: none;
            border-radius: 12px;
            width: 450px;
            box-shadow: 0 0 0 2px var(--luxury-navy), 0 4px 12px rgba(0, 0, 0, 0.1);
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            orphans: 5;
            widows: 5;
        }

        .summary-table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }

        .summary-table td {
            padding: 12px 0;
            border-bottom: 1px solid #eee;
            font-size: 14px;
        }

        .summary-table tr:last-child td {
            border-bottom: none;
        }

        .summary-label {
            font-weight: 500;
            color: var(--luxury-navy);
        }

        .summary-value {
            text-align: right;
            font-weight: 600;
            font-size: 15px;
        }

        .summary-value.revenue {
            color: #28a745;
        }

        .summary-value.expense {
            color: #dc3545;
        }

        .total-row {
            page-break-before: avoid !important;
            break-before: avoid !important;
        }

        .total-row td {
            padding-top: 20px;
            margin-top: 10px;
            border-top: none;
            border-bottom: none !important;
            font-size: 16px;
            position: relative;
        }

        .total-row td::before {
            content: '';
            position: absolute;
            top: 5px;
            left: 0;
            right: 0;
            height: 2px;
            background-color: var(--luxury-navy);
        }

        .total-amount {
            color: var(--luxury-navy);
            font-size: 18px;
        }

        .expenses-container {
            overflow-x: auto;
            margin-bottom: 30px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: white;
        }
        
        .expenses-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            background: white;
            font-size: 11px;
        }

        .expenses-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 12px 8px;
            text-align: center;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .expenses-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #f0f0f0;
            vertical-align: middle;
            text-align: center;
        }

        .expenses-table tr:hover {
            background: #f8f9fa;
        }

        .expenses-table .date-cell {
            width: 12%;
            font-weight: 500;
        }

        .expenses-table .description-cell {
            width: 30%;
            text-align: left;
        }

        .expenses-table .vendor-cell {
            width: 16%;
            color: var(--luxury-gray);
        }

        .expenses-table .listing-cell {
            width: 16%;
            color: var(--luxury-gray);
            font-size: 10px;
        }

        .expenses-table .category-cell {
            width: 12%;
            text-transform: capitalize;
            color: var(--luxury-gray);
        }

        .expenses-table .amount-cell {
            width: 14%;
            text-align: right;
            font-weight: 600;
        }

        .expenses-table .totals-row {
            background: var(--luxury-navy);
            color: white;
        }

        .expenses-table .totals-row td {
            border-bottom: none;
            padding: 12px 8px;
            font-weight: 600;
        }
        
        .rental-table-container {
            overflow-x: auto;
            margin-bottom: 30px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: white;
        }
        
        .rental-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            background: white;
            font-size: 9px;
        }
        
        .rental-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 10px 4px;
            text-align: center;
            font-weight: 600;
            font-size: 8px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            border-right: 1px solid rgba(255,255,255,0.2);
            white-space: normal;
            word-wrap: break-word;
            line-height: 1.4;
            vertical-align: middle;
        }
        
        .rental-table th:nth-child(1) { width: 20%; }   /* Guest Details with dates */
        .rental-table th:nth-child(2) { width: 10%; }   /* Base Rate */
        .rental-table th:nth-child(3) { width: 12%; }   /* Cleaning */
        .rental-table th:nth-child(4) { width: 10%; }   /* Platform Fees */
        .rental-table th:nth-child(5) { width: 10%; }   /* Revenue */
        .rental-table th:nth-child(6) { width: 12%; }   /* PM Commission */
        .rental-table th:nth-child(7) { width: 10%; }   /* Tax */
        .rental-table th:nth-child(8) { width: 11%; }   /* Gross Payout */
        
        .rental-table td {
            padding: 10px 6px;
            border-bottom: 1px solid #e5e7eb;
            border-right: 1px solid #f0f0f0;
            font-size: 9px;
            text-align: center;
            vertical-align: middle;
            line-height: 1.5;
        }

        .booking-cell {
            text-align: center !important;
            padding: 12px 8px !important;
        }

        .guest-details-cell {
            text-align: left !important;
            padding: 12px 8px !important;
            vertical-align: middle;
        }

        .guest-name {
            font-weight: 700;
            color: var(--luxury-navy);
            font-size: 10px;
            margin-bottom: 4px;
            text-align: left;
        }

        .guest-info {
            font-size: 9px;
            color: var(--luxury-gray);
            line-height: 1.5;
            margin-bottom: 4px;
            text-align: left;
        }

        .booking-details {
            font-size: 8px;
            color: var(--luxury-gray);
            line-height: 1.4;
        }
        
        .listing-info {
            font-weight: 600;
            margin-bottom: 2px;
            color: #444;
        }
        
        .stay-info {
            margin-bottom: 2px;
            color: #666;
        }
        
        .date-cell {
            font-size: 9px;
            white-space: nowrap;
        }
        
        .text-center {
            text-align: center;
        }
        
        .channel-badge {
            display: inline-block;
            background: var(--luxury-light-gold);
            color: var(--luxury-navy);
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: 600;
            text-transform: uppercase;
            margin-top: 4px;
        }

        .proration-info {
            font-size: 8px !important;
            color: #007bff !important;
            margin-top: 4px !important;
        }
        
        .amount-cell {
            text-align: right;
            font-weight: 600;
            font-size: 9px;
            padding-right: 4px !important;
        }
        
        .payout-cell {
            font-weight: 700;
            background: #f0f9ff !important;
        }
        
        .expense-amount {
            color: var(--luxury-red);
        }

        .revenue-amount {
            color: var(--luxury-green);
        }

        .info-amount {
            color: #2563eb;
        }
        
        .rental-table tr:nth-child(even) {
            background: #f8fafc;
        }
        
        .rental-table .totals-row {
            background: var(--luxury-navy);
            color: white;
            font-weight: 700;
        }

        .rental-table .totals-row td {
            padding: 12px 6px;
            border-bottom: none;
            font-size: 10px;
        }
        
        /* Page setup for PDF - Portrait mode */
        @page {
            size: A4 portrait;
            margin: 1cm;
        }

        /* Print styles */
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }

            body {
                padding: 0;
                font-size: 9px;
                background: white !important;
                color: #333 !important;
            }

            .document {
                background: white !important;
                box-shadow: none !important;
            }

            .header {
                padding: 15px 20px;
                background: white !important;
                color: #1e3a5f !important;
                border-bottom: 2px solid #1e3a5f;
            }

            .header .company-name {
                color: #1e3a5f !important;
            }

            .header .company-contact {
                color: #666 !important;
            }

            .content {
                padding: 20px;
                background: white !important;
            }

            .statement-meta {
                background: #f8f9fa !important;
                border: 1px solid #e9ecef;
            }

            .rental-table {
                font-size: 8px;
                page-break-inside: avoid;
                table-layout: fixed;
                width: 100%;
            }

            .rental-table th {
                font-size: 7px;
                padding: 4px 2px;
                background: #1e3a5f !important;
                color: white !important;
            }

            .rental-table td {
                font-size: 8px;
                padding: 8px 4px;
                border-bottom: 1px solid #e9ecef;
                word-wrap: break-word;
                overflow: hidden;
                vertical-align: middle;
            }

            .rental-table .totals-row td {
                background: #1e3a5f !important;
                color: white !important;
            }

            .guest-details-cell {
                padding: 10px 6px !important;
                text-align: left !important;
                vertical-align: middle;
            }

            .guest-name {
                font-size: 9px;
                color: #333 !important;
                margin-bottom: 3px;
                text-align: left;
            }

            .guest-info, .booking-details {
                font-size: 8px;
                color: #666 !important;
                margin-bottom: 3px;
                text-align: left;
            }

            .amount-cell {
                font-size: 8px;
            }

            .channel-badge {
                font-size: 6px;
                padding: 2px 4px;
                background: #e5e7eb !important;
                color: #333 !important;
            }

            .section-title {
                font-size: 14px;
                color: #1e3a5f !important;
            }

            .expense-amount {
                color: #dc2626 !important;
            }

            .revenue-amount {
                color: #059669 !important;
            }

            .info-amount {
                color: #2563eb !important;
            }

            .print-button {
                display: none !important;
            }
        }
        
        .rental-table .guest-info {
            text-align: left;
            max-width: 120px;
        }
        
        .rental-table .listing-info {
            text-align: left;
            max-width: 100px;
        }
        
        .rental-table .amount {
            text-align: right;
            font-weight: 600;
            min-width: 80px;
        }
        
        .rental-table .text-center {
            text-align: center;
        }
        
        .rental-table .totals-row td {
            background: var(--luxury-navy);
            color: white;
            font-weight: 700;
            border-right: 1px solid rgba(255,255,255,0.2);
        }
        
        .rental-table .payout-cell {
            background: var(--luxury-light-gold);
            font-weight: 700;
            color: var(--luxury-navy);
        }
        
        .rental-table .totals-row .payout-cell {
            background: var(--luxury-navy) !important;
            color: white !important;
        }
        /* PDF-specific styles - apply print styles when body has pdf-mode class */
        body.pdf-mode {
            padding: 0;
            font-size: 9px;
            background: white !important;
            color: #333 !important;
        }

        body.pdf-mode .document {
            background: white !important;
            box-shadow: none !important;
        }

        body.pdf-mode .header {
            padding: 15px 20px;
            background: white !important;
            color: #1e3a5f !important;
            border-bottom: 2px solid #1e3a5f;
        }

        body.pdf-mode .content {
            padding: 20px;
            background: white !important;
        }

        body.pdf-mode .rental-table {
            font-size: 8px;
            page-break-inside: avoid;
            table-layout: fixed;
            width: 100%;
        }

        body.pdf-mode .rental-table th {
            font-size: 7px;
            padding: 6px 4px;
            background: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .rental-table td {
            font-size: 8px;
            padding: 8px 4px;
            border-bottom: 1px solid #e9ecef;
            vertical-align: middle;
        }

        body.pdf-mode .rental-table .totals-row td {
            background: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .guest-details-cell {
            padding: 10px 6px !important;
            text-align: left !important;
            vertical-align: middle;
        }

        body.pdf-mode .guest-name {
            font-size: 9px;
            color: #333 !important;
            margin-bottom: 3px;
            text-align: left;
        }

        body.pdf-mode .guest-info,
        body.pdf-mode .booking-details {
            font-size: 8px;
            color: #666 !important;
            margin-bottom: 3px;
            text-align: left;
        }

        body.pdf-mode .amount-cell {
            font-size: 8px;
        }

        body.pdf-mode .channel-badge {
            font-size: 6px;
            padding: 2px 4px;
            background: #e5e7eb !important;
            color: #333 !important;
        }

        body.pdf-mode .section-title {
            font-size: 14px;
            color: #1e3a5f !important;
        }

        body.pdf-mode .expense-amount {
            color: #dc2626 !important;
        }

        body.pdf-mode .revenue-amount {
            color: #059669 !important;
        }

        body.pdf-mode .info-amount {
            color: #2563eb !important;
        }

        body.pdf-mode .print-button {
            display: none !important;
        }

        body.pdf-mode .footer {
            display: none !important;
        }

        body.pdf-mode .expenses-table {
            font-size: 10px !important;
            width: 100% !important;
        }

        body.pdf-mode .expenses-table th {
            padding: 10px 6px !important;
            font-size: 9px !important;
            background-color: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .expenses-table td {
            padding: 10px 6px !important;
            font-size: 10px !important;
            vertical-align: middle;
        }

        body.pdf-mode .totals-row {
            background-color: #1e3a5f !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body.pdf-mode .totals-row td {
            color: white !important;
        }

        body.pdf-mode .section {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        body.pdf-mode tr {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        body.pdf-mode .summary-box {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto;
        }

        body.pdf-mode .summary-table {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }

        body.pdf-mode .statement-summary {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto;
            background: white !important;
        }

        body.pdf-mode .section {
            background: white !important;
        }

        body.pdf-mode .total-row {
            page-break-before: avoid !important;
            break-before: avoid !important;
        }
    </style>
</head>
<body class="${bodyClass}">
    <div class="document">
    <div class="header">
            <div class="company-header">
                <div class="company-info">
                    <h1>Luxury Lodging</h1>
                    <div class="contact-info">
                        <span>support@luxurylodgingpm.com | +1 (813) 594-8882</span>
    </div>
            </div>
    </div>

            <div class="statement-details">
                <div class="detail-row">
                    <div class="detail-group">
                        <span class="detail-label">Statement period:</span>
                        <span class="detail-value">${statement.weekStartDate} - ${statement.weekEndDate}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Calculation:</span>
                        <span class="detail-value" style="color: ${statement.calculationType === 'calendar' ? '#007bff' : '#666'};">
                            ${statement.calculationType === 'calendar' ? 'Calendar-based (prorated)' : 'Check-out based'}
                        </span>
            </div>
                    <div class="detail-group">
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
                    <div class="detail-group">
                        <span class="detail-label">Property:</span>
                        <span class="detail-value">${statement.propertyName}</span>
            </div>
            </div>
                
                ${statement.ownerId !== 1 && statement.ownerName !== 'Default' && statement.ownerName !== 'Default Owner' ? `
                <div class="owner-info">
                    <div class="owner-name">${statement.ownerName}</div>
                    <div class="owner-email">owner@example.com | (555) 000-0000</div>
            </div>
                ` : ''}
            </div>
        </div>

        <div class="content">
    <div class="section">
                <h2 class="section-title">RENTAL ACTIVITY</h2>
                <div class="rental-table-container">
                    <table class="rental-table">
            <thead>
                <tr>
                                <th>Guest Details</th>
                                <th>Base Rate</th>
                                <th>Guest Paid Cleaning, Pet Extra & Others</th>
                                <th>Platform Fees</th>
                                <th>Revenue</th>
                                <th>PM Commission</th>
                                <th>Tax</th>
                                <th>Gross Payout</th>
                </tr>
            </thead>
            <tbody>
                            ${statement.reservations?.map(reservation => {
                                // Get per-property settings from the map, fall back to statement-level settings
                                const propSettings = statement._listingSettingsMap?.[reservation.propertyId] || {
                                    isCohostOnAirbnb: statement.isCohostOnAirbnb,
                                    disregardTax: statement.disregardTax,
                                    airbnbPassThroughTax: statement.airbnbPassThroughTax,
                                    pmFeePercentage: statement.pmPercentage
                                };

                                // Check if this is an Airbnb reservation on a co-hosted property
                                const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
                                const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;

                                // Use detailed financial data if available, otherwise fall back to calculated values
                                const baseRate = reservation.hasDetailedFinance ? reservation.baseRate : (reservation.grossAmount * 0.85);
                                const cleaningFees = reservation.hasDetailedFinance ? reservation.cleaningAndOtherFees : (reservation.grossAmount * 0.15);
                                const platformFees = reservation.hasDetailedFinance ? reservation.platformFees : (reservation.grossAmount * 0.03);
                                const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                                // PM Commission is calculated based on clientRevenue (which accounts for proration)
                                // This ensures prorated reservations have prorated PM commission
                                // Use per-property PM fee percentage
                                const luxuryFee = clientRevenue * (propSettings.pmFeePercentage / 100);
                                const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

                                // Tax calculation priority (uses per-property settings):
                                // 1. If disregardTax is true: NEVER add tax (company remits on behalf of owner)
                                // 2. For co-hosted Airbnb: Gross Payout is negative PM commission only
                                // 3. For Airbnb without pass-through: no tax added (Airbnb remits taxes)
                                // 4. For non-Airbnb OR Airbnb with pass-through: include tax responsibility
                                let grossPayout;
                                const shouldAddTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);

                                if (isCohostAirbnb) {
                                    grossPayout = -luxuryFee;
                                } else if (shouldAddTax) {
                                    // Add tax: Non-Airbnb OR Airbnb with pass-through (and not disregardTax)
                                    grossPayout = clientRevenue - luxuryFee + taxResponsibility;
                                } else {
                                    // No tax: Airbnb without pass-through OR disregardTax is enabled
                                    grossPayout = clientRevenue - luxuryFee;
                                }

                                return `
                                <tr>
                                    <td class="guest-details-cell">
                                        <div class="guest-name">${reservation.guestName}</div>
                                        <div class="guest-info">${(() => {
                                            const [yearIn, monthIn, dayIn] = reservation.checkInDate.split('-').map(Number);
                                            const [yearOut, monthOut, dayOut] = reservation.checkOutDate.split('-').map(Number);
                                            const checkIn = new Date(yearIn, monthIn - 1, dayIn).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                            const checkOut = new Date(yearOut, monthOut - 1, dayOut).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                            return `${checkIn} - ${checkOut} (${reservation.nights || 0}n)`;
                                        })()}</div>
                                        <div class="channel-badge">${reservation.source}</div>
                                        ${reservation.prorationNote ?
                                            `<div class="proration-info" style="font-size: 10px; color: #007bff; margin-top: 2px;">
                                                ${reservation.prorationNote}
                                            </div>` : ''
                                        }
                                    </td>
                                    <td class="amount-cell revenue-amount">$${baseRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell revenue-amount">$${cleaningFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell expense-amount">-$${platformFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell revenue-amount">$${clientRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell expense-amount">-$${luxuryFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell ${shouldAddTax ? 'revenue-amount' : 'info-amount'}">$${taxResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell payout-cell ${grossPayout < 0 ? 'expense-amount' : 'revenue-amount'}">${grossPayout >= 0 ? '$' : '-$'}${Math.abs(grossPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="8" style="text-align: center; color: var(--luxury-gray); font-style: italic;">No rental activity found</td></tr>'}
                            ${(() => {
                                // Calculate totals using the same logic as individual rows
                                let totalBaseRate = 0;
                                let totalCleaningFees = 0;
                                let totalPlatformFees = 0;
                                let totalClientRevenue = 0;
                                let totalLuxuryFee = 0;
                                let totalTaxResponsibility = 0;
                                let totalGrossPayout = 0;

                                statement.reservations?.forEach(reservation => {
                                    // Get per-property settings from the map, fall back to statement-level settings
                                    const propSettings = statement._listingSettingsMap?.[reservation.propertyId] || {
                                        isCohostOnAirbnb: statement.isCohostOnAirbnb,
                                        disregardTax: statement.disregardTax,
                                        airbnbPassThroughTax: statement.airbnbPassThroughTax,
                                        pmFeePercentage: statement.pmPercentage
                                    };

                                    const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
                                    const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;

                                    const baseRate = reservation.hasDetailedFinance ? reservation.baseRate : (reservation.grossAmount * 0.85);
                                    const cleaningFees = reservation.hasDetailedFinance ? reservation.cleaningAndOtherFees : (reservation.grossAmount * 0.15);
                                    const platformFees = reservation.hasDetailedFinance ? reservation.platformFees : (reservation.grossAmount * 0.03);
                                    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                                    // Use per-property PM fee percentage
                                    const luxuryFee = clientRevenue * (propSettings.pmFeePercentage / 100);
                                    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

                                    const shouldAddTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);
                                    let grossPayout;
                                    if (isCohostAirbnb) {
                                        grossPayout = -luxuryFee;
                                    } else if (shouldAddTax) {
                                        grossPayout = clientRevenue - luxuryFee + taxResponsibility;
                                    } else {
                                        grossPayout = clientRevenue - luxuryFee;
                                    }

                                    totalBaseRate += baseRate;
                                    totalCleaningFees += cleaningFees;
                                    totalPlatformFees += platformFees;
                                    totalClientRevenue += clientRevenue;
                                    totalLuxuryFee += luxuryFee;
                                    totalTaxResponsibility += taxResponsibility;
                                    totalGrossPayout += grossPayout;
                                });

                                return `
                            <tr class="totals-row">
                                <td><strong>TOTALS</strong></td>
                                <td class="amount-cell"><strong>$${totalBaseRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${totalCleaningFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>-$${Math.abs(totalPlatformFees).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${totalClientRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>-$${Math.abs(totalLuxuryFee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${totalTaxResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell payout-cell"><strong>${totalGrossPayout >= 0 ? '$' : '-$'}${Math.abs(totalGrossPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                            </tr>`;
                            })()}
            </tbody>
        </table>
            </div>
            </div>

    ${statement.duplicateWarnings && statement.duplicateWarnings.length > 0 ? `
    <!-- Duplicate Warnings Section -->
    <div class="section" style="margin-bottom: 20px;">
        <div class="warning-box" style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 16px; display: flex; align-items: center;">
                Potential Duplicate Expenses Detected
            </h3>
            <p style="color: #856404; margin: 0 0 15px 0; font-size: 14px;">
                We found ${statement.duplicateWarnings.length} potential duplicate expense${statement.duplicateWarnings.length > 1 ? 's' : ''} between different sources. Please review:
            </p>
            <div class="duplicates-list">
                ${statement.duplicateWarnings.map((dup, index) => `
                    <div style="background: white; border: 1px solid #e9ecef; border-radius: 4px; padding: 12px; margin-bottom: 10px;">
                        <div style="font-weight: 600; color: #495057; margin-bottom: 8px;">Duplicate ${index + 1}:</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 13px;">
                            <div>
                                <div style="font-weight: 500; color: #6c757d;">Source: ${dup.expense1.source === 'securestay' ? 'SecureStay' : 'Uploaded File'}</div>
                                <div>${dup.expense1.description}</div>
                                <div style="color: #28a745; font-weight: 500;">$${dup.expense1.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                <div style="color: #6c757d; font-size: 12px;">${dup.expense1.date}</div>
                                ${dup.expense1.uploadFile ? `<div style="color: #6c757d; font-size: 11px;">File: ${dup.expense1.uploadFile}</div>` : ''}
            </div>
                            <div>
                                <div style="font-weight: 500; color: #6c757d;">Source: ${dup.expense2.source === 'securestay' ? 'SecureStay' : 'Uploaded File'}</div>
                                <div>${dup.expense2.description}</div>
                                <div style="color: #28a745; font-weight: 500;">$${dup.expense2.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                <div style="color: #6c757d; font-size: 12px;">${dup.expense2.date}</div>
                                ${dup.expense2.uploadFile ? `<div style="color: #6c757d; font-size: 11px;">File: ${dup.expense2.uploadFile}</div>` : ''}
            </div>
            </div>
            </div>
                `).join('')}
        </div>
        </div>
    </div>
    ` : ''}

    <!-- Expenses Section -->
    <div class="section">
        <h2 class="section-title">EXPENSES</h2>
        <div class="expenses-container">
            <table class="expenses-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Description</th>
                        <th>Property</th>
                        <th>Category</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                    ${statement.items?.filter(item => item.type === 'expense').map(expense => {
                        // Check if this expense is part of a duplicate warning
                        const isDuplicate = statement.duplicateWarnings && statement.duplicateWarnings.some(dup => {
                            const matchesExpense1 = dup.expense1.description === expense.description && 
                                                   Math.abs(dup.expense1.amount - expense.amount) < 0.01 && 
                                                   dup.expense1.date === expense.date;
                            const matchesExpense2 = dup.expense2.description === expense.description && 
                                                   Math.abs(dup.expense2.amount - expense.amount) < 0.01 && 
                                                   dup.expense2.date === expense.date;
                            return matchesExpense1 || matchesExpense2;
                        });
                        
                        return `
                        <tr${isDuplicate ? ' style="background-color: #fff3cd; border-left: 4px solid #ffc107;"' : ''}>
                            <td class="date-cell">
                                ${(() => {
                                    const [year, month, day] = expense.date.split('-').map(Number);
                                    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                })()}
                                ${isDuplicate ? '<br><span style="color: #856404; font-size: 10px; font-weight: 600;">Duplicate</span>' : ''}
                            </td>
                            <td class="description-cell">${expense.description}</td>
                            <td class="listing-cell">${expense.listing || '-'}</td>
                            <td class="category-cell">${expense.category}</td>
                            <td class="amount-cell expense-amount">$${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    `;
                    }).join('') || '<tr><td colspan="5" style="text-align: center; color: var(--luxury-gray); font-style: italic;">No expenses for this period</td></tr>'}
                    <tr class="totals-row">
                        <td colspan="4"><strong>TOTAL EXPENSES</strong></td>
                        <td class="amount-cell expense-amount"><strong>$${(statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
            </tbody>
        </table>
        </div>
    </div>

    <!-- Additional Payouts Section (Upsells) -->
    ${statement.items?.filter(item => item.type === 'upsell').length > 0 ? `
    <div class="section">
        <h2 class="section-title">ADDITIONAL PAYOUTS</h2>
        <div class="expenses-container">
            <table class="expenses-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Property</th>
                    <th>Category</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                    ${statement.items?.filter(item => item.type === 'upsell').map(upsell => `
                        <tr>
                            <td class="date-cell">
                                ${(() => {
                                    const [year, month, day] = upsell.date.split('-').map(Number);
                                    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                })()}
                            </td>
                            <td class="description-cell">${upsell.description}</td>
                            <td class="listing-cell">${upsell.listing || '-'}</td>
                            <td class="category-cell">${upsell.category}</td>
                            <td class="amount-cell revenue-amount">+$${upsell.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `).join('')}
                    <tr class="totals-row">
                        <td colspan="4" style="color: white;"><strong>TOTAL ADDITIONAL PAYOUTS</strong></td>
                        <td class="amount-cell revenue-amount" style="color: white;"><strong>+$${(statement.items?.filter(item => item.type === 'upsell').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
            </tbody>
        </table>
        </div>
    </div>
    ` : ''}

    <!-- Summary Section -->
    ${(() => {
        // Calculate summary values from reservations (same as TOTALS row)
        let summaryGrossPayout = 0;

        statement.reservations?.forEach(reservation => {
            // Get per-property settings from the map, fall back to statement-level settings
            const propSettings = statement._listingSettingsMap?.[reservation.propertyId] || {
                isCohostOnAirbnb: statement.isCohostOnAirbnb,
                disregardTax: statement.disregardTax,
                airbnbPassThroughTax: statement.airbnbPassThroughTax,
                pmFeePercentage: statement.pmPercentage
            };

            const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
            const isCohostAirbnb = isAirbnb && propSettings.isCohostOnAirbnb;

            const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
            // Use per-property PM fee percentage
            const luxuryFee = clientRevenue * (propSettings.pmFeePercentage / 100);
            const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;

            const shouldAddTax = !propSettings.disregardTax && (!isAirbnb || propSettings.airbnbPassThroughTax);
            let grossPayout;
            if (isCohostAirbnb) {
                grossPayout = -luxuryFee;
            } else if (shouldAddTax) {
                grossPayout = clientRevenue - luxuryFee + taxResponsibility;
            } else {
                grossPayout = clientRevenue - luxuryFee;
            }

            summaryGrossPayout += grossPayout;
        });

        const totalUpsells = statement.items?.filter(item => item.type === 'upsell').reduce((sum, item) => sum + item.amount, 0) || 0;
        const totalExpenses = statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0;
        const netPayout = summaryGrossPayout + totalUpsells - totalExpenses;

        return `
    <div class="section">
                <div class="statement-summary">
                    <div class="summary-box">
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">Gross Payout</td>
                                <td class="summary-value ${summaryGrossPayout >= 0 ? 'revenue' : 'expense'}">${summaryGrossPayout >= 0 ? '$' : '-$'}${Math.abs(summaryGrossPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            ${totalUpsells > 0 ? `
                            <tr>
                                <td class="summary-label">Additional Payouts</td>
                                <td class="summary-value revenue">+$${totalUpsells.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td class="summary-label">Expenses</td>
                                <td class="summary-value expense">-$${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            <tr class="total-row">
                                <td class="summary-label"><strong>NET PAYOUT</strong></td>
                                <td class="summary-value total-amount"><strong>${netPayout >= 0 ? '$' : '-$'}${Math.abs(netPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>`;
    })()}

        ${isPdf ? '' : `<div class="footer">
            <div class="footer-content">
                <div class="generated-info">
                    Statement generated on ${new Date().toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
                <button onclick="window.open('/api/statements/${id}/download', '_blank')" class="print-button">Download PDF</button>
            </div>
        </div>`}
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(statementHTML);
    } catch (error) {
        console.error('Statement view error:', error);
        res.status(500).json({ error: 'Failed to view statement' });
    }
});

// GET /api/statements-file/:id/download - Download statement
router.get('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);

        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        const htmlPdf = require('html-pdf-node');
        const http = require('http');

        // Fetch HTML from the view route internally (with pdf=true to hide download button)
        const viewUrl = `http://localhost:${process.env.PORT || 3003}/api/statements/${id}/view?pdf=true`;

        const fetchHTML = () => {
            return new Promise((resolve, reject) => {
                const authHeader = req.headers.authorization;
                const options = {
                    headers: authHeader ? { 'Authorization': authHeader } : {}
                };

                http.get(viewUrl, options, (response) => {
                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => resolve(data));
                    response.on('error', reject);
                }).on('error', reject);
            });
        };

        const statementHTML = await fetchHTML();

        const options = {
            format: 'A4',
            landscape: false, // Use portrait orientation
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            },
            printBackground: true, // Ensure backgrounds are printed
            preferCSSPageSize: false,
            displayHeaderFooter: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        };

        const file = { content: statementHTML };

        // Generate PDF
        const pdfBuffer = await htmlPdf.generatePdf(file, options);

        // Get property nickname for filename (nickname only, no ID)
        let propertyNickname = 'Statement';
        if (statement.propertyId) {
            try {
                const listing = await ListingService.getListingWithPmFee(statement.propertyId);
                if (listing && listing.nickname) {
                    propertyNickname = listing.nickname;
                }
            } catch (err) {
                console.error('Error fetching listing for filename:', err);
            }
        }

        // Clean property nickname for filename
        const cleanPropertyName = propertyNickname
            .replace(/[^a-zA-Z0-9\s\-\.]/g, '') // Remove special chars but keep spaces, hyphens, dots
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();

        // Get owner/client name for filename
        const clientName = statement.ownerName || 'Owner';
        const cleanClientName = clientName
            .replace(/[^a-zA-Z0-9\s\-\.]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const startDate = statement.weekStartDate?.replace(/\//g, '-') || 'unknown';
        const endDate = statement.weekEndDate?.replace(/\//g, '-') || 'unknown';
        const statementPeriod = `${startDate} to ${endDate}`;

        const filename = `${cleanPropertyName} - ${statementPeriod}.pdf`;
        
        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        // Send PDF buffer
        res.send(pdfBuffer);
        
    } catch (error) {
        console.error('Statement PDF download error:', error);
        res.status(500).json({ error: 'Failed to download statement PDF' });
    }
});

// Helper function to generate statement HTML for PDF
// Helper function to generate statements for all owners and their properties
/**
 * Background version of bulk statement generation with progress tracking
 */
async function generateAllOwnerStatementsBackground(jobId, startDate, endDate, calculationType, tag = null) {
    try {
        // Get all listings
        const listings = await FileDataService.getListings();

        // Fetch ALL reservations and expenses ONCE for the entire period (optimization)
        const allReservations = await FileDataService.getReservations(
            startDate,
            endDate,
            null,  // No property filter - get ALL reservations
            calculationType
        );

        const allExpenses = await FileDataService.getExpenses(startDate, endDate, null);

        // Filter to only active listings
        let activeListings = listings.filter(l => l.isActive);
        
        // Apply tag filter if specified (case-insensitive)
        if (tag) {
            const tagLower = tag.toLowerCase().trim();
            activeListings = activeListings.filter(l => {
                const listingTags = l.tags || [];
                return listingTags.some(t => t.toLowerCase().trim() === tagLower);
            });
        }

        BackgroundJobService.startJob(jobId, activeListings.length);

        const results = {
            generated: [],
            skipped: [],
            errors: []
        };

        let processedCount = 0;

        // Generate a statement for each active listing using "Default Owner"
        for (const property of activeListings) {
                try {
                    // Use pre-fetched data instead of fetching again (optimization)
                    const periodStart = new Date(startDate);
                    const periodEnd = new Date(endDate);

                    const periodReservations = allReservations.filter(res => {
                        if (res.propertyId !== property.id) return false;

                        let dateMatch = true;
                        if (calculationType === 'calendar') {
                            dateMatch = true;
                        } else {
                            const checkoutDate = new Date(res.checkOutDate);
                            dateMatch = checkoutDate >= periodStart && checkoutDate <= periodEnd;
                        }

                        const allowedStatuses = ['confirmed', 'modified', 'new'];
                        const statusMatch = allowedStatuses.includes(res.status);

                        return dateMatch && statusMatch;
                    }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

                    const periodExpenses = allExpenses.filter(exp => {
                        // Only include expenses that match this property
                        // Check both propertyId (for uploaded expenses) and secureStayListingId (for SecureStay expenses)
                        const matchesPropertyId = exp.propertyId === property.id;
                        const matchesSecureStayId = exp.secureStayListingId && parseInt(exp.secureStayListingId) === property.id;
                        if (!matchesPropertyId && !matchesSecureStayId) {
                            return false;
                        }
                        const expenseDate = new Date(exp.date);
                        return expenseDate >= periodStart && expenseDate <= periodEnd;
                    });

                    if (periodReservations.length === 0 && periodExpenses.length === 0) {
                        results.skipped.push({
                            propertyId: property.id,
                            propertyName: property.nickname || property.displayName || property.name,
                            reason: 'No activity in period'
                        });
                        processedCount++;
                        BackgroundJobService.updateProgress(jobId, processedCount);
                        continue;
                    }

                    // Get listing info (needed early for co-host check)
                    const listing = await ListingService.getListingWithPmFee(property.id);
                    const isCohostOnAirbnb = listing?.isCohostOnAirbnb || false;
                    const airbnbPassThroughTax = listing?.airbnbPassThroughTax || false;
                    const disregardTax = listing?.disregardTax || false;
                    
                    // Calculate totals - exclude Airbnb revenue if co-host is enabled
                    const totalRevenue = periodReservations.reduce((sum, res) => {
                        // Check if this is an Airbnb reservation
                        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                        
                        // Exclude Airbnb revenue for co-hosted properties (client gets paid directly)
                        if (isAirbnb && isCohostOnAirbnb) {
                            return sum;
                        }

                        return sum + (res.grossAmount || 0);
                    }, 0);
                    
                    // Separate expenses (negative/costs) from upsells (positive/revenue)
                    const totalExpenses = periodExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum : sum + Math.abs(exp.amount);
                    }, 0);

                    // Calculate total upsells (additional payouts)
                    const totalUpsells = periodExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum + exp.amount : sum;
                    }, 0);

                    // Get PM percentage from listing database (property-specific)
                    let pmPercentage = 15; // Default fallback
                    if (listing && listing.pmFeePercentage !== null) {
                        pmPercentage = listing.pmFeePercentage;
                    }

                    // Calculate PM commission (only on non-Airbnb revenue for co-hosted properties)
                    const pmCommission = totalRevenue * (pmPercentage / 100);
                    const techFees = 50; // $50 per property
                    const insuranceFees = 25; // $25 per property

                    // Calculate owner payout (GROSS PAYOUT + ADDITIONAL PAYOUTS - EXPENSES)
                    // Note: techFees and insuranceFees are stored but not included in payout calculation
                    const ownerPayout = totalRevenue - pmCommission + totalUpsells - totalExpenses;

                    const existingStatements = await FileDataService.getStatements();
                    const newId = FileDataService.generateId(existingStatements);

                    const statement = {
                        id: newId,
                        ownerId: 1,
                        ownerName: 'Default Owner',
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        weekStartDate: startDate,
                        weekEndDate: endDate,
                        calculationType,
                        totalRevenue: Math.round(totalRevenue * 100) / 100,
                        totalExpenses: Math.round(totalExpenses * 100) / 100,
                        pmCommission: Math.round(pmCommission * 100) / 100,
                        pmPercentage: pmPercentage,
                        techFees: Math.round(techFees * 100) / 100,
                        insuranceFees: Math.round(insuranceFees * 100) / 100,
                        adjustments: 0,
                        ownerPayout: Math.round(ownerPayout * 100) / 100,
                        isCohostOnAirbnb: isCohostOnAirbnb,
                        airbnbPassThroughTax: airbnbPassThroughTax,
                        disregardTax: disregardTax,
                        status: 'draft',
                        sentAt: null,
                        createdAt: new Date().toISOString(),
                        reservations: periodReservations,
                        expenses: periodExpenses,
                        duplicateWarnings: [],
                        items: [
                            ...periodReservations.map(res => ({
                                type: 'revenue',
                                description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                                amount: res.grossAmount,
                                date: res.checkOutDate,
                                category: 'booking'
                            })),
                            ...periodExpenses.map(exp => {
                                const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                                return {
                                    type: isUpsell ? 'upsell' : 'expense',
                                description: exp.description,
                                    amount: Math.abs(exp.amount),
                                date: exp.date,
                                category: exp.type || exp.category || 'expense',
                                vendor: exp.vendor,
                                listing: exp.listing
                                };
                            })
                        ]
                    };

                    await FileDataService.saveStatement(statement);

                    results.generated.push({
                        id: newId,
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        ownerPayout: statement.ownerPayout,
                        totalRevenue: statement.totalRevenue,
                        reservationCount: periodReservations.length,
                        expenseCount: periodExpenses.length
                    });

                    processedCount++;
                    BackgroundJobService.updateProgress(jobId, processedCount);

                } catch (error) {
                    console.error(`   [Error] Error generating statement for ${property.name}:`, error.message);
                    results.errors.push({
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        error: error.message
                    });
                    processedCount++;
                    BackgroundJobService.updateProgress(jobId, processedCount);
            }
        }

        BackgroundJobService.completeJob(jobId, {
            summary: {
                generated: results.generated.length,
                skipped: results.skipped.length,
                errors: results.errors.length
            },
            results
        });

    } catch (error) {
        BackgroundJobService.failJob(jobId, error);
        throw error;
    }
}

/**
 * Original synchronous version (kept for backward compatibility, but not used)
 */
async function generateAllOwnerStatements(req, res, startDate, endDate, calculationType) {
    try {
        // Get all owners and all listings
        const owners = await FileDataService.getOwners();
        const listings = await FileDataService.getListings();

        const results = {
            generated: [],
            skipped: [],
            errors: []
        };

        // Loop through each owner
        for (const owner of owners) {
            // Find properties for this owner
            const ownerProperties = listings.filter(listing => {
                // Check if this listing belongs to the current owner
                const belongsToOwner = owner.listingIds && owner.listingIds.includes(listing.id);
                return belongsToOwner && listing.isActive;
            });

            if (ownerProperties.length === 0) {
                results.skipped.push({
                    ownerId: owner.id,
                    ownerName: owner.name,
                    reason: 'No properties found'
                });
                continue;
            }

            // Generate a statement for each property
            for (const property of ownerProperties) {
                try {
                    // Get reservations and expenses for this specific property
                    const reservations = await FileDataService.getReservations(
                        startDate,
                        endDate,
                        property.id,
                        calculationType
                    );

                    const expenses = await FileDataService.getExpenses(startDate, endDate, property.id);

                    // Filter reservations for this property and period
                    const periodStart = new Date(startDate);
                    const periodEnd = new Date(endDate);

                    const periodReservations = reservations.filter(res => {
                        if (res.propertyId !== property.id) return false;

                        let dateMatch = true;
                        if (calculationType === 'calendar') {
                            dateMatch = true; // Already filtered by overlap
                        } else {
                            const checkoutDate = new Date(res.checkOutDate);
                            dateMatch = checkoutDate >= periodStart && checkoutDate <= periodEnd;
                        }

                        const allowedStatuses = ['confirmed', 'modified', 'new'];
                        const statusMatch = allowedStatuses.includes(res.status);

                        return dateMatch && statusMatch;
                    }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

                    // Filter expenses for this property
                    const periodExpenses = expenses.filter(exp => {
                        if (property.id && exp.propertyId !== null && exp.propertyId !== property.id) {
                            return false;
                        }
                        const expenseDate = new Date(exp.date);
                        return expenseDate >= periodStart && expenseDate <= periodEnd;
                    });

                    // Skip if no activity
                    if (periodReservations.length === 0 && periodExpenses.length === 0) {
                        results.skipped.push({
                            ownerId: owner.id,
                            ownerName: owner.name,
                            propertyId: property.id,
                            propertyName: property.nickname || property.displayName || property.name,
                            reason: 'No activity in period'
                        });
                        continue;
                    }

                    // Calculate totals
                    const totalRevenue = periodReservations.reduce((sum, res) => sum + (res.grossAmount || 0), 0);
                    // Separate expenses (negative/costs) from upsells (positive/revenue)
                    const totalExpenses = periodExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum : sum + Math.abs(exp.amount);
                    }, 0);

                    // Calculate total upsells (additional payouts)
                    const totalUpsells = periodExpenses.reduce((sum, exp) => {
                        const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                        return isUpsell ? sum + exp.amount : sum;
                    }, 0);

                    // Get PM percentage from listing database (property-specific)
                    let pmPercentage = 15; // Default fallback
                    const listing = await ListingService.getListingWithPmFee(property.id);
                    if (listing && listing.pmFeePercentage !== null) {
                        pmPercentage = listing.pmFeePercentage;
                    }

                    const pmCommission = totalRevenue * (pmPercentage / 100);
                    const techFees = 50; // $50 per property
                    const insuranceFees = 25; // $25 per property
                    // Calculate owner payout (GROSS PAYOUT + ADDITIONAL PAYOUTS - EXPENSES)
                    // Note: techFees and insuranceFees are stored but not included in payout calculation
                    const ownerPayout = totalRevenue - pmCommission + totalUpsells - totalExpenses;

                    // Generate unique ID
                    const existingStatements = await FileDataService.getStatements();
                    const newId = FileDataService.generateId(existingStatements);

                    // Create statement object
                    const statement = {
                        id: newId,
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        weekStartDate: startDate,
                        weekEndDate: endDate,
                        calculationType,
                        totalRevenue: Math.round(totalRevenue * 100) / 100,
                        totalExpenses: Math.round(totalExpenses * 100) / 100,
                        pmCommission: Math.round(pmCommission * 100) / 100,
                        pmPercentage: pmPercentage,
                        techFees: Math.round(techFees * 100) / 100,
                        insuranceFees: Math.round(insuranceFees * 100) / 100,
                        adjustments: 0,
                        ownerPayout: Math.round(ownerPayout * 100) / 100,
                        status: 'draft',
                        sentAt: null,
                        createdAt: new Date().toISOString(),
                        reservations: periodReservations,
                        expenses: periodExpenses,
                        duplicateWarnings: [],
                        items: [
                            ...periodReservations.map(res => ({
                                type: 'revenue',
                                description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                                amount: res.grossAmount,
                                date: res.checkOutDate,
                                category: 'booking'
                            })),
                            ...periodExpenses.map(exp => {
                                const isUpsell = exp.amount > 0 || (exp.type && exp.type.toLowerCase() === 'upsell') || (exp.category && exp.category.toLowerCase() === 'upsell');
                                return {
                                    type: isUpsell ? 'upsell' : 'expense',
                                description: exp.description,
                                    amount: Math.abs(exp.amount),
                                date: exp.date,
                                category: exp.type || exp.category || 'expense',
                                vendor: exp.vendor,
                                listing: exp.listing
                                };
                            })
                        ]
                    };

                    // Save statement
                    await FileDataService.saveStatement(statement);

                    results.generated.push({
                        id: newId,
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        ownerPayout: statement.ownerPayout,
                        totalRevenue: statement.totalRevenue,
                        reservationCount: periodReservations.length,
                        expenseCount: periodExpenses.length
                    });

                } catch (error) {
                    results.errors.push({
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.nickname || property.displayName || property.name,
                        error: error.message
                    });
                }
            }
        }

        res.status(201).json({
            message: 'Bulk statement generation completed',
            summary: {
                generated: results.generated.length,
                skipped: results.skipped.length,
                errors: results.errors.length
            },
            results: results
        });

    } catch (error) {
        console.error('Bulk statement generation error:', error);
        res.status(500).json({ error: 'Failed to generate statements for all owners' });
    }
}

module.exports = router;
