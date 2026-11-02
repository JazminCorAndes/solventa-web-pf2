declare namespace Cypress {
  interface Chainable {
    expectConsoleError(message: string, status: number, code?: string): Chainable<void>;
  }
}
