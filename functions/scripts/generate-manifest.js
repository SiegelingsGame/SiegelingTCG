'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const functionsDir = path.resolve(__dirname, '..');
const outputPath = path.join(functionsDir, 'functions.yaml');
const generatorPath = path.join(
  functionsDir,
  'node_modules',
  'firebase-functions',
  'lib',
  'bin',
  'firebase-functions.js'
);

const result = spawnSync(process.execPath, [generatorPath], {
  cwd: functionsDir,
  env: {
    ...process.env,
    FUNCTIONS_MANIFEST_OUTPUT_PATH: outputPath
  },
  stdio: 'inherit'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
