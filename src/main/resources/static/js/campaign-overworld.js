/**
 * Campaign overworld — AnimeVsPlus2-style HD-2D walkabout.
 * Movement + hotspots live here; CampaignWorld3D draws the 3D ground and billboard sprites.
 * Falls back to the older CSS plane if WebGL is unavailable.
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
    // Fired when a realm grass roll hits — Campaign starts a Siege-style wild battle.
    this.onEncounter = opts.onEncounter || function () {};
    this.enabled = false;
    this.keys = {};
    this.pad = { x: 0, y: 0 };
    this.player = { x: 16, z: 16, dir: 'down', walking: false, frame: 0, frameT: 0 };
    this.buildings = [];
    this.near = null;
    this.mapId = 'sanctuary';
    this.mapW = 32;
    this.mapH = 24;
    this.speed = 4.2; // tiles / second
    this._raf = 0;
    this._last = 0;
    this._bound = false;
    this.els = {};
    this.lands = [];
    this.follower = null;
    this.world3d = null;
    this.use3d = false;
    // Random open-world encounters (realm only). Sanctuary plaza is safe;
    // Palm Woods / Wild Grove remain opt-in gates. Knight/rival hotspots are
    // also safe so Arena challenges are never stolen by a grass roll.
    this.encounter = {
      enabled: false,
      pending: false,
      accum: 0,
      grace: 0,
      chance: 0.12,
      stepDist: 0.9,
      graceOnEnter: 5.5
    };
  }

  Overworld.prototype.mount = function () {
    if (!this.root) return;
    var can3d = !!(global.CampaignWorld3D && global.CampaignWorld3D.supported && global.CampaignWorld3D.supported());
    this.use3d = can3d;

    this.root.innerHTML =
      '<div class="cm-ow is-sanctuary' + (can3d ? ' is-hd2d' : '') + '" id="cmOw">' +
        '<div class="cm-ow-sky" aria-hidden="true"></div>' +
        '<div class="cm-ow-haze" aria-hidden="true"></div>' +
        '<div class="cm-ow-viewport" id="cmOwViewport">' +
          (can3d
            ? '<div class="cm-ow-gl" id="cmOwGl"></div>'
            : '<div class="cm-ow-plane"><div class="cm-ow-world" id="cmOwWorld">' +
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
              '</div></div>') +
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
      viewport: this.root.querySelector('#cmOwViewport'),
      gl: this.root.querySelector('#cmOwGl'),
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

    if (this.use3d && this.els.gl) {
      this.world3d = new global.CampaignWorld3D({ host: this.els.gl });
      if (!this.world3d.ready) {
        this.use3d = false;
        this.world3d = null;
        if (this.els.ow) this.els.ow.classList.remove('is-hd2d');
      }
    }

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

    var stick = this.root.querySelector('#cmOwStick');
    if (!stick) return;
    var dragging = false;
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

  Overworld.prototype._hud = function (cfg) {
    cfg = cfg || {};
    if (this.els.gold) this.els.gold.textContent = '◎ ' + (cfg.gold != null ? cfg.gold : 0);
    if (this.els.flags) this.els.flags.textContent = '⚑ ' + (cfg.rallies != null ? cfg.rallies : 0);
  };

  Overworld.prototype._resetEncounter = function (enabled) {
    var e = this.encounter;
    e.stepDist = this.use3d ? 0.9 : 28;
    e.graceOnEnter = this.use3d ? 5.5 : 160;
    e.enabled = !!enabled;
    e.pending = false;
    e.accum = 0;
    e.grace = enabled ? e.graceOnEnter : 0;
    if (this.els.ow) this.els.ow.classList.remove('is-encounter');
  };

  /** True when Bob is near a hotspot — keep Arena approaches (knight/rival) safe. */
  Overworld.prototype._encounterSafeZone = function () {
    return !!(this.near && !this.near.disabled);
  };

  Overworld.prototype._tickEncounter = function (dist) {
    var e = this.encounter;
    if (!e.enabled || e.pending || !dist) return;
    if (this._encounterSafeZone()) return;
    e.accum += dist;
    while (e.accum >= e.stepDist) {
      e.accum -= e.stepDist;
      if (e.grace > 0) {
        e.grace -= e.stepDist;
        continue;
      }
      var roll = typeof e._forceRoll === 'number' ? e._forceRoll : Math.random();
      if (roll < e.chance) {
        this._triggerEncounter();
        return;
      }
    }
  };

  Overworld.prototype._triggerEncounter = function () {
    var e = this.encounter;
    if (e.pending) return;
    e.pending = true;
    this.keys = {};
    this.pad.x = 0;
    this.pad.y = 0;
    if (this.els.knob) this.els.knob.style.transform = 'translate(0,0)';
    if (this.els.ow) this.els.ow.classList.add('is-encounter');
    this.setBanner('A wild Siegeling appears!');
    var self = this;
    setTimeout(function () {
      try { self.onEncounter(); }
      catch (err) {
        e.pending = false;
        if (self.els.ow) self.els.ow.classList.remove('is-encounter');
        self.setBanner('The wilds settle… try walking again.');
      }
    }, 420);
  };

  Overworld.prototype.loadSanctuary = function (cfg) {
    cfg = cfg || {};
    this.mapId = 'sanctuary';
    this.lands = cfg.lands || [];
    this.follower = cfg.follower || null;
    this._resetEncounter(false);
    if (this.els.ow) {
      this.els.ow.classList.add('is-sanctuary');
      this.els.ow.classList.remove('is-realm');
      this.els.ow.dataset.element = 'light';
    }
    this.els.place.textContent = 'Sanctuary Plaza';
    this.els.banner.textContent = cfg.message ||
      'Welcome home, Squire. Explore the plaza, walk the palm woods, or take a waystone to a realm.';
    this._hud(cfg);

    if (this.use3d && this.world3d) {
      this.world3d.loadSanctuary({ lands: this.lands, followerId: this.follower && this.follower.id, follower: this.follower });
      this.mapW = this.world3d.mapW;
      this.mapH = this.world3d.mapH;
      this.buildings = this.world3d.getBuildings();
      var spawn = this.world3d.spawn || { x: 16, z: 16.5 };
      this.player.x = spawn.x;
      this.player.z = spawn.z;
      this.player.dir = 'up';
      this.player.walking = false;
      this.near = null;
      this._updatePrompt();
      this._drawMinimap();
      this._scheduleResize();
      return;
    }

    // CSS fallback (pixel plane) — same hotspots as before, in world pixels.
    this._loadSanctuaryCss(cfg);
  };

  Overworld.prototype.loadLand = function (cfg) {
    cfg = cfg || {};
    this.mapId = 'realm';
    this.follower = cfg.follower || null;
    this._resetEncounter(true);
    if (this.els.ow) {
      this.els.ow.classList.remove('is-sanctuary');
      this.els.ow.classList.add('is-realm');
      this.els.ow.dataset.element = (cfg.element || 'neutral').toLowerCase();
    }
    this.els.place.textContent = cfg.name || 'Land';
    this.els.banner.textContent = cfg.message ||
      'Wander the wilds for Siege encounters — challenge the Rival Arena or Knight Keep for Arena duels.';
    this._hud(cfg);

    if (this.use3d && this.world3d) {
      this.world3d.loadRealm({
        element: cfg.element, landId: cfg.landId, name: cfg.name,
        rivalDone: !!cfg.rivalDone, rallied: !!cfg.rallied,
        wilds: cfg.wilds || [], legendary: cfg.legendary || null,
        shrineOpen: !!cfg.shrineOpen, sigilEarned: !!cfg.sigilEarned,
        followerId: this.follower && this.follower.id,
        follower: this.follower
      });
      this.mapW = this.world3d.mapW;
      this.mapH = this.world3d.mapH;
      this.buildings = this.world3d.getBuildings();
      var spawn = this.world3d.spawn || { x: 10, z: 9 };
      this.player.x = spawn.x;
      this.player.z = spawn.z;
      this.player.dir = 'up';
      this.near = null;
      this._updatePrompt();
      this._drawMinimap();
      this._scheduleResize();
      return;
    }

    this._loadLandCss(cfg);
  };

  /**
   * The Wildlands open world (3D only): roaming wild Siegelings to walk up to and
   * battle, with tall-grass rolls as well. Without WebGL it falls back to the
   * Sanctuary, whose Palm Woods gate then starts a battle directly.
   */
  Overworld.prototype.loadWildlands = function (cfg) {
    cfg = cfg || {};
    if (!(this.use3d && this.world3d && this.world3d.loadWildlands)) return false;
    this.mapId = 'wildlands';
    this.follower = cfg.follower || null;
    this._resetEncounter(true);
    if (this.els.ow) {
      this.els.ow.classList.remove('is-sanctuary');
      this.els.ow.classList.add('is-realm');
      this.els.ow.dataset.element = 'earth';
    }
    this.els.place.textContent = 'The Wildlands';
    this.els.banner.textContent = cfg.message ||
      'Wild Siegelings roam the meadow. Walk up to one and press A to battle it.';
    this._hud(cfg);
    this.world3d.loadWildlands({
      wilds: cfg.wilds || [],
      followerId: this.follower && this.follower.id,
      follower: this.follower
    });
    this.mapW = this.world3d.mapW;
    this.mapH = this.world3d.mapH;
    this.buildings = this.world3d.getBuildings();
    var spawn = this.world3d.spawn || { x: 20, z: 28 };
    this.player.x = spawn.x;
    this.player.z = spawn.z;
    this.player.dir = 'up';
    this.player.walking = false;
    this.near = null;
    this._updatePrompt();
    this._drawMinimap();
    this._scheduleResize();
    return true;
  };

  /* ---------- CSS fallback path (no WebGL) ---------- */

  Overworld.prototype._tile = function (kind, c, r) {
    var src = ASSET + 'ground/' + (kind === 'wood' ? 'wood.webp'
      : kind === 'path' ? 'path.webp'
      : kind === 'sandb' ? 'sand-b.webp'
      : 'sand.webp');
    return '<span class="cm-ow-tile is-' + kind + '" style="grid-column:' + (c + 1) +
      ';grid-row:' + (r + 1) + ';background-image:url(' + src + ')"></span>';
  };

  Overworld.prototype._prop = function (cls, src, x, y, w, h) {
    return '<span class="cm-ow-decor ' + cls + '" style="left:' + x + 'px;top:' + y +
      'px;width:' + w + 'px;height:' + h + 'px;background-image:url(' + src + ')"></span>';
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

  Overworld.prototype._loadSanctuaryCss = function (cfg) {
    this.mapW = 1480;
    this.mapH = 1080;
    this.speed = 130;
    if (!this.els.ground) return;
    var cols = 18, rows = 14, html = '', r, c, kind;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        kind = 'sand';
        if (r >= 6 && r <= 10 && c >= 5 && c <= 12) kind = 'path';
        if (c === 8 || c === 9 || r === 8 || r === 9) kind = 'path';
        if (r >= 7 && r <= 9 && c >= 7 && c <= 10) kind = 'wood';
        if (r <= 4) kind = (c + r) % 3 === 0 ? 'sandb' : 'sand';
        if (r >= 11 && (c === 8 || c === 9)) kind = 'wood';
        html += this._tile(kind, c, r);
      }
    }
    this.els.ground.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    this.els.ground.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    this.els.ground.innerHTML = html;

    var buildings = [
      { id: 'house', act: 'flavor', label: 'Squire Lodge', sub: 'Rest · story', x: 220, y: 560, w: 150, h: 130, pop: 'house', img: ASSET + 'props/house.webp' },
      { id: 'arena', act: 'preset', label: 'Arena Gate', sub: 'Preset deck', x: 980, y: 540, w: 160, h: 120, pop: 'arena', img: ASSET + 'props/arena.webp' },
      { id: 'pyramid', act: 'flavor', label: 'Relic Shrine', sub: 'Sanctuary', x: 620, y: 420, w: 170, h: 150, pop: 'keep', img: ASSET + 'props/pyramid-door.webp' },
      { id: 'woods', act: 'woods', label: 'Palm Woods', sub: 'Wild capture', x: 600, y: 90, w: 180, h: 110, pop: 'grove', img: ASSET + 'decor/palm.webp' },
      { id: 'realms', act: 'realms', label: 'Realm Map', sub: 'Travel', x: 640, y: 860, w: 140, h: 100, pop: 'waystone', img: ASSET + 'props/waystone.webp' }
    ];
    (cfg.lands || []).filter(function (l) { return l.unlocked || l.rallied; }).slice(0, 6).forEach(function (land, i) {
      buildings.push({
        id: 'way-' + land.id, act: 'travel', landId: land.id,
        label: land.name, sub: ((land.elements && land.elements[0]) || '') + (land.rallied ? ' · rallied' : ''),
        x: 1120 + (i % 3) * 100, y: 200 + Math.floor(i / 3) * 140, w: 88, h: 100,
        pop: 'waystone', img: ASSET + 'props/waystone.webp'
      });
    });
    this.buildings = buildings;
    var propsHtml = buildings.map(this._buildBtn).join('');
    propsHtml += this._prop('is-fountain', ASSET + 'props/fountain.webp', 690, 620, 100, 84);
    [[80, 40], [200, 20], [340, 50], [960, 55], [60, 280]].forEach(function (p, i) {
      propsHtml += this._prop('is-palm', ASSET + 'decor/palm.webp', p[0], p[1], 90 + i * 8, 120);
    }, this);
    this.els.props.innerHTML = propsHtml;
    this.player.x = 740;
    this.player.z = 720; // z reused as y in CSS mode
    this.player.dir = 'up';
    this.near = null;
    this._paintPlayerCss();
    this._updatePrompt();
    this._drawMinimap();
  };

  Overworld.prototype._loadLandCss = function (cfg) {
    this.mapW = 920;
    this.mapH = 640;
    this.speed = 130;
    if (!this.els.ground) return;
    var cols = 14, rows = 10, html = '', r, c, kind;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        kind = 'sand';
        if (c === 6 || c === 7 || r === 5 || r === 4) kind = 'path';
        html += this._tile(kind, c, r);
      }
    }
    this.els.ground.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    this.els.ground.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    this.els.ground.innerHTML = html;
    var rivalDone = !!cfg.rivalDone;
    var rallied = !!cfg.rallied;
    this.buildings = [
      { id: 'wild', act: 'wild', label: 'Wild Grove', sub: 'Siege capture', x: 210, y: 180, w: 120, h: 100, pop: 'grove', img: ASSET + 'decor/palm.webp' },
      { id: 'rival', act: 'rival', label: 'Rival Arena', sub: rivalDone ? 'Cleared' : 'Arena duel', x: 620, y: 190, w: 140, h: 110, pop: 'arena', img: ASSET + 'props/arena.webp', disabled: rivalDone },
      { id: 'knight', act: 'knight', label: 'Knight Keep', sub: rallied ? 'Rallied' : 'SiegeKnight', x: 400, y: 100, w: 150, h: 120, pop: 'keep', img: ASSET + 'props/pyramid-door.webp', disabled: rallied },
      { id: 'exit', act: 'exit', label: 'Sanctuary', sub: 'Return home', x: 420, y: 460, w: 110, h: 90, pop: 'waystone', img: ASSET + 'props/waystone.webp' }
    ];
    this.els.props.innerHTML = this.buildings.map(this._buildBtn).join('');
    this.player.x = 460;
    this.player.z = 360;
    this.player.dir = 'up';
    this.near = null;
    this._paintPlayerCss();
    this._updatePrompt();
    this._drawMinimap();
  };

  Overworld.prototype._paintPlayerCss = function () {
    var p = this.player;
    var pose = p.walking ? ['idle', 'walk-a', 'idle', 'walk-b'][p.frame & 3] : 'idle';
    var src = SPRITE_BASE + p.dir + '-' + pose + '.webp?v=2';
    if (this.els.playerImg && this.els.playerImg.getAttribute('src') !== src) {
      this.els.playerImg.src = src;
    }
    if (this.els.player) {
      this.els.player.style.transform = 'translate(' + p.x + 'px,' + p.z + 'px) rotateX(-48deg)';
      this.els.player.classList.toggle('is-walk', p.walking);
    }
    if (this.els.world) {
      var viewW = this.mapId === 'sanctuary' ? 720 : 640;
      var viewH = this.mapId === 'sanctuary' ? 520 : 420;
      var camX = Math.max(0, Math.min(this.mapW - viewW, p.x - viewW * 0.45));
      var camY = Math.max(0, Math.min(this.mapH - viewH, p.z - viewH * 0.55));
      this.els.world.style.width = this.mapW + 'px';
      this.els.world.style.height = this.mapH + 'px';
      this.els.world.style.left = '50%';
      this.els.world.style.marginLeft = (-this.mapW / 2) + 'px';
      this.els.world.style.transform = 'translate(' + (-camX) + 'px,' + (-camY) + 'px)';
    }
  };

  /* ---------- shared simulation ---------- */

  Overworld.prototype._scheduleResize = function () {
    var self = this;
    if (!this.world3d) return;
    this.world3d.resize();
    requestAnimationFrame(function () {
      self.world3d && self.world3d.resize();
      requestAnimationFrame(function () { self.world3d && self.world3d.resize(); });
    });
  };

  Overworld.prototype.enable = function (on) {
    this.enabled = !!on;
    if (this.enabled) {
      this._scheduleResize();
      this._last = performance.now();
      if (!this._raf) this._loop(this._last);
    } else if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  };

  Overworld.prototype.dispose = function () {
    this.enable(false);
    if (this.world3d) {
      this.world3d.dispose();
      this.world3d = null;
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

  Overworld.prototype._blocked3d = function (x, z) {
    return this.world3d ? this.world3d.isBlocked(x, z) : false;
  };

  Overworld.prototype._blockedCss = function (x, y) {
    var margin = 36;
    if (x < margin || y < margin || x > this.mapW - margin || y > this.mapH - margin) return true;
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

  Overworld.prototype._animatePlayer = function (dt, moving) {
    var p = this.player;
    if (!moving) {
      p.frame = 0;
      p.frameT = 0;
      return;
    }
    p.frameT += dt;
    while (p.frameT >= 0.12) {
      p.frameT -= 0.12;
      p.frame = (p.frame + 1) & 3;
    }
  };

  Overworld.prototype._step = function (dt) {
    var v = this._inputVector();
    var inputWalking = !!(v.x || v.y);
    // Freeze movement once an encounter flash has started.
    if (this.encounter.pending) {
      inputWalking = false;
      v = { x: 0, y: 0 };
    }
    if (this.use3d) {
      var oldX = this.player.x, oldZ = this.player.z;
      if (inputWalking) {
        var nx = this.player.x + v.x * this.speed * dt;
        var nz = this.player.z + v.y * this.speed * dt;
        if (!this._blocked3d(nx, this.player.z)) this.player.x = nx;
        if (!this._blocked3d(this.player.x, nz)) this.player.z = nz;
        var d = dirFromVector(v.x, v.y);
        if (d) this.player.dir = d;
      }
      var walked = Math.hypot(this.player.x - oldX, this.player.z - oldZ);
      var walking = walked > 0.0001;
      this._animatePlayer(dt, walking);
      this.player.walking = walking;
      this._scanNear3d();
      this._tickEncounter(walked);
      if (this.world3d) {
        this.world3d.frame({
          x: this.player.x,
          z: this.player.z,
          dir: this.player.dir,
          walking: this.player.walking,
          frame: this.player.frame,
          nearId: this.near && this.near.id
        });
      }
      this._updateMinimapDot();
      return;
    }

    // CSS mode uses player.z as screen Y
    var cssOldX = this.player.x, cssOldY = this.player.z;
    if (inputWalking) {
      var cx = this.player.x + v.x * this.speed * dt;
      var cy = this.player.z + v.y * this.speed * dt;
      if (!this._blockedCss(cx, this.player.z)) this.player.x = cx;
      if (!this._blockedCss(this.player.x, cy)) this.player.z = cy;
      var d2 = dirFromVector(v.x, v.y);
      if (d2) this.player.dir = d2;
    }
    var cssWalked = Math.hypot(this.player.x - cssOldX, this.player.z - cssOldY);
    var cssWalking = cssWalked > 0.01;
    this._animatePlayer(dt, cssWalking);
    this.player.walking = cssWalking;
    this._paintPlayerCss();
    this._scanNearCss();
    this._tickEncounter(cssWalked);
    this._updateMinimapDot();
  };

  Overworld.prototype._scanNear3d = function () {
    var best = null;
    var bestD = 1.4;
    var i, b, dx, dz, d;
    for (i = 0; i < this.buildings.length; i++) {
      b = this.buildings[i];
      // Closed hotspots (sealed shrine, cleared arena) still answer, with the reason why.
      dx = this.player.x - (b.approachX != null ? b.approachX : b.x);
      dz = this.player.z - (b.approachZ != null ? b.approachZ : b.z);
      d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { bestD = d; best = b; }
    }
    var changed = (best && best.id) !== (this.near && this.near.id);
    this.near = best;
    if (changed) this._updatePrompt();
  };

  Overworld.prototype._scanNearCss = function () {
    var best = null;
    var bestD = 86;
    var i, b, cx, cy, dx, dy, d;
    for (i = 0; i < this.buildings.length; i++) {
      b = this.buildings[i];
      if (b.disabled) continue;
      cx = b.x + b.w * 0.5;
      cy = b.y + b.h * 0.9;
      dx = this.player.x - cx;
      dy = this.player.z - cy;
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
      woods: 'Enter the Wildlands',
      'wild-foe': 'Battle ' + (this.near.label || 'the wild Siegeling'),
      legendary: 'Challenge the Legendary',
      rival: 'Challenge Rival Arena',
      knight: this.near.knightId ? ('Challenge ' + (this.near.label || 'SiegeKnight')) : 'Challenge Knight Keep',
      'meet-knight': 'Speak with ' + (this.near.label || 'SiegeKnight'),
      exit: 'Return to Sanctuary',
      realms: 'Open Realm Map',
      travel: 'Travel to ' + (this.near.label || 'realm'),
      preset: 'Edit Arena Preset',
      flavor: 'Look around'
    };
    btn.textContent = this.near.disabled
      ? (this.near.label + (this.near.sub ? ' — ' + this.near.sub : ''))
      : (verbs[this.near.act] || ('Enter ' + this.near.label));
    btn.classList.toggle('is-closed', !!this.near.disabled);
    btn.setAttribute('data-act', this.near.act);
    if (this.near.landId) btn.setAttribute('data-land', this.near.landId);
    else btn.removeAttribute('data-land');
  };

  Overworld.prototype.tryInteract = function () {
    if (!this.near) return;
    // A closed hotspot (sealed shrine, cleared arena) explains itself instead of doing nothing.
    if (this.near.disabled) {
      this.setBanner(this.near.label + (this.near.sub ? ' — ' + this.near.sub + '.' : '.'));
      return;
    }
    if (this.near.act === 'flavor') {
      this.setBanner(this.near.label + ' — a quiet corner of the Sanctuary.');
      return;
    }
    if (this.near.act === 'meet-knight') {
      var lines = {
        pyla: 'Lady Pyla grins. “Emberfall answers to fire — find me there when you are ready.”',
        'ser-airek': 'Ser Airek nods. “The winds of Zephyr Reach keep watch. Challenge me at the keep.”',
        glacia: 'Glacia’s staff glints. “Frostveil’s quiet holds. Meet me when the ice calls.”'
      };
      var rallied = {
        pyla: 'Lady Pyla clasps your forearm. “Emberfall stands with the Charter.”',
        'ser-airek': 'Ser Airek salutes. “Zephyr Reach flies the Charter’s colours.”',
        glacia: 'Glacia bows. “Frostveil is rallied. The cold remembers your name.”'
      };
      var id = this.near.knightId;
      var msg = (this.near.sub === 'Rallied' ? rallied[id] : null) || lines[id] ||
        (this.near.label + ' greets you.');
      this.setBanner(msg);
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
    ctx.fillStyle = this.mapId === 'sanctuary' ? '#c9a56a' : '#4f9a48';
    ctx.fillRect(0, 0, w, h);
    if (this.mapId === 'sanctuary') {
      ctx.fillStyle = '#3f7a3a';
      ctx.fillRect(0, 0, w, h * 0.35);
      ctx.fillStyle = '#e6d3a0';
      ctx.fillRect(w * 0.28, h * 0.4, w * 0.44, h * 0.35);
    }
    var self = this;
    this.buildings.forEach(function (b) {
      var bx, by;
      if (self.use3d) {
        bx = (b.x / (self.mapW || 1)) * w;
        by = (b.z / (self.mapH || 1)) * h;
      } else {
        bx = (b.x / (self.mapW || 1)) * w;
        by = (b.y / (self.mapH || 1)) * h;
      }
      ctx.fillStyle = b.act === 'woods' || b.act === 'wild' ? '#2f8a3a'
        : b.act === 'travel' || b.act === 'exit' || b.act === 'realms' ? '#6a7cff'
        : b.act === 'rival' || b.act === 'arena' || b.act === 'preset' ? '#e07040'
        : '#f0d79a';
      ctx.fillRect(bx - 2, by - 2, 5, 5);
    });
  };

  Overworld.prototype._updateMinimapDot = function () {
    var dot = this.els.miniDot;
    if (!dot) return;
    var x = (this.player.x / this.mapW) * 100;
    var y = (this.player.z / this.mapH) * 100;
    dot.style.left = x + '%';
    dot.style.top = y + '%';
  };

  global.CampaignOverworld = Overworld;
})(window);
