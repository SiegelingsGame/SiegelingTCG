/**
 * Campaign overworld: Pokémon-style walkabout with Paper Mario popup buildings.
 * Squire Bob is the avatar; buildings are interact hotspots (wild / rival / knight).
 */
(function (global) {
  'use strict';

  var SPRITE_BASE = '/img/sprites/squire-bob/';
  var DIRS = [
    'down', 'down-right', 'right', 'up-right',
    'up', 'up-left', 'left', 'down-left'
  ];

  function dirFromVector(dx, dy) {
    if (!dx && !dy) return null;
    var ang = Math.atan2(dy, dx); // -PI..PI, 0 = right
    // Map to 8 dirs: right, down-right, down, ...
    var oct = Math.round(ang / (Math.PI / 4));
    // atan2: 0 right, +PI/2 down (screen y+), -PI/2 up
    var map = {
      0: 'right',
      1: 'down-right',
      2: 'down',
      3: 'down-left',
      4: 'left',
      '-4': 'left',
      '-3': 'up-left',
      '-2': 'up',
      '-1': 'up-right'
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
    this.worldW = 920;
    this.worldH = 640;
    this.speed = 118;
    this._raf = 0;
    this._last = 0;
    this._bound = false;
    this.els = {};
  }

  Overworld.prototype.mount = function () {
    if (!this.root) return;
    this.root.innerHTML =
      '<div class="cm-ow" id="cmOw">' +
        '<div class="cm-ow-sky" aria-hidden="true"></div>' +
        '<div class="cm-ow-horizon" aria-hidden="true"></div>' +
        '<div class="cm-ow-viewport">' +
          '<div class="cm-ow-plane" id="cmOwPlane">' +
            '<div class="cm-ow-world" id="cmOwWorld">' +
              '<div class="cm-ow-ground" id="cmOwGround"></div>' +
              '<div class="cm-ow-props" id="cmOwProps"></div>' +
              '<div class="cm-ow-player" id="cmOwPlayer" aria-label="Squire Bob">' +
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
        '<div class="cm-ow-hud">' +
          '<div class="cm-ow-title">' +
            '<span class="cm-ow-place" id="cmOwPlace"></span>' +
            '<span class="cm-ow-hint" id="cmOwHint">Walk with arrows / WASD · Enter to enter</span>' +
          '</div>' +
          '<p class="cm-ow-banner" id="cmOwBanner" role="status"></p>' +
        '</div>' +
        '<div class="cm-ow-prompt" id="cmOwPrompt" hidden>' +
          '<button type="button" class="cm-ow-prompt-btn" id="cmOwPromptBtn"></button>' +
        '</div>' +
        '<div class="cm-ow-pad" id="cmOwPad" aria-label="Move">' +
          '<button type="button" data-pad="up" class="cm-ow-pad-btn is-up" aria-label="Up"></button>' +
          '<button type="button" data-pad="left" class="cm-ow-pad-btn is-left" aria-label="Left"></button>' +
          '<button type="button" data-pad="down" class="cm-ow-pad-btn is-down" aria-label="Down"></button>' +
          '<button type="button" data-pad="right" class="cm-ow-pad-btn is-right" aria-label="Right"></button>' +
          '<button type="button" data-pad="a" class="cm-ow-pad-a" aria-label="Interact">A</button>' +
        '</div>' +
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
      hint: this.root.querySelector('#cmOwHint'),
      prompt: this.root.querySelector('#cmOwPrompt'),
      promptBtn: this.root.querySelector('#cmOwPromptBtn')
    };
    this._bindInput();
    this._paintGround();
  };

  Overworld.prototype._paintGround = function () {
    var g = this.els.ground;
    if (!g) return;
    var cols = 14;
    var rows = 10;
    var html = '';
    var r, c, kind;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        kind = 'grass';
        // Crossroads path through the middle
        if (c === 6 || c === 7 || r === 5 || r === 4) kind = 'path';
        // Plaza near center
        if (c >= 5 && c <= 8 && r >= 3 && r <= 6) kind = 'path';
        // Soft edge meadow accent
        if ((r + c) % 7 === 0 && kind === 'grass') kind = 'meadow';
        html += '<span class="cm-ow-tile is-' + kind + '" style="grid-column:' + (c + 1) +
          ';grid-row:' + (r + 1) + '"></span>';
      }
    }
    g.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    g.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    g.innerHTML = html;
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

    var pad = this.root.querySelector('#cmOwPad');
    if (!pad) return;
    function setPad(dir, on) {
      if (dir === 'up') self.pad.y = on ? -1 : (self.pad.y < 0 ? 0 : self.pad.y);
      if (dir === 'down') self.pad.y = on ? 1 : (self.pad.y > 0 ? 0 : self.pad.y);
      if (dir === 'left') self.pad.x = on ? -1 : (self.pad.x < 0 ? 0 : self.pad.x);
      if (dir === 'right') self.pad.x = on ? 1 : (self.pad.x > 0 ? 0 : self.pad.x);
      if (dir === 'a' && on) self.tryInteract();
    }
    function bindPad(el) {
      var dir = el.getAttribute('data-pad');
      if (!dir) return;
      var start = function (ev) { setPad(dir, true); ev.preventDefault(); };
      var end = function (ev) { if (dir !== 'a') setPad(dir, false); ev.preventDefault(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointerleave', end);
      el.addEventListener('pointercancel', end);
    }
    pad.querySelectorAll('[data-pad]').forEach(bindPad);

    if (this.els.promptBtn) {
      this.els.promptBtn.addEventListener('click', function () { self.tryInteract(); });
    }
  };

  Overworld.prototype.loadLand = function (cfg) {
    cfg = cfg || {};
    this.els.place.textContent = cfg.name || 'Land';
    this.els.banner.textContent = cfg.message || 'Explore the realm. Walk into a building to challenge it.';
    if (this.els.ow) {
      this.els.ow.style.setProperty('--ow-land-img', cfg.background ? 'url("' + cfg.background + '")' : 'none');
      this.els.ow.dataset.element = (cfg.element || 'neutral').toLowerCase();
    }

    var rivalDone = !!cfg.rivalDone;
    var rallied = !!cfg.rallied;
    this.buildings = [
      { id: 'wild', act: 'wild', label: 'Wild Grove', sub: 'Siege capture', x: 210, y: 180, w: 110, h: 70, pop: 'grove' },
      { id: 'rival', act: 'rival', label: 'Rival Arena', sub: rivalDone ? 'Cleared' : 'Arena duel', x: 620, y: 200, w: 120, h: 78, pop: 'arena', disabled: rivalDone },
      { id: 'knight', act: 'knight', label: 'Knight Keep', sub: rallied ? 'Rallied' : 'SiegeKnight', x: 430, y: 120, w: 130, h: 86, pop: 'keep', disabled: rallied },
      { id: 'exit', act: 'exit', label: 'Waystone', sub: 'World map', x: 440, y: 470, w: 100, h: 64, pop: 'waystone' }
    ];

    var props = this.els.props;
    props.innerHTML = this.buildings.map(function (b) {
      return '<button type="button" class="cm-ow-build is-' + b.pop + (b.disabled ? ' is-disabled' : '') +
        '" data-build="' + b.id + '" data-act="' + b.act + '"' +
        ' style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px"' +
        (b.disabled ? ' disabled' : '') + '>' +
        '<span class="cm-ow-build-shadow"></span>' +
        '<span class="cm-ow-build-edge" aria-hidden="true"></span>' +
        '<span class="cm-ow-build-face">' +
          '<span class="cm-ow-build-roof"></span>' +
          '<span class="cm-ow-build-wall">' +
            '<span class="cm-ow-build-window" aria-hidden="true"></span>' +
            '<span class="cm-ow-build-door"></span>' +
            '<span class="cm-ow-build-sign"><b>' + b.label + '</b><small>' + b.sub + '</small></span>' +
          '</span>' +
        '</span>' +
        '<span class="cm-ow-build-bang" aria-hidden="true">!</span>' +
      '</button>';
    }).join('');

    // Decor trees / rocks (non-interactive paper props)
    props.insertAdjacentHTML('beforeend',
      '<span class="cm-ow-decor is-tree" style="left:80px;top:320px"></span>' +
      '<span class="cm-ow-decor is-tree is-tall" style="left:760px;top:300px"></span>' +
      '<span class="cm-ow-decor is-rock" style="left:140px;top:420px"></span>' +
      '<span class="cm-ow-decor is-bush" style="left:700px;top:430px"></span>' +
      '<span class="cm-ow-decor is-tree" style="left:300px;top:70px"></span>' +
      '<span class="cm-ow-decor is-bush" style="left:560px;top:80px"></span>'
    );

    this.player.x = 460;
    this.player.y = 360;
    this.player.dir = 'up';
    this.player.walking = false;
    this.near = null;
    this._setFollower(cfg.follower);
    this._paintPlayer();
    this._updatePrompt();
  };

  Overworld.prototype._setFollower = function (follower) {
    var el = this.els.follower;
    var art = this.els.followerArt;
    if (!el || !art) return;
    if (!follower || !follower.id) {
      el.hidden = true;
      return;
    }
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
    var margin = 28;
    if (x < margin || y < margin || x > this.worldW - margin || y > this.worldH - margin) return true;
    var i, b, cx, cy, dx, dy;
    for (i = 0; i < this.buildings.length; i++) {
      b = this.buildings[i];
      // Soft collision against building footprint (not door approach zone)
      cx = b.x + b.w * 0.5;
      cy = b.y + b.h * 0.55;
      dx = x - cx; dy = y - cy;
      if ((dx * dx) / (b.w * b.w * 0.18) + (dy * dy) / (b.h * b.h * 0.12) < 1) {
        // Allow standing in the front approach strip
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
  };

  Overworld.prototype._paintPlayer = function () {
    var p = this.player;
    var pose = p.walking ? (p.frame ? 'walk-b' : 'walk-a') : 'idle';
    var src = SPRITE_BASE + p.dir + '-' + pose + '.webp';
    if (this.els.playerImg && this.els.playerImg.getAttribute('src') !== src) {
      this.els.playerImg.src = src;
    }
    if (this.els.player) {
      // Counter the ground's rotateX so Bob stays a standing paper cutout.
      this.els.player.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) rotateX(-48deg)';
      this.els.player.dataset.dir = p.dir;
      this.els.player.classList.toggle('is-walk', p.walking);
    }
    if (this.els.follower && !this.els.follower.hidden) {
      // Trail slightly behind Bob opposite facing
      var fx = p.x - 18;
      var fy = p.y + 28;
      this.els.follower.style.transform = 'translate(' + fx + 'px,' + fy + 'px) rotateX(-48deg)';
    }
    // Camera: keep Bob near center of plane
    this.camera.x = Math.max(0, Math.min(this.worldW - 640, p.x - 320));
    this.camera.y = Math.max(0, Math.min(this.worldH - 420, p.y - 240));
    if (this.els.world) {
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
    var bestD = 78;
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
    if (!this.near) {
      p.hidden = true;
      return;
    }
    p.hidden = false;
    var verb = this.near.act === 'exit' ? 'Leave to world map' :
      (this.near.act === 'wild' ? 'Enter Wild Grove' :
        (this.near.act === 'rival' ? 'Challenge Rival Arena' : 'Challenge Knight Keep'));
    btn.textContent = verb;
    btn.setAttribute('data-act', this.near.act);
  };

  Overworld.prototype.tryInteract = function () {
    if (!this.near || this.near.disabled) return;
    this.onInteract(this.near.act, this.near);
  };

  Overworld.prototype.setBanner = function (msg) {
    if (this.els.banner) this.els.banner.textContent = msg || '';
  };

  global.CampaignOverworld = Overworld;
})(window);
