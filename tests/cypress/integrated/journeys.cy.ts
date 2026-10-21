import { fillProduct, login, openQuote, products } from '../support/products';
import {
  api,
  awaitIssued,
  Dashboard,
  observeLogin,
  register,
  request,
  tokenFromLogin,
} from '../support/real-backend';
import type { RiskProfile } from '../../../src/app/core/profiling/profiling.models';

describe('E2E integrado: UI -> BFF -> servicios -> persistencia real', () => {
  for (const product of products) {
    it(`${product.id}: cotiza, acepta, paga una vez y recupera poliza en otra sesion`, () => {
      let requestId: string;
      let paymentId: string;
      let subscriptionId: string;
      let paymentKey: string;
      let premium: { monto: string; moneda: string };
      let token: string;
      register().then((account) => {
        observeLogin();
        login(account.email, account.password);
        tokenFromLogin().then((value) => {
          token = value;
        });
        cy.intercept('POST', '/api/v1/solicitudes-cotizacion').as('realQuote');
        cy.intercept('PUT', '/api/v1/solicitudes-cotizacion/*/seleccion').as('realSelection');
        cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/suscripcion').as('realSubscription');
        cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/pago-simulado').as('realPayment');
        openQuote(product);
        fillProduct(product);
        cy.get('button[type=submit]').click();
        cy.wait('@realQuote', { log: false }).then(({ request, response }) => {
          expect(response?.statusCode).to.be.oneOf([200, 201]);
          expect(request.body).to.deep.eq({ productoId: product.id, datosProducto: product.data });
          requestId = response!.body.id;
          expect(requestId).to.be.a('string');
          expect(requestId.length).to.be.greaterThan(0);
        });
        cy.then(() =>
          api<RiskProfile>(token, 'GET', `solicitudes-cotizacion/${requestId}/perfilamiento`),
        ).then(({ body }) => {
          expect(body.solicitudId).to.eq(requestId);
          expect(body.consentimientoVersion).to.eq(1);
          expect(body.modeloVersion.length).to.be.greaterThan(0);
          expect(body.fuentes.map((source) => source.nombre).sort()).to.deep.eq([
            'open_data',
            'open_finance',
          ]);
          expect(body.fuentes.every((source) => source.simulada)).to.eq(true);
          expect(body.fallbackUsed).to.eq(false);
          expect(Date.parse(body.vigenteHasta)).to.be.greaterThan(Date.now());
        });
        cy.contains('button', 'Seleccionar oferta').first().click();
        cy.get('mat-checkbox input').check();
        cy.contains('button', 'Confirmar selección').click();
        cy.wait('@realSelection', { log: false }).then(({ response }) => {
          expect(response?.statusCode).to.be.oneOf([200, 201]);
          premium = response!.body.prima;
          expect(Number(premium.monto)).to.be.greaterThan(0);
        });
        cy.wait('@realSubscription', { log: false }).then(({ response }) => {
          expect(response?.statusCode).to.be.oneOf([200, 201]);
          expect(response!.body.estado, 'fixture debe producir decision aprobada').to.eq(
            'aprobada',
          );
          subscriptionId = response!.body.id;
          expect(response!.body.decision.hashDecision).to.match(/^[0-9a-f]{64}$/i);
          expect(response!.body.decision.reglaVersion).to.eq(response!.body.reglaVersion);
        });
        cy.contains('button', 'Confirmar pago simulado').should('be.enabled').click();
        cy.wait('@realPayment', { log: false }).then(({ request, response }) => {
          expect(response?.statusCode).to.be.oneOf([200, 201]);
          expect(response!.body.simulada).to.eq(true);
          expect(response!.body.importe).to.deep.eq(premium);
          expect(response!.body.suscripcionId).to.eq(subscriptionId);
          paymentId = response!.body.id;
          paymentKey = String(request.headers['idempotency-key']);
          expect(paymentKey).to.match(/^[0-9a-f-]{36}$/i);
        });
        cy.contains('h3', 'Pago simulado confirmado').should('be.visible');
        cy.get('.confirm-payment').should('not.exist');
        cy.then(() =>
          api<{ id: string }>(
            token,
            'POST',
            `solicitudes-cotizacion/${requestId}/pago-simulado`,
            {},
            paymentKey,
          ),
        ).then(({ body }) => expect(body.id, 'replay idempotente').to.eq(paymentId));
        cy.then(() => awaitIssued(token, requestId)).then((snapshot) => {
          expect(snapshot.pagos.filter((item) => item.solicitudId === requestId)).to.have.length(1);
          const policies = snapshot.polizas.filter((item) => item.suscripcionId === subscriptionId);
          expect(policies).to.have.length(1);
          expect(policies[0].simulada).to.eq(true);
        });
        cy.reload();
        cy.contains('h3', 'Pago simulado confirmado').should('be.visible');
        cy.contains('button', 'Cerrar sesión').click();
        cy.location('pathname').should('eq', '/iniciar-sesion');
        cy.window({ log: false }).then((win) => {
          win.sessionStorage.clear();
          win.localStorage.clear();
        });
        login(account.email, account.password);
        cy.get('[data-testid=dashboard-policy]').should('have.length', 1);
        cy.get('[data-testid=dashboard-payment]')
          .should('have.length', 1)
          .and(($record) => expect($record.text()).to.include(paymentId));
        cy.get('[data-testid=dashboard-quote]')
          .should('have.length', 1)
          .and(($record) => expect($record.text()).to.include(requestId));
        cy.then(() => cy.visit(`/app/cotizaciones/suscripcion/detalle?solicitud=${requestId}`));
        cy.contains('h1', 'Detalle de la suscripción').should('be.visible');
        cy.contains('h3', 'Pago simulado confirmado').should('be.visible');
        cy.get('.confirm-payment').should('not.exist');
      });
    });
  }

  it('aisla solicitudes ajenas en API y enlaces UI; el segundo usuario no hereda datos', () => {
    let requestId: string;
    register().then((owner) => {
      observeLogin();
      login(owner.email, owner.password);
      openQuote(products[0]);
      fillProduct(products[0]);
      cy.intercept('POST', '/api/v1/solicitudes-cotizacion').as('ownedQuote');
      cy.get('button[type=submit]').click();
      cy.wait('@ownedQuote', { log: false }).then(({ response }) => {
        requestId = response!.body.id;
      });
      cy.location('pathname').should('eq', '/app/cotizaciones/ofertas');
      cy.contains('button', 'Cerrar sesión').click();
    });
    register().then((stranger) => {
      login(stranger.email, stranger.password);
      // Consume the owner's login observation before reading the stranger's.
      cy.wait('@realLogin', { log: false });
      tokenFromLogin().then((token) => {
        for (const suffix of [
          '',
          '/ofertas',
          '/seleccion',
          '/suscripcion',
          '/perfilamiento',
          '/pago-simulado',
        ]) {
          request({
            url: `/api/v1/solicitudes-cotizacion/${requestId}${suffix}`,
            headers: { Authorization: `Bearer ${token}` },
          }).then(({ status }) => expect(status, `ownership ${suffix || '/solicitud'}`).to.eq(404));
        }
        api<Dashboard>(token, 'GET', 'clientes/me/dashboard').then(({ body }) => {
          expect(body.cotizaciones).to.deep.eq([]);
          expect(body.pagos).to.deep.eq([]);
          expect(body.polizas).to.deep.eq([]);
        });
      });
      cy.then(() => cy.visit(`/app/cotizaciones/ofertas?solicitud=${requestId}`));
      cy.location('pathname').should('eq', '/app/cotizaciones');
      cy.location('search').should('include', 'error=resume');
      cy.get('[role=alert]').should('be.visible');
      cy.get('.plan-card').should('not.exist');
    });
  });

  it('revoca consentimiento real e impide reutilizar perfil y crear otra cotizacion', () => {
    let token: string;
    let requestId: string;
    register().then((account) => {
      observeLogin();
      login(account.email, account.password);
      tokenFromLogin().then((value) => {
        token = value;
      });
      openQuote(products[0]);
      fillProduct(products[0]);
      cy.intercept('POST', '/api/v1/solicitudes-cotizacion').as('beforeRevocation');
      cy.get('button[type=submit]').click();
      cy.wait('@beforeRevocation', { log: false }).then(({ response }) => {
        requestId = response!.body.id;
      });
      cy.location('pathname').should('eq', '/app/cotizaciones/ofertas');
      cy.visit('/app/cotizaciones/solicitar?producto=automotive');
      cy.contains('button', 'Revocar autorización').click();
      cy.get('button[type=submit]').should('be.disabled');
      cy.then(() => {
        request({
          url: `/api/v1/solicitudes-cotizacion/${requestId}/perfilamiento`,
          headers: { Authorization: `Bearer ${token}` },
        }).then(({ status, body }) => {
          expect(status, 'perfil no reutilizable').to.eq(403);
          expect(body.code).to.eq('consentimiento_no_vigente');
        });
        request({
          method: 'POST',
          url: '/api/v1/solicitudes-cotizacion',
          headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
          body: { productoId: 'automotive', datosProducto: products[0].data },
        }).then(({ status, body }) => {
          expect(status, 'cotizacion sin autorizacion').to.eq(403);
          expect(body.code).to.eq('consentimiento_no_vigente');
        });
      });
    });
  });
});
