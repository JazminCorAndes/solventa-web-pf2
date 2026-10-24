'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const script = join(__dirname, 'prepare-pages.cjs');

test('production and AWS backend configurations use HTTPS without a production replacement', () => {
  const root = join(__dirname, '..');
  const build = JSON.parse(readFileSync(join(root, 'angular.json'), 'utf8')).projects[
    'solventa-web-pf2'
  ].architect.build;
  assert.equal(build.defaultConfiguration, 'production');
  assert.deepEqual(build.configurations.production.fileReplacements ?? [], []);
  for (const file of ['environment.ts', 'environment.backend.ts']) {
    const source = readFileSync(join(root, 'src', 'environments', file), 'utf8');
    const url = source.match(/apiBaseUrl:\s*'([^']+)'/);
    assert.ok(url, `Missing API URL in ${file}`);
    assert.equal(new URL(url[1]).protocol, 'https:', file);
    assert.match(source, /dataAccessMode:\s*'backend'/);
  }
});

function withBuild(html, check) {
  const root = mkdtempSync(join(tmpdir(), 'solventa-pages-test-'));
  const output = join(root, 'dist', 'solventa-web-pf2', 'browser');
  try {
    mkdirSync(output, { recursive: true });
    if (html !== null) {
      writeFileSync(join(output, 'index.html'), html);
    }
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    check({ output, result });
  } finally {
    rmSync(root, { recursive: true });
  }
}

test('copies the SPA entry point and resolves deep-link assets under the Pages base', () => {
  const html =
    '<!doctype html><html><head><base href="/solventa-web-pf2/"></head>' +
    '<body><app-root></app-root><script src="main.js" type="module"></script></body></html>';
  withBuild(html, ({ output, result }) => {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(output, '404.html'), 'utf8'), html);
    const requested = new URL(
      'https://jazmincorandes.github.io/solventa-web-pf2/app/seguros/travel?origen=travel',
    );
    const baseHref = readFileSync(join(output, '404.html'), 'utf8').match(
      /<base\s+href=["']([^"']+)["']/,
    )[1];
    const base = new URL(baseHref, requested);
    assert.equal(new URL('main.js', base).pathname, '/solventa-web-pf2/main.js');
    assert.equal(
      new URL('assets/i18n/es.json', base).pathname,
      '/solventa-web-pf2/assets/i18n/es.json',
    );
    assert.equal(requested.pathname, '/solventa-web-pf2/app/seguros/travel');
    assert.equal(requested.search, '?origen=travel');
  });
});

for (const html of ['<base href="/">', '<base href="/another-project/">', null]) {
  test(`fails explicitly instead of creating a broken fallback: ${html}`, () => {
    withBuild(html, ({ output, result }) => {
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(join(output, '404.html')), false);
      assert.match(result.stderr, /base href|ENOENT/);
    });
  });
}
