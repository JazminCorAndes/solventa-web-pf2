const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { localUrl, selectedSpec } = require('./run.cjs');
const config = require('./cypress.config.cjs');
const fs = require('node:fs');

test('selecciona solo un spec sin ampliar su alcance ni mezclar suites', () => {
  assert.equal(
    selectedSpec('integrated', 'catalog.cy.ts'),
    'tests/cypress/integrated/catalog.cy.ts',
  );
  assert.equal(selectedSpec('ui', 'payments.cy.ts'), 'tests/cypress/ui/payments.cy.ts');
  assert.equal(selectedSpec('integrated'), 'tests/cypress/integrated/**/*.cy.ts');
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
