const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { localUrl, selectedSpec, hu44Fixture, main } = require('./run.cjs');
const config = require('./cypress.config.cjs');
const fs = require('node:fs');

function offlineRunner(t, run, options = {}) {
  const { EventEmitter } = require('node:events');
  const files = require('node:fs/promises');
  const childProcess = require('node:child_process');
  const server = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 12345,
    exitCode: null,
  });
  const logs = [];
  const written = new Map();
  const removed = [];
  let stopCalls = 0;
  let runLogAttempted = false;
  const previous = {
    argv: process.argv,
    exitCode: process.exitCode,
    env: {
      CYPRESS_BACKEND_URL: process.env.CYPRESS_BACKEND_URL,
      CYPRESS_WEB_PORT: process.env.CYPRESS_WEB_PORT,
      ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
      CYPRESS_DIAGNOSTIC_RUN_ID: process.env.CYPRESS_DIAGNOSTIC_RUN_ID,
      CYPRESS_DISPOSABLE_BACKEND: process.env.CYPRESS_DISPOSABLE_BACKEND,
    },
    sigint: process.listenerCount('SIGINT'),
    sigterm: process.listenerCount('SIGTERM'),
  };
  process.argv = ['node', 'run.cjs', 'ui', 'catalog.cy.ts'];
  if (options.fullSuite) process.argv.pop();
  process.env.CYPRESS_BACKEND_URL = 'http://127.0.0.1:5000';
  process.env.CYPRESS_WEB_PORT = '63321';
  if (options.runId !== undefined) process.env.CYPRESS_DIAGNOSTIC_RUN_ID = options.runId;
  process.exitCode = 0;
  t.after(() => {
    process.argv = previous.argv;
    process.exitCode = previous.exitCode;
    for (const key of [
      'CYPRESS_BACKEND_URL',
      'CYPRESS_WEB_PORT',
      'ELECTRON_RUN_AS_NODE',
      'CYPRESS_DIAGNOSTIC_RUN_ID',
      'CYPRESS_DISPOSABLE_BACKEND',
    ]) {
      if (previous.env[key] === undefined) delete process.env[key];
      else process.env[key] = previous.env[key];
    }
    assert.equal(process.listenerCount('SIGINT'), previous.sigint);
    assert.equal(process.listenerCount('SIGTERM'), previous.sigterm);
  });
  t.mock.method(console, 'log', (line) => {
    if (options.logFails && line.startsWith('{"phase":"angular-diagnostics"')) {
      throw new Error('private log details');
    }
    if (line.startsWith('{"kind":"cypress-run-diagnostics"')) {
      runLogAttempted = true;
      if (options.runLogFails) throw new Error('private run log details');
    }
    logs.push(line);
  });
  t.mock.method(console, 'error', (line) => logs.push(line));
  if (options.runLogFails) {
    t.mock.method(process.stderr, 'write', (line) => {
      if (options.runStderrFails) throw new Error('private stderr details');
      logs.push(line);
      return true;
    });
  }
  t.mock.method(files, 'access', async () => {});
  t.mock.method(files, 'mkdir', async () => {});
  t.mock.method(files, 'writeFile', async (file, content) => {
    if (options.writeFails && file.endsWith('angular-diagnostics.json')) {
      throw new Error('private storage details');
    }
    if (
      file.endsWith('ui-run-diagnostics.json') &&
      (options.runWriteFails || (options.runWriteFailsAfterLog && runLogAttempted))
    ) {
      throw new Error('private run storage details');
    }
    written.set(file, content);
  });
  t.mock.method(files, 'rm', async (file) => {
    removed.push(file);
    if (options.reportsCleanupFails && !file.endsWith('.json')) {
      throw new Error('private report cleanup details');
    }
    if (options.cleanupFails && file.endsWith(`proxy-${process.pid}.json`)) {
      throw new Error('private cleanup details');
    }
  });
  t.mock.method(require('node:net'), 'createServer', () =>
    Object.assign(new EventEmitter(), {
      listen(_port, _host, callback) {
        if (options.portError) {
          this.emit('error', options.portError);
          return;
        }
        callback();
      },
      close(callback) {
        callback();
      },
    }),
  );
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true }));
  t.mock.method(childProcess, 'spawn', () => {
    if (options.startupExit !== undefined) {
      server.exitCode = options.startupExit;
      queueMicrotask(() => {
        server.stderr.emit('data', 'Error: EACCES private startup details');
        server.emit('close', options.startupExit);
      });
    }
    return server;
  });
  const stop = () => {
    stopCalls++;
    queueMicrotask(() => {
      options.finalOutput?.(server);
      server.exitCode = 0;
      server.emit('close', 0);
    });
    if (options.stopFails) throw new Error('private stop details');
    return { status: 0 };
  };
  t.mock.method(childProcess, 'spawnSync', stop);
  t.mock.method(process, 'kill', stop);
  t.mock.method(require('cypress'), 'run', async () => {
    assert.equal(fetchMock.mock.callCount(), 1, 'Only the mocked readiness check runs.');
    assert.ok(logs.some((line) => line.startsWith('Angular Cypress listo:')));
    await run(server);
    if (options.cypressResult) return options.cypressResult;
    return {
      status: 'finished',
      totalTests: 1,
      totalFailed: options.passes ? 0 : 1,
      totalPassed: options.passes ? 1 : 0,
    };
  });
  return {
    server,
    logs,
    written,
    removed,
    stopCalls: () => stopCalls,
    report: () =>
      JSON.parse(logs.find((line) => line.startsWith('{"phase":"angular-diagnostics"'))),
    runReport: () =>
      JSON.parse(logs.find((line) => line.startsWith('{"kind":"cypress-run-diagnostics"'))),
  };
}

