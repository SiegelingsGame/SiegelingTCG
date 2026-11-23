/**
 * Campaign overworld — Anime Vs + Map style 2.5D walkabout.
 * Sanctuary town + palm woods (Egypt pixel pack) and realm lands.
 * Squire Bob is the billboard avatar; buildings are Paper Mario popups.
 */
(function (global) {
  'use strict';

  var SPRITE_BASE = '/img/sprites/squire-bob/';
  var ASSET = '/img/campaign/sanctuary/';

  function dirFromVector(dx, dy) {
    if (!dx && !dy) return null;
    var ang = Math.atan2(dy, dx);
    var oct = Math.round(ang / (Math.PI / 4));
    var map = {
      0: 'right', 1: 'down-right', 2: 'down', 3: 'down-left', 4: 'left',
      '-4': 'left', '-3': 'up-left', '-2': 'up', '-1': 'up-right'
    };
    return map[String(oct)] || 'down';
  }

  function Overworld(opts) {
    this.root = opts.root;
    this.onInteract = opts.onInteract || function () {};
    this.onExit = opts.onExit || function () {};
    this.enabled = false;
    this.keys = {};
    this.pad = { x: 0, y: 0 };
    this.player = { x: 0, y: 0, dir: 'down', walking: false, frame: 0, frameT: 0 };
    this.camera = { x: 0, y: 0 };
    this.buildings = [];
    this.near = null;
    this.mapId = 'sanctuary';
    this.worldW = 1480;
    this.worldH = 1080;
    this.speed = 130;
    this._raf = 0;
    this._last = 0;
    this._bound = false;
    this.els = {};
    this.lands = [];
  }

  Overworld.prototype.mount = function () {
    if (!this.root) return;
    this.root.innerHTML =
      '<div class="cm-ow is-sanctuary" id="cmOw">' +
        '<div class="cm-ow-sky" aria-hidden="true"></div>' +
        '<div class="cm-ow-haze" aria-hidden="true"></div>' +
        '<div class="cm-ow-viewport">' +
          '<div class="cm-ow-plane">' +
            '<div class="cm-ow-world" id="cmOwWorld">' +
              '<div class="cm-ow-ground" id="cmOwGround"></div>' +
              '<div class="cm-ow-props" id="cmOwProps"></div>' +
              '<div class="cm-ow-player" id="cmOwPlayer" aria-label="Squire Bob">' +
                '<span class="cm-ow-ring" aria-hidden="true"></span>' +
                '<img id="cmOwPlayerImg" alt="Squire Bob" draggable="false">' +
                '<span class="cm-ow-shadow" aria-hidden="true"></span>' +
              '</div>' +
              '<div class="cm-ow-follower" id="cmOwFollower" hidden>' +
                '<span class="cm-ow-follower-art" id="cmOwFollowerArt"></span>' +
                '<span class="cm-ow-shadow is-small" aria-hidden="true"></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cm-ow-topbar">' +
          '<div class="cm-ow-loc"><span class="cm-ow-loc-icon" aria-hidden="true"></span>' +
            '<span id="cmOwPlace">Sanctuary</span></div>' +
          '<div class="cm-ow-curr">' +
            '<span id="cmOwGold">◎ 0</span>' +
            '<span id="cmOwFlags">⚑ 0</span>' +
          '</div>' +
          '<div class="cm-ow-minimap" id="cmOwMinimap" aria-hidden="true">' +
            '<canvas id="cmOwMiniCanvas" width="96" height="96"></canvas>' +
            '<span class="cm-ow-mini-dot" id="cmOwMiniDot"></span>' +
          '</div>' +
        '</div>' +
        '<p class="cm-ow-banner" id="cmOwBanner" role="status"></p>' +
        '<div class="cm-ow-prompt" id="cmOwPrompt" hidden>' +
          '<button type="button" class="cm-ow-prompt-btn" id="cmOwPromptBtn"></button>' +
        '</div>' +
        '<div class="cm-ow-stick" id="cmOwStick" aria-label="Move">' +
          '<div class="cm-ow-stick-base"><div class="cm-ow-stick-knob" id="cmOwKnob"></div></div>' +
        '</div>' +
        '<button type="button" class="cm-ow-btn-a" id="cmOwBtnA" aria-label="Interact">A</button>' +
      '</div>';

    this.els = {
      ow: this.root.querySelector('#cmOw'),
      world: this.root.querySelector('#cmOwWorld'),
      ground: this.root.querySelector('#cmOwGround'),
      props: this.root.querySelector('#cmOwProps'),
      player: this.root.querySelector('#cmOwPlayer'),
      playerImg: this.root.querySelector('#cmOwPlayerImg'),
      follower: this.root.querySelector('#cmOwFollower'),
      followerArt: this.root.querySelector('#cmOwFollowerArt'),
      place: this.root.querySelector('#cmOwPlace'),
      banner: this.root.querySelector('#cmOwBanner'),
      prompt: this.root.querySelector('#cmOwPrompt'),
      promptBtn: this.root.querySelector('#cmOwPromptBtn'),
      gold: this.root.querySelector('#cmOwGold'),
      flags: this.root.querySelector('#cmOwFlags'),
      miniCanvas: this.root.querySelector('#cmOwMiniCanvas'),
      miniDot: this.root.querySelector('#cmOwMiniDot'),
      knob: this.root.querySelector('#cmOwKnob')
    };
    this._bindInput();
  };

  Overworld.prototype._bindInput = function () {
    if (this._bound) return;
    this._bound = true;
    var self = this;
    window.addEventListener('keydown', function (ev) {
      if (!self.enabled) return;
      var k = ev.key.toLowerCase();
      if (k === 'arrowup' || k === 'w' || k === 'arrowdown' || k === 's' ||
          k === 'arrowleft' || k === 'a' || k === 'arrowright' || k === 'd') {
        self.keys[k] = true;
        ev.preventDefault();
      } else if (k === 'enter' || k === ' ') {
        self.tryInteract();
        ev.preventDefault();
      } else if (k === 'escape') {
        self.onExit();
      }
    }, { passive: false });
    window.addEventListener('keyup', function (ev) {
      self.keys[ev.key.toLowerCase()] = false;
    });

    if (this.els.promptBtn) {
      this.els.promptBtn.addEventListener('click', function () { self.tryInteract(); });
    }
    var btnA = this.root.querySelector('#cmOwBtnA');
    if (btnA) btnA.addEventListener('click', function () { self.tryInteract(); });

    // Analog stick (Anime Vs style)
    var stick = this.root.querySelector('#cmOwStick');
    if (!stick) return;
    var dragging = false;
    var origin = { x: 0, y: 0 };
    function setVec(clientX, clientY) {
      var rect = stick.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var max = 42;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var cl = Math.min(max, len);
      dx = dx / len * cl;
      dy = dy / len * cl;
      self.pad.x = dx / max;
      self.pad.y = dy / max;
      if (self.els.knob) {
        self.els.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }
    }
    function clearPad() {
      self.pad.x = 0; self.pad.y = 0;
      if (self.els.knob) self.els.knob.style.transform = 'translate(0,0)';
    }
    stick.addEventListener('pointerdown', function (ev) {
      dragging = true;
      stick.setPointerCapture(ev.pointerId);
      setVec(ev.clientX, ev.clientY);
      ev.preventDefault();
    });
    stick.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      setVec(ev.clientX, ev.clientY);
      ev.preventDefault();
    });
    function endPad(ev) {
      dragging = false;
      clearPad();
      ev.preventDefault();
    }
    stick.addEventListener('pointerup', endPad);
    stick.addEventListener('pointercancel', endPad);
    stick.addEventListener('pointerleave', function (ev) {
      if (dragging) endPad(ev);
    });
  };

  Overworld.prototype._tile = function (kind, c, r) {
    var src = ASSET + 'ground/' + (kind === 'wood' ? 'wood.webp'
      : kind === 'path' ? 'path.webp'
      : kind === 'sandb' ? 'sand-b.webp'
      : 'sand.webp');
    return '<span class="cm-ow-tile is-' + kind + '" style="grid-column:' + (c + 1) +
      ';grid-row:' + (r + 1) + ';background-image:url(' + src + ')"></span>';
  };

  Overworld.prototype._paintGroundSanctuary = function () {
    var cols = 18;
    var rows = 14;
    var html = '';
    var r, c, kind;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        kind = 'sand';
        // Town plaza (center)
        if (r >= 6 && r <= 10 && c >= 5 && c <= 12) kind = 'path';
        // Cross roads
        if (c === 8 || c === 9 || r === 8 || r === 9) kind = 'path';
        // Boardwalk plaza near fountain
        if (r >= 7 && r <= 9 && c >= 7 && c <= 10) kind = 'wood';
        // Woods north — denser sand/edge feel
        if (r <= 4) kind = (c + r) % 3 === 0 ? 'sandb' : 'sand';
        // South approach
        if (r >= 11 && (c === 8 || c === 9)) kind = 'wood';
        html += this._tile(kind, c, r);
      }
    }
    this.els.ground.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    this.els.ground.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    this.els.ground.innerHTML = html;
  };

  Overworld.prototype._paintGroundRealm = function () {
    var cols = 14;
    var rows = 10;
    var html = '';
    var r, c, kind;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        kind = 'sand';
        if (c === 6 || c === 7 || r === 5 || r === 4) kind = 'path';
        if (c >= 5 && c <= 8 && r >= 3 && r <= 6) kind = 'path';
        if ((r + c) % 5 === 0) kind = 'sandb';
        html += this._tile(kind, c, r);
      }
    }
    this.els.ground.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    this.els.ground.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    this.els.ground.innerHTML = html;
  };

  Overworld.prototype._prop = function (cls, src, x, y, w, h, extra) {
    return '<span class="cm-ow-decor ' + cls + '" style="left:' + x + 'px;top:' + y +
      'px;width:' + w + 'px;height:' + h + 'px;background-image:url(' + src + ')"' +
      (extra || '') + '></span>';
  };

  Overworld.prototype._buildBtn = function (b) {
    var img = b.img ? '<img class="cm-ow-build-img" src="' + b.img + '" alt="">' : '';
    return '<button type="button" class="cm-ow-build is-' + (b.pop || 'house') +
      (b.disabled ? ' is-disabled' : '') +
      '" data-build="' + b.id + '" data-act="' + b.act + '"' +
      (b.landId ? ' data-land="' + b.landId + '"' : '') +
      ' style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px"' +
      (b.disabled ? ' disabled' : '') + '>' +
      '<span class="cm-ow-build-shadow"></span>' +
      '<span class="cm-ow-build-face">' + img +
        '<span class="cm-ow-build-sign"><b>' + b.label + '</b><small>' + b.sub + '</small></span>' +
      '</span>' +
      '<span class="cm-ow-build-bang" aria-hidden="true">!</span>' +
    '</button>';
  };

  Overworld.prototype.loadSanctuary = function (cfg) {
    cfg = cfg || {};
    this.mapId = 'sanctuary';
    this.worldW = 1480;
    this.worldH = 1080;
    this.lands = cfg.lands || [];
    if (this.els.ow) {
      this.els.ow.classList.add('is-sanctuary');
      this.els.ow.classList.remove('is-realm');
      this.els.ow.dataset.element = 'light';
    }
    this.els.place.textContent = 'Sanctuary Plaza';
    this.els.banner.textContent = cfg.message ||
      'Welcome home, Squire. Explore the plaza, walk the palm woods, or take a waystone to a realm.';
    if (this.els.gold) this.els.gold.textContent = '◎ ' + (cfg.gold != null ? cfg.gold : 0);
    if (this.els.flags) this.els.flags.textContent = '⚑ ' + (cfg.rallies != null ? cfg.rallies : 0);

    this._paintGroundSanctuary();

    var buildings = [
      { id: 'house', act: 'flavor', label: 'Squire Lodge', sub: 'Rest · story', x: 220, y: 560, w: 150, h: 130, pop: 'house', img: ASSET + 'props/house.webp' },
      { id: 'arena', act: 'preset', label: 'Arena Gate', sub: 'Preset deck', x: 980, y: 540, w: 160, h: 120, pop: 'arena', img: ASSET + 'props/arena.webp' },
      { id: 'pyramid', act: 'flavor', label: 'Relic Shrine', sub: 'Sanctuary', x: 620, y: 420, w: 170, h: 150, pop: 'keep', img: ASSET + 'props/pyramid-door.webp' },
      { id: 'woods', act: 'woods', label: 'Palm Woods', sub: 'Wild capture', x: 600, y: 90, w: 180, h: 110, pop: 'grove', img: ASSET + 'decor/palm.webp' },
      { id: 'realms', act: 'realms', label: 'Realm Map', sub: 'Travel', x: 640, y: 860, w: 140, h: 100, pop: 'waystone', img: ASSET + 'props/waystone.webp' }
    ];

    // Waystones for unlocked elemental lands along the east path
    var unlocked = (cfg.lands || []).filter(function (l) { return l.unlocked || l.rallied; });
    unlocked.slice(0, 6).forEach(function (land, i) {
      var col = i % 3;
      var row = Math.floor(i / 3);
      buildings.push({
        id: 'way-' + land.id,
        act: 'travel',
        landId: land.id,
        label: land.name,
        sub: ((land.elements && land.elements[0]) || '') + (land.rallied ? ' · rallied' : ''),
        x: 1120 + col * 100,
        y: 200 + row * 140,
        w: 88,
        h: 100,
        pop: 'waystone',
        img: ASSET + 'props/waystone.webp'
      });
    });

    this.buildings = buildings;
    var props = this.els.props;
    var html = buildings.map(this._buildBtn).join('');

    // Fountain centerpiece
    html += this._prop('is-fountain', ASSET + 'props/fountain.webp', 690, 620, 100, 84);

    // Palm woods belt (north)
    var palms = [
      [80, 40], [200, 20], [340, 50], [480, 15], [820, 30], [960, 55], [1100, 25],
      [140, 160], [420, 140], [900, 150], [1280, 80], [1360, 180],
      [60, 280], [1320, 300]
    ];
    palms.forEach(function (p, i) {
      var src = ASSET + 'decor/' + (i % 3 === 0 ? 'palm.webp' : (i % 3 === 1 ? 'palm-shadow.webp' : 'palm.webp'));
      html += '<span class="cm-ow-decor is-palm" style="left:' + p[0] + 'px;top:' + p[1] +
        'px;width:' + (90 + (i % 3) * 18) + 'px;height:' + (120 + (i % 2) * 20) +
        'px;background-image:url(' + src + ')"></span>';
    });

    // Lamps along plaza
    [[520, 580], [860, 580], [520, 760], [860, 760], [400, 500], [980, 500]].forEach(function (p) {
      html += '<span class="cm-ow-decor is-lamp" style="left:' + p[0] + 'px;top:' + p[1] +
        'px;width:28px;height:84px;background-image:url(' + ASSET + 'decor/lamp.webp)"></span>';
    });

    // Pillars + vases
    html += this._prop('is-pillar', ASSET + 'props/pillar.webp', 480, 450, 48, 96);
    html += this._prop('is-pillar', ASSET + 'props/pillar.webp', 900, 450, 48, 96);
    html += this._prop('is-vase', ASSET + 'props/vase.webp', 560, 700, 40, 48);
    html += this._prop('is-vase', ASSET + 'props/vase.webp', 820, 700, 40, 48);
    html += this._prop('is-bush', ASSET + 'decor/bush.webp', 300, 720, 56, 48);
    html += this._prop('is-bush', ASSET + 'decor/sprout.webp', 1050, 700, 48, 48);

    props.innerHTML = html;

    this.player.x = 740;
    this.player.y = 720;
    this.player.dir = 'up';
    this.player.walking = false;
    this.near = null;
    this._setFollower(cfg.follower);
    this._paintPlayer();
    this._updatePrompt();
    this._drawMinimap();
  };

  Overworld.prototype.loadLand = function (cfg) {
    cfg = cfg || {};
    this.mapId = 'realm';
    this.worldW = 920;
    this.worldH = 640;
    if (this.els.ow) {
      this.els.ow.classList.remove('is-sanctuary');
      this.els.ow.classList.add('is-realm');
      this.els.ow.style.setProperty('--ow-land-img', cfg.background ? 'url("' + cfg.background + '")' : 'none');
      this.els.ow.dataset.element = (cfg.element || 'neutral').toLowerCase();
    }
    this.els.place.textContent = cfg.name || 'Land';
    this.els.banner.textContent = cfg.message || 'Walk to a popup building to challenge it.';
    if (this.els.gold) this.els.gold.textContent = '◎ ' + (cfg.gold != null ? cfg.gold : 0);
    if (this.els.flags) this.els.flags.textContent = '⚑ ' + (cfg.rallies != null ? cfg.rallies : 0);

    this._paintGroundRealm();

    var rivalDone = !!cfg.rivalDone;
    var rallied = !!cfg.rallied;
    this.buildings = [
      { id: 'wild', act: 'wild', label: 'Wild Grove', sub: 'Siege capture', x: 210, y: 180, w: 120, h: 100, pop: 'grove', img: ASSET + 'decor/palm.webp' },
      { id: 'rival', act: 'rival', label: 'Rival Arena', sub: rivalDone ? 'Cleared' : 'Arena duel', x: 620, y: 190, w: 140, h: 110, pop: 'arena', img: ASSET + 'props/arena.webp', disabled: rivalDone },
      { id: 'knight', act: 'knight', label: 'Knight Keep', sub: rallied ? 'Rallied' : 'SiegeKnight', x: 400, y: 100, w: 150, h: 120, pop: 'keep', img: ASSET + 'props/pyramid-door.webp', disabled: rallied },
      { id: 'exit', act: 'exit', label: 'Sanctuary', sub: 'Return home', x: 420, y: 460, w: 110, h: 90, pop: 'waystone', img: ASSET + 'props/waystone.webp' }
    ];

    var html = this.buildings.map(this._buildBtn).join('');
    html += this._prop('is-palm', ASSET + 'decor/palm.webp', 60, 80, 100, 130);
    html += this._prop('is-palm', ASSET + 'decor/palm.webp', 760, 90, 110, 140);
    html += this._prop('is-lamp', ASSET + 'decor/lamp.webp', 300, 300, 28, 84);
    html += this._prop('is-lamp', ASSET + 'decor/lamp.webp', 560, 300, 28, 84);
    html += this._prop('is-bush', ASSET + 'decor/bush.webp', 140, 400, 56, 48);
    this.els.props.innerHTML = html;

    this.player.x = 460;
    this.player.y = 360;
    this.player.dir = 'up';
    this.near = null;
    this._setFollower(cfg.follower);
    this._paintPlayer();
    this._updatePrompt();
    this._drawMinimap();
  };

  Overworld.prototype._setFollower = function (follower) {
    var el = this.els.follower;
    var art = this.els.followerArt;
    if (!el || !art) return;
    if (!follower || !follower.id) { el.hidden = true; return; }
    el.hidden = false;
    var sheet = global.SiegeSprites && global.SiegeSprites.forCard(follower.id);
    if (sheet) {
      var frames = sheet.frames.idle || 1;
      art.innerHTML = '<span class="cm-ow-follow-sprite" style="background-image:url(' +
        sheet.dir + 'idle.webp);background-size:' + (frames * 100) + '% 100%"></span>';
    } else if (follower.artUrl) {
      art.innerHTML = '<img src="' + follower.artUrl + '" alt="">';
    } else {
      art.innerHTML = '<span class="cm-ow-follow-dot"></span>';
    }
  };

  Overworld.prototype.enable = function (on) {
    this.enabled = !!on;
    if (this.enabled) {
      this._last = performance.now();
      if (!this._raf) this._loop(this._last);
    } else if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  };

  Overworld.prototype._loop = function (now) {
    var self = this;
    this._raf = requestAnimationFrame(function (t) { self._loop(t); });
    if (!this.enabled) return;
    var dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this._step(dt);
  };

  Overworld.prototype._inputVector = function () {
    var dx = this.pad.x;
    var dy = this.pad.y;
    if (this.keys.arrowleft || this.keys.a) dx -= 1;
    if (this.keys.arrowright || this.keys.d) dx += 1;
    if (this.keys.arrowup || this.keys.w) dy -= 1;
    if (this.keys.arrowdown || this.keys.s) dy += 1;
    if (dx || dy) {
      var len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
    }
    return { x: dx, y: dy };
  };

  Overworld.prototype._blocked = function (x, y) {
    var margin = 36;
    if (x < margin || y < margin || x > this.worldW - margin || y > this.worldH - margin) return true;
    var i, b, cx, cy, dx, dy;
    for (i = 0; i < this.buildings.length; i++) {
      b = this.buildings[i];
      cx = b.x + b.w * 0.5;
      cy = b.y + b.h * 0.55;
      dx = x - cx; dy = y - cy;
      if ((dx * dx) / (b.w * b.w * 0.18) + (dy * dy) / (b.h * b.h * 0.12) < 1) {
        if (y > b.y + b.h * 0.72) continue;
        return true;
      }
    }
    return false;
  };

  Overworld.prototype._step = function (dt) {
    var v = this._inputVector();
    var walking = !!(v.x || v.y);
    if (walking) {
      var nx = this.player.x + v.x * this.speed * dt;
      var ny = this.player.y + v.y * this.speed * dt;
      if (!this._blocked(nx, this.player.y)) this.player.x = nx;
      if (!this._blocked(this.player.x, ny)) this.player.y = ny;
      var d = dirFromVector(v.x, v.y);
      if (d) this.player.dir = d;
      this.player.frameT += dt;
      if (this.player.frameT > 0.16) {
        this.player.frameT = 0;
        this.player.frame = this.player.frame ? 0 : 1;
      }
    } else {
      this.player.frame = 0;
      this.player.frameT = 0;
    }
    this.player.walking = walking;
    this._paintPlayer();
    this._scanNear();
    this._sortDepth();
    this._updateMinimapDot();
  };

  Overworld.prototype._paintPlayer = function () {
    var p = this.player;
    var pose = p.walking ? (p.frame ? 'walk-b' : 'walk-a') : 'idle';
    var src = SPRITE_BASE + p.dir + '-' + pose + '.webp';
    if (this.els.playerImg && this.els.playerImg.getAttribute('src') !== src) {
      this.els.playerImg.src = src;
    }
    if (this.els.player) {
      this.els.player.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) rotateX(-48deg)';
      this.els.player.dataset.dir = p.dir;
      this.els.player.classList.toggle('is-walk', p.walking);
    }
    if (this.els.follower && !this.els.follower.hidden) {
      this.els.follower.style.transform =
        'translate(' + (p.x - 18) + 'px,' + (p.y + 28) + 'px) rotateX(-48deg)';
    }
    var viewW = this.mapId === 'sanctuary' ? 720 : 640;
    var viewH = this.mapId === 'sanctuary' ? 520 : 420;
    this.camera.x = Math.max(0, Math.min(this.worldW - viewW, p.x - viewW * 0.45));
    this.camera.y = Math.max(0, Math.min(this.worldH - viewH, p.y - viewH * 0.55));
    if (this.els.world) {
      this.els.world.style.width = this.worldW + 'px';
      this.els.world.style.height = this.worldH + 'px';
      this.els.world.style.left = '50%';
      this.els.world.style.marginLeft = (-this.worldW / 2) + 'px';
      // Keep the plaza under Bob: camera offsets the world, then recenters in the viewport.
      this.els.world.style.transform = 'translate(' + (-this.camera.x) + 'px,' + (-this.camera.y) + 'px)';
    }
  };

  Overworld.prototype._sortDepth = function () {
    var nodes = [];
    if (this.els.player) nodes.push({ el: this.els.player, y: this.player.y });
    if (this.els.follower && !this.els.follower.hidden) {
      nodes.push({ el: this.els.follower, y: this.player.y + 28 });
    }
    this.root.querySelectorAll('.cm-ow-build, .cm-ow-decor').forEach(function (el) {
      var top = parseFloat(el.style.top) || 0;
      var h = parseFloat(el.style.height) || el.offsetHeight || 40;
      nodes.push({ el: el, y: top + h });
    });
    nodes.sort(function (a, b) { return a.y - b.y; });
    nodes.forEach(function (n, i) { n.el.style.zIndex = String(10 + i); });
  };

  Overworld.prototype._scanNear = function () {
    var best = null;
    var bestD = 86;
    var i, b, cx, cy, dx, dy, d;
    for (i = 0; i < this.buildings.length; i++) {
      b = this.buildings[i];
      if (b.disabled) continue;
      cx = b.x + b.w * 0.5;
      cy = b.y + b.h * 0.9;
      dx = this.player.x - cx;
      dy = this.player.y - cy;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = b; }
    }
    var changed = (best && best.id) !== (this.near && this.near.id);
    this.near = best;
    this.root.querySelectorAll('.cm-ow-build').forEach(function (el) {
      el.classList.toggle('is-near', !!(best && el.getAttribute('data-build') === best.id));
    });
    if (changed) this._updatePrompt();
  };

  Overworld.prototype._updatePrompt = function () {
    var p = this.els.prompt;
    var btn = this.els.promptBtn;
    if (!p || !btn) return;
    if (!this.near) { p.hidden = true; return; }
    p.hidden = false;
    var verbs = {
      wild: 'Enter Wild Grove',
      woods: 'Enter Palm Woods',
      rival: 'Challenge Rival Arena',
      knight: 'Challenge Knight Keep',
      exit: 'Return to Sanctuary',
      realms: 'Open Realm Map',
      travel: 'Travel to ' + (this.near.label || 'realm'),
      preset: 'Edit Arena Preset',
      flavor: 'Look around'
    };
    btn.textContent = verbs[this.near.act] || ('Enter ' + this.near.label);
    btn.setAttribute('data-act', this.near.act);
    if (this.near.landId) btn.setAttribute('data-land', this.near.landId);
    else btn.removeAttribute('data-land');
  };

  Overworld.prototype.tryInteract = function () {
    if (!this.near || this.near.disabled) return;
    if (this.near.act === 'flavor') {
      this.setBanner(this.near.label + ' — a quiet corner of the Sanctuary.');
      return;
    }
    this.onInteract(this.near.act, this.near);
  };

  Overworld.prototype.setBanner = function (msg) {
    if (this.els.banner) this.els.banner.textContent = msg || '';
  };

  Overworld.prototype._drawMinimap = function () {
    var c = this.els.miniCanvas;
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width;
    var h = c.height;
    ctx.clearRect(0, 0, w, h);
    // Warm sand / woods palette
    ctx.fillStyle = this.mapId === 'sanctuary' ? '#c9a56a' : '#4f9a48';
    ctx.fillRect(0, 0, w, h);
    if (this.mapId === 'sanctuary') {
      ctx.fillStyle = '#3f7a3a';
      ctx.fillRect(0, 0, w, h * 0.35);
      ctx.fillStyle = '#e6d3a0';
      ctx.fillRect(w * 0.28, h * 0.4, w * 0.44, h * 0.35);
    }
    this.buildings.forEach(function (b) {
      var bx = (b.x / (this.worldW || 1)) * w;
      var by = (b.y / (this.worldH || 1)) * h;
      ctx.fillStyle = b.act === 'woods' || b.act === 'wild' ? '#2f8a3a'
        : b.act === 'travel' || b.act === 'exit' || b.act === 'realms' ? '#6a7cff'
        : b.act === 'rival' || b.act === 'arena' || b.act === 'preset' ? '#e07040'
        : '#f0d79a';
      ctx.fillRect(bx - 2, by - 2, 5, 5);
    }, this);
  };

  Overworld.prototype._updateMinimapDot = function () {
    var dot = this.els.miniDot;
    if (!dot) return;
    var x = (this.player.x / this.worldW) * 100;
    var y = (this.player.y / this.worldH) * 100;
    dot.style.left = x + '%';
    dot.style.top = y + '%';
  };

  global.CampaignOverworld = Overworld;
})(window);
