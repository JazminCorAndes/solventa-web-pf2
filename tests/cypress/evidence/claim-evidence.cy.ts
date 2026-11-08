import { observeLogin, tokenFromLogin } from '../support/real-backend';

interface EvidenceFixture {
  claimId: string;
  customer: { id: string; email: string; password: string };
}

describe('SOL-176: navegador → BFF → siniestros → SQLite y bytes privados', () => {
  it('adjunta PNG real, confirma, recupera al recargar y descarga los mismos bytes', () => {
    let claimId: string;
    let evidenceId: string;
    let png: Uint8Array;
    let sha256: string;
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
      cy.get('[data-testid=evidence-load]').click();
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
      cy.then(() => {
        cy.get('[data-testid=evidence-files]').selectFile(
          {
            contents: Cypress.Buffer.from(png),
            fileName: 'evidence.png',
            mimeType: 'image/png',
          },
          { log: false },
        );
      });
      cy.contains('[data-testid=evidence-file]', 'Listo para adjuntar').should('be.visible');
      cy.intercept('POST', '/api/v1/siniestros/*/cargas').as('uploadStart');
      cy.intercept('PUT', '/api/v1/siniestros/*/cargas/*/contenido').as('uploadChunk');
      cy.intercept('POST', '/api/v1/siniestros/*/cargas/*/confirmacion').as('uploadConfirmation');
      cy.get('[data-testid=evidence-upload]').click();
      cy.wait('@uploadStart', { log: false }).then(({ request, response }) => {
        expect(response?.statusCode).to.be.oneOf([200, 201]);
        expect(request.body).to.deep.eq({ mimeType: 'image/png', tamanoBytes: png.length, sha256 });
        expect(request.headers['idempotency-key']).to.match(/^[a-f0-9-]{36}$/i);
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
