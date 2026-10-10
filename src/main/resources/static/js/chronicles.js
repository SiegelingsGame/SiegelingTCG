/* Siegeknight Chronicles client. Every rule runs server-side (ChroniclesService);
 * this file renders the snapshot, animates idle progress from server timestamps,
 * and posts the player's choices. */
(function () {
  'use strict';

  var AUTH_TOKEN_KEY = 'sieglingsAuthToken';
  var COOKIE_SESSION_VALUE = 'cookie';
  var TAB_KEY = 'sieglingsChroniclesTab';
  var WORK_KEY = 'sieglingsChroniclesWorkSkill';
  var apiBase = String((window.SIEGLINGS_CONFIG && window.SIEGLINGS_CONFIG.apiBaseUrl) || '').replace(/\/$/, '');
  var STORAGE_ART_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/';
  var ART_THUMB_WIDTHS = [160, 240, 320, 480, 640, 960];
  var RASTER_ELEMENTS = { FIRE: 1, EARTH: 1, ICE: 1, WIND: 1 };

  var state = {
    snap: null,
    tab: readTab(),
    clockOffset: 0,
    busy: false,
    pollTimer: 0,
    oathPick: '',
    supplies: {},
    rune: '',
    prepOpen: false,
    guild: null,
    market: null,
    realmError: '',
    openCompanion: '',
    workSkill: readPref(WORK_KEY),
    workLast: {},
    workSeeded: false,
    recipePick: ''
  };

  var $ = function (id) { return document.getElementById(id); };
  var main = $('ckMain');

  // ── utilities ────────────────────────────────────────────────────────────

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readTab() {
    try { return localStorage.getItem(TAB_KEY) || 'work'; } catch (e) { return 'work'; }
  }

  function readPref(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function savePref(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* per-viewer nicety only */ }
  }

  function saveTab(tab) {
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) { /* per-viewer nicety only */ }
  }

  function serverNow() { return Date.now() + state.clockOffset; }

  function pct(into, span) {
    if (!span) return 0;
    return Math.max(0, Math.min(100, Math.round((into / span) * 100)));
  }

  function bar(into, span, cls) {
    return '<span class="ck-bar' + (cls ? ' ' + cls : '') + '"><i style="width:' + pct(into, span) + '%"></i></span>';
  }

  function duration(ms) {
    ms = Math.max(0, ms);
    var s = Math.round(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    if (m > 0) return m + 'm ' + (sec < 10 ? '0' : '') + sec + 's';
    return sec + 's';
  }

  function elKey(el) { return String(el || 'NEUTRAL').toLowerCase(); }

  function elementIcon(el, size) {
    var key = elKey(el);
    var src = RASTER_ELEMENTS[String(el || '').toUpperCase()]
      ? '/img/elements/element-' + key + '-96.webp' : '/img/elements/element-' + key + '.svg';
    return '<img class="ck-el-ico" src="' + src + '" alt="" width="' + (size || 16) + '" height="' + (size || 16) + '">';
  }

  function chip(text, cls) { return '<span class="ck-chip' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }

  function elChip(el, label) {
    return '<span class="ck-chip ck-el" style="--el:var(--' + elKey(el) + ')">' + elementIcon(el, 14) + esc(label || el) + '</span>';
  }

  // Same thumbnail chain as Siege (adventure.js artThumbChain): pre-cut WebP, mirror, original.
  function artChain(url, width) {
    var u = String(url || '');
    if (!u) return [];
    var local = u.match(/^(\/(?:img|assets)\/[^?#]+)\.png$/i);
    if (local) return [local[1] + '.webp', u];
    if (u.indexOf(STORAGE_ART_PREFIX) !== 0) return [u];
    var mirror = '/api/cards/art-mirror?w=' + width + '&url=' + encodeURIComponent(u);
    var token = (u.match(/[?&]token=([0-9A-Za-z-]{8,64})(?:&|$)/) || [])[1];
    if (!token) return [mirror, u];
    var bucket = ART_THUMB_WIDTHS[ART_THUMB_WIDTHS.length - 1];
    for (var i = 0; i < ART_THUMB_WIDTHS.length; i++) {
      if (ART_THUMB_WIDTHS[i] >= width) { bucket = ART_THUMB_WIDTHS[i]; break; }
    }
    return [STORAGE_ART_PREFIX + encodeURIComponent('art-thumbs/' + token + '/w' + bucket + '.webp') +
      '?alt=media&token=' + token, mirror, u];
  }

  window.ckArtNext = function (img) {
    var chain = artChain(img.getAttribute('data-art'), Number(img.getAttribute('data-w')) || 240);
    var step = Number(img.getAttribute('data-step') || 0) + 1;
    if (step >= chain.length) {
      img.onerror = null;
      img.parentNode.classList.add('is-noart');
      img.remove();
      return;
    }
    img.setAttribute('data-step', String(step));
    img.src = chain[step];
  };

  function portrait(unit, width, cls) {
    var chain = artChain(unit.artUrl, width || 240);
    var initial = esc(String(unit.nickname || unit.species || '?').charAt(0));
    var inner = chain.length
      ? '<img src="' + esc(chain[0]) + '" data-art="' + esc(unit.artUrl) + '" data-w="' + (width || 240) +
        '" alt="" loading="lazy" decoding="async" onerror="ckArtNext(this)">'
      : '';
    return '<span class="ck-portrait' + (chain.length ? '' : ' is-noart') + (cls ? ' ' + cls : '') +
      '" style="--el:var(--' + elKey(unit.element) + ')" data-initial="' + initial + '">' + inner + '</span>';
  }

  function find(list, key, value) {
    for (var i = 0; i < (list || []).length; i++) if (list[i][key] === value) return list[i];
    return null;
  }

  function companion(id) { return state.snap ? find(state.snap.companions, 'id', id) : null; }

  function invQty(id) {
    var row = state.snap ? find(state.snap.inventory, 'id', id) : null;
    return row ? row.qty : 0;
  }

  // ── art ──────────────────────────────────────────────────────────────────
  // Art leads every screen: a painted scene behind each tab (img/chronicles/scenes, cut from
  // lands/locations), Siegeling portraits, and colour emoji for items, which iOS renders in full
  // colour. All of it is presentation; nothing here feeds a rule.

  var SCENE_DIR = '/img/chronicles/scenes/';
  var SCENE_ELEMENTS = { fire: 1, water: 1, earth: 1, wind: 1, ice: 1, metal: 1, electric: 1, poison: 1, psychic: 1,
    shadow: 1, light: 1, undead: 1, relic: 1, obsidian: 1, aurora: 1, badlands: 1 };

  function scene(el, kind) {
    var key = elKey(el);
    return SCENE_DIR + (SCENE_ELEMENTS[key] ? key : 'earth') + '-' + (kind || 'journey') + '.webp';
  }

  function namedScene(name) { return SCENE_DIR + name + '.webp'; }

  var PROFESSION_SCENES = {
    mining: 'metal-journey', woodcutting: 'earth-journey', foraging: 'wind-journey', fishing: 'water-shelter',
    excavation: 'relic-journey', smelting: 'fire-journey', smithing: 'fire-shelter', carpentry: 'earth-shelter',
    weaving: 'wind-shelter', cooking: 'ice-shelter', alchemy: 'poison-shelter', runecrafting: 'psychic-shelter',
    elemental_studies: 'aurora-journey'
  };
  var BUILDING_SCENES = { sanctuary: 'wind-shelter', forge: 'fire-shelter', garden: 'poison-shelter',
    war_room: 'metal-shelter', stable: 'earth-shelter', library: 'psychic-shelter' };
  var ROUTE_SCENE_KIND = { PATROL: 'journey', RESOURCE: 'shelter', HUNT: 'journey', DUNGEON: 'elite', GRAND: 'boss' };

  function routeScene(element, type) { return scene(element, ROUTE_SCENE_KIND[type] || 'journey'); }

  function expeditionScene(s) {
    var e = s.expedition;
    var r = find(s.routes, 'id', e.routeId);
    if (/^operation:/.test(e.routeId || '')) return scene(e.element, 'boss');
    return routeScene(e.element, r ? r.type : '');
  }

  var SKILL_EMOJI = {
    mining: '⛏️', woodcutting: '🪓', foraging: '🌿', fishing: '🎣',
    excavation: '🦴', smelting: '🔥', smithing: '⚒️', carpentry: '🪚',
    weaving: '🧵', cooking: '🍳', alchemy: '⚗️', runecrafting: '🔮',
    taming: '🪢', bonding: '💞', husbandry: '🧺', pathfinding: '🧭',
    survival: '⛺', cartography: '🗺️', command: '🚩', elemental_studies: '📚',
    class_tactics: '♟️'
  };
  var CLASS_EMOJI = { Guardian: '🛡️', Bruiser: '👊', Assassin: '🗡️',
    Mage: '🔮', Support: '💚' };
  var CLASS_HUE = { Guardian: 'metal', Bruiser: 'fire', Assassin: 'shadow', Mage: 'psychic', Support: 'poison' };
  var WEAPON_EMOJI = { sword: '🗡️', spear: '🔱', bow: '🏹', staff: '🪄',
    hammer: '🔨', daggers: '🔪' };
  var KIND_EMOJI = { MATERIAL: '🪨', ESSENCE: '✨', POTION: '🧪', LURE: '🪝',
    FOOD: '🍲', WEAPON: '🗡️', ARMOR: '🛡️', RELIC: '🏺',
    RUNE: '📜', HELMET: '⛑️', BOOTS: '👢', ACCESSORY: '💍', STUDY: '📖' };
  // Items whose kind alone would read wrong (a fish is not a rock).
  var ITEM_EMOJI = {
    ember_shard: '🔥', frost_crystal: '❄️', pine_log: '🪵', oak_log: '🪵',
    heartwood: '🌳', sunleaf: '🌿', frostbloom: '🌸', galeberry: '🫐',
    gale_feather: '🪶', minnow: '🐟', silverfin: '🐠', copper_bar: '🧱',
    iron_bar: '🧱', ancient_relic: '🏺', fossil: '🦴', relic_shard: '💠',
    rune_stone: '🔷', flax: '🌾', linen: '🧶', rope: '🪢',
    pine_plank: '🪵', oak_plank: '🪵', tide_pearl: '🦪', storm_glass: '⚡',
    umbral_crystal: '🔮', mind_prism: '💎', living_alloy: '⚙️', grave_dust: '💀',
    wild_bait: '🪱', snare_crate: '📦', breezewoven_net: '🕸️',
    grilled_minnow: '🍢', sunleaf_salad: '🥗', silverfin_stew: '🍲', berry_tart: '🥧',
    travelers_coat: '🧥', frostweave_cloak: '🧥', tidewarden_cloak: '🧥',
    stormward_cloak: '🧥', linen_robe: '🥻', ember_robe: '🥻', grandmasters_mantle: '🧥',
    runeheart: '❤️‍🔥', dawn_lantern: '🏮', clarity_charm: '🧿',
    alloy_breaker: '⚙️', grave_ward: '🪦', emberward_charm: '🔥', rally_banner: '🚩',
    bastion_crest: '🛡️', mending_amulet: '📿', prism_pendant: '🔷'
  };
  // Material hues borrow the element palette (CLAUDE.md: one palette).
  var HUE_WORDS = [
    ['copper', 'earth'], ['iron', 'metal'], ['ember', 'fire'], ['frost', 'ice'], ['gale', 'wind'], ['storm', 'electric'],
    ['tide', 'water'], ['pearl', 'water'], ['silverfin', 'water'], ['minnow', 'water'], ['pine', 'earth'], ['oak', 'earth'],
    ['heart', 'earth'], ['sunleaf', 'poison'], ['berry', 'psychic'], ['flax', 'light'], ['linen', 'light'], ['rope', 'earth'],
    ['relic', 'light'], ['fossil', 'light'], ['rune', 'psychic'], ['mind', 'psychic'], ['umbral', 'shadow'], ['grave', 'undead'],
    ['alloy', 'metal'], ['herb', 'poison'], ['bait', 'earth'], ['root', 'earth']
  ];

  function itemHue(id, fallback) {
    var key = String(id || '');
    var essence = key.match(/^essence_([a-z]+)/);
    if (essence) return essence[1];
    for (var i = 0; i < HUE_WORDS.length; i++) if (key.indexOf(HUE_WORDS[i][0]) >= 0) return HUE_WORDS[i][1];
    return fallback || 'neutral';
  }

  function itemEmoji(id, kind) {
    var key = String(id || '');
    if (ITEM_EMOJI[key]) return ITEM_EMOJI[key];
    if (kind === 'WEAPON') {
      for (var w in WEAPON_EMOJI) if (key.indexOf(w.replace(/s$/, '')) >= 0) return WEAPON_EMOJI[w];
      if (key.indexOf('lance') >= 0) return WEAPON_EMOJI.spear;
    }
    return KIND_EMOJI[kind || 'MATERIAL'] || '📦';
  }

  // An item medallion: element art for essences, colour emoji for everything else.
  function itemIcon(id, kind, cls) {
    var key = String(id || '');
    var essence = key.match(/^essence_([a-z]+)/);
    var hue = itemHue(key, kind === 'POTION' ? 'poison' : kind === 'FOOD' ? 'fire' : 'neutral');
    return '<span class="ck-ico' + (cls ? ' ' + cls : '') + '" style="--ih:var(--' + hue + ')" aria-hidden="true">' +
      (essence ? elementIcon(essence[1].toUpperCase(), 26) : itemEmoji(key, kind)) + '</span>';
  }

  function emojiIcon(emoji, hue, cls) {
    return '<span class="ck-ico' + (cls ? ' ' + cls : '') + '" style="--ih:var(--' + (hue || 'neutral') + ')" aria-hidden="true">' +
      emoji + '</span>';
  }

  // A painted banner: the scene fills it, a shade keeps type legible, art may sit on the right.
  function hero(o) {
    return '<section class="ck-banner' + (o.cls ? ' ' + o.cls : '') + '"' + (o.el ? ' style="--el:var(--' + elKey(o.el) + ')"' : '') + '>' +
      '<img class="ck-banner-img" src="' + esc(o.scene) + '" alt="" decoding="async">' +
      '<span class="ck-banner-shade" aria-hidden="true"></span>' +
      (o.art ? '<div class="ck-banner-art">' + o.art + '</div>' : '') +
      '<div class="ck-banner-body">' +
        (o.kicker ? '<p class="ck-banner-kicker">' + o.kicker + '</p>' : '') +
        '<h2 class="ck-banner-title">' + o.title + '</h2>' + (o.body || '') +
      '</div>' + (o.foot ? '<div class="ck-banner-foot">' + o.foot + '</div>' : '') +
    '</section>';
  }

  function partner(s) {
    var list = (s && s.companions) || [];
    return find(list, 'origin', 'starter') || list[0] || null;
  }

  // ── network ──────────────────────────────────────────────────────────────

  function hasSession() {
    try { return Boolean(localStorage.getItem(AUTH_TOKEN_KEY)); } catch (e) { return false; }
  }

  function requestId() {
    return 'ck-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function api(path, body) {
    var token = '';
    try { token = localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (e) { token = ''; }
    var headers = { 'Content-Type': 'application/json' };
    // The sentinel means the session rides the cookie; anything else is a real Bearer token.
    if (token && token !== COOKIE_SESSION_VALUE) headers.Authorization = 'Bearer ' + token;
    var opts = { method: body ? 'POST' : 'GET', headers: headers, credentials: 'same-origin' };
    if (body) opts.body = JSON.stringify(body);
    return fetch(apiBase + path, opts).then(function (res) {
      return res.text().then(function (raw) {
        var data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = { error: 'Unexpected server response.' }; }
        if (!res.ok) { data.error = data.error || res.statusText || 'Request failed.'; data.status = res.status; }
        return data;
      });
    }, function () {
      return { error: 'Could not reach the server. Check your connection and try again.', status: 0 };
    });
  }

  function load() {
    if (!hasSession()) { renderGate(); return Promise.resolve(); }
    return api('/api/chronicles').then(function (data) {
      if (data.status === 401) { renderGate(); return; }
      if (data.error) { renderError(data.error); return; }
      accept(data);
    });
  }

  function act(path, body, after) {
    if (state.busy) return Promise.resolve();
    state.busy = true;
    document.body.classList.add('is-busy');
    body = body || {};
    body.requestId = requestId();
    if (state.snap && state.snap.version != null) body.expectedVersion = state.snap.version;
    return api(path, body).then(function (data) {
      state.busy = false;
      document.body.classList.remove('is-busy');
      if (data.status === 409) { toast(data.error, 'warn'); return load(); }
      if (data.status === 401) { renderGate(); return; }
      if (data.error) { toast(data.error, 'bad'); return; }
      // A collect's milestones are listed inside the report rather than stacked over it.
      accept(data, Boolean(data.report));
      if (after) after(data);
    });
  }

  function accept(data, quiet) {
    if (data.serverNow) state.clockOffset = data.serverNow - Date.now();
    if (!data.started) { state.snap = null; renderOath(data); return; }
    state.snap = data;
    if (!quiet) (data.events || []).forEach(function (e) { toast(e, 'good'); });
    render();
    schedulePoll();
    if (data.away && !$('ckModal').dataset.kind) showAway(data.away);
  }

  // While the company is out, the server reveals the road a few entries at a time.
  function schedulePoll() {
    clearTimeout(state.pollTimer);
    var e = state.snap && state.snap.expedition;
    if (!e || e.done) return;
    var wait = Math.min(30000, Math.max(4000, e.completesAt - serverNow() + 800));
    state.pollTimer = setTimeout(function () { if (!document.hidden) load(); else schedulePoll(); }, wait);
  }

  // ── toasts / modal ───────────────────────────────────────────────────────

  function toast(text, tone) {
    var host = $('ckToasts');
    var el = document.createElement('div');
    el.className = 'ck-toast is-' + (tone || 'info');
    el.textContent = text;
    host.appendChild(el);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () { el.classList.add('is-out'); }, 3800);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4300);
  }

  function openModal(kind, html) {
    var modal = $('ckModal');
    modal.dataset.kind = kind;
    $('ckModalBody').innerHTML = html;
    modal.hidden = false;
  }

  function closeModal() {
    var modal = $('ckModal');
    modal.hidden = true;
    modal.dataset.kind = '';
    $('ckModalBody').innerHTML = '';
  }

  function itemLines(items) {
    if (!items || !items.length) return '<p class="ck-muted">Nothing.</p>';
    return '<ul class="ck-loot">' + items.map(function (i) {
      return '<li>' + itemIcon(i.id, i.kind, 'is-sm') + '<span><b>' + esc(i.qty) + '×</b> ' + esc(i.name) + '</span></li>';
    }).join('') + '</ul>';
  }

  function xpLines(rows) {
    if (!rows || !rows.length) return '';
    return '<ul class="ck-xp">' + rows.map(function (r) {
      return '<li><span>' + esc(r.label) + '</span><b>+' + esc(r.xp) + ' xp</b></li>';
    }).join('') + '</ul>';
  }

  function showAway(away) {
    var span = duration(away.toAt - away.fromAt);
    openModal('away',
      '<h2 id="ckModalTitle">While you were away</h2>' +
      '<p class="ck-muted">' + esc(span) + ' of ' + esc(away.activityName) + ' · ' + esc(away.actions) + ' actions' +
      (away.capped ? ' · <b>reached the 12h idle cap</b>' : '') + '</p>' +
      (away.stoppedReason ? '<p class="ck-warn">' + esc(away.stoppedReason) + '</p>' : '') +
      '<h3>Gained</h3>' + itemLines(away.items) +
      (away.consumed && away.consumed.length ? '<h3>Used</h3>' + itemLines(away.consumed) : '') +
      xpLines(away.xp) +
      '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="ack-away">Continue</button></div>');
  }

  function showReport(report, events) {
    var tone = report.outcome === 'complete' ? 'Expedition complete' :
      report.outcome === 'retreat' ? 'The company retreated' : 'The company was overwhelmed';
    openModal('report',
      '<h2 id="ckModalTitle">' + esc(report.route) + '</h2>' +
      '<p class="ck-outcome is-' + esc(report.outcome) + '">' + esc(tone) + ' · ' + esc(report.encountersWon) + '/' +
      esc(report.encountersTotal) + ' battles won</p>' +
      (events && events.length ? '<h3>Milestones</h3><ul class="ck-milestones">' + events.map(function (e) {
        return '<li>' + esc(e) + '</li>';
      }).join('') + '</ul>' : '') +
      '<h3>Company</h3><ul class="ck-xp">' + (report.companions || []).map(function (c) {
        return '<li><span>' + esc(c.name) + '</span><b>+' + esc(c.xp) + ' xp · +' + esc(c.bond) + ' bond</b></li>';
      }).join('') + '</ul>' +
      '<h3>Knowledge</h3>' + xpLines(report.xp) +
      '<h3>Loot</h3>' + itemLines(report.items) +
      (report.suppliesReturned && report.suppliesReturned.length ? '<h3>Supplies returned</h3>' + itemLines(report.suppliesReturned) : '') +
      (report.sightings ? '<p class="ck-rare">' + esc(report.sightings) + ' wild Siegeling' + (report.sightings > 1 ? 's' : '') +
        ' spotted. Visit the Wilds to tame.</p>' : '') +
      '<details class="ck-log"><summary>Full road log</summary>' + timelineHtml(report.timeline) + '</details>' +
      '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="close-modal">Home again</button></div>');
  }

  // ── gate / oath ──────────────────────────────────────────────────────────

  function setScreen(name) {
    document.body.dataset.screen = name;
    $('ckTabs').hidden = name !== 'main';
    $('ckRank').hidden = name !== 'main';
    $('ckStatus').hidden = name !== 'main';
    $('ckAvatar').hidden = name !== 'main';
    $('ckCrowns').hidden = name !== 'main';
    if (name !== 'main') setBackdrop(namedScene(name === 'oath' ? 'light-journey' : 'wind-journey'));
  }

  function setBackdrop(url) {
    var el = $('ckBackdrop');
    if (el.dataset.src === url) return;
    el.dataset.src = url;
    el.style.setProperty('--scene', 'url("' + url + '")');
  }

  // The scene behind each tab follows what the player is looking at.
  function tabScene(s) {
    switch (state.tab) {
      case 'knight': return namedScene('light-shelter');
      case 'company': { var p = partner(s); return scene(p ? p.element : 'EARTH', 'journey'); }
      case 'work': return namedScene(PROFESSION_SCENES[currentWorkSkill(s, workPages(s))] || 'earth-journey');
      case 'expedition': return s.expedition ? expeditionScene(s) : namedScene('wind-journey');
      case 'base': return namedScene('relic-shelter');
      case 'realm': {
        var op = state.guild && state.guild.guild && state.guild.guild.operation;
        return op ? scene(op.element, 'boss') : namedScene('metal-boss');
      }
      case 'wilds': return s.sightings.length ? scene(s.sightings[0].element, 'journey') : namedScene('wind-elite');
      default: return namedScene('earth-journey');
    }
  }

  function renderGate() {
    setScreen('gate');
    main.innerHTML =
      '<section class="ck-hero">' +
        '<img class="ck-gate-art" src="' + namedScene('earth-journey') + '" alt="" decoding="async">' +
        '<p class="ck-kicker">Idle RPG · Creature Bonding · Skill Mastery</p>' +
        '<h1>Become a Siegeknight.</h1>' +
        '<p>Train professions, master the elements, and forge bonds with your Siegelings. Your company explores, ' +
        'fights and gathers while you are away.</p>' +
        '<div class="ck-actions"><a class="ck-btn is-primary" href="/login">Sign in at the hub</a>' +
        '<a class="ck-btn" href="/home">Back to the hub</a></div>' +
        '<p class="ck-muted">Your chronicle is saved to your account. Sign in, then come back to /chronicles.</p>' +
      '</section>';
  }

  function renderError(message) {
    setScreen('gate');
    main.innerHTML = '<section class="ck-hero"><h1>The road is closed.</h1><p>' + esc(message) + '</p>' +
      '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="reload">Try again</button></div></section>';
  }

  function renderOath(data) {
    setScreen('oath');
    $('ckKnightName').textContent = 'Take the oath';
    var starters = data.starters || [];
    if (!state.oathPick && starters.length) state.oathPick = starters[0].speciesId;
    var picked = find(starters, 'speciesId', state.oathPick);
    if (picked) setBackdrop(scene(picked.element, 'journey'));
    main.innerHTML =
      '<section class="ck-oath">' +
        '<h1>The Siegeknight\'s Oath</h1>' +
        '<p>You begin as a Siege Squire with a plain sword and one companion. The Siegeknight unlocks possibilities. ' +
        'The Siegelings make them achievable.</p>' +
        '<label class="ck-field"><span>Your knight\'s name</span>' +
          '<input id="ckOathName" maxlength="20" autocomplete="off" value="' + esc(data.suggestedName || '') + '"></label>' +
        '<h2>Choose your first companion</h2>' +
        '<div class="ck-starters">' + starters.map(function (s) {
          return '<button type="button" class="ck-starter' + (s.speciesId === state.oathPick ? ' is-picked' : '') +
            '" data-act="oath-pick" data-id="' + esc(s.speciesId) + '" data-el="' + esc(s.element) + '" style="--el:var(--' + elKey(s.element) + ')">' +
            portrait(s, 320) +
            '<span class="ck-starter-name">' + esc(s.species) + '</span>' +
            '<span class="ck-chips">' + elChip(s.element, s.elementLabel) + chip((CLASS_EMOJI[s.class] || '') + ' ' + s.class) + '</span>' +
            '<span class="ck-starter-line">' + esc(s.identity) + '</span>' +
            '<span class="ck-starter-line ck-muted">Bond 50: ' + esc(s.bondTechnique) + '</span>' +
          '</button>';
        }).join('') + '</div>' +
        '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="oath">Take the oath</button></div>' +
      '</section>';
  }

  // ── main render ──────────────────────────────────────────────────────────

  function render() {
    var s = state.snap;
    setScreen('main');
    $('ckKnightName').textContent = 'Sir ' + s.knight.name;
    var lead = partner(s);
    $('ckAvatar').innerHTML = lead ? portrait(lead, 120) : '';
    $('ckCrownsNum').textContent = s.knight.crowns;
    $('ckRankNum').textContent = s.knight.rank;
    $('ckRankTitle').textContent = s.knight.rankTitle;
    $('ckRankBar').style.width = pct(s.knight.xpInto, s.knight.xpSpan) + '%';
    var badge = $('ckWildsBadge');
    badge.hidden = !(s.sightings && s.sightings.length);
    badge.textContent = s.sightings ? s.sightings.length : '';
    Array.prototype.forEach.call(document.querySelectorAll('#ckTabs button'), function (b) {
      b.classList.toggle('is-on', b.dataset.tab === state.tab);
      b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false');
    });
    renderStatus();
    var scroll = main.scrollTop;
    var view = { knight: viewKnight, company: viewCompany, work: viewWork, expedition: viewExpedition, wilds: viewWilds,
      base: viewBase, realm: viewRealm }[state.tab] || viewWork;
    main.innerHTML = view(s);
    main.dataset.tab = state.tab;
    setBackdrop(tabScene(s));
    main.scrollTop = scroll;
    tick();
  }

  function renderStatus() {
    var s = state.snap;
    var parts = [];
    if (s.activity) {
      parts.push('<button type="button" class="ck-stat" data-act="work-skill" data-id="' + esc(activeSkillId(s)) + '"><span class="ck-dot is-on"></span>' +
        '<span>' + esc(s.activity.name) + '</span><span class="ck-bar is-thin"><i data-live="activity"></i></span></button>');
    } else {
      parts.push('<button type="button" class="ck-stat" data-act="tab" data-tab="work"><span class="ck-dot"></span><span>Knight resting</span></button>');
    }
    if (s.expedition) {
      parts.push('<button type="button" class="ck-stat" data-act="tab" data-tab="expedition"><span class="ck-dot ' +
        (s.expedition.done ? 'is-ready' : 'is-on') + '"></span><span>' + esc(s.expedition.route) + '</span>' +
        '<b data-live="exp-left">' + (s.expedition.done ? 'Home!' : '') + '</b></button>');
    } else {
      parts.push('<button type="button" class="ck-stat" data-act="tab" data-tab="expedition"><span class="ck-dot"></span><span>Company at home</span></button>');
    }
    $('ckStatus').innerHTML = parts.join('');
  }

  // Knight ─────────────────────────────────────────────────────────────────

  function viewKnight(s) {
    var eq = s.equipment;
    var GEAR_KINDS = { WEAPON: 1, ARMOR: 1, RELIC: 1, HELMET: 1, BOOTS: 1, ACCESSORY: 1 };
    var gear = s.inventory.filter(function (i) { return GEAR_KINDS[i.kind]; });
    var bag = s.inventory.filter(function (i) { return !GEAR_KINDS[i.kind]; });
    var worn = ['weapon', 'armor', 'relic', 'helmet', 'boots', 'accessory'].map(function (k) { return eq[k] && eq[k].id; });
    var lead = partner(s);
    var groups = {};
    s.skills.forEach(function (k) { (groups[k.group] = groups[k.group] || []).push(k); });
    var GROUP_EMOJI = { Gathering: '🌿', Production: '⚒️', Siegeling: '🐾', Expedition: '🧭', Knowledge: '📚' };
    return hero({
        cls: 'is-knight', scene: namedScene('light-shelter'),
        kicker: 'Rank ' + esc(s.knight.rank) + ' · ' + esc(s.knight.rankTitle),
        title: 'Sir ' + esc(s.knight.name),
        art: lead ? portrait(lead, 320, 'is-hero') : '',
        body: bar(s.knight.xpInto, s.knight.xpSpan, 'is-fat') +
          (s.knight.titles && s.knight.titles.length ? '<p class="ck-banner-line is-gold">' + esc(s.knight.titles.join(' · ')) + '</p>' : '') +
          '<div class="ck-bubbles">' +
            '<span class="ck-bubble">🗺️ <b>' + esc(s.knight.expeditionsCompleted) + '</b> trips</span>' +
            '<span class="ck-bubble">🪢 <b>' + esc(s.knight.tamed) + '</b> tamed</span>' +
            '<span class="ck-bubble">👑 <b>' + esc(s.knight.crowns) + '</b></span>' +
          '</div>'
      }) +
      '<section class="ck-card"><h3>🛡️ Equipment</h3><div class="ck-gear">' +
        gearSlot('Weapon', eq.weapon, 'WEAPON') + gearSlot('Armor', eq.armor, 'ARMOR') + gearSlot('Relic', eq.relic, 'RELIC') +
        gearSlot('Helmet', eq.helmet, 'HELMET') + gearSlot('Boots', eq.boots, 'BOOTS') + gearSlot('Accessory', eq.accessory, 'ACCESSORY') +
      '</div>' + (gear.length ? '<h4>Gear bag · tap to wear</h4><div class="ck-tiles is-gear">' + gear.map(function (g) {
        var on = worn.indexOf(g.id) >= 0;
        return '<button type="button" class="ck-tile' + (on ? ' is-on' : '') + '" data-act="equip" data-id="' + esc(g.id) + '" title="' + esc(g.blurb) + '">' +
          itemIcon(g.id, g.kind) + '<b>' + esc(g.name) + '</b>' + (on ? '<span class="ck-tile-tag">Worn</span>' : '') + '</button>';
      }).join('') + '</div>' : '') + '</section>' +
      ['Gathering', 'Production', 'Siegeling', 'Expedition', 'Knowledge'].map(function (g) {
        if (!groups[g]) return '';
        return '<section class="ck-card"><h3>' + GROUP_EMOJI[g] + ' ' + esc(g === 'Production' ? 'Crafting' : g) + '</h3>' +
          '<div class="ck-tiles is-skills">' + groups[g].map(skillTile).join('') + '</div></section>';
      }).join('') +
      '<section class="ck-card"><h3>✨ Elemental Affinity</h3>' +
        '<div class="ck-tiles is-elements">' + s.affinities.map(affinityRow).join('') + '</div>' +
        '<p class="ck-hint">Battles, journeys and studies raise each element. Affinity 10 teaches a technique.</p></section>' +
      '<section class="ck-card"><h3>⚔️ Class Mastery</h3><div class="ck-tiles is-classes">' + s.masteries.map(function (m) {
          var hue = CLASS_HUE[m.class] || 'neutral';
          return '<div class="ck-tile is-stat" style="--el:var(--' + hue + ')">' + emojiIcon(CLASS_EMOJI[m.class] || '⭐', hue) +
            '<b>' + esc(m.class) + '</b><span class="ck-tile-lv">Lv ' + esc(m.level) + '</span>' + bar(m.xpInto, m.xpSpan, 'is-el') +
            '<span class="ck-tile-sub">+' + esc(m.bonusPct) + '% · ' + esc(m.path) + '</span></div>';
        }).join('') + '</div>' +
        '<details class="ck-more"><summary>Cross-class techniques · ' + s.crossClass.filter(function (c) { return c.unlocked; }).length + '/' + s.crossClass.length + '</summary>' +
        '<ul class="ck-cross">' + s.crossClass.map(function (c) {
          return '<li class="' + (c.unlocked ? 'is-on' : '') + '"><b>' + esc(c.name) + '</b> <span class="ck-small">' +
            esc(c.classes.join(' + ')) + ' ' + esc(c.needs) + '</span><span class="ck-small ck-muted">' + esc(c.text) + '</span></li>';
        }).join('') + '</ul></details>' +
        '<details class="ck-more"><summary>Elemental convergence · ' + s.combos.filter(function (c) { return c.unlocked; }).length + '/' + s.combos.length + '</summary>' +
        '<ul class="ck-cross">' + s.combos.map(function (c) {
          return '<li class="' + (c.unlocked ? 'is-on' : '') + '"><b>' + esc(c.name) + '</b> <span class="ck-small">' +
            esc(c.labels.join(' + ')) + ' ' + esc(c.needs) + '</span><span class="ck-small ck-muted">' + esc(c.text) + '</span></li>';
        }).join('') + '</ul></details></section>' +
      '<section class="ck-card"><h3>🏹 Weapon Disciplines</h3><div class="ck-tiles is-classes">' + s.weapons.map(function (w) {
        return '<div class="ck-tile is-stat' + (w.equipped ? ' is-on' : '') + '" style="--el:var(--metal)" title="' + esc(w.command + ': ' + w.commandText) + '">' +
          emojiIcon(WEAPON_EMOJI[w.id] || '⚔️', 'metal') + '<b>' + esc(w.name) + '</b><span class="ck-tile-lv">Lv ' + esc(w.level) + '</span>' +
          bar(w.xpInto, w.xpSpan) + '<span class="ck-tile-sub">' + esc(w.specialty) + '</span></div>';
      }).join('') + '</div></section>' +
      '<section class="ck-card"><h3>🎒 Bag</h3>' + (bag.length ? '<div class="ck-bank">' + bag.map(function (i) {
        return '<button type="button" class="ck-bank-slot" data-act="item" data-id="' + esc(i.id) + '" title="' + esc(i.name) + '">' +
          itemIcon(i.id, i.kind) + '<span class="ck-bank-qty">' + esc(i.qty) + '</span><span class="ck-bank-name">' + esc(i.name) + '</span></button>';
      }).join('') + '</div>' : '<p class="ck-muted">Empty. Set your knight to work.</p>') + '</section>';
  }

  function gearSlot(label, item, kind) {
    return '<div class="ck-gear-slot' + (item ? ' is-on' : '') + '">' + (item ? itemIcon(item.id, item.kind || kind) : emojiIcon('➕', 'neutral', 'is-empty')) +
      '<span class="ck-gear-text"><span class="ck-kicker">' + esc(label) + '</span><b>' + esc(item ? item.name : 'Empty') + '</b>' +
      '<span class="ck-small">' + esc(item ? item.blurb : 'Craft one in Work.') + '</span></span></div>';
  }

  function skillTile(k) {
    var look = skillLook(k.id);
    var maxed = k.level >= MAX_SKILL_LEVEL;
    return '<button type="button" class="ck-tile is-skill' + (k.unlocked ? '' : ' is-locked') + '" data-act="skill" data-id="' + esc(k.id) +
      '" style="--el:var(--' + look[1] + ')">' + emojiIcon(SKILL_EMOJI[k.id] || look[0], look[1]) +
      '<b>' + esc(shortSkill(k.name)) + '</b><span class="ck-tile-lv">' + (k.unlocked ? 'Lv ' + esc(k.level) : 'Locked') + '</span>' +
      (k.unlocked ? (maxed ? bar(1, 1, 'is-max') : bar(k.xpInto, k.xpSpan, 'is-el')) : '') + '</button>';
  }

  function skillRow(k) {
    return '<div class="ck-skill' + (k.unlocked ? '' : ' is-locked') + '">' +
      '<div class="ck-row"><b>' + esc(k.name) + '</b><span>' + (k.unlocked ? 'Lv ' + esc(k.level) : 'Locked') + '</span></div>' +
      (k.unlocked ? bar(k.xpInto, k.xpSpan) : '<span class="ck-small">Needs ' + esc(k.unlockText.join(', ')) + '</span>') +
      '<span class="ck-small ck-muted">' + esc(k.blurb) + '</span>' +
      (k.unlocked && k.effect ? '<span class="ck-small is-ready">' + esc(k.effect) + '</span>' : '') +
      (k.leadsTo.length ? '<span class="ck-small">Unlocks ' + esc(k.leadsTo.join(', ')) + '</span>' : '') +
    '</div>';
  }

  // Professions with a Work page open it; the rest explain themselves in a card.
  function showSkill(id) {
    var s = state.snap;
    var pages = workPages(s);
    if (find(pages.gather, 'id', id) || find(pages.craft, 'id', id)) { openWorkSkill(id); return; }
    var k = find(s.skills, 'id', id);
    if (!k) return;
    var look = skillLook(id);
    openModal('skill', '<h2 id="ckModalTitle">' + emojiIcon(SKILL_EMOJI[id] || look[0], look[1], 'is-sm') + ' ' + esc(k.name) + '</h2>' +
      skillRow(k) + '<div class="ck-actions"><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>');
  }

  function showItem(id) {
    var i = find(state.snap.inventory, 'id', id);
    if (!i) return;
    openModal('item', '<div class="ck-item-card">' + itemIcon(i.id, i.kind, 'is-xl') + '<div><h2 id="ckModalTitle">' + esc(i.name) + '</h2>' +
      '<p class="ck-muted">' + esc(i.kind.charAt(0) + i.kind.slice(1).toLowerCase()) + ' · ' + esc(i.qty) + ' in your bag</p>' +
      '<p>' + esc(i.blurb) + '</p></div></div>' +
      '<div class="ck-actions"><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>');
  }

  function affinityRow(a) {
    return '<button type="button" class="ck-tile is-element' + (a.studied ? '' : ' is-dim') + '" data-act="affinity" data-id="' + esc(a.element) +
      '" style="--el:var(--' + elKey(a.element) + ')">' +
      '<span class="ck-ico is-art">' + elementIcon(a.element, 30) + '</span>' +
      '<b>' + esc(a.label) + '</b><span class="ck-tile-lv">Lv ' + esc(a.level) + '</span>' +
      bar(a.xpInto, a.xpSpan, 'is-el') +
      (a.technique.unlocked ? '<span class="ck-tile-tag">★</span>' : '') + '</button>';
  }

  function showAffinity(el) {
    var a = find(state.snap.affinities, 'element', el);
    if (!a) return;
    var combos = state.snap.combos.filter(function (c) { return c.elements.indexOf(el) >= 0; });
    openModal('affinity',
      '<h2 id="ckModalTitle">' + elementIcon(a.element, 22) + ' ' + esc(a.label) + ' Affinity · ' + esc(a.level) + '</h2>' +
      '<p class="ck-muted">' + esc(a.milestone) + '. Grows with every battle a ' + esc(a.label) +
      ' Siegeling fights, every trip into its lands, studies of its essence, and taming.</p>' +
      bar(a.xpInto, a.xpSpan, 'is-el') +
      '<ol class="ck-ladder" style="--el:var(--' + elKey(a.element) + ')">' + a.milestones.map(function (m) {
        return '<li class="' + (m.unlocked ? 'is-on' : '') + '"><b>' + esc(m.level) + ' · ' + esc(m.name) + '</b><span>' + esc(m.text) + '</span></li>';
      }).join('') + '</ol>' +
      (combos.length ? '<h3>Combinations</h3><ul class="ck-cross">' + combos.map(function (c) {
        return '<li class="' + (c.unlocked ? 'is-on' : '') + '"><b>' + esc(c.name) + '</b> <span class="ck-small">' + esc(c.labels.join(' + ')) +
          ' ' + esc(c.needs) + '</span><span class="ck-small ck-muted">' + esc(c.text) + '</span></li>';
      }).join('') + '</ul>' : '') +
      '<div class="ck-actions"><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>');
  }

  // Base ───────────────────────────────────────────────────────────────────

  function viewBase(s) {
    var b = s.base;
    return hero({
        cls: 'is-road', scene: namedScene('relic-shelter'), kicker: 'Home base', title: 'Your Base',
        body: '<p class="ck-banner-line">Each building draws on several professions. Higher levels also need Siegeknight rank.</p>'
      }) +
      '<div class="ck-buildings">' + b.buildings.map(function (x) {
        var stars = '';
        for (var i = 1; i <= x.maxLevel; i++) stars += '<i class="' + (i <= x.level ? 'is-on' : '') + '">★</i>';
        var next = x.level < x.maxLevel
          ? '<p class="ck-small"><b>Level ' + (x.level + 1) + ':</b> ' + esc(x.nextEffect) + '</p>' +
            '<div class="ck-costs">' + x.cost.map(function (c) {
              return '<span class="ck-cost' + (c.have >= c.qty ? '' : ' is-short') + '" title="' + esc(c.name) + '">' + itemIcon(c.id, c.kind, 'is-xs') +
                esc(c.have) + '/' + esc(c.qty) + '</span>';
            }).join('') + '<span class="ck-cost' + (s.knight.rank < x.rankReq ? ' is-short' : '') + '">🎖️ Rank ' + esc(x.rankReq) + '</span></div>' +
            '<div class="ck-actions"><button type="button" class="ck-btn is-sm' + (x.ready ? ' is-primary' : '') + '" data-act="build" data-id="' +
              esc(x.id) + '"' + (x.ready ? '' : ' disabled') + '>' + (x.level ? '⬆️ Upgrade' : '🔨 Build') + '</button></div>'
          : '<p class="ck-small is-ready">🏆 Complete.</p>';
        var extra = '';
        if (x.id === 'war_room' && b.loadouts.length) {
          extra = '<h4>Loadouts</h4><div class="ck-loadouts">' + b.loadouts.map(function (l) {
            return '<div class="ck-loadout"><div><b>' + esc(l.saved ? l.name : 'Empty slot ' + (l.slot + 1)) + '</b>' +
              (l.saved ? '<span class="ck-small ck-muted">' + esc(l.party.join(', ')) + ' · ' + esc(l.weapon) + '</span>' : '') + '</div>' +
              '<span class="ck-pills">' +
                (l.saved ? '<button type="button" class="ck-pill" data-act="loadout-apply" data-slot="' + l.slot + '"' + (s.expedition ? ' disabled' : '') + '>Use</button>' : '') +
                '<button type="button" class="ck-pill" data-act="loadout-save" data-slot="' + l.slot + '">' + (l.saved ? 'Overwrite' : 'Save current') + '</button>' +
              '</span></div>';
          }).join('') + '</div>';
        }
        return '<section class="ck-building' + (x.level ? '' : ' is-unbuilt') + '">' +
          '<div class="ck-building-art"><img src="' + esc(namedScene(BUILDING_SCENES[x.id] || 'earth-shelter')) + '" alt="" loading="lazy" decoding="async">' +
            '<span class="ck-building-name"><b>' + esc(x.name) + '</b><span class="ck-stars">' + stars + '</span></span></div>' +
          '<div class="ck-building-body"><p class="ck-small ck-muted">' + esc(x.blurb) + '</p>' +
          '<p class="ck-small' + (x.level ? ' is-ready' : ' ck-muted') + '">' + esc(x.effect) + '</p>' + next + extra + '</div></section>';
      }).join('') + '</div>' +
      '<section class="ck-card ck-keep"><h3>🏰 My Keep</h3><p class="ck-hint">Your Keep is your stronghold beyond the expedition road. ' +
        'Its rooms and residents live in My Keep.</p><a class="ck-btn is-glass" href="/keep">Visit your Keep</a></section>';
  }

  // Realm ──────────────────────────────────────────────────────────────────

  function loadRealm() {
    return Promise.all([api('/api/chronicles/guild'), api('/api/chronicles/market')]).then(function (res) {
      state.guild = res[0].error ? null : res[0];
      state.market = res[1].error ? null : res[1];
      state.realmError = res[0].error || res[1].error || '';
      ((state.market && state.market.events) || []).forEach(function (e) { toast(e, 'good'); });
      if (state.tab === 'realm') render();
    });
  }

  function realmAct(path, body) {
    return act(path, body, function () { loadRealm(); });
  }

  function viewRealm(s) {
    var head = hero({
      cls: 'is-road', scene: namedScene('metal-boss'), kicker: 'Guilds &amp; the marketplace', title: 'The Realm',
      art: '<span class="ck-crowns" title="Crowns"><span aria-hidden="true">\uD83D\uDC51</span><b>' + esc(s.knight.crowns) + '</b></span>',
      body: '<p class="ck-banner-line">Crowns are earned in battle and spent at the marketplace, apart from Siegecoins.</p>'
    });
    if (!state.guild && !state.market) {
      return head + '<section class="ck-card"><p class="ck-muted">' + esc(state.realmError || 'Gathering news from the realm…') + '</p></section>';
    }
    return head + guildSection(s) + marketSection(s);
  }

  function guildSection(s) {
    var v = state.guild;
    if (!v) return '<section class="ck-card"><h3>Guild</h3><p class="ck-muted">The guild hall is unreachable right now.</p></section>';
    if (!v.guild) {
      return '<section class="ck-card"><h3>Guild</h3>' + (v.notice ? '<p class="ck-warn">' + esc(v.notice) + '</p>' : '') +
        '<p class="ck-muted">Siegeknights join forces in guilds to break a great threat each week.</p>' +
        '<label class="ck-field"><span>Join with a code</span><input id="ckGuildCode" maxlength="6" autocomplete="off" placeholder="ABC123"></label>' +
        '<div class="ck-actions"><button type="button" class="ck-btn" data-act="guild-join">Join guild</button></div>' +
        '<label class="ck-field"><span>Or found your own</span><input id="ckGuildName" maxlength="24" autocomplete="off" placeholder="Guild name"></label>' +
        '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="guild-create"' + (v.canFound ? '' : ' disabled') + '>Found a guild</button>' +
        (v.canFound ? '' : '<span class="ck-small ck-muted">Needs Siegeknight Rank ' + esc(v.rankNeeded) + '</span>') + '</div></section>';
    }
    var g = v.guild;
    var op = g.operation;
    var busy = Boolean(s.expedition);
    return '<section class="ck-card"><div class="ck-row"><h3>\uD83D\uDEA9 ' + esc(g.name) + '</h3><span class="ck-chip">Code ' + esc(g.code) + '</span></div>' +
        '<p class="ck-small ck-muted">' + esc(g.members.length) + '/' + esc(g.maxMembers) + ' knights · led by ' + esc(g.leader) + '</p>' +
        '<ul class="ck-members">' + g.members.map(function (m) {
          return '<li class="' + (m.you ? 'is-you' : '') + '"><span>' + esc(m.name) + ' <span class="ck-small ck-muted">Rank ' + esc(m.rank) + '</span></span><b>' + esc(m.contribution) + '</b></li>';
        }).join('') + '</ul></section>' +
      '<section class="ck-card ck-operation" style="--el:var(--' + elKey(op.element) + ')">' +
        '<div class="ck-operation-art"><img src="' + esc(scene(op.element, 'boss')) + '" alt="" loading="lazy" decoding="async">' +
          '<span class="ck-banner-shade" aria-hidden="true"></span>' +
          '<p class="ck-banner-kicker">\u2694\uFE0F Siege Operation · ' + esc(op.week) + '</p>' +
          '<h2 class="ck-banner-title">' + elementIcon(op.element, 26) + ' ' + esc(op.threat) + '</h2></div>' +
        '<p class="ck-small">' + esc(op.blurb) + '</p>' +
        '<span class="ck-bar is-fat is-el is-threat"><i style="width:' + pct(op.damage, op.maxHp) + '%"></i></span>' +
        '<p class="ck-small">' + esc(op.damage) + ' / ' + esc(op.maxHp) + ' broken · your companies: ' + esc(op.yours) + '</p>' +
        (op.won
          ? '<p class="ck-good">The threat is broken!</p>' + (op.canClaim ? '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="guild-claim">Claim your share</button></div>' : '')
          : '<div class="ck-fronts">' + v.fronts.map(function (f) {
              return '<div class="ck-front"><b>' + ({ assault: '\u2694\uFE0F', supply: '\uD83D\uDCE6', scouting: '\uD83D\uDD2D' }[f.id] || '\uD83D\uDEA9') + ' ' + esc(f.name) + '</b>' +
                '<span class="ck-small">' + esc(f.text) + '</span>' +
                '<button type="button" class="ck-btn is-sm is-primary" data-act="operation" data-id="' + esc(f.id) + '"' + (busy ? ' disabled' : '') + '>Send company</button></div>';
            }).join('') + '</div>' +
            '<p class="ck-small ck-muted">Sorties take ' + esc(60) + ' minutes and meet your company at level ' + esc(op.companyLevel) + '.' +
            (busy ? ' Your company is already on the road.' : '') + '</p>') +
        '<h4>Siege defenses · level ' + esc(g.defenseLevel) + '</h4>' +
        '<p class="ck-small">' + esc(g.defensePoints) + (g.nextDefenseAt ? ' / ' + esc(g.nextDefenseAt) + ' points to the next level' : ' points: complete') +
          '. Each level adds 10% to every sortie.</p>' +
        '<div class="ck-donate"><select id="ckDonateItem">' + v.donations.map(function (d) {
          return '<option value="' + esc(d.id) + '"' + (d.have ? '' : ' disabled') + '>' + esc(d.name) + ' (' + esc(d.have) + ') · ' + esc(d.points) + ' pts</option>';
        }).join('') + '</select><input id="ckDonateQty" type="number" min="1" value="1" inputmode="numeric">' +
        '<button type="button" class="ck-btn is-sm" data-act="guild-donate">Donate</button></div>' +
        '<div class="ck-actions"><button type="button" class="ck-link" data-act="guild-leave">Leave guild</button></div></section>';
  }

  function marketSection(s) {
    var m = state.market;
    if (!m) return '<section class="ck-card"><h3>Marketplace</h3><p class="ck-muted">The marketplace is closed right now.</p></section>';
    var others = m.listings.filter(function (l) { return !l.mine; });
    return '<section class="ck-card"><h3>\uD83D\uDED2 Marketplace</h3><p class="ck-small ck-muted">Trade materials, consumables and gear. ' +
        'Siegelings are never for sale. Sellers pay a ' + Math.round(m.fee * 100) + '% fee.</p>' +
        (others.length ? '<div class="ck-listings">' + others.map(function (l) {
          return '<div class="ck-listing">' + itemIcon(l.item.id, l.item.kind, 'is-sm') + '<div><b>' + esc(l.item.qty) + '× ' + esc(l.item.name) + '</b><span class="ck-small ck-muted">' + esc(l.seller) + '</span></div>' +
            '<button type="button" class="ck-btn is-sm' + (l.affordable ? ' is-primary' : '') + '" data-act="market-buy" data-id="' + esc(l.id) + '"' +
            (l.affordable ? '' : ' disabled') + '>\uD83D\uDC51 ' + esc(l.price) + '</button></div>';
        }).join('') + '</div>' : '<p class="ck-small ck-muted">Nothing for sale right now.</p>') +
        '<h4>Sell</h4>' + (m.sellable.length ? '<div class="ck-sell"><select id="ckSellItem">' + m.sellable.map(function (i) {
          return '<option value="' + esc(i.id) + '">' + esc(i.name) + ' (' + esc(i.qty) + ')</option>';
        }).join('') + '</select><input id="ckSellQty" type="number" min="1" value="1" inputmode="numeric" aria-label="Quantity">' +
        '<input id="ckSellPrice" type="number" min="1" value="10" inputmode="numeric" aria-label="Price in crowns">' +
        '<button type="button" class="ck-btn is-sm" data-act="market-list">List</button></div>' : '<p class="ck-small ck-muted">Nothing to sell yet.</p>') +
        (m.mine.length ? '<h4>Your listings</h4><div class="ck-listings">' + m.mine.map(function (l) {
          return '<div class="ck-listing">' + itemIcon(l.item.id, l.item.kind, 'is-sm') + '<div><b>' + esc(l.item.qty) + '× ' + esc(l.item.name) + '</b><span class="ck-small ck-muted">\uD83D\uDC51 ' + esc(l.price) + ' · ' + esc(l.status) + '</span></div>' +
            (l.status === 'open' ? '<button type="button" class="ck-btn is-sm" data-act="market-cancel" data-id="' + esc(l.id) + '">Cancel</button>' : '') + '</div>';
        }).join('') + '</div>' : '') + '</section>';
  }

  // Company ────────────────────────────────────────────────────────────────

  function viewCompany(s) {
    var p = s.party;
    var away = Boolean(s.expedition);
    var lead = partner(s);
    var slots = p.positions.map(function (pos, i) {
      var id = p.members[i] || '';
      var c = id ? companion(id) : null;
      var locked = i >= p.slots;
      var need = i === 1 ? 3 : 10;
      var label = pos.charAt(0) + pos.slice(1).toLowerCase();
      return '<div class="ck-stage-slot' + (locked ? ' is-locked' : c ? '' : ' is-empty') + '"' + (c ? ' style="--el:var(--' + elKey(c.element) + ')"' : '') + '>' +
        '<span class="ck-stage-pos">' + esc(label) + '</span>' +
        (locked ? '<span class="ck-stage-ring">🔒</span><span class="ck-stage-name">Command ' + need + '</span>' :
          c ? '<button type="button" class="ck-stage-ring" data-act="comp-toggle" data-id="' + esc(c.id) + '" aria-label="' + esc(c.nickname) + '">' + portrait(c, 240) + '</button>' +
            '<span class="ck-stage-name">' + esc(c.nickname) + '</span><span class="ck-stage-sub">' + esc(CLASS_EMOJI[c.class] || '') + ' Lv ' + esc(c.level) + '</span>' +
            (away ? '' : '<button type="button" class="ck-stage-x" data-act="party-clear" data-slot="' + i + '" aria-label="Remove ' + esc(c.nickname) + '">&times;</button>')
          : '<span class="ck-stage-ring">➕</span><span class="ck-stage-name">Empty</span>') +
      '</div>';
    }).join('');
    var reserve = p.reserveUnlocked ? (p.reserveId ? companion(p.reserveId) : null) : null;
    return hero({
        cls: 'is-stage', scene: scene(lead ? lead.element : 'EARTH', 'journey'),
        kicker: away ? 'On the road · changes wait until they return' : 'Your expedition company',
        title: 'The Company', foot: '<div class="ck-stage">' + slots + '</div>'
      }) +
      '<section class="ck-card is-tight">' +
        (p.synergies.length ? '<div class="ck-synergies">' + p.synergies.map(function (sy) {
          return '<span class="ck-chip is-syn" title="' + esc(sy.text) + '">✨ <b>' + esc(sy.label) + '</b> ' + esc(sy.text) + '</span>';
        }).join('') + '</div>' : '<p class="ck-hint">Two of one element or class make a synergy. Three make it stronger.</p>') +
        (p.crossClass.length ? '<p class="ck-small is-ready">' + p.crossClass.map(function (c) { return esc(c.name); }).join(', ') + ' active.</p>' : '') +
        '<p class="ck-hint">' + (p.reserveUnlocked ? 'Reserve: ' + esc(reserve ? reserve.nickname : 'none') + ', who steps in once if someone falls.' :
          'A reserve slot opens at Command ' + esc(p.reserveCommandLevel) + '.') + (p.nextSlotAt ? ' Next slot at Command ' + esc(p.nextSlotAt) + '.' : '') + '</p>' +
      '</section>' +
      '<div class="ck-section-head"><h3>🐾 Sanctuary</h3><span class="ck-count">' + esc(s.companions.length) + '/' + esc(s.rosterCap) + '</span></div>' +
      '<div class="ck-roster">' + s.companions.map(function (c) { return companionCard(s, c, away); }).join('') + '</div>';
  }

  function companionCard(s, c, away) {
    var open = state.openCompanion === c.id;
    var p = s.party;
    var inParty = p.members.indexOf(c.id) >= 0;
    var foods = s.inventory.filter(function (i) { return i.kind === 'FOOD'; });
    var evo = c.evolution;
    var body = '';
    if (open) {
      var slotButtons = '';
      if (!away && !inParty) {
        for (var i = 0; i < p.slots; i++) {
          slotButtons += '<button type="button" class="ck-pill" data-act="party-set" data-slot="' + i + '" data-id="' + esc(c.id) + '">' +
            esc(p.positions[i].charAt(0) + p.positions[i].slice(1).toLowerCase()) + '</button>';
        }
        if (p.reserveUnlocked && p.reserveId !== c.id) {
          slotButtons += '<button type="button" class="ck-pill" data-act="party-reserve" data-id="' + esc(c.id) + '">Reserve</button>';
        }
      }
      body = '<div class="ck-comp-body">' +
        '<div class="ck-stats"><span>HP <b>' + esc(c.stats.health) + '</b></span><span>ATK <b>' + esc(c.stats.attack) + '</b></span>' +
          '<span>DEF <b>' + esc(c.stats.defense) + '</b></span><span>SPD <b>' + esc(c.stats.speed) + '</b></span></div>' +
        '<p class="ck-small">Behaviour: ' + esc(c.behavior) + ' · ' + esc(c.expeditions) + ' expeditions · ' + esc(c.battlesWon) + ' battles won</p>' +
        '<p class="ck-small' + (c.bondTechnique.unlocked ? ' is-ready' : '') + '"><b>Bond 50 · ' + esc(c.bondTechnique.name) + ':</b> ' +
          esc(c.bondTechnique.text) + '</p>' +
        (slotButtons ? '<div class="ck-pills"><span class="ck-small">Place in company:</span>' + slotButtons + '</div>' : '') +
        (!c.onExpedition ? '<div class="ck-pills">' + (c.helping
          ? '<button type="button" class="ck-pill" data-act="helper" data-id="">Stop helping</button>'
          : '<button type="button" class="ck-pill" data-act="helper" data-id="' + esc(c.id) + '">Help the knight\'s work</button>') + '</div>' : '') +
        (!c.onExpedition && foods.length ? '<div class="ck-pills"><span class="ck-small">Treat (' + esc(c.treatsLeft) + ' left today):</span>' +
          foods.map(function (f) {
            var loves = (f.prefers || []).indexOf(c.elementLabel) >= 0;
            return '<button type="button" class="ck-pill' + (loves ? ' is-love' : '') + '" data-act="feed" data-id="' + esc(c.id) + '" data-food="' + esc(f.id) + '"' +
              (c.treatsLeft <= 0 ? ' disabled' : '') + '>' + esc(f.name) + ' ×' + esc(f.qty) + (loves ? ' ♥' : '') + '</button>';
          }).join('') + '</div>' : '') +
        (evo ? '<div class="ck-evo"><b>Evolves into ' + esc(evo.to) + '</b>' + (evo.toClass !== c.class ? ' <span class="ck-small">(becomes ' + esc(evo.toClass) + ')</span>' : '') +
          '<span class="ck-small">Needs level ' + esc(evo.level) + ' · ' + evo.cost.map(function (x) {
            return esc(x.qty) + ' ' + esc(x.name) + ' (' + esc(x.have) + ')';
          }).join(', ') + '</span>' +
          '<button type="button" class="ck-btn is-sm' + (evo.ready ? ' is-primary' : '') + '" data-act="evolve" data-id="' + esc(c.id) + '"' + (evo.ready ? '' : ' disabled') + '>Evolve</button></div>' : '') +
        (c.trialReady ? '<div class="ck-trial"><b>Knightbound.</b> <span class="ck-small">Face the Legendary Bond Trial alone: two fights against its own echo, ' +
          'then the strongest of its element. Passing makes it a Legend: an aura, +5% to every stat, and one more use of its bond technique.</span>' +
          '<button type="button" class="ck-btn is-sm is-primary" data-act="trial" data-id="' + esc(c.id) + '">Begin the trial</button></div>' : '') +
        '<div class="ck-pills"><button type="button" class="ck-link" data-act="rename" data-id="' + esc(c.id) + '">Rename</button></div>' +
      '</div>';
    }
    var bondHearts = Math.max(0, Math.min(5, Math.floor(c.bond / 20)));
    var hearts = '';
    for (var h = 0; h < 5; h++) hearts += h < bondHearts ? '❤️' : '🤍';
    return '<article class="ck-comp' + (open ? ' is-open' : '') + (c.legend ? ' is-legend' : '') + '" style="--el:var(--' + elKey(c.element) + ')">' +
      '<button type="button" class="ck-comp-head" data-act="comp-toggle" data-id="' + esc(c.id) + '" aria-expanded="' + open + '">' +
        '<span class="ck-comp-art">' + portrait(c, 480, 'is-card') +
          '<span class="ck-comp-lv">Lv ' + esc(c.level) + '</span>' +
          '<span class="ck-comp-el">' + elementIcon(c.element, 22) + '</span>' +
          (c.onExpedition ? '<span class="ck-comp-flag">🧭 Away</span>' : c.helping ? '<span class="ck-comp-flag">⚒️ Helping</span>' :
            inParty ? '<span class="ck-comp-flag is-on">⚔️ Company</span>' : '') +
        '</span>' +
        '<span class="ck-comp-main"><span class="ck-comp-name">' + esc(c.nickname) + (c.legend ? ' <span class="ck-legend-star">★</span>' : '') + '</span>' +
          '<span class="ck-comp-sub">' + esc(CLASS_EMOJI[c.class] || '') + ' ' + esc(c.class) + (c.nickname !== c.species ? ' · ' + esc(c.species) : '') + '</span>' +
          (c.level >= c.levelCap ? bar(1, 1, 'is-max') : bar(c.xpInto, c.xpSpan)) +
          '<span class="ck-hearts" title="Bond ' + esc(c.bond) + ' · ' + esc(c.bondTitle) + '">' + hearts + '<small>' + esc(c.bond) + '</small></span>' +
          (c.level >= c.levelCap && c.evolution ? '<span class="ck-comp-ready">✨ Ready to evolve</span>' : '') +
        '</span>' +
      '</button>' + body + '</article>';
  }

  // Work ─────────────────────────────────────────────────────────────────
  // One page per profession, split by type (gathering or crafting), each a grid of
  // task cells that show their level, with the running task lit and its progress live.

  // Presentation only. The hues reuse the element palette rather than inventing one,
  // and U+FE0E keeps iOS from swapping the symbols for colour emoji.
  var SKILL_LOOK = {
    mining: ['⛏︎', 'earth'], woodcutting: ['♣︎', 'wind'], foraging: ['❀', 'poison'],
    fishing: ['≋', 'water'], excavation: ['⚱︎', 'metal'], smelting: ['▬', 'fire'],
    smithing: ['⚒︎', 'metal'], carpentry: ['▤', 'earth'], weaving: ['✂︎', 'psychic'],
    cooking: ['♨︎', 'fire'], alchemy: ['⚗︎', 'poison'], runecrafting: ['ᚱ', 'shadow'],
    elemental_studies: ['✷', 'light']
  };
  var MAX_SKILL_LEVEL = 100;

  function skillLook(id) { return SKILL_LOOK[id] || ['•', 'neutral']; }

  function shortSkill(name) { return String(name || '').replace(/^Elemental Studies$/, 'Studies'); }

  function workPages(s) {
    var gathers = {}, crafts = {};
    s.activities.forEach(function (x) { gathers[x.skillId] = 1; });
    s.recipes.forEach(function (r) { crafts[r.skillId] = 1; });
    return {
      gather: s.skills.filter(function (k) { return gathers[k.id]; }),
      craft: s.skills.filter(function (k) { return !gathers[k.id] && crafts[k.id]; })
    };
  }

  function activeSkillId(s) {
    var a = s.activity;
    if (!a) return '';
    var row = a.kind === 'craft' ? find(s.recipes, 'id', a.id) : find(s.activities, 'id', a.id);
    return row ? row.skillId : '';
  }

  function currentWorkSkill(s, pages) {
    var all = pages.gather.concat(pages.craft);
    if (find(all, 'id', state.workSkill)) return state.workSkill;
    return activeSkillId(s) || (all[0] ? all[0].id : '');
  }

  function viewWork(s) {
    // A visit opens on the running task so its lit cell is in view; the remembered page
    // only decides where an idle knight lands.
    if (!state.workSeeded) {
      state.workSeeded = true;
      if (activeSkillId(s)) state.workSkill = activeSkillId(s);
    }
    var pages = workPages(s);
    var skillId = currentWorkSkill(s, pages);
    var isCraft = Boolean(find(pages.craft, 'id', skillId));
    var group = isCraft ? pages.craft : pages.gather;
    var working = activeSkillId(s);
    var k = find(s.skills, 'id', skillId);
    return nowStrip(s, working) +
      '<div class="ck-worktype" role="tablist" aria-label="Task type">' +
        workTypeBtn('gather', 'Gathering', !isCraft, pages.gather, working) +
        workTypeBtn('craft', 'Crafting', isCraft, pages.craft, working) +
      '</div>' +
      '<div class="ck-skillbar" aria-label="Professions">' + group.map(function (g) {
        return skillTab(g, g.id === skillId, g.id === working);
      }).join('') + '</div>' +
      (k ? skillHead(k) : '') +
      (isCraft ? craftPage(s, skillId) : gatherPage(s, skillId));
  }

  function nowStrip(s, working) {
    var a = s.activity;
    if (!a) {
      return '<div class="ck-nowbar is-idle"><span class="ck-dot"></span><span class="ck-nowbar-text"><b>Your knight is resting.</b>' +
        '<span class="ck-small ck-muted">Tap a task to start. Work keeps running while you are away (up to 12h).</span></span></div>';
    }
    var detail = [a.skill, a.output + ' every ' + (Math.round(a.actionMs / 100) / 10) + 's'];
    if (a.left != null) detail.push(a.left + ' more possible');
    detail.push(a.helper ? a.helper + ' helping' : 'no helper yet');
    return '<div class="ck-nowbar">' +
      '<button type="button" class="ck-nowbar-main" data-act="work-skill" data-id="' + esc(working) + '">' +
        emojiIcon(SKILL_EMOJI[working] || '\u2728', skillLook(working)[1], 'is-sm is-spin') +
        '<span class="ck-nowbar-text"><b>' + esc(a.name) + '</b>' +
        '<span class="ck-small ck-muted">' + esc(detail.join(' · ')) + '</span></span>' +
        '<span class="ck-bar is-live"><i data-live="activity"></i></span></button>' +
      '<button type="button" class="ck-btn is-sm" data-act="activity-stop">Rest</button></div>';
  }

  function workTypeBtn(kind, label, on, list, working) {
    var busy = working && find(list, 'id', working);
    return '<button type="button" role="tab" aria-selected="' + on + '" class="ck-type' + (on ? ' is-on' : '') +
      '" data-act="work-type" data-id="' + kind + '">' + esc(label) + (busy ? '<span class="ck-dot is-on"></span>' : '') + '</button>';
  }

  function skillTab(k, on, busy) {
    var look = skillLook(k.id);
    return '<button type="button" class="ck-skilltab' + (on ? ' is-on' : '') + (k.unlocked ? '' : ' is-locked') +
      '" data-act="work-skill" data-id="' + esc(k.id) + '" style="--el:var(--' + look[1] + ')"' + (on ? ' aria-current="page"' : '') + '>' +
      emojiIcon(SKILL_EMOJI[k.id] || look[0], look[1], 'is-sm') +
      '<b>' + esc(shortSkill(k.name)) + '</b>' +
      '<span class="ck-skilltab-lv">' + (k.unlocked ? 'Lv ' + esc(k.level) : 'Locked') + '</span>' +
      (busy ? '<span class="ck-dot is-on" title="Working here"></span>' : '') +
    '</button>';
  }

  function skillHead(k) {
    var look = skillLook(k.id);
    var maxed = k.level >= MAX_SKILL_LEVEL;
    var group = k.group === 'Gathering' ? 'Gathering' : 'Crafting';
    return hero({
      cls: 'is-skill', el: look[1].toUpperCase(), scene: namedScene(PROFESSION_SCENES[k.id] || 'earth-journey'),
      kicker: esc(group) + (k.unlocked ? '' : ' · Locked'),
      title: '<span class="ck-banner-emoji" aria-hidden="true">' + (SKILL_EMOJI[k.id] || look[0]) + '</span>' + esc(k.name),
      art: '<span class="ck-level-orb' + (k.unlocked ? '' : ' is-locked') + '"><small>Level</small><b>' + (k.unlocked ? esc(k.level) : '&#128274;') + '</b></span>',
      body: (k.unlocked
        ? (maxed ? bar(1, 1, 'is-max is-fat') : bar(k.xpInto, k.xpSpan, 'is-fat')) +
          '<p class="ck-banner-line">' + (maxed ? 'Grandmaster!' : esc(k.xpInto) + ' / ' + esc(k.xpSpan) + ' XP to level ' + esc(k.level + 1)) + '</p>'
        : '<p class="ck-banner-line is-warn">Needs ' + esc(k.unlockText.join(', ')) + '</p>') +
        '<p class="ck-banner-line' + (k.unlocked && k.effect ? ' is-gold' : '') + '">' + esc(k.unlocked && k.effect ? k.effect : k.blurb) + '</p>'
    });
  }

  function gatherPage(s, skillId) {
    var a = s.activity;
    var look = skillLook(skillId);
    var rows = s.activities.filter(function (x) { return x.skillId === skillId; });
    return '<div class="ck-cells" style="--el:var(--' + look[1] + ')">' + rows.map(function (x) {
      var on = Boolean(a && a.kind === 'gather' && a.id === x.id);
      // The running task's cell is inert: re-picking it would restart the action timer.
      var act = on ? '' : ' data-act="activity" data-kind="gather" data-id="' + esc(x.id) + '"';
      return '<button type="button" class="ck-cell' + (on ? ' is-on' : '') + (x.unlocked ? '' : ' is-locked') + '"' + act +
        (on ? ' aria-current="true"' : '') + (x.unlocked ? '' : ' disabled') +
        ' title="' + esc(x.place + (x.helpers.length ? ' · Helpers: ' + x.helpers.join(', ') : '')) + '">' +
        cellTop(x.level, x.xp) +
        itemIcon(x.outputId, 'MATERIAL', 'is-cell') +
        '<b class="ck-cell-name">' + esc(x.name) + '</b>' +
        '<span class="ck-cell-sub">' + esc(x.output) + ' · ' + esc(x.seconds) + 's</span>' +
        (x.bonus ? '<span class="ck-cell-sub is-ready">+ ' + esc(x.bonus) + '</span>' : '') +
        (on ? cellLive() : x.unlocked ? '' : '<span class="ck-cell-state is-lock">Needs ' + esc(x.lockText) + '</span>') +
      '</button>';
    }).join('') + '</div>';
  }

  function craftPage(s, skillId) {
    var a = s.activity;
    var look = skillLook(skillId);
    var rows = s.recipes.filter(function (r) { return r.skillId === skillId; });
    var running = a && a.kind === 'craft' ? find(rows, 'id', a.id) : null;
    var pick = find(rows, 'id', state.recipePick) || running ||
      rows.filter(function (r) { return r.unlocked && (r.canMake > 0 || r.owned); })[0] ||
      rows.filter(function (r) { return r.unlocked; })[0] || rows[0];
    return (pick ? '<section class="ck-card ck-pick" style="--el:var(--' + look[1] + ')">' + recipeRow(pick, a) + '</section>' : '') +
      '<div class="ck-cells" style="--el:var(--' + look[1] + ')">' + rows.map(function (r) {
        var on = Boolean(a && a.kind === 'craft' && a.id === r.id);
        var status;
        if (!r.unlocked) status = '<span class="ck-cell-state is-lock">Needs ' + esc(r.missing[0] || '') + '</span>';
        else if (!r.repeatable && r.owned) status = '<span class="ck-cell-state is-ready">Owned</span>';
        else if (r.canMake > 0) status = '<span class="ck-cell-state is-ready">' + (r.repeatable ? 'Can make ' + esc(r.canMake) : 'Ready to forge') + '</span>';
        else status = '<span class="ck-cell-state">Needs materials</span>';
        return '<button type="button" class="ck-cell' + (on ? ' is-on' : '') + (r.unlocked ? '' : ' is-locked') +
          (pick && pick.id === r.id ? ' is-picked' : '') + '" data-act="recipe-pick" data-id="' + esc(r.id) + '"' +
          (pick && pick.id === r.id ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
          cellTop(r.level, r.xp) +
          recipeIcon(r, 'is-cell') +
          '<b class="ck-cell-name">' + esc(r.output.name) + '</b>' +
          '<span class="ck-cell-sub">' + (r.repeatable ? esc(r.seconds) + 's each' : 'Forged once') + '</span>' +
          (on ? cellLive() : status) +
        '</button>';
      }).join('') + '</div>';
  }

  function recipeIcon(r, cls) {
    if (r.kind === 'STUDY') return itemIcon((r.inputs[0] || {}).id, 'ESSENCE', cls);
    return itemIcon(r.output.id, r.output.kind, cls);
  }

  function cellTop(level, xp) {
    return '<span class="ck-cell-top"><span class="ck-cell-lv">Lv ' + esc(level) + '</span><span class="ck-cell-xp">' + esc(xp) + ' xp</span></span>';
  }

  function cellLive() {
    return '<span class="ck-bar is-live"><i data-live="activity"></i></span><span class="ck-cell-state is-on">Working</span>';
  }

  function recipeRow(r, a) {
    var on = a && a.kind === 'craft' && a.id === r.id;
    var inputs = r.inputs.map(function (i) {
      return '<span class="' + (i.have >= i.qty ? '' : 'is-short') + '">' + esc(i.qty) + ' ' + esc(i.name) + ' (' + esc(i.have) + ')</span>';
    }).join(', ');
    var buttons;
    if (!r.unlocked) buttons = '<span class="ck-small ck-warn">Needs ' + esc(r.missing.join(', ')) + '</span>';
    else if (r.repeatable) {
      buttons = '<button type="button" class="ck-pill' + (on ? ' is-on' : '') + '" data-act="activity" data-kind="craft" data-id="' + esc(r.id) + '"' +
        (r.canMake > 0 && !on ? '' : ' disabled') + '>' + (on ? 'Working' : 'Work idly') + '</button>' +
        '<button type="button" class="ck-pill" data-act="craft" data-id="' + esc(r.id) + '" data-qty="1"' + (r.canMake > 0 ? '' : ' disabled') + '>' +
          (r.kind === 'STUDY' ? 'Study 1' : 'Make 1') + '</button>' +
        (r.canMake >= 5 ? '<button type="button" class="ck-pill" data-act="craft" data-id="' + esc(r.id) + '" data-qty="5">' +
          (r.kind === 'STUDY' ? 'Study 5' : 'Make 5') + '</button>' : '');
    } else if (r.owned) buttons = '<span class="ck-small is-ready">Owned</span>';
    else buttons = '<button type="button" class="ck-pill is-forge" data-act="craft" data-id="' + esc(r.id) + '" data-qty="1"' +
      (r.canMake > 0 ? '' : ' disabled') + '>Forge</button>';
    return '<div class="ck-recipe' + (r.unlocked ? '' : ' is-locked') + '">' + recipeIcon(r, 'is-lg') + '<div class="ck-recipe-main"><div class="ck-row"><b>' + esc(r.output.name) + '</b>' +
      '<span class="ck-small">Lv ' + esc(r.level) + ' · +' + esc(r.xp) + 'xp</span></div>' +
      '<span class="ck-small ck-muted">' + esc(r.output.blurb) + '</span>' +
      '<span class="ck-small">' + inputs + '</span>' +
      (r.requirements.length ? '<span class="ck-small">Also needs ' + esc(r.requirements.join(', ')) + '</span>' : '') +
      '<div class="ck-pills">' + buttons + '</div></div></div>';
  }

  // Expedition ─────────────────────────────────────────────────────────────

  function timelineHtml(rows) {
    return '<ol class="ck-timeline">' + (rows || []).map(function (r) {
      var t = new Date(r.at);
      var hh = t.getHours(); var mm = t.getMinutes();
      return '<li class="is-' + esc(r.tone) + '"><time>' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + '</time>' +
        '<span>' + esc(r.text) + '</span></li>';
    }).join('') + '</ol>';
  }

  var ROUTE_EMOJI = { PATROL: '🥾', RESOURCE: '⛏️', HUNT: '🎯', DUNGEON: '💀', GRAND: '🌟' };

  function partyFaces(s) {
    var members = s.party.members.filter(Boolean).map(companion).filter(Boolean);
    if (!members.length) return '<span class="ck-faces is-empty">No one in the company yet</span>';
    return '<span class="ck-faces">' + members.map(function (c) {
      return '<span class="ck-face" style="--el:var(--' + elKey(c.element) + ')" title="' + esc(c.nickname) + '">' + portrait(c, 120) + '</span>';
    }).join('') + '</span>';
  }

  function viewExpedition(s) {
    var e = s.expedition;
    if (e) {
      return hero({
          cls: 'is-road', el: e.element, scene: expeditionScene(s), kicker: esc(e.region), title: esc(e.route),
          body: e.done
            ? '<p class="ck-banner-line is-gold">🎉 The company is home!</p>'
            : bar(0, 1, 'is-fat is-live-road').replace('<i ', '<i data-live="exp-bar" ') +
              '<p class="ck-banner-line">Back in <b data-live="exp-left"></b>' +
              (e.technique ? ' · ✨ ' + esc(e.technique) : '') + (e.combo ? ' · ' + esc(e.combo) : '') + '</p>',
          foot: partyFaces(s) + (e.done ? '<button type="button" class="ck-btn is-primary is-big" data-act="collect">🎉 Welcome them home</button>' : '')
        }) +
        '<section class="ck-card"><h3>📜 The road so far</h3>' + timelineHtml(e.timeline) +
        (e.done ? '' : '<p class="ck-hint">News arrives as it happens.</p>') + '</section>';
    }
    var t = s.tactics;
    var techniques = s.affinities.filter(function (a) { return a.technique.unlocked; });
    var potions = s.inventory.filter(function (i) { return i.kind === 'POTION'; });
    var runes = s.inventory.filter(function (i) { return i.kind === 'RUNE'; });
    var packed = potions.reduce(function (n, p) { return n + Math.min(state.supplies[p.id] || 0, p.qty); }, 0);
    var tech = techniques.filter(function (a) { return a.technique.id === t.techniqueId; })[0];
    return hero({
        cls: 'is-road', scene: namedScene('wind-journey'), kicker: 'Expeditions', title: 'Choose your road',
        body: '<p class="ck-banner-line">Your company explores, fights and gathers while you are away.</p>',
        foot: partyFaces(s) + '<button type="button" class="ck-btn is-glass is-sm" data-act="tab" data-tab="company">Change company</button>'
      }) +
      '<details class="ck-card ck-prep"' + (state.prepOpen ? ' open' : '') + '><summary data-act="prep-toggle">' +
        '<span class="ck-prep-title">⚙️ Tactics &amp; supplies</span>' +
        '<span class="ck-prep-sum"><span class="ck-chip">🏳️ ' + esc(t.retreatAt) + '%</span>' +
        '<span class="ck-chip">🧪 ' + packed + '</span>' + (tech ? '<span class="ck-chip is-type">✨ ' + esc(tech.label) + '</span>' : '') +
        (state.rune ? '<span class="ck-chip is-rare">📜 Rune</span>' : '') + '</span></summary>' +
        '<div class="ck-tactics">' +
          '<label class="ck-field"><span>🏳️ Retreat below <b>' + esc(t.retreatAt) + '%</b> company health</span>' +
            '<input type="range" min="0" max="60" step="5" value="' + esc(t.retreatAt) + '" data-tactic="retreatAt"></label>' +
          '<label class="ck-field"><span>🧪 Give potions below <b>' + esc(t.potionAt) + '%</b> health</span>' +
            '<input type="range" min="0" max="80" step="5" value="' + esc(t.potionAt) + '" data-tactic="potionAt"></label>' +
          '<label class="ck-field"><span>⚔️ Use your weapon command</span><select data-tactic="trigger">' + t.triggers.map(function (o) {
            return '<option value="' + esc(o.id) + '"' + (o.id === t.trigger ? ' selected' : '') + '>' + esc(o.label) + '</option>';
          }).join('') + '</select></label>' +
          '<label class="ck-field"><span>✨ Prepared technique</span><select data-tactic="techniqueId"><option value="">None</option>' +
            techniques.map(function (a) {
              return '<option value="' + esc(a.technique.id) + '"' + (a.technique.id === t.techniqueId ? ' selected' : '') + '>' +
                esc(a.technique.name) + ' (' + esc(a.label) + ')</option>';
            }).join('') + '</select>' +
            (techniques.length ? '' : '<span class="ck-small ck-muted">Reach Affinity 10 with an element to learn its technique.</span>') + '</label>' +
          (s.combos.some(function (c) { return c.unlocked; })
            ? '<label class="ck-field"><span>🌀 Prepared combination</span><select data-tactic="comboId"><option value="">None</option>' +
              s.combos.filter(function (c) { return c.unlocked; }).map(function (c) {
                return '<option value="' + esc(c.id) + '"' + (c.id === t.comboId ? ' selected' : '') + '>' + esc(c.name) +
                  ' (' + esc(c.labels.join(' + ')) + ')</option>';
              }).join('') + '</select></label>' : '') +
        '</div>' +
        '<h4>Supplies</h4>' + (potions.length ? '<div class="ck-supplies">' + potions.map(function (p) {
          var n = Math.min(state.supplies[p.id] || 0, p.qty);
          return '<div class="ck-supply">' + itemIcon(p.id, p.kind, 'is-sm') + '<span class="ck-supply-name">' + esc(p.name) + ' <span class="ck-small">(' + esc(p.qty) + ')</span></span>' +
            '<span class="ck-stepper"><button type="button" data-act="supply" data-id="' + esc(p.id) + '" data-d="-1" aria-label="Fewer">−</button>' +
            '<b>' + n + '</b><button type="button" data-act="supply" data-id="' + esc(p.id) + '" data-d="1" aria-label="More">+</button></span></div>';
        }).join('') + '</div>' : '<p class="ck-hint">No potions. Brew Herb Tonics at Alchemy.</p>') +
        (runes.length ? '<h4>Rune (one per expedition, spent on the road)</h4><div class="ck-pills">' +
          '<button type="button" class="ck-pill' + (state.rune ? '' : ' is-on') + '" data-act="rune" data-id="">None</button>' +
          runes.map(function (r) {
            return '<button type="button" class="ck-pill' + (state.rune === r.id ? ' is-on' : '') + '" data-act="rune" data-id="' + esc(r.id) +
              '" title="' + esc(r.blurb) + '">📜 ' + esc(r.name) + ' ×' + esc(r.qty) + '</button>';
          }).join('') + '</div>' : '') +
      '</details>' +
      [1, 2, 3, 4].map(function (tier) {
        var routes = s.routes.filter(function (r) { return r.tier === tier; });
        if (!routes.length) return '';
        return '<div class="ck-section-head"><h3>🗺️ ' + esc(TIER_NAMES[tier]) + '</h3></div><div class="ck-routes">' + routes.map(routeCard).join('') + '</div>' +
          (tier === 3 && s.sealedRoutes ? '<p class="ck-hint">🔒 ' + esc(s.sealedRoutes) +
            ' more lands are sealed until their Siegelings are discovered.</p>' : '');
      }).join('');
  }

  function s_rank() { return state.snap ? state.snap.knight.rank : 1; }

  var TIER_NAMES = { 1: 'Tier I · The Inner Wilds', 2: 'Tier II · The Outer Frontiers',
    3: 'Tier III · The Forgotten Regions', 4: 'Tier IV · Legendary Expeditions' };

  function routeCard(r) {
    var type = r.type.charAt(0) + r.type.slice(1).toLowerCase();
    return '<article class="ck-route' + (r.unlocked ? '' : ' is-locked') + '" style="--el:var(--' + elKey(r.element) + ')">' +
      '<div class="ck-route-art"><img src="' + esc(routeScene(r.element, r.type)) + '" alt="" loading="lazy" decoding="async">' +
        '<span class="ck-route-tags"><span class="ck-tag">' + (ROUTE_EMOJI[r.type] || '🧭') + ' ' + esc(type) + '</span>' +
        '<span class="ck-tag">⏱️ ' + esc(r.minutes >= 120 ? Math.round(r.minutes / 6) / 10 + ' h' : r.minutes + ' min') + '</span></span>' +
        '<span class="ck-route-name">' + elementIcon(r.element, 20) + (r.extraElements || []).map(function (x) { return elementIcon(x.toUpperCase(), 20); }).join('') +
          '<b>' + esc(r.name) + '</b></span>' +
        (r.unlocked ? '' : '<span class="ck-route-lock">🔒</span>') +
      '</div>' +
      '<div class="ck-route-body">' +
        '<span class="ck-chips">' + chip('Lv ' + r.levels) + (r.hidden ? chip('🔍 Discovered', 'is-rare') : '') +
          (r.taming ? chip('🪢 Taming', 'is-help') : '') + (r.boss ? chip('👹 ' + r.boss, 'is-boss') : '') + '</span>' +
        '<span class="ck-small">' + esc(r.blurb) + '</span>' +
        (r.hazardText ? '<span class="ck-small ck-warn">⚠️ ' + esc(r.hazardText) + '</span>' : '') +
        (r.twists || []).map(function (t) {
          return '<span class="ck-small ' + (t.warded ? 'is-ready' : 'ck-warn') + '"><b>' + esc(t.name) + (t.warded ? ' (warded)' : '') + ':</b> ' +
            esc(t.text) + ' Countered by ' + esc(t.counters.join(' or ')) + ' Siegelings or a ' + esc(t.relic) + '.</span>';
        }).join('') +
        ((r.requirements || []).length ? '<span class="ck-small">Needs ' + r.requirements.map(function (q) {
          return '<span class="' + (q.met ? 'is-ready' : 'is-short') + '">' + esc(q.text) + '</span>';
        }).join(', ') + '</span>' : '') +
        '<span class="ck-small ck-muted">🎁 ' + esc(r.loot.join(', ')) + '</span>' +
        '<div class="ck-actions">' + (r.unlocked
          ? '<button type="button" class="ck-btn is-primary is-sm" data-act="launch" data-id="' + esc(r.id) + '">🚀 Set out</button>'
          : '<span class="ck-small ck-muted">' + (s_rank() < r.rankReq ? 'Opens at Rank ' + esc(r.rankReq) : 'Meet its needs to set out') + '</span>') +
        '</div></div></article>';
  }

  // Wilds ──────────────────────────────────────────────────────────────────

  var BEHAVIOR_TIPS = {
    gentle: 'Gentle: a patient approach works well.',
    skittish: 'Skittish: flees when approached. A lure works far better than patience.',
    aggressive: 'Aggressive: hard to calm. A bonded partner helps.',
    lone: 'Lone: wary of other Siegelings. Patience or a lure.',
    pack: 'Pack: responds to a bonded partner of its element.'
  };

  var BEHAVIOR_EMOJI = { gentle: '🌸', skittish: '💨', aggressive: '💢', lone: '🌙', pack: '🐾' };

  function viewWilds(s) {
    if (!s.sightings.length) {
      return hero({
        cls: 'is-road', scene: namedScene('wind-elite'), kicker: 'The Wilds', title: 'No fresh trails',
        body: '<p class="ck-banner-line">Hunts and patrols spot wild Siegelings. Each trail waits 48 hours for you to try taming it.</p>',
        foot: '<button type="button" class="ck-btn is-primary" data-act="tab" data-tab="expedition">🎯 Plan a hunt</button>'
      });
    }
    return s.sightings.map(function (w) {
      var o = w.odds;
      var left = w.expiresAt - serverNow();
      return '<section class="ck-encounter" style="--el:var(--' + elKey(w.element) + ')">' +
        '<div class="ck-encounter-stage"><img class="ck-banner-img" src="' + esc(scene(w.element, 'journey')) + '" alt="" decoding="async">' +
          '<span class="ck-banner-shade" aria-hidden="true"></span>' +
          '<p class="ck-encounter-kicker">A wild Siegeling appears!</p>' +
          portrait(w, 480, 'is-encounter') +
          '<div class="ck-encounter-name"><h2>' + esc(w.species) + '</h2><span class="ck-chips">' + elChip(w.element, w.elementLabel) +
            chip((CLASS_EMOJI[w.class] || '') + ' ' + w.class) + chip('Lv ' + w.level) + chip(w.rarity.charAt(0) + w.rarity.slice(1).toLowerCase()) + '</span></div>' +
        '</div>' +
        '<div class="ck-encounter-body">' +
          '<p class="ck-small">' + (BEHAVIOR_EMOJI[w.behavior] || '') + ' ' + esc(BEHAVIOR_TIPS[w.behavior] || w.behavior) + '</p>' +
          '<p class="ck-hint">Spotted on ' + esc(w.route) + ' · trail goes cold in ' + esc(duration(left)) + '</p>' +
          '<div class="ck-approaches">' +
            approach('🧘', 'Patient', 'Uses your Taming skill. Costs nothing.', o.patient, 'data-act="tame" data-id="' + esc(w.id) + '" data-plan="patient"') +
            approach('🤝', 'Partner', o.partner == null ? 'Needs a ' + esc(w.elementLabel) + ' Siegeling at Bond 10+.' :
              esc(o.partnerName) + ' coaxes it closer.', o.partner, 'data-act="tame" data-id="' + esc(w.id) + '" data-plan="partner"') +
            (o.lures.length ? o.lures.map(function (l) {
              return approach(itemEmoji(l.id, 'LURE'), l.name, 'Spends one lure (' + esc(l.qty) + ' left).', l.chance,
                'data-act="tame" data-id="' + esc(w.id) + '" data-plan="lure" data-lure="' + esc(l.id) + '"');
            }).join('') : approach('🪝', 'Lure', 'Brew lures at Alchemy. Element lures work best.', null, '')) +
          '</div>' +
          '<div class="ck-actions"><button type="button" class="ck-link" data-act="tame" data-id="' + esc(w.id) + '" data-plan="leave">Let it go</button></div>' +
        '</div></section>';
    }).join('');
  }

  function approach(emoji, name, text, chance, attrs) {
    var ok = chance != null && attrs;
    return '<button type="button" class="ck-approach"' + (ok ? ' ' + attrs : ' disabled') + '>' +
      '<span class="ck-approach-ico" aria-hidden="true">' + emoji + '</span>' +
      '<span class="ck-approach-text"><b>' + esc(name) + '</b><span class="ck-small">' + text + '</span></span>' +
      (chance != null ? '<span class="ck-odds" style="--p:' + Number(chance) + '"><b>' + esc(chance) + '%</b></span>' : '') + '</button>';
  }

  // ── live ticking ─────────────────────────────────────────────────────────

  function tick() {
    var s = state.snap;
    if (!s) return;
    var now = serverNow();
    if (s.activity) {
      var a = s.activity;
      var into = (a.remainderMs + (now - a.lastTickAt)) % a.actionMs;
      Array.prototype.forEach.call(document.querySelectorAll('[data-live="activity"]'), function (el) {
        el.style.width = pct(into, a.actionMs) + '%';
      });
    }
    var e = s.expedition;
    if (e) {
      var total = e.completesAt - e.startedAt;
      var left = e.completesAt - now;
      Array.prototype.forEach.call(document.querySelectorAll('[data-live="exp-bar"]'), function (el) {
        el.style.width = pct(now - e.startedAt, total) + '%';
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-live="exp-left"]'), function (el) {
        el.textContent = e.done ? 'Home!' : left > 0 ? duration(left) : 'arriving…';
      });
      if (!e.done && left <= -1500 && !state.busy && !state.refreshing) {
        state.refreshing = true;
        load().then(function () { state.refreshing = false; });
      }
    }
  }

  // ── events ───────────────────────────────────────────────────────────────

  document.addEventListener('click', function (ev) {
    var tabBtn = ev.target.closest('#ckTabs button[data-tab]');
    if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var d = el.dataset;
    switch (d.act) {
      case 'reload': load(); break;
      case 'tab': switchTab(d.tab); break;
      case 'close-modal': closeModal(); render(); break;
      case 'ack-away': closeModal(); act('/api/chronicles/away/ack', {}); break;
      case 'oath-pick':
        state.oathPick = d.id;
        Array.prototype.forEach.call(document.querySelectorAll('.ck-starter'), function (b) {
          b.classList.toggle('is-picked', b.dataset.id === d.id);
        });
        // The land behind the oath follows the companion being considered.
        if (el.dataset.el) setBackdrop(scene(el.dataset.el, 'journey'));
        break;
      case 'oath':
        api('/api/chronicles/start', { starterId: state.oathPick, knightName: ($('ckOathName') || {}).value || '', requestId: requestId() })
          .then(function (data) {
            if (data.error) { toast(data.error, 'bad'); return; }
            state.tab = 'work';
            saveTab('work');
            accept(data);
          });
        break;
      case 'equip': act('/api/chronicles/equip', { itemId: d.id }); break;
      case 'affinity': showAffinity(d.id); break;
      case 'skill': showSkill(d.id); break;
      case 'item': showItem(d.id); break;
      case 'build': act('/api/chronicles/build', { buildingId: d.id }); break;
      case 'trial': act('/api/chronicles/trial/start', { companionId: d.id }, function () { switchTab('expedition'); }); break;
      case 'guild-join': realmAct('/api/chronicles/guild/join', { code: ($('ckGuildCode') || {}).value || '' }); break;
      case 'guild-create': realmAct('/api/chronicles/guild/create', { name: ($('ckGuildName') || {}).value || '' }); break;
      case 'guild-leave': if (window.confirm('Leave your guild?')) realmAct('/api/chronicles/guild/leave', {}); break;
      case 'guild-claim': realmAct('/api/chronicles/guild/claim', {}); break;
      case 'guild-donate': realmAct('/api/chronicles/guild/donate', { itemId: ($('ckDonateItem') || {}).value, quantity: Number(($('ckDonateQty') || {}).value) || 1 }); break;
      case 'operation': act('/api/chronicles/expedition/launch', { routeId: 'operation:' + d.id, supplies: {} }, function () { switchTab('expedition'); }); break;
      case 'market-buy': realmAct('/api/chronicles/market/buy', { listingId: d.id }); break;
      case 'market-cancel': realmAct('/api/chronicles/market/cancel', { listingId: d.id }); break;
      case 'market-list': realmAct('/api/chronicles/market/list', { itemId: ($('ckSellItem') || {}).value,
        quantity: Number(($('ckSellQty') || {}).value) || 1, price: Number(($('ckSellPrice') || {}).value) || 0 }); break;
      case 'loadout-apply': act('/api/chronicles/loadout/apply', { slot: Number(d.slot) }); break;
      case 'loadout-save': {
        var plan = window.prompt('Name this loadout:', '');
        if (plan != null) act('/api/chronicles/loadout/save', { slot: Number(d.slot), name: plan });
        break;
      }
      case 'activity': act('/api/chronicles/activity', { kind: d.kind, id: d.id }); break;
      case 'work-skill': openWorkSkill(d.id); break;
      case 'work-type': {
        var pages = workPages(state.snap);
        var list = d.id === 'craft' ? pages.craft : pages.gather;
        var working = activeSkillId(state.snap);
        var dest = (find(list, 'id', working) && working) || (find(list, 'id', state.workLast[d.id]) && state.workLast[d.id]) ||
          (list[0] && list[0].id);
        if (dest) openWorkSkill(dest);
        break;
      }
      case 'recipe-pick': {
        state.recipePick = d.id;
        render();
        // The detail panel sits above the grid; bring it back into view when picked from far down.
        var pick = main.querySelector('.ck-pick');
        var gap = pick ? pick.getBoundingClientRect().top - main.getBoundingClientRect().top : 0;
        if (gap < 0) main.scrollTop = Math.max(0, main.scrollTop + gap - 8);
        break;
      }
      case 'activity-stop': act('/api/chronicles/activity', { kind: '', id: '' }); break;
      case 'craft': act('/api/chronicles/craft', { recipeId: d.id, quantity: Number(d.qty) || 1 }); break;
      case 'comp-toggle': {
        state.openCompanion = state.openCompanion === d.id ? '' : d.id;
        render();
        // A tap on the company stage opens that card further down; bring it into view.
        var card = state.openCompanion && main.querySelector('.ck-comp.is-open');
        if (card) {
          var top = card.getBoundingClientRect().top - main.getBoundingClientRect().top;
          if (top < 0 || top > main.clientHeight - 80) main.scrollTop = Math.max(0, main.scrollTop + top - 8);
        }
        break;
      }
      case 'helper': act('/api/chronicles/helper', { companionId: d.id }); break;
      case 'feed': act('/api/chronicles/feed', { companionId: d.id, foodId: d.food }); break;
      case 'evolve': act('/api/chronicles/evolve', { companionId: d.id }); break;
      case 'rename': {
        var c = companion(d.id);
        var name = window.prompt('A new name for ' + (c ? c.nickname : 'your Siegeling') + ':', c ? c.nickname : '');
        if (name != null) act('/api/chronicles/rename', { companionId: d.id, nickname: name });
        break;
      }
      case 'party-set': case 'party-clear': case 'party-reserve': changeParty(d); break;
      case 'supply': {
        var have = invQty(d.id);
        var total = Object.keys(state.supplies).reduce(function (n, k) { return n + (state.supplies[k] || 0); }, 0);
        var next = Math.max(0, Math.min(have, (state.supplies[d.id] || 0) + Number(d.d)));
        var cap = state.snap.base ? state.snap.base.supplyCap : 20;
        if (Number(d.d) > 0 && total >= cap) { toast('A company can carry ' + cap + ' potions.', 'warn'); break; }
        state.supplies[d.id] = next;
        render();
        break;
      }
      case 'rune': state.rune = d.id || ''; render(); break;
      case 'prep-toggle': state.prepOpen = !ev.target.closest('details').open; break;
      case 'launch': {
        var supplies = {};
        Object.keys(state.supplies).forEach(function (k) { if (state.supplies[k] > 0) supplies[k] = Math.min(state.supplies[k], invQty(k)); });
        if (state.rune && invQty(state.rune) > 0) supplies[state.rune] = 1;
        act('/api/chronicles/expedition/launch', { routeId: d.id, supplies: supplies }, function () { state.supplies = {}; state.rune = ''; });
        break;
      }
      case 'collect':
        act('/api/chronicles/expedition/collect', {}, function (data) { if (data.report) showReport(data.report, data.events); });
        break;
      case 'tame':
        act('/api/chronicles/tame', { sightingId: d.id, strategy: d.plan, lureId: d.lure || '' }, function (data) {
          var t = data.taming || {};
          if (t.result === 'tamed') { state.openCompanion = t.companionId || ''; }
        });
        break;
      default: break;
    }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target.closest('[data-tactic]');
    if (!el) return;
    var body = {};
    var key = el.dataset.tactic;
    body[key] = el.type === 'range' ? Number(el.value) : el.value;
    act('/api/chronicles/tactics', body);
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target.closest('input[type="range"][data-tactic]');
    if (!el) return;
    var label = el.parentNode.querySelector('b');
    if (label) label.textContent = el.value + '%';
  });

  function changeParty(d) {
    var p = state.snap.party;
    var members = [0, 1, 2].map(function (i) { return p.members[i] || ''; });
    var reserve = p.reserveId || '';
    if (d.act === 'party-clear') members[Number(d.slot)] = '';
    else if (d.act === 'party-set') {
      members = members.map(function (m) { return m === d.id ? '' : m; });
      members[Number(d.slot)] = d.id;
      if (reserve === d.id) reserve = '';
    } else if (d.act === 'party-reserve') {
      members = members.map(function (m) { return m === d.id ? '' : m; });
      reserve = d.id;
    }
    act('/api/chronicles/party', { members: members, reserveId: reserve });
  }

  function openWorkSkill(id) {
    if (!id) { switchTab('work'); return; }
    var pages = workPages(state.snap);
    state.workLast[find(pages.craft, 'id', id) ? 'craft' : 'gather'] = id;
    state.workSkill = id;
    // A page the player asked for outranks opening on the running task.
    state.workSeeded = true;
    state.recipePick = '';
    savePref(WORK_KEY, id);
    if (state.tab !== 'work') { switchTab('work'); return; }
    main.scrollTop = 0;
    render();
  }

  function switchTab(tab) {
    state.tab = tab;
    saveTab(tab);
    main.scrollTop = 0;
    render();
    if (tab === 'realm') loadRealm();
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('ckModal').hidden && $('ckModal').dataset.kind === 'report') { closeModal(); render(); }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.snap) load();
  });

  setInterval(tick, 1000);
  load().then(function () { if (state.tab === 'realm' && state.snap) loadRealm(); });

  // Test hook: headless checks inject a snapshot without a server.
  window.__ckAccept = accept;
})();
