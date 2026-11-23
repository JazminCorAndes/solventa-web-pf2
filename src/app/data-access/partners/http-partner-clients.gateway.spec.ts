import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { HttpPartnerClientsGateway, QuotedPartnerClient } from './http-partner-clients.gateway';

const CLIENT: QuotedPartnerClient = {
  clienteId: '22222222-2222-4222-8222-222222222222',
  nombre: 'Cliente autorizado',
  tipoDocumento: 'cc',
  numeroDocumentoEnmascarado: '******5678',
  consentimientoEstado: 'vigente',
};
const URL = `${environment.apiBaseUrl}/v1/socios/clientes`;

describe('HttpPartnerClientsGateway', () => {
  let gateway: HttpPartnerClientsGateway;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getAccessToken: () => of('local-test-token') } },
      ],
    });
    gateway = TestBed.inject(HttpPartnerClientsGateway);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('requests only the selected partner and authorized product with Bearer/API-Version', () => {
    let result: QuotedPartnerClient[] | undefined;
    gateway.list('BANK-A').subscribe((clients) => (result = clients));
    const request = http.expectOne(`${URL}?socioId=BANK-A&productoId=mortgage-life`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer local-test-token');
    expect(request.request.headers.get('API-Version')).toBe('1');
    request.flush({ clientes: [CLIENT] });
    expect(result).toEqual([CLIENT]);
    http.expectNone(`${environment.apiBaseUrl}/v1/clientes/me/dashboard`);
  });

  it('deduplicates a stable customer identifier and keeps redacted associations', () => {
    let result: QuotedPartnerClient[] | undefined;
    gateway.list('BANK-A').subscribe((clients) => (result = clients));
    const redacted = {
      ...CLIENT,
      clienteId: '11111111-1111-4111-8111-111111111111',
      nombre: null,
      tipoDocumento: null,
      numeroDocumentoEnmascarado: null,
      consentimientoEstado: 'revocado',
    };
    http.expectOne(`${URL}?socioId=BANK-A&productoId=mortgage-life`).flush({
      clientes: [CLIENT, { ...CLIENT, correo: 'never-shown@example.test' }, redacted],
    });
    expect(result).toEqual([redacted, CLIENT]);
  });

  it.each([
    {},
    { clientes: null },
    { clientes: [{ ...CLIENT, clienteId: 'not-a-customer-id' }] },
    { clientes: [{ ...CLIENT, consentimientoEstado: 'revocado' }] },
    { clientes: [{ ...CLIENT, numeroDocumentoEnmascarado: '12345678' }] },
    { clientes: [{ ...CLIENT, tipoDocumento: ['cc'] }] },
    { clientes: [{ ...CLIENT, consentimientoEstado: ['vigente'] }] },
    { clientes: [CLIENT, { ...CLIENT, nombre: 'Contradictorio' }] },
  ])('rejects an invalid or unauthorized list instead of fabricating an empty result', (body) => {
    let error: unknown;
    gateway.list('BANK-A').subscribe({
      next: () => {
        throw new Error('Invalid response was accepted');
      },
      error: (cause: unknown) => (error = cause),
    });
    http.expectOne(`${URL}?socioId=BANK-A&productoId=mortgage-life`).flush(body);
    expect(error).toBeInstanceOf(Error);
  });
});
