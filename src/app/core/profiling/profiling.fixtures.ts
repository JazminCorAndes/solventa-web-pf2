import { ProfilingConsent, RiskProfile } from './profiling.models';

export function createConsent(): ProfilingConsent {
  return {
    consentimientoId: '11111111-1111-4111-8111-111111111111',
    clienteId: '22222222-2222-4222-8222-222222222222',
    actorId: '22222222-2222-4222-8222-222222222222',
    fuentes: ['open_finance', 'open_data'],
    datos: ['indicador_riesgo'],
    versionTerminos: '1.0',
    version: 1,
    estado: 'autorizado',
    finalidad: 'cotizacion',
    alcances: ['open_finance', 'open_data'],
    efectivaEn: new Date(Date.now() - 1000).toISOString(),
    vigenteHasta: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
}

export function createProfile(requestId = 'AQT-2026-123456'): RiskProfile {
  const consent = createConsent();
  const now = new Date(Date.now() - 1000).toISOString();
  const until = new Date(Date.now() + 15 * 60000).toISOString();
  return {
    solicitudId: requestId,
    perfilId: '33333333-3333-4333-8333-333333333333',
    version: 1,
    modeloVersion: 'modelo-1',
    score: '0.250000',
    nivel: 'A',
    consentimientoId: consent.consentimientoId,
    consentimientoVersion: consent.version,
    calculadoEn: now,
    vigenteHasta: until,
    fuentes: (['open_finance', 'open_data'] as const).map((nombre) => ({
      nombre,
      version: 'mock-1',
      consultadaEn: now,
      vigenteHasta: until,
      simulada: true,
      indicadorRiesgo: '0.250000',
    })),
    fallbackUsed: false,
  };
}
