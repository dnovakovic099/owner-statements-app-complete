/**
 * Statement Calculation Service
 * Shared calculation logic for both manual and auto-generated statements
 * This ensures consistent financial calculations across the application
 */

const logger = require('../utils/logger');

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
        const { reservations, expenses, listingInfoMap, propertyIds, startDate, endDate, calculationType, priorStatements } = options;

        // Input validation
        if (!propertyIds || propertyIds.length === 0) {
            return { periodReservations: [], filteredExpenses: [], llCoverExpenses: [], totalRevenue: 0, pmCommission: 0, ownerPayout: 0, totalExpenses: 0, totalUpsells: 0 };
        }
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            throw new Error(`calculateStatementFinancials: startDate (${startDate}) must not be after endDate (${endDate})`);
        }
        const missingListings = propertyIds.filter(id => !listingInfoMap[id]);
        if (missingListings.length > 0) {
            logger.warn(`[CALC] listingInfoMap missing entries for propertyIds: ${missingListings.join(', ')}`);
        }

        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);

        // Filter reservations by date and status
        let periodReservations = this.filterReservations(reservations, propertyIds, periodStart, periodEnd, calculationType, endDate);

        // Drop reservations already billed on a prior finalized/sent/paid statement so the
        // same booking is not paid twice when its checkout falls on a shared period boundary.
        // Only applies to checkout-based statements: in calendar mode a reservation is
        // prorated by nights and legitimately appears across multiple overlapping periods.
        let priorReservationDuplicateWarnings = [];
        if (calculationType !== 'calendar' && priorStatements && priorStatements.length > 0) {
            const signatureMap = this.buildPriorReservationSignatures(priorStatements);
            const { kept, duplicateWarnings } = this.excludePriorStatementReservations(periodReservations, signatureMap);
            periodReservations = kept;
            priorReservationDuplicateWarnings = duplicateWarnings;
            if (duplicateWarnings.length > 0) {
                logger.info(`[CALC] Excluded ${duplicateWarnings.length} reservation(s) already present on prior statements`);
            }
        }

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
            duplicateWarnings: [...(duplicateWarnings || []), ...priorReservationDuplicateWarnings],
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
    filterReservations(reservations, propertyIds, periodStart, periodEnd, calculationType, endDate) {
        const parsedPropertyIds = propertyIds.map(id => parseInt(id));

        return reservations.filter(res => {
            // Check property ID is in our list
            if (!parsedPropertyIds.includes(parseInt(res.propertyId))) {
                return false;
            }

            // Check date match based on calculation type
            if (calculationType !== 'calendar') {
                // For checkout-based, filter by checkout date
                const checkoutDate = new Date(res.checkOutDate);
                if (checkoutDate < periodStart || !this._isCheckoutInPeriod(res.checkOutDate, endDate)) {
                    return false;
                }
            }
            // Calendar-based reservations are already date-filtered and prorated upstream,
            // but still check status as defense in depth

            // Include confirmed/accepted plus blocked entries (owner stays, off-boarding, unavailable blocks)
            const allowedStatuses = ['confirmed', 'accepted', 'blocked'];
            return allowedStatuses.includes(res.status);
        }).sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate));
    }

    /**
     * Check if expense is LL Cover related
     */
    isLlCoverExpense(exp) {
        // Check the explicit llCover flag first
        if (exp.llCover === 1 || exp.llCover === true) return true;

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

        // Count reservations for properties with passthrough (exclude manual blocks — no cleaning expected)
        const passThroughReservations = periodReservations.filter(res =>
            res.status !== 'blocked' && propertiesWithPassThrough.includes(parseInt(res.propertyId))
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

            // Commission base excludes guest-paid cleaning fee when the listing is flagged
            const resPmFee = this._getEffectivePmFee(listing, res.createdAt);
            const commissionBase = this._getCommissionBase(res, listing, revenue);
            pmCommission += commissionBase * (resPmFee / 100);
        }

        const avgPmPercentage = totalRevenue > 0 ? (pmCommission / totalRevenue) * 100 : 15;

        return { totalRevenue, pmCommission, avgPmPercentage };
    }

    /**
     * Compute the revenue base that the PM commission percentage is applied to.
     * When the listing has excludeCleaningFromCommission set, subtract the guest-paid
     * cleaning fee (already included in revenue via Guest Fees) from the base.
     */
    _getCommissionBase(res, listing, revenue) {
        if (!listing || !listing.excludeCleaningFromCommission) {
            return revenue;
        }
        const cleaningFee = parseFloat(res.cleaningFee) || 0;
        if (cleaningFee <= 0) {
            return revenue;
        }
        // Never let the base go negative (degenerate case)
        return Math.max(0, revenue - cleaningFee);
    }

    /**
     * Boundary convention: checkout exactly on the end date IS considered "in period".
     * This is used consistently by both filterReservations and calculateGrossPayoutSum.
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
            // Commission base optionally excludes the guest-paid cleaning fee
            const commissionBase = this._getCommissionBase(res, resListingInfo, clientRevenue);
            const luxuryFee = commissionBase * (resPmPercentage / 100);
            // If waiver is active, don't deduct PM fee
            const luxuryFeeToDeduct = isWaiverActive ? 0 : luxuryFee;
            const taxResponsibility = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;

            // Reverse-engineer actual cleaning fee from guest-paid amount
            // Formula: actualCleaningFee = (guestPaid / (1 + PM%))
            // In calendar mode, only charge cleaning if checkout is within the period
            const checkoutInPeriod = calculationType !== 'calendar' || this._isCheckoutInPeriod(res.checkOutDate, endDate);
            const guestPaidCleaningFee = res.cleaningFee ?? resListingInfo.cleaningFee ?? 0;
            const cleaningFeeForPassThrough = resCleaningFeePassThrough && guestPaidCleaningFee > 0 && checkoutInPeriod
                ? Math.round((guestPaidCleaningFee / (1 + resPmPercentage / 100)) * 100) / 100
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

    /**
     * Build a signature map of reservations from prior statements. Used to skip any
     * reservation (matched by hostifyId/id, with a property+dates+guest fallback) that
     * was already billed on a previously finalized/sent/paid statement.
     */
    buildPriorReservationSignatures(priorStatements) {
        const signatureMap = new Map();
        for (const stmt of priorStatements || []) {
            const period = `${stmt.weekStartDate} to ${stmt.weekEndDate}`;
            const reservations = stmt.reservations || [];
            for (const res of reservations) {
                const entry = { statementId: stmt.id, period, propertyName: stmt.propertyName };
                const primaryId = res.hostifyId ?? res.id;
                if (primaryId !== undefined && primaryId !== null && primaryId !== '') {
                    const key = `id:${primaryId}`;
                    if (!signatureMap.has(key)) signatureMap.set(key, entry);
                }
                const propertyId = res.propertyId ?? '';
                const checkIn = res.checkInDate || '';
                const checkOut = res.checkOutDate || '';
                const guest = (res.guestName || '').trim().toLowerCase();
                if (propertyId && checkIn && checkOut) {
                    const fallbackKey = `fallback:${propertyId}|${checkIn}|${checkOut}|${guest}`;
                    if (!signatureMap.has(fallbackKey)) signatureMap.set(fallbackKey, entry);
                }
            }
        }
        return signatureMap;
    }

    /**
     * Match a reservation against the prior-statement signature map.
     * Returns match info ({ statementId, period, propertyName }) or null.
     */
    matchReservationToPrior(res, signatureMap) {
        if (!signatureMap || signatureMap.size === 0) return null;
        const primaryId = res.hostifyId ?? res.id;
        if (primaryId !== undefined && primaryId !== null && primaryId !== '') {
            const key = `id:${primaryId}`;
            if (signatureMap.has(key)) return signatureMap.get(key);
        }
        const propertyId = res.propertyId ?? '';
        const checkIn = res.checkInDate || '';
        const checkOut = res.checkOutDate || '';
        const guest = (res.guestName || '').trim().toLowerCase();
        if (propertyId && checkIn && checkOut) {
            const fallbackKey = `fallback:${propertyId}|${checkIn}|${checkOut}|${guest}`;
            if (signatureMap.has(fallbackKey)) return signatureMap.get(fallbackKey);
        }
        return null;
    }

    /**
     * Split a list of reservations into kept vs. prior-statement duplicates.
     * Returns { kept, duplicateWarnings } where duplicateWarnings is shaped to match
     * the expense-side cross-statement duplicate warnings.
     */
    excludePriorStatementReservations(reservations, signatureMap) {
        const kept = [];
        const duplicateWarnings = [];
        if (!reservations || reservations.length === 0) {
            return { kept, duplicateWarnings };
        }
        for (const res of reservations) {
            const match = this.matchReservationToPrior(res, signatureMap);
            if (match) {
                duplicateWarnings.push({
                    type: 'prior_statement_reservation',
                    reservationId: res.hostifyId ?? res.id ?? null,
                    guestName: res.guestName || null,
                    checkInDate: res.checkInDate || null,
                    checkOutDate: res.checkOutDate || null,
                    propertyId: res.propertyId ?? null,
                    priorStatementId: match.statementId,
                    priorPeriod: match.period
                });
            } else {
                kept.push(res);
            }
        }
        return { kept, duplicateWarnings };
    }
}

const instance = new StatementCalculationService();

// Export the helper as a standalone function so routes can use it directly
instance.getEffectivePmFee = instance._getEffectivePmFee.bind(instance);

module.exports = instance;
