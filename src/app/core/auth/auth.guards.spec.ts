import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { administratorGuard, safePostLoginUrl } from './auth.guards';
import { AuthUser } from './auth.models';
import { AuthService } from './auth.service';
import { TEST_USER } from './auth.testing';

describe('administratorGuard', () => {
  it.each([
    ['client', '/app/dashboard'],
    ['partner', '/app/socios'],
    ['advisor', '/asesor/perfilamientos/nuevo'],
    ['administrator', null],
  ] satisfies [AuthUser['role'], string | null][])(
    'protege el portal interno frente al rol %s',
    async (role, home) => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          {
            provide: AuthService,
            useValue: {
              getAccessToken: () => of('access'),
              hasActiveSession: () => true,
              user: () => ({ ...TEST_USER, role }),
            },
          },
        ],
      });
      const router = TestBed.inject(Router);
      const result = TestBed.runInInjectionContext(() =>
        administratorGuard(new ActivatedRouteSnapshot(), router.routerState.snapshot),
      );
      if (!isObservable(result)) throw new Error('Expected asynchronous authorization.');
      const authorization = await firstValueFrom(result);
      if (home === null) expect(authorization).toBe(true);
      else {
        expect(authorization).toBeInstanceOf(UrlTree);
        if (authorization instanceof UrlTree) expect(router.serializeUrl(authorization)).toBe(home);
      }
    },
  );
});

describe('safePostLoginUrl', () => {
  it('accepts internal authenticated routes', () => {
    expect(safePostLoginUrl('/app/dashboard')).toBe('/app/dashboard');
  });

  it.each([
    null,
    '',
    'https://example.com',
    '//example.com',
    '/iniciar-sesion',
    '/application',
    '/app\\evil',
    '/app/socios',
  ])('falls back for unsafe return URL %s', (url) => {
    expect(safePostLoginUrl(url)).toBe('/app/dashboard');
  });

  it('routes partners only to their own portal', () => {
    const partner = { ...TEST_USER, role: 'partner' as const, partnerIds: ['BANCO-001'] };
    expect(safePostLoginUrl('/app/dashboard', partner)).toBe('/app/socios');
    expect(safePostLoginUrl('/app/socios/cotizaciones/solicitar', partner)).toBe(
      '/app/socios/cotizaciones/solicitar',
    );
    expect(safePostLoginUrl('/app/socios-falso', partner)).toBe('/app/socios');
  });

  it('limita los retornos administrativos al portal interno', () => {
    const admin = { ...TEST_USER, role: 'administrator' as const };
    expect(safePostLoginUrl('/administracion/siniestros/123', admin)).toBe(
      '/administracion/siniestros/123',
    );
    for (const url of [
      null,
      '/app/dashboard',
      '/app/socios',
      '/asesor/excepciones',
      '//example.com',
      '/administracion\\evil',
      '/administracion-falsa/colas',
    ]) {
      expect(safePostLoginUrl(url, admin)).toBe('/administracion/colas/revision');
    }
    expect(safePostLoginUrl('/administracion/colas/revision', TEST_USER)).toBe('/app/dashboard');
  });

  it('dirige al asesor solo a su portal y rechaza retornos de cliente o socio', () => {
    const advisor = { ...TEST_USER, role: 'advisor' as const, partnerIds: ['BANCO-001'] };
    expect(safePostLoginUrl('/asesor/perfilamientos/nuevo', advisor)).toBe(
      '/asesor/perfilamientos/nuevo',
    );
    for (const url of ['/app/dashboard', '/app/socios', '//example.com', '/asesor\\evil', null]) {
      expect(safePostLoginUrl(url, advisor)).toBe('/asesor/perfilamientos/nuevo');
    }
    expect(safePostLoginUrl('/asesor/perfilamientos/nuevo', TEST_USER)).toBe('/app/dashboard');
  });
});