test('clasifica fallos de arranque Cypress sin exportar mensajes ni alterar el fallo', async (t) => {
  for (const [message, cause] of [
    ['Your system is missing the dependency: Xvfb', 'xvfb-missing'],
    ['Xvfb exited with a non zero exit code.', 'xvfb-start-failed'],
    [
      'The cypress npm package is installed, but the Cypress binary is missing.',
      'cypress-binary-missing',
    ],
    ['No version of Cypress is installed in: private-directory', 'cypress-binary-missing'],
    [
      'Cypress cannot run because this binary file does not have executable permissions here:',
      'cypress-binary-permissions',
    ],
    ['error while loading shared libraries: private-library', 'shared-library-missing'],
    ['Cypress verification timed out.', 'cypress-verification-timeout'],
    ['Cypress verification failed.', 'cypress-verification-failed'],
    ['Cypress failed to start. This may be due to a missing library.', 'cypress-run-error'],
    ['unknown failure', 'cypress-run-error'],
  ]) {
    await t.test(cause + ': ' + message.slice(0, 20), async (t) => {
      const original = new Error(`${message}\nAuthorization: private-token\nprivate-body`);
      const harness = offlineRunner(t, () => {
        throw original;
      });
      await assert.rejects(main(), (error) => error === original);
      const report = harness.runReport();
      assert.equal(report.phase, 'cypress-run');
      assert.equal(report.fullSuite, false);
      assert.equal(report.outcome, 'failed');
      assert.equal(report.cause, cause);
      assert.equal(report.reportsCleared, true);
      assert.equal(report.tests, null);
      assert.deepEqual(report.captureFailures, []);
      assert.equal(harness.stopCalls(), 1);
      assert.ok(harness.removed.some((file) => file.endsWith(`proxy-${process.pid}.json`)));
      assert.equal(
        [...harness.written.keys()].some((file) => file.endsWith('.xml')),
        false,
      );
      assert.doesNotMatch(
        JSON.stringify([...harness.logs, ...harness.written.values()]),
        /private/,
      );
    });
  }
});

