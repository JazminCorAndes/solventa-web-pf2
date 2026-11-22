export const REPORT_FINGERPRINT = 'b'.repeat(64);
export const REPORT_CUT_OFF = '2026-11-19T14:59:00Z';

/** Respuestas del BFF Web segun contracts/openapi/bff-web-v1.yaml (reportes operativos). */
export const OPTIONS_RESPONSE = {
  productos: [
    'automotive',
    'travel',
    'life',
    'device-protection',
    'parametric',
    'parametric-weather',
    'payment-protection',
    'mortgage-life',
  ],
  estados: ['programada', 'vigente', 'vencida', 'cancelada'],
  periodoMaximoDias: 366,
};

export function reportResponse(
  filters: { desde: string; hasta: string; producto?: string | null; estado?: string | null },
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    corte: REPORT_CUT_OFF,
    generadoEn: '2026-11-19T15:00:00Z',
    filtros: {
      desde: filters.desde,
      hasta: filters.hasta,
      producto: filters.producto ?? null,
      estado: filters.estado ?? null,
    },
    indicadores: {
      polizas: {
        emitidasEnPeriodo: 3,
        cartera: 4,
        porEstado: { programada: 0, vigente: 3, vencida: 0, cancelada: 1 },
      },
      primas: { confirmadas: 3, totales: [{ moneda: 'COP', monto: '255000.00' }] },
      siniestros: {
        reportados: 2,
        porEstado: { reportado: 1, aprobado: 1 },
        porTipo: { parametrico: 1, sin_tipo: 1 },
      },
      pagos: {
        registrados: 1,
        porEstado: { pendiente: 0, confirmado: 1, rechazado: 0 },
        totales: [{ estado: 'confirmado', moneda: 'COP', monto: '250000.00' }],
      },
    },
    porProducto: [
      {
        producto: 'automotive',
        polizasEmitidas: 2,
        cartera: 3,
        primasConfirmadas: 2,
        primas: [{ moneda: 'COP', monto: '170000.00' }],
        siniestrosReportados: 1,
        pagosRegistrados: 0,
      },
    ],
    inconsistencias: {
      siniestrosSinPoliza: 0,
      polizasSinPrima: 1,
      primasConProductoDistinto: 0,
      pagosSinSiniestro: 0,
    },
    fuentes: [
      { servicio: 'polizas', registros: 4, huella: '1'.repeat(64) },
      { servicio: 'primas', registros: 3, huella: '2'.repeat(64) },
      { servicio: 'siniestros', registros: 3, huella: '3'.repeat(64) },
    ],
    huella: REPORT_FINGERPRINT,
    ...overrides,
  };
}

export const EMPTY_INDICATORS = {
  polizas: {
    emitidasEnPeriodo: 0,
    cartera: 0,
    porEstado: { programada: 0, vigente: 0, vencida: 0, cancelada: 0 },
  },
  primas: { confirmadas: 0, totales: [] },
  siniestros: { reportados: 0, porEstado: {}, porTipo: {} },
  pagos: { registrados: 0, porEstado: { pendiente: 0, confirmado: 0, rechazado: 0 }, totales: [] },
};
