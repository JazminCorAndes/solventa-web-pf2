const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { localUrl, selectedSpec, hu44Fixture } = require('./run.cjs');
const config = require('./cypress.config.cjs');
const fs = require('node:fs');

test('selecciona solo un spec sin ampliar su alcance ni mezclar suites', () => {
  assert.equal(
    selectedSpec('integrated', 'catalog.cy.ts'),
    'tests/cypress/integrated/catalog.cy.ts',
  );
  assert.equal(selectedSpec('ui', 'payments.cy.ts'), 'tests/cypress/ui/payments.cy.ts');
  assert.equal(selectedSpec('integrated'), 'tests/cypress/integrated/**/*.cy.ts');
  assert.equal(
    selectedSpec('controlled', 'open-finance-review.cy.ts'),
    'tests/cypress/controlled/open-finance-review.cy.ts',
  );
  assert.throws(() => selectedSpec('controlled'), /exige seleccionar/);
  assert.throws(() => selectedSpec('controlled', 'catalog.cy.ts'), /exige seleccionar/);
  for (const file of [
    '',
    '*.cy.ts',
    '../ui/payments.cy.ts',
    '..\\ui\\payments.cy.ts',
    'catalog.cy.ts,journeys.cy.ts',
    'C:\\catalog.cy.ts',
  ]) {
    assert.throws(() => selectedSpec('integrated', file), /un solo archivo/);
  }
  assert.throws(() => selectedSpec('../ui', 'catalog.cy.ts'), /ui\|integrated/);
});

test('HU44 valida procedencia, contrato, huellas y credenciales sin iniciar servicios', (t) => {
  const { createHash } = require('node:crypto');
  const { tmpdir } = require('node:os');
  const paths = {
    status: join(tmpdir(), 'hu44-test-status.json'),
    fixture: join(tmpdir(), 'hu44-test-fixture.json'),
    credentials: join(tmpdir(), 'hu44-test-credentials.json'),
  };
  const settings = {
    CYPRESS_DISPOSABLE_BACKEND: '1',
    CYPRESS_BACKEND_URL: 'http://127.0.0.1:5000',
    CYPRESS_HU44_STATUS_FILE: paths.status,
    CYPRESS_HU44_FIXTURE_FILE: paths.fixture,
    CYPRESS_HU44_RUN_ID: 'a'.repeat(32),
  };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const fixture = {
    run_id: settings.CYPRESS_HU44_RUN_ID,
    socioId: 'HU44-TEST',
    productoId: 'mortgage-life',
    finalidad: 'cotizacion',
    datosSolicitados: ['indicador_riesgo'],
    actors: {
      socio: { id: '11111111-1111-4111-8111-111111111111', rol: 'socio' },
      asesor: { id: '22222222-2222-4222-8222-222222222222', rol: 'asesor' },
    },
    clients: ['completada', 'detenida', 'bloqueada'].map((expectedOutcome, index) => ({
      clienteId: `33333333-3333-4333-8333-33333333333${index}`,
      tipoDocumento: 'passport',
      numeroDocumento: `TEST000${index}`,
      expectedOutcome,
    })),
  };
  const spec = Buffer.from('synthetic spec bytes\r\n');
  const status = {
    state: 'ready',
    run_id: fixture.run_id,
    sha: 'd0a3145918c019b1cfb347faa1a8d0d5d05dac8d',
    web_sha: 'b'.repeat(40),
    spec_sha256: createHash('sha256').update(spec).digest('hex'),
    readiness_completed_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    urls: { web: settings.CYPRESS_BACKEND_URL, identity: 'http://127.0.0.1:5002' },
    credentials_file: paths.credentials,
    permanent_wiring_verified: true,
    automatic_recovery_enabled: false,
    delivery_fault: { enabled: true, consumed: false },
    fixture,
  };
  const credentials = {
    run_id: fixture.run_id,
    password: 'unit-test-only-not-a-credential',
    actors: {
      socio: { email: 'socio@example.invalid' },
      asesor: { email: 'asesor@example.invalid' },
    },
  };
  t.mock.method(fs, 'readFileSync', (file) => {
    if (file === paths.status) return JSON.stringify(status);
    if (file === paths.fixture) return JSON.stringify(fixture);
    if (file === paths.credentials) return JSON.stringify(credentials);
    if (String(file).endsWith('open-finance-review.cy.ts')) return spec;
    throw new Error('Unexpected fixture read.');
  });
  let dirty = false;
  t.mock.method(require('node:child_process'), 'spawnSync', (_command, args) => ({
    status: 0,
    stdout: args[0] === 'rev-parse' ? 'b'.repeat(40) : dirty ? ' M source.ts' : '',
  }));
  assert.deepEqual(hu44Fixture().fixture, fixture);
  assert.equal('credentials' in hu44Fixture(), false);
  assert.deepEqual(hu44Fixture(true).credentials, credentials);
  for (const [key, invalid] of [
    ['sha', '0'.repeat(40)],
    ['web_sha', '0'.repeat(40)],
    ['spec_sha256', '0'.repeat(64)],
    ['expires_at', '2000-01-01T00:00:00Z'],
    ['delivery_fault', { enabled: true, consumed: true }],
    ['state', 'stopped'],
    ['run_id', 'wrong-run'],
  ]) {
    const saved = status[key];
    status[key] = invalid;
    assert.throws(() => hu44Fixture(), /HU44/);
    status[key] = saved;
  }
  dirty = true;
  assert.throws(() => hu44Fixture(), /clean frontend revision/);
  dirty = false;
  credentials.run_id = 'wrong-run';
  assert.throws(
    () => hu44Fixture(true),
    /^Error: HU44 private credentials do not match the owned run\.$/,
  );
});

