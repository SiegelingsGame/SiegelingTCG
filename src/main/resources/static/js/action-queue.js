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
 *   enqueueFromStateDiff(prevState, nextState, playbackContext)
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
        POISON:   '#7ecb4d',
        LIGHT:    '#ffe59a',
        NEUTRAL:  '#95a5a6'
    };

    const ELEMENT_SIGIL = {
        FIRE: '🔥', WATER: '💧', EARTH: '⛰', WIND: '🌪', ICE: '❄',
        SHADOW: '🌑', ELECTRIC: '⚡', METAL: '⚙', UNDEAD: '☠',
        PSYCHIC: '✦', POISON: '☣', LIGHT: '☀', NEUTRAL: '◆'
    };

    const ACTION_LABEL = {
        PLAY:    'plays',
        ABILITY: 'uses',
        ATTACK:  'attacks',
        HEAL:    'heals',
        SHIELD:  'shields',
        STATUS_APPLY: 'gains',
        STATUS_SKIP: 'is',
        MOVE:    'shifts',
        BLOCK:   'blocks',
        EFFECT:  'effect',
        AFFLICTION: 'suffers',
        DESTROY: 'was destroyed',
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

    function attackFxElement(action) {
        return action?.elementColor || action?.knightElement || 'NEUTRAL';
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
    const AI_CHAT_EMOJIS = [
        '\u{1F60F}',
        '\u{2694}\u{FE0F}',
        '\u{1F440}',
        '\u{2728}',
        '\u{1F4A5}'
    ];
    function pickAiChatEmoji(state) {
        const turn = Math.max(0, Number(state?.turnNumber) || 0);
        const element = String(state?.enemy?.trainer?.element || state?.enemy?.element || '');
        const seed = turn + Array.from(element).reduce((sum, char) => sum + char.charCodeAt(0), 0);
        return AI_CHAT_EMOJIS[seed % AI_CHAT_EMOJIS.length];
    }
    function stripLogPrefix(line) {
        return String(line || '').trim().replace(/^\[Turn\s+\d+\s+\w+\]\s*/i, '');
    }
    function formatPhaseLabelFallback(phase) {
        switch (String(phase || '').toUpperCase()) {
            case 'DRAW': return 'Draw Phase';
            case 'SETUP': return 'Setup Phase';
            case 'BATTLE': return 'Battle Phase';
            case 'MULLIGAN': return 'Opening Hand';
            default:
                if (!phase) return 'Phase Shift';
                return `${String(phase).charAt(0)}${String(phase).slice(1).toLowerCase()} Phase`;
        }
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
            const damagePart = (!toast.hideAmount && visibleDamage > 0)
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

    function destroyBoardCard(cardEl, elementHexValue, durationMs) {
        if (!cardEl) return Promise.resolve();
        cardEl.style.setProperty('--sgl-impact-color', elementHexValue || ELEMENT_HEX.NEUTRAL);
        cardEl.classList.add('sgl-destroying');
        const dur = Math.max(180, durationMs || 540);
        return new Promise((resolve) => {
            setTimeout(() => {
                const cellEl = cardEl.closest('.board-cell');
                if (cellEl) {
                    const rowTag = cellEl.querySelector('.row-tag');
                    const rowTagHtml = rowTag ? rowTag.outerHTML : '';
                    cellEl.classList.remove('has-card');
                    cellEl.innerHTML = rowTagHtml;
                }
                resolve();
            }, dur);
        });
    }

    function clearTransientCardClasses(card) {
        if (!card?.classList) return;
        card.classList.remove(
            'sgl-acting',
            'sgl-acting-attack',
            'sgl-acting-play',
            'sgl-impact',
            'sgl-destroying',
            'sgl-status-applied'
        );
    }

    async function animateBoardMove(queue, action, durationMs) {
        const source = action?.source;
        const target = action?.target;
        if (!source || !target) {
            queue.revealPendingMove(action?.moveKey);
            return;
        }

        const sourceCell = findCellEl(source.isPlayer, source.row, source.col);
        const targetCell = findCellEl(target.isPlayer, target.row, target.col);
        const targetCard = targetCell?.querySelector('.board-card');
        const sourceRect = sourceCell?.getBoundingClientRect();
        const targetRect = targetCell?.getBoundingClientRect();
        if (!sourceCell || !targetCell || !targetCard || !sourceRect || !targetRect
            || sourceRect.width <= 0 || sourceRect.height <= 0
            || targetRect.width <= 0 || targetRect.height <= 0) {
            queue.revealPendingMove(action.moveKey);
            await sleep(120);
            return;
        }

        const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const dur = prefersReduced ? 140 : Math.max(220, durationMs || 520);
        const dx = targetRect.left - sourceRect.left;
        const dy = targetRect.top - sourceRect.top;
        const scaleX = targetRect.width / sourceRect.width;
        const scaleY = targetRect.height / sourceRect.height;
        const elementColor = elementHex(action.elementColor || action.knightElement);

        const clone = targetCard.cloneNode(true);
        clearTransientCardClasses(clone);
        clone.classList.add('sgl-shift-card');
        clone.style.position = 'fixed';
        clone.style.left = `${sourceRect.left}px`;
        clone.style.top = `${sourceRect.top}px`;
        clone.style.width = `${sourceRect.width}px`;
        clone.style.height = `${sourceRect.height}px`;
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
        clone.style.visibility = 'visible';
        clone.style.opacity = '1';
        clone.style.zIndex = '560';
        clone.style.setProperty('--sgl-shift-color', elementColor);

        sourceCell.style.setProperty('--sgl-shift-color', elementColor);
        targetCell.style.setProperty('--sgl-shift-color', elementColor);
        sourceCell.classList.add('sgl-move-origin');
        targetCell.classList.add('sgl-move-destination');
        targetCard.style.visibility = 'hidden';
        targetCard.style.opacity = '0';
        document.body.appendChild(clone);

        if (window.SieglingsFx?.impactAt) {
            window.SieglingsFx.impactAt(
                source.isPlayer, source.row, source.col,
                action.elementColor || action.knightElement
            );
        }

        try {
            if (typeof clone.animate === 'function') {
                const animation = clone.animate([
                    {
                        transform: 'translate(0, 0) scale(0.98)',
                        opacity: 0.96,
                        filter: `drop-shadow(0 0 6px ${elementColor})`
                    },
                    {
                        transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 10}px) scale(1.04)`,
                        opacity: 1,
                        filter: `drop-shadow(0 0 18px ${elementColor}) brightness(1.18)`,
                        offset: 0.58
                    },
                    {
                        transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
                        opacity: 1,
                        filter: `drop-shadow(0 0 8px ${elementColor})`
                    }
                ], {
                    duration: dur,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    fill: 'forwards'
                });
                await animation.finished.catch(() => {});
            } else {
                clone.style.transition = `transform ${dur}ms cubic-bezier(0.22, 1, 0.36, 1), filter ${dur}ms ease`;
                requestAnimationFrame(() => {
                    clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
                    clone.style.filter = `drop-shadow(0 0 10px ${elementColor})`;
                });
                await sleep(dur);
            }
        } finally {
            if (clone.parentNode) clone.parentNode.removeChild(clone);
            sourceCell.classList.remove('sgl-move-origin');
            targetCell.classList.remove('sgl-move-destination');
            sourceCell.style.removeProperty('--sgl-shift-color');
            targetCell.style.removeProperty('--sgl-shift-color');
            queue.revealPendingMove(action.moveKey);
        }

        if (window.SieglingsFx?.impactAt) {
            window.SieglingsFx.impactAt(
                target.isPlayer, target.row, target.col,
                action.elementColor || action.knightElement
            );
        }
        await sleep(prefersReduced ? 40 : 120);
    }

    function applyAttackImpactVfx(queue, action, target, elColor) {
        if (!target) return;
        const boardCard = queue.getHeldBoardCard(target.isPlayer, target.row, target.col);
        if (boardCard) {
            boardCard.style.setProperty('--sgl-impact-color', elColor);
            boardCard.classList.add('sgl-impact');
            setTimeout(() => boardCard.classList.remove('sgl-impact'), 360);
        } else {
            flashImpact(target.isPlayer, target.row, target.col, elColor);
        }
        if (target.amount && window.SieglingsFx?.floatingDamage) {
            window.SieglingsFx.floatingDamage(
                target.isPlayer, target.row, target.col,
                target.amount, attackFxElement(action)
            );
        }
        if (target.shieldBroken > 0) {
            breakShieldPlates(target.isPlayer, target.row, target.col, target.shieldBroken);
        }
        if (target.statuses && target.statuses.length) {
            for (const status of target.statuses) {
                applyStatusVisual(target.isPlayer, target.row, target.col, status);
            }
            // Reveal the held status badge now that its impact animation lands,
            // so the badge appears with the hit rather than ahead of it.
            queue.revealPendingStatusesForTarget(target, target.statuses);
        }
        // Elemental badge (Burn, Toxin, …) applied by this hit — light the
        // element's border around the card so the badge reads as landing.
        const aura = target.afflictionAura || action?.afflictionAura;
        if (aura) {
            spawnElementalBorder(target.isPlayer, target.row, target.col, {
                element: aura.element,
                variant: String(aura.affliction || 'effect').toLowerCase(),
                durationMs: 900
            });
        }
    }

    async function playStandardAttackImpact(queue, action, target, elColor, t) {
        queue.applyPendingImpactHealth(target?.pendingHealthKey);
        applyAttackImpactVfx(queue, action, target, elColor);
        if (window.SieglingsFx?.cameraShake) {
            const shake = Math.min(12, 3 + Math.round((Number(target?.amount) || 0) * 0.6));
            window.SieglingsFx.cameraShake(shake, t.impactMs);
        }
        await sleep(t.impactMs);
        queue.releasePendingHealth(target?.pendingHealthKey);
    }

    async function playLethalAttackImpact(queue, action, target, elColor, t) {
        const pendingKey = target.pendingLethalKey || target.pendingHealthKey;
        queue.applyLethalImpactHealth(pendingKey, target);
        applyAttackImpactVfx(queue, action, target, elColor);
        const boardCard = queue.getHeldBoardCard(target.isPlayer, target.row, target.col);
        if (window.SieglingsFx?.cameraShake) {
            const shake = Math.min(12, 3 + Math.round((target.amount || 0) * 0.6));
            window.SieglingsFx.cameraShake(shake, t.impactMs);
        }
        await sleep(t.impactMs);
        const cardToDestroy = boardCard || findCellEl(target.isPlayer, target.row, target.col)?.querySelector('.board-card');
        if (cardToDestroy) {
            await destroyBoardCard(cardToDestroy, elColor, 520);
        }
        queue.releasePendingLethalHold(pendingKey);
    }

    /**
     * Chain damage playback. The effect is about the links, so it has to read as
     * one strike that ricochets: the projectile crosses the board to the card the
     * ability actually targeted, lands, and only then do arcs jump from that card
     * to each Siegling wired to it. (The generic multi-target barrage fires
     * everything from the attacker at once, which hid the link entirely.)
     *
     * Victims killed by a hop keep their card on screen until every hop is done —
     * a dead primary is still the origin the arcs bounce from — so the impact and
     * the destruction animation are split across the sequence.
     * @returns the lethal victims, in hop order, awaiting their destroy toast.
     */
    async function playChainAttack(queue, action, t, elColor) {
        const fxElement = attackFxElement(action);
        const casterFxColor = elementHex(fxElement);
        const borderMs = queue.getSpeed() === 'fast' ? 520 : 950;
        const lethalTargets = [];
        queue.syncPendingLethalHolds();

        const playHop = async (origin, victims) => {
            if (!victims.length) return;
            let leadInMs = t.projectileMs;
            if (origin && window.SieglingsFx?.attackCell) {
                for (const tgt of victims) {
                    window.SieglingsFx.attackCell(
                        origin.isPlayer, origin.row, origin.col,
                        tgt.isPlayer, tgt.row, tgt.col,
                        fxElement,
                        { duration: t.projectileMs }
                    );
                    // A chain is the one attack that is also about the card it
                    // travels through, so each victim burns the element on its
                    // border as the bolt lands — the projectile shows the path,
                    // the border shows the card conducting it.
                    spawnElementalBorder(tgt.isPlayer, tgt.row, tgt.col, {
                        element: fxElement,
                        variant: 'chain',
                        durationMs: borderMs
                    });
                }
            } else {
                // Sourceless chain (trap / spell / trainer active): nothing crossed
                // the board to reach the primary, so it ignites its own border. The
                // arcs off it still fly, because those really do travel the links.
                for (const tgt of victims) {
                    spawnElementalBorder(tgt.isPlayer, tgt.row, tgt.col, {
                        element: fxElement,
                        variant: 'effect',
                        durationMs: borderMs
                    });
                }
                leadInMs = Math.round(borderMs * 0.4);
            }
            await sleep(leadInMs);

            const surviving = [];
            for (const tgt of victims) {
                if (tgt.destroysTarget && tgt.ghostCell) {
                    queue.applyLethalImpactHealth(tgt.pendingLethalKey || tgt.pendingHealthKey, tgt);
                    lethalTargets.push(tgt);
                } else {
                    surviving.push(tgt);
                }
            }
            queue.applyPendingImpactHealthForTargets(surviving);
            for (const tgt of victims) {
                applyAttackImpactVfx(queue, action, tgt, casterFxColor);
            }
            if (window.SieglingsFx?.cameraShake) {
                const hopDamage = victims.reduce((sum, tt) => sum + (Number(tt.amount) || 0), 0);
                window.SieglingsFx.cameraShake(
                    Math.min(16, 6 + Math.round(hopDamage * 0.35)), t.impactMs
                );
            }
            await sleep(t.impactMs);
            if (surviving.length) queue.releasePendingHealthForTargets(surviving);
        };

        for (const step of action.chainSteps) {
            await playHop(action.source, [step.primary]);
            await playHop(step.primary, step.links);
        }

        for (const tgt of lethalTargets) {
            const cardToDestroy = queue.getHeldBoardCard(tgt.isPlayer, tgt.row, tgt.col)
                || findCellEl(tgt.isPlayer, tgt.row, tgt.col)?.querySelector('.board-card');
            if (cardToDestroy) {
                await destroyBoardCard(cardToDestroy, elColor, 520);
            }
            queue.releasePendingLethalHold(tgt.pendingLethalKey || tgt.pendingHealthKey);
        }
        return lethalTargets;
    }

    function buildCardDestroyedToast(sourceAction, target) {
        const ghost = target?.ghostCell || sourceAction?.ghostCell;
        const name = target?.name || ghost?.name || sourceAction?.actorName || 'Card';
        const el = normalizeElement(
            target?.element || ghost?.element || sourceAction?.elementColor || sourceAction?.knightElement
        );
        return {
            kind: 'DESTROY',
            side: sourceAction?.side || (target?.isPlayer ? 'PLAYER' : 'ENEMY'),
            actorName: name,
            targetName: '',
            label: 'was destroyed',
            knightElement: sourceAction?.knightElement || el,
            elementColor: el,
            portraitHtml: `<span class="sgl-toast-sigil">${elementSigil(el)}</span>`
        };
    }

    async function showCardDestroyedToast(queue, sourceAction, target, t) {
        if (queue.activeToast) queue.activeToast.dismiss();
        queue.activeToast = queue.toasts.show(buildCardDestroyedToast(sourceAction, target), t.toastDismissMs);
        await sleep(t.toastEnterMs);
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

    // Elemental damage afflictions — mirrors ElementalAfflictionCatalog.java.
    // These never have an attacker cell behind them: the card is hurt by a badge
    // it already carries, so their visual is an element-colored border igniting
    // around the card rather than a projectile flying in from somewhere.
    const AFFLICTION_PROFILES = {
        BURN:      { element: 'FIRE',     label: 'Burn' },
        CHILL:     { element: 'ICE',      label: 'Chill' },
        STAGGER:   { element: 'EARTH',    label: 'Stagger' },
        DISORIENT: { element: 'WIND',     label: 'Disorient' },
        SOAK:      { element: 'WATER',    label: 'Soak' },
        SHOCK:     { element: 'ELECTRIC', label: 'Shock' },
        RUST:      { element: 'METAL',    label: 'Rust' },
        TOXIN:     { element: 'POISON',   label: 'Toxin' },
        CURSE:     { element: 'SHADOW',   label: 'Curse' },
        INSIGHT:   { element: 'PSYCHIC',  label: 'Insight' },
        BLIND:     { element: 'LIGHT',    label: 'Blind' },
        WITHER:    { element: 'UNDEAD',   label: 'Wither' }
    };
    // Damage-tick log wording → affliction key. Server lines read
    // "<name> takes 3 burn damage (HP: 7)."; "poison" is accepted as an alias so
    // Toxin ticks phrased that way land on the same visual.
    const AFFLICTION_LOG_WORDS = {
        burn: 'BURN', burning: 'BURN', chill: 'CHILL', frost: 'CHILL',
        poison: 'TOXIN', toxin: 'TOXIN', venom: 'TOXIN', shock: 'SHOCK',
        rust: 'RUST', curse: 'CURSE', wither: 'WITHER', soak: 'SOAK'
    };
    function afflictionProfile(affliction) {
        const k = String(affliction || '').toUpperCase();
        return AFFLICTION_PROFILES[k] || { element: 'NEUTRAL', label: 'Affliction' };
    }

    // Walk a point around the perimeter of the card box. t in [0,1) starts at the
    // top-left corner and travels clockwise; used to seed the border motes so
    // their staggered delays read as one wave circling the card.
    function borderPerimeterPoint(t) {
        const p = ((t % 1) + 1) % 1;
        if (p < 0.25) return { x: (p / 0.25) * 100, y: 0 };
        if (p < 0.5)  return { x: 100, y: ((p - 0.25) / 0.25) * 100 };
        if (p < 0.75) return { x: 100 - ((p - 0.5) / 0.25) * 100, y: 100 };
        return { x: 0, y: 100 - ((p - 0.75) / 0.25) * 100 };
    }

    // The house visual for anything that happens to a card without a Siegling
    // attacking it — affliction ticks, badges landing, trap/aura/effect damage,
    // status applications, heals. Projectiles stay reserved for real attacks, so
    // these light the element around the card's border instead. Fixed positioned
    // (like spawnHealCross) so a board re-render mid-animation can't tear it down.
    //
    // options: { element, color, variant, durationMs, sigil }
    //   element  element key ('FIRE') used for colour + sigil
    //   color    explicit hex, overrides element (heals are green, not elemental)
    //   variant  class suffix for per-cause styling hooks ('burn', 'effect', …)
    function spawnElementalBorder(isPlayer, row, col, options) {
        const cellEl = findCellEl(isPlayer, row, col);
        if (!cellEl) return null;
        const rect = cellEl.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;

        const opts = options || {};
        const hex = opts.color || elementHex(opts.element);
        const total = Math.max(320, opts.durationMs || 900);
        const variant = String(opts.variant || 'effect').toLowerCase();
        const sigil = opts.sigil != null ? opts.sigil : elementSigil(opts.element);
        const overlay = document.createElement('div');
        overlay.className = `sgl-element-border sgl-element-border-${variant}`;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.position = 'fixed';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.setProperty('--sgl-border-color', hex);
        overlay.style.setProperty('--sgl-border-soft', hexWithAlpha(hex, 0.3));
        overlay.style.setProperty('--sgl-border-glow', hexWithAlpha(hex, 0.72));
        overlay.style.setProperty('--sgl-border-ms', `${total}ms`);

        const MOTE_COUNT = 12;
        const motes = [];
        for (let i = 0; i < MOTE_COUNT; i++) {
            const at = borderPerimeterPoint(i / MOTE_COUNT);
            // Push each mote a little away from the card centre so it burns on
            // the border line instead of drifting across the artwork.
            const dx = (at.x - 50) / 50;
            const dy = (at.y - 50) / 50;
            const size = 5 + Math.random() * 4;
            const delay = Math.round((i / MOTE_COUNT) * total * 0.45);
            motes.push(
                `<span class="sgl-border-mote"
                    style="left:${at.x}%;top:${at.y}%;width:${size}px;height:${size}px;
                           --m-dx:${(dx * 12).toFixed(1)}px;--m-dy:${(dy * 12 - 6).toFixed(1)}px;
                           animation-delay:${delay}ms"></span>`
            );
        }

        overlay.innerHTML = `
            <span class="sgl-border-ring"></span>
            <span class="sgl-border-ring sgl-border-ring-outer"></span>
            <span class="sgl-border-fill"></span>
            ${motes.join('')}
            <span class="sgl-border-sigil">${sigil}</span>
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

        setTimeout(() => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', scrollHandler, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, total + 120);
        return overlay;
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

    // Spawn a crumbling-shield overlay on a board cell: a cracked grey shield
    // that shatters into fragments raining downward, for shields that expire at
    // the end of the turn. Fixed-positioned (like spawnHealCross) so a board
    // re-render can't destroy the animation mid-flight.
    function spawnShieldCrumble(isPlayer, row, col, shieldCount, durationMs) {
        const cellEl = findCellEl(isPlayer, row, col);
        if (!cellEl) return null;
        const rect = cellEl.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;

        const overlay = document.createElement('div');
        overlay.className = 'sgl-shield-crumble';
        overlay.style.position = 'fixed';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        const shardCount = Math.max(7, Math.min(16, 4 + (Number(shieldCount) || 1) * 3));
        const shards = [];
        for (let i = 0; i < shardCount; i++) {
            const dx = (Math.random() - 0.5) * rect.width * 0.7;
            const dy = 24 + Math.random() * 42; // fragments fall downward
            const size = 5 + Math.random() * 6;
            const rot = (Math.random() - 0.5) * 240;
            const delay = Math.random() * 200;
            shards.push(
                `<span class="sgl-shield-shard"
                    style="left:50%;top:46%;width:${size}px;height:${size}px;
                           --s-dx:${dx.toFixed(1)}px;--s-dy:${dy.toFixed(1)}px;
                           --s-rot:${rot.toFixed(0)}deg;animation-delay:${delay}ms"></span>`
            );
        }

        overlay.innerHTML = `
            <div class="sgl-shield-crumble-glow" aria-hidden="true"></div>
            <svg class="sgl-shield-crumble-icon" viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                    <linearGradient id="sgl-shield-crumble-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#f3f6fa" />
                        <stop offset="55%" stop-color="#a8b0ba" />
                        <stop offset="100%" stop-color="#5a6470" />
                    </linearGradient>
                </defs>
                <path d="M50 12 L82 24 L82 50 C 82 70 68 84 50 90 C 32 84 18 70 18 50 L18 24 Z"
                      fill="url(#sgl-shield-crumble-grad)" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" />
                <path class="sgl-shield-crack" d="M50 18 L44 44 L57 52 L46 72" fill="none"
                      stroke="#2b3038" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            ${shards.join('')}
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

        const total = Math.max(700, durationMs || 1100);
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
        // Board cells carry their own ability list (GameController serializes it),
        // so an exact ability match names the attacker outright. This is what
        // keeps a projectile flying when the "<Card> uses <Ability>." line is
        // missing from the batch — without it the attack silently degrades to the
        // sourceless border playback reserved for traps and auras.
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cell = board?.[r]?.[c];
                const owns = (cell?.abilities || []).some(
                    (ab) => String(ab?.name || '').trim().toLowerCase() === ability
                );
                if (owns) return { row: r, col: c, cell };
            }
        }
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
        // Server logs "<base> evolved to <evolved>!" (older builds: "evolved into").
        const m = text.match(/^(.+?)\s+evolved\s+(?:in)?to\s+(.+?)[.!]?$/i);
        if (!m) return null;
        return { from: m[1].trim(), to: m[2].trim() };
    }
    // Affliction damage ticks: "<name> takes 3 burn damage (HP: 7)." and
    // "<name> withers (clamped by 2; HP: 5)." Nothing attacked the card — the
    // badge it was carrying resolved — so these must never reach the projectile
    // path. Wither reports no damage number (the tick is an HP clamp), so its
    // amount is left null and matched by name alone.
    function parseAfflictionTickFromLog(line) {
        const text = stripLogPrefix(line);
        let m = text.match(/^(.+?)\s+takes\s+(\d+)\s+([a-z]+)\s+damage(?:\s*\([^)]*\))?[.!]?$/i);
        if (m) {
            const affliction = AFFLICTION_LOG_WORDS[m[3].toLowerCase()];
            if (!affliction) return null;
            return { target: m[1].trim(), amount: Number(m[2]), affliction };
        }
        m = text.match(/^(.+?)\s+withers\s*\([^)]*\)[.!]?$/i);
        if (m) return { target: m[1].trim(), amount: null, affliction: 'WITHER' };
        return null;
    }
    // "<Player> casts Fireball!" / "<Player> springs trap Snare!" — the only
    // place a spell or trap names itself. The damage line that follows names the
    // *ability*, so both are fed to the catalog lookup below.
    function parseEffectCardFromLog(line) {
        const text = stripLogPrefix(line);
        let m = text.match(/^(.+?)\s+springs\s+trap\s+(.+?)[!.]?$/i);
        if (m) return { actor: m[1].trim(), name: m[2].trim(), kind: 'TRAP' };
        m = text.match(/^(.+?)\s+casts\s+(.+?)[!.]?$/i);
        if (m) return { actor: m[1].trim(), name: m[2].trim(), kind: 'SPELL' };
        return null;
    }
    // Spells/traps/trainer actives have no board cell to read an element from, so
    // ask game.js's catalog bridge what element the named card (or ability) is.
    function effectElementForName(name) {
        try {
            return normalizeElement(window.SieglingsCardElements?.elementFor?.(name));
        } catch (_) {
            return null;
        }
    }

    // "<name> is afflicted with Burn (Burn x2)." — the badge landing alongside a
    // real hit, so it rides along with that attack's impact instead of becoming
    // its own action.
    function parseAfflictionApplyFromLog(line) {
        const text = stripLogPrefix(line);
        const m = text.match(/^(.+?)\s+is\s+afflicted\s+with\s+([A-Za-z]+)\s*\(([^)]*)\)[.!]?$/i);
        if (!m) return null;
        const affliction = m[2].toUpperCase();
        if (!AFFLICTION_PROFILES[affliction]) return null;
        const stacks = Number((m[3].match(/x\s*(\d+)/i) || [])[1]) || 1;
        return { target: m[1].trim(), affliction, stacks };
    }
    // Chain damage announces its shape before the damage lines land:
    //   "<Ability> arcs through <Primary>'s links to 2 connected Sieglings!"
    //   "<Ability> finds no links on <Primary>."
    // The named card is the one the projectile strikes first — every other
    // victim of that ability in the same batch is a bounce off it. Board diffs
    // arrive in row/col order, so this is the only way playback can tell the
    // struck target from the cards the arc jumped to.
    function parseChainArcFromLog(line) {
        const text = stripLogPrefix(line);
        let m = text.match(/^(.+?)\s+arcs\s+through\s+(.+?)'s\s+links\s+to\s+(\d+)\s+connected\s+Siegling/i);
        if (m) return { ability: m[1].trim(), primary: m[2].trim(), links: parseInt(m[3], 10) };
        m = text.match(/^(.+?)\s+finds\s+no\s+links\s+on\s+(.+?)[.!]?$/i);
        if (m) return { ability: m[1].trim(), primary: m[2].trim(), links: 0 };
        return null;
    }
    function parseClaimFromLog(line) {
        const text = stripLogPrefix(line);
        const m = text.match(/^(.+?)\s+claims\s+(.+?)\s+and\s+gains\s+1\s+temporary\s+([a-z]+)\s+energy[.!]?$/i);
        if (!m) return null;
        return {
            actor: m[1].trim(),
            name: m[2].trim(),
            element: normalizeElement(m[3])
        };
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
    function diffMoves(prev, next, isPlayer) {
        const out = [];
        if (!prev || !next) return out;
        const prevById = new Map();
        const nextById = new Map();
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const p = prev[r]?.[c];
                const n = next[r]?.[c];
                const pid = String(p?.instanceId || '');
                const nid = String(n?.instanceId || '');
                if (pid) prevById.set(pid, { row: r, col: c, cell: p });
                if (nid) nextById.set(nid, { row: r, col: c, cell: n });
            }
        }
        for (const [id, from] of prevById.entries()) {
            const to = nextById.get(id);
            if (!to) continue;
            if (from.row === to.row && from.col === to.col) continue;
            out.push({
                isPlayer,
                fromRow: from.row,
                fromCol: from.col,
                toRow: to.row,
                toCol: to.col,
                previousCell: from.cell,
                cell: to.cell,
                instanceId: id,
                name: to.cell?.name || from.cell?.name || '',
                element: normalizeElement(to.cell?.element || from.cell?.element)
            });
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
                const prevShield = Number(p.shieldHp ?? 0);
                const nextShield = Number(n.shieldHp ?? 0);
                const shieldGained = Number.isFinite(prevShield) && Number.isFinite(nextShield) && nextShield > prevShield;
                if (same && nextHp > prevHp && !shieldGained) {
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: nextHp - prevHp,
                        element: normalizeElement(n.element || p.element),
                        name: n.name || p.name || '',
                        instanceId: String(n.instanceId || p.instanceId || n.id || p.id || ''),
                        prevHp,
                        nextHp,
                        prevShield,
                        nextShield,
                        prevMaxHp: p.maxHp,
                        nextMaxHp: n.maxHp,
                        printedHealth: n.printedHealth ?? p.printedHealth
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
                const prevShield = Number(p.shieldHp ?? 0);
                const nextShield = Number(n.shieldHp ?? 0);
                if (same && Number.isFinite(prevShield) && Number.isFinite(nextShield) && nextShield > prevShield) {
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: nextShield - prevShield,
                        prevShield,
                        nextShield,
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
                if (!p) continue;
                if (!n) {
                    const prevHp = Math.max(0, Number(p.hp) || 0);
                    const prevShield = Math.max(0, Number(p.shieldHp ?? 0) || 0);
                    if (prevHp <= 0 && prevShield <= 0) continue;
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: prevHp + prevShield,
                        shieldBroken: prevShield,
                        hpLoss: prevHp,
                        shieldFullyBroken: prevShield > 0,
                        element: normalizeElement(p.element),
                        name: p.name || '',
                        instanceId: String(p.instanceId || p.id || ''),
                        prevHp,
                        nextHp: 0,
                        prevShield,
                        nextShield: 0,
                        prevMaxHp: p.maxHp,
                        nextMaxHp: p.maxHp,
                        printedHealth: p.printedHealth,
                        lethalRemoval: true
                    });
                    continue;
                }
                const same = (p.instanceId && n.instanceId && p.instanceId === n.instanceId)
                    || (p.id && n.id && p.id === n.id)
                    || (String(p.name || '') === String(n.name || '') && p.name);
                if (!same) continue;
                const prevHp = p.hp ?? 0;
                const nextHp = n.hp ?? 0;
                const prevShield = Math.max(0, Number(p.shieldHp ?? 0) || 0);
                const nextShield = Math.max(0, Number(n.shieldHp ?? 0) || 0);
                if (same && (nextHp < prevHp || nextShield < prevShield)) {
                    const shieldBroken = Math.max(0, prevShield - nextShield);
                    const hpLoss = Math.max(0, prevHp - nextHp);
                    out.push({
                        isPlayer, row: r, col: c,
                        amount: shieldBroken + hpLoss,
                        shieldBroken,
                        hpLoss,
                        shieldFullyBroken: prevShield > 0 && nextShield === 0,
                        element: normalizeElement(n.element || p.element),
                        name: n.name || p.name || '',
                        instanceId: String(n.instanceId || p.instanceId || n.id || p.id || ''),
                        prevHp,
                        nextHp,
                        prevShield,
                        nextShield,
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
        // Trailing punctuation varies by log site ("uses Ember." / "uses Ember!"),
        // and the name has to come back clean — a stray "!" makes the ability-name
        // comparison in resolveAttackerFromLogs miss and costs the attack its
        // projectile.
        let m = text.match(/^(.+?)\s+uses\s+(.+?)[.!]?$/i);
        if (m) return { kind: 'ABILITY', actor: m[1].trim(), name: m[2].trim() };
        m = text.match(/^(.+?)\s+plays\s+(.+?)[.!]?$/i);
        if (m) return { kind: 'PLAY', actor: m[1].trim(), name: m[2].trim() };
        m = text.match(/^(.+?)\s+activates\s+(.+?)[.!]?$/i);
        if (m) return { kind: 'ABILITY', actor: m[1].trim(), name: m[2].trim() };
        return null;
    }

    function parseStatusSkipFromLog(line) {
        const text = stripLogPrefix(line);
        const m = text.match(/^(.+?)\s+is\s+(frozen|stunned)(?:\s+and\s+cannot\s+act)?[!.]?$/i);
        if (!m) return null;
        const word = m[2].trim().toLowerCase();
        const status = word === 'frozen' ? 'FREEZE' : 'SPEED_ZERO';
        return {
            actor: m[1].trim(),
            status,
            label: formatStatusLabel(status)
        };
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

    function parseSiegeBountyFromLog(line) {
        const text = stripLogPrefix(line);
        const m = text.match(/^(.+?)'s\s+bounty\s+deals\s+(\d+)\s+damage\s+to\s+(.+?)(?:\s*\([^)]*\))?[.!]?$/i);
        if (!m) return null;
        return {
            source: m[1].trim(),
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
            // Resolvers waiting on the queue to go idle (see onIdle). The queue
            // is the single authority on "presentation is busy" — game.js reads
            // it rather than keeping its own timers, so there is one clock.
            this._idleWaiters = [];
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
            this.pendingMoves = new Map();
            // Map<key, { isPlayer, row, col, displayHp, finalHp, maxHp, element }>
            // Board renders receive the server's post-damage state immediately;
            // these entries keep that resolved HP visible while the matching
            // attack animation finishes.
            this.pendingHealthChanges = new Map();
            // Map<P|E, { isPlayer, displayHealth, finalHealth, maxHealth }>
            // Direct player HP drops are held at the old number until the
            // health-bar projectile lands, matching board-card damage pacing.
            this.pendingDirectHealthChanges = new Map();
            // Map<key, { isPlayer, row, col, status }> — status badges (Freeze,
            // Weak, Damage Boost, etc.) that the server already reports but whose
            // animation hasn't played yet. The matching badge is held hidden
            // until the STATUS_APPLY / ATTACK action lands its effect, so the
            // player sees the status arrive with the animation rather than before.
            this.pendingStatusChanges = new Map();
            this.pendingLethalHolds = new Map();
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
                const isFast = this.speed === 'fast';
                btn.classList.toggle('fast', isFast);
                btn.textContent = isFast ? '\u23E9' : '\u25B6';
                const label = isFast ? 'Fast' : 'Normal';
                btn.title = `Playback speed: ${label}${isFast ? ' (40%)' : ''} — click to toggle`;
                btn.setAttribute('aria-label', `Animation speed: ${label}`);
            }
        }
        isProcessing() { return this.processing; }

        // Single write path for `processing`, so the body class and anything
        // awaiting idle can never drift from the queue's real state.
        _setProcessing(value) {
            const next = Boolean(value);
            if (this.processing === next) return;
            this.processing = next;
            document.body?.classList.toggle('sgl-playback-active', next);
            if (!next) {
                const waiters = this._idleWaiters;
                this._idleWaiters = [];
                for (const resolve of waiters) {
                    try { resolve(); } catch (_) {}
                }
            }
        }

        // Resolves once playback has drained. Callers use this instead of
        // polling `isProcessing()` on a timer.
        onIdle() {
            if (!this.processing) return Promise.resolve();
            return new Promise((resolve) => this._idleWaiters.push(resolve));
        }

        // True while a phase banner is on screen and still holding. game.js owns
        // the banner element, so it owns the answer.
        isPhaseBannerActive() {
            return Boolean(window.isPhaseTransitionBannerActive?.());
        }

        // The gate every interactive surface should consult: playback is mid-flight
        // or a phase banner is still announcing.
        isPresentationBusy() {
            return this.processing || this.isPhaseBannerActive();
        }

        clear() {
            this.queue = [];
            if (this.activeToast) { this.activeToast.dismiss(); this.activeToast = null; }
            this.toasts.clear();
            if (typeof window.hidePhaseTransitionBanner === 'function') {
                window.hidePhaseTransitionBanner();
            }
            this._setProcessing(false);
            this.markOpponentThinking(false);
            this.revealAllPendingPlacements();
            this.revealAllPendingMoves();
            this.settleAllPendingHealth();
            this.settleAllPendingDirectHealth();
            this.settleAllPendingStatuses();
            this.releaseAllPendingLethalHolds();
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
        _moveKey(isPlayer, fromRow, fromCol, toRow, toCol, instanceId) {
            return `${isPlayer ? 'P' : 'E'}:${fromRow}:${fromCol}->${toRow}:${toCol}:${instanceId || ''}`;
        }
        registerPendingMove(isPlayer, fromRow, fromCol, toRow, toCol, cell) {
            const id = String(cell?.instanceId || cell?.id || '');
            const key = this._moveKey(isPlayer, fromRow, fromCol, toRow, toCol, id);
            this.pendingMoves.set(key, { isPlayer, fromRow, fromCol, toRow, toCol, instanceId: id });
            this.schedulePendingSync();
            return key;
        }
        revealPendingMove(key) {
            const entry = this.pendingMoves.get(key);
            if (!entry) return null;
            this.pendingMoves.delete(key);
            const cellEl = findCellEl(entry.isPlayer, entry.toRow, entry.toCol);
            const card = cellEl?.querySelector('.board-card');
            if (card) {
                card.style.removeProperty('visibility');
                card.style.removeProperty('opacity');
            }
            return cellEl;
        }
        revealAllPendingMoves() {
            for (const key of Array.from(this.pendingMoves.keys())) {
                this.revealPendingMove(key);
            }
        }
        schedulePendingSync() {
            if (this._pendingSyncScheduled) return;
            this._pendingSyncScheduled = true;
            requestAnimationFrame(() => {
                this._pendingSyncScheduled = false;
                this.syncPendingPlacements();
                this.syncPendingMoves();
                this.syncPendingDirectHealth();
                this.syncPendingLethalHolds();
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
        syncPendingMoves() {
            for (const entry of this.pendingMoves.values()) {
                const cellEl = findCellEl(entry.isPlayer, entry.toRow, entry.toCol);
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
            return `${safeHp}/<span class="stat-hp-max">${safeMax}</span>`;
        }
        syncShieldVisualsToHealth(card, entry, shieldHp) {
            if (!card) return;
            const intactShield = Math.max(0, Number.isFinite(Number(shieldHp)) ? Number(shieldHp) : 0);
            const totalShield = intactShield;
            const shieldBadge = card.querySelector('.status-icons .sb-badge[data-status="HEALTH_BOOST"]');
            if (intactShield <= 0) {
                shieldBadge?.remove();
                const statusIcons = card.querySelector('.status-icons');
                if (statusIcons && !statusIcons.querySelector('.sb-badge')) {
                    statusIcons.remove();
                }
            } else if (shieldBadge) {
                shieldBadge.setAttribute('data-shield-state', 'intact');
                shieldBadge.title = `Shield +${totalShield}`;
                const num = shieldBadge.querySelector('.sb-num');
                if (num) num.textContent = `+${totalShield}`;
            }
            const hpBar = card.querySelector('.hp-bar');
            let plates = hpBar?.querySelector('.shield-plates');
            if (!hpBar) return;
            if (intactShield <= 0) {
                hpBar.classList.remove('is-shielded');
                plates?.remove();
                card.classList.remove('has-shield');
                return;
            }
            hpBar.classList.add('is-shielded');
            card.classList.add('has-shield');
            if (!plates) {
                plates = document.createElement('div');
                plates.className = 'shield-plates';
                hpBar.insertBefore(plates, hpBar.firstChild);
            }
            plates.dataset.shield = String(intactShield);
            const current = plates.querySelectorAll('.shield-plate').length;
            if (current === intactShield) return;
            plates.innerHTML = Array.from(
                { length: intactShield },
                (_, i) => `<div class="shield-plate" data-plate-index="${i}"></div>`
            ).join('');
        }
        resyncShieldFromState(isPlayer, row, col, fallbackShieldHp) {
            const getter = window.SieglingsBoardCellState?.getCell;
            const cell = getter ? getter(isPlayer, row, col) : null;
            const cellEl = findCellEl(isPlayer, row, col);
            const card = cellEl?.querySelector('.board-card');
            const stateShieldHp = Number(cell?.shieldHp);
            const fallback = Number(fallbackShieldHp);
            const renderedShieldHp = Number(card?.querySelector('.shield-plates')?.dataset?.shield);
            const shieldHp = Math.max(0,
                Number.isFinite(stateShieldHp) ? stateShieldHp
                    : Number.isFinite(fallback) ? fallback
                        : Number.isFinite(renderedShieldHp) ? renderedShieldHp : 0
            );
            if (!card) return shieldHp;
            this.syncShieldVisualsToHealth(card, {
                displayShield: shieldHp,
                maxHp: cell?.maxHp
            }, shieldHp);
            return shieldHp;
        }
        applyHealthToDom(entry, hp, maxHp) {
            if (!entry) return;
            const cellEl = findCellEl(entry.isPlayer, entry.row, entry.col);
            const card = cellEl?.querySelector('.board-card');
            if (!card) return;
            const resolvedMax = Number.isFinite(Number(maxHp)) ? Number(maxHp) : Number(entry.maxHp);
            const resolvedHp = Number.isFinite(Number(hp)) ? Number(hp) : Number(entry.finalHp);
            const resolvedShield = Number.isFinite(Number(entry.displayShield)) ? Number(entry.displayShield) : Number(entry.finalShield ?? 0);
            const barMax = resolvedMax;
            const barHp = resolvedHp;
            const pct = barMax > 0 ? Math.max(0, Math.min(100, (barHp / barMax) * 100)) : 0;
            const fill = card.querySelector('.hp-fill');
            const damaged = resolvedMax > 0 && resolvedHp < resolvedMax;
            if (fill) {
                fill.style.width = `${pct}%`;
                // Re-key the colour tier so the bar's hue tracks the new
                // remaining-HP percentage during the SAME width transition the
                // damage just triggered. Without this the fill keeps the tier
                // class it was first rendered with and only recolours on a later
                // full re-render — visibly lagging behind the bar shrink.
                const tierClass = (typeof hpFillTierClass === 'function')
                    ? hpFillTierClass(pct).trim()
                    : '';
                fill.classList.remove('hp-fill-high', 'hp-fill-mid', 'hp-fill-low', 'hp-fill-critical');
                if (tierClass) fill.classList.add(tierClass);
            }
            const hpPill = card.querySelector('.card-stat-pill-hp');
            if (hpPill) {
                hpPill.textContent = `HP: ${Math.max(0, resolvedHp)}`;
                hpPill.classList.toggle('is-damaged', damaged);
            }
            const hpStat = card.querySelector('.stat-hp');
            if (hpStat) {
                hpStat.innerHTML = this.renderHealthInner(entry, resolvedHp, resolvedMax);
                hpStat.classList.toggle('is-damaged', damaged);
            }
            this.syncShieldVisualsToHealth(card, entry, resolvedShield);
        }
        registerPendingHealth(target) {
            if (!target) return null;
            if (target.destroysTarget && target.ghostCell) {
                return this.registerPendingLethalHold(target);
            }
            const prevHp = Number(target.prevHp);
            const nextHp = Number(target.nextHp);
            const prevShield = Math.max(0, Number(target.prevShield) || 0);
            const nextShield = Math.max(0, Number(target.nextShield) || 0);
            const hpDropped = Number.isFinite(prevHp) && Number.isFinite(nextHp) && nextHp < prevHp;
            const shieldDropped = nextShield < prevShield;
            if (!hpDropped && !shieldDropped) {
                return null;
            }
            const id = String(target.instanceId || '');
            const key = this._healthKey(target.isPlayer, target.row, target.col, id);
            const maxHp = Number.isFinite(Number(target.nextMaxHp))
                ? Number(target.nextMaxHp)
                : Number(target.prevMaxHp);
            this.pendingHealthChanges.set(key, {
                isPlayer: target.isPlayer,
                row: target.row,
                col: target.col,
                instanceId: id,
                displayHp: hpDropped ? prevHp : nextHp,
                finalHp: Number.isFinite(nextHp) ? nextHp : prevHp,
                displayShield: prevShield,
                finalShield: nextShield,
                maxHp,
                printedHealth: target.printedHealth,
                element: target.element
            });
            return key;
        }
        // Register a heal whose displayed HP should be HELD at the pre-heal
        // value until its animation lands. Mirrors registerPendingHealth (used
        // for damage), but keeps the OLD hp/shield on screen (displayHp =
        // prevHp) and commits to the new values on release, so the bar visibly
        // rises during the heal cross instead of jumping ahead of it.
        registerPendingHeal(target) {
            if (!target) return null;
            const prevHp = Number(target.prevHp);
            const nextHp = Number(target.nextHp);
            if (!Number.isFinite(prevHp) || !Number.isFinite(nextHp)) {
                return null;
            }
            const id = String(target.instanceId || '');
            const key = this._healthKey(target.isPlayer, target.row, target.col, id);
            const maxHp = Number.isFinite(Number(target.nextMaxHp))
                ? Number(target.nextMaxHp)
                : Number(target.prevMaxHp);
            const prevShield = Number.isFinite(Number(target.prevShield)) ? Number(target.prevShield) : 0;
            const nextShield = Number.isFinite(Number(target.nextShield)) ? Number(target.nextShield) : 0;
            this.pendingHealthChanges.set(key, {
                isPlayer: target.isPlayer,
                row: target.row,
                col: target.col,
                instanceId: id,
                displayHp: prevHp,
                finalHp: nextHp,
                displayShield: prevShield,
                finalShield: nextShield,
                maxHp,
                printedHealth: target.printedHealth,
                element: target.element
            });
            this.syncPendingHealth();
            return key;
        }
        applyPendingImpactHealth(key) {
            if (!key) return;
            const entry = this.pendingHealthChanges.get(key);
            if (!entry) return;
            entry.displayHp = entry.finalHp;
            entry.displayShield = entry.finalShield;
            this.applyHealthToDom(entry, entry.displayHp, entry.maxHp);
        }
        applyPendingImpactHealthForTargets(targets) {
            for (const target of targets || []) {
                this.applyPendingImpactHealth(target?.pendingHealthKey);
            }
        }
        registerPendingLethalHold(target) {
            const cell = target.ghostCell;
            if (!cell) return null;
            const id = String(target.instanceId || cell.instanceId || cell.id || '');
            const key = this._healthKey(target.isPlayer, target.row, target.col, id);
            const prevHp = Number.isFinite(Number(target.prevHp))
                ? Number(target.prevHp)
                : Number(cell.hp ?? 0);
            const maxHp = Number.isFinite(Number(target.prevMaxHp))
                ? Number(target.prevMaxHp)
                : Number(cell.maxHp ?? prevHp);
            const prevShield = Number.isFinite(Number(target.prevShield))
                ? Number(target.prevShield)
                : Math.max(0, Number(cell.shieldHp ?? 0) || 0);
            this.pendingLethalHolds.set(key, {
                isPlayer: target.isPlayer,
                row: target.row,
                col: target.col,
                instanceId: id,
                cell: { ...cell },
                displayHp: Math.max(0, prevHp),
                finalHp: 0,
                displayShield: prevShield,
                finalShield: 0,
                maxHp,
                printedHealth: target.printedHealth ?? cell.printedHealth,
                element: target.element || cell.element
            });
            this.schedulePendingSync();
            return key;
        }
        getHeldBoardCard(isPlayer, row, col) {
            const cellEl = findCellEl(isPlayer, row, col);
            return cellEl?.querySelector('.board-card') || null;
        }
        applyLethalImpactHealth(key, target) {
            const entry = key ? this.pendingLethalHolds.get(key) : null;
            if (entry) {
                entry.displayHp = entry.finalHp;
                entry.displayShield = entry.finalShield;
                this.syncPendingLethalHolds();
                return;
            }
            this.releasePendingHealth(target?.pendingHealthKey);
        }
        releasePendingLethalHold(key) {
            if (!key) return;
            const entry = this.pendingLethalHolds.get(key);
            if (!entry) return;
            this.pendingLethalHolds.delete(key);
            if (typeof window.SieglingsBoardHold?.unmountHeldBoardCell === 'function') {
                const cellEl = findCellEl(entry.isPlayer, entry.row, entry.col);
                if (cellEl) window.SieglingsBoardHold.unmountHeldBoardCell(cellEl);
            }
        }
        releaseAllPendingLethalHolds() {
            for (const key of Array.from(this.pendingLethalHolds.keys())) {
                this.releasePendingLethalHold(key);
            }
        }
        syncPendingLethalHolds() {
            if (!this.pendingLethalHolds.size) return;
            if (typeof window.SieglingsBoardHold?.syncHeldCards !== 'function') return;
            window.SieglingsBoardHold.syncHeldCards(this.pendingLethalHolds);
            for (const entry of this.pendingLethalHolds.values()) {
                this.applyHealthToDom(entry, entry.displayHp, entry.maxHp);
            }
        }
        releasePendingHealth(key) {
            if (!key) return;
            const entry = this.pendingHealthChanges.get(key);
            if (!entry) return;
            if (entry.displayHp !== entry.finalHp || entry.displayShield !== entry.finalShield) {
                entry.displayHp = entry.finalHp;
                entry.displayShield = entry.finalShield;
                this.applyHealthToDom(entry, entry.finalHp, entry.maxHp);
            }
            this.pendingHealthChanges.delete(key);
        }
        releasePendingHealthForTargets(targets) {
            for (const target of targets || []) {
                this.releasePendingHealth(target?.pendingHealthKey);
            }
        }
        settleAllPendingHealth() {
            for (const key of Array.from(this.pendingHealthChanges.keys())) {
                this.applyPendingImpactHealth(key);
                this.releasePendingHealth(key);
            }
        }
        syncPendingHealth() {
            for (const entry of this.pendingHealthChanges.values()) {
                this.applyHealthToDom(entry, entry.displayHp, entry.maxHp);
            }
        }

        _directHealthKey(isPlayer) {
            return isPlayer ? 'P' : 'E';
        }
        registerPendingDirectHealth(target) {
            if (!target) return null;
            const prevHealth = Number(target.prevHealth);
            const nextHealth = Number(target.nextHealth);
            if (!Number.isFinite(prevHealth) || !Number.isFinite(nextHealth) || nextHealth >= prevHealth) {
                return null;
            }
            const key = this._directHealthKey(!!target.isPlayer);
            this.pendingDirectHealthChanges.set(key, {
                isPlayer: !!target.isPlayer,
                displayHealth: prevHealth,
                finalHealth: nextHealth,
                maxHealth: Number.isFinite(Number(target.maxHealth)) ? Number(target.maxHealth) : 50
            });
            this.syncPendingDirectHealth();
            return key;
        }
        getDisplayedHealth(isPlayer, fallbackHealth) {
            const entry = this.pendingDirectHealthChanges.get(this._directHealthKey(!!isPlayer));
            if (entry) return entry.displayHealth;
            const value = Number(fallbackHealth);
            return Number.isFinite(value) ? value : 0;
        }
        applyDirectHealthToDom(entry, health) {
            if (!entry) return;
            const isPlayer = !!entry.isPlayer;
            const safeHealth = Math.max(0, Number.isFinite(Number(health)) ? Number(health) : 0);
            const maxHealth = Math.max(1, Number.isFinite(Number(entry.maxHealth)) ? Number(entry.maxHealth) : 50);
            const pct = Math.max(0, Math.min(100, Math.round((safeHealth / maxHealth) * 100)));
            const textIds = isPlayer
                ? ['playerHealth', 'railPlayerHealth']
                : ['enemyHealth', 'railEnemyHealth'];
            for (const id of textIds) {
                const el = document.getElementById(id);
                if (el) el.textContent = String(safeHealth);
            }
            const fillIds = isPlayer
                ? ['railPlayerHpBar', 'mobilePlayerHpBar', 'safeHpFillPlayer']
                : ['railEnemyHpBar', 'mobileEnemyHpBar', 'safeHpFillEnemy'];
            for (const id of fillIds) {
                const fill = document.getElementById(id);
                if (fill) fill.style.width = `${pct}%`;
            }
            const safeFill = document.getElementById(isPlayer ? 'safeHpFillPlayer' : 'safeHpFillEnemy');
            const safeHalf = safeFill?.closest('.safe-hp-half');
            if (safeHalf) safeHalf.classList.toggle('danger', pct > 0 && pct <= 30);
        }
        syncPendingDirectHealth() {
            for (const entry of this.pendingDirectHealthChanges.values()) {
                this.applyDirectHealthToDom(entry, entry.displayHealth);
            }
        }
        applyPendingDirectHealth(key) {
            if (!key) return;
            const entry = this.pendingDirectHealthChanges.get(key);
            if (!entry) return;
            entry.displayHealth = entry.finalHealth;
            this.applyDirectHealthToDom(entry, entry.finalHealth);
        }
        releasePendingDirectHealth(key) {
            if (!key) return;
            this.applyPendingDirectHealth(key);
            this.pendingDirectHealthChanges.delete(key);
        }
        settleAllPendingDirectHealth() {
            for (const key of Array.from(this.pendingDirectHealthChanges.keys())) {
                this.releasePendingDirectHealth(key);
            }
        }

        // ── Pending-status registry ───────────────────────────────────────
        _statusKey(isPlayer, row, col, status) {
            return `${isPlayer ? 'P' : 'E'}:${row}:${col}:${String(status || '').toUpperCase()}`;
        }
        _setStatusBadgeHidden(entry, hidden) {
            const cellEl = findCellEl(entry.isPlayer, entry.row, entry.col);
            const card = cellEl?.querySelector('.board-card');
            if (!card) return;
            const badge = card.querySelector(
                `.status-icons .sb-badge[data-status="${entry.status}"]`
            );
            if (!badge) return;
            if (hidden) {
                // visibility (not display) keeps the badge's slot so the card
                // doesn't reflow when the icon pops in with its animation.
                badge.style.visibility = 'hidden';
                badge.style.opacity = '0';
            } else {
                badge.style.removeProperty('visibility');
                badge.style.removeProperty('opacity');
            }
        }
        registerPendingStatus(isPlayer, row, col, status) {
            const norm = String(status || '').toUpperCase();
            if (!norm) return null;
            const key = this._statusKey(isPlayer, row, col, norm);
            this.pendingStatusChanges.set(key, { isPlayer, row, col, status: norm });
            this.syncPendingStatuses();
            return key;
        }
        revealPendingStatus(isPlayer, row, col, status) {
            const key = this._statusKey(isPlayer, row, col, status);
            const entry = this.pendingStatusChanges.get(key);
            if (!entry) return;
            this.pendingStatusChanges.delete(key);
            this._setStatusBadgeHidden(entry, false);
        }
        revealPendingStatusesForTarget(target, statuses) {
            if (!target || !Array.isArray(statuses)) return;
            for (const status of statuses) {
                this.revealPendingStatus(target.isPlayer, target.row, target.col, status);
            }
        }
        settleAllPendingStatuses() {
            for (const [key, entry] of Array.from(this.pendingStatusChanges.entries())) {
                this.pendingStatusChanges.delete(key);
                this._setStatusBadgeHidden(entry, false);
            }
        }
        syncPendingStatuses() {
            for (const entry of this.pendingStatusChanges.values()) {
                this._setStatusBadgeHidden(entry, true);
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
                    '.safe-hp-player',
                    '.tb-hp-player'
                ]
                : [
                    '#hudRailEnemy .hud-hp-row',
                    '.mobile-hud-enemy',
                    '.safe-hp-enemy',
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
        _fractureHealthBar(isPlayer, elementHexValue) {
            const el = this._getHealthBarEl(isPlayer);
            if (!el) return;
            const crackColor = elementHexValue || ELEMENT_HEX.NEUTRAL;
            el.style.setProperty('--sgl-siege-crack', crackColor);
            el.classList.remove('sgl-health-fracture');
            el.querySelectorAll(':scope > .sgl-health-cracks').forEach((node) => node.remove());

            const overlay = document.createElement('span');
            overlay.className = 'sgl-health-cracks';
            overlay.setAttribute('aria-hidden', 'true');
            const cracks = [
                ['16%', '44%', '44px', '-18deg'],
                ['30%', '24%', '54px', '36deg'],
                ['45%', '52%', '66px', '-7deg'],
                ['58%', '31%', '46px', '54deg'],
                ['70%', '57%', '58px', '-34deg'],
                ['81%', '38%', '38px', '20deg']
            ];
            overlay.innerHTML = cracks.map(([left, top, width, rotate], index) =>
                `<span style="left:${left};top:${top};width:${width};transform:rotate(${rotate});animation-delay:${index * 28}ms"></span>`
            ).join('');
            el.appendChild(overlay);
            void el.offsetWidth;
            el.classList.add('sgl-health-fracture');
            setTimeout(() => {
                el.classList.remove('sgl-health-fracture');
                overlay.remove();
            }, 920);
        }

        enqueueAction(action) {
            if (!action) return;
            this.queue.push(action);
            this._kick();
        }

        enqueueFromStateDiff(prevState, nextState, playbackContext = null) {
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
            const claimLogs    = newLogs.map(parseClaimFromLog).filter(Boolean);
            const isClaimRemoval = (entry) => claimLogs.some((claim) =>
                namesMatch(claim.name, entry.name)
                && (!claim.element || claim.element === normalizeElement(entry.cell?.element || entry.element))
            );
            const siegeBountyLogs = newLogs.map(parseSiegeBountyFromLog).filter(Boolean);
            const findSiegeBountyHit = (targetNames, amount) => {
                if (!amount || !siegeBountyLogs.length) return null;
                const names = (targetNames || []).filter(Boolean);
                const matches = siegeBountyLogs.filter((entry) =>
                    entry.amount > 0
                    && (!names.length || names.some((name) => namesMatch(entry.target, name)))
                );
                const exact = matches.find((entry) => entry.amount === amount);
                if (exact) return exact;
                const total = matches.reduce((sum, entry) => sum + entry.amount, 0);
                if (total === amount) {
                    return {
                        source: matches.map((entry) => entry.source).filter(Boolean).join(', '),
                        amount: total,
                        target: matches[0]?.target || ''
                    };
                }
                return null;
            };

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
            const soloAiEndFlow = playbackContext?.soloAiEndTurn === true
                && !nextState.multiplayer;
            const setupToBattle = phaseChanged
                && prevState.currentPhase === 'SETUP'
                && nextState.currentPhase === 'BATTLE';

            // Opponent turn beginning → thinking indicator
            if (!soloAiEndFlow && prevState.activeSide !== 'ENEMY' && nextState.activeSide === 'ENEMY' && !nextState.gameOver) {
                this.markOpponentThinking(true, nextState);
            }

            // Collect placements and damage now but enqueue them in the right
            // order at the end of this method.
            const evolutionLogs = newLogs.map(parseEvolutionFromLog).filter(Boolean);
            const movesOnPlayer = diffMoves(prevPlayer, nextPlayer, true);
            const movesOnEnemy  = diffMoves(prevEnemy,  nextEnemy,  false);
            const isMoveOrigin = (entry, moves) => moves.some((move) =>
                move.fromRow === entry.row
                && move.fromCol === entry.col
                && (!entry.instanceId || !move.instanceId || move.instanceId === entry.instanceId)
            );
            const isMoveDestination = (entry, moves) => moves.some((move) =>
                move.toRow === entry.row
                && move.toCol === entry.col
                && (!entry.cell?.instanceId || !move.instanceId || move.instanceId === String(entry.cell.instanceId))
            );
            const tagEvolutionPlacements = (placements, prevBoard) => placements.map((p) => {
                const previousCell = prevBoard?.[p.row]?.[p.col];
                if (!previousCell) return p;
                const loggedEvolution = evolutionLogs.find((e) =>
                    namesMatch(e.from, previousCell.name) && namesMatch(e.to, p.cell?.name)
                );
                return loggedEvolution ? { ...p, evolutionFrom: previousCell } : p;
            });
            const newPlayerPlacements = tagEvolutionPlacements(diffPlacements(prevPlayer, nextPlayer, true), prevPlayer)
                .filter((p) => !isMoveDestination(p, movesOnPlayer));
            const newEnemyPlacements  = tagEvolutionPlacements(diffPlacements(prevEnemy,  nextEnemy,  false), prevEnemy)
                .filter((p) => !isMoveDestination(p, movesOnEnemy));

            // Damage events (attacks / abilities that hit)
            let damageOnPlayer = diffDamage(prevPlayer, nextPlayer, true)
                .filter((t) => !isClaimRemoval(t))
                .filter((t) => !isMoveOrigin(t, movesOnPlayer));
            let damageOnEnemy  = diffDamage(prevEnemy,  nextEnemy,  false)
                .filter((t) => !isClaimRemoval(t))
                .filter((t) => !isMoveOrigin(t, movesOnEnemy));

            // Shields granted during the turn evaporate in the server's
            // end-of-turn cleanup (clearTempEffects), surfacing in the diff as a
            // shield-only drop to zero with no HP loss. The damage diff would
            // otherwise read that as an attack that "broke" the shield and fire a
            // phantom projectile at the card. When it lands together with the
            // battle ending (BATTLE -> DRAW), treat it as natural expiry and play a
            // crumble animation instead. Do NOT treat SETUP -> BATTLE this way —
            // shields cast during setup must persist into the battle phase.
            const shieldExpiryOnPlayer = [];
            const shieldExpiryOnEnemy = [];
            const shieldsExpireThisStep = phaseChanged
                && prevState.currentPhase === 'BATTLE'
                && nextState.currentPhase === 'DRAW';
            if (shieldsExpireThisStep) {
                const splitShieldExpiry = (damageList, expiryOut) => {
                    for (let i = damageList.length - 1; i >= 0; i--) {
                        const d = damageList[i];
                        if (Number(d.hpLoss) === 0 && Number(d.shieldBroken) > 0 && Number(d.nextShield) === 0) {
                            expiryOut.push(d);
                            damageList.splice(i, 1);
                        }
                    }
                };
                splitShieldExpiry(damageOnPlayer, shieldExpiryOnPlayer);
                splitShieldExpiry(damageOnEnemy, shieldExpiryOnEnemy);
            }

            // Burn / Toxin / Wither ticks damage a card from a badge it already
            // carries. Pull them out of the damage diff before source resolution
            // so they can't fall through to the sourceless projectile fallback,
            // which would fling a phantom bolt across the board at a card that
            // nothing attacked.
            const afflictionTickLogs = newLogs.map(parseAfflictionTickFromLog).filter(Boolean);
            const takeAfflictionTick = (entry) => {
                if (!afflictionTickLogs.length) return null;
                const hpLoss = Number(entry.hpLoss);
                const amount = Number.isFinite(hpLoss) ? hpLoss : (Number(entry.amount) || 0);
                let idx = afflictionTickLogs.findIndex((tick) =>
                    namesMatch(tick.target, entry.name)
                    && (tick.amount == null || tick.amount === amount)
                );
                if (idx === -1) {
                    idx = afflictionTickLogs.findIndex((tick) => namesMatch(tick.target, entry.name));
                }
                if (idx === -1) return null;
                return afflictionTickLogs.splice(idx, 1)[0];
            };
            const afflictionTicksOnPlayer = [];
            const afflictionTicksOnEnemy = [];
            const splitAfflictionTicks = (damageList, out) => {
                for (let i = damageList.length - 1; i >= 0; i--) {
                    const tick = takeAfflictionTick(damageList[i]);
                    if (!tick) continue;
                    out.unshift({ ...damageList[i], afflictionTick: tick });
                    damageList.splice(i, 1);
                }
            };
            splitAfflictionTicks(damageOnPlayer, afflictionTicksOnPlayer);
            splitAfflictionTicks(damageOnEnemy, afflictionTicksOnEnemy);

            // Trap / spell / trainer-active damage: no board cell fired it, so the
            // knight's element is the only colour the queue could reach for. Ask
            // the catalog what the named card actually is, so the border burns in
            // the trap's own element rather than its owner's.
            const effectCardLogs = newLogs.map(parseEffectCardFromLog).filter(Boolean);
            const damageLogs = newLogs.map(parseDamageFromLog).filter(Boolean);
            const effectElementForTarget = (name, amount) => {
                const hit = damageLogs.find((d) =>
                    namesMatch(d.target, name) && (!amount || d.amount === amount)
                ) || damageLogs.find((d) => namesMatch(d.target, name));
                // The damage line names the ability; fall back to the card named
                // by the cast/spring line in this same batch.
                const byAbility = hit ? effectElementForName(hit.abilityOrSource) : null;
                if (byAbility) return byAbility;
                for (const effect of effectCardLogs) {
                    const byCard = effectElementForName(effect.name);
                    if (byCard) return byCard;
                }
                return null;
            };

            // Chain damage hop structure for this batch, keyed off the arc log
            // lines. A target only counts as a chain primary when the same
            // ability is also logged as damaging it, so an unrelated attack on a
            // same-named card elsewhere in the batch can't hijack the ordering.
            const chainArcs = newLogs.map(parseChainArcFromLog).filter(Boolean);
            const damagedByAbility = (ability, name) => damageLogs.some((d) =>
                namesMatch(d.abilityOrSource, ability) && namesMatch(d.target, name)
            );
            // Notch links reach one step in any of the eight directions, so a
            // bounce victim always sits in a cell touching its primary.
            const touchesCell = (a, b) => a.isPlayer === b.isPlayer
                && Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) === 1;
            /**
             * Split a damage group into [{ primary, links }] hops, or null when it
             * isn't a chain — which is also how a multi-primary chain gets pulled
             * back apart from the flat, row/col-ordered damage list.
             */
            const buildChainSteps = (groupTargets) => {
                if (!chainArcs.length || groupTargets.length < 2) return null;
                const steps = [];
                for (const arc of chainArcs) {
                    const primary = groupTargets.find((tt) =>
                        namesMatch(tt.name, arc.primary)
                        && damagedByAbility(arc.ability, tt.name)
                        && !steps.some((s) => s.primary === tt)
                    );
                    if (primary) steps.push({ ability: arc.ability, primary, links: [] });
                }
                if (!steps.length) return null;
                for (const tt of groupTargets) {
                    if (steps.some((s) => s.primary === tt)) continue;
                    const owner = steps.find((s) =>
                        touchesCell(s.primary, tt) && damagedByAbility(s.ability, tt.name)
                    );
                    if (owner) owner.links.push(tt);
                    else return null; // a victim this chain can't explain — play it as a barrage
                }
                return steps.some((s) => s.links.length) ? steps : null;
            };

            // Badges that landed on top of a real hit — the attack keeps its
            // projectile, and the element's border lights up on impact.
            const afflictionApplyLogs = newLogs.map(parseAfflictionApplyFromLog).filter(Boolean);
            const afflictionAuraFor = (name) => {
                const hit = afflictionApplyLogs.find((entry) => namesMatch(entry.target, name));
                if (!hit) return null;
                return { affliction: hit.affliction, element: afflictionProfile(hit.affliction).element };
            };

            // Destruction events (cards that no longer exist). Paired with attacks
            // below so the killed card stays visible until the projectile lands.
            const isEvolutionDestruction = (d, placements) => placements.some((p) =>
                p.evolutionFrom
                && p.row === d.row
                && p.col === d.col
                && namesMatch(p.evolutionFrom.name, d.name)
            );
            const destructionsOnPlayer = diffDestructions(prevPlayer, nextPlayer, true)
                .filter((d) => !isClaimRemoval(d))
                .filter((d) => !isEvolutionDestruction(d, newPlayerPlacements))
                .filter((d) => !isMoveOrigin(d, movesOnPlayer));
            const destructionsOnEnemy  = diffDestructions(prevEnemy,  nextEnemy,  false)
                .filter((d) => !isClaimRemoval(d))
                .filter((d) => !isEvolutionDestruction(d, newEnemyPlacements))
                .filter((d) => !isMoveOrigin(d, movesOnEnemy));
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
            const PHASE_GAP_MS   = this.speed === 'fast' ? 200 : 420;
            const PHASE_BANNER_MS = this.speed === 'fast' ? 1100 : 2000;
            const FIRST_PLAY_GAP = this.speed === 'fast' ? 120 : 360;
            const NEXT_PLAY_GAP  = this.speed === 'fast' ? 80 : 160;
            const ENEMY_PLACEMENT_MS = this.speed === 'fast' ? 420 : 1000;
            let phaseTransitionQueued = false;
            let aiPlacementPlaybackStarted = false;

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
                const placementKey = this.registerPendingPlacement(
                    placementIsPlayer, p.row, p.col, p.cell
                );
                const enemyPaced = side === 'ENEMY';
                const beginsAiPlayback = soloAiEndFlow && enemyPaced && !aiPlacementPlaybackStarted;
                if (beginsAiPlayback) aiPlacementPlaybackStarted = true;
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
                    placementKey,
                    beginsAiPlayback,
                    minActionMs: enemyPaced ? ENEMY_PLACEMENT_MS : null,
                    gapAfterMs: enemyPaced
                        ? 0
                        : (isFirst ? FIRST_PLAY_GAP : NEXT_PLAY_GAP)
                });
            };

            const enqueuePhaseTransitionAction = (force = false) => {
                if ((!phaseChanged && !force) || phaseTransitionQueued) return;
                phaseTransitionQueued = true;
                this.enqueueAction({
                    kind: 'PHASE',
                    phase: nextState.currentPhase,
                    activeSide: nextState.activeSide || 'PLAYER',
                    side: nextState.activeSide || 'PLAYER',
                    holdMs: PHASE_BANNER_MS,
                    gapAfterMs: PHASE_GAP_MS
                });
            };

            if (soloAiEndFlow) {
                for (const p of newPlayerPlacements) enqueuePlacementAction(p, 'PLAYER', playerKnight, playerName);
                for (const p of newEnemyPlacements)  enqueuePlacementAction(p, 'ENEMY',  enemyKnight,  enemyName);
                newPlayerPlacements.length = 0;
                newEnemyPlacements.length = 0;
            } else if (setupToBattle) {
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
                        prevShield: t.prevShield,
                        nextShield: t.nextShield,
                        prevMaxHp: t.prevMaxHp,
                        nextMaxHp: t.nextMaxHp,
                        printedHealth: t.printedHealth,
                        afflictionAura: afflictionAuraFor(t.name)
                    };
                    targetEntry.pendingHealthKey = this.registerPendingHealth(targetEntry);
                    if (targetEntry.destroysTarget) {
                        targetEntry.pendingLethalKey = targetEntry.pendingHealthKey;
                    }
                    const srcElement = normalizeElement(srcRef?.pending?.element || srcRef?.cell?.element)
                        || (srcRef ? null : effectElementForTarget(t.name, Number(t.amount) || 0))
                        || sideKnight;
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

            // Affliction ticks read as something happening *to* the card, so the
            // toast is sided with the card's owner and no attacker is named.
            const enqueueAfflictionTicks = (ticks, destructionList, side, knight) => {
                for (const d of ticks) {
                    const profile = afflictionProfile(d.afflictionTick.affliction);
                    const destroyed = matchDestruction(destructionList, d);
                    const target = {
                        isPlayer: d.isPlayer,
                        row: d.row, col: d.col,
                        amount: d.amount,
                        shieldBroken: Number(d.shieldBroken) || 0,
                        hpLoss: Number(d.hpLoss) || 0,
                        shieldFullyBroken: !!d.shieldFullyBroken,
                        element: d.element,
                        name: d.name,
                        destroysTarget: !!destroyed,
                        ghostCell: destroyed?.cell || null,
                        instanceId: d.instanceId,
                        prevHp: d.prevHp,
                        nextHp: d.nextHp,
                        prevShield: d.prevShield,
                        nextShield: d.nextShield,
                        prevMaxHp: d.prevMaxHp,
                        nextMaxHp: d.nextMaxHp,
                        printedHealth: d.printedHealth
                    };
                    const pendingHealthKey = this.registerPendingHealth(target);
                    this.enqueueAction({
                        kind: 'AFFLICTION',
                        side,
                        actorName: d.name || 'Card',
                        label: `suffers ${profile.label}`,
                        targetName: '',
                        amount: d.amount,
                        shieldBroken: target.shieldBroken,
                        hpLoss: target.hpLoss,
                        affliction: d.afflictionTick.affliction,
                        knightElement: knight,
                        elementColor: profile.element,
                        source: null,
                        target: {
                            isPlayer: d.isPlayer, row: d.row, col: d.col,
                            element: d.element || profile.element
                        },
                        destroysTarget: target.destroysTarget,
                        ghostCell: target.ghostCell,
                        pendingHealthKey,
                        pendingLethalKey: target.destroysTarget ? pendingHealthKey : null,
                        gapAfterMs: BATTLE_GAP_MS
                    });
                }
            };
            enqueueAfflictionTicks(afflictionTicksOnPlayer, destructionsOnPlayer, 'PLAYER', playerKnight);
            enqueueAfflictionTicks(afflictionTicksOnEnemy, destructionsOnEnemy, 'ENEMY', enemyKnight);

            const playerGroups = groupDamage(damageOnEnemy, destructionsOnEnemy, resolvePlayerSource, playerKnight, false);
            const enemyGroups  = groupDamage(damageOnPlayer, destructionsOnPlayer, resolveEnemySource, enemyKnight,  true);

            // Status events (e.g. Freeze applied to a card without damage).
            // Merge into an existing same-source damage group when the target
            // cell already takes damage from that attacker, otherwise create a
            // new group so the queue still fires a projectile and animates
            // the status landing.
            const newStatusesOnEnemy  = diffStatuses(prevEnemy,  nextEnemy,  false);
            const newStatusesOnPlayer = diffStatuses(prevPlayer, nextPlayer, true);
            // Hold each newly-applied status badge hidden until its action plays
            // so the icon appears with the landing animation, not before it.
            for (const s of newStatusesOnEnemy)  this.registerPendingStatus(s.isPlayer, s.row, s.col, s.status);
            for (const s of newStatusesOnPlayer) this.registerPendingStatus(s.isPlayer, s.row, s.col, s.status);
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
                        pendingLethalKey: t.pendingLethalKey,
                        statuses: t.statuses && t.statuses.length ? t.statuses.slice() : null,
                        afflictionAura: t.afflictionAura || null,
                        gapAfterMs: BATTLE_GAP_MS
                    });
                    return;
                }
                // Multi-target: simultaneous barrage. Keep the aggregate for
                // camera-shake strength, but describe every hit in the toast
                // instead of hiding unequal/per-card results behind one total.
                const totalDmg = targets.reduce((sum, tt) => sum + (Number(tt.amount) || 0), 0);
                const totalShieldBroken = targets.reduce((sum, tt) => sum + (Number(tt.shieldBroken) || 0), 0);
                const totalHpLoss = targets.reduce((sum, tt) => sum + (Number(tt.hpLoss) || 0), 0);
                const groupLabel = describeTargets(targets, defenderLabel);
                const damageDetails = targets
                    .filter((tt) => Number(tt.amount) > 0)
                    .map((tt) => `${Number(tt.amount)} damage to ${tt.name || defenderLabel}`)
                    .join(' and ');
                const actionTargets = targets.map((tt) => ({
                    isPlayer: tt.isPlayer, row: tt.row, col: tt.col,
                    element: tt.element || srcElement,
                    name: tt.name,
                    amount: tt.amount,
                    shieldBroken: tt.shieldBroken,
                    hpLoss: tt.hpLoss,
                    destroysTarget: tt.destroysTarget,
                    ghostCell: tt.ghostCell,
                    pendingHealthKey: tt.pendingHealthKey,
                    pendingLethalKey: tt.pendingLethalKey,
                    statuses: tt.statuses && tt.statuses.length ? tt.statuses.slice() : null,
                    afflictionAura: tt.afflictionAura || null
                }));
                // Chain hops reference the same objects the barrage path uses, so
                // pending health/lethal keys stay shared between both playbacks.
                const chainSteps = buildChainSteps(actionTargets);
                this.enqueueAction({
                    kind: 'ATTACK',
                    side,
                    actorName: realAttacker || groupLabel,
                    targetName: damageDetails || groupLabel,
                    label: realAttacker ? 'deals' : 'takes',
                    hideAmount: true,
                    amount: totalDmg,
                    shieldBroken: totalShieldBroken,
                    hpLoss: totalHpLoss,
                    knightElement: knight,
                    elementColor: srcElement,
                    source: sourcePayload,
                    targets: actionTargets,
                    chainSteps,
                    gapAfterMs: BATTLE_GAP_MS
                });
            };

            for (const group of playerGroups.values()) enqueueAttackGroup(group, 'PLAYER', playerKnight, playerName, 'enemies');
            for (const group of enemyGroups.values())  enqueueAttackGroup(group, 'ENEMY',  enemyKnight,  enemyName,  'allies');

            const enqueueMove = (move, side, knight) => {
                const el = normalizeElement(move.cell?.element || move.previousCell?.element) || knight;
                const rowName = ROW_LABELS[move.toRow] || 'Row';
                const moveKey = this.registerPendingMove(
                    move.isPlayer,
                    move.fromRow,
                    move.fromCol,
                    move.toRow,
                    move.toCol,
                    move.cell || move.previousCell
                );
                if (move.name) enqueuedAttackerNames.add(move.name);
                this.enqueueAction({
                    kind: 'MOVE',
                    side,
                    actorName: move.name || 'Card',
                    label: 'shifts to',
                    targetName: `${rowName} row, col ${move.toCol}`,
                    knightElement: knight,
                    elementColor: el,
                    source: { isPlayer: move.isPlayer, row: move.fromRow, col: move.fromCol },
                    target: { isPlayer: move.isPlayer, row: move.toRow, col: move.toCol, element: el },
                    moveKey,
                    gapAfterMs: BATTLE_GAP_MS
                });
            };
            for (const move of movesOnPlayer) enqueueMove(move, 'PLAYER', playerKnight);
            for (const move of movesOnEnemy)  enqueueMove(move, 'ENEMY',  enemyKnight);

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

            // Status-caused lost turns are log-only state changes, so surface
            // them as a short toast + pulse on the skipped card.
            for (const line of newLogs) {
                const parsed = parseStatusSkipFromLog(line);
                if (!parsed) continue;
                const playerHit = findCellByName(nextPlayer, parsed.actor) || findCellByName(prevPlayer, parsed.actor);
                const enemyHit = findCellByName(nextEnemy, parsed.actor) || findCellByName(prevEnemy, parsed.actor);
                const hit = playerHit
                    ? { ...playerHit, isPlayer: true }
                    : enemyHit
                        ? { ...enemyHit, isPlayer: false }
                        : null;
                if (!hit) continue;
                const knight = hit.isPlayer ? playerKnight : enemyKnight;
                const statusEl = statusProfile(parsed.status).element;
                this.enqueueAction({
                    kind: 'STATUS_SKIP',
                    side: hit.isPlayer ? 'PLAYER' : 'ENEMY',
                    actorName: parsed.actor,
                    targetName: parsed.label,
                    knightElement: knight,
                    elementColor: statusEl,
                    target: {
                        isPlayer: hit.isPlayer,
                        row: hit.row,
                        col: hit.col,
                        element: normalizeElement(hit.cell?.element) || statusEl
                    },
                    statuses: [parsed.status],
                    gapAfterMs: BATTLE_GAP_MS
                });
            }

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
                // Hold the target's HP at its pre-heal value until the heal
                // animation lands, so the green "+N" and the rising bar play
                // together rather than the number being updated up front.
                const pendingHealthKey = this.registerPendingHeal({
                    isPlayer: h.isPlayer,
                    row: h.row,
                    col: h.col,
                    instanceId: h.instanceId,
                    prevHp: h.prevHp,
                    nextHp: h.nextHp,
                    prevShield: h.prevShield,
                    nextShield: h.nextShield,
                    prevMaxHp: h.prevMaxHp,
                    nextMaxHp: h.nextMaxHp,
                    printedHealth: h.printedHealth,
                    element: h.element
                });
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
                    pendingHealthKey,
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
                    target: {
                        isPlayer: h.isPlayer,
                        row: h.row,
                        col: h.col,
                        element: 'METAL',
                        shieldHp: h.nextShield
                    },
                    gapAfterMs: BATTLE_GAP_MS
                });
            };
            for (const h of healingOnPlayer) queueHeal(h);
            for (const h of healingOnEnemy)  queueHeal(h);
            for (const h of shieldsOnPlayer) queueShield(h);
            for (const h of shieldsOnEnemy)  queueShield(h);

            // Expiring shields crumble away together at the end of the turn —
            // one action animating every dissipating shield simultaneously,
            // queued just before the phase transition.
            const expiryTargets = [];
            const pushExpiry = (list, ownerKnight) => {
                for (const d of list) {
                    expiryTargets.push({
                        isPlayer: d.isPlayer,
                        row: d.row,
                        col: d.col,
                        element: normalizeElement(d.element) || ownerKnight,
                        shieldBroken: Number(d.shieldBroken) || 1,
                        name: d.name
                    });
                }
            };
            pushExpiry(shieldExpiryOnPlayer, playerKnight);
            pushExpiry(shieldExpiryOnEnemy, enemyKnight);
            if (expiryTargets.length) {
                this.enqueueAction({
                    kind: 'SHIELD_EXPIRE',
                    side: 'PLAYER',
                    knightElement: 'METAL',
                    elementColor: 'METAL',
                    targets: expiryTargets,
                    gapAfterMs: BATTLE_GAP_MS
                });
            }

            // Phase change toast — appended AFTER the just-ended phase's
            // animations and BEFORE the new phase's placements, so the toast
            // marks the boundary between the two blocks the player sees.
            if (!soloAiEndFlow) enqueuePhaseTransitionAction();

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
                const siegeHit = findSiegeBountyHit([
                    enemyName,
                    nextState.enemy?.name,
                    prevState.enemy?.name
                ], dmg);
                const pendingDirectHealthKey = this.registerPendingDirectHealth({
                    isPlayer: false,
                    prevHealth: prevEnemyHp,
                    nextHealth: nextEnemyHp,
                    maxHealth: 50
                });
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
                    actorName: siegeHit?.source ? `${siegeHit.source}'s bounty` : (srcRef?.cell?.name || srcRef?.pending?.name || playerName),
                    targetName: enemyName,
                    amount: dmg,
                    label: siegeHit ? 'Siege damage' : undefined,
                    siegeDamage: Boolean(siegeHit),
                    knightElement: playerKnight,
                    elementColor: siegeHit ? enemyKnight : srcElement,
                    source: (!siegeHit && srcRef) ? { isPlayer: true, row: srcRef.row, col: srcRef.col } : null,
                    target: { healthBar: true, isPlayer: false, element: siegeHit ? enemyKnight : srcElement, pendingDirectHealthKey },
                    pendingDirectHealthKey,
                    gapAfterMs: BATTLE_GAP_MS
                });
            }
            if (Number.isFinite(prevPlayerHp) && Number.isFinite(nextPlayerHp) && nextPlayerHp < prevPlayerHp) {
                const dmg = prevPlayerHp - nextPlayerHp;
                const siegeHit = findSiegeBountyHit([
                    playerName,
                    nextState.player?.name,
                    prevState.player?.name
                ], dmg);
                const pendingDirectHealthKey = this.registerPendingDirectHealth({
                    isPlayer: true,
                    prevHealth: prevPlayerHp,
                    nextHealth: nextPlayerHp,
                    maxHealth: 50
                });
                const srcRef = findCellOnBoard(prevEnemy, () => true);
                const srcElement = normalizeElement(srcRef?.cell?.element) || enemyKnight;
                this.enqueueAction({
                    kind: 'ATTACK',
                    side: 'ENEMY',
                    actorName: siegeHit?.source ? `${siegeHit.source}'s bounty` : (srcRef?.cell?.name || enemyName),
                    targetName: playerName,
                    amount: dmg,
                    label: siegeHit ? 'Siege damage' : undefined,
                    siegeDamage: Boolean(siegeHit),
                    knightElement: enemyKnight,
                    elementColor: siegeHit ? playerKnight : srcElement,
                    source: (!siegeHit && srcRef) ? { isPlayer: false, row: srcRef.row, col: srcRef.col } : null,
                    target: { healthBar: true, isPlayer: true, element: siegeHit ? playerKnight : srcElement, pendingDirectHealthKey },
                    pendingDirectHealthKey,
                    gapAfterMs: BATTLE_GAP_MS
                });
            }

            if (soloAiEndFlow && !nextState.gameOver) {
                this.enqueueAction({
                    kind: 'THINK',
                    side: 'ENEMY',
                    state: nextState,
                    holdMs: this.speed === 'fast' ? 240 : 650
                });
                this.enqueueAction({
                    kind: 'CHAT',
                    side: 'ENEMY',
                    emoji: pickAiChatEmoji(nextState),
                    holdMs: this.speed === 'fast' ? 520 : 1250,
                    gapAfterMs: this.speed === 'fast' ? 100 : 260
                });
                enqueuePhaseTransitionAction(true);
            }
        }

        async beginSoloAiEndTurn(state) {
            // A fast player can draw and immediately end setup while the Draw
            // Phase banner is still resolving. Start this flow only after the
            // previous playback batch has cleared so its banner/toasts cannot
            // overlap the end-turn and AI-thinking beats. The PHASE action
            // awaits its own banner, so an idle queue means the banner has
            // already finished — no need to cut it short.
            await this.onIdle();
            if (this.activeToast) {
                this.activeToast.dismiss();
                this.activeToast = null;
            }
            const playerName = state?.playerName || state?.player?.name || 'You';
            const playerKnight = getKnightElement(state, 'PLAYER');
            const holdMs = this.speed === 'fast' ? 520 : 1000;
            this.activeToast = this.toasts.show({
                kind: 'TURN',
                label: 'ends turn',
                actorName: playerName,
                targetName: '',
                subtitle: 'The opponent is taking their setup actions.',
                side: 'PLAYER',
                knightElement: playerKnight,
                elementColor: playerKnight,
                hideAmount: true
            }, holdMs);
            await sleep(holdMs);
            if (this.activeToast) {
                this.activeToast.dismiss();
                this.activeToast = null;
            }
            await sleep(this.speed === 'fast' ? 100 : 240);
            this.markOpponentThinking(true, state);
            await sleep(this.speed === 'fast' ? 120 : 280);
        }

        _visibleCenter(selectors, fallbackX, fallbackY) {
            for (const selector of selectors) {
                const node = document.querySelector(selector);
                if (!node) continue;
                const rect = node.getBoundingClientRect();
                const style = window.getComputedStyle(node);
                if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') {
                    continue;
                }
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
            return { x: fallbackX, y: fallbackY };
        }

        async showOpponentChatBubble(action) {
            document.querySelectorAll('.sgl-ai-chat-bubble').forEach((node) => node.remove());
            const source = this._visibleCenter(
                ['#hudRailEnemy .hud-knight-card', '.mobile-hud-enemy', '#enemyGrid'],
                window.innerWidth * 0.72,
                window.innerHeight * 0.24
            );
            const target = this._visibleCenter(
                ['#hudRailPlayer .hud-knight-card', '.mobile-hud-player', '#playerGrid'],
                window.innerWidth * 0.28,
                window.innerHeight * 0.76
            );
            const node = document.createElement('div');
            node.className = 'sgl-ai-chat-bubble';
            node.setAttribute('role', 'status');
            node.setAttribute('aria-label', 'Opponent sends a reaction');
            node.style.left = `${source.x}px`;
            node.style.top = `${source.y}px`;
            node.style.setProperty('--sgl-chat-x', `${Math.max(-90, Math.min(90, (target.x - source.x) * 0.16))}px`);
            node.style.setProperty('--sgl-chat-y', `${Math.max(-80, Math.min(80, (target.y - source.y) * 0.16))}px`);
            node.innerHTML = `<span>${escapeHtml(action.emoji || AI_CHAT_EMOJIS[0])}</span>`;
            document.body.appendChild(node);
            requestAnimationFrame(() => node.classList.add('visible'));
            await sleep(Math.max(420, Number(action.holdMs) || 1250));
            node.classList.remove('visible');
            node.classList.add('leaving');
            await sleep(this.speed === 'fast' ? 100 : 220);
            node.remove();
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
            this._setProcessing(true);
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
                this._setProcessing(false);
                if (this.opponentThinking) this.markOpponentThinking(false);
                // Defensive: never leave a card permanently hidden because no
                // PLAY action was queued for it, and never leave a heal/status
                // held back because its action was dropped or unmatched.
                this.revealAllPendingPlacements();
                this.revealAllPendingMoves();
                this.settleAllPendingHealth();
                this.settleAllPendingDirectHealth();
                this.settleAllPendingStatuses();
                // The battle dock held itself in standby for the duration of
                // playback; bring the acting Siegeling's moves up now that the
                // last banner has cleared. Runs unconditionally so the dock can
                // never be stranded in standby by a dropped or throwing action.
                if (typeof window.renderBattlePanel === 'function') {
                    try { window.renderBattlePanel(); } catch (_) {}
                }
                if (typeof window.scheduleBattleAutoAdvance === 'function') {
                    window.scheduleBattleAutoAdvance();
                }
            }
        }

        async _playAction(action) {
            const t = this.timings();
            const startedAt = Date.now();
            const knight = elementHex(action.knightElement);
            const elColor = elementHex(action.elementColor || action.knightElement);

            if (action.beginsAiPlayback) {
                this.markOpponentThinking(false);
                await sleep(this.speed === 'fast' ? 100 : 240);
            }

            if (action.kind === 'THINK') {
                if (this.activeToast) {
                    this.activeToast.dismiss();
                    this.activeToast = null;
                    await sleep(this.speed === 'fast' ? 100 : 240);
                }
                this.markOpponentThinking(true, action.state);
                await sleep(Math.max(160, Number(action.holdMs) || 650));
                this.markOpponentThinking(false);
                await sleep(this.speed === 'fast' ? 100 : 240);
                return;
            }

            if (action.kind === 'CHAT') {
                await this.showOpponentChatBubble(action);
                const chatGap = action.gapAfterMs != null ? action.gapAfterMs : t.gapMs;
                await sleep(chatGap);
                return;
            }

            // Re-apply hidden state for any placements still pending. Covers
            // the case where game.js's render rebuilt the cell DOM while we
            // were processing a previous action.
            this.syncPendingPlacements();
            this.syncPendingStatuses();
            this.syncPendingMoves();
            this.syncPendingHealth();
            this.syncPendingDirectHealth();
            this.syncPendingLethalHolds();

            const deferAttackToast = (action.kind === 'ATTACK' && !action.target?.healthBar && (
                (action.source && action.target)
                || (action.source && Array.isArray(action.targets) && action.targets.length > 0)
                || (action.target && (action.destroysTarget && action.ghostCell))
                || (Array.isArray(action.targets) && action.targets.some((tgt) => tgt.destroysTarget && tgt.ghostCell))
            ))
                // A tick that kills announces after the card comes apart, same
                // ordering as a lethal attack.
                || (action.kind === 'AFFLICTION' && action.destroysTarget && action.ghostCell);
            const deferEarlyToast = deferAttackToast || action.kind === 'DESTROY';

            if (action.kind === 'PHASE') {
                if (this.activeToast) {
                    this.activeToast.dismiss();
                    this.activeToast = null;
                }
                const holdMs = action.holdMs || 2000;
                if (typeof window.showPhaseTransitionBanner === 'function' && action.phase) {
                    await window.showPhaseTransitionBanner(
                        action.phase,
                        action.activeSide,
                        holdMs
                    );
                } else {
                    const phaseLabel = formatPhaseLabelFallback(action.phase);
                    this.activeToast = this.toasts.show({
                        ...action,
                        label: '',
                        actorName: phaseLabel,
                        targetName: ''
                    }, holdMs);
                    await sleep(t.toastEnterMs);
                }
                const phaseGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(phaseGap);
                return;
            }

            // Shields expiring at end of turn — chip away any plates still on
            // screen and play a crumbling-shield burst on each affected cell, all
            // at once. Handled before the pulse/toast preamble: there's no
            // attacker and no toast, the shield simply dissipates.
            if (action.kind === 'SHIELD_EXPIRE' && Array.isArray(action.targets) && action.targets.length) {
                for (const tgt of action.targets) {
                    breakShieldPlates(tgt.isPlayer, tgt.row, tgt.col, tgt.shieldBroken || 99);
                    spawnShieldCrumble(tgt.isPlayer, tgt.row, tgt.col, tgt.shieldBroken || 1, 1000);
                }
                await sleep(Math.max(t.impactMs, 360));
                for (const tgt of action.targets) {
                    this.resyncShieldFromState(tgt.isPlayer, tgt.row, tgt.col);
                }
                const expiryGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(expiryGap);
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

            // 2. Show toast (lethal kills and standalone destroys announce after VFX)
            if (!deferEarlyToast) {
                if (this.activeToast) this.activeToast.dismiss();
                this.activeToast = this.toasts.show(action, t.toastDismissMs);
                await sleep(t.toastEnterMs);
            }

            const showDeferredAttackToast = async () => {
                if (!deferAttackToast) return;
                if (this.activeToast) this.activeToast.dismiss();
                this.activeToast = this.toasts.show(action, t.toastDismissMs);
                await sleep(t.toastEnterMs);
            };

            const showDeferredDestroyToast = async (targetLike) => {
                await showCardDestroyedToast(this, action, targetLike || action, t);
            };

            // 2a-chain. Chain damage strikes its target first, then bounces from
            // that card along its links — see playChainAttack.
            if (action.kind === 'ATTACK' && Array.isArray(action.chainSteps) && action.chainSteps.length) {
                const lethalTargets = await playChainAttack(this, action, t, elColor);
                await showDeferredAttackToast();
                for (const tgt of lethalTargets) {
                    await showDeferredDestroyToast(tgt);
                }
                const chainGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(chainGap);
                return;
            }

            // 2a. Multi-target damage. With an attacker, all projectiles fire
            // simultaneously (no stagger); without one — a trap, an aura, a
            // board-wide effect — every target lights its elemental border
            // instead, since nothing crossed the board to reach them. Either way
            // one coordinated impact + camera shake + per-target damage floater
            // follows the lead-in.
            if (action.kind === 'ATTACK' && Array.isArray(action.targets) && action.targets.length > 1) {
                this.syncPendingLethalHolds();
                let leadInMs = t.projectileMs;
                if (action.source && window.SieglingsFx?.attackCell) {
                    for (const tgt of action.targets) {
                        window.SieglingsFx.attackCell(
                            action.source.isPlayer, action.source.row, action.source.col,
                            tgt.isPlayer, tgt.row, tgt.col,
                            attackFxElement(action),
                            { duration: t.projectileMs }
                        );
                    }
                } else {
                    const borderMs = this.speed === 'fast' ? 520 : 950;
                    for (const tgt of action.targets) {
                        spawnElementalBorder(tgt.isPlayer, tgt.row, tgt.col, {
                            element: attackFxElement(action),
                            variant: 'effect',
                            durationMs: borderMs
                        });
                    }
                    leadInMs = Math.round(borderMs * 0.4);
                }
                await sleep(leadInMs);

                const lethalTargets = action.targets.filter((tgt) => tgt.destroysTarget && tgt.ghostCell);
                const survivingTargets = action.targets.filter((tgt) => !tgt.destroysTarget || !tgt.ghostCell);
                const casterFxColor = elementHex(attackFxElement(action));
                this.applyPendingImpactHealthForTargets(survivingTargets);
                for (const tgt of survivingTargets) {
                    applyAttackImpactVfx(this, action, tgt, casterFxColor);
                }
                if (window.SieglingsFx?.cameraShake && action.targets.length) {
                    const shake = Math.min(16, 6 + Math.round((action.amount || 0) * 0.35));
                    window.SieglingsFx.cameraShake(shake, t.impactMs);
                }
                if (survivingTargets.length) {
                    await sleep(t.impactMs);
                    this.releasePendingHealthForTargets(survivingTargets);
                }
                for (const tgt of lethalTargets) {
                    await playLethalAttackImpact(this, action, tgt, casterFxColor, t);
                }
                if (!survivingTargets.length && !lethalTargets.length) {
                    await sleep(t.impactMs);
                }
                await showDeferredAttackToast();
                for (const tgt of lethalTargets) {
                    await showDeferredDestroyToast(tgt);
                }
                const multiGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(multiGap);
                return;
            }

            // 2a-affliction. AFFLICTION — burn/toxin/wither style ticks. Nothing
            // attacked the card, so there is deliberately no projectile: the
            // element's border ignites around the card and the damage lands as
            // the border burns.
            if (action.kind === 'AFFLICTION' && action.target) {
                const isLethalKill = action.destroysTarget && action.ghostCell;
                if (isLethalKill) this.syncPendingLethalHolds();
                const auraMs = this.speed === 'fast' ? 520 : 950;
                spawnElementalBorder(
                    action.target.isPlayer, action.target.row, action.target.col,
                    {
                        element: action.elementColor,
                        variant: String(action.affliction || 'effect').toLowerCase(),
                        durationMs: auraMs
                    }
                );
                // Let the border catch before the HP drops so the two read as
                // cause and effect rather than one flash.
                await sleep(Math.round(auraMs * 0.4));

                const tickTarget = {
                    isPlayer: action.target.isPlayer,
                    row: action.target.row,
                    col: action.target.col,
                    name: action.actorName || action.ghostCell?.name,
                    element: action.target.element,
                    amount: action.amount,
                    shieldBroken: action.shieldBroken,
                    ghostCell: action.ghostCell,
                    pendingHealthKey: action.pendingHealthKey,
                    pendingLethalKey: action.pendingLethalKey || action.pendingHealthKey
                };
                if (isLethalKill) {
                    await playLethalAttackImpact(this, action, tickTarget, elColor, t);
                    await showDeferredAttackToast();
                    await showDeferredDestroyToast(tickTarget);
                } else {
                    await playStandardAttackImpact(this, action, tickTarget, elColor, t);
                }
                const afflictionGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(afflictionGap);
                return;
            }

            // 2a-status. STATUS_APPLY / STATUS_SKIP — status-only events
            // that should read as status feedback rather than attacks.
            if ((action.kind === 'STATUS_APPLY' || action.kind === 'STATUS_SKIP') && action.target) {
                const isSkip = action.kind === 'STATUS_SKIP';
                if (!isSkip) {
                    // A status landing with no damage is an aura or a rider, not
                    // an attack — the status's element lights the target's border.
                    const borderMs = this.speed === 'fast' ? 460 : 820;
                    spawnElementalBorder(
                        action.target.isPlayer, action.target.row, action.target.col,
                        {
                            element: action.elementColor || action.knightElement,
                            variant: 'status',
                            durationMs: borderMs
                        }
                    );
                    await sleep(Math.round(borderMs * 0.4));
                }
                if (isSkip) {
                    pulseCard(
                        action.target.isPlayer,
                        action.target.row,
                        action.target.col,
                        knight,
                        elColor,
                        action.kind,
                        t.highlightMs + t.impactMs
                    );
                }
                if (action.statuses && action.statuses.length) {
                    for (const status of action.statuses) {
                        applyStatusVisual(
                            action.target.isPlayer, action.target.row, action.target.col,
                            status
                        );
                    }
                    this.revealPendingStatusesForTarget(action.target, action.statuses);
                }
                await sleep(t.impactMs);
                const statusGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(statusGap);
                return;
            }

            // 2a-heal. HEAL — a green border blooming on the healed card, then a
            // glowing green "+" cross with outward particles. Healing is not an
            // attack, so it gets the border treatment rather than a projectile.
            // Damage floater is replaced with a green "+N" gain.
            if (action.kind === 'HEAL' && action.target) {
                const healBorderMs = this.speed === 'fast' ? 460 : 820;
                spawnElementalBorder(
                    action.target.isPlayer, action.target.row, action.target.col,
                    { color: '#5eff8e', variant: 'heal', sigil: '✚', durationMs: healBorderMs }
                );
                await sleep(Math.round(healBorderMs * 0.35));
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
                // Now that the cross + "+N" are on screen, raise the bar to its
                // post-heal value so the heal visibly resolves with the effect.
                this.releasePendingHealth(action.pendingHealthKey);
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
                this.resyncShieldFromState(
                    action.target.isPlayer,
                    action.target.row,
                    action.target.col,
                    action.target.shieldHp
                );
                await sleep(t.impactMs);
                const shieldGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(shieldGap);
                return;
            }

            if (action.kind === 'MOVE' && action.source && action.target) {
                await animateBoardMove(this, action, this.speed === 'fast' ? 260 : 620);
                const moveGap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(moveGap);
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
                    const directHealthKey = action.pendingDirectHealthKey || action.target?.pendingDirectHealthKey;
                    this.applyPendingDirectHealth(directHealthKey);
                    this._flashHealthBar(action.target.isPlayer, elColor);
                    if (action.siegeDamage) {
                        this._fractureHealthBar(action.target.isPlayer, elColor);
                    }
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
                    this.releasePendingDirectHealth(directHealthKey);
                    const gap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                    await sleep(gap);
                    return;
                }
            }

            // 3. Projectile + impact for attack-like actions
            const fireProjectile = action.kind === 'ATTACK' && action.source && action.target
                && !action.target.healthBar && window.SieglingsFx?.attackCell;
            if (fireProjectile) {
                const isLethalKill = action.destroysTarget && action.ghostCell;
                if (isLethalKill) {
                    this.syncPendingLethalHolds();
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

                if (isLethalKill) {
                    const lethalTarget = {
                        isPlayer: action.target.isPlayer,
                        row: action.target.row,
                        col: action.target.col,
                        name: action.targetName || action.ghostCell?.name,
                        ghostCell: action.ghostCell,
                        amount: action.amount,
                        shieldBroken: action.shieldBroken,
                        element: action.target.element,
                        pendingLethalKey: action.pendingLethalKey || action.pendingHealthKey,
                        pendingHealthKey: action.pendingHealthKey,
                        statuses: action.statuses
                    };
                    await playLethalAttackImpact(this, action, lethalTarget, elColor, t);
                    await showDeferredAttackToast();
                    await showDeferredDestroyToast(lethalTarget);
                } else {
                    const standardTarget = {
                        isPlayer: action.target.isPlayer,
                        row: action.target.row,
                        col: action.target.col,
                        amount: action.amount,
                        shieldBroken: action.shieldBroken,
                        statuses: action.statuses,
                        pendingHealthKey: action.pendingHealthKey
                    };
                    await playStandardAttackImpact(this, action, standardTarget, elColor, t);
                    await showDeferredAttackToast();
                }
            } else if (action.kind === 'ATTACK' && action.target?.healthBar) {
                // Sourceless health-bar damage — still flash the bar so the
                // player registers the hit.
                const barCenter = this._getHealthBarCenter(action.target.isPlayer);
                const directHealthKey = action.pendingDirectHealthKey || action.target?.pendingDirectHealthKey;
                this.applyPendingDirectHealth(directHealthKey);
                this._flashHealthBar(action.target.isPlayer, elColor);
                if (action.siegeDamage) {
                    this._fractureHealthBar(action.target.isPlayer, elColor);
                }
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
                this.releasePendingDirectHealth(directHealthKey);
                const gap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
                await sleep(gap);
                return;
            } else if (action.kind === 'ATTACK' && action.target) {
                // Damage with no attacker cell behind it — a trap, an aura, an
                // effect tick, or an AI log line the parser couldn't pin to a
                // card. Nothing crossed the board to get here, so the element
                // burns around the target's border rather than a projectile
                // flying in from a made-up origin.
                const isLethalKill = action.destroysTarget && action.ghostCell;
                if (isLethalKill) {
                    this.syncPendingLethalHolds();
                }
                const borderMs = this.speed === 'fast' ? 520 : 950;
                spawnElementalBorder(
                    action.target.isPlayer, action.target.row, action.target.col,
                    {
                        element: action.elementColor || action.knightElement,
                        variant: 'effect',
                        durationMs: borderMs
                    }
                );
                await sleep(Math.round(borderMs * 0.4));
                if (isLethalKill) {
                    const lethalTarget = {
                        isPlayer: action.target.isPlayer,
                        row: action.target.row,
                        col: action.target.col,
                        name: action.targetName || action.ghostCell?.name,
                        ghostCell: action.ghostCell,
                        amount: action.amount,
                        shieldBroken: action.shieldBroken,
                        element: action.target.element,
                        pendingLethalKey: action.pendingLethalKey || action.pendingHealthKey,
                        pendingHealthKey: action.pendingHealthKey,
                        statuses: action.statuses
                    };
                    await playLethalAttackImpact(this, action, lethalTarget, elColor, t);
                    await showDeferredAttackToast();
                    await showDeferredDestroyToast(lethalTarget);
                } else {
                    const standardTarget = {
                        isPlayer: action.target.isPlayer,
                        row: action.target.row,
                        col: action.target.col,
                        amount: action.amount,
                        shieldBroken: action.shieldBroken,
                        statuses: action.statuses,
                        pendingHealthKey: action.pendingHealthKey
                    };
                    await playStandardAttackImpact(this, action, standardTarget, elColor, t);
                    await showDeferredAttackToast();
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
                await showDeferredDestroyToast({
                    isPlayer: action.target.isPlayer,
                    row: action.target.row,
                    col: action.target.col,
                    name: action.actorName,
                    ghostCell: action.ghostCell,
                    element: action.target.element
                });
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
            if (action.minActionMs) {
                const elapsed = Date.now() - startedAt;
                const remaining = action.minActionMs - elapsed;
                if (remaining > 0) await sleep(remaining);
            }
            const gap = (action.gapAfterMs != null) ? action.gapAfterMs : t.gapMs;
            await sleep(gap);
        }
    }

    // ── Speed toggle UI ───────────────────────────────────────────────────────
    function ensureSpeedToggle(queue) {
        const btn = document.getElementById('sglSpeedToggle');
        if (!btn) return;
        if (!btn.dataset.speedBound) {
            btn.addEventListener('click', () => {
                queue.setSpeed(queue.getSpeed() === 'fast' ? 'normal' : 'fast');
            });
            btn.dataset.speedBound = '1';
        }
        queue.setSpeed(queue.getSpeed());
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    const queue = new ActionQueue();
    window.SieglingsActionQueue = {
        enqueueAction: (a) => queue.enqueueAction(a),
        enqueueFromStateDiff: (p, n, c) => queue.enqueueFromStateDiff(p, n, c),
        beginSoloAiEndTurn: (s) => queue.beginSoloAiEndTurn(s),
        setSpeed: (s) => queue.setSpeed(s),
        getSpeed: () => queue.getSpeed(),
        clear: () => queue.clear(),
        isProcessing: () => queue.isProcessing(),
        isPresentationBusy: () => queue.isPresentationBusy(),
        isPhaseBannerActive: () => queue.isPhaseBannerActive(),
        onIdle: () => queue.onIdle(),
        markOpponentThinking: (a, s) => queue.markOpponentThinking(a, s),
        syncPendingPlacements: () => queue.syncPendingPlacements(),
        syncPendingDirectHealth: () => queue.syncPendingDirectHealth(),
        getDisplayedHealth: (isPlayer, fallbackHealth) => queue.getDisplayedHealth(isPlayer, fallbackHealth),
        showToast: (toast, holdMs) => queue.toasts.show(toast, holdMs)
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
            try { queue.syncPendingMoves(); } catch (_) {}
            try { queue.syncPendingHealth(); } catch (_) {}
            try { queue.syncPendingDirectHealth(); } catch (_) {}
            try { queue.syncPendingStatuses(); } catch (_) {}
            try { queue.syncPendingLethalHolds(); } catch (_) {}
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
