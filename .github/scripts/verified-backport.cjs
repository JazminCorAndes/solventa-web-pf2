'use strict';

const stable = 'master';
const checks = [
  ['Calidad', 15368],
  ['validate-branch', 15368],
  ['CI / Validación (Jenkins)', 5277435],
];
const shaPattern = /^[0-9a-f]{40}$/;

async function ancestor(github, repo, base, head) {
  const { data } = await github.rest.repos.compareCommitsWithBasehead({
    ...repo,
    basehead: `${base}...${head}`,
  });
  if (!Number.isSafeInteger(data.ahead_by) || !Number.isSafeInteger(data.behind_by))
    throw new Error('Respuesta de historial incompleta');
  return data.behind_by === 0 && ['ahead', 'identical'].includes(data.status);
}

async function verifySource({ github, repo, number }) {
  const { data: source } = await github.rest.pulls.get({ ...repo, pull_number: number });
  const full = `${repo.owner}/${repo.repo}`;
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    source.number !== number ||
    !source.merged ||
    source.base?.ref !== stable ||
    source.base.repo?.full_name !== full ||
    source.head?.repo?.full_name !== full ||
    !/^release\/.+/.test(source.head?.ref || '') ||
    !shaPattern.test(source.head?.sha || '') ||
    !shaPattern.test(source.merge_commit_sha || '')
  ) {
    throw new Error('El origen no es una release integrada del mismo repositorio');
  }
  const tip = (await github.rest.git.getRef({ ...repo, ref: `heads/${stable}` })).data.object.sha;
  if (!(await ancestor(github, repo, source.merge_commit_sha, tip)))
    throw new Error('La entrega no pertenece a la rama estable');
  const results = await github.paginate(github.rest.checks.listForRef, {
    ...repo,
    ref: source.head.sha,
    filter: 'latest',
    per_page: 100,
  });
  for (const [name, appId] of checks) {
    // GitHub puede devolver varias suites del mismo SHA después de editar el PR.
    const matches = results
      .filter((check) => check.name === name && check.app?.id === appId)
      .sort((a, b) => b.id - a.id);
    if (
      !matches.length ||
      matches.some(
        (check) =>
          !Number.isSafeInteger(check.id) || check.id < 1 || check.head_sha !== source.head.sha,
      ) ||
      new Set(matches.map((check) => check.id)).size !== matches.length ||
      matches[0].status !== 'completed' ||
      matches[0].conclusion !== 'success'
    ) {
      throw new Error(`Falta el check válido de la entrega: ${name}`);
    }
  }
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const latest = new Map();
  for (const review of reviews)
    if (review.state !== 'COMMENTED') latest.set(review.user?.id, review);
  if (
    ![...latest.values()].some(
      (review) =>
        review.state === 'APPROVED' &&
        review.commit_id === source.head.sha &&
        review.user?.type === 'User' &&
        review.user.id !== source.user?.id,
    )
  )
    throw new Error('Falta aprobación humana vigente de la entrega');
  return source;
}

async function verifyPull({ github, repo, pull, appId, appSlug }) {
  if (!Number.isSafeInteger(appId) || appId < 1 || !/^[a-z0-9-]+$/.test(appSlug || ''))
    throw new Error('Identidad de App no configurada');
  const match = /^backport\/release-pr-([1-9][0-9]*)$/.exec(pull.head?.ref || '');
  const number = Number(match?.[1]);
  const full = `${repo.owner}/${repo.repo}`;
  if (
    !Number.isSafeInteger(number) ||
    !number ||
    pull.state !== 'open' ||
    pull.draft ||
    pull.base?.ref !== 'develop' ||
    pull.head.repo?.full_name !== full ||
    pull.base.repo?.full_name !== full ||
    pull.user?.type !== 'Bot' ||
    pull.user.login !== `${appSlug}[bot]` ||
    !Number.isSafeInteger(pull.user.id)
  )
    throw new Error('El PR no pertenece a la App dedicada');
  const bot = (await github.rest.users.getByUsername({ username: `${appSlug}[bot]` })).data;
  if (bot.id !== pull.user.id || bot.type !== 'Bot' || bot.login !== pull.user.login)
    throw new Error('La API no confirma la App autora del PR');
  const source = await verifySource({ github, repo, number });
  const branch = (await github.rest.git.getRef({ ...repo, ref: `heads/${pull.head.ref}` })).data
    .object.sha;
  const develop = (await github.rest.git.getRef({ ...repo, ref: 'heads/develop' })).data.object.sha;
  if (
    pull.head.sha !== source.merge_commit_sha ||
    branch !== source.merge_commit_sha ||
    pull.base.sha !== develop ||
    !(await ancestor(github, repo, develop, branch))
  )
    throw new Error('El backport cambió o develop diverge; requiere revisión manual');
  return source;
}

