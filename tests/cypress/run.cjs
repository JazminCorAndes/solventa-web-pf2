const childProcess = require('node:child_process');
const { spawn, spawnSync } = childProcess;
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { access, mkdir, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');

function localUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Cypress solo puede escribir en un backend HTTP local desechable.');
  }
  return url.origin;
}

function selectedSpec(mode, file) {
  if (!['ui', 'integrated', 'controlled'].includes(mode))
    throw new Error('Usa run.cjs ui|integrated|controlled');
  if (mode === 'controlled' && file !== 'open-finance-review.cy.ts') {
    throw new Error('La muestra controlada exige seleccionar open-finance-review.cy.ts.');
  }
  if (file === undefined) return `tests/cypress/${mode}/**/*.cy.ts`;
  if (!/^[a-z0-9][a-z0-9-]*\.cy\.ts$/i.test(file)) {
    throw new Error('Selecciona un solo archivo .cy.ts de la suite, sin rutas ni comodines.');
  }
  return `tests/cypress/${mode}/${file}`;
}

function hu44Fixture(includeCredentials = false) {
  const requireValid = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  requireValid(
    process.env.CYPRESS_DISPOSABLE_BACKEND === '1',
    'HU44 requires a disposable local backend.',
  );
  const root = path.resolve(__dirname, '../..');
  const readJson = (file, label) => {
    requireValid(
      typeof file === 'string' && path.isAbsolute(file),
      `HU44 requires an absolute ${label} path.`,
    );
    requireValid(
      !path.resolve(file).startsWith(`${root}${path.sep}`),
      `HU44 ${label} must remain outside the repository.`,
    );
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`HU44 ${label} could not be read as JSON.`);
    }
  };
  const status = readJson(process.env.CYPRESS_HU44_STATUS_FILE, 'status');
  const fixture = readJson(process.env.CYPRESS_HU44_FIXTURE_FILE, 'fixture');
  requireValid(
    status?.state === 'ready' &&
      /^[a-f0-9]{32}$/.test(status.run_id) &&
      status.run_id === process.env.CYPRESS_HU44_RUN_ID &&
      status.sha === 'd0a3145918c019b1cfb347faa1a8d0d5d05dac8d' &&
      status.permanent_wiring_verified === true &&
      status.automatic_recovery_enabled === false &&
      status.delivery_fault?.enabled === true &&
      status.delivery_fault?.consumed === false &&
      Number.isFinite(Date.parse(status.readiness_completed_at)) &&
      Date.parse(status.readiness_completed_at) <= Date.now() &&
      Date.parse(status.expires_at) > Date.now(),
    'HU44 requires a ready, unexpired, unused d0 run with explicit delivery recovery.',
  );
  requireValid(
    localUrl(status.urls?.web) === localUrl(process.env.CYPRESS_BACKEND_URL),
    'HU44 status and browser must use the same local BFF.',
  );
  localUrl(status.urls?.identity);
  const head = childProcess.spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  const tree = childProcess.spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });
  requireValid(
    head.status === 0 &&
      tree.status === 0 &&
      tree.stdout.trim() === '' &&
      /^[a-f0-9]{40}$/.test(status.web_sha) &&
      head.stdout.trim() === status.web_sha,
    'HU44 requires the clean frontend revision pinned by the backend owner.',
  );
  const spec = fs.readFileSync(path.join(__dirname, 'controlled', 'open-finance-review.cy.ts'));
  requireValid(
    createHash('sha256').update(spec).digest('hex') === status.spec_sha256,
    'HU44 spec bytes do not match the backend readiness fingerprint.',
  );
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  requireValid(
    fixture?.run_id === status.run_id &&
      isDeepStrictEqual(fixture, status.fixture) &&
      typeof fixture.socioId === 'string' &&
      fixture.socioId.length > 0 &&
      fixture.productoId === 'mortgage-life' &&
      fixture.finalidad === 'cotizacion' &&
      isDeepStrictEqual(fixture.datosSolicitados, ['indicador_riesgo']) &&
      fixture.actors?.socio?.rol === 'socio' &&
      uuid.test(fixture.actors.socio.id) &&
      fixture.actors?.asesor?.rol === 'asesor' &&
      uuid.test(fixture.actors.asesor.id) &&
      Array.isArray(fixture.clients) &&
      fixture.clients.length === 3 &&
      isDeepStrictEqual(
        fixture.clients.map((client) => client.expectedOutcome),
        ['completada', 'detenida', 'bloqueada'],
      ) &&
      fixture.clients.every(
        (client) =>
          uuid.test(client.clienteId) &&
          client.tipoDocumento === 'passport' &&
          typeof client.numeroDocumento === 'string' &&
          client.numeroDocumento.length > 0,
      ) &&
      new Set(fixture.clients.map((client) => client.clienteId)).size === 3,
    'HU44 fixture does not match the owned run and its three ordered clients.',
  );
  const readiness = {
    runId: status.run_id,
    backendSha: status.sha,
    webSha: status.web_sha,
    specSha256: status.spec_sha256,
    readinessCompletedAt: status.readiness_completed_at,
    expiresAt: status.expires_at,
    deliveryFault: { enabled: true, consumed: false },
  };
  if (!includeCredentials) return { fixture, readiness };
  const credentials = readJson(status.credentials_file, 'private credentials');
  requireValid(
    credentials?.run_id === status.run_id &&
      typeof credentials.password === 'string' &&
      credentials.password.length > 0 &&
      ['socio', 'asesor'].every(
        (role) =>
          typeof credentials.actors?.[role]?.email === 'string' &&
          credentials.actors[role].email.length > 0,
      ),
    'HU44 private credentials do not match the owned run.',
  );
  return { fixture, readiness, credentials };
}

