'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { prepareFrontendArtifact } = require('./prepare-frontend-artifact.cjs');

const revision = 'a'.repeat(40);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'solventa-artifact-test-'));
  t.after(() => rmSync(root, { recursive: true }));
  return { source: join(root, 'compiled'), output: join(root, 'artifacts'), revision };
}

function build({ source }, index = '<html><script src="main.js"></script></html>') {
  mkdirSync(join(source, 'browser', 'assets'), { recursive: true });
  writeFileSync(join(source, 'browser', 'index.html'), index);
  writeFileSync(join(source, 'browser', 'main.js'), 'console.log("compiled");');
  writeFileSync(join(source, 'browser', 'assets', 'es.json'), '{"title":"Solventa"}');
  writeFileSync(join(source, '3rdpartylicenses.txt'), 'Licencias del compilado');
}

test('conserva todos los bytes del compilado con la revisión en nombre y manifiesto', (t) => {
  const options = fixture(t);
  build(options);
  const artifact = prepareFrontendArtifact(options);
  assert.equal(artifact, join(options.output, `frontend-${revision}`));
  assert.deepEqual(JSON.parse(readFileSync(join(artifact, 'revision.json'), 'utf8')), {
    revision,
  });
  for (const file of [
    'browser/index.html',
    'browser/main.js',
    'browser/assets/es.json',
    '3rdpartylicenses.txt',
  ]) {
    assert.deepEqual(readFileSync(join(artifact, file)), readFileSync(join(options.source, file)));
  }
  assert.equal(existsSync(join(options.source, 'revision.json')), false);
});

test('rechaza una revisión abreviada o inválida antes de escribir', (t) => {
  const options = fixture(t);
  build(options);
  for (const invalid of ['abc1234', '../other', '', null]) {
    assert.throws(() => prepareFrontendArtifact({ ...options, revision: invalid }), /SHA completo/);
    assert.equal(existsSync(options.output), false);
  }
});

test('no conserva un build ausente o vacío', (t) => {
  const options = fixture(t);
  assert.throws(() => prepareFrontendArtifact(options), /index.html compilado/);
  build(options, '');
  assert.throws(() => prepareFrontendArtifact(options), /index.html compilado/);
  assert.equal(existsSync(options.output), false);
});

test('no reemplaza un artefacto de una ejecución anterior', (t) => {
  const options = fixture(t);
  build(options);
  const artifact = prepareFrontendArtifact(options);
  const original = readFileSync(join(artifact, 'browser', 'main.js'));
  writeFileSync(join(options.source, 'browser', 'main.js'), 'different build');
  assert.throws(() => prepareFrontendArtifact(options), /ya existe/);
  assert.deepEqual(readFileSync(join(artifact, 'browser', 'main.js')), original);
});

test('un compilado inexistente termina el proceso con error para bloquear la entrega', (t) => {
  const options = fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      'require(process.argv[1]).prepareFrontendArtifact(JSON.parse(process.argv[2]))',
      join(__dirname, 'prepare-frontend-artifact.cjs'),
      JSON.stringify(options),
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /index.html compilado/);
  assert.equal(existsSync(options.output), false);
});
