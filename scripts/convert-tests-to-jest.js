#!/usr/bin/env node
/**
 * Script to convert legacy runTest() based test files to proper Jest format
 *
 * This reads a test file and:
 * 1. Finds all runTest('name', () => { ... }) calls
 * 2. Extracts the function bodies
 * 3. Converts assert.* to expect().*
 * 4. Wraps in proper describe/test blocks
 */

const fs = require('fs');
const path = require('path');

const filesToConvert = [
    'src/tests/listing-settings-override.test.js',
    'src/tests/cleaningFeePassThrough.test.js',
    'src/tests/guestPaidDamageCoverage.test.js',
    'src/tests/comprehensive-edge-cases.test.js',
    'src/tests/master-test-suite.test.js',
    'src/tests/statement-colors-comprehensive.test.js'
];

function convertAssertions(code) {
    // Convert assert patterns to Jest expect
    let result = code;

    // assert.strictEqual(a, b) -> expect(a).toBe(b)
    result = result.replace(/assert\.strictEqual\(([^,]+),\s*([^,\)]+)(?:,\s*[^)]+)?\)/g, 'expect($1).toBe($2)');

    // assert.deepStrictEqual(a, b) -> expect(a).toEqual(b)
    result = result.replace(/assert\.deepStrictEqual\(([^,]+),\s*([^,\)]+)(?:,\s*[^)]+)?\)/g, 'expect($1).toEqual($2)');

    // assert.ok(x) -> expect(x).toBeTruthy()
    result = result.replace(/assert\.ok\(([^)]+)\)/g, 'expect($1).toBeTruthy()');

    // assert(x) -> expect(x).toBeTruthy()
    result = result.replace(/assert\(([^)]+)\)/g, 'expect($1).toBeTruthy()');

    // assertEqual(a, b) -> expect(a).toBe(b)
    result = result.replace(/assertEqual\(([^,]+),\s*([^,\)]+)(?:,\s*[^)]+)?\)/g, 'expect($1).toBe($2)');

    // assertClose(a, b) -> expect(a).toBeCloseTo(b)
    result = result.replace(/assertClose\(([^,]+),\s*([^,\)]+)(?:,\s*[^)]+)?\)/g, 'expect($1).toBeCloseTo($2, 2)');

    return result;
}

function extractTestsFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const tests = [];

    // Match runTest('name', () => { ... })
    // This is a simplified regex - may need adjustment for complex cases
    const runTestRegex = /runTest\(['"]([^'"]+)['"],\s*\(\)\s*=>\s*\{/g;

    let match;
    while ((match = runTestRegex.exec(content)) !== null) {
        tests.push({
            name: match[1],
            startIndex: match.index,
            nameEndIndex: match.index + match[0].length
        });
    }

    return { content, tests };
}

// Just print stats for now
for (const file of filesToConvert) {
    if (fs.existsSync(file)) {
        const { tests } = extractTestsFromFile(file);
        console.log(`${file}: ${tests.length} tests found`);
    }
}

console.log('\nTo convert these files, manual conversion is recommended');
console.log('Each file uses custom test framework that needs careful conversion');
