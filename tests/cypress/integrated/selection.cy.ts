import { fillProduct, login, openQuote, products } from '../support/products';
import { observeLogin, register } from '../support/real-backend';

interface Offer {
  id: string;
  version: number;
  nombre: string;
  prima: { monto: string; moneda: string };
  periodicidad: string;
  estado: string;
  vigenteHasta: string;
}

interface Selection {
  solicitudId: string;
  ofertaId: string;
  version: number;
  nombreOferta: string;
  prima: Offer['prima'];
  periodicidad: string;
  primaMensual: Offer['prima'] | null;
  seleccionadaEn: string;
}

interface Provisional extends Selection {
  revision: number;
  vigenteHasta: string;
}

interface SelectionState {
  solicitudId: string;
  seleccion: Provisional | null;
  aceptacion: Selection | null;
  estadoOferta: string | null;
}

interface Observation {
  method: string;
  path: string;
  status: number;
  problem?: {
    type: string;
    title: string;
    status: number;
    detail: string;
    code: string;
    correlationId: string;
  };
  problemHeaders?: { contentType: string; correlationId: string };
}

describe('Preseleccion integrada: A a B, recuperacion y aceptacion explicita', () => {
  let evidence: () => Record<string, unknown> = () => ({ phase: 'not-started' });

  afterEach(function () {
    cy.get('body', { log: false }).then(($body) =>
      cy.writeFile(
        'reports/cypress/integrated/selection/selection-evidence.json',
        {
          ...evidence(),
          testStateBeforeSharedGuards: this.currentTest?.state ?? 'unknown',
          ui: {
            title: $body.find('h1').text().trim(),
            offerNames: $body
              .find('.plan-card h2')
              .toArray()
              .map((node) => node.textContent?.trim()),
            confirmationVisible: $body.find('.confirmation-banner').length > 0,
            checkboxChecked: $body.find('mat-checkbox input').prop('checked') ?? null,
            alerts: $body
              .find('[role=alert]')
              .toArray()
              .map((node) => node.textContent?.trim()),
          },
        },
        { log: false },
      ),
    );
  });

  it('guarda A y B sin aceptar, recupera B y solo suscribe tras confirmar su revision', () => {
    const startedAt = new Date().toISOString();
    const diagnostics = { consoleErrors: 0, windowErrors: 0, unhandledRejections: 0 };
    const observations: Observation[] = [];
    const mutations: { method: string; path: string; key: string; body: unknown }[] = [];
    const canonicalStates: SelectionState[] = [];
    const receipts: Provisional[] = [];
    let phase = 'initializing';
    let customerId: string;
    let requestId: string;
    let subscriptionId: string;
    let offerA: Offer;
    let offerB: Offer;
    let acceptance: Selection;
    evidence = () => ({
      startedAt,
      observedAt: new Date().toISOString(),
      phase,
      customerId,
      requestId,
      subscriptionId,
      offerA,
      offerB,
      receipts,
      acceptance,
      canonicalStates,
      mutations,
      requests: observations,
      diagnostics,
      limits:
        'Un caso serial local academico. Identidad completa por fixture, no autorregistro web. Login/AuthInterceptor y servicios reales. Sin POSTpago, emision, AWS, grabaciones ni percentiles. Las consultas automaticas de pago no son cobros. El soporte fuerza Cache-Control:no-store. Esta captura precede las guardas compartidas; solo el XML final acredita el resultado.',
    });

    cy.on('window:before:load', (win) => {
      const original = win.console.error;
      win.console.error = (...args: unknown[]) => {
        diagnostics.consoleErrors++;
        original.apply(win.console, args);
      };
      win.addEventListener('error', () => diagnostics.windowErrors++);
      win.addEventListener('unhandledrejection', () => diagnostics.unhandledRejections++);
    });
    cy.intercept('/api/**', (request) => {
      const path = new URL(request.url).pathname;
      if (
        (request.method === 'POST' && path === '/api/v1/solicitudes-cotizacion') ||
        (request.method !== 'GET' &&
          /\/(?:seleccion(?:-provisional)?|suscripcion|pago-simulado)$/.test(path))
      ) {
        mutations.push({
          method: request.method,
          path,
          key: String(request.headers['idempotency-key']),
          body: request.body,
        });
      }
      request.on('response', (response) => {
        observations.push({
          method: request.method,
          path,
          status: response.statusCode,
          ...(response.statusCode >= 400
            ? {
                problem: response.body,
                problemHeaders: {
                  contentType: String(response.headers['content-type'] ?? ''),
                  correlationId: String(
                    response.headers['x-correlation-id'] ??
                      response.headers['X-Correlation-ID'] ??
                      '',
                  ),
                },
              }
            : {}),
        });
        if (
          request.method === 'GET' &&
          path.endsWith('/seleccion-provisional') &&
          response.statusCode === 200
        ) {
          canonicalStates.push(response.body);
        }
      });
    });
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion').as('selectionQuote');
    cy.intercept('GET', '/api/v1/solicitudes-cotizacion/*/ofertas').as('selectionOffers');
    cy.intercept('PUT', '/api/v1/solicitudes-cotizacion/*/seleccion-provisional').as(
      'provisionalWrite',
    );
    cy.intercept('PUT', '/api/v1/solicitudes-cotizacion/*/seleccion').as('explicitAcceptance');
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/suscripcion').as('explicitSubscription');

    const noPrematureAcceptance = (writes: number) => {
      expect(
        mutations.filter((item) => item.path.endsWith('/seleccion-provisional')),
      ).to.have.length(writes);
      expect(
        mutations.filter((item) => /\/(?:seleccion|suscripcion|pago-simulado)$/.test(item.path)),
      ).to.deep.eq([]);
    };
    const choose = (offer: Offer) => {
      cy.get(`[id="offer-${offer.id}"] .plan-actions button`).first().should('be.enabled').click();
    };
    const expectProvisional = (offer: Offer, revision: number) => {
      cy.wait<unknown, Provisional>('@provisionalWrite', { log: false }).then(
        ({ request, response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(request.body).to.deep.eq({
            ofertaId: offer.id,
            version: offer.version,
            revisionEsperada: revision - 1,
          });
          expect(request.headers['idempotency-key']).to.match(/^[0-9a-f-]{36}$/i);
          expect(response!.body).to.include({
            solicitudId: requestId,
            ofertaId: offer.id,
            version: offer.version,
            nombreOferta: offer.nombre,
            periodicidad: offer.periodicidad,
            revision,
            vigenteHasta: offer.vigenteHasta,
          });
          expect(response!.body.prima).to.deep.eq(offer.prima);
          receipts.push(response!.body);
        },
      );
      cy.location('pathname').should('eq', '/app/cotizaciones/aceptacion');
      cy.get('.acceptance-page .plan-card h2').should('have.text', offer.nombre);
      cy.get('mat-checkbox input').should('not.be.checked');
      cy.contains('button', 'Confirmar selección').should('be.disabled');
      cy.then(() => {
        expect(canonicalStates.at(-1)).to.deep.eq({
          solicitudId: requestId,
          seleccion: receipts[revision - 1],
          aceptacion: null,
          estadoOferta: 'disponible',
        });
        noPrematureAcceptance(revision);
      });
    };

    register().then((account) => {
      customerId = account.id;
      phase = 'identity-created';
      observeLogin();
      login(account.email, account.password);
      cy.wait('@realLogin', { log: false }).its('response.statusCode').should('eq', 200);
      openQuote(products[0]);
      fillProduct(products[0]);
      cy.get('.catalog-status[role=status]').should('not.exist');
      cy.get('button[type=submit]').should('be.enabled').click();
      cy.wait('@selectionQuote', { log: false }).then(({ request, response }) => {
        expect(response?.statusCode).to.eq(201);
        expect(request.body).to.deep.eq({
          productoId: products[0].id,
          datosProducto: products[0].data,
        });
        requestId = response!.body.id;
        phase = 'quote-created';
      });
      cy.wait<unknown, { solicitudId: string; ofertas: Offer[] }>('@selectionOffers', {
        log: false,
      }).then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(response!.body.solicitudId).to.eq(requestId);
        const available = response!.body.ofertas.filter((offer) => offer.estado === 'disponible');
        expect(available.length).to.be.greaterThan(1);
        [offerA, offerB] = available;
        expect(offerA.id).not.to.eq(offerB.id);
      });
      cy.get('.plan-card').first().should('be.visible');
      cy.then(() => choose(offerA));
      cy.then(() => expectProvisional(offerA, 1));
      cy.then(() => {
        phase = 'provisional-a';
      });
      cy.contains('a', 'Volver a las ofertas').click();
      cy.location('pathname').should('eq', '/app/cotizaciones/ofertas');
      cy.get('.plan-card').first().should('be.visible');
      cy.then(() => {
        noPrematureAcceptance(1);
        choose(offerB);
      });
      cy.then(() => expectProvisional(offerB, 2));
      cy.then(() => {
        phase = 'provisional-b';
      });
      cy.window({ log: false }).then((win) =>
        win.sessionStorage.removeItem('solventa.offer.selection'),
      );
      cy.reload();
      cy.get('.acceptance-page .plan-card h2').should(($title) =>
        expect($title.text()).to.eq(offerB.nombre),
      );
      cy.get('mat-checkbox input').should('not.be.checked');
      cy.contains('button', 'Confirmar selección').should('be.disabled');
      cy.then(() => {
        phase = 'resumed-b';
        expect(canonicalStates.at(-1)).to.deep.eq({
          solicitudId: requestId,
          seleccion: receipts[1],
          aceptacion: null,
          estadoOferta: 'disponible',
        });
        noPrematureAcceptance(2);
      });
      cy.get('mat-checkbox input').check().should('be.checked');
      cy.then(() => noPrematureAcceptance(2));
      cy.contains('button', 'Confirmar selección').should('be.enabled').click();
      cy.wait<unknown, Selection>('@explicitAcceptance', { log: false }).then(
        ({ request, response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(request.body).to.deep.eq({
            ofertaId: offerB.id,
            version: offerB.version,
            revisionSeleccion: 2,
          });
          acceptance = response!.body;
          expect(acceptance.prima).to.deep.eq(receipts[1].prima);
          expect(acceptance).to.include({
            solicitudId: requestId,
            ofertaId: offerB.id,
            version: offerB.version,
          });
          phase = 'accepted-b';
        },
      );
      cy.wait('@explicitSubscription', { log: false }).then(({ request, response }) => {
        expect(response?.statusCode).to.be.oneOf([200, 201]);
        expect(request.body).to.deep.eq({});
        expect(response!.body).to.include({
          solicitudId: requestId,
          ofertaId: offerB.id,
          ofertaVersion: offerB.version,
          estado: 'aprobada',
        });
        expect(response!.body.saga.estado).to.eq('pago_pendiente');
        subscriptionId = response!.body.id;
        phase = 'subscribed';
      });
      cy.location('pathname').should('eq', '/app/cotizaciones/suscripcion');
      cy.contains('button', 'Confirmar pago simulado').should('be.enabled');
      cy.go('back');
      cy.location('pathname').should('eq', '/app/cotizaciones/aceptacion');
      cy.contains('.confirmation-banner', 'Selección confirmada').should('be.visible');
      cy.get('mat-checkbox').should('not.exist');
      cy.contains('button', 'Proceder al pago').should('be.enabled');
      cy.then(() => {
        expect(canonicalStates.at(-1)).to.deep.eq({
          solicitudId: requestId,
          seleccion: receipts[1],
          aceptacion: acceptance,
          estadoOferta: 'aceptada',
        });
        const base = `/api/v1/solicitudes-cotizacion/${requestId}`;
        expect(mutations.map(({ method, path }) => `${method} ${path}`)).to.deep.eq([
          'POST /api/v1/solicitudes-cotizacion',
          `PUT ${base}/seleccion-provisional`,
          `PUT ${base}/seleccion-provisional`,
          `PUT ${base}/seleccion`,
          `POST ${base}/suscripcion`,
        ]);
        expect(new Set(mutations.map((item) => item.key)).size).to.eq(5);
        for (const mutation of mutations) expect(mutation.key).to.match(/^[0-9a-f-]{36}$/i);
        const failures = observations.filter((item) => item.status >= 400);
        expect(
          failures.filter((item) => item.path === '/api/v1/consentimientos/perfilamiento'),
        ).to.have.length(1);
        expect(
          failures.filter((item) => item.path === `${base}/pago-simulado`).length,
        ).to.be.greaterThan(0);
        for (const failure of failures) {
          expect(failure.method).to.eq('GET');
          expect(failure.status).to.eq(404);
          const consent = failure.path === '/api/v1/consentimientos/perfilamiento';
          expect(failure.path).to.be.oneOf([
            '/api/v1/consentimientos/perfilamiento',
            `${base}/pago-simulado`,
          ]);
          const code = consent ? 'consentimiento_ausente' : 'pago_no_encontrado';
          expect(failure.problem).to.include({
            status: 404,
            code,
            type: `https://api.solventa.co/problems/${code}`,
            title: consent ? 'Perfilamiento no disponible' : 'Pago simulado no encontrado',
            detail: consent
              ? 'Autoriza el uso de datos antes de cotizar.'
              : 'Esta solicitud todavía no tiene un resultado de pago simulado.',
          });
          expect(Object.keys(failure.problem!).sort()).to.deep.eq(
            ['type', 'title', 'status', 'detail', 'code', 'correlationId'].sort(),
          );
          expect(failure.problem?.correlationId).to.match(
            /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
          );
          expect(failure.problemHeaders?.contentType).to.include('application/problem+json');
          expect(failure.problemHeaders?.correlationId).to.eq(failure.problem?.correlationId);
        }
        expect(diagnostics).to.deep.eq({
          consoleErrors: 0,
          windowErrors: 0,
          unhandledRejections: 0,
        });
        phase = 'checks-complete';
      });
    });
  });
});
