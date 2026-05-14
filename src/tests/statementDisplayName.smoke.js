/**
 * Smoke test for the statementDisplayName feature.
 *
 * Validates:
 *  1. The SQL migration adds statement_display_name to both tables.
 *  2. The Sequelize models expose statementDisplayName mapped to that column.
 *  3. The route/service files actually reference statementDisplayName in the
 *     label-resolution sites (so a future refactor that drops the chain
 *     would trip this test).
 *  4. The label-resolution rules we agreed on hold: explicit DisplayName wins,
 *     group label wins over joined listing names, joined-name "+N more"
 *     truncation kicks in past 3 listings.
 *
 * Runs with no DB connection — only file/system reads and pure-function checks.
 *
 *   node src/tests/statementDisplayName.smoke.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const checks = [];
function check(name, fn) {
    try {
        fn();
        checks.push({ name, ok: true });
        process.stdout.write(`  ✓ ${name}\n`);
    } catch (err) {
        checks.push({ name, ok: false, err });
        process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`);
    }
}

process.stdout.write('\nsmoke: statementDisplayName feature\n');

// ----- 1. migration SQL -----------------------------------------------------
check('migration file adds statement_display_name to both tables', () => {
    const sql = fs.readFileSync(
        path.join(REPO_ROOT, 'migrations', 'add-statement-display-name.sql'),
        'utf8'
    );
    assert.match(sql, /ALTER TABLE listings\s+ADD COLUMN IF NOT EXISTS statement_display_name/i,
        'missing listings ALTER');
    assert.match(sql, /ALTER TABLE listing_groups\s+ADD COLUMN IF NOT EXISTS statement_display_name/i,
        'missing listing_groups ALTER');
});

// ----- 2. model wiring ------------------------------------------------------
// We don't want to spin up the real DB. The models call sequelize.define()
// at module-load time, so the lightest path is to stub the sequelize singleton
// with a fake `define` that captures the attribute definition.

function loadModelWithStubbedSequelize(modelPath) {
    const absDb = require.resolve(path.join(REPO_ROOT, 'src', 'config', 'database'));
    const absLogger = require.resolve(path.join(REPO_ROOT, 'src', 'utils', 'logger'));
    const absModel = require.resolve(modelPath);

    // Capture whatever attributes the model defines.
    const fakeSequelize = {
        define(_name, attributes /* , options */) {
            return { rawAttributes: attributes, _capturedAttributes: attributes };
        }
    };

    // Force a fresh require so the stub is honored.
    delete require.cache[absDb];
    delete require.cache[absLogger];
    delete require.cache[absModel];

    require.cache[absDb] = {
        id: absDb,
        filename: absDb,
        loaded: true,
        exports: fakeSequelize
    };
    // No-op logger so models that do `logger.warn(...)` at top-level don't crash.
    require.cache[absLogger] = {
        id: absLogger,
        filename: absLogger,
        loaded: true,
        exports: new Proxy({}, { get: () => () => {} })
    };

    return require(modelPath);
}

check('Listing model exposes statementDisplayName mapped to statement_display_name', () => {
    const Listing = loadModelWithStubbedSequelize(
        path.join(REPO_ROOT, 'src', 'models', 'Listing.js')
    );
    const attr = Listing._capturedAttributes.statementDisplayName;
    assert.ok(attr, 'statementDisplayName attribute missing on Listing');
    assert.strictEqual(attr.field, 'statement_display_name',
        `expected field=statement_display_name, got ${attr.field}`);
    assert.strictEqual(attr.allowNull, true, 'statementDisplayName should be nullable');
});

check('ListingGroup model exposes statementDisplayName mapped to statement_display_name', () => {
    const ListingGroup = loadModelWithStubbedSequelize(
        path.join(REPO_ROOT, 'src', 'models', 'ListingGroup.js')
    );
    const attr = ListingGroup._capturedAttributes.statementDisplayName;
    assert.ok(attr, 'statementDisplayName attribute missing on ListingGroup');
    assert.strictEqual(attr.field, 'statement_display_name',
        `expected field=statement_display_name, got ${attr.field}`);
    assert.strictEqual(attr.allowNull, true, 'statementDisplayName should be nullable');
});

