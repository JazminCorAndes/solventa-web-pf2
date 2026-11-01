import { fillProduct, login, openQuote, products } from '../support/products';
import {
  emptyDashboard,
  mockBackend,
  password,
  quoteId,
  syntheticUser,
} from '../support/ui-backend';

function reachSubscription(state = 'aprobada') {
  const time = new Date().toISOString();
  const selection = {
    solicitudId: quoteId,
    ofertaId: 'offer-0',
    version: 1,
    nombreOferta: 'Plan sintetico 0',
    prima: { monto: '41250.00', moneda: 'COP' },
    periodicidad: 'mensual',
    seleccionadaEn: time,
  };
  const subscription = {
    id: 'subscription-ui',
    solicitudId: quoteId,
    ofertaId: 'offer-0',
    ofertaVersion: 1,
    estado: state,
    reglaVersion: 'ui-v1',
    creadaEn: time,
    actualizadaEn: time,
    decision: {
      resultado: state,
      reglaVersion: 'ui-v1',
      hashDecision: 'a'.repeat(64),
      decididaEn: time,
    },
    saga: { estado: 'pago_pendiente', version: 1, actualizadaEn: time },
  };
  let selected = false;
  cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion`, (request) => {
    request.reply(selected ? { body: selection } : { statusCode: 404 });
  });
  cy.intercept('PUT', `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion`, (request) => {
    selected = true;
    request.reply(selection);
  }).as('selection');
  cy.intercept('POST', `/api/v1/solicitudes-cotizacion/${quoteId}/suscripcion`, subscription);
  cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/suscripcion`, subscription);
  cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`, {
    statusCode: 404,
    body: { code: 'pago_no_encontrado' },
  });
  login(syntheticUser.correo, password);
  openQuote(products[0]);
  fillProduct(products[0]);
  cy.get('button[type=submit]').click();
  cy.wait('@quote').then(({ response }) => {
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}`, { body: response?.body });
  });
  cy.contains('button', 'Seleccionar oferta').click();
  cy.get('mat-checkbox input').check();
  cy.contains('button', 'Confirmar selección').click();
  cy.wait('@selection');
  cy.location('pathname').should('eq', '/app/cotizaciones/suscripcion');
  return {
    subscription,
    payment: {
      id: 'payment-ui',
      solicitudId: quoteId,
      suscripcionId: subscription.id,
      ofertaId: 'offer-0',
      ofertaVersion: 1,
      estado: 'confirmado',
      simulada: true,
      referenciaInterna: 'SIM-payment-ui',
      importe: selection.prima,
      periodicidad: 'mensual',
      confirmadaEn: time,
      saga: { estado: 'pago_confirmado', version: 2, actualizadaEn: time },
    },
  };
}

