const { defineConfig } = require('cypress');

module.exports = defineConfig({
  video: false,
  screenshotOnRunFailure: false,
  retries: 0,
  viewportWidth: 1440,
  viewportHeight: 1000,
  defaultCommandTimeout: 10000,
  responseTimeout: 20000,
  reporter: 'junit',
  reporterOptions: {
    mochaFile: 'reports/cypress/results-[hash].xml',
    toConsole: false,
  },
  e2e: {
    baseUrl: 'http://127.0.0.1:4300',
    supportFile: 'tests/cypress/support/e2e.ts',
    specPattern: 'tests/cypress/ui/**/*.cy.ts',
    testIsolation: true,
  },
});
