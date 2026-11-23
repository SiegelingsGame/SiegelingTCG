/**
 * Campaign HD-2D world renderer — Three.js, patterned on AnimeVsPlus2/js/world3d.js.
 * Real 3D ground + buildings; Bob / palms / props are upright pixel cut-outs with shadows.
 * Gameplay (move, collide, interact) stays in campaign-overworld.js — this only draws.
 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  if (!THREE) return;

  var ASSET = '/img/campaign/sanctuary/';
  var BOB = '/img/sprites/squire-bob/';

  function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
  function col(c) { return new THREE.Color(c); }
  function nearest(t) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }
  function loadTex(url, cb) {
    var loader = new THREE.TextureLoader();
    loader.load(url, function (t) {
      nearest(t);
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding != null) t.encoding = THREE.sRGBEncoding;
      if (cb) cb(t);
    }, undefined, function () { if (cb) cb(null); });
    return null;
  }

  function supported() {
    try {
      var c = document.createElement('canvas');
      return !!(root.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  function World3D(opts) {
    this.host = opts.host;
    this.onReady = opts.onReady || function () {};
    this.ready = false;
    this.buildings = [];
    this.cutouts = [];
    this.actors = {};
    this.nearId = null;
    this.mapW = 32;
    this.mapH = 24;
    this._raf = 0;
    this.camPos = V3(0, 12, 14);
    this.camLook = V3(0, 0.6, 0);
    if (!supported()) return;
    this._init();
  }

  World3D.supported = supported;

  World3D.prototype._init = function () {
    var host = this.host;
    host.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cm-ow3-canvas';
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated;touch-action:none';
    host.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    if (THREE.SRGBColorSpace && 'outputColorSpace' in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding != null) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    this.scene = new THREE.Scene();
    this.scene.background = col('#f2b27a');
    this.scene.fog = new THREE.Fog(col('#e8a878'), 18, 42);

    this.hemi = new THREE.HemisphereLight(col('#ffe2c4'), col('#5a4a6a'), 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(col('#ffcf9a'), 0.95);
    this.sun.position.set(-8, 16, -6);
    this.sun.castShadow = true;
    // Keep Vector2 / OrthographicCamera instances — Object.assign(plain) breaks WebGL uniforms.
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.05;
    var scam = this.sun.shadow.camera;
    scam.left = -20; scam.right = 20; scam.top = 20; scam.bottom = -20;
    scam.near = 1; scam.far = 50;
    scam.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.propPlane = new THREE.PlaneGeometry(1, 1);
    this.propPlane.translate(0, 0.5, 0);
    this.texCache = {};
    this.ready = true;
    this._resize();
    var self = this;
    root.addEventListener('resize', function () { self._resize(); });
    // Stage often mounts while display:none — observe the host so we resize when Sanctuary shows.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(this.host);
    }
    this.onReady();
  };

  World3D.prototype._resize = function () {
    if (!this.renderer) return;
    var r = this.host.getBoundingClientRect();
    var w = Math.max(2, Math.floor(r.width));
    var h = Math.max(2, Math.floor(r.height));
    if (w < 4 || h < 4) return; // still hidden / zero layout
    // Render at half res then upscale for crisp HD-2D pixels (AnimeVsPlus2 pattern).
    var rw = Math.max(2, Math.floor(w * 0.55));
    var rh = Math.max(2, Math.floor(h * 0.55));
    if (this._lastRw === rw && this._lastRh === rh && this._lastCssW === w && this._lastCssH === h) return;
    this._lastRw = rw; this._lastRh = rh; this._lastCssW = w; this._lastCssH = h;
    this.renderer.setSize(rw, rh, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 0.85 ? 46 : 38;
    this.camera.updateProjectionMatrix();
  };

  World3D.prototype.resize = function () {
    this._lastRw = this._lastRh = this._lastCssW = this._lastCssH = 0;
    this._resize();
  };

  World3D.prototype._getTex = function (url, cb) {
    var self = this;
    if (this.texCache[url]) { if (cb) cb(this.texCache[url]); return this.texCache[url]; }
    loadTex(url, function (t) {
      if (t) self.texCache[url] = t;
      if (cb) cb(t);
    });
    return null;
  };

  World3D.prototype._clearSceneContent = function () {
    var self = this;
    // Remove previous sanctuary/realm meshes (keep lights).
    var doomed = [];
    this.scene.traverse(function (o) {
      if (o.userData && o.userData.cmWorld) doomed.push(o);
    });
    doomed.forEach(function (o) {
      self.scene.remove(o);
      if (o.geometry) o.geometry.dispose();
    });
    this.buildings = [];
    this.cutouts = [];
    this.actors = {};
    this.lampLights = [];
  };

  World3D.prototype._mark = function (obj) {
    obj.userData.cmWorld = true;
    return obj;
  };

  World3D.prototype._paintGroundCanvas = function (kindAt, tintBase) {
    // One canvas atlas → one mesh. Avoids per-tile seams / z-fighting (AnimeVs uses chunk meshes).
    var tw = 32, th = 32;
    this._groundTw = tw;
    this._groundTh = th;
    var canvas = document.createElement('canvas');
    canvas.width = this.mapW * tw;
    canvas.height = this.mapH * th;
    var g = canvas.getContext('2d');
    g.fillStyle = tintBase || '#c9a56a';
    g.fillRect(0, 0, canvas.width, canvas.height);
    var x, z, k, c;
    var colors = {
      sand: '#c9a56a', sandb: '#b8955c', path: '#e6d3a0', wood: '#d4b06a'
    };
    for (z = 0; z < this.mapH; z++) {
      for (x = 0; x < this.mapW; x++) {
        k = kindAt(x, z);
        c = colors[k] || colors.sand;
        g.fillStyle = c;
        g.fillRect(x * tw, z * th, tw, th);
        // Pixel grain so the plane still reads as tile art, not flat CGI.
        g.fillStyle = 'rgba(0,0,0,' + (((x + z) % 3 === 0) ? '0.06' : '0.02') + ')';
        g.fillRect(x * tw + 2, z * th + 2, tw - 4, th - 4);
        if (k === 'path' || k === 'wood') {
          g.strokeStyle = 'rgba(80,50,20,0.18)';
          g.strokeRect(x * tw + 0.5, z * th + 0.5, tw - 1, th - 1);
        }
      }
    }
    var tex = nearest(new THREE.CanvasTexture(canvas));
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    var geo = new THREE.PlaneGeometry(this.mapW, this.mapH);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshLambertMaterial({ map: tex });
    var mesh = this._mark(new THREE.Mesh(geo, mat));
    mesh.position.set(this.mapW / 2, 0, this.mapH / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this._groundCanvas = canvas;
    this._groundCtx = g;
    this._groundTex = tex;
    this._groundMat = mat;
    return mesh;
  };

  World3D.prototype._stampGroundTextures = function (regions) {
    var self = this;
    if (!this._groundCtx || !regions) return;
    var tw = this._groundTw || 32, th = this._groundTh || 32;
    regions.forEach(function (r) {
      var img = new Image();
      img.onload = function () {
        var x, z;
        for (z = r.z0; z <= r.z1; z++) {
          for (x = r.x0; x <= r.x1; x++) {
            self._groundCtx.drawImage(img, x * tw, z * th, tw, th);
          }
        }
        self._groundTex.needsUpdate = true;
        self._groundMat.needsUpdate = true;
      };
      img.src = r.url;
    });
  };

  World3D.prototype._addCutout = function (url, x, z, w, h, lift) {
    lift = lift || 0;
    var mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, alphaTest: 0.45,
      side: THREE.DoubleSide, depthWrite: true
    });
    var mesh = this._mark(new THREE.Mesh(this.propPlane.clone(), mat));
    mesh.scale.set(w, h, 1);
    mesh.position.set(x, lift, z);
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, alphaTest: 0.45
    });
    this.scene.add(mesh);
    this.cutouts.push(mesh);
    this._getTex(url, function (t) {
      if (!t) return;
      mat.map = t;
      mat.needsUpdate = true;
      mesh.customDepthMaterial.map = t;
    });
    return mesh;
  };

  World3D.prototype._addLamp = function (x, z) {
    var pole = this._mark(new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.9, 0.08),
      new THREE.MeshLambertMaterial({ color: col('#2c2622') })
    ));
    pole.position.set(x, 0.95, z);
    pole.castShadow = true;
    this.scene.add(pole);
    var lan = this._mark(new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.3, 0.26),
      new THREE.MeshBasicMaterial({ color: col('#ffd27a') })
    ));
    lan.position.set(x, 2.05, z);
    this.scene.add(lan);
    var pl = this._mark(new THREE.PointLight(col('#ffcf7a'), 0.7, 7, 1.8));
    pl.position.set(x, 1.95, z);
    this.scene.add(pl);
    this.lampLights.push(pl);
  };

  World3D.prototype._addBuildingBox = function (b) {
    // 3D box with pixel face textures — Paper Mario solidity in real space.
    var w = b.w || 2.4;
    var d = b.d || 2.0;
    var h = b.h || 2.2;
    var cx = b.x + w / 2;
    var cz = b.z + d / 2;
    var wallMat = new THREE.MeshLambertMaterial({ color: col(b.wall || '#e8dcc8') });
    var body = this._mark(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat));
    body.position.set(cx, h / 2, cz);
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);
    if (b.faceUrl) {
      this._getTex(b.faceUrl, function (t) {
        if (!t) return;
        // Front face (+Z toward camera approach from south)
        var mats = [
          wallMat, wallMat,
          wallMat, wallMat,
          new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.3 }),
          wallMat
        ];
        body.material = mats;
      });
    }
    // Sign billboard in front
    if (b.label) {
      var canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 64;
      var g = canvas.getContext('2d');
      g.fillStyle = 'rgba(12,18,36,0.88)';
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = '#f3e7c2';
      g.font = 'bold 22px serif';
      g.textAlign = 'center';
      g.fillText(b.label, 128, 28);
      g.font = '16px sans-serif';
      g.fillStyle = 'rgba(243,231,194,0.8)';
      g.fillText(b.sub || '', 128, 50);
      var signTex = nearest(new THREE.CanvasTexture(canvas));
      var sign = this._mark(new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.45),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: true })
      ));
      sign.position.set(cx, h + 0.35, cz + d / 2 + 0.05);
      this.scene.add(sign);
    }
    // Bang marker (hidden until near)
    var bang = this._mark(new THREE.Sprite(new THREE.SpriteMaterial({
      color: col('#f0d79a'), transparent: true, opacity: 0
    })));
    // Use a canvas for "!"
    var bc = document.createElement('canvas'); bc.width = bc.height = 64;
    var bg = bc.getContext('2d');
    bg.fillStyle = '#f0d79a'; bg.beginPath(); bg.arc(32, 32, 28, 0, Math.PI * 2); bg.fill();
    bg.fillStyle = '#1a1206'; bg.font = 'bold 40px sans-serif'; bg.textAlign = 'center';
    bg.textBaseline = 'middle'; bg.fillText('!', 32, 34);
    bang.material.map = nearest(new THREE.CanvasTexture(bc));
    bang.material.needsUpdate = true;
    bang.scale.set(0.55, 0.55, 1);
    bang.position.set(cx, h + 0.9, cz);
    this.scene.add(bang);

    this.buildings.push({
      id: b.id, act: b.act, landId: b.landId, label: b.label, sub: b.sub, disabled: !!b.disabled,
      x: b.x, z: b.z, w: w, d: d, h: h, cx: cx, cz: cz, body: body, bang: bang
    });
  };

  World3D.prototype._addPalm = function (x, z, scale) {
    scale = scale || 1;
    return this._addCutout(ASSET + 'decor/palm.webp', x, z, 1.4 * scale, 2.0 * scale, 0);
  };

  World3D.prototype._addFountain = function (x, z) {
    var stone = new THREE.MeshLambertMaterial({ color: col('#c8c0b4') });
    var basin = this._mark(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.4, 16), stone));
    basin.position.set(x, 0.2, z);
    basin.castShadow = basin.receiveShadow = true;
    this.scene.add(basin);
    var water = this._mark(new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 16),
      new THREE.MeshLambertMaterial({ color: col('#4aa0e8'), emissive: col('#1a5a9a'), emissiveIntensity: 0.5 })
    ));
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, 0.42, z);
    this.scene.add(water);
    var col1 = this._mark(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.0, 10), stone));
    col1.position.set(x, 0.8, z);
    col1.castShadow = true;
    this.scene.add(col1);
  };

  World3D.prototype.buildSanctuary = function () {
    if (!this.ready) return;
    this._clearSceneContent();
    this.mapW = 32;
    this.mapH = 24;
    this.scene.background = col('#f2b27a');
    this.scene.fog = new THREE.Fog(col('#e8a878'), 18, 42);

    // Outer grass skirt
    var skirt = this._mark(new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshLambertMaterial({ color: col('#4f9a48') })
    ));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(this.mapW / 2, -0.02, this.mapH / 2);
    skirt.receiveShadow = true;
    this.scene.add(skirt);

    this._paintGroundCanvas(function (x, z) {
      var kind = 'sand';
      if (z >= 10 && z <= 18 && x >= 8 && x <= 22) kind = 'path';
      if (x === 15 || x === 16 || z === 14 || z === 15) kind = 'path';
      if (z >= 12 && z <= 16 && x >= 13 && x <= 18) kind = 'wood';
      if (z <= 7) kind = (x + z) % 3 === 0 ? 'sandb' : 'sand';
      return kind;
    }, '#c9a56a');
    // Stamp Egypt pack textures into the atlas so the plaza still shows real pixel tiles.
    this._stampGroundTextures([
      { url: ASSET + 'ground/wood.webp', x0: 13, z0: 12, x1: 18, z1: 16 },
      { url: ASSET + 'ground/path.webp', x0: 15, z0: 8, x1: 16, z1: 20 },
      { url: ASSET + 'ground/sand.webp', x0: 0, z0: 0, x1: 31, z1: 7 }
    ]);

    // Buildings (logical footprints in tile space)
    var builds = [
      { id: 'house', act: 'flavor', label: 'Squire Lodge', sub: 'Rest · story', x: 6, z: 12, w: 3.2, d: 2.6, h: 2.4, faceUrl: ASSET + 'props/house.webp', wall: '#f4ebe0' },
      { id: 'arena', act: 'preset', label: 'Arena Gate', sub: 'Preset deck', x: 22, z: 12, w: 3.4, d: 2.8, h: 2.3, faceUrl: ASSET + 'props/arena.webp', wall: '#c07050' },
      { id: 'pyramid', act: 'flavor', label: 'Relic Shrine', sub: 'Sanctuary', x: 13.5, z: 9, w: 4.2, d: 3.5, h: 3.2, faceUrl: ASSET + 'props/pyramid-door.webp', wall: '#e2c08e' },
      { id: 'woods', act: 'woods', label: 'Palm Woods', sub: 'Wild capture', x: 13, z: 1.5, w: 5, d: 3, h: 0.4, faceUrl: ASSET + 'decor/palm.webp', wall: '#3f8a3a' },
      { id: 'realms', act: 'realms', label: 'Realm Map', sub: 'Travel', x: 14.5, z: 20, w: 3, d: 2.2, h: 2.0, faceUrl: ASSET + 'props/waystone.webp', wall: '#8a96d8' }
    ];
    // Waystones along the east path — filled later via setWaystones
    builds.forEach(function (b) { this._addBuildingBox(b); }, this);

    this._addFountain(16, 14.5);

    // Palm belt (woods north + accents)
    var palms = [
      [2, 2], [5, 1], [8, 3], [11, 1], [20, 2], [24, 1], [28, 3],
      [3, 5], [26, 5], [1, 8], [29, 8], [4, 11], [27, 11]
    ];
    palms.forEach(function (p, i) {
      this._addPalm(p[0] + 0.5, p[1] + 0.5, 0.9 + (i % 3) * 0.15);
    }, this);

    // Lamps
    [[11, 13], [21, 13], [11, 17], [21, 17], [9, 11], [23, 11]].forEach(function (p) {
      this._addLamp(p[0], p[1]);
    }, this);

    // Pillars + vases as cutouts
    this._addCutout(ASSET + 'props/pillar.webp', 11.5, 10.5, 0.7, 1.6, 0);
    this._addCutout(ASSET + 'props/pillar.webp', 20.5, 10.5, 0.7, 1.6, 0);
    this._addCutout(ASSET + 'props/vase.webp', 12.5, 15.5, 0.55, 0.7, 0);
    this._addCutout(ASSET + 'props/vase.webp', 19.5, 15.5, 0.55, 0.7, 0);

    this.spawn = { x: 16, z: 16.5 };
  };

  World3D.prototype.setWaystones = function (lands) {
    if (!this.ready) return;
    var list = (lands || []).filter(function (l) { return l.unlocked || l.rallied; }).slice(0, 6);
    list.forEach(function (land, i) {
      var colN = i % 3;
      var row = Math.floor(i / 3);
      this._addBuildingBox({
        id: 'way-' + land.id,
        act: 'travel',
        landId: land.id,
        label: land.name,
        sub: ((land.elements && land.elements[0]) || '') + (land.rallied ? ' · rallied' : ''),
        x: 25 + colN * 2.2,
        z: 6 + row * 3.2,
        w: 1.6, d: 1.4, h: 1.8,
        faceUrl: ASSET + 'props/waystone.webp',
        wall: '#8a96d8'
      });
    }, this);
  };

  World3D.prototype.buildRealm = function (cfg) {
    if (!this.ready) return;
    this._clearSceneContent();
    this.mapW = 20;
    this.mapH = 16;
    var el = (cfg && cfg.element || 'fire').toLowerCase();
    var looks = {
      fire: { sky: '#ffb072', fog: '#f2b07a', ground: '#d9b46a' },
      earth: { sky: '#c8e090', fog: '#a8c070', ground: '#8a7a4a' },
      ice: { sky: '#c9dcf2', fog: '#d6e4f4', ground: '#e0ecf8' },
      wind: { sky: '#b8f0d0', fog: '#90d8b0', ground: '#6fbf66' }
    };
    var L = looks[el] || looks.fire;
    this.scene.background = col(L.sky);
    this.scene.fog = new THREE.Fog(col(L.fog), 14, 36);

    var skirt = this._mark(new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshLambertMaterial({ color: col(L.ground) })
    ));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(this.mapW / 2, -0.02, this.mapH / 2);
    skirt.receiveShadow = true;
    this.scene.add(skirt);

    this._paintGroundCanvas(function (x, z) {
      return (x === 9 || x === 10 || z === 8 || z === 7) ? 'path' : 'sand';
    }, L.ground);
    this._stampGroundTextures([
      { url: ASSET + 'ground/sand.webp', x0: 0, z0: 0, x1: this.mapW - 1, z1: this.mapH - 1 },
      { url: ASSET + 'ground/path.webp', x0: 9, z0: 0, x1: 10, z1: this.mapH - 1 }
    ]);

    var rivalDone = !!(cfg && cfg.rivalDone);
    var rallied = !!(cfg && cfg.rallied);
    [
      { id: 'wild', act: 'wild', label: 'Wild Grove', sub: 'Siege capture', x: 3, z: 3, w: 3.2, d: 2.5, h: 0.5, faceUrl: ASSET + 'decor/palm.webp', wall: '#3f8a3a' },
      { id: 'rival', act: 'rival', label: 'Rival Arena', sub: rivalDone ? 'Cleared' : 'Arena duel', x: 13, z: 3.5, w: 3.4, d: 2.6, h: 2.2, faceUrl: ASSET + 'props/arena.webp', wall: '#c07050', disabled: rivalDone },
      { id: 'knight', act: 'knight', label: 'Knight Keep', sub: rallied ? 'Rallied' : 'SiegeKnight', x: 8, z: 1.5, w: 3.8, d: 3.0, h: 2.8, faceUrl: ASSET + 'props/pyramid-door.webp', wall: '#e2c08e', disabled: rallied },
      { id: 'exit', act: 'exit', label: 'Sanctuary', sub: 'Return home', x: 8.5, z: 12, w: 2.6, d: 2.0, h: 1.8, faceUrl: ASSET + 'props/waystone.webp', wall: '#8a96d8' }
    ].forEach(function (b) { this._addBuildingBox(b); }, this);

    this._addPalm(2, 5, 1.1);
    this._addPalm(17, 5, 1.0);
    this._addLamp(6, 8);
    this._addLamp(13, 8);
    this.spawn = { x: 10, z: 9 };
  };

  World3D.prototype._actor = function (id) {
    if (this.actors[id]) return this.actors[id];
    var mat = new THREE.MeshLambertMaterial({
      transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: true
    });
    var mesh = this._mark(new THREE.Mesh(this.propPlane.clone(), mat));
    mesh.scale.set(1.15, 1.45, 1);
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, alphaTest: 0.4
    });
    this.scene.add(mesh);
    var shadow = this._mark(new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    ));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(shadow);
    var ring = this._mark(new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.46, 28),
      new THREE.MeshBasicMaterial({ color: col('#ffffff'), transparent: true, opacity: 0.7, depthWrite: false })
    ));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.scene.add(ring);
    this.actors[id] = { mesh: mesh, shadow: shadow, ring: ring, mat: mat, dir: 'down', pose: 'idle', url: '' };
    return this.actors[id];
  };

  World3D.prototype.setActor = function (id, x, z, dir, walking, frame, size) {
    var a = this._actor(id);
    var pose = walking ? (frame ? 'walk-b' : 'walk-a') : 'idle';
    var url = BOB + dir + '-' + pose + '.webp';
    if (url !== a.url) {
      a.url = url;
      a.dir = dir;
      a.pose = pose;
      this._getTex(url, function (t) {
        if (!t || a.url !== url) return;
        a.mat.map = t;
        a.mat.needsUpdate = true;
        a.mesh.customDepthMaterial.map = t;
      });
    }
    var bob = walking ? Math.abs(Math.sin(performance.now() / 95)) * 0.07 : 0;
    var s = size || 1;
    a.mesh.scale.set(1.15 * s, 1.45 * s, 1);
    a.mesh.position.set(x, bob, z);
    a.shadow.position.set(x, 0.012, z);
    a.ring.position.set(x, 0.03, z);
    // Face the camera (yaw only) so the cut-out stays readable — AnimeVsPlus2 first-person style,
    // but always-on for our fixed HD-2D chase cam.
    if (this.camera) {
      a.mesh.rotation.y = Math.atan2(
        this.camPos.x - a.mesh.position.x,
        this.camPos.z - a.mesh.position.z
      );
    }
  };

  World3D.prototype.setFollowerSprite = function (cardId) {
    this.followerCardId = cardId || null;
  };

  World3D.prototype.setNear = function (id) {
    this.nearId = id || null;
    this.buildings.forEach(function (b) {
      if (!b.bang) return;
      b.bang.material.opacity = (b.id === id) ? 1 : 0;
      b.bang.scale.setScalar(b.id === id ? 0.6 : 0.01);
    });
  };

  World3D.prototype.getBuildings = function () {
    return this.buildings.map(function (b) {
      return {
        id: b.id, act: b.act, landId: b.landId, label: b.label, sub: b.sub,
        disabled: b.disabled, x: b.cx, z: b.cz, w: b.w, d: b.d,
        // Approach point on the south face
        approachX: b.cx, approachZ: b.z + b.d + 0.35
      };
    });
  };

  World3D.prototype.projectBuilding = function (id) {
    var b = null;
    for (var i = 0; i < this.buildings.length; i++) {
      if (this.buildings[i].id === id) { b = this.buildings[i]; break; }
    }
    if (!b) return null;
    var p = V3(b.cx, b.h + 0.6, b.cz).project(this.camera);
    if (Math.abs(p.z) >= 1) return null;
    var r = this.canvas.getBoundingClientRect();
    return { x: (p.x + 1) * r.width / 2, y: (1 - p.y) * r.height / 2 };
  };

  World3D.prototype.frame = function (state) {
    if (!this.ready || !this.renderer) return;
    state = state || {};
    var px = state.x != null ? state.x : 16;
    var pz = state.z != null ? state.z : 16;
    var dir = state.dir || 'down';
    var walking = !!state.walking;
    var frame = state.frame || 0;

    this.setActor('player', px, pz, dir, walking, frame, 1);
    if (state.follower) {
      this.setActor('follower', px - 0.55, pz + 0.7, dir, walking, frame, 0.72);
      this.actors.follower.ring.visible = false;
    } else if (this.actors.follower) {
      this.actors.follower.mesh.visible = false;
      this.actors.follower.shadow.visible = false;
      this.actors.follower.ring.visible = false;
    }
    if (this.actors.player) this.actors.player.mesh.visible = true;

    this.setNear(state.nearId);

    // HD-2D chase camera (AnimeVsPlus2 centered pose): behind & above the leader.
    var target = V3(px, 0.65, pz);
    var portrait = this.camera.aspect < 0.85;
    var off = portrait ? V3(0, 11.5, 12.5) : V3(0, 10.5, 12);
    var wantPos = target.clone().add(off);
    var wantLook = target;
    this.camPos.lerp(wantPos, 0.14);
    this.camLook.lerp(wantLook, 0.14);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();

    // Billboard palms/props slightly toward camera
    var self = this;
    this.cutouts.forEach(function (m) {
      m.rotation.y = Math.atan2(self.camPos.x - m.position.x, self.camPos.z - m.position.z);
    });

    this.renderer.render(this.scene, this.camera);
  };

  World3D.prototype.startLoop = function (getState) {
    var self = this;
    if (this._raf) cancelAnimationFrame(this._raf);
    function tick() {
      self._raf = requestAnimationFrame(tick);
      self.frame(typeof getState === 'function' ? getState() : getState);
    }
    tick();
  };

  World3D.prototype.stopLoop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };

  World3D.prototype.dispose = function () {
    this.stopLoop();
    if (this._ro) { try { this._ro.disconnect(); } catch (e) {} this._ro = null; }
    if (this.renderer) this.renderer.dispose();
  };

  root.CampaignWorld3D = World3D;
})(window);
