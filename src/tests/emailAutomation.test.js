/**
 * Email Automation Test Suite
 *
 * Tests for:
 * - Email templates (Weekly, Bi-Weekly, Monthly)
 * - Negative balance guardrail
 * - Frequency tag detection
 * - Email sending logic
 */

const assert = require('assert');

console.log('\n' + '='.repeat(60));
console.log('EMAIL AUTOMATION TEST SUITE');
console.log('='.repeat(60) + '\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        passedTests++;
    } catch (error) {
        console.log(`FAIL: ${name}`);
        console.log(`   Error: ${error.message}`);
        failedTests++;
    }
}

// ============================================================================
// MOCK EMAIL SERVICE FUNCTIONS (mirrors EmailService logic)
// ============================================================================

function checkNegativeBalanceGuardrail(statement) {
    const ownerPayout = parseFloat(statement.ownerPayout) || 0;

    if (ownerPayout < 0) {
        return {
            canSend: false,
            reason: 'NEGATIVE_BALANCE',
            message: `Statement has negative balance ($${ownerPayout.toFixed(2)}). Flagged for manual review.`,
            ownerPayout
        };
    }

    return {
        canSend: true,
        reason: 'POSITIVE_BALANCE',
        message: 'Statement has positive balance. OK to send.',
        ownerPayout
    };
}

function getFrequencyFromTags(tags) {
    const tagArray = Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim());

    const frequencyTags = ['Weekly', 'Bi-Weekly', 'Monthly'];

    for (const tag of tagArray) {
        const normalizedTag = tag.trim();
        for (const freq of frequencyTags) {
            if (normalizedTag.toLowerCase() === freq.toLowerCase()) {
                return freq;
            }
        }
    }

    return 'Monthly'; // Default frequency
}

function getEmailTemplate(frequencyTag, data) {
    const { ownerName, propertyName, periodStart, periodEnd, ownerPayout, companyName } = data;

    const templates = {
        'Weekly': {
            subject: `Weekly Owner Statement - ${propertyName} (${periodStart} to ${periodEnd})`,
            color: '#2563eb' // Blue
        },
        'Bi-Weekly': {
            subject: `Bi-Weekly Owner Statement - ${propertyName} (${periodStart} to ${periodEnd})`,
            color: '#7c3aed' // Purple
        },
        'Monthly': {
            subject: `Monthly Owner Statement - ${propertyName} (${periodStart} to ${periodEnd})`,
            color: '#059669' // Green
        }
    };

    return templates[frequencyTag] || templates['Monthly'];
}

function validateEmailAddress(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function canSendEmail(statement, recipientEmail, smtpConfigured) {
    const errors = [];

    if (!smtpConfigured) {
        errors.push('SMTP not configured');
    }

    if (!recipientEmail) {
        errors.push('No recipient email');
    } else if (!validateEmailAddress(recipientEmail)) {
        errors.push('Invalid email format');
    }

    if (!statement) {
        errors.push('No statement provided');
    }

    const guardrail = checkNegativeBalanceGuardrail(statement || {});
    if (!guardrail.canSend) {
        errors.push('Negative balance');
    }

    return {
        canSend: errors.length === 0,
        errors
    };
}

// ============================================================================
// TEST GROUP 1: Negative Balance Guardrail (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 1: Negative Balance Guardrail (20 tests) ---\n');

test('1.1 Positive payout $1000 - can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: 1000 });
    assert.strictEqual(result.canSend, true);
    assert.strictEqual(result.reason, 'POSITIVE_BALANCE');
});

test('1.2 Positive payout $0.01 - can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: 0.01 });
    assert.strictEqual(result.canSend, true);
});

test('1.3 Zero payout $0 - can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: 0 });
    assert.strictEqual(result.canSend, true);
});

test('1.4 Negative payout -$1 - blocked', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -1 });
    assert.strictEqual(result.canSend, false);
    assert.strictEqual(result.reason, 'NEGATIVE_BALANCE');
});

test('1.5 Negative payout -$0.01 - blocked', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -0.01 });
    assert.strictEqual(result.canSend, false);
});

test('1.6 Negative payout -$500 - blocked', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -500 });
    assert.strictEqual(result.canSend, false);
    assert.strictEqual(result.ownerPayout, -500);
});

test('1.7 Large positive $99999 - can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: 99999 });
    assert.strictEqual(result.canSend, true);
});

