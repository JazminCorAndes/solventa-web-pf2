import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  partnerEmptySelectionResponse,
  partnerSelectionResponse,
  partnerSnapshotResponse,
} from '../../../testing/partners/partner-offers.testing';
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

  it('consulta los planes del socio sin calcular ni seleccionar implicitamente', () => {
    const operation = partnerResult();
    const received = vi.fn();
    gateway.loadOfferSnapshot(operation).subscribe(received);
    const request = http.expectOne(`${url}/${operationId}/oferta?socioId=BANCO-001`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('API-Version')).toBe('1');
    request.flush(partnerSnapshotResponse(operation));
    expect(received.mock.calls[0][0].ofertas).toHaveLength(3);
    expect(received.mock.calls[0][0]).not.toHaveProperty('riesgo');
    http.expectNone((request) => request.method !== 'GET');
  });

  it('calcula el snapshot solo mediante POST explicito con operacion estable', () => {
    const operation = partnerResult();
    gateway.createOfferSnapshot(operation).subscribe();
    const request = http.expectOne(`${url}/${operationId}/oferta?socioId=BANCO-001`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get('Idempotency-Key')).toBe(operationId);
    request.flush(partnerSnapshotResponse(operation));
  });

  it.each([
    { operationId: customerId },
    { socioId: 'OTRO-SOCIO' },
    { clienteId: quoteId },
    { productoId: 'otra-linea' },
    { solicitudId: 'otra-solicitud' },
    { cotizacionId: customerId },
    { hashContenido: 'invalido' },
    { estado: ['vigente'] },
  ])('rechaza asociaciones o metadata del snapshot invalidas: %j', (change) => {
    const failed = vi.fn();
    gateway.loadOfferSnapshot(partnerResult()).subscribe({ error: failed });
    http.expectOne(`${url}/${operationId}/oferta?socioId=BANCO-001`).flush({
      ...partnerSnapshotResponse(partnerResult()),
      ...change,
    });
    expect(failed).toHaveBeenCalledWith(expect.any(InvalidPartnerQuoteResponse));
  });

  it.each([
    { periodicidad: ['mensual'] },
    { recomendada: 'true' },
    { prima: { monto: 'gratis', moneda: 'COP' } },
    { ofertaId: 'invalid' },
  ])('rechaza campos de plan invalidos sin normalizarlos: %j', (change) => {
    const body = partnerSnapshotResponse(partnerResult());
    const failed = vi.fn();
    gateway.loadOfferSnapshot(partnerResult()).subscribe({ error: failed });
    http.expectOne(`${url}/${operationId}/oferta?socioId=BANCO-001`).flush({
      ...body,
      ofertas: [{ ...body.ofertas[0], ...change }],
    });
    expect(failed).toHaveBeenCalledWith(expect.any(InvalidPartnerQuoteResponse));
  });

  it('rechaza planes duplicados en vez de mostrar opciones ambiguas', () => {
    const body = partnerSnapshotResponse(partnerResult());
    const failed = vi.fn();
    gateway.loadOfferSnapshot(partnerResult()).subscribe({ error: failed });
    http.expectOne(`${url}/${operationId}/oferta?socioId=BANCO-001`).flush({
      ...body,
      ofertas: [body.ofertas[0], body.ofertas[0]],
    });
    expect(failed).toHaveBeenCalledWith(expect.any(InvalidPartnerQuoteResponse));
  });

  it('lee la seleccion persistida sin confundir ausencia con recomendacion', () => {
    const operation = partnerResult();
    const received = vi.fn();
    gateway.loadOfferSelection(operation).subscribe(received);
    const request = http.expectOne(`${url}/${operationId}/seleccion-provisional?socioId=BANCO-001`);
    expect(request.request.method).toBe('GET');
    request.flush(partnerEmptySelectionResponse(operation));
    expect(received).toHaveBeenCalledWith({
      quoteId: operation.solicitudId,
      selection: null,
      acceptance: null,
      offerStatus: null,
    });
  });

  it('guarda UUID del plan, revision esperada y misma clave por intento', () => {
    const operation = partnerResult();
    const offer = partnerSnapshotResponse(operation).ofertas[1];
    const selection = {
      quoteId: operation.solicitudId,
      offerId: offer.ofertaId,
      offerVersion: offer.version,
      expectedRevision: 0,
      idempotencyKey: customerId,
    };
    const received = vi.fn();
    gateway.saveOfferSelection(operation, selection).subscribe(received);
    const request = http.expectOne(`${url}/${operationId}/seleccion-provisional?socioId=BANCO-001`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      ofertaId: offer.ofertaId,
      version: offer.version,
      revisionEsperada: 0,
    });
    expect(request.request.headers.get('Idempotency-Key')).toBe(customerId);
    expect(request.request.headers.get('API-Version')).toBe('1');
    request.flush(partnerSelectionResponse(operation, offer));
    expect(received.mock.calls[0][0].offerId).toBe(offer.ofertaId);
    expect(received.mock.calls[0][0].confirmed).toBe(false);
    http.expectNone((request) => /\/seleccion$|suscripciones|pagos/.test(request.url));
  });

  it.each(['solicitudId', 'ofertaId', 'version', 'revision'])(
    'rechaza un recibo de seleccion incompatible: %s',
    (field) => {
      const operation = partnerResult();
      const offer = partnerSnapshotResponse(operation).ofertas[1];
      const failed = vi.fn();
      gateway
        .saveOfferSelection(operation, {
          quoteId: operation.solicitudId,
          offerId: offer.ofertaId,
          offerVersion: 1,
          expectedRevision: 0,
          idempotencyKey: customerId,
        })
        .subscribe({ error: failed });
      const body = partnerSelectionResponse(operation, offer);
      http.expectOne(`${url}/${operationId}/seleccion-provisional?socioId=BANCO-001`).flush({
        ...body,
        [field]: field === 'version' ? 2 : field === 'revision' ? 0 : 'another-id',
      });
      expect(failed).toHaveBeenCalledWith(expect.any(Error));
    },
  );

  it('rechaza salto de revision en recibo CAS sin tratarlo como replay valido', () => {
    const operation = partnerResult();
    const offer = partnerSnapshotResponse(operation).ofertas[1];
    const failed = vi.fn();
    gateway
      .saveOfferSelection(operation, {
        quoteId: operation.solicitudId,
        offerId: offer.ofertaId,
        offerVersion: offer.version,
        expectedRevision: 0,
        idempotencyKey: customerId,
      })
      .subscribe({ error: failed });
    http
      .expectOne(`${url}/${operationId}/seleccion-provisional?socioId=BANCO-001`)
      .flush(partnerSelectionResponse(operation, offer, 2));
    expect(failed).toHaveBeenCalledWith(expect.any(InvalidPartnerQuoteResponse));
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
