import { RecoveryLinkService } from './recovery-link.service';

describe('RecoveryLinkService', () => {
  const token = 'a'.repeat(64);

  it('retira el secreto antes del router y lo entrega una sola vez, sin almacenamiento', () => {
    history.replaceState(null, '', `/recuperar-contrasena#token=${token}`);
    const store = new RecoveryLinkService();
    const local = vi.spyOn(localStorage, 'setItem');
    const session = vi.spyOn(sessionStorage, 'setItem');
    store.capture(location, history);
    expect(location.hash).toBe('');
    expect(store.take()).toBe(token);
    expect(store.take()).toBeNull();
    expect(local).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
    local.mockRestore();
    session.mockRestore();
  });

  it.each([`#token=${token}&token=${token}`, '#token=corto', `?token=${token}`])(
    'rechaza tokens duplicados, malformados o query y limpia la URL: %s',
    (suffix) => {
      history.replaceState(null, '', `/recuperar-contrasena${suffix}`);
      const store = new RecoveryLinkService();
      store.capture(location, history);
      expect(location.hash).toBe('');
      expect(location.search).toBe('');
      expect(store.take()).toBeNull();
    },
  );

  it.each(['/', '/solventa-web-pf2/'])(
    'abre la entrada raíz con base %s, conserva el token y retira marcador antes de navegar',
    (base) => {
      history.replaceState(null, '', `${base}?recuperacion=1#token=${token}`);
      const store = new RecoveryLinkService();
      store.capture(location, history, base);
      expect(location.pathname).toBe(`${base}recuperar-contrasena`);
      expect(location.search).toBe('');
      expect(location.hash).toBe('');
      expect(store.take()).toBe(token);
    },
  );

  afterEach(() => history.replaceState(null, '', '/'));
});
