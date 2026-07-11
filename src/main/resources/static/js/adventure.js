/* Siege — Siegelings Adventure roguelike client.
 * Talks to /api/siege/**. All rules run server-side; this file renders state
 * and submits actions. Run is addressed by an opaque token in localStorage.
 *
 * Screens: setup (paged: mode -> knight -> warband) -> branching map (SVG DAG) ->
 * battle stage / interactive rest camp / cache dig minigame → rewards → result.
 *
 * Battles are round-based (team Speed decides who acts first — shown as a
 * race track). The server streams presentation events that this client plays
 * back as projectiles and action moments. Enemy attacks telegraph the notch
 * they target: red markers on threatened spaces. */
(function () {
  'use strict';

  var TOKEN_KEY = 'siegeToken';
  var state = {
    roster: null,
    run: null,
    knightId: null,
    party: [],          // selected siegeling ids (max 3)
    elementFilter: 'ALL',
    setupStep: 'mode',
    selectedCardId: null,
    knightSelectedItem: null,
    busy: false,
    warbandLoading: false,
    warbandLoadToken: 0,
    interactionResult: null,
    pendingKnightUnlock: null,
    deferBattleHandRender: false
  };

  var EL_ICON = {
    FIRE: '🔥', WATER: '💧', EARTH: '🪨', WIND: '🌪️', ICE: '❄️', SHADOW: '🌑',
    ELECTRIC: '⚡', METAL: '⚙️', UNDEAD: '💀', PSYCHIC: '🔮', POISON: '☠️', LIGHT: '✨', NEUTRAL: '◇'
  };
  var EL_COLOR = {
    FIRE: '#ff501e', WATER: '#3296ff', EARTH: '#b48c50', WIND: '#96ffb4', ICE: '#76e6ff',
    SHADOW: '#9a63d6', ELECTRIC: '#ffe63c', METAL: '#a0aab4', UNDEAD: '#8c78a0',
    PSYCHIC: '#c896ff', POISON: '#78dc50', LIGHT: '#fff0b0', NEUTRAL: '#95a5a6'
  };
  var STATUS_META = {
    BURN: { icon: '🔥', label: 'Burn' },
    SLOW: { icon: '❄️', label: 'Slow' },
    STUN: { icon: '💫', label: 'Stun' },
    SHOCK: { icon: '⚡', label: 'Shock' }
  };
  var NODE_ICON = { BATTLE: '⚔️', ELITE: '🔺', REST: '🏕️', TREASURE: '💎', BROKER: '🐾', SMITH: '🔨', CARAVAN: '🐫', EVENT: '❔', BOSS: '👑' };
  var NODE_TINT = { BATTLE: '#8fa3bf', ELITE: '#ff6e6e', REST: '#7ee787', TREASURE: '#ffd066', BROKER: '#c896ff', BOSS: '#ff9a3c' };
  var CAMP_ICON = { REST: '🔥', SHOP_CARD: '🃏', SHOP_HEAL: '🍲', SHOP_UPGRADE: '⚒️', BROKER: '🐾' };
  var PASSIVE_META = {
    SHIELD: { icon: '🛡', name: 'Bulwark' },
    ATTACK: { icon: '⚔', name: 'Warlord' },
    SPEED: { icon: '⚡', name: 'Vanguard' },
    HEALTH: { icon: '❤', name: 'Warden' },
    LOOT: { icon: '🪙', name: 'Quartermaster' },
    MARSHAL: { icon: '🚩', name: 'Marshal' }
  };

  // ---- API -----------------------------------------------------------
  var AUTH_TOKEN_KEY = 'sieglingsAuthToken';
  function authHeaders(extra) {
    var headers = extra || {};
    try {
      var token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
      if (token && token.indexOf('cookie:') !== 0 && !headers.Authorization) {
        headers.Authorization = 'Bearer ' + token;
      }
    } catch (e) { /* ignore */ }
    return headers;
  }
  var API_TIMEOUT_MS = 30000;

  function api(path, opts) {
    opts = opts || {};
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, API_TIMEOUT_MS) : null;
    return fetch(path, {
      method: opts.method || 'GET',
      headers: authHeaders(Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})),
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller ? controller.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { throw new Error(data && data.error ? data.error : ('Request failed (' + r.status + ')')); }
        return data;
      });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') {
        throw new Error('Request timed out. Check your connection and try again.');
      }
      throw e;
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      return data;
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // ---- helpers -------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function rarityKey(r) { return String(r || 'COMMON').toLowerCase(); }
  function rarityLabel(r) {
    var k = String(r || 'COMMON').toLowerCase();
    return k.charAt(0).toUpperCase() + k.slice(1);
  }
  /* Art URLs may already be percent-encoded (Firebase Storage object paths use
   * %2F). encodeURI would double-encode the % and 404 the image, so only
   * HTML/CSS-escape them. */
  function artAttr(url) { return esc(url); }
  function artCss(url) { return esc(String(url == null ? '' : url).replace(/'/g, '%27').replace(/\)/g, '%29')); }
  function elClass(element) { return 'el-' + (element || 'NEUTRAL'); }
  function icon(element) { return EL_ICON[element] || '◇'; }
  function elColor(element) { return EL_COLOR[element] || '#95a5a6'; }

  function showScreen(id) {
    ['loadingScreen', 'resumeScreen', 'setupScreen', 'mapScreen', 'campScreen', 'cacheScreen', 'brokerScreen', 'smithScreen', 'caravanScreen', 'eventScreen', 'minigameScreen', 'interactionResultScreen', 'battleScreen', 'recruitScreen', 'rewardScreen', 'resultScreen'].forEach(function (s) {
      var node = $(s); if (node) node.classList.toggle('hidden', s !== id);
    });
    // Battle and map are static, full-viewport screens (no page scroll —
    // only their own internal regions, like the map canvas, scroll).
    document.body.dataset.screen = id;
    if (id === 'battleScreen' || id === 'mapScreen') resetViewportScroll();
  }

  function resetViewportScroll() {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.requestAnimationFrame(function () {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }
  function toast(msg) {
    var t = $('siegeToast'); if (!t) return;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._h); toast._h = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }

  function rosterSiegelings(roster) {
    if (!roster) return [];
    if (Array.isArray(roster.siegelings)) return roster.siegelings;
    // Back-compat with older /api/siege/roster payloads that used the typo key.
    if (Array.isArray(roster.sieglings)) return roster.sieglings;
    return [];
  }

  function hasWarbandData(roster) {
    return rosterSiegelings(roster).length > 0;
  }

  function createLoadProgress(fillEl, countEl) {
    var pct = 8;
    var timer = null;
    if (fillEl) fillEl.style.width = pct + '%';
    timer = setInterval(function () {
      pct = Math.min(92, pct + (pct < 40 ? 9 : pct < 70 ? 5 : 2));
      if (fillEl) fillEl.style.width = pct + '%';
    }, 220);
    return {
      tick: function (loaded, total) {
        if (!countEl) return;
        if (total > 0) countEl.textContent = loaded + ' / ' + total;
        else countEl.textContent = loaded > 0 ? String(loaded) : '0';
      },
      complete: function (loaded, total) {
        clearInterval(timer);
        if (fillEl) fillEl.style.width = '100%';
        if (countEl && total > 0) countEl.textContent = loaded + ' / ' + total;
      },
      fail: function () {
        clearInterval(timer);
        if (fillEl) fillEl.style.width = '0%';
      },
      stop: function () {
        clearInterval(timer);
      }
    };
  }

  function fetchRoster(attempt) {
    attempt = attempt || 0;
    return api('/api/siege/roster').then(function (data) {
      var list = rosterSiegelings(data);
      if (list.length === 0 && attempt < 1) {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(fetchRoster(attempt + 1)); }, 600);
        });
      }
      if (!Array.isArray(data.siegelings)) data.siegelings = list;
      return data;
    });
  }

  function applyRoster(data) {
    state.roster = data;
    if (!state.knightId) {
      var starter = (data.knights || []).find(function (k) { return k.selectable && k.expeditionStarter; })
        || (data.knights || []).find(function (k) { return k.selectable; });
      if (starter) state.knightId = starter.id;
    }
  }

  function updateWarbandMeta() {
    var meta = $('warbandMeta');
    if (!meta) return;
    if (state.warbandLoading) {
      meta.textContent = 'Loading warband Siegelings...';
      return;
    }
    var list = rosterSiegelings(state.roster);
    if (!list.length) {
      meta.textContent = 'No Siegelings loaded yet.';
      return;
    }
    var starters = list.filter(function (s) { return s.expeditionStarter !== false; }).length;
    var locked = list.length - starters;
    var filtered = state.elementFilter === 'ALL'
      ? list.length
      : list.filter(function (s) { return s.element === state.elementFilter; }).length;
    meta.textContent = filtered + ' shown · ' + list.length + ' total · ' + starters + ' starters'
      + (locked > 0 ? (' · ' + locked + ' locked') : '');
  }

  function setWarbandLoading(active, loaded, total) {
    state.warbandLoading = active;
    var panel = $('warbandLoadPanel');
    var grid = $('sieglingGrid');
    var retry = $('warbandRetryBtn');
    if (panel) panel.classList.toggle('hidden', !active);
    if (grid) grid.classList.toggle('is-loading', active);
    if (retry) retry.classList.toggle('hidden', active);
    if (active && $('warbandLoadCount')) {
      $('warbandLoadCount').textContent = (loaded || 0) + (total ? (' / ' + total) : '');
    }
    updateWarbandMeta();
  }

  function ensureWarbandLoaded(force) {
    if (!force && hasWarbandData(state.roster)) {
      return Promise.resolve(state.roster);
    }
    if (state.warbandLoading && !force) {
      return new Promise(function (resolve, reject) {
        var waits = 0;
        var iv = setInterval(function () {
          waits++;
          if (!state.warbandLoading) {
            clearInterval(iv);
            hasWarbandData(state.roster) ? resolve(state.roster) : reject(new Error('Warband Siegelings failed to load.'));
          } else if (waits > 80) {
            clearInterval(iv);
            reject(new Error('Warband Siegelings timed out.'));
          }
        }, 250);
      });
    }
    var token = ++state.warbandLoadToken;
    var prog = createLoadProgress($('warbandLoadFill'), $('warbandLoadCount'));
    setWarbandLoading(true, 0, 0);
    if ($('warbandLoadText')) $('warbandLoadText').textContent = 'Loading warband Siegelings...';
    prog.tick(0, 0);
    return fetchRoster().then(function (data) {
      if (token !== state.warbandLoadToken) return data;
      applyRoster(data);
      var count = rosterSiegelings(data).length;
      prog.complete(count, count);
      if ($('warbandLoadText')) {
        $('warbandLoadText').textContent = count
          ? ('Loaded ' + count + ' Siegelings')
          : 'No Siegelings returned — check your connection and retry.';
      }
      if (!count) throw new Error('Warband Siegelings are still empty. Try again in a moment.');
      return data;
    }).catch(function (e) {
      if (token !== state.warbandLoadToken) throw e;
      prog.fail();
      if ($('warbandLoadText')) $('warbandLoadText').textContent = e.message || 'Could not load warband Siegelings.';
      if ($('warbandRetryBtn')) $('warbandRetryBtn').classList.remove('hidden');
      throw e;
    }).then(function (data) {
      if (token !== state.warbandLoadToken) return data;
      setWarbandLoading(false);
      return data;
    }, function (e) {
      if (token === state.warbandLoadToken) state.warbandLoading = false;
      updateWarbandMeta();
      throw e;
    });
  }

  // ---- boot ----------------------------------------------------------
  // A rotation while on the map strands the old axis's baked SVG geometry, so
  // re-render when the landscape/portrait mode actually flips (debounced —
  // resize fires in bursts during an orientation change).
  var mapOrientTimer = null;
  function onMapOrientationFlip() {
    if (mapOrientTimer) clearTimeout(mapOrientTimer);
    mapOrientTimer = setTimeout(function () {
      if (document.body.dataset.screen !== 'mapScreen') return;
      if (isPhoneLandscape() === mapLayoutLand) return; // axis unchanged — nothing to redo
      renderMap();
    }, 150);
  }

  function boot() {
    window.addEventListener('resize', onMapOrientationFlip);
    window.addEventListener('orientationchange', onMapOrientationFlip);
    wireStaticButtons();
    var t = token();
    if (t) {
      showScreen('loadingScreen');
      if ($('bootLoadStatus')) $('bootLoadStatus').textContent = 'Checking saved expedition...';
      api('/api/siege/state?token=' + encodeURIComponent(t)).then(function (run) {
        state.run = run;
        if (run.status === 'ACTIVE') { renderResumePrompt(run); }
        else { setToken(null); loadRoster(); }
      }).catch(function () { setToken(null); loadRoster(); });
    } else {
      loadRoster();
    }
  }

  /** A saved expedition was found: ask whether to continue it or start fresh,
   *  showing exactly where it left off (party HP, gold, floor, mid-battle). */
  function renderResumePrompt(run) {
    showScreen('resumeScreen');
    $('abandonBtn').classList.add('hidden');
    var node = (run.map || []).find(function (n) { return n.id === run.currentNodeId; });
    var floor = node ? (node.row + 1) : 1;
    $('resumeFloor').textContent = '📍 Floor ' + floor;
    $('resumeGold').textContent = '🪙 ' + (run.gold || 0);
    var battleChip = $('resumeBattle');
    if (run.battle) {
      battleChip.classList.remove('hidden');
      battleChip.textContent = '⚔ Battle in progress · Round ' + (run.battle.roundNumber || 1);
      $('resumeNote').textContent = 'You closed the app mid-battle — pick up right where you left off.';
    } else {
      battleChip.classList.add('hidden');
      $('resumeNote').textContent = 'An expedition is already in progress.';
    }
    renderPartyStrip($('resumeParty'), run.party || [], run.knight);
  }

  function loadRoster() {
    showScreen('loadingScreen');
    var prog = createLoadProgress($('bootLoadFill'), $('bootLoadCount'));
    if ($('bootLoadStatus')) $('bootLoadStatus').textContent = 'Preparing the expedition...';
    prog.tick(0, 0);
    fetchRoster().then(function (data) {
      applyRoster(data);
      var count = rosterSiegelings(data).length;
      prog.complete(count, count);
      if ($('bootLoadStatus')) {
        $('bootLoadStatus').textContent = count
          ? ('Loaded ' + count + ' Siegelings for the warband')
          : 'Expedition roster is empty — retrying on the warband step.';
      }
      state.setupStep = 'mode';
      try {
        renderSetup();
      } catch (e) {
        if ($('bootLoadStatus')) $('bootLoadStatus').textContent = e.message || 'Could not open expedition setup.';
        toast(e.message || 'Could not open expedition setup.');
      }
    }).catch(function (e) {
      prog.fail();
      if ($('bootLoadStatus')) $('bootLoadStatus').textContent = e.message || 'Could not load expedition roster.';
      toast(e.message || 'Could not load expedition roster.');
    });
  }

  function wireStaticButtons() {
    var chooseSiegeMode = $('chooseSiegeMode');
    if (chooseSiegeMode) {
      chooseSiegeMode.addEventListener('click', function () {
        state.setupStep = 'knight';
        renderSetup();
      });
    }
    var chooseBattlegroundsMode = $('chooseBattlegroundsMode');
    if (chooseBattlegroundsMode) {
      chooseBattlegroundsMode.addEventListener('click', function () {
        refreshBattlegroundsEntry();
        openBattlegroundsModal();
      });
    }
    var modeBackBtn = $('modeBackBtn');
    if (modeBackBtn) {
      modeBackBtn.addEventListener('click', function () {
        state.setupStep = 'mode';
        renderSetup();
      });
    }
    $('knightNextBtn').addEventListener('click', function () {
      state.setupStep = 'party';
      renderSetup();
    });
    $('partyBackBtn').addEventListener('click', function () { state.setupStep = 'knight'; renderSetup(); });
    var warbandRetryBtn = $('warbandRetryBtn');
    if (warbandRetryBtn) {
      warbandRetryBtn.addEventListener('click', function () {
        ensureWarbandLoaded(true).then(function () {
          renderPartyStepContent();
        }).catch(function (e) { toast(e.message); });
      });
    }
    $('startRunBtn').addEventListener('click', startRun);
    $('endTurnBtn').addEventListener('click', endTurn);
    $('knightUltBtn').addEventListener('click', useUltimate);
    $('rewardSkipBtn').addEventListener('click', function () { chooseReward('skip'); });
    $('gachaClaimBtn').addEventListener('click', claimRecruit);
    $('interactionResultBtn').addEventListener('click', ackInteractionResult);
    $('inventoryBtn').addEventListener('click', function () { openInventory(); });
    var extractBtn = $('extractBtn');
    if (extractBtn) extractBtn.addEventListener('click', extractTeam);
    $('invClose').addEventListener('click', function () { $('invOverlay').classList.add('hidden'); });
    $('invOverlay').addEventListener('click', function (e) { if (e.target === $('invOverlay')) $('invOverlay').classList.add('hidden'); });
    $('smithLeaveBtn').addEventListener('click', function () { simplePost('/api/siege/smith/leave'); });
    $('smithScrapBtn').addEventListener('click', function () { toggleSmithScrap(); });
    $('caravanLeaveBtn').addEventListener('click', function () { simplePost('/api/siege/caravan/leave'); });
    $('resultBtn').addEventListener('click', function () { setToken(null); location.href = '/play'; });
    $('campLeaveBtn').addEventListener('click', campLeave);
    $('cacheDigBtn').addEventListener('click', cacheDig);
    $('cacheTakeBtn').addEventListener('click', cacheTake);
    $('brokerLeaveBtn').addEventListener('click', brokerLeave);
    $('battleLog').addEventListener('click', function () { toggleLedger(true); });
    $('ledgerClose').addEventListener('click', function () { toggleLedger(false); });
    $('unitModalClose').addEventListener('click', closeUnitModal);
    $('unitModal').addEventListener('click', function (e) { if (e.target === $('unitModal')) closeUnitModal(); });
    var knightLockClose = $('knightLockClose');
    var knightLockDismiss = $('knightLockDismiss');
    var knightLockModal = $('knightLockModal');
    var knightLockUnlockBtn = $('knightLockUnlockBtn');
    if (knightLockClose) knightLockClose.addEventListener('click', closeKnightLockModal);
    if (knightLockDismiss) knightLockDismiss.addEventListener('click', closeKnightLockModal);
    if (knightLockModal) {
      knightLockModal.addEventListener('click', function (e) {
        if (e.target === knightLockModal) closeKnightLockModal();
      });
    }
    if (knightLockUnlockBtn) {
      knightLockUnlockBtn.addEventListener('click', function () {
        var k = state.pendingKnightUnlock;
        if (!k || !k.canUnlock || (state.roster.gold || 0) < (k.unlockCost || 0)) return;
        unlockKnight(k);
        closeKnightLockModal();
      });
    }
    var bgEntry = $('battlegroundsEntry');
    if (bgEntry) {
      bgEntry.addEventListener('click', openBattlegroundsModal);
      bgEntry.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBattlegroundsModal(); }
      });
    }
    var bgModal = $('bgModal');
    var bgModalClose = $('bgModalClose');
    var bgModalDismiss = $('bgModalDismiss');
    if (bgModalClose) bgModalClose.addEventListener('click', closeBattlegroundsModal);
    if (bgModalDismiss) bgModalDismiss.addEventListener('click', closeBattlegroundsModal);
    if (bgModal) {
      bgModal.addEventListener('click', function (e) { if (e.target === bgModal) closeBattlegroundsModal(); });
    }
    var bgVetGrid = $('bgVeteranGrid');
    if (bgVetGrid) bgVetGrid.addEventListener('click', function (e) { onBgVeteranPick(e); });
    var bgKnGrid = $('bgKnightGrid');
    if (bgKnGrid) bgKnGrid.addEventListener('click', function (e) { onBgKnightPick(e); });
    var bgTierRow = $('bgTierRow');
    if (bgTierRow) bgTierRow.addEventListener('click', function (e) { onBgTierPick(e); });
    var bgEnterBtn = $('bgEnterBtn');
    if (bgEnterBtn) bgEnterBtn.addEventListener('click', enterBattlegrounds);
    var boonChoices = $('boonChoices');
    if (boonChoices) boonChoices.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.boon-choice') : null;
      if (b) pickBoon(b.getAttribute('data-boon'));
    });
    var bgShopOpen = $('bgShopOpen');
    if (bgShopOpen) bgShopOpen.addEventListener('click', openBgShop);
    var bgShopClose = $('bgShopClose');
    if (bgShopClose) bgShopClose.addEventListener('click', function () { $('bgShopModal').classList.add('hidden'); });
    var bgShopDismiss = $('bgShopDismiss');
    if (bgShopDismiss) bgShopDismiss.addEventListener('click', function () { $('bgShopModal').classList.add('hidden'); });
    var bgShopList = $('bgShopList');
    if (bgShopList) bgShopList.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.bg-shop-buy') : null;
      if (b && !b.disabled) buyBgItem(b.getAttribute('data-item'));
    });
    $('abandonBtn').addEventListener('click', function () {
      if (confirm('Abandon this expedition?')) { setToken(null); state.run = null; state.party = []; state.knightId = null; loadRoster(); }
    });
    $('resumeContinueBtn').addEventListener('click', function () { renderRun(); });
    $('resumeRestartBtn').addEventListener('click', function () {
      if (!confirm('Start over? Your current expedition (progress, gold, party) will be lost.')) return;
      var t = token();
      setToken(null); state.run = null; state.party = []; state.knightId = null;
      api('/api/siege/run/abandon', { method: 'POST', body: { token: t } }).catch(function () {}).then(loadRoster);
    });
  }

  // ---- team select (paged: mode -> knight -> warband) -------------------
  function renderSetup() {
    showScreen('setupScreen');
    $('abandonBtn').classList.add('hidden');
    var order = { mode: 0, knight: 1, party: 2 };
    if (order[state.setupStep] == null) state.setupStep = 'mode';
    var onMode = state.setupStep === 'mode';
    var onKnight = state.setupStep === 'knight';
    var onParty = state.setupStep === 'party';
    $('setupStepMode').classList.toggle('hidden', !onMode);
    $('setupStepKnight').classList.toggle('hidden', !onKnight);
    $('setupStepParty').classList.toggle('hidden', !onParty);
    setSetupStepState('stepDotMode', 'mode', order);
    setSetupStepState('stepDotKnight', 'knight', order);
    setSetupStepState('stepDotParty', 'party', order);
    if (onMode) renderModeStep();
    else if (onKnight) renderKnightStep();
    else renderPartyStep();
  }

  function setSetupStepState(id, step, order) {
    var node = $(id);
    if (!node) return;
    var cls = 'setup-step';
    if (state.setupStep === step) cls += ' active';
    else if (order[step] < order[state.setupStep]) cls += ' done';
    node.className = cls;
  }

  function renderModeStep() {
    refreshBattlegroundsEntry();
  }

  function specSummary(spec) {
    if (!spec) return '';
    switch (spec.effect) {
      case 'DAMAGE': return '⚔ ' + spec.value + ' dmg · ' + spec.actionCost + ' AP';
      case 'HEAL': return '➕ heal ' + spec.value + ' · ' + spec.actionCost + ' AP';
      case 'SHIELD': return '🛡 shield ' + spec.value + ' · ' + spec.actionCost + ' AP';
      case 'BUFF_ATK': return '↑ +' + spec.value + ' attack · ' + spec.actionCost + ' AP';
      case 'BUFF_SPD': return '↑ +' + spec.value + ' speed · ' + spec.actionCost + ' AP';
      case 'SLOW': return '❄ slow · ' + spec.actionCost + ' AP';
      case 'SWAP': return '⇄ swap notches · ' + spec.actionCost + ' AP';
      case 'EVOLVE': return '🌟 evolve · ' + spec.actionCost + ' AP';
      default: return spec.effect;
    }
  }

  function renderKnightStep() {
    var r = state.roster;
    var kg = $('knightGrid'); kg.innerHTML = '';
    var gold = r.gold || 0;
    r.knights.slice().sort(function (a, b) {
      if (a.selectable !== b.selectable) return a.selectable ? -1 : 1;
      if (a.expeditionStarter !== b.expeditionStarter) return a.expeditionStarter ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).forEach(function (k) {
      var locked = !k.selectable;
      var canAffordUnlock = locked && k.canUnlock && gold >= (k.unlockCost || 0);
      var c = el('div', 'knight-card ' + elClass(k.element) + (k.id === state.knightId ? ' sel' : '') + (locked ? ' locked' : ''));
      var summary = specSummary(k.active);
      var pm = PASSIVE_META[k.passiveKind];
      var passiveChip = pm
        ? '<span class="kpassive-chip pk-' + k.passiveKind + '">' + pm.icon + ' ' + esc(k.passiveName || pm.name) + '</span>'
        : '';
      var lockNote = '';
      if (locked) {
        if (k.canUnlock) {
          lockNote = '<div class="klock-note">Owned in collection — unlock for raids</div>' +
            '<button class="kunlock-btn" type="button" data-knight="' + esc(k.id) + '"' +
            (canAffordUnlock ? '' : ' disabled') + '>Unlock · 🪙 ' + k.unlockCost + '</button>';
        } else if (!r.loggedIn) {
          lockNote = '<div class="klock-note">🔒 Sign in to unlock</div>';
        } else if (!k.owned) {
          lockNote = '<div class="klock-note">🔒 Own this SiegeKnight card first</div>';
        } else {
          lockNote = '<div class="klock-note">🔒 Locked for expeditions</div>';
        }
      }
      c.innerHTML =
        (locked ? '<div class="knight-lock">🔒</div>' : '') +
        '<div class="kname">' + icon(k.element) + ' ' + esc(k.name) + '</div>' +
        '<div class="kability"><span class="kability-name">' + esc(k.activeName) + '</span>' +
        (summary ? ' <span class="kability-sum">' + summary + '</span>' : '') + '</div>' +
        (k.activeDesc ? '<div class="kdesc">' + esc(k.activeDesc) + '</div>' : '') +
        '<div class="kpassive">' + passiveChip + ' ' + esc(k.passive || '') + '</div>' +
        lockNote;
      if (!locked) {
        c.addEventListener('click', function () {
          state.knightId = k.id;
          renderKnightStep();
        });
      } else {
        var unlockBtn = c.querySelector('.kunlock-btn');
        if (unlockBtn) {
          unlockBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (canAffordUnlock) unlockKnight(k);
            else showKnightLockModal(k);
          });
        }
        c.addEventListener('click', function () {
          showKnightLockModal(k);
        });
      }
      kg.appendChild(c);
    });
    var kn = r.knights.find(function (k) { return k.id === state.knightId; });
    if (kn && !kn.selectable) {
      state.knightId = (r.knights.find(function (k) { return k.selectable; }) || {}).id || null;
      kn = r.knights.find(function (k) { return k.id === state.knightId; });
    }
    $('knightNextBtn').disabled = !kn;
    $('knightSummary').textContent = kn
      ? (kn.name + ' — ' + kn.activeName + (r.loggedIn ? ' · 🪙 ' + gold : ''))
      : 'Select a SiegeKnight.';
  }

  function closeKnightLockModal() {
    var modal = $('knightLockModal');
    if (!modal) return;
    modal.classList.add('hidden');
    state.pendingKnightUnlock = null;
  }

  // ---- Battlegrounds (secondary mode) ----------------------------------
  // Phase 3 core: with >=3 banked veterans the entry opens a squad-pick lobby
  // (3 veteran Siegelings + a veteran knight) that launches a real BATTLEGROUNDS
  // run; otherwise it shows the requirements checklist. Extracted veterans live on
  // state.roster.veterans (flat) and state.roster.veteranTeams (full snapshots).
  var BG_VETERANS_REQUIRED = 3;

  function battlegroundsVeterans() {
    var v = state.roster && state.roster.veterans;
    return Array.isArray(v) ? v : [];
  }

  function battlegroundsReady() {
    return battlegroundsVeterans().length >= BG_VETERANS_REQUIRED;
  }

  function refreshBattlegroundsEntry() {
    var lock = $('bgEntryLock');
    var ready = battlegroundsReady();
    var have = battlegroundsVeterans().length;
    if (lock && ready) {
      lock.textContent = '✓ Ready';
      lock.classList.add('ready');
    } else if (lock) {
      lock.textContent = '🔒 Locked';
      lock.classList.remove('ready');
    }
    var modeStatus = $('modeBgStatus');
    if (modeStatus) {
      modeStatus.textContent = ready ? 'Ready' : ('Locked ' + have + '/' + BG_VETERANS_REQUIRED);
      modeStatus.classList.toggle('ready', ready);
    }
    var modeMeta = $('modeBgMeta');
    if (modeMeta) {
      modeMeta.textContent = ready
        ? 'Veteran squad available'
        : 'Requires ' + BG_VETERANS_REQUIRED + ' banked veterans';
    }
  }

  function veteranTeams() {
    var t = state.roster && state.roster.veteranTeams;
    return Array.isArray(t) ? t : [];
  }

  function vetKey(v) { return String(v.teamId) + '|' + String(v.sourceCardId); }

  function openBattlegroundsModal() {
    var modal = $('bgModal');
    if (!modal) return;
    var ready = battlegroundsReady();
    if (ready) renderBattlegroundsLobby();
    else renderBattlegroundsRequirements();
    modal.classList.remove('hidden');
  }

  // When the player can't field a squad yet: the original requirements checklist.
  function renderBattlegroundsRequirements() {
    var have = battlegroundsVeterans().length;
    setHidden('bgLobby', true);
    setHidden('bgReqList', false);
    setHidden('bgEnterBtn', true);
    var msg = $('bgModalMsg');
    if (msg) msg.textContent = 'A higher-stakes second mode: bring a team you leveled up and extracted from a Siege run to earn greater rewards.';
    var reqs = [
      { done: have >= 1, label: 'Complete a Siege expedition and extract a team (your Siegelings keep the level they reached).' },
      { done: have >= BG_VETERANS_REQUIRED, label: 'Bank at least ' + BG_VETERANS_REQUIRED + ' veteran Siegelings — you have ' + have + '.' },
      { done: false, label: 'Enter with 3 veterans + a veteran SiegeKnight at their extracted levels.' }
    ];
    var list = $('bgReqList');
    if (list) {
      list.innerHTML = reqs.map(function (r) {
        return '<div class="bg-req ' + (r.done ? 'met' : 'todo') + '">' +
          '<span class="bg-req-mark">' + (r.done ? '✓' : '○') + '</span>' +
          '<span class="bg-req-text">' + esc(r.label) + '</span></div>';
      }).join('');
    }
    var foot = $('bgModalFoot');
    if (foot) foot.textContent = 'Battlegrounds unlocks once you can bank at least 3 veteran Siegelings.';
  }

  // Ready: a squad-pick lobby (choose 3 veterans + a veteran knight, then launch).
  function renderBattlegroundsLobby() {
    if (!state.bgPicks) state.bgPicks = [];
    setHidden('bgReqList', true);
    setHidden('bgLobby', false);
    setHidden('bgEnterBtn', false);
    var msg = $('bgModalMsg');
    if (msg) msg.textContent = 'Field a squad of 3 extracted Siegelings and a veteran knight. Rewards: gold ×2.5, score ×3 — enemies scale to your veterans.';
    var foot = $('bgModalFoot');
    if (foot) foot.textContent = 'Your veterans keep leveling — a win re-banks them at their new levels.';

    // Warmarks balance + tier picker (tiers unlock as you clear them).
    var wm = $('bgWarmarks');
    if (wm) wm.textContent = '🎖️ ' + ((state.roster && state.roster.warmarks) || 0) + ' Warmarks';
    var unlocked = Math.max(1, (state.roster && state.roster.battlegroundsUnlockedTier) || 1);
    var maxTier = (state.roster && state.roster.battlegroundsMaxTier) || 5;
    if (!state.bgTier || state.bgTier > unlocked) state.bgTier = unlocked;
    var tr = $('bgTierRow');
    if (tr) {
      var roman = ['I', 'II', 'III', 'IV', 'V'];
      var html = '';
      for (var t = 1; t <= maxTier; t++) {
        var locked = t > unlocked;
        html += '<button type="button" class="bg-tier' + (state.bgTier === t ? ' picked' : '') +
          (locked ? ' locked' : '') + '" data-tier="' + t + '"' + (locked ? ' disabled' : '') + '>' +
          (locked ? '🔒 ' : '') + (roman[t - 1] || t) + '</button>';
      }
      tr.innerHTML = html;
    }

    var now = Date.now();
    var vets = battlegroundsVeterans();
    var vg = $('bgVeteranGrid');
    if (vg) {
      vg.innerHTML = vets.map(function (v) {
        var key = vetKey(v);
        var sel = state.bgPicks.indexOf(key) >= 0;
        var locked = (v.lockedUntil || 0) > now;
        var lockNote = locked ? '<span class="bg-vet-lock">😴 ' + bgLockText(v.lockedUntil, now) + '</span>' : '';
        return '<button type="button" class="bg-vet ' + elClass(v.element) + (sel ? ' picked' : '') +
          (locked ? ' locked' : '') + '" data-key="' + esc(key) + '"' + (locked ? ' disabled' : '') + '>' +
          '<span class="bg-vet-el">' + icon(v.element) + '</span>' +
          '<span class="bg-vet-name">' + esc(v.name) + '</span>' +
          '<span class="bg-vet-lv">Lv ' + (v.level || 1) + '</span>' + lockNote + '</button>';
      }).join('');
    }
    var kg = $('bgKnightGrid');
    if (kg) {
      kg.innerHTML = veteranTeams().map(function (t) {
        var k = t.knight || {};
        var sel = state.bgKnightTeamId === t.teamId;
        return '<button type="button" class="bg-knight ' + elClass(k.element) + (sel ? ' picked' : '') +
          '" data-team="' + esc(t.teamId) + '">' +
          '<span class="bg-vet-el">' + icon(k.element) + '</span>' +
          '<span class="bg-vet-name">' + esc(k.knightName || 'Knight') + '</span>' +
          '<span class="bg-vet-lv">Lv ' + (k.level || 1) + '</span></button>';
      }).join('');
    }
    updateBgEnter();
  }

  function bgLockText(until, now) {
    var ms = Math.max(0, (until || 0) - now);
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }

  function onBgTierPick(e) {
    var btn = e.target.closest ? e.target.closest('.bg-tier') : null;
    if (!btn || btn.disabled) return;
    state.bgTier = parseInt(btn.getAttribute('data-tier'), 10) || 1;
    renderBattlegroundsLobby();
  }

  function onBgVeteranPick(e) {
    var btn = e.target.closest ? e.target.closest('.bg-vet') : null;
    if (!btn || btn.disabled) return;
    if (!state.bgPicks) state.bgPicks = [];
    var key = btn.getAttribute('data-key');
    var at = state.bgPicks.indexOf(key);
    if (at >= 0) state.bgPicks.splice(at, 1);
    else if (state.bgPicks.length < BG_VETERANS_REQUIRED) state.bgPicks.push(key);
    else { toast('Pick exactly ' + BG_VETERANS_REQUIRED + ' veterans.'); return; }
    renderBattlegroundsLobby();
  }

  function onBgKnightPick(e) {
    var btn = e.target.closest ? e.target.closest('.bg-knight') : null;
    if (!btn) return;
    state.bgKnightTeamId = btn.getAttribute('data-team');
    renderBattlegroundsLobby();
  }

  function updateBgEnter() {
    var btn = $('bgEnterBtn');
    if (!btn) return;
    var picks = state.bgPicks || [];
    btn.disabled = !(picks.length === BG_VETERANS_REQUIRED && state.bgKnightTeamId);
  }

  function enterBattlegrounds() {
    if (state.busy) return;
    var picks = state.bgPicks || [];
    if (picks.length !== BG_VETERANS_REQUIRED || !state.bgKnightTeamId) return;
    var members = picks.map(function (k) {
      var parts = k.split('|');
      return { teamId: parts[0], sourceCardId: parts.slice(1).join('|') };
    });
    state.busy = true;
    api('/api/siege/battlegrounds/new', { method: 'POST', body: { members: members, knightTeamId: state.bgKnightTeamId, tier: state.bgTier || 1 } })
      .then(function (run) {
        closeBattlegroundsModal();
        state.bgPicks = []; state.bgKnightTeamId = null;
        setToken(run.token); applyRun(run);
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- Boon pick overlay (gates travel until chosen) -------------------
  function maybeShowBoonOffer(run) {
    var modal = $('boonModal');
    if (!modal) return false;
    var offer = run && run.boonOffer;
    if (!offer || !offer.length) { modal.classList.add('hidden'); return false; }
    var host = $('boonChoices');
    if (host) {
      host.innerHTML = offer.map(function (b) {
        return '<button type="button" class="boon-choice" data-boon="' + esc(b.id) + '">' +
          '<span class="boon-icon">' + esc(b.icon || '✨') + '</span>' +
          '<span class="boon-name">' + esc(b.name) + '</span>' +
          '<span class="boon-desc">' + esc(b.desc || '') + '</span></button>';
      }).join('');
    }
    modal.classList.remove('hidden');
    return true;
  }

  function pickBoon(boonId) {
    if (state.busy || !boonId) return;
    state.busy = true;
    api('/api/siege/battlegrounds/boon', { method: 'POST', body: { token: token(), boonId: boonId } })
      .then(function (run) { var m = $('boonModal'); if (m) m.classList.add('hidden'); applyRun(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- Warmarks shop --------------------------------------------------
  function openBgShop() {
    var modal = $('bgShopModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderBgShop();
  }

  function renderBgShop() {
    api('/api/siege/battlegrounds/shop', { method: 'GET' })
      .then(function (data) {
        var bal = $('bgShopBalance');
        if (bal) bal.textContent = '🎖️ ' + (data.warmarks || 0) + ' Warmarks';
        var list = $('bgShopList');
        if (!list) return;
        list.innerHTML = (data.items || []).map(function (it) {
          var afford = (data.warmarks || 0) >= it.cost && !it.owned;
          return '<div class="bg-shop-item">' +
            '<span class="bg-shop-icon">' + esc(it.icon || '🎁') + '</span>' +
            '<span class="bg-shop-body"><span class="bg-shop-name">' + esc(it.name) + '</span>' +
            '<span class="bg-shop-desc">' + esc(it.desc || '') + '</span></span>' +
            (it.owned
              ? '<span class="bg-shop-owned">Owned</span>'
              : '<button type="button" class="siege-btn bg-shop-buy" data-item="' + esc(it.id) + '"' +
                (afford ? '' : ' disabled') + '>🎖️ ' + it.cost + '</button>') +
            '</div>';
        }).join('');
      })
      .catch(function (e) { toast(e.message); });
  }

  function buyBgItem(itemId) {
    if (state.busy || !itemId) return;
    state.busy = true;
    api('/api/siege/battlegrounds/shop/buy', { method: 'POST', body: { itemId: itemId } })
      .then(function (data) {
        toast('Purchased!');
        if (state.roster) state.roster.warmarks = data.warmarks;
        renderBgShop();
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function setHidden(id, hidden) {
    var el = $(id);
    if (el) el.classList.toggle('hidden', !!hidden);
  }

  function closeBattlegroundsModal() {
    var modal = $('bgModal');
    if (modal) modal.classList.add('hidden');
  }

  function showKnightLockModal(k) {
    if (!k) return;
    var modal = $('knightLockModal');
    if (!modal) {
      if (k.canUnlock) toast('You own ' + k.name + '. Unlock them for raids with ' + (k.unlockCost || 0) + ' Siegecoins.');
      else if (!state.roster || !state.roster.loggedIn) toast('Sign in to unlock SiegeKnights for expeditions.');
      else if (!k.owned) toast('Own ' + k.name + ' before unlocking them for expeditions.');
      else toast(k.name + ' is locked for expeditions.');
      return;
    }
    state.pendingKnightUnlock = k;
    var r = state.roster || {};
    var gold = r.gold || 0;
    var cost = k.unlockCost || 0;
    var canAfford = k.canUnlock && gold >= cost;
    var title = $('knightLockTitle');
    var kicker = $('knightLockKicker');
    var msg = $('knightLockMsg');
    var balance = $('knightLockBalance');
    var unlockBtn = $('knightLockUnlockBtn');
    if (title) title.textContent = k.name;
    if (k.canUnlock) {
      var shortfall = Math.max(0, cost - gold);
      if (kicker) kicker.textContent = 'Card owned';
      if (msg) {
        msg.textContent = shortfall > 0
          ? 'You own this SiegeKnight in your collection. Unlock them for Siege raids for ' + cost + ' Siegecoins — you need ' + shortfall + ' more.'
          : 'You own this SiegeKnight in your collection. Spend ' + cost + ' Siegecoins to unlock them for Siege raids.';
      }
      if (balance) {
        balance.innerHTML = 'Your balance: <strong>🪙 ' + gold + '</strong> · Raid unlock: <strong>🪙 ' + cost + '</strong>';
      }
    } else if (!r.loggedIn) {
      if (kicker) kicker.textContent = 'Sign in required';
      if (msg) msg.textContent = 'Sign in to unlock SiegeKnights for expeditions.';
      if (balance) balance.textContent = '';
    } else if (!k.owned) {
      if (kicker) kicker.textContent = 'Card not owned';
      if (msg) msg.textContent = 'Own the ' + k.name + ' SiegeKnight card in your collection before you can unlock them for Siege raids.';
      if (balance) balance.textContent = '';
    } else {
      if (kicker) kicker.textContent = 'Locked';
      if (msg) msg.textContent = k.name + ' is locked for expeditions.';
      if (balance) balance.textContent = '';
    }
    if (unlockBtn) {
      if (k.canUnlock) {
        unlockBtn.hidden = false;
        unlockBtn.disabled = !canAfford;
        unlockBtn.classList.toggle('is-disabled', !canAfford);
        unlockBtn.textContent = canAfford
          ? ('Unlock · 🪙 ' + cost)
          : ('Unlock · 🪙 ' + cost + ' (need more)');
      } else {
        unlockBtn.hidden = true;
        unlockBtn.disabled = true;
        unlockBtn.classList.remove('is-disabled');
      }
    }
    modal.classList.remove('hidden');
  }

  function unlockKnight(k) {
    if (state.busy || !k || !k.canUnlock) return;
    if ((state.roster.gold || 0) < k.unlockCost) {
      toast('Need ' + k.unlockCost + ' Siegecoins to unlock ' + k.name + '.');
      return;
    }
    state.busy = true;
    api('/api/siege/knight/unlock', { method: 'POST', body: { knightId: k.id } })
      .then(function (data) {
        if (data.knights) state.roster = data;
        else return api('/api/siege/roster').then(function (roster) { state.roster = roster; });
      })
      .then(function () {
        state.knightId = k.id;
        closeKnightLockModal();
        renderKnightStep();
        toast(k.name + ' unlocked for expeditions!');
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function renderEndlessSlots() {
    var host = $('endlessSlots');
    if (!host) {
      host = el('div', 'endless-slots');
      host.id = 'endlessSlots';
      var footer = $('startRunBtn') ? $('startRunBtn').parentNode : null;
      if (footer && footer.parentNode) footer.parentNode.insertBefore(host, footer);
    }
    host.innerHTML = '';
    var slots = teamSlots();
    if (!slots.some(function (x) { return x; })) return;
    host.appendChild(el('div', 'endless-title', '🔁 Endless Run — score attack with a saved team'));
    slots.forEach(function (slot, i) {
      if (!slot) return;
      var btn = el('button', 'siege-btn endless-btn', '★ ' + esc(slot.name) + ' — Start Endless');
      btn.addEventListener('click', function () { startEndless(slot); });
      host.appendChild(btn);
    });
  }

  function renderPartyStep() {
    renderEndlessSlots();
    updateWarbandMeta();
    if (!hasWarbandData(state.roster)) {
      ensureWarbandLoaded().then(function () {
        renderPartyStepContent();
      }).catch(function (e) { toast(e.message); });
      return;
    }
    renderPartyStepContent();
  }

  function renderPartyStepContent() {
    var siegelings = rosterSiegelings(state.roster);
    var elements = ['ALL'];
    siegelings.forEach(function (s) { if (elements.indexOf(s.element) < 0) elements.push(s.element); });
    var fr = $('elementFilter'); fr.innerHTML = '';
    elements.forEach(function (elm) {
      var chip = el('button', 'filter-chip' + (elm === state.elementFilter ? ' active' : ''), elm === 'ALL' ? 'All' : (icon(elm) + ' ' + elm));
      chip.addEventListener('click', function () {
        state.elementFilter = elm;
        renderSieglingGrid();
        updateWarbandMeta();
        Array.prototype.forEach.call(fr.children, function (n) { n.classList.remove('active'); });
        chip.classList.add('active');
      });
      fr.appendChild(chip);
    });
    renderSieglingGrid();
    refreshSetupFooter();
    refreshBattlegroundsEntry();
    updateWarbandMeta();
  }

  function renderSieglingGrid() {
    var grid = $('sieglingGrid'); grid.innerHTML = '';
    if (!state.roster || !hasWarbandData(state.roster)) return;
    rosterSiegelings(state.roster).filter(function (s) {
      return state.elementFilter === 'ALL' || s.element === state.elementFilter;
    }).sort(function (a, b) {
      if (a.expeditionStarter !== b.expeditionStarter) return a.expeditionStarter ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).forEach(function (s) {
      var picked = state.party.indexOf(s.id);
      var locked = s.expeditionStarter === false;
      var c = el('div', 'sgl-card ' + elClass(s.element) + (picked >= 0 ? ' sel' : '') + (locked ? ' locked' : ''));
      var art = s.artUrl
        ? '<div class="sart" style="background-image:url(\'' + artCss(s.artUrl) + '\')"></div>'
        : '<div class="sart sart-fallback">' + icon(s.element) + '</div>';
      c.innerHTML =
        (picked >= 0 ? '<div class="selorder">' + (picked + 1) + '</div>' : '') +
        (locked ? '<div class="sgl-lock" title="Find on the expedition path">🔒</div>' : '') +
        '<button class="info-btn" type="button" title="View cards">ⓘ</button>' +
        art +
        '<div class="sname">' + esc(s.name) + (s.evolves ? ' <span class="evo-tag" title="Its Evolution card joins your battle deck — play it for 2 AP to evolve">EVO ↑</span>' : '') + '</div>' +
        '<div class="schips">' +
          '<span class="schip">' + icon(s.element) + ' ' + esc(s.element) + (locked ? ' · locked' : '') + '</span>' +
          '<span class="rarity-tag rarity-' + rarityKey(s.rarity) + '">' + esc(rarityLabel(s.rarity)) + '</span>' +
        '</div>' +
        '<div class="sstats"><span>❤ ' + s.hp + '</span><span>⚡ ' + s.speed + '</span><span>🃏 ' + s.moveCount + '</span></div>';
      if (!locked) {
        c.addEventListener('click', function () { toggleSiegling(s.id); });
      } else {
        c.addEventListener('click', function () { toast('Find ' + s.name + ' on the expedition path to recruit them.'); });
      }
      c.querySelector('.info-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        showUnitModal({
          name: s.name, element: s.element, artUrl: s.artUrl,
          subtitle: '❤ ' + s.hp + ' · ⚡ ' + s.speed + (s.evolves ? ' · Evolution card in battle deck (2 AP)' : '') + (locked ? ' · Locked until found on the path' : ''),
          cards: s.moves || []
        });
      });
      grid.appendChild(c);
    });
  }

  function toggleSiegling(id) {
    var s = rosterSiegelings(state.roster).find(function (x) { return x.id === id; });
    if (s && s.expeditionStarter === false) {
      toast('Find ' + s.name + ' on the expedition path to recruit them.');
      return;
    }
    var i = state.party.indexOf(id);
    if (i >= 0) { state.party.splice(i, 1); }
    else {
      if (state.party.length >= (state.roster.partySize || 3)) { toast('You already have ' + (state.roster.partySize || 3) + ' Siegelings.'); return; }
      state.party.push(id);
    }
    renderSieglingGrid();
    refreshSetupFooter();
  }

  function refreshSetupFooter() {
    if (!state.roster) return;
    var need = state.roster.partySize || 1;
    var ready = state.knightId && state.party.length === need;
    $('startRunBtn').disabled = !ready;
    var names = state.party.map(function (id) {
      var s = rosterSiegelings(state.roster).find(function (x) { return x.id === id; });
      return s ? s.name : id;
    });
    $('setupSummary').textContent = 'Warband (' + state.party.length + '/' + need + '): ' + (names.join(', ') || '—');
  }

  // ---- saved team slots (endless mode) ----------------------------------
  var SLOTS_KEY = 'siegeTeamSlots';
  function teamSlots() {
    try { return JSON.parse(localStorage.getItem(SLOTS_KEY) || '[null,null,null]'); }
    catch (e) { return [null, null, null]; }
  }
  function saveTeamSlot(i, slot) {
    var slots = teamSlots(); slots[i] = slot;
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); } catch (e) {}
  }

  function startRun() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/run/new', { method: 'POST', body: { knightId: state.knightId, sieglingIds: state.party, mode: 'STANDARD' } })
      .then(function (run) { setToken(run.token); applyRun(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function startEndless(slot) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/run/new', { method: 'POST', body: { knightId: slot.knightId, sieglingIds: slot.sieglingIds, mode: 'ENDLESS' } })
      .then(function (run) { setToken(run.token); applyRun(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- unit detail modal (cards + abilities) ---------------------------
  function showUnitModal(u) {
    var body = $('unitModalBody');
    var art = u.artUrl
      ? '<div class="um-art" style="background-image:url(\'' + artCss(u.artUrl) + '\')"></div>'
      : '<div class="um-art um-art-fallback">' + icon(u.element) + '</div>';
    var cards = (u.cards || []).map(function (spec) {
      var status = spec.status && spec.statusChance
        ? '<span class="um-status">' + (STATUS_META[spec.status] || {}).icon + ' ' + spec.statusChance + '% ' + (STATUS_META[spec.status] || {}).label + '</span>'
        : '';
      return '<div class="um-card ' + elClass(spec.element) + '">' +
        '<span class="um-cost">' + spec.actionCost + '</span>' +
        '<div class="um-card-main"><div class="um-card-name">' + icon(spec.element) + ' ' + esc(spec.name) + '</div>' +
        '<div class="um-card-eff">' + specSummary(spec) + ' ' + status + '</div>' +
        (spec.description ? '<div class="um-card-desc">' + esc(spec.description) + '</div>' : '') +
        '</div></div>';
    }).join('');
    body.innerHTML =
      '<div class="um-head ' + elClass(u.element) + '">' + art +
      '<div><div class="um-name">' + icon(u.element) + ' ' + esc(u.name) + '</div>' +
      (u.subtitle ? '<div class="um-sub">' + esc(u.subtitle) + '</div>' : '') + '</div></div>' +
      '<div class="um-cards-title">' + (u.cards && u.cards.length ? 'Cards & abilities' : 'No cards') + '</div>' +
      '<div class="um-cards">' + cards + '</div>';
    $('unitModal').classList.remove('hidden');
  }
  function closeUnitModal() { $('unitModal').classList.add('hidden'); }

  // ---- run router ----------------------------------------------------
  function interactionClosed(run, source) {
    if (source === 'event') return true;
    if (source === 'camp') return !run.camp;
    if (source === 'cache') return !run.cache;
    if (source === 'broker') return !run.broker;
    if (source === 'smith') return !run.smith;
    if (source === 'caravan') return !run.caravan;
    return true;
  }

  function shouldDeferInteractionResult(run) {
    return !!(run.battle || run.recruit || (run.pendingRewards && run.pendingRewards.length));
  }

  /** After an interaction choice, show a popup for lastReward before map / next step. */
  function applyInteractionResponse(run, ctx) {
    state.run = run;
    if (shouldDeferInteractionResult(run)) {
      state.interactionResult = null;
      renderRun();
      return;
    }
    if (run.lastReward) {
      state.interactionResult = {
        message: run.lastReward,
        title: ctx.title || 'Outcome',
        icon: ctx.icon || '✨',
        returnToMap: interactionClosed(run, ctx.source)
      };
      renderInteractionResult();
      return;
    }
    state.interactionResult = null;
    renderRun();
  }

  function renderInteractionResult() {
    showScreen('interactionResultScreen');
    var ir = state.interactionResult || {};
    var run = state.run || {};
    $('interactionResultIcon').textContent = ir.icon || '✨';
    $('interactionResultTitle').textContent = ir.title || 'Outcome';
    $('interactionResultText').textContent = ir.message || '';
    $('interactionResultGold').textContent = '🪙 ' + (run.gold || 0);
  }

  function ackInteractionResult() {
    if (state.busy || !state.interactionResult) return;
    state.busy = true;
    var returnToMap = state.interactionResult.returnToMap;
    api('/api/siege/result/ack', { method: 'POST', body: { token: token() } })
      .then(function (run) {
        state.interactionResult = null;
        state.run = run;
        if (returnToMap) renderMap();
        else renderRun();
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function renderRun() {
    var run = state.run;
    if (!run) { loadRoster(); return; }
    $('abandonBtn').classList.toggle('hidden', run.status !== 'ACTIVE');
    if (run.battle) { renderBattle(); return; }
    // A freshly joined Siegeling gets its gacha reveal before anything else —
    // claim it, then the normal reward flow continues.
    if (run.recruit) { renderRecruitReveal(); return; }
    if (run.status === 'WON' || run.status === 'LOST') { renderResult(); return; }
    if (run.pendingRewards && run.pendingRewards.length) { renderRewards(); return; }
    if (state.interactionResult) { renderInteractionResult(); return; }
    if (run.camp) { renderCamp(); return; }
    if (run.cache) { renderCache(); return; }
    if (run.broker) { renderBroker(); return; }
    if (run.smith) { renderSmith(); return; }
    if (run.caravan) { renderCaravan(); return; }
    if (run.event) { renderEvent(); return; }
    if (run.minigame) { renderMinigame(); return; }
    renderMap();
  }

  /** Applies a fresh server state: plays pending battle events first, then renders. */
  function applyRun(run) {
    var events = run && run.battle && run.battle.events ? run.battle.events : [];
    var hadBattleDom = state.run && state.run.battle && !$('battleScreen').classList.contains('hidden');
    var enteringBattle = run && run.battle && !(state.run && state.run.battle);
    state.run = run;
    if (events.length && (hadBattleDom || enteringBattle)) {
      state.busy = true;
      state.deferBattleHandRender = events.some(function (ev) {
        return ev && (ev.type === 'discardHand' || ev.type === 'draw');
      });
      renderRun();
      state.deferBattleHandRender = false;
      playEvents(events, function () { renderRun(); afterRunApplied(run); });
      return;
    }
    renderRun();
    afterRunApplied(run);
  }

  // Battlegrounds run-state prompts: a pending boon pick (gates travel) and the
  // one-shot stage-2+ boss reveal reward.
  function afterRunApplied(run) {
    if (!run) return;
    if (maybeShowBoonOffer(run)) return;
    if (run.bossReveal && run.bossReveal.name) {
      var r = run.bossReveal;
      toast('⭐ Boss reveal: a stage-' + (r.stage || 2) + ' ' + r.name + ' salutes your victory!');
    }
  }

  // ---- branching map (SVG DAG, boss at the top) ------------------------
  // landPad / landLaneGap tighten the lane (cross) axis in phone landscape so a
  // 3-4 lane map fits the short scroll height without vertical scrolling; the
  // depth axis keeps rowGap and scrolls horizontally as intended.
  var MAP = { colGap: 96, rowGap: 104, pad: 56, r: 24, landPad: 40, landLaneGap: 60 };

  // Phone landscape is too short to stack the depth axis vertically, so there
  // the map is transposed to flow left→right (start left, boss right). This
  // guard mirrors the round-7 battle/map landscape breakpoint so map + battle
  // agree on when "landscape mode" is active.
  function isPhoneLandscape() {
    return matchMedia('(orientation: landscape) and (max-width: 979px) and (max-height: 600px)').matches;
  }
  // Remembers the axis the last renderMap() drew, so a rotation can detect the
  // flip and re-render (SVG geometry is baked at render time, not responsive).
  var mapLayoutLand = null;

  function renderMap() {
    showScreen('mapScreen');
    var run = state.run;
    renderPartyStrip($('partyStrip'), run.party, run.knight);
    $('mapGold').textContent = '🪙 ' + (run.gold || 0) +
      (run.mode === 'ENDLESS' ? '  ·  ★ ' + (run.score || 0) + '  ·  🔁 ' + ((run.loop || 0) + 1) : '') +
      (run.battlegrounds ? '  ·  ⚔️ BG Tier ' + (['I','II','III','IV','V'][(run.bgTier || 1) - 1] || run.bgTier) + '  ·  🎁 ' + (run.boons || []).length + ' boon' : '');
    $('mapReward').textContent = '';
    $('mapReward').classList.add('hidden');
    $('mapDeckCount').textContent = '🃏 ' + (run.deckSize || '—') + (run.checkpoint ? '  ·  💾 saved' : '');
    $('mapHint').textContent = run.currentNodeId < 0 ? 'Choose where to begin' : 'Choose your path';
    // Endless: once a boss has fallen, the team can be extracted (banked for Battlegrounds).
    var extractBtn = $('extractBtn');
    if (extractBtn) {
      var canExtract = run.mode === 'ENDLESS' && run.stats && (run.stats.bossKills || 0) > 0;
      extractBtn.classList.toggle('hidden', !canExtract);
    }

    var nodes = run.map || [];
    var rows = 1 + Math.max.apply(null, nodes.map(function (n) { return n.row; }));
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    // Center each row horizontally within the widest row.
    var rowCounts = {};
    nodes.forEach(function (n) { rowCounts[n.row] = (rowCounts[n.row] || 0) + 1; });
    var maxCount = Math.max.apply(null, Object.keys(rowCounts).map(function (k) { return rowCounts[k]; }));
    var land = isPhoneLandscape();
    mapLayoutLand = land;
    // Portrait: depth is the vertical span, lanes the horizontal. Landscape
    // transposes them so depth runs across X and lanes stack down Y (with a
    // tighter lane gap + pad so the lanes fit the short viewport height).
    var pad = land ? MAP.landPad : MAP.pad;
    var laneGap = land ? MAP.landLaneGap : MAP.colGap;
    var width = pad * 2 + (land ? (rows - 1) * MAP.rowGap : (maxCount - 1) * laneGap);
    var height = pad * 2 + (land ? (maxCount - 1) * laneGap : (rows - 1) * MAP.rowGap);

    function pos(n) {
      var count = rowCounts[n.row];
      var lane = (maxCount - count) / 2 + n.col; // centered lane index within the widest row
      if (land) {
        // depth → X (row 0 at the LEFT, boss at the far RIGHT); lanes spread down Y, centered.
        return { x: pad + n.row * MAP.rowGap, y: pad + lane * laneGap };
      }
      // depth → Y (row 0 at the bottom, boss on top); lanes centered across X.
      return { x: pad + lane * laneGap, y: height - pad - n.row * MAP.rowGap };
    }

    var svg = $('mapSvg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.innerHTML = '';
    var NS = 'http://www.w3.org/2000/svg';

    // edges first (under the nodes)
    nodes.forEach(function (n) {
      var from = pos(n);
      (n.next || []).forEach(function (toId) {
        var to = pos(byId[toId]);
        var path = document.createElementNS(NS, 'path');
        if (land) {
          // Landscape edges bend through the horizontal midpoint (depth axis).
          var midX = (from.x + to.x) / 2;
          path.setAttribute('d', 'M' + from.x + ' ' + from.y + ' C ' + midX + ' ' + from.y + ', ' + midX + ' ' + to.y + ', ' + to.x + ' ' + to.y);
        } else {
          var midY = (from.y + to.y) / 2;
          path.setAttribute('d', 'M' + from.x + ' ' + from.y + ' C ' + from.x + ' ' + midY + ', ' + to.x + ' ' + midY + ', ' + to.x + ' ' + to.y);
        }
        var walked = n.cleared && (byId[toId].current || byId[toId].cleared);
        var open = n.current && byId[toId].reachable;
        path.setAttribute('class', 'map-edge' + (walked ? ' walked' : '') + (open ? ' open' : ''));
        svg.appendChild(path);
      });
    });

    // nodes
    nodes.forEach(function (n) {
      var p = pos(n);
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'map-node-g' +
        (n.cleared ? ' cleared' : '') +
        (n.current ? ' current' : '') +
        (n.reachable ? ' reachable' : '') +
        ' type-' + n.type);
      g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');

      if (n.reachable) {
        var halo = document.createElementNS(NS, 'circle');
        halo.setAttribute('r', MAP.r + 8);
        halo.setAttribute('class', 'map-halo');
        g.appendChild(halo);
      }

      var circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('r', n.type === 'BOSS' ? MAP.r + 6 : MAP.r);
      circle.setAttribute('class', 'map-circle');
      circle.setAttribute('style', '--node-tint:' + (NODE_TINT[n.type] || '#8fa3bf'));
      g.appendChild(circle);

      var glyph = document.createElementNS(NS, 'text');
      glyph.setAttribute('class', 'map-glyph');
      glyph.setAttribute('text-anchor', 'middle');
      glyph.setAttribute('dominant-baseline', 'central');
      glyph.setAttribute('y', '1');
      glyph.textContent = NODE_ICON[n.type] || '•';
      g.appendChild(glyph);

      var label = document.createElementNS(NS, 'text');
      label.setAttribute('class', 'map-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('y', MAP.r + 18);
      label.textContent = n.label;
      g.appendChild(label);

      if (n.cleared) {
        var check = document.createElementNS(NS, 'text');
        check.setAttribute('class', 'map-check');
        check.setAttribute('text-anchor', 'middle');
        check.setAttribute('y', -MAP.r - 6);
        check.textContent = '✓';
        g.appendChild(check);
      }

      if (n.reachable) {
        g.addEventListener('click', function () { travelTo(n.id); });
      }
      svg.appendChild(g);
    });

    // Keep the action in view: scroll to the current position (or the start).
    var scroll = $('mapScroll');
    var focus = nodes.find(function (n) { return n.current; });
    setTimeout(function () {
      if (land) {
        // Horizontal scroll: lead ~60% into the viewport; no current node → far left (start).
        var focusX = focus ? pos(focus).x : 0;
        scroll.scrollLeft = Math.max(0, focusX - scroll.clientWidth * 0.6);
      } else {
        var focusY = focus ? pos(focus).y : height;
        scroll.scrollTop = Math.max(0, focusY - scroll.clientHeight * 0.6);
      }
    }, 30);
  }

  function travelTo(nodeId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/node/enter', { method: 'POST', body: { token: token(), nodeId: nodeId } })
      .then(function (run) { applyRun(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  /** Compact party chips (tap to inspect cards & abilities). */
  /** Small "Lv3" badge for a unit chip; empty when the unit has no level yet. */
  function partyLevelBadge(u) {
    if (!u || !u.level) return '';
    return '<span class="plvl' + (u.leveledThisBattle ? ' up' : '') + '">Lv' + u.level + '</span> ';
  }
  /** Thin XP progress bar under a unit's HP bar. */
  function partyXpBar(u) {
    if (!u || !u.level) return '';
    var pct = u.xpSpan > 0 ? Math.max(0, Math.min(100, Math.round(100 * u.xpInLevel / u.xpSpan))) : 100;
    var title = u.level >= 10 ? 'Max level' : ('XP ' + (u.xpInLevel || 0) + '/' + (u.xpSpan || 0));
    return '<div class="pxpbar" title="' + title + '"><div class="pxpfill" style="width:' + pct + '%"></div></div>';
  }

  function renderPartyStrip(host, party, knight) {
    host.innerHTML = '';
    if (knight && knight.hp != null) {
      var kchip = el('div', 'party-chip knight-chip ' + elClass(knight.element));
      var kpct = Math.max(0, Math.round(100 * knight.hp / Math.max(1, knight.maxHp)));
      kchip.innerHTML = '<div class="pthumb pthumb-fallback">🛡️</div>' +
        '<div class="pbody">' +
        '<div class="pname">' + partyLevelBadge(knight) + esc(knight.name) + '</div>' +
        '<div class="phpbar"><div class="phpfill" style="width:' + kpct + '%"></div></div>' +
        partyXpBar(knight) +
        '<div class="phptext">' + knight.hp + '/' + knight.maxHp + '</div>' +
        '</div>';
      kchip.addEventListener('click', function () {
        showUnitModal({
          name: knight.name, element: knight.element, artUrl: knight.artUrl,
          subtitle: 'SiegeKnight · HP ' + knight.hp + '/' + knight.maxHp + ' · ' + (knight.passive || ''),
          cards: knight.activeSpec ? [knight.activeSpec] : []
        });
      });
      host.appendChild(kchip);
    }
    party.forEach(function (p) {
      var chip = el('div', 'party-chip ' + elClass(p.element) + (p.alive ? '' : ' dead'));
      var pct = Math.max(0, Math.round(100 * p.hp / Math.max(1, p.maxHp)));
      var thumb = p.artUrl
        ? '<div class="pthumb" style="background-image:url(\'' + artCss(p.artUrl) + '\')"></div>'
        : '<div class="pthumb pthumb-fallback">' + icon(p.element) + '</div>';
      chip.innerHTML = thumb +
        '<div class="pbody">' +
        '<div class="pname">' + partyLevelBadge(p) + esc(p.name) + ' <span class="pinfo">ⓘ</span></div>' +
        '<div class="phpbar"><div class="phpfill" style="width:' + pct + '%"></div></div>' +
        partyXpBar(p) +
        '<div class="phptext">' + p.hp + '/' + p.maxHp + ' · ⚡' + p.speed + '</div>' +
        '</div>';
      chip.addEventListener('click', function () {
        showUnitModal({
          name: p.name, element: p.element, artUrl: p.artUrl,
          subtitle: 'HP ' + p.hp + '/' + p.maxHp + ' · ⚡ ' + p.speed,
          cards: p.cards || []
        });
      });
      host.appendChild(chip);
    });
  }

  // ---- rest camp (interactive stop) -------------------------------------
  function renderCamp() {
    showScreen('campScreen');
    var run = state.run;
    $('campNote').textContent = run.camp.note || '';
    $('campGold').textContent = '🪙 ' + (run.gold || 0);

    // party silhouettes around the fire
    var cp = $('campParty'); cp.innerHTML = '';
    (run.party || []).forEach(function (p, i) {
      if (!p.alive) return;
      var fig = p.artUrl
        ? el('div', 'camp-fig', '<img src="' + artAttr(p.artUrl) + '" alt="">')
        : el('div', 'camp-fig camp-fig-fallback', icon(p.element));
      fig.style.setProperty('--fig-i', i);
      cp.appendChild(fig);
    });

    var grid = $('campGrid'); grid.innerHTML = '';
    (run.camp.options || []).forEach(function (opt) {
      var canUse = !opt.used && opt.affordable;
      var c = el('div', 'camp-card ' + elClass(opt.element) + ' kind-' + opt.kind + (opt.used ? ' used' : '') + (canUse ? '' : ' locked'));
      var art = opt.artUrl
        ? '<div class="camp-art" style="background-image:url(\'' + artCss(opt.artUrl) + '\')"></div>'
        : '<div class="camp-glyph">' + (CAMP_ICON[opt.kind] || '🎁') + '</div>';
      var costChip = opt.cost > 0 ? '<span class="camp-cost' + (opt.affordable ? '' : ' broke') + '">🪙 ' + opt.cost + '</span>' : '<span class="camp-cost free">FREE</span>';
      c.innerHTML =
        '<div class="camp-card-head">' + costChip + (opt.used ? '<span class="camp-used">✓ used</span>' : '') + '</div>' +
        art +
        '<div class="camp-card-title">' + esc(opt.title) + '</div>' +
        '<div class="camp-card-desc">' + esc(opt.desc) + '</div>';
      if (canUse) c.addEventListener('click', function () { campChoose(opt.id); });
      grid.appendChild(c);
    });
  }

  function campChoose(optionId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/camp/choose', { method: 'POST', body: { token: token(), optionId: optionId } })
      .then(function (run) { applyInteractionResponse(run, { source: 'camp', title: 'Rest Camp', icon: '🏕️' }); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function campLeave() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/camp/leave', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- cache dig minigame -----------------------------------------------
  function renderCache() {
    showScreen('cacheScreen');
    var run = state.run;
    var c = run.cache;
    var isDig = !c.game || c.game === 'DIG';
    $('cacheDigBtn').classList.toggle('hidden', !isDig);
    $('cacheTakeBtn').classList.toggle('hidden', !isDig);
    $('cacheRiskFill').parentNode.parentNode.classList.toggle('hidden', !isDig);
    var opts = $('cacheOptions'); opts.innerHTML = '';
    if (isDig) {
      $('cacheLoot').innerHTML = 'Unbanked loot: <strong>🪙 ' + c.loot + '</strong> · Wallet: 🪙 ' + (run.gold || 0);
      $('cacheChest').textContent = c.digs === 0 ? '🪙' : (c.digs >= 3 ? '💎' : '💰');
      $('cacheRiskFill').style.width = c.bustChance + '%';
      $('cacheRiskText').textContent = 'Collapse risk: ' + c.bustChance + '% · Dig ' + c.digs + '/' + c.maxDigs;
      return;
    }
    $('cacheChest').textContent = c.game === 'CHESTS' ? '🧰' : '🎡';
    $('cacheLoot').innerHTML = (c.game === 'CHESTS' ? 'Three chests — pick ONE.' : 'The Wheel of Spoils.') +
      ' · Wallet: 🪙 ' + (run.gold || 0);
    (c.options || []).forEach(function (o) {
      var card = el('div', 'camp-card' + (o.used ? ' used' : ''));
      card.innerHTML = '<div class="camp-glyph">' + (o.kind === 'CHEST' ? '🧰' : o.kind === 'WHEEL_SPIN' ? '🎡' : '🚶') + '</div>' +
        '<div class="camp-card-title">' + esc(o.title) + '</div>' +
        '<div class="camp-card-desc">' + esc(o.desc) + '</div>' +
        (o.cost > 0 ? '<div class="camp-card-cost">🪙 ' + o.cost + '</div>' : '');
      if (!o.used && o.affordable) {
        card.classList.add('clickable');
        card.addEventListener('click', function () { cacheChoose(o.id); });
      } else if (!o.affordable) {
        card.classList.add('unaffordable');
      }
      opts.appendChild(card);
    });
  }

  function cacheChoose(optionId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/cache/choose', { method: 'POST', body: { token: token(), optionId: optionId } })
      .then(function (run) { applyInteractionResponse(run, { source: 'cache', title: 'Buried Cache', icon: '💎' }); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function cacheDig() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/cache/dig', { method: 'POST', body: { token: token() } })
      .then(function (run) { applyInteractionResponse(run, { source: 'cache', title: 'Buried Cache', icon: '💎' }); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function cacheTake() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/cache/take', { method: 'POST', body: { token: token() } })
      .then(function (run) { applyInteractionResponse(run, { source: 'cache', title: 'Buried Cache', icon: '💎' }); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- broker stall (recruit or swap Siegelings) --------------------------
  function renderBroker() {
    showScreen('brokerScreen');
    var run = state.run;
    var b = run.broker;
    $('brokerGold').textContent = '🪙 ' + (run.gold || 0);

    var grid = $('brokerGrid'); grid.innerHTML = '';
    (b.offers || []).forEach(function (offer) {
      var c = el('div', 'camp-card broker-offer ' + elClass(offer.element) + (offer.used ? ' used' : ''));
      var art = offer.artUrl
        ? '<div class="camp-art" style="background-image:url(\'' + artCss(offer.artUrl) + '\')"></div>'
        : '<div class="camp-glyph">' + icon(offer.element) + '</div>';
      var stats = offer.hp != null ? '<div class="camp-card-desc">❤ ' + offer.hp + ' · ⚡ ' + offer.speed +
        (offer.evolves ? ' · <span class="evo-tag">EVO ↑</span>' : '') + '</div>' : '';
      c.innerHTML =
        '<div class="camp-card-head"><button class="info-btn broker-info" type="button">ⓘ</button>' +
        (offer.used ? '<span class="camp-used">✓ hired</span>' : '') + '</div>' +
        art +
        '<div class="camp-card-title">' + esc(offer.name) + '</div>' +
        stats +
        (offer.used ? '' : b.merc
          ? '<div class="broker-actions">' +
            '<button class="siege-btn broker-btn hire" type="button"' +
              ((run.gold >= b.hireCost && !b.mercUnderContract) ? '' : ' disabled') + '>Rent 🪙' + b.hireCost + '</button>' +
            '</div><div class="camp-card-desc">Fights your NEXT battle with boon cards, then departs.</div>'
          : '<div class="broker-actions">' +
            '<button class="siege-btn broker-btn hire" type="button"' +
              ((run.gold >= b.hireCost && !b.partyFull) ? '' : ' disabled') + '>Hire 🪙' + b.hireCost + '</button>' +
            '<button class="siege-btn broker-btn swap" type="button"' + (run.gold >= b.swapCost ? '' : ' disabled') + '>Swap 🪙' + b.swapCost + '</button>' +
            '</div><div class="broker-swap-row hidden"></div>');
      c.querySelector('.broker-info').addEventListener('click', function (e) {
        e.stopPropagation();
        showUnitModal({
          name: offer.name, element: offer.element, artUrl: offer.artUrl,
          subtitle: '❤ ' + offer.hp + ' · ⚡ ' + offer.speed + (offer.evolves ? ' · Evolution card in battle deck' : ''),
          cards: offer.moves || []
        });
      });
      if (!offer.used) {
        var hireBtn = c.querySelector('.broker-btn.hire');
        var swapBtn = c.querySelector('.broker-btn.swap');
        var swapRow = c.querySelector('.broker-swap-row');
        if (hireBtn) hireBtn.addEventListener('click', function () { brokerHire(offer.id, null); });
        if (swapBtn) swapBtn.addEventListener('click', function () {
          // Pick which party member is released in the trade.
          swapRow.classList.toggle('hidden');
          if (!swapRow.childNodes.length) {
            (run.party || []).forEach(function (p) {
              var pb = el('button', 'siege-btn broker-member ' + elClass(p.element), '⇄ ' + esc(p.name));
              pb.addEventListener('click', function () { brokerHire(offer.id, p.id); });
              swapRow.appendChild(pb);
            });
          }
        });
      }
      grid.appendChild(c);
    });
  }

  function brokerHire(optionId, replaceId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/broker/hire', { method: 'POST', body: { token: token(), optionId: optionId, replaceId: replaceId } })
      .then(function (run) { applyInteractionResponse(run, { source: 'broker', title: 'Siegeling Broker', icon: '🐾' }); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function brokerLeave() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/broker/leave', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- generic post helper (token-only endpoints) -----------------------
  function simplePost(path, extra, resultCtx) {
    if (state.busy) return; state.busy = true;
    var body = { token: token() };
    if (extra) for (var k in extra) body[k] = extra[k];
    api(path, { method: 'POST', body: body })
      .then(function (run) {
        if (resultCtx) applyInteractionResponse(run, resultCtx);
        else { state.run = run; renderRun(); }
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- Smith ------------------------------------------------------------
  var smithScrapMode = false;
  function renderSmith() {
    showScreen('smithScreen');
    smithScrapMode = false;
    var run = state.run, sm = run.smith;
    $('smithGold').textContent = '🪙 ' + (run.gold || 0);
    var grid = $('smithGrid'); grid.innerHTML = '';
    (sm.options || []).forEach(function (o) {
      var card = el('div', 'camp-card ' + elClass(o.element) + (o.used ? ' used' : ''));
      card.innerHTML = '<div class="camp-glyph">🔨</div>' +
        '<div class="camp-card-title">' + esc(o.title) + '</div>' +
        '<div class="camp-card-desc">' + esc(o.desc) + '</div>' +
        (o.cost > 0 ? '<div class="camp-card-cost">🪙 ' + o.cost + '</div>' : '');
      if (!o.used && o.affordable) { card.classList.add('clickable'); card.addEventListener('click', function () { simplePost('/api/siege/smith/choose', { optionId: o.id }, { source: 'smith', title: 'Smith', icon: '🔨' }); }); }
      else if (!o.affordable) card.classList.add('unaffordable');
      grid.appendChild(card);
    });
  }
  function toggleSmithScrap() {
    smithScrapMode = !smithScrapMode;
    if (!smithScrapMode) { renderSmith(); return; }
    var grid = $('smithGrid'); grid.innerHTML = '<div class="smith-scrap-note">Pick a card to scrap (removed for good):</div>';
    (state.run.party || []).forEach(function (pm) {
      (pm.cards || []).forEach(function () {});
    });
    // Scrap by deck index: show each deck card via party cards list is complex; use a compact prompt.
    var deck = collectDeck();
    deck.forEach(function (d) {
      var card = el('div', 'camp-card clickable', '<div class="camp-glyph">🗑</div><div class="camp-card-title">' + esc(d.name) + '</div><div class="camp-card-desc">Owner: ' + esc(d.owner) + '</div>');
      card.addEventListener('click', function () { simplePost('/api/siege/smith/choose', { scrapIndex: d.index }, { source: 'smith', title: 'Smith', icon: '🔨' }); });
      grid.appendChild(card);
    });
  }
  // The server only exposes per-member card specs, not deck indices; approximate
  // scrap by asking the server which template — fall back to a name list with indices
  // derived from party card order is unreliable, so we simply disable fine control:
  function collectDeck() { return (state.run.deckList || []); }

  // ---- Caravan ----------------------------------------------------------
  function renderCaravan() {
    showScreen('caravanScreen');
    var run = state.run, cv = run.caravan;
    $('caravanGold').textContent = '🪙 ' + (run.gold || 0);
    var grid = $('caravanGrid'); grid.innerHTML = '';
    (cv.options || []).forEach(function (o) {
      var icon = o.kind === 'SHOP_ITEM' ? (o.item ? o.item.icon : '📦') : o.kind === 'SHOP_HEAL' ? '🍲' : '🃏';
      var card = el('div', 'camp-card' + (o.used ? ' used' : ''));
      card.innerHTML = '<div class="camp-glyph">' + icon + '</div>' +
        '<div class="camp-card-title">' + esc(o.title) + '</div>' +
        '<div class="camp-card-desc">' + esc(o.desc) + '</div>' +
        '<div class="camp-card-cost">🪙 ' + o.cost + '</div>';
      if (!o.used && o.affordable) { card.classList.add('clickable'); card.addEventListener('click', function () { simplePost('/api/siege/caravan/buy', { optionId: o.id }, { source: 'caravan', title: 'Merchant Caravan', icon: '🐫' }); }); }
      else if (!o.affordable) card.classList.add('unaffordable');
      grid.appendChild(card);
    });
  }

  // ---- Event ------------------------------------------------------------
  function renderEvent() {
    showScreen('eventScreen');
    var run = state.run, ev = run.event;
    $('eventIcon').textContent = ev.icon || '❔';
    $('eventTitle').textContent = ev.title || 'Event';
    $('eventPrompt').textContent = ev.prompt || '';
    $('eventGold').textContent = '🪙 ' + (run.gold || 0);
    var box = $('eventChoices'); box.innerHTML = '';
    (ev.options || []).forEach(function (o) {
      var b = el('button', 'siege-btn event-choice' + (o.affordable ? '' : ' unaffordable'),
        '<span class="ec-label">' + esc(o.title) + '</span>' + (o.desc ? '<span class="ec-desc">' + esc(o.desc) + '</span>' : ''));
      if (o.affordable) b.addEventListener('click', function () {
        var ev = state.run.event || {};
        simplePost('/api/siege/event/choose', { optionId: o.id }, {
          source: 'event',
          title: ev.title || 'Event',
          icon: ev.icon || '❔'
        });
      });
      box.appendChild(b);
    });
  }

  // ---- Puzzle mini-games (LINE / RPS / MATCH) --------------------------
  // The server holds every hidden board and validates all outcomes; the client
  // only draws and forwards moves. All three share the framed minigameScreen.
  var LINE_COLORS = ['#e34b5a', '#3d9bff', '#37c46b', '#f0b429'];
  var RPS_META = { ROCK: { icon: '✊', label: 'Rock' }, PAPER: { icon: '✋', label: 'Paper' }, SCISSORS: { icon: '✌️', label: 'Scissors' } };
  var mgLine = null;
  var mgMatchSel = null;
  var mgRevealTimer = null;

  function renderMinigame() {
    showScreen('minigameScreen');
    var run = state.run, mg = run.minigame || {};
    $('mgIcon').textContent = mg.icon || '🧩';
    $('mgTitle').textContent = mg.title || 'Puzzle';
    $('mgPrompt').textContent = mg.prompt || '';
    $('mgGold').textContent = '🪙 ' + (run.gold || 0);
    $('mgStatus').textContent = '';
    var body = $('mgBody'); body.innerHTML = '';
    var actions = $('mgActions'); actions.innerHTML = '';
    if (mg.type === 'LINE') renderLine(mg, body, actions);
    else if (mg.type === 'RPS') renderRps(mg, body, actions);
    else if (mg.type === 'MATCH') renderMatch(mg, body, actions);
  }

  /** POSTs a puzzle move; re-renders if the game continues, else shows the outcome popup. */
  function minigameAction(path, extra) {
    if (state.busy) return; state.busy = true;
    var mg = (state.run && state.run.minigame) || {};
    var ctx = { source: 'cache', title: mg.title || 'Puzzle', icon: mg.icon || '🧩' };
    var body = { token: token() };
    if (extra) for (var k in extra) body[k] = extra[k];
    api(path, { method: 'POST', body: body })
      .then(function (run) {
        if (run.minigame) { state.run = run; renderRun(); }
        else applyInteractionResponse(run, ctx);
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- LINE (Flow-Free style connect) ----------------------------------
  function renderLine(mg, body, actions) {
    var n = mg.size || 5;
    mgLine = newLineState(mg, n);
    var grid = el('div', 'mg-line-grid');
    grid.style.setProperty('--n', n);
    grid.style.touchAction = 'none';
    mgLine.cellEls = [];
    for (var r = 0; r < n; r++) {
      var row = [];
      for (var c = 0; c < n; c++) {
        var cell = el('div', 'mg-cell');
        cell.dataset.r = r; cell.dataset.c = c;
        cell.appendChild(el('span', 'mg-dot'));
        grid.appendChild(cell);
        row.push(cell);
      }
      mgLine.cellEls.push(row);
    }
    grid.addEventListener('pointerdown', function (e) { lineDown(e, mgLine); });
    grid.addEventListener('pointermove', function (e) { lineMove(e, mgLine); });
    window.addEventListener('pointerup', lineUpHandler);
    body.appendChild(grid);
    body.appendChild(el('div', 'mg-note', 'Drag from a glowing rune to its twin. Paths can’t cross or reuse a tile.'));

    var solveBtn = el('button', 'siege-btn primary', 'Break the Seal ▸');
    solveBtn.addEventListener('click', function () { lineSubmit(mgLine); });
    var clearBtn = el('button', 'siege-btn', 'Clear');
    clearBtn.addEventListener('click', function () { renderMinigame(); });
    var giveBtn = el('button', 'siege-btn ghost', 'Give Up');
    giveBtn.addEventListener('click', function () { minigameAction('/api/siege/minigame/giveup'); });
    actions.appendChild(clearBtn);
    actions.appendChild(solveBtn);
    actions.appendChild(giveBtn);
    repaintLine(mgLine);
    updateLineStatus(mgLine);
  }

  function newLineState(mg, n) {
    var st = { n: n, colors: mg.colors, endpoints: mg.endpoints || [], paths: [], drawing: null, cellEls: [] };
    for (var i = 0; i < mg.colors; i++) st.paths.push([]);
    return st;
  }
  function lineUpHandler(e) { if (mgLine) lineUp(e, mgLine); }

  function lineCellFromEvent(e, st) {
    var node = document.elementFromPoint(e.clientX, e.clientY);
    while (node && !node.classList.contains('mg-cell')) node = node.parentNode;
    if (!node || node.dataset.r == null) return null;
    return [parseInt(node.dataset.r, 10), parseInt(node.dataset.c, 10)];
  }
  function lineEndpointAt(st, r, c) {
    for (var i = 0; i < st.endpoints.length; i++) {
      var ep = st.endpoints[i];
      if (ep.a[0] === r && ep.a[1] === c) return { color: ep.color, which: 'a' };
      if (ep.b[0] === r && ep.b[1] === c) return { color: ep.color, which: 'b' };
    }
    return null;
  }
  function lineIndexInPath(path, r, c) {
    for (var i = 0; i < path.length; i++) if (path[i][0] === r && path[i][1] === c) return i;
    return -1;
  }
  function linePathColorAt(st, r, c) {
    for (var col = 0; col < st.paths.length; col++) if (lineIndexInPath(st.paths[col], r, c) >= 0) return col;
    return -1;
  }
  function lineOccupant(st, r, c) {
    var ep = lineEndpointAt(st, r, c);
    if (ep) return { color: ep.color, endpoint: true };
    var pc = linePathColorAt(st, r, c);
    if (pc >= 0) return { color: pc, endpoint: false };
    return null;
  }

  function lineDown(e, st) {
    var cell = lineCellFromEvent(e, st); if (!cell) return;
    e.preventDefault();
    var r = cell[0], c = cell[1];
    var ep = lineEndpointAt(st, r, c);
    if (ep) {
      st.paths[ep.color] = [[r, c]];
      st.drawing = { color: ep.color };
    } else {
      var pc = linePathColorAt(st, r, c);
      if (pc < 0) return;
      var idx = lineIndexInPath(st.paths[pc], r, c);
      st.paths[pc] = st.paths[pc].slice(0, idx + 1);
      st.drawing = { color: pc };
    }
    repaintLine(st);
  }
  function lineMove(e, st) {
    if (!st.drawing) return;
    var cell = lineCellFromEvent(e, st); if (!cell) return;
    var r = cell[0], c = cell[1];
    var path = st.paths[st.drawing.color];
    var last = path[path.length - 1];
    if (last[0] === r && last[1] === c) return;
    e.preventDefault();
    if (path.length >= 2) {
      var prev = path[path.length - 2];
      if (prev[0] === r && prev[1] === c) { path.pop(); repaintLine(st); updateLineStatus(st); return; }
    }
    if (Math.abs(last[0] - r) + Math.abs(last[1] - c) !== 1) return;
    if (lineIndexInPath(path, r, c) >= 0) return;
    var occ = lineOccupant(st, r, c);
    if (occ) {
      if (occ.color !== st.drawing.color) return;         // another colour blocks
      if (occ.endpoint) {
        var start = path[0];
        if (start[0] === r && start[1] === c) return;     // can't loop to own start
        path.push([r, c]); repaintLine(st); updateLineStatus(st); return;
      }
      return;
    }
    path.push([r, c]); repaintLine(st); updateLineStatus(st);
  }
  function lineUp(e, st) { st.drawing = null; repaintLine(st); updateLineStatus(st); }

  function repaintLine(st) {
    for (var r = 0; r < st.n; r++) {
      for (var c = 0; c < st.n; c++) {
        var cell = st.cellEls[r][c];
        var occ = lineOccupant(st, r, c);
        cell.className = 'mg-cell';
        var dot = cell.querySelector('.mg-dot');
        if (occ) {
          var color = LINE_COLORS[occ.color % LINE_COLORS.length];
          cell.style.background = occ.endpoint ? 'transparent' : hexAlpha(color, 0.4);
          if (occ.endpoint) { cell.classList.add('mg-ep'); dot.style.background = color; dot.style.opacity = '1'; }
          else { dot.style.opacity = '0'; }
        } else {
          cell.style.background = '';
          dot.style.opacity = '0';
        }
      }
    }
  }
  function lineConnected(st, color) {
    var path = st.paths[color];
    if (!path || path.length < 2) return false;
    var ep = null;
    for (var i = 0; i < st.endpoints.length; i++) if (st.endpoints[i].color === color) ep = st.endpoints[i];
    if (!ep) return false;
    var f = path[0], l = path[path.length - 1];
    var fa = f[0] === ep.a[0] && f[1] === ep.a[1], fb = f[0] === ep.b[0] && f[1] === ep.b[1];
    var la = l[0] === ep.a[0] && l[1] === ep.a[1], lb = l[0] === ep.b[0] && l[1] === ep.b[1];
    return (fa && lb) || (fb && la);
  }
  function updateLineStatus(st) {
    var done = 0;
    for (var col = 0; col < st.colors; col++) if (lineConnected(st, col)) done++;
    $('mgStatus').textContent = 'Runes linked: ' + done + ' / ' + st.colors;
  }
  function lineSubmit(st) {
    var payload = [];
    for (var col = 0; col < st.paths.length; col++) {
      if (st.paths[col] && st.paths[col].length) payload.push({ color: col, cells: st.paths[col] });
    }
    minigameAction('/api/siege/minigame/line', { paths: payload });
  }

  // ---- RPS (ro-sham-bo, best of three) ---------------------------------
  function renderRps(mg, body, actions) {
    $('mgStatus').textContent = 'You ' + (mg.playerWins || 0) + ' — ' + (mg.npcWins || 0) + ' NPC · Round ' +
      (Math.min((mg.round || 0) + 1, mg.bestOf || 3)) + ' of ' + (mg.bestOf || 3);
    if (mg.tell) {
      var meta = RPS_META[mg.tell] || { icon: '❔', label: mg.tell };
      var tell = el('div', 'mg-tell', 'Tell: their hand looks like <strong>' + meta.icon + ' ' + meta.label +
        '</strong> — but a tell lies about a third of the time.');
      body.appendChild(tell);
    }
    var row = el('div', 'mg-rps-row');
    (mg.throws || ['ROCK', 'PAPER', 'SCISSORS']).forEach(function (t) {
      var meta = RPS_META[t] || { icon: '❔', label: t };
      var btn = el('button', 'mg-rps-btn', '<span class="mg-rps-ic">' + meta.icon + '</span><span>' + meta.label + '</span>');
      btn.addEventListener('click', function () { minigameAction('/api/siege/minigame/rps', { choice: t }); });
      row.appendChild(btn);
    });
    body.appendChild(row);
    if (mg.log && mg.log.length) {
      var log = el('div', 'mg-log');
      mg.log.forEach(function (line) { log.appendChild(el('div', 'mg-log-line', esc(line))); });
      body.appendChild(log);
    }
  }

  // ---- MATCH (memory pairs) --------------------------------------------
  function renderMatch(mg, body, actions) {
    var revealing = mg.flip && !mg.flip.matched;
    $('mgStatus').textContent = 'Pairs ' + (mg.pairsFound || 0) + '/' + (mg.totalPairs || 8) +
      ' · Misses ' + (mg.misses || 0) + '/' + (mg.maxMisses || 5);
    var grid = el('div', 'mg-match-grid');
    grid.style.setProperty('--n', mg.size || 4);
    (mg.cells || []).forEach(function (cell) {
      var tile = el('button', 'mg-tile');
      var sym = null;
      if (cell.matched) { tile.classList.add('matched', 'up'); sym = cell.symbol; }
      else if (revealing && cell.index === mg.flip.a) { tile.classList.add('up'); sym = mg.flip.symbolA; }
      else if (revealing && cell.index === mg.flip.b) { tile.classList.add('up'); sym = mg.flip.symbolB; }
      else if (mgMatchSel === cell.index) tile.classList.add('sel');
      tile.textContent = sym || '';
      if (!cell.matched && !revealing) tile.addEventListener('click', function () { matchTap(cell.index); });
      grid.appendChild(tile);
    });
    body.appendChild(grid);
    body.appendChild(el('div', 'mg-note', 'Flip two tiles. A matching pair pays gold and stays up.'));
    if (revealing) {
      clearTimeout(mgRevealTimer);
      mgRevealTimer = setTimeout(function () {
        if (state.run && state.run.minigame && state.run.minigame.type === 'MATCH' && state.run.minigame.flip) {
          state.run.minigame.flip = null;
          renderMinigame();
        }
      }, 900);
    }
  }
  function matchTap(index) {
    if (state.busy) return;
    if (mgMatchSel === null) { mgMatchSel = index; renderMinigame(); return; }
    if (mgMatchSel === index) { mgMatchSel = null; renderMinigame(); return; }
    var a = mgMatchSel; mgMatchSel = null;
    minigameAction('/api/siege/minigame/match', { a: a, b: index });
  }

  /** #rrggbb + alpha → rgba() string for translucent path fills. */
  function hexAlpha(hex, alpha) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // ---- Inventory --------------------------------------------------------
  function openInventory() { $('invOverlay').classList.remove('hidden'); renderInventory(); }
  function knightBagItems(run) { return run.knightBag || []; }
  function findKnightItem(run, itemId) {
    return knightBagItems(run).find(function (it) { return it.id === itemId; }) || null;
  }
  function renderInventory() {
    var run = state.run;
    var knightBag = $('invKnightBag'); knightBag.innerHTML = '';
    var bagItems = knightBagItems(run);
    if (!bagItems.length) {
      knightBag.innerHTML = '<div class="inv-empty">The knight\'s bag is empty.</div>';
    } else {
      bagItems.forEach(function (it) {
        var b = el('button', 'inv-item inv-knight-item' + (state.knightSelectedItem === it.id ? ' sel' : ''),
          '<span class="inv-item-icon">' + it.icon + '</span><span class="inv-item-name">' + esc(it.name) + '</span><span class="inv-item-eff">' + esc(it.effect) + '</span>');
        b.addEventListener('click', function () {
          state.knightSelectedItem = (state.knightSelectedItem === it.id ? null : it.id);
          renderInventory();
        });
        knightBag.appendChild(b);
      });
    }

    var selItem = state.knightSelectedItem ? findKnightItem(run, state.knightSelectedItem) : null;
    var party = $('invParty'); party.innerHTML = '';
    if (run.knight && run.knight.hp != null) {
      var k = run.knight;
      var krow = el('div', 'inv-member knight-chip ' + elClass(k.element) + (k.alive ? '' : ' dead') +
        knightTargetClass(selItem, k, true),
        '<div class="inv-member-name">🛡️ ' + esc(k.name) + ' <span class="phptext">' + k.hp + '/' + k.maxHp + '</span></div>' +
        '<div class="inv-slot empty">SiegeKnight</div>');
      krow.dataset.targetId = k.unitId || 'knight-unit';
      if (selItem && knightTargetValid(selItem, k, true)) {
        krow.addEventListener('click', function () { useKnightItemFromMap(selItem.id, k.unitId || 'knight-unit'); });
      }
      party.appendChild(krow);
    }
    (run.party || []).forEach(function (pm) {
      var slot = pm.item
        ? '<div class="inv-slot filled" title="' + esc(pm.item.effect) + '">' + pm.item.icon + ' ' + esc(pm.item.name) + ' <button class="inv-unequip" type="button">✕</button></div>'
        : '<div class="inv-slot empty">— empty slot —</div>';
      var row = el('div', 'inv-member ' + elClass(pm.element) + (pm.alive ? '' : ' dead') +
        knightTargetClass(selItem, pm, false),
        '<div class="inv-member-name">' + icon(pm.element) + ' ' + esc(pm.name) + '</div>' + slot);
      if (pm.item) {
        row.querySelector('.inv-unequip').addEventListener('click', function (e) { e.stopPropagation(); simplePostKeepInv('/api/siege/item/unequip', { memberId: pm.id }); });
      }
      row.dataset.memberId = pm.id;
      row.dataset.targetId = pm.id;
      if (selItem && knightTargetValid(selItem, pm, false)) {
        row.addEventListener('click', function () { useKnightItemFromMap(selItem.id, pm.id); });
      } else if (invSelectedItem) {
        var equipItem = findInventoryItem(run, invSelectedItem);
        if (equipItemValid(equipItem, pm)) {
          row.classList.add('inv-targetable');
          row.addEventListener('click', function () { simplePostKeepInv('/api/siege/item/equip', { itemId: invSelectedItem, memberId: pm.id }); invSelectedItem = null; });
        }
      }
      party.appendChild(row);
    });
    var bag = $('invBag'); bag.innerHTML = '';
    if (!(run.inventory || []).length) bag.innerHTML = '<div class="inv-empty">No spare items. Find them at caravans, events and caches.</div>';
    (run.inventory || []).forEach(function (it) {
      var b = el('button', 'inv-item' + (invSelectedItem === it.id ? ' sel' : ''),
        '<span class="inv-item-icon">' + it.icon + '</span><span class="inv-item-name">' + esc(it.name) + '</span><span class="inv-item-eff">' + esc(it.effect) + '</span>');
      b.addEventListener('click', function () { invSelectedItem = (invSelectedItem === it.id ? null : it.id); state.knightSelectedItem = null; renderInventory(); });
      bag.appendChild(b);
    });
    var hint = selItem
      ? (selItem.kind === 'REVIVE' ? 'Tap a fallen Siegeling to revive.' : 'Tap an ally to heal.')
      : (invSelectedItem ? equipHint(findInventoryItem(run, invSelectedItem)) : 'Tap a knight item, then a target — or tap a backpack item to equip.');
    var sub = $('invBag').previousElementSibling; if (sub) sub.textContent = 'Backpack — ' + hint;
    var ksub = $('invKnightBag').previousElementSibling; if (ksub) ksub.textContent = selItem ? 'Knight\'s Bag — ' + hint : 'Knight\'s Bag';
  }
  function findInventoryItem(run, itemId) {
    return (run.inventory || []).find(function (it) { return it && it.id === itemId; }) || null;
  }
  function equipItemValid(item, member) {
    if (!item || !member || !member.alive) return false;
    if (item.kind === 'EVOLUTION') return !!member.hasEvolution;
    if (item.kind === 'EVOLUTION2') return !!member.hasStage3Evolution;
    return true;
  }
  function equipHint(item) {
    if (!item) return 'Tap a Siegeling to equip.';
    if (item.kind === 'EVOLUTION') return 'Tap a Siegeling with an evolution path.';
    if (item.kind === 'EVOLUTION2') return 'Tap a Siegeling with a stage-3 evolution line.';
    return 'Tap a Siegeling to equip.';
  }
  function knightTargetValid(item, unit, isKnight) {
    if (!item || !unit) return false;
    if (item.kind === 'REVIVE') return !isKnight && !unit.alive;
    if (item.kind === 'HEAL') return unit.alive && unit.hp < unit.maxHp;
    return false;
  }
  function knightTargetClass(item, unit, isKnight) {
    if (!item || !knightTargetValid(item, unit, isKnight)) return '';
    return ' inv-targetable' + (item.kind === 'REVIVE' ? ' revive-target' : ' heal-target');
  }
  function useKnightItemFromMap(itemId, targetId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/knight/use', { method: 'POST', body: { token: token(), itemId: itemId, targetId: targetId } })
      .then(function (run) { state.knightSelectedItem = null; state.busy = false; state.run = run; renderInventory(); toast(run.lastReward || 'Item used.'); })
      .catch(function (e) { toast(e.message); state.busy = false; });
  }
  function useKnightItemInBattle(itemId, targetId) {
    if (state.busy) return;
    state.busy = true;
    syncBattleActionButtons();
    api('/api/siege/knight/use', { method: 'POST', body: { token: token(), itemId: itemId, targetId: targetId } })
      .then(function (run) { state.knightSelectedItem = null; state.busy = false; applyRun(run); if (run.lastReward) toast(run.lastReward); })
      .catch(function (e) { toast(e.message); state.busy = false; });
  }
  var invSelectedItem = null;
  function simplePostKeepInv(path, extra) {
    if (state.busy) return; state.busy = true;
    var body = { token: token() };
    if (extra) for (var k in extra) body[k] = extra[k];
    api(path, { method: 'POST', body: body })
      .then(function (run) { state.run = run; if (!$('invOverlay').classList.contains('hidden')) renderInventory(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  /** Keep End Turn / Ultimate in sync with phase and in-flight work. Without
   *  this, taps during animations or API calls are silently ignored (busy) while
   *  the buttons still look active — which feels like a double-tap is required. */
  function syncBattleActionButtons() {
    var b = state.run && state.run.battle;
    if (!b) return;
    var over = b.phase === 'WON' || b.phase === 'LOST';
    var canAct = b.phase === 'PLAYER_INPUT' && !state.busy;
    var endBtn = $('endTurnBtn');
    if (endBtn) {
      endBtn.classList.toggle('hidden', over);
      endBtn.disabled = !canAct;
    }
    var ult = $('knightUltBtn');
    if (ult) {
      ult.classList.toggle('hidden', over);
      ult.disabled = !(b.knight && b.knight.ultReady && canAct);
    }
  }

  // ---- battle stage ----------------------------------------------------
  function renderBattle() {
    showScreen('battleScreen');
    var b = state.run.battle;
    if (!b) { renderMap(); return; }

    renderKnightPlate(b);
    renderSpeedTrack(b);
    renderSpriteLine($('enemyRow'), b.enemies, 'enemy', b);
    renderSpriteLine($('allyRow'), b.allies, 'ally', b);

    // log ticker (tap to expand the full turn ledger)
    var log = $('battleLog'); log.innerHTML = '';
    (b.log || []).slice(-2).reverse().forEach(function (line) { if (line) log.appendChild(el('div', 'lg', esc(line))); });
    log.appendChild(el('div', 'lg-more', '☰ ledger'));
    if (!$('ledgerPanel').classList.contains('hidden')) renderLedger(b);

    // hud
    var ap = $('apDisplay'); ap.innerHTML = '<span class="ap-label">AP</span>';
    for (var i = 0; i < (b.maxActionPoints || 5); i++) {
      ap.appendChild(el('span', 'ap-pip' + (i < b.actionPoints ? ' full' : '')));
    }
    $('deckCounts').textContent = '🃏' + b.deckCount + ' · ✋' + b.hand.length + ' · 🗑' + b.discardCount;

    var over = b.phase === 'WON' || b.phase === 'LOST';
    syncBattleActionButtons();

    if (!state.deferBattleHandRender) renderHand(b, over);
    updateHint(b, over);
  }

  // ---- expandable turn ledger --------------------------------------------
  function toggleLedger(open) {
    var panel = $('ledgerPanel');
    panel.classList.toggle('hidden', !open);
    if (open && state.run && state.run.battle) renderLedger(state.run.battle);
  }

  /** Every action of the battle, grouped by round, with the card behind it. */
  function renderLedger(b) {
    var body = $('ledgerBody'); body.innerHTML = '';
    var entries = b.turnLog || [];
    if (!entries.length) { body.appendChild(el('div', 'ledger-empty', 'No actions yet.')); return; }
    var lastRound = null;
    entries.forEach(function (e) {
      if (e.round !== lastRound) {
        lastRound = e.round;
        body.appendChild(el('div', 'ledger-round', '— Round ' + e.round + ' —'));
      }
      var costChip = e.cost >= 0 ? '<span class="ledger-cost">' + e.cost + ' AP</span>' : '';
      var cardChip = e.card ? '<span class="ledger-card">🃏 ' + esc(e.card) + '</span>' : '';
      var row = el('div', 'ledger-row ' + (e.side || 'sys'),
        '<span class="ledger-actor">' + esc(e.actor || '') + '</span>' + cardChip + costChip +
        '<span class="ledger-text">' + esc(e.text || '') + '</span>');
      body.appendChild(row);
    });
    body.scrollTop = body.scrollHeight;
  }

  function renderKnightPlate(b) {
    var host = $('knightPlate');
    var k = b.knight;
    if (!k || k.hp == null) { host.classList.add('hidden'); return; }
    host.classList.remove('hidden');
    host.className = 'knight-plate ' + elClass(k.element) + (k.hp <= 0 ? ' dead' : '');
    var pct = Math.max(0, Math.round(100 * k.hp / Math.max(1, k.maxHp)));
    var chargePct = Math.min(100, Math.round(100 * k.charge / Math.max(1, k.ultCost)));
    var bagHtml = '';
    var bagItems = knightBagItems(state.run);
    if (bagItems.length && b.phase === 'PLAYER_INPUT') {
      bagHtml = '<div class="knight-bag-row">';
      bagItems.forEach(function (it) {
        bagHtml += '<button type="button" class="knight-bag-btn' + (state.knightSelectedItem === it.id ? ' sel' : '') +
          '" data-item-id="' + esc(it.id) + '" title="' + esc(it.effect) + '">' + it.icon + ' ' + esc(it.name) + '</button>';
      });
      bagHtml += '</div>';
    }
    host.innerHTML =
      '<div class="kp-head"><span class="kp-name">🛡️ ' + esc(k.name) + '</span>' +
      '<span class="kp-hp">' + k.hp + '/' + k.maxHp + '</span></div>' +
      '<div class="kp-hpbar"><div class="kp-hpfill" style="width:' + pct + '%"></div></div>' +
      '<div class="kp-chargebar" title="Knight Ultimate Charge"><div class="kp-chargefill" style="width:' + chargePct + '%"></div>' +
      '<span class="kp-chargetext">⚡ ' + k.charge + '/' + k.ultCost + '</span></div>' +
      bagHtml;
    host.querySelectorAll('.knight-bag-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-item-id');
        state.knightSelectedItem = (state.knightSelectedItem === id ? null : id);
        renderBattle();
      });
    });
    var ult = $('knightUltBtn');
    ult.classList.toggle('hidden', b.phase === 'WON' || b.phase === 'LOST');
    ult.textContent = k.ultReady ? '⚡ ULT!' : '⚡' + k.charge + '/' + k.ultCost;
  }

  /** Speed race track: both teams' units race along a line; leader acts first. */
  function renderSpeedTrack(b) {
    var host = $('speedTrack'); host.innerHTML = '';
    var max = Math.max(b.playerSpeed || 0, b.enemySpeed || 0, 1);
    host.appendChild(el('div', 'track-round', 'R' + b.roundNumber));

    var lanes = el('div', 'track-lanes');
    [{ side: 'you', label: 'YOU', total: b.playerSpeed, units: b.allies, first: b.playerActsFirst },
     { side: 'them', label: 'FOE', total: b.enemySpeed, units: b.enemies, first: !b.playerActsFirst }]
      .forEach(function (lane) {
        var row = el('div', 'track-lane ' + lane.side + (lane.first ? ' leads' : ''));
        var bar = el('div', 'lane-bar');
        var fillPct = Math.round(100 * lane.total / max);
        bar.appendChild(el('div', 'lane-fill', ''));
        bar.lastChild.style.width = fillPct + '%';
        // runners: each living unit at its cumulative speed position —
        // shown with its overlay art cutout (element icon as fallback).
        var cum = 0;
        (lane.units || []).forEach(function (u) {
          if (!u.alive) return;
          cum += (u.effectiveSpeed != null ? u.effectiveSpeed : u.speed) || 0;
          var runner;
          if (u.artUrl) {
            runner = el('span', 'lane-runner img ' + elClass(u.element), '');
            runner.style.backgroundImage = 'url("' + String(u.artUrl).replace(/"/g, '%22') + '")';
          } else {
            runner = el('span', 'lane-runner ' + elClass(u.element), icon(u.element));
          }
          runner.style.left = 'calc(' + Math.round(100 * cum / max) + '% - 9px)';
          runner.title = u.name + ' ⚡' + (u.effectiveSpeed != null ? u.effectiveSpeed : u.speed);
          bar.appendChild(runner);
        });
        if (lane.first) bar.appendChild(el('span', 'lane-flag', '🏁'));
        row.appendChild(el('span', 'lane-label', lane.label + ' <b>' + lane.total + '</b>'));
        row.appendChild(bar);
        lanes.appendChild(row);
      });
    host.appendChild(lanes);
    host.appendChild(el('div', 'track-first ' + (b.playerActsFirst ? 'you' : 'them'),
      b.playerActsFirst ? 'You act first' : 'Enemy first'));
  }

  function renderSpriteLine(host, units, side, b) {
    host.innerHTML = '';
    var targeted = b.targetedPositions || [];
    units.forEach(function (u, idx) {
      var isThreatened = side === 'ally' && u.alive &&
        (targeted.indexOf(u.position) >= 0 || b.sweepIncoming);
      var sp = el('div', 'sprite ' + side + ' ' + elClass(u.element) +
        (u.alive ? '' : ' dead') + (u.id === b.leadId ? ' lead' : '') +
        (isThreatened ? ' threatened' : ''));
      sp.dataset.id = u.id; sp.dataset.side = u.side;
      sp.style.setProperty('--idle-delay', (idx * 0.45) + 's');
      // Evolved forms stand taller: 1.5× more space and art size per evolution stage.
      if (u.evoStage > 0) sp.style.setProperty('--evo-scale', Math.pow(1.5, u.evoStage));
      var pct = Math.max(0, Math.round(100 * u.hp / Math.max(1, u.maxHp)));
      var shield = u.shield > 0 ? '<span class="sp-shield">🛡' + u.shield + '</span>' : '';
      var buff = u.attackBuff > 0 ? '<span class="sp-buff">⚔+' + u.attackBuff + '</span>' : '';
      var statusChips = (u.statuses || []).map(function (s) {
        var meta = STATUS_META[s];
        return meta ? '<span class="sp-status st-' + s + '" title="' + meta.label + '">' + meta.icon + '</span>' : '';
      }).join('');
      var body = u.artUrl
        ? '<div class="sp-art"><img src="' + artAttr(u.artUrl) + '" alt="" draggable="false" ' +
          'onerror="this.parentNode.className=\'sp-art sp-art-fallback\';this.outerHTML=\'<span>' + icon(u.element) + '</span>\'"></div>'
        : '<div class="sp-art sp-art-fallback"><span>' + icon(u.element) + '</span></div>';
      // Intent lives inside the plate so it can never clip off-screen.
      var intentLine = '';
      if (side === 'enemy' && u.alive && u.intent) {
        intentLine = '<div class="sp-intent-line">' + intentLabel(u.intent, b) + '</div>';
      }
      var notch = side === 'ally' && u.position >= 0 ? '<div class="sp-notch">' + (u.position + 1) + '</div>' : '';
      // Level badge + XP bar for player Siegelings.
      var levelBadge = '';
      var xpLine = '';
      if (side === 'ally' && u.level) {
        levelBadge = '<span class="sp-lvl' + (u.leveledThisBattle ? ' up' : '') + '">Lv' + u.level + '</span>';
        var xpPct = u.xpSpan > 0 ? Math.max(0, Math.min(100, Math.round(100 * u.xpInLevel / u.xpSpan))) : 100;
        xpLine = '<div class="sp-xpbar" title="XP ' + (u.xpInLevel || 0) + '/' + (u.xpSpan || 0) + '">' +
          '<div class="sp-xpfill" style="width:' + xpPct + '%"></div></div>';
      }
      // Evolution gauge: fills as this Siegeling spends AP on its own moves.
      var gaugeLine = '';
      if (side === 'ally' && u.alive && u.hasEvolution) {
        gaugeLine = u.evoReady
          ? '<div class="sp-gauge ready" title="Evolution ready!">🌟 EVO READY</div>'
          : '<div class="sp-gauge" title="Evolution gauge: spend ' + u.evoGaugeMax + ' AP of its moves">' +
            '<div class="sp-gaugefill" style="width:' + Math.round(100 * u.evoGauge / Math.max(1, u.evoGaugeMax)) + '%"></div>' +
            '<span class="sp-gaugetext">🌟 ' + u.evoGauge + '/' + u.evoGaugeMax + '</span></div>';
      }
      sp.innerHTML =
        '<div class="sp-plate">' +
          '<div class="sp-name">' + levelBadge + esc(u.name) + ' <span class="sp-el">' + icon(u.element) + '</span></div>' +
          '<div class="sp-hpbar"><div class="sp-hpfill" style="width:' + pct + '%"></div></div>' +
          xpLine +
          '<div class="sp-tags"><span class="sp-hp">' + u.hp + '/' + u.maxHp + '</span>' + shield + buff + statusChips + '</div>' +
          gaugeLine +
          intentLine +
        '</div>' +
        body +
        (isThreatened ? '<div class="sp-target-ring"><span class="sp-target-x">▼</span></div>' : '') +
        '<div class="sp-shadow"></div>' +
        notch;
      sp.addEventListener('click', function () { onUnitClick(u); });
      host.appendChild(sp);
    });
  }

  function intentLabel(intent, b) {
    if (intent.effect === 'HEAL') return '💚 ' + esc(intent.name);
    if (intent.effect === 'SHIELD') return '🛡 ' + esc(intent.name);
    if (intent.effect !== 'DAMAGE') return esc(intent.name);
    if (intent.sweep) return '⚔' + intent.value + ' → ALL';
    var mark = null;
    (b.allies || []).forEach(function (a) { if (a.alive && a.position === intent.position) mark = a; });
    var who = mark ? esc(mark.name) : (intent.position >= 0 ? 'notch ' + (intent.position + 1) : 'the Knight');
    return '⚔' + intent.value + ' → ' + who;
  }

  // ---- event playback (projectiles + action moments) --------------------
  function playEvents(events, done) {
    state.busy = true;
    syncBattleActionButtons();
    var stage = $('battleStage');
    // Compress long sequences so playback stays snappy.
    var scale = events.length > 10 ? 10 / events.length : 1;
    var i = 0;

    function step() {
      if (i >= events.length) {
        hideBanner();
        state.busy = false;
        syncBattleActionButtons();
        done();
        return;
      }
      var ev = events[i++];
      var wait = playEvent(ev, stage) * scale;
      setTimeout(step, Math.max(60, wait));
    }
    step();
  }

  function playEvent(ev, stage) {
    switch (ev.type) {
      case 'round':
        showBanner('Round ' + ev.round + ' — ⚡' + ev.playerSpeed + ' vs ' + ev.enemySpeed +
          ' — ' + (ev.playerFirst ? 'You act first' : 'Enemy acts first'), ev.playerFirst ? 'you' : 'them');
        return 950;
      case 'card':
        showBanner(nameOf(ev.sourceId) + ' uses ' + ev.name, 'you', ev.element);
        return 550;
      case 'enemyAct':
        showBanner(nameOf(ev.sourceId) + ' uses ' + ev.name, 'them', ev.element);
        flashSprite(ev.sourceId, 'acting');
        return 700;
      case 'ultimate':
        showBanner('⚡ ' + ev.name + '!', 'you', ev.element);
        return 800;
      case 'hit':
        fireProjectile(stage, ev.sourceId, ev.targetId, ev.element, function () {
          impact(ev.targetId, ev.amount, ev.ko);
        });
        return 720;
      case 'burn':
        flashSprite(ev.targetId, 'hurt');
        floatText(ev.targetId, '-' + ev.amount + ' 🔥', 'dmg');
        return 420;
      case 'heal':
        flashSprite(ev.targetId, 'healed');
        floatText(ev.targetId, '+' + ev.amount, 'heal');
        return 420;
      case 'revive':
        flashSprite(ev.targetId, 'healed');
        floatText(ev.targetId, '📜 Back!', 'heal');
        return 650;
      case 'shield':
        flashSprite(ev.targetId, 'shielded');
        floatText(ev.targetId, '🛡+' + ev.amount, 'shield');
        return 400;
      case 'buff':
        showBanner(ev.kind === 'atk' ? 'The party gains +' + ev.amount + ' attack!' : '+' + ev.amount + ' speed!', 'you');
        return 480;
      case 'status': {
        var meta = STATUS_META[ev.status] || { icon: '', label: ev.status };
        flashSprite(ev.targetId, 'statused');
        floatText(ev.targetId, meta.icon + ' ' + meta.label + '!', 'status');
        return 480;
      }
      case 'swap':
        flashSprite(ev.aId, 'swapping');
        flashSprite(ev.bId, 'swapping');
        showBanner(nameOf(ev.aId) + ' ⇄ ' + nameOf(ev.bId) + ' swap notches', 'you');
        return 550;
      case 'evolve':
        showBanner('🌟 ' + ev.from + ' evolves into ' + ev.to + '!', 'you', ev.element);
        flashSprite(ev.targetId, 'evolving');
        floatText(ev.targetId, '🌟 EVOLVED!', 'status');
        return 1000;
      case 'cardUpdate':
        refreshHandCards(ev.targetId, ev.previewMoves);
        return 950;
      case 'gaugeReady':
        flashSprite(ev.targetId, 'evolving');
        floatText(ev.targetId, '🌟 Gauge full!', 'status');
        return 500;
      case 'discardHand':
        discardHandAnimation();
        return 520;
      case 'reshuffle':
        showBanner('♻ ' + ev.count + ' cards shuffle back into the deck', 'you');
        reshuffleAnimation(ev.count);
        return 900;
      case 'draw':
        state.dealAnimation = true;
        return 120;
      case 'apCharge':
        showBanner('Unused AP → +' + ev.amount + ' Ultimate Charge', 'you');
        apChargeAnimation(ev.amount, ev.total);
        return 750;
      case 'whiff':
        showBanner(nameOf(ev.sourceId) + '\'s ' + ev.name + ' hits empty ground!', 'them');
        return 620;
      case 'stunned':
        flashSprite(ev.sourceId, 'statused');
        floatText(ev.sourceId, '💫 Stunned!', 'status');
        return 480;
      case 'knightHit':
        floatKnight('-' + ev.amount);
        return 450;
      case 'charge':
        floatKnight('+' + ev.amount + ' ⚡');
        return 260;
      default:
        return 60;
    }
  }

  function nameOf(id) {
    var b = state.run && state.run.battle;
    if (!b) return '';
    var all = (b.allies || []).concat(b.enemies || []);
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i].name; }
    if (b.knight && b.knight.id === id) return b.knight.name;
    return '';
  }

  function spriteOf(id) { return document.querySelector('.sprite[data-id="' + id + '"]'); }

  function showBanner(text, side, element) {
    var banner = $('actionBanner');
    banner.textContent = text;
    banner.className = 'action-banner show ' + (side || '');
    banner.style.borderColor = element ? elColor(element) : '';
    clearTimeout(showBanner._h);
    showBanner._h = setTimeout(hideBanner, 1400);
  }
  function hideBanner() {
    var banner = $('actionBanner');
    if (banner) banner.className = 'action-banner';
  }

  function flashSprite(id, cls) {
    var node = spriteOf(id);
    if (!node) return;
    node.classList.add(cls);
    setTimeout(function () { node.classList.remove(cls); }, 700);
  }

  function floatText(id, text, cls) {
    var node = spriteOf(id);
    if (!node) return;
    var f = el('div', 'sp-float ' + cls, esc(text));
    node.appendChild(f);
    setTimeout(function () { f.remove(); }, 900);
  }

  function floatKnight(text) {
    var plate = $('knightPlate');
    if (!plate || plate.classList.contains('hidden')) return;
    plate.classList.add('kp-pulse');
    var f = el('div', 'sp-float dmg', esc(text));
    f.style.top = '-4px';
    plate.appendChild(f);
    setTimeout(function () { plate.classList.remove('kp-pulse'); f.remove(); }, 800);
  }

  function impact(targetId, amount, ko) {
    var node = spriteOf(targetId);
    if (node) {
      node.classList.add('hurt');
      setTimeout(function () { node.classList.remove('hurt'); if (ko) node.classList.add('dead'); }, 480);
      floatText(targetId, '-' + amount, 'dmg');
    } else if (state.run && state.run.battle && state.run.battle.knight && state.run.battle.knight.id === targetId) {
      floatKnight('-' + amount);
    }
  }

  /** The evolved Siegeling's cards flip and morph into random moves of the new form. */
  function transformHandCards(ownerId, previewMoves) {
    var nodes = document.querySelectorAll('.playcard[data-owner="' + ownerId + '"]');
    var ownerName = ownerNameOf(ownerId);
    Array.prototype.forEach.call(nodes, function (node, i) {
      var preview = previewMoves && previewMoves.length
        ? previewMoves[i % previewMoves.length] : null;
      setTimeout(function () {
        node.classList.add('card-transform');
        if (preview) {
          setTimeout(function () { applyPreviewToCardNode(node, preview, ownerId, ownerName); }, 380);
        }
      }, i * 90);
      setTimeout(function () { node.classList.remove('card-transform'); }, 900 + i * 90);
    });
    return nodes.length ? 900 + nodes.length * 90 : 0;
  }

  function ownerNameOf(ownerId) {
    var b = state.run && state.run.battle;
    if (!b) return '';
    if (b.knight && b.knight.id === ownerId) return b.knight.name || '';
    var all = (b.allies || []).concat(b.enemies || []);
    for (var i = 0; i < all.length; i++) { if (all[i].id === ownerId) return all[i].name; }
    return '';
  }

  /** Mid-flip card face swap during evolution — shows a random evolved move. */
  function applyPreviewToCardNode(node, preview, ownerId, ownerName) {
    if (!preview) return;
    var effCls = effectClass(preview.effect);
    node.className = 'playcard ' + elClass(preview.element) + ' card-transform';
    node.dataset.owner = ownerId;
    var statusLine = '';
    if (preview.status && preview.statusChance) {
      var meta = STATUS_META[preview.status] || { icon: '', label: preview.status };
      statusLine = '<div class="pc-status">' + meta.icon + ' ' + preview.statusChance + '% ' + meta.label + '</div>';
    }
    node.innerHTML = '<div class="pc-cost' + (preview.actionCost === 0 ? ' free' : '') + '">' + preview.actionCost + '</div>' +
      '<div class="pc-name">' + esc(preview.name) + '</div>' +
      '<div class="pc-owner">' + icon(preview.element) + ' ' + esc(ownerName) + '</div>' +
      '<div class="pc-eff ' + effCls + '">' + effectLabel(preview) + '</div>' +
      statusLine +
      '<div class="pc-desc">' + esc(preview.description || '') + '</div>';
  }

  /** Re-render the hand after evolution, morphing cards into evolved-move previews first. */
  function refreshHandCards(ownerId, previewMoves) {
    var b = state.run && state.run.battle;
    if (!b) return;
    var over = b.phase === 'WON' || b.phase === 'LOST';
    if (previewMoves && previewMoves.length) {
      var wait = transformHandCards(ownerId, previewMoves);
      setTimeout(function () { renderHand(b, over); }, Math.max(wait, 850));
    } else {
      renderHand(b, over);
      transformHandCards(ownerId);
    }
  }

  /** The hand flies off to the discard pile at end of turn. */
  function discardHandAnimation() {
    Array.prototype.forEach.call(document.querySelectorAll('#handRow .playcard'), function (node, i) {
      setTimeout(function () { node.classList.add('card-discard'); }, i * 45);
    });
  }

  /** The discard pile riffles back into the deck. */
  function reshuffleAnimation(count) {
    var stage = $('battleStage');
    if (!stage) return;
    var n = Math.min(count || 5, 7);
    for (var i = 0; i < n; i++) {
      var cardBack = el('div', 'shuffle-card', '🂠');
      cardBack.style.setProperty('--shuffle-i', i);
      stage.appendChild(cardBack);
      (function (node) { setTimeout(function () { node.remove(); }, 950); })(cardBack);
    }
  }

  /** Writes a charge value onto the knight plate + ult button mid-animation. */
  function updateChargeDisplay(value) {
    var b = state.run && state.run.battle;
    var cost = (b && b.knight && b.knight.ultCost) || 20;
    var txt = document.querySelector('#knightPlate .kp-chargetext');
    if (txt) txt.textContent = '⚡ ' + value + '/' + cost;
    var fill = document.querySelector('#knightPlate .kp-chargefill');
    if (fill) fill.style.width = Math.min(100, Math.round(100 * value / Math.max(1, cost))) + '%';
    var ult = $('knightUltBtn');
    if (ult && !ult.classList.contains('hidden')) {
      ult.textContent = value >= cost ? '⚡ ULT!' : '⚡' + value + '/' + cost;
    }
  }

  /** Leftover AP pips fly from the HUD into the Knight's charge bar — the
   *  charge number ticks up as each orb lands. */
  function apChargeAnimation(amount, total) {
    var apHost = $('apDisplay'), plate = $('knightPlate');
    if (!apHost || !plate || plate.classList.contains('hidden')) return;
    var from = apHost.getBoundingClientRect(), to = plate.getBoundingClientRect();
    var n = Math.min(amount || 1, 5);
    var start = total != null ? total - amount : null;
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          var orb = el('div', 'ap-orb');
          orb.style.left = (from.left + from.width / 2) + 'px';
          orb.style.top = (from.top + from.height / 2) + 'px';
          document.body.appendChild(orb);
          var anim = orb.animate([
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
            { transform: 'translate(calc(-50% + ' + (to.left + to.width / 2 - from.left - from.width / 2) + 'px), calc(-50% + ' +
              (to.top + to.height - 8 - from.top - from.height / 2) + 'px)) scale(.55)', opacity: .9 }
          ], { duration: 480, easing: 'cubic-bezier(.3,.7,.4,1)' });
          anim.onfinish = function () {
            orb.remove();
            plate.classList.add('kp-charge-pop');
            setTimeout(function () { plate.classList.remove('kp-charge-pop'); }, 260);
            if (start != null) {
              // Each impact bumps the visible charge toward the new total.
              updateChargeDisplay(start + Math.round((i + 1) * amount / n));
            }
          };
        }, i * 110);
      })(i);
    }
  }

  /** Element-colored orb that flies from the source sprite to the target. */
  function fireProjectile(stage, sourceId, targetId, element, onArrive) {
    var src = spriteOf(sourceId), dst = spriteOf(targetId);
    if (!src || !dst || !stage) { if (onArrive) onArrive(); return; }
    var sRect = src.getBoundingClientRect(), dRect = dst.getBoundingClientRect(), gRect = stage.getBoundingClientRect();
    var x0 = sRect.left + sRect.width / 2 - gRect.left, y0 = sRect.top + sRect.height * 0.55 - gRect.top;
    var x1 = dRect.left + dRect.width / 2 - gRect.left, y1 = dRect.top + dRect.height * 0.55 - gRect.top;
    var orb = el('div', 'projectile');
    var color = elColor(element);
    orb.style.background = 'radial-gradient(circle at 35% 30%, #fff, ' + color + ')';
    orb.style.boxShadow = '0 0 14px ' + color + ', 0 0 30px ' + color;
    orb.style.left = x0 + 'px'; orb.style.top = y0 + 'px';
    stage.appendChild(orb);
    var anim = orb.animate([
      { transform: 'translate(-50%,-50%) scale(.6)', offset: 0 },
      { transform: 'translate(calc(-50% + ' + ((x1 - x0) / 2) + 'px), calc(-50% + ' + ((y1 - y0) / 2 - 34) + 'px)) scale(1.15)', offset: 0.5 },
      { transform: 'translate(calc(-50% + ' + (x1 - x0) + 'px), calc(-50% + ' + (y1 - y0) + 'px)) scale(.9)', offset: 1 }
    ], { duration: 340, easing: 'ease-in' });
    anim.onfinish = function () {
      orb.remove();
      var burst = el('div', 'impact-burst');
      burst.style.left = x1 + 'px'; burst.style.top = y1 + 'px';
      burst.style.background = 'radial-gradient(circle, ' + color + ', transparent 65%)';
      stage.appendChild(burst);
      setTimeout(function () { burst.remove(); }, 420);
      if (onArrive) onArrive();
    };
  }

  // ---- hand ------------------------------------------------------------
  function renderHand(b, over) {
    var hand = $('handRow');
    var wasDealt = hand.dataset.dealt === '1';
    var prevScrollLeft = hand.scrollLeft;
    hand.innerHTML = '';
    if (over) {
      var wrap = el('div', 'battle-endwrap');
      wrap.appendChild(el('div', 'battle-endtitle ' + (b.phase === 'WON' ? 'win' : 'lose'),
        b.phase === 'WON' ? 'Victory!' : 'Defeat'));
      var cont = el('button', 'siege-btn primary', b.phase === 'WON' ? 'Claim Rewards' : 'End Expedition');
      cont.addEventListener('click', continueRun);
      wrap.appendChild(cont);
      hand.appendChild(wrap);
      return;
    }
    var sorted = sortHandByOwner(b);
    var deal = state.dealAnimation;
    state.dealAnimation = false;
    var prevOwner = null;
    sorted.forEach(function (card, i) {
      var effCls = effectClass(card.effect);
      var groupStart = i > 0 && card.ownerId !== prevOwner;
      prevOwner = card.ownerId;
      var c = el('div', 'playcard ' + elClass(card.element) + (card.effect === 'EVOLVE' ? ' evo-card' : '') + (card.playable ? '' : ' unplayable') + (card.instanceId === state.selectedCardId ? ' selected' : '') + (deal ? ' dealt' : '') + (groupStart ? ' group-start' : ''));
      c.dataset.owner = card.ownerId;
      if (deal) c.style.setProperty('--deal-i', i);
      var statusLine = '';
      if (card.status && card.statusChance) {
        var meta = STATUS_META[card.status] || { icon: '', label: card.status };
        statusLine = '<div class="pc-status">' + meta.icon + ' ' + card.statusChance + '% ' + meta.label + '</div>';
      }
      // A locked evolution card shows its gauge instead of the description.
      var gaugeLine = '';
      if (card.effect === 'EVOLVE' && card.gauge != null && card.gauge < card.gaugeMax) {
        gaugeLine = '<div class="pc-gauge"><div class="pc-gaugefill" style="width:' +
          Math.round(100 * card.gauge / Math.max(1, card.gaugeMax)) + '%"></div>' +
          '<span>🌟 ' + card.gauge + '/' + card.gaugeMax + ' AP</span></div>';
      }
      c.innerHTML = '<div class="pc-cost' + (card.actionCost === 0 ? ' free' : '') + '">' + card.actionCost + '</div>' +
        '<div class="pc-name">' + esc(card.name) + '</div>' +
        '<div class="pc-owner">' + icon(card.element) + ' ' + esc(card.ownerName) + '</div>' +
        '<div class="pc-eff ' + effCls + '">' + effectLabel(card) + '</div>' +
        statusLine + gaugeLine +
        '<div class="pc-desc">' + esc(card.description || '') + '</div>';
      setupCardDrag(c, card);
      hand.appendChild(c);
    });
    bindHandFanScrolling(hand);
    // First deal centers the whole hand; later re-renders (draw/play/end turn)
    // keep whatever part of the hand the player last scrolled to.
    hand.scrollLeft = (deal || !wasDealt) ? (hand.scrollWidth - hand.clientWidth) / 2 : prevScrollLeft;
    if (sorted.length) hand.dataset.dealt = '1';
    layoutHandFan(hand);
  }

  /** Hand cards overflow a single screen, so the hand scrolls horizontally —
   *  swipe left/right (or spin a mouse wheel) to bring other cards to the
   *  center. As the hand scrolls, layoutHandFan() re-arcs the cards so the
   *  centered one sits upright and raised, like a wheel of cards turning
   *  through the middle, while off-center cards rotate away and dip down. */
  function bindHandFanScrolling(hand) {
    if (hand.dataset.wheelBound === '1') return;
    hand.dataset.wheelBound = '1';
    var raf = 0;
    function scheduleLayout() {
      if (raf) return;
      raf = window.requestAnimationFrame(function () { raf = 0; layoutHandFan(hand); });
    }
    hand.addEventListener('scroll', scheduleLayout, { passive: true });
    hand.addEventListener('wheel', function (event) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      hand.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });
    window.addEventListener('resize', scheduleLayout);
  }

  var HAND_FAN_MAX_ANGLE = 16;   // deg a card rotates away from center at the edge
  // px a card RISES above the centered card at the edge. Cards arc UPWARD/outward
  // from the low centered card (like a hand held near the thumbs) rather than
  // dipping below it — a downward dip pushed edge cards past the fan's
  // overflow-y:hidden clip line and cut off their bottoms on phones (r9 bugfix).
  var HAND_FAN_MAX_LIFT = 26;
  var HAND_FAN_MAX_SHRINK = 0.08; // fraction a card shrinks away from center

  /** Re-arcs every card in the hand based on its current scroll position —
   *  distance from the container's horizontal center drives rotation, dip,
   *  and scale, so scrolling reads as a wheel of cards turning past center. */
  function layoutHandFan(hand) {
    hand = hand || $('handRow');
    if (!hand) return;
    var half = hand.clientWidth / 2;
    if (!half) return;
    var centerX = hand.scrollLeft + half;
    Array.prototype.forEach.call(hand.querySelectorAll('.playcard'), function (card) {
      var cardCenter = card.offsetLeft + (card.offsetWidth / 2);
      var offset = Math.max(-1.4, Math.min(1.4, (cardCenter - centerX) / half));
      card.style.setProperty('--fan-rot', (offset * HAND_FAN_MAX_ANGLE).toFixed(2) + 'deg');
      // Negative = up: keep the lowest card at the flex-end baseline so nothing
      // dips past the fan's bottom clip line (see HAND_FAN_MAX_LIFT note).
      card.style.setProperty('--fan-y', (-Math.abs(offset) * HAND_FAN_MAX_LIFT).toFixed(1) + 'px');
      card.style.setProperty('--fan-scale', (1 - (Math.abs(offset) * HAND_FAN_MAX_SHRINK)).toFixed(3));
      card.classList.toggle('is-centered', Math.abs(offset) < 0.12);
    });
  }

  /** Cards are played by dragging them onto the battle arena; a tap (no
   *  drag) just brings the card into focus for a closer look. A ghost
   *  follows the pointer while dragging, and drop targets highlight so it's
   *  obvious where the card will land. Targeted cards also draw a curved
   *  arrow from the card to the finger (snapping to a valid unit on hover). */
  var DRAG_THRESHOLD = 8;
  var TARGET_ARROW_SVG_NS = 'http://www.w3.org/2000/svg';
  var DRAG_ARROW_PALETTES = {
    DAMAGE: { source: '#ffaa55', target: '#ff3344', glow: '#ff6644' },
    HEAL: { source: '#a8ffd2', target: '#3ce08a', glow: '#5bffae' },
    SHIELD: { source: '#9adfff', target: '#76e6ff', glow: '#5cbcff' },
    BUFF_ATK: { source: '#9adfff', target: '#3ea6ff', glow: '#5cbcff' },
    BUFF_SPD: { source: '#9adfff', target: '#3ea6ff', glow: '#5cbcff' },
    SLOW: { source: '#dff0ff', target: '#7adfff', glow: '#a6edff' },
    SWAP: { source: '#e2c2ff', target: '#9a55ff', glow: '#b985ff' },
    EVOLVE: { source: '#ffe9a8', target: '#ffd066', glow: '#ffe080' },
    default: { source: '#ffd28a', target: '#ff9a3c', glow: '#ffbd70' }
  };
  var dragArrowState = { active: false, raf: 0, palette: null, ghost: null, snapEl: null, startedAt: 0 };

  function dragArrowPalette(card) {
    return DRAG_ARROW_PALETTES[card.effect] || DRAG_ARROW_PALETTES.default;
  }

  function ensureDragArrowLayer() {
    var layer = document.getElementById('siegeDragArrowLayer');
    if (!layer) {
      layer = document.createElementNS(TARGET_ARROW_SVG_NS, 'svg');
      layer.id = 'siegeDragArrowLayer';
      layer.classList.add('siege-target-arrow-layer');
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('focusable', 'false');
      document.body.appendChild(layer);
    }
    return layer;
  }

  function dragArrowClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function dragArrowControlPoint(source, target, sceneCenterY) {
    var mx = (source.x + target.x) / 2;
    var my = (source.y + target.y) / 2;
    var dx = target.x - source.x;
    var dy = target.y - source.y;
    var len = Math.hypot(dx, dy) || 1;
    var px = -dy / len;
    var py = dx / len;
    var dirSign = my > sceneCenterY ? -1 : 1;
    if (Math.abs(dy) < 8) { px = 0; py = -1; }
    var k = dragArrowClamp(len * 0.2, 24, 140);
    return { x: mx + (px * k * dirSign), y: my + (py * k * dirSign) };
  }

  function dragArrowPath(source, control, target) {
    return 'M ' + source.x.toFixed(1) + ' ' + source.y.toFixed(1) +
      ' Q ' + control.x.toFixed(1) + ' ' + control.y.toFixed(1) +
      ' ' + target.x.toFixed(1) + ' ' + target.y.toFixed(1);
  }

  function dragArrowQuadPoint(source, control, target, t) {
    var u = 1 - t;
    return {
      x: (u * u * source.x) + (2 * u * t * control.x) + (t * t * target.x),
      y: (u * u * source.y) + (2 * u * t * control.y) + (t * t * target.y)
    };
  }

  function dragArrowGhostCenter() {
    var ghost = dragArrowState.ghost;
    if (!ghost) return null;
    var rect = ghost.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
  }

  function dragArrowSnapCenter() {
    var el = dragArrowState.snapEl;
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height * 0.42) };
  }

  function drawDragArrow(timestamp) {
    if (!dragArrowState.active) return;
    var svg = ensureDragArrowLayer();
    var w = window.innerWidth;
    var h = window.innerHeight;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));

    var source = dragArrowGhostCenter();
    var target = dragArrowSnapCenter();
    if (!target && dragArrowState.pointerX != null) {
      target = { x: dragArrowState.pointerX, y: dragArrowState.pointerY };
    }
    if (!source || !target) {
      svg.innerHTML = '';
      if (dragArrowState.active) dragArrowState.raf = window.requestAnimationFrame(drawDragArrow);
      return;
    }

    var palette = dragArrowState.palette || DRAG_ARROW_PALETTES.default;
    var control = dragArrowControlPoint(source, target, h / 2);
    var path = dragArrowPath(source, control, target);
    var elapsed = Math.max(0, timestamp - dragArrowState.startedAt);
    var dashPhase = (elapsed * 0.0006) % 1;
    var tail = dragArrowQuadPoint(source, control, target, 0.965);
    var angle = Math.atan2(target.y - tail.y, target.x - tail.x);
    var size = 14;
    var spread = 0.52;
    var left = {
      x: target.x - (Math.cos(angle - spread) * size),
      y: target.y - (Math.sin(angle - spread) * size)
    };
    var right = {
      x: target.x - (Math.cos(angle + spread) * size),
      y: target.y - (Math.sin(angle + spread) * size)
    };
    var shapes = [];
    shapes.push('<path d="' + path + '" fill="none" stroke="' + palette.glow + '" stroke-width="10" stroke-linecap="round" opacity="0.2"/>');
    shapes.push('<path d="' + path + '" fill="none" stroke="' + palette.source + '" stroke-width="2.5" stroke-linecap="round" opacity="0.95"/>');
    shapes.push('<path d="' + path + '" fill="none" pathLength="1" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.06 0.106" stroke-dashoffset="' + (-dashPhase).toFixed(3) + '" opacity="0.65"/>');
    shapes.push('<polygon points="' + target.x.toFixed(1) + ',' + target.y.toFixed(1) + ' ' +
      left.x.toFixed(1) + ',' + left.y.toFixed(1) + ' ' +
      right.x.toFixed(1) + ',' + right.y.toFixed(1) + '" fill="' + palette.target + '" opacity="0.92"/>');
    var pulse = Math.sin(elapsed * 0.01);
    var ringRadius = 8 + (4 * ((pulse + 1) / 2));
    shapes.push('<circle cx="' + target.x.toFixed(1) + '" cy="' + target.y.toFixed(1) + '" r="' + ringRadius.toFixed(1) + '" fill="none" stroke="' + palette.target + '" stroke-width="2" opacity="' + (0.22 + (0.2 * ((pulse + 1) / 2))).toFixed(3) + '"/>');
    shapes.push('<circle cx="' + source.x.toFixed(1) + '" cy="' + source.y.toFixed(1) + '" r="12" fill="' + palette.source + '" opacity="0.16"/>');
    shapes.push('<circle cx="' + source.x.toFixed(1) + '" cy="' + source.y.toFixed(1) + '" r="5" fill="' + palette.source + '" opacity="0.55"/>');
    svg.innerHTML = shapes.join('');
    svg.classList.add('is-active');
    dragArrowState.raf = window.requestAnimationFrame(drawDragArrow);
  }

  function livingEnemies(b) {
    return (b && b.enemies ? b.enemies : []).filter(function (e) { return e.alive; });
  }

  function soleLivingEnemy(b) {
    var live = livingEnemies(b);
    return live.length === 1 ? live[0] : null;
  }

  function cardTargetsSingleEnemy(card) {
    return Boolean(card && card.target === 'ENEMY_SINGLE');
  }

  /** True when the player must drop onto a specific unit sprite. */
  function cardNeedsSpriteTarget(card, b) {
    if (!card || !card.needsTarget) return false;
    if (cardTargetsSingleEnemy(card) && soleLivingEnemy(b)) return false;
    return true;
  }

  function startDragArrow(card, ghostEl) {
    if (!card.needsTarget) return;
    if (dragArrowState.raf) window.cancelAnimationFrame(dragArrowState.raf);
    dragArrowState.active = true;
    dragArrowState.palette = dragArrowPalette(card);
    dragArrowState.ghost = ghostEl;
    dragArrowState.snapEl = null;
    dragArrowState.pointerX = null;
    dragArrowState.pointerY = null;
    dragArrowState.startedAt = performance.now();
    dragArrowState.raf = window.requestAnimationFrame(drawDragArrow);
  }

  function updateDragArrow(clientX, clientY, snapEl) {
    if (!dragArrowState.active) return;
    dragArrowState.pointerX = clientX;
    dragArrowState.pointerY = clientY;
    dragArrowState.snapEl = snapEl || null;
  }

  function clearDragArrow() {
    dragArrowState.active = false;
    dragArrowState.ghost = null;
    dragArrowState.snapEl = null;
    if (dragArrowState.raf) {
      window.cancelAnimationFrame(dragArrowState.raf);
      dragArrowState.raf = 0;
    }
    var svg = document.getElementById('siegeDragArrowLayer');
    if (svg) {
      svg.classList.remove('is-active');
      svg.innerHTML = '';
    }
  }

  function setupCardDrag(cardEl, card) {
    var pointerId = null;
    var startX = 0, startY = 0, dragOffsetX = 0, dragOffsetY = 0;
    var dragging = false;
    var ghost = null;

    function canInteract() {
      var b = state.run && state.run.battle;
      return Boolean(b) && b.phase === 'PLAYER_INPUT' && !state.busy;
    }

    function beginGhost(clientX, clientY) {
      var rect = cardEl.getBoundingClientRect();
      dragOffsetX = clientX - rect.left;
      dragOffsetY = clientY - rect.top;
      ghost = cardEl.cloneNode(true);
      ghost.classList.add('playcard-ghost');
      ghost.style.position = 'fixed';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.margin = '0';
      ghost.style.setProperty('--fan-rot', '0deg');
      ghost.style.setProperty('--fan-y', '0px');
      ghost.style.setProperty('--fan-scale', '1');
      document.body.appendChild(ghost);
      cardEl.classList.add('playcard-dragsource');
      // Targeted drag: dim the arena behind the overlays so the lock-on ring +
      // trajectory arc read as the focus (CSS scrim keyed off this body class).
      if (cardNeedsSpriteTarget(card, state.run.battle)) {
        startDragArrow(card, ghost);
        document.body.classList.add('siege-drag-active');
      }
    }

    function moveGhost(clientX, clientY) {
      if (!ghost) return;
      ghost.style.left = (clientX - dragOffsetX) + 'px';
      ghost.style.top = (clientY - dragOffsetY) + 'px';
    }

    function updateDropHover(clientX, clientY) {
      var stage = $('battleStage');
      var hitEl = document.elementFromPoint(clientX, clientY);
      var overStage = Boolean(hitEl && stage.contains(hitEl));
      stage.classList.toggle('drop-hover', overStage);
      var spriteEl = hitEl && hitEl.closest ? hitEl.closest('.sprite') : null;
      Array.prototype.forEach.call(document.querySelectorAll('.sprite.drop-hover'), function (n) { n.classList.remove('drop-hover'); });
      var snapEl = null;
      if (spriteEl && cardNeedsSpriteTarget(card, state.run.battle) && isValidDropTarget(spriteEl)) {
        spriteEl.classList.add('drop-hover');
        snapEl = spriteEl;
      }
      if (cardNeedsSpriteTarget(card, state.run.battle)) updateDragArrow(clientX, clientY, snapEl);
    }

    function isValidDropTarget(spriteEl) {
      var wantsEnemy = card.target === 'ENEMY_SINGLE';
      var isEnemy = spriteEl.dataset.side === 'ENEMY';
      var alive = !spriteEl.classList.contains('dead');
      return alive && (wantsEnemy ? isEnemy : !isEnemy);
    }

    function cleanup() {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      clearDragArrow();
      document.body.classList.remove('siege-drag-active');
      cardEl.classList.remove('playcard-dragsource');
      var stage = $('battleStage');
      stage.classList.remove('drop-hover');
      Array.prototype.forEach.call(document.querySelectorAll('.sprite.targetable, .sprite.drop-hover'), function (n) {
        n.classList.remove('targetable');
        n.classList.remove('drop-hover');
      });
      dragging = false;
      pointerId = null;
    }

    cardEl.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!canInteract() || !card.playable) return;
      pointerId = event.pointerId;
      startX = event.clientX; startY = event.clientY;
      dragging = false;
      if (cardEl.setPointerCapture) cardEl.setPointerCapture(pointerId);
    });

    cardEl.addEventListener('pointermove', function (event) {
      if (pointerId === null || event.pointerId !== pointerId) return;
      var dx = event.clientX - startX, dy = event.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragging = true;
        beginGhost(startX, startY);
        if (cardNeedsSpriteTarget(card, state.run.battle)) highlightTargets(card);
      }
      event.preventDefault();
      moveGhost(event.clientX, event.clientY);
      updateDropHover(event.clientX, event.clientY);
    });

    function finish(event) {
      if (pointerId === null || event.pointerId !== pointerId) return;
      var wasDragging = dragging;
      var dropX = event.clientX, dropY = event.clientY;
      if (cardEl.hasPointerCapture && cardEl.hasPointerCapture(pointerId)) cardEl.releasePointerCapture(pointerId);
      cleanup();
      if (!wasDragging) { toggleCardFocus(card); return; }
      if (!canInteract() || !card.playable) return;
      var dropEl = document.elementFromPoint(dropX, dropY);
      var stage = $('battleStage');
      if (!dropEl || !stage.contains(dropEl)) return; // dropped off the arena — cancel
      var b = state.run.battle;
      if (cardNeedsSpriteTarget(card, b)) {
        var spriteEl = dropEl.closest ? dropEl.closest('.sprite') : null;
        if (!spriteEl || !isValidDropTarget(spriteEl)) {
          toast('Drop ' + card.name + ' on a valid target.');
          return;
        }
        playCard(card.instanceId, spriteEl.dataset.id);
        return;
      }
      var soleEnemy = cardTargetsSingleEnemy(card) ? soleLivingEnemy(b) : null;
      playCard(card.instanceId, soleEnemy ? soleEnemy.id : null);
    }
    cardEl.addEventListener('pointerup', finish);
    cardEl.addEventListener('pointercancel', function (event) {
      if (pointerId === null || event.pointerId !== pointerId) return;
      cleanup();
    });
  }

  /** Groups the hand by owning Siegeling (left-to-right party order), Knight
   *  cards last; cards belonging to the same character always sit together. */
  function sortHandByOwner(b) {
    var rank = {};
    (b.allies || []).forEach(function (a, i) { rank[a.id] = i; });
    return b.hand.slice().sort(function (x, y) {
      var rx = x.ownerId in rank ? rank[x.ownerId] : 999;
      var ry = y.ownerId in rank ? rank[y.ownerId] : 999;
      return rx - ry;
    });
  }

  function effectClass(effect) {
    if (effect === 'DAMAGE') return 'dmg';
    if (effect === 'HEAL') return 'heal';
    if (effect === 'SHIELD') return 'shield';
    if (effect === 'EVOLVE') return 'evo';
    return 'buff';
  }
  function effectLabel(card) {
    switch (card.effect) {
      case 'DAMAGE': {
        var boosted = (card.boostedValue != null && card.boostedValue > card.value)
          ? '<span class="pc-boost">' + card.boostedValue + '</span> <s>' + card.value + '</s>'
          : card.value;
        return '⚔ ' + boosted + ' dmg' + (card.target === 'ALL_ENEMIES' ? ' (all)' : '');
      }
      case 'HEAL': return '➕ Heal ' + card.value + (card.target === 'ALLY_ALL' ? ' (all)' : '');
      case 'SHIELD': return '🛡 Shield ' + card.value + (card.target === 'ALLY_ALL' ? ' (all)' : '');
      case 'BUFF_ATK': return '↑ +' + card.value + ' attack (party)';
      case 'BUFF_SPD': return '↑ +' + card.value + ' speed';
      case 'SLOW': return '❄ Slow enemies';
      case 'SWAP': return '⇄ Swap notches';
      case 'EVOLVE': return '🌟 Evolve!';
      default: return card.effect;
    }
  }

  /** Tapping a card (without dragging it) just brings it into focus — a
   *  closer look, not a play attempt. Playing a card means dragging it onto
   *  the battle arena (see setupCardDrag). */
  function toggleCardFocus(card) {
    var b = state.run.battle;
    if (!b || b.phase !== 'PLAYER_INPUT') return;
    state.selectedCardId = state.selectedCardId === card.instanceId ? null : card.instanceId;
    renderBattle();
  }

  function onUnitClick(u) {
    if (state.busy) return;
    var sel = state.knightSelectedItem ? findKnightItem(state.run, state.knightSelectedItem) : null;
    if (sel && state.run && state.run.battle && state.run.battle.phase === 'PLAYER_INPUT') {
      var isKnight = state.run.battle.knight && state.run.battle.knight.id === u.id;
      if (knightTargetValid(sel, u, isKnight)) {
        useKnightItemInBattle(sel.id, u.id);
        return;
      }
      toast(sel.kind === 'REVIVE' ? 'Choose a fallen Siegeling.' : 'Choose a living ally who needs healing.');
      return;
    }
    showBattleUnitDetails(u);
  }

  /** Cards, abilities, and evolution info for any battlefield unit (allies AND enemies). */
  function showBattleUnitDetails(u) {
    var run = state.run;
    if (u.side === 'ENEMY') {
      var intentNote = u.intent ? ' · Next: ' + u.intent.name : '';
      showUnitModal({
        name: u.name, element: u.element, artUrl: u.artUrl,
        subtitle: 'Enemy · HP ' + u.hp + '/' + u.maxHp + ' · ⚡ ' + u.speed + intentNote,
        cards: u.abilities || []
      });
      return;
    }
    var member = (run.party || []).find(function (p) { return p.id === u.id; });
    var evoNote = '';
    if (u.hasEvolution) {
      var target = member && member.evolvesTo ? ' → ' + member.evolvesTo : '';
      evoNote = u.evoReady ? ' · 🌟 Evolution ready' + target
        : ' · 🌟 Gauge ' + u.evoGauge + '/' + u.evoGaugeMax + target;
    }
    showUnitModal({
      name: u.name, element: u.element, artUrl: u.artUrl,
      subtitle: 'HP ' + u.hp + '/' + u.maxHp + ' · ⚡ ' + u.speed + evoNote,
      cards: member ? (member.cards || []) : []
    });
  }

  function currentCard() {
    var b = state.run.battle; if (!b) return null;
    return b.hand.find(function (c) { return c.instanceId === state.selectedCardId; });
  }

  /** The focused card (tapped, not dragged) shows a drag hint; if it needs a
   *  target, valid drop targets glow so it's clear where to drag it. */
  function updateHint(b, over) {
    var hint = $('battleHint');
    if (over) { hint.textContent = ''; highlightTargets(null); return; }
    if (b.phase !== 'PLAYER_INPUT') { hint.textContent = 'Enemies are acting…'; highlightTargets(null); highlightKnightTargets(null); return; }
    var selItem = state.knightSelectedItem ? findKnightItem(state.run, state.knightSelectedItem) : null;
    if (selItem) {
      highlightTargets(null);
      highlightKnightTargets(selItem);
      hint.textContent = selItem.kind === 'REVIVE'
        ? 'Tap a fallen Siegeling to play ' + selItem.name + '.'
        : 'Tap an ally to share ' + selItem.name + '.';
      return;
    }
    var card = currentCard();
    if (card) {
      var needsSprite = cardNeedsSpriteTarget(card, b);
      highlightTargets(needsSprite ? card : null);
      highlightKnightTargets(null);
      hint.textContent = needsSprite
        ? 'Drag ' + card.name + ' onto a ' + (card.target === 'ENEMY_SINGLE' ? 'target enemy' : 'friendly Siegeling') + '.'
        : 'Drag ' + card.name + ' onto the battlefield to play it.';
    } else {
      highlightTargets(null);
      highlightKnightTargets(null);
      hint.textContent = 'Drag a card onto the battlefield to play it (' + b.actionPoints + ' AP left), or End Turn.';
    }
  }

  function highlightKnightTargets(item) {
    Array.prototype.forEach.call(document.querySelectorAll('.sprite.ally'), function (node) {
      if (!item) { node.classList.remove('targetable'); return; }
      var id = node.dataset.id;
      var u = (state.run.battle.allies || []).find(function (a) { return a.id === id; });
      var isKnight = state.run.battle.knight && state.run.battle.knight.id === id;
      node.classList.toggle('targetable', u && knightTargetValid(item, u, isKnight));
    });
    var knightNode = $('knightPlate');
    if (knightNode && state.run.battle.knight && item && item.kind === 'HEAL') {
      knightNode.classList.toggle('targetable', knightTargetValid(item, state.run.battle.knight, true));
      if (knightNode.classList.contains('targetable')) {
        knightNode.onclick = function () { useKnightItemInBattle(item.id, state.run.battle.knight.id); };
      } else {
        knightNode.onclick = null;
      }
    } else if (knightNode) {
      knightNode.classList.remove('targetable');
      knightNode.onclick = null;
    }
  }

  function highlightTargets(card) {
    Array.prototype.forEach.call(document.querySelectorAll('.sprite'), function (node) {
      if (!card) { node.classList.remove('targetable'); return; }
      var wantsEnemy = card.target === 'ENEMY_SINGLE';
      var isEnemy = node.dataset.side === 'ENEMY';
      var alive = !node.classList.contains('dead');
      node.classList.toggle('targetable', alive && (wantsEnemy ? isEnemy : !isEnemy));
    });
  }

  function playCard(cardId, targetId) {
    if (state.busy) return;
    state.busy = true;
    syncBattleActionButtons();
    api('/api/siege/battle/play', { method: 'POST', body: { token: token(), cardId: cardId, targetId: targetId } })
      .then(function (run) {
        state.selectedCardId = null;
        if (run.error) toast(run.error);
        state.busy = false;
        applyRun(run);
      })
      .catch(function (e) { toast(e.message); state.busy = false; });
  }

  function endTurn() {
    if (state.busy) return;
    state.busy = true;
    syncBattleActionButtons();
    state.selectedCardId = null;
    api('/api/siege/battle/end-turn', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.busy = false; applyRun(run); })
      .catch(function (e) { toast(e.message); state.busy = false; });
  }

  function useUltimate() {
    if (state.busy) return;
    state.busy = true;
    syncBattleActionButtons();
    api('/api/siege/battle/ultimate', { method: 'POST', body: { token: token() } })
      .then(function (run) { if (run.error) toast(run.error); state.busy = false; applyRun(run); })
      .catch(function (e) { toast(e.message); state.busy = false; });
  }

  function continueRun() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/continue', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); announceLevelUps(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  /** After a battle, flag any Siegelings (or the knight) that leveled up. */
  function announceLevelUps(run) {
    if (!run) return;
    var leveled = [];
    (run.party || []).forEach(function (p) {
      if (p.leveledThisBattle) leveled.push(p.name + ' → Lv' + p.level);
    });
    if (run.knight && run.knight.leveledThisBattle) {
      leveled.push(run.knight.name + ' → Lv' + run.knight.level);
    }
    if (leveled.length) toast('⭐ LEVEL UP! ' + leveled.join(' · '));
  }

  // ---- rewards ----------------------------------------------------------
  var REWARD_ICON = { CARD: '🃏', UPGRADE: '⬆️', RECRUIT: '🐾' };

  function renderXpRecap() {
    var host = $('xpRecap');
    if (!host) return;
    var recap = state.run && state.run.xpRecap;
    var units = recap && Array.isArray(recap.units) ? recap.units : [];
    if (!units.length) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    var levelUps = Array.isArray(recap.levelUps)
      ? recap.levelUps
      : units.filter(function (u) { return u.leveledUp || (u.levelAfter || 1) > (u.levelBefore || 1); });
    var totalAwarded = recap.totalAwarded || units.reduce(function (sum, u) { return sum + (u.xpGained || 0); }, 0);
    host.classList.remove('hidden');
    host.innerHTML =
      '<div class="xp-recap-head">' +
        '<div><span class="xp-recap-kicker">Battle XP</span><h2>Leveling recap</h2></div>' +
        '<div class="xp-recap-total">+' + totalAwarded + ' team XP</div>' +
      '</div>' +
      (levelUps.length
        ? '<div class="xp-levelups">' + levelUps.map(function (u) {
            return '<span class="xp-levelup-chip">⭐ ' + esc(u.name) + ' Lv ' +
              esc(u.levelBefore || '?') + ' → ' + esc(u.levelAfter || '?') + '</span>';
          }).join('') + '</div>'
        : '<div class="xp-levelups muted">No level-ups this fight.</div>') +
      '<div class="xp-recap-list">' + units.map(renderXpRecapRow).join('') + '</div>';
  }

  function renderXpRecapRow(u) {
    var level = u.levelAfter || u.level || 1;
    var before = u.levelBefore || level;
    var leveled = u.leveledUp || level > before;
    var span = u.xpSpan || 0;
    var inLevel = Math.max(0, u.xpInLevel || 0);
    var pct = span > 0 ? Math.max(0, Math.min(100, Math.round(100 * inLevel / span))) : 100;
    var type = u.kind === 'KNIGHT' ? 'SiegeKnight' : 'Siegeling';
    var bonus = u.killBonus > 0
      ? '<span class="xp-kill-bonus">+' + u.killBonus + ' killing blow</span>'
      : '';
    var progressText = span > 0 ? (inLevel + '/' + span + ' XP') : 'Max level';
    return '<div class="xp-recap-row ' + elClass(u.element) + (leveled ? ' leveled' : '') + '">' +
      '<div class="xp-unit-main">' +
        '<div class="xp-unit-name">' + icon(u.element) + ' ' + esc(u.name) + '</div>' +
        '<div class="xp-unit-meta">' + type + ' · +' + (u.xpGained || 0) + ' XP ' + bonus + '</div>' +
      '</div>' +
      '<div class="xp-unit-level">' +
        '<span class="xp-level-badge">' + (leveled ? ('Lv ' + before + ' → ' + level) : ('Lv ' + level)) + '</span>' +
        '<div class="xp-bar" title="' + esc(progressText) + '"><div class="xp-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="xp-progress-text">' + progressText + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderRewards() {
    showScreen('rewardScreen');
    $('rewardSub').textContent = state.run.lastReward || 'Choose one reward to strengthen the run.';
    renderXpRecap();
    var grid = $('rewardGrid'); grid.innerHTML = '';
    (state.run.pendingRewards || []).forEach(function (opt) {
      var c = el('div', 'reward-card ' + elClass(opt.element) + ' kind-' + opt.kind);
      var art = opt.artUrl
        ? '<div class="reward-art" style="background-image:url(\'' + artCss(opt.artUrl) + '\')"></div>'
        : '<div class="reward-glyph">' + (REWARD_ICON[opt.kind] || '🎁') + '</div>';
      var meta = '';
      if (opt.kind === 'CARD' && opt.cardEffect) {
        meta = '<div class="reward-cardmeta">' + icon(opt.element) + ' ' + esc(opt.cardEffect) + ' · power ' + opt.cardValue + ' · ' + opt.cardCost + ' AP</div>';
      }
      c.innerHTML =
        '<div class="reward-kind">' + esc(kindLabel(opt.kind)) + '</div>' +
        art +
        '<div class="reward-title">' + esc(opt.title) + '</div>' +
        meta +
        '<div class="reward-desc">' + esc(opt.desc) + '</div>';
      c.addEventListener('click', function () { chooseReward(opt.id); });
      grid.appendChild(c);
    });
  }

  function kindLabel(kind) {
    return { CARD: 'New Card', UPGRADE: 'Upgrade', RECRUIT: 'Recruit' }[kind] || 'Reward';
  }

  function chooseReward(optionId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/reward/choose', { method: 'POST', body: { token: token(), optionId: optionId } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- result --------------------------------------------------------
  // ---- gacha-style join reveal ------------------------------------------
  function renderRecruitReveal() {
    showScreen('recruitScreen');
    var r = state.run.recruit;
    var stage = r.stage || 1;
    var stageCls = stage >= 3 ? 'stage3' : stage === 2 ? 'stage2' : 'stage1';
    var el3 = elClass(r.element);

    var gs = $('gachaStage');
    gs.className = 'gacha-stage ' + stageCls + ' ' + el3;
    // Restart the pop animation on each reveal.
    void gs.offsetWidth;
    gs.classList.add('go');

    $('gachaBanner').textContent = stage >= 3 ? '✦ LEGENDARY MUSTER ✦' : stage === 2 ? '✦ Rare Muster ✦' : 'A Siegeling joins!';
    $('gachaName').innerHTML = icon(r.element) + ' ' + esc(r.name);
    $('gachaStats').textContent = '❤ ' + (r.hp || '?') + ' · ⚡ ' + (r.speed || '?') + ' · 🃏 ' + (r.moveCount || 0) + ' moves join your deck';

    var stars = '';
    for (var i = 0; i < stage; i++) stars += '★';
    $('gachaStars').textContent = stars;

    var art = $('gachaArt');
    art.innerHTML = r.artUrl
      ? '<img src="' + artAttr(r.artUrl) + '" alt="" onerror="this.parentNode.innerHTML=\'<span class=&quot;gacha-fallback&quot;>' + icon(r.element) + '</span>\'">'
      : '<span class="gacha-fallback">' + icon(r.element) + '</span>';

    // Sparkle field
    var sp = $('gachaSparkles'); sp.innerHTML = '';
    for (var k = 0; k < 18; k++) {
      var dot = el('span', 'gacha-spark');
      dot.style.left = (5 + Math.random() * 90) + '%';
      dot.style.top = (5 + Math.random() * 80) + '%';
      dot.style.animationDelay = (Math.random() * 2.4) + 's';
      dot.style.fontSize = (9 + Math.random() * 14) + 'px';
      dot.textContent = '✦';
      sp.appendChild(dot);
    }
  }

  function claimRecruit() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/recruit/ack', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function extractTeam() {
    if (state.busy) return;
    if (!confirm('Extract your team now? This ends the Endless run and banks your leveled Siegelings for Battlegrounds.')) return;
    state.busy = true;
    api('/api/siege/extract', { method: 'POST', body: { token: token() } })
      .then(function (run) { applyRun(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function renderResult() {
    showScreen('resultScreen');
    var run = state.run;
    var won = run.status === 'WON';
    var endless = run.mode === 'ENDLESS';
    var title = $('resultTitle');
    title.textContent = endless ? ('Endless Run — Score ' + (run.score || 0)) : (won ? 'Expedition Won' : 'Expedition Lost');
    title.className = won ? 'win' : 'lose';
    $('resultText').textContent = run.lastReward || (won ? 'The Siegelord has fallen.' : 'Your warband was overwhelmed.');

    var extras = $('resultExtras'); extras.innerHTML = '';

    // Run stats + end-of-run account rewards.
    var st = run.stats || {};
    var statsRow = el('div', 'result-stats',
      '⚔ ' + (st.enemiesDefeated || 0) + ' foes · 👑 ' + (st.bossKills || 0) + ' bosses · 🗺 ' +
      (st.nodesCleared || 0) + ' nodes · 🪙 ' + (st.goldEarned || 0) + ' looted' +
      (endless ? ' · 🔁 loop ' + ((run.loop || 0) + 1) : ''));
    extras.appendChild(statsRow);

    var er = run.endRewards;
    if (er) {
      var cardLine = er.card ? '<div>🃏 Card: <strong>' + esc(er.card.name) + '</strong> (' + esc(er.card.rarity) + ')</div>' : '';
      var note = er.claimed ? 'Added to your account.' : 'Sign in before your next run to bank rewards like these!';
      var box = el('div', 'result-rewards',
        '<h3>Spoils of War</h3>' +
        '<div>🪙 ' + (er.gold || 0) + ' Siegecoins</div>' +
        '<div>💠 ' + (er.remnants || 0) + ' Remnants</div>' +
        cardLine +
        '<div class="result-claim' + (er.claimed ? ' ok' : '') + '">' + note + '</div>');
      extras.appendChild(box);
    }

    // Team extraction: the leveled team was banked for Battlegrounds.
    var extraction = run.extraction;
    if (extraction) {
      var members = extraction.members || [];
      var kn = extraction.knight || {};
      var chips = members.map(function (mv) {
        return '<span class="extract-chip">' + esc(mv.name || 'Siegeling') +
          ' <strong>Lv ' + (mv.level || 1) + '</strong></span>';
      }).join('');
      var knightLine = kn.knightName
        ? '<div class="extract-knight">👑 ' + esc(kn.knightName) + ' — Lv ' + (kn.level || 1) + '</div>'
        : '';
      var xbox = el('div', 'result-extract',
        '<h3>⤴ Team extracted — banked for Battlegrounds</h3>' +
        knightLine +
        '<div class="extract-chips">' + chips + '</div>' +
        '<div class="extract-note">Your veterans keep the level they reached. Bring 3 into Battlegrounds.</div>');
      extras.appendChild(xbox);
    }

    // Winning a standard run unlocks saving the team for Endless mode.
    if (won && !endless) {
      var teamIds = (run.party || []).map(function (p) { return p.sourceCardId; }).filter(Boolean);
      if (teamIds.length) {
        var saver = el('div', 'result-save', '<h3>Save this team for Endless</h3>');
        var row = el('div', 'result-save-row');
        teamSlots().forEach(function (slot, i) {
          var label = slot ? ('Slot ' + (i + 1) + ': ' + esc(slot.name)) : ('Save to Slot ' + (i + 1));
          var btn = el('button', 'siege-btn', label);
          btn.addEventListener('click', function () {
            saveTeamSlot(i, {
              name: (run.knight && run.knight.name ? run.knight.name : 'Team') + ' ×' + teamIds.length,
              knightId: run.knight ? run.knight.id || state.knightId : state.knightId,
              sieglingIds: teamIds
            });
            btn.textContent = '✓ Saved to Slot ' + (i + 1);
            toast('Team saved — start an Endless run from the team-select screen.');
          });
          row.appendChild(btn);
        });
        saver.appendChild(row);
        extras.appendChild(saver);
      }
    }

    setToken(null);
    $('resultBtn').textContent = 'Return to Play';
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
