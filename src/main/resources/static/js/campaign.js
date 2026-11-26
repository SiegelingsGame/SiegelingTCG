(function () {
  'use strict';
  var RUN_TOKEN_KEY = 'sieglingsCampaignToken';
  var SOLO_TOKEN_KEY = 'sieglingsSoloSessionToken';
  var state = {
    options: null, run: null, selectedStarter: null, presetPick: [],
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
    return '<span class="cm-dot" style="background:' + elColor(card && card.element) + '"></span>';
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
    // WORLD / default hub → walkable Sanctuary town
    renderSanctuary(run);
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

  /** Open-world grass rolls → Siege AP wild fight (stays on /campaign). */
  function startRandomWildEncounter() {
    busy(function () {
      return api('/api/campaign/wild/start', { method: 'POST' })
        .then(applyRun)
        .catch(function (e) {
          var ow = state.overworld;
          if (ow && ow.encounter) {
            ow.encounter.pending = false;
            ow.encounter.grace = ow.encounter.graceOnEnter || 5.5;
            if (ow.els && ow.els.ow) ow.els.ow.classList.remove('is-encounter');
            if (ow.setBanner) ow.setBanner('The wilds settle… keep exploring.');
          }
          throw e;
        });
    });
  }

  function handleOverworldAct(act, building) {
    if (act === 'exit' || act === 'realms') {
      if (act === 'exit') {
        if (!state.run) return;
        setOverworldActive(false);
        renderSanctuary(state.run);
        show('world');
        setOverworldActive(true);
        return;
      }
      showRealmOverlay(true);
      return;
    }
    if (act === 'preset') {
      setOverworldActive(false);
      state.returnScreen = 'world';
      renderPreset(state.run);
      show('preset');
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
      // Enter the starter's home land, then start a wild capture in the woods.
      busy(function () {
        var home = (state.run && state.run.starterElement)
          ? String(state.run.starterElement).toLowerCase()
          : 'fire';
        var landId = home === 'fire' ? 'fire'
          : home === 'earth' ? 'earth'
          : home === 'ice' ? 'ice'
          : home === 'wind' ? 'wind'
          : 'fire';
        // Prefer already-current land if set.
        if (state.run && state.run.currentLandId) landId = state.run.currentLandId;
        var enter = (state.run && state.run.phase === 'LAND' && state.run.currentLandId)
          ? Promise.resolve(state.run)
          : api('/api/campaign/enter-land', { method: 'POST', body: { landId: landId } });
        return enter.then(function () {
          return api('/api/campaign/wild/start', { method: 'POST' }).then(applyRun);
        });
      });
      return;
    }
    busy(function () {
      // Grove gates + random grass rolls share Siege wild battles.
      if (act === 'wild') {
        return api('/api/campaign/wild/start', { method: 'POST' }).then(applyRun);
      }
      // Rival trainers and realm SiegeKnights always use Arena Battle Table.
      if (act === 'rival' || act === 'knight') {
        return api('/api/campaign/arena/start', {
          method: 'POST',
          body: { kind: act === 'rival' ? 'rival' : 'knight' }
        }).then(function (data) {
          if (!data.soloToken) throw new Error('No battle token.');
          goToArena(data.soloToken);
        });
      }
    });
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

  function renderSanctuary(run) {
    showRealmOverlay(false);
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
        gold: run.gold,
        rallies: (run.ralliedLandIds || []).length,
        follower: starterFollower(run)
      });
    }
  }

  function renderPreset(run) {
    state.presetPick = (run.arenaPreset || []).slice();
    var host = $('cmRoster');
    host.innerHTML = (run.rosterCards || []).map(function (c) {
      var on = state.presetPick.indexOf(c.id) >= 0;
      return '<button type="button" class="cm-roster-card' + (on ? ' is-on' : '') + '" data-id="' + esc(c.id) + '">' +
        '<span class="cm-fig">' + figureHtml(c, 240, true) + '</span>' +
        '<b>' + esc(c.name) + '</b></button>';
    }).join('');
    fitCutouts(host);
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
    var nav = window.SiegelingsShieldNavigation.mountLinks();
    function sync() { nav.setHidden(!!FAB_HIDDEN[document.body.dataset.screen]); }
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
    sync();
  }

  function boot() {
    mountShieldNavigation();
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
          show('start');
        }).catch(function () {
          store(RUN_TOKEN_KEY, null);
          show('start');
        });
      }
      show('start');
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
      t = ev.target.closest('#cmRoster [data-id]');
      if (t) {
        var id = t.getAttribute('data-id');
        var ix = state.presetPick.indexOf(id);
        if (ix >= 0) state.presetPick.splice(ix, 1);
        else if (state.presetPick.length < 5) state.presetPick.push(id);
        t.classList.toggle('is-on', state.presetPick.indexOf(id) >= 0);
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
      setOverworldActive(false);
      // Soft return to Sanctuary — server may still be LAND; waystones re-enter.
      renderSanctuary(state.run);
      show('world');
      setOverworldActive(true);
    });
    var worldClose = $('cmWorldClose');
    if (worldClose) {
      worldClose.addEventListener('click', function () { showRealmOverlay(false); });
    }
    function openPreset() {
      state.returnScreen = document.body.dataset.screen === 'land' ? 'land' : 'world';
      setOverworldActive(false);
      renderPreset(state.run);
      show('preset');
    }
    $('cmPresetBtn').addEventListener('click', openPreset);
    $('cmPresetBtn2').addEventListener('click', openPreset);
    $('cmPresetBack').addEventListener('click', function () {
      if (state.returnScreen === 'land' && state.run) {
        renderLand(state.run);
        show('land');
        setOverworldActive(true);
      } else if (state.run) {
        renderSanctuary(state.run);
        show('world');
        setOverworldActive(true);
      } else {
        show(state.returnScreen || 'world');
      }
    });
    $('cmPresetSave').addEventListener('click', function () {
      busy(function () {
        return api('/api/campaign/preset', { method: 'POST', body: { cardIds: state.presetPick } })
          .then(function (run) {
            applyRun(run);
            toast('Preset saved.');
            if (state.returnScreen === 'land') {
              renderLand(run);
              show('land');
              setOverworldActive(true);
            }
          });
      });
    });
    $('cmAkharBtn').addEventListener('click', function () {
      busy(function () {
        return api('/api/campaign/arena/start', { method: 'POST', body: { kind: 'akhar' } })
          .then(function (data) {
            if (!data.soloToken) throw new Error('No battle token.');
            goToArena(data.soloToken);
          });
      });
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
