'use strict';

const { execFileSync } = require('node:child_process');
const { cpSync, existsSync, mkdirSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

function prepareFrontendArtifact({
  revision,
  source = join('dist', 'solventa-web-pf2'),
  output = join('dist', 'artifacts'),
}) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) {
    throw new Error('El artefacto requiere el SHA completo de la revisión compilada.');
  }
  const index = statSync(join(source, 'browser', 'index.html'), { throwIfNoEntry: false });
  if (!index?.isFile() || index.size === 0) {
    throw new Error('Falta el index.html compilado; no se conserva un artefacto vacío.');
  }
  const destination = join(output, `frontend-${revision}`);
  if (existsSync(destination)) {
    throw new Error('El artefacto de esta revisión ya existe; no se reutiliza evidencia anterior.');
  }
  mkdirSync(output, { recursive: true });
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: true });
  writeFileSync(join(destination, 'revision.json'), `${JSON.stringify({ revision }, null, 2)}\n`, {
    flag: 'wx',
  });
  return destination;
}

module.exports = { prepareFrontendArtifact };

if (require.main === module) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(prepareFrontendArtifact({ revision }));
}
