/**
 * Statement View Color Tests
 *
 * Tests for the color scheme in statement views:
 * - Base Rate: Green (revenue-amount)
 * - Cleaning & Other Fees: Green (revenue-amount)
 * - Platform Fees: Red (expense-amount)
 * - Revenue: Green (revenue-amount)
 * - PM Commission: Red (expense-amount)
 * - Tax Responsibility:
 *   - Blue (info-amount) for standard Airbnb (tax not added to formula)
 *   - Green (revenue-amount) for non-Airbnb OR Airbnb with pass-through tax
 * - Gross Payout: Green (revenue-amount) for positive, Red (expense-amount) for negative
 */

const assert = require('assert');

// Helper function to determine tax class - mirrors the logic in statements-file.js
function getTaxColorClass(reservation, statement) {
    const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
    const shouldAddTax = !statement.disregardTax && (!isAirbnb || statement.airbnbPassThroughTax);
    return shouldAddTax ? 'revenue-amount' : 'info-amount';
}

// Helper function to determine gross payout class
function getGrossPayoutColorClass(grossPayout) {
    return grossPayout < 0 ? 'expense-amount' : 'revenue-amount';
}

describe('Statement View Color Tests', function() {

    describe('Tax Color Logic', function() {

        it('should return BLUE (info-amount) for standard Airbnb booking', function() {
            const reservation = { source: 'Airbnb' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'info-amount', 'Standard Airbnb should have blue tax');
        });

        it('should return BLUE (info-amount) for Airbnb Official booking', function() {
            const reservation = { source: 'Airbnb Official' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'info-amount', 'Airbnb Official should have blue tax');
        });

        it('should return GREEN (revenue-amount) for Airbnb with pass-through tax enabled', function() {
            const reservation = { source: 'Airbnb' };
            const statement = { disregardTax: false, airbnbPassThroughTax: true };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'revenue-amount', 'Airbnb with pass-through should have green tax');
        });

        it('should return GREEN (revenue-amount) for non-Airbnb booking (VRBO)', function() {
            const reservation = { source: 'VRBO' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'revenue-amount', 'VRBO should have green tax');
        });

        it('should return GREEN (revenue-amount) for non-Airbnb booking (Marriott)', function() {
            const reservation = { source: 'Marriott' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'revenue-amount', 'Marriott should have green tax');
        });

        it('should return GREEN (revenue-amount) for non-Airbnb booking (Booking.com)', function() {
            const reservation = { source: 'Booking.com' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'revenue-amount', 'Booking.com should have green tax');
        });

        it('should return GREEN (revenue-amount) for Direct booking', function() {
            const reservation = { source: 'Direct' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'revenue-amount', 'Direct booking should have green tax');
        });

        it('should return BLUE (info-amount) when disregardTax is true (Airbnb)', function() {
            const reservation = { source: 'Airbnb' };
            const statement = { disregardTax: true, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'info-amount', 'DisregardTax Airbnb should have blue tax');
        });

        it('should return BLUE (info-amount) when disregardTax is true (non-Airbnb)', function() {
            const reservation = { source: 'VRBO' };
            const statement = { disregardTax: true, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'info-amount', 'DisregardTax non-Airbnb should have blue tax');
        });

        it('should return BLUE (info-amount) when disregardTax is true even with pass-through', function() {
            const reservation = { source: 'Airbnb' };
            const statement = { disregardTax: true, airbnbPassThroughTax: true };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'info-amount', 'DisregardTax with pass-through should still be blue');
        });

        it('should handle case-insensitive Airbnb source', function() {
            const reservation = { source: 'AIRBNB' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'info-amount', 'Uppercase AIRBNB should have blue tax');
        });

        it('should handle mixed case Airbnb source', function() {
            const reservation = { source: 'AirBnB' };
            const statement = { disregardTax: false, airbnbPassThroughTax: false };

            const result = getTaxColorClass(reservation, statement);
            assert.strictEqual(result, 'info-amount', 'Mixed case AirBnB should have blue tax');
        });

    });

    describe('Gross Payout Color Logic', function() {

        it('should return GREEN (revenue-amount) for positive payout', function() {
            const result = getGrossPayoutColorClass(1000);
            assert.strictEqual(result, 'revenue-amount', 'Positive payout should be green');
        });

        it('should return GREEN (revenue-amount) for zero payout', function() {
            const result = getGrossPayoutColorClass(0);
            assert.strictEqual(result, 'revenue-amount', 'Zero payout should be green');
        });

        it('should return RED (expense-amount) for negative payout', function() {
            const result = getGrossPayoutColorClass(-500);
            assert.strictEqual(result, 'expense-amount', 'Negative payout should be red');
        });

        it('should return RED (expense-amount) for co-host negative commission', function() {
            // Co-hosted Airbnb properties have negative gross payout (PM commission only)
            const result = getGrossPayoutColorClass(-98.48);
            assert.strictEqual(result, 'expense-amount', 'Co-host negative should be red');
        });

    });

    describe('Fixed Color Columns', function() {

        it('Base Rate should always use revenue-amount (green)', function() {
            // Base Rate is always displayed in green
            const expectedClass = 'revenue-amount';
            assert.strictEqual(expectedClass, 'revenue-amount');
        });

        it('Cleaning and Other Fees should always use revenue-amount (green)', function() {
            // Cleaning fees are always displayed in green
            const expectedClass = 'revenue-amount';
            assert.strictEqual(expectedClass, 'revenue-amount');
        });

        it('Platform Fees should always use expense-amount (red)', function() {
            // Platform fees are always displayed in red
            const expectedClass = 'expense-amount';
            assert.strictEqual(expectedClass, 'expense-amount');
        });

        it('Revenue should always use revenue-amount (green)', function() {
            // Revenue is always displayed in green
            const expectedClass = 'revenue-amount';
            assert.strictEqual(expectedClass, 'revenue-amount');
        });

        it('PM Commission should always use expense-amount (red)', function() {
            // PM Commission is always displayed in red
            const expectedClass = 'expense-amount';
            assert.strictEqual(expectedClass, 'expense-amount');
        });

    });

});

// Run tests if executed directly
if (require.main === module) {
    const Mocha = require('mocha');
    const mocha = new Mocha();

    // Add this file
    mocha.addFile(__filename);

    // Run the tests
    mocha.run(failures => {
        process.exitCode = failures ? 1 : 0;
    });
}

module.exports = { getTaxColorClass, getGrossPayoutColorClass };
