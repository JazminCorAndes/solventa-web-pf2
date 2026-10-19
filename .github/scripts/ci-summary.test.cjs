'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ci = fs
  .readFileSync(path.join(__dirname, '../workflows/ci.yml'), 'utf8')
  .replace(/\r\n/g, '\n');

test('Calidad conserva sus validaciones y publica el resumen sin nuevos checks', () => {
  assert.match(ci, /name: Calidad/);
  for (const command of ['pnpm lint', 'pnpm test:ci', 'pnpm test:pages', 'pnpm build:pages'])
    assert.ok(ci.includes(command));
  assert.ok(ci.includes('--reporters=junit --output-file=reports/unit-tests.xml'));
  assert.ok(ci.includes('CI_STEPS: ${{ toJSON(steps) }}'));
  assert.ok(ci.includes('run: python3 scripts/ci_summary.py'));
  assert.doesNotMatch(ci, /backport_policy:|deploy:|contents: write|deployments: write/);
});

test('backport válido solo ejecuta su política y el resumen, sin repetir trabajo', () => {
  const steps = ci.split('\n      - name: ').slice(1);
  for (const step of steps.slice(2)) {
    if (step.startsWith('Publicar resumen de validación\n'))
      assert.ok(step.includes('if: always()'));
    else assert.ok(step.includes("steps.policy.outputs.skip_tests != 'true'"), step.split('\n')[0]);
  }
});
