import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ClientInformationRequest,
  ClientInformationReviewRequired,
  clientInformationStatusMissing,
  HttpClientInformationGateway,
} from './http-client-information.gateway';
import contract from '../advisor-exceptions/testing/exception-contract-real.json';

describe('HttpClientInformationGateway', () => {
  let gateway: HttpClientInformationGateway;
  let http: HttpTestingController;
  const request: ClientInformationRequest = {
    operationId: '11111111-1111-4111-8111-111111111111',
    socioId: 'BANCO-001',
    clienteId: '22222222-2222-4222-8222-222222222222',
    productoId: 'mortgage-life',
    finalidad: 'cotizacion',
    datosSolicitados: ['indicador_riesgo'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpClientInformationGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends stable operation context and parses minimized data', async () => {
    const result = firstValueFrom(gateway.consult(request));
    const pending = http.expectOne(
      `${environment.apiBaseUrl}/v1/socios/consultas-informacion-cliente`,
    );
    expect(pending.request.method).toBe('POST');
    expect(pending.request.headers.get('Idempotency-Key')).toBe(request.operationId);
    expect(pending.request.headers.get('API-Version')).toBe('1');
    expect(pending.request.body).toEqual(request);
    pending.flush({
      operationId: request.operationId,
      socioId: request.socioId,
      actorId: '33333333-3333-4333-8333-333333333333',
      clienteId: request.clienteId,
      productoId: request.productoId,
      finalidad: 'cotizacion',
      estado: 'completada',
      consentimientoId: '44444444-4444-4444-8444-444444444444',
      consentimientoVersion: 2,
      datos: { indicadorRiesgo: '0.50' },
      evidenciaFuentes: [
        {
          fuente: 'open_finance',
          version: 'mock-1',
          consultadaEn: '2026-10-24T20:00:00Z',
          simulada: true,
        },
      ],
      consultadaEn: '2026-10-24T20:00:00Z',
    });

    await expect(result).resolves.toMatchObject({
      estado: 'completada',
      datos: { indicadorRiesgo: '0.50' },
    });
  });

  it('rejects a response associated with another operation', async () => {
    const result = firstValueFrom(gateway.consult(request));
    http.expectOne(`${environment.apiBaseUrl}/v1/socios/consultas-informacion-cliente`).flush({
      operationId: crypto.randomUUID(),
      socioId: request.socioId,
      clienteId: request.clienteId,
      productoId: request.productoId,
      finalidad: 'cotizacion',
      estado: 'completada',
      consentimientoId: crypto.randomUUID(),
      consentimientoVersion: 1,
      datos: {},
      evidenciaFuentes: [],
      consultadaEn: '2026-10-24T20:00:00Z',
    });

    await expect(result).rejects.toThrow('Invalid client information response.');
  });

  it('accepts the resolved client UUID when searching by document', async () => {
    const documentRequest: ClientInformationRequest = {
      operationId: request.operationId,
      socioId: request.socioId,
      tipoDocumento: 'cc',
      numeroDocumento: '1012345678',
      productoId: request.productoId,
      finalidad: 'cotizacion',
      datosSolicitados: request.datosSolicitados,
    };
    const result = firstValueFrom(gateway.consult(documentRequest));
    const pending = http.expectOne(
      `${environment.apiBaseUrl}/v1/socios/consultas-informacion-cliente`,
    );
    expect(pending.request.body).toEqual(documentRequest);
    pending.flush({
      operationId: documentRequest.operationId,
      socioId: documentRequest.socioId,
      actorId: '33333333-3333-4333-8333-333333333333',
      clienteId: '22222222-2222-4222-8222-222222222222',
      productoId: documentRequest.productoId,
      finalidad: 'cotizacion',
      estado: 'completada',
      consentimientoId: '44444444-4444-4444-8444-444444444444',
      consentimientoVersion: 2,
      datos: { indicadorRiesgo: '0.50' },
      evidenciaFuentes: [],
      consultadaEn: '2026-10-24T20:00:00Z',
    });

    await expect(result).resolves.toMatchObject({
      clienteId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('recovers a consultation without repeating the POST', async () => {
    const result = firstValueFrom(gateway.load(request.operationId, request.socioId));
    const pending = http.expectOne(
      `${environment.apiBaseUrl}/v1/socios/consultas-informacion-cliente/${request.operationId}?socioId=BANCO-001`,
    );
    expect(pending.request.method).toBe('GET');
    expect(pending.request.headers.get('API-Version')).toBe('1');
    pending.flush({
      operationId: request.operationId,
      socioId: request.socioId,
      actorId: '33333333-3333-4333-8333-333333333333',
      clienteId: request.clienteId,
      productoId: request.productoId,
      finalidad: 'cotizacion',
      estado: 'completada',
      consentimientoId: '44444444-4444-4444-8444-444444444444',
      consentimientoVersion: 2,
      datos: { indicadorRiesgo: '0.50' },
      evidenciaFuentes: [],
      consultadaEn: '2026-10-24T20:00:00Z',
    });

    await expect(result).resolves.toMatchObject({ operationId: request.operationId });
  });

  it.each(contract.cases)(
    'WEB-F6 valida la proyección real $requester.aplicacion.estado sin consultar datos',
    async ({ requester }) => {
      const result = firstValueFrom(gateway.loadStatus(requester.operationId, requester.socioId));
      const pending = http.expectOne(
        (pending) =>
          pending.url.endsWith(`/${requester.operationId}/estado`) &&
          pending.params.get('socioId') === requester.socioId,
      );
      expect(pending.request.method).toBe('GET');
      expect(pending.request.headers.get('API-Version')).toBe('1');
      pending.flush(requester);
      await expect(result).resolves.toEqual(requester);
    },
  );

  it('WEB-F6 conserva solo la operación validada del 503 revisable sin convertirla en resultado', async () => {
    const { blockedProblem } = contract.cases[0];
    const input: ClientInformationRequest = {
      ...request,
      operationId: blockedProblem.operacion.operationId,
      socioId: blockedProblem.operacion.socioId,
      clienteId: blockedProblem.operacion.clienteId,
    };
    const result = firstValueFrom(gateway.consult(input));
    const assertion = expect(result).rejects.toMatchObject({
      name: 'ClientInformationReviewRequired',
      review: blockedProblem.operacion,
    });
    http
      .expectOne((pending) => pending.url.endsWith('/consultas-informacion-cliente'))
      .flush(blockedProblem, {
        status: 503,
        statusText: 'Unavailable',
        headers: { 'Content-Type': 'application/problem+json' },
      });
    await assertion;
  });

  it.each([
    { code: 'servicio_no_disponible' },
    { operacion: { ...contract.cases[0].blockedProblem.operacion, socioId: 'OTRO-SOCIO' } },
    {
      operacion: {
        ...contract.cases[0].blockedProblem.operacion,
        operationId: crypto.randomUUID(),
      },
    },
    { operacion: { ...contract.cases[0].blockedProblem.operacion, datos: { saldo: '1000' } } },
    { operacion: { ...contract.cases[0].blockedProblem.operacion, aplicacion: null } },
  ])(
    'WEB-F6 no promueve un 503 genérico o una operación incoherente a revisión %#',
    async (changes) => {
      const { blockedProblem } = contract.cases[0];
      const result = firstValueFrom(
        gateway.consult({
          ...request,
          operationId: blockedProblem.operacion.operationId,
          socioId: blockedProblem.operacion.socioId,
          clienteId: blockedProblem.operacion.clienteId,
        }),
      ).catch((error: unknown) => error);
      http
        .expectOne((pending) => pending.url.endsWith('/consultas-informacion-cliente'))
        .flush(
          { ...blockedProblem, ...changes },
          {
            status: 503,
            statusText: 'Unavailable',
            headers: { 'Content-Type': 'application/problem+json' },
          },
        );
      const error = await result;
      expect(error).toBeInstanceOf('code' in changes ? HttpErrorResponse : Error);
      expect(error).not.toBeInstanceOf(ClientInformationReviewRequired);
    },
  );

  it.each([
    { acuseId: null },
    { intentos: 0 },
    { estado: 'pendiente' },
    { datos: { saldo: '1000' } },
  ])('WEB-F6 rechaza ACK o aplicación terminal incoherente %#', async (changes) => {
    const body = contract.cases[0].requester;
    const result = firstValueFrom(gateway.loadStatus(body.operationId, body.socioId));
    const assertion = expect(result).rejects.toThrow('Invalid client information review.');
    http
      .expectOne((pending) => pending.url.endsWith('/estado'))
      .flush({ ...body, aplicacion: { ...body.aplicacion, ...changes } });
    await assertion;
  });

  it('WEB-F6 no cierra el catálogo de códigos de aplicación bloqueada', async () => {
    const body = contract.cases[2].requester;
    const updated = {
      ...body,
      aplicacion: { ...body.aplicacion, codigo: 'causa_nueva_del_servicio' },
    };
    const result = firstValueFrom(gateway.loadStatus(body.operationId, body.socioId));
    http.expectOne((pending) => pending.url.endsWith('/estado')).flush(updated);
    await expect(result).resolves.toEqual(updated);
  });

  it.each([401, 403, 503, 404])(
    'WEB-F6 solo reconoce el 404 contractual de consulta no vinculada: %s',
    (status) => {
      const problem = {
        type: 'https://api.solventa.co/problems/consulta_no_encontrada',
        title: 'Consulta no encontrada',
        detail: 'No existe operación vinculada.',
        code: 'consulta_no_encontrada',
        status,
        correlationId: '66666666-6666-4666-8666-666666666666',
      };
      const error = new HttpErrorResponse({
        status,
        error: problem,
        headers: new HttpHeaders({ 'Content-Type': 'application/problem+json' }),
      });
      expect(clientInformationStatusMissing(error)).toBe(status === 404);
    },
  );
});
