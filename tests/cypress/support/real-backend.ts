export interface Account {
  email: string;
  password: string;
}
export interface Grant {
  accessToken: string;
  refreshToken: string;
  usuario: { id: string };
}
export interface Dashboard {
  cotizaciones: { id: string; solicitudId: string; productoId: string }[];
  suscripciones: { id: string; solicitudId: string; saga: { estado: string } }[];
  pagos: {
    id: string;
    solicitudId: string;
    suscripcionId: string;
    simulada: boolean;
    importe: { monto: string; moneda: string };
  }[];
  polizas: { id: string; suscripcionId: string; simulada: boolean; tipo: string }[];
}

export function register(): Cypress.Chainable<Account> {
  const id = crypto.randomUUID();
  const account = { email: `cypress-${id}@example.com`, password: `E2e-${id}!` };
  return request({
    method: 'POST',
    url: '/api/v1/usuarios',
    body: {
      nombre: 'Cliente Sintetico Cypress',
      correo: account.email,
      contrasena: account.password,
    },
  }).then((response) => {
    expect(response.status, 'registro sintetico real').to.eq(201);
    return account;
  });
}

export function api<T>(token: string, method: string, path: string, body?: object, key?: string) {
  return request<T>({
    method,
    url: `/api/v1/${path}`,
    body,
    headers: { Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) },
  }).then((response) => {
    expect(response.status, `${method} ${path}`).to.be.within(200, 299);
    return response;
  });
}

interface RequestOptions {
  method?: string;
  url: string;
  body?: object;
  headers?: Record<string, string>;
}

// cy.request can print the original request (including secrets) on transport failure.
// Fetch errors report only method/path, never headers, credentials or response bodies.
export function request<T = Record<string, unknown>>(options: RequestOptions) {
  return cy.then({ timeout: 20000 }, async () => {
    const url = new URL(options.url, Cypress.config('baseUrl')!);
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    }).catch(() => {
      throw new Error(`Fallo de transporte local: ${options.method ?? 'GET'} ${url.pathname}`);
    });
    const body: T = await response.json();
    return { status: response.status, body };
  });
}

export function observeLogin() {
  cy.intercept('POST', '/api/v1/sesiones').as('realLogin');
}

export function tokenFromLogin(): Cypress.Chainable<string> {
  return cy.wait<unknown, Grant>('@realLogin', { log: false }).then(({ response }) => {
    expect(response?.statusCode, 'login real').to.eq(200);
    return response!.body.accessToken;
  });
}

/** Poll the real persisted dashboard, never fabricate policy/payment state. */
export function awaitIssued(token: string, requestId: string): Cypress.Chainable<Dashboard> {
  return cy.window({ log: false }).then({ timeout: 65000 }, (win) => {
    const deadline = Date.now() + 60000;
    let interval = 100;
    const poll = async (): Promise<Dashboard> => {
      const response = await win.fetch('/api/v1/clientes/me/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Dashboard real: HTTP ${response.status}`);
      const dashboard: Dashboard = await response.json();
      if (!Array.isArray(dashboard.polizas))
        throw new Error('Emision academica no habilitada en backend.');
      const subscription = dashboard.suscripciones.find((item) => item.solicitudId === requestId);
      if (
        subscription?.saga.estado === 'emitida' &&
        dashboard.polizas.some((policy) => policy.suscripcionId === subscription.id)
      )
        return dashboard;
      if (Date.now() >= deadline) throw new Error('No se recupero emision persistida en 60s.');
      // Bounded state polling, not an unconditional UI synchronization sleep.
      await new Promise((resolve) => win.setTimeout(resolve, interval));
      interval = Math.min(interval * 2, 1000);
      return poll();
    };
    return poll();
  });
}
