import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpAdvisorExceptionsGateway } from './http-advisor-exceptions.gateway';

describe('HttpAdvisorExceptionsGateway', () => {
  let gateway: HttpAdvisorExceptionsGateway;
  let http: HttpTestingController;
  const socioId = 'BANCO-001';
  const exceptionId = 'exception-123';
  const exception = {
    excepcionId: exceptionId,
    operationId: 'operation-123',
    socioId,
    clienteId: 'customer-123',
    codigo: 'fuente_no_disponible',
    motivoBloqueo: 'La fuente financiera no está disponible.',
    alcance: 'open_finance',
    finalidad: 'cotizacion',
    datos: ['indicador_riesgo'],
    consentimiento: {
      id: 'consent-123',
      version: 3,
      estado: 'autorizado',
      fuentes: ['fuente-a'],
      datos: ['indicador_riesgo'],
      finalidad: 'cotizacion',
      vigenteHasta: '2027-01-01T00:00:00Z',
    },
    estado: 'pendiente',
    estadoAnterior: 'bloqueada',
    creadoEn: '2026-10-20T12:00:00Z',
    correlationId: 'correlation-123',
    trazabilidad: {
      estadoAnterior: 'bloqueada',
      estadoActual: 'pendiente',
      alcance: 'open_finance',
      creadoEn: '2026-10-20T12:00:00Z',
      correlationId: 'correlation-123',
    },
  };
  const baseUrl = `${environment.apiBaseUrl}/v1/asesor/excepciones-open-finance`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpAdvisorExceptionsGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpAdvisorExceptionsGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta solo la bandeja del socio autorizado y valida el contrato pendiente', async () => {
    const result = firstValueFrom(gateway.list(socioId));
    const request = http.expectOne(
      (pending) => pending.url === baseUrl && pending.params.get('socioId') === socioId,
    );
    expect(request.request.method).toBe('GET');
    request.flush({ excepciones: [exception] });
    await expect(result).resolves.toEqual([exception]);
  });

  it('rechaza respuestas de bandeja de otro socio o con estado no pendiente', async () => {
    for (const invalid of [
      { ...exception, socioId: 'OTRO-SOCIO' },
      { ...exception, estado: 'aprobada' },
    ]) {
      const result = firstValueFrom(gateway.list(socioId));
      const assertion = expect(result).rejects.toMatchObject({ code: 'respuesta_invalida' });
      http
        .expectOne(
          (pending) => pending.url === baseUrl && pending.params.get('socioId') === socioId,
        )
        .flush({ excepciones: [invalid] });
      await assertion;
    }
  });

  it('consulta el detalle con socioId y valida motivoBloqueo, estadoAnterior y trazabilidad', async () => {
    const result = firstValueFrom(gateway.get(exceptionId, socioId));
    const request = http.expectOne(
      (pending) =>
        pending.url === `${baseUrl}/${exceptionId}` && pending.params.get('socioId') === socioId,
    );
    expect(request.request.method).toBe('GET');
    request.flush(exception);
    await expect(result).resolves.toEqual(exception);
  });

  it('envía únicamente decision y motivo y acepta resolución solo con HTTP 200 válido', async () => {
    const motivo = 'Aprobar tras revisar el caso.';
    const result = firstValueFrom(gateway.resolve(exceptionId, socioId, 'aprobar', motivo));
    const request = http.expectOne(
      (pending) =>
        pending.url === `${baseUrl}/${exceptionId}/resolver` &&
        pending.params.get('socioId') === socioId,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ decision: 'aprobar', motivo });
    const resolved = {
      ...exception,
      estado: 'aprobada',
      trazabilidad: { ...exception.trazabilidad, estadoActual: 'aprobada' },
      decision: 'aprobar',
      actorId: 'advisor-123',
      resueltaEn: '2026-10-21T12:00:00Z',
      motivo,
    };
    request.flush(resolved, { status: 200, statusText: 'OK' });
    await expect(result).resolves.toEqual(resolved);
  });

  it.each([
    [401, 'sesion_invalida', 'sesion_invalida'],
    [403, 'socio_no_autorizado', 'socio_no_autorizado'],
    [403, 'alcance_insuficiente', 'alcance_insuficiente'],
    [403, 'consentimiento_ausente', 'consentimiento_ausente'],
    [403, 'consentimiento_no_vigente', 'consentimiento_no_vigente'],
    [404, 'excepcion_no_encontrada', 'excepcion_no_encontrada'],
    [409, 'excepcion_ya_resuelta', 'excepcion_ya_resuelta'],
    [400, 'solicitud_invalida', 'solicitud_invalida'],
    [503, 'servicio_no_disponible', 'servicio_no_disponible'],
  ])('mantiene la causa HTTP %s/%s como %s', async (status, backendCode, code) => {
    const result = firstValueFrom(gateway.get(exceptionId, socioId));
    const assertion = expect(result).rejects.toMatchObject({ code });
    http
      .expectOne(
        (pending) =>
          pending.url === `${baseUrl}/${exceptionId}` && pending.params.get('socioId') === socioId,
      )
      .flush({ code: backendCode }, { status, statusText: 'Error' });
    await assertion;
  });

  it.each([
    { ...exception, motivoBloqueo: '' },
    { ...exception, estadoAnterior: undefined },
    { ...exception, trazabilidad: { ...exception.trazabilidad, estadoAnterior: 'otro' } },
    { ...exception, datos: ['indicador_riesgo', 'saldo'] },
    { ...exception, finalidad: 'evaluacion' },
  ])('rechaza un detalle que no cumple el contrato exacto', async (body) => {
    const result = firstValueFrom(gateway.get(exceptionId, socioId));
    const assertion = expect(result).rejects.toMatchObject({ code: 'respuesta_invalida' });
    http
      .expectOne(
        (pending) =>
          pending.url === `${baseUrl}/${exceptionId}` && pending.params.get('socioId') === socioId,
      )
      .flush(body);
    await assertion;
  });

  it('no presenta como resuelta una respuesta que no sea HTTP 200', async () => {
    const result = firstValueFrom(
      gateway.resolve(exceptionId, socioId, 'rechazar', 'Rechazo justificado.'),
    );
    const assertion = expect(result).rejects.toMatchObject({ code: 'respuesta_invalida' });
    http
      .expectOne(
        (pending) =>
          pending.url === `${baseUrl}/${exceptionId}/resolver` &&
          pending.params.get('socioId') === socioId,
      )
      .flush(
        {
          ...exception,
          estado: 'rechazada',
          trazabilidad: { ...exception.trazabilidad, estadoActual: 'rechazada' },
          decision: 'rechazar',
          actorId: 'advisor-123',
          resueltaEn: '2026-10-21T12:00:00Z',
          motivo: 'Rechazo justificado.',
        },
        { status: 201, statusText: 'Created' },
      );
    await assertion;
  });
});