async function main() {
  const mode = process.argv[2];
  const file = process.argv[3];
  const specPattern = selectedSpec(mode, file);
  if (process.argv.length > 4) throw new Error('Solo se permite seleccionar un spec.');
  if (file !== undefined) await access(path.resolve(specPattern));
  const backend = localUrl(process.env.CYPRESS_BACKEND_URL || 'http://127.0.0.1:5000');
  const port = Number(process.env.CYPRESS_WEB_PORT || 4300);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('CYPRESS_WEB_PORT debe ser un puerto entre 1024 y 65535.');
  }
  if (mode === 'controlled' && (!process.env.CYPRESS_WEB_PORT || [4200, 4300].includes(port))) {
    throw new Error('La muestra controlada requiere un puerto web propio distinto de 4200/4300.');
  }
  if (mode === 'controlled') hu44Fixture(true);
  if (mode !== 'ui') {
    if (process.env.CYPRESS_DISPOSABLE_BACKEND !== '1') {
      throw new Error('Confirma backend local desechable con CYPRESS_DISPOSABLE_BACKEND=1.');
    }
    const response = await fetch(`${backend}/v1/productos-seguro`, {
      signal: AbortSignal.timeout(5000),
    });
    if (mode === 'controlled') {
      console.log(
        JSON.stringify({
          phase: 'unauthenticated-preflight',
          path: '/v1/productos-seguro',
          status: response.status,
          completedAt: new Date().toISOString(),
          correlationId: response.headers.get('x-correlation-id'),
        }),
      );
    }
    if (![200, 401].includes(response.status)) {
      throw new Error(`BFF no disponible: HTTP ${response.status}. No se omiten pruebas.`);
    }
  }
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  const dir = path.resolve('.angular', 'cypress');
  const proxy = path.join(dir, `proxy-${process.pid}.json`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    proxy,
    JSON.stringify({
      '/api': { target: backend, secure: false, pathRewrite: { '^/api': '' } },
    }),
  );
  const server = spawn(
    process.execPath,
    [
      require.resolve('@angular/cli/bin/ng.js'),
      'serve',
      '--configuration',
      'local',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--proxy-config',
      proxy,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' },
  );
  let output = '';
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (data) => {
      output = (output + data.toString()).slice(-12000);
    });
  }
  const stop = () => {
    if (server.exitCode !== null) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-server.pid, 'SIGTERM');
    }
  };
  const interrupt = () => {
    stop();
    process.exit(130);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 120000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Angular terminó:\n${output}`);
      try {
        ready = (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok;
      } catch (error) {
        if (!['TypeError', 'TimeoutError'].includes(error.name)) throw error;
      }
      if (ready) break;
      await delay(250);
    }
    if (!ready) throw new Error(`Angular no respondió en 120s:\n${output}`);
    console.log(`Angular Cypress listo: PID ${server.pid}; puerto ${port}.`);
    // Electron must start as a browser, not inherit a desktop host's Node mode.
    delete process.env.ELECTRON_RUN_AS_NODE;
    const reports = path.resolve(
      'reports',
      'cypress',
      mode,
      ...(file ? [file.replace(/\.cy\.ts$/, '')] : []),
    );
    await rm(reports, { recursive: true, force: true });
    const result = await require('cypress').run({
      configFile: 'tests/cypress/cypress.config.cjs',
      config: { baseUrl, specPattern },
      reporterOptions: { mochaFile: path.join(reports, 'results-[hash].xml'), toConsole: false },
      env: { suite: mode },
    });
    if (result.status === 'failed') throw new Error(result.message);
    console.log(
      `Cypress ${mode}: ${result.totalPassed}/${result.totalTests} aprobadas; ${result.totalFailed} fallidas.`,
    );
    process.exitCode = result.totalFailed || result.totalTests === 0 ? 1 : 0;
  } finally {
    stop();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await rm(proxy, { force: true });
  }
}

module.exports = { localUrl, selectedSpec, hu44Fixture };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
