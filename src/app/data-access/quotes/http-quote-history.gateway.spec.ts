import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { HISTORY_CLIENT_ID, historyDto } from '../../../testing/quotes/quote-history.testing';
import { HttpQuoteHistoryGateway } from './http-quote-history.gateway';

describe('HttpQuoteHistoryGateway', () => {
  let gateway: HttpQuoteHistoryGateway;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/v1`;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpQuoteHistoryGateway);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads all authorized products, preserving separate quotes for the same client', () => {
    const next = vi.fn();
    gateway.loadPartnerHistory('BANK-A', ['mortgage-life']).subscribe(next);
    const request = http.expectOne(`${base}/socios/solicitudes-cotizacion?socioId=BANK-A`);
    expect(request.request.headers.get('API-Version')).toBe('1');
    expect(request.request.params.has('productoId')).toBe(false);
    request.flush({
      solicitudes: [
        historyDto(),
        historyDto({
          solicitudId: 'AQT-2026-654321',
          cotizacionId: '44444444-4444-4444-8444-444444444444',
          estadoSeleccion: {
            solicitudId: 'AQT-2026-654321',
            seleccion: null,
            aceptacion: null,
            estadoOferta: null,
          },
          creadaEn: '2026-10-12T12:00:00Z',
        }),
      ],
    });
    expect(next.mock.calls[0][0]).toHaveLength(2);
    expect(next.mock.calls[0][0][0].requestId).toBe('AQT-2026-654321');
  });

  it.each([
    { estado: 'pendiente', pagoEstado: 'rechazado' },
    { estado: 'rechazada', rechazadaEn: '2026-11-01T12:00:00Z' },
    { estado: 'vencida', validaHasta: '2000-01-01T00:00:00Z' },
    {
      estado: 'completada',
      pagoEstado: 'confirmado',
      emisionEstado: 'emitida',
      completadaEn: '2026-11-01T12:00:00Z',
      validaHasta: '2000-01-01T00:00:00Z',
    },
  ])(
    'uses authoritative $estado without converting payment errors or terminal expiry',
    (fields) => {
      const next = vi.fn();
      gateway.loadClientHistory(HISTORY_CLIENT_ID).subscribe(next);
      http.expectOne(`${base}/solicitudes-cotizacion`).flush({ solicitudes: [historyDto(fields)] });
      expect(next.mock.calls[0][0][0].status).toBe(fields.estado);
    },
  );

  it('keeps redacted historical rows and removes selection when consent is revoked', () => {
    const next = vi.fn();
    gateway.loadPartnerHistory('BANK-A', ['mortgage-life']).subscribe(next);
    http.expectOne(`${base}/socios/solicitudes-cotizacion?socioId=BANK-A`).flush({
      solicitudes: [
        historyDto({
          seleccionRestringida: true,
          estadoSeleccion: null,
          cliente: {
            clienteId: HISTORY_CLIENT_ID,
            nombre: null,
            tipoDocumento: null,
            numeroDocumentoEnmascarado: null,
            consentimientoEstado: 'revocado',
          },
        }),
      ],
    });
    expect(next.mock.calls[0][0][0].client.nombre).toBeNull();
    expect(next.mock.calls[0][0][0].selectionState).toBeNull();
  });

  it('accepts the nullable partner selection contract without inventing a choice', () => {
    const next = vi.fn();
    gateway.loadPartnerHistory('BANK-A', ['mortgage-life']).subscribe(next);
    http
      .expectOne(`${base}/socios/solicitudes-cotizacion?socioId=BANK-A`)
      .flush({ solicitudes: [historyDto({ estadoSeleccion: null })] });
    expect(next.mock.calls[0][0][0].selectionState).toBeNull();
  });

  it.each([
    { socioId: 'OTHER' },
    { productoId: 'unsupported' },
    { clienteId: 'not-uuid' },
    { estado: 'completada' },
    { estado: 'rechazada' },
    { estado: 'vencida', pagoEstado: 'confirmado' },
    { cliente: { ...historyDto().cliente, numeroDocumentoEnmascarado: '12345678' } },
    { seleccionRestringida: true },
    {
      estadoSeleccion: {
        solicitudId: 'AQT-2026-OTHER1',
        seleccion: null,
        aceptacion: null,
        estadoOferta: null,
      },
    },
  ])('rejects malformed, inconsistent or unauthorized history: %j', (fields) => {
    const error = vi.fn();
    gateway.loadPartnerHistory('BANK-A', ['mortgage-life']).subscribe({ error });
    http
      .expectOne(`${base}/socios/solicitudes-cotizacion?socioId=BANK-A`)
      .flush({ solicitudes: [historyDto(fields)] });
    expect(error).toHaveBeenCalledOnce();
  });

  it('rejects repeated quotation identifiers, not repeated clients', () => {
    const error = vi.fn();
    gateway.loadClientHistory(HISTORY_CLIENT_ID).subscribe({ error });
    http
      .expectOne(`${base}/solicitudes-cotizacion`)
      .flush({ solicitudes: [historyDto(), historyDto()] });
    expect(error).toHaveBeenCalledOnce();
  });

  it('checks own state ownership and request association without personal queries', () => {
    const error = vi.fn();
    gateway
      .loadClientState('AQT-2026-123456', '55555555-5555-4555-8555-555555555555')
      .subscribe({ error });
    http.expectOne(`${base}/solicitudes-cotizacion/AQT-2026-123456/estado`).flush(historyDto());
    expect(error).toHaveBeenCalledOnce();
  });

  it('sends an explicit rejection with the same UUID key and validates its receipt', () => {
    const next = vi.fn();
    const dto = historyDto();
    gateway.reject(dto.solicitudId, dto.cotizacionId, dto.operationId).subscribe(next);
    const request = http.expectOne(`${base}/solicitudes-cotizacion/${dto.solicitudId}/rechazo`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get('Idempotency-Key')).toBe(dto.operationId);
    request.flush({
      solicitudId: dto.solicitudId,
      cotizacionId: dto.cotizacionId,
      estado: 'rechazada',
      rechazadaEn: '2026-11-01T12:00:00Z',
    });
    expect(next.mock.calls[0][0].status).toBe('rechazada');
  });
});
