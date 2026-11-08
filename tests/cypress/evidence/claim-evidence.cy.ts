import { observeLogin, tokenFromLogin } from '../support/real-backend';

interface EvidenceFixture {
  claimId: string;
  customer: { id: string; email: string; password: string };
}

describe('SOL-176: navegador → BFF → siniestros → SQLite y bytes privados', () => {
  it('retira un intento incierto, reemplaza con cuota uno y confirma/descarga PNG real', () => {
    let claimId: string;
    let evidenceId: string;
    let png: Uint8Array;
    let sha256: string;
    let abandonedId: string;
    let abandonedKey: string;
    let cutStartAcknowledgements = true;
    const selectPng = () =>
      cy.then(() =>
        cy.get('[data-testid=evidence-files]').selectFile(
          {
            contents: Cypress.Buffer.from(png),
            fileName: 'evidence.png',
            mimeType: 'image/png',
          },
          { log: false },
        ),
      );
    cy.task<EvidenceFixture>('evidenceFixture', null, { log: false }).then((fixture) => {
      claimId = fixture.claimId;
      observeLogin();
      cy.visit(`/iniciar-sesion?returnUrl=${encodeURIComponent(`/app/siniestros/${claimId}`)}`);
      cy.get('#login-email').type(fixture.customer.email, { log: false });
      cy.get('#login-password').type(fixture.customer.password, { log: false });
      cy.get('button[type=submit]').click();
      tokenFromLogin();
      cy.location('pathname').should('eq', `/app/siniestros/${claimId}`);
      cy.get('[data-testid=claim-summary]').should('be.visible');
      cy.intercept('GET', '/api/v1/siniestros/configuracion-evidencias').as('evidencePolicy');
      cy.get('[data-testid=evidence-load]').click();
      cy.wait('@evidencePolicy', { log: false }).its('response.body.maxCantidad').should('eq', 1);
      cy.get('[data-testid=evidence-files]').should('be.enabled');
      cy.window({ log: false }).then(async (win) => {
        const canvas = win.document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable for the synthetic PNG.');
        context.fillStyle = '#006699';
        context.fillRect(0, 0, 2, 2);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('PNG creation failed.'))),
            'image/png',
          ),
        );
        png = new Uint8Array(await blob.arrayBuffer());
        const digest = await win.crypto.subtle.digest('SHA-256', new Uint8Array(png).buffer);
        sha256 = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
      });
      selectPng();
      cy.get('[data-testid=evidence-remove]').click();
      cy.get('[data-testid=evidence-file]').should('not.exist');
      selectPng();
      cy.intercept({ method: 'POST', url: '/api/v1/siniestros/*/cargas' }, (request) =>
        request.continue((response) => {
          if (!cutStartAcknowledgements) return;
          expect(response.statusCode).to.be.oneOf([200, 201]);
          expect(response.body.estado).to.eq('pendiente');
          if (abandonedId) {
            expect(response.body.id).to.eq(abandonedId);
            expect(request.headers['idempotency-key']).to.eq(abandonedKey);
          }
          abandonedId = response.body.id;
          abandonedKey = String(request.headers['idempotency-key']);
          response.send({ forceNetworkError: true });
        }),
      ).as('interruptedStart');
      cy.expectConsoleError('Claim evidence operation failed.', 0);
      cy.get('[data-testid=evidence-upload]').click();
      cy.wait('@interruptedStart', { log: false }).should('have.property', 'error');
      cy.get('[data-testid=evidence-error]').should('be.visible');
      cy.then(() => {
        cutStartAcknowledgements = false;
      });
      cy.reload();
      cy.get('[data-testid=claim-summary]').should('be.visible');
      cy.get('[data-testid=evidence-load]').click();
      cy.get('[data-testid=evidence-restored]').should('have.length', 1);
      cy.intercept('POST', '/api/v1/siniestros/*/cargas').as('removalReplay');
      cy.intercept('GET', '/api/v1/siniestros/*/cargas/*').as('removalState');
      cy.intercept('DELETE', '/api/v1/siniestros/*/cargas/*').as('uploadCancellation');
      cy.get('[data-testid=evidence-remove]').click();
      cy.wait('@removalReplay', { log: false }).then(({ request, response }) => {
        expect(request.headers['idempotency-key']).to.eq(abandonedKey);
        expect(request.body).to.deep.eq({ mimeType: 'image/png', tamanoBytes: png.length, sha256 });
        expect(response?.statusCode).to.eq(200);
        expect(response!.body.id).to.eq(abandonedId);
      });
      cy.wait('@removalState', { log: false }).then(({ response }) =>
        expect(response!.body.estado).to.eq('pendiente'),
      );
      cy.wait('@uploadCancellation', { log: false }).then(({ request, response }) => {
        expect(request.url).to.contain(`/cargas/${abandonedId}`);
        expect(response?.statusCode).to.eq(204);
      });
      cy.wait('@removalState', { log: false }).then(({ response }) =>
        expect(response!.body.estado).to.eq('cancelada'),
      );
      cy.get('[data-testid=evidence-restored]').should('not.exist');
      cy.get('[data-testid=evidence-error]').should('not.exist');
      selectPng();
      cy.contains('[data-testid=evidence-file]', 'Listo para adjuntar').should('be.visible');
      cy.intercept('POST', '/api/v1/siniestros/*/cargas').as('uploadStart');
      cy.intercept('PUT', '/api/v1/siniestros/*/cargas/*/contenido').as('uploadChunk');
      cy.intercept('POST', '/api/v1/siniestros/*/cargas/*/confirmacion').as('uploadConfirmation');
      cy.get('[data-testid=evidence-upload]').click();
      cy.wait('@uploadStart', { log: false }).then(({ request, response }) => {
        expect(response?.statusCode).to.be.oneOf([200, 201]);
        expect(request.body).to.deep.eq({ mimeType: 'image/png', tamanoBytes: png.length, sha256 });
        expect(request.headers['idempotency-key']).to.match(/^[a-f0-9-]{36}$/i);
        expect(request.headers['idempotency-key']).not.to.eq(abandonedKey);
        expect(response!.body.siniestroId).to.eq(claimId);
        expect(response!.body.estado).to.eq('pendiente');
      });
      cy.wait('@uploadChunk', { log: false }).then(({ request, response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(request.headers['content-type']).to.eq('application/octet-stream');
        expect(Number(request.headers['upload-offset'])).to.eq(0);
      });
      cy.wait('@uploadConfirmation', { log: false }).then(({ response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(response!.body.estado).to.eq('confirmada');
        expect(response!.body.offset).to.eq(png.length);
        expect(response!.body.sha256).to.eq(sha256);
        evidenceId = response!.body.evidenciaId;
        expect(evidenceId).to.match(/^[a-f0-9-]{36}$/i);
      });
      cy.contains('[data-testid=evidence-file]', 'Confirmado por el servidor').should('be.visible');
      cy.get('[data-testid=evidence-download]').should('have.length', 1);
      cy.reload();
      cy.get('[data-testid=claim-summary]').should('be.visible');
      cy.get('[data-testid=evidence-load]').click();
      cy.get('[data-testid=evidence-download]').should('have.length', 1);
      cy.get('[data-testid=evidence-file]').should('not.exist');
      cy.get('[data-testid=evidence-download]').click();
      cy.then(() =>
        cy
          .readFile(`${Cypress.config('downloadsFolder')}/${evidenceId}.png`, null, { log: false })
          .then((downloaded) => {
            expect(
              Array.from(downloaded as Uint8Array),
              'original bytes persisted and recovered',
            ).to.deep.eq(Array.from(png));
          }),
      );
    });
  });
});