// ----- 3. source-file wiring (regression guards) ----------------------------
function readSrc(rel) {
    return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

check('statements-file.js multi-listing label uses statementDisplayName first', () => {
    const src = readSrc('src/routes/statements-file.js');
    assert.match(
        src,
        /l\.statementDisplayName\s*\|\|\s*l\.nickname\s*\|\|\s*l\.displayName\s*\|\|\s*l\.name/,
        'expected fallback chain l.statementDisplayName || l.nickname || l.displayName || l.name'
    );
    assert.match(
        src,
        /group\.statementDisplayName\s*\|\|\s*group\.name/,
        'expected group statement label preference (group.statementDisplayName || group.name)'
    );
});

check('StatementService.js group statement uses groupStatementDisplayName', () => {
    const src = readSrc('src/services/StatementService.js');
    assert.match(
        src,
        /groupStatementDisplayName\s*\|\|\s*groupName/,
        'expected propertyName: groupStatementDisplayName || groupName'
    );
});

check('payouts.js recipient preview uses statementDisplayName', () => {
    const src = readSrc('src/routes/payouts.js');
    assert.match(
        src,
        /grp\.statementDisplayName\s*\|\|\s*grp\.name/,
        'expected grp.statementDisplayName || grp.name'
    );
    assert.match(
        src,
        /l\.statementDisplayName\s*\|\|\s*l\.nickname\s*\|\|\s*l\.displayName\s*\|\|\s*l\.name/,
        'expected listing fallback chain in payouts preview'
    );
});

check('listings.js PUT /:id/config destructures and forwards statementDisplayName', () => {
    // Caught a real bug: an earlier pass added wiring to ListingService but the
    // route handler whitelists fields by destructure — the value was silently
    // dropped before reaching the service. Anchor the destructure + the config
    // forwarding so this exact regression can't sneak back.
    const src = readSrc('src/routes/listings.js');
    assert.match(
        src,
        /const\s*\{[^}]*\bstatementDisplayName\b[^}]*\}\s*=\s*req\.body/,
        'statementDisplayName is not destructured from req.body in PUT /listings/:id/config'
    );
    assert.match(
        src,
        /config\.statementDisplayName\s*=/,
        'statementDisplayName is destructured but never assigned to config'
    );
});

check('FileDataService.getListings merges statementDisplayName from DB row', () => {
    // FileDataService.getListings() merges DB fields onto the Hostify-cached
    // listing objects. statements-file.js generate() consumes that merged
    // shape, so omitting statementDisplayName from the merge silently breaks
    // single-listing label resolution. Guard the merge in all 3 branches.
    const src = readSrc('src/services/FileDataService.js');
    const occurrences = src.match(/statementDisplayName/g) || [];
    assert.ok(
        occurrences.length >= 3,
        `expected ≥3 references to statementDisplayName in FileDataService (merge + default + offboarded), got ${occurrences.length}`
    );
});

check('email.js single-send path resolves statementDisplayName for owner emails', () => {
    const src = readSrc('src/routes/email.js');
    assert.match(src, /listing\.statementDisplayName\s*\|\|\s*listing\.nickname/,
        'expected listing.statementDisplayName before nickname in /send/:id');
    assert.match(src, /grp\.statementDisplayName\s*\|\|\s*grp\.name/,
        'expected group label resolution when statement.groupId is set');
});

check('EmailService payout receipt no longer prefers propertyNames over propertyName', () => {
    const src = readSrc('src/services/EmailService.js');
    assert.doesNotMatch(
        src,
        /statement\.propertyNames\s*\|\|\s*statement\.propertyName\s*\|\|\s*'Property'/,
        'payout receipt still falls through propertyNames first — would re-introduce the joined-name regression'
    );
    assert.match(
        src,
        /statement\.propertyName\s*\|\|\s*statement\.propertyNames\s*\|\|\s*'Property'/,
        'expected propertyName preferred over propertyNames in payout receipt'
    );
});

// ----- 4. label-resolution rules (pure functions) ---------------------------
// These mirror the rules implemented in statements-file.js / StatementService.js.
// If the implementation drifts, the assertions still encode the contract the
// user agreed on, and the source-file regex guards above catch drift in the
// actual files.

function labelFor(l) {
    return l.statementDisplayName || l.nickname || l.displayName || l.name;
}

function multiListingLabel(targetListings, group) {
    if (group) return group.statementDisplayName || group.name;
    const propertyNames = targetListings.map(labelFor).join(', ');
    if (targetListings.length <= 3) return propertyNames;
    return `${targetListings.slice(0, 2).map(labelFor).join(', ')} +${targetListings.length - 2} more`;
}

check('single listing label prefers statementDisplayName', () => {
    assert.strictEqual(
        labelFor({ name: 'Raw', nickname: 'Nick', displayName: 'Disp', statementDisplayName: 'Pretty' }),
        'Pretty'
    );
});

check('single listing label falls back through nickname/displayName/name', () => {
    assert.strictEqual(labelFor({ name: 'Raw' }), 'Raw');
    assert.strictEqual(labelFor({ name: 'Raw', displayName: 'Disp' }), 'Disp');
    assert.strictEqual(labelFor({ name: 'Raw', displayName: 'Disp', nickname: 'Nick' }), 'Nick');
});

