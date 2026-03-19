module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/src/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/frontend/',
    // Integration tests that require running server
    'api-integration.test.js',
    'api-routes.jest.test.js',
    'api-auth.jest.test.js',
    'calendarConversion.integration.test.js',
    'cleaningFeePassThrough.integration.test.js',
    'combined-statement-fixes.test.js',
    // Old version replaced by calendarConversion.jest.test.js
    'calendarConversion.test.js',
    // Increase payout tests require sandbox API keys
    'increase-payout.jest.test.js'
  ],
  verbose: true
};
