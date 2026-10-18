'use strict';

async function pagesSource({ github, context }) {
  const event = context.payload?.workflow_run;
  if (context.eventName !== 'workflow_run' || !Number.isSafeInteger(event?.id) || event.id < 1)
    throw new Error('Evento de publicación inválido');
  const run = (await github.rest.actions.getWorkflowRun({ ...context.repo, run_id: event.id }))
    .data;
  const workflow = (
    await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: 'ci.yml' })
  ).data;
  if (
    run.id !== event.id ||
    run.workflow_id !== workflow.id ||
    run.name !== 'CI · Validación' ||
    run.event !== 'push' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    run.head_branch !== 'develop' ||
    run.head_repository?.full_name !== `${context.repo.owner}/${context.repo.repo}` ||
    !/^[a-f0-9]{40}$/.test(run.head_sha || '') ||
    run.head_sha !== event.head_sha
  )
    throw new Error('CI de origen no confiable');
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...context.repo,
    run_id: run.id,
    filter: 'latest',
    per_page: 100,
  });
  const quality = jobs.filter((job) => job.name === 'Calidad');
  if (
    quality.length !== 1 ||
    quality[0].status !== 'completed' ||
    quality[0].conclusion !== 'success'
  )
    throw new Error('Calidad no terminó correctamente');
  const develop = (await github.rest.git.getRef({ ...context.repo, ref: 'heads/develop' })).data
    .object.sha;
  if (develop !== run.head_sha) return { publish: false };
  return { publish: true, runId: run.id, sha: run.head_sha };
}

module.exports = { pagesSource };