describe('UI determinista: pago simulado y recuperacion (no ledger real)', () => {
  beforeEach(mockBackend);

  it('reutiliza clave al reintentar un pago fallido y bloquea una segunda confirmacion', () => {
    const { payment } = reachSubscription();
    let key: string;
    cy.intercept(
      { method: 'POST', url: '/api/v1/solicitudes-cotizacion/*/pago-simulado', times: 1 },
      { statusCode: 503 },
    ).as('ambiguous');
    cy.contains('button', 'Confirmar pago simulado').click();
    cy.wait('@ambiguous').then(({ request }) => {
      key = String(request.headers['idempotency-key']);
    });
    cy.contains('[role=alert]', 'No fue posible consultar o confirmar').should('be.visible');
    cy.contains('h3', 'Pago simulado confirmado').should('not.exist');
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/pago-simulado', payment).as('retry');
    cy.intercept('GET', '/api/v1/solicitudes-cotizacion/*/pago-simulado', payment);
    cy.contains('button', 'Confirmar pago simulado').click();
    cy.wait('@retry').then(({ request }) => expect(request.headers['idempotency-key']).to.eq(key));
    cy.contains('h3', 'Pago simulado confirmado').should('be.visible');
    cy.get('.confirm-payment').should('not.exist');
    cy.get('@retry.all').should('have.length', 1);
  });

  it('no muestra exito si el importe recibido difiere de la oferta aceptada', () => {
    const { payment } = reachSubscription();
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/pago-simulado', {
      ...payment,
      importe: { monto: '1.00', moneda: 'COP' },
    });
    cy.contains('button', 'Confirmar pago simulado').click();
    cy.contains('[role=alert]', 'No fue posible consultar o confirmar').should('be.visible');
    cy.contains('h3', 'Pago simulado confirmado').should('not.exist');
  });

  it('recupera el acuse perdido de emisión con la misma clave y espera la saga autoritativa', () => {
    const { payment, subscription } = reachSubscription();
    let originalKey: string;
    cy.get('.confirm-payment').should('be.enabled');
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/pago-simulado', {
      statusCode: 503,
      body: { code: 'servicio_no_disponible' },
    }).as('lostAcknowledgement');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/suscripcion`, {
      ...subscription,
      saga: payment.saga,
    }).as('authoritativeSubscription');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`, payment).as(
      'persistedPayment',
    );
    cy.intercept('GET', '/api/v1/clientes/me/dashboard', {
      ...emptyDashboard,
      polizas: [
        {
          id: 'policy-ui',
          suscripcionId: subscription.id,
          tipo: 'automotive',
          fechaInicio: '2026-11-01',
          fechaFin: '2026-12-01',
          estado: 'vigente',
          simulada: true,
        },
      ],
    });
    cy.get('.confirm-payment').click();
    cy.wait('@lostAcknowledgement').then(({ request }) => {
      originalKey = String(request.headers['idempotency-key']);
      expect(request.body).to.deep.eq({});
    });
    cy.contains('[role=alert]', 'No fue posible consultar o confirmar').should('be.visible');
    cy.get('.payment-section').should('not.contain.text', 'rechazado');
    cy.contains('Póliza emitida').should('not.exist');
    cy.contains('button', 'Actualizar estado').click();
    cy.wait('@authoritativeSubscription')
      .its('response.body.saga.estado')
      .should('eq', 'pago_confirmado');
    cy.wait('@persistedPayment');
    cy.contains('h3', 'Pago simulado confirmado').should('be.visible');
    cy.contains('Póliza emitida').should('not.exist');
    cy.get('.confirm-payment').should('not.exist');
    cy.contains('button', 'Reintentar emisión').should('be.visible');
    cy.get('@lostAcknowledgement.all').should('have.length', 1);

    cy.visit('/app/dashboard');
    cy.contains('policy-ui').should('be.visible');
    cy.visit(`/app/cotizaciones/suscripcion/detalle?solicitud=${quoteId}`);
    cy.contains('h3', 'Pago simulado confirmado').should('be.visible');
    cy.contains('Póliza emitida').should('not.exist');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/suscripcion`, {
      ...subscription,
      saga: payment.saga,
    }).as('retriedSubscription');
    cy.intercept('POST', `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`, payment).as(
      'retryIssuance',
    );
    cy.contains('button', 'Reintentar emisión').click();
    cy.wait('@retryIssuance').then(({ request, response }) => {
      expect(request.headers['idempotency-key']).to.eq(originalKey);
      expect(request.body).to.deep.eq({});
      expect(response?.body).to.deep.eq(payment);
      expect(response?.body.saga.estado).to.eq('pago_confirmado');
    });
    cy.wait('@retriedSubscription')
      .its('response.body.saga.estado')
      .should('eq', 'pago_confirmado');
    cy.get('.issuance-pending').should('be.visible');
    cy.contains('Póliza emitida').should('not.exist');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/suscripcion`, {
      ...subscription,
      saga: { ...payment.saga, estado: 'emitida', version: 3 },
    }).as('issuedSubscription');
    cy.contains('button', 'Actualizar estado').click();
    cy.wait('@issuedSubscription').its('response.body.saga.estado').should('eq', 'emitida');
    cy.contains('dd', 'Póliza emitida').should('be.visible');
    cy.contains('button', 'Reintentar emisión').should('not.exist');
    cy.get('.confirm-payment').should('not.exist');
    cy.get('@retryIssuance.all').should('have.length', 1);
  });

  for (const state of ['revision', 'rechazada']) {
    it(`no permite pagar una suscripcion ${state}`, () => {
      reachSubscription(state);
      cy.get('.subscription-page dl').should(
        'contain.text',
        state === 'revision' ? 'En revisión' : 'Rechazada',
      );
      cy.get('.confirm-payment').should('not.exist');
    });
  }
});
