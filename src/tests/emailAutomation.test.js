/**
 * Email Automation Test Suite (Jest format)
 *
 * Tests for:
 * - Email templates (Weekly, Bi-Weekly, Monthly)
 * - Negative balance guardrail
 * - Frequency tag detection
 * - Email sending logic
 */

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
    const { propertyName, periodStart, periodEnd } = data;

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

// ============================================================================
// TEST GROUP 1: Negative Balance Guardrail
// ============================================================================
describe('Negative Balance Guardrail', () => {
    test('Positive payout $1000 - can send', () => {
        const result = checkNegativeBalanceGuardrail({ ownerPayout: 1000 });
        expect(result.canSend).toBe(true);
        expect(result.reason).toBe('POSITIVE_BALANCE');
    });

    test('Positive payout $0.01 - can send', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: 0.01 }).canSend).toBe(true);
    });

    test('Zero payout $0 - can send', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: 0 }).canSend).toBe(true);
    });

    test('Negative payout -$1 - blocked', () => {
        const result = checkNegativeBalanceGuardrail({ ownerPayout: -1 });
        expect(result.canSend).toBe(false);
        expect(result.reason).toBe('NEGATIVE_BALANCE');
    });

    test('Negative payout -$0.01 - blocked', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: -0.01 }).canSend).toBe(false);
    });

    test('Negative payout -$500 - blocked', () => {
        const result = checkNegativeBalanceGuardrail({ ownerPayout: -500 });
        expect(result.canSend).toBe(false);
        expect(result.ownerPayout).toBe(-500);
    });

    test('Large positive $99999 - can send', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: 99999 }).canSend).toBe(true);
    });

    test('Large negative -$99999 - blocked', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: -99999 }).canSend).toBe(false);
    });

    test('String payout "500" - can send', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: "500" }).canSend).toBe(true);
    });

    test('String negative "-500" - blocked', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: "-500" }).canSend).toBe(false);
    });

    test('Null payout - treated as 0, can send', () => {
        const result = checkNegativeBalanceGuardrail({ ownerPayout: null });
        expect(result.canSend).toBe(true);
        expect(result.ownerPayout).toBe(0);
    });

    test('Undefined payout - treated as 0, can send', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: undefined }).canSend).toBe(true);
    });

    test('Empty statement object - treated as 0, can send', () => {
        expect(checkNegativeBalanceGuardrail({}).canSend).toBe(true);
    });

    test('Message contains payout amount', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: -250.50 }).message).toContain('-250.50');
    });

    test('Positive message indicates OK to send', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: 100 }).message).toContain('OK to send');
    });

    test('Negative message mentions manual review', () => {
        expect(checkNegativeBalanceGuardrail({ ownerPayout: -100 }).message).toContain('manual review');
    });
});

// ============================================================================
// TEST GROUP 2: Frequency Tag Detection
// ============================================================================
describe('Frequency Tag Detection', () => {
    test('Array with "Weekly" tag', () => {
        expect(getFrequencyFromTags(['Weekly'])).toBe('Weekly');
    });

    test('Array with "Bi-Weekly" tag', () => {
        expect(getFrequencyFromTags(['Bi-Weekly'])).toBe('Bi-Weekly');
    });

    test('Array with "Monthly" tag', () => {
        expect(getFrequencyFromTags(['Monthly'])).toBe('Monthly');
    });

    test('Array with multiple tags including Weekly', () => {
        expect(getFrequencyFromTags(['Premium', 'Weekly', 'Beach'])).toBe('Weekly');
    });

    test('String comma-separated "Premium,Weekly,Beach"', () => {
        expect(getFrequencyFromTags('Premium,Weekly,Beach')).toBe('Weekly');
    });

    test('Case insensitive "weekly"', () => {
        expect(getFrequencyFromTags(['weekly'])).toBe('Weekly');
    });

    test('Case insensitive "MONTHLY"', () => {
        expect(getFrequencyFromTags(['MONTHLY'])).toBe('Monthly');
    });

    test('No frequency tag - defaults to Monthly', () => {
        expect(getFrequencyFromTags(['Premium', 'Beach'])).toBe('Monthly');
    });

    test('Empty array - defaults to Monthly', () => {
        expect(getFrequencyFromTags([])).toBe('Monthly');
    });

    test('Empty string - defaults to Monthly', () => {
        expect(getFrequencyFromTags('')).toBe('Monthly');
    });

    test('Null - defaults to Monthly', () => {
        expect(getFrequencyFromTags(null)).toBe('Monthly');
    });

    test('Undefined - defaults to Monthly', () => {
        expect(getFrequencyFromTags(undefined)).toBe('Monthly');
    });
});