test('1.8 Large negative -$99999 - blocked', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -99999 });
    assert.strictEqual(result.canSend, false);
});

test('1.9 String payout "500" - can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: "500" });
    assert.strictEqual(result.canSend, true);
});

test('1.10 String negative "-500" - blocked', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: "-500" });
    assert.strictEqual(result.canSend, false);
});

test('1.11 Null payout - treated as 0, can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: null });
    assert.strictEqual(result.canSend, true);
    assert.strictEqual(result.ownerPayout, 0);
});

test('1.12 Undefined payout - treated as 0, can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: undefined });
    assert.strictEqual(result.canSend, true);
});

test('1.13 Empty statement object - treated as 0, can send', () => {
    const result = checkNegativeBalanceGuardrail({});
    assert.strictEqual(result.canSend, true);
});

test('1.14 Payout with decimal places $123.45 - can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: 123.45 });
    assert.strictEqual(result.canSend, true);
});

test('1.15 Negative payout -$123.45 - blocked', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -123.45 });
    assert.strictEqual(result.canSend, false);
});

test('1.16 Message contains payout amount', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -250.50 });
    assert.ok(result.message.includes('-250.50'));
});

test('1.17 Positive message indicates OK to send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: 100 });
    assert.ok(result.message.includes('OK to send'));
});

test('1.18 Negative message mentions manual review', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -100 });
    assert.ok(result.message.includes('manual review'));
});

test('1.19 Decimal string "123.45" - can send', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: "123.45" });
    assert.strictEqual(result.canSend, true);
});

test('1.20 Very small negative -0.001 - blocked', () => {
    const result = checkNegativeBalanceGuardrail({ ownerPayout: -0.001 });
    assert.strictEqual(result.canSend, false);
});

// ============================================================================
// TEST GROUP 2: Frequency Tag Detection (20 tests)
// ============================================================================
console.log('\n--- TEST GROUP 2: Frequency Tag Detection (20 tests) ---\n');

test('2.1 Array with "Weekly" tag', () => {
    assert.strictEqual(getFrequencyFromTags(['Weekly']), 'Weekly');
});

test('2.2 Array with "Bi-Weekly" tag', () => {
    assert.strictEqual(getFrequencyFromTags(['Bi-Weekly']), 'Bi-Weekly');
});

test('2.3 Array with "Monthly" tag', () => {
    assert.strictEqual(getFrequencyFromTags(['Monthly']), 'Monthly');
});

test('2.4 Array with multiple tags including Weekly', () => {
    assert.strictEqual(getFrequencyFromTags(['Premium', 'Weekly', 'Beach']), 'Weekly');
});

test('2.5 String comma-separated "Premium,Weekly,Beach"', () => {
    assert.strictEqual(getFrequencyFromTags('Premium,Weekly,Beach'), 'Weekly');
});

test('2.6 Case insensitive "weekly"', () => {
    assert.strictEqual(getFrequencyFromTags(['weekly']), 'Weekly');
});

test('2.7 Case insensitive "MONTHLY"', () => {
    assert.strictEqual(getFrequencyFromTags(['MONTHLY']), 'Monthly');
});

test('2.8 Case insensitive "bi-weekly"', () => {
    assert.strictEqual(getFrequencyFromTags(['bi-weekly']), 'Bi-Weekly');
});

test('2.9 No frequency tag - defaults to Monthly', () => {
    assert.strictEqual(getFrequencyFromTags(['Premium', 'Beach']), 'Monthly');
});

test('2.10 Empty array - defaults to Monthly', () => {
    assert.strictEqual(getFrequencyFromTags([]), 'Monthly');
});

test('2.11 Empty string - defaults to Monthly', () => {
    assert.strictEqual(getFrequencyFromTags(''), 'Monthly');
});

test('2.12 Null - defaults to Monthly', () => {
    assert.strictEqual(getFrequencyFromTags(null), 'Monthly');
});

test('2.13 Undefined - defaults to Monthly', () => {
    assert.strictEqual(getFrequencyFromTags(undefined), 'Monthly');
});

test('2.14 Whitespace around tag " Weekly "', () => {
    assert.strictEqual(getFrequencyFromTags([' Weekly ']), 'Weekly');
});

test('2.15 String with spaces "Premium, Weekly, Beach"', () => {
    assert.strictEqual(getFrequencyFromTags('Premium, Weekly, Beach'), 'Weekly');
});

