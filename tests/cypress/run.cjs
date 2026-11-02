const { spawn, spawnSync } = require('node:child_process');
const { mkdir, writeFile, rm } = require('node:fs/promises');
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

async function main() {
  const mode = process.argv[2];
  if (!['ui', 'integrated'].includes(mode)) {
    throw new Error('Usa run.cjs ui|integrated');
  }
  const backend = localUrl(process.env.CYPRESS_BACKEND_URL || 'http://127.0.0.1:5000');
  if (mode === 'integrated') {
    if (process.env.CYPRESS_DISPOSABLE_BACKEND !== '1') {
      throw new Error('Confirma backend local desechable con CYPRESS_DISPOSABLE_BACKEND=1.');
    }
    const response = await fetch(`${backend}/v1/productos-seguro`, {
      signal: AbortSignal.timeout(5000),
    });
    if (![200, 401].includes(response.status)) {
      throw new Error(`BFF no disponible: HTTP ${response.status}. No se omiten pruebas.`);
    }
  }
  const port = Number(process.env.CYPRESS_WEB_PORT || 4300);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('CYPRESS_WEB_PORT debe ser un puerto entre 1024 y 65535.');
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
    // Electron must start as a browser, not inherit a desktop host's Node mode.
    delete process.env.ELECTRON_RUN_AS_NODE;
    const reports = path.resolve('reports', 'cypress', mode);
    await rm(reports, { recursive: true, force: true });
    const result = await require('cypress').run({
      configFile: 'tests/cypress/cypress.config.cjs',
      config: { baseUrl, specPattern: `tests/cypress/${mode}/**/*.cy.ts` },
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

module.exports = { localUrl };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
