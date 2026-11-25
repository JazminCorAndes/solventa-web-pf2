import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import {
  DocumentAcceptanceAttempt,
  PolicyDocumentError,
} from '../../core/policies/policy-document.models';
import {
  DOCUMENT_ACCEPTANCE,
  DOCUMENT_ACTOR_ID,
  documentBytes,
  DOCUMENT_PDF,
  DOCUMENT_POLICY_ID,
  POLICY_DOCUMENT,
} from '../../core/policies/policy-document.testing';
import { HttpPolicyDocumentGateway } from './http-policy-document.gateway';

const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${DOCUMENT_POLICY_ID}`;
const ATTEMPT: DocumentAcceptanceAttempt = {
  key: '60000000-0000-4000-8000-000000000006',
  conflict: false,
  body: {
    documentoId: POLICY_DOCUMENT.documentoId,
    versionPoliza: 1,
    contenidoHash: POLICY_DOCUMENT.contenidoHash,
    aceptaSimulacion: true,
  },
};

describe('HttpPolicyDocumentGateway', () => {
  let gateway: HttpPolicyDocumentGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { getAccessToken: () => of('document-test-token') },
        },
      ],
    });
    gateway = TestBed.inject(HttpPolicyDocumentGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the structured authoritative document through the authenticated client endpoint', async () => {
    const result = firstValueFrom(gateway.load(DOCUMENT_POLICY_ID, DOCUMENT_ACTOR_ID));
    const request = http.expectOne(`${BASE}/documento`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer document-test-token');
    request.flush(POLICY_DOCUMENT);
    expect(await result).toEqual(POLICY_DOCUMENT);
  });

  it('accepts a date-based document with null version, premium and plan without fabricating data', async () => {
    const document = {
      ...POLICY_DOCUMENT,
      versionPoliza: null,
      contenido: {
        ...POLICY_DOCUMENT.contenido,
        version: null,
        prima: null,
        plan: null,
      },
    };
    const result = firstValueFrom(gateway.load(DOCUMENT_POLICY_ID, DOCUMENT_ACTOR_ID));
    http.expectOne(`${BASE}/documento`).flush(document);
    expect(await result).toEqual(document);
  });

  it.each([
    { ...POLICY_DOCUMENT, simulada: false },
    { ...POLICY_DOCUMENT, contenidoHash: 'not-a-hash' },
    { ...POLICY_DOCUMENT, polizaId: DOCUMENT_ACTOR_ID },
    {
      ...POLICY_DOCUMENT,
      contenido: { ...POLICY_DOCUMENT.contenido, clienteId: DOCUMENT_POLICY_ID },
    },
    { ...POLICY_DOCUMENT, contenido: { ...POLICY_DOCUMENT.contenido, version: 2 } },
    { ...POLICY_DOCUMENT, contenido: { ...POLICY_DOCUMENT.contenido, coberturas: [] } },
    {
      ...POLICY_DOCUMENT,
      contenido: {
        ...POLICY_DOCUMENT.contenido,
        prima: { monto: '1.50', moneda: 'COP', periodicidad: 'mensual' },
      },
    },
    {
      ...POLICY_DOCUMENT,
      contenido: {
        ...POLICY_DOCUMENT.contenido,
        vigencia: { inicio: '2026-02-30', fin: '2026-03-05' },
      },
    },
    {
      ...POLICY_DOCUMENT,
      aceptacionActual: { ...DOCUMENT_ACCEPTANCE, documentoId: DOCUMENT_ACTOR_ID },
    },
    {
      ...POLICY_DOCUMENT,
      historialAceptaciones: [{ ...DOCUMENT_ACCEPTANCE, actorId: DOCUMENT_POLICY_ID }],
    },
    { ...POLICY_DOCUMENT, historialAceptaciones: [DOCUMENT_ACCEPTANCE, DOCUMENT_ACCEPTANCE] },
  ])('rejects invalid, stale or foreign document evidence', async (document) => {
    const result = firstValueFrom(gateway.load(DOCUMENT_POLICY_ID, DOCUMENT_ACTOR_ID));
    http.expectOne(`${BASE}/documento`).flush(document);
    await expect(result).rejects.toMatchObject({ kind: 'invalid' });
  });

  it.each([200, 201])(
    'validates acceptance or replay with status %s and exact body/key',
    async (status) => {
      const result = firstValueFrom(gateway.accept(DOCUMENT_POLICY_ID, DOCUMENT_ACTOR_ID, ATTEMPT));
      const request = http.expectOne(`${BASE}/aceptaciones`);
      expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('Authorization')).toBe('Bearer document-test-token');
      expect(request.request.headers.get('Idempotency-Key')).toBe(ATTEMPT.key);
      expect(request.request.body).toEqual(ATTEMPT.body);
      request.flush(DOCUMENT_ACCEPTANCE, { status, statusText: 'OK' });
      expect(await result).toEqual(DOCUMENT_ACCEPTANCE);
    },
  );

  it.each([
    { ...DOCUMENT_ACCEPTANCE, actorId: DOCUMENT_POLICY_ID },
    { ...DOCUMENT_ACCEPTANCE, versionPoliza: 2 },
    { ...DOCUMENT_ACCEPTANCE, contenidoHash: 'b'.repeat(64) },
  ])('rejects acceptance evidence for another actor or document', async (evidence) => {
    const result = firstValueFrom(gateway.accept(DOCUMENT_POLICY_ID, DOCUMENT_ACTOR_ID, ATTEMPT));
    http.expectOne(`${BASE}/aceptaciones`).flush(evidence, { status: 201, statusText: 'Created' });
    await expect(result).rejects.toBeInstanceOf(PolicyDocumentError);
  });

  it.each([
    [400, 'solicitud_invalida', 'invalidRequest'],
    [403, 'prohibido', 'forbidden'],
    [404, 'poliza_no_encontrada', 'notFound'],
    [409, 'documento_desactualizado', 'outdated'],
    [409, 'idempotencia_conflictiva', 'keyConflict'],
  ])('preserves the meaning of %s %s', async (status, code, kind) => {
    const result = firstValueFrom(gateway.accept(DOCUMENT_POLICY_ID, DOCUMENT_ACTOR_ID, ATTEMPT));
    http
      .expectOne(`${BASE}/aceptaciones`)
      .flush({ code }, { status: Number(status), statusText: 'Error' });
    await expect(result).rejects.toMatchObject({ kind });
  });

  it('downloads PDF bytes using their own digest and the canonical source hash', async () => {
    const bytes = documentBytes(DOCUMENT_PDF);
    const hash = await digest(bytes);
    const document = POLICY_DOCUMENT;
    const result = firstValueFrom(gateway.download(document));
    const request = http.expectOne(`${BASE}/documentos/${document.documentoId}/descarga/pdf`);
    expect(request.request.responseType).toBe('arraybuffer');
    expect(request.request.headers.get('Authorization')).toBe('Bearer document-test-token');
    expect(hash).not.toBe(document.contenidoHash);
    request.flush(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'X-Content-SHA256': hash,
        'X-Document-Content-SHA256': document.contenidoHash,
      },
    });
    expect(new Uint8Array(await result)).toEqual(new Uint8Array(bytes));
  });

  it.each<Record<string, string>>([
    { 'Content-Type': 'application/json' },
    { 'X-Content-SHA256': 'wrong' },
    { 'X-Document-Content-SHA256': 'b'.repeat(64) },
    { 'Content-Disposition': 'inline' },
    { 'Content-Disposition': 'attachment; filename="poliza.html"' },
    { 'X-Content-Type-Options': 'invalid' },
    { 'Cache-Control': 'public' },
    {
      'Content-Security-Policy': 'default-src *; sandbox allow-scripts',
    },
  ])('rejects inconsistent visible download headers', async (headers) => {
    const bytes = documentBytes(DOCUMENT_PDF);
    const result = firstValueFrom(gateway.download(POLICY_DOCUMENT));
    http.expectOne(`${BASE}/documentos/${POLICY_DOCUMENT.documentoId}/descarga/pdf`).flush(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'X-Content-SHA256': await digest(bytes),
        'X-Document-Content-SHA256': POLICY_DOCUMENT.contenidoHash,
        ...headers,
      },
    });
    await expect(result).rejects.toMatchObject({ kind: 'download' });
  });

  it('rejects altered PDF bytes despite a matching canonical source hash', async () => {
    const result = firstValueFrom(gateway.download(POLICY_DOCUMENT));
    http
      .expectOne(`${BASE}/documentos/${POLICY_DOCUMENT.documentoId}/descarga/pdf`)
      .flush(documentBytes(DOCUMENT_PDF + 'alterado'), {
        headers: {
          'Content-Type': 'application/pdf',
          'X-Content-SHA256': await digest(documentBytes(DOCUMENT_PDF)),
          'X-Document-Content-SHA256': POLICY_DOCUMENT.contenidoHash,
        },
      });
    await expect(result).rejects.toMatchObject({ kind: 'download' });
  });

  it('accepts consistent secure visible headers', async () => {
    const bytes = documentBytes(DOCUMENT_PDF);
    const hash = await digest(bytes);
    const result = firstValueFrom(gateway.download(POLICY_DOCUMENT));
    http.expectOne(`${BASE}/documentos/${POLICY_DOCUMENT.documentoId}/descarga/pdf`).flush(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="poliza-academica.pdf"',
        'X-Content-SHA256': hash,
        'X-Document-Content-SHA256': POLICY_DOCUMENT.contenidoHash,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
    expect(await result).toBe(bytes);
  });

  it.each(['X-Content-SHA256', 'X-Document-Content-SHA256'])(
    'fails closed when CORS hides %s',
    async (missing) => {
      const bytes = documentBytes(DOCUMENT_PDF);
      const headers: Record<string, string> = {
        'Content-Type': 'application/pdf',
        'X-Content-SHA256': await digest(bytes),
        'X-Document-Content-SHA256': POLICY_DOCUMENT.contenidoHash,
      };
      delete headers[missing];
      const result = firstValueFrom(gateway.download(POLICY_DOCUMENT));
      http
        .expectOne(`${BASE}/documentos/${POLICY_DOCUMENT.documentoId}/descarga/pdf`)
        .flush(bytes, { headers });
      await expect(result).rejects.toMatchObject({ kind: 'download' });
    },
  );

  it.each([documentBytes(), documentBytes('%PDF-1.4\ntruncado'), new ArrayBuffer(1_048_577)])(
    'rejects HTML, truncated or oversized payloads even with correct hashes',
    async (bytes) => {
      const result = firstValueFrom(gateway.download(POLICY_DOCUMENT));
      http
        .expectOne(`${BASE}/documentos/${POLICY_DOCUMENT.documentoId}/descarga/pdf`)
        .flush(bytes, {
          headers: {
            'Content-Type': 'application/pdf',
            'X-Content-SHA256': await digest(bytes),
            'X-Document-Content-SHA256': POLICY_DOCUMENT.contenidoHash,
          },
        });
      await expect(result).rejects.toMatchObject({ kind: 'download' });
    },
  );
});

async function digest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
