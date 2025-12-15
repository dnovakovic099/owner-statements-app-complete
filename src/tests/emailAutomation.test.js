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

// ============================================================================
// TEST GROUP 7: Email Subject Line Formats (New Requirements)
// ============================================================================

/**
 * Subject line formats:
 * - WEEKLY: "Owner Statement - 12.8-12.14.2025" (date range M.D-M.D.YYYY)
 * - BI-WEEKLY: "Owner Statement - 11.24-12.7.2025" (date range M.D-M.D.YYYY)
 * - MONTHLY: "Owner Statement - November 2025" (Month YYYY)
 */

function formatSubjectPeriod(frequencyTag, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const normalizedTag = (frequencyTag || '').toUpperCase().trim();

    if (normalizedTag === 'MONTHLY') {
        // Monthly: "November 2025"
        const monthName = end.toLocaleDateString('en-US', { month: 'long' });
        const year = end.getFullYear();
        return `${monthName} ${year}`;
    } else {
        // Weekly/Bi-Weekly: "12.8-12.14.2025"
        const startMonth = start.getMonth() + 1;
        const startDay = start.getDate();
        const endMonth = end.getMonth() + 1;
        const endDay = end.getDate();
        const year = end.getFullYear();
        return `${startMonth}.${startDay}-${endMonth}.${endDay}.${year}`;
    }
}

function getEmailSubject(frequencyTag, startDate, endDate) {
    const period = formatSubjectPeriod(frequencyTag, startDate, endDate);
    return `Owner Statement - ${period}`;
}

describe('Email Subject Line Formats', () => {
    test('WEEKLY subject - date range format M.D-M.D.YYYY', () => {
        const subject = getEmailSubject('WEEKLY', '2025-12-08', '2025-12-14');
        expect(subject).toBe('Owner Statement - 12.8-12.14.2025');
    });

    test('BI-WEEKLY A subject - date range format', () => {
        const subject = getEmailSubject('BI-WEEKLY A', '2025-11-24', '2025-12-07');
        expect(subject).toBe('Owner Statement - 11.24-12.7.2025');
    });

    test('BI-WEEKLY B subject - date range format', () => {
        const subject = getEmailSubject('BI-WEEKLY B', '2025-11-24', '2025-12-07');
        expect(subject).toBe('Owner Statement - 11.24-12.7.2025');
    });

    test('MONTHLY subject - month name format', () => {
        const subject = getEmailSubject('MONTHLY', '2025-11-01', '2025-11-30');
        expect(subject).toBe('Owner Statement - November 2025');
    });

    test('Weekly lowercase normalized to date range format', () => {
        const subject = getEmailSubject('weekly', '2025-12-01', '2025-12-07');
        expect(subject).toContain('12.1-12.7.2025');
    });

    test('Monthly lowercase normalized to month format', () => {
        const subject = getEmailSubject('monthly', '2025-10-01', '2025-10-31');
        expect(subject).toBe('Owner Statement - October 2025');
    });

    test('Subject has no prefix (Weekly/Bi-Weekly/Monthly)', () => {
        const weeklySubject = getEmailSubject('WEEKLY', '2025-12-01', '2025-12-07');
        const monthlySubject = getEmailSubject('MONTHLY', '2025-11-01', '2025-11-30');

        expect(weeklySubject).not.toContain('Weekly Owner Statement');
        expect(monthlySubject).not.toContain('Monthly Owner Statement');
        expect(weeklySubject).toMatch(/^Owner Statement - /);
        expect(monthlySubject).toMatch(/^Owner Statement - /);
    });
});

// ============================================================================
// TEST GROUP 8: Statement Period Calculations
// ============================================================================

function getStatementPeriod(frequencyTag) {
    const now = new Date();
    let startDate, endDate;

    switch (frequencyTag) {
        case 'WEEKLY':
            // Previous week (Monday to Sunday)
            endDate = new Date(now);
            endDate.setDate(now.getDate() - now.getDay()); // Last Sunday
            startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 6); // Monday before
            break;

        case 'BI-WEEKLY A':
        case 'BI-WEEKLY B':
            // Previous 2 weeks
            endDate = new Date(now);
            endDate.setDate(now.getDate() - now.getDay()); // Last Sunday
            startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 13); // 2 Mondays ago
            break;

        case 'MONTHLY':
            // Previous month
            endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of prev month
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First of prev month
            break;

        default:
            // Default to previous month
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }

    // Format dates without timezone conversion
    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}

