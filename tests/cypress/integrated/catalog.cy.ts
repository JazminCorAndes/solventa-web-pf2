import { fillProduct, login, products } from '../support/products';
import { observeLogin, register } from '../support/real-backend';

interface ProductSummary {
  id: string;
  nombre: string;
  descripcion: string;
  disponible: boolean;
  coberturasPrincipales: string[];
}

interface ProductDetail extends ProductSummary {
  coberturas: { nombre: string; descripcion: string }[];
  condiciones: string[];
  informacionRelevante: {
    sumaAsegurada: string;
    deducible: string;
    moneda: string;
    vigencia: string;
  };
}

describe('Catalogo integrado: detalle recibido y una cotizacion desde la UI', () => {
  let evidence: () => Record<string, unknown> = () => ({ phase: 'not-started' });

  afterEach(function () {
    cy.get('body', { log: false }).then(($body) =>
      cy.writeFile(
        'reports/cypress/integrated/catalog/catalog-evidence.json',
        {
          ...evidence(),
          testStateBeforeSharedGuards: this.currentTest?.state ?? 'unknown',
          ui: {
            catalogStatusText: $body.find('.catalog-status').text().trim(),
            selectExpanded: $body.find('mat-select').attr('aria-expanded'),
            selectDisabled: $body.find('mat-select').attr('aria-disabled'),
            optionLabels: $body
              .find('mat-option')
              .toArray()
              .map((option) => option.textContent?.trim()),
            selectedProduct: $body.find('#selected-product-name').text().trim(),
            offerCards: $body.find('.plan-card').length,
          },
        },
        { log: false },
      ),
    );
  });

  it('compara resumen y detalle reales antes de cotizar y llegar a ofertas', () => {
    const product = products[0];
    const diagnostics = { consoleErrors: 0, windowErrors: 0, unhandledRejections: 0 };
    const observed: { method: string; path: string; status: number }[] = [];
    let quotePosts = 0;
    let customerId: string;
    let summary: ProductSummary;
    let detail: ProductDetail;
    let requestId: string;
    let quoteKey: string;
    let offerIds: string[];
    let phase = 'initializing';
    const startedAt = new Date().toISOString();
    evidence = () => ({
      startedAt,
      observedAt: new Date().toISOString(),
      phase,
      customerId,
      productId: product.id,
      summary,
      detail,
      requestId,
      quoteKey,
      offerIds,
      quotePosts,
      diagnostics,
      requests: observed,
      limits:
        'Un caso serial local academico. Fixture completa por Identidad, no registro web. Sin pagos, HU14, emision, AWS ni medicion de percentiles. El soporte existente fuerza Cache-Control:no-store; no se acreditan cabeceras originales. El XML final, no esta captura previa a las guardas compartidas, determina el resultado.',
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
      request.on('response', (response) => {
        observed.push({
          method: request.method,
          path: new URL(request.url).pathname,
          status: response.statusCode,
        });
      });
    });
    cy.intercept('GET', '/api/v1/productos-seguro').as('catalogList');
    cy.intercept('GET', `/api/v1/productos-seguro/${product.id}`).as('catalogDetail');
    cy.intercept('GET', '/api/v1/consentimientos/perfilamiento').as('catalogConsent');
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion', () => {
      quotePosts++;
    }).as('catalogQuote');
    cy.intercept('GET', '/api/v1/solicitudes-cotizacion/*/ofertas').as('catalogOffers');
    cy.intercept('GET', '/api/v1/solicitudes-cotizacion/*/seleccion-provisional').as(
      'catalogSelection',
    );

    register().then((account) => {
      customerId = account.id;
      phase = 'identity-created';
      observeLogin();
      login(account.email, account.password);
      cy.wait('@realLogin', { log: false }).then(({ response }) => {
        expect(response?.statusCode, 'login JWE real').to.eq(200);
        phase = 'authenticated';
      });
      cy.visit('/app/cotizaciones/solicitar');
      cy.wait<unknown, { productos: ProductSummary[] }>('@catalogList', { log: false }).then(
        ({ response }) => {
          expect(response?.statusCode).to.eq(200);
          const found = response!.body.productos.find((item) => item.id === product.id);
          expect(found, 'producto recibido del catalogo real').not.to.eq(undefined);
          summary = found!;
          phase = 'catalog-received';
          expect(summary.disponible).to.eq(true);
          expect(summary.coberturasPrincipales).to.be.an('array');
          expect(summary.coberturasPrincipales.length).to.be.greaterThan(0);
          cy.get('mat-select').should('be.visible');
          cy.get('.catalog-status[role=status]').should('not.exist');
          cy.get('mat-select').should('have.attr', 'aria-disabled', 'false');
          cy.get('mat-select').click();
          cy.get('mat-select').should('have.attr', 'aria-expanded', 'true');
          cy.contains('mat-option', summary.nombre).click();
          cy.get('.product-overview').should('contain.text', summary.descripcion);
          for (const coverage of summary.coberturasPrincipales) {
            cy.get('.product-overview').should('contain.text', coverage);
          }
        },
      );
      cy.wait('@catalogConsent', { log: false }).then(({ response }) => {
        expect(response?.statusCode, 'cliente nuevo sin consentimiento previo').to.eq(404);
        expect(response!.body).to.include({
          status: 404,
          type: 'https://api.solventa.co/problems/consentimiento_ausente',
          title: 'Perfilamiento no disponible',
          detail: 'Autoriza el uso de datos antes de cotizar.',
          code: 'consentimiento_ausente',
        });
      });
      cy.contains('button', 'Ver coberturas y condiciones').click();
      cy.wait<unknown, ProductDetail>('@catalogDetail', { log: false }).then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        detail = response!.body;
        phase = 'detail-received';
        expect(detail.id).to.eq(product.id);
        expect(detail.coberturasPrincipales).to.deep.eq(summary.coberturasPrincipales);
        expect(detail.coberturas).to.be.an('array');
        expect(detail.coberturas.length).to.be.greaterThan(0);
        expect(detail.condiciones).to.be.an('array');
        expect(detail.condiciones.length).to.be.greaterThan(0);
        for (const coverage of detail.coberturas) {
          cy.get('.product-details')
            .should('contain.text', coverage.nombre)
            .and('contain.text', coverage.descripcion);
        }
        for (const condition of detail.condiciones) {
          cy.get('.product-details').should('contain.text', condition);
        }
        for (const value of Object.values(detail.informacionRelevante)) {
          expect(value).to.be.a('string');
          expect(value.length).to.be.greaterThan(0);
          cy.get('.product-details').should('contain.text', value);
        }
      });
      cy.contains('button', 'Autorizar perfilamiento').click();
      cy.contains('button', 'Revocar autorización').should('be.visible');
      fillProduct(product);
      cy.get('button[type=submit]').should('be.enabled').click();
      cy.wait('@catalogQuote', { log: false }).then(({ request, response }) => {
        expect(response?.statusCode).to.eq(201);
        expect(request.body).to.deep.eq({ productoId: product.id, datosProducto: product.data });
        requestId = response!.body.id;
        phase = 'quote-created';
        quoteKey = String(request.headers['idempotency-key']);
        expect(requestId).to.be.a('string');
        expect(requestId.length).to.be.greaterThan(0);
        expect(quoteKey).to.match(/^[0-9a-f-]{36}$/i);
      });
      cy.wait('@catalogOffers', { log: false }).then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(response!.body.ofertas).to.be.an('array');
        expect(response!.body.ofertas.length).to.be.greaterThan(0);
        offerIds = response!.body.ofertas.map((offer: { id: string }) => offer.id);
        phase = 'offers-received';
      });
      cy.wait('@catalogSelection', { log: false }).then(({ request, response }) => {
        expect(new URL(request.url).pathname).to.eq(
          `/api/v1/solicitudes-cotizacion/${requestId}/seleccion-provisional`,
        );
        expect(response?.statusCode, 'estado canonico vacio, no aceptacion').to.eq(200);
        expect(response!.body).to.deep.eq({
          solicitudId: requestId,
          seleccion: null,
          aceptacion: null,
          estadoOferta: null,
        });
      });
      cy.location('pathname').should('eq', '/app/cotizaciones/ofertas');
      cy.get('.plan-card').first().should('be.visible');
      cy.then(() => {
        expect(quotePosts, 'unico POSTcotizacion, emitido por la UI').to.eq(1);
        expect(
          observed.filter((item) => item.status >= 400),
          'solo la consulta inicial sin consentimiento',
        ).to.deep.eq([
          {
            method: 'GET',
            path: '/api/v1/consentimientos/perfilamiento',
            status: 404,
          },
        ]);
        expect(
          observed.filter(
            (item) =>
              item.method !== 'GET' &&
              /\/(?:seleccion(?:-provisional)?|suscripcion|pago-simulado)(?:\/|$)/.test(item.path),
          ),
          'sin preseleccion de oferta, aceptacion, suscripcion ni pagos',
        ).to.deep.eq([]);
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
