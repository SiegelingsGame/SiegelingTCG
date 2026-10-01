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

    // WebP delivery (self-contained; the landing page loads neither game.js nor
    // card-binder-visual.js). The legendary art is the heaviest thing here —
    // ~2.5 MB as PNG against ~0.5 MB as WebP — so prefer the twin and revert to
    // the original on any load error.
    let __landingWebp = null;
    function landingWebpSupported() {
        if (__landingWebp !== null) {
            return __landingWebp;
        }
        try {
            const c = document.createElement('canvas');
            __landingWebp = !!(c.getContext && c.getContext('2d'))
                && c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        } catch (e) {
            __landingWebp = false;
        }
        return __landingWebp;
    }
    function landingImgAttrs(url) {
        const original = String(url || '');
        const preferred = landingWebpSupported()
            ? original.replace(/^(\/(?:img|assets)\/[^?#]+)\.(png|jpe?g)(\?[^#]*)?$/i, '$1.webp$3')
            : original;
        if (preferred === original) {
            return `src="${escapeAttr(original)}"`;
        }
        return `src="${escapeAttr(preferred)}" data-img-fallback="${escapeAttr(original)}" onerror="landingWebpFallback(this)"`;
    }
    if (typeof window !== 'undefined' && !window.landingWebpFallback) {
        window.landingWebpFallback = function (img) {
            if (!img) {
                return;
            }
            const fallback = img.getAttribute('data-img-fallback');
            img.onerror = null;
            if (fallback && img.getAttribute('src') !== fallback) {
                img.setAttribute('src', fallback);
            }
        };
    }

    // Curated legendary copy. The live catalog supplies the real card art and
    // stats; the shipped loading art keeps the row painted when the API is away.
    const FEATURED_SIEGELINGS = [
        { id: 'pylord',       name: 'Pylord',       element: 'FIRE',  rarity: 'LEGENDARY', cardArtUrl: '/img/art/loading/pylord-landscape.webp',       description: 'A crown-forged fire titan that turns every linked ember into a decisive opening.' },
        { id: 'glaciemperor', name: 'Glaciemperor', element: 'ICE',   rarity: 'LEGENDARY', cardArtUrl: '/img/art/loading/glaciemperor-landscape.webp', description: 'An ancient ruler of the frostbound reaches, patient enough to freeze an entire board in place.' },
        { id: 'aerovane',     name: 'Aerovane',     element: 'WIND',  rarity: 'LEGENDARY', cardArtUrl: '/img/art/loading/aerovane-landscape.webp',     description: 'A skyborne tactician whose shifting currents reward players who never stand still.' },
        { id: 'gymstone',     name: 'Gymstone',     element: 'EARTH', rarity: 'LEGENDARY', cardArtUrl: '/img/art/loading/gymstone-landscape.webp',     description: 'A living fortress of stone and root, built to hold the field when the battle turns.' },
    ];

    // Offline roster: shipped art only, so the card rows still move in a static
    // preview or while Cloud Run is cold.
    const ROSTER_FALLBACK = [
        { name: 'Applehead', element: 'EARTH', rarity: 'COMMON',   art: '/img/art/loading/applehead-portrait.webp',        description: 'The peaceful applehead, often found sleeping at the base of orchard trees.' },
        { name: 'Draco',     element: 'FIRE',  rarity: 'COMMON',   art: '/img/art/loading/dracos-portrait.webp',           description: 'A hatchling of the Draco brood, already breathing sparks.' },
        { name: 'Cacty',     element: 'EARTH', rarity: 'COMMON',   art: '/img/art/loading/cacty-earth-landscape.webp',     description: 'Adorable, until its razor thorns find you.' },
        { name: 'Bonoblade', element: 'EARTH', rarity: 'UNCOMMON', art: '/img/art/loading/bonoblade-ambush-landscape.webp', description: 'An ambusher that waits in the brush for a careless step.' },
    ].concat(FEATURED_SIEGELINGS.map((entry) => ({ name: entry.name, element: entry.element, rarity: entry.rarity, art: entry.cardArtUrl, description: entry.description })));

    // Art-first content. All three lists point at files that ship in the repo, so
    // the landing page stays fully painted even with the API unavailable (static
    // preview, cold Cloud Run, offline). `/img/art/loading/` is the same folder the
    // in-game art gallery scans, so anything dropped there can join these lists.
    const HERO_ART = [
        { id: 'fire-loading',  title: 'Emberwatch',      element: 'fire'  },
        { id: 'ice-peak',      title: 'The Ice Peak',    element: 'ice'   },
        { id: 'sky',           title: 'Skyward Reach',   element: 'wind'  },
        { id: 'apple-grove',   title: 'Apple Grove',     element: 'earth' },
        { id: 'water-beach',   title: 'Tidebreak Shore', element: 'water' },
        { id: 'dracos',        title: 'Draco Brood',     element: 'storm' },
    ];

    const ELEMENT_LANDS = [
        { key: 'FIRE',     label: 'Fire',     land: 'fire',     blurb: 'Burns Ice. Opens fast.' },
        { key: 'ICE',      label: 'Ice',      land: 'ice',      blurb: 'Freezes Wind. Holds ground.' },
        { key: 'WIND',     label: 'Wind',     land: 'wind',     blurb: 'Wears Earth. Never still.' },
        { key: 'EARTH',    label: 'Earth',    land: 'earth',    blurb: 'Smothers Fire. Outlasts all.' },
        { key: 'WATER',    label: 'Water',    land: 'water',    blurb: 'Drowns Fire and Ice alike.' },
        { key: 'ELECTRIC', label: 'Electric', land: 'electric', blurb: 'Splits Wind and Fire.' },
        { key: 'METAL',    label: 'Metal',    land: 'metal',    blurb: 'Cuts Earth and Wind.' },
        { key: 'POISON',   label: 'Poison',   land: 'poison',   blurb: 'Rots Ice and Earth.' },
        { key: 'PSYCHIC',  label: 'Psychic',  land: 'psychic',  blurb: 'Unravels Light.' },
        { key: 'SHADOW',   label: 'Shadow',   land: 'shadow',   blurb: 'Swallows Psychic.' },
        { key: 'LIGHT',    label: 'Light',    land: 'light',    blurb: 'Burns away the Undead.' },
        { key: 'UNDEAD',   label: 'Undead',   land: 'undead',   blurb: 'Creeps back through Shadow.' },
    ];

    // Offline fallback only. The live rail comes from the same trainer catalog the
    // game's loadout reads, so the cards carry real passives and actives; these
    // shipped cards keep the section painted (and readable) when the API is away.
    const SIEGE_KNIGHTS = [
        { name: 'Lady Pyla', element: 'FIRE',  tier: 'SiegeKnight', rarity: 'EPIC',      oncePerGame: true,  cardArtUrl: '/img/knights/lady-pyla-full-card.png', cardArtMode: 'FULL_CARD', passive: 'All Fire allies gain +2 attack damage', active: 'Deal 4 damage to all enemies' },
        { name: 'Lyria',     element: 'ICE',   tier: 'SiegeKnight', rarity: 'RARE',      oncePerGame: false, cardArtUrl: '/img/knights/lyria-full-card.png',     cardArtMode: 'FULL_CARD', passive: 'All Ice enemies lose 1 Speed', active: 'Grant an ally +3 Speed' },
        { name: 'Ser Airek', element: 'WIND',  tier: 'SiegeKnight', rarity: 'UNCOMMON',  oncePerGame: false, cardArtUrl: '/img/knights/ser-airek-full-card.png', cardArtMode: 'FULL_CARD', passive: 'All Wind allies gain +2 max HP', active: 'Grant a select row of allies +2 Shield' },
        { name: 'Aldera',    element: 'EARTH', tier: 'Raider',      rarity: 'RARE',      oncePerGame: false, cardArtUrl: '/img/knights/aldera-full-card.png',    cardArtMode: 'FULL_CARD', passive: 'All Earth allies gain +1 Damage', active: 'Grant a selected row of Earth allies +3 Speed' },
        { name: 'Cera',      element: 'WATER', tier: 'SiegeKnight', rarity: 'RARE',      oncePerGame: false, cardArtUrl: '/img/knights/cera-full-card.png',      cardArtMode: 'FULL_CARD', passive: 'All Water allies gain +2 max Health', active: 'Heal a selected row of allies +3' },
        { name: 'Squire Bob', element: 'NEUTRAL', tier: 'SiegeSquire', rarity: 'COMMON', oncePerGame: false, cardArtUrl: '/img/knights/squire-bob-full-card.png', cardArtMode: 'FULL_CARD', passive: 'Front Row allies gain +1 max Health', active: 'Heal 1 ally for 2' },
    ];

    const WORLD_ART = [
        { id: 'ember-burrow',  title: 'Ember Burrow',  element: 'fire'  },
        { id: 'ice-earth',     title: 'Frostfall',     element: 'ice'   },
        { id: 'air-battle',    title: 'Air Battle',    element: 'wind'  },
        { id: 'clawfloor',     title: 'Clawfloor',     element: 'earth' },
        { id: 'water-battle',  title: 'Water Battle',  element: 'water' },
        { id: 'electric',      title: 'Stormfield',    element: 'storm' },
        { id: 'light',         title: 'Hallowed Rise', element: 'ice'   },
        { id: 'void',          title: 'The Void',      element: 'storm' },
        { id: 'sand',          title: 'Sunken Sands',  element: 'earth' },
        { id: 'luvy',          title: 'Luvy Hollow',   element: 'love'  },
    ];

    function artUrl(id, orientation) {
        return `/img/art/loading/${id}-${orientation || 'landscape'}.webp`;
    }

    const FLAVOR_LINES = [
        'Siegelings feed on raw elemental energy.',
        'A SiegeKnight never retreats from the arena.',
        'Element advantage changes everything.',
        'Every notch you link decides what spells you can cast.',
        'The crown belongs to whoever holds the field.',
        'Beware the silence between phases.'
    ];

    function rosterDescription(card) {
        const direct = String(card.description || '').trim();
        if (direct) return direct;
        const ability = card.ability?.description || card.abilities?.[0]?.description;
        if (ability) return String(ability);
        const move = card.moves?.find((entry) => entry && entry.description)?.description;
        if (move) return String(move);
        return `A ${String(card.element || 'neutral').toLowerCase()} Siegling ready to shape your next battle.`;
    }

    function normalizeRosterCard(card) {
        return {
            ...card,
            name: String(card.name || 'Unknown Siegling'),
            element: String(card.element || 'NEUTRAL').toUpperCase(),
            rarity: String(card.rarity || 'COMMON').toUpperCase(),
            art: String(card.cardArtUrl || ''),
            description: rosterDescription(card)
        };
    }

    // One catalog request feeds both the Siegling roster and the SiegeKnight rail;
    // the payload carries `cardCatalog` and `trainers` together.
    let __gameOptions = null;
    // Evolution chips show the precursor's art, looked up by evolvesFromId.
    const __catalogById = new Map();

    function loadGameOptions() {
        if (!__gameOptions) {
            __gameOptions = fetch('/api/game/options', { credentials: 'same-origin' })
                .then((response) => {
                    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
                    return response.json();
                })
                .then((payload) => {
                    (Array.isArray(payload?.cardCatalog) ? payload.cardCatalog : []).forEach((card) => {
                        if (card?.id) __catalogById.set(card.id, card);
                    });
                    return payload;
                });
        }
        return __gameOptions;
    }

    const PLACEMENT_FALLBACKS = {
        applehead: {
            id: 'applehead', name: 'Applehead', element: 'EARTH', rarity: 'COMMON', health: 14, speed: 2,
            cardArtUrl: '/img/art/loading/applehead-portrait.webp',
            notches: [
                { direction: 'TOP', element: 'EARTH' }, { direction: 'RIGHT', element: 'EARTH' },
                { direction: 'BOTTOM', element: 'EARTH' }, { direction: 'LEFT', element: 'EARTH' }
            ]
        },
        cacty: {
            id: 'cacty', name: 'Cacty', element: 'EARTH', rarity: 'COMMON', health: 13, speed: 3,
            cardArtUrl: '/img/art/loading/cacty-earth-landscape.webp',
            notches: [
                { direction: 'RIGHT', element: 'EARTH' }, { direction: 'LEFT', element: 'EARTH' },
                { direction: 'TOP_LEFT', element: 'EARTH' }
            ]
        },
        bonoblade: {
            id: 'bonoblade', name: 'Bonoblade', element: 'EARTH', rarity: 'UNCOMMON', health: 16, speed: 7,
            cardArtUrl: '/img/art/loading/bonoblade-ambush-landscape.webp',
            notches: [
                { direction: 'BOTTOM_RIGHT', element: 'EARTH' }, { direction: 'TOP', element: 'EARTH' },
                { direction: 'BOTTOM', element: 'EARTH' }, { direction: 'LEFT', element: 'EARTH' },
                { direction: 'TOP_LEFT', element: 'EARTH' }
            ]
        },
        draco: {
            id: 'draco', name: 'Draco', element: 'FIRE', rarity: 'COMMON', health: 9, speed: 5,
            cardArtUrl: '/img/art/loading/dracos-portrait.webp',
            notches: [
                { direction: 'LEFT', element: 'FIRE' }, { direction: 'TOP', element: 'FIRE' },
                { direction: 'RIGHT', element: 'FIRE' }
            ]
        }
    };

    // The demo draws the same binder card face as the roster rows, so its
    // notches sit exactly where the link line expects them.
    function placementCardFace(card) {
        return renderBinderFace({ ...card, description: rosterDescription(card) }, { thumbWidth: 320, eager: true });
    }

    async function bindPlacementDemo() {
        const demo = document.getElementById('placementDemo');
        const anchorHost = document.getElementById('placementAnchor');
        const target = document.getElementById('placementTarget');
        const hand = document.getElementById('placementHand');
        const feedback = document.getElementById('placementFeedback');
        const reset = document.getElementById('placementReset');
        if (!demo || !anchorHost || !target || !hand || !feedback || !reset) return;

        const cards = { ...PLACEMENT_FALLBACKS };
        try {
            const payload = await loadGameOptions();
            const catalog = Array.isArray(payload?.cardCatalog) ? payload.cardCatalog : [];
            Object.keys(cards).forEach((id) => {
                const live = catalog.find((card) => String(card?.id || '').toLowerCase() === id);
                if (live) cards[id] = { ...cards[id], ...live, id };
            });
        } catch (_ignored) {
            // Shipped artwork and canonical card values keep static previews interactive.
        }

        const anchor = cards.applehead;
        const choices = [cards.cacty, cards.bonoblade, cards.draco];
        let placed = null;
        let connected = false;
        let linkType = null;
        anchorHost.innerHTML = placementCardFace(anchor);
        scheduleDescriptionFit(anchorHost);
        hand.innerHTML = choices.map((card) => {
            const leftNotch = (Array.isArray(card.notches) ? card.notches : [])
                .find((notch) => String(notch?.direction || '').toUpperCase() === 'LEFT');
            const cardElement = String(leftNotch?.element || card.element || '').toUpperCase();
            const sameElement = cardElement === String(anchor.element || 'EARTH').toUpperCase();
            const linkLabel = !leftNotch ? 'No facing notch' : sameElement ? `${cardElement} energy link` : `Earth + ${cardElement} combo link`;
            const linkResult = !leftNotch ? 'No left notch to connect here.' : sameElement ? `Generates 1 ${cardElement} energy.` : 'Creates 1 combo point.';
            return `
            <button class="placement-hand-card" type="button" data-placement-card="${escapeAttr(card.id)}"
                    aria-label="Place ${escapeAttr(card.name)} beside Applehead" aria-pressed="false">
                ${placementCardFace(card)}
                <span class="placement-choice-copy">
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${escapeHtml(linkLabel)}</span>
                    <small>${escapeHtml(linkResult)}</small>
                </span>
                <span class="placement-hand-action">Place card <b aria-hidden="true">→</b></span>
            </button>`;
        }).join('');
        scheduleDescriptionFit(hand);

        function resetDemo() {
            placed = null;
            connected = false;
            linkType = null;
            demo.dataset.state = 'ready';
            demo.style.removeProperty('--placement-link-left');
            demo.style.removeProperty('--placement-link-right');
            target.className = 'placement-board-slot is-target';
            target.setAttribute('aria-label', 'Open card slot');
            target.innerHTML = '<span class="placement-slot-plus" aria-hidden="true">+</span><span class="placement-slot-label">Place here</span>';
            feedback.innerHTML = 'Choose a card from your hand.';
            demo.querySelector('.placement-energy').textContent = '+1';
            reset.hidden = true;
            hand.querySelectorAll('[data-placement-card]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
        }

        function placeCard(card, button) {
            const anchorNotch = (Array.isArray(anchor.notches) ? anchor.notches : [])
                .find((notch) => String(notch?.direction || '').toUpperCase() === 'RIGHT');
            const cardNotch = (Array.isArray(card.notches) ? card.notches : [])
                .find((notch) => String(notch?.direction || '').toUpperCase() === 'LEFT');
            const anchorElement = String(anchorNotch?.element || anchor.element || 'EARTH').toUpperCase();
            const cardElement = String(cardNotch?.element || card.element || '').toUpperCase();
            connected = Boolean(anchorNotch && cardNotch);
            linkType = connected ? (anchorElement === cardElement ? 'energy' : 'combo') : null;
            placed = card;
            demo.dataset.state = connected ? (linkType === 'combo' ? 'combo' : 'connected') : 'blocked';
            demo.style.setProperty('--placement-link-left', `var(--element-${anchorElement.toLowerCase()})`);
            demo.style.setProperty('--placement-link-right', `var(--element-${cardElement.toLowerCase()})`);
            demo.querySelector('.placement-energy').textContent = linkType === 'combo' ? '' : '+1';
            target.className = `placement-board-slot is-target is-occupied is-placing${connected ? ' is-connected' : ''}`;
            target.setAttribute('aria-label', `${card.name} placed beside Applehead${linkType === 'combo' ? `, ${anchorElement} and ${cardElement} combo formed` : connected ? `, ${anchorElement} energy link formed` : ', notches do not link'}`);
            target.innerHTML = placementCardFace(card);
            scheduleDescriptionFit(target);
            // The entrance animation scales the card; measure again at rest.
            target.querySelector('.mulligan-card-slot')?.addEventListener('animationend', () => scheduleDescriptionFit(target), { once: true });
            feedback.innerHTML = linkType === 'combo'
                ? `<strong>${escapeHtml(anchorElement)} + ${escapeHtml(cardElement)} combo formed.</strong> Different elements generate 1 combo point.`
                : connected
                ? `<strong>${escapeHtml(anchorElement)} link formed.</strong> Applehead and ${escapeHtml(card.name)} generate 1 ${escapeHtml(anchorElement)} energy.`
                : `<strong>No link.</strong> ${escapeHtml(card.name)} needs a left-facing notch here.`;
            reset.hidden = false;
            hand.querySelectorAll('[data-placement-card]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        }

        hand.addEventListener('click', (event) => {
            const button = event.target.closest('[data-placement-card]');
            if (!button) return;
            const card = choices.find((entry) => entry.id === button.dataset.placementCard);
            if (card) placeCard(card, button);
        });
        reset.addEventListener('click', resetDemo);

        window.render_game_to_text = () => JSON.stringify({
            surface: 'landing-card-placement',
            coordinateSystem: 'two adjacent slots: Applehead on the left, chosen card on the right',
            anchor: anchor.name,
            placed: placed?.name || null,
            connected,
            linkType,
            status: feedback.textContent.trim()
        });
        if (!window.advanceTime) window.advanceTime = () => Promise.resolve();
    }

    // ── Binder card face ────────────────────────────────────────────────
    // The same markup card-binder-visual.js renderBinderCardTile produces for a
    // framed Siegling (via game.js renderShowcaseCard), so css/card-face.css,
    // which is extracted from style.css, draws it identically. Kept local
    // because the landing page cannot afford to load game.js just for this.
    const FRAME_FAMILY = {
        FIRE: 'frame-fire-metal', METAL: 'frame-fire-metal', EARTH: 'frame-earth', PSYCHIC: 'frame-psychic',
        ICE: 'frame-ice-water', WATER: 'frame-ice-water', WIND: 'frame-air-electric', AIR: 'frame-air-electric', ELECTRIC: 'frame-air-electric'
    };
    const FRAME_RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    const CARD_NOTCH_DIRECTIONS = ['TOP', 'TOP_RIGHT', 'RIGHT', 'BOTTOM_RIGHT', 'BOTTOM', 'BOTTOM_LEFT', 'LEFT', 'TOP_LEFT'];
    const ELEMENT_HEX = {
        FIRE: '#ff501e', EARTH: '#b48c50', WIND: '#96ffb4', WATER: '#3296ff', ICE: '#76e6ff', SHADOW: '#7832b4',
        ELECTRIC: '#ffe63c', METAL: '#a0aab4', UNDEAD: '#8c78a0', PSYCHIC: '#c896ff', POISON: '#7ecb4d', LIGHT: '#ffe59a', NEUTRAL: '#95a5a6'
    };
    // game.js getCompactSummaryInkPalette, Siegling branch.
    const SUMMARY_INK = {
        FIRE:     ['#a8f4ff', '#fff7b0', '#dafbff', 'rgba(5, 18, 28, 0.94)'],
        EARTH:    ['#c8d7ff', '#fff0ac', '#e6ecff', 'rgba(13, 14, 27, 0.92)'],
        WIND:     ['#ffc1eb', '#f8ffb5', '#ffe0f6', 'rgba(22, 6, 24, 0.92)'],
        WATER:    ['#ffd59f', '#f8fff5', '#ffe8c9', 'rgba(25, 12, 4, 0.92)'],
        ICE:      ['#ffbd91', '#fff8d8', '#ffe2cf', 'rgba(28, 9, 3, 0.9)'],
        ELECTRIC: ['#cab8ff', '#fff8b8', '#e7ddff', 'rgba(16, 8, 35, 0.92)'],
        METAL:    ['#ffd1a5', '#f9fdff', '#ffe8d5', 'rgba(24, 13, 5, 0.9)'],
        PSYCHIC:  ['#c9ffba', '#fff7c4', '#e5ffde', 'rgba(6, 24, 5, 0.92)']
    };
    const DEFAULT_INK = ['#e8f1ff', '#fff0a8', '#cfdcff', 'rgba(2, 8, 18, 0.92)'];

    function hasCardFrame(card) {
        return Boolean(FRAME_FAMILY[String(card?.element || '').toUpperCase()]);
    }

    function notchStyle(element) {
        const key = String(element || 'NEUTRAL').toUpperCase();
        return `--notch:${ELEMENT_HEX[key] || ELEMENT_HEX.NEUTRAL};--notch-icon:url('/img/notches/notch-${key.toLowerCase()}.png?v=2');`;
    }

    // card-binder-visual.js buildArtTransformStyle: the dashboard's art crop.
    function cardArtTransform(card) {
        const num = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        const xPct = num(card.cardArtOffsetXPct);
        const yPct = num(card.cardArtOffsetYPct);
        const usePct = Number.isFinite(xPct) || Number.isFinite(yPct);
        const x = Number.isFinite(num(card.cardArtOffsetX)) ? num(card.cardArtOffsetX) : 0;
        const y = Number.isFinite(num(card.cardArtOffsetY)) ? num(card.cardArtOffsetY) : 0;
        const tx = usePct ? `${Number.isFinite(xPct) ? clamp(xPct, -200, 200) : 0}%` : `${x}px`;
        const ty = usePct ? `${Number.isFinite(yPct) ? clamp(yPct, -200, 200) : 0}%` : `${y}px`;
        const scale = Number.isFinite(num(card.cardArtScale)) ? clamp(num(card.cardArtScale), 0.25, 3) : 1;
        const rotation = Number.isFinite(num(card.cardArtRotation)) ? clamp(num(card.cardArtRotation), -180, 180) : 0;
        if (parseFloat(tx) === 0 && parseFloat(ty) === 0 && scale === 1 && !rotation) return '';
        return `transform:translate(${tx},${ty}) scale(${scale}) rotate(${rotation}deg);transform-origin:center center;`;
    }

    // Storage art is 1024x1536. A row of them decoded at full size is what got
    // the page killed and reloaded on iOS, so cards ask the art mirror for a
    // thumbnail and only fall back to the original if that request fails.
    function thumbAttrs(url, width) {
        const original = String(url || '');
        if (!/^https:\/\/firebasestorage\.googleapis\.com\//.test(original)) {
            return landingImgAttrs(original);
        }
        const thumb = `/api/cards/art-mirror?w=${width}&url=${encodeURIComponent(original)}`;
        return `src="${escapeAttr(thumb)}" data-img-fallback="${escapeAttr(original)}" onerror="landingWebpFallback(this)"`;
    }

    function renderBinderFace(card, options) {
        const opts = options || {};
        const element = String(card.element || 'NEUTRAL').toUpperCase();
        const key = element.toLowerCase();
        const rarity = String(card.rarity || 'COMMON').toUpperCase();
        const frame = `${FRAME_FAMILY[element]} frame-rarity-${(FRAME_RARITIES.includes(rarity) ? rarity : 'COMMON').toLowerCase()}`;
        const notchMap = {};
        (Array.isArray(card.notches) ? card.notches : []).forEach((notch) => { if (notch?.direction) notchMap[String(notch.direction).toUpperCase()] = notch; });
        const notches = CARD_NOTCH_DIRECTIONS.map((dir) => {
            const notch = notchMap[dir];
            return notch
                ? `<div class="notch-dot ${escapeAttr(String(notch.element || element).toLowerCase())} notch-${dir}" style="${notchStyle(notch.element || element)}"></div>`
                : `<div class="notch-dot notch-${dir}"></div>`;
        }).join('');
        const chips = [];
        const costAmount = Number(card.costAmount);
        if (card.costElement && costAmount > 0) {
            const shown = Math.min(costAmount, 4);
            let icons = '';
            for (let i = 0; i < shown; i += 1) icons += `<span class="card-summary-energy-icon" style="${notchStyle(card.costElement)}"></span>`;
            if (costAmount > shown) icons += `<span class="card-summary-energy-more">x${costAmount}</span>`;
            chips.push(`<div class="card-corner-chip card-corner-cost"><span class="card-summary-energy-icons energy-count-${Math.min(costAmount, 10)}">${icons}</span></div>`);
        }
        const evolvesFrom = String(card.evolvesFromName || '').trim()
            || String(card.evolvesFromId || '').split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
        if (evolvesFrom) {
            // Only the transparent creature overlay reads at chip size.
            const source = __catalogById.get(card.evolvesFromId);
            const sourceArt = String(source?.cardArtMode || '').toUpperCase() === 'OVERLAY'
                ? String(source.cardArtUrl || '').trim() : '';
            const sourceHtml = sourceArt
                ? `<span class="card-corner-evo-thumb"><img ${thumbAttrs(sourceArt, 64)} alt="${escapeAttr(evolvesFrom)}" decoding="async"></span>`
                : `<span class="card-corner-evo-name">${escapeHtml(evolvesFrom)}</span>`;
            chips.push(`<div class="card-corner-chip card-corner-evo" title="${escapeAttr(`Evolves from ${evolvesFrom}`)}"><span class="card-corner-evo-tag">Evo</span>${sourceHtml}</div>`);
        }
        const art = String(card.cardArtUrl || card.art || '');
        const transform = cardArtTransform(card);
        const ink = SUMMARY_INK[element] || DEFAULT_INK;
        const description = String(card.description || '').trim() || 'Description coming soon.';
        const stat = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : '-');
        return `
            <div class="mulligan-card-slot binder-framed-slot">
                <div class="hand-card ${escapeAttr(key)} card-type-siegling mulligan-showcase binder-grid-showcase element-frame ${frame}">
                    <div class="hand-notches"><div class="notch-center"></div>${notches}</div>
                    <div class="hand-card-shell">
                        ${chips.join('')}
                        <div class="hand-card-header"><div class="card-title">${escapeHtml(card.name)}</div><div class="card-label">SIEGLING / ${escapeHtml(element.charAt(0) + element.slice(1).toLowerCase())}</div></div>
                        <div class="card-art card-art-preview">${art ? `<img ${thumbAttrs(art, opts.thumbWidth || 320)} alt="" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async"${transform ? ` style="${transform}"` : ''}>` : ''}</div>
                        <div class="hand-card-body">
                            <div class="card-stat-pills"><span class="card-stat-pill card-stat-pill-hp">HP: ${stat(card.health)}</span><span class="card-stat-pill card-stat-pill-spd">SPD: ${stat(card.speed)}</span></div>
                            <div class="card-summary-list card-summary-description-list" style="--summary-ink:${ink[0]};--summary-strong:${ink[1]};--summary-muted:${ink[2]};--summary-shadow:${ink[3]}"><div class="card-summary-description">${escapeHtml(description)}</div></div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // Description fit: every card prints its whole description. Same binary
    // search as game.js fitFramedSummaryList, but with a lower floor, because
    // the binder's 7px floor still clips the longest lore on a phone-sized
    // card. The ceiling scales with the card, so short text on a big
    // legendary card reads larger instead of leaving the panel half empty.
    const DESCRIPTION_FLOOR_PX = 3;
    function fitCardDescription(card, memo) {
        const body = card.querySelector('.hand-card-body');
        const list = card.querySelector('.card-summary-list');
        const text = card.querySelector('.card-summary-description');
        if (!body || !list || !text || !body.clientHeight || !list.clientWidth) return;
        // Clones in a marquee row are the same card at the same width; measure once.
        const key = `${Math.round(card.clientWidth)}|${text.textContent}`;
        if (memo && memo.has(key)) {
            const [size, lineHeight, maxHeight, overflow, display, clamp] = memo.get(key);
            list.style.fontSize = size;
            text.style.lineHeight = lineHeight;
            text.style.maxHeight = maxHeight;
            text.style.overflow = overflow;
            text.style.display = display;
            text.style.webkitBoxOrient = display ? 'vertical' : '';
            text.style.webkitLineClamp = clamp;
            return;
        }
        list.style.fontSize = '';
        text.style.lineHeight = '';
        text.style.maxHeight = '';
        text.style.overflow = '';
        text.style.display = '';
        text.style.webkitLineClamp = '';
        const maxPx = Math.min(14, Math.max(7, card.clientWidth * 0.075));
        // The painted panel runs down behind the bottom notch row, so fitting
        // the panel alone lets the last lines sit under the sockets - worst at
        // the centre one. As in the binder (home-redesign.js fitOneDescription),
        // the text must also end above the highest bottom socket, with a
        // clearance that scales with the card.
        const sockets = [...card.querySelectorAll('.notch-dot.notch-BOTTOM, .notch-dot.notch-BOTTOM_LEFT, .notch-dot.notch-BOTTOM_RIGHT')];
        const clearance = Math.max(2, card.clientWidth * 0.015);
        const socketLine = () => (sockets.length ? Math.min(...sockets.map((dot) => dot.getBoundingClientRect().top)) - clearance : Infinity);
        // The list clips internally (overflow hidden), so check its own overflow
        // as well as the body's.
        const fits = () => body.scrollHeight <= body.clientHeight + 0.5
            && list.scrollHeight <= list.clientHeight + 0.5
            && text.getBoundingClientRect().bottom <= socketLine() + 0.25;
        const search = () => {
            let lo = DESCRIPTION_FLOOR_PX;
            let hi = maxPx;
            let best = DESCRIPTION_FLOOR_PX;
            for (let i = 0; i < 10; i += 1) {
                const mid = (lo + hi) / 2;
                list.style.fontSize = `${mid}px`;
                if (fits()) { best = mid; lo = mid; } else { hi = mid; }
            }
            // Round down: rounding the boundary size up can tip it back over.
            let size = Math.floor(best * 100) / 100;
            list.style.fontSize = `${size}px`;
            while (!fits() && size > DESCRIPTION_FLOOR_PX) {
                size = Math.max(DESCRIPTION_FLOOR_PX, size - 0.1);
                list.style.fontSize = `${size.toFixed(2)}px`;
            }
            return fits();
        };
        // Tighter leading buys a size step before the text has to shrink further.
        if (!search()) {
            text.style.lineHeight = '1.12';
            if (!search()) {
                // Even the floor runs into the sockets: clamp to the lines that fit
                // above them rather than draw over the frame.
                const room = socketLine() - text.getBoundingClientRect().top;
                const lineHeight = parseFloat(window.getComputedStyle(text).lineHeight) || 4;
                text.style.maxHeight = `${Math.max(lineHeight, room).toFixed(1)}px`;
                text.style.overflow = 'hidden';
                text.style.display = '-webkit-box';
                text.style.webkitBoxOrient = 'vertical';
                text.style.webkitLineClamp = String(Math.max(1, Math.floor(room / lineHeight)));
            }
        }
        if (memo) memo.set(key, [list.style.fontSize, text.style.lineHeight, text.style.maxHeight, text.style.overflow, text.style.display, text.style.webkitLineClamp]);
    }

    function fitCardDescriptions(root) {
        if (!root) return;
        const memo = new Map();
        root.querySelectorAll('.binder-framed-slot .hand-card').forEach((card) => fitCardDescription(card, memo));
    }

    // Cards are fitted after layout, again once web fonts settle (metrics
    // change), and on resize, since card widths are viewport-relative.
    const fitRoots = new Set();
    let fitFrame = null;
    function scheduleDescriptionFit(root) {
        if (root) fitRoots.add(root);
        if (fitFrame != null) window.cancelAnimationFrame(fitFrame);
        fitFrame = window.requestAnimationFrame(() => {
            fitFrame = null;
            fitRoots.forEach(fitCardDescriptions);
        });
    }
    document.fonts?.ready?.then(() => scheduleDescriptionFit());
    let fitResizeTimer = null;
    window.addEventListener('resize', () => {
        window.clearTimeout(fitResizeTimer);
        fitResizeTimer = window.setTimeout(() => scheduleDescriptionFit(), 160);
    });

    // Auto-drifting card rows. A real overflow scroller (not a CSS transform) so a
    // thumb swipe or trackpad flick still browses it; the drift pauses while the
    // player is touching, hovering or focused inside, and resumes a moment after.
    // The content is rendered twice and the position wraps by one copy's width,
    // so the row never runs out.
    function bindAutoScroll(row, options) {
        const opts = options || {};
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion || !row.children.length) return;
        const reverse = row.hasAttribute('data-marquee-reverse');
        const speed = opts.speed || 28; // px per second
        let period = 0;
        let pos = 0;
        let pausedUntil = 0;
        let hovering = false;
        let visible = false;
        let last = 0;
        let lastSet = -1;

        function measure() {
            const half = row.children.length / 2;
            const first = row.children[0];
            const twin = row.children[half];
            period = first && twin ? twin.offsetLeft - first.offsetLeft : 0;
        }
        function wrap(value) {
            if (period <= 0) return value;
            return ((value % period) + period) % period;
        }
        function hold(ms) { pausedUntil = performance.now() + ms; }

        measure();
        pos = reverse ? period * 0.6 : 0;
        row.scrollLeft = pos;

        row.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') hovering = true; });
        row.addEventListener('pointerleave', () => { hovering = false; });
        row.addEventListener('pointerdown', () => hold(3200));
        row.addEventListener('touchstart', () => hold(3200), { passive: true });
        row.addEventListener('wheel', () => hold(2400), { passive: true });
        row.addEventListener('focusin', () => hold(6000));
        // Any scroll we did not cause is the player browsing: adopt their position.
        row.addEventListener('scroll', () => {
            if (Math.abs(row.scrollLeft - lastSet) > 2) {
                pos = row.scrollLeft;
                hold(2400);
            }
        }, { passive: true });
        window.addEventListener('resize', measure);
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => { visible = entries.some((entry) => entry.isIntersecting); }).observe(row);
        } else {
            visible = true;
        }

        function tick(now) {
            const dt = last ? Math.min(64, now - last) : 16;
            last = now;
            if (visible && !hovering && !document.hidden && now >= pausedUntil && period > 0) {
                pos = wrap(pos + (reverse ? -1 : 1) * speed * dt / 1000);
                row.scrollLeft = pos;
                lastSet = row.scrollLeft;
            }
            window.requestAnimationFrame(tick);
        }
        window.requestAnimationFrame(tick);
    }

    // Renders items twice for the seamless wrap; the second copy is hidden from
    // assistive tech and the tab order so each card is announced once.
    function fillMarquee(row, items, markup) {
        row.innerHTML = items.map((item, i) => markup(item, i, false)).join('')
            + items.map((item, i) => markup(item, i, true)).join('');
    }

    // The full roster comes from the same live catalog used by the deck builder.
    async function loadRosterEntries() {
        try {
            const payload = await loadGameOptions();
            const cards = Array.isArray(payload?.cardCatalog) ? payload.cardCatalog : [];
            const entries = cards
                .filter((card) => String(card?.type || '').toUpperCase() === 'SIEGLING' && String(card?.cardArtUrl || '').trim() && hasCardFrame(card))
                .map(normalizeRosterCard);
            if (entries.length) return entries;
        } catch (_ignored) {
            // A static preview or an unavailable API still presents the curated fallback.
        }
        return ROSTER_FALLBACK.map((entry) => ({ ...entry }));
    }

    async function bindRosterMarquee() {
        const rowA = document.getElementById('rosterMarqueeA');
        const rowB = document.getElementById('rosterMarqueeB');
        const spotlight = document.getElementById('rosterSpotlight');
        if (!rowA || !rowB) return;
        const entries = await loadRosterEntries();
        if (!entries.length) return;
        // Alternate cards between the rows so neighbours in the catalog (one
        // evolution line, one element) are spread across both.
        const rows = [[], []];
        entries.forEach((entry, i) => rows[entries.length < 8 ? 0 : i % 2].push(i));
        if (!rows[1].length) rows[1] = rows[0].slice().reverse();

        const markup = (index, _i, clone) => `
            <button class="marquee-card" type="button" data-roster-index="${index}"${clone ? ' aria-hidden="true" tabindex="-1"' : ''}
                    aria-label="Meet ${escapeAttr(entries[index].name)}">
                ${renderBinderFace(entries[index], { thumbWidth: 320 })}
            </button>`;
        fillMarquee(rowA, rows[0], markup);
        fillMarquee(rowB, rows[1], markup);
        scheduleDescriptionFit(rowA);
        scheduleDescriptionFit(rowB);

        function show(index) {
            if (!spotlight) return;
            const entry = entries[index];
            const key = String(entry.element || 'NEUTRAL').toLowerCase();
            spotlight.hidden = false;
            spotlight.style.setProperty('--roster-color', `var(--element-${key}, #aeeaff)`);
            spotlight.innerHTML = `
                <img class="roster-spotlight-art" ${thumbAttrs(entry.art, 240)} alt="">
                <div class="roster-spotlight-copy">
                    <span class="roster-element">${escapeHtml(entry.element)} · ${escapeHtml(entry.rarity || 'Siegling')}</span>
                    <h3>${escapeHtml(entry.name)}</h3>
                    <p>${escapeHtml(entry.description)}</p>
                </div>
                <button class="roster-spotlight-close" type="button" aria-label="Close ${escapeAttr(entry.name)}">×</button>`;
            spotlight.querySelector('.roster-spotlight-close')?.addEventListener('click', () => { spotlight.hidden = true; });
            [rowA, rowB].forEach((row) => row.querySelectorAll('[data-roster-index]').forEach((button) => {
                button.classList.toggle('is-active', Number(button.dataset.rosterIndex) === index);
            }));
        }
        [rowA, rowB].forEach((row) => {
            row.addEventListener('click', (event) => {
                const button = event.target.closest('[data-roster-index]');
                if (button) show(Number(button.dataset.rosterIndex));
            });
            bindAutoScroll(row, { speed: row === rowA ? 30 : 24 });
        });
    }

    // Legendary cards are shown as cards: live catalog art and stats where the
    // API answers, the curated copy for the words either way.
    // One-line pitches for legends outside the curated four, written from their
    // kits. Keyed by lower-case name: Zeel's catalog id is a placeholder.
    const LEGENDARY_PITCHES = {
        zeel: 'A storm serpent whose lightning chains from one foe to every enemy linked beside it.',
        conchious: 'The Defender of the Seas, raising living reefs that shield every ally on the tide line.'
    };

    // Any legend without a written pitch still gets a line: the first sentence
    // of its own text, cut at a word boundary so it stays a summary.
    function legendaryPitch(card, curated) {
        if (curated?.description) return curated.description;
        const written = LEGENDARY_PITCHES[String(card.name || '').trim().toLowerCase()];
        if (written) return written;
        const text = String(card.description || '').trim();
        const sentence = (text.match(/^[^.!?]+[.!?]/) || [text])[0].trim();
        if (sentence.length <= 110) return sentence;
        return `${sentence.slice(0, 107).replace(/\s+\S*$/, '')}…`;
    }

    async function renderLegendaryRow() {
        const host = document.getElementById('legendaryRow');
        if (!host) return;
        let legends = FEATURED_SIEGELINGS.map((entry) => ({ ...entry, pitch: entry.description }));
        try {
            const payload = await loadGameOptions();
            const live = (Array.isArray(payload?.cardCatalog) ? payload.cardCatalog : [])
                .filter((card) => String(card?.type || '').toUpperCase() === 'SIEGLING'
                    && String(card?.rarity || '').toUpperCase() === 'LEGENDARY'
                    && String(card?.cardArtUrl || '').trim()
                    && hasCardFrame(card));
            if (live.length) {
                // The card face prints the catalog text, as the binder does; the
                // curated line rides underneath as the pitch.
                legends = live.map((card) => {
                    const curated = FEATURED_SIEGELINGS.find((entry) => entry.id === String(card.id || '').toLowerCase());
                    const description = rosterDescription(card);
                    return { ...card, description, pitch: legendaryPitch({ ...card, description }, curated) };
                });
                // Curated legends lead; newer ones follow in catalog order.
                legends.sort((a, b) => {
                    const rank = (card) => { const i = FEATURED_SIEGELINGS.findIndex((entry) => entry.id === String(card.id || '').toLowerCase()); return i < 0 ? 99 : i; };
                    return rank(a) - rank(b);
                });
            }
        } catch (_ignored) {
            // Shipped art keeps the legendary row painted offline.
        }
        host.innerHTML = legends.map((card) => `
            <article class="legendary-card" aria-label="${escapeAttr(card.name)}, legendary ${escapeAttr(card.element)} Siegling">
                ${renderBinderFace(card, { thumbWidth: 480 })}
                ${card.pitch ? `<p>${escapeHtml(card.pitch)}</p>` : ''}
            </article>`).join('');
        scheduleDescriptionFit(host);
    }

    // ── Hero art stage ────────────────────────────────────────────────────
    // Two stacked layers cross-fade so a slide never shows an undecoded image;
    // the incoming layer is only revealed once its own <img> has loaded.
    function bindHeroArtStage() {
        const stage = document.getElementById('heroArtStage');
        if (!stage || !HERO_ART.length) return;
        const caption = document.getElementById('heroArtCaption');
        const portrait = window.matchMedia('(max-aspect-ratio: 9/10)');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const layers = [document.createElement('div'), document.createElement('div')];
        layers.forEach((layer) => {
            layer.className = 'hero-art-layer';
            stage.appendChild(layer);
        });
        let front = 0;
        let index = -1;

        function show(next) {
            index = (next + HERO_ART.length) % HERO_ART.length;
            const art = HERO_ART[index];
            const back = layers[1 - front];
            const url = artUrl(art.id, portrait.matches ? 'portrait' : 'landscape');
            const image = new Image();
            image.onload = () => {
                back.style.backgroundImage = `url('${url}')`;
                back.classList.add('is-visible');
                layers[front].classList.remove('is-visible');
                front = 1 - front;
                stage.style.setProperty('--hero-art-color', `var(--element-${art.element}, var(--siegelings-blue))`);
                if (caption) caption.textContent = art.title;
            };
            image.src = url;
        }

        show(0);
        if (!reducedMotion && HERO_ART.length > 1) {
            window.setInterval(() => show(index + 1), 7200);
        }
        // An orientation flip mid-rotation would otherwise keep serving the crop
        // built for the other aspect until the next tick.
        const onOrientation = () => show(index);
        if (portrait.addEventListener) portrait.addEventListener('change', onOrientation);
        else if (portrait.addListener) portrait.addListener(onOrientation);
    }

    // ── Element affinity rail ─────────────────────────────────────────────
    // The tiles are buttons, not list items: tapping one opens the element
    // overlay below, because a name plus a blurb does not explain what an
    // element IS. Seeing one of its Siegelings and the notch token it prints does.
    function renderElementRail() {
        const rail = document.getElementById('elementRail');
        if (!rail) return;
        rail.innerHTML = ELEMENT_LANDS.map((entry) => {
            const key = entry.key.toLowerCase();
            return `
                <li class="element-rail-item">
                  <button class="element-tile" type="button" data-element="${escapeAttr(entry.key)}"
                          aria-label="${escapeAttr(entry.label)}: ${escapeAttr(entry.blurb)}"
                          style="--tile-color: var(--element-${key}, var(--element-neutral, #9fb3d9))">
                    <span class="element-tile-art" aria-hidden="true" style="background-image:url('/img/lands/${entry.land}.webp')"></span>
                    <span class="element-tile-sigil" aria-hidden="true">${getElementSvg(entry.key)}</span>
                    <span class="element-tile-name">${escapeHtml(entry.label)}</span>
                    <span class="element-tile-blurb">${escapeHtml(entry.blurb)}</span>
                  </button>
                </li>`;
        }).join('');
        bindElementOverlay(rail);
    }

    // ── Element overlay ───────────────────────────────────────────────────
    // The notch token is the same composite the battle table draws: the square
    // notch plate as a background over the element colour on a round element, so
    // the landing page teaches the symbol a player will actually look for on a
    // card perimeter rather than a second, invented icon.
    function notchTokenUrl(element) {
        return `/img/notches/notch-${String(element || 'neutral').toLowerCase()}.png?v=2`;
    }

    // One Siegeling per element, chosen once and kept, so reopening a tile shows
    // the same face instead of reshuffling. Art is required - an overlay whose
    // whole point is the art has nothing to say without it.
    const __elementFaces = new Map();
    async function elementFace(element) {
        const key = String(element).toUpperCase();
        if (__elementFaces.has(key)) return __elementFaces.get(key);
        let face = null;
        try {
            const payload = await loadGameOptions();
            const cards = Array.isArray(payload?.cardCatalog) ? payload.cardCatalog : [];
            const pool = cards.filter((card) => String(card?.type || 'SIEGLING').toUpperCase() === 'SIEGLING'
                && String(card?.element || '').toUpperCase() === key
                && String(card?.cardArtUrl || '').trim());
            // Overlay-art cards are painted as a cutout on transparency, which is
            // what reads on a dark overlay; a full-card scan would drag its own
            // printed frame in with it. Prefer one, settle for any.
            const overlay = pool.filter((card) => String(card.cardArtMode || '').toUpperCase() === 'OVERLAY');
            const pick = (overlay.length ? overlay : pool)
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))[0];
            if (pick) face = { name: String(pick.name || ''), art: String(pick.cardArtUrl) };
        } catch (_ignored) {
            // Static preview or API away: the overlay still shows the notch and land.
        }
        if (!face) {
            // Offline fallback: the curated legend's shipped painting of itself.
            const fallback = FEATURED_SIEGELINGS.find((s) => String(s.element).toUpperCase() === key);
            if (fallback) face = { name: fallback.name, art: fallback.cardArtUrl };
        }
        __elementFaces.set(key, face);
        return face;
    }

    function bindElementOverlay(rail) {
        const entryFor = (key) => ELEMENT_LANDS.find((e) => e.key === key) || null;
        let overlay = document.getElementById('elementOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'elementOverlay';
            overlay.className = 'element-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.hidden = true;
            document.body.appendChild(overlay);
        }
        let opener = null;
        // Every open gets a token; a slow catalog response from a previous open
        // must not paint over the element the player is looking at now.
        let openToken = 0;

        function close() {
            overlay.classList.remove('is-open');
            overlay.hidden = true;
            document.body.classList.remove('element-overlay-open');
            if (opener && opener.isConnected) opener.focus({ preventScroll: true });
            opener = null;
        }

        async function open(key, button) {
            const entry = entryFor(key);
            if (!entry) return;
            const token = ++openToken;
            opener = button || null;
            const lower = entry.key.toLowerCase();
            overlay.style.setProperty('--tile-color', `var(--element-${lower}, var(--element-neutral, #9fb3d9))`);
            overlay.setAttribute('aria-label', `${entry.label} affinity`);
            overlay.innerHTML = `
                <div class="element-overlay-scrim" data-element-close></div>
                <div class="element-overlay-card">
                    <button class="element-overlay-close" type="button" data-element-close aria-label="Close">×</button>
                    <span class="element-overlay-land" aria-hidden="true" style="background-image:url('/img/lands/${entry.land}.webp')"></span>
                    <div class="element-overlay-art" data-element-art>
                        <span class="element-overlay-sigil" aria-hidden="true">${getElementSvg(entry.key)}</span>
                    </div>
                    <div class="element-overlay-body">
                        <span class="element-overlay-notch" aria-hidden="true"
                              style="--notch-icon:url('${notchTokenUrl(entry.key)}')"></span>
                        <h3 class="element-overlay-name">${escapeHtml(entry.label)}</h3>
                        <p class="element-overlay-blurb">${escapeHtml(entry.blurb)}</p>
                        <p class="element-overlay-notch-label">The ${escapeHtml(entry.label)} notch — point two of these at each other and the cards link.</p>
                        <p class="element-overlay-face" data-element-face></p>
                    </div>
                </div>`;
            overlay.hidden = false;
            // Reflow before the class lands, or the transition has nothing to run from.
            void overlay.offsetWidth;
            overlay.classList.add('is-open');
            document.body.classList.add('element-overlay-open');
            const closer = overlay.querySelector('.element-overlay-close');
            if (closer) closer.focus({ preventScroll: true });

            const face = await elementFace(entry.key);
            if (token !== openToken || !face || !face.art) return;
            const art = overlay.querySelector('[data-element-art]');
            const caption = overlay.querySelector('[data-element-face]');
            if (art) {
                art.insertAdjacentHTML('afterbegin',
                    `<img class="element-overlay-siegeling" ${thumbAttrs(face.art, 480)} alt="${escapeAttr(face.name)}" loading="lazy">`);
                art.classList.add('has-art');
            }
            if (caption && face.name) caption.textContent = face.name;
        }

        rail.addEventListener('click', (event) => {
            const button = event.target.closest('[data-element]');
            if (!button || !rail.contains(button)) return;
            open(button.getAttribute('data-element'), button);
        });
        overlay.addEventListener('click', (event) => {
            if (event.target.closest('[data-element-close]')) close();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && overlay.classList.contains('is-open')) close();
        });
    }

    // ── SiegeKnight rail ──────────────────────────────────────────────────
    // Mirrors how the game's loadout draws a SiegeKnight: the uploaded art in
    // the shared template's window (OVERLAY) or the whole painted card
    // (FULL_CARD), with the name, tier/rarity and the passive + active text laid
    // into the template's description box. That box is blank in the painted art
    // itself, so without this body the card says nothing about what it does.
    function knightArtTransformStyle(trainer) {
        const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        const xPct = num(trainer.cardArtOffsetXPct);
        const yPct = num(trainer.cardArtOffsetYPct);
        const usePct = xPct !== null || yPct !== null;
        // Percentage offsets are card-relative, so a dashboard crop holds the same
        // spot at any card size; the legacy pixel offsets are the older fallback.
        const tx = usePct ? `${clamp(xPct || 0, -200, 200)}%` : `${num(trainer.cardArtOffsetX) || 0}px`;
        const ty = usePct ? `${clamp(yPct || 0, -200, 200)}%` : `${num(trainer.cardArtOffsetY) || 0}px`;
        const scale = clamp(num(trainer.cardArtScale) ?? 1, 0.25, 3);
        const rotation = clamp(num(trainer.cardArtRotation) ?? 0, -180, 180);
        if (parseFloat(tx) === 0 && parseFloat(ty) === 0 && scale === 1 && !rotation) return '';
        return ` style="transform:translate(${tx},${ty}) scale(${scale}) rotate(${rotation}deg);transform-origin:center center;"`;
    }

    function knightAbilityText(ability) {
        if (!ability) return 'None';
        if (typeof ability === 'string') return ability;
        return ability.description || ability.name || 'None';
    }

    function knightCardMarkup(trainer) {
        const element = String(trainer.element || 'NEUTRAL').toUpperCase();
        const key = element.toLowerCase();
        const rarity = String(trainer.rarity || 'COMMON').toUpperCase();
        const tier = trainer.tier || 'SiegeKnight';
        const art = String(trainer.cardArtUrl || '').trim();
        const overlay = String(trainer.cardArtMode || '').trim().toUpperCase() === 'OVERLAY';
        const activeLabel = trainer.oncePerGame ? 'Ultimate' : 'Active';
        const artStyle = knightArtTransformStyle(trainer);
        const body = `
            <div class="knight-card-body">
                <span class="knight-card-name">${escapeHtml(trainer.name || 'SiegeKnight')}</span>
                <span class="knight-card-meta"><span class="knight-element">${escapeHtml(element)}</span> <span class="knight-tier">${escapeHtml(tier)}</span> <span class="knight-rarity rarity-${escapeAttr(rarity.toLowerCase())}">${escapeHtml(rarity)}</span></span>
                <span class="knight-card-ability"><span>Passive</span>${escapeHtml(knightAbilityText(trainer.passive))}</span>
                <span class="knight-card-ability"><span>${escapeHtml(activeLabel)}</span>${escapeHtml(knightAbilityText(trainer.active))}</span>
            </div>`;
        const artLayer = overlay
            ? `<div class="knight-overlay-art-window"><img class="knight-overlay-art-img" ${thumbAttrs(art, 480)} alt="" loading="lazy" decoding="async"${artStyle}></div>
               <div class="knight-card-template" aria-hidden="true"></div>`
            : `<img class="knight-full-art" ${thumbAttrs(art, 480)} alt="${escapeAttr(trainer.name || 'SiegeKnight card')}" loading="lazy" decoding="async"${artStyle}>`;
        return `
            <article class="knight-card${overlay ? ' is-overlay-art' : ''}" style="--knight-color: var(--element-${key}, var(--siegelings-gold)); --knight-glow: var(--element-${key}-glow, rgba(245,166,35,.45))">
                <div class="knight-card-art">${artLayer}${body}</div>
            </article>`;
    }

    async function renderKnightRail() {
        const rail = document.getElementById('knightRail');
        if (!rail) return;
        let trainers = SIEGE_KNIGHTS;
        try {
            const payload = await loadGameOptions();
            const live = Array.isArray(payload?.trainers)
                ? payload.trainers.filter((trainer) => trainer && String(trainer.cardArtUrl || '').trim())
                : [];
            if (live.length) trainers = live;
        } catch (_ignored) {
            // A static preview or an unavailable API still shows the shipped cards.
        }
        fillMarquee(rail, trainers, (trainer, _i, clone) => {
            const card = knightCardMarkup(trainer);
            return clone ? card.replace('<article class="knight-card', '<article aria-hidden="true" class="knight-card') : card;
        });
        bindAutoScroll(rail, { speed: 22 });
    }

    // ── World art marquee ─────────────────────────────────────────────────
    function renderWorldMarquee() {
        const host = document.getElementById('worldMarquee');
        if (!host) return;
        host.innerHTML = WORLD_ART.map((art) => `
            <figure class="world-tile" style="--world-color: var(--element-${art.element}, var(--siegelings-blue))">
                <img src="${escapeAttr(artUrl(art.id))}" alt="${escapeAttr(art.title)}" loading="lazy">
                <figcaption>${escapeHtml(art.title)}</figcaption>
            </figure>`).join('');
    }

    function bindLandingFab() {
        const nav = document.querySelector('.landing-fab');
        const toggle = nav?.querySelector('.landing-fab-toggle');
        const menu = nav?.querySelector('.landing-fab-menu');
        if (!nav || !toggle || !menu) return;
        function close() { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
        function open() { menu.hidden = false; toggle.setAttribute('aria-expanded', 'true'); }
        toggle.addEventListener('click', () => menu.hidden ? open() : close());
        menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
        document.addEventListener('click', (event) => { if (!nav.contains(event.target)) close(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value);
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

    // ── Login modal (mirrors the in-game auth UI) ─────────────────────────
    // Surfaces the same Sign in / Register flow the game uses, so players can
    // authenticate before the home/cards hub ever loads. The token is stashed
    // under the key home.js + game.js read, so the session carries straight in.
    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    // Stored under AUTH_TOKEN_KEY when auth has moved to the httpOnly session cookie
    // (no secret in localStorage); home.js/game.js treat it as "signed in".
    const COOKIE_SESSION_VALUE = 'cookie';
    // Written by home.js/game.js once /api/auth/me reports the server actually
    // received the session cookie. Until then the real token must be kept, or the
    // very next page load asks the player to sign in all over again.
    const COOKIE_AUTH_CONFIRMED_KEY = 'sieglingsCookieAuthConfirmed';
    const POST_LOGIN_DESTINATION = '/home';

    function cookieAuthConfirmed() {
        try {
            return localStorage.getItem(COOKIE_AUTH_CONFIRMED_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    // Standalone Web Apps (iOS "Add to Home Screen") don't reliably send the session
    // cookie across full-page navigations, so keep the real token there for Bearer auth.
    function isStandalonePWA() {
        try {
            return window.navigator.standalone === true
                || Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        } catch (e) {
            return false;
        }
    }

    function bindLoginModal() {
        const modal = document.getElementById('loginModal');
        const trigger = document.getElementById('ctaLogin');
        const body = document.getElementById('loginCardBody');
        if (!modal || !trigger || !body) return;

        let step = 'credentials';            // 'credentials' | 'display-name'
        let draft = { email: '', password: '' };
        let busy = false;

        function open() {
            step = 'credentials';
            draft = { email: '', password: '' };
            render();
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            window.setTimeout(() => body.querySelector('input')?.focus(), 30);
        }
        function close() {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }

        function render() {
            body.innerHTML = step === 'display-name' ? displayNameMarkup() : credentialsMarkup();
            bindCard();
        }

        function credentialsMarkup() {
            return `
                <strong>Sign in to save progression</strong>
                <span>Starter packs, Siegecoins, Remnants, owned cards, and custom decks require an account. New players start with 100 Siegecoins.</span>
                <input class="login-input" id="loginEmail" type="email" autocomplete="email" placeholder="Email" value="${escapeAttr(draft.email)}">
                <input class="login-input" id="loginPassword" type="password" autocomplete="current-password" placeholder="Password" value="${escapeAttr(draft.password)}">
                <p class="login-error" id="loginError" role="alert"></p>
                <button class="login-btn login-btn-primary" id="loginSubmitBtn" type="button">Log In</button>
                <button class="login-btn login-btn-ghost" id="loginRegisterBtn" type="button">Register</button>`;
        }

        function displayNameMarkup() {
            return `
                <strong>Choose your display name</strong>
                <span>Confirm how other duelists will see you (${escapeHtml(draft.email)}).</span>
                <input class="login-input" id="loginName" maxlength="20" placeholder="Display name" autofocus>
                <p class="login-error" id="loginError" role="alert"></p>
                <button class="login-btn login-btn-primary" id="loginConfirmBtn" type="button">Confirm</button>
                <button class="login-btn login-btn-ghost" id="loginBackBtn" type="button">Back</button>`;
        }

        function showError(message) {
            const el = body.querySelector('#loginError');
            if (el) el.textContent = message || '';
        }

        function readCredentials() {
            return {
                email: (body.querySelector('#loginEmail')?.value || '').trim(),
                password: body.querySelector('#loginPassword')?.value || ''
            };
        }

        function beginRegister() {
            const { email, password } = readCredentials();
            if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
                return showError('Enter a valid email address.');
            }
            if (!password || password.length < 6) {
                return showError('Passwords must be at least 6 characters.');
            }
            draft = { email, password };
            step = 'display-name';
            render();
            window.setTimeout(() => body.querySelector('#loginName')?.focus(), 30);
        }

        async function submit(mode) {
            if (busy) return;
            const payload = mode === 'register'
                ? { email: draft.email, password: draft.password, displayName: (body.querySelector('#loginName')?.value || '').trim() }
                : readCredentials();
            if (mode === 'login' && (!payload.email || !payload.password)) {
                return showError('Enter your email and password.');
            }
            busy = true;
            const submitBtn = body.querySelector('#loginSubmitBtn, #loginConfirmBtn');
            const originalLabel = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Please wait…'; }
            try {
                const resp = await fetch(`/api/auth/${mode}`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                let data = null;
                try { data = await resp.json(); } catch (_ignored) { /* non-JSON */ }
                if (!resp.ok || !data || data.error || !data.token) {
                    showError((data && data.error) || 'Something went wrong. Please try again.');
                    return;
                }
                // Keep the real token for Bearer-header auth unless the server has
                // already confirmed a session cookie reaches it, so the session
                // survives the full-page navigation into Home / Play / Keep / Siege.
                localStorage.setItem(
                    AUTH_TOKEN_KEY,
                    (cookieAuthConfirmed() && !isStandalonePWA()) ? COOKIE_SESSION_VALUE : data.token
                );
                window.location.assign(POST_LOGIN_DESTINATION);
            } catch (_networkError) {
                showError('Network error. Check your connection and try again.');
            } finally {
                busy = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
            }
        }

        function bindCard() {
            body.querySelector('#loginSubmitBtn')?.addEventListener('click', () => submit('login'));
            body.querySelector('#loginRegisterBtn')?.addEventListener('click', beginRegister);
            body.querySelector('#loginConfirmBtn')?.addEventListener('click', () => submit('register'));
            body.querySelector('#loginBackBtn')?.addEventListener('click', () => {
                step = 'credentials';
                render();
            });
            body.querySelector('#loginPassword')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit('login');
            });
            body.querySelector('#loginName')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit('register');
            });
        }

        trigger.addEventListener('click', open);
        modal.querySelectorAll('[data-close-login]').forEach((el) => el.addEventListener('click', close));
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
        fitHeroTagline();

        let active = false;
        let clearTimer = null;

        function pickHighlight(clientX) {
            const rect = wordmark.getBoundingClientRect();
            const pct = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
            const index = Math.max(0, Math.min(palette.length - 1, Math.floor(pct * palette.length)));
            return { color: palette[index], index };
        }

        function applyColor(color, index) {
            window.clearTimeout(clearTimer);
            wordmark.style.setProperty('--siegelings-hover-color', color);
            tagline.style.setProperty('--siegelings-hover-color', color);
            wordmark.classList.add('is-element-flow');
            tagline.classList.add('is-element-wave');
            if (typeof index === 'number' && window.LandingParticles) {
                window.LandingParticles.setHighlight(index);
            } else if (window.LandingParticles) {
                window.LandingParticles.setHighlight(color);
            }
        }

        wordmark.addEventListener('pointerenter', (event) => {
            active = true;
            const hit = pickHighlight(event.clientX);
            applyColor(hit.color, hit.index);
        });
        wordmark.addEventListener('pointermove', (event) => {
            if (!active) return;
            const hit = pickHighlight(event.clientX);
            applyColor(hit.color, hit.index);
        });
        wordmark.addEventListener('pointerleave', () => {
            active = false;
            wordmark.classList.remove('is-element-flow');
            tagline.classList.remove('is-element-wave');
            if (window.LandingParticles) {
                window.LandingParticles.clearHighlight(650);
            }
            clearTimer = window.setTimeout(() => {
                wordmark.style.removeProperty('--siegelings-hover-color');
                tagline.style.removeProperty('--siegelings-hover-color');
            }, 650);
        });
    }

    // ── Optional real asset wiring ────────────────────────────────────────
    function fitHeroTagline() {
        const tagline = document.querySelector('.hero-tagline');
        const heroContent = document.querySelector('.hero-content');
        if (!tagline || !heroContent) return;

        tagline.style.removeProperty('--tagline-fit-size');
        tagline.style.removeProperty('--tagline-fit-tracking');
        const baseStyle = getComputedStyle(tagline);
        const maxFont = parseFloat(baseStyle.getPropertyValue('--tagline-fit-size')) || 22;
        const minFont = 8.5;
        const maxTracking = Number.parseFloat(baseStyle.getPropertyValue('--tagline-fit-tracking')) || 0.32;
        const minTracking = 0.02;
        const available = Math.max(120, Math.min(heroContent.clientWidth, window.innerWidth - 28));

        tagline.style.setProperty('--tagline-fit-size', `${maxFont}px`);
        tagline.style.setProperty('--tagline-fit-tracking', `${maxTracking}em`);

        for (let pass = 0; pass < 4; pass += 1) {
            const width = tagline.scrollWidth || tagline.getBoundingClientRect().width;
            if (width <= available) break;
            const ratio = available / width;
            const currentFont = parseFloat(getComputedStyle(tagline).fontSize) || maxFont;
            const currentTracking = Number.parseFloat(tagline.style.getPropertyValue('--tagline-fit-tracking')) || maxTracking;
            const nextFont = Math.max(minFont, currentFont * ratio);
            const nextTracking = Math.max(minTracking, currentTracking * Math.max(0.58, ratio));
            tagline.style.setProperty('--tagline-fit-size', `${nextFont.toFixed(2)}px`);
            tagline.style.setProperty('--tagline-fit-tracking', `${nextTracking.toFixed(3)}em`);
        }
    }

    // ── Play Now → mode picker ────────────────────────────────────────────
    // Ask which mode first, exactly as the hub's primary Play button does.
    // This used to jump straight into Arena's loadout, which left Siege and the
    // Keep unreachable from the one control on the landing page that says
    // "play" — the same problem the hub button already solved.
    //
    // Arena writes the hub handoff (so the play page skips its welcome overlay
    // and drops players, guests included, onto premade decks and the common
    // SiegeKnight roster) and starts on the match-setup step, because saying
    // "Arena" is not yet choosing a deck. Siege and the Keep navigate
    // themselves, from the hrefs the picker carries.
    const PENDING_LOADOUT_KEY = 'sieglingsPendingLoadout';

    function queueArenaLoadout() {
        try {
            localStorage.setItem(PENDING_LOADOUT_KEY, JSON.stringify({
                createdAt: Date.now(),
                mode: 'solo',
                directLoadout: true,
                startStep: 'setup'
            }));
        } catch (e) {
            /* If storage is unavailable the navigation still proceeds and the
               play page simply shows its welcome overlay as before. */
        }
    }

    function bindPlayNow() {
        const trigger = document.getElementById('ctaPlay');
        if (!trigger) return;
        trigger.addEventListener('click', (event) => {
            const picker = window.SieglingsPlayModePicker;
            // No picker (script blocked or failed to load): keep the old direct
            // route rather than stranding the player on a button that does
            // nothing. The anchor's href="/play" performs the navigation.
            if (!picker) {
                queueArenaLoadout();
                return;
            }
            // The anchor would navigate out from under the picker otherwise.
            event.preventDefault();
            picker.open({
                onArena: () => {
                    queueArenaLoadout();
                    window.location.href = '/play';
                }
            });
        });
    }

    function init() {
        bindHeroArtStage();
        renderElementRail();
        renderKnightRail();
        renderWorldMarquee();
        bindRosterMarquee();
        renderLegendaryRow();
        bindPlacementDemo();
        bindLandingFab();
        bindParallax();
        bindTrailerModal();
        bindLoginModal();
        bindPlayNow();
        setFooterYear();
        bindSiegelingsColorWave();
        window.addEventListener('resize', fitHeroTagline);
        window.addEventListener('orientationchange', () => window.setTimeout(fitHeroTagline, 120));
        const heroContent = document.querySelector('.hero-content');
        if (window.ResizeObserver && heroContent) {
            new ResizeObserver(fitHeroTagline).observe(heroContent);
        }
        document.fonts?.ready?.then(fitHeroTagline);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