test('solo registra la preparación de clientes en la suite integrada', () => {
  let registered = false;
  config.e2e.setupNodeEvents(
    () => {
      registered = true;
    },
    { env: { suite: 'ui' } },
  );
  assert.equal(registered, false);
});

test('prepara clientes solo en el mismo backend desechable y no expone errores con datos', async (t) => {
  const previous = {
    disposable: process.env.CYPRESS_DISPOSABLE_BACKEND,
    backend: process.env.CYPRESS_BACKEND_URL,
  };
  t.after(() => {
    for (const [name, value] of Object.entries({
      CYPRESS_DISPOSABLE_BACKEND: previous.disposable,
      CYPRESS_BACKEND_URL: previous.backend,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  let tasks;
  config.e2e.setupNodeEvents(
    (event, handlers) => {
      assert.equal(event, 'task');
      tasks = handlers;
    },
    { env: { suite: 'integrated' } },
  );
  delete process.env.CYPRESS_DISPOSABLE_BACKEND;
  await assert.rejects(tasks.registerCustomer({}), /requires a disposable/);
  process.env.CYPRESS_DISPOSABLE_BACKEND = '1';
  process.env.CYPRESS_BACKEND_URL = 'http://127.0.0.1:5000';
  let manifest = { identityUrl: 'https://example.com', webUrl: 'http://127.0.0.1:5000' };
  t.mock.method(fs, 'readFileSync', () => JSON.stringify(manifest));
  await assert.rejects(tasks.registerCustomer({}), /local desechable/);
  manifest = { identityUrl: 'http://127.0.0.1:5002', webUrl: 'http://127.0.0.1:5001' };
  await assert.rejects(tasks.registerCustomer({}), /same disposable backend/);
  manifest.webUrl = 'http://127.0.0.1:5000';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:5002/v1/usuarios');
    assert.equal(options.redirect, 'error');
    return { status: 201, json: async () => ({ usuario: { id: 'customer-id' } }) };
  });
  assert.deepEqual(await tasks.registerCustomer({ nombre: 'Cliente Sintetico' }), {
    id: 'customer-id',
  });
  fetchMock.mock.mockImplementation(async () => ({ status: 400 }));
  await assert.rejects(tasks.registerCustomer({}), /^Error: Disposable customer setup: HTTP 400$/);
  fetchMock.mock.mockImplementation(async () => {
    throw new Error('sensitive transport details');
  });
  await assert.rejects(
    tasks.registerCustomer({}),
    /^Error: Disposable customer setup transport failed\.$/,
  );
});

test('solo permite backend HTTP local, sin credenciales ni rutas', () => {
  assert.equal(localUrl('http://127.0.0.1:5000'), 'http://127.0.0.1:5000');
  assert.equal(localUrl('http://localhost:5000'), 'http://localhost:5000');
  for (const target of [
    'https://example.com',
    'http://example.com',
    'http://127.0.0.1.example.com',
    'http://user:password@localhost:5000',
    'http://localhost:5000/api',
    'http://localhost:5000/?target=production',
    'http://localhost:5000/#production',
  ]) {
    assert.throws(() => localUrl(target), /local desechable/);
  }
});

test('el workflow integrado inicia el backend con login cifrado habilitado', () => {
  const workflow = readFileSync(
    join(__dirname, '..', '..', '.github', 'workflows', 'cypress-integrated.yml'),
    'utf8',
  );
  const invocation = workflow.match(/python tests\/cypress\/partner_backend\.py[^\n>]+/)?.[0];
  assert.ok(invocation, 'El workflow debe iniciar el helper backend real');
  const helper = readFileSync(join(__dirname, 'partner_backend.py'), 'utf8');
  assert.match(helper, /from tests\.jmeter\.local_stack import LocalStack/);
  assert.match(helper, /encrypted_login_enabled=True/);
  assert.match(helper, /TemporaryDirectory/);
  assert.match(helper, /CYPRESS_DISPOSABLE_BACKEND/);
});

test('el workflow integrado obtiene el backend publico sin credenciales persistentes', () => {
  const workflow = readFileSync(
    join(__dirname, '..', '..', '.github', 'workflows', 'cypress-integrated.yml'),
    'utf8',
  );
  assert.match(workflow, /repository: Migue765\/backend-solventa/);
  assert.match(workflow, /BACKEND_REVISION: [a-f0-9]{40}(?:\r?\n|$)/);
  assert.doesNotMatch(workflow, /ssh-key:|SOLVENTA_BACKEND_SSH_KEY/);
});
