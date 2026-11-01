import { login } from '../support/products';
import { api, observeLogin, register, tokenFromLogin } from '../support/real-backend';
import type {
  PartnerQuoteRequest,
  PartnerQuoteResult,
} from '../../../src/app/data-access/quotes/http-partner-quote.gateway';

describe('SOL-205: oferta hipotecaria del socio con backend y persistencia reales', () => {
  it('conserva contexto, explicación e identidad al recuperar y distingue el vencimiento sin otro POST', () => {
    let offer: PartnerQuoteResult;
    let partnerToken: string;
    let customerId: string;
    let recoveryUrl: string;
    register().then((account) => {
      customerId = account.id;
      observeLogin();
      login(account.email, account.password);
      tokenFromLogin().then((token) =>
        api(token, 'PUT', 'consentimientos/perfilamiento', {
          autorizado: true,
          version: 0,
          solicitud: {
            finalidad: 'cotizacion',
            alcances: ['open_finance', 'open_data'],
            fuentes: ['open_finance', 'open_data'],
            datos: ['indicador_riesgo'],
            versionTerminos: '1.0',
            vigenteHasta: new Date(Date.now() + 29 * 86_400_000).toISOString(),
          },
        }),
      );
      cy.contains('button', 'Cerrar sesión').click();
      cy.location('pathname').should('eq', '/iniciar-sesion');
      cy.get('#login-email').type('socio-cypress@example.com', { log: false });
      cy.get('#login-password').type('Cypress-Socio-205!', { log: false });
      cy.get('button[type=submit]').click();
      tokenFromLogin().then((token) => {
        partnerToken = token;
      });
      cy.location('pathname').should('eq', '/app/socios');
      cy.visit('/app/socios/cotizaciones/solicitar?socio=BANK-CYPRESS');
      cy.get('input[formcontrolname=numeroDocumento]').type(account.document);
      cy.contains('button', 'Buscar cliente').click();
      cy.contains('Consentimiento: Vigente').should('be.visible');
      cy.get('#credit-reference').type('HIP-CYPRESS-205');
      cy.get('#mortgage-balance').clear().type('310000000').blur();
      cy.intercept('POST', '/api/v1/socios/solicitudes-cotizacion').as('partnerQuote');
      cy.intercept('GET', '/api/v1/socios/solicitudes-cotizacion/*').as('partnerRecovery');
      cy.get('button[type=submit]').click();
      cy.wait<PartnerQuoteRequest, PartnerQuoteResult>('@partnerQuote', { log: false }).then(
        ({ request, response }) => {
          expect(response?.statusCode).to.eq(201);
          offer = response!.body;
          expect(offer.clienteId).to.eq(customerId);
          expect(offer.socioId).to.eq('BANK-CYPRESS');
          expect(offer.productoId).to.eq('mortgage-life');
          expect(request.body.datosProducto).to.deep.eq({
            mortgageBalance: '310000000',
            referenciaCredito: 'HIP-CYPRESS-205',
          });
          expect(request.headers['idempotency-key']).to.eq(offer.operationId);
          expect(Number(offer.oferta.prima.monto)).to.be.greaterThan(0);
          expect(offer.oferta.explicacion.factoresDeterminantes.length).to.be.greaterThan(0);
          expect(Date.parse(offer.oferta.vigenteHasta)).to.be.greaterThan(Date.now());
        },
      );
      cy.contains('h3', 'Cotización registrada por el servidor').should('be.visible');
      cy.then(() => {
        cy.contains(offer.oferta.nombre).should('be.visible');
        cy.contains(offer.oferta.explicacion.resumen).should('be.visible');
        for (const factor of offer.oferta.explicacion.factoresDeterminantes) {
          cy.contains('.factor-list dt', factor.nombre).should('be.visible');
          cy.contains('.factor-list dd', factor.impacto).should('be.visible');
        }
      });
      cy.location('pathname').then((pathname) => {
        cy.location('search').then((search) => {
          recoveryUrl = pathname + search;
        });
      });
      cy.reload();
      cy.wait<unknown, PartnerQuoteResult>('@partnerRecovery', { log: false }).then(
        ({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(response?.body).to.deep.eq(offer);
        },
      );
      cy.contains('h3', 'Cotización registrada por el servidor').should('be.visible');
      // Advance after authentication, without changing the persisted GET or expiring login on boot.
      cy.clock(Date.now(), ['Date']).then((clock) => {
        cy.intercept('GET', '/api/v1/socios/solicitudes-cotizacion/*', (request) => {
          request.continue(() => clock.setSystemTime(Date.parse(offer.oferta.vigenteHasta)));
        }).as('expiredRecovery');
      });
      cy.then(() => cy.visit(recoveryUrl));
      cy.wait<unknown, PartnerQuoteResult>('@expiredRecovery', { log: false }).then(
        ({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(response?.body).to.deep.eq(offer);
        },
      );
      cy.contains('h3', 'Oferta vencida').should('be.visible');
      cy.contains('Consulta histórica').should('be.visible');
      cy.then(() => cy.contains(offer.oferta.explicacion.resumen).should('be.visible'));
      cy.get('button[type=submit]').should('be.disabled');
      cy.get('@partnerQuote.all').should('have.length', 1);
      cy.then(() =>
        api<PartnerQuoteResult>(
          partnerToken,
          'GET',
          `socios/solicitudes-cotizacion/${offer.operationId}?socioId=BANK-CYPRESS`,
        ),
      ).then(({ body }) => expect(body).to.deep.eq(offer));
      cy.contains('button', 'Preparar otra operación').click();
      cy.location('search').should('not.include', 'operacion=');
      cy.contains('h3', 'Oferta vencida').should('not.exist');
      cy.get('@partnerQuote.all').should('have.length', 1);
      cy.get('button[type=submit]').click();
      cy.get('[role=alert]').should('be.visible');
      cy.get('@partnerQuote.all').should('have.length', 1);
    });
  });
});