test('2.16 First frequency tag wins (Weekly before Monthly)', () => {
    assert.strictEqual(getFrequencyFromTags(['Weekly', 'Monthly']), 'Weekly');
});

test('2.17 Mixed case "BiWeekly" - no match, defaults Monthly', () => {
    // Note: "BiWeekly" without hyphen doesn't match "Bi-Weekly"
    assert.strictEqual(getFrequencyFromTags(['BiWeekly']), 'Monthly');
});

test('2.18 Single tag string "Bi-Weekly"', () => {
    assert.strictEqual(getFrequencyFromTags('Bi-Weekly'), 'Bi-Weekly');
});

test('2.19 Tag with extra text "Weekly-VIP" - no match', () => {
    assert.strictEqual(getFrequencyFromTags(['Weekly-VIP']), 'Monthly');
});

test('2.20 Many tags, frequency in middle', () => {
    const tags = ['Tag1', 'Tag2', 'Bi-Weekly', 'Tag3', 'Tag4'];
    assert.strictEqual(getFrequencyFromTags(tags), 'Bi-Weekly');
});

// ============================================================================
// TEST GROUP 3: Email Template Generation (15 tests)
// ============================================================================
console.log('\n--- TEST GROUP 3: Email Template Generation (15 tests) ---\n');

const templateData = {
    ownerName: 'John Smith',
    propertyName: 'Beach House',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-07',
    ownerPayout: 1500,
    companyName: 'Luxury Lodging PM'
};

test('3.1 Weekly template has correct subject', () => {
    const template = getEmailTemplate('Weekly', templateData);
    assert.ok(template.subject.includes('Weekly Owner Statement'));
});

test('3.2 Weekly template subject includes property name', () => {
    const template = getEmailTemplate('Weekly', templateData);
    assert.ok(template.subject.includes('Beach House'));
});

test('3.3 Weekly template subject includes dates', () => {
    const template = getEmailTemplate('Weekly', templateData);
    assert.ok(template.subject.includes('2025-01-01'));
    assert.ok(template.subject.includes('2025-01-07'));
});

test('3.4 Bi-Weekly template has correct subject', () => {
    const template = getEmailTemplate('Bi-Weekly', templateData);
    assert.ok(template.subject.includes('Bi-Weekly Owner Statement'));
});

test('3.5 Monthly template has correct subject', () => {
    const template = getEmailTemplate('Monthly', templateData);
    assert.ok(template.subject.includes('Monthly Owner Statement'));
});

test('3.6 Weekly template has blue color', () => {
    const template = getEmailTemplate('Weekly', templateData);
    assert.strictEqual(template.color, '#2563eb');
});

test('3.7 Bi-Weekly template has purple color', () => {
    const template = getEmailTemplate('Bi-Weekly', templateData);
    assert.strictEqual(template.color, '#7c3aed');
});

test('3.8 Monthly template has green color', () => {
    const template = getEmailTemplate('Monthly', templateData);
    assert.strictEqual(template.color, '#059669');
});

test('3.9 Unknown frequency defaults to Monthly', () => {
    const template = getEmailTemplate('Quarterly', templateData);
    assert.ok(template.subject.includes('Monthly Owner Statement'));
});

test('3.10 Null frequency defaults to Monthly', () => {
    const template = getEmailTemplate(null, templateData);
    assert.ok(template.subject.includes('Monthly Owner Statement'));
});

test('3.11 Different property name in subject', () => {
    const data = { ...templateData, propertyName: 'Mountain Cabin' };
    const template = getEmailTemplate('Weekly', data);
    assert.ok(template.subject.includes('Mountain Cabin'));
});

test('3.12 Different date range in subject', () => {
    const data = { ...templateData, periodStart: '2025-03-01', periodEnd: '2025-03-31' };
    const template = getEmailTemplate('Monthly', data);
    assert.ok(template.subject.includes('2025-03-01'));
});

test('3.13 Template returns object with subject property', () => {
    const template = getEmailTemplate('Weekly', templateData);
    assert.ok(typeof template.subject === 'string');
});

test('3.14 Template returns object with color property', () => {
    const template = getEmailTemplate('Weekly', templateData);
    assert.ok(typeof template.color === 'string');
});

test('3.15 Empty property name handled', () => {
    const data = { ...templateData, propertyName: '' };
    const template = getEmailTemplate('Weekly', data);
    assert.ok(template.subject.includes('Weekly Owner Statement'));
});

