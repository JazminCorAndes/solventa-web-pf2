'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const pipeline = readFileSync(join(__dirname, '..', 'Jenkinsfile'), 'utf8');

function block(marker) {
  const start = pipeline.indexOf(marker);
  assert.notEqual(start, -1, `Falta ${marker}`);
  const opening = pipeline.indexOf('{', start);
  let depth = 1;
  for (let index = opening + 1; index < pipeline.length; index++) {
    if (pipeline[index] === '{') depth++;
    if (pipeline[index] === '}' && --depth === 0) {
      return pipeline.slice(opening + 1, index);
    }
  }
  assert.fail(`Bloque incompleto: ${marker}`);
}

test('Jenkins conserva instalación fija y análisis antes de las pruebas', () => {
  assert.match(block("stage('Dependencias')"), /pnpm install --frozen-lockfile/);
  assert.match(block("stage('Herramientas')"), /node scripts\/verify-ci-toolchain\.cjs/);
  assert.match(block("stage('Lint')"), /pnpm lint/);
  assert.match(block("stage('Pruebas y cobertura')"), /pnpm test:coverage/);
});

test('Jenkins exige integración Frontend controlada y su JUnit antes de compilar', () => {
  const stage = block("stage('Pruebas integrales Frontend')");
  assert.match(stage, /sh 'pnpm test:cypress:types'/);
  assert.match(stage, /sh 'pnpm test:cypress:ui'/);
  assert.match(stage, /junit testResults: 'reports\/cypress\/ui\/\*\.xml'/);
  assert.match(stage, /allowEmptyResults: false/);
  assert.doesNotMatch(stage, /returnStatus|catchError|warnError|\|\|\s*true/);
  assert.ok(
    pipeline.indexOf("stage('Pruebas integrales Frontend')") <
      pipeline.indexOf("stage('Compilación')"),
  );
  assert.match(
    block("stage('Pruebas y cobertura')"),
    /node --test scripts\/\*\.test\.cjs tests\/cypress\/runner\.test\.cjs/,
  );
});

test('solo un pipeline exitoso conserva el compilado de su revisión antes de limpiar', () => {
  const success = block('success {');
  assert.match(success, /node scripts\/prepare-frontend-artifact\.cjs/);
  assert.match(success, /archiveArtifacts artifacts: "\$\{artifact\}\/\*\*"/);
  assert.match(success, /allowEmptyArchive: false/);
  assert.match(success, /fingerprint: true/);
  assert.doesNotMatch(success, /returnStatus|catchError|warnError|\|\|\s*true/);
  assert.doesNotMatch(block('always {'), /prepare-frontend-artifact/);
  assert.match(block('cleanup {'), /deleteDir\(\)/);
});
