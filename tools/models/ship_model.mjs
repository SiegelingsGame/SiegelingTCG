// Stage 5: optimize a rigged GLB, gate it, and register it with Swarm.
//
//   node ship_model.mjs draco work/draco/rigged.glb [--dest <models dir>]
//
// Writes <dest>/<id>.glb and adds "<modelName lowercased>": "<id>.glb" to
// <dest>/manifest.json, which is the lookup the Swarm loader does.
//
// --dest defaults to src/main/resources/static/swarm/models in this repo, but
// swarm/ is a prebuilt bundle copied in by `npm run build:tcg` in
// SiegelingsRBX/web, and a rebuild replaces this folder. Ship there too (pass
// --dest <SiegelingsRBX>/web/public/models) or the models vanish on the next
// Swarm rebuild.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkModel } from './check_model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const [id, src] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--dest');
const destIdx = args.indexOf('--dest');
const dest = destIdx >= 0 ? path.resolve(args[destIdx + 1]) : path.join(repo, 'src/main/resources/static/swarm/models');
if (!id || !src) { console.error('usage: node ship_model.mjs <creatureId> <rigged.glb> [--dest dir]'); process.exit(2); }

const registryPath = path.join(here, 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const row = registry[id];
if (!row) { console.error(`${id} is not in registry.json (run prep_art.py)`); process.exit(2); }

const workDir = path.join(here, 'work', id);
fs.mkdirSync(workDir, { recursive: true });
const optimized = path.join(workDir, `${id}.glb`);
// --simplify false: decimation already happened in Blender, where it can be
// checked against the rig; simplifying a skinned mesh again here can tear
// weights at seams. WebP textures at 1024 keep a model near 1 MB.
execFileSync(process.execPath, [
  path.join(here, 'node_modules/@gltf-transform/cli/bin/cli.js'), 'optimize', src, optimized,
  '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false',
], { stdio: 'inherit' });

const result = await checkModel(optimized);
for (const [s, m] of result.lines) console.log(`${s.padEnd(4)} ${m}`);
if (!result.pass) { console.error(`${id}: failed the gate; not shipped`); process.exit(1); }

fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(optimized, path.join(dest, `${id}.glb`));
const manifestPath = path.join(dest, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
manifest[row.modelName.toLowerCase()] = `${id}.glb`;
fs.writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');

row.status = 'shipped';
row.shipped = { kb: result.kb, tris: Math.round(result.tris), clips: result.clips };
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
console.log(`shipped ${id} -> ${path.relative(repo, path.join(dest, id + '.glb'))}`);
