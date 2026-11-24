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

  function spriteIdleUrl(cardId) {
    var sheet = window.SiegeSprites && window.SiegeSprites.forCard(cardId);
    return sheet ? (sheet.dir + 'idle.webp') : '';
  }

  function cutoutHtml(card, lane, extraClass) {
    var id = card && card.id ? card.id : '';
    var art = (card && (card.artUrl || (card.card && card.card.cardArtUrl))) || spriteIdleUrl(id) || '';
    var name = card && card.name ? card.name : '';
    var sheet = window.SiegeSprites && window.SiegeSprites.forCard(id);
    var figure;
    if (sheet) {
      // Pose sheets are single strip files (…-idle.webp), same as adventure.css.
      figure = '<span class="cm-anim" style="display:block;width:100%;aspect-ratio:' +
        (sheet.w + '/' + sheet.h) + ';background:url(' + esc(sheet.dir) + 'idle.webp) 0 0 / ' +
        ((sheet.frames.idle || 1) * 100) + '% 100% no-repeat"></span>';
    } else if (art) {
      figure = '<img src="' + esc(art) + '" alt="" loading="lazy" decoding="async">';
    } else {
      figure = '<span style="font-size:28px">◇</span>';
    }
    return '<div class="cm-cutout is-' + esc(lane) + (extraClass ? ' ' + extraClass : '') +
      '" title="' + esc(name) + '">' + figure + '</div>';
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

  function renderStarters(options) {
    var host = $('cmStarters');
    if (!host) return;
    host.innerHTML = (options.starters || []).map(function (s) {
      var sheet = window.SiegeSprites && window.SiegeSprites.forCard(s.id);
      var art = s.artUrl || (s.card && s.card.cardArtUrl) || '';
      var artHtml;
      if (sheet) {
        // Crop the idle strip to the first cell so the picker shows one pose, not the whole sheet.
        var frames = sheet.frames.idle || 1;
        artHtml = '<span class="cm-starter-sprite" style="width:100%;height:100%;display:block;background:url(' +
          esc(sheet.dir + 'idle.webp') + ') 0 0 / ' + (frames * 100) + '% 100% no-repeat;background-size:' +
          (frames * 100) + '% 100%"></span>';
      } else if (art) {
        artHtml = '<img src="' + esc(art) + '" alt="">';
      } else {
        artHtml = '';
      }
      return '<button type="button" class="cm-starter" data-starter="' + esc(s.id) + '">' +
        '<span class="cm-el" style="color:' + elColor(s.element) + '">' + esc(s.element) + '</span>' +
        '<span class="cm-starter-art">' + artHtml + '</span>' +
        '<b>' + esc(s.name) + '</b>' +
        '<small>' + esc(s.blurb || '') + (s.landName ? ' · ' + esc(s.landName) : '') + '</small>' +
        '</button>';
    }).join('');
  }

  function starterFollower(run) {
    var starter = null;
    (run.rosterCards || []).forEach(function (c) {
      if (!starter && c.id === run.starterId) starter = c;
    });
    if (!starter && run.rosterCards && run.rosterCards[0]) starter = run.rosterCards[0];
    return starter ? { id: starter.id, artUrl: starter.artUrl } : null;
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
  }

  function showRealmOverlay(on) {
    var ov = $('cmWorldOverlay');
    if (!ov) return;
    ov.hidden = !on;
    if (on && state.run) fillRealmOverlay(state.run);
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
    if (act === 'akhar') {
      busy(function () {
        return api('/api/campaign/arena/start', { method: 'POST', body: { kind: 'akhar' } })
          .then(function (data) {
            if (!data.soloToken) throw new Error('No battle token.');
            goToArena(data.soloToken);
          });
      });
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
      if (act === 'wild') {
        return api('/api/campaign/wild/start', { method: 'POST' }).then(applyRun);
      }
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
        follower: starterFollower(run),
        akharUnlocked: !!run.akharUnlocked && run.phase !== 'VICTORY'
      });
    }
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
        (c.artUrl ? '<img src="' + esc(c.artUrl) + '" alt="">' : '') +
        '<b>' + esc(c.name) + '</b></button>';
    }).join('');
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
        var sheet = window.SiegeSprites && window.SiegeSprites.forCard(u.cardId);
        var art;
        if (sheet) {
          var frames = sheet.frames.idle || 1;
          art = '<span class="cm-unit-sprite" style="display:block;width:72px;height:48px;margin:0 auto;background:url(' +
            esc(sheet.dir + 'idle.webp') + ') 0 0 / ' + (frames * 100) + '% 100% no-repeat"></span>';
        } else if (u.artUrl) {
          art = '<img src="' + esc(u.artUrl) + '" alt="">';
        } else {
          art = '<span class="cm-unit-fallback" style="display:block;width:48px;height:48px;margin:0 auto;border-radius:50%;background:' +
            elColor(u.element) + '"></span>';
        }
        var label = u.shadeOf ? ('Shade of ' + u.shadeOf) : u.name;
        return '<div class="cm-unit' + (u.alive === false ? ' is-down' : '') + '">' + art +
          '<b>' + esc(label) + '</b>' +
          '<span class="cm-hp">' + esc(u.hp) + '/' + esc(u.maxHp) + '</span></div>';
      }).join('');
    }
    units(b.enemies, 'cmWildFoes');
    units(b.allies, 'cmWildAllies');
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

  function mountShieldNavigation() {
    if (!window.SiegelingsShieldNavigation) return;
    // Campaign keeps the Siegelings FAB on every screen so hub destinations stay
    // one tap away — same mountLinks pattern as Adventure launch screens.
    window.SiegelingsShieldNavigation.mountLinks();
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
            esc(run.starterId || 'your partner') + '.</div>' +
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
        state.selectedStarter = t.getAttribute('data-starter');
        document.querySelectorAll('.cm-starter').forEach(function (n) {
          n.classList.toggle('is-on', n.getAttribute('data-starter') === state.selectedStarter);
        });
        $('cmStartBtn').disabled = !state.selectedStarter;
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
    function clickInteract() {
      if (state.overworld) state.overworld.tryInteract();
    }
    var interactWorld = $('cmInteractWorld');
    var interactLand = $('cmInteractLand');
    if (interactWorld) interactWorld.addEventListener('click', clickInteract);
    if (interactLand) interactLand.addEventListener('click', clickInteract);
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
