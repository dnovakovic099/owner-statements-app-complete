const moment = require('moment');

class BusinessRulesService {
    constructor() {
        this.defaultTechFee = parseFloat(process.env.DEFAULT_TECH_FEE) || 50.00;
        this.defaultInsuranceFee = parseFloat(process.env.DEFAULT_INSURANCE_FEE) || 25.00;
    }

    // Calculate the Tuesday-Monday payout week for a given date
    getPayoutWeekForDate(date) {
        const momentDate = moment(date);
        
        // Find the Tuesday of the week containing this date
        // If today is Tuesday (2), use today. Otherwise, find the previous Tuesday
        const dayOfWeek = momentDate.day(); // 0=Sunday, 1=Monday, 2=Tuesday, etc.
        
        let tuesdayStart;
        if (dayOfWeek === 2) {
            // Today is Tuesday
            tuesdayStart = momentDate.clone();
        } else if (dayOfWeek > 2) {
            // We're past Tuesday this week, go back to this week's Tuesday
            tuesdayStart = momentDate.clone().day(2);
        } else {
            // We're before Tuesday (Sunday or Monday), go back to last week's Tuesday
            tuesdayStart = momentDate.clone().day(-5); // -5 = previous Tuesday
        }
        
        const mondayEnd = tuesdayStart.clone().add(6, 'days');
        
        return {
            start: tuesdayStart.format('YYYY-MM-DD'),
            end: mondayEnd.format('YYYY-MM-DD')
        };
    }

    // Check if a reservation should be included in a specific payout week
    shouldIncludeReservationInWeek(reservation, payoutWeek) {
        const checkoutDate = moment(reservation.checkOutDate);
        const weekStart = moment(payoutWeek.start);
        const weekEnd = moment(payoutWeek.end);
        
        // Include if checkout date falls within the payout week (Tuesday to Monday)
        return checkoutDate.isBetween(weekStart, weekEnd, 'day', '[]');
    }

    // Calculate PM commission for a property/owner
    calculatePMCommission(grossAmount, property, owner) {
        // Use property-specific percentage if set, otherwise use owner default
        const pmPercentage = property.pmPercentage || owner.defaultPmPercentage || 15.00;
        const commission = (grossAmount * pmPercentage) / 100;
        
        return {
            percentage: pmPercentage,
            amount: Math.round(commission * 100) / 100 // Round to 2 decimal places
        };
    }

    // Handle co-hosting arrangements
    applyCoHostingRules(reservation, property) {
        if (!property.coHosting || !property.coHosting.enabled) {
            return reservation;
        }

        const coHostingRules = property.coHosting;
        let adjustedAmount = reservation.grossAmount;

        // Apply co-hosting percentage split
        if (coHostingRules.percentage) {
            adjustedAmount = reservation.grossAmount * (coHostingRules.percentage / 100);
        }

        // Apply fixed fee deduction
        if (coHostingRules.fixedFee) {
            adjustedAmount -= coHostingRules.fixedFee;
        }

        return {
            ...reservation,
            originalGrossAmount: reservation.grossAmount,
            grossAmount: Math.max(0, adjustedAmount), // Ensure not negative
            coHostingApplied: true,
            coHostingDetails: coHostingRules
        };
    }

    // Handle prorated long stays
    applyProrationRules(reservation, property) {
        if (!property.specialRules || !property.specialRules.prorationEnabled) {
            return reservation;
        }

        const rules = property.specialRules;
        const nights = reservation.nights;

        // Check if this qualifies for proration (e.g., stays over 28 nights)
        const minNightsForProration = rules.minNightsForProration || 28;
        
        if (nights >= minNightsForProration) {
            let proratedAmount = reservation.grossAmount;

            // Apply proration percentage
            if (rules.prorationPercentage) {
                proratedAmount = reservation.grossAmount * (rules.prorationPercentage / 100);
            }

            // Apply maximum amount cap
            if (rules.maxProratedAmount && proratedAmount > rules.maxProratedAmount) {
                proratedAmount = rules.maxProratedAmount;
            }

            return {
                ...reservation,
                originalGrossAmount: reservation.grossAmount,
                proratedAmount: Math.round(proratedAmount * 100) / 100,
                isProrated: true,
                prorationReason: `Long stay (${nights} nights) - ${rules.prorationPercentage}% applied`
            };
        }

        return reservation;
    }

    // Calculate tech fees for a property in a given period
    calculateTechFees(property, owner, payoutWeek) {
        // Check if tech fees are enabled for this owner/property
        if (!owner.techFeeEnabled) {
            return 0;
        }

        // Use property-specific tech fee if set, otherwise use default
        const monthlyTechFee = property.techFeeAmount || this.defaultTechFee;

        // For weekly payouts, calculate weekly portion (monthly / 4.33 weeks per month)
        const weeklyTechFee = monthlyTechFee / 4.33;

        return Math.round(weeklyTechFee * 100) / 100;
    }

