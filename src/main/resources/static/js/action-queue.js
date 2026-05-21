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
        HEAL:    'heals',
        SHIELD:  'shields',
        STATUS_APPLY: 'gains',
        BLOCK:   'blocks',
        EFFECT:  'effect',
        DESTROY: 'is destroyed',
        PHASE:   'phase'
    };

    // Friendly label for each status kind. Used in STATUS_APPLY toasts so
    // status-only events read as "Pylme gains Frozen" instead of dropping
    // into the misleading "Player attacks Pylme" path.
    const STATUS_DISPLAY = {
        FREEZE:       'Frozen',
        SPEED_ZERO:   'Stunned',
        WEAK:         'Weakened',
        STRONG:       'Strengthened',
        HEALTH_BOOST: 'Shield',
        DAMAGE_BOOST: 'Damage Boost',
        SPEED_BOOST:  'Speed Boost'
    };
    function formatStatusLabel(status) {
        const k = String(status || '').toUpperCase();
        if (STATUS_DISPLAY[k]) return STATUS_DISPLAY[k];
        return k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');
    }

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
            const subtitle = toast.subtitle ? `<div class="sgl-toast-sub">${escapeHtml(toast.subtitle)}</div>` : '';
            const portraitHtml = toast.portraitHtml || `<span class="sgl-toast-sigil">${elementSigil(toast.elementColor || toast.knightElement)}</span>`;

            // Default sign — heals and shields gain HP, everything else loses
            // it. Callers can override via toast.amountSign.
            const amountSign = toast.amountSign
                || (toast.kind === 'HEAL' || toast.kind === 'SHIELD' ? '+' : '-');

            // Split the damage chip so the player can see what was absorbed
            // by a shield versus what reached HP. When the queue passes both
            // shieldBroken and hpLoss, those win over the raw amount.
            const shieldBroken = Number(toast.shieldBroken) || 0;
            const hpLoss = Number(toast.hpLoss);
            const hasSplit = Number.isFinite(hpLoss) || shieldBroken > 0;
            const visibleDamage = hasSplit
                ? (Number.isFinite(hpLoss) ? hpLoss : (toast.amount - shieldBroken))
                : (Number(toast.amount) || 0);
            const shieldPart = shieldBroken > 0
                ? `<span class="sgl-toast-shield" title="Shield absorbed ${shieldBroken}">`
                    + `<svg viewBox="0 0 16 16" aria-hidden="true">`
                    + `<path d="M8 1 L14 3.4 V8 C14 11.5 11 13.7 8 15 C5 13.7 2 11.5 2 8 V3.4 Z" `
                    + `fill="currentColor" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/>`
                    + `</svg>-${shieldBroken}</span>`
                : '';
            const damagePart = (visibleDamage > 0)
                ? `<span class="sgl-toast-damage" style="color:${elHex}">${escapeHtml(amountSign)}${visibleDamage}</span>`
                : '';

            node.innerHTML = `
                <div class="sgl-toast-portrait">${portraitHtml}</div>
                <div class="sgl-toast-body">
                    <div class="sgl-toast-line">
                        <span class="sgl-toast-actor">${escapeHtml(toast.actorName || '')}</span>
                        <span class="sgl-toast-action">${escapeHtml(labelText)}</span>
                        <span class="sgl-toast-target">${escapeHtml(toast.targetName || '')}</span>
                        ${shieldPart}
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

    // Animate the right-most N shield plates on a board cell so the player
    // sees the absorb buffer chipping away as a hit lands. The plates are
    // rendered by game.js's render(); we just toggle the breaking class.
    // Re-renders triggered by the queue/state update will replace the DOM
    // with the new (smaller) plate count, picking up where this leaves off.
    function breakShieldPlates(isPlayer, row, col, count) {
        if (!count || count <= 0) return;
        const cellEl = findCellEl(isPlayer, row, col);
        if (!cellEl) return;
        const plates = cellEl.querySelectorAll('.shield-plates .shield-plate');
        if (!plates || !plates.length) return;
        const start = Math.max(0, plates.length - count);
        for (let i = start; i < plates.length; i++) {
            plates[i].classList.add('sgl-plate-breaking');
        }
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
        HEALTH_BOOST: { className: 'sgl-status-health-boost', element: 'METAL',    duration: 700  },
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

    // Spawn a glowing green "+" cross overlay with outward particles on a
    // board cell. Anchored as a fixed-position element so a re-render of
    // the cell's innerHTML won't destroy the animation.
    function spawnHealCross(isPlayer, row, col, durationMs) {
        const cellEl = findCellEl(isPlayer, row, col);
        if (!cellEl) return null;
        const rect = cellEl.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        const overlay = document.createElement('div');
        overlay.className = 'sgl-heal-cross';
        overlay.style.position = 'fixed';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        const PARTICLE_COUNT = 10;
        const particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.35;
            const distance = 32 + Math.random() * 28;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance - 12;
            const size = 6 + Math.random() * 5;
            const delay = Math.random() * 180;
            particles.push(
                `<span class="sgl-heal-particle"
                    style="left:50%;top:50%;width:${size}px;height:${size}px;
                           --p-dx:${dx.toFixed(1)}px;--p-dy:${dy.toFixed(1)}px;
                           animation-delay:${delay}ms"></span>`
            );
        }

        overlay.innerHTML = `
            <div class="sgl-heal-glow" aria-hidden="true"></div>
            <svg class="sgl-heal-icon" viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                    <linearGradient id="sgl-heal-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#ecffe8" />
                        <stop offset="55%" stop-color="#5eff8e" />
                        <stop offset="100%" stop-color="#1faa55" />
                    </linearGradient>
                </defs>
                <rect x="40" y="14" width="20" height="72" rx="6" fill="url(#sgl-heal-grad)" stroke="#ffffff" stroke-width="2" />
                <rect x="14" y="40" width="72" height="20" rx="6" fill="url(#sgl-heal-grad)" stroke="#ffffff" stroke-width="2" />
            </svg>
            ${particles.join('')}
        `;
        document.body.appendChild(overlay);

        const reposition = () => {
            const r = cellEl.getBoundingClientRect();
            if (!r) return;
            overlay.style.left = `${r.left}px`;
            overlay.style.top = `${r.top}px`;
            overlay.style.width = `${r.width}px`;
            overlay.style.height = `${r.height}px`;
        };
        window.addEventListener('resize', reposition);
        const scrollHandler = () => reposition();
        window.addEventListener('scroll', scrollHandler, true);

        const total = Math.max(900, durationMs || 1400);
        setTimeout(() => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', scrollHandler, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, total);
        return overlay;
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
        const m = text.match(/^(?:(.+?)\s+)?evolved\s+(.+?)\s+into\s+(.+?)[.!]?$/i);
        if (!m) return null;
        return { actor: (m[1] || '').trim(), from: m[2].trim(), to: m[3].trim() };
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
    function diffHealing(prev, next, isPlayer) {
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
                const prevMaxHp = Number(p.maxHp);
                const nextMaxHp = Number(n.maxHp);
                const shieldGained = Number.isFinite(prevMaxHp) && Number.isFinite(nextMaxHp) && nextMaxHp > prevMaxHp;
                if (same && nextHp > prevHp && !shieldGained) {
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: nextHp - prevHp,
                        element: normalizeElement(n.element || p.element),
                        name: n.name || p.name || '',
                        instanceId: String(n.instanceId || p.instanceId || n.id || p.id || '')
                    });
                }
            }
        }
        return out;
    }
    function diffShields(prev, next, isPlayer) {
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
                const prevMaxHp = Number(p.maxHp);
                const nextMaxHp = Number(n.maxHp);
                if (same && Number.isFinite(prevMaxHp) && Number.isFinite(nextMaxHp) && nextMaxHp > prevMaxHp) {
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: nextMaxHp - prevMaxHp,
                        element: normalizeElement(n.element || p.element),
                        name: n.name || p.name || '',
                        instanceId: String(n.instanceId || p.instanceId || n.id || p.id || '')
                    });
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
                    if (s === 'HEALTH_BOOST') {
                        continue;
                    }
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
                    // Split the hit into "shield absorbed" and "HP lost":
                    //   shield = max(0, hp - printedHealth)
                    // If the card was over its printed HP, that overflow is
                    // an absorb buffer the player should see called out as
                    // a shield break rather than rolled into the HP damage.
                    const printedHp = Number(p.printedHealth);
                    const ph = Number.isFinite(printedHp) ? printedHp : null;
                    const prevShield = ph != null ? Math.max(0, prevHp - ph) : 0;
                    const nextShield = ph != null ? Math.max(0, nextHp - ph) : 0;
                    const shieldBroken = Math.max(0, prevShield - nextShield);
                    const hpLoss = Math.max(0, (prevHp - nextHp) - shieldBroken);
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: prevHp - nextHp,
                        shieldBroken,
                        hpLoss,
                        shieldFullyBroken: prevShield > 0 && nextShield === 0,
                        element: normalizeElement(n.element || p.element),
                        name: n.name || p.name || '',
                        instanceId: String(n.instanceId || p.instanceId || n.id || p.id || ''),
                        prevHp,
                        nextHp,
                        prevMaxHp: p.maxHp,
                        nextMaxHp: n.maxHp,
                        printedHealth: n.printedHealth ?? p.printedHealth
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

    // Healing log shapes:
    //   "Cleansing Breath heals Sundile for 4 (HP: 12)"
    //   "Cleansing Breath restores 4 HP to Sundile"
    //   "Sundile is healed for 4"
    function parseHealFromLog(line) {
        const text = String(line || '').trim();
        let m = text.match(/^(.+?)\s+heals\s+(.+?)\s+(?:for|by)\s+(\d+)(?:\s*\([^)]*\))?\.?$/i);
        if (m) return { abilityOrSource: m[1].trim(), target: m[2].trim(), amount: parseInt(m[3], 10) };
        m = text.match(/^(.+?)\s+restores\s+(\d+)\s+HP\s+to\s+(.+?)(?:\s*\([^)]*\))?\.?$/i);
        if (m) return { abilityOrSource: m[1].trim(), target: m[3].trim(), amount: parseInt(m[2], 10) };
        m = text.match(/^(.+?)\s+is\s+healed\s+for\s+(\d+)(?:\s*\([^)]*\))?\.?$/i);
        if (m) return { abilityOrSource: '', target: m[1].trim(), amount: parseInt(m[2], 10) };
        return null;
    }

    function resolveHealerFromLogs(prevPlayer, prevEnemy, healedCell, newLogs) {
        const wantedTarget = String(healedCell?.name || '').trim().toLowerCase();
        if (!wantedTarget) return null;
        for (const line of newLogs) {
            const m = parseHealFromLog(line);
            if (!m) continue;
            if (m.target.toLowerCase() !== wantedTarget) continue;
            for (const usesLine of newLogs) {
                const u = parseAbilityFromLog(usesLine);
                if (!u || u.kind !== 'ABILITY') continue;
                if (u.name.toLowerCase() !== m.abilityOrSource.toLowerCase()) continue;
                const onPlayer = findCellByName(prevPlayer, u.actor);
                if (onPlayer) return { ...onPlayer, isPlayer: true };
                const onEnemy = findCellByName(prevEnemy, u.actor);
                if (onEnemy) return { ...onEnemy, isPlayer: false };
            }
            if (m.abilityOrSource) {
                const directPlayer = findCellByName(prevPlayer, m.abilityOrSource);
                if (directPlayer) return { ...directPlayer, isPlayer: true };
                const directEnemy = findCellByName(prevEnemy, m.abilityOrSource);
                if (directEnemy) return { ...directEnemy, isPlayer: false };
            }
        }
        return null;
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
            // Map<key, { isPlayer, row, col, displayHp, finalHp, maxHp, element }>
            // Board renders receive the server's post-damage state immediately;
            // these entries keep visible card HP at the pre-hit value until the
            // matching attack animation reaches impact.
            this.pendingHealthChanges = new Map();
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
            this.settleAllPendingHealth();
        }

        // ── Pending-placement registry ────────────────────────────────────
        _placementKey(isPlayer, row, col, instanceId) {
            return `${isPlayer ? 'P' : 'E'}:${row}:${col}:${instanceId || ''}`;
        }
        _healthKey(isPlayer, row, col, instanceId) {
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
        renderHealthInner(entry, hp, maxHp) {
            const safeHp = Math.max(0, Number.isFinite(Number(hp)) ? Number(hp) : 0);
            const safeMax = Math.max(0, Number.isFinite(Number(maxHp)) ? Number(maxHp) : 0);
            const printedHp = Number(entry?.printedHealth);
            const shield = Number.isFinite(printedHp) ? Math.max(0, safeMax - printedHp) : 0;
            const baseMax = shield > 0 ? printedHp : safeMax;
            const visibleHp = shield > 0 ? Math.min(safeHp, printedHp) : safeHp;
            return `${visibleHp}/<span class="stat-hp-max">${baseMax}</span>`;
        }
        applyHealthToDom(entry, hp, maxHp) {
            if (!entry) return;
            const cellEl = findCellEl(entry.isPlayer, entry.row, entry.col);
            const card = cellEl?.querySelector('.board-card');
            if (!card) return;
            const resolvedMax = Number.isFinite(Number(maxHp)) ? Number(maxHp) : Number(entry.maxHp);
            const resolvedHp = Number.isFinite(Number(hp)) ? Number(hp) : Number(entry.finalHp);
            const pct = resolvedMax > 0 ? Math.max(0, Math.min(100, (resolvedHp / resolvedMax) * 100)) : 0;
            const fill = card.querySelector('.hp-fill');
            if (fill) fill.style.width = `${pct}%`;
            const hpStat = card.querySelector('.stat-hp');
            if (hpStat) hpStat.innerHTML = this.renderHealthInner(entry, resolvedHp, resolvedMax);
        }
        registerPendingHealth(target) {
            if (!target || target.destroysTarget) return null;
            const prevHp = Number(target.prevHp);
            const nextHp = Number(target.nextHp);
            if (!Number.isFinite(prevHp) || !Number.isFinite(nextHp) || nextHp >= prevHp) {
                return null;
            }
            const id = String(target.instanceId || '');
            const key = this._healthKey(target.isPlayer, target.row, target.col, id);
            const maxHp = Number.isFinite(Number(target.nextMaxHp))
                ? Number(target.nextMaxHp)
                : Number(target.prevMaxHp);
            const existing = this.pendingHealthChanges.get(key);
            this.pendingHealthChanges.set(key, {
                isPlayer: target.isPlayer,
                row: target.row,
                col: target.col,
                instanceId: id,
                displayHp: existing ? existing.displayHp : prevHp,
                finalHp: nextHp,
                maxHp,
                printedHealth: target.printedHealth,
                element: target.element
            });
            this.syncPendingHealth();
            return key;
        }
        releasePendingHealth(key) {
            if (!key) return;
            const entry = this.pendingHealthChanges.get(key);
            if (!entry) return;
            this.pendingHealthChanges.delete(key);
            this.applyHealthToDom(entry, entry.finalHp, entry.maxHp);
        }
        releasePendingHealthForTargets(targets) {
            for (const target of targets || []) {
                this.releasePendingHealth(target?.pendingHealthKey);
            }
        }
        settleAllPendingHealth() {
            for (const [key, entry] of Array.from(this.pendingHealthChanges.entries())) {
                this.pendingHealthChanges.delete(key);
                this.applyHealthToDom(entry, entry.finalHp, entry.maxHp);
            }
        }
        syncPendingHealth() {
            for (const entry of this.pendingHealthChanges.values()) {
                this.applyHealthToDom(entry, entry.displayHp, entry.maxHp);
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
            const selectors = isPlayer
                ? [
                    '#hudRailPlayer .hud-hp-row',
                    '.mobile-hud-player',
                    '.tb-hp-player'
                ]
                : [
                    '#hudRailEnemy .hud-hp-row',
                    '.mobile-hud-enemy',
                    '.tb-hp-enemy'
                ];
            const candidates = selectors
                .map((selector) => document.querySelector(selector))
                .filter(Boolean);
            return candidates.find((el) => {
                const r = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return r.width > 0
                    && r.height > 0
                    && style.visibility !== 'hidden'
                    && style.display !== 'none'
                    && style.opacity !== '0';
            }) || candidates[0] || null;
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

        // Where to launch a "sourceless" projectile from when we can't
        // identify the attacking cell (e.g. an AI counter-attack whose log
        // line shape doesn't match the parser). Picks a point on the
        // attacker's side of the board so the projectile still flies the
        // right direction toward the target.
        _getFallbackProjectileOrigin(attackerIsPlayer) {
            const grid = document.getElementById(attackerIsPlayer ? 'playerGrid' : 'enemyGrid');
            if (grid) {
                const r = grid.getBoundingClientRect();
                if (r && r.width > 0 && r.height > 0) {
                    return {
                        x: r.left + r.width / 2,
                        // Top edge of player grid / bottom edge of enemy grid
                        // so the projectile starts "near the line" and flies
                        // across the board rather than from inside the grid.
                        y: attackerIsPlayer ? r.top + r.height * 0.15 : r.top + r.height * 0.85
                    };
                }
            }
            return {
                x: window.innerWidth / 2,
                y: attackerIsPlayer ? window.innerHeight * 0.75 : window.innerHeight * 0.25
            };
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
                        shieldBroken: Number(t.shieldBroken) || 0,
                        hpLoss: Number(t.hpLoss) || 0,
                        shieldFullyBroken: !!t.shieldFullyBroken,
                        element: t.element,
                        name: t.name,
                        destroysTarget: !!destroyed,
                        ghostCell: destroyed?.cell || null,
                        instanceId: t.instanceId,
                        prevHp: t.prevHp,
                        nextHp: t.nextHp,
                        prevMaxHp: t.prevMaxHp,
                        nextMaxHp: t.nextMaxHp,
                        printedHealth: t.printedHealth
                    };
                    targetEntry.pendingHealthKey = this.registerPendingHealth(targetEntry);
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
                // Only treat the toast as an "active attack" when we
                // actually identified a source cell. Without one (trap/aura
                // damage, effect tick, unparseable AI log line), the toast
                // becomes "<Target> takes -N" so it doesn't read as if the
                // player just clicked an attack.
                const realAttacker = srcRef?.cell?.name || srcRef?.pending?.name;
                if (realAttacker) enqueuedAttackerNames.add(realAttacker);
                const sourcePayload = srcRef
                    ? { isPlayer: side === 'PLAYER', row: srcRef.row, col: srcRef.col }
                    : null;

                // Status-only group (e.g. an enemy aura applies Weak to a
                // newly-placed player Siegling with no HP change). Don't
                // route through the ATTACK path — that produces phantom
                // "AI attacks X" toasts even though no attack happened.
                // Emit a STATUS_APPLY action per affected target instead.
                const hasDamage = targets.some((tt) => Number(tt.amount) > 0);
                if (!hasDamage) {
                    for (const t of targets) {
                        if (!t.statuses || !t.statuses.length) continue;
                        const primaryStatus = t.statuses[0];
                        const statusEl = statusProfile(primaryStatus).element;
                        const labelText = t.statuses.map(formatStatusLabel).join(', ');
                        this.enqueueAction({
                            kind: 'STATUS_APPLY',
                            side,
                            actorName: t.name,
                            targetName: labelText,
                            knightElement: knight,
                            elementColor: statusEl,
                            source: sourcePayload,
                            target: { isPlayer: t.isPlayer, row: t.row, col: t.col, element: t.element || statusEl },
                            statuses: t.statuses.slice(),
                            gapAfterMs: BATTLE_GAP_MS
                        });
                    }
                    return;
                }

                if (targets.length === 1) {
                    const t = targets[0];
                    // "Broke <Target>'s +N Shield - M Damage dealt" toast
                    // when this hit fully consumed the shield buffer.
                    const broke = t.shieldFullyBroken && t.shieldBroken > 0;
                    this.enqueueAction({
                        kind: 'ATTACK',
                        side,
                        actorName: broke
                            ? `Broke ${t.name}'s`
                            : (realAttacker || t.name),
                        targetName: broke
                            ? ''
                            : (realAttacker ? t.name : ''),
                        label: broke
                            ? undefined
                            : (realAttacker ? undefined : 'takes'),
                        amount: t.amount,
                        shieldBroken: t.shieldBroken,
                        hpLoss: t.hpLoss,
                        shieldFullyBroken: t.shieldFullyBroken,
                        knightElement: knight,
                        elementColor: srcElement,
                        source: sourcePayload,
                        target: { isPlayer: t.isPlayer, row: t.row, col: t.col, element: t.element || srcElement },
                        destroysTarget: t.destroysTarget,
                        ghostCell: t.ghostCell,
                        pendingHealthKey: t.pendingHealthKey,
                        statuses: t.statuses && t.statuses.length ? t.statuses.slice() : null,
                        gapAfterMs: BATTLE_GAP_MS
                    });
                    return;
                }
                // Multi-target: simultaneous barrage. Aggregate shield/HP
                // damage across the targets so the toast can show the total.
                const totalDmg = targets.reduce((sum, tt) => sum + (Number(tt.amount) || 0), 0);
                const totalShieldBroken = targets.reduce((sum, tt) => sum + (Number(tt.shieldBroken) || 0), 0);
                const totalHpLoss = targets.reduce((sum, tt) => sum + (Number(tt.hpLoss) || 0), 0);
                const groupLabel = describeTargets(targets, defenderLabel);
                this.enqueueAction({
                    kind: 'ATTACK',
                    side,
                    actorName: realAttacker || groupLabel,
                    targetName: realAttacker ? groupLabel : '',
                    label: realAttacker ? undefined : 'takes',
                    amount: totalDmg,
                    shieldBroken: totalShieldBroken,
                    hpLoss: totalHpLoss,
                    knightElement: knight,
                    elementColor: srcElement,
                    source: sourcePayload,
                    targets: targets.map((tt) => ({
                        isPlayer: tt.isPlayer, row: tt.row, col: tt.col,
                        element: tt.element || srcElement,
                        amount: tt.amount,
                        shieldBroken: tt.shieldBroken,
                        hpLoss: tt.hpLoss,
                        destroysTarget: tt.destroysTarget,
                        ghostCell: tt.ghostCell,
                        pendingHealthKey: tt.pendingHealthKey,
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

            // Healing events — HP increases on cells that survived the diff.
            // Queued after damage/destruction/ability so it plays during the
            // BATTLE block but doesn't pre-empt attack animations.
            const healingOnPlayer = diffHealing(prevPlayer, nextPlayer, true);
            const healingOnEnemy  = diffHealing(prevEnemy,  nextEnemy,  false);
            const shieldsOnPlayer = diffShields(prevPlayer, nextPlayer, true);
            const shieldsOnEnemy  = diffShields(prevEnemy,  nextEnemy,  false);
            const queueHeal = (h) => {
                const healerRef = resolveHealerFromLogs(prevPlayer, prevEnemy, h, newLogs);
                const targetIsPlayer = h.isPlayer;
                const ownerKnight = targetIsPlayer ? playerKnight : enemyKnight;
                // The healer's side drives the toast side / knight color.
                const side = healerRef ? (healerRef.isPlayer ? 'PLAYER' : 'ENEMY')
                                       : (targetIsPlayer ? 'PLAYER' : 'ENEMY');
                const knight = side === 'PLAYER' ? playerKnight : enemyKnight;
                this.enqueueAction({
                    kind: 'HEAL',
                    side,
                    actorName: healerRef?.cell?.name
                        || (side === 'PLAYER' ? playerName : enemyName),
                    targetName: h.name,
                    amount: h.amount,
                    knightElement: knight,
                    elementColor: 'WIND', // green for the projectile + floater
                    source: healerRef
                        ? { isPlayer: healerRef.isPlayer, row: healerRef.row, col: healerRef.col }
                        : null,
                    target: { isPlayer: h.isPlayer, row: h.row, col: h.col, element: ownerKnight },
                    gapAfterMs: BATTLE_GAP_MS
                });
            };
            const queueShield = (h) => {
                const targetIsPlayer = h.isPlayer;
                const side = targetIsPlayer ? 'PLAYER' : 'ENEMY';
                const knight = side === 'PLAYER' ? playerKnight : enemyKnight;
                this.enqueueAction({
                    kind: 'SHIELD',
                    side,
                    actorName: side === 'PLAYER' ? playerName : enemyName,
                    targetName: h.name,
                    amount: h.amount,
                    amountSign: '+',
                    knightElement: knight,
                    elementColor: 'METAL',
                    target: { isPlayer: h.isPlayer, row: h.row, col: h.col, element: 'METAL' },
                    gapAfterMs: BATTLE_GAP_MS
                });
            };
            for (const h of healingOnPlayer) queueHeal(h);
            for (const h of healingOnEnemy)  queueHeal(h);
            for (const h of shieldsOnPlayer) queueShield(h);
            for (const h of shieldsOnEnemy)  queueShield(h);

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

                this.releasePendingHealthForTargets(action.targets);
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
                    if (tgt.shieldBroken > 0) {
                        breakShieldPlates(tgt.isPlayer, tgt.row, tgt.col, tgt.shieldBroken);
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

            // 2a-status. STATUS_APPLY — status-only events (aura debuffs,
            // boost auras) that the queue used to mis-classify as attacks.
            // Fires a short projectile from the caster (if one was
            // identified) and lands the status-specific overlay on the
            // target. Never shows the "X attacks Y" verb, never spawns a
            // damage floater.
            if (action.kind === 'STATUS_APPLY' && action.target) {
                if (action.source && window.SieglingsFx?.attackCell) {
                    window.SieglingsFx.attackCell(
                        action.source.isPlayer, action.source.row, action.source.col,
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.elementColor || action.knightElement,
                        { duration: t.projectileMs }
                    );
                    await sleep(t.projectileMs);
                }
                if (action.statuses && action.statuses.length) {
                    for (const status of action.statuses) {
                        applyStatusVisual(
                            action.target.isPlayer, action.target.row, action.target.col,
                            status
                        );
                    }
                }
                await sleep(t.impactMs);
                const statusGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(statusGap);
                return;
            }

            // 2a-heal. HEAL — green projectile (when there's an identified
            // healer) and a glowing green "+" cross with outward particles on
            // the target. Damage floater is replaced with a green "+N" gain.
            if (action.kind === 'HEAL' && action.target) {
                if (action.source && window.SieglingsFx?.attackCell) {
                    window.SieglingsFx.attackCell(
                        action.source.isPlayer, action.source.row, action.source.col,
                        action.target.isPlayer, action.target.row, action.target.col,
                        'WIND',
                        { duration: t.projectileMs }
                    );
                    await sleep(t.projectileMs);
                }
                spawnHealCross(action.target.isPlayer, action.target.row, action.target.col, 1400);
                if (action.amount && window.SieglingsFx?.floatingDamage) {
                    // floatingDamage formats as "-N"; use floatingText for "+N"
                    const cellEl = findCellEl(action.target.isPlayer, action.target.row, action.target.col);
                    if (cellEl && window.SieglingsFx.floatingText) {
                        const r = cellEl.getBoundingClientRect();
                        window.SieglingsFx.floatingText(
                            r.left + r.width / 2,
                            r.top + r.height * 0.3,
                            `+${action.amount}`,
                            '#5eff8e', 30
                        );
                    }
                }
                await sleep(t.impactMs);
                const healGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(healGap);
                return;
            }

            // 2b. Direct attack on the enemy/player HP bar — no cell target,
            // so we fire the projectile to the bar's screen coordinates and
            // shake/flash the bar on impact.
            if (action.kind === 'SHIELD' && action.target) {
                applyStatusVisual(action.target.isPlayer, action.target.row, action.target.col, 'HEALTH_BOOST');
                const cellEl = findCellEl(action.target.isPlayer, action.target.row, action.target.col);
                if (action.amount && cellEl && window.SieglingsFx?.floatingText) {
                    const r = cellEl.getBoundingClientRect();
                    window.SieglingsFx.floatingText(
                        r.left + r.width / 2,
                        r.top + r.height * 0.3,
                        `+${action.amount}`,
                        '#a8b0ba', 30
                    );
                }
                await sleep(t.impactMs);
                const shieldGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(shieldGap);
                return;
            }

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

                this.releasePendingHealth(action.pendingHealthKey);
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
                if (action.shieldBroken > 0) {
                    breakShieldPlates(action.target.isPlayer, action.target.row, action.target.col, action.shieldBroken);
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
                // AI attack whose log shape the parser didn't recognize, etc.).
                // We still fire a projectile from a fallback origin on the
                // attacker's side so the user sees the element-colored
                // particle trail flying across the board, and follow up with
                // the usual impact + ghost + floater.
                let ghost = null;
                if (action.destroysTarget && action.ghostCell) {
                    ghost = spawnGhost(
                        action.target.isPlayer, action.target.row, action.target.col,
                        action.ghostCell, knight, elColor
                    );
                }
                const targetCellEl = findCellEl(action.target.isPlayer, action.target.row, action.target.col);
                if (targetCellEl && window.SieglingsFx?.attackBetween) {
                    const tr = targetCellEl.getBoundingClientRect();
                    const origin = this._getFallbackProjectileOrigin(action.side === 'PLAYER');
                    window.SieglingsFx.attackBetween(
                        origin.x, origin.y,
                        tr.left + tr.width / 2, tr.top + tr.height / 2,
                        action.elementColor || action.knightElement,
                        { duration: t.projectileMs }
                    );
                    await sleep(t.projectileMs);
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
                if (action.shieldBroken > 0) {
                    breakShieldPlates(action.target.isPlayer, action.target.row, action.target.col, action.shieldBroken);
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
            try { queue.syncPendingHealth(); } catch (_) {}
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
