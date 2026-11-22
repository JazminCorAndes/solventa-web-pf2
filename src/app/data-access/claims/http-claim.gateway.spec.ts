import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { ClaimInput, ClaimRecord } from '../../core/claims/claim.models';
import { HttpClaimGateway } from './http-claim.gateway';

const input: ClaimInput = {
  polizaId: '11111111-1111-4111-8111-111111111111',
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
const key = '33333333-3333-4333-8333-333333333333';
const url = `${environment.apiBaseUrl}/v1/siniestros`;

describe('HttpClaimGateway', () => {
  let gateway: HttpClaimGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HttpClaimGateway,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { getAccessToken: () => of('synthetic-access') } },
      ],
    });
    gateway = TestBed.inject(HttpClaimGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists only session claims without body, identity, filters or invented pagination', () => {
    const next = vi.fn();
    gateway.list().subscribe(next);
    const request = http.expectOne(url);
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-access');
    request.flush({ siniestros: [record] });
    expect(next).toHaveBeenCalledWith([record]);
  });

  it('accepts a genuinely empty list', () => {
    const next = vi.fn();
    gateway.list().subscribe(next);
    http.expectOne(url).flush({ siniestros: [] });
    expect(next).toHaveBeenCalledWith([]);
  });

  it.each([
    {},
    { siniestros: null },
    { siniestros: [record, {}] },
    { siniestros: [{ ...record, estado: 'pagado' }] },
    { siniestros: [{ ...record, fechaEvento: '2025-01-10T12:00:00' }] },
    { siniestros: [record, record] },
  ])('rejects invalid lists as a whole instead of showing partial success', (response) => {
    const next = vi.fn();
    const error = vi.fn();
    gateway.list().subscribe({ next, error });
    http.expectOne(url).flush(response);
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it.each([403, 503])('preserves a %s list failure instead of returning empty', (status) => {
    const next = vi.fn();
    const error = vi.fn();
    gateway.list().subscribe({ next, error });
    http.expectOne(url).flush({ code: 'fallo_sintetico' }, { status, statusText: 'Error' });
    expect(next).not.toHaveBeenCalled();
    expect(error.mock.calls[0][0].status).toBe(status);
  });

  it('loads active policies through the authenticated API', () => {
    const active = {
      id: input.polizaId,
      tipo: 'automotive',
      fechaInicio: '2025-01-01',
      fechaFin: '2025-12-31',
      estado: 'vigente',
    };
    const next = vi.fn();
    gateway.policies().subscribe(next);
    const request = http.expectOne(`${url}/polizas`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-access');
    request.flush({ polizas: [active, { ...active, estado: 'vencida' }] });
    expect(next).toHaveBeenCalledWith([active]);
  });

  it.each([{}, { polizas: [{}] }, { polizas: null }])('rejects malformed policies', (response) => {
    const error = vi.fn();
    gateway.policies().subscribe({ error });
    http.expectOne(`${url}/polizas`).flush(response);
    expect(error).toHaveBeenCalledOnce();
  });

  it('sends the exact payload and idempotency key and validates the confirmation', () => {
    const next = vi.fn();
    gateway.report(input, key).subscribe(next);
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-access');
    request.flush(record, { status: 201, statusText: 'Created' });
    expect(next).toHaveBeenCalledWith(record);
  });

  it.each([
    { ...record, id: '' },
    { ...record, estado: 'pendiente' },
    { ...record, registradoEn: 'invalid' },
    { ...record, fechaEvento: '2025-01-10T12:00:00' },
    {},
  ])('never confirms malformed or incomplete responses', (response) => {
    const next = vi.fn();
    const error = vi.fn();
    gateway.report(input, key).subscribe({ next, error });
    http.expectOne(url).flush(response);
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it('recovers the exact claim and rejects a different ID', () => {
    const error = vi.fn();
    gateway.load(record.id).subscribe({ error });
    http.expectOne(`${url}/${record.id}`).flush({ ...record, id: crypto.randomUUID() });
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not send an invalid operation key', () => {
    const error = vi.fn();
    gateway.report(input, 'invalid').subscribe({ error });
    http.expectNone(url);
    expect(error).toHaveBeenCalledOnce();
  });

  it('preserves recoverable backend errors instead of fabricating success', () => {
    const error = vi.fn();
    gateway.report(input, key).subscribe({ error });
    http
      .expectOne(url)
      .flush(
        { code: 'servicio_no_disponible', detail: 'Unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    expect(error.mock.calls[0][0].status).toBe(503);
  });
});