async function automaticBackport({ github, context, core, sourceId, appId, appSlug }) {
  if (!Number.isSafeInteger(appId) || appId < 1 || !/^[a-z0-9-]+$/.test(appSlug || ''))
    throw new Error('Identidad de App no configurada');
  const repo = context.repo;
  const source = await verifySource({ github, repo, number: sourceId });
  const branch = `backport/release-pr-${source.number}`;
  const existing = await github.paginate(github.rest.pulls.list, {
    ...repo,
    head: `${repo.owner}:${branch}`,
    base: 'develop',
    state: 'all',
    per_page: 100,
  });
  if (existing.some((pull) => pull.state === 'closed'))
    return core.info('Backport cerrado: no se duplica ni reabre');
  if (existing.length > 1) throw new Error('Hay varios backports para la misma entrega');
  const develop = (await github.rest.git.getRef({ ...repo, ref: 'heads/develop' })).data.object.sha;
  if (await ancestor(github, repo, source.merge_commit_sha, develop))
    return core.info('Develop ya contiene la entrega');
  if (!(await ancestor(github, repo, develop, source.merge_commit_sha)))
    throw new Error('Develop diverge; se conserva la revisión manual');
  let pull = existing[0];
  if (!pull) {
    try {
      await github.rest.git.createRef({
        ...repo,
        ref: `refs/heads/${branch}`,
        sha: source.merge_commit_sha,
      });
    } catch (error) {
      if (error.status !== 422) throw error;
      const current = (await github.rest.git.getRef({ ...repo, ref: `heads/${branch}` })).data
        .object.sha;
      if (current !== source.merge_commit_sha)
        throw new Error('No se sobrescribe una rama existente diferente');
    }
    pull = (
      await github.rest.pulls.create({
        ...repo,
        head: branch,
        base: 'develop',
        title: `Sincroniza ${source.head.ref} con develop`,
        body: `Sincroniza la entrega aprobada ${source.html_url}.\n\nSHA integrado: \`${source.merge_commit_sha}\`.`,
        draft: false,
      })
    ).data;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    pull = (await github.rest.pulls.get({ ...repo, pull_number: pull.number })).data;
    if (pull.mergeable !== null || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (pull.mergeable !== true)
    throw new Error('Conflicto o mergeabilidad sin confirmar; no se integra');
  await verifyPull({ github, repo, pull, appId, appSlug });
  await github.rest.issues.addAssignees({
    ...repo,
    issue_number: pull.number,
    assignees: ['JUANES545'],
  });
  const merged = (
    await github.rest.pulls.merge({
      ...repo,
      pull_number: pull.number,
      sha: source.merge_commit_sha,
      merge_method: 'merge',
      commit_title: `Sincroniza la entrega del PR #${source.number} con develop`,
      commit_message: `Sincronización exacta desde ${source.html_url}.`,
    })
  ).data;
  if (!merged.merged) throw new Error('GitHub no confirmó la integración');
  const releaseCommit = (
    await github.rest.git.getCommit({ ...repo, commit_sha: source.merge_commit_sha })
  ).data;
  const mergeCommit = (await github.rest.git.getCommit({ ...repo, commit_sha: merged.sha })).data;
  // La API fija el head, no el base: una carrera debe quedar visible, nunca revertirse a ciegas.
  if (releaseCommit.tree.sha !== mergeCommit.tree.sha)
    throw new Error('Develop cambió durante la integración; revisar el resultado');
  core.info(`Backport integrado: ${pull.html_url}`);
}

module.exports = { verifySource, verifyPull, automaticBackport };
