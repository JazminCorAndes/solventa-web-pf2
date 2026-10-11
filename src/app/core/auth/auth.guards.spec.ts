import { safePostLoginUrl } from './auth.guards';

describe('safePostLoginUrl', () => {
  it('accepts internal authenticated routes', () => {
    expect(safePostLoginUrl('/app/dashboard')).toBe('/app/dashboard');
  });

  it.each([null, '', 'https://example.com', '//example.com', '/iniciar-sesion'])(
    'falls back for unsafe return URL %s',
    (url) => {
      expect(safePostLoginUrl(url)).toBe('/app/dashboard');
    },
  );
});
