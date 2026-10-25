import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MortgageProfilingRequest } from '../../core/advisor-profiling/advisor-profiling.models';
import { HttpAdvisorProfilingGateway } from './http-advisor-profiling.gateway';

describe('HttpAdvisorProfilingGateway', () => {
  let gateway: HttpAdvisorProfilingGateway;
  let http: HttpTestingController;
  const request: MortgageProfilingRequest = {
    operationId: '11111111-1111-4111-8111-111111111111',
    partnerId: 'SOC-CO-001',
    customer: {
      id: '44444444-4444-4444-8444-444444444444',
      documentType: 'cc',
      documentNumber: '1023456789',
      phone: '+573001234567',
      birthDate: '1985-02-10',
    },
    credit: { reference: 'HIP-001', amount: 310_000_000, termMonths: 240 },
    consent: { id: '11111111-1111-4111-8111-111111111111', version: 2 },
  };
  const receipt = {
    operationId: request.operationId,
    socioId: request.partnerId,
    clienteId: request.customer.id,
    productoId: 'mortgage-life',
    estado: 'completada',
    perfilamientoReferencia: 'PRF-HIP-001',
    solicitudId: 'AQT-2026-ABC123',
    cotizacionId: '33333333-3333-4333-8333-333333333333',
    recibidaEn: '2026-10-20T12:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpAdvisorProfilingGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpAdvisorProfilingGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envía el operationId en el cuerpo y como clave de idempotencia', async () => {
    const result = firstValueFrom(gateway.start(request));
    const pending = http.expectOne(`${environment.apiBaseUrl}/v1/perfilamientos-hipotecarios`);
    expect(pending.request.method).toBe('POST');
    expect(pending.request.body).toEqual({
      operationId: request.operationId,
      socioId: 'SOC-CO-001',
      productoId: 'mortgage-life',
      cliente: {
        clienteId: request.customer.id,
        tipoDocumento: 'cc',
        numeroDocumento: '1023456789',
        telefono: '+573001234567',
        fechaNacimiento: '1985-02-10',
      },
      credito: { referencia: 'HIP-001', monto: 310_000_000, plazoMeses: 240 },
      consentimientoId: '11111111-1111-4111-8111-111111111111',
      consentimientoVersion: 2,
    });
    expect(pending.request.headers.get('Idempotency-Key')).toBe(request.operationId);
    expect(pending.request.headers.get('API-Version')).toBe('1');
    pending.flush(receipt, { status: 201, statusText: 'Created' });
    await expect(result).resolves.toEqual({
      operationId: request.operationId,
      partnerId: request.partnerId,
      customerId: request.customer.id,
      productId: 'mortgage-life',
      profilingReference: 'PRF-HIP-001',
      quoteRequestId: receipt.solicitudId,
      quoteId: receipt.cotizacionId,
      status: 'completed',
      receivedAt: '2026-10-20T12:00:00Z',
    });
  });

  it.each([
    [422, 'datos_incompletos', 'incomplete_data'],
    [403, 'consentimiento_invalido', 'invalid_consent'],
    [403, 'socio_no_autorizado', 'unauthorized_partner'],
    [409, 'idempotencia_conflicto', 'idempotency_conflict'],
    [503, 'servicio_no_disponible', 'service_unavailable'],
    [401, 'sesion_invalida', 'session_expired'],
    [404, 'cliente_no_encontrado', 'customer_not_found'],
    [422, 'perfilamiento_fallido', 'profiling_failed'],
    [409, 'operacion_en_curso', 'operation_in_progress'],
    [409, 'operacion_reintentable', 'operation_retryable'],
    [429, 'cuota_socio_excedida', 'rate_limited'],
    [429, 'socio_ocupado', 'rate_limited'],
    [403, 'sin_permiso', 'unauthorized_partner'],
    [409, 'desconocido', 'unexpected'],
    [500, 'desconocido', 'service_unavailable'],
  ])('convierte HTTP %s/%s en el error identificable %s', async (status, backendCode, code) => {
    const result = firstValueFrom(gateway.start(request));
    const assertion = expect(result).rejects.toMatchObject({ code });
    http
      .expectOne(`${environment.apiBaseUrl}/v1/perfilamientos-hipotecarios`)
      .flush({ code: backendCode }, { status, statusText: 'Error' });
    await assertion;
  });

  it.each([
    null,
    [],
    {},
    { ...receipt, operationId: '22222222-2222-4222-8222-222222222222' },
    { ...receipt, socioId: 'OTRO-SOCIO' },
    { ...receipt, clienteId: '22222222-2222-4222-8222-222222222222' },
    { ...receipt, productoId: 'automotive' },
    { ...receipt, estado: 'procesando' },
    { ...receipt, perfilamientoReferencia: '' },
    { ...receipt, solicitudId: ' ' },
    { ...receipt, cotizacionId: 'no-es-uuid' },
    { ...receipt, recibidaEn: 'ayer' },
    { ...receipt, recibidaEn: '2026-10-20T12:00:00' },
    ...Object.keys(receipt).map((key) =>
      Object.fromEntries(Object.entries(receipt).filter(([field]) => field !== key)),
    ),
  ])('rechaza un recibo incompleto o de otro contexto %#', async (body) => {
    const result = firstValueFrom(gateway.start(request));
    const assertion = expect(result).rejects.toMatchObject({ code: 'invalid_response' });
    http
      .expectOne(`${environment.apiBaseUrl}/v1/perfilamientos-hipotecarios`)
      .flush(body, { status: 201, statusText: 'Created' });
    await assertion;
  });

  it('repite el mismo POST tras perder la respuesta sin inventar un GET de asesor', async () => {
    const endpoint = `${environment.apiBaseUrl}/v1/perfilamientos-hipotecarios`;
    const first = firstValueFrom(gateway.start(request));
    const failed = expect(first).rejects.toMatchObject({ code: 'service_unavailable' });
    const original = http.expectOne(endpoint);
    original.error(new ProgressEvent('error'));
    await failed;
    const retry = firstValueFrom(gateway.start(request));
    const replay = http.expectOne(endpoint);
    expect(replay.request.method).toBe('POST');
    expect(replay.request.body).toEqual(original.request.body);
    expect(replay.request.headers.get('Idempotency-Key')).toBe(request.operationId);
    replay.flush(receipt, { status: 201, statusText: 'Created' });
    const result = await retry;

    const repeated = firstValueFrom(gateway.start(request));
    http.expectOne(endpoint).flush(receipt, { status: 201, statusText: 'Created' });
    await expect(repeated).resolves.toEqual(result);
    http.expectNone((pending) => pending.method === 'GET');
  });
});
