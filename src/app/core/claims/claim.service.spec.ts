import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CLAIM_GATEWAY } from './claim.gateway';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { TEST_USER } from '../auth/auth.testing';
import { ClaimInput, ClaimPolicy, ClaimRecord } from './claim.models';
import { ClaimService } from './claim.service';

const policy: ClaimPolicy = {
  id: '11111111-1111-4111-8111-111111111111',
  tipo: 'automotive',
  fechaInicio: '2020-01-01',
  fechaFin: '2099-12-31',
  estado: 'vigente',
};
const input: ClaimInput = {
  polizaId: policy.id,
  fechaEvento: '2025-01-10T12:00:00Z',
  tipoEvento: 'Colision',
  descripcion: 'Descripcion sintetica del evento',
  lugar: 'Bogota',
};
const record: ClaimRecord = {
  ...input,
  id: '22222222-2222-4222-8222-222222222222',
  estado: 'registrado',
  registradoEn: '2025-01-10T13:00:00Z',
};
const key = `solventa.claim-attempt.${TEST_USER.id}`;

describe('ClaimService', () => {
  let service: ClaimService;
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let gateway: {
    policies: ReturnType<typeof vi.fn>;
    report: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sessionStorage.clear();
    user = signal<AuthUser | null>(TEST_USER);
    gateway = {
      policies: vi.fn(() => of([policy])),
      report: vi.fn(() => of(record)),
      load: vi.fn(() => of(record)),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: CLAIM_GATEWAY, useValue: gateway },
      ],
    });
    service = TestBed.inject(ClaimService);
    service.load();
    TestBed.tick();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('persists before POST, blocks double submission and confirms only a matching response', () => {
    const response = new Subject<ClaimRecord>();
    gateway.report.mockImplementation(() => {
      expect(JSON.parse(sessionStorage.getItem(key)!).payload).toEqual(input);
      return response;
    });
    service.report(input);
    service.report(input);
    expect(gateway.report).toHaveBeenCalledTimes(1);
    expect(service.submitting()).toBe(true);
    expect(service.record()).toBeNull();
    expect(service.locked()).toBe(true);
    response.next(record);
    response.complete();
    expect(service.record()).toEqual(record);
    expect(service.submitting()).toBe(false);
    expect(JSON.parse(sessionStorage.getItem(key)!).claimId).toBe(record.id);
  });

  it('reuses the exact persisted key and payload after a timeout and reload', () => {
    gateway.report.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    service.report(input);
    const attempt = JSON.parse(sessionStorage.getItem(key)!);
    expect(service.record()).toBeNull();
    expect(service.errorKey()).toBe('claims.errors.unconfirmed');
    service.load();
    service.report({ ...input, descripcion: 'Intento de modificar el evento' });
    expect(gateway.report).toHaveBeenLastCalledWith(input, attempt.key);
    expect(service.record()).toEqual(record);
  });

  it.each([401, 403, 409, 429, 500, 503])('retains the operation after HTTP %s', (status) => {
    gateway.report.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    service.report(input);
    const attempt = service.attempt();
    service.retry();
    expect(service.attempt()).toEqual(attempt);
    expect(gateway.report).toHaveBeenLastCalledWith(input, attempt!.key);
    expect(service.record()).toBeNull();
  });

  it.each([
    [400, 'solicitud_invalida'],
    [404, 'poliza_no_encontrada'],
    [409, 'poliza_no_vigente'],
  ])('allows correction only after definitive rejection %s/%s', (status, code) => {
    gateway.report.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status, error: { code } })),
    );
    service.report(input);
    const originalKey = gateway.report.mock.calls[0][1];
    expect(service.attempt()).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
    service.report(input);
    expect(gateway.report.mock.calls[1][1]).not.toBe(originalKey);
  });

  it('rejects a response for different data without losing the original operation', () => {
    gateway.report.mockReturnValue(of({ ...record, polizaId: crypto.randomUUID() }));
    service.report(input);
    expect(service.record()).toBeNull();
    expect(service.errorKey()).toBe('claims.errors.response');
    expect(service.attempt()?.payload).toEqual(input);
  });

  it('recovers confirmed reports using GET and never silently starts a new operation', () => {
    service.report(input);
    gateway.report.mockClear();
    service.load();
    expect(gateway.load).toHaveBeenCalledWith(record.id);
    expect(service.record()).toEqual(record);
    service.retry();
    expect(gateway.report).not.toHaveBeenCalled();
    service.newReport();
    expect(service.record()).toBeNull();
    expect(service.attempt()).toBeNull();
  });

  it('does not discard a previously confirmed ID if recovery returns 404', () => {
    service.report(input);
    gateway.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    gateway.report.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    service.load();
    service.retry();
    expect(service.attempt()?.claimId).toBe(record.id);
    expect(service.locked()).toBe(true);
  });

  it('rejects a different ID when retrying an already known confirmation', () => {
    service.report(input);
    gateway.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    service.load();
    gateway.report.mockReturnValue(of({ ...record, id: crypto.randomUUID() }));
    service.retry();
    expect(service.record()).toBeNull();
    expect(service.errorKey()).toBe('claims.errors.response');
    expect(service.attempt()?.claimId).toBe(record.id);
  });

  it('fails closed without sending when session storage cannot preserve an operation', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Unavailable', 'QuotaExceededError');
    });
    service.report(input);
    expect(gateway.report).not.toHaveBeenCalled();
    expect(service.errorKey()).toBe('claims.errors.storage');
    expect(service.record()).toBeNull();
  });

  it('does not send if the saved operation is corrupted', () => {
    sessionStorage.setItem(key, '{"key":"invalid"}');
    service.load();
    service.report(input);
    expect(gateway.report).not.toHaveBeenCalled();
    expect(service.errorKey()).toBe('claims.errors.storage');
  });

  it('hides another user context immediately and cancels outstanding requests', () => {
    const pending = new Subject<ClaimRecord>();
    gateway.report.mockReturnValue(pending);
    service.report(input);
    user.set({ ...TEST_USER, id: 'another-client' });
    expect(service.attempt()).toBeNull();
    expect(service.policies()).toEqual([]);
    TestBed.tick();
    pending.next(record);
    expect(service.record()).toBeNull();
    service.load();
    expect(service.attempt()).toBeNull();
    user.set(TEST_USER);
    service.load();
    expect(service.attempt()?.payload).toEqual(input);
  });

  it.each([
    { ...input, fechaEvento: '2099-01-10T12:00:00Z' },
    { ...input, fechaEvento: '2019-01-10T12:00:00Z' },
    { ...input, polizaId: crypto.randomUUID() },
    { ...input, descripcion: 'corta' },
    { ...input, tipoEvento: '  ' },
    { ...input, lugar: 'x'.repeat(301) },
  ])('rejects invalid event data before submitting', (invalid) => {
    service.report(invalid);
    expect(gateway.report).not.toHaveBeenCalled();
    expect(service.errorKey()).toBe('claims.errors.invalid');
  });
});
