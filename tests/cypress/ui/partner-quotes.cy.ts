import type {
  PartnerQuoteRequest,
  PartnerQuoteResult,
} from '../../../src/app/data-access/quotes/http-partner-quote.gateway';
import partnerContext from '../../../src/app/features/partners/testing/partner-context-real.json';
import { expectEncryptedLogin } from '../support/login-crypto';
import { grant, mockBackend, password } from '../support/ui-backend';

const endpoint = '/api/v1/socios/solicitudes-cotizacion';
const socioId = partnerContext.socios[0].socioId;
const profileId = '66666666-6666-4666-8666-666666666666';
const customerId = '22222222-2222-4222-8222-222222222222';
const creditReference = 'HIP-UI-205';
const context = {
  ...partnerContext,
  socios: [{ socioId, productos: ['mortgage-life'] }],
};
const customer = {
  nombre: 'Cliente UI controlado',
  tipoDocumento: 'cc',
  numeroDocumentoEnmascarado: '******0001',
  consentimientoEstado: 'vigente',
};

function response(request: PartnerQuoteRequest): PartnerQuoteResult {
  return {
    operationId: request.operationId,
    socioId: request.socioId,
    clienteId: customerId,
    productoId: request.productoId,
    estado: 'completada',
    perfilamientoReferencia: profileId,
    solicitudId: 'AQT-2026-1234567890',
    cotizacionId: '44444444-4444-4444-8444-444444444444',
    recibidaEn: new Date().toISOString(),
    oferta: {
      id: '55555555-5555-4555-8555-555555555555',
      version: 1,
      nombre: 'Oferta hipotecaria UI controlada',
      descripcion: 'Respuesta de prueba, sin cobertura ni persistencia real.',
      prima: { monto: '99000.00', moneda: 'COP' },
      periodicidad: 'mensual',
      coberturaPrincipal: 'Saldo hipotecario',
      deducible: 'Sin deducible',
      vigencia: '12 meses',
      coberturas: ['Fallecimiento'],
      condiciones: ['El crédito debe permanecer vigente.'],
      beneficiosAdicionales: [],
      vigenteHasta: new Date(Date.now() + 900_000).toISOString(),
      explicacion: {
        resumen: 'La prima protege el saldo usando el perfil autorizado.',
        factoresDeterminantes: [
          {
            nombre: 'Saldo hipotecario',
            valor: '$310.000.000 COP',
            impacto: 'Define la suma asegurada.',
          },
          {
            nombre: 'Perfil de riesgo autorizado',
            valor: 'Nivel A, score 0.35',
            impacto: 'Ajusta la prima.',
          },
          {
            nombre: 'Regla y plan',
            valor: 'Regla UI v1',
            impacto: 'Aplica las condiciones del plan.',
          },
        ],
      },
      trazabilidad: {
        esquemaDecision: 1,
        hashDecision: 'a'.repeat(64),
        hashContenido: 'b'.repeat(64),
        perfilId: profileId,
        perfilVersion: 1,
        modeloPerfilVersion: 'perfil-ui-1',
        reglaId: '77777777-7777-4777-8777-777777777777',
        reglaVersion: '1',
        fuentes: [{ nombre: 'open_finance', version: 'fuente-ui-1' }],
      },
    },
  };
}

