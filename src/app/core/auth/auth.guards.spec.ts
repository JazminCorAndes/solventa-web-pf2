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
});
