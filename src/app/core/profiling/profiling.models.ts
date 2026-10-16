export interface ProfilingConsent {
  consentimientoId: string;
  clienteId: string;
  version: number;
  estado: 'autorizado' | 'revocado';
  finalidad: 'cotizacion';
  alcances: ('open_finance' | 'open_data')[];
  efectivaEn: string;
  vigenteHasta: string;
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

export function consentIsComplete(consent: ProfilingConsent | null): boolean {
  return (
    !!consent &&
    ['autorizado', 'revocado'].includes(consent.estado) &&
    consent.finalidad === 'cotizacion' &&
    Number.isInteger(consent.version) &&
    consent.version > 0 &&
    typeof consent.consentimientoId === 'string' &&
    !!consent.consentimientoId &&
    typeof consent.clienteId === 'string' &&
    !!consent.clienteId &&
    Array.isArray(consent.alcances) &&
    consent.alcances.includes('open_finance') &&
    consent.alcances.includes('open_data') &&
    Number.isFinite(Date.parse(consent.efectivaEn)) &&
    Number.isFinite(Date.parse(consent.vigenteHasta))
  );
}

export function consentIsCurrent(consent: ProfilingConsent | null): boolean {
  return (
    consentIsComplete(consent) &&
    consent?.estado === 'autorizado' &&
    Date.parse(consent.efectivaEn) <= Date.now() &&
    Date.parse(consent.vigenteHasta) > Date.now()
  );
}

export function profileIsCurrent(
  profile: RiskProfile,
  consent: ProfilingConsent | null,
  requestId: string,
): boolean {
  return (
    !!profile &&
    typeof profile === 'object' &&
    consentIsCurrent(consent) &&
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
    Date.parse(profile.calculadoEn) <= Date.now() &&
    Date.parse(profile.vigenteHasta) > Date.now() &&
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
          Date.parse(source.consultadaEn) <= Date.now() &&
          Date.parse(source.vigenteHasta) > Date.now(),
      ),
    )
  );
}