// ============================================================================
// TEST GROUP 3: Email Template Generation
// ============================================================================
describe('Email Template Generation', () => {
    const templateData = {
        ownerName: 'John Smith',
        propertyName: 'Beach House',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-07',
        ownerPayout: 1500,
        companyName: 'Luxury Lodging PM'
    };

    test('Weekly template has correct subject', () => {
        expect(getEmailTemplate('Weekly', templateData).subject).toContain('Weekly Owner Statement');
    });

    test('Weekly template subject includes property name', () => {
        expect(getEmailTemplate('Weekly', templateData).subject).toContain('Beach House');
    });

    test('Bi-Weekly template has correct subject', () => {
        expect(getEmailTemplate('Bi-Weekly', templateData).subject).toContain('Bi-Weekly Owner Statement');
    });

    test('Monthly template has correct subject', () => {
        expect(getEmailTemplate('Monthly', templateData).subject).toContain('Monthly Owner Statement');
    });

    test('Weekly template has blue color', () => {
        expect(getEmailTemplate('Weekly', templateData).color).toBe('#2563eb');
    });

    test('Bi-Weekly template has purple color', () => {
        expect(getEmailTemplate('Bi-Weekly', templateData).color).toBe('#7c3aed');
    });

    test('Monthly template has green color', () => {
        expect(getEmailTemplate('Monthly', templateData).color).toBe('#059669');
    });

    test('Unknown frequency defaults to Monthly', () => {
        expect(getEmailTemplate('Quarterly', templateData).subject).toContain('Monthly Owner Statement');
    });
});

// ============================================================================
// TEST GROUP 4: Email Validation
// ============================================================================
describe('Email Validation', () => {
    test('Valid email simple', () => {
        expect(validateEmailAddress('test@example.com')).toBe(true);
    });

    test('Valid email with subdomain', () => {
        expect(validateEmailAddress('test@mail.example.com')).toBe(true);
    });

    test('Valid email with plus', () => {
        expect(validateEmailAddress('test+tag@example.com')).toBe(true);
    });

    test('Invalid email - no @', () => {
        expect(validateEmailAddress('testexample.com')).toBe(false);
    });

    test('Invalid email - no domain', () => {
        expect(validateEmailAddress('test@')).toBe(false);
    });

    test('Invalid email - empty', () => {
        expect(validateEmailAddress('')).toBe(false);
    });
});

// ============================================================================
// TEST GROUP 5: Can Send Email Logic
// ============================================================================
describe('Can Send Email Logic', () => {
    test('All valid - can send', () => {
        const result = canSendEmail({ ownerPayout: 100 }, 'test@example.com', true);
        expect(result.canSend).toBe(true);
        expect(result.errors.length).toBe(0);
    });

    test('SMTP not configured - cannot send', () => {
        const result = canSendEmail({ ownerPayout: 100 }, 'test@example.com', false);
        expect(result.canSend).toBe(false);
        expect(result.errors).toContain('SMTP not configured');
    });

    test('No email - cannot send', () => {
        const result = canSendEmail({ ownerPayout: 100 }, null, true);
        expect(result.canSend).toBe(false);
        expect(result.errors).toContain('No recipient email');
    });

    test('Invalid email - cannot send', () => {
        const result = canSendEmail({ ownerPayout: 100 }, 'invalid', true);
        expect(result.canSend).toBe(false);
        expect(result.errors).toContain('Invalid email format');
    });

    test('Negative balance - cannot send', () => {
        const result = canSendEmail({ ownerPayout: -100 }, 'test@example.com', true);
        expect(result.canSend).toBe(false);
        expect(result.errors).toContain('Negative balance');
    });

    test('Multiple errors', () => {
        const result = canSendEmail({ ownerPayout: -100 }, 'invalid', false);
        expect(result.canSend).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
});

// ============================================================================
// TEST GROUP 6: Statement Status Transitions
// ============================================================================
describe('Statement Status Transitions', () => {
    test('draft is valid status', () => {
        expect(isValidStatus('draft')).toBe(true);
    });

    test('sent is valid status', () => {
        expect(isValidStatus('sent')).toBe(true);
    });

    test('flagged_negative_balance is valid status', () => {
        expect(isValidStatus('flagged_negative_balance')).toBe(true);
    });

    test('invalid status returns false', () => {
        expect(isValidStatus('unknown')).toBe(false);
    });

    test('Send positive -> sent', () => {
        expect(getNextStatus('draft', 'send', 100)).toBe('sent');
    });

    test('Send negative -> flagged_negative_balance', () => {
        expect(getNextStatus('draft', 'send', -100)).toBe('flagged_negative_balance');
    });

    test('Force send positive -> sent', () => {
        expect(getNextStatus('draft', 'force_send', 100)).toBe('sent');
    });

    test('Force send negative -> sent_negative_balance', () => {
        expect(getNextStatus('draft', 'force_send', -100)).toBe('sent_negative_balance');
    });

    test('Unknown action keeps current status', () => {
        expect(getNextStatus('draft', 'unknown', 100)).toBe('draft');
    });
});
