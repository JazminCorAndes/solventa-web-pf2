import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  HttpPartnerQuoteGateway,
  InvalidPartnerQuoteResponse,
  PartnerQuoteRequest,
  PartnerQuoteResult,
  partnerQuoteErrorKey,
  partnerRetryDelay,
} from './http-partner-quote.gateway';

const operationId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const quoteId = '44444444-4444-4444-8444-444444444444';

export function partnerRequest(productId = 'automotive'): PartnerQuoteRequest {
  return {
    operationId,
    socioId: 'BANCO-001',
    productoId: productId,
    datosProducto: { vehiclePlate: 'ABC123' },
    cliente: {
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      numeroDocumento: '1023456789',
    },
  };
}

export function partnerResult(request = partnerRequest()): PartnerQuoteResult {
  return {
    operationId: request.operationId,
    socioId: request.socioId,
    clienteId: customerId,
    productoId: request.productoId,
    estado: 'completada',
    perfilamientoReferencia: 'profile-reference',
    solicitudId: 'AQT-2026-123456',
    cotizacionId: quoteId,
    recibidaEn: '2026-10-23T05:00:00Z',
    oferta: {
      id: '55555555-5555-4555-8555-555555555555',
      version: 1,
      nombre: 'Plan recomendado',
      descripcion: 'Protección para el saldo hipotecario.',
      prima: { monto: '99000.00', moneda: 'COP' },
      periodicidad: 'mensual',
      coberturaPrincipal: 'Saldo hipotecario',
      deducible: 'Sin deducible',
      vigencia: '12 meses',
      coberturas: ['Fallecimiento'],
      condiciones: ['El crédito debe permanecer vigente.'],
      beneficiosAdicionales: [],
      vigenteHasta: '2026-11-23T05:00:00Z',
      explicacion: {
        resumen: 'La prima protege el saldo hipotecario usando el perfil autorizado.',
        factoresDeterminantes: [
          {
            nombre: 'Saldo hipotecario',
            valor: '$180.000.000 COP',
            impacto: 'Define la suma asegurada.',
          },
          {
            nombre: 'Perfil de riesgo autorizado',
            valor: 'Nivel A, score 0.35',
            impacto: 'Ajusta la prima con la regla vigente.',
          },
        ],
      },
      trazabilidad: {
        esquemaDecision: 1,
        hashDecision: 'a'.repeat(64),
        hashContenido: 'b'.repeat(64),
        perfilId: '66666666-6666-4666-8666-666666666666',
        perfilVersion: 1,
        modeloPerfilVersion: 'perfil-v1',
        reglaId: '77777777-7777-4777-8777-777777777777',
        reglaVersion: 'academico-v1',
        fuentes: [
          { nombre: 'open_finance', version: 'v1' },
          { nombre: 'open_data', version: 'v1' },
        ],
      },
    },
  };
}

