export const MODIFICATION_POLICY_ID = '6a1d7e3c-90b2-4f3f-8c2e-1b6f0e2d4a55';
export const ENDORSEMENT_ID = '7b2e8f4d-a1c3-4a40-9d3f-2c7a1f3e5b66';
export const IMPACT_HASH = 'e'.repeat(64);

function coverages(optionalIncluded: boolean) {
  return [
    {
      codigo: 'danos_vehiculo',
      nombre: 'Daños al vehículo',
      descripcion: 'Daños accidentales sufridos por el vehículo asegurado.',
      opcional: false,
      incluida: true,
    },
    {
      codigo: 'asistencia_carretera',
      nombre: 'Asistencia en carretera',
      descripcion: 'Acompañamiento ante inmovilización o emergencia.',
      opcional: true,
      incluida: optionalIncluded,
    },
  ];
}

/** Respuestas del BFF Web segun contracts/openapi/bff-web-v1.yaml (modificacion de poliza). */
export const VERSION_1 = {
  version: 1,
  plan: 'esencial',
  coberturas: coverages(true),
  prima: { monto: '85000', moneda: 'COP', periodicidad: 'mensual' },
  efectivoDesde: '2026-11-11',
  origen: 'emision',
  endosoId: null,
  creadaEn: '2026-11-11T15:00:00Z',
};

export const VERSION_2 = {
  version: 2,
  plan: 'premium',
  coberturas: coverages(false),
  prima: { monto: '100100', moneda: 'COP', periodicidad: 'mensual' },
  efectivoDesde: '2026-11-16',
  origen: 'modificacion',
  endosoId: ENDORSEMENT_ID,
  creadaEn: '2026-11-15T15:00:00Z',
};

export const MODIFICATION_STATE_RESPONSE = {
  polizaId: MODIFICATION_POLICY_ID,
  tipo: 'automotive',
  vigencia: { inicio: '2026-11-11', fin: '2026-12-11' },
  modificable: true,
  motivo: null,
  versionActual: VERSION_1,
  opciones: {
    planes: [
      { codigo: 'esencial', nombre: 'Esencial', factor: '1.00' },
      { codigo: 'integral', nombre: 'Integral', factor: '1.15' },
      { codigo: 'premium', nombre: 'Premium', factor: '1.30' },
    ],
    coberturasOpcionales: [
      {
        codigo: 'asistencia_carretera',
        nombre: 'Asistencia en carretera',
        recargo: { monto: '8000', moneda: 'COP' },
      },
    ],
  },
  historial: [VERSION_1],
};

export const NOT_MODIFIABLE_RESPONSE = {
  ...MODIFICATION_STATE_RESPONSE,
  modificable: false,
  motivo: 'poliza_vencida',
  opciones: null,
};

export const IMPACT_RESPONSE = {
  versionBase: 1,
  plan: { anterior: 'esencial', nuevo: 'premium' },
  coberturas: coverages(false),
  coberturasAgregadas: [],
  coberturasRetiradas: ['asistencia_carretera'],
  primaAnterior: { monto: '85000', moneda: 'COP' },
  primaNueva: { monto: '100100', moneda: 'COP' },
  diferenciaMensual: { monto: '15100', moneda: 'COP' },
  ajusteProrrateado: { monto: '12665', moneda: 'COP' },
  diasRestantes: 26,
  efectivoDesde: '2026-11-16',
  vigencia: { inicio: '2026-11-11', fin: '2026-12-11', cambia: false },
  reglaVersion: 'academica-modificacion-v1',
  impactoHash: IMPACT_HASH,
};

export const MODIFICATION_RESULT_RESPONSE = {
  endosoId: ENDORSEMENT_ID,
  polizaId: MODIFICATION_POLICY_ID,
  versionAnterior: 1,
  versionNueva: 2,
  version: VERSION_2,
  impacto: IMPACT_RESPONSE,
  creadoEn: '2026-11-15T15:00:00Z',
};
