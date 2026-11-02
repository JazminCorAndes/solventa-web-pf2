import type {
  AdvisorException,
  ResolvedAdvisorException,
} from '../../../src/app/core/advisor-exceptions/advisor-exceptions.models';
import type {
  ClientInformationResult,
  ClientInformationReview,
} from '../../../src/app/data-access/partners/http-client-information.gateway';
import es from '../../../public/assets/i18n/es.json';
import { observeLogin } from '../support/real-backend';

type Outcome = 'completada' | 'detenida' | 'bloqueada';
type Role = 'socio' | 'asesor';
interface Client {
  clienteId: string;
  tipoDocumento: 'passport';
  numeroDocumento: string;
  expectedOutcome: Outcome;
}
interface OwnedRun {
  fixture: {
    run_id: string;
    socioId: string;
    productoId: string;
    finalidad: 'cotizacion';
    datosSolicitados: string[];
    actors: Record<Role, { id: string; rol: Role }>;
    clients: Client[];
  };
  readiness: {
    runId: string;
    backendSha: string;
    webSha: string;
    specSha256: string;
    readinessCompletedAt: string;
    expiresAt: string;
    deliveryFault: { enabled: true; consumed: false };
  };
  credentials: { run_id: string; password: string; actors: Record<Role, { email: string }> };
}
interface CaseEvidence {
  clienteId: string;
  outcome: Outcome;
  operationId?: string;
  excepcionId?: string;
  route?: string;
  blocked?: ClientInformationReview;
  beforeApply?: AdvisorException;
  receipt?: ResolvedAdvisorException;
  received?: ClientInformationReview;
  result?: ClientInformationResult;
}
interface Observation {
  completedAt: string;
  method: string;
  path: string;
  search: string;
  status: number;
  code?: string;
  correlationId: string;
  body?: unknown;
}

const CONSULTATIONS = '/api/v1/socios/consultas-informacion-cliente';
const EXCEPTIONS = '/api/v1/asesor/excepciones-open-finance';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

