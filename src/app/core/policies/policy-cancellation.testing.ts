/** BFF web cdc1f849: test_policy_cancellations_api.py, con datos sinteticos. */
export const CANCELLATION_POLICY_ID = '6a1d7e3c-90b2-4f3f-8c2e-1b6f0e2d4a55';
export const SETTLEMENT_HASH = 'c'.repeat(64);
export const SETTLEMENT_RESPONSE = {
  fechaEfectiva: '2026-11-21',
  finCobertura: '2026-11-21',
  coberturasFinalizadas: [{ codigo: 'fallecimiento', nombre: 'Fallecimiento' }],
  periodoActual: { inicio: '2026-11-11', fin: '2026-12-11' },
  periodosAnulados: [
    { inicio: '2026-12-12', fin: '2027-01-11', prima: { monto: '25000', moneda: 'COP' } },
  ],
  primaMensual: { monto: '25000', moneda: 'COP' },
  diasPeriodo: 31,
  diasNoUsados: 20,
  devolucionProporcional: { monto: '16129', moneda: 'COP' },
  devolucionPeriodosAnulados: { monto: '25000', moneda: 'COP' },
  devolucion: { monto: '41129', moneda: 'COP' },
  valorPendiente: { monto: '0', moneda: 'COP' },
  reglaVersion: 'academica-cancelacion-v1',
  liquidacionHash: SETTLEMENT_HASH,
};
export const CANCELLATION_RESULT_RESPONSE = {
  id: '8c3f9a5e-b2d4-4b51-8e4a-3d8b2a4f6c77',
  polizaId: CANCELLATION_POLICY_ID,
  estado: 'cancelada',
  motivoCancelacion: 'costo',
  fechaEfectiva: '2026-11-21',
  liquidacion: SETTLEMENT_RESPONSE,
  confirmadaEn: '2026-11-21T15:00:00Z',
  simulada: true,
};
export const CANCELLATION_STATE_RESPONSE = {
  polizaId: CANCELLATION_POLICY_ID,
  tipo: 'life',
  estado: 'activa',
  vigencia: { inicio: '2026-11-11', fin: '2027-01-11' },
  cancelable: true,
  motivo: null,
  liquidacion: SETTLEMENT_RESPONSE,
  cancelacion: null,
};
export const CANCELLED_STATE_RESPONSE = {
  ...CANCELLATION_STATE_RESPONSE,
  estado: 'cancelada',
  cancelable: false,
  motivo: 'poliza_cancelada',
  liquidacion: null,
  cancelacion: CANCELLATION_RESULT_RESPONSE,
};
