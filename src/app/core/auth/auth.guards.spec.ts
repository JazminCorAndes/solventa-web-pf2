import { safePostLoginUrl } from './auth.guards';
import { TEST_USER } from './auth.testing';

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
