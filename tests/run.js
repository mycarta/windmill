// WINDMILL — Node runner for the wake tests.
//
// Runs wake.js and tests/wake-tests.js in one shared vm context, like two
// <script> tags in one page (see tests/run.html for the browser runner).
//
// Run with: node tests/run.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);

for (const rel of ['wake.js', 'tests/wake-tests.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
}

process.exit(sandbox.WAKE_TEST_RESULT.failed > 0 ? 1 : 0);