test('registra resultado ausente del SDK sin convertirlo en cero pruebas aprobadas', async (t) => {
  const harness = offlineRunner(t, () => {}, {
    cypressResult: {
      status: 'failed',
      failures: 1,
      message: 'Could not find Cypress test run results',
    },
  });
  await assert.rejects(main(), /Could not find Cypress test run results/);
  assert.equal(harness.runReport().cause, 'cypress-results-missing');
  assert.equal(harness.runReport().tests, null);
  assert.equal(harness.stopCalls(), 1);
});

test('distingue puerto ocupado antes de retirar XML previos o iniciar procesos', async (t) => {
  const original = Object.assign(new Error('private address'), { code: 'EADDRINUSE' });
  const harness = offlineRunner(t, () => assert.fail('Cypress must not start'), {
    portError: original,
  });
  await assert.rejects(main(), (error) => error === original);
  assert.equal(harness.runReport().phase, 'port-check');
  assert.equal(harness.runReport().cause, 'port-in-use');
  assert.equal(harness.runReport().reportsCleared, false);
  assert.equal(harness.stopCalls(), 0);
  assert.deepEqual(harness.removed, []);
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
});

test('rechaza contadores invalidos sin inventar un resultado correcto', async (t) => {
  const harness = offlineRunner(t, () => {}, { cypressResult: { status: 'finished' } });
  await assert.rejects(main(), /contadores de resultado invalidos/);
  assert.equal(harness.runReport().cause, 'invalid-cypress-result');
  assert.equal(harness.runReport().tests, null);
  assert.equal(harness.stopCalls(), 1);
});

test('registra configuracion invalida sin abrir puerto ni exponer la URL', async (t) => {
  const harness = offlineRunner(t, () => assert.fail('Cypress must not start'));
  process.env.CYPRESS_BACKEND_URL = 'http://user:private-secret@localhost:5000';
  await assert.rejects(main(), /backend HTTP local desechable/);
  assert.equal(harness.runReport().phase, 'configuration');
  assert.equal(harness.runReport().cause, 'invalid-configuration');
  assert.equal(harness.runReport().reportsCleared, false);
  assert.equal(harness.stopCalls(), 0);
  assert.doesNotMatch(harness.logs.join('\n'), /private-secret/);
});

test('distingue la comprobacion del backend de un error de configuracion', async (t) => {
  const harness = offlineRunner(t, () => assert.fail('Cypress must not start'));
  process.argv[2] = 'integrated';
  process.env.CYPRESS_DISPOSABLE_BACKEND = '1';
  t.mock.method(globalThis, 'fetch', async () => ({ status: 503 }));
  await assert.rejects(main(), /BFF no disponible: HTTP 503/);
  assert.equal(harness.runReport().phase, 'backend-preflight');
  assert.equal(harness.runReport().cause, 'backend-preflight-failed');
  assert.equal(harness.runReport().suite, 'integrated');
  assert.equal(harness.runReport().reportsCleared, false);
  assert.equal(harness.stopCalls(), 0);
});

test('identifica la suite completa que Jenkins puede cotejar con sus XML', async (t) => {
  const harness = offlineRunner(t, () => {}, { passes: true, fullSuite: true });
  await main();
  assert.equal(harness.runReport().fullSuite, true);
  assert.equal(harness.runReport().outcome, 'passed');
  assert.equal(process.exitCode, 0);
});

test('no acredita XML anteriores si falla su retirada', async (t) => {
  const harness = offlineRunner(t, () => assert.fail('Cypress must not start'), {
    reportsCleanupFails: true,
  });
  await assert.rejects(main(), /private report cleanup/);
  assert.equal(harness.runReport().phase, 'workspace-preparation');
  assert.equal(harness.runReport().cause, 'workspace-error');
  assert.equal(harness.runReport().reportsCleared, false);
  assert.equal(harness.stopCalls(), 0);
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
});

