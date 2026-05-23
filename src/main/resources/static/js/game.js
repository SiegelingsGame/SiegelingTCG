let gameState = null;

/**
 * Remembers the last element that activated each perimeter socket so the socket
 * keeps its color as a reference after the Siegling is removed. A new notch
 * connection to the same socket overwrites the stored element.
 */
// External sockets are active only while a notch currently touches them.
// We intentionally do NOT "remember" prior touches: otherwise exterior notches appear permanently active.
let externalSocketElementMemory = { player: Object.create(null), enemy: Object.create(null) };

function clearExternalSocketElementMemory() {
    externalSocketElementMemory.player = Object.create(null);
    externalSocketElementMemory.enemy = Object.create(null);
}
let selectedCard = null;
/** Index in `gameState.player.hand` for selection UI (duplicates share `card.id`). */
let selectedHandIndex = null;
let targetMode = false;
let targetContext = null;
let gameOptions = null;
let selectedDeckId = null;
let selectedTrainerId = null;
let loadoutMode = 'preset';
let builderCounts = {};
let builderElementFilter = 'ALL';
let builderTypeFilter = 'ALL';
let selectedBuilderPreviewId = null;
let matchMode = 'solo';
let onlineRoomMode = 'create';
let multiplayerSession = loadSavedMultiplayerSession();
let roomPollHandle = null;
let currentRoomStatus = null;
let mobileInfoTab = 'battle';
let mobileHudSheetSide = 'enemy';
let mobileHudSheetOpen = false;
let mulliganSelectedIndices = new Set();
let mulliganHandSig = '';
let loadoutErrorMessage = '';
let loadoutStartPending = false;
let lastInteractionCueKey = '';
let transientMessageTimer = null;
let hoveredHandIndex = null;
let hoveredBoardCard = null;
/** Persisted board selection for live preview / drawer ({ isPlayer, row, col, instanceId }). */
let arenaSelection = null;
let pendingClaimTarget = null;
let lastRenderedPhase = null;
let phaseTransitionTimer = null;
let handTouchGesture = null;
let handAutoScrollFrame = null;
let handAutoScrollDirection = 0;
let handAutoScrollAxis = null;
let handSelectorScaleFrame = null;
let previewCardScaleFrame = null;
let handTouchSuppressHandIndex = null;
let handTouchSuppressUntil = 0;
let lastViewportSignature = '';
const PLAYER_NAME_STORAGE_KEY = 'sieglingsPlayerName';
const AUTH_TOKEN_STORAGE_KEY = 'sieglingsAuthToken';
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const LOADOUT_ACTION_TIMEOUT_MS = 90000;
const BATTLE_AUTO_ADVANCE_DELAY_MS = 1550;
let battleAutoAdvanceTimer = null;
let battleAutoAdvanceInFlight = false;
let battleHandViewOpen = false;
let welcomeSlideIndex = 0;
let welcomeDismissed = false;
const LEADERBOARD_STORAGE_KEY = 'sieglings_leaderboards_v1';
const LEADERBOARD_TABS = [
    { id: 'wins', label: 'Wins' },
    { id: 'matchesPlayed', label: 'Matches' },
    { id: 'spellsCast', label: 'Spells' },
    { id: 'trapsSprung', label: 'Traps' },
    { id: 'siegelingsDefeated', label: 'Sieglings' },
    { id: 'pvpWinRate', label: 'PVP W/L' }
];
let welcomeLeaderboardState = {
    tab: 'wins',
    data: null,
    loading: false,
    error: ''
};
let authMode = 'login';
let authState = {
    token: loadSavedAuthToken(),
    profile: null,
    loading: false,
    error: ''
};
let selectedSavedDeckId = null;
let lastProfileRefreshKey = '';
const ROW_NAMES = ['Back', 'Middle', 'Front'];
const TARGET_TYPES = {
    SINGLE_ENEMY: 'enemy',
    SINGLE_ALLY: 'ally',
    ROW_SELECT_ENEMIES: 'row-enemy',
    ROW_SELECT_ALLIES: 'row-ally'
};
const EFFECT_KIND_MAP = {
    damage: 'damage',
    player_damage: 'damage',
    destroy: 'damage',
    draw: 'buff',
    heal: 'heal',
    shield: 'buff',
    damage_boost: 'buff',
    health_boost: 'buff',
    speed_boost: 'buff',
    connected_allies_damage_boost: 'buff',
    connected_allies_health_boost: 'buff',
    connected_allies_shield: 'buff',
    connected_allies_speed_boost: 'buff',
    freeze: 'freeze',
    slow: 'freeze',
    speed_zero: 'freeze',
    move_link: 'move'
};
const TARGET_ARROW_PALETTES = {
    damage: { source: '#ffaa55', target: '#ff3344', glow: '#ff6644' },
    heal: { source: '#a8ffd2', target: '#3ce08a', glow: '#5bffae' },
    buff: { source: '#9adfff', target: '#3a98ff', glow: '#5cbcff' },
    freeze: { source: '#dff0ff', target: '#7adfff', glow: '#a6edff' },
    move: { source: '#e2c2ff', target: '#9a55ff', glow: '#b985ff' },
    default: { source: '#ffd28a', target: '#ffaa55', glow: '#ffbd70' }
};

const LOADOUT_ELEMENT_THEMES = {
    FIRE: {
        element: 'FIRE',
        playstyle: 'Aggressive',
        traits: ['Burn', 'Pressure', 'Attack'],
        description: 'Pressure your opponent with burn damage, fast attack lines, and aggressive tempo.',
        recommendedTrainerIds: ['trainer01', 'trainer02', 'trainer10']
    },
    EARTH: {
        element: 'EARTH',
        playstyle: 'Defensive',
        traits: ['Durability', 'Healing', 'Control'],
        description: 'Outlast your opponent with high durability, healing, and defensive board control.',
        recommendedTrainerIds: ['trainer12', 'trainer05', 'trainer13']
    },
    WIND: {
        element: 'WIND',
        playstyle: 'Tempo',
        traits: ['Speed', 'Disruption', 'Mobility'],
        description: 'Win through speed, disruption, and tempo manipulation.',
        recommendedTrainerIds: ['trainer14', 'trainer06', 'trainer15']
    },
    ICE: {
        element: 'ICE',
        playstyle: 'Control',
        traits: ['Freeze', 'Lockdown', 'Resist'],
        description: 'Lock down the battlefield with freeze effects, resistance, and control.',
        recommendedTrainerIds: ['trainer20', 'trainer09', 'trainer21']
    },
    WATER: {
        element: 'WATER',
        playstyle: 'Sustain',
        traits: ['Control', 'Healing', 'Flow'],
        description: 'Control the match with sustain, tempo denial, and steady board pressure.',
        recommendedTrainerIds: ['trainer03', 'trainer04', 'trainer11']
    },
    SHADOW: {
        element: 'SHADOW',
        playstyle: 'Assassin',
        traits: ['Ambush', 'Pressure', 'Picks'],
        description: 'Pick apart key lanes with direct pressure and sharp removal windows.',
        recommendedTrainerIds: ['trainer16', 'trainer07', 'trainer17']
    },
    ELECTRIC: {
        element: 'ELECTRIC',
        playstyle: 'Burst Tempo',
        traits: ['Charge', 'Speed', 'Burst'],
        description: 'Build fast openings with charged bursts and quick tempo swings.',
        recommendedTrainerIds: ['trainer18', 'trainer08', 'trainer19']
    },
    METAL: {
        element: 'METAL',
        playstyle: 'Fortress',
        traits: ['Armor', 'Durability', 'Stabilize'],
        description: 'Anchor the battlefield with armored bodies and durable board presence.',
        recommendedTrainerIds: ['trainer22', 'trainer23', 'trainer24']
    },
    UNDEAD: {
        element: 'UNDEAD',
        playstyle: 'Relentless',
        traits: ['Pressure', 'Drain', 'Attrition'],
        description: 'Keep the opponent under pressure with resilient threats and direct damage.',
        recommendedTrainerIds: ['trainer25', 'trainer26', 'trainer27']
    },
    PSYCHIC: {
        element: 'PSYCHIC',
        playstyle: 'Manipulation',
        traits: ['Disrupt', 'Boost', 'Control'],
        description: 'Bend the flow of battle with disruptive timing and precision buffs.',
        recommendedTrainerIds: ['trainer28', 'trainer29', 'trainer30']
    }
};

const LOADOUT_DECK_THEMES = {
    deck_fire: {
        ...LOADOUT_ELEMENT_THEMES.FIRE,
        label: 'Fire',
        description: 'Pressure your opponent with burn damage, fast attack lines, and aggressive tempo.'
    },
    deck_earth: {
        ...LOADOUT_ELEMENT_THEMES.EARTH,
        label: 'Earth',
        description: 'Outlast your opponent with high durability, healing, and defensive board control.'
    },
    deck_wind: {
        ...LOADOUT_ELEMENT_THEMES.WIND,
        label: 'Wind',
        description: 'Win through speed, disruption, and tempo manipulation.'
    },
    deck_ice: {
        ...LOADOUT_ELEMENT_THEMES.ICE,
        label: 'Ice',
        description: 'Lock down the battlefield with freeze effects, resistance, and control.'
    }
};

const STATUS_BADGE_PALETTE = {
    FREEZE:       '#7adfff',
    SPEED_ZERO:   '#a0b0c0',
    HEALTH_BOOST: '#a8b0ba',
    DAMAGE_BOOST: '#ff5544',
    SPEED_BOOST:  '#7adfff',
    WEAK:         '#ff6080',
    STRONG:       '#ffd060'
};

const STATUS_BADGE_LABEL = {
    FREEZE: 'Frozen — cannot act',
    SPEED_ZERO: 'Speed Zero — acts last',
    HEALTH_BOOST: 'Shield',
    DAMAGE_BOOST: 'Damage Boost',
    SPEED_BOOST: 'Speed Boost',
    WEAK: 'Weak to Attack',
    STRONG: 'Strong Against Enemy'
};

const STATUS_BADGE_SVG = {
    FREEZE: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-fz-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#dff6ff"/><stop offset="50%" stop-color="#5fb8e8"/><stop offset="100%" stop-color="#1a4a7a"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#5fb8e8" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-fz-bg)" stroke="#dff6ff" stroke-width="2"/><g stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none" class="sb-spin"><line x1="42" y1="20" x2="42" y2="64"/><line x1="22" y1="42" x2="62" y2="42"/><line x1="27" y1="27" x2="57" y2="57"/><line x1="57" y1="27" x2="27" y2="57"/><path d="M42 20 L37 26 M42 20 L47 26 M42 64 L37 58 M42 64 L47 58 M22 42 L28 37 M22 42 L28 47 M62 42 L56 37 M62 42 L56 47"/></g><circle cx="42" cy="42" r="3" fill="#fff"/></svg>`,
    SPEED_ZERO: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-sz-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#a0b0c0"/><stop offset="50%" stop-color="#4a5a78"/><stop offset="100%" stop-color="#1a2030"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#4a5a78" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-sz-bg)" stroke="#a0b0c0" stroke-width="2"/><g stroke="#5a6a80" stroke-width="2" stroke-linejoin="round" fill="#7a8aa0" opacity=".7"><path d="M48 18 L34 40 L42 40 L36 50"/><path d="M40 50 L48 38 L42 38 L48 28"/></g><circle cx="42" cy="46" r="14" fill="none" stroke="#fff" stroke-width="3.5"/><line x1="32" y1="36" x2="52" y2="56" stroke="#ff5544" stroke-width="3.5" stroke-linecap="round"/></svg>`,
    HEALTH_BOOST: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-sh-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#f3f6fa"/><stop offset="55%" stop-color="#a8b0ba"/><stop offset="100%" stop-color="#4a5360"/></radialGradient><linearGradient id="sb-sh-face" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#b8c0ca"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#a8b0ba" opacity=".25" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-sh-bg)" stroke="#f3f6fa" stroke-width="2"/><path d="M42 18 L62 26 L62 42 C 62 54 54 64 42 70 C 30 64 22 54 22 42 L22 26 Z" fill="url(#sb-sh-face)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" class="sb-float"/><path d="M42 23 L42 64" stroke="#77808c" stroke-width="2" opacity=".55"/></svg>`,
    DAMAGE_BOOST: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-dmg-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#ffe0c0"/><stop offset="50%" stop-color="#ff6633"/><stop offset="100%" stop-color="#5a1a0a"/></radialGradient><linearGradient id="sb-dmg-sword" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="50%" stop-color="#ffd8a0"/><stop offset="100%" stop-color="#c87040"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#ff5533" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-dmg-bg)" stroke="#ffe0c0" stroke-width="2"/><g stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><g transform="rotate(45 42 42)"><rect x="40.5" y="20" width="3" height="34" fill="url(#sb-dmg-sword)"/><polygon points="42,16 39,22 45,22" fill="#ffd8a0"/><rect x="36" y="54" width="12" height="3" fill="#5a1a0a"/><rect x="40" y="56" width="4" height="6" fill="#5a1a0a"/></g><g transform="rotate(-45 42 42)"><rect x="40.5" y="20" width="3" height="34" fill="url(#sb-dmg-sword)"/><polygon points="42,16 39,22 45,22" fill="#ffd8a0"/><rect x="36" y="54" width="12" height="3" fill="#5a1a0a"/><rect x="40" y="56" width="4" height="6" fill="#5a1a0a"/></g></g><circle cx="42" cy="42" r="4" fill="#fff8c0" class="sb-flicker"/></svg>`,
    SPEED_BOOST: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-sp-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#dff8ff"/><stop offset="50%" stop-color="#3ad8ff"/><stop offset="100%" stop-color="#1a5a7a"/></radialGradient><linearGradient id="sb-sp-bolt" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="50%" stop-color="#fff8c0"/><stop offset="100%" stop-color="#7adfff"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#3ad8ff" opacity=".25" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-sp-bg)" stroke="#dff8ff" stroke-width="2"/><g stroke="#dff8ff" stroke-width="1.5" stroke-linecap="round" opacity=".5"><line x1="22" y1="32" x2="30" y2="32"/><line x1="20" y1="42" x2="32" y2="42"/><line x1="22" y1="52" x2="30" y2="52"/></g><path d="M48 18 L32 44 L42 44 L36 64 L56 36 L46 36 Z" fill="url(#sb-sp-bolt)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" class="sb-flicker"/></svg>`,
    WEAK: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-wk-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#ffd0d8"/><stop offset="50%" stop-color="#a02038"/><stop offset="100%" stop-color="#3a0a18"/></radialGradient><linearGradient id="sb-wk-shield" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ff6080"/><stop offset="100%" stop-color="#5a0a18"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#a02038" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-wk-bg)" stroke="#ffd0d8" stroke-width="2"/><g class="sb-floatdn"><path d="M42 22 L58 28 L58 44 C 58 54 50 60 42 64 C 34 60 26 54 26 44 L26 28 Z" fill="url(#sb-wk-shield)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M42 24 L38 34 L44 38 L36 48 L46 52 L40 62" stroke="#fff8c0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g><g transform="translate(60 60)"><circle r="9" fill="#1a0a18" stroke="#ff6080" stroke-width="1.5"/><path d="M0 -4 L0 4 M-3 1 L0 4 L3 1" stroke="#ff6080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g></svg>`,
    STRONG: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-st-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#fff4c0"/><stop offset="50%" stop-color="#e8a020"/><stop offset="100%" stop-color="#5a3a08"/></radialGradient><linearGradient id="sb-st-star" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="60%" stop-color="#ffe080"/><stop offset="100%" stop-color="#e8a020"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#ffd060" opacity=".3" class="sb-pulse"/><g class="sb-spin-rev" opacity=".55"><line x1="42" y1="6" x2="42" y2="14" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/><line x1="42" y1="70" x2="42" y2="78" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="42" x2="14" y2="42" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/><line x1="70" y1="42" x2="78" y2="42" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/></g><circle cx="42" cy="42" r="34" fill="url(#sb-st-bg)" stroke="#fff4c0" stroke-width="2"/><polygon points="42,20 47,35 63,35 50,44 55,60 42,51 29,60 34,44 21,35 37,35" fill="url(#sb-st-star)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" class="sb-float"/><g transform="translate(60 60)"><circle r="9" fill="#3a2008" stroke="#ffe080" stroke-width="1.5"/><path d="M0 4 L0 -4 M-3 -1 L0 -4 L3 -1" stroke="#ffe080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g></svg>`
};

function getShieldInfo(cell, hpOverride, maxHpOverride) {
    const shieldHp = Number(cell?.shieldHp);
    const total = Number.isFinite(shieldHp) ? Math.max(0, shieldHp) : 0;
    const intact = total;
    const depleted = 0;
    const state = total <= 0
        ? 'none'
        : 'intact';
    const intactPct = total > 0 ? 100 : 0;
    return { active: total > 0, total, intact, depleted, state, intactPct };
}

function renderShieldChip(info) {
    if (!info?.active || info.intact <= 0) return '';
    const stateClass = ` stat-shield--${info.state}`;
    const title = info.depleted > 0
        ? `Shield +${info.total}: ${info.intact} intact, ${info.depleted} depleted`
        : `Shield +${info.total}: intact`;
    return `<span class="stat-shield${stateClass}" title="${title}" data-shield-state="${info.state}" style="--shield-intact-pct:${info.intactPct}%"><span class="stat-shield-icon" aria-hidden="true"></span><span class="stat-shield-value">+${info.total}</span></span>`;
}

function renderStatusBadge(kind, amount, options = {}) {
    const svg = STATUS_BADGE_SVG[kind];
    if (!svg) return '';
    const color = STATUS_BADGE_PALETTE[kind] || '#fff';
    const label = STATUS_BADGE_LABEL[kind] || kind;
    const shieldState = options.shieldState || '';
    const shieldStateText = kind === 'HEALTH_BOOST' && shieldState && shieldState !== 'intact'
        ? ` (${shieldState})`
        : '';
    const tooltip = amount > 0 ? `${label} +${amount}${shieldStateText}` : `${label}${shieldStateText}`;
    const numHtml = amount > 0
        ? `<span class="sb-num" style="--sb-color:${color}">+${amount}</span>`
        : '';
    const shieldAttr = shieldState ? ` data-shield-state="${shieldState}"` : '';
    return `<span class="sb-badge" style="--sb-color:${color}" title="${tooltip}" data-status="${kind}"${shieldAttr}>${svg}${numHtml}</span>`;
}

function renderStatusBadgesForCell(cell) {
    if (!cell) return '';
    const statuses = Array.isArray(cell.statuses) ? cell.statuses : [];
    const printedSpd = Number(cell.printedSpeed);
    const spd = Number(cell.spd);
    const dmgBoost = Number(cell.damageBoost) || 0;
    const shieldInfo = getShieldInfo(cell);

    const items = [];
    const seen = new Set();
    const push = (kind, amount, options = {}) => {
        if (seen.has(kind)) return;
        seen.add(kind);
        items.push(renderStatusBadge(kind, amount, options));
    };

    statuses.forEach((raw) => {
        const kind = String(raw || '').toUpperCase();
        // HEALTH_BOOST is the shield buff. Skip it once the shield is
        // spent (no remaining absorb) so the badge clears alongside the
        // grey HP background and the plate overlay — even if the
        // underlying status is still on the card server-side.
        if (kind === 'HEALTH_BOOST' && shieldInfo.intact <= 0) return;
        let amount = 0;
        if (kind === 'HEALTH_BOOST') {
            amount = shieldInfo.total;
        } else if (kind === 'DAMAGE_BOOST') {
            amount = dmgBoost;
        } else if (kind === 'SPEED_BOOST' && Number.isFinite(spd) && Number.isFinite(printedSpd)) {
            amount = Math.max(0, spd - printedSpd);
        }
        push(kind, amount, kind === 'HEALTH_BOOST' ? { shieldState: shieldInfo.state } : {});
    });

    if (!seen.has('HEALTH_BOOST') && shieldInfo.active && shieldInfo.intact > 0) {
        push('HEALTH_BOOST', shieldInfo.total, { shieldState: shieldInfo.state });
    }
    // Inferred SPEED_BOOST when speed is buffed but no explicit status flag (backend may not yet emit it)
    if (!seen.has('SPEED_BOOST') && !seen.has('SPEED_ZERO') && Number.isFinite(spd) && Number.isFinite(printedSpd) && spd > printedSpd) {
        push('SPEED_BOOST', spd - printedSpd);
    }
    if (!seen.has('DAMAGE_BOOST') && dmgBoost > 0) {
        push('DAMAGE_BOOST', dmgBoost);
    }

    if (items.length === 0) return '';
    return `<div class="status-icons">${items.join('')}</div>`;
}
const TARGET_ARROW_STAGGER_MS = 40;
const TARGET_ARROW_FADE_MS = 200;
const TARGET_ARROW_SVG_NS = 'http://www.w3.org/2000/svg';
const DASHBOARD_ACCESS_PASSWORD = 'Aviators4!';
const targetArrowPreviewState = {
    active: false,
    source: null,
    targets: [],
    kind: 'default',
    startedAt: 0,
    dashPhase: 0,
    raf: 0,
    reducedMotion: false
};
if (typeof window.matchMedia === 'function') {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    targetArrowPreviewState.reducedMotion = Boolean(motionQuery.matches);
    const handleMotionChange = () => {
        targetArrowPreviewState.reducedMotion = Boolean(motionQuery.matches);
        if (targetArrowPreviewState.active) {
            drawDomTargetingPreview(performance.now());
        }
    };
    if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', handleMotionChange);
    } else if (typeof motionQuery.addListener === 'function') {
        motionQuery.addListener(handleMotionChange);
    }
}
const ENERGY_ORDER = [
    ['fire', 'Fire'],
    ['earth', 'Earth'],
    ['wind', 'Wind'],
    ['water', 'Water'],
    ['ice', 'Ice'],
    ['shadow', 'Shadow'],
    ['electric', 'Electric'],
    ['metal', 'Metal'],
    ['undead', 'Undead'],
    ['psychic', 'Psychic']
];
const API_BASE_URL = normalizeApiBaseUrl(
    window.SIEGLINGS_CONFIG?.apiBaseUrl || window.SIEGLINGS_API_BASE || ''
);
let activeApiBaseUrl = API_BASE_URL;
const LOG_FILTER_STORAGE_KEY = 'sieglings_log_filters';

function loadLogFilters() {
    try {
        const raw = localStorage.getItem(LOG_FILTER_STORAGE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            return {
                turns: p.turns !== false,
                rounds: p.rounds !== false,
                actions: p.actions !== false
            };
        }
    } catch (e) {
        /* ignore */
    }
    return { turns: true, rounds: true, actions: true };
}

function saveLogFilters(f) {
    try {
        localStorage.setItem(LOG_FILTER_STORAGE_KEY, JSON.stringify(f));
    } catch (e) {
        /* ignore */
    }
}

function isRoundLogLine(entry) {
    return /---\s*Round\s+\d+|Turn order this round/i.test(String(entry));
}

function isBattlePhaseLogEntry(entry) {
    return /^\[Turn\s+\d+\s+BATTLE\]\s*/.test(String(entry));
}

/** turns = draw phase, rounds = round headers, actions = setup + battle */
function logEntryMatchesFilters(entry, filters) {
    const roundLine = isRoundLogLine(entry);
    const m = String(entry).match(/^\[Turn\s+(\d+)\s+(\w+)\]\s*/);
    if (!m) {
        return filters.turns && filters.rounds && filters.actions;
    }
    const phase = m[2];
    if (roundLine) {
        return filters.rounds;
    }
    if (phase === 'DRAW') {
        return filters.turns;
    }
    if (phase === 'SETUP' || phase === 'BATTLE') {
        return filters.actions;
    }
    return filters.actions;
}

function getFilteredGameLog(entries) {
    const filters = loadLogFilters();
    if (!Array.isArray(entries)) {
        return [];
    }
    if (filters.turns && filters.rounds && filters.actions) {
        return entries;
    }
    return entries.filter((e) => logEntryMatchesFilters(e, filters));
}

function renderGameLogToolbar() {
    const bar = document.getElementById('gameLogToolbar');
    if (!bar) {
        return;
    }
    const f = loadLogFilters();
    bar.innerHTML = `
        <span class="game-log-toolbar-label">Show</span>
        <label class="game-log-filter"><input type="checkbox" data-log-filter="turns" ${f.turns ? 'checked' : ''}/> Turns</label>
        <label class="game-log-filter"><input type="checkbox" data-log-filter="rounds" ${f.rounds ? 'checked' : ''}/> Rounds</label>
        <label class="game-log-filter"><input type="checkbox" data-log-filter="actions" ${f.actions ? 'checked' : ''}/> Actions</label>
    `;
    if (bar.dataset.wired !== '1') {
        bar.dataset.wired = '1';
        bar.addEventListener('change', (ev) => {
            const t = ev.target;
            if (!t || t.tagName !== 'INPUT' || !t.dataset.logFilter) {
                return;
            }
            const key = t.dataset.logFilter;
            const next = { ...loadLogFilters(), [key]: t.checked };
            saveLogFilters(next);
            renderLog();
        });
    }
}

function sieglingPlacementLockMessage() {
    if (!gameState?.playerPlacementUsed) {
        return '';
    }
    const used = gameState.setupSieglingActionsUsed;
    const budget = gameState.setupSieglingActionBudget;
    if (used != null && budget != null) {
        return `No setup actions left (${used}/${budget}; 1 base + 1 per energy in your pool when you entered setup). End the turn to continue.`;
    }
    return 'No setup actions left this turn. End the turn to continue.';
}

function isPlacementBudgetLockedForCard(card) {
    return Boolean(gameState?.playerPlacementUsed);
}
const CARD_ART_BY_KEY = Object.freeze({
    sundile: { url: '/assets/cards/sundile.svg' },
    staticap: {
        url: '/images/cards/Staticap.png',
        crop: 'illustration'
    }
});
const WELCOME_SLIDES = [
    {
        title: '1. Notches can wake external sockets',
        copy: 'When you place a Siegling, any notch that points off the board lines up with a perimeter socket. That live connection feeds your energy pool the same way it does in a real match.',
        visual: `
            <div class="tutorial-visual tutorial-board">
                <div class="tutorial-arena-mid tutorial-arena-external-demo">
                    <div class="tutorial-grid-with-sides tutorial-has-ex-connector">
                        <div class="tutorial-ex-rail vertical tutorial-ex-rail--rows" aria-hidden="true">
                            <span class="tutorial-ex-point"></span>
                            <span class="tutorial-ex-point active fire"></span>
                            <span class="tutorial-ex-point"></span>
                        </div>
                        <div class="tutorial-board-stage">
                            <div class="tutorial-board-grid seamless">
                                <div class="tutorial-slot"></div>
                                <div class="tutorial-slot"></div>
                                <div class="tutorial-slot"></div>
                                <div class="tutorial-slot tutorial-slot-anchored">
                                    <span class="tutorial-slot-face">S</span>
                                    <span class="tutorial-slot-notch left fire"></span>
                                </div>
                                <div class="tutorial-slot"></div>
                                <div class="tutorial-slot"></div>
                                <div class="tutorial-slot"></div>
                                <div class="tutorial-slot"></div>
                                <div class="tutorial-slot"></div>
                            </div>
                        </div>
                        <div class="tutorial-ex-rail vertical tutorial-ex-rail--rows" aria-hidden="true">
                            <span class="tutorial-ex-point"></span>
                            <span class="tutorial-ex-point"></span>
                            <span class="tutorial-ex-point"></span>
                        </div>
                        <div class="tutorial-ex-bar-to-socket" aria-hidden="true"></div>
                    </div>
                    <div class="tutorial-ex-rail horizontal" aria-hidden="true">
                        <span class="tutorial-ex-point"></span>
                        <span class="tutorial-ex-point"></span>
                        <span class="tutorial-ex-point"></span>
                    </div>
                </div>
                <div class="tutorial-caption">The straight bar is the same external link the game draws from your card to the glowing socket.</div>
            </div>
        `
    },
    {
        title: '2. Same element, straight link',
        copy: 'When opposite notches share an element, the arena draws a simple horizontal bar between them—exactly the same connector style you see between linked Sieglings in play.',
        visual: `
            <div class="tutorial-visual tutorial-links">
                <div class="tutorial-arena-mid tutorial-arena-compact">
                    <div class="tutorial-board-stage">
                        <div class="tutorial-same-element-pair">
                            <div class="tutorial-slot tutorial-slot-anchored">
                                <span class="tutorial-slot-face">A</span>
                                <span class="tutorial-slot-notch right fire"></span>
                            </div>
                            <span class="tutorial-inner-fire-link-bar" aria-hidden="true"></span>
                            <div class="tutorial-slot tutorial-slot-anchored">
                                <span class="tutorial-slot-face">B</span>
                                <span class="tutorial-slot-notch left fire"></span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="tutorial-caption">This is the same straight bar the live board draws between two matching notches.</div>
            </div>
        `
    },
    {
        title: '3. Mix elements for spells and traps',
        copy: 'Linking different elements bends the pathway: the board blends both colors along a zigzag. That mixed energy is what lets you pay for powerful spell and trap cards that ask for more than one element.',
        visual: `
            <div class="tutorial-visual tutorial-mix">
                <div class="tutorial-arena-mid tutorial-arena-compact">
                    <div class="tutorial-board-stage">
                        <div class="tutorial-mix-element-pair">
                            <div class="tutorial-slot tutorial-slot-linked tutorial-slot-linked-left fire">
                                <span class="tutorial-slot-face">A</span>
                                <span class="tutorial-slot-notch right fire"></span>
                            </div>
                            <div class="tutorial-mix-link-bridge" aria-hidden="true">
                                <svg width="64" height="12" viewBox="0 -2 64 12" overflow="visible" aria-hidden="true">
                                    <defs>
                                        <linearGradient id="welcomeMixGradSlide3" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="45%" stop-color="#ff501e"/>
                                            <stop offset="55%" stop-color="#b48c50"/>
                                        </linearGradient>
                                    </defs>
                                    <path d="M0,4 L5.3,9.0 L10.7,4.0 L16.0,-1.0 L21.3,4.0 L26.7,9.0 L32.0,4.0 L37.3,-1.0 L42.7,4.0 L48.0,9.0 L53.3,4.0 L58.7,-1.0 L64.0,4.0" fill="none" stroke="url(#welcomeMixGradSlide3)" stroke-width="5" stroke-linecap="round"/>
                                </svg>
                            </div>
                            <div class="tutorial-slot tutorial-slot-linked tutorial-slot-linked-right earth">
                                <span class="tutorial-slot-face">B</span>
                                <span class="tutorial-slot-notch left earth"></span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="tutorial-caption">Hybrid links mirror the zigzag gradient paths the game paints for mismatched elements.</div>
            </div>
        `
    },
    {
        title: '4. Battle mode in motion',
        copy: 'After setup, battle turns your board into combat: Sieglings strike in speed order, abilities resolve, and HP ticks down on both sides—this is the same two-board view you fight on.',
        visual: `
            <div class="tutorial-visual tutorial-battle">
                <div class="tutorial-battle-snapshot">
                    <div class="tutorial-snap-half enemy">
                        <div class="tutorial-snap-label">ENEMY</div>
                        <div class="tutorial-snap-grid-wrap">
                            <div class="tutorial-snap-grid">
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell has-card">A</div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell has-card">B</div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell"></div>
                            </div>
                            <svg class="tutorial-snap-link-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                <line class="tutorial-snap-link-line" x1="50" y1="28" x2="50" y2="72" />
                            </svg>
                        </div>
                        <div class="tutorial-snap-hp"><span>45</span> HP</div>
                    </div>
                    <div class="tutorial-snap-divider"></div>
                    <div class="tutorial-snap-half player">
                        <div class="tutorial-snap-label">YOU</div>
                        <div class="tutorial-snap-grid-wrap">
                            <div class="tutorial-snap-grid">
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell has-card">C</div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell has-card">D</div>
                                <div class="tutorial-snap-cell has-card">E</div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell"></div>
                                <div class="tutorial-snap-cell"></div>
                            </div>
                            <svg class="tutorial-snap-link-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                <line class="tutorial-snap-link-line" x1="50" y1="28" x2="50" y2="72" />
                                <line class="tutorial-snap-link-line" x1="17" y1="50" x2="50" y2="50" />
                            </svg>
                        </div>
                        <div class="tutorial-snap-hp"><span>50</span> HP</div>
                    </div>
                    <div class="tutorial-snap-phase">Battle</div>
                </div>
                <div class="tutorial-caption">Twin 3×3 halves, divider seam, and HP readout—snapshot of the live battlefield.</div>
            </div>
        `
    }
];

function normalizeApiBaseUrl(baseUrl) {
    return (baseUrl || '').replace(/\/+$/, '');
}

function normalizeCardArtKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function escapeHtmlAttribute(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function buildCardArtMeta(entry) {
    if (!entry) {
        return null;
    }
    if (typeof entry === 'string') {
        return { url: entry, crop: 'default' };
    }
    return {
        url: entry.url || '',
        crop: entry.crop || 'default'
    };
}

function getCardArtMeta(card) {
    if (!card) {
        return null;
    }

    const candidates = [
        card.artKey,
        card.id,
        card.definitionId,
        card.cardId,
        card.baseId,
        card.catalogId,
        card.slug,
        card.name
    ];

    for (const candidate of candidates) {
        const key = normalizeCardArtKey(candidate);
        if (key && CARD_ART_BY_KEY[key]) {
            return buildCardArtMeta(CARD_ART_BY_KEY[key]);
        }
    }
    return null;
}

function renderCardArt(card, variant, fallbackLabel = '') {
    const artMeta = getCardArtMeta(card);
    if (artMeta?.url) {
        const cropClass = artMeta.crop && artMeta.crop !== 'default'
            ? ` card-art-crop-${artMeta.crop}`
            : '';
        return `<div class="card-art card-art-${variant}${cropClass}"><img src="${artMeta.url}" alt="${escapeHtmlAttribute(card?.name || 'Card')} art" loading="lazy"></div>`;
    }
    if (!fallbackLabel) {
        return '';
    }
    return `<div class="card-art card-art-${variant} card-art-fallback"><span>${fallbackLabel}</span></div>`;
}

function getCardAbilities(card) {
    if (!card) {
        return [];
    }
    if (Array.isArray(card.abilities) && card.abilities.length > 0) {
        return card.abilities.filter(Boolean);
    }
    if (card.ability) {
        return [card.ability];
    }
    return [];
}

function getBoardCellAt(isPlayer, row, col) {
    const board = isPlayer ? gameState?.playerBoard : gameState?.enemyBoard;
    return board?.[row]?.[col] || null;
}

function boardCellToPreviewCard(cell) {
    if (!cell) {
        return null;
    }
    return {
        ...cell,
        id: cell.cardId || cell.id,
        type: 'SIEGLING',
        health: cell.hp,
        speed: cell.spd
    };
}

function isBoardPreviewCard(card) {
    return Boolean(card?.instanceId);
}

function boardCardOwnershipLabel(card) {
    if (!gameState || !card?.instanceId) {
        return 'Board';
    }
    const onPlayer = gameState.playerBoard?.some((row) => row.some((c) => c?.instanceId === card.instanceId));
    if (onPlayer) {
        return 'Your';
    }
    const onEnemy = gameState.enemyBoard?.some((row) => row.some((c) => c?.instanceId === card.instanceId));
    if (onEnemy) {
        return 'Opponent';
    }
    return 'Board';
}

function resolveArenaSelectionCell() {
    if (!arenaSelection || !gameState) {
        return null;
    }
    const cell = getBoardCellAt(arenaSelection.isPlayer, arenaSelection.row, arenaSelection.col);
    if (!cell || cell.instanceId !== arenaSelection.instanceId) {
        return null;
    }
    return cell;
}

function pruneInvalidArenaSelection() {
    if (!arenaSelection) {
        return;
    }
    if (!resolveArenaSelectionCell()) {
        arenaSelection = null;
    }
}

function clearArenaSelection() {
    arenaSelection = null;
}

/**
 * Focus a Siegling on either board for the live preview / Card Preview drawer.
 * Second click on the same piece clears selection.
 */
function onArenaCardClick(isPlayer, row, col, event) {
    if (event?.stopPropagation) {
        event.stopPropagation();
    }
    const cell = getBoardCellAt(isPlayer, row, col);
    if (!cell) {
        return;
    }
    if (
        arenaSelection
        && arenaSelection.isPlayer === isPlayer
        && arenaSelection.row === row
        && arenaSelection.col === col
        && arenaSelection.instanceId === cell.instanceId
    ) {
        clearArenaSelection();
        syncFocusedCardUi();
        render();
        return;
    }
    arenaSelection = { isPlayer, row, col, instanceId: cell.instanceId };
    selectedHandIndex = null;
    selectedCard = null;
    clearTargetMode();
    hoveredHandIndex = null;
    updateSelectedInfo(boardCellToPreviewCard(cell));
    syncFocusedCardUi();
    render();
}

/** Mobile: inspect board cell; Claim control uses stopPropagation + openClaimPopup. */
function handleBoardCellInspectTouch(event, isPlayer, row, col) {
    if (!isMobileLayout()) {
        return;
    }
    if (event.target.closest('.claim-prompt')) {
        event.preventDefault();
        openClaimPopup(row, col);
        return;
    }
    const cell = getBoardCellAt(isPlayer, row, col);
    if (!cell) {
        return;
    }
    event.preventDefault();
    onArenaCardClick(isPlayer, row, col);
}

let _boardLongPressTimer = null;
let _boardLongPressTriggered = false;

function handleBoardCardLongPressStart(event, row, col) {
    if (!isMobileLayout()) return;
    window.clearTimeout(_boardLongPressTimer);
    _boardLongPressTriggered = false;
    _boardLongPressTimer = window.setTimeout(() => {
        _boardLongPressTriggered = true;
        _boardLongPressTimer = null;
        if (gameState?.currentPhase === 'BATTLE'
            && gameState?.pendingBattle
            && gameState?.battleWaitingOn === 'PLAYER') {
            openBattlePanel(true);
        }
    }, 500);
}

function handleBoardCardLongPressEnd(event, row, col) {
    window.clearTimeout(_boardLongPressTimer);
    _boardLongPressTimer = null;
    if (_boardLongPressTriggered) {
        _boardLongPressTriggered = false;
        event.preventDefault();
        return;
    }
    handleBoardCellInspectTouch(event, true, row, col);
}

function cancelBoardCardLongPress() {
    window.clearTimeout(_boardLongPressTimer);
    _boardLongPressTimer = null;
    _boardLongPressTriggered = false;
}

function openSelectedCardDrawer() {
    const card = getFocusedPreviewCard();
    updateSelectedInfo(card, card ? null : 'Hover, select a hand card, or click a Siegling on the board.');
    openDrawer('selected');
}

/** Compact move rows from server (`moves` on Sieglings) or fall back to ability objects. */
function getSieglingMovesForDisplay(card) {
    if (!card || card.type !== "SIEGLING") {
        return [];
    }
    if (Array.isArray(card.moves) && card.moves.length > 0) {
        return card.moves.filter(Boolean);
    }
    return getCardAbilities(card).map((a) => ({
        name: a.name,
        energyCost: Number(a.requiredEnergy ?? a.costAmount ?? 0),
        description: a.description || formatAbilitySummaryText(a),
        isPassive: !!a.passive
    }));
}

function formatSieglingMoveLine(move) {
    if (!move) {
        return "";
    }
    const name = String(move.name || "").trim();
    const desc = String(move.description || "").trim();
    const passive = Boolean(move.isPassive);
    const cost = passive ? "Passive" : (Number(move.energyCost) || 0) <= 0 ? "Free" : `${move.energyCost} energy`;
    const head = name ? `${name} (${cost})` : cost;
    if (desc && name && !desc.toLowerCase().startsWith(name.toLowerCase())) {
        return `${head}: ${desc}`;
    }
    return desc || head;
}

function getElementColorForCard(element) {
    return getElementCssVar(element);
}

/** Buff / aura lines that describe a stat increase — emphasize the full clause, not only digits. */
function isStatIncreaseAbilityDescription(text) {
    return /\bincrease\b/i.test(String(text || ''));
}

function escapeHtmlWithFlavorNumericHighlights(text, element) {
    const raw = String(text || '');
    if (!raw) {
        return '';
    }
    const accentColor = element ? getElementColorForCard(element) : '';
    const numStyle = accentColor ? ` style="color:${accentColor}"` : '';
    return raw.split(/(\d+)/).map((part) => {
        if (part === '') {
            return '';
        }
        if (/^\d+$/.test(part)) {
            return `<span class="card-ability-flavor-em"${numStyle}>${escapeHtml(part)}</span>`;
        }
        return escapeHtml(part);
    }).join('');
}

function renderAbilityFlavorBodyInnerHtml(body, element) {
    const trimmed = String(body || '').trim();
    if (!trimmed) {
        return '';
    }
    const accentColor = element ? getElementColorForCard(element) : '';
    const emStyle = accentColor ? ` style="color:${accentColor}"` : '';
    if (isStatIncreaseAbilityDescription(trimmed)) {
        return `<span class="card-ability-flavor-em"${emStyle}>${escapeHtml(trimmed)}</span>`;
    }
    return escapeHtmlWithFlavorNumericHighlights(trimmed, element);
}

function renderCardStatAsterisk(element) {
    const color = getElementColorForCard(element);
    return `<span class="card-stat-asterisk" style="color:${color}" title="Buffed">*</span>`;
}

/** Ability / flavor lines tinted by element; passives use a subtler style. */
function renderAbilityFlavorHtml(element, ability) {
    if (!ability) {
        return '';
    }
    const color = getElementColorForCard(element);
    const isPassive = Boolean(ability.passive);
    const name = String(ability.name || '').trim();
    const desc = String(ability.description || '').trim();
    const body = desc || formatAbilitySummaryText(ability);
    if (!body && !name) {
        return '';
    }
    const label = name
        ? `<span class="card-ability-flavor-name">${escapeHtml(name)}</span> `
        : '';
    const passiveCls = isPassive ? ' card-ability-flavor-passive' : '';
    const descInner = renderAbilityFlavorBodyInnerHtml(body, element);
    return `<div class="card-ability-flavor${passiveCls}" style="color:${color}">${label}<span class="card-ability-flavor-desc">${descInner}</span></div>`;
}

function renderCardAbilitiesFlavorSection(card) {
    if (!card) {
        return '';
    }
    return getCardAbilities(card)
        .filter((ab) => !ab.passive)
        .map((ab) => renderAbilityFlavorHtml(card.element, ab))
        .join('');
}

function renderBoardCellCombatStatsInner(cell) {
    const el = cell.element;
    const printedHp = Number(cell.printedHealth);
    const printedSpd = Number(cell.printedSpeed);
    const maxHp = cell.maxHp;
    const hp = cell.hp;
    const spd = cell.spd;
    // Shield is tracked separately (shieldHp); the asterisk flags a
    // permanent max-health boost (maxHp above the printed value).
    const hpBuffed = Number.isFinite(printedHp) && maxHp > printedHp;
    const spdBuffed = Number.isFinite(printedSpd) && spd !== printedSpd;

    let hpInner = `${hp}/<span class="stat-hp-max">${maxHp}</span>`;
    if (hpBuffed) {
        hpInner += renderCardStatAsterisk(el);
    }

    let spdInner = `${spd}`;
    if (spdBuffed) {
        spdInner += renderCardStatAsterisk(el);
    }

    return { hpInner, spdInner, dmgBlock: '' };
}

function getAbilityRequiredEnergy(ability) {
    const value = Number(ability?.requiredEnergy ?? ability?.costAmount ?? 0);
    return Number.isFinite(value) ? value : 0;
}

function formatBattleAbilityCost(ability) {
    const energy = getAbilityRequiredEnergy(ability);
    const element = ability?.requiredElement || ability?.costElement || '';
    if (energy <= 0) {
        return 'Free';
    }
    if (element) {
        return `${energy} ${formatElementLabel(element)}`;
    }
    return `${energy} energy`;
}

function formatAbilityTargetLabel(ability) {
    switch (ability?.targetType) {
        case 'SINGLE_ENEMY':
            return 'Target enemy';
        case 'ALL_ENEMIES':
            return 'All enemies';
        case 'ROW_ENEMIES':
            return ability?.targetRow ? `${formatElementLabel(ability.targetRow)} enemy row` : 'Enemy row';
        case 'SINGLE_ALLY':
            return 'Target ally';
        case 'ALL_ALLIES':
            return 'All allies';
        case 'ROW_ALLIES':
            return ability?.targetRow ? `${formatElementLabel(ability.targetRow)} ally row` : 'Ally row';
        case 'ROW_SELECT_ENEMIES':
            return 'Select enemy row';
        case 'ROW_SELECT_ALLIES':
            return 'Select ally row';
        case 'ENEMY_PLAYER':
            return 'Enemy player';
        case 'SELF':
            return 'Self';
        case 'PASSIVE':
            return 'Passive';
        default:
            return '';
    }
}

function formatAbilityEffectLabel(ability) {
    const effectType = String(ability?.effectType || '').trim();
    if (!effectType) {
        return '';
    }
    const label = effectType
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    const value = Number(ability?.effectValue);
    return Number.isFinite(value) && value > 0 ? `${label} ${value}` : label;
}

function rowNameToIndex(rowName) {
    const normalized = String(rowName || '').trim().toUpperCase();
    if (!normalized) {
        return -1;
    }
    return ROW_NAMES.findIndex((name) => name.toUpperCase() === normalized);
}

function isElementWeakTo(attackerElement, defenderElement) {
    const attacker = String(attackerElement || '').trim().toUpperCase();
    const defender = String(defenderElement || '').trim().toUpperCase();
    switch (attacker) {
        case 'WATER':
            return defender === 'FIRE' || defender === 'EARTH';
        case 'EARTH':
            return defender === 'WIND' || defender === 'ELECTRIC';
        case 'WIND':
            return defender === 'FIRE';
        case 'ELECTRIC':
            return defender === 'WATER';
        default:
            return false;
    }
}

function getBattleAbilityBaseDamage(ability) {
    const value = Number(ability?.effectValue);
    if (Number.isFinite(value) && value > 0) {
        return value;
    }
    const match = String(ability?.description || '').match(/\bDeal\s+(\d+)/i);
    if (!match) {
        return 0;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isBattleDamageAbility(ability) {
    const effectType = String(ability?.effectType || '').trim().toLowerCase();
    return effectType === 'damage' || getBattleAbilityBaseDamage(ability) > 0;
}

function getBattleAbilityEnemyTargets(ability, selectedRow = -1) {
    const targetType = String(ability?.targetType || '').trim().toUpperCase();
    const board = gameState?.enemyBoard || [];
    const targets = [];
    const pushRow = (rowIndex) => {
        if (rowIndex < 0 || rowIndex > 2) {
            return;
        }
        (board[rowIndex] || []).forEach((cell) => {
            if (cell) {
                targets.push(cell);
            }
        });
    };
    switch (targetType) {
        case 'SINGLE_ENEMY':
        case 'ALL_ENEMIES':
            board.forEach((row) => (row || []).forEach((cell) => {
                if (cell) {
                    targets.push(cell);
                }
            }));
            break;
        case 'ROW_ENEMIES':
            pushRow(rowNameToIndex(ability?.targetRow));
            break;
        case 'ROW_SELECT_ENEMIES':
            if (selectedRow >= 0) {
                pushRow(selectedRow);
            } else {
                board.forEach((row) => (row || []).forEach((cell) => {
                    if (cell) {
                        targets.push(cell);
                    }
                }));
            }
            break;
    }
    return targets;
}

function formatWeakTargetNames(targets) {
    const names = [...new Set((targets || []).map((cell) => cell?.name).filter(Boolean))];
    if (names.length === 0) {
        return 'weak targets';
    }
    if (names.length <= 2) {
        return names.join(', ');
    }
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

function formatBattleAbilityWeaknessPreview(ability, selectedRow = -1) {
    const baseDamage = getBattleAbilityBaseDamage(ability);
    if (!isBattleDamageAbility(ability) || baseDamage <= 0) {
        return '';
    }
    const attackerElement = gameState?.pendingBattle?.element;
    const weakTargets = getBattleAbilityEnemyTargets(ability, selectedRow)
        .filter((cell) => isElementWeakTo(attackerElement, cell?.element));
    if (weakTargets.length === 0) {
        return '';
    }
    return `Weakness +1: ${formatWeakTargetNames(weakTargets)} take ${baseDamage + 1}.`;
}

function effectKindFor(ability) {
    const effectType = String(ability?.effectType || '').trim().toLowerCase();
    return EFFECT_KIND_MAP[effectType] || 'default';
}

function targetArrowClamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function targetArrowQuadPoint(source, control, target, u) {
    const inv = 1 - u;
    return {
        x: (inv * inv * source.x) + (2 * inv * u * control.x) + (u * u * target.x),
        y: (inv * inv * source.y) + (2 * inv * u * control.y) + (u * u * target.y)
    };
}

function targetArrowControlPoint(source, target, sceneCenterY) {
    const mx = (source.x + target.x) / 2;
    const my = (source.y + target.y) / 2;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len;
    let py = dx / len;
    const dirSign = my > sceneCenterY ? -1 : 1;
    if (Math.abs(dy) < 8) {
        px = 0;
        py = -1;
    }
    const k = targetArrowClamp(len * 0.2, 24, 140);
    return {
        x: mx + (px * k * dirSign),
        y: my + (py * k * dirSign)
    };
}

function targetArrowPath(source, control, target) {
    return `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}`;
}

function targetArrowHexToRgb(hex) {
    const normalized = String(hex || '').replace('#', '');
    const value = Number.parseInt(normalized.length === 3
        ? normalized.split('').map((ch) => ch + ch).join('')
        : normalized, 16);
    if (!Number.isFinite(value)) {
        return { r: 255, g: 255, b: 255 };
    }
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255
    };
}

function targetArrowMixColor(a, b, amount) {
    const left = targetArrowHexToRgb(a);
    const right = targetArrowHexToRgb(b);
    const mix = (start, end) => Math.round(start + ((end - start) * amount));
    return `rgb(${mix(left.r, right.r)}, ${mix(left.g, right.g)}, ${mix(left.b, right.b)})`;
}

function ensureDomTargetingPreviewLayer() {
    const boardArea = document.getElementById('boardArea');
    if (!boardArea) {
        return null;
    }
    let svg = boardArea.querySelector(':scope > .target-arrow-dom-layer');
    if (!svg) {
        svg = document.createElementNS(TARGET_ARROW_SVG_NS, 'svg');
        svg.classList.add('target-arrow-dom-layer');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        boardArea.appendChild(svg);
    }
    return svg;
}

function getDomCellCenter(isPlayer, row, col) {
    const boardArea = document.getElementById('boardArea');
    const grid = document.getElementById(isPlayer ? 'playerGrid' : 'enemyGrid');
    const cell = grid?.querySelector(`.board-cell[data-row="${row}"][data-col="${col}"]`);
    if (!boardArea || !cell) {
        return null;
    }
    const areaRect = boardArea.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    if (cellRect.width <= 0 || cellRect.height <= 0) {
        return null;
    }
    return {
        x: (cellRect.left - areaRect.left) + (cellRect.width / 2),
        y: (cellRect.top - areaRect.top) + (cellRect.height / 2)
    };
}

function drawDomTargetingPreview(timestamp) {
    const state = targetArrowPreviewState;
    if (!state.active || !state.source || state.targets.length === 0) {
        return;
    }
    const svg = ensureDomTargetingPreviewLayer();
    const boardArea = document.getElementById('boardArea');
    if (!svg || !boardArea) {
        clearDomTargetingPreview();
        return;
    }
    const width = Math.max(1, boardArea.clientWidth || Math.round(boardArea.getBoundingClientRect().width));
    const height = Math.max(1, boardArea.clientHeight || Math.round(boardArea.getBoundingClientRect().height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const elapsed = Math.max(0, timestamp - state.startedAt);
    const palette = TARGET_ARROW_PALETTES[state.kind] || TARGET_ARROW_PALETTES.default;
    const sceneCenterY = height / 2;
    const defs = [];
    const shapes = [];
    state.dashPhase = state.reducedMotion ? 0 : (elapsed * 0.0006) % 1;

    state.targets.forEach((target, index) => {
        const alpha = state.reducedMotion ? 1 : targetArrowClamp((elapsed - target.appearedAt) / TARGET_ARROW_FADE_MS, 0, 1);
        if (alpha <= 0) {
            return;
        }
        const control = targetArrowControlPoint(state.source, target, sceneCenterY);
        const path = targetArrowPath(state.source, control, target);
        const gradId = `targetArrowGrad${index}`;
        defs.push(`<linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" x1="${state.source.x.toFixed(1)}" y1="${state.source.y.toFixed(1)}" x2="${target.x.toFixed(1)}" y2="${target.y.toFixed(1)}"><stop offset="0%" stop-color="${palette.source}"/><stop offset="100%" stop-color="${palette.target}"/></linearGradient>`);

        shapes.push(`<path d="${path}" fill="none" stroke="${palette.glow}" stroke-width="10" stroke-linecap="round" opacity="${(0.18 * alpha).toFixed(3)}"/>`);
        shapes.push(`<path d="${path}" fill="none" stroke="url(#${gradId})" stroke-width="2.5" stroke-linecap="round" opacity="${(0.94 * alpha).toFixed(3)}"/>`);

        if (!state.reducedMotion) {
            const dashOffset = -((state.dashPhase + (index * 0.04)) % 1);
            const dashColor = targetArrowMixColor('#ffffff', palette.target, 0.28);
            shapes.push(`<path d="${path}" fill="none" pathLength="1" stroke="${dashColor}" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.06 0.106" stroke-dashoffset="${dashOffset.toFixed(3)}" opacity="${(0.72 * alpha).toFixed(3)}"/>`);
        }

        const tail = targetArrowQuadPoint(state.source, control, target, 0.965);
        const angle = Math.atan2(target.y - tail.y, target.x - tail.x);
        const size = 14;
        const spread = 0.52;
        const left = {
            x: target.x - (Math.cos(angle - spread) * size),
            y: target.y - (Math.sin(angle - spread) * size)
        };
        const right = {
            x: target.x - (Math.cos(angle + spread) * size),
            y: target.y - (Math.sin(angle + spread) * size)
        };
        shapes.push(`<polygon points="${target.x.toFixed(1)},${target.y.toFixed(1)} ${left.x.toFixed(1)},${left.y.toFixed(1)} ${right.x.toFixed(1)},${right.y.toFixed(1)}" fill="${palette.target}" opacity="${(0.92 * alpha).toFixed(3)}"/>`);

        const pulse = state.reducedMotion ? 0 : Math.sin(elapsed * 0.01);
        const ringRadius = state.reducedMotion ? 10 : 8 + (4 * ((pulse + 1) / 2));
        const ringAlpha = state.reducedMotion ? 0.36 : 0.18 + (0.22 * ((pulse + 1) / 2));
        shapes.push(`<circle cx="${target.x.toFixed(1)}" cy="${target.y.toFixed(1)}" r="${ringRadius.toFixed(1)}" fill="none" stroke="${palette.target}" stroke-width="2" opacity="${(ringAlpha * alpha).toFixed(3)}"/>`);
    });

    shapes.push(`<circle cx="${state.source.x.toFixed(1)}" cy="${state.source.y.toFixed(1)}" r="12" fill="${palette.source}" opacity="0.16"/>`);
    shapes.push(`<circle cx="${state.source.x.toFixed(1)}" cy="${state.source.y.toFixed(1)}" r="5" fill="${palette.source}" opacity="0.5"/>`);
    svg.innerHTML = `<defs>${defs.join('')}</defs>${shapes.join('')}`;
    svg.classList.add('is-active');

    if (state.active && !state.reducedMotion) {
        state.raf = window.requestAnimationFrame(drawDomTargetingPreview);
    }
}

function showDomTargetingPreview(source, targets, kind) {
    if (!source || !Array.isArray(targets) || targets.length === 0) {
        clearDomTargetingPreview();
        return;
    }
    if (targetArrowPreviewState.raf) {
        window.cancelAnimationFrame(targetArrowPreviewState.raf);
    }
    targetArrowPreviewState.active = true;
    targetArrowPreviewState.source = { x: Number(source.x) || 0, y: Number(source.y) || 0 };
    targetArrowPreviewState.targets = targets
        .filter(Boolean)
        .slice(0, 9)
        .map((target, index) => ({
            x: Number(target.x) || 0,
            y: Number(target.y) || 0,
            appearedAt: index * TARGET_ARROW_STAGGER_MS
        }));
    targetArrowPreviewState.kind = TARGET_ARROW_PALETTES[kind] ? kind : 'default';
    targetArrowPreviewState.startedAt = performance.now();
    targetArrowPreviewState.raf = 0;
    drawDomTargetingPreview(targetArrowPreviewState.startedAt);
}

function clearDomTargetingPreview() {
    if (targetArrowPreviewState.raf) {
        window.cancelAnimationFrame(targetArrowPreviewState.raf);
    }
    targetArrowPreviewState.active = false;
    targetArrowPreviewState.source = null;
    targetArrowPreviewState.targets = [];
    targetArrowPreviewState.raf = 0;
    const svg = document.querySelector('.target-arrow-dom-layer');
    if (svg) {
        svg.classList.remove('is-active');
        svg.innerHTML = '';
    }
}

const targetPreviewController = {
    show(source, targets, kind) {
        showDomTargetingPreview(source, targets, kind);
    },
    clear() {
        clearDomTargetingPreview();
    },
    cellCenter(isPlayer, row, col) {
        return getDomCellCenter(isPlayer, row, col);
    }
};

function clearTargetingPreview() {
    targetPreviewController.clear();
    clearMatchupBadges();
}

function sourceCellCenter() {
    const pending = gameState?.pendingBattle;
    if (!pending || pending.row == null || pending.col == null) {
        return null;
    }
    return targetPreviewController.cellCenter(true, pending.row, pending.col);
}

function collectPreviewCells(board, isPlayer) {
    const out = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            if (board?.[row]?.[col]) {
                out.push({ isPlayer, row, col });
            }
        }
    }
    return out;
}

function collectPreviewRowCells(board, isPlayer, row) {
    const out = [];
    if (row < 0 || row > 2) {
        return out;
    }
    for (let col = 0; col < 3; col++) {
        if (board?.[row]?.[col]) {
            out.push({ isPlayer, row, col });
        }
    }
    return out;
}

function firstPreviewCellByRows(board, isPlayer, rows) {
    for (const row of rows) {
        for (let col = 0; col < 3; col++) {
            if (board?.[row]?.[col]) {
                return [{ isPlayer, row, col }];
            }
        }
    }
    return [];
}

function previewTargetsFor(ability, selectedRow = -1) {
    if (!ability || !gameState?.pendingBattle) {
        return [];
    }
    const enemyBoard = gameState.enemyBoard || [];
    const allyBoard = gameState.playerBoard || [];
    const targetType = String(ability.targetType || '').trim().toUpperCase();
    switch (targetType) {
        case 'SINGLE_ENEMY': {
            const preferredRow = rowNameToIndex(ability.targetRow);
            if (preferredRow >= 0) {
                const preferred = firstPreviewCellByRows(enemyBoard, false, [preferredRow]);
                if (preferred.length > 0) {
                    return preferred;
                }
            }
            return firstPreviewCellByRows(enemyBoard, false, [2, 1, 0]);
        }
        case 'SINGLE_ALLY':
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    if (allyBoard?.[row]?.[col] && !(gameState.pendingBattle.row === row && gameState.pendingBattle.col === col)) {
                        return [{ isPlayer: true, row, col }];
                    }
                }
            }
            return [];
        case 'ALL_ENEMIES':
            return collectPreviewCells(enemyBoard, false);
        case 'ALL_ALLIES':
            return collectPreviewCells(allyBoard, true);
        case 'ROW_ENEMIES':
            return collectPreviewRowCells(enemyBoard, false, rowNameToIndex(ability.targetRow));
        case 'ROW_ALLIES':
            return collectPreviewRowCells(allyBoard, true, rowNameToIndex(ability.targetRow));
        case 'ROW_SELECT_ENEMIES':
            return selectedRow >= 0
                ? collectPreviewRowCells(enemyBoard, false, selectedRow)
                : collectPreviewCells(enemyBoard, false);
        case 'ROW_SELECT_ALLIES':
            return selectedRow >= 0
                ? collectPreviewRowCells(allyBoard, true, selectedRow)
                : collectPreviewCells(allyBoard, true);
        case 'SELF':
            return [{ isPlayer: true, row: gameState.pendingBattle.row, col: gameState.pendingBattle.col }];
        default:
            return [];
    }
}

function showBattleAbilityPreview(ability, selectedRow = -1) {
    showBattleTargetCellsPreview(ability, previewTargetsFor(ability, selectedRow));
}

function showBattleTargetCellsPreview(ability, cells) {
    const src = sourceCellCenter();
    const targets = (cells || [])
        .map((target) => targetPreviewController.cellCenter(target.isPlayer, target.row, target.col))
        .filter(Boolean);
    if (!src || targets.length === 0) {
        clearTargetingPreview();
        return;
    }
    targetPreviewController.show(src, targets, effectKindFor(ability));
    applyMatchupBadgesForCells(ability, cells || []);
}

function getMatchupKindForTarget(attackerElement, defenderElement) {
    if (!attackerElement || !defenderElement) return null;
    if (isElementWeakTo(attackerElement, defenderElement)) return 'WEAK';
    if (isElementWeakTo(defenderElement, attackerElement)) return 'STRONG';
    return null;
}

function findBoardCellEl(isPlayer, row, col) {
    const grid = document.getElementById(isPlayer ? 'playerGrid' : 'enemyGrid');
    return grid?.querySelector(`.board-cell[data-row="${row}"][data-col="${col}"]`) || null;
}

function clearMatchupBadges() {
    document.querySelectorAll('.matchup-badge-overlay').forEach((el) => el.remove());
}

function applyMatchupBadgesForCells(ability, cells) {
    clearMatchupBadges();
    if (!ability || !isBattleDamageAbility(ability)) return;
    const attackerElement = gameState?.pendingBattle?.element;
    if (!attackerElement) return;

    (cells || []).forEach((target) => {
        if (!target || target.isPlayer) return; // only enemy targets get matchup badges
        const board = gameState?.enemyBoard;
        const defender = board?.[target.row]?.[target.col];
        if (!defender) return;
        const kind = getMatchupKindForTarget(attackerElement, defender.element);
        if (!kind) return;
        const cellEl = findBoardCellEl(target.isPlayer, target.row, target.col);
        if (!cellEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'matchup-badge-overlay';
        overlay.dataset.kind = kind;
        overlay.innerHTML = renderStatusBadge(kind, 0);
        cellEl.appendChild(overlay);
    });
}

function getBattleTargetingPreviewCells(ability) {
    if (!ability || !targetMode || !targetContext || targetContext.mode !== 'battle') {
        return [];
    }
    if (isRowSelectTargetSide(targetContext.side)) {
        return previewTargetsFor(ability, getRowSelectSelectedRow());
    }
    if (targetContext.side === 'enemy') {
        return collectPreviewCells(gameState?.enemyBoard || [], false);
    }
    if (targetContext.side === 'ally') {
        return collectPreviewCells(gameState?.playerBoard || [], true);
    }
    return previewTargetsFor(ability);
}

function scheduleBattleTargetingPreview(ability) {
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            if (!targetMode || !targetContext || targetContext.mode !== 'battle') {
                return;
            }
            const activeAbility = gameState?.pendingBattle?.abilities?.find((a) => a.index === targetContext.abilityIndex);
            if (!activeAbility || activeAbility.index !== ability.index) {
                return;
            }
            showBattleTargetCellsPreview(activeAbility, getBattleTargetingPreviewCells(activeAbility));
        });
    });
}

function bindBattleAbilityHovers(rootEl) {
    if (!rootEl) {
        return;
    }
    rootEl.querySelectorAll('.battle-ability-btn[data-ability-index]').forEach((btn) => {
        const idx = Number(btn.dataset.abilityIndex);
        const ability = gameState?.pendingBattle?.abilities?.find((a) => a.index === idx);
        if (!ability) {
            return;
        }
        let hoverTimer = null;
        let pressTimer = null;
        let longPressTriggered = false;
        let pointerDownInside = false;

        const canPreview = () => ability.affordable !== false && !btn.disabled;
        const showPreview = () => {
            if (canPreview()) {
                showBattleAbilityPreview(ability);
            }
        };
        const hidePreview = () => {
            window.clearTimeout(hoverTimer);
            window.clearTimeout(pressTimer);
            btn.classList.remove('long-pressing');
            pointerDownInside = false;
            clearTargetingPreview();
        };

        btn.addEventListener('mouseenter', () => {
            if (!canPreview()) {
                return;
            }
            window.clearTimeout(hoverTimer);
            hoverTimer = window.setTimeout(showPreview, 80);
        });
        btn.addEventListener('mouseleave', hidePreview);
        btn.addEventListener('click', () => {
            if (longPressTriggered) {
                longPressTriggered = false;
                return;
            }
            if (!canPreview()) {
                return;
            }
            clearTargetingPreview();
            chooseBattleAbility(idx);
        });
        btn.addEventListener('pointerdown', (event) => {
            if (event.pointerType !== 'touch' || !canPreview()) {
                return;
            }
            pointerDownInside = true;
            longPressTriggered = false;
            btn.classList.add('long-pressing');
            window.clearTimeout(pressTimer);
            pressTimer = window.setTimeout(() => {
                if (pointerDownInside && canPreview()) {
                    longPressTriggered = true;
                    showPreview();
                }
            }, 220);
        });
        btn.addEventListener('pointerup', (event) => {
            if (event.pointerType !== 'touch') {
                return;
            }
            window.clearTimeout(pressTimer);
            btn.classList.remove('long-pressing');
            const releaseTarget = document.elementFromPoint(event.clientX, event.clientY);
            const releasedInside = Boolean(releaseTarget && btn.contains(releaseTarget));
            if (longPressTriggered && pointerDownInside && releasedInside && canPreview()) {
                clearTargetingPreview();
                chooseBattleAbility(idx);
            } else {
                clearTargetingPreview();
            }
            pointerDownInside = false;
        });
        btn.addEventListener('pointerleave', hidePreview);
        btn.addEventListener('pointercancel', hidePreview);
    });
}

function isRowSelectTargetSide(side) {
    return side === 'row-enemy' || side === 'row-ally';
}

function isRowSelectBattleTargetContext(context = targetContext) {
    return Boolean(context && context.mode === 'battle' && isRowSelectTargetSide(context.side));
}

function getRowSelectSelectedRow(context = targetContext) {
    const row = Number(context?.selectedRow);
    return Number.isInteger(row) && row >= 0 && row <= 2 ? row : -1;
}

function getActiveBattleTargetAbility(context = targetContext) {
    return gameState?.pendingBattle?.abilities?.find((a) => a.index === context?.abilityIndex) || null;
}

function getRowSelectBoard(context = targetContext) {
    if (!isRowSelectBattleTargetContext(context)) {
        return null;
    }
    return context.side === 'row-ally' ? gameState?.playerBoard : gameState?.enemyBoard;
}

function getRowSelectTargets(row, context = targetContext) {
    const board = getRowSelectBoard(context);
    if (!board || row < 0 || row > 2) {
        return [];
    }
    return (board[row] || []).filter(Boolean);
}

function formatRowSelectConfirmText(context = targetContext) {
    const row = getRowSelectSelectedRow(context);
    const rowName = ROW_NAMES[row] || `Row ${row + 1}`;
    const targetNames = getRowSelectTargets(row, context)
        .map((cell, index) => cell?.name || `Target ${index + 1}`);
    const targetText = targetNames.length > 0 ? targetNames.join(', ') : 'No targets';
    return `Confirm: ${rowName} Row - ${targetText}`;
}

function handleTargetCellPointerLeave() {
    if (isRowSelectBattleTargetContext() && getRowSelectSelectedRow() >= 0) {
        const ability = getActiveBattleTargetAbility();
        if (ability) {
            showBattleAbilityPreview(ability, getRowSelectSelectedRow());
        }
        return;
    }
    clearTargetingPreview();
}

function previewCellHover(isPlayer, row, col) {
    if (!targetMode || !targetContext || targetContext.mode !== 'battle') {
        return;
    }
    const ability = gameState?.pendingBattle?.abilities?.find((a) => a.index === targetContext.abilityIndex);
    if (!ability) {
        return;
    }
    let cells = [];
    if (isRowSelectTargetSide(targetContext.side)) {
        const targetIsPlayer = targetContext.side === 'row-ally';
        if (isPlayer !== targetIsPlayer) {
            return;
        }
        const board = targetIsPlayer ? gameState.playerBoard : gameState.enemyBoard;
        const selectedRow = getRowSelectSelectedRow();
        cells = collectPreviewRowCells(board, targetIsPlayer, selectedRow >= 0 ? selectedRow : row);
    } else if (targetContext.side === 'enemy' || targetContext.side === 'ally') {
        cells = [{ isPlayer: targetContext.side === 'ally', row, col }];
    }
    showBattleTargetCellsPreview(ability, cells);
}

function buildBattleTargetMessage(targetSide, ability, selectedRow = -1) {
    const weakness = formatBattleAbilityWeaknessPreview(ability, selectedRow);
    const suffix = weakness ? ` ${weakness}` : '';
    if (targetSide === 'row-enemy') {
        if (selectedRow >= 0) {
            return `${ROW_NAMES[selectedRow] || 'Selected'} enemy row selected. Confirm the row or change it.${suffix}`;
        }
        return `Select a card in an enemy row.${suffix}`;
    }
    if (targetSide === 'row-ally') {
        if (selectedRow >= 0) {
            return `${ROW_NAMES[selectedRow] || 'Selected'} friendly row selected. Confirm the row or change it.`;
        }
        return 'Select a card in a friendly row.';
    }
    return `Queue a ${targetSide} target for ${ability.name}.${suffix}`;
}

function renderBattleAbilityCostEmblems(ability) {
    const energy = getAbilityRequiredEnergy(ability);
    const rawElement = ability?.requiredElement || ability?.costElement || '';
    const element = String(rawElement).toLowerCase();
    if (energy <= 0) {
        return '<span class="battle-cost-free">Free</span>';
    }
    if (!element) {
        return `<span class="battle-cost-energy">${energy} energy</span>`;
    }
    const tokensToDraw = Math.min(energy, 5);
    let html = '<span class="battle-cost-emblems">';
    for (let i = 0; i < tokensToDraw; i += 1) {
        html += `<span class="energy-token solid-token token-${element}"></span>`;
    }
    if (energy > tokensToDraw) {
        html += `<span class="battle-cost-count">x${energy}</span>`;
    }
    html += `</span><span class="battle-cost-label">${formatElementLabel(rawElement || element)}</span>`;
    return html;
}

function getSortedBattleAbilities(abilities) {
    return [...(abilities || [])].sort((left, right) => {
        const energyDiff = getAbilityRequiredEnergy(left) - getAbilityRequiredEnergy(right);
        if (energyDiff !== 0) {
            return energyDiff;
        }
        if (Boolean(left?.affordable) !== Boolean(right?.affordable)) {
            return left?.affordable ? -1 : 1;
        }
        return String(left?.name || '').localeCompare(String(right?.name || ''));
    });
}

function formatAbilitySummaryText(ability) {
    if (!ability) {
        return '';
    }
    const name = String(ability.name || '').trim();
    const description = String(ability.description || '').trim();
    const energyAmount = Number(ability.requiredEnergy ?? ability.costAmount ?? 0);
    const energyElement = ability.requiredElement || ability.costElement || '';
    const costText = energyAmount > 0 && energyElement
        ? `${energyAmount} ${formatElementLabel(energyElement)}`
        : '';

    let text = description || name || '';
    if (name && description && !description.toLowerCase().startsWith(name.toLowerCase())) {
        text = `${name}: ${description}`;
    }
    if (!text && costText) {
        text = `Cost ${costText}`;
    } else if (text && costText) {
        text = `${text} (${costText})`;
    }
    return text;
}

function getCardSummaryStatLine(card) {
    if (!card || card.type !== 'SIEGLING') {
        return '';
    }
    const parts = [];
    const healthValue = Number(card.health ?? card.hp);
    const speedValue = Number(card.speed ?? card.spd);
    if (Number.isFinite(healthValue)) {
        parts.push(`HP:${healthValue}`);
    }
    if (Number.isFinite(speedValue)) {
        parts.push(`SPD:${speedValue}`);
    }
    if (card.preferredRow) {
        parts.push(card.preferredRow);
    }
    return parts.join(' ');
}

function getCardPreviewEntries(card) {
    const entries = [];
    getCardAbilities(card)
        .filter((ability) => !ability.passive)
        .forEach((ability) => {
            const flavorHtml = renderAbilityFlavorHtml(card.element, ability);
            if (flavorHtml) {
                entries.push({ html: flavorHtml, className: 'card-detail card-flavor-wrap', isAbilityFlavor: true });
            }
        });

    if (card.type === 'TRAP' && card.trapBucketElement) {
        entries.push({
            text: `Can Trigger when opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)} Energy`,
            className: 'card-cost'
        });
    } else if (card.costElement && card.costAmount > 0) {
        entries.push({
            text: `Play Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}`,
            className: 'card-cost'
        });
    }

    if (card.requiredComboSize) {
        entries.push({
            text: `Combo: ${card.requiredComboSignature ? card.requiredComboSignature.replaceAll('+', ' / ') : `${card.requiredComboSize}-element combo`}`,
            className: 'card-cost'
        });
    }
    if (card.requiredReaction) {
        entries.push({
            text: `Requires: ${card.requiredReaction}`,
            className: 'card-cost'
        });
    }
    if (card.evolvesFromName) {
        entries.push({
            text: `Evolution: ${card.evolvesFromName}`,
            className: 'card-cost'
        });
    }

    return entries;
}

function renderShowcaseCard(card, options = {}) {
    if (!card) {
        return '';
    }

    const elemClass = (card.element || 'NEUTRAL').toLowerCase();
    const fallbackArtLabel = card.type === 'SIEGLING'
        ? formatElementLabel(card.element)
        : `${formatElementLabel(card.element)} ${card.type}`.trim();
    const labelText = options.labelText
        || [card.type, formatElementLabel(card.element)].filter(Boolean).join(' / ');
    // Shield treatment for previews of *board* cards — same rule as the
    // board: visible only while there's remaining absorb. The badge,
    // grey stats-line, and is-shielded class all clear together once
    // the buffer is spent.
    const showcaseShield = getShieldInfo(card);
    const showcaseHasShield = showcaseShield.active && showcaseShield.intact > 0;
    const classes = ['hand-card', elemClass, options.cardClass,
        showcaseHasShield ? 'has-shield' : ''].filter(Boolean).join(' ');
    const detailEntries = getCardPreviewEntries(card);
    const statLine = getCardSummaryStatLine(card);
    const bodyMode = options.bodyMode || 'full';
    const visibleDetailEntries = bodyMode === 'summary'
        ? detailEntries.slice(0, 1)
        : bodyMode === 'hidden'
        ? []
        : detailEntries;

    let html = `<div class="${classes}">`;
    if (card.type === 'SIEGLING') {
        html += renderHandNotches(card.notches);
    }
    html += `<div class="hand-card-shell">`;
    html += `<div class="hand-card-header">`;
    html += `<div class="card-title">${escapeHtml(card.name)}</div>`;
    html += `<div class="card-label">${escapeHtml(labelText)}</div>`;
    html += `</div>`;
    html += renderCardArt(card, options.artVariant || 'preview', fallbackArtLabel);
    if (bodyMode !== 'hidden') {
        html += `<div class="hand-card-body">`;
        // Surface the shield badge (and any other active status badges)
        // when this preview reflects a board card. Hand cards have no
        // statuses array so this renders nothing for those.
        if (Array.isArray(card.statuses) && card.statuses.length > 0) {
            html += renderStatusBadgesForCell(card);
        }
        if (statLine) {
            html += `<div class="card-detail card-stats-line${showcaseHasShield ? ' is-shielded' : ''}">${escapeHtml(statLine)}</div>`;
        }
        visibleDetailEntries.forEach((entry) => {
            if (entry.html) {
                html += `<div class="${entry.className}">${entry.html}</div>`;
            } else {
                html += `<div class="${entry.className}">${escapeHtml(entry.text)}</div>`;
            }
        });
        if (bodyMode === 'summary' && detailEntries.length > visibleDetailEntries.length) {
            html += `<div class="card-detail card-detail-more">+${detailEntries.length - visibleDetailEntries.length} more</div>`;
        }
        html += `</div>`;
    }
    html += `</div>`;
    html += `</div>`;
    return html;
}

function apiUrl(path, baseUrl = activeApiBaseUrl) {
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
    if (!path.startsWith('/')) {
        return `${normalizedBaseUrl}/${path}`;
    }
    return `${normalizedBaseUrl}${path}`;
}

function apiUrls(path) {
    const seen = new Set();
    const urls = [];
    // Same-origin and configured API first. A stale activeApiBaseUrl (last successful host) was
    // previously tried first and could hang for the full timeout before falling back to localhost.
    for (const baseUrl of ['', API_BASE_URL, activeApiBaseUrl]) {
        const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
        if (seen.has(normalizedBaseUrl)) {
            continue;
        }
        seen.add(normalizedBaseUrl);
        urls.push(apiUrl(path, normalizedBaseUrl));
    }
    return urls;
}

function resolveApiBaseUrl(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        return parsed.origin === window.location.origin ? '' : normalizeApiBaseUrl(parsed.origin);
    } catch (e) {
        return API_BASE_URL;
    }
}

function isCompactLandscapeLayout() {
    return window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
}

function isDesktopSidebarLayout() {
    return window.matchMedia('(min-width: 980px)').matches && !isCompactLandscapeLayout();
}

function isMobileLayout() {
    return window.matchMedia('(max-width: 900px)').matches || isCompactLandscapeLayout();
}

function isPortraitMobileHudLayout() {
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
}

function getViewportModeLabel() {
    if (isDesktopSidebarLayout()) {
        return 'Desktop Dock';
    }
    if (isCompactLandscapeLayout()) {
        return 'Landscape';
    }
    return 'Portrait';
}

function updateResponsiveLayoutVars(force = false) {
    const signature = `${window.innerWidth}x${window.innerHeight}:${getViewportModeLabel()}`;
    if (!force && signature === lastViewportSignature) {
        return;
    }
    lastViewportSignature = signature;

    const root = document.documentElement;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const desktop = isDesktopSidebarLayout();
    const compactLandscape = isCompactLandscapeLayout();
    const density = clampNumber(Math.min(viewportWidth / 1440, viewportHeight / 900), 0.72, 1.08);
    const cardAspectHeight = 7 / 5;
    const desktopHandVisibleCards = 5;
    const baseDesktopHudRailWidth = 200;
    const baseDesktopSidebarWidth = 420;
    const hideEnemyHudRail = desktop && viewportWidth <= 1200;
    const desktopPanelScale = desktop
        ? clampNumber((viewportWidth - 1600) / 1600, 0, 1)
        : 0;
    const desktopLayoutGutter = desktop
        ? Math.round(clampNumber(viewportWidth * 0.008, 10, 22))
        : 0;
    const desktopLayoutGap = desktop
        ? Math.round(clampNumber(viewportWidth * 0.01, 14, 24))
        : 18;
    const desktopAppMaxWidth = desktop
        ? viewportWidth
        : 1280;
    const desktopHandGap = desktop
        ? Math.round(clampNumber(viewportWidth * 0.0045, 10, 16))
        : 12;
    const desktopHandTargetWidth = desktop
        ? Math.round(clampNumber(viewportHeight * 0.105, 112, 240))
        : 138;
    let desktopHudRailWidth = desktop
        ? Math.round(baseDesktopHudRailWidth * (1 + desktopPanelScale))
        : baseDesktopHudRailWidth;
    let sidebarWidth = desktop
        ? Math.round(baseDesktopSidebarWidth * (1 + desktopPanelScale))
        : baseDesktopSidebarWidth;
    const desktopGridGapCount = desktop
        ? hideEnemyHudRail ? 2 : 3
        : 0;
    const boardMaxWidth = desktop
        ? Math.round(clampNumber(viewportHeight * 0.45, 360, 620))
        : 420;
    const boardHeightOffset = desktop
        ? Math.round(clampNumber(viewportHeight * 0.1, 82, 148))
        : 124;
    const boardHeightRatio = desktop ? 1.38 : 2.72;
    const topBarHeight = desktop
        ? Math.round(document.querySelector('.top-bar')?.getBoundingClientRect().height || 36)
        : 0;
    const desktopArenaHeight = desktop
        ? Math.max(0, viewportHeight - topBarHeight - (desktopLayoutGutter * 2))
        : 0;
    const heightLimitedBoardWidth = desktop
        ? Math.max(0, ((desktopArenaHeight - boardHeightOffset) / 2) / boardHeightRatio)
        : boardMaxWidth;
    const desktopBoardTargetWidth = desktop
        ? Math.round(Math.min(boardMaxWidth, heightLimitedBoardWidth || boardMaxWidth))
        : boardMaxWidth;
    let desktopArenaColumnWidth = desktop
        ? Math.round(clampNumber(
            desktopBoardTargetWidth + clampNumber(desktopBoardTargetWidth * 0.85, 300, 560),
            desktopBoardTargetWidth + 220,
            Math.min(1240, Math.max(boardMaxWidth + 220, viewportWidth - 24))
        ))
        : 0;
    if (desktop && !hideEnemyHudRail) {
        const availableForColumns = viewportWidth - (desktopLayoutGutter * 2) - (desktopLayoutGap * desktopGridGapCount);
        const minimumPanelWidth = baseDesktopSidebarWidth + baseDesktopHudRailWidth + (hideEnemyHudRail ? 0 : baseDesktopHudRailWidth);
        const preferredPanelWidth = sidebarWidth + desktopHudRailWidth + (hideEnemyHudRail ? 0 : desktopHudRailWidth);
        const maxArenaForPreferredPanels = availableForColumns - preferredPanelWidth;
        if (maxArenaForPreferredPanels < desktopArenaColumnWidth) {
            desktopArenaColumnWidth = Math.max(desktopBoardTargetWidth + 160, maxArenaForPreferredPanels);
        }
        if (desktopArenaColumnWidth + minimumPanelWidth > availableForColumns) {
            const panelScaleDown = Math.max(0, (availableForColumns - desktopArenaColumnWidth) / minimumPanelWidth);
            desktopHudRailWidth = Math.max(0, Math.round(baseDesktopHudRailWidth * panelScaleDown));
            sidebarWidth = Math.max(320, Math.round(baseDesktopSidebarWidth * panelScaleDown));
        } else {
            const panelWidth = sidebarWidth + desktopHudRailWidth + desktopHudRailWidth;
            const extraPanelWidth = Math.max(0, availableForColumns - desktopArenaColumnWidth - panelWidth);
            if (extraPanelWidth > 0) {
                const railBonus = Math.floor(extraPanelWidth * 0.25);
                desktopHudRailWidth += railBonus;
                sidebarWidth += extraPanelWidth - (railBonus * 2);
            }
        }
    }
    const desktopHandHorizontalChrome = desktop
        ? Math.round(clampNumber(sidebarWidth * 0.09, 60, 112))
        : 0;
    const desktopHandAvailableWidth = desktop
        ? Math.max(0, sidebarWidth - desktopHandHorizontalChrome)
        : 0;
    const desktopHandFiveCardFitWidth = desktop
        ? Math.max(
            48,
            Math.floor((desktopHandAvailableWidth - (desktopHandGap * (desktopHandVisibleCards - 1))) / desktopHandVisibleCards)
        )
        : 0;
    const handWidth = desktop
        ? Math.round(clampNumber(
            Math.min(desktopHandTargetWidth, desktopHandFiveCardFitWidth),
            Math.min(96, desktopHandFiveCardFitWidth),
            Math.max(96, desktopHandFiveCardFitWidth)
        ))
        : compactLandscape
        ? Math.round(clampNumber(viewportHeight * 0.18, 64, 78))
        : Math.round(clampNumber(Math.min(viewportWidth * 0.16, viewportHeight * 0.19), 52, 138));
    const desktopHandSectionTargetHeight = desktop
        ? Math.round((handWidth * cardAspectHeight) + 58)
        : 176;
    const desktopHandSectionMinHeight = desktop
        ? Math.round(clampNumber(desktopHandSectionTargetHeight, 170, viewportHeight * 0.28))
        : 176;
    const desktopHandSectionHeight = desktop
        ? Math.round(clampNumber(
            desktopHandSectionMinHeight + Math.round(clampNumber(viewportHeight * 0.012, 10, 28)),
            desktopHandSectionMinHeight,
            viewportHeight * 0.32
        ))
        : 208;
    let previewCardWidth = handWidth;
    let previewCardMaxHeight = Math.round(handWidth * cardAspectHeight);
    if (desktop) {
        const sidebarGutter = 64;
        const maxPreviewWidth = Math.max(148, Math.min(sidebarWidth - sidebarGutter, 272));
        previewCardWidth = Math.round(
            clampNumber(sidebarWidth * 0.46, 148, maxPreviewWidth)
        );
        previewCardMaxHeight = Math.round(previewCardWidth * cardAspectHeight);
        const maxPreviewHeight = Math.round(viewportHeight * 0.43);
        if (previewCardMaxHeight > maxPreviewHeight) {
            previewCardMaxHeight = maxPreviewHeight;
            previewCardWidth = Math.round(previewCardMaxHeight * (5 / 7));
        }
    }
    const overlayWidth = Math.round(clampNumber(viewportWidth * 0.92, 320, 1180));
    const overlayPadding = Math.round(clampNumber(Math.min(viewportWidth, viewportHeight) * 0.026, 14, 28));

    root.style.setProperty('--card-scale', density.toFixed(3));
    root.style.setProperty('--desktop-app-max-width', `${desktopAppMaxWidth}px`);
    root.style.setProperty('--desktop-layout-gutter', `${desktopLayoutGutter}px`);
    root.style.setProperty('--desktop-layout-gap', `${desktopLayoutGap}px`);
    root.style.setProperty('--desktop-sidebar-width', `${sidebarWidth}px`);
    root.style.setProperty('--hud-rail-width', `${desktopHudRailWidth}px`);
    root.style.setProperty('--desktop-arena-width', `${desktopArenaColumnWidth}px`);
    root.style.setProperty('--desktop-board-max-width', `${boardMaxWidth}px`);
    root.style.setProperty('--desktop-board-height-offset', `${boardHeightOffset}px`);
    root.style.setProperty('--desktop-board-height-ratio', `${boardHeightRatio}`);
    root.style.setProperty('--desktop-preview-card-width', `${previewCardWidth}px`);
    root.style.setProperty('--desktop-preview-card-max-height', `${previewCardMaxHeight}px`);
    root.style.setProperty('--desktop-hand-section-min-height', `${desktopHandSectionMinHeight}px`);
    root.style.setProperty('--desktop-hand-section-height', `${desktopHandSectionHeight}px`);
    root.style.setProperty('--hand-card-width', `${handWidth}px`);
    root.style.setProperty('--hand-card-overlap', desktop ? '0px' : `${-Math.round(handWidth * 0.25)}px`);
    root.style.setProperty('--hand-card-gap', `${desktopHandGap}px`);
    root.style.setProperty('--hand-card-padding', desktop ? '4px' : `${clampNumber(Math.round(handWidth * 0.045), 2, 6)}px`);
    root.style.setProperty('--hand-card-hover-lift', desktop ? '-4px' : `${-Math.round(handWidth * 0.16)}px`);
    root.style.setProperty('--hand-card-selected-lift', desktop ? '-6px' : `${-Math.round(handWidth * 0.2)}px`);
    root.style.setProperty('--overlay-shell-width', `${overlayWidth}px`);
    root.style.setProperty('--overlay-shell-padding', `${overlayPadding}px`);
}

function setMobileInfoTab(tab) {
    mobileInfoTab = tab;
    syncMobileInfoTab();
}

function syncMobileInfoTab() {
    const tabs = document.querySelectorAll('.mobile-info-tab');
    const sections = document.querySelectorAll('.utility-section');
    const compact = isMobileLayout();

    tabs.forEach(tab => {
        const isActive = tab.dataset.mobileTab === mobileInfoTab;
        tab.classList.toggle('active', isActive);
    });

    sections.forEach(section => {
        const isActive = section.dataset.mobileTab === mobileInfoTab;
        section.classList.toggle('active', !compact || isActive);
    });
}

/* ============================================================
   DRAWER SYSTEM â€” slide-up modals for log, key, battle, card info
   ============================================================ */
let activeDrawer = null;
let _drawerCloseTimers = [];

function isBattleTargetSelectionActive() {
    return Boolean(targetMode && targetContext && targetContext.mode === 'battle');
}

function shouldUseDesktopBattleDrawer() {
    return false;
}

function setDesktopBattleDrawerOpen(open) {
    const drawer = document.getElementById('desktopBattleDrawer');
    const battlePanelBtn = document.getElementById('btnBattlePanel');
    if (!drawer) {
        return false;
    }
    drawer.classList.toggle('visible', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    battlePanelBtn?.classList.toggle('ab-icon-active', open);
    document.body.classList.toggle('desktop-battle-drawer-open', open);
    return true;
}

function openDrawer(name) {
    if (activeDrawer === name) return;
    closeMobileHudSheet();
    // Cancel any pending close timers so they don't hide the new drawer
    _drawerCloseTimers.forEach(t => clearTimeout(t));
    _drawerCloseTimers = [];
    // Immediately hide any other open drawers (no animation)
    document.querySelectorAll('.drawer').forEach(d => {
        d.classList.remove('visible');
        d.classList.add('hidden');
    });
    if (name === 'battle' && shouldUseDesktopBattleDrawer()) {
        if (!setDesktopBattleDrawerOpen(true)) {
            return;
        }
        activeDrawer = name;
        return;
    }

    setDesktopBattleDrawerOpen(false);
    const backdrop = document.getElementById('drawerBackdrop');
    const drawer = document.querySelector(`[data-drawer="${name}"]`);
    if (!drawer || !backdrop) return;
    backdrop.classList.remove('hidden');
    drawer.classList.remove('hidden');
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        drawer.classList.add('visible');
    });
    activeDrawer = name;
}

function closeDrawer(immediate = false) {
    _drawerCloseTimers.forEach(t => clearTimeout(t));
    _drawerCloseTimers = [];
    setDesktopBattleDrawerOpen(false);

    if (activeDrawer === 'battle' && shouldUseDesktopBattleDrawer()) {
        activeDrawer = null;
        return;
    }

    const backdrop = document.getElementById('drawerBackdrop');
    const drawers = document.querySelectorAll('.drawer');
    if (backdrop) {
        backdrop.classList.remove('visible');
        if (immediate) {
            backdrop.classList.add('hidden');
        } else {
            _drawerCloseTimers.push(setTimeout(() => backdrop.classList.add('hidden'), 260));
        }
    }
    drawers.forEach(d => {
        d.classList.remove('visible');
        if (immediate) {
            d.classList.add('hidden');
        } else {
            _drawerCloseTimers.push(setTimeout(() => d.classList.add('hidden'), 300));
        }
    });
    activeDrawer = null;
}

function formatPhaseLabel(phase) {
    switch (phase) {
        case 'DRAW':
            return 'Draw Phase';
        case 'SETUP':
            return 'Setup Phase';
        case 'BATTLE':
            return 'Battle Phase';
        case 'MULLIGAN':
            return 'Opening Hand';
        default:
            return phase ? `${phase.charAt(0)}${phase.slice(1).toLowerCase()} Phase` : 'Phase Shift';
    }
}

function getPhaseTransitionKicker(phase, activeSide) {
    if (phase === 'BATTLE') {
        return 'Clash Begins';
    }
    if (activeSide === 'PLAYER') {
        return 'Your Turn';
    }
    if (activeSide === 'ENEMY') {
        return 'Enemy Turn';
    }
    return 'Phase Shift';
}

function showPhaseTransitionBanner(phase, activeSide) {
    // The real-time playback system shows phase changes via the action-queue
    // toast. When it's available, suppress the old top-of-screen banner so we
    // don't double up.
    if (window.SieglingsActionQueue) {
        return;
    }
    const banner = document.getElementById('phaseTransitionBanner');
    const kicker = document.getElementById('phaseTransitionKicker');
    const title = document.getElementById('phaseTransitionTitle');
    if (!banner || !kicker || !title || !phase) {
        return;
    }

    if (phaseTransitionTimer) {
        clearTimeout(phaseTransitionTimer);
        phaseTransitionTimer = null;
    }

    banner.className = `phase-transition-banner ${String(phase).toLowerCase()}`;
    kicker.textContent = getPhaseTransitionKicker(phase, activeSide);
    title.textContent = formatPhaseLabel(phase);
    banner.classList.remove('hidden');
    window.SieglingsSounds?.play('phase', 0.5);
    requestAnimationFrame(() => banner.classList.add('visible'));

    phaseTransitionTimer = setTimeout(() => {
        banner.classList.remove('visible');
        phaseTransitionTimer = setTimeout(() => {
            banner.classList.add('hidden');
            phaseTransitionTimer = null;
        }, 320);
    }, 1800);
}

/* ============================================================
   CARD INSPECTOR â€” full-detail overlay when tapping hand card
   ============================================================ */
function openCardInspector(card) {
    const overlay = document.getElementById('cardInspector');
    const content = document.getElementById('cardInspectorContent');
    if (!overlay || !content || !card) return;

    let html = `<div class="ci-name">${escapeHtml(card.name)}</div>`;
    html += `<div class="ci-stats">${escapeHtml(card.type)} / ${escapeHtml(card.rarity)} / ${formatElementLabel(card.element)}</div>`;

    if (card.type === 'SIEGLING') {
        const statLine = getCardSummaryStatLine(card);
        if (statLine) html += `<div class="ci-stats">${statLine}</div>`;
    }

    html += renderCardArt(card, 'inspector');

    if (card.type === "SIEGLING") {
        const moveLines = getSieglingMovesForDisplay(card);
        if (moveLines.length > 0) {
            html += `<div class="ci-ability ci-moves">${moveLines.map((m) => escapeHtml(formatSieglingMoveLine(m))).join("<br>")}</div>`;
        }
    } else {
        const abilities = getCardAbilities(card);
        if (abilities.length > 0) {
            html += `<div class="ci-ability">${abilities.map((a) => escapeHtml(formatAbilitySummaryText(a))).join("<br>")}</div>`;
        }
    }

    if (card.type === 'TRAP' && card.trapBucketElement) {
        html += `<div class="ci-ability">Can Trigger when opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)} Energy</div>`;
    } else if (card.costElement && card.costAmount > 0) {
        html += `<div class="ci-ability">Play Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}</div>`;
    }
    if (card.requiredReaction) {
        html += `<div class="ci-ability">Requires active ${escapeHtml(String(card.requiredReaction).charAt(0) + String(card.requiredReaction).slice(1).toLowerCase())} (see energy panel).</div>`;
    }
    if (card.requiredComboSize) {
        html += `<div class="ci-ability">Combo: ${card.requiredComboSignature ? card.requiredComboSignature.replaceAll('+', ' / ') : `${card.requiredComboSize}-element combo`}</div>`;
    }
    if (card.evolvesFromName) {
        html += `<div class="ci-ability">Evolves from: ${escapeHtml(card.evolvesFromName)}</div>`;
    }

    html += `<div class="ci-actions">`;
    html += `<button class="btn" onclick="closeCardInspector(event)">Close</button>`;
    if (gameState && gameState.currentPhase === 'SETUP' && !getHandCardLockReason(card)) {
        html += `<button class="btn btn-primary" onclick="closeCardInspector(event); selectCard('${card.id}')">Play</button>`;
    }
    html += `</div>`;

    content.innerHTML = html;
    overlay.classList.remove('hidden');
}

function closeCardInspector(event) {
    if (event) event.stopPropagation();
    const overlay = document.getElementById('cardInspector');
    if (overlay) overlay.classList.add('hidden');
}

function closeCardPreviewSurfaces() {
    if (activeDrawer === 'selected') {
        closeDrawer();
    }
    closeCardInspector();
    const floatPreview = document.getElementById('cardPreviewFloat');
    if (floatPreview) {
        floatPreview.classList.add('hidden');
        floatPreview.innerHTML = '';
    }
}

function canUseTrainerAbility(trainer = gameState?.player?.trainer) {
    return Boolean(
        trainer
        && trainer.active
        && trainer.canUseActive
        && !isOpeningPlacementOnlyTurn()
        && abilityHasAvailableTarget(trainer.active)
    );
}

function buildTrainerAbilityHint(trainer) {
    if (!trainer?.active) {
        return 'No active SiegeKnight ability is ready right now.';
    }
    const targetSide = getAbilityTargetSide(trainer.active);
    if (targetSide && !abilityHasAvailableTarget(trainer.active)) {
        return `No ${targetSide} targets are available right now.`;
    }
    if (targetSide) {
        const article = /^[aeiou]/i.test(targetSide) ? 'an' : 'a';
        return `Using this will close the popup and let you pick ${article} ${targetSide} target on the board.`;
    }
    if (trainer.oncePerGame) {
        return 'This ultimate resolves immediately and can only be used once this match.';
    }
    return 'This ability resolves immediately when you confirm it.';
}

function renderTrainerAbilityPopup() {
    const overlay = document.getElementById('trainerAbilityOverlay');
    const trainer = gameState?.player?.trainer;
    if (!overlay) {
        return;
    }
    if (!trainer) {
        closeTrainerAbilityPopup();
        return;
    }

    const title = document.getElementById('trainerAbilityTitle');
    const tier = document.getElementById('trainerAbilityTier');
    const description = document.getElementById('trainerAbilityDescription');
    const copy = document.getElementById('trainerAbilityCopy');
    const useBtn = document.getElementById('btnUseTrainerAbility');

    if (title) {
        title.textContent = trainer.name || 'SiegeKnight';
    }
    if (tier) {
        tier.textContent = [
            formatTrainerTier(trainer.tier),
            formatElementLabel(trainer.element),
            trainer.rarity || null
        ].filter(Boolean).join(' • ');
    }
    if (description) {
        description.textContent = trainer.passive?.description
            ? `Passive: ${trainer.passive.description}`
            : 'No passive effect listed.';
    }
    if (copy) {
        const activeDescription = trainer.active?.description
            ? `Active: ${trainer.active.description}`
            : 'No active ability listed.';
        const availability = trainer.active
            ? buildTrainerAbilityHint(trainer)
            : 'No active SiegeKnight ability is available right now.';
        copy.textContent = `${activeDescription} ${availability}`.trim();
    }
    if (useBtn) {
        const canUse = canUseTrainerAbility(trainer);
        useBtn.disabled = !canUse;
        useBtn.textContent = !trainer.active
            ? 'No Active Ability'
            : (abilityNeedsTarget(trainer.active) ? 'Choose Target' : 'Use Ability');
    }
}
function openTrainerAbilityPopup() {
    const trainer = gameState?.player?.trainer;
    if (!trainer) {
        return;
    }
    const overlay = document.getElementById('trainerAbilityOverlay');
    if (!overlay) {
        return;
    }
    renderTrainerAbilityPopup();
    overlay.classList.remove('hidden');
}

function closeTrainerAbilityPopup(event) {
    if (event) {
        event.stopPropagation();
    }
    const overlay = document.getElementById('trainerAbilityOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function openDashboardAccess() {
    const overlay = document.getElementById('dashboardAccessOverlay');
    const input = document.getElementById('dashboardAccessPassword');
    const error = document.getElementById('dashboardAccessError');
    if (!overlay || !input) {
        window.location.href = '/card-dashboard.html';
        return;
    }
    if (error) {
        error.textContent = '';
    }
    input.value = '';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 0);
}

function closeDashboardAccess(event) {
    if (event) {
        event.stopPropagation();
    }
    const overlay = document.getElementById('dashboardAccessOverlay');
    if (!overlay) {
        return;
    }
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
}

function submitDashboardAccess(event) {
    event.preventDefault();
    const input = document.getElementById('dashboardAccessPassword');
    const error = document.getElementById('dashboardAccessError');
    const password = input?.value || '';
    if (password === DASHBOARD_ACCESS_PASSWORD) {
        window.location.href = '/card-dashboard.html';
        return;
    }
    if (error) {
        error.textContent = 'Incorrect password.';
    }
    input?.select();
}

function activateTrainerAbilityFromPopup() {
    closeTrainerAbilityPopup();
    onTrainerUse();
}

function getPendingClaimCard() {
    if (!pendingClaimTarget) {
        return null;
    }
    const { row, col } = pendingClaimTarget;
    const cell = gameState?.playerBoard?.[row]?.[col] || null;
    return isClaimableBoardCell(cell, true) ? cell : null;
}

function renderClaimPopup() {
    const overlay = document.getElementById('claimConfirmOverlay');
    if (!overlay) {
        return;
    }
    const card = getPendingClaimCard();
    if (!card) {
        closeClaimPopup();
        return;
    }

    const title = document.getElementById('claimConfirmTitle');
    const tier = document.getElementById('claimConfirmTier');
    const description = document.getElementById('claimConfirmDescription');
    const copy = document.getElementById('claimConfirmCopy');
    const confirmBtn = document.getElementById('btnConfirmClaim');

    if (title) {
        title.textContent = `Claim ${card.name}?`;
    }
    if (tier) {
        tier.textContent = `${formatElementLabel(card.element)} Siegling`;
    }
    if (description) {
        description.textContent = `This removes ${card.name} from your board and grants 1 temporary ${formatElementLabel(card.element)} energy for this turn.`;
    }
    if (copy) {
        copy.textContent = 'Claiming can break its links and lower your permanent network energy, but the temporary claim energy applies right away for this setup turn.';
    }
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Claim';
    }
}

function openClaimPopup(row, col) {
    const overlay = document.getElementById('claimConfirmOverlay');
    const cell = gameState?.playerBoard?.[row]?.[col] || null;
    if (!overlay || !isClaimableBoardCell(cell, true)) {
        return;
    }
    pendingClaimTarget = { row, col };
    renderClaimPopup();
    overlay.classList.remove('hidden');
}

function closeClaimPopup(event) {
    if (event) {
        event.stopPropagation();
    }
    pendingClaimTarget = null;
    const overlay = document.getElementById('claimConfirmOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

async function confirmClaimFromPopup() {
    if (!pendingClaimTarget) {
        return;
    }
    const { row, col } = pendingClaimTarget;
    closeClaimPopup();
    await claimBoardCard(row, col);
}

/* ============================================================
   CARD PREVIEW FLOAT â€” shows selected card over enemy grid
   ============================================================ */
function getFocusedPreviewCard() {
    const arenaCell = resolveArenaSelectionCell();
    if (arenaCell) {
        return boardCellToPreviewCard(arenaCell);
    }
    if (hoveredBoardCard) {
        return boardCellToPreviewCard(hoveredBoardCard);
    }
    const hand = gameState?.player?.hand;
    const hoveredCard = hoveredHandIndex != null && hand ? hand[hoveredHandIndex] : null;
    return hoveredCard || selectedCard || null;
}

function getInteractionHintState() {
    const state = getInteractionBannerState();
    const focusedCard = getFocusedPreviewCard();
    const hints = [];

    if (state?.message) {
        hints.push(state.message);
    }

    if (focusedCard) {
        if (isBoardPreviewCard(focusedCard)) {
            hints.push(
                `${boardCardOwnershipLabel(focusedCard)} Siegling — ${focusedCard.hp ?? '?'}/${focusedCard.maxHp ?? '?'} HP.`
            );
        } else {
            const lockReason = getHandCardLockReason(focusedCard);
            if (lockReason) {
                hints.push(lockReason);
            } else if (focusedCard.type === 'SIEGLING') {
                if (focusedCard.evolvesFromName) {
                    hints.push(`After ${focusedCard.evolvesFromName} survives a full battle phase in that form, play this on it to evolve.`);
                } else if (gameState?.currentPhase === 'SETUP' && !gameState?.playerPlacementUsed) {
                    hints.push('Highlighted slots show where this Siegling can be placed.');
                }
            } else if (focusedCard.type === 'TRAP') {
                hints.push('Traps stay hidden until their trigger condition is met.');
            } else if (focusedCard.costElement && focusedCard.costAmount > 0) {
                hints.push(`This costs ${focusedCard.costAmount} ${formatElementLabel(focusedCard.costElement)} to play.`);
            }
        }

        hints.push('Use the eye button to open the focused card drawer.');
    }

    const uniqueHints = [...new Set(hints.filter(Boolean))];
    return {
        available: uniqueHints.length > 0,
        kind: state?.kind || (focusedCard ? 'place' : 'idle'),
        label: state?.label || (focusedCard ? 'Card Focus' : 'Hints'),
        hints: uniqueHints
    };
}

function renderHintPanel() {
    const panel = document.getElementById('interactionHintPanel');
    if (!panel) {
        return;
    }

    const hintState = getInteractionHintState();
    if (!hintState.available) {
        panel.innerHTML = `
            <div class="hint-drawer-copy">Select or hover a hand card, or click a Siegling on either board, to see contextual help.</div>
            <div class="hint-list">
                <div class="hint-item">The eye button opens the live card preview drawer when something is focused.</div>
            </div>
        `;
        return;
    }

    let html = `<div class="hint-drawer-copy">Context-sensitive help for your current board state.</div>`;
    html += `<div class="hint-chip ${escapeHtml(hintState.kind)}">${escapeHtml(hintState.label)}</div>`;
    html += `<div class="hint-list">`;
    hintState.hints.forEach(hint => {
        html += `<div class="hint-item">${escapeHtml(hint)}</div>`;
    });
    html += `</div>`;
    panel.innerHTML = html;
}

function syncActionBarAttention() {
    const hintButton = document.getElementById('btnHint');
    const previewButton = document.getElementById('btnSelectedPreview');
    const hintState = getInteractionHintState();
    const focusedCard = getFocusedPreviewCard();

    hintButton?.classList.toggle('ab-icon-live', hintState.available);
    hintButton?.classList.toggle('ab-icon-pulse', hintState.available);
    if (hintButton) {
        hintButton.setAttribute(
            'aria-label',
            hintState.available ? `${hintState.label} hints available` : 'Hints'
        );
    }

    previewButton?.classList.toggle('ab-icon-preview-live', Boolean(focusedCard));
    previewButton?.classList.toggle('ab-icon-pulse', Boolean(focusedCard));
    if (previewButton) {
        previewButton.setAttribute(
            'aria-label',
            focusedCard ? `Card Preview available for ${focusedCard.name}` : 'Card Preview'
        );
    }

    syncSetupActionsCounter();
}

let lastSetupActionsRemaining = null;
let setupActionsPulseTimer = null;

function syncSetupActionsCounter() {
    const el = document.getElementById('setupActionsCounter');
    if (!el) {
        return;
    }
    const valueEl = document.getElementById('setupActionsCounterValue');
    const gs = gameState;
    if (!gs || gs.gameOver || gs.currentPhase !== 'SETUP' || gs.mulligan?.active) {
        el.hidden = true;
        if (valueEl) valueEl.textContent = '';
        el.removeAttribute('title');
        el.classList.remove('is-zero', 'is-decrement', 'is-increment');
        lastSetupActionsRemaining = null;
        return;
    }
    const budget = gs.setupSieglingActionBudget;
    const used = gs.setupSieglingActionsUsed;
    if (budget == null || used == null) {
        el.hidden = true;
        if (valueEl) valueEl.textContent = '';
        lastSetupActionsRemaining = null;
        return;
    }
    const remaining = Math.max(0, budget - used);
    el.hidden = false;
    if (valueEl) {
        valueEl.textContent = `${remaining}/${budget}`;
    }
    el.title = `${remaining} Siegling setup action${remaining === 1 ? '' : 's'} left this turn (${used} of ${budget} used).`;
    el.classList.toggle('is-zero', remaining === 0);

    const playerActive = gs.activeSide === 'PLAYER';
    if (
        playerActive
        && lastSetupActionsRemaining !== null
        && lastSetupActionsRemaining !== remaining
    ) {
        const direction = remaining < lastSetupActionsRemaining ? 'is-decrement' : 'is-increment';
        el.classList.remove('is-decrement', 'is-increment');
        // Force reflow so the class is reapplied even when consecutive actions hit the same direction.
        void el.offsetWidth;
        el.classList.add(direction);
        if (setupActionsPulseTimer) {
            clearTimeout(setupActionsPulseTimer);
        }
        setupActionsPulseTimer = setTimeout(() => {
            el.classList.remove('is-decrement', 'is-increment');
            setupActionsPulseTimer = null;
        }, 520);
    }
    lastSetupActionsRemaining = remaining;
}

let desktopInspectTab = 'card';

function setDesktopInspectTab(tab) {
    const next = tab === 'deck' ? 'deck' : 'card';
    desktopInspectTab = next;
    syncDesktopInspectTabUi();
}

function syncDesktopInspectTabUi() {
    const cardTab = document.getElementById('tabDesktopInspectCard');
    const deckTab = document.getElementById('tabDesktopInspectDeck');
    const cardPane = document.getElementById('desktopInspectPaneCard');
    const deckPane = document.getElementById('desktopInspectPaneDeck');
    const isCard = desktopInspectTab === 'card';
    cardTab?.classList.toggle('is-active', isCard);
    deckTab?.classList.toggle('is-active', !isCard);
    cardTab?.setAttribute('aria-selected', isCard ? 'true' : 'false');
    deckTab?.setAttribute('aria-selected', isCard ? 'false' : 'true');
    cardPane?.classList.toggle('is-active', isCard);
    deckPane?.classList.toggle('is-active', !isCard);
    if (cardPane) {
        if (isCard) {
            cardPane.removeAttribute('hidden');
        } else {
            cardPane.setAttribute('hidden', '');
        }
    }
    if (deckPane) {
        if (isCard) {
            deckPane.setAttribute('hidden', '');
        } else {
            deckPane.removeAttribute('hidden');
        }
    }
    if (isCard) {
        scheduleDesktopPreviewCardScale();
    }
}

function syncFocusedCardUi() {
    renderCardPreviewFloat();
    renderDesktopCardPreviewPanel();
    renderDesktopMenuMeta();
    renderHintPanel();
    syncFocusedEnergyCue();
    syncActionBarAttention();
}

function shouldShowFloatingCardPreview() {
    return false;
}

function renderCardPreviewFloat() {
    const el = document.getElementById('cardPreviewFloat');
    if (!el) return;

    const focusedCard = getFocusedPreviewCard();
    if (!focusedCard || !shouldShowFloatingCardPreview()) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }

    el.innerHTML = renderShowcaseCard(focusedCard, {
        cardClass: 'card-preview-card',
        artVariant: 'preview'
    });
    el.classList.remove('hidden');
}

function onPreviewFloatTap() {
    const focusedCard = getFocusedPreviewCard();
    if (focusedCard) openCardInspector(focusedCard);
}

function getDesktopPreviewNote(card, lockReason) {
    if (lockReason) {
        return lockReason;
    }
    if (!card) {
        return 'Hover, select a hand card, or click a Siegling on either board to inspect it here.';
    }
    if (isBoardPreviewCard(card)) {
        const own = boardCardOwnershipLabel(card);
        const phases = Number(card.battlePhasesSeen || 0);
        return `${own} Siegling in play — ${card.hp}/${card.maxHp} HP · ${phases} battle phase(s) survived.`;
    }
    if (card.type === 'SIEGLING') {
        if (card.evolvesFromName) {
            return `After ${card.evolvesFromName} completes a full battle phase in that form, place this on it to evolve.`;
        }
        if (isPlacementBudgetLockedForCard(card)) {
            return sieglingPlacementLockMessage();
        }
        if (gameState?.currentPhase === 'SETUP') {
            return 'Highlighted board cells show where this Siegling can expand next.';
        }
        return 'Siegling battle actions resolve automatically in speed order during battle.';
    }
    if (card.type === 'TRAP') {
        return 'Traps stay hidden until their trigger condition is met.';
    }
    if (card.requiredComboSize) {
        const comboLabel = card.requiredComboSignature
            ? card.requiredComboSignature.split('+').map(formatElementLabel).join(' + ')
            : `${card.requiredComboSize}-element combo`;
        return `Requires ${comboLabel} before it can be played.`;
    }
    if (card.costElement && card.costAmount > 0) {
        return `Costs ${card.costAmount} ${formatElementLabel(card.costElement)} to play.`;
    }
    return 'Use the hand HUD to keep swapping the highlighted preview card.';
}

function isPlayerHandCard(card) {
    return Boolean(
        card
        && !card.instanceId
        && gameState?.player?.hand?.some((handCard) => handCard.id === card.id)
    );
}

function getFocusedCardSummary(card, lockReason) {
    if (!card) {
        if (isHandHiddenForPhase()) {
            return 'Battle Action is live in the hand HUD while battle resolves.';
        }
        return 'Hover a hand or board card to inspect live costs, lock reasons, and setup timing.';
    }
    if (isBoardPreviewCard(card)) {
        const own = boardCardOwnershipLabel(card);
        return `${own} Siegling on board — HP ${card.hp}/${card.maxHp}. Eye button opens the full preview.`;
    }
    if (!isPlayerHandCard(card)) {
        return 'Board card details update live as links, statuses, and battle order change.';
    }
    if (lockReason) {
        return lockReason;
    }
    if (card.costElement && card.costAmount > 0) {
        return canAffordCard(card)
            ? `${card.costAmount} ${formatElementLabel(card.costElement)} ready to spend.`
            : `Need ${card.costAmount} ${formatElementLabel(card.costElement)} to play this.`;
    }
    if (card.requiredComboSize) {
        return card.requiredComboSignature
            ? `Needs ${card.requiredComboSignature.split('+').map(formatElementLabel).join(' + ')}.`
            : `Needs a ${card.requiredComboSize}-element combo.`;
    }
    if (card.type === 'TRAP') {
        return 'Trap timing depends on the opponent meeting its trigger.';
    }
    if (card.type === 'SIEGLING') {
        if (card.evolvesFromName) {
            return `Evolution: ${card.evolvesFromName} must finish a full battle phase in its current form before you can play this on it.`;
        }
        return isPlacementBudgetLockedForCard(card)
            ? sieglingPlacementLockMessage()
            : 'Ready to place during setup if a legal anchor is open.';
    }
    return 'Ready to inspect or play.';
}

function renderDesktopMenuMeta() {
    const viewportChip = document.getElementById('desktopMenuViewport');
    const focusChip = document.getElementById('desktopMenuFocus');
    if (!viewportChip && !focusChip) {
        return;
    }

    if (viewportChip) {
        viewportChip.textContent = `${getViewportModeLabel()} ${window.innerWidth}x${window.innerHeight}`;
    }

    if (focusChip) {
        const focusedCard = getFocusedPreviewCard() || gameState?.player?.hand?.[0] || null;
        const lockReason = isPlayerHandCard(focusedCard) ? getHandCardLockReason(focusedCard) : '';
        focusChip.textContent = getFocusedCardSummary(focusedCard, lockReason);
    }
}

function renderDesktopActionHistory() {
    const history = document.getElementById('desktopActionHistory');
    if (!history) {
        return;
    }

    const battleLines = Array.isArray(gameState?.gameLog)
        ? gameState.gameLog.filter(isBattlePhaseLogEntry).slice(0, 5)
        : [];
    if (battleLines.length === 0) {
        history.innerHTML = `
            <div class="desktop-battle-log-title">Battle log</div>
            <div class="desktop-history-empty">The five most recent battle-phase events will show here once combat begins.</div>`;
        return;
    }

    history.innerHTML = `
        <div class="desktop-battle-log-title">Battle log</div>
        ${battleLines.map((entry, index) => `
        <div class="desktop-history-entry${index === 0 ? ' current' : ''}">
            <span class="desktop-history-dot"></span>
            <span>${escapeHtml(entry)}</span>
        </div>`).join('')}`;
}

function syncFocusedEnergyCue() {
    const playerEnergy = document.getElementById('playerEnergy');
    if (!playerEnergy) {
        return;
    }

    playerEnergy.classList.remove('tb-energy-focus-affordable', 'tb-energy-focus-unaffordable');
    playerEnergy.removeAttribute('title');

    const focusedCard = getFocusedPreviewCard() || gameState?.player?.hand?.[0] || null;
    if (!isPlayerHandCard(focusedCard) || !focusedCard?.costElement || !focusedCard?.costAmount) {
        return;
    }

    const affordable = canAffordCard(focusedCard);
    playerEnergy.classList.add(affordable ? 'tb-energy-focus-affordable' : 'tb-energy-focus-unaffordable');
    playerEnergy.title = affordable
        ? `${focusedCard.name}: ${focusedCard.costAmount} ${formatElementLabel(focusedCard.costElement)} ready.`
        : `${focusedCard.name}: need ${focusedCard.costAmount} ${formatElementLabel(focusedCard.costElement)}.`;
}

function renderDesktopCardPreviewPanel() {
    const panel = document.getElementById('desktopCardPreviewPanel');
    if (!panel) {
        return;
    }

    const focusedCard = getFocusedPreviewCard() || gameState?.player?.hand?.[0] || null;
    if (!focusedCard) {
        panel.innerHTML = '<div class="desktop-empty-state">Hover or click a Siegling on either board, or select a hand card, to inspect it here.</div>';
        return;
    }

    const lockReason = isPlayerHandCard(focusedCard) ? getHandCardLockReason(focusedCard) : '';
    const abilities = getCardAbilities(focusedCard)
        .map(ability => ability?.description || ability?.name || '')
        .filter(Boolean);
    const detailEntries = getCardPreviewEntries(focusedCard);
    const summaryText = abilities[0] || getBuilderCardSummaryText(focusedCard) || 'No special text.';

    let html = '<div class="desktop-preview-layout">';
    html += renderShowcaseCard(focusedCard, {
        cardClass: 'selected-preview-card desktop-preview-card',
        artVariant: 'selected',
        bodyMode: 'summary'
    });
    html += '<div class="desktop-preview-copy-panel">';
    html += `<div class="desktop-preview-kicker">${escapeHtml(formatElementLabel(focusedCard.element))}</div>`;
    html += `<div class="desktop-preview-title">${escapeHtml(focusedCard.name)}</div>`;
    html += `<div class="desktop-preview-meta">${escapeHtml(focusedCard.type)} / ${escapeHtml(focusedCard.rarity)}</div>`;
    if (focusedCard.type === 'SIEGLING') {
        html += `<div class="desktop-preview-stats">Health ${escapeHtml(String(focusedCard.health ?? focusedCard.hp ?? '?'))} | Speed ${escapeHtml(String(focusedCard.speed ?? focusedCard.spd ?? '?'))}</div>`;
    } else if (focusedCard.costElement && focusedCard.costAmount > 0) {
        html += `<div class="desktop-preview-stats">${escapeHtml(formatElementLabel(focusedCard.costElement))} Cost ${escapeHtml(focusedCard.costAmount)}</div>`;
    }
    const flavorBlock = detailEntries.filter((e) => e.isAbilityFlavor).map((e) => e.html).join('');
    html += flavorBlock
        ? `<div class="desktop-preview-description desktop-preview-flavor">${flavorBlock}</div>`
        : `<div class="desktop-preview-description">${escapeHtml(summaryText)}</div>`;
    const tagEntries = detailEntries.filter((e) => !e.isAbilityFlavor);
    if (tagEntries.length > 0) {
        html += '<div class="desktop-preview-tag-list">';
        tagEntries.forEach((entry) => {
            html += `<div class="desktop-preview-tag">${escapeHtml(entry.text)}</div>`;
        });
        html += '</div>';
    }
    html += `<div class="desktop-preview-note">${escapeHtml(getDesktopPreviewNote(focusedCard, lockReason))}</div>`;
    html += '</div>';
    html += '</div>';

    panel.innerHTML = html;
    scheduleDesktopPreviewCardScale();
}

function scheduleDesktopPreviewCardScale() {
    if (previewCardScaleFrame != null) {
        window.cancelAnimationFrame(previewCardScaleFrame);
    }
    previewCardScaleFrame = window.requestAnimationFrame(() => {
        previewCardScaleFrame = null;
        syncDesktopPreviewCardScale();
    });
}

function syncDesktopPreviewCardScale() {
    if (!isDesktopSidebarLayout() || desktopInspectTab !== 'card') {
        return;
    }

    const panel = document.getElementById('desktopCardPreviewPanel');
    const layout = panel?.querySelector('.desktop-preview-layout');
    const card = panel?.querySelector('.desktop-preview-card');
    if (!panel || !layout || !card || panel.closest('[hidden]')) {
        return;
    }

    const panelRect = panel.getBoundingClientRect();
    if (panelRect.width <= 0 || panelRect.height <= 0) {
        return;
    }

    const panelStyles = window.getComputedStyle(panel);
    const paddingTop = parseFloat(panelStyles.paddingTop) || 0;
    const paddingBottom = parseFloat(panelStyles.paddingBottom) || 0;
    const paddingLeft = parseFloat(panelStyles.paddingLeft) || 0;
    const paddingRight = parseFloat(panelStyles.paddingRight) || 0;
    const contentHeight = panel.clientHeight - paddingTop - paddingBottom;
    const contentWidth = panel.clientWidth - paddingLeft - paddingRight;
    if (!Number.isFinite(contentHeight) || !Number.isFinite(contentWidth) || contentHeight <= 80 || contentWidth <= 160) {
        return;
    }

    const layoutStyles = window.getComputedStyle(layout);
    const columnGap = parseFloat(layoutStyles.columnGap) || parseFloat(layoutStyles.gap) || 0;
    const copyColumnReserve = Math.round(clampNumber(contentWidth * 0.34, 170, 260));
    const maxWidthFromPanel = Math.max(96, contentWidth - columnGap - copyColumnReserve);
    const heightBasedWidth = contentHeight * (5 / 7);
    const nextWidth = Math.round(clampNumber(heightBasedWidth, 128, maxWidthFromPanel));
    const nextHeight = Math.round(nextWidth * (7 / 5));

    const root = document.documentElement;
    root.style.setProperty('--desktop-preview-card-width', `${nextWidth}px`);
    root.style.setProperty('--desktop-preview-card-max-height', `${nextHeight}px`);
}

function summarizeDeckCards(cards) {
    const grouped = new Map();
    for (const card of cards || []) {
        const key = `${card.name}::${card.type}::${card.element}::${card.rarity}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.count += 1;
            continue;
        }
        grouped.set(key, {
            name: card.name || 'Unknown',
            type: card.type || '',
            element: card.element || 'NEUTRAL',
            rarity: card.rarity || '',
            count: 1
        });
    }
    return [...grouped.values()].sort((left, right) => {
        const nameDiff = String(left.name).localeCompare(String(right.name));
        if (nameDiff !== 0) {
            return nameDiff;
        }
        const typeDiff = String(left.type).localeCompare(String(right.type));
        if (typeDiff !== 0) {
            return typeDiff;
        }
        return String(left.element).localeCompare(String(right.element));
    });
}

const DESKTOP_DECK_RARITY_ORDER = ['LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
const DESKTOP_DECK_TYPE_ORDER = ['SPELL', 'TRAP', 'SIEGLING'];

function getDeckRarityRank(rarity) {
    const idx = DESKTOP_DECK_RARITY_ORDER.indexOf(String(rarity || '').toUpperCase());
    return idx === -1 ? DESKTOP_DECK_RARITY_ORDER.length : idx;
}

function getDeckTypeRank(type) {
    const idx = DESKTOP_DECK_TYPE_ORDER.indexOf(String(type || '').toUpperCase());
    return idx === -1 ? DESKTOP_DECK_TYPE_ORDER.length : idx;
}

function formatDeckSectionLabel(type) {
    switch (String(type || '').toUpperCase()) {
        case 'SPELL':
            return 'Spells';
        case 'TRAP':
            return 'Traps';
        case 'SIEGLING':
            return 'Sieglings';
        default:
            return type || 'Cards';
    }
}

function getDeckCardMonogram(name) {
    const words = String(name || '')
        .split(/[^A-Za-z0-9]+/)
        .map(word => word.trim())
        .filter(Boolean);
    if (words.length === 0) {
        return '??';
    }
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function groupDeckRowsByTier(rows) {
    const rarityMap = new Map();
    rows.forEach(row => {
        const rarityKey = String(row.rarity || 'COMMON').toUpperCase();
        if (!rarityMap.has(rarityKey)) {
            rarityMap.set(rarityKey, new Map());
        }
        const typeMap = rarityMap.get(rarityKey);
        const typeKey = String(row.type || 'CARD').toUpperCase();
        if (!typeMap.has(typeKey)) {
            typeMap.set(typeKey, []);
        }
        typeMap.get(typeKey).push(row);
    });

    return [...rarityMap.entries()]
        .sort((left, right) => getDeckRarityRank(left[0]) - getDeckRarityRank(right[0]))
        .map(([rarity, typeMap]) => ({
            rarity,
            typeGroups: [...typeMap.entries()]
                .sort((left, right) => getDeckTypeRank(left[0]) - getDeckTypeRank(right[0]))
                .map(([type, cards]) => ({
                    type,
                    cards: cards.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
                }))
        }));
}

function renderDesktopDeckPreview() {
    const panel = document.getElementById('desktopDeckPreview');
    if (!panel) {
        return;
    }

    const remainingDeck = Array.isArray(gameState?.player?.remainingDeck) ? gameState.player.remainingDeck : [];
    if (remainingDeck.length === 0) {
        panel.innerHTML = '<div class="desktop-empty-state">No cards remain in your deck.</div>';
        return;
    }

    const rows = summarizeDeckCards(remainingDeck);
    const tiers = groupDeckRowsByTier(rows);
    let html = `<div class="desktop-deck-meta"><strong>${remainingDeck.length}</strong> cards remaining</div>`;
    html += '<div class="desktop-deck-list">';
    tiers.forEach(tier => {
        const rarityClass = String(tier.rarity || 'common').toLowerCase();
        const tierCount = tier.typeGroups.reduce((sum, group) => sum + group.cards.reduce((groupSum, card) => groupSum + Number(card.count || 0), 0), 0);
        html += `
            <section class="desktop-deck-tier rarity-${escapeHtml(rarityClass)}">
                <div class="desktop-deck-tier-header">
                    <div class="desktop-deck-tier-name">${escapeHtml(tier.rarity)}</div>
                    <div class="desktop-deck-tier-count">${escapeHtml(String(tierCount))} cards</div>
                </div>
        `;
        tier.typeGroups.forEach(group => {
            html += `
                <div class="desktop-deck-type-group">
                    <div class="desktop-deck-type-label">${escapeHtml(formatDeckSectionLabel(group.type))}</div>
                    <div class="desktop-deck-icon-row">
            `;
            group.cards.forEach(card => {
                const elementClass = String(card.element || 'neutral').toLowerCase();
                const monogram = getDeckCardMonogram(card.name);
                html += `
                    <div class="desktop-deck-icon-card ${escapeHtml(elementClass)}" title="${escapeHtml(card.name)} (${escapeHtml(card.type)} / ${escapeHtml(formatElementLabel(card.element))}) x${escapeHtml(String(card.count))}">
                        <span class="desktop-deck-icon-badge">x${escapeHtml(String(card.count))}</span>
                        <div class="desktop-deck-icon-face">${escapeHtml(monogram)}</div>
                        <div class="desktop-deck-icon-type">${escapeHtml(group.type)}</div>
                    </div>
                `;
            });
            html += `
                    </div>
                </div>
            `;
        });
        html += '</section>';
    });
    html += '</div>';
    panel.innerHTML = html;
}

/* ============================================================
   COMPACT ENERGY RENDERING â€” for top-bar tokens
   ============================================================ */
function renderEnergyTopBar(containerId, playerData) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const tokens = buildEnergyTokens(playerData);
    if (tokens.length === 0) {
        el.innerHTML = '';
        return;
    }
    // Group solid tokens by element; combo tokens stay individual
    const counts = {};
    const combos = [];
    for (const t of tokens) {
        if (t.type === 'combo') { combos.push(t); continue; }
        counts[t.key] = (counts[t.key] || 0) + 1;
    }
    let html = '';
    for (const [key, count] of Object.entries(counts)) {
        if (count >= 5) {
            html += `<span class="tb-energy-compact"><span class="energy-token solid-token token-${key}"></span><span class="tb-ecount">${count}</span></span>`;
        } else {
            for (let i = 0; i < count; i++) {
                html += `<div class="energy-token solid-token token-${key}"></div>`;
            }
        }
    }
    for (const t of combos) {
        html += renderEnergyToken(t);
    }
    el.innerHTML = html;
}

function loadSavedMultiplayerSession() {
    try {
        const raw = localStorage.getItem('sieglingsMultiplayerSession');
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveMultiplayerSession() {
    if (!multiplayerSession) {
        localStorage.removeItem('sieglingsMultiplayerSession');
        return;
    }
    localStorage.setItem('sieglingsMultiplayerSession', JSON.stringify(multiplayerSession));
}

function clearMultiplayerSession() {
    multiplayerSession = null;
    currentRoomStatus = null;
    clearRoomPolling();
    saveMultiplayerSession();
}

function clearRoomPolling() {
    if (roomPollHandle) {
        clearInterval(roomPollHandle);
        roomPollHandle = null;
    }
}

function loadSavedAuthToken() {
    try {
        return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
}

function saveAuthToken(token) {
    authState.token = token || '';
    try {
        if (!authState.token) {
            localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            return;
        }
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authState.token);
    } catch (e) {
        console.warn('Unable to save auth token.', e);
    }
}

function clearAuthState() {
    saveAuthToken('');
    authState.profile = null;
    authState.error = '';
    selectedSavedDeckId = null;
    renderWelcomeAuth();
    renderSavedDecks();
}

function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (authState.token && !headers.Authorization) {
        headers.Authorization = `Bearer ${authState.token}`;
    }
    return headers;
}

function getJoinRoomCodeFromUrl() {
    return new URLSearchParams(window.location.search).get('room');
}

function isInviteJoinFlow() {
    return Boolean(getJoinRoomCodeFromUrl());
}

function loadSavedPlayerName() {
    try {
        return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
}

function savePlayerName(name) {
    try {
        if (!name) {
            localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
            return;
        }
        localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
    } catch (e) {
        console.warn('Unable to save player name.', e);
    }
}

function hydrateSavedPlayerName() {
    const input = document.getElementById('playerNameInput');
    if (input && !input.value) {
        input.value = loadSavedPlayerName() || authState.profile?.user?.displayName || '';
    }
}

function onPlayerNameInput() {
    savePlayerName(getCurrentPlayerName());
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function syncEntryOverlays() {
    const welcomeOverlay = document.getElementById('welcomeOverlay');
    const loadoutOverlay = document.getElementById('loadoutOverlay');
    const mulliganOverlay = document.getElementById('mulliganOverlay');
    const showingGameplay = Boolean(gameState);
    const welcomeVisible = !showingGameplay && !welcomeDismissed;

    welcomeOverlay?.classList.toggle('visible', welcomeVisible);
    loadoutOverlay?.classList.toggle('visible', !showingGameplay && welcomeDismissed);
    if (!gameState?.mulligan?.active) {
        mulliganOverlay?.classList.remove('visible');
    }
    if (welcomeVisible) {
        refreshWelcomeLeaderboards();
    }
}

function localCalendarDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function refreshWelcomeLeaderboards() {
    const section = document.getElementById('welcomeLeaderboardsSection');
    if (!section) {
        return;
    }
    const today = localCalendarDateKey();
    let loadedFromCache = false;
    welcomeLeaderboardState.error = '';
    try {
        const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.date === today && parsed.payload && parsed.payload.boards) {
                welcomeLeaderboardState.data = parsed.payload;
                loadedFromCache = true;
                renderWelcomeLeaderboards();
            }
        }
    } catch {
        /* ignore cache parse errors */
    }
    if (!loadedFromCache) {
        void fetchWelcomeLeaderboardsNetwork(today);
    }
}

async function fetchWelcomeLeaderboardsNetwork(today) {
    if (welcomeLeaderboardState.loading) {
        return;
    }
    welcomeLeaderboardState.loading = true;
    welcomeLeaderboardState.error = '';
    renderWelcomeLeaderboards();
    const data = await fetchJson(apiUrls('/api/leaderboards'), { method: 'GET' });
    welcomeLeaderboardState.loading = false;
    if (data && data.boards) {
        welcomeLeaderboardState.data = data;
        try {
            localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify({ date: today, payload: data }));
        } catch {
            /* storage full or disabled */
        }
    } else {
        welcomeLeaderboardState.error = (data && data.error) || 'Unable to load leaderboards.';
    }
    renderWelcomeLeaderboards();
}

function setWelcomeLeaderboardTab(tabId) {
    welcomeLeaderboardState.tab = tabId;
    renderWelcomeLeaderboards();
}

function renderWelcomeLeaderboards() {
    const meta = document.getElementById('welcomeLeaderboardsMeta');
    const tabsEl = document.getElementById('welcomeLeaderboardsTabs');
    const body = document.getElementById('welcomeLeaderboardsBody');
    if (!meta || !tabsEl || !body) {
        return;
    }

    const boards = welcomeLeaderboardState.data?.boards;
    const tz = welcomeLeaderboardState.data?.timeZone || 'UTC';
    const gen = welcomeLeaderboardState.data?.generatedAt;
    if (gen) {
        let label = gen;
        try {
            label = new Date(gen).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        } catch {
            /* keep raw */
        }
        meta.textContent = `Last updated: ${label} (${tz})`;
    } else {
        meta.textContent = '';
    }

    if (boards && !boards[welcomeLeaderboardState.tab]) {
        welcomeLeaderboardState.tab = 'wins';
    }

    if (welcomeLeaderboardState.error && !boards) {
        meta.textContent = welcomeLeaderboardState.error;
    }

    tabsEl.innerHTML = LEADERBOARD_TABS.map((t) => {
        const active = welcomeLeaderboardState.tab === t.id ? ' active' : '';
        return `<button type="button" class="welcome-lb-tab${active}" role="tab" aria-selected="${welcomeLeaderboardState.tab === t.id}" onclick="setWelcomeLeaderboardTab('${t.id}')">${escapeHtml(t.label)}</button>`;
    }).join('');

    if (welcomeLeaderboardState.loading && !boards) {
        body.innerHTML = '<div class="welcome-lb-loading">Loading rankings…</div>';
        return;
    }

    if (!boards) {
        body.innerHTML = '<div class="welcome-lb-empty">No leaderboard data yet.</div>';
        return;
    }

    const rows = boards[welcomeLeaderboardState.tab] || [];
    const isPvp = welcomeLeaderboardState.tab === 'pvpWinRate';
    const statLabel = isPvp ? 'Record' : 'Total';

    if (rows.length === 0) {
        body.innerHTML = '<div class="welcome-lb-empty">No players in this category yet.</div>';
        return;
    }

    const head = `<div class="welcome-lb-head"><span>#</span><span>Player</span><span>${statLabel}</span></div>`;
    const list = rows.map((row) => {
        const display = isPvp && row.detail ? escapeHtml(String(row.detail)) : escapeHtml(String(row.value ?? ''));
        return `<div class="welcome-lb-row"><span class="lb-rank">${row.rank}</span><span class="lb-name">${escapeHtml(row.displayName)}</span><span class="lb-val">${display}</span></div>`;
    }).join('');
    body.innerHTML = `<div class="welcome-lb-table">${head}${list}</div>`;
}

function renderWelcomeTutorial() {
    const stage = document.getElementById('welcomeTutorialStage');
    const dots = document.getElementById('welcomeTutorialDots');
    const slide = WELCOME_SLIDES[welcomeSlideIndex];
    if (!stage || !dots || !slide) {
        return;
    }

    stage.innerHTML = `
        <div class="welcome-slide-card">
            <div class="welcome-slide-title">${slide.title}</div>
            <div class="welcome-slide-copy">${slide.copy}</div>
            ${slide.visual}
        </div>
    `;

    dots.innerHTML = WELCOME_SLIDES.map((item, index) => {
        const active = index === welcomeSlideIndex ? ' active' : '';
        return `<button class="welcome-dot${active}" type="button" aria-label="Go to tutorial slide ${index + 1}" onclick="jumpWelcomeSlide(${index})"></button>`;
    }).join('');
}

function jumpWelcomeSlide(index) {
    welcomeSlideIndex = Math.max(0, Math.min(WELCOME_SLIDES.length - 1, index));
    renderWelcomeTutorial();
}

function stepWelcomeSlide(direction) {
    const nextIndex = welcomeSlideIndex + direction;
    if (nextIndex < 0 || nextIndex >= WELCOME_SLIDES.length) {
        return;
    }
    welcomeSlideIndex = nextIndex;
    renderWelcomeTutorial();
}

function dismissWelcome() {
    welcomeDismissed = true;
    syncEntryOverlays();
    if (gameOptions) {
        renderLoadoutOptions();
        updateLoadoutSummary();
    }
}

function playAsGuest() {
    authState.error = '';
    dismissWelcome();
}

function setAuthMode(mode) {
    authMode = mode;
    authState.error = '';
    renderWelcomeAuth();
}

async function submitAuth(mode) {
    const email = document.getElementById('welcomeEmailInput')?.value?.trim() || '';
    const password = document.getElementById('welcomePasswordInput')?.value || '';
    const displayName = document.getElementById('welcomeDisplayNameInput')?.value?.trim() || '';
    const resetCode = document.getElementById('welcomeResetCodeInput')?.value || '';
    authState.loading = true;
    authState.error = '';
    renderWelcomeAuth();

    const body = mode === 'register'
        ? { email, password, displayName }
        : mode === 'reset-password'
        ? { email, password, resetCode }
        : { email, password };
    const endpoint = mode === 'reset-password' ? '/api/auth/reset-password' : `/api/auth/${mode}`;
    const data = await fetchJson(apiUrls(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    authState.loading = false;
    if (!data || data.error || !data.authenticated) {
        authState.error = data?.error || 'Unable to sign in right now.';
        renderWelcomeAuth();
        return;
    }

    saveAuthToken(data.token || '');
    authState.profile = data;
    authState.error = '';
    hydrateSavedPlayerName();
    renderWelcomeAuth();
    renderSavedDecks();
    renderLoadoutOptions();
    updateLoadoutSummary();
}

async function syncAuthProfile(silent = false) {
    if (!authState.token) {
        authState.profile = null;
        if (!silent) {
            renderWelcomeAuth();
            renderSavedDecks();
        }
        return false;
    }

    authState.loading = !silent;
    if (!silent) {
        renderWelcomeAuth();
    }

    const data = await fetchJson(apiUrls('/api/auth/me'), { method: 'GET' });
    authState.loading = false;
    if (!data || !data.authenticated) {
        clearAuthState();
        return false;
    }

    authState.profile = data;
    authState.error = '';
    renderWelcomeAuth();
    renderSavedDecks();
    hydrateSavedPlayerName();
    return true;
}

async function logoutAccount() {
    await fetchJson(apiUrls('/api/auth/logout'), { method: 'POST' });
    clearAuthState();
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function renderWelcomeAuth() {
    const authCard = document.getElementById('welcomeAuthCard');
    const historyCard = document.getElementById('welcomeHistoryCard');
    if (!authCard || !historyCard) {
        return;
    }

    if (authState.profile?.authenticated) {
        const savedDeckCount = authState.profile.savedDecks?.length || 0;
        const historyCount = authState.profile.matchHistory?.length || 0;
        authCard.innerHTML = `
            <div class="welcome-card-kicker">Account Linked</div>
            <h3>${escapeHtml(authState.profile.user.displayName)}</h3>
            <div class="welcome-auth-meta">${escapeHtml(authState.profile.user.email)}</div>
            <div class="welcome-stat-grid">
                <div class="welcome-stat"><strong>${savedDeckCount}</strong><span>saved decks</span></div>
                <div class="welcome-stat"><strong>${historyCount}</strong><span>recent matches</span></div>
            </div>
            <div class="welcome-auth-actions">
                <button class="btn" type="button" onclick="logoutAccount()">Log Out</button>
                <button class="btn btn-primary" type="button" onclick="dismissWelcome()">Continue</button>
            </div>
        `;

        const recent = authState.profile.matchHistory || [];
        historyCard.innerHTML = `
            <div class="welcome-card-kicker">Recent Battles</div>
            <h3>Match history follows this login</h3>
            ${recent.length > 0
                ? `<div class="welcome-history-list">${recent.slice(0, 4).map(entry => `
                    <div class="welcome-history-row">
                        <strong>${escapeHtml(entry.result)}</strong>
                        <span>${escapeHtml(entry.loadoutLabel)} vs ${escapeHtml(entry.opponentName)}</span>
                    </div>
                `).join('')}</div>`
                : '<div class="identity-note">Your finished games will appear here after the first recorded match.</div>'}
        `;
        return;
    }

    const draftEmail = document.getElementById('welcomeEmailInput')?.value || '';
    const draftDisplayName = document.getElementById('welcomeDisplayNameInput')?.value || '';
    const draftPassword = document.getElementById('welcomePasswordInput')?.value || '';
    const draftResetCode = document.getElementById('welcomeResetCodeInput')?.value || '';
    const authTitle = authMode === 'login'
        ? 'Pick up where you left off'
        : authMode === 'register'
        ? 'Save decks with your email'
        : 'Set a new password';

    authCard.innerHTML = `
        <div class="welcome-eyebrow">ACCOUNT</div>
        <h3>${authMode === 'login' ? 'Pick up where you left off' : 'Save decks with your email'}</h3>
        <div class="welcome-auth-tabs">
            <button class="welcome-auth-tab${authMode === 'login' ? ' active' : ''}" type="button" aria-selected="${authMode === 'login'}" onclick="setAuthMode('login')">Log In</button>
            <button class="welcome-auth-tab${authMode === 'register' ? ' active' : ''}" type="button" aria-selected="${authMode === 'register'}" onclick="setAuthMode('register')">Register</button>
        </div>
        <label class="online-field">
            <span>Email</span>
            <input type="email" id="welcomeEmailInput" placeholder="you@example.com" value="${escapeHtmlAttribute(draftEmail)}">
        </label>
        ${authMode === 'register' ? `
            <label class="online-field">
                <span>Display Name</span>
                <input type="text" id="welcomeDisplayNameInput" maxlength="20" placeholder="Arena name" value="${escapeHtmlAttribute(draftDisplayName)}">
            </label>
        ` : ''}
        ${authMode === 'reset-password' ? `
            <label class="online-field">
                <span>Reset Code</span>
                <input type="password" id="welcomeResetCodeInput" placeholder="Server recovery code" value="${escapeHtmlAttribute(draftResetCode)}">
            </label>
        ` : ''}
        <label class="online-field">
            <span>${authMode === 'reset-password' ? 'New Password' : 'Password'}</span>
            <input type="password" id="welcomePasswordInput" placeholder="At least 6 characters" value="${escapeHtmlAttribute(draftPassword)}">
        </label>
        ${authState.error ? `<div class="welcome-auth-error">${escapeHtml(authState.error)}</div>` : ''}
        <div class="welcome-auth-actions">
            <button class="btn btn-primary welcome-auth-submit" type="button" ${authState.loading ? 'disabled' : ''} onclick="submitAuth('${authMode}')">
                ${authState.loading ? 'Working...' : (authMode === 'login' ? 'Log In' : 'Create Account')}
            </button>
            <button class="btn welcome-guest-btn" type="button" ${authState.loading ? 'disabled' : ''} onclick="playAsGuest()">Play as Guest</button>
        </div>
    `;

    historyCard.innerHTML = `
        <div class="welcome-eyebrow">WHY SIGN IN</div>
        <h3>Keep your armory between sessions</h3>
        <div class="welcome-benefits">
            <div class="welcome-benefit">Save custom decks and named loadouts.</div>
            <div class="welcome-benefit">Track your wins, matches, and deck history.</div>
            <div class="welcome-benefit">Rejoin the arena with your builds intact.</div>
        </div>
    `;
}

function renderSavedDecks() {
    const section = document.getElementById('savedDecksSection');
    const list = document.getElementById('savedDeckList');
    const input = document.getElementById('saveDeckNameInput');
    if (!section || !list || !input) {
        return;
    }

    const savedDecks = authState.profile?.savedDecks || [];
    section.classList.toggle('hidden', !authState.profile?.authenticated);
    if (!authState.profile?.authenticated) {
        list.innerHTML = '';
        input.value = '';
        return;
    }

    const selectedSavedDeck = savedDecks.find(deck => deck.id === selectedSavedDeckId);
    if (document.activeElement !== input) {
        input.value = selectedSavedDeck?.name || input.value || getActiveLoadoutLabel() || '';
    }
    list.innerHTML = savedDecks.length > 0
        ? savedDecks.map(deck => `
            <div class="saved-deck-row${deck.id === selectedSavedDeckId ? ' active' : ''}">
                <div class="saved-deck-copy">
                    <strong>${escapeHtml(deck.name)}</strong>
                    <span>${escapeHtml(deck.custom ? `Custom build (${deck.customDeckCards.length} cards)` : (deck.deckName || 'Preset deck'))} | ${escapeHtml(deck.trainerName || 'SiegeKnight')}</span>
                </div>
                <div class="saved-deck-row-actions">
                    <button class="btn" type="button" onclick="loadSavedDeck('${deck.id}')">Load</button>
                    <button class="btn" type="button" onclick="deleteSavedDeck('${deck.id}')">Delete</button>
                </div>
            </div>
        `).join('')
        : `<div class="builder-empty">Save your current loadout and it will appear here for future logins.</div>`;
}

function buildCountsFromCardList(cardIds) {
    return (cardIds || []).reduce((counts, cardId) => {
        counts[cardId] = (counts[cardId] || 0) + 1;
        return counts;
    }, {});
}

function detachSavedDeckSelection() {
    selectedSavedDeckId = null;
}

function getActiveLoadoutLabel() {
    const savedDeck = authState.profile?.savedDecks?.find(deck => deck.id === selectedSavedDeckId);
    if (savedDeck) {
        return savedDeck.name;
    }
    const saveName = document.getElementById('saveDeckNameInput')?.value?.trim();
    if (saveName) {
        return saveName;
    }
    if (loadoutMode === 'preset') {
        return gameOptions?.decks?.find(deck => deck.id === selectedDeckId)?.name || '';
    }
    return 'Custom Loadout';
}

async function saveCurrentLoadout() {
    if (!authState.profile?.authenticated) {
        authState.error = 'Sign in first to save decks to your account.';
        renderWelcomeAuth();
        return;
    }

    const name = document.getElementById('saveDeckNameInput')?.value?.trim() || getActiveLoadoutLabel();
    const body = {
        id: selectedSavedDeckId,
        ...getSelectedLoadoutBody(),
        name
    };
    const data = await fetchJson(apiUrls('/api/profile/decks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!data || data.error) {
        authState.error = data?.error || 'Unable to save that deck right now.';
        renderWelcomeAuth();
        return;
    }

    authState.profile = data;
    const matchingDeck = authState.profile.savedDecks.find(deck => deck.name === name);
    selectedSavedDeckId = matchingDeck?.id || selectedSavedDeckId;
    authState.error = '';
    renderWelcomeAuth();
    renderSavedDecks();
}

function loadSavedDeck(deckId) {
    const savedDeck = authState.profile?.savedDecks?.find(deck => deck.id === deckId);
    if (!savedDeck) {
        return;
    }

    selectedSavedDeckId = deckId;
    selectedTrainerId = savedDeck.trainerId;
    if (savedDeck.custom) {
        loadoutMode = 'builder';
        builderCounts = buildCountsFromCardList(savedDeck.customDeckCards);
    } else {
        loadoutMode = 'preset';
        builderCounts = {};
        selectedDeckId = savedDeck.deckId;
    }

    const input = document.getElementById('saveDeckNameInput');
    if (input) {
        input.value = savedDeck.name;
    }
    renderLoadoutOptions();
    updateLoadoutSummary();
}

async function deleteSavedDeck(deckId) {
    if (!authState.profile?.authenticated) {
        return;
    }
    const data = await fetchJson(apiUrls('/api/profile/decks/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deckId })
    });
    if (!data || data.error) {
        authState.error = data?.error || 'Unable to delete that deck right now.';
        renderWelcomeAuth();
        return;
    }
    if (selectedSavedDeckId === deckId) {
        selectedSavedDeckId = null;
    }
    authState.profile = data;
    renderWelcomeAuth();
    renderSavedDecks();
    updateLoadoutSummary();
}

function maybeRefreshProfileAfterGame() {
    if (!authState.token || !gameState?.gameOver) {
        return;
    }
    const refreshKey = `${gameState.turnNumber}:${gameState.winner}:${gameState.playerName}:${gameState.enemyName}`;
    if (refreshKey === lastProfileRefreshKey) {
        return;
    }
    lastProfileRefreshKey = refreshKey;
    syncAuthProfile(true);
}

function isOpeningPlacementOnlyTurn() {
    return gameState
        && gameState.turnNumber === 1
        && gameState.currentPhase === 'SETUP'
        && gameState.activeSide === 'PLAYER'
        && gameState.firstPlayer === 'PLAYER'
        && gameState.setupTurnsTakenThisRound === 0;
}

function isHandHiddenForPhase() {
    return Boolean(gameState && gameState.currentPhase === 'BATTLE' && !battleHandViewOpen);
}

function isPlacementSelectionActive() {
    return Boolean(
        gameState
        && gameState.currentPhase === 'SETUP'
        && selectedCard
        && selectedCard.type === 'SIEGLING'
        && !isPlacementBudgetLockedForCard(selectedCard)
        && !targetMode
        && getLegalPlacementsForCard(selectedCard).length > 0
    );
}

function getPlayerEnergyAmount(element) {
    if (!gameState?.player || !element) {
        return 0;
    }
    const energyKey = `${String(element).toLowerCase()}Energy`;
    return Number(gameState.player[energyKey] || 0);
}

function canAffordCard(card) {
    if (!card?.costElement || !card.costAmount) {
        return true;
    }
    return getPlayerEnergyAmount(card.costElement) >= Number(card.costAmount);
}

function countBoardSieglings(board = gameState?.playerBoard || []) {
    return (board || []).reduce((count, row) => count + (row || []).filter(Boolean).length, 0);
}

function getClaimableSieglings(board = gameState?.playerBoard || []) {
    if (!gameState || gameState.currentPhase !== 'SETUP' || gameState.activeSide !== 'PLAYER' || targetMode) {
        return [];
    }
    const claimable = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const cell = board?.[row]?.[col];
            if (cell && Number(cell.battlePhasesSeen || 0) > 0) {
                claimable.push([row, col]);
            }
        }
    }
    return claimable;
}

function getEvolutionPlacements(card, board = gameState?.playerBoard || []) {
    if (!card?.evolvesFromId) {
        return [];
    }

    const placements = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const cell = board?.[row]?.[col];
            if (cell
                && cell.cardId === card.evolvesFromId
                && Number(cell.battlePhasesSeen || 0) > 0) {
                placements.push([row, col]);
            }
        }
    }
    return placements;
}

function getEvolutionBaseCells(card, board = gameState?.playerBoard || []) {
    if (!card?.evolvesFromId) {
        return [];
    }
    const cells = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const cell = board?.[row]?.[col];
            if (cell && cell.cardId === card.evolvesFromId) {
                cells.push(cell);
            }
        }
    }
    return cells;
}

function getLegalPlacementsForCard(card, board = gameState?.playerBoard || []) {
    if (isPlacementBudgetLockedForCard(card) || !card || card.type !== 'SIEGLING') {
        return [];
    }

    const safeBoard = Array.isArray(board) && board.length ? board : [[], [], []];
    if (card.evolvesFromId) {
        return getEvolutionPlacements(card, safeBoard);
    }

    if (countBoardSieglings(safeBoard) >= 5) {
        return [];
    }

    const placements = [];
    const hasAnySiegling = safeBoard.some(row => row.some(cell => cell));

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            if (safeBoard[row][col]) continue;

            if (!hasAnySiegling || canCardLinkAt(card, row, col, safeBoard) || canCardAnchorToSocket(card, row, col)) {
                placements.push([row, col]);
            }
        }
    }

    return placements;
}

function playerMeetsSpellComboRequirement(card) {
    const needSize = Number(card?.requiredComboSize || 0);
    if (needSize <= 0) {
        return true;
    }
    const sig = card.requiredComboSignature;
    const points = gameState?.player?.comboPoints || [];
    return points.some((p) => Number(p.size) >= needSize
        && (!sig || !String(sig).trim() || p.signature === sig));
}

/** Mirrors EnergyService.canCastSpell status/combo gates (energy checked separately). */
function getSpellPlayRequirementLockReason(card) {
    if (!card || card.type !== 'SPELL') {
        return '';
    }
    if (card.requiredReaction && !gameState?.player?.mistActive) {
        return 'Requires Mist (Fire + Water lattice intersection active).';
    }
    const needSize = Number(card.requiredComboSize || 0);
    if (needSize > 0 && !playerMeetsSpellComboRequirement(card)) {
        if (card.requiredComboSignature) {
            const label = String(card.requiredComboSignature).split('+').map(formatElementLabel).join(' + ');
            return `Requires lattice combo: ${label}.`;
        }
        return `Requires a ${needSize}-element lattice combo on the board.`;
    }
    return '';
}

function getHandCardLockReason(card) {
    if (!gameState || !card) {
        return '';
    }
    if (isBoardPreviewCard(card)) {
        return 'This Siegling is already on the board.';
    }
    if (gameState.currentPhase === 'MULLIGAN') {
        return 'Choose cards to redraw (optional) or keep your opening hand.';
    }
    if (isHandHiddenForPhase()) {
        return 'Battle Action is active in the hand HUD during battle.';
    }
    if (targetMode) {
        if (targetContext?.mode === 'battle') {
            return 'Finish queueing the current battle action first.';
        }
        return 'Finish the current target selection first.';
    }
    if (isOpeningPlacementOnlyTurn() && card.type !== 'SIEGLING') {
        return 'Turn 1 starts with a Siegling placement.';
    }
    if (gameState.currentPhase !== 'SETUP') {
        return 'Cards can only be played during setup.';
    }
    if (card.type === 'SIEGLING' && countBoardSieglings() >= 5 && !card.evolvesFromId) {
        return 'Maxed out.';
    }
    if (!canAffordCard(card)) {
        return `Need ${card.costAmount} ${formatElementLabel(card.costElement)} energy to play this.`;
    }
    if (card.type === 'SPELL') {
        const spellReqLock = getSpellPlayRequirementLockReason(card);
        if (spellReqLock) {
            return spellReqLock;
        }
    }
    if (isActionCard(card) && !abilityHasAvailableTarget(card.ability)) {
        const targetSide = getAbilityTargetSide(card.ability);
        return targetSide ? `No ${targetSide} targets are available right now.` : 'This card has no valid target right now.';
    }
    if (isPlacementBudgetLockedForCard(card)) {
        return sieglingPlacementLockMessage();
    }
    if (card.type === 'SIEGLING' && card.evolvesFromId) {
        const baseCells = getEvolutionBaseCells(card);
        if (baseCells.length === 0) {
            return `Needs ${card.evolvesFromName || 'its base form'} on your board first.`;
        }
        if (getEvolutionPlacements(card).length === 0) {
            return `${card.evolvesFromName || 'Base form'} must complete a full battle phase in its current form before it can evolve.`;
        }
    }
    if (card.type === 'SIEGLING' && getLegalPlacementsForCard(card).length === 0) {
        return 'No legal placement available for this Siegling.';
    }
    return '';
}

function getInteractionBannerState() {
    if (!gameState) {
        return null;
    }
    if (gameState.mulligan?.active) {
        return {
            kind: 'place',
            label: 'Opening Hand',
            message: gameState.mulligan.youPending
                ? 'Tap cards to mark them for redraw, or keep the whole hand. You draw as many as you return.'
                : 'Opening hands are locking in. Waiting for the other player.'
        };
    }
    if (targetMode && targetContext) {
        return {
            kind: 'target',
            label: 'Targeting',
            message: targetContext.message
        };
    }
    if (isPlacementSelectionActive()) {
        return {
            kind: 'place',
            label: 'Placement',
            message: `Place ${selectedCard.name} on a highlighted slot.`
        };
    }
    if (gameState.currentPhase === 'SETUP' && gameState.playerPlacementUsed) {
        return {
            kind: 'locked',
            label: 'Setup actions done',
            message: 'No setup actions left this turn. Use your SiegeKnight ability or end the setup phase.'
        };
    }
    if (gameState.currentPhase === 'SETUP' && getClaimableSieglings().length > 0) {
        return {
            kind: 'place',
            label: 'Claim',
            message: 'Tap one of your battle-tested Sieglings to claim it and gain 1 temporary energy of its element this turn.'
        };
    }
    if (gameState.currentPhase === 'BATTLE') {
        return {
            kind: 'battle',
            label: 'Battle Action',
            message: gameState.pendingBattle
                ? 'Queue one action for the acting Siegling. The hand HUD now hosts the live battle queue.'
                : 'Battle is resolving in speed order. The hand HUD stays in queue mode until setup returns.'
        };
    }
    return null;
}

function renderInteractionBanner() {
    const banner = document.getElementById('interactionBanner');
    if (!banner) {
        return;
    }
    const state = getInteractionBannerState();
    if (!state) {
        banner.className = 'interaction-banner hidden';
        banner.innerHTML = '';
        return;
    }
    banner.className = `interaction-banner ${state.kind}`;
    banner.innerHTML = `<span class="interaction-banner-label">${state.label}</span><span>${state.message}</span>`;
}

function showTransientMessage(message, durationMs = 1400) {
    const context = targetContext;
    if (!context) {
        return;
    }
    const previousMessage = context.message;
    context.message = message;
    renderInteractionBanner();
    window.clearTimeout(transientMessageTimer);
    transientMessageTimer = window.setTimeout(() => {
        if (targetContext === context && context.message === message) {
            context.message = previousMessage;
            renderInteractionBanner();
        }
    }, durationMs);
}

function getInteractionCueKey() {
    if (!gameState) {
        return '';
    }
    if (targetMode && targetContext) {
        return `target:${targetContext.mode}:${targetContext.message}`;
    }
    if (isPlacementSelectionActive()) {
        return `place:${selectedCard.id}`;
    }
    if (gameState.currentPhase === 'SETUP' && gameState.playerPlacementUsed) {
        return `placement-used:${gameState.turnNumber}:${gameState.activeSide}`;
    }
    return '';
}

function maybeTriggerInteractionFeedback() {
    const cueKey = getInteractionCueKey();
    if (cueKey === lastInteractionCueKey) {
        return;
    }
    lastInteractionCueKey = cueKey;
    if (!cueKey || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return;
    }
    if (cueKey.startsWith('target:')) {
        navigator.vibrate([30, 45, 30]);
        return;
    }
    if (cueKey.startsWith('place:')) {
        navigator.vibrate(18);
        return;
    }
    navigator.vibrate([18, 30, 18]);
}

function applyInteractionState() {
    const body = document.body;
    const boardArea = document.getElementById('boardArea');
    const handArea = document.querySelector('.hand-area');
    const targetingActive = Boolean(targetMode && targetContext);
    const placementActive = isPlacementSelectionActive();
    const handHidden = isHandHiddenForPhase();
    const battlePhaseActive = Boolean(gameState && gameState.currentPhase === 'BATTLE');

    body.classList.toggle('targeting-active', targetingActive);
    body.classList.toggle('placement-active', placementActive);
    body.classList.toggle('battle-phase-active', battlePhaseActive);

    boardArea?.classList.toggle('targeting-active', targetingActive);
    boardArea?.classList.toggle('placement-active', placementActive);
    if (!targetingActive) {
        clearTargetingPreview();
    }

    handArea?.classList.toggle('battle-hidden', handHidden);
    handArea?.classList.toggle('interaction-locked', targetingActive);

    renderInteractionBanner();
    renderHintPanel();
    syncActionBarAttention();
    maybeTriggerInteractionFeedback();
}

/**
 * After a server refresh, hand slots are new object references; keep selection aligned to `selectedHandIndex`.
 */
function rebindSelectedHandSlotFromState() {
    if (selectedHandIndex == null || !gameState?.player?.hand) {
        return;
    }
    const h = gameState.player.hand;
    if (selectedHandIndex < 0 || selectedHandIndex >= h.length) {
        selectedHandIndex = null;
        selectedCard = null;
        return;
    }
    selectedCard = h[selectedHandIndex];
}

function resetInteractionState(shouldRender = true) {
    selectedCard = null;
    selectedHandIndex = null;
    hoveredBoardCard = null;
    clearArenaSelection();
    closeClaimPopup();
    clearTargetMode();
    updateSelectedInfo(null);
    if (shouldRender) {
        render();
    }
}

function cancelBattleAutoAdvance() {
    if (battleAutoAdvanceTimer != null) {
        window.clearTimeout(battleAutoAdvanceTimer);
        battleAutoAdvanceTimer = null;
    }
}

function shouldAutoAdvanceBattle() {
    return Boolean(
        gameState
        && gameState.currentPhase === 'BATTLE'
        && !gameState.gameOver
        && !gameState.pendingBattle
        && !gameState.battleWaitingOn
        && !window.SieglingsActionQueue?.isProcessing?.()
        && (!gameState.multiplayer || gameState.viewerSide === 'PLAYER')
        && !isBattleTargetSelectionActive()
    );
}

function scheduleBattleAutoAdvance() {
    if (!shouldAutoAdvanceBattle()) {
        cancelBattleAutoAdvance();
        return;
    }
    if (battleAutoAdvanceTimer != null || battleAutoAdvanceInFlight) {
        return;
    }
    battleAutoAdvanceTimer = window.setTimeout(async () => {
        battleAutoAdvanceTimer = null;
        if (!shouldAutoAdvanceBattle()) {
            return;
        }
        battleAutoAdvanceInFlight = true;
        try {
            await api('battle');
        } finally {
            battleAutoAdvanceInFlight = false;
            if (shouldAutoAdvanceBattle()) {
                scheduleBattleAutoAdvance();
            }
        }
    }, BATTLE_AUTO_ADVANCE_DELAY_MS);
}
window.scheduleBattleAutoAdvance = scheduleBattleAutoAdvance;

async function api(endpoint, method = 'POST', body = null, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    const opts = { method, headers: getAuthHeaders({ 'Content-Type': 'application/json' }) };
    if (multiplayerSession?.roomId && multiplayerSession?.playerToken) {
        opts.headers['X-Room-Id'] = multiplayerSession.roomId;
        opts.headers['X-Player-Token'] = multiplayerSession.playerToken;
    }
    if (body) opts.body = JSON.stringify(body);

    const data = await fetchJson(apiUrls('/api/game/' + endpoint), opts, timeoutMs);
    if (!data) {
        console.error('API error: request failed for', endpoint);
        if (endpoint === 'new') {
            showLoadoutLoadingError('Could not start the match. Is the server running? If you use a hosted build, check API settings.');
            syncEntryOverlays();
        }
        return null;
    }
    if (data.error) {
        console.error(data.error);
        if (endpoint === 'new') {
            showLoadoutLoadingError(String(data.error));
            syncEntryOverlays();
        }
        return null;
    }

    if (endpoint === 'new') {
        clearExternalSocketElementMemory();
    }

    const prevState = gameState;
    gameState = data;
    if (endpoint !== 'new' && prevState) {
        if (window.SieglingsActionQueue) {
            window.SieglingsActionQueue.enqueueFromStateDiff(prevState, data);
        } else {
            window.SieglingsFx?.onBoardUpdate(prevState, data);
        }
    }
    try {
        render();
    } catch (e) {
        console.error('render() failed after API success:', e);
        if (endpoint === 'new') {
            gameState = prevState;
            showLoadoutLoadingError('Could not show the game. See the browser console for details.');
            syncEntryOverlays();
        }
        throw e;
    }
    return data;
}

async function fetchJson(urlOrUrls, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
    let lastError = null;

    for (const url of urls) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(url, {
                ...options,
                headers: getAuthHeaders(options.headers || {}),
                signal: controller.signal
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            activeApiBaseUrl = resolveApiBaseUrl(url);
            return await resp.json();
        } catch (e) {
            lastError = e;
            console.warn('API request failed:', url, e);
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    console.error('API error:', lastError);
    return null;
}

function showLoadoutLoadingError(message) {
    loadoutErrorMessage = message;
    updateLoadoutSummary();
    syncEntryOverlays();
}

async function loadGameOptions() {
    try {
        renderWelcomeTutorial();
        renderWelcomeAuth();
        syncEntryOverlays();
        loadoutErrorMessage = '';
        updateLoadoutSummary();
        const [data, editorState] = await Promise.all([
            fetchJson(apiUrls('/api/game/options'), {}, LOADOUT_ACTION_TIMEOUT_MS),
            fetchJson(apiUrls('/api/cards/editor'), {}, LOADOUT_ACTION_TIMEOUT_MS),
            syncAuthProfile(true)
        ]);
        if (!data) {
            showLoadoutLoadingError('Unable to load deck and SiegeKnight choices. The backend is unavailable right now. Press retry once it comes back.');
            syncEntryOverlays();
            return;
        }
        gameOptions = filterGameOptionsToDashboardCards(data, editorState);
        loadoutErrorMessage = '';
        selectedDeckId = data.defaultDeckId;
        selectedTrainerId = data.defaultTrainerId;
        builderCounts = {};
        loadoutMode = 'preset';
        hydrateOnlineStateFromUrl();
        hydrateSavedPlayerName();
        renderWelcomeTutorial();
        renderWelcomeAuth();
        renderLoadoutOptions();
        updateLoadoutSummary();
        const resumed = await resumeMultiplayerSession();
        if (!resumed) {
            syncEntryOverlays();
        }
    } catch (e) {
        console.error('Failed to load game options:', e);
        showLoadoutLoadingError('Unable to load deck and SiegeKnight choices. The backend is unavailable right now. Press retry once it comes back.');
        syncEntryOverlays();
    }
}

function filterGameOptionsToDashboardCards(options, editorState) {
    const catalog = Array.isArray(options?.cardCatalog) ? options.cardCatalog : [];
    const dashboardCards = Array.isArray(editorState?.data?.cards) ? editorState.data.cards : [];
    if (!catalog.length || !dashboardCards.length) {
        return options;
    }

    const dashboardIds = new Set(
        dashboardCards
            .map(card => normalizeDashboardCardId(card?.id))
            .filter(Boolean)
    );
    if (dashboardIds.size === 0) {
        return options;
    }

    const filteredCatalog = catalog.filter(card => dashboardIds.has(normalizeDashboardCardId(card?.id)));
    if (filteredCatalog.length === 0) {
        return options;
    }
    if (filteredCatalog.length !== catalog.length) {
        console.info(`Filtered ${catalog.length - filteredCatalog.length} deleted dashboard card(s) from deck builder catalog.`);
    }
    return {
        ...options,
        cardCatalog: filteredCatalog
    };
}

function normalizeDashboardCardId(id) {
    const normalized = String(id || '').trim().toLowerCase();
    return normalized || null;
}

async function newGame() {
    clearMultiplayerSession();
    cancelBattleAutoAdvance();
    selectedCard = null;
    selectedHandIndex = null;
    clearTargetMode();
    const _gov = document.getElementById('gameOverOverlay');
    _gov.classList.remove('visible');
    delete _gov.dataset.soundPlayed;
    // Loading gate covers the request + first render. Opponent info is a
    // placeholder here because the server picks the AI knight; we'll let
    // the gate fade once the first state lands.
    if (window.SieglingsLoadingGate) {
        const trainer = gameOptions?.trainers?.find?.((t) => t.id === selectedTrainerId);
        window.SieglingsLoadingGate.show({
            player: {
                name: getCurrentPlayerName() || 'Player',
                element: trainer?.element || 'NEUTRAL',
                trainerName: trainer?.name || 'SiegeKnight'
            },
            opponent: {
                name: 'AI Opponent',
                element: 'SHADOW',
                trainerName: 'Mystery SiegeKnight'
            },
            minDurationMs: 2200
        });
    }
    const body = getSelectedLoadoutBody();
    let started = null;
    try {
        started = await api('new', 'POST', body, LOADOUT_ACTION_TIMEOUT_MS);
    } finally {
        // Update the gate with the real opponent info now that we know it,
        // then fade. minDurationMs inside the gate ensures players see the
        // splash even if the API came back instantly.
        if (window.SieglingsLoadingGate?.isVisible()) {
            const enemyTrainer = gameState?.enemy?.trainer;
            if (enemyTrainer && started) {
                window.SieglingsLoadingGate.show({
                    player: {
                        name: gameState?.playerName || getCurrentPlayerName() || 'Player',
                        element: gameState?.player?.trainer?.element || 'NEUTRAL',
                        trainerName: gameState?.player?.trainer?.name || 'SiegeKnight'
                    },
                    opponent: {
                        name: gameState?.enemyName || 'AI Opponent',
                        element: enemyTrainer.element || 'SHADOW',
                        trainerName: enemyTrainer.name || 'Mystery SiegeKnight'
                    },
                    minDurationMs: 600
                });
            }
            window.SieglingsLoadingGate.hide();
        }
    }
    if (!started) {
        return;
    }
}

function openLoadoutSelector() {
    clearMultiplayerSession();
    clearExternalSocketElementMemory();
    cancelBattleAutoAdvance();
    window.SieglingsActionQueue?.clear();
    gameState = null;
    lastRenderedPhase = null;
    if (phaseTransitionTimer) {
        clearTimeout(phaseTransitionTimer);
        phaseTransitionTimer = null;
    }
    document.getElementById('phaseTransitionBanner')?.classList.add('hidden');
    document.getElementById('phaseTransitionBanner')?.classList.remove('visible');
    welcomeDismissed = true;
    document.getElementById('gameOverOverlay').classList.remove('visible');
    if (!gameOptions) {
        loadGameOptions();
        return;
    }
    hydrateSavedPlayerName();
    renderLoadoutOptions();
    updateLoadoutSummary();
    syncEntryOverlays();
}

function selectDeckOption(deckId) {
    detachSavedDeckSelection();
    selectedDeckId = deckId;
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function selectTrainerOption(trainerId) {
    detachSavedDeckSelection();
    selectedTrainerId = trainerId;
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function switchLoadoutMode(mode) {
    detachSavedDeckSelection();
    loadoutMode = mode;
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function setMatchMode(mode) {
    matchMode = mode;
    currentRoomStatus = null;
    if (mode === 'solo') {
        clearMultiplayerSession();
    } else {
        hydrateOnlineStateFromUrl();
    }
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function setOnlineRoomMode(mode) {
    onlineRoomMode = mode;
    currentRoomStatus = null;
    clearMultiplayerSession();
    hydrateOnlineStateFromUrl();
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function hydrateOnlineStateFromUrl() {
    const roomCodeInput = document.getElementById('roomCodeInput');
    const joinCode = getJoinRoomCodeFromUrl();
    if (joinCode) {
        matchMode = 'online';
        onlineRoomMode = 'join';
        if (roomCodeInput && !roomCodeInput.value) {
            roomCodeInput.value = joinCode.toUpperCase();
        }
    }
}

async function resumeMultiplayerSession() {
    if (!multiplayerSession?.roomId || !multiplayerSession?.playerToken) {
        return false;
    }

    const data = await fetchRoomStatus();
    if (!data || data.error) {
        clearMultiplayerSession();
        return false;
    }

    matchMode = 'online';
    currentRoomStatus = data;
    startRoomPolling();
    if (data.started) {
        if (!gameState) {
            clearExternalSocketElementMemory();
        }
        gameState = data;
        render();
    } else {
        renderLoadoutOptions();
        updateLoadoutSummary();
        syncEntryOverlays();
    }
    return true;
}

async function fetchRoomStatus() {
    if (!multiplayerSession?.roomId || !multiplayerSession?.playerToken) {
        return null;
    }

    return fetchJson(apiUrls('/api/match/status'), {
        headers: {
            'X-Room-Id': multiplayerSession.roomId,
            'X-Player-Token': multiplayerSession.playerToken
        }
    });
}

function startRoomPolling() {
    clearRoomPolling();
    roomPollHandle = setInterval(async () => {
        const data = await fetchRoomStatus();
        if (!data || data.error) {
            return;
        }
        currentRoomStatus = data;
        if (data.started) {
            if (!gameState) {
                clearExternalSocketElementMemory();
            }
            gameState = data;
            render();
        } else {
            renderOnlineStatus();
            updateLoadoutSummary();
            syncEntryOverlays();
        }
    }, 2000);
}

function setBuilderElementFilter(filter) {
    builderElementFilter = filter;
    renderDeckBuilder();
}

function setBuilderTypeFilter(filter) {
    builderTypeFilter = filter;
    renderDeckBuilder();
}

function selectBuilderPreview(cardId) {
    selectedBuilderPreviewId = cardId;
    renderDeckBuilder();
}

function adjustBuilderCard(cardId, delta) {
    detachSavedDeckSelection();
    const current = builderCounts[cardId] || 0;
    const next = Math.max(0, Math.min(gameOptions.deckBuilder.maxCopies, current + delta));
    if (next === 0) {
        delete builderCounts[cardId];
    } else {
        builderCounts[cardId] = next;
    }
    renderDeckBuilder();
    updateLoadoutSummary();
}

function renderLoadoutOptions() {
    if (!gameOptions) return;

    const inviteFlow = isInviteJoinFlow();
    const deckEl = document.getElementById('deckOptions');
    const trainerEl = document.getElementById('trainerOptions');
    const overlay = document.getElementById('loadoutOverlay');
    const loadoutBox = overlay?.querySelector('.loadout-box');
    const matchModeTabs = overlay?.querySelector('.match-mode-tabs');
    const soloMatchTab = document.getElementById('soloMatchTab');
    const onlineMatchTab = document.getElementById('onlineMatchTab');
    const onlineMatchPanel = document.getElementById('onlineMatchPanel');
    const roomModeTabs = onlineMatchPanel?.querySelector('.loadout-tabs');
    const hostRoomTab = document.getElementById('hostRoomTab');
    const joinRoomTab = document.getElementById('joinRoomTab');
    const roomCodeField = document.getElementById('roomCodeField');
    const presetTab = document.getElementById('presetTab');
    const builderTab = document.getElementById('builderTab');
    const presetPanel = document.getElementById('presetLoadoutPanel');
    const builderPanel = document.getElementById('builderLoadoutPanel');
    const loadoutKicker = document.getElementById('loadoutKicker');
    const loadoutTitle = document.getElementById('loadoutTitle');
    const loadoutSubtitle = document.getElementById('loadoutSubtitle');
    const inviteRoomBadge = document.getElementById('inviteRoomBadge');
    const playerIdentityNote = document.getElementById('playerIdentityNote');

    hydrateSavedPlayerName();

    const selectedDeck = gameOptions.decks.find(deck => deck.id === selectedDeckId);
    const recommendedTrainerIds = new Set(getRecommendedTrainerIdsForDeck(selectedDeck));

    deckEl.innerHTML = gameOptions.decks.map(deck => {
        const selected = deck.id === selectedDeckId ? ' selected' : '';
        const bg = buildDeckBackground(deck.elements);
        const borderColor = buildDeckBorderColors(deck.elements);
        const elementLabels = deck.elements.map(formatElementLabel).join(' / ');
        const elClasses = deck.elements.map(e => 'el-' + e.toLowerCase()).join(' ');
        const deckTheme = getDeckLoadoutTheme(deck);
        const primaryElement = deckTheme.element || deck.elements?.[0] || 'NEUTRAL';
        const primaryHex = getElementHex(primaryElement);
        const traits = (deckTheme.traits || []).slice(0, 3);

        /* Build spine bands â€“ each element gets its own colored band with a sigil inside */
        const spineBands = deck.elements.map(el => {
            const c = getElementHex(el);
            return `<div class="spine-band" style="background:${c}"></div>`;
        }).join('');
        const faceSigils = buildDeckFaceSigils(deck.elements);

        return `<button type="button" class="deck-card${selected} ${elClasses}" style="--deck-bg:${bg};--deck-border:${borderColor};--deck-accent:${primaryHex};--deck-glow:${hexToRgba(primaryHex, 0.28)};--deck-glow-strong:${hexToRgba(primaryHex, 0.58)}" onclick="selectDeckOption('${deck.id}')" aria-pressed="${deck.id === selectedDeckId ? 'true' : 'false'}">
            <div class="deck-card-spine">${spineBands}</div>
            ${faceSigils}
            <span class="deck-card-state">${deck.id === selectedDeckId ? 'Selected' : escapeHtml(deckTheme.playstyle)}</span>
            <div class="deck-card-body">
                <span class="deck-card-name">${escapeHtml(deck.name)}</span>
                <span class="deck-card-elements">${escapeHtml(elementLabels)}</span>
                <span class="deck-card-desc">${escapeHtml(deckTheme.description || deck.description)}</span>
                <span class="deck-card-tags">${traits.map(trait => `<span>${escapeHtml(trait)}</span>`).join('')}</span>
            </div>
        </button>`;
    }).join('');

    trainerEl.innerHTML = gameOptions.trainers.map(trainer => {
        const selected = trainer.id === selectedTrainerId ? ' selected' : '';
        const elHex = getElementHex(trainer.element);
        const sigil = getTrainerSigil(trainer);
        const rarityClass = getRarityClass(trainer.rarity);
        const tier = formatTrainerTier(trainer.tier);
        const activeLabel = trainer.oncePerGame ? 'Ultimate' : 'Active';
        const recommended = recommendedTrainerIds.has(trainer.id) ? ' recommended' : '';
        return `<button type="button" class="knight-card${selected}${recommended} rarity-frame-${rarityClass} el-${trainer.element.toLowerCase()}" style="--knight-color:${elHex};--knight-glow:${hexToRgba(elHex, 0.36)}" onclick="selectTrainerOption('${trainer.id}')" aria-pressed="${trainer.id === selectedTrainerId ? 'true' : 'false'}">
            ${trainer.id === selectedTrainerId ? '<span class="knight-selected-ribbon">Selected</span>' : ''}
            ${recommended && trainer.id !== selectedTrainerId ? '<span class="knight-recommend-ribbon">Recommended</span>' : ''}
            <div class="knight-card-sigil">${sigil}</div>
            <div class="knight-card-portrait">
                <div class="knight-card-icon">${getElementSigil(trainer.element)}</div>
            </div>
            <div class="knight-card-body">
                <span class="knight-card-name">${escapeHtml(trainer.name)}</span>
                <span class="knight-card-meta"><span class="knight-element">${escapeHtml(formatElementLabel(trainer.element))}</span> <span class="knight-tier tier-${tier.toLowerCase()}">${escapeHtml(tier)}</span> <span class="knight-rarity rarity-${rarityClass}">${escapeHtml(trainer.rarity)}</span></span>
                <span class="knight-card-ability"><span>Passive</span>${escapeHtml(readTrainerAbilityText(trainer.passive))}</span>
                <span class="knight-card-ability"><span>${escapeHtml(activeLabel)}</span>${escapeHtml(readTrainerAbilityText(trainer.active))}</span>
            </div>
        </button>`;
    }).join('');

    overlay?.classList.toggle('invite-flow', inviteFlow);
    loadoutBox?.classList.toggle('invite-focused', inviteFlow);
    matchModeTabs?.classList.toggle('hidden', inviteFlow);
    roomModeTabs?.classList.toggle('hidden', inviteFlow);

    if (inviteFlow) {
        const inviteCode = getCurrentRoomCode() || getJoinRoomCodeFromUrl()?.toUpperCase() || '';
        loadoutKicker.textContent = 'Online Invite';
        loadoutTitle.textContent = 'Join This Match';
        loadoutSubtitle.textContent = 'Choose your name and favorite build, then jump straight into the invited room.';
        inviteRoomBadge.textContent = `Room ${inviteCode}`;
        inviteRoomBadge.classList.remove('hidden');
        playerIdentityNote.textContent = 'This is the name your opponent will see when you join.';
    } else if (matchMode === 'online') {
        loadoutKicker.textContent = onlineRoomMode === 'create' ? 'Online Match' : 'Join Online Match';
        loadoutTitle.textContent = onlineRoomMode === 'create' ? 'Create Your Room' : 'Choose Your Match Loadout';
        loadoutSubtitle.textContent = onlineRoomMode === 'create'
            ? 'Enter your name, pick your favorite deck, and choose the SiegeKnight you want to lead your room.'
            : 'Enter your name, choose the build you want to bring, and then join the room.';
        inviteRoomBadge.classList.add('hidden');
        playerIdentityNote.textContent = 'This name is shown in online matches and saved on this device.';
    } else {
        loadoutKicker.textContent = 'Battle Loadout';
        loadoutTitle.textContent = 'Prepare for Battle';
        loadoutSubtitle.textContent = 'Name yourself, choose your deck, then command a SiegeKnight.';
        inviteRoomBadge.classList.add('hidden');
        playerIdentityNote.textContent = 'Set your online display name now so it is ready when you host or join later.';
    }

    soloMatchTab.classList.toggle('active', matchMode === 'solo');
    onlineMatchTab.classList.toggle('active', matchMode === 'online');
    soloMatchTab.setAttribute('aria-pressed', matchMode === 'solo' ? 'true' : 'false');
    onlineMatchTab.setAttribute('aria-pressed', matchMode === 'online' ? 'true' : 'false');
    soloMatchTab.classList.toggle('hidden', inviteFlow);
    onlineMatchTab.classList.toggle('hidden', inviteFlow);
    onlineMatchPanel.classList.toggle('hidden', matchMode !== 'online');
    hostRoomTab.classList.toggle('active', onlineRoomMode === 'create');
    joinRoomTab.classList.toggle('active', onlineRoomMode === 'join');
    hostRoomTab.setAttribute('aria-pressed', onlineRoomMode === 'create' ? 'true' : 'false');
    joinRoomTab.setAttribute('aria-pressed', onlineRoomMode === 'join' ? 'true' : 'false');
    hostRoomTab.classList.toggle('hidden', inviteFlow);
    joinRoomTab.classList.toggle('hidden', inviteFlow);
    roomCodeField.classList.toggle('hidden', inviteFlow || onlineRoomMode !== 'join');

    presetTab.classList.toggle('active', loadoutMode === 'preset');
    builderTab.classList.toggle('active', loadoutMode === 'builder');
    presetTab.setAttribute('aria-pressed', loadoutMode === 'preset' ? 'true' : 'false');
    builderTab.setAttribute('aria-pressed', loadoutMode === 'builder' ? 'true' : 'false');
    presetPanel.classList.toggle('hidden', loadoutMode !== 'preset');
    builderPanel.classList.toggle('hidden', loadoutMode !== 'builder');
    loadoutBox?.classList.toggle('loadout-mode-builder', loadoutMode === 'builder');
    renderSelectedLoadoutPreview();
    renderDeckBuilder();
    renderOnlineStatus();
    renderSavedDecks();
}

function getDeckLoadoutTheme(deck) {
    if (!deck) {
        return {
            element: 'NEUTRAL',
            label: 'Custom',
            playstyle: 'Flexible',
            traits: ['Build', 'Adapt', 'Plan'],
            description: 'Tune your list, choose a commander, and bring your preferred plan into battle.',
            recommendedTrainerIds: []
        };
    }

    const exact = LOADOUT_DECK_THEMES[deck.id];
    if (exact) {
        return exact;
    }

    const elements = Array.isArray(deck.elements) ? deck.elements : [];
    const primaryElement = elements[0] || 'NEUTRAL';
    const fallback = LOADOUT_ELEMENT_THEMES[primaryElement] || {
        element: primaryElement,
        playstyle: 'Balanced',
        traits: elements.map(formatElementLabel).slice(0, 3),
        description: deck.description,
        recommendedTrainerIds: []
    };

    return {
        ...fallback,
        element: primaryElement,
        label: elements.map(formatElementLabel).join(' / ') || formatElementLabel(primaryElement),
        description: deck.description || fallback.description
    };
}

function getRecommendedTrainerIdsForDeck(deck) {
    if (!gameOptions || !deck) {
        return [];
    }

    const theme = getDeckLoadoutTheme(deck);
    const ids = new Set(theme.recommendedTrainerIds || []);
    if (deck.recommendedTrainerId) {
        ids.add(deck.recommendedTrainerId);
    }

    const elements = new Set(Array.isArray(deck.elements) ? deck.elements : []);
    gameOptions.trainers
        .filter(trainer => elements.has(trainer.element))
        .slice(0, 3)
        .forEach(trainer => ids.add(trainer.id));

    return Array.from(ids);
}

function readTrainerAbilityText(ability) {
    if (!ability) return 'None';
    if (typeof ability === 'string') return ability;
    return ability.description || ability.name || 'None';
}

function getRarityClass(rarity) {
    return String(rarity || 'common').toLowerCase();
}

function renderSelectedLoadoutPreview() {
    const previewEl = document.getElementById('selectedLoadoutPreview');
    const panel = document.getElementById('selectedLoadoutPanel');
    if (!previewEl || !panel) return;

    if (!gameOptions) {
        previewEl.innerHTML = `<div class="selected-loadout-kicker">Selected Loadout</div><div class="selected-loadout-empty">Loading deck and SiegeKnight choices...</div>`;
        return;
    }

    const deck = gameOptions.decks.find(item => item.id === selectedDeckId);
    const trainer = gameOptions.trainers.find(item => item.id === selectedTrainerId);
    const theme = loadoutMode === 'builder' ? getDeckLoadoutTheme(null) : getDeckLoadoutTheme(deck);
    const element = theme.element || deck?.elements?.[0] || trainer?.element || 'NEUTRAL';
    const accent = getElementHex(element);
    panel.style.setProperty('--loadout-accent', accent);
    panel.style.setProperty('--loadout-accent-soft', hexToRgba(accent, 0.18));
    panel.style.setProperty('--loadout-accent-glow', hexToRgba(accent, 0.32));

    const deckName = loadoutMode === 'builder'
        ? getActiveLoadoutLabel()
        : (getActiveLoadoutLabel() || deck?.name || 'Choose a Deck');
    const elementLabel = loadoutMode === 'builder'
        ? (collectBuilderElements() || 'Custom Elements')
        : (deck?.elements || []).map(formatElementLabel).join(' / ');
    const traits = theme.traits?.length ? theme.traits : ['Build', 'Adapt', 'Plan'];
    const recommendedIds = loadoutMode === 'builder' ? [] : getRecommendedTrainerIdsForDeck(deck);
    const recommendedNames = recommendedIds
        .map(id => gameOptions.trainers.find(item => item.id === id)?.name)
        .filter(Boolean)
        .slice(0, 4);

    const trainerSummary = trainer
        ? `<div class="preview-knight-card">
                <div class="preview-knight-icon" style="color:${getElementHex(trainer.element)}">${getElementSigil(trainer.element)}</div>
                <div>
                    <div class="preview-knight-name">${escapeHtml(trainer.name)}</div>
                    <div class="preview-knight-meta">${escapeHtml(formatElementLabel(trainer.element))} | ${escapeHtml(formatTrainerTier(trainer.tier))} | ${escapeHtml(trainer.rarity || 'Common')}</div>
                    <div class="preview-knight-ability">${escapeHtml(readTrainerAbilityText(trainer.passive))}</div>
                </div>
            </div>`
        : `<div class="selected-loadout-empty">Choose a SiegeKnight to complete the loadout.</div>`;

    previewEl.innerHTML = `
        <div class="selected-loadout-kicker">Selected Loadout</div>
        <div class="selected-loadout-title-row">
            <h3>${escapeHtml(deckName)}</h3>
            <span>${escapeHtml(elementLabel || formatElementLabel(element))}</span>
        </div>
        <p class="selected-loadout-description">${escapeHtml(theme.description || deck?.description || 'Pick a deck to preview its battle plan.')}</p>
        <div class="selected-loadout-playstyle">
            <span>Playstyle</span>
            <strong>${escapeHtml(theme.playstyle || 'Balanced')}</strong>
        </div>
        <div class="selected-loadout-traits">
            ${traits.map(trait => `<span>${escapeHtml(trait)}</span>`).join('')}
        </div>
        <div class="selected-loadout-section">
            <div class="selected-loadout-label">Recommended SiegeKnights</div>
            <div class="selected-loadout-recs">
                ${recommendedNames.length ? recommendedNames.map(name => `<span>${escapeHtml(name)}</span>`).join('') : '<span>Any commander that matches your custom plan</span>'}
            </div>
        </div>
        <div class="selected-loadout-section">
            <div class="selected-loadout-label">Commander</div>
            ${trainerSummary}
        </div>
    `;
}

function renderOnlineStatus() {
    const statusEl = document.getElementById('onlineStatus');
    if (!statusEl) return;
    const inviteFlow = isInviteJoinFlow();

    if (matchMode !== 'online') {
        statusEl.innerHTML = 'Create a room or join an invite link to play with another person.';
        return;
    }

    if (!currentRoomStatus?.roomId) {
        statusEl.innerHTML = inviteFlow
            ? `You were invited to room <strong>${getCurrentRoomCode() || getJoinRoomCodeFromUrl()?.toUpperCase() || ''}</strong>. Choose your build and join when you are ready.`
            : onlineRoomMode === 'create'
                ? 'Host a room with your chosen loadout, then share the room code or link.'
                : 'Enter the room code from your invite link, choose your loadout, and join.';
        return;
    }

    const roomLabel = `<strong>${currentRoomStatus.roomId}</strong>`;
    if (!currentRoomStatus.started) {
        statusEl.innerHTML = `Room ${roomLabel} is waiting for Player 2.<span class="room-meta-line">Share: <a href="${currentRoomStatus.shareUrl}" target="_blank">${currentRoomStatus.shareUrl}</a></span><span class="room-meta-line"><button class="btn btn-primary" type="button" onclick="copyRoomShareLink()">Copy Invite Link</button></span>`;
        return;
    }

    statusEl.innerHTML = `Connected to room ${roomLabel}.<span class="room-meta-line">You: <strong>${currentRoomStatus.playerName || 'Player'}</strong> vs <strong>${currentRoomStatus.enemyName || 'Opponent'}</strong></span>`;
}

function renderDeckBuilder() {
    if (!gameOptions) return;

    const catalogEl = document.getElementById('builderCatalog');
    const deckListEl = document.getElementById('builderDeckList');
    const previewEl = document.getElementById('builderCardPreview');
    const elementFiltersEl = document.getElementById('builderElementFilters');
    const typeFiltersEl = document.getElementById('builderTypeFilters');
    if (!catalogEl || !deckListEl || !previewEl || !elementFiltersEl || !typeFiltersEl) {
        return;
    }

    const elementFilters = ['ALL', ...ENERGY_ORDER.map(([, label]) => label.toUpperCase()), 'NEUTRAL'];
    elementFiltersEl.innerHTML = elementFilters.map(filter => {
        const active = builderElementFilter === filter ? ' active' : '';
        return `<button class="builder-filter${active}" onclick="setBuilderElementFilter('${filter}')">${formatElementLabel(filter)}</button>`;
    }).join('');

    const typeFilters = ['ALL', 'SIEGLING', 'SPELL', 'TRAP'];
    typeFiltersEl.innerHTML = typeFilters.map(filter => {
        const active = builderTypeFilter === filter ? ' active' : '';
        return `<button class="builder-filter${active}" onclick="setBuilderTypeFilter('${filter}')">${filter}</button>`;
    }).join('');

    const filteredCards = gameOptions.cardCatalog.filter(card => {
        const matchesElement = builderElementFilter === 'ALL' || card.element === builderElementFilter;
        const matchesType = builderTypeFilter === 'ALL' || card.type === builderTypeFilter;
        return matchesElement && matchesType;
    });

    const chosenCards = getChosenBuilderCards();
    const previewCard = resolveBuilderPreviewCard(filteredCards, chosenCards);
    selectedBuilderPreviewId = previewCard?.id || null;

    catalogEl.innerHTML = filteredCards.map(card => {
        const count = builderCounts[card.id] || 0;
        const disabledAdd = count >= gameOptions.deckBuilder.maxCopies ? 'disabled' : '';
        const disabledSub = count === 0 ? 'disabled' : '';
        const costText = getBuilderCardCostText(card);
        const text = getBuilderCardSummaryText(card);
        const activeClass = card.id === selectedBuilderPreviewId ? ' active' : '';
        return `<div class="builder-card-row${activeClass}">
            <button type="button" class="builder-card-main" onclick="selectBuilderPreview('${card.id}')">
                <div class="builder-card-title">
                    <span class="energy-token solid-token token-${card.element.toLowerCase()} builder-token"></span>
                    <span>${card.name}</span>
                    <span class="builder-card-copy">x${count}</span>
                </div>
                <div class="builder-card-meta">${card.type} | ${formatElementLabel(card.element)} | ${card.rarity} | ${costText}</div>
                <div class="builder-card-text">${text}</div>
            </button>
            <div class="builder-card-controls">
                <button type="button" class="builder-stepper" ${disabledSub} onclick="event.stopPropagation(); adjustBuilderCard('${card.id}', -1)">-</button>
                <button type="button" class="builder-stepper" ${disabledAdd} onclick="event.stopPropagation(); adjustBuilderCard('${card.id}', 1)">+</button>
            </div>
        </div>`;
    }).join('');

    deckListEl.innerHTML = chosenCards.length > 0
        ? chosenCards.map(({ card, count }) => {
            const activeClass = card.id === selectedBuilderPreviewId ? ' active' : '';
            return `<button type="button" class="builder-deck-row${activeClass}" onclick="selectBuilderPreview('${card.id}')">
                <span>${card.name}</span>
                <span>x${count}</span>
            </button>`;
        }).join('')
        : `<div class="builder-empty">Add cards from the catalog to build your deck.</div>`;

    previewEl.innerHTML = renderBuilderPreviewCard(previewCard);
}

function getLoadoutStartButtonLabel() {
    if (matchMode === 'online') {
        return isInviteJoinFlow() ? 'Join Match' : (onlineRoomMode === 'create' ? 'Create Room' : 'Join Room');
    }
    return 'Start Battle';
}

function getLoadoutStartButtonBusyLabel() {
    if (matchMode === 'online') {
        return onlineRoomMode === 'create' ? 'Creating Room...' : (isInviteJoinFlow() ? 'Joining Match...' : 'Joining Room...');
    }
    return 'Starting Battle...';
}

function syncLoadoutStartButton(startBtn, disabled, label) {
    if (!startBtn) {
        return;
    }

    startBtn.textContent = label;
    startBtn.disabled = Boolean(disabled);
    startBtn.classList.toggle('is-loading', loadoutStartPending);
    startBtn.setAttribute('aria-busy', loadoutStartPending ? 'true' : 'false');
}

function updateLoadoutSummary() {
    const summary = document.getElementById('loadoutSummary');
    const startBtn = document.getElementById('btnStartLoadout');
    const playerName = getCurrentPlayerName();
    const needsPlayerName = matchMode === 'online';
    if (!gameOptions) {
        summary.textContent = loadoutErrorMessage || 'Loading deck and SiegeKnight choices...';
        if (startBtn) {
            startBtn.onclick = loadoutErrorMessage ? () => loadGameOptions() : startSelectedGame;
            syncLoadoutStartButton(startBtn, !loadoutErrorMessage, loadoutErrorMessage ? 'Retry Loadout' : 'Loading...');
        }
        return;
    }

    renderSelectedLoadoutPreview();
    const startButtonLabel = loadoutStartPending ? getLoadoutStartButtonBusyLabel() : getLoadoutStartButtonLabel();
    if (startBtn) {
        startBtn.onclick = startSelectedGame;
        syncLoadoutStartButton(startBtn, false, startButtonLabel);
    }

    const deck = gameOptions.decks.find(item => item.id === selectedDeckId);
    const trainer = gameOptions.trainers.find(item => item.id === selectedTrainerId);
    if (!trainer) {
        summary.textContent = 'Choose a deck and SiegeKnight to begin.';
        syncLoadoutStartButton(startBtn, true, startButtonLabel);
        return;
    }

    if (needsPlayerName && !playerName) {
        summary.innerHTML = 'Enter the name you want to use online, then finish choosing your deck and SiegeKnight.';
        syncLoadoutStartButton(startBtn, true, startButtonLabel);
        return;
    }

    if (matchMode === 'online' && currentRoomStatus?.roomId && !currentRoomStatus.started) {
        summary.innerHTML = `Room <strong>${currentRoomStatus.roomId}</strong> is ready. Waiting for your opponent to join.`;
        syncLoadoutStartButton(startBtn, true, startButtonLabel);
        return;
    }

    if (loadoutMode === 'builder') {
        const cardCount = getBuilderCardCount();
        const elementList = collectBuilderElements();
        const valid = cardCount >= gameOptions.deckBuilder.minDeckSize;
        const builderLabel = matchMode === 'online' ? 'Custom build' : 'Deck Builder';
        summary.innerHTML = `${builderLabel}: <strong>${escapeHtml(getActiveLoadoutLabel())}</strong> | <strong>${cardCount}</strong> cards selected${elementList ? ` | Elements: <strong>${elementList}</strong>` : ''} | SiegeKnight: <strong>${trainer.name}</strong>${playerName ? ` | Name: <strong>${playerName}</strong>` : ''}`;
        if (!valid) {
            summary.innerHTML += ` | Add at least <strong>${gameOptions.deckBuilder.minDeckSize}</strong> cards to start.`;
        }
        syncLoadoutStartButton(
            startBtn,
            loadoutStartPending || !valid || (matchMode === 'online' && onlineRoomMode === 'join' && !getCurrentRoomCode()) || (needsPlayerName && !playerName),
            startButtonLabel
        );
        return;
    }

    if (!deck) {
        summary.textContent = 'Choose a preset deck and SiegeKnight to begin.';
        syncLoadoutStartButton(startBtn, true, startButtonLabel);
        return;
    }

    summary.innerHTML = `${matchMode === 'online' ? 'Build' : 'Deck'}: <strong>${escapeHtml(getActiveLoadoutLabel() || deck.name)}</strong> | SiegeKnight: <strong>${trainer.name}</strong>${playerName ? ` | Name: <strong>${playerName}</strong>` : ''}`;
    syncLoadoutStartButton(
        startBtn,
        loadoutStartPending || (matchMode === 'online' && onlineRoomMode === 'join' && !getCurrentRoomCode()) || (needsPlayerName && !playerName),
        startButtonLabel
    );
}

async function startSelectedGame() {
    if (loadoutStartPending) return;
    if (!selectedTrainerId) return;
    if (loadoutMode === 'preset' && !selectedDeckId) return;
    if (loadoutMode === 'builder' && getBuilderCardCount() < gameOptions.deckBuilder.minDeckSize) return;

    loadoutStartPending = true;
    updateLoadoutSummary();

    try {
        if (matchMode === 'online') {
            if (onlineRoomMode === 'create') {
                await createRoom();
            } else {
                await joinRoom();
            }
            return;
        }
        await newGame();
    } finally {
        loadoutStartPending = false;
        updateLoadoutSummary();
    }
}

function getCurrentPlayerName() {
    const input = document.getElementById('playerNameInput');
    return input?.value?.trim() || '';
}

function getCurrentRoomCode() {
    const input = document.getElementById('roomCodeInput');
    return input?.value?.trim()?.toUpperCase() || '';
}

function getSelectedLoadoutBody() {
    return loadoutMode === 'builder'
        ? { trainerId: selectedTrainerId, customDeckCards: getBuilderSelectedCards(), loadoutLabel: getActiveLoadoutLabel() }
        : { deckId: selectedDeckId, trainerId: selectedTrainerId, loadoutLabel: getActiveLoadoutLabel() };
}

async function createRoom() {
    savePlayerName(getCurrentPlayerName());
    const body = {
        ...getSelectedLoadoutBody(),
        playerName: getCurrentPlayerName()
    };
    const data = await fetchJson(apiUrls('/api/match/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, LOADOUT_ACTION_TIMEOUT_MS);
    if (!data || data.error) {
        console.error(data?.error || 'Unable to create room.');
        return;
    }

    multiplayerSession = {
        roomId: data.roomId,
        playerToken: data.playerToken,
        viewerSide: data.viewerSide
    };
    currentRoomStatus = data;
    saveMultiplayerSession();
    startRoomPolling();
    renderLoadoutOptions();
    updateLoadoutSummary();
    syncEntryOverlays();
}

async function joinRoom() {
    const roomId = getCurrentRoomCode();
    if (!roomId) return;

    savePlayerName(getCurrentPlayerName());
    const body = {
        ...getSelectedLoadoutBody(),
        roomId,
        playerName: getCurrentPlayerName()
    };
    const data = await fetchJson(apiUrls('/api/match/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, LOADOUT_ACTION_TIMEOUT_MS);
    if (!data || data.error) {
        console.error(data?.error || 'Unable to join room.');
        return;
    }

    multiplayerSession = {
        roomId: data.roomId,
        playerToken: data.playerToken,
        viewerSide: data.viewerSide
    };
    currentRoomStatus = data;
    saveMultiplayerSession();
    startRoomPolling();

    if (data.started) {
        clearExternalSocketElementMemory();
        gameState = data;
        render();
    } else {
        renderLoadoutOptions();
        updateLoadoutSummary();
        syncEntryOverlays();
    }
}

async function copyRoomShareLink() {
    if (!currentRoomStatus?.shareUrl) return;
    try {
        await navigator.clipboard.writeText(currentRoomStatus.shareUrl);
    } catch (e) {
        console.error('Clipboard copy failed:', e);
    }
}

function getBuilderCardCount() {
    return Object.values(builderCounts).reduce((sum, count) => sum + count, 0);
}

function getBuilderCardCostText(card) {
    if (card.requiredComboSize) {
        return `Combo ${card.requiredComboSize}${card.requiredComboSignature ? `: ${card.requiredComboSignature.replaceAll('+', ' / ')}` : ''}`;
    }
    if (card.type === 'TRAP' && card.trapBucketElement) {
        return `Trap ${formatElementLabel(card.trapBucketElement)} ${card.trapBucketAmount}`;
    }
    if (card.costElement) {
        return `${formatElementLabel(card.costElement)} ${card.costAmount}`;
    }
    return 'Free';
}

function getBuilderCardSummaryText(card) {
    if (card.type === 'SIEGLING') {
        return `HP ${card.health} | SPD ${card.speed} | ${card.preferredRow || 'ANY'}${card.evolvesFromName ? ` | Evolves from ${card.evolvesFromName}` : ''}`;
    }
    return card.ability?.description || 'No effect text';
}

function resolveBuilderPreviewCard(filteredCards, chosenCards) {
    const selected = gameOptions.cardCatalog.find(card => card.id === selectedBuilderPreviewId);
    const selectedVisible = selected && (
        filteredCards.some(card => card.id === selected.id)
        || chosenCards.some(entry => entry.card.id === selected.id)
    );
    if (selectedVisible) {
        return selected;
    }
    if (filteredCards.length > 0) {
        return filteredCards[0];
    }
    if (chosenCards.length > 0) {
        return chosenCards[0].card;
    }
    return null;
}

function renderBuilderPreviewCard(card) {
    if (!card) {
        return `<div class="builder-empty">Choose a card from the catalog or your deck list to inspect its full design.</div>`;
    }

    const elemClass = card.element.toLowerCase();
    const fallbackArtLabel = card.type === 'SIEGLING'
        ? formatElementLabel(card.element)
        : `${formatElementLabel(card.element)} ${card.type}`.trim();
    const metaParts = [card.type, formatElementLabel(card.element), card.rarity, getBuilderCardCostText(card)];

    let html = `<div class="builder-preview-wrap">`;
    html += `<div class="builder-preview-card hand-card ${elemClass}">`;
    if (card.type === 'SIEGLING') {
        html += renderHandNotches(card.notches);
    }
    html += `<div class="hand-card-shell">`;
    html += `<div class="hand-card-header">`;
    html += `<div class="card-title">${card.name}</div>`;
    html += `<div class="card-label">${card.type} / ${card.rarity}</div>`;
    html += `</div>`;
    html += renderCardArt(card, 'preview', fallbackArtLabel);
    html += `<div class="hand-card-body">`;
    if (card.type === 'SIEGLING') {
        html += `<div class="card-detail card-stats-line">HP:${card.health} SPD:${card.speed}</div>`;
    }
    html += renderCardAbilitiesFlavorSection(card);
    if (card.type === 'TRAP' && card.trapBucketElement) {
        html += `<div class="card-cost">Can Trigger when opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)} Energy</div>`;
    } else if (card.costElement) {
        html += `<div class="card-cost">Play Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}</div>`;
    } else if (card.requiredComboSize) {
        html += `<div class="card-cost">Combo: ${card.requiredComboSignature ? card.requiredComboSignature.replaceAll('+', ' / ') : `${card.requiredComboSize}-element combo`}</div>`;
    }
    if (card.requiredReaction) {
        html += `<div class="card-cost">Requires: ${card.requiredReaction}</div>`;
    }
    if (card.evolvesFromName) {
        html += `<div class="card-cost">Evolution: ${card.evolvesFromName}</div>`;
    }
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
    html += `<div class="builder-preview-meta">${metaParts.join(' | ')}</div>`;
    html += `<div class="builder-preview-copy">${getBuilderCardSummaryText(card)}</div>`;
    html += `</div>`;
    return html;
}

function getBuilderSelectedCards() {
    const cards = [];
    const availableIds = new Set((gameOptions?.cardCatalog || []).map(card => card.id));
    for (const [cardId, count] of Object.entries(builderCounts)) {
        if (!availableIds.has(cardId)) {
            continue;
        }
        for (let i = 0; i < count; i++) {
            cards.push(cardId);
        }
    }
    return cards;
}

function getChosenBuilderCards() {
    return Object.entries(builderCounts)
        .map(([cardId, count]) => ({
            count,
            card: gameOptions.cardCatalog.find(card => card.id === cardId)
        }))
        .filter(entry => entry.card)
        .sort((left, right) => left.card.name.localeCompare(right.card.name));
}

function collectBuilderElements() {
    const elements = new Set();
    getBuilderSelectedCards().forEach(cardId => {
        const card = gameOptions.cardCatalog.find(item => item.id === cardId);
        if (card && card.element !== 'NEUTRAL') {
            elements.add(formatElementLabel(card.element));
        }
    });
    return Array.from(elements).join(' / ');
}

async function playerDraw() {
    const data = await api('draw');
    if (data) {
        window.SieglingsSounds?.play('draw');
        onDrawComplete();
    }
}

function toggleMulliganCard(index) {
    if (!gameState?.mulligan?.youPending) {
        return;
    }
    if (mulliganSelectedIndices.has(index)) {
        mulliganSelectedIndices.delete(index);
    } else {
        mulliganSelectedIndices.add(index);
    }
    renderMulliganOverlay();
}

function submitMulliganKeep() {
    submitMulligan([]);
}

function submitMulliganSelected() {
    if (mulliganSelectedIndices.size === 0) {
        return;
    }
    const sorted = Array.from(mulliganSelectedIndices).sort((a, b) => a - b);
    submitMulligan(sorted);
}

async function submitMulligan(indices) {
    const data = await api('mulligan', 'POST', { mulliganIndices: indices });
    if (!data) {
        return;
    }
    mulliganSelectedIndices.clear();
    mulliganHandSig = '';
    renderMulliganOverlay();
}

async function executeBattle() {
    if (!gameState || gameState.gameOver || isBattleTargetSelectionActive()) {
        return;
    }
    selectedCard = null;
    selectedHandIndex = null;
    window.SieglingsSounds?.play('hit', 0.6);
    closeClaimPopup();
    closeTrainerAbilityPopup();
    clearTargetMode();
    openBattlePanel(true);
}

function openBattlePanel(forceOpen = false) {
    renderBattlePanel();
    if (gameState?.currentPhase === 'BATTLE' && isDesktopSidebarLayout()) {
        if (battleHandViewOpen || forceOpen) {
            battleHandViewOpen = false;
            render();
        }
        if (activeDrawer === 'battle') {
            closeDrawer(true);
        }
        return;
    }
    if (isDesktopSidebarLayout() && isHandHiddenForPhase()) {
        if (activeDrawer === 'battle') {
            closeDrawer(true);
        }
        return;
    }
    if (activeDrawer === 'battle') {
        if (forceOpen) {
            return;
        }
        closeDrawer();
        return;
    }
    openDrawer('battle');
}

function viewHandDuringBattle() {
    if (gameState?.currentPhase === 'BATTLE') {
        battleHandViewOpen = true;
        closeDrawer(true);
        render();
        document.getElementById('playerHand')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
    }
    closeDrawer();
    setDesktopBattleDrawerOpen(false);
    stopHandSelectorAutoScroll();
    document.getElementById('playerHand')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function endTurn() {
    selectedCard = null;
    selectedHandIndex = null;
    closeClaimPopup();
    clearTargetMode();
    window.SieglingsSounds?.play('endturn');
    const data = await api('endturn');
    if (data) {
        resetDrawButton();
    }
}

async function placeCard(row, col) {
    if (!selectedCard) return;
    window.SieglingsSounds?.play('place');
    const data = await api('place', 'POST', { cardId: selectedCard.id, row, col });
    if (!data) return;
    closeCardPreviewSurfaces();
    resetInteractionState();
}

async function claimBoardCard(row, col) {
    clearTargetMode();
    const data = await api('claim', 'POST', { row, col });
    if (!data) return;
    resetInteractionState();
}

async function castSpell(cardId, targetRow, targetCol, destRow = -1, destCol = -1) {
    window.SieglingsSounds?.play('spell');
    const body = { cardId, targetRow, targetCol };
    if (destRow >= 0 && destCol >= 0) {
        body.destRow = destRow;
        body.destCol = destCol;
    }
    const data = await api('cast', 'POST', body);
    if (!data) return;
    resetInteractionState();
}

function needsForcedEnemyMoveFlow(card) {
    const a = card?.ability;
    return Boolean(
        a
        && a.effectType === 'move_link'
        && a.targetType === 'SINGLE_ENEMY'
        && (card.type === 'SPELL' || card.type === 'TRAP')
    );
}

function isActionCard(card) {
    return card && (card.type === 'SPELL' || card.type === 'TRAP');
}

function getAbilityTargetSide(ability) {
    if (!ability || !ability.targetType) return null;
    return TARGET_TYPES[ability.targetType] || null;
}

function abilityNeedsTarget(ability) {
    return getAbilityTargetSide(ability) !== null;
}

async function useTrainer(targetRow, targetCol) {
    const data = await api('trainer', 'POST', { targetRow, targetCol });
    if (!data) return;
    resetInteractionState();
}

async function submitBattleAction(abilityIndex, targetRow = -1, targetCol = -1) {
    clearTargetingPreview();
    const data = await api('battle/action', 'POST', { abilityIndex, targetRow, targetCol });
    if (!data) return;
    resetInteractionState();
}

function renderDomLegacy() {
    if (!gameState) return;
    rebindSelectedHandSlotFromState();
    updateResponsiveLayoutVars();

    const phase = gameState.currentPhase;
    const previousPhase = lastRenderedPhase;
    const phaseChanged = Boolean(previousPhase && previousPhase !== phase);
    lastRenderedPhase = phase;
    if (phase !== 'BATTLE' || (phaseChanged && phase === 'BATTLE')) {
        battleHandViewOpen = false;
    }

    document.getElementById('turnNumber').textContent = gameState.turnNumber;
    document.getElementById('phaseBadge').textContent = phase;
    document.getElementById('activeSideLabel').textContent = gameState.activeSideLabel || (gameState.activeSide === 'PLAYER' ? 'You' : 'Opponent');
    document.getElementById('firstPlayerLabel').textContent = gameState.firstPlayerLabel || (gameState.firstPlayer === 'PLAYER' ? 'You' : 'Opponent');
    document.getElementById('enemyHeading').textContent = gameState.enemyName || 'AI Opponent';
    document.getElementById('playerHeading').textContent = gameState.playerName || 'Player';
    document.getElementById('handHeading').textContent = `${gameState.playerName || 'Your'} Hand`;

    const roomBadge = document.getElementById('roomBadge');
    if (gameState.multiplayer && gameState.roomId) {
        roomBadge.textContent = `Room ${gameState.roomId}`;
        roomBadge.classList.remove('hidden');
    } else {
        roomBadge.classList.add('hidden');
    }

    const over = gameState.gameOver;
    const playerActive = gameState.activeSide === 'PLAYER';
    const btnDraw = document.getElementById('btnDraw');
    const btnBattle = document.getElementById('btnBattle');
    const btnBattlePanel = document.getElementById('btnBattlePanel');
    const btnTrainerAbility = document.getElementById('btnTrainerAbility');
    const btnEndTurn = document.getElementById('btnEndTurn');
    const battlePhaseActive = phase === 'BATTLE' && !over;
    const drawButtonActsAsEndTurn = phase === 'SETUP' && playerActive && !over;
    if (drawButtonActsAsEndTurn) {
        onDrawComplete();
    } else {
        resetDrawButton();
    }
    btnDraw.disabled = over || !playerActive || (phase !== 'DRAW' && !drawButtonActsAsEndTurn);
    btnEndTurn.disabled = over || !playerActive || phase !== 'SETUP';
    btnDraw.classList.toggle('hidden', battlePhaseActive);
    btnBattle.classList.toggle('hidden', !battlePhaseActive);

    const playerBattlePending = phase === 'BATTLE'
        && gameState.pendingBattle
        && gameState.battleWaitingOn === 'PLAYER';
    const enemyBattlePending = phase === 'BATTLE' && gameState.battleWaitingOn === 'ENEMY';
    let battleLabel = 'Queue';
    let battleTitle = 'Battle starts automatically after both players finish Setup. Use this to review the action queue.';
    if (phase === 'BATTLE') {
        if (playerBattlePending) {
            battleLabel = 'Battle Action';
            battleTitle = 'Open the live queue prompt for the Siegling that is currently acting by speed.';
        } else if (enemyBattlePending) {
            battleLabel = 'Queue Locked';
            battleTitle = 'Review battle status while the opponent resolves the current speed action.';
        } else {
            battleLabel = 'Queue Live';
            battleTitle = 'Review the live battle queue. Sieglings resolve abilities in speed order until the phase ends.';
        }
    }
    btnBattle.disabled = over;
    btnBattle.textContent = battleLabel;
    btnBattle.title = battleTitle;
    btnBattle.setAttribute('aria-label', battleTitle);
    btnBattle.classList.toggle('ab-urgent', playerBattlePending);
    if (btnBattlePanel) {
        const panelTitle = phase === 'BATTLE'
            ? battleHandViewOpen ? 'View Battle Action' : 'View Hand'
            : getSelectedBattlePreviewCard()
                ? 'Preview selected card abilities'
                : 'Preview Siegling battle abilities';
        btnBattlePanel.innerHTML = phase === 'BATTLE'
            ? battleHandViewOpen ? '&#9876;' : '&#127183;'
            : '&#9876;';
        btnBattlePanel.title = panelTitle;
        btnBattlePanel.setAttribute('aria-label', panelTitle);
        btnBattlePanel.onclick = phase === 'BATTLE'
            ? battleHandViewOpen ? () => openBattlePanel(true) : viewHandDuringBattle
            : () => openBattlePanel();
    }

    // Highlight the active phase button
    btnDraw.classList.toggle('ab-active', (phase === 'DRAW' || drawButtonActsAsEndTurn) && playerActive && !over);
    btnBattle.classList.toggle('ab-active', phase === 'BATTLE' && !over);
    btnEndTurn.classList.toggle('ab-active', phase === 'SETUP' && playerActive && !over);

    document.getElementById('playerHealth').textContent = gameState.player.health;
    document.getElementById('enemyHealth').textContent = gameState.enemy.health;

    renderEnergyTopBar('playerEnergy', gameState.player);
    renderEnergyTopBar('enemyEnergy', gameState.enemy);
    renderEnergyDetailPanel();
    updateHudRails(gameState);
    updateMobileHud(gameState);

    document.getElementById('playerDeckSize').textContent = gameState.player.deckSize;
    document.getElementById('enemyDeckSize').textContent = gameState.enemy.deckSize;
    document.getElementById('enemyHandSize').textContent = gameState.enemy.handSize;

    renderTrainer('playerTrainer', gameState.player.trainer, true);
    renderTrainer('enemyTrainer', gameState.enemy.trainer, false);
    if (btnTrainerAbility) {
        const trainer = gameState.player.trainer;
        const hasTrainer = Boolean(trainer);
        const canUse = canUseTrainerAbility(trainer);
        btnTrainerAbility.classList.toggle('hidden', !hasTrainer);
        btnTrainerAbility.disabled = !hasTrainer;
        btnTrainerAbility.innerHTML = trainer?.tier === 'SiegeLord' ? '&#9876; Lord' : '&#9876; Knight';
        btnTrainerAbility.title = trainer
            ? `${trainer.name}${trainer.active?.name ? `: ${trainer.active.name}` : ''}${canUse ? '' : ' (details only)'}`
            : 'No SiegeKnight selected';
    }
    renderTrainerAbilityPopup();
    renderClaimPopup();

    renderBoard('enemyGrid', gameState.enemyBoard, false);
    renderBoard('playerGrid', gameState.playerBoard, true);
    applyArenaElementTheme();
    renderHand();
    renderDesktopDeckPreview();
    updateHandLiftLayer();
    syncFocusedCardUi();
    renderMulliganOverlay();
    renderLog();
    renderBattlePanel();
    renderRowSelectBattleOverlay();
    scheduleBattleAutoAdvance();
    if (isDesktopSidebarLayout() && isHandHiddenForPhase() && activeDrawer === 'battle') {
        closeDrawer(true);
    }
    applyInteractionState();
    renderElementKey();
    syncMobileInfoTab();
    syncEntryOverlays();
    maybeRefreshProfileAfterGame();

    if (activeDrawer === 'battle' && phase !== 'BATTLE') {
        closeDrawer(true);
    }
    if (phaseChanged) {
        showPhaseTransitionBanner(phase, gameState.activeSide);
    }

    if (gameState.gameOver) {
        document.getElementById('gameOverOverlay').classList.add('visible');
        const title = gameState.winner === 'Draw'
            ? 'DRAW'
            : (gameState.winner === (gameState.playerName || 'Player') ? 'VICTORY!' : 'DEFEAT');
        if (!document.getElementById('gameOverOverlay').dataset.soundPlayed) {
            document.getElementById('gameOverOverlay').dataset.soundPlayed = '1';
            window.SieglingsSounds?.play(title === 'VICTORY!' ? 'win' : 'lose');
        }
        document.getElementById('gameOverTitle').textContent = title;
        document.getElementById('gameOverMsg').textContent = gameState.winner === 'Draw'
            ? 'Both players were defeated.'
            : `${gameState.winner} wins!`;
    }
}

function getBoardCellMarkers(board, markers) {
    const result = [];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            if (markers.some((entry) => entry[0] === r && entry[1] === c)) {
                result.push({ row: r, col: c, cell: board?.[r]?.[c] || null });
            }
        }
    }
    return result;
}

function render() {
    if (gameState) {
        pruneInvalidArenaSelection();
    }
    renderDomLegacy();
}

window.previewCellHover = previewCellHover;
window.handleTargetCellPointerLeave = handleTargetCellPointerLeave;
window.confirmRowSelectBattleTarget = confirmRowSelectBattleTarget;
window.clearRowSelectBattleTarget = clearRowSelectBattleTarget;
window.clearTargetingPreview = clearTargetingPreview;

function renderEnergy(containerId, playerData) {
    const el = document.getElementById(containerId);
    const tokens = buildEnergyTokens(playerData);
    const regularCount = tokens.filter(token => token.type === 'solid').length;
    const comboCount = tokens.filter(token => token.type === 'combo').length;

    let html = `<div class="energy-bucket-card">`;
    html += `<div class="energy-bucket-title">Energy Bucket</div>`;
    html += `<div class="energy-bucket">`;
    html += tokens.length > 0
        ? tokens.map(renderEnergyToken).join('')
        : `<div class="energy-empty">No energy stored</div>`;
    html += `</div>`;
    html += `<div class="energy-bucket-meta">${regularCount} energy | ${comboCount} combo</div>`;
    if (playerData.comboPoints && playerData.comboPoints.length > 0) {
        html += `<div class="combo-list">${playerData.comboPoints.map(formatComboPoint).join('')}</div>`;
    }
    if (playerData.mistActive) {
        html += `<div class="combo-summary">Mist combo is active</div>`;
    }
    html += `</div>`;

    el.innerHTML = html;
}

function formatBreakdown(internal, external) {
    const parts = [];
    if (internal > 0) parts.push(`${internal} internal`);
    if (external > 0) parts.push(`${external} external`);
    return parts.length > 0 ? parts.join(' + ') : '0';
}

function energyDetailElementRows(playerData) {
    const rows = [];
    for (const [key, label] of ENERGY_ORDER) {
        const total = playerData[`${key}Energy`] || 0;
        if (total <= 0) continue;
        const intl = playerData[`${key}Internal`];
        const ext = playerData[`${key}External`];
        let sub = '';
        if (typeof intl === 'number' && typeof ext === 'number') {
            sub = ` — ${formatBreakdown(intl, ext)}`;
        }
        rows.push(`<div class="energy-detail-row"><span>${label}</span><span>${total}${sub}</span></div>`);
    }
    return rows.length > 0
        ? rows.join('')
        : '<div class="energy-detail-muted">No elemental energy</div>';
}

function energyDetailComboBlock(playerData) {
    const pts = playerData.comboPoints || [];
    if (pts.length === 0) {
        return '<div class="energy-detail-muted">No multicolor combo sites</div>';
    }
    return pts.map((p) => `<div class="energy-detail-combo">${formatComboPoint(p)}</div>`).join('');
}

function energyDetailNexusBlock(playerData) {
    const pts = playerData.nexusPoints || [];
    if (pts.length === 0) {
        return '<div class="energy-detail-muted">No nexus intersections</div>';
    }
    return pts.map((p) => {
        const els = (p.contributingElements || []).map(formatElementLabel).join(', ');
        return `<div class="energy-detail-nexus">Nexus (${p.notchCount}): ${escapeHtml(els || '—')}</div>`;
    }).join('');
}

function renderEnergyDetailPanel() {
    const panel = document.getElementById('energyDetailPanel');
    if (!panel || !gameState) return;

    const p = gameState.player;
    const e = gameState.enemy;
    const enemyTitle = escapeHtml(gameState.enemyName || 'Opponent');
    let html = '';
    html += '<div class="energy-detail-columns">';
    html += '<div class="energy-detail-section">';
    html += `<div class="energy-detail-h2">${escapeHtml(gameState.playerName || 'You')}</div>`;
    html += `<div class="energy-detail-hp">${p.health ?? 0} HP</div>`;
    html += energyDetailElementRows(p);
    html += '<div class="energy-detail-subh">Combos</div>';
    html += energyDetailComboBlock(p);
    html += '<div class="energy-detail-subh">Nexus</div>';
    html += energyDetailNexusBlock(p);
    if (p.mistActive) {
        html += '<div class="energy-mist">Mist combo active</div>';
    }
    html += '</div>';

    html += '<div class="energy-detail-section">';
    html += `<div class="energy-detail-h2">${enemyTitle}</div>`;
    html += `<div class="energy-detail-hp">${e.health ?? 0} HP</div>`;
    html += energyDetailElementRows(e);
    html += '<div class="energy-detail-subh">Combos</div>';
    html += energyDetailComboBlock(e);
    html += '<div class="energy-detail-subh">Nexus</div>';
    html += energyDetailNexusBlock(e);
    if (e.mistActive) {
        html += '<div class="energy-mist">Mist combo active</div>';
    }
    html += '</div>';
    html += '</div>';

    panel.innerHTML = html;
}

function updateHudRails(state) {
    if (!state) return;
    const p = state.player || {};
    const e = state.enemy || {};

    setTextIfExists('railPlayerHeading', state.playerName || p.name || 'Player');
    setTextIfExists('railEnemyHeading', state.enemyName || e.name || 'AI');

    const pHealth = Number(p.health ?? 0);
    const eHealth = Number(e.health ?? 0);
    const pPct = Math.max(0, Math.min(100, Math.round((pHealth / 50) * 100)));
    const ePct = Math.max(0, Math.min(100, Math.round((eHealth / 50) * 100)));
    setTextIfExists('railPlayerHealth', pHealth);
    setTextIfExists('railEnemyHealth', eHealth);

    const pBar = document.getElementById('railPlayerHpBar');
    const eBar = document.getElementById('railEnemyHpBar');
    if (pBar) {
        pBar.style.width = `${pPct}%`;
        const pColor = p.trainer?.element ? getElementHex(p.trainer.element) : null;
        pBar.style.background = pColor
            ? `linear-gradient(90deg, ${hexToRgba(pColor, 0.55)}, ${pColor})`
            : '';
    }
    if (eBar) {
        eBar.style.width = `${ePct}%`;
        const eColor = e.trainer?.element ? getElementHex(e.trainer.element) : null;
        eBar.style.background = eColor
            ? `linear-gradient(90deg, ${hexToRgba(eColor, 0.55)}, ${eColor})`
            : '';
    }

    setTextIfExists('railPlayerHandSize', p.handSize ?? (Array.isArray(p.hand) ? p.hand.length : 0));
    setTextIfExists('railPlayerDeckSize', p.deckSize ?? 0);
    setTextIfExists('railEnemyHandSize', e.handSize ?? 0);
    setTextIfExists('railEnemyDeckSize', e.deckSize ?? 0);

    updateHudRailKnight('railPlayer', p.trainer);
    updateHudRailKnight('railEnemy', e.trainer);
    renderRailElements('railPlayerElements', p);
    renderRailElements('railEnemyElements', e);
}

function setMobileHudSheetSide(side) {
    mobileHudSheetSide = side === 'player' ? 'player' : 'enemy';
    mobileHudSheetOpen = true;
    syncMobileHudSheetSide();
}

function toggleMobileHudSheet(side) {
    const normalized = side === 'player' ? 'player' : 'enemy';
    if (mobileHudSheetOpen && mobileHudSheetSide === normalized) {
        closeMobileHudSheet();
        return;
    }
    mobileHudSheetSide = normalized;
    mobileHudSheetOpen = true;
    syncMobileHudSheetSide();
}

function closeMobileHudSheet(event) {
    if (event?.stopPropagation) {
        event.stopPropagation();
    }
    mobileHudSheetOpen = false;
    syncMobileHudSheetSide();
}

function syncMobileHudSheetSide() {
    const enemyActive = mobileHudSheetSide !== 'player';
    const sheetOpen = mobileHudSheetOpen && isPortraitMobileHudLayout();
    const sheet = document.getElementById('mobileStatSheet');
    const enemyTab = document.getElementById('mobileStatEnemyTab');
    const playerTab = document.getElementById('mobileStatPlayerTab');
    const enemySheet = document.getElementById('mobileStatEnemySheet');
    const playerSheet = document.getElementById('mobileStatPlayerSheet');
    const enemyHud = document.querySelector('.mobile-hud-enemy');
    const playerHud = document.querySelector('.mobile-hud-player');

    if (sheet) {
        sheet.classList.toggle('is-open', sheetOpen);
        sheet.setAttribute('aria-hidden', sheetOpen ? 'false' : 'true');
    }
    if (enemyHud) {
        enemyHud.classList.toggle('sheet-open', sheetOpen && enemyActive);
        enemyHud.setAttribute('aria-expanded', sheetOpen && enemyActive ? 'true' : 'false');
    }
    if (playerHud) {
        playerHud.classList.toggle('sheet-open', sheetOpen && !enemyActive);
        playerHud.setAttribute('aria-expanded', sheetOpen && !enemyActive ? 'true' : 'false');
    }

    if (enemyTab) {
        enemyTab.classList.toggle('active-enemy', enemyActive);
        enemyTab.classList.toggle('active-player', false);
        enemyTab.setAttribute('aria-selected', enemyActive ? 'true' : 'false');
    }
    if (playerTab) {
        playerTab.classList.toggle('active-player', !enemyActive);
        playerTab.classList.toggle('active-enemy', false);
        playerTab.setAttribute('aria-selected', enemyActive ? 'false' : 'true');
    }
    if (enemySheet) enemySheet.hidden = !enemyActive;
    if (playerSheet) playerSheet.hidden = enemyActive;
}

function updateMobileHud(state) {
    if (!state) return;
    const p = state.player || {};
    const e = state.enemy || {};
    const phase = state.currentPhase || 'DRAW';

    setTextIfExists('mobilePhaseBadge', phase);
    setTextIfExists('mobileTurnNumber', state.turnNumber ?? 0);

    updateMobileHudSide('Player', p, {
        name: state.playerName || p.name || 'Player',
        hpBarId: 'mobilePlayerHpBar',
        nameId: 'mobilePlayerName',
        handId: 'mobilePlayerHandSize',
        deckId: 'mobilePlayerDeckSize',
        energyId: 'mobilePlayerEnergyCount',
        dotsId: 'mobilePlayerElements',
        statHandId: 'mobilePlayerStatHandSize',
        statDeckId: 'mobilePlayerStatDeckSize',
        statElementsId: 'mobilePlayerStatElements',
        knightIconId: 'mobilePlayerKnightIcon',
        knightNameId: 'mobilePlayerKnightName',
        knightInfoId: 'mobilePlayerKnightInfo'
    });
    updateMobileHudSide('Enemy', e, {
        name: state.enemyName || e.name || 'AI',
        hpBarId: 'mobileEnemyHpBar',
        nameId: 'mobileEnemyName',
        handId: 'mobileEnemyHandSize',
        deckId: 'mobileEnemyDeckSize',
        energyId: 'mobileEnemyEnergyCount',
        dotsId: 'mobileEnemyElements',
        statHandId: 'mobileEnemyStatHandSize',
        statDeckId: 'mobileEnemyStatDeckSize',
        statElementsId: 'mobileEnemyStatElements',
        knightIconId: 'mobileEnemyKnightIcon',
        knightNameId: 'mobileEnemyKnightName',
        knightInfoId: 'mobileEnemyKnightInfo'
    });

    setTextIfExists('mobileStatPlayerTab', state.playerName || p.name || 'Player');
    setTextIfExists('mobileStatEnemyTab', state.enemyName || e.name || 'AI');
    syncMobileHudSheetSide();
}

function updateMobileHudSide(label, playerData, ids) {
    const health = Number(playerData?.health ?? 0);
    const pct = Math.max(0, Math.min(100, Math.round((health / 50) * 100)));
    const handSize = playerData?.handSize ?? (Array.isArray(playerData?.hand) ? playerData.hand.length : 0);
    const deckSize = playerData?.deckSize ?? 0;
    const energyTotal = getEnergyRowsForPlayer(playerData).reduce((sum, entry) => sum + entry.val, 0);
    const trainer = playerData?.trainer;
    const trainerAbility = getTrainerRailAbilityText(trainer);
    const trainerInfo = [
        trainer?.element ? formatElementLabel(trainer.element) : '',
        trainerAbility
    ].filter(Boolean).join(' - ');
    const hpBar = document.getElementById(ids.hpBarId);
    const trainerColor = trainer?.element ? getElementHex(trainer.element) : null;

    setTextIfExists(ids.nameId, ids.name || label);
    setTextIfExists(ids.handId, handSize);
    setTextIfExists(ids.deckId, deckSize);
    setTextIfExists(ids.energyId, energyTotal);
    setTextIfExists(ids.statHandId, handSize);
    setTextIfExists(ids.statDeckId, deckSize);
    setTextIfExists(ids.knightNameId, trainer?.name || '-');
    setTextIfExists(ids.knightInfoId, trainerInfo);
    if (hpBar) {
        hpBar.style.width = `${pct}%`;
        hpBar.style.background = trainerColor || '';
    }

    const icon = document.getElementById(ids.knightIconId);
    if (icon) icon.innerHTML = elementEmoji(trainer?.element);

    renderMobileHudElementDots(ids.dotsId, playerData);
    renderMobileStatElements(ids.statElementsId, playerData);
}

function updateHudRailKnight(prefix, trainer) {
    setTextIfExists(`${prefix}KnightName`, trainer?.name || '-');
    setTextIfExists(`${prefix}KnightElement`, trainer?.element ? formatElementLabel(trainer.element) : '');
    setTextIfExists(`${prefix}KnightAbility`, getTrainerRailAbilityText(trainer));
    const portrait = document.getElementById(`${prefix}KnightPortrait`);
    if (portrait) {
        portrait.innerHTML = elementEmoji(trainer?.element);
    }
}

function getTrainerRailAbilityText(trainer) {
    if (!trainer) return '';
    if (typeof trainer.passiveDescription === 'string' && trainer.passiveDescription.trim()) {
        return trainer.passiveDescription.trim();
    }
    if (typeof trainer.passive === 'string' && trainer.passive.trim()) {
        return trainer.passive.trim();
    }
    if (trainer.passive?.description) {
        return trainer.passive.description;
    }
    if (trainer.active?.description) {
        return trainer.active.description;
    }
    if (trainer.active?.name) {
        return trainer.active.name;
    }
    return '';
}

function getEnergyRowsForPlayer(playerData) {
    return ENERGY_ORDER
        .map(([key, label]) => {
            const val = Number(playerData?.[`${key}Energy`] ?? 0);
            return { key, label, val, color: getElementCssVar(label.toUpperCase()) };
        })
        .filter((entry) => entry.val > 0);
}

function renderRailElements(containerId, playerData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rows = getEnergyRowsForPlayer(playerData);

    if (rows.length === 0) {
        container.innerHTML = '<span class="hud-empty">None</span>';
        return;
    }

    const maxVal = Math.max(1, ...rows.map((entry) => entry.val));
    container.innerHTML = rows.map((entry) => {
        const pct = Math.round((entry.val / maxVal) * 100);
        return `<div class="hud-elem-row">
            <div class="hud-elem-dot" style="background:${entry.color}"></div>
            <span class="hud-elem-name">${escapeHtml(entry.label)}</span>
            <div class="hud-elem-track">
                <div class="hud-elem-fill" style="width:${pct}%;background:${entry.color}"></div>
            </div>
            <span class="hud-elem-num" style="color:${entry.color}">${escapeHtml(String(entry.val))}</span>
        </div>`;
    }).join('');
}

function renderMobileHudElementDots(containerId, playerData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const rows = getEnergyRowsForPlayer(playerData).slice(0, 8);
    container.innerHTML = rows.map((entry) => (
        `<span class="m-elem-dot" title="${escapeHtml(entry.label)} ${escapeHtml(String(entry.val))}" style="background:${entry.color};color:${entry.color}"></span>`
    )).join('');
}

function renderMobileStatElements(containerId, playerData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const rows = getEnergyRowsForPlayer(playerData);
    if (rows.length === 0) {
        container.innerHTML = '<span class="m-empty">No elemental energy</span>';
        return;
    }
    const maxVal = Math.max(1, ...rows.map((entry) => entry.val));
    container.innerHTML = rows.map((entry) => {
        const pct = Math.round((entry.val / maxVal) * 100);
        return `<div class="m-elem-item">
            <span class="m-elem-pip" style="background:${entry.color}"></span>
            <span class="m-elem-lbl">${escapeHtml(entry.label)}</span>
            <span class="m-elem-trk"><span class="m-elem-fl" style="width:${pct}%;background:${entry.color}"></span></span>
            <span class="m-elem-num" style="color:${entry.color}">${escapeHtml(String(entry.val))}</span>
        </div>`;
    }).join('');
}

function elementEmoji(element) {
    const map = {
        FIRE: '&#128293;',
        WATER: '&#128167;',
        WIND: '&#127788;',
        EARTH: '&#9670;',
        ICE: '&#10052;',
        SHADOW: '&#127761;',
        ELECTRIC: '&#9889;',
        METAL: '&#9881;',
        UNDEAD: '&#9760;',
        PSYCHIC: '&#9679;'
    };
    return map[String(element || '').toUpperCase()] || '&#9876;';
}

function setTextIfExists(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '';
}

function onDrawComplete() {
    const btn = document.getElementById('btnDraw');
    if (!btn) return;
    btn.classList.add('ab-drawn');
    btn.innerHTML = '&#9197; End Turn';
    btn.onclick = endTurn;
}

function resetDrawButton() {
    const btn = document.getElementById('btnDraw');
    if (!btn) return;
    btn.classList.remove('ab-drawn');
    btn.innerHTML = '&#127183; Draw';
    btn.onclick = playerDraw;
}

function formatComboPoint(point) {
    const labels = (point.elements || []).map(formatElementLabel).join(' + ');
    return `<div class="combo-point-line">Combo-${point.size}: ${labels}</div>`;
}

function formatElementLabel(element) {
    return (element || '').charAt(0) + (element || '').slice(1).toLowerCase();
}

function formatTrainerTier(tier) {
    return tier || 'SiegeKnight';
}

function getElementHex(element) {
    switch (element) {
        case 'FIRE': return '#ff501e';
        case 'EARTH': return '#b48c50';
        case 'WIND': return '#96ffb4';
        case 'WATER': return '#3296ff';
        case 'ICE': return '#76e6ff';
        case 'SHADOW': return '#7832b4';
        case 'ELECTRIC': return '#ffe63c';
        case 'METAL': return '#a0aab4';
        case 'UNDEAD': return '#8c78a0';
        case 'PSYCHIC': return '#c896ff';
        default: return '#95a5a6';
    }
}

function hexToRgba(hex, alpha = 1) {
    const normalized = (hex || '').replace('#', '');
    if (normalized.length !== 6) {
        return `rgba(149, 165, 166, ${alpha})`;
    }
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function collectArenaThemeElements() {
    if (!gameState) {
        return ['WATER', 'FIRE', 'WIND', 'EARTH'];
    }

    const weights = new Map();
    const addElement = (element, weight = 1) => {
        if (!element) {
            return;
        }
        weights.set(element, (weights.get(element) || 0) + weight);
    };

    const addBoard = (board, ownerWeight = 1) => {
        (board || []).forEach(row => {
            (row || []).forEach(card => {
                if (!card?.element) {
                    return;
                }
                addElement(card.element, ownerWeight + 1);
            });
        });
    };

    addElement(gameState.player?.trainer?.element, 2);
    addElement(gameState.enemy?.trainer?.element, 2);
    addBoard(gameState.playerBoard, 1.15);
    addBoard(gameState.enemyBoard, 1);

    if (gameState.pendingBattle?.element) {
        addElement(gameState.pendingBattle.element, 3);
    }

    const ranked = Array.from(weights.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([element]) => element);

    if (ranked.length === 0) {
        return ['WATER', 'FIRE', 'WIND', 'EARTH'];
    }
    if (ranked.length === 1) {
        return [ranked[0], ranked[0], ranked[0], ranked[0]];
    }
    if (ranked.length === 2) {
        return [ranked[0], ranked[1], ranked[0], ranked[1]];
    }
    if (ranked.length === 3) {
        return [ranked[0], ranked[1], ranked[2], ranked[0]];
    }
    return ranked.slice(0, 4);
}

function applyArenaElementTheme() {
    const boardArea = document.getElementById('boardArea');
    if (!boardArea) {
        return;
    }

    const [primary, secondary, tertiary, quaternary] = collectArenaThemeElements();
    const colors = [primary, secondary, tertiary, quaternary].map(getElementHex);

    boardArea.style.setProperty('--arena-color-a', colors[0]);
    boardArea.style.setProperty('--arena-color-b', colors[1] || colors[0]);
    boardArea.style.setProperty('--arena-color-c', colors[2] || colors[0]);
    boardArea.style.setProperty('--arena-color-d', colors[3] || colors[1] || colors[0]);
    boardArea.style.setProperty('--arena-glow-a', hexToRgba(colors[0], gameState?.currentPhase === 'BATTLE' ? 0.34 : 0.22));
    boardArea.style.setProperty('--arena-glow-b', hexToRgba(colors[1] || colors[0], gameState?.currentPhase === 'BATTLE' ? 0.3 : 0.18));
    boardArea.style.setProperty('--arena-glow-c', hexToRgba(colors[2] || colors[0], gameState?.currentPhase === 'BATTLE' ? 0.24 : 0.15));
    boardArea.style.setProperty('--arena-glow-d', hexToRgba(colors[3] || colors[1] || colors[0], gameState?.currentPhase === 'BATTLE' ? 0.2 : 0.12));
    boardArea.style.setProperty('--arena-rim', hexToRgba(colors[0], gameState?.currentPhase === 'BATTLE' ? 0.34 : 0.18));
    boardArea.style.setProperty('--arena-sheen', hexToRgba(colors[1] || colors[0], gameState?.currentPhase === 'BATTLE' ? 0.2 : 0.1));
}

function getElementSigil(element, variant = 'soft') {
    const softSigils = {
        FIRE: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.15"/><path d="M32 11 C38 19 29 24 34 32 C39 27 46 29 46 38 C46 47 39 53 31 53 C22 53 18 46 18 38 C18 30 25 25 25 17 C28 19 30 22 31 25 C32 20 33 16 32 11 Z" fill="currentColor" opacity="0.16"/><path d="M31 27 C34 31 34 36 31 41 C28 37 28 31 31 27 Z" fill="currentColor" opacity="0.28"/></svg>`,
        EARTH: `<svg viewBox="0 0 64 64" class="deck-sigil"><polygon points="32,10 49,20 49,43 32,54 15,43 15,20" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.15"/><path d="M18 43 L27 26 L34 34 L41 22 L46 43 Z" fill="currentColor" opacity="0.14"/><path d="M32 17 L37 26 L32 35 L27 26 Z" fill="currentColor" opacity="0.24"/></svg>`,
        WIND: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M18 26 C25 18 35 18 42 24 C37 24 33 27 31 31" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.2"/><path d="M15 35 C23 28 35 29 46 36 C39 35 34 38 31 42" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.2"/><path d="M31 22 L36 32 L31 42 L26 32 Z" fill="currentColor" opacity="0.14"/></svg>`,
        WATER: `<svg viewBox="0 0 64 64" class="deck-sigil"><path d="M32 10 C38 20 46 27 46 38 C46 47 40 53 32 53 C24 53 18 47 18 38 C18 27 26 20 32 10 Z" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.15"/><path d="M20 37 C24 33 29 32 34 35 C38 38 42 38 46 34" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.2"/><circle cx="32" cy="38" r="5" fill="currentColor" opacity="0.14"/></svg>`,
        ICE: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M32 14 L32 50 M16.4 23 L47.6 41 M47.6 23 L16.4 41" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.2"/><polygon points="32,25 38.06,29.5 38.06,34.5 32,39 25.94,34.5 25.94,29.5" fill="currentColor" opacity="0.18"/></svg>`,
        SHADOW: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M38 16 C31 18 26 24 26 32 C26 40 31 46 38 48 C34 51 28 51 23 48 C17 44 14 38 14 31 C14 20 23 12 34 12 C35 13 37 14 38 16 Z" fill="currentColor" opacity="0.16"/><path d="M42 21 L44 26 L49 28 L44 30 L42 35 L40 30 L35 28 L40 26 Z" fill="currentColor" opacity="0.24"/></svg>`,
        ELECTRIC: `<svg viewBox="0 0 64 64" class="deck-sigil"><polygon points="32,10 49,20 49,44 32,54 15,44 15,20" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.14"/><path d="M36 16 L27 31 L35 31 L28 47 L40 31 L32 31 L39 16 Z" fill="currentColor" opacity="0.18"/><path d="M24 22 L30 18 M34 46 L40 42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.18"/></svg>`,
        METAL: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M32 14 L38 22 L46 22 L40 28 L42 36 L32 30 L22 36 L24 28 L18 22 L26 22 Z" fill="currentColor" opacity="0.16"/><circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="2" opacity="0.22"/><circle cx="32" cy="32" r="3" fill="currentColor" opacity="0.24"/></svg>`,
        UNDEAD: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M22 34 C22 22 28 14 32 14 C36 14 42 22 42 34 C42 38 40 40 38 40 L36 36 L34 40 L30 40 L28 36 L26 40 C24 40 22 38 22 34 Z" fill="currentColor" opacity="0.16"/><circle cx="27" cy="28" r="3.5" fill="currentColor" opacity="0.28"/><circle cx="37" cy="28" r="3.5" fill="currentColor" opacity="0.28"/></svg>`,
        PSYCHIC: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M32 12 C40 12 46 18 46 26 C46 34 40 38 40 44 L24 44 C24 38 18 34 18 26 C18 18 24 12 32 12 Z" fill="currentColor" opacity="0.14"/><circle cx="32" cy="26" r="5" fill="currentColor" opacity="0.26"/><path d="M28 44 L28 50 M32 44 L32 52 M36 44 L36 50" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.22"/></svg>`
    };

    const faceSigils = {
        FIRE: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.95"/><path d="M32 11 C38 19 29 24 34 32 C39 27 46 29 46 38 C46 47 39 53 31 53 C22 53 18 46 18 38 C18 30 25 25 25 17 C28 19 30 22 31 25 C32 20 33 16 32 11 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 27 C34 31 34 36 31 41 C28 37 28 31 31 27 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        EARTH: `<svg viewBox="0 0 64 64" class="deck-sigil"><polygon points="32,10 49,20 49,43 32,54 15,43 15,20" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.95"/><path d="M18 43 L27 26 L34 34 L41 22 L46 43 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 17 L37 26 L32 35 L27 26 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/></svg>`,
        WIND: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M18 25 C25 17 35 17 42 23 C37 23 33 26 30 30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M15 35 C23 28 35 28 46 35 C39 35 34 38 30 41" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M31 22 L36 32 L31 42 L26 32 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
        WATER: `<svg viewBox="0 0 64 64" class="deck-sigil"><path d="M32 10 C38 20 46 27 46 38 C46 47 40 53 32 53 C24 53 18 47 18 38 C18 27 26 20 32 10 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 37 C24 33 29 32 34 35 C38 38 42 38 46 34" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="32" cy="38" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
        ICE: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 14 L32 50 M16.4 23 L47.6 41 M47.6 23 L16.4 41" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><polygon points="32,25 38.06,29.5 38.06,34.5 32,39 25.94,34.5 25.94,29.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
        SHADOW: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.9"/><path d="M38 16 C31 18 26 24 26 32 C26 40 31 46 38 48 C34 51 28 51 23 48 C17 44 14 38 14 31 C14 20 23 12 34 12 C35 13 37 14 38 16 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M42 21 L44 26 L49 28 L44 30 L42 35 L40 30 L35 28 L40 26 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
        ELECTRIC: `<svg viewBox="0 0 64 64" class="deck-sigil"><polygon points="32,10 49,20 49,44 32,54 15,44 15,20" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.95"/><path d="M36 16 L27 31 L35 31 L28 47 L40 31 L32 31 L39 16 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 22 L30 18 M34 46 L40 42" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
        METAL: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 14 L38 22 L46 22 L40 28 L42 36 L32 30 L22 36 L24 28 L18 22 L26 22 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="32" cy="32" r="3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
        UNDEAD: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M22 34 C22 22 28 14 32 14 C36 14 42 22 42 34 C42 38 40 40 38 40 L36 36 L34 40 L30 40 L28 36 L26 40 C24 40 22 38 22 34 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="27" cy="28" r="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="37" cy="28" r="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
        PSYCHIC: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 12 C40 12 46 18 46 26 C46 34 40 38 40 44 L24 44 C24 38 18 34 18 26 C18 18 24 12 32 12 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="32" cy="26" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M28 44 L28 50 M32 44 L32 52 M36 44 L36 50" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`
    };

    if (variant === 'card-face') {
        return faceSigils[element] || softSigils[element] || '';
    }

    return softSigils[element] || '';
}

function buildDeckFaceSigils(elements) {
    if (!elements || elements.length === 0) return '';

    const placements = getDeckSigilPlacements(elements.length);
    const sigils = elements.map((element, index) => {
        const placement = placements[index] || placements[placements.length - 1] || { x: 50, y: 50, size: 56 };
        return `<div class="deck-card-sigil" style="left:${placement.x}%;top:${placement.y}%;--sigil-size:${placement.size}px">${getElementSigil(element, 'card-face')}</div>`;
    }).join('');

    return `<div class="deck-card-sigils count-${elements.length}">${sigils}</div>`;
}

function getDeckSigilPlacements(count) {
    switch (count) {
        case 1:
            return [{ x: 50, y: 42, size: 84 }];
        case 2:
            return [
                { x: 30, y: 28, size: 60 },
                { x: 66, y: 72, size: 56 }
            ];
        case 3:
            return [
                { x: 22, y: 22, size: 52 },
                { x: 49, y: 48, size: 50 },
                { x: 76, y: 74, size: 46 }
            ];
        case 4:
            return [
                { x: 18, y: 16, size: 40 },
                { x: 40, y: 38, size: 38 },
                { x: 62, y: 60, size: 38 },
                { x: 80, y: 80, size: 34 }
            ];
        default:
            return Array.from({ length: count }, (_, index) => ({
                x: 14 + (((count > 1 ? 72 / (count - 1) : 0)) * index),
                y: 18 + (((count > 1 ? 64 / (count - 1) : 0)) * index),
                size: Math.max(30, 54 - (index * 3))
            }));
    }
}

function getTrainerSigil(trainer) {
    const tier = trainer?.tier || 'SiegeKnight';
    const sigils = {
        SiegeSquire: `<svg viewBox="0 0 80 80" class="trainer-sigil"><circle cx="40" cy="40" r="24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.18"/><path d="M40 18 L49 34 L31 34 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M28 48 L40 60 L52 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.65"/></svg>`,
        SiegeKnight: `<svg viewBox="0 0 80 80" class="trainer-sigil"><polygon points="40,12 58,26 52,50 28,50 22,26" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.2"/><path d="M28 56 L40 24 L52 56" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 44 L48 44" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/></svg>`,
        SiegeLord: `<svg viewBox="0 0 80 80" class="trainer-sigil"><circle cx="40" cy="42" r="24" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.18"/><path d="M24 54 L28 24 L40 36 L52 24 L56 54 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M31 56 L40 18 L49 56" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/></svg>`
    };
    return sigils[tier] || sigils.SiegeKnight;
}

function buildDeckBackground(elements) {
    if (!elements || elements.length === 0) return 'rgba(255,255,255,0.04)';
    if (elements.length === 1) {
        const c = getElementHex(elements[0]);
        return `linear-gradient(135deg, ${c}22 0%, ${c}08 100%)`;
    }
    const stops = elements.map((el, i) => {
        const c = getElementHex(el);
        const pct1 = Math.round((i / elements.length) * 100);
        const pct2 = Math.round(((i + 1) / elements.length) * 100);
        return `${c}20 ${pct1}%, ${c}10 ${pct2}%`;
    }).join(', ');
    return `linear-gradient(135deg, ${stops})`;
}

function buildDeckBorderColors(elements) {
    if (!elements || elements.length === 0) return 'rgba(255,255,255,0.08)';
    if (elements.length === 1) return getElementHex(elements[0]) + '66';
    return getElementHex(elements[0]) + '55';
}

function buildEnergyTokens(playerData) {
    const tokens = [];

    for (const [key, label] of ENERGY_ORDER) {
        const amount = playerData[`${key}Energy`] || 0;
        for (let i = 0; i < amount; i++) {
            tokens.push({
                type: 'solid',
                key,
                label
            });
        }
    }

    for (const comboPoint of (playerData.comboPoints || [])) {
        const raw = comboPoint.elements || [];
        const distinct = [...new Set(raw)].sort((a, b) => String(a).localeCompare(String(b)));
        tokens.push({
            type: 'combo',
            elements: distinct,
            label: `Combo-${comboPoint.size}: ${distinct.map(formatElementLabel).join(' + ')}`
        });
    }

    return tokens;
}

function renderEnergyToken(token) {
    if (token.type === 'combo') {
        return `<div class="energy-token combo-token token-${token.elements.length}" title="${token.label}" style="${buildComboStyle(token.elements)}"></div>`;
    }
    return `<div class="energy-token solid-token token-${token.key}" title="${token.label}"></div>`;
}

function buildComboStyle(elements) {
    if (!elements || elements.length === 0) {
        return '';
    }

    const total = elements.length;
    const slices = elements.map((element, index) => {
        const start = Math.round((index / total) * 360);
        const end = Math.round(((index + 1) / total) * 360);
        return `${getElementCssVar(element)} ${start}deg ${end}deg`;
    }).join(', ');

    return `background: conic-gradient(${slices});`;
}

/** Distinct elements for nexus display; matches combo token logic (API may repeat elements per notch). */
function normalizeNexusContributingElements(np, latticeEntries) {
    const raw = Array.isArray(np?.contributingElements) ? np.contributingElements : [];
    const fromApi = raw.map((e) => String(e || '').toUpperCase()).filter(Boolean);
    if (fromApi.length > 0) {
        return [...new Set(fromApi)].sort((a, b) => a.localeCompare(b));
    }
    const fromBoard = latticeEntries
        .map((e) => String(e.element || '').toUpperCase())
        .filter(Boolean);
    return [...new Set(fromBoard)].sort((a, b) => a.localeCompare(b));
}

/** Opacity for nexus solid fill — aligns orbs with solid energy token intensity. */
const APPROX_NEXUS_SOLID_FILL_ALPHA = 0.88;

/** SVG snippet: hub matches energy tokens (solid vs conic combo). */
function buildNexusHubGraphics(hx, hy, hubR, distinctElements) {
    const distinct = distinctElements && distinctElements.length > 0 ? distinctElements : ['NEUTRAL'];
    if (distinct.length === 1) {
        const c = getElementHex(distinct[0]);
        const fill = hexToRgba(c, APPROX_NEXUS_SOLID_FILL_ALPHA);
        return `<circle cx="${hx}" cy="${hy}" r="${hubR}" fill="${fill}" stroke="rgba(255,255,255,0.22)" stroke-width="1" />`
            + `<circle cx="${hx}" cy="${hy}" r="${hubR + 3}" fill="none" stroke="${c}" stroke-width="2.5" stroke-opacity="0.95" />`;
    }
    const d = hubR * 2;
    const foX = hx - hubR;
    const foY = hy - hubR;
    const comboBg = buildComboStyle(distinct);
    return `<foreignObject x="${foX}" y="${foY}" width="${d}" height="${d}">`
        + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;border-radius:50%;box-sizing:border-box;`
        + `border:2px solid rgba(255,255,255,0.22);box-shadow:0 2px 8px rgba(0,0,0,0.35);${comboBg}"></div>`
        + `</foreignObject>`
        + `<circle cx="${hx}" cy="${hy}" r="${hubR + 3}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />`;
}

function renderElementKey() {
    const el = document.getElementById('elementKeyPanel');
    if (!el) return;

    let html = `<div class="element-key-card">`;
    for (const [key, label] of ENERGY_ORDER) {
        html += `<div class="element-key-row">`;
        html += `<span class="energy-token solid-token token-${key} key-token"></span>`;
        html += `<span>${label}</span>`;
        html += `</div>`;
    }
    html += `<div class="element-key-row">`;
    html += `<span class="energy-token combo-token token-2 key-token" style="${buildComboStyle(['FIRE', 'EARTH'])}"></span>`;
    html += `<span>Combo point mixes its linked elements</span>`;
    html += `</div>`;
    html += `</div>`;

    el.innerHTML = html;
}

function renderTrainer(containerId, trainer, isPlayer) {
    const el = document.getElementById(containerId);
    if (!trainer) {
        el.innerHTML = '';
        return;
    }

    let html = `<div class="trainer-card">`;
    html += `<div class="trainer-tier">${formatTrainerTier(trainer.tier)}</div>`;
    html += `<div class="name">${trainer.name}</div>`;
    if (trainer.passive) {
        html += `<div class="effect">Passive: ${trainer.passive.description}</div>`;
    }
    if (trainer.active) {
        html += `<div class="effect">${trainer.oncePerGame ? 'Ultimate' : 'Active'}: ${trainer.active.description}</div>`;
        if (isPlayer) {
            const canUseTrainer = canUseTrainerAbility(trainer);
            html += `<button class="trainer-btn" ${canUseTrainer ? '' : 'disabled'} onclick="onTrainerUse()">Use ${trainer.active.name}</button>`;
        }
    }
    html += `</div>`;
    el.innerHTML = html;
}

function renderBoard(gridId, board, isPlayer) {
    const grid = document.getElementById(gridId);
    const rowOrder = isPlayer ? [2, 1, 0] : [0, 1, 2];
    const legalPlacements = isPlayer ? getSelectedLegalPlacements() : [];
    const claimableSieglings = isPlayer ? getClaimableSieglings(board) : [];
    let html = '';

    for (const r of rowOrder) {
        for (let c = 0; c < 3; c++) {
            const cell = board[r][c];
            const isLegal = isPlayer && !targetMode && selectedCard && selectedCard.type === 'SIEGLING'
                && legalPlacements.some(p => p[0] === r && p[1] === c);
            const isTargetable = isTargetCell(isPlayer, cell, r);
            const isActing = gameState.pendingBattle && cell && gameState.pendingBattle.instanceId === cell.instanceId;
            const isClaimable = isPlayer && cell && claimableSieglings.some(p => p[0] === r && p[1] === c);
            const isRowSelected = isRowSelectBattleTargetContext()
                && getRowSelectSelectedRow() === r
                && ((targetContext.side === 'row-ally') === isPlayer);

            let classes = 'board-cell';
            if (isLegal) classes += ' legal';
            if (cell) classes += ' has-card';
            if (isTargetable) classes += ' targetable';
            if (isRowSelected) classes += ' row-selected';
            if (isActing) classes += ' active-attacker';
            if (isClaimable) classes += ' claimable';
            if (
                arenaSelection
                && arenaSelection.isPlayer === isPlayer
                && arenaSelection.row === r
                && arenaSelection.col === c
                && cell
                && cell.instanceId === arenaSelection.instanceId
            ) {
                classes += ' arena-selected';
            }

            let events = '';
            if (isLegal) {
                events = `onclick="placeCard(${r}, ${c})" ontouchend="handleBoardCellTouch(event, ${isPlayer}, ${r}, ${c})"`;
            } else if (isTargetable) {
                events = `onclick="onTargetSelected(${r}, ${c}, ${isPlayer})" onmouseenter="previewCellHover(${isPlayer}, ${r}, ${c})" ontouchstart="previewCellHover(${isPlayer}, ${r}, ${c})" onmouseleave="handleTargetCellPointerLeave()" ontouchend="handleBoardCellTouch(event, ${isPlayer}, ${r}, ${c})"`;
            } else if (isClaimable) {
                const claimTouch = isPlayer
                    ? `ontouchstart="handleBoardCardLongPressStart(event,${r},${c})" ontouchend="handleBoardCardLongPressEnd(event,${r},${c})" ontouchcancel="cancelBoardCardLongPress()"`
                    : `ontouchend="handleBoardCellInspectTouch(event,${isPlayer},${r},${c})"`;
                events = `onclick="onArenaCardClick(${isPlayer}, ${r}, ${c})" ${claimTouch} onmouseenter="handleBoardCardPointerEnter(${isPlayer}, ${r}, ${c});showTooltipBoard(event, ${isPlayer}, ${r}, ${c})" onmouseleave="handleBoardCardPointerLeave(${isPlayer}, ${r}, ${c});hideTooltip()"`;
            } else if (cell) {
                const cellTouch = isPlayer
                    ? `ontouchstart="handleBoardCardLongPressStart(event,${r},${c})" ontouchend="handleBoardCardLongPressEnd(event,${r},${c})" ontouchcancel="cancelBoardCardLongPress()"`
                    : `ontouchend="handleBoardCellInspectTouch(event,${isPlayer},${r},${c})"`;
                events = `onclick="onArenaCardClick(${isPlayer}, ${r}, ${c})" ${cellTouch} onmouseenter="handleBoardCardPointerEnter(${isPlayer}, ${r}, ${c});showTooltipBoard(event, ${isPlayer}, ${r}, ${c})" onmouseleave="handleBoardCardPointerLeave(${isPlayer}, ${r}, ${c});hideTooltip()"`;
            }

            html += `<div class="${classes}" ${events} data-row="${r}" data-col="${c}">`;
            if (c === 0) {
                html += `<div class="row-tag">${ROW_NAMES[r]}</div>`;
            }

            if (cell) {
                const elemClass = cell.element.toLowerCase();
                html += `<div class="board-card ${elemClass}">`;
                if (isActing) {
                    html += `<div class="acting-badge">Acting</div>`;
                }
                if (isClaimable) {
                    html += `<div class="claim-prompt" title="Claim" aria-label="Claim" onclick="event.stopPropagation(); openClaimPopup(${r}, ${c})"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.4 1.2v13.6M3.4 2.2h8.7L10.4 5.4l1.7 3.2H3.4"/></svg></div>`;
                }
                html += renderBoardNotches(cell.notches, { board, row: r, col: c, isPlayer, legalPlacements });
                html += renderCardArt(cell, 'board');
                html += `<div class="bc-inner">`;
                html += `<div class="bc-name-box"><span class="card-name">${cell.name}</span></div>`;
                html += renderStatusBadgesForCell(cell);
                html += `<div class="bc-stats-box">`;
                {
                    // Temporary shields are tracked separately from max HP
                    // (shieldHp), so the bar can show permanent max-health
                    // boosts normally. Shield points overlay the green HP bar
                    // with grey metal plates — one per shield point — that
                    // animate off as the shield breaks.
                    const _barMax = Number(cell.maxHp);
                    const _barHp = Number(cell.hp);
                    const _pct = _barMax > 0 ? Math.max(0, Math.min(100, (_barHp / _barMax) * 100)) : 0;
                    const _shield = Math.max(0, Number(cell.shieldHp) || 0);
                    const _platesHtml = _shield > 0
                        ? `<div class="shield-plates" data-shield="${_shield}">${
                                Array.from({ length: _shield },
                                    (_, i) => `<div class="shield-plate" data-plate-index="${i}"></div>`
                                ).join('')
                            }</div>`
                        : '';
                    html += `<div class="hp-bar${_shield > 0 ? ' is-shielded' : ''}">`
                        + `<div class="hp-fill" style="width:${_pct}%"></div>`
                        + _platesHtml
                        + `</div>`;
                }
                const combat = renderBoardCellCombatStatsInner(cell);
                html += `<div class="card-stats">`;
                html += `<span class="stat stat-hp">${combat.hpInner}</span>`;
                html += `<span class="stat stat-spd">${combat.spdInner}</span>`;
                if (combat.dmgBlock) {
                    html += combat.dmgBlock;
                }
                html += `</div>`;
                html += `</div>`;
                html += `</div>`;
                if (isLegal) {
                    html += `<div class="evolve-prompt">Evolve</div>`;
                }
                html += `</div>`;
            } else if (isLegal) {
                html += `<div class="placement-prompt">+ Place</div>`;
            }

            html += `</div>`;
        }
    }

    grid.innerHTML = html;
    renderLinkConnectors(gridId, board, isPlayer);
    const side = isPlayer ? gameState?.player : gameState?.enemy;
    renderNexusOverlays(gridId, board, isPlayer, side?.nexusPoints || []);
}

function collectBoardCellElements(grid) {
    const map = new Map();
    grid.querySelectorAll(':scope > .board-cell').forEach((el) => {
        const r = Number(el.dataset.row);
        const c = Number(el.dataset.col);
        if (Number.isInteger(r) && Number.isInteger(c)) {
            map.set(`${r}:${c}`, el);
        }
    });
    return map;
}

const NOTCH_LATTICE_LOCAL = {
    TOP: [1, 0],
    TOP_RIGHT: [2, 0],
    RIGHT: [2, 1],
    BOTTOM_RIGHT: [2, 2],
    BOTTOM: [1, 2],
    BOTTOM_LEFT: [0, 2],
    LEFT: [0, 1],
    TOP_LEFT: [0, 0]
};

function notchLatticeKey(boardRow, boardCol, direction, isPlayer) {
    const loc = NOTCH_LATTICE_LOCAL[direction];
    if (!loc) return null;
    const localY = isPlayer ? 2 - loc[1] : loc[1];
    const x = boardCol * 2 + loc[0];
    const y = boardRow * 2 + localY;
    return `${x}:${y}`;
}

function collectLatticeNotchContributions(board, isPlayer) {
    const map = new Map();
    const countedConnections = new Set();
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const cell = board[r][c];
            if (!cell?.notches) continue;
            for (const notch of cell.notches) {
                const delta = directionDelta(notch.direction, isPlayer);
                const nr = r + delta.dy;
                const nc = c + delta.dx;
                if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
                const neighbor = board[nr]?.[nc];
                if (!neighbor?.notches) continue;
                const opposite = getOppositeDirection(notch.direction);
                const neighborNotch = neighbor.notches.find((n) => n.direction === opposite);
                if (!neighborNotch) continue;

                const fromCellKey = `${r}:${c}`;
                const toCellKey = `${nr}:${nc}`;
                const connectionKey = fromCellKey < toCellKey
                    ? `${fromCellKey}|${toCellKey}`
                    : `${toCellKey}|${fromCellKey}`;
                if (countedConnections.has(connectionKey)) continue;
                countedConnections.add(connectionKey);

                const fromKey = notchLatticeKey(r, c, notch.direction, isPlayer);
                const toKey = notchLatticeKey(nr, nc, neighborNotch.direction, isPlayer);
                const key = resolveNexusContributionKey(fromKey, toKey);
                if (!key) continue;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(
                    { r, c, direction: notch.direction, element: notch.element },
                    { r: nr, c: nc, direction: neighborNotch.direction, element: neighborNotch.element }
                );
            }
        }
    }
    return map;
}

function resolveNexusContributionKey(fromKey, toKey) {
    if (!fromKey || !toKey) return null;
    if (fromKey === toKey) {
        return isInteriorLatticeKey(fromKey) ? fromKey : null;
    }
    const [fx, fy] = fromKey.split(':').map(Number);
    const [tx, ty] = toKey.split(':').map(Number);
    if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(tx) || !Number.isFinite(ty)) {
        return null;
    }
    if ((fx + tx) % 2 !== 0 || (fy + ty) % 2 !== 0) {
        return null;
    }
    const midKey = `${(fx + tx) / 2}:${(fy + ty) / 2}`;
    return isInteriorLatticeKey(midKey) ? midKey : null;
}

function isInteriorLatticeKey(key) {
    const [x, y] = String(key || '').split(':').map(Number);
    return x > 0 && x < 6 && y > 0 && y < 6;
}

function getNotchOutgoingAnchor(grid, cellRefs, r, c, direction, _isPlayer) {
    const fromCell = cellRefs.get(`${r}:${c}`);
    if (!fromCell) return null;
    const fromLocal = getBoardCellLocalRect(grid, fromCell);
    if (!fromLocal) return null;
    const cx = fromLocal.left + fromLocal.width / 2;
    const cy = fromLocal.top + fromLocal.height / 2;
    switch (direction) {
        case 'TOP': return { x: cx, y: fromLocal.top };
        case 'BOTTOM': return { x: cx, y: fromLocal.bottom };
        case 'LEFT': return { x: fromLocal.left, y: cy };
        case 'RIGHT': return { x: fromLocal.right, y: cy };
        case 'TOP_LEFT': return { x: fromLocal.left, y: fromLocal.top };
        case 'TOP_RIGHT': return { x: fromLocal.right, y: fromLocal.top };
        case 'BOTTOM_LEFT': return { x: fromLocal.left, y: fromLocal.bottom };
        case 'BOTTOM_RIGHT': return { x: fromLocal.right, y: fromLocal.bottom };
        default: return null;
    }
}

function renderNexusOverlays(gridId, board, isPlayer, nexusPoints) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.querySelectorAll('.nexus-overlay').forEach((el) => el.remove());
    if (!nexusPoints || nexusPoints.length === 0) return;

    const cellRefs = collectBoardCellElements(grid);
    const contribMap = collectLatticeNotchContributions(board, isPlayer);

    for (const np of nexusPoints) {
        const key = `${np.x}:${np.y}`;
        const entries = contribMap.get(key) || [];
        const anchors = [];
        for (const e of entries) {
            const a = getNotchOutgoingAnchor(grid, cellRefs, e.r, e.c, e.direction, isPlayer);
            if (a) anchors.push({ ...a, element: e.element });
        }
        if (anchors.length === 0) continue;

        const hubX = anchors.reduce((s, a) => s + a.x, 0) / anchors.length;
        const hubY = anchors.reduce((s, a) => s + a.y, 0) / anchors.length;
        const tier = Math.min(4, Math.max(2, Number(np.notchCount) || anchors.length));
        const pad = 6;
        let minX = hubX;
        let maxX = hubX;
        let minY = hubY;
        let maxY = hubY;
        for (const a of anchors) {
            minX = Math.min(minX, a.x);
            maxX = Math.max(maxX, a.x);
            minY = Math.min(minY, a.y);
            maxY = Math.max(maxY, a.y);
        }
        minX -= pad;
        maxX += pad;
        minY -= pad;
        maxY += pad;
        const boxW = Math.max(24, maxX - minX);
        const boxH = Math.max(24, maxY - minY);

        const wrap = document.createElement('div');
        wrap.className = `nexus-overlay nexus-tier-${tier}`;
        wrap.style.left = `${minX}px`;
        wrap.style.top = `${minY}px`;
        wrap.style.width = `${boxW}px`;
        wrap.style.height = `${boxH}px`;

        const hx = hubX - minX;
        const hy = hubY - minY;
        const hubR = tier === 2 ? 7 : tier === 3 ? 8 : 9;
        const hubDistinct = normalizeNexusContributingElements(np, entries);
        let svg = `<svg class="nexus-svg" width="${boxW}" height="${boxH}" viewBox="0 0 ${boxW} ${boxH}" aria-hidden="true">`;
        for (const a of anchors) {
            const ax = a.x - minX;
            const ay = a.y - minY;
            const col = getElementHex(a.element) || 'rgba(200,210,255,0.5)';
            svg += `<line x1="${hx}" y1="${hy}" x2="${ax}" y2="${ay}" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity="0.85"/>`;
        }
        svg += buildNexusHubGraphics(hx, hy, hubR, hubDistinct);
        svg += '</svg>';
        wrap.innerHTML = svg;
        grid.appendChild(wrap);
    }
}

/**
 * Cell box in the same coordinate system as absolutely positioned children of the grid
 * (origin = grid padding edge). Avoids getBoundingClientRect drift vs CSS left/top when
 * layout is driven by dvh, subpixel rounding, or compositor timing.
 */
function getBoardCellLocalRect(grid, cellEl) {
    if (!grid || !cellEl) return null;
    let left = 0;
    let top = 0;
    let n = cellEl;
    while (n && n !== grid) {
        left += n.offsetLeft;
        top += n.offsetTop;
        n = n.offsetParent;
    }
    if (n !== grid) {
        const gr = grid.getBoundingClientRect();
        const br = cellEl.getBoundingClientRect();
        return {
            left: br.left - gr.left,
            top: br.top - gr.top,
            width: br.width,
            height: br.height,
            right: br.left - gr.left + br.width,
            bottom: br.top - gr.top + br.height
        };
    }
    const width = cellEl.offsetWidth;
    const height = cellEl.offsetHeight;
    return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height
    };
}

function renderLinkConnectors(gridId, board, isPlayer) {
    const grid = document.getElementById(gridId);
    grid.querySelectorAll('.link-connector, .external-energy-point').forEach(el => el.remove());

    const rowOrder = isPlayer ? [2, 1, 0] : [0, 1, 2];
    const links = [];
    const activeExternalSockets = new Map();
    const cellRefs = collectBoardCellElements(grid);

    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const cell = board[r][c];
            if (!cell || !cell.notches) continue;

            for (const notch of cell.notches) {
                const delta = directionDelta(notch.direction, isPlayer);
                const nr = r + delta.dy;
                const nc = c + delta.dx;
                if (nr < 0 || nr > 2 || nc < 0 || nc > 2) {
                    const socket = getExternalSocketForNotch(r, c, isPlayer, notch.direction);
                    if (socket && !activeExternalSockets.has(socket.key)) {
                        activeExternalSockets.set(socket.key, {
                            ...socket,
                            element: notch.element
                        });
                    }
                    continue;
                }

                const neighbor = board[nr][nc];
                if (!neighbor || !hasOppositeNotch(neighbor.notches, notch.direction)) continue;

                const key = [Math.min(r, nr), Math.min(c, nc), Math.max(r, nr), Math.max(c, nc), notch.direction].join(',');
                const reverseKey = [Math.min(r, nr), Math.min(c, nc), Math.max(r, nr), Math.max(c, nc),
                    getOppositeDirection(notch.direction)].join(',');
                if (links.some(l => l.key === key || l.key === reverseKey)) continue;

                const neighborNotch = neighbor.notches.find(n => n.direction === getOppositeDirection(notch.direction));
                links.push({
                    key,
                    fromRow: r, fromCol: c,
                    toRow: nr, toCol: nc,
                    direction: notch.direction,
                    fromElement: notch.element,
                    toElement: neighborNotch ? neighborNotch.element : notch.element
                });
            }
        }
    }

    const memorySide = isPlayer ? 'player' : 'enemy';
    // External sockets should reflect the current board state (not latched permanently).
    // Clear any previously remembered socket elements before repopulating.
    externalSocketElementMemory[memorySide] = Object.create(null);
    const freshMem = externalSocketElementMemory[memorySide];
    activeExternalSockets.forEach((info, key) => {
        freshMem[key] = info.element;
    });

    for (const link of links) {
        const fromCell = cellRefs.get(`${link.fromRow}:${link.fromCol}`);
        const toCell = cellRefs.get(`${link.toRow}:${link.toCol}`);
        if (!fromCell || !toCell) continue;

        const fromLocal = getBoardCellLocalRect(grid, fromCell);
        const toLocal = getBoardCellLocalRect(grid, toCell);
        if (!fromLocal || !toLocal) continue;

        const fromX = fromLocal.left + fromLocal.width / 2;
        const fromY = fromLocal.top + fromLocal.height / 2;
        const toX = toLocal.left + toLocal.width / 2;
        const toY = toLocal.top + toLocal.height / 2;

        const dx = link.toCol - link.fromCol;
        const dy = link.toRow - link.fromRow;
        const isHorizontal = dy === 0;
        const isVertical = dx === 0;
        const fromGridRow = rowOrder.indexOf(link.fromRow);
        const toGridRow = rowOrder.indexOf(link.toRow);

        let startX, startY, endX, endY;
        if (isHorizontal) {
            startX = Math.min(fromLocal.right, toLocal.right);
            endX = Math.max(fromLocal.left, toLocal.left);
            if (dx > 0) { startX = fromLocal.right; endX = toLocal.left; }
            else { startX = toLocal.right; endX = fromLocal.left; }
            startY = fromY;
            endY = toY;
        } else if (isVertical) {
            startX = fromX;
            endX = toX;
            const fromBottom = fromLocal.bottom;
            const toTop = toLocal.top;
            const fromTop = fromLocal.top;
            const toBottom = toLocal.bottom;
            if (fromGridRow < toGridRow) { startY = fromBottom; endY = toTop; }
            else { startY = toBottom; endY = fromTop; }
        } else {
            startX = dx > 0 ? fromLocal.right : fromLocal.left;
            endX = dx > 0 ? toLocal.left : toLocal.right;
            startY = fromGridRow < toGridRow ? fromLocal.bottom : fromLocal.top;
            endY = fromGridRow < toGridRow ? toLocal.top : toLocal.bottom;
        }

        const sameElement = link.fromElement === link.toElement;
        const fromColor = getElementHex(link.fromElement);
        const toColor = getElementHex(link.toElement);

        const connector = document.createElement('div');
        connector.className = 'link-connector';

        const svgW = Math.abs(endX - startX) || 8;
        const svgH = Math.abs(endY - startY) || 8;
        const minX = Math.min(startX, endX);
        const minY = Math.min(startY, endY);

        connector.style.left = minX + 'px';
        connector.style.top = minY + 'px';
        connector.style.width = svgW + 'px';
        connector.style.height = svgH + 'px';

        const localSX = startX - minX;
        const localSY = startY - minY;
        const localEX = endX - minX;
        const localEY = endY - minY;

        let svgContent;
        if (sameElement) {
            svgContent = `<line x1="${localSX}" y1="${localSY}" x2="${localEX}" y2="${localEY}" stroke="${fromColor}" stroke-width="6" stroke-linecap="round"/>`;
        } else {
            const midX = (localSX + localEX) / 2;
            const midY = (localSY + localEY) / 2;
            if (isVertical) {
                const zigW = 4;
                const steps = 5;
                const segH = Math.abs(localEY - localSY) / (steps * 2);
                let d1 = `M${localSX},${localSY}`;
                let d2 = `M${midX},${midY}`;
                for (let i = 0; i < steps; i++) {
                    const y1 = localSY + (i * 2) * segH;
                    const y2 = localSY + (i * 2 + 1) * segH;
                    const y3 = localSY + (i * 2 + 2) * segH;
                    d1 += ` L${midX + zigW},${y2} L${midX - zigW},${y3}`;
                }
                d2 = `M${midX},${midY}`;
                for (let i = steps; i < steps * 2; i++) {
                    const y1 = localSY + (i * 2) * (segH / 2);
                    const y2 = localSY + (i * 2 + 1) * (segH / 2);
                    d2 += ` L${midX + zigW},${y1} L${midX - zigW},${y2}`;
                }
                svgContent = `<line x1="${localSX}" y1="${localSY}" x2="${midX}" y2="${midY}" stroke="${fromColor}" stroke-width="6" stroke-linecap="round"/>`;
                svgContent += `<line x1="${midX}" y1="${midY}" x2="${localEX}" y2="${localEY}" stroke="${toColor}" stroke-width="6" stroke-linecap="round"/>`;
                const zigCount = 6;
                const totalLen = Math.abs(localEY - localSY);
                const zigH2 = totalLen / zigCount;
                let zigPath = `M${localSX},${localSY}`;
                for (let i = 0; i < zigCount; i++) {
                    const zy = localSY + (i + 0.5) * zigH2;
                    const zy2 = localSY + (i + 1) * zigH2;
                    const zx = (i % 2 === 0) ? midX + 5 : midX - 5;
                    zigPath += ` L${zx},${zy} L${midX},${zy2}`;
                }
                svgContent = `<path d="${zigPath}" fill="none" stroke="${fromColor}" stroke-width="4" stroke-linecap="round"/>`;
                let zigPath2 = `M${midX},${midY}`;
                const halfLen = totalLen / 2;
                for (let i = 0; i < zigCount / 2; i++) {
                    const zy = midY + (i + 0.5) * (halfLen / (zigCount / 2));
                    const zy2 = midY + (i + 1) * (halfLen / (zigCount / 2));
                    const zx = (i % 2 === 0) ? midX + 5 : midX - 5;
                    zigPath2 += ` L${zx},${zy} L${midX},${zy2}`;
                }
                svgContent = '';
                const fullZigPath = buildZigZagPath(localSX, localSY, localEX, localEY, 5, 6);
                svgContent += `<path d="${fullZigPath}" fill="none" stroke="url(#grad-${connector.id})" stroke-width="5" stroke-linecap="round"/>`;
                const gradId = 'lg-' + Math.random().toString(36).substr(2, 6);
                const isDown = localEY > localSY;
                svgContent = `<defs><linearGradient id="${gradId}" x1="0" y1="${isDown ? 0 : 1}" x2="0" y2="${isDown ? 1 : 0}"><stop offset="45%" stop-color="${fromColor}"/><stop offset="55%" stop-color="${toColor}"/></linearGradient></defs>`;
                svgContent += `<path d="${fullZigPath}" fill="none" stroke="url(#${gradId})" stroke-width="5" stroke-linecap="round"/>`;
            } else if (isHorizontal) {
                const gradId = 'lg-' + Math.random().toString(36).substr(2, 6);
                const isRight = localEX > localSX;
                svgContent = `<defs><linearGradient id="${gradId}" x1="${isRight ? 0 : 1}" y1="0" x2="${isRight ? 1 : 0}" y2="0"><stop offset="45%" stop-color="${fromColor}"/><stop offset="55%" stop-color="${toColor}"/></linearGradient></defs>`;
                const fullZigPath = buildZigZagPath(localSX, localSY, localEX, localEY, 5, 6);
                svgContent += `<path d="${fullZigPath}" fill="none" stroke="url(#${gradId})" stroke-width="5" stroke-linecap="round"/>`;
            } else {
                const gradId = 'lg-' + Math.random().toString(36).substr(2, 6);
                svgContent = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="45%" stop-color="${fromColor}"/><stop offset="55%" stop-color="${toColor}"/></linearGradient></defs>`;
                const fullZigPath = buildZigZagPath(localSX, localSY, localEX, localEY, 5, 6);
                svgContent += `<path d="${fullZigPath}" fill="none" stroke="url(#${gradId})" stroke-width="5" stroke-linecap="round"/>`;
            }
        }

        connector.innerHTML = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${svgContent}</svg>`;
        grid.appendChild(connector);
    }

    for (const socket of getAllExternalSockets(isPlayer)) {
        const cellEl = cellRefs.get(`${socket.row}:${socket.col}`);
        if (!cellEl) continue;

        const cellLocal = getBoardCellLocalRect(grid, cellEl);
        if (!cellLocal) continue;

        const point = getExternalSocketPoint(cellLocal, socket.side);
        const activeSocket = activeExternalSockets.get(socket.key);

        if (activeSocket) {
            const anchor = getCellEdgeAnchor(cellLocal, activeSocket.direction);
            appendExternalLink(grid, anchor, point, getElementHex(activeSocket.element));
        }

        appendExternalEnergyPoint(grid, point, activeSocket?.element || null);
    }
}

let boardLinkConnectorRefreshRaf = null;

function refreshBoardLinkConnectors() {
    if (!gameState) return;
    const playerGrid = document.getElementById('playerGrid');
    const enemyGrid = document.getElementById('enemyGrid');
    if (!playerGrid || !enemyGrid) return;
    renderLinkConnectors('enemyGrid', gameState.enemyBoard, false);
    renderNexusOverlays('enemyGrid', gameState.enemyBoard, false, gameState.enemy?.nexusPoints || []);
    renderLinkConnectors('playerGrid', gameState.playerBoard, true);
    renderNexusOverlays('playerGrid', gameState.playerBoard, true, gameState.player?.nexusPoints || []);
}

function scheduleBoardLinkConnectorRefresh() {
    if (!gameState) return;
    if (boardLinkConnectorRefreshRaf != null) return;
    boardLinkConnectorRefreshRaf = requestAnimationFrame(() => {
        boardLinkConnectorRefreshRaf = null;
        requestAnimationFrame(() => {
            refreshBoardLinkConnectors();
        });
    });
}

function getAllExternalSockets(isPlayer) {
    const sockets = [];
    for (let row = 0; row < 3; row++) {
        sockets.push({ key: `left-${row}`, row, col: 0, side: 'left', direction: 'LEFT' });
        sockets.push({ key: `right-${row}`, row, col: 2, side: 'right', direction: 'RIGHT' });
    }

    const outerDirection = isPlayer ? 'BOTTOM' : 'TOP';
    const outerSide = isPlayer ? 'bottom' : 'top';
    for (let col = 0; col < 3; col++) {
        sockets.push({ key: `outer-${col}`, row: 0, col, side: outerSide, direction: outerDirection });
    }

    return sockets;
}

function getExternalSocketForNotch(row, col, isPlayer, direction) {
    if (direction === 'LEFT' && col === 0) {
        return { key: `left-${row}`, row, col, side: 'left', direction };
    }
    if (direction === 'RIGHT' && col === 2) {
        return { key: `right-${row}`, row, col, side: 'right', direction };
    }

    const outerDirection = isPlayer ? 'BOTTOM' : 'TOP';
    if (direction === outerDirection && row === 0) {
        return {
            key: `outer-${col}`,
            row,
            col,
            side: isPlayer ? 'bottom' : 'top',
            direction
        };
    }

    return null;
}

function getCellEdgeAnchor(local, direction) {
    const centerX = local.left + local.width / 2;
    const centerY = local.top + local.height / 2;
    switch (direction) {
        case 'LEFT':
            return { x: local.left, y: centerY };
        case 'RIGHT':
            return { x: local.right, y: centerY };
        case 'TOP':
            return { x: centerX, y: local.top };
        case 'BOTTOM':
            return { x: centerX, y: local.bottom };
        default:
            return { x: centerX, y: centerY };
    }
}

function getExternalSocketPoint(local, side) {
    const centerX = local.left + local.width / 2;
    const centerY = local.top + local.height / 2;
    const offset = Math.max(12, Math.round(Math.min(local.width, local.height) * 0.12));

    switch (side) {
        case 'left':
            return { x: local.left - offset, y: centerY };
        case 'right':
            return { x: local.right + offset, y: centerY };
        case 'top':
            return { x: centerX, y: local.top - offset };
        case 'bottom':
            return { x: centerX, y: local.bottom + offset };
        default:
            return { x: centerX, y: centerY };
    }
}

function appendExternalLink(grid, start, end, color) {
    const connector = document.createElement('div');
    connector.className = 'link-connector external-link';

    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const svgW = Math.abs(end.x - start.x) || 8;
    const svgH = Math.abs(end.y - start.y) || 8;
    const localSX = start.x - minX;
    const localSY = start.y - minY;
    const localEX = end.x - minX;
    const localEY = end.y - minY;

    connector.style.left = `${minX}px`;
    connector.style.top = `${minY}px`;
    connector.style.width = `${svgW}px`;
    connector.style.height = `${svgH}px`;
    connector.innerHTML = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}"><line x1="${localSX}" y1="${localSY}" x2="${localEX}" y2="${localEY}" stroke="${color}" stroke-width="5" stroke-linecap="round"/></svg>`;
    grid.appendChild(connector);
}

function appendExternalEnergyPoint(grid, point, element) {
    const node = document.createElement('div');
    const activeClass = element ? ` active ${String(element).toLowerCase()}` : '';
    node.className = `external-energy-point${activeClass}`;
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    grid.appendChild(node);
}

function getOppositeDirection(dir) {
    return { TOP:'BOTTOM', TOP_RIGHT:'BOTTOM_LEFT', RIGHT:'LEFT', BOTTOM_RIGHT:'TOP_LEFT',
             BOTTOM:'TOP', BOTTOM_LEFT:'TOP_RIGHT', LEFT:'RIGHT', TOP_LEFT:'BOTTOM_RIGHT' }[dir];
}

function buildZigZagPath(x1, y1, x2, y2, amplitude, count) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    let d = `M${x1},${y1}`;
    for (let i = 0; i < count; i++) {
        const t1 = (i + 0.5) / count;
        const t2 = (i + 1) / count;
        const side = (i % 2 === 0) ? 1 : -1;
        const mx = x1 + dx * t1 + px * amplitude * side;
        const my = y1 + dy * t1 + py * amplitude * side;
        const ex = x1 + dx * t2;
        const ey = y1 + dy * t2;
        d += ` L${mx.toFixed(1)},${my.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`;
    }
    return d;
}

const ALL_DIRECTIONS = ['TOP', 'TOP_RIGHT', 'RIGHT', 'BOTTOM_RIGHT', 'BOTTOM', 'BOTTOM_LEFT', 'LEFT', 'TOP_LEFT'];

function renderBoardNotches(notches, options) {
    const notchMap = {};
    for (const n of (notches || [])) {
        notchMap[n.direction] = n;
    }
    let html = `<div class="bc-notches">`;
    for (const dir of ALL_DIRECTIONS) {
        const notch = notchMap[dir];
        if (notch) {
            const elemClass = notch.element.toLowerCase();
            let stateClass = '';
            if (options.board) {
                stateClass = getNotchStateClass(notch, { ...options, isBoard: true });
            }
            html += `<div class="bc-notch bc-notch-${dir} filled ${elemClass} ${stateClass}"></div>`;
        } else {
            html += `<div class="bc-notch bc-notch-${dir} empty"></div>`;
        }
    }
    html += `</div>`;
    return html;
}

function renderHandNotches(notches) {
    const notchMap = {};
    for (const n of (notches || [])) {
        notchMap[n.direction] = n;
    }
    let html = `<div class="hand-notches"><div class="notch-center"></div>`;
    for (const dir of ALL_DIRECTIONS) {
        const notch = notchMap[dir];
        if (notch) {
            const elemClass = notch.element.toLowerCase();
            html += `<div class="notch-dot ${elemClass} notch-${dir}"></div>`;
        } else {
            html += `<div class="notch-dot notch-${dir}"></div>`;
        }
    }
    html += `</div>`;
    return html;
}

function renderNotches(notches, options = {}) {
    if (!notches || notches.length === 0) return '';

    const scopeClass = options.isBoard ? 'board-notches' : 'hand-notches';
    let html = `<div class="notch-display ${scopeClass}"><div class="notch-center"></div>`;

    for (const notch of notches) {
        const elemClass = notch.element.toLowerCase();
        let stateClass = '';

        if (options.board) {
            stateClass = getNotchStateClass(notch, options);
        }

        html += `<div class="notch-dot ${elemClass} notch-${notch.direction} ${stateClass}"></div>`;
    }

    html += `</div>`;
    return html;
}

function getNotchStateClass(notch, options) {
    const delta = directionDelta(notch.direction, options.isPlayer);
    const row = options.row + delta.dy;
    const col = options.col + directionDelta(notch.direction).dx;
    const socket = getExternalSocketForNotch(options.row, options.col, options.isPlayer, notch.direction);

    if (row < 0 || row > 2 || col < 0 || col > 2) {
        return socket ? 'external' : '';
    }

    const neighbor = options.board[row][col];
    if (neighbor && hasOppositeNotch(neighbor.notches, notch.direction)) {
        return 'linked';
    }

    if (!neighbor && options.isPlayer && gameState.currentPhase === 'SETUP' && selectedCard && selectedCard.type === 'SIEGLING'
        && options.legalPlacements.some(p => p[0] === row && p[1] === col)) {
        return 'expandable';
    }

    return '';
}

function directionDelta(direction, isPlayer = false) {
    switch (direction) {
        case 'TOP': return { dx: 0, dy: isPlayer ? 1 : -1 };
        case 'TOP_RIGHT': return { dx: 1, dy: isPlayer ? 1 : -1 };
        case 'RIGHT': return { dx: 1, dy: 0 };
        case 'BOTTOM_RIGHT': return { dx: 1, dy: isPlayer ? -1 : 1 };
        case 'BOTTOM': return { dx: 0, dy: isPlayer ? -1 : 1 };
        case 'BOTTOM_LEFT': return { dx: -1, dy: isPlayer ? -1 : 1 };
        case 'LEFT': return { dx: -1, dy: 0 };
        case 'TOP_LEFT': return { dx: -1, dy: isPlayer ? 1 : -1 };
        default: return { dx: 0, dy: 0 };
    }
}

function hasOppositeNotch(notches, direction) {
    const opposite = {
        TOP: 'BOTTOM',
        TOP_RIGHT: 'BOTTOM_LEFT',
        RIGHT: 'LEFT',
        BOTTOM_RIGHT: 'TOP_LEFT',
        BOTTOM: 'TOP',
        BOTTOM_LEFT: 'TOP_RIGHT',
        LEFT: 'RIGHT',
        TOP_LEFT: 'BOTTOM_RIGHT'
    }[direction];

    return notches.some(n => n.direction === opposite);
}

function renderHand() {
    const container = document.getElementById('playerHand');
    const handTray = document.getElementById('handTray');
    const handTitle = document.getElementById('desktopHandSectionTitle');
    const battlePanel = document.getElementById('desktopHandBattlePanel');
    const handHidden = isHandHiddenForPhase();
    if (handTitle) {
        handTitle.textContent = handHidden ? 'Battle Action' : 'Hand Selector';
    }
    if (handHidden) {
        if (handTray) {
            handTray.classList.add('battle-queue-mode');
        }
        if (container) {
            container.classList.add('hidden');
        }
        if (battlePanel) {
            battlePanel.classList.remove('hidden');
        }
        return;
    }
    if (handTray) {
        handTray.classList.remove('battle-queue-mode');
    }
    if (container) {
        container.classList.remove('hidden');
    }
    if (battlePanel) {
        battlePanel.classList.add('hidden');
    }
    if (!gameState.player.hand || gameState.player.hand.length === 0) {
        container.innerHTML = '<div style="color:var(--text-dim);font-size:0.8em;">No cards in hand</div>';
        scheduleDesktopHandSelectorCardScale();
        return;
    }

    let html = '';
    const hand = gameState.player.hand;
    for (let handIndex = 0; handIndex < hand.length; handIndex++) {
        const card = hand[handIndex];
        const elemClass = card.element.toLowerCase();
        const isSelected = selectedHandIndex === handIndex;
        const lockReason = getHandCardLockReason(card);
        const openingLocked = isOpeningPlacementOnlyTurn() && card.type !== 'SIEGLING';
        const placementLocked = isPlacementBudgetLockedForCard(card) && card.type === 'SIEGLING';
        const interactionClass = [
            isSelected ? ' selected' : '',
            lockReason ? ' interaction-locked' : '',
            openingLocked ? ' opening-locked' : '',
            placementLocked ? ' placement-locked' : '',
            targetMode ? ' target-lock' : ''
        ].join('');
        const onclick = `onclick="selectCard(${handIndex})"`;
        const hoverEvents = `onmouseenter="handleHandCardPointerEnter(event, ${handIndex})" onmouseleave="handleHandCardPointerLeave(${handIndex})"`;
        const touchEvents = `ontouchstart="handleHandCardTouchStart(event, ${handIndex})" ontouchmove="handleHandCardTouchMove(event, ${handIndex})" ontouchend="handleHandCardTouchEnd(event, ${handIndex})"`;
        const fallbackArtLabel = card.type === 'SIEGLING'
            ? formatElementLabel(card.element)
            : `${formatElementLabel(card.element)} ${card.type}`.trim();
        html += `<div class="hand-card ${elemClass}${interactionClass}" data-card-id="${escapeHtml(card.id)}" data-hand-index="${handIndex}" ${onclick} ${hoverEvents} ${touchEvents}>`;
        if (card.type === 'SIEGLING') {
            html += renderHandNotches(card.notches);
        }
        html += `<div class="hand-card-shell">`;
        html += `<div class="hand-card-header">`;
        html += `<div class="card-title">${escapeHtml(card.name)}</div>`;
        html += `<div class="card-label">${escapeHtml(card.type)} / ${escapeHtml(card.rarity)}</div>`;
        html += `</div>`;
        html += renderCardArt(card, 'hand', fallbackArtLabel);
        html += `<div class="hand-card-body">`;
        if (card.type === 'SIEGLING') {
            html += `<div class="card-detail card-stats-line">HP:${card.health} SPD:${card.speed}</div>`;
        }
        html += renderCardAbilitiesFlavorSection(card);
        if (card.type === 'TRAP' && card.trapBucketElement) {
            html += `<div class="card-cost">Can Trigger when opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)} Energy</div>`;
        } else if (card.costElement) {
            html += `<div class="card-cost">Play Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}</div>`;
        } else if (card.requiredComboSize) {
            html += `<div class="card-cost">Combo: ${card.requiredComboSignature ? card.requiredComboSignature.replaceAll('+', ' / ') : `${card.requiredComboSize}-element combo`}</div>`;
        }
        if (card.requiredReaction) {
            html += `<div class="card-cost">Requires: ${escapeHtml(card.requiredReaction)}</div>`;
        }
        if (card.evolvesFromName) {
            html += `<div class="card-cost">Evolution: ${escapeHtml(card.evolvesFromName)}</div>`;
        }
        if (lockReason) {
            html += `<div class="card-cost interaction-lock-copy">${escapeHtml(lockReason)}</div>`;
        }
        html += `</div>`; /* body */
        html += `</div>`; /* shell */
        html += `</div>`; /* card */
    }

    container.innerHTML = html;
    scheduleDesktopHandSelectorCardScale();
}

function scheduleDesktopHandSelectorCardScale() {
    if (handSelectorScaleFrame != null) {
        window.cancelAnimationFrame(handSelectorScaleFrame);
    }
    handSelectorScaleFrame = window.requestAnimationFrame(() => {
        handSelectorScaleFrame = null;
        syncDesktopHandSelectorCardScale();
    });
}

function syncDesktopHandSelectorCardScale() {
    if (!isDesktopSidebarLayout() || isHandHiddenForPhase()) {
        return;
    }

    const rail = document.getElementById('playerHand');
    if (!rail || rail.classList.contains('hidden')) {
        return;
    }

    const railRect = rail.getBoundingClientRect();
    if (railRect.width <= 0 || railRect.height <= 0) {
        return;
    }

    const styles = window.getComputedStyle(rail);
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const columnGap = parseFloat(styles.columnGap || styles.gap) || 0;
    const contentHeight = rail.clientHeight - paddingTop - paddingBottom;
    const contentWidth = rail.clientWidth - paddingLeft - paddingRight;
    if (!Number.isFinite(contentHeight) || contentHeight <= 40) {
        return;
    }

    const visibleCards = 5;
    const maxFiveCardWidth = Math.max(
        48,
        (contentWidth - (columnGap * (visibleCards - 1))) / visibleCards
    );
    const measuredWidth = contentHeight * (5 / 7);
    const nextWidth = Math.round(clampNumber(
        Math.min(measuredWidth, maxFiveCardWidth),
        Math.min(96, maxFiveCardWidth),
        Math.max(96, maxFiveCardWidth)
    ));
    const nextPadding = Math.round(clampNumber(nextWidth * 0.035, 3, 8));

    const root = document.documentElement;
    root.style.setProperty('--hand-card-width', `${nextWidth}px`);
    root.style.setProperty('--hand-card-padding', `${nextPadding}px`);
}

function handleHandCardPointerEnter(event, handIndex) {
    if (isMobileLayout()) {
        return;
    }
    hoveredHandIndex = handIndex;
    updateHandLiftLayer();
    syncFocusedCardUi();
    showTooltipHand(event, handIndex);
}

function handleHandCardPointerLeave(handIndex) {
    if (isMobileLayout()) {
        return;
    }
    if (hoveredHandIndex === handIndex) {
        hoveredHandIndex = null;
    }
    updateHandLiftLayer();
    syncFocusedCardUi();
    hideTooltip();
}

function handleHandCardTouchStart(event, handIndex) {
    if (!isMobileLayout()) {
        return;
    }
    const touch = event.changedTouches?.[0];
    if (!touch) {
        return;
    }
    handTouchGesture = {
        handIndex,
        x: touch.clientX,
        y: touch.clientY,
        moved: false
    };
}

function handleHandCardTouchMove(event, handIndex) {
    if (!isMobileLayout() || !handTouchGesture || handTouchGesture.handIndex !== handIndex) {
        return;
    }
    const touch = event.changedTouches?.[0];
    if (!touch) {
        return;
    }
    if (Math.abs(touch.clientX - handTouchGesture.x) > 12 || Math.abs(touch.clientY - handTouchGesture.y) > 12) {
        handTouchGesture.moved = true;
    }
}

function handleHandCardTouchEnd(event, handIndex) {
    if (!isMobileLayout()) {
        return;
    }
    const shouldSelect = Boolean(handTouchGesture && handTouchGesture.handIndex === handIndex && !handTouchGesture.moved);
    handTouchGesture = null;
    if (!shouldSelect) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectCard(handIndex);
    handTouchSuppressHandIndex = handIndex;
    handTouchSuppressUntil = Date.now() + 500;
}

function renderMulliganOverlay() {
    const overlay = document.getElementById('mulliganOverlay');
    const preview = document.getElementById('mulliganHandPreview');
    const copy = document.getElementById('mulliganCopy');
    const actions = document.getElementById('mulliganActions');
    if (!overlay || !preview || !copy || !actions) {
        return;
    }

    if (!gameState?.mulligan?.active) {
        overlay.classList.remove('visible');
        preview.innerHTML = '';
        mulliganHandSig = '';
        return;
    }

    overlay.classList.add('visible');
    const hand = gameState.player.hand || [];
    if (gameState.mulligan.youPending) {
        const sig = hand.map((c, i) => i + ':' + c.id).join(',');
        if (sig !== mulliganHandSig) {
            mulliganSelectedIndices.clear();
            mulliganHandSig = sig;
        }
        copy.textContent = 'Select any cards to shuffle back into your deck; you draw the same number of new cards. Leave none selected to keep your whole hand. You get one mulligan before the first draw phase.';
    } else if (gameState.mulligan.opponentPending) {
        mulliganHandSig = '';
        copy.textContent = 'Your hand is locked. Waiting for the other player to finish their mulligan decision.';
    } else {
        mulliganHandSig = '';
        copy.textContent = 'Both players locked their opening hands. The first draw phase is about to begin.';
    }

    actions.classList.toggle('hidden', !gameState.mulligan.youPending);
    const redrawBtn = document.getElementById('btnMulliganRedraw');
    if (redrawBtn && gameState.mulligan.youPending) {
        const n = mulliganSelectedIndices.size;
        redrawBtn.disabled = n === 0;
        redrawBtn.textContent = n === 0 ? 'Redraw selected' : `Redraw ${n} card${n === 1 ? '' : 's'}`;
    }

    preview.innerHTML = hand.map((card, index) => {
        const isSelected = mulliganSelectedIndices.has(index);
        const interactive = gameState.mulligan.youPending;
        const slotClasses = [
            'mulligan-card-slot',
            (card.element || 'NEUTRAL').toLowerCase(),
            isSelected ? 'is-selected' : '',
            interactive ? 'is-interactive' : ''
        ].filter(Boolean).join(' ');
        const role = interactive ? ' role="button" tabindex="0" aria-pressed="' + (isSelected ? 'true' : 'false') + '"' : '';
        const click = interactive ? ` onclick="toggleMulliganCard(${index})"` : '';
        const showcase = renderShowcaseCard(card, { artVariant: 'preview', cardClass: 'mulligan-showcase' });
        const badge = isSelected
            ? `<div class="mulligan-redraw-badge" aria-hidden="true">Redraw</div>`
            : '';
        return `
        <div class="${slotClasses}" data-index="${index}"${role}${click}>
            ${badge}
            ${showcase}
        </div>`;
    }).join('');
}

function renderLog() {
    const log = document.getElementById('gameLog');
    renderGameLogToolbar();
    if (!log || !gameState?.gameLog) {
        renderDesktopActionHistory();
        return;
    }

    let html = '';
    for (const entry of getFilteredGameLog(gameState.gameLog)) {
        html += `<div class="log-entry">${escapeHtml(entry)}</div>`;
    }
    log.innerHTML = html;
    log.scrollTop = 0;
    renderDesktopActionHistory();
}

function getStandbyBattlePreviewCards() {
    const entries = [];
    const board = gameState?.playerBoard || [];
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            const cell = board?.[row]?.[col];
            if (!cell) {
                continue;
            }
            const card = boardCellToPreviewCard(cell);
            entries.push({ card, row, col });
        }
    }
    return entries.sort((left, right) => {
        const speedDiff = Number(right.card?.spd ?? right.card?.speed ?? 0) - Number(left.card?.spd ?? left.card?.speed ?? 0);
        if (speedDiff !== 0) {
            return speedDiff;
        }
        return String(left.card?.name || '').localeCompare(String(right.card?.name || ''));
    });
}

function getSelectedBattlePreviewCard() {
    if (!gameState || gameState.currentPhase !== 'SETUP') {
        return null;
    }
    const hand = gameState.player?.hand || [];
    if (selectedHandIndex != null && hand[selectedHandIndex]) {
        return hand[selectedHandIndex];
    }
    if (selectedCard && hand.some((card) => card === selectedCard || (selectedCard.id && card.id === selectedCard.id))) {
        return selectedCard;
    }
    return null;
}

function findMatchingAbilityForMove(move, abilities) {
    const moveName = String(move?.name || '').trim().toLowerCase();
    if (!moveName) {
        return null;
    }
    return abilities.find((ability) => String(ability?.name || '').trim().toLowerCase() === moveName) || null;
}

function buildStandbyAbilityEntryFromAbility(ability) {
    const passive = Boolean(ability?.passive || ability?.targetType === 'PASSIVE');
    return {
        name: String(ability?.name || 'Ability').trim(),
        description: String(ability?.description || formatAbilitySummaryText(ability) || 'Effect details appear when this card resolves.').trim(),
        costLabel: passive ? 'Passive' : formatBattleAbilityCost(ability),
        costHtml: passive ? '<span class="battle-cost-free">Passive</span>' : renderBattleAbilityCostEmblems(ability),
        targetLabel: passive ? '' : formatAbilityTargetLabel(ability),
        effectLabel: formatAbilityEffectLabel(ability)
    };
}

function buildStandbyAbilityEntryFromMove(move, matchingAbility) {
    const passive = Boolean(move?.isPassive || matchingAbility?.passive || matchingAbility?.targetType === 'PASSIVE');
    const energy = Number(move?.energyCost ?? getAbilityRequiredEnergy(matchingAbility));
    const safeEnergy = Number.isFinite(energy) ? energy : 0;
    const element = matchingAbility?.requiredElement || matchingAbility?.costElement || '';
    const costLabel = passive
        ? 'Passive'
        : safeEnergy <= 0
        ? 'Free'
        : element
        ? `${safeEnergy} ${formatElementLabel(element)}`
        : `${safeEnergy} energy`;
    const costHtml = passive
        ? '<span class="battle-cost-free">Passive</span>'
        : matchingAbility
        ? renderBattleAbilityCostEmblems(matchingAbility)
        : safeEnergy <= 0
        ? '<span class="battle-cost-free">Free</span>'
        : `<span class="battle-cost-energy">${escapeHtml(String(safeEnergy))} energy</span>`;

    return {
        name: String(move?.name || matchingAbility?.name || 'Ability').trim(),
        description: String(move?.description || matchingAbility?.description || formatAbilitySummaryText(matchingAbility) || 'Effect details appear when this card resolves.').trim(),
        costLabel,
        costHtml,
        targetLabel: passive ? '' : formatAbilityTargetLabel(matchingAbility),
        effectLabel: formatAbilityEffectLabel(matchingAbility)
    };
}

function getSelectedCardBattlePreviewAbilities(card) {
    const abilities = getCardAbilities(card).filter((ability) => !ability?.fromPrintedPassive);
    if (card?.type === 'SIEGLING') {
        const moves = getSieglingMovesForDisplay(card).filter(Boolean);
        if (moves.length > 0) {
            return moves.map((move) => buildStandbyAbilityEntryFromMove(move, findMatchingAbilityForMove(move, abilities)));
        }
    }
    return getSortedBattleAbilities(abilities).map(buildStandbyAbilityEntryFromAbility);
}

function renderStandbyAbilityRows(abilityEntries, fallbackText) {
    if (!abilityEntries || abilityEntries.length === 0) {
        return `<div class="battle-standby-no-ability">${escapeHtml(fallbackText)}</div>`;
    }
    let html = '<div class="battle-standby-abilities">';
    for (const ability of abilityEntries) {
        const chips = [
            ability.costLabel,
            ability.targetLabel,
            ability.effectLabel
        ].filter(Boolean);
        html += '<div class="battle-standby-ability">';
        html += '<div class="battle-standby-ability-top">';
        html += `<span class="battle-standby-ability-name">${escapeHtml(ability.name)}</span>`;
        html += `<span class="battle-standby-ability-cost">${ability.costHtml}</span>`;
        html += '</div>';
        html += `<div class="battle-standby-ability-desc">${escapeHtml(ability.description)}</div>`;
        if (chips.length > 0) {
            html += '<div class="battle-standby-chip-row">';
            chips.forEach((chip) => {
                html += `<span class="battle-standby-chip">${escapeHtml(chip)}</span>`;
            });
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function getSelectedCardBattlePreviewMeta(card) {
    const parts = [
        card?.type || 'CARD',
        formatElementLabel(card?.element),
        card?.rarity
    ].filter(Boolean);
    if (card?.type === 'SIEGLING') {
        const hp = card?.hp ?? card?.health ?? '?';
        const speed = card?.spd ?? card?.speed ?? '?';
        const row = card?.preferredRow ? formatElementLabel(card.preferredRow) : '';
        parts.push(`HP ${hp}`);
        parts.push(`SPD ${speed}`);
        if (row) {
            parts.push(row);
        }
    } else if (card?.type === 'TRAP' && card.trapBucketElement) {
        parts.push(`Trigger ${card.trapBucketAmount || 0} ${formatElementLabel(card.trapBucketElement)}`);
    } else if (card?.costElement && card?.costAmount > 0) {
        parts.push(`Cost ${card.costAmount} ${formatElementLabel(card.costElement)}`);
    }
    if (card?.requiredComboSize) {
        parts.push(card.requiredComboSignature
            ? `Combo ${card.requiredComboSignature.split('+').map(formatElementLabel).join(' + ')}`
            : `Combo ${card.requiredComboSize}`);
    }
    if (card?.requiredReaction) {
        parts.push(`Requires ${formatElementLabel(card.requiredReaction)}`);
    }
    if (card?.evolvesFromName) {
        parts.push(`Evolves from ${card.evolvesFromName}`);
    }
    return parts.join(' | ');
}

function renderSelectedCardBattlePreview(card) {
    const elementClass = String(card?.element || 'neutral').toLowerCase();
    const abilities = getSelectedCardBattlePreviewAbilities(card);
    const lockReason = getHandCardLockReason(card);
    const fallback = card?.type === 'SIEGLING'
        ? 'Basic strike only. No printed battle ability is available for this Siegling.'
        : 'No printed ability text is available for this card.';

    let html = '<div class="battle-standby-preview battle-selected-preview">';
    html += '<div class="battle-attacker"><strong>Selected card preview.</strong> Battle abilities and effects for the card in your hand.</div>';
    html += `<article class="battle-standby-card battle-selected-card ${elementClass}">`;
    html += '<div class="battle-standby-card-head">';
    html += `<div><div class="battle-standby-selected-label">Selected</div><div class="battle-standby-card-name">${escapeHtml(card?.name || 'Card')}</div><div class="battle-standby-card-meta">${escapeHtml(getSelectedCardBattlePreviewMeta(card))}</div></div>`;
    html += `<div class="battle-standby-order">${escapeHtml(String(card?.type || 'Card'))}</div>`;
    html += '</div>';
    if (lockReason) {
        html += `<div class="battle-standby-selected-note">${escapeHtml(lockReason)}</div>`;
    }
    html += renderStandbyAbilityRows(abilities, fallback);
    html += '</article>';
    html += '</div>';
    return html;
}

function renderStandbyBattleAbilityPreview() {
    const selectedPreviewCard = getSelectedBattlePreviewCard();
    if (selectedPreviewCard) {
        return renderSelectedCardBattlePreview(selectedPreviewCard);
    }

    const entries = getStandbyBattlePreviewCards();
    if (entries.length === 0) {
        return '<div class="battle-attacker"><strong>Battle queue is on standby.</strong> Place a Siegling to preview its battle abilities here.</div><div class="battle-hint">When battle begins, this panel becomes the live speed-order action queue.</div>';
    }

    let html = '<div class="battle-standby-preview">';
    html += '<div class="battle-attacker"><strong>Battle queue is on standby.</strong> Review your board abilities before ending setup.</div>';
    html += '<div class="battle-hint">Listed in projected speed order. Energy availability is checked again when each Siegling acts.</div>';
    html += '<div class="battle-standby-list">';
    for (const entry of entries) {
        const card = entry.card;
        const elementClass = String(card?.element || 'neutral').toLowerCase();
        const hp = card?.hp ?? card?.health ?? '?';
        const maxHp = card?.maxHp ?? card?.health ?? '?';
        const speed = card?.spd ?? card?.speed ?? '?';
        const rowLabel = ROW_NAMES[entry.row] || `Row ${entry.row + 1}`;
        const abilities = getSortedBattleAbilities(getCardAbilities(card))
            .filter((ability) => !ability?.fromPrintedPassive)
            .map(buildStandbyAbilityEntryFromAbility);
        html += `<article class="battle-standby-card ${elementClass}">`;
        html += '<div class="battle-standby-card-head">';
        html += `<div><div class="battle-standby-card-name">${escapeHtml(card?.name || 'Siegling')}</div><div class="battle-standby-card-meta">HP ${escapeHtml(String(hp))}/${escapeHtml(String(maxHp))} | SPD ${escapeHtml(String(speed))} | ${escapeHtml(rowLabel)}</div></div>`;
        html += `<div class="battle-standby-order">#${entries.indexOf(entry) + 1}</div>`;
        html += '</div>';
        html += renderStandbyAbilityRows(abilities, 'Basic strike only. No printed battle ability is available for this Siegling.');
        html += '</article>';
    }
    html += '</div>';
    html += '</div>';
    return html;
}

function renderRowSelectBattleConfirm() {
    if (!isRowSelectBattleTargetContext() || getRowSelectSelectedRow() < 0) {
        return '';
    }
    const confirmText = formatRowSelectConfirmText();
    const confirming = Boolean(targetContext?.confirming);
    const disabled = confirming ? 'disabled' : '';
    const primaryText = confirming ? 'Confirming row...' : confirmText;
    return `<div class="battle-row-confirm" role="status">
        <button class="battle-row-confirm-btn battle-row-confirm-primary" type="button" onclick="confirmRowSelectBattleTarget()" title="${escapeHtmlAttribute(confirmText)}" ${disabled}>${escapeHtml(primaryText)}</button>
        <button class="battle-row-confirm-btn battle-row-confirm-secondary" type="button" onclick="clearRowSelectBattleTarget()" ${disabled}>Change Row</button>
    </div>`;
}

function renderRowSelectBattleOverlay() {
    const overlays = [
        document.getElementById('battleRowConfirmOverlay')
    ].filter(Boolean);
    if (overlays.length === 0) {
        return;
    }
    const html = renderRowSelectBattleConfirm();
    overlays.forEach((overlay) => {
        if (!html) {
            overlay.className = 'battle-row-confirm-overlay hidden';
            overlay.innerHTML = '';
            return;
        }
        overlay.className = 'battle-row-confirm-overlay';
        overlay.innerHTML = html;
    });
}

function renderBattlePanel() {
    const panels = [
        document.getElementById('battleActionPanel'),
        document.getElementById('desktopBattleActionPanel'),
        document.getElementById('desktopHandBattlePanel')
    ].filter(Boolean);
    if (panels.length === 0 || !gameState) {
        return;
    }
    const setPanelHtml = (html) => {
        panels.forEach(panel => {
            panel.innerHTML = html;
            bindBattleAbilityHovers(panel);
        });
    };
    const pending = gameState.pendingBattle;
    const buildQueueShell = (stateLabel, stateClass, bodyHtml, options = {}) => {
        const compact = options.compact === true;
        const cardTitle = options.cardTitle != null ? String(options.cardTitle) : null;
        const expanded = options.expanded === true;
        const shellClass = [
            'battle-queue-shell',
            'battle-queue-flat',
            compact ? 'battle-queue-compact' : '',
            expanded ? 'battle-queue-expanded' : ''
        ].filter(Boolean).join(' ');
        const headerHtml = cardTitle
            ? `<div class="battle-queue-topbar">
                <div class="battle-queue-card-title">${escapeHtml(cardTitle)}</div>
                <div class="battle-queue-state ${stateClass}">${escapeHtml(stateLabel)}</div>
            </div>`
            : `<div class="battle-queue-header">
                <div class="battle-queue-state ${stateClass}">${escapeHtml(stateLabel)}</div>
            </div>`;
        return `<div class="${shellClass}">${headerHtml}${bodyHtml}</div>`;
    };

    if (!pending) {
        if (gameState.currentPhase === 'BATTLE' && gameState.battleWaitingOn === 'ENEMY') {
            setPanelHtml(buildQueueShell(
                'Await Opponent',
                'waiting',
                '<div class="battle-attacker"><strong>Queue locked.</strong> The opponent is resolving the current speed action.</div><div class="battle-hint">The hand HUD will reopen your queue prompt as soon as the next acting Siegling is ready.</div>'
            ));
            return;
        }
        if (gameState.currentPhase === 'BATTLE') {
            setPanelHtml(buildQueueShell(
                'Resolving',
                'waiting',
                '<div class="battle-attacker"><strong>Queue is resolving.</strong> The next available Siegling will surface here in speed order.</div><div class="battle-hint">Stay ready. When your next acting Siegling arrives, this panel flips into queue mode automatically.</div>'
            ));
            return;
        }
        setPanelHtml(buildQueueShell(
            'Stand By',
            'waiting',
            renderStandbyBattleAbilityPreview()
        ));
        return;
    }

    if (isMobileLayout() && activeDrawer !== 'battle' && !isBattleTargetSelectionActive()) {
        mobileInfoTab = 'battle';
        openDrawer('battle');
    }

    let bodyHtml = '';
    if (targetMode && targetContext && targetContext.mode === 'battle') {
        bodyHtml += `<div class="battle-hint battle-hint-compact">${escapeHtml(targetContext.message)} Pass skips this step.</div>`;
    }

    let actionsHtml = '';
    const sortedAbilities = getSortedBattleAbilities(pending.abilities).filter((a) => !a.fromPrintedPassive);
    for (const ability of sortedAbilities) {
        const disabled = ability.affordable ? '' : 'disabled';
        const desc = (ability.description && String(ability.description).trim()) || ability.name;
        const weaknessPreview = formatBattleAbilityWeaknessPreview(ability);
        const tip = ability.description
            ? `${ability.name} - ${ability.description}${weaknessPreview ? ` ${weaknessPreview}` : ''}`
            : ability.name;
        actionsHtml += `<button class="battle-ability-btn" type="button" data-ability-index="${ability.index}" ${disabled} title="${escapeHtmlAttribute(tip)}"><span class="battle-ability-btn-inner"><span class="battle-ability-copy"><span class="battle-ability-name">${escapeHtml(desc)}</span>${weaknessPreview ? `<span class="battle-ability-weakness">${escapeHtml(weaknessPreview)}</span>` : ''}</span><span class="battle-ability-cost">${renderBattleAbilityCostEmblems(ability)}</span></span></button>`;
    }
    const passDesc = 'Pass this turn without using an ability. No energy cost.';
    actionsHtml += `<button class="battle-ability-btn battle-pass-btn" type="button" onclick="passBattleAction()" title="${escapeHtmlAttribute(passDesc)}"><span class="battle-ability-btn-inner"><span class="battle-ability-name">${escapeHtml(passDesc)}</span><span class="battle-ability-cost"><span class="battle-cost-free">No Cost</span></span></span></button>`;
    bodyHtml += `<div class="battle-queue-actions">${actionsHtml}</div>`;

    setPanelHtml(buildQueueShell(
        targetMode && targetContext && targetContext.mode === 'battle' ? 'Queue Target' : 'Acting Now',
        targetMode && targetContext && targetContext.mode === 'battle' ? 'targeting' : 'live',
        bodyHtml,
        { expanded: true, cardTitle: pending.name }
    ));
}

function chooseBattleAbility(index) {
    const pending = gameState.pendingBattle;
    if (!pending) return;

    const ability = pending.abilities.find(a => a.index === index);
    if (!ability || !ability.affordable) return;
    clearTargetingPreview();

    const targetSide = TARGET_TYPES[ability.targetType];
    const needsExplicitTarget = targetSide && boardHasTargets(targetSide);

    if (!needsExplicitTarget) {
        submitBattleAction(index, -1, -1);
        return;
    }

    targetMode = true;
    targetContext = {
        mode: 'battle',
        side: targetSide,
        abilityIndex: index,
        selectedRow: -1,
        message: buildBattleTargetMessage(targetSide, ability)
    };
    if (activeDrawer === 'battle') {
        closeDrawer(true);
    }
    render();
    scheduleBattleTargetingPreview(ability);
}

function confirmRowSelectBattleTarget() {
    if (!isRowSelectBattleTargetContext()) {
        return;
    }
    const selectedRow = getRowSelectSelectedRow();
    if (selectedRow < 0) {
        showTransientMessage('Select a row before confirming.');
        return;
    }
    if (targetContext.confirming) {
        return;
    }
    const abilityIndex = targetContext.abilityIndex;
    const context = targetContext;
    context.confirming = true;
    renderRowSelectBattleOverlay();
    const action = submitBattleAction(abilityIndex, selectedRow, -1);
    action?.finally?.(() => {
        if (targetContext === context && context.confirming) {
            context.confirming = false;
            render();
        }
    });
}

function clearRowSelectBattleTarget() {
    if (!isRowSelectBattleTargetContext()) {
        return;
    }
    if (targetContext.confirming) {
        return;
    }
    const ability = getActiveBattleTargetAbility();
    targetContext.selectedRow = -1;
    targetContext.selectedCol = -1;
    targetContext.message = buildBattleTargetMessage(targetContext.side, ability);
    clearTargetingPreview();
    render();
    if (ability) {
        scheduleBattleTargetingPreview(ability);
    }
}

function passBattleAction() {
    if (!gameState?.pendingBattle) {
        return;
    }
    clearTargetingPreview();
    submitBattleAction(-1, -1, -1);
}

function boardHasTargets(side) {
    const board = side === 'enemy' || side === 'row-enemy'
        ? gameState.enemyBoard
        : side === 'ally' || side === 'row-ally'
            ? gameState.playerBoard
            : null;
    return (board || []).some(row => row.some(cell => cell));
}

function enemyBoardHasEmptyCell() {
    const b = gameState?.enemyBoard;
    if (!b) {
        return false;
    }
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            if (!b[r][c]) {
                return true;
            }
        }
    }
    return false;
}

function abilityHasAvailableTarget(ability) {
    const targetSide = getAbilityTargetSide(ability);
    if (!targetSide) {
        return true;
    }
    if (!boardHasTargets(targetSide)) {
        return false;
    }
    if (ability?.effectType === 'move_link' && ability?.targetType === 'SINGLE_ENEMY') {
        return enemyBoardHasEmptyCell();
    }
    return true;
}

function getSelectedLegalPlacements() {
    const evolutionCardSelected = Boolean(selectedCard?.evolvesFromId);
    if (isPlacementBudgetLockedForCard(selectedCard) || (countBoardSieglings() >= 5 && !evolutionCardSelected)) {
        return [];
    }

    if (!selectedCard || selectedCard.type !== 'SIEGLING') {
        return gameState.legalPlacements || [];
    }
    return getLegalPlacementsForCard(selectedCard);
}

function canCardLinkAt(card, row, col, board) {
    return (card.notches || []).some(notch => {
        const delta = directionDelta(notch.direction, true);
        const adjRow = row + delta.dy;
        const adjCol = col + delta.dx;

        if (adjRow < 0 || adjRow > 2 || adjCol < 0 || adjCol > 2) {
            return false;
        }

        const neighbor = board[adjRow][adjCol];
        return neighbor && hasOppositeNotch(neighbor.notches, notch.direction);
    });
}

function canCardAnchorToSocket(card, row, col) {
    const socketDirections = [];
    if (col === 0) socketDirections.push('LEFT');
    if (col === 2) socketDirections.push('RIGHT');
    if (row === 0) socketDirections.push('BOTTOM');
    return socketDirections.some(direction => (card.notches || []).some(notch => notch.direction === direction));
}

function canSelectedCardLinkAt(row, col, board) {
    return canCardLinkAt(selectedCard, row, col, board);
}

/**
 * @param {number|string} handIndexOrCardId — hand slot index (preferred), or legacy card definition id (first match).
 */
function selectCard(handIndexOrCardId) {
    if (gameState.currentPhase !== 'SETUP') return;
    clearArenaSelection();
    const hand = gameState.player.hand || [];
    let handIndex;
    let card;
    if (typeof handIndexOrCardId === 'number' && Number.isInteger(handIndexOrCardId) && handIndexOrCardId >= 0) {
        handIndex = handIndexOrCardId;
        card = hand[handIndex];
    } else {
        handIndex = hand.findIndex((c) => c.id === handIndexOrCardId);
        card = handIndex >= 0 ? hand[handIndex] : null;
    }
    if (!card) return;

    if (isMobileLayout() && handTouchSuppressHandIndex === handIndex && Date.now() < handTouchSuppressUntil) {
        handTouchSuppressHandIndex = null;
        handTouchSuppressUntil = 0;
        return;
    }

    if (selectedHandIndex === handIndex) {
        selectedCard = null;
        selectedHandIndex = null;
        clearTargetMode();
        updateSelectedInfo(null);
        if (isMobileLayout() && activeDrawer === 'selected') {
            closeDrawer();
        }
        render();
        return;
    }

    const lockReason = getHandCardLockReason(card);

    selectedCard = card;
    selectedHandIndex = handIndex;
    clearTargetMode();

    const autoOpenMobilePreview = () => {
        if (isMobileLayout()) {
            openDrawer('selected');
        }
    };

    if (lockReason) {
        updateSelectedInfo(card, lockReason);
        autoOpenMobilePreview();
        render();
        return;
    }

    if (isActionCard(card)) {
        const targetSide = getAbilityTargetSide(card.ability);
        const needsExplicitTarget = Boolean(targetSide);
        if (needsExplicitTarget) {
            if (needsForcedEnemyMoveFlow(card)) {
                targetMode = true;
                targetContext = {
                    mode: 'spell-move-enemy',
                    side: 'enemy',
                    step: 'pickEnemy',
                    cardId: card.id,
                    message: `Select an enemy Siegling to move, then an empty enemy cell.`
                };
                updateSelectedInfo(card, targetContext.message);
                autoOpenMobilePreview();
                render();
                return;
            }
            targetMode = true;
            targetContext = {
                mode: 'spell',
                side: targetSide,
                message: `Select a target for ${card.name}.`,
                callback: (row, col) => castSpell(card.id, row, col)
            };
            updateSelectedInfo(card, targetContext.message);
            autoOpenMobilePreview();
            render();
            return;
        } else {
            castSpell(card.id, -1, -1);
            return;
        }
    }

    updateSelectedInfo(card);
    autoOpenMobilePreview();
    render();
}

function isTargetCell(isPlayer, cell, row = -1) {
    if (!targetMode || !targetContext) return false;

    if (targetContext.mode === 'spell-move-enemy') {
        if (!isPlayer) {
            if (targetContext.step === 'pickEnemy') {
                return Boolean(cell);
            }
            if (targetContext.step === 'pickDest') {
                return !cell;
            }
        }
        return false;
    }

    if (targetContext.side === 'enemy') {
        return !isPlayer && Boolean(cell);
    }
    if (targetContext.side === 'ally') {
        return isPlayer && Boolean(cell);
    }
    if (targetContext.side === 'row-enemy' || targetContext.side === 'row-ally') {
        const expectPlayer = targetContext.side === 'row-ally';
        if (isPlayer !== expectPlayer) {
            return false;
        }
        const selectedRow = getRowSelectSelectedRow();
        return selectedRow >= 0 ? row === selectedRow : Boolean(cell);
    }
    return false;
}

function onTargetSelected(row, col, fromPlayerBoard) {
    if (!targetMode || !targetContext) return;

    if (targetContext.mode === 'spell-move-enemy') {
        if (fromPlayerBoard) {
            return;
        }
        const board = gameState.enemyBoard;
        const cell = board?.[row]?.[col] || null;
        if (targetContext.step === 'pickEnemy') {
            if (!cell) {
                return;
            }
            targetContext.step = 'pickDest';
            targetContext.fromRow = row;
            targetContext.fromCol = col;
            targetContext.message = 'Choose an empty cell on the enemy board.';
            updateSelectedInfo(selectedCard, targetContext.message);
            render();
            return;
        }
        if (targetContext.step === 'pickDest') {
            if (cell) {
                return;
            }
            castSpell(targetContext.cardId, targetContext.fromRow, targetContext.fromCol, row, col);
            return;
        }
        return;
    }

    if (targetContext.mode === 'battle') {
        if (isRowSelectTargetSide(targetContext.side)) {
            if (targetContext.confirming) {
                return;
            }
            const expectPlayer = targetContext.side === 'row-ally';
            if (fromPlayerBoard !== expectPlayer) {
                showTransientMessage(`Select a card in a ${expectPlayer ? 'friendly' : 'enemy'} row.`);
                return;
            }
            const board = expectPlayer ? gameState.playerBoard : gameState.enemyBoard;
            const cell = board?.[row]?.[col] || null;
            if (!cell) {
                if (getRowSelectSelectedRow() < 0) {
                    showTransientMessage(`Select a card in a ${expectPlayer ? 'friendly' : 'enemy'} row.`);
                }
                return;
            }
            const ability = getActiveBattleTargetAbility();
            targetContext.selectedRow = row;
            targetContext.selectedCol = col;
            targetContext.message = buildBattleTargetMessage(targetContext.side, ability, row);
            clearTargetingPreview();
            render();
            if (ability) {
                scheduleBattleTargetingPreview(ability);
            }
            return;
        }
        if (targetContext.side === 'enemy' && fromPlayerBoard) {
            return;
        }
        if (targetContext.side === 'ally' && !fromPlayerBoard) {
            return;
        }
        submitBattleAction(targetContext.abilityIndex, row, col);
        return;
    }

    if (targetContext.mode === 'trainer') {
        if (targetContext.side === 'enemy' && fromPlayerBoard) {
            return;
        }
        if (targetContext.side === 'ally' && !fromPlayerBoard) {
            return;
        }
        if (typeof targetContext.callback === 'function') {
            targetContext.callback(row, col);
        }
        return;
    }

    if (targetContext.mode === 'spell') {
        if (targetContext.side === 'enemy' && fromPlayerBoard) {
            return;
        }
        if (targetContext.side === 'ally' && !fromPlayerBoard) {
            return;
        }
        if (typeof targetContext.callback === 'function') {
            targetContext.callback(row, col);
        }
    }
}

function onTrainerUse() {
    const trainer = gameState.player.trainer;
    if (!trainer || !trainer.active) return;
    if (!canUseTrainerAbility(trainer)) return;

    closeTrainerAbilityPopup();

    const targetSide = getAbilityTargetSide(trainer.active);
    const needsExplicitTarget = targetSide && boardHasTargets(targetSide);
    if (needsExplicitTarget) {
        targetMode = true;
        targetContext = {
            mode: 'trainer',
            side: targetSide,
            message: `Select a target for ${trainer.active.name}.`,
            callback: (row, col) => useTrainer(row, col)
        };
        updateSelectedInfo(null, targetContext.message);
        render();
    } else {
        useTrainer(-1, -1);
    }
}

function updateSelectedInfo(card, msg) {
    const el = document.getElementById('selectedCardInfo');
    if (!card && !msg) {
        el.innerHTML = 'Select a hand card or click a Siegling on either board to preview it here.';
        return;
    }

    if (isMobileLayout() && !gameState?.pendingBattle) {
        mobileInfoTab = 'selected';
    }

    let html = '';
    if (msg) {
        html += `<div class="selected-preview-message">${escapeHtml(msg)}</div>`;
    }
    if (card) {
        const lockReason = isBoardPreviewCard(card) ? '' : getHandCardLockReason(card);
        html += `<div class="selected-card-panel">`;
        html += renderShowcaseCard(card, {
            cardClass: 'selected-preview-card',
            artVariant: 'selected'
        });
        html += `<div class="selected-preview-copy">`;
        if (lockReason) {
            html += `<span style="color:var(--accent)">${escapeHtml(lockReason)}</span>`;
        } else if (isBoardPreviewCard(card)) {
            const own = boardCardOwnershipLabel(card);
            const phases = Number(card.battlePhasesSeen || 0);
            html += `<span style="color:var(--accent)">${escapeHtml(own)} Siegling — ${card.hp}/${card.maxHp} HP · Speed ${card.spd ?? card.speed ?? '?'} · ${phases} battle phase(s).</span>`;
        } else if (card.type === 'SIEGLING') {
            html += card.evolvesFromName
                ? `<span style="color:var(--accent)">After ${card.evolvesFromName} completes a full battle phase in that form, place this on it to evolve.</span>`
                : gameState.playerPlacementUsed
                ? `<span style="color:var(--accent)">${escapeHtml(sieglingPlacementLockMessage())}</span>`
                : '<span style="color:var(--accent)">Highlighted bubbles show where this card can expand next.</span>';
        }
        // Stat line and ability/move details in the right panel (body hidden inside compact card).
        const statLine = getCardSummaryStatLine(card);
        if (statLine) {
            html += `<div class="selected-copy-stats">${escapeHtml(statLine)}</div>`;
        }
        getCardPreviewEntries(card).forEach(entry => {
            if (entry.html) {
                html += `<div class="selected-copy-detail">${entry.html}</div>`;
            } else {
                html += `<div class="selected-copy-detail">${escapeHtml(entry.text)}</div>`;
            }
        });
        html += `</div>`;
        html += `</div>`;
    }

    el.innerHTML = html;
}

function handleBoardCardPointerEnter(isPlayer, row, col) {
    if (!isDesktopSidebarLayout()) {
        return;
    }
    hoveredBoardCard = (isPlayer ? gameState?.playerBoard : gameState?.enemyBoard)?.[row]?.[col] || null;
    syncFocusedCardUi();
}

function handleBoardCardPointerLeave(isPlayer, row, col) {
    const card = (isPlayer ? gameState?.playerBoard : gameState?.enemyBoard)?.[row]?.[col] || null;
    if (!hoveredBoardCard || !card || hoveredBoardCard.instanceId !== card.instanceId) {
        return;
    }
    hoveredBoardCard = null;
    syncFocusedCardUi();
}

function handleBoardCellTouch(event, isPlayer, row, col) {
    if (!isMobileLayout()) {
        return;
    }
    const board = isPlayer ? gameState?.playerBoard : gameState?.enemyBoard;
    const cell = board?.[row]?.[col] || null;
    const legalPlacement = isPlayer
        && !targetMode
        && Boolean(selectedCard)
        && selectedCard.type === 'SIEGLING'
        && getSelectedLegalPlacements().some(pos => pos[0] === row && pos[1] === col);
    const targetable = isTargetCell(isPlayer, cell, row);
    const claimable = isPlayer && isClaimableBoardCell(cell, true);
    if (cell && !legalPlacement && !targetable && !claimable) {
        event.preventDefault();
        onArenaCardClick(isPlayer, row, col);
        return;
    }
    if (!legalPlacement && !targetable && !claimable) {
        return;
    }
    event.preventDefault();
    if (legalPlacement) {
        placeCard(row, col);
        return;
    }
    if (targetable) {
        onTargetSelected(row, col, isPlayer);
        return;
    }
    if (claimable) {
        openClaimPopup(row, col);
    }
}

function showTooltipBoard(event, isPlayer, row, col) {
    if (isDesktopSidebarLayout() || isMobileLayout()) {
        return;
    }
    const board = isPlayer ? gameState.playerBoard : gameState.enemyBoard;
    const cell = board[row][col];
    if (!cell) return;

    const tt = document.getElementById('cardTooltip');
    document.getElementById('ttName').textContent = `${cell.name} (${cell.element})`;
    document.getElementById('ttName').style.color = getElementCssVar(cell.element);
    const combat = renderBoardCellCombatStatsInner(cell);
    document.getElementById('ttStats').innerHTML =
        `<span class="stat stat-hp">HP: ${combat.hpInner}</span>` +
        `<span class="stat stat-spd">SPD: ${combat.spdInner}</span>` +
        (combat.dmgBlock || '');
    let abilityHtml = '';
    if (Array.isArray(cell.abilities) && cell.abilities.length > 0) {
        abilityHtml = cell.abilities
            .filter((ab) => !ab.passive)
            .map((ab) => renderAbilityFlavorHtml(cell.element, ab))
            .join('');
    } else if (cell.ability) {
        abilityHtml = `<div class="card-ability-flavor" style="color:${getElementColorForCard(cell.element)}"><span class="card-ability-flavor-desc">${renderAbilityFlavorBodyInnerHtml(cell.ability, cell.element)}</span></div>`;
    }
    if (isClaimableBoardCell(cell, isPlayer)) {
        abilityHtml += `<div class="tt-claim-note">${escapeHtml(`Claim: Gain 1 temporary ${formatElementLabel(cell.element)} energy this turn`)}</div>`;
    }
    document.getElementById('ttAbility').innerHTML = abilityHtml;

    positionTooltip(event, tt);
    tt.classList.add('visible');
}

function showTooltipHand(event, handIndex) {
    if (isDesktopSidebarLayout() || isMobileLayout()) {
        return;
    }
    const card = gameState.player.hand[handIndex];
    if (!card) return;

    const tt = document.getElementById('cardTooltip');
    document.getElementById('ttName').textContent = `${card.name} (${card.element})`;
    document.getElementById('ttName').style.color = getElementCssVar(card.element);

    let statsHtml = '';
    if (card.type === 'SIEGLING') {
        statsHtml =
            `<span class="stat stat-hp">HP: ${card.health}</span>` +
            `<span class="stat stat-spd">SPD: ${card.speed}</span>`;
    }
    document.getElementById('ttStats').innerHTML = statsHtml;

    let abilityHtml = renderCardAbilitiesFlavorSection(card);
    const extras = [];
    if (card.type === 'TRAP') {
        extras.push(`Can Trigger when opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)} Energy`);
    } else if (card.costElement && card.costAmount > 0) {
        extras.push(`Play Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}`);
    }
    if (card.evolvesFromName) {
        extras.push(`Evolves from ${card.evolvesFromName}`);
    }
    if (card.requiredComboSize) {
        const comboLabel = card.requiredComboSignature
            ? card.requiredComboSignature.split('+').map(formatElementLabel).join(' + ')
            : `${card.requiredComboSize}-element combo`;
        extras.push(`Combo: ${comboLabel}`);
    }
    if (card.requiredReaction) {
        extras.push(`Requires: ${formatElementLabel(card.requiredReaction)} active`);
    }
    const lockReason = getHandCardLockReason(card);
    if (lockReason) {
        extras.push(`Unavailable: ${lockReason}`);
    }
    const extrasHtml = extras.map((line) => `<div class="tt-extra-line">${escapeHtml(line)}</div>`).join('');
    document.getElementById('ttAbility').innerHTML = abilityHtml + extrasHtml;

    positionTooltip(event, tt);
    tt.classList.add('visible');
}

function isClaimableBoardCell(cell, isPlayer) {
    return Boolean(
        isPlayer
        && cell
        && gameState?.currentPhase === 'SETUP'
        && gameState?.activeSide === 'PLAYER'
        && !targetMode
        && Number(cell.battlePhasesSeen || 0) > 0
    );
}

function positionTooltip(event, tt) {
    if (window.FloatingUIDOM) {
        const virtualEl = {
            getBoundingClientRect() {
                return {
                    width: 0, height: 0,
                    x: event.clientX, y: event.clientY,
                    top: event.clientY, left: event.clientX,
                    right: event.clientX, bottom: event.clientY
                };
            }
        };
        tt.style.position = 'fixed';
        window.FloatingUIDOM.computePosition(virtualEl, tt, {
            placement: 'top-start',
            middleware: [
                window.FloatingUIDOM.offset(12),
                window.FloatingUIDOM.flip({ padding: 8 }),
                window.FloatingUIDOM.shift({ padding: 8 })
            ]
        }).then(({ x, y }) => {
            tt.style.left = `${x}px`;
            tt.style.top = `${y}px`;
        });
        return;
    }
    // Fallback if Floating UI hasn't loaded yet
    let x = event.clientX + 15;
    let y = event.clientY + 15;
    if (x + 250 > window.innerWidth) x = event.clientX - 255;
    if (y + 200 > window.innerHeight) y = event.clientY - 205;
    tt.style.left = `${x}px`;
    tt.style.top = `${y}px`;
}

function hideTooltip() {
    document.getElementById('cardTooltip').classList.remove('visible');
}

function toggleSieglingsMute() {
    if (!window.SieglingsSounds) return;
    const nowMuted = window.SieglingsSounds.toggleMute();
    const btn = document.getElementById('btnMuteSound');
    if (btn) {
        btn.textContent = nowMuted ? '🔇' : '🔊';
        btn.title = nowMuted ? 'Unmute Sound' : 'Mute Sound';
    }
}

function getLiftedHandIndex() {
    if (hoveredHandIndex != null) return hoveredHandIndex;
    if (selectedHandIndex != null) return selectedHandIndex;
    return null;
}

function handleHandSelectorPointerMove(event) {
    if (isHandHiddenForPhase()) {
        stopHandSelectorAutoScroll();
        return;
    }
    const cards = document.getElementById('playerHand');
    if (!cards) {
        stopHandSelectorAutoScroll();
        return;
    }
    const canScrollX = cards.scrollWidth > cards.clientWidth + 4;
    const canScrollY = cards.scrollHeight > cards.clientHeight + 4;
    if (!canScrollX && !canScrollY) {
        stopHandSelectorAutoScroll();
        return;
    }
    const rect = cards.getBoundingClientRect();
    const thresholdX = Math.max(32, Math.min(100, rect.width * 0.16));
    const thresholdY = Math.max(32, Math.min(100, rect.height * 0.22));
    let direction = 0;
    let axis = null;
    if (canScrollX) {
        if (event.clientX <= rect.left + thresholdX) {
            direction = -1;
            axis = 'x';
        } else if (event.clientX >= rect.right - thresholdX) {
            direction = 1;
            axis = 'x';
        }
    }
    if (direction === 0 && canScrollY) {
        if (event.clientY <= rect.top + thresholdY) {
            direction = -1;
            axis = 'y';
        } else if (event.clientY >= rect.bottom - thresholdY) {
            direction = 1;
            axis = 'y';
        }
    }
    if (direction === handAutoScrollDirection && axis === handAutoScrollAxis) {
        return;
    }
    stopHandSelectorAutoScroll();
    if (direction === 0 || !axis) {
        return;
    }
    handAutoScrollDirection = direction;
    handAutoScrollAxis = axis;
    const speed = 14;
    const tick = () => {
        const row = document.getElementById('playerHand');
        if (!row || handAutoScrollDirection === 0 || !handAutoScrollAxis) {
            handAutoScrollFrame = null;
            return;
        }
        if (handAutoScrollAxis === 'x') {
            const maxL = Math.max(0, row.scrollWidth - row.clientWidth);
            if (handAutoScrollDirection < 0 && row.scrollLeft <= 0.5) {
                stopHandSelectorAutoScroll();
                return;
            }
            if (handAutoScrollDirection > 0 && row.scrollLeft >= maxL - 0.5) {
                stopHandSelectorAutoScroll();
                return;
            }
            row.scrollLeft += handAutoScrollDirection * speed;
        } else {
            const maxT = Math.max(0, row.scrollHeight - row.clientHeight);
            if (handAutoScrollDirection < 0 && row.scrollTop <= 0.5) {
                stopHandSelectorAutoScroll();
                return;
            }
            if (handAutoScrollDirection > 0 && row.scrollTop >= maxT - 0.5) {
                stopHandSelectorAutoScroll();
                return;
            }
            row.scrollTop += handAutoScrollDirection * speed;
        }
        handAutoScrollFrame = window.requestAnimationFrame(tick);
    };
    handAutoScrollFrame = window.requestAnimationFrame(tick);
}

function normalizeWheelDelta(event, axis) {
    const raw = axis === 'x' ? event.deltaX : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return raw * 18;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return raw * window.innerHeight;
    }
    return raw;
}

function getHandSelectorWheelScroller() {
    const cards = document.getElementById('playerHand');
    const tray = document.getElementById('handTray');
    const candidates = [cards, tray].filter(Boolean);
    for (const el of candidates) {
        if (el.classList.contains('hidden')) {
            continue;
        }
        const styles = window.getComputedStyle(el);
        const canOverflowX = styles.overflowX === 'auto' || styles.overflowX === 'scroll' || styles.overflowX === 'overlay';
        const canOverflowY = styles.overflowY === 'auto' || styles.overflowY === 'scroll' || styles.overflowY === 'overlay';
        const canScrollX = canOverflowX && el.scrollWidth > el.clientWidth + 4;
        const canScrollY = canOverflowY && el.scrollHeight > el.clientHeight + 4;
        if (canScrollX || canScrollY) {
            return { el, canScrollX, canScrollY };
        }
    }
    return null;
}

function handleHandSelectorWheel(event) {
    if (isHandHiddenForPhase()) {
        return;
    }

    const scroller = getHandSelectorWheelScroller();
    if (!scroller) {
        return;
    }

    const { el, canScrollX, canScrollY } = scroller;
    const rawDeltaX = normalizeWheelDelta(event, 'x');
    const rawDeltaY = normalizeWheelDelta(event, 'y');
    const preferHorizontal = canScrollX && (!canScrollY || Math.abs(rawDeltaX) >= Math.abs(rawDeltaY));
    const axis = preferHorizontal ? 'x' : 'y';
    let delta = axis === 'x' ? rawDeltaX : rawDeltaY;

    if (axis === 'x' && Math.abs(delta) < 0.5) {
        delta = rawDeltaY;
    }
    if (axis === 'y' && Math.abs(delta) < 0.5) {
        delta = rawDeltaX;
    }
    if (Math.abs(delta) < 0.5) {
        return;
    }

    const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop';
    const max = axis === 'x'
        ? Math.max(0, el.scrollWidth - el.clientWidth)
        : Math.max(0, el.scrollHeight - el.clientHeight);
    const before = el[prop];
    el[prop] = clampNumber(before + delta, 0, max);
    if (Math.abs(el[prop] - before) > 0.5) {
        stopHandSelectorAutoScroll();
        event.preventDefault();
    }
}

function stopHandSelectorAutoScroll() {
    handAutoScrollDirection = 0;
    handAutoScrollAxis = null;
    if (handAutoScrollFrame) {
        window.cancelAnimationFrame(handAutoScrollFrame);
        handAutoScrollFrame = null;
    }
}

function getHandCardSourceElement(handIndex) {
    if (handIndex == null || handIndex === '') return null;
    return document.querySelector(`#playerHand .hand-card[data-hand-index="${handIndex}"]`);
}

function updateHandLiftLayer() {
    const layer = document.getElementById('handLiftLayer');
    if (!layer) {
        return;
    }

    document.querySelectorAll('#playerHand .hand-card.is-lift-source')
        .forEach(card => card.classList.remove('is-lift-source'));
    layer.innerHTML = '';
    layer.classList.add('hidden');

    if (isHandHiddenForPhase() || isMobileLayout() || isDesktopSidebarLayout()) {
        return;
    }

    const liftIndex = getLiftedHandIndex();
    if (liftIndex == null) {
        return;
    }

    const source = getHandCardSourceElement(liftIndex);
    const actionBar = document.getElementById('actionBar');
    if (!source || !actionBar) {
        return;
    }

    const sourceRect = source.getBoundingClientRect();
    const actionRect = actionBar.getBoundingClientRect();
    const targetLeft = Math.min(
        Math.max(12, sourceRect.left),
        window.innerWidth - sourceRect.width - 12
    );
    const visibleOverlap = Math.min(72, Math.max(50, sourceRect.height * 0.28));
    const targetTop = Math.max(12, actionRect.top + visibleOverlap - sourceRect.height);

    const clone = source.cloneNode(true);
    clone.classList.add('lifted-card-clone');
    clone.removeAttribute('onclick');
    clone.removeAttribute('onmouseenter');
    clone.removeAttribute('onmouseleave');
    clone.style.left = `${targetLeft}px`;
    clone.style.top = `${targetTop}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;

    source.classList.add('is-lift-source');
    layer.appendChild(clone);
    layer.classList.remove('hidden');
}

function getElementCssVar(element) {
    switch (element) {
        case 'FIRE': return 'var(--fire)';
        case 'EARTH': return 'var(--earth)';
        case 'WIND': return 'var(--wind)';
        case 'WATER': return 'var(--water)';
        case 'ICE': return 'var(--ice)';
        case 'SHADOW': return 'var(--shadow)';
        case 'ELECTRIC': return 'var(--electric)';
        case 'METAL': return 'var(--metal)';
        case 'UNDEAD': return 'var(--undead)';
        case 'PSYCHIC': return 'var(--psychic)';
        default: return 'var(--neutral)';
    }
}

function clearTargetMode() {
    targetMode = false;
    targetContext = null;
    clearTargetingPreview();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDrawer(true);
        closeMobileHudSheet();
        closeClaimPopup();
        closeTrainerAbilityPopup();
        selectedCard = null;
        selectedHandIndex = null;
        clearTargetMode();
        updateSelectedInfo(null);
        render();
    }
});

window.addEventListener('resize', () => {
    updateResponsiveLayoutVars(true);
    scheduleDesktopHandSelectorCardScale();
    scheduleDesktopPreviewCardScale();
    stopHandSelectorAutoScroll();
    hoveredBoardCard = null;
    syncMobileInfoTab();
    syncMobileHudSheetSide();
    syncFocusedCardUi();
    scheduleBoardLinkConnectorRefresh();
});

window.addEventListener('resize', () => {
    updateResponsiveLayoutVars(true);
    scheduleDesktopHandSelectorCardScale();
    scheduleDesktopPreviewCardScale();
    const desktopBattleDrawerVisible = document.getElementById('desktopBattleDrawer')?.classList.contains('visible');
    const mobileBattleDrawerVisible = document.getElementById('drawerBattle')?.classList.contains('visible');
    if (!shouldUseDesktopBattleDrawer() && desktopBattleDrawerVisible) {
        closeDrawer(true);
    } else if (shouldUseDesktopBattleDrawer() && mobileBattleDrawerVisible) {
        closeDrawer(true);
        openDrawer('battle');
    }
    syncFocusedCardUi();
    syncMobileHudSheetSide();
    renderDesktopDeckPreview();
    updateHandLiftLayer();
    scheduleBoardLinkConnectorRefresh();
});

window.addEventListener('orientationchange', () => {
    updateResponsiveLayoutVars(true);
    scheduleDesktopHandSelectorCardScale();
    scheduleDesktopPreviewCardScale();
    syncFocusedCardUi();
    syncMobileHudSheetSide();
    renderDesktopDeckPreview();
    updateHandLiftLayer();
    scheduleBoardLinkConnectorRefresh();
});

updateResponsiveLayoutVars(true);
syncDesktopInspectTabUi();

(function setupBoardGridLayoutObservers() {
    const onLayoutModeBoundsChange = () => {
        scheduleBoardLinkConnectorRefresh();
        setTimeout(scheduleBoardLinkConnectorRefresh, 200);
    };

    const connect = () => {
        const playerGrid = document.getElementById('playerGrid');
        const enemyGrid = document.getElementById('enemyGrid');
        if (!playerGrid || !enemyGrid || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => scheduleBoardLinkConnectorRefresh());
        ro.observe(playerGrid);
        ro.observe(enemyGrid);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', connect);
    } else {
        connect();
    }

    const mqListeners = [
        window.matchMedia('(max-width: 900px)'),
        window.matchMedia('(min-width: 980px)'),
        window.matchMedia('(orientation: landscape) and (max-height: 600px)')
    ];
    mqListeners.forEach((mq) => {
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', onLayoutModeBoundsChange);
        } else if (typeof mq.addListener === 'function') {
            mq.addListener(onLayoutModeBoundsChange);
        }
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleBoardLinkConnectorRefresh);
    }
})();

renderDesktopMenuMeta();
renderDesktopActionHistory();
renderWelcomeTutorial();
renderWelcomeAuth();
syncEntryOverlays();
loadGameOptions();

