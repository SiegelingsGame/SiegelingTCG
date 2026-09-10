let gameState = null;

/**
 * Mirrors the server-authoritative call wells so activated perimeter points stay
 * lit for the match after their attached Siegeling leaves the board. The first
 * elemental activation owns the well; reconnecting never adds a second energy.
 */
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
/** Mobile: a spell/trap is selected and showing its preview, waiting for an
 *  explicit confirm before it casts or enters target selection. */
let mobileSpellPreviewPending = false;
let gameOptions = null;
let selectedDeckId = null;
let selectedTrainerId = null;
let loadoutMode = 'preset';
let loadoutStep = 'setup';
const LOADOUT_STEPS = ['setup', 'deck', 'knight', 'review'];
const GUEST_DIRECT_PLAYER_NAME = 'Guest';
let builderCounts = {};
let builderElementFilter = 'ALL';
let builderTypeFilter = 'ALL';
let selectedBuilderPreviewId = null;
let matchMode = 'solo';
let onlineRoomMode = 'create';
let multiplayerSession = loadSavedMultiplayerSession();
let soloSessionToken = loadSavedSoloToken();
let roomPollHandle = null;
let roomExpiryTimeoutHandle = null;
let currentRoomStatus = null;
let mobileInfoTab = 'battle';
let mobileHudSheetSide = 'enemy';
let mobileHudSheetOpen = false;
let mulliganSelectedIndices = new Set();
let mulliganHandSig = '';
// Redraw reveal: the swapped slots turn face-down, the server's new cards land
// behind the backs, then they turn back to show what was drawn. Slot classes are
// driven from this set rather than poked onto the DOM afterwards, because the
// state update re-renders the whole preview the moment the POST resolves — a
// post-hoc class would be wiped out mid-animation (and in multiplayer the
// waiting-room poll re-renders again on top of that).
const MULLIGAN_FLIP_MS = 260;      // one half-turn; matches the CSS transition
const MULLIGAN_REVEAL_HOLD_MS = 1000;   // the beat spent reading the new cards
let mulliganFlipIndices = new Set();
let mulliganFlipBackArt = '';
// Whether those slots are currently turned away. Kept apart from the set above
// so the turn back can be a class removal on the live nodes — rebuilding the
// preview would replace the elements and the transition would never run.
let mulliganFaceDown = false;
// Keeps the overlay up while the reveal plays, after the server has already
// called the mulligan over. Both hide paths honour it, and anything that would
// draw over the overlay can await mulliganRevealSettled() to queue behind it.
let mulliganRevealHold = false;
let mulliganRevealDone = null;      // resolver for the promise below
let mulliganRevealPromise = null;

function mulliganRevealSettled() {
    return mulliganRevealHold && mulliganRevealPromise ? mulliganRevealPromise : Promise.resolve();
}
let loadoutErrorMessage = '';
let liveCatalogRefreshPromise = null;
let loadoutStartPending = false;
let lastInteractionCueKey = '';
let transientMessageTimer = null;
let hoveredHandIndex = null;
let hoveredBoardCard = null;
/** Persisted board selection for live preview / drawer ({ isPlayer, row, col, instanceId }). */
let arenaSelection = null;
let lastActingPreviewInstanceId = null;
/** Cached overlay structure fingerprint per side; skips link/nexus rebuild when board topology is unchanged. */
const boardOverlayFingerprints = { player: '', enemy: '' };
let pendingClaimTarget = null;
let claimFxInFlight = false;
let lastRenderedPhase = null;
let phaseTransitionTimer = null;
// Resolver for the in-flight phase-transition banner promise. Tracked so the
// promise is always settled when the banner is hidden, superseded, or torn
// down — a never-resolved await here would wedge the battle action queue and
// freeze the game (auto-advance is gated on the queue being idle).
let phaseTransitionResolve = null;
let drawAbilityRevealTimer = null;
let drawAbilityRevealRun = 0;
let coinFlipDismissedRoomId = null;
let handTouchGesture = null;
/** @type {null | { handIndex: number, pointerId: number, startX: number, startY: number, active: boolean, ghost: HTMLElement | null, sourceEl: HTMLElement | null, captureEl: HTMLElement | null }} */
let cardDragSession = null;
let cardDragSuppressClickUntil = 0;
// A placement POST is in flight. The hand still shows the card until the server
// answers, so without this guard a second tap/drop fires a duplicate `place`
// that the server rejects — leaving the client with a dead selection and a card
// that looks stuck in hand while its twin is already on the board.
let placementRequestInFlight = false;
// Hand slot committed to the server but not yet confirmed; hidden from the hand
// for the duration so the card cannot be picked up twice.
let pendingHandRemovalIndex = null;
const CARD_DRAG_THRESHOLD_PX = 10;
let handAutoScrollFrame = null;
let handAutoScrollDirection = 0;
let handAutoScrollAxis = null;
let handSelectorScaleFrame = null;
// Fixed number of hand slots the desktop hand selector sizes itself around, so
// a card keeps the same footprint whether the player holds two or nine. Matches
// the opening hand plus the first few draws; anything past it scrolls.
const HAND_SELECTOR_DESKTOP_CARD_SLOTS = 6;
let previewCardScaleFrame = null;
let framedSummaryFitFrame = null;
let siegeKnightCardFitFrame = null;
const DECK_ART_ASSET_KEYS = [
    'FIRE', 'ICE', 'EARTH', 'WIND', 'WATER', 'SHADOW',
    'ELECTRIC', 'METAL', 'UNDEAD', 'PSYCHIC', 'POISON', 'LIGHT'
];
// Bump with home.js ELEMENTAL_CARD_BACK_VERSION when default card-back art changes.
const DECK_ART_ASSET_VERSION = 6;
function versionedDeckArtAsset(path) {
    if (!path) return '';
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${DECK_ART_ASSET_VERSION}`;
}
const DECK_ART_ASSETS = {
    FIRE: {
        back: versionedDeckArtAsset('/img/decks/card-back-fire.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-fire.png')
    },
    EARTH: {
        back: versionedDeckArtAsset('/img/decks/card-back-earth.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-earth.png')
    },
    WIND: {
        back: versionedDeckArtAsset('/img/decks/card-back-wind.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-wind.png')
    },
    WATER: {
        back: versionedDeckArtAsset('/img/decks/card-back-water.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-wind.png')
    },
    ICE: {
        back: versionedDeckArtAsset('/img/decks/card-back-ice.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-ice.png')
    },
    ELECTRIC: {
        back: versionedDeckArtAsset('/img/decks/card-back-electric.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-wind.png')
    },
    METAL: {
        back: versionedDeckArtAsset('/img/decks/card-back-metal.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-fire.png')
    },
    POISON: {
        back: versionedDeckArtAsset('/img/decks/card-back-poison.png'),
        icon: versionedDeckArtAsset('/img/decks/deck-icon-earth.png')
    },
    UNDEAD: {
        back: versionedDeckArtAsset('/img/decks/card-back-undead.png'),
        icon: versionedDeckArtAsset('/img/elements/element-undead.svg')
    },
    PSYCHIC: {
        back: versionedDeckArtAsset('/img/decks/card-back-psychic.png'),
        icon: versionedDeckArtAsset('/img/elements/element-psychic.svg')
    },
    SHADOW: {
        back: versionedDeckArtAsset('/img/decks/card-back-shadow.png'),
        icon: versionedDeckArtAsset('/img/elements/element-shadow.svg')
    },
    LIGHT: {
        back: versionedDeckArtAsset('/img/decks/card-back-light.png'),
        icon: versionedDeckArtAsset('/img/elements/element-light.svg')
    }
};
const SIEGEKNIGHT_CARD_BACK = '/img/knights/card-back-siegeknight.png';
const SIEGEKNIGHT_CARD_TEMPLATE = '/img/knights/siegeknight-card-template.png';

function siegeknightCardBackStyle() {
    return `--knight-card-back:url('${SIEGEKNIGHT_CARD_BACK}');--knight-card-template:url('${SIEGEKNIGHT_CARD_TEMPLATE}')`;
}
let handTouchSuppressHandIndex = null;
let handTouchSuppressUntil = 0;
// Tracks the last hand-card tap so a quick second tap on the same card opens
// its full card preview instead of just toggling the selection.
let lastHandActivation = { handIndex: -1, time: 0 };
const HAND_DOUBLE_TAP_MS = 320;
let lastViewportSignature = '';
const PLAYER_NAME_STORAGE_KEY = 'sieglingsPlayerName';
const AUTH_TOKEN_STORAGE_KEY = 'sieglingsAuthToken';
// Sentinel stored under AUTH_TOKEN_STORAGE_KEY once auth has moved to the httpOnly
// session cookie. It is NOT a credential — the real token lives in the cookie the
// browser sends automatically — but its presence still drives every "are we signed
// in?" check and cross-tab storage-event sync exactly as a real token used to.
const COOKIE_SESSION_VALUE = 'cookie';
// Set once the SERVER has confirmed (via `cookieSession` on /api/auth/me) that a
// session cookie actually reached it. Until then the real Bearer token is kept: a
// cookie the browser stores can still be dropped in transit (Firebase Hosting
// forwards only `__session` to Cloud Run), and discarding the token on a readable
// flag cookie is what made every page after login demand a fresh sign-in.
const COOKIE_AUTH_CONFIRMED_STORAGE_KEY = 'sieglingsCookieAuthConfirmed';
// Optimistic "a session probably exists" hint for first paint only. NOT proof that
// cookies reach the backend — only the server can attest to that.
function hasReadableAuthCookie() {
    try {
        return document.cookie.split('; ').some((c) => c.startsWith('sgl_auth='));
    } catch (e) {
        return false;
    }
}
// Whether the stored token value is a real legacy Bearer token (vs the cookie
// sentinel). Only legacy tokens are sent as an Authorization header.
function isLegacyBearerToken(token) {
    return Boolean(token) && token !== COOKIE_SESSION_VALUE;
}
// True when running as an installed standalone Web App (iOS "Add to Home Screen"
// / Android PWA). iOS standalone Web Apps do NOT reliably send the session cookie
// across the full-page navigations this multi-page app uses (Home <-> Play), so in
// that context we keep authenticating with the localStorage Bearer token — which
// DOES persist across those navigations — instead of the cookie-only path. Browsers
// keep the cookie-only path so the token stays out of script-readable storage.
function isStandalonePWA() {
    try {
        return window.navigator.standalone === true
            || Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) {
        return false;
    }
}
function cookieAuthConfirmed() {
    try {
        return localStorage.getItem(COOKIE_AUTH_CONFIRMED_STORAGE_KEY) === '1';
    } catch (e) {
        return false;
    }
}
function rememberCookieAuth(confirmed) {
    try {
        if (confirmed) localStorage.setItem(COOKIE_AUTH_CONFIRMED_STORAGE_KEY, '1');
        else localStorage.removeItem(COOKIE_AUTH_CONFIRMED_STORAGE_KEY);
    } catch (e) { /* storage off */ }
}
// On login, keep the real token unless the server has already proven cookies make it
// through; syncAuthProfile() migrates to the sentinel on the first confirmed
// /api/auth/me, so the credential is never discarded on a guess.
function preferredStoredToken(loginToken) {
    return (cookieAuthConfirmed() && !isStandalonePWA()) ? COOKIE_SESSION_VALUE : (loginToken || '');
}
// Last authenticated profile, cached in localStorage and shared with the hub so
// every page can render the signed-in UI instantly and then revalidate against
// /api/auth/me in the background instead of blocking on it.
const AUTH_PROFILE_STORAGE_KEY = 'sieglingsAuthProfile';
const AUTH_PROFILE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_HOME_LOADOUT_STORAGE_KEY = 'sieglingsPendingLoadout';
// Persistent cache for the Play page's loadout data (catalog/decks/trainers and
// the card editor state). Stored in localStorage with a 24h TTL so the loadout
// screen paints instantly on every visit, then revalidates in the background.
const PLAY_CACHE_PREFIX = 'sieglingsPlayCache:';
const PLAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readPlayCache(key) {
    try {
        const raw = localStorage.getItem(PLAY_CACHE_PREFIX + key);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!entry || Date.now() - entry.savedAt > PLAY_CACHE_TTL_MS) return null;
        return entry.data;
    } catch (e) {
        return null;
    }
}

function writePlayCache(key, data) {
    try {
        if (!data) return;
        localStorage.setItem(PLAY_CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (e) {
        // Persistent cache is an optimization only.
    }
}

(function redirectLegacyPlayRoomLinks() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (!room || !window.location.pathname.endsWith('/play')) {
        return;
    }
    params.delete('room');
    const query = params.toString();
    window.location.replace(`/social/lobby/${encodeURIComponent(room.trim().toUpperCase())}${query ? `?${query}` : ''}`);
})();
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
    { id: 'spellsCast', label: 'Strategies' },
    { id: 'trapsSprung', label: 'Deceptions' },
    { id: 'siegelingsDefeated', label: 'Siegelings' },
    { id: 'pvpWinRate', label: 'PVP W/L' }
];
const LEADERBOARD_PERIODS = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'year', label: 'Year' },
    { id: 'allTime', label: 'All Time' }
];
let welcomeLeaderboardState = {
    tab: 'wins',
    period: 'daily',
    data: null,
    loading: false,
    error: ''
};

function welcomeLeaderboardBoards() {
    const data = welcomeLeaderboardState.data;
    if (!data) {
        return null;
    }
    const period = LEADERBOARD_PERIODS.some((entry) => entry.id === welcomeLeaderboardState.period)
        ? welcomeLeaderboardState.period
        : 'daily';
    if (data.periods && data.periods[period]) {
        return data.periods[period];
    }
    return period === 'daily' ? data.boards : null;
}
let authMode = 'login';
let authRegisterStep = 'credentials';
let authPopupOpen = false;
let registerDraft = { email: '', password: '' };
// Fall back to the cookie sentinel when an httpOnly session cookie exists but the
// localStorage marker is missing (e.g. localStorage cleared independently), so a
// live cookie session is still recognized as signed-in.
const initialAuthToken = loadSavedAuthToken() || (hasReadableAuthCookie() ? COOKIE_SESSION_VALUE : '');
// Seed from the cached snapshot so the signed-in UI renders instantly; the
// background /api/auth/me on init revalidates and refreshes it.
const initialCachedProfile = initialAuthToken ? loadCachedAuthProfile() : null;
let authState = {
    token: initialAuthToken,
    profile: initialCachedProfile,
    loading: false,
    // Whether we can treat the auth state as known for this page load. Seed it true
    // when we already have a cached signed-in profile so navigating to Play from the
    // hub paints the account immediately with NO "Restoring your account…" loading —
    // the player is already signed in, so there is nothing to wait on. The silent
    // background /api/auth/me still revalidates and corrects this if the session has
    // genuinely lapsed. When there is no cached profile, a present token means
    // "signing in", NOT "logged out", so the welcome screen shows a loading state
    // instead of flashing the Log In card.
    profileResolved: Boolean(initialCachedProfile?.authenticated),
    error: ''
};
let selectedSavedDeckId = null;
let lastProfileRefreshKey = '';
let lastEndGameNoticeSeq = 0;
let matchNoticeToastTimer = null;
let socialOnlineLaunchRoomId = '';
let playLobbyState = {
    active: false,
    mode: 'create',
    ready: false,
    opponentReady: false,
    countdown: 0,
    chatMessages: []
};
let playLobbyCountdownTimer = null;
let playLobbyOpponentTimer = null;
const ROW_NAMES = ['Back', 'Middle', 'Front'];
const TARGET_TYPES = {
    SINGLE_ENEMY: 'enemy',
    SINGLE_ALLY: 'ally',
    ROW_SELECT_ENEMIES: 'row-enemy',
    ROW_SELECT_ALLIES: 'row-ally'
};
const EFFECT_KIND_MAP = {
    damage: 'damage',
    chain_damage: 'damage',
    player_damage: 'damage',
    destroy: 'damage',
    draw: 'buff',
    heal: 'heal',
    shield: 'buff',
    damage_boost: 'buff',
    health_boost: 'buff',
    speed_boost: 'buff',
    energy_boost: 'buff',
    connected_allies_damage_boost: 'buff',
    connected_allies_health_boost: 'buff',
    connected_allies_heal: 'heal',
    connected_allies_shield: 'buff',
    connected_allies_slow: 'freeze',
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

const TARGET_ARROW_ELEMENT_PALETTES = {
    FIRE:     { source: '#ff9940', target: '#ff5520', glow: '#ff7730' },
    WATER:    { source: '#80ccff', target: '#3296ff', glow: '#55aaff' },
    EARTH:    { source: '#e8c870', target: '#c49a4a', glow: '#b08030' },
    WIND:     { source: '#b0ffd0', target: '#64e89a', glow: '#80f0b0' },
    ICE:      { source: '#c8f6ff', target: '#76e6ff', glow: '#a8f0ff' },
    SHADOW:   { source: '#c070ff', target: '#7832b4', glow: '#9040d0' },
    ELECTRIC: { source: '#ffffff', target: '#ffe040', glow: '#ffe880' },
    METAL:    { source: '#d8e0e8', target: '#a0aab4', glow: '#c0c8d0' },
    UNDEAD:   { source: '#b090e0', target: '#6a5080', glow: '#8060a0' },
    PSYCHIC:  { source: '#f0b0ff', target: '#d060ff', glow: '#e080ff' },
    POISON:   { source: '#d4ff95', target: '#7ecb4d', glow: '#9ee85f' },
    LIGHT:    { source: '#fff8cc', target: '#ffe59a', glow: '#fff1aa' },
    NEUTRAL:  { source: '#aabbcc', target: '#8899aa', glow: '#99aabb' }
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
    },
    POISON: {
        element: 'POISON',
        playstyle: 'Attrition',
        traits: ['Toxin', 'Pressure', 'Control'],
        description: 'Wear down resilient enemies with toxic pressure and board disruption.',
        recommendedTrainerIds: []
    },
    LIGHT: {
        element: 'LIGHT',
        playstyle: 'Radiant Control',
        traits: ['Radiance', 'Cleanse', 'Tempo'],
        description: 'Stabilize the field with radiant tempo swings and precision control.',
        recommendedTrainerIds: []
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
    MAX_HEALTH:   '#46e07a',
    DAMAGE_BOOST: '#ff5544',
    SPEED_BOOST:  '#7adfff',
    WEAK:         '#ff6080',
    STRONG:       '#ffd060',
    // Elemental damage afflictions (see docs/ELEMENTAL_STATUS_EFFECTS.md)
    BURN:         '#ff501e',
    CHILL:        '#76e6ff',
    LEECH:        '#8fbd58',
    DISORIENT:    '#96ffb4',
    SOAK:         '#3296ff',
    SHOCK:        '#ffe63c',
    RUST:         '#a0aab4',
    TOXIN:        '#78dc50',
    CURSE:        '#7832b4',
    INSIGHT:      '#c896ff',
    BLIND:        '#fffac8',
    WITHER:       '#8c78a0'
};

// Single source of truth for every badge the battle table can show: the short
// tooltip line, the long player-facing explanation behind the tappable pills,
// and which section of the "All Effects" key the row belongs to. Affliction
// copy mirrors docs/ELEMENTAL_STATUS_EFFECTS.md — update both together.
const STATUS_EFFECT_KEY = {
    MAX_HEALTH: {
        name: 'Max HP Up',
        group: 'buff',
        summary: 'Max Health increased',
        detail: 'Permanently raises this Siegeling\'s maximum Health for the rest of the match. Current HP rises with it when the boost is granted, so the extra points are immediately usable.'
    },
    HEALTH_BOOST: {
        name: 'Shield',
        group: 'buff',
        summary: 'absorbs damage before HP',
        detail: 'Temporary hit points layered over Health. Incoming damage eats the shield first and only spills into HP once the shield is gone. The badge clears as soon as the shield is fully spent.'
    },
    DAMAGE_BOOST: {
        name: 'Damage Boost',
        group: 'buff',
        summary: 'abilities deal extra damage',
        detail: 'Every damaging ability this Siegeling uses deals additional damage equal to the boost value shown on the badge.'
    },
    SPEED_BOOST: {
        name: 'Speed Boost',
        group: 'buff',
        summary: 'acts earlier in the battle queue',
        detail: 'Raises effective Speed by the amount shown. Battle order is sorted by Speed, so a boosted Siegeling acts before slower cards in the same Battle phase.'
    },
    STRONG: {
        name: 'Strong',
        group: 'matchup',
        summary: 'resists the attacker for -1 damage',
        detail: 'This Siegeling\'s element beats the incoming attacker\'s, so the hit is resisted and lands for -1 damage — a 1-damage hit is reduced to nothing. Matchups: Fire > Ice > Wind > Earth > Fire; Water > Fire/Ice; Metal > Earth/Wind; Electric > Wind/Fire; Poison > Ice/Earth; Shadow > Psychic > Light > Undead > Shadow.'
    },
    WEAK: {
        name: 'Weak',
        group: 'matchup',
        summary: 'takes extra damage from the attacker',
        detail: 'The incoming attacker\'s element beats this Siegeling\'s element, so the hit lands for +1 damage.'
    },
    FREEZE: {
        name: 'Frozen',
        group: 'control',
        summary: 'cannot act',
        detail: 'A frozen Siegeling skips its action entirely. Freeze from Chill thaws when its owner reaches their next Setup phase; Freeze from an ability lasts a single action.'
    },
    SPEED_ZERO: {
        name: 'Stunned',
        group: 'control',
        summary: 'Speed set to zero, acts last',
        detail: 'Effective Speed drops to 0, pushing this Siegeling to the very end of the battle queue for the phase.'
    },
    BURN: {
        name: 'Burn',
        group: 'affliction',
        element: 'FIRE',
        cap: 5,
        summary: 'flat damage per badge at next Setup',
        detail: 'Inflicted by Fire damage. At the start of the owner\'s next Setup phase the burning Siegeling takes 1 damage per stack, then every Burn stack clears.'
    },
    CHILL: {
        name: 'Chill',
        group: 'affliction',
        element: 'ICE',
        cap: 3,
        summary: 'Slow per badge; Freeze at 3',
        detail: 'Inflicted by Ice damage. At 1–2 stacks it slows the Siegeling by 1 effective Speed per stack. The 3rd stack spends every Chill badge to freeze it outright — the badges clear and the Frozen status takes over until the owner\'s next Setup.'
    },
    LEECH: {
        name: 'Leech',
        group: 'affliction',
        element: 'EARTH',
        cap: 2,
        summary: 'second Earth hit heals its attacker',
        detail: 'Inflicted by Earth HP damage. The first hit marks the defender. The second heals that hit\'s attacker for the actual HP damage dealt, then clears Leech. Toxin removes healing before HP is restored.'
    },
    DISORIENT: {
        name: 'Disorient',
        group: 'affliction',
        element: 'WIND',
        cap: 3,
        summary: 'raises the cost of its cheapest ability',
        detail: 'Inflicted by Wind damage. The energy cost of this Siegeling\'s lowest-cost ability goes up by 1 per stack. When several abilities tie for cheapest, the first one in the card\'s ability order is taxed.'
    },
    SOAK: {
        name: 'Soak',
        group: 'affliction',
        element: 'WATER',
        cap: 5,
        summary: 'attacks against it deal +1 per badge',
        detail: 'Inflicted by Water damage. Every attack that hits this Siegeling deals +1 damage per stack. Stacks persist — they are not consumed by the hits they amplify.'
    },
    SHOCK: {
        name: 'Shock',
        group: 'affliction',
        element: 'ELECTRIC',
        cap: 5,
        summary: 'can spend 1 less energy per badge',
        detail: 'Inflicted by Electric damage. This card\'s personal spending cap for paying ability costs drops by 1 per stack. The owner\'s energy pool is untouched — only what this Siegeling may spend is limited.'
    },
    RUST: {
        name: 'Rust',
        group: 'affliction',
        element: 'METAL',
        cap: 3,
        summary: 'next Metal attack hits harder, then clears',
        detail: 'Inflicted by Metal damage. The next Metal attack against this Siegeling deals +1 damage per stack and then removes all Rust. Attacks of other elements neither benefit from nor consume it.'
    },
    TOXIN: {
        name: 'Toxin',
        group: 'affliction',
        element: 'POISON',
        cap: 5,
        summary: 'cannot heal; heals burn off stacks instead',
        detail: 'Inflicted by Poison damage. While any stack remains the Siegeling cannot gain HP. A heal removes 1 stack per point of healing instead of restoring Health; once Toxin hits 0, later heals work normally again.'
    },
    CURSE: {
        name: 'Curse',
        group: 'affliction',
        element: 'SHADOW',
        cap: 2,
        summary: 'cannot be claimed or evolved',
        detail: 'Inflicted by Shadow damage. While any stack remains the Siegeling cannot be claimed for temporary energy during Setup, and no evolution card may be placed onto it.'
    },
    INSIGHT: {
        name: 'Insight',
        group: 'affliction',
        element: 'PSYCHIC',
        cap: 3,
        summary: 'at 3 stacks the inflicter draws',
        detail: 'Inflicted by Psychic damage. Stacks 1–2 carry no penalty. When the third stack lands, the player who inflicted it draws a card and every Insight stack on the target is consumed.'
    },
    BLIND: {
        name: 'Blind',
        group: 'affliction',
        element: 'LIGHT',
        cap: 3,
        summary: 'ability values reduced per badge',
        detail: 'Inflicted by Light damage. The numbers on this Siegeling\'s abilities — damage, healing, shielding — are each reduced by 1 per stack when the ability resolves.'
    },
    WITHER: {
        name: 'Wither',
        group: 'affliction',
        element: 'UNDEAD',
        cap: 3,
        summary: 'max HP reduced at Setup',
        detail: 'Inflicted by Undead damage. At the owner\'s next Setup, current Health is clamped as if maximum HP were 1 lower per stack (the overflow is lost), then Wither clears.'
    }
};

const STATUS_EFFECT_GROUPS = [
    { id: 'buff', title: 'Buffs', blurb: 'Granted by abilities, spells and SiegeKnights.' },
    { id: 'control', title: 'Control', blurb: 'Statuses that take a turn away.' },
    { id: 'matchup', title: 'Elemental Matchup', blurb: 'Shown while targeting an attack.' },
    { id: 'affliction', title: 'Elemental Afflictions', blurb: 'Stacking badges inflicted by elemental damage.' }
];

const STATUS_BADGE_LABEL = Object.keys(STATUS_EFFECT_KEY).reduce((acc, kind) => {
    const info = STATUS_EFFECT_KEY[kind];
    acc[kind] = info.summary ? `${info.name} — ${info.summary}` : info.name;
    return acc;
}, {});
const STATUS_BADGE_SVG = {
    FREEZE: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-fz-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#dff6ff"/><stop offset="50%" stop-color="#5fb8e8"/><stop offset="100%" stop-color="#1a4a7a"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#5fb8e8" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-fz-bg)" stroke="#dff6ff" stroke-width="2"/><g stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none" class="sb-spin"><line x1="42" y1="20" x2="42" y2="64"/><line x1="22" y1="42" x2="62" y2="42"/><line x1="27" y1="27" x2="57" y2="57"/><line x1="57" y1="27" x2="27" y2="57"/><path d="M42 20 L37 26 M42 20 L47 26 M42 64 L37 58 M42 64 L47 58 M22 42 L28 37 M22 42 L28 47 M62 42 L56 37 M62 42 L56 47"/></g><circle cx="42" cy="42" r="3" fill="#fff"/></svg>`,
    SPEED_ZERO: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-sz-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#a0b0c0"/><stop offset="50%" stop-color="#4a5a78"/><stop offset="100%" stop-color="#1a2030"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#4a5a78" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-sz-bg)" stroke="#a0b0c0" stroke-width="2"/><g stroke="#5a6a80" stroke-width="2" stroke-linejoin="round" fill="#7a8aa0" opacity=".7"><path d="M48 18 L34 40 L42 40 L36 50"/><path d="M40 50 L48 38 L42 38 L48 28"/></g><circle cx="42" cy="46" r="14" fill="none" stroke="#fff" stroke-width="3.5"/><line x1="32" y1="36" x2="52" y2="56" stroke="#ff5544" stroke-width="3.5" stroke-linecap="round"/></svg>`,
    HEALTH_BOOST: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-sh-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#f3f6fa"/><stop offset="55%" stop-color="#a8b0ba"/><stop offset="100%" stop-color="#4a5360"/></radialGradient><linearGradient id="sb-sh-face" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#b8c0ca"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#a8b0ba" opacity=".25" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-sh-bg)" stroke="#f3f6fa" stroke-width="2"/><path d="M42 18 L62 26 L62 42 C 62 54 54 64 42 70 C 30 64 22 54 22 42 L22 26 Z" fill="url(#sb-sh-face)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" class="sb-float"/><path d="M42 23 L42 64" stroke="#77808c" stroke-width="2" opacity=".55"/></svg>`,
    MAX_HEALTH: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-mh-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#d8ffe6"/><stop offset="50%" stop-color="#3ad87a"/><stop offset="100%" stop-color="#0a5a2a"/></radialGradient><linearGradient id="sb-mh-heart" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#8effb0"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#3ad87a" opacity=".28" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-mh-bg)" stroke="#d8ffe6" stroke-width="2"/><path d="M42 62 C 24 50 18 40 18 31 C 18 24 23 20 29 20 C 34 20 39 23 42 28 C 45 23 50 20 55 20 C 61 20 66 24 66 31 C 66 40 60 50 42 62 Z" fill="url(#sb-mh-heart)" stroke="#fff" stroke-width="2" stroke-linejoin="round" class="sb-float"/><g stroke="#0a5a2a" stroke-width="3.5" stroke-linecap="round"><line x1="42" y1="33" x2="42" y2="45"/><line x1="36" y1="39" x2="48" y2="39"/></g></svg>`,
    DAMAGE_BOOST: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-dmg-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#ffe0c0"/><stop offset="50%" stop-color="#ff6633"/><stop offset="100%" stop-color="#5a1a0a"/></radialGradient><linearGradient id="sb-dmg-sword" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="50%" stop-color="#ffd8a0"/><stop offset="100%" stop-color="#c87040"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#ff5533" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-dmg-bg)" stroke="#ffe0c0" stroke-width="2"/><g stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><g transform="rotate(45 42 42)"><rect x="40.5" y="20" width="3" height="34" fill="url(#sb-dmg-sword)"/><polygon points="42,16 39,22 45,22" fill="#ffd8a0"/><rect x="36" y="54" width="12" height="3" fill="#5a1a0a"/><rect x="40" y="56" width="4" height="6" fill="#5a1a0a"/></g><g transform="rotate(-45 42 42)"><rect x="40.5" y="20" width="3" height="34" fill="url(#sb-dmg-sword)"/><polygon points="42,16 39,22 45,22" fill="#ffd8a0"/><rect x="36" y="54" width="12" height="3" fill="#5a1a0a"/><rect x="40" y="56" width="4" height="6" fill="#5a1a0a"/></g></g><circle cx="42" cy="42" r="4" fill="#fff8c0" class="sb-flicker"/></svg>`,
    // Winged runner, not a bolt: Speed Boost sat next to Shock's electric bolt
    // and the two read as the same badge at board size.
    SPEED_BOOST: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-sp-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#dff8ff"/><stop offset="50%" stop-color="#3ad8ff"/><stop offset="100%" stop-color="#1a5a7a"/></radialGradient><linearGradient id="sb-sp-shoe" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="60%" stop-color="#eaf9ff"/><stop offset="100%" stop-color="#8fd8f5"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#3ad8ff" opacity=".25" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-sp-bg)" stroke="#dff8ff" stroke-width="2"/><g stroke="#dff8ff" stroke-width="2" stroke-linecap="round" opacity=".55" class="sb-flicker"><line x1="19" y1="27" x2="31" y2="27"/><line x1="17" y1="35" x2="27" y2="35"/><line x1="21" y1="43" x2="29" y2="43"/></g><g transform="translate(0 -4)"><g class="sb-float"><path d="M26 54 C 26 44 29 36 34 34 L39 34 L41 43 C 43 48 50 51 57 52 C 61 52.5 63 53 63 54 Z" fill="url(#sb-sp-shoe)" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/><path d="M23 53 L64 53 C 66 53 66 59 64 59 L26 59 C 23 59 22.5 56 23 53 Z" fill="#2a86b4" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/><g stroke="#2a86b4" stroke-width="2" stroke-linecap="round"><line x1="34" y1="40" x2="41" y2="38"/><line x1="35" y1="46" x2="44" y2="44"/><line x1="39" y1="51" x2="48" y2="49"/></g></g></g></svg>`,
    WEAK: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-wk-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#ffd0d8"/><stop offset="50%" stop-color="#a02038"/><stop offset="100%" stop-color="#3a0a18"/></radialGradient><linearGradient id="sb-wk-shield" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ff6080"/><stop offset="100%" stop-color="#5a0a18"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#a02038" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-wk-bg)" stroke="#ffd0d8" stroke-width="2"/><g class="sb-floatdn"><path d="M42 22 L58 28 L58 44 C 58 54 50 60 42 64 C 34 60 26 54 26 44 L26 28 Z" fill="url(#sb-wk-shield)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M42 24 L38 34 L44 38 L36 48 L46 52 L40 62" stroke="#fff8c0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g><g transform="translate(57 57)"><circle r="8" fill="#1a0a18" stroke="#ff6080" stroke-width="1.5"/><path d="M0 -4 L0 4 M-3 1 L0 4 L3 1" stroke="#ff6080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g></svg>`,
    STRONG: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-st-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#fff4c0"/><stop offset="50%" stop-color="#e8a020"/><stop offset="100%" stop-color="#5a3a08"/></radialGradient><linearGradient id="sb-st-star" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="60%" stop-color="#ffe080"/><stop offset="100%" stop-color="#e8a020"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#ffd060" opacity=".3" class="sb-pulse"/><g class="sb-spin-rev sb-behind" opacity=".55"><line x1="42" y1="6" x2="42" y2="14" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/><line x1="42" y1="70" x2="42" y2="78" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="42" x2="14" y2="42" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/><line x1="70" y1="42" x2="78" y2="42" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/></g><circle cx="42" cy="42" r="34" fill="url(#sb-st-bg)" stroke="#fff4c0" stroke-width="2"/><polygon points="42,20 47,35 63,35 50,44 55,60 42,51 29,60 34,44 21,35 37,35" fill="url(#sb-st-star)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" class="sb-float"/><g transform="translate(57 57)"><circle r="8" fill="#3a2008" stroke="#ffe080" stroke-width="1.5"/><path d="M0 4 L0 -4 M-3 -1 L0 -4 L3 -1" stroke="#ffe080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g></svg>`,
    // --- Elemental afflictions: one silhouette per element so a badge is
    // readable at 22px without reading the stack number or the tooltip. ---
    BURN: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-burn-bg" cx="50%" cy="40%" r="65%"><stop offset="0%" stop-color="#ffe0a0"/><stop offset="45%" stop-color="#ff501e"/><stop offset="100%" stop-color="#5a1208"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#ff501e" opacity=".28" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-burn-bg)" stroke="#ffe0a0" stroke-width="2"/><path d="M42 18 C 48 28 56 32 56 44 C 56 54 50 62 42 66 C 34 62 28 54 28 44 C 28 36 34 30 38 26 C 36 34 40 38 44 36 C 42 30 42 24 42 18 Z" fill="#fff4c0" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" class="sb-flicker"/></svg>`,
    // Ice — frosted thermometer dropping, distinct from FREEZE's snowflake.
    CHILL: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-chl-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#e4fbff"/><stop offset="50%" stop-color="#4fc4e8"/><stop offset="100%" stop-color="#123c60"/></radialGradient><linearGradient id="sb-chl-tube" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#bfe9f8"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#76e6ff" opacity=".28" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-chl-bg)" stroke="#e4fbff" stroke-width="2"/><g class="sb-float"><rect x="35" y="16" width="14" height="36" rx="7" fill="url(#sb-chl-tube)" stroke="#fff" stroke-width="2"/><circle cx="42" cy="58" r="11" fill="url(#sb-chl-tube)" stroke="#fff" stroke-width="2"/><circle cx="42" cy="58" r="6" fill="#2a8fc0"/><rect x="39" y="40" width="6" height="14" fill="#2a8fc0"/></g><g stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".9" class="sb-flicker"><line x1="20" y1="24" x2="30" y2="24"/><line x1="25" y1="19" x2="25" y2="29"/><line x1="21.5" y1="20.5" x2="28.5" y2="27.5"/><line x1="28.5" y1="20.5" x2="21.5" y2="27.5"/></g><g stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".75"><line x1="56" y1="60" x2="64" y2="60"/><line x1="60" y1="56" x2="60" y2="64"/></g></svg>`,
    // Earth — restorative heart rooted into the ground.
    LEECH: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-leech-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#e8ffc9"/><stop offset="52%" stop-color="#719b3d"/><stop offset="100%" stop-color="#273614"/></radialGradient><linearGradient id="sb-leech-heart" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#fff6d8"/><stop offset="100%" stop-color="#a9dd68"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#8fbd58" opacity=".28" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-leech-bg)" stroke="#e8ffc9" stroke-width="2"/><path d="M42 57 C28 48 24 40 24 33 C24 27 28 23 34 23 C38 23 41 25 42 29 C44 25 47 23 51 23 C57 23 61 27 61 33 C61 40 56 48 42 57Z" fill="url(#sb-leech-heart)" stroke="#fff" stroke-width="2" class="sb-float"/><path d="M42 58 C42 65 35 66 32 70 M42 58 C43 65 50 66 53 70" fill="none" stroke="#dfffb8" stroke-width="3" stroke-linecap="round"/></svg>`,
    // Wind — spiral vortex; the badge the user saw wearing Burn's flame.
    DISORIENT: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-dso-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#e6fff0"/><stop offset="50%" stop-color="#4cc87c"/><stop offset="100%" stop-color="#0c3a24"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#96ffb4" opacity=".28" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-dso-bg)" stroke="#e6fff0" stroke-width="2"/><g class="sb-spin"><path d="M42 42 C 42 32 50 25 58 28 C 65 32 65 43 55 48 C 43 54 28 48 25 37 C 22 27 30 19 40 21" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/></g><g stroke="#e6fff0" stroke-width="2.4" stroke-linecap="round" opacity=".85" class="sb-flicker"><path d="M21 58 C 27 55 32 61 38 58" fill="none"/><path d="M46 64 C 52 61 56 66 61 62" fill="none"/></g><circle cx="42" cy="42" r="4" fill="#ffffff"/></svg>`,
    // Water — droplet over a rippling pool.
    SOAK: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-sk-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#d6ecff"/><stop offset="50%" stop-color="#3296ff"/><stop offset="100%" stop-color="#0a2c60"/></radialGradient><linearGradient id="sb-sk-drop" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#7ec4ff"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#3296ff" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-sk-bg)" stroke="#d6ecff" stroke-width="2"/><path d="M42 14 C 52 30 60 38 60 47 C 60 57 52 64 42 64 C 32 64 24 57 24 47 C 24 38 32 30 42 14 Z" fill="url(#sb-sk-drop)" stroke="#fff" stroke-width="2" stroke-linejoin="round" class="sb-float"/><path d="M30 50 C 34 46 38 54 42 50 C 46 46 50 54 54 50" fill="none" stroke="#2a72c8" stroke-width="2.6" stroke-linecap="round" class="sb-flicker"/><path d="M30 58 C 34 54 38 62 42 58 C 46 54 50 62 54 58" fill="none" stroke="#2a72c8" stroke-width="2.2" stroke-linecap="round" opacity=".7"/></svg>`,
    // Electric — drained energy cell with a bolt cut through it.
    SHOCK: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-shk-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#fffbd0"/><stop offset="50%" stop-color="#e8c81e"/><stop offset="100%" stop-color="#4a3a02"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#ffe63c" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-shk-bg)" stroke="#fffbd0" stroke-width="2"/><g><rect x="24" y="26" width="34" height="34" rx="6" fill="#3a2f04" stroke="#fff" stroke-width="2.5"/><rect x="35" y="20" width="12" height="6" rx="2" fill="#fff"/><rect x="29" y="48" width="24" height="8" rx="2" fill="#ffe63c" opacity=".9"/><rect x="29" y="38" width="24" height="8" rx="2" fill="#ffe63c" opacity=".25"/><rect x="29" y="28" width="24" height="8" rx="2" fill="#ffe63c" opacity=".18"/></g><path d="M50 16 L30 44 L41 44 L34 70 L58 38 L46 38 Z" fill="#fffbd0" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" class="sb-flicker"/></svg>`,
    // Metal — corroding hex nut shedding flakes.
    RUST: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-rst-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#e8eef4"/><stop offset="50%" stop-color="#8e9aa6"/><stop offset="100%" stop-color="#2c3540"/></radialGradient><linearGradient id="sb-rst-nut" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#e2e8ee"/><stop offset="55%" stop-color="#9aa6b2"/><stop offset="100%" stop-color="#a05a28"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#a0aab4" opacity=".28" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-rst-bg)" stroke="#e8eef4" stroke-width="2"/><polygon points="42,16 64,29 64,55 42,68 20,55 20,29" fill="url(#sb-rst-nut)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="42" cy="42" r="11" fill="#2c3540" stroke="#e8eef4" stroke-width="2"/><g fill="#b4501e" opacity=".92"><path d="M24 50 L32 46 L30 56 Z"/><path d="M52 26 L60 30 L52 34 Z"/><circle cx="56" cy="52" r="3.4"/><circle cx="30" cy="32" r="2.6"/></g><g fill="#c8641e" class="sb-floatdn"><circle cx="37" cy="66" r="2.6"/><circle cx="49" cy="68" r="2"/></g></svg>`,
    // Poison — bubbling flask.
    TOXIN: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-tox-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#e4ffd4"/><stop offset="50%" stop-color="#5aba38"/><stop offset="100%" stop-color="#0e3a08"/></radialGradient><linearGradient id="sb-tox-fl" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".85"/><stop offset="55%" stop-color="#a8f078"/><stop offset="100%" stop-color="#3f9e22"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#78dc50" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-tox-bg)" stroke="#e4ffd4" stroke-width="2"/><path d="M36 21 L48 21 L48 35 L60 57 C 63 62 59 66 53 66 L31 66 C 25 66 21 62 24 57 L36 35 Z" fill="url(#sb-tox-fl)" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M28 52 L56 52 L60 57 C 63 62 59 66 53 66 L31 66 C 25 66 21 62 24 57 Z" fill="#2e8a16"/><g fill="#eaffd8" class="sb-float"><circle cx="36" cy="58" r="3.4"/><circle cx="47" cy="60" r="2.6"/><circle cx="42" cy="46" r="2.4" opacity=".8"/></g><rect x="33" y="17" width="18" height="6" rx="3" fill="#fff"/></svg>`,
    // Shadow — sealed sigil eye behind a shadow crescent.
    CURSE: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-crs-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#d8bcff"/><stop offset="50%" stop-color="#7832b4"/><stop offset="100%" stop-color="#1a0630"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#7832b4" opacity=".32" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-crs-bg)" stroke="#d8bcff" stroke-width="2"/><g class="sb-spin-rev" opacity=".9"><polygon points="42,20 50,37 67,38 55,49 58,65 42,56 26,65 29,49 17,38 36,37" fill="none" stroke="#e0c8ff" stroke-width="2.2" stroke-linejoin="round"/></g><path d="M51 24 C 39 28 32 38 34 49 C 36 58 44 63 52 62 C 42 67 29 61 26 51 C 22 38 32 26 51 24 Z" fill="#1a0630" stroke="#e0c8ff" stroke-width="2" stroke-linejoin="round" class="sb-float"/><circle cx="42" cy="42" r="5" fill="#e0c8ff" class="sb-flicker"/></svg>`,
    // Psychic — third eye with radiating awareness.
    INSIGHT: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-ins-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#f0e0ff"/><stop offset="50%" stop-color="#a86cf0"/><stop offset="100%" stop-color="#2a0a50"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#c896ff" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-ins-bg)" stroke="#f0e0ff" stroke-width="2"/><g class="sb-spin-rev" opacity=".7" stroke="#f0e0ff" stroke-width="2" stroke-linecap="round"><line x1="42" y1="14" x2="42" y2="21"/><line x1="42" y1="70" x2="42" y2="63"/><line x1="22" y1="22" x2="27" y2="27"/><line x1="62" y1="62" x2="57" y2="57"/><line x1="22" y1="62" x2="27" y2="57"/><line x1="62" y1="22" x2="57" y2="27"/></g><path d="M20 42 C 29 30 55 30 64 42 C 55 54 29 54 20 42 Z" fill="#fff" stroke="#2a0a50" stroke-width="2" stroke-linejoin="round"/><circle cx="42" cy="42" r="11" fill="#7a30d8"/><circle cx="42" cy="42" r="5" fill="#1a0430"/><circle cx="38" cy="38" r="2.4" fill="#fff" class="sb-flicker"/></svg>`,
    // Light — eye struck out by a glare bar.
    BLIND: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-bld-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#f2e28c"/><stop offset="100%" stop-color="#5a5020"/></radialGradient></defs><circle cx="42" cy="42" r="40" fill="#fffac8" opacity=".32" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-bld-bg)" stroke="#ffffff" stroke-width="2"/><g class="sb-flicker" opacity=".75" stroke="#fffbe0" stroke-width="2.4" stroke-linecap="round"><line x1="42" y1="15" x2="42" y2="22"/><line x1="17" y1="42" x2="24" y2="42"/><line x1="67" y1="42" x2="60" y2="42"/><line x1="23" y1="23" x2="28" y2="28"/><line x1="61" y1="23" x2="56" y2="28"/></g><path d="M20 44 C 29 32 55 32 64 44 C 55 56 29 56 20 44 Z" fill="#fffdf0" stroke="#6a5c20" stroke-width="2" stroke-linejoin="round"/><circle cx="42" cy="44" r="10" fill="#8a7420"/><circle cx="42" cy="44" r="4.5" fill="#3a3008"/><line x1="22" y1="60" x2="62" y2="28" stroke="#3a3008" stroke-width="6" stroke-linecap="round"/><line x1="22" y1="60" x2="62" y2="28" stroke="#fffbe0" stroke-width="2.6" stroke-linecap="round"/></svg>`,
    // Undead — cracked heart shrinking with a falling shard.
    WITHER: `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><defs><radialGradient id="sb-wth-bg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="#d8ccec"/><stop offset="50%" stop-color="#8c78a0"/><stop offset="100%" stop-color="#241a34"/></radialGradient><linearGradient id="sb-wth-heart" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#c8b4dc"/><stop offset="100%" stop-color="#4a3a60"/></linearGradient></defs><circle cx="42" cy="42" r="40" fill="#8c78a0" opacity=".3" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="url(#sb-wth-bg)" stroke="#d8ccec" stroke-width="2"/><path d="M42 64 C 25 52 19 42 19 33 C 19 26 24 22 30 22 C 35 22 39 25 42 30 C 45 25 49 22 54 22 C 60 22 65 26 65 33 C 65 42 59 52 42 64 Z" fill="url(#sb-wth-heart)" stroke="#e0d4f0" stroke-width="2" stroke-linejoin="round" class="sb-floatdn"/><path d="M42 28 L36 40 L46 44 L38 60" fill="none" stroke="#1c1228" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><g stroke="#e0d4f0" stroke-width="2.6" stroke-linecap="round" class="sb-flicker"><line x1="58" y1="52" x2="58" y2="66"/><path d="M53 60 L58 66 L63 60" fill="none" stroke-linejoin="round"/></g></svg>`
};

// Compact heart / bolt glyphs that replace the "HP:" / "SPD:" text labels on
// the cramped arena board cards, letting both stats sit on one line and freeing
// vertical room for larger status badges. They inherit colour via currentColor
// so the existing buffed/damaged/slowed text colours still apply.
const STAT_ICON_HP = `<svg viewBox="0 0 24 24" class="card-stat-icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
const STAT_ICON_SPD = `<svg viewBox="0 0 24 24" class="card-stat-icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.5 2L4 13.5h6.2L9 22l9.5-12.2H12L13.5 2z"/></svg>`;

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

// Neutral fallback sigil. A future catalog row with no art must NOT borrow
// another status' silhouette — a Wind badge wearing Burn's flame reads as Fire.
const STATUS_BADGE_SVG_GENERIC = `<svg viewBox="0 0 84 84" class="sb-svg" aria-hidden="true"><circle cx="42" cy="42" r="40" fill="currentColor" opacity=".22" class="sb-pulse"/><circle cx="42" cy="42" r="34" fill="rgba(12,18,34,0.92)" stroke="currentColor" stroke-width="3"/><circle cx="42" cy="42" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="7 6" class="sb-spin"/><circle cx="42" cy="42" r="6" fill="currentColor" class="sb-flicker"/></svg>`;

function renderStatusBadge(kind, amount, options = {}) {
    const svg = STATUS_BADGE_SVG[kind]
        || (STATUS_BADGE_PALETTE[kind] || STATUS_EFFECT_KEY[kind] ? STATUS_BADGE_SVG_GENERIC : null);
    if (!svg) return '';
    const color = STATUS_BADGE_PALETTE[kind] || '#fff';
    const label = STATUS_BADGE_LABEL[kind] || kind;
    const shieldState = options.shieldState || '';
    const shieldStateText = kind === 'HEALTH_BOOST' && shieldState && shieldState !== 'intact'
        ? ` (${shieldState})`
        : '';
    const stackMode = !!options.stackMode;
    const tooltip = amount > 0
        ? (stackMode ? `${label} ×${amount}${shieldStateText}` : `${label} +${amount}${shieldStateText}`)
        : `${label}${shieldStateText}`;
    const numHtml = amount > 0
        ? `<span class="sb-num" style="--sb-color:${color}">${stackMode ? amount : `+${amount}`}</span>`
        : '';
    const shieldAttr = shieldState ? ` data-shield-state="${shieldState}"` : '';
    return `<span class="sb-badge" style="--sb-color:${color}" title="${tooltip}" data-status="${kind}"${shieldAttr}>${svg}${numHtml}</span>`;
}

function renderStatusBadgesForCell(cell) {
    if (!cell) return '';
    const statuses = Array.isArray(cell.statuses) ? cell.statuses : [];
    const afflictions = Array.isArray(cell.afflictions) ? cell.afflictions : [];
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

    // Elemental damage badges (Burn stacks, etc.) — separate from ability statuses.
    afflictions.forEach((row) => {
        const kind = String(row?.kind || '').toUpperCase();
        const stacks = Number(row?.stacks) || 0;
        if (!kind || stacks <= 0) return;
        push(kind, stacks, { stackMode: true });
    });

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
    // Max-health buff (e.g. a SiegeKnight passive granting +max HP): the card's
    // effective max HP exceeds its printed value. Distinct from the shield above.
    const printedHpForMax = Number(cell.printedHealth);
    const maxHpForBadge = Number(cell.maxHp);
    if (Number.isFinite(printedHpForMax) && Number.isFinite(maxHpForBadge) && maxHpForBadge > printedHpForMax) {
        push('MAX_HEALTH', maxHpForBadge - printedHpForMax);
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

// Locate the live board cell for a given Siegeling instance, scanning both
// boards. Used by the battle action panel so the acting card's HP, Speed, and
// status badges read from the same source as the on-board card.
function findBoardCellByInstanceId(instanceId) {
    if (instanceId == null || !gameState) return null;
    for (const board of [gameState.playerBoard, gameState.enemyBoard]) {
        if (!Array.isArray(board)) continue;
        for (let r = 0; r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
                const cell = board?.[r]?.[c];
                if (cell && cell.instanceId === instanceId) return cell;
            }
        }
    }
    return null;
}

// Compact HP/Speed pills plus any buff/debuff badges for the Siegeling that is
// currently acting, rendered into the battle action panel header.
function renderActingCardStatStrip(cell) {
    if (!cell) return '';
    const pills = renderCardStatPills(cell, { mode: 'board' });
    const badges = renderStatusBadgesForCell(cell);
    if (!pills && !badges) return '';
    return `<div class="battle-queue-card-stats">${pills}${badges}</div>`;
}

function formatStatPillNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : '—';
}

function renderCardStatPills(entity, options = {}) {
    if (!entity) {
        return '';
    }
    const mode = options.mode === 'board' ? 'board' : 'hand';
    const hpVal = mode === 'board'
        ? formatStatPillNumber(entity.hp)
        : formatStatPillNumber(entity.health ?? entity.hp);
    const spdVal = mode === 'board'
        ? formatStatPillNumber(entity.spd)
        : formatStatPillNumber(entity.speed ?? entity.spd);

    const hpClasses = [];
    let spdClass = '';
    if (mode === 'board') {
        const printedHp = Number(entity.printedHealth);
        const currentHp = Number(entity.hp);
        const maxHp = Number(entity.maxHp);
        const printedSpd = Number(entity.printedSpeed);
        const spdNow = Number(entity.spd);
        const shieldInfo = getShieldInfo(entity);
        if (Number.isFinite(currentHp) && Number.isFinite(maxHp) && currentHp < maxHp) {
            hpClasses.push('is-damaged');
        }
        if (shieldInfo.active && shieldInfo.intact > 0) {
            hpClasses.push('is-shielded');
        } else if (Number.isFinite(printedHp) && maxHp > printedHp) {
            hpClasses.push('is-buffed');
        }
        // Note: the damaged-HP (red) class is already added above via the
        // currentHp < maxHp check that pushes 'is-damaged' onto hpClasses.
        // Speed increased -> green text; a reduction (or a speed of 0) turns
        // the SPD text red so a slowed/disabled Siegeling reads at a glance.
        if (Number.isFinite(spdNow) && (spdNow === 0 || (Number.isFinite(printedSpd) && spdNow < printedSpd))) {
            spdClass = ' is-spd-down';
        } else if (Number.isFinite(printedSpd) && Number.isFinite(spdNow) && spdNow > printedSpd) {
            spdClass = ' is-spd-up';
        }
    } else if (options.shielded) {
        hpClasses.push('is-shielded');
    }
    const hpClass = hpClasses.length ? ` ${hpClasses.join(' ')}` : '';

    // Board cards are too small for "HP:" / "SPD:" text, so they use a heart /
    // bolt icon plus the number. Hand and other contexts keep the labelled text.
    const useIcons = mode === 'board';
    const hpInner = useIcons
        ? `${STAT_ICON_HP}<span class="card-stat-num">${hpVal}</span>`
        : `HP: ${hpVal}`;
    const spdInner = useIcons
        ? `${STAT_ICON_SPD}<span class="card-stat-num">${spdVal}</span>`
        : `SPD: ${spdVal}`;
    const pillBaseClass = useIcons ? 'card-stat-pill card-stat-pill-icon' : 'card-stat-pill';

    return `<div class="card-stat-pills" role="group" aria-label="Combat stats">`
        + `<span class="${pillBaseClass} card-stat-pill-hp${hpClass}" title="HP ${hpVal}" aria-label="Health ${hpVal}">${hpInner}</span>`
        + `<span class="${pillBaseClass} card-stat-pill-spd${spdClass}" title="Speed ${spdVal}" aria-label="Speed ${spdVal}">${spdInner}</span>`
        + `</div>`;
}

function hpFillTierClass(pct) {
    // Dynamic health-bar colour by remaining-health percentage.
    if (pct >= 75) return ' hp-fill-high';      // 75-100% green
    if (pct >= 50) return ' hp-fill-mid';        // 50-75%  yellow
    if (pct >= 25) return ' hp-fill-low';        // 25-50%  orange
    return ' hp-fill-critical';                  // <25%    red
}

// Solid HP-tier colour for the top HUD player/enemy health bars, using the
// same thresholds and palette as the board-card HP bars (hpFillTierClass) so a
// player's health bar shifts green -> yellow -> orange -> red as it drops.
// Solid (not a gradient) so background-color transitions smoothly, letting the
// colour morph during the same bar-shrink the damage triggers.
function hudHpTierColor(pct) {
    if (pct >= 75) return '#30ff84';   // green
    if (pct >= 50) return '#f2c744';   // yellow
    if (pct >= 25) return '#f5933d';   // orange
    return '#ff4d4d';                  // red
}

function renderArenaBoardHpBar(cell) {
    const barMax = Number(cell.maxHp);
    const barHp = Number(cell.hp);
    const pct = barMax > 0 ? Math.max(0, Math.min(100, (barHp / barMax) * 100)) : 0;
    const tierClass = hpFillTierClass(pct);
    const shield = Math.max(0, Number(cell.shieldHp) || 0);
    const platesHtml = shield > 0
        ? `<div class="shield-plates" data-shield="${shield}">${
            Array.from({ length: shield }, (_, i) => `<div class="shield-plate" data-plate-index="${i}"></div>`).join('')
        }</div>`
        : '';
    return `<div class="hp-bar${shield > 0 ? ' is-shielded' : ''}">`
        + `<div class="hp-fill${tierClass}" style="width:${pct}%"></div>`
        + platesHtml
        + `</div>`;
}

const ARENA_BOARD_NOTCH_DIRECTIONS = ['TOP_LEFT', 'TOP', 'TOP_RIGHT', 'LEFT', 'RIGHT', 'BOTTOM_LEFT', 'BOTTOM', 'BOTTOM_RIGHT'];

// Elements with a hand-drawn frame template (img/frames/frame-*.png).
// Listed elements render the painted frame on battle-board cards instead
// of the CSS-drawn chrome; geometry lives in style.css under .element-frame.
const ELEMENT_FRAME_CLASS = {
    FIRE: 'frame-fire-metal',
    METAL: 'frame-fire-metal',
    EARTH: 'frame-earth',
    PSYCHIC: 'frame-psychic',
    ICE: 'frame-ice-water',
    WATER: 'frame-ice-water',
    WIND: 'frame-air-electric',
    AIR: 'frame-air-electric',
    ELECTRIC: 'frame-air-electric'
};

const ELEMENT_FRAME_RARITIES = new Set(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']);

const SPELL_TRAP_FRAME_CLASS = {
    FIRE: 'frame-spell-fire',
    EARTH: 'frame-spell-earth',
    ICE: 'frame-spell-ice',
    WIND: 'frame-spell-wind',
    WATER: 'frame-spell-water',
    ELECTRIC: 'frame-spell-electric',
    METAL: 'frame-spell-metal',
    PSYCHIC: 'frame-spell-psychic',
    NEUTRAL: 'frame-spell-neutral'
};

// Spell/trap templates whose info panel is a pale wash, so panel type has to
// invert to dark ink (see getCompactSummaryInkPalette and the matching
// .card-summary-row rule in style.css). Neutral is deliberately absent: it
// moved to the black template and takes the default light-on-dark ink.
const PALE_SPELL_TRAP_FRAMES = new Set(['WATER', 'ELECTRIC', 'METAL', 'PSYCHIC']);

function hasElementFrame(element) {
    return Boolean(ELEMENT_FRAME_CLASS[String(element || '').toUpperCase()]);
}

function elementFrameClass(element, rarity) {
    const frameClass = ELEMENT_FRAME_CLASS[String(element || '').toUpperCase()];
    if (!frameClass) {
        return '';
    }
    const rarityKey = String(rarity || 'COMMON').toUpperCase();
    const rarityClass = ELEMENT_FRAME_RARITIES.has(rarityKey)
        ? `frame-rarity-${rarityKey.toLowerCase()}`
        : 'frame-rarity-common';
    return ` element-frame ${frameClass} ${rarityClass}`;
}

function isSpellTrapCard(card) {
    return card && (card.type === 'SPELL' || card.type === 'TRAP');
}

function cardFrameClass(card) {
    if (isSpellTrapCard(card)) {
        const frameClass = SPELL_TRAP_FRAME_CLASS[String(card.element || '').toUpperCase()];
        if (frameClass) {
            return ` element-frame spell-trap-frame ${frameClass}`;
        }
    }
    return elementFrameClass(card?.element, card?.rarity);
}

function cardTypeClass(card) {
    return card?.type ? `card-type-${String(card.type).toLowerCase()}` : '';
}

function renderArenaBoardFrameNotches(notches, options) {
    const notchMap = {};
    for (const n of (notches || [])) {
        notchMap[n.direction] = n;
    }
    let html = `<div class="hand-notches arena-board-notches"><div class="notch-center"></div>`;
    for (const dir of ARENA_BOARD_NOTCH_DIRECTIONS) {
        const notch = notchMap[dir];
        if (notch) {
            const elemClass = notch.element.toLowerCase();
            const stateClass = options ? getNotchStateClass(notch, { ...options, isBoard: true }) : '';
            html += `<div class="notch-dot ${elemClass} notch-${dir} ${stateClass}" style="${notchIconStyle(notch.element)}"></div>`;
        } else {
            html += `<div class="notch-dot notch-${dir}"></div>`;
        }
    }
    html += `</div>`;
    return html;
}

function buildArenaBoardCardMarkup(cell, context = {}) {
    const elemClass = String(cell.element || 'NEUTRAL').toLowerCase();
    const shieldInfo = getShieldInfo(cell);
    const hasShield = shieldInfo.active && shieldInfo.intact > 0;
    const board = context.board || [];
    const row = Number(context.row);
    const col = Number(context.col);
    const isPlayer = !!context.isPlayer;
    const legalPlacements = context.legalPlacements || [];
    const fallbackArtLabel = formatElementLabel(cell.element);
    const statusBadgesHtml = renderStatusBadgesForCell(cell);

    const heldClass = context.heldCard ? ' sgl-held-card' : '';
    let html = `<div class="board-card hand-card arena-board-card${heldClass} ${elemClass}${hasShield ? ' has-shield' : ''}${elementFrameClass(cell.element, cell.rarity)}${holographicCardClass(cell)}">`;
    if (context.isActing) {
        html += `<div class="acting-badge">Acting</div>`;
    }
    if (context.isClaimable) {
        html += `<div class="claim-prompt" title="Claim" aria-label="Claim" onclick="event.stopPropagation(); openClaimPopup(${row}, ${col})"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.4 1.2v13.6M3.4 2.2h8.7L10.4 5.4l1.7 3.2H3.4"/></svg></div>`;
    }
    html += renderArenaBoardFrameNotches(cell.notches, { board, row, col, isPlayer, legalPlacements });
    html += `<div class="hand-card-shell arena-board-shell">`;
    html += `<div class="hand-card-header arena-board-header">`;
    html += `<div class="card-title">${escapeHtml(cell.name || '')}</div>`;
    html += `</div>`;
    html += renderCardArt(cell, 'hand', fallbackArtLabel);
    html += `<div class="arena-board-combat">`;
    // Order: badges, then the health bar, then the HP/SPD line. Keeping the
    // badges directly above the health bar stops them from crowding the HP/SPD
    // pills off the bottom edge of the card when tokens/statuses are present.
    html += `<div class="arena-board-badges">${statusBadgesHtml}</div>`;
    html += `<div class="arena-board-health">`;
    html += renderArenaBoardHpBar(cell);
    html += `</div>`;
    html += renderCardStatPills(cell, { mode: 'board' });
    html += `</div>`;
    html += `</div>`;
    html += holographicCardOverlay(cell);
    html += `</div>`;
    if (context.isLegal) {
        html += `<div class="evolve-prompt">Evolve</div>`;
    }
    return html;
}

const TARGET_ARROW_STAGGER_MS = 40;
const TARGET_ARROW_FADE_MS = 200;
const TARGET_ARROW_SVG_NS = 'http://www.w3.org/2000/svg';
const DASHBOARD_ACCESS_PASSWORD = 'Aviators4!';
const targetArrowPreviewState = {
    active: false,
    sourceCell: null,
    targetCells: [],
    kind: 'default',
    customPalette: null,
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
    ['ice', 'Ice'],
    ['earth', 'Earth'],
    ['wind', 'Wind'],
    ['water', 'Water'],
    ['shadow', 'Shadow'],
    ['electric', 'Electric'],
    ['metal', 'Metal'],
    ['undead', 'Undead'],
    ['psychic', 'Psychic'],
    ['poison', 'Poison'],
    ['light', 'Light']
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

function describeGameLogEntry(entry) {
    const raw = String(entry || '');
    const prefix = raw.match(/^\[Turn\s+(\d+)\s+(\w+)\]\s*/i);
    const round = raw.match(/---\s*Round\s+(\d+)/i);
    const isOrder = /Turn order this round/i.test(raw);
    let phase = prefix ? prefix[2].toUpperCase() : '';
    let copy = prefix ? raw.slice(prefix[0].length) : raw;
    let kind = 'note';
    let icon = '✦';

    if (round || isOrder) {
        phase = 'ROUND';
        kind = 'round';
        icon = '✦';
        copy = round ? `Round ${round[1]}` : 'Turn order locked in';
    } else if (phase === 'DRAW') {
        kind = 'draw';
        icon = '↗';
    } else if (phase === 'SETUP') {
        kind = 'setup';
        icon = /afflicted|burn|poison|chill|stun|shield/i.test(copy) ? '✹' : '◆';
    } else if (phase === 'BATTLE') {
        kind = /deals?\s+\d+\s+damage|defeat|destroy|bounty/i.test(copy) ? 'impact' : 'battle';
        icon = kind === 'impact' ? '✹' : '⚔';
    }
    if (/phase end/i.test(copy)) {
        kind = 'milestone';
        icon = '—';
    }
    return { phase, kind, icon, copy, turn: prefix ? prefix[1] : '' };
}

function gameLogEntryMarkup(entry, isLatest) {
    const event = describeGameLogEntry(entry);
    if (event.kind === 'round') {
        return `<div class="log-round-divider"><span></span><strong>${escapeHtml(event.copy)}</strong><span></span></div>`;
    }
    const phaseLabel = event.phase || 'EVENT';
    const turnLabel = event.turn ? `<span class="log-turn">T${escapeHtml(event.turn)}</span>` : '';
    return `<article class="log-entry log-entry-${event.kind}${isLatest ? ' is-latest' : ''}">
        <span class="log-entry-icon" aria-hidden="true">${event.icon}</span>
        <div class="log-entry-copy"><div class="log-entry-meta"><span class="log-phase">${escapeHtml(phaseLabel)}</span>${turnLabel}</div><p>${escapeHtml(event.copy)}</p></div>
    </article>`;
}

function renderGameLogToolbar() {
    const bars = [
        document.getElementById('gameLogToolbar'),
        document.getElementById('desktopInspectLogToolbar')
    ].filter(Boolean);
    if (bars.length === 0) {
        return;
    }
    const f = loadLogFilters();
    const html = `
        <span class="game-log-toolbar-label">Show</span>
        <label class="game-log-filter"><input type="checkbox" data-log-filter="turns" ${f.turns ? 'checked' : ''}/> Turns</label>
        <label class="game-log-filter"><input type="checkbox" data-log-filter="rounds" ${f.rounds ? 'checked' : ''}/> Rounds</label>
        <label class="game-log-filter"><input type="checkbox" data-log-filter="actions" ${f.actions ? 'checked' : ''}/> Actions</label>
    `;
    bars.forEach((bar) => {
        bar.innerHTML = html;
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
    });
}

function renderLog() {
    const logs = [
        document.getElementById('gameLog'),
        document.getElementById('desktopInspectGameLog')
    ].filter(Boolean);
    renderGameLogToolbar();
    if (!gameState?.gameLog) {
        logs.forEach((log) => {
            log.innerHTML = '';
        });
        renderDesktopActionHistory();
        return;
    }

    const entries = getFilteredGameLog(gameState.gameLog);
    const html = entries.map((entry, index) => gameLogEntryMarkup(entry, index === 0)).join('');
    logs.forEach((log) => {
        log.innerHTML = html;
        log.scrollTop = 0;
    });
    renderDesktopActionHistory();
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
        title: '1. Connect to sockets',
        copy: 'An elemental notch facing a socket at the board’s edge activates it. The socket supplies 1 energy of that element each round and stays active after the Siegeling leaves.',
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
                <div class="tutorial-caption">The connector shows an active socket link.</div>
            </div>
        `
    },
    {
        title: '2. Link matching elements',
        copy: 'Facing notches of the same element form a link and generate energy of that element each round. A straight connector shows the link between the cards.',
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
                <div class="tutorial-caption">Matching Fire notches form a Fire energy link.</div>
            </div>
        `
    },
    {
        title: '3. Create combo points',
        copy: 'Facing notches of different elements generate a combo point. The connector shows both colours. Check a card’s energy requirements to see which combo it needs.',
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
                <div class="tutorial-caption">Fire and Earth notches form a combo link.</div>
            </div>
        `
    },
    {
        title: '4. Choose battle abilities',
        copy: 'After both players finish Setup, Siegelings act in Speed order. Choose an ability and any required target for each of yours. Reduce the opponent’s HP to zero to win.',
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
                <div class="tutorial-caption">Each player has a 3×3 board and an HP bar.</div>
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

// ── WebP delivery (self-contained; the battle page does not load
// card-binder-visual.js). Every local raster card asset has a .webp twin;
// prefer it when supported and fall back to the original on any load error.
let __sgWebpSupport = null;
function sgWebpSupported() {
    if (__sgWebpSupport !== null) {
        return __sgWebpSupport;
    }
    try {
        const c = document.createElement('canvas');
        __sgWebpSupport = !!(c.getContext && c.getContext('2d'))
            && c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
        __sgWebpSupport = false;
    }
    return __sgWebpSupport;
}
function sgPreferWebp(url) {
    const u = String(url || '');
    if (!u || !sgWebpSupported()) {
        return u;
    }
    return u.replace(/^(\/(?:img|assets)\/[^?#]+)\.(png|jpe?g)(\?[^#]*)?$/i, '$1.webp$3');
}
if (typeof window !== 'undefined' && !window.sgWebpFallback) {
    window.sgWebpFallback = function (img) {
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

// Retry a failed card-art load with backoff. Dashboard creature overlays are
// remote (Firebase Storage) images; a dropped fetch on flaky cellular used to
// leave the card frame permanently empty until the next full re-render.
window.sgArtRetry = function (img) {
    if (!img) {
        return;
    }
    const tries = Number(img.dataset.artRetry || 0);
    if (tries >= 3) {
        img.onerror = null;
        return;
    }
    img.dataset.artRetry = String(tries + 1);
    const src = img.getAttribute('src');
    window.setTimeout(() => {
        if (!img.isConnected || !src) {
            return;
        }
        // Re-assigning the same src after an error re-kicks the load; the
        // immutable HTTP cache serves it instantly if it landed meanwhile.
        img.removeAttribute('src');
        img.setAttribute('src', src);
    }, 500 * Math.pow(2, tries));
};

// Battle re-renders rebuild the board/hand DOM via innerHTML, which destroys
// and recreates every art <img> and aborts any in-flight fetch. Keeping a
// strong reference to a preloaded Image per art URL pins the decoded bitmap
// in the browser's memory cache, so the recreated <img> paints instantly
// instead of blinking out while it refetches/re-decodes multi-MB PNGs.
const battleArtImageCache = new Map();

function preloadArtUrl(url) {
    if (!url || battleArtImageCache.has(url)) {
        return;
    }
    // Soft cap so a long session can't pin unbounded image memory; Map
    // iteration order is insertion order, so this evicts the oldest art
    // (from earlier matches) first.
    while (battleArtImageCache.size >= 64) {
        battleArtImageCache.delete(battleArtImageCache.keys().next().value);
    }
    const img = new Image();
    img.decoding = 'async';
    img.onerror = () => {
        // Drop the failed entry so the next render() pass re-attempts it.
        if (battleArtImageCache.get(url) === img) {
            battleArtImageCache.delete(url);
        }
    };
    img.src = sgPreferWebp(url);
    battleArtImageCache.set(url, img);
}

function preloadCardArtFor(card) {
    preloadArtUrl(getCardArtMeta(card)?.url);
    if (cardShowsPlayerHolographic(card)) {
        preloadArtUrl(String(card?.holographicCardArtUrl || '').trim());
    }
}

function preloadBattleArt() {
    if (!gameState) {
        return;
    }
    (gameState.player?.hand || []).forEach(preloadCardArtFor);
    [gameState.playerBoard, gameState.enemyBoard].forEach((board) => {
        (board || []).forEach((row) => (row || []).forEach((cell) => {
            if (cell) {
                preloadCardArtFor(cell);
            }
        }));
    });
    [gameState.player?.trainer, gameState.enemy?.trainer].forEach((trainer) => {
        preloadArtUrl(String(trainer?.cardArtUrl || '').trim());
    });
}

// CSS transform for a SiegeKnight full-card image, from the dashboard crop/scale
// controls (translate px + scale + rotate). Default (0,0,1,0) → no transform, so
// existing 5:7 cards are unchanged.
function knightArtTransformStyle(trainer) {
    const x = Number(trainer?.cardArtOffsetX);
    const y = Number(trainer?.cardArtOffsetY);
    const scaleN = Number(trainer?.cardArtScale);
    const rotN = Number(trainer?.cardArtRotation);
    const tx = Number.isFinite(x) ? x : 0;
    const ty = Number.isFinite(y) ? y : 0;
    const scale = Number.isFinite(scaleN) ? Math.min(3, Math.max(0.25, scaleN)) : 1;
    const rot = Number.isFinite(rotN) ? Math.min(180, Math.max(-180, rotN)) : 0;
    if (!tx && !ty && scale === 1 && !rot) {
        return '';
    }
    return `transform:translate(${tx}px,${ty}px) scale(${scale}) rotate(${rot}deg);transform-origin:center center;`;
}
function knightArtStyleAttr(trainer) {
    const style = knightArtTransformStyle(trainer);
    return style ? ` style="${escapeHtmlAttribute(style)}"` : '';
}

// Builds `src` (+ WebP fallback) attributes for a local raster art URL.
// URLs without a .webp twin (remote dashboard art) get a retrying onerror so
// one dropped fetch doesn't leave the card art blank.
function webpImgAttrs(url) {
    const original = String(url || '');
    const preferred = sgPreferWebp(original);
    if (preferred === original) {
        return `src="${escapeHtmlAttribute(original)}" onerror="sgArtRetry(this)"`;
    }
    return `src="${escapeHtmlAttribute(preferred)}" data-img-fallback="${escapeHtmlAttribute(original)}" onerror="sgWebpFallback(this)"`;
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

function getDashboardCardArtMeta(card) {
    if (!card) {
        return null;
    }
    const holographicUrl = cardShowsPlayerHolographic(card)
        ? String(card.holographicCardArtUrl || '').trim()
        : '';
    if (holographicUrl) {
        return {
            url: holographicUrl,
            mode: 'HOLOGRAPHIC_FULL_CARD',
            transformStyle: ''
        };
    }
    const url = String(card.cardArtUrl || '').trim();
    const mode = String(card.cardArtMode || '').trim().toUpperCase();
    if (!url || (mode !== 'REPLACE' && mode !== 'OVERLAY')) {
        return null;
    }
    return {
        url,
        mode,
        transformStyle: window.SieglingsCardBinderVisual?.buildArtTransformStyle(card) || ''
    };
}

function getCardArtMeta(card) {
    if (!card) {
        return null;
    }

    const dashboardArt = getDashboardCardArtMeta(card);
    if (dashboardArt?.url) {
        return {
            url: dashboardArt.url,
            crop: dashboardArt.mode === 'REPLACE' ? 'illustration' : 'default',
            transformStyle: dashboardArt.transformStyle,
            fullCard: dashboardArt.mode === 'HOLOGRAPHIC_FULL_CARD'
        };
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
        const fullCardClass = artMeta.fullCard ? ' game-holographic-full-card-art' : '';
        const cropClass = artMeta.crop && artMeta.crop !== 'default'
            ? ` card-art-crop-${artMeta.crop}`
            : '';
        const styleAttr = artMeta.transformStyle ? ` style="${escapeHtmlAttribute(artMeta.transformStyle)}"` : '';
        const artLabel = `${card?.name || 'Card'}${artMeta.fullCard ? ' holographic' : ''} art`;
        // Always load card art eagerly. Lazy-loading blanked the character
        // overlays in two ways: single-card previews starting below the fold
        // never loaded (deck-builder Card View on mobile), and battle
        // re-renders recreate every hand/board <img> via innerHTML, which
        // restarted the lazy deferral each interaction and made the art
        // blink out. All these images are on-screen cards, so eager is right.
        return `<div class="card-art card-art-${variant}${cropClass}${fullCardClass}"><img ${webpImgAttrs(artMeta.url)} alt="${escapeHtmlAttribute(artLabel)}" decoding="async"${styleAttr}></div>`;
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

/** Toggle arena-selected highlight on existing cells without rebuilding the board or overlays. */
function syncArenaSelectionHighlight() {
    document.querySelectorAll('#playerGrid .board-cell.arena-selected, #enemyGrid .board-cell.arena-selected')
        .forEach((el) => el.classList.remove('arena-selected'));
    if (!arenaSelection) {
        return;
    }
    const gridId = arenaSelection.isPlayer ? 'playerGrid' : 'enemyGrid';
    const grid = document.getElementById(gridId);
    if (!grid) {
        return;
    }
    const cellEl = grid.querySelector(
        `.board-cell[data-row="${arenaSelection.row}"][data-col="${arenaSelection.col}"]`
    );
    if (!cellEl) {
        return;
    }
    const cell = getBoardCellAt(arenaSelection.isPlayer, arenaSelection.row, arenaSelection.col);
    if (cell && cell.instanceId === arenaSelection.instanceId) {
        cellEl.classList.add('arena-selected');
    }
}

/**
 * Focus a Siegeling on either board for the live preview / Card Preview drawer.
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
        syncArenaSelectionHighlight();
        return;
    }
    arenaSelection = { isPlayer, row, col, instanceId: cell.instanceId };
    selectedHandIndex = null;
    selectedCard = null;
    clearTargetMode();
    hoveredHandIndex = null;
    updateSelectedInfo(boardCellToPreviewCard(cell));
    syncFocusedCardUi();
    syncArenaSelectionHighlight();
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
    // Mobile: surface the Card Preview tray for the tapped Siegeling (or close it on deselect).
    if (arenaSelection) {
        if (usesLandscapeInspectorMenuDock()) {
            openLandscapeInspectorMenu('card');
        } else {
            openDrawer('selected');
        }
    } else if (activeDrawer === 'selected') {
        closeDrawer();
    } else if (usesLandscapeInspectorMenuDock() && desktopInspectTab !== 'card') {
        setDesktopInspectTab('card');
    }
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
    updateSelectedInfo(card, card ? null : 'Hover, select a hand card, or click a Siegeling on the board.');
    if (usesLandscapeInspectorMenuDock()) {
        openLandscapeInspectorMenu('card');
        return;
    }
    openDrawer('selected');
}

/** Compact move rows from server (`moves` on Siegelings) or fall back to ability objects. */
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
        case 'FIRE':
            return defender === 'ICE' || defender === 'METAL';
        case 'ICE':
            return defender === 'WIND' || defender === 'POISON';
        case 'WIND':
            return defender === 'EARTH' || defender === 'WATER';
        case 'EARTH':
            return defender === 'FIRE' || defender === 'ELECTRIC';
        case 'WATER':
            return defender === 'FIRE' || defender === 'ICE';
        case 'METAL':
            return defender === 'EARTH' || defender === 'WIND';
        case 'ELECTRIC':
            return defender === 'WIND' || defender === 'FIRE';
        case 'POISON':
            return defender === 'ICE' || defender === 'EARTH';
        case 'SHADOW':
            return defender === 'PSYCHIC' || defender === 'LIGHT';
        case 'PSYCHIC':
            return defender === 'LIGHT' || defender === 'UNDEAD';
        case 'LIGHT':
            return defender === 'UNDEAD' || defender === 'SHADOW';
        case 'UNDEAD':
            return defender === 'SHADOW' || defender === 'PSYCHIC';
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
    return effectType === 'damage' || effectType === 'chain_damage' || getBattleAbilityBaseDamage(ability) > 0;
}

function isChainTargetAbility(ability) {
    return String(ability?.effectType || '').trim().toLowerCase() === 'chain_damage';
}

/**
 * Cells wired to (row, col) by an active reciprocal notch link — the extra victims a chain
 * effect arcs to. Mirrors PlacementService.getDirectlyConnectedAllies so the highlight cannot
 * promise a hit the server will not deal.
 */
function getLinkedBoardCells(board, isPlayer, row, col) {
    const origin = board?.[row]?.[col];
    if (!origin) {
        return [];
    }
    const linked = [];
    for (const notch of (origin.notches || [])) {
        const delta = directionDelta(notch.direction, isPlayer);
        const nextRow = row + delta.dy;
        const nextCol = col + delta.dx;
        if (nextRow < 0 || nextRow > 2 || nextCol < 0 || nextCol > 2) {
            continue;
        }
        const neighbor = board?.[nextRow]?.[nextCol];
        if (!neighbor || !hasOppositeNotch(neighbor.notches, notch.direction)) {
            continue;
        }
        if (linked.some((cell) => cell.row === nextRow && cell.col === nextCol)) {
            continue;
        }
        linked.push({ isPlayer, row: nextRow, col: nextCol });
    }
    return linked;
}

/** Primary picks plus everything the chain jumps to, deduped, for arrow previews. */
function expandChainTargetCells(ability, cells) {
    if (!isChainTargetAbility(ability)) {
        return (cells || []).filter(Boolean);
    }
    const out = [];
    const seen = new Set();
    const push = (cell) => {
        const key = `${cell.isPlayer ? 'p' : 'e'}:${cell.row}:${cell.col}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        out.push(cell);
    };
    (cells || []).filter(Boolean).forEach((cell) => {
        push(cell);
        const board = cell.isPlayer ? gameState?.playerBoard : gameState?.enemyBoard;
        getLinkedBoardCells(board || [], cell.isPlayer, cell.row, cell.col).forEach(push);
    });
    return out;
}

function clearChainTargetHighlights() {
    document.querySelectorAll('.board-cell.chain-target').forEach((el) => el.classList.remove('chain-target'));
}

/** Light up the linked cells a chain would splash to from the given primary picks. */
function applyChainTargetHighlights(ability, primaryCells) {
    clearChainTargetHighlights();
    if (!isChainTargetAbility(ability)) {
        return;
    }
    (primaryCells || []).filter(Boolean).forEach((cell) => {
        const board = cell.isPlayer ? gameState?.playerBoard : gameState?.enemyBoard;
        getLinkedBoardCells(board || [], cell.isPlayer, cell.row, cell.col).forEach((linked) => {
            findBoardCellEl(linked.isPlayer, linked.row, linked.col)?.classList.add('chain-target');
        });
    });
}

/**
 * Untargeted chain damage lands on the busiest link hub, ties going to the weakest unit —
 * the same pick EffectService.findBestChainTarget makes, so the preview matches resolution.
 */
function findBestChainPreviewCell(board) {
    let best = null;
    let bestLinks = -1;
    let bestHp = 0;
    for (const row of [2, 1, 0]) {
        for (let col = 0; col < 3; col++) {
            const cell = board?.[row]?.[col];
            if (!cell) {
                continue;
            }
            const links = getLinkedBoardCells(board, false, row, col).length;
            const hp = Number(cell.hp) || 0;
            if (links > bestLinks || (links === bestLinks && best && hp < bestHp)) {
                best = { isPlayer: false, row, col };
                bestLinks = links;
                bestHp = hp;
            }
        }
    }
    return best;
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
    const cells = getBattleAbilityEnemyTargets(ability, selectedRow);
    const weakTargets = cells.filter((cell) => isElementWeakTo(attackerElement, cell?.element));
    const resistTargets = cells.filter((cell) => isElementWeakTo(cell?.element, attackerElement));
    const parts = [];
    if (weakTargets.length > 0) {
        parts.push(`Weakness +1: ${formatWeakTargetNames(weakTargets)} take ${baseDamage + 1}.`);
    }
    if (resistTargets.length > 0) {
        // Resistance mirrors EffectService: -1, which can zero out a 1-damage hit.
        parts.push(`Resist -1: ${formatWeakTargetNames(resistTargets)} take ${Math.max(0, baseDamage - 1)}.`);
    }
    return parts.join(' ');
}

/**
 * The best "the hit does not kill it, the Burn that follows does" single-target
 * play available to whoever is acting, or null.
 *
 * This is the lesson the tutorial teaches on a Fire attacker: raw damage is not
 * the whole number. Weakness adds 1, and Fire damage leaves a Burn stack that
 * ticks at the start of the owner's next Setup — so a target that survives the
 * swing by a point or two is already dead, and the swing is better spent there
 * than on something the burn cannot finish.
 *
 * Deliberately only reports a kill the BURN completes: a move that kills
 * outright teaches nothing about burn, and one that leaves the target standing
 * afterwards is not a plan. Damage, weakness and burn all read from the same
 * helpers/state the move panel and its badges render from, so the coach cannot
 * promise a kill the board disagrees with. Stack maths mirrors
 * ElementalAfflictionCatalog's FIRE row (1 damage per stack, 1 per hit, cap 5).
 */
function getBattleBurnKillPlan() {
    const pending = gameState?.pendingBattle;
    if (!pending || gameState?.currentPhase !== 'BATTLE' || gameState?.activeSide !== 'PLAYER') {
        return null;
    }
    const element = String(pending.element || '').trim().toUpperCase();
    if (element !== 'FIRE') {
        return null;
    }
    const burnDef = STATUS_EFFECT_KEY?.BURN || {};
    const burnCap = Number(burnDef.cap) || 5;
    const abilities = (pending.abilities || [])
        .filter((a) => a && a.affordable && !a.fromPrintedPassive)
        .filter((a) => String(a.targetType || '').trim().toUpperCase() === 'SINGLE_ENEMY')
        .filter((a) => isBattleDamageAbility(a) && getBattleAbilityBaseDamage(a) > 0);
    let best = null;
    for (const ability of abilities) {
        const base = getBattleAbilityBaseDamage(ability);
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const cell = gameState?.enemyBoard?.[row]?.[col];
                const hp = Number(cell?.hp ?? cell?.currentHealth);
                if (!cell || !Number.isFinite(hp) || hp <= 0) continue;
                const weak = isElementWeakTo(element, cell.element);
                const resists = !weak && isElementWeakTo(cell.element, element);
                const hit = Math.max(0, base + (weak ? 1 : 0) - (resists ? 1 : 0));
                const left = hp - hit;
                // Already dead on the swing — a fine play, but not this lesson.
                if (left <= 0) continue;
                const stacks = Math.min(burnCap, getCellAfflictionStacks(cell, 'BURN') + 1);
                if (left > stacks) continue;
                const plan = {
                    abilityIndex: ability.index,
                    abilityName: getBattleAbilityDisplayName(ability),
                    attacker: pending.name || null,
                    target: cell.name || null,
                    row,
                    col,
                    hp,
                    hit,
                    weak,
                    burn: stacks,
                    left
                };
                // Prefer the biggest hit, then the target with the least slack —
                // the tightest kill is the clearest demonstration.
                if (!best || plan.hit > best.hit || (plan.hit === best.hit && plan.left < best.left)) {
                    best = plan;
                }
            }
        }
    }
    return best;
}

function getCellAfflictionStacks(cell, kind) {
    const want = String(kind || '').toUpperCase();
    const rows = Array.isArray(cell?.afflictions) ? cell.afflictions : [];
    for (const row of rows) {
        if (String(row?.kind || '').toUpperCase() === want) {
            return Math.max(0, Number(row?.stacks) || 0);
        }
    }
    return 0;
}

function effectKindFor(ability) {
    const effectType = String(ability?.effectType || '').trim().toLowerCase();
    return EFFECT_KIND_MAP[effectType] || 'default';
}

function resolveTargetingArrowPalette(ability) {
    const kind = effectKindFor(ability);
    if (kind === 'heal' || kind === 'buff' || kind === 'freeze' || kind === 'move') {
        return { kind };
    }
    const casterElement = String(gameState?.pendingBattle?.element || '').trim().toUpperCase();
    const elementPalette = TARGET_ARROW_ELEMENT_PALETTES[casterElement];
    if (elementPalette) {
        return { kind: 'custom', palette: elementPalette };
    }
    return { kind };
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

// Resolve the rendered card's box (relative to the board area) for a given
// cell. We anchor to the inner `.board-card` element rather than the `.board-cell`
// so arrows attach to the visible card, not the larger padded grid slot (which
// also contains the row tag). Falls back to the cell when no card is present.
function getDomCardRect(isPlayer, row, col) {
    const boardArea = document.getElementById('boardArea');
    const grid = document.getElementById(isPlayer ? 'playerGrid' : 'enemyGrid');
    const cell = grid?.querySelector(`.board-cell[data-row="${row}"][data-col="${col}"]`);
    if (!boardArea || !cell) {
        return null;
    }
    const anchor = cell.querySelector(':scope > .board-card') || cell;
    const areaRect = boardArea.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }
    return {
        left: rect.left - areaRect.left,
        top: rect.top - areaRect.top,
        width: rect.width,
        height: rect.height
    };
}

function getDomCellCenter(isPlayer, row, col) {
    const rect = getDomCardRect(isPlayer, row, col);
    if (!rect) {
        return null;
    }
    return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2)
    };
}

// Source anchor for attack lines: the centre of the card's FRONT edge — the
// edge facing the opponent. Player cards face upward (front = top edge); enemy
// cards face downward (front = bottom edge). Computed from the live card box so
// the line consistently starts at the front-centre of the attacking card on any
// screen size.
function getDomCardFrontCenter(isPlayer, row, col) {
    const rect = getDomCardRect(isPlayer, row, col);
    if (!rect) {
        return null;
    }
    return {
        x: rect.left + (rect.width / 2),
        y: isPlayer ? rect.top : rect.top + rect.height
    };
}

function drawDomTargetingPreview(timestamp) {
    const state = targetArrowPreviewState;
    if (!state.active || !state.sourceCell || state.targetCells.length === 0) {
        return;
    }
    const svg = ensureDomTargetingPreviewLayer();
    const boardArea = document.getElementById('boardArea');
    if (!svg || !boardArea) {
        clearDomTargetingPreview();
        return;
    }
    const areaRect = boardArea.getBoundingClientRect();
    const width = Math.max(1, Math.round(areaRect.width));
    const height = Math.max(1, Math.round(areaRect.height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    // Resolve live card centers every frame so arrows track layout, scroll, and
    // CSS transforms (e.g. mobile targeting camera scale) instead of stale pixels.
    const source = getDomCellCenter(state.sourceCell.isPlayer, state.sourceCell.row, state.sourceCell.col);
    const targets = [];
    state.targetCells.forEach((cell) => {
        const center = getDomCellCenter(cell.isPlayer, cell.row, cell.col);
        if (center) {
            targets.push({ x: center.x, y: center.y, appearedAt: cell.appearedAt });
        }
    });
    if (!source || targets.length === 0) {
        // Layout is mid-change (cells momentarily hidden / zero-size). Skip this
        // frame but keep the loop alive so the arrows snap back once it settles.
        svg.innerHTML = '';
        if (state.active && !state.reducedMotion) {
            state.raf = window.requestAnimationFrame(drawDomTargetingPreview);
        }
        return;
    }

    const elapsed = Math.max(0, timestamp - state.startedAt);
    const palette = state.customPalette
        || TARGET_ARROW_PALETTES[state.kind]
        || TARGET_ARROW_PALETTES.default;
    const sceneCenterY = height / 2;
    const defs = [];
    const shapes = [];
    state.dashPhase = state.reducedMotion ? 0 : (elapsed * 0.0006) % 1;

    targets.forEach((target, index) => {
        const alpha = state.reducedMotion ? 1 : targetArrowClamp((elapsed - target.appearedAt) / TARGET_ARROW_FADE_MS, 0, 1);
        if (alpha <= 0) {
            return;
        }
        const control = targetArrowControlPoint(source, target, sceneCenterY);
        const path = targetArrowPath(source, control, target);
        const gradId = `targetArrowGrad${index}`;
        defs.push(`<linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" x1="${source.x.toFixed(1)}" y1="${source.y.toFixed(1)}" x2="${target.x.toFixed(1)}" y2="${target.y.toFixed(1)}"><stop offset="0%" stop-color="${palette.source}"/><stop offset="100%" stop-color="${palette.target}"/></linearGradient>`);

        shapes.push(`<path d="${path}" fill="none" stroke="${palette.glow}" stroke-width="10" stroke-linecap="round" opacity="${(0.18 * alpha).toFixed(3)}"/>`);
        shapes.push(`<path d="${path}" fill="none" stroke="url(#${gradId})" stroke-width="2.5" stroke-linecap="round" opacity="${(0.94 * alpha).toFixed(3)}"/>`);

        if (!state.reducedMotion) {
            const dashOffset = -((state.dashPhase + (index * 0.04)) % 1);
            const dashColor = targetArrowMixColor('#ffffff', palette.target, 0.28);
            shapes.push(`<path d="${path}" fill="none" pathLength="1" stroke="${dashColor}" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.06 0.106" stroke-dashoffset="${dashOffset.toFixed(3)}" opacity="${(0.72 * alpha).toFixed(3)}"/>`);
        }

        const tail = targetArrowQuadPoint(source, control, target, 0.965);
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

    shapes.push(`<circle cx="${source.x.toFixed(1)}" cy="${source.y.toFixed(1)}" r="12" fill="${palette.source}" opacity="0.16"/>`);
    shapes.push(`<circle cx="${source.x.toFixed(1)}" cy="${source.y.toFixed(1)}" r="5" fill="${palette.source}" opacity="0.5"/>`);
    svg.innerHTML = `<defs>${defs.join('')}</defs>${shapes.join('')}`;
    svg.classList.add('is-active');

    if (state.active && !state.reducedMotion) {
        state.raf = window.requestAnimationFrame(drawDomTargetingPreview);
    }
}

function showDomTargetingPreview(sourceCell, targetCells, paletteSpec) {
    if (!sourceCell || !Array.isArray(targetCells) || targetCells.length === 0) {
        clearDomTargetingPreview();
        return;
    }
    if (targetArrowPreviewState.raf) {
        window.cancelAnimationFrame(targetArrowPreviewState.raf);
    }
    const resolved = (typeof paletteSpec === 'object' && paletteSpec)
        ? paletteSpec
        : { kind: paletteSpec };
    const kind = resolved.kind || 'default';
    targetArrowPreviewState.active = true;
    targetArrowPreviewState.sourceCell = {
        isPlayer: Boolean(sourceCell.isPlayer),
        row: sourceCell.row,
        col: sourceCell.col
    };
    targetArrowPreviewState.targetCells = targetCells
        .filter(Boolean)
        .slice(0, 9)
        .map((cell, index) => ({
            isPlayer: Boolean(cell.isPlayer),
            row: cell.row,
            col: cell.col,
            appearedAt: index * TARGET_ARROW_STAGGER_MS
        }));
    targetArrowPreviewState.kind = TARGET_ARROW_PALETTES[kind] ? kind : 'default';
    targetArrowPreviewState.customPalette = resolved.palette || null;
    targetArrowPreviewState.startedAt = performance.now();
    targetArrowPreviewState.raf = 0;
    drawDomTargetingPreview(targetArrowPreviewState.startedAt);
}

function clearDomTargetingPreview() {
    if (targetArrowPreviewState.raf) {
        window.cancelAnimationFrame(targetArrowPreviewState.raf);
    }
    targetArrowPreviewState.active = false;
    targetArrowPreviewState.sourceCell = null;
    targetArrowPreviewState.targetCells = [];
    targetArrowPreviewState.customPalette = null;
    targetArrowPreviewState.raf = 0;
    const svg = document.querySelector('.target-arrow-dom-layer');
    if (svg) {
        svg.classList.remove('is-active');
        svg.innerHTML = '';
    }
}

const targetPreviewController = {
    show(sourceCell, targetCells, kind) {
        showDomTargetingPreview(sourceCell, targetCells, kind);
    },
    clear() {
        clearDomTargetingPreview();
    },
    cellCenter(isPlayer, row, col) {
        return getDomCellCenter(isPlayer, row, col);
    }
};

// Keep targeting arrows aligned when the layout changes. The animation loop
// already re-resolves cell positions every frame, but reduced-motion mode draws
// a single static frame, so it needs an explicit redraw on resize/scroll/rotate.
function refreshTargetingPreviewOnLayoutChange() {
    if (targetArrowPreviewState.active) {
        drawDomTargetingPreview(performance.now());
    }
}
window.addEventListener('resize', refreshTargetingPreviewOnLayoutChange);
window.addEventListener('orientationchange', refreshTargetingPreviewOnLayoutChange);
window.addEventListener('scroll', refreshTargetingPreviewOnLayoutChange, true);

function clearTargetingPreview() {
    targetPreviewController.clear();
    clearMatchupBadges();
    clearChainTargetHighlights();
}

function sourceCellCenter() {
    const pending = gameState?.pendingBattle;
    if (!pending || pending.row == null || pending.col == null) {
        return null;
    }
    return targetPreviewController.cellCenter(true, pending.row, pending.col);
}

function sourceCellDescriptor() {
    const pending = gameState?.pendingBattle;
    if (!pending || pending.row == null || pending.col == null) {
        return null;
    }
    return { isPlayer: true, row: pending.row, col: pending.col };
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
            if (isChainTargetAbility(ability)) {
                const hub = findBestChainPreviewCell(enemyBoard);
                if (hub) {
                    return [hub];
                }
            }
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

/**
 * @param cells the primary picks; chain effects expand these to their linked cells here.
 * @param options.chained pass false when `cells` is the whole "any of these" option list rather
 *        than a committed pick — every enemy is already lit, so arcing off each one says nothing.
 */
function showBattleTargetCellsPreview(ability, cells, options = {}) {
    const sourceCell = sourceCellDescriptor();
    const chained = options.chained !== false;
    const primaryCells = (cells || []).filter(Boolean);
    const targetCells = chained ? expandChainTargetCells(ability, primaryCells) : primaryCells;
    if (!sourceCell || targetCells.length === 0) {
        clearTargetingPreview();
        return;
    }
    targetPreviewController.show(sourceCell, targetCells, resolveTargetingArrowPalette(ability));
    applyMatchupBadgesForCells(ability, targetCells);
    applyChainTargetHighlights(chained ? ability : null, primaryCells);
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

/** @returns {{cells: Array, chained: boolean}} chained=false for the broad "pick any of these" list. */
function getBattleTargetingPreviewCells(ability) {
    if (!ability || !targetMode || !targetContext || targetContext.mode !== 'battle') {
        return { cells: [], chained: true };
    }
    if (isRowSelectTargetSide(targetContext.side)) {
        return { cells: previewTargetsFor(ability, getRowSelectSelectedRow()), chained: getRowSelectSelectedRow() >= 0 };
    }
    if (targetContext.side === 'enemy') {
        return { cells: collectPreviewCells(gameState?.enemyBoard || [], false), chained: false };
    }
    if (targetContext.side === 'ally') {
        return { cells: collectPreviewCells(gameState?.playerBoard || [], true), chained: false };
    }
    return { cells: previewTargetsFor(ability), chained: true };
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
            const preview = getBattleTargetingPreviewCells(activeAbility);
            showBattleTargetCellsPreview(activeAbility, preview.cells, { chained: preview.chained });
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

/** The ability driving the current target selection, whatever started it (move, spell, trainer). */
function getActiveTargetContextAbility() {
    if (!targetMode || !targetContext) {
        return null;
    }
    if (targetContext.mode === 'battle') {
        return getActiveBattleTargetAbility();
    }
    return targetContext.ability || null;
}

function previewCellHover(isPlayer, row, col) {
    if (!targetMode || !targetContext) {
        return;
    }
    if (targetContext.mode !== 'battle') {
        // Spells, traps, and trainer actives have no board source cell to draw arrows from, so a
        // chain effect just lights up the links it would arc through from the hovered target.
        applyChainTargetHighlights(getActiveTargetContextAbility(), [{ isPlayer, row, col }]);
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

function getBattleAbilityDisplayName(ability) {
    return String(ability?.name || 'Move').trim() || 'Move';
}

function getBattleAbilityEffectLine(ability) {
    const name = getBattleAbilityDisplayName(ability);
    let desc = String(ability?.description || '').trim();
    if (desc && name && desc.toLowerCase().startsWith(name.toLowerCase())) {
        desc = desc.slice(name.length).replace(/^[\s:–—-]+/, '').trim();
    }
    if (desc) {
        return desc;
    }
    const effect = formatAbilityEffectLabel(ability);
    if (effect) {
        return effect;
    }
    const target = formatAbilityTargetLabel(ability);
    return target || 'Resolves after you finish targeting.';
}

function getBattleTargetingEffectCategory(ability) {
    const effectType = String(ability?.effectType || '').trim().toLowerCase();
    if (effectType === 'player_damage') {
        return 'player';
    }
    if (effectType === 'move_link') {
        return 'move';
    }
    const kind = effectKindFor(ability);
    if (kind === 'heal' || effectType === 'heal' || effectType === 'shield') {
        return 'heal';
    }
    if (kind === 'buff' || /boost|shield|draw/.test(effectType)) {
        return 'buff';
    }
    if (kind === 'freeze' || /freeze|slow|speed_zero/.test(effectType)) {
        return 'control';
    }
    if (kind === 'damage' || effectType === 'destroy' || effectType === 'damage') {
        return 'damage';
    }
    return kind || 'default';
}

function buildBattleTargetingArrowHint(ability, targetSide, selectedRow = -1) {
    const category = getBattleTargetingEffectCategory(ability);
    const preview = getBattleTargetingPreviewCells(ability);
    const hasArrowPreview = (preview.cells || []).length > 0 && Boolean(sourceCellCenter());

    if (targetSide === 'row-enemy' || targetSide === 'row-ally') {
        if (selectedRow < 0) {
            return hasArrowPreview
                ? 'Preview arrows fan out from your ACTING Siegeling toward valid rows. Tap any highlighted card in the row you want.'
                : 'Tap any highlighted Siegeling in the row you want to affect.';
        }
        return hasArrowPreview
            ? 'Arrows show which enemies in this row your move will hit. Confirm when ready.'
            : 'Every Siegeling in the selected row will be affected.';
    }

    if (!hasArrowPreview) {
        return 'Valid targets are highlighted on the board. Tap one to continue.';
    }

    switch (category) {
        case 'heal':
            return 'Follow the green preview arrow from your ACTING Siegeling to the ally you want to heal, then tap that card.';
        case 'buff':
            return 'Follow the blue preview arrow from your ACTING Siegeling to the ally you want to empower, then tap that card.';
        case 'control':
            return 'Follow the icy preview arrow from your ACTING Siegeling to the enemy you want to slow or freeze, then tap that card.';
        case 'move':
            return 'Follow the purple preview arrow to see where the forced movement will pull an enemy, then tap the highlighted target.';
        case 'damage':
            return 'Follow the orange attack arrow from your ACTING Siegeling to a highlighted enemy. Tap that card to strike. Red Weak badges mean +1 damage; gold Strong badges mean -1 damage. No badge means flat damage.';
        default:
            return 'Follow the glowing preview arrow from your ACTING Siegeling to a highlighted target on the board, then tap that card.';
    }
}

function buildBattleTargetMessage(targetSide, ability, selectedRow = -1) {
    return buildBattleTargetingInstruction(targetSide, ability, selectedRow).banner;
}

function buildBattleTargetingInstruction(targetSide, ability, selectedRow = -1) {
    const weakness = formatBattleAbilityWeaknessPreview(ability, selectedRow);
    const weaknessSuffix = weakness ? ` ${weakness}` : '';
    const moveName = getBattleAbilityDisplayName(ability);
    const effectLine = getBattleAbilityEffectLine(ability);
    const category = getBattleTargetingEffectCategory(ability);
    const arrowHint = buildBattleTargetingArrowHint(ability, targetSide, selectedRow);
    const targetLabel = formatAbilityTargetLabel(ability);
    const base = {
        moveName,
        effectLine,
        arrowHint,
        banner: '',
        trayStateLabel: 'Pick Target',
        headline: 'Choose a target',
        steps: []
    };

    if (targetSide === 'row-enemy') {
        if (selectedRow >= 0) {
            const rowName = ROW_NAMES[selectedRow] || 'Selected';
            const targets = getRowSelectTargets(selectedRow).map((cell) => cell?.name).filter(Boolean);
            const targetLine = targets.length > 0 ? ` Hits: ${targets.join(', ')}.` : '';
            return {
                ...base,
                trayStateLabel: 'Confirm Row',
                banner: `${rowName} enemy row locked in.${weaknessSuffix}`,
                headline: `Confirm ${rowName} row attack`,
                steps: [
                    `${moveName} will hit every enemy Siegeling in the ${rowName} row.`,
                    arrowHint,
                    'Tap Confirm Row to queue the attack, or Change Row to pick a different row.',
                    'Tap Cancel below to return to the move list.'
                ],
                effectLine: `${effectLine}${targetLine}${weaknessSuffix}`
            };
        }
        return {
            ...base,
            trayStateLabel: 'Choose Row',
            banner: `Pick an enemy row for ${moveName}.${weaknessSuffix}`,
            headline: category === 'damage' ? 'Pick a row to attack' : 'Pick an enemy row',
            steps: [
                `${moveName}: ${effectLine}`,
                arrowHint,
                'Tap any enemy Siegeling in the row you want — the whole row is included.',
                'Tap Cancel below to pick a different move.'
            ]
        };
    }

    if (targetSide === 'row-ally') {
        if (selectedRow >= 0) {
            const rowName = ROW_NAMES[selectedRow] || 'Selected';
            const targets = getRowSelectTargets(selectedRow).map((cell) => cell?.name).filter(Boolean);
            const targetLine = targets.length > 0 ? ` Helps: ${targets.join(', ')}.` : '';
            return {
                ...base,
                trayStateLabel: 'Confirm Row',
                banner: `${rowName} friendly row locked in.`,
                headline: `Confirm ${rowName} row support`,
                steps: [
                    `${moveName} will affect every ally Siegeling in the ${rowName} row.`,
                    arrowHint,
                    'Tap Confirm Row to queue the action, or Change Row to pick a different row.',
                    'Tap Cancel below to return to the move list.'
                ],
                effectLine: `${effectLine}${targetLine}`
            };
        }
        return {
            ...base,
            trayStateLabel: 'Choose Row',
            banner: `Pick a friendly row for ${moveName}.`,
            headline: category === 'heal' || category === 'buff' ? 'Pick a row to support' : 'Pick a friendly row',
            steps: [
                `${moveName}: ${effectLine}`,
                arrowHint,
                'Tap any of your Siegelings in the row you want — the whole row is included.',
                'Tap Cancel below to pick a different move.'
            ]
        };
    }

    if (targetSide === 'ally') {
        const allyHeadline = category === 'heal'
            ? 'Pick an ally to heal'
            : category === 'buff'
                ? 'Pick an ally to empower'
                : 'Pick a friendly Siegeling';
        return {
            ...base,
            trayStateLabel: category === 'heal' ? 'Pick Ally' : 'Pick Ally',
            banner: `Select an ally for ${moveName}.`,
            headline: allyHeadline,
            steps: [
                `${moveName}: ${effectLine}`,
                targetLabel ? `Targeting: ${targetLabel}.` : '',
                arrowHint,
                'Only your highlighted Siegelings can be selected.',
                'Tap Cancel below to pick a different move.'
            ].filter(Boolean)
        };
    }

    const enemyHeadline = category === 'control'
        ? 'Pick an enemy to hinder'
        : category === 'move'
            ? 'Pick an enemy to move'
            : category === 'damage'
                ? 'Pick an enemy to hit'
                : 'Pick an enemy Siegeling';

    return {
        ...base,
        trayStateLabel: 'Pick Target',
        banner: `Select an enemy for ${moveName}.${weaknessSuffix}`,
        headline: enemyHeadline,
        steps: [
            `${moveName}: ${effectLine}`,
            targetLabel ? `Targeting: ${targetLabel}.` : '',
            arrowHint,
            weakness ? weakness : '',
            'Tap Cancel below to pick a different move.'
        ].filter(Boolean)
    };
}

function renderBattleTargetingTray(pending, ability) {
    const targetSide = targetContext?.side;
    const selectedRow = getRowSelectSelectedRow();
    const instructions = buildBattleTargetingInstruction(targetSide, ability, selectedRow);

    // The landscape board already shows highlighted rows and preview arrows.
    // Keep the dock brief and put row confirmation in the fixed board overlay.
    if (isCompactLandscapeLayout()) {
        let compactHtml = '<div class="battle-targeting-tray battle-targeting-tray-compact-landscape">';
        compactHtml += '<div class="battle-targeting-move">';
        compactHtml += '<div class="battle-targeting-move-label">Selected move</div>';
        compactHtml += `<div class="battle-targeting-move-name">${escapeHtml(instructions.moveName)}</div>`;
        compactHtml += `<div class="battle-targeting-move-desc">${escapeHtml(instructions.effectLine)}</div>`;
        compactHtml += '</div>';
        compactHtml += '<div class="battle-targeting-actions">';
        compactHtml += '<button class="battle-targeting-cancel" type="button" onclick="cancelBattleTargetSelection()">Cancel — choose a different move</button>';
        compactHtml += '</div>';
        compactHtml += '</div>';
        return compactHtml;
    }

    let html = '<div class="battle-targeting-tray">';
    html += '<div class="battle-targeting-move">';
    html += '<div class="battle-targeting-move-label">Selected move</div>';
    html += `<div class="battle-targeting-move-name">${escapeHtml(instructions.moveName)}</div>`;
    html += `<div class="battle-targeting-move-desc">${escapeHtml(instructions.effectLine)}</div>`;
    html += '</div>';
    html += `<div class="battle-targeting-headline">${escapeHtml(instructions.headline)}</div>`;
    html += '<div class="battle-targeting-arrow-callout" role="status">';
    html += '<span class="battle-targeting-arrow-icon" aria-hidden="true">↗</span>';
    html += `<span class="battle-targeting-arrow-text">${escapeHtml(instructions.arrowHint)}</span>`;
    html += '</div>';
    html += '<ul class="battle-targeting-steps">';
    instructions.steps.forEach((step) => {
        html += `<li>${escapeHtml(step)}</li>`;
    });
    html += '</ul>';

    if (isRowSelectBattleTargetContext()) {
        html += renderRowSelectBattleConfirm();
    }

    html += '<div class="battle-targeting-actions">';
    html += '<button class="battle-targeting-cancel" type="button" onclick="cancelBattleTargetSelection()">Cancel — choose a different move</button>';
    html += '</div>';
    html += `<div class="battle-targeting-footnote">Acting Siegeling: ${escapeHtml(pending?.name || 'Siegeling')}</div>`;
    html += '</div>';
    return html;
}

function cancelBattleTargetSelection() {
    if (!isBattleTargetSelectionActive()) {
        return;
    }
    clearTargetingPreview();
    clearTargetMode();
    render();
    if (!usesInlineBattleDock() && isMobileLayout()) {
        mobileInfoTab = 'battle';
        openDrawer('battle');
    }
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

function formatCardReferenceName(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }
    return raw
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function getCardEvolutionSourceName(card) {
    return String(card?.evolvesFromName || '').trim()
        || formatCardReferenceName(card?.evolvesFromId);
}

function getCompactAbilityName(card, ability) {
    const name = String(ability?.name || '').trim();
    if (!name) {
        return 'Move';
    }
    const cardName = String(card?.name || '').trim();
    if (cardName && name.toLowerCase().startsWith(cardName.toLowerCase())) {
        const suffix = name.slice(cardName.length).replace(/^[-:]+/, '').trim();
        if (/[a-z0-9]/i.test(suffix)) {
            return suffix;
        }
    }
    return name;
}

function getCompactAbilityKind(ability) {
    const effectType = String(ability?.effectType || '').trim().toLowerCase();
    const description = String(ability?.description || '').trim().toLowerCase();
    const combined = `${effectType} ${description}`;
    if (/damage|destroy/.test(combined)) {
        return 'damage';
    }
    if (/heal|restore/.test(combined)) {
        return 'heal';
    }
    if (/shield/.test(combined)) {
        return 'shield';
    }
    if (/draw/.test(combined)) {
        return 'draw';
    }
    if (/freeze|slow|speed_zero/.test(combined)) {
        return 'control';
    }
    if (/speed/.test(combined)) {
        return 'speed';
    }
    if (/health|hp/.test(combined)) {
        return 'health';
    }
    if (/move/.test(combined)) {
        return 'move';
    }
    return 'effect';
}

function getCompactAbilityValue(ability) {
    const direct = Number(ability?.effectValue);
    if (Number.isFinite(direct) && direct > 0) {
        return direct;
    }
    const text = String(ability?.description || formatAbilitySummaryText(ability) || '');
    const preferred = text.match(/\b(?:deal|deals|damage|heal|heals|restore|restores|draw|draws|grant|grants|gain|gains|increase|increases)\D*(\d+)/i);
    const fallback = preferred || text.match(/\b(\d+)\b/);
    if (!fallback) {
        return 0;
    }
    const parsed = Number(fallback[1]);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getCompactAbilityTargetLabel(ability) {
    const targetType = String(ability?.targetType || '').trim().toUpperCase();
    switch (targetType) {
        case 'SINGLE_ENEMY':
            return 'enemy';
        case 'ALL_ENEMIES':
            return 'all';
        case 'ROW_ENEMIES':
        case 'ROW_SELECT_ENEMIES':
            return ability?.targetRow ? formatElementLabel(ability.targetRow) : 'row';
        case 'SINGLE_ALLY':
            return 'ally';
        case 'ALL_ALLIES':
            return 'allies';
        case 'ROW_ALLIES':
        case 'ROW_SELECT_ALLIES':
            return ability?.targetRow ? formatElementLabel(ability.targetRow) : 'ally row';
        case 'ENEMY_PLAYER':
            return 'player';
        case 'SELF':
            return 'self';
        default:
            return '';
    }
}

function getCompactEffectLabel(kind) {
    switch (kind) {
        case 'damage':
            return 'DMG';
        case 'heal':
            return 'Heal';
        case 'shield':
            return 'Shield';
        case 'draw':
            return 'Draw';
        case 'control':
            return 'Ctrl';
        case 'speed':
            return 'SPD';
        case 'health':
            return 'HP';
        case 'move':
            return 'Move';
        default:
            return 'Effect';
    }
}

// Dark type with a light halo, for the spell/trap templates whose info panel
// is a pale wash instead of the usual dark band.
const PALE_PANEL_INK_PALETTE = {
    ink: '#1b2231',
    strong: '#8a4b06',
    muted: '#3d4658',
    shadow: 'rgba(255, 255, 255, 0.85)'
};

function getCompactSummaryInkPalette(element, card) {
    const normalized = String(element || 'NEUTRAL').toUpperCase();
    // Element alone cannot decide this: a metal Siegling keeps the dark painted
    // creature frame while a metal spell sits on the pale grey template.
    if (isSpellTrapCard(card) && PALE_SPELL_TRAP_FRAMES.has(normalized)) {
        return PALE_PANEL_INK_PALETTE;
    }
    switch (normalized) {
        case 'FIRE':
            return { ink: '#a8f4ff', strong: '#fff7b0', muted: '#dafbff', shadow: 'rgba(5, 18, 28, 0.94)' };
        case 'EARTH':
            return { ink: '#c8d7ff', strong: '#fff0ac', muted: '#e6ecff', shadow: 'rgba(13, 14, 27, 0.92)' };
        case 'WIND':
            return { ink: '#ffc1eb', strong: '#f8ffb5', muted: '#ffe0f6', shadow: 'rgba(22, 6, 24, 0.92)' };
        case 'WATER':
            return { ink: '#ffd59f', strong: '#f8fff5', muted: '#ffe8c9', shadow: 'rgba(25, 12, 4, 0.92)' };
        case 'ICE':
            return { ink: '#ffbd91', strong: '#fff8d8', muted: '#ffe2cf', shadow: 'rgba(28, 9, 3, 0.9)' };
        case 'SHADOW':
            return { ink: '#ffe889', strong: '#f8fff4', muted: '#fff4be', shadow: 'rgba(15, 9, 0, 0.94)' };
        case 'ELECTRIC':
            return { ink: '#cab8ff', strong: '#fff8b8', muted: '#e7ddff', shadow: 'rgba(16, 8, 35, 0.92)' };
        case 'METAL':
            return { ink: '#ffd1a5', strong: '#f9fdff', muted: '#ffe8d5', shadow: 'rgba(24, 13, 5, 0.9)' };
        case 'UNDEAD':
            return { ink: '#ddffae', strong: '#fff1c6', muted: '#f0ffd8', shadow: 'rgba(11, 22, 4, 0.92)' };
        case 'PSYCHIC':
            return { ink: '#c9ffba', strong: '#fff7c4', muted: '#e5ffde', shadow: 'rgba(6, 24, 5, 0.92)' };
        case 'POISON':
            return { ink: '#ffb8df', strong: '#fff4b7', muted: '#ffe0ef', shadow: 'rgba(25, 4, 15, 0.9)' };
        case 'LIGHT':
            return { ink: '#83efff', strong: '#fff8b8', muted: '#d8fbff', shadow: 'rgba(2, 19, 28, 0.92)' };
        default:
            return { ink: '#e8f1ff', strong: '#fff0a8', muted: '#cfdcff', shadow: 'rgba(2, 8, 18, 0.92)' };
    }
}

function getCompactSummaryInkStyle(element, card) {
    const palette = getCompactSummaryInkPalette(element, card);
    return [
        `--summary-ink:${palette.ink}`,
        `--summary-strong:${palette.strong}`,
        `--summary-muted:${palette.muted}`,
        `--summary-shadow:${palette.shadow}`
    ].join(';');
}

function renderCompactSummaryIcon(kind) {
    return `<span class="card-summary-icon card-summary-icon-${escapeHtmlAttribute(kind)}" aria-hidden="true"></span>`;
}

function renderCompactEnergyIcons(element, amount, options = {}) {
    const count = Number(amount);
    if (!Number.isFinite(count) || count <= 0) {
        return '';
    }
    const normalized = String(element || 'NEUTRAL').toUpperCase();
    const visibleCount = Math.min(count, options.maxVisible || 5);
    const countClass = ` energy-count-${Math.min(count, 10)}${count >= 10 ? ' energy-count-many' : ''}`;
    const label = `${count} ${formatElementLabel(normalized)} energy`;
    let html = `<span class="card-summary-energy-icons${countClass}" aria-label="${escapeHtmlAttribute(label)}">`;
    for (let i = 0; i < visibleCount; i += 1) {
        html += `<span class="card-summary-energy-icon" style="${notchIconStyle(normalized)}"></span>`;
    }
    if (count > visibleCount) {
        html += `<span class="card-summary-energy-more">x${count}</span>`;
    }
    html += '</span>';
    return html;
}

function getCompactAbilityTargetPhrase(ability) {
    const targetType = String(ability?.targetType || '').trim().toUpperCase();
    const rowName = ability?.targetRow ? `${formatElementLabel(ability.targetRow).toLowerCase()} row` : '';
    switch (targetType) {
        case 'SINGLE_ENEMY':
            return 'an enemy';
        case 'ALL_ENEMIES':
            return 'all enemies';
        case 'ROW_ENEMIES':
        case 'ROW_SELECT_ENEMIES':
            return rowName || 'an enemy row';
        case 'SINGLE_ALLY':
            return 'an ally';
        case 'ALL_ALLIES':
            return 'all allies';
        case 'ROW_ALLIES':
        case 'ROW_SELECT_ALLIES':
            return rowName ? `ally ${rowName}` : 'an ally row';
        case 'ENEMY_PLAYER':
            return 'enemy player';
        case 'SELF':
            return 'itself';
        default:
            return '';
    }
}

function truncateToWords(text, maxWords) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return '';
    }
    return words.slice(0, maxWords).join(' ');
}

// Short, readable effect line for painted-frame previews — 3-5 plain words
// ("Deal 4 to an enemy", "All allies +1 damage", "Move to another row")
// instead of the compressed icon-and-label rows.
function getCompactAbilityClause(ability) {
    const kind = getCompactAbilityKind(ability);
    const value = getCompactAbilityValue(ability);
    const description = String(ability?.description || '').toLowerCase();
    const target = getCompactAbilityTargetPhrase(ability);
    const isBuff = /grant|gain|\+\d/.test(description);
    let clause = '';
    if (isChainTargetAbility(ability)) {
        return value > 0
            ? `Chain ${value} to ${target || 'an enemy'} + links`
            : `Chain ${target || 'an enemy'} + links`;
    }
    switch (kind) {
        case 'damage':
            if (isBuff) {
                clause = `${target || 'an ally'} +${value || 1} damage`;
            } else if (value > 0) {
                clause = `Deal ${value} to ${target || 'an enemy'}`;
            } else {
                clause = `Damage ${target || 'an enemy'}`;
            }
            break;
        case 'heal':
            clause = value > 0 ? `Heal ${target || 'an ally'} ${value} HP` : `Heal ${target || 'an ally'}`;
            break;
        case 'shield':
            clause = value > 0 ? `+${value} shield to ${target || 'an ally'}` : `Shield ${target || 'an ally'}`;
            break;
        case 'draw':
            clause = value > 0 ? `Draw ${value} card${value === 1 ? '' : 's'}` : 'Draw a card';
            break;
        case 'control':
            clause = `Freeze ${target || 'an enemy'}`;
            break;
        case 'speed':
            if (/zero|reduce|-\d/.test(description)) {
                clause = `Slow ${target || 'an enemy'}`;
            } else {
                clause = `${target || 'an ally'} +${value || 1} speed`;
            }
            break;
        case 'health':
            clause = `${target || 'an ally'} +${value || 1} HP`;
            break;
        case 'move':
            clause = target === 'itself' || !target ? 'Move to another row' : `Move ${target}`;
            break;
        default:
            clause = truncateToWords(ability?.description || formatAbilitySummaryText(ability), 5);
            break;
    }
    clause = clause.trim();
    return clause ? clause.charAt(0).toUpperCase() + clause.slice(1) : '';
}

function renderCompactAbilitySummary(card, ability) {
    if (!ability || ability.passive) {
        return '';
    }
    const kind = getCompactAbilityKind(ability);
    const name = getCompactAbilityName(card, ability);
    const clause = getCompactAbilityClause(ability);
    const title = formatAbilitySummaryText(ability) || `${name}: ${clause}`;
    const clauseHtml = escapeHtml(clause).replace(/([+-]?\d+)/g, '<span class="card-summary-value">$1</span>');
    // A move named exactly after its card (common on spells) adds nothing —
    // show just the effect clause.
    const skipName = name.toLowerCase() === String(card?.name || '').trim().toLowerCase();
    const nameHtml = skipName
        ? ''
        : `<span class="card-summary-name">${escapeHtml(name)}</span><span class="card-summary-separator">:</span>`;
    return `<div class="card-summary-row card-summary-ability card-summary-kind-${escapeHtmlAttribute(kind)}" title="${escapeHtmlAttribute(title)}">`
        + nameHtml
        + `<span class="card-summary-clause">${clauseHtml}</span>`
        + '</div>';
}

function renderCompactCardSummary(card, options = {}) {
    const rows = [];
    const abilityLimit = options.abilityLimit ?? 3;
    const abilities = getCardAbilities(card).filter((ability) => !ability?.passive);
    abilities.slice(0, abilityLimit).forEach((ability) => {
        const row = renderCompactAbilitySummary(card, ability);
        if (row) {
            rows.push(row);
        }
    });
    if (abilities.length > abilityLimit) {
        rows.push(`<div class="card-summary-row card-summary-more">+${abilities.length - abilityLimit} move${abilities.length - abilityLimit === 1 ? '' : 's'}</div>`);
    }

    // Cost and evolution move to the top-corner chips on painted-frame
    // previews (renderCardCornerChips); keep the rows for other callers.
    if (!options.omitCostEvolution) {
        if (card.type === 'TRAP' && card.trapBucketElement && card.trapBucketAmount > 0) {
            rows.push('<div class="card-summary-row card-summary-cost-row">'
                + '<span class="card-summary-name">Trigger</span>'
                + '<span class="card-summary-separator">:</span>'
                + renderCompactEnergyIcons(card.trapBucketElement, Number(card.trapBucketAmount), { maxVisible: 3 })
                + '<span class="card-summary-target">opp</span>'
                + '</div>');
        } else if (card.costElement && card.costAmount > 0) {
            rows.push('<div class="card-summary-row card-summary-cost-row">'
                + '<span class="card-summary-name">Cost</span>'
                + '<span class="card-summary-separator">:</span>'
                + renderCompactEnergyIcons(card.costElement, Number(card.costAmount), { maxVisible: 5 })
                + '</div>');
        }
    }

    if (card.requiredComboSize) {
        const comboLabel = card.requiredComboSignature
            ? card.requiredComboSignature.replaceAll('+', '/')
            : `${card.requiredComboSize} combo`;
        rows.push(`<div class="card-summary-row card-summary-meta-row"><span class="card-summary-name">Combo</span><span class="card-summary-separator">:</span><span class="card-summary-meta">${escapeHtml(comboLabel)}</span></div>`);
    }
    if (card.requiredReaction) {
        rows.push(`<div class="card-summary-row card-summary-meta-row"><span class="card-summary-name">Req</span><span class="card-summary-separator">:</span><span class="card-summary-meta">${escapeHtml(card.requiredReaction)}</span></div>`);
    }
    if (!options.omitCostEvolution) {
        const evolutionSource = getCardEvolutionSourceName(card);
        if (evolutionSource) {
            rows.push(`<div class="card-summary-row card-summary-evolution-row"><span class="card-summary-name">Evo</span><span class="card-summary-separator">:</span><span class="card-summary-meta">${escapeHtml(evolutionSource)}</span></div>`);
        }
    }

    if (rows.length === 0) {
        return '';
    }
    return `<div class="card-summary-list" style="${escapeHtmlAttribute(getCompactSummaryInkStyle(card.element, card))}">${rows.join('')}</div>`;
}

// Binder/collection variant of the painted-frame info panel: the card's
// description replaces the move list (cost/evolution stay in the corner
// chips). Rendered inside .card-summary-list so fitFramedSummaryList sizes
// the text to the panel.
function renderCompactDescriptionSummary(card, descriptionText) {
    const description = String(descriptionText || card?.description || '').trim() || 'Description coming soon.';
    return `<div class="card-summary-list card-summary-description-list" style="${escapeHtmlAttribute(getCompactSummaryInkStyle(card.element, card))}" title="${escapeHtmlAttribute(description)}">`
        + `<div class="card-summary-description">${escapeHtml(description)}</div>`
        + '</div>';
}

// Top-corner chips for painted-frame previews: play cost (or trap trigger)
// sits in the top-left, evolution source in the top-right, both on the
// frame's top band between the notch sockets.
function renderCardCornerChips(card) {
    const chips = [];
    if (card.type === 'TRAP' && card.trapBucketElement && card.trapBucketAmount > 0) {
        const label = `Trigger: opponent holds ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)} energy`;
        chips.push(`<div class="card-corner-chip card-corner-cost" title="${escapeHtmlAttribute(label)}">`
            + renderCompactEnergyIcons(card.trapBucketElement, Number(card.trapBucketAmount), { maxVisible: isSpellTrapCard(card) ? 10 : 4 })
            + '</div>');
    } else if (card.costElement && card.costAmount > 0) {
        const label = `Play cost: ${card.costAmount} ${formatElementLabel(card.costElement)}`;
        chips.push(`<div class="card-corner-chip card-corner-cost" title="${escapeHtmlAttribute(label)}">`
            + renderCompactEnergyIcons(card.costElement, Number(card.costAmount), { maxVisible: isSpellTrapCard(card) ? 10 : 4 })
            + '</div>');
    }
    const evolutionSource = getCardEvolutionSourceName(card);
    if (evolutionSource) {
        chips.push(`<div class="card-corner-chip card-corner-evo" title="${escapeHtmlAttribute(`Evolves from ${evolutionSource}`)}">`
            + '<span class="card-corner-evo-tag">Evo</span>'
            + `<span class="card-corner-evo-name">${escapeHtml(evolutionSource)}</span>`
            + '</div>');
    }
    return chips.join('');
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
            text: `Evolves from ${card.evolvesFromName} — needs that card to evolve`,
            className: 'card-cost card-evolve-note'
        });
    }

    return entries;
}

function playerHolographicCardIds() {
    const raw = authState.profile?.progression?.holographicCards;
    if (!Array.isArray(raw)) {
        return new Set();
    }
    return new Set(raw.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean));
}

function cardShowsPlayerHolographic(card) {
    if (!card) {
        return false;
    }
    if (card.holographic === true) {
        return true;
    }
    const cardId = String(card.id || card.cardId || card.definitionId || '').trim().toLowerCase();
    return cardId && playerHolographicCardIds().has(cardId);
}

function holographicCardClass(card) {
    return cardShowsPlayerHolographic(card) ? ' is-holographic' : '';
}

function holographicCardOverlay(card) {
    return cardShowsPlayerHolographic(card) ? '<div class="card-holographic-overlay" aria-hidden="true"></div>' : '';
}

function holographicFullArtOptions() {
    return {
        useHolographicFullCardArt: true,
        playerHolographicIds: playerHolographicCardIds()
    };
}

// A holographic card that ships (or has been upgraded to) dedicated full-card
// artwork renders as the complete painted card — the same face the binder shows
// — instead of the standard frame plus foil overlay. Returns '' when the card
// has no holographic full art, so callers keep their standard showcase/hand
// markup. The binder full-art path bakes the elemental frame into the image and
// overlays the live name/stats/description/notches itself.
function renderHolographicFullArtFace(card, extraOptions = {}) {
    const bv = window.SieglingsCardBinderVisual;
    if (!bv || typeof bv.renderBinderCardTile !== 'function'
        || typeof bv.holographicFullCardArtUrl !== 'function') {
        return '';
    }
    const options = { ...holographicFullArtOptions(), imageLoading: 'eager', ...extraOptions };
    const artUrl = bv.holographicFullCardArtUrl(card, options);
    if (!artUrl) {
        return '';
    }
    preloadArtUrl(artUrl);
    return bv.renderBinderCardTile(card, options);
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
    const frameClass = cardFrameClass(card).trim();
    // Painted frames reserve a fixed info panel, so the panel content must be
    // the compact summary — keyed off the frame the card actually got, since
    // neutral spells/traps have a spell template but no creature frame.
    const useCompactSummary = Boolean(frameClass) || options.compactSummary;
    const classes = ['hand-card', elemClass, cardTypeClass(card), options.cardClass, frameClass,
        showcaseHasShield ? 'has-shield' : '', holographicCardClass(card)].filter(Boolean).join(' ');
    const detailEntries = useCompactSummary ? [] : getCardPreviewEntries(card);
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
    if (useCompactSummary) {
        html += renderCardCornerChips(card);
    }
    html += `<div class="hand-card-header">`;
    html += `<div class="card-title">${escapeHtml(card.name)}</div>`;
    html += `<div class="card-label">${escapeHtml(labelText)}</div>`;
    html += `</div>`;
    html += renderCardArt(card, options.artVariant || 'preview', fallbackArtLabel);
    // Surface status badges (shield, buffs, and the max-health badge) when this
    // preview reflects a board card. Board cards carry a numeric maxHp; hand
    // cards don't, so this renders nothing for those.
    //
    // The row sits in the shell, not in .hand-card-body: on a painted frame the
    // body is a fixed box (top 69.8%) that clips and shares its height between
    // the HP/SPD line and the description, so a badge row in there pushed both
    // down and squeezed the description to a clipped single line. As a shell
    // child it floats in the dead space at the foot of the art instead — the
    // same separation the on-board card already uses for .arena-board-badges.
    if (bodyMode !== 'hidden'
            && ((Array.isArray(card.statuses) && card.statuses.length > 0) || Number.isFinite(Number(card.maxHp)))) {
        html += renderStatusBadgesForCell(card);
    }
    if (bodyMode !== 'hidden') {
        html += `<div class="hand-card-body">`;
        if (card.type === 'SIEGLING') {
            html += renderCardStatPills(card, { mode: 'hand', shielded: showcaseHasShield });
        } else if (statLine) {
            html += `<div class="card-detail card-stats-line${showcaseHasShield ? ' is-shielded' : ''}">${escapeHtml(statLine)}</div>`;
        }
        if (useCompactSummary) {
            html += options.summaryMode === 'description'
                ? renderCompactDescriptionSummary(card, options.descriptionText)
                : renderCompactCardSummary(card, { abilityLimit: options.compactAbilityLimit ?? 3, omitCostEvolution: true });
        } else {
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
        }
        html += `</div>`;
    }
    html += `</div>`;
    html += holographicCardOverlay(card);
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

function isPhoneLandscapeLayout() {
    return window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
}

// The phone-landscape layout where the slim top bar (not the hud rails) is the
// HUD and its player/opponent strips are the tap targets that open the detail
// sheet. Mirrors the `(orientation: landscape) and (max-width: 979px)` CSS block
// so the header tap opens the sheet on any landscape phone, not only very short
// ones (isPhoneLandscapeLayout caps at 600px tall).
function isLandscapeTopBarHudLayout() {
    return window.matchMedia('(orientation: landscape) and (max-width: 979px)').matches;
}

function measureDeviceSafeAreaInsets() {
    const probe = document.createElement('div');
    probe.style.cssText = [
        'position:fixed',
        'visibility:hidden',
        'pointer-events:none',
        'padding-left:env(safe-area-inset-left, 0px)',
        'padding-right:env(safe-area-inset-right, 0px)'
    ].join(';');
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe);
    const left = Number.parseFloat(computed.paddingLeft) || 0;
    const right = Number.parseFloat(computed.paddingRight) || 0;
    probe.remove();
    return { left, right };
}

function syncLandscapeSafeAreaSide() {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body || !isPhoneLandscapeLayout()) {
        root?.style.removeProperty('--landscape-safe-left');
        root?.style.removeProperty('--landscape-safe-right');
        if (body) delete body.dataset.landscapeNotch;
        return;
    }

    const safe = measureDeviceSafeAreaInsets();
    const tolerance = 2;
    let notchSide = 'none';
    if (safe.left > safe.right + tolerance) {
        notchSide = 'left';
    } else if (safe.right > safe.left + tolerance) {
        notchSide = 'right';
    } else if (Math.max(safe.left, safe.right) > tolerance) {
        const orientationType = String(window.screen?.orientation?.type || '');
        const rawAngle = window.screen?.orientation?.angle ?? window.orientation;
        const angle = ((Number(rawAngle) || 0) % 360 + 360) % 360;
        notchSide = orientationType.includes('secondary') || angle === 270 ? 'right' : 'left';
    }

    body.dataset.landscapeNotch = notchSide;
    root.style.setProperty('--landscape-safe-left', `${notchSide === 'left' ? safe.left : 0}px`);
    root.style.setProperty('--landscape-safe-right', `${notchSide === 'right' ? safe.right : 0}px`);
}

function isTabletLandscapeLayout() {
    return window.matchMedia(
        '(orientation: landscape) and (min-width: 980px) and (max-width: 1366px) and (max-height: 1100px)'
    ).matches;
}

function isCompactLandscapeLayout() {
    return isPhoneLandscapeLayout() || isTabletLandscapeLayout();
}

function isDesktopSidebarLayout() {
    return window.matchMedia('(min-width: 980px)').matches && !isCompactLandscapeLayout();
}

function isMobileLayout() {
    return window.matchMedia('(max-width: 900px)').matches || isCompactLandscapeLayout();
}

/**
 * Phone landscape already reserves a persistent Card inspector beside the
 * arena. Use that space for a spell's explicit Cast/Cancel step rather than
 * opening the mobile preview drawer over the board.
 */
function usesLandscapeSpellPreviewDock() {
    return window.matchMedia(
        '(orientation: landscape) and (max-width: 979px) and (max-height: 600px)'
    ).matches;
}

/**
 * Phone-landscape left inspector rail is the display surface for utility menu
 * panels (card preview, energy, log, hints, battle action preview, element key).
 * Live battle move buttons stay in the right hand dock.
 */
function usesLandscapeInspectorMenuDock() {
    return usesLandscapeSpellPreviewDock();
}

const DESKTOP_INSPECT_TABS = Object.freeze(['card', 'deck', 'log', 'hint', 'energy', 'battle', 'key']);
const DESKTOP_INSPECT_MENU_TABS = Object.freeze(['hint', 'energy', 'battle', 'key']);
const DRAWER_TO_INSPECT_TAB = Object.freeze({
    selected: 'card',
    hint: 'hint',
    log: 'log',
    key: 'key',
    energy: 'energy',
    battle: 'battle'
});

function normalizeDesktopInspectTab(tab) {
    return DESKTOP_INSPECT_TABS.includes(tab) ? tab : 'card';
}

function isTabletPortraitDockLayout() {
    return window.matchMedia('(min-width: 980px) and (max-width: 1366px) and (orientation: portrait)').matches;
}

/** iPad portrait: stack card above copy and scale card to panel width. */
function usesStackedDesktopCardPreview() {
    return window.matchMedia('(orientation: portrait) and (min-width: 768px) and (max-width: 1366px)').matches;
}

function isPortraitMobileHudLayout() {
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches
        || isTabletPortraitDockLayout();
}

/** Battle queue renders in the docked hand tray (action bar + hand section), not the slide-up drawer. */
function usesInlineBattleDock() {
    return isDesktopSidebarLayout() || isMobileLayout();
}

function getViewportModeLabel() {
    if (isTabletPortraitDockLayout()) {
        return 'iPad Portrait';
    }
    if (isDesktopSidebarLayout()) {
        return 'Desktop Dock';
    }
    if (isTabletLandscapeLayout()) {
        return 'iPad Landscape';
    }
    if (isPhoneLandscapeLayout()) {
        return 'Landscape';
    }
    return 'Portrait';
}

// Phone landscape docks the utility icon strip as a fixed HUD across the
// arena bottom. iOS WebKit gives position:fixed a containing block from more
// ancestor effects than Chromium (the rail's backdrop-filter chain), which
// trapped the strip inside the overflow-hidden rail on real devices while
// desktop emulation looked fine. Reparenting to <body> guarantees the
// viewport is the containing block everywhere.
function syncLandscapeAuxHud() {
    const aux = document.querySelector('.action-bar-aux');
    const bar = document.getElementById('actionBar');
    if (!aux || !bar) {
        return;
    }
    if (isPhoneLandscapeLayout()) {
        if (aux.parentElement !== document.body) {
            document.body.appendChild(aux);
        }
    } else if (aux.parentElement !== bar) {
        bar.appendChild(aux);
    }
}

function updateResponsiveLayoutVars(force = false) {
    const signature = `${window.innerWidth}x${window.innerHeight}:${getViewportModeLabel()}`;
    if (!force && signature === lastViewportSignature) {
        return;
    }
    lastViewportSignature = signature;
    syncLandscapeAuxHud();
    if (usesLandscapeInspectorMenuDock() && activeDrawer) {
        closeDrawer(true);
    }
    syncDesktopInspectTabUi();

    const root = document.documentElement;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const desktop = isDesktopSidebarLayout();
    const tabletPortraitDock = isTabletPortraitDockLayout();
    const compactLandscape = isCompactLandscapeLayout();
    const density = clampNumber(Math.min(viewportWidth / 1440, viewportHeight / 900), 0.72, 1.08);
    const stackedTabletPreview = usesStackedDesktopCardPreview();
    document.body.classList.toggle('tablet-portrait-dock', tabletPortraitDock);
    document.body.classList.toggle('tablet-stacked-preview', stackedTabletPreview);
    document.body.classList.toggle('battle-inline-dock', usesInlineBattleDock() && isHandHiddenForPhase());
    const cardAspectHeight = 7 / 5;
    const desktopHandVisibleCards = 5;
    const baseDesktopHudRailWidth = 200;
    const baseDesktopSidebarWidth = 420;
    const hidePlayerHudRail = tabletPortraitDock;
    const hideEnemyHudRail = desktop && (viewportWidth <= 1200 || tabletPortraitDock);
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
    const desktopHudRailCount = desktop
        ? (hideEnemyHudRail ? 0 : 1) + (hidePlayerHudRail ? 0 : 1)
        : 0;
    const desktopGridGapCount = desktop
        ? Math.max(0, desktopHudRailCount + 1)
        : 0;
    const desktopShortViewport = desktop && viewportHeight <= 1100;
    const boardMaxWidth = desktop
        ? Math.round(clampNumber(viewportHeight * 0.45, 360, 620))
        : 420;
    // Offset = fixed vertical chrome reserved before splitting the arena height into
    // two boards: the two row labels, the inter-half gap, and (crucially) the player
    // grid's bottom socket reserve. Ratio = a board's height/width. Short desktops and
    // phones must reserve the socket row + labels or the bottom external notches clip.
    const boardHeightOffset = desktop
        ? Math.round(clampNumber(
            viewportHeight * (desktopShortViewport ? 0.09 : 0.1),
            desktopShortViewport ? 84 : 82,
            desktopShortViewport ? 120 : 148
        ))
        : 84;
    const boardHeightRatio = desktop
        ? (desktopShortViewport ? 1.34 : 1.38)
        : 1.32;
    const topBarHeight = desktop
        ? Math.round(document.querySelector('.top-bar')?.getBoundingClientRect().height || 36)
        : 0;
    const matchHeaderHeight = tabletPortraitDock
        ? Math.round(document.querySelector('.mobile-hud')?.getBoundingClientRect().height || 52)
        : topBarHeight;
    const desktopArenaHeight = desktop
        ? Math.max(0, viewportHeight - matchHeaderHeight - (desktopLayoutGutter * 2))
        : 0;
    const heightLimitedBoardWidth = desktop
        ? Math.max(0, ((desktopArenaHeight - boardHeightOffset) / 2) / boardHeightRatio)
        : boardMaxWidth;
    let desktopBoardTargetWidth = desktop
        ? Math.round(Math.min(boardMaxWidth, heightLimitedBoardWidth || boardMaxWidth))
        : boardMaxWidth;
    if (desktopShortViewport && desktopBoardTargetWidth > 0) {
        desktopBoardTargetWidth = Math.max(280, desktopBoardTargetWidth - 2);
    }
    let desktopArenaColumnWidth = desktop
        ? Math.round(clampNumber(
            desktopBoardTargetWidth + clampNumber(desktopBoardTargetWidth * 0.85, 300, 560),
            desktopBoardTargetWidth + 220,
            Math.min(1240, Math.max(boardMaxWidth + 220, viewportWidth - 24))
        ))
        : 0;
    if (desktop && hideEnemyHudRail && hidePlayerHudRail) {
        const availableForColumns = viewportWidth - (desktopLayoutGutter * 2) - desktopLayoutGap;
        const freedHudWidth = baseDesktopHudRailWidth * 2;
        sidebarWidth = Math.round(clampNumber(
            baseDesktopSidebarWidth + freedHudWidth * 0.58,
            380,
            availableForColumns * 0.44
        ));
        desktopHudRailWidth = 0;
        desktopArenaColumnWidth = Math.max(
            desktopBoardTargetWidth + 160,
            availableForColumns - sidebarWidth - desktopLayoutGap
        );
    } else if (desktop && !hideEnemyHudRail && !hidePlayerHudRail) {
        const availableForColumns = viewportWidth - (desktopLayoutGutter * 2) - (desktopLayoutGap * desktopGridGapCount);
        const minimumPanelWidth = baseDesktopSidebarWidth + (desktopHudRailWidth * 2);
        const preferredPanelWidth = sidebarWidth + (desktopHudRailWidth * 2);
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
    } else if (desktop && hideEnemyHudRail && !hidePlayerHudRail) {
        const availableForColumns = viewportWidth - (desktopLayoutGutter * 2) - (desktopLayoutGap * 2);
        sidebarWidth = Math.round(clampNumber(
            baseDesktopSidebarWidth + baseDesktopHudRailWidth * 0.35,
            360,
            availableForColumns * 0.38
        ));
        desktopArenaColumnWidth = Math.max(
            desktopBoardTargetWidth + 160,
            availableForColumns - sidebarWidth - desktopHudRailWidth - (desktopLayoutGap * 2)
        );
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
    let handWidth = desktop
        ? Math.round(clampNumber(
            Math.min(desktopHandTargetWidth, desktopHandFiveCardFitWidth),
            Math.min(96, desktopHandFiveCardFitWidth),
            Math.max(96, desktopHandFiveCardFitWidth)
        ))
        : isTabletLandscapeLayout()
        ? Math.round(clampNumber(viewportHeight * 0.14, 88, 118))
        : compactLandscape
        ? Math.round(clampNumber(viewportHeight * 0.18, 64, 78))
        : Math.round(clampNumber(Math.min(viewportWidth * 0.16, viewportHeight * 0.19), 52, 138));
    let desktopHandSectionTargetHeight = desktop
        ? Math.round((handWidth * cardAspectHeight) + 58)
        : 176;
    let desktopHandSectionMinHeight = desktop
        ? Math.round(clampNumber(desktopHandSectionTargetHeight, 170, viewportHeight * 0.28))
        : 176;
    let desktopHandSectionHeight = desktop
        ? Math.round(clampNumber(
            desktopHandSectionMinHeight + Math.round(clampNumber(viewportHeight * 0.012, 10, 28)),
            desktopHandSectionMinHeight,
            viewportHeight * 0.32
        ))
        : 208;
    let previewCardWidth = handWidth;
    let previewCardMaxHeight = Math.round(handWidth * cardAspectHeight);
    if (desktop && tabletPortraitDock) {
        const handSectionHeight = Math.round(clampNumber(viewportHeight * 0.46, 320, 560));
        const handChrome = 88;
        const handWidthFromSection = Math.floor((handSectionHeight - handChrome) / cardAspectHeight);
        handWidth = Math.round(clampNumber(
            Math.min(handWidthFromSection, desktopHandFiveCardFitWidth + 24),
            112,
            196
        ));
        desktopHandSectionTargetHeight = handSectionHeight;
        desktopHandSectionMinHeight = Math.round(handSectionHeight * 0.9);
        desktopHandSectionHeight = handSectionHeight;
        const inspectPanelWidth = Math.max(220, sidebarWidth - 24);
        previewCardWidth = Math.round(clampNumber(inspectPanelWidth * 0.94, 220, inspectPanelWidth));
        previewCardMaxHeight = Math.round(previewCardWidth * cardAspectHeight);
        const maxStackedPreviewHeight = Math.round(viewportHeight * 0.34);
        if (previewCardMaxHeight > maxStackedPreviewHeight) {
            previewCardMaxHeight = maxStackedPreviewHeight;
            previewCardWidth = Math.round(previewCardMaxHeight * (5 / 7));
        }
    } else if (stackedTabletPreview) {
        previewCardWidth = Math.round(clampNumber(viewportWidth * 0.9, 220, 420));
        previewCardMaxHeight = Math.round(previewCardWidth * cardAspectHeight);
        const maxStackedPreviewHeight = Math.round(viewportHeight * 0.3);
        if (previewCardMaxHeight > maxStackedPreviewHeight) {
            previewCardMaxHeight = maxStackedPreviewHeight;
            previewCardWidth = Math.round(previewCardMaxHeight * (5 / 7));
        }
    } else if (desktop) {
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
    } else if (compactLandscape) {
        const compactSidebarWidth = isTabletLandscapeLayout()
            ? clampNumber(viewportWidth * 0.3, 268, 340)
            : viewportHeight <= 430
            ? clampNumber(viewportWidth * 0.2, 168, 184)
            : 208;
        const compactPreviewWidth = Math.max(120, compactSidebarWidth - 28);
        const compactPreviewMax = isTabletLandscapeLayout() ? 220 : 164;
        const compactPreviewMin = isTabletLandscapeLayout() ? 150 : 120;
        previewCardWidth = Math.round(clampNumber(
            compactPreviewWidth * 0.92,
            compactPreviewMin,
            Math.max(compactPreviewMin, compactPreviewMax)
        ));
        previewCardMaxHeight = Math.round(previewCardWidth * cardAspectHeight);
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
    scheduleDesktopHandSelectorCardScale();
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
   DRAWER SYSTEM - slide-up modals for log, key, battle, card info
   ============================================================ */
let activeDrawer = null;
let _drawerCloseTimers = [];

function isBattleTargetSelectionActive() {
    return Boolean(targetMode && targetContext && targetContext.mode === 'battle');
}

function isMobileBattleTargetingCameraActive() {
    return isBattleTargetSelectionActive() && isPortraitMobileHudLayout();
}

function renderMobileTargetingHud() {
    const hud = document.getElementById('mobileTargetingHud');
    if (!hud) {
        return;
    }
    if (!isMobileBattleTargetingCameraActive()) {
        hud.classList.add('hidden');
        hud.innerHTML = '';
        return;
    }

    const ability = getActiveBattleTargetAbility();
    const pending = gameState?.pendingBattle;
    if (!ability || !pending) {
        hud.classList.add('hidden');
        hud.innerHTML = '';
        return;
    }

    const instructions = buildBattleTargetingInstruction(targetContext.side, ability, getRowSelectSelectedRow());
    let html = '<div class="mobile-targeting-hud-inner">';
    html += `<div class="mobile-targeting-hud-kicker">${escapeHtml(instructions.trayStateLabel)}</div>`;
    html += `<div class="mobile-targeting-hud-move">${escapeHtml(instructions.moveName)}</div>`;
    html += `<div class="mobile-targeting-hud-effect">${escapeHtml(instructions.effectLine)}</div>`;
    html += `<div class="mobile-targeting-hud-arrow">${escapeHtml(instructions.arrowHint)}</div>`;
    if (isRowSelectBattleTargetContext()) {
        html += renderRowSelectBattleConfirm();
    }
    html += '</div>';
    hud.innerHTML = html;
    hud.classList.remove('hidden');
    window.requestAnimationFrame(() => {
        if (!isMobileBattleTargetingCameraActive()) {
            document.documentElement.style.removeProperty('--mobile-targeting-hud-stack');
            return;
        }
        const stack = Math.ceil(hud.getBoundingClientRect().height + 10);
        document.documentElement.style.setProperty('--mobile-targeting-hud-stack', `${stack}px`);
        syncMobileTargetingArenaScale();
    });
}

function syncMobileTargetingArenaScale() {
    if (!isMobileBattleTargetingCameraActive()) {
        document.documentElement.style.removeProperty('--mobile-targeting-arena-scale');
        document.documentElement.style.removeProperty('--mobile-targeting-hud-stack');
        return;
    }
    const board = document.getElementById('boardArea');
    if (!board) {
        return;
    }
    const run = () => {
        if (!isMobileBattleTargetingCameraActive()) {
            return;
        }
        const available = board.clientHeight;
        const content = board.scrollHeight;
        if (available <= 0 || content <= 0) {
            return;
        }
        const scale = Math.min(1, (available - 4) / content);
        document.documentElement.style.setProperty('--mobile-targeting-arena-scale', scale.toFixed(3));
        scheduleBoardLinkConnectorRefresh();
        refreshTargetingPreviewOnLayoutChange();
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
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
    // Phone landscape: route utility drawers into the persistent left inspector
    // so a second card-preview / info tray does not cover the arena.
    if (usesLandscapeInspectorMenuDock() && DRAWER_TO_INSPECT_TAB[name]) {
        // Live battle moves stay in the right hand dock — never mirror them left.
        if (name === 'battle' && gameState?.currentPhase === 'BATTLE' && gameState?.pendingBattle) {
            if (activeDrawer === 'battle') {
                closeDrawer(true);
            }
            return;
        }
        openLandscapeInspectorMenu(DRAWER_TO_INSPECT_TAB[name]);
        return;
    }
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

/** Open a utility menu panel — left inspector on landscape, drawer elsewhere. */
function openMenuPanel(name) {
    if (usesLandscapeInspectorMenuDock() && DRAWER_TO_INSPECT_TAB[name]) {
        openLandscapeInspectorMenu(DRAWER_TO_INSPECT_TAB[name]);
        return;
    }
    if (name === 'energy') {
        renderEnergyDetailPanel();
        openDrawer('energy');
        return;
    }
    openDrawer(name);
}

function openLandscapeInspectorMenu(tab) {
    if (!usesLandscapeInspectorMenuDock()) {
        return false;
    }
    if (activeDrawer) {
        closeDrawer(true);
    }
    closeMobileHudSheet();
    const details = document.getElementById('energyDetailDetails');
    if (details?.open) {
        details.open = false;
    }
    setDesktopInspectTab(tab);
    refreshLandscapeInspectMenuContent(tab);
    syncActionBarMenuAttention(tab);
    return true;
}

function refreshLandscapeInspectMenuContent(tab = desktopInspectTab) {
    switch (normalizeDesktopInspectTab(tab)) {
        case 'card':
            syncFocusedCardUi();
            break;
        case 'hint':
            renderHintPanel();
            break;
        case 'energy':
            renderEnergyDetailPanel();
            break;
        case 'battle':
            renderBattlePanel();
            break;
        case 'key':
            renderElementKey();
            break;
        case 'log':
            renderLog();
            break;
        case 'deck':
            renderDesktopDeckPreview();
            break;
        default:
            break;
    }
}

function syncActionBarMenuAttention(activeTab = desktopInspectTab) {
    const map = {
        card: 'btnSelectedPreview',
        hint: 'btnHint',
        battle: 'btnBattlePanel',
        log: 'btnGameLog',
        energy: 'btnEnergyDetail'
    };
    Object.entries(map).forEach(([tab, id]) => {
        document.getElementById(id)?.classList.toggle('ab-icon-active', usesLandscapeInspectorMenuDock() && activeTab === tab);
    });
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

// Settle any pending phase-transition banner promise. Safe to call repeatedly.
function resolvePhaseTransitionBanner() {
    if (phaseTransitionResolve) {
        const resolve = phaseTransitionResolve;
        phaseTransitionResolve = null;
        resolve();
    }
}

// The scrim is what makes the banner a beat rather than decoration: it blocks
// taps on the board and the battle dock for as long as the banner holds.
function setPhaseTransitionScrimVisible(visible) {
    const scrim = document.getElementById('phaseTransitionScrim');
    if (!scrim) return;
    if (visible) {
        scrim.classList.remove('hidden');
        requestAnimationFrame(() => scrim.classList.add('visible'));
    } else {
        scrim.classList.remove('visible');
        scrim.classList.add('hidden');
    }
}

function hidePhaseTransitionBanner() {
    const banner = document.getElementById('phaseTransitionBanner');
    setPhaseTransitionScrimVisible(false);
    if (!banner) return;
    if (phaseTransitionTimer) {
        clearTimeout(phaseTransitionTimer);
        phaseTransitionTimer = null;
    }
    resolvePhaseTransitionBanner();
    banner.classList.remove('visible');
    banner.classList.add('hidden');
}

function renderBattlePhaseOrder(order) {
    const rows = Array.isArray(order) ? order.filter((entry) => entry?.name) : [];
    if (rows.length === 0) return '';
    return rows.map((entry, index) => {
        const side = entry.ownerSide === 'PLAYER' ? 'player' : 'enemy';
        const owner = entry.ownerLabel || (side === 'player' ? 'You' : 'Opponent');
        const speed = Number(entry.speed);
        return `<span class="phase-order-step phase-order-step-${side}" title="${escapeHtmlAttribute(`${owner} · Speed ${Number.isFinite(speed) ? speed : '—'}`)}">`
            + `<span class="phase-order-index">${index + 1}</span>`
            + `<span class="phase-order-name">${escapeHtml(entry.name)}</span>`
            + `<span class="phase-order-speed">SPD ${Number.isFinite(speed) ? escapeHtml(String(speed)) : '—'}</span>`
            + `</span>`;
    }).join('<span class="phase-order-arrow" aria-hidden="true">›</span>');
}

function showPhaseTransitionBanner(phase, activeSide, durationMs = 2000, battleOrder = null) {
    // The redraw reveal still owns the screen. This banner is fixed at z-index
    // 860 against the mulligan overlay's 70, so it would punch straight through
    // and announce a phase the player has not been let into yet. Queue it behind
    // the reveal rather than dropping it — the action queue awaits this promise,
    // so the board's own animations wait with it.
    if (mulliganRevealHold) {
        return mulliganRevealSettled()
            .then(() => showPhaseTransitionBanner(phase, activeSide, durationMs, battleOrder));
    }
    const banner = document.getElementById('phaseTransitionBanner');
    const kicker = document.getElementById('phaseTransitionKicker');
    const title = document.getElementById('phaseTransitionTitle');
    const starter = document.getElementById('phaseTransitionStarter');
    const order = document.getElementById('phaseTransitionOrder');
    if (!banner || !kicker || !title || !phase) {
        return Promise.resolve();
    }

    if (phaseTransitionTimer) {
        clearTimeout(phaseTransitionTimer);
        phaseTransitionTimer = null;
    }
    // A new banner supersedes any pending one — settle the old promise so its
    // awaiter (the action queue) is never left hanging.
    resolvePhaseTransitionBanner();

    const holdMs = Math.max(phase === 'BATTLE' ? 2800 : 1200, Number(durationMs) || 2000);
    banner.className = `phase-transition-banner ${String(phase).toLowerCase()}`;
    kicker.textContent = getPhaseTransitionKicker(phase, activeSide);
    title.textContent = formatPhaseLabel(phase);
    const orderedCreatures = Array.isArray(battleOrder) ? battleOrder : [];
    const first = orderedCreatures[0] || null;
    if (starter) {
        const firstOwner = first?.ownerLabel || (first?.ownerSide === 'PLAYER' ? 'You' : 'Opponent');
        starter.textContent = phase === 'BATTLE' && first
            ? (first.ownerSide === 'PLAYER'
                ? 'You start the Battle Phase'
                : `${firstOwner} starts the Battle Phase`)
            : '';
        starter.classList.toggle('hidden', phase !== 'BATTLE' || !first);
    }
    if (order) {
        order.innerHTML = phase === 'BATTLE' ? renderBattlePhaseOrder(orderedCreatures) : '';
        order.classList.toggle('hidden', phase !== 'BATTLE' || orderedCreatures.length === 0);
    }
    banner.classList.remove('hidden');
    setPhaseTransitionScrimVisible(true);
    window.SieglingsSounds?.play('phase', 0.5);
    requestAnimationFrame(() => banner.classList.add('visible'));

    return new Promise((resolve) => {
        phaseTransitionResolve = resolve;
        phaseTransitionTimer = setTimeout(() => {
            banner.classList.remove('visible');
            setPhaseTransitionScrimVisible(false);
            phaseTransitionTimer = setTimeout(() => {
                banner.classList.add('hidden');
                phaseTransitionTimer = null;
                phaseTransitionResolve = null;
                resolve();
            }, 360);
        }, holdMs);
    });
}

// True while a phase banner is on screen and still holding its beat. The action
// queue reads this as half of its "presentation is busy" gate.
function isPhaseTransitionBannerActive() {
    return phaseTransitionTimer != null || phaseTransitionResolve != null;
}

window.showPhaseTransitionBanner = showPhaseTransitionBanner;
window.hidePhaseTransitionBanner = hidePhaseTransitionBanner;
window.isPhaseTransitionBannerActive = isPhaseTransitionBannerActive;

function showTurnChangeToast(state) {
    if (!state || state.gameOver) {
        return;
    }
    const isYourTurn = state.activeSide === 'PLAYER';
    const opponentName = state.enemyName || 'Opponent';
    const toast = {
        kind: 'TURN',
        label: isYourTurn ? 'Your turn' : `${opponentName}'s turn`,
        subtitle: isYourTurn
            ? 'Take your setup actions.'
            : 'Waiting for your opponent to finish their turn.',
        actorName: isYourTurn ? (state.playerName || 'You') : opponentName,
        targetName: '',
        side: isYourTurn ? 'PLAYER' : 'ENEMY',
        knightElement: isYourTurn
            ? state.player?.trainer?.element
            : state.enemy?.trainer?.element,
        elementColor: isYourTurn
            ? state.player?.trainer?.element
            : state.enemy?.trainer?.element
    };
    if (window.SieglingsActionQueue?.showToast) {
        window.SieglingsActionQueue.showToast(toast, 2800);
        return;
    }
    const stack = document.getElementById('sieglingsToastStack');
    if (!stack) {
        return;
    }
    const node = document.createElement('div');
    node.className = `sgl-toast sgl-toast-${isYourTurn ? 'player' : 'enemy'}`;
    node.innerHTML = `
        <div class="sgl-toast-body">
            <div class="sgl-toast-line">
                <span class="sgl-toast-action">${escapeHtml(toast.label)}</span>
            </div>
            <div class="sgl-toast-sub">${escapeHtml(toast.subtitle)}</div>
        </div>
    `;
    stack.appendChild(node);
    requestAnimationFrame(() => node.classList.add('visible'));
    setTimeout(() => {
        node.classList.remove('visible');
        node.classList.add('leaving');
        setTimeout(() => node.remove(), 240);
    }, 2800);
}

function maybeNotifyTurnChange(prevState, nextState) {
    if (!prevState || !nextState || nextState.gameOver) {
        return;
    }
    if (prevState.activeSide === nextState.activeSide) {
        return;
    }
    if (nextState.currentPhase !== 'SETUP') {
        return;
    }
    const onIdle = window.SieglingsActionQueue?.onIdle;
    if (typeof onIdle !== 'function') {
        showTurnChangeToast(nextState);
        return;
    }
    window.SieglingsActionQueue.onIdle().then(() => {
        // A newer snapshot may have landed while playback drained; announcing a
        // turn the player has already moved past would be worse than silence.
        if (gameState !== nextState) return;
        showTurnChangeToast(nextState);
    });
}

function applyStartedMultiplayerState(data) {
    clearRoomExpiryTimer();
    clearExternalSocketElementMemory();
    const roomId = data?.roomId || multiplayerSession?.roomId;
    if (data?.multiplayer && roomId && coinFlipDismissedRoomId !== roomId) {
        coinFlipDismissedRoomId = roomId;
        showCoinFlipOverlay(data).then(() => {
            gameState = data;
            render();
        });
        return;
    }
    gameState = data;
    render();
}

function showCoinFlipOverlay(state) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('coinFlipOverlay');
        const title = document.getElementById('coinFlipTitle');
        const copy = document.getElementById('coinFlipCopy');
        const coin = document.getElementById('coinFlipAnim');
        if (!overlay || !title || !copy) {
            resolve();
            return;
        }

        const viewerFirst = state.viewerGoesFirst === true || state.firstPlayer === 'PLAYER';
        const winnerName = state.coinFlipWinnerName
            || (viewerFirst ? (state.playerName || 'You') : (state.enemyName || 'Opponent'));
        title.textContent = viewerFirst ? 'You go first!' : `${winnerName} goes first!`;
        copy.textContent = viewerFirst
            ? 'You won the coin flip and take the first turn this round.'
            : `${winnerName} won the coin flip and takes the first turn this round.`;

        coin?.classList.add('spinning');
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => overlay.classList.add('visible'));
        window.SieglingsSounds?.play('phase', 0.55);

        setTimeout(() => {
            coin?.classList.remove('spinning');
            setTimeout(() => {
                overlay.classList.remove('visible');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    resolve();
                }, 320);
            }, 2200);
        }, 1400);
    });
}

/* ============================================================
   CARD INSPECTOR - full-detail overlay when tapping hand card
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

// Most-recent match history list, stashed when the welcome screen renders
// so openMatchDetail can look up the clicked entry by index.
let latestMatchHistory = [];

function openMatchDetail(index) {
    const entry = latestMatchHistory[index];
    const overlay = document.getElementById('matchDetailOverlay');
    const content = document.getElementById('matchDetailContent');
    if (!entry || !overlay || !content) return;

    const resultClass = String(entry.result || '').toLowerCase();
    const finishedAt = entry.finishedAt ? new Date(entry.finishedAt) : null;
    const finishedLabel = finishedAt && !isNaN(finishedAt.getTime())
        ? finishedAt.toLocaleString()
        : '';
    const ph = Number(entry.playerHealthRemaining);
    const oh = Number(entry.opponentHealthRemaining);
    const en = Number(entry.playerEnergyRemaining);

    const statRow = (label, value) =>
        `<div class="match-detail-stat"><span class="md-stat-label">${escapeHtml(label)}</span><span class="md-stat-value">${escapeHtml(String(value))}</span></div>`;

    const logLines = Array.isArray(entry.gameLog) ? entry.gameLog : [];
    const logHtml = logLines.length > 0
        ? `<div class="match-detail-log">${logLines.map((line) =>
                `<div class="md-log-line">${escapeHtml(line)}</div>`
            ).join('')}</div>`
        : '<div class="identity-note">No turn-by-turn breakdown was recorded for this match.</div>';

    content.innerHTML = `
        <div class="match-detail-header result-${escapeHtmlAttribute(resultClass)}">
            <div class="match-detail-result history-result-${escapeHtmlAttribute(resultClass)}">${escapeHtml(entry.result || 'Result')}</div>
            <div class="match-detail-sub">${escapeHtml(entry.loadoutLabel || 'Loadout')} vs ${escapeHtml(entry.opponentName || 'Opponent')}</div>
            ${finishedLabel ? `<div class="match-detail-date">${escapeHtml(finishedLabel)}</div>` : ''}
        </div>
        <div class="match-detail-stats">
            ${statRow('Your Health', Number.isFinite(ph) ? ph : '—')}
            ${statRow('Opponent Health', Number.isFinite(oh) ? oh : '—')}
            ${statRow('Energy Left', Number.isFinite(en) ? en : '—')}
            ${statRow('Turns', entry.turnNumber ?? '—')}
            ${statRow('SiegeKnight', entry.trainerName || '—')}
            ${statRow('Match Type', entry.matchType || '—')}
            ${statRow('Strategies Used', entry.spellsCast ?? 0)}
            ${statRow('Deceptions Sprung', entry.trapsSprung ?? 0)}
            ${statRow('Siegelings Defeated', entry.siegelingsDefeated ?? 0)}
        </div>
        <div class="match-detail-log-title">Game Breakdown</div>
        ${logHtml}
    `;
    overlay.classList.remove('hidden');
}

function closeMatchDetail(event) {
    if (event) event.stopPropagation();
    const overlay = document.getElementById('matchDetailOverlay');
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

/**
 * True while the opponent (AI or the other player) owns the initiative, so no
 * local input may reach the server. The backend rejects these actions anyway;
 * the point here is that the controls must not *look* live while the other side
 * is thinking — a Knight tap or a card drop that silently no-ops reads as a bug.
 */
function isOpponentControlLocked() {
    if (!gameState || gameState.gameOver) {
        return false;
    }
    const phase = gameState.currentPhase;
    if (phase === 'MULLIGAN') {
        return false;
    }
    if (phase === 'BATTLE') {
        return gameState.battleWaitingOn === 'ENEMY';
    }
    return gameState.activeSide !== 'PLAYER';
}

function getTrainerAbilityLockReason(trainer = gameState?.player?.trainer) {
    if (!gameState || !trainer?.active) {
        return 'No active SiegeKnight ability is available right now.';
    }
    if (isOpeningPlacementOnlyTurn()) {
        return 'Turn 1 starts with a Siegeling placement.';
    }
    if (!trainer.canUseActive) {
        if (gameState.currentPhase === 'BATTLE') {
            return 'Your SiegeKnight active was already used this round and refreshes after battle.';
        }
        if (trainer.oncePerGame) {
            return 'This ultimate can only be used once per match.';
        }
        return 'Your SiegeKnight active was already used this round.';
    }
    if (gameState.activeSide !== 'PLAYER') {
        return 'Wait for your turn before using your SiegeKnight ability.';
    }
    if (targetMode) {
        if (targetContext?.mode === 'battle') {
            return 'Finish queueing the current battle action first.';
        }
        if (targetContext?.mode !== 'trainer') {
            return 'Finish the current target selection first.';
        }
    }
    if (gameState.currentPhase === 'BATTLE') {
        if (window.SieglingsActionQueue?.isPresentationBusy?.()) {
            return 'Wait for the Battle Phase announcement to finish.';
        }
        if (Number(gameState.battleCursor || 0) === 0
            && !gameState.pendingBattle
            && !gameState.battleWaitingOn
            && Array.isArray(gameState.battleQueue)
            && gameState.battleQueue.length > 0) {
            return 'Wait for the first battle action to begin.';
        }
        if (gameState.battleWaitingOn === 'ENEMY') {
            return 'Wait for the opponent to finish the current battle action.';
        }
        if (gameState.pendingBattle) {
            return 'Queue this Siegeling\'s battle action before using your SiegeKnight active.';
        }
    }
    const targetSide = getAbilityTargetSide(trainer.active);
    if (targetSide && !abilityHasAvailableTarget(trainer.active)) {
        return targetSide
            ? `No ${targetSide} targets are available right now.`
            : 'This ability has no valid target right now.';
    }
    return '';
}

function canUseTrainerAbility(trainer = gameState?.player?.trainer) {
    return Boolean(trainer && trainer.active && !getTrainerAbilityLockReason(trainer));
}

function buildTrainerAbilityHint(trainer) {
    if (!trainer?.active) {
        return 'No active SiegeKnight ability is ready right now.';
    }
    const lockReason = getTrainerAbilityLockReason(trainer);
    if (lockReason) {
        return lockReason;
    }
    const targetSide = getAbilityTargetSide(trainer.active);
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
    const preview = document.getElementById('trainerAbilityCardPreview');
    if (preview) {
        preview.innerHTML = knightHudCardInnerHtml(trainer);
        preview.setAttribute('aria-label', `${trainer.name || 'Player SiegeKnight'} card`);
    }
    const tier = document.getElementById('trainerAbilityTier');
    const description = document.getElementById('trainerAbilityDescription');
    const copy = document.getElementById('trainerAbilityCopy');
    const status = document.getElementById('trainerAbilityStatus');
    const useBtn = document.getElementById('btnUseTrainerAbility');

    if (title) {
        title.textContent = trainer.name || 'SiegeKnight';
    }
    if (tier) {
        tier.innerHTML = [
            ['trainerAbilityRank', formatTrainerTier(trainer.tier)],
            ['trainerAbilityElement', formatElementLabel(trainer.element)],
            ['trainerAbilityRarity', trainer.rarity]
        ].filter(([, value]) => value).map(([id, value]) =>
            `<span id="${id}">${escapeHtml(value)}</span>`).join(' • ');
    }
    if (description) {
        description.textContent = trainer.passive?.description
            ? `Passive: ${trainer.passive.description}`
            : 'No passive effect listed.';
    }
    if (copy) {
        copy.textContent = trainer.active?.description
            ? `Active: ${trainer.active.description}`
            : 'No active ability listed.';
    }
    if (status) {
        const availability = trainer.active
            ? buildTrainerAbilityHint(trainer)
            : 'No active SiegeKnight ability is available right now.';
        status.textContent = availability || '';
        status.classList.toggle('hidden', !availability);
    }
    if (useBtn) {
        const lockReason = getTrainerAbilityLockReason(trainer);
        const canUse = !lockReason;
        useBtn.disabled = !canUse;
        useBtn.textContent = !trainer.active
            ? 'No Active Ability'
            : (canUse
                ? (abilityNeedsTarget(trainer.active) ? 'Choose Target' : 'Use Ability')
                : 'Unavailable');
    }
}
function openTrainerAbilityPopup() {
    const trainer = gameState?.player?.trainer;
    if (!trainer || isOpponentControlLocked()) {
        return;
    }
    const overlay = document.getElementById('trainerAbilityOverlay');
    if (!overlay) {
        return;
    }
    renderTrainerAbilityPopup();
    overlay.classList.remove('hidden');
    if (tutorialMatchActive || gameState?.tutorialMode) window.KnightTutorial?.start();
}

function closeTrainerAbilityPopup(event) {
    window.KnightTutorial?.stop();
    if (event) {
        event.stopPropagation();
    }
    const overlay = document.getElementById('trainerAbilityOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Which single effect the key was opened from, so "All Effects" can offer a way
// back to it instead of dead-ending on the full list.
let effectKeyOriginKind = null;

function effectKeyBadgeHtml(kind) {
    const color = STATUS_BADGE_PALETTE[kind] || '#cbd5f5';
    const svg = STATUS_BADGE_SVG[kind] || STATUS_BADGE_SVG_GENERIC;
    return `<span class="effect-key-badge" style="--sb-color:${color}">${svg}</span>`;
}

function effectKeyMetaHtml(info) {
    const bits = [];
    if (info.element) {
        bits.push(`<span class="effect-key-tag" style="--et:${getElementHex(info.element)}">${escapeHtml(formatElementLabel(info.element))} damage</span>`);
    }
    if (info.cap) {
        bits.push(`<span class="effect-key-tag effect-key-tag--cap">Max ${info.cap} badge${info.cap === 1 ? '' : 's'}</span>`);
    }
    return bits.length ? `<div class="effect-key-meta">${bits.join('')}</div>` : '';
}

function openEffectKey(kind, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const info = STATUS_EFFECT_KEY[kind];
    if (!info) {
        showAllEffectsKey(null);
        return;
    }
    effectKeyOriginKind = kind;
    const overlay = document.getElementById('effectKeyOverlay');
    const kicker = document.getElementById('effectKeyKicker');
    const title = document.getElementById('effectKeyTitle');
    const body = document.getElementById('effectKeyBody');
    const allBtn = document.getElementById('btnEffectKeyAll');
    if (!overlay || !body) return;

    const group = STATUS_EFFECT_GROUPS.find((g) => g.id === info.group);
    if (kicker) kicker.textContent = group ? group.title : 'Status Effect';
    if (title) title.textContent = info.name;
    const color = STATUS_BADGE_PALETTE[kind] || '#cbd5f5';
    body.innerHTML = `<div class="effect-key-single" style="--ek:${color}">`
        + effectKeyBadgeHtml(kind)
        + `<div class="effect-key-single-copy">`
        + (info.summary ? `<div class="effect-key-summary">${escapeHtml(info.summary)}</div>` : '')
        + effectKeyMetaHtml(info)
        + `<p class="effect-key-detail">${escapeHtml(info.detail)}</p>`
        + `</div></div>`;
    if (allBtn) {
        allBtn.textContent = 'All Effects';
        allBtn.hidden = false;
    }
    overlay.classList.remove('hidden');
}

function showAllEffectsKey(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const overlay = document.getElementById('effectKeyOverlay');
    const kicker = document.getElementById('effectKeyKicker');
    const title = document.getElementById('effectKeyTitle');
    const body = document.getElementById('effectKeyBody');
    const allBtn = document.getElementById('btnEffectKeyAll');
    if (!overlay || !body) return;

    if (kicker) kicker.textContent = 'Reference';
    if (title) title.textContent = 'All Effects';

    let html = '';
    STATUS_EFFECT_GROUPS.forEach((group) => {
        const kinds = Object.keys(STATUS_EFFECT_KEY).filter((k) => STATUS_EFFECT_KEY[k].group === group.id);
        if (kinds.length === 0) return;
        html += `<section class="effect-key-section">`;
        html += `<div class="effect-key-heading">${escapeHtml(group.title)}<span class="effect-key-sub">${escapeHtml(group.blurb)}</span></div>`;
        kinds.forEach((kind) => {
            const info = STATUS_EFFECT_KEY[kind];
            const color = STATUS_BADGE_PALETTE[kind] || '#cbd5f5';
            html += `<div class="effect-key-row" style="--ek:${color}">`
                + effectKeyBadgeHtml(kind)
                + `<div class="effect-key-row-copy">`
                + `<div class="effect-key-name">${escapeHtml(info.name)}`
                + (info.element ? `<span class="effect-key-el" style="--et:${getElementHex(info.element)}">${escapeHtml(formatElementLabel(info.element))}</span>` : '')
                + (info.cap ? `<span class="effect-key-cap">max ${info.cap}</span>` : '')
                + `</div>`
                + `<div class="effect-key-text">${escapeHtml(info.detail)}</div>`
                + `</div></div>`;
        });
        html += `</section>`;
    });
    body.innerHTML = html;

    if (allBtn) {
        if (effectKeyOriginKind && STATUS_EFFECT_KEY[effectKeyOriginKind]) {
            allBtn.hidden = false;
            allBtn.textContent = `Back to ${STATUS_EFFECT_KEY[effectKeyOriginKind].name}`;
        } else {
            allBtn.hidden = true;
        }
    }
    overlay.classList.remove('hidden');
    body.scrollTop = 0;
}

// Entry point for the standalone "All Effects" affordances (preview pill, key
// panel link) — no single effect to return to, so drop any stale origin.
function openAllEffectsKey(event) {
    effectKeyOriginKind = null;
    showAllEffectsKey(event);
}

// The single footer button flips role depending on which view is showing.
function toggleEffectKeyView(event) {
    const body = document.getElementById('effectKeyBody');
    const showingAll = !!body?.querySelector('.effect-key-section');
    if (showingAll && effectKeyOriginKind) {
        openEffectKey(effectKeyOriginKind, event);
    } else {
        showAllEffectsKey(event);
    }
}

function closeEffectKey(event) {
    if (event) {
        event.stopPropagation();
    }
    const overlay = document.getElementById('effectKeyOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    effectKeyOriginKind = null;
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
    const trainer = gameState?.player?.trainer;
    if (!canUseTrainerAbility(trainer)) {
        return;
    }
    closeTrainerAbilityPopup();
    onTrainerUse();
}

function waitForClaimFx(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function isReducedMotionPreferred() {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function getVisibleElementCenter(el) {
    if (!el) {
        return null;
    }
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return null;
    }
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        rect
    };
}

function findFirstVisibleElement(selectors) {
    for (const selector of selectors) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
            if (getVisibleElementCenter(node)) {
                return node;
            }
        }
    }
    return null;
}

function getClaimBoardCellElement(row, col) {
    return document.querySelector(`#playerGrid .board-cell[data-row="${row}"][data-col="${col}"]`);
}

function getClaimFxEnemyOrigin() {
    const enemyCard = findFirstVisibleElement([
        '#enemyGrid .board-card',
        '#enemyGrid .board-cell.has-card'
    ]);
    const enemyCardCenter = getVisibleElementCenter(enemyCard);
    if (enemyCardCenter) {
        return enemyCardCenter;
    }

    const enemyGrid = document.getElementById('enemyGrid');
    const enemyGridCenter = getVisibleElementCenter(enemyGrid);
    if (enemyGridCenter) {
        return {
            x: enemyGridCenter.x,
            y: enemyGridCenter.rect.bottom - enemyGridCenter.rect.height * 0.12,
            rect: enemyGridCenter.rect
        };
    }

    return {
        x: window.innerWidth / 2,
        y: Math.max(32, window.innerHeight * 0.22)
    };
}

function getClaimAttackElement(card) {
    const enemyBoardCards = Array.isArray(gameState?.enemyBoard)
        ? gameState.enemyBoard.flat().filter(Boolean)
        : [];
    return gameState?.enemy?.trainer?.element
        || enemyBoardCards[0]?.element
        || card?.element
        || 'NEUTRAL';
}

function getClaimEnergyTarget(element) {
    const key = String(element || 'NEUTRAL').toLowerCase();
    return findFirstVisibleElement([
        `#playerEnergy .solid-token.token-${key}`,
        '#playerEnergy .energy-token',
        '#playerEnergy',
        '#railPlayerElements .hud-elem-dot',
        '#railPlayerElements',
        '#hudRailPlayer .hud-section-elements',
        '#hudRailPlayer',
        '#mobilePlayerElements .m-elem-dot',
        '#mobilePlayerEnergyCount',
        '.mobile-hud-player',
        '#safeEnergyFillPlayer',
        '.safe-hp-player',
        '.top-bar-player'
    ]) || document.getElementById('playerEnergy') || document.getElementById('railPlayerElements');
}

function pulseClaimEnergyTarget(targetEl, element) {
    if (!targetEl) {
        return;
    }
    targetEl.style.setProperty('--sgl-claim-color', getElementHex(element));
    targetEl.classList.remove('sgl-claim-pool-pulse');
    void targetEl.offsetWidth;
    targetEl.classList.add('sgl-claim-pool-pulse');
    window.setTimeout(() => targetEl.classList.remove('sgl-claim-pool-pulse'), 760);
}

function spawnClaimEnergyMotes(cardEl, targetEl, element) {
    const start = getVisibleElementCenter(cardEl);
    const target = getVisibleElementCenter(targetEl) || getVisibleElementCenter(document.getElementById('playerEnergy'));
    if (!start || !target || !document.body) {
        return waitForClaimFx(120);
    }

    const reduced = isReducedMotionPreferred();
    const color = getElementHex(element);
    const count = reduced ? 5 : 18;
    const duration = reduced ? 260 : 860;
    const maxDelay = reduced ? 80 : 260;
    const spreadX = Math.max(12, start.rect.width * 0.36);
    const spreadY = Math.max(16, start.rect.height * 0.34);

    for (let i = 0; i < count; i++) {
        const mote = document.createElement('span');
        mote.className = 'sgl-claim-mote';
        mote.setAttribute('aria-hidden', 'true');

        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.55;
        const radius = 0.25 + Math.random() * 0.75;
        const startX = start.x + Math.cos(angle) * spreadX * radius;
        const startY = start.y + Math.sin(angle) * spreadY * radius;
        const endJitterX = (Math.random() - 0.5) * Math.min(24, target.rect.width * 0.45);
        const endJitterY = (Math.random() - 0.5) * Math.min(18, target.rect.height * 0.45);
        const delay = Math.round((i / Math.max(1, count - 1)) * maxDelay);

        mote.style.left = `${startX}px`;
        mote.style.top = `${startY}px`;
        mote.style.setProperty('--sgl-claim-color', color);
        mote.style.setProperty('--sgl-claim-dx', `${target.x + endJitterX - startX}px`);
        mote.style.setProperty('--sgl-claim-dy', `${target.y + endJitterY - startY}px`);
        mote.style.setProperty('--sgl-claim-delay', `${delay}ms`);
        mote.style.setProperty('--sgl-claim-duration', `${duration}ms`);
        document.body.appendChild(mote);
        window.setTimeout(() => mote.remove(), duration + delay + 120);
    }

    pulseClaimEnergyTarget(targetEl, element);
    return waitForClaimFx(duration + maxDelay + 80);
}

async function playClaimBoardCardFx(row, col, card) {
    if (!card || typeof document === 'undefined') {
        return;
    }

    const cellEl = getClaimBoardCellElement(row, col);
    const cardEl = cellEl?.querySelector('.board-card');
    const cardCenter = getVisibleElementCenter(cardEl);
    if (!cardEl || !cardCenter) {
        return;
    }

    const claimElement = card.element || 'NEUTRAL';
    const attackElement = getClaimAttackElement(card);
    const claimColor = getElementHex(claimElement);
    const origin = getClaimFxEnemyOrigin();
    const reduced = isReducedMotionPreferred();
    const projectileMs = reduced ? 120 : 430;

    if (window.SieglingsFx?.attackBetween && origin) {
        window.SieglingsFx.attackBetween(
            origin.x,
            origin.y,
            cardCenter.x,
            cardCenter.y,
            attackElement,
            { duration: projectileMs }
        );
        await waitForClaimFx(projectileMs);
    }

    window.SieglingsFx?.impactAtPoint?.(cardCenter.x, cardCenter.y, attackElement);
    cardEl.style.setProperty('--sgl-claim-color', claimColor);
    cardEl.classList.add('sgl-claim-dissolving');
    window.SieglingsFx?.floatingText?.(
        cardCenter.x,
        cardCenter.y - Math.max(18, cardCenter.rect.height * 0.18),
        `+1 ${formatElementLabel(claimElement)}`,
        claimColor,
        20
    );

    await waitForClaimFx(reduced ? 70 : 140);
    await spawnClaimEnergyMotes(cardEl, getClaimEnergyTarget(claimElement), claimElement);
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
        tier.textContent = `${formatElementLabel(card.element)} Siegeling`;
    }
    if (description) {
        description.textContent = `This removes ${card.name} from your board and grants 1 temporary ${formatElementLabel(card.element)} energy for this turn.`;
    }
    if (copy) {
        copy.textContent = 'Claiming can break its links and lower your permanent network energy, but the temporary claim energy applies right away for this setup turn.';
    }
    if (confirmBtn) {
        confirmBtn.disabled = claimFxInFlight;
        confirmBtn.textContent = claimFxInFlight ? 'Claiming...' : 'Claim';
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
   CARD PREVIEW FLOAT - shows selected card over enemy grid
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
    if (hoveredCard) {
        return hoveredCard;
    }
    // Battle docks the hand away, so whatever card was selected back in Setup is
    // stale — the Siegeling that is actually acting is what the preview is for.
    const actingCell = getActingPreviewCell();
    if (actingCell) {
        return boardCellToPreviewCard(actingCell);
    }
    if (isHandHiddenForPhase()) {
        return null;
    }
    return selectedCard || null;
}

/**
 * Board cell for the Siegeling the battle queue is on. Falls back to the last
 * actor while the opponent resolves its own action (the server only hands us a
 * pendingBattle for our side), so the preview holds steady between actors
 * instead of flicking back to a hand card.
 */
function getActingPreviewCell() {
    if (!gameState || !isHandHiddenForPhase()) {
        return null;
    }
    const pendingId = gameState.pendingBattle?.instanceId;
    if (pendingId) {
        return findBoardCellByInstanceId(pendingId);
    }
    return lastActingPreviewInstanceId
        ? findBoardCellByInstanceId(lastActingPreviewInstanceId)
        : null;
}

/**
 * Hand the preview back to the queue whenever it advances to a new actor. A
 * board card the player clicked mid-battle still wins until that happens;
 * without this an arena selection made during Setup would pin the preview to a
 * bystander for the whole battle phase.
 */
function syncActingPreviewFocus() {
    if (!isHandHiddenForPhase()) {
        lastActingPreviewInstanceId = null;
        return;
    }
    const pendingId = gameState?.pendingBattle?.instanceId || null;
    if (!pendingId || pendingId === lastActingPreviewInstanceId) {
        return;
    }
    lastActingPreviewInstanceId = pendingId;
    clearArenaSelection();
    hoveredBoardCard = null;
}

// Distinct, value-adding hints for whatever card is currently focused. Each
// line says something the others (and the action banner) do not, so the hint
// drawer never repeats the same "use the eye button" message three times.
function getFocusedCardHints(card) {
    const hints = [];

    if (isBoardPreviewCard(card)) {
        hints.push(
            `${boardCardOwnershipLabel(card)} Siegeling — ${card.hp ?? '?'}/${card.maxHp ?? '?'} HP.`
        );
        const moveCount = getSieglingMovesForDisplay(card).length;
        if (moveCount > 0) {
            hints.push(`Open the Battle View (⚔) to simulate its ${moveCount} move${moveCount === 1 ? '' : 's'} and what each one can hit.`);
        }
        return hints;
    }

    const lockReason = getHandCardLockReason(card);
    if (lockReason) {
        hints.push(lockReason);
    } else if (card.type === 'SIEGLING') {
        if (card.evolvesFromName) {
            hints.push(`After ${card.evolvesFromName} survives a full battle phase in that form, play this on it to evolve.`);
        }
        const moveCount = getSieglingMovesForDisplay(card).length;
        if (moveCount > 0) {
            hints.push(`Open the Battle View (⚔) to preview the ${moveCount} move${moveCount === 1 ? '' : 's'} it can make once placed.`);
        }
    } else if (card.type === 'TRAP') {
        hints.push('Deceptions stay hidden until their trigger condition is met.');
    } else if (card.costElement && card.costAmount > 0) {
        hints.push(`This costs ${card.costAmount} ${formatElementLabel(card.costElement)} to play.`);
    }

    // One discovery tip covering both ways into the full card preview.
    hints.push('Double-tap the card or tap the eye button for its full preview.');
    return hints;
}

function getInteractionHintState() {
    const state = getInteractionBannerState();
    const focusedCard = getFocusedPreviewCard();
    const hints = [];

    if (state?.message) {
        hints.push(state.message);
    }

    if (focusedCard) {
        getFocusedCardHints(focusedCard).forEach((hint) => hints.push(hint));
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
    const panels = [
        document.getElementById('interactionHintPanel'),
        document.getElementById('desktopInspectHintPanel')
    ].filter(Boolean);
    if (panels.length === 0) {
        return;
    }

    const hintState = getInteractionHintState();
    let html;
    if (!hintState.available) {
        html = `
            <div class="hint-drawer-copy">Select or hover a hand card, or tap a Siegeling on either board, to see contextual help.</div>
            <div class="hint-list">
                <div class="hint-item">Double-tap a hand card (or tap the eye button) to open its full preview.</div>
                <div class="hint-item">Open the Battle View (⚔) to simulate your board's attacks before battle begins.</div>
            </div>
        `;
    } else {
        html = `<div class="hint-drawer-copy">Context-sensitive help for your current board state.</div>`;
        html += `<div class="hint-chip ${escapeHtml(hintState.kind)}">${escapeHtml(hintState.label)}</div>`;
        html += `<div class="hint-list">`;
        hintState.hints.forEach(hint => {
            html += `<div class="hint-item">${escapeHtml(hint)}</div>`;
        });
        html += `</div>`;
    }
    panels.forEach((panel) => {
        panel.innerHTML = html;
    });
}

function syncActionBarAttention() {
    const hintButton = document.getElementById('btnHint');
    const previewButton = document.getElementById('btnSelectedPreview');
    const cancelMoveButton = document.getElementById('btnCancelBattleMove');
    const targetingCamera = isMobileBattleTargetingCameraActive();
    const hintState = getInteractionHintState();
    const focusedCard = getFocusedPreviewCard();

    cancelMoveButton?.classList.toggle('hidden', !targetingCamera);
    if (cancelMoveButton) {
        cancelMoveButton.hidden = !targetingCamera;
    }

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
    const labelEl = document.getElementById('setupActionsCounterLabel');
    const gs = gameState;
    if (!gs || gs.gameOver || gs.mulligan?.active || (gs.currentPhase !== 'DRAW' && gs.currentPhase !== 'SETUP')) {
        el.hidden = true;
        el.disabled = false;
        if (valueEl) valueEl.textContent = '';
        if (labelEl) labelEl.textContent = 'Act';
        el.removeAttribute('title');
        el.removeAttribute('aria-haspopup');
        el.classList.remove('is-zero', 'is-decrement', 'is-increment');
        lastSetupActionsRemaining = null;
        closeSetupActionsBreakdown();
        return;
    }
    if (gs.currentPhase === 'DRAW') {
        const playerActive = gs.activeSide === 'PLAYER';
        el.hidden = false;
        el.disabled = !playerActive;
        el.classList.remove('is-zero', 'is-decrement', 'is-increment');
        el.removeAttribute('aria-haspopup');
        el.title = playerActive ? 'Draw a card' : 'Waiting for the opponent to draw';
        el.setAttribute('aria-label', el.title);
        if (labelEl) labelEl.textContent = 'Draw';
        if (valueEl) valueEl.textContent = '';
        lastSetupActionsRemaining = null;
        closeSetupActionsBreakdown();
        return;
    }
    el.disabled = false;
    el.setAttribute('aria-haspopup', 'dialog');
    el.removeAttribute('aria-label');
    if (labelEl) labelEl.textContent = 'Act';
    const budget = gs.setupSieglingActionBudget;
    const used = gs.setupSieglingActionsUsed;
    if (budget == null || used == null) {
        el.hidden = true;
        closeSetupActionsBreakdown();
        if (valueEl) valueEl.textContent = '';
        lastSetupActionsRemaining = null;
        return;
    }
    const remaining = Math.max(0, budget - used);
    el.hidden = false;
    if (valueEl) {
        valueEl.textContent = `${remaining}/${budget}`;
    }
    el.title = `${remaining} Siegeling setup action${remaining === 1 ? '' : 's'} left this turn (${used} of ${budget} used).`;
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

/**
 * Setup action budget = 1 base placement + 1 per pooled energy captured when Setup began.
 * Returns the breakdown the action counter popover explains, or null outside Setup.
 */
function getSetupActionsBreakdown() {
    const gs = gameState;
    if (!gs || gs.gameOver || gs.currentPhase !== 'SETUP' || gs.mulligan?.active) {
        return null;
    }
    const budget = gs.setupSieglingActionBudget;
    const used = gs.setupSieglingActionsUsed;
    if (budget == null || used == null) {
        return null;
    }
    const energyBonus = Math.max(0, budget - 1);
    return {
        base: 1,
        energyBonus,
        budget,
        used,
        remaining: Math.max(0, budget - used)
    };
}

function closeSetupActionsBreakdown() {
    const pop = document.getElementById('setupActionsBreakdown');
    if (pop) pop.remove();
    document.removeEventListener('pointerdown', handleSetupActionsBreakdownOutside, true);
    window.removeEventListener('resize', closeSetupActionsBreakdown);
    window.removeEventListener('scroll', closeSetupActionsBreakdown, true);
}

function handleSetupActionsBreakdownOutside(event) {
    const pop = document.getElementById('setupActionsBreakdown');
    const counter = document.getElementById('setupActionsCounter');
    if (!pop) return;
    if (pop.contains(event.target) || (counter && counter.contains(event.target))) {
        return;
    }
    closeSetupActionsBreakdown();
}

function toggleSetupActionsBreakdown(event) {
    if (event) event.stopPropagation();
    if (document.getElementById('setupActionsBreakdown')) {
        closeSetupActionsBreakdown();
        return;
    }
    const counter = document.getElementById('setupActionsCounter');
    const data = getSetupActionsBreakdown();
    if (!counter || !data) return;

    const energyLine = data.energyBonus > 0
        ? `<div class="sap-row"><span>Pooled energy</span><span class="sap-add">+${data.energyBonus}</span></div>`
        : `<div class="sap-row sap-muted"><span>Pooled energy</span><span>+0</span></div>`;

    const pop = document.createElement('div');
    pop.id = 'setupActionsBreakdown';
    pop.className = 'setup-actions-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Where your setup actions come from');
    pop.innerHTML = `
        <div class="sap-title">Setup actions this turn</div>
        <div class="sap-row"><span>Base placement</span><span class="sap-add">+1</span></div>
        ${energyLine}
        <div class="sap-row sap-total"><span>Total budget</span><span>${data.budget}</span></div>
        <div class="sap-row sap-sub"><span>Used</span><span>${data.used}</span></div>
        <div class="sap-row sap-sub"><span>Remaining</span><span>${data.remaining}</span></div>
        <div class="sap-note">You always get 1 placement. Each unit of elemental energy pooled when Setup began adds one more Siegeling placement.</div>
    `;
    document.body.appendChild(pop);

    const rect = counter.getBoundingClientRect();
    const margin = 8;
    const popRect = pop.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - popRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(rect.top - popRect.height - margin)}px`;

    document.addEventListener('pointerdown', handleSetupActionsBreakdownOutside, true);
    window.addEventListener('resize', closeSetupActionsBreakdown);
    window.addEventListener('scroll', closeSetupActionsBreakdown, true);
}

function handleActionCounterClick(event) {
    if (gameState?.currentPhase === 'DRAW') {
        event?.stopPropagation();
        if (gameState.activeSide === 'PLAYER' && !gameState.gameOver) {
            void playerDraw();
        }
        return;
    }
    toggleSetupActionsBreakdown(event);
}

let desktopInspectTab = 'card';

function setDesktopInspectTab(tab) {
    desktopInspectTab = normalizeDesktopInspectTab(tab);
    syncDesktopInspectTabUi();
    if (usesLandscapeInspectorMenuDock()) {
        refreshLandscapeInspectMenuContent(desktopInspectTab);
    }
}

function syncDesktopInspectTabUi() {
    const showMenuTabs = usesLandscapeInspectorMenuDock();
    const fullLog = document.getElementById('desktopInspectFullLog');
    const history = document.getElementById('desktopActionHistory');
    if (fullLog) {
        fullLog.classList.toggle('hidden', !showMenuTabs);
    }
    if (history) {
        history.classList.toggle('hidden', showMenuTabs);
    }

    DESKTOP_INSPECT_TABS.forEach((tab) => {
        const tabId = `tabDesktopInspect${tab.charAt(0).toUpperCase()}${tab.slice(1)}`;
        const paneId = `desktopInspectPane${tab.charAt(0).toUpperCase()}${tab.slice(1)}`;
        const tabEl = document.getElementById(tabId);
        const paneEl = document.getElementById(paneId);
        const isActive = desktopInspectTab === tab;
        const isMenuTab = DESKTOP_INSPECT_MENU_TABS.includes(tab);
        if (tabEl) {
            if (isMenuTab) {
                tabEl.hidden = !showMenuTabs;
                tabEl.classList.toggle('desktop-inspect-tab-menu-visible', showMenuTabs);
            }
            tabEl.classList.toggle('is-active', isActive);
            tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
        if (paneEl) {
            paneEl.classList.toggle('is-active', isActive);
            if (isActive) {
                paneEl.removeAttribute('hidden');
            } else {
                paneEl.setAttribute('hidden', '');
            }
        }
    });
    if (desktopInspectTab === 'card') {
        scheduleDesktopPreviewCardScale();
    }
    syncActionBarMenuAttention(desktopInspectTab);
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
        return 'Hover, select a hand card, or click a Siegeling on either board to inspect it here.';
    }
    if (isBoardPreviewCard(card)) {
        const own = boardCardOwnershipLabel(card);
        const phases = Number(card.battlePhasesSeen || 0);
        return `${own} Siegeling in play — ${card.hp}/${card.maxHp} HP · ${phases} battle phase(s) survived.`;
    }
    if (card.type === 'SIEGLING') {
        if (card.evolvesFromName) {
            return `After ${card.evolvesFromName} completes a full battle phase in that form, place this on it to evolve.`;
        }
        if (isPlacementBudgetLockedForCard(card)) {
            return sieglingPlacementLockMessage();
        }
        if (gameState?.currentPhase === 'SETUP') {
            return 'Highlighted board cells show where this Siegeling can expand next.';
        }
        return 'Siegeling battle actions resolve automatically in speed order during battle.';
    }
    if (card.type === 'TRAP') {
        return 'Deceptions stay hidden until their trigger condition is met.';
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
        return `${own} Siegeling on board — HP ${card.hp}/${card.maxHp}. Eye button opens the full preview.`;
    }
    if (!isPlayerHandCard(card)) {
        return 'Board card details update live as links, statuses, and battle order change.';
    }
    if (lockReason) {
        return lockReason;
    }
    if (card.type === 'TRAP' && card.costAmount > 0) {
        return `Requires ${card.costAmount} ${formatElementLabel(card.costElement)} in the opponent’s energy pool.`;
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
        return 'Deception timing depends on the opponent meeting its trigger.';
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

function renderDesktopPreviewEffects(card) {
    const activeEffects = [];
    const liveBadges = isBoardPreviewCard(card) ? renderStatusBadgesForCell(card) : '';
    if (liveBadges) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = liveBadges;
        wrapper.querySelectorAll('.sb-badge').forEach((badge) => {
            const kind = badge.getAttribute('data-status');
            const amount = badge.querySelector('.sb-num')?.textContent || '';
            if (kind) {
                activeEffects.push({ kind, amount });
            }
        });
    }
    return `<section class="desktop-preview-effects" aria-label="Element and active effects">
        <div class="desktop-preview-effects-head">
            <span>Active effects</span>
        </div>
        <div class="desktop-preview-effects-body">
            <div class="desktop-preview-effect-list">
                ${activeEffects.length
                    ? activeEffects.map(({ kind, amount }) => `<span class="desktop-preview-effect-pill" data-status="${escapeHtmlAttribute(kind)}" style="--sb-color:${escapeHtmlAttribute(STATUS_BADGE_PALETTE[kind] || '#8bc2ff')}">${renderStatusBadge(kind, 0)}<span>${escapeHtml(STATUS_EFFECT_KEY[kind]?.name || STATUS_BADGE_LABEL[kind] || kind)}${amount ? ` ${escapeHtml(amount.replace(/^\+/, ''))}` : ''}</span></span>`).join('')
                    : '<span class="desktop-preview-effects-empty">No active effects</span>'}
            </div>
            <button type="button" class="desktop-preview-effects-all" onclick="openAllEffectsKey(event)">View All Effects <span aria-hidden="true">›</span></button>
        </div>
    </section>`;
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
        history.innerHTML = '<div class="desktop-history-empty">The five most recent battle-phase events will show here once combat begins.</div>';
        return;
    }

    history.innerHTML = battleLines.map((entry, index) => `
        <div class="desktop-history-entry${index === 0 ? ' current' : ''}">
            <span class="desktop-history-dot"></span>
            <span>${escapeHtml(entry)}</span>
        </div>`).join('');
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

    // The first hand card is only a sensible default while the hand is on
    // screen; during battle it is an arbitrary card the player cannot act on.
    const focusedCard = getFocusedPreviewCard()
        || (isHandHiddenForPhase() ? null : gameState?.player?.hand?.[0])
        || null;
    if (!focusedCard) {
        panel.innerHTML = isHandHiddenForPhase()
            ? '<div class="desktop-empty-state">The acting Siegeling shows here as the battle queue advances. Click any card on either board to inspect it instead.</div>'
            : '<div class="desktop-empty-state">Hover or click a Siegeling on either board, or select a hand card, to inspect it here.</div>';
        return;
    }

    const lockReason = isPlayerHandCard(focusedCard) ? getHandCardLockReason(focusedCard) : '';
    if (usesLandscapeSpellPreviewDock() && mobileSpellPreviewPending && isActionCard(focusedCard) && !lockReason) {
        panel.innerHTML = renderLandscapeSpellUsePopup(focusedCard);
        return;
    }
    const abilities = getCardAbilities(focusedCard)
        .map(ability => ability?.description || ability?.name || '')
        .filter(Boolean);
    const detailEntries = getCardPreviewEntries(focusedCard);
    const summaryText = abilities[0] || getBuilderCardSummaryText(focusedCard) || 'No special text.';

    // Phone landscape rail: reuse the portrait drawer's showcase-card +
    // formatted detail entries (colored ability lines) instead of the
    // desktop copy panel, which reads as a plain spec list at 200px wide.
    if (isPhoneLandscapeLayout()) {
        let compact = '<div class="landscape-preview">';
        compact += renderShowcaseCard(focusedCard, {
            cardClass: 'selected-preview-card landscape-preview-card',
            artVariant: 'selected',
            bodyMode: 'summary'
        });
        compact += '<div class="landscape-preview-copy">';
        if (lockReason) {
            compact += `<div class="selected-copy-detail landscape-preview-lock">${escapeHtml(lockReason)}</div>`;
        }
        const statLine = getCardSummaryStatLine(focusedCard);
        if (statLine) {
            compact += `<div class="selected-copy-stats">${escapeHtml(statLine)}</div>`;
        }
        detailEntries.forEach((entry) => {
            compact += `<div class="selected-copy-detail">${entry.html || escapeHtml(entry.text)}</div>`;
        });
        compact += renderPreviewClaimControl(focusedCard);
        compact += '</div></div>';
        panel.innerHTML = compact;
        scheduleFramedSummaryFit();
        return;
    }

    let html = '<div class="desktop-preview-layout">';
    html += '<div class="desktop-preview-card-slot">';
    html += renderShowcaseCard(focusedCard, {
        cardClass: 'selected-preview-card desktop-preview-card',
        artVariant: 'selected',
        bodyMode: 'summary'
    });
    html += '</div>';
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
    html += renderPreviewClaimControl(focusedCard);
    html += renderDesktopPreviewEffects(focusedCard);
    html += '</div>';
    html += '</div>';

    panel.innerHTML = html;
    scheduleDesktopPreviewCardScale();
}

function renderLandscapeSpellUsePopup(card) {
    const targetSide = getAbilityTargetSide(card.ability);
    const playVerb = card.type === 'TRAP' ? 'Set' : 'Cast';
    const summary = getCardPreviewEntries(card)
        .map((entry) => entry.text || '')
        .filter(Boolean)
        .join(' ')
        || getBuilderCardSummaryText(card)
        || 'Use this card now.';

    return `
        <section class="landscape-spell-use-popup" aria-label="Use ${escapeHtmlAttribute(card.name)}">
            <div class="landscape-spell-use-kicker">${escapeHtml(playVerb)} ${escapeHtml(card.type || 'Spell')}</div>
            <div class="landscape-spell-use-title">${escapeHtml(card.name)}</div>
            <div class="landscape-spell-use-copy">${escapeHtml(summary)}</div>
            ${renderSpellPreviewConfirmation(card, 'landscape-spell-confirm')}
        </section>`;
}

function renderSpellPreviewConfirmation(card, extraClass = '') {
    const targetSide = getAbilityTargetSide(card.ability);
    const playVerb = card.type === 'TRAP' ? 'Set' : 'Cast';
    const confirmLabel = targetSide ? 'Choose Target' : playVerb;
    const className = extraClass ? ` ${extraClass}` : '';
    return `<div class="selected-spell-confirm${className}">
        <div class="selected-spell-target-hint">${escapeHtml(describeSpellTargetSide(targetSide))}</div>
        <div class="selected-spell-confirm-actions">
            <button type="button" class="spell-confirm-btn" onclick="confirmMobileSpellPreview()">${escapeHtml(confirmLabel)}</button>
            <button type="button" class="spell-cancel-btn" onclick="cancelMobileSpellPreview()">Cancel</button>
        </div>
    </div>`;
}

function scheduleDesktopPreviewCardScale() {
    if (previewCardScaleFrame != null) {
        window.cancelAnimationFrame(previewCardScaleFrame);
    }
    previewCardScaleFrame = window.requestAnimationFrame(() => {
        previewCardScaleFrame = window.requestAnimationFrame(() => {
            previewCardScaleFrame = null;
            syncDesktopPreviewCardScale();
            scheduleFramedSummaryFit();
        });
    });
}

function syncDesktopPreviewCardScale() {
    if (desktopInspectTab !== 'card') {
        return;
    }

    const panel = document.getElementById('desktopCardPreviewPanel');
    const layout = panel?.querySelector('.desktop-preview-layout');
    const slot = layout?.querySelector('.desktop-preview-card-slot');
    const card = panel?.querySelector('.desktop-preview-card');
    const pane = document.getElementById('desktopInspectPaneCard');
    if (!panel || !layout || !card || panel.closest('[hidden]') || pane?.hidden) {
        return;
    }

    const panelStyles = window.getComputedStyle(panel);
    const paddingTop = parseFloat(panelStyles.paddingTop) || 0;
    const paddingBottom = parseFloat(panelStyles.paddingBottom) || 0;
    const paddingLeft = parseFloat(panelStyles.paddingLeft) || 0;
    const paddingRight = parseFloat(panelStyles.paddingRight) || 0;
    const contentHeight = Math.max(
        layout.clientHeight,
        (slot?.clientHeight || 0),
        panel.clientHeight - paddingTop - paddingBottom
    );
    const contentWidth = panel.clientWidth - paddingLeft - paddingRight;
    if (!Number.isFinite(contentHeight) || !Number.isFinite(contentWidth) || contentHeight <= 48 || contentWidth <= 120) {
        return;
    }

    const root = document.documentElement;

    if (usesStackedDesktopCardPreview()) {
        const layoutStyles = window.getComputedStyle(layout);
        const rowGap = parseFloat(layoutStyles.rowGap) || parseFloat(layoutStyles.gap) || 10;
        const copyPanel = layout.querySelector('.desktop-preview-copy-panel');
        const copyHeightReserve = copyPanel?.offsetHeight
            ? Math.min(copyPanel.offsetHeight, Math.round(contentHeight * 0.44))
            : Math.round(contentHeight * 0.36);
        const cardAreaHeight = Math.max(140, contentHeight - copyHeightReserve - rowGap);
        const maxWidth = Math.round(contentWidth * 0.98);
        let nextWidth = Math.round(Math.min(maxWidth, cardAreaHeight * (5 / 7)));
        nextWidth = Math.round(clampNumber(nextWidth, 180, maxWidth));
        const nextHeight = Math.round(nextWidth * (7 / 5));
        root.style.setProperty('--desktop-preview-card-width', `${nextWidth}px`);
        root.style.setProperty('--desktop-preview-card-max-height', `${nextHeight}px`);
        return;
    }

    if (isCompactLandscapeLayout()) {
        const maxWidth = Math.round(Math.max(120, contentWidth * 0.98));
        const panelContentHeight = Math.max(96, panel.clientHeight - paddingTop - paddingBottom);
        const heightBasedWidth = panelContentHeight * 0.96 * (5 / 7);
        const nextWidth = Math.round(clampNumber(
            Math.min(maxWidth, heightBasedWidth),
            Math.min(96, maxWidth),
            maxWidth
        ));
        const nextHeight = Math.round(nextWidth * (7 / 5));
        root.style.setProperty('--desktop-preview-card-width', `${nextWidth}px`);
        root.style.setProperty('--desktop-preview-card-max-height', `${nextHeight}px`);
        return;
    }

    const layoutStyles = window.getComputedStyle(layout);
    const columnGap = parseFloat(layoutStyles.columnGap) || parseFloat(layoutStyles.gap) || 0;
    const copyPanel = layout.querySelector('.desktop-preview-copy-panel');
    const measuredCopyWidth = copyPanel?.offsetWidth || 0;
    const copyColumnReserve = measuredCopyWidth > 0
        ? measuredCopyWidth
        : Math.round(clampNumber(contentWidth * 0.52, 150, 280));
    const maxWidthFromPanel = Math.max(96, contentWidth - columnGap - copyColumnReserve);
    const heightBasedWidth = contentHeight * (5 / 7);
    const nextWidth = Math.round(clampNumber(heightBasedWidth, 108, maxWidthFromPanel));
    const nextHeight = Math.round(nextWidth * (7 / 5));

    root.style.setProperty('--desktop-preview-card-width', `${nextWidth}px`);
    root.style.setProperty('--desktop-preview-card-max-height', `${nextHeight}px`);
}

function scheduleFramedSummaryFit() {
    if (framedSummaryFitFrame != null) {
        window.cancelAnimationFrame(framedSummaryFitFrame);
    }
    framedSummaryFitFrame = window.requestAnimationFrame(() => {
        framedSummaryFitFrame = window.requestAnimationFrame(() => {
            framedSummaryFitFrame = null;
            fitFramedSummaryText();
        });
    });
}

function fitFramedSummaryText(root = document) {
    const lists = root.querySelectorAll('.element-frame .card-summary-list');
    lists.forEach(fitFramedSummaryList);
    root.querySelectorAll('.element-frame .card-title, .spell-trap-frame .card-title').forEach(fitCardFrameTitle);
}

function fitCardFrameTitle(title) {
    const header = title.closest('.hand-card-header');
    if (!header || !header.clientWidth) {
        return;
    }

    title.style.fontSize = '';
    const card = title.closest('.hand-card');
    const computed = window.getComputedStyle(title);
    const maxPx = parseFloat(computed.fontSize) || (title.closest('.desktop-preview-card') ? 15 : 13);
    const minPx = card?.closest('#playerHand, .hand-lift-layer, #drawAbilityRevealCards')
        ? 6
        : title.closest('.mulligan-showcase')
        ? 7
        : 8;
    const fits = () => title.scrollWidth <= header.clientWidth + 0.5
        && title.scrollHeight <= title.clientHeight + 2;

    if (!fits()) {
        title.style.fontSize = `${minPx}px`;
    }

    let lo = minPx;
    let hi = maxPx;
    let best = minPx;
    for (let i = 0; i < 9; i += 1) {
        const mid = (lo + hi) / 2;
        title.style.fontSize = `${mid}px`;
        if (fits()) {
            best = mid;
            lo = mid;
        } else {
            hi = mid;
        }
    }
    title.style.fontSize = `${best.toFixed(2)}px`;
}

function fitKnightCardName(title) {
    if (!title || !title.clientWidth) {
        return;
    }

    title.style.fontSize = '';
    const computed = window.getComputedStyle(title);
    const maxPx = parseFloat(computed.fontSize) || 12;
    const minPx = 5.8;
    const fits = () => title.scrollWidth <= title.clientWidth + 0.5
        && title.scrollHeight <= title.clientHeight + 2;

    if (!fits()) {
        title.style.fontSize = `${minPx}px`;
    }

    let lo = minPx;
    let hi = maxPx;
    let best = minPx;
    for (let i = 0; i < 9; i += 1) {
        const mid = (lo + hi) / 2;
        title.style.fontSize = `${mid}px`;
        if (fits()) {
            best = mid;
            lo = mid;
        } else {
            hi = mid;
        }
    }
    title.style.fontSize = `${best.toFixed(2)}px`;
}

function fitFramedSummaryList(list) {
    const body = list.closest('.hand-card-body');
    const card = list.closest('.hand-card');
    if (!body || !card || !body.clientHeight || !list.clientWidth) {
        return;
    }

    list.classList.remove('is-fitted');
    list.style.fontSize = '';
    list.style.removeProperty('--summary-row-gap');

    const isDesktopPreview = card.classList.contains('desktop-preview-card');
    const isMulligan = card.classList.contains('mulligan-showcase');
    const isHandTray = Boolean(card.closest('#playerHand, #drawAbilityRevealCards'));
    const minPx = isMulligan ? 7 : isHandTray ? 6 : 8;
    const maxPx = isDesktopPreview ? 15 : isMulligan ? 11.5 : isHandTray ? 8 : 12;
    // The list is a flex child with overflow:hidden, so it can shrink and
    // clip internally without ever growing body.scrollHeight — check the
    // list's own overflow too.
    const fits = () => body.scrollHeight <= body.clientHeight + 0.5
        && list.scrollHeight <= list.clientHeight + 0.5;

    if (!fits()) {
        list.style.fontSize = `${minPx}px`;
    }

    let lo = minPx;
    let hi = maxPx;
    let best = minPx;
    for (let i = 0; i < 9; i += 1) {
        const mid = (lo + hi) / 2;
        list.style.fontSize = `${mid}px`;
        if (fits()) {
            best = mid;
            lo = mid;
        } else {
            hi = mid;
        }
    }

    list.style.fontSize = `${best.toFixed(2)}px`;
    if (fits()) {
        list.classList.add('is-fitted');
    }
}

function scheduleSiegeKnightCardFit() {
    if (siegeKnightCardFitFrame != null) {
        window.cancelAnimationFrame(siegeKnightCardFitFrame);
    }
    siegeKnightCardFitFrame = window.requestAnimationFrame(() => {
        siegeKnightCardFitFrame = window.requestAnimationFrame(() => {
            siegeKnightCardFitFrame = null;
            fitSiegeKnightCardText();
        });
    });
}

function fitSiegeKnightCardText(root = document) {
    root.querySelectorAll('.knight-card.has-knight-back .knight-card-body, .knight-card.knight-full-card-art .knight-card-body').forEach((body) => {
        const card = body.closest('.knight-card');
        if (!card || !body.clientHeight || !body.clientWidth) {
            return;
        }

        body.classList.remove('is-fitted');
        body.style.fontSize = '';
        const title = body.querySelector('.knight-card-name');
        if (title) {
            title.style.fontSize = '';
        }

        const fits = () => body.scrollHeight <= body.clientHeight + 0.5
            && body.scrollWidth <= body.clientWidth + 0.5;

        const MIN_PX = 5.8;
        const MAX_PX = 10.5;
        if (!fits()) {
            body.style.fontSize = `${MIN_PX}px`;
        }

        let lo = MIN_PX;
        let hi = MAX_PX;
        let best = MIN_PX;
        for (let i = 0; i < 9; i += 1) {
            const mid = (lo + hi) / 2;
            body.style.fontSize = `${mid}px`;
            if (fits()) {
                best = mid;
                lo = mid;
            } else {
                hi = mid;
            }
        }

        body.style.fontSize = `${best.toFixed(2)}px`;
        fitKnightCardName(title);
        if (fits()) {
            body.classList.add('is-fitted');
        }
    });
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
            count: 1,
            // Keep the full card so the deck preview can render a real
            // miniature card (template + art) instead of a text monogram.
            card
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
            return 'Strategies';
        case 'TRAP':
            return 'Deceptions';
        case 'SIEGLING':
            return 'Siegelings';
        default:
            return type || 'Cards';
    }
}

function formatBuilderTypeFilterLabel(type) {
    switch (String(type || '').toUpperCase()) {
        case 'SIEGLING':
            return 'SIEGELING';
        case 'SPELL':
            return 'STRATEGY';
        case 'TRAP':
            return 'DECEPTION';
        default:
            return type || 'CARD';
    }
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

function renderDesktopDeckTemplateCard(card) {
    const binderVisual = window.SieglingsCardBinderVisual;
    const canUseBinderCard = binderVisual?.renderBinderCardTile
        && (binderVisual.usesFullCardArt?.(card) || binderVisual.usesFramedCardTemplate?.(card));
    if (canUseBinderCard) {
        return binderVisual.renderBinderCardTile(card, {
            ...holographicFullArtOptions(),
            cardClass: 'mulligan-showcase desktop-deck-showcase',
            compactAbilityLimit: 2,
            summaryMode: 'description',
            descriptionText: card.description || card.ability?.description || ''
        });
    }
    return renderShowcaseCard(card, {
        bodyMode: 'hidden',
        artVariant: 'hand',
        cardClass: 'deck-mini-card'
    });
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
            group.cards.forEach(row => {
                const title = `${row.name} (${row.type} / ${formatElementLabel(row.element)}) x${row.count}`;
                const countBadge = `<span class="desktop-deck-mini-badge">x${escapeHtml(String(row.count))}</span>`;
                const mini = renderDesktopDeckTemplateCard(row.card);
                html += `<div class="desktop-deck-mini" title="${escapeHtml(title)}">${countBadge}${mini}</div>`;
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
    scheduleFramedSummaryFit();
    window.SieglingsCardBinderVisual?.scheduleDescriptionFit?.();
}

/* ============================================================
   COMPACT ENERGY RENDERING - for top-bar tokens
   ============================================================ */
function renderEnergyTopBar(containerId, playerData) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const tokens = buildEnergyTokens(playerData);
    if (tokens.length === 0) {
        // Keep an explicit zero so compact top bars (phone landscape, tablet)
        // still show the energy stat instead of silently omitting it.
        el.innerHTML = '<span class="tb-etotal">E:0</span>';
        return;
    }
    // Group solid tokens by element; combo tokens stay individual
    const counts = {};
    const combos = [];
    for (const t of tokens) {
        if (t.type === 'combo') { combos.push(t); continue; }
        counts[t.key] = (counts[t.key] || 0) + 1;
    }
    let html = `<span class="tb-etotal">E:${tokens.length}</span>`;
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

const SOLO_SESSION_TOKEN_KEY = 'sieglingsSoloSessionToken';

function loadSavedSoloToken() {
    try {
        return localStorage.getItem(SOLO_SESSION_TOKEN_KEY) || null;
    } catch (e) {
        return null;
    }
}

function setSoloSessionToken(token) {
    soloSessionToken = token || null;
    try {
        if (soloSessionToken) {
            localStorage.setItem(SOLO_SESSION_TOKEN_KEY, soloSessionToken);
        } else {
            localStorage.removeItem(SOLO_SESSION_TOKEN_KEY);
        }
    } catch (e) {
        /* storage unavailable; in-memory token still works for this session */
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
    clearRoomExpiryTimer();
    saveMultiplayerSession();
    try {
        localStorage.removeItem('sieglingsHostLobby');
    } catch (_error) {
        // ignore storage failures
    }
}

function clearRoomPolling() {
    if (roomPollHandle) {
        clearInterval(roomPollHandle);
        roomPollHandle = null;
    }
}

function clearRoomExpiryTimer() {
    if (roomExpiryTimeoutHandle) {
        clearTimeout(roomExpiryTimeoutHandle);
        roomExpiryTimeoutHandle = null;
    }
}

function scheduleRoomExpiryClose(status = currentRoomStatus) {
    clearRoomExpiryTimer();
    if (!status?.roomId || status.started || !status.expiresAt) {
        return;
    }
    const remainingMs = new Date(status.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remainingMs)) {
        return;
    }
    roomExpiryTimeoutHandle = setTimeout(() => {
        void closeUnfilledLobby('Lobby expired before another player joined.');
    }, Math.max(0, remainingMs));
}

async function closeUnfilledLobby(message = '') {
    const session = multiplayerSession;
    const status = currentRoomStatus;
    if (status?.started || gameState?.multiplayer) {
        return;
    }
    if (session?.roomId && session?.playerToken) {
        try {
            await fetchJson(apiUrls('/api/match/close'), {
                method: 'POST',
                headers: getAuthHeaders({
                    'Content-Type': 'application/json',
                    'X-Room-Id': session.roomId,
                    'X-Player-Token': session.playerToken
                }),
                body: JSON.stringify({ roomId: session.roomId })
            });
        } catch (e) {
            console.warn('Could not close expired lobby remotely; clearing local room.', e);
        }
    }
    clearMultiplayerSession();
    gameState = null;
    loadoutErrorMessage = message;
    if (welcomeDismissed) {
        renderLoadoutOptions();
        updateLoadoutSummary();
        syncEntryOverlays();
    }
}

async function leaveOnlineMatch() {
    const session = multiplayerSession;
    // Mulligan "Leave match" runs after the match has already started. /api/match/close
    // is a host-only lobby teardown with no started-match guard — host leave deletes the
    // room without a forfeit, and guest leave gets "Only the host…" then still cleared
    // local state, leaving the host stranded until Quit awards the absentee. Forfeit
    // first (same contract as Quit Match / Join With Code), then return to loadout.
    if (gameState?.multiplayer && session?.roomId && session?.playerToken) {
        if (!window.confirm('Leave this match? Your opponent will be notified and wins by forfeit.')) {
            return;
        }
        try {
            const data = await fetchJson(apiUrls('/api/match/forfeit'), {
                method: 'POST',
                headers: getAuthHeaders({
                    'Content-Type': 'application/json',
                    'X-Room-Id': session.roomId,
                    'X-Player-Token': session.playerToken
                })
            });
            if (!data || data.error) {
                window.alert(data?.error || 'Could not leave the match.');
                return;
            }
        } catch (e) {
            console.warn(e);
            window.alert('Could not leave the match.');
            return;
        }
        clearMultiplayerSession();
        gameState = null;
        mulliganSelectedIndices.clear();
        mulliganHandSig = '';
        // Quitting mid-reveal would otherwise leave the hold set and pin the
        // overlay open over the loadout screen.
        clearMulliganReveal();
        openLoadoutSelector();
        return;
    }
    if (session?.roomId && session?.playerToken) {
        try {
            await fetchJson(apiUrls('/api/match/close'), {
                method: 'POST',
                headers: getAuthHeaders({
                    'Content-Type': 'application/json',
                    'X-Room-Id': session.roomId,
                    'X-Player-Token': session.playerToken
                }),
                body: JSON.stringify({ roomId: session.roomId })
            });
        } catch (e) {
            console.warn('Could not close remote room; leaving locally.', e);
        }
    }
    clearMultiplayerSession();
    gameState = null;
    mulliganSelectedIndices.clear();
    mulliganHandSig = '';
    // Quitting mid-reveal would otherwise leave the hold set and pin the
    // overlay open over the loadout screen.
    clearMulliganReveal();
    openLoadoutSelector();
}
window.leaveOnlineMatch = leaveOnlineMatch;

function isActivePlaySession() {
    return Boolean(gameState && !gameState.gameOver);
}

function updateQuitOrNewGameButton() {
    const btn = document.getElementById('btnQuitOrNewGame');
    if (!btn) {
        return;
    }
    if (isActivePlaySession()) {
        btn.title = 'Quit';
        btn.setAttribute('aria-label', 'Quit match');
        btn.textContent = 'Quit';
        btn.classList.add('ab-quit-label');
    } else {
        btn.title = 'New Game';
        btn.setAttribute('aria-label', 'New Game');
        btn.textContent = '\u25B6';
        btn.classList.remove('ab-quit-label');
    }
}

function handleQuitOrNewGame() {
    if (isActivePlaySession()) {
        void confirmQuitMatch();
        return;
    }
    openLoadoutSelector();
}
window.handleQuitOrNewGame = handleQuitOrNewGame;

async function confirmQuitMatch() {
    const isOnline = Boolean(gameState?.multiplayer && multiplayerSession?.roomId);
    const message = isOnline
        ? 'Quit this match? Your opponent will be notified and wins by forfeit.'
        : 'Quit this match? You will lose.';
    if (!window.confirm(message)) {
        return;
    }
    if (isOnline) {
        const data = await fetchJson(apiUrls('/api/match/forfeit'), {
            method: 'POST',
            headers: getAuthHeaders({
                'Content-Type': 'application/json',
                'X-Room-Id': multiplayerSession.roomId,
                'X-Player-Token': multiplayerSession.playerToken
            })
        });
        if (!data || data.error) {
            console.warn(data?.error || 'Could not quit the online match.');
            return;
        }
        gameState = data;
        handleMatchStatusExtras(data);
        render();
        return;
    }
    if (soloSessionToken) {
        const data = await fetchJson(apiUrls('/api/game/forfeit'), {
            method: 'POST',
            headers: getAuthHeaders({
                'Content-Type': 'application/json',
                'X-Solo-Token': soloSessionToken
            })
        });
        if (!data || data.error) {
            console.warn(data?.error || 'Could not quit the solo match.');
            return;
        }
        gameState = data;
        render();
        return;
    }
    openLoadoutSelector();
}

function showMatchNoticeToast(message) {
    const toast = document.getElementById('matchNoticeToast');
    if (!toast || !message) {
        return;
    }
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('visible');
    if (matchNoticeToastTimer) {
        clearTimeout(matchNoticeToastTimer);
    }
    matchNoticeToastTimer = setTimeout(() => {
        toast.classList.remove('visible');
        matchNoticeToastTimer = setTimeout(() => {
            toast.hidden = true;
        }, 280);
    }, 4200);
}

function handleMatchStatusExtras(data) {
    if (!data) {
        return;
    }
    const seq = Number(data.endGameNoticeSeq || 0);
    if (seq > lastEndGameNoticeSeq) {
        lastEndGameNoticeSeq = seq;
        if (data.endGameNotice) {
            showMatchNoticeToast(data.endGameNotice);
        }
    }
}

function resetGameOverOverlayState() {
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) {
        overlay.classList.remove('visible');
        delete overlay.dataset.soundPlayed;
    }
    lastEndGameNoticeSeq = 0;
}

// Set while the end screen is waiting on the death animations, so repeated
// renders (the state re-renders several times as the queue drains) queue exactly
// one wait instead of stacking a timer per render.
let gameOverAwaitingPlayback = false;

function renderGameOverOverlay() {
    const overlay = document.getElementById('gameOverOverlay');
    if (!overlay || !gameState?.gameOver) {
        overlay?.classList.remove('visible');
        gameOverAwaitingPlayback = false;
        return;
    }

    // The server declares the win the moment the last Siegeling drops, but the
    // action queue is still playing those deaths and the Siege Damage that
    // finishes the opponent off. Showing VICTORY over the top of that hides the
    // very thing the player earned — so wait for the playback to drain first.
    // Applies to every Arena match, not just the tutorial.
    const queue = window.SieglingsActionQueue;
    if (queue?.isPresentationBusy?.()) {
        if (!gameOverAwaitingPlayback) {
            gameOverAwaitingPlayback = true;
            queue.onIdle().then(() => {
                gameOverAwaitingPlayback = false;
                // Re-check: a rematch may have cleared the result while we waited.
                if (gameState?.gameOver) renderGameOverOverlay();
            });
        }
        return;
    }
    gameOverAwaitingPlayback = false;

    overlay.classList.add('visible');
    const endScreen = gameState.endScreen || {};
    const isOnline = Boolean(gameState.multiplayer && multiplayerSession?.roomId);
    const result = endScreen.result
        || (gameState.winner === 'Draw'
            ? 'DRAW'
            : (gameState.winner === (gameState.playerName || 'Player') ? 'WIN' : 'LOSS'));

    let title = 'GAME OVER';
    if (result === 'WIN') {
        title = 'VICTORY!';
    } else if (result === 'LOSS') {
        title = 'DEFEAT';
    } else if (result === 'DRAW') {
        title = 'DRAW';
    }

    if (!overlay.dataset.soundPlayed) {
        overlay.dataset.soundPlayed = '1';
        window.SieglingsSounds?.play(result === 'WIN' ? 'win' : 'lose');
    }
    if (tutorialMatchActive && result === 'WIN' && authState?.token) {
        void claimTutorialReward();
    }

    document.getElementById('gameOverTitle').textContent = title;
    const msgEl = document.getElementById('gameOverMsg');
    if (endScreen.endReason === 'FORFEIT' && endScreen.forfeitedBy) {
        msgEl.textContent = `${endScreen.forfeitedBy} quit. ${gameState.winner} wins!`;
    } else {
        msgEl.textContent = gameState.winner === 'Draw'
            ? 'Both players were defeated.'
            : `${gameState.winner} wins!`;
    }

    const subtext = document.getElementById('gameOverSubtext');
    if (subtext) {
        subtext.textContent = isOnline
            ? `Match vs ${endScreen.opponentName || gameState.enemyName || 'opponent'}`
            : (endScreen.matchType === 'SOLO' ? 'Solo campaign battle' : '');
    }

    const stats = endScreen.stats || {};
    const statsEl = document.getElementById('gameOverStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <h3>Match Totals</h3>
            <div class="game-over-stat-grid">
                <span>Turns</span><span>${endScreen.turns ?? gameState.turnNumber ?? 0}</span>
                <span>Strategies used</span><span>${stats.spellsCast ?? 0}</span>
                <span>Deceptions sprung</span><span>${stats.trapsSprung ?? 0}</span>
                <span>Siegelings defeated</span><span>${stats.siegelingsDefeated ?? 0}</span>
                <span>Your health</span><span>${stats.yourHealth ?? 0}</span>
                <span>Opponent health</span><span>${stats.opponentHealth ?? 0}</span>
                <span>Your internal energy</span><span>${stats.yourInternalEnergy ?? 0}</span>
                <span>Your external energy</span><span>${stats.yourExternalEnergy ?? 0}</span>
            </div>`;
    }

    const rewardsEl = document.getElementById('gameOverRewards');
    if (rewardsEl) {
        const gold = Number(endScreen.goldEarned || 0);
        const remnants = Number(endScreen.remnantsEarned || 0);
        const streakBonus = Number(endScreen.streakBonus || 0);
        // Guests (and any not-yet-signed-in viewer) see what they *could* have
        // earned, framed as a preview that nudges them to sign in to claim it.
        const guestPreview = Boolean(endScreen.guestPreview);
        const heading = guestPreview ? 'Potential Rewards' : 'Rewards';
        const earnLabel = guestPreview ? 'could earn' : 'earned';
        const note = guestPreview
            ? `<p class="game-over-rewards-note">Sign in to claim these rewards!</p>`
            : '';
        rewardsEl.innerHTML = `
            <h3>${heading}</h3>
            <div class="game-over-stat-grid">
                <span>Siegecoins ${earnLabel}</span><span>${gold}</span>
                <span>Remnants ${earnLabel}</span><span>${remnants}</span>
                <span>Streak bonus</span><span>${streakBonus}</span>
            </div>${note}`;
        rewardsEl.classList.toggle('is-guest-preview', guestPreview);
    }

    const recordEl = document.getElementById('gameOverRecord');
    const record = endScreen.record;
    if (recordEl) {
        if (record && record.total > 0) {
            recordEl.innerHTML = `
                <h3>Your Record</h3>
                <div class="game-over-stat-grid">
                    <span>Wins</span><span>${record.wins}</span>
                    <span>Losses</span><span>${record.losses}</span>
                    <span>Win rate</span><span>${record.winRate}%</span>
                    <span>Recent battles</span><span>${record.total}</span>
                </div>`;
            recordEl.hidden = false;
        } else {
            recordEl.innerHTML = '';
            recordEl.hidden = true;
        }
    }

    const rematchStatus = document.getElementById('gameOverRematchStatus');
    const btnRematch = document.getElementById('btnGameOverRematch');
    const btnPlayAgain = document.getElementById('btnGameOverPlayAgain');
    const btnMainMenu = document.getElementById('btnGameOverMainMenu');
    const rematchBlocked = Boolean(gameState.rematchBlocked);
    const youReady = Boolean(gameState.youRematchReady);
    const opponentReady = Boolean(gameState.opponentRematchReady);
    const opponentLeft = Boolean(gameState.opponentReturnedHome);

    if (btnRematch) {
        btnRematch.hidden = !isOnline;
        btnRematch.disabled = rematchBlocked || opponentLeft;
        btnRematch.textContent = youReady ? 'Rematch selected' : 'Rematch';
        btnRematch.classList.toggle('btn-primary', !youReady);
    }
    // The tutorial's win is the natural moment to offer the deeper chapter, and
    // it needs a REAL match to be taught in — the finished one cannot be played.
    // Only on a win: losing the practice match and being offered "advanced" reads
    // as a taunt.
    const btnAdvanced = document.getElementById('btnGameOverAdvanced');
    if (btnAdvanced) {
        btnAdvanced.hidden = !(tutorialMatchActive && result === 'WIN');
    }

    if (btnPlayAgain) {
        btnPlayAgain.hidden = isOnline;
    }
    if (btnMainMenu) {
        btnMainMenu.hidden = false;
    }
    if (rematchStatus) {
        if (!isOnline) {
            rematchStatus.textContent = '';
        } else if (opponentLeft) {
            rematchStatus.textContent = 'Your opponent returned to the main menu. Rematch is unavailable.';
        } else if (rematchBlocked) {
            rematchStatus.textContent = 'Rematch closed.';
        } else if (youReady && opponentReady) {
            rematchStatus.textContent = 'Both players chose rematch. Starting a new battle…';
        } else if (youReady) {
            rematchStatus.textContent = 'Waiting for your opponent to choose rematch…';
        } else if (opponentReady) {
            rematchStatus.textContent = 'Your opponent wants a rematch. Select Rematch to continue.';
        } else {
            rematchStatus.textContent = 'Choose rematch or return to the main menu.';
        }
    }
}

async function requestRematch() {
    if (!multiplayerSession?.roomId || !multiplayerSession?.playerToken) {
        return;
    }
    const btn = document.getElementById('btnGameOverRematch');
    if (btn) {
        btn.disabled = true;
    }
    const data = await fetchJson(apiUrls('/api/match/rematch'), {
        method: 'POST',
        headers: getAuthHeaders({
            'Content-Type': 'application/json',
            'X-Room-Id': multiplayerSession.roomId,
            'X-Player-Token': multiplayerSession.playerToken
        })
    });
    if (btn) {
        btn.disabled = false;
    }
    if (!data || data.error) {
        showMatchNoticeToast(data?.error || 'Rematch is not available.');
        return;
    }
    handleMatchStatusExtras(data);
    gameState = data;
    if (data.rematchStarted) {
        resetGameOverOverlayState();
        lastProfileRefreshKey = '';
        render();
        return;
    }
    render();
}
window.requestRematch = requestRematch;

async function leaveEndScreenToHome() {
    const wasOnline = Boolean(gameState?.multiplayer && multiplayerSession?.roomId && multiplayerSession?.playerToken);
    if (wasOnline) {
        await fetchJson(apiUrls('/api/match/end-home'), {
            method: 'POST',
            headers: getAuthHeaders({
                'Content-Type': 'application/json',
                'X-Room-Id': multiplayerSession.roomId,
                'X-Player-Token': multiplayerSession.playerToken
            })
        });
        clearMultiplayerSession();
        clearRoomPolling();
    }
    resetGameOverOverlayState();
    gameState = null;
    if (wasOnline) {
        window.location.href = '/home';
        return;
    }
    returnToPlayMain();
}
window.leaveEndScreenToHome = leaveEndScreenToHome;

function loadSavedAuthToken() {
    try {
        return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
}

// Read the cached profile snapshot so the signed-in UI can paint immediately on
// load. Returns null if it's missing, malformed, not authenticated, or stale.
function loadCachedAuthProfile() {
    try {
        const raw = localStorage.getItem(AUTH_PROFILE_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const entry = JSON.parse(raw);
        if (!entry?.profile?.authenticated) {
            return null;
        }
        if (entry.savedAt && Date.now() - entry.savedAt > AUTH_PROFILE_CACHE_MAX_AGE_MS) {
            return null;
        }
        return entry.profile;
    } catch (e) {
        return null;
    }
}

// Strip the heavy, rarely-needed fields from a profile before caching it. The
// /api/auth/me payload embeds the FULL game log of every recorded match, which
// can run to several megabytes — well past the ~5MB localStorage quota. When the
// write throws QuotaExceededError it used to be swallowed silently, so the cache
// never persisted and the Play page fell back to the "Restoring your account…"
// takeover on every single visit. The welcome card only needs match metadata
// (result/labels/health), never the per-line log, so we drop the logs for the
// cached copy. The live in-memory profile keeps its logs, so the match-detail
// modal still works once the background /api/auth/me refresh lands.
function slimProfileForCache(profile) {
    if (!profile) {
        return profile;
    }
    // Never persist the bearer token. The httpOnly-cookie migration keeps the
    // credential out of page-script reach, but the login response body still
    // carries `token` for legacy clients — strip it so it can't leak into
    // localStorage via the cached profile.
    const { token, ...rest } = profile;
    if (!Array.isArray(rest.matchHistory)) {
        return rest;
    }
    return {
        ...rest,
        matchHistory: rest.matchHistory.map((entry) => {
            if (!entry || !('gameLog' in entry)) {
                return entry;
            }
            const { gameLog, ...rest } = entry;
            return rest;
        })
    };
}

function saveCachedAuthProfile(profile) {
    try {
        if (!profile?.authenticated) {
            localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
            return;
        }
        const savedAt = Date.now();
        const slim = slimProfileForCache(profile);
        try {
            localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify({ savedAt, profile: slim }));
        } catch (quotaError) {
            // Still too big (huge deck/match counts): fall back to the bare minimum
            // the signed-in UI needs so SOMETHING always persists and the Play page
            // can paint signed-in instead of looping on "Restoring your account…".
            const minimal = {
                authenticated: true,
                user: slim.user,
                progression: slim.progression,
                savedDecks: slim.savedDecks || [],
                matchHistory: []
            };
            localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify({ savedAt, profile: minimal }));
        }
    } catch (e) {
        // The profile cache is a render optimization only.
    }
}

function clearCachedAuthProfile() {
    try {
        localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
    } catch (e) {
        // ignore
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

// Clears only the in-memory auth profile, leaving the persisted token intact.
// Used when an /api/auth/me check comes back unauthenticated so a transient or
// stale response can't sign the player out across every page (the token is
// shared with the hub via localStorage).
function clearAuthProfile() {
    authState.profile = null;
    authState.error = '';
    selectedSavedDeckId = null;
    // Drop the optimistic snapshot once we have positive evidence it's invalid,
    // so we don't keep flashing a signed-in card. The token is kept by callers
    // that want a later successful /api/auth/me to restore the session.
    clearCachedAuthProfile();
    renderAuthDependentSurfaces();
}

// Full sign-out: removes the shared token too. Reserve this for explicit Log Out
// and the deliberate guest flow — never a background auth refresh.
function clearAuthState() {
    saveAuthToken('');
    clearAuthProfile();
    // The cached card-editor state is user-specific; drop it on explicit logout
    // so the next account doesn't briefly paint from the previous one's cache.
    try {
        localStorage.removeItem(PLAY_CACHE_PREFIX + 'cardsEditor');
    } catch (e) {
        // ignore
    }
}

function renderAuthDependentSurfaces() {
    renderWelcomeAuth();
    renderSavedDecks();
    if (gameOptions) {
        ensureOwnedTrainerSelected();
        renderLoadoutOptions();
        updateLoadoutSummary();
    }
}

async function refreshAuthFromStorage(silent = true) {
    // Same cookie fallback as init: a live httpOnly session whose localStorage
    // marker is missing must not be wiped on focus/pageshow/storage.
    const stored = loadSavedAuthToken() || (hasReadableAuthCookie() ? COOKIE_SESSION_VALUE : '');
    const tokenChanged = stored !== authState.token;
    const profileStale = Boolean(stored) && !authState.profile?.authenticated;
    const loggedOutElsewhere = !stored && Boolean(authState.profile?.authenticated);
    if (!tokenChanged && !profileStale && !loggedOutElsewhere) {
        return authState.profile;
    }

    authState.token = stored;
    if (!stored) {
        authState.profile = null;
        authState.error = '';
        selectedSavedDeckId = null;
        clearCachedAuthProfile();
        renderAuthDependentSurfaces();
        return null;
    }

    await syncAuthProfile(silent);
    renderAuthDependentSurfaces();
    return authState.profile;
}

function bindAuthStorageSync() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            void refreshAuthFromStorage(true);
        }
    });
    window.addEventListener('pageshow', () => {
        void refreshAuthFromStorage(true);
    });
    window.addEventListener('focus', () => {
        void refreshAuthFromStorage(true);
    });
    window.addEventListener('storage', (event) => {
        if (event.key === AUTH_TOKEN_STORAGE_KEY || event.key === null) {
            void refreshAuthFromStorage(true);
        }
    });
}

function renderPlayHubAuth() {
    // Coins / friends badges in the play HUD ride the same account snapshot
    // (play-hud.js is only present on play.html).
    window.SieglingsPlayHud?.syncAuth();
    const pill = document.querySelector('.play-hub-pill');
    if (!pill) {
        return;
    }
    if (authState.profile?.authenticated) {
        const name = authState.profile.user?.displayName || 'Profile';
        pill.textContent = name;
        pill.href = '/profile';
        pill.onclick = null;
        pill.classList.add('is-authenticated');
        pill.setAttribute('aria-label', `Signed in as ${name}. Open profile.`);
        return;
    }
    // Session still restoring (token present, /me pending): don't show "Sign In",
    // which reads as logged out. Show a neutral loading label instead.
    if (authState.token && !authState.profileResolved) {
        pill.textContent = 'Loading…';
        pill.href = '/profile';
        pill.onclick = (event) => event.preventDefault();
        pill.classList.remove('is-authenticated');
        pill.setAttribute('aria-label', 'Restoring your session.');
        return;
    }
    pill.textContent = 'Sign In';
    // Open the sign-in popup in place rather than navigating to the hub profile,
    // so "Sign In" is a popup on every page. The href stays as a no-JS fallback.
    pill.href = '/profile';
    pill.onclick = (event) => {
        event.preventDefault();
        openAuthPopup('login');
    };
    pill.classList.remove('is-authenticated');
    pill.removeAttribute('aria-label');
}

function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    // Cookie-mode sessions authenticate via the httpOnly cookie the browser sends
    // automatically, so only attach a Bearer header for a real legacy token.
    if (isLegacyBearerToken(authState.token) && !headers.Authorization) {
        headers.Authorization = `Bearer ${authState.token}`;
    }
    return headers;
}

function getJoinRoomCodeFromUrl() {
    return new URLSearchParams(window.location.search).get('room');
}

function isInviteJoinFlow() {
    return Boolean(socialOnlineLaunchRoomId);
}

function isSocialBattleLaunch() {
    return Boolean(socialOnlineLaunchRoomId || multiplayerSession?.roomId);
}

function shouldShowOnlineLoadoutOnPlay() {
    return true;
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

function setLoadoutPlayerName(name, persist = false) {
    const safe = String(name || '').trim().slice(0, 20);
    const input = document.getElementById('playerNameInput');
    if (input) {
        input.value = safe;
    }
    if (persist) {
        savePlayerName(safe);
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

    document.body?.classList.toggle('gameplay-active', showingGameplay);
    welcomeOverlay?.classList.toggle('visible', welcomeVisible);
    loadoutOverlay?.classList.toggle('visible', !showingGameplay && welcomeDismissed);
    // Second hide path. The redraw reveal outlives the server's mulligan, so it
    // has to be honoured here too or the overlay would be pulled out from under
    // the cards the player is being shown.
    if (!gameState?.mulligan?.active && !mulliganRevealHold) {
        mulliganOverlay?.classList.remove('visible');
    }
    if (welcomeVisible) {
        refreshWelcomeLeaderboards();
    }
    if (gameState) {
        updateSafeAreaHpStrip(gameState);
    } else {
        const strip = document.getElementById('safeHpStrip');
        if (strip) {
            strip.hidden = true;
            strip.setAttribute('aria-hidden', 'true');
        }
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

function setWelcomeLeaderboardPeriod(periodId) {
    welcomeLeaderboardState.period = periodId;
    renderWelcomeLeaderboards();
}

function renderWelcomeLeaderboards() {
    const meta = document.getElementById('welcomeLeaderboardsMeta');
    const tabsEl = document.getElementById('welcomeLeaderboardsTabs');
    const body = document.getElementById('welcomeLeaderboardsBody');
    if (!meta || !tabsEl || !body) {
        return;
    }

    const boards = welcomeLeaderboardBoards();
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

    const periodTabs = LEADERBOARD_PERIODS.map((entry) => {
        const active = welcomeLeaderboardState.period === entry.id ? ' active' : '';
        return `<button type="button" class="welcome-lb-period-tab${active}" role="tab" aria-selected="${welcomeLeaderboardState.period === entry.id}" onclick="setWelcomeLeaderboardPeriod('${entry.id}')">${escapeHtml(entry.label)}</button>`;
    }).join('');
    const categoryTabs = LEADERBOARD_TABS.map((t) => {
        const active = welcomeLeaderboardState.tab === t.id ? ' active' : '';
        return `<button type="button" class="welcome-lb-tab${active}" role="tab" aria-selected="${welcomeLeaderboardState.tab === t.id}" onclick="setWelcomeLeaderboardTab('${t.id}')">${escapeHtml(t.label)}</button>`;
    }).join('');
    tabsEl.innerHTML = `<div class="welcome-lb-period-tabs">${periodTabs}</div><div class="welcome-lb-category-tabs">${categoryTabs}</div>`;

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

// When entering a battle flow without a confirmed account, make sure no lingering
// auth token rides along on /api/game/new. The welcome overlay only shows the
// guest/sign-in card (and the Solo Battle button) when no authenticated profile is
// loaded; if /api/auth/me failed on a network blip the token is left in place and
// would otherwise still be sent as a Bearer header, making the server resolve a stale
// account and gate SiegeKnight ownership while the UI shows guest affordances. Guarded
// on `authenticated` so a genuinely signed-in player keeps their token (and knight
// progression) untouched.
function dropStaleGuestToken() {
    // Only drop the shared token once /api/auth/me has returned a *definitive*
    // answer (profileResolved). During the "Restoring your account…" window the
    // profile is not authenticated yet simply because the check is still in flight
    // — the token may belong to a perfectly valid session. Wiping it here (e.g. a
    // signed-in player tapping "Battle" before the restore settles) clears the
    // token from localStorage and logs them out on every page, since the hub and
    // Play page share it. A genuinely stale token is harmless: the server resolves
    // a missing/expired session to a guest anyway (AccountService.findUser returns
    // null), so we lose nothing by letting an unresolved token ride along until we
    // actually know it is invalid.
    if (authState.profileResolved && !authState.profile?.authenticated && (authState.token || authState.profile)) {
        clearAuthState();
    }
}

function playAsGuest() {
    authState.error = '';
    // Explicitly continuing as a guest: drop any lingering/expired token so the server
    // treats this as a true guest session (user == null → no ownership gate, every
    // SiegeKnight is selectable).
    dropStaleGuestToken();
    dismissWelcome();
}

function startPlaySolo() {
    matchMode = 'solo';
    tutorialMatchActive = false;
    onlineRoomMode = 'create';
    resetPlayLobbyState(false);
    dropStaleGuestToken();
    dismissWelcome();
}

// Siege is the upcoming roguelike mode where SiegeKnight levels carry into
// every fight. The progression logic already exists (see PlayerProgressionService
// / GameService.applyTrainerLevel) but the mode is not yet playable, so the entry
// button just lets players know it is on the way.
function announceSiegeComingSoon() {
    showComingSoonToast('Siege is the upcoming roguelike mode — your SiegeKnight levels will matter there. Coming soon!');
}

// Neutral, info-styled cousin of showErrorToast for non-error announcements.
function showComingSoonToast(message, holdMs = 4200) {
    const text = String(message == null ? '' : message).trim();
    if (!text || typeof document === 'undefined' || !document.body) return;

    let stack = document.getElementById('sglErrorToastStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'sglErrorToastStack';
        stack.style.cssText = [
            'position:fixed',
            'top:max(16px, env(safe-area-inset-top, 0px))',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:2147483000',
            'display:flex',
            'flex-direction:column',
            'align-items:center',
            'gap:8px',
            'width:min(560px, 92vw)',
            'pointer-events:none'
        ].join(';');
        document.body.appendChild(stack);
    }

    const node = document.createElement('div');
    node.setAttribute('role', 'status');
    node.style.cssText = [
        'pointer-events:auto',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'width:100%',
        'box-sizing:border-box',
        'padding:12px 16px',
        'border-radius:12px',
        'background:linear-gradient(180deg, rgba(12,20,40,0.97), rgba(8,14,28,0.97))',
        'border:1px solid rgba(226,183,20,0.55)',
        'box-shadow:0 10px 30px rgba(0,0,0,0.45)',
        'color:#f0f4ff',
        'font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'
    ].join(';');
    node.textContent = text;
    stack.appendChild(node);
    window.setTimeout(() => node.remove(), Math.max(1200, holdMs));
}

function resetPlayLobbyState(shouldRender = true) {
    if (playLobbyCountdownTimer) {
        clearInterval(playLobbyCountdownTimer);
        playLobbyCountdownTimer = null;
    }
    if (playLobbyOpponentTimer) {
        clearTimeout(playLobbyOpponentTimer);
        playLobbyOpponentTimer = null;
    }
    playLobbyState = {
        active: false,
        mode: 'create',
        ready: false,
        opponentReady: false,
        countdown: 0,
        chatMessages: []
    };
    if (shouldRender) {
        renderPlayLobby();
    }
}

function openPlayLobby(mode = 'create') {
    matchMode = 'online';
    tutorialMatchActive = false;
    onlineRoomMode = mode === 'join' ? 'join' : 'create';
    playLobbyState.active = true;
    playLobbyState.mode = onlineRoomMode;
    playLobbyState.ready = false;
    playLobbyState.opponentReady = onlineRoomMode === 'join';
    playLobbyState.countdown = 0;
    playLobbyState.chatMessages = defaultLobbyMessages();
    const roomInput = document.getElementById('playLobbyRoomCodeInput');
    const loadoutRoomInput = document.getElementById('roomCodeInput');
    if (roomInput && loadoutRoomInput && loadoutRoomInput.value) {
        roomInput.value = loadoutRoomInput.value;
    }
    renderPlayLobby();
}

function defaultLobbyMessages() {
    const name = getPlayEntryName();
    if (onlineRoomMode === 'join') {
        return [
            { by: 'system', text: 'Invite found. Confirm when both players are ready to pick loadouts.' },
            { by: 'opponent', text: 'I am here. Let us lock in.' }
        ];
    }
    return [
        { by: 'system', text: `${name} opened a 1v1 lobby.` },
        { by: 'system', text: 'Share the invite code, chat while you wait, then both players confirm.' }
    ];
}

function getPlayEntryName() {
    return authState.profile?.user?.displayName || loadSavedPlayerName() || 'You';
}

function getPlayEntryEmail() {
    return authState.profile?.user?.email || 'Guest session';
}

function renderPlayLobby() {
    const card = document.getElementById('playLobbyCard');
    if (!card) {
        return;
    }
    const active = playLobbyState.active;
    const mode = playLobbyState.mode || onlineRoomMode || 'create';
    const joinCode = getJoinRoomCodeFromUrl()?.toUpperCase() || '';
    const lobbyCode = currentRoomStatus?.roomId || joinCode || document.getElementById('playLobbyRoomCodeInput')?.value?.trim()?.toUpperCase() || '';
    const opponentName = mode === 'join' ? 'Inviting Player' : (playLobbyState.opponentReady ? 'Opponent' : 'Waiting...');
    const statusText = active
        ? playLobbyState.countdown > 0
            ? `Selection opens in ${playLobbyState.countdown}`
            : playLobbyState.ready && playLobbyState.opponentReady
                ? 'Both players confirmed. Starting selection.'
                : playLobbyState.ready
                    ? 'You confirmed. Waiting on the other player.'
                    : 'Enter the room, chat, and confirm when ready.'
        : 'Create or join a 1v1 lobby to stage the match before loadout selection.';
    const chatMessages = active && playLobbyState.chatMessages.length
        ? playLobbyState.chatMessages
        : active
            ? defaultLobbyMessages()
            : [{ by: 'system', text: 'Create or join a lobby to open the chat room and ready check.' }];

    card.innerHTML = `
        <div class="play-lobby-head">
            <div>
                <span class="welcome-card-kicker">${active ? (mode === 'join' ? 'Joined Lobby' : 'Lobby Open') : 'Lobby'}</span>
                <h3>${active ? 'Pre-match room' : 'Create a room experience'}</h3>
            </div>
            <span class="play-lobby-code">${escapeHtml(lobbyCode || (mode === 'join' ? 'Enter code' : 'Code after loadout'))}</span>
        </div>
        <div class="play-lobby-status">${escapeHtml(statusText)}</div>
        <div class="play-lobby-players">
            ${renderLobbyPlayerCard('You', getPlayEntryName(), getPlayEntryEmail(), playLobbyState.ready)}
            ${renderLobbyPlayerCard('Opponent', opponentName, mode === 'join' ? 'Connected by invite' : 'Invite pending', playLobbyState.opponentReady)}
        </div>
        <div class="play-lobby-controls${active ? '' : ' is-muted'}">
            <label class="online-field ${mode === 'join' ? '' : 'hidden'}">
                <span>Lobby Code</span>
                <input type="text" id="playLobbyRoomCodeInput" maxlength="6" placeholder="ABC123" value="${escapeHtmlAttribute(lobbyCode)}" oninput="syncPlayLobbyRoomCode()">
            </label>
            <div class="play-lobby-chat">
                <div class="play-lobby-chat-log">
                    ${chatMessages.map(renderLobbyChatMessage).join('')}
                </div>
                <form class="play-lobby-chat-form" onsubmit="sendPlayLobbyChat(event)">
                    <input type="text" id="playLobbyChatInput" maxlength="96" placeholder="Message lobby" ${active ? '' : 'disabled'}>
                    <button class="btn" type="submit" ${active ? '' : 'disabled'}>Send</button>
                </form>
            </div>
            <div class="play-lobby-actions">
                <button class="btn welcome-dashboard-btn" type="button" onclick="openPlayLobby('${mode === 'join' ? 'create' : 'join'}')">${mode === 'join' ? 'Host Instead' : 'Join Instead'}</button>
                <button class="btn welcome-guest-btn" type="button" onclick="resetPlayLobbyState()">Cancel</button>
                <button class="btn btn-primary" type="button" ${active ? '' : 'disabled'} onclick="confirmPlayLobbyReady()">${playLobbyState.ready ? 'Ready Confirmed' : 'Confirm Ready'}</button>
            </div>
        </div>
    `;
}

function renderLobbyPlayerCard(role, name, detail, ready) {
    return `<article class="play-lobby-player${ready ? ' is-ready' : ''}">
        <span>${escapeHtml(role)}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(detail)}</small>
        <em>${ready ? 'Ready' : 'Not ready'}</em>
    </article>`;
}

function renderLobbyChatMessage(message) {
    const by = message.by === 'opponent' ? 'Opponent' : message.by === 'you' ? 'You' : 'System';
    return `<div class="play-lobby-chat-row ${escapeHtmlAttribute(message.by || 'system')}"><strong>${escapeHtml(by)}</strong><span>${escapeHtml(message.text || '')}</span></div>`;
}

function syncPlayLobbyRoomCode() {
    const value = document.getElementById('playLobbyRoomCodeInput')?.value?.trim()?.toUpperCase() || '';
    const loadoutInput = document.getElementById('roomCodeInput');
    if (loadoutInput) {
        loadoutInput.value = value;
    }
}

function sendPlayLobbyChat(event) {
    event?.preventDefault?.();
    const input = document.getElementById('playLobbyChatInput');
    const text = input?.value?.trim() || '';
    if (!text) {
        return;
    }
    playLobbyState.chatMessages.push({ by: 'you', text });
    if (input) {
        input.value = '';
    }
    renderPlayLobby();
}

function confirmPlayLobbyReady() {
    if (!playLobbyState.active || playLobbyState.countdown > 0) {
        return;
    }
    playLobbyState.ready = true;
    if (!playLobbyState.opponentReady) {
        playLobbyState.chatMessages.push({ by: 'system', text: 'You confirmed. Waiting for the other player to confirm.' });
        playLobbyOpponentTimer = setTimeout(() => {
            playLobbyState.opponentReady = true;
            playLobbyState.chatMessages.push({ by: 'opponent', text: 'Ready on my side.' });
            beginPlayLobbyCountdown();
        }, 800);
        renderPlayLobby();
        return;
    }
    beginPlayLobbyCountdown();
}

function beginPlayLobbyCountdown() {
    if (!playLobbyState.ready || !playLobbyState.opponentReady || playLobbyCountdownTimer) {
        renderPlayLobby();
        return;
    }
    playLobbyState.countdown = 3;
    renderPlayLobby();
    playLobbyCountdownTimer = setInterval(() => {
        playLobbyState.countdown -= 1;
        if (playLobbyState.countdown <= 0) {
            clearInterval(playLobbyCountdownTimer);
            playLobbyCountdownTimer = null;
            playLobbyState.active = false;
            playLobbyState.countdown = 0;
            syncPlayLobbyRoomCode();
            dismissWelcome();
            return;
        }
        renderPlayLobby();
    }, 900);
}

function setAuthMode(mode) {
    authMode = mode;
    authRegisterStep = 'credentials';
    authState.error = '';
    renderAuthPopup();
}

function beginRegisterDisplayName() {
    const email = document.getElementById('welcomeEmailInput')?.value?.trim() || '';
    const password = document.getElementById('welcomePasswordInput')?.value || '';
    if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
        authState.error = 'Enter a valid email address.';
        renderAuthPopup();
        return;
    }
    if (!password || password.length < 6) {
        authState.error = 'Passwords must be at least 6 characters.';
        renderAuthPopup();
        return;
    }
    registerDraft = { email, password };
    authRegisterStep = 'display-name';
    authState.error = '';
    renderAuthPopup();
}

function backRegisterCredentials() {
    authRegisterStep = 'credentials';
    authState.error = '';
    renderAuthPopup();
}

// Open the sign-in popup over the Play screen (no navigation away).
function openAuthPopup(mode) {
    authMode = mode === 'register' ? 'register' : 'login';
    authRegisterStep = 'credentials';
    authState.error = '';
    authState.loading = false;
    authPopupOpen = true;
    renderAuthPopup();
}

function closeAuthPopup(event) {
    if (event) {
        // Only close when the backdrop or the close button is clicked,
        // not when interacting with the form itself.
        const overlay = document.getElementById('authPopupOverlay');
        if (event.target !== overlay && !event.target.closest('.auth-popup-close')) {
            return;
        }
    }
    authPopupOpen = false;
    authState.error = '';
    authRegisterStep = 'credentials';
    document.getElementById('authPopupOverlay')?.classList.add('hidden');
}

// Builds the credential / display-name form shared by the popup.
function buildAuthFormMarkup() {
    const draftEmail = document.getElementById('welcomeEmailInput')?.value || registerDraft.email || '';
    const draftDisplayName = document.getElementById('welcomeDisplayNameInput')?.value || '';
    const draftPassword = document.getElementById('welcomePasswordInput')?.value || registerDraft.password || '';
    const draftResetCode = document.getElementById('welcomeResetCodeInput')?.value || '';
    const onRegisterNameStep = authMode === 'register' && authRegisterStep === 'display-name';

    if (onRegisterNameStep) {
        return `
            <div class="welcome-eyebrow">ACCOUNT</div>
            <h3>Choose your display name</h3>
            <div class="welcome-auth-meta">${escapeHtml(registerDraft.email)}</div>
            <label class="online-field">
                <span>Display Name</span>
                <input type="text" id="welcomeDisplayNameInput" maxlength="20" placeholder="Arena name" value="${escapeHtmlAttribute(draftDisplayName)}" autofocus>
            </label>
            ${authState.error ? `<div class="welcome-auth-error">${escapeHtml(authState.error)}</div>` : ''}
            <div class="welcome-auth-actions">
                <button class="btn welcome-auth-submit" type="button" ${authState.loading ? 'disabled' : ''} onclick="backRegisterCredentials()">Back</button>
                <button class="btn btn-primary welcome-auth-submit" type="button" ${authState.loading ? 'disabled' : ''} onclick="submitAuth('register')">
                    ${authState.loading ? 'Working...' : 'Confirm'}
                </button>
            </div>
        `;
    }

    const primaryAuthAction = authMode === 'register'
        ? 'beginRegisterDisplayName()'
        : `submitAuth('${authMode}')`;
    return `
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
            <button class="btn btn-primary welcome-auth-submit" type="button" ${authState.loading ? 'disabled' : ''} onclick="${primaryAuthAction}">
                ${authState.loading ? 'Working...' : (authMode === 'login' ? 'Log In' : 'Register')}
            </button>
        </div>
    `;
}

function renderAuthPopup() {
    const overlay = document.getElementById('authPopupOverlay');
    const body = document.getElementById('authPopupBody');
    if (!overlay || !body) {
        return;
    }
    overlay.classList.toggle('hidden', !authPopupOpen);
    if (!authPopupOpen) {
        return;
    }
    body.innerHTML = buildAuthFormMarkup();
    if (!authState.loading) {
        const firstInput = body.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 0);
        }
    }
}

async function submitAuth(mode) {
    const onRegisterNameStep = mode === 'register' && authRegisterStep === 'display-name';
    const email = onRegisterNameStep
        ? registerDraft.email
        : document.getElementById('welcomeEmailInput')?.value?.trim() || '';
    const password = onRegisterNameStep
        ? registerDraft.password
        : document.getElementById('welcomePasswordInput')?.value || '';
    const displayName = document.getElementById('welcomeDisplayNameInput')?.value?.trim() || '';
    const resetCode = document.getElementById('welcomeResetCodeInput')?.value || '';
    authState.loading = true;
    authState.error = '';
    renderAuthPopup();

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
        renderAuthPopup();
        return;
    }

    // Keep the real token (sent as a Bearer header) until the server confirms a
    // session cookie reaches it; only then does the sentinel replace it. That way
    // auth survives cross-page navigation to Home / My Keep / Siege regardless of
    // what an edge CDN does with cookies.
    saveAuthToken(preferredStoredToken(data.token));
    authState.profile = data;
    authState.profileResolved = true;
    saveCachedAuthProfile(data);
    authState.error = '';
    authRegisterStep = 'credentials';
    registerDraft = { email: '', password: '' };
    // Sign in completes in place on the Play screen — close the popup and
    // refresh the account card / loadout without navigating away.
    authPopupOpen = false;
    document.getElementById('authPopupOverlay')?.classList.add('hidden');
    hydrateSavedPlayerName();
    renderWelcomeAuth();
    renderSavedDecks();
    renderLoadoutOptions();
    updateLoadoutSummary();
}

// Single source of truth for interpreting an /api/auth/me response, mirrored in
// home.js. Sessions are only ever dropped on an AUTHORITATIVE answer — never on a
// transient failure. Returns 'signed-in', 'signed-out', or 'unknown' (request
// failed or body malformed -> session NOT proven gone, so keep it). This page's
// fetchJson returns null on failure while the hub's returns an { error } object;
// both collapse to 'unknown'. Only a clean { authenticated: <boolean> } is acted on.
function classifyAuthMe(data) {
    if (!data || data.error || typeof data.authenticated !== 'boolean') {
        return 'unknown';
    }
    return data.authenticated ? 'signed-in' : 'signed-out';
}

// /api/auth/me is the heaviest call on a cold start (it fans out a dozen Firestore
// reads). Init plus the pageshow/visibility listeners all fire it while the page is
// still opening, so a first visit paid for it more than once before the account
// finished restoring. Collapse concurrent callers onto one in-flight request.
let syncAuthProfileInFlight = null;
function syncAuthProfile(silent = false) {
    if (syncAuthProfileInFlight) {
        // A visible caller joining a silent request still owes the player the
        // "Restoring your account…" state, so paint it before waiting.
        if (!silent) {
            authState.loading = true;
            renderWelcomeAuth();
        }
        return syncAuthProfileInFlight;
    }
    syncAuthProfileInFlight = syncAuthProfileNow(silent).finally(() => { syncAuthProfileInFlight = null; });
    return syncAuthProfileInFlight;
}

async function syncAuthProfileNow(silent = false) {
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

    // never serve auth state from the HTTP cache — Safari in particular will
    // happily return a stale {authenticated:false} captured before the player
    // signed in on another page (e.g. the hub), logging them back out here.
    const data = await fetchJson(apiUrls('/api/auth/me'), { method: 'GET', cache: 'no-store' });
    authState.loading = false;
    const status = classifyAuthMe(data);
    // Fail open: a transient failure ('unknown') must never drop a valid session.
    if (status === 'unknown') {
        if (!silent) {
            renderWelcomeAuth();
            renderSavedDecks();
        }
        return false;
    }
    if (status === 'signed-out') {
        // Keep the shared token; only an explicit Log Out (or the deliberate guest
        // flow) should remove it. Wiping it here would sign the player out on the
        // hub and every other page too.
        authState.profileResolved = true;
        clearAuthProfile();
        return false;
    }

    // Transparent migration (browsers only): drop the secret and keep only the
    // sentinel once the SERVER reports it received the session cookie on this very
    // request. A readable flag cookie proves only that the browser stored it, not
    // that it survived the trip, so migrating on that would strand the player at a
    // sign-in prompt on the next full-page navigation.
    rememberCookieAuth(data.cookieSession === true);
    if (isLegacyBearerToken(authState.token) && data.cookieSession === true && !isStandalonePWA()) {
        saveAuthToken(COOKIE_SESSION_VALUE);
    }

    // /api/auth/me omits progression when that isolated Firestore read fails.
    // Keep the prior same-user snapshot so Play does not write a progression-
    // less authenticated profile into the shared sieglingsAuthProfile cache
    // (Home would then treat the account as starter-gate locked).
    const previous = authState.profile;
    const sameUser = previous?.user?.id && previous.user.id === data.user?.id;
    const progression = data.progression || (sameUser ? previous.progression : null);
    const merged = progression && !data.progression ? { ...data, progression } : data;
    authState.profile = merged;
    authState.error = '';
    authState.profileResolved = true;
    saveCachedAuthProfile(merged);
    renderWelcomeAuth();
    renderSavedDecks();
    hydrateSavedPlayerName();
    // Fresh unlockedDeckIds / purchases must redraw the loadout — otherwise a
    // stale cached profile can leave bought or starter decks looking locked.
    renderLoadoutOptions();
    updateLoadoutSummary();
    return true;
}

async function logoutAccount() {
    await fetchJson(apiUrls('/api/auth/logout'), { method: 'POST' });
    clearAuthState();
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function renderWelcomeAuth() {
    renderPlayHubAuth();
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
        // Stash for the detail modal — opened by clicking a row.
        latestMatchHistory = recent;
        historyCard.innerHTML = `
            <div class="welcome-card-kicker">Recent Battles</div>
            <h3>Match history follows this login</h3>
            ${!authState.profileResolved
                ? `<div class="welcome-loading-bar" aria-hidden="true"><span></span></div>
                   <div class="identity-note">Refreshing your latest match history…</div>`
                : ''}
            ${recent.length > 0
                ? `<div class="welcome-history-list">${recent.slice(0, 6).map((entry, idx) => {
                    const resultClass = String(entry.result || '').toLowerCase();
                    const ph = Number(entry.playerHealthRemaining);
                    const oh = Number(entry.opponentHealthRemaining);
                    const en = Number(entry.playerEnergyRemaining);
                    const metaBits = [];
                    if (Number.isFinite(ph) && Number.isFinite(oh)) metaBits.push(`&hearts; ${ph} vs ${oh}`);
                    if (Number.isFinite(en)) metaBits.push(`&#9889; ${en}`);
                    if (entry.turnNumber) metaBits.push(`T${entry.turnNumber}`);
                    return `
                    <button class="welcome-history-row history-row-clickable result-${escapeHtmlAttribute(resultClass)}" type="button" onclick="openMatchDetail(${idx})">
                        <strong class="history-result-${escapeHtmlAttribute(resultClass)}">${escapeHtml(entry.result)}</strong>
                        <span>${escapeHtml(entry.loadoutLabel)} vs ${escapeHtml(entry.opponentName)}</span>
                        ${metaBits.length ? `<span class="history-row-meta">${metaBits.join(' &middot; ')}</span>` : ''}
                    </button>
                `;
                }).join('')}</div>`
                : '<div class="identity-note">Your finished games will appear here after the first recorded match.</div>'}
        `;
        return;
    }

    // Token present but /api/auth/me hasn't returned yet: show a loading state
    // rather than the logged-out Log In card, so navigating in while signed in
    // never flashes "logged out" while the session is still being restored.
    if (authState.token && !authState.profileResolved) {
        authCard.innerHTML = `
            <div class="welcome-eyebrow">ACCOUNT</div>
            <h3>Restoring your account…</h3>
            <div class="welcome-loading-bar" aria-hidden="true"><span></span></div>
            <p class="welcome-auth-prompt">Loading your saved decks and match history. You can wait, or start a new match now — your account will catch up.</p>
        `;
        historyCard.innerHTML = `
            <div class="welcome-card-kicker">Recent Battles</div>
            <h3>Loading match history…</h3>
            <div class="welcome-loading-bar" aria-hidden="true"><span></span></div>
            <div class="identity-note">You can wait, or start a new match while this loads.</div>
        `;
        return;
    }

    authCard.innerHTML = `
        <div class="welcome-eyebrow">ACCOUNT</div>
        <h3>Pick up where you left off</h3>
        <p class="welcome-auth-prompt">Sign in or create an account to save your decks, track your match history, and rejoin the arena with your builds intact.</p>
        <div class="welcome-auth-actions">
            <button class="btn btn-primary welcome-auth-submit" type="button" onclick="openAuthPopup('login')">Log In</button>
            <button class="btn welcome-auth-submit" type="button" onclick="openAuthPopup('register')">Register</button>
        </div>
        <button class="btn welcome-guest-btn" type="button" ${authState.loading ? 'disabled' : ''} onclick="playAsGuest()">Play as Guest</button>
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

function getSavedDeckElements(savedDeck) {
    if (!savedDeck) return ['NEUTRAL'];
    if (savedDeck.custom) {
        const elements = [...new Set((savedDeck.customDeckCards || []).map(cardId => {
            return gameOptions?.cardCatalog?.find(card => card.id === cardId)?.element;
        }).filter(Boolean))].slice(0, 4);
        return elements.length ? elements : ['NEUTRAL'];
    }
    const preset = gameOptions?.decks?.find(deck => deck.id === savedDeck.deckId);
    return preset?.elements?.length ? preset.elements : ['NEUTRAL'];
}

function getSavedDeckDescription(savedDeck) {
    if (!savedDeck) return '';
    if (savedDeck.custom) {
        const count = (savedDeck.customDeckCards || []).length;
        return `${count} card custom build from your binder.`;
    }
    return savedDeck.deckName
        ? `Saved preset: ${savedDeck.deckName}.`
        : 'Saved premade loadout.';
}

function getSelectedSavedDeck() {
    return authState.profile?.savedDecks?.find(deck => deck.id === selectedSavedDeckId) || null;
}

function applySavedDeckState(savedDeck) {
    if (!savedDeck) return;
    selectedSavedDeckId = savedDeck.id;
    selectedTrainerId = savedDeck.trainerId || selectedTrainerId;
    if (savedDeck.custom) {
        builderCounts = buildCountsFromCardList(savedDeck.customDeckCards || []);
    } else {
        builderCounts = {};
        selectedDeckId = savedDeck.deckId || selectedDeckId;
    }
    const input = document.getElementById('saveDeckNameInput');
    if (input) {
        input.value = savedDeck.name || '';
    }
}

function selectSavedDeckForLoadout(deckId) {
    const savedDeck = authState.profile?.savedDecks?.find(deck => deck.id === deckId);
    if (!savedDeck) return;
    applySavedDeckState(savedDeck);
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function renderSavedDeckLoadoutOptions() {
    const optionsEl = document.getElementById('savedDeckOptions');
    const noteEl = document.getElementById('savedDeckLoadoutNote');
    if (!optionsEl) return;

    if (!authState.profile?.authenticated) {
        if (noteEl) {
            noteEl.textContent = 'Sign in or create an account here to use decks saved on the home Decks screen.';
        }
        optionsEl.innerHTML = renderLoadoutAuthGate('saved');
        return;
    }

    const savedDecks = authState.profile.savedDecks || [];
    if (noteEl) {
        noteEl.textContent = savedDecks.length
            ? 'Pick a deck you saved on the home Decks screen, then choose your SiegeKnight.'
            : 'No saved decks yet. Create one on the home Decks screen, or use Preset Decks / Deck Builder here.';
    }
    if (!savedDecks.length) {
        optionsEl.innerHTML = '<div class="builder-empty">No saved decks in your binder yet.</div>';
        return;
    }

    optionsEl.innerHTML = savedDecks.map(savedDeck => {
        const selected = savedDeck.id === selectedSavedDeckId;
        const elements = getSavedDeckElements(savedDeck);
        const bg = buildDeckBackground(elements);
        const borderColor = buildDeckBorderColors(elements);
        const elementLabels = elements.map(formatElementLabel).join(' / ');
        const elClasses = elements.map(element => `el-${element.toLowerCase()}`).join(' ');
        const primaryElement = elements[0] || 'NEUTRAL';
        const primaryHex = getElementHex(primaryElement);
        const deckArt = deckArtAssetForElements(elements);
        const artStyle = deckArt?.back ? `;--deck-art:url('${deckArt.back}')` : '';
        const presetDeck = savedDeck.custom ? null : gameOptions.decks.find(deck => deck.id === savedDeck.deckId);
        const theme = getDeckLoadoutTheme(presetDeck);
        const traits = savedDeck.custom
            ? ['Custom', 'Binder', 'Saved']
            : (theme.traits || []).slice(0, 3);
        const spineBands = elements.map(element => {
            const color = getElementHex(element);
            return `<div class="spine-band" style="background:${color}"></div>`;
        }).join('');
        const faceSigils = deckArt ? '' : buildDeckFaceSigils(elements);
        const stateLabel = savedDeck.custom ? 'Custom' : 'Saved';

        return `<button type="button" class="deck-card${selected ? ' selected' : ''} ${elClasses}${deckArt ? ' has-deck-art' : ''}" style="--deck-bg:${bg};--deck-border:${borderColor};--deck-accent:${primaryHex};--deck-glow:${hexToRgba(primaryHex, 0.28)};--deck-glow-strong:${hexToRgba(primaryHex, 0.58)}${artStyle}" onclick="selectSavedDeckForLoadout('${savedDeck.id}')" aria-pressed="${selected ? 'true' : 'false'}">
            <div class="deck-card-spine">${spineBands}</div>
            ${faceSigils}
            <span class="deck-card-state">${selected ? 'Selected' : escapeHtml(stateLabel)}</span>
            <div class="deck-card-body">
                <span class="deck-card-name">${escapeHtml(savedDeck.name || 'Saved Deck')}</span>
                <span class="deck-card-elements">${escapeHtml(elementLabels)}</span>
                <span class="deck-card-desc">${escapeHtml(getSavedDeckDescription(savedDeck))}</span>
                <span class="deck-card-tags">${traits.map(trait => `<span>${escapeHtml(trait)}</span>`).join('')}</span>
                <span class="deck-card-meta-line">${escapeHtml(savedDeck.trainerName || 'SiegeKnight')}</span>
            </div>
        </button>`;
    }).join('');
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
                    <button class="btn" type="button" onclick="loadSavedDeck('${deck.id}')">Select</button>
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
    const savedDeck = getSelectedSavedDeck();
    if (loadoutMode === 'saved' && savedDeck) {
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
    loadoutMode = 'saved';
    selectSavedDeckForLoadout(deckId);
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

function getPlayerTotalSpendableEnergy() {
    if (!gameState?.player) {
        return 0;
    }
    return ENERGY_ORDER.reduce((total, [key]) => total + Number(gameState.player[`${key}Energy`] || 0), 0);
}

function canAffordCard(card) {
    if (!card?.costElement || !card.costAmount) {
        return true;
    }
    const costAmount = Number(card.costAmount);
    if (card.type === 'TRAP') {
        const opponent = gameState?.enemy || {};
        const available = String(card.costElement).toUpperCase() === 'NEUTRAL'
            ? ENERGY_ORDER.reduce((total, [key]) => total + Number(opponent[`${key}Energy`] || 0), 0)
            : Number(opponent[`${String(card.costElement).toLowerCase()}Energy`] || 0);
        return available >= costAmount;
    }
    if (String(card.costElement).toUpperCase() === 'NEUTRAL') {
        return getPlayerTotalSpendableEnergy() >= costAmount;
    }
    return getPlayerEnergyAmount(card.costElement) >= costAmount;
}

function countBoardSieglings(board = gameState?.playerBoard || []) {
    return (board || []).reduce((count, row) => count + (row || []).filter(Boolean).length, 0);
}

function cellHasAffliction(cell, kind) {
    const want = String(kind || '').toUpperCase();
    if (!cell || !want) return false;
    const rows = Array.isArray(cell.afflictions) ? cell.afflictions : [];
    return rows.some((row) => String(row?.kind || '').toUpperCase() === want && Number(row?.stacks) > 0);
}

function getClaimableSieglings(board = gameState?.playerBoard || []) {
    if (!gameState || gameState.currentPhase !== 'SETUP' || gameState.activeSide !== 'PLAYER' || targetMode) {
        return [];
    }
    const claimable = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const cell = board?.[row]?.[col];
            // Curse blocks claim — mirror GameService.claimSiegling.
            if (cell && Number(cell.battlePhasesSeen || 0) > 0 && !cellHasAffliction(cell, 'CURSE')) {
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
                && Number(cell.battlePhasesSeen || 0) > 0
                && !cellHasAffliction(cell, 'CURSE')) {
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

/**
 * Why this hand card cannot be played right now, or '' when it can.
 *
 * Wrapped so one card's lock check can never abort renderHand: the hand is
 * built as a single string and only assigned at the end, so a throw here used
 * to leave the entire hand frozen on its previous contents — cards the player
 * had already played stayed on screen.
 */
function getHandCardLockReason(card) {
    try {
        return computeHandCardLockReason(card);
    } catch (e) {
        console.error('Hand card lock check failed; treating as playable:', e);
        return '';
    }
}

/** The printed name of the card the tutorial requires first, for the lock copy. */
function tutorialRequiredPlacementName() {
    const requiredId = gameState?.tutorialRequiredPlacementId;
    if (!requiredId) return 'Your opener';
    const held = (gameState?.player?.hand || []).find(
        (c) => c && String(c.id).toLowerCase() === String(requiredId).toLowerCase());
    return held?.name || 'Your opener';
}

function computeHandCardLockReason(card) {
    if (!gameState || !card) {
        return '';
    }
    if (gameState.activeSide !== 'PLAYER' && !isHandHiddenForPhase()) {
        return 'Wait for your turn.';
    }
    if (isBoardPreviewCard(card)) {
        return 'This Siegeling is already on the board.';
    }
    // The tutorial's first placement is fixed: the server refuses anything else,
    // so lock the rest of the hand rather than let the player tap into a
    // rejection. The id comes from the server (tutorialRequiredPlacementId) —
    // no copy of the rule lives here, so the two sides cannot drift.
    const requiredId = gameState.tutorialRequiredPlacementId;
    if (requiredId && card.type === 'SIEGLING' && !card.evolvesFromId
            && String(card.id).toLowerCase() !== String(requiredId).toLowerCase()) {
        return `${tutorialRequiredPlacementName()} opens this match — place it first.`;
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
        return 'Turn 1 starts with a Siegeling placement.';
    }
    if (gameState.currentPhase !== 'SETUP') {
        return 'Cards can only be played during setup.';
    }
    if (isSetupResolutionPending()) {
        return 'Resolving setup effects before the board opens.';
    }
    if (card.type === 'SIEGLING' && countBoardSieglings() >= 5 && !card.evolvesFromId) {
        return 'Maxed out.';
    }
    if (!canAffordCard(card)) {
        if (card.type === 'TRAP') return `Opponent needs ${card.costAmount} ${formatElementLabel(card.costElement)} energy to trigger this.`;
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
            // getEvolutionBaseCells yields board cells, not [row, col] pairs —
            // destructuring them as pairs threw out of renderHand and froze the
            // whole hand on its previous contents.
            const cursedBase = baseCells.some((cell) => cellHasAffliction(cell, 'CURSE'));
            if (cursedBase) {
                return `${card.evolvesFromName || 'Base form'} is Cursed and cannot evolve.`;
            }
            return `${card.evolvesFromName || 'Base form'} must complete a full battle phase in its current form before it can evolve.`;
        }
    }
    if (card.type === 'SIEGLING' && getLegalPlacementsForCard(card).length === 0) {
        return 'No legal placement available for this Siegeling.';
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
        const ability = targetContext.mode === 'battle' ? getActiveBattleTargetAbility() : null;
        const message = ability && targetContext.mode === 'battle'
            ? buildBattleTargetingInstruction(targetContext.side, ability, getRowSelectSelectedRow()).banner
            : targetContext.message;
        return {
            kind: 'target',
            label: 'Targeting',
            message
        };
    }
    if (isPlacementSelectionActive()) {
        return {
            kind: 'place',
            label: 'Placement',
            message: `Drag ${selectedCard.name} onto a highlighted slot, or tap a slot to place.`
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
            message: 'Tap one of your battle-tested Siegelings to claim it and gain 1 temporary energy of its element this turn.'
        };
    }
    if (gameState.currentPhase === 'BATTLE') {
        return {
            kind: 'battle',
            label: 'Battle Action',
            message: gameState.pendingBattle
                ? 'Queue one action for the acting Siegeling. The hand HUD now hosts the live battle queue.'
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
    if (isMobileBattleTargetingCameraActive()) {
        banner.className = 'interaction-banner hidden';
        banner.innerHTML = '';
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
    const mobileTargetingCamera = isMobileBattleTargetingCameraActive();

    body.classList.toggle('targeting-active', targetingActive);
    body.classList.toggle('placement-active', placementActive);
    body.classList.toggle('battle-phase-active', battlePhaseActive);
    body.classList.toggle('mobile-battle-targeting-camera', mobileTargetingCamera);

    boardArea?.classList.toggle('targeting-active', targetingActive);
    boardArea?.classList.toggle('placement-active', placementActive);
    boardArea?.classList.toggle('mobile-targeting-camera-board', mobileTargetingCamera);
    if (!targetingActive) {
        clearTargetingPreview();
    }

    handArea?.classList.toggle('battle-hidden', handHidden);
    handArea?.classList.toggle('interaction-locked', targetingActive);

    renderInteractionBanner();
    renderHintPanel();
    renderMobileTargetingHud();
    syncMobileTargetingArenaScale();
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
    mobileSpellPreviewPending = false;
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
window.renderBattlePanel = renderBattlePanel;

// Surface a server/application error to the player as an on-screen toast, so
// failed actions give visible feedback instead of only a console message.
// Deliberately self-contained with inline styles (no dependency on the
// in-game toast CSS or the action queue) so it renders on every screen,
// including the loadout / match-start flow where the error is reported.
function showErrorToast(message, holdMs = 4200) {
    const text = String(message == null ? '' : message).trim();
    if (!text || typeof document === 'undefined' || !document.body) return;

    let stack = document.getElementById('sglErrorToastStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'sglErrorToastStack';
        stack.style.cssText = [
            'position:fixed',
            'top:max(16px, env(safe-area-inset-top, 0px))',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:2147483000',
            'display:flex',
            'flex-direction:column',
            'align-items:center',
            'gap:8px',
            'width:min(560px, 92vw)',
            'pointer-events:none'
        ].join(';');
        document.body.appendChild(stack);
    }

    const node = document.createElement('div');
    node.setAttribute('role', 'alert');
    node.style.cssText = [
        'pointer-events:auto',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'width:100%',
        'box-sizing:border-box',
        'padding:12px 16px',
        'border-radius:12px',
        'background:linear-gradient(180deg, rgba(40,12,16,0.97), rgba(26,8,12,0.97))',
        'border:1px solid rgba(255,90,90,0.6)',
        'box-shadow:0 10px 30px rgba(0,0,0,0.45)',
        'color:#ffe9e9',
        'font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
        'opacity:0',
        'transform:translateY(-8px)',
        'transition:opacity 0.18s ease, transform 0.18s ease'
    ].join(';');

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'font-size:18px;line-height:1;flex:0 0 auto';
    icon.textContent = '⚠️';
    const body = document.createElement('span');
    body.style.cssText = 'flex:1 1 auto';
    body.textContent = text; // textContent keeps the server message XSS-safe
    node.appendChild(icon);
    node.appendChild(body);
    stack.appendChild(node);

    requestAnimationFrame(() => {
        node.style.opacity = '1';
        node.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        node.style.opacity = '0';
        node.style.transform = 'translateY(-8px)';
        setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }, Math.max(1500, holdMs));
}
window.showErrorToast = showErrorToast;

async function api(endpoint, method = 'POST', body = null, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, playbackContext = null) {
    const opts = { method, headers: getAuthHeaders({ 'Content-Type': 'application/json' }) };
    if (multiplayerSession?.roomId && multiplayerSession?.playerToken) {
        opts.headers['X-Room-Id'] = multiplayerSession.roomId;
        opts.headers['X-Player-Token'] = multiplayerSession.playerToken;
    } else if (soloSessionToken) {
        opts.headers['X-Solo-Token'] = soloSessionToken;
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
        // Always surface a toast so failed actions (including match start, e.g.
        // picking a SiegeKnight you haven't unlocked) give visible feedback.
        showErrorToast(String(data.error));
        if (endpoint === 'new') {
            showLoadoutLoadingError(String(data.error));
            syncEntryOverlays();
        } else if (!multiplayerSession && soloSessionToken
                && String(data.error).startsWith('No active game')) {
            // The solo game only lives in the server's memory; a redeploy or the
            // session TTL can drop it while the client still holds the token,
            // which otherwise makes every action re-toast against a dead session.
            // Drop the stale token and return to the entry screen so the player
            // can start fresh instead of being stuck mid-match.
            setSoloSessionToken(null);
            syncEntryOverlays();
        }
        return null;
    }

    if (endpoint === 'new') {
        setSoloSessionToken(data.soloToken || null);
        clearExternalSocketElementMemory();
    }

    const prevState = gameState;
    const drawAbilityUsed = didRequestUsePlayerDrawAbility(endpoint, body, prevState);
    gameState = data;
    // Server state is authoritative for the hand; any optimistic slot hide is
    // superseded by it (whether the action landed or was rejected).
    pendingHandRemovalIndex = null;
    if (gameState?.gameOver && gameState.multiplayer && multiplayerSession?.roomId) {
        const status = await fetchRoomStatus();
        if (status && !status.error) {
            gameState = { ...gameState, ...status };
            handleMatchStatusExtras(status);
        }
    }
    if (endpoint !== 'new' && prevState) {
        // The animation/diff layer must never block the state update below. If
        // it throws, the new gameState would otherwise never render and the
        // interaction state never resets, freezing the client on the previous
        // screen (e.g. stuck on the battle target overlay after attacking).
        try {
            if (window.SieglingsActionQueue) {
                window.SieglingsActionQueue.enqueueFromStateDiff(prevState, data, playbackContext);
            } else {
                window.SieglingsFx?.onBoardUpdate(prevState, data);
            }
        } catch (e) {
            console.error('Battle animation queue failed; continuing without it:', e);
        }
        // Announced only once the batch we just enqueued has played, so "your
        // turn" lands after the previous turn's damage and phase banner rather
        // than on top of them. Deliberately after enqueueFromStateDiff: asking
        // for idle before the actions exist would resolve immediately.
        if (!playbackContext?.soloAiEndTurn) {
            maybeNotifyTurnChange(prevState, data);
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
    if (drawAbilityUsed) {
        showDrawAbilityReveal(prevState, data);
    }
    // Setup-entry effects are resolved by the server before it returns this
    // snapshot. Do not reopen placement until their queued destruction and
    // damage visuals have caught up with that authoritative board state.
    if (gameState?.currentPhase === 'SETUP' && window.SieglingsActionQueue?.isProcessing?.()) {
        window.SieglingsActionQueue.onIdle?.().then(() => {
            if (gameState === data) render();
        });
    }
    return data;
}

function isDrawAbility(ability) {
    const effect = String(ability?.effectType || ability?.effect || '').trim().toUpperCase();
    return effect === 'DRAW';
}

// Every draw the player makes shows the reveal, so the drawn card is readable
// before it disappears into the hand fan — the draw-phase button included, not
// just ability-originated draws.
function didRequestUsePlayerDrawAbility(endpoint, body, state) {
    if (endpoint === 'draw') return true;
    if (!state || !body) return false;
    if (endpoint === 'cast') {
        return isDrawAbility((state.player?.hand || []).find((card) => card.id === body.cardId)?.ability);
    }
    if (endpoint === 'battle/action') {
        return isDrawAbility((state.pendingBattle?.abilities || []).find((ability) => ability.index === body.abilityIndex));
    }
    if (endpoint === 'trainer') {
        return isDrawAbility(state.player?.trainer?.active);
    }
    return false;
}

function getNewDrawnHandIndices(previousState, nextState) {
    const priorCounts = new Map();
    (previousState?.player?.hand || []).forEach((card) => {
        priorCounts.set(card.id, (priorCounts.get(card.id) || 0) + 1);
    });
    const drawn = [];
    (nextState?.player?.hand || []).forEach((card, index) => {
        const count = priorCounts.get(card.id) || 0;
        if (count > 0) priorCounts.set(card.id, count - 1);
        else drawn.push(index);
    });
    return drawn;
}

function showDrawAbilityReveal(previousState, nextState) {
    const drawnIndices = getNewDrawnHandIndices(previousState, nextState);
    if (drawnIndices.length === 0) return;
    const reveal = document.getElementById('drawAbilityReveal');
    const cards = document.getElementById('drawAbilityRevealCards');
    const title = document.getElementById('drawAbilityRevealTitle');
    if (!reveal || !cards || !title) return;
    const run = ++drawAbilityRevealRun;
    if (drawAbilityRevealTimer) clearTimeout(drawAbilityRevealTimer);

    const hand = document.getElementById('playerHand');
    // Render the reveal from the drawn cards in state, not from the hand DOM:
    // battle-phase and SiegeKnight draws happen while the hand tray is in queue
    // mode, so the matching .hand-card nodes may not exist and the reveal would
    // silently never appear.
    const drawnCards = drawnIndices
        .map((index) => nextState?.player?.hand?.[index])
        .filter(Boolean);
    if (drawnCards.length === 0) return;
    // Same template as the hand selector, so a card looks identical in the
    // reveal and in the hand it lands in.
    const markup = drawnCards.map((card) => {
        const face = renderHandCardFace(card, { summaryBody: true });
        const elemClass = String(card.element || 'NEUTRAL').toLowerCase();
        return `<div class="hand-card ${elemClass} ${cardTypeClass(card)}${face.faceClass}">${face.html}</div>`;
    }).join('');
    if (!markup) return;
    cards.innerHTML = markup;
    const count = drawnCards.length;
    // Cards sit side by side with real spacing; only a wide fan needs to tuck
    // in, so shrink/overlap scales with the count instead of a fixed offset.
    cards.dataset.count = String(Math.min(count, 6));
    title.textContent = `${count} card${count === 1 ? '' : 's'} drawn`;
    reveal.className = 'draw-ability-reveal';
    requestAnimationFrame(() => {
        reveal.classList.add('visible');
        // Framed cards size their title and summary text by measurement, as the
        // hand does after it renders — but only once the reveal is off
        // `display:none`, or every box measures zero and the fit is skipped.
        fitFramedSummaryText(cards);
    });

    // Aim at the real hand when it is open. During battle, the hand is tucked
    // away, so use the player hand counter as an honest, visible destination.
    const destination = !hand?.classList.contains('hidden')
        ? hand.getBoundingClientRect()
        : document.getElementById('mobilePlayerHandSize')?.getBoundingClientRect()
            || document.getElementById('playerDeckSize')?.getBoundingClientRect();
    const targetX = destination ? destination.left + destination.width / 2 : window.innerWidth / 2;
    const targetY = destination ? destination.top + destination.height / 2 : window.innerHeight - 34;
    const revealCenterX = window.innerWidth / 2;
    const revealCenterY = window.innerHeight / 2;
    cards.querySelectorAll('.hand-card').forEach((card, index) => {
        const spread = (index - (count - 1) / 2) * 18;
        card.style.setProperty('--draw-fly-x', `${targetX - revealCenterX + spread}px`);
        card.style.setProperty('--draw-fly-y', `${targetY - revealCenterY}px`);
    });
    // The last card finishes its entrance around 620ms in; hold a full second of
    // still, fully-readable cards after that before they fly into the hand.
    const ENTRANCE_MS = 620;
    const HOLD_MS = 1000;
    const FLY_MS = 460;
    drawAbilityRevealTimer = setTimeout(() => {
        if (run === drawAbilityRevealRun) reveal.classList.add('flying');
    }, ENTRANCE_MS + HOLD_MS);
    setTimeout(() => {
        if (run !== drawAbilityRevealRun) return;
        reveal.classList.remove('visible', 'flying');
        drawAbilityRevealTimer = setTimeout(() => {
            if (run !== drawAbilityRevealRun) return;
            reveal.classList.add('hidden');
            drawAbilityRevealTimer = null;
        }, 260);
    }, ENTRANCE_MS + HOLD_MS + FLY_MS);
}

async function fetchJson(urlOrUrls, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
    let lastError = null;

    for (const url of urls) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(url, {
                credentials: 'same-origin',
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
        // Arriving from the hub with a chosen loadout (e.g. Start Match) means
        // the player asked to play now — drop them straight onto deck selection
        // instead of holding them on the welcome screen. Critically this happens
        // before any network await, so a slow/hung account restore can't trap
        // them behind the "Restoring your account…" spinner.
        if (peekPendingHomeLoadout()) {
            welcomeDismissed = true;
        }
        syncEntryOverlays();
        loadoutErrorMessage = '';
        updateLoadoutSummary();

        // Warm paint: if a previous visit persisted the catalog, render the
        // loadout from it immediately so the screen isn't blank while the
        // network requests run. The fetch below revalidates and overwrites it.
        if (!gameOptions) {
            const cachedOptions = readPlayCache('gameOptions');
            if (cachedOptions) {
                paintGameOptionsFromCache(cachedOptions, readPlayCache('cardsEditor'));
            }
        }

        // Refresh the account profile in the background. It must not gate the
        // loadout transition: /api/auth/me has no timeout, and blocking on it
        // would strand a player who just pressed Start Match on the welcome
        // overlay if the auth check stalls.
        void syncAuthProfile(true);

        const [data, editorState] = await Promise.all([
            fetchJson(apiUrls('/api/game/options'), {}, LOADOUT_ACTION_TIMEOUT_MS),
            fetchJson(apiUrls('/api/cards/editor'), {}, LOADOUT_ACTION_TIMEOUT_MS)
        ]);
        if (!data) {
            // If we already painted usable (if stale) options from cache, keep
            // them rather than replacing the screen with a hard error.
            if (!gameOptions) {
                showLoadoutLoadingError('Unable to load deck and SiegeKnight choices. The backend is unavailable right now. Press retry once it comes back.');
            }
            syncEntryOverlays();
            return;
        }
        writePlayCache('gameOptions', data);
        writePlayCache('cardsEditor', editorState);
        gameOptions = filterGameOptionsToDashboardCards(data, editorState);
        loadoutErrorMessage = '';
        selectedDeckId = data.defaultDeckId;
        selectedTrainerId = data.defaultTrainerId;
        ensureOwnedTrainerSelected();
        builderCounts = {};
        loadoutMode = 'preset';
        applyPendingHomeLoadout();
        ensureOwnedTrainerSelected();
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

// Render the loadout from persisted cache without running the one-time load
// side effects (pending-loadout handoff, online-state URL parsing, multiplayer
// resume) — those belong to the authoritative network load below.
function paintGameOptionsFromCache(cachedOptions, cachedEditor) {
    try {
        gameOptions = filterGameOptionsToDashboardCards(cachedOptions, cachedEditor);
        if (!selectedDeckId) selectedDeckId = cachedOptions.defaultDeckId;
        if (!selectedTrainerId) selectedTrainerId = cachedOptions.defaultTrainerId;
        ensureOwnedTrainerSelected();
        renderLoadoutOptions();
        updateLoadoutSummary();
        syncEntryOverlays();
    } catch (e) {
        console.warn('Unable to paint loadout from cache.', e);
    }
}

async function refreshLiveGameOptions() {
    if (!gameOptions) {
        return loadGameOptions();
    }
    if (liveCatalogRefreshPromise) {
        return liveCatalogRefreshPromise;
    }
    liveCatalogRefreshPromise = (async () => {
        const [data, editorState] = await Promise.all([
            fetchJson(apiUrls('/api/game/options'), {}, LOADOUT_ACTION_TIMEOUT_MS),
            fetchJson(apiUrls('/api/cards/editor'), {}, LOADOUT_ACTION_TIMEOUT_MS)
        ]);
        if (!data) {
            return;
        }
        writePlayCache('gameOptions', data);
        writePlayCache('cardsEditor', editorState);
        gameOptions = filterGameOptionsToDashboardCards(data, editorState);
        loadoutErrorMessage = '';
        renderLoadoutOptions();
        updateLoadoutSummary();
        syncEntryOverlays();
    })().catch((error) => {
        console.error('Failed to refresh live game options:', error);
    }).finally(() => {
        liveCatalogRefreshPromise = null;
    });
    return liveCatalogRefreshPromise;
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

/**
 * The loading gate wants one shape, but a SiegeKnight reaches us in two: the
 * loadout options serialize `passive`/`active` as plain strings, while an
 * in-match trainer serializes them as ability objects. Normalise here, next to
 * the data, so the gate stays a renderer.
 */
function knightSplashInfo(trainer, fallbackName) {
    const text = (v) => (typeof v === 'string' ? v : (v && v.description) || '');
    return {
        element: trainer?.element || 'NEUTRAL',
        trainerName: trainer?.name || fallbackName || 'SiegeKnight',
        tier: trainer?.tier || '',
        art: trainer?.cardArtUrl || '',
        artMode: trainer?.cardArtMode || '',
        passive: text(trainer?.passive),
        active: text(trainer?.active)
    };
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
                ...knightSplashInfo(trainer)
            },
            opponent: {
                name: 'AI Opponent',
                element: 'SHADOW',
                trainerName: 'Mystery SiegeKnight'
            },
            minDurationMs: 2200
        });
    }
    // The server pins both tutorial loadouts, so sending deck/knight ids here
    // would only invite an ownership check the tutorial does not need.
    const body = tutorialMatchActive ? {} : getSelectedLoadoutBody();
    body.playerName = getCurrentPlayerName() || (authState.profile?.user?.displayName || 'Player');
    if (tutorialMatchActive) {
        body.tutorial = true;
        try { body.advancedTutorial = sessionStorage.getItem(ADVANCED_TUTORIAL_KEY) === '1'; } catch (e) { /* storage unavailable */ }
    }
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
                        ...knightSplashInfo(gameState?.player?.trainer)
                    },
                    opponent: {
                        name: gameState?.enemyName || 'AI Opponent',
                        ...knightSplashInfo(enemyTrainer, 'Mystery SiegeKnight')
                    },
                    minDurationMs: 600
                });
            }
            window.SieglingsLoadingGate.hide();
        }
    }
    if (!started) {
        // The advanced chapter dismissed the end screen before asking for a new
        // match, so a failed start would otherwise strand the player on the
        // finished board with its dead opponent still at 0 HP. Put the end
        // screen back and drop the pending flag so the next match is normal.
        try { sessionStorage.removeItem(ADVANCED_TUTORIAL_KEY); } catch (e) { /* storage unavailable */ }
        if (gameState?.gameOver) {
            document.getElementById('gameOverOverlay')?.classList.add('visible');
        }
        return;
    }
    if (tutorialMatchActive) {
        // A pending advanced request survives the match restart in sessionStorage,
        // because starting the new match tears this page state down and rebuilds
        // it from the server's response.
        let wantsAdvanced = false;
        try {
            wantsAdvanced = sessionStorage.getItem(ADVANCED_TUTORIAL_KEY) === '1';
            if (wantsAdvanced) sessionStorage.removeItem(ADVANCED_TUTORIAL_KEY);
        } catch (e) { wantsAdvanced = false; }
        if (wantsAdvanced && window.ArenaTutorial?.startAdvanced) {
            window.ArenaTutorial.startAdvanced();
        } else {
            window.ArenaTutorial?.start();
        }
    } else {
        window.ArenaTutorial?.stop();
    }
}

const ADVANCED_TUTORIAL_KEY = 'sieglingsAdvancedTutorialPending';

/**
 * Deal a fresh tutorial match and open it on the ADVANCED script. The advanced
 * chapter teaches shields, afflictions and the HUD, all of which need a board to
 * happen on — running it over the finished match left it a slideshow.
 */
async function startAdvancedTutorialMatch() {
    try { sessionStorage.setItem(ADVANCED_TUTORIAL_KEY, '1'); } catch (e) { /* private mode */ }
    document.getElementById('gameOverOverlay')?.classList.remove('visible');
    window.ArenaTutorial?.stop();
    setMatchMode('tutorial');
    await newGame();
}
window.startAdvancedTutorialMatch = startAdvancedTutorialMatch;

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
    resolvePhaseTransitionBanner();
    document.getElementById('phaseTransitionBanner')?.classList.add('hidden');
    document.getElementById('phaseTransitionBanner')?.classList.remove('visible');
    setPhaseTransitionScrimVisible(false);
    welcomeDismissed = true;
    resetGameOverOverlayState();
    if (!gameOptions) {
        loadGameOptions();
        return;
    }
    hydrateSavedPlayerName();
    // The room is already known for invite links and online loadout-phase, so
    // skip the match-setup step and drop the player straight onto the deck step.
    loadoutStep = (isInviteJoinFlow() || currentRoomStatus?.loadoutPhase) ? 'deck' : 'setup';
    renderLoadoutOptions();
    updateLoadoutSummary();
    syncEntryOverlays();
}

function returnToPlayMain() {
    if (loadoutStartPending) {
        return;
    }
    clearMultiplayerSession();
    currentRoomStatus = null;
    loadoutErrorMessage = '';
    welcomeDismissed = false;
    resetPlayLobbyState(false);
    resetGameOverOverlayState();
    syncEntryOverlays();
    renderWelcomeTutorial();
    renderWelcomeAuth();
    renderWelcomeLeaderboards();
}

function selectDeckOption(deckId) {
    if (isPremadeDeckLocked(gameOptions?.decks?.find((deck) => deck.id === deckId))) {
        return;
    }
    detachSavedDeckSelection();
    selectedDeckId = deckId;
    renderLoadoutOptions();
    updateLoadoutSummary();
}

// The main four elements are free for everyone and the starter pack's element
// comes with the starter choice; everything else is bought in Decks. The
// backend is the authority (progression.unlockedDeckIds) and rejects locked
// decks at match start — this mirror keeps the picker honest.
const FREE_DECK_ELEMENTS = new Set(['FIRE', 'ICE', 'EARTH', 'WIND']);

function isPremadeDeckLocked(deck) {
    if (!deck) {
        return false;
    }
    const progression = authState.profile?.progression;
    const unlocked = progression?.unlockedDeckIds;
    if (Array.isArray(unlocked)) {
        return !unlocked.includes(deck.id);
    }
    // Stale cache / pre-unlock payload: honor purchases + starter element so a
    // Water starter is not locked out of Water decks while /me is still catching up.
    if (Array.isArray(progression?.purchasedDeckIds) && progression.purchasedDeckIds.includes(deck.id)) {
        return false;
    }
    const free = new Set(FREE_DECK_ELEMENTS);
    const starter = String(progression?.starterPackId || '').match(/^pack_([a-z0-9]+)/i);
    if (starter) {
        free.add(starter[1].toUpperCase());
    }
    return !(deck.elements || []).every((element) => free.has(String(element).toUpperCase()));
}

/** Premade decks available in battle loadout — locked presets stay in Decks to unlock. */
function getVisibleLoadoutDecks() {
    return (gameOptions?.decks || []).filter((deck) => !isPremadeDeckLocked(deck));
}

/** First deck the player can actually take into a match. */
function firstUnlockedDeckId() {
    return getVisibleLoadoutDecks()[0]?.id || null;
}

function getOwnedTrainerIdSet() {
    if (!authState.profile?.authenticated) {
        return null;
    }
    const owned = authState.profile?.progression?.ownedTrainers;
    if (!Array.isArray(owned) || owned.length === 0) {
        return null;
    }
    return new Set(owned.map((entry) => entry?.id).filter(Boolean));
}

// Starter SiegeKnights available before sign-in. Keep in sync with
// GameController.GUEST_TRAINER_IDS on the backend.
const GUEST_TRAINER_IDS = new Set(['squire-bob', 'pyla', 'ser-airek']);

function isGuestTrainer(trainer) {
    return GUEST_TRAINER_IDS.has(String(trainer?.id || '').toLowerCase());
}

function getVisibleLoadoutTrainers() {
    if (!gameOptions?.trainers?.length) {
        return [];
    }
    const ownedTrainerIds = getOwnedTrainerIdSet();
    if (ownedTrainerIds) {
        return gameOptions.trainers.filter((trainer) => ownedTrainerIds.has(trainer.id));
    }
    if (authState.profile?.authenticated) {
        return gameOptions.trainers.filter((trainer) => trainer.owned !== false);
    }
    // Guests (no account) can pick the starter trio: Bob, Pyla, and Airek.
    return gameOptions.trainers.filter(isGuestTrainer);
}

function selectTrainerOption(trainerId) {
    if (!getVisibleLoadoutTrainers().some((trainer) => trainer.id === trainerId)) {
        return;
    }
    if (loadoutMode !== 'saved') {
        detachSavedDeckSelection();
    }
    selectedTrainerId = trainerId;
    // The trainer pool has not changed, so preserve its live image nodes.
    // Rebuilding the whole grid here makes remote holographic/full-card art
    // disappear until a second fetch and decode completes.
    updateTrainerSelectionUI();
    updateLoadoutSummary();
}

function updateTrainerSelectionUI() {
    const trainerEl = document.getElementById('trainerOptions');
    if (!trainerEl) {
        return;
    }
    trainerEl.querySelectorAll('.knight-card[data-trainer-id]').forEach((card) => {
        const selected = card.dataset.trainerId === selectedTrainerId;
        const recommended = card.classList.contains('recommended');
        card.classList.toggle('selected', selected);
        card.setAttribute('aria-pressed', selected ? 'true' : 'false');

        let ribbon = card.querySelector('.knight-selected-ribbon, .knight-recommend-ribbon');
        const ribbonClass = selected
            ? 'knight-selected-ribbon'
            : (recommended ? 'knight-recommend-ribbon' : '');
        if (!ribbonClass) {
            ribbon?.remove();
            return;
        }
        if (!ribbon) {
            ribbon = document.createElement('span');
            card.prepend(ribbon);
        }
        ribbon.className = ribbonClass;
        ribbon.textContent = selected ? 'Selected' : 'Recommended';
    });
    scheduleSiegeKnightCardFit();
}

function isTrainerOwned(trainerId) {
    return getVisibleLoadoutTrainers().some((trainer) => trainer.id === trainerId);
}

// Falls back to the first owned SiegeKnight when the current selection is locked.
function ensureOwnedTrainerSelected() {
    const visibleTrainers = getVisibleLoadoutTrainers();
    if (!visibleTrainers.length) {
        return;
    }
    if (selectedTrainerId && visibleTrainers.some((trainer) => trainer.id === selectedTrainerId)) {
        return;
    }
    selectedTrainerId = visibleTrainers[0].id;
}

function switchLoadoutMode(mode) {
    if (mode !== 'saved') {
        detachSavedDeckSelection();
    }
    loadoutMode = mode;
    if (mode === 'saved') {
        const savedDecks = authState.profile?.savedDecks || [];
        if (savedDecks.length && !selectedSavedDeckId) {
            selectSavedDeckForLoadout(savedDecks[0].id);
            return;
        }
    }
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function setMatchMode(mode) {
    matchMode = mode;
    currentRoomStatus = null;
    loadoutErrorMessage = '';
    tutorialMatchActive = mode === 'tutorial';
    if (mode === 'online') {
        hydrateOnlineStateFromUrl();
    } else {
        clearMultiplayerSession();
    }
    if (mode === 'tutorial') {
        // The tutorial is a fixed rehearsal, so the deck/knight steps are skipped
        // entirely and the server pins the loadout regardless of what is selected.
        loadoutStep = 'setup';
        loadoutMode = 'preset';
    }
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function isTutorialMatchMode() {
    return matchMode === 'tutorial';
}

function setOnlineRoomMode(mode) {
    onlineRoomMode = mode;
    currentRoomStatus = null;
    loadoutErrorMessage = '';
    clearMultiplayerSession();
    hydrateOnlineStateFromUrl();
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function hydrateOnlineStateFromUrl() {
    const joinCode = getJoinRoomCodeFromUrl();
    if (joinCode) {
        window.location.replace(`/social?room=${encodeURIComponent(joinCode.trim().toUpperCase())}`);
    }
}

// ── Tutorial match (new player onboarding) ──────────────────────────────
// Activated by the home hub's pending loadout carrying tutorial:true. The
// server pins both loadouts and starts the sparring partner on reduced health;
// winning claims the one-time reward.
let tutorialMatchActive = false;
let tutorialRewardRequested = false;


/**
 * The guided Tutorial Match coach (js/arena-tutorial.js) needs to read the live
 * match to know when the player has actually done the thing a step asks for.
 * game.js declares its state with `let`, which in a classic script is
 * script-scoped and never appears on window, so the reader is published here
 * explicitly. It is read-only by design: the coach observes the match, it never
 * drives it.
 */
window.ArenaTutorialBridge = {
    state: () => gameState,
    selected: () => selectedCard,
    previewCard: () => getFocusedPreviewCard(),
    // The cells the game itself would accept right now, so the coach can
    // recommend one instead of guessing. Same source the .legal highlight uses.
    legalPlacements: () => getSelectedLegalPlacements(),
    // True while the redraw reveal still owns the screen. The server ends the
    // MULLIGAN phase the instant the redraw lands, so a coach step that waits on
    // the phase alone advances on top of the cards turning over.
    mulliganRevealing: () => mulliganRevealHold,
    // The Setup action budget, from the same function the counter's popover uses.
    // The tutorial teaches "one placement plus one per pooled energy", and a
    // second copy of that rule in the coach would be free to drift from this one.
    setupActions: () => getSetupActionsBreakdown(),
    // True once a battle move is picked and the board is waiting for a target.
    // The battle phase is not a cutscene — the player chooses a move and a row —
    // so the coach has to be able to tell "pick your move" from "pick a target".
    battleTargeting: () => isBattleTargetSelectionActive(),
    // Row-select moves take a SECOND tap: pick the row, then confirm it. The
    // coach has to be able to tell those two apart, or its "pick a row" tip
    // stays up over a board that is already waiting on Confirm.
    battleRowPicked: () => isRowSelectBattleTargetContext() && getRowSelectSelectedRow() >= 0,
    // The confirm button's own wording ("Confirm: Middle Row - A, B, C"), so the
    // coach names the row the player actually marked instead of guessing.
    battleRowConfirmText: () => (isRowSelectBattleTargetContext() && getRowSelectSelectedRow() >= 0
        ? formatRowSelectConfirmText()
        : ''),
    // The "raw damage is not the whole number" play: weakness plus the Burn a
    // Fire hit leaves behind. Computed off the same helpers the move panel and
    // the badges render from, so the coach cannot promise a kill the board
    // disagrees with.
    burnKillPlan: () => getBattleBurnKillPlan(),
    authHeaders: (extra) => getAuthHeaders(extra || {})
};


async function claimTutorialReward() {
    if (tutorialRewardRequested) return;
    tutorialRewardRequested = true;
    try {
        const resp = await fetch('/api/player/tutorial-complete', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' })
        });
        const data = await resp.json().catch(() => ({}));
        if (data?.error) {
            showMatchNoticeToast(String(data.error).toLowerCase().includes('already')
                ? 'Tutorial already completed.'
                : data.error);
            return;
        }
        showMatchNoticeToast('Tutorial complete. A second starter pack and 250 Siegecoins were added to your account.');
    } catch (error) {
        tutorialRewardRequested = false;
        showMatchNoticeToast('Your tutorial reward is still available. Try claiming it again after your next tutorial win.');
    }
}

// Reads the hub handoff (Start Match, deck builder launch, etc.) without
// consuming it, so the boot path can decide to skip the welcome screen before
// the network settles. Returns null when missing, malformed, or stale.
function peekPendingHomeLoadout() {
    try {
        const raw = localStorage.getItem(PENDING_HOME_LOADOUT_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const pending = JSON.parse(raw);
        if (!pending || (pending.createdAt && Date.now() - pending.createdAt > 10 * 60 * 1000)) {
            return null;
        }
        return pending;
    } catch (e) {
        return null;
    }
}

function applyPendingHomeLoadout() {
    const pending = peekPendingHomeLoadout();
    try {
        localStorage.removeItem(PENDING_HOME_LOADOUT_STORAGE_KEY);
    } catch (e) {
        /* ignore storage errors */
    }
    if (!pending) {
        return;
    }
    const directLoadout = Boolean(pending.directLoadout);
    tutorialMatchActive = Boolean(pending.tutorial) || pending.mode === 'tutorial';
    // Arrived from the Home hub with a chosen loadout — skip the welcome and go straight to the loadout.
    welcomeDismissed = true;
    if (directLoadout) {
        loadoutStep = pending.startStep === 'setup' ? 'setup' : 'deck';
        if (!authState.profile?.authenticated) {
            dropStaleGuestToken();
            setLoadoutPlayerName(pending.playerName || GUEST_DIRECT_PLAYER_NAME);
        } else if (pending.playerName || authState.profile?.user?.displayName) {
            setLoadoutPlayerName(pending.playerName || authState.profile.user.displayName);
        }
    }
    if (pending.trainerId && gameOptions?.trainers?.some(trainer => trainer.id === pending.trainerId)) {
        selectedTrainerId = pending.trainerId;
    }
    if (Array.isArray(pending.customDeckCards) && pending.customDeckCards.length) {
        loadoutMode = 'builder';
        builderCounts = buildCountsFromCardList(pending.customDeckCards);
        const input = document.getElementById('saveDeckNameInput');
        if (input && pending.loadoutLabel) {
            input.value = pending.loadoutLabel;
        }
    } else if (pending.deckId && gameOptions?.decks?.some(deck => deck.id === pending.deckId)) {
        loadoutMode = 'preset';
        selectedDeckId = pending.deckId;
    }
    matchMode = tutorialMatchActive ? 'tutorial' : (pending.mode === 'online' ? 'online' : 'solo');
    if (matchMode === 'online') {
        welcomeDismissed = true;
        onlineRoomMode = pending.roomId ? 'join' : 'create';
        if (pending.roomId) {
            socialOnlineLaunchRoomId = String(pending.roomId).toUpperCase();
            const roomCodeInput = document.getElementById('roomCodeInput');
            if (roomCodeInput) {
                roomCodeInput.value = socialOnlineLaunchRoomId;
            }
        }
    }
}

async function resumeMultiplayerSession() {
    if (!multiplayerSession?.roomId || !multiplayerSession?.playerToken) {
        return false;
    }

    const reconnectingSocialLaunch = isSocialBattleLaunch();
    const data = await fetchRoomStatus();
    if (!data || data.error) {
        if (reconnectingSocialLaunch) {
            loadoutErrorMessage = data?.error || 'Could not reconnect to the online match. Check the room in Social, then try joining again.';
        }
        clearMultiplayerSession();
        return false;
    }

    matchMode = 'online';
    welcomeDismissed = true;
    currentRoomStatus = data;
    if (data.started) {
        startRoomPolling();
        applyStartedMultiplayerState(data);
    } else if (data.loadoutPhase) {
        startRoomPolling();
        renderLoadoutOptions();
        updateLoadoutSummary();
        syncEntryOverlays();
    } else {
        if (isRoomStatusExpired(data)) {
            await closeUnfilledLobby('Lobby expired before another player joined.');
            return false;
        }
        startRoomPolling();
        scheduleRoomExpiryClose(data);
        renderLoadoutOptions();
        updateLoadoutSummary();
        syncEntryOverlays();
    }
    return true;
}

function isRoomStatusExpired(status) {
    if (!status?.expiresAt || status.started) {
        return false;
    }
    return new Date(status.expiresAt).getTime() <= Date.now();
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
            if (currentRoomStatus?.roomId && !currentRoomStatus?.started && !gameState?.multiplayer) {
                void closeUnfilledLobby(data?.error || 'Lobby closed before another player joined.');
            } else if (gameState?.multiplayer || currentRoomStatus?.started) {
                console.warn(data?.error || 'Room status polling failed.');
                clearMultiplayerSession();
                gameState = null;
                openLoadoutSelector();
            }
            return;
        }
        currentRoomStatus = data;
        handleMatchStatusExtras(data);
        if (data.started) {
            clearRoomExpiryTimer();
            if (!gameState) {
                applyStartedMultiplayerState(data);
            } else {
                const prevState = gameState;
                const wasGameOver = prevState?.gameOver;
                gameState = data;
                if (wasGameOver && !data.gameOver && data.rematchStarted !== false) {
                    resetGameOverOverlayState();
                    lastProfileRefreshKey = '';
                }
                maybeNotifyTurnChange(prevState, data);
                render();
            }
        } else if (data.loadoutPhase) {
            renderLoadoutOptions();
            updateLoadoutSummary();
            syncEntryOverlays();
        } else {
            if (isRoomStatusExpired(data)) {
                void closeUnfilledLobby('Lobby expired before another player joined.');
                return;
            }
            scheduleRoomExpiryClose(data);
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

function loadoutStepIndex(step) {
    const idx = LOADOUT_STEPS.indexOf(step);
    return idx === -1 ? 0 : idx;
}

// Each step gates the next: setup needs a name/room for online play, the deck
// step needs a valid deck for the active source, and the knight/review steps
// need an owned SiegeKnight. Solo play leaves setup unconstrained.
function isLoadoutStepValid(step) {
    if (!gameOptions) return false;
    switch (step) {
        case 'setup': {
            if (matchMode !== 'online') return true;
            if (!getCurrentPlayerName()) return false;
            if (onlineRoomMode === 'join' && !isInviteJoinFlow() && !getCurrentRoomCode()) return false;
            return true;
        }
        case 'deck': {
            if (loadoutMode === 'builder') {
                return authState.profile?.authenticated && getBuilderCardCount() >= gameOptions.deckBuilder.minDeckSize;
            }
            if (loadoutMode === 'saved') {
                if (!authState.profile?.authenticated) return false;
                const savedDeck = getSelectedSavedDeck();
                if (!savedDeck) return false;
                return savedDeck.custom
                    ? (savedDeck.customDeckCards || []).length >= gameOptions.deckBuilder.minDeckSize
                    : Boolean(savedDeck.deckId);
            }
            return Boolean(selectedDeckId);
        }
        case 'knight':
        case 'review':
            return Boolean(selectedTrainerId) && getVisibleLoadoutTrainers().some(trainer => trainer.id === selectedTrainerId);
        default:
            return false;
    }
}

// Highest step index the player may reach given current validity (first
// incomplete step blocks everything past it).
function maxReachableLoadoutStep() {
    let max = 0;
    for (let i = 0; i < LOADOUT_STEPS.length - 1; i++) {
        if (isLoadoutStepValid(LOADOUT_STEPS[i])) {
            max = i + 1;
        } else {
            break;
        }
    }
    return max;
}

function setLoadoutStep(step) {
    const target = loadoutStepIndex(step);
    // Backward jumps are always allowed; forward jumps stop at the first
    // incomplete step.
    if (target > loadoutStepIndex(loadoutStep) && target > maxReachableLoadoutStep()) {
        return;
    }
    loadoutStep = LOADOUT_STEPS[target];
    updateLoadoutSummary();
    document.getElementById('loadoutOverlay')?.querySelector('.loadout-box')?.scrollTo?.({ top: 0, behavior: 'smooth' });
}

function loadoutStepBack() {
    const idx = loadoutStepIndex(loadoutStep);
    if (idx <= 0) {
        returnToPlayMain();
        return;
    }
    loadoutStep = LOADOUT_STEPS[idx - 1];
    updateLoadoutSummary();
}

// Toggles which step section is visible, updates the progress chips, and (for
// every step except the final review) repurposes the footer primary button as a
// "next" control. On review, the button keeps the start/lock label that
// applyLoadoutSummary assigned.
function syncLoadoutStepChrome() {
    const overlay = document.getElementById('loadoutOverlay');
    if (!overlay) return;
    const reachable = maxReachableLoadoutStep();
    const currentIdx = loadoutStepIndex(loadoutStep);

    overlay.querySelectorAll('.loadout-step').forEach(section => {
        section.classList.toggle('active', section.dataset.step === loadoutStep);
    });

    LOADOUT_STEPS.forEach((step, idx) => {
        const chip = document.getElementById(`loadoutStepChip-${step}`);
        if (!chip) return;
        chip.classList.toggle('active', step === loadoutStep);
        chip.classList.toggle('done', idx < currentIdx);
        const locked = idx > reachable || (isTutorialMatchMode() && step !== 'setup');
        chip.classList.toggle('locked', locked);
        chip.disabled = locked;
        chip.setAttribute('aria-selected', step === loadoutStep ? 'true' : 'false');
    });

    const backBtn = document.getElementById('loadoutBackBtn');
    if (backBtn) {
        backBtn.textContent = currentIdx <= 0 ? 'Main Menu' : 'Back';
    }

    const primary = document.getElementById('btnStartLoadout');
    if (gameOptions && primary && isTutorialMatchMode()) {
        primary.onclick = startSelectedGame;
        syncLoadoutStartButton(primary, loadoutStartPending,
            loadoutStartPending ? 'Starting Tutorial...' : 'Start Tutorial Match');
        return;
    }
    if (gameOptions && primary && loadoutStep !== 'review') {
        const labels = { setup: 'Choose Deck', deck: 'Select SiegeKnight', knight: 'To Battle' };
        primary.onclick = () => setLoadoutStep(LOADOUT_STEPS[currentIdx + 1]);
        syncLoadoutStartButton(primary, !isLoadoutStepValid(loadoutStep), labels[loadoutStep] || 'Next');
    }
}

// Populates the Step 3 quick-swap dropdowns from the same option pools used by
// the deck/knight grids so swaps reuse the existing selection handlers.
function renderLoadoutSwaps() {
    if (!gameOptions) return;
    const deckSelect = document.getElementById('loadoutDeckSwap');
    const knightSelect = document.getElementById('loadoutKnightSwap');

    if (deckSelect) {
        const savedDecks = authState.profile?.savedDecks || [];
        let html = '';
        if (loadoutMode === 'builder') {
            html += `<option value="" selected disabled>Custom Build (edit on Deck step)</option>`;
        }
        html += `<optgroup label="Preset Decks">`;
        html += getVisibleLoadoutDecks().map(deck => {
            const selected = loadoutMode === 'preset' && deck.id === selectedDeckId ? ' selected' : '';
            return `<option value="preset:${escapeHtmlAttribute(deck.id)}"${selected}>${escapeHtml(deck.name)}</option>`;
        }).join('');
        html += `</optgroup>`;
        if (authState.profile?.authenticated) {
            html += `<optgroup label="My Decks">`;
            html += savedDecks.length
                ? savedDecks.map(deck => {
                    const selected = loadoutMode === 'saved' && deck.id === selectedSavedDeckId ? ' selected' : '';
                    return `<option value="saved:${escapeHtmlAttribute(deck.id)}"${selected}>${escapeHtml(deck.name)}</option>`;
                }).join('')
                : `<option value="" disabled>No saved decks yet</option>`;
            html += `</optgroup>`;
        } else {
            html += `<optgroup label="My Decks"><option value="" disabled>Sign in to use My Decks</option></optgroup>`;
        }
        deckSelect.innerHTML = html;
    }

    if (knightSelect) {
        const trainers = getVisibleLoadoutTrainers();
        knightSelect.innerHTML = trainers.map(trainer => {
            const selected = trainer.id === selectedTrainerId ? ' selected' : '';
            return `<option value="${escapeHtmlAttribute(trainer.id)}"${selected}>${escapeHtml(trainer.name)} - ${escapeHtml(formatElementLabel(trainer.element))}</option>`;
        }).join('');
        knightSelect.disabled = trainers.length === 0;
    }
}

function onLoadoutDeckSwap(value) {
    if (!value) return;
    const sep = value.indexOf(':');
    const kind = value.slice(0, sep);
    const id = value.slice(sep + 1);
    if (kind === 'preset') {
        switchLoadoutMode('preset');
        selectDeckOption(id);
    } else if (kind === 'saved') {
        switchLoadoutMode('saved');
        selectSavedDeckForLoadout(id);
    }
    updateLoadoutSummary();
}

function onLoadoutKnightSwap(value) {
    if (!value) return;
    selectTrainerOption(value);
    updateLoadoutSummary();
}

// Card ids in the currently selected deck, used to surface evolution lines on
// the review step. Returns [] when the source has no resolvable list.
function getDeckLoadoutCardIds() {
    if (!gameOptions) return [];
    if (loadoutMode === 'builder') {
        return Object.keys(builderCounts);
    }
    if (loadoutMode === 'saved') {
        const savedDeck = getSelectedSavedDeck();
        if (!savedDeck) return [];
        if (savedDeck.custom) {
            return Array.from(new Set(savedDeck.customDeckCards || []));
        }
        const deck = gameOptions.decks.find(item => item.id === savedDeck.deckId);
        return (deck?.cards || []).map(entry => entry.id);
    }
    const deck = gameOptions.decks.find(item => item.id === selectedDeckId);
    return (deck?.cards || []).map(entry => entry.id);
}

// Evolution cards present in the selected deck. Empty when the full card
// catalog is unavailable (options-lite) or the deck has none.
function getDeckEvolutionLines() {
    const catalog = gameOptions?.cardCatalog;
    if (!Array.isArray(catalog) || !catalog.length) return [];
    const byId = new Map(catalog.map(card => [card.id, card]));
    const seen = new Set();
    const lines = [];
    getDeckLoadoutCardIds().forEach(id => {
        const card = byId.get(id);
        if (card && card.evolvesFromName && !seen.has(card.id)) {
            seen.add(card.id);
            lines.push({ name: card.name, from: card.evolvesFromName });
        }
    });
    return lines;
}

function getDeckOpeningHandHints() {
    const catalog = gameOptions?.cardCatalog;
    if (!Array.isArray(catalog) || !catalog.length) return [];
    const byId = new Map(catalog.map(card => [card.id, card]));
    const seen = new Set();
    const hints = [];
    getDeckLoadoutCardIds().forEach(id => {
        const card = byId.get(id);
        if (!card || seen.has(card.id)) return;
        const type = String(card.type || '').toUpperCase();
        const directCost = Number(card.costAmount || 0);
        const comboCost = Number(card.requiredComboSize || 0);
        // Opening keeps are strictly 0-cost base-starter Siegelings. On turn one
        // there is no energy yet (energy comes from placed/linked Siegelings), so
        // only a free Siegling can actually be placed to open the game. Paid
        // starters and evolutions (which need their live precursor) can't open,
        // and free utility spells/traps are not something you keep on their own.
        const isZeroCostStarter = type === 'SIEGLING'
            && !card.evolvesFromId && !card.evolvesFromName
            && directCost <= 0 && comboCost <= 0;
        if (!isZeroCostStarter) return;
        seen.add(card.id);
        hints.push({
            name: card.name,
            element: card.element,
            type,
            reason: formatOpeningHandHintReason(card, true)
        });
    });
    return hints
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8);
}

function formatOpeningHandHintReason(card, isBaseStarter = false) {
    const costAmount = Number(card?.costAmount || 0);
    if (costAmount > 0) {
        const costElement = card?.costElement || card?.element;
        return costElement
            ? `${costAmount} ${formatElementLabel(costElement)} cost`
            : `${costAmount} energy cost`;
    }
    return isBaseStarter ? '0-cost starter' : '0-cost keep';
}

function renderLoadoutAuthGate(kind) {
    const isBuilder = kind === 'builder';
    const title = isBuilder ? 'Sign in to use Deck Builder' : 'Sign in to use My Decks';
    const copy = isBuilder
        ? 'Create an account or sign in to build custom decks from your binder. Preset decks are ready for guest battles.'
        : 'Create an account or sign in to load decks saved to your binder. Preset decks are ready for guest battles.';
    return `<div class="loadout-auth-gate">
        <div>
            <div class="selected-loadout-subtle-label">Account Required</div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(copy)}</p>
        </div>
        <div class="loadout-auth-gate-actions">
            <button class="btn btn-primary" type="button" onclick="openAuthPopup('login')">Sign In</button>
            <button class="btn" type="button" onclick="openAuthPopup('register')">Create Account</button>
            <button class="btn loadout-auth-preset-btn" type="button" onclick="switchLoadoutMode('preset')">Use Presets</button>
        </div>
    </div>`;
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
    const savedTab = document.getElementById('savedTab');
    const builderTab = document.getElementById('builderTab');
    const presetPanel = document.getElementById('presetLoadoutPanel');
    const savedPanel = document.getElementById('savedLoadoutPanel');
    const builderPanel = document.getElementById('builderLoadoutPanel');
    const loadoutKicker = document.getElementById('loadoutKicker');
    const loadoutTitle = document.getElementById('loadoutTitle');
    const loadoutSubtitle = document.getElementById('loadoutSubtitle');
    const inviteRoomBadge = document.getElementById('inviteRoomBadge');
    const playerIdentityNote = document.getElementById('playerIdentityNote');

    hydrateSavedPlayerName();

    const selectedDeck = gameOptions.decks.find(deck => deck.id === selectedDeckId);
    const recommendedTrainerIds = new Set(getRecommendedTrainerIdsForDeck(selectedDeck));

    // Locked presets unlock in Decks — battle selection only lists playable ones.
    // A locked deck must never stay selected — the backend rejects it at match start.
    if (isPremadeDeckLocked(gameOptions.decks.find(deck => deck.id === selectedDeckId))) {
        selectedDeckId = firstUnlockedDeckId() || selectedDeckId;
    }

    deckEl.innerHTML = getVisibleLoadoutDecks().map(deck => {
        const selected = deck.id === selectedDeckId ? ' selected' : '';
        const bg = buildDeckBackground(deck.elements);
        const borderColor = buildDeckBorderColors(deck.elements);
        const elementLabels = deck.elements.map(formatElementLabel).join(' / ');
        const elClasses = deck.elements.map(e => 'el-' + e.toLowerCase()).join(' ');
        const deckTheme = getDeckLoadoutTheme(deck);
        const primaryElement = deckTheme.element || deck.elements?.[0] || 'NEUTRAL';
        const primaryHex = getElementHex(primaryElement);
        const traits = (deckTheme.traits || []).slice(0, 3);
        const deckArt = deckArtAssetForElements(deck.elements);

        /* Build spine bands - each element gets its own colored band with a sigil inside */
        const spineBands = deck.elements.map(el => {
            const c = getElementHex(el);
            return `<div class="spine-band" style="background:${c}"></div>`;
        }).join('');
        const faceSigils = deckArt ? '' : buildDeckFaceSigils(deck.elements);
        const artStyle = deckArt?.back ? `;--deck-art:url('${deckArt.back}')` : '';

        return `<button type="button" class="deck-card${selected} ${elClasses}${deckArt ? ' has-deck-art' : ''}" style="--deck-bg:${bg};--deck-border:${borderColor};--deck-accent:${primaryHex};--deck-glow:${hexToRgba(primaryHex, 0.28)};--deck-glow-strong:${hexToRgba(primaryHex, 0.58)}${artStyle}" onclick="selectDeckOption('${deck.id}')" aria-pressed="${deck.id === selectedDeckId ? 'true' : 'false'}">
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

    const visibleTrainers = getVisibleLoadoutTrainers();
    if (visibleTrainers.length > 0 && !visibleTrainers.some((trainer) => trainer.id === selectedTrainerId)) {
        selectedTrainerId = visibleTrainers[0].id;
    }
    visibleTrainers.forEach((trainer) => preloadArtUrl(knightUploadedCardArtUrl(trainer)));
    trainerEl.innerHTML = visibleTrainers.map(trainer => {
        const selected = trainer.id === selectedTrainerId ? ' selected' : '';
        const elHex = getElementHex(trainer.element);
        const sigil = getTrainerSigil(trainer);
        const rarityClass = getRarityClass(trainer.rarity);
        const tier = formatTrainerTier(trainer.tier);
        const activeLabel = trainer.oncePerGame ? 'Ultimate' : 'Active';
        const recommended = recommendedTrainerIds.has(trainer.id) ? ' recommended' : '';
        // SiegeKnight levels do not apply in Battle, so the loadout no longer shows a
        // level badge. The level data still arrives from the backend and the progression
        // logic stays intact for the upcoming Siege roguelike mode.
        const levelBadge = '';
        let topRibbon = '';
        if (trainer.id === selectedTrainerId) {
            topRibbon = '<span class="knight-selected-ribbon">Selected</span>';
        } else if (recommended) {
            topRibbon = '<span class="knight-recommend-ribbon">Recommended</span>';
        }
        const fullCardArtUrl = String(trainer.cardArtUrl || '').trim();
        const fullCardMode = String(trainer.cardArtMode || '').trim().toUpperCase() === 'FULL_CARD';
        // Name / type / passive / ultimate, shown in the description box for every
        // SiegeKnight card — including hand-drawn full-art cards, which previously
        // rendered the artwork alone with no readable info.
        const knightCardBody = `
            <div class="knight-card-body">
                <span class="knight-card-name">${escapeHtml(trainer.name)}</span>
                <span class="knight-card-meta"><span class="knight-element">${escapeHtml(formatElementLabel(trainer.element))}</span> <span class="knight-tier tier-${tier.toLowerCase()}">${escapeHtml(tier)}</span> <span class="knight-rarity rarity-${rarityClass}">${escapeHtml(trainer.rarity)}</span></span>
                <span class="knight-card-ability"><span>Passive</span>${escapeHtml(readTrainerAbilityText(trainer.passive))}</span>
                <span class="knight-card-ability"><span>${escapeHtml(activeLabel)}</span>${escapeHtml(readTrainerAbilityText(trainer.active))}</span>
            </div>`;
        if (fullCardArtUrl && fullCardMode) {
            const holoClass = cardShowsPlayerHolographic(trainer) ? ' is-holographic' : '';
            const holoOverlay = cardShowsPlayerHolographic(trainer) ? '<div class="card-holographic-overlay" aria-hidden="true"></div>' : '';
            return `<button type="button" class="knight-card knight-full-card-art${holoClass}${selected}${recommended} rarity-frame-${rarityClass} el-${trainer.element.toLowerCase()}" data-trainer-id="${escapeHtmlAttribute(trainer.id)}" style="--knight-color:${elHex};--knight-glow:${hexToRgba(elHex, 0.36)}" onclick="selectTrainerOption('${trainer.id}')" aria-pressed="${trainer.id === selectedTrainerId ? 'true' : 'false'}">
                ${topRibbon}
                ${levelBadge}
                <img ${webpImgAttrs(fullCardArtUrl)} alt="${escapeHtmlAttribute(trainer.name || 'SiegeKnight card')}" loading="eager" decoding="async"${knightArtStyleAttr(trainer)}>
                ${holoOverlay}
                ${knightCardBody}
            </button>`;
        }
        const overlayMode = String(trainer.cardArtMode || '').trim().toUpperCase() === 'OVERLAY';
        if (fullCardArtUrl && overlayMode) {
            // Character art behind the shared template frame: window stays
            // transparent, description box dims the art, shield/border stay fixed.
            // Built inline (no card-binder-visual dependency) since play.html
            // does not load that module.
            const holoClass = cardShowsPlayerHolographic(trainer) ? ' is-holographic' : '';
            const holoOverlay = cardShowsPlayerHolographic(trainer) ? '<div class="card-holographic-overlay" aria-hidden="true"></div>' : '';
            return `<button type="button" class="knight-card knight-full-card-art knight-overlay-art${holoClass}${selected}${recommended} rarity-frame-${rarityClass} el-${trainer.element.toLowerCase()}" data-trainer-id="${escapeHtmlAttribute(trainer.id)}" style="--knight-color:${elHex};--knight-glow:${hexToRgba(elHex, 0.36)};${siegeknightCardBackStyle()}" onclick="selectTrainerOption('${trainer.id}')" aria-pressed="${trainer.id === selectedTrainerId ? 'true' : 'false'}">
                ${topRibbon}
                ${levelBadge}
                <div class="knight-overlay-art-window"><img class="knight-overlay-art-img" ${webpImgAttrs(fullCardArtUrl)} alt="" loading="eager" decoding="async"${knightArtStyleAttr(trainer)}></div>
                <div class="knight-card-template" aria-hidden="true"></div>
                ${holoOverlay}
                ${knightCardBody}
            </button>`;
        }
        return `<button type="button" class="knight-card has-knight-back${selected}${recommended} rarity-frame-${rarityClass} el-${trainer.element.toLowerCase()}" data-trainer-id="${escapeHtmlAttribute(trainer.id)}" style="--knight-color:${elHex};--knight-glow:${hexToRgba(elHex, 0.36)};${siegeknightCardBackStyle()}" onclick="selectTrainerOption('${trainer.id}')" aria-pressed="${trainer.id === selectedTrainerId ? 'true' : 'false'}">
            ${topRibbon}
            ${levelBadge}
            <div class="knight-card-sigil">${sigil}</div>
            <div class="knight-card-portrait has-knight-back" aria-hidden="true"></div>
            <div class="knight-card-template" aria-hidden="true"></div>
            ${knightCardBody}
        </button>`;
    }).join('');
    scheduleSiegeKnightCardFit();

    const hideOnlineLoadout = !shouldShowOnlineLoadoutOnPlay();
    overlay?.classList.toggle('invite-flow', inviteFlow);
    loadoutBox?.classList.toggle('invite-focused', inviteFlow);
    matchModeTabs?.classList.toggle('hidden', inviteFlow || hideOnlineLoadout);
    roomModeTabs?.classList.toggle('hidden', inviteFlow || hideOnlineLoadout);
    if (hideOnlineLoadout && matchMode === 'online' && !multiplayerSession?.roomId && !inviteFlow) {
        matchMode = 'solo';
    }

    if (inviteFlow) {
        const inviteCode = getCurrentRoomCode() || getJoinRoomCodeFromUrl()?.toUpperCase() || '';
        loadoutKicker.textContent = 'Online Invite';
        loadoutTitle.textContent = 'Join This Match';
        loadoutSubtitle.textContent = 'Choose your name and favorite build, then jump straight into the invited room.';
        inviteRoomBadge.textContent = `Room ${inviteCode}`;
        inviteRoomBadge.classList.remove('hidden');
        playerIdentityNote.textContent = 'This is the name your opponent will see when you join.';
    } else if (matchMode === 'online') {
        if (currentRoomStatus?.loadoutPhase) {
            loadoutKicker.textContent = 'Match Loadout';
            loadoutTitle.textContent = 'Choose Deck & SiegeKnight';
            loadoutSubtitle.textContent = 'Lock in your build. The match begins once both players confirm their loadouts.';
        } else {
            loadoutKicker.textContent = onlineRoomMode === 'create' ? 'Online Match' : 'Join Online Match';
            loadoutTitle.textContent = onlineRoomMode === 'create' ? 'Create Your Room' : 'Choose Your Match Loadout';
            loadoutSubtitle.textContent = onlineRoomMode === 'create'
                ? 'Enter your name, pick your favorite deck, and choose the SiegeKnight you want to lead your room.'
                : 'Enter your name, choose the build you want to bring, and then join the room.';
        }
        inviteRoomBadge.classList.add('hidden');
        playerIdentityNote.textContent = 'This name is shown in online matches and saved on this device.';
    } else if (isTutorialMatchMode()) {
        loadoutKicker.textContent = 'Practice';
        loadoutTitle.textContent = 'Tutorial Match';
        loadoutSubtitle.textContent = 'Enter your name, then learn Arena in a guided practice match.';
        inviteRoomBadge.classList.add('hidden');
        playerIdentityNote.textContent = 'Your name appears above your board.';
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
    const tutorialMatchTab = document.getElementById('tutorialMatchTab');
    const tutorialMatchPanel = document.getElementById('tutorialMatchPanel');
    if (tutorialMatchTab) {
        tutorialMatchTab.classList.toggle('active', isTutorialMatchMode());
        tutorialMatchTab.setAttribute('aria-pressed', isTutorialMatchMode() ? 'true' : 'false');
        tutorialMatchTab.classList.toggle('hidden', inviteFlow);
    }
    tutorialMatchPanel?.classList.toggle('hidden', !isTutorialMatchMode());
    onlineMatchPanel.classList.toggle('hidden', matchMode !== 'online' || hideOnlineLoadout);
    hostRoomTab.classList.toggle('active', onlineRoomMode === 'create');
    joinRoomTab.classList.toggle('active', onlineRoomMode === 'join');
    hostRoomTab.setAttribute('aria-pressed', onlineRoomMode === 'create' ? 'true' : 'false');
    joinRoomTab.setAttribute('aria-pressed', onlineRoomMode === 'join' ? 'true' : 'false');
    hostRoomTab.classList.toggle('hidden', inviteFlow);
    joinRoomTab.classList.toggle('hidden', inviteFlow);
    roomCodeField.classList.toggle('hidden', inviteFlow || onlineRoomMode !== 'join');

    presetTab.classList.toggle('active', loadoutMode === 'preset');
    savedTab?.classList.toggle('active', loadoutMode === 'saved');
    builderTab.classList.toggle('active', loadoutMode === 'builder');
    presetTab.setAttribute('aria-pressed', loadoutMode === 'preset' ? 'true' : 'false');
    savedTab?.setAttribute('aria-pressed', loadoutMode === 'saved' ? 'true' : 'false');
    builderTab.setAttribute('aria-pressed', loadoutMode === 'builder' ? 'true' : 'false');
    presetPanel.classList.toggle('hidden', loadoutMode !== 'preset');
    savedPanel?.classList.toggle('hidden', loadoutMode !== 'saved');
    builderPanel.classList.toggle('hidden', loadoutMode !== 'builder');
    loadoutBox?.classList.toggle('loadout-mode-builder', loadoutMode === 'builder');
    loadoutBox?.classList.toggle('loadout-mode-saved', loadoutMode === 'saved');
    renderSavedDeckLoadoutOptions();
    renderSelectedLoadoutPreview();
    renderDeckBuilder();
    renderOnlineStatus();
    renderSavedDecks();
    syncLoadoutStepChrome();
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

function renderLoadoutCommanderArt(trainer) {
    const artUrl = knightUploadedCardArtUrl(trainer);
    const artMode = knightCardArtMode(trainer);
    const elementStyle = `--knight-color:${getElementHex(trainer?.element)};${siegeknightCardBackStyle()}`;

    if (artUrl && artMode === 'FULL_CARD') {
        return `<div class="preview-knight-icon has-knight-art has-knight-fullart">
            <img class="preview-knight-art-img" ${webpImgAttrs(artUrl)} alt="${escapeHtmlAttribute(trainer?.name || 'SiegeKnight card')}" loading="lazy"${knightArtStyleAttr(trainer)}>
        </div>`;
    }
    if (artUrl && artMode === 'OVERLAY') {
        return `<div class="preview-knight-icon has-knight-art has-knight-overlay-art" style="${escapeHtmlAttribute(elementStyle)}">
            ${knightHudOverlayCardInnerHtml(trainer, artUrl)}
        </div>`;
    }
    return `<div class="preview-knight-icon has-knight-back" style="color:${getElementHex(trainer?.element)};${siegeknightCardBackStyle()}">
        <span class="preview-knight-element-badge">${getElementSigil(trainer?.element)}</span>
    </div>`;
}

function renderSelectedLoadoutPreview() {
    const previewEl = document.getElementById('selectedLoadoutPreview');
    const panel = document.getElementById('selectedLoadoutPanel');
    if (!previewEl || !panel) return;

    if (!gameOptions) {
        previewEl.innerHTML = `<div class="selected-loadout-kicker">Selected Loadout</div><div class="selected-loadout-empty">Loading deck and SiegeKnight choices...</div>`;
        return;
    }

    const savedDeck = loadoutMode === 'saved' ? getSelectedSavedDeck() : null;
    const deck = loadoutMode === 'saved'
        ? (savedDeck?.custom ? null : gameOptions.decks.find(item => item.id === savedDeck?.deckId))
        : gameOptions.decks.find(item => item.id === selectedDeckId);
    const trainer = gameOptions.trainers.find(item => item.id === selectedTrainerId);
    const theme = loadoutMode === 'builder' || (loadoutMode === 'saved' && savedDeck?.custom)
        ? getDeckLoadoutTheme(null)
        : getDeckLoadoutTheme(deck);
    const element = theme.element || deck?.elements?.[0] || trainer?.element || 'NEUTRAL';
    const accent = getElementHex(element);
    panel.style.setProperty('--loadout-accent', accent);
    panel.style.setProperty('--loadout-accent-soft', hexToRgba(accent, 0.18));
    panel.style.setProperty('--loadout-accent-glow', hexToRgba(accent, 0.32));

    // Title reflects what the player actually selected: the premade deck's
    // own name in preset mode, or the custom/saved loadout name otherwise.
    // The free-text "save loadout" input must not shadow the selected deck's
    // name (otherwise picking Gale Talons could still read "Blazing Core").
    const deckName = loadoutMode === 'builder'
        ? (getActiveLoadoutLabel() || 'Custom Loadout')
        : loadoutMode === 'saved'
            ? (savedDeck?.name || deck?.name || 'Saved Loadout')
            : (deck?.name || 'Choose a Deck');
    const elementLabel = loadoutMode === 'builder'
        ? (collectBuilderElements() || 'Custom Elements')
        : loadoutMode === 'saved'
            ? getSavedDeckElements(savedDeck).map(formatElementLabel).join(' / ')
            : (deck?.elements || []).map(formatElementLabel).join(' / ');
    const traits = theme.traits?.length ? theme.traits : ['Build', 'Adapt', 'Plan'];
    const recommendedIds = (loadoutMode === 'builder' || savedDeck?.custom) ? [] : getRecommendedTrainerIdsForDeck(deck);
    const recommendedNames = recommendedIds
        .map(id => gameOptions.trainers.find(item => item.id === id)?.name)
        .filter(Boolean)
        .slice(0, 4);

    const evolutionLines = getDeckEvolutionLines();
    const openingHints = getDeckOpeningHandHints();
    const strategyDescription = theme.description || deck?.description || 'Tune your list, choose a commander, and bring your preferred plan into battle.';
    const openingBlock = openingHints.length
        ? `<div class="selected-loadout-opening-block">
                <div class="selected-loadout-subtle-label">Opening Hand Keeps</div>
                <p class="selected-loadout-opening-copy">Keep a 0-cost starter Siegling so you can place one on turn one, or mulligan toward one if your hand opens slow.</p>
                <div class="selected-loadout-opening-cards">
                    ${openingHints.map(card => `<span class="loadout-opening-card" style="--opening-el:${getElementHex(card.element)}"><strong>${escapeHtml(card.name)}</strong><em>${escapeHtml(card.reason)}</em></span>`).join('')}
                </div>
            </div>`
        : '';
    const evolutionBlock = evolutionLines.length
        ? `<div class="selected-loadout-evolution-block">
                <div class="selected-loadout-subtle-label">Cards That Evolve</div>
                <div class="selected-loadout-evolutions">
                    ${evolutionLines.map(line => `<span class="loadout-evolution"><strong>${escapeHtml(line.name)}</strong> &#9666; from ${escapeHtml(line.from)}</span>`).join('')}
                </div>
            </div>`
        : '';
    const strategySection = `<div class="selected-loadout-section selected-loadout-strategy">
            <div class="selected-loadout-label">Strategy</div>
            <p class="selected-loadout-strategy-copy">${escapeHtml(strategyDescription)}</p>
            <div class="selected-loadout-subtle-label">Deck Strengths</div>
            <div class="selected-loadout-traits">
                ${traits.map(trait => `<span>${escapeHtml(trait)}</span>`).join('')}
            </div>
            ${openingBlock}
            ${evolutionBlock}
        </div>`;

    const trainerSummary = trainer
        ? `<div class="preview-knight-card">
                ${renderLoadoutCommanderArt(trainer)}
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
        ${strategySection}
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

    renderLoadoutSwaps();
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
    if (currentRoomStatus.loadoutPhase) {
        const opponent = escapeHtml(currentRoomStatus.enemyName || 'Opponent');
        if (currentRoomStatus.viewerLoadoutReady && !currentRoomStatus.opponentLoadoutReady) {
            statusEl.innerHTML = `Room ${roomLabel}: waiting for ${opponent} to lock in deck and SiegeKnight.`;
        } else if (!currentRoomStatus.viewerLoadoutReady && currentRoomStatus.opponentLoadoutReady) {
            statusEl.innerHTML = `${opponent} is ready. Choose your deck and SiegeKnight, then lock in your loadout.`;
        } else {
            statusEl.innerHTML = `Both players are in room ${roomLabel}. Pick your deck and SiegeKnight, then lock in your loadout.`;
        }
        return;
    }
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

    if (!authState.profile?.authenticated) {
        elementFiltersEl.innerHTML = '';
        typeFiltersEl.innerHTML = '';
        catalogEl.innerHTML = renderLoadoutAuthGate('builder');
        deckListEl.innerHTML = '<div class="builder-empty">Your custom deck list unlocks after sign in.</div>';
        previewEl.innerHTML = '<div class="builder-empty">Sign in or create an account to preview and save custom builds.</div>';
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
        return `<button class="builder-filter${active}" onclick="setBuilderTypeFilter('${filter}')">${formatBuilderTypeFilterLabel(filter)}</button>`;
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
    if (isTutorialMatchMode()) {
        return 'Start Tutorial Match';
    }
    if (matchMode === 'online') {
        if (currentRoomStatus?.loadoutPhase) {
            return currentRoomStatus.viewerLoadoutReady ? 'Waiting for opponent...' : 'Lock Loadout';
        }
        return isInviteJoinFlow() ? 'Join Match' : (onlineRoomMode === 'create' ? 'Create Room' : 'Join Room');
    }
    return 'Start Battle';
}

function getLoadoutStartButtonBusyLabel() {
    if (isTutorialMatchMode()) {
        return 'Starting Tutorial...';
    }
    if (matchMode === 'online') {
        if (currentRoomStatus?.loadoutPhase) {
            return 'Locking loadout...';
        }
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

// Public entry point: refresh the summary/start-button, then re-sync the wizard
// chrome so the visible step, progress chips, and footer button stay correct on
// every state change. applyLoadoutSummary owns the review-step button semantics;
// syncLoadoutStepChrome overrides the button for the earlier "next" steps.
function updateLoadoutSummary() {
    applyLoadoutSummary();
    syncLoadoutStepChrome();
}

function applyLoadoutSummary() {
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
    if (isTutorialMatchMode()) {
        summary.innerHTML = 'Tutorial: <strong>Ashen Roots</strong> with <strong>Squire Bob</strong> versus the Training Dummy. Replay it as often as you like.';
        if (startBtn) {
            startBtn.onclick = startSelectedGame;
            syncLoadoutStartButton(startBtn, loadoutStartPending, startButtonLabel);
        }
        return;
    }
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

    if (matchMode === 'online' && currentRoomStatus?.loadoutPhase) {
        const opponent = escapeHtml(currentRoomStatus.enemyName || 'Opponent');
        if (currentRoomStatus.viewerLoadoutReady) {
            summary.innerHTML = `Loadout locked. Waiting for <strong>${opponent}</strong> to finish choosing deck and SiegeKnight.`;
        } else if (currentRoomStatus.opponentLoadoutReady) {
            summary.innerHTML = `<strong>${opponent}</strong> is ready. Lock in your deck and SiegeKnight to start the match.`;
        } else {
            summary.innerHTML = `Both players are in room <strong>${currentRoomStatus.roomId}</strong>. Choose your deck and SiegeKnight, then lock in your loadout.`;
        }
        syncLoadoutStartButton(startBtn, loadoutStartPending || currentRoomStatus.viewerLoadoutReady, startButtonLabel);
        return;
    }

    if (matchMode === 'online' && currentRoomStatus?.roomId && !currentRoomStatus.started) {
        summary.innerHTML = `Room <strong>${currentRoomStatus.roomId}</strong> is ready. Waiting for your opponent to join.`;
        syncLoadoutStartButton(startBtn, true, startButtonLabel);
        return;
    }

    if (loadoutErrorMessage && matchMode === 'online') {
        const canRetryOnlineStart = Boolean(multiplayerSession?.roomId || (onlineRoomMode === 'join' && getCurrentRoomCode()));
        summary.textContent = loadoutErrorMessage;
        syncLoadoutStartButton(startBtn, loadoutStartPending || !canRetryOnlineStart, startButtonLabel);
        return;
    }

    if (loadoutMode === 'builder') {
        if (!authState.profile?.authenticated) {
            summary.textContent = 'Sign in or create an account to use Deck Builder.';
            syncLoadoutStartButton(startBtn, true, startButtonLabel);
            return;
        }
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

    if (loadoutMode === 'saved') {
        const savedDeck = getSelectedSavedDeck();
        if (!authState.profile?.authenticated) {
            summary.textContent = 'Sign in or create an account to use decks from your binder.';
            syncLoadoutStartButton(startBtn, true, startButtonLabel);
            return;
        }
        if (!savedDeck) {
            summary.textContent = 'Choose a saved deck from your binder, then pick a SiegeKnight.';
            syncLoadoutStartButton(startBtn, true, startButtonLabel);
            return;
        }
        const cardCount = savedDeck.custom ? (savedDeck.customDeckCards || []).length : null;
        const valid = savedDeck.custom
            ? cardCount >= gameOptions.deckBuilder.minDeckSize
            : Boolean(savedDeck.deckId);
        const elementList = getSavedDeckElements(savedDeck).map(formatElementLabel).join(' / ');
        summary.innerHTML = `My Deck: <strong>${escapeHtml(savedDeck.name)}</strong>${cardCount != null ? ` | <strong>${cardCount}</strong> cards` : ''}${elementList ? ` | Elements: <strong>${elementList}</strong>` : ''} | SiegeKnight: <strong>${trainer.name}</strong>${playerName ? ` | Name: <strong>${playerName}</strong>` : ''}`;
        if (!valid) {
            summary.innerHTML += savedDeck.custom
                ? ` | This deck needs at least <strong>${gameOptions.deckBuilder.minDeckSize}</strong> cards.`
                : ' | This saved deck is missing its premade reference.';
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

    summary.innerHTML = `${matchMode === 'online' ? 'Build' : 'Deck'}: <strong>${escapeHtml(deck.name)}</strong> | SiegeKnight: <strong>${trainer.name}</strong>${playerName ? ` | Name: <strong>${playerName}</strong>` : ''}`;
    syncLoadoutStartButton(
        startBtn,
        loadoutStartPending || (matchMode === 'online' && onlineRoomMode === 'join' && !getCurrentRoomCode()) || (needsPlayerName && !playerName),
        startButtonLabel
    );
}

async function startSelectedGame() {
    if (loadoutStartPending) return;
    if (isTutorialMatchMode()) {
        loadoutStartPending = true;
        updateLoadoutSummary();
        try {
            await newGame();
        } finally {
            loadoutStartPending = false;
            updateLoadoutSummary();
        }
        return;
    }
    if (!selectedTrainerId) return;
    if (loadoutMode === 'preset' && !selectedDeckId) return;
    if ((loadoutMode === 'builder' || loadoutMode === 'saved') && !authState.profile?.authenticated) {
        openAuthPopup('login');
        return;
    }
    if (loadoutMode === 'builder' && getBuilderCardCount() < gameOptions.deckBuilder.minDeckSize) return;
    if (loadoutMode === 'builder') {
        const missing = getUnknownLoadoutCardIds(Object.keys(builderCounts));
        if (missing.length) {
            loadoutErrorMessage = unknownLoadoutCardMessage(missing);
            showErrorToast(loadoutErrorMessage);
            updateLoadoutSummary();
            return;
        }
    }
    if (loadoutMode === 'saved') {
        const savedDeck = getSelectedSavedDeck();
        if (!savedDeck) return;
        if (savedDeck.custom && (savedDeck.customDeckCards || []).length < gameOptions.deckBuilder.minDeckSize) return;
        if (!savedDeck.custom && !savedDeck.deckId) return;
        const missing = savedDeck.custom ? getUnknownLoadoutCardIds(savedDeck.customDeckCards || []) : [];
        if (missing.length) {
            loadoutErrorMessage = unknownLoadoutCardMessage(missing);
            showErrorToast(loadoutErrorMessage);
            updateLoadoutSummary();
            return;
        }
    }

    loadoutStartPending = true;
    loadoutErrorMessage = '';
    updateLoadoutSummary();

    try {
        if (matchMode === 'online') {
            if (multiplayerSession?.roomId) {
                if (currentRoomStatus?.loadoutPhase && !currentRoomStatus.viewerLoadoutReady) {
                    await submitMatchLoadout();
                    return;
                }
                const data = await fetchRoomStatus();
                if (data?.started) {
                    loadoutErrorMessage = '';
                    currentRoomStatus = data;
                    applyStartedMultiplayerState(data);
                    return;
                }
                if (data && !data.error) {
                    currentRoomStatus = data;
                    startRoomPolling();
                    if (data.loadoutPhase) {
                        renderLoadoutOptions();
                        updateLoadoutSummary();
                        syncEntryOverlays();
                        return;
                    }
                    if (isRoomStatusExpired(data)) {
                        await closeUnfilledLobby('Lobby expired before another player joined.');
                    } else {
                        scheduleRoomExpiryClose(data);
                        renderLoadoutOptions();
                        syncEntryOverlays();
                    }
                    return;
                }
                loadoutErrorMessage = data?.error || 'Could not reconnect to the online match. Check the room in Social, then try again.';
                return;
            }
            if (onlineRoomMode === 'create' && !isInviteJoinFlow()) {
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
    if (loadoutMode === 'builder') {
        return { trainerId: selectedTrainerId, customDeckCards: getBuilderSelectedCards(), loadoutLabel: getActiveLoadoutLabel() };
    }
    if (loadoutMode === 'saved') {
        const savedDeck = getSelectedSavedDeck();
        if (!savedDeck) {
            return { trainerId: selectedTrainerId, loadoutLabel: getActiveLoadoutLabel() };
        }
        if (savedDeck.custom) {
            return {
                trainerId: selectedTrainerId,
                customDeckCards: savedDeck.customDeckCards || [],
                loadoutLabel: savedDeck.name || getActiveLoadoutLabel()
            };
        }
        return {
            deckId: savedDeck.deckId,
            trainerId: selectedTrainerId,
            loadoutLabel: savedDeck.name || getActiveLoadoutLabel()
        };
    }
    return { deckId: selectedDeckId, trainerId: selectedTrainerId, loadoutLabel: getActiveLoadoutLabel() };
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
        loadoutErrorMessage = data?.error || 'Unable to create room. Please try again from Social.';
        console.error(loadoutErrorMessage);
        showErrorToast(loadoutErrorMessage);
        return false;
    }

    loadoutErrorMessage = '';
    multiplayerSession = {
        roomId: data.roomId,
        playerToken: data.playerToken,
        viewerSide: data.viewerSide
    };
    currentRoomStatus = data;
    saveMultiplayerSession();
    try {
        localStorage.setItem('sieglingsHostLobby', JSON.stringify({
            roomId: data.roomId,
            playerToken: data.playerToken,
            expiresAt: data.expiresAt || null
        }));
    } catch (_error) {
        // ignore storage failures
    }
    window.location.href = `/social/lobby/${encodeURIComponent(data.roomId)}`;
    return true;
}

async function joinRoom() {
    const roomId = getCurrentRoomCode();
    if (!roomId) {
        loadoutErrorMessage = 'Enter a room code or return to Social to choose an online match.';
        return false;
    }

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
        loadoutErrorMessage = data?.error || 'Unable to join room. Check the room in Social, then try again.';
        console.error(loadoutErrorMessage);
        showErrorToast(loadoutErrorMessage);
        return false;
    }

    loadoutErrorMessage = '';
    multiplayerSession = {
        roomId: data.roomId,
        playerToken: data.playerToken,
        viewerSide: data.viewerSide
    };
    currentRoomStatus = data;
    saveMultiplayerSession();
    try {
        localStorage.setItem('sieglingsLobbySession', JSON.stringify({
            roomId: data.roomId,
            playerToken: data.playerToken,
            role: 'guest'
        }));
    } catch (_error) {
        // ignore storage failures
    }

    if (data.started) {
        applyStartedMultiplayerState(data);
        return true;
    }
    window.location.href = `/social/lobby/${encodeURIComponent(data.roomId)}`;
    return true;
}

async function submitMatchLoadout() {
    if (!multiplayerSession?.roomId || !multiplayerSession?.playerToken) {
        loadoutErrorMessage = 'Online session missing. Return to Social and rejoin the lobby.';
        return false;
    }

    savePlayerName(getCurrentPlayerName());
    const data = await fetchJson(apiUrls('/api/match/ready'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Room-Id': multiplayerSession.roomId,
            'X-Player-Token': multiplayerSession.playerToken
        },
        body: JSON.stringify({
            ...getSelectedLoadoutBody(),
            playerName: getCurrentPlayerName()
        })
    }, LOADOUT_ACTION_TIMEOUT_MS);

    if (!data || data.error) {
        loadoutErrorMessage = data?.error || 'Unable to lock in loadout. Try again.';
        console.error(loadoutErrorMessage);
        showErrorToast(loadoutErrorMessage);
        return false;
    }

    loadoutErrorMessage = '';
    currentRoomStatus = data;
    if (data.started) {
        applyStartedMultiplayerState(data);
        return true;
    }
    renderLoadoutOptions();
    updateLoadoutSummary();
    syncEntryOverlays();
    return true;
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
        return `Deception ${formatElementLabel(card.trapBucketElement)} ${card.trapBucketAmount}`;
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
        html += renderCardStatPills(card, { mode: 'hand' });
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

// Cards the loadout is carrying that this page's catalog does not know about.
// They used to be dropped without a word, so a saved 30-card deck could reach the
// server as a short list and come back rejected as if the deck were empty.
function getUnknownLoadoutCardIds(cardIds) {
    if (!gameOptions?.cardCatalog?.length) return [];
    const availableIds = new Set(gameOptions.cardCatalog.map(card => card.id));
    return [...new Set((cardIds || []).filter(cardId => !availableIds.has(cardId)))];
}

function unknownLoadoutCardMessage(missingIds) {
    const shown = missingIds.slice(0, 3).join(', ');
    const rest = missingIds.length > 3 ? ` and ${missingIds.length - 3} more` : '';
    return `${missingIds.length} card${missingIds.length === 1 ? '' : 's'} in this deck (${shown}${rest}) `
        + 'are no longer in the card catalog, so the deck cannot start. Open Decks \u2192 edit this deck and replace them.';
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
    if (isOpponentControlLocked()) {
        return;
    }
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
    const allowed = mulliganAllowedIndexSet();
    if (allowed && !allowed.has(index)) {
        return;
    }
    if (mulliganSelectedIndices.has(index)) {
        mulliganSelectedIndices.delete(index);
    } else {
        // Tutorial script: at most one practice redraw.
        if (allowed && allowed.size === 1) {
            mulliganSelectedIndices.clear();
        }
        mulliganSelectedIndices.add(index);
    }
    // The hand has not changed, so keep its live card/image nodes in place.
    // Rebuilding the overlay here aborts or restarts remote holo decoding and
    // exposes the foil/data layers for a frame before the painted art returns.
    updateMulliganSelectionUI();
}

/** null = any card; otherwise only those indices may be selected for redraw. */
function mulliganAllowedIndexSet() {
    const allowed = gameState?.mulligan?.allowedIndices;
    if (Array.isArray(allowed) && allowed.length > 0) {
        return new Set(allowed.map((n) => Number(n)).filter((n) => Number.isInteger(n)));
    }
    if (gameState?.mulligan?.tutorialScripted || (typeof tutorialMatchActive !== 'undefined' && tutorialMatchActive)) {
        return new Set([4]);
    }
    return null;
}

function updateMulliganSelectionUI() {
    const preview = document.getElementById('mulliganHandPreview');
    const allowed = mulliganAllowedIndexSet();
    const scripted = Boolean(gameState?.mulligan?.tutorialScripted) || (allowed && allowed.size === 1);
    if (preview) {
        preview.querySelectorAll('.mulligan-card-slot').forEach((slot) => {
            const index = Number(slot.dataset.index);
            const isSelected = mulliganSelectedIndices.has(index);
            const slotAllowed = !allowed || allowed.has(index);
            const locked = Boolean(allowed) && !slotAllowed;
            slot.classList.toggle('is-selected', isSelected);
            if (slot.getAttribute('role') === 'button') {
                slot.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            }
            slot.querySelectorAll('.mulligan-redraw-badge, .mulligan-practice-badge').forEach((el) => el.remove());
            if (isSelected) {
                const badge = document.createElement('div');
                badge.className = 'mulligan-redraw-badge';
                badge.setAttribute('aria-hidden', 'true');
                badge.textContent = 'Redraw';
                slot.insertBefore(badge, slot.firstChild);
            } else if (scripted && slotAllowed && gameState?.mulligan?.youPending && !locked) {
                const badge = document.createElement('div');
                badge.className = 'mulligan-practice-badge';
                badge.setAttribute('aria-hidden', 'true');
                badge.textContent = 'Practice';
                slot.insertBefore(badge, slot.firstChild);
            }
        });
    }
    const redrawBtn = document.getElementById('btnMulliganRedraw');
    if (redrawBtn && gameState?.mulligan?.youPending) {
        const count = mulliganSelectedIndices.size;
        redrawBtn.disabled = count === 0;
        redrawBtn.textContent = count === 0
            ? 'Redraw selected'
            : `Redraw ${count} card${count === 1 ? '' : 's'}`;
    }
}

function submitMulliganKeep() {
    submitMulligan([]);
}

function submitMulliganSelected() {
    if (mulliganSelectedIndices.size === 0) {
        return;
    }
    const allowed = mulliganAllowedIndexSet();
    let sorted = Array.from(mulliganSelectedIndices).sort((a, b) => a - b);
    if (allowed) {
        sorted = sorted.filter((i) => allowed.has(i));
        if (sorted.length === 0) {
            return;
        }
    }
    submitMulligan(sorted);
}

function mulliganWait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One card back for the whole reveal, latched before the hand changes. Picking
 *  it per card would pop to a different colour the instant the new cards land,
 *  while the slots are still face-down and the back is what's on screen. */
function latchMulliganFlipBack(hand) {
    const elements = (hand || []).map((c) => String(c?.element || '').toUpperCase()).filter(Boolean);
    mulliganFlipBackArt = deckArtAssetForElements(elements)?.back || '';
}

function clearMulliganReveal() {
    mulliganFlipIndices = new Set();
    mulliganFlipBackArt = '';
    mulliganFaceDown = false;
    mulliganRevealHold = false;
    if (mulliganRevealDone) {
        const done = mulliganRevealDone;
        mulliganRevealDone = null;
        mulliganRevealPromise = null;
        done();
    }
}

/** Turn the flipped slots back over in place. Removing the class from the live
 *  nodes is what makes the CSS transition run; a re-render would hand back new
 *  elements already at rest and the turn would simply snap. */
function revealMulliganFlippedSlots() {
    mulliganFaceDown = false;
    document.querySelectorAll('#mulliganHandPreview .mulligan-card-slot.is-face-down')
        .forEach((slot) => slot.classList.remove('is-face-down'));
}

async function submitMulligan(indices) {
    const swapped = Array.isArray(indices) ? indices.filter((i) => Number.isInteger(i)) : [];
    if (swapped.length) {
        latchMulliganFlipBack(gameState?.player?.hand);
        mulliganFlipIndices = new Set(swapped);
        mulliganFaceDown = true;
        mulliganRevealHold = true;
        mulliganRevealPromise = new Promise((resolve) => { mulliganRevealDone = resolve; });
        renderMulliganOverlay();          // turn the swapped cards face-down
    }
    // Start the half-turn clock now so the request's latency runs underneath it
    // rather than after: on a fast reply the flip still reads as a flip, on a
    // slow one the player has been watching the backs the whole time.
    const turnedAway = swapped.length ? mulliganWait(MULLIGAN_FLIP_MS) : Promise.resolve();

    const data = await api('mulligan', 'POST', { mulliganIndices: indices });
    if (!data) {
        clearMulliganReveal();
        renderMulliganOverlay();
        return;
    }
    mulliganSelectedIndices.clear();
    mulliganHandSig = '';
    if (!swapped.length) {
        renderMulliganOverlay();
        return;
    }

    // The new cards are already rendered by now — behind the backs, hidden by
    // backface-visibility — so turning back reveals them with no second swap.
    await turnedAway;
    revealMulliganFlippedSlots();
    window.SieglingsSounds?.play('draw', 0.5);
    await mulliganWait(MULLIGAN_FLIP_MS + MULLIGAN_REVEAL_HOLD_MS);
    clearMulliganReveal();
    renderMulliganOverlay();
    syncEntryOverlays();
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
    if (usesInlineBattleDock()) {
        // During a live battle the queue lives in the docked hand tray, so the
        // sword button just flips back from the hand view to that dock.
        if (gameState?.currentPhase === 'BATTLE') {
            if (battleHandViewOpen || forceOpen) {
                battleHandViewOpen = false;
                render();
            }
            if (activeDrawer === 'battle') {
                closeDrawer(true);
            }
            syncActionBarMenuAttention(desktopInspectTab);
            return;
        }
        // Outside battle, phone landscape shows Battle View in the left inspector.
        if (usesLandscapeInspectorMenuDock()) {
            if (desktopInspectTab === 'battle' && !forceOpen) {
                setDesktopInspectTab('card');
                syncActionBarMenuAttention('card');
                return;
            }
            openLandscapeInspectorMenu('battle');
            return;
        }
        // Elsewhere, surface the Battle View preview in the slide-up drawer.
        if (activeDrawer === 'battle') {
            if (!forceOpen) {
                closeDrawer();
            }
            return;
        }
        openDrawer('battle');
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
    const soloAiEndTurn = !multiplayerSession?.roomId
        && gameState?.currentPhase === 'SETUP'
        && gameState?.activeSide === 'PLAYER'
        && !gameState?.gameOver;
    if (soloAiEndTurn && window.SieglingsActionQueue?.beginSoloAiEndTurn) {
        await window.SieglingsActionQueue.beginSoloAiEndTurn(gameState);
    }
    const data = await api(
        'endturn',
        'POST',
        null,
        DEFAULT_REQUEST_TIMEOUT_MS,
        soloAiEndTurn ? { soloAiEndTurn: true } : null
    );
    if (data) {
        resetDrawButton();
    } else if (soloAiEndTurn) {
        window.SieglingsActionQueue?.markOpponentThinking(false);
    }
}

async function placeCard(row, col) {
    if (!selectedCard || placementRequestInFlight || isOpponentControlLocked() || isSetupResolutionPending()) return;
    placementRequestInFlight = true;
    window.SieglingsSounds?.play('place');
    // Drop the card out of the hand immediately. The server is authoritative and
    // its response replaces this state wholesale, but on a slow connection the
    // optimistic removal is what stops the player from re-dropping a card that
    // is already on its way to the board.
    const pendingCardId = selectedCard.id;
    applyOptimisticHandRemoval(selectedHandIndex);
    try {
        const data = await api('place', 'POST', { cardId: pendingCardId, row, col });
        if (data) {
            closeCardPreviewSurfaces();
        }
    } finally {
        placementRequestInFlight = false;
        // A successful call already replaced the hand from server state; a
        // failed one must put the optimistically hidden card back. Either way
        // the player ends up with a live hand and no stale selection, so a
        // rejected placement can never wedge the UI.
        pendingHandRemovalIndex = null;
        resetInteractionState();
    }
}

/**
 * Hide a hand slot that has been committed to the server but not yet confirmed.
 * Tracked by slot index rather than card id because hand cards carry definition
 * ids, so three copies of a Siegling all share one id. The flag is cleared by
 * the next authoritative state, which is what actually removes the card.
 */
function applyOptimisticHandRemoval(handIndex) {
    pendingHandRemovalIndex = Number.isInteger(handIndex) ? handIndex : null;
    selectedCard = null;
    selectedHandIndex = null;
    clearTargetMode();
    render();
}

async function claimBoardCard(row, col) {
    if (claimFxInFlight) {
        return;
    }
    const claimCard = gameState?.playerBoard?.[row]?.[col] || null;
    if (!isClaimableBoardCell(claimCard, true)) {
        return;
    }
    clearTargetMode();
    claimFxInFlight = true;
    try {
        await playClaimBoardCardFx(row, col, claimCard);
        const data = await api('claim', 'POST', { row, col });
        if (!data) return;
        resetInteractionState();
    } finally {
        claimFxInFlight = false;
        const cardEl = getClaimBoardCellElement(row, col)?.querySelector('.board-card');
        if (cardEl) {
            cardEl.classList.remove('sgl-claim-dissolving');
            cardEl.style.removeProperty('--sgl-claim-color');
        }
    }
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
    let data;
    try {
        data = await api('battle/action', 'POST', { abilityIndex, targetRow, targetCol });
    } catch (e) {
        // Never leave the player stranded on the target overlay if the action
        // request (or its post-processing) throws — clear the in-progress
        // targeting so the UI is usable again.
        console.error('Battle action failed:', e);
        try { resetInteractionState(); } catch (_) {}
        return;
    }
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
    const opponentSetupTurn = phase === 'SETUP' && !playerActive && !over;
    if (drawButtonActsAsEndTurn) {
        onDrawComplete();
    } else if (opponentSetupTurn) {
        resetDrawButton();
        btnDraw.innerHTML = 'Opponents Turn';
        btnDraw.disabled = true;
        btnDraw.onclick = null;
        btnDraw.classList.remove('ab-drawn');
    } else {
        resetDrawButton();
    }
    btnDraw.disabled = over || opponentSetupTurn || !playerActive || isOpponentControlLocked()
        || (phase !== 'DRAW' && !drawButtonActsAsEndTurn);
    if (btnEndTurn) {
        btnEndTurn.textContent = playerActive ? 'End Turn' : 'Opponents Turn';
    }
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
            battleTitle = 'Open the live queue prompt for the Siegeling that is currently acting by speed.';
        } else if (enemyBattlePending) {
            battleLabel = 'Queue Locked';
            battleTitle = 'Review battle status while the opponent resolves the current speed action.';
        } else {
            battleLabel = 'Queue Live';
            battleTitle = 'Review the live battle queue. Siegelings resolve abilities in speed order until the phase ends.';
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
                ? 'Battle View — simulate this card\'s attacks'
                : 'Battle View — simulate your Siegelings\' attacks';
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

    const pTopHp = getDisplayedSideHealth(true, gameState.player.health);
    const eTopHp = getDisplayedSideHealth(false, gameState.enemy.health);
    document.getElementById('playerHealth').textContent = pTopHp;
    document.getElementById('enemyHealth').textContent = eTopHp;
    // Drive the top-bar HP chips' bottom fill bar (visible in landscape).
    syncTopBarHpFill('tbPlayerHpFill', pTopHp, gameState.player.trainer);
    syncTopBarHpFill('tbEnemyHpFill', eTopHp, gameState.enemy.trainer);

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
        const oppLocked = isOpponentControlLocked();
        btnTrainerAbility.classList.toggle('hidden', !hasTrainer);
        btnTrainerAbility.disabled = !hasTrainer || oppLocked;
        btnTrainerAbility.classList.toggle('ab-ability-ready', canUse && !oppLocked);
        btnTrainerAbility.innerHTML = trainer?.tier === 'SiegeLord' ? '&#9876; Lord' : '&#9876; Knight';
        btnTrainerAbility.title = !trainer
            ? 'No SiegeKnight selected'
            : oppLocked
                ? `${trainer.name} — wait for your turn`
                : `${trainer.name}${trainer.active?.name ? `: ${trainer.active.name}` : ''}${canUse ? '' : ' (details only)'}`;
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
    renderBattlePassButton();
    renderRowSelectBattleOverlay();
    scheduleBattleAutoAdvance();
    if (usesInlineBattleDock() && isHandHiddenForPhase() && activeDrawer === 'battle') {
        closeDrawer(true);
    }
    document.body.classList.toggle('battle-inline-dock', usesInlineBattleDock() && isHandHiddenForPhase());
    applyInteractionState();
    renderElementKey();
    syncMobileInfoTab();
    syncEntryOverlays();
    maybeRefreshProfileAfterGame();
    updateQuitOrNewGameButton();

    if (activeDrawer === 'battle' && phase !== 'BATTLE') {
        closeDrawer(true);
    }
    if (phaseChanged && !window.SieglingsActionQueue) {
        showPhaseTransitionBanner(phase, gameState.activeSide, 2000, gameState.battleQueue);
    }

    renderGameOverOverlay();
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
    if (tutorialMatchActive) {
    }
    if (gameState) {
        pruneInvalidArenaSelection();
        syncActingPreviewFocus();
        // Warm the art cache before the innerHTML rebuild below tears down
        // the current <img> elements, so the recreated ones paint instantly.
        preloadBattleArt();
    }
    renderDomLegacy();
}

window.previewCellHover = previewCellHover;
window.handleTargetCellPointerLeave = handleTargetCellPointerLeave;
window.confirmRowSelectBattleTarget = confirmRowSelectBattleTarget;
window.clearRowSelectBattleTarget = clearRowSelectBattleTarget;
window.cancelBattleTargetSelection = cancelBattleTargetSelection;
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

function formatBreakdown(internal, external, passive = 0, overcharge = 0) {
    const parts = [];
    if (internal > 0) parts.push(`${internal} internal`);
    if (external > 0) parts.push(`${external} external`);
    // energy_boost passives generate without a link, so they read as their own source.
    if (passive > 0) parts.push(`${passive} passive`);
    if (overcharge > 0) parts.push(`${overcharge} overcharge`);
    return parts.length > 0 ? parts.join(' + ') : '0';
}

function getEnergyMapAmount(map, key) {
    if (!map) return 0;
    return Number(map[String(key).toUpperCase()] || 0);
}

function getPassiveEnergyAmount(playerData, key) {
    return getEnergyMapAmount(playerData?.passiveEnergy, key);
}

function getOverchargeEnergyAmount(playerData, key) {
    return getEnergyMapAmount(playerData?.overchargeEnergy, key);
}

function isSideOvercharged(playerData) {
    if (!playerData) return false;
    if (typeof playerData.overcharged === 'boolean') return playerData.overcharged;
    return ENERGY_ORDER.some(([key]) => getOverchargeEnergyAmount(playerData, key) > 0);
}

function getOverchargeTotal(playerData) {
    return ENERGY_ORDER.reduce((sum, [key]) => sum + getOverchargeEnergyAmount(playerData, key), 0);
}

function energyDetailElementRows(playerData) {
    const rows = [];
    for (const [key, label] of ENERGY_ORDER) {
        const total = playerData[`${key}Energy`] || 0;
        if (total <= 0) continue;
        const intl = playerData[`${key}Internal`];
        const ext = playerData[`${key}External`];
        const passive = getPassiveEnergyAmount(playerData, key);
        const overcharge = getOverchargeEnergyAmount(playerData, key);
        let sub = '';
        if (typeof intl === 'number' && typeof ext === 'number') {
            sub = ` — ${formatBreakdown(intl, ext, passive, overcharge)}`;
        } else if (passive > 0 || overcharge > 0) {
            sub = ` — ${formatBreakdown(0, 0, passive, overcharge)}`;
        }
        const overchargeClass = overcharge > 0 ? ' is-overcharged' : '';
        rows.push(`<div class="energy-detail-row${overchargeClass}"><span>${label}</span><span>${total}${sub}</span></div>`);
    }
    return rows.length > 0
        ? rows.join('')
        : '<div class="energy-detail-muted">No elemental energy</div>';
}

/** Surge banner for the energy view while an active energy buff is running. */
function energyDetailOverchargeBlock(playerData) {
    if (!isSideOvercharged(playerData)) {
        return '';
    }
    const parts = ENERGY_ORDER
        .filter(([key]) => getOverchargeEnergyAmount(playerData, key) > 0)
        .map(([key, label]) => `+${getOverchargeEnergyAmount(playerData, key)} ${label}`);
    return `<div class="energy-overcharge-banner" role="status">
        <span class="energy-overcharge-spark" aria-hidden="true"></span>
        <span class="energy-overcharge-text">Overcharged${parts.length > 0 ? ` — ${escapeHtml(parts.join(', '))}` : ''}</span>
        <span class="energy-overcharge-note">Lasts through Setup — fades when the battle phase begins</span>
    </div>`;
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

function getDisplayedSideHealth(isPlayer, value) {
    const numeric = Number(value ?? 0);
    const fallback = Number.isFinite(numeric) ? numeric : 0;
    return window.SieglingsActionQueue?.getDisplayedHealth?.(!!isPlayer, fallback) ?? fallback;
}

function renderEnergyDetailPanel() {
    const panels = [
        document.getElementById('energyDetailPanel'),
        document.getElementById('desktopInspectEnergyPanel'),
        document.getElementById('drawerEnergyPanel')
    ].filter(Boolean);
    if (panels.length === 0 || !gameState) return;

    const p = gameState.player;
    const e = gameState.enemy;
    const pHealth = getDisplayedSideHealth(true, p.health);
    const eHealth = getDisplayedSideHealth(false, e.health);
    const enemyTitle = escapeHtml(gameState.enemyName || 'Opponent');
    let html = '';
    html += '<div class="energy-detail-columns">';
    html += '<div class="energy-detail-section energy-detail-player">';
    html += `<div class="energy-detail-sidehead"><span class="energy-detail-sideicon">✦</span><div><div class="energy-detail-h2">${escapeHtml(gameState.playerName || 'You')}</div><div class="energy-detail-hp">${pHealth} <span>HP</span></div></div></div>`;
    html += energyDetailOverchargeBlock(p);
    html += energyDetailElementRows(p);
    html += '<div class="energy-detail-subh">Combos</div>';
    html += energyDetailComboBlock(p);
    html += '<div class="energy-detail-subh">Nexus</div>';
    html += energyDetailNexusBlock(p);
    if (p.mistActive) {
        html += '<div class="energy-mist">Mist combo active</div>';
    }
    html += '</div>';

    html += '<div class="energy-detail-section energy-detail-enemy">';
    html += `<div class="energy-detail-sidehead"><span class="energy-detail-sideicon">⚔</span><div><div class="energy-detail-h2">${enemyTitle}</div><div class="energy-detail-hp">${eHealth} <span>HP</span></div></div></div>`;
    html += energyDetailOverchargeBlock(e);
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

    const anyOvercharged = isSideOvercharged(p) || isSideOvercharged(e);
    panels.forEach((panel) => {
        panel.innerHTML = html;
        panel.classList.toggle('is-overcharged', anyOvercharged);
    });
}

const SAFE_AREA_HP_MAX = 50;
// Soft reference used to scale the notch energy underline (energy can pool past this).
const SAFE_AREA_ENERGY_REF = 10;
// At or below this HP %, the side pulses to warn of low health.
const SAFE_AREA_HP_DANGER_PCT = 30;

// HUD health bars are tinted by the side's SiegeKnight element so each player's
// bar reads as their element — except a critically low side always falls back to
// the red danger tier so the warning stays clear regardless of element.
function getHudHpTierColor(pct) {
    if (pct > 60) return '#34c759';
    if (pct > 35) return '#ffcc00';
    if (pct > 15) return '#ff9500';
    return '#ff3b30';
}

function hudHpBarGradient(pct, element) {
    if (pct > SAFE_AREA_HP_DANGER_PCT && element) {
        const hex = getElementHex(element);
        if (hex) return `linear-gradient(90deg, ${hexToRgba(hex, 0.55)}, ${hex})`;
    }
    const tier = getHudHpTierColor(pct);
    return `linear-gradient(90deg, ${hexToRgba(tier, 0.55)}, ${tier})`;
}

// Width + element/tier tint for the top-bar HP chip's bottom fill bar.
function syncTopBarHpFill(id, hp, trainer) {
    const fill = document.getElementById(id);
    if (!fill) return;
    const pct = Math.max(0, Math.min(100, Math.round((hp / SAFE_AREA_HP_MAX) * 100)));
    fill.style.width = `${pct}%`;
    fill.style.background = hudHpBarGradient(pct, trainer?.element || null);
}

function applySafeAreaHpSide(side, data) {
    const cap = side === 'enemy' ? 'Enemy' : 'Player';
    const health = getDisplayedSideHealth(side !== 'enemy', data?.health ?? 0);
    const pct = Math.max(0, Math.min(100, Math.round((health / SAFE_AREA_HP_MAX) * 100)));
    const element = data?.trainer?.element || null;

    const fill = document.getElementById(`safeHpFill${cap}`);
    if (fill) {
        fill.style.width = `${pct}%`;
        // Tint by the side's SiegeKnight element (red fallback when critical).
        fill.style.background = hudHpBarGradient(pct, element);
    }

    const half = fill?.closest('.safe-hp-half');
    if (half) half.classList.toggle('danger', pct > 0 && pct <= SAFE_AREA_HP_DANGER_PCT);

    const energyFill = document.getElementById(`safeEnergyFill${cap}`);
    if (energyFill) {
        const energyTotal = getEnergyRowsForPlayer(data).reduce((sum, entry) => sum + entry.val, 0);
        const ePct = Math.max(0, Math.min(100, Math.round((energyTotal / SAFE_AREA_ENERGY_REF) * 100)));
        energyFill.style.width = `${ePct}%`;
        if (element) {
            const hex = getElementHex(element);
            if (hex) energyFill.style.background = `linear-gradient(90deg, ${hexToRgba(hex, 0.4)}, ${hex})`;
        }
    }
}

function updateSafeAreaHpStrip(state) {
    const strip = document.getElementById('safeHpStrip');
    if (!strip || !state) return;

    const mobileGameplay = window.matchMedia('(max-width: 767px)').matches
        && document.body.classList.contains('gameplay-active');
    strip.hidden = !mobileGameplay;
    strip.setAttribute('aria-hidden', mobileGameplay ? 'false' : 'true');
    if (!mobileGameplay) return;

    applySafeAreaHpSide('enemy', state.enemy);
    applySafeAreaHpSide('player', state.player);
}

function updateHudRails(state) {
    if (!state) return;
    const p = state.player || {};
    const e = state.enemy || {};

    setTextIfExists('railPlayerHeading', state.playerName || p.name || 'Player');
    setTextIfExists('railEnemyHeading', state.enemyName || e.name || 'AI');

    const pHealth = getDisplayedSideHealth(true, p.health ?? 0);
    const eHealth = getDisplayedSideHealth(false, e.health ?? 0);
    const pPct = Math.max(0, Math.min(100, Math.round((pHealth / 50) * 100)));
    const ePct = Math.max(0, Math.min(100, Math.round((eHealth / 50) * 100)));
    setTextIfExists('railPlayerHealth', pHealth);
    setTextIfExists('railEnemyHealth', eHealth);

    const pBar = document.getElementById('railPlayerHpBar');
    const eBar = document.getElementById('railEnemyHpBar');
    // Tint the rail health bars by each side's SiegeKnight element (red fallback
    // when critically low) so the bar reads as the player's/enemy's element.
    if (pBar) {
        pBar.style.width = `${pPct}%`;
        pBar.style.background = hudHpBarGradient(pPct, p.trainer?.element || null);
    }
    if (eBar) {
        eBar.style.width = `${ePct}%`;
        eBar.style.background = hudHpBarGradient(ePct, e.trainer?.element || null);
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
    // Phone landscape opens the same sheet from the top-bar player labels
    // (the portrait mobile HUD buttons are hidden there).
    const sheetOpen = mobileHudSheetOpen && (isPortraitMobileHudLayout() || isLandscapeTopBarHudLayout());
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
        isPlayer: true,
        name: state.playerName || p.name || 'Player',
        hpBarId: 'mobilePlayerHpBar',
        hpValueId: 'mobilePlayerHpValue',
        nameId: 'mobilePlayerName',
        handId: 'mobilePlayerHandSize',
        deckId: 'mobilePlayerDeckSize',
        energyId: 'mobilePlayerEnergyCount',
        dotsId: 'mobilePlayerElements',
        statHealthId: 'mobilePlayerStatHealth',
        statHandId: 'mobilePlayerStatHandSize',
        statDeckId: 'mobilePlayerStatDeckSize',
        statElementsId: 'mobilePlayerStatElements',
        knightIconId: 'mobilePlayerKnightIcon',
        knightNameId: 'mobilePlayerKnightName',
        knightInfoId: 'mobilePlayerKnightInfo',
        showFullAbilities: true
    });
    updateMobileHudSide('Enemy', e, {
        isPlayer: false,
        name: state.enemyName || e.name || 'AI',
        hpBarId: 'mobileEnemyHpBar',
        hpValueId: 'mobileEnemyHpValue',
        nameId: 'mobileEnemyName',
        handId: 'mobileEnemyHandSize',
        deckId: 'mobileEnemyDeckSize',
        energyId: 'mobileEnemyEnergyCount',
        dotsId: 'mobileEnemyElements',
        statHealthId: 'mobileEnemyStatHealth',
        statHandId: 'mobileEnemyStatHandSize',
        statDeckId: 'mobileEnemyStatDeckSize',
        statElementsId: 'mobileEnemyStatElements',
        knightIconId: 'mobileEnemyKnightIcon',
        knightNameId: 'mobileEnemyKnightName',
        knightInfoId: 'mobileEnemyKnightInfo',
        showFullAbilities: true
    });

    setTextIfExists('mobileStatPlayerTab', state.playerName || p.name || 'Player');
    setTextIfExists('mobileStatEnemyTab', state.enemyName || e.name || 'AI');
    syncMobileHudSheetSide();
    updateSafeAreaHpStrip(state);
}

/**
 * Lights the portrait HUD's energy number while an active energy buff is riding that
 * side's pool. The title carries the same information for anyone who can't see the glow.
 */
function syncOverchargeCue(elementId, playerData) {
    const el = elementId ? document.getElementById(elementId) : null;
    if (!el) return;
    const overcharged = isSideOvercharged(playerData);
    el.classList.toggle('is-overcharged', overcharged);
    const total = getOverchargeTotal(playerData);
    if (overcharged) {
        el.title = `Overcharged${total > 0 ? ` (+${total})` : ''} — extra energy until the battle phase begins`;
    } else {
        el.removeAttribute('title');
    }
}

function updateMobileHudSide(label, playerData, ids) {
    const health = getDisplayedSideHealth(!!ids.isPlayer, playerData?.health ?? 0);
    const pct = Math.max(0, Math.min(100, Math.round((health / 50) * 100)));
    const handSize = playerData?.handSize ?? (Array.isArray(playerData?.hand) ? playerData.hand.length : 0);
    const deckSize = playerData?.deckSize ?? 0;
    const energyTotal = getEnergyRowsForPlayer(playerData).reduce((sum, entry) => sum + entry.val, 0);
    const trainer = playerData?.trainer;
    const hpBar = document.getElementById(ids.hpBarId);

    setTextIfExists(ids.nameId, ids.name || label);
    setTextIfExists(ids.handId, handSize);
    setTextIfExists(ids.deckId, deckSize);
    setTextIfExists(ids.energyId, energyTotal);
    setTextIfExists(ids.hpValueId, health);
    syncOverchargeCue(ids.energyId, playerData);
    setTextIfExists(ids.statHealthId, health);
    setTextIfExists(ids.statHandId, handSize);
    setTextIfExists(ids.statDeckId, deckSize);
    setTextIfExists(ids.knightNameId, trainer?.name || '-');
    setTrainerAbilityMarkup(ids.knightInfoId, trainer, {
        includeElement: true,
        compact: true
    });
    if (hpBar) {
        hpBar.style.width = `${pct}%`;
        // Tint by the side's SiegeKnight element (red fallback when critical).
        hpBar.style.background = hudHpBarGradient(pct, trainer?.element || null);
    }

    const icon = document.getElementById(ids.knightIconId);
    if (icon) {
        if (trainer) {
            icon.classList.add('has-knight-card');
            icon.classList.toggle('has-knight-fullart', knightHasFullCardArt(trainer));
            icon.classList.toggle('has-knight-overlay-art', knightHasOverlayCardArt(trainer));
            icon.innerHTML = knightHudCardInnerHtml(trainer);
        } else {
            icon.classList.remove('has-knight-card', 'has-knight-fullart', 'has-knight-overlay-art');
            icon.innerHTML = elementEmoji(trainer?.element);
        }
    }

    renderMobileHudElementDots(ids.dotsId, playerData);
    renderMobileStatElements(ids.statElementsId, playerData);
}

function knightUploadedCardArtUrl(trainer) {
    return String(trainer?.cardArtUrl || '').trim();
}

function knightCardArtMode(trainer) {
    return String(trainer?.cardArtMode || '').trim().toUpperCase();
}

function knightHasOverlayCardArt(trainer) {
    return Boolean(knightUploadedCardArtUrl(trainer) && knightCardArtMode(trainer) === 'OVERLAY');
}

// True when this SiegeKnight has uploaded full-card art (Pyla / Squire Bob style).
function knightHasFullCardArt(trainer) {
    return Boolean(knightUploadedCardArtUrl(trainer) && knightCardArtMode(trainer) === 'FULL_CARD');
}

// Inner markup for a SiegeKnight card shown in the battle HUD: uploaded art
// when available, otherwise the default card-front template with an element sigil.
function knightHudCardDetailsHtml(trainer) {
    const meta = [formatTrainerTier(trainer?.tier), formatElementLabel(trainer?.element), trainer?.rarity].filter(Boolean).join(' • ');
    return `<span class="hud-knight-card-details">
        <span class="hud-knight-card-name">${escapeHtml(trainer?.name || 'SiegeKnight')}</span>
        <span class="hud-knight-card-meta">${escapeHtml(meta)}</span>
        <span class="hud-knight-card-ability"><b>Passive:</b> ${escapeHtml(readTrainerAbilityText(trainer?.passive))}</span>
        <span class="hud-knight-card-ability"><b>${trainer?.oncePerGame ? 'Ultimate' : 'Active'}:</b> ${escapeHtml(readTrainerAbilityText(trainer?.active))}</span>
    </span>`;
}

function knightHudCardInnerHtml(trainer) {
    const url = knightUploadedCardArtUrl(trainer);
    const details = knightHudCardDetailsHtml(trainer);
    if (url) {
        if (knightHasOverlayCardArt(trainer)) {
            return knightHudOverlayCardInnerHtml(trainer, url) + details;
        }
        // The HUD frame is a fixed 5:7 box shared with overlay art so both modes
        // size identically; the dashboard crop/scale transform — tuned for the
        // framed loadout/binder — is intentionally not applied here.
        return `<img class="hud-knight-art-img" ${webpImgAttrs(url)} alt="${escapeHtmlAttribute(trainer?.name || 'SiegeKnight card')}" decoding="async">${details}`;
    }
    return `<img class="hud-knight-art-img hud-knight-art-template" ${webpImgAttrs(SIEGEKNIGHT_CARD_TEMPLATE)} alt="" aria-hidden="true"><span class="hud-knight-art-sigil">${elementEmoji(trainer?.element)}</span>${details}`;
}

function knightHudOverlayCardInnerHtml(trainer, url) {
    const element = String(trainer?.element || 'NEUTRAL').toUpperCase();
    const elementHex = getElementHex(element);
    const cardStyle = `--knight-color:${elementHex};--knight-glow:${hexToRgba(elementHex, 0.36)};${siegeknightCardBackStyle()}`;
    return `<span class="hud-knight-art-card hud-knight-art-overlay" role="img" aria-label="${escapeHtmlAttribute(trainer?.name || 'SiegeKnight card')}" style="${escapeHtmlAttribute(cardStyle)}">
        <span class="knight-overlay-art-window"><img class="knight-overlay-art-img" ${webpImgAttrs(url)} alt="" loading="lazy"${knightArtStyleAttr(trainer)}></span>
        <span class="knight-card-template" aria-hidden="true"></span>
    </span>`;
}

function updateHudRailKnight(prefix, trainer) {
    setTextIfExists(`${prefix}KnightName`, trainer?.name || '-');
    setTextIfExists(`${prefix}KnightElement`, trainer?.element ? formatElementLabel(trainer.element) : '');
    setTrainerAbilityMarkup(`${prefix}KnightAbility`, trainer);
    const card = document.getElementById(`${prefix}Knight`);
    const portrait = document.getElementById(`${prefix}KnightPortrait`);
    if (!card) {
        if (portrait) portrait.innerHTML = elementEmoji(trainer?.element);
        return;
    }
    if (!trainer) {
        card.classList.remove('has-knight-art', 'has-knight-fullart', 'has-knight-overlay-art');
        card.querySelector('.hud-knight-art')?.remove();
        if (portrait) {
            portrait.style.display = '';
            portrait.innerHTML = elementEmoji(trainer?.element);
        }
        return;
    }
    card.classList.add('has-knight-art');
    card.classList.toggle('has-knight-fullart', knightHasFullCardArt(trainer));
    card.classList.toggle('has-knight-overlay-art', knightHasOverlayCardArt(trainer));
    let art = card.querySelector('.hud-knight-art');
    if (!art) {
        art = document.createElement('div');
        art.className = 'hud-knight-art';
        card.insertBefore(art, card.firstChild);
    }
    art.innerHTML = knightHudCardInnerHtml(trainer);
    if (portrait) portrait.style.display = 'none';
}

/** Full SiegeKnight readout (element + passive + active/ultimate) for the player detail tray. */
function buildKnightAbilitiesHtml(trainer) {
    if (!trainer) return '';
    const parts = [];
    if (trainer.element) {
        parts.push(`<span class="m-knight-type" style="color:${getElementHex(trainer.element)}">${escapeHtml(formatElementLabel(trainer.element))}</span>`);
    }
    const passiveText = readTrainerAbilityText(trainer.passive);
    if (passiveText && passiveText !== 'None') {
        parts.push(`<span class="m-knight-ability"><span class="m-knight-ability-tag">Passive</span>${escapeHtml(passiveText)}</span>`);
    }
    const activeText = readTrainerAbilityText(trainer.active);
    if (activeText && activeText !== 'None') {
        const label = trainer.oncePerGame ? 'Ultimate' : 'Active';
        const activeName = trainer.active?.name && trainer.active.name !== activeText
            ? `${escapeHtml(trainer.active.name)}: `
            : '';
        parts.push(`<span class="m-knight-ability"><span class="m-knight-ability-tag tag-active">${label}</span>${activeName}${escapeHtml(activeText)}</span>`);
    }
    return parts.join('');
}

function getTrainerRailAbilityText(trainer) {
    return getTrainerAbilitySummaries(trainer)
        .map((entry) => `${entry.label}: ${entry.text}`)
        .join(' | ');
}

function getTrainerAbilitySummaries(trainer) {
    if (!trainer) return [];
    const summaries = [];
    const passive = readTrainerAbilityDescription(trainer.passiveDescription || trainer.passive);
    if (passive) {
        summaries.push({ label: 'Passive', text: passive });
    }
    const active = readTrainerAbilityDescription(trainer.active);
    if (active) {
        summaries.push({ label: trainer.oncePerGame ? 'Ultimate' : 'Active', text: active });
    }
    return summaries;
}

function readTrainerAbilityDescription(ability) {
    if (typeof ability === 'string' && ability.trim()) {
        return ability.trim();
    }
    const name = ability?.name ? String(ability.name).trim() : '';
    if (ability?.description) {
        const description = String(ability.description).trim();
        if (name && !description.toLowerCase().includes(name.toLowerCase())) {
            return `${name}: ${description}`;
        }
        return description;
    }
    if (name) {
        return name;
    }
    return '';
}

function setTrainerAbilityMarkup(id, trainer, options = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    const summaries = getTrainerAbilitySummaries(trainer);
    const element = options.includeElement && trainer?.element
        ? `<div class="hud-knight-ability-element">${escapeHtml(formatElementLabel(trainer.element))}</div>`
        : '';
    if (summaries.length === 0) {
        el.innerHTML = element;
        return;
    }
    const compactClass = options.compact ? ' compact' : '';
    el.innerHTML = `${element}<div class="hud-knight-ability-lines${compactClass}">${summaries.map((entry) => `
        <div class="hud-knight-ability-line"><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.text)}</span></div>
    `).join('')}</div>`;
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
        PSYCHIC: '&#9679;',
        POISON: '&#9762;',
        LIGHT: '&#9728;'
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
    const playerActive = gameState?.activeSide === 'PLAYER';
    btn.classList.add('ab-drawn');
    btn.innerHTML = playerActive ? '&#9197; End Turn' : 'Opponents Turn';
    btn.onclick = playerActive ? endTurn : null;
    btn.disabled = !playerActive;
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
        case 'POISON': return '#7ecb4d';
        case 'LIGHT': return '#ffe59a';
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
        PSYCHIC: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M32 12 C40 12 46 18 46 26 C46 34 40 38 40 44 L24 44 C24 38 18 34 18 26 C18 18 24 12 32 12 Z" fill="currentColor" opacity="0.14"/><circle cx="32" cy="26" r="5" fill="currentColor" opacity="0.26"/><path d="M28 44 L28 50 M32 44 L32 52 M36 44 L36 50" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.22"/></svg>`,
        POISON: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><path d="M32 13 C39 23 45 30 45 39 C45 47 39 53 32 53 C25 53 19 47 19 39 C19 30 25 23 32 13 Z" fill="currentColor" opacity="0.14"/><circle cx="28" cy="38" r="3" fill="currentColor" opacity="0.28"/><circle cx="37" cy="34" r="2.4" fill="currentColor" opacity="0.22"/><path d="M25 48 C29 45 35 45 39 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.22"/></svg>`,
        LIGHT: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.12"/><circle cx="32" cy="32" r="9" fill="currentColor" opacity="0.18"/><path d="M32 13 L32 22 M32 42 L32 51 M13 32 L22 32 M42 32 L51 32 M18 18 L24 24 M40 40 L46 46 M46 18 L40 24 M24 40 L18 46" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity="0.24"/></svg>`
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
        PSYCHIC: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 12 C40 12 46 18 46 26 C46 34 40 38 40 44 L24 44 C24 38 18 34 18 26 C18 18 24 12 32 12 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="32" cy="26" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M28 44 L28 50 M32 44 L32 52 M36 44 L36 50" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
        POISON: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><path d="M32 13 C39 23 45 30 45 39 C45 47 39 53 32 53 C25 53 19 47 19 39 C19 30 25 23 32 13 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="28" cy="38" r="3" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="37" cy="34" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M25 48 C29 45 35 45 39 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
        LIGHT: `<svg viewBox="0 0 64 64" class="deck-sigil"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="2.25" opacity="0.92"/><circle cx="32" cy="32" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M32 13 L32 22 M32 42 L32 51 M13 32 L22 32 M42 32 L51 32 M18 18 L24 24 M40 40 L46 46 M46 18 L40 24 M24 40 L18 46" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`
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

function deckArtAssetForElements(elements = []) {
    const key = elements.find(element => DECK_ART_ASSET_KEYS.includes(element));
    if (!key) {
        return null;
    }
    // Deck art is injected as a CSS url(), where the <img onerror> WebP
    // fallback cannot reach it — resolve the twin here instead. The literals
    // stay .png so the cross-file asset contract keeps holding.
    const asset = DECK_ART_ASSETS[key];
    return asset ? { ...asset, back: sgPreferWebp(asset.back), icon: sgPreferWebp(asset.icon) } : null;
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

const ELEMENT_KEY_ICON_PATHS = {
    FIRE: '/img/elements/element-fire.png',
    EARTH: '/img/elements/element-earth.png',
    WIND: '/img/elements/element-wind.png',
    WATER: '/img/elements/element-water.svg',
    ICE: '/img/elements/element-ice.png',
    SHADOW: '/img/elements/element-shadow.svg',
    ELECTRIC: '/img/elements/element-electric.svg',
    METAL: '/img/elements/element-metal.svg',
    UNDEAD: '/img/elements/element-undead.svg',
    PSYCHIC: '/img/elements/element-psychic.svg',
    POISON: '/img/elements/element-poison.svg',
    LIGHT: '/img/elements/element-light.svg'
};

// Elemental weakness chart — mirrors EffectService.isWeakTo (attacker hits these for +1 damage;
// reversed, the attacker is resisted for -1). No relationship either way = flat damage.
// Natural cycle: Fire > Ice, Metal | Ice > Wind, Poison | Wind > Earth, Water | Earth > Fire, Electric.
// Added element attackers: Water > Fire, Ice | Metal > Earth, Wind | Electric > Wind, Fire | Poison > Ice, Earth.
// Shadow cycle: Shadow > Psychic, Light | Psychic > Light, Undead | Light > Undead, Shadow | Undead > Shadow, Psychic.
const ELEMENT_STRENGTHS = [
    ['FIRE', ['ICE', 'METAL']],
    ['ICE', ['WIND', 'POISON']],
    ['WIND', ['EARTH', 'WATER']],
    ['EARTH', ['FIRE', 'ELECTRIC']],
    ['WATER', ['FIRE', 'ICE']],
    ['METAL', ['EARTH', 'WIND']],
    ['ELECTRIC', ['WIND', 'FIRE']],
    ['POISON', ['ICE', 'EARTH']],
    ['SHADOW', ['PSYCHIC', 'LIGHT']],
    ['PSYCHIC', ['LIGHT', 'UNDEAD']],
    ['LIGHT', ['UNDEAD', 'SHADOW']],
    ['UNDEAD', ['SHADOW', 'PSYCHIC']]
];

/** Element legend chip — icon art when available, falling back to the solid colour token. */
function elementKeyIconHtml(key) {
    const lower = String(key || '').toLowerCase();
    const upper = lower.toUpperCase();
    const path = ELEMENT_KEY_ICON_PATHS[upper];
    if (path) {
        const color = getElementHex(upper);
        return `<span class="element-key-icon" style="--el:${color}">`
            + `<img src="${escapeHtmlAttribute(path)}" alt="" loading="lazy" `
            + `onerror="this.remove();this.parentElement&amp;&amp;this.parentElement.classList.add('icon-missing')">`
            + `</span>`;
    }
    return `<span class="energy-token solid-token token-${lower} key-token"></span>`;
}

function renderElementKey() {
    const panels = [
        document.getElementById('elementKeyPanel'),
        document.getElementById('desktopInspectKeyPanel')
    ].filter(Boolean);
    if (panels.length === 0) return;

    let html = '';

    // Half 1 — element identities with their icon art.
    html += `<section class="element-key-section">`;
    html += `<div class="element-key-heading">Elements</div>`;
    html += `<div class="element-key-grid">`;
    for (const [key, label] of ENERGY_ORDER) {
        html += `<div class="element-key-row">${elementKeyIconHtml(key)}<span>${label}</span></div>`;
    }
    html += `</div>`;
    html += `<div class="element-key-row element-key-combo">`;
    html += `<span class="energy-token combo-token token-2 key-token" style="${buildComboStyle(['FIRE', 'EARTH'])}"></span>`;
    html += `<span>Combo point mixes its linked elements</span>`;
    html += `</div>`;
    html += `</section>`;

    // Half 2 — elemental matchups: who is strong vs whom (weak side takes +1 damage).
    html += `<section class="element-key-section element-key-matchups">`;
    html += `<div class="element-key-heading">Matchups <span class="element-key-sub">strong deal +1 vs weak</span></div>`;
    for (const [attacker, defenders] of ELEMENT_STRENGTHS) {
        const targets = defenders
            .map((d) => `<span class="matchup-chip">${elementKeyIconHtml(d)}<span>${formatElementLabel(d)}</span></span>`)
            .join('');
        html += `<div class="matchup-row">`
            + `<span class="matchup-chip matchup-attacker">${elementKeyIconHtml(attacker)}<span>${formatElementLabel(attacker)}</span></span>`
            + `<span class="matchup-arrow" aria-label="is strong against">&#9656;</span>`
            + `<span class="matchup-targets">${targets}</span>`
            + `</div>`;
    }
    html += `<div class="element-key-note">Strong attacker = weak defender: +1 damage. Reversed, the defender resists for -1 (a 1-damage hit is reduced to nothing). Elements with no relationship deal flat damage.</div>`;
    html += `</section>`;

    // Half 3 — jump into the status/affliction key without needing a card that
    // happens to be carrying a badge.
    html += `<section class="element-key-section">`;
    html += `<div class="element-key-heading">Status Effects</div>`;
    html += `<button type="button" class="element-key-link" onclick="openAllEffectsKey(event)">`
        + `View all buffs &amp; afflictions</button>`;
    html += `</section>`;

    panels.forEach((el) => {
        el.innerHTML = html;
    });
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

function buildBoardCardMarkup(cell, row, col, isPlayer) {
    const board = isPlayer ? (gameState?.playerBoard || []) : (gameState?.enemyBoard || []);
    return buildArenaBoardCardMarkup(cell, {
        board,
        row,
        col,
        isPlayer,
        legalPlacements: [],
        heldCard: true
    });
}

function mountHeldBoardCard(cellEl, entry) {
    if (!cellEl || !entry?.cell) return null;
    const isPlayer = !!entry.isPlayer;
    const row = Number(entry.row);
    const col = Number(entry.col);
    const cell = {
        ...entry.cell,
        hp: entry.displayHp,
        shieldHp: entry.displayShield,
        maxHp: entry.maxHp
    };
    const rowTag = cellEl.querySelector('.row-tag');
    const rowTagHtml = rowTag ? rowTag.outerHTML : (col === 0 ? `<div class="row-tag">${ROW_NAMES[row]}</div>` : '');
    cellEl.classList.add('has-card');
    cellEl.innerHTML = rowTagHtml + buildBoardCardMarkup(cell, row, col, isPlayer);
    return cellEl.querySelector('.board-card');
}

function unmountHeldBoardCell(cellEl) {
    if (!cellEl) return;
    const rowTag = cellEl.querySelector('.row-tag');
    const rowTagHtml = rowTag ? rowTag.outerHTML : '';
    cellEl.classList.remove('has-card');
    cellEl.innerHTML = rowTagHtml;
}

window.SieglingsBoardHold = {
    syncHeldCards(pendingLethalHolds) {
        if (!pendingLethalHolds || typeof pendingLethalHolds.forEach !== 'function') return;
        pendingLethalHolds.forEach((entry) => {
            const cellEl = document.querySelector(
                `${entry.isPlayer ? '#playerGrid' : '#enemyGrid'} .board-cell[data-row="${entry.row}"][data-col="${entry.col}"]`
            );
            if (!cellEl) return;
            if (!cellEl.querySelector('.board-card')) {
                mountHeldBoardCard(cellEl, entry);
            }
        });
    },
    unmountHeldBoardCell
};

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
                html += buildArenaBoardCardMarkup(cell, {
                    board,
                    row: r,
                    col: c,
                    isPlayer,
                    legalPlacements,
                    isActing,
                    isClaimable,
                    isLegal
                });
            } else if (isLegal) {
                html += `<div class="placement-prompt">+ Place</div>`;
            }

            html += `</div>`;
        }
    }

    const overlayLayer = detachBoardOverlayLayer(grid);
    grid.innerHTML = html;
    ensureBoardOverlayLayer(grid, overlayLayer);
    updateBoardOverlays(gridId, board, isPlayer);
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

function detachBoardOverlayLayer(grid) {
    const layer = grid.querySelector(':scope > .board-overlay-layer');
    if (layer) {
        layer.remove();
    }
    return layer;
}

function ensureBoardOverlayLayer(grid, existingLayer) {
    if (existingLayer) {
        grid.appendChild(existingLayer);
        return existingLayer;
    }
    const layer = document.createElement('div');
    layer.className = 'board-overlay-layer';
    layer.setAttribute('aria-hidden', 'true');
    grid.appendChild(layer);
    return layer;
}

function getBoardOverlayLayer(grid) {
    return grid.querySelector(':scope > .board-overlay-layer')
        || ensureBoardOverlayLayer(grid, null);
}

function computeBoardOverlayFingerprint(board, nexusPoints) {
    const parts = [];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const cell = board?.[r]?.[c];
            if (!cell) {
                continue;
            }
            parts.push(`${r}:${c}:${cell.instanceId || ''}`);
            if (cell.notches?.length) {
                parts.push(
                    cell.notches
                        .map((notch) => `${notch.direction}:${notch.element}`)
                        .sort()
                        .join('|')
                );
            }
        }
    }
    parts.push(JSON.stringify(nexusPoints || []));
    return parts.join(';');
}

function updateBoardOverlays(gridId, board, isPlayer, options = {}) {
    const grid = document.getElementById(gridId);
    if (!grid) {
        return;
    }
    const side = isPlayer ? gameState?.player : gameState?.enemy;
    const nexusPoints = side?.nexusPoints || [];
    const sideKey = isPlayer ? 'player' : 'enemy';
    const fingerprint = computeBoardOverlayFingerprint(board, nexusPoints);
    const layer = getBoardOverlayLayer(grid);
    const contentUnchanged = !options.forceContent
        && boardOverlayFingerprints[sideKey] === fingerprint
        && layer.childElementCount > 0;

    if (contentUnchanged && !options.forceLayout) {
        return;
    }

    const overlayElements = [];
    collectLinkConnectorElements(overlayElements, grid, board, isPlayer);
    collectNexusOverlayElements(overlayElements, grid, board, isPlayer, nexusPoints);
    layer.replaceChildren(...overlayElements);
    boardOverlayFingerprints[sideKey] = fingerprint;
}

function renderNexusOverlays(gridId, board, isPlayer, nexusPoints) {
    updateBoardOverlays(gridId, board, isPlayer, { forceContent: true, forceLayout: true });
}

function collectNexusOverlayElements(out, grid, board, isPlayer, nexusPoints) {
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
        out.push(wrap);
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
    updateBoardOverlays(gridId, board, isPlayer, { forceContent: true, forceLayout: true });
}

function collectLinkConnectorElements(out, grid, board, isPlayer) {
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
    const serverCallWells = isPlayer ? gameState?.playerCallWells : gameState?.enemyCallWells;
    const rememberedWells = externalSocketElementMemory[memorySide];
    for (const [key, element] of Object.entries(serverCallWells || {})) {
        if (key && element) rememberedWells[key] = element;
    }
    activeExternalSockets.forEach((info, key) => {
        if (String(info.element || '').toUpperCase() !== 'NEUTRAL' && !rememberedWells[key]) {
            rememberedWells[key] = info.element;
        }
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
        out.push(connector);
    }

    for (const socket of getAllExternalSockets(isPlayer)) {
        const cellEl = cellRefs.get(`${socket.row}:${socket.col}`);
        if (!cellEl) continue;

        const cellLocal = getBoardCellLocalRect(grid, cellEl);
        if (!cellLocal) continue;

        const point = getExternalSocketPoint(cellLocal, socket.side);
        const activeSocket = activeExternalSockets.get(socket.key);
        const callWellElement = rememberedWells[socket.key] || activeSocket?.element || null;

        if (activeSocket) {
            const anchor = getCellEdgeAnchor(cellLocal, activeSocket.direction);
            appendExternalLink(out, anchor, point, getElementHex(activeSocket.element));
        }

        appendExternalEnergyPoint(out, point, callWellElement, Boolean(rememberedWells[socket.key]));
    }
}

let boardLinkConnectorRefreshRaf = null;

function refreshBoardLinkConnectors() {
    if (!gameState) return;
    const playerGrid = document.getElementById('playerGrid');
    const enemyGrid = document.getElementById('enemyGrid');
    if (!playerGrid || !enemyGrid) return;
    updateBoardOverlays('enemyGrid', gameState.enemyBoard, false, { forceLayout: true });
    updateBoardOverlays('playerGrid', gameState.playerBoard, true, { forceLayout: true });
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
    // In the compact phone-landscape arena, dots hug the cells (smaller offset)
    // so the board can be scaled up and the two boards' central sockets sit only
    // a few px apart. Desktop keeps the wider 12% offset (its larger cells make
    // the 12% term win regardless, so this branch only tightens small-cell
    // landscape layouts).
    const compact = isLandscapeTopBarHudLayout();
    const offset = compact
        ? Math.max(4, Math.round(Math.min(local.width, local.height) * 0.05))
        : Math.max(12, Math.round(Math.min(local.width, local.height) * 0.12));

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

function appendExternalLink(out, start, end, color) {
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
    out.push(connector);
}

function appendExternalEnergyPoint(out, point, element, isCallWell = false) {
    const node = document.createElement('div');
    const activeClass = element ? ` active ${String(element).toLowerCase()}` : '';
    node.className = `external-energy-point${activeClass}${isCallWell ? ' call-well' : ''}`;
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    if (isCallWell) {
        node.title = `Call well: 1 ${formatElementLabel(element)} baseline energy for this battle`;
    }
    out.push(node);
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
const NOTCH_ICON_PATHS = {
    FIRE: '/img/notches/notch-fire.png',
    EARTH: '/img/notches/notch-earth.png',
    WIND: '/img/notches/notch-wind.png',
    WATER: '/img/notches/notch-water.png?v=2',
    ICE: '/img/notches/notch-ice.png',
    SHADOW: '/img/notches/notch-shadow.png?v=2',
    ELECTRIC: '/img/notches/notch-electric.png?v=2',
    METAL: '/img/notches/notch-metal.png?v=2',
    UNDEAD: '/img/notches/notch-undead.png?v=2',
    PSYCHIC: '/img/notches/notch-psychic.png?v=2',
    POISON: '/img/notches/notch-poison.png?v=2',
    LIGHT: '/img/notches/notch-light.png?v=2',
    NEUTRAL: '/img/notches/notch-neutral.png?v=2'
};

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
            html += `<div class="bc-notch bc-notch-${dir} filled ${elemClass} ${stateClass}" style="${notchIconStyle(notch.element)}"></div>`;
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
            html += `<div class="notch-dot ${elemClass} notch-${dir}" style="${notchIconStyle(notch.element)}"></div>`;
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

        html += `<div class="notch-dot ${elemClass} notch-${notch.direction} ${stateClass}" style="${notchIconStyle(notch.element)}"></div>`;
    }

    html += `</div>`;
    return html;
}

function notchIconPath(element) {
    const normalized = String(element || '').toUpperCase();
    return NOTCH_ICON_PATHS[normalized] || `/img/elements/element-${normalized.toLowerCase()}.svg`;
}

function notchIconStyle(element) {
    const normalized = String(element || 'NEUTRAL').toUpperCase();
    return `--notch:${getElementHex(normalized)};--notch-icon:url('${notchIconPath(normalized)}');`;
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

/**
 * The hand-selector card face — everything inside the `.hand-card` wrapper, plus
 * the wrapper classes that face needs. Shared so any surface that shows a hand
 * card (the hand selector, the draw-ability reveal) renders the identical
 * template rather than a lookalike.
 */
// The hand fan is far too small for the painted frame's corner chips (they are
// hidden outright in #playerHand), so a card's play cost used to be readable
// only after opening the enlarged card view. This badge is the compact
// stand-in: one element pip plus the number, tucked into the art's top-left.
function renderHandCostBadge(card) {
    if (!card) {
        return '';
    }
    let element = '';
    let amount = 0;
    let label = '';
    if (card.type === 'TRAP' && card.trapBucketElement && Number(card.trapBucketAmount) > 0) {
        element = card.trapBucketElement;
        amount = Number(card.trapBucketAmount);
        label = `Trigger: opponent holds ${amount} ${formatElementLabel(element)} energy`;
    } else if (card.costElement && Number(card.costAmount) > 0) {
        element = card.costElement;
        amount = Number(card.costAmount);
        label = `Play cost: ${amount} ${formatElementLabel(element)}`;
    }
    if (amount <= 0) {
        return '';
    }
    const triggerClass = card.type === 'TRAP' ? ' is-trigger' : '';
    return `<div class="hand-cost-badge${triggerClass}" style="${notchIconStyle(element)}" title="${escapeHtmlAttribute(label)}" aria-label="${escapeHtmlAttribute(label)}">`
        + '<span class="hand-cost-badge-icon"></span>'
        + `<span class="hand-cost-badge-amount">${amount}</span>`
        + '</div>';
}

function renderHandCardFace(card, options = {}) {
    const lockReason = options.lockReason || '';
    // The hand tray hides the card body (its cards are too small to read), so it
    // renders the verbose flavor block. Surfaces that show the body — the draw
    // reveal — ask for the compact summary that fits a frame's info panel.
    const summaryBody = Boolean(options.summaryBody);
    const fallbackArtLabel = card.type === 'SIEGLING'
        ? formatElementLabel(card.element)
        : `${formatElementLabel(card.element)} ${card.type}`.trim();
    const handFrameClass = cardFrameClass(card);
    // Holographic full-card art replaces the framed hand face with the
    // complete painted card (frame + notches + stats baked/overlaid by the
    // binder renderer). Keep the .hand-card wrapper so the drag/click
    // handlers, lock states, and sizing all stay intact.
    const holoFace = renderHolographicFullArtFace(card, {
        descriptionText: card.description || card.ability?.description || ''
    });
    const faceClass = `${handFrameClass}${holographicCardClass(card)}${holoFace ? ' has-holo-full-art' : ''}`;
    if (holoFace) {
        return { faceClass, html: holoFace + renderHandCostBadge(card) };
    }

    let html = '';
    if (card.type === 'SIEGLING') {
        html += renderHandNotches(card.notches);
    }
    html += `<div class="hand-card-shell">`;
    if (isSpellTrapCard(card) && handFrameClass) {
        html += renderCardCornerChips(card);
    }
    html += `<div class="hand-card-header">`;
    html += `<div class="card-title">${escapeHtml(card.name)}</div>`;
    const handLabel = card.type === 'SIEGLING'
        ? `SIEGELING / ${formatElementLabel(card.element)}`
        : `${card.type} / ${card.rarity}`;
    html += `<div class="card-label">${escapeHtml(handLabel)}</div>`;
    html += `</div>`;
    html += renderCardArt(card, 'hand', fallbackArtLabel);
    if (card.type === 'SIEGLING') {
        html += renderCardStatPills(card, { mode: 'hand' });
    }
    html += `<div class="hand-card-body">`;
    if (summaryBody || (isSpellTrapCard(card) && handFrameClass)) {
        html += renderCompactCardSummary(card, { abilityLimit: summaryBody ? 1 : 3, omitCostEvolution: true });
    } else {
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
    }
    if (lockReason) {
        html += `<div class="card-cost interaction-lock-copy">${escapeHtml(lockReason)}</div>`;
    }
    html += `</div>`; /* body */
    html += `</div>`; /* shell */
    html += renderHandCostBadge(card);
    html += holographicCardOverlay(card);
    return { faceClass, html };
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
        scheduleDesktopHandSelectorCardScale();
        return;
    }
    const opponentTurn = gameState.activeSide !== 'PLAYER';
    if (handTray) {
        handTray.classList.remove('battle-queue-mode');
        handTray.classList.toggle('opponent-turn', opponentTurn);
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
        if (handIndex === pendingHandRemovalIndex) {
            continue;
        }
        const elemClass = card.element.toLowerCase();
        const isSelected = selectedHandIndex === handIndex;
        const lockReason = getHandCardLockReason(card);
        const openingLocked = isOpeningPlacementOnlyTurn() && card.type !== 'SIEGLING';
        const placementLocked = isPlacementBudgetLockedForCard(card) && card.type === 'SIEGLING';
        const dragPlaceable = canHandCardDragPlace(handIndex);
        const interactionClass = [
            isSelected ? ' selected' : '',
            opponentTurn ? ' opponent-turn' : '',
            lockReason ? ' interaction-locked' : '',
            openingLocked ? ' opening-locked' : '',
            placementLocked ? ' placement-locked' : '',
            targetMode ? ' target-lock' : '',
            dragPlaceable ? ' drag-placeable' : ''
        ].join('');
        const onclick = `onclick="handleHandCardClick(event, ${handIndex})"`;
        const pointerEvents = dragPlaceable
            ? `onpointerdown="handleHandCardPointerDown(event, ${handIndex})"`
            : '';
        const hoverEvents = `onmouseenter="handleHandCardPointerEnter(event, ${handIndex})" onmouseleave="handleHandCardPointerLeave(${handIndex})"`;
        const touchEvents = `ontouchstart="handleHandCardTouchStart(event, ${handIndex})" ontouchmove="handleHandCardTouchMove(event, ${handIndex})" ontouchend="handleHandCardTouchEnd(event, ${handIndex})"`;
        const face = renderHandCardFace(card, { lockReason });
        html += `<div class="hand-card ${elemClass} ${cardTypeClass(card)}${interactionClass}${face.faceClass}" data-card-id="${escapeHtml(card.id)}" data-hand-index="${handIndex}" ${onclick} ${pointerEvents} ${hoverEvents} ${touchEvents}>`;
        html += face.html;
        html += `</div>`; /* card */
    }

    container.innerHTML = html;
    scheduleDesktopHandSelectorCardScale();
    scheduleFramedSummaryFit();
}

function scheduleDesktopHandSelectorCardScale() {
    if (handSelectorScaleFrame != null) {
        window.cancelAnimationFrame(handSelectorScaleFrame);
    }
    handSelectorScaleFrame = window.requestAnimationFrame(() => {
        handSelectorScaleFrame = null;
        syncDesktopHandSelectorCardScale();
        syncInlineBattleDockScale();
    });
}

function syncInlineBattleDockScale() {
    const root = document.documentElement;
    if (!usesInlineBattleDock() || !isHandHiddenForPhase()) {
        root.style.removeProperty('--inline-battle-dock-height');
        return;
    }

    const tray = document.getElementById('handTray');
    const battlePanel = document.getElementById('desktopHandBattlePanel');
    if (!tray || !battlePanel || battlePanel.classList.contains('hidden')) {
        root.style.removeProperty('--inline-battle-dock-height');
        return;
    }

    const trayStyles = window.getComputedStyle(tray);
    const trayPadY = (parseFloat(trayStyles.paddingTop) || 0) + (parseFloat(trayStyles.paddingBottom) || 0);
    const trayHeight = tray.clientHeight - trayPadY;
    if (!Number.isFinite(trayHeight) || trayHeight < 80) {
        return;
    }

    root.style.setProperty('--inline-battle-dock-height', `${Math.floor(trayHeight)}px`);
}

function syncDesktopHandSelectorCardScale() {
    if (isHandHiddenForPhase()) {
        if (usesInlineBattleDock()) {
            syncInlineBattleDockScale();
        }
        return;
    }

    const handCards = document.getElementById('playerHand');
    if (!handCards || handCards.classList.contains('hidden')) {
        return;
    }

    const tray = handCards.closest('.hand-tray');
    const handSection = document.getElementById('desktopHandSection');
    const handLayout = window.getComputedStyle(handCards).flexDirection;
    const isVerticalHand = handLayout === 'column';
    const usesDockedSidebarHand = Boolean(
        tray?.closest('.desktop-menu') && (isDesktopSidebarLayout() || isCompactLandscapeLayout() || isMobileLayout())
    );

    if (!usesDockedSidebarHand && !isDesktopSidebarLayout()) {
        return;
    }

    const handStyles = window.getComputedStyle(handCards);

    // Phone landscape lays the hand out as a CSS grid of aspect-ratio cards;
    // sizing is fully CSS-owned there. The old JS fit (tray height / card
    // count) fed its own output back into the next measurement, stretching a
    // lone card to the full sidebar height.
    if (handStyles.display === 'grid') {
        document.documentElement.style.removeProperty('--hand-card-height');
        return;
    }

    const paddingTop = parseFloat(handStyles.paddingTop) || 0;
    const paddingBottom = parseFloat(handStyles.paddingBottom) || 0;
    const paddingLeft = parseFloat(handStyles.paddingLeft) || 0;
    const paddingRight = parseFloat(handStyles.paddingRight) || 0;
    const columnGap = parseFloat(handStyles.columnGap || handStyles.gap) || 0;
    const rowGap = parseFloat(handStyles.rowGap || handStyles.gap) || 0;

    let contentHeight = handCards.clientHeight - paddingTop - paddingBottom;
    let contentWidth = handCards.clientWidth - paddingLeft - paddingRight;

    if (handSection) {
        const sectionStyles = window.getComputedStyle(handSection);
        const sectionPadY = (parseFloat(sectionStyles.paddingTop) || 0) + (parseFloat(sectionStyles.paddingBottom) || 0);
        const title = document.getElementById('desktopHandSectionTitle');
        const titleHeight = title?.offsetHeight || 0;
        const sectionHeight = handSection.clientHeight - sectionPadY - titleHeight;
        if (sectionHeight > contentHeight) {
            contentHeight = sectionHeight;
        }
    }

    if (tray) {
        const trayStyles = window.getComputedStyle(tray);
        const trayPadY = (parseFloat(trayStyles.paddingTop) || 0) + (parseFloat(trayStyles.paddingBottom) || 0);
        const trayHeight = tray.clientHeight - trayPadY;
        if (trayHeight > contentHeight) {
            contentHeight = trayHeight;
        }
    }

    if (contentWidth <= 0 || contentHeight <= 40) {
        return;
    }

    // Desktop holds one card size for the whole match. Dividing the rail by the
    // live hand count made every card grow or shrink each time a card was drawn,
    // played, or discarded; the rail scrolls past the reference row instead.
    const visibleCards = isDesktopSidebarLayout()
        ? HAND_SELECTOR_DESKTOP_CARD_SLOTS
        : Math.max(1, handCards.querySelectorAll('.hand-card').length || 5);
    const root = document.documentElement;

    if (isVerticalHand) {
        // Cap at the card's natural aspect for the column width so a short
        // hand can never stretch a card taller than its 5:7 proportion.
        const maxAspectHeight = Math.round(Math.max(96, contentWidth) * (7 / 5));
        const perCardHeight = Math.min(maxAspectHeight, Math.max(
            48,
            Math.floor((contentHeight - (rowGap * (visibleCards - 1))) / visibleCards)
        ));
        const nextWidth = Math.round(clampNumber(perCardHeight * (5 / 7), 56, 220));
        const nextPadding = Math.round(clampNumber(nextWidth * 0.035, 3, 8));
        root.style.setProperty('--hand-card-height', `${perCardHeight}px`);
        root.style.setProperty('--hand-card-width', `${nextWidth}px`);
        root.style.setProperty('--hand-card-padding', `${nextPadding}px`);
        return;
    }

    const maxFiveCardWidth = Math.max(
        48,
        (contentWidth - (columnGap * (visibleCards - 1))) / visibleCards
    );
    // Size each card to the available height, but never wider than the share
    // that keeps all of them across the row, so the hand stays at a comfortable
    // size and the section sits snug above the action buttons.
    const measuredWidth = Math.max(56, Math.floor(contentHeight)) * (5 / 7);
    const nextWidth = Math.round(clampNumber(
        Math.min(measuredWidth, maxFiveCardWidth),
        Math.min(96, maxFiveCardWidth),
        Math.max(96, maxFiveCardWidth)
    ));
    const nextPadding = Math.round(clampNumber(nextWidth * 0.035, 3, 8));

    root.style.removeProperty('--hand-card-height');
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

function canHandCardDragPlace(handIndex) {
    if (!gameState || gameState.currentPhase !== 'SETUP' || gameState.activeSide !== 'PLAYER' || targetMode) {
        return false;
    }
    if (placementRequestInFlight || handIndex === pendingHandRemovalIndex) {
        return false;
    }
    const card = gameState.player.hand?.[handIndex];
    if (!card || card.type !== 'SIEGLING') {
        return false;
    }
    if (getHandCardLockReason(card)) {
        return false;
    }
    return getLegalPlacementsForCard(card).length > 0;
}

function ensureHandCardSelectedForDrag(handIndex) {
    const hand = gameState?.player?.hand || [];
    const card = hand[handIndex];
    if (!card) {
        return;
    }
    if (selectedHandIndex === handIndex && selectedCard?.id === card.id) {
        return;
    }
    selectedCard = card;
    selectedHandIndex = handIndex;
    clearTargetMode();
    updateSelectedInfo(card);
    render();
}

function stripHandCardInteractionAttributes(el) {
    if (!el) {
        return;
    }
    [
        'onclick',
        'onpointerdown',
        'onmouseenter',
        'onmouseleave',
        'ontouchstart',
        'ontouchmove',
        'ontouchend'
    ].forEach((attr) => el.removeAttribute(attr));
}

function findLegalPlacementCellAt(clientX, clientY) {
    const stack = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(clientX, clientY)
        : [document.elementFromPoint(clientX, clientY)].filter(Boolean);
    for (const el of stack) {
        const cell = el.closest?.('#playerGrid .board-cell.legal');
        if (cell) {
            return cell;
        }
    }
    const slop = isCompactLandscapeLayout() ? 28 : 14;
    let nearest = null;
    let nearestDistance = Infinity;
    document.querySelectorAll('#playerGrid .board-cell.legal').forEach((cell) => {
        const rect = cell.getBoundingClientRect();
        if (
            clientX < rect.left - slop
            || clientX > rect.right + slop
            || clientY < rect.top - slop
            || clientY > rect.bottom + slop
        ) {
            return;
        }
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = ((clientX - centerX) ** 2) + ((clientY - centerY) ** 2);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = cell;
        }
    });
    if (nearest) {
        return nearest;
    }
    return null;
}

function clearCardDragBoardHover() {
    document.querySelectorAll('#playerGrid .board-cell.drag-hover')
        .forEach((cell) => cell.classList.remove('drag-hover'));
}

function positionCardDragGhost(clientX, clientY) {
    const ghost = cardDragSession?.ghost;
    if (!ghost) {
        return;
    }
    ghost.style.left = `${clientX}px`;
    ghost.style.top = `${clientY}px`;
}

function activateCardDragSession() {
    if (!cardDragSession || cardDragSession.active) {
        return;
    }
    const { handIndex } = cardDragSession;

    cardDragSession.active = true;
    cardDragSuppressClickUntil = Date.now() + 500;
    document.body.classList.add('card-drag-active');
    hideTooltip();
    if (activeDrawer === 'selected') {
        closeDrawer(true);
    }
    // Selecting the card re-renders the hand, which destroys the element that
    // pointerdown captured. WebKit answers an implicit capture release on a
    // removed node with pointercancel, which would abort the drag the instant
    // it starts. Hand the capture back first — the drag tracks pointer events
    // on document, so it does not need capture to keep working.
    releaseCardDragPointerCapture();
    ensureHandCardSelectedForDrag(handIndex);
    // Selection re-renders the hand and normally defers its responsive sizing
    // to the next animation frame. Resolve that sizing before measuring the
    // ghost so a quick drag cannot capture stale pre-layout dimensions.
    if (handSelectorScaleFrame != null) {
        window.cancelAnimationFrame(handSelectorScaleFrame);
        handSelectorScaleFrame = null;
    }
    syncDesktopHandSelectorCardScale();

    const sourceEl = getHandCardSourceElement(handIndex);
    if (!sourceEl) {
        cleanupCardDragSession();
        return;
    }
    cardDragSession.sourceEl = sourceEl;

    const sourceRect = sourceEl.getBoundingClientRect();
    const ghost = sourceEl.cloneNode(true);
    stripHandCardInteractionAttributes(ghost);
    // The hand card art is lazy-loaded; a freshly cloned lazy <img> can paint
    // blank when reinserted, exposing the procedural card frame underneath.
    // Force the ghost art to load eagerly (reusing the already-resolved source
    // image) so it stays hand-drawn for the whole drag.
    const sourceImgs = sourceEl.querySelectorAll('img');
    ghost.querySelectorAll('img').forEach((img, index) => {
        img.removeAttribute('loading');
        img.loading = 'eager';
        img.decoding = 'sync';
        const sourceImg = sourceImgs[index];
        if (sourceImg?.currentSrc) {
            img.src = sourceImg.currentSrc;
        }
    });
    ghost.classList.add('card-drag-ghost');
    // Keep layout at the source card's untransformed dimensions, then carry
    // its live selected/hover scale onto the outer ghost transform. Using the
    // rendered bounds as the clone's layout size made its text wrap and move,
    // and the old fixed 1.06 scale enlarged it a second time.
    const sourceLayoutWidth = sourceEl.offsetWidth || sourceRect.width;
    const sourceLayoutHeight = sourceEl.offsetHeight || sourceRect.height;
    const sourceScale = sourceLayoutWidth > 0
        ? Math.max(0.5, Math.min(2, sourceRect.width / sourceLayoutWidth))
        : 1;
    ghost.style.width = `${sourceLayoutWidth}px`;
    ghost.style.minWidth = `${sourceLayoutWidth}px`;
    ghost.style.maxWidth = `${sourceLayoutWidth}px`;
    ghost.style.height = `${sourceLayoutHeight}px`;
    ghost.style.minHeight = `${sourceLayoutHeight}px`;
    ghost.style.maxHeight = `${sourceLayoutHeight}px`;
    ghost.style.setProperty('--card-drag-source-scale', String(sourceScale));
    positionCardDragGhost(cardDragSession.startX, cardDragSession.startY);

    const layer = document.getElementById('handLiftLayer');
    if (layer) {
        layer.innerHTML = '';
        layer.classList.remove('hidden');
        layer.appendChild(ghost);
    } else {
        document.body.appendChild(ghost);
    }

    sourceEl.classList.add('is-drag-source');
    cardDragSession.ghost = ghost;
    updateHandLiftLayer();
}

function releaseCardDragPointerCapture() {
    const captureEl = cardDragSession?.captureEl;
    if (!captureEl || cardDragSession.pointerId == null) {
        return;
    }
    try {
        if (captureEl.hasPointerCapture?.(cardDragSession.pointerId)) {
            captureEl.releasePointerCapture(cardDragSession.pointerId);
        }
    } catch (_) {
        /* capture already gone */
    }
    cardDragSession.captureEl = null;
}

function cleanupCardDragSession() {
    if (!cardDragSession) {
        return;
    }
    releaseCardDragPointerCapture();
    cardDragSession.sourceEl?.classList?.remove('is-drag-source');
    cardDragSession.ghost?.remove();
    // Sweep any ghost the session lost track of (interrupted gesture, a second
    // pointer starting a new session) so a dragged card can never be left
    // floating over the hand after the drag ends.
    document.querySelectorAll('.card-drag-ghost').forEach((el) => el.remove());
    const layer = document.getElementById('handLiftLayer');
    if (layer && !layer.querySelector('.lifted-card-clone')) {
        layer.innerHTML = '';
        layer.classList.add('hidden');
    }
    clearCardDragBoardHover();
    document.body.classList.remove('card-drag-active');
    cardDragSession = null;
    stopHandSelectorAutoScroll();
    updateHandLiftLayer();
}

function updateCardDragBoardHover(clientX, clientY) {
    clearCardDragBoardHover();
    const cell = findLegalPlacementCellAt(clientX, clientY);
    if (cell) {
        cell.classList.add('drag-hover');
    }
}

function handleHandCardPointerDown(event, handIndex) {
    if (!canHandCardDragPlace(handIndex)) {
        return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
    }
    if (event.pointerType !== 'mouse') {
        event.preventDefault();
    }
    cleanupCardDragSession();
    cardDragSession = {
        handIndex,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        ghost: null,
        sourceEl: event.currentTarget,
        captureEl: null
    };
    try {
        event.currentTarget.setPointerCapture(event.pointerId);
        cardDragSession.captureEl = event.currentTarget;
    } catch (_) {
        /* ignore */
    }
}

// A cancelled gesture is not a drop. iOS Safari fires pointercancel whenever it
// takes the touch over for its own scrolling/zoom handling, and treating that
// as a drop placed cards the player never released.
function handleCardDragPointerCancel(event) {
    if (!cardDragSession || event.pointerId !== cardDragSession.pointerId) {
        return;
    }
    cleanupCardDragSession();
}

function handleCardDragPointerMove(event) {
    if (!cardDragSession || event.pointerId !== cardDragSession.pointerId) {
        return;
    }
    const dx = event.clientX - cardDragSession.startX;
    const dy = event.clientY - cardDragSession.startY;
    if (!cardDragSession.active) {
        if (Math.hypot(dx, dy) < CARD_DRAG_THRESHOLD_PX) {
            return;
        }
        activateCardDragSession();
    }
    event.preventDefault();
    stopHandSelectorAutoScroll();
    positionCardDragGhost(event.clientX, event.clientY);
    updateCardDragBoardHover(event.clientX, event.clientY);
}

function handleCardDragPointerEnd(event) {
    if (!cardDragSession || event.pointerId !== cardDragSession.pointerId) {
        return;
    }

    const wasActive = cardDragSession.active;
    const handIndex = cardDragSession.handIndex;

    if (wasActive) {
        const targetCell = findLegalPlacementCellAt(event.clientX, event.clientY);
        const row = targetCell ? Number(targetCell.dataset.row) : NaN;
        const col = targetCell ? Number(targetCell.dataset.col) : NaN;
        // Tear the drag down before submitting: placeCard re-renders the hand,
        // and an active session would keep the drag ghost pinned over it.
        cleanupCardDragSession();
        if (Number.isInteger(row) && Number.isInteger(col)) {
            ensureHandCardSelectedForDrag(handIndex);
            placeCard(row, col);
        }
        event.preventDefault();
        return;
    }

    cleanupCardDragSession();

    if (isMobileLayout()) {
        event.preventDefault();
        event.stopPropagation();
        activateHandCard(handIndex);
        handTouchSuppressHandIndex = handIndex;
        handTouchSuppressUntil = Date.now() + 500;
    }
}

function handleHandCardClick(event, handIndex) {
    if (Date.now() < cardDragSuppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    // On touch devices the tap is fully handled in touchend; ignore the
    // synthetic click that follows so it is not counted as a second tap.
    if (isMobileLayout() && handTouchSuppressHandIndex === handIndex && Date.now() < handTouchSuppressUntil) {
        return;
    }
    activateHandCard(handIndex);
}

// Quick second tap on the same hand card opens its full preview; a single tap
// keeps the normal select/toggle behaviour.
function handCardActivationIsDoubleTap(handIndex) {
    const now = Date.now();
    const isDouble = lastHandActivation.handIndex === handIndex
        && (now - lastHandActivation.time) <= HAND_DOUBLE_TAP_MS;
    lastHandActivation = { handIndex, time: isDouble ? 0 : now };
    return isDouble;
}

function activateHandCard(handIndex) {
    if (handCardActivationIsDoubleTap(handIndex)) {
        openHandCardPreview(handIndex);
        return;
    }
    selectCard(handIndex);
}

function openHandCardPreview(handIndex) {
    if (!gameState || gameState.currentPhase !== 'SETUP') {
        return;
    }
    const card = gameState.player?.hand?.[handIndex];
    if (!card) {
        return;
    }
    clearArenaSelection();
    hoveredBoardCard = null;
    selectedCard = card;
    selectedHandIndex = handIndex;
    clearTargetMode();
    // Action cards need the explicit confirm step rather than auto-firing.
    if (isActionCard(card) && isMobileLayout()) {
        mobileSpellPreviewPending = true;
    }
    updateSelectedInfo(card, getHandCardLockReason(card) || null);
    if (usesLandscapeInspectorMenuDock()) {
        openLandscapeInspectorMenu('card');
        render();
        return;
    }
    openDrawer('selected');
    render();
}

function handleHandCardTouchStart(event, handIndex) {
    if (!isMobileLayout() || cardDragSession) {
        return;
    }
    if (canHandCardDragPlace(handIndex)) {
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
    if (!isMobileLayout() || cardDragSession || !handTouchGesture || handTouchGesture.handIndex !== handIndex) {
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
    if (!isMobileLayout() || cardDragSession) {
        return;
    }
    const shouldSelect = Boolean(handTouchGesture && handTouchGesture.handIndex === handIndex && !handTouchGesture.moved);
    handTouchGesture = null;
    if (!shouldSelect) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    activateHandCard(handIndex);
    handTouchSuppressHandIndex = handIndex;
    handTouchSuppressUntil = Date.now() + 500;
}

function renderMulliganOverlay() {
    const overlay = document.getElementById('mulliganOverlay');
    const preview = document.getElementById('mulliganHandPreview');
    const copy = document.getElementById('mulliganCopy');
    const actions = document.getElementById('mulliganActions');
    const waitActions = document.getElementById('mulliganWaitActions');
    if (!overlay || !preview || !copy || !actions) {
        return;
    }

    // The server calls the mulligan over the moment the redraw lands, but the
    // player has not seen what they drew yet — hold the overlay open, without
    // its controls, until the reveal finishes.
    if (!gameState?.mulligan?.active && mulliganRevealHold) {
        overlay.classList.add('visible');
        actions.classList.add('hidden');
        waitActions?.classList.add('hidden');
        renderMulliganHandSlots(preview, gameState?.player?.hand || [], null, false, false);
        return;
    }

    if (!gameState?.mulligan?.active) {
        overlay.classList.remove('visible');
        preview.innerHTML = '';
        mulliganHandSig = '';
        waitActions?.classList.add('hidden');
        return;
    }

    overlay.classList.add('visible');
    const hand = gameState.player.hand || [];
    const allowedSet = mulliganAllowedIndexSet();
    const scriptedTutorial = Boolean(gameState.mulligan?.tutorialScripted) || (allowedSet && allowedSet.size === 1);
    if (gameState.mulligan.youPending) {
        const sig = hand.map((c, i) => i + ':' + c.id).join(',');
        if (sig !== mulliganHandSig) {
            mulliganSelectedIndices.clear();
            mulliganHandSig = sig;
        }
        if (scriptedTutorial) {
            // Name the card the player can actually swap, read from the hand
            // rather than baked in: the tutorial deal is fixed but the copy
            // hard-coded "Pylook" and the slot holds whatever was dealt there.
            const swapIndex = allowedSet ? [...allowedSet][0] : hand.length - 1;
            const swapName = hand[swapIndex]?.name;
            copy.textContent = swapName
                ? `Tap ${swapName}, then Redraw selected to replace it. Choose Keep hand to keep your opening cards.`
                : 'Tap the marked card, then Redraw selected to replace it. Choose Keep hand to keep your opening cards.';
        } else {
            copy.textContent = 'Select any cards to shuffle back into your deck; you draw the same number of new cards. Leave none selected to keep your whole hand. You get one mulligan before the first draw phase.';
        }
    } else if (gameState.mulligan.opponentPending) {
        mulliganHandSig = '';
        copy.textContent = 'Your hand is locked. Waiting for the other player to finish their mulligan decision.';
    } else {
        mulliganHandSig = '';
        copy.textContent = 'Both players locked their opening hands. The first draw phase is about to begin.';
    }

    actions.classList.toggle('hidden', !gameState.mulligan.youPending);
    waitActions?.classList.toggle('hidden', !gameState.multiplayer || gameState.mulligan.youPending);
    const redrawBtn = document.getElementById('btnMulliganRedraw');
    if (redrawBtn && gameState.mulligan.youPending) {
        const n = mulliganSelectedIndices.size;
        redrawBtn.disabled = n === 0;
        redrawBtn.textContent = n === 0 ? 'Redraw selected' : `Redraw ${n} card${n === 1 ? '' : 's'}`;
    }

    renderMulliganHandSlots(preview, hand, allowedSet, gameState.mulligan.youPending, scriptedTutorial);
}

/**
 * The five opening-hand slots. Shared by the live mulligan and by the redraw
 * reveal that plays after the server has closed the mulligan, so both draw the
 * same card faces — and so the flip classes come from state on every render
 * rather than being pushed onto the DOM once and lost to the next one.
 */
function renderMulliganHandSlots(preview, hand, allowedSet, youPending, scriptedTutorial) {
    preview.innerHTML = hand.map((card, index) => {
        const isSelected = mulliganSelectedIndices.has(index);
        const slotAllowed = !allowedSet || allowedSet.has(index);
        const interactive = youPending && slotAllowed;
        const locked = youPending && allowedSet && !slotAllowed;
        const flipping = mulliganFlipIndices.has(index);
        const slotClasses = [
            'mulligan-card-slot',
            (card.element || 'NEUTRAL').toLowerCase(),
            isSelected ? 'is-selected' : '',
            interactive ? 'is-interactive' : '',
            locked ? 'is-locked' : '',
            flipping ? 'is-flipping' : '',
            flipping && mulliganFaceDown ? 'is-face-down' : ''
        ].filter(Boolean).join(' ');
        const backStyle = flipping && mulliganFlipBackArt
            ? ` style="--mulligan-card-back:url('${escapeHtmlAttribute(mulliganFlipBackArt)}')"`
            : '';
        const role = interactive ? ' role="button" tabindex="0" aria-pressed="' + (isSelected ? 'true' : 'false') + '"' : '';
        const click = interactive ? ` onclick="toggleMulliganCard(${index})"` : '';
        // Holographic cards with full-card art show the complete painted face
        // (as in the binder); everything else uses the framed showcase. Two
        // ability rows max — mulligan cards are too small for three wrapped
        // prose lines; the "+N moves" row signals the rest.
        const showcase = renderHolographicFullArtFace(card, {
            descriptionText: card.description || card.ability?.description || ''
        }) || renderShowcaseCard(card, { artVariant: 'preview', cardClass: 'mulligan-showcase', compactAbilityLimit: 2 });
        // No badge on a card mid-flip: it names a choice already taken, and it
        // would ride the turn round with the card.
        let badge = '';
        if (flipping) {
            badge = '';
        } else if (isSelected) {
            badge = `<div class="mulligan-redraw-badge" aria-hidden="true">Redraw</div>`;
        } else if (locked) {
            badge = `<div class="mulligan-keep-badge" aria-hidden="true">Keep</div>`;
        } else if (scriptedTutorial && slotAllowed && youPending) {
            badge = `<div class="mulligan-practice-badge" aria-hidden="true">Tap to redraw</div>`;
        }
        return `
        <div class="${slotClasses}" data-index="${index}"${role}${click}${backStyle}>
            ${badge}
            <div class="mulligan-card-face">${showcase}</div>
        </div>`;
    }).join('');

    // Mulligan slots are a fixed proportion. After the markup lands, scale each
    // card's ability text so it FILLS the template: sparse cards grow, dense
    // cards shrink, both wrapping. The art stays a consistent size; only an
    // extremely text-dense card reclaims a little art height as a last resort
    // so no ability line is cut off.
    scheduleMulliganTextFit();
}

let mulliganFitFrame = 0;
let mulliganFitResizeBound = false;

function scheduleMulliganTextFit() {
    if (mulliganFitFrame) {
        cancelAnimationFrame(mulliganFitFrame);
    }
    // Double rAF so the slot/body heights are settled before we measure.
    mulliganFitFrame = requestAnimationFrame(() => {
        mulliganFitFrame = requestAnimationFrame(() => {
            mulliganFitFrame = 0;
            fitMulliganCardText();
            scheduleFramedSummaryFit();
        });
    });
    if (!mulliganFitResizeBound) {
        mulliganFitResizeBound = true;
        window.addEventListener('resize', () => {
            const overlay = document.getElementById('mulliganOverlay');
            if (overlay?.classList.contains('visible')) {
                scheduleMulliganTextFit();
            }
        });
    }
}

function fitMulliganCardText() {
    const cards = document.querySelectorAll('#mulliganHandPreview .hand-card.mulligan-showcase');
    cards.forEach((card) => {
        if (card.classList.contains('element-frame')) {
            return;
        }
        const body = card.querySelector('.hand-card-body');
        if (!body || !body.clientHeight) {
            return;
        }
        const art = card.querySelector('.card-art-preview');
        // Clear any prior fit so we always measure against the natural layout.
        body.style.fontSize = '';
        if (art) {
            art.style.flex = '';
            art.style.height = '';
            art.style.maxHeight = '';
            art.style.aspectRatio = '';
            art.style.minHeight = '';
        }
        if (body.querySelector('.card-summary-list')) {
            return;
        }

        // scrollHeight reflects the full wrapped content even though the body
        // clips via overflow:hidden; +0.5 absorbs sub-pixel rounding.
        const fits = () => body.scrollHeight <= body.clientHeight + 0.5;

        const MIN_PX = 7;
        const MAX_PX = 19;

        // 1) Dense card (e.g. a 4-ability Siegeling) whose text won't fit even
        //    at the minimum size with the natural art: reclaim art height
        //    (down to 45%) so the text has room. Done BEFORE sizing the font so
        //    step 2 can then grow the text into the enlarged body — otherwise
        //    the font stays pinned at the minimum and reads tiny with empty
        //    space below it.
        body.style.fontSize = `${MIN_PX}px`;
        if (art && !fits()) {
            let artH = art.getBoundingClientRect().height;
            const minArtH = artH * 0.45;
            art.style.aspectRatio = 'auto';
            art.style.minHeight = '0';
            while (!fits() && artH > minArtH) {
                artH -= 6;
                art.style.flex = `0 0 ${artH}px`;
                art.style.height = `${artH}px`;
                art.style.maxHeight = `${artH}px`;
            }
        }

        // 2) Binary-search the largest font that fits the (possibly enlarged)
        //    body so the text grows to fill it. Sparse cards grow toward MAX,
        //    dense cards settle lower. Text wraps either way.
        let lo = MIN_PX;
        let hi = MAX_PX;
        let best = MIN_PX;
        for (let i = 0; i < 9; i++) {
            const mid = (lo + hi) / 2;
            body.style.fontSize = `${mid}px`;
            if (fits()) {
                best = mid;
                lo = mid;
            } else {
                hi = mid;
            }
        }
        body.style.fontSize = `${best.toFixed(2)}px`;

        // 3) Line wrapping makes the fitted height jump in steps, so the best
        //    font often leaves slack below the text. Grow the art to absorb that
        //    slack so the card fills its template instead of showing tiny text
        //    over empty space (and so the art never sits as a thin pill with a
        //    gap beneath the text).
        if (art) {
            const slack = body.clientHeight - body.scrollHeight - 2;
            if (slack > 3) {
                const curArtH = art.getBoundingClientRect().height;
                const grownArtH = curArtH + slack;
                art.style.aspectRatio = 'auto';
                art.style.minHeight = '0';
                art.style.flex = `0 0 ${grownArtH}px`;
                art.style.height = `${grownArtH}px`;
                art.style.maxHeight = `${grownArtH}px`;
            }
        }
    });
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

function renderSelectedCardBattlePreview(card, options = {}) {
    const elementClass = String(card?.element || 'neutral').toLowerCase();
    const abilities = getSelectedCardBattlePreviewAbilities(card);
    const boardCard = isBoardPreviewCard(card);
    const lockReason = boardCard ? '' : getHandCardLockReason(card);
    const fallback = card?.type === 'SIEGLING'
        ? 'Basic strike only. No printed battle ability is available for this Siegeling.'
        : 'No printed ability text is available for this card.';
    const intro = options.introHtml
        || (boardCard
            ? `<div class="battle-attacker"><strong>Battle moves.</strong> Every printed action this Siegeling can queue once battle starts.</div>`
            : `<div class="battle-attacker"><strong>Battle View — selected card.</strong> Simulate the moves and effects this hand card could use once it is in play.</div>`);
    const label = boardCard
        ? (boardCardOwnershipLabel(card) === 'Your' ? 'Your board' : 'Enemy board')
        : 'Selected';

    let html = '<div class="battle-standby-preview battle-selected-preview">';
    html += intro;
    html += `<article class="battle-standby-card battle-selected-card ${elementClass}">`;
    html += '<div class="battle-standby-card-head">';
    html += `<div><div class="battle-standby-selected-label">${escapeHtml(label)}</div><div class="battle-standby-card-name">${escapeHtml(card?.name || 'Card')}</div><div class="battle-standby-card-meta">${escapeHtml(getSelectedCardBattlePreviewMeta(card))}</div></div>`;
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

function renderSelectedPreviewMovesPage(card) {
    return renderSelectedCardBattlePreview(card, {
        introHtml: '<div class="battle-attacker"><strong>Battle Action.</strong> Swipe back for the card summary.</div>'
    });
}

function syncSelectedPreviewDrawerTitle(pageIndex = 0) {
    const title = document.querySelector('#drawerSelected > h3');
    if (!title) return;
    title.textContent = pageIndex >= 1 ? 'Battle Action' : 'Card Preview';
}

function bindSelectedPreviewPager(root) {
    const pager = root?.querySelector?.('[data-selected-preview-pager]');
    const pages = pager?.querySelector?.('[data-selected-preview-pages]');
    if (!pager || !pages) return;

    const dots = Array.from(pager.querySelectorAll('[data-page-dot]'));
    const hint = pager.querySelector('.selected-preview-swipe-hint');
    const pageCount = Math.max(1, pages.querySelectorAll('[data-selected-preview-page]').length);
    let activeIndex = 0;

    const setActive = (index, { scroll = false } = {}) => {
        const next = Math.max(0, Math.min(pageCount - 1, Number(index) || 0));
        activeIndex = next;
        dots.forEach((dot) => {
            const on = Number(dot.dataset.pageDot) === next;
            dot.classList.toggle('is-active', on);
            dot.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        pager.dataset.activePage = String(next);
        if (hint) {
            hint.textContent = next >= 1 ? 'Swipe for summary' : 'Swipe for moves';
        }
        syncSelectedPreviewDrawerTitle(next);
        if (scroll) {
            // Instant jump: smooth scrollTo fights scroll-snap inside the
            // shrink-to-fit desktop drawer and can stall mid-page.
            const width = pages.clientWidth || 1;
            pages.scrollLeft = next * width;
        }
    };

    const syncFromScroll = () => {
        const width = pages.clientWidth || 1;
        setActive(Math.round(pages.scrollLeft / width));
    };

    pages.addEventListener('scroll', syncFromScroll, { passive: true });
    dots.forEach((dot) => {
        dot.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setActive(dot.dataset.pageDot, { scroll: true });
        });
    });
    // Fresh card always opens on the summary page.
    setActive(0);
    pages.scrollLeft = 0;
}

function renderStandbyBattleAbilityPreview() {
    const selectedPreviewCard = getSelectedBattlePreviewCard();
    if (selectedPreviewCard) {
        return renderSelectedCardBattlePreview(selectedPreviewCard);
    }

    const entries = getStandbyBattlePreviewCards();
    if (entries.length === 0) {
        return '<div class="battle-attacker"><strong>Battle View.</strong> Place a Siegeling, or select one in hand, to simulate the attacks and moves it could make.</div><div class="battle-hint">When battle begins, this panel becomes the live speed-order action queue.</div>';
    }

    let html = '<div class="battle-standby-preview">';
    html += '<div class="battle-attacker"><strong>Battle View.</strong> Simulate which attacks and moves each of your Siegelings could make this battle.</div>';
    html += '<div class="battle-hint">Listed in projected speed order. Energy availability is re-checked when each Siegeling actually acts.</div>';
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
        html += `<div><div class="battle-standby-card-name">${escapeHtml(card?.name || 'Siegeling')}</div><div class="battle-standby-card-meta">HP ${escapeHtml(String(hp))}/${escapeHtml(String(maxHp))} | SPD ${escapeHtml(String(speed))} | ${escapeHtml(rowLabel)}</div></div>`;
        html += `<div class="battle-standby-order">#${entries.indexOf(entry) + 1}</div>`;
        html += '</div>';
        html += renderStandbyAbilityRows(abilities, 'Basic strike only. No printed battle ability is available for this Siegeling.');
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
    if (isBattleTargetSelectionActive()) {
        overlays.forEach((overlay) => {
            overlay.className = 'battle-row-confirm-overlay hidden';
            overlay.innerHTML = '';
        });
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
    const drawerPanels = [
        document.getElementById('battleActionPanel'),
        document.getElementById('desktopBattleActionPanel')
    ].filter(Boolean);
    const handPanel = document.getElementById('desktopHandBattlePanel');
    const inspectPanel = document.getElementById('desktopInspectBattlePanel');
    const panels = [...drawerPanels, handPanel].filter(Boolean);
    if ((panels.length === 0 && !inspectPanel) || !gameState) {
        return;
    }
    const setPanelHtml = (targets, html) => {
        targets.forEach(panel => {
            if (!panel) return;
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
        const statStripHtml = options.statsCell ? renderActingCardStatStrip(options.statsCell) : '';
        const headerHtml = cardTitle
            ? `<div class="battle-queue-topbar">
                <div class="battle-queue-card-title">${escapeHtml(cardTitle)}</div>
                ${statStripHtml}
                <div class="battle-queue-state ${stateClass}">${escapeHtml(stateLabel)}</div>
            </div>`
            : `<div class="battle-queue-header">
                <div class="battle-queue-state ${stateClass}">${escapeHtml(stateLabel)}</div>
            </div>`;
        return `<div class="${shellClass}">${headerHtml}${bodyHtml}</div>`;
    };

    // The acting Siegeling's move buttons must not appear before the phase
    // banner that introduces them. render() paints from authoritative state the
    // instant it lands, so this panel — and only this panel — waits on the
    // presentation clock; the board, HP bars and hand keep updating live
    // because the queue's pending-state layer is built around render() running.
    // Targeting is exempt: it is player-driven, so playback is never mid-flight.
    const presentationBusy = Boolean(window.SieglingsActionQueue?.isPresentationBusy?.())
        && !isBattleTargetSelectionActive();

    // Hold the actionable panels in standby while playback runs. Scoped to the
    // drawer and hand docks on purpose: the left inspector is only rewritten
    // below when the landscape dock is in use, so writing standby into it here
    // would strand "Queue is resolving" on that rail after playback ends.
    if (pending && presentationBusy) {
        const holdHtml = buildQueueShell(
            'Resolving',
            'waiting',
            '<div class="battle-attacker"><strong>Queue is resolving.</strong> The next available Siegeling will surface here in speed order.</div><div class="battle-hint">Stay ready. When your next acting Siegeling arrives, this panel flips into queue mode automatically.</div>'
        );
        setPanelHtml([...drawerPanels, handPanel].filter(Boolean), holdHtml);
        return;
    }

    if (!pending) {
        let standbyHtml;
        if (gameState.currentPhase === 'BATTLE' && gameState.battleWaitingOn === 'ENEMY') {
            standbyHtml = buildQueueShell(
                'Await Opponent',
                'waiting',
                '<div class="battle-attacker"><strong>Queue locked.</strong> The opponent is resolving the current speed action.</div><div class="battle-hint">The hand HUD will reopen your queue prompt as soon as the next acting Siegeling is ready.</div>'
            );
        } else if (gameState.currentPhase === 'BATTLE') {
            standbyHtml = buildQueueShell(
                'Resolving',
                'waiting',
                '<div class="battle-attacker"><strong>Queue is resolving.</strong> The next available Siegeling will surface here in speed order.</div><div class="battle-hint">Stay ready. When your next acting Siegeling arrives, this panel flips into queue mode automatically.</div>'
            );
        } else {
            standbyHtml = buildQueueShell(
                'Battle View',
                'waiting',
                renderStandbyBattleAbilityPreview()
            );
        }
        // Standby / waiting preview: drawer + left inspector. Hand dock only
        // needs content during BATTLE while the queue is idle between actors.
        setPanelHtml(drawerPanels, standbyHtml);
        if (inspectPanel) {
            setPanelHtml([inspectPanel], standbyHtml);
        }
        if (handPanel && gameState.currentPhase === 'BATTLE') {
            setPanelHtml([handPanel], standbyHtml);
        } else if (handPanel && gameState.currentPhase !== 'BATTLE') {
            // Keep a lightweight copy for any non-landscape consumers that peek
            // at the hand battle panel outside combat.
            setPanelHtml([handPanel], standbyHtml);
        }
        return;
    }

    if (usesInlineBattleDock()) {
        if (activeDrawer === 'battle') {
            closeDrawer(true);
        }
    } else if (isMobileLayout() && activeDrawer !== 'battle' && !isBattleTargetSelectionActive()) {
        mobileInfoTab = 'battle';
        openDrawer('battle');
    }

    const battleTargeting = isBattleTargetSelectionActive();
    const activeTargetAbility = battleTargeting ? getActiveBattleTargetAbility() : null;
    let bodyHtml = '';

    if (battleTargeting && activeTargetAbility) {
        bodyHtml += renderBattleTargetingTray(pending, activeTargetAbility);
    } else {
        let actionsHtml = '';
        const sortedAbilities = getSortedBattleAbilities(pending.abilities).filter((a) => !a.fromPrintedPassive);
        for (const ability of sortedAbilities) {
            const disabled = ability.affordable ? '' : 'disabled';
            const moveName = getBattleAbilityDisplayName(ability);
            const effectLine = getBattleAbilityEffectLine(ability);
            const weaknessPreview = formatBattleAbilityWeaknessPreview(ability);
            const tip = `${moveName}: ${effectLine}${weaknessPreview ? ` ${weaknessPreview}` : ''}`;
            actionsHtml += `<button class="battle-ability-btn" type="button" data-ability-index="${ability.index}" ${disabled} title="${escapeHtmlAttribute(tip)}"><span class="battle-ability-btn-inner"><span class="battle-ability-copy"><span class="battle-ability-move-name">${escapeHtml(moveName)}</span><span class="battle-ability-effect">${escapeHtml(effectLine)}</span>${weaknessPreview ? `<span class="battle-ability-weakness">${escapeHtml(weaknessPreview)}</span>` : ''}</span><span class="battle-ability-cost">${renderBattleAbilityCostEmblems(ability)}</span></span></button>`;
        }
        bodyHtml += `<div class="battle-queue-actions">${actionsHtml}</div>`;
    }

    const targetingShellLabel = battleTargeting && activeTargetAbility
        ? buildBattleTargetingInstruction(targetContext.side, activeTargetAbility, getRowSelectSelectedRow()).trayStateLabel
        : 'Acting Now';

    const actingCell = findBoardCellByInstanceId(pending.instanceId);
    const liveHtml = buildQueueShell(
        targetingShellLabel,
        battleTargeting ? 'targeting' : 'live',
        bodyHtml,
        { expanded: true, cardTitle: pending.name, statsCell: actingCell }
    );
    // Live battle moves stay on the right hand dock (and portrait drawers).
    // Never mirror actionable move buttons into the left inspector rail.
    setPanelHtml([...drawerPanels, handPanel].filter(Boolean), liveHtml);
    if (inspectPanel && usesLandscapeInspectorMenuDock()) {
        inspectPanel.innerHTML = buildQueueShell(
            'Live Queue',
            'live',
            '<div class="battle-attacker"><strong>Battle moves are on the right.</strong> Use the hand tray to pick the current Siegeling\'s action.</div><div class="battle-hint">This left screen stays for previews, log, energy, and hints.</div>'
        );
    }
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
    if (usesInlineBattleDock()) {
        closeDrawer(true);
        if (isPortraitMobileHudLayout()) {
            closeMobileHudSheet();
        }
    } else if (isMobileLayout()) {
        mobileInfoTab = 'battle';
        openDrawer('battle');
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

function isViewerPlayerSide() {
    if (!gameState) {
        return true;
    }
    if (gameState.viewerSide) {
        return gameState.viewerSide === 'PLAYER';
    }
    return true;
}

function formatBattleOwnerLabel(ownerSide) {
    if (!gameState) {
        return 'Player';
    }
    const ownerIsPlayer = ownerSide === 'PLAYER';
    const viewerIsPlayer = isViewerPlayerSide();
    if (ownerIsPlayer === viewerIsPlayer) {
        return 'You';
    }
    return viewerIsPlayer ? (gameState.enemyName || 'Opponent') : (gameState.playerName || 'Player');
}

function getNextBattleActorAfterPass() {
    if (!gameState || gameState.currentPhase !== 'BATTLE') {
        return null;
    }
    const queue = gameState.battleQueue;
    if (Array.isArray(queue) && queue.length > 0) {
        const next = queue[0];
        return {
            siegeling: next.name || 'Siegeling',
            player: next.ownerLabel || formatBattleOwnerLabel(next.ownerSide)
        };
    }
    const pendingId = gameState.pendingBattle?.instanceId;
    const entries = [];
    for (const isPlayer of [true, false]) {
        const board = isPlayer ? gameState.playerBoard : gameState.enemyBoard;
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const cell = board?.[row]?.[col];
                if (!cell || cell.instanceId === pendingId) {
                    continue;
                }
                entries.push({
                    name: cell.name,
                    spd: cell.spd ?? cell.speed ?? 0,
                    ownerSide: isPlayer ? 'PLAYER' : 'ENEMY'
                });
            }
        }
    }
    entries.sort((left, right) => Number(right.spd) - Number(left.spd));
    const next = entries[0];
    if (!next) {
        return { siegeling: 'Queue', player: 'clear' };
    }
    return {
        siegeling: next.name || 'Siegeling',
        player: formatBattleOwnerLabel(next.ownerSide)
    };
}

function renderBattlePassButton() {
    const btn = document.getElementById('btnBattlePass');
    const nextLabel = document.getElementById('btnBattlePassNext');
    if (!btn) {
        return;
    }
    const phase = gameState?.currentPhase;
    const over = gameState?.gameOver;
    const canPass = phase === 'BATTLE'
        && gameState.pendingBattle
        && gameState.battleWaitingOn !== 'ENEMY'
        && !isBattleTargetSelectionActive();
    btn.classList.toggle('hidden', !canPass);
    btn.hidden = !canPass;
    btn.disabled = over || !canPass;
    if (!canPass) {
        if (nextLabel) {
            nextLabel.textContent = '';
        }
        return;
    }
    const next = getNextBattleActorAfterPass();
    const nextLine = next
        ? `Next: ${next.siegeling} · ${next.player}`
        : 'Skip this action';
    if (nextLabel) {
        nextLabel.textContent = nextLine;
    }
    btn.title = next
        ? `Pass. ${nextLine}`
        : 'Pass: Skip this action without spending energy.';
    btn.setAttribute('aria-label', next ? `Pass. ${nextLine}` : 'Pass battle action');
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
    // No legal cells while the opponent holds initiative — this is what kills
    // both the click-to-place highlights and the drag-drop landing zones.
    if (isOpponentControlLocked() || isSetupResolutionPending()) {
        return [];
    }
    const evolutionCardSelected = Boolean(selectedCard?.evolvesFromId);
    if (isPlacementBudgetLockedForCard(selectedCard) || (countBoardSieglings() >= 5 && !evolutionCardSelected)) {
        return [];
    }

    if (!selectedCard || selectedCard.type !== 'SIEGLING') {
        return gameState.legalPlacements || [];
    }
    return getLegalPlacementsForCard(selectedCard);
}

function isSetupResolutionPending() {
    return gameState?.currentPhase === 'SETUP'
        && Boolean(window.SieglingsActionQueue?.isProcessing?.());
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
    if (window.ArenaTutorial?.shouldPreviewCard?.(card)) {
        openHandCardPreview(handIndex);
        return;
    }


    if (isMobileLayout() && handTouchSuppressHandIndex === handIndex && Date.now() < handTouchSuppressUntil) {
        handTouchSuppressHandIndex = null;
        handTouchSuppressUntil = 0;
        return;
    }

    mobileSpellPreviewPending = false;

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

    if (lockReason) {
        updateSelectedInfo(card, lockReason);
        // Mobile has no hover tooltip, so surface the card (and the reason it
        // can't be played) in the preview surface instead of failing silently.
        if (isMobileLayout() && isActionCard(card)) {
            if (usesLandscapeInspectorMenuDock()) {
                openLandscapeInspectorMenu('card');
            } else {
                openDrawer('selected');
            }
        }
        render();
        return;
    }

    if (isActionCard(card)) {
        // On mobile there is no hover preview, so a single tap used to fire the
        // spell (or jump straight into targeting) before the player could read
        // what it does. Show the card preview with an explicit confirm step;
        // the spell only activates once the player confirms.
        if (isMobileLayout()) {
            mobileSpellPreviewPending = true;
            updateSelectedInfo(card);
            if (usesLandscapeInspectorMenuDock()) {
                openLandscapeInspectorMenu('card');
                render();
                return;
            }
            openDrawer('selected');
            render();
            return;
        }
        activateActionCard(card);
        return;
    }

    updateSelectedInfo(card);
    render();
}

/**
 * Begin using a selected SPELL/TRAP: enter target selection if it needs one
 * (board highlights the valid targets), otherwise cast it immediately. Shared
 * by the desktop single-tap path and the mobile confirm button.
 */
function activateActionCard(card) {
    if (!card || isOpponentControlLocked()) {
        return;
    }
    const targetSide = getAbilityTargetSide(card.ability);
    if (targetSide) {
        if (needsForcedEnemyMoveFlow(card)) {
            targetMode = true;
            targetContext = {
                mode: 'spell-move-enemy',
                side: 'enemy',
                step: 'pickEnemy',
                cardId: card.id,
                message: `Select an enemy Siegeling to move, then an empty enemy cell.`
            };
            updateSelectedInfo(card, targetContext.message);
            render();
            return;
        }
        targetMode = true;
        targetContext = {
            mode: 'spell',
            side: targetSide,
            ability: card.ability,
            message: `Select a target for ${card.name}.`,
            callback: (row, col) => castSpell(card.id, row, col)
        };
        updateSelectedInfo(card, targetContext.message);
        render();
        return;
    }
    castSpell(card.id, -1, -1);
}

/** Mobile: confirm the previewed spell — cast it, or start target selection. */
function confirmMobileSpellPreview() {
    if (!mobileSpellPreviewPending) {
        return;
    }
    mobileSpellPreviewPending = false;
    const card = selectedCard;
    if (!card) {
        return;
    }
    // Drop the modal preview so the board (and its target highlights) are
    // visible and tappable for spells that still need a target.
    if (activeDrawer === 'selected') {
        closeDrawer(true);
    }
    activateActionCard(card);
}

/** Mobile: dismiss the spell preview without casting. */
function cancelMobileSpellPreview() {
    mobileSpellPreviewPending = false;
    selectedCard = null;
    selectedHandIndex = null;
    clearTargetMode();
    if (activeDrawer === 'selected') {
        closeDrawer(true);
    }
    updateSelectedInfo(null);
    render();
}

/** Human-readable hint describing who a spell targets, for the mobile preview. */
function describeSpellTargetSide(targetSide) {
    switch (targetSide) {
        case 'enemy':
            return 'Targets an enemy Siegeling — pick it after you confirm.';
        case 'ally':
            return 'Targets one of your Siegelings — pick it after you confirm.';
        case 'row-enemy':
            return 'Targets an enemy row — pick it after you confirm.';
        case 'row-ally':
            return 'Targets one of your rows — pick it after you confirm.';
        default:
            return 'No target needed — plays as soon as you confirm.';
    }
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
            renderMobileTargetingHud();
            syncMobileTargetingArenaScale();
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
            ability: trainer.active,
            message: `Select a target for ${trainer.active.name}.`,
            callback: (row, col) => useTrainer(row, col)
        };
        updateSelectedInfo(null, targetContext.message);
        render();
    } else {
        useTrainer(-1, -1);
    }
}

function renderBoardCardBuffsList(card) {
    if (!card) return '';
    const statuses = Array.isArray(card.statuses) ? card.statuses : [];
    const has = (s) => statuses.includes(s);
    const entries = [];

    const damageBoost = Number(card.damageBoost) || 0;
    if (damageBoost > 0) {
        entries.push({ kind: 'DAMAGE_BOOST', label: 'Damage', amount: damageBoost });
    } else if (has('DAMAGE_BOOST')) {
        entries.push({ kind: 'DAMAGE_BOOST', label: 'Damage Boost' });
    }

    const shield = Number(card.shieldHp) || 0;
    if (shield > 0) {
        entries.push({ kind: 'HEALTH_BOOST', label: 'Shield', amount: shield });
    } else if (has('HEALTH_BOOST') && !(Number(card.maxHp) > Number(card.printedHealth))) {
        entries.push({ kind: 'HEALTH_BOOST', label: 'Shield' });
    }

    const printedSpeed = Number(card.printedSpeed);
    const spd = Number(card.spd ?? card.speed);
    const speedDelta = Number.isFinite(printedSpeed) && Number.isFinite(spd) ? spd - printedSpeed : 0;
    if (speedDelta > 0) {
        entries.push({ kind: 'SPEED_BOOST', label: 'Speed', amount: speedDelta });
    } else if (has('SPEED_BOOST') && speedDelta === 0) {
        entries.push({ kind: 'SPEED_BOOST', label: 'Speed Boost' });
    }

    const printedHp = Number(card.printedHealth);
    const maxHp = Number(card.maxHp);
    if (Number.isFinite(printedHp) && Number.isFinite(maxHp) && maxHp > printedHp) {
        // MAX_HEALTH, not HEALTH_BOOST: this is the permanent max-HP raise, and
        // the pill has to match the green heart badge the board card shows.
        entries.push({ kind: 'MAX_HEALTH', label: 'Max HP', amount: maxHp - printedHp });
    }

    if (has('FREEZE')) entries.push({ kind: 'FREEZE', label: 'Frozen' });
    if (has('SPEED_ZERO')) entries.push({ kind: 'SPEED_ZERO', label: 'Stunned' });
    if (has('WEAK')) entries.push({ kind: 'WEAK', label: 'Weak' });
    if (has('STRONG')) entries.push({ kind: 'STRONG', label: 'Strong' });

    const afflictions = Array.isArray(card.afflictions) ? card.afflictions : [];
    afflictions.forEach((row) => {
        const kind = String(row?.kind || '').toUpperCase();
        const stacks = Number(row?.stacks) || 0;
        if (!kind || stacks <= 0) return;
        const shortLabel = kind.charAt(0) + kind.slice(1).toLowerCase();
        entries.push({
            kind,
            label: shortLabel,
            amount: stacks,
            stackMode: true
        });
    });

    if (entries.length === 0) return '';
    const items = entries.map((e) => {
        const color = STATUS_BADGE_PALETTE[e.kind] || '#cbd5f5';
        const amount = (typeof e.amount === 'number' && e.amount > 0)
            ? `<span class="buff-pill-amount">${e.stackMode ? e.amount : `+${e.amount}`}</span>`
            : '';
        const title = `${STATUS_BADGE_LABEL[e.kind] || e.label} — tap for details`;
        return `<button type="button" class="buff-pill" style="--bp:${color}" title="${escapeHtmlAttribute(title)}"`
            + ` onclick="openEffectKey('${escapeHtmlAttribute(e.kind)}', event)">`
            + `<span class="buff-pill-icon" aria-hidden="true">${STATUS_BADGE_SVG[e.kind] || STATUS_BADGE_SVG_GENERIC}</span>`
            + `<span class="buff-pill-label">${escapeHtml(e.label)}</span>${amount}</button>`;
    }).join('');
    return `<div class="selected-copy-buffs" aria-label="Active buffs and debuffs">${items}`
        + `<button type="button" class="buff-pill buff-pill-all" title="Open the full status effect key"`
        + ` onclick="openAllEffectsKey(event)"><span class="buff-pill-label">All Effects</span></button>`
        + `</div>`;
}

function updateSelectedInfo(card, msg) {
    const el = document.getElementById('selectedCardInfo');
    // game.js is also loaded by the hub, which has no battle table: the global
    // Escape handler reaches this with nothing to write into.
    if (!el) return;
    if (!card && !msg) {
        el.innerHTML = 'Select a hand card or click a Siegeling on either board to preview it here.';
        syncSelectedPreviewDrawerTitle(0);
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
        const spellConfirm = mobileSpellPreviewPending && isActionCard(card) && !lockReason
            ? renderSpellPreviewConfirmation(card)
            : '';
        // Two swipe pages: summary (card art + copy) and battle-action moves.
        // Spell confirm stays on page 1 so the cast buttons never hide behind a swipe.
        let summary = `<div class="selected-card-panel">`;
        summary += renderShowcaseCard(card, {
            cardClass: 'selected-preview-card',
            artVariant: 'selected'
        });
        summary += `<div class="selected-preview-copy">`;
        if (lockReason) {
            summary += `<span style="color:var(--accent)">${escapeHtml(lockReason)}</span>`;
        } else if (isBoardPreviewCard(card)) {
            const own = boardCardOwnershipLabel(card);
            const phases = Number(card.battlePhasesSeen || 0);
            summary += `<span style="color:var(--accent)">${escapeHtml(own)} Siegeling — ${card.hp}/${card.maxHp} HP · Speed ${card.spd ?? card.speed ?? '?'} · ${phases} battle phase(s).</span>`;
            summary += renderBoardCardBuffsList(card);
            summary += renderPreviewClaimControl(card);
        } else if (card.type === 'SIEGLING') {
            summary += card.evolvesFromName
                ? `<span style="color:var(--accent)">After ${card.evolvesFromName} completes a full battle phase in that form, place this on it to evolve.</span>`
                : gameState.playerPlacementUsed
                ? `<span style="color:var(--accent)">${escapeHtml(sieglingPlacementLockMessage())}</span>`
                : '<span style="color:var(--accent)">Highlighted bubbles show where this card can expand next.</span>';
        }
        // Stat line and ability/move details in the right panel (body hidden inside compact card).
        const statLine = getCardSummaryStatLine(card);
        if (statLine) {
            summary += `<div class="selected-copy-stats">${escapeHtml(statLine)}</div>`;
        }
        getCardPreviewEntries(card).forEach(entry => {
            if (entry.html) {
                summary += `<div class="selected-copy-detail">${entry.html}</div>`;
            } else {
                summary += `<div class="selected-copy-detail${entry.className === 'card-cost' ? ' selected-copy-cost' : ''}">${escapeHtml(entry.text)}</div>`;
            }
        });
        summary += spellConfirm;
        summary += `</div></div>`;

        html += `<div class="selected-preview-pager" data-selected-preview-pager data-active-page="0">`;
        html += `<div class="selected-preview-pages" data-selected-preview-pages role="region" aria-label="Card preview pages">`;
        html += `<section class="selected-preview-page" data-selected-preview-page="summary" aria-label="Card summary">${summary}</section>`;
        html += `<section class="selected-preview-page" data-selected-preview-page="moves" aria-label="Battle moves">${renderSelectedPreviewMovesPage(card)}</section>`;
        html += `</div>`;
        html += `<div class="selected-preview-pager-chrome">`;
        html += `<div class="selected-preview-dots" role="tablist" aria-label="Preview pages">`;
        html += `<button type="button" class="selected-preview-dot is-active" data-page-dot="0" role="tab" aria-selected="true" aria-label="Card summary"></button>`;
        html += `<button type="button" class="selected-preview-dot" data-page-dot="1" role="tab" aria-selected="false" aria-label="Battle moves"></button>`;
        html += `</div>`;
        html += `<span class="selected-preview-swipe-hint">Swipe down to close · swipe for moves</span>`;
        html += `</div></div>`;
    }

    el.innerHTML = html;
    bindSelectedPreviewPager(el);
    scheduleFramedSummaryFit();
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

// Locate the previewed Siegeling on the player's board so the card preview can
// surface a Claim control. Returns the {row, col} only when the cell is one of
// our own battle-tested Siegelings eligible to claim this setup turn.
function getClaimablePreviewPosition(card) {
    if (!card?.instanceId || !Array.isArray(gameState?.playerBoard)) {
        return null;
    }
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            const cell = gameState.playerBoard?.[row]?.[col];
            if (cell && cell.instanceId === card.instanceId && isClaimableBoardCell(cell, true)) {
                return { row, col };
            }
        }
    }
    return null;
}

// Claimable badge + Claim button shown inside the card preview. The button
// opens the existing claim popup, which carries the second-step confirmation.
function renderPreviewClaimControl(card) {
    const pos = getClaimablePreviewPosition(card);
    if (!pos) {
        return '';
    }
    const elementLabel = card.element ? formatElementLabel(card.element) : 'its element';
    const name = card.name || 'Siegeling';
    let html = '<div class="selected-claim-control">';
    html += `<div class="selected-claim-note"><span class="selected-claim-badge">Claimable</span>Battle-tested — claim it to gain 1 temporary ${escapeHtml(elementLabel)} energy this setup turn.</div>`;
    html += `<button type="button" class="selected-claim-btn" onclick="openClaimPopup(${pos.row}, ${pos.col})" aria-label="Claim ${escapeHtmlAttribute(name)}">`;
    html += '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.4 1.2v13.6M3.4 2.2h8.7L10.4 5.4l1.7 3.2H3.4"/></svg>';
    html += `<span>Claim ${escapeHtml(name)}</span></button>`;
    html += '</div>';
    return html;
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
    if (cardDragSession?.active) {
        stopHandSelectorAutoScroll();
        return;
    }
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

    if (cardDragSession?.active) {
        layer.classList.remove('hidden');
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
        case 'POISON': return 'var(--poison)';
        case 'LIGHT': return 'var(--light)';
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
        if (cardDragSession) {
            cleanupCardDragSession();
            return;
        }
        if (isBattleTargetSelectionActive()) {
            cancelBattleTargetSelection();
            return;
        }
        // The effect key sits on top of the card preview — one Escape should
        // dismiss it without also clearing the selection behind it.
        const effectKeyOverlay = document.getElementById('effectKeyOverlay');
        if (effectKeyOverlay && !effectKeyOverlay.classList.contains('hidden')) {
            closeEffectKey();
            return;
        }
        closeDrawer(true);
        closeMobileHudSheet();
        closeClaimPopup();
        closeTrainerAbilityPopup();
        closeMatchDetail();
        selectedCard = null;
        selectedHandIndex = null;
        clearTargetMode();
        updateSelectedInfo(null);
        render();
    }
});

window.addEventListener('resize', () => {
    syncLandscapeSafeAreaSide();
    updateResponsiveLayoutVars(true);
    scheduleDesktopHandSelectorCardScale();
    scheduleDesktopPreviewCardScale();
    stopHandSelectorAutoScroll();
    hoveredBoardCard = null;
    syncMobileInfoTab();
    syncMobileHudSheetSide();
    syncFocusedCardUi();
    syncMobileTargetingArenaScale();
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
    syncMobileTargetingArenaScale();
    scheduleBoardLinkConnectorRefresh();
});

window.addEventListener('orientationchange', () => {
    setTimeout(syncLandscapeSafeAreaSide, 0);
    updateResponsiveLayoutVars(true);
    scheduleDesktopHandSelectorCardScale();
    scheduleDesktopPreviewCardScale();
    syncFocusedCardUi();
    syncMobileHudSheetSide();
    renderDesktopDeckPreview();
    updateHandLiftLayer();
    syncMobileTargetingArenaScale();
    scheduleBoardLinkConnectorRefresh();
});

syncLandscapeSafeAreaSide();
updateResponsiveLayoutVars(true);
syncDesktopInspectTabUi();

(function setupLandscapeEnergyDetailRedirect() {
    const details = document.getElementById('energyDetailDetails');
    if (!details) {
        return;
    }
    details.addEventListener('toggle', () => {
        if (!details.open || !usesLandscapeInspectorMenuDock()) {
            return;
        }
        details.open = false;
        openLandscapeInspectorMenu('energy');
    });
})();

(function setupBoardGridLayoutObservers() {
    const onLayoutModeBoundsChange = () => {
        scheduleBoardLinkConnectorRefresh();
        setTimeout(scheduleBoardLinkConnectorRefresh, 200);
        if (gameState) updateSafeAreaHpStrip(gameState);
    };

    const connect = () => {
        const playerGrid = document.getElementById('playerGrid');
        const enemyGrid = document.getElementById('enemyGrid');
        if (!playerGrid || !enemyGrid || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => scheduleBoardLinkConnectorRefresh());
        ro.observe(playerGrid);
        ro.observe(enemyGrid);

        // Re-fit the hand cards whenever the dock that holds them changes height
        // (board/history layout settling, safe-area changes, orientation). Without
        // this the cards keep a stale size and leave a gap above the action bar.
        const handSection = document.getElementById('desktopHandSection');
        if (handSection) {
            const handRo = new ResizeObserver(() => scheduleDesktopHandSelectorCardScale());
            handRo.observe(handSection);
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', connect);
    } else {
        connect();
    }

    const mqListeners = [
        window.matchMedia('(max-width: 767px)'),
        window.matchMedia('(max-width: 900px)'),
        window.matchMedia('(min-width: 980px)'),
        window.matchMedia('(orientation: landscape) and (max-height: 600px)'),
        window.matchMedia('(orientation: landscape) and (min-width: 980px) and (max-width: 1366px) and (max-height: 1100px)')
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

(function setupCardDragPointerListeners() {
    document.addEventListener('pointermove', handleCardDragPointerMove, { passive: false });
    document.addEventListener('pointerup', handleCardDragPointerEnd);
    document.addEventListener('pointercancel', handleCardDragPointerCancel);
})();

// Drag-to-close for every slide-up drawer tray (Card Preview, Element Key, Hints, Log, Battle).
(function setupDrawerDragToClose() {
    const CLOSE_DISTANCE_PX = 90;
    const CLOSE_VELOCITY = 0.6; // px per ms (a quick flick down)
    const START_SLOP_PX = 6;
    let session = null;

    function onPointerDown(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const target = event.target;
        if (!target || !target.closest) return;
        const drawer = target.closest('.drawer.visible');
        if (!drawer) return;
        // Horizontal card-preview pager owns left/right swipes — don't steal
        // those gestures for the vertical drag-to-close.
        if (target.closest('[data-selected-preview-pages]')) return;
        // Start a drag from the grip/header always; from scrollable content only when at the top.
        const fromGrip = !!target.closest('.drawer-handle, .drawer > h3');
        if (!fromGrip && drawer.scrollTop > 0) return;
        session = {
            drawer,
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            lastT: performance.now(),
            velocity: 0,
            dragging: false,
            fromGrip
        };
    }

    function onPointerMove(event) {
        if (!session || event.pointerId !== session.pointerId) return;
        const dy = event.clientY - session.startY;
        if (!session.dragging) {
            // Let upward / content scrolling proceed natively.
            if (dy <= START_SLOP_PX) {
                if (!session.fromGrip && dy < 0) session = null;
                return;
            }
            session.dragging = true;
            session.drawer.classList.add('drawer-dragging');
        }
        const now = performance.now();
        const dt = now - session.lastT;
        if (dt > 0) session.velocity = (event.clientY - session.lastY) / dt;
        session.lastY = event.clientY;
        session.lastT = now;
        session.drawer.style.transform = `translateY(${Math.max(0, dy)}px)`;
        if (event.cancelable) event.preventDefault();
    }

    function finish(event) {
        if (!session || (event && event.pointerId !== session.pointerId)) return;
        const { drawer, dragging, velocity, startY, lastY } = session;
        const travelled = lastY - startY;
        const shouldClose = dragging && (travelled > CLOSE_DISTANCE_PX || velocity > CLOSE_VELOCITY);
        drawer.classList.remove('drawer-dragging');
        drawer.style.transform = '';
        session = null;
        if (shouldClose) {
            closeDrawer();
        }
    }

    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
})();

function renderBattleGameToText() {
    if (!gameState) return JSON.stringify({ mode: 'not-started' });
    const summarizeBoard = (board) => (board || []).map((row, rowIndex) =>
        (row || []).map((cell, colIndex) => cell ? {
            row: rowIndex,
            col: colIndex,
            id: cell.id,
            name: cell.name,
            health: cell.currentHealth ?? cell.health,
            speed: cell.currentSpeed ?? cell.speed
        } : null)
    );
    return JSON.stringify({
        mode: 'battle',
        coordinates: '3x3 boards; row 0 is back, row 2 is front, columns increase left-to-right',
        phase: gameState.currentPhase,
        turn: gameState.turnNumber,
        activeSide: gameState.activeSide,
        presentation: {
            phaseBannerActive: !document.getElementById('phaseTransitionBanner')?.classList.contains('hidden'),
            battleCursor: Number(gameState.battleCursor || 0),
            battleOrder: (gameState.battleQueue || []).map((entry) => ({
                name: entry?.name,
                speed: entry?.speed,
                ownerSide: entry?.ownerSide,
                ownerLabel: entry?.ownerLabel
            }))
        },
        player: {
            health: gameState.player?.health,
            energy: getPlayerTotalSpendableEnergy(),
            callWells: gameState.playerCallWells || {},
            board: summarizeBoard(gameState.playerBoard)
        },
        enemy: {
            health: gameState.enemy?.health,
            callWells: gameState.enemyCallWells || {},
            board: summarizeBoard(gameState.enemyBoard)
        }
    });
}

window.render_game_to_text = renderBattleGameToText;
window.advanceTime = function () {
    refreshBoardLinkConnectors();
    return renderBattleGameToText();
};

// The animation queue resolves after the API response has already replaced
// gameState and rendered the board. Give it a live, read-only route back to the
// authoritative cell so shield application playback cannot mistake a missing
// bridge for zero shield and remove a freshly-rendered badge.
window.SieglingsBoardCellState = {
    getCell(isPlayer, row, col) {
        const board = isPlayer ? gameState?.playerBoard : gameState?.enemyBoard;
        return board?.[Number(row)]?.[Number(col)] || null;
    }
};

// Spells, traps and trainer actives never sit on the board, so the playback
// queue cannot read their element off a cell the way it does for a Siegling's
// ability — it only has the name the server logged. Expose a name → element
// lookup over the loaded catalog so effect damage still lights the right
// elemental border. Keyed by card name *and* ability name, because the damage
// line names the ability while the cast/spring line names the card.
window.SieglingsCardElements = (() => {
    let cachedCatalog = null;
    let index = null;
    const rebuild = (catalog) => {
        const map = new Map();
        for (const card of catalog) {
            const element = String(card?.element || '').toUpperCase();
            if (!element) continue;
            const cardName = String(card?.name || '').trim().toLowerCase();
            const abilityName = String(card?.ability?.name || '').trim().toLowerCase();
            // Card name wins: an ability name can be shared across cards.
            if (abilityName && !map.has(abilityName)) map.set(abilityName, element);
            if (cardName) map.set(cardName, element);
        }
        return map;
    };
    return {
        elementFor(name) {
            const want = String(name == null ? '' : name).trim().toLowerCase();
            if (!want) return null;
            const catalog = Array.isArray(gameOptions?.cardCatalog) ? gameOptions.cardCatalog : [];
            if (!catalog.length) return null;
            if (catalog !== cachedCatalog) {
                cachedCatalog = catalog;
                index = rebuild(catalog);
            }
            return index.get(want) || null;
        }
    };
})();

window.SieglingsCardShowcase = {
    renderShowcaseCard,
    scheduleFramedSummaryFit,
    fitFramedSummaryText,
    scheduleSiegeKnightCardFit,
    fitSiegeKnightCardText,
    cardFrameClass,
    hasElementFrame
};

if (document.getElementById('loadoutOverlay')) {
    renderDesktopMenuMeta();
    renderDesktopActionHistory();
    renderWelcomeTutorial();
    bindAuthStorageSync();
    renderWelcomeAuth();
    void syncAuthProfile(true);
    syncEntryOverlays();
    if (typeof SieglingsCatalogSync !== 'undefined') {
        SieglingsCatalogSync.onCatalogPublished(() => {
            refreshLiveGameOptions();
        });
    }
    loadGameOptions();
}