test('expone fallos de captura del diagnostico sin reemplazar el error original', async (t) => {
  const original = new Error('private original');
  const harness = offlineRunner(
    t,
    () => {
      throw original;
    },
    {
      runWriteFails: true,
      runLogFails: true,
      runId: 'private-invalid-id',
    },
  );
  await assert.rejects(main(), (error) => error === original);
  assert.equal(harness.runReport().runId, null);
  assert.deepEqual(harness.runReport().captureFailures, [
    'invalid-run-id',
    'report-write-failed',
    'report-log-failed',
  ]);
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
  assert.equal(harness.stopCalls(), 1);
});

test('conserva errores de ambos canales de salida en el archivo saneado', async (t) => {
  const original = new Error('private original');
  const harness = offlineRunner(
    t,
    () => {
      throw original;
    },
    {
      runLogFails: true,
      runStderrFails: true,
    },
  );
  await assert.rejects(main(), (error) => error === original);
  const saved = [...harness.written].find(([file]) => file.endsWith('ui-run-diagnostics.json'));
  const report = JSON.parse(saved[1]);
  assert.deepEqual(report.captureFailures, ['report-log-failed', 'stderr-write-failed']);
  assert.doesNotMatch(saved[1], /private/);
  assert.equal(harness.stopCalls(), 1);
});

test('no deja un archivo de exito si falla el log y luego la escritura final', async (t) => {
  const harness = offlineRunner(t, () => {}, {
    passes: true,
    runLogFails: true,
    runWriteFailsAfterLog: true,
  });
  await main();
  const saved = [...harness.written].find(([file]) => file.endsWith('ui-run-diagnostics.json'));
  assert.equal(JSON.parse(saved[1]).outcome, 'running');
  const fallback = harness.logs.filter((line) =>
    line.startsWith('{"kind":"cypress-run-diagnostics"'),
  );
  assert.deepEqual(JSON.parse(fallback.at(-1)).captureFailures, [
    'report-log-failed',
    'report-write-failed',
  ]);
  assert.equal(process.exitCode, 0, 'Diagnostic failures do not replace the real Cypress exit.');
  assert.equal(harness.stopCalls(), 1);
});

test('distingue resultado aprobado, fallido y vacio con el identificador de esta ejecucion', async (t) => {
  for (const [passed, failed, total, outcome, cause, exitCode] of [
    [1, 0, 1, 'passed', 'none', 0],
    [0, 1, 1, 'failed', 'tests-failed', 1],
    [0, 0, 0, 'failed', 'no-tests', 1],
  ]) {
    await t.test(outcome + cause, async (t) => {
      const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const harness = offlineRunner(t, () => {}, {
        runId,
        cypressResult: {
          status: 'finished',
          totalPassed: passed,
          totalFailed: failed,
          totalTests: total,
        },
      });
      await main();
      const report = harness.runReport();
      assert.equal(process.exitCode, exitCode);
      assert.equal(report.runId, runId);
      assert.equal(report.outcome, outcome);
      assert.equal(report.cause, cause);
      assert.deepEqual(report.tests, { total, passed, failed });
      assert.ok(JSON.stringify(report).length < 4096);
      const saved = [...harness.written].find(([file]) => file.endsWith('ui-run-diagnostics.json'));
      assert.deepEqual(JSON.parse(saved[1]), report);
    });
  }
});

test('reemplaza el diagnostico anterior al inicio aunque aun no existan XML nuevos', async (t) => {
  const files = require('node:fs/promises');
  const { createRunDiagnostics } = require('./run-diagnostics.cjs');
  const previous = process.env.CYPRESS_DIAGNOSTIC_RUN_ID;
  delete process.env.CYPRESS_DIAGNOSTIC_RUN_ID;
  t.after(() => {
    if (previous === undefined) delete process.env.CYPRESS_DIAGNOSTIC_RUN_ID;
    else process.env.CYPRESS_DIAGNOSTIC_RUN_ID = previous;
  });
  let saved;
  t.mock.method(files, 'mkdir', async () => {});
  t.mock.method(files, 'writeFile', async (_file, content) => {
    saved = JSON.parse(content);
  });
  const first = createRunDiagnostics('ui');
  await first.start();
  const previousId = saved.runId;
  await createRunDiagnostics('ui').start();
  assert.notEqual(saved.runId, previousId);
  assert.equal(saved.outcome, 'running');
  assert.equal(saved.phase, 'configuration');
  assert.equal(saved.tests, null);
  assert.equal(saved.reportsCleared, false);
});

