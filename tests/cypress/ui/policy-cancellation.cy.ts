import {
  CANCELLED_STATE_RESPONSE,
  CANCELLATION_POLICY_ID,
  CANCELLATION_RESULT_RESPONSE,
  CANCELLATION_STATE_RESPONSE,
  SETTLEMENT_HASH,
  SETTLEMENT_RESPONSE,
} from '../../../src/app/core/policies/policy-cancellation.testing';
import { login } from '../support/products';
import { emptyDashboard, mockBackend, password, syntheticUser } from '../support/ui-backend';

const BASE = `/api/v1/clientes/me/polizas/${CANCELLATION_POLICY_ID}`;

describe('SOL-187 cancellation UI with controlled HTTP, not backend persistence', () => {
  let cancelled: boolean;

  beforeEach(() => {
    cancelled = false;
    mockBackend();
    cy.intercept('GET', '/api/v1/clientes/me/dashboard', (request) => {
      request.reply({
        ...emptyDashboard,
        polizas: [
          {
            id: CANCELLATION_POLICY_ID,
            suscripcionId: '30000000-0000-4000-8000-000000000001',
            tipo: 'life',
            fechaInicio: '2026-11-11',
            fechaFin: '2027-01-11',
            estado: cancelled ? 'cancelada' : 'vigente',
            simulada: true,
          },
        ],
      });
    }).as('dashboard');
    cy.intercept('GET', `${BASE}/cancelacion`, (request) => {
      request.reply(cancelled ? CANCELLED_STATE_RESPONSE : CANCELLATION_STATE_RESPONSE);
    }).as('cancellationState');
  });

  function openCancellation() {
    login(syntheticUser.correo, password);
    cy.contains('a', 'Mis pólizas').click();
    cy.get('[data-testid=policy-card] a').click();
    cy.contains('a', 'Revisar cancelación').click();
    cy.wait('@cancellationState');
    cy.get('[data-testid=cancellation-refund]').should('contain.text', '41.129');
  }

  function accept() {
    cy.get('[data-testid=cancellation-reason]').click();
    cy.contains('mat-option', 'Costo').click();
    cy.get('[data-testid=cancellation-accept] input').check();
  }

  it('keeps the settlement and confirmation within desktop and mobile viewports', () => {
    openCancellation();
    for (const [width, height] of [
      [1280, 720],
      [390, 844],
    ]) {
      cy.viewport(width, height);
      cy.document().should((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
      cy.get('[data-testid=cancellation-form]').should('be.visible');
      cy.get('[data-testid=cancellation-back]').should('be.visible');
    }
  });

  it('reviews, requires acceptance, submits once and returns to a cancelled policy', () => {
    cy.intercept('POST', `${BASE}/cancelaciones`, (request) => {
      expect(request.headers.authorization).to.eq('Bearer synthetic-ui-access-not-a-real-jwt');
      expect(request.headers['idempotency-key']).to.match(/^[a-f0-9-]{36}$/i);
      expect(request.body).to.deep.eq({
        confirma: true,
        motivoCancelacion: 'costo',
        liquidacionHash: SETTLEMENT_HASH,
      });
      cancelled = true;
      request.reply({ statusCode: 201, body: CANCELLATION_RESULT_RESPONSE, delay: 500 });
    }).as('cancelPolicy');
    openCancellation();
    cy.get('[data-testid=cancellation-confirm]').should('be.disabled');
    cy.contains('a', 'Conservar mi póliza').should(
      'have.attr',
      'href',
      `/app/polizas/${CANCELLATION_POLICY_ID}`,
    );
    accept();
    cy.get('[data-testid=cancellation-confirm]').dblclick();
    cy.wait('@cancelPolicy');
    cy.get('@cancelPolicy.all').should('have.length', 1);
    cy.get('[data-testid=cancellation-result]').should(
      'contain.text',
      CANCELLATION_RESULT_RESPONSE.id,
    );
    cy.contains('Simulación académica').should('be.visible');
    cy.get('[data-testid=cancellation-back]').click();
    cy.contains('.status-badge', 'Cancelada').should('be.visible');
    cy.contains('a', 'Renovar póliza').should('not.exist');
    cy.contains('a', 'Modificar póliza').should('not.exist');
    cy.contains('a', 'Ver cancelación registrada').click();
    cy.get('[data-testid=cancellation-result]').should(
      'contain.text',
      CANCELLATION_RESULT_RESPONSE.id,
    );
    cy.get('@cancelPolicy.all').should('have.length', 1);
  });

  it('preserves the same request after 503 and reload, even when the new settlement differs', () => {
    let originalBody: object;
    let originalKey: string | string[];
    let attempts = 0;
    cy.intercept('POST', `${BASE}/cancelaciones`, (request) => {
      attempts++;
      if (attempts === 1) {
        originalBody = request.body;
        originalKey = request.headers['idempotency-key'];
        request.reply({ statusCode: 503, body: { code: 'servicio_no_disponible' } });
      } else {
        expect(request.body).to.deep.eq(originalBody);
        expect(request.headers['idempotency-key']).to.eq(originalKey);
        cancelled = true;
        request.reply({ statusCode: 200, body: CANCELLATION_RESULT_RESPONSE });
      }
    }).as('cancelPolicy');
    openCancellation();
    accept();
    cy.expectConsoleError('Policy cancellation was not confirmed.', 503, 'servicio_no_disponible');
    cy.get('[data-testid=cancellation-confirm]').click();
    cy.wait('@cancelPolicy');
    cy.get('[data-testid=cancellation-notice]').should(
      'contain.text',
      'No pudimos confirmar el resultado',
    );
    cy.intercept('GET', `${BASE}/cancelacion`, {
      ...CANCELLATION_STATE_RESPONSE,
      liquidacion: { ...SETTLEMENT_RESPONSE, liquidacionHash: 'd'.repeat(64) },
    }).as('updatedState');
    cy.reload();
    cy.wait('@updatedState');
    cy.get('[data-testid=cancellation-settlement]').should('not.exist');
    cy.get('[data-testid=cancellation-form]').should('not.exist');
    cy.get('[data-testid=cancellation-retry]').click();
    cy.wait('@cancelPolicy');
    cy.get('[data-testid=cancellation-result]').should('be.visible');
    cy.get('@cancelPolicy.all').should('have.length', 2);
  });

  it('refreshes changed settlement and requires fresh acceptance before a different request', () => {
    let firstKey: string | string[];
    let changed = false;
    cy.intercept('GET', `${BASE}/cancelacion`, (request) => {
      request.reply(
        changed
          ? {
              ...CANCELLATION_STATE_RESPONSE,
              liquidacion: { ...SETTLEMENT_RESPONSE, liquidacionHash: 'd'.repeat(64) },
            }
          : CANCELLATION_STATE_RESPONSE,
      );
    }).as('updatedState');
    cy.intercept('POST', `${BASE}/cancelaciones`, (request) => {
      if (!changed) {
        firstKey = request.headers['idempotency-key'];
        changed = true;
        request.reply({ statusCode: 409, body: { code: 'liquidacion_cambio' } });
      } else {
        expect(request.headers['idempotency-key']).not.to.eq(firstKey);
        expect(request.body.liquidacionHash).to.eq('d'.repeat(64));
        request.reply({
          statusCode: 201,
          body: {
            ...CANCELLATION_RESULT_RESPONSE,
            liquidacion: { ...SETTLEMENT_RESPONSE, liquidacionHash: 'd'.repeat(64) },
          },
        });
      }
    }).as('cancelPolicy');
    login(syntheticUser.correo, password);
    cy.visit(`/app/polizas/${CANCELLATION_POLICY_ID}/cancelacion`);
    cy.wait('@updatedState');
    accept();
    cy.get('[data-testid=cancellation-confirm]').click();
    cy.wait('@cancelPolicy');
    cy.wait('@updatedState');
    cy.get('[data-testid=cancellation-confirm]').should('be.disabled');
    cy.get('[data-testid=cancellation-notice]').should('contain.text', 'La liquidación cambió');
    accept();
    cy.get('[data-testid=cancellation-confirm]').click();
    cy.wait('@cancelPolicy');
    cy.get('[data-testid=cancellation-result]').should('be.visible');
  });
});
