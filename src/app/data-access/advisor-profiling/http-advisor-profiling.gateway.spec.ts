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
      documentType: 'cc',
      documentNumber: '1023456789',
      fullName: 'Valentina Gómez',
      email: 'valentina@example.com',
      phone: '+573001234567',
    },
    credit: { reference: 'HIP-001', amount: 310_000_000, termMonths: 240 },
    consent: { id: '11111111-1111-4111-8111-111111111111', version: 2 },
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
      cliente: {
        tipoDocumento: 'cc',
        numeroDocumento: '1023456789',
        nombreCompleto: 'Valentina Gómez',
        correo: 'valentina@example.com',
        telefono: '+573001234567',
      },
      credito: { referencia: 'HIP-001', monto: 310_000_000, plazoMeses: 240 },
      consentimientoId: '11111111-1111-4111-8111-111111111111',
      consentimientoVersion: 2,
    });
    expect(pending.request.headers.get('Idempotency-Key')).toBe(request.operationId);
    pending.flush({
      operationId: request.operationId,
      perfilamientoReferencia: 'PRF-HIP-001',
      estado: 'procesando',
      recibidaEn: '2026-10-20T12:00:00Z',
    });
    await expect(result).resolves.toEqual({
      operationId: request.operationId,
      profilingReference: 'PRF-HIP-001',
      status: 'processing',
      receivedAt: '2026-10-20T12:00:00Z',
    });
  });

  it.each([
    [422, 'datos_incompletos', 'incomplete_data'],
    [403, 'consentimiento_invalido', 'invalid_consent'],
    [403, 'socio_no_autorizado', 'unauthorized_partner'],
    [409, 'idempotencia_conflicto', 'idempotency_conflict'],
    [503, 'servicio_no_disponible', 'service_unavailable'],
  ])('convierte HTTP %s/%s en el error identificable %s', async (status, backendCode, code) => {
    const result = firstValueFrom(gateway.start(request));
    const assertion = expect(result).rejects.toMatchObject({ code });
    http
      .expectOne(`${environment.apiBaseUrl}/v1/perfilamientos-hipotecarios`)
      .flush({ code: backendCode }, { status, statusText: 'Error' });
    await assertion;
  });
});