test('conserva el error proxy posterior a readiness sin publicar texto privado', async (t) => {
  const secrets = [
    'token-no-exportar',
    'clave-no-exportar',
    'cookie-no-exportar',
    'cuerpo-no-exportar',
  ];
  const harness = offlineRunner(t, (server) => {
    server.stderr.emit(
      'data',
      Buffer.from('\u001b[31mhttp proxy error:\u001b[0m /api?token=token-no-exportar\n'),
    );
    server.stderr.emit('data', Buffer.from('Error: read ECONN'));
    server.stderr.emit('data', Buffer.from('RESET\nAuthorization: Bearer token-no-exportar\n'));
    server.stdout.emit(
      'data',
      'password=clave-no-exportar\nCookie: cookie-no-exportar\n{"body":"cuerpo-no-exportar"}',
    );
  });
  await main();
  assert.equal(process.exitCode, 1);
  const report = harness.report();
  assert.equal(report.readinessReached, true);
  assert.equal(report.httpProxyError, true);
  assert.deepEqual(report.codes, ['ECONNRESET']);
  assert.equal(report.captureComplete, true);
  assert.deepEqual(report.failures, []);
  assert.equal(harness.stopCalls(), 1);
  assert.ok(harness.removed.some((file) => file.endsWith(`proxy-${process.pid}.json`)));
  const saved = [...harness.written].find(([file]) => file.endsWith('angular-diagnostics.json'));
  assert.deepEqual(JSON.parse(saved[1]), report);
  for (const secret of secrets) {
    assert.equal(
      JSON.stringify([...harness.logs, ...harness.written.values()]).includes(secret),
      false,
    );
  }
});

test('espera la salida final de Angular e indica truncamiento sin cambiar exit cero', async (t) => {
  const harness = offlineRunner(t, (server) => server.stdout.emit('data', 'x'.repeat(16000)), {
    passes: true,
    finalOutput: (server) => server.stderr.emit('data', 'Error: connect ECONNREFUSED\n'),
  });
  await main();
  const report = harness.report();
  assert.equal(process.exitCode, 0);
  assert.equal(report.truncated, true);
  assert.equal(report.captureComplete, false);
  assert.equal(report.retainedCharacters, 12000);
  assert.equal(report.droppedCharacters, 4000 + 'Error: connect ECONNREFUSED\n'.length);
  assert.deepEqual(report.codes, ['ECONNREFUSED']);
});

test('informa fallos de lectura, decodificacion y archivo sin perder exit ni limpieza', async (t) => {
  const harness = offlineRunner(
    t,
    (server) => {
      server.stderr.emit('error', new Error('private stream details'));
      server.stdout.emit('data', {});
    },
    { writeFails: true },
  );
  await main();
  assert.equal(process.exitCode, 1);
  assert.equal(harness.stopCalls(), 1);
  assert.deepEqual(harness.report().failures, [
    'stderr-read-failed',
    'stdout-decode-failed',
    'report-write-failed',
  ]);
  assert.equal(harness.report().captureComplete, false);
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
  assert.ok(harness.removed.some((file) => file.endsWith(`proxy-${process.pid}.json`)));
});

