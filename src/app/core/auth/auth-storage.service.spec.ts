import { TestBed } from '@angular/core/testing';
import { BrowserAuthStorage, StoredAuth } from './auth-storage.service';
import { TEST_USER } from './auth.testing';

const STORED: StoredAuth = {
  user: TEST_USER,
  refreshToken: 'refresh-token',
  refreshExpiresAt: 1_900_000_000_000,
};

describe('BrowserAuthStorage', () => {
  let storage: BrowserAuthStorage;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [BrowserAuthStorage] });
    storage = TestBed.inject(BrowserAuthStorage);
  });

  it('round-trips the refresh token and user in sessionStorage', () => {
    storage.write(STORED);

    expect(storage.read()).toEqual(STORED);
    expect(localStorage.length).toBe(0);
  });

  it('never stores an access token', () => {
    storage.write(STORED);

    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain('access');
  });

  it('restores partner identity but rejects missing membership', () => {
    const user = { ...TEST_USER, role: 'partner' as const, partnerIds: ['BANCO-001'] };
    storage.write({ ...STORED, user });
    expect(storage.read()?.user).toEqual(user);
    sessionStorage.setItem(
      'solventa.auth.refresh',
      JSON.stringify({
        ...STORED,
        user: { ...user, partnerIds: [] },
      }),
    );
    expect(storage.read()).toBeNull();
  });

  it('discards malformed data', () => {
    sessionStorage.setItem('solventa.auth.refresh', '{"refreshToken":1}');

    expect(storage.read()).toBeNull();
    expect(sessionStorage.getItem('solventa.auth.refresh')).toBeNull();
  });

  it.each([[], ['BANCO-001'], ['BANCO-001', 'BANCO-002']].map((partnerIds) => ({ partnerIds })))(
    'restaura el rol asesor con socios %j sin convertirlo en cliente',
    ({ partnerIds }) => {
      const user = { ...TEST_USER, role: 'advisor' as const, partnerIds };
      storage.write({ ...STORED, user });
      expect(storage.read()?.user).toEqual(user);
    },
  );

  it.each(
    [undefined, null, [''], [12], ['BANCO-001', 'BANCO-001']].map((partnerIds) => ({ partnerIds })),
  )('descarta un contexto asesor malformado %j', ({ partnerIds }) => {
    sessionStorage.setItem(
      'solventa.auth.refresh',
      JSON.stringify({ ...STORED, user: { ...TEST_USER, role: 'advisor', partnerIds } }),
    );
    expect(storage.read()).toBeNull();
  });

  it('clears the legacy session entry', () => {
    sessionStorage.setItem('solventa.auth.session', '{}');

    storage.clear();

    expect(sessionStorage.getItem('solventa.auth.session')).toBeNull();
  });
});
