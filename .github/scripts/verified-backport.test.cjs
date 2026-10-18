'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPull, automaticBackport } = require('./verified-backport.cjs');
const HEAD = 'a'.repeat(40),
  RELEASE = 'b'.repeat(40),
  BASE = 'c'.repeat(40);

function fixture(t) {
  t.mock.method(global, 'setTimeout', (callback) => {
    callback();
    return 0;
  });
  const repo = { owner: 'JazminCorAndes', repo: 'solventa-web-pf2' },
    full = `${repo.owner}/${repo.repo}`;
  const source = {
    number: 6,
    merged: true,
    merge_commit_sha: RELEASE,
    user: { id: 1 },
    head: { ref: 'release/0.4.0', sha: HEAD, repo: { full_name: full } },
    base: { ref: 'master', repo: { full_name: full } },
    html_url: 'https://github.com/' + full + '/pull/6',
  };
  const pull = {
    number: 7,
    state: 'open',
    draft: false,
    mergeable: true,
    html_url: 'https://github.com/' + full + '/pull/7',
    head: { ref: 'backport/release-pr-6', sha: RELEASE, repo: { full_name: full } },
    base: { ref: 'develop', sha: BASE, repo: { full_name: full } },
    user: { id: 3, type: 'Bot', login: 'backport-app[bot]' },
  };
  const bot = { id: 3, type: 'Bot', login: 'backport-app[bot]' };
  const checks = [
    ['Calidad', 15368],
    ['validate-branch', 15368],
    ['CI / Validación (Jenkins)', 5277435],
  ].map(([name, id], index) => ({
    id: 100 + index,
    name,
    app: { id },
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
  }));
  const reviews = [{ user: { id: 2, type: 'User' }, state: 'APPROVED', commit_id: HEAD }];
  const state = {
    calls: [],
    existing: [pull],
    develop: BASE,
    diverged: false,
    tree: HEAD,
    reads: 0,
    unknownReads: 0,
  };
  const github = {
    rest: {
      pulls: {
        get: async ({ pull_number }) => {
          if (pull_number === 6) return { data: source };
          state.reads++;
          return {
            data: { ...pull, mergeable: state.reads <= state.unknownReads ? null : pull.mergeable },
          };
        },
        list: () => {},
        listReviews: () => {},
        create: async (input) => {
          state.calls.push(['create-pr', input]);
          return { data: pull };
        },
        merge: async (input) => {
          state.calls.push(['merge', input]);
          return { data: { merged: true, sha: 'd'.repeat(40) } };
        },
      },
      users: { getByUsername: async () => ({ data: bot }) },
      issues: {
        addAssignees: async (input) => {
          state.calls.push(['assign', input]);
        },
      },
      checks: { listForRef: () => {} },
      git: {
        getRef: async ({ ref }) => ({
          data: { object: { sha: ref === 'heads/develop' ? state.develop : RELEASE } },
        }),
        createRef: async (input) => {
          state.calls.push(['create-ref', input]);
        },
        getCommit: async ({ commit_sha }) => ({
          data: { tree: { sha: commit_sha === RELEASE ? HEAD : state.tree } },
        }),
      },
      repos: {
        compareCommitsWithBasehead: async ({ basehead }) => ({
          data:
            basehead === `${RELEASE}...${BASE}`
              ? { ahead_by: 0, behind_by: 1, status: 'behind' }
              : {
                  ahead_by: 1,
                  behind_by: state.diverged ? 1 : 0,
                  status: state.diverged ? 'diverged' : 'ahead',
                },
        }),
      },
    },
    paginate: async (method) =>
      method === github.rest.checks.listForRef
        ? checks
        : method === github.rest.pulls.listReviews
          ? reviews
          : state.existing,
  };
  return {
    github,
    repo,
    pull,
    bot,
    source,
    checks,
    reviews,
    state,
    appId: 99,
    appSlug: 'backport-app',
    sourceId: 6,
    context: { repo },
    core: { info: () => {} },
  };
}

test('la App se verifica mediante la identidad real del bot, sin campos opcionales del PR', async (t) => {
  const f = fixture(t);
  assert.equal('performed_via_github_app' in f.pull, false);
  await verifyPull(f);
});

test('una entrega sin GitFlow válido no concede la excepción de backport', async (t) => {
  const f = fixture(t);
  f.checks.splice(1, 1);
  await assert.rejects(verifyPull(f));
});

test('suites repetidas del mismo SHA usan el check más reciente', async (t) => {
  const f = fixture(t);
  f.checks.push({ ...f.checks[1], id: 200 });
  await verifyPull(f);
});

test('un fallo antiguo permite el éxito posterior del mismo check', async (t) => {
  const f = fixture(t);
  f.checks.push({ ...f.checks[1], id: 99, conclusion: 'failure' });
  await verifyPull(f);
});

for (const change of [{ conclusion: 'failure' }, { status: 'in_progress', conclusion: null }]) {
  test(`un éxito antiguo no oculta el check reciente ${change.status || change.conclusion}`, async (t) => {
    const f = fixture(t);
    f.checks.push({ ...f.checks[1], id: 200, ...change });
    await assert.rejects(verifyPull(f));
  });
}

