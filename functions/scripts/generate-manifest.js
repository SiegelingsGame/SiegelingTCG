'use strict';

const fs = require('fs');
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
  if (result.status !== 0) {
    process.exit(result.status);
  }

  const raw = fs.readFileSync(outputPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.extensions && Object.keys(manifest.extensions).length === 0) {
    delete manifest.extensions;
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.exit(0);
}

process.exit(1);
