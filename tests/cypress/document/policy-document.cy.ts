import type { PolicyDocument } from '../../../src/app/core/policies/policy-document.models';

interface SyntheticDocumentFixture {
  baseUrl: string;
  polizaId: string;
  actorId: string;
  token: string;
  syntheticOnly: true;
  user: { id: string; nombre: string; correo: string; rol: 'cliente' };
}

describe('Documento: navegador → BFF → Polizas/SQLite sintéticos; sesión/dashboard controlados', () => {
  it('consulta, recarga y descarga PDF del documento persistido sin nuevas aceptaciones', () => {
    cy.env<{ POLICY_DOCUMENT_FIXTURE: string; BACKEND_URL: string }>(
      ['POLICY_DOCUMENT_FIXTURE', 'BACKEND_URL'],
      { log: false },
    ).then((environment) => {
      const fixturePath: unknown = environment.POLICY_DOCUMENT_FIXTURE;
      expect(typeof fixturePath, 'fixture privada externa obligatoria').to.eq('string');
      expect(String(fixturePath), 'ruta absoluta fuera del repositorio').to.match(
        /^(?:[a-z]:\\|\/)/i,
      );
      const normalizedPath = String(fixturePath).replace(/\\/g, '/').toLowerCase();
      const projectRoot = Cypress.config('projectRoot').replace(/\\/g, '/').toLowerCase();
      expect(normalizedPath.startsWith(`${projectRoot}/`), 'fixture fuera del proyecto').to.eq(
        false,
      );
      cy.readFile<SyntheticDocumentFixture>(String(fixturePath), { log: false }).then((fixture) => {
        const origin = new URL(fixture.baseUrl);
        expect(fixture.syntheticOnly, 'solo runtime sintético desechable').to.eq(true);
        expect(origin.protocol).to.eq('http:');
        expect(['127.0.0.1', 'localhost']).to.include(origin.hostname);
        expect(origin.origin).to.eq(environment.BACKEND_URL);
        expect(fixture.user.id).to.eq(fixture.actorId);
        expect(fixture.user.rol).to.eq('cliente');
        const path = `/v1/clientes/me/polizas/${fixture.polizaId}`;
        const headers = { Authorization: `Bearer ${fixture.token}` };
        cy.request<PolicyDocument>({
          url: `${origin.origin}${path}/documento`,
          headers,
          log: false,
        }).then(({ status, body: initial }) => {
          expect(status).to.eq(200);
          expect(initial.aceptacionActual, 'póliza sintética nueva').to.eq(null);
          const expires = Date.now() + 300_000;
          cy.intercept('POST', '/api/v1/sesiones/renovar', {
            log: false,
            body: {
              usuario: fixture.user,
              tokenType: 'Bearer',
              accessToken: fixture.token,
              refreshToken: 'solo-restauracion-controlada-del-harness',
              expiraEn: new Date(expires).toISOString(),
              refreshExpiraEn: new Date(expires).toISOString(),
            },
          });
          cy.intercept('GET', '/api/v1/clientes/me/dashboard', {
            cotizaciones: [],
            suscripciones: [],
            pagos: [],
            polizas: [
              {
                id: initial.polizaId,
                suscripcionId: initial.contenido.suscripcionId,
                tipo: initial.contenido.producto.tipo,
                fechaInicio: initial.contenido.vigencia.inicio,
                fechaFin: initial.contenido.vigencia.fin,
                estado: initial.contenido.estado === 'activa' ? 'vigente' : 'cancelada',
                simulada: true,
              },
            ],
            notificaciones: { disponibilidad: 'no_implementado' },
          });
          let pdfHash: string;
          cy.intercept('GET', `/api${path}/documento`, (request) => request.continue()).as(
            'document',
          );
          cy.intercept('POST', `/api${path}/aceptaciones`, (request) => request.continue()).as(
            'accept',
          );
          cy.intercept(
            'GET',
            `/api${path}/documentos/${initial.documentoId}/descarga/pdf`,
            (request) => {
              request.continue((response) => {
                expect(response.statusCode).to.eq(200);
                pdfHash = String(response.headers['x-content-sha256']);
                expect(pdfHash).to.match(/^[a-f0-9]{64}$/);
                expect(response.headers['x-document-content-sha256']).to.eq(initial.contenidoHash);
                expect(response.headers['content-type']).to.eq('application/pdf');
              });
            },
          ).as('download');
          cy.visit(`/app/polizas/${fixture.polizaId}`, {
            onBeforeLoad(window) {
              window.sessionStorage.setItem(
                'solventa.auth.refresh',
                JSON.stringify({
                  user: {
                    id: fixture.actorId,
                    name: fixture.user.nombre,
                    email: fixture.user.correo,
                    role: 'client',
                  },
                  refreshToken: 'solo-restauracion-controlada-del-harness',
                  refreshExpiresAt: expires,
                }),
              );
            },
          });
          cy.wait('@document');
          cy.contains('.document-panel', initial.contenido.producto.nombre).should('be.visible');
          cy.get('.accept-document, .acceptance').should('not.exist');
          cy.reload();
          cy.wait('@document');
          cy.get('.accept-document').should('not.exist');
          cy.get('@accept.all').should('have.length', 0);
          cy.get('.download-document').click();
          cy.wait('@download');
          const filename = `poliza-${initial.polizaId}-${initial.documentoId}.pdf`;
          cy.readFile<Uint8Array>(`${Cypress.config('downloadsFolder')}/${filename}`, null, {
            log: false,
          }).then(async (bytes) => {
            const hash = Array.from(
              new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
              (byte) => byte.toString(16).padStart(2, '0'),
            ).join('');
            expect(hash, 'SHA-256 de los bytes PDF descargados').to.eq(pdfHash);
            expect(new TextDecoder().decode(Uint8Array.from(bytes).slice(0, 5))).to.eq('%PDF-');
          });
          cy.request<PolicyDocument>({
            url: `${origin.origin}${path}/documento`,
            headers,
            log: false,
          }).then(({ body: current }) => {
            expect(current.documentoId).to.eq(initial.documentoId);
            expect(current.contenidoHash).to.eq(initial.contenidoHash);
            expect(current.aceptacionActual).to.eq(initial.aceptacionActual);
            expect(current.historialAceptaciones).to.deep.eq(initial.historialAceptaciones);
          });
        });
      });
    });
  });
});
