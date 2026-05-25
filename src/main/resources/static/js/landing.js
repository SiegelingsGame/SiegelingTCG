/**
 * Siegelings Landing Page — interactions
 * - Subtle 3-layer mouse parallax on the hero
 * - Renders the creature showcase grid (placeholder cards keyed on the
 *   canonical element palette so swapping in real art is a one-line edit)
 * - Trailer modal placeholder
 * - Tries the real Siegelings logo asset first; CSS-drawn fallback otherwise
 */
(function () {
    'use strict';

    /* Canonical element SVG sigils — stroke-only, uses currentColor */
    const ELEMENT_SVG = {
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
        NEUTRAL:  `<svg viewBox="0 0 64 64" class="sgl-element-svg" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.7"/><polygon points="32,14 46,32 32,50 18,32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
    };
    ELEMENT_SVG.STORM = ELEMENT_SVG.ELECTRIC;
    ELEMENT_SVG.MECH  = ELEMENT_SVG.METAL;

    function getElementSvg(element) {
        return ELEMENT_SVG[String(element).toUpperCase()] || ELEMENT_SVG.NEUTRAL;
    }

    const FEATURED_SIEGELINGS = [
        { name: 'Pylord',       element: 'FIRE'  },
        { name: 'Glaciemperor', element: 'ICE'   },
        { name: 'Aerovane',     element: 'WIND'  },
        { name: 'Gymstone',     element: 'EARTH' },
    ];

    const FLAVOR_LINES = [
        'Siegelings feed on raw elemental energy.',
        'A SiegeKnight never retreats from the arena.',
        'Element advantage changes everything.',
        'Every notch you link decides what spells you can cast.',
        'The crown belongs to whoever holds the field.',
        'Beware the silence between phases.'
    ];

    function renderCreatureGrid() {
        const grid = document.getElementById('creatureGrid');
        if (!grid) return;
        const html = FEATURED_SIEGELINGS.map((s) => {
            const elKey = String(s.element).toLowerCase();
            return `
                <article class="creature-card" data-element="${elKey}"
                         style="--creature-color: var(--element-${elKey}); --creature-glow: var(--element-${elKey}-glow, rgba(255,255,255,0.4))">
                    <div class="creature-portrait" aria-hidden="true">
                        ${getElementSvg(s.element)}
                    </div>
                    <div class="creature-name">${escapeHtml(s.name)}</div>
                    <div class="creature-card-footer">
                        <span class="creature-element">${s.element}</span>
                    </div>
                </article>
            `;
        }).join('');
        grid.innerHTML = html;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Hero parallax ─────────────────────────────────────────────────────
    function bindParallax() {
        const hero = document.getElementById('hero');
        if (!hero) return;
        const layers = hero.querySelectorAll('[data-parallax]');
        if (!layers.length) return;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        let pending = false;
        let lastX = 0, lastY = 0;
        function apply() {
            pending = false;
            const w = window.innerWidth || 1;
            const h = window.innerHeight || 1;
            const cx = (lastX / w - 0.5) * 2;  // -1 .. 1
            const cy = (lastY / h - 0.5) * 2;
            layers.forEach((layer) => {
                const depth = parseFloat(layer.dataset.parallax || '0');
                const tx = -cx * depth * 40;
                const ty = -cy * depth * 30;
                layer.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
            });
        }
        hero.addEventListener('pointermove', (e) => {
            lastX = e.clientX; lastY = e.clientY;
            if (!pending) {
                pending = true;
                requestAnimationFrame(apply);
            }
        });
        hero.addEventListener('pointerleave', () => {
            layers.forEach((layer) => { layer.style.transform = ''; });
        });
    }

    // ── Trailer modal ─────────────────────────────────────────────────────
    function bindTrailerModal() {
        const modal = document.getElementById('trailerModal');
        const trigger = document.getElementById('ctaTrailer');
        if (!modal || !trigger) return;

        function open() {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        function close() {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
        trigger.addEventListener('click', open);
        modal.querySelectorAll('[data-close-trailer]').forEach((el) => {
            el.addEventListener('click', close);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
        });
    }

    // ── Footer year ───────────────────────────────────────────────────────
    function setFooterYear() {
        const el = document.getElementById('footerYear');
        if (el) el.textContent = new Date().getFullYear();
    }

    function bindSiegelingsColorWave() {
        const wordmark = document.querySelector('.siegelings-wordmark');
        const tagline = document.querySelector('.hero-tagline');
        if (!wordmark || !tagline) return;

        const palette = [
            'var(--element-fire)',
            'var(--element-ice)',
            'var(--element-wind)',
            'var(--element-earth)'
        ];
        const originalText = tagline.textContent || '';
        tagline.innerHTML = Array.from(originalText).map((char, index) => {
            const safeChar = char === ' ' ? '&nbsp;' : escapeHtml(char);
            const cls = char === ' ' ? 'tagline-char tagline-space' : 'tagline-char';
            return `<span class="${cls}" style="--wave-index:${index}">${safeChar}</span>`;
        }).join('');

        let active = false;
        let clearTimer = null;

        function pickColor(clientX) {
            const rect = wordmark.getBoundingClientRect();
            const pct = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
            const index = Math.max(0, Math.min(palette.length - 1, Math.floor(pct * palette.length)));
            return palette[index];
        }

        function applyColor(color) {
            window.clearTimeout(clearTimer);
            wordmark.style.setProperty('--siegelings-hover-color', color);
            tagline.style.setProperty('--siegelings-hover-color', color);
            wordmark.classList.add('is-element-flood');
            tagline.classList.add('is-element-wave');
        }

        wordmark.addEventListener('pointerenter', (event) => {
            active = true;
            applyColor(pickColor(event.clientX));
        });
        wordmark.addEventListener('pointermove', (event) => {
            if (active) {
                applyColor(pickColor(event.clientX));
            }
        });
        wordmark.addEventListener('pointerleave', () => {
            active = false;
            wordmark.classList.remove('is-element-flood');
            tagline.classList.remove('is-element-wave');
            clearTimer = window.setTimeout(() => {
                wordmark.style.removeProperty('--siegelings-hover-color');
                tagline.style.removeProperty('--siegelings-hover-color');
            }, 650);
        });
    }

    // ── Optional real asset wiring ────────────────────────────────────────
    // If /img/siegelings-logo.png exists, the <img>'s onerror won't fire and
    // the fallback stays hidden. If it 404s, the inline onerror swaps to the
    // CSS-drawn placeholder so the page still renders cleanly.
    function trySiegelingsAsset() {
        const img = document.querySelector('.siegelings-logo-img');
        if (!img) return;
        img.src = '/img/siegelings-logo.png';
    }

    function init() {
        renderCreatureGrid();
        bindParallax();
        bindTrailerModal();
        setFooterYear();
        bindSiegelingsColorWave();
        trySiegelingsAsset();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
