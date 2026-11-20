// Applies clip-fixes.json to Swarm's GLBs in place (or to --dir).
//
//   node fix_clips.mjs [--dir ../../src/main/resources/static/swarm/models] [--only Shellpack.glb,...]
//
// Idempotent: a model whose clips already show a fix (renamed clip present,
// dropped clip gone, an 'Idle' already derived) skips that step, so the
// script can be re-run after adding entries. Meshopt compression and WebP
// textures are preserved.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const dir = path.resolve(opt('--dir') || path.join(here, '../../src/main/resources/static/swarm/models'));
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const plan = JSON.parse(fs.readFileSync(path.join(here, 'clip-fixes.json'), 'utf8'));

// A derived idle holds pose A and sways 35% of the way toward a pose 10% of
// the source clip later, over 2.4 s. Enough to read as breathing without the
// feet visibly stepping.
const SWAY_MIX = 0.35;
const SWAY_AHEAD = 0.1;
const PERIOD = 2.4;

function sample(sampler, t) {
  const times = sampler.getInput().getArray();
  const vals = sampler.getOutput().getArray();
  const interp = sampler.getInterpolation();
  const n = times.length;
  const stride = vals.length / n / (interp === 'CUBICSPLINE' ? 3 : 1);
  // cubic-spline stores [inTangent, value, outTangent] per key; use the value
  const at = (k) => {
    const base = interp === 'CUBICSPLINE' ? (k * 3 + 1) * stride : k * stride;
    return Array.from(vals.slice(base, base + stride));
  };
  if (t <= times[0]) return at(0);
  if (t >= times[n - 1]) return at(n - 1);
  let k = 1;
  while (times[k] < t) k++;
  const a = at(k - 1), b = at(k);
  if (interp === 'STEP') return a;
  const u = (t - times[k - 1]) / (times[k] - times[k - 1]);
  return mix(a, b, u, stride === 4);
}

function mix(a, b, u, quat) {
  if (quat) {
    // shortest-arc nlerp; plenty for the small angles between nearby frames
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const s = dot < 0 ? -1 : 1;
    const q = a.map((x, i) => x + (s * b[i] - x) * u);
    const len = Math.hypot(...q) || 1;
    return q.map((x) => x / len);
  }
  return a.map((x, i) => x + (b[i] - x) * u);
}

function clipDuration(anim) {
  let d = 0;
  for (const s of anim.listSamplers()) d = Math.max(d, s.getInput().getMax([])[0]);
  return d;
}

function deriveIdle(doc, src, at) {
  const dur = clipDuration(src);
  const tA = at, tB = (at + dur * SWAY_AHEAD) % dur;
  const buffer = doc.getRoot().listBuffers()[0];
  const idle = doc.createAnimation('Idle');
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, PERIOD / 2, PERIOD])).setBuffer(buffer);
  for (const ch of src.listChannels()) {
    const s = ch.getSampler();
    if (ch.getTargetPath() === 'weights') continue;
    const quat = ch.getTargetPath() === 'rotation';
    const A = sample(s, tA), B = mix(A, sample(s, tB), SWAY_MIX, quat);
    const out = doc.createAccessor().setType(s.getOutput().getType()).setArray(new Float32Array([...A, ...B, ...A])).setBuffer(buffer);
    const ns = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    idle.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(ns));
  }
  return idle.listChannels().length;
}

function inPlace(anim) {
  // Subtract the straight line from the first to the last key of every
  // translation track: a looping walk should end where it started, so what
  // is removed is the travel and what stays is the bob and sway.
  let fixed = 0;
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() !== 'translation') continue;
    const s = ch.getSampler();
    const t = s.getInput().getArray(), v = s.getOutput().getArray().slice();
    const n = t.length;
    if (n < 2 || s.getInterpolation() === 'CUBICSPLINE') continue;
    const d = [0, 1, 2].map((i) => v[(n - 1) * 3 + i] - v[i]);
    if (Math.hypot(...d) < 1e-6) continue;
    for (let k = 0; k < n; k++) {
      const u = (t[k] - t[0]) / (t[n - 1] - t[0]);
      for (let i = 0; i < 3; i++) v[k * 3 + i] -= d[i] * u;
    }
    // own copy: the output accessor may be shared with another clip
    s.setOutput(s.getOutput().clone().setArray(v));
    fixed++;
  }
  return fixed;
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

for (const [file, steps] of Object.entries(plan)) {
  if (file.startsWith('_') || (only && !only.has(file))) continue;
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) { console.log(`skip ${file}: not in ${dir}`); continue; }
  const doc = await io.read(p);
  const root = doc.getRoot();
  const find = (name) => root.listAnimations().find((a) => a.getName() === name);
  const log = [];
  for (const step of steps) {
    if (step.rename) {
      const [from, to] = step.rename;
      const a = find(from);
      if (a) { a.setName(to); log.push(`rename ${from} -> ${to}`); }
    } else if (step.drop) {
      const a = find(step.drop);
      if (a) { a.listSamplers().forEach((s) => s.dispose()); a.dispose(); log.push(`drop ${step.drop}`); }
    } else if (step.idleFrom) {
      if (find('Idle')) continue;
      const src = find(step.idleFrom.clip);
      if (!src) throw new Error(`${file}: no clip ${step.idleFrom.clip}`);
      log.push(`idle from ${step.idleFrom.clip} @${step.idleFrom.at}s (${deriveIdle(doc, src, step.idleFrom.at)} tracks)`);
    } else if (step.inPlace) {
      const a = find(step.inPlace);
      if (a) { const n = inPlace(a); if (n) log.push(`in-place ${step.inPlace} (${n} tracks)`); }
    }
  }
  if (!log.length) { console.log(`${file}: already fixed`); continue; }
  const before = fs.statSync(p).size;
  await io.write(p, doc);
  console.log(`${file}: ${log.join('; ')}  [${Math.round(before / 1024)} -> ${Math.round(fs.statSync(p).size / 1024)} KB]`);
}
