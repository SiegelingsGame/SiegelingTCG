/*
 * PixelForge editor UI. Reads/writes a plain spec object and asks core.js to render it;
 * every rule about how pixels look lives in core.js so the CLI and games get identical output.
 */
(function () {
  'use strict';
  var PF = window.PixelForge;
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  };

  var PROJECTS = [['all', 'All'], ['siegelings', 'Siegelings TCG'], ['animevs', 'ANIME VS+'], ['generations', 'Generations']];
  var ELEMENT_SET = ['fire', 'ice', 'water', 'electric', 'wind', 'earth', 'poison', 'shadow', 'light', 'psychic', 'metal', 'undead', 'arcane', 'blood', 'heal'];
  // Params core.js samples once per clip (counts, seeds-of-shape); keyframing them would do nothing.
  var STATIC_PARAMS = {}; 'start end count depth branches rings runes star starStep arms bands steps jitter regen corners spawn life speedVar cut dither gain noiseScale flipX loopSub sharp spacing stagger cols radius_'.split(' ').forEach(function (k) { STATIC_PARAMS[k] = 1; });
  var NEUTRAL_RAMPS = { white: 1, mono: 1, ink: 1, smoke: 1 };

  var S = { spec: null, name: 'effect', sel: { kind: 'clip', i: 0 }, res: null, frame: 0, playing: true, last: 0, acc: 0, assets: {}, filter: 'all', dirty: false };
  try { S.filter = localStorage.getItem('pf.filter') || 'all'; } catch (e) { /* storage blocked: default filter */ }

  // ── render pipeline ───────────────────────────────────────────────────
  var pending = 0;
  function rerender() {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      var t0 = performance.now();
      try { S.res = PF.render(S.spec, { assets: S.assets }); }
      catch (err) { toast('Render error: ' + err.message); return; }
      var ms = performance.now() - t0;
      if (S.frame >= S.res.n) S.frame = 0;
      $('scrub').max = S.res.n - 1;
      buildStrip();
      $('stats').textContent = S.res.w + '×' + S.res.h + ' · ' + S.res.n + ' frames @ ' + S.res.fps + 'fps' + (S.res.loop ? ' · loop' : '') +
        ' · impact frame ' + S.res.meta.hit + ' · ' + S.res.meta.colors + ' colours · rendered in ' + ms.toFixed(0) + 'ms';
      fitView();
      draw();
      saveHash();
    });
  }

  var view = $('view'), vctx = view.getContext('2d');
  function fitView() {
    var r = S.res;
    view.width = r.w; view.height = r.h;
    var z = $('zoom').value, stage = $('stage');
    if (z === 'auto') z = Math.max(1, Math.floor(Math.min((stage.clientWidth - 24) / r.w, Math.max(240, innerHeight * 0.55) / r.h)));
    view.style.width = r.w * z + 'px'; view.style.height = r.h * z + 'px';
  }
  function draw() {
    if (!S.res) return;
    vctx.putImageData(new ImageData(S.res.frames[S.frame], S.res.w, S.res.h), 0, 0);
    $('scrub').value = S.frame;
    $('frameLabel').textContent = S.frame + '/' + (S.res.n - 1) + (S.frame === S.res.meta.hit ? ' ★' : '');
    var kids = $('strip').children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === S.frame);
  }
  function loop(now) {
    if (S.playing && S.res) {
      S.acc += now - (S.last || now);
      var step = 1000 / S.res.fps;
      if (S.acc >= step) {
        S.acc %= step;
        // One-shots hold the last frame briefly so the ending is readable in the preview.
        S.frame = S.frame + 1 >= S.res.n ? 0 : S.frame + 1;
        draw();
      }
    }
    S.last = now;
    requestAnimationFrame(loop);
  }
  function buildStrip() {
    var strip = $('strip');
    strip.textContent = '';
    S.res.frames.forEach(function (f, i) {
      var c = el('canvas', { width: S.res.w, height: S.res.h, title: 'Frame ' + i, onclick: function () { S.playing = false; syncPlay(); S.frame = i; draw(); } });
      c.getContext('2d').putImageData(new ImageData(f, S.res.w, S.res.h), 0, 0);
      if (i === S.res.meta.hit) c.classList.add('hit');
      strip.appendChild(c);
    });
  }

  // ── gallery ────────────────────────────────────────────────────────────
  function buildFilters() {
    var box = $('filters');
    box.textContent = '';
    PROJECTS.forEach(function (p) {
      box.appendChild(el('button', { type: 'button', 'aria-pressed': String(S.filter === p[0]), text: p[1], onclick: function () {
        S.filter = p[0];
        try { localStorage.setItem('pf.filter', S.filter); } catch (e) { /* ignore */ }
        buildFilters(); buildGallery();
      } }));
    });
  }
  var thumbCache = {};
  function buildGallery() {
    var g = $('gallery'), lastCat = null;
    g.textContent = '';
    var names = Object.keys(PF.presets).filter(function (n) { return S.filter === 'all' || (PF.presets[n].for || []).indexOf(S.filter) >= 0; });
    names.sort(function (a, b) { return (PF.presets[a].category || '').localeCompare(PF.presets[b].category || ''); });
    names.forEach(function (n) {
      var p = PF.presets[n];
      if (p.category !== lastCat) { lastCat = p.category; g.appendChild(el('div', { class: 'pf-cat', text: p.category })); }
      var c = el('canvas', { width: 1, height: 1 });
      var b = el('button', { type: 'button', title: p.desc || n, 'aria-current': String(S.name === n), onclick: function () { loadPreset(n); } },
        [c, el('b', { text: n }), el('small', { text: (p.element || '') + ' · ' + (p.desc || '') })]);
      g.appendChild(b);
      // Thumbnails render lazily so first paint isn't blocked by 35 full renders.
      setTimeout(function () {
        var r = thumbCache[n] || (thumbCache[n] = PF.render(p.spec));
        c.width = r.w; c.height = r.h;
        // Cutscenes peak on a white flash; a frame a third in shows what the scene actually is.
        c.getContext('2d').putImageData(new ImageData(r.frames[p.category === 'cutscene' ? Math.floor(r.n * 0.35) : r.meta.hit], r.w, r.h), 0, 0);
      }, 0);
    });
  }

  function loadPreset(n) {
    setSpec(JSON.parse(JSON.stringify(PF.presets[n].spec)), n);
    buildGallery();
  }
  function setSpec(spec, name) {
    S.spec = spec;
    S.spec.layers = S.spec.layers || [];
    S.spec.post = S.spec.post || [];
    S.name = name || 'effect';
    $('exportName').value = S.name;
    S.sel = { kind: S.spec.layers.length ? 'layer' : 'clip', i: 0 };
    S.frame = 0;
    preloadImages().then(rerender);
    buildPanels();
    rerender();
  }

  // ── panels ─────────────────────────────────────────────────────────────
  function rampColors(r) { return (Array.isArray(r) ? r : PF.RAMPS[r] || []); }
  function swatch(r) {
    var cols = rampColors(r);
    return el('span', { class: 'sw', style: 'background:linear-gradient(90deg,' + (cols.length > 1 ? cols.join(',') : (cols[0] || '#fff') + ',' + (cols[0] || '#fff')) + ')' });
  }
  function buildPanels() { buildClip(); buildLayers(); buildPosts(); buildInspector(); }

  function buildClip() {
    var box = $('clipProps'), sp = S.spec;
    box.textContent = '';
    [['w', 8, 320, 1], ['h', 8, 320, 1], ['frames', 1, 120, 1], ['fps', 1, 60, 1], ['seed', 0, 9999, 1]].forEach(function (d) {
      box.appendChild(numberField(d[0], sp, d[0], [sp[d[0]] || 0, d[1], d[2], d[3]], false));
    });
    var lp = el('input', { type: 'checkbox' });
    lp.checked = !!sp.loop;
    lp.addEventListener('change', function () { sp.loop = lp.checked; rerender(); });
    box.appendChild(el('label', { class: 'pf-field' }, [el('span', { text: 'loop' }), el('div', { class: 'pf-val' }, [lp])]));
    if (!sp.pivot) sp.pivot = [Math.round((sp.w || 64) / 2), Math.round((sp.h || 64) / 2)];
    box.appendChild(numberField('pivot x', sp.pivot, 0, [sp.pivot[0], 0, 320, 1], false));
    box.appendChild(numberField('pivot y', sp.pivot, 1, [sp.pivot[1], 0, 320, 1], false));
    box.appendChild(numberField('shake', sp, 'shake', [0, 0, 12, 0.5], true));
    var seedBtn = el('button', { type: 'button', text: 'Reroll seed', onclick: function () { sp.seed = Math.floor(Math.random() * 9999); buildClip(); rerender(); } });
    box.appendChild(el('div', { class: 'pf-row' }, [seedBtn]));
  }

  function listItem(item, i, kind, arr) {
    var isSel = S.sel.kind === kind && S.sel.i === i;
    var li = el('li', { 'aria-selected': String(isSel), class: item.hidden ? 'off' : '', onclick: function () { S.sel = { kind: kind, i: i }; buildLayers(); buildPosts(); buildInspector(); } }, [
      kind === 'layer' && PF.TYPES[item.type] && PF.TYPES[item.type].field ? swatch(item.ramp || 'fire') : null,
      el('span', { class: 'nm', text: (item.label || item.type) + (item.start != null || item.end != null ? '  ' + (item.start || 0) + '–' + (item.end == null ? 1 : item.end) : '') }),
      btn(item.hidden ? '◌' : '●', 'Toggle visibility', function () { item.hidden = !item.hidden; }),
      btn('↑', 'Move up (draw earlier)', function () { if (i > 0) { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); S.sel.i = i - 1; } }),
      btn('↓', 'Move down (draw later)', function () { if (i < arr.length - 1) { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); S.sel.i = i + 1; } }),
      btn('⧉', 'Duplicate', function () { arr.splice(i + 1, 0, JSON.parse(JSON.stringify(item))); }),
      btn('✕', 'Delete', function () { arr.splice(i, 1); S.sel = { kind: 'clip', i: 0 }; })
    ]);
    return li;
  }
  function btn(txt, title, fn) {
    return el('button', { type: 'button', title: title, 'aria-label': title, text: txt, onclick: function (e) { e.stopPropagation(); fn(); buildPanels(); rerender(); } });
  }
  function buildLayers() {
    var ol = $('layers');
    ol.textContent = '';
    S.spec.layers.forEach(function (L, i) { ol.appendChild(listItem(L, i, 'layer', S.spec.layers)); });
  }
  function buildPosts() {
    var ol = $('posts');
    ol.textContent = '';
    S.spec.post.forEach(function (p, i) { ol.appendChild(listItem(p, i, 'post', S.spec.post)); });
  }

  function buildInspector() {
    var box = $('inspector');
    box.textContent = '';
    var target, schema;
    if (S.sel.kind === 'layer' && S.spec.layers[S.sel.i]) {
      target = S.spec.layers[S.sel.i]; schema = PF.schema(target.type);
      $('inspTitle').textContent = 'Layer · ' + target.type;
      var d = PF.defaults(target.type);
      for (var k in d) if (target[k] === undefined) target[k] = d[k];
    } else if (S.sel.kind === 'post' && S.spec.post[S.sel.i]) {
      target = S.spec.post[S.sel.i]; schema = PF.POST[target.type].params;
      $('inspTitle').textContent = 'Post · ' + target.type;
    } else { $('inspTitle').textContent = 'Inspector'; box.appendChild(el('p', { class: 'pf-hint', text: 'Pick a layer or post pass to edit it. Numeric values can be keyframed with the ~ button.' })); return; }
    box.appendChild(textField('label', target, 'label'));
    Object.keys(schema).forEach(function (key) {
      var def = schema[key];
      if (Array.isArray(def)) box.appendChild(numberField(key, target, key, def, !STATIC_PARAMS[key]));
      else if (def.select) box.appendChild(selectField(key, target, key, def.select));
      else if (def.ramp) box.appendChild(rampField(key, target));
      else if (def.color != null) box.appendChild(colorField(key, target, key));
      else if (def.preset) box.appendChild(selectField(key, target, key, Object.keys(PF.presets).filter(function (n) { return PF.presets[n].category !== 'cutscene'; })));
      else if (def.text != null) box.appendChild(key === 'src' ? imageField(target) : textField(key, target, key));
    });
  }

  function changed(rebuildList) { if (rebuildList) { buildLayers(); buildPosts(); } rerender(); }

  // Numeric: slider + box; "~" turns it into keyframes edited as "t:v, t:v" with an ease.
  function numberField(label, obj, key, def, animatable) {
    var min = def[1], max = def[2], step = def[3];
    var row = el('div', { class: 'pf-field' }), val = el('div', { class: 'pf-val' });
    row.appendChild(el('span', { text: label, title: label }));
    row.appendChild(val);
    var v = obj[key], isAnim = v != null && typeof v === 'object';
    if (!isAnim) {
      var num = v == null ? (Array.isArray(def[0]) || typeof def[0] === 'object' ? PF.param(def[0], 0) : def[0]) : v;
      var r = el('input', { type: 'range', min: min, max: max, step: step, value: num, 'aria-label': label });
      var n = el('input', { type: 'number', min: min, max: max, step: step, value: num, 'aria-label': label + ' value' });
      r.addEventListener('input', function () { n.value = r.value; obj[key] = +r.value; changed(); });
      n.addEventListener('change', function () { r.value = n.value; obj[key] = +n.value; changed(); });
      val.appendChild(r); val.appendChild(n);
    } else {
      val.appendChild(el('span', { class: 'pf-mono', text: 'animated', style: 'color:var(--accent2)' }));
    }
    if (animatable) {
      var tog = el('button', { type: 'button', class: 'pf-anim', 'aria-pressed': String(isAnim), title: 'Keyframe this value', text: '~', onclick: function () {
        if (isAnim) obj[key] = +PF.param(obj[key], 0).toFixed(3);
        else { var cur = obj[key] == null ? 0 : +obj[key]; obj[key] = { keys: [[0, cur], [1, cur]], ease: 'outCubic' }; }
        buildInspector(); buildClipIfNeeded(obj); changed();
      } });
      val.appendChild(tog);
    }
    if (isAnim) {
      var keys = toKeys(v), kbox = el('div', { class: 'pf-keys' });
      var kt = el('input', { value: keys.keys.map(function (p) { return +p[0].toFixed(3) + ':' + +(+p[1]).toFixed(3); }).join(', '), 'aria-label': label + ' keyframes', title: 'time:value pairs, time 0..1 across the layer window' });
      kt.addEventListener('change', function () {
        var pairs = kt.value.split(',').map(function (s) { var p = s.split(':'); return [clamp01(+p[0]), +p[1]]; }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
        pairs.sort(function (a, b) { return a[0] - b[0]; });
        if (pairs.length) { obj[key] = { keys: pairs, ease: obj[key].ease || 'linear' }; changed(); }
      });
      var es = el('select', { 'aria-label': label + ' ease' });
      Object.keys(PF.EASE).forEach(function (e) { var o = el('option', { text: e }); if (e === (keys.ease || 'linear')) o.selected = true; es.appendChild(o); });
      es.addEventListener('change', function () { obj[key] = { keys: toKeys(obj[key]).keys, ease: es.value }; changed(); });
      kbox.appendChild(el('label', { style: 'grid-column:1/-1' }, ['keys', kt]));
      kbox.appendChild(el('label', {}, ['ease', es]));
      row.appendChild(kbox);
    }
    return row;
  }
  function buildClipIfNeeded(obj) { if (obj === S.spec) buildClip(); }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  // {from,to,start,end} is exactly a two-key track, so the editor only ever shows keys.
  function toKeys(v) {
    if (Array.isArray(v)) return { keys: v, ease: 'linear' };
    if (v.keys) return { keys: v.keys, ease: v.ease };
    return { keys: [[v.start == null ? 0 : v.start, v.from || 0], [v.end == null ? 1 : v.end, v.to || 0]], ease: v.ease };
  }
  function selectField(label, obj, key, opts) {
    var s = el('select', { 'aria-label': label });
    opts.forEach(function (o) { var op = el('option', { text: o }); if (o === obj[key]) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { obj[key] = s.value; changed(); });
    return el('div', { class: 'pf-field' }, [el('span', { text: label }), el('div', { class: 'pf-val' }, [s])]);
  }
  function textField(label, obj, key) {
    var i = el('input', { value: obj[key] == null ? '' : obj[key], 'aria-label': label, spellcheck: 'false' });
    i.addEventListener('input', function () { obj[key] = i.value; changed(key === 'label'); });
    return el('div', { class: 'pf-field' }, [el('span', { text: label }), el('div', { class: 'pf-val' }, [i])]);
  }
  function colorField(label, obj, key) {
    var c = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[key] || '') ? obj[key] : '#ffffff', 'aria-label': label });
    var t = el('input', { value: obj[key] || '', 'aria-label': label + ' hex', spellcheck: 'false' });
    c.addEventListener('input', function () { t.value = c.value; obj[key] = c.value; changed(); });
    t.addEventListener('change', function () { obj[key] = t.value; if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; changed(); });
    return el('div', { class: 'pf-field' }, [el('span', { text: label }), el('div', { class: 'pf-val' }, [c, t])]);
  }
  function rampField(label, obj) {
    var s = el('select', { 'aria-label': 'ramp' }), custom = Array.isArray(obj.ramp);
    Object.keys(PF.RAMPS).concat(['custom…']).forEach(function (n) {
      var o = el('option', { text: n });
      if ((custom && n === 'custom…') || n === obj.ramp) o.selected = true;
      s.appendChild(o);
    });
    var t = el('input', { value: rampColors(obj.ramp).join(','), title: 'Dark → bright hex colours, comma-separated', 'aria-label': 'ramp colours', spellcheck: 'false' });
    var prev = el('div', { class: 'pf-ramp' });
    function paint() { prev.textContent = ''; rampColors(obj.ramp).forEach(function (c) { prev.appendChild(el('i', { style: 'background:' + c })); }); }
    s.addEventListener('change', function () { obj.ramp = s.value === 'custom…' ? rampColors(obj.ramp).slice() : s.value; t.value = rampColors(obj.ramp).join(','); paint(); changed(true); });
    t.addEventListener('change', function () { obj.ramp = t.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); s.value = 'custom…'; paint(); changed(true); });
    paint();
    return el('div', { class: 'pf-field' }, [el('span', { text: label }), el('div', { class: 'pf-val' }, [s]), el('span'), el('div', { class: 'pf-val' }, [t]), el('span'), prev]);
  }
  function imageField(obj) {
    var f = el('input', { type: 'file', accept: 'image/png,image/webp,image/gif', 'aria-label': 'Sprite image' });
    f.addEventListener('change', function () {
      var file = f.files[0];
      if (!file) return;
      var fr = new FileReader();
      fr.onload = function () { obj.src = fr.result; preloadImages().then(rerender); };
      fr.readAsDataURL(file);
    });
    var u = el('input', { value: obj.src && obj.src.indexOf('data:') === 0 ? '(embedded image)' : obj.src || '', placeholder: 'URL relative to this page', 'aria-label': 'Sprite URL' });
    u.addEventListener('change', function () { if (u.value !== '(embedded image)') { obj.src = u.value; preloadImages().then(rerender); } });
    return el('div', { class: 'pf-field' }, [el('span', { text: 'sprite' }), el('div', { class: 'pf-val' }, [f]), el('span'), el('div', { class: 'pf-val' }, [u])]);
  }

  // Character sprites for cutscenes: decoded once into RGBA so core.js stays canvas-free.
  function preloadImages() {
    var jobs = S.spec.layers.filter(function (L) { return L.type === 'image' && L.src && !S.assets[L.src]; }).map(function (L) {
      return new Promise(function (ok) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var x = c.getContext('2d');
          x.drawImage(img, 0, 0);
          S.assets[L.src] = { w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data };
          ok();
        };
        img.onerror = function () { toast('Could not load sprite ' + L.src.slice(0, 60)); ok(); };
        img.src = L.src;
      });
    });
    return Promise.all(jobs);
  }

  // ── export ─────────────────────────────────────────────────────────────
  function toast(msg) {
    var t = el('div', { class: 'pf-toast', role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function download(name, data, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function rgbaToPng(data, w, h, scale) {
    scale = scale || 1;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
    var out = c;
    if (scale > 1) {
      out = document.createElement('canvas');
      out.width = w * scale; out.height = h * scale;
      var x = out.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(c, 0, 0, out.width, out.height);
    }
    return new Promise(function (ok) { out.toBlob(function (b) { b.arrayBuffer().then(function (ab) { ok(new Uint8Array(ab)); }); }, 'image/png'); });
  }
  function exportName() { return ($('exportName').value || 'effect').replace(/[^a-z0-9_-]+/gi, '-'); }
  function sheetFiles(res, name) {
    var sh = PF.sheet(res), scale = +$('sheetScale').value, meta = PF.metaJson(res, name, sh, name + '.png');
    meta.meta.scale = String(scale);
    if (scale > 1) {
      // Scaled sheets: frame rects and pivot are scaled too, so engines can use them verbatim.
      meta.frames.forEach(function (f) { ['x', 'y', 'w', 'h'].forEach(function (k) { f.frame[k] *= scale; }); f.sourceSize = { w: f.frame.w, h: f.frame.h }; f.spriteSourceSize = { x: 0, y: 0, w: f.frame.w, h: f.frame.h }; });
      meta.meta.size = { w: sh.w * scale, h: sh.h * scale };
      meta.pf.fw *= scale; meta.pf.fh *= scale; meta.pf.px *= scale; meta.pf.py *= scale;
    }
    return rgbaToPng(sh.data, sh.w, sh.h, scale).then(function (png) { return { png: png, json: JSON.stringify(meta, null, 1), meta: meta }; });
  }

  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // Store-only ZIP: PNG/GIF are already compressed, so deflate would add code for no gain.
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }

  function primaryRamp(spec) {
    var count = {};
    spec.layers.forEach(function (L) { if (PF.TYPES[L.type] && PF.TYPES[L.type].field && typeof L.ramp === 'string' && !NEUTRAL_RAMPS[L.ramp]) count[L.ramp] = (count[L.ramp] || 0) + 1; });
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0];
  }

  function wire() {
    $('play').addEventListener('click', function () { S.playing = !S.playing; syncPlay(); });
    $('scrub').addEventListener('input', function () { S.playing = false; syncPlay(); S.frame = +$('scrub').value; draw(); });
    $('zoom').addEventListener('change', function () { fitView(); });
    $('bgMode').addEventListener('change', function () { $('stage').dataset.bg = $('bgMode').value; });
    $('stage').dataset.bg = 'checker';
    addEventListener('resize', function () { if (S.res) fitView(); });
    addEventListener('keydown', function (e) {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); S.playing = !S.playing; syncPlay(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { S.playing = false; syncPlay(); S.frame = (S.frame + (e.key === 'ArrowRight' ? 1 : S.res.n - 1)) % S.res.n; draw(); }
    });

    var add = $('addLayer');
    Object.keys(PF.TYPES).forEach(function (t) { add.appendChild(el('option', { value: t, text: t + (PF.TYPES[t].field ? '' : ' (direct)') })); });
    add.addEventListener('change', function () {
      if (!add.value) return;
      var L = PF.defaults(add.value);
      // Centre new layers on the canvas: schema defaults assume a 64px clip.
      ['x', 'x0'].forEach(function (k) { if (typeof L[k] === 'number') L[k] = Math.round(S.spec.w / 2) - (k === 'x0' ? Math.round(S.spec.w * 0.4) : 0); });
      ['y', 'y0', 'y1'].forEach(function (k) { if (typeof L[k] === 'number') L[k] = Math.round(S.spec.h / 2); });
      if (typeof L.x1 === 'number') L.x1 = Math.round(S.spec.w * 0.9);
      S.spec.layers.push(L);
      S.sel = { kind: 'layer', i: S.spec.layers.length - 1 };
      add.value = '';
      buildPanels(); rerender();
    });
    var addP = $('addPost');
    Object.keys(PF.POST).forEach(function (t) { addP.appendChild(el('option', { value: t, text: t })); });
    addP.addEventListener('change', function () {
      if (!addP.value) return;
      var p = { type: addP.value }, ps = PF.POST[addP.value].params;
      for (var k in ps) p[k] = Array.isArray(ps[k]) ? ps[k][0] : ps[k].select ? ps[k].select[0] : ps[k].color;
      S.spec.post.push(p);
      S.sel = { kind: 'post', i: S.spec.post.length - 1 };
      addP.value = '';
      buildPanels(); rerender();
    });

    $('recolor').addEventListener('click', function () {
      var L = S.spec.layers[S.sel.i];
      if (S.sel.kind !== 'layer' || !L || !L.ramp) { toast('Select a coloured layer first'); return; }
      var from = primaryRamp(S.spec);
      S.spec.layers.forEach(function (o) { if (o !== L && PF.TYPES[o.type] && PF.TYPES[o.type].field && (o.ramp === from || o.ramp === undefined)) o.ramp = JSON.parse(JSON.stringify(L.ramp)); });
      buildPanels(); rerender();
    });

    $('newEffect').addEventListener('click', function () {
      setSpec({ w: 64, h: 64, frames: 14, fps: 14, seed: Math.floor(Math.random() * 9999), layers: [
        { type: 'ring', x: 32, y: 32, ramp: 'arcane' },
        { type: 'particles', x: 32, y: 32, count: 24, ramp: 'arcane', shape: 'spark' }
      ], post: [{ type: 'outline', color: '#120a1a' }] }, 'new-effect');
    });
    $('newCutscene').addEventListener('click', function () {
      setSpec({ w: 160, h: 90, frames: 36, fps: 14, seed: Math.floor(Math.random() * 9999), layers: [
        { type: 'bg', top: '#0d0f1a', bottom: '#2f3561' },
        { type: 'speedlines', x: 80, y: 45, ramp: 'sky' },
        { type: 'figure', x: 50, y: 78, height: 50, pose: 'lunge', ramp: 'ink', cut: 0.01, dither: 0 },
        { type: 'text', text: 'YOUR MOVE', x: 110, y: 40, scale: 2 },
        { type: 'letterbox' }
      ], post: [] }, 'new-cutscene');
    });
    $('importSpec').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      f.text().then(function (t) {
        var j = JSON.parse(t);
        setSpec(j.spec || j, f.name.replace(/\.json$/, '').replace(/\.pf$/, ''));
        toast('Loaded ' + f.name);
      }).catch(function (err) { toast('Not a spec: ' + err.message); });
      e.target.value = '';
    });

    $('exPng').addEventListener('click', function () {
      var n = exportName();
      sheetFiles(S.res, n).then(function (o) { download(n + '.png', new Blob([o.png], { type: 'image/png' })); download(n + '.json', o.json, 'application/json'); });
    });
    $('exGif').addEventListener('click', function () { download(exportName() + '.gif', PF.encodeGIF(S.res, { scale: +$('gifScale').value }), 'image/gif'); });
    $('exSpec').addEventListener('click', function () { download(exportName() + '.pf.json', JSON.stringify({ name: exportName(), spec: S.spec }, null, 1), 'application/json'); });
    $('exFrames').addEventListener('click', function () {
      var n = exportName(), sc = +$('sheetScale').value;
      Promise.all(S.res.frames.map(function (f) { return rgbaToPng(f, S.res.w, S.res.h, sc); })).then(function (pngs) {
        download(n + '-frames.zip', zip(pngs.map(function (p, i) { return { name: n + '/' + String(i).padStart(3, '0') + '.png', data: p }; })));
      });
    });
    $('exLink').addEventListener('click', function () {
      saveHash(true);
      var url = location.href;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied'); }, function () { prompt('Copy this link', url); });
    });
    $('exSet').addEventListener('click', function () {
      var base = exportName(), mode = $('setMode').value, from = primaryRamp(S.spec), jobs = [];
      var variants = mode === 'elements' ? ELEMENT_SET.map(function (e) { return { id: e, ramp: e }; }) : [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return { id: 's' + i, seed: (S.spec.seed || 1) + i * 101 }; });
      if (mode === 'elements' && !from) { toast('This clip has no element ramp to swap'); return; }
      toast('Rendering ' + variants.length + ' variants…');
      var index = {};
      variants.forEach(function (v) {
        var sp = JSON.parse(JSON.stringify(S.spec));
        if (v.ramp) sp.layers.forEach(function (L) { if (L.ramp === from) L.ramp = v.ramp; });
        if (v.seed != null) sp.seed = v.seed;
        var res = PF.render(sp, { assets: S.assets }), nm = base + '-' + v.id;
        jobs.push(sheetFiles(res, nm).then(function (o) {
          index[nm] = o.meta.pf;
          return [{ name: nm + '.png', data: o.png }, { name: nm + '.json', data: o.json }, { name: 'preview/' + nm + '.gif', data: PF.encodeGIF(res, { scale: 2 }) }, { name: 'specs/' + nm + '.pf.json', data: JSON.stringify({ name: nm, spec: sp }) }];
        }));
      });
      Promise.all(jobs).then(function (lists) {
        var files = [].concat.apply([], lists);
        files.push({ name: 'index.json', data: JSON.stringify(index, null, 1) });
        download(base + '-set.zip', zip(files));
      });
    });
  }
  function syncPlay() { $('play').textContent = S.playing ? '❚❚' : '▶'; }

  // Share links keep the whole spec in the URL hash (no server needed on any host).
  var hashTimer = 0;
  function saveHash(now) {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      try {
        var json = JSON.stringify({ n: S.name, s: S.spec });
        if (json.length > 60000) return;
        history.replaceState(null, '', '#pf=' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
      } catch (e) { /* hash too large or blocked: share link just won't update */ }
    }, now ? 0 : 400);
  }
  function loadHash() {
    var m = /#pf=([\w-]+)/.exec(location.hash);
    if (!m) return false;
    try {
      var b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      var o = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
      setSpec(o.s, o.n);
      return true;
    } catch (e) { toast('Share link could not be read'); return false; }
  }

  wire();
  buildFilters();
  if (!loadHash()) loadPreset('fire-slash');
  buildGallery();
  requestAnimationFrame(loop);
  window.PixelForgeEditor = S;
})();