    // Calculate insurance fees for a property in a given period
    calculateInsuranceFees(property, owner, payoutWeek) {
        // Check if insurance fees are enabled for this owner/property
        if (!owner.insuranceFeeEnabled) {
            return 0;
        }

        // Use property-specific insurance fee if set, otherwise use default
        const monthlyInsuranceFee = property.insuranceFeeAmount || this.defaultInsuranceFee;

        // For weekly payouts, calculate weekly portion
        const weeklyInsuranceFee = monthlyInsuranceFee / 4.33;

        return Math.round(weeklyInsuranceFee * 100) / 100;
    }

    // Process all reservations for a property in a payout week
    processReservationsForWeek(reservations, property, owner, payoutWeek) {
        const processedReservations = [];
        let totalRevenue = 0;

        for (let reservation of reservations) {
            // Check if this reservation should be included in this week
            if (!this.shouldIncludeReservationInWeek(reservation, payoutWeek)) {
                continue;
            }

            // Skip if already processed (to avoid double-counting)
            if (reservation.isProcessed) {
                continue;
            }

            // Apply co-hosting rules
            let processedReservation = this.applyCoHostingRules(reservation, property);

            // Apply proration rules
            processedReservation = this.applyProrationRules(processedReservation, property);

            // Use prorated amount if available, otherwise use gross amount
            const revenueAmount = processedReservation.proratedAmount || processedReservation.grossAmount;
            totalRevenue += revenueAmount;

            processedReservations.push(processedReservation);
        }

        return {
            reservations: processedReservations,
            totalRevenue: Math.round(totalRevenue * 100) / 100
        };
    }

    // Calculate final owner payout
    calculateOwnerPayout(totalRevenue, totalExpenses, pmCommission, techFees, insuranceFees, adjustments = 0) {
        const ownerPayout = totalRevenue - totalExpenses - pmCommission - techFees - insuranceFees - adjustments;
        return Math.max(0, Math.round(ownerPayout * 100) / 100); // Ensure not negative
    }

    // Generate complete statement calculation
    generateStatementCalculation(reservations, expenses, property, owner, payoutWeek) {
        // Process reservations for this week
        const processedReservations = this.processReservationsForWeek(reservations, property, owner, payoutWeek);

        // Calculate total expenses for this week
        const weekExpenses = expenses.filter(expense => {
            const expenseDate = moment(expense.date);
            const weekStart = moment(payoutWeek.start);
            const weekEnd = moment(payoutWeek.end);
            return expenseDate.isBetween(weekStart, weekEnd, 'day', '[]');
        });

        const totalExpenses = weekExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

        // Calculate PM commission
        const pmCommission = this.calculatePMCommission(processedReservations.totalRevenue, property, owner);

        // Calculate fees
        const techFees = this.calculateTechFees(property, owner, payoutWeek);
        const insuranceFees = this.calculateInsuranceFees(property, owner, payoutWeek);

        // Calculate final payout
        const ownerPayout = this.calculateOwnerPayout(
            processedReservations.totalRevenue,
            totalExpenses,
            pmCommission.amount,
            techFees,
            insuranceFees
        );

        return {
            payoutWeek,
            reservations: processedReservations.reservations,
            expenses: weekExpenses,
            totals: {
                totalRevenue: processedReservations.totalRevenue,
                totalExpenses: Math.round(totalExpenses * 100) / 100,
                pmCommission: pmCommission.amount,
                pmPercentage: pmCommission.percentage,
                techFees,
                insuranceFees,
                adjustments: 0, // Will be added manually
                ownerPayout
            }
        };
    }

    // Get the current payout week (this week's Tuesday-Monday cycle)
    getCurrentPayoutWeek() {
        return this.getPayoutWeekForDate(new Date());
    }

    // Get the previous payout week
    getPreviousPayoutWeek() {
        const lastWeek = moment().subtract(1, 'week');
        return this.getPayoutWeekForDate(lastWeek.toDate());
    }

    // Validate if a date range is a valid payout week (Tuesday to Monday)
    isValidPayoutWeek(startDate, endDate) {
        const start = moment(startDate);
        const end = moment(endDate);
        
        // Check if start is Tuesday (day 2)
        if (start.day() !== 2) {
            return false;
        }
        
        // Check if end is Monday and exactly 6 days after start
        if (end.day() !== 1 || !end.isSame(start.clone().add(6, 'days'), 'day')) {
            return false;
        }
        
        return true;
    }
}

module.exports = new BusinessRulesService();
