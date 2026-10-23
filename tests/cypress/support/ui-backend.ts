import { products } from './products';
import type {
  ConsentDecision,
  ProfilingConsent,
} from '../../../src/app/core/profiling/profiling.models';

export const syntheticUser = {
  id: 'cypress-ui-customer',
  nombre: 'Cliente Sintetico Cypress',
  correo: 'cypress-ui@example.invalid',
  rol: 'cliente',
  tipoDocumento: 'cc',
  identificacion: '1000000001',
  telefono: '3000000000',
};
export const password = 'Solo-Pruebas-2026!';
export const emptyDashboard = {
  cotizaciones: [],
  suscripciones: [],
  pagos: [],
  polizas: [],
  notificaciones: { disponibilidad: 'no_implementado' },
};
export const quoteId = 'AQT-CYPRESS-UI';
export const consent = (): ProfilingConsent => ({
  consentimientoId: 'consent-ui',
  clienteId: syntheticUser.id,
  version: 1,
  estado: 'autorizado',
  finalidad: 'cotizacion',
  alcances: ['open_finance', 'open_data'],
  actorId: syntheticUser.id,
  fuentes: ['open_finance', 'open_data'],
  datos: ['indicador_riesgo'],
  versionTerminos: '1.0',
  efectivaEn: new Date(Date.now() - 10000).toISOString(),
  vigenteHasta: new Date(Date.now() + 86400000).toISOString(),
});
export const grant = () => ({
  usuario: syntheticUser,
  tokenType: 'Bearer',
  accessToken: 'synthetic-ui-access-not-a-real-jwt',
  refreshToken: 'synthetic-ui-refresh-not-a-real-token',
  expiraEn: new Date(Date.now() + 3600000).toISOString(),
  refreshExpiraEn: new Date(Date.now() + 86400000).toISOString(),
});
export const offers = () => ({
  solicitudId: quoteId,
  calculadaEn: new Date().toISOString(),
  vigenteHasta: consent().vigenteHasta,
  tasaAplicada: '0.01',
  ofertas: ['disponible', 'vencida', 'retirada'].map((estado, index) => ({
    id: `offer-${index}`,
    version: 1,
    nombre: `Plan sintetico ${index}`,
    descripcion: 'Contrato UI controlado, no cotizacion real',
    prima: { monto: '41250.00', moneda: 'COP' },
    periodicidad: 'mensual',
    coberturaPrincipal: 'Cobertura academica',
    deducible: '10%',
    vigencia: 'Un mes',
    responsabilidadCivil: 'Academica',
    coberturas: ['Cobertura sintetica'],
    condiciones: ['Sin cobertura real'],
    beneficiosAdicionales: [],
    recomendada: index === 0,
    estado,
    vigenteHasta: consent().vigenteHasta,
  })),
});

/** Only used by ui specs. Unmatched calls fail instead of reaching a real backend. */
export function mockBackend() {
  let savedConsent: ProfilingConsent | null = null;
  cy.intercept('/api/**', {
    statusCode: 501,
    body: { code: 'contrato_ui_no_definido' },
    log: false,
  });
  cy.intercept('POST', '/api/v1/sesiones', { body: grant(), log: false }).as('login');
  cy.intercept('POST', '/api/v1/sesiones/renovar', { body: grant(), log: false }).as('refresh');
  cy.intercept('DELETE', '/api/v1/sesiones/actual', { statusCode: 204, log: false }).as('logout');
  cy.intercept('GET', '/api/v1/clientes/me/dashboard', { body: emptyDashboard }).as('dashboard');
  cy.intercept('GET', '/api/v1/productos-seguro', {
    productos: products.map(({ id }) => ({ id, nombre: id, descripcion: id, disponible: true })),
  }).as('catalog');
  cy.intercept('GET', '/api/v1/destinos-viaje', { destinos: [{ codigo: 'ES', nombre: 'España' }] });
  cy.intercept('GET', '/api/v1/consentimientos/perfilamiento', (request) => {
    request.reply(
      savedConsent
        ? { body: savedConsent }
        : { statusCode: 404, body: { code: 'consentimiento_ausente' } },
    );
  });
  cy.intercept('PUT', '/api/v1/consentimientos/perfilamiento', (request) => {
    const decision: ConsentDecision = request.body;
    savedConsent = {
      ...(savedConsent ?? consent()),
      ...decision.solicitud,
      version: decision.version + 1,
      estado: decision.autorizado ? 'autorizado' : decision.solicitud ? 'rechazado' : 'revocado',
    };
    request.reply(savedConsent);
  }).as('consent');
  cy.intercept('POST', '/api/v1/solicitudes-cotizacion', (request) => {
    request.reply({
      id: quoteId,
      ...request.body,
      estado: 'recibida',
      creadaEn: new Date().toISOString(),
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: syntheticUser.identificacion,
      correo: syntheticUser.correo,
      telefono: syntheticUser.telefono,
    });
  }).as('quote');
  cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/ofertas`, { body: offers() }).as(
    'offers',
  );
  cy.intercept('GET', `/api/v1/solicitudes-cotizacion/${quoteId}/seleccion`, { statusCode: 404 });
}