// ============================================================================
// TEST GROUP 4: Email Validation (15 tests)
// ============================================================================
console.log('\n--- TEST GROUP 4: Email Validation (15 tests) ---\n');

test('4.1 Valid email simple', () => {
    assert.strictEqual(validateEmailAddress('test@example.com'), true);
});

test('4.2 Valid email with subdomain', () => {
    assert.strictEqual(validateEmailAddress('test@mail.example.com'), true);
});

test('4.3 Valid email with plus', () => {
    assert.strictEqual(validateEmailAddress('test+tag@example.com'), true);
});

test('4.4 Valid email with dots', () => {
    assert.strictEqual(validateEmailAddress('first.last@example.com'), true);
});

test('4.5 Invalid email - no @', () => {
    assert.strictEqual(validateEmailAddress('testexample.com'), false);
});

test('4.6 Invalid email - no domain', () => {
    assert.strictEqual(validateEmailAddress('test@'), false);
});

test('4.7 Invalid email - no local part', () => {
    assert.strictEqual(validateEmailAddress('@example.com'), false);
});

test('4.8 Invalid email - spaces', () => {
    assert.strictEqual(validateEmailAddress('test @example.com'), false);
});

test('4.9 Invalid email - empty', () => {
    assert.strictEqual(validateEmailAddress(''), false);
});

test('4.10 Invalid email - just @', () => {
    assert.strictEqual(validateEmailAddress('@'), false);
});

test('4.11 Invalid email - double @', () => {
    assert.strictEqual(validateEmailAddress('test@@example.com'), false);
});

test('4.12 Valid email - uppercase', () => {
    assert.strictEqual(validateEmailAddress('TEST@EXAMPLE.COM'), true);
});

test('4.13 Valid email - numbers', () => {
    assert.strictEqual(validateEmailAddress('test123@example123.com'), true);
});

test('4.14 Valid email - underscores', () => {
    assert.strictEqual(validateEmailAddress('test_user@example.com'), true);
});

test('4.15 Invalid email - no TLD', () => {
    assert.strictEqual(validateEmailAddress('test@example'), false);
});

// ============================================================================
// TEST GROUP 5: Can Send Email Logic (15 tests)
// ============================================================================
console.log('\n--- TEST GROUP 5: Can Send Email Logic (15 tests) ---\n');

test('5.1 All valid - can send', () => {
    const result = canSendEmail({ ownerPayout: 100 }, 'test@example.com', true);
    assert.strictEqual(result.canSend, true);
    assert.strictEqual(result.errors.length, 0);
});

test('5.2 SMTP not configured - cannot send', () => {
    const result = canSendEmail({ ownerPayout: 100 }, 'test@example.com', false);
    assert.strictEqual(result.canSend, false);
    assert.ok(result.errors.includes('SMTP not configured'));
});

test('5.3 No email - cannot send', () => {
    const result = canSendEmail({ ownerPayout: 100 }, null, true);
    assert.strictEqual(result.canSend, false);
    assert.ok(result.errors.includes('No recipient email'));
});

test('5.4 Invalid email - cannot send', () => {
    const result = canSendEmail({ ownerPayout: 100 }, 'invalid', true);
    assert.strictEqual(result.canSend, false);
    assert.ok(result.errors.includes('Invalid email format'));
});

test('5.5 Negative balance - cannot send', () => {
    const result = canSendEmail({ ownerPayout: -100 }, 'test@example.com', true);
    assert.strictEqual(result.canSend, false);
    assert.ok(result.errors.includes('Negative balance'));
});

test('5.6 Multiple errors', () => {
    const result = canSendEmail({ ownerPayout: -100 }, 'invalid', false);
    assert.strictEqual(result.canSend, false);
    assert.ok(result.errors.length >= 3);
});

test('5.7 Zero balance - can send', () => {
    const result = canSendEmail({ ownerPayout: 0 }, 'test@example.com', true);
    assert.strictEqual(result.canSend, true);
});

test('5.8 Empty email string - cannot send', () => {
    const result = canSendEmail({ ownerPayout: 100 }, '', true);
    assert.strictEqual(result.canSend, false);
});

test('5.9 No statement - cannot send', () => {
    const result = canSendEmail(null, 'test@example.com', true);
    assert.strictEqual(result.canSend, false);
    assert.ok(result.errors.includes('No statement provided'));
});

