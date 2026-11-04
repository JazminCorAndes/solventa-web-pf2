import { login } from '../support/products';
import { mockBackend, password, syntheticUser } from '../support/ui-backend';

const policy = {
  id: '11111111-1111-4111-8111-111111111111',
  tipo: 'automotive',
  fechaInicio: '2020-01-01',
  fechaFin: '2099-12-31',
  estado: 'vigente',
};
const claimId = '22222222-2222-4222-8222-222222222222';
const description = 'Descripcion sintetica del evento para validacion local';
const storageKey = `solventa.claim-attempt.${syntheticUser.id}`;

function openReport() {
  login(syntheticUser.correo, password);
  cy.contains('a', 'Siniestros').click();
  cy.location('pathname').should('eq', '/app/siniestros/reportar');
  cy.wait('@policies');
}

function fillReport() {
  cy.get('mat-select[formcontrolname=polizaId]').click();
  cy.contains('mat-option', policy.id).click();
  cy.get('input[formcontrolname=fechaEvento]').type('2025-01-10T12:00');
  cy.get('input[formcontrolname=tipoEvento]').type('Colision');
  cy.get('input[formcontrolname=lugar]').type('Bogota');
  cy.get('textarea[formcontrolname=descripcion]').type(description);
}

function receipt(body: object) {
  return {
    ...body,
    id: claimId,
    estado: 'registrado',
    registradoEn: new Date().toISOString(),
  };
}

