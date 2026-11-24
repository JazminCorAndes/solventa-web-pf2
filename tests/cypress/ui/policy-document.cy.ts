import {
  DOCUMENT_ACTOR_ID,
  DOCUMENT_PDF,
  DOCUMENT_POLICY_ID,
  POLICY_DOCUMENT,
} from '../../../src/app/core/policies/policy-document.testing';
import { login } from '../support/products';
import { emptyDashboard, grant, mockBackend, password, syntheticUser } from '../support/ui-backend';

const BASE = `/api/v1/clientes/me/polizas/${DOCUMENT_POLICY_ID}`;

describe('UI controlada: documento PDF y detalle sin firma (no E2E real)', () => {
  let pdfHash: string;

  beforeEach(() => {
    mockBackend();
    cy.then(async () => {
      pdfHash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(DOCUMENT_PDF)),
        ),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
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
    cy.intercept('GET', `${BASE}/documento`, POLICY_DOCUMENT).as('document');
    cy.intercept('POST', `${BASE}/aceptaciones`, { statusCode: 500 }).as('accept');
  });

  function openDocument(): void {
    login(syntheticUser.correo, password);
    cy.visit('/app/polizas');
    cy.get(`a[href="/app/polizas/${DOCUMENT_POLICY_ID}"]`).first().click();
    cy.wait('@document');
    cy.contains('h2', 'Documento de póliza').should('be.visible');
  }

  it('descarga PDF verificado y conserva banner legible y centrado en escritorio/movil', () => {
    cy.intercept('GET', `${BASE}/documentos/*/descarga/pdf`, (request) => {
      request.reply({
        body: DOCUMENT_PDF,
        headers: {
          'Content-Type': 'application/pdf',
          'X-Content-SHA256': pdfHash,
          'X-Document-Content-SHA256': POLICY_DOCUMENT.contenidoHash,
        },
      });
    }).as('download');
    openDocument();
    cy.get('.accept-document, .acceptance, .recover-acceptance').should('not.exist');
    cy.contains('.document-content', 'Asistencia académica').should('be.visible');
    for (const width of [1280, 390]) {
      cy.viewport(width, 900);
      cy.get('.policy-hero').should(($hero) => {
        const hero = $hero[0].getBoundingClientRect();
        const copy = $hero[0].querySelector('.hero-copy')!.getBoundingClientRect();
        const icon = $hero[0].querySelector('.hero-icon')!.getBoundingClientRect();
        expect(copy.left - hero.left, 'espacio interior').to.be.at.least(20);
        expect(Math.abs((copy.top + copy.bottom - icon.top - icon.bottom) / 2)).to.be.at.most(1);
        expect($hero[0].scrollWidth).to.be.at.most($hero[0].clientWidth);
        const heading = $hero[0].querySelector('h1')!;
        expect(getComputedStyle(heading).color, 'texto claro sobre azul').to.eq(
          'rgb(248, 250, 252)',
        );
      });
      cy.get('.document-panel').should(($panel) => {
        expect($panel[0].scrollWidth).to.be.at.most($panel[0].clientWidth);
      });
    }
    cy.contains('button', 'Descargar PDF').click();
    cy.wait('@download')
      .its('request.headers.authorization')
      .should('eq', 'Bearer synthetic-ui-access-not-a-real-jwt');
    cy.readFile(
      `${Cypress.config('downloadsFolder')}/poliza-${DOCUMENT_POLICY_ID}-${POLICY_DOCUMENT.documentoId}.pdf`,
    ).should('eq', DOCUMENT_PDF);
    cy.get('@accept.all').should('have.length', 0);
  });

  it('rechaza corrupcion, sin archivo alternativo ni aceptacion de documento', () => {
    cy.intercept('GET', `${BASE}/documentos/*/descarga/pdf`, (request) => {
      request.reply({
        body: DOCUMENT_PDF + 'alterado',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Content-SHA256': pdfHash,
          'X-Document-Content-SHA256': POLICY_DOCUMENT.contenidoHash,
        },
      });
    });
    openDocument();
    cy.window().then((window) => cy.spy(window.URL, 'createObjectURL').as('objectUrl'));
    cy.get('.download-document').click();
    cy.contains('[role="alert"]', 'No pudimos verificar o descargar').should('be.visible');
    cy.get('@objectUrl').should('not.have.been.called');
    cy.get('@accept.all').should('have.length', 0);
  });
});
