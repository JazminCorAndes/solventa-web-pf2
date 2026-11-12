import { login } from '../support/products';
import { mockBackend, password, syntheticUser } from '../support/ui-backend';

const claimId = '22222222-2222-4222-8222-222222222222';
const uploadId = '33333333-3333-4333-8333-333333333333';
const base = `/api/v1/siniestros/${claimId}`;
const now = '2026-11-11T12:00:00Z';

describe('Evidencias: estados con HTTP sintético local, no acredita backend real', () => {
  const screenshot = (name: string) =>
    cy.get('[data-testid=claim-evidence-panel]').screenshot(name, {
      disableTimersAndAnimations: false,
      timeout: 60000,
    });
  for (const width of [390, 768, 1440]) {
    it(`muestra selección, progreso, rechazo y confirmación a ${width}px`, () => {
      const rejectionCode = width === 768 ? 'formato_invalido' : 'ubicacion_no_autorizada';
      cy.viewport(width, 1000);
      mockBackend();
      cy.intercept('GET', `/api/v1/clientes/me/siniestros/${claimId}`, {
        body: {
          id: claimId,
          polizaId: '11111111-1111-4111-8111-111111111111',
          estado: 'en_revision',
          tipo: 'asistido',
          descripcion: 'Revisión de los documentos del siniestro.',
          ocurridoEn: now,
          reportadoEn: now,
          actualizadoEn: now,
          historial: [
            { estado: 'en_revision', ocurridoEn: now, descripcion: 'Documentos en revisión.' },
          ],
        },
      });
      cy.intercept('GET', '/api/v1/siniestros/configuracion-evidencias', {
        body: {
          maxCantidad: 5,
          maxChunkBytes: 1048576,
          maxVideoSeconds: 120,
          formatos: [
            { mimeType: 'image/jpeg', maxBytes: 10485760 },
            { mimeType: 'image/png', maxBytes: 10485760 },
            { mimeType: 'application/pdf', maxBytes: 20971520 },
            { mimeType: 'video/mp4', maxBytes: 104857600 },
          ],
        },
      });
      let confirmed = false;
      let cancelled = false;
      let operationKey: string | null = null;
      let currentUploadId = uploadId;
      const startKeys: string[] = [];
      let body: Record<string, unknown>;
      const receipt = (offset: number, state = 'pendiente') => ({
        ...body,
        id: currentUploadId,
        siniestroId: claimId,
        offset,
        estado: state,
        evidenciaId: state === 'confirmada' ? uploadId : null,
      });
      cy.intercept('GET', `${base}/evidencias`, (request) =>
        request.reply({
          evidencias: confirmed
            ? [{ ...body, id: uploadId, siniestroId: claimId, creadaEn: now }]
            : [],
        }),
      );
      cy.intercept('POST', `${base}/cargas`, (request) => {
        const key = String(request.headers['idempotency-key']);
        startKeys.push(key);
        if (key !== operationKey) {
          operationKey = key;
          currentUploadId = key;
          cancelled = false;
        }
        body = request.body;
        request.reply({ statusCode: 201, body: receipt(0) });
      });
      cy.intercept('GET', `${base}/cargas/*`, (request) =>
        request.reply(receipt(0, cancelled ? 'cancelada' : 'pendiente')),
      );
      cy.intercept('DELETE', `${base}/cargas/*`, (request) => {
        cancelled = true;
        request.reply({ statusCode: 204 });
      }).as('cancel');
      cy.intercept('PUT', `${base}/cargas/*/contenido`, (request) =>
        request.reply({ body: receipt(Number(body['tamanoBytes'])), delay: 1200 }),
      ).as('chunk');
      let rejected = false;
      let unavailable = true;
      cy.intercept('POST', `${base}/cargas/*/confirmacion`, (request) => {
        if (unavailable) {
          unavailable = false;
          request.reply({
            statusCode: 503,
            body: { code: 'servicio_no_disponible' },
            delay: 1000,
          });
        } else if (!rejected) {
          rejected = true;
          request.reply({
            statusCode: 422,
            body: { code: rejectionCode },
            delay: 1000,
          });
        } else {
          confirmed = true;
          request.reply({ body: receipt(Number(body['tamanoBytes']), 'confirmada'), delay: 1000 });
        }
      }).as('confirm');
      login(syntheticUser.correo, password);
      cy.visit(`/app/siniestros/${claimId}`);
      cy.get('[data-testid=claim-summary]').should('be.visible');
      cy.get('[data-testid=evidence-load]').click();
      cy.get('[data-testid=evidence-files]').should('be.enabled');
      cy.get('[data-testid=claim-evidence-panel]').scrollIntoView();
      screenshot(`evidence-empty-${width}`);
      cy.get('[data-testid=claim-evidence-panel]')
        .should('contain.text', 'PDF 20 MB')
        .and('not.contain.text', '20971520');
      cy.get('[data-testid=evidence-files]').selectFile({
        contents: Cypress.Buffer.from('%PDF-1.7\nsynthetic transport fixture'),
        fileName: 'informe-sintetico.pdf',
        mimeType: 'application/pdf',
      });
      cy.expectConsoleError('Claim evidence operation failed.', 503, 'servicio_no_disponible');
      cy.get('[data-testid=evidence-upload]').click();
      screenshot(`evidence-loading-${width}`);
      cy.wait('@chunk', { log: false });
      screenshot(`evidence-verifying-${width}`);
      cy.wait('@confirm', { log: false });
      cy.get('[data-testid=evidence-upload]').should('be.enabled');
      cy.get('[data-testid=evidence-file-error]').should(
        'contain.text',
        'servicio no está disponible',
      );
      cy.get('[data-testid=evidence-download]').should('not.exist');
      cy.expectConsoleError('Claim evidence operation failed.', 422, rejectionCode);
      cy.get('[data-testid=evidence-upload]').click();
      cy.wait('@confirm', { log: false });
      cy.get('[data-testid=evidence-file]').should('contain.text', 'informe-sintetico.pdf');
      cy.get('[data-testid=evidence-upload]').should('not.exist');
      cy.get('[data-testid=evidence-file-error]').should(
        'contain.text',
        width === 768 ? 'No pudimos leer' : 'ubicación sin consentimiento',
      );
      cy.get('[data-testid=evidence-error]').should('not.exist');
      cy.get('[data-testid=evidence-remove]').should('be.enabled');
      screenshot(`evidence-error-${width}`);
      cy.get('[data-testid=evidence-remove]').click();
      cy.wait('@cancel', { log: false });
      cy.get('[data-testid=evidence-file]').should('not.exist');
      cy.get('[data-testid=evidence-files]').selectFile({
        contents: Cypress.Buffer.from('%PDF-1.7\nsynthetic replacement without location'),
        fileName: 'informe-revisado.pdf',
        mimeType: 'application/pdf',
      });
      cy.get('[data-testid=evidence-upload]').click();
      cy.wait('@confirm', { log: false });
      cy.get('[data-testid=evidence-download]').should('have.length', 1);
      cy.then(() => {
        expect(startKeys).to.have.length(4);
        expect(startKeys[0]).to.equal(startKeys[1]);
        expect(startKeys[0]).to.equal(startKeys[2]);
        expect(startKeys[3]).not.to.equal(startKeys[0]);
      });
      screenshot(`evidence-confirmed-${width}`);
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
      });
    });
  }
});
