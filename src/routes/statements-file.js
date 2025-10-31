const express = require('express');
const router = express.Router();
const FileDataService = require('../services/FileDataService');

// GET /api/statements-file - Get all statements from files
router.get('/', async (req, res) => {
    try {
        const { 
            ownerId, 
            propertyId, 
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
        
        if (propertyId) {
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

        // Apply pagination
        const total = statements.length;
        const paginatedStatements = statements.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        // Format for frontend
        const formattedStatements = paginatedStatements.map(s => ({
            id: s.id,
            ownerName: s.ownerName || 'Default Owner',
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
            createdAt: s.createdAt
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

// POST /api/statements-file/generate - Generate statement and save to file
router.post('/generate', async (req, res) => {
    try {
        const { propertyId, ownerId, startDate, endDate, calculationType = 'checkout' } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        if (!propertyId && !ownerId) {
            return res.status(400).json({ error: 'Either property ID or owner ID is required' });
        }

        // Handle "Generate All" option
        if (ownerId === 'all') {
            return await generateAllOwnerStatements(req, res, startDate, endDate, calculationType);
        }

        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);
        
        if (periodStart > periodEnd) {
            return res.status(400).json({ error: 'Start date must be before end date' });
        }

        // Get data from files
        const listings = await FileDataService.getListings();
        
        // Only get reservations for the exact period and property needed
        const reservations = await FileDataService.getReservations(
            startDate,
            endDate,
            propertyId,
            calculationType
        );
        const expenses = await FileDataService.getExpenses(startDate, endDate, propertyId);
        const owners = await FileDataService.getOwners();
        
        // Check for duplicate warnings
        const duplicateWarnings = expenses.duplicateWarnings || [];
        if (duplicateWarnings.length > 0) {
            console.warn(`⚠️  Found ${duplicateWarnings.length} potential duplicate expenses in statement`);
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
        } else {
            // Generate consolidated statement for all owner's properties
            owner = owners.find(o => o.id === parseInt(ownerId));
            if (!owner) {
                return res.status(404).json({ error: 'Owner not found' });
            }
            targetListings = listings; // All properties for now
        }

        // Debug: Log what we got from API
        console.log(`Total reservations fetched from API: ${reservations.length}`);
        if (reservations.length > 0) {
            console.log(`Sample reservation:`, {
                id: reservations[0].id,
                propertyId: reservations[0].propertyId,
                guestName: reservations[0].guestName,
                status: reservations[0].status,
                checkInDate: reservations[0].checkInDate,
                checkOutDate: reservations[0].checkOutDate
            });
        }

        // Get reservations for the date range
        // For calendar calculation, reservations are already filtered by overlap in FileDataService
        // For checkout calculation, filter by checkout date
        const periodReservations = reservations.filter(res => {
            if (propertyId && res.propertyId !== parseInt(propertyId)) {
                console.log(`Excluded reservation - wrong property: ${res.propertyId} (expected ${propertyId})`);
                return false;
            }
            
            // Check date match based on calculation type
            let dateMatch = true;
            
            if (calculationType === 'calendar') {
                // For calendar-based calculation, reservations are already filtered and prorated
                console.log(`Including prorated reservation: ${res.hostifyId || res.id} - ${res.prorationNote || 'no proration'}`);
                dateMatch = true; // Already filtered by overlap in FileDataService
            } else {
                // For checkout-based calculation, filter by checkout date
                const checkoutDate = new Date(res.checkOutDate);
                dateMatch = checkoutDate >= periodStart && checkoutDate <= periodEnd;
                
                if (!dateMatch) {
                    console.log(`Excluded reservation - wrong date: ${res.checkOutDate} (period: ${startDate} to ${endDate})`);
                    return false;
                }
            }
            
            // Only include confirmed, modified, and new status reservations by default
            // Cancelled reservations can be added later through the edit functionality
            // Explicitly exclude inquiry, expired, declined, and unknown statuses
            const allowedStatuses = ['confirmed', 'modified', 'new'];
            const excludedStatuses = ['cancelled', 'inquiry', 'expired', 'declined', 'unknown', 'completed'];
            const statusMatch = allowedStatuses.includes(res.status);
            
            // Log any reservations that don't match status filter for debugging
            if (dateMatch && !statusMatch) {
                if (excludedStatuses.includes(res.status)) {
                    console.log(`Excluded reservation with status: "${res.status}" for guest: ${res.guestName} (${res.hostawayId}) - Status not allowed in statements`);
                } else {
                    console.log(`WARNING: Excluded reservation with unexpected status: "${res.status}" for guest: ${res.guestName} (${res.hostawayId})`);
                }
            }
            
            return dateMatch && statusMatch;
        }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));

        console.log(`Found ${periodReservations.length} reservations with allowed statuses for statement generation`);

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

        // Calculate totals
        const totalRevenue = periodReservations.reduce((sum, res) => sum + (res.grossAmount || 0), 0);
        const totalExpenses = periodExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const pmPercentage = 15; // Default PM percentage
        const pmCommission = totalRevenue * (pmPercentage / 100);
        
        // Calculate fees per property
        const propertyCount = targetListings.length;
        const techFees = propertyCount * 50; // $50 per property
        const insuranceFees = propertyCount * 25; // $25 per property
        
        const ownerPayout = totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees;

        // Generate unique ID
        const existingStatements = await FileDataService.getStatements();
        const newId = FileDataService.generateId(existingStatements);

        // Create statement object
        const statement = {
            id: newId,
            ownerId: owner.id,
            ownerName: owner.name,
            propertyId: propertyId ? parseInt(propertyId) : null,
            propertyName: propertyId ? targetListings[0].name : 'All Properties',
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
            duplicateWarnings: duplicateWarnings,
            items: [
                // Revenue items
                ...periodReservations.map(res => ({
                    type: 'revenue',
                    description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                    amount: res.grossAmount,
                    date: res.checkOutDate,
                    category: 'booking'
                })),
                // Only real expenses from SecureStay or uploaded files
                ...periodExpenses.map(exp => ({
                    type: 'expense',
                    description: exp.description,
                    amount: exp.amount,
                    date: exp.date,
                    category: exp.type || exp.category || 'expense',
                    vendor: exp.vendor,
                    listing: exp.listing
                }))
            ]
        };

        // Save statement to file
        await FileDataService.saveStatement(statement);

        console.log(`Statement generated: ID ${statement.id}, Payout: $${statement.ownerPayout}`);

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
        
        console.log(`DEBUG: Fetching reservations directly from Hostaway API for property ${statement.propertyId}, period ${statement.weekStartDate} to ${statement.weekEndDate}`);
        
        // Get all reservations for this property and period from Hostaway
        const apiResponse = await hostawayService.getAllReservations(
            statement.weekStartDate,
            statement.weekEndDate,
            statement.propertyId
        );
        
        const allReservations = apiResponse.result || [];
        console.log(`DEBUG: Got ${allReservations.length} reservations from Hostaway API`);
        
        // Log status counts for debugging
        const statusCounts = {};
        allReservations.forEach(res => {
            statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
        });
        console.log('DEBUG: Reservation status counts from API:', statusCounts);
        
        // Filter for ALL cancelled reservations (including those already in statement)
        const cancelledReservations = allReservations.filter(res => {
            console.log(`DEBUG: Checking reservation ${res.hostawayId} - Status: ${res.status}, Guest: ${res.guestName}`);
            
            // Only cancelled reservations
            const isCancelled = res.status === 'cancelled';
            if (!isCancelled) {
                console.log(`DEBUG: Excluded - not cancelled: ${res.status}`);
                return false;
            }
            
            // Check if already in statement (for informational purposes)
            const alreadyIncluded = statement.reservations?.some(existing => existing.hostawayId === res.hostawayId) || false;
            if (alreadyIncluded) {
                console.log(`DEBUG: INCLUDED cancelled reservation (already in statement): ${res.hostawayId} - ${res.guestName}`);
                // Mark it as already included but still include it in results
                res.alreadyInStatement = true;
            } else {
                console.log(`DEBUG: INCLUDED cancelled reservation (not in statement): ${res.hostawayId} - ${res.guestName}`);
                res.alreadyInStatement = false;
            }
            
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

// PUT /api/statements-file/:id - Edit statement (remove expenses, add cancelled reservations, etc.)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { expenseIdsToRemove, cancelledReservationIdsToAdd } = req.body;

        const statement = await FileDataService.getStatementById(id);
        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

        let modified = false;

        // Remove expenses by index or identifier
        if (expenseIdsToRemove && Array.isArray(expenseIdsToRemove) && expenseIdsToRemove.length > 0) {
            const originalItemsCount = statement.items.length;
            
            // Filter out expense items by indices (assuming expenseIdsToRemove contains array indices)
            statement.items = statement.items.filter((item, index) => {
                // If it's an expense and its index is in the removal list, remove it
                if (item.type === 'expense' && expenseIdsToRemove.includes(index)) {
                    return false;
                }
                return true;
            });

            if (statement.items.length < originalItemsCount) {
                modified = true;
                console.log(`Removed ${originalItemsCount - statement.items.length} expenses from statement ${id}`);
            }
        }

        // Add cancelled reservations
        if (cancelledReservationIdsToAdd && Array.isArray(cancelledReservationIdsToAdd) && cancelledReservationIdsToAdd.length > 0) {
            // Get all reservations to find the cancelled ones
            const allReservations = await FileDataService.getReservations();
            const reservationsToAdd = allReservations.filter(res => 
                cancelledReservationIdsToAdd.includes(res.id) && res.status === 'cancelled'
            );

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
                console.log(`Added ${reservationsToAdd.length} cancelled reservations to statement ${id}`);
            }
        }

        if (modified) {
            // Recalculate totals after removing expenses
            const expenses = statement.items.filter(item => item.type === 'expense');
            const revenues = statement.items.filter(item => item.type === 'revenue');
            
            statement.totalRevenue = revenues.reduce((sum, item) => sum + item.amount, 0);
            statement.totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
            
            // Recalculate specific fee types
            statement.pmCommission = expenses.filter(e => e.category === 'commission').reduce((sum, item) => sum + item.amount, 0);
            statement.techFees = expenses.filter(e => e.description.includes('Technology')).reduce((sum, item) => sum + item.amount, 0);
            statement.insuranceFees = expenses.filter(e => e.description.includes('Insurance')).reduce((sum, item) => sum + item.amount, 0);
            
            // Recalculate owner payout
            statement.ownerPayout = statement.totalRevenue - statement.totalExpenses - statement.adjustments;

            // Update the statement to show it was modified
            statement.status = 'modified';
            
            // Save updated statement
            await FileDataService.saveStatement(statement);

            res.json({ 
                message: 'Statement updated successfully',
                statement: {
                    id: statement.id,
                    totalRevenue: statement.totalRevenue,
                    totalExpenses: statement.totalExpenses,
                    ownerPayout: statement.ownerPayout,
                    itemsCount: statement.items.length,
                    reservationsCount: statement.reservations?.length || 0
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

// GET /api/statements-file/:id/view - View statement in browser
router.get('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        const statement = await FileDataService.getStatementById(id);

        if (!statement) {
            return res.status(404).json({ error: 'Statement not found' });
        }

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
            body { padding: 0; background: white; }
            .document { box-shadow: none; }
            .print-button { display: none; }
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
        }
        
        .summary-box {
            background: white;
            padding: 25px;
            border: 2px solid var(--luxury-navy);
            border-radius: 12px;
            width: 450px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .summary-table {
            width: 100%;
            border-collapse: collapse;
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
        
        .total-row td {
            padding-top: 15px;
            border-top: 2px solid var(--luxury-navy);
            font-size: 16px;
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
            border-collapse: collapse;
            background: white;
            font-size: 12px;
        }
        
        .expenses-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .expenses-table td {
            padding: 10px 8px;
            border-bottom: 1px solid #f0f0f0;
            vertical-align: middle;
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
        }
        
        .expenses-table .vendor-cell {
            width: 15%;
            color: var(--luxury-gray);
        }
        
        .expenses-table .listing-cell {
            width: 15%;
            color: var(--luxury-gray);
            font-size: 11px;
        }
        
        .expenses-table .category-cell {
            width: 13%;
            text-transform: capitalize;
            color: var(--luxury-gray);
        }
        
        .expenses-table .amount-cell {
            width: 15%;
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
            border-collapse: collapse;
            background: white;
            font-size: 7px;
        }
        
        .rental-table th {
            background: var(--luxury-navy);
            color: white;
            padding: 4px 2px;
            text-align: center;
            font-weight: 600;
            font-size: 6px;
            text-transform: uppercase;
            letter-spacing: 0.2px;
            border-right: 1px solid rgba(255,255,255,0.2);
            white-space: nowrap;
            line-height: 1.1;
        }
        
        .rental-table th:nth-child(1) { width: 16%; }   /* Guest Details */
        .rental-table th:nth-child(2) { width: 7%; }    /* Check-in */
        .rental-table th:nth-child(3) { width: 7%; }    /* Check-out */
        .rental-table th:nth-child(4) { width: 5%; }    /* Nights */
        .rental-table th:nth-child(5) { width: 8%; }    /* Base Rate */
        .rental-table th:nth-child(6) { width: 8%; }    /* Cleaning */
        .rental-table th:nth-child(7) { width: 8%; }    /* Platform Fees */
        .rental-table th:nth-child(8) { width: 8%; }    /* Revenue */
        .rental-table th:nth-child(9) { width: 8%; }    /* PM Commission */
        .rental-table th:nth-child(10) { width: 8%; }   /* Tax Responsibility */
        .rental-table th:nth-child(11) { width: 9%; }   /* Gross Payout */
        
        .rental-table td {
            padding: 4px 2px;
            border-bottom: 1px solid #e5e7eb;
            border-right: 1px solid #f0f0f0;
            font-size: 7px;
            text-align: center;
            vertical-align: top;
            line-height: 1.2;
        }
        
        .booking-cell {
            text-align: left !important;
            padding: 14px 10px !important;
        }
        
        .guest-details-cell {
            text-align: left !important;
            padding: 4px 2px !important;
        }
        
        .guest-name {
            font-weight: 700;
            color: var(--luxury-navy);
            font-size: 7px;
            margin-bottom: 1px;
        }
        
        .guest-info {
            font-size: 6px;
            color: var(--luxury-gray);
            line-height: 1.2;
            margin-bottom: 1px;
        }
        
        .booking-details {
            font-size: 6px;
            color: var(--luxury-gray);
            line-height: 1.2;
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
            font-size: 7px;
            white-space: nowrap;
        }
        
        .text-center {
            text-align: center;
        }
        
        .channel-badge {
            display: inline-block;
            background: var(--luxury-light-gold);
            color: var(--luxury-navy);
            padding: 0px 2px;
            border-radius: 2px;
            font-size: 5px;
            font-weight: 600;
            text-transform: uppercase;
            margin-top: 1px;
        }
        
        .proration-info {
            font-size: 5px !important;
            color: #007bff !important;
            margin-top: 1px !important;
        }
        
        .amount-cell {
            text-align: right;
            font-weight: 600;
            font-size: 7px;
            padding-right: 2px !important;
        }
        
        .payout-cell {
            font-weight: 700;
            background: #f0f9ff !important;
        }
        
        .expense-amount {
            color: var(--luxury-red);
        }
        
        .revenue-amount {
            color: var(--luxury-navy);
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
            padding: 5px 2px;
            border-bottom: none;
            font-size: 7px;
        }
        
        /* Page setup for PDF */
        @page {
            size: A4 landscape;
            margin: 0.5cm 0.8cm;
        }
        
        /* Print styles */
        @media print {
            body {
                padding: 0;
                font-size: 7px;
            }
            
            .header {
                padding: 10px 15px;
            }
            
            .content {
                padding: 15px;
            }
            
            .rental-table {
                font-size: 6px;
                page-break-inside: avoid;
            }
            
            .rental-table th {
                font-size: 5px;
                padding: 3px 1px;
            }
            
            .rental-table td {
                font-size: 6px;
                padding: 3px 1px;
            }
            
            .guest-details-cell {
                padding: 3px 2px !important;
            }
            
            .guest-name {
                font-size: 6px;
            }
            
            .guest-info, .booking-details {
                font-size: 5px;
            }
            
            .amount-cell {
                font-size: 6px;
            }
            
            .channel-badge {
                font-size: 4px;
                padding: 0px 1px;
            }
            
            .section-title {
                font-size: 11px;
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
    </style>
</head>
<body>
    <div class="document">
    <div class="header">
            <div class="company-header">
                <div class="company-info">
                    <h1>Luxury Lodging</h1>
                    <div class="contact-info">
                        <span>support@luxurylodgingpm.com | +1 (813) 594-8882</span>
    </div>
            </div>
                <div class="logo-placeholder">
                    <div class="logo-box">LOGO</div>
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
                            ${statement.calculationType === 'calendar' ? '📅 Calendar-based (prorated)' : '📋 Check-out based'}
                        </span>
                    </div>
            </div>
                    <div class="detail-group">
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
                    <div class="detail-group">
                        <span class="detail-label">Invoice number:</span>
                        <span class="detail-value">${statement.id}</span>
            </div>
            </div>
                
                <div class="owner-info">
                    <div class="owner-name">${statement.ownerName}</div>
                    <div class="owner-email">owner@example.com | (555) 000-0000</div>
            </div>
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
                                <th>Check-in date</th>
                                <th>Check-out date</th>
                                <th>Nights</th>
                                <th>Base Rate</th>
                                <th>Cleaning and Other Fees</th>
                                <th>Platform Fees</th>
                                <th>Revenue</th>
                                <th>PM Commission</th>
                                <th>Tax Responsibility</th>
                                <th>Gross Payout</th>
                </tr>
            </thead>
            <tbody>
                            ${statement.reservations?.map(reservation => {
                                // Use detailed financial data if available, otherwise fall back to calculated values
                                const baseRate = reservation.hasDetailedFinance ? reservation.baseRate : (reservation.grossAmount * 0.85);
                                const cleaningFees = reservation.hasDetailedFinance ? reservation.cleaningAndOtherFees : (reservation.grossAmount * 0.15);
                                const platformFees = reservation.hasDetailedFinance ? reservation.platformFees : (reservation.grossAmount * 0.03);
                                const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                                const luxuryFee = reservation.hasDetailedFinance ? reservation.luxuryLodgingFee : (reservation.grossAmount * (statement.pmPercentage / 100));
                                const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;
                                const clientPayout = reservation.hasDetailedFinance ? reservation.clientPayout : (clientRevenue - luxuryFee - taxResponsibility);
                                
                                return `
                                <tr>
                                    <td class="guest-details-cell">
                                        <div class="guest-name">${reservation.guestName}</div>
                                        <div class="guest-info">${statement.propertyName || 'Property'}</div>
                                        <div class="channel-badge">${reservation.source}</div>
                                        ${reservation.prorationNote ? 
                                            `<div class="proration-info" style="font-size: 10px; color: #007bff; margin-top: 2px;">
                                                📅 ${reservation.prorationNote}
                                            </div>` : ''
                                        }
                                    </td>
                                    <td class="date-cell">${(() => {
                                        const [year, month, day] = reservation.checkInDate.split('-').map(Number);
                                        return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                    })()}</td>
                                    <td class="date-cell">${(() => {
                                        const [year, month, day] = reservation.checkOutDate.split('-').map(Number);
                                        return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                    })()}</td>
                                    <td class="text-center">${reservation.nights || 0}</td>
                                    <td class="amount-cell">$${baseRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell">$${cleaningFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell expense-amount">-$${platformFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell revenue-amount">$${clientRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell expense-amount">-$${luxuryFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell revenue-amount">$${taxResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-cell payout-cell">$${clientPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="11" style="text-align: center; color: var(--luxury-gray); font-style: italic;">No rental activity found</td></tr>'}
                            <tr class="totals-row">
                                <td><strong>TOTALS</strong></td>
                                <td colspan="2"></td>
                                <td class="text-center"><strong>${statement.reservations?.reduce((sum, res) => sum + (res.nights || 0), 0) || 0}</strong></td>
                                <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.baseRate : res.grossAmount * 0.85), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.cleaningAndOtherFees : res.grossAmount * 0.15), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>-$${Math.abs(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.platformFees : res.grossAmount * 0.03), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>-$${Math.abs(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.luxuryLodgingFee : res.grossAmount * 0.05), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientTaxResponsibility : 0), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                                <td class="amount-cell payout-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientPayout : res.hostPayoutAmount || res.grossAmount * 0.85), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                            </tr>
            </tbody>
        </table>
            </div>
            </div>

    ${statement.duplicateWarnings && statement.duplicateWarnings.length > 0 ? `
    <!-- Duplicate Warnings Section -->
    <div class="section" style="margin-bottom: 20px;">
        <div class="warning-box" style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 16px; display: flex; align-items: center;">
                <span style="margin-right: 8px;">⚠️</span>
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
                        <th>Vendor</th>
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
                                ${isDuplicate ? '<br><span style="color: #856404; font-size: 10px; font-weight: 600;">⚠️ Duplicate</span>' : ''}
                            </td>
                            <td class="description-cell">${expense.description}</td>
                            <td class="vendor-cell">${expense.vendor || '-'}</td>
                            <td class="listing-cell">${expense.listing || '-'}</td>
                            <td class="category-cell">${expense.category}</td>
                            <td class="amount-cell expense-amount">$${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    `;
                    }).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--luxury-gray); font-style: italic;">No expenses for this period</td></tr>'}
                    <tr class="totals-row">
                        <td colspan="5"><strong>TOTAL EXPENSES</strong></td>
                        <td class="amount-cell expense-amount"><strong>$${(statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
            </tbody>
        </table>
        </div>
    </div>

    <!-- Summary Section -->
    <div class="section">
                <div class="statement-summary">
                    <div class="summary-box">
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">Revenue</td>
                                <td class="summary-value revenue">$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">PM Commission</td>
                                <td class="summary-value expense">-$${Math.abs(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.luxuryLodgingFee : res.grossAmount * 0.05), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Tax Responsibility</td>
                                <td class="summary-value revenue">$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientTaxResponsibility : 0), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Expenses and extras</td>
                                <td class="summary-value expense">-$${(statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            <tr class="total-row">
                                <td class="summary-label"><strong>NET PAYOUT</strong></td>
                                <td class="summary-value total-amount"><strong>$${(() => {
                                    const clientRevenue = statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0;
                                    const luxuryLodgingFee = statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.luxuryLodgingFee : res.grossAmount * 0.05), 0) || 0;
                                    const clientTaxResponsibility = statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientTaxResponsibility : 0), 0) || 0;
                                    const expenses = statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0;
                                    return (clientRevenue - Math.abs(luxuryLodgingFee) + clientTaxResponsibility - expenses).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                })()}</strong></td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>

        <div class="footer">
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
                <button onclick="window.print()" class="print-button">Print Statement</button>
            </div>
        </div>
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

        // Generate PDF-optimized HTML (simplified version of view route)
        const statementHTML = generateStatementHTML(statement, id);

        const options = {
            format: 'A4',
            border: {
                top: '0.5in',
                right: '0.5in',
                bottom: '0.5in',
                left: '0.5in'
            },
            paginationOffset: 1,
            header: {
                height: '0mm',
                contents: ''
            },
            footer: {
                height: '0mm',
                contents: ''
            },
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
        
        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="statement-${id}.pdf"`);
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
async function generateAllOwnerStatements(req, res, startDate, endDate, calculationType) {
    try {
        console.log(`🔄 Starting bulk statement generation for all owners...`);
        console.log(`   Period: ${startDate} to ${endDate}`);
        console.log(`   Calculation Type: ${calculationType}`);

        // Get all owners and all listings
        const owners = await FileDataService.getOwners();
        const listings = await FileDataService.getListings();

        console.log(`   Found ${owners.length} owners and ${listings.length} listings`);

        const results = {
            generated: [],
            skipped: [],
            errors: []
        };

        // Loop through each owner
        for (const owner of owners) {
            console.log(`\n📋 Processing owner: ${owner.name} (ID: ${owner.id})`);

            // Find properties for this owner
            const ownerProperties = listings.filter(listing => {
                // Check if this listing belongs to the current owner
                const belongsToOwner = owner.listingIds && owner.listingIds.includes(listing.id);
                return belongsToOwner && listing.isActive;
            });

            console.log(`   Found ${ownerProperties.length} properties for ${owner.name}`);

            if (ownerProperties.length === 0) {
                console.log(`   ⚠️  Skipping ${owner.name} - no properties found`);
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
                    console.log(`   📝 Generating statement for property: ${property.name} (ID: ${property.id})`);

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

                    console.log(`   📊 Found ${periodReservations.length} reservations and ${periodExpenses.length} expenses`);

                    // Skip if no activity
                    if (periodReservations.length === 0 && periodExpenses.length === 0) {
                        console.log(`   ⏭️  Skipping ${property.name} - no activity in this period`);
                        results.skipped.push({
                            ownerId: owner.id,
                            ownerName: owner.name,
                            propertyId: property.id,
                            propertyName: property.name,
                            reason: 'No activity in period'
                        });
                        continue;
                    }

                    // Calculate totals
                    const totalRevenue = periodReservations.reduce((sum, res) => sum + (res.grossAmount || 0), 0);
                    const totalExpenses = periodExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
                    const pmPercentage = owner.defaultPmPercentage || 15;
                    const pmCommission = totalRevenue * (pmPercentage / 100);
                    const techFees = 50; // $50 per property
                    const insuranceFees = 25; // $25 per property
                    const ownerPayout = totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees;

                    // Generate unique ID
                    const existingStatements = await FileDataService.getStatements();
                    const newId = FileDataService.generateId(existingStatements);

                    // Create statement object
                    const statement = {
                        id: newId,
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.name,
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
                        duplicateWarnings: expenses.duplicateWarnings || [],
                        items: [
                            ...periodReservations.map(res => ({
                                type: 'revenue',
                                description: `${res.guestName} - ${res.checkInDate} to ${res.checkOutDate}`,
                                amount: res.grossAmount,
                                date: res.checkOutDate,
                                category: 'booking'
                            })),
                            ...periodExpenses.map(exp => ({
                                type: 'expense',
                                description: exp.description,
                                amount: exp.amount,
                                date: exp.date,
                                category: exp.type || exp.category || 'expense',
                                vendor: exp.vendor,
                                listing: exp.listing
                            }))
                        ]
                    };

                    // Save statement
                    await FileDataService.saveStatement(statement);

                    console.log(`   ✅ Generated statement ${newId} for ${property.name} - Payout: $${statement.ownerPayout}`);

                    results.generated.push({
                        id: newId,
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.name,
                        ownerPayout: statement.ownerPayout,
                        totalRevenue: statement.totalRevenue,
                        reservationCount: periodReservations.length,
                        expenseCount: periodExpenses.length
                    });

                } catch (error) {
                    console.error(`   ❌ Error generating statement for ${property.name}:`, error.message);
                    results.errors.push({
                        ownerId: owner.id,
                        ownerName: owner.name,
                        propertyId: property.id,
                        propertyName: property.name,
                        error: error.message
                    });
                }
            }
        }

        console.log(`\n✅ Bulk statement generation completed:`);
        console.log(`   Generated: ${results.generated.length} statements`);
        console.log(`   Skipped: ${results.skipped.length} (no activity)`);
        console.log(`   Errors: ${results.errors.length}`);

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

function generateStatementHTML(statement, id) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Owner Statement ${id} - Luxury Lodging Host</title>
    <style>
        :root {
            --luxury-navy: #1e3a5f;
            --luxury-gold: #d4af37;
            --luxury-light-gold: #f4e7c1;
            --luxury-gray: #6b7280;
            --luxury-light-gray: #f8fafc;
            --luxury-green: #059669;
            --luxury-red: #dc2626;
            --luxury-white: #ffffff;
            --luxury-dark: #1a202c;
            --luxury-border: #e2e8f0;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Arial', sans-serif; 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 30px; 
            line-height: 1.6;
            color: var(--luxury-navy);
            background: white;
            font-size: 11px;
        }
        
        .header {
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 25px;
            color: white;
            box-shadow: 0 4px 12px rgba(30, 58, 95, 0.15);
        }
        
        .company-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
            padding-bottom: 15px;
        }
        
        .company-info h1 {
            font-size: 26px;
            font-weight: 700;
            color: white;
            margin-bottom: 8px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .contact-info {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 400;
            line-height: 1.4;
        }
        
        .logo-box {
            width: 70px;
            height: 70px;
            background: rgba(255, 255, 255, 0.15);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--luxury-gold);
            font-weight: 700;
            font-size: 12px;
            backdrop-filter: blur(10px);
        }
        
        .statement-details {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            padding: 15px 0;
        }
        
        .meta-item {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        
        .meta-label {
            font-size: 9px;
            font-weight: 600;
            color: var(--luxury-gray);
            text-transform: uppercase;
        }
        
        .meta-value {
            font-size: 11px;
            font-weight: 600;
            color: var(--luxury-navy);
        }
        
        .section-title {
            font-size: 14px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 15px;
            padding: 8px 0;
            border-bottom: 2px solid var(--luxury-gold);
            text-transform: uppercase;
        }
        
        .rental-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            font-size: 10px;
            border: 1px solid var(--luxury-border);
            margin-bottom: 20px;
            table-layout: fixed;
        }
        
        .rental-table th {
            background: var(--luxury-dark);
            color: white;
            padding: 12px 6px;
            text-align: center;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
            line-height: 1.3;
            border-right: 1px solid rgba(255,255,255,0.2);
            word-wrap: break-word;
            hyphens: auto;
        }
        
        .rental-table td {
            padding: 10px 6px;
            border-bottom: 1px solid #e5e7eb;
            border-right: 1px solid #f0f0f0;
            font-size: 10px;
            text-align: center;
            vertical-align: middle;
            line-height: 1.4;
        }
        
        /* Column widths for better layout */
        .rental-table th:nth-child(1) { width: 18%; }  /* Guest Details */
        .rental-table th:nth-child(2) { width: 9%; }   /* Check-in */
        .rental-table th:nth-child(3) { width: 9%; }   /* Check-out */
        .rental-table th:nth-child(4) { width: 10%; }  /* Base Rate */
        .rental-table th:nth-child(5) { width: 11%; }  /* Cleaning & Other Fees */
        .rental-table th:nth-child(6) { width: 9%; }   /* Platform Fees */
        .rental-table th:nth-child(7) { width: 10%; }  /* Client Revenue */
        .rental-table th:nth-child(8) { width: 11%; }  /* Luxury Lodging Fee */
        .rental-table th:nth-child(9) { width: 9%; }   /* Client Tax Responsibility */
        .rental-table th:nth-child(10) { width: 11%; } /* Client Payout */
        
        .text-cell {
            text-align: left !important;
            font-size: 7px;
            max-width: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .number-cell {
            text-align: center;
            font-size: 8px;
        }
        
        .date-cell {
            text-align: center;
            font-size: 10px;
            font-weight: 600;
        }
        
        .amount-cell {
            text-align: right;
            font-size: 10px;
            font-weight: 700;
            padding-right: 8px !important;
        }
        
        .guest-details-cell {
            text-align: left !important;
            padding: 10px 8px !important;
            max-width: none;
            overflow: hidden;
            vertical-align: middle !important;
        }
        
        .guest-name {
            font-weight: 700;
            color: var(--luxury-navy);
            font-size: 11px;
            margin-bottom: 4px;
            line-height: 1.3;
        }
        
        .guest-info {
            font-size: 9px;
            color: var(--luxury-gray);
            margin-bottom: 4px;
            line-height: 1.2;
        }
        
        .channel-badge {
            display: inline-block;
            background: var(--luxury-light-gold);
            color: var(--luxury-navy);
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .booking-cell {
            text-align: left !important;
            padding: 8px 6px !important;
        }
        
        .guest-name {
            font-weight: 700;
            color: var(--luxury-navy);
            font-size: 10px;
            margin-bottom: 2px;
        }
        
        .booking-details {
            font-size: 8px;
            color: var(--luxury-gray);
        }
        
        .channel-badge {
            display: inline-block;
            background: var(--luxury-light-gold);
            color: var(--luxury-navy);
            padding: 1px 3px;
            border-radius: 2px;
            font-size: 6px;
            font-weight: 600;
            text-transform: uppercase;
            margin-top: 1px;
        }
        
        .amount-cell-large {
            text-align: right;
            font-weight: 600;
            font-size: 10px;
        }
        
        .expense-amount { color: var(--luxury-red); }
        .revenue-amount { color: var(--luxury-navy); }
        
        .totals-row td {
            background: var(--luxury-navy);
            color: white;
            font-weight: 700;
            font-size: 10px;
            padding: 10px 4px;
            border-top: 2px solid var(--luxury-navy);
        }
        
        .payout-cell {
            background: var(--luxury-light-gold) !important;
            color: var(--luxury-navy) !important;
            font-weight: 700;
        }
        
        .expense-amount {
            color: var(--luxury-red);
        }
        
        .revenue-amount {
            color: var(--luxury-navy);
        }
        
        .payout-amount {
            color: var(--luxury-navy);
            font-weight: 700;
        }
        
        .summary-box {
            background: white;
            padding: 20px;
            border: 2px solid var(--luxury-navy);
            border-radius: 8px;
            width: 350px;
            font-size: 11px;
            margin-left: auto;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .summary-box table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .summary-box td {
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        
        .summary-box tr:last-child td {
            border-bottom: none;
        }
        
        .summary-label {
            font-weight: 600;
            color: var(--luxury-navy);
        }
        
        .summary-value {
            text-align: right;
            font-weight: 700;
        }
        
        .summary-value.revenue {
            color: #28a745;
        }
        
        .summary-value.expense {
            color: #dc3545;
        }
        
        .total-row td {
            padding-top: 12px;
            border-top: 2px solid var(--luxury-navy);
            font-size: 12px;
        }
        
        .total-amount {
            color: var(--luxury-navy);
            font-size: 14px;
        }
        
        .summary-value {
            text-align: right;
            font-weight: 600;
            color: var(--luxury-navy);
        }
        
        .summary-value.expense {
            color: var(--luxury-red);
        }
        
        .total-row td {
            border-top: 2px solid var(--luxury-navy);
            border-bottom: none;
            padding-top: 8px;
            font-size: 11px;
        }
        
        .total-amount {
            color: var(--luxury-navy) !important;
            font-size: 12px;
        }
        
        .footer {
            background: var(--luxury-light-gray);
            padding: 15px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            margin-top: 20px;
        }
        
        .generated-info {
            color: var(--luxury-gray);
            font-size: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-header">
            <div class="company-info">
                <h1>Luxury Lodging</h1>
                <div class="contact-info">
                    <span>support@luxurylodgingpm.com | +1 (813) 594-8882</span>
                </div>
            </div>
            <div class="logo-box">LOGO</div>
        </div>
        
        <div class="statement-details">
            <div class="meta-item">
                <span class="meta-label">Statement Period</span>
                <span class="meta-value">${statement.weekStartDate} - ${statement.weekEndDate}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Calculation Method</span>
                <span class="meta-value" style="color: ${statement.calculationType === 'calendar' ? '#007bff' : '#666'};">
                    ${statement.calculationType === 'calendar' ? '📅 Calendar-based (prorated)' : '📋 Check-out based'}
                </span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Generated</span>
                <span class="meta-value">${new Date().toLocaleDateString('en-US')}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Property</span>
                <span class="meta-value">${statement.propertyName || `Property ${statement.propertyId}`}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Status</span>
                <span class="meta-value">${statement.status}</span>
            </div>
        </div>
    </div>

    <div class="content">
        <h2 class="section-title">Rental Activity</h2>
        <table class="rental-table">
            <thead>
                <tr>
                    <th>Guest Details</th>
                    <th>Check-in date</th>
                    <th>Check-out date</th>
                    <th>Nights</th>
                    <th>Base Rate</th>
                    <th>Cleaning and Other Fees</th>
                    <th>Platform Fees</th>
                    <th>Revenue</th>
                    <th>PM Commission</th>
                    <th>Tax Responsibility</th>
                    <th>Gross Payout</th>
                </tr>
            </thead>
            <tbody>
                ${statement.reservations?.map(reservation => {
                    // Use detailed financial data if available, otherwise fall back to calculated values
                    const baseRate = reservation.hasDetailedFinance ? reservation.baseRate : (reservation.grossAmount * 0.85);
                    const cleaningFees = reservation.hasDetailedFinance ? reservation.cleaningAndOtherFees : (reservation.grossAmount * 0.15);
                    const platformFees = reservation.hasDetailedFinance ? reservation.platformFees : (reservation.grossAmount * 0.03);
                    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                    const luxuryFee = reservation.hasDetailedFinance ? reservation.luxuryLodgingFee : (reservation.grossAmount * (statement.pmPercentage / 100));
                    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;
                    const clientPayout = reservation.hasDetailedFinance ? reservation.clientPayout : (clientRevenue - luxuryFee - taxResponsibility);
                    
                    return `
                    <tr>
                        <td class="guest-details-cell">
                            <div class="guest-name">${reservation.guestName}</div>
                            <div class="guest-info">${statement.propertyName || 'Property'}</div>
                            <div class="channel-badge">${reservation.source}</div>
                            ${reservation.prorationNote ? 
                                `<div class="proration-info" style="font-size: 8px; color: #007bff; margin-top: 1px;">
                                    📅 ${reservation.prorationNote}
                                </div>` : ''
                            }
                        </td>
                        <td class="date-cell">${(() => {
                            const [year, month, day] = reservation.checkInDate.split('-').map(Number);
                            return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                        })()}</td>
                        <td class="date-cell">${(() => {
                            const [year, month, day] = reservation.checkOutDate.split('-').map(Number);
                            return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                        })()}</td>
                        <td class="amount-cell">$${baseRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell">$${cleaningFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell expense-amount">-$${platformFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell revenue-amount">$${clientRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell expense-amount">-$${luxuryFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell expense-amount">-$${taxResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell payout-amount">$${clientPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    `;
                }).join('') || '<tr><td colspan="10" style="text-align: center; padding: 20px; color: #666;">No reservations for this period</td></tr>'}
                <tr class="totals-row">
                    <td><strong>TOTALS</strong></td>
                    <td colspan="2"></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.baseRate : res.grossAmount * 0.85), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.cleaningAndOtherFees : res.grossAmount * 0.15), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>-$${Math.abs(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.platformFees : res.grossAmount * 0.03), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>-$${Math.abs(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.luxuryLodgingFee : res.grossAmount * 0.05), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientTaxResponsibility : 0), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell payout-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientPayout : res.hostPayoutAmount || res.grossAmount * 0.85), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                </tr>
            </tbody>
        </table>
        
        <!-- Expenses Section -->
        <div style="margin-top: 20px;">
            <h3 style="color: var(--luxury-navy); font-size: 16px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">EXPENSES</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #ddd; margin-bottom: 25px;">
                <thead>
                    <tr style="background: var(--luxury-navy); color: white;">
                        <th style="padding: 10px 8px; text-align: left; font-weight: 600; font-size: 9px;">Date</th>
                        <th style="padding: 10px 8px; text-align: left; font-weight: 600; font-size: 9px;">Description</th>
                        <th style="padding: 10px 8px; text-align: left; font-weight: 600; font-size: 9px;">Vendor</th>
                        <th style="padding: 10px 8px; text-align: left; font-weight: 600; font-size: 9px;">Property</th>
                        <th style="padding: 10px 8px; text-align: left; font-weight: 600; font-size: 9px;">Category</th>
                        <th style="padding: 10px 8px; text-align: right; font-weight: 600; font-size: 9px;">Amount</th>
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
                        <tr${isDuplicate ? ' style="background-color: #fff3cd; border-left: 3px solid #ffc107;"' : ''}>
                            <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; font-weight: 500; font-size: 9px;">
                                ${(() => {
                                    const [year, month, day] = expense.date.split('-').map(Number);
                                    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                })()}
                                ${isDuplicate ? '<br><span style="color: #856404; font-size: 7px; font-weight: 600;">⚠️ Duplicate</span>' : ''}
                            </td>
                            <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; font-size: 9px; line-height: 1.3;">${expense.description}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 9px;">${expense.vendor || '-'}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 8px;">${expense.listing || '-'}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; text-transform: capitalize; color: #666; font-size: 9px;">${expense.category}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 600; font-size: 9px;">$${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        `;
                    }).join('') || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #666; font-style: italic; font-size: 10px;">No expenses for this period</td></tr>'}
                    <tr style="background: var(--luxury-navy); color: white;">
                        <td colspan="5" style="padding: 10px 8px; font-weight: 700; border: none; font-size: 10px;"><strong>TOTAL EXPENSES</strong></td>
                        <td style="padding: 10px 8px; text-align: right; font-weight: 700; border: none; font-size: 10px;"><strong>$${(statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Summary Section -->
        <div class="summary-box" style="margin-top: 25px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: #f8f9fa; border: 2px solid var(--luxury-navy); border-radius: 8px;">
                <tr>
                    <td style="padding: 12px 16px; font-weight: 600; color: var(--luxury-navy); border-bottom: 1px solid #e9ecef;">Client Revenue</td>
                    <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #28a745; border-bottom: 1px solid #e9ecef;">$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 16px; font-weight: 600; color: var(--luxury-navy); border-bottom: 1px solid #e9ecef;">Luxury Lodging Fee</td>
                    <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #dc3545; border-bottom: 1px solid #e9ecef;">-$${Math.abs(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.luxuryLodgingFee : res.grossAmount * 0.05), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 16px; font-weight: 600; color: var(--luxury-navy); border-bottom: 1px solid #e9ecef;">Client Tax Responsibility</td>
                    <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #28a745; border-bottom: 1px solid #e9ecef;">$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientTaxResponsibility : 0), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 16px; font-weight: 600; color: var(--luxury-navy); border-bottom: 2px solid var(--luxury-navy);">Expenses and extras</td>
                    <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #dc3545; border-bottom: 2px solid var(--luxury-navy);">-$${(statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr style="background: var(--luxury-navy); color: white;">
                    <td style="padding: 16px; font-weight: 700; font-size: 14px;"><strong>STATEMENT TOTAL</strong></td>
                    <td style="padding: 16px; text-align: right; font-weight: 700; font-size: 14px;"><strong>$${(() => {
                        const clientRevenue = statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0;
                        const luxuryLodgingFee = statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.luxuryLodgingFee : res.grossAmount * 0.05), 0) || 0;
                        const clientTaxResponsibility = statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientTaxResponsibility : 0), 0) || 0;
                        const expenses = statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0;
                        return (clientRevenue - Math.abs(luxuryLodgingFee) + clientTaxResponsibility - expenses).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    })()}</strong></td>
                </tr>
            </table>
        </div>
    </div>

    <div class="footer">
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
    </div>
</body>
</html>`;
}

module.exports = router;
