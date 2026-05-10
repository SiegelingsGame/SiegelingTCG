/**
 * Sieglings TCG — Real-Time Playback System
 *
 * Per-move animation + toast notification queue. Drives:
 *   - Toast notifications (top-of-screen, knight-tinted, queued)
 *   - Card highlight pulses on board cells
 *   - Projectile/attack animations (delegates to SieglingsFx)
 *   - Damage floaters and impact effects
 *   - Opponent "thinking" indicator
 *   - Speed toggle (Normal / Fast)
 *
 * Public API (window.SieglingsActionQueue):
 *   enqueueFromStateDiff(prevState, nextState)
 *   enqueueAction(action)
 *   setSpeed('normal' | 'fast')
 *   getSpeed()
 *   clear()
 *   isProcessing()
 *   markOpponentThinking(active)
 */
(function () {
    'use strict';

    const ELEMENT_HEX = {
        FIRE:     '#ff501e',
        EARTH:    '#b48c50',
        WIND:     '#96ffb4',
        WATER:    '#3296ff',
        ICE:      '#76e6ff',
        SHADOW:   '#7832b4',
        ELECTRIC: '#ffe63c',
        METAL:    '#a0aab4',
        UNDEAD:   '#8c78a0',
        PSYCHIC:  '#c896ff',
        NEUTRAL:  '#95a5a6'
    };

    const ELEMENT_SIGIL = {
        FIRE: '🔥', WATER: '💧', EARTH: '⛰', WIND: '🌪', ICE: '❄',
        SHADOW: '🌑', ELECTRIC: '⚡', METAL: '⚙', UNDEAD: '☠',
        PSYCHIC: '✦', NEUTRAL: '◆'
    };

    const ACTION_LABEL = {
        PLAY:    'Plays',
        ABILITY: 'Uses',
        ATTACK:  'Attacks',
        BLOCK:   'Blocks',
        EFFECT:  'Effect',
        PHASE:   'Phase'
    };

    const TIMING_NORMAL = {
        highlightMs: 300,
        toastEnterMs: 200,
        projectileMs: 600,
        impactMs: 300,
        gapMs: 200,
        toastDismissMs: 2500
    };
    const FAST_SCALE = 0.4;
    function fastTimings(t) {
        const out = {};
        for (const k of Object.keys(t)) out[k] = Math.max(40, Math.round(t[k] * FAST_SCALE));
        return out;
    }
    const TIMING_FAST = fastTimings(TIMING_NORMAL);

    const SPEED_STORAGE_KEY = 'sieglings_playback_speed';

    function elementHex(element) {
        const k = String(element || '').toUpperCase();
        return ELEMENT_HEX[k] || ELEMENT_HEX.NEUTRAL;
    }
    function elementSigil(element) {
        const k = String(element || '').toUpperCase();
        return ELEMENT_SIGIL[k] || ELEMENT_SIGIL.NEUTRAL;
    }
    function hexWithAlpha(hex, alpha) {
        const h = (hex || '#888').replace('#', '');
        if (h.length !== 6) return `rgba(150,150,150,${alpha})`;
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // ── Toast Renderer ────────────────────────────────────────────────────────
    class ToastRenderer {
        constructor() {
            this.container = null;
            this._ensureContainer();
        }
        _ensureContainer() {
            if (this.container && document.body.contains(this.container)) return;
            let c = document.getElementById('sieglingsToastStack');
            if (!c) {
                c = document.createElement('div');
                c.id = 'sieglingsToastStack';
                c.className = 'sgl-toast-stack';
                document.body.appendChild(c);
            }
            this.container = c;
        }
        show(toast, holdMs) {
            this._ensureContainer();
            const knightHex = elementHex(toast.knightElement);
            const elHex = elementHex(toast.elementColor || toast.knightElement);
            const sideClass = toast.side === 'ENEMY' ? 'enemy' : 'player';
            const node = document.createElement('div');
            node.className = `sgl-toast sgl-toast-${sideClass}`;
            node.style.setProperty('--sgl-knight', knightHex);
            node.style.setProperty('--sgl-knight-soft', hexWithAlpha(knightHex, 0.22));
            node.style.setProperty('--sgl-knight-glow', hexWithAlpha(knightHex, 0.55));
            node.style.setProperty('--sgl-element', elHex);

            const labelText = toast.label || ACTION_LABEL[toast.kind] || toast.kind || '';
            const damagePart = (toast.amount > 0)
                ? `<span class="sgl-toast-damage" style="color:${elHex}">-${toast.amount}</span>`
                : '';
            const subtitle = toast.subtitle ? `<div class="sgl-toast-sub">${escapeHtml(toast.subtitle)}</div>` : '';
            const portraitHtml = toast.portraitHtml || `<span class="sgl-toast-sigil">${elementSigil(toast.elementColor || toast.knightElement)}</span>`;

            node.innerHTML = `
                <div class="sgl-toast-portrait">${portraitHtml}</div>
                <div class="sgl-toast-body">
                    <div class="sgl-toast-line">
                        <span class="sgl-toast-actor">${escapeHtml(toast.actorName || '')}</span>
                        <span class="sgl-toast-action">${escapeHtml(labelText)}</span>
                        <span class="sgl-toast-target">${escapeHtml(toast.targetName || '')}</span>
                        ${damagePart}
                    </div>
                    ${subtitle}
                </div>
            `;
            this.container.appendChild(node);
            requestAnimationFrame(() => node.classList.add('visible'));

            const dismiss = () => {
                if (!node.parentNode) return;
                node.classList.remove('visible');
                node.classList.add('leaving');
                setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 240);
            };
            const timer = setTimeout(dismiss, Math.max(400, holdMs || 2500));
            return { dismiss: () => { clearTimeout(timer); dismiss(); } };
        }
        clear() {
            if (!this.container) return;
            while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
        }
    }

    // ── Highlighter ───────────────────────────────────────────────────────────
    function findCellEl(isPlayer, row, col) {
        const grid = document.getElementById(isPlayer ? 'playerGrid' : 'enemyGrid');
        if (!grid) return null;
        return grid.querySelector(`.board-cell[data-row="${row}"][data-col="${col}"]`);
    }

    function pulseCard(isPlayer, row, col, knightHex, elementHexValue, kind, durationMs) {
        const cell = findCellEl(isPlayer, row, col);
        if (!cell) return;
        const card = cell.querySelector('.board-card') || cell;
        const knight = knightHex || elementHexValue || ELEMENT_HEX.NEUTRAL;
        card.style.setProperty('--sgl-pulse-color', knight);
        card.style.setProperty('--sgl-pulse-glow', hexWithAlpha(knight, 0.65));
        card.classList.add('sgl-acting');
        if (kind === 'ATTACK') card.classList.add('sgl-acting-attack');
        if (kind === 'PLAY')   card.classList.add('sgl-acting-play');
        setTimeout(() => {
            card.classList.remove('sgl-acting', 'sgl-acting-attack', 'sgl-acting-play');
        }, Math.max(120, durationMs || 600));
    }

    function flashImpact(isPlayer, row, col, elementHexValue) {
        const cell = findCellEl(isPlayer, row, col);
        if (!cell) return;
        const card = cell.querySelector('.board-card') || cell;
        card.style.setProperty('--sgl-impact-color', elementHexValue || ELEMENT_HEX.NEUTRAL);
        card.classList.add('sgl-impact');
        setTimeout(() => card.classList.remove('sgl-impact'), 360);
    }

    function spawnGhost(isPlayer, row, col, cell, knightHex, elementHexValue) {
        if (!cell) return null;
        const cellEl = findCellEl(isPlayer, row, col);
        if (!cellEl) return null;
        const rect = cellEl.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        const elementKey = String(cell.element || 'NEUTRAL').toLowerCase();
        const knight = knightHex || ELEMENT_HEX.NEUTRAL;
        const elHex  = elementHexValue || knight;
        const maxHp = Number(cell.maxHp) || 0;
        const hp    = Math.max(0, Number(cell.hp) || 0);
        const pct   = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 100;

        const ghost = document.createElement('div');
        ghost.className = `sgl-death-ghost el-${elementKey}`;
        ghost.style.position = 'fixed';
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.setProperty('--sgl-knight', knight);
        ghost.style.setProperty('--sgl-element', elHex);
        ghost.style.setProperty('--sgl-knight-soft', hexWithAlpha(knight, 0.28));
        ghost.style.setProperty('--sgl-knight-glow', hexWithAlpha(knight, 0.6));
        ghost.innerHTML = `
            <div class="sgl-ghost-inner">
                <div class="sgl-ghost-name">${escapeHtml(cell.name || '')}</div>
                <div class="sgl-ghost-hp"><div class="sgl-ghost-hp-fill" style="width:${pct}%"></div></div>
                <div class="sgl-ghost-sigil">${elementSigil(cell.element)}</div>
            </div>
        `;
        document.body.appendChild(ghost);

        const reposition = () => {
            const r = cellEl.getBoundingClientRect();
            if (!r) return;
            ghost.style.left = `${r.left}px`;
            ghost.style.top = `${r.top}px`;
            ghost.style.width = `${r.width}px`;
            ghost.style.height = `${r.height}px`;
        };
        window.addEventListener('resize', reposition);
        const scrollHandler = () => reposition();
        window.addEventListener('scroll', scrollHandler, true);
        ghost._cleanup = () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', scrollHandler, true);
        };
        return ghost;
    }

    function destroyGhost(ghost, elementHexValue, durationMs) {
        if (!ghost) return Promise.resolve();
        ghost.style.setProperty('--sgl-impact-color', elementHexValue || ELEMENT_HEX.NEUTRAL);
        ghost.classList.add('sgl-destroying');
        const dur = Math.max(180, durationMs || 540);
        return new Promise((resolve) => {
            setTimeout(() => {
                try { ghost._cleanup && ghost._cleanup(); } catch (_) {}
                if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
                resolve();
            }, dur);
        });
    }

    // ── Diff helpers ──────────────────────────────────────────────────────────
    function normalizeElement(element) {
        const v = String(element || '').trim().toUpperCase();
        return v || null;
    }
    function logCounts(logs) {
        const counts = new Map();
        (logs || []).forEach((line) => {
            const k = String(line || '');
            counts.set(k, (counts.get(k) || 0) + 1);
        });
        return counts;
    }
    function getNewLogEntries(prevState, nextState) {
        const prevCounts = logCounts(prevState?.gameLog);
        const out = [];
        (nextState?.gameLog || []).forEach((line) => {
            const k = String(line || '');
            const c = prevCounts.get(k) || 0;
            if (c > 0) prevCounts.set(k, c - 1);
            else out.push(k);
        });
        return out;
    }
    function findCellOnBoard(board, predicate) {
        if (!board) return null;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cell = board[r]?.[c];
                if (cell && predicate(cell, r, c)) return { row: r, col: c, cell };
            }
        }
        return null;
    }
    function findCellByName(board, name) {
        if (!name) return null;
        const want = String(name).trim().toLowerCase();
        return findCellOnBoard(board, (c) => String(c?.name || '').trim().toLowerCase() === want);
    }
    function findCellByInstanceId(board, id) {
        if (!id) return null;
        const want = String(id);
        return findCellOnBoard(board, (c) => String(c?.instanceId || c?.id || '') === want);
    }
    function diffPlacements(prev, next, isPlayer) {
        const out = [];
        if (!next) return out;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const p = prev?.[r]?.[c];
                const n = next?.[r]?.[c];
                if (n && !p) {
                    out.push({ isPlayer, row: r, col: c, cell: n });
                } else if (n && p) {
                    const pid = String(p.instanceId || p.id || '');
                    const nid = String(n.instanceId || n.id || '');
                    if (pid && nid && pid !== nid) {
                        out.push({ isPlayer, row: r, col: c, cell: n });
                    }
                }
            }
        }
        return out;
    }
    function diffDamage(prev, next, isPlayer) {
        const out = [];
        if (!prev || !next) return out;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const p = prev[r]?.[c];
                const n = next[r]?.[c];
                if (!p || !n) continue;
                const same = (p.instanceId && n.instanceId && p.instanceId === n.instanceId)
                    || (p.id && n.id && p.id === n.id)
                    || (String(p.name || '') === String(n.name || '') && p.name);
                const prevHp = p.hp ?? 0;
                const nextHp = n.hp ?? 0;
                if (same && nextHp < prevHp) {
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: prevHp - nextHp,
                        element: normalizeElement(n.element || p.element),
                        name: n.name || p.name || '',
                        instanceId: String(n.instanceId || p.instanceId || n.id || p.id || '')
                    });
                }
            }
        }
        return out;
    }
    function diffDestructions(prev, next, isPlayer) {
        const out = [];
        if (!prev) return out;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const p = prev[r]?.[c];
                if (!p) continue;
                const n = next?.[r]?.[c];
                const pid = String(p.instanceId || p.id || '');
                const nid = String(n?.instanceId || n?.id || '');
                if (!n || (pid && nid && pid !== nid)) {
                    out.push({
                        isPlayer, row: r, col: c, cell: p,
                        instanceId: pid,
                        element: normalizeElement(p.element),
                        name: p.name || ''
                    });
                }
            }
        }
        return out;
    }
    function getKnightElement(state, side) {
        if (!state) return 'NEUTRAL';
        const t = side === 'ENEMY' ? state.enemy?.trainer : state.player?.trainer;
        return normalizeElement(t?.element) || 'NEUTRAL';
    }

    // ── Log parser ────────────────────────────────────────────────────────────
    // Best-effort extraction of "X uses Y" / "X plays Y" lines for ABILITY/PLAY toasts.
    function parseAbilityFromLog(line) {
        const text = String(line || '').trim();
        let m = text.match(/^(.+?)\s+uses\s+(.+?)\.?$/i);
        if (m) return { kind: 'ABILITY', actor: m[1].trim(), name: m[2].trim() };
        m = text.match(/^(.+?)\s+plays\s+(.+?)\.?$/i);
        if (m) return { kind: 'PLAY', actor: m[1].trim(), name: m[2].trim() };
        m = text.match(/^(.+?)\s+activates\s+(.+?)\.?$/i);
        if (m) return { kind: 'ABILITY', actor: m[1].trim(), name: m[2].trim() };
        return null;
    }

    // ── Action Queue ──────────────────────────────────────────────────────────
    class ActionQueue {
        constructor() {
            this.queue = [];
            this.processing = false;
            this.toasts = new ToastRenderer();
            this.activeToast = null;
            this.thinkingNode = null;
            this.opponentThinking = false;
            this._loadSpeed();
        }
        _loadSpeed() {
            try {
                const s = localStorage.getItem(SPEED_STORAGE_KEY);
                this.speed = (s === 'fast') ? 'fast' : 'normal';
            } catch (_) {
                this.speed = 'normal';
            }
        }
        timings() { return this.speed === 'fast' ? TIMING_FAST : TIMING_NORMAL; }
        getSpeed() { return this.speed; }
        setSpeed(s) {
            this.speed = (s === 'fast') ? 'fast' : 'normal';
            try { localStorage.setItem(SPEED_STORAGE_KEY, this.speed); } catch (_) {}
            const btn = document.getElementById('sglSpeedToggle');
            if (btn) {
                btn.classList.toggle('fast', this.speed === 'fast');
                btn.textContent = this.speed === 'fast' ? '⏩ Fast' : '▶ Normal';
                btn.title = `Playback speed: ${this.speed === 'fast' ? 'Fast (40%)' : 'Normal'} — click to toggle`;
            }
        }
        isProcessing() { return this.processing; }
        clear() {
            this.queue = [];
            if (this.activeToast) { this.activeToast.dismiss(); this.activeToast = null; }
            this.toasts.clear();
            this.processing = false;
            this.markOpponentThinking(false);
        }

        enqueueAction(action) {
            if (!action) return;
            this.queue.push(action);
            this._kick();
        }

        enqueueFromStateDiff(prevState, nextState) {
            if (!prevState || !nextState) return;
            const prevPlayer = prevState.playerBoard || prevState.player?.board;
            const prevEnemy  = prevState.enemyBoard  || prevState.enemy?.board;
            const nextPlayer = nextState.playerBoard || nextState.player?.board;
            const nextEnemy  = nextState.enemyBoard  || nextState.enemy?.board;

            const playerKnight = getKnightElement(nextState, 'PLAYER');
            const enemyKnight  = getKnightElement(nextState, 'ENEMY');

            // Phase change → enqueue a phase action
            if (prevState.currentPhase && nextState.currentPhase
                && prevState.currentPhase !== nextState.currentPhase) {
                this.enqueueAction({
                    kind: 'PHASE',
                    side: nextState.activeSide || 'PLAYER',
                    label: 'Phase',
                    actorName: nextState.currentPhase,
                    knightElement: nextState.activeSide === 'ENEMY' ? enemyKnight : playerKnight,
                    elementColor: 'NEUTRAL',
                    holdMs: this.timings().toastDismissMs
                });
            }

            // Opponent turn beginning → thinking indicator
            if (prevState.activeSide !== 'ENEMY' && nextState.activeSide === 'ENEMY' && !nextState.gameOver) {
                this.markOpponentThinking(true, nextState);
            }
            if (nextState.activeSide === 'PLAYER' || nextState.gameOver) {
                // We'll auto-clear when queue drains.
            }

            // Placements
            const newPlayerPlacements = diffPlacements(prevPlayer, nextPlayer, true);
            const newEnemyPlacements  = diffPlacements(prevEnemy,  nextEnemy,  false);
            for (const p of newPlayerPlacements) {
                this.enqueueAction({
                    kind: 'PLAY',
                    side: 'PLAYER',
                    actorName: p.cell.name || 'Card',
                    knightElement: playerKnight,
                    elementColor: normalizeElement(p.cell.element) || playerKnight,
                    source: { isPlayer: true, row: p.row, col: p.col },
                    portraitHtml: `<span class="sgl-toast-sigil">${elementSigil(p.cell.element)}</span>`,
                    label: 'Plays'
                });
            }
            for (const p of newEnemyPlacements) {
                this.enqueueAction({
                    kind: 'PLAY',
                    side: 'ENEMY',
                    actorName: p.cell.name || 'Card',
                    knightElement: enemyKnight,
                    elementColor: normalizeElement(p.cell.element) || enemyKnight,
                    source: { isPlayer: false, row: p.row, col: p.col },
                    portraitHtml: `<span class="sgl-toast-sigil">${elementSigil(p.cell.element)}</span>`,
                    label: 'Plays'
                });
            }

            // Damage events (attacks / abilities that hit)
            const damageOnPlayer = diffDamage(prevPlayer, nextPlayer, true);
            const damageOnEnemy  = diffDamage(prevEnemy,  nextEnemy,  false);

            // Destruction events (cards that no longer exist). Paired with attacks
            // below so the killed card stays visible until the projectile lands.
            const destructionsOnPlayer = diffDestructions(prevPlayer, nextPlayer, true);
            const destructionsOnEnemy  = diffDestructions(prevEnemy,  nextEnemy,  false);
            const matchDestruction = (list, t) => {
                const idx = list.findIndex((d) =>
                    d.row === t.row && d.col === t.col
                    && (!t.instanceId || !d.instanceId || d.instanceId === t.instanceId)
                );
                if (idx === -1) return null;
                return list.splice(idx, 1)[0];
            };

            for (const t of damageOnEnemy) {
                const src = findCellOnBoard(prevPlayer, () => true);
                const pending = prevState.pendingBattle;
                const srcCell = (pending && findCellByInstanceId(prevPlayer, pending.instanceId))
                    || (pending && pending.row != null && pending.col != null
                        ? { row: pending.row, col: pending.col, cell: prevPlayer?.[pending.row]?.[pending.col] }
                        : null)
                    || src;
                const srcElement = normalizeElement(pending?.element || srcCell?.cell?.element) || playerKnight;
                const destroyed = matchDestruction(destructionsOnEnemy, t);
                this.enqueueAction({
                    kind: 'ATTACK',
                    side: 'PLAYER',
                    actorName: srcCell?.cell?.name || pending?.name || 'Attacker',
                    targetName: t.name,
                    amount: t.amount,
                    knightElement: playerKnight,
                    elementColor: srcElement,
                    source: srcCell ? { isPlayer: true, row: srcCell.row, col: srcCell.col } : null,
                    target: { isPlayer: false, row: t.row, col: t.col, element: t.element || srcElement },
                    destroysTarget: !!destroyed,
                    ghostCell: destroyed?.cell || null
                });
            }
            for (const t of damageOnPlayer) {
                const src = findCellOnBoard(prevEnemy, () => true);
                const srcElement = normalizeElement(src?.cell?.element) || enemyKnight;
                const destroyed = matchDestruction(destructionsOnPlayer, t);
                this.enqueueAction({
                    kind: 'ATTACK',
                    side: 'ENEMY',
                    actorName: src?.cell?.name || 'Attacker',
                    targetName: t.name,
                    amount: t.amount,
                    knightElement: enemyKnight,
                    elementColor: srcElement,
                    source: src ? { isPlayer: false, row: src.row, col: src.col } : null,
                    target: { isPlayer: true, row: t.row, col: t.col, element: t.element || srcElement },
                    destroysTarget: !!destroyed,
                    ghostCell: destroyed?.cell || null
                });
            }

            // Unpaired destructions (e.g. effect damage, end-of-turn cleanup) →
            // standalone DESTROY action that shows a ghost + fade-out.
            const queueDestruction = (d, side, knight) => {
                const el = normalizeElement(d.cell?.element) || knight;
                this.enqueueAction({
                    kind: 'DESTROY',
                    side,
                    actorName: d.name || 'Card',
                    knightElement: knight,
                    elementColor: el,
                    label: 'Destroyed',
                    source: { isPlayer: d.isPlayer, row: d.row, col: d.col },
                    target: { isPlayer: d.isPlayer, row: d.row, col: d.col, element: el },
                    ghostCell: d.cell
                });
            };
            for (const d of destructionsOnPlayer) queueDestruction(d, 'ENEMY', enemyKnight);
            for (const d of destructionsOnEnemy)  queueDestruction(d, 'PLAYER', playerKnight);

            // Ability/use lines from the log → ABILITY toasts (skip ones already covered by damage)
            const newLogs = getNewLogEntries(prevState, nextState);
            const damageNames = new Set([...damageOnEnemy, ...damageOnPlayer].map((d) => d.name));
            for (const line of newLogs) {
                const parsed = parseAbilityFromLog(line);
                if (!parsed) continue;
                if (parsed.kind === 'ABILITY') {
                    const playerHit = findCellByName(prevPlayer, parsed.actor) || findCellByName(nextPlayer, parsed.actor);
                    const enemyHit  = findCellByName(prevEnemy,  parsed.actor) || findCellByName(nextEnemy,  parsed.actor);
                    const source = playerHit ? { isPlayer: true, row: playerHit.row, col: playerHit.col, cell: playerHit.cell }
                                 : enemyHit  ? { isPlayer: false, row: enemyHit.row,  col: enemyHit.col,  cell: enemyHit.cell }
                                 : null;
                    if (!source) continue;
                    if (damageNames.has(parsed.actor)) continue;
                    const knight = source.isPlayer ? playerKnight : enemyKnight;
                    const elColor = normalizeElement(source.cell?.element) || knight;
                    this.enqueueAction({
                        kind: 'ABILITY',
                        side: source.isPlayer ? 'PLAYER' : 'ENEMY',
                        actorName: parsed.actor,
                        targetName: parsed.name,
                        knightElement: knight,
                        elementColor: elColor,
                        source: { isPlayer: source.isPlayer, row: source.row, col: source.col },
                        label: 'Uses'
                    });
                }
            }
        }

        markOpponentThinking(active, nextState) {
            this.opponentThinking = !!active;
            if (active) {
                if (this.thinkingNode) return;
                const node = document.createElement('div');
                node.className = 'sgl-thinking-indicator';
                const enemyName = nextState?.enemy?.trainer?.name
                    || nextState?.enemyName
                    || 'Opponent';
                const enemyKnight = getKnightElement(nextState, 'ENEMY');
                node.style.setProperty('--sgl-knight', elementHex(enemyKnight));
                node.innerHTML = `
                    <span class="sgl-thinking-dot"></span>
                    <span class="sgl-thinking-dot"></span>
                    <span class="sgl-thinking-dot"></span>
                    <span class="sgl-thinking-text">${escapeHtml(enemyName)} is thinking…</span>
                `;
                document.body.appendChild(node);
                requestAnimationFrame(() => node.classList.add('visible'));
                this.thinkingNode = node;
                document.body.classList.add('sgl-opponent-turn');
            } else if (this.thinkingNode) {
                const n = this.thinkingNode;
                this.thinkingNode = null;
                n.classList.remove('visible');
                setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, 240);
                document.body.classList.remove('sgl-opponent-turn');
            }
        }

        _kick() {
            if (this.processing) return;
            this.processing = true;
            // Do not block the current callstack
            Promise.resolve().then(() => this._drain());
        }

        async _drain() {
            try {
                while (this.queue.length > 0) {
                    const action = this.queue.shift();
                    await this._playAction(action);
                }
            } finally {
                this.processing = false;
                if (this.opponentThinking) this.markOpponentThinking(false);
            }
        }

        async _playAction(action) {
            const t = this.timings();
            const knight = elementHex(action.knightElement);
            const elColor = elementHex(action.elementColor || action.knightElement);

            if (action.kind === 'PHASE') {
                this.activeToast = this.toasts.show({
                    ...action,
                    label: 'Phase',
                    actorName: action.actorName,
                    targetName: ''
                }, t.toastDismissMs);
                await sleep(t.toastEnterMs + t.gapMs);
                return;
            }

            // 1. Highlight source card
            if (action.source) {
                pulseCard(
                    action.source.isPlayer,
                    action.source.row,
                    action.source.col,
                    knight,
                    elColor,
                    action.kind,
                    t.highlightMs + t.projectileMs
                );
            }
            await sleep(Math.round(t.highlightMs * 0.45));

            // 2. Show toast
            if (this.activeToast) this.activeToast.dismiss();
            this.activeToast = this.toasts.show(action, t.toastDismissMs);
            await sleep(t.toastEnterMs);

            // 3. Projectile + impact for attack-like actions
            const fireProjectile = action.kind === 'ATTACK' && action.source && action.target
                && window.SieglingsFx?.attackCell;
            if (fireProjectile) {
                // If this hit destroys the target, materialize a ghost copy so
                // the now-empty cell still has something to be hit by the
                // projectile + impact animation.
                let ghost = null;
                if (action.destroysTarget && action.ghostCell) {
                    ghost = spawnGhost(
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.ghostCell, knight, elColor
                    );
                }

                window.SieglingsFx.attackCell(
                    action.source.isPlayer,
                    action.source.row,
                    action.source.col,
                    action.target.isPlayer,
                    action.target.row,
                    action.target.col,
                    action.elementColor || action.knightElement,
                    { duration: t.projectileMs }
                );
                await sleep(t.projectileMs);

                // 4. Impact: hit flash on target + floating damage + screen shake
                if (ghost) {
                    ghost.style.setProperty('--sgl-impact-color', elColor);
                    ghost.classList.add('sgl-ghost-impact');
                    setTimeout(() => ghost.classList.remove('sgl-ghost-impact'), 320);
                } else if (action.target) {
                    flashImpact(action.target.isPlayer, action.target.row, action.target.col, elColor);
                }
                if (action.amount && window.SieglingsFx?.floatingDamage) {
                    window.SieglingsFx.floatingDamage(
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.amount, action.elementColor || action.knightElement
                    );
                }
                if (window.SieglingsFx?.cameraShake) {
                    const shake = Math.min(12, 3 + Math.round((action.amount || 0) * 0.6));
                    window.SieglingsFx.cameraShake(shake, t.impactMs);
                }
                await sleep(t.impactMs);

                if (ghost) {
                    // Destruction animation, then remove the ghost.
                    await destroyGhost(ghost, elColor, 520);
                }
            } else if (action.kind === 'DESTROY' && action.target && action.ghostCell) {
                // Standalone destruction (no projectile / no attacker we can locate).
                const ghost = spawnGhost(
                    action.target.isPlayer, action.target.row, action.target.col,
                    action.ghostCell, knight, elColor
                );
                if (window.SieglingsFx?.impactAt) {
                    window.SieglingsFx.impactAt(
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.elementColor || action.knightElement
                    );
                }
                await sleep(Math.round(t.impactMs * 0.6));
                await destroyGhost(ghost, elColor, 520);
            } else if (action.kind === 'ABILITY' && action.source) {
                // Ability without explicit target → small impact ring on caster
                if (window.SieglingsFx?.impactAt) {
                    window.SieglingsFx.impactAt(
                        action.source.isPlayer, action.source.row, action.source.col,
                        action.elementColor || action.knightElement
                    );
                }
                await sleep(t.impactMs);
            } else if (action.kind === 'PLAY' && action.source) {
                if (window.SieglingsFx?.impactAt) {
                    window.SieglingsFx.impactAt(
                        action.source.isPlayer, action.source.row, action.source.col,
                        action.elementColor || action.knightElement
                    );
                }
                await sleep(Math.round(t.impactMs * 0.6));
            } else {
                await sleep(Math.round(t.impactMs * 0.4));
            }

            // 5. Inter-action gap
            await sleep(t.gapMs);
        }
    }

    // ── Speed toggle UI ───────────────────────────────────────────────────────
    function ensureSpeedToggle(queue) {
        if (document.getElementById('sglSpeedToggle')) return;
        const btn = document.createElement('button');
        btn.id = 'sglSpeedToggle';
        btn.type = 'button';
        btn.className = 'sgl-speed-toggle';
        btn.addEventListener('click', () => {
            queue.setSpeed(queue.getSpeed() === 'fast' ? 'normal' : 'fast');
        });
        document.body.appendChild(btn);
        queue.setSpeed(queue.getSpeed()); // initialize label
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    const queue = new ActionQueue();
    window.SieglingsActionQueue = {
        enqueueAction: (a) => queue.enqueueAction(a),
        enqueueFromStateDiff: (p, n) => queue.enqueueFromStateDiff(p, n),
        setSpeed: (s) => queue.setSpeed(s),
        getSpeed: () => queue.getSpeed(),
        clear: () => queue.clear(),
        isProcessing: () => queue.isProcessing(),
        markOpponentThinking: (a, s) => queue.markOpponentThinking(a, s)
    };

    function init() {
        ensureSpeedToggle(queue);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
