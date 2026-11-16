export const RENEWAL_POLICY_ID = '0b5f8f62-3c1e-4a3e-9a51-6d8f0f3a9c11';
export const RENEWAL_ID = '9c3d1e7a-5b2f-4c8d-8e1a-3f6b7c2d4e55';
export const CONDITIONS_HASH = 'c'.repeat(64);

/** Respuestas del BFF Web segun contracts/openapi/bff-web-v1.yaml (renovacion de poliza). */
export const RENEWAL_OFFER_RESPONSE = {
  polizaId: RENEWAL_POLICY_ID,
  producto: 'Microseguro de Vida',
  finAnterior: '2026-12-11',
  nuevaVigencia: { inicio: '2026-12-12', fin: '2027-01-12' },
  coberturas: [
    { nombre: 'Fallecimiento', descripcion: 'Respaldo económico para los beneficiarios.' },
    {
      nombre: 'Incapacidad total y permanente',
      descripcion: 'Protección cuando un evento impide trabajar.',
    },
  ],
  prima: { monto: '25000', moneda: 'COP', periodicidad: 'mensual' },
  condiciones: ['La información de salud declarada debe seguir siendo verificable.'],
  requierePago: true,
  reglaVersion: 'academica-renovacion-v1',
  condicionesHash: CONDITIONS_HASH,
};

export const ELIGIBILITY_RESPONSE = {
  polizaId: RENEWAL_POLICY_ID,
  tipo: 'life',
  vigenciaActual: { inicio: '2026-11-11', fin: '2026-12-11' },
  renovable: true,
  motivo: null,
  ventana: { desde: '2026-11-26', hasta: '2026-12-11' },
  oferta: RENEWAL_OFFER_RESPONSE,
  ultimoIntento: null,
};

export const NOT_RENEWABLE_RESPONSE = {
  ...ELIGIBILITY_RESPONSE,
  renovable: false,
  motivo: 'fuera_de_ventana',
  oferta: null,
};

export function renewalResponse(
  estado: 'pendiente' | 'renovada' | 'rechazada',
): Record<string, unknown> {
  const offer: Record<string, unknown> = { ...RENEWAL_OFFER_RESPONSE };
  delete offer['producto'];
  delete offer['requierePago'];
  return {
    ...offer,
    id: RENEWAL_ID,
    estado,
    motivo: estado === 'rechazada' ? 'pago_rechazado' : null,
    creadaEn: '2026-12-10T15:00:00Z',
    actualizadaEn: '2026-12-10T15:00:01Z',
    simulada: true,
  };
}

export function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return {
    type: `https://api.solventa.co/problems/${code}`,
    title: 'Problema',
    status,
    detail: 'Detalle',
    code,
    correlationId: '2f6c1a3e-7b4d-4e8f-9a1b-5c3d2e1f0a99',
    ...extra,
  };
}
