/*
 * PixelForge runtime player — plays baked sheets (or live-baked specs) inside a game.
 * Presentation-only: needs a DOM/canvas. Games keep calling their own rules code and just
 * ask this to draw.
 *
 *   var clip = await PixelForgePlayer.load('assets/fx/fire-slash.json');   // baked by cli.js / editor
 *   var clip = PixelForgePlayer.bake('fire-slash');                        // render a preset in-browser (needs core.js + presets.js)
 *   PixelForgePlayer.spawn(clip, x, y, { scale: 3, onHit: fn, onDone: fn }); // fire-and-forget on a fixed overlay canvas
 *   PixelForgePlayer.drawFrame(ctx, clip, frameIndex, x, y, scale);          // for games with their own render loop
 *
 * x/y are where the clip's pivot (pf.px/py: the contact point) lands, in CSS pixels.
 * Godot: the same sheet + JSON import as SpriteFrames; onHit maps to a frame_changed signal check.
 */
(function (root) {
  'use strict';
  var overlay = null, octx = null, live = [], raf = 0;

  function clipFrom(img, pf) {
    return { img: img, fw: pf.fw, fh: pf.fh, cols: pf.cols, n: pf.n, fps: pf.fps, loop: !!pf.loop, px: pf.px, py: pf.py, hit: pf.hit, name: pf.name };
  }

  function load(jsonUrl) {
    return fetch(jsonUrl).then(function (r) { return r.json(); }).then(function (meta) {
      var pf = meta.pf;
      if (!pf) throw new Error('not a PixelForge sheet: ' + jsonUrl);
      var src = new URL(meta.meta.image, new URL(jsonUrl, location.href)).href;
      return new Promise(function (ok, fail) {
        var img = new Image();
        img.onload = function () { ok(clipFrom(img, pf)); };
        img.onerror = fail;
        img.src = src;
      });
    });
  }

  function bake(specOrName, opts) {
    var PF = root.PixelForge;
    if (!PF) throw new Error('bake() needs pixelforge/core.js (+ presets.js for names)');
    var spec = typeof specOrName === 'string' ? (PF.presets[specOrName] || {}).spec : specOrName;
    if (!spec) throw new Error('unknown preset ' + specOrName);
    var res = PF.render(spec, opts), sh = PF.sheet(res), c = document.createElement('canvas');
    c.width = sh.w; c.height = sh.h;
    c.getContext('2d').putImageData(new ImageData(sh.data, sh.w, sh.h), 0, 0);
    return clipFrom(c, { fw: res.w, fh: res.h, cols: sh.cols, n: res.n, fps: res.fps, loop: res.loop, px: res.meta.px, py: res.meta.py, hit: res.meta.hit, name: typeof specOrName === 'string' ? specOrName : 'custom' });
  }

  function drawFrame(ctx, clip, f, x, y, scale, flip) {
    scale = scale || 1;
    f = Math.max(0, Math.min(clip.n - 1, f | 0));
    var sx = (f % clip.cols) * clip.fw, sy = Math.floor(f / clip.cols) * clip.fh;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(clip.img, sx, sy, clip.fw, clip.fh, -clip.px * scale, -clip.py * scale, clip.fw * scale, clip.fh * scale);
    ctx.restore();
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('canvas');
    overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:600;';
    document.body.appendChild(overlay);
    octx = overlay.getContext('2d');
    function fit() {
      var d = Math.min(2, root.devicePixelRatio || 1);
      overlay.width = Math.round(innerWidth * d); overlay.height = Math.round(innerHeight * d);
      octx.setTransform(d, 0, 0, d, 0, 0);
    }
    addEventListener('resize', fit); fit();
  }

  function tick(now) {
    raf = 0;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    for (var i = live.length - 1; i >= 0; i--) {
      var s = live[i], f = Math.floor((now - s.t0) / 1000 * s.clip.fps * (s.speed || 1));
      if (!s.hitFired && f >= s.clip.hit) { s.hitFired = true; if (s.onHit) s.onHit(); }
      if (f >= s.clip.n) {
        if (s.loop) { s.t0 = now; f = 0; s.hitFired = false; }
        else { live.splice(i, 1); if (s.onDone) s.onDone(); continue; }
      }
      drawFrame(octx, s.clip, f, s.x, s.y, s.scale, s.flip);
    }
    if (live.length) raf = requestAnimationFrame(tick);
  }

  // Returns a handle with stop(); loop clips (auras/status) keep playing until stopped.
  function spawn(clip, x, y, o) {
    o = o || {};
    ensureOverlay();
    var s = { clip: clip, x: x, y: y, scale: o.scale || 3, flip: !!o.flip, speed: o.speed, loop: o.loop == null ? clip.loop : o.loop, onHit: o.onHit, onDone: o.onDone, t0: performance.now(), hitFired: false };
    live.push(s);
    if (!raf) raf = requestAnimationFrame(tick);
    return { stop: function () { var i = live.indexOf(s); if (i >= 0) live.splice(i, 1); } };
  }

  root.PixelForgePlayer = { load: load, bake: bake, spawn: spawn, drawFrame: drawFrame };
})(typeof self !== 'undefined' ? self : this);
