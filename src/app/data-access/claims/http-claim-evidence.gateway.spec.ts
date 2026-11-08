import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { EvidenceUploadBody } from '../../core/claims/claim-evidence.models';
import { HttpClaimEvidenceGateway } from './http-claim-evidence.gateway';

const claimId = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const base = `${environment.apiBaseUrl}/v1/siniestros`;
const body: EvidenceUploadBody = { mimeType: 'image/png', tamanoBytes: 4, sha256: 'a'.repeat(64) };
const receipt = {
  ...body,
  id: uploadId,
  siniestroId: claimId,
  estado: 'pendiente',
  offset: 0,
  evidenciaId: null,
};
const policy = {
  maxCantidad: 2,
  maxChunkBytes: 2,
  maxVideoSeconds: 5,
  formatos: [{ mimeType: 'image/png', maxBytes: 4 }],
};

describe('HttpClaimEvidenceGateway', () => {
  let gateway: HttpClaimEvidenceGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { user: signal(TEST_USER), getAccessToken: () => of('test-token') },
        },
      ],
    });
    gateway = TestBed.inject(HttpClaimEvidenceGateway);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consulta política dinámica por el interceptor existente', async () => {
    const result = firstValueFrom(gateway.policy());
    const request = http.expectOne(`${base}/configuracion-evidencias`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush(policy);
    await expect(result).resolves.toEqual(policy);
  });

  it.each([
    {},
    { ...policy, maxCantidad: 0 },
    { ...policy, maxChunkBytes: 1048577 },
    { ...policy, maxVideoSeconds: 0 },
    { ...policy, formatos: [] },
    { ...policy, formatos: [{ mimeType: 'text/html', maxBytes: 100 }] },
    { ...policy, formatos: [{ mimeType: 'image/png', maxBytes: -1 }] },
    { ...policy, formatos: [policy.formatos[0], policy.formatos[0]] },
  ])('rechaza política inválida sin límites inventados %#', async (response) => {
    const result = firstValueFrom(gateway.policy());
    const assertion = expect(result).rejects.toThrow('Invalid claim evidence response.');
    http.expectOne(`${base}/configuracion-evidencias`).flush(response);
    await assertion;
  });

  it('envía JSON y la clave estable, luego bytes sin multipart ni Content-Length manual', async () => {
    const result = firstValueFrom(gateway.start(claimId, body, uploadId));
    const start = http.expectOne(`${base}/${claimId}/cargas`);
    expect(start.request.body).toEqual(body);
    expect(start.request.headers.get('Idempotency-Key')).toBe(uploadId);
    start.flush(receipt);
    await result;
    const bytes = new Blob([new Uint8Array([1, 2])]);
    const chunk = firstValueFrom(gateway.chunk(claimId, uploadId, body, 0, bytes));
    const request = http.expectOne(`${base}/${claimId}/cargas/${uploadId}/contenido`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBe(bytes);
    expect(request.request.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(request.request.headers.get('Upload-Offset')).toBe('0');
    expect(request.request.headers.has('Content-Length')).toBe(false);
    request.flush({ ...receipt, offset: 2 });
    await expect(chunk).resolves.toMatchObject({ estado: 'pendiente', offset: 2 });
  });

  it.each([
    {},
    { ...receipt, siniestroId: evidenceId },
    { ...receipt, id: evidenceId },
    { ...receipt, estado: 'recibida' },
    { ...receipt, offset: -1 },
    { ...receipt, offset: 5 },
    { ...receipt, sha256: 'b'.repeat(64) },
    { ...receipt, tamanoBytes: 3 },
    { ...receipt, mimeType: 'application/pdf' },
    { ...receipt, evidenciaId: evidenceId },
    { ...receipt, estado: 'confirmada', offset: 4 },
    { ...receipt, estado: 'confirmada', offset: 0, evidenciaId: evidenceId },
  ])('rechaza una carga ajena o acuse incoherente %#', async (response) => {
    const result = firstValueFrom(gateway.load(claimId, uploadId, body));
    const assertion = expect(result).rejects.toThrow('Invalid claim evidence response.');
    http.expectOne(`${base}/${claimId}/cargas/${uploadId}`).flush(response);
    await assertion;
  });

  it('acepta confirmación autoritativa solo con evidencia y tamaño completo', async () => {
    const result = firstValueFrom(gateway.confirm(claimId, uploadId, body));
    const request = http.expectOne(`${base}/${claimId}/cargas/${uploadId}/confirmacion`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ ...receipt, offset: 4, estado: 'confirmada', evidenciaId: evidenceId });
    await expect(result).resolves.toMatchObject({ estado: 'confirmada', evidenciaId: evidenceId });
  });

  it.each([403, 404, 409, 422, 503])('preserva el error identificable HTTP %s', async (status) => {
    const result = firstValueFrom(gateway.start(claimId, body, uploadId));
    const assertion = expect(result).rejects.toMatchObject({
      status,
      error: { code: 'error_del_servicio' },
    });
    http
      .expectOne(`${base}/${claimId}/cargas`)
      .flush({ code: 'error_del_servicio' }, { status, statusText: 'Error' });
    await assertion;
  });

  it('rechaza metadatos ajenos y no genera acceso público al archivo', async () => {
    const result = firstValueFrom(gateway.list(claimId));
    const assertion = expect(result).rejects.toThrow('Invalid claim evidence response.');
    http.expectOne(`${base}/${claimId}/evidencias`).flush({
      evidencias: [
        { ...body, id: evidenceId, siniestroId: uploadId, creadaEn: '2026-11-08T10:00:00Z' },
      ],
    });
    await assertion;
  });

  it('descarga blob privado autenticado y valida tamaño y MIME', async () => {
    const evidence = {
      ...body,
      id: evidenceId,
      siniestroId: claimId,
      creadaEn: '2026-11-08T10:00:00Z',
    };
    const result = firstValueFrom(gateway.content(claimId, evidence));
    const request = http.expectOne(`${base}/${claimId}/evidencias/${evidenceId}/contenido`);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));
    await expect(result).resolves.toMatchObject({ size: 4, type: 'image/png' });
  });

  it('rechaza bytes descargados diferentes a los metadatos', async () => {
    const result = firstValueFrom(
      gateway.content(claimId, {
        ...body,
        id: evidenceId,
        siniestroId: claimId,
        creadaEn: '2026-11-08T10:00:00Z',
      }),
    );
    const assertion = expect(result).rejects.toThrow('Invalid claim evidence response.');
    http
      .expectOne(`${base}/${claimId}/evidencias/${evidenceId}/contenido`)
      .flush(new Blob(['html'], { type: 'text/html' }));
    await assertion;
  });
});
