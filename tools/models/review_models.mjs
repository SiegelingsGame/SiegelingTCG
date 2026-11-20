// Visual + numeric review of every Swarm creature model's animations.
//
//   node review_models.mjs [--dir ../../src/main/resources/static/swarm/models] [--only Shellpack,Generoot]
//
// For each GLB: which clip Swarm will idle and walk on (its loader idles on
// the first name matching /idle|stand|breath/, else clip 0, and walks on
// /walk|run|move|locomotion/), a contact sheet of every clip at 0/25/50/75%
// (work/_review/<Model>.png), and motion flags measured on the skinned pose:
//   frozen     clip under 0.2 s (a held pose, e.g. a T-pose)
//   drops      body height falls under 60% of its start (lying down / fainting)
//   drifts     body centre travels over 0.35 body lengths (root motion: the
//              model walks off its collider and snaps back each loop)
//   size       biggest/smallest extent over 1.6x (wild squash or scale tracks;
//              normal for flapping wings, so read the sheet before acting)
//   loop jump  the last frame is far from the first (one-shot, not a loop)
// Flags on the clip Swarm idles or walks on matter; flags on unused clips
// (Attack, Faint, Hide...) are expected. Fixes go in clip-fixes.json.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const dir = path.resolve(opt('--dir') || path.join(here, '../../src/main/resources/static/swarm/models'));
const only = opt('--only') ? new Set(opt('--only').split(',').map((s) => s.replace(/\.glb$/, ''))) : null;
const out = path.join(here, 'work', '_review');
const plain = path.join(out, 'plain');
fs.mkdirSync(plain, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

// The review page uses three.js r128, which predates meshopt in its loader
// examples, so models are decompressed to plain GLB first.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const IDLE = /idle|stand|breath/i, WALK = /walk|run|move|locomotion/i;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb') && (!only || only.has(f.replace(/\.glb$/, '')))).sort();
const picks = {};
for (const f of files) {
  const doc = await io.read(path.join(dir, f));
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  picks[f] = { idle: names.find((n) => IDLE.test(n)) || (names[0] ? `${names[0]} (fallback: first clip)` : null), walk: names.find((n) => WALK.test(n)) || null, clips: names };
  for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantiz/i.test(e.extensionName)) e.dispose();
  await io.write(path.join(plain, f), doc);
}
fs.copyFileSync(path.join(here, 'review.html'), path.join(plain, 'review.html'));

const server = http.createServer((req, res) => {
  const p = path.join(plain, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(plain) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'model/gltf-binary' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await playwright.chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/review.html`);
await page.waitForFunction('window.renderModel && window.motion');

const report = {};
let problems = 0;
for (const f of files) {
  const r = await page.evaluate((u) => window.renderModel(u), '/' + f);
  if (r.err) { console.log(`${f}: failed to load: ${r.err}`); problems++; continue; }
  fs.writeFileSync(path.join(out, f.replace('.glb', '.png')), Buffer.from(r.img.split(',')[1], 'base64'));
  const m = await page.evaluate((u) => window.motion(u), '/' + f);
  const flags = {};
  for (const [clip, v] of Object.entries(m)) {
    const fl = [];
    if (v.dur < 0.2) fl.push('frozen');
    if (v.hmin < 0.6) fl.push(`drops to ${Math.round(v.hmin * 100)}%`);
    if (v.drift > 0.35) fl.push(`drifts ${v.drift}x`);
    if (v.sizemax / Math.max(v.sizemin, 1e-3) > 1.6) fl.push(`size x${(v.sizemax / Math.max(v.sizemin, 1e-3)).toFixed(1)}`);
    if (v.endJump > 0.3) fl.push(`loop jump ${v.endJump}`);
    if (fl.length) flags[clip] = fl;
  }
  const p = picks[f];
  const used = [p.idle && p.idle.replace(/ \(fallback.*$/, ''), p.walk].filter(Boolean);
  const live = Object.entries(flags).filter(([c]) => used.includes(c));
  const issues = [];
  if (!p.clips.length) issues.push('no animations (frozen statue)');
  else {
    if (/fallback/.test(p.idle || '')) issues.push(`no idle clip; idles on "${p.idle.replace(/ \(fallback.*$/, '')}"`);
    if (p.idle && p.walk && p.idle === p.walk) issues.push('idles on its walk clip');
    if (!p.walk) issues.push('no walk clip (glides)');
    for (const [c, fl] of live) issues.push(`${c}: ${fl.join(', ')}`);
  }
  report[f] = { ...p, motion: m, flags, issues };
  if (issues.length) problems++;
  console.log(`${f.padEnd(20)} idle=${(p.idle || '-').padEnd(30)} walk=${(p.walk || '-').padEnd(24)} ${issues.join(' | ') || 'ok'}`);
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
await browser.close();
server.close();
console.log(`\n${files.length} models, ${problems} with issues. Sheets and report.json in ${path.relative(process.cwd(), out)}/`);
