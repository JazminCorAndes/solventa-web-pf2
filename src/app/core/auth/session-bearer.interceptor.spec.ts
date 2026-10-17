import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AUTH_STORAGE } from './auth-storage.service';
import { AuthSession } from './auth.models';
import { sessionBearerInterceptor } from './session-bearer.interceptor';

describe('sessionBearerInterceptor', () => {
  let session: AuthSession | null;
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    session = {
      user: { id: 'cliente', name: 'Cliente', email: 'cliente@solventa.co', role: 'client' },
      expiresAt: Date.now() + 60_000,
      accessToken: 'token-prueba',
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionBearerInterceptor])),
        provideHttpClientTesting(),
        { provide: AUTH_STORAGE, useValue: { read: () => session } },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it.each([
    '/api/v1/productos-seguro',
    '/api/v1/solicitudes-cotizacion',
    '/api/v1/solicitudes-cotizacion/cotizacion/ofertas',
    '/api/v1/solicitudes-cotizacion/cotizacion/seleccion',
  ])('envía Bearer al recurso protegido %s', (url) => {
    client.get(url).subscribe();
    const request = http.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-prueba');
    request.flush({});
  });

  it.each(['/assets/i18n/es.json', 'https://tercero.example/api/v1/datos', '/api-externa/datos'])(
    'no filtra el token a %s',
    (url) => {
      client.get(url).subscribe();
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    },
  );

  it.each([null, -1])('no envía un token ausente o vencido (%s)', (expired) => {
    session = expired === null ? null : { ...session!, expiresAt: Date.now() - 1 };
    client.get('/api/v1/productos-seguro').subscribe();
    const request = http.expectOne('/api/v1/productos-seguro');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
