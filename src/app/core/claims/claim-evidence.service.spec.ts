import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { TEST_USER } from '../auth/auth.testing';
import { ClaimEvidenceService } from './claim-evidence.service';
import { ClaimEvidenceStorage } from './claim-evidence-storage.service';

const claimId = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const base = `${environment.apiBaseUrl}/v1/siniestros`;
const policy = {
  maxCantidad: 2,
  maxChunkBytes: 2,
  maxVideoSeconds: 5,
  formatos: [{ mimeType: 'image/png', maxBytes: 4 }],
};
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function file(bytes = [1, 2, 3, 4], type = 'image/png'): File {
  const result = new File([new Uint8Array(bytes)], 'evidence.png', { type });
  Object.defineProperty(result, 'arrayBuffer', { value: async () => new Uint8Array(bytes).buffer });
  return result;
}

describe('ClaimEvidenceService with HTTP and retry storage', () => {
  let service: ClaimEvidenceService;
  let http: HttpTestingController;
  const user = signal<AuthUser | null>(TEST_USER);
  const receipt = (offset: number, estado = 'pendiente', id: string | null = null) => ({
    ...service.files()[0].body,
    id: uploadId,
    siniestroId: claimId,
    offset,
    estado,
    evidenciaId: id,
  });

  beforeEach(() => {
    sessionStorage.clear();
    user.set(TEST_USER);
    TestBed.configureTestingModule({
      providers: [
        ClaimEvidenceService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
      ],
    });
    service = TestBed.inject(ClaimEvidenceService);
    http = TestBed.inject(HttpTestingController);
    service.connect(claimId);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  async function ready(overrides = {}): Promise<void> {
    const load = service.load();
    http.expectOne(`${base}/configuracion-evidencias`).flush({ ...policy, ...overrides });
    http.expectOne(`${base}/${claimId}/evidencias`).flush({ evidencias: [] });
    await load;
  }

  async function begin(offset = 0): Promise<Promise<void>[]> {
    const result = service.upload(service.files()[0].key);
    http.expectOne(`${base}/${claimId}/cargas`).flush(receipt(offset));
    await tick();
    http.expectOne(`${base}/${claimId}/cargas/${uploadId}`).flush(receipt(offset));
    await tick();
    return [result];
  }

  it('valida política, conserva selección y confirma después del último fragmento', async () => {
    await ready();
    await service.select([file()]);
    const key = service.files()[0].key;
    expect(service.files()[0].body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(TestBed.inject(ClaimEvidenceStorage).read(TEST_USER.id, claimId)[0].key).toBe(key);
    const [result] = await begin();
    const first = http.expectOne(`${base}/${claimId}/cargas/${uploadId}/contenido`);
    expect(first.request.headers.get('Upload-Offset')).toBe('0');
    expect(first.request.body.size).toBe(2);
    first.flush(receipt(2));
    await tick();
    expect(service.files()[0].offset).toBe(2);
    const last = http.expectOne(`${base}/${claimId}/cargas/${uploadId}/contenido`);
    expect(last.request.headers.get('Upload-Offset')).toBe('2');
    last.flush(receipt(4));
    await tick();
    expect(service.files()[0].state).toBe('uploading');
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}/confirmacion`)
      .flush(receipt(4, 'confirmada', evidenceId));
    await tick();
    http.expectOne(`${base}/${claimId}/evidencias`).flush({
      evidencias: [
        {
          ...service.files()[0].body,
          id: evidenceId,
          siniestroId: claimId,
          creadaEn: '2026-11-08T10:00:00Z',
        },
      ],
    });
    await result;
    expect(service.files()[0].state).toBe('confirmed');
    expect(service.evidences()[0].id).toBe(evidenceId);
    expect(TestBed.inject(ClaimEvidenceStorage).read(TEST_USER.id, claimId)).toEqual([]);
    await service.upload(key);
    http.expectNone(`${base}/${claimId}/cargas`);
  });

  it.each([
    [() => file([], 'image/png'), 'size'],
    [() => file([1, 2, 3, 4, 5]), 'size'],
    [() => file([1], 'text/html'), 'format'],
  ])('rechaza archivos fuera de política antes de crear carga %#', async (create, error) => {
    await ready();
    await service.select([create()]);
    expect(service.errorKey()).toBe(`claimEvidence.errors.${error}`);
    expect(service.files()).toEqual([]);
    http.expectNone(`${base}/${claimId}/cargas`);
  });

  it('aplica cantidad dinámica y no reemplaza una selección válida con un lote inválido', async () => {
    await ready({ maxCantidad: 1 });
    await service.select([file()]);
    const key = service.files()[0].key;
    await service.select([file([2])]);
    expect(service.errorKey()).toBe('claimEvidence.errors.count');
    expect(service.files()).toHaveLength(1);
    expect(service.files()[0].key).toBe(key);
    await service.select([file()]);
    expect(service.errorKey()).toBe('claimEvidence.errors.duplicate');
  });

  it('repite exactamente el inicio ante ACK perdido sin crear UUID ni hash nuevos', async () => {
    await ready();
    await service.select([file()]);
    const original = service.files()[0];
    const first = service.upload(original.key);
    const request = http.expectOne(`${base}/${claimId}/cargas`);
    request.error(new ProgressEvent('error'));
    await first;
    expect(service.files()[0].state).toBe('error');
    expect(service.files()[0].file).toBe(original.file);

    const retry = service.upload(original.key);
    const replay = http.expectOne(`${base}/${claimId}/cargas`);
    expect(replay.request.headers.get('Idempotency-Key')).toBe(original.key);
    expect(replay.request.body).toEqual(original.body);
    replay.flush(receipt(4, 'confirmada', evidenceId));
    await tick();
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}`)
      .flush(receipt(4, 'confirmada', evidenceId));
    await tick();
    http.expectOne(`${base}/${claimId}/evidencias`).flush({ evidencias: [] });
    await retry;
    expect(service.files()[0].state).toBe('confirmed');
    http.expectNone(`${base}/${claimId}/cargas/${uploadId}/contenido`);
    http.expectNone(`${base}/${claimId}/cargas/${uploadId}/confirmacion`);
  });

  it('consulta offset tras perder un ACK y reanuda solo desde los bytes confirmados', async () => {
    await ready();
    await service.select([file()]);
    const [first] = await begin();
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}/contenido`)
      .error(new ProgressEvent('error'));
    await tick();
    http.expectOne(`${base}/${claimId}/cargas/${uploadId}`).flush(receipt(2));
    await first;
    expect(service.files()[0].offset).toBe(2);
    expect(service.files()[0].state).toBe('error');
    const [retry] = await begin(2);
    const chunk = http.expectOne(`${base}/${claimId}/cargas/${uploadId}/contenido`);
    expect(chunk.request.headers.get('Upload-Offset')).toBe('2');
    chunk.flush(receipt(4));
    await tick();
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}/confirmacion`)
      .flush(receipt(4, 'confirmada', evidenceId));
    await tick();
    http.expectOne(`${base}/${claimId}/evidencias`).flush({ evidencias: [] });
    await retry;
    expect(service.files()[0].state).toBe('confirmed');
  });

  it('no confirma por HTTP 200 pendiente y reconcilia el reinicio de offset', async () => {
    await ready();
    await service.select([file()]);
    const [result] = await begin(4);
    http.expectOne(`${base}/${claimId}/cargas/${uploadId}/confirmacion`).flush(receipt(4));
    await tick();
    http.expectOne(`${base}/${claimId}/cargas/${uploadId}`).flush(receipt(0));
    await result;
    expect(service.files()[0].state).toBe('error');
    expect(service.files()[0].offset).toBe(0);
    expect(service.evidences()).toEqual([]);
    expect(TestBed.inject(ClaimEvidenceStorage).read(TEST_USER.id, claimId)).toHaveLength(1);
  });

  it('recupera UUID y hash al recargar y volver a seleccionar el archivo original', async () => {
    await ready();
    await service.select([file()]);
    const original = service.files()[0];
    const second = TestBed.runInInjectionContext(() => new ClaimEvidenceService());
    second.connect(claimId);
    const load = second.load();
    http.expectOne(`${base}/configuracion-evidencias`).flush(policy);
    http.expectOne(`${base}/${claimId}/evidencias`).flush({ evidencias: [] });
    await load;
    expect(second.needsReselection()).toBe(true);
    expect(second.files()).toEqual([]);
    await second.select([file()]);
    expect(second.files()[0].key).toBe(original.key);
    expect(second.files()[0].body).toEqual(original.body);
    expect(second.needsReselection()).toBe(false);
  });

  it('recupera confirmación incierta por la misma carga sin volver a enviar bytes', async () => {
    await ready();
    await service.select([file()]);
    const key = service.files()[0].key;
    const [first] = await begin(4);
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}/confirmacion`)
      .error(new ProgressEvent('error'));
    await tick();
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}`)
      .flush(receipt(4, 'confirmada', evidenceId));
    await first;
    expect(service.files()[0].state).toBe('error');
    expect(service.files()[0].key).toBe(key);
    const retry = service.upload(key);
    const start = http.expectOne(`${base}/${claimId}/cargas`);
    expect(start.request.headers.get('Idempotency-Key')).toBe(key);
    start.flush(receipt(4, 'confirmada', evidenceId));
    await tick();
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}`)
      .flush(receipt(4, 'confirmada', evidenceId));
    await tick();
    http.expectOne(`${base}/${claimId}/evidencias`).flush({ evidencias: [] });
    await retry;
    expect(service.files()[0].state).toBe('confirmed');
    http.expectNone(`${base}/${claimId}/cargas/${uploadId}/contenido`);
    http.expectNone(`${base}/${claimId}/cargas/${uploadId}/confirmacion`);
  });

  it('descarta un listado tardío al cambiar de caso después de la confirmación', async () => {
    await ready();
    await service.select([file()]);
    const oldKey = service.files()[0].key;
    const [result] = await begin(4);
    http
      .expectOne(`${base}/${claimId}/cargas/${uploadId}/confirmacion`)
      .flush(receipt(4, 'confirmada', evidenceId));
    await tick();
    const listing = http.expectOne(`${base}/${claimId}/evidencias`);
    listing.flush({
      evidencias: [
        {
          ...service.files()[0].body,
          id: evidenceId,
          siniestroId: claimId,
          creadaEn: '2026-11-08T10:00:00Z',
        },
      ],
    });
    service.connect(evidenceId);
    await result;
    expect(service.evidences()).toEqual([]);
    expect(service.files()).toEqual([]);
    const load = service.load();
    http.expectOne(`${base}/configuracion-evidencias`).flush(policy);
    http.expectOne(`${base}/${evidenceId}/evidencias`).flush({ evidencias: [] });
    await load;
    await service.select([file()]);
    expect(service.files()[0].key).not.toBe(oldKey);
    expect(TestBed.inject(ClaimEvidenceStorage).read(TEST_USER.id, claimId)).toEqual([]);
  });

  it('no envía una carga si no puede guardar la clave durable', async () => {
    await ready();
    vi.spyOn(TestBed.inject(ClaimEvidenceStorage), 'write').mockImplementation(() => {
      throw new Error('quota');
    });
    await service.select([file()]);
    expect(service.files()).toEqual([]);
    expect(service.errorKey()).toBe('claimEvidence.errors.unavailable');
    http.expectNone(`${base}/${claimId}/cargas`);
  });

  it.each([403, 404, 409, 422, 503])(
    'conserva archivo y operación en rechazo HTTP %s',
    async (status) => {
      await ready();
      await service.select([file()]);
      const original = service.files()[0];
      const result = service.upload(original.key);
      http
        .expectOne(`${base}/${claimId}/cargas`)
        .flush({ code: 'rechazo' }, { status, statusText: 'Error' });
      await result;
      expect(service.files()[0].key).toBe(original.key);
      expect(service.files()[0].file).toBe(original.file);
      expect(service.files()[0].state).toBe('error');
      expect(service.errorKey()).toBe(
        [403, 404].includes(status)
          ? 'claimEvidence.errors.access'
          : 'claimEvidence.errors.unavailable',
      );
    },
  );

  it('bloquea doble envío y cancela/oculta archivos al cambiar de actor', async () => {
    await ready();
    await service.select([file()]);
    const key = service.files()[0].key;
    const first = service.upload(key);
    await service.upload(key);
    const request = http.expectOne(`${base}/${claimId}/cargas`);
    user.set({ ...TEST_USER, id: 'otro-cliente' });
    expect(service.files()).toEqual([]);
    expect(service.evidences()).toEqual([]);
    service.connect(claimId);
    await first;
    expect(request.cancelled).toBe(true);
    expect(TestBed.inject(ClaimEvidenceStorage).read('otro-cliente', claimId)).toEqual([]);
    expect(TestBed.inject(ClaimEvidenceStorage).read(TEST_USER.id, claimId)[0].key).toBe(key);
  });
});
