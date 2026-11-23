import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { DocumentAcceptanceAttempt, PolicyDocument } from './policy-document.models';
import { PolicyDocumentService } from './policy-document.service';
import {
  ACCEPTED_DOCUMENT,
  DOCUMENT_ACCEPTANCE,
  DOCUMENT_ACTOR_ID,
  DOCUMENT_POLICY_ID,
  documentBytes,
  POLICY_DOCUMENT,
} from './policy-document.testing';

const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${DOCUMENT_POLICY_ID}`;
const STORAGE_KEY = `solventa.policy-document.v1.${DOCUMENT_ACTOR_ID}.${DOCUMENT_POLICY_ID}`;
const CLIENT: AuthUser = {
  id: DOCUMENT_ACTOR_ID,
  role: 'client',
  name: 'Cliente de prueba',
  email: 'cliente@example.test',
};
const NEXT_DOCUMENT: PolicyDocument = {
  ...POLICY_DOCUMENT,
  documentoId: '30000000-0000-4000-8000-000000000009',
  versionPoliza: 2,
  contenidoHash: 'b'.repeat(64),
  contenido: { ...POLICY_DOCUMENT.contenido, version: 2 },
  historialAceptaciones: [DOCUMENT_ACCEPTANCE],
};

describe('PolicyDocumentService', () => {
  let service: PolicyDocumentService;
  let http: HttpTestingController;
  const user = signal<AuthUser | null>(CLIENT);

  beforeEach(() => {
    sessionStorage.clear();
    user.set(CLIENT);
    TestBed.configureTestingModule({
      providers: [
        PolicyDocumentService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
      ],
    });
    service = TestBed.inject(PolicyDocumentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  function load(document: PolicyDocument = POLICY_DOCUMENT): void {
    service.load(DOCUMENT_POLICY_ID);
    http.expectOne(`${BASE}/documento`).flush(document);
  }

  function begin(): DocumentAcceptanceAttempt {
    service.consent.set(true);
    service.accept();
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as DocumentAcceptanceAttempt;
  }

  it('requires explicit consent and persists the exact key/body before sending, suppressing duplicates', () => {
    load();
    expect(service.canAccept()).toBe(false);
    const attempt = begin();
    const request = http.expectOne(`${BASE}/aceptaciones`);
    expect(request.request.body).toEqual(attempt.body);
    expect(request.request.headers.get('Idempotency-Key')).toBe(attempt.key);
    expect(attempt.body).toEqual({
      documentoId: POLICY_DOCUMENT.documentoId,
      versionPoliza: 1,
      contenidoHash: POLICY_DOCUMENT.contenidoHash,
      aceptaSimulacion: true,
    });
    service.accept();
    http.expectNone(`${BASE}/aceptaciones`);
    request.flush(DOCUMENT_ACCEPTANCE, { status: 201, statusText: 'Created' });
    http.expectOne(`${BASE}/documento`).flush(ACCEPTED_DOCUMENT);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service.document()?.aceptacionActual).toEqual(DOCUMENT_ACCEPTANCE);
    expect(service.canAccept()).toBe(false);
  });

  it('recovers a 503 across reload with the same key/body and accepts a 200 replay', () => {
    load();
    const attempt = begin();
    http
      .expectOne(`${BASE}/aceptaciones`)
      .flush({ code: 'servicio_no_disponible' }, { status: 503, statusText: 'Unavailable' });
    expect(service.error()).toBe('ambiguous');
    load();
    expect(service.consent()).toBe(false);
    expect(service.canRecover()).toBe(true);
    service.recover();
    const replay = http.expectOne(`${BASE}/aceptaciones`);
    expect(replay.request.body).toEqual(attempt.body);
    expect(replay.request.headers.get('Idempotency-Key')).toBe(attempt.key);
    replay.flush(DOCUMENT_ACCEPTANCE);
    http.expectOne(`${BASE}/documento`).flush(ACCEPTED_DOCUMENT);
    expect(service.receipt()?.aceptadaEn).toBe(DOCUMENT_ACCEPTANCE.aceptadaEn);
  });

  it('preserves a timed out attempt instead of generating another key', () => {
    vi.useFakeTimers();
    load();
    const attempt = begin();
    const request = http.expectOne(`${BASE}/aceptaciones`);
    vi.advanceTimersByTime(20_001);
    expect(request.cancelled).toBe(true);
    expect(service.error()).toBe('ambiguous');
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual(attempt);
    expect(service.canRecover()).toBe(true);
  });

  it('recovers a committed request from authoritative GET without another POST', () => {
    load();
    begin();
    http.expectOne(`${BASE}/aceptaciones`).error(new ProgressEvent('network'));
    load(ACCEPTED_DOCUMENT);
    expect(service.attempt()).toBeNull();
    expect(service.document()?.aceptacionActual?.id).toBe(DOCUMENT_ACCEPTANCE.id);
    http.expectNone(`${BASE}/aceptaciones`);
  });

  it('reconsults after stale-document 409 and requires new consent with a new document and key', () => {
    load();
    const previous = begin();
    http
      .expectOne(`${BASE}/aceptaciones`)
      .flush({ code: 'documento_desactualizado' }, { status: 409, statusText: 'Conflict' });
    http.expectOne(`${BASE}/documento`).flush(NEXT_DOCUMENT);
    expect(service.notice()).toBe('outdated');
    expect(service.consent()).toBe(false);
    expect(service.canAccept()).toBe(false);
    expect(service.document()?.aceptacionActual).toBeNull();
    const next = begin();
    expect(next.key).not.toBe(previous.key);
    expect(next.body.documentoId).toBe(NEXT_DOCUMENT.documentoId);
    http
      .expectOne(`${BASE}/aceptaciones`)
      .flush({ code: 'solicitud_invalida' }, { status: 400, statusText: 'Bad request' });
  });

  it('does not replay an old uncertain attempt against a newer document after reload', () => {
    load();
    begin();
    http.expectOne(`${BASE}/aceptaciones`).error(new ProgressEvent('network'));
    load(NEXT_DOCUMENT);
    expect(service.attempt()).toBeNull();
    expect(service.notice()).toBe('outdated');
    expect(service.canRecover()).toBe(false);
    expect(service.canAccept()).toBe(false);
    expect(service.document()?.historialAceptaciones).toEqual([DOCUMENT_ACCEPTANCE]);
    http.expectNone(`${BASE}/aceptaciones`);
  });

  it('shows a historical replay receipt without treating a newer document as accepted', () => {
    load();
    begin();
    http.expectOne(`${BASE}/aceptaciones`).flush(DOCUMENT_ACCEPTANCE);
    http.expectOne(`${BASE}/documento`).flush(NEXT_DOCUMENT);
    expect(service.receipt()).toEqual(DOCUMENT_ACCEPTANCE);
    expect(service.document()?.aceptacionActual).toBeNull();
    expect(service.consent()).toBe(false);
  });

  it('persists an idempotency conflict and blocks both new requests and replay after reload', () => {
    load();
    const attempt = begin();
    http
      .expectOne(`${BASE}/aceptaciones`)
      .flush({ code: 'idempotencia_conflictiva' }, { status: 409, statusText: 'Conflict' });
    load();
    expect(service.attempt()?.key).toBe(attempt.key);
    expect(service.error()).toBe('keyConflict');
    expect(service.canRecover()).toBe(false);
    service.consent.set(true);
    expect(service.canAccept()).toBe(false);
    http.expectNone(`${BASE}/aceptaciones`);
  });

  it.each([401, 403, 404])(
    'shows %s without asserting success or discarding recovery data',
    (status) => {
      load();
      const attempt = begin();
      http.expectOne(`${BASE}/aceptaciones`).flush({}, { status, statusText: 'Denied' });
      expect(service.error()).toBe(
        status === 401 ? 'session' : status === 403 ? 'forbidden' : 'notFound',
      );
      expect(service.receipt()).toBeNull();
      expect(service.attempt()?.key).toBe(attempt.key);
      expect(service.canRecover()).toBe(false);
    },
  );

  it('keeps recovery data when the response is corrupt or for another actor', () => {
    load();
    const attempt = begin();
    http
      .expectOne(`${BASE}/aceptaciones`)
      .flush({ ...DOCUMENT_ACCEPTANCE, actorId: DOCUMENT_POLICY_ID });
    expect(service.error()).toBe('ambiguous');
    expect(service.attempt()?.key).toBe(attempt.key);
    expect(service.receipt()).toBeNull();
  });

  it('fails closed if storage cannot persist the attempt', () => {
    load();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    service.consent.set(true);
    service.accept();
    expect(service.error()).toBe('storage');
    http.expectNone(`${BASE}/aceptaciones`);
  });

  it('fails closed for corrupt recovery data', () => {
    sessionStorage.setItem(STORAGE_KEY, '{"body":false}');
    service.load(DOCUMENT_POLICY_ID);
    expect(service.error()).toBe('storage');
    http.expectNone(`${BASE}/documento`);
  });

  it('does not send if the saved request changed between review and replay', () => {
    load();
    const attempt = begin();
    http.expectOne(`${BASE}/aceptaciones`).error(new ProgressEvent('network'));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...attempt, key: DOCUMENT_POLICY_ID }));
    service.recover();
    expect(service.error()).toBe('storage');
    http.expectNone(`${BASE}/aceptaciones`);
  });

  it('hides data immediately on actor changes and cancels in-flight responses', () => {
    load();
    begin();
    const request = http.expectOne(`${BASE}/aceptaciones`);
    user.set({ ...CLIENT, id: DOCUMENT_POLICY_ID });
    expect(service.document()).toBeNull();
    expect(service.attempt()).toBeNull();
    TestBed.tick();
    expect(request.cancelled).toBe(true);
    expect(service.receipt()).toBeNull();
  });

  it('blocks non-client actors and does not send requests', () => {
    user.set({ ...CLIENT, role: 'advisor' });
    service.load(DOCUMENT_POLICY_ID);
    expect(service.error()).toBe('session');
    http.expectNone(`${BASE}/documento`);
  });

  it('downloads only verified server bytes with a safe filename and revokes the object URL', async () => {
    vi.useFakeTimers();
    const bytes = documentBytes('Documento de prueba');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    load({ ...POLICY_DOCUMENT, contenidoHash: hash });
    const create = vi.fn<(blob: Blob) => string>(() => 'blob:test-document');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    service.download();
    http.expectOne(`${BASE}/documentos/${POLICY_DOCUMENT.documentoId}/descarga`).flush(bytes, {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(
      `poliza-${DOCUMENT_POLICY_ID}-${POLICY_DOCUMENT.documentoId}.html`,
    );
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(create.mock.calls[0][0].size).toBe(bytes.byteLength);
    vi.runOnlyPendingTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test-document');
    vi.unstubAllGlobals();
  });
});
