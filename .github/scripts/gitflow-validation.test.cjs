'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs
  .readFileSync(path.join(__dirname, '../workflows/gitflow-validation.yml'), 'utf8')
  .replace(/\r\n/g, '\n');
const script = workflow
  .split('        run: |\n')[1]
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');
const bash =
  process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';

for (const [head, base, allowed] of [
  ['feature/login', 'develop', true],
  ['backport/release-pr-30', 'develop', true],
  ['release/0.4.0', 'master', true],
  ['hotfix/login', 'master', true],
  ['feature/login', 'master', false],
  ['develop', 'master', false],
  ['master', 'develop', false],
  ['release/0.4.0', 'develop', false],
  ['hotfix/login', 'develop', false],
  ['backport/release-pr-30', 'master', false],
  ['fix/login', 'develop', false],
  ['feature/login', 'other', false],
])
  test(`GitFlow ${head} → ${base}: ${allowed ? 'permite' : 'bloquea'}`, () => {
    const result = spawnSync(bash, ['-c', script], {
      env: { ...process.env, HEAD_REF: head, BASE_REF: base },
      encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, allowed ? 0 : 1, result.stdout + result.stderr);
  });

test('GitFlow se valida de nuevo al editar el PR y no ejecuta código ni usa secretos', () => {
  assert.match(workflow, /types: \[opened, edited, reopened, synchronize\]/);
  assert.match(workflow, /name: validate-branch/);
  assert.ok(workflow.includes('HEAD_REF: ${{ github.head_ref }}'));
  assert.ok(workflow.includes('BASE_REF: ${{ github.base_ref }}'));
  assert.doesNotMatch(workflow, /checkout@|secrets\.|contents: write|pull_request_target/);
});
