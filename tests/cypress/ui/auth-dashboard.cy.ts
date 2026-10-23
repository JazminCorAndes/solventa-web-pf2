import { login } from '../support/products';
import { emptyDashboard, grant, mockBackend, password, syntheticUser } from '../support/ui-backend';

describe('UI determinista: autenticacion y dashboard (HTTP controlado)', () => {
  beforeEach(mockBackend);

  it('protege rutas y valida campos sin enviar credenciales invalidas', () => {
    cy.visit('/app/dashboard');
    cy.location('pathname').should('eq', '/iniciar-sesion');
    cy.get('button[type=submit]').click();
    cy.contains('mat-error', 'El correo es obligatorio').should('be.visible');
    cy.contains('mat-error', 'La contraseña es obligatoria').should('be.visible');
    cy.get('#login-email').type('correo-invalido').blur();
    cy.contains('mat-error', 'Ingresa un correo válido').should('be.visible');
    cy.get('@login.all').should('have.length', 0);
  });

  for (const [status, text] of [
    [401, 'El usuario o la contraseña son incorrectos.'],
    [429, 'Demasiados intentos.'],
    [503, 'No fue posible iniciar sesión'],
  ] as const) {
    it(`muestra error ${status} y permite recuperar el login`, () => {
      cy.intercept('POST', '/api/v1/sesiones', { statusCode: status, body: {}, log: false }).as(
        'denied',
      );
      cy.visit('/iniciar-sesion');
      cy.get('#login-email').type(syntheticUser.correo, { log: false });
      cy.get('#login-password').type(password, { log: false });
      cy.get('button[type=submit]').click();
      cy.wait('@denied', { log: false });
      cy.get('[role=alert]').should('contain.text', text);
      cy.location('pathname').should('eq', '/iniciar-sesion');
      cy.intercept('POST', '/api/v1/sesiones', { body: grant(), log: false });
      cy.get('button[type=submit]').click();
      cy.location('pathname').should('eq', '/app/dashboard');
      cy.contains('h1', syntheticUser.nombre).should('be.visible');
    });
  }

  it('recupera dashboard tras 503, renueva al recargar y limpia sesion al salir', () => {
    cy.intercept('GET', '/api/v1/clientes/me/dashboard', { statusCode: 503 }).as('failedDashboard');
    login(syntheticUser.correo, password);
    cy.get('[role=alert]').should('contain.text', 'No fue posible cargar');
    cy.intercept('GET', '/api/v1/clientes/me/dashboard', { body: emptyDashboard });
    cy.contains('button', 'Reintentar').click();
    cy.contains('Aún no tienes cotizaciones registradas.').should('be.visible');
    cy.reload();
    cy.wait('@refresh', { log: false });
    cy.contains('h1', syntheticUser.nombre).should('be.visible');
    cy.contains('button', 'Cerrar sesión').click();
    cy.location('pathname').should('eq', '/iniciar-sesion');
    cy.window({ log: false }).then((win) => {
      expect(win.sessionStorage.getItem('solventa.auth.refresh') === null).to.eq(true);
    });
    cy.visit('/app/dashboard');
    cy.location('pathname').should('eq', '/iniciar-sesion');
  });

  it('descarta una renovacion rechazada sin presentar datos protegidos', () => {
    login(syntheticUser.correo, password);
    cy.intercept('POST', '/api/v1/sesiones/renovar', { statusCode: 401, body: {}, log: false }).as(
      'expired',
    );
    cy.reload();
    cy.wait('@expired', { log: false });
    cy.location('pathname').should('eq', '/iniciar-sesion');
    cy.get('[data-testid=dashboard-policy]').should('not.exist');
  });
});
