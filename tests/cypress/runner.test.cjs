const { test } = require('node:test');
const assert = require('node:assert/strict');
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
