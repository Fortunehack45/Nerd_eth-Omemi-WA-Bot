/**
 * Standalone Test Runner for Node.js built-in test suite
 * Executes all unit and integration tests with formatted output.
 */

const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const path = require('path');

const files = [
  path.join(__dirname, 'sessionManager.test.js'),
  path.join(__dirname, 'apiPrivacy.test.js')
];

console.log('🚀 Running Multi-User WhatsApp Bot Test Harness...\n');

run({ files })
  .on('test:fail', () => {
    process.exitCode = 1;
  })
  .compose(new spec())
  .pipe(process.stdout);
