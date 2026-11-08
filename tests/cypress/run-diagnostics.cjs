const { randomUUID } = require('node:crypto');
const files = require('node:fs/promises');
const path = require('node:path');
const { stripVTControlCharacters } = require('node:util');

const runIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function failureCause(phase, error) {
  const message =
    typeof error?.message === 'string'
      ? stripVTControlCharacters(error.message.slice(0, 8192))
      : '';
  if (phase === 'configuration') return 'invalid-configuration';
  if (phase === 'backend-preflight') return 'backend-preflight-failed';
  if (phase === 'port-check')
    return error?.code === 'EADDRINUSE' ? 'port-in-use' : 'port-check-failed';
  if (phase === 'workspace-preparation') return 'workspace-error';
  if (phase === 'angular-start')
    return error?.code === 'MODULE_NOT_FOUND' ? 'angular-module-missing' : 'angular-start-failed';
  if (phase === 'angular-readiness') {
    if (message === 'Angular no respondió en 120s.') return 'angular-readiness-timeout';
    if (message === 'Angular terminó antes de responder.') return 'angular-exited';
    return 'angular-readiness-failed';
  }
  if (phase === 'cypress-run') {
    if (/Your system is missing the dependency: Xvfb/.test(message)) return 'xvfb-missing';
    if (/Xvfb exited with a non zero exit code/.test(message)) return 'xvfb-start-failed';
    if (/Cypress binary is missing|No version of Cypress is installed in:/.test(message))
      return 'cypress-binary-missing';
    if (/binary file does not have executable permissions/.test(message))
      return 'cypress-binary-permissions';
    if (/error while loading shared libraries:/.test(message)) return 'shared-library-missing';
    if (/Cypress verification timed out\./.test(message)) return 'cypress-verification-timeout';
    if (/Cypress verification failed\./.test(message)) return 'cypress-verification-failed';
    if (message === 'Could not find Cypress test run results') return 'cypress-results-missing';
    if (error?.code === 'MODULE_NOT_FOUND') return 'cypress-module-missing';
    return 'cypress-run-error';
  }
  return 'unclassified-error';
}

function createRunDiagnostics(mode, spec) {
  const suppliedId = process.env.CYPRESS_DIAGNOSTIC_RUN_ID;
  const suite = ['ui', 'integrated', 'controlled', 'evidence'].includes(mode) ? mode : 'invalid';
  const record = {
    kind: 'cypress-run-diagnostics',
    schemaVersion: 1,
    runId:
      suppliedId === undefined ? randomUUID() : runIdPattern.test(suppliedId) ? suppliedId : null,
    suite,
    fullSuite: spec === undefined,
    phase: 'configuration',
    outcome: 'running',
    cause: 'none',
    reportsCleared: false,
    tests: null,
    captureFailures:
      suppliedId !== undefined && !runIdPattern.test(suppliedId) ? ['invalid-run-id'] : [],
  };
  // This sibling survives the runner's deletion of the previous suite XML directory.
  const file = path.resolve('reports', 'cypress', `${suite}-run-diagnostics.json`);
  const failedCapture = (cause) => {
    if (!record.captureFailures.includes(cause)) record.captureFailures.push(cause);
  };
  const write = async () => {
    try {
      await files.mkdir(path.dirname(file), { recursive: true });
      await files.writeFile(file, `${JSON.stringify(record)}\n`);
    } catch {
      failedCapture('report-write-failed');
    }
  };
  return {
    start: write,
    async advance(phase) {
      record.phase = phase;
      await write();
    },
    clearedReports() {
      record.reportsCleared = true;
    },
    result(result) {
      record.phase = 'cypress-results';
      const counters = [result?.totalTests, result?.totalPassed, result?.totalFailed];
      if (
        counters.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000000) ||
        result.totalPassed + result.totalFailed > result.totalTests
      ) {
        record.outcome = 'failed';
        record.cause = 'invalid-cypress-result';
        throw new Error('Cypress devolvio contadores de resultado invalidos.');
      }
      record.tests = {
        total: result.totalTests,
        passed: result.totalPassed,
        failed: result.totalFailed,
      };
      record.outcome = result.totalFailed || result.totalTests === 0 ? 'failed' : 'passed';
      record.cause = result.totalFailed
        ? 'tests-failed'
        : result.totalTests === 0
          ? 'no-tests'
          : 'none';
      if (record.outcome === 'passed') record.phase = 'complete';
    },
    fail(error) {
      if (record.outcome !== 'failed') {
        record.outcome = 'failed';
        record.cause = failureCause(record.phase, error);
      }
    },
    async finish() {
      try {
        console.log(JSON.stringify(record));
      } catch {
        failedCapture('report-log-failed');
        try {
          process.stderr.write(`${JSON.stringify(record)}\n`);
        } catch {
          failedCapture('stderr-write-failed');
        }
      }
      await write();
      if (record.captureFailures.includes('report-write-failed')) {
        try {
          process.stderr.write(`${JSON.stringify(record)}\n`);
        } catch {
          failedCapture('stderr-write-failed');
        }
      }
    },
  };
}

module.exports = { createRunDiagnostics };
