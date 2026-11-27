/* One 2D viewport and one baked terrain layer for the current Adventure area. */
(function () {
  'use strict';

  const WIDTH = 1120;
  const HEIGHT = 820;
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
      this.terrain.width = WIDTH;
      this.terrain.height = HEIGHT;
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
      if (!this.area || next.id !== this.area.id || this.token !== run.token || arrival) {
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

    image(url, terrain = false) {
      if (!url) return null;
      if (!this.images.has(url)) {
        const image = new Image();
        image.onload = () => {
          if (terrain) this.terrainDirty = true;
          this.invalidate();
        };
        image.src = url;
        this.images.set(url, image);
      }
      const image = this.images.get(url);
      return image.complete && image.naturalWidth ? image : null;
    }

    paintTerrain() {
      const ctx = this.terrainCtx;
      const [ground, fleck, road, rim] = PALETTES[this.area.palette] || PALETTES.city;
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const wild = this.area.id === 'wildlands';
      for (let y = 0; y < HEIGHT; y += 24) {
        for (let x = 0; x < WIDTH; x += 32) {
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
      ctx.strokeStyle = rim;
      ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, WIDTH, HEIGHT);
      const groves = [[55, 85], [241, 96], [441, 69], [695, 74], [896, 100], [1053, 75],
        [64, 775], [246, 791], [436, 795], [693, 774], [875, 795], [1030, 791]];
      if (wild) groves.push([170, 211], [310, 130], [407, 653], [757, 644], [908, 160], [1029, 625],
        [140, 680], [356, 595], [938, 510], [207, 504], [881, 682]);
      groves.forEach(([x, y], i) => this.paintTree(ctx, x, y, .75 + i % 3 * .18));
      this.terrainDirty = false;
    }

    paintTree(ctx, x, y, size) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size, size);
      ctx.fillStyle = '#1c231a44';
      ctx.fillRect(-24, -12, 66, 20);
      ctx.fillStyle = '#624737';
      ctx.fillRect(-5, -60, 12, 64);
      const trail = this.area.id === 'wildlands' && trailAt(x, y);
      const cold = this.area.id === 'ice' || trail === TRAILS.north;
      const ember = this.area.id === 'fire' || trail === TRAILS.east;
      [[-28, -85, 53, 31], [-39, -67, 77, 33], [-23, -49, 54, 23]].forEach(([u, v, w, h]) => {
        ctx.fillStyle = cold ? '#324f60' : '#293e34';
        ctx.fillRect(u + 3, v + 5, w, h);
        ctx.fillStyle = cold ? '#6c9098' : ember ? '#82503f' : '#40624a';
        ctx.fillRect(u, v, w, h - 7);
        ctx.fillStyle = cold ? '#a5c0ba' : ember ? '#b27a52' : '#597853';
        ctx.fillRect(u + 5, v, w - 17, 7);
      });
      ctx.restore();
    }

    paintProp(ctx, p) {
      const image = this.image(ART + p.art + '.webp', true);
      if (image) ctx.drawImage(image, p.x - p.w / 2, p.y - p.h, p.w, p.h);
    }

    paint() {
      const width = Math.floor(this.root.clientWidth);
      const height = Math.floor(this.root.clientHeight);
      if (!width || !height) return;
      const pixels = Math.min(window.devicePixelRatio || 1, 1.5);
      const canvas = this.canvas;
      const mapHeight = Math.max(220, height - 78);
      const scale = Math.min(1.48, Math.max(.73, mapHeight / HEIGHT, Math.min(width / 920, mapHeight / 610)));
      if (canvas.width !== Math.floor(width * pixels) || canvas.height !== Math.floor(height * pixels)) {
        canvas.width = Math.floor(width * pixels);
        canvas.height = Math.floor(height * pixels);
      }
      const viewW = width / scale;
      const viewH = mapHeight / scale;
      const x = viewW >= WIDTH ? (WIDTH - viewW) / 2 : clamp(this.player.x - viewW / 2, 0, WIDTH - viewW);
      const y = viewH >= HEIGHT ? (HEIGHT - viewH) / 2 : clamp(this.player.y - viewH / 2, 0, HEIGHT - viewH);
      if (this.terrainDirty) this.paintTerrain();
      const ctx = this.ctx;
      ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
      ctx.fillStyle = (PALETTES[this.area.palette] || PALETTES.city)[3];
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-x, -y);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.terrain, 0, 0);
      const actors = this.area.actors.map(actor => ({ ...actor, ...this.actorPosition(actor), marked: actor === this.near }));
      actors.push(...this.area.props.map(p => ({ ...p, drawProp: true })));
      actors.push({ ...this.player, person: 'squire-bob', player: true });
      if (this.follower) actors.push({ ...this.companion, card: this.follower, follower: true });
      actors.sort((a, b) => a.y - b.y).forEach(actor => this.paintActor(ctx, actor));
      ctx.restore();
      if (!document.documentElement.classList.contains('cm-no-minimap')) this.paintMinimap(ctx, width);
    }

    paintActor(ctx, actor) {
      const { x, y } = actor;
      if (actor.drawProp) {
        this.paintProp(ctx, actor);
        return;
      }
      ctx.fillStyle = actor.marked ? '#fff0ae' : '#1e22259c';
      ctx.beginPath();
      ctx.ellipse(x, y, actor.portal ? 26 : 18, actor.portal ? 10 : 6, 0, 0, Math.PI * 2);
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
          ctx.drawImage(image, x - 38, y - 85, 76, 92);
          ctx.filter = 'none';
        }
      } else if (actor.card) {
        this.paintCreature(ctx, actor);
      }
      if (actor.label) {
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        const yy = y + (actor.portal ? 27 : 25);
        const w = ctx.measureText(actor.label).width + 17;
        ctx.fillStyle = actor.marked ? '#ffe3a9' : '#172327e8';
        ctx.fillRect(x - w / 2, yy - 17, w, 23);
        ctx.fillStyle = actor.marked ? '#2d2518' : '#fff0d2';
        ctx.fillText(actor.label, x, yy);
      }
    }

    paintCreature(ctx, actor) {
      const card = actor.card;
      const sprites = window.SiegeSprites;
      const sheet = sprites && sprites.forCard(card.id);
      const image = this.image(sheet ? sheet.dir + 'idle.webp' : sprites?.overlayUrl(card));
      if (image && sheet) {
        const h = 37 / sheet.fit;
        const w = h * sheet.w / sheet.h;
        const frame = Math.floor(this.clock * 6) % sheet.frames.idle;
        ctx.drawImage(image, frame * sheet.w, 0, sheet.w, sheet.h, actor.x - w / 2, actor.y - h + h * sheet.base, w, h);
      } else if (image) {
        const h = 56;
        const w = Math.min(78, h * image.naturalWidth / image.naturalHeight);
        ctx.drawImage(image, actor.x - w / 2, actor.y - h, w, h);
      } else {
        const element = (card.element || 'neutral').toLowerCase();
        const icon = this.image('/img/elements/element-' + element +
          (['earth', 'ice', 'wind', 'fire'].includes(element) ? '-96.webp' : '.svg'));
        ctx.fillStyle = '#203533';
        ctx.beginPath();
        ctx.arc(actor.x, actor.y - 16, 15, 0, 2 * Math.PI);
        ctx.fill();
        if (icon) ctx.drawImage(icon, actor.x - 11, actor.y - 27, 22, 22);
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
        area: this.area.id, trail: this.trail?.name || null, player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
        near: this.near?.label || null, running: this.active && !document.hidden, frameScheduled: !!this.frame,
        points: this.area.actors.map(actor => {
          const { x, y } = this.actorPosition(actor);
          return { label: actor.label, act: actor.act, x: Math.round(x), y: Math.round(y) };
        })
      };
    }
  }

  window.CampaignAdventureMap = AdventureMap;
})();