check('group statement uses group.statementDisplayName when set', () => {
    const group = { name: 'Smith Properties', statementDisplayName: 'Smith Complex' };
    const listings = [{ name: 'A' }, { name: 'B' }];
    assert.strictEqual(multiListingLabel(listings, group), 'Smith Complex');
});

check('group statement falls back to group.name when statementDisplayName is null', () => {
    const group = { name: 'Smith Properties', statementDisplayName: null };
    assert.strictEqual(multiListingLabel([{ name: 'A' }], group), 'Smith Properties');
});

check('multi-select (no group) joins ≤3 listings in full', () => {
    const listings = [
        { name: 'A', statementDisplayName: 'Alpha' },
        { name: 'B' },
        { name: 'C', nickname: 'Charlie' }
    ];
    assert.strictEqual(multiListingLabel(listings, null), 'Alpha, B, Charlie');
});

check('multi-select (no group) truncates with "+N more" past 3', () => {
    const listings = [
        { name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }
    ];
    assert.strictEqual(multiListingLabel(listings, null), 'A, B +3 more');
});

// ----- 5. statement number features -----------------------------------------
check('statements list search matches numeric id ("2069", "#2069", "Statement #2069")', () => {
    // Replicates the filter in routes/statements-file.js line ~150.
    const filterById = (statements, search) => {
        const raw = search.trim();
        const searchLower = raw.toLowerCase();
        const idMatch = raw.match(/(?:^|\D)(\d+)\s*$/);
        const exactId = idMatch ? parseInt(idMatch[1], 10) : null;
        return statements.filter(s => {
            if (exactId !== null && parseInt(s.id, 10) === exactId) return true;
            const propertyName = (s.propertyName || '').toLowerCase();
            return propertyName.includes(searchLower);
        });
    };
    const fixtures = [
        { id: 2068, propertyName: 'Cliff Drive' },
        { id: 2069, propertyName: 'Ozzie Complex' },
        { id: 2070, propertyName: 'Madeira' },
    ];
    assert.deepStrictEqual(filterById(fixtures, '2069').map(s => s.id), [2069]);
    assert.deepStrictEqual(filterById(fixtures, '#2069').map(s => s.id), [2069]);
    assert.deepStrictEqual(filterById(fixtures, 'Statement #2069').map(s => s.id), [2069]);
    // Non-numeric still searches text:
    assert.deepStrictEqual(filterById(fixtures, 'cliff').map(s => s.id), [2068]);
    // Bare number that doesn't match an id returns no rows (no propertyName contains "9999"):
    assert.deepStrictEqual(filterById(fixtures, '9999').map(s => s.id), []);
});

check('routes/statements-file.js list endpoint actually applies the numeric-id filter', () => {
    const src = readSrc('src/routes/statements-file.js');
    assert.match(src, /idMatch\s*=\s*raw\.match\(/, 'expected id-match regex in list filter');
    assert.match(src, /parseInt\(s\.id,\s*10\)\s*===\s*exactId/, 'expected exact-id comparison in list filter');
});

check('rendered statement HTML emits the #id badge', () => {
    const src = readSrc('src/routes/statements-file.js');
    assert.match(src, /statement-number-badge/, 'expected statement-number-badge CSS class');
    assert.match(src, /class="statement-number-badge"[\s\S]{0,200}#\$\{statement\.id\}/,
        'expected the badge element to interpolate ${statement.id}');
});

check('PDF filename (EmailService) prefixes "Statement #<id>"', () => {
    const src = readSrc('src/services/EmailService.js');
    assert.match(
        src,
        /Statement\s+#\$\{statementId\}\s+-\s+\$\{cleanPropertyName\}/,
        'expected filename = `Statement #${statementId} - ${cleanPropertyName} - …`'
    );
});

check('PDF download endpoint prefixes "Statement #<id>"', () => {
    const src = readSrc('src/routes/statements-file.js');
    assert.match(
        src,
        /filename\s*=\s*`Statement\s+#\$\{id\}\s+-\s+\$\{cleanPropertyName\}/,
        'expected download filename = `Statement #${id} - ${cleanPropertyName} - …`'
    );
});

check('rendered HTML <title> includes "Statement #<id>"', () => {
    const src = readSrc('src/routes/statements-file.js');
    assert.match(
        src,
        /<title>Statement\s+#\$\{statement\.id\}\s+-\s+/,
        'expected <title> to start with Statement #${statement.id}'
    );
});

// ----- summary --------------------------------------------------------------
const failed = checks.filter(c => !c.ok);
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} passed\n`);
if (failed.length > 0) {
    process.exit(1);
}
