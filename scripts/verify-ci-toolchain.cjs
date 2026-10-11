'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const expectedNode = fs.readFileSync('.nvmrc', 'utf8').trim().replace(/^v/, '');
const current = process.versions.node;
const wanted = expectedNode.split('.').map(Number);
const actual = current.split('.').map(Number);
if (
  actual[0] !== wanted[0] ||
  actual[1] < wanted[1] ||
  (actual[1] === wanted[1] && actual[2] < wanted[2])
) {
  throw new Error(
    `Use Node ${expectedNode} or a newer patch/minor in the same major; found ${current}`,
  );
}

const { packageManager } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const expectedPnpm = packageManager.replace(/^pnpm@/, '');
// This check runs on the provisioned Linux Jenkins agent, not through a shell.
const pnpm = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
if (pnpm !== expectedPnpm) {
  throw new Error(`Use pnpm ${expectedPnpm}; found ${pnpm}`);
}
console.log(`Verified Node ${current} and pnpm ${pnpm}`);
