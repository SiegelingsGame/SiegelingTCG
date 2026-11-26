#!/usr/bin/env node
/*
 * PixelForge CLI — bake presets or spec files into sprite sheets for any project's build.
 *
 *   node pixelforge/cli.js --list
 *   node pixelforge/cli.js fire-slash explosion --out assets/fx          (PNG sheet + JSON)
 *   node pixelforge/cli.js --all --gif --scale 3 --out build/fx          (+ preview GIFs)
 *   node pixelforge/cli.js --spec my-effect.json --name my-effect --out assets/fx
 *   node pixelforge/cli.js --for generations --frames-dir --out out/     (one PNG per frame too)
 *   node pixelforge/cli.js --contact out/contact.png                     (one-frame-per-preset overview)
 *
 * No dependencies: PNG is written/read with Node's zlib so this runs in any repo's CI.
 */
'use strict';
var fs = require('fs'), path = require('path'), zlib = require('zlib');
var PF = require('./core.js');
var presets = require('./presets.js');
for (var k in presets) PF.register(k, presets[k]);

// ── PNG ──────────────────────────────────────────────────────────────────
var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  var td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// Pixel art rarely uses more than a few dozen colours, so sheets are written as indexed PNG
// (palette + tRNS) whenever they fit in 256 RGBA colours: typically 3-4x smaller than RGBA.
function encodeIndexed(w, h, rgba, scale) {
  var map = new Map(), pal = [];
  for (var i = 0; i < rgba.length; i += 4) {
    var a = rgba[i + 3], key = a === 0 ? 0 : ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | a) >>> 0;
    if (!map.has(key)) { if (pal.length === 256) return null; map.set(key, pal.length); pal.push(a === 0 ? [0, 0, 0, 0] : [rgba[i], rgba[i + 1], rgba[i + 2], a]); }
  }
  var W = w * scale, H = h * scale, raw = Buffer.alloc((W + 1) * H);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var si = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4, al = rgba[si + 3];
    raw[y * (W + 1) + 1 + x] = map.get(al === 0 ? 0 : ((rgba[si] << 24) | (rgba[si + 1] << 16) | (rgba[si + 2] << 8) | al) >>> 0);
  }
  var plte = Buffer.alloc(pal.length * 3), trns = Buffer.alloc(pal.length);
  pal.forEach(function (c, j) { plte[j * 3] = c[0]; plte[j * 3 + 1] = c[1]; plte[j * 3 + 2] = c[2]; trns[j] = c[3]; });
  var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function encodePNG(w, h, rgba, scale, opts) {
  scale = scale || 1;
  if (!(opts && opts.rgba)) { var ix = encodeIndexed(w, h, rgba, scale); if (ix) return ix; }
  var W = w * scale, H = h * scale, raw = Buffer.alloc((W * 4 + 1) * H);
  for (var y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (var x = 0; x < W; x++) {
      var si = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4, di = y * (W * 4 + 1) + 1 + x * 4;
      raw[di] = rgba[si]; raw[di + 1] = rgba[si + 1]; raw[di + 2] = rgba[si + 2]; raw[di + 3] = rgba[si + 3];
    }
  }
  var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Minimal decoder (8-bit RGB/RGBA/palette/grey, non-interlaced) for `image` layers in specs.
function decodePNG(buf) {
  var pos = 8, w, h, depth, ctype, idat = [], plte = null, trns = null;
  while (pos < buf.length) {
    var len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12]) throw new Error('interlaced PNG not supported'); }
    else if (type === 'PLTE') plte = data; else if (type === 'tRNS') trns = data; else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit PNG supported');
  var ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8ClampedArray(w * h * 4), prev = Buffer.alloc(stride), cur;
  for (var y = 0; y < h; y++) {
    var f = raw[y * (stride + 1)]; cur = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (var i = 0; i < stride; i++) {
      var a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0, p;
      if (f === 1) cur[i] = (cur[i] + a) & 255; else if (f === 2) cur[i] = (cur[i] + b) & 255; else if (f === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) { p = a + b - c; var pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    for (var x = 0; x < w; x++) {
      var o = (y * w + x) * 4, s = x * ch;
      if (ctype === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else if (ctype === 2) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (ctype === 3) { var pi = cur[s]; out[o] = plte[pi * 3]; out[o + 1] = plte[pi * 3 + 1]; out[o + 2] = plte[pi * 3 + 2]; out[o + 3] = trns && pi < trns.length ? trns[pi] : 255; }
      else if (ctype === 0) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = 255; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
    }
    prev = cur;
  }
  return { w: w, h: h, data: out };
}

function loadAssets(spec, baseDir) {
  var assets = {};
  (spec.layers || []).forEach(function (L) {
    if (L.type !== 'image' || !L.src || assets[L.src]) return;
    var src = L.src, buf;
    if (/^data:image\/png;base64,/.test(src)) buf = Buffer.from(src.split(',')[1], 'base64');
    else buf = fs.readFileSync(path.resolve(baseDir, src));
    assets[src] = decodePNG(buf);
  });
  return assets;
}

function bake(name, spec, opt, baseDir) {
  var res = PF.render(spec, { assets: loadAssets(spec, baseDir || process.cwd()) });
  var sh = PF.sheet(res, opt.cols), meta = PF.metaJson(res, name, sh, name + '.png');
  fs.mkdirSync(opt.out, { recursive: true });
  fs.writeFileSync(path.join(opt.out, name + '.png'), encodePNG(sh.w, sh.h, sh.data, opt.sheetScale || 1));
  if (opt.sheetScale > 1) { meta.meta.scale = String(opt.sheetScale); }
  fs.writeFileSync(path.join(opt.out, name + '.json'), JSON.stringify(meta, null, 1));
  if (opt.gif) fs.writeFileSync(path.join(opt.out, name + '.gif'), Buffer.from(PF.encodeGIF(res, { scale: opt.scale || 3, background: opt.bg })));
  if (opt.framesDir) {
    var dir = path.join(opt.out, name);
    fs.mkdirSync(dir, { recursive: true });
    res.frames.forEach(function (f, i) { fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.png'), encodePNG(res.w, res.h, f, opt.sheetScale || 1)); });
  }
  return { res: res, meta: meta };
}

function contact(file, names, scale) {
  // One cell per preset at its impact frame on a dark backdrop: quick visual QA of the whole set.
  var cell = 160, cols = 6, rows = Math.ceil(names.length / cols), W = cols * cell, H = rows * cell, img = new Uint8ClampedArray(W * H * 4);
  for (var i = 0; i < W * H; i++) { img[i * 4] = 20; img[i * 4 + 1] = 23; img[i * 4 + 2] = 41; img[i * 4 + 3] = 255; }
  names.forEach(function (n, idx) {
    var res = PF.render(PF.presets[n].spec), f = res.frames[PF.presets[n].category === 'cutscene' ? Math.floor(res.n * 0.35) : res.meta.hit], s = Math.max(1, Math.min(scale || 4, Math.floor((cell - 8) / Math.max(res.w, res.h))));
    var ox = (idx % cols) * cell + Math.floor((cell - res.w * s) / 2), oy = Math.floor(idx / cols) * cell + Math.floor((cell - res.h * s) / 2);
    for (var y = 0; y < res.h * s; y++) for (var x = 0; x < res.w * s; x++) {
      var si = (Math.floor(y / s) * res.w + Math.floor(x / s)) * 4, a = f[si + 3] / 255;
      if (!a) continue;
      var di = ((oy + y) * W + ox + x) * 4;
      img[di] = f[si] * a + img[di] * (1 - a); img[di + 1] = f[si + 1] * a + img[di + 1] * (1 - a); img[di + 2] = f[si + 2] * a + img[di + 2] * (1 - a);
    }
  });
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, encodePNG(W, H, img, 1));
}

function main(argv) {
  var opt = { out: 'pixelforge-out', names: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--out') opt.out = argv[++i];
    else if (a === '--all') opt.all = true;
    else if (a === '--list') opt.list = true;
    else if (a === '--gif') opt.gif = true;
    else if (a === '--scale') opt.scale = +argv[++i];
    else if (a === '--sheet-scale') opt.sheetScale = +argv[++i];
    else if (a === '--cols') opt.cols = +argv[++i];
    else if (a === '--bg') opt.bg = argv[++i];
    else if (a === '--for') opt.for = argv[++i];
    else if (a === '--category') opt.category = argv[++i];
    else if (a === '--spec') opt.spec = argv[++i];
    else if (a === '--name') opt.name = argv[++i];
    else if (a === '--frames-dir') opt.framesDir = true;
    else if (a === '--contact') opt.contact = argv[++i];
    else if (a === '--seed') opt.seed = +argv[++i];
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return; }
    else opt.names.push(a);
  }
  var all = Object.keys(PF.presets).filter(function (n) {
    var p = PF.presets[n];
    return (!opt.for || (p.for || []).indexOf(opt.for) >= 0) && (!opt.category || p.category === opt.category);
  });
  if (opt.list) { all.forEach(function (n) { var p = PF.presets[n]; console.log(n.padEnd(22) + (p.category || '').padEnd(11) + (p.element || '').padEnd(9) + (p.desc || '')); }); return; }
  if (opt.contact) { contact(opt.contact, opt.names.length ? opt.names : all); console.log('wrote ' + opt.contact); return; }
  if (opt.spec) {
    var spec = JSON.parse(fs.readFileSync(opt.spec, 'utf8'));
    if (spec.spec) spec = spec.spec;
    if (opt.seed != null) spec.seed = opt.seed;
    var name = opt.name || path.basename(opt.spec).replace(/\.json$/, '');
    var r = bake(name, spec, opt, path.dirname(path.resolve(opt.spec)));
    console.log(name + ': ' + r.res.n + ' frames ' + r.res.w + 'x' + r.res.h + ' hit=' + r.res.meta.hit + ' colors=' + r.res.meta.colors);
    return;
  }
  var names = opt.all ? all : opt.names;
  if (!names.length) { console.log('Nothing to do. Try --list, --all, or preset names. --help for usage.'); return; }
  var index = {};
  names.forEach(function (n) {
    var p = PF.presets[n];
    if (!p) { console.error('unknown preset: ' + n); process.exitCode = 1; return; }
    var spec = JSON.parse(JSON.stringify(p.spec));
    if (opt.seed != null) spec.seed = opt.seed;
    var r = bake(n, spec, opt);
    index[n] = r.meta.pf;
    console.log(n.padEnd(22) + r.res.n + ' frames ' + r.res.w + 'x' + r.res.h + '  hit=' + r.res.meta.hit + '  colors=' + r.res.meta.colors);
  });
  // index.json = every baked effect's playback record, ready for a game to load in one fetch.
  fs.writeFileSync(path.join(opt.out, 'index.json'), JSON.stringify(index, null, 1));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { encodePNG: encodePNG, decodePNG: decodePNG, bake: bake, main: main };
