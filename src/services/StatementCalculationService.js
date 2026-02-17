/**
 * Statement Calculation Service
 * Shared calculation logic for both manual and auto-generated statements
 * This ensures consistent financial calculations across the application
 */

class StatementCalculationService {
    /**
     * Calculate all financials for a statement
     * @param {Object} options - Calculation options
     * @param {Array} options.reservations - Array of reservations
     * @param {Array} options.expenses - Array of expenses
     * @param {Object} options.listingInfoMap - Map of listing ID to listing info
     * @param {Array} options.propertyIds - Array of property IDs
     * @param {string} options.startDate - Start date (YYYY-MM-DD)
     * @param {string} options.endDate - End date (YYYY-MM-DD)
     * @param {string} options.calculationType - 'checkout' or 'calendar'
     * @returns {Object} Calculated financials
     */
    calculateStatementFinancials(options) {
        const { reservations, expenses, listingInfoMap, propertyIds, startDate, endDate, calculationType } = options;

        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        // Filter reservations by date and status
        const periodReservations = this.filterReservations(reservations, propertyIds, periodStart, periodEnd, calculationType);

        // Process expenses - separate LL Cover, upsells, and regular expenses
        const { filteredExpenses, llCoverExpenses, totalExpenses, totalUpsells, duplicateWarnings } =
            this.processExpenses(expenses, propertyIds, periodStart, periodEnd, listingInfoMap, periodReservations);

        // Check cleaning mismatch
        const cleaningMismatchWarning = this.checkCleaningMismatch(periodReservations, filteredExpenses, propertyIds, listingInfoMap);

        // Calculate totals
        const { totalRevenue, pmCommission, avgPmPercentage } =
            this.calculateRevenueAndCommission(periodReservations, listingInfoMap);

        // Calculate fees
        const propertyCount = propertyIds.length;
        const techFees = propertyCount * 50;
        const insuranceFees = propertyCount * 25;

        // Calculate cleaning fees for pass-through
        const totalCleaningFee = this.calculateCleaningFees(periodReservations, listingInfoMap, calculationType, endDate);

        // Calculate owner payout using per-reservation logic
        const grossPayoutSum = this.calculateGrossPayoutSum(periodReservations, listingInfoMap, endDate, calculationType);
        const ownerPayout = grossPayoutSum + totalUpsells - totalExpenses;

        return {
            periodReservations,
            filteredExpenses,
            llCoverExpenses,
            duplicateWarnings,
            cleaningMismatchWarning,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            totalUpsells: Math.round(totalUpsells * 100) / 100,
            pmCommission: Math.round(pmCommission * 100) / 100,
            pmPercentage: Math.round(avgPmPercentage * 100) / 100,
            techFees: Math.round(techFees * 100) / 100,
            insuranceFees: Math.round(insuranceFees * 100) / 100,
            totalCleaningFee: Math.round(totalCleaningFee * 100) / 100,
            ownerPayout: Math.round(ownerPayout * 100) / 100,
            propertyCount
        };
    }

