export function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const products = [
  { id: 'automotive', fields: { 'vehicle-plate': 'ABC123' }, data: { vehiclePlate: 'ABC123' } },
  {
    id: 'travel',
    fields: { 'departure-date': futureDate(10), 'return-date': futureDate(20) },
    data: {
      destinationCountryCode: 'ES',
      departureDate: futureDate(10),
      returnDate: futureDate(20),
    },
  },
  { id: 'life', fields: { 'birth-date': '1990-01-15' }, data: { birthDate: '1990-01-15' } },
  {
    id: 'device-protection',
    fields: {
      'device-type': 'Celular',
      'brand-model': 'Sintetico E2E',
      'purchase-value': '3000000',
    },
    data: { deviceType: 'Celular', brandModel: 'Sintetico E2E', purchaseValue: '3000000' },
  },
  {
    id: 'parametric',
    fields: { airline: 'Avianca', 'flight-number': 'AV123', 'flight-date': futureDate(10) },
    data: {
      airline: 'Avianca',
      flightNumber: 'AV123',
      flightDate: futureDate(10),
      coverageType: 'delay-cancellation',
    },
  },
  {
    id: 'parametric-weather',
    fields: {
      'weather-location': 'Villavicencio, Meta',
      'weather-start-date': futureDate(10),
      'weather-end-date': futureDate(20),
      'insured-amount': '10000000',
    },
    data: {
      location: 'Villavicencio, Meta',
      weatherEvent: 'heavy-rain',
      startDate: futureDate(10),
      endDate: futureDate(20),
      insuredAmount: '10000000',
    },
  },
  {
    id: 'payment-protection',
    fields: { 'credit-type': 'Consumo', 'monthly-payment': '850000' },
    data: { creditType: 'Consumo', monthlyPayment: '850000' },
  },
  {
    id: 'mortgage-life',
    fields: { 'mortgage-birth-date': '1990-01-15', 'mortgage-balance': '180000000' },
    data: { birthDate: '1990-01-15', mortgageBalance: '180000000' },
  },
] as const;

export type Product = (typeof products)[number];

export function fillProduct(product: Product) {
  if (product.id === 'travel') {
    cy.get('#destination').type('Espa');
    cy.contains('mat-option', 'España').click();
  }
  for (const [id, value] of Object.entries(product.fields)) {
    cy.get(`#${id}`).clear().type(value).blur();
  }
}

export function login(email: string, password: string) {
  cy.visit('/iniciar-sesion');
  cy.get('#login-email').type(email, { log: false });
  cy.get('#login-password').type(password, { log: false });
  cy.get('button[type=submit]').click();
  cy.location('pathname').should('eq', '/app/dashboard');
}

export function openQuote(product: Product) {
  cy.visit(`/app/cotizaciones/solicitar?producto=${product.id}`);
  cy.get('.product-copy strong').should('not.be.empty');
  cy.contains('button', 'Autorizar perfilamiento').click();
  cy.contains('button', 'Revocar autorización').should('be.visible');
  cy.get('button[type=submit]').should('be.enabled');
}