for (const [name, mutate] of [
  [
    'autor humano',
    (f) => {
      f.pull.user.type = 'User';
    },
  ],
  [
    'otra App',
    (f) => {
      f.bot.id = 100;
    },
  ],
  [
    'App sin confirmar',
    (f) => {
      f.bot.type = 'User';
    },
  ],
  [
    'slug de bot distinto',
    (f) => {
      f.bot.login = 'other-app[bot]';
    },
  ],
  [
    'fork',
    (f) => {
      f.pull.head.repo.full_name = 'other/repo';
    },
  ],
  [
    'destino incorrecto',
    (f) => {
      f.pull.base.ref = 'master';
    },
  ],
  [
    'commits adicionales',
    (f) => {
      f.pull.head.sha = HEAD;
    },
  ],
  [
    'base cambió',
    (f) => {
      f.pull.base.sha = HEAD;
    },
  ],
  [
    'draft',
    (f) => {
      f.pull.draft = true;
    },
  ],
  [
    'hotfix no autorizado',
    (f) => {
      f.source.head.ref = 'hotfix/login';
    },
  ],
  [
    'release no integrada',
    (f) => {
      f.source.merged = false;
    },
  ],
  [
    'rama no canónica',
    (f) => {
      f.pull.head.ref = 'backport/release-pr-06';
    },
  ],
  [
    'check fallido',
    (f) => {
      f.checks[0].conclusion = 'failure';
    },
  ],
  [
    'App de check distinta',
    (f) => {
      f.checks[1].app.id = 1;
    },
  ],
  [
    'check obsoleto',
    (f) => {
      f.checks[0].head_sha = BASE;
    },
  ],
  [
    'check duplicado',
    (f) => {
      f.checks.push(f.checks[0]);
    },
  ],
  [
    'sin aprobación',
    (f) => {
      f.reviews.length = 0;
    },
  ],
  [
    'aprobación obsoleta',
    (f) => {
      f.reviews[0].commit_id = BASE;
    },
  ],
  [
    'aprobación descartada',
    (f) => {
      f.reviews[0].state = 'DISMISSED';
    },
  ],
  [
    'autoaprobación',
    (f) => {
      f.reviews[0].user.id = 1;
    },
  ],
  [
    'develop divergente',
    (f) => {
      f.state.diverged = true;
    },
  ],
])
  test(`${name}: no se concede la excepción`, async (t) => {
    const f = fixture(t);
    mutate(f);
    await assert.rejects(verifyPull(f));
    assert.deepEqual(f.state.calls, []);
  });

test('crea rama exacta y PR, conserva asignados y fija el SHA al integrar', async (t) => {
  const f = fixture(t);
  f.state.existing = [];
  await automaticBackport(f);
  assert.deepEqual(
    f.state.calls.map((call) => call[0]),
    ['create-ref', 'create-pr', 'assign', 'merge'],
  );
  const merge = f.state.calls.at(-1)[1];
  assert.equal(merge.sha, RELEASE);
  assert.equal(merge.merge_method, 'merge');
  assert.equal(merge.commit_title.includes('[skip ci]'), false);
  assert.deepEqual(f.state.calls.find((call) => call[0] === 'assign')[1].assignees, ['JUANES545']);
});

test('un PR cerrado no se duplica ni reabre', async (t) => {
  const f = fixture(t);
  f.pull.state = 'closed';
  await automaticBackport(f);
  assert.deepEqual(f.state.calls, []);
});
test('develop ya sincronizado no genera cambios', async (t) => {
  const f = fixture(t);
  f.state.develop = RELEASE;
  await automaticBackport(f);
  assert.deepEqual(f.state.calls, []);
});
test('divergencia detiene la ejecución antes de crear ramas', async (t) => {
  const f = fixture(t);
  f.state.diverged = true;
  await assert.rejects(automaticBackport(f));
  assert.deepEqual(f.state.calls, []);
});
test('mergeabilidad transitoria se vuelve a consultar automáticamente', async (t) => {
  const f = fixture(t);
  f.state.unknownReads = 1;
  await automaticBackport(f);
  assert.equal(f.state.reads, 2);
});
test('mergeabilidad desconocida o conflicto no permite integrar', async (t) => {
  const f = fixture(t);
  f.pull.mergeable = null;
  await assert.rejects(automaticBackport(f));
  assert.equal(f.state.reads, 3);
  assert.deepEqual(f.state.calls, []);
});
test('un error de permisos no se interpreta como ausencia de la rama', async (t) => {
  const f = fixture(t);
  f.state.existing = [];
  f.github.rest.git.createRef = async () => {
    throw Object.assign(new Error('Prohibido'), { status: 403 });
  };
  await assert.rejects(automaticBackport(f), /Prohibido/);
  assert.deepEqual(f.state.calls, []);
});
test('una carrera de base se informa y nunca se revierte a ciegas', async (t) => {
  const f = fixture(t);
  f.state.tree = BASE;
  await assert.rejects(automaticBackport(f), /cambió durante/);
});
