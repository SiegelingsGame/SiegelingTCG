(function () {
  'use strict';
  var RUN_TOKEN_KEY = 'sieglingsCampaignToken';
  var SOLO_TOKEN_KEY = 'sieglingsSoloSessionToken';
  var state = {
    options: null, run: null, selectedStarter: null, formation: {}, formationPick: null,
    returnScreen: 'world', busy: false, settlingArena: false, overworld: null
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
    if (run.phase === 'WILD_BATTLE') {
      setOverworldActive(false);
      renderWild(run);
      show('wild');
      return;
    }
    if (run.phase === 'ARENA_BATTLE') {
      setOverworldActive(false);
      // One settle attempt — if the duel is still live, show resume instead of looping.
      if (state.settlingArena) {
        renderArenaResume(run);
        show('arenaResume');
        return;
      }
      state.settlingArena = true;
      toast('Returning to the campaign…');
      api('/api/campaign/settle', { method: 'POST' }).then(function (next) {
        state.settlingArena = false;
        if (next && next.phase === 'ARENA_BATTLE') {
          renderArenaResume(next);
          show('arenaResume');
          return;
        }
        applyRun(next);
      }).catch(function (e) {
        state.settlingArena = false;
        toast(e.message);
        renderArenaResume(run);
        show('arenaResume');
      });
      return;
    }
    if (run.phase === 'LAND' || run.phase === 'RALLY') {
      renderLand(run);
      show('land');
      setOverworldActive(true);
      return;
    }
    // WORLD / default hub → the Sanctuary town, or the Wildlands if Bob was walking there.
    if (run.area === 'wildlands') renderWildlands(run);
    else renderSanctuary(run);
    show('world');
    setOverworldActive(true);
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
    // The stage needs a subject from the first paint, so the first partner starts chosen.
    if (list.length && !state.selectedStarter) selectStarter(list[0].id);
    else if (state.selectedStarter) selectStarter(state.selectedStarter);
  }

  function selectStarter(id) {
    var list = (state.options && state.options.starters) || [];
    var s = null;
    list.forEach(function (x) { if (x.id === id) s = x; });
    if (!s) return;
    state.selectedStarter = id;
    document.querySelectorAll('.cm-starter').forEach(function (n) {
      var on = n.getAttribute('data-starter') === id;
      n.classList.toggle('is-on', on);
      n.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('cmStartBtn').disabled = false;
    var color = elColor(s.element);
    $('cmShow').style.setProperty('--cm-el-c', color);
    $('cmShowEl').textContent = s.element || '';
    $('cmShowEl').style.color = color;
    $('cmShowLand').textContent = s.landName || '';
    $('cmShowName').textContent = s.name || id;
    $('cmShowBlurb').textContent = s.blurb || '';
    var partner = $('cmShowPartner');
    partner.innerHTML = partnerArtHtml(s);
    fitCutouts(partner);
    var sizer = window.SiegeSprites && window.SiegeSprites.heightVsSquire;
    partner.style.setProperty('--cm-size', sizer ? window.SiegeSprites.heightVsSquire(s.id, s.rarity || (s.card && s.card.rarity)) : 0.72);
    partner.classList.remove('is-arriving');
    void partner.offsetWidth;
    partner.classList.add('is-arriving');
    // Land paintings crossfade: the new layer fades in over the old one, then the old
    // one is dropped, so a quick tap-through never flashes the bare panel.
    var bg = s.background || landThumb(s);
    [['cmShowArt', bg], ['cmAmbient', landThumb(s)]].forEach(function (pair) {
      var host = $(pair[0]);
      var layer = document.createElement('i');
      layer.style.backgroundImage = 'url(' + pair[1] + ')';
      host.appendChild(layer);
      requestAnimationFrame(function () { layer.classList.add('is-in'); });
      while (host.children.length > 2) host.removeChild(host.firstChild);
    });
  }

  function starterFollower(run) {
    var starter = null;
    (run.rosterCards || []).forEach(function (c) {
      if (!starter && c.id === run.starterId) starter = c;
    });
    if (!starter && run.rosterCards && run.rosterCards[0]) starter = run.rosterCards[0];
    // Art mode and rarity ride along so the 3D world can stand an overlay
    // cutout (at its rarity size) when the partner has no sheet.
    return starter ? {
      id: starter.id, artUrl: starter.artUrl, cardArtMode: starter.cardArtMode,
      rarity: starter.card && starter.card.rarity
    } : null;
  }

  function fillRealmOverlay(run) {
    $('cmWorldBanner').textContent = run.lastMessage || 'Choose a Land to travel.';
    var host = $('cmWorld');
    host.innerHTML = (run.lands || []).map(function (land) {
      var locked = !land.unlocked && !land.rallied;
      var cls = 'cm-land' + (locked ? ' is-locked' : '') + (land.rallied ? ' is-rallied' : '');
      var status = land.rallied ? 'Rallied' : (land.rivalCleared ? 'Knight awaits' : (locked ? 'Sealed' : 'Open'));
      return '<button type="button" class="' + cls + '" data-land="' + esc(land.id) + '"' +
        (locked ? ' disabled' : '') +
        ' style="background-image:url(\'' + esc(land.background || '') + '\')">' +
        '<span class="cm-land-body"><strong>' + esc(land.name) + '</strong>' +
        '<span>' + esc((land.elements && land.elements[0]) || '') + ' · ' + status + '</span></span></button>';
    }).join('');
    var akhar = $('cmAkharBtn');
    if (akhar) akhar.hidden = !run.akharUnlocked || run.phase === 'VICTORY';
  }

  function showRealmOverlay(on) {
    var ov = $('cmWorldOverlay');
    if (!ov) return;
    ov.hidden = !on;
    if (on && state.run) fillRealmOverlay(state.run);
  }

  // Every battle the world starts (roaming wilds, grass rolls, shrines, rivals, knights,
  // Akhar) is an Arena match on the Battle Table, three Siegelings a side at most.
  function startArena(body) {
    return api('/api/campaign/arena/start', { method: 'POST', body: body }).then(function (data) {
      if (!data.soloToken) throw new Error('No battle token.');
      goToArena(data.soloToken);
    });
  }

  /** The area Bob is walking in, as the server names it. */
  function currentArea() {
    var screen = document.body.dataset.screen;
    if (screen === 'land' && state.run && state.run.currentLandId) return state.run.currentLandId;
    return state.mapArea === 'wildlands' ? 'wildlands' : 'sanctuary';
  }

  function wildsFor(area) {
    var all = (state.run && state.run.wilds) || {};
    return all[area] || [];
  }

  /** Tall grass rolled an encounter: one of the area's roamers charges in. */
  function startRandomWildEncounter() {
    var area = currentArea();
    var pool = wildsFor(area);
    function settle(msg) {
      var ow = state.overworld;
      if (ow && ow.encounter) {
        ow.encounter.pending = false;
        ow.encounter.grace = ow.encounter.graceOnEnter || 5.5;
        if (ow.els && ow.els.ow) ow.els.ow.classList.remove('is-encounter');
        if (ow.setBanner) ow.setBanner(msg);
      }
    }
    if (!pool.length) { settle('The grass rustles, but nothing appears.'); return; }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    busy(function () {
      return startArena({ kind: 'wild', cardId: pick.id, area: area }).catch(function (e) {
        settle('The wilds settle… keep exploring.');
        throw e;
      });
    });
  }

  /** Record where Bob walks so a battle (or a reload) returns him there. */
  function setArea(area) {
    return api('/api/campaign/area', { method: 'POST', body: { area: area } }).then(function (run) {
      state.run = run;
      return run;
    });
  }

  function handleOverworldAct(act, building) {
    if (act === 'exit') {
      if (!state.run) return;
      busy(function () {
        return setArea('sanctuary').then(function (run) {
          setOverworldActive(false);
          renderSanctuary(run);
          show('world');
          setOverworldActive(true);
        });
      });
      return;
    }
    if (act === 'realms') {
      showRealmOverlay(true);
      return;
    }
    if (act === 'preset') {
      openPresetFrom(document.body.dataset.screen === 'land' ? 'land' : 'world');
      return;
    }
    if (act === 'travel' && building && building.landId) {
      busy(function () {
        return api('/api/campaign/enter-land', { method: 'POST', body: { landId: building.landId } })
          .then(applyRun);
      });
      return;
    }
    if (act === 'woods') {
      busy(function () {
        return setArea('wildlands').then(function (run) {
          setOverworldActive(false);
          renderWildlands(run);
          show('world');
          setOverworldActive(true);
        });
      });
      return;
    }
    if (act === 'wild-foe' && building && building.cardId) {
      busy(function () { return startArena({ kind: 'wild', cardId: building.cardId, area: currentArea() }); });
      return;
    }
    if (act === 'legendary') {
      busy(function () { return startArena({ kind: 'legendary' }); });
      return;
    }
    if (act === 'rival' || act === 'knight') {
      busy(function () { return startArena({ kind: act }); });
    }
  }

  function ensureOverworld(stageId) {
    stageId = stageId || 'cmStage';
    if (state.overworld && state.overworld.root && state.overworld.root.id === stageId) {
      return state.overworld;
    }
    if (!window.CampaignOverworld) return null;
    var stage = $(stageId);
    if (!stage) return null;
    // Remount when switching sanctuary ↔ land stages.
    if (state.overworld) {
      state.overworld.enable(false);
      if (state.overworld.dispose) state.overworld.dispose();
    }
    state.overworld = new window.CampaignOverworld({
      root: stage,
      onInteract: handleOverworldAct,
      onEncounter: startRandomWildEncounter,
      onExit: function () {
        if (document.body.dataset.screen === 'land') $('cmBackWorld').click();
        else showRealmOverlay(true);
      }
    });
    state.overworld.mount();
    return state.overworld;
  }

  function renderWildlands(run) {
    showRealmOverlay(false);
    var ow = ensureOverworld('cmSanctuaryStage');
    var ok = ow && ow.loadWildlands && ow.loadWildlands({
      message: run.lastMessage,
      gold: run.gold,
      rallies: (run.ralliedLandIds || []).length,
      wilds: wildsFor('wildlands'),
      follower: starterFollower(run)
    });
    if (!ok) { renderSanctuary(run); return; }
    state.mapArea = 'wildlands';
    var akhar = $('cmAkharBtn');
    if (akhar) akhar.hidden = !run.akharUnlocked || run.phase === 'VICTORY';
  }

  function renderSanctuary(run) {
    showRealmOverlay(false);
    state.mapArea = 'sanctuary';
    var ow = ensureOverworld('cmSanctuaryStage');
    if (ow) {
      ow.loadSanctuary({
        message: run.lastMessage || 'Sanctuary Plaza — palm woods to the north, waystones to the east.',
        gold: run.gold,
        rallies: (run.ralliedLandIds || []).length,
        lands: run.lands || [],
        follower: starterFollower(run)
      });
    }
    var akhar = $('cmAkharBtn');
    if (akhar) akhar.hidden = !run.akharUnlocked || run.phase === 'VICTORY';
  }

  function renderLand(run) {
    showRealmOverlay(false);
    var land = run.currentLand || {};
    var ow = ensureOverworld('cmStage');
    if (ow) {
      ow.loadLand({
        name: land.name || 'Land',
        landId: run.currentLandId,
        message: run.lastMessage || 'Walk Squire Bob to a popup building.',
        background: land.background || '',
        element: (land.elements && land.elements[0]) || run.starterElement || 'neutral',
        rivalDone: (run.clearedRivalLandIds || []).indexOf(run.currentLandId) >= 0,
        rallied: (run.ralliedLandIds || []).indexOf(run.currentLandId) >= 0,
        wilds: wildsFor(run.currentLandId),
        legendary: land.legendary || null,
        shrineOpen: !!land.shrineOpen,
        sigilEarned: !!land.sigilEarned,
        gold: run.gold,
        rallies: (run.ralliedLandIds || []).length,
        follower: starterFollower(run)
      });
    }
  }

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

  function renderPreset(run) {
    var max = run.arenaPartyMax || 3;
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
    $('cmPreMax').textContent = max;
    drawFormation();
  }

  function formationIds() {
    return Object.keys(state.formation || {}).sort(function (a, b) {
      return state.formation[a] - state.formation[b];
    });
  }

  function drawFormation() {
    var run = state.run || {};
    var max = run.arenaPartyMax || 3;
    var at = {};
    formationIds().forEach(function (id) { at[state.formation[id]] = id; });
    var board = $('cmBoard');
    var cells = [];
    var ROWS = ['Front', 'Middle', 'Back'];
    for (var cell = 0; cell < 9; cell++) {
      if (cell % 3 === 0) cells.push('<span class="cm-row-label" aria-hidden="true">' + ROWS[cell / 3] + '</span>');
      var id = at[cell];
      var c = id ? rosterCard(id) : null;
      var picked = state.formationPick && state.formationPick === id;
      cells.push('<button type="button" class="cm-cell' + (c ? ' has-unit' : '') + (picked ? ' is-picked' : '') +
        (cell < 3 ? ' is-front' : '') + '" data-cell="' + cell + '" role="gridcell" aria-label="' +
        (c ? esc(c.name) : 'Empty square') + '">' +
        (c ? '<span class="cm-cell-unit" style="--cm-el-c:' + elColor(c.element) + '">' + notchesHtml(c) +
          '<span class="cm-fig">' + figureHtml(c, 240, !picked) + '</span>' +
          '<b>' + esc(c.name) + '</b></span>' : '<span class="cm-cell-empty" aria-hidden="true">+</span>') +
        '</button>');
    }
    board.innerHTML = cells.join('');
    fitCutouts(board);
    var placed = formationIds().length;
    $('cmPreCount').textContent = placed + '/' + max;
    $('cmPresetSave').disabled = placed === 0;
    var bench = $('cmBench');
    bench.innerHTML = (run.rosterCards || []).map(function (c) {
      var on = state.formation[c.id] != null;
      var item = itemDef((run.equipped || {})[c.id]);
      return '<button type="button" class="cm-bench-card' + (on ? ' is-on' : '') +
        (state.formationPick === c.id ? ' is-picked' : '') + '" data-bench="' + esc(c.id) + '" role="option" aria-selected="' + on + '"' +
        ' style="--cm-el-c:' + elColor(c.element) + '">' +
        '<span class="cm-fig">' + figureHtml(c, 240, true) + '</span>' +
        '<b>' + esc(c.name) + '</b>' +
        '<small><img src="' + elementIcon(c.element) + '" alt="">' + esc(String(c.rarity || '').toLowerCase()) +
        (item ? ' · ' + esc(item.icon) : '') + '</small>' +
        (on ? '<em>On board</em>' : '') + '</button>';
    }).join('');
    fitCutouts(bench);
    var hint = $('cmPreHint');
    if (state.formationPick) {
      var pc = rosterCard(state.formationPick);
      hint.innerHTML = 'Place <b>' + esc(pc ? pc.name : '') + '</b> on a square' +
        (state.formation[state.formationPick] != null ? ', or <button type="button" class="cm-linkbtn" data-unplace>bench it</button>.' : '.');
    } else {
      hint.textContent = placed >= max ? 'Party full. Tap a placed Siegeling to move or bench it.'
        : 'Tap a Siegeling below, then a square. The front row faces the enemy.';
    }
  }

  function formationTap(target) {
    var max = (state.run && state.run.arenaPartyMax) || 3;
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
    formationIds().forEach(function (id) { if (state.formation[id] === cell) occupant = id; });
    var pick = state.formationPick;
    if (!pick) {
      // Tapping a placed unit picks it up to move.
      state.formationPick = occupant;
      drawFormation();
      return true;
    }
    if (occupant === pick) { state.formationPick = null; drawFormation(); return true; }
    var wasPlaced = state.formation[pick] != null;
    if (!wasPlaced && !occupant && formationIds().length >= max) {
      toast('Only ' + max + ' Siegelings take the field. Bench one first.');
      return true;
    }
    if (occupant) {
      // Swap: the occupant takes the picked unit's old square (or the bench).
      if (wasPlaced) state.formation[occupant] = state.formation[pick];
      else delete state.formation[occupant];
    }
    state.formation[pick] = cell;
    state.formationPick = null;
    drawFormation();
    return true;
  }

  function openPresetFrom(screen) {
    state.returnScreen = screen || 'world';
    closeMenu();
    setOverworldActive(false);
    renderPreset(state.run);
    show('preset');
  }

  function returnFromPreset(run) {
    run = run || state.run;
    if (!run) { show('world'); return; }
    if (state.returnScreen === 'land' && run.phase !== 'WORLD') {
      renderLand(run);
      show('land');
    } else if (state.mapArea === 'wildlands') {
      renderWildlands(run);
      show('world');
    } else {
      renderSanctuary(run);
      show('world');
    }
    setOverworldActive(true);
  }

  // ---- Rally menu (opened from the shield FAB) ------------------------------

  var MENU_ITEMS = [
    { id: 'siegelings', title: 'Siegelings', sub: 'Party, items, team', icon: '◈' },
    { id: 'formation', title: 'Formation', sub: 'Arena board', icon: '▦' },
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
      title.textContent = 'Rally Menu';
      eyebrow.textContent = squireName(run) + ' · Lv ' + (run.level || 1);
      html = '<div class="cm-menu-grid">' + MENU_ITEMS.map(function (it) {
        return '<button type="button" class="cm-menu-tile is-' + it.id + '" data-panel="' + it.id + '">' +
          '<span class="cm-menu-ico" aria-hidden="true">' + it.icon + '</span>' +
          '<b>' + it.title + '</b><small>' + it.sub + '</small></button>';
      }).join('') + '</div>' + menuStatus(run);
    } else if (id === 'siegelings') {
      title.textContent = 'Siegelings'; eyebrow.textContent = 'Party & roster';
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
    return '<h3 class="cm-menu-h">Arena party</h3><div class="cm-mon-list">' + slots.join('') + '</div>' +
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
    var p = t.closest('[data-panel]');
    if (p) {
      var id = p.getAttribute('data-panel');
      if (id === 'formation') {
        var screen = document.body.dataset.screen;
        openPresetFrom(screen === 'land' ? 'land' : 'world');
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
    if (id.indexOf('mon:') === 0) menuPanel('siegelings');
    else if (id.indexOf('dex:') === 0) { menuPanel('codex'); }
    else menuPanel('home');
  }

  function renderArenaResume(run) {
    state.run = run;
    var kind = run.pendingArenaKind || 'duel';
    var label = run.lastBattleEncounter || kind;
    $('cmArenaResumeMsg').textContent = 'Your Arena fight with ' + label + ' is still open. Return to the table, or withdraw to the Land.';
  }

  function renderWild(run) {
    var b = run.wildBattle || {};
    $('cmWildBanner').textContent = run.pendingCaptureName
      ? ('Wild ' + run.pendingCaptureName + (b.over ? (b.won ? ' — captured!' : ' — fled.') : ''))
      : (run.lastMessage || '');
    function units(list, hostId) {
      var host = $(hostId);
      host.innerHTML = (list || []).map(function (u) {
        // Units without a sheet once fell back to whatever art the server had,
        // including a guessed sprite path that 404s; now it is the overlay cutout.
        var art = '<span class="cm-fig">' + figureHtml(u, 240) + '</span>';
        var label = u.shadeOf ? ('Shade of ' + u.shadeOf) : u.name;
        return '<div class="cm-unit' + (u.alive === false ? ' is-down' : '') + '">' + art +
          '<b>' + esc(label) + '</b>' +
          '<span class="cm-hp">' + esc(u.hp) + '/' + esc(u.maxHp) + '</span></div>';
      }).join('');
    }
    units(b.enemies, 'cmWildFoes');
    units(b.allies, 'cmWildAllies');
    fitCutouts($('cmWild'));
    $('cmWildAp').textContent = b.over ? '' : ('AP ' + (b.actionPoints || 0) + '/' + (b.maxActionPoints || 3));
    var hand = $('cmWildHand');
    hand.innerHTML = (b.hand || []).map(function (c) {
      return '<button type="button" class="cm-hand-card" data-card="' + esc(c.instanceId) + '"' +
        (b.over ? ' disabled' : '') + '>' +
        '<b>' + esc(c.name || 'Move') + '</b>' +
        '<small>Cost ' + esc(c.cost != null ? c.cost : '?') + '</small></button>';
    }).join('');
    $('cmWildEnd').hidden = !!b.over;
    $('cmWildFinish').hidden = !b.over;
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

  // Every campaign screen has a flanked sn-dock built around the FAB slot, but the
  // page never mounted the shield, so the middle of the dock sat empty. The wild
  // fight keeps it hidden: its hand and AP row need the bottom edge.
  var FAB_HIDDEN = { wild: 1 };
  function mountShieldNavigation() {
    if (!window.SiegelingsShieldNavigation) return;
    var nav = state.nav = window.SiegelingsShieldNavigation.mountLinks();
    // During a run the FAB opens the Rally menu first; its Main menu tile opens the shield.
    nav.setPrimaryClickHandler(function (info) {
      if (info && info.shieldOpen) return false;
      if (menuOpen()) { closeMenu(); return true; }
      var screen = document.body.dataset.screen;
      if (state.run && (screen === 'world' || screen === 'land' || screen === 'preset')) return openMenu('home');
      return false;
    });
    function sync() { nav.setHidden(!!FAB_HIDDEN[document.body.dataset.screen]); }
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
    sync();
  }

  function boot() {
    applySettings();
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
      renderStarters(options);
      var existing = load(RUN_TOKEN_KEY) || options.accountRunToken;
      if (existing) {
        store(RUN_TOKEN_KEY, existing);
        return api('/api/campaign/run').then(function (run) {
          var resume = $('cmResume');
          resume.hidden = false;
          resume.innerHTML = '<div>Resume as <b>' + esc(run.playerName || 'Squire') + '</b> with ' +
            esc(starterName(run.starterId)) + '.</div>' +
            '<button type="button" id="cmResumeBtn">Continue</button>';
          // The settle request below may already have put the run back on screen;
          // whichever answers last must not bounce the player to the start screen.
          if (!state.run) show('start');
        }).catch(function () {
          store(RUN_TOKEN_KEY, null);
          if (!state.run) show('start');
        });
      }
      if (!state.run) show('start');
    }).catch(function (e) {
      toast(e.message || 'Could not load campaign.');
      show('start');
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
          return api('/api/campaign/enter-land', { method: 'POST', body: { landId: t.getAttribute('data-land') } })
            .then(applyRun);
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
      if (document.body.dataset.screen === 'preset' && ev.target.closest('#screenPreset') &&
          formationTap(ev.target)) {
        return;
      }
      t = ev.target.closest('[data-card]');
      if (t && state.run && state.run.phase === 'WILD_BATTLE') {
        var foes = (state.run.wildBattle && state.run.wildBattle.enemies) || [];
        var target = null;
        for (var i = 0; i < foes.length; i++) {
          if (foes[i].alive !== false) { target = foes[i].id; break; }
        }
        busy(function () {
          return api('/api/campaign/wild/play', {
            method: 'POST',
            body: { cardId: t.getAttribute('data-card'), targetId: target }
          }).then(applyRun);
        });
      }
    });

    $('cmStartBtn').addEventListener('click', function () {
      busy(function () {
        return api('/api/campaign/start', {
          method: 'POST',
          body: { starterId: state.selectedStarter, playerName: 'Squire' }
        }).then(applyRun);
      });
    });
    document.body.addEventListener('click', function (ev) {
      if (ev.target.id === 'cmResumeBtn') {
        busy(function () { return api('/api/campaign/run').then(applyRun); });
      }
    });
    $('cmBackWorld').addEventListener('click', function () {
      if (!state.run) return;
      busy(function () {
        return setArea('sanctuary').then(function (run) {
          setOverworldActive(false);
          renderSanctuary(run);
          show('world');
          setOverworldActive(true);
        });
      });
    });
    var worldClose = $('cmWorldClose');
    if (worldClose) {
      worldClose.addEventListener('click', function () { showRealmOverlay(false); });
    }
    $('cmPresetBtn').addEventListener('click', function () { showRealmOverlay(true); });
    $('cmPresetBtn2').addEventListener('click', function () { openPresetFrom('land'); });
    $('cmPresetBack').addEventListener('click', function () { returnFromPreset(); });
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
              ' moved to a square it can link from.' : 'Formation saved.');
            returnFromPreset(run);
          });
      });
    });
    $('cmAkharBtn').addEventListener('click', function () {
      busy(function () { return startArena({ kind: 'akhar' }); });
    });
    $('cmWildEnd').addEventListener('click', function () {
      busy(function () {
        return api('/api/campaign/wild/end-turn', { method: 'POST' }).then(applyRun);
      });
    });
    $('cmWildFinish').addEventListener('click', function () {
      busy(function () {
        return api('/api/campaign/wild/finish', { method: 'POST' }).then(applyRun);
      });
    });
    $('cmArenaResume').addEventListener('click', function () {
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
      store(RUN_TOKEN_KEY, null);
      location.reload();
    });

    // Returning from /play?campaign=1 — settle then show result.
    if (new URLSearchParams(location.search).get('settled') === '1' || load(RUN_TOKEN_KEY)) {
      var tok = load(RUN_TOKEN_KEY);
      if (tok) {
        api('/api/campaign/settle', { method: 'POST' }).then(applyRun).catch(function () {});
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