test('5.10 Undefined statement - cannot send', () => {
    const result = canSendEmail(undefined, 'test@example.com', true);
    assert.strictEqual(result.canSend, false);
});

test('5.11 String payout positive - can send', () => {
    const result = canSendEmail({ ownerPayout: "500" }, 'test@example.com', true);
    assert.strictEqual(result.canSend, true);
});

test('5.12 String payout negative - cannot send', () => {
    const result = canSendEmail({ ownerPayout: "-500" }, 'test@example.com', true);
    assert.strictEqual(result.canSend, false);
});

test('5.13 Very small positive - can send', () => {
    const result = canSendEmail({ ownerPayout: 0.01 }, 'test@example.com', true);
    assert.strictEqual(result.canSend, true);
});

test('5.14 Very small negative - cannot send', () => {
    const result = canSendEmail({ ownerPayout: -0.01 }, 'test@example.com', true);
    assert.strictEqual(result.canSend, false);
});

test('5.15 Large positive - can send', () => {
    const result = canSendEmail({ ownerPayout: 99999.99 }, 'test@example.com', true);
    assert.strictEqual(result.canSend, true);
});

// ============================================================================
// TEST GROUP 6: Statement Status Transitions (15 tests)
// ============================================================================
console.log('\n--- TEST GROUP 6: Statement Status Transitions (15 tests) ---\n');

const validStatuses = ['draft', 'pending', 'sent', 'flagged_negative_balance', 'reviewed_approved', 'reviewed_sent_manually', 'reviewed_waived', 'sent_negative_balance'];

function isValidStatus(status) {
    return validStatuses.includes(status);
}

function getNextStatus(currentStatus, action, ownerPayout) {
    if (action === 'send') {
        if (ownerPayout < 0) {
            return 'flagged_negative_balance';
        }
        return 'sent';
    }
    if (action === 'force_send') {
        return ownerPayout < 0 ? 'sent_negative_balance' : 'sent';
    }
    if (action === 'review') {
        return 'reviewed_approved';
    }
    return currentStatus;
}

test('6.1 draft is valid status', () => {
    assert.strictEqual(isValidStatus('draft'), true);
});

test('6.2 sent is valid status', () => {
    assert.strictEqual(isValidStatus('sent'), true);
});

test('6.3 flagged_negative_balance is valid status', () => {
    assert.strictEqual(isValidStatus('flagged_negative_balance'), true);
});

test('6.4 invalid status returns false', () => {
    assert.strictEqual(isValidStatus('unknown'), false);
});

test('6.5 Send positive -> sent', () => {
    assert.strictEqual(getNextStatus('draft', 'send', 100), 'sent');
});

test('6.6 Send negative -> flagged_negative_balance', () => {
    assert.strictEqual(getNextStatus('draft', 'send', -100), 'flagged_negative_balance');
});

test('6.7 Force send positive -> sent', () => {
    assert.strictEqual(getNextStatus('draft', 'force_send', 100), 'sent');
});

test('6.8 Force send negative -> sent_negative_balance', () => {
    assert.strictEqual(getNextStatus('draft', 'force_send', -100), 'sent_negative_balance');
});

test('6.9 Review flagged -> reviewed_approved', () => {
    assert.strictEqual(getNextStatus('flagged_negative_balance', 'review', -100), 'reviewed_approved');
});

test('6.10 Unknown action keeps current status', () => {
    assert.strictEqual(getNextStatus('draft', 'unknown', 100), 'draft');
});

test('6.11 Send zero balance -> sent', () => {
    assert.strictEqual(getNextStatus('draft', 'send', 0), 'sent');
});

test('6.12 Force send zero balance -> sent', () => {
    assert.strictEqual(getNextStatus('draft', 'force_send', 0), 'sent');
});

test('6.13 reviewed_sent_manually is valid', () => {
    assert.strictEqual(isValidStatus('reviewed_sent_manually'), true);
});

test('6.14 reviewed_waived is valid', () => {
    assert.strictEqual(isValidStatus('reviewed_waived'), true);
});

test('6.15 pending is valid status', () => {
    assert.strictEqual(isValidStatus('pending'), true);
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('EMAIL AUTOMATION TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Total:  ${passedTests + failedTests}`);
console.log('='.repeat(60) + '\n');

if (failedTests > 0) {
    process.exit(1);
}