test('separa la salida anormal de Angular del resultado original de Cypress', async (t) => {
  const harness = offlineRunner(t, (server) => {
    server.emit('error', new Error('private process details'));
    server.exitCode = 7;
    server.emit('close', 7);
  });
  await main();
  assert.equal(process.exitCode, 1);
  assert.equal(harness.report().angularExitCode, 7);
  assert.deepEqual(harness.report().failures, ['angular-process-error']);
  assert.equal(harness.stopCalls(), 0);
  assert.ok(harness.removed.some((file) => file.endsWith(`proxy-${process.pid}.json`)));
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
});

test('conserva diagnosticos de arranque sin heredar XML previo ni texto libre', async (t) => {
  const harness = offlineRunner(t, () => assert.fail('Cypress must not start'), { startupExit: 7 });
  await assert.rejects(main(), /^Error: Angular terminó antes de responder\.$/);
  assert.equal(harness.report().readinessReached, false);
  assert.equal(harness.report().angularExitCode, 7);
  assert.equal(harness.runReport().phase, 'angular-readiness');
  assert.equal(harness.runReport().cause, 'angular-exited');
  assert.deepEqual(harness.report().codes, ['EACCES']);
  assert.ok(harness.removed[0].endsWith(join('reports', 'cypress', 'ui', 'catalog')));
  assert.ok(harness.removed.some((file) => file.endsWith(`proxy-${process.pid}.json`)));
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
});

test('expone fallos de ambos destinos de captura sin reemplazar el exit de Cypress', async (t) => {
  const harness = offlineRunner(t, () => {}, { logFails: true, writeFails: true });
  await main();
  assert.equal(process.exitCode, 1);
  assert.deepEqual(harness.report().failures, ['report-write-failed', 'report-log-failed']);
  assert.equal(harness.report().captureComplete, false);
  assert.equal(harness.stopCalls(), 1);
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
});

test('preserva el fallo original aunque fallen stop y retirada del proxy', async (t) => {
  const original = new Error('fallo original Cypress');
  const harness = offlineRunner(
    t,
    () => {
      throw original;
    },
    {
      stopFails: true,
      cleanupFails: true,
    },
  );
  await assert.rejects(main(), (error) => error === original);
  assert.deepEqual(harness.report().failures, ['stop-failed', 'proxy-cleanup-failed']);
  assert.equal(harness.stopCalls(), 1);
  assert.ok(harness.removed.some((file) => file.endsWith(`proxy-${process.pid}.json`)));
  assert.doesNotMatch(harness.logs.join('\n'), /private/);
});

test('selecciona solo un spec sin ampliar su alcance ni mezclar suites', () => {
  assert.equal(
    selectedSpec('integrated', 'catalog.cy.ts'),
    'tests/cypress/integrated/catalog.cy.ts',
  );
  assert.equal(selectedSpec('ui', 'payments.cy.ts'), 'tests/cypress/ui/payments.cy.ts');
  assert.equal(selectedSpec('integrated'), 'tests/cypress/integrated/**/*.cy.ts');
  assert.equal(
    selectedSpec('controlled', 'open-finance-review.cy.ts'),
    'tests/cypress/controlled/open-finance-review.cy.ts',
  );
  assert.throws(() => selectedSpec('controlled'), /exige seleccionar/);
  assert.throws(() => selectedSpec('controlled', 'catalog.cy.ts'), /exige seleccionar/);
  for (const file of [
    '',
    '*.cy.ts',
    '../ui/payments.cy.ts',
    '..\\ui\\payments.cy.ts',
    'catalog.cy.ts,journeys.cy.ts',
    'C:\\catalog.cy.ts',
  ]) {
    assert.throws(() => selectedSpec('integrated', file), /un solo archivo/);
  }
  assert.throws(() => selectedSpec('../ui', 'catalog.cy.ts'), /ui\|integrated/);
});