    /**
     * Filter reservations by date, property, and status
     */
    filterReservations(reservations, propertyIds, periodStart, periodEnd, calculationType) {
        const parsedPropertyIds = propertyIds.map(id => parseInt(id));

        return reservations.filter(res => {
            // Check property ID is in our list
            if (!parsedPropertyIds.includes(parseInt(res.propertyId))) {
                return false;
            }

            // Check date match based on calculation type
            if (calculationType === 'calendar') {
                // For calendar-based, reservations are already filtered and prorated
                return true;
            } else {
                // For checkout-based, filter by checkout date
                const checkoutDate = new Date(res.checkOutDate);
                if (checkoutDate < periodStart || checkoutDate > periodEnd) {
                    return false;
                }
            }

            // Only include confirmed/accepted status reservations
            const allowedStatuses = ['confirmed', 'accepted'];
            return allowedStatuses.includes(res.status);
        }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));
    }

    /**
     * Check if expense is LL Cover related
     */
    isLlCoverExpense(exp) {
        const description = (exp.description || '').toLowerCase();
        const vendor = (exp.vendor || '').toLowerCase();
        const category = (exp.category || '').toLowerCase();

        return description.includes('ll cover') ||
               description.includes('llcover') ||
               vendor.includes('ll cover') ||
               vendor.includes('llcover') ||
               category.includes('ll cover') ||
               category.includes('llcover');
    }

    /**
     * Process expenses - filter, categorize, and calculate totals
     * OPTIMIZED: Single-pass categorization instead of multiple filter operations
     */
    processExpenses(expenses, propertyIds, periodStart, periodEnd, listingInfoMap, periodReservations) {
        const parsedPropertyIds = new Set(propertyIds.map(id => parseInt(id)));
        const duplicateWarnings = expenses.duplicateWarnings || [];

        // Single-pass categorization of all expenses
        const llCoverExpenses = [];
        const filteredExpenses = [];
        let totalExpenses = 0;
        let totalUpsells = 0;

        for (const exp of expenses) {
            // Check property filter
            if (exp.propertyId !== null && !parsedPropertyIds.has(parseInt(exp.propertyId))) {
                continue;
            }

            // Check date filter
            const expenseDate = new Date(exp.date);
            if (expenseDate < periodStart || expenseDate > periodEnd) {
                continue;
            }

            // Check if LL Cover expense
            if (this.isLlCoverExpense(exp)) {
                llCoverExpenses.push(exp);
                continue;
            }

            // Check if cleaning or supplies expense
            const category = (exp.category || '').toLowerCase();
            const type = (exp.type || '').toLowerCase();
            const description = (exp.description || '').toLowerCase();
            const isCleaningOrSupplies = category.includes('cleaning') || type.includes('cleaning') || description.includes('cleaning') ||
                category.includes('supplies') || type.includes('supplies') || description.includes('supplies');

            // Skip cleaning and supplies expenses for properties with cleaningFeePassThrough enabled
            const propId = exp.propertyId ? parseInt(exp.propertyId) : null;
            const hasCleaningPassThrough = propId && listingInfoMap[propId]?.cleaningFeePassThrough;
            if (isCleaningOrSupplies && hasCleaningPassThrough) {
                continue;
            }

            // Add to filtered expenses and calculate totals
            filteredExpenses.push(exp);

            const amount = parseFloat(exp.amount) || 0;
            const isUpsell = amount > 0 ||
                type === 'upsell' ||
                category === 'upsell';

            if (isUpsell) {
                totalUpsells += amount;
            } else {
                totalExpenses += Math.abs(amount);
            }
        }

        return {
            filteredExpenses,
            llCoverExpenses,
            totalExpenses,
            totalUpsells,
            duplicateWarnings
        };
    }

    /**
     * Check for cleaning expense mismatch
     */
    checkCleaningMismatch(periodReservations, filteredExpenses, propertyIds, listingInfoMap) {
        const parsedPropertyIds = propertyIds.map(id => parseInt(id));
        const propertiesWithPassThrough = parsedPropertyIds.filter(propId => listingInfoMap[propId]?.cleaningFeePassThrough);

        if (propertiesWithPassThrough.length === 0) {
            return null;
        }

        // Count reservations for properties with passthrough
        const passThroughReservations = periodReservations.filter(res =>
            propertiesWithPassThrough.includes(parseInt(res.propertyId))
        );

        // Identify cleaning expenses
        const cleaningExpenses = filteredExpenses.filter(exp => {
            const category = (exp.category || '').toLowerCase();
            const type = (exp.type || '').toLowerCase();
            const description = (exp.description || '').toLowerCase();
            return category.includes('cleaning') || type.includes('cleaning') || description.includes('cleaning');
        });

        // Count cleaning expenses for properties with passthrough
        const passThroughCleaningExpenses = cleaningExpenses.filter(exp =>
            exp.propertyId && propertiesWithPassThrough.includes(parseInt(exp.propertyId))
        );

        if (passThroughReservations.length > 0 && passThroughCleaningExpenses.length !== passThroughReservations.length) {
            return {
                type: 'cleaning_mismatch',
                message: `Cleaning expense count (${passThroughCleaningExpenses.length}) does not match reservation count (${passThroughReservations.length})`,
                reservationCount: passThroughReservations.length,
                cleaningExpenseCount: passThroughCleaningExpenses.length,
                difference: passThroughReservations.length - passThroughCleaningExpenses.length
            };
        }

        return null;
    }

    /**
     * Calculate total revenue and PM commission
     */
    calculateRevenueAndCommission(periodReservations, listingInfoMap) {
        let totalRevenue = 0;
        let pmCommission = 0;

        for (const res of periodReservations) {
            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const listing = listingInfoMap[res.propertyId] || {};
            const isCohostForProperty = listing.isCohostOnAirbnb || false;

            // Exclude Airbnb revenue for co-hosted properties
            if (isAirbnb && isCohostForProperty) {
                continue;
            }

            // Use clientRevenue (prorated) for calendar-based statements
            const revenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            totalRevenue += revenue;

            // Calculate PM commission
            const resPmFee = this._getEffectivePmFee(listing, res.createdAt);
            pmCommission += revenue * (resPmFee / 100);
        }

        const avgPmPercentage = totalRevenue > 0 ? (pmCommission / totalRevenue) * 100 : 15;

        return { totalRevenue, pmCommission, avgPmPercentage };
    }

    /**
     * Check if a reservation's checkout date falls within the statement period
     */
    _isCheckoutInPeriod(checkOutDate, endDate) {
        if (!checkOutDate || !endDate) return true;
        const checkout = new Date(checkOutDate);
        const periodEnd = new Date(endDate);
        // Checkout is in period if it's on or before the end date
        return checkout <= periodEnd;
    }

    /**
     * Calculate cleaning fees for pass-through properties
     */
    calculateCleaningFees(periodReservations, listingInfoMap, calculationType, endDate) {
        let totalCleaningFee = 0;

        for (const res of periodReservations) {
            const listing = listingInfoMap[res.propertyId] || {};
            if (listing.cleaningFeePassThrough) {
                // In calendar mode, only include cleaning fee if checkout is within the period
                if (calculationType === 'calendar' && !this._isCheckoutInPeriod(res.checkOutDate, endDate)) {
                    continue;
                }
                totalCleaningFee += parseFloat(res.cleaningFee) || 0;
            }
        }

        return totalCleaningFee;
    }

    /**
     * Calculate gross payout sum using per-reservation logic
     * This matches the PDF view calculation exactly
     */
    calculateGrossPayoutSum(periodReservations, listingInfoMap, endDate, calculationType) {
        let grossPayoutSum = 0;

        for (const res of periodReservations) {
            const resListingInfo = listingInfoMap[res.propertyId] || {};
            const resPmPercentage = this._getEffectivePmFee(resListingInfo, res.createdAt);
            const resDisregardTax = resListingInfo.disregardTax || false;
            const resAirbnbPassThroughTax = resListingInfo.airbnbPassThroughTax || false;
            const resIsCohostOnAirbnb = resListingInfo.isCohostOnAirbnb || false;
            const resCleaningFeePassThrough = resListingInfo.cleaningFeePassThrough || false;
            const resWaiveCommission = resListingInfo.waiveCommission || false;
            const resWaiveCommissionUntil = resListingInfo.waiveCommissionUntil || null;

            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
            const isCohostAirbnb = isAirbnb && resIsCohostOnAirbnb;

            // Check if PM commission waiver is active
            const isWaiverActive = (() => {
                if (!resWaiveCommission) return false;
                if (!resWaiveCommissionUntil) return true; // Indefinite waiver
                const waiverEnd = new Date(resWaiveCommissionUntil + 'T23:59:59');
                const stmtEnd = new Date(endDate + 'T00:00:00');
                return stmtEnd <= waiverEnd;
            })();

            const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : (res.grossAmount || 0);
            const luxuryFee = clientRevenue * (resPmPercentage / 100);
            // If waiver is active, don't deduct PM fee
            const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;
            const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;

            // Reverse-engineer actual cleaning fee from guest-paid amount
            // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
            // In calendar mode, only charge cleaning if checkout is within the period
            const checkoutInPeriod = calculationType !== 'calendar' || this._isCheckoutInPeriod(res.checkOutDate, endDate);
            const guestPaidCleaningFee = res.cleaningFee ?? resListingInfo.cleaningFee ?? 0;
            const cleaningFeeForPassThrough = resCleaningFeePassThrough && guestPaidCleaningFee > 0 && checkoutInPeriod
                ? Math.ceil((guestPaidCleaningFee / (1 + resPmPercentage / 100)) / 5) * 5
                : 0;

            const shouldAddTax = !resDisregardTax && (!isAirbnb || resAirbnbPassThroughTax);

            let grossPayout;
            if (isCohostAirbnb) {
                grossPayout = -luxuryFeeToDeduct - cleaningFeeForPassThrough;
            } else if (shouldAddTax) {
                grossPayout = clientRevenue - luxuryFeeToDeduct + taxResponsibility - cleaningFeeForPassThrough;
            } else {
                grossPayout = clientRevenue - luxuryFeeToDeduct - cleaningFeeForPassThrough;
            }
            grossPayoutSum += grossPayout;
        }

        return grossPayoutSum;
    }

    /**
     * Determine the effective PM fee for a reservation based on the listing's
     * new-PM-fee transition settings and the reservation's created_at date.
     */
    _getEffectivePmFee(listingInfo, reservationCreatedAt) {
        const baseFee = listingInfo.pmFeePercentage ?? 15;
        if (!listingInfo.newPmFeeEnabled || !listingInfo.newPmFeeStartDate || listingInfo.newPmFeePercentage == null) {
            return baseFee;
        }
        if (!reservationCreatedAt) return baseFee;
        const createdDate = new Date(reservationCreatedAt);
        const startDate = new Date(listingInfo.newPmFeeStartDate);
        return createdDate >= startDate ? parseFloat(listingInfo.newPmFeePercentage) : baseFee;
    }

    /**
     * Build internal notes from listings
     */
    buildInternalNotes(listings) {
        const notesArray = [];
        for (const listing of listings) {
            if (listing.internalNotes) {
                const displayName = listing.nickname || listing.displayName || listing.name;
                notesArray.push(`[${displayName}]: ${listing.internalNotes}`);
            }
        }
        return notesArray.length > 0 ? notesArray.join('\n\n') : null;
    }
}

const instance = new StatementCalculationService();

// Export the helper as a standalone function so routes can use it directly
instance.getEffectivePmFee = instance._getEffectivePmFee.bind(instance);

module.exports = instance;
