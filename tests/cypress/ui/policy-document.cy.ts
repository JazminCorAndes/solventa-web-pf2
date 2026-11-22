import {
  DOCUMENT_ACCEPTANCE,
  DOCUMENT_ACTOR_ID,
  DOCUMENT_HTML,
  DOCUMENT_POLICY_ID,
  POLICY_DOCUMENT,
} from '../../../src/app/core/policies/policy-document.testing';
import type { PolicyDocument } from '../../../src/app/core/policies/policy-document.models';
import { login } from '../support/products';
import { emptyDashboard, grant, mockBackend, password, syntheticUser } from '../support/ui-backend';

const BASE = `/api/v1/clientes/me/polizas/${DOCUMENT_POLICY_ID}`;

describe('UI controlada: documento académico y aceptación SIMULADA (no E2E real)', () => {
  let document: PolicyDocument;

  beforeEach(() => {
    mockBackend();
    cy.then(async () => {
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(DOCUMENT_HTML)),
        ),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
      document = { ...structuredClone(POLICY_DOCUMENT), contenidoHash: hash };
    });
    const clientGrant = () => ({
      ...grant(),
      usuario: { ...syntheticUser, id: DOCUMENT_ACTOR_ID },
    });
    cy.intercept('POST', '/api/v1/sesiones', (request) => {
      request.reply({ body: clientGrant(), log: false });
    });
    cy.intercept('POST', '/api/v1/sesiones/renovar', (request) => {
      request.reply({ body: clientGrant(), log: false });
    });
    cy.intercept('GET', '/api/v1/clientes/me/dashboard', {
      ...emptyDashboard,
      polizas: [
        {
          id: DOCUMENT_POLICY_ID,
          suscripcionId: POLICY_DOCUMENT.contenido.suscripcionId,
          tipo: 'travel',
          fechaInicio: '2026-11-01',
          fechaFin: '2026-11-30',
          estado: 'vigente',
          simulada: true,
        },
      ],
    });
    cy.intercept('GET', `${BASE}/documento`, (request) => request.reply(document)).as('document');
  });

  function openDocument(): void {
    login(syntheticUser.correo, password);
    cy.visit('/app/polizas');
    cy.get(`a[href="/app/polizas/${DOCUMENT_POLICY_ID}"]`).first().click();
    cy.wait('@document');
    cy.contains('h2', 'Documento y firma simulada').should('be.visible');
  }

  function currentAcceptance() {
    return {
      ...DOCUMENT_ACCEPTANCE,
      documentoId: document.documentoId,
      versionPoliza: document.versionPoliza,
      contenidoHash: document.contenidoHash,
    };
  }

  it('recorre listado y detalle, exige consentimiento y descarga bytes verificados en escritorio/móvil', () => {
    cy.intercept('POST', `${BASE}/aceptaciones`, (request) => {
      expect(request.body).to.deep.eq({
        documentoId: document.documentoId,
        versionPoliza: document.versionPoliza,
        contenidoHash: document.contenidoHash,
        aceptaSimulacion: true,
      });
      expect(request.headers['authorization']).to.eq('Bearer synthetic-ui-access-not-a-real-jwt');
      expect(request.headers['idempotency-key']).to.match(/^[a-f0-9-]{36}$/);
      const evidence = currentAcceptance();
      document = { ...document, aceptacionActual: evidence, historialAceptaciones: [evidence] };
      request.reply({ statusCode: 201, body: evidence });
    }).as('accept');
    cy.intercept('GET', `${BASE}/documentos/*/descarga`, {
      body: DOCUMENT_HTML,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    }).as('download');
    openDocument();
    cy.get('.accept-document').should('be.disabled');
    cy.contains('.document-panel', 'SIMULACIÓN · SIN VALIDEZ LEGAL').should('be.visible');
    cy.contains('.document-content', 'Asistencia académica').should('be.visible');
    cy.viewport(1280, 900);
    cy.get('.document-panel').should(($panel) => {
      expect($panel[0].scrollWidth).to.be.at.most($panel[0].clientWidth);
    });
    cy.viewport(390, 844);
    cy.get('.document-panel').should(($panel) => {
      expect($panel[0].scrollWidth).to.be.at.most($panel[0].clientWidth);
    });
    cy.get('.acceptance mat-checkbox input').check();
    cy.get('.accept-document').click();
    cy.wait('@accept');
    cy.contains('.acceptance', 'Aceptación simulada registrada el').should('be.visible');
    cy.get('@accept.all').should('have.length', 1);
    cy.contains('button', 'Descargar documento simulado').click();
    cy.wait('@download')
      .its('request.headers.authorization')
      .should('eq', 'Bearer synthetic-ui-access-not-a-real-jwt');
    cy.readFile(
      `${Cypress.config('downloadsFolder')}/poliza-${DOCUMENT_POLICY_ID}-${POLICY_DOCUMENT.documentoId}.html`,
    ).should('eq', DOCUMENT_HTML);
  });

  it('conserva clave/cuerpo tras 503 y recarga, y recupera un replay 200 sin nueva confirmación', () => {
    let key = '';
    let body: unknown;
    let posts = 0;
    cy.intercept('POST', `${BASE}/aceptaciones`, (request) => {
      posts++;
      if (posts === 1) {
        key = String(request.headers['idempotency-key']);
        body = request.body;
        request.reply({ statusCode: 503, body: { code: 'servicio_no_disponible' } });
      } else {
        expect(request.headers['idempotency-key']).to.eq(key);
        expect(request.body).to.deep.eq(body);
        const evidence = currentAcceptance();
        document = { ...document, aceptacionActual: evidence, historialAceptaciones: [evidence] };
        request.reply({ statusCode: 200, body: evidence });
      }
    }).as('accept');
    openDocument();
    cy.get('.acceptance mat-checkbox input').check();
    cy.get('.accept-document').click();
    cy.wait('@accept');
    cy.contains('[role="alert"]', 'Conservamos la misma clave').should('be.visible');
    cy.reload();
    cy.wait('@document');
    cy.get('.acceptance mat-checkbox').should('not.exist');
    cy.get('.recover-acceptance').should('be.enabled').click();
    cy.wait('@accept');
    cy.contains('.acceptance', 'Aceptación simulada registrada el').should('be.visible');
    cy.then(() => expect(posts).to.eq(2));
  });

  it('requiere revisar y aceptar expresamente otra versión después de 409', () => {
    let oldKey = '';
    let posts = 0;
    cy.intercept('POST', `${BASE}/aceptaciones`, (request) => {
      posts++;
      if (posts === 1) {
        oldKey = String(request.headers['idempotency-key']);
        document = {
          ...document,
          documentoId: '30000000-0000-4000-8000-000000000009',
          versionPoliza: 2,
          contenidoHash: 'b'.repeat(64),
          contenido: { ...document.contenido, version: 2, plan: 'integral' },
        };
        request.reply({ statusCode: 409, body: { code: 'documento_desactualizado' } });
      } else {
        expect(request.headers['idempotency-key']).not.to.eq(oldKey);
        expect(request.body.documentoId).to.eq(document.documentoId);
        expect(request.body.versionPoliza).to.eq(2);
        const evidence = currentAcceptance();
        document = { ...document, aceptacionActual: evidence, historialAceptaciones: [evidence] };
        request.reply({ statusCode: 201, body: evidence });
      }
    }).as('accept');
    openDocument();
    cy.get('.acceptance mat-checkbox input').check();
    cy.get('.accept-document').click();
    cy.wait('@accept');
    cy.contains('[role="status"]', 'El documento cambió').should('be.visible');
    cy.get('.accept-document').should('be.disabled');
    cy.get('.acceptance mat-checkbox input').should('not.be.checked').check();
    cy.get('.accept-document').click();
    cy.wait('@accept');
    cy.contains('.acceptance', 'Aceptación simulada registrada el').should('be.visible');
  });

  it('muestra la corrupción de bytes y nunca crea una descarga alternativa', () => {
    cy.intercept('GET', `${BASE}/documentos/*/descarga`, {
      body: '<html><body>archivo alterado</body></html>',
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
    openDocument();
    cy.window().then((window) => cy.spy(window.URL, 'createObjectURL').as('objectUrl'));
    cy.get('.download-document').click();
    cy.contains('[role="alert"]', 'No pudimos verificar o descargar').should('be.visible');
    cy.get('@objectUrl').should('not.have.been.called');
  });
});
