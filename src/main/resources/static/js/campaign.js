(function () {
  'use strict';
  var RUN_TOKEN_KEY = 'sieglingsCampaignToken';
  var SOLO_TOKEN_KEY = 'sieglingsSoloSessionToken';
  var state = { options: null, run: null, selectedStarter: null, presetPick: [], returnScreen: 'world', busy: false };

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
    if (!run) { show('start'); return; }
    if (run.phase === 'VICTORY') {
      $('cmVictory').textContent = run.lastMessage || 'Raidlord Akhar falls. The realms stand united.';
      show('victory');
      return;
    }
    if (run.phase === 'WILD_BATTLE') {
      renderWild(run);
      show('wild');
      return;
    }
    if (run.phase === 'ARENA_BATTLE') {
      toast('Returning to the campaign…');
      api('/api/campaign/settle', { method: 'POST' }).then(applyRun).catch(function (e) { toast(e.message); });
      return;
    }
    if (run.phase === 'LAND' || run.phase === 'RALLY') {
      renderLand(run);
      show('land');
      return;
    }
    renderWorld(run);
    show('world');
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

  function renderWorld(run) {
    $('cmWorldBanner').textContent = run.lastMessage || 'Choose a Land.';
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
    if (akhar) {
      akhar.hidden = !run.akharUnlocked || run.phase === 'VICTORY';
    }
  }

  function renderLand(run) {
    var land = run.currentLand || {};
    $('cmStageBg').style.backgroundImage = land.background ? 'url(' + land.background + ')' : '';
    $('cmLandName').textContent = land.name || 'Land';
    $('cmLandBanner').textContent = run.lastMessage || '';
    var depth = $('cmStageDepth');
    var roster = run.rosterCards || [];
    var html = '';
    roster.slice(0, 3).forEach(function (c, i) {
      var lane = i === 0 ? 'near' : (i === 1 ? 'mid' : 'far');
      html += cutoutHtml(c, lane, '');
      // Spread party across the left/center.
      // positions applied after insert
    });
    // NPC knight silhouette on the right as a still cutout cue.
    html += '<div class="cm-cutout is-near is-npc" style="right:10%;left:auto" title="Realm challenge">' +
      '<span style="font-size:42px;opacity:.85">⚔</span></div>';
    depth.innerHTML = html;
    var cuts = depth.querySelectorAll('.cm-cutout:not(.is-npc)');
    cuts.forEach(function (node, i) {
      node.style.left = (12 + i * 18) + '%';
    });

    var rivalDone = (run.clearedRivalLandIds || []).indexOf(run.currentLandId) >= 0;
    var rallied = (run.ralliedLandIds || []).indexOf(run.currentLandId) >= 0;
    var actions = $('cmLandActions');
    actions.innerHTML =
      '<button type="button" data-act="wild">Wild capture (Siege)</button>' +
      (rivalDone
        ? ''
        : '<button type="button" data-act="rival">Rival trainer (Arena)</button>') +
      (rallied
        ? '<button type="button" disabled>Realm rallied</button>'
        : '<button type="button" class="is-gold" data-act="knight">SiegeKnight (50 HP)</button>');
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
        return '<div class="cm-unit' + (u.alive === false ? ' is-down' : '') + '">' + art +
          '<b>' + esc(u.name) + '</b>' +
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

  function boot() {
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
      state.run.phase = 'WORLD';
      renderWorld(state.run);
      show('world');
      // Soft return — server still has LAND; enter-land again when picking.
    });
    function openPreset() {
      state.returnScreen = document.body.dataset.screen === 'land' ? 'land' : 'world';
      renderPreset(state.run);
      show('preset');
    }
    $('cmPresetBtn').addEventListener('click', openPreset);
    $('cmPresetBtn2').addEventListener('click', openPreset);
    $('cmPresetBack').addEventListener('click', function () {
      show(state.returnScreen || 'world');
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
