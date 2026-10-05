/* Match review: the screen a profile's Recent row opens.
 *
 * Three views over GET /api/match-history/{id}/review:
 *   - a Battle Table replay, stepped like a chess move list, when the server
 *     saved per-line frames for the match (MatchReplayRecorder);
 *   - the turn-grouped battle log for matches recorded before replays existed;
 *   - a Siege run: the expedition map with the route taken lit, and a ledger of
 *     every stop (SiegeRunJournal).
 *
 * Self-contained so the hub only has to emit `data-review="<id>"` on a row: a
 * delegated click here opens the overlay above whatever is showing, including
 * a friend's profile sheet. The server decides who may see a match; this only
 * renders what it is given. ES5, like the other hub scripts.
 */
(function () {
  'use strict';

  var EL = {
    FIRE: '#ff501e', EARTH: '#b48c50', WIND: '#96ffb4', WATER: '#3296ff', ICE: '#76e6ff',
    SHADOW: '#7832b4', ELECTRIC: '#ffe63c', METAL: '#a0aab4', UNDEAD: '#8c78a0',
    PSYCHIC: '#c896ff', POISON: '#9b59b6', LIGHT: '#fff5b4', NEUTRAL: '#b8b8c8'
  };
  // One color per stop type. It paints the map node, the timeline dot and the
  // whole stop card, so a run's shape reads at a glance: red fights, purple
  // elites, the boss in fire orange, camps green, shops and caches in their own.
  var NODE = {
    BATTLE: ['#ff5d5d', '⚔', 'Battle'], ELITE: ['#b36bff', '☠', 'Elite'],
    BOSS: ['#ff8a1e', '♛', 'Boss'], REST: ['#6ee07f', '⛺', 'Rest'],
    TREASURE: ['#ffd97a', '✦', 'Cache'], BROKER: ['#63d6d0', '⚖', 'Broker'],
    SMITH: ['#a0aab4', '⚒', 'Smith'], CARAVAN: ['#3296ff', '⇄', 'Caravan'],
    EVENT: ['#f06ec0', '?', 'Event'], RIFT: ['#7c8cff', '◎', 'Rift']
  };
  // Lines worth a star in the move list: the swings a player scrubs back to.
  var KEY_LINE = /defeated|bounty|wins|win!|springs trap|fell in battle|forfeit|evolv|ultimate/i;

  var overlay = null;
  var keyHandler = null;
  var timer = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function color(el) { return EL[String(el || '').toUpperCase()] || EL.NEUTRAL; }
  function title(v) {
    v = String(v || '').toLowerCase();
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  function when(iso) {
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
        d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : '';
  }
  function api() { return window.SiegelingsHomeLive || null; }

  /* ---------- overlay shell ---------- */

  function close() {
    stopPlay();
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    if (overlay) {
      var el = overlay;
      overlay = null;
      el.classList.remove('open');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
  }

  function shell(head, pill) {
    close();
    overlay = document.createElement('div');
    overlay.className = 'mr-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Match review');
    overlay.innerHTML =
      '<header class="mr-top"><button class="mr-back" type="button" data-mr-close aria-label="Close review">‹</button>' +
      '<h3 class="mr-title">' + head + '</h3>' + (pill ? '<span class="mr-pill">' + esc(pill) + '</span>' : '') + '</header>' +
      '<div class="mr-body"></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-mr-close]')) close();
    });
    keyHandler = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', keyHandler);
    // Next frame so the slide-up transition runs.
    requestAnimationFrame(function () { if (overlay) overlay.classList.add('open'); });
    return overlay.querySelector('.mr-body');
  }

  function setHead(head, pill) {
    if (!overlay) return;
    overlay.querySelector('.mr-title').innerHTML = head;
    var p = overlay.querySelector('.mr-pill');
    if (pill && !p) {
      p = document.createElement('span');
      p.className = 'mr-pill';
      overlay.querySelector('.mr-top').appendChild(p);
    }
    if (p) p.textContent = pill || '';
  }

  function open(id) {
    var live = api();
    var body = shell('Match Review', '');
    body.innerHTML = '<div class="mr-state">Loading match…</div>';
    if (!live || !id) {
      body.innerHTML = '<div class="mr-state">Sign in to review matches.</div>';
      return;
    }
    live.get('/api/match-history/' + encodeURIComponent(id) + '/review').then(function (res) {
      if (!overlay || overlay.querySelector('.mr-body') !== body) return; // closed meanwhile
      if (!res || res.error) {
        body.innerHTML = '<div class="mr-state">' + esc((res && res.error) || 'That match could not be loaded.') + '</div>';
        return;
      }
      if (res.kind === 'SIEGE') renderSiege(body, res.run || {});
      else if (res.replay && res.replay.frames && res.replay.frames.length) renderReplay(body, res.match || {}, res.replay);
      else renderLog(body, res.match || {});
    });
  }

  function resultHead(result, sub) {
    var r = String(result || '').toUpperCase();
    var cls = r === 'WIN' ? 'win' : r === 'LOSS' ? 'loss' : '';
    var word = r === 'WIN' ? 'Win' : r === 'LOSS' ? 'Loss' : r === 'DRAW' ? 'Draw' : 'Match';
    return '<span class="mr-result ' + cls + '">' + word + '</span><small>' + sub + '</small>';
  }

  /* ---------- battle replay ---------- */

  function stopPlay() {
    if (timer) { clearInterval(timer); timer = null; }
    var b = overlay && overlay.querySelector('[data-r="play"]');
    if (b) { b.textContent = '▶'; b.setAttribute('aria-label', 'Play'); }
  }

  // A step "acts" when something visible moves: the board, either side's HP or
  // either hand, or the line is a key moment. Narration ("AI Draw phase.", the
  // coin flip, deck announcements) changes nothing, so playback and the step
  // buttons pass over it; it stays in the move list and on the scrubber.
  function buildSteps(replay) {
    var board = [], hands = null, prev = null;
    return replay.frames.map(function (f, n) {
      if (f.b) board = f.b;
      if (f.hd) hands = f.hd;
      var key = KEY_LINE.test(f.m || '');
      var acts = key || (n > 0 && (f.b || f.hd || f.ph !== prev.ph || f.eh !== prev.eh));
      var step = { t: f.t, p: f.p, m: f.m || '', ph: f.ph, eh: f.eh, b: board, hd: hands, key: key, acts: !!acts };
      prev = step;
      return step;
    });
  }

  // Card ids in `now` that were not in `before`, counting copies.
  function added(before, now) {
    var left = {};
    (before || []).forEach(function (id) { left[id] = (left[id] || 0) + 1; });
    var out = {};
    (now || []).forEach(function (id, n) {
      if (left[id]) left[id]--; else out[n] = true;
    });
    return out;
  }

  var TYPE_ICON = { SIEGLING: '◆', SPELL: '✧', TRAP: '✦', TRAINER: '♛' };

  function cellKey(c) { return c.s + c.r + c.c; }

  function renderReplay(body, match, replay) {
    var you = replay.viewerSide === 'e' ? 'e' : 'p';
    var opp = you === 'p' ? 'e' : 'p';
    var cards = replay.cards || {};
    var start = replay.startingHealth || 50;
    var steps = buildSteps(replay);
    var hasHands = steps.some(function (s) { return s.hd; });
    var i = 0;
    function nextAct(from, dir) {
      for (var j = from + dir; j >= 0 && j < steps.length; j += dir) if (steps[j].acts) return j;
      return -1;
    }

    setHead(resultHead(match.result,
      '<b>' + esc(match.loadoutLabel || 'Loadout') + '</b> vs ' + esc(replay.opponentName || match.opponentName || 'Opponent') +
      (match.trainerName ? ' · ' + esc(match.trainerName) : '') +
      (match.turnNumber != null ? ' · T' + esc(match.turnNumber) : '') +
      (match.finishedAt ? ' · ' + esc(when(match.finishedAt)) : '')), title(match.matchType || 'Solo'));

    body.classList.add('is-replay');
    body.innerHTML =
      '<div class="mr-graph" data-r="graph" role="slider" aria-label="HP over the match" tabindex="0">' +
        '<span class="l">You</span><span class="r">Foe</span><svg viewBox="0 0 358 40" preserveAspectRatio="none"></svg></div>' +
      '<div class="mr-arena"></div>' +
      '<div class="mr-caption" aria-live="polite"></div>' +
      '<div class="mr-ctrl">' +
        '<button type="button" data-r="first" aria-label="Previous turn">⏮</button>' +
        '<button type="button" data-r="prev" aria-label="Previous step">◀</button>' +
        '<button type="button" class="play" data-r="play" aria-label="Play">▶</button>' +
        '<button type="button" data-r="next" aria-label="Next step">▶</button>' +
        '<button type="button" data-r="last" aria-label="Next turn">⏭</button>' +
      '</div>' +
      '<div class="mr-scrub"><input type="range" min="0" max="' + (steps.length - 1) + '" value="0" aria-label="Step"></div>' +
      '<div class="mr-moves"></div>';

    var arena = body.querySelector('.mr-arena');
    var cap = body.querySelector('.mr-caption');
    var moves = body.querySelector('.mr-moves');
    var scrub = body.querySelector('.mr-scrub input');
    var svg = body.querySelector('.mr-graph svg');
    var yourHp = function (s) { return you === 'p' ? s.ph : s.eh; };
    var oppHp = function (s) { return you === 'p' ? s.eh : s.ph; };

    // Move list grouped by turn, like a PGN pane.
    var html = '', lastTurn = null;
    steps.forEach(function (s, n) {
      if (s.t !== lastTurn) {
        if (lastTurn !== null) html += '</div>';
        html += '<div class="mr-turn"><b>Turn ' + esc(s.t) + '</b>';
        lastTurn = s.t;
      }
      html += '<button type="button" class="mr-mv' + (s.key ? ' key' : '') + (s.acts ? '' : ' info') + '" data-i="' + n + '">' +
        '<span class="ph">' + esc(String(s.p || '').slice(0, 6)) + '</span><span>' + esc(s.m) + '</span></button>';
    });
    moves.innerHTML = html + (lastTurn !== null ? '</div>' : '');

    // HP swing graph: both totals across every step, like an eval graph.
    (function () {
      var W = 358, H = 40, n = Math.max(1, steps.length - 1);
      var top = Math.max(start, steps.reduce(function (m, s) { return Math.max(m, s.ph || 0, s.eh || 0); }, 0));
      function pts(fn) {
        return steps.map(function (s, j) {
          return (j / n * W).toFixed(1) + ',' + (H - 5 - Math.max(0, fn(s)) / top * (H - 12)).toFixed(1);
        }).join(' ');
      }
      svg.innerHTML =
        '<polyline points="' + pts(yourHp) + '" fill="none" stroke="#6ee07f" stroke-width="2"/>' +
        '<polyline points="' + pts(oppHp) + '" fill="none" stroke="#ff7d6b" stroke-width="2"/>' +
        steps.map(function (s, j) { return s.key ? '<circle cx="' + (j / n * W) + '" cy="37" r="2" fill="#ffd97a"/>' : ''; }).join('') +
        '<line class="cur" x1="0" x2="0" y1="0" y2="' + H + '" stroke="#ffd97a" stroke-width="1.5" stroke-dasharray="3 2"/>';
    })();

    function diff(step, prev) {
      var before = {};
      (prev ? prev.b : []).forEach(function (c) { before[cellKey(c)] = c; });
      var out = {};
      step.b.forEach(function (c) {
        var k = cellKey(c), was = before[k];
        if (!prev) return;
        if (!was || was.id !== c.id) out[k] = { placed: true };
        else if (c.hp < was.hp) out[k] = { dmg: was.hp - c.hp };
        else if (c.hp > was.hp) out[k] = { heal: c.hp - was.hp };
      });
      return out;
    }

    // The acting card: the board card whose name opens the log line.
    function actorOf(step) {
      var best = null, len = 0;
      step.b.forEach(function (c) {
        var info = cards[c.id] || {};
        var name = info.name || '';
        if (name && step.m.indexOf(name) === 0 && name.length > len) { best = c; len = name.length; }
      });
      return best;
    }

    // Notch slot on the card's perimeter, as fractions of the cell. Directions
    // read the same on screen for both sides: the server flips the row delta for
    // the player so TOP always points up the table (EnergyService.getBoardRowDelta).
    var NOTCH = {
      TOP: [0, -1], TOP_RIGHT: [1, -1], RIGHT: [1, 0], BOTTOM_RIGHT: [1, 1],
      BOTTOM: [0, 1], BOTTOM_LEFT: [-1, 1], LEFT: [-1, 0], TOP_LEFT: [-1, -1]
    };
    function notchesOf(id) {
      return ((cards[id] || {}).notches || []).map(function (n) {
        var parts = String(n).split(':');
        return { d: parts[0], el: parts[1] || 'NEUTRAL', v: NOTCH[parts[0]] };
      }).filter(function (n) { return n.v; });
    }
    function screenRow(side, r) { return side === you ? 2 - r : r; }

    function cardInner(c) {
      var info = cards[c.id] || { name: c.id, element: 'NEUTRAL' };
      return '<div class="mr-card' + (info.rarity === 'LEGENDARY' ? ' leg' : '') + '" style="--el:' + color(info.element) + '">' +
        (info.art ? '<img src="' + esc(info.art) + '" alt="" decoding="async">' : '') +
        '<span class="nm">' + esc(info.name) + '</span>' +
        '<span class="st"><i class="hp"><b>♥</b><span></span></i>' +
          (info.speed != null ? '<i class="sp"><b>⚡</b>' + esc(info.speed) + '</i>' : '') + '</span>' +
        '<span class="bar"><i></i></span></div>' +
        notchesOf(c.id).map(function (n) {
          return '<span class="mr-notch" style="left:' + (50 + n.v[0] * 50) + '%;top:' + (50 + n.v[1] * 50) +
            '%;--nc:' + color(n.el) + '"></span>';
        }).join('');
    }

    // Restarts a one-shot CSS animation on an element that stays in the DOM.
    function flash(el, cls, on) {
      el.classList.remove(cls);
      if (on) { void el.offsetWidth; el.classList.add(cls); }
    }

    // Cells are built once and patched per step: a card that stays put keeps
    // its node (and its art), so only its numbers move. Rebuilding the arena
    // every step re-decoded every image and made the art blink.
    function paintGrid(side, step, changes, actor) {
      var bySpot = {};
      step.b.forEach(function (c) { if (c.s === side) bySpot[c.r + ',' + c.c] = c; });
      for (var r = 0; r < 3; r++) {
        for (var col = 0; col < 3; col++) {
          var k = side + r + col;
          var cell = arena.querySelector('[data-cell="' + k + '"]');
          var c = bySpot[r + ',' + col];
          var ch = changes[k] || {};
          var want = c ? c.id : '';
          if (cell.getAttribute('data-card') !== want) {
            cell.innerHTML = c ? cardInner(c) : '';
            cell.setAttribute('data-card', want);
          }
          var old = cell.querySelectorAll('.mr-chip');
          for (var o = 0; o < old.length; o++) old[o].parentNode.removeChild(old[o]);
          cell.classList.toggle('actor', !!(actor && cellKey(actor) === k));
          cell.classList.toggle('hit', !!ch.dmg);
          flash(cell, 'placed', !!ch.placed);
          if (!c) continue;
          var card = cell.querySelector('.mr-card');
          var max = c.mx || c.hp || 1;
          var pct = Math.max(0, Math.min(100, Math.round(c.hp / max * 100)));
          card.classList.toggle('dead', !!(c.dead || c.hp <= 0));
          card.classList.toggle('low', pct <= 40);
          if (ch.dmg) flash(card, 'shake', true);
          cell.querySelector('.hp span').textContent = c.hp;
          cell.querySelector('.bar i').style.width = pct + '%';
          if (ch.dmg || ch.heal) {
            cell.insertAdjacentHTML('beforeend', ch.dmg
              ? '<span class="mr-chip dmg">−' + ch.dmg + '</span>'
              : '<span class="mr-chip heal">+' + ch.heal + '</span>');
          }
        }
      }
    }

    function gridShell(side) {
      var out = '';
      for (var sr = 0; sr < 3; sr++) {
        var r = screenRow(side, sr);
        for (var col = 0; col < 3; col++) out += '<div class="mr-cell" data-cell="' + side + r + col + '" data-card=""></div>';
      }
      return '<div class="mr-grid">' + out + '</div>';
    }

    // Reciprocal links: two live neighbours whose notches point at each other,
    // the same test EnergyService runs. Each half of the bridge takes its own
    // notch's element color so a mixed link reads as mixed.
    function drawLinks(step) {
      var svgL = arena.querySelector('.mr-links');
      var box = arena.getBoundingClientRect();
      var out = '';
      [opp, you].forEach(function (side) {
        var at = {};
        step.b.forEach(function (c) {
          if (c.s === side && !(c.dead || c.hp <= 0)) at[screenRow(side, c.r) + ',' + c.c] = c;
        });
        Object.keys(at).forEach(function (pos) {
          var a = at[pos], ar = screenRow(side, a.r);
          notchesOf(a.id).forEach(function (n) {
            var br = ar + n.v[1], bc = a.c + n.v[0];
            var b = at[br + ',' + bc];
            // Each pair once: only walk links that point right, down or down-left.
            if (!b || n.v[1] < 0 || (n.v[1] === 0 && n.v[0] < 0)) return;
            var m = null;
            notchesOf(b.id).forEach(function (bn) { if (bn.v[0] === -n.v[0] && bn.v[1] === -n.v[1]) m = bn; });
            if (!m) return;
            var ea = arena.querySelector('[data-cell="' + cellKey(a) + '"]');
            var eb = arena.querySelector('[data-cell="' + cellKey(b) + '"]');
            if (!ea || !eb) return;
            var ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
            var x1 = ra.left - box.left + ra.width * (0.5 + n.v[0] / 2);
            var y1 = ra.top - box.top + ra.height * (0.5 + n.v[1] / 2);
            var x2 = rb.left - box.left + rb.width * (0.5 + m.v[0] / 2);
            var y2 = rb.top - box.top + rb.height * (0.5 + m.v[1] / 2);
            // The notches sit a grid gap apart; reach into each card so the
            // bridge reads as a connection rather than a speck.
            var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
            var reach = ra.width * 0.07;
            x1 -= dx / len * reach; y1 -= dy / len * reach;
            x2 += dx / len * reach; y2 += dy / len * reach;
            var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            var ca = color(n.el), cb = color(m.el);
            out += '<g class="ln">' +
              '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="rgba(8,6,28,.85)" stroke-width="6" stroke-linecap="round"/>' +
              '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + mx + '" y2="' + my + '" stroke="' + ca + '" stroke-width="3" stroke-linecap="round"/>' +
              '<line x1="' + mx + '" y1="' + my + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + cb + '" stroke-width="3" stroke-linecap="round"/>' +
              '<circle cx="' + x1 + '" cy="' + y1 + '" r="2.6" fill="' + ca + '"/>' +
              '<circle cx="' + x2 + '" cy="' + y2 + '" r="2.6" fill="' + cb + '"/></g>';
          });
        });
      });
      svgL.innerHTML = out;
    }

    function hpHead(label, name, v, prevV, isOpp) {
      var d = prevV == null ? 0 : v - prevV;
      return '<div class="mr-side' + (isOpp ? ' opp' : '') + '"><b>' + esc(name) + '</b>' + (label ? ' ' + label : '') +
        '<span class="mr-hp"><em>' + (d < 0 ? d : '') + '</em><span class="bar"><i style="width:' +
        Math.max(0, Math.min(100, v / start * 100)) + '%"></i></span>' + esc(v) + '</span></div>';
    }

    function drawArrow(actor, changes) {
      var svgA = arena.querySelector('.mr-arrows');
      if (svgA) svgA.innerHTML = '';
      if (!svgA || !actor) return;
      var targetKey = null;
      Object.keys(changes).forEach(function (k) { if (!targetKey && changes[k].dmg && k !== cellKey(actor)) targetKey = k; });
      if (!targetKey) return;
      var a = arena.querySelector('[data-cell="' + cellKey(actor) + '"]');
      var b = arena.querySelector('[data-cell="' + targetKey + '"]');
      if (!a || !b) return;
      var box = arena.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var col = actor.s === you ? '#ffd97a' : '#ff7d6b';
      svgA.innerHTML = '<defs><marker id="mrah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">' +
        '<path d="M0,0 L8,4 L0,8 z" fill="' + col + '"/></marker></defs>' +
        '<line x1="' + (ra.left - box.left + ra.width / 2) + '" y1="' + (ra.top - box.top + ra.height / 2) +
        '" x2="' + (rb.left - box.left + rb.width / 2) + '" y2="' + (rb.top - box.top + rb.height / 2) +
        '" stroke="' + col + '" stroke-width="3" stroke-linecap="round" opacity=".85" marker-end="url(#mrah)"/>';
    }

    // One side's hand as a strip of small cards; cards new since the last step
    // are lit, so a draw reads as a draw.
    function handRow(side, step, prev) {
      if (!hasHands) return '';
      var ids = (step.hd && step.hd[side]) || [];
      var fresh = prev ? added(prev.hd && prev.hd[side], ids) : {};
      return '<div class="mr-hand' + (side === you ? ' mine' : ' theirs') + '" aria-label="' +
        (side === you ? 'Your' : 'Opponent') + ' hand, ' + ids.length + ' cards">' +
        '<span class="mr-hand-n">✋' + ids.length + '</span>' +
        (ids.length ? ids.map(function (id, n) {
          var info = cards[id] || { name: id, element: 'NEUTRAL' };
          return '<span class="mr-hc' + (fresh[n] ? ' new' : '') + '" style="--el:' + color(info.element) + '" title="' + esc(info.name) + '">' +
            '<i>' + (TYPE_ICON[info.type] || '◆') + '</i>' + esc(info.name) + '</span>';
        }).join('') : '<span class="mr-hand-empty">Empty</span>') +
        '</div>';
    }

    arena.innerHTML =
      '<div class="mr-hand-slot" data-a="hand-' + opp + '"></div>' +
      '<div data-a="head-' + opp + '"></div>' +
      gridShell(opp) +
      '<div class="mr-divider"></div>' +
      gridShell(you) +
      '<div data-a="head-' + you + '"></div>' +
      '<div class="mr-hand-slot" data-a="hand-' + you + '"></div>' +
      '<svg class="mr-links" aria-hidden="true"></svg>' +
      '<svg class="mr-arrows" aria-hidden="true"></svg>';
    function slot(name, html) {
      var el = arena.querySelector('[data-a="' + name + '"]');
      if (el.innerHTML !== html) el.innerHTML = html;
    }

    function render() {
      var step = steps[i], prev = i > 0 ? steps[i - 1] : null;
      var changes = diff(step, prev);
      var actor = actorOf(step);
      slot('hand-' + opp, handRow(opp, step, prev));
      slot('head-' + opp, hpHead('', replay.opponentName || match.opponentName || 'Opponent', oppHp(step), prev ? oppHp(prev) : null, true));
      slot('head-' + you, hpHead('', 'You', yourHp(step), prev ? yourHp(prev) : null, false));
      slot('hand-' + you, handRow(you, step, prev));
      arena.querySelector('.mr-divider').textContent = 'Turn ' + step.t + ' · ' + title(step.p);
      paintGrid(opp, step, changes, actor);
      paintGrid(you, step, changes, actor);
      cap.innerHTML = '<small>Step ' + (i + 1) + ' of ' + steps.length + '</small>' + esc(step.m);
      scrub.value = i;
      var x = (i / Math.max(1, steps.length - 1) * 358).toFixed(1);
      var cur = svg.querySelector('.cur');
      cur.setAttribute('x1', x); cur.setAttribute('x2', x);
      var prevOn = moves.querySelector('.mr-mv.on');
      if (prevOn) prevOn.classList.remove('on');
      var on = moves.querySelector('.mr-mv[data-i="' + i + '"]');
      if (on) {
        on.classList.add('on');
        moves.scrollTop = on.offsetTop - moves.clientHeight / 2;
      }
      body.querySelector('[data-r="prev"]').disabled = nextAct(i, -1) < 0;
      body.querySelector('[data-r="next"]').disabled = nextAct(i, 1) < 0;
      drawLinks(step);
      drawArrow(actor, changes);
    }

    function go(n) { i = Math.max(0, Math.min(steps.length - 1, n)); render(); }
    function stepBy(dir) { var j = nextAct(i, dir); if (j >= 0) go(j); }
    var firstAct = steps.length && steps[0].acts ? 0 : Math.max(0, nextAct(0, 1));
    function turnJump(dir) {
      var t = steps[i].t, j = i;
      if (dir < 0) {
        while (j > 0 && steps[j - 1].t === t) j--;
        if (j === i && j > 0) { t = steps[j - 1].t; j--; while (j > 0 && steps[j - 1].t === t) j--; }
      } else {
        while (j < steps.length - 1 && steps[j].t === t) j++;
      }
      // Land on the turn's first action rather than its phase announcement.
      if (!steps[j].acts) {
        var k = nextAct(j, 1);
        if (k >= 0 && steps[k].t === steps[j].t) j = k;
      }
      go(j);
    }

    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-r]');
      if (b) {
        var r = b.getAttribute('data-r');
        if (r === 'graph') {
          var g = b.getBoundingClientRect();
          stopPlay(); go(Math.round((e.clientX - g.left) / g.width * (steps.length - 1)));
          return;
        }
        if (r !== 'play') stopPlay();
        if (r === 'prev') stepBy(-1);
        if (r === 'next') stepBy(1);
        if (r === 'first') turnJump(-1);
        if (r === 'last') turnJump(1);
        if (r === 'play') {
          if (timer) { stopPlay(); return; }
          if (nextAct(i, 1) < 0) go(firstAct);
          b.textContent = '❚❚';
          b.setAttribute('aria-label', 'Pause');
          timer = setInterval(function () { var j = nextAct(i, 1); if (j < 0) stopPlay(); else go(j); }, 1000);
        }
        return;
      }
      var mv = e.target.closest('.mr-mv');
      if (mv) { stopPlay(); go(+mv.getAttribute('data-i')); }
    });
    scrub.addEventListener('input', function () { stopPlay(); go(+scrub.value); });
    var prevKey = keyHandler;
    keyHandler = function (e) {
      if (e.key === 'ArrowLeft') { stopPlay(); stepBy(-1); }
      else if (e.key === 'ArrowRight') { stopPlay(); stepBy(1); }
      else if (prevKey) prevKey(e);
    };
    document.removeEventListener('keydown', prevKey);
    document.addEventListener('keydown', keyHandler);
    // The overlays are positioned in pixels, so a rotate or resize redraws them.
    var onResize = function () {
      if (!overlay || !arena.isConnected) { window.removeEventListener('resize', onResize); return; }
      var step = steps[i];
      drawLinks(step);
      drawArrow(actorOf(step), diff(step, i > 0 ? steps[i - 1] : null));
    };
    window.addEventListener('resize', onResize);
    // Open on the first thing that happens, not on the opening narration.
    go(firstAct);
  }

  /* ---------- log-only review ---------- */

  function renderLog(body, match) {
    setHead(resultHead(match.result,
      '<b>' + esc(match.loadoutLabel || 'Loadout') + '</b> vs ' + esc(match.opponentName || 'Opponent') +
      (match.trainerName ? ' · ' + esc(match.trainerName) : '') +
      (match.finishedAt ? ' · ' + esc(when(match.finishedAt)) : '')), title(match.matchType || 'Solo'));

    var turns = [], cur = null;
    (match.gameLog || []).forEach(function (line) {
      var m = /^\[Turn (\d+) ([A-Z_]+)\]\s*(.*)$/.exec(String(line));
      var t = m ? m[1] : (cur ? cur.t : '?');
      if (!cur || cur.t !== t) { cur = { t: t, lines: [] }; turns.push(cur); }
      cur.lines.push({ p: m ? m[2] : '', m: m ? m[3] : String(line) });
    });

    function stat(label, v) { return '<div><span>' + esc(label) + '</span><b>' + esc(v == null ? '—' : v) + '</b></div>'; }
    body.innerHTML =
      '<div class="mr-scroll">' +
        '<div class="mr-banner"><b>Board replay unavailable.</b> This match was recorded before replays were saved — here is its battle log, grouped by turn.</div>' +
        '<div class="mr-stats">' +
          stat('Your HP', match.playerHealthRemaining) + stat('Foe HP', match.opponentHealthRemaining) + stat('Turns', match.turnNumber) +
          stat('Strategies', match.spellsCast) + stat('Deceptions', match.trapsSprung) + stat('Defeated', match.siegelingsDefeated) +
        '</div>' +
        (turns.length
          ? '<div class="mr-acc">' + turns.map(function (t, n) {
              var keyCount = t.lines.filter(function (l) { return KEY_LINE.test(l.m); }).length;
              return '<details' + (n === turns.length - 1 ? ' open' : '') + '><summary><b>Turn ' + esc(t.t) + '</b><em>' +
                t.lines.length + ' line' + (t.lines.length === 1 ? '' : 's') + (keyCount ? ' · ' + keyCount + ' ★' : '') +
                '</em><i>›</i></summary><div class="lines">' + t.lines.map(function (l) {
                  return '<div class="ln' + (KEY_LINE.test(l.m) ? ' k' : '') + '"><span class="ph">' + esc(l.p.slice(0, 6)) + '</span><span>' + esc(l.m) + '</span></div>';
                }).join('') + '</div></details>';
            }).join('') + '</div>'
          : '<div class="mr-state">No turn-by-turn log was recorded for this match.</div>') +
      '</div>';
  }

  /* ---------- Siege run ---------- */

  function stopLabel(stop) {
    var events = stop.events || [];
    for (var k = 0; k < events.length; k++) {
      var e = events[k];
      if (e.k === 'battle') {
        var lead = (e.foes && e.foes[0] && e.foes[0].name) || 'the foe';
        var more = e.foes && e.foes.length > 1 ? ' +' + (e.foes.length - 1) : '';
        return (e.result === 'WIN' ? 'Beat ' : 'Fell to ') + lead + more;
      }
    }
    for (k = 0; k < events.length; k++) {
      if (events[k].pick && events[k].pick.title) return events[k].pick.title;
    }
    var type = (NODE[stop.type] || [])[2] || 'Stop';
    if (stop.type === 'REST') return 'Passed the fire';
    // A puzzle or event retitles its stop ("The Wager"); generic node labels
    // ("Broker", "Rift") add nothing over the icon, so say what happened.
    var outcome = null;
    for (k = 0; k < events.length; k++) { if (events[k].outcome) outcome = events[k].outcome; }
    if (stop.title && stop.title !== type && !/^(Broker|Rift|Rest Camp|Buried Cache|Smith|Caravan)$/.test(stop.title)) return stop.title;
    if (stop.type === 'BROKER' && !events.length) return 'Browsed the broker';
    if (outcome && outcome.length <= 28) return outcome;
    return type;
  }

  function gl(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + 'g'; }

  function mini(u, fell) {
    var max = u.maxHp || u.hp || 1;
    var pct = Math.max(0, Math.min(100, Math.round((u.hp || 0) / max * 100)));
    return '<span class="mr-mini' + (fell ? ' dead' : '') + '" style="--el:' + color(u.element) + '">' +
      '<b>' + esc(u.name) + '</b><span class="bar"><i style="width:' + pct + '%"></i></span>' +
      '<small>' + (fell ? 'Defeated' : esc(u.hp) + '/' + esc(max) + ' HP') + '</small></span>';
  }

  function stopBody(stop) {
    var h = '';
    (stop.events || []).forEach(function (e) {
      if (e.k === 'battle') {
        h += '<div class="mr-sub">Enemy warband</div><div class="mr-foes">' +
          (e.foes || []).map(function (f) { return mini(f, (f.hp || 0) <= 0); }).join('') + '</div>' +
          '<div class="mr-sub">Your warband</div><div class="mr-foes you">' +
          (e.allies || []).map(function (a) { return mini(a, (a.hp || 0) <= 0); }).join('') + '</div>' +
          '<div class="mr-chips"><span class="' + (e.result === 'WIN' ? 'w' : 'r') + '">' +
          (e.result === 'WIN' ? 'Victory' : 'Defeat') + (e.rounds ? ' · R' + esc(e.rounds) : '') + '</span></div>';
      } else if (e.k === 'reward') {
        h += '<div class="mr-sub">Spoils</div><div class="mr-picks">' +
          (e.skipped ? '<span class="pick on">Pressed on without spoils</span>' : '') +
          (e.offers || []).map(function (o) {
            return '<span class="pick' + (o.taken ? ' on' : '') + '" style="--el:' + color(o.element) + '">' +
              (o.taken ? '✓ ' : '') + esc(o.title) + '</span>';
          }).join('') + '</div>';
      } else if (e.k === 'event') {
        h += '<div class="mr-choices">' + (e.choices || []).map(function (c) {
          var on = e.pick && e.pick.title === c;
          return '<div class="mr-choice' + (on ? ' on' : '') + '">' + (on ? '✓ ' : '') + esc(c) + '</div>';
        }).join('') + '</div>' + (e.outcome ? '<p class="mr-out">' + esc(e.outcome) + '</p>' : '');
      } else if (e.k === 'choice' && e.pick) {
        var p = e.pick;
        h += '<div class="mr-ledger-row"><span class="tag">' + esc(verb(p.kind)) + '</span><span class="what"><b>' + esc(p.title) +
          '</b>' + (p.desc ? '<small>' + esc(p.desc) + '</small>' : '') + '</span>' +
          (p.cost ? '<span class="amt neg">' + gl(-p.cost) + '</span>' : '') + '</div>' +
          (e.outcome ? '<p class="mr-out">' + esc(e.outcome) + '</p>' : '');
      } else if (e.outcome) {
        h += '<p class="mr-out">' + esc(e.outcome) + '</p>';
      }
    });
    var passed = (stop.offers || []).filter(function (o) { return !o.taken; });
    if (passed.length) {
      h += '<div class="mr-sub">Passed on</div><div class="mr-picks">' + passed.map(function (o) {
        return '<span class="pick">' + esc(o.title) + (o.cost ? ' · ' + esc(o.cost) + 'g' : '') + '</span>';
      }).join('') + '</div>';
    }
    // Health that moved without a fight (rests, stew, event damage).
    var hasBattle = (stop.events || []).some(function (e) { return e.k === 'battle'; });
    if (!hasBattle && stop.partyBefore && stop.partyAfter) {
      var before = {};
      stop.partyBefore.forEach(function (u) { before[u.name] = u; });
      var rows = stop.partyAfter.filter(function (u) { return before[u.name] && before[u.name].hp !== u.hp; });
      if (rows.length) {
        h += '<div class="mr-hprows">' + rows.map(function (u) {
          var b = before[u.name].hp || 0, a = u.hp || 0, max = u.maxHp || Math.max(a, b, 1);
          var lo = Math.min(a, b), hi = Math.max(a, b);
          return '<div class="mr-hpr"><span class="nm" style="color:' + color(u.element) + '">' + esc(u.name) + '</span>' +
            '<span class="track"><i class="was" style="width:' + (lo / max * 100) + '%"></i><i class="' + (a >= b ? 'up' : 'down') +
            '" style="left:' + (lo / max * 100) + '%;width:' + ((hi - lo) / max * 100) + '%"></i></span>' +
            '<span class="v">' + esc(b) + ' → ' + esc(a) + '</span></div>';
        }).join('') + '</div>';
      }
    }
    return h;
  }

  function verb(kind) {
    kind = String(kind || '');
    if (kind === 'REST') return 'Rested';
    if (kind === 'MERC') return 'Hired';
    if (kind === 'BROKER') return 'Recruited';
    if (/UPGRADE|CHISEL|SMITH/.test(kind)) return 'Upgraded';
    if (/REVIVE/.test(kind)) return 'Revived';
    if (/^SHOP|ITEM|CARD|HEAL/.test(kind)) return 'Bought';
    return 'Chose';
  }

  function num(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // One color per kind of point, shared by the score panel, its bar and the
  // per-stop chips, so a stop's chips read against the run's breakdown.
  var SCORE_KIND = {
    route:      { label: 'Route',       chip: 'Route',   color: '#54a8f0' },
    battles:    { label: 'Battles',     chip: 'Battle',  color: '#ff7a5c' },
    mastery:    { label: 'Mastery',     chip: 'Mastery', color: '#b48cff' },
    fallen:     { label: 'Fallen',      chip: 'Fallen',  color: '#ff5d73' },
    revived:    { label: 'Revived',     chip: 'Revived', color: '#4fd07a' },
    goldEarned: { label: 'Gold earned', chip: 'Gold',    color: '#ffd97a' },
    goldSpent:  { label: 'Gold spent',  chip: 'Spent',   color: '#e8a33a' },
    victory:    { label: 'Victory',     chip: 'Victory', color: '#3fd8d1' },
    carried:    { label: 'Earlier',     chip: 'Earlier', color: '#a4a3d6' }
  };
  var SCORE_ORDER = ['route', 'battles', 'mastery', 'fallen', 'revived', 'goldEarned', 'goldSpent', 'victory', 'carried'];
  function kind(key) { return SCORE_KIND[key] || { label: key, chip: key, color: '#a4a3d6' }; }

  // Mirrors SiegeScore on the server. Used only for runs recorded before stops
  // carried their own points: the journal already holds every input (stop types,
  // battles with rounds and survivors, purse and warband before/after), so the
  // run can be re-scored with today's rules and shown as an estimate.
  var ROUTE_PTS = { BOSS: 60, ELITE: 40, EVENT: 20, RIFT: 20, BATTLE: 15, TREASURE: 10, BROKER: 10, SMITH: 10, CARAVAN: 10, REST: 5 };
  function estimateStops(run) {
    var stops = run.stops || [], bosses = 0, spentTotal = 0;
    var per = stops.map(function (s, idx) {
      var pts = {};
      function add(k, v) { if (v) pts[k] = (pts[k] || 0) + v; }
      add('route', ROUTE_PTS[s.type] || 0);
      (s.events || []).forEach(function (e) {
        if (e.k !== 'battle' || e.result !== 'WIN') return;
        var foes = (e.foes || []).length, depth = Number(s.floor) || 1, rounds = Math.max(1, Number(e.rounds) || 1);
        var p = foes * (10 + depth) + 5;
        if (s.type === 'BOSS') { bosses++; p += 100 + 50 * bosses; }
        add('battles', p);
        var flawless = !(e.allies || []).some(function (a) { return !a.knight && Number(a.hp) <= 0; });
        add('mastery', Math.max(0, 6 - rounds) * 10 + (flawless ? 25 : 0));
      });
      var before = {};
      (s.partyBefore || []).forEach(function (u) { if (!u.knight) before[u.name] = Number(u.hp) || 0; });
      (s.partyAfter || []).forEach(function (u) {
        if (u.knight || before[u.name] == null) return;
        var hp = Number(u.hp) || 0;
        if (before[u.name] > 0 && hp <= 0) add('fallen', -40);
        if (before[u.name] <= 0 && hp > 0) add('revived', 20);
      });
      if (s.goldAfter != null && s.goldBefore != null) {
        var d = s.goldAfter - s.goldBefore;
        if (d > 0) add('goldEarned', d);
        if (d < 0) {
          // Half of all gold spent, rounded once across the run as the server does.
          var was = Math.floor(spentTotal / 2);
          spentTotal -= d;
          add('goldSpent', Math.floor(spentTotal / 2) - was);
        }
      }
      if (idx === stops.length - 1 && String(run.result || '').toUpperCase() === 'WIN') add('victory', 500);
      return pts;
    });
    return per;
  }

  // Per-stop points: recorded on the stop when the run had them, else estimated.
  function stopPoints(run) {
    var stops = run.stops || [];
    var recorded = stops.length && stops.every(function (s) { return s.score && typeof s.score === 'object'; });
    return { per: recorded ? stops.map(function (s) { return s.score; }) : estimateStops(run), estimated: !recorded };
  }

  function sumLines(per) {
    var totals = {};
    per.forEach(function (pts) { Object.keys(pts || {}).forEach(function (k) { totals[k] = (totals[k] || 0) + Number(pts[k] || 0); }); });
    return SCORE_ORDER.filter(function (k) { return totals[k]; }).map(function (k) {
      return { key: k, label: kind(k).label, detail: '', points: totals[k] };
    });
  }

  // Positive lines as one stacked bar, so where the score came from is visible
  // before the panel is opened.
  function scoreBar(lines) {
    var pos = lines.filter(function (l) { return Number(l.points) > 0; });
    var sum = pos.reduce(function (n, l) { return n + Number(l.points); }, 0);
    if (!sum) return '';
    return '<div class="mr-score-bar" aria-hidden="true">' + pos.map(function (l) {
      return '<i style="flex:' + Number(l.points) + ';background:' + kind(l.key).color + '"></i>';
    }).join('') + '</div>';
  }

  function scorePanel(run, pts) {
    var b = run.scoreBreakdown;
    var total = b ? b.total : run.score;
    if (total == null && !pts.per.length) return '';
    var lines = (b && b.lines) ? b.lines.filter(function (l) { return Number(l.points); }) : sumLines(pts.per);
    var estTotal = lines.reduce(function (n, l) { return n + Number(l.points || 0); }, 0);
    var head = '<span>Run score</span><b>' + num(total != null ? total : estTotal) + '</b>';
    if (!lines.length) return '<div class="mr-score"><div class="mr-score-head">' + head + '</div></div>';
    return '<details class="mr-score"><summary><div class="mr-score-head">' + head + '<i aria-hidden="true">›</i></div>' +
      scoreBar(lines) +
      '<div class="mr-score-legend">' + lines.filter(function (l) { return Number(l.points) > 0; }).map(function (l) {
        return '<em style="--k:' + kind(l.key).color + '">' + esc(kind(l.key).chip) + '</em>';
      }).join('') + '</div></summary>' +
      '<div class="mr-score-lines">' + lines.map(function (l) {
        var p = Number(l.points) || 0;
        return '<div style="--k:' + kind(l.key).color + '"><span>' + esc(l.label || kind(l.key).label) +
          (l.detail ? '<small>' + esc(l.detail) + '</small>' : '') +
          '</span><b>' + (p > 0 ? '+' : p < 0 ? '−' : '') + num(Math.abs(p)) + '</b></div>';
      }).join('') +
      (b && b.multiplier > 1 ? '<p>Battlegrounds ×' + (Math.round(b.multiplier * 100) / 100) + ' on ' + num(b.base) + '</p>' : '') +
      (pts.estimated
        ? '<p>Recorded before scores were itemized, so each stop is re-scored with today’s rules (≈ ' + num(estTotal) +
          ')' + (total != null ? '; the ' + num(total) + ' above is the score this run banked.' : '.') + '</p>'
        : '') +
      '</div></details>';
  }

  // A stop's points as colored chips plus its total.
  function stopChips(pts, estimated) {
    var keys = SCORE_ORDER.filter(function (k) { return pts && Number(pts[k]); });
    if (!keys.length) return '';
    var sum = keys.reduce(function (n, k) { return n + Number(pts[k]); }, 0);
    return '<div class="mr-pts">' + keys.map(function (k) {
      var v = Number(pts[k]);
      return '<span style="--k:' + kind(k).color + '">' + esc(kind(k).chip) + ' ' + (v > 0 ? '+' : '−') + num(Math.abs(v)) + '</span>';
    }).join('') + '<b class="' + (sum < 0 ? 'neg' : '') + '">' + (estimated ? '≈ ' : '') + (sum >= 0 ? '+' : '−') + num(Math.abs(sum)) + ' pts</b></div>';
  }

  function renderSiege(body, run) {
    var stops = run.stops || [];
    // Only the floors the warband reached, plus one row of the road ahead: a
    // 24-floor map whose upper half was never seen is noise above the route.
    var reachedRow = 0;
    var rowOf = {};
    (run.map || []).forEach(function (n) { rowOf[n.id] = n.row; });
    stops.forEach(function (s) { if (rowOf[s.nodeId] != null) reachedRow = Math.max(reachedRow, rowOf[s.nodeId]); });
    var map = (run.map || []).filter(function (n) { return n.row <= reachedRow + 1; });
    var won = String(run.result || '').toUpperCase() === 'WIN';
    setHead(resultHead(run.result,
      '<b>' + esc(run.knightName || 'SiegeKnight') + '</b> · Floor ' + esc(run.floorReached || '?') +
      (run.floorTotal ? ' of ' + esc(run.floorTotal) : '') + (run.finishedAt ? ' · ' + esc(when(run.finishedAt)) : '')),
      title(run.mode === 'STANDARD' || !run.mode ? 'Siege' : run.mode));

    var battles = 0, wins = 0, spent = 0;
    stops.forEach(function (s) {
      (s.events || []).forEach(function (e) {
        if (e.k === 'battle') { battles++; if (e.result === 'WIN') wins++; }
      });
      var d = (s.goldAfter || 0) - (s.goldBefore || 0);
      if (d < 0) spent -= d;
    });

    // Map geometry: rows bottom to top, columns spread across the width.
    var rows = map.reduce(function (m, n) { return Math.max(m, n.row); }, 0) + 1;
    var cols = map.reduce(function (m, n) { return Math.max(m, n.col); }, 0) + 1;
    var W = 358, stepY = 48, padY = 26, H = padY * 2 + Math.max(0, rows - 1) * stepY;
    var byId = {};
    map.forEach(function (n) { byId[n.id] = n; });
    function pos(n) {
      return { x: 34 + (cols <= 1 ? 0.5 : n.col / (cols - 1)) * (W - 68), y: H - padY - n.row * stepY };
    }
    var path = stops.map(function (s) { return s.nodeId; });
    var onPath = {};
    path.forEach(function (id) { onPath[id] = true; });
    var litEdge = {};
    for (var k = 0; k < path.length - 1; k++) litEdge[path[k] + '>' + path[k + 1]] = true;

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    map.forEach(function (n) {
      (n.next || []).forEach(function (m) {
        var to = byId[m];
        if (!to) return;
        var a = pos(n), b = pos(to), lit = litEdge[n.id + '>' + m];
        svg += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' +
          (lit ? '#ffd97a' : 'rgba(164,163,214,.22)') + '" stroke-width="' + (lit ? 3.5 : 1.5) + '"' +
          (lit ? '' : ' stroke-dasharray="4 5"') + ' stroke-linecap="round"/>';
      });
    });
    var labels = '';
    map.forEach(function (n) {
      var p = pos(n), ty = NODE[n.type] || NODE.BATTLE, visited = onPath[n.id], r = n.type === 'BOSS' ? 17 : 13;
      var stopIdx = path.lastIndexOf(n.id);
      svg += '<g class="mr-node" ' + (visited ? 'data-stop="' + stopIdx + '" ' : '') + 'opacity="' + (visited ? 1 : 0.3) + '">' +
        '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '" fill="' + (visited ? ty[0] : '#241c5c') +
        '" stroke="' + ty[0] + '" stroke-width="2"/>' +
        '<text x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle" font-size="' + (r - 1) + '" fill="' +
        (visited ? '#120c30' : ty[0]) + '">' + ty[1] + '</text></g>';
      if (visited && stops[stopIdx]) {
        var right = cols <= 1 || n.col < (cols - 1) / 2 || (n.col === (cols - 1) / 2 && n.row % 2 === 0);
        var lost = (stops[stopIdx].events || []).some(function (e) { return e.k === 'battle' && e.result === 'LOSS'; });
        labels += '<button type="button" class="mr-mlab' + (right ? '' : ' l') + (lost ? ' bad' : '') + '" data-stop="' + stopIdx +
          '" style="top:' + (p.y / H * 100) + '%;' + (right ? 'left:' + ((p.x + r + 6) / W * 100) + '%' : 'right:' + ((W - p.x + r + 6) / W * 100) + '%') +
          '">' + esc(stopLabel(stops[stopIdx])) + '</button>';
      }
    });
    svg += '</svg>';

    var gold = null;
    var pts = stopPoints(run);
    var ledger = stops.map(function (s, idx) {
      var ty = NODE[s.type] || NODE.BATTLE;
      var delta = (s.goldAfter != null && s.goldBefore != null) ? s.goldAfter - s.goldBefore : 0;
      gold = s.goldAfter != null ? s.goldAfter : gold;
      return '<article class="mr-stop" data-stop-card="' + idx + '" style="--nc:' + ty[0] + '"><span class="dot" style="background:' + ty[0] + '">' + ty[1] + '</span>' +
        '<div class="c"><div class="hd"><span class="st"><small>F' + esc(s.floor) + ' · ' + esc(ty[2]) +
        (s.land ? ' · ' + esc(s.land) : '') + '</small><h5>' + esc(s.title || ty[2]) + '</h5></span>' +
        '<span class="bal">' + (delta ? '<span class="amt ' + (delta < 0 ? 'neg' : 'pos') + '">' + gl(delta) + '</span>' : '') +
        (gold != null ? '<small>' + esc(gold) + 'g</small>' : '') + '</span></div>' + stopBody(s) +
        stopChips(pts.per[idx], pts.estimated) + '</div></article>';
    }).join('');

    body.innerHTML =
      '<div class="mr-scroll">' +
        '<div class="mr-stats four">' +
          '<div><span>Floor</span><b>' + esc(run.floorReached || '—') + '</b></div>' +
          '<div><span>Battles</span><b>' + wins + '–' + (battles - wins) + '</b></div>' +
          '<div><span>Gold earned</span><b>' + esc(run.goldEarned != null ? run.goldEarned : '—') + '</b></div>' +
          '<div><span>Spent</span><b>' + (run.goldSpent != null ? esc(run.goldSpent) : spent) + '</b></div>' +
        '</div>' +
        (run.outcome ? '<p class="mr-out mr-run-out ' + (won ? 'w' : 'r') + '">' + esc(run.outcome) + '</p>' : '') +
        scorePanel(run, pts) +
        (map.length ? '<div class="mr-map">' + svg + labels + '</div>' : '') +
        '<div class="mr-ledger">' + (ledger || '<div class="mr-state">No stops were recorded for this run.</div>') + '</div>' +
      '</div>';

    var scroller = body.querySelector('.mr-scroll');
    body.addEventListener('click', function (e) {
      var t = e.target.closest('[data-stop]');
      if (!t) return;
      var idx = t.getAttribute('data-stop');
      var card = body.querySelector('[data-stop-card="' + idx + '"]');
      body.querySelectorAll('.mr-stop.on, .mr-mlab.on').forEach(function (el) { el.classList.remove('on'); });
      body.querySelectorAll('.mr-mlab[data-stop="' + idx + '"]').forEach(function (el) { el.classList.add('on'); });
      if (card) {
        card.classList.add('on');
        scroller.scrollTo({ top: card.offsetTop - 12, behavior: 'smooth' });
      }
    });
  }

  /* ---------- rows ---------- */

  // Recent rows from both lists, newest first. Battle rows come from
  // matchHistory, Siege rows from siegeHistory; they are merged only here so
  // win rates computed from matchHistory never count a Siege run.
  function mergeRecent(battles, sieges, limit) {
    var rows = [];
    (battles || []).forEach(function (m) { if (m) rows.push(m); });
    (sieges || []).forEach(function (s) { if (s) rows.push(s); });
    rows.sort(function (a, b) { return String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')); });
    return rows.slice(0, limit || 5);
  }

  function rowMarkup(m) {
    var siege = String(m.matchType || '').toUpperCase() === 'SIEGE';
    var r = String(m.result || '').toUpperCase();
    var won = r === 'WIN';
    var what = won ? 'Win' : r === 'DRAW' ? 'Draw' : 'Loss';
    var sub, gain, hint;
    if (siege) {
      sub = (m.knightName ? m.knightName + ' · ' : '') + 'Floor ' + (m.floorReached || '?') + (m.floorTotal ? ' of ' + m.floorTotal : '');
      gain = m.score != null ? num(m.score) + ' pts' : 'F' + (m.floorReached || '?');
      hint = 'Route';
    } else {
      sub = m.opponentName ? 'vs ' + m.opponentName : (m.loadoutLabel || '');
      gain = m.turnNumber != null ? 'T' + m.turnNumber : '';
      hint = m.hasReplay ? 'Replay' : 'Log';
    }
    var mode = siege ? 'Siege' : title(m.matchType || 'Match');
    if (!m.id) {
      return '<div class="sg-recent' + (won ? ' is-win' : '') + '"><span class="mode">' + esc(mode) + '</span>' +
        '<span class="what">' + esc(what) + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</span><span class="gain">' + esc(gain) + '</span></div>';
    }
    return '<button type="button" class="sg-recent is-reviewable' + (won ? ' is-win' : '') + (siege ? ' is-siege' : '') +
      '" data-review="' + esc(m.id) + '" aria-label="Review ' + esc(mode + ' ' + what + (sub ? ' ' + sub : '')) + '">' +
      '<span class="mode">' + esc(mode) + '</span>' +
      '<span class="what">' + esc(what) + (sub ? '<em>' + esc(sub) + '</em>' : '') +
        '<small class="hint' + (hint === 'Log' ? ' dim' : '') + '">' + esc(hint) + '</small></span>' +
      '<span class="gain">' + esc(gain) + '</span><span class="chev" aria-hidden="true">›</span></button>';
  }

  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('[data-review]');
    if (!row) return;
    e.preventDefault();
    open(row.getAttribute('data-review'));
  });

  window.SiegelingsMatchReview = { open: open, close: close, mergeRecent: mergeRecent, rowMarkup: rowMarkup };
})();
