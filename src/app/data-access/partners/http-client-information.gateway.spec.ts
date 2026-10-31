import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ClientInformationRequest,
  HttpClientInformationGateway,
} from './http-client-information.gateway';

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
});
