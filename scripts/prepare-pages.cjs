'use strict';

const { copyFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const output = join('dist', 'solventa-web-pf2', 'browser');
const index = join(output, 'index.html');
if (!/<base\s+href=["']\/solventa-web-pf2\/["']\s*\/?>/.test(readFileSync(index, 'utf8'))) {
  throw new Error('Pages requires a production build with base href /solventa-web-pf2/.');
}

// Pages serves this entry point for deep links while preserving the requested URL.
copyFileSync(index, join(output, '404.html'));
