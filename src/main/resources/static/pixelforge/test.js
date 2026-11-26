#!/usr/bin/env node
// PixelForge self-test: `node pixelforge/test.js`. No dependencies; exits non-zero on failure.
'use strict';
var assert = require('assert');
var PF = require('./core.js'), presets = require('./presets.js'), cli = require('./cli.js');
for (var k in presets) PF.register(k, presets[k]);

var failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
function opaque(f) { var c = 0; for (var i = 3; i < f.length; i += 4) if (f[i]) c++; return c; }

Object.keys(PF.presets).forEach(function (n) {
  test('preset ' + n + ' renders visible pixels', function () {
    var r = PF.render(PF.presets[n].spec);
    assert.strictEqual(r.frames.length, r.n);
    assert.ok(opaque(r.frames[r.meta.hit]) > 20, 'impact frame nearly empty');
    // Clips must change over time, otherwise an animation param is broken.
    var seen = {};
    r.frames.forEach(function (f) { seen[Buffer.from(f.buffer).toString('base64')] = 1; });
    assert.ok(Object.keys(seen).length >= Math.min(4, r.n), 'animation is (nearly) static');
  });
});

test('same spec + seed is pixel-identical (determinism)', function () {
  var a = PF.render(PF.presets['explosion'].spec), b = PF.render(PF.presets['explosion'].spec);
  for (var f = 0; f < a.n; f++) assert.deepStrictEqual(Buffer.from(a.frames[f].buffer), Buffer.from(b.frames[f].buffer));
});

test('different seed changes the output', function () {
  var s = JSON.parse(JSON.stringify(PF.presets['explosion'].spec));
  var a = PF.render(s); s.seed += 1; var b = PF.render(s);
  assert.notDeepStrictEqual(Buffer.from(a.frames[a.meta.hit].buffer), Buffer.from(b.frames[b.meta.hit].buffer));
});

test('omitted params fall back to schema defaults', function () {
  var r = PF.render({ w: 64, h: 64, frames: 4, layers: [{ type: 'ring', x: 32, y: 32, ramp: 'ice' }] });
  assert.ok(opaque(r.frames[1]) > 0);
});

test('animated params: from/to, keys and easing', function () {
  assert.strictEqual(PF.param({ from: 0, to: 10 }, 0.5), 5);
  assert.strictEqual(PF.param({ from: 0, to: 10, start: 0.5, end: 1 }, 0.25), 0);
  assert.strictEqual(PF.param({ keys: [[0, 0], [0.5, 10], [1, 0]] }, 0.75), 5);
  assert.ok(PF.param({ from: 0, to: 1, ease: 'outCubic' }, 0.5) > 0.5);
});

test('every layer type renders with defaults', function () {
  Object.keys(PF.TYPES).forEach(function (t) {
    if (t === 'image' || t === 'effect' || t === 'invert') return;
    var r = PF.render({ w: 64, h: 64, frames: 6, layers: [PF.defaults(t)] });
    assert.ok(r.frames.some(function (f) { return opaque(f) > 0; }), t + ' drew nothing');
  });
});

test('effect layer embeds another preset', function () {
  var r = PF.render({ w: 64, h: 64, frames: 8, layers: [{ type: 'effect', preset: 'hit-spark', x: 16, y: 16 }] });
  assert.ok(r.frames.some(function (f) { return opaque(f) > 0; }));
});

test('image layer draws decoded PNG pixels', function () {
  var px = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  var png = cli.encodePNG(4, 4, px), dec = cli.decodePNG(png);
  assert.strictEqual(dec.w, 4);
  var r = PF.render({ w: 16, h: 16, frames: 1, layers: [{ type: 'image', src: 'a', x: 8, y: 12, scale: 2 }] }, { assets: { a: dec } });
  assert.strictEqual(opaque(r.frames[0]), 64);
});

test('text layer draws the pixel font', function () {
  var r = PF.render({ w: 40, h: 10, frames: 1, layers: [{ type: 'text', text: 'HI', x: 20, y: 5, scale: 1, reveal: 1, outline: '' }] });
  // H = 11 ink pixels, I = 9 in the 3x5 font.
  assert.strictEqual(opaque(r.frames[0]), 20);
});

test('sheet + Aseprite JSON describe the same frames', function () {
  var r = PF.render(PF.presets['fire-slash'].spec), sh = PF.sheet(r), m = PF.metaJson(r, 'fire-slash', sh);
  assert.strictEqual(m.frames.length, r.n);
  assert.strictEqual(m.meta.size.w, sh.w);
  assert.strictEqual(m.pf.cols * Math.ceil(r.n / m.pf.cols) * r.h, sh.rows * r.h * m.pf.cols);
  var last = m.frames[r.n - 1].frame;
  assert.ok(last.x + last.w <= sh.w && last.y + last.h <= sh.h);
});

test('GIF encoder writes a well-formed file', function () {
  var g = PF.encodeGIF(PF.render(PF.presets['hit-spark'].spec), { scale: 2 });
  assert.strictEqual(Buffer.from(g.slice(0, 6)).toString(), 'GIF89a');
  assert.strictEqual(g[g.length - 1], 0x3B);
});

test('palette post pass snaps to the palette', function () {
  var r = PF.render({ w: 32, h: 32, frames: 3, layers: [{ type: 'ring', x: 16, y: 16, ramp: 'fire' }], post: [{ type: 'palette', palette: 'pico8' }] });
  var pal = PF.PALETTES.pico8.map(function (h) { return PF.hex(h).slice(0, 3).join(','); }), f = r.frames[1];
  for (var i = 0; i < f.length; i += 4) if (f[i + 3]) assert.ok(pal.indexOf([f[i], f[i + 1], f[i + 2]].join(',')) >= 0);
});

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