test('HU44 valida procedencia, contrato, huellas y credenciales sin iniciar servicios', (t) => {
  const { createHash } = require('node:crypto');
  const { tmpdir } = require('node:os');
  const paths = {
    status: join(tmpdir(), 'hu44-test-status.json'),
    fixture: join(tmpdir(), 'hu44-test-fixture.json'),
    credentials: join(tmpdir(), 'hu44-test-credentials.json'),
  };
  const settings = {
    CYPRESS_DISPOSABLE_BACKEND: '1',
    CYPRESS_BACKEND_URL: 'http://127.0.0.1:5000',
    CYPRESS_HU44_STATUS_FILE: paths.status,
    CYPRESS_HU44_FIXTURE_FILE: paths.fixture,
    CYPRESS_HU44_RUN_ID: 'a'.repeat(32),
  };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const fixture = {
    run_id: settings.CYPRESS_HU44_RUN_ID,
    socioId: 'HU44-TEST',
    productoId: 'mortgage-life',
    finalidad: 'cotizacion',
    datosSolicitados: ['indicador_riesgo'],
    actors: {
      socio: { id: '11111111-1111-4111-8111-111111111111', rol: 'socio' },
      asesor: { id: '22222222-2222-4222-8222-222222222222', rol: 'asesor' },
    },
    clients: ['completada', 'detenida', 'bloqueada'].map((expectedOutcome, index) => ({
      clienteId: `33333333-3333-4333-8333-33333333333${index}`,
      tipoDocumento: 'passport',
      numeroDocumento: `TEST000${index}`,
      expectedOutcome,
    })),
  };
  const spec = Buffer.from('synthetic spec bytes\r\n');
  const status = {
    state: 'ready',
    run_id: fixture.run_id,
    sha: 'd0a3145918c019b1cfb347faa1a8d0d5d05dac8d',
    web_sha: 'b'.repeat(40),
    spec_sha256: createHash('sha256').update(spec).digest('hex'),
    readiness_completed_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    urls: { web: settings.CYPRESS_BACKEND_URL, identity: 'http://127.0.0.1:5002' },
    credentials_file: paths.credentials,
    permanent_wiring_verified: true,
    automatic_recovery_enabled: false,
    delivery_fault: { enabled: true, consumed: false },
    fixture,
  };
  const credentials = {
    run_id: fixture.run_id,
    password: 'unit-test-only-not-a-credential',
    actors: {
      socio: { email: 'socio@example.invalid' },
      asesor: { email: 'asesor@example.invalid' },
    },
  };
  t.mock.method(fs, 'readFileSync', (file) => {
    if (file === paths.status) return JSON.stringify(status);
    if (file === paths.fixture) return JSON.stringify(fixture);
    if (file === paths.credentials) return JSON.stringify(credentials);
    if (String(file).endsWith('open-finance-review.cy.ts')) return spec;
    throw new Error('Unexpected fixture read.');
  });
  let dirty = false;
  t.mock.method(require('node:child_process'), 'spawnSync', (_command, args) => ({
    status: 0,
    stdout: args[0] === 'rev-parse' ? 'b'.repeat(40) : dirty ? ' M source.ts' : '',
  }));
  assert.deepEqual(hu44Fixture().fixture, fixture);
  assert.equal('credentials' in hu44Fixture(), false);
  assert.deepEqual(hu44Fixture(true).credentials, credentials);
  for (const [key, invalid] of [
    ['sha', '0'.repeat(40)],
    ['web_sha', '0'.repeat(40)],
    ['spec_sha256', '0'.repeat(64)],
    ['expires_at', '2000-01-01T00:00:00Z'],
    ['delivery_fault', { enabled: true, consumed: true }],
    ['state', 'stopped'],
    ['run_id', 'wrong-run'],
  ]) {
    const saved = status[key];
    status[key] = invalid;
    assert.throws(() => hu44Fixture(), /HU44/);
    status[key] = saved;
  }
  dirty = true;
  assert.throws(() => hu44Fixture(), /clean frontend revision/);
  dirty = false;
  credentials.run_id = 'wrong-run';
  assert.throws(
    () => hu44Fixture(true),
    /^Error: HU44 private credentials do not match the owned run\.$/,
  );
});

