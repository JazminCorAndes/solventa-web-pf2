'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pagesSource } = require('./pages-source.cjs');
const SHA = 'a'.repeat(40);

function fixture() {
  const context = {
    eventName: 'workflow_run',
    repo: { owner: 'owner', repo: 'web' },
    payload: { workflow_run: { id: 10, head_sha: SHA } },
  };
  const run = {
    id: 10,
    workflow_id: 1,
    name: 'CI · Validación',
    event: 'push',
    head_branch: 'master',
    head_sha: SHA,
    head_repository: { full_name: 'owner/web' },
    status: 'completed',
    conclusion: 'success',
  };
  const jobs = [{ name: 'Calidad', status: 'completed', conclusion: 'success' }];
  const state = { tip: SHA };
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async () => ({ data: run }),
        getWorkflow: async () => ({ data: { id: 1 } }),
        listJobsForWorkflowRun: () => {},
      },
      git: {
        getRef: async ({ ref }) => {
          assert.equal(ref, 'heads/master');
          return { data: { object: { sha: state.tip } } };
        },
      },
    },
    paginate: async () => jobs,
  };
  return { context, github, run, jobs, state };
}

test('Pages selecciona la ejecución exacta de CI, no otra compilación', async () => {
  assert.deepEqual(await pagesSource(fixture()), { publish: true, runId: 10, sha: SHA });
});
test('CD puede ejecutarse desde develop pero publica únicamente el SHA validado de master', async () => {
  const f = fixture();
  f.context.ref = 'refs/heads/develop';
  f.context.sha = 'b'.repeat(40);
  assert.deepEqual(await pagesSource(f), { publish: true, runId: 10, sha: SHA });
});
for (const [name, mutate] of [
  [
    'evento de PR',
    (f) => {
      f.run.event = 'pull_request';
    },
  ],
  [
    'evento manual',
    (f) => {
      f.context.eventName = 'workflow_dispatch';
    },
  ],
  [
    'fork',
    (f) => {
      f.run.head_repository.full_name = 'fork/web';
    },
  ],
  [
    'rama develop',
    (f) => {
      f.run.head_branch = 'develop';
    },
  ],
  [
    'CI fallido',
    (f) => {
      f.run.conclusion = 'failure';
    },
  ],
  [
    'CI incompleto',
    (f) => {
      f.run.status = 'in_progress';
    },
  ],
  [
    'otro workflow',
    (f) => {
      f.run.workflow_id = 2;
    },
  ],
  [
    'CI anterior a la separación',
    (f) => {
      f.run.name = 'CI · Actions';
    },
  ],
  [
    'SHA distinto',
    (f) => {
      f.run.head_sha = 'b'.repeat(40);
    },
  ],
  [
    'Calidad omitida',
    (f) => {
      f.jobs[0].conclusion = 'skipped';
    },
  ],
  [
    'Calidad ausente',
    (f) => {
      f.jobs.length = 0;
    },
  ],
  [
    'Calidad duplicada',
    (f) => {
      f.jobs.push(f.jobs[0]);
    },
  ],
])
  test(`${name} no autoriza publicar`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(pagesSource(f));
  });
test('una ejecución obsoleta se omite antes de crear un deployment', async () => {
  const f = fixture();
  f.state.tip = 'b'.repeat(40);
  assert.deepEqual(await pagesSource(f), { publish: false });
});

test('CI y CD permanecen separados y no se recompila el sitio al publicar', () => {
  const root = path.join(__dirname, '../workflows');
  const ci = fs.readFileSync(path.join(root, 'ci.yml'), 'utf8');
  const cd = fs.readFileSync(path.join(root, 'pages.yml'), 'utf8');
  assert.match(ci, /^name: CI · Validación/m);
  assert.doesNotMatch(ci, /pages: write|id-token: write|deploy-pages|backport_policy:/);
  assert.match(ci, /actions\/upload-pages-artifact@/);
  assert.match(cd, /workflows: \['CI · Validación'\]/);
  assert.match(cd, /branches: \[master\]/);
  assert.ok(ci.includes("github.event_name == 'push' && github.ref == 'refs/heads/master'"));
  assert.ok(cd.includes('run-id: ${{ needs.prepare.outputs.run_id }}'));
  assert.match(cd, /path: pages\/artifact\.tar/);
  assert.doesNotMatch(cd, /pnpm|npm|build:pages|tar -x/);
  assert.ok(cd.includes('name: github-pages'));
  assert.ok(cd.includes("if: needs.prepare.outputs.publish == 'true'"));
});

test('la excepción de backport no ejecuta código del PR y el resto conserva CI normal', () => {
  const ci = fs
    .readFileSync(path.join(__dirname, '../workflows/ci.yml'), 'utf8')
    .replace(/\r\n/g, '\n');
  const steps = ci.split('\n      - name: ').slice(1);
  for (const step of steps.slice(0, 2)) {
    assert.ok(step.includes("vars.BACKPORT_AUTOMATION_ENABLED == 'true'"));
    assert.ok(step.includes("startsWith(github.head_ref, 'backport/release-pr-')"));
  }
  assert.ok(steps[0].includes('ref: ${{ github.event.pull_request.base.sha }}'));
  for (const step of steps.slice(2)) {
    if (step.startsWith('Publicar resumen de validación\n'))
      assert.ok(step.includes('if: always()'));
    else assert.ok(step.includes("steps.policy.outputs.skip_tests != 'true'"), step.split('\n')[0]);
  }
  assert.ok(ci.includes('node --test .github/scripts/*.test.cjs'));
});

test('el backport usa el slug autenticado por la creación del token, no solo una variable', () => {
  const automation = fs.readFileSync(
    path.join(__dirname, '../workflows/automatic-backport.yml'),
    'utf8',
  );
  assert.ok(automation.includes('APP_SLUG: ${{ steps.app.outputs.app-slug }}'));
  assert.ok(automation.includes('process.env.APP_SLUG !== process.env.EXPECTED_APP_SLUG'));
});
