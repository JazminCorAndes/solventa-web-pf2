import { fillProduct, futureDate, login, openQuote, products } from '../support/products';
import { consent, mockBackend, password, quoteId, syntheticUser } from '../support/ui-backend';
import { historyDto } from '../../../src/testing/quotes/quote-history.testing';

describe('UI determinista: productos y consentimiento (sin persistencia real)', () => {
  beforeEach(() => {
    mockBackend();
    cy.intercept('GET', '/api/v1/destinos-viaje').as('quoteDestinations');
    login(syntheticUser.correo, password);
  });

  it('ofrece vuelos sin seguro paramétrico climático en el selector', () => {
    openQuote(products[0]);
    cy.get('mat-select').click();
    cy.get('mat-option').should('have.length', products.length - 1);
    cy.contains('mat-option', /^\s*parametric\s*$/).should('be.visible');
    cy.contains('mat-option', 'parametric-weather').should('not.exist');
  });

  it('omite cotizaciones compradas y vencidas sin consultar sus detalles', () => {
    openQuote(products[0]);
    const boughtId = 'AQT-2026-COMPRADA01';
    const expiredId = 'AQT-2026-VENCIDA001';
    const entry = (id: string, overrides: Record<string, unknown> = {}) =>
      historyDto({
        operationId: null,
        socioId: null,
        solicitudId: id,
        productoId: 'automotive',
        estadoSeleccion: { solicitudId: id, seleccion: null, aceptacion: null, estadoOferta: null },
        ...overrides,
      });
    cy.intercept('GET', '/api/v1/solicitudes-cotizacion', {
      solicitudes: [
        entry(quoteId),
        entry(boughtId, {
          cotizacionId: '44444444-4444-4444-8444-444444444444',
          estado: 'completada',
          completadaEn: new Date().toISOString(),
          pagoEstado: 'confirmado',
          emisionEstado: 'emitida',
        }),
        entry(expiredId, {
          cotizacionId: '55555555-5555-4555-8555-555555555555',
          estado: 'vencida',
          validaHasta: '2000-01-01T00:00:00Z',
        }),
      ],
    }).as('history');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}`, {
      id: quoteId,
      productoId: 'automotive',
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: syntheticUser.identificacion,
      datosProducto: products[0].data,
      correo: syntheticUser.correo,
      telefono: syntheticUser.telefono,
      estado: 'recibida',
      creadaEn: new Date().toISOString(),
    }).as('pendingDetails');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${boughtId}`, { statusCode: 500 }).as(
      'boughtDetails',
    );
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${expiredId}`, { statusCode: 500 }).as(
      'expiredDetails',
    );
    cy.visit('/app/cotizaciones');
    cy.wait(['@history', '@pendingDetails']);
    cy.get('.summary-card').should('have.length', 1).and('contain.text', quoteId);
    cy.get('.summary-card').should('not.contain.text', boughtId).and('not.contain.text', expiredId);
    cy.get('@boughtDetails.all').should('have.length', 0);
    cy.get('@expiredDetails.all').should('have.length', 0);
  });

  it('no permite cotizar clima mediante un enlace directo', () => {
    openQuote(products[0]);
    cy.visit('/app/cotizaciones/solicitar?producto=parametric-weather');
    cy.get('.product-copy strong').should('contain.text', 'Selecciona un seguro');
    cy.get('#weather-location').should('not.exist');
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@quote.all').should('have.length', 0);
  });

  for (const product of products.filter((product) => product.id !== 'parametric-weather')) {
    it(`${product.id}: obligatorios y contrato completo al solicitar`, () => {
      openQuote(product);
      if (Object.keys(product.fields).length || product.id === 'travel') {
        cy.get('button[type=submit]').click();
        cy.contains('[role=alert]', 'Completa correctamente').should('be.visible');
        cy.get('@quote.all').should('have.length', 0);
      }
      fillProduct(product);
      cy.get('button[type=submit]').click();
      cy.wait('@quote').then(({ request, response }) => {
        expect(request.body).to.deep.eq({ productoId: product.id, datosProducto: product.data });
        expect(request.headers['idempotency-key']).to.match(/^[0-9a-f-]{36}$/i);
        expect(response?.statusCode).to.eq(200);
      });
      cy.location('pathname').should('eq', '/app/cotizaciones/ofertas');
      cy.get('.plan-card').should('have.length', 3);
      cy.contains('.plan-card', 'Plan sintetico 1').should(
        'not.contain.text',
        'Seleccionar oferta',
      );
      cy.contains('.plan-card', 'Plan sintetico 2').should(
        'not.contain.text',
        'Seleccionar oferta',
      );
    });
  }

  it('separa la revisión de toda la grilla, la alinea a la derecha y adapta su ancho en móvil', () => {
    cy.viewport(1280, 900);
    openQuote(products[0]);
    fillProduct(products[0]);
    cy.get('button[type=submit]').click();
    cy.contains('button', 'Seleccionar oferta').click();
    cy.location('pathname').should('eq', '/app/cotizaciones/aceptacion');
    cy.get('a[href="/app/cotizaciones/ofertas"]').click();
    cy.get('.offers-grid .continue-bar').should('not.exist');
    cy.get('.continue-bar a')
      .should('contain.text', 'Revisar selección')
      .and('have.attr', 'href', '/app/cotizaciones/aceptacion');
    cy.get('.offers-page').should(($page) => {
      const grid = $page[0].querySelector('.offers-grid')!.getBoundingClientRect();
      const button = $page[0].querySelector('.continue-bar a')!.getBoundingClientRect();
      expect(button.top - grid.bottom, 'separación superior en escritorio').to.be.at.least(24);
      expect(Math.abs(button.right - grid.right), 'alineación derecha').to.be.at.most(1);
    });
    cy.viewport(390, 844);
    cy.get('.offers-page').should(($page) => {
      const grid = $page[0].querySelector('.offers-grid')!.getBoundingClientRect();
      const button = $page[0].querySelector('.continue-bar a')!.getBoundingClientRect();
      expect(button.top - grid.bottom, 'separación superior en móvil').to.be.at.least(24);
      expect(Math.abs(button.width - grid.width), 'ancho disponible').to.be.at.most(1);
      expect(button.right, 'sin desbordamiento horizontal').to.be.at.most(390);
    });
    cy.get('.continue-bar a').click();
    cy.location('pathname').should('eq', '/app/cotizaciones/aceptacion');
  });

  it('no cotiza sin consentimiento y bloquea nuevamente al revocarlo', () => {
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.disabled');
    cy.contains('Información de perfilamiento').should('not.exist');
    cy.get('app-profiling-panel a[href="/app/consentimiento"]').click();
    cy.get('app-profiling-panel time')
      .invoke('attr', 'datetime')
      .then((vigenteHasta) => {
        cy.contains('button', 'Autorizar perfilamiento').click();
        cy.wait('@consent')
          .its('request.body')
          .should('deep.eq', {
            autorizado: true,
            version: 0,
            solicitud: {
              finalidad: 'cotizacion',
              alcances: ['open_finance', 'open_data'],
              fuentes: ['open_finance', 'open_data'],
              datos: ['indicador_riesgo'],
              versionTerminos: '1.0',
              vigenteHasta,
            },
          });
      });
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.enabled');
    cy.reload();
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.enabled');
    cy.visit('/app/consentimiento');
    cy.contains('button', 'Revocar autorización').click();
    cy.contains('[role=group]', '¿Confirmas la revocación?').should('be.visible');
    cy.get('@consent.all').should('have.length', 1);
    cy.contains('button', 'Conservar autorización').click();
    cy.contains('[role=group]', '¿Confirmas la revocación?').should('not.exist');
    cy.contains('button', 'Revocar autorización').should('be.visible');
    cy.contains('button', 'Revocar autorización').click();
    cy.contains('button', 'Confirmar revocación').click();
    cy.wait('@consent').its('request.body').should('deep.eq', { autorizado: false, version: 1 });
    cy.contains('app-profiling-panel [role=status]', 'Autorización revocada').should('be.visible');
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@quote.all').should('have.length', 0);
  });

  it('registra el rechazo informado y permite autorizar con la siguiente version', () => {
    cy.visit('/app/consentimiento');
    cy.contains('button', 'Rechazar perfilamiento').click();
    cy.wait('@consent').then(({ request, response }) => {
      expect(request.body).to.include({ autorizado: false, version: 0 });
      expect(request.body.solicitud).to.include({
        finalidad: 'cotizacion',
        versionTerminos: '1.0',
      });
      expect(response?.body).to.include({ estado: 'rechazado', version: 1 });
    });
    cy.contains('app-profiling-panel [role=status]', 'Autorización rechazada').should('be.visible');
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@quote.all').should('have.length', 0);
    cy.visit('/app/consentimiento');
    cy.contains('button', 'Autorizar perfilamiento').click();
    cy.wait('@consent').then(({ request, response }) => {
      expect(request.body).to.include({ autorizado: true, version: 1 });
      expect(response?.body).to.include({ estado: 'autorizado', version: 2 });
    });
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.enabled');
  });

  it('no habilita cotizacion con evidencia de consentimiento anterior incompleta', () => {
    cy.intercept('GET', '/api/v1/consentimientos/perfilamiento', {
      body: {
        ...consent(),
        actorId: undefined,
        fuentes: undefined,
        datos: undefined,
        versionTerminos: undefined,
      },
    });
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.disabled');
    cy.visit('/app/consentimiento');
    cy.contains('app-profiling-panel [role=status]', 'La evidencia anterior es incompleta').should(
      'be.visible',
    );
    cy.get('@quote.all').should('have.length', 0);
  });

  it('rechaza una respuesta de autorizacion sin evidencia completa', () => {
    cy.intercept('PUT', '/api/v1/consentimientos/perfilamiento', {
      body: { ...consent(), actorId: undefined },
    }).as('incompleteConsent');
    cy.visit('/app/consentimiento');
    cy.contains('button', 'Autorizar perfilamiento').click();
    cy.wait('@incompleteConsent');
    cy.get('app-profiling-panel [role=alert]').should('be.visible');
    cy.contains('button', 'Revocar autorización').should('not.exist');
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.wait('@quoteDestinations');
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@quote.all').should('have.length', 0);
  });

  it('rechaza autorizacion vencida aunque su estado diga autorizado', () => {
    cy.intercept('GET', '/api/v1/consentimientos/perfilamiento', {
      body: { ...consent(), vigenteHasta: new Date(Date.now() - 1000).toISOString() },
    });
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.get('app-profiling-panel [role=alert]').should('be.visible');
    cy.get('button[type=submit]').should('be.disabled');
  });

  it('no acepta saldo cero en vida hipotecaria', () => {
    openQuote(products[7]);
    fillProduct(products[7]);
    cy.get('#mortgage-balance').clear().type('0').blur();
    cy.get('button[type=submit]').click();
    cy.contains('mat-error', 'Ingresa un valor mayor que cero').should('be.visible');
    cy.get('@quote.all').should('have.length', 0);
  });

  it('valida destino seleccionado y fechas de viaje ordenadas', () => {
    openQuote(products[1]);
    cy.get('#destination').type('Pais inexistente');
    cy.get('#departure-date').type(futureDate(20)).blur();
    cy.get('#return-date').type(futureDate(10)).blur();
    cy.get('button[type=submit]').click();
    cy.contains('mat-error', 'Selecciona un país').should('be.visible');
    cy.contains('mat-error', 'La fecha de regreso').should('be.visible');
    cy.get('@quote.all').should('have.length', 0);
  });

  it('reintenta solicitud tras indisponibilidad sin fabricar un resultado', () => {
    openQuote(products[0]);
    fillProduct(products[0]);
    cy.intercept(
      { method: 'POST', url: '/api/v1/solicitudes-cotizacion', times: 1 },
      { statusCode: 503 },
    ).as('unavailable');
    cy.get('button[type=submit]').click();
    cy.wait('@unavailable');
    cy.contains('[role=alert]', 'No fue posible enviar').should('be.visible');
    cy.location('pathname').should('eq', '/app/cotizaciones/solicitar');
    cy.get('button[type=submit]').should('be.enabled').click();
    cy.wait('@quote');
    cy.location('pathname').should('eq', '/app/cotizaciones/ofertas');
  });

  it('rechaza un recibo con ID inválido sin guardar ni navegar y permite reintentar', () => {
    openQuote(products[0]);
    fillProduct(products[0]);
    cy.intercept({ method: 'POST', url: '/api/v1/solicitudes-cotizacion', times: 1 }, (request) => {
      request.reply({
        id: 'AQT-CYPRESS-UI',
        ...request.body,
        tipoCliente: 'persona_natural',
        tipoDocumento: 'cc',
        identificacion: syntheticUser.identificacion,
        correo: syntheticUser.correo,
        telefono: syntheticUser.telefono,
        estado: 'recibida',
        creadaEn: new Date().toISOString(),
      });
    }).as('invalidReceipt');
    cy.get('button[type=submit]').click();
    cy.wait('@invalidReceipt').its('response.statusCode').should('eq', 200);
    cy.contains('[role=alert]', 'No fue posible enviar').should('be.visible');
    cy.location('pathname').should('eq', '/app/cotizaciones/solicitar');
    cy.get('#vehicle-plate').should('have.value', products[0].data.vehiclePlate);
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem('solventa.quote.request')).to.eq(null);
    });
    cy.get('@offers.all').should('have.length', 0);
    cy.get('button[type=submit]').should('be.enabled').click();
    cy.wait('@quote').its('response.body.id').should('eq', quoteId);
    cy.location('pathname').should('eq', '/app/cotizaciones/ofertas');
    cy.window().then((win) => {
      expect(JSON.parse(win.sessionStorage.getItem('solventa.quote.request')!).id).to.eq(quoteId);
    });
  });

  it('exige aceptar condiciones y muestra error si la oferta cambia', () => {
    openQuote(products[0]);
    fillProduct(products[0]);
    cy.get('button[type=submit]').click();
    cy.contains('button', 'Seleccionar oferta').click();
    cy.contains('button', 'Confirmar selección').should('be.disabled');
    cy.get('mat-checkbox input').check();
    cy.intercept('PUT', '/api/v1/solicitudes-cotizacion/*/seleccion', {
      statusCode: 422,
      body: { code: 'oferta_no_disponible' },
    }).as('selection');
    cy.contains('button', 'Confirmar selección').click();
    cy.wait('@selection')
      .its('request.body')
      .should('deep.eq', { ofertaId: 'offer-0', version: 1, revisionSeleccion: 1 });
    cy.contains('[role=alert]', 'La oferta cambió o venció').should('be.visible');
    cy.location('pathname').should('eq', '/app/cotizaciones/aceptacion');
  });

  it('detiene la seleccion si el perfil vence y ofrece una nueva cotizacion sin crear suscripcion', () => {
    openQuote(products[1]);
    fillProduct(products[1]);
    cy.get('button[type=submit]').click();
    cy.contains('button', 'Seleccionar oferta').click();
    cy.get('mat-checkbox input').check();
    cy.intercept('POST', '/api/v1/solicitudes-cotizacion/*/suscripcion', {
      statusCode: 503,
    }).as('subscription');
    cy.intercept('PUT', '/api/v1/solicitudes-cotizacion/*/seleccion', {
      statusCode: 422,
      body: { code: 'perfil_vencido', detail: 'El perfil venció. Crea una nueva cotización.' },
    }).as('expiredSelection');
    cy.contains('button', 'Confirmar selección').click();
    cy.wait('@expiredSelection');
    cy.contains('[role=alert]', 'El perfil venció').should('be.visible');
    cy.contains('[role=alert] a', 'Cotizar seguro').should(
      'have.attr',
      'href',
      '/app/cotizaciones/solicitar',
    );
    cy.contains('button', 'Confirmar selección').should('be.disabled');
    cy.get('mat-checkbox input').should('not.be.checked').and('be.disabled');
    cy.contains('[role=alert]', 'El perfil venció').should('be.visible');
    cy.contains('button', 'Confirmar selección').should('be.disabled');
    cy.get('@expiredSelection.all').should('have.length', 1);
    cy.get('@subscription.all').should('have.length', 0);
    cy.get('@consent.all').should('have.length', 1);
    cy.get('@quote.all').should('have.length', 1);
  });

  it('no abre planes de una solicitud cuyo perfil ya vencio al recuperarla', () => {
    cy.expectConsoleError('The quote process could not be recovered.', 422, 'perfil_vencido');
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/estado`, {
      body: historyDto({
        operationId: null,
        socioId: null,
        solicitudId: quoteId,
        productoId: 'travel',
        estadoSeleccion: {
          solicitudId: quoteId,
          seleccion: null,
          aceptacion: null,
          estadoOferta: null,
        },
      }),
    });
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}`, {
      id: quoteId,
      productoId: 'travel',
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: syntheticUser.identificacion,
      datosProducto: products[1].data,
      correo: syntheticUser.correo,
      telefono: syntheticUser.telefono,
      estado: 'recibida',
      creadaEn: new Date(Date.now() - 3600000).toISOString(),
    });
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/suscripcion`, {
      statusCode: 404,
    });
    cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion-provisional`, {
      statusCode: 422,
      body: { code: 'perfil_vencido' },
    });
    cy.visit(`/app/cotizaciones/ofertas?solicitud=${quoteId}`);
    cy.location('pathname').should('eq', '/app/cotizaciones');
    cy.contains('[role=alert]', 'El perfil venció').should('be.visible');
    cy.get('@offers.all').should('have.length', 0);
    cy.get('@quote.all').should('have.length', 0);
    cy.get('@consent.all').should('have.length', 0);
  });
});
