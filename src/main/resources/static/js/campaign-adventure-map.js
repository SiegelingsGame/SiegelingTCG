/* Oblique overworld with baked ground, raised scenery, and upright sprites. */
(function () {
  'use strict';

  const WIDTH = 1120;
  const HEIGHT = 820;
  const TERRAIN_MARGIN = 192;
  const PITCH = .62;
  const SKEW = .22;
  const projectX = (x, y) => x + (y - HEIGHT / 2) * SKEW;
  const projectY = (y, elevation = 0) => y * PITCH - elevation;
  const cleanBobFrames = new WeakMap();
  const ART = '/img/campaign/sanctuary/';
  const ROADS = [
    { id: 'ice', city: 'Frostveil', knight: 'Glacia', sprite: 'glacia', x: 560, y: 94 },
    { id: 'wind', city: 'Zephyr Reach', knight: 'Airek', sprite: 'ser-airek', x: 98, y: 384 },
    { id: 'fire', city: 'Emberfall', knight: 'Pyla', sprite: 'pyla', x: 1022, y: 384 }
  ];
  const PALETTES = {
    city: ['#927859', '#9a805e', '#d3b184', '#70513d'],
    wild: ['#435647', '#4b604b', '#a48762', '#35433b'],
    ice: ['#637d88', '#738d98', '#b9c8cd', '#465e6d'],
    wind: ['#4c685e', '#577469', '#ccb995', '#3b594e'],
    fire: ['#755047', '#85594a', '#c4956a', '#583d38']
  };
  const TRAILS = {
    north: { name: 'Frostpine Trail', colors: ['#5d7878', '#78918d', '#415d62'] },
    west: { name: 'Galegrass Vale', colors: ['#56674a', '#6d8052', '#40543b'] },
    east: { name: 'Cinderwood Road', colors: ['#6b5545', '#846349', '#503f36'] }
  };
  const DIRECTIONS = {
    ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0]
  };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const trainer = (x, y, label, act, extra) => ({ x, y, label, act, ...extra });
  const prop = (x, y, art, w, h, solid = false) => ({ x, y, art, w, h, solid });

  function distanceToSegment(x, y, [ax, ay], [bx, by]) {
    const dx = bx - ax;
    const dy = by - ay;
    const fraction = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(x - ax - fraction * dx, y - ay - fraction * dy);
  }

  function isOnRoad(roads, x, y, margin) {
    return roads.some(points => points.some((point, i) => i > 0 &&
      distanceToSegment(x, y, points[i - 1], point) <= margin));
  }

  function cleanBobFrame(image) {
    if (cleanBobFrames.has(image)) return cleanBobFrames.get(image);
    const canvas = document.createElement('canvas');
    const { naturalWidth: width, naturalHeight: height } = image;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const frame = ctx.getImageData(0, 0, width, height);
    const original = new Uint8ClampedArray(frame.data);

    // The original cutout has a light matte on translucent contour pixels.
    // Borrow color from the adjacent opaque line while retaining soft alpha.
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const i = (y * width + x) * 4;
        const alpha = original[i + 3];
        if (!alpha || alpha >= 250) continue;
        if (alpha < 52) {
          frame.data[i + 3] = 0;
          continue;
        }
        let closest = -1;
        let score = Infinity;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const j = ((y + dy) * width + x + dx) * 4;
            if (original[j + 3] < 250) continue;
            const brightness = (original[j] + original[j + 1] + original[j + 2]) / 765;
            const candidate = dx * dx + dy * dy + brightness * 2;
            if (candidate < score) { closest = j; score = candidate; }
          }
        }
        if (closest < 0) continue;
        frame.data[i] = original[closest];
        frame.data[i + 1] = original[closest + 1];
        frame.data[i + 2] = original[closest + 2];
        frame.data[i + 3] = (alpha - 52) * 255 / 198;
      }
    }
    ctx.putImageData(frame, 0, 0);
    cleanBobFrames.set(image, canvas);
    return canvas;
  }

  function trailAt(x, y) {
    if (y < 296 + Math.sin(x / 93) * 31) return TRAILS.north;
    if (x < 404 + Math.sin(y / 94) * 41) return TRAILS.west;
    if (x > 716 + Math.sin(y / 79) * 38) return TRAILS.east;
    return null;
  }

  function describeArea(run) {
    const id = run.area || 'sanctuary';
    if (id === 'wildlands') {
      const entrants = [
        trainer(560, 746, 'Sanctuary City', 'exit', { portal: true }),
        trainer(823, 242, 'Caravan post', 'realms', { portal: true })
      ];
      ROADS.forEach(road => {
        entrants.push(trainer(road.x, road.y, road.city, 'travel', { landId: road.id, portal: true }));
        if (!(run.clearedRivalLandIds || []).includes(road.id)) {
          const x = road.x + (road.x < 560 ? 130 : road.x > 560 ? -130 : 95);
          const y = road.id === 'ice' ? 225 : 325;
          entrants.push(trainer(x, y, road.city + ' rival', 'road-rival', { landId: road.id, person: 'squire-bob' }));
        }
      });
      const wilds = ((run.wilds || {}).wildlands || []).slice(0, 6).map((card, i) => {
        const spots = [[385, 512], [740, 495], [335, 214], [685, 156], [170, 570], [943, 573]];
        return trainer(...spots[i], card.name, 'wild-foe', { card, cardId: card.id, roam: i + 1 });
      });
      return {
        id, name: 'The Wildlands', palette: 'wild', spawn: [560, 654], actors: entrants.concat(wilds),
        roads: [[[560, 820], [560, 384], [560, 0]], [[0, 384], [1120, 384]], [[560, 384], [700, 384], [823, 242]]],
        props: [prop(823, 207, 'props/waystone', 68, 74)]
      };
    }

    const city = id === 'sanctuary';
    const land = run.currentLand || {};
    const road = ROADS.find(item => item.id === id);
    const actors = [trainer(560, 748, 'The Wildlands', 'woods', { portal: true })];
    if (city) {
      actors.push(trainer(560, 225, 'Manage ArenaTeam', 'preset', { portal: true }));
    } else {
      if (!road && !(run.clearedRivalLandIds || []).includes(id)) {
        actors.push(trainer(372, 408, 'Realm rival', 'rival', { person: 'squire-bob' }));
      }
      const rallied = (run.ralliedLandIds || []).includes(id);
      actors.push(trainer(560, 248, road ? road.knight : 'Realm SiegeKnight', rallied ? 'talk' : 'knight',
        { person: road ? road.sprite : 'squire-bob' }));
      if (land.shrineOpen && land.legendary && !land.sigilEarned) {
        actors.push(trainer(807, 370, land.legendary.name, 'legendary', { card: land.legendary }));
      }
    }
    return {
      id, name: city ? 'Sanctuary City' : land.name || 'Realm City', palette: city ? 'city' : id,
      spawn: city ? [560, 546] : [560, 639], actors,
      roads: [[[560, 820], [560, 180]], [[215, 455], [905, 455]], ...(!city ? [[[685, 455], [807, 370]]] : [])],
      props: [
        prop(560, 192, 'props/arena', 226, 151, true),
        prop(388, 326, 'props/house', 128, 116, true),
        prop(745, 326, city ? 'props/house' : 'props/pyramid', 145, 125, true),
        prop(372, 590, 'props/house', 133, 110, true),
        prop(755, 591, 'props/house', 133, 110, true),
        prop(686, 475, 'props/fountain', 90, 69, true),
        prop(518, 717, 'props/pillar', 43, 65), prop(602, 717, 'props/pillar', 43, 65)
      ]
    };
  }

  class AdventureMap {
    constructor(onInteract, onPrompt) {
      this.onInteract = onInteract;
      this.onPrompt = onPrompt;
      this.root = document.createElement('div');
      this.root.className = 'cm-road-map';
      this.root.innerHTML = '<canvas class="cm-road-view" aria-label="Adventure map"></canvas>' +
        '<div class="cm-road-hud"><strong></strong><span></span><p role="status"></p></div>' +
        '<div class="cm-road-stick" role="group" aria-label="Move Squire Bob"><i></i></div>';
      this.canvas = this.root.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.terrain = document.createElement('canvas');
      this.terrain.width = WIDTH + 2 * TERRAIN_MARGIN;
      this.terrain.height = HEIGHT + 2 * TERRAIN_MARGIN;
      this.terrainCtx = this.terrain.getContext('2d', { alpha: false });
      this.keys = new Set();
      this.stick = [0, 0];
      this.frame = 0;
      this.elapsed = 0;
      this.clock = 0;
      this.images = new Map();
      this.observer = new ResizeObserver(() => this.invalidate());
      this.observer.observe(this.root);
      this.bindInput();
    }

    load(host, run, follower, arrival) {
      if (this.root.parentNode !== host) host.appendChild(this.root);
      const next = describeArea(run);
      const changedArea = !this.area || next.id !== this.area.id || this.token !== run.token || arrival;
      if (changedArea) {
        this.player = { x: next.spawn[0], y: next.spawn[1], facing: 'down' };
        if (arrival) {
          this.player.x = clamp(arrival.x, 26, WIDTH - 26);
          this.player.y = clamp(arrival.y, 26, HEIGHT - 26);
        }
        this.companion = { x: this.player.x - 38, y: this.player.y + 22 };
        this.clock = 0;
        this.images.clear();
        this.terrainDirty = true;
      }
      this.area = next;
      this.token = run.token;
      this.follower = follower;
      this.roamers = next.actors.filter(actor => actor.roam);
      if (this.encounterDistance == null || changedArea) this.resetEncounterDistance();
      this.heading = this.root.querySelector('.cm-road-hud strong');
      this.heading.textContent = next.name;
      this.trail = null;
      this.root.querySelector('.cm-road-hud span').textContent = '◎ ' + run.gold + '  ·  ⚑ ' + run.ralliedLandIds.length;
      this.setBanner(run.lastMessage);
      this.invalidate();
    }

    setBanner(message) {
      const banner = this.root.querySelector('.cm-road-hud p');
      banner.textContent = message || '';
      banner.hidden = !message;
    }

    bindInput() {
      window.addEventListener('keydown', event => {
        if (!this.active || document.hidden || event.altKey || event.ctrlKey || event.metaKey ||
            /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (DIRECTIONS[key]) {
          event.preventDefault();
          this.keys.add(key);
          this.invalidate();
        } else if (!event.repeat && (key === 'e' || ((key === 'Enter' || key === ' ') && event.target.tagName !== 'BUTTON'))) {
          event.preventDefault();
          this.tryInteract();
        }
      });
      window.addEventListener('keyup', event => this.keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
      window.addEventListener('blur', () => this.clearInput());
      document.addEventListener('visibilitychange', () => {
        this.clearInput();
        if (document.hidden) this.cancelFrame();
        else this.invalidate();
      });
      const pad = this.root.querySelector('.cm-road-stick');
      const positionStick = event => {
        const rect = pad.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) / 28;
        const y = (event.clientY - rect.top - rect.height / 2) / 28;
        const size = Math.max(1, Math.hypot(x, y));
        this.stick = [x / size, y / size];
        pad.firstElementChild.style.transform = 'translate(' + this.stick.map(n => n * 25 + 'px').join(',') + ')';
        this.invalidate();
      };
      pad.addEventListener('pointerdown', event => {
        if (!this.active || this.pointer != null) return;
        this.pointer = event.pointerId;
        pad.setPointerCapture(event.pointerId);
        positionStick(event);
      });
      pad.addEventListener('pointermove', event => {
        if (event.pointerId === this.pointer) positionStick(event);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
        pad.addEventListener(type, event => {
          if (event.pointerId === this.pointer) this.clearInput();
        });
      });
    }

    clearInput() {
      this.keys.clear();
      this.pointer = null;
      this.stick = [0, 0];
      this.root.querySelector('.cm-road-stick i').style.transform = '';
      this.invalidate();
    }

    enable(on) {
      this.active = on;
      this.clearInput();
      if (!on) this.cancelFrame();
    }

    cancelFrame() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.previous = 0;
    }

    invalidate() {
      if (!this.active || document.hidden || !this.area || this.frame) return;
      this.frame = requestAnimationFrame(now => this.tick(now));
    }

    tick(now) {
      this.frame = 0;
      if (!this.active || document.hidden) return;
      const milliseconds = this.previous ? now - this.previous : 50;
      if (milliseconds < (this.keys.size || this.pointer != null ? 32 : 48)) {
        this.invalidate();
        return;
      }
      this.previous = now;
      this.step(Math.min(milliseconds / 1000, .055));
      this.paint();
      if (this.area.id === 'wildlands' || this.keys.size || this.pointer != null) this.invalidate();
      else this.previous = 0;
    }

    step(dt) {
      let [dx, dy] = this.stick;
      this.keys.forEach(key => {
        dx += DIRECTIONS[key][0];
        dy += DIRECTIONS[key][1];
      });
      const magnitude = Math.hypot(dx, dy);
      const p = this.player;
      this.moving = magnitude > .13;
      const fromX = p.x;
      const fromY = p.y;
      if (this.moving) {
        const step = dt * 215 / Math.max(1, magnitude);
        p.facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        const x = clamp(p.x + dx * step, 26, WIDTH - 26);
        const y = clamp(p.y + dy * step, 26, HEIGHT - 26);
        if (!this.blocked(x, p.y)) p.x = x;
        if (!this.blocked(p.x, y)) p.y = y;
        const f = this.companion;
        const distance = Math.hypot(p.x - f.x, p.y - f.y);
        if (distance > 43) {
          const pace = Math.min(distance - 43, 205 * dt) / distance;
          f.x += (p.x - f.x) * pace;
          f.y += (p.y - f.y) * pace;
        }
        this.elapsed += dt;
      }
      this.clock += dt;
      if (this.area.id === 'wildlands') {
        const trail = trailAt(p.x, p.y);
        if (trail !== this.trail) {
          this.heading.textContent = trail ? trail.name : this.area.name;
          this.trail = trail;
        }
      }
      const nearest = this.area.actors.reduce((best, actor) => {
        const pos = this.actorPosition(actor);
        const distance = Math.hypot(pos.x - p.x, pos.y - p.y);
        return distance < best.distance ? { actor, distance } : best;
      }, { actor: null, distance: 69 }).actor;
      if (nearest !== this.near) {
        this.near = nearest;
        this.onPrompt(nearest, nearest && this.actionLabel(nearest));
      }
      this.maybeRandomEncounter(Math.hypot(p.x - fromX, p.y - fromY));
    }

    resetEncounterDistance() {
      this.encounterDistance = 200 + Math.random() * 270;
    }

    maybeRandomEncounter(distance) {
      if (!distance || !this.roamers.length || this.area.id !== 'wildlands') return;
      const { x, y } = this.player;
      if (isOnRoad(this.area.roads, x, y, 58) || this.area.actors.some(actor =>
        !actor.roam && Math.hypot(actor.x - x, actor.y - y) < 104)) return;
      this.encounterDistance -= distance;
      if (this.encounterDistance > 0) return;
      this.resetEncounterDistance();
      const lead = this.roamers[Math.floor(Math.random() * this.roamers.length)];
      this.onInteract('wild-ambush', lead);
    }

    blocked(x, y) {
      return this.area.props.some(p => p.solid && Math.abs(x - p.x) < p.w * .36 &&
        y > p.y - p.h * .46 && y < p.y - 7);
    }

    actionLabel(actor) {
      if (actor.act === 'wild-foe' || actor.act === 'knight' || actor.act === 'rival' || actor.act === 'road-rival') {
        return 'Challenge ' + actor.label;
      }
      return actor.label;
    }

    tryInteract() {
      if (this.active && this.near) this.onInteract(this.near.act, this.near);
    }

    actorPosition(actor) {
      if (!actor.roam) return actor;
      return {
        x: actor.x + Math.sin(this.clock * .9 + actor.roam * 2) * 31,
        y: actor.y + Math.cos(this.clock * .76 + actor.roam * 2) * 24
      };
    }

    image(url) {
      if (!url) return null;
      if (!this.images.has(url)) {
        const image = new Image();
        image.onload = () => this.invalidate();
        image.src = url;
        this.images.set(url, image);
      }
      const image = this.images.get(url);
      return image.complete && image.naturalWidth ? image : null;
    }

    paintTerrain() {
      const ctx = this.terrainCtx;
      const [ground, fleck, road, rim] = PALETTES[this.area.palette] || PALETTES.city;
      ctx.save();
      ctx.translate(TERRAIN_MARGIN, TERRAIN_MARGIN);
      ctx.fillStyle = ground;
      ctx.fillRect(-TERRAIN_MARGIN, -TERRAIN_MARGIN, this.terrain.width, this.terrain.height);
      const wild = this.area.id === 'wildlands';
      for (let y = -TERRAIN_MARGIN; y < HEIGHT + TERRAIN_MARGIN; y += 24) {
        for (let x = -TERRAIN_MARGIN; x < WIDTH + TERRAIN_MARGIN; x += 32) {
          const hash = ((x * 131 + y * 89) ^ (x * y + 21)) >>> 0;
          const trail = wild && trailAt(x, y);
          if (trail) {
            ctx.fillStyle = trail.colors[0];
            ctx.fillRect(x, y, 32, 24);
          }
          ctx.fillStyle = hash % 3 ? (trail ? trail.colors[1] : fleck) : (trail ? trail.colors[2] : rim);
          ctx.globalAlpha = wild ? .32 : .20;
          ctx.fillRect(x + hash % 10, y + hash % 7, wild ? 12 : 29, wild ? 5 : 16);
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalAlpha = 1;
      ctx.lineJoin = ctx.lineCap = 'round';
      const roadWidth = wild ? 103 : 148;
      [[rim, roadWidth], [road, roadWidth - 12]].forEach(([color, lineWidth]) => {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color;
        this.area.roads.forEach(points => {
          ctx.beginPath();
          points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
          ctx.stroke();
        });
      });
      if (!wild) {
        ctx.fillStyle = '#7c634f24';
        for (let cy = 199; cy < 820; cy += 23) {
          const offset = cy % 2 * 13;
          for (let cx = 510 + offset; cx < 615; cx += 27) ctx.fillRect(cx, cy, 20, 2);
        }
      }
      if (wild) this.paintGrass(ctx);
      const groves = [[55, 85], [241, 96], [441, 69], [695, 74], [896, 100], [1053, 75],
        [64, 775], [246, 791], [436, 795], [693, 774], [875, 795], [1030, 791]];
      if (wild) groves.push([170, 211], [310, 130], [407, 653], [757, 644], [908, 160], [1029, 625],
        [140, 680], [356, 595], [938, 510], [207, 504], [881, 682]);
      for (let i = 0; i < 8; i++) {
        const x = 47 + i * 147;
        groves.push([x, HEIGHT + 39 + i % 2 * 39], [x, -35 - i % 3 * 24]);
      }
      ctx.restore();
      this.groves = groves.map(([x, y], i) => ({ x, y, tree: .75 + i % 3 * .18 }));
      this.terrainDirty = false;
    }

    paintGrass(ctx) {
      for (let y = 28; y < HEIGHT - 16; y += 24) {
        for (let x = 23; x < WIDTH - 14; x += 27) {
          const offset = ((x * 73) ^ (y * 41)) & 15;
          const gx = x + offset;
          if (isOnRoad(this.area.roads, gx, y, 61)) continue;
          const trail = trailAt(gx, y);
          ctx.fillStyle = trail === TRAILS.north ? '#b5c4aa72' : trail === TRAILS.east ? '#c0996578' : '#a1a86a78';
          ctx.fillRect(gx, y, 2, 7);
          ctx.fillRect(gx + 3, y + 3, 2, 5);
          ctx.fillRect(gx - 3, y + 2, 2, 4);
        }
      }
    }

    face(ctx, vertices, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      vertices.forEach(([x, y, z], i) => {
        const px = projectX(x, y), py = projectY(y, z);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }

    box(ctx, x, y, w, depth, base, height, colors) {
      const left = x - w / 2, right = x + w / 2, back = y - depth, top = base + height;
      this.face(ctx, [[left, back, top], [right, back, top], [right, y, top], [left, y, top]], colors[0]);
      this.face(ctx, [[left, back, top], [left, y, top], [left, y, base], [left, back, base]], colors[1]);
      this.face(ctx, [[left, y, top], [right, y, top], [right, y, base], [left, y, base]], colors[2]);
    }

    paintTree(ctx, actor) {
      const { x, y, tree: size } = actor;
      const trail = this.area.id === 'wildlands' && trailAt(x, y);
      const cold = this.area.id === 'ice' || trail === TRAILS.north;
      const ember = this.area.id === 'fire' || trail === TRAILS.east;
      const leaves = cold ? ['#9faeb0', '#475f66', '#738f96']
        : ember ? ['#ba9c6d', '#634738', '#91694f'] : ['#8a9d68', '#355341', '#506f51'];
      this.paintShadow(ctx, projectX(x, y), projectY(y), 38 * size, 12 * size);
      this.box(ctx, x, y, 13 * size, 13 * size, 0, 49 * size, ['#a78765', '#493a31', '#694d3f']);
      this.box(ctx, x - 3, y + 12, 66 * size, 52 * size, 34 * size, 24 * size, leaves);
      this.box(ctx, x + 2, y + 2, 53 * size, 39 * size, 55 * size, 20 * size, leaves);
      this.box(ctx, x + 3, y - 3, 36 * size, 28 * size, 72 * size, 15 * size, leaves);
    }

    paintBuilding(ctx, p) {
      const { x, y, w, h } = p;
      const depth = h * .46;
      const wall = h * .54;
      const left = x - w * .41, right = x + w * .41, back = y - depth;
      const center = y - depth / 2;
      const roof = wall + h * .30;
      const ice = this.area.id === 'ice';
      const wind = this.area.id === 'wind';
      const tile = ice ? ['#a7c4c9', '#5d8998', '#426e80']
        : wind ? ['#94ac8d', '#658974', '#3e6c57'] : ['#cd8a56', '#aa5d45', '#7f443c'];
      this.paintShadow(ctx, projectX(x + 12, center), projectY(center), w * .58, depth * .46);
      this.box(ctx, x, y + 5, w * .91, depth + 10, 0, 9, ['#c0ab81', '#756651', '#97866c']);
      this.box(ctx, x, y, w * .82, depth, 9, wall - 9, ['#dbc292', '#a68764', '#c4a477']);
      this.face(ctx, [[left - 7, back - 7, wall], [right + 7, back - 7, wall],
        [right + 7, center, roof], [left - 7, center, roof]], tile[0]);
      this.face(ctx, [[left - 7, y + 7, wall], [right + 7, y + 7, wall],
        [right + 7, center, roof], [left - 7, center, roof]], tile[1]);
      this.face(ctx, [[left - 7, y + 7, wall], [left - 7, center, roof],
        [left - 7, back - 7, wall]], tile[2]);
      const facade = projectX(x, y + 1);
      const ground = projectY(y);
      ctx.fillStyle = '#42382e';
      ctx.fillRect(facade - w * .10, ground - wall * .62, w * .20, wall * .62);
      ctx.fillStyle = '#eec884';
      for (const direction of [-1, 1]) {
        const wx = facade + direction * w * .25;
        ctx.fillRect(wx - 7, ground - wall * .69, 14, 13);
        ctx.fillStyle = '#544b3c';
        ctx.fillRect(wx - 1, ground - wall * .69, 2, 13);
        ctx.fillStyle = '#eec884';
      }
      ctx.strokeStyle = tile[0];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(projectX(left - 7, center), projectY(center, roof));
      ctx.lineTo(projectX(right + 7, center), projectY(center, roof));
      ctx.stroke();
    }

    paintShadow(ctx, x, y, w, h) {
      ctx.fillStyle = '#1b211b56';
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    paintProp(ctx, p) {
      if (/props\/(arena|house|pyramid)$/.test(p.art)) {
        this.paintBuilding(ctx, p);
        return;
      }
      const image = this.image(ART + p.art + '.webp');
      const x = projectX(p.x, p.y), y = projectY(p.y);
      if (image) {
        this.paintShadow(ctx, x, y, p.w * .42, p.w * .09);
        ctx.drawImage(image, x - p.w / 2, y - p.h, p.w, p.h);
      }
    }

    paint() {
      const width = Math.floor(this.root.clientWidth);
      const height = Math.floor(this.root.clientHeight);
      if (!width || !height) return;
      const pixels = Math.min(window.devicePixelRatio || 1, 1.5);
      const canvas = this.canvas;
      const mapHeight = Math.max(220, height - 78);
      const scale = Math.min(1.42, Math.max(.84, Math.min(1.23, mapHeight / (HEIGHT * PITCH)),
        Math.min(width / 930, mapHeight / 560)));
      if (canvas.width !== Math.floor(width * pixels) || canvas.height !== Math.floor(height * pixels)) {
        canvas.width = Math.floor(width * pixels);
        canvas.height = Math.floor(height * pixels);
      }
      const viewW = width / scale;
      const viewH = mapHeight / scale;
      const px = projectX(this.player.x, this.player.y);
      const py = projectY(this.player.y);
      const border = HEIGHT * SKEW / 2;
      const x = viewW >= WIDTH + border * 2 ? (WIDTH - viewW) / 2
        : clamp(px - viewW / 2, -border, WIDTH + border - viewW);
      const depth = HEIGHT * PITCH;
      const spare = Math.max(74, (viewH - depth) / 2 + 20);
      const y = clamp(py - viewH * .56, -spare, depth + spare - viewH);
      if (this.terrainDirty) this.paintTerrain();
      const ctx = this.ctx;
      ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
      ctx.fillStyle = (PALETTES[this.area.palette] || PALETTES.city)[3];
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-x, -y);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.transform(1, 0, SKEW, PITCH, -HEIGHT * SKEW / 2, 0);
      ctx.drawImage(this.terrain, -TERRAIN_MARGIN, -TERRAIN_MARGIN);
      ctx.restore();
      const actors = this.area.actors.map(actor => ({ ...actor, ...this.actorPosition(actor), marked: actor === this.near }));
      actors.push(...this.groves, ...this.area.props.map(p => ({ ...p, drawProp: true })));
      actors.push({ ...this.player, person: 'squire-bob', player: true });
      if (this.follower) actors.push({ ...this.companion, card: this.follower, follower: true });
      const visible = actors.filter(actor => {
        const sx = projectX(actor.x, actor.y);
        const sy = projectY(actor.y);
        const radius = actor.w ? actor.w / 2 + 24 : 130;
        return sx + radius >= x && sx - radius <= x + viewW && sy >= y - 35 && sy <= y + viewH + 165;
      });
      visible.sort((a, b) => a.y - b.y).forEach(actor => this.paintActor(ctx, actor));
      visible.forEach(actor => {
        if (actor.label) this.paintActorLabel(ctx, actor);
      });
      ctx.restore();
      if (!document.documentElement.classList.contains('cm-no-minimap')) this.paintMinimap(ctx, width);
    }

    paintActor(ctx, actor) {
      if (actor.tree) {
        this.paintTree(ctx, actor);
        return;
      }
      if (actor.drawProp) {
        this.paintProp(ctx, actor);
        return;
      }
      const x = projectX(actor.x, actor.y), y = projectY(actor.y);
      ctx.fillStyle = actor.marked ? '#ffe49e' : '#1e222562';
      ctx.beginPath();
      ctx.ellipse(x, y, actor.portal ? 26 : 15, actor.portal ? 8 : 4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (actor.portal) {
        ctx.fillStyle = actor.marked ? '#ffe4a4' : '#d6b577';
        ctx.fillRect(x - 4, y - 35, 8, 35);
        ctx.fillRect(x - 19, y - 40, 38, 19);
        ctx.fillStyle = '#392a24';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(actor.x < 180 ? '←' : actor.x > 920 ? '→' : actor.y < 180 ? '↑' : actor.y > 650 ? '↓' : '◆', x, y - 25);
      } else if (actor.person) {
        const direction = actor.facing || 'down';
        const pose = actor.player && this.moving
          ? 'walk-' + (Math.floor(this.elapsed * 8) % 2 ? 'a' : 'b') : 'idle';
        const image = this.image('/img/sprites/' + actor.person + '/' + direction + '-' + pose + '.webp');
        if (image) {
          ctx.filter = actor.act === 'road-rival' ? 'hue-rotate(145deg)' : 'none';
          const sprite = actor.person === 'squire-bob' ? cleanBobFrame(image) : image;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(sprite, x - 38, y - 90, 76, 92);
          ctx.imageSmoothingEnabled = false;
          ctx.filter = 'none';
        }
      } else if (actor.card) {
        this.paintCreature(ctx, actor.card, x, y);
      }
    }

    paintActorLabel(ctx, actor) {
      const x = projectX(actor.x, actor.y);
      const y = projectY(actor.y) + (actor.portal ? 23 : 20);
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      const width = ctx.measureText(actor.label).width + 17;
      ctx.fillStyle = actor.marked ? '#ffe3a9' : '#172327e8';
      ctx.fillRect(x - width / 2, y - 17, width, 23);
      ctx.fillStyle = actor.marked ? '#2d2518' : '#fff0d2';
      ctx.fillText(actor.label, x, y);
    }

    paintCreature(ctx, card, x, y) {
      const sprites = window.SiegeSprites;
      const sheet = sprites && sprites.forCard(card.id);
      const image = this.image(sheet ? sheet.dir + 'idle.webp' : sprites?.overlayUrl(card));
      if (image && sheet) {
        const h = 37 / sheet.fit;
        const w = h * sheet.w / sheet.h;
        const frame = Math.floor(this.clock * 6) % sheet.frames.idle;
        ctx.drawImage(image, frame * sheet.w, 0, sheet.w, sheet.h, x - w / 2, y - h + h * sheet.base, w, h);
      } else if (image) {
        const h = 56;
        const w = Math.min(78, h * image.naturalWidth / image.naturalHeight);
        ctx.drawImage(image, x - w / 2, y - h, w, h);
      } else {
        const element = (card.element || 'neutral').toLowerCase();
        const icon = this.image('/img/elements/element-' + element +
          (['earth', 'ice', 'wind', 'fire'].includes(element) ? '-96.webp' : '.svg'));
        ctx.fillStyle = '#203533';
        ctx.beginPath();
        ctx.arc(x, y - 16, 15, 0, 2 * Math.PI);
        ctx.fill();
        if (icon) ctx.drawImage(icon, x - 11, y - 27, 22, 22);
      }
    }

    paintMinimap(ctx, width) {
      const x = width - 103;
      const y = Math.max(78, this.root.querySelector('.cm-road-hud').offsetHeight + 8);
      const sx = 88 / WIDTH;
      const sy = 65 / HEIGHT;
      ctx.fillStyle = '#182528db';
      ctx.fillRect(x, y, 88, 65);
      ctx.strokeStyle = '#cfac7b';
      ctx.lineWidth = 2;
      this.area.roads.forEach(road => {
        ctx.beginPath();
        road.forEach(([u, v], i) => i ? ctx.lineTo(x + u * sx, y + v * sy) : ctx.moveTo(x + u * sx, y + v * sy));
        ctx.stroke();
      });
      ctx.fillStyle = '#fff3ae';
      ctx.beginPath();
      ctx.arc(x + this.player.x * sx, y + this.player.y * sy, 3.5, 0, 2 * Math.PI);
      ctx.fill();
    }

    snapshot() {
      return {
        projection: 'oblique 2.5D', area: this.area.id, trail: this.trail?.name || null, player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
        near: this.near?.label || null, running: this.active && !document.hidden, frameScheduled: !!this.frame,
        points: this.area.actors.map(actor => {
          const { x, y } = this.actorPosition(actor);
          return { label: actor.label, act: actor.act, x: Math.round(x), y: Math.round(y) };
        })
      };
    }
  }

  AdventureMap.cleanOpeningSprite = function (image) {
    const clean = () => {
      if (image.naturalWidth) image.src = cleanBobFrame(image).toDataURL();
    };
    if (image.complete) clean();
    else image.addEventListener('load', clean, { once: true });
  };
  window.CampaignAdventureMap = AdventureMap;
})();