describe('HttpPartnerQuoteGateway', () => {
  let gateway: HttpPartnerQuoteGateway;
  let http: HttpTestingController;
  const url = `${environment.apiBaseUrl}/v1/socios/solicitudes-cotizacion`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpPartnerQuoteGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it.each([
    'automotive',
    'travel',
    'life',
    'device-protection',
    'parametric',
    'parametric-weather',
    'payment-protection',
    'mortgage-life',
  ])('envia el contrato generico y conserva la operacion para %s', (productId) => {
    const payload = partnerRequest(productId);
    const received = vi.fn();
    gateway.submit(payload).subscribe(received);
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe(operationId);
    expect(request.request.headers.get('API-Version')).toBe('1');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body).not.toHaveProperty('correo');
    expect(received).not.toHaveBeenCalled();
    request.flush(partnerResult(payload));
    expect(received).toHaveBeenCalledWith(partnerResult(payload));
  });

  it('recupera la misma operacion sin reenviar datos personales', () => {
    const received = vi.fn();
    gateway.load(operationId, 'BANCO-001').subscribe(received);
    const request = http.expectOne(`${url}/${operationId}?socioId=BANCO-001`);
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('API-Version')).toBe('1');
    request.flush(partnerResult());
    expect(received).toHaveBeenCalledWith(partnerResult());
  });

  it('busca al cliente sin exponer UUID ni version del consentimiento', () => {
    const received = vi.fn();
    gateway.lookupClient('BANCO-001', 'cc', '1023456789').subscribe(received);
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/socios/clientes/por-documento?socioId=BANCO-001&tipoDocumento=cc&numeroDocumento=1023456789`,
    );
    request.flush({
      nombre: 'Ana Cliente',
      tipoDocumento: 'cc',
      numeroDocumentoEnmascarado: '******6789',
      consentimientoEstado: 'vigente',
    });

    expect(received).toHaveBeenCalledWith({
      nombre: 'Ana Cliente',
      tipoDocumento: 'cc',
      numeroDocumentoEnmascarado: '******6789',
      consentimientoEstado: 'vigente',
    });
  });

  it.each([
    null,
    { ...partnerResult(), operationId: quoteId },
    { ...partnerResult(), socioId: 'OTRO-SOCIO' },
    { ...partnerResult(), productoId: 'life' },
    { ...partnerResult(), estado: 'procesando' },
    { ...partnerResult(), solicitudId: '' },
    { ...partnerResult(), perfilamientoReferencia: null },
    { ...partnerResult(), cotizacionId: 'invalido' },
    { ...partnerResult(), recibidaEn: 'ayer' },
    {
      ...partnerResult(),
      oferta: { ...partnerResult().oferta, condiciones: [] },
    },
    {
      ...partnerResult(),
      oferta: {
        ...partnerResult().oferta,
        explicacion: {
          ...partnerResult().oferta.explicacion,
          factoresDeterminantes: [],
        },
      },
    },
    {
      ...partnerResult(),
      oferta: {
        ...partnerResult().oferta,
        trazabilidad: {
          ...partnerResult().oferta.trazabilidad,
          hashDecision: 'invalido',
        },
      },
    },
  ])('no presenta una respuesta incompatible como exitosa: %j', (body) => {
    const failed = vi.fn();
    gateway.submit(partnerRequest()).subscribe({ error: failed });
    http.expectOne(url).flush(body);
    expect(failed).toHaveBeenCalledWith(expect.any(InvalidPartnerQuoteResponse));
  });

  it.each([
    [400, 'solicitud_invalida', 'invalid'],
    [403, 'socio_no_autorizado', 'forbidden'],
    [409, 'operacion_en_curso', 'processing'],
    [409, 'operacion_reintentable', 'retryable'],
    [409, 'idempotencia_conflicto', 'conflict'],
    [422, 'consentimiento_no_vigente', 'consent'],
    [422, 'identidad_no_coincide', 'identity'],
    [429, 'cuota_socio_excedida', 'quota'],
    [429, 'socio_ocupado', 'quota'],
    [503, 'perfilamiento_no_disponible', 'unavailable'],
  ])('expone error %s %s sin resultado ficticio', (status, code, key) => {
    let failure: unknown;
    gateway.submit(partnerRequest()).subscribe({ error: (error: unknown) => (failure = error) });
    http.expectOne(url).flush({ code }, { status, statusText: 'Error' });
    expect(partnerQuoteErrorKey(failure)).toBe(`partnerQuote.errors.${key}`);
  });

  it('interpreta Retry-After en segundos o fecha y no inventa espera', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-23T05:00:00Z'));
    for (const [header, delay] of [
      ['12', 12],
      ['Fri, 23 Oct 2026 05:01:00 GMT', 60],
      ['invalido', 0],
      ['-1', 0],
    ] as const) {
      expect(
        partnerRetryDelay(
          new HttpErrorResponse({
            status: 429,
            headers: new HttpHeaders({ 'Retry-After': header }),
          }),
        ),
      ).toBe(delay);
    }
    vi.restoreAllMocks();
  });
});
