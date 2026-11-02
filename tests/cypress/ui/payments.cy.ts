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
  let preselected = false;
  const provisional = {
    ...selection,
    primaMensual: selection.prima,
    revision: 1,
    vigenteHasta: new Date(Date.now() + 86400000).toISOString(),
  };
  cy.intercept(
    'GET',
    `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion-provisional`,
    (request) => {
      request.reply({
        solicitudId: quoteId,
        seleccion: preselected ? provisional : null,
        aceptacion: selected ? selection : null,
        estadoOferta: preselected ? (selected ? 'aceptada' : 'disponible') : null,
      });
    },
  );
  cy.intercept(
    'PUT',
    `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion-provisional`,
    (request) => {
      expect(request.body).to.deep.eq({
        ofertaId: selection.ofertaId,
        version: 1,
        revisionEsperada: 0,
      });
      preselected = true;
      request.reply(provisional);
    },
  );
  cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion`, (request) => {
    request.reply(selected ? { body: selection } : { statusCode: 404 });
  });
  cy.intercept('PUT', `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion`, (request) => {
    expect(request.body).to.deep.eq({
      ofertaId: selection.ofertaId,
      version: 1,
      revisionSeleccion: 1,
    });
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
      estado: 'confirmado' as const,
      simulada: true,
      referenciaInterna: 'SIM-payment-ui',
      importe: selection.prima,
      periodicidad: 'mensual',
      confirmadaEn: time,
      saga: { estado: 'pago_confirmado', version: 2, actualizadaEn: time },
    },
  };
}

function rejection(
  payment: ReturnType<typeof reachSubscription>['payment'],
  subscription: ReturnType<typeof reachSubscription>['subscription'],
) {
  const { confirmadaEn, ...fields } = payment;
  return {
    ...fields,
    id: `${payment.id}-rejected`,
    referenciaInterna: `SIM-${payment.id}-rejected`,
    estado: 'rechazado' as const,
    rechazadaEn: confirmadaEn,
    motivo: 'rechazo_simulado',
    saga: subscription.saga,
  };
}

function pendingPayment(
  payment: ReturnType<typeof reachSubscription>['payment'],
  subscription: ReturnType<typeof reachSubscription>['subscription'],
) {
  const { confirmadaEn, ...fields } = payment;
  return {
    ...fields,
    estado: 'pendiente' as const,
    creadaEn: confirmadaEn,
    codigo: 'resultado_no_confirmado',
    saga: subscription.saga,
  };
}

describe('UI determinista: pago simulado y recuperacion (no ledger real)', () => {
  beforeEach(mockBackend);

  it('consulta la clave tras perder la respuesta y nunca envia otro POST', () => {
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
    cy.contains('[role=alert]', 'No fue posible obtener el resultado').should('be.visible');
    cy.contains('h3', 'Pago simulado confirmado').should('not.exist');
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/pago-simulado', () => {
      throw new Error('Recovery must not POST another payment.');
    });
    cy.intercept('GET', '/api/v1/solicitudes-cotizacion/*/pago-simulado', payment).as('recovery');
    cy.contains('button', 'Consultar el mismo intento').click();
    cy.wait('@recovery').then(({ request }) =>
      expect(request.headers['idempotency-key']).to.eq(key),
    );
    cy.contains('h3', 'Pago simulado confirmado').should('be.visible');
    cy.get('.confirm-payment').should('not.exist');
    cy.get('@ambiguous.all').should('have.length', 1);
  });

  it('no muestra exito si el importe recibido difiere de la oferta aceptada', () => {
    const { payment } = reachSubscription();
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/pago-simulado', {
      ...payment,
      importe: { monto: '1.00', moneda: 'COP' },
    });
    cy.contains('button', 'Confirmar pago simulado').click();
    cy.contains('[role=alert]', 'No fue posible obtener el resultado').should('be.visible');
    cy.contains('h3', 'Pago simulado confirmado').should('not.exist');
  });

  it('conserva pendiente tras recargar y consulta la misma clave sin repetir el POST', () => {
    const { payment, subscription } = reachSubscription();
    const pending = pendingPayment(payment, subscription);
    const paymentPath = `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`;
    let key: string;
    let current: typeof pending | typeof payment = pending;
    cy.get('.confirm-payment').should('be.enabled');
    cy.intercept('POST', paymentPath, (request) => {
      expect(key, 'only one POST').to.eq(undefined);
      key = String(request.headers['idempotency-key']);
      expect(request.body).to.deep.eq({});
      request.reply(pending);
    }).as('pendingPayment');
    cy.intercept('GET', paymentPath, (request) => {
      expect(request.headers['idempotency-key']).to.eq(key);
      request.reply(current);
    }).as('readAttempt');
    cy.get('.confirm-payment').click();
    cy.wait('@pendingPayment');
    cy.get('.payment-pending').should(
      'contain.text',
      'Resultado del pago simulado aún no confirmado',
    );
    cy.get('.payment-section').should('not.contain.text', 'Fecha de confirmación');
    cy.get('.payment-section').should('not.contain.text', 'Fecha de rechazo');
    cy.get('.confirm-payment, .retry-issuance, .request-new-payment').should('not.exist');
    cy.reload();
    cy.wait('@readAttempt');
    cy.get('.payment-pending').should('be.visible');
    cy.get('.recover-payment').click();
    cy.wait('@readAttempt');
    cy.get('.payment-pending').should('be.visible');
    cy.then(() => {
      current = payment;
    });
    cy.get('.recover-payment').click();
    cy.wait('@readAttempt');
    cy.get('.payment-confirmation').should('be.visible');
    cy.contains('Póliza emitida').should('not.exist');
    cy.get('@pendingPayment.all').should('have.length', 1);
  });

  it('un404 de recuperacion exacta no inicia otro pago ni rota la clave', () => {
    reachSubscription();
    let key: string;
    const paymentPath = `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`;
    cy.get('.confirm-payment').should('be.enabled');
    cy.intercept('POST', paymentPath, { statusCode: 503 }).as('lostPayment');
    cy.get('.confirm-payment').click();
    cy.wait('@lostPayment').then(({ request }) => {
      key = String(request.headers['idempotency-key']);
    });
    cy.intercept('GET', paymentPath, (request) => {
      expect(request.headers['idempotency-key']).to.eq(key);
      request.reply({ statusCode: 404, body: { code: 'pago_no_encontrado' } });
    }).as('unknownAttempt');
    cy.get('.recover-payment').click();
    cy.wait('@unknownAttempt');
    cy.get('.payment-section [role=alert]').should('contain.text', 'No fue posible encontrar');
    cy.get('.confirm-payment, .request-new-payment, .retry-issuance').should('not.exist');
    cy.reload();
    cy.wait('@unknownAttempt');
    cy.get('.confirm-payment, .request-new-payment, .retry-issuance').should('not.exist');
    cy.get('@lostPayment.all').should('have.length', 1);
  });

  it('el409 rival consulta el pago en curso sin atribuirle su clave ni reenviarla', () => {
    const { payment, subscription } = reachSubscription();
    const pending = pendingPayment(payment, subscription);
    const paymentPath = `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`;
    cy.get('.confirm-payment').should('be.enabled');
    cy.intercept('POST', paymentPath, {
      statusCode: 409,
      headers: { Location: paymentPath },
      body: { code: 'pago_en_proceso', pagoId: payment.id },
    }).as('rivalPayment');
    cy.get('.confirm-payment').click();
    cy.wait('@rivalPayment');
    cy.get('.payment-section [role=alert]').should(
      'contain.text',
      'Ya hay un pago simulado en proceso',
    );
    cy.intercept('GET', paymentPath, (request) => {
      expect(request.headers['idempotency-key']).to.eq(undefined);
      request.reply(pending);
    }).as('activePayment');
    cy.get('.recover-payment').click();
    cy.wait('@activePayment');
    cy.get('.payment-pending').should('be.visible');
    cy.reload();
    cy.wait('@activePayment');
    cy.get('.confirm-payment, .request-new-payment, .retry-issuance').should('not.exist');
    cy.get('@rivalPayment.all').should('have.length', 1);
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
    cy.contains('[role=alert]', 'No fue posible obtener el resultado').should('be.visible');
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

  it('observa emisión recuperada al consultar y recargar sin otro POST de pago', () => {
    const { payment, subscription } = reachSubscription();
    const paymentPath = `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`;
    const issuedSaga = {
      estado: 'emitida',
      version: 3,
      actualizadaEn: new Date(Date.parse(payment.saga.actualizadaEn) + 1).toISOString(),
    };
    let originalKey: string;
    cy.get('.confirm-payment').should('be.enabled');
    cy.intercept(
      { method: 'POST', pathname: paymentPath },
      { statusCode: 503, body: { code: 'servicio_no_disponible' } },
    ).as('lostAcknowledgementWithoutRetry');
    cy.get('.confirm-payment').click();
    cy.wait('@lostAcknowledgementWithoutRetry').then(({ request, response }) => {
      expect(new URL(request.url).pathname).to.eq(paymentPath);
      expect(request.body).to.deep.eq({});
      expect(response?.statusCode).to.eq(503);
      expect(response?.body).to.deep.eq({ code: 'servicio_no_disponible' });
      originalKey = String(request.headers['idempotency-key']);
      expect(originalKey).to.match(/^[0-9a-f-]{36}$/i);
    });
    cy.get('.payment-section [role=alert]')
      .should('be.visible')
      .and(
        'have.text',
        'No fue posible obtener el resultado del pago simulado. Consulta o actualiza el estado; no se enviará otra confirmación mientras el intento siga sin resolver.',
      );
    cy.contains('Póliza emitida').should('not.exist');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/suscripcion`, {
      ...subscription,
      saga: issuedSaga,
    }).as('automaticallyIssuedSubscription');
    cy.intercept('GET', paymentPath, payment).as('unchangedConfirmedPayment');

    for (const action of ['refresh', 'reload']) {
      if (action === 'reload') cy.reload();
      else cy.contains('button', 'Actualizar estado').click();
      cy.wait('@automaticallyIssuedSubscription').then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(response?.body.saga).to.deep.eq(issuedSaga);
      });
      cy.wait('@unchangedConfirmedPayment').then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(response?.body).to.deep.eq(payment);
        expect(response?.body.saga).to.include({ estado: 'pago_confirmado', version: 2 });
      });
      cy.contains('dd', 'Póliza emitida').should('be.visible');
      cy.get('.payment-confirmation').should('contain.text', 'Pago simulado confirmado');
      cy.get('.payment-section [role=alert]').should('not.exist');
      cy.get(
        '.issuance-pending, .confirm-payment, .retry-issuance, .recover-payment, .request-new-payment',
      ).should('not.exist');
      cy.window({ log: false }).should((win) => {
        expect(
          win.sessionStorage.getItem(`solventa.payment.attempt.${subscription.id}`),
          `same payment key after ${action}`,
        ).to.eq(originalKey);
      });
      cy.get('@lostAcknowledgementWithoutRetry.all').should('have.length', 1);
    }
  });

  it('distingue rechazo definitivo de un nuevo intento ambiguo, también después de recargar', () => {
    const { payment, subscription } = reachSubscription();
    const rejected = rejection(payment, subscription);
    let current: typeof payment | typeof rejected | null = null;
    let posts = 0;
    let rejectedKey: string;
    let newKey: string;
    cy.get('.confirm-payment').should('be.enabled');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`, (request) => {
      request.reply(
        current ? { body: current } : { statusCode: 404, body: { code: 'pago_no_encontrado' } },
      );
    }).as('latestPayment');
    cy.intercept('POST', `/api/v1/solicitudes-cotizacion/${quoteId}/pago-simulado`, (request) => {
      posts += 1;
      expect(request.body).to.deep.eq({});
      if (posts === 1) {
        rejectedKey = String(request.headers['idempotency-key']);
        current = rejected;
        request.reply(rejected);
      } else if (posts === 2) {
        newKey = String(request.headers['idempotency-key']);
        expect(newKey).not.to.eq(rejectedKey);
        current = payment;
        request.reply({ statusCode: 503, body: { code: 'servicio_no_disponible' } });
      } else {
        throw new Error('An ambiguous payment must be recovered by GET, never a third POST.');
      }
    }).as('paymentAttempt');
    cy.intercept('GET', '/api/v1/clientes/me/dashboard', {
      ...emptyDashboard,
      pagos: [
        {
          id: rejected.id,
          solicitudId: rejected.solicitudId,
          suscripcionId: rejected.suscripcionId,
          estado: rejected.estado,
          simulada: true,
          importe: rejected.importe,
          periodicidad: rejected.periodicidad,
          rechazadaEn: rejected.rechazadaEn,
          motivo: rejected.motivo,
        },
      ],
    });
    cy.get('.confirm-payment').click();
    cy.wait('@paymentAttempt').its('response.statusCode').should('eq', 200);
    cy.get('.payment-rejection').should('contain.text', 'Pago simulado rechazado');
    cy.get('.payment-section').should('not.contain.text', 'Fecha de confirmación');
    cy.get('.payment-section').should(
      'not.contain.text',
      'Pago simulado pendiente de confirmación',
    );
    cy.get('.payment-confirmation').should('not.exist');
    cy.get('.retry-issuance').should('not.exist');
    cy.visit('/app/dashboard');
    cy.get('[data-testid=dashboard-payment]')
      .should('contain.text', 'Pago simulado rechazado')
      .and('contain.text', 'Fecha de rechazo')
      .and('not.contain.text', 'Confirmado');
    cy.get('[data-testid=dashboard-policy]').should('not.exist');
    cy.visit(`/app/cotizaciones/suscripcion/detalle?solicitud=${quoteId}`);
    cy.get('.payment-rejection').should('be.visible');
    cy.get('@paymentAttempt.all').should('have.length', 1);
    cy.get('.request-new-payment').click();
    cy.get('.new-payment-confirmation').should('contain.text', 'otra clave');
    cy.get('.cancel-new-payment').click();
    cy.get('@paymentAttempt.all').should('have.length', 1);
    cy.get('.request-new-payment').click();
    cy.get('.confirm-new-payment').click();
    cy.wait('@paymentAttempt').its('response.statusCode').should('eq', 503);
    cy.get('.request-new-payment').should('not.exist');
    cy.reload();
    cy.get('.payment-confirmation').should('be.visible');
    cy.get('.request-new-payment').should('not.exist');
    cy.get('.recover-payment').should('not.exist');
    cy.get('@paymentAttempt.all').should('have.length', 2);
    cy.get('@latestPayment.all').should((requests) => {
      const last = requests[requests.length - 1];
      expect(last.request.headers['idempotency-key']).to.eq(newKey);
      expect(last.response?.body.id).to.eq(payment.id);
    });
    cy.get('.payment-rejection').should('not.exist');
    cy.contains('Póliza emitida').should('not.exist');
    cy.get('@paymentAttempt.all').should('have.length', 2);
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
