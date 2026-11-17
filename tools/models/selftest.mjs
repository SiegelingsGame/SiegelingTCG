// Proves stages 4-5 without Blender or a GPU: builds a tiny skinned, textured,
// animated GLB (a two-bone bar with idle + walk clips), ships it to a scratch
// folder, and checks the gate rejects a model with no walk clip.
//
//   node selftest.mjs [outDir]     (default: work/_selftest)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { checkModel } from './check_model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, 'work', '_selftest'));
fs.mkdirSync(out, { recursive: true });

import sharp from 'sharp';

// Small PNG so the WebP texture step has something to convert.
const PNG = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 255, g: 90, b: 30, alpha: 1 } } }).png().toBuffer();

function build(file, clipNames) {
  const doc = new Document();
  const buf = doc.createBuffer();
  // Bar from y=0 to y=2, 4 verts per ring, 3 rings; bottom ring on joint 0.
  const pos = [], idx = [], joints = [], weights = [], uv = [];
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      pos.push(Math.cos(a) * 0.3, r, Math.sin(a) * 0.3);
      uv.push(k / 4, r / 2);
      joints.push(r === 0 ? 0 : 1, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const a = r * 4 + k, b = r * 4 + ((k + 1) % 4);
    idx.push(a, b, a + 4, b, b + 4, a + 4);
  }
  const acc = (type, arr, T) => doc.createAccessor().setType(type).setArray(new T(arr)).setBuffer(buf);
  const tex = doc.createTexture('skin').setImage(PNG).setMimeType('image/png');
  const mat = doc.createMaterial('body').setBaseColorTexture(tex);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', pos, Float32Array))
    .setAttribute('TEXCOORD_0', acc('VEC2', uv, Float32Array))
    .setAttribute('JOINTS_0', acc('VEC4', joints, Uint16Array))
    .setAttribute('WEIGHTS_0', acc('VEC4', weights, Float32Array))
    .setIndices(acc('SCALAR', idx, Uint16Array)).setMaterial(mat);
  const mesh = doc.createMesh('bar').addPrimitive(prim);
  const root = doc.createNode('root');
  const top = doc.createNode('top').setTranslation([0, 1, 0]);
  root.addChild(top);
  const ibm = acc('MAT4', [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1, 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,-1,0,1], Float32Array);
  const skin = doc.createSkin('rig').addJoint(root).addJoint(top).setInverseBindMatrices(ibm);
  const body = doc.createNode('Siegeling').setMesh(mesh).setSkin(skin);
  doc.createScene().addChild(root).addChild(body);
  for (const name of clipNames) {
    const s = doc.createAnimationSampler()
      .setInput(acc('SCALAR', [0, 0.5, 1], Float32Array))
      .setOutput(acc('VEC4', [0, 0, 0, 1, 0, 0, 0.26, 0.97, 0, 0, 0, 1], Float32Array));
    const ch = doc.createAnimationChannel().setTargetNode(top).setTargetPath('rotation').setSampler(s);
    doc.createAnimation(name).addSampler(s).addChannel(ch);
  }
  return new NodeIO().write(file, doc);
}

const good = path.join(out, 'good.glb');
const bad = path.join(out, 'bad.glb');
await build(good, ['idle', 'walk', 'attack', 'hurt', 'cheer', 'fainted']);
await build(bad, ['idle']);

let failed = 0;
const expect = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

const badR = await checkModel(bad);
expect(!badR.pass, 'gate rejects a model with no walk clip');

const registryPath = path.join(here, 'registry.json');
const before = fs.readFileSync(registryPath, 'utf8');
try {
  execFileSync(process.execPath, [path.join(here, 'ship_model.mjs'), 'draco', good, '--dest', path.join(out, 'models')], { stdio: 'pipe', encoding: 'utf8' });
  const shipped = path.join(out, 'models', 'draco.glb');
  const r = await checkModel(shipped);
  expect(r.pass, 'shipped model passes the gate');
  expect(r.lines.some(([, m]) => /skinned, 2 joints/.test(m)), 'skin survives optimize');
  expect(r.clips.length === 6, `all six clips survive optimize (${r.clips.join(',')})`);
  expect(!r.lines.some(([, m]) => /not meshopt/.test(m)), 'output is meshopt-compressed');
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'models', 'manifest.json'), 'utf8'));
  expect(manifest.draco === 'draco.glb', 'manifest maps draco -> draco.glb');
} finally {
  // The self-test must not mark a real creature as shipped.
  fs.writeFileSync(registryPath, before);
}
console.log(failed ? `${failed} check(s) failed` : 'selftest PASS');
process.exit(failed ? 1 : 0);
