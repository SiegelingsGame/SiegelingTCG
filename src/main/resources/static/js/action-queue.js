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
        PLAY:    'plays',
        ABILITY: 'uses',
        ATTACK:  'attacks',
        BLOCK:   'blocks',
        EFFECT:  'effect',
        DESTROY: 'is destroyed',
        PHASE:   'phase'
    };

    const TIMING_NORMAL = {
        highlightMs: 400,
        toastEnterMs: 300,
        projectileMs: 850,
        impactMs: 450,
        gapMs: 300,
        toastDismissMs: 3000
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
    function stripLogPrefix(line) {
        return String(line || '').trim().replace(/^\[Turn\s+\d+\s+\w+\]\s*/i, '');
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

            const labelText = (toast.label != null)
                ? toast.label
                : (ACTION_LABEL[toast.kind] || toast.kind || '');
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

    // Apply a one-shot status-application visual on a board cell. The
    // persistent badge is already rendered by game.js; this just animates
    // the moment of application so the player can see the status land.
    const STATUS_PROFILES = {
        FREEZE:       { className: 'sgl-status-freeze',       element: 'ICE',      duration: 1100 },
        SPEED_ZERO:   { className: 'sgl-status-speed-zero',   element: 'METAL',    duration: 700  },
        WEAK:         { className: 'sgl-status-weak',         element: 'SHADOW',   duration: 700  },
        STRONG:       { className: 'sgl-status-strong',       element: 'NEUTRAL',  duration: 700  },
        HEALTH_BOOST: { className: 'sgl-status-health-boost', element: 'WIND',     duration: 700  },
        DAMAGE_BOOST: { className: 'sgl-status-damage-boost', element: 'FIRE',     duration: 700  },
        SPEED_BOOST:  { className: 'sgl-status-speed-boost',  element: 'ELECTRIC', duration: 700  }
    };
    function statusProfile(status) {
        const k = String(status || '').toUpperCase();
        return STATUS_PROFILES[k] || { className: 'sgl-status-generic', element: 'NEUTRAL', duration: 700 };
    }
    function applyStatusVisual(isPlayer, row, col, status) {
        const cellEl = findCellEl(isPlayer, row, col);
        const card = cellEl?.querySelector('.board-card');
        if (!card) return;
        const profile = statusProfile(status);
        card.style.setProperty('--sgl-status-color', elementHex(profile.element));
        card.classList.add(profile.className);
        card.classList.add('sgl-status-applied');
        setTimeout(() => {
            card.classList.remove(profile.className);
            card.classList.remove('sgl-status-applied');
        }, profile.duration);
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
    function findCellByAbilityName(board, abilityName) {
        const ability = String(abilityName || '').trim().toLowerCase();
        if (!ability) return null;
        const matches = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cell = board?.[r]?.[c];
                const name = String(cell?.name || '').trim().toLowerCase();
                if (name && (ability === name || ability.startsWith(`${name} `) || ability.includes(name))) {
                    matches.push({ row: r, col: c, cell });
                }
            }
        }
        matches.sort((a, b) => String(b.cell?.name || '').length - String(a.cell?.name || '').length);
        return matches[0] || null;
    }
    function findCellByInstanceId(board, id) {
        if (!id) return null;
        const want = String(id);
        return findCellOnBoard(board, (c) => String(c?.instanceId || c?.id || '') === want);
    }
    function namesMatch(a, b) {
        return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    }
    function parseEvolutionFromLog(line) {
        const text = stripLogPrefix(line);
        const m = text.match(/^(.+?)\s+evolved\s+to\s+(.+?)!?$/i);
        if (!m) return null;
        return { from: m[1].trim(), to: m[2].trim() };
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
    function diffStatuses(prev, next, isPlayer) {
        const out = [];
        if (!next) return out;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const p = prev?.[r]?.[c];
                const n = next?.[r]?.[c];
                if (!n) continue;
                const pStatuses = new Set((p?.statuses || []).map((s) => String(s).toUpperCase()));
                const nStatuses = (n.statuses || []).map((s) => String(s).toUpperCase());
                for (const s of nStatuses) {
                    if (!pStatuses.has(s)) {
                        out.push({
                            isPlayer, row: r, col: c,
                            status: s,
                            name: n.name || '',
                            element: n.element,
                            instanceId: String(n.instanceId || n.id || '')
                        });
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
        const text = stripLogPrefix(line);
        let m = text.match(/^(.+?)\s+uses\s+(.+?)\.?$/i);
        if (m) return { kind: 'ABILITY', actor: m[1].trim(), name: m[2].trim() };
        m = text.match(/^(.+?)\s+plays\s+(.+?)\.?$/i);
        if (m) return { kind: 'PLAY', actor: m[1].trim(), name: m[2].trim() };
        m = text.match(/^(.+?)\s+activates\s+(.+?)\.?$/i);
        if (m) return { kind: 'ABILITY', actor: m[1].trim(), name: m[2].trim() };
        return null;
    }

    // "Fireball deals 5 damage to Sleaf" → { abilityOrSource, amount, target }
    // Server lines look like "Embers deals 3 damage to Pylme (HP: 10)" — the
    // trailing "(HP: N)" is informational and must not become part of the
    // target name or attribution against the board state will fail.
    function parseDamageFromLog(line) {
        const text = stripLogPrefix(line);
        const m = text.match(/^(.+?)\s+deals\s+(\d+)\s+damage\s+to\s+(.+?)(?:\s*\([^)]*\))?\.?$/i);
        if (!m) return null;
        return {
            abilityOrSource: m[1].trim(),
            amount: parseInt(m[2], 10),
            target: m[3].trim()
        };
    }

    // Resolve the attacker for a given damaged cell from the new log entries.
    // Returns { row, col, cell, isPlayer } or null when we can't decide.
    function resolveAttackerFromLogs(prevPlayer, prevEnemy, damagedCell, newLogs, preferredSourceIsPlayer = null) {
        const wantedTarget = String(damagedCell?.name || '').trim().toLowerCase();
        if (!wantedTarget) return null;
        const preferPlayer = preferredSourceIsPlayer === true;
        const preferEnemy = preferredSourceIsPlayer === false;
        const findDirectSource = (name) => {
            const preferred = preferPlayer
                ? findCellByName(prevPlayer, name)
                : preferEnemy
                    ? findCellByName(prevEnemy, name)
                    : null;
            if (preferred) return { ...preferred, isPlayer: preferPlayer };
            const other = preferPlayer
                ? findCellByName(prevEnemy, name)
                : preferEnemy
                    ? findCellByName(prevPlayer, name)
                    : null;
            if (other) return { ...other, isPlayer: !preferPlayer };
            const directPlayer = findCellByName(prevPlayer, name);
            if (directPlayer) return { ...directPlayer, isPlayer: true };
            const directEnemy = findCellByName(prevEnemy, name);
            if (directEnemy) return { ...directEnemy, isPlayer: false };
            return null;
        };
        const findAbilitySource = (abilityName) => {
            const preferred = preferPlayer
                ? findCellByAbilityName(prevPlayer, abilityName)
                : preferEnemy
                    ? findCellByAbilityName(prevEnemy, abilityName)
                    : null;
            if (preferred) return { ...preferred, isPlayer: preferPlayer };
            const other = preferPlayer
                ? findCellByAbilityName(prevEnemy, abilityName)
                : preferEnemy
                    ? findCellByAbilityName(prevPlayer, abilityName)
                    : null;
            if (other) return { ...other, isPlayer: !preferPlayer };
            const directPlayer = findCellByAbilityName(prevPlayer, abilityName);
            if (directPlayer) return { ...directPlayer, isPlayer: true };
            const directEnemy = findCellByAbilityName(prevEnemy, abilityName);
            if (directEnemy) return { ...directEnemy, isPlayer: false };
            return null;
        };
        for (const line of newLogs) {
            const m = parseDamageFromLog(line);
            if (!m) continue;
            if (m.target.toLowerCase() !== wantedTarget) continue;
            // Find who used the ability whose name is m.abilityOrSource.
            for (const usesLine of newLogs) {
                const u = parseAbilityFromLog(usesLine);
                if (!u || u.kind !== 'ABILITY') continue;
                if (u.name.toLowerCase() !== m.abilityOrSource.toLowerCase()) continue;
                const byActor = findDirectSource(u.actor);
                if (byActor) return byActor;
            }
            // Fallback: the "ability" name may itself be the card name.
            const byDirectName = findDirectSource(m.abilityOrSource);
            if (byDirectName) return byDirectName;
            const byAbilityName = findAbilitySource(m.abilityOrSource);
            if (byAbilityName) return byAbilityName;
        }
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
            // Map<key, { isPlayer, row, col, instanceId }> — placements
            // waiting on their PLAY action. Each entry's matching board card
            // is held invisible until the queue actually plays that PLAY, so
            // the player can't see new cards appear before earlier battle
            // animations finish.
            this.pendingPlacements = new Map();
            this._pendingSyncScheduled = false;
            this._loadSpeed();
            this._installPlacementObserver();
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
            this.revealAllPendingPlacements();
        }

        // ── Pending-placement registry ────────────────────────────────────
        _placementKey(isPlayer, row, col, instanceId) {
            return `${isPlayer ? 'P' : 'E'}:${row}:${col}:${instanceId || ''}`;
        }
        registerPendingPlacement(isPlayer, row, col, cell) {
            const id = String(cell?.instanceId || cell?.id || '');
            const key = this._placementKey(isPlayer, row, col, id);
            this.pendingPlacements.set(key, { isPlayer, row, col, instanceId: id });
            this.schedulePendingSync();
            return key;
        }
        revealPendingPlacement(key) {
            const entry = this.pendingPlacements.get(key);
            if (!entry) return null;
            this.pendingPlacements.delete(key);
            const cellEl = findCellEl(entry.isPlayer, entry.row, entry.col);
            const card = cellEl?.querySelector('.board-card');
            if (card) {
                card.style.removeProperty('visibility');
                card.style.removeProperty('opacity');
            }
            return cellEl;
        }
        revealAllPendingPlacements() {
            for (const key of Array.from(this.pendingPlacements.keys())) {
                this.revealPendingPlacement(key);
            }
        }
        schedulePendingSync() {
            if (this._pendingSyncScheduled) return;
            this._pendingSyncScheduled = true;
            requestAnimationFrame(() => {
                this._pendingSyncScheduled = false;
                this.syncPendingPlacements();
            });
        }
        syncPendingPlacements() {
            // For every still-pending placement, re-apply the hidden style on
            // its board-card. We re-apply (rather than rely on a CSS class)
            // because game.js's render() rebuilds the cell innerHTML on each
            // state change and would strip any classes we added previously.
            for (const entry of this.pendingPlacements.values()) {
                const cellEl = findCellEl(entry.isPlayer, entry.row, entry.col);
                const card = cellEl?.querySelector('.board-card');
                if (card && card.style.visibility !== 'hidden') {
                    card.style.visibility = 'hidden';
                    card.style.opacity = '0';
                }
            }
        }
        _installPlacementObserver() {
            // Re-apply hidden state whenever the board grids are re-rendered.
            const attach = () => {
                const grids = [document.getElementById('playerGrid'), document.getElementById('enemyGrid')]
                    .filter(Boolean);
                if (!grids.length) return false;
                for (const grid of grids) {
                    if (grid.__sglObserved) continue;
                    grid.__sglObserved = true;
                    const obs = new MutationObserver(() => this.schedulePendingSync());
                    obs.observe(grid, { childList: true, subtree: true });
                }
                return true;
            };
            if (!attach()) {
                document.addEventListener('DOMContentLoaded', attach);
            }
        }

        // ── Health-bar helpers (for direct-attack animations) ──────────────
        _getHealthBarEl(isPlayer) {
            const desktop = document.querySelector(isPlayer ? '.tb-hp-player' : '.tb-hp-enemy');
            if (desktop && desktop.offsetParent !== null) return desktop;
            const mobile = document.querySelector(isPlayer ? '.mobile-hud-player' : '.mobile-hud-enemy');
            if (mobile && mobile.offsetParent !== null) return mobile;
            return desktop || mobile || null;
        }
        _getHealthBarCenter(isPlayer) {
            const el = this._getHealthBarEl(isPlayer);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        _flashHealthBar(isPlayer, elementHexValue) {
            const el = this._getHealthBarEl(isPlayer);
            if (!el) return;
            el.style.setProperty('--sgl-hp-impact', elementHexValue || ELEMENT_HEX.NEUTRAL);
            el.classList.add('sgl-hp-impact');
            setTimeout(() => el.classList.remove('sgl-hp-impact'), 720);
        }

        enqueueAction(action) {
            if (!action) return;
            this.queue.push(action);
            this._kick();
        }

        enqueueFromStateDiff(prevState, nextState) {
            if (!prevState || !nextState) return;
            // Treat each diff batch as one logical "turn step" for pacing
            // purposes: the first placement in this batch waits the longer
            // settle gap, subsequent placements use the tighter rhythm.
            this._placementInProgress = false;
            const prevPlayer = prevState.playerBoard || prevState.player?.board;
            const prevEnemy  = prevState.enemyBoard  || prevState.enemy?.board;
            const nextPlayer = nextState.playerBoard || nextState.player?.board;
            const nextEnemy  = nextState.enemyBoard  || nextState.enemy?.board;

            const playerKnight = getKnightElement(nextState, 'PLAYER');
            const enemyKnight  = getKnightElement(nextState, 'ENEMY');
            const playerName   = nextState.playerName || prevState.playerName || 'Player';
            const enemyName    = nextState.enemyName  || prevState.enemyName  || 'Opponent';
            const newLogs      = getNewLogEntries(prevState, nextState);

            // A state diff can span a whole battle resolution + the next phase's
            // placements (e.g. player commits attack → server resolves battle →
            // advances phase → AI plays cards → returns one combined state).
            // To keep the BATTLE phase "one solid phase" we enqueue actions in
            // their real temporal order:
            //   1. damage / destruction / ability lines from the just-ended
            //      phase, tightly paced
            //   2. the PHASE transition toast
            //   3. new-phase placements, individually paced (2s before the
            //      first, 1s before each subsequent one) so the player can
            //      register each placement as the AI makes it
            const phaseChanged = prevState.currentPhase && nextState.currentPhase
                && prevState.currentPhase !== nextState.currentPhase;
            const setupToBattle = phaseChanged
                && prevState.currentPhase === 'SETUP'
                && nextState.currentPhase === 'BATTLE';

            // Opponent turn beginning → thinking indicator
            if (prevState.activeSide !== 'ENEMY' && nextState.activeSide === 'ENEMY' && !nextState.gameOver) {
                this.markOpponentThinking(true, nextState);
            }

            // Collect placements and damage now but enqueue them in the right
            // order at the end of this method.
            const evolutionLogs = newLogs.map(parseEvolutionFromLog).filter(Boolean);
            const tagEvolutionPlacements = (placements, prevBoard) => placements.map((p) => {
                const previousCell = prevBoard?.[p.row]?.[p.col];
                if (!previousCell) return p;
                const loggedEvolution = evolutionLogs.find((e) =>
                    namesMatch(e.from, previousCell.name) && namesMatch(e.to, p.cell?.name)
                );
                return loggedEvolution ? { ...p, evolutionFrom: previousCell } : p;
            });
            const newPlayerPlacements = tagEvolutionPlacements(diffPlacements(prevPlayer, nextPlayer, true), prevPlayer);
            const newEnemyPlacements  = tagEvolutionPlacements(diffPlacements(prevEnemy,  nextEnemy,  false), prevEnemy);

            // Damage events (attacks / abilities that hit)
            const damageOnPlayer = diffDamage(prevPlayer, nextPlayer, true);
            const damageOnEnemy  = diffDamage(prevEnemy,  nextEnemy,  false);

            // Destruction events (cards that no longer exist). Paired with attacks
            // below so the killed card stays visible until the projectile lands.
            const isEvolutionDestruction = (d, placements) => placements.some((p) =>
                p.evolutionFrom
                && p.row === d.row
                && p.col === d.col
                && namesMatch(p.evolutionFrom.name, d.name)
            );
            const destructionsOnPlayer = diffDestructions(prevPlayer, nextPlayer, true)
                .filter((d) => !isEvolutionDestruction(d, newPlayerPlacements));
            const destructionsOnEnemy  = diffDestructions(prevEnemy,  nextEnemy,  false)
                .filter((d) => !isEvolutionDestruction(d, newEnemyPlacements));
            const matchDestruction = (list, t) => {
                const idx = list.findIndex((d) =>
                    d.row === t.row && d.col === t.col
                    && (!t.instanceId || !d.instanceId || d.instanceId === t.instanceId)
                );
                if (idx === -1) return null;
                return list.splice(idx, 1)[0];
            };

            // Resolve the source of a damage event. Order of preference:
            //   1. prevState.pendingBattle (the player-confirmed attacker)
            //   2. Log lines like "X uses Y" + "Y deals N damage to TARGET"
            //   3. Direct "<CardName> deals N damage to TARGET" lines
            // We deliberately do NOT fall back to "first cell on board" — that
            // mis-pinned every effect-damage event onto whatever Siegling
            // happened to be in row 0 / col 0 (e.g. Emberfin) and caused the
            // "Emberfin attacks Sleaf" phantom toasts from the bug report.
            const resolvePlayerSource = (t) => {
                const pending = prevState.pendingBattle;
                if (pending) {
                    const byId = findCellByInstanceId(prevPlayer, pending.instanceId);
                    if (byId) return { ...byId, isPlayer: true, pending };
                    if (pending.row != null && pending.col != null) {
                        const cell = prevPlayer?.[pending.row]?.[pending.col];
                        if (cell) return { row: pending.row, col: pending.col, cell, isPlayer: true, pending };
                    }
                }
                const fromLogs = resolveAttackerFromLogs(prevPlayer, prevEnemy, t, newLogs, true);
                if (fromLogs && fromLogs.isPlayer) return fromLogs;
                return null;
            };
            const resolveEnemySource = (t) => {
                const fromLogs = resolveAttackerFromLogs(prevPlayer, prevEnemy, t, newLogs, false);
                if (fromLogs && !fromLogs.isPlayer) return fromLogs;
                return null;
            };

            // Battle-phase pacing: damage, destruction and ability animations
            // fire back-to-back as one solid block.
            const BATTLE_GAP_MS  = 220;
            const PHASE_GAP_MS   = 360;
            const FIRST_PLAY_GAP = this.speed === 'fast' ? 120 : 360;
            const NEXT_PLAY_GAP  = this.speed === 'fast' ? 80 : 160;
            let phaseTransitionQueued = false;

            // Multi-target label helper. Server damage events from the same
            // attacker (e.g. AoE abilities, row sweeps) get grouped into a
            // single ATTACK action whose toast announces the whole row /
            // whole side rather than one of the hit cards.
            const ROW_LABELS = ['Back', 'Middle', 'Front'];
            const describeTargets = (targets, defenderLabel) => {
                if (!targets || !targets.length) return '';
                if (targets.length === 1) return targets[0].name || defenderLabel;
                const rows = new Set(targets.map((tt) => tt.row));
                const cols = new Set(targets.map((tt) => tt.col));
                if (rows.size === 1) {
                    const rowName = ROW_LABELS[targets[0].row] || 'Row';
                    return `${rowName} row`;
                }
                if (cols.size === 1) {
                    return `Column ${targets[0].col + 1}`;
                }
                if (targets.length >= 3) return `All ${defenderLabel}`;
                return `${targets.length} ${defenderLabel}`;
            };

            const enqueuePlacementAction = (p, side, knight, actorName) => {
                const isFirst = !this._placementInProgress;
                this._placementInProgress = true;
                const placementIsPlayer = side === 'PLAYER';
                const isEvolution = Boolean(p.evolutionFrom);
                this.enqueueAction({
                    kind: 'PLAY',
                    side,
                    actorName: isEvolution ? p.evolutionFrom.name : actorName,
                    label: isEvolution ? 'evolved to' : undefined,
                    targetName: p.cell.name || 'Card',
                    knightElement: knight,
                    elementColor: normalizeElement(p.cell.element) || knight,
                    source: { isPlayer: placementIsPlayer, row: p.row, col: p.col },
                    portraitHtml: `<span class="sgl-toast-sigil">${elementSigil(p.cell.element)}</span>`,
                    gapAfterMs: isFirst ? FIRST_PLAY_GAP : NEXT_PLAY_GAP
                });
            };

            const enqueuePhaseTransitionAction = () => {
                if (!phaseChanged || phaseTransitionQueued) return;
                phaseTransitionQueued = true;
                const phaseLabel = String(nextState.currentPhase).charAt(0)
                    + String(nextState.currentPhase).slice(1).toLowerCase();
                this.enqueueAction({
                    kind: 'PHASE',
                    side: nextState.activeSide || 'PLAYER',
                    actorName: `${phaseLabel} Phase`,
                    knightElement: nextState.activeSide === 'ENEMY' ? enemyKnight : playerKnight,
                    elementColor: 'NEUTRAL',
                    holdMs: this.timings().toastDismissMs,
                    gapAfterMs: PHASE_GAP_MS
                });
            };

            if (setupToBattle) {
                for (const p of newPlayerPlacements) enqueuePlacementAction(p, 'PLAYER', playerKnight, playerName);
                for (const p of newEnemyPlacements)  enqueuePlacementAction(p, 'ENEMY',  enemyKnight,  enemyName);
                newPlayerPlacements.length = 0;
                newEnemyPlacements.length = 0;
                enqueuePhaseTransitionAction();
            }

            // Group damage events by attacker cell. Same-source hits become
            // one ATTACK action with a targets array so the projectiles fire
            // simultaneously and the toast describes the group.
            const groupDamage = (damageList, destructionList, resolveSource, sideKnight, defenderIsPlayer) => {
                const groups = new Map();
                for (const t of damageList) {
                    const srcRef = resolveSource(t);
                    const destroyed = matchDestruction(destructionList, t);
                    const targetEntry = {
                        isPlayer: defenderIsPlayer,
                        row: t.row, col: t.col,
                        amount: t.amount,
                        element: t.element,
                        name: t.name,
                        destroysTarget: !!destroyed,
                        ghostCell: destroyed?.cell || null
                    };
                    const srcElement = normalizeElement(srcRef?.pending?.element || srcRef?.cell?.element) || sideKnight;
                    const key = srcRef
                        ? `S:${srcRef.row}:${srcRef.col}:${srcRef.cell?.instanceId || srcRef.cell?.id || ''}`
                        : `N:${t.row}:${t.col}:${t.instanceId || ''}`;
                    if (!groups.has(key)) {
                        groups.set(key, { srcRef, srcElement, targets: [] });
                    }
                    groups.get(key).targets.push(targetEntry);
                }
                return groups;
            };

            const playerGroups = groupDamage(damageOnEnemy, destructionsOnEnemy, resolvePlayerSource, playerKnight, false);
            const enemyGroups  = groupDamage(damageOnPlayer, destructionsOnPlayer, resolveEnemySource, enemyKnight,  true);

            // Status events (e.g. Freeze applied to a card without damage).
            // Merge into an existing same-source damage group when the target
            // cell already takes damage from that attacker, otherwise create a
            // new group so the queue still fires a projectile and animates
            // the status landing.
            const newStatusesOnEnemy  = diffStatuses(prevEnemy,  nextEnemy,  false);
            const newStatusesOnPlayer = diffStatuses(prevPlayer, nextPlayer, true);
            const mergeStatusInto = (groups, statusList, resolveSource, sideKnight, defenderIsPlayer) => {
                for (const s of statusList) {
                    let merged = false;
                    for (const group of groups.values()) {
                        const existing = group.targets.find((tt) =>
                            tt.row === s.row && tt.col === s.col && tt.isPlayer === defenderIsPlayer
                        );
                        if (existing) {
                            existing.statuses = existing.statuses || [];
                            if (!existing.statuses.includes(s.status)) existing.statuses.push(s.status);
                            merged = true;
                            break;
                        }
                    }
                    if (merged) continue;
                    // Standalone status: need to resolve a source and add a
                    // new group (or attach to an empty source-keyed bucket
                    // so multiple statuses from one attacker still group).
                    const srcRef = resolveSource({
                        name: s.name, row: s.row, col: s.col,
                        instanceId: s.instanceId
                    });
                    const srcElement = normalizeElement(srcRef?.pending?.element || srcRef?.cell?.element) || sideKnight;
                    const key = srcRef
                        ? `S:${srcRef.row}:${srcRef.col}:${srcRef.cell?.instanceId || srcRef.cell?.id || ''}`
                        : `N:status:${s.row}:${s.col}:${s.instanceId || ''}`;
                    if (!groups.has(key)) {
                        groups.set(key, { srcRef, srcElement, targets: [] });
                    }
                    const bucket = groups.get(key);
                    let existingTarget = bucket.targets.find((tt) =>
                        tt.row === s.row && tt.col === s.col && tt.isPlayer === defenderIsPlayer
                    );
                    if (!existingTarget) {
                        existingTarget = {
                            isPlayer: defenderIsPlayer,
                            row: s.row, col: s.col,
                            amount: 0,
                            element: s.element,
                            name: s.name,
                            destroysTarget: false,
                            ghostCell: null,
                            statuses: []
                        };
                        bucket.targets.push(existingTarget);
                    }
                    existingTarget.statuses = existingTarget.statuses || [];
                    if (!existingTarget.statuses.includes(s.status)) {
                        existingTarget.statuses.push(s.status);
                    }
                }
            };
            mergeStatusInto(playerGroups, newStatusesOnEnemy,  resolvePlayerSource, playerKnight, false);
            mergeStatusInto(enemyGroups,  newStatusesOnPlayer, resolveEnemySource,  enemyKnight,  true);

            // Track attacker names that already have an ATTACK action queued
            // so we can suppress the matching "X uses Y" ABILITY toast.
            const enqueuedAttackerNames = new Set();

            const enqueueAttackGroup = (group, side, knight, defaultActorName, defenderLabel) => {
                const { srcRef, srcElement, targets } = group;
                if (!targets.length) return;
                const actorName = srcRef?.cell?.name || srcRef?.pending?.name || defaultActorName;
                if (actorName) enqueuedAttackerNames.add(actorName);
                if (targets.length === 1) {
                    const t = targets[0];
                    this.enqueueAction({
                        kind: 'ATTACK',
                        side,
                        actorName,
                        targetName: t.name,
                        amount: t.amount,
                        knightElement: knight,
                        elementColor: srcElement,
                        source: srcRef ? { isPlayer: side === 'PLAYER', row: srcRef.row, col: srcRef.col } : null,
                        target: { isPlayer: t.isPlayer, row: t.row, col: t.col, element: t.element || srcElement },
                        destroysTarget: t.destroysTarget,
                        ghostCell: t.ghostCell,
                        statuses: t.statuses && t.statuses.length ? t.statuses.slice() : null,
                        gapAfterMs: BATTLE_GAP_MS
                    });
                    return;
                }
                // Multi-target: simultaneous barrage
                const totalDmg = targets.reduce((sum, tt) => sum + (Number(tt.amount) || 0), 0);
                this.enqueueAction({
                    kind: 'ATTACK',
                    side,
                    actorName,
                    targetName: describeTargets(targets, defenderLabel),
                    amount: totalDmg,
                    knightElement: knight,
                    elementColor: srcElement,
                    source: srcRef ? { isPlayer: side === 'PLAYER', row: srcRef.row, col: srcRef.col } : null,
                    targets: targets.map((tt) => ({
                        isPlayer: tt.isPlayer, row: tt.row, col: tt.col,
                        element: tt.element || srcElement,
                        amount: tt.amount,
                        destroysTarget: tt.destroysTarget,
                        ghostCell: tt.ghostCell,
                        statuses: tt.statuses && tt.statuses.length ? tt.statuses.slice() : null
                    })),
                    gapAfterMs: BATTLE_GAP_MS
                });
            };

            for (const group of playerGroups.values()) enqueueAttackGroup(group, 'PLAYER', playerKnight, playerName, 'enemies');
            for (const group of enemyGroups.values())  enqueueAttackGroup(group, 'ENEMY',  enemyKnight,  enemyName,  'allies');

            // Unpaired destructions (e.g. effect damage, end-of-turn cleanup) →
            // standalone DESTROY action that shows a ghost + fade-out.
            const queueDestruction = (d, side, knight) => {
                const el = normalizeElement(d.cell?.element) || knight;
                this.enqueueAction({
                    kind: 'DESTROY',
                    side,
                    actorName: d.name || 'Card',
                    targetName: '',
                    knightElement: knight,
                    elementColor: el,
                    source: { isPlayer: d.isPlayer, row: d.row, col: d.col },
                    target: { isPlayer: d.isPlayer, row: d.row, col: d.col, element: el },
                    ghostCell: d.cell,
                    gapAfterMs: BATTLE_GAP_MS
                });
            };
            for (const d of destructionsOnPlayer) queueDestruction(d, 'ENEMY', enemyKnight);
            for (const d of destructionsOnEnemy)  queueDestruction(d, 'PLAYER', playerKnight);

            // Ability/use lines from the log → ABILITY toasts (skip ones already
            // covered by a queued ATTACK from the same attacker).
            for (const line of newLogs) {
                const parsed = parseAbilityFromLog(line);
                if (!parsed) continue;
                if (parsed.kind === 'ABILITY') {
                    if (enqueuedAttackerNames.has(parsed.actor)) continue;
                    const playerHit = findCellByName(prevPlayer, parsed.actor) || findCellByName(nextPlayer, parsed.actor);
                    const enemyHit  = findCellByName(prevEnemy,  parsed.actor) || findCellByName(nextEnemy,  parsed.actor);
                    const source = playerHit ? { isPlayer: true, row: playerHit.row, col: playerHit.col, cell: playerHit.cell }
                                 : enemyHit  ? { isPlayer: false, row: enemyHit.row,  col: enemyHit.col,  cell: enemyHit.cell }
                                 : null;
                    if (!source) continue;
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
                        gapAfterMs: BATTLE_GAP_MS
                    });
                }
            }

            // Phase change toast — appended AFTER the just-ended phase's
            // animations and BEFORE the new phase's placements, so the toast
            // marks the boundary between the two blocks the player sees.
            enqueuePhaseTransitionAction();

            // Placements last — individually paced so the player can see each
            // AI Siegling appear before the next one arrives. First placement
            // in this batch gets the longer "settle" gap, subsequent ones
            // step on a tighter beat.
            const enqueuePlacement = (p, side, knight, actorName) => {
                enqueuePlacementAction(p, side, knight, actorName);
            };
            for (const p of newPlayerPlacements) enqueuePlacement(p, 'PLAYER', playerKnight, playerName);
            for (const p of newEnemyPlacements)  enqueuePlacement(p, 'ENEMY',  enemyKnight,  enemyName);

            // Direct health-bar damage (attacker hits the enemy player when
            // the enemy board is empty, or vice versa). Treated as an ATTACK
            // whose target is the HP bar in the top HUD.
            const prevPlayerHp = Number(prevState.player?.health ?? prevState.playerHealth);
            const nextPlayerHp = Number(nextState.player?.health ?? nextState.playerHealth);
            const prevEnemyHp  = Number(prevState.enemy?.health  ?? prevState.enemyHealth);
            const nextEnemyHp  = Number(nextState.enemy?.health  ?? nextState.enemyHealth);

            if (Number.isFinite(prevEnemyHp) && Number.isFinite(nextEnemyHp) && nextEnemyHp < prevEnemyHp) {
                const dmg = prevEnemyHp - nextEnemyHp;
                const srcRef = (() => {
                    const pending = prevState.pendingBattle;
                    if (pending) {
                        const byId = findCellByInstanceId(prevPlayer, pending.instanceId);
                        if (byId) return { ...byId, isPlayer: true, pending };
                    }
                    return findCellOnBoard(prevPlayer, () => true);
                })();
                const srcElement = normalizeElement(srcRef?.pending?.element || srcRef?.cell?.element) || playerKnight;
                this.enqueueAction({
                    kind: 'ATTACK',
                    side: 'PLAYER',
                    actorName: srcRef?.cell?.name || srcRef?.pending?.name || playerName,
                    targetName: enemyName,
                    amount: dmg,
                    knightElement: playerKnight,
                    elementColor: srcElement,
                    source: srcRef ? { isPlayer: true, row: srcRef.row, col: srcRef.col } : null,
                    target: { healthBar: true, isPlayer: false, element: srcElement },
                    gapAfterMs: BATTLE_GAP_MS
                });
            }
            if (Number.isFinite(prevPlayerHp) && Number.isFinite(nextPlayerHp) && nextPlayerHp < prevPlayerHp) {
                const dmg = prevPlayerHp - nextPlayerHp;
                const srcRef = findCellOnBoard(prevEnemy, () => true);
                const srcElement = normalizeElement(srcRef?.cell?.element) || enemyKnight;
                this.enqueueAction({
                    kind: 'ATTACK',
                    side: 'ENEMY',
                    actorName: srcRef?.cell?.name || enemyName,
                    targetName: playerName,
                    amount: dmg,
                    knightElement: enemyKnight,
                    elementColor: srcElement,
                    source: srcRef ? { isPlayer: false, row: srcRef.row, col: srcRef.col } : null,
                    target: { healthBar: true, isPlayer: true, element: srcElement },
                    gapAfterMs: BATTLE_GAP_MS
                });
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
                // Defensive: never leave a card permanently hidden because no
                // PLAY action was queued for it.
                this.revealAllPendingPlacements();
                if (typeof window.scheduleBattleAutoAdvance === 'function') {
                    window.scheduleBattleAutoAdvance();
                }
            }
        }

        async _playAction(action) {
            const t = this.timings();
            const knight = elementHex(action.knightElement);
            const elColor = elementHex(action.elementColor || action.knightElement);

            // Re-apply hidden state for any placements still pending. Covers
            // the case where game.js's render rebuilt the cell DOM while we
            // were processing a previous action.
            this.syncPendingPlacements();

            if (action.kind === 'PHASE') {
                this.activeToast = this.toasts.show({
                    ...action,
                    label: '',
                    actorName: action.actorName,
                    targetName: ''
                }, t.toastDismissMs);
                const phaseGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(t.toastEnterMs + phaseGap);
                return;
            }

            // PLAY: reveal the held card before the pulse so the entrance
            // animation has something to animate against.
            if (action.kind === 'PLAY' && action.placementKey) {
                this.revealPendingPlacement(action.placementKey);
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

            // 2a. Multi-target ATTACK — all projectiles fire simultaneously
            // (no stagger). One coordinated impact + camera shake + per-target
            // damage floater after the projectile duration.
            if (action.kind === 'ATTACK' && Array.isArray(action.targets) && action.targets.length > 1
                && action.source && window.SieglingsFx?.attackCell) {
                const ghosts = [];
                for (const tgt of action.targets) {
                    if (tgt.destroysTarget && tgt.ghostCell) {
                        const g = spawnGhost(
                            tgt.isPlayer, tgt.row, tgt.col,
                            tgt.ghostCell, knight, elementHex(tgt.element)
                        );
                        if (g) ghosts.push({ ghost: g, target: tgt });
                    }
                }
                for (const tgt of action.targets) {
                    window.SieglingsFx.attackCell(
                        action.source.isPlayer, action.source.row, action.source.col,
                        tgt.isPlayer, tgt.row, tgt.col,
                        tgt.element || action.elementColor || action.knightElement,
                        { duration: t.projectileMs }
                    );
                }
                await sleep(t.projectileMs);

                for (const tgt of action.targets) {
                    const ghostEntry = ghosts.find((g) => g.target === tgt);
                    const tgtColor = elementHex(tgt.element || action.elementColor || action.knightElement);
                    if (ghostEntry) {
                        ghostEntry.ghost.classList.add('sgl-ghost-impact');
                        setTimeout(() => ghostEntry.ghost.classList.remove('sgl-ghost-impact'), 320);
                    } else {
                        flashImpact(tgt.isPlayer, tgt.row, tgt.col, tgtColor);
                    }
                    if (tgt.amount && window.SieglingsFx?.floatingDamage) {
                        window.SieglingsFx.floatingDamage(
                            tgt.isPlayer, tgt.row, tgt.col,
                            tgt.amount,
                            tgt.element || action.elementColor || action.knightElement
                        );
                    }
                    if (tgt.statuses && tgt.statuses.length) {
                        for (const status of tgt.statuses) {
                            applyStatusVisual(tgt.isPlayer, tgt.row, tgt.col, status);
                        }
                    }
                }
                if (window.SieglingsFx?.cameraShake) {
                    const shake = Math.min(16, 6 + Math.round((action.amount || 0) * 0.35));
                    window.SieglingsFx.cameraShake(shake, t.impactMs);
                }
                await sleep(t.impactMs);

                if (ghosts.length) {
                    await Promise.all(ghosts.map(
                        (g) => destroyGhost(g.ghost, elementHex(g.target.element), 520)
                    ));
                }
                const multiGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(multiGap);
                return;
            }

            // 2b. Direct attack on the enemy/player HP bar — no cell target,
            // so we fire the projectile to the bar's screen coordinates and
            // shake/flash the bar on impact.
            if (action.kind === 'ATTACK' && action.source && action.target?.healthBar
                && window.SieglingsFx?.attackPoint) {
                const barCenter = this._getHealthBarCenter(action.target.isPlayer);
                if (barCenter) {
                    window.SieglingsFx.attackPoint(
                        action.source.isPlayer, action.source.row, action.source.col,
                        barCenter.x, barCenter.y,
                        action.elementColor || action.knightElement,
                        { duration: t.projectileMs }
                    );
                    await sleep(t.projectileMs);
                    this._flashHealthBar(action.target.isPlayer, elColor);
                    if (window.SieglingsFx?.impactAtPoint) {
                        window.SieglingsFx.impactAtPoint(
                            barCenter.x, barCenter.y,
                            action.elementColor || action.knightElement
                        );
                    }
                    if (action.amount && window.SieglingsFx?.floatingText) {
                        window.SieglingsFx.floatingText(
                            barCenter.x, barCenter.y - 18,
                            `-${action.amount}`, elColor, 32
                        );
                    }
                    if (window.SieglingsFx?.cameraShake) {
                        const shake = Math.min(14, 4 + Math.round((action.amount || 0) * 0.7));
                        window.SieglingsFx.cameraShake(shake, t.impactMs);
                    }
                    await sleep(t.impactMs);
                    const gap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                    await sleep(gap);
                    return;
                }
            }

            // 3. Projectile + impact for attack-like actions
            const fireProjectile = action.kind === 'ATTACK' && action.source && action.target
                && !action.target.healthBar && window.SieglingsFx?.attackCell;
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
                if (action.statuses && action.statuses.length) {
                    for (const status of action.statuses) {
                        applyStatusVisual(action.target.isPlayer, action.target.row, action.target.col, status);
                    }
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
            } else if (action.kind === 'ATTACK' && action.target?.healthBar) {
                // Sourceless health-bar damage — still flash the bar so the
                // player registers the hit.
                const barCenter = this._getHealthBarCenter(action.target.isPlayer);
                this._flashHealthBar(action.target.isPlayer, elColor);
                if (barCenter && window.SieglingsFx?.impactAtPoint) {
                    window.SieglingsFx.impactAtPoint(
                        barCenter.x, barCenter.y,
                        action.elementColor || action.knightElement
                    );
                }
                if (barCenter && action.amount && window.SieglingsFx?.floatingText) {
                    window.SieglingsFx.floatingText(
                        barCenter.x, barCenter.y - 18,
                        `-${action.amount}`, elColor, 30
                    );
                }
                if (window.SieglingsFx?.cameraShake) {
                    const shake = Math.min(10, 3 + Math.round((action.amount || 0) * 0.5));
                    window.SieglingsFx.cameraShake(shake, t.impactMs);
                }
                await sleep(t.impactMs);
                const gap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(gap);
                return;
            } else if (action.kind === 'ATTACK' && action.target) {
                // Damage event without an identified source (effect tick,
                // counterattack, etc.). Still show impact + ghost + floater so
                // the player sees the consequence.
                let ghost = null;
                if (action.destroysTarget && action.ghostCell) {
                    ghost = spawnGhost(
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.ghostCell, knight, elColor
                    );
                }
                if (window.SieglingsFx?.impactAt) {
                    window.SieglingsFx.impactAt(
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.elementColor || action.knightElement
                    );
                }
                if (ghost) {
                    ghost.classList.add('sgl-ghost-impact');
                    setTimeout(() => ghost.classList.remove('sgl-ghost-impact'), 320);
                } else {
                    flashImpact(action.target.isPlayer, action.target.row, action.target.col, elColor);
                }
                if (action.amount && window.SieglingsFx?.floatingDamage) {
                    window.SieglingsFx.floatingDamage(
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.amount, action.elementColor || action.knightElement
                    );
                }
                if (action.statuses && action.statuses.length) {
                    for (const status of action.statuses) {
                        applyStatusVisual(action.target.isPlayer, action.target.row, action.target.col, status);
                    }
                }
                if (window.SieglingsFx?.cameraShake) {
                    const shake = Math.min(10, 3 + Math.round((action.amount || 0) * 0.5));
                    window.SieglingsFx.cameraShake(shake, t.impactMs);
                }
                await sleep(t.impactMs);
                if (ghost) await destroyGhost(ghost, elColor, 520);
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

            // 5. Inter-action gap. Each action may carry its own
            // gapAfterMs (battle actions tight, placements long, phase
            // transitions medium); fall back to the speed-tier default.
            const gap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
            await sleep(gap);
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
        markOpponentThinking: (a, s) => queue.markOpponentThinking(a, s),
        syncPendingPlacements: () => queue.syncPendingPlacements()
    };

    // Wrap game.js's global render() so we can hide pending placements in
    // the same synchronous task that builds the new board. Without this,
    // there's a one-frame window between render() rebuilding cells and the
    // post-render sync running, during which the browser can paint the
    // newly-placed AI cards before our pending-placement hide takes effect.
    function installRenderHook() {
        if (window.__sglRenderHookInstalled) return true;
        if (typeof window.render !== 'function') return false;
        const orig = window.render;
        window.render = function () {
            const result = orig.apply(this, arguments);
            try { queue.syncPendingPlacements(); } catch (_) {}
            return result;
        };
        window.__sglRenderHookInstalled = true;
        return true;
    }

    function init() {
        ensureSpeedToggle(queue);
        if (!installRenderHook()) {
            // game.js loads before this script per index.html ordering, but
            // be defensive: poll briefly in case load order changes.
            let attempts = 0;
            const timer = setInterval(() => {
                if (installRenderHook() || ++attempts > 20) clearInterval(timer);
            }, 100);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
