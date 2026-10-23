import { fillProduct, futureDate, login, openQuote, products } from '../support/products';
import { consent, mockBackend, password, syntheticUser } from '../support/ui-backend';

describe('UI determinista: productos y consentimiento (sin persistencia real)', () => {
  beforeEach(() => {
    mockBackend();
    login(syntheticUser.correo, password);
  });

  for (const product of products) {
    it(`${product.id}: obligatorios y contrato completo al solicitar`, () => {
      openQuote(product);
      cy.get('button[type=submit]').click();
      cy.contains('[role=alert]', 'Completa correctamente').should('be.visible');
      cy.get('@quote.all').should('have.length', 0);
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

  it('no cotiza sin consentimiento y bloquea nuevamente al revocarlo', () => {
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.get('button[type=submit]').should('be.disabled');
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
    cy.get('button[type=submit]').should('be.enabled');
    cy.reload();
    cy.get('button[type=submit]').should('be.enabled');
    cy.contains('button', 'Revocar autorización').click();
    cy.contains('[role=group]', '¿Confirmas la revocación?').should('be.visible');
    cy.get('@consent.all').should('have.length', 1);
    cy.contains('button', 'Conservar autorización').click();
    cy.contains('[role=group]', '¿Confirmas la revocación?').should('not.exist');
    cy.get('button[type=submit]').should('be.enabled');
    cy.contains('button', 'Revocar autorización').click();
    cy.contains('button', 'Confirmar revocación').click();
    cy.wait('@consent').its('request.body').should('deep.eq', { autorizado: false, version: 1 });
    cy.contains('app-profiling-panel [role=status]', 'Autorización revocada').should('be.visible');
    cy.reload();
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@quote.all').should('have.length', 0);
  });

  it('registra el rechazo informado y permite autorizar con la siguiente version', () => {
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
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
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@quote.all').should('have.length', 0);
    cy.contains('button', 'Autorizar perfilamiento').click();
    cy.wait('@consent').then(({ request, response }) => {
      expect(request.body).to.include({ autorizado: true, version: 1 });
      expect(response?.body).to.include({ estado: 'autorizado', version: 2 });
    });
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
    cy.contains('app-profiling-panel [role=status]', 'La evidencia anterior es incompleta').should(
      'be.visible',
    );
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@quote.all').should('have.length', 0);
  });

  it('rechaza una respuesta de autorizacion sin evidencia completa', () => {
    cy.intercept('PUT', '/api/v1/consentimientos/perfilamiento', {
      body: { ...consent(), actorId: undefined },
    }).as('incompleteConsent');
    cy.visit('/app/cotizaciones/solicitar?producto=automotive');
    cy.contains('button', 'Autorizar perfilamiento').click();
    cy.wait('@incompleteConsent');
    cy.get('app-profiling-panel [role=alert]').should('be.visible');
    cy.contains('button', 'Revocar autorización').should('not.exist');
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
      .should('deep.eq', { ofertaId: 'offer-0', version: 1 });
    cy.contains('[role=alert]', 'La oferta cambió o venció').should('be.visible');
    cy.location('pathname').should('eq', '/app/cotizaciones/aceptacion');
  });
});
