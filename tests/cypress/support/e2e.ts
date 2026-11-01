let consoleErrors = 0;
let uncaughtErrors = 0;
let unhandledRejections = 0;
let expectedConsoleErrors: { message: string; status: number; code?: string }[] = [];
let consoleDiagnostics: string[] = [];
const diagnosticLabels = new Map([
  ['Dashboard data could not be loaded.', 'dashboard'],
  ['The quote process could not be recovered.', 'quote-resume'],
  ['Quote history could not be loaded.', 'quote-history'],
  ['Insurance offers could not be loaded.', 'offers'],
  ['Insurance products could not be loaded.', 'products'],
  ['Travel destinations could not be loaded.', 'destinations'],
  ['The remote session could not be restored.', 'session-restore'],
  ['The remote session could not be closed.', 'session-close'],
]);

Cypress.Commands.add('expectConsoleError', (message, status, code) => {
  expectedConsoleErrors.push({ message, status, code });
});

beforeEach(() => {
  consoleErrors = 0;
  uncaughtErrors = 0;
  unhandledRejections = 0;
  expectedConsoleErrors = [];
  consoleDiagnostics = [];
  cy.on('window:before:load', (win) => {
    const original = win.console.error;
    win.console.error = (...args: unknown[]) => {
      const detail = args[1];
      const index = expectedConsoleErrors.findIndex(
        (expected) =>
          args[0] === expected.message &&
          detail !== null &&
          typeof detail === 'object' &&
          'status' in detail &&
          detail.status === expected.status &&
          (expected.code === undefined ||
            ('error' in detail &&
              detail.error !== null &&
              typeof detail.error === 'object' &&
              'code' in detail.error &&
              detail.error.code === expected.code)),
      );
      if (index < 0) {
        consoleErrors += 1;
        const label = typeof args[0] === 'string' ? diagnosticLabels.get(args[0]) : undefined;
        const status =
          detail !== null &&
          typeof detail === 'object' &&
          'status' in detail &&
          typeof detail.status === 'number' &&
          Number.isInteger(detail.status) &&
          detail.status >= 0 &&
          detail.status <= 599
            ? detail.status
            : 'unknown';
        consoleDiagnostics.push(`${label ?? 'unclassified'}:${status}`);
      } else expectedConsoleErrors.splice(index, 1);
      original.apply(win.console, args);
    };
    win.addEventListener('error', () => {
      uncaughtErrors += 1;
    });
    win.addEventListener('unhandledrejection', () => {
      unhandledRejections += 1;
    });
  });
  // Do not retain tokens, credentials, or authenticated payloads in the command log.
  cy.intercept('/api/**', { middleware: true }, (request) => {
    request.on('before:response', (response) => {
      response.headers['cache-control'] = 'no-store';
    });
  });
  cy.intercept('/api/**', { log: false });
});

afterEach(() => {
  cy.then(() => {
    expect(consoleDiagnostics, 'unexpected console diagnostics').to.deep.equal([]);
    expect(consoleErrors, 'unexpected application console.error count').to.equal(0);
    expect(expectedConsoleErrors.length, 'unobserved expected console.error count').to.equal(0);
    expect(uncaughtErrors, 'uncaught JavaScript error count').to.equal(0);
    expect(unhandledRejections, 'unhandled promise rejection count').to.equal(0);
  });
});
