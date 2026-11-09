import { fillProduct, products } from '../support/products';
import { api, Grant, observeLogin, request } from '../support/real-backend';
import { expectEncryptedRegistration } from '../support/login-crypto';
import { fillRegistration } from '../support/registration';

interface Consent {
  consentimientoId: string;
  clienteId: string;
  actorId: string;
  estado: string;
  version: number;
  efectivaEn: string;
  vigenteHasta: string;
  finalidad: string;
  alcances: string[];
  fuentes: string[];
  datos: string[];
  versionTerminos: string;
}

describe('Registro web y consentimiento persistidos en el backend real', () => {
  for (const authorized of [true, false]) {
    it(`registra desde la web con autorizacion ${authorized}, inicia sesion y conserva la decision`, () => {
      const unique = crypto.randomUUID();
      const account = {
        nombre: 'Cliente Registro Cypress',
        correo: `cypress-registration-${unique}@example.com`,
        contrasena: `E2e-${unique}!`,
        tipoDocumento: 'cc',
        numeroDocumento: String(1_000_000_000 + crypto.getRandomValues(new Uint32Array(1))[0]),
        telefono: '+573001234567',
        fechaNacimiento: '1990-01-15',
      };
      let customerId: string;
      let token: string;
      let original: Consent;
      let quoteId: string;
      let registrations = 0;
      let registrationChallenges = 0;
      let consentWrites = 0;
      const statuses: { method: string; path: string; status: number }[] = [];
      if (!authorized) cy.viewport(390, 844);

      cy.intercept('/api/**', (req) => {
        req.on('response', (res) => {
          statuses.push({
            method: req.method,
            path: new URL(req.url).pathname,
            status: res.statusCode,
          });
        });
      });
      cy.intercept('POST', '/api/v1/usuarios', () => registrations++).as('registration');
      cy.intercept('GET', '/api/v1/usuarios/desafio', () => registrationChallenges++).as(
        'registrationChallenge',
      );
      cy.intercept('GET', '/api/v1/consentimientos/perfilamiento').as('consent');
      cy.intercept('PUT', '/api/v1/consentimientos/perfilamiento', () => consentWrites++).as(
        'decision',
      );
      cy.intercept('POST', '/api/v1/solicitudes-cotizacion').as('quote');
      cy.intercept('GET', '/api/v1/solicitudes-cotizacion/*/ofertas').as('offers');

      cy.visit('/iniciar-sesion');
      cy.contains('a', 'Registrarse').click();
      cy.location('pathname').should('eq', '/registrarse');
      cy.get('input[type=radio]:checked').should('not.exist');
      cy.contains('30 días').should('be.visible');
      cy.window({ log: false }).then((win) => {
        expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth);
      });
      cy.get('button[type=submit]').click();
      cy.contains('[role=alert]', 'Selecciona si autorizas').should('be.visible');
      cy.then(() => expect(registrations, 'no registro con datos incompletos').to.eq(0));
      cy.then(() => expect(registrationChallenges, 'sin desafío con datos incompletos').to.eq(0));
      fillRegistration(account, authorized);
      cy.get('button[type=submit]').click();
      cy.wait('@registrationChallenge', { log: false }).then(({ response }) => {
        expect(response?.statusCode, 'desafío real de registro').to.eq(200);
      });
      cy.wait('@registration', { log: false }).then(({ request: req, response }) => {
        expect(response?.statusCode, 'registro real desde BFF').to.eq(201);
        expectEncryptedRegistration(req.body);
        expect(Object.keys(req.body).sort()).to.deep.eq(
          [
            ...Object.keys(account).filter((field) => field !== 'contrasena'),
            'credencialCifrada',
            'consentimiento',
          ].sort(),
        );
        expect(
          JSON.stringify(req.body).includes(account.contrasena),
          'sin contraseña en HTTP',
        ).to.eq(false);
        expect(req.body.consentimiento).to.deep.eq({
          autorizado: authorized,
          versionTerminos: '1.0',
        });
        customerId = response!.body.usuario.id;
        expect(customerId).to.be.a('string');
        expect(response!.body.accessToken, 'alta sin sesion implicita').to.eq(undefined);
        expect(registrations).to.eq(1);
        expect(registrationChallenges).to.eq(1);
      });
      cy.contains('[role=status]', 'Tu cuenta fue creada').should('be.visible');
      cy.window({ log: false }).then((win) => {
        expect(win.sessionStorage.getItem('solventa.auth.refresh')).to.eq(null);
      });
      observeLogin();
      cy.contains('a', 'Iniciar sesión').click();
      cy.get('#login-email').type(account.correo, { log: false });
      cy.get('#login-password').type(account.contrasena, { log: false });
      cy.get('button[type=submit]').click();
      cy.wait<unknown, Grant>('@realLogin', { log: false }).then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(response!.body.usuario.id).to.eq(customerId);
        token = response!.body.accessToken;
      });
      cy.location('pathname').should('eq', '/app/dashboard');
      cy.get('.dashboard .metric-grid').should('be.visible');
      if (!authorized) cy.get('button[aria-label="Abrir menú"]').click();
      cy.contains('a', /^Consentimiento$/).click();
      cy.location('pathname').should('eq', '/app/consentimiento');
      cy.wait<unknown, Consent>('@consent', { log: false }).then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        original = response!.body;
        expect(original).to.include({
          clienteId: customerId,
          actorId: customerId,
          estado: authorized ? 'autorizado' : 'rechazado',
          version: 1,
          finalidad: 'cotizacion',
          versionTerminos: '1.0',
        });
        expect(original.alcances).to.deep.eq(['open_finance', 'open_data']);
        expect(original.fuentes).to.deep.eq(['open_finance', 'open_data']);
        expect(original.datos).to.deep.eq(['indicador_riesgo']);
        expect(Date.parse(original.vigenteHasta) - Date.parse(original.efectivaEn)).to.eq(
          30 * 86400000,
        );
      });
      cy.contains(authorized ? 'Autorización registrada' : 'Autorización rechazada').should(
        'be.visible',
      );
      cy.reload();
      cy.wait<unknown, Consent>('@consent', { log: false }).then(({ response }) => {
        expect(response?.body, 'recarga conserva decision y fecha sin extenderla').to.deep.eq(
          original,
        );
        expect(consentWrites, 'sin renovacion automatica').to.eq(0);
      });

      if (authorized) {
        cy.visit('/app/cotizaciones/solicitar?producto=automotive');
        cy.wait('@consent', { log: false });
        cy.contains('button', 'Revocar autorización').should('be.visible');
        cy.get('.product-copy strong').should('not.be.empty');
        fillProduct(products[0]);
        cy.get('button[type=submit]').should('be.enabled').click();
        cy.wait('@quote', { log: false }).then(({ response }) => {
          expect(response?.statusCode, 'datos maestros permiten cotizar').to.eq(201);
          quoteId = response!.body.id;
        });
        cy.wait('@offers', { log: false }).then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(response!.body.ofertas.length).to.be.greaterThan(0);
        });
        cy.get('.plan-card').first().should('be.visible');
        cy.contains('a', /^Consentimiento$/).click();
        cy.wait('@consent', { log: false });
        cy.contains('button', 'Revocar autorización').click();
        cy.contains('button', 'Conservar autorización').click();
        cy.then(() => expect(consentWrites, 'cancelar no modifica autorizacion').to.eq(0));
        cy.contains('button', 'Revocar autorización').click();
        cy.contains('button', 'Confirmar revocación').click();
        cy.wait<unknown, Consent>('@decision', { log: false }).then(
          ({ request: req, response }) => {
            expect(req.body).to.deep.eq({ autorizado: false, version: 1 });
            expect(response?.statusCode).to.eq(200);
            expect(response!.body.estado).to.eq('revocado');
            expect(response!.body.version).to.eq(2);
          },
        );
        cy.contains('Autorización revocada').should('be.visible');
        cy.intercept('GET', '/api/v1/consentimientos/perfilamiento').as('revokedConsent');
        cy.reload();
        cy.wait<unknown, Consent>('@revokedConsent', { log: false }).then(({ response }) => {
          expect(response?.body.estado).to.eq('revocado');
          expect(response?.body.version).to.eq(2);
          expect(consentWrites).to.eq(1);
        });
        cy.contains('Autorización revocada').should('be.visible');
      }

      cy.then(() =>
        request({
          method: 'POST',
          url: '/api/v1/solicitudes-cotizacion',
          headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
          body: { productoId: products[0].id, datosProducto: products[0].data },
        }),
      ).then(({ status, body }) => {
        expect(status, 'rechazo/revocacion impide nuevas cotizaciones').to.eq(403);
        expect(body.code).to.eq('consentimiento_no_vigente');
      });
      cy.then(() =>
        api<Consent>(token, 'GET', 'consentimientos/perfilamiento').then(({ body }) => {
          expect(body.estado).to.eq(authorized ? 'revocado' : 'rechazado');
        }),
      );
      cy.then(() =>
        cy.writeFile(
          `reports/cypress/integrated/registration/decision-${authorized}.json`,
          {
            authorized,
            customerId,
            quoteId,
            registrations,
            registrationChallenges,
            encryptedRegistration: true,
            consentWrites,
            consentId: original.consentimientoId,
            initialEffectiveAt: original.efectivaEn,
            initialValidUntil: original.vigenteHasta,
            observed: statuses,
            limits:
              'Backend local desechable y fuentes simuladas. Sin despliegue, pagos ni datos reales.',
          },
          { log: false },
        ),
      );
    });
  }
});