describe('Statement Period Calculations', () => {
    test('WEEKLY period is 7 days', () => {
        const period = getStatementPeriod('WEEKLY');
        const start = new Date(period.startDate);
        const end = new Date(period.endDate);
        const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        expect(days).toBe(7);
    });

    test('BI-WEEKLY period is 14 days', () => {
        const period = getStatementPeriod('BI-WEEKLY A');
        const start = new Date(period.startDate);
        const end = new Date(period.endDate);
        const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        expect(days).toBe(14);
    });

    test('BI-WEEKLY A and B have same period length', () => {
        const periodA = getStatementPeriod('BI-WEEKLY A');
        const periodB = getStatementPeriod('BI-WEEKLY B');

        const startA = new Date(periodA.startDate);
        const endA = new Date(periodA.endDate);
        const daysA = Math.round((endA - startA) / (1000 * 60 * 60 * 24)) + 1;

        const startB = new Date(periodB.startDate);
        const endB = new Date(periodB.endDate);
        const daysB = Math.round((endB - startB) / (1000 * 60 * 60 * 24)) + 1;

        expect(daysA).toBe(daysB);
    });

    test('MONTHLY period starts on 1st of month', () => {
        const period = getStatementPeriod('MONTHLY');
        const start = new Date(period.startDate);
        expect(start.getDate()).toBe(1);
    });

    test('MONTHLY period ends on last day of month', () => {
        const period = getStatementPeriod('MONTHLY');
        const end = new Date(period.endDate);
        const nextDay = new Date(end);
        nextDay.setDate(end.getDate() + 1);
        expect(nextDay.getDate()).toBe(1); // Next day is 1st of next month
    });

    test('Date format is YYYY-MM-DD', () => {
        const period = getStatementPeriod('WEEKLY');
        expect(period.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(period.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('No timezone conversion issues (local dates)', () => {
        const period = getStatementPeriod('MONTHLY');
        // The month in the formatted date should match the local month
        const end = new Date(period.endDate);
        const endMonth = end.getMonth() + 1;
        const formattedMonth = parseInt(period.endDate.split('-')[1]);
        expect(formattedMonth).toBe(endMonth);
    });
});

// ============================================================================
// TEST GROUP 9: Owner Name vs Owner Greeting
// ============================================================================

/**
 * Owner Name: Used for statement ownership (e.g., "Default", "Darko Novakovic")
 * Owner Greeting: Used for email salutation (e.g., "Dear Josem", "Dear Stephen")
 */

function getStatementOwnerName(listing) {
    // Auto-generated statements should use "Default" as owner
    return 'Default';
}

function getEmailGreeting(listing) {
    // Email greeting uses ownerGreeting or falls back to nickname
    return listing.ownerGreeting || listing.nickname || listing.name;
}

function prepareStatementForEmail(statement, listing) {
    // Statement is saved with owner = "Default"
    // But for email, we override ownerName with the greeting name
    return {
        ...statement,
        ownerName: listing.ownerGreeting || listing.nickname || statement.ownerName
    };
}

describe('Owner Name vs Owner Greeting', () => {
    const listing = {
        id: 300017664,
        name: 'Wyndham Dr',
        nickname: 'Wyndham Dr - Bhavik',
        ownerEmail: 'moradiyabhavik@gmail.com',
        ownerGreeting: 'Bhavik'
    };

    test('Statement owner is "Default" for auto-generated', () => {
        const ownerName = getStatementOwnerName(listing);
        expect(ownerName).toBe('Default');
    });

    test('Email greeting uses ownerGreeting field', () => {
        const greeting = getEmailGreeting(listing);
        expect(greeting).toBe('Bhavik');
    });

    test('Email greeting falls back to nickname if no ownerGreeting', () => {
        const listingNoGreeting = { ...listing, ownerGreeting: null };
        const greeting = getEmailGreeting(listingNoGreeting);
        expect(greeting).toBe('Wyndham Dr - Bhavik');
    });

    test('Statement ownerName is overridden for email', () => {
        const statement = { id: 1, ownerName: 'Default', ownerPayout: 500 };
        const prepared = prepareStatementForEmail(statement, listing);
        expect(prepared.ownerName).toBe('Bhavik');
    });

    test('Original statement ownerName preserved when no greeting', () => {
        const statement = { id: 1, ownerName: 'Default', ownerPayout: 500 };
        const listingNoGreeting = { ...listing, ownerGreeting: null, nickname: null };
        const prepared = prepareStatementForEmail(statement, listingNoGreeting);
        expect(prepared.ownerName).toBe('Default');
    });

    test('Valid owners list', () => {
        const validOwners = ['Default', 'Darko Novakovic', 'Angelica Chua', 'Ferdy', 'Prasanna KB'];
        expect(validOwners).toContain('Default');
        expect(validOwners.length).toBe(5);
    });
});

// ============================================================================
// TEST GROUP 10: Frequency Tag Normalization
// ============================================================================

function normalizeFrequencyTag(tag) {
    const normalizedTag = (tag || '').toUpperCase().trim();

    if (normalizedTag === 'WEEKLY') return 'Weekly';
    if (normalizedTag.startsWith('BI-WEEKLY')) return 'Bi-Weekly';
    if (normalizedTag === 'MONTHLY') return 'Monthly';

    return 'Monthly'; // Default
}

function getTemplateKey(frequencyTag) {
    const normalizedTag = (frequencyTag || '').toUpperCase().trim();

    if (normalizedTag === 'WEEKLY') return 'Weekly';
    if (normalizedTag.startsWith('BI-WEEKLY')) return 'Bi-Weekly';
    if (normalizedTag === 'MONTHLY') return 'Monthly';

    return 'Monthly';
}

describe('Frequency Tag Normalization', () => {
    test('WEEKLY -> Weekly', () => {
        expect(normalizeFrequencyTag('WEEKLY')).toBe('Weekly');
    });

    test('weekly -> Weekly', () => {
        expect(normalizeFrequencyTag('weekly')).toBe('Weekly');
    });

    test('Weekly -> Weekly', () => {
        expect(normalizeFrequencyTag('Weekly')).toBe('Weekly');
    });

    test('BI-WEEKLY A -> Bi-Weekly', () => {
        expect(normalizeFrequencyTag('BI-WEEKLY A')).toBe('Bi-Weekly');
    });

    test('BI-WEEKLY B -> Bi-Weekly', () => {
        expect(normalizeFrequencyTag('BI-WEEKLY B')).toBe('Bi-Weekly');
    });

    test('bi-weekly a -> Bi-Weekly', () => {
        expect(normalizeFrequencyTag('bi-weekly a')).toBe('Bi-Weekly');
    });

    test('MONTHLY -> Monthly', () => {
        expect(normalizeFrequencyTag('MONTHLY')).toBe('Monthly');
    });

    test('monthly -> Monthly', () => {
        expect(normalizeFrequencyTag('monthly')).toBe('Monthly');
    });

    test('Empty string -> Monthly (default)', () => {
        expect(normalizeFrequencyTag('')).toBe('Monthly');
    });

    test('null -> Monthly (default)', () => {
        expect(normalizeFrequencyTag(null)).toBe('Monthly');
    });

    test('undefined -> Monthly (default)', () => {
        expect(normalizeFrequencyTag(undefined)).toBe('Monthly');
    });

    test('Invalid tag -> Monthly (default)', () => {
        expect(normalizeFrequencyTag('DAILY')).toBe('Monthly');
    });

    test('Template key matches for scheduler tags', () => {
        expect(getTemplateKey('WEEKLY')).toBe('Weekly');
        expect(getTemplateKey('BI-WEEKLY A')).toBe('Bi-Weekly');
        expect(getTemplateKey('BI-WEEKLY B')).toBe('Bi-Weekly');
        expect(getTemplateKey('MONTHLY')).toBe('Monthly');
    });
});

// ============================================================================
// TEST GROUP 11: Test Mode Email Redirection
// ============================================================================

function getRecipientEmail(listing, testModeEnabled, testModeEmail) {
    if (testModeEnabled) {
        return testModeEmail;
    }
    return listing.ownerEmail;
}

describe('Test Mode Email Redirection', () => {
    const listing = {
        ownerEmail: 'owner@example.com'
    };
    const testEmail = 'devendravariya73@gmail.com';

    test('Test mode enabled - uses test email', () => {
        const recipient = getRecipientEmail(listing, true, testEmail);
        expect(recipient).toBe(testEmail);
    });

    test('Test mode disabled - uses owner email', () => {
        const recipient = getRecipientEmail(listing, false, testEmail);
        expect(recipient).toBe('owner@example.com');
    });

    test('Test mode with different test email', () => {
        const recipient = getRecipientEmail(listing, true, 'ferdinand@luxurylodgingpm.com');
        expect(recipient).toBe('ferdinand@luxurylodgingpm.com');
    });

    test('Original owner email not exposed in test mode', () => {
        const recipient = getRecipientEmail(listing, true, testEmail);
        expect(recipient).not.toBe(listing.ownerEmail);
    });
});

// ============================================================================
// TEST GROUP 12: Auto-Generate Statement Validation
// ============================================================================

function validateAutoGeneratedStatement(statement) {
    const errors = [];

    if (!statement.propertyId) errors.push('Missing propertyId');
    if (!statement.propertyName) errors.push('Missing propertyName');
    if (!statement.weekStartDate) errors.push('Missing weekStartDate');
    if (!statement.weekEndDate) errors.push('Missing weekEndDate');
    if (statement.ownerName !== 'Default') errors.push('Owner should be Default for auto-generated');
    if (statement.status !== 'draft') errors.push('Status should be draft');
    if (statement.sentAt !== null) errors.push('sentAt should be null');
    if (typeof statement.ownerPayout !== 'number') errors.push('ownerPayout should be a number');

    return {
        isValid: errors.length === 0,
        errors
    };
}

describe('Auto-Generate Statement Validation', () => {
    const validStatement = {
        ownerId: 1,
        ownerName: 'Default',
        propertyId: 300017664,
        propertyName: 'Wyndham Dr - Bhavik',
        weekStartDate: '2025-12-01',
        weekEndDate: '2025-12-07',
        calculationType: 'calendar',
        totalRevenue: 1000,
        totalExpenses: 100,
        pmCommission: 150,
        pmPercentage: 15,
        ownerPayout: 750,
        status: 'draft',
        sentAt: null,
        reservations: [],
        expenses: []
    };

    test('Valid auto-generated statement passes', () => {
        const result = validateAutoGeneratedStatement(validStatement);
        expect(result.isValid).toBe(true);
        expect(result.errors.length).toBe(0);
    });

    test('Missing propertyId fails', () => {
        const invalid = { ...validStatement, propertyId: null };
        const result = validateAutoGeneratedStatement(invalid);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing propertyId');
    });

    test('Wrong owner name fails', () => {
        const invalid = { ...validStatement, ownerName: 'Bhavik' };
        const result = validateAutoGeneratedStatement(invalid);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Owner should be Default for auto-generated');
    });

    test('Wrong status fails', () => {
        const invalid = { ...validStatement, status: 'generated' };
        const result = validateAutoGeneratedStatement(invalid);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Status should be draft');
    });

    test('Non-null sentAt fails', () => {
        const invalid = { ...validStatement, sentAt: new Date() };
        const result = validateAutoGeneratedStatement(invalid);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('sentAt should be null');
    });

    test('ownerPayout must be number', () => {
        const invalid = { ...validStatement, ownerPayout: '750' };
        const result = validateAutoGeneratedStatement(invalid);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('ownerPayout should be a number');
    });
});
