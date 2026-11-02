beforeEach(() => {
  // Do not retain tokens, credentials, or authenticated payloads in the command log.
  cy.intercept('/api/**', { middleware: true }, (request) => {
    request.on('before:response', (response) => {
      response.headers['cache-control'] = 'no-store';
    });
  });
  cy.intercept('/api/**', { log: false });
});
