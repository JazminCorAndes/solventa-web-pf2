export interface ConsentRequest {
  finalidad: 'cotizacion';
  alcances: ('open_finance' | 'open_data')[];
  fuentes: ('open_finance' | 'open_data')[];
  datos: 'indicador_riesgo'[];
  versionTerminos: '1.0';
  vigenteHasta: string;
}

export type ConsentDecision =
  | { autorizado: boolean; version: number; solicitud: ConsentRequest }
  | { autorizado: false; version: number; solicitud?: never };

export function createConsentRequest(now: number): ConsentRequest {
  return {
    finalidad: 'cotizacion',
    alcances: ['open_finance', 'open_data'],
    fuentes: ['open_finance', 'open_data'],
    datos: ['indicador_riesgo'],
    versionTerminos: '1.0',
    vigenteHasta: new Date(now + 30 * 86400000).toISOString(),
  };
}

export interface ProfilingConsent {
  consentimientoId: string;
  clienteId: string;
  version: number;
  estado: 'autorizado' | 'rechazado' | 'revocado' | 'vencido';
  finalidad: 'cotizacion';
  alcances: ('open_finance' | 'open_data')[];
  efectivaEn: string;
  vigenteHasta: string;
  actorId?: string;
  fuentes?: ('open_finance' | 'open_data')[];
  datos?: 'indicador_riesgo'[];
  versionTerminos?: string;
}

export interface RiskProfile {
  solicitudId: string;
  perfilId: string;
  version: number;
  modeloVersion: string;
  score: string;
  nivel: 'A' | 'B' | 'C';
  consentimientoId: string;
  consentimientoVersion: number;
  calculadoEn: string;
  vigenteHasta: string;
  fuentes: {
    nombre: 'open_finance' | 'open_data';
    version: string;
    consultadaEn: string;
    vigenteHasta: string;
    simulada: true;
    indicadorRiesgo: string;
  }[];
  fallbackUsed: false;
}

export function consentIsReadable(consent: ProfilingConsent | null): boolean {
  return (
    !!consent &&
    ['autorizado', 'rechazado', 'revocado', 'vencido'].includes(consent.estado) &&
    consent.finalidad === 'cotizacion' &&
    Number.isInteger(consent.version) &&
    consent.version > 0 &&
    typeof consent.consentimientoId === 'string' &&
    !!consent.consentimientoId &&
    typeof consent.clienteId === 'string' &&
    !!consent.clienteId &&
    Array.isArray(consent.alcances) &&
    Number.isFinite(Date.parse(consent.efectivaEn)) &&
    Number.isFinite(Date.parse(consent.vigenteHasta))
  );
}

export function consentIsComplete(consent: ProfilingConsent | null): boolean {
  return (
    consentIsReadable(consent) &&
    !!consent &&
    typeof consent.actorId === 'string' &&
    !!consent.actorId &&
    consent.versionTerminos === '1.0' &&
    consent.alcances.includes('open_finance') &&
    consent.alcances.includes('open_data') &&
    Array.isArray(consent.fuentes) &&
    consent.fuentes.includes('open_finance') &&
    consent.fuentes.includes('open_data') &&
    Array.isArray(consent.datos) &&
    consent.datos.includes('indicador_riesgo')
  );
}

export function consentIsCurrent(consent: ProfilingConsent | null, now = Date.now()): boolean {
  return (
    consentIsComplete(consent) &&
    consent?.estado === 'autorizado' &&
    Date.parse(consent.efectivaEn) <= now &&
    Date.parse(consent.vigenteHasta) > now
  );
}

export function profileIsCurrent(
  profile: RiskProfile,
  consent: ProfilingConsent | null,
  requestId: string,
  now = Date.now(),
): boolean {
  return (
    !!profile &&
    typeof profile === 'object' &&
    consentIsCurrent(consent, now) &&
    profile.solicitudId === requestId &&
    profile.consentimientoId === consent?.consentimientoId &&
    profile.consentimientoVersion === consent?.version &&
    profile.fallbackUsed === false &&
    typeof profile.score === 'string' &&
    /^(0|1|0\.\d+|1\.0+)$/.test(profile.score) &&
    ['A', 'B', 'C'].includes(profile.nivel) &&
    typeof profile.perfilId === 'string' &&
    !!profile.perfilId &&
    typeof profile.modeloVersion === 'string' &&
    !!profile.modeloVersion &&
    Number.isInteger(profile.version) &&
    profile.version > 0 &&
    Date.parse(profile.calculadoEn) <= now &&
    Date.parse(profile.vigenteHasta) > now &&
    Array.isArray(profile.fuentes) &&
    profile.fuentes.length === 2 &&
    ['open_finance', 'open_data'].every((name) =>
      profile.fuentes.some(
        (source) =>
          !!source &&
          source.nombre === name &&
          source.simulada === true &&
          typeof source.version === 'string' &&
          !!source.version &&
          typeof source.indicadorRiesgo === 'string' &&
          /^(0|1|0\.\d+|1\.0+)$/.test(source.indicadorRiesgo) &&
          Date.parse(source.consultadaEn) <= now &&
          Date.parse(source.vigenteHasta) > now,
      ),
    )
  );
}
