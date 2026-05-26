/**
 * Sieglings TCG — Loading Gate
 *
 * Console-style splash that runs between "Start Match" and the first game
 * state rendering. Builds its DOM on demand (no markup in index.html), so
 * the only integration point is window.SieglingsLoadingGate.
 *
 * Public API:
 *   show(opts) — opts: { player, opponent, minDurationMs }
 *     each side: { name, element, trainerName, sigil? }
 *   hide()
 *   setProgress(0..1)
 *   isVisible()
 *
 * If show() is called without explicit opts, the gate falls back to neutral
 * placeholders. The minimum-duration option ensures the splash is visible
 * long enough for players to register it even when the API responds in
 * <300ms.
 */
(function () {
    'use strict';

    /* Canonical element SVG sigils — stroke-only, sized via CSS */
    const ELEMENT_SIGIL = {
        FIRE:     `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.95"/><path d="M32 11 C38 19 29 24 34 32 C39 27 46 29 46 38 C46 47 39 53 31 53 C22 53 18 46 18 38 C18 30 25 25 25 17 C28 19 30 22 31 25 C32 20 33 16 32 11 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 27 C34 31 34 36 31 41 C28 37 28 31 31 27 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        ICE:      `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 14 L32 50 M16.4 23 L47.6 41 M47.6 23 L16.4 41" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><polygon points="32,25 38.06,29.5 38.06,34.5 32,39 25.94,34.5 25.94,29.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
        WIND:     `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M18 25 C25 17 35 17 42 23 C37 23 33 26 30 30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M15 35 C23 28 35 28 46 35 C39 35 34 38 30 41" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M31 22 L36 32 L31 42 L26 32 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
        EARTH:    `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><polygon points="32,10 49,20 49,43 32,54 15,43 15,20" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.95"/><path d="M18 43 L27 26 L34 34 L41 22 L46 43 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 17 L37 26 L32 35 L27 26 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/></svg>`,
        WATER:    `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><path d="M32 10 C38 20 46 27 46 38 C46 47 40 53 32 53 C24 53 18 47 18 38 C18 27 26 20 32 10 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 37 C24 33 29 32 34 35 C38 38 42 38 46 34" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="32" cy="38" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
        SHADOW:   `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.9"/><path d="M38 16 C31 18 26 24 26 32 C26 40 31 46 38 48 C34 51 28 51 23 48 C17 44 14 38 14 31 C14 20 23 12 34 12 C35 13 37 14 38 16 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M42 21 L44 26 L49 28 L44 30 L42 35 L40 30 L35 28 L40 26 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
        ELECTRIC: `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><polygon points="32,10 49,20 49,44 32,54 15,44 15,20" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.95"/><path d="M36 16 L27 31 L35 31 L28 47 L40 31 L32 31 L39 16 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        METAL:    `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 14 L38 22 L46 22 L40 28 L42 36 L32 30 L22 36 L24 28 L18 22 L26 22 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
        UNDEAD:   `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M22 34 C22 22 28 14 32 14 C36 14 42 22 42 34 C42 38 40 40 38 40 L36 36 L34 40 L30 40 L28 36 L26 40 C24 40 22 38 22 34 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="27" cy="28" r="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="37" cy="28" r="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
        PSYCHIC:  `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 12 C40 12 46 18 46 26 C46 34 40 38 40 44 L24 44 C24 38 18 34 18 26 C18 18 24 12 32 12 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="32" cy="26" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
        LOVE:     `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.9"/><path d="M32 43 C28 39 18 34 18 27 C18 22 22 18 27 18 C29.5 18 31.5 19.5 32 21 C32.5 19.5 34.5 18 37 18 C42 18 46 22 46 27 C46 34 36 39 32 43 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>`,
        NEUTRAL:  `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.7"/><polygon points="32,14 46,32 32,50 18,32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
    };
    ELEMENT_SIGIL.STORM = ELEMENT_SIGIL.ELECTRIC;
    ELEMENT_SIGIL.MECH  = ELEMENT_SIGIL.METAL;

    const ELEMENT_TO_CSS = {
        FIRE:     'var(--element-fire)',
        WATER:    'var(--element-water, var(--element-ice))',
        EARTH:    'var(--element-earth)',
        WIND:     'var(--element-wind)',
        ICE:      'var(--element-ice)',
        SHADOW:   'var(--element-storm)',
        ELECTRIC: 'var(--element-storm)',
        STORM:    'var(--element-storm)',
        METAL:    'var(--element-mech)',
        MECH:     'var(--element-mech)',
        UNDEAD:   'var(--element-storm)',
        PSYCHIC:  'var(--element-storm)',
        LOVE:     'var(--element-love)',
        NEUTRAL:  'var(--siegelings-blue)'
    };

    const FLAVOR_LINES = [
        'Siegelings feed on raw elemental energy.',
        'A SiegeKnight never retreats from the arena.',
        'Element advantage changes everything.',
        'Every notch you link decides what spells you can cast.',
        'The crown belongs to whoever holds the field.',
        'Beware the silence between phases.'
    ];

    const PARTICLE_PALETTE = [
        'var(--element-fire)',
        'var(--element-ice)',
        'var(--element-storm)',
        'var(--element-wind)',
        'var(--siegelings-gold)'
    ];

    let root = null;
    let flavorEl = null;
    let progressFill = null;
    let progressWalker = null;
    let flavorTimer = null;
    let progressInterval = null;
    let showStartedAt = 0;
    let minDurationMs = 1800;
    let visible = false;
    let pendingHide = null;
    let stylesheetEnsured = false;

    function ensureStylesheet() {
        if (stylesheetEnsured) return;
        // landing.css holds the gate styles. index.html now pre-loads it,
        // but keep the lazy injection as a fallback so callers that include
        // this script standalone still work. Skip if any <link> already
        // points at landing.css to avoid a paint-blocking duplicate fetch.
        const already = document.querySelector(
            'link[data-sgl-landing-css], link[href*="landing.css"]'
        );
        if (!already) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/landing.css?v=17';
            link.dataset.sglLandingCss = '1';
            document.head.appendChild(link);
        }
        stylesheetEnsured = true;
    }

    function elementSigil(element) {
        const k = String(element || '').toUpperCase();
        return ELEMENT_SIGIL[k] || ELEMENT_SIGIL.NEUTRAL;
    }
    function elementCss(element) {
        const k = String(element || '').toUpperCase();
        return ELEMENT_TO_CSS[k] || ELEMENT_TO_CSS.NEUTRAL;
    }
    function elementGlow(element) {
        const map = {
            FIRE: 'var(--element-fire-glow)',  ICE: 'var(--element-ice-glow)',
            STORM: 'var(--element-storm-glow)',LOVE: 'var(--element-love-glow)',
            EARTH: 'var(--element-earth-glow)',WIND: 'var(--element-wind-glow)'
        };
        const k = String(element || '').toUpperCase();
        return map[k] || 'rgba(30, 144, 255, 0.5)';
    }
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function buildParticleField(container, count) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const p = document.createElement('span');
            p.className = 'sgl-gate-particle';
            const color = PARTICLE_PALETTE[i % PARTICLE_PALETTE.length];
            p.style.setProperty('--p-color', color);
            p.style.setProperty('--p-left', `${Math.random() * 100}%`);
            p.style.setProperty('--p-duration', `${6 + Math.random() * 6}s`);
            p.style.setProperty('--p-delay', `-${Math.random() * 8}s`);
            p.style.setProperty('--p-drift', `${(Math.random() - 0.5) * 80}px`);
            p.style.width = p.style.height = `${4 + Math.random() * 6}px`;
            frag.appendChild(p);
        }
        container.appendChild(frag);
    }

    function buildKnightCard(side, info, isRight) {
        const el = String(info?.element || 'NEUTRAL').toUpperCase();
        const color = elementCss(el);
        const glow  = elementGlow(el);
        const sigil = info?.sigil || elementSigil(el);
        const sideClass = isRight ? 'right' : 'left';
        const safeName = escapeHtml(info?.name || (isRight ? 'Opponent' : 'Player'));
        const trainerLabel = info?.trainerName
            ? `<div class="sgl-knight-trainer">${escapeHtml(info.trainerName)}</div>`
            : '';
        return `
            <div class="sgl-knight-card ${sideClass}"
                 style="--knight-color: ${color}; --knight-glow: ${glow}; animation-delay: ${isRight ? '120ms' : '0ms'}">
                <div class="sgl-knight-portrait" aria-hidden="true" style="color:${color}">${sigil}</div>
                <div class="sgl-knight-name">${safeName}</div>
                ${trainerLabel}
                <span class="sgl-knight-element">${escapeHtml(el)}</span>
            </div>
        `;
    }

    function buildRoot() {
        if (root) return root;
        ensureStylesheet();

        root = document.createElement('div');
        root.className = 'sgl-loading-gate';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.innerHTML = `
            <div class="sgl-gate-bg" aria-hidden="true"></div>
            <div class="sgl-gate-vignette" aria-hidden="true"></div>
            <div class="sgl-gate-particles" id="sglGateParticles" aria-hidden="true"></div>

            <div class="sgl-gate-content">
                <div class="sgl-gate-pcg">
                    <div class="pcg-bubble-logo" aria-hidden="true">
                        <span class="pcg-letter pcg-l-1">P</span><span class="pcg-letter pcg-l-2">C</span><span class="pcg-letter pcg-l-3">G</span>
                        <span class="pcg-controller-dot" style="--x:80%;--y:22%;--c:var(--pcg-yellow)"></span>
                    </div>
                    <span class="sgl-gate-pcg-text">PartyChatGaming presents</span>
                </div>

                <div class="sgl-logo-stage" aria-hidden="true">
                    <div class="sgl-logo-ring-outer"></div>
                    <div class="sgl-logo-ring-inner"></div>
                    <img class="sgl-game-logo-img" src="/img/siegelings-logo.png" alt="Siegelings" draggable="false">
                </div>

                <div class="sgl-gate-vs" id="sglGateVs"></div>

                <div class="sgl-gate-loading">
                    <div class="sgl-progress-track" aria-hidden="true">
                        <div class="sgl-progress-fill" id="sglProgressFill"></div>
                        <div class="sgl-progress-walker" id="sglProgressWalker" style="left:0%">★</div>
                    </div>
                    <div class="sgl-gate-flavor" id="sglGateFlavor"></div>
                </div>
            </div>

            <div class="sgl-gate-watermark" aria-hidden="true">
                <div class="pcg-bubble-logo" style="padding:2px 6px;border-radius:10px;">
                    <span class="pcg-letter pcg-l-1" style="font-size:0.7rem;padding:2px 3px;">P</span><span class="pcg-letter pcg-l-2" style="font-size:0.7rem;padding:2px 3px;">C</span><span class="pcg-letter pcg-l-3" style="font-size:0.7rem;padding:2px 3px;">G</span>
                </div>
                <span>PartyChatGaming.com</span>
            </div>
        `;
        document.body.appendChild(root);

        buildParticleField(root.querySelector('#sglGateParticles'), 28);
        flavorEl = root.querySelector('#sglGateFlavor');
        progressFill = root.querySelector('#sglProgressFill');
        progressWalker = root.querySelector('#sglProgressWalker');
        return root;
    }

    function renderKnights(opts) {
        const vs = root.querySelector('#sglGateVs');
        if (!vs) return;
        const player = opts?.player || { name: 'Player', element: 'NEUTRAL' };
        const opponent = opts?.opponent || { name: 'Opponent', element: 'NEUTRAL' };
        vs.innerHTML = `
            ${buildKnightCard('PLAYER', player, false)}
            <div class="sgl-vs-emblem" aria-hidden="true">
                <span class="sgl-vs-emblem-text">VS</span>
            </div>
            ${buildKnightCard('OPPONENT', opponent, true)}
        `;
    }

    function startFlavorRotation() {
        if (!flavorEl) return;
        let idx = Math.floor(Math.random() * FLAVOR_LINES.length);
        flavorEl.textContent = FLAVOR_LINES[idx];
        if (flavorTimer) clearInterval(flavorTimer);
        flavorTimer = setInterval(() => {
            flavorEl.classList.add('fading');
            setTimeout(() => {
                idx = (idx + 1) % FLAVOR_LINES.length;
                flavorEl.textContent = FLAVOR_LINES[idx];
                flavorEl.classList.remove('fading');
            }, 340);
        }, 2600);
    }

    function startProgressSim() {
        if (!progressFill) return;
        // Simulated progress ramps toward 90% — the actual completion is
        // driven by hide(), which fills to 100% before fading.
        let pct = 6;
        setProgress(pct / 100);
        if (progressInterval) clearInterval(progressInterval);
        progressInterval = setInterval(() => {
            const ceiling = 90;
            if (pct >= ceiling) return;
            const step = (ceiling - pct) * 0.08 + Math.random() * 1.4;
            pct = Math.min(ceiling, pct + step);
            setProgress(pct / 100);
        }, 220);
    }

    function setProgress(frac) {
        if (!progressFill) return;
        const pct = Math.max(0, Math.min(1, Number(frac) || 0)) * 100;
        progressFill.style.width = `${pct}%`;
        if (progressWalker) {
            progressWalker.style.left = `${pct}%`;
        }
    }

    function show(opts = {}) {
        const wasVisible = visible;
        buildRoot();
        renderKnights(opts);
        // Only (re)start the minimum-visible timer on the first show. A
        // subsequent show() — e.g. to swap in real opponent info once the
        // server responds — should refresh the cards without truncating the
        // splash the player was already watching.
        if (!wasVisible) {
            minDurationMs = Number.isFinite(opts.minDurationMs) ? opts.minDurationMs : 1800;
            showStartedAt = performance.now();
            startFlavorRotation();
            startProgressSim();
        }
        // Reset knight-card slide-in animations by toggling a class flicker.
        const cards = root.querySelectorAll('.sgl-knight-card');
        cards.forEach((c) => {
            c.style.animation = 'none';
            // force reflow
            void c.offsetWidth;
            c.style.animation = '';
        });
        // Add .visible synchronously so the splash covers the loadout
        // screen immediately — the rAF deferral was perceptible alongside
        // the CSS fade-in.
        root.classList.add('visible');
        visible = true;
        if (pendingHide) { clearTimeout(pendingHide); pendingHide = null; }
    }

    function hide() {
        if (!root || !visible) return;
        const elapsed = performance.now() - showStartedAt;
        const remaining = Math.max(0, minDurationMs - elapsed);

        const finish = () => {
            if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            if (flavorTimer)      { clearInterval(flavorTimer);      flavorTimer = null; }
            setProgress(1);
            // Allow the final fill animation to be perceived before fading.
            setTimeout(() => {
                root.classList.remove('visible');
                visible = false;
                pendingHide = null;
            }, 240);
        };

        if (remaining > 0) {
            pendingHide = setTimeout(finish, remaining);
        } else {
            finish();
        }
    }

    function isVisible() { return visible; }

    window.SieglingsLoadingGate = { show, hide, setProgress, isVisible };
})();