test('solo registra la preparación de clientes en la suite integrada', () => {
  let registered = false;
  config.e2e.setupNodeEvents(
    () => {
      registered = true;
    },
    { env: { suite: 'ui' } },
  );
  assert.equal(registered, false);
});

test('prepara clientes solo en el mismo backend desechable y no expone errores con datos', async (t) => {
  const previous = {
    disposable: process.env.CYPRESS_DISPOSABLE_BACKEND,
    backend: process.env.CYPRESS_BACKEND_URL,
  };
  t.after(() => {
    for (const [name, value] of Object.entries({
      CYPRESS_DISPOSABLE_BACKEND: previous.disposable,
      CYPRESS_BACKEND_URL: previous.backend,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  let tasks;
  config.e2e.setupNodeEvents(
    (event, handlers) => {
      assert.equal(event, 'task');
      tasks = handlers;
    },
    { env: { suite: 'integrated' } },
  );
  delete process.env.CYPRESS_DISPOSABLE_BACKEND;
  await assert.rejects(tasks.registerCustomer({}), /requires a disposable/);
  process.env.CYPRESS_DISPOSABLE_BACKEND = '1';
  process.env.CYPRESS_BACKEND_URL = 'http://127.0.0.1:5000';
  let manifest = { identityUrl: 'https://example.com', webUrl: 'http://127.0.0.1:5000' };
  t.mock.method(fs, 'readFileSync', () => JSON.stringify(manifest));
  await assert.rejects(tasks.registerCustomer({}), /local desechable/);
  manifest = { identityUrl: 'http://127.0.0.1:5002', webUrl: 'http://127.0.0.1:5001' };
  await assert.rejects(tasks.registerCustomer({}), /same disposable backend/);
  manifest.webUrl = 'http://127.0.0.1:5000';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:5002/v1/usuarios');
    assert.equal(options.redirect, 'error');
    return { status: 201, json: async () => ({ usuario: { id: 'customer-id' } }) };
  });
  assert.deepEqual(await tasks.registerCustomer({ nombre: 'Cliente Sintetico' }), {
    id: 'customer-id',
  });
  fetchMock.mock.mockImplementation(async () => ({ status: 400 }));
  await assert.rejects(tasks.registerCustomer({}), /^Error: Disposable customer setup: HTTP 400$/);
  fetchMock.mock.mockImplementation(async () => {
    throw new Error('sensitive transport details');
  });
  await assert.rejects(
    tasks.registerCustomer({}),
    /^Error: Disposable customer setup transport failed\.$/,
  );
});

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

test('el workflow integrado inicia el backend con login cifrado habilitado', () => {
  const workflow = readFileSync(
    join(__dirname, '..', '..', '.github', 'workflows', 'cypress-integrated.yml'),
    'utf8',
  );
  const invocation = workflow.match(/python tests\/cypress\/partner_backend\.py[^\n>]+/)?.[0];
  assert.ok(invocation, 'El workflow debe iniciar el helper backend real');
  const helper = readFileSync(join(__dirname, 'partner_backend.py'), 'utf8');
  assert.match(helper, /from tests\.jmeter\.local_stack import LocalStack/);
  assert.match(helper, /encrypted_login_enabled=True/);
  assert.match(helper, /TemporaryDirectory/);
  assert.match(helper, /CYPRESS_DISPOSABLE_BACKEND/);
});

test('el workflow integrado obtiene el backend publico sin credenciales persistentes', () => {
  const workflow = readFileSync(
    join(__dirname, '..', '..', '.github', 'workflows', 'cypress-integrated.yml'),
    'utf8',
  );
  assert.match(workflow, /repository: Migue765\/backend-solventa/);
  assert.match(workflow, /BACKEND_REVISION: [a-f0-9]{40}(?:\r?\n|$)/);
  assert.doesNotMatch(workflow, /ssh-key:|SOLVENTA_BACKEND_SSH_KEY/);
});
