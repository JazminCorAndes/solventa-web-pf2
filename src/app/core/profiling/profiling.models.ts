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

export function consentRequestIssues(request: ConsentRequest | null, now: number): string[] {
  const issues: string[] = [];
  const validSources = (values: unknown): values is ConsentRequest['fuentes'] =>
    Array.isArray(values) &&
    values.length > 0 &&
    new Set(values).size === values.length &&
    values.every((value) => value === 'open_finance' || value === 'open_data');
  if (request?.finalidad !== 'cotizacion') {
    issues.push('purpose');
  }
  if (!validSources(request?.alcances)) {
    issues.push('scopes');
  }
  if (
    !validSources(request?.fuentes) ||
    !validSources(request?.alcances) ||
    !request.fuentes.every((source) => request.alcances.includes(source))
  ) {
    issues.push('sources');
  }
  if (request?.datos?.length !== 1 || request.datos[0] !== 'indicador_riesgo') {
    issues.push('data');
  }
  if (request?.versionTerminos !== '1.0') {
    issues.push('terms');
  }
  if (
    !request?.vigenteHasta ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(request.vigenteHasta) ||
    !Number.isFinite(Date.parse(request.vigenteHasta)) ||
    Date.parse(request.vigenteHasta) <= now ||
    Date.parse(request.vigenteHasta) > now + 30 * 86400000
  ) {
    issues.push('validity');
  }
  return issues;
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
    nombre: string;
    version: string;
    consultadaEn: string;
    vigenteHasta: string;
    simulada: true;
    indicadorRiesgo: string;
  }[];
  estadoFuentes?: {
    fuente: string;
    estado: 'disponible' | 'cache' | 'fallida';
    intentos: number;
    motivo: string | null;
  }[];
  fallbackUsed: boolean;
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
    consent.actorId === consent.clienteId &&
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
    typeof profile.fallbackUsed === 'boolean' &&
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
    profile.fuentes.length >= 2 &&
    profile.fuentes.every(
      (source) =>
        !!source &&
        typeof source.nombre === 'string' &&
        !!source.nombre.trim() &&
        source.simulada === true &&
        typeof source.version === 'string' &&
        !!source.version &&
        typeof source.indicadorRiesgo === 'string' &&
        /^(0|1|0\.\d+|1\.0+)$/.test(source.indicadorRiesgo) &&
        Date.parse(source.consultadaEn) <= now &&
        Date.parse(source.vigenteHasta) > now,
    ) &&
    new Set(profile.fuentes.map((source) => source.nombre)).size === profile.fuentes.length &&
    ['open_finance', 'open_data'].every((name) =>
      profile.fuentes.some((source) => source.nombre === name),
    ) &&
    profileSourceStatesMatch(profile)
  );
}

function profileSourceStatesMatch(profile: RiskProfile): boolean {
  const states = profile.estadoFuentes;
  if (states === undefined || (Array.isArray(states) && states.length === 0)) {
    return !profile.fallbackUsed;
  }
  return (
    Array.isArray(states) &&
    states.length === profile.fuentes.length &&
    new Set(states.map((state) => state?.fuente)).size === states.length &&
    states.every(
      (state) =>
        !!state &&
        profile.fuentes.some((source) => source.nombre === state.fuente) &&
        (state.estado === 'disponible' || state.estado === 'cache') &&
        Number.isInteger(state.intentos) &&
        state.intentos >= 0 &&
        state.intentos <= 2 &&
        (state.motivo === null || typeof state.motivo === 'string'),
    ) &&
    profile.fallbackUsed === states.some((state) => state.estado === 'cache')
  );
}
