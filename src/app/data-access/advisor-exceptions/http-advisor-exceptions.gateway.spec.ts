import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpAdvisorExceptionsGateway } from './http-advisor-exceptions.gateway';
import contract from './testing/exception-contract-real.json';

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
    decision: null,
    actorId: null,
    resueltaEn: null,
    motivo: null,
    proceso: null,
    aplicacion: null,
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

  it.each(contract.cases)(
    'WEB-F6 acepta el caso real d0 y sus dos representaciones UTC: $applied.aplicacion.estado',
    async ({ pending, applied }) => {
      for (const body of [pending, applied]) {
        const result = firstValueFrom(gateway.get(body.excepcionId, body.socioId));
        http
          .expectOne(
            (request) =>
              request.url === `${baseUrl}/${body.excepcionId}` &&
              request.params.get('socioId') === body.socioId,
          )
          .flush(body);
        await expect(result).resolves.toEqual(body);
      }
    },
  );

  it.each(contract.cases)(
    'WEB-F6 recupera decisiones mediante filtro de aplicación $applied.aplicacion.estado',
    async ({ applied }) => {
      const state = applied.aplicacion.estado;
      if (state !== 'completada' && state !== 'bloqueada' && state !== 'detenida')
        throw new Error('Invalid captured state');
      const result = firstValueFrom(gateway.list(applied.socioId, state));
      http
        .expectOne(
          (request) =>
            request.url === baseUrl &&
            request.params.get('socioId') === applied.socioId &&
            request.params.get('estadoAplicacion') === state,
        )
        .flush({ excepciones: [applied] });
      await expect(result).resolves.toEqual([applied]);
    },
  );

  it('WEB-F6 rechaza filas ajenas al filtro de aplicación', async () => {
    const { applied } = contract.cases[0];
    const result = firstValueFrom(gateway.list(applied.socioId, 'pendiente'));
    const assertion = expect(result).rejects.toMatchObject({ code: 'respuesta_invalida' });
    http.expectOne((request) => request.url === baseUrl).flush({ excepciones: [applied] });
    await assertion;
  });

  it.each(contract.cases)(
    'WEB-F6 aplicar conserva el caso y ACK real $applied.aplicacion.estado y solo envía {}',
    async ({ applied }) => {
      const result = firstValueFrom(gateway.apply(applied.excepcionId, applied.socioId));
      const request = http.expectOne(
        (request) =>
          request.url === `${baseUrl}/${applied.excepcionId}/aplicar` &&
          request.params.get('socioId') === applied.socioId,
      );
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({});
      request.flush(applied);
      await expect(result).resolves.toEqual(applied);
    },
  );

  it('WEB-F6 recupera la decisión histórica sin inventar proceso ni aplicación', async () => {
    const { applied } = contract.cases[0];
    const legacy = { ...applied, proceso: null, aplicacion: null };
    const result = firstValueFrom(gateway.get(applied.excepcionId, applied.socioId));
    http.expectOne((request) => request.url === `${baseUrl}/${applied.excepcionId}`).flush(legacy);
    await expect(result).resolves.toEqual(legacy);
  });

  it('WEB-F6-proceso acepta datosSolicitados como string[] según el contrato d0', async () => {
    const pending = contract.cases[0].pending;
    const body = { ...pending, proceso: { ...pending.proceso, datosSolicitados: [] } };
    const result = firstValueFrom(gateway.get(body.excepcionId, body.socioId));
    const assertion = expect(result).resolves.toEqual(body);
    http.expectOne((request) => request.url === `${baseUrl}/${body.excepcionId}`).flush(body);
    await assertion;
  });

  it('WEB-F6-proceso rechaza campos adicionales fuera del DTO del proceso', async () => {
    const pending = contract.cases[0].pending;
    const body = { ...pending, proceso: { ...pending.proceso, datosFinancieros: {} } };
    const result = firstValueFrom(gateway.get(body.excepcionId, body.socioId));
    const assertion = expect(result).rejects.toMatchObject({ code: 'respuesta_invalida' });
    http.expectOne((request) => request.url === `${baseUrl}/${body.excepcionId}`).flush(body);
    await assertion;
  });

  it.each([
    { decision: undefined },
    { actorId: undefined },
    { proceso: undefined },
    { aplicacion: undefined },
    { aplicacion: null },
    { aplicacion: { ...contract.cases[0].pending.aplicacion, acuseId: crypto.randomUUID() } },
    { aplicacion: { ...contract.cases[0].applied.aplicacion } },
    {
      trazabilidad: {
        ...contract.cases[0].pending.trazabilidad,
        creadoEn: '2026-11-01T23:00:18.889526Z',
      },
    },
  ])('WEB-F6 rechaza metadatos ausentes o incoherentes %#', async (changes) => {
    const body = { ...contract.cases[0].pending, ...changes };
    const result = firstValueFrom(gateway.get(body.excepcionId, body.socioId));
    const assertion = expect(result).rejects.toMatchObject({ code: 'respuesta_invalida' });
    http.expectOne((request) => request.url === `${baseUrl}/${body.excepcionId}`).flush(body);
    await assertion;
  });

  it.each([
    [403, 'actor_no_autorizado'],
    [409, 'decision_pendiente'],
    [409, 'excepcion_sin_operacion'],
    [409, 'conflicto_idempotencia'],
    [400, 'version_no_soportada'],
  ] as const)('WEB-F6 conserva el error de aplicación %s/%s', async (status, code) => {
    const result = firstValueFrom(gateway.apply(exceptionId, socioId));
    const assertion = expect(result).rejects.toMatchObject({ code });
    http
      .expectOne((request) => request.url === `${baseUrl}/${exceptionId}/aplicar`)
      .flush({ code }, { status, statusText: 'Error' });
    await assertion;
  });
});
