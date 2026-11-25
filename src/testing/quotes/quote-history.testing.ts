import { QuoteHistoryEntry } from '../../app/data-access/quotes/http-quote-history.gateway';

export const HISTORY_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
export function historyDto(overrides: Record<string, unknown> = {}) {
  return {
    operationId: '11111111-1111-4111-8111-111111111111',
    socioId: 'BANK-A',
    clienteId: HISTORY_CLIENT_ID,
    solicitudId: 'AQT-2026-123456',
    cotizacionId: '33333333-3333-4333-8333-333333333333',
    productoId: 'mortgage-life',
    estado: 'pendiente',
    creadaEn: '2026-10-11T12:00:00Z',
    actualizadaEn: '2026-10-11T12:00:00Z',
    validaHasta: '2099-01-01T00:00:00Z',
    completadaEn: null,
    rechazadaEn: null,
    estadoSeleccion: {
      solicitudId: 'AQT-2026-123456',
      seleccion: null,
      aceptacion: null,
      estadoOferta: null,
    },
    seleccionRestringida: false,
    pagoEstado: null,
    emisionEstado: null,
    cliente: {
      clienteId: HISTORY_CLIENT_ID,
      nombre: 'Cliente autorizado',
      tipoDocumento: 'cc',
      numeroDocumentoEnmascarado: '******5678',
      consentimientoEstado: 'vigente',
    },
    ...overrides,
  };
}

export function historyEntry(overrides: Partial<QuoteHistoryEntry> = {}): QuoteHistoryEntry {
  return {
    operationId: '11111111-1111-4111-8111-111111111111',
    partnerId: 'BANK-A',
    clientId: HISTORY_CLIENT_ID,
    requestId: 'AQT-2026-123456',
    quoteId: '33333333-3333-4333-8333-333333333333',
    productId: 'automotive',
    status: 'pendiente',
    createdAt: '2026-10-11T12:00:00Z',
    updatedAt: '2026-10-11T12:00:00Z',
    validUntil: '2099-01-01T00:00:00Z',
    completedAt: null,
    rejectedAt: null,
    selectionState: {
      quoteId: 'AQT-2026-123456',
      selection: null,
      acceptance: null,
      offerStatus: null,
    },
    selectionRestricted: false,
    paymentStatus: null,
    emissionStatus: null,
    ...overrides,
  };
}
