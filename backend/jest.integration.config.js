// Integration tests talk to a real Docker daemon and are run explicitly via
// `npm run test:integration` — they are kept out of the default `npm test` run.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.itest.ts'],
  verbose: true,
  forceExit: true,
  collectCoverage: false,
  // Generous per-test budget: a cold run may need to pull multi-hundred-MB images.
  testTimeout: 300000
};