describe('SOL-198/205: formulario y oferta socio (HTTP controlado, no AWS)', () => {
  let saved: PartnerQuoteResult | undefined;

  beforeEach(() => {
    saved = undefined;
    mockBackend();
    cy.intercept('POST', '/api/v1/sesiones', {
      body: { ...grant(), usuario: context.usuario },
      log: false,
    }).as('partnerLogin');
    cy.intercept('POST', '/api/v1/sesiones/renovar', {
      body: { ...grant(), usuario: context.usuario },
      log: false,
    });
    cy.intercept('GET', '/api/v1/socios/actual', { body: context });
    cy.intercept('GET', '/api/v1/socios/clientes/por-documento*', { body: customer }).as('lookup');
    cy.intercept('POST', endpoint, (request) => {
      saved = response(request.body);
      request.reply({ statusCode: 201, body: saved, delay: 500 });
    }).as('partnerCreate');
    cy.intercept('GET', `${endpoint}/*`, (request) => {
      expect(saved, 'resultado previo de este caso controlado').not.to.eq(undefined);
      expect(new URL(request.url).pathname).to.eq(`${endpoint}/${saved!.operationId}`);
      expect(new URL(request.url).searchParams.get('socioId')).to.eq(socioId);
      request.reply({ body: saved });
    }).as('partnerRecovery');
    cy.visit('/iniciar-sesion');
    cy.get('#login-email').type(context.usuario.correo, { log: false });
    cy.get('#login-password').type(password, { log: false });
    cy.get('button[type=submit]').click();
    cy.wait('@partnerLogin', { log: false }).then(({ request }) => {
      expectEncryptedLogin(request.body);
    });
    cy.location('pathname').should('eq', '/app/socios');
    cy.get(
      `.partner-card[aria-label="${socioId}"] a[href="/app/socios/cotizaciones/solicitar?socio=${socioId}"]`,
    ).click();
    cy.location('pathname').should('eq', '/app/socios/cotizaciones/solicitar');
  });

  function fill() {
    cy.get('input[formcontrolname=numeroDocumento]').type('1000000001');
    cy.contains('button', 'Buscar cliente').click();
    cy.wait('@lookup').then(({ request }) => {
      const query = new URL(request.url).searchParams;
      expect(query.get('socioId')).to.eq(socioId);
      expect(query.get('tipoDocumento')).to.eq('cc');
      expect(query.get('numeroDocumento')).to.eq('1000000001');
    });
    cy.get('#credit-reference').type(creditReference);
    cy.get('#mortgage-balance').type('310000000').blur();
  }

  it('navega del socio a la misma operación y muestra oferta y factores sin POST duplicados', () => {
    cy.get('button[type=submit]').click();
    cy.get('[role=alert]').should('be.visible');
    cy.get('@partnerCreate.all').should('have.length', 0);
    fill();
    cy.contains('Consentimiento: Vigente').should('be.visible');
    cy.get('button[type=submit]').click().should('be.disabled');
    cy.get('.processing-note').should('be.visible');
    cy.wait<PartnerQuoteRequest, PartnerQuoteResult>('@partnerCreate').then(
      ({ request, response: result }) => {
        expect(request.body).to.deep.eq({
          operationId: result!.body.operationId,
          socioId,
          productoId: 'mortgage-life',
          datosProducto: { mortgageBalance: '310000000', referenciaCredito: creditReference },
          cliente: {
            tipoCliente: 'persona_natural',
            tipoDocumento: 'cc',
            numeroDocumento: '1000000001',
          },
        });
        expect(request.headers['idempotency-key']).to.eq(result!.body.operationId);
        expect(request.headers['api-version']).to.eq('1');
        expect(result!.body.clienteId).to.eq(customerId);
        expect(result!.body.oferta.trazabilidad.perfilId).to.eq(
          result!.body.perfilamientoReferencia,
        );
        cy.get('app-partner-quote-panel code').should('have.text', result!.body.operationId);
        cy.contains(result!.body.oferta.nombre).should('be.visible');
        cy.contains(result!.body.oferta.explicacion.resumen).should('be.visible');
        cy.contains('99.000').should('be.visible');
        for (const coverage of result!.body.oferta.coberturas) {
          cy.contains('app-partner-quote-panel li', coverage).should('be.visible');
        }
        for (const condition of result!.body.oferta.condiciones) {
          cy.contains('app-partner-quote-panel li', condition).should('be.visible');
        }
        for (const factor of result!.body.oferta.explicacion.factoresDeterminantes) {
          cy.contains('.factor-list dt', factor.nombre).should('be.visible');
          cy.contains('.factor-list dd', factor.valor).should('be.visible');
          cy.contains('.factor-list dd', factor.impacto).should('be.visible');
        }
      },
    );
    cy.contains('h3', 'Cotización registrada por el servidor').should('be.visible');
    cy.get('input[formcontrolname=numeroDocumento]')
      .should('have.value', '1000000001')
      .and('be.disabled');
    cy.get('#credit-reference').should('have.value', creditReference).and('be.disabled');
    cy.get('.offer-explanation').should('have.length', 1);
    cy.reload();
    cy.wait('@partnerRecovery').then(({ response: result }) => {
      expect(result?.body).to.deep.eq(saved);
    });
    cy.contains('h3', 'Cotización registrada por el servidor').should('be.visible');
    cy.get('.offer-explanation').should('have.length', 1);
    cy.get('button[type=submit]').should('be.disabled');
    cy.get('@partnerCreate.all').should('have.length', 1);
    cy.get('@consent.all').should('have.length', 0);
    cy.get('@quote.all').should('have.length', 0);
  });

  it('reintenta una indisponibilidad con el mismo cuerpo y operación, sin éxito parcial', () => {
    let original: PartnerQuoteRequest;
    cy.intercept(
      { method: 'POST', url: endpoint, times: 1 },
      { statusCode: 503, body: { code: 'perfilamiento_no_disponible' } },
    ).as('unavailable');
    fill();
    cy.get('button[type=submit]').click();
    cy.wait<PartnerQuoteRequest>('@unavailable').then(({ request }) => {
      original = request.body;
    });
    cy.get('app-partner-quote-panel [role=alert]').should('be.visible');
    cy.get('.offer-explanation').should('not.exist');
    cy.contains('h3', 'Cotización registrada por el servidor').should('not.exist');
    cy.contains('app-partner-quote-panel button', 'Reintentar').click();
    cy.wait<PartnerQuoteRequest>('@partnerCreate').then(({ request }) => {
      expect(request.body).to.deep.eq(original);
      expect(request.headers['idempotency-key']).to.eq(original.operationId);
    });
    cy.contains('h3', 'Cotización registrada por el servidor').should('be.visible');
    cy.get('.offer-explanation').should('have.length', 1);
  });

  it('no sustituye el consentimiento del cliente ni envía con autorización insuficiente', () => {
    cy.intercept('GET', '/api/v1/socios/clientes/por-documento*', {
      body: { ...customer, consentimientoEstado: 'insuficiente' },
    }).as('lookup');
    fill();
    cy.contains('Autorización insuficiente').should('be.visible');
    cy.get('button[type=submit]').click();
    cy.get('app-partner-quote-panel [role=alert]').should('be.visible');
    cy.get('@partnerCreate.all').should('have.length', 0);
    cy.get('@consent.all').should('have.length', 0);
    cy.get('.offer-explanation').should('not.exist');
  });

  for (const code of ['perfil_no_encontrado', 'producto_no_disponible']) {
    it(`${code}: no presenta una oferta parcial válida`, () => {
      cy.intercept('POST', endpoint, { statusCode: 422, body: { code } }).as('rejected');
      fill();
      cy.get('button[type=submit]').click();
      cy.wait('@rejected').its('response.body.code').should('eq', code);
      cy.get('app-partner-quote-panel [role=alert]').should('be.visible');
      cy.get('.offer-explanation').should('not.exist');
      cy.contains('h3', 'Cotización registrada por el servidor').should('not.exist');
    });
  }
});
