// Stage 4 gate: does a GLB meet what the Swarm loader and a phone GPU need?
//
//   node check_model.mjs work/draco/draco.glb [--max-kb 1500] [--max-tris 10000]
//
// Exit code 1 on any FAIL, so ship_model.mjs refuses to copy a bad model.
// The clip regexes are copied from the Swarm bundle's model loader: idle is
// /idle|stand|breath/ (falling back to the first clip) and walk is
// /walk|run|move|locomotion/. A model without them loads but stands frozen.
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const IDLE = /idle|stand|breath/i;
const WALK = /walk|run|move|locomotion/i;
// The 2D Siege sprite poses; Battle Table / Siege 3D views will want all six.
const POSES = ['idle', 'walk', 'attack', 'hurt', 'cheer', 'fainted'];

export async function checkModel(file, { maxKb = 1500, maxTris = 10000, maxTex = 1024 } = {}) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(file);
  const root = doc.getRoot();
  const out = [];
  const fail = (m) => out.push(['FAIL', m]);
  const warn = (m) => out.push(['WARN', m]);
  const ok = (m) => out.push(['ok', m]);

  const kb = Math.round(fs.statSync(file).size / 1024);
  (kb <= maxKb ? ok : fail)(`${kb} KB (budget ${maxKb})`);

  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      if (prim.getMode() === 4) tris += (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
    }
  }
  if (!tris) fail('no triangles');
  else (tris <= maxTris ? ok : fail)(`${Math.round(tris)} triangles (budget ${maxTris})`);

  const skins = root.listSkins();
  if (skins.length) ok(`skinned, ${skins[0].listJoints().length} joints`);
  else warn('no skin: the model can only move as a whole');

  const clips = root.listAnimations().map((a) => a.getName());
  ok(`clips: ${clips.join(', ') || '(none)'}`);
  if (!clips.length) fail('no animations: Swarm will show a frozen model');
  else {
    if (!clips.some((c) => IDLE.test(c))) warn(`no clip matches ${IDLE}; Swarm idles on "${clips[0]}"`);
    if (!clips.some((c) => WALK.test(c))) fail(`no clip matches ${WALK}; it will glide when moving`);
    const missing = POSES.filter((p) => !clips.includes(p));
    if (missing.length) warn(`missing sprite-pose clips: ${missing.join(', ')}`);
  }

  for (const tex of root.listTextures()) {
    const size = tex.getSize();
    if (size && Math.max(...size) > maxTex) fail(`texture ${tex.getName() || tex.getURI()} is ${size.join('x')} (max ${maxTex})`);
  }
  if (!root.listTextures().length) warn('no textures: untextured model');

  const used = root.listExtensionsUsed().map((e) => e.extensionName);
  if (!used.includes('EXT_meshopt_compression')) warn('not meshopt-compressed; run ship_model.mjs (it optimizes)');

  return { pass: !out.some(([s]) => s === 'FAIL'), lines: out, clips, tris, kb };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
  if (!file) { console.error('usage: node check_model.mjs <file.glb> [--max-kb N] [--max-tris N]'); process.exit(2); }
  const r = await checkModel(file, { maxKb: opt('--max-kb', 1500), maxTris: opt('--max-tris', 10000) });
  for (const [s, m] of r.lines) console.log(`${s.padEnd(4)} ${m}`);
  console.log(r.pass ? 'PASS' : 'FAIL');
  process.exit(r.pass ? 0 : 1);
}