describe('SOL-175: interfaz local con HTTP controlado, no acredita persistencia real', () => {
  beforeEach(() => {
    mockBackend();
    cy.intercept('GET', '/api/v1/siniestros/polizas', {
      body: { polizas: [policy] },
    }).as('policies');
  });

  it('CA1/CA2: selecciona poliza vigente y valida campos sin enviar formularios invalidos', () => {
    cy.intercept('POST', '/api/v1/siniestros', { statusCode: 500 }).as('report');
    openReport();
    cy.get('button[type=submit]').click();
    cy.get('mat-error').should('be.visible');
    cy.get('@report.all').should('have.length', 0);
    fillReport();
    cy.get('input[formcontrolname=fechaEvento]').clear().type('2099-01-10T12:00');
    cy.get('button[type=submit]').click();
    cy.get('[role=alert]').should('contain.text', 'no futuras');
    cy.get('@report.all').should('have.length', 0);
    cy.get('[data-testid=claim-confirmation]').should('not.exist');
  });

  it('CA2/CA3: evita doble clic, confirma ID/estado y consulta el mismo reporte tras recargar', () => {
    let saved: ReturnType<typeof receipt>;
    cy.intercept('POST', '/api/v1/siniestros', (request) => {
      expect(request.headers.authorization).to.eq('Bearer synthetic-ui-access-not-a-real-jwt');
      expect(request.headers['idempotency-key']).to.match(/^[a-f0-9-]{36}$/i);
      saved = receipt(request.body);
      request.reply({ statusCode: 201, body: saved, delay: 1500 });
    }).as('report');
    cy.intercept('GET', `/api/v1/siniestros/${claimId}`, (request) => {
      request.reply(saved);
    }).as('readReport');
    openReport();
    fillReport();
    cy.get('button[type=submit]').dblclick();
    cy.contains('[role=status]', 'Esperando confirmación del servidor').should('be.visible');
    cy.wait('@report');
    cy.get('@report.all').should('have.length', 1);
    cy.get('[data-testid=claim-confirmation]')
      .should('contain.text', claimId)
      .and('contain.text', 'registrado');
    cy.reload();
    cy.wait('@readReport');
    cy.get('[data-testid=claim-confirmation]').should('contain.text', claimId);
    cy.get('@report.all').should('have.length', 1);
  });

  it('CA4/CA5: conserva payload y clave despues de un 503, recarga y cambio de vigencia', () => {
    let originalBody: object;
    let originalKey: string | string[];
    let requests = 0;
    cy.intercept('POST', '/api/v1/siniestros', (request) => {
      requests++;
      if (requests === 1) {
        originalBody = request.body;
        originalKey = request.headers['idempotency-key'];
        request.reply({ statusCode: 503, body: { code: 'servicio_no_disponible' } });
      } else {
        expect(request.body).to.deep.eq(originalBody);
        expect(request.headers['idempotency-key']).to.eq(originalKey);
        request.reply({ statusCode: 200, body: receipt(originalBody) });
      }
    }).as('report');
    openReport();
    fillReport();
    cy.get('button[type=submit]').click();
    cy.wait('@report');
    cy.get('[role=alert]').should('contain.text', 'No se pudo confirmar el resultado');
    cy.get('[data-testid=claim-confirmation]').should('not.exist');
    cy.get('textarea[formcontrolname=descripcion]')
      .should('be.disabled')
      .and('have.value', description);
    cy.window().then((window) => {
      const attempt = JSON.parse(window.sessionStorage.getItem(storageKey)!);
      expect(attempt.payload).to.deep.eq(originalBody);
      expect(attempt.key).to.eq(originalKey);
    });
    cy.intercept('GET', '/api/v1/siniestros/polizas', { body: { polizas: [] } }).as(
      'emptyPolicies',
    );
    cy.reload();
    cy.wait('@emptyPolicies');
    cy.contains('button', 'Reintentar el mismo reporte').click();
    cy.wait('@report');
    cy.get('[data-testid=claim-confirmation]').should('contain.text', claimId);
    cy.get('@report.all').should('have.length', 2);
  });

  it('CA4/CA5: permite corregir un rechazo definitivo sin borrar los campos', () => {
    let originalKey: string | string[];
    let requests = 0;
    cy.intercept('POST', '/api/v1/siniestros', (request) => {
      requests++;
      if (requests === 1) {
        originalKey = request.headers['idempotency-key'];
        request.reply({ statusCode: 400, body: { code: 'solicitud_invalida' } });
      } else {
        expect(request.headers['idempotency-key']).not.to.eq(originalKey);
        expect(request.body.lugar).to.eq('Medellin');
        request.reply({ statusCode: 201, body: receipt(request.body) });
      }
    }).as('report');
    openReport();
    fillReport();
    cy.get('button[type=submit]').click();
    cy.wait('@report');
    cy.get('[role=alert]').should('contain.text', 'Revisa los datos');
    cy.get('textarea[formcontrolname=descripcion]')
      .should('be.enabled')
      .and('have.value', description);
    cy.get('input[formcontrolname=lugar]').clear().type('Medellin');
    cy.get('button[type=submit]').click();
    cy.wait('@report');
    cy.get('[data-testid=claim-confirmation]').should('contain.text', claimId);
  });

  it('CA3/CA4: no presenta exito cuando la respuesta no incluye identificador', () => {
    cy.intercept('POST', '/api/v1/siniestros', { body: { estado: 'registrado' } }).as('report');
    openReport();
    fillReport();
    cy.get('button[type=submit]').click();
    cy.wait('@report');
    cy.get('[role=alert]').should('contain.text', 'No se pudo confirmar el resultado');
    cy.get('[data-testid=claim-confirmation]').should('not.exist');
    cy.contains('button', 'Reintentar el mismo reporte').should('be.enabled');
    cy.get('textarea[formcontrolname=descripcion]').should('be.disabled');
  });

  it('valida los limites de vigencia por dia UTC aunque se ingrese la hora local', () => {
    cy.intercept('GET', '/api/v1/siniestros/polizas', {
      body: { polizas: [{ ...policy, fechaInicio: '2025-01-10', fechaFin: '2025-01-10' }] },
    }).as('policies');
    cy.intercept('POST', '/api/v1/siniestros', (request) => {
      expect(request.body.fechaEvento).to.eq('2025-01-10T00:30:00.000Z');
      request.reply({ statusCode: 201, body: receipt(request.body) });
    }).as('report');
    const setLocalTime = (timestamp: string) =>
      cy.window().then((window) => {
        const date = new window.Date(timestamp);
        const local = new window.Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16);
        cy.get('input[formcontrolname=fechaEvento]').clear().type(local);
      });
    openReport();
    fillReport();
    setLocalTime('2025-01-11T00:30:00Z');
    cy.get('button[type=submit]').click();
    cy.get('[role=alert]').should('contain.text', 'dentro de la vigencia');
    cy.get('@report.all').should('have.length', 0);
    setLocalTime('2025-01-10T00:30:00Z');
    cy.get('button[type=submit]').click();
    cy.wait('@report');
    cy.get('[data-testid=claim-confirmation]').should('contain.text', claimId);
  });
});
