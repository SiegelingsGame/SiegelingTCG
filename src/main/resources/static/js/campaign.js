(function () {
  'use strict';
  var RUN_TOKEN_KEY = 'sieglingsCampaignToken';
  var SOLO_TOKEN_KEY = 'sieglingsSoloSessionToken';
  var state = {
    options: null, run: null, selectedStarter: null, formation: {}, formationPick: null,
    busy: false, prologue: 'approach', arrival: null, overworld: null
  };

  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var el = $('cmToast');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg || '';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2800);
  }
  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function authHeaders(extra) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    try {
      var tok = localStorage.getItem('sieglingsAuthToken');
      if (tok) h.Authorization = 'Bearer ' + tok;
    } catch (e) {}
    var runTok = load(RUN_TOKEN_KEY);
    if (runTok) h['X-Campaign-Token'] = runTok;
    return h;
  }
  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      headers: authHeaders(opts.headers),
      credentials: 'same-origin'
    };
    if (opts.body != null) init.body = JSON.stringify(opts.body);
    return fetch(path, init).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.error) throw new Error(data.error);
      return data;
    });
  }
  function show(screen) {
    document.body.dataset.screen = screen;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function elColor(el) {
    var key = String(el || 'neutral').toLowerCase();
    return 'var(--' + key + ', #95a5a6)';
  }

  // Figure for any Siegeling: its animated sheet, else the card's overlay cutout
  // (sized by its measured body, see fitCutouts), else an element-coloured dot.
  // `still` holds a sheet on its first frame (thumbnails).
  function figureHtml(card, width, still) {
    var S = window.SiegeSprites;
    var id = card && (card.cardId || card.id);
    var sheet = S && S.forCard(id);
    if (sheet) return animHtml(sheet, 'idle', still);
    var url = S && S.overlayUrl(card);
    if (url) {
      // The mirror is the readable, resized copy; if it is unreachable the raw
      // file still draws (unmeasured), and a dead file hides rather than breaks.
      return '<span class="cm-cut" data-cut="' + esc(url) + '" data-w="' + (width || 480) + '">' +
        '<img src="' + esc(S.cutoutSrc(url, width || 480)) + '" alt="" decoding="async" ' +
        'onerror="var r=this.parentNode.getAttribute(\'data-cut\');if(this.getAttribute(\'src\')!==r){this.src=r}else{this.onerror=null;this.style.visibility=\'hidden\'}"></span>';
    }
    // No sheet and no cutout: the element's emblem stands in (a "?" while still a silhouette).
    var el = card && card.element;
    return '<span class="cm-dot" style="--cm-el-c:' + elColor(el) + '"><img src="' + elementIcon(el) + '" alt=""><i aria-hidden="true">?</i></span>';
  }

  function fitCutouts(root) {
    var S = window.SiegeSprites;
    if (!S || !root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.cm-cut[data-cut]:not(.is-fit)'), function (el) {
      el.classList.add('is-fit');
      S.measureCutout(el.getAttribute('data-cut'), Number(el.getAttribute('data-w')) || 480, function (b) {
        var h = Math.max(0.05, b.bottom - b.top);
        el.style.setProperty('--cut-h', (100 / h).toFixed(2) + '%');
        el.style.setProperty('--cut-b', (-100 * (1 - b.bottom) / h).toFixed(2) + '%');
        el.style.setProperty('--cut-dx', ((0.5 - (b.left + b.right) / 2) * 100).toFixed(2) + '%');
      });
    });
  }

  function setOverworldActive(on) {
    if (state.overworld) state.overworld.enable(!!on);
  }

  function applyRun(run) {
    state.run = run;
    if (run && run.token) store(RUN_TOKEN_KEY, run.token);
    var stats = $('cmStats');
    if (stats) {
      // Do not name this `show` — that shadows the screen-switch helper below.
      var showStats = run && run.phase !== 'OVER' && run.phase !== 'NEW_GAME';
      stats.hidden = !showStats;
      if (showStats) {
        $('cmGold').textContent = '◎ ' + (run.gold || 0);
        $('cmRallies').textContent = '⚑ ' + (run.ralliedLandIds || []).length;
      }
    }
    if (!run) {
      setOverworldActive(false);
      show('start');
      return;
    }
    if (run.phase === 'VICTORY') {
      setOverworldActive(false);
      $('cmVictory').textContent = run.lastMessage || 'Raidlord Akhar falls. The realms stand united.';
      show('victory');
      return;
    }
    if (run.phase === 'WILD_BATTLE' || run.phase === 'ARENA_BATTLE') {
      setOverworldActive(false);
      renderEncounterResume(run);
      show('arenaResume');
      return;
    }
    renderWalking(run);
  }

  function landThumb(s) {
    return s.landId ? '/img/lands/thumbs/' + s.landId + '.webp' : (s.background || '');
  }

  // A looping idle strip: the cell keeps the sheet's aspect, and is scaled so the
  // body (sheet.fit of the cell) fills the box and the feet (sheet.base) meet the floor.
  function animHtml(sheet, pose, still) {
    pose = sheet.frames[pose] ? pose : 'idle';
    var n = sheet.frames[pose] || 1;
    var cellPct = 100 / sheet.fit;
    return '<span class="cm-anim' + (still ? ' is-still' : '') + '" style="aspect-ratio:' + sheet.w + '/' + sheet.h +
      ';height:' + cellPct.toFixed(1) + '%;bottom:' + (-cellPct * (sheet.base || 0)).toFixed(1) + '%">' +
      '<i style="--n:' + n + ';background-image:url(' + esc(sheet.dir + pose + '.webp') + ')"></i></span>';
  }

  function partnerArtHtml(s) { return figureHtml(s, 480); }

  function renderStarters(options) {
    var bob = document.querySelector('.cm-prologue-bob');
    if (!bob.dataset.cleaned) {
      bob.dataset.cleaned = 'true';
      window.CampaignAdventureMap.cleanOpeningSprite(bob);
    }
    var host = $('cmStarters');
    if (!host) return;
    var list = options.starters || [];
    host.innerHTML = list.map(function (s) {
      return '<button type="button" class="cm-starter" role="radio" aria-checked="false" data-starter="' + esc(s.id) +
        '" style="--cm-el-c:' + elColor(s.element) + ';--cm-land:url(' + esc(landThumb(s)) + ')">' +
        '<span class="cm-starter-art">' + partnerArtHtml(s) + '</span>' +
        '<span class="cm-starter-name"><b>' + esc(s.name) + '</b><small>' + esc(s.landName || s.element) + '</small></span>' +
        '</button>';
    }).join('');
    fitCutouts(host);
    $('cmPrologueCaptives').innerHTML = list.map(function (card) {
      return '<span class="cm-prologue-creature" data-captive="' + esc(card.id) + '">' + figureHtml(card, 180, true) + '</span>';
    }).join('');
    fitCutouts($('cmPrologueCaptives'));
    paintPrologue();
  }

  var PROLOGUE = {
    approach: ['Squire Bob', "The road to Sanctuary City is blocked. That's a SiegeKnight up ahead.", 'Approach'],
    arrest: ['Pyla', 'Easy, Squire. I caught these raiders hauling four Siegelings in cages. The raiders are in custody. Help me open the latches.', 'Free the captives'],
    choose: ['Pyla', 'There. They can leave if they want to. Hold out your hand to one and let it decide.', 'Reach out'],
    bond: ['Pyla', '', 'Enter Sanctuary City']
  };

  function paintPrologue() {
    var step = state.prologue;
    var copy = PROLOGUE[step];
    $('screenStart').dataset.prologue = step;
    $('cmPrologueSpeaker').textContent = copy[0];
    $('cmPrologueLine').textContent = step === 'bond'
      ? starterName(state.selectedStarter) + ' rests against your hand. It trusts you, Squire. If it wants to stay, take it with you into Sanctuary City.'
      : copy[1];
    $('cmStarters').hidden = step !== 'choose';
    var button = $('cmStartBtn');
    button.textContent = copy[2];
    button.disabled = step === 'choose' && !state.selectedStarter;
  }

  function selectStarter(id) {
    if (state.prologue !== 'choose' || !((state.options && state.options.starters) || []).some(function (s) { return s.id === id; })) return;
    state.selectedStarter = id;
    document.querySelectorAll('[data-starter], [data-captive]').forEach(function (node) {
      var selected = (node.dataset.starter || node.dataset.captive) === id;
      node.classList.toggle('is-on', selected);
      if (node.dataset.starter) node.setAttribute('aria-checked', String(selected));
    });
    paintPrologue();
  }

  /** The Siegeling walking behind Bob: the SiegelinQ follower, else the starter. */
  function starterFollower(run) {
    var want = run.followerId || run.starterId;
    var pick = null;
    (run.rosterCards || []).forEach(function (c) {
      if (!pick && c.id === want) pick = c;
    });
    if (!pick && run.rosterCards && run.rosterCards[0]) pick = run.rosterCards[0];
    return pick ? {
      id: pick.id, artUrl: pick.artUrl, cardArtMode: pick.cardArtMode,
      rarity: pick.rarity || (pick.card && pick.card.rarity)
    } : null;
  }

  function fillRealmOverlay(run) {
    $('cmWorldBanner').textContent = run.lastMessage || 'Choose a Land to travel.';
    var host = $('cmWorld');
    host.innerHTML = (run.lands || []).filter(function (land) {
      return ['ice', 'wind', 'fire'].indexOf(land.id) < 0;
    }).map(function (land) {
      var locked = !land.unlocked && !land.rallied;
      var cls = 'cm-land' + (locked ? ' is-locked' : '') + (land.rallied ? ' is-rallied' : '');
      var status = land.rallied ? 'Rallied' : (land.rivalCleared ? 'Knight awaits' : (locked ? 'Sealed' : 'Open'));
      return '<button type="button" class="' + cls + '" data-land="' + esc(land.id) + '"' +
        (locked ? ' disabled' : '') +
        ' style="background-image:url(\'' + esc(land.background || '') + '\')">' +
        '<span class="cm-land-body"><strong>' + esc(land.name) + '</strong>' +
        '<span>' + esc((land.elements && land.elements[0]) || '') + ' · ' + status + '</span></span></button>';
    }).join('');
  }

  function showRealmOverlay(on) {
    var ov = $('cmWorldOverlay');
    if (!ov) return;
    ov.hidden = !on;
    if (on && state.run) fillRealmOverlay(state.run);
    setOverworldActive(!on && !menuOpen() && document.body.dataset.screen === 'world');
  }

  // Campaign duels use the Battle Table. Roaming encounters use Siege.
  function startArena(body) {
    return api('/api/campaign/arena/start', { method: 'POST', body: body }).then(function (data) {
      if (!data.soloToken) throw new Error('No battle token.');
      rememberBattleLocation();
      goToArena(data.soloToken);
    });
  }

  var BATTLE_LOCATION_KEY = 'sieglingsAdventureBattleLocation';

  function rememberBattleLocation() {
    var ow = state.overworld;
    if (!ow) return;
    var position = ow.snapshot();
    try {
      sessionStorage.setItem(BATTLE_LOCATION_KEY, JSON.stringify({
        token: state.run.token, area: position.area, player: position.player
      }));
    } catch (e) {}
  }

  function battleArrival(run) {
    try {
      var saved = JSON.parse(sessionStorage.getItem(BATTLE_LOCATION_KEY));
      if (saved && saved.token === run.token && saved.area === run.area) {
        sessionStorage.removeItem(BATTLE_LOCATION_KEY);
        return saved.player;
      }
    } catch (e) {}
    return null;
  }

  function startWildBattle(cardId) {
    return api('/api/campaign/wild/start', { method: 'POST', body: { cardId: cardId, area: state.run.area } }).then(function (run) {
      rememberBattleLocation();
      applyRun(run);
      window.location.href = '/siege?campaign=1';
    });
  }

  function engageWild(actor, ambush) {
    if (state.busy) return;
    var map = state.overworld;
    setOverworldActive(false);
    if (ambush) map.setBanner('A wild ' + actor.label + ' appeared!');
    busy(function () {
      return startWildBattle(actor.cardId).catch(function (error) {
        map.setBanner(state.run.lastMessage);
        if (!menuOpen() && $('cmWorldOverlay').hidden) setOverworldActive(true);
        throw error;
      });
    });
  }

  function travelToLand(landId) {
    return api('/api/campaign/enter-land', { method: 'POST', body: { landId: landId } }).then(applyRun);
  }

  function walkToArea(area) {
    var from = state.run.area;
    return api('/api/campaign/area', { method: 'POST', body: { area: area } }).then(function (run) {
      var gates = { ice: { x: 560, y: 175 }, wind: { x: 182, y: 384 }, fire: { x: 938, y: 384 } };
      state.arrival = area === 'wildlands' ? gates[from] : { x: 560, y: 678 };
      applyRun(run);
    });
  }

  function handleOverworldAct(act, actor) {
    if (act === 'exit' || act === 'woods') {
      busy(function () { return walkToArea(act === 'exit' ? 'sanctuary' : 'wildlands'); });
    } else if (act === 'realms') {
      showRealmOverlay(true);
    } else if (act === 'travel' && actor.landId) {
      busy(function () { return travelToLand(actor.landId); });
    } else if (act === 'wild-foe' || act === 'wild-ambush') {
      engageWild(actor, act === 'wild-ambush');
    } else if (act === 'preset') {
      openPresetFrom();
    } else if (act === 'road-rival') {
      openPreBattle({ kind: 'rival', roadLandId: actor.landId }, actor.label);
    } else if (act === 'talk') {
      state.overworld.setBanner(actor.label + ': You have our city’s support, Squire.');
    } else if (act === 'rival' || act === 'knight' || act === 'legendary') {
      openPreBattle({ kind: act }, actor.label);
    }
  }

  function syncActButton(near, text) {
    var visible = !near ? 'Explore' : text.indexOf('Challenge ') === 0 ? 'Challenge' : text;
    document.querySelectorAll('[data-act-btn]').forEach(function (btn) {
      var label = btn.querySelector('[data-act-label]');
      label.textContent = visible;
      btn.classList.toggle('is-live', !!near);
      btn.setAttribute('aria-label', near ? text : 'Interact');
    });
  }

  function pressAct() {
    var ow = state.overworld;
    if (!ow) return;
    if (ow.near) ow.tryInteract();
    else ow.setBanner('Walk up to a sign, trainer, or wild Siegeling, then press A.');
  }

  function renderWalking(run) {
    var city = run.area && run.area !== 'wildlands' && run.area !== 'sanctuary';
    show(city ? 'land' : 'world');
    if (!state.overworld) state.overworld = new window.CampaignAdventureMap(handleOverworldAct, syncActButton);
    var host = $(city ? 'cmStage' : 'cmSanctuaryStage');
    state.overworld.load(host, run, starterFollower(run), state.arrival || battleArrival(run));
    state.arrival = null;
    $('cmWorldOverlay').hidden = true;
    setOverworldActive(!menuOpen());
  }

  window.render_game_to_text = function () {
    var screen = document.body.dataset.screen;
    return JSON.stringify({
      screen: screen,
      prologue: screen === 'start' ? state.prologue : null,
      starter: state.selectedStarter,
      map: state.overworld ? state.overworld.snapshot() : null
    });
  };

  // ---- Formation (Arena preset on a 3x3 board half) -------------------------

  var RASTER_ICONS = { fire: 1, earth: 1, ice: 1, wind: 1 };
  function elementIcon(el) {
    var k = String(el || 'neutral').toLowerCase();
    return RASTER_ICONS[k] ? '/img/elements/element-' + k + '-96.webp' : '/img/elements/element-' + k + '.svg';
  }

  function rosterCard(id) {
    var list = (state.run && state.run.rosterCards) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function itemDef(id) {
    var defs = (state.run && state.run.itemDefs) || [];
    for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i];
    return null;
  }

  // Notch dots on a placed card's edges, so links between neighbours read at a glance.
  var NOTCH_SIDES = { TOP: 'top', BOTTOM: 'bottom', LEFT: 'left', RIGHT: 'right' };
  function notchesHtml(c) {
    var list = (c && c.card && c.card.notches) || [];
    return list.map(function (n) {
      var side = NOTCH_SIDES[String(n.direction || '').toUpperCase()];
      if (!side) return '';
      return '<i class="cm-notch is-' + side + '" style="background-image:url(/img/notches/notch-' +
        esc(String(n.element || 'neutral').toLowerCase()) + '.webp)"></i>';
    }).join('');
  }

  /** The real card face (frame, notches, art) from the shared renderer, or '' without it. */
  function cardFace(c) {
    var v = window.SieglingsCardBinderVisual;
    if (!v || !v.renderBinderCardTile || !c || !c.card) return '';
    try { return v.renderBinderCardTile(c.card, { summaryMode: 'description', descriptionText: '' }) || ''; }
    catch (e) { return ''; }
  }

  function renderPreset(run) {
    var max = run.arenaPartyMax || 5;
    state.formation = {};
    (run.arenaPreset || []).slice(0, max).forEach(function (id) {
      var cell = run.presetCells && run.presetCells[id];
      if (cell == null) return;
      state.formation[id] = cell;
    });
    state.formationPick = null;
    var el = String(run.starterElement || 'fire').toLowerCase();
    var wrap = $('cmBoardWrap');
    if (wrap) wrap.style.setProperty('--cm-board-art', 'url(/img/board-skins/board-' + el + '.webp)');
    drawFormation();
  }

  function formationIds() {
    return Object.keys(state.formation || {}).sort(function (a, b) {
      return state.formation[a] - state.formation[b];
    });
  }

  // ---- Formation rules (the Battle Table's own, via game.js when loaded) ----
  // Board row 2 is the front line and draws on top; TOP points toward row + 1.
  var VIS_ROWS = [2, 1, 0];
  var OPPOSITE = { TOP: 'BOTTOM', TOP_RIGHT: 'BOTTOM_LEFT', RIGHT: 'LEFT', BOTTOM_RIGHT: 'TOP_LEFT',
    BOTTOM: 'TOP', BOTTOM_LEFT: 'TOP_RIGHT', LEFT: 'RIGHT', TOP_LEFT: 'BOTTOM_RIGHT' };
  var DELTA = { TOP: [0, 1], TOP_RIGHT: [1, 1], RIGHT: [1, 0], BOTTOM_RIGHT: [1, -1],
    BOTTOM: [0, -1], BOTTOM_LEFT: [-1, -1], LEFT: [-1, 0], TOP_LEFT: [-1, 1] };
  // Notch position inside a card on EnergyService's half-cell point grid (x right, y up).
  var LOCAL = { TOP: [1, 2], TOP_RIGHT: [2, 2], RIGHT: [2, 1], BOTTOM_RIGHT: [2, 0],
    BOTTOM: [1, 0], BOTTOM_LEFT: [0, 0], LEFT: [0, 1], TOP_LEFT: [0, 2] };

  function notchesOf(id) {
    var c = rosterCard(id);
    return ((c && c.card && c.card.notches) || []).map(function (n) {
      return { direction: String(n.direction || '').toUpperCase(), element: String(n.element || 'NEUTRAL').toUpperCase() };
    });
  }

  /** The formation as a 3x3 board of {id, notches}, optionally leaving one unit out. */
  function formationBoard(excludeId) {
    var b = [[null, null, null], [null, null, null], [null, null, null]];
    formationIds().forEach(function (id) {
      if (id === excludeId) return;
      var cell = state.formation[id];
      b[Math.floor(cell / 3)][cell % 3] = { id: id, notches: notchesOf(id) };
    });
    return b;
  }

  function hasOpposite(notches, dir) {
    var want = OPPOSITE[dir];
    return (notches || []).some(function (n) { return n.direction === want; });
  }

  /** Reciprocal links on a board: one per card pair (as EnergyService counts them). */
  function formationLinks(board) {
    var links = [], pairs = {};
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var a = board[r][c];
      if (!a) continue;
      a.notches.forEach(function (n) {
        var d = DELTA[n.direction];
        if (!d) return;
        var nr = r + d[1], nc = c + d[0];
        if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
        var b = board[nr][nc];
        if (!b || !hasOpposite(b.notches, n.direction)) return;
        var key = Math.min(r * 3 + c, nr * 3 + nc) + '|' + Math.max(r * 3 + c, nr * 3 + nc);
        if (pairs[key]) return;
        pairs[key] = 1;
        var back = b.notches.filter(function (m) { return m.direction === OPPOSITE[n.direction]; })[0];
        var lp = LOCAL[n.direction];
        links.push({ r: r, c: c, nr: nr, nc: nc, dir: n.direction, ea: n.element, eb: back ? back.element : n.element,
          px: c * 2 + lp[0], py: r * 2 + lp[1] });
      });
    }
    return links;
  }

  /** Combo points: interior points where linked notches of two or more distinct elements meet. */
  function formationCombos(links) {
    var at = {};
    links.forEach(function (l) {
      if (l.px <= 0 || l.px >= 6 || l.py <= 0 || l.py >= 6) return;
      var k = l.px + ':' + l.py;
      (at[k] = at[k] || { links: [], elements: [] }).links.push(l);
      [l.ea, l.eb].forEach(function (e) { if (at[k].elements.indexOf(e) < 0) at[k].elements.push(e); });
    });
    return Object.keys(at).map(function (k) { return at[k]; }).filter(function (p) { return p.elements.length >= 2; });
  }

  /** Would `id` be legal on (r, c)? First unit anywhere; later ones must link or anchor a socket. */
  function placementGuide(id, r, c) {
    var board = formationBoard(id);
    var others = 0, b, x, y;
    for (y = 0; y < 3; y++) for (x = 0; x < 3; x++) if (board[y][x]) others++;
    var card = { notches: notchesOf(id) };
    var links = 0;
    card.notches.forEach(function (n) {
      var d = DELTA[n.direction];
      if (!d) return;
      var nr = r + d[1], nc = c + d[0];
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
      b = board[nr][nc];
      if (b && hasOpposite(b.notches, n.direction)) links++;
    });
    var socket = typeof window.canCardAnchorToSocket === 'function'
      ? window.canCardAnchorToSocket(card, r, c)
      : card.notches.some(function (n) { return (c === 0 && n.direction === 'LEFT') || (c === 2 && n.direction === 'RIGHT') || (r === 0 && n.direction === 'BOTTOM'); });
    var linked = typeof window.canCardLinkAt === 'function' ? window.canCardLinkAt(card, r, c, board) : links > 0;
    return { links: links, socket: socket, legal: others === 0 || linked || socket };
  }

  function drawFormation() {
    var run = state.run || {};
    var max = run.arenaPartyMax || 5;
    var at = {};
    formationIds().forEach(function (id) { at[state.formation[id]] = id; });
    var pick = state.formationPick;
    var board = $('cmBoard');
    var cells = [];
    var ROW_NAMES = { 2: 'Front', 1: 'Middle', 0: 'Back' };
    VIS_ROWS.forEach(function (r) {
      cells.push('<span class="cm-row-label" aria-hidden="true">' + ROW_NAMES[r] + '</span>');
      for (var col = 0; col < 3; col++) {
        var cell = r * 3 + col;
        var id = at[cell];
        var c = id ? rosterCard(id) : null;
        var picked = pick && pick === id;
        var guide = pick && !id ? placementGuide(pick, r, col) : null;
        var face = c ? cardFace(c) : '';
        cells.push('<button type="button" class="cm-cell' + (c ? ' has-unit' : '') + (face ? ' has-face' : '') + (picked ? ' is-picked' : '') +
          (r === 2 ? ' is-front' : '') + (guide ? (guide.legal ? ' is-legal' : ' is-illegal') + (guide.links ? ' is-linking' : '') : '') +
          '" data-cell="' + cell + '" role="gridcell" aria-label="' + (c ? esc(c.name) : 'Empty square') + '">' +
          (c ? (face ? '<span class="cm-cell-face" data-drag="' + esc(id) + '">' + face + '</span>'
            : '<span class="cm-cell-unit" data-drag="' + esc(id) + '" style="--cm-el-c:' + elColor(c.element) + '">' + notchesHtml(c) +
              '<span class="cm-fig">' + figureHtml(c, 240, !picked) + '</span>' +
              '<b>' + esc(c.name) + '</b></span>') : '<span class="cm-cell-empty" aria-hidden="true">+</span>') +
          (guide ? '<span class="cm-guide">' + (guide.links ? '🔗 ' + guide.links + ' link' + (guide.links > 1 ? 's' : '')
            : guide.socket ? '⚓ socket' : guide.legal ? 'open' : 'no link') + '</span>' : '') +
          '</button>');
      }
    });
    board.innerHTML = cells.join('') + '<svg class="cm-links" aria-hidden="true"></svg>';
    fitCutouts(board);
    drawLinks();
    var placed = formationIds().length;
    $('cmPreCount').textContent = placed + '/' + max;
    $('cmPresetSave').disabled = placed === 0;
    var bench = $('cmBench');
    bench.innerHTML = (run.rosterCards || []).map(function (c) {
      var on = state.formation[c.id] != null;
      var item = itemDef((run.equipped || {})[c.id]);
      var face = cardFace(c);
      return '<button type="button" class="cm-bench-card' + (face ? ' has-face' : '') + (on ? ' is-on' : '') +
        (pick === c.id ? ' is-picked' : '') + '" data-bench="' + esc(c.id) + '" data-drag="' + esc(c.id) + '" role="option" aria-selected="' + on + '"' +
        ' style="--cm-el-c:' + elColor(c.element) + '">' +
        (face ? '<span class="cm-bench-face">' + face + '</span>'
          : '<span class="cm-fig">' + figureHtml(c, 240, true) + '</span><b>' + esc(c.name) + '</b>' +
            '<small><img src="' + elementIcon(c.element) + '" alt="">' + esc(String(c.rarity || '').toLowerCase()) + '</small>') +
        (item ? '<i class="cm-bench-item" title="' + esc(item.name) + '">' + esc(item.icon) + '</i>' : '') +
        (on ? '<em>On board</em>' : '') + '</button>';
    }).join('');
    fitCutouts(bench);
    var hint = $('cmPreHint');
    if (pick) {
      var pc = rosterCard(pick);
      hint.innerHTML = 'Drop <b>' + esc(pc ? pc.name : '') + '</b> on a square: 🔗 squares link its notches' +
        (state.formation[pick] != null ? ', or <button type="button" class="cm-linkbtn" data-unplace>bench it</button>.' : '.');
    } else {
      hint.innerHTML = linkSummary() || (placed >= max ? 'Team full. Drag a card to move it, or onto the bench to remove it.'
        : 'Drag a card onto the board (or tap it, then a square). The front row faces the enemy.');
    }
  }

  function linkSummary() {
    var links = formationLinks(formationBoard(null));
    if (!links.length) return '';
    var same = links.filter(function (l) { return l.ea === l.eb; }).length;
    var combos = formationCombos(links);
    return '<span class="cm-link-sum">🔗 <b>' + links.length + '</b> link' + (links.length > 1 ? 's' : '') +
      (same ? ' · ' + same + ' energy' : '') +
      (combos.length ? ' · ✦ <b>' + combos.length + '</b> combo' + (combos.length > 1 ? 's' : '') + ' (' +
        combos.map(function (p) { return p.elements.map(function (e) { return e.charAt(0) + e.slice(1).toLowerCase(); }).join('+'); }).join(', ') + ')' : '') +
      '</span>';
  }

  /** Link and combo overlay: a glowing bridge across the gap for every reciprocal link. */
  function drawLinks() {
    var board = $('cmBoard');
    var svg = board && board.querySelector('.cm-links');
    if (!svg) return;
    var box = board.getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
    var rects = {};
    Array.prototype.forEach.call(board.querySelectorAll('[data-cell]'), function (el) {
      var r = el.getBoundingClientRect();
      rects[el.getAttribute('data-cell')] = { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top };
    });
    function anchor(cell, dir) {
      var q = rects[cell];
      if (!q) return null;
      var cx = (q.l + q.r) / 2, cy = (q.t + q.b) / 2;
      var x = dir.indexOf('LEFT') >= 0 ? q.l : dir.indexOf('RIGHT') >= 0 ? q.r : cx;
      var y = dir.indexOf('TOP') === 0 ? q.t : dir.indexOf('BOTTOM') === 0 ? q.b : cy;
      return { x: x, y: y };
    }
    var links = formationLinks(formationBoard(null));
    var combos = formationCombos(links);
    var comboKey = {};
    combos.forEach(function (p) { p.links.forEach(function (l) { comboKey[l.r + ',' + l.c + ',' + l.nr + ',' + l.nc] = p; }); });
    var defs = '', body = '';
    links.forEach(function (l, i) {
      var a = anchor(l.r * 3 + l.c, l.dir), b = anchor(l.nr * 3 + l.nc, OPPOSITE[l.dir]);
      if (!a || !b) return;
      // Reach 10px into both cards so the bridge reads across a narrow gap.
      var len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      var ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      a = { x: a.x - ux * 10, y: a.y - uy * 10 };
      b = { x: b.x + ux * 10, y: b.y + uy * 10 };
      var ca = elColor(l.ea.toLowerCase()), cb = elColor(l.eb.toLowerCase());
      var combo = !!comboKey[l.r + ',' + l.c + ',' + l.nr + ',' + l.nc];
      defs += '<linearGradient id="cmlg' + i + '" gradientUnits="userSpaceOnUse" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '">' +
        '<stop offset="0" style="stop-color:' + ca + '"/><stop offset="1" style="stop-color:' + cb + '"/></linearGradient>';
      body += '<g class="cm-link' + (combo ? ' is-combo' : l.ea === l.eb ? ' is-same' : '') + '">' +
        '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="url(#cmlg' + i + ')" class="cm-link-glow"/>' +
        '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="url(#cmlg' + i + ')" class="cm-link-core"/>' +
        '<circle cx="' + (a.x + b.x) / 2 + '" cy="' + (a.y + b.y) / 2 + '" r="5" fill="url(#cmlg' + i + ')" class="cm-link-node"/></g>';
    });
    combos.forEach(function (p) {
      var xs = 0, ys = 0, n = 0;
      p.links.forEach(function (l) {
        var a = anchor(l.r * 3 + l.c, l.dir), b = anchor(l.nr * 3 + l.nc, OPPOSITE[l.dir]);
        if (a && b) { xs += (a.x + b.x) / 2; ys += (a.y + b.y) / 2; n++; }
      });
      if (!n) return;
      var x = xs / n, y = ys / n;
      var stops = p.elements.map(function (e, i) {
        return '<stop offset="' + (i / Math.max(1, p.elements.length - 1)) + '" style="stop-color:' + elColor(e.toLowerCase()) + '"/>';
      }).join('');
      var gid = 'cmcg' + Math.round(x) + '_' + Math.round(y);
      defs += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' + stops + '</linearGradient>';
      body += '<g class="cm-combo" transform="translate(' + x + ' ' + y + ')">' +
        '<circle r="13" fill="url(#' + gid + ')" class="cm-combo-orb"/><text y="4" text-anchor="middle">✦' + p.elements.length + '</text></g>';
    });
    svg.innerHTML = '<defs>' + defs + '</defs>' + body;
  }

  function placeFormation(id, cell) {
    var max = (state.run && state.run.arenaPartyMax) || 5;
    var occupant = null;
    formationIds().forEach(function (x) { if (state.formation[x] === cell) occupant = x; });
    if (occupant === id) return;
    var wasPlaced = state.formation[id] != null;
    if (!wasPlaced && !occupant && formationIds().length >= max) {
      toast('Only ' + max + ' Siegelings take the field. Bench one first.');
      return;
    }
    if (occupant) {
      // Swap: the occupant takes the moved unit's old square (or goes to the bench).
      if (wasPlaced) state.formation[occupant] = state.formation[id];
      else delete state.formation[occupant];
    }
    state.formation[id] = cell;
  }

  function formationTap(target) {
    if (state.dragJustEnded) return true;
    var benchBtn = target.closest('[data-bench]');
    if (benchBtn) {
      var id = benchBtn.getAttribute('data-bench');
      state.formationPick = state.formationPick === id ? null : id;
      drawFormation();
      return true;
    }
    if (target.closest('[data-unplace]')) {
      if (state.formationPick) delete state.formation[state.formationPick];
      state.formationPick = null;
      drawFormation();
      return true;
    }
    var cellBtn = target.closest('[data-cell]');
    if (!cellBtn) return false;
    var cell = Number(cellBtn.getAttribute('data-cell'));
    var occupant = null;
    formationIds().forEach(function (x) { if (state.formation[x] === cell) occupant = x; });
    var pick = state.formationPick;
    if (!pick) {
      // Tapping a placed unit picks it up to move.
      state.formationPick = occupant;
      drawFormation();
      return true;
    }
    if (occupant === pick) { state.formationPick = null; drawFormation(); return true; }
    placeFormation(pick, cell);
    state.formationPick = null;
    drawFormation();
    return true;
  }

  // ---- Drag and drop: bench → board, board → board, board → bench ----
  // Bench cards start a drag on an upward pull (sideways swipes keep scrolling the
  // strip); placed cards drag in any direction. A tap still works as pick-then-place.
  function bindFormationDrag() {
    var screen = $('screenPreset');
    var drag = null;
    function cellAt(x, y) {
      var el = document.elementFromPoint(x, y);
      return el && el.closest ? el.closest('#cmBoard [data-cell]') : null;
    }
    screen.addEventListener('pointerdown', function (ev) {
      var src = ev.target.closest('[data-drag]');
      // Faces inside cells ignore the pointer, so a press on a placed card lands on its cell.
      if (!src) {
        var cellEl = ev.target.closest('#cmBoard .cm-cell.has-unit');
        src = cellEl && cellEl.querySelector('[data-drag]');
      }
      if (!src || ev.button > 0) return;
      drag = { id: src.getAttribute('data-drag'), fromBench: !!src.closest('#cmBench'), x: ev.clientX, y: ev.clientY,
        pointer: ev.pointerId, src: src, active: false, ghost: null, over: null };
    });
    screen.addEventListener('pointermove', function (ev) {
      if (!drag || ev.pointerId !== drag.pointer) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dx) + Math.abs(dy) < 10) return;
        if (drag.fromBench && Math.abs(dx) > Math.abs(dy)) { drag = null; return; }
        drag.active = true;
        state.formationPick = drag.id;
        var face = drag.src.closest('.cm-bench-card, .cm-cell') || drag.src;
        var r = face.getBoundingClientRect();
        var ghost = face.cloneNode(true);
        ghost.classList.add('cm-drag-ghost');
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        drag.offX = r.width / 2;
        drag.offY = r.height * 0.6;
        drawFormation();
        try { screen.setPointerCapture(ev.pointerId); } catch (e) { /* older Safari */ }
      }
      ev.preventDefault();
      drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.offX) + 'px,' + (ev.clientY - drag.offY) + 'px) rotate(-3deg)';
      var over = cellAt(ev.clientX, ev.clientY);
      if (over !== drag.over) {
        if (drag.over) drag.over.classList.remove('is-drop');
        if (over) over.classList.add('is-drop');
        drag.over = over;
      }
    }, { passive: false });
    function end(ev) {
      if (!drag || (ev && ev.pointerId !== drag.pointer)) return;
      var d = drag;
      drag = null;
      if (!d.active) return;
      if (d.ghost) d.ghost.remove();
      var target = ev && ev.type === 'pointerup' ? cellAt(ev.clientX, ev.clientY) : null;
      var overBench = ev && ev.type === 'pointerup' && (function () {
        var el = document.elementFromPoint(ev.clientX, ev.clientY);
        return !!(el && el.closest && el.closest('#cmBench'));
      })();
      if (target) placeFormation(d.id, Number(target.getAttribute('data-cell')));
      else if (overBench && !d.fromBench) delete state.formation[d.id];
      state.formationPick = null;
      // The click that follows a drop must not act as a tap.
      state.dragJustEnded = true;
      setTimeout(function () { state.dragJustEnded = false; }, 60);
      drawFormation();
    }
    screen.addEventListener('pointerup', end);
    screen.addEventListener('pointercancel', end);
    window.addEventListener('resize', function () { if (document.body.dataset.screen === 'preset') drawLinks(); });
  }

  function openPresetFrom(battle, foeName) {
    state.preBattle = battle || null;
    closeMenu();
    setOverworldActive(false);
    renderPreset(state.run);
    $('cmPreEyebrow').textContent = battle ? 'Before the duel' : 'ArenaTeam formation';
    $('cmPreTitle').innerHTML = battle ? 'Your ArenaTeam vs <b>' + esc(foeName || 'the foe') + '</b>'
      : 'Place up to ' + (state.run.arenaPartyMax || 5) + ' Siegelings';
    $('cmPresetSave').textContent = battle ? 'Fight!' : 'Save ArenaTeam';
    show('preset');
  }

  /** Arena battles start from the formation: check the ArenaTeam, then Fight. */
  function openPreBattle(battle, foeName) {
    openPresetFrom(battle, foeName);
  }

  function returnFromPreset(run) {
    renderWalking(run || state.run);
  }

  // ---- Rally menu (opened from the shield FAB) ------------------------------

  var MENU_ITEMS = [
    { id: 'siegelings', title: 'Box & Bag', sub: 'Siegelings, items', icon: '◈' },
    { id: 'codex', title: 'CoDex', sub: 'Every Siegeling', icon: '❖' },
    { id: 'squire', title: 'Squire', sub: 'Knight level', icon: '⚔' },
    { id: 'journal', title: 'Journal', sub: 'Quests & log', icon: '✎' },
    { id: 'sigils', title: 'Sigils', sub: 'Legendary trials', icon: '✦' },
    { id: 'settings', title: 'Settings', sub: 'Colour & filters', icon: '⚙' },
    { id: 'site', title: 'Main menu', sub: 'Leave to the hub', icon: '⌂' }
  ];

  function menuOpen() { var m = $('cmMenu'); return !!(m && !m.hidden); }

  function openMenu(panel) {
    if (!state.run) return false;
    var m = $('cmMenu');
    m.hidden = false;
    document.body.classList.add('cm-menu-open');
    setOverworldActive(false);
    menuPanel(panel || 'home');
    return true;
  }

  function closeMenu() {
    var m = $('cmMenu');
    if (!m || m.hidden) return;
    m.hidden = true;
    document.body.classList.remove('cm-menu-open');
    var screen = document.body.dataset.screen;
    if (screen === 'world' || screen === 'land') setOverworldActive(true);
  }

  function menuPanel(id) {
    state.menuPanel = id;
    var body = $('cmMenuBody');
    var title = $('cmMenuTitle'), eyebrow = $('cmMenuEyebrow');
    $('cmMenuBack').hidden = id === 'home';
    var run = state.run || {};
    var html = '';
    if (id === 'home') {
      title.textContent = 'SiegelinQ';
      eyebrow.textContent = squireName(run) + ' · Lv ' + (run.level || 1);
      html = teamsHtml(run) + akharCta(run) + '<div class="cm-menu-grid">' + MENU_ITEMS.map(function (it) {
        return '<button type="button" class="cm-menu-tile is-' + it.id + '" data-panel="' + it.id + '">' +
          '<span class="cm-menu-ico" aria-hidden="true">' + it.icon + '</span>' +
          '<b>' + it.title + '</b><small>' + it.sub + '</small></button>';
      }).join('') + '</div>' + menuStatus(run);
    } else if (id === 'follower') {
      title.textContent = 'Follower'; eyebrow.textContent = 'SiegelinQ';
      html = followerPanel(run);
    } else if (id === 'squad') {
      title.textContent = 'SiegeSquad'; eyebrow.textContent = 'SiegelinQ · Siege battles';
      html = squadPanel(run);
    } else if (id === 'siegelings') {
      title.textContent = 'Box & Bag'; eyebrow.textContent = 'Siegelings & items';
      html = siegelingsPanel(run);
    } else if (id.indexOf('mon:') === 0) {
      var c = rosterCard(id.slice(4));
      title.textContent = c ? c.name : 'Siegeling'; eyebrow.textContent = 'Siegeling';
      html = siegelingDetail(run, c);
    } else if (id === 'codex') {
      title.textContent = 'CoDex'; eyebrow.textContent = 'Every Siegeling';
      html = '<p class="cm-muted cm-center-pad">Opening the CoDex…</p>';
      loadCodex();
    } else if (id.indexOf('dex:') === 0) {
      title.textContent = 'CoDex'; eyebrow.textContent = 'Entry';
      html = codexDetail(id.slice(4));
    } else if (id === 'squire') {
      title.textContent = 'Squire Bob'; eyebrow.textContent = 'SiegeKnight';
      html = squirePanel(run);
    } else if (id === 'journal') {
      title.textContent = 'Journal'; eyebrow.textContent = 'Quests & log';
      html = journalPanel(run);
    } else if (id === 'sigils') {
      title.textContent = 'Sigils'; eyebrow.textContent = 'Council of Realms';
      html = sigilsPanel(run);
    } else if (id === 'settings') {
      title.textContent = 'Settings'; eyebrow.textContent = 'Look & feel';
      html = settingsPanel();
    }
    body.innerHTML = html;
    body.scrollTop = 0;
    fitCutouts(body);
  }

  // ---- SiegelinQ teams: Follower, ArenaTeam (Battle Table), SiegeSquad (Siege mode) ----

  function minis(ids, slots) {
    var out = [];
    for (var i = 0; i < slots; i++) {
      var c = ids[i] ? rosterCard(ids[i]) : null;
      out.push('<span class="cm-mini' + (c ? '' : ' is-empty') + '">' + (c ? '<span class="cm-fig">' + figureHtml(c, 240, true) + '</span>' : '') + '</span>');
    }
    return out.join('');
  }

  function teamsHtml(run) {
    var follower = rosterCard(run.followerId) || rosterCard(run.starterId);
    var arena = run.arenaPreset || [];
    var squad = run.siegeSquad || [null, null, null];
    var placed = squad.filter(Boolean).length;
    return '<h3 class="cm-menu-h">Teams</h3><div class="cm-teams">' +
      '<button type="button" class="cm-team is-follower" data-panel="follower">' +
        '<span class="cm-team-art">' + (follower ? '<span class="cm-fig">' + figureHtml(follower, 240) + '</span>' : '') + '</span>' +
        '<span class="cm-team-txt"><b>Follower</b><small>' + esc(follower ? follower.name : 'None') + ' walks with Bob</small></span></button>' +
      '<button type="button" class="cm-team is-arena" data-panel="formation">' +
        '<span class="cm-team-row">' + minis(arena, run.arenaPartyMax || 5) + '</span>' +
        '<span class="cm-team-txt"><b>ArenaTeam</b><small>' + arena.length + '/' + (run.arenaPartyMax || 5) + ' placed · Battle Table</small></span></button>' +
      '<button type="button" class="cm-team is-squad" data-panel="squad">' +
        '<span class="cm-team-row is-3">' + minis(squad, run.siegeSquadMax || 3) + '</span>' +
        '<span class="cm-team-txt"><b>SiegeSquad</b><small>' + placed + '/' + (run.siegeSquadMax || 3) + ' · Left · Center · Right</small></span></button>' +
      '</div>';
  }

  function akharCta(run) {
    if (!run.akharUnlocked || run.phase === 'VICTORY') return '';
    return '<button type="button" class="cm-menu-cta cm-akhar-cta" data-akhar>Challenge Raidlord Akhar</button>';
  }

  function followerPanel(run) {
    var list = run.rosterCards || [];
    var current = run.followerId || run.starterId;
    return '<p class="cm-muted">The Siegeling that walks behind Bob through the Sanctuary, the Wildlands and every Land.</p>' +
      '<div class="cm-mon-grid">' + list.map(function (c) {
        return monTile(c, run, c.id === current ? ' is-party' : '').replace('data-panel="mon:' + esc(c.id) + '"', 'data-follow="' + esc(c.id) + '"')
          .replace('</button>', (c.id === current ? '<em class="cm-mon-badge">Following</em>' : '') + '</button>');
      }).join('') + '</div>';
  }

  var SQUAD_SLOTS = ['Left', 'Center', 'Right'];
  function squadPanel(run) {
    if (!state.squadDraft) state.squadDraft = (run.siegeSquad || [null, null, null]).slice(0, 3);
    while (state.squadDraft.length < 3) state.squadDraft.push(null);
    var draft = state.squadDraft;
    var sel = state.squadSlot == null ? null : state.squadSlot;
    var list = run.rosterCards || [];
    return '<p class="cm-muted">Your three for Siege battles in the wilds. Tap a slot, then a Siegeling. Order matters: enemies aim at positions.</p>' +
      '<div class="cm-squad">' + SQUAD_SLOTS.map(function (label, i) {
        var c = draft[i] ? rosterCard(draft[i]) : null;
        return '<button type="button" class="cm-squad-slot' + (sel === i ? ' is-picked' : '') + (c ? '' : ' is-empty') + '" data-squad-slot="' + i + '"' +
          (c ? ' style="--cm-el-c:' + elColor(c.element) + '"' : '') + '>' +
          '<span class="cm-squad-pos">' + label + '</span>' +
          '<span class="cm-fig">' + (c ? figureHtml(c, 240) : '') + '</span>' +
          '<b>' + (c ? esc(c.name) : 'Empty') + '</b>' +
          (c ? '<small>HP ' + esc(c.health != null ? c.health : '?') + ' · SPD ' + esc(c.speed != null ? c.speed : '?') + '</small>' : '<small>Tap, then pick</small>') +
          '</button>';
      }).join('') + '</div>' +
      (sel != null && draft[sel] ? '<button type="button" class="cm-linkbtn cm-squad-clear" data-squad-clear>Empty the ' + SQUAD_SLOTS[sel].toLowerCase() + ' slot</button>' : '') +
      '<h3 class="cm-menu-h">' + (sel != null ? 'Pick for ' + SQUAD_SLOTS[sel] : 'Your Siegelings') + '</h3>' +
      '<div class="cm-mon-grid">' + list.map(function (c) {
        var at = draft.indexOf(c.id);
        return monTile(c, run, at >= 0 ? ' is-party' : '').replace('data-panel="mon:' + esc(c.id) + '"', 'data-squad-pick="' + esc(c.id) + '"')
          .replace('</button>', (at >= 0 ? '<em class="cm-mon-badge">' + SQUAD_SLOTS[at] + '</em>' : '') + '</button>');
      }).join('') + '</div>' +
      '<button type="button" class="cm-menu-cta" data-squad-save>Save SiegeSquad</button>';
  }

  function squadTap(t) {
    var slot = t.closest('[data-squad-slot]');
    if (slot) {
      var i = Number(slot.getAttribute('data-squad-slot'));
      state.squadSlot = state.squadSlot === i ? null : i;
      menuPanel('squad');
      return true;
    }
    if (t.closest('[data-squad-clear]')) {
      if (state.squadSlot != null) state.squadDraft[state.squadSlot] = null;
      menuPanel('squad');
      return true;
    }
    var pick = t.closest('[data-squad-pick]');
    if (pick) {
      var id = pick.getAttribute('data-squad-pick');
      var draft = state.squadDraft;
      var target = state.squadSlot;
      if (target == null) {
        // No slot picked: fill the first empty one, center first.
        [1, 0, 2].some(function (k) { if (!draft[k]) { target = k; return true; } return false; });
        if (target == null) { toast('Pick a slot to swap into first.'); return true; }
      }
      var from = draft.indexOf(id);
      if (from >= 0) draft[from] = draft[target];
      draft[target] = id;
      state.squadSlot = null;
      menuPanel('squad');
      return true;
    }
    if (t.closest('[data-squad-save]')) {
      var slots = state.squadDraft.slice(0, 3);
      busy(function () {
        return api('/api/campaign/squad', { method: 'POST', body: { slots: slots } }).then(function (run) {
          state.run = run;
          state.squadDraft = null;
          toast('SiegeSquad saved.');
          menuPanel('home');
        });
      });
      return true;
    }
    return false;
  }

  function squireName(run) {
    var n = String((run && run.playerName) || '').trim();
    return !n || /^squire$/i.test(n) ? 'Squire Bob' : n;
  }

  function menuStatus(run) {
    var sig = (run.sigils || []).filter(function (x) { return x.earned; }).length;
    return '<div class="cm-menu-status">' +
      '<span><b>' + (run.gold || 0) + '</b> gold</span>' +
      '<span><b>' + (run.roster || []).length + '</b> Siegelings</span>' +
      '<span><b>' + (run.ralliedLandIds || []).length + '/' + (run.ralliesToUnlockAkhar || 4) + '</b> realms</span>' +
      '<span><b>' + sig + '/' + (run.sigils || []).length + '</b> sigils</span></div>';
  }

  function monTile(c, run, extra) {
    var item = itemDef((run.equipped || {})[c.id]);
    return '<button type="button" class="cm-mon' + (extra || '') + '" data-panel="mon:' + esc(c.id) + '" style="--cm-el-c:' + elColor(c.element) + '">' +
      '<span class="cm-fig">' + figureHtml(c, 240, true) + '</span>' +
      '<span class="cm-mon-txt"><b>' + esc(c.name) + '</b>' +
      '<small><img src="' + elementIcon(c.element) + '" alt="">' + esc(String(c.element || '').toLowerCase()) +
      ' · ' + esc(String(c.rarity || '').toLowerCase()) + '</small>' +
      '<small>HP ' + esc(c.health != null ? c.health : '?') + ' · SPD ' + esc(c.speed != null ? c.speed : '?') + '</small></span>' +
      (item ? '<span class="cm-mon-item" title="' + esc(item.name) + '">' + esc(item.icon) + '</span>' : '') + '</button>';
  }

  function siegelingsPanel(run) {
    var party = (run.arenaPreset || []).map(rosterCard).filter(Boolean);
    var bench = (run.rosterCards || []).filter(function (c) { return (run.arenaPreset || []).indexOf(c.id) < 0; });
    var slots = [];
    for (var i = 0; i < (run.arenaPartyMax || 3); i++) {
      slots.push(party[i] ? monTile(party[i], run, ' is-party') :
        '<button type="button" class="cm-mon is-empty" data-panel="formation"><span class="cm-fig"></span><span class="cm-mon-txt"><b>Empty slot</b><small>Add one in Formation</small></span></button>');
    }
    var bag = (run.items || []);
    return '<h3 class="cm-menu-h">ArenaTeam</h3><div class="cm-mon-list">' + slots.join('') + '</div>' +
      '<h3 class="cm-menu-h">Box <span>' + bench.length + '</span></h3>' +
      (bench.length ? '<div class="cm-mon-grid">' + bench.map(function (c) { return monTile(c, run); }).join('') + '</div>'
        : '<p class="cm-muted">Catch wild Siegelings in the Wildlands and the Lands to fill your box.</p>') +
      '<h3 class="cm-menu-h">Bag <span>' + bag.length + '</span></h3>' + bagHtml(bag, null);
  }

  function bagHtml(bag, forCard) {
    if (!bag.length) return '<p class="cm-muted">No spare items. Wins can drop items to hold.</p>';
    var counts = {};
    bag.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    return '<div class="cm-bag">' + Object.keys(counts).map(function (id) {
      var d = itemDef(id) || { name: id, icon: '?', effect: '' };
      var tag = forCard ? 'button type="button" data-equip="' + esc(id) + '" data-for="' + esc(forCard) + '"' : 'div';
      return '<' + tag + ' class="cm-item rarity-' + esc(String(d.rarity || 'common').toLowerCase()) + '">' +
        '<span class="cm-item-ico">' + esc(d.icon) + '</span><span><b>' + esc(d.name) +
        (counts[id] > 1 ? ' ×' + counts[id] : '') + '</b><small>' + esc(d.effect) + '</small></span>' +
        (forCard ? '<em>Give</em>' : '') + '</' + (forCard ? 'button' : 'div') + '>';
    }).join('') + '</div>';
  }

  function siegelingDetail(run, c) {
    if (!c) return '<p class="cm-muted">That Siegeling is not in your roster.</p>';
    var card = c.card || {};
    var held = itemDef((run.equipped || {})[c.id]);
    var inParty = (run.arenaPreset || []).indexOf(c.id) >= 0;
    var moves = (card.moves || []).slice(0, 4).map(function (m) {
      return '<li><b>' + esc(m.name || m.id || 'Move') + '</b>' + (m.description ? '<small>' + esc(m.description) + '</small>' : '') + '</li>';
    }).join('');
    return '<div class="cm-detail" style="--cm-el-c:' + elColor(c.element) + '">' +
      '<div class="cm-detail-art"><span class="cm-fig is-hero">' + figureHtml(c, 480) + '</span></div>' +
      '<div class="cm-detail-meta"><span class="cm-el" style="color:' + elColor(c.element) + '">' + esc(c.element) + '</span>' +
      '<span class="cm-chip">' + esc(String(c.rarity || '').toLowerCase()) + '</span>' +
      (inParty ? '<span class="cm-chip is-gold">In party</span>' : '') + '</div>' +
      '<div class="cm-stats-row"><span><b>' + esc(c.health != null ? c.health : '?') + '</b>Health</span>' +
      '<span><b>' + esc(c.speed != null ? c.speed : '?') + '</b>Speed</span>' +
      '<span><b>' + ((card.notches || []).length) + '</b>Notches</span></div>' +
      (moves ? '<h3 class="cm-menu-h">Moves</h3><ul class="cm-moves">' + moves + '</ul>' : '') +
      '<h3 class="cm-menu-h">Held item</h3>' +
      (held ? '<div class="cm-item rarity-' + esc(String(held.rarity || 'common').toLowerCase()) + '"><span class="cm-item-ico">' + esc(held.icon) +
        '</span><span><b>' + esc(held.name) + '</b><small>' + esc(held.effect) + '</small></span>' +
        '<button type="button" class="cm-linkbtn" data-equip="" data-for="' + esc(c.id) + '">Take back</button></div>'
        : '<p class="cm-muted">Holding nothing.</p>') +
      '<h3 class="cm-menu-h">Give an item</h3>' + bagHtml(run.items || [], c.id) +
      '<button type="button" class="cm-menu-cta" data-panel="formation">' + (inParty ? 'Move in Formation' : 'Add to party in Formation') + '</button>' +
      '</div>';
  }

  function loadCodex() {
    var done = function (dex) {
      state.codex = dex;
      if (state.menuPanel === 'codex') $('cmMenuBody').innerHTML = codexPanel(dex);
      fitCutouts($('cmMenuBody'));
    };
    api('/api/campaign/codex').then(done).catch(function (e) {
      if (state.menuPanel === 'codex') $('cmMenuBody').innerHTML = '<p class="cm-muted">' + esc(e.message || 'The CoDex is unavailable.') + '</p>';
    });
  }

  function codexEntry(id) {
    var list = (state.codex && state.codex.entries) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // Unknown Siegelings are silhouettes: same figure, blacked out, element still shown.
  function dexFigure(e, width) {
    return '<span class="cm-fig' + (e.status === 'unknown' ? ' is-silhouette' : '') + '">' + figureHtml(e, width || 240, true) + '</span>';
  }

  function codexPanel(dex) {
    var filter = state.codexFilter || 'all';
    var entries = (dex.entries || []).slice();
    var elements = [];
    entries.forEach(function (e) { var k = String(e.element || '').toLowerCase(); if (k && elements.indexOf(k) < 0) elements.push(k); });
    if (filter !== 'all') entries = entries.filter(function (e) { return String(e.element || '').toLowerCase() === filter; });
    return '<div class="cm-dex-top"><span><b>' + dex.caught + '</b> caught</span><span><b>' + dex.seen + '</b> seen</span><span><b>' + dex.total + '</b> total</span></div>' +
      '<div class="cm-dex-filters">' + ['all'].concat(elements).map(function (k) {
        return '<button type="button" class="cm-dex-f' + (k === filter ? ' is-on' : '') + '" data-dexf="' + k + '">' +
          (k === 'all' ? 'All' : '<img src="' + elementIcon(k) + '" alt="' + k + '">') + '</button>';
      }).join('') + '</div>' +
      '<div class="cm-dex-grid">' + entries.map(function (e, i) {
        var known = e.status !== 'unknown';
        return '<button type="button" class="cm-dex is-' + e.status + '" data-panel="dex:' + esc(e.id) + '" style="--cm-el-c:' + elColor(e.element) + '">' +
          '<span class="cm-dex-no">#' + String(i + 1).padStart(3, '0') + '</span>' + dexFigure(e) +
          '<b>' + (known ? esc(e.name) : '???') + '</b>' +
          '<small><img src="' + elementIcon(e.element) + '" alt="">' + (e.status === 'caught' ? '● caught' : known ? '○ seen' : '') + '</small></button>';
      }).join('') + '</div>';
  }

  function codexDetail(id) {
    var e = codexEntry(id);
    if (!e) return '<p class="cm-muted">Unknown entry.</p>';
    var known = e.status !== 'unknown';
    var chain = [];
    var from = e.evolvesFromId ? codexEntry(e.evolvesFromId) : null;
    var prev = from && from.evolvesFromId ? codexEntry(from.evolvesFromId) : null;
    if (prev) chain.push(prev);
    if (from) chain.push(from);
    chain.push(e);
    (e.evolvesTo || []).forEach(function (n) {
      var x = codexEntry(n);
      if (x) { chain.push(x); (x.evolvesTo || []).forEach(function (m) { var y = codexEntry(m); if (y) chain.push(y); }); }
    });
    return '<div class="cm-detail" style="--cm-el-c:' + elColor(e.element) + '">' +
      '<div class="cm-detail-art">' + dexFigure(e, 480).replace('cm-fig', 'cm-fig is-hero') + '</div>' +
      '<h3 class="cm-dex-name">' + (known ? esc(e.name) : '???') + '</h3>' +
      '<div class="cm-detail-meta"><span class="cm-el" style="color:' + elColor(e.element) + '">' + esc(e.element) + '</span>' +
      '<span class="cm-chip">' + esc(String(e.rarity || '').toLowerCase()) + '</span>' +
      '<span class="cm-chip' + (e.status === 'caught' ? ' is-gold' : '') + '">' + (e.status === 'caught' ? 'Caught' : known ? 'Seen' : 'Not found yet') + '</span></div>' +
      (known ? '<div class="cm-stats-row"><span><b>' + esc(e.health) + '</b>Health</span><span><b>' + esc(e.speed) + '</b>Speed</span></div>' : '') +
      (chain.length > 1 ? '<h3 class="cm-menu-h">Evolution line</h3><div class="cm-evo">' + chain.map(function (x, i) {
        return (i ? '<span class="cm-evo-arrow" aria-hidden="true">›</span>' : '') +
          '<button type="button" class="cm-evo-step' + (x.id === e.id ? ' is-here' : '') + '" data-panel="dex:' + esc(x.id) + '">' +
          dexFigure(x) + '<small>' + (x.status !== 'unknown' ? esc(x.name) : '???') + '</small></button>';
      }).join('') + '</div>' : '') +
      '<p class="cm-muted">' + (e.status === 'caught' ? 'Part of your roster.' : known ? 'Seen in battle. Catch it in the wilds of its Land.'
        : 'Not met yet. Look for it where ' + esc(String(e.element || '').toLowerCase()) + ' Siegelings roam.') + '</p></div>';
  }

  function squirePanel(run) {
    var sq = run.squire || {};
    var xpNeed = run.xpToNext || 0;
    var pct = xpNeed ? Math.min(100, Math.round(100 * (run.xp || 0) / xpNeed)) : 100;
    var passive = sq.passive || null, active = sq.active || null;
    var caught = (run.roster || []).length;
    var sig = (run.sigils || []).filter(function (x) { return x.earned; }).length;
    return '<div class="cm-squire">' +
      '<div class="cm-squire-card"><img src="/img/sprites/squire-bob/down-idle.webp" alt="Squire Bob" width="160" height="200">' +
      '<div><span class="cm-eyebrow">SiegeKnight</span><h3>' + esc(squireName(run)) + '</h3>' +
      '<div class="cm-level"><b>Lv ' + (run.level || 1) + '</b><span class="cm-xpbar"><i style="width:' + pct + '%"></i></span>' +
      '<small>' + (xpNeed ? (run.xp || 0) + ' / ' + xpNeed + ' XP' : 'Max level') + '</small></div>' +
      '<p class="cm-muted">Each level adds +1 to Bob’s passive and active ability in Arena battles.</p></div></div>' +
      (passive ? '<div class="cm-ability"><span class="cm-chip">Passive</span><b>' + esc(passive.name) + '</b><p>' + esc(passive.description) + '</p></div>' : '') +
      (active ? '<div class="cm-ability"><span class="cm-chip is-gold">Active</span><b>' + esc(active.name) + '</b><p>' + esc(active.description || '') + '</p></div>' : '') +
      '<div class="cm-stats-row is-4"><span><b>' + caught + '</b>Caught</span><span><b>' + (run.seenCount || 0) + '</b>Seen</span>' +
      '<span><b>' + (run.ralliedLandIds || []).length + '</b>Realms</span><span><b>' + sig + '</b>Sigils</span></div></div>';
  }

  function journalPanel(run) {
    var lands = run.lands || [];
    var quests = [];
    var rallies = (run.ralliedLandIds || []).length, need = run.ralliesToUnlockAkhar || 4;
    quests.push({ main: true, done: run.phase === 'VICTORY', title: 'Rally of the Realms',
      text: run.phase === 'VICTORY' ? 'Raidlord Akhar has fallen.' : rallies >= need ? 'Challenge Raidlord Akhar from the Sanctuary.'
        : 'Rally ' + need + ' realms by beating their SiegeKnights (' + rallies + '/' + need + ').', pct: Math.min(1, rallies / need) });
    lands.filter(function (l) { return l.unlocked || l.rallied; }).forEach(function (l) {
      var sig = (run.sigils || []).filter(function (x) { return x.landId === l.id; })[0];
      var step = l.rallied ? (sig && sig.earned ? 3 : 2) : l.rivalCleared ? 1 : 0;
      var next = !l.rivalCleared ? 'Beat the rival at the Rival Arena.' : !l.rallied ? 'Challenge the realm’s SiegeKnight.'
        : !(sig && sig.earned) ? 'Defeat ' + ((sig && sig.legendary && sig.legendary.name) || 'the Legendary') + ' at the shrine.' : 'Realm complete.';
      quests.push({ done: step >= 3, title: l.name, text: next, pct: step / 3, el: (l.elements || [])[0] });
    });
    var log = (run.journal || []).slice().reverse();
    return '<h3 class="cm-menu-h">Quests</h3><div class="cm-quests">' + quests.map(function (q) {
      return '<div class="cm-quest' + (q.main ? ' is-main' : '') + (q.done ? ' is-done' : '') + '"' + (q.el ? ' style="--cm-el-c:' + elColor(q.el) + '"' : '') + '>' +
        '<b>' + (q.done ? '✓ ' : '') + esc(q.title) + '</b><p>' + esc(q.text) + '</p>' +
        '<span class="cm-qbar"><i style="width:' + Math.round((q.pct || 0) * 100) + '%"></i></span></div>';
    }).join('') + '</div>' +
      '<h3 class="cm-menu-h">Log</h3>' + (log.length ? '<ol class="cm-log">' + log.map(function (e) {
        var d = new Date(e.at || 0);
        return '<li class="is-' + esc(e.kind || 'story') + '"><time>' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</time>' + esc(e.text) + '</li>';
      }).join('') + '</ol>' : '<p class="cm-muted">Your story starts here.</p>');
  }

  function sigilsPanel(run) {
    var list = run.sigils || [];
    var earned = list.filter(function (x) { return x.earned; }).length;
    return '<div class="cm-sigil-top"><span>Defeat each Land’s Legendary at its shrine to earn its Sigil.</span><b>' + earned + ' / ' + list.length + '</b></div>' +
      '<div class="cm-sigils">' + list.map(function (sg) {
        var lg = sg.legendary || { id: '', name: 'Legendary', element: sg.element };
        var status = sg.earned ? 'Earned' : sg.shrineOpen ? 'Defeat ' + lg.name : 'Beat ' + sg.landName + '’s rival';
        return '<div class="cm-sigil' + (sg.earned ? ' is-earned' : '') + '" style="--cm-el-c:' + elColor(sg.element) + '">' +
          '<img class="cm-sigil-el" src="' + elementIcon(sg.element) + '" alt="">' +
          (sg.earned ? '' : '<span class="cm-sigil-lock" aria-hidden="true">🔒</span>') +
          '<span class="cm-fig' + (sg.earned ? '' : ' is-silhouette') + '">' + figureHtml(lg, 240, true) + '</span>' +
          '<b>' + esc(sg.element.charAt(0).toUpperCase() + sg.element.slice(1)) + ' Sigil</b>' +
          '<small>' + esc(lg.name) + ' · ' + esc(sg.landName) + '</small>' +
          '<em>' + esc(status) + '</em></div>';
      }).join('') + '</div>';
  }

  // ---- Settings: accent colour + world filter (per device) ---------------------

  var ACCENTS = { gold: 'Gold', ember: 'Ember', frost: 'Frost', verdant: 'Verdant', violet: 'Violet', rose: 'Rose' };
  var FILTERS = { none: 'None', warm: 'Warm', cool: 'Cool', vivid: 'Vivid', dusk: 'Dusk', sepia: 'Sepia', noir: 'Noir' };

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem('cmSettings') || '{}') || {}; } catch (e) { return {}; }
  }

  function applySettings(cfg) {
    cfg = cfg || loadSettings();
    var root = document.documentElement;
    root.setAttribute('data-cm-accent', ACCENTS[cfg.accent] ? cfg.accent : 'gold');
    root.setAttribute('data-cm-filter', FILTERS[cfg.filter] ? cfg.filter : 'none');
    root.classList.toggle('cm-no-minimap', cfg.minimap === false);
  }

  function saveSetting(key, value) {
    var cfg = loadSettings();
    cfg[key] = value;
    try { localStorage.setItem('cmSettings', JSON.stringify(cfg)); } catch (e) { /* private mode: applies this visit only */ }
    applySettings(cfg);
  }

  function settingsPanel() {
    var cfg = loadSettings();
    var accent = ACCENTS[cfg.accent] ? cfg.accent : 'gold';
    var filter = FILTERS[cfg.filter] ? cfg.filter : 'none';
    return '<h3 class="cm-menu-h">UI colour</h3><div class="cm-swatches">' + Object.keys(ACCENTS).map(function (k) {
      return '<button type="button" class="cm-swatch is-' + k + (k === accent ? ' is-on' : '') + '" data-accent="' + k + '"><i></i>' + ACCENTS[k] + '</button>';
    }).join('') + '</div>' +
      '<h3 class="cm-menu-h">World filter</h3><div class="cm-filters">' + Object.keys(FILTERS).map(function (k) {
        return '<button type="button" class="cm-filter is-' + k + (k === filter ? ' is-on' : '') + '" data-filter="' + k + '"><i></i>' + FILTERS[k] + '</button>';
      }).join('') + '</div>' +
      '<h3 class="cm-menu-h">Map</h3><label class="cm-toggle"><input type="checkbox" data-minimap' + (cfg.minimap === false ? '' : ' checked') + '> Show minimap</label>' +
      '<h3 class="cm-menu-h">Campaign</h3><button type="button" class="cm-menu-danger" data-end-campaign>End this campaign</button>' +
      '<p class="cm-muted">Colour and filter are saved on this device.</p>';
  }

  function menuClick(ev) {
    var t = ev.target;
    if (t.closest('[data-menu-close]')) { closeMenu(); return; }
    if (state.menuPanel === 'squad' && squadTap(t)) return;
    var fol = t.closest('[data-follow]');
    if (fol) {
      var fid = fol.getAttribute('data-follow');
      busy(function () {
        return api('/api/campaign/follower', { method: 'POST', body: { cardId: fid } }).then(function (run) {
          state.run = run;
          var f = starterFollower(run);
          var ow = state.overworld;
          if (ow) {
            ow.follower = f;
            ow.invalidate();
          }
          toast(run.lastMessage || 'Follower set.');
          menuPanel('follower');
        });
      });
      return;
    }
    if (t.closest('[data-akhar]')) {
      openPreBattle({ kind: 'akhar' }, 'Raidlord Akhar');
      return;
    }
    var p = t.closest('[data-panel]');
    if (p) {
      var id = p.getAttribute('data-panel');
      if (id === 'formation') {
        openPresetFrom();
        return;
      }
      if (id === 'site') {
        closeMenu();
        if (state.nav) state.nav.openShield();
        return;
      }
      menuPanel(id);
      return;
    }
    var eq = t.closest('[data-equip]');
    if (eq) {
      var forId = eq.getAttribute('data-for');
      busy(function () {
        return api('/api/campaign/equip', { method: 'POST', body: { cardId: forId, itemId: eq.getAttribute('data-equip') || null } })
          .then(function (run) { state.run = run; menuPanel('mon:' + forId); toast(run.lastMessage || 'Done.'); });
      });
      return;
    }
    var f = t.closest('[data-dexf]');
    if (f) { state.codexFilter = f.getAttribute('data-dexf'); $('cmMenuBody').innerHTML = codexPanel(state.codex); fitCutouts($('cmMenuBody')); return; }
    var a = t.closest('[data-accent]');
    if (a) { saveSetting('accent', a.getAttribute('data-accent')); menuPanel('settings'); return; }
    var fl = t.closest('[data-filter]');
    if (fl) { saveSetting('filter', fl.getAttribute('data-filter')); menuPanel('settings'); return; }
    if (t.closest('[data-end-campaign]')) {
      if (!confirm('End this campaign? Your Squire’s progress will be lost.')) return;
      busy(function () {
        return api('/api/campaign/abandon', { method: 'POST' }).then(function () {
          store(RUN_TOKEN_KEY, null);
          location.reload();
        });
      });
    }
  }

  function menuBack() {
    var id = state.menuPanel || 'home';
    state.squadDraft = null;
    state.squadSlot = null;
    if (id.indexOf('mon:') === 0) menuPanel('siegelings');
    else if (id.indexOf('dex:') === 0) { menuPanel('codex'); }
    else menuPanel('home');
  }

  function renderEncounterResume(run) {
    state.run = run;
    var wild = run.phase === 'WILD_BATTLE';
    $('cmArenaRetreat').hidden = wild;
    $('cmArenaResume').textContent = wild ? 'Return to Battle' : 'Return to duel';
    if (wild) {
      $('cmArenaResumeMsg').textContent = run.lastMessage || 'Your wild encounter is still underway.';
      return;
    }
    var kind = run.pendingArenaKind || 'duel';
    var label = run.lastBattleEncounter || kind;
    $('cmArenaResumeMsg').textContent = 'Your Arena fight with ' + label + ' is still open. Return to the table, or withdraw to the Land.';
  }

  function goToArena(soloToken) {
    store(SOLO_TOKEN_KEY, soloToken);
    window.location.href = '/play?campaign=1';
  }

  function busy(fn) {
    if (state.busy) return;
    state.busy = true;
    Promise.resolve().then(fn).catch(function (e) { toast(e.message || String(e)); })
      .finally(function () { state.busy = false; });
  }

  // The resume line read the raw id ("sundile"); show the partner's card name.
  function starterName(id) {
    var hit = null;
    ((state.options && state.options.starters) || []).forEach(function (s) { if (s.id === id) hit = s; });
    return hit && hit.name ? hit.name : (id || 'your partner');
  }

  function mountShieldNavigation() {
    if (!window.SiegelingsShieldNavigation) return;
    // The FAB is the site's own shield; SiegelinQ has its own dock button.
    var nav = state.nav = window.SiegelingsShieldNavigation.mountLinks();
    nav.setPrimaryClickHandler(function (info) {
      if (menuOpen() && !(info && info.shieldOpen)) closeMenu();
      return false;
    });
  }

  function boot() {
    applySettings();
    bindFormationDrag();
    mountShieldNavigation();
    $('cmMenu').addEventListener('click', menuClick);
    $('cmMenu').addEventListener('change', function (ev) {
      if (ev.target.matches('[data-minimap]')) saveSetting('minimap', ev.target.checked);
    });
    $('cmMenuBack').addEventListener('click', menuBack);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && menuOpen()) closeMenu();
    });
    show('loading');
    api('/api/campaign/options').then(function (options) {
      state.options = options;
      var existing = load(RUN_TOKEN_KEY) || options.accountRunToken;
      function openPrologue() {
        renderStarters(options);
        show('start');
      }
      if (!existing) return openPrologue();
      store(RUN_TOKEN_KEY, existing);
      return api('/api/campaign/settle', { method: 'POST' }).then(applyRun).catch(function (e) {
        if (e.message === 'Campaign run not found.') store(RUN_TOKEN_KEY, null);
        else throw e;
        openPrologue();
      });
    }).catch(function (e) {
      $('screenLoading').querySelector('p').textContent = 'Could not load Adventure. Reload to retry.';
      toast(e.message);
    });

    document.body.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-starter]');
      if (t) {
        selectStarter(t.getAttribute('data-starter'));
        return;
      }
      t = ev.target.closest('[data-land]');
      if (t && !t.disabled) {
        busy(function () {
          return travelToLand(t.getAttribute('data-land'));
        });
        return;
      }
      t = ev.target.closest('[data-act]');
      if (t) {
        var act = t.getAttribute('data-act');
        var landId = t.getAttribute('data-land');
        handleOverworldAct(act, landId ? { landId: landId, label: t.textContent } : null);
        return;
      }
      if (document.body.dataset.screen === 'preset' && ev.target.closest('#screenPreset')) {
        formationTap(ev.target);
      }
    });

    $('cmStartBtn').addEventListener('click', function () {
      var step = state.prologue;
      if (step !== 'bond') {
        if (step === 'choose' && !state.selectedStarter) return;
        state.prologue = { approach: 'arrest', arrest: 'choose', choose: 'bond' }[step];
        paintPrologue();
        return;
      }
      busy(function () {
        return api('/api/campaign/start', {
          method: 'POST',
          body: { starterId: state.selectedStarter, playerName: 'Squire' }
        }).then(applyRun);
      });
    });
    var worldClose = $('cmWorldClose');
    if (worldClose) {
      worldClose.addEventListener('click', function () { showRealmOverlay(false); });
    }
    $('cmPresetBack').addEventListener('click', function () { state.preBattle = null; returnFromPreset(); });
    $('cmPresetSave').addEventListener('click', function () {
      var ids = formationIds();
      var cells = {};
      ids.forEach(function (id) { cells[id] = state.formation[id]; });
      busy(function () {
        return api('/api/campaign/preset', { method: 'POST', body: { cardIds: ids, cells: cells } })
          .then(function (run) {
            state.run = run;
            // The battle's placement rules may move a unit to the nearest linked square.
            var moved = ids.filter(function (id) { return run.presetCells && run.presetCells[id] !== cells[id]; });
            toast(moved.length ? 'Saved. ' + moved.map(function (id) { var c = rosterCard(id); return c ? c.name : id; }).join(', ') +
              ' moved to a square it can link from.' : (state.preBattle ? 'To battle!' : 'ArenaTeam saved.'));
            if (state.preBattle) return startArena(state.preBattle);
            returnFromPreset(run);
          });
      });
    });
    // Walking dock: SiegelinQ menu on the left, A on the right (the FAB is the site shield).
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-open-q]')) { openMenu('home'); return; }
      if (ev.target.closest('[data-act-btn]')) pressAct();
    });
    $('cmArenaResume').addEventListener('click', function () {
      if (state.run && state.run.phase === 'WILD_BATTLE') {
        window.location.href = '/siege?campaign=1';
        return;
      }
      var tok = (state.run && state.run.soloToken) || load(SOLO_TOKEN_KEY);
      if (!tok) {
        toast('No open duel to return to.');
        return;
      }
      goToArena(tok);
    });
    $('cmArenaRetreat').addEventListener('click', function () {
      busy(function () {
        return api('/api/campaign/arena/retreat', { method: 'POST' }).then(applyRun);
      });
    });
    $('cmEndBtn').addEventListener('click', function () {
      if (!confirm('End this campaign?')) return;
      busy(function () {
        return api('/api/campaign/abandon', { method: 'POST' }).then(function () {
          store(RUN_TOKEN_KEY, null);
          location.reload();
        });
      });
    });
    $('cmNewBtn').addEventListener('click', function () {
      state.prologue = 'approach';
      state.selectedStarter = null;
      applyRun(null);
      renderStarters(state.options);
    });

  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
