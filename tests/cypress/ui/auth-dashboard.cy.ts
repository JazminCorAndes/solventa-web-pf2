import { login } from '../support/products';
import { emptyDashboard, grant, mockBackend, password, syntheticUser } from '../support/ui-backend';
import { expectEncryptedLogin } from '../support/login-crypto';
import partnerContext from '../../../src/app/features/partners/testing/partner-context-real.json';

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
    [403, 'Tu cuenta no tiene el alcance necesario para acceder a esta sección.'],
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
      cy.wait('@denied', { log: false }).then(({ request }) => {
        expectEncryptedLogin(request.body);
        expect(JSON.stringify(request.body).includes(password), 'sin contraseña en HTTP').to.eq(
          false,
        );
      });
      cy.get('[role=alert]').should('contain.text', text);
      cy.location('pathname').should('eq', '/iniciar-sesion');
      cy.intercept('POST', '/api/v1/sesiones', { body: grant(), log: false }).as('retriedLogin');
      cy.get('button[type=submit]').click();
      cy.location('pathname').should('eq', '/app/dashboard');
      cy.contains('h1', syntheticUser.nombre).should('be.visible');
      cy.wait('@retriedLogin', { log: false }).then(({ request }) => {
        expectEncryptedLogin(request.body);
        expect(JSON.stringify(request.body).includes(password), 'sin fallback en reintento').to.eq(
          false,
        );
      });
      cy.get('@loginChallenge.all').should('have.length', 2);
    });
  }

  it('conserva el rol socio con login cifrado y navega solo al portal autorizado', () => {
    cy.intercept('POST', '/api/v1/sesiones', {
      body: { ...grant(), usuario: partnerContext.usuario },
      log: false,
    }).as('partnerLogin');
    cy.intercept('GET', '/api/v1/socios/actual', { body: partnerContext }).as('partnerContext');
    cy.visit('/iniciar-sesion');
    cy.get('#login-email').type(partnerContext.usuario.correo, { log: false });
    cy.get('#login-password').type(password, { log: false });
    cy.get('button[type=submit]').click();
    cy.wait('@partnerLogin', { log: false }).then(({ request }) => {
      expectEncryptedLogin(request.body);
      expect(JSON.stringify(request.body).includes(password), 'sin contraseña en HTTP').to.eq(
        false,
      );
    });
    cy.wait('@partnerContext', { log: false });
    cy.location('pathname').should('eq', '/app/socios');
    cy.contains('h1', 'Portal de socios').should('be.visible');
    cy.contains(partnerContext.socios[0].socioId).should('be.visible');
    cy.get('a[href="/app/cotizaciones"]').should('not.exist');
    cy.get('@dashboard.all').should('have.length', 0);
  });

  for (const failure of ['malformed', 'expired', 'unavailable'] as const) {
    it(`rechaza desafio ${failure} sin POST y obtiene otro al reintentar`, () => {
      cy.intercept(
        { method: 'GET', url: '/api/v1/sesiones/desafio', times: 1 },
        {
          statusCode: failure === 'unavailable' ? 503 : 200,
          body:
            failure === 'expired'
              ? { desafioId: 'expired', expiraEn: new Date(0).toISOString(), clavePublica: {} }
              : { clavePublica: { kty: 'oct', k: 'not-an-rsa-public-key' } },
          log: false,
        },
      ).as('failedChallenge');
      cy.visit('/iniciar-sesion');
      cy.get('#login-email').type(syntheticUser.correo, { log: false });
      cy.get('#login-password').type(password, { log: false });
      cy.get('button[type=submit]').click();
      cy.wait('@failedChallenge', { log: false });
      cy.get('[role=alert]').should('contain.text', 'No fue posible iniciar sesión');
      cy.get('@login.all').should('have.length', 0);
      cy.get('button[type=submit]').click();
      cy.location('pathname').should('eq', '/app/dashboard');
    });
  }

  it('explica la falta de Web Crypto sin enviar credenciales ni pedir un desafio', () => {
    cy.visit('/iniciar-sesion', {
      onBeforeLoad(win) {
        Object.defineProperty(win.crypto, 'subtle', { value: undefined });
      },
    });
    cy.get('#login-email').type(syntheticUser.correo, { log: false });
    cy.get('#login-password').type(password, { log: false });
    cy.get('button[type=submit]').click();
    cy.get('[role=alert]').should('contain.text', 'HTTPS').and('contain.text', 'Web Crypto');
    cy.get('@loginChallenge.all').should('have.length', 0);
    cy.get('@login.all').should('have.length', 0);
    cy.get('button[type=submit]').should('be.enabled');
  });

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
