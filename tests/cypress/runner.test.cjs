const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { localUrl } = require('./run.cjs');

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
  const invocation = workflow.match(/exec python -m tests\.jmeter\.local_stack[^\n)]+/)?.[0];
  assert.ok(invocation, 'El workflow debe iniciar el helper backend real');
  assert.match(invocation, /(?:^|\s)--encrypted-login(?:\s|$)/);
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
