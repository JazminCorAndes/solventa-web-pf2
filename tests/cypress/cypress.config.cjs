const { defineConfig } = require('cypress');
const fs = require('node:fs');
const { join } = require('node:path');
const { localUrl, hu44Fixture } = require('./run.cjs');

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
    setupNodeEvents(on, config) {
      if (config.env.suite === 'controlled') {
        on('task', { hu44Fixture: () => hu44Fixture(true) });
        return;
      }
      if (config.env.suite !== 'integrated') return;
      on('task', {
        async registerCustomer(account) {
          if (process.env.CYPRESS_DISPOSABLE_BACKEND !== '1') {
            throw new Error('Customer setup requires a disposable local backend.');
          }
          const manifest = JSON.parse(
            fs.readFileSync(join(__dirname, '../../.angular/cypress/partner-backend.json'), 'utf8'),
          );
          const origin = localUrl(manifest.identityUrl);
          if (
            manifest.webUrl !== localUrl(process.env.CYPRESS_BACKEND_URL || 'http://127.0.0.1:5000')
          ) {
            throw new Error('Customer setup and browser must use the same disposable backend.');
          }
          const response = await fetch(`${origin}/v1/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(account),
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
          }).catch(() => {
            throw new Error('Disposable customer setup transport failed.');
          });
          if (response.status !== 201) {
            throw new Error(`Disposable customer setup: HTTP ${response.status}`);
          }
          const body = await response.json();
          if (typeof body.usuario?.id !== 'string') {
            throw new Error('Disposable customer setup returned an invalid customer.');
          }
          return { id: body.usuario.id };
        },
      });
    },
  },
});
