import { DashboardSnapshot } from './dashboard.models';

export const DASHBOARD_RESPONSE = {
  cotizaciones: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      solicitudId: 'request-001',
      productoId: 'seguro-viaje',
      estado: 'CALCULADA',
      creadaEn: '2026-10-01T12:00:00Z',
      validaHasta: '2026-10-02T12:00:00Z',
      primaEstimada: { monto: '12345.67', moneda: 'COP' },
      seleccion: {
        ofertaId: '20000000-0000-4000-8000-000000000001',
        nombreOferta: 'Oferta seleccionada',
        prima: { monto: '12345.67', moneda: 'COP' },
        periodicidad: 'por_viaje',
        seleccionadaEn: '2026-10-01T12:05:00Z',
      },
    },
  ],
  suscripciones: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      solicitudId: 'request-001',
      cotizacionId: '10000000-0000-4000-8000-000000000001',
      ofertaId: '20000000-0000-4000-8000-000000000001',
      estado: 'aprobada',
      creadaEn: '2026-10-01T12:10:00Z',
      actualizadaEn: '2026-10-01T12:15:00Z',
      saga: { estado: 'pago_confirmado', version: 2, actualizadaEn: '2026-10-01T12:15:00Z' },
    },
  ],
  pagos: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      solicitudId: 'request-001',
      suscripcionId: '30000000-0000-4000-8000-000000000001',
      estado: 'confirmado',
      simulada: true,
      importe: { monto: '12345.67', moneda: 'COP' },
      periodicidad: 'por_viaje',
      confirmadaEn: '2026-10-01T12:15:00Z',
    },
  ],
  polizas: { disponibilidad: 'no_implementado' },
  notificaciones: { disponibilidad: 'no_implementado' },
};

export const EMPTY_DASHBOARD: DashboardSnapshot = {
  quotes: [],
  subscriptions: [],
  payments: [],
  policies: { availability: 'no_implementado' },
  notifications: { availability: 'no_implementado' },
};

export const DASHBOARD_SNAPSHOT: DashboardSnapshot = {
  ...EMPTY_DASHBOARD,
  quotes: [
    {
      id: DASHBOARD_RESPONSE.cotizaciones[0].id,
      requestId: 'request-001',
      productId: 'seguro-viaje',
      status: 'CALCULADA',
      createdAt: '2026-10-01T12:00:00Z',
      validUntil: '2026-10-02T12:00:00Z',
      estimatedPremium: { amount: '12345.67', currency: 'COP' },
      selection: {
        offerId: DASHBOARD_RESPONSE.cotizaciones[0].seleccion.ofertaId,
        offerName: 'Oferta seleccionada',
        premium: { amount: '12345.67', currency: 'COP' },
        periodicity: 'por_viaje',
        selectedAt: '2026-10-01T12:05:00Z',
      },
    },
  ],
  subscriptions: [
    {
      validFrom: null,
      validUntil: null,
      id: DASHBOARD_RESPONSE.suscripciones[0].id,
      requestId: 'request-001',
      quoteId: DASHBOARD_RESPONSE.cotizaciones[0].id,
      offerId: DASHBOARD_RESPONSE.cotizaciones[0].seleccion.ofertaId,
      status: 'aprobada',
      createdAt: '2026-10-01T12:10:00Z',
      updatedAt: '2026-10-01T12:15:00Z',
      saga: { status: 'pago_confirmado', version: 2, updatedAt: '2026-10-01T12:15:00Z' },
    },
  ],
  payments: [
    {
      id: DASHBOARD_RESPONSE.pagos[0].id,
      requestId: 'request-001',
      subscriptionId: DASHBOARD_RESPONSE.suscripciones[0].id,
      status: 'confirmado',
      simulated: true,
      amount: { amount: '12345.67', currency: 'COP' },
      periodicity: 'por_viaje',
      confirmedAt: '2026-10-01T12:15:00Z',
    },
  ],
};