describe('HU44 real con recuperación explícita de despacho HTTP y tres resultados', () => {
  let evidence: () => object = () => ({ phase: 'not-started' });

  afterEach(function () {
    cy.get('body', { log: false }).then(($body) =>
      cy.writeFile(
        'reports/cypress/controlled/open-finance-review/evidence.json',
        {
          ...evidence(),
          testStateBeforeSharedGuards: this.currentTest?.state ?? 'unknown',
          ui: {
            title: $body.find('h1').text().trim(),
            application: $body.find('.application-status, .review-application').text().trim(),
            ack: $body.find('.application-ack, .review-ack').text().trim(),
            alerts: $body
              .find('[role=alert]')
              .toArray()
              .map((node) => node.textContent?.trim()),
          },
        },
        { log: false },
      ),
    );
  });

  it('produce tres operaciones desde formulario y separa decisión, aplicación, ACK y recepción', () => {
    const startedAt = new Date().toISOString();
    const cases: CaseEvidence[] = [];
    const observations: Observation[] = [];
    const mutations: { path: string; body: unknown; key?: string }[] = [];
    const diagnostics = { consoleErrors: 0, windowErrors: 0, unhandledRejections: 0 };
    let phase = 'preflight';
    let readiness: OwnedRun['readiness'];
    evidence = () => ({
      startedAt,
      observedAt: new Date().toISOString(),
      phase,
      readiness,
      cases,
      requests: observations,
      mutations,
      diagnostics,
      limits:
        'Muestra local serial con actores y consentimiento legítimos de fixture. Productor HU44 real, sin insertar excepciones. Disponibilidad de open_finance controlada por el backend. Una HTTP503 de despacho antes del handler, no caída TCP/reinicio. Acuse durable no acredita recepción por sí solo: se cotejan GET del socio y, solo para completada, sus datos. Sin AWS, SLA ni cierre de sprints. Sin credenciales, tokens, capturas ni grabaciones. El soporte fija no-store; el XML final posterior a las guardas determina el resultado.',
    });
    cy.on('window:before:load', (win) => {
      const original = win.console.error;
      win.console.error = (...args: unknown[]) => {
        diagnostics.consoleErrors++;
        original.apply(win.console, args);
      };
      win.addEventListener('error', () => diagnostics.windowErrors++);
      win.addEventListener('unhandledrejection', () => diagnostics.unhandledRejections++);
    });
    cy.intercept('/api/**', (request) => {
      const url = new URL(request.url);
      const business =
        url.pathname.startsWith(CONSULTATIONS) || url.pathname.startsWith(EXCEPTIONS);
      if (business && request.method !== 'GET') {
        mutations.push({
          path: url.pathname,
          body: request.body,
          ...(request.headers['idempotency-key']
            ? { key: String(request.headers['idempotency-key']) }
            : {}),
        });
      }
      request.on('response', (response) => {
        observations.push({
          completedAt: new Date().toISOString(),
          method: request.method,
          path: url.pathname,
          search: url.search,
          status: response.statusCode,
          ...(typeof response.body?.code === 'string' ? { code: response.body.code } : {}),
          correlationId: String(response.headers['x-correlation-id'] ?? ''),
          ...(business ? { body: response.body } : {}),
        });
      });
    });
    observeLogin();
    cy.intercept({ method: 'POST', pathname: CONSULTATIONS }).as('produce');
    cy.intercept({ method: 'GET', pathname: `${CONSULTATIONS}/*/estado` }).as('operationStatus');
    cy.intercept({ method: 'GET', pathname: `${CONSULTATIONS}/*` }).as('information');
    cy.intercept({ method: 'GET', pathname: EXCEPTIONS }).as('queue');
    cy.intercept({ method: 'GET', pathname: `${EXCEPTIONS}/*` }).as('detail');
    cy.intercept({ method: 'POST', pathname: `${EXCEPTIONS}/*/resolver` }).as('decide');
    cy.intercept({ method: 'POST', pathname: `${EXCEPTIONS}/*/aplicar` }).as('apply');

    cy.task<OwnedRun>('hu44Fixture', null, { log: false }).then((owned) => {
      readiness = owned.readiness;
      const fixture = owned.fixture;
      const loginAs = (role: Role) => {
        const destination = role === 'socio' ? '/app/socios' : '/asesor/excepciones';
        cy.visit(`/iniciar-sesion?returnUrl=${encodeURIComponent(destination)}`);
        cy.get('#login-email').type(owned.credentials.actors[role].email, { log: false });
        cy.get('#login-password').type(owned.credentials.password, { log: false });
        cy.get('button[type=submit]').click();
        cy.wait('@realLogin', { log: false }).then(({ response }) => {
          expect(response?.statusCode, 'login JWE real').to.eq(200);
          expect(response!.body.usuario.id).to.eq(fixture.actors[role].id);
          expect(response!.body.usuario.rol).to.eq(role);
        });
        cy.location('pathname').should('eq', destination);
      };
      const logout = () => {
        cy.get('.logout-button').click();
        cy.location('pathname').should('eq', '/iniciar-sesion');
      };
      const typeLabeledField = (selector: string, value: string) => {
        cy.get(selector)
          .closest('mat-form-field')
          .find('mat-label')
          .should('have.length', 1)
          .should(($label) => {
            const control = $label[0].ownerDocument.querySelector(selector);
            expect(control).not.to.eq(null);
            expect($label[0].closest('label')?.control).to.eq(control);
          })
          .click();
        cy.get(selector).should('be.focused').type(value).should('have.value', value);
      };
      const assertReceipt = (body: AdvisorException, sample: CaseEvidence, pending = false) => {
        const rejected = sample.outcome === 'detenida';
        expect(body).to.include({
          excepcionId: sample.excepcionId,
          operationId: sample.operationId,
          clienteId: sample.clienteId,
          socioId: fixture.socioId,
          estado: rejected ? 'rechazada' : 'aprobada',
          decision: rejected ? 'rechazar' : 'aprobar',
          actorId: fixture.actors.asesor.id,
          motivo: `Validacion HU44 ${sample.outcome} ${fixture.run_id}`,
        });
        expect(body.proceso).to.deep.eq({
          tipo: 'consulta_informacion_cliente',
          actorSolicitanteId: fixture.actors.socio.id,
          productoId: fixture.productoId,
          finalidad: fixture.finalidad,
          datosSolicitados: fixture.datosSolicitados,
        });
        expect(body.aplicacion?.estado).to.eq(pending ? 'pendiente' : sample.outcome);
        expect(body.aplicacion?.intentos).to.eq(pending || rejected ? 0 : 1);
        if (pending) {
          expect(body.aplicacion?.acuseId).to.eq(null);
          expect(body.aplicacion?.codigo).to.eq(null);
        } else {
          expect(body.aplicacion?.acuseId).to.match(UUID);
          expect(body.aplicacion?.codigo).to.eq(
            rejected
              ? 'operacion_rechazada'
              : sample.outcome === 'completada'
                ? 'consulta_disponible'
                : 'fuente_no_disponible',
          );
        }
        if (body.estado === 'pendiente') throw new Error('Decision was not persisted.');
        return body;
      };
      const chooseFilter = (state: Outcome | 'pendiente') => {
        cy.get('#exception-application-filter').click();
        cy.contains('mat-option', es.advisorExceptions.application.status[state]).click();
        cy.location('search').should('contain', `estadoAplicacion=${state}`);
        cy.wait('@queue', { log: false }).its('response.statusCode').should('eq', 200);
      };

      for (const [index, client] of fixture.clients.entries()) {
        const sample: CaseEvidence = {
          clienteId: client.clienteId,
          outcome: client.expectedOutcome,
        };
        cy.then(() => {
          cases.push(sample);
          phase = `produce-${sample.outcome}`;
        });
        if (index === 0) loginAs('socio');
        else cy.visit('/app/socios');
        cy.get(`.partner-card[aria-label="${fixture.socioId}"]`)
          .should('have.length', 1)
          .find('a[href^="/app/socios/clientes/consultar"]')
          .should('have.length', 1)
          .click();
        cy.location('search').should((search) =>
          expect(new URLSearchParams(search).get('socio')).to.eq(fixture.socioId),
        );
        cy.get('mat-select[formcontrolname=documentType]').click();
        cy.contains('mat-option', es.quoteRequest.documentTypes.passport).click();
        typeLabeledField('input[formcontrolname=documentNumber]', client.numeroDocumento);
        cy.get('button[type=submit]').should('be.enabled').click();
        cy.wait('@produce', { log: false }).then(({ request, response }) => {
          expect(response?.statusCode).to.eq(503);
          expect(response!.body.code).to.eq('consulta_bloqueada');
          expect(String(response!.headers['content-type'])).to.contain('application/problem+json');
          expect(response!.body.correlationId).to.match(UUID);
          sample.blocked = response!.body.operacion;
          sample.operationId = sample.blocked!.operationId;
          sample.excepcionId = sample.blocked!.excepcionId;
          expect(sample.operationId).to.match(UUID);
          expect(request.headers['idempotency-key']).to.eq(sample.operationId);
          expect(request.body).to.deep.eq({
            operationId: sample.operationId,
            socioId: fixture.socioId,
            tipoDocumento: client.tipoDocumento,
            numeroDocumento: client.numeroDocumento,
            productoId: fixture.productoId,
            finalidad: fixture.finalidad,
            datosSolicitados: fixture.datosSolicitados,
          });
          expect(sample.blocked).to.include({
            socioId: fixture.socioId,
            clienteId: client.clienteId,
            productoId: fixture.productoId,
            estadoDecision: 'pendiente',
          });
          expect(sample.blocked!.aplicacion).to.include({
            estado: 'esperando_decision',
            intentos: 0,
            codigo: null,
            acuseId: null,
          });
        });
        cy.location().then(({ pathname, search }) => {
          sample.route = pathname + search;
        });
        cy.get('.review-application').should(
          'contain',
          es.advisorExceptions.application.status.esperando_decision,
        );
        cy.get('button[type=submit]').should('not.exist');
        cy.get('.refresh-review').click();
        cy.wait('@operationStatus', { log: false }).then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(response!.body).to.deep.eq(sample.blocked);
        });
        logout();

        cy.then(() => {
          phase = `decide-${sample.outcome}`;
        });
        loginAs('asesor');
        cy.wait('@queue', { log: false }).then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(
            response!.body.excepciones.map((item: AdvisorException) => item.excepcionId),
          ).to.include(sample.excepcionId);
        });
        cy.then(() => cy.get(`a[href*="/asesor/excepciones/${sample.excepcionId}"]`).click());
        cy.wait<unknown, AdvisorException>('@detail', { log: false }).then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(response!.body.estado).to.eq('pendiente');
          expect(response!.body.decision).to.eq(null);
          expect(response!.body.aplicacion?.acuseId).to.eq(null);
        });
        typeLabeledField(
          'textarea[formcontrolname=motivo]',
          `Validacion HU44 ${sample.outcome} ${fixture.run_id}`,
        );
        if (sample.outcome === 'detenida')
          cy.contains('.resolution-card button', es.advisorExceptions.reject).click();
        else cy.get('.resolution-card button[type=submit]').click();
        cy.wait<unknown, AdvisorException & { code?: string }>('@decide', { log: false }).then(
          ({ request, response }) => {
            expect(request.body).to.deep.eq({
              decision: sample.outcome === 'detenida' ? 'rechazar' : 'aprobar',
              motivo: `Validacion HU44 ${sample.outcome} ${fixture.run_id}`,
            });
            expect(response?.statusCode).to.eq(sample.outcome === 'completada' ? 503 : 200);
            if (sample.outcome === 'completada')
              expect(response!.body.code).to.eq('servicio_no_disponible');
            else sample.receipt = assertReceipt(response!.body, sample);
          },
        );
        if (sample.outcome === 'completada') {
          cy.wait<unknown, AdvisorException>('@detail', { log: false }).then(({ response }) => {
            expect(response?.statusCode).to.eq(200);
            sample.beforeApply = assertReceipt(response!.body, sample, true);
          });
          cy.get('.application-status').should(
            'contain',
            es.advisorExceptions.application.status.pendiente,
          );
          cy.get('.application-ack').should('not.exist');
          cy.reload();
          cy.wait<unknown, AdvisorException>('@detail', { log: false }).then(({ response }) => {
            expect(response?.statusCode).to.eq(200);
            assertReceipt(response!.body, sample, true);
            expect(response!.body.aplicacion).to.deep.eq(sample.beforeApply!.aplicacion);
          });
          cy.get('.back-link').click();
          cy.wait('@queue', { log: false }).its('response.statusCode').should('eq', 200);
          chooseFilter('pendiente');
          cy.reload();
          cy.wait('@queue', { log: false }).its('response.statusCode').should('eq', 200);
          cy.then(() => cy.get(`a[href*="/asesor/excepciones/${sample.excepcionId}"]`).click());
          cy.wait<unknown, AdvisorException>('@detail', { log: false }).then(({ response }) => {
            expect(response?.statusCode).to.eq(200);
            assertReceipt(response!.body, sample, true);
            expect(mutations.filter((item) => item.path.endsWith('/resolver'))).to.have.length(1);
            expect(mutations.filter((item) => item.path.endsWith('/aplicar'))).to.have.length(0);
          });
          cy.get('.resolution-card').should('not.exist');
          cy.get('.apply-operation').should('be.enabled').click();
          cy.wait<unknown, AdvisorException>('@apply', { log: false }).then(
            ({ request, response }) => {
              expect(request.body).to.deep.eq({});
              expect(response?.statusCode).to.eq(200);
              sample.receipt = assertReceipt(response!.body, sample);
            },
          );
        }
        cy.get('.application-status').should(
          'contain',
          es.advisorExceptions.application.status[sample.outcome],
        );
        cy.get('.apply-operation, .resolution-card').should('not.exist');
        cy.get('.success-alert').should('contain', es.advisorExceptions.application.decisionNotice);
        cy.get('.back-link').click();
        cy.wait('@queue', { log: false }).its('response.statusCode').should('eq', 200);
        chooseFilter(sample.outcome);
        cy.reload();
        cy.wait('@queue', { log: false }).its('response.statusCode').should('eq', 200);
        cy.then(() => cy.get(`a[href*="/asesor/excepciones/${sample.excepcionId}"]`).click());
        cy.wait<unknown, AdvisorException>('@detail', { log: false }).then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          assertReceipt(response!.body, sample);
          expect(response!.body.aplicacion).to.deep.eq(sample.receipt!.aplicacion);
        });
        cy.get('.application-ack').should(($ack) =>
          expect($ack.text()).to.contain(sample.receipt!.aplicacion!.acuseId),
        );
        cy.get('.apply-operation, .resolution-card').should('not.exist');
        logout();

        cy.then(() => {
          phase = `receive-${sample.outcome}`;
        });
        loginAs('socio');
        cy.then(() => cy.visit(sample.route!));
        cy.wait<unknown, ClientInformationReview>('@operationStatus', { log: false }).then(
          ({ response }) => {
            expect(response?.statusCode).to.eq(200);
            sample.received = response!.body;
            expect(sample.received).to.deep.eq({
              operationId: sample.operationId,
              socioId: fixture.socioId,
              clienteId: client.clienteId,
              productoId: fixture.productoId,
              excepcionId: sample.excepcionId,
              estadoDecision: sample.receipt!.estado,
              aplicacion: sample.receipt!.aplicacion,
            });
          },
        );
        if (sample.outcome === 'completada') {
          cy.wait<unknown, ClientInformationResult>('@information', { log: false }).then(
            ({ response }) => {
              expect(response?.statusCode).to.eq(200);
              sample.result = response!.body;
              expect(sample.result).to.include({
                operationId: sample.operationId,
                socioId: fixture.socioId,
                clienteId: client.clienteId,
                productoId: fixture.productoId,
                estado: 'completada',
                finalidad: fixture.finalidad,
              });
              expect(sample.result.datos.indicadorRiesgo).to.be.a('string');
              expect(sample.result.datos.indicadorRiesgo.length).to.be.greaterThan(0);
              expect(sample.result.evidenciaFuentes.length).to.be.greaterThan(0);
            },
          );
          cy.get('.audit-summary').should('be.visible');
          cy.get('.summary-field strong').should(($values) =>
            expect($values.text()).to.contain(sample.result!.datos.indicadorRiesgo),
          );
        } else cy.get('.audit-summary').should('not.exist');
        cy.get('.review-application').should(
          'contain',
          es.advisorExceptions.application.status[sample.outcome],
        );
        cy.get('.review-ack').should(($ack) =>
          expect($ack.text()).to.contain(sample.receipt!.aplicacion!.acuseId),
        );
        cy.get('button[type=submit]').should('not.exist');
        cy.then(() => {
          expect(
            observations.filter(
              (item) =>
                item.method === 'GET' && item.path === `${CONSULTATIONS}/${sample.operationId}`,
            ),
          ).to.have.length(sample.outcome === 'completada' ? 1 : 0);
        });
        if (index === fixture.clients.length - 1) logout();
      }
      cy.then(() => {
        phase = 'all-three-received';
        expect(new Set(cases.map((sample) => sample.operationId)).size).to.eq(3);
        expect(mutations.filter((item) => item.path === CONSULTATIONS)).to.have.length(3);
        expect(mutations.filter((item) => item.path.endsWith('/resolver'))).to.have.length(3);
        expect(mutations.filter((item) => item.path.endsWith('/aplicar'))).to.have.length(1);
        expect(mutations).to.have.length(7);
        const errors = observations.filter((item) => item.status >= 400);
        expect(
          errors.filter(
            (item) =>
              item.path === CONSULTATIONS &&
              item.status === 503 &&
              item.code === 'consulta_bloqueada',
          ),
        ).to.have.length(3);
        expect(
          errors.filter(
            (item) =>
              item.path === `${EXCEPTIONS}/${cases[0].excepcionId}/resolver` &&
              item.status === 503 &&
              item.code === 'servicio_no_disponible',
          ),
        ).to.have.length(1);
        expect(errors).to.have.length(4);
        expect(diagnostics).to.deep.eq({
          consoleErrors: 0,
          windowErrors: 0,
          unhandledRejections: 0,
        });
      });
    });
  });
});
