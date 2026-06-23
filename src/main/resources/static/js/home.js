(function () {
    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    // Last authenticated profile, cached in localStorage and shared with the Play
    // page so the signed-in UI paints instantly and then revalidates against
    // /api/auth/me in the background instead of blocking on it.
    const AUTH_PROFILE_CACHE_KEY = 'sieglingsAuthProfile';
    const AUTH_PROFILE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    // Sentinel stored under AUTH_TOKEN_KEY once auth has moved to the httpOnly
    // session cookie. Not a credential (the real token rides in the cookie the
    // browser sends automatically) but it still drives every "signed in?" check and
    // cross-tab storage-event sync exactly as a real token used to.
    const COOKIE_SESSION_VALUE = 'cookie';
    // True when the readable, secret-free `sgl_auth` companion cookie is present —
    // signals a live session AND proves cookies round-trip in this environment.
    function hasReadableAuthCookie() {
        try {
            return document.cookie.split('; ').some((c) => c.startsWith('sgl_auth='));
        } catch (e) {
            return false;
        }
    }
    // Only a real legacy Bearer token (not the cookie sentinel) is sent as a header.
    function isLegacyBearerToken(token) {
        return Boolean(token) && token !== COOKIE_SESSION_VALUE;
    }
    // True when running as an installed standalone Web App (iOS "Add to Home Screen"
    // / Android PWA). iOS standalone Web Apps don't reliably send the session cookie
    // across the full-page navigations this multi-page app uses (Home <-> Play), so
    // there we keep authenticating with the localStorage Bearer token (which does
    // persist across those navigations) rather than the cookie-only path.
    function isStandalonePWA() {
        try {
            return window.navigator.standalone === true
                || Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        } catch (e) {
            return false;
        }
    }
    // On login, store the cookie sentinel only when cookies are confirmed working AND
    // we're not a standalone Web App; otherwise keep the real token for Bearer auth.
    function preferredStoredToken(loginToken) {
        return (hasReadableAuthCookie() && !isStandalonePWA()) ? COOKIE_SESSION_VALUE : (loginToken || '');
    }
    const PROFILE_PREFS_CACHE_KEY = 'sieglingsProfilePrefsCache';
    const PENDING_LOADOUT_KEY = 'sieglingsPendingLoadout';
    // Bulk pack buy: 10 pulls at a 5% discount. Mirrors PlayerProgressionService.
    const BULK_PACK_COUNT = 10;
    const BULK_PACK_DISCOUNT = 0.05;
    function bulkPackCost(unitPrice, count) {
        const gross = (Number(unitPrice) || 0) * Math.max(1, count);
        return count <= 1 ? gross : Math.round(gross * (1 - BULK_PACK_DISCOUNT));
    }
    const HUB_CACHE_PREFIX = 'sieglingsHomeCache:';
    // Static data (card catalog, packs, descriptions) rarely changes, so keep it
    // cached for a full day. It lives in localStorage (see hubCacheStorage) so it
    // persists across tabs and app relaunches — every hub visit renders instantly
    // from cache, and the cheap /api/game/catalog-version check revalidates it in
    // the background, re-downloading the full catalog only when it actually moved.
    const STATIC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    // Leaderboards change as matches finish today, so cache them briefly rather
    // than reusing the same snapshot for the full static TTL.
    const LEADERBOARD_CACHE_TTL_MS = 60 * 1000;
    const ROOM_CACHE_TTL_MS = 20 * 1000;
    const HOST_LOBBY_KEY = 'sieglingsHostLobby';
    const LOBBY_SESSION_KEY = 'sieglingsLobbySession';
    const MULTIPLAYER_SESSION_KEY = 'sieglingsMultiplayerSession';
    const LOBBY_POLL_MS = 2000;
    const PLAYER_NAME_KEY = 'sieglingsPlayerName';
    const SOCIAL_POLL_MS = 6 * 1000;
    const PRESENCE_HEARTBEAT_MS = 45 * 1000;
    const PENDING_PACK_OPEN_REQUEST_KEY = 'sieglingsPendingPackOpenRequest';
    const PACK_OPEN_TIMEOUT_MS = 15000;
    const COIN_ICON_PATH = '/img/ui/home-stats/siegecoin.png';
    const SIEGEKNIGHT_CARD_BACK = '/img/knights/card-back-siegeknight.png';
    const PACK_CARD_BACK_VERSION = 2;

    function versionedPackAsset(path) {
        if (!path) return '';
        const separator = path.includes('?') ? '&' : '?';
        return `${path}${separator}v=${PACK_CARD_BACK_VERSION}`;
    }
    const HERO_STAT_ICONS = {
        coins: COIN_ICON_PATH,
        remnants: '/img/ui/home-stats/remnants.png',
        collection: '/img/ui/home-stats/collection.png',
        cards: '/img/ui/home-stats/cards.png',
        decks: '/img/ui/home-stats/decks.png'
    };
    const memoryCache = {};
    const ELEMENT_COLORS = {
        FIRE: '#f05b2f', EARTH: '#a7773d', WIND: '#64c987', WATER: '#3c8ed8', ICE: '#7ad9e7',
        SHADOW: '#6d4a9e', ELECTRIC: '#f5cf3d', METAL: '#aeb5b8', UNDEAD: '#9f7c73', PSYCHIC: '#db73b4',
        POISON: '#7ecb4d', LIGHT: '#ffe59a',
        NEUTRAL: '#95a5a6'
    };
    const ELEMENT_ICON_PATHS = {
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
        LIGHT: '/img/elements/element-light.svg',
        NEUTRAL: '/img/elements/element-neutral.svg'
    };
    const NOTCH_ICON_PATHS = {
        FIRE: '/img/notches/notch-fire.png',
        EARTH: '/img/notches/notch-earth.png',
        WIND: '/img/notches/notch-wind.png',
        ICE: '/img/notches/notch-ice.png',
        SHADOW: '/img/notches/notch-shadow.png'
    };
    const ENERGY_COST_FILTERS = ['ALL', 'FREE', '1', '2', '3', '4', '5+'];
    const NOTCH_DIRECTIONS = ['TOP_LEFT', 'TOP', 'TOP_RIGHT', 'LEFT', 'RIGHT', 'BOTTOM_LEFT', 'BOTTOM', 'BOTTOM_RIGHT'];
    const DECK_ASSET_KEYS = ['FIRE', 'EARTH', 'WIND', 'WATER', 'ICE'];
    const DECK_ASSET_PATHS = {
        FIRE: { back: '/img/decks/card-back-fire.png', icon: '/img/decks/deck-icon-fire.png' },
        EARTH: { back: '/img/decks/card-back-earth.png', icon: '/img/decks/deck-icon-earth.png' },
        WIND: { back: '/img/decks/card-back-wind.png', icon: '/img/decks/deck-icon-wind.png' },
        WATER: { back: '/img/decks/card-back-wind.png', icon: '/img/decks/deck-icon-wind.png' },
        ICE: { back: '/img/decks/card-back-ice.png', icon: '/img/decks/deck-icon-ice.png' }
    };
    const RARITY_ORDER = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 };
    const REMNANT_CRAFT_COSTS = { COMMON: 500, UNCOMMON: 1000, RARE: 2000, EPIC: 4000, LEGENDARY: 8000 };
    const DUPLICATE_REMNANT_PREVIEW = { COMMON: 100, UNCOMMON: 200, RARE: 400, EPIC: 800, LEGENDARY: 1600 };
    const RARITY_COLORS = {
        COMMON: '#b8c0cc',
        UNCOMMON: '#64c987',
        RARE: '#76e6ff',
        EPIC: '#c084fc',
        LEGENDARY: '#ffd54a'
    };
    const PROFILE_ELEMENTS = ['Fire', 'Ice', 'Wind', 'Earth', 'Neutral'];
    // Premade card backs players can choose from in their profile.
    const PROFILE_CARD_BACKS = [
        { name: 'Molten Sigil', element: 'Fire' },
        { name: 'Frost Sigil', element: 'Ice' },
        { name: 'Gale Sigil', element: 'Wind' },
        { name: 'Stone Sigil', element: 'Earth' }
    ];
    const elementThemes = {
        Fire: {
            accent: '#ff6a2a',
            glow: 'rgba(255, 106, 42, 0.34)',
            gradient: 'linear-gradient(135deg, rgba(74, 10, 20, 0.42), rgba(157, 41, 17, 0.32) 52%, rgba(255, 128, 30, 0.16))',
            border: 'rgba(255, 126, 56, 0.55)',
            badge: 'linear-gradient(135deg, #ff8a2a, #f43f1c)',
            mood: 'Blazing Core Duelist',
            motif: 'Ember Covenant'
        },
        Ice: {
            accent: '#7ad9e7',
            glow: 'rgba(122, 217, 231, 0.32)',
            gradient: 'linear-gradient(135deg, rgba(10, 24, 54, 0.42), rgba(23, 78, 129, 0.32) 54%, rgba(155, 231, 255, 0.15))',
            border: 'rgba(146, 232, 255, 0.55)',
            badge: 'linear-gradient(135deg, #b8f3ff, #3c8ed8)',
            mood: 'Frostglass Tactician',
            motif: 'Crystal Wake'
        },
        Wind: {
            accent: '#64c987',
            glow: 'rgba(100, 201, 135, 0.31)',
            gradient: 'linear-gradient(135deg, rgba(6, 45, 45, 0.42), rgba(17, 120, 92, 0.3) 55%, rgba(150, 255, 180, 0.14))',
            border: 'rgba(132, 236, 170, 0.52)',
            badge: 'linear-gradient(135deg, #96ffb4, #19a974)',
            mood: 'Gale-Thread Strategist',
            motif: 'Spiral Canopy'
        },
        Earth: {
            accent: '#d0a65f',
            glow: 'rgba(208, 166, 95, 0.29)',
            gradient: 'linear-gradient(135deg, rgba(22, 41, 25, 0.42), rgba(82, 67, 35, 0.32) 55%, rgba(199, 160, 89, 0.15))',
            border: 'rgba(208, 166, 95, 0.55)',
            badge: 'linear-gradient(135deg, #d0a65f, #537a3a)',
            mood: 'Mossgold Sentinel',
            motif: 'Rootbound Reliquary'
        },
        Neutral: {
            accent: '#b8c0cc',
            glow: 'rgba(184, 192, 204, 0.25)',
            gradient: 'linear-gradient(135deg, rgba(12, 17, 28, 0.42), rgba(48, 56, 72, 0.32) 55%, rgba(218, 226, 238, 0.13))',
            border: 'rgba(210, 218, 230, 0.45)',
            badge: 'linear-gradient(135deg, #d8dee8, #5f6b7a)',
            mood: 'Astral Core Adept',
            motif: 'Silver Nexus'
        }
    };

    function loadCachedAuthProfile() {
        try {
            const raw = localStorage.getItem(AUTH_PROFILE_CACHE_KEY);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (!entry?.profile?.authenticated) return null;
            if (entry.savedAt && Date.now() - entry.savedAt > AUTH_PROFILE_CACHE_MAX_AGE_MS) return null;
            return entry.profile;
        } catch (error) {
            return null;
        }
    }

    // Drop the heavy per-match game logs before caching. The /api/auth/me payload
    // embeds the full log of every recorded match, which can blow past the ~5MB
    // localStorage quota; the write then throws QuotaExceededError, gets swallowed,
    // and the cache never persists — which strands the Play page on the "Restoring
    // your account…" takeover (it reads this same cache). The hub never needs the
    // logs to render, so slim them out, and fall back to a minimal snapshot if even
    // the slimmed copy won't fit.
    function slimProfileForCache(profile) {
        if (!profile) return profile;
        // Never persist the bearer token: the httpOnly-cookie migration keeps the
        // credential out of page-script reach, but the login response body still
        // carries `token` for legacy clients — strip it so it can't leak into
        // localStorage via the cached profile.
        const { token, ...rest } = profile;
        if (!Array.isArray(rest.matchHistory)) return rest;
        return {
            ...rest,
            matchHistory: rest.matchHistory.map((entry) => {
                if (!entry || !('gameLog' in entry)) return entry;
                const { gameLog, ...e } = entry;
                return e;
            })
        };
    }

    function saveCachedAuthProfile(profile) {
        try {
            if (!profile?.authenticated) {
                localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
                return;
            }
            const savedAt = Date.now();
            const slim = slimProfileForCache(profile);
            try {
                localStorage.setItem(AUTH_PROFILE_CACHE_KEY, JSON.stringify({ savedAt, profile: slim }));
            } catch (quotaError) {
                const minimal = {
                    authenticated: true,
                    user: slim.user,
                    progression: slim.progression,
                    savedDecks: slim.savedDecks || [],
                    matchHistory: []
                };
                localStorage.setItem(AUTH_PROFILE_CACHE_KEY, JSON.stringify({ savedAt, profile: minimal }));
            }
        } catch (error) {
            // The profile cache is a render optimization only.
        }
    }

    function clearCachedAuthProfile() {
        try {
            localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
        } catch (error) {
            // ignore
        }
    }

    // Single source of truth for interpreting an /api/auth/me response. Sessions
    // must only ever be dropped on an AUTHORITATIVE answer — never on a transient
    // failure — so this returns one of three states the callers act on:
    //   'signed-in'  -> server confirmed a valid session
    //   'signed-out' -> server authoritatively reports no/expired session
    //   'unknown'    -> request failed (offline, timeout, abort, 5xx) or the body
    //                   was malformed; the session is NOT proven gone, so keep it.
    // The app's two fetch helpers signal failure differently (game.js returns null,
    // home.js returns an { error } object), so both shapes collapse to 'unknown'.
    // Only a clean, error-free { authenticated: <boolean> } is authoritative.
    function classifyAuthMe(data) {
        if (!data || data.error || typeof data.authenticated !== 'boolean') {
            return 'unknown';
        }
        return data.authenticated ? 'signed-in' : 'signed-out';
    }

    // Fall back to the cookie sentinel when an httpOnly session cookie exists but the
    // localStorage marker is missing, so a live cookie session is still recognized.
    const initialAuthToken = (localStorage.getItem(AUTH_TOKEN_KEY) || '')
        || (hasReadableAuthCookie() ? COOKIE_SESSION_VALUE : '');
    // Seed from the cached snapshot so the signed-in hub renders instantly; the
    // background syncProfile() on init revalidates and refreshes it.
    const cachedAuthProfile = initialAuthToken ? loadCachedAuthProfile() : null;
    const state = {
        route: 'home',
        token: initialAuthToken,
        profile: cachedAuthProfile,
        progression: cachedAuthProfile?.progression || null,
        // True once a profile sync has completed this session (success or not).
        // Until then, a signed-in player with no cached snapshot shows a loading
        // screen for cards/decks instead of a misleading empty binder.
        profileSynced: false,
        options: null,
        packs: [],
        dailyOffers: [],
        titleCatalog: [],
        creatureDescriptions: {},
        rooms: [],
        selectedCardId: null,
        search: '',
        elementFilter: 'ALL',
        typeFilter: 'ALL',
        rarityFilter: 'ALL',
        finishFilter: 'ALL',
        energyCostFilter: 'ALL',
        showUnowned: false,
        sort: 'owned-desc',
        roomSearch: '',
        roomFormatFilter: 'ALL',
        roomElementFilter: 'ALL',
        roomSort: 'newest',
        roomHideFull: false,
        friendSearch: '',
        builderCounts: {},
        builderPreviewCardId: null,
        editingSavedDeckId: '',
        builderSearch: '',
        builderElementFilter: 'ALL',
        builderTypeFilter: 'ALL',
        builderRarityFilter: 'ALL',
        builderSort: 'owned-desc',
        builderVisibleLimit: 0,
        builderRenderTimer: null,
        notifications: [],
        newCards: new Set(),
        newCardsSnapshot: null,
        loadingArt: [],
        friendRequestsOpen: false,
        friendMessage: '',
        friendMessageType: '',
        selectedDeckId: '',
        filterTrayOpen: false,
        cardTrayOpen: false,
        authOpen: false,
        authMode: 'login',
        authDraft: { email: '', password: '' },
        authRegisterStep: 'credentials',
        authLoading: false,
        registerDraft: { email: '', password: '' },
        profileEditOpen: false,
        activeAchievementId: '',
        profilePrefs: null,
        friendPresence: {},
        messageThreads: [],
        activeChatPeer: null,
        viewingProfile: null,
        socialPollTimer: null,
        presenceTimer: null,
        lobbyBusy: false,
        hostLobbyStatus: null,
        battleRedirectPending: false,
        loadoutRedirectPending: false,
        hostLobbyPollTimer: null,
        lobbyRoomId: '',
        lobbyStatus: null,
        lobbySession: null,
        lobbyPollTimer: null,
        lobbyBusy: false,
        packReveal: null,
        packOpeningPending: null,
        packOpeningDismissedKey: '',
        shopView: 'browse',
        shopPreviewCardId: '',
        shopCardPreviewOpen: false,
        catalogVersion: 0,
        catalogSyncBound: false,
        profileUserId: '',
        achievementCategory: '',
        leaderboardTab: 'wins',
        leaderboardPeriod: 'daily',
        dailyMissions: null,
        dailyMissionsError: '',
        showAllMissions: false,
        missionResetTimer: null
    };

    const LEADERBOARD_PERIODS = [
        ['daily', 'Daily'],
        ['weekly', 'Weekly'],
        ['monthly', 'Monthly'],
        ['year', 'Year'],
        ['allTime', 'All Time']
    ];

    let liveCatalogRefreshPromise = null;
    let gachaParticleField = null;

    function setHudMinimized(minimized) {
        document.body.classList.toggle('hud-minimized', minimized);
        document.getElementById('hudFab')?.classList.toggle('hidden', !minimized);
        localStorage.setItem('sieglingsHudMinimized', minimized ? '1' : '0');
    }

    function openFriendsModal() {
        document.getElementById('friendsModal')?.classList.remove('hidden');
        state.activeChatPeer = null;
        // Requests stay tucked behind the bell unless something is pending.
        state.friendRequestsOpen = (state.profile?.incomingFriendRequests || []).length > 0;
        document.getElementById('friendAddPop')?.classList.add('hidden');
        showFriendsChatView(false);
        renderFriends();
        renderFriendRequests();
        // Poll while the modal is open so presence and unread blinks stay
        // live even away from the Social route.
        if (state.profile?.authenticated) startSocialPolling();
    }

    function closeFriendsModal() {
        document.getElementById('friendsModal')?.classList.add('hidden');
        state.activeChatPeer = null;
        showFriendsChatView(false);
        if (!isSocialRoute()) stopSocialPolling();
    }

    // Swap the modal between the friends list and the full-screen chat. The
    // chat is only reachable through a friend's Message button.
    function showFriendsChatView(open) {
        document.getElementById('friendsListView')?.classList.toggle('hidden', open);
        document.getElementById('friendsChatView')?.classList.toggle('hidden', !open);
        if (open) document.getElementById('friendAddPop')?.classList.add('hidden');
        const title = document.getElementById('friendsPanelTitle');
        if (title) title.textContent = open ? 'Chat' : 'Friends';
    }

    function toggleFriendAddPop(force) {
        const pop = document.getElementById('friendAddPop');
        if (!pop) return;
        const open = typeof force === 'boolean' ? force : pop.classList.contains('hidden');
        pop.classList.toggle('hidden', !open);
        if (open) document.getElementById('friendEmailInput')?.focus();
    }

    // ── Per-friend unread chat tracking ─────────────────────────────────
    // The threads API flags a thread unread when its latest message came
    // from the peer; a locally stored "seen" timestamp clears the flag once
    // the chat has been opened.
    function chatSeenKey() {
        return `sieglingsChatSeen:${state.profile?.user?.email || 'anon'}`;
    }

    function readChatSeen() {
        try {
            return JSON.parse(localStorage.getItem(chatSeenKey()) || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    function markChatSeen(peerId) {
        if (!peerId) return;
        const seen = readChatSeen();
        seen[peerId] = new Date().toISOString();
        localStorage.setItem(chatSeenKey(), JSON.stringify(seen));
    }

    function friendHasUnread(email) {
        const thread = (state.messageThreads || []).find(t => t.peerId === email);
        if (!thread || !thread.unread || !thread.lastMessageAt) return false;
        const seenAt = readChatSeen()[email];
        // ISO-8601 timestamps compare correctly as strings.
        return !seenAt || String(thread.lastMessageAt) > String(seenAt);
    }

    // ── Notification center ─────────────────────────────────────────────
    // A client-side feed persisted per account. Entries are pushed directly
    // at event sites (pack opened, mission claimed) and derived by diffing
    // profile/progression snapshots on refresh (gold, titles, requests,
    // missions, match results, level).
    const NOTIF_LIMIT = 60;
    const NOTIF_TYPE_LABELS = {
        match: 'Match', mission: 'Missions', friend: 'Friends', gold: 'Rewards',
        pack: 'Packs', title: 'Titles', badge: 'Badges', rank: 'Rank', server: 'Server'
    };
    let notifSnapshot = null;
    let notifLoadedKey = '';

    function notifStorageKey() {
        return `sieglingsNotifs:${state.profile?.user?.email || 'anon'}`;
    }

    function loadNotifications() {
        notifLoadedKey = notifStorageKey();
        try {
            state.notifications = JSON.parse(localStorage.getItem(notifStorageKey()) || '[]');
        } catch (error) {
            state.notifications = [];
        }
        if (!Array.isArray(state.notifications)) state.notifications = [];
        renderNotifications();
    }

    function saveNotifications() {
        localStorage.setItem(notifStorageKey(), JSON.stringify(state.notifications.slice(0, NOTIF_LIMIT)));
    }

    function pushNotification(type, title, body = '') {
        state.notifications.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type, title, body, time: Date.now(), read: false
        });
        state.notifications = state.notifications.slice(0, NOTIF_LIMIT);
        saveNotifications();
        renderNotifications();
    }

    function clearNotifications() {
        state.notifications = [];
        saveNotifications();
        renderNotifications();
    }

    // ── New-card tags ────────────────────────────────────────────────────
    // Freshly acquired cards (pack pulls, crafts, daily buys) wear a "New" badge
    // in the binder until the player opens them. Tracked client-side per account
    // by diffing owned-card counts against a persisted snapshot, mirroring the
    // notification feed's diffing approach.
    let newCardsLoadedKey = '';

    function newCardsStorageKey() {
        return `sieglingsNewCards:${state.profile?.user?.email || 'anon'}`;
    }

    function loadNewCards() {
        newCardsLoadedKey = newCardsStorageKey();
        state.newCards = new Set();
        state.newCardsSnapshot = null;
        try {
            const raw = JSON.parse(localStorage.getItem(newCardsStorageKey()) || 'null');
            if (raw && typeof raw === 'object') {
                state.newCards = new Set(Array.isArray(raw.newIds) ? raw.newIds : []);
                state.newCardsSnapshot = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : null;
            }
        } catch (error) {
            state.newCards = new Set();
            state.newCardsSnapshot = null;
        }
    }

    function saveNewCards() {
        try {
            localStorage.setItem(newCardsStorageKey(), JSON.stringify({
                snapshot: state.newCardsSnapshot || {},
                newIds: Array.from(state.newCards || [])
            }));
        } catch (error) {
            // localStorage full/unavailable — badges still work for this session.
        }
    }

    // Diff the current owned-card counts against the last snapshot; any card whose
    // count went up is flagged "New". The very first run for an account on this
    // device just records the baseline, so an existing collection is never flagged
    // wholesale.
    function detectNewCards() {
        if (!state.profile?.authenticated) return;
        if (newCardsLoadedKey !== newCardsStorageKey()) loadNewCards();
        const owned = state.progression?.ownedCards || {};
        if (!state.newCardsSnapshot) {
            state.newCardsSnapshot = { ...owned };
            saveNewCards();
            return;
        }
        let changed = false;
        Object.keys(owned).forEach(id => {
            const prev = Number(state.newCardsSnapshot[id]) || 0;
            if ((Number(owned[id]) || 0) > prev && !state.newCards.has(id)) {
                state.newCards.add(id);
                changed = true;
            }
        });
        state.newCardsSnapshot = { ...owned };
        saveNewCards();
        if (changed) state._cardsRenderSig = '';
    }

    function isNewCard(id) {
        return Boolean(id && state.newCards && state.newCards.has(id));
    }

    function markCardViewed(id) {
        if (!isNewCard(id)) return;
        state.newCards.delete(id);
        saveNewCards();
        state._cardsRenderSig = '';
    }

    function renderNotifications() {
        const unread = (state.notifications || []).filter(n => !n.read).length;
        [document.getElementById('hudNotifBadge'), document.getElementById('hudFabBadge')].forEach(badge => {
            if (!badge) return;
            badge.textContent = unread > 9 ? '9+' : String(unread);
            badge.classList.toggle('hidden', !unread);
        });
        const list = document.getElementById('notifList');
        if (!list) return;
        list.innerHTML = (state.notifications || []).length
            ? state.notifications.map(n => `<div class="notif-row${n.read ? '' : ' is-unread'}">
                <div class="notif-row-head">
                    <span class="notif-type">${escapeHtml(NOTIF_TYPE_LABELS[n.type] || 'Update')}</span>
                    <time>${escapeHtml(formatDateTime(n.time))}</time>
                </div>
                <strong>${escapeHtml(n.title)}</strong>
                ${n.body ? `<p>${escapeHtml(n.body)}</p>` : ''}
            </div>`).join('')
            : '<div class="notif-empty">No notifications yet. Match results, rewards, invites, and unlocks will show up here.</div>';
    }

    function toggleNotifPanel(force) {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        const open = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !open);
        document.getElementById('hudNotifBtn')?.classList.toggle('active', open);
        if (!open) return;
        renderNotifications();
        // Opening the panel marks everything read; rows keep their unread
        // styling until the next open so the player can still spot what's new.
        if ((state.notifications || []).some(n => !n.read)) {
            state.notifications.forEach(n => { n.read = true; });
            saveNotifications();
            [document.getElementById('hudNotifBadge'), document.getElementById('hudFabBadge')].forEach(badge => badge?.classList.add('hidden'));
        }
    }

    function notifSnapshotFromState() {
        const prog = state.progression || {};
        const missions = state.dailyMissions?.missions || state.dailyMissions?.featured || [];
        return {
            gold: Number(prog.gold) || 0,
            titles: (prog.playerTitles || []).filter(t => t.unlocked).map(t => t.id),
            battleCount: (state.profile?.matchHistory || []).length,
            latestBattleAt: state.profile?.matchHistory?.[0]?.finishedAt || '',
            requests: (state.profile?.incomingFriendRequests || []).map(r => r.fromUserId || r.peerEmail),
            missionsDone: missions.filter(m => m.completed).map(m => m.id),
            level: Number(prog.level) || 0
        };
    }

    function detectNotifications() {
        if (!state.profile?.authenticated) {
            notifSnapshot = null;
            return;
        }
        const next = notifSnapshotFromState();
        const prev = notifSnapshot;
        notifSnapshot = next;
        if (!prev) return;
        if (next.gold > prev.gold) {
            pushNotification('gold', `+${next.gold - prev.gold} Siegecoins earned`, `Wallet: ${next.gold} Siegecoins`);
        }
        next.titles.filter(id => !prev.titles.includes(id)).forEach(id => {
            pushNotification('title', `Title earned: ${resolveTitleDisplayName(id)}`);
        });
        next.requests.filter(id => !prev.requests.includes(id)).forEach(id => {
            const req = (state.profile?.incomingFriendRequests || []).find(r => (r.fromUserId || r.peerEmail) === id);
            pushNotification('friend', `Friend request from ${req?.displayName || req?.peerEmail || 'a player'}`, 'Open Friends to accept or decline.');
        });
        const missions = state.dailyMissions?.missions || state.dailyMissions?.featured || [];
        next.missionsDone.filter(id => !prev.missionsDone.includes(id)).forEach(id => {
            const mission = missions.find(m => m.id === id);
            pushNotification('mission', `Mission complete: ${mission?.title || 'Daily mission'}`, mission?.reward ? `Claim ${mission.reward} Siegecoins from the Home tab.` : '');
        });
        if (next.battleCount > prev.battleCount || (next.latestBattleAt && prev.latestBattleAt && next.latestBattleAt !== prev.latestBattleAt)) {
            const row = (state.profile?.matchHistory || [])[0] || {};
            const won = String(row.result || '').toUpperCase().includes('WIN');
            pushNotification('match', `Match ${won ? 'won' : 'finished'}${row.opponentName ? ` vs ${row.opponentName}` : ''}`, 'See the full breakdown on your Profile.');
        }
        if (next.level > prev.level) {
            pushNotification('rank', `Level up! You reached level ${next.level}`);
        }
    }

    // ── Loading art, gallery, and custom backgrounds ─────────────────────
    // Art pieces come from /api/art/loading, which scans
    // static/img/art/loading for <id>-landscape.* / <id>-portrait.* pairs.
    const PAGE_ART_KEY = 'sieglingsPageArt';
    const PROFILE_ART_KEY = 'sieglingsProfileArt';
    const ART_CACHE_KEY = 'sieglingsLoadingArtCache';

    function prefersPortraitArt() {
        return Boolean(window.matchMedia?.('(orientation: portrait)').matches);
    }

    function artImageFor(piece, preferPortrait = prefersPortraitArt()) {
        if (!piece) return '';
        return preferPortrait
            ? (piece.portrait || piece.landscape || '')
            : (piece.landscape || piece.portrait || '');
    }

    function hydrateLoadingArtFromCache() {
        try {
            state.loadingArt = JSON.parse(localStorage.getItem(ART_CACHE_KEY) || '[]') || [];
        } catch (error) {
            state.loadingArt = [];
        }
        if (!Array.isArray(state.loadingArt)) state.loadingArt = [];
    }

    async function loadLoadingArt() {
        const data = await fetchJson('/api/art/loading');
        if (!data || data.error) return;
        state.loadingArt = Array.isArray(data.art) ? data.art : [];
        // Cache the list so the very next visit can paint a loading screen
        // before the network answers.
        localStorage.setItem(ART_CACHE_KEY, JSON.stringify(state.loadingArt));
        // Now that the catalog is known, resolve any account-saved background
        // ids that arrived before the art list did.
        applyProfileArtFromPrefs(state.profilePrefs);
    }

    function showLoadingArtScreen(label) {
        const screen = document.getElementById('loadingArtScreen');
        if (!screen || !state.loadingArt.length) return 0;
        const piece = state.loadingArt[Math.floor(Math.random() * state.loadingArt.length)];
        const url = artImageFor(piece);
        if (!url) return 0;
        screen.style.backgroundImage = `url("${url}")`;
        const labelEl = document.getElementById('loadingArtLabel');
        if (labelEl) labelEl.textContent = label || 'Loading...';
        const titleEl = document.getElementById('loadingArtTitle');
        if (titleEl) titleEl.textContent = piece.title || '';
        screen.classList.remove('hidden');
        screen.setAttribute('aria-hidden', 'false');
        return Date.now();
    }

    function hideLoadingArtScreen(shownAt) {
        const screen = document.getElementById('loadingArtScreen');
        if (!screen || screen.classList.contains('hidden')) return;
        // Hold the art on screen briefly so a fast load doesn't flash it.
        const wait = shownAt ? Math.max(0, 900 - (Date.now() - shownAt)) : 0;
        window.setTimeout(() => {
            screen.classList.add('hidden');
            screen.setAttribute('aria-hidden', 'true');
        }, wait);
    }

    function readStoredArt(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch (error) {
            return null;
        }
    }

    function applyCustomPageArt() {
        const art = readStoredArt(PAGE_ART_KEY);
        const url = art ? artImageFor(art) : '';
        document.documentElement.style.setProperty('--page-art', url ? `url("${url}")` : 'none');
        document.body.classList.toggle('has-custom-art', Boolean(url));
    }

    // Maps a background localStorage key to the profile-settings field that
    // persists the chosen art id to the account (so it follows the player across
    // browsers/devices).
    const ART_KEY_TO_FIELD = {
        [PAGE_ART_KEY]: 'pageArtId',
        [PROFILE_ART_KEY]: 'profileArtId'
    };

    function setStoredArt(key, pieceId) {
        const current = readStoredArt(key);
        let selectedId = '';
        if (current?.id === pieceId) {
            // Picking the active piece again toggles back to the default look.
            localStorage.removeItem(key);
        } else {
            const piece = (state.loadingArt || []).find(item => item.id === pieceId);
            if (!piece) return;
            localStorage.setItem(key, JSON.stringify(piece));
            selectedId = piece.id;
        }
        persistArtSelection(key, selectedId);
        applyCustomPageArt();
        renderOptions();
        if (state.route === 'profile') safeRender(renderProfile);
    }

    // Mirrors the working localStorage background selection onto the account so a
    // fresh browser can rehydrate it. Updates in-memory prefs immediately and
    // best-effort saves to the server (the localStorage copy keeps it usable even
    // if the request fails).
    function persistArtSelection(key, pieceId) {
        const field = ART_KEY_TO_FIELD[key];
        if (!field) return;
        const value = String(pieceId || '');
        if (state.profilePrefs) state.profilePrefs[field] = value;
        cacheProfilePrefs(state.profilePrefs);
        if (!state.profile?.authenticated) return;
        fetchJson('/api/profile/settings', { method: 'POST', body: JSON.stringify({ [field]: value }) })
            .then(data => {
                const serverPrefs = data && !data.error ? applyProfileSettingsFromServer(data.profileSettings) : null;
                if (serverPrefs) {
                    state.profilePrefs = { ...defaultProfilePrefs(state.profile?.user || {}), ...serverPrefs };
                    cacheProfilePrefs(state.profilePrefs);
                }
            })
            .catch(() => { /* localStorage keeps the selection usable offline */ });
    }

    // Rehydrates the page/profile background images from saved account prefs,
    // resolving the stored art ids against the loaded gallery. Called whenever
    // prefs load and again once the art catalog finishes loading.
    function applyProfileArtFromPrefs(prefs) {
        if (!prefs) return;
        syncArtKeyFromId(PAGE_ART_KEY, prefs.pageArtId);
        syncArtKeyFromId(PROFILE_ART_KEY, prefs.profileArtId);
        applyCustomPageArt();
        if (state.route === 'profile') safeRender(renderProfile);
    }

    function syncArtKeyFromId(key, pieceId) {
        const id = String(pieceId || '').trim();
        if (!id) {
            localStorage.removeItem(key);
            return;
        }
        const piece = (state.loadingArt || []).find(item => item.id === id);
        // If the catalog hasn't loaded yet we leave any existing copy in place;
        // loadLoadingArt() re-runs this once the pieces are available.
        if (piece) localStorage.setItem(key, JSON.stringify(piece));
    }

    function openArtLightbox(pieceId) {
        const piece = (state.loadingArt || []).find(item => item.id === pieceId);
        const url = artImageFor(piece);
        if (!url) return;
        const img = document.getElementById('artLightboxImg');
        const title = document.getElementById('artLightboxTitle');
        if (img) {
            img.src = url;
            img.alt = piece.title || 'Artwork';
        }
        if (title) title.textContent = piece.title || '';
        document.getElementById('artLightbox')?.classList.remove('hidden');
    }

    function closeArtLightbox() {
        document.getElementById('artLightbox')?.classList.add('hidden');
    }

    // ── New player onboarding tour ───────────────────────────────────────
    // A spotlight walkthrough of the HUD shown once per account after the
    // starter pack is chosen, ending with the tutorial match offer.
    const TOUR_STEPS = [
        { target: '.nav-tabs', title: 'Navigate your hub', text: 'Home, Play, Cards, Decks, Social, Profile, and Shop all live here. Tap a tab to switch pages.' },
        { target: '#playNowBtn', title: 'Play', text: 'Jump straight into a battle with your active loadout.' },
        { target: '#goldPill', title: 'Siegecoins', text: 'Earn coins from matches and daily missions, then spend them on card packs in the Shop.' },
        { target: '#friendsBtn', title: 'Friends & Chat', text: 'Add friends by email, accept invites, and message them from any page.' },
        { target: '#hudNotifBtn', title: 'Notifications', text: 'Match results, rewards, mission completions, and unlocks collect here.' },
        { target: '#optionsBtn', title: 'Settings', text: 'Game guides, the Art Gallery, profile sharing, and support live in Settings.' },
        { target: null, title: 'Ready for your first siege?', text: 'Play the tutorial match: place a Siegeling, use a Strategy and a Deception, destroy an enemy Siegeling, and fire your Knight ability. Win and you earn a second starter pack plus bonus Siegecoins.' }
    ];
    let tourStepIndex = -1;

    function tourStorageKey() {
        return `sieglingsTourDone:${state.profile?.user?.email || 'anon'}`;
    }

    function maybeStartOnboardingTour() {
        if (!state.profile?.authenticated || !state.progression?.starterChosen) return;
        // Players who have completed the tutorial match never see the tour
        // again — this flag is server-side, so it holds across devices and
        // cleared local storage (localStorage alone re-triggered the popup).
        if (state.progression?.tutorialCompleted) return;
        if (localStorage.getItem(tourStorageKey()) === '1') return;
        if (document.getElementById('tourOverlay')) return;
        startOnboardingTour();
    }

    function startOnboardingTour() {
        endOnboardingTour(false);
        const overlay = document.createElement('div');
        overlay.id = 'tourOverlay';
        overlay.className = 'tour-overlay';
        overlay.innerHTML = `
            <div class="tour-spotlight" id="tourSpotlight"></div>
            <div class="tour-bubble" id="tourBubble">
                <strong id="tourTitle"></strong>
                <p id="tourText"></p>
                <div class="tour-actions">
                    <button class="ghost-btn compact-btn" type="button" id="tourSkipBtn">Skip</button>
                    <span class="tour-count" id="tourCount"></span>
                    <button class="primary-btn compact-btn" type="button" id="tourNextBtn">Next</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('tourSkipBtn')?.addEventListener('click', () => endOnboardingTour(true));
        tourStepIndex = -1;
        advanceOnboardingTour();
    }

    function advanceOnboardingTour() {
        tourStepIndex += 1;
        const step = TOUR_STEPS[tourStepIndex];
        if (!step) return endOnboardingTour(true);
        const overlay = document.getElementById('tourOverlay');
        const spotlight = document.getElementById('tourSpotlight');
        const bubble = document.getElementById('tourBubble');
        if (!overlay || !spotlight || !bubble) return;
        const titleEl = document.getElementById('tourTitle');
        const textEl = document.getElementById('tourText');
        if (titleEl) titleEl.textContent = step.title;
        if (textEl) textEl.textContent = step.text;
        const countEl = document.getElementById('tourCount');
        if (countEl) countEl.textContent = `${tourStepIndex + 1} / ${TOUR_STEPS.length}`;
        const nextBtn = document.getElementById('tourNextBtn');
        const finalStep = tourStepIndex === TOUR_STEPS.length - 1;
        const target = step.target ? document.querySelector(step.target) : null;
        const visibleTarget = target && !target.classList.contains('hidden') && target.getBoundingClientRect().width > 0 ? target : null;
        if (finalStep) {
            if (nextBtn) nextBtn.textContent = state.progression?.tutorialCompleted ? 'Finish' : 'Play Tutorial Match';
        } else if (nextBtn) {
            nextBtn.textContent = 'Next';
        }
        if (visibleTarget) {
            const rect = visibleTarget.getBoundingClientRect();
            const pad = 8;
            spotlight.style.display = 'block';
            spotlight.style.top = `${Math.max(0, rect.top - pad)}px`;
            spotlight.style.left = `${Math.max(0, rect.left - pad)}px`;
            spotlight.style.width = `${rect.width + pad * 2}px`;
            spotlight.style.height = `${rect.height + pad * 2}px`;
            // Place the bubble on whichever half of the screen has room.
            bubble.classList.toggle('is-top', rect.top > window.innerHeight / 2);
            bubble.classList.remove('is-centered');
        } else {
            spotlight.style.display = 'none';
            bubble.classList.add('is-centered');
        }
        if (!nextBtn) return;
        if (finalStep && !state.progression?.tutorialCompleted) {
            nextBtn.onclick = () => {
                endOnboardingTour(true);
                goPlay({ mode: 'solo', tutorial: true, loadoutLabel: 'Tutorial Match' });
            };
        } else {
            nextBtn.onclick = advanceOnboardingTour;
        }
    }

    function endOnboardingTour(markDone) {
        document.getElementById('tourOverlay')?.remove();
        tourStepIndex = -1;
        if (markDone) localStorage.setItem(tourStorageKey(), '1');
    }

    function isMobileDeckBuilderViewport() {
        return Boolean(window.matchMedia?.('(max-width: 900px)').matches);
    }

    function resetBuilderVisibleLimit() {
        state.builderVisibleLimit = isMobileDeckBuilderViewport() ? 24 : 0;
    }

    function scheduleDeckBuilderPageRender() {
        if (state.builderRenderTimer) {
            window.clearTimeout(state.builderRenderTimer);
        }
        state.builderRenderTimer = window.setTimeout(() => {
            state.builderRenderTimer = null;
            renderDeckBuilderPage();
        }, isMobileDeckBuilderViewport() ? 120 : 0);
    }

    function initGachaParticles() {
        return null;
    }

    function destroyGachaParticles() {
        gachaParticleField = null;
    }

    window.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        hydrateProfilePrefsFromCache();
        hydrateStaticCachesFromStorage();
        hydrateRoomInviteFromUrl();
        applyRouteFromLocation();
        setActiveRoute();
        renderSections();
        renderHudTools();
        renderGold();
        renderHomeDashboard();
        // Paint immediately from the persisted caches (catalog + profile) so the
        // Cards/Decks/Profile routes render instantly on every visit instead of
        // waiting on the network. loadAll() then revalidates in the background.
        safeRender(render);
        bindCatalogSync();
        hydrateLoadingArtFromCache();
        applyCustomPageArt();
        // Swap page and profile art between portrait/landscape variants the
        // moment the device rotates, so the full image always fits the screen.
        const handleOrientationArtChange = () => {
            applyCustomPageArt();
            if (state.route === 'profile') safeRender(renderProfile);
        };
        window.addEventListener('orientationchange', handleOrientationArtChange);
        window.matchMedia?.('(orientation: portrait)')?.addEventListener?.('change', handleOrientationArtChange);
        // Only show the top loading bar when there's nothing cached to paint yet;
        // otherwise the page is already populated and the refresh is silent.
        setHubLoading(!state.options);
        // Cold load (no cached catalog): cover the wait with a loading screen
        // art piece. Cached loads paint instantly, so no takeover there.
        const loadingArtShownAt = !state.options ? showLoadingArtScreen('Loading your binder...') : 0;
        try {
            await loadAll();
            await syncCatalogIfVersionChanged();
            render();
            renderRoute();
            focusRouteTarget(routeFocusFromHash());
            syncAuthRouteIntent();
            ensureHostLobbyPolling();
        } catch (err) {
            console.error('Init load failed', err);
        } finally {
            setHubLoading(false);
            hideLoadingArtScreen(loadingArtShownAt);
            openSharedProfileFromUrl();
            maybeStartOnboardingTour();
        }
    }

    function setHubLoading(active) {
        const bar = document.getElementById('hubLoadingBar');
        if (bar) bar.classList.toggle('hidden', !active);
    }

    function openSharedProfileFromUrl() {
        const parsed = parseHubRoute(location.pathname);
        if (parsed.profileUserId) {
            navigateToPlayerProfile(parsed.profileUserId, { replace: true });
            return;
        }
        const params = new URLSearchParams(location.search);
        const profileId = params.get('profile');
        if (!profileId) return;
        params.delete('profile');
        const query = params.toString();
        history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
        navigateToPlayerProfile(profileId, { replace: true });
    }

    function bindEvents() {
        document.getElementById('cardSearchInput')?.addEventListener('input', (event) => {
            state.search = event.target.value.trim().toLowerCase();
            renderCards();
        });
        document.getElementById('cardSortSelect')?.addEventListener('change', (event) => {
            state.sort = event.target.value;
            renderCards();
        });
        document.getElementById('showUnownedToggle')?.addEventListener('click', () => {
            state.showUnowned = !state.showUnowned;
            renderFilters();
            renderCards();
        });
        document.getElementById('playNowBtn')?.addEventListener('click', () => goPlay({ mode: 'solo', directLoadout: true }));
        document.getElementById('startPveBtn')?.addEventListener('click', () => goPlay({ mode: 'solo', directLoadout: true }));
        document.getElementById('createLobbyBtn')?.addEventListener('click', createLobbyFromHome);
        document.getElementById('shopShortcutBtn')?.addEventListener('click', () => navigateHub('shop'));
        document.getElementById('joinByCodeBtn')?.addEventListener('click', () => navigateHub('social'));
        document.getElementById('joinRoomBtn')?.addEventListener('click', joinRoomFromHome);
        document.getElementById('refreshRoomsBtn')?.addEventListener('click', () => refreshRooms(true));
        document.getElementById('quickJoinBtn')?.addEventListener('click', quickJoinFirstRoom);
        document.getElementById('roomSearchInput')?.addEventListener('input', (event) => {
            state.roomSearch = event.target.value.trim().toLowerCase();
            renderRooms();
        });
        document.getElementById('roomFormatFilter')?.addEventListener('change', (event) => {
            state.roomFormatFilter = event.target.value;
            renderRooms();
        });
        document.getElementById('roomElementFilter')?.addEventListener('change', (event) => {
            state.roomElementFilter = event.target.value;
            renderRooms();
        });
        document.getElementById('roomSortFilter')?.addEventListener('change', (event) => {
            state.roomSort = event.target.value;
            renderRooms();
        });
        document.getElementById('roomHideFullToggle')?.addEventListener('change', (event) => {
            state.roomHideFull = event.target.checked;
            renderRooms();
        });
        document.getElementById('friendSearchInput')?.addEventListener('input', (event) => {
            state.friendSearch = event.target.value.trim().toLowerCase();
            renderFriends();
        });
        document.getElementById('friendAddForm')?.addEventListener('submit', addFriendFromSocial);
        document.getElementById('createCustomDeckBtn')?.addEventListener('click', () => openDeckBuilder({ reset: true }));
        document.getElementById('deckBuilderBackBtn')?.addEventListener('click', () => navigateHub('decks'));
        document.getElementById('saveDeckBuilderPageBtn')?.addEventListener('click', saveCustomDeck);
        document.getElementById('filterTrayBtn')?.addEventListener('click', () => toggleTray('filter'));
        document.getElementById('cardTrayBtn')?.addEventListener('click', () => {
            if (state.route === 'shop') {
                openShopCardPreview();
                return;
            }
            toggleTray('card');
        });
        document.getElementById('hudMinimizeBtn')?.addEventListener('click', () => setHudMinimized(true));
        document.getElementById('hudFab')?.addEventListener('click', () => setHudMinimized(false));
        if (localStorage.getItem('sieglingsHudMinimized') === '1') setHudMinimized(true);
        document.getElementById('optionsBtn')?.addEventListener('click', () => openOptions());
        document.getElementById('friendsBtn')?.addEventListener('click', openFriendsModal);
        document.getElementById('closeFriendsBtn')?.addEventListener('click', closeFriendsModal);
        document.getElementById('friendsModal')?.addEventListener('click', (event) => {
            if (event.target.id === 'friendsModal') closeFriendsModal();
        });
        document.getElementById('addFriendBtn')?.addEventListener('click', () => toggleFriendAddPop());
        document.getElementById('friendRequestsBtn')?.addEventListener('click', () => {
            state.friendRequestsOpen = !state.friendRequestsOpen;
            renderFriendRequests();
        });
        document.getElementById('artLightbox')?.addEventListener('click', closeArtLightbox);
        document.getElementById('hudNotifBtn')?.addEventListener('click', () => toggleNotifPanel());
        document.getElementById('clearNotifsBtn')?.addEventListener('click', clearNotifications);
        document.addEventListener('click', (event) => {
            const panel = document.getElementById('notifPanel');
            if (!panel || panel.classList.contains('hidden')) return;
            if (panel.contains(event.target) || document.getElementById('hudNotifBtn')?.contains(event.target)) return;
            toggleNotifPanel(false);
        });
        loadNotifications();
        document.getElementById('optionsModal')?.addEventListener('click', (event) => {
            if (event.target.id === 'optionsModal') { closeOptions(); return; }
            handleOptionsClick(event);
        });
        document.getElementById('optionsModal')?.addEventListener('submit', handleOptionsSubmit);
        document.getElementById('optionsModal')?.addEventListener('input', handleOptionsInput);
        document.getElementById('trayBackdrop')?.addEventListener('click', closeTrays);
        // The Card View tray re-renders per card, so the x buttons are bound
        // by delegation rather than per render.
        document.addEventListener('click', (event) => {
            if (event.target.closest('[data-tray-close]')) closeTrays();
        });
        document.getElementById('authHudBtn')?.addEventListener('click', openAuth);
        document.getElementById('closeAuthBtn')?.addEventListener('click', closeAuth);
        // Close when the backdrop (the overlay itself) is tapped, like the Play popup.
        document.getElementById('authModal')?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) closeAuth();
        });
        document.getElementById('closeDeckPreviewBtn')?.addEventListener('click', closeDeckPreview);
        document.getElementById('deckPreviewModal')?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) closeDeckPreview();
        });
        document.getElementById('matchReviewOverlay')?.addEventListener('click', closeMatchReview);
        document.querySelectorAll('[data-match-review-close]').forEach(btn => btn.addEventListener('click', closeMatchReview));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeDeckPreview();
                closeMatchReview();
                closeAchievementDetail();
            }
        });
        document.querySelectorAll('[data-home-focus]').forEach((btn) => {
            btn.addEventListener('click', () => navigateHub(btn.dataset.homeFocus === 'matches' ? 'social' : btn.dataset.homeFocus === 'builder' ? 'deck-builder' : 'home'));
        });
        document.querySelectorAll('a[data-route]').forEach((link) => {
            link.addEventListener('click', (event) => {
                const route = link.dataset.route;
                if (route === 'play') return;
                event.preventDefault();
                navigateHub(route);
            });
        });
        window.addEventListener('popstate', () => {
            applyRouteFromLocation();
            setActiveRoute();
            renderSections();
            renderRoute();
            focusRouteTarget(routeFocusFromHash());
            syncAuthRouteIntent();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                void syncCatalogIfVersionChanged();
                void refreshAuthFromStorage();
            }
        });
        window.addEventListener('pageshow', () => {
            void refreshAuthFromStorage();
        });
        window.addEventListener('focus', () => {
            void refreshAuthFromStorage();
        });
        window.addEventListener('storage', (event) => {
            if (event.key === AUTH_TOKEN_KEY || event.key === null) {
                void refreshAuthFromStorage();
            }
        });
    }

    async function loadAll() {
        const [options, packs, descriptions, profile, leaderboards, dailyMissions] = await Promise.all([
            fetchCachedJson('gameOptions', '/api/game/options', STATIC_CACHE_TTL_MS),
            fetchCachedJson('shopPacks', '/api/shop/packs', STATIC_CACHE_TTL_MS),
            fetchCachedJson('creatureDescriptions', '/assets/creature-descriptions.json', STATIC_CACHE_TTL_MS),
            syncProfile(),
            fetchCachedJson('leaderboards', '/api/leaderboards', LEADERBOARD_CACHE_TTL_MS),
            loadDailyMissions()
        ]);
        applyGameOptions(options);
        state.packs = packs?.packs || [];
        state.dailyOffers = packs?.dailyOffers || [];
        state.titleCatalog = packs?.titleCatalog || state.titleCatalog || [];
        state.creatureDescriptions = indexCreatureDescriptions(descriptions);
        state.leaderboards = leaderboards || null;
        state.leaderboardsError = leaderboards?.error || '';
        if (dailyMissions && !dailyMissions.error) {
            state.dailyMissions = dailyMissions;
            state.dailyMissionsError = '';
        }
        if (!state.selectedCardId) {
            state.selectedCardId = state.options.cardCatalog?.[0]?.id || null;
        }
        void loadLoadingArt();
        await refreshRooms();
    }

    async function syncProfile() {
        if (!state.token) {
            state.profile = null;
            state.progression = null;
            state.profilePrefs = null;
            state.profileEditOpen = false;
            state.profileSynced = true;
            clearCachedAuthProfile();
            stopPresenceHeartbeat();
            notifSnapshot = null;
            return null;
        }
        // Bypass the HTTP cache: a stale {authenticated:false} response (Safari
        // is especially eager to cache GETs) would otherwise wipe a valid token.
        const data = await fetchJson('/api/auth/me', { cache: 'no-store' });
        const status = classifyAuthMe(data);
        // Fail open: only an AUTHORITATIVE "signed out" clears the session. A
        // network/timeout/5xx (status === 'unknown') keeps the cached profile +
        // token and retries later — otherwise one flaky /api/auth/me blanks the
        // signed-in UI even though the session is valid.
        if (status === 'unknown') {
            return state.profile;
        }
        if (status === 'signed-out') {
            // The sign-in state is resolved (authoritatively signed out); stop the
            // cards/decks loading screen so the guest view shows instead.
            state.profileSynced = true;
            // Do NOT delete the persisted token here. The token is shared with the
            // Play page (play.html/game.js); a transient failure or stale response
            // would otherwise sign the player out everywhere, and revisiting any
            // page would stay logged out. Clear only the in-memory profile — the
            // token is removed solely on an explicit Log Out. A genuinely expired
            // token is simply replaced the next time the player signs in.
            state.profile = null;
            state.progression = null;
            state.profilePrefs = null;
            state.profileEditOpen = false;
            clearCachedAuthProfile();
            stopPresenceHeartbeat();
            notifSnapshot = null;
            return null;
        }
        // Transparent migration (browsers only): a legacy token rode in as a Bearer
        // header and the server has set the session cookie (confirmed by the readable
        // companion cookie). Drop the secret and keep only the sentinel. Skip in a
        // standalone Web App, where the cookie isn't reliably sent across pages.
        if (isLegacyBearerToken(state.token) && hasReadableAuthCookie() && !isStandalonePWA()) {
            state.token = COOKIE_SESSION_VALUE;
            try { localStorage.setItem(AUTH_TOKEN_KEY, state.token); } catch (e) { /* ignore */ }
        }
        state.profile = data;
        state.progression = data.progression || null;
        state.profileSynced = true;
        saveCachedAuthProfile(data);
        await loadDailyMissions();
        startPresenceHeartbeat();
        // The feed is keyed per account, so reload it once we know who is
        // signed in, then diff the fresh snapshot for new notifications.
        if (notifStorageKey() !== notifLoadedKey) loadNotifications();
        detectNotifications();
        if (newCardsStorageKey() !== newCardsLoadedKey) loadNewCards();
        detectNewCards();
        const serverPrefs = applyProfileSettingsFromServer(data.profileSettings);
        if (serverPrefs) {
            state.profilePrefs = { ...defaultProfilePrefs(data.user || {}), ...serverPrefs };
            cacheProfilePrefs(state.profilePrefs);
        } else if (!state.profilePrefs) {
            state.profilePrefs = defaultProfilePrefs(data.user || {});
        }
        applyProfileArtFromPrefs(state.profilePrefs);
        return data;
    }

    async function loadDailyMissions() {
        if (!state.token) {
            state.dailyMissions = null;
            state.dailyMissionsError = '';
            stopMissionResetTimer();
            return null;
        }
        try {
            const data = await fetchJson('/api/missions/daily');
            if (data?.error) {
                state.dailyMissionsError = data.error;
                return null;
            }
            state.dailyMissions = data;
            state.dailyMissionsError = '';
            startMissionResetTimer();
            return data;
        } catch (error) {
            state.dailyMissionsError = 'Could not load daily missions.';
            return null;
        }
    }

    function stopMissionResetTimer() {
        if (state.missionResetTimer) {
            clearInterval(state.missionResetTimer);
            state.missionResetTimer = null;
        }
    }

    function startMissionResetTimer() {
        stopMissionResetTimer();
        if (!state.dailyMissions?.resetAt) {
            return;
        }
        state.missionResetTimer = setInterval(() => {
            const pill = document.querySelector('.daily-missions-panel .reset-pill');
            if (pill) {
                pill.textContent = formatMissionResetCountdown(state.dailyMissions.resetAt);
            }
        }, 1000);
    }

    function formatMissionResetCountdown(resetAt) {
        const target = new Date(resetAt).getTime();
        if (!Number.isFinite(target)) {
            return 'Resets soon';
        }
        const remainingMs = Math.max(0, target - Date.now());
        const totalSeconds = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `Resets in ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    async function refreshAuthFromStorage() {
        let stored = '';
        try {
            stored = localStorage.getItem(AUTH_TOKEN_KEY) || '';
        } catch (e) {
            stored = '';
        }
        // Same cookie fallback as init: a live httpOnly session whose localStorage
        // marker is missing must not be wiped on focus/pageshow/storage.
        if (!stored && hasReadableAuthCookie()) {
            stored = COOKIE_SESSION_VALUE;
        }
        const tokenChanged = stored !== state.token;
        const profileStale = Boolean(stored) && !state.profile?.authenticated;
        const loggedOutElsewhere = !stored && Boolean(state.profile?.authenticated);
        if (!tokenChanged && !profileStale && !loggedOutElsewhere) {
            return state.profile;
        }
        state.token = stored;
        await syncProfile();
        render();
        syncAuthRouteIntent();
        return state.profile;
    }

    async function refreshRooms(force = false) {
        const data = force ? await fetchJson('/api/match/rooms') : await fetchCachedJson('matchRooms', '/api/match/rooms', ROOM_CACHE_TTL_MS);
        if (force && data) writeCache('matchRooms', data);
        state.rooms = data?.rooms || [];
        renderRooms();
    }

    async function ensurePacksLoaded() {
        if (state.packs?.length) return;
        const packs = await fetchCachedJson('shopPacks', '/api/shop/packs', STATIC_CACHE_TTL_MS);
        state.packs = packs?.packs || [];
        state.dailyOffers = packs?.dailyOffers || [];
        state.titleCatalog = packs?.titleCatalog || state.titleCatalog || [];
    }

    function render() {
        safeRender(renderFilters);
        safeRender(renderProfileMini);
        safeRender(renderSections);
        safeRender(renderStarterGate);
        safeRender(renderCards);
        safeRender(renderDecks);
        safeRender(renderDeckBuilderPage);
        safeRender(renderHomeDashboard);
        safeRender(renderShop);
        safeRender(renderProfile);
        safeRender(renderAchievements);
        safeRender(renderRooms);
        safeRender(renderFriends);
        safeRender(renderFriendRequests);
        safeRender(renderGold);
        safeRender(renderHudTools);
        safeRender(renderAuthModal);
    }

    function renderRoute() {
        if (state.route === 'cards') {
            renderCards();
        } else if (state.route === 'decks') {
            renderDecks();
        } else if (state.route === 'deck-builder') {
            renderDeckBuilderPage();
        } else if (state.route === 'home') {
            renderHomeDashboard();
        } else if (state.route === 'shop') {
            renderShop();
            syncShopPackView();
        } else if (state.route === 'profile') {
            renderProfile();
        } else if (state.route === 'achievements') {
            renderAchievements();
        } else if (state.route === 'social') {
            renderRooms();
            renderFriends();
            renderFriendRequests();
            startSocialPolling();
            stopLobbyPolling();
        } else if (state.route === 'lobby') {
            stopSocialPolling();
            void enterLobbyWaitingRoom();
        } else {
            stopSocialPolling();
            stopLobbyPolling();
        }
        renderHudTools();
        // Keep the HUD auth indicators (Sign In/Log Out + coin pill) in sync on
        // every route change; navigation goes through renderRoute() rather than
        // the full render(), so without this the HUD can lag behind the actual
        // auth state (e.g. body shows the signed-in profile while the HUD still
        // reads "Sign In").
        renderGold();
    }

    function safeRender(fn) {
        try {
            fn();
        } catch (error) {
            console.error(error);
        }
    }

    function renderStarterGate() {
        const gate = document.getElementById('starterGate');
        const hub = document.getElementById('hubGrid');
        const mustChoose = Boolean(state.profile?.authenticated && state.progression && !state.progression.starterChosen);
        document.body.classList.toggle('starter-onboarding-active', mustChoose);
        gate.classList.toggle('hidden', !mustChoose);
        hub.classList.toggle('hidden', mustChoose);
        const grid = document.getElementById('starterPackGrid');
        if (!grid) return;
        grid.innerHTML = state.packs.filter(pack => pack.starterEligible).map(renderPackTile).join('');
    }

    function renderSections() {
        [
            ['home', 'homeSection'],
            ['cards', 'cardsSection'],
            ['decks', 'decksSection'],
            ['deck-builder', 'deckBuilderSection'],
            ['social', 'socialSection'],
            ['lobby', 'lobbySection'],
            ['profile', 'profileSection'],
            ['achievements', 'achievementsSection'],
            ['shop', 'shopSection']
        ].forEach(([route, sectionId]) => {
            const active = state.route === route;
            document.getElementById(sectionId)?.classList.toggle('hidden', !active);
        });
        if (!isBinderRoute() && !isSocialRoute()) {
            state.filterTrayOpen = false;
            state.cardTrayOpen = false;
        }
        if (state.route !== 'shop') {
            state.shopCardPreviewOpen = false;
            renderShopCardPreviewModal();
        }
        renderHudTools();
    }

    function renderFilters() {
        const showUnownedToggle = document.getElementById('showUnownedToggle');
        if (showUnownedToggle) {
            showUnownedToggle.classList.toggle('active', state.showUnowned);
            showUnownedToggle.setAttribute('aria-pressed', String(state.showUnowned));
            showUnownedToggle.textContent = state.showUnowned ? 'Showing unowned' : 'Show unowned';
        }
        renderFilter('elementFilters', elementFilterValues(), state.elementFilter, (value) => {
            state.elementFilter = value;
            renderFilters();
            renderCards();
        });
        renderFilter('typeFilters', ['ALL', 'SIEGLING', 'SIEGEKNIGHT', 'SPELL', 'TRAP'], state.typeFilter, (value) => {
            state.typeFilter = value;
            renderFilters();
            renderCards();
        });
        renderFilter('rarityFilters', ['ALL', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'], state.rarityFilter, (value) => {
            state.rarityFilter = value;
            renderFilters();
            renderCards();
        });
        renderFilter('energyCostFilters', ENERGY_COST_FILTERS, state.energyCostFilter, (value) => {
            state.energyCostFilter = value;
            renderFilters();
            renderCards();
        }, formatEnergyCostFilter);
        renderFilter('finishFilters', ['ALL', 'HOLOGRAPHIC', 'STANDARD'], state.finishFilter, (value) => {
            state.finishFilter = value;
            renderFilters();
            renderCards();
        }, formatFinishFilter);
    }

    function formatFinishFilter(value) {
        if (value === 'HOLOGRAPHIC') return 'Holographic';
        if (value === 'STANDARD') return 'Standard';
        return 'All';
    }

    function renderFilter(id, values, active, onPick, formatter = format) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = values.map(value => {
            const isActive = value === active;
            return `<button class="chip${isActive ? ' active' : ''}" type="button" data-value="${escapeAttr(value)}" aria-pressed="${isActive}">${formatter(value)}</button>`;
        }).join('');
        el.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => onPick(btn.dataset.value)));
    }

    function cardsRenderSignature(cards) {
        return [
            state.showUnowned,
            state.elementFilter,
            state.typeFilter,
            state.rarityFilter,
            state.energyCostFilter,
            state.finishFilter,
            state.sort,
            state.search,
            state.selectedCardId,
            Array.from(state.newCards || []).sort().join(','),
            (state.progression?.holographicCards || []).join(','),
            cards.map(card => `${card.id}:${ownedCount(card.id)}`).join(',')
        ].join('|');
    }

    // Signed in but the owned-cards/decks snapshot hasn't arrived yet this session
    // (and nothing was painted from cache). Show a loading screen rather than a
    // misleading empty binder/deck list.
    function ownedDataLoading() {
        return Boolean(state.token) && !state.profileSynced && !state.profile;
    }

    function renderCards() {
        const grid = document.getElementById('allCardGrid');
        if (!grid) return;
        // Catalog not loaded yet, or owned cards still loading for a signed-in
        // player — show the spinner instead of a blank/empty panel.
        if (!state.options || ownedDataLoading()) {
            grid.innerHTML = `<div class="binder-loading"><span class="binder-loading-spinner" aria-hidden="true"></span><strong>Loading your card binder…</strong></div>`;
            state._cardsRenderSig = '';
            return;
        }
        const cards = filteredCards();
        // Skip the expensive innerHTML teardown/rebuild (hundreds of tiles + their
        // images) when nothing that affects the grid changed. Navigating away and
        // back leaves the section's DOM intact, so re-entry is then instant rather
        // than flashing blank while every tile re-mounts and re-decodes its art.
        const signature = cardsRenderSignature(cards);
        if (signature !== state._cardsRenderSig || !grid.children.length) {
            grid.innerHTML = cards.length
                ? cards.map(renderCardTile).join('')
                : `<div class="unlock-card binder-empty"><strong>No owned cards match these filters</strong><span>${state.showUnowned ? 'Try another search or filter.' : 'Use Show unowned to browse the full catalog.'}</span></div>`;
            grid.querySelectorAll('[data-card-id]').forEach(tile => tile.addEventListener('click', () => {
                state.selectedCardId = tile.dataset.cardId;
                markCardViewed(tile.dataset.cardId);
                openCardTray();
                renderCards();
                renderDetail();
            }));
            state._cardsRenderSig = signature;
            window.SieglingsCardShowcase?.scheduleFramedSummaryFit?.();
        window.SieglingsCardShowcase?.scheduleSiegeKnightCardFit?.();
        }
        const allCount = document.getElementById('allCardCount');
        if (allCount) {
            const ownedVisible = cards.filter(card => ownedCount(card.id) > 0).length;
            allCount.textContent = state.showUnowned ? `${cards.length} cards / ${ownedVisible} owned` : `${cards.length} owned cards`;
        }
        renderDetail();
        renderUnlock();
    }

    function trainerOwnedLevel(trainerId) {
        if (!trainerId) return 0;
        const key = String(trainerId).toLowerCase();
        const ownedEntry = (state.progression?.ownedTrainers || []).find(entry => String(entry?.id || '').toLowerCase() === key);
        if (ownedEntry) return Math.max(1, Number(ownedEntry.level) || 1);
        const trainer = (state.options?.trainers || []).find(item => String(item?.id || '').toLowerCase() === key);
        if (trainer?.owned) return Math.max(1, Number(trainer.level) || 1);
        return 0;
    }

    function trainerOwnedEntry(trainerId) {
        if (!trainerId) return null;
        const key = String(trainerId).toLowerCase();
        return (state.progression?.ownedTrainers || []).find(entry => String(entry?.id || '').toLowerCase() === key) || null;
    }

    function renderTrainerXpBar(trainerId, options = {}) {
        const entry = trainerOwnedEntry(trainerId);
        if (!entry) {
            const fallbackLevel = trainerOwnedLevel(trainerId);
            if (fallbackLevel > 0) {
                return `<div class="trainer-xp-bar" aria-label="Level ${fallbackLevel}">
                    <span class="trainer-xp-bar-label">Lv ${fallbackLevel}</span>
                </div>`;
            }
            if (options.unownedPlaceholder) {
                return '<div class="trainer-xp-bar trainer-xp-bar--unowned"><span>Not owned</span></div>';
            }
            return '';
        }
        const level = Math.max(1, Number(entry.level) || 1);
        const maxLevel = Number(entry.maxLevel) || 5;
        const points = Math.max(0, Number(entry.points) || 0);
        const pointsForNext = Math.max(1, Number(entry.pointsForNext) || level);
        if (level >= maxLevel) {
            return `<div class="trainer-xp-bar trainer-xp-bar--max" aria-label="Max level">
                <div class="trainer-xp-bar-track"><div class="trainer-xp-bar-fill" style="width:100%"></div></div>
                <span class="trainer-xp-bar-label">MAX · Lv ${level}</span>
            </div>`;
        }
        const pct = Math.min(100, Math.round((points / pointsForNext) * 100));
        return `<div class="trainer-xp-bar" aria-label="Level ${level}, ${points} of ${pointsForNext} XP to level ${level + 1}">
            <div class="trainer-xp-bar-track"><div class="trainer-xp-bar-fill" style="width:${pct}%"></div></div>
            <span class="trainer-xp-bar-label">Lv ${level} · ${points}/${pointsForNext} XP</span>
        </div>`;
    }

    function siegeknightBinderCards() {
        return (state.options?.trainers || []).map(trainer => {
            const level = Math.max(1, Number(trainer.level) || trainerOwnedLevel(trainer.id) || 1);
            const owned = trainerOwnedLevel(trainer.id) > 0;
            const abilities = [
                trainer.passive ? { name: 'Passive', description: trainer.passive } : null,
                trainer.active ? { name: 'Active', description: trainer.active } : null
            ].filter(Boolean);
            return {
                id: trainer.id,
                name: trainer.name,
                type: 'SIEGEKNIGHT',
                element: trainer.element,
                rarity: trainer.rarity || 'RARE',
                tier: trainer.tier || 'SiegeKnight',
                level,
                owned,
                abilityBonus: trainer.abilityBonus,
                oncePerGame: trainer.oncePerGame,
                cardArtUrl: trainer.cardArtUrl || '',
                cardArtMode: trainer.cardArtMode || '',
                cardArtOffsetX: trainer.cardArtOffsetX,
                cardArtOffsetY: trainer.cardArtOffsetY,
                cardArtScale: trainer.cardArtScale,
                cardArtRotation: trainer.cardArtRotation,
                holographic: trainer.holographic === true,
                abilities,
                description: abilities.map(ability => ability.description).filter(Boolean).join(' ')
            };
        });
    }

    function binderCatalog() {
        return [...(state.options?.cardCatalog || []), ...siegeknightBinderCards()];
    }

    function filteredCards() {
        const cards = binderCatalog().filter(card => {
            if (!state.showUnowned && ownedCount(card.id) <= 0) return false;
            if (state.elementFilter !== 'ALL' && card.element !== state.elementFilter) return false;
            if (state.typeFilter !== 'ALL' && card.type !== state.typeFilter) return false;
            if (state.rarityFilter !== 'ALL' && card.rarity !== state.rarityFilter) return false;
            if (!matchesEnergyCostFilter(card)) return false;
            if (!matchesFinishFilter(card)) return false;
            if (state.search) {
                const text = `${JSON.stringify(card)} ${creatureDescriptionFor(card)}`.toLowerCase();
                if (!text.includes(state.search)) return false;
            }
            return true;
        });
        return cards.sort((a, b) => {
            if (state.sort === 'name-asc') return a.name.localeCompare(b.name);
            if (state.sort === 'speed-desc') return (b.speed || 0) - (a.speed || 0);
            if (state.sort === 'health-desc') return (b.health || 0) - (a.health || 0);
            if (state.sort === 'cost-asc') return cardEnergyCost(a) - cardEnergyCost(b) || a.name.localeCompare(b.name);
            if (state.sort === 'rarity-desc') return (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
            return ownedCount(b.id) - ownedCount(a.id) || a.name.localeCompare(b.name);
        });
    }

    function renderBinderCardShell(card, options = {}) {
        const isSiegeknight = card.type === 'SIEGEKNIGHT';
        const owned = Number.isFinite(options.ownedOverride)
            ? options.ownedOverride
            : (isSiegeknight ? (trainerOwnedLevel(card.id) > 0 ? 1 : 0) : ownedCount(card.id));
        const knightLevel = isSiegeknight ? Math.max(1, trainerOwnedLevel(card.id) || card.level || 1) : 0;
        const typeLabel = [format(card.type), format(card.element)].filter(Boolean).join(' / ');
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const isSiegling = card.type === 'SIEGLING';
        const ownedLabel = isSiegeknight
            ? (owned ? `Owned · Lv ${knightLevel}` : 'Unowned')
            : (owned ? `Owned x${owned}` : 'Unowned');
        const energyCost = isSiegeknight ? '' : renderBinderCardEnergyCost(cost, costElement);
        const binderOverlay = isSiegeknight ? '' : (window.SieglingsCardBinderVisual?.renderBinderCardOverlay(card) || '');
        return `${isSiegling ? renderBinderNotches(card.notches) : ''}
            ${binderOverlay}
            <div class="binder-card-shell">
                <div class="binder-card-header">
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${escapeHtml(typeLabel)}</span>
                </div>
                <div class="binder-card-art${isSiegeknight ? ' binder-card-art-knight' : ''}">
                    ${(window.SieglingsCardBinderVisual?.renderBinderCardArt && !isSiegeknight
                        ? window.SieglingsCardBinderVisual.renderBinderCardArt(card)
                        : renderBinderCardArt(card))}
                </div>
                <div class="binder-card-body shop-card-body">
                    ${renderShopCardStats(card)}
                    <div class="binder-card-meta">${escapeHtml(format(card.rarity))} / ${ownedLabel}</div>
                    ${energyCost}
                    ${isSiegeknight
                        ? (owned ? `<div class="binder-card-knight-xp">${renderTrainerXpBar(card.id)}</div>` : '')
                        : renderShopCardAbilityLine(card)}
                    ${renderShopCardDescription(card)}
                </div>
            </div>`;
    }

    function renderKnightBinderCardBody(card, options = {}) {
        const tier = String(card.tier || 'SiegeKnight');
        const ownedLevel = trainerOwnedLevel(card.id);
        const level = Math.max(1, Number(card.level) || ownedLevel || 1);
        const owned = card.owned === true || ownedLevel > 0;
        const showOwnership = options.showOwnership !== false;
        const showXp = showOwnership && ownedLevel > 0 && options.showXp !== false;
        const rarityClass = String(card.rarity || 'common').toLowerCase();
        const abilities = options.compact ? [] : (card.abilities || []).slice(0, 2);
        return `
            <span class="knight-card-name">${escapeHtml(card.name)}</span>
            <span class="knight-card-meta"><span class="knight-element">${escapeHtml(format(card.element))}</span> <span class="knight-tier tier-${escapeAttr(tier.toLowerCase())}">${escapeHtml(tier)}</span> <span class="knight-rarity rarity-${escapeAttr(rarityClass)}">${escapeHtml(format(card.rarity))}</span></span>
            ${showOwnership ? `<span class="knight-card-meta knight-binder-owned">${owned ? `Owned · Lv ${level}` : 'Unowned'}</span>` : ''}
            ${showXp ? `<div class="knight-binder-xp">${renderTrainerXpBar(card.id)}</div>` : ''}
            ${abilities.map(a => `<span class="knight-card-ability"><span>${escapeHtml(a.name)}</span>${escapeHtml(a.description)}</span>`).join('')}
        `;
    }

    // SiegeKnight tile/preview using the loadout card template
    // (knight-card has-knight-back styles in style.css) while keeping the
    // binder data: tier, rarity, owned level, XP bar, passive/active text.
    function renderKnightBinderCard(card, options = {}) {
        card = withPlayerHolographic(card);
        const elHex = elementColor(card.element);
        const elClass = String(card.element || 'NEUTRAL').toLowerCase();
        const rarityClass = String(card.rarity || 'common').toLowerCase();
        const extraClass = String(options.extraClass || '').trim();
        const extraClassAttr = extraClass ? ` ${escapeAttr(extraClass)}` : '';
        const fullCardArtUrl = window.SieglingsCardBinderVisual?.usesFullCardArt?.(card)
            ? String(card.cardArtUrl || '').trim()
            : '';
        if (fullCardArtUrl) {
            const holoClass = card.holographic ? ' is-holographic' : '';
            const holoOverlay = card.holographic ? '<div class="card-holographic-overlay" aria-hidden="true"></div>' : '';
            return `<div class="knight-card knight-full-card-art knight-binder-card${extraClassAttr} rarity-frame-${escapeAttr(rarityClass)} el-${escapeAttr(elClass)}${holoClass}" role="img" aria-label="${escapeAttr(card.name || 'SiegeKnight card')}">
                <img src="${escapeAttr(fullCardArtUrl)}" alt="${escapeAttr(card.name || 'SiegeKnight card')}" loading="lazy">
                ${holoOverlay}
                <div class="knight-card-body">${renderKnightBinderCardBody(card, options)}</div>
            </div>`;
        }
        const backStyle = typeof siegeknightCardBackStyle === 'function'
            ? siegeknightCardBackStyle()
            : "--knight-card-back:url('/img/knights/card-back-siegeknight.png');--knight-card-template:url('/img/knights/siegeknight-card-template.png')";
        const iconPath = (typeof ELEMENT_KEY_ICON_PATHS !== 'undefined'
            && ELEMENT_KEY_ICON_PATHS[String(card.element || '').toUpperCase()]) || '';
        const elementIconStyle = iconPath ? `--knight-element-icon:url('${iconPath}');` : '';
        const holoClass = card.holographic ? ' is-holographic' : '';
        const holoOverlay = card.holographic ? '<div class="card-holographic-overlay" aria-hidden="true"></div>' : '';
        return `<div class="knight-card has-knight-back knight-binder-card${extraClassAttr} rarity-frame-${escapeAttr(rarityClass)} el-${escapeAttr(elClass)}${holoClass}" style="--knight-color:${elHex};--knight-glow:${elHex}5c;${backStyle};${elementIconStyle}">
            <div class="knight-card-portrait has-knight-back" aria-hidden="true"></div>
            <div class="knight-card-template" aria-hidden="true"></div>
            <div class="knight-shield-element" aria-label="${escapeAttr(format(card.element))}"></div>
            ${holoOverlay}
            <div class="knight-card-body">${renderKnightBinderCardBody(card, options)}</div>
        </div>`;
    }

    function renderCardTile(card) {
        card = withPlayerHolographic(card);
        const selected = card.id === state.selectedCardId ? ' selected' : '';
        const newClass = isNewCard(card.id) ? ' is-new' : '';
        const newBadge = isNewCard(card.id) ? '<span class="card-new-badge" aria-label="New card">New</span>' : '';
        const knightClass = card.type === 'SIEGEKNIGHT' ? ' siegeknight-binder-card' : '';
        const binderVisual = window.SieglingsCardBinderVisual;
        const holoOptions = binderHolographicOptions();
        if (card.type === 'SIEGEKNIGHT') {
            return `<button class="card-tile binder-card framed-binder-tile knight-binder-tile${selected}${newClass}" type="button" data-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}">
                ${newBadge}${renderKnightBinderCard(card, { compact: true })}
            </button>`;
        }
        if (binderVisual?.usesFullCardArt?.(card)) {
            return `<button class="card-tile binder-card framed-binder-tile${selected}${newClass}${knightClass}" type="button" data-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}">
                ${newBadge}${binderVisual.renderBinderCardTile(card, { ...holoOptions, descriptionText: shopCardDescriptionFor(card) })}
            </button>`;
        }
        if (binderVisual?.usesFramedCardTemplate?.(card)) {
            return `<button class="card-tile binder-card framed-binder-tile${selected}${newClass}${knightClass}" type="button" data-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}">
                ${newBadge}${binderVisual.renderBinderCardTile(card, { ...holoOptions, descriptionText: shopCardDescriptionFor(card) })}
            </button>`;
        }
        const modeClass = card.type === 'SIEGEKNIGHT' ? '' : (binderVisual?.resolveArtModeClass(card) || '');
        return `<button class="card-tile binder-card${selected}${newClass}${modeClass}${knightClass}" type="button" data-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}">
            ${newBadge}${renderBinderCardShell(card)}
        </button>`;
    }

    function renderDetail() {
        const panel = document.getElementById('detailPanel');
        let card = selectedCard();
        if (!panel) return;
        if (!card) {
            panel.innerHTML = '<div class="unlock-card"><strong>Card details loading</strong><span>Select a card from Cards or Decks to inspect art, abilities, notches, and energy costs.</span></div>';
            return;
        }
        card = withPlayerHolographic(card);
        const abilities = card.abilities || (card.ability ? [card.ability] : []);
        const flavorText = creatureDescriptionFor(card);
        const isSiegeknight = card.type === 'SIEGEKNIGHT';
        const craftCost = remnantCraftCost(card);
        const holoCost = remnantHolographicCost(card);
        const remnants = remnantBalance();
        const canCraft = !isSiegeknight && state.profile?.authenticated && state.progression?.starterChosen && remnants >= craftCost;
        const craftLabel = state.profile?.authenticated
            ? `Craft for ${craftCost.toLocaleString()} Remnants`
            : 'Sign in to craft';
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const knightLevel = isSiegeknight ? Math.max(1, trainerOwnedLevel(card.id) || card.level || 1) : 0;
        const trainerEntry = isSiegeknight ? trainerOwnedEntry(card.id) : null;
        const ownedKnight = isSiegeknight && trainerOwnedLevel(card.id) > 0;
        const ownedForHolo = isSiegeknight ? ownedKnight : ownedCount(card.id) > 0;
        const catalogHolographic = Boolean(findCard(card.id)?.holographic);
        const playerHolographic = playerOwnsHolographicFinish(card);
        const alreadyHolographic = catalogHolographic || playerHolographic;
        const canBuyHolographic = state.profile?.authenticated
            && state.progression?.starterChosen
            && ownedForHolo
            && !alreadyHolographic;
        const holoAffordable = remnants >= holoCost;
        const maxKnightLevel = Number(trainerEntry?.maxLevel) || 5;
        const atMaxKnightLevel = ownedKnight && knightLevel >= maxKnightLevel;
        const nextXpCost = ownedKnight && !atMaxKnightLevel
            ? (Number(trainerEntry?.nextXpCoinCost) || 50 * knightLevel)
            : 0;
        const abilityBonus = trainerEntry != null
            ? Math.max(0, Number(trainerEntry.abilityBonus) || knightLevel - 1)
            : Math.max(0, knightLevel - 1);
        const canBuyKnightXp = ownedKnight
            && !atMaxKnightLevel
            && state.profile?.authenticated
            && state.progression?.starterChosen
            && (state.progression?.gold || 0) >= nextXpCost;
        const cardPreview = isSiegeknight
            ? `<div class="knight-detail-preview">${renderKnightBinderCard(card)}</div>`
            : window.SieglingsCardBinderVisual?.renderBinderCardPreview
            ? window.SieglingsCardBinderVisual.renderBinderCardPreview(card, {
                ownedOverride: ownedCount(card.id),
                previewClass: 'detail-card-preview',
                descriptionText: shopCardDescriptionFor(card),
                ...binderHolographicOptions()
            })
            : `<div class="binder-card detail-card-preview" style="--el:${elementColor(card.element)}">${renderBinderCardShell(card)}</div>`;
        panel.innerHTML = `
            <button class="tray-close-btn" type="button" data-tray-close aria-label="Close">&times;</button>
            <div class="detail-card-preview-wrap">${cardPreview}</div>
            ${isSiegeknight ? '' : `<div class="chip-wrap detail-chip-wrap">
                ${renderActiveNotchChips(card.notches)}
            </div>
            <div class="detail-cost-block">
                <span class="detail-cost-label">Energy cost</span>
                ${renderBinderCardEnergyCost(cost, costElement)}
            </div>`}
            <div class="detail-grid">
                ${isSiegeknight ? `<div><span>Level</span><strong>${knightLevel}</strong></div>
                <div><span>Tier</span><strong>${escapeHtml(card.tier || 'SiegeKnight')}</strong></div>
                <div><span>Element</span><strong>${format(card.element)}</strong></div>
                <div><span>Ability bonus</span><strong>+${abilityBonus} effect</strong></div>` : ''}
                ${card.type === 'SIEGLING' ? `<div><span>Health</span><strong>${card.health ?? '-'}</strong></div>
                <div><span>Speed</span><strong>${card.speed ?? '-'}</strong></div>
                <div><span>Row</span><strong>${format(card.preferredRow || '-')}</strong></div>
                <div><span>Evolution</span><strong>${escapeHtml(card.evolvesFromName || card.evolvesFromId || 'Base')}</strong></div>` : ''}
                ${!isSiegeknight && card.type !== 'SIEGLING' ? `<div><span>Cost</span><strong>${card.costAmount ?? 0} ${format(card.costElement || card.element)}</strong></div>` : ''}
                ${!isSiegeknight ? `<div><span>Reaction</span><strong>${format(card.requiredReaction || 'None')}</strong></div>` : ''}
            </div>
            ${flavorText && !isSiegeknight ? `
                <div class="detail-flavor" style="--el:${elementColor(card.element)}">
                    <span>Background</span>
                    <p>${escapeHtml(flavorText)}</p>
                </div>
            ` : ''}
            <h3 class="detail-section-title">${isSiegeknight ? 'SiegeKnight abilities' : 'Moves &amp; abilities'}</h3>
            <div class="detail-abilities">
            ${abilities.length ? abilities.map(a => `<div class="detail-ability-row"><strong>${escapeHtml(a.name || 'Ability')}</strong><p>${escapeHtml(a.description || '')}</p></div>`).join('') : '<p class="detail-ability-empty">No printed ability.</p>'}
            </div>
            <div class="detail-holographic-panel">
                ${alreadyHolographic
                    ? `<span class="detail-knight-hint">${catalogHolographic && !playerHolographic
                        ? 'This card already has a built-in holographic finish.'
                        : 'Holographic finish active in your binder and matches.'}</span>`
                    : !state.profile?.authenticated
                        ? '<span class="detail-knight-hint">Sign in to upgrade owned cards with a holographic finish.</span>'
                        : !state.progression?.starterChosen
                            ? '<span class="detail-knight-hint">Choose a starter pack before upgrading cards.</span>'
                        : !ownedForHolo
                            ? '<span class="detail-knight-hint">Own this card first to unlock a holographic finish.</span>'
                            : `<button class="primary-btn holographic-buy-btn" type="button" id="buyHolographicFinishBtn"${canBuyHolographic ? '' : ' disabled'}>Holographic finish · ${holoCost.toLocaleString()} Remnants</button>
                               <span class="detail-knight-hint">${holoAffordable
                                    ? 'Only you see this foil shimmer in your binder and matches.'
                                    : `Need ${holoCost.toLocaleString()} Remnants · you have ${remnants.toLocaleString()}.`}</span>`}
            </div>
            ${isSiegeknight ? `<div class="detail-knight-xp-panel">
                ${ownedKnight ? renderTrainerXpBar(card.id) : ''}
                <div class="detail-knight-xp-action">
                    ${!state.profile?.authenticated ? '<span class="detail-knight-hint">Sign in to track knight XP and buy levels.</span>'
                        : !ownedKnight ? '<span class="detail-knight-hint">Pull this knight from packs to unlock leveling.</span>'
                        : atMaxKnightLevel ? '<span class="detail-knight-hint">Max level reached — ability effects are fully powered.</span>'
                        : `<button class="primary-btn" type="button" id="buyKnightXpBtn"${canBuyKnightXp ? '' : ' disabled'}>Buy 1 XP · ${renderCoinAmount(nextXpCost, '')}</button>
                           <span>${(state.progression?.gold || 0).toLocaleString()} Siegecoins available</span>
                           <span class="detail-knight-hint detail-knight-hint--siege">Levels are for Siege mode (roguelike, coming soon) — they don't affect Battle.</span>`}
                </div>
                <p class="detail-knight-hint">Pull duplicates from packs to combine, or buy XP with Siegecoins (${50} × current level per point).</p>
            </div>` : `<div class="craft-card-action">
                <button class="primary-btn" type="button" id="craftSelectedCard"${canCraft || !state.profile?.authenticated ? '' : ' disabled'}>${escapeHtml(craftLabel)}</button>
                <span>${escapeHtml(remnants.toLocaleString())} Remnants available</span>
            </div>`}
            ${state.route === 'deck-builder' && !isSiegeknight ? '<button class="primary-btn" type="button" id="addSelectedToBuilder">Add to deck</button>' : ''}
        `;
        document.getElementById('craftSelectedCard')?.addEventListener('click', () => craftSelectedCard(card.id));
        document.getElementById('buyHolographicFinishBtn')?.addEventListener('click', () => purchaseHolographicFinish(card.id));
        document.getElementById('buyKnightXpBtn')?.addEventListener('click', () => buyKnightXp(card.id));
        document.getElementById('addSelectedToBuilder')?.addEventListener('click', () => {
            if (state.route !== 'deck-builder') {
                openDeckBuilder();
            }
            adjustBuilder(card.id, 1);
        });
        window.SieglingsCardShowcase?.scheduleFramedSummaryFit?.();
        window.SieglingsCardShowcase?.scheduleSiegeKnightCardFit?.();
    }

    function renderHomeDashboard() {
        const el = document.getElementById('homeDashboard');
        if (!el) return;
        const collection = collectionSummary();
        const ownedTotal = state.progression?.ownedTotal || 0;
        const coins = state.profile?.authenticated ? (state.progression?.gold || 0) : 100;
        const savedDecks = state.profile?.savedDecks || [];
        const remnants = remnantBalance();
        const customSlotsUsed = savedDecks.length;
        const customSlotsMax = 20;
        const recentRooms = state.rooms.slice(0, 4);
        const featuredPacks = state.packs.slice(0, 4);
        const recentDecks = savedDecks.slice(0, 3);
        const missions = homeDailyMissions();
        const missionLog = homeMissionLog(missions);
        const resetLabel = state.dailyMissions?.resetAt
            ? formatMissionResetCountdown(state.dailyMissions.resetAt)
            : 'Resets at midnight UTC';
        const displayName = (state.profile?.user?.displayName || 'Siegelord').toUpperCase();
        el.innerHTML = `
            <section class="command-hero">
                <div class="command-hero-top">
                    <div class="command-hero-copy">
                        <p class="command-hero-welcome">Welcome back, ${escapeHtml(displayName)}</p>
                        <h2>The Arena Awaits</h2>
                        <p class="command-hero-tagline">Battle, build, collect, and keep your daily momentum moving from one command table.</p>
                    </div>
                    <div class="command-hero-actions">
                        <button class="ghost-btn command-hero-btn" type="button" data-home-action="cards"><span>Cards</span>Owned Cards</button>
                        <button class="primary-btn command-hero-btn command-hero-btn-primary" type="button" data-home-action="pve"><span>Play</span>Start Match</button>
                        <button class="ghost-btn command-hero-btn" type="button" data-home-action="deck-builder"><span>Deck</span>Deck Builder</button>
                    </div>
                </div>
                <div class="command-hero-stats" aria-label="Account resources">
                    ${homeHeroStatChip(HERO_STAT_ICONS.coins, 'Siegecoins', coins.toLocaleString(), 'Available')}
                    ${homeHeroStatChip(HERO_STAT_ICONS.cards, 'Owned Cards', ownedTotal.toLocaleString(), 'Total copies')}
                    ${homeHeroStatChip(HERO_STAT_ICONS.decks, 'Custom Decks', `${customSlotsUsed} / ${customSlotsMax}`, 'Slots used')}
                    ${homeHeroStatChip(HERO_STAT_ICONS.remnants, 'Remnants', remnants.toLocaleString(), 'Craft currency')}
                    ${homeHeroStatChip(HERO_STAT_ICONS.collection, 'Collection', `${collection.completion}%`, 'Set completion')}
                </div>
            </section>

            <section class="command-action-row">
                <a class="command-action-card fire" href="/play?mode=solo" data-home-action="pve">
                    <span class="command-action-icon">PVE</span>
                    <strong>PVE Battle</strong>
                    <small>Fight AI opponents and earn Siegecoins and Remnants.</small>
                    <span class="command-action-arrow">&gt;</span>
                </a>
                <a class="command-action-card water" href="/social#socialActiveLobby" data-home-action="create-lobby">
                    <span class="command-action-icon">1v1</span>
                    <strong>Create 1v1 Lobby</strong>
                    <small>Host a PVP room and challenge a friend.</small>
                    <span class="command-action-arrow">&gt;</span>
                </a>
                <a class="command-action-card shadow" href="/shop" data-home-action="shop">
                    <span class="command-action-icon">Pack</span>
                    <strong>Open Packs</strong>
                    <small>Discover cards and earn Remnants every time.</small>
                    <span class="command-action-arrow">&gt;</span>
                </a>
            </section>

            <section class="command-grid">
                ${renderHomeLeaderboardsPanel()}

                <article class="command-panel daily-missions-panel">
                    <div class="command-panel-head">
                        <div><span class="eyebrow">Daily Missions</span><h3>Today's objectives</h3></div>
                        <span class="reset-pill">${escapeHtml(resetLabel)}</span>
                    </div>
                    <div class="mission-list">
                        ${missions.length ? missions.map(renderMissionRow).join('') : '<div class="home-empty-emblem">Sign in to track daily missions.</div>'}
                    </div>
                    <button class="ghost-btn command-wide-btn" type="button" data-home-action="missions">${state.showAllMissions ? 'Show Featured Missions' : 'View All Missions'}</button>
                </article>

                <article class="command-panel open-lobbies-panel">
                    <div class="command-panel-head"><div><span class="eyebrow">Open Lobbies</span><h3>Active tables</h3></div></div>
                    <div class="home-room-list">
                        ${recentRooms.length ? recentRooms.map(room => `<div class="home-room-row"><strong>${escapeHtml(room.hostName || 'Host')}</strong><span>${escapeHtml(room.roomId)} / ${escapeHtml(room.status || 'Open')}</span></div>`).join('') : '<div class="home-empty-emblem">No open lobbies right now.<br>Be the first to challenge.</div>'}
                    </div>
                    <button class="ghost-btn command-wide-btn" type="button" data-home-action="create-lobby">Create a 1v1 Lobby</button>
                </article>

                <article class="command-panel collection-hub-panel">
                    <div class="command-panel-head"><div><span class="eyebrow">Collection Hub</span><h3>Search, filter, and build</h3></div></div>
                    <p>Review owned cards, inspect notches, and spend Remnants from packs and wins to craft specific cards.</p>
                    <div class="collection-actions">
                        <button class="primary-btn" type="button" data-home-action="cards">Browse Cards</button>
                        <button class="ghost-btn" type="button" data-home-action="decks">Build Deck</button>
                    </div>
                    <div class="collection-mini-row collection-card-row">
                        ${renderHomeCollectionPreview(collection)}
                    </div>
                </article>

                <article class="command-panel mission-log-panel">
                    <div class="command-panel-head"><div><span class="eyebrow">Mission Log</span><h3>Recent progress</h3></div></div>
                    <div class="mission-log-list">
                        ${missionLog.map(row => `<div class="mission-log-row"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.detail)}</span></div>`).join('')}
                    </div>
                </article>

                <article class="command-panel used-decks-panel">
                    <div class="command-panel-head"><div><span class="eyebrow">Recently Used Decks</span><h3>Loadout shelf</h3></div><button class="link-btn" type="button" data-home-action="decks">View All Decks</button></div>
                    <div class="deck-mini-row">
                        ${recentDecks.length ? recentDecks.map(deck => renderHomeDeckMini(deck)).join('') : renderHomeDefaultDeckMinis()}
                    </div>
                </article>

                <article class="command-panel shop-packs-panel">
                    <div class="command-panel-head"><div><span class="eyebrow">Shop Packs</span><h3>Element starters</h3></div></div>
                    <div class="shop-pack-list">
                        ${featuredPacks.length ? featuredPacks.map(pack => `<button class="shop-pack-row" type="button" data-home-action="shop"><span style="--el:${elementColor(pack.elements?.[0])}">${escapeHtml(format(pack.elements?.[0]).slice(0, 1) || 'P')}</span><strong>${escapeHtml(pack.name)}</strong><em>${renderCoinAmount(pack.price || 100, '')}</em></button>`).join('') : homeDefaultPackRows()}
                    </div>
                </article>
            </section>
        `;
        bindHomeDashboardActions(el);
    }

    function leaderboardBoardsForPeriod(period) {
        const activePeriod = LEADERBOARD_PERIODS.some(([id]) => id === period) ? period : 'daily';
        const periods = state.leaderboards?.periods;
        if (periods && periods[activePeriod]) {
            return periods[activePeriod];
        }
        return activePeriod === 'daily' ? (state.leaderboards?.boards || {}) : {};
    }

    function leaderboardPeriodHeadline(period) {
        const headlines = {
            daily: 'See who rules the arena today',
            weekly: 'See who rules the arena this week',
            monthly: 'See who rules the arena this month',
            year: 'See who rules the arena this year',
            allTime: 'See who rules the arena of all time'
        };
        return headlines[period] || headlines.daily;
    }

    function renderHomeLeaderboardsPanel() {
        const tabs = [
            ['wins', 'Wins'],
            ['matchesPlayed', 'Matches'],
            ['spellsCast', 'Strategies'],
            ['trapsSprung', 'Deceptions'],
            ['siegelingsDefeated', 'Siegelings'],
            ['pvpWinRate', 'PVP W/L']
        ];
        const activePeriod = LEADERBOARD_PERIODS.some(([id]) => id === state.leaderboardPeriod)
            ? state.leaderboardPeriod
            : 'daily';
        const boards = leaderboardBoardsForPeriod(activePeriod);
        const activeTab = tabs.some(([id]) => id === state.leaderboardTab) ? state.leaderboardTab : 'wins';
        const activeRows = boards[activeTab] || [];
        const generatedAt = state.leaderboards?.generatedAt ? formatDateTime(state.leaderboards.generatedAt) : '';
        const periodLabel = LEADERBOARD_PERIODS.find(([id]) => id === activePeriod)?.[1] || 'Daily';
        return `<article class="command-panel home-leaderboards-panel">
            <div class="command-panel-head">
                <div><span class="eyebrow">Leaderboards</span><h3>${escapeHtml(leaderboardPeriodHeadline(activePeriod))}</h3></div>
                <span class="reset-pill">${generatedAt ? `Updated ${escapeHtml(generatedAt)}` : escapeHtml(periodLabel)}</span>
            </div>
            <div class="home-lb-period-tabs" role="tablist" aria-label="Leaderboard time range">
                ${LEADERBOARD_PERIODS.map(([id, label]) => `<button class="home-lb-period-tab${activePeriod === id ? ' active' : ''}" type="button" data-home-lb-period="${escapeAttr(id)}" role="tab" aria-selected="${activePeriod === id}">${escapeHtml(label)}</button>`).join('')}
            </div>
            <div class="home-lb-tabs" role="tablist" aria-label="Leaderboard category">
                ${tabs.map(([id, label]) => `<button class="home-lb-tab${activeTab === id ? ' active' : ''}" type="button" data-home-lb="${escapeAttr(id)}" role="tab" aria-selected="${activeTab === id}">${escapeHtml(label)}</button>`).join('')}
            </div>
            <div class="home-lb-list">
                ${state.leaderboardsError && !state.leaderboards ? `<div class="home-empty-emblem">${escapeHtml(state.leaderboardsError)}</div>` : ''}
                ${activeRows.length ? activeRows.slice(0, 6).map(row => {
                    const value = activeTab === 'pvpWinRate' && row.detail ? row.detail : row.value;
                    return `<div class="home-lb-row"><strong>#${escapeHtml(row.rank)}</strong><span>${escapeHtml(row.displayName || 'Player')}</span><em>${escapeHtml(value ?? '')}</em></div>`;
                }).join('') : '<div class="home-empty-emblem">No leaderboard results yet.</div>'}
            </div>
        </article>`;
    }

    function formatDateTime(value) {
        try {
            return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (error) {
            return String(value || '');
        }
    }

    // Compact "how long ago" label for friend last-seen timestamps.
    function timeAgoLabel(value) {
        if (!value) return '';
        const then = new Date(value).getTime();
        if (!Number.isFinite(then)) return '';
        const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
        if (secs < 60) return 'just now';
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}mo ago`;
        return `${Math.floor(months / 12)}y ago`;
    }

    function homeCountTile(icon, label, value, hint, iconIsMarkup = false) {
        return `<article class="command-count-card">
            <span class="count-icon">${iconIsMarkup ? icon : escapeHtml(icon)}</span>
            <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><em>${escapeHtml(hint)}</em></div>
        </article>`;
    }

    function homeHeroStatChip(iconSrc, label, value, hint) {
        return `<article class="command-hero-stat">
            <span class="command-hero-stat-icon"><img src="${escapeAttr(iconSrc)}" alt="" aria-hidden="true"></span>
            <div class="command-hero-stat-copy">
                <small>${escapeHtml(label)}</small>
                <strong>${escapeHtml(value)}</strong>
                <em>${escapeHtml(hint)}</em>
            </div>
        </article>`;
    }

    function renderHomeCollectionPreview(collection) {
        const cards = (collection.previewCards.length ? collection.previewCards : (state.options?.cardCatalog || [])).filter(Boolean).slice(0, 3);
        if (!cards.length) {
            return '<div class="home-empty-emblem">Cards will appear here after the catalog loads.</div>';
        }
        return cards.map(card => renderCardTile(card)
            .replace('card-tile binder-card', 'card-tile binder-card home-collection-card')
            .replace('type="button"', 'type="button" data-home-action="card"')).join('');
    }

    function homeDailyMissions() {
        const snapshot = state.dailyMissions;
        const list = state.showAllMissions
            ? (snapshot?.missions || [])
            : (snapshot?.featured || snapshot?.missions || []);
        if (list.length) {
            return list.map(mission => ({
                ...mission,
                iconMarkup: mission.coinIcon,
                icon: mission.coinIcon ? coinIconMarkup() : mission.icon
            }));
        }
        if (!state.profile?.authenticated) {
            return (snapshot?.featured || []).map(mission => ({
                ...mission,
                iconMarkup: mission.coinIcon,
                icon: mission.coinIcon ? coinIconMarkup() : mission.icon,
                current: 0
            }));
        }
        return [];
    }

    function renderMissionRow(mission) {
        const pct = mission.target ? Math.min(100, Math.round((mission.current / mission.target) * 100)) : 0;
        const statusClass = mission.claimed ? ' is-claimed' : (mission.completed ? ' is-complete' : '');
        const claimBtn = mission.claimable
            ? `<button class="mission-claim-btn" type="button" data-mission-claim="${escapeAttr(mission.id)}">Claim</button>`
            : (mission.claimed ? '<span class="mission-claimed-label">Claimed</span>' : '');
        return `<div class="mission-row${statusClass}" data-mission-id="${escapeAttr(mission.id)}">
            <span class="mission-icon">${mission.iconMarkup ? mission.icon : escapeHtml(mission.icon)}</span>
            <div class="mission-copy">
                <strong>${escapeHtml(mission.title)}</strong>
                <div class="mission-progress"><span style="width:${pct}%"></span></div>
            </div>
            <span class="mission-count">${escapeHtml(mission.current)} / ${escapeHtml(mission.target)}</span>
            <span class="mission-reward">${renderCoinAmount(mission.reward, '')}</span>
            ${claimBtn}
        </div>`;
    }

    async function claimDailyMission(missionId) {
        if (!state.token || !missionId) return;
        const data = await fetchJson('/api/missions/claim', { method: 'POST', body: JSON.stringify({ missionId }) });
        if (data?.error) {
            window.alert(data.error);
            return;
        }
        if (data?.dailyMissions) {
            state.dailyMissions = data.dailyMissions;
        } else {
            await loadDailyMissions();
        }
        if (typeof data?.gold === 'number' && state.progression) {
            state.progression.gold = data.gold;
        }
        const missions = state.dailyMissions?.missions || state.dailyMissions?.featured || [];
        const claimed = missions.find(m => m.id === missionId);
        pushNotification('mission', `Mission claimed: ${claimed?.title || 'Daily mission'}`, claimed?.reward ? `+${claimed.reward} Siegecoins added to your wallet.` : '');
        // Keep the diff snapshot current so the next sync doesn't re-report
        // this reward as separately earned gold.
        if (notifSnapshot) notifSnapshot.gold = Number(state.progression?.gold) || notifSnapshot.gold;
        safeRender(renderGold);
        safeRender(renderHomeDashboard);
    }

    function homeMissionLog(missions = []) {
        const history = state.profile?.matchHistory || [];
        const packHistory = state.progression?.packHistory || [];
        const rows = [];
        missions.filter(m => m.completed).slice(0, 2).forEach(mission => rows.push({
            title: mission.claimed ? `${mission.title} claimed` : `${mission.title} complete`,
            detail: mission.claimed
                ? `${mission.reward} Siegecoins collected`
                : `Ready to claim ${mission.reward} Siegecoins`
        }));
        history.slice(0, 3).forEach(row => rows.push({
            title: `${format(row.result || 'Battle')} vs ${row.opponentName || 'Opponent'}`,
            detail: row.loadoutLabel || row.trainerName || 'Match completed'
        }));
        packHistory.slice(0, 2).forEach(row => rows.push({
            title: `${row.packName || 'Pack'} opened`,
            detail: `${row.cards?.length || 0} card${row.cards?.length === 1 ? '' : 's'} added to the binder`
        }));
        if (!rows.length) {
            rows.push(
                { title: 'PVE battle ready', detail: 'Start a match to write the first line.' },
                { title: 'Collection waiting', detail: 'Open packs to grow the binder.' },
                { title: 'Social table open', detail: 'Create a 1v1 lobby when ready.' }
            );
        }
        return rows.slice(0, 5);
    }

    function renderHomeDeckMini(deck) {
        const fallbackDeck = (state.options?.decks || []).find(item => item.id === deck.deckId);
        const elements = fallbackDeck?.elements || ['FIRE'];
        const visual = deckAssetForElements(elements);
        const artStyle = visual?.back ? ` style="--deck-art:url('${visual.back}');--deck-accent:${elementColor(elements[0])}"` : ` style="--deck-accent:${elementColor(elements[0])}"`;
        return `<button class="home-deck-mini" type="button" data-home-action="decks"${artStyle}>
            <span>${escapeHtml(deck.name || fallbackDeck?.name || 'Saved Deck')}</span>
            <small>${escapeHtml(fallbackDeck?.name || deck.trainerName || 'Custom Loadout')}</small>
        </button>`;
    }

    function renderHomeDefaultDeckMinis() {
        const decks = (state.options?.decks || []).slice(0, 3);
        if (!decks.length) {
            return '<div class="home-empty-emblem">Saved decks will appear here.</div>';
        }
        return decks.map(deck => {
            const visual = deckAssetForElements(deck.elements);
            const artStyle = visual?.back ? ` style="--deck-art:url('${visual.back}');--deck-accent:${elementColor(deck.elements?.[0])}"` : ` style="--deck-accent:${elementColor(deck.elements?.[0])}"`;
            return `<button class="home-deck-mini" type="button" data-home-action="decks"${artStyle}>
                <span>${escapeHtml(deck.name)}</span>
                <small>Standard</small>
            </button>`;
        }).join('');
    }

    function homeDefaultPackRows() {
        return ['FIRE', 'EARTH', 'WIND', 'ICE'].map(element => `<button class="shop-pack-row" type="button" data-home-action="shop">
            <span style="--el:${elementColor(element)}">${escapeHtml(format(element).slice(0, 1))}</span>
            <strong>${escapeHtml(format(element))} Starter Pack</strong>
            <em>${renderCoinAmount(100, '')}</em>
        </button>`).join('');
    }

    function bindHomeDashboardActions(root) {
        root.querySelectorAll('[data-home-action]').forEach(btn => btn.addEventListener('click', (event) => {
            const action = btn.dataset.homeAction;
            const directLink = btn.tagName === 'A';
            if (action === 'pve') {
                queuePlayLoadout({ mode: 'solo', directLoadout: true });
                if (!directLink) return goPlay({ mode: 'solo', directLoadout: true });
                return;
            }
            if (action === 'create-lobby') {
                if (directLink) return;
                return navigateHub('social', { focus: 'lobby' });
            }
            if (action === 'card') {
                event.preventDefault();
                state.selectedCardId = btn.dataset.cardId;
                navigateHub('cards');
                openCardTray();
                renderCards();
                renderDetail();
                return;
            }
            if (action === 'cards') return navigateHub('cards');
            if (action === 'decks') return navigateHub('decks');
            if (action === 'deck-builder') return openDeckBuilder({ reset: true });
            if (action === 'social') return navigateHub('social', { focus: 'lobby' });
            if (action === 'shop') {
                if (directLink) return;
                return navigateHub('shop');
            }
            if (action === 'missions') {
                state.showAllMissions = !state.showAllMissions;
                renderHomeDashboard();
                return root.querySelector('.daily-missions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }));
        root.querySelectorAll('[data-mission-claim]').forEach(btn => btn.addEventListener('click', () => {
            void claimDailyMission(btn.dataset.missionClaim);
        }));
        root.querySelectorAll('[data-home-lb-period]').forEach(btn => btn.addEventListener('click', () => {
            state.leaderboardPeriod = btn.dataset.homeLbPeriod || 'daily';
            renderHomeDashboard();
        }));
        root.querySelectorAll('[data-home-lb]').forEach(btn => btn.addEventListener('click', () => {
            state.leaderboardTab = btn.dataset.homeLb || 'wins';
            renderHomeDashboard();
        }));
    }

    function renderDecks() {
        const grid = document.getElementById('deckGrid');
        if (!grid) return;
        // Catalog or owned decks still loading — show a spinner instead of an
        // empty grid that would imply the player has no decks.
        if (!state.options || ownedDataLoading()) {
            grid.innerHTML = `<div class="binder-loading"><span class="binder-loading-spinner" aria-hidden="true"></span><strong>Loading your decks…</strong></div>`;
            renderSavedDecks();
            return;
        }
        grid.innerHTML = (state.options?.decks || []).map(renderPremadeDeckTile).join('');
        grid.querySelectorAll('[data-preview-deck]').forEach(tile => {
            tile.addEventListener('click', () => {
                state.selectedDeckId = tile.dataset.previewDeck || '';
                openDeckPreview(tile.dataset.previewDeck);
                renderDecks();
            });
            tile.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    state.selectedDeckId = tile.dataset.previewDeck || '';
                    openDeckPreview(tile.dataset.previewDeck);
                    renderDecks();
                }
            });
        });
        renderSavedDecks();
    }

    function renderPremadeDeckTile(deck) {
        const isSelected = state.selectedDeckId === deck.id;
        const primary = deck.elements?.[0] || 'FIRE';
        const accent = elementColor(primary);
        const elementLabels = deck.elements.map(format).join(' / ');
        const visual = deckAssetForElements(deck.elements);
        const artStyle = visual?.back ? `;--deck-art:url('${visual.back}')` : '';
        return `<article class="deck-tile hub-deck-card deck-tile--clickable${isSelected ? ' is-selected' : ''}${visual ? ' has-deck-art' : ''}" data-preview-deck="${escapeAttr(deck.id)}" role="button" tabindex="0" aria-selected="${isSelected}" style="--deck-accent:${accent};--deck-bg:${deckGradient(deck.elements)}${artStyle}">
            <span class="deck-card-state">Premade</span>
            <div class="deck-card-body">
                <strong class="deck-card-name">${escapeHtml(deck.name)}</strong>
                <span class="deck-card-elements">${escapeHtml(elementLabels)}</span>
                <span class="deck-card-desc">${escapeHtml(deck.description || 'Ready-to-play battle deck.')}</span>
            </div>
        </article>`;
    }

    function renderSavedDecks() {
        const grid = document.getElementById('customDeckGrid');
        const count = document.getElementById('deckCardCount');
        if (!grid) return;
        // Signed in but saved decks haven't loaded yet — show a spinner rather
        // than "No saved custom decks yet", which would be misleading mid-load.
        if (ownedDataLoading()) {
            if (count) count.textContent = '';
            grid.innerHTML = `<div class="binder-loading"><span class="binder-loading-spinner" aria-hidden="true"></span><strong>Loading your saved decks…</strong></div>`;
            return;
        }
        const savedDecks = state.profile?.savedDecks || [];
        if (count) count.textContent = `${savedDecks.length} saved`;
        if (!state.profile?.authenticated) {
            grid.innerHTML = '<div class="unlock-card"><strong>Sign in to save custom decks</strong><span>Your deck binder will show saved custom decks after login.</span></div>';
            return;
        }
        grid.innerHTML = savedDecks.length ? savedDecks.map(renderSavedDeckTile).join('') : '<div class="unlock-card"><strong>No saved custom decks yet</strong><span>Tap Create Custom Deck to build a 30-card list from your binder.</span></div>';
        grid.querySelectorAll('[data-edit-custom-deck]').forEach(btn => btn.addEventListener('click', (event) => {
            event.stopPropagation();
            openDeckBuilder({ savedDeckId: btn.dataset.editCustomDeck });
        }));
        grid.querySelectorAll('[data-preview-saved-deck]').forEach(tile => {
            tile.addEventListener('click', () => {
                const deck = savedDecks.find(item => item.id === tile.dataset.previewSavedDeck);
                state.selectedDeckId = deck?.deckId || tile.dataset.previewSavedDeck || '';
                if (deck) openSavedDeckPreview(deck);
                renderDecks();
            });
            tile.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    const deck = savedDecks.find(item => item.id === tile.dataset.previewSavedDeck);
                    state.selectedDeckId = deck?.deckId || tile.dataset.previewSavedDeck || '';
                    if (deck) openSavedDeckPreview(deck);
                    renderDecks();
                }
            });
        });
    }

    function renderSavedDeckTile(deck) {
        const cardIds = deck.customDeckCards || [];
        const elements = [...new Set(cardIds.map(id => findCard(id)?.element).filter(Boolean))].slice(0, 4);
        const fallbackDeck = (state.options?.decks || []).find(item => item.id === deck.deckId);
        const displayElements = elements.length ? elements : (fallbackDeck?.elements || ['FIRE']);
        const isSelected = Boolean(state.selectedDeckId) && (state.selectedDeckId === deck.deckId || state.selectedDeckId === deck.id);
        const accent = elementColor(displayElements[0]);
        const visual = deckAssetForElements(displayElements);
        const artStyle = visual?.back ? `;--deck-art:url('${visual.back}')` : '';
        return `<article class="deck-tile hub-deck-card custom-saved-deck deck-tile--clickable${isSelected ? ' is-selected' : ''}${visual ? ' has-deck-art' : ''}" data-preview-saved-deck="${escapeAttr(deck.id)}" role="button" tabindex="0" aria-selected="${isSelected}" style="--deck-accent:${accent};--deck-bg:${deckGradient(displayElements)}${artStyle}">
            <span class="deck-card-state">${deck.custom ? 'Custom' : 'Saved'}</span>
            <div class="deck-card-body">
                <strong class="deck-card-name">${escapeHtml(deck.name || 'Saved Deck')}</strong>
                <span class="deck-card-elements">${displayElements.map(format).join(' / ')}</span>
                <span class="deck-card-desc">${deck.custom ? `${cardIds.length} owned cards` : escapeHtml(deck.deckName || 'Premade loadout')} / ${escapeHtml(deck.trainerName || 'SiegeKnight')}</span>
            </div>
            <div class="deck-card-actions">
                ${deck.custom ? `<button class="ghost-btn" type="button" data-edit-custom-deck="${escapeAttr(deck.id)}">Edit</button>` : ''}
            </div>
        </article>`;
    }

    function cardCountsFromIdList(cardIds) {
        const counts = {};
        (cardIds || []).forEach((cardId) => {
            if (!cardId) return;
            counts[cardId] = (counts[cardId] || 0) + 1;
        });
        return Object.entries(counts).map(([id, count]) => ({ id, count }));
    }

    function openSavedDeckPreview(deck) {
        if (!deck) return;
        if (deck.custom && (deck.customDeckCards || []).length) {
            const cardIds = deck.customDeckCards || [];
            const elements = [...new Set(cardIds.map(id => findCard(id)?.element).filter(Boolean))].slice(0, 4);
            const fallbackDeck = (state.options?.decks || []).find(item => item.id === deck.deckId);
            const displayElements = elements.length ? elements : (fallbackDeck?.elements || []);
            const cardCounts = cardCountsFromIdList(cardIds);
            showDeckPreview({
                eyebrow: 'Custom Deck',
                name: deck.name || 'Saved Deck',
                sub: `${displayElements.map(format).join(' / ')} / ${deck.trainerName || 'SiegeKnight'} / ${deckTotalCards(cardCounts)} cards`,
                cardCounts
            });
            return;
        }
        if (deck.deckId) {
            openDeckPreview(deck.deckId);
        }
    }

    function buildCountsFromCardList(cardIds) {
        return (cardIds || []).reduce((counts, cardId) => {
            if (!cardId) return counts;
            counts[cardId] = (counts[cardId] || 0) + 1;
            return counts;
        }, {});
    }

    function openDeckBuilder(options = {}) {
        if (!state.options?.cardCatalog?.length) {
            return navigateHub('decks');
        }
        if (options.reset) {
            state.builderCounts = {};
            state.builderPreviewCardId = null;
            state.editingSavedDeckId = '';
            resetBuilderVisibleLimit();
            localStorage.setItem('sieglingsBuilderDeckName', 'Custom Binder Deck');
        }
        if (options.savedDeckId) {
            const deck = (state.profile?.savedDecks || []).find(item => item.id === options.savedDeckId);
            if (deck) {
                state.builderCounts = buildCountsFromCardList(deck.customDeckCards || []);
                state.editingSavedDeckId = deck.id || '';
                if (deck.name) localStorage.setItem('sieglingsBuilderDeckName', deck.name);
                if (deck.trainerId) localStorage.setItem('sieglingsBuilderTrainerId', deck.trainerId);
                state.builderPreviewCardId = (deck.customDeckCards || [])[0] || null;
                resetBuilderVisibleLimit();
            }
        }
        navigateHub('deck-builder');
    }
    function openDeckPreview(deckId) {
        const deck = (state.options?.decks || []).find(item => item.id === deckId);
        if (!deck) return;
        const cardCounts = (deck.cards || []).filter(entry => entry && entry.id);
        showDeckPreview({
            eyebrow: 'Premade Deck',
            name: deck.name || 'Deck',
            sub: `${(deck.elements || []).map(format).join(' / ')} / ${deckTotalCards(cardCounts)} cards`,
            cardCounts
        });
    }

    function deckTotalCards(cardCounts) {
        return (cardCounts || []).reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);
    }

    function deckPreviewTypeCounts(cardCounts) {
        return (cardCounts || []).reduce((acc, entry) => {
            const card = findCard(entry.id);
            if (!card) return acc;
            const qty = Number(entry.count) || 0;
            const type = String(card.type || '').toUpperCase();
            if (type === 'SIEGLING') acc.sieglings += qty;
            else if (type === 'SPELL') acc.spells += qty;
            else if (type === 'TRAP') acc.traps += qty;
            return acc;
        }, { sieglings: 0, spells: 0, traps: 0 });
    }

    function formatDeckPreviewTypeSummary(counts) {
        const parts = [
            `${counts.sieglings} Siegelings`,
            `${counts.spells} Strategies`,
            `${counts.traps} Deceptions`
        ];
        return parts.join(' · ');
    }

    function sortDeckPreviewEntries(cardCounts) {
        return [...(cardCounts || [])]
            .map(entry => ({ entry, card: findCard(entry.id) }))
            .filter(item => item.card)
            .sort((a, b) => {
                const costA = cardEnergyCost(a.card);
                const costB = cardEnergyCost(b.card);
                if (costA !== costB) return costA - costB;
                const typeOrder = { SIEGLING: 0, SPELL: 1, TRAP: 2 };
                const typeA = typeOrder[a.card.type] ?? 3;
                const typeB = typeOrder[b.card.type] ?? 3;
                if (typeA !== typeB) return typeA - typeB;
                return (a.card.name || '').localeCompare(b.card.name || '');
            });
    }

    function renderDeckPreviewStackRow(card, count) {
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const typeLabel = [format(card.type), format(card.element)].filter(Boolean).join(' / ');
        return `<button type="button" class="deck-preview-stack-row" data-preview-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)};--cost-el:${elementColor(costElement)}">
            <span class="deck-preview-stack-cost" aria-hidden="true">${cost}</span>
            <span class="deck-preview-stack-art" aria-hidden="true">${(window.SieglingsCardBinderVisual?.renderBinderCardArt(card)) || renderBinderCardArt(card)}</span>
            <span class="deck-preview-stack-copy">
                <strong>${escapeHtml(card.name)}</strong>
                <span>${escapeHtml(typeLabel)}</span>
            </span>
            <span class="deck-preview-stack-count">x${count}</span>
        </button>`;
    }

    function focusDeckPreviewCard(cardId) {
        const grid = document.getElementById('deckPreviewGrid');
        const stack = document.getElementById('deckPreviewStack');
        grid?.querySelectorAll('[data-card-id]').forEach(tile => {
            tile.classList.toggle('preview-focused', tile.dataset.cardId === cardId);
        });
        stack?.querySelectorAll('[data-preview-card-id]').forEach(row => {
            row.classList.toggle('is-active', row.dataset.previewCardId === cardId);
        });
        const target = grid?.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const stackRow = stack?.querySelector(`[data-preview-card-id="${CSS.escape(cardId)}"]`);
        stackRow?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function showDeckPreview({ eyebrow, name, sub, cardCounts }) {
        const modal = document.getElementById('deckPreviewModal');
        const grid = document.getElementById('deckPreviewGrid');
        const stack = document.getElementById('deckPreviewStack');
        const stackTotal = document.getElementById('deckPreviewStackTotal');
        const typeCountsEl = document.getElementById('deckPreviewTypeCounts');
        const compositionEl = document.getElementById('deckPreviewComposition');
        if (!modal || !grid) return;
        const titleEl = document.getElementById('deckPreviewTitle');
        const eyebrowEl = document.getElementById('deckPreviewEyebrow');
        const subEl = document.getElementById('deckPreviewSub');
        if (eyebrowEl) eyebrowEl.textContent = eyebrow || 'Deck';
        if (titleEl) titleEl.textContent = name || 'Deck';
        if (subEl) subEl.textContent = sub || '';
        const sorted = sortDeckPreviewEntries(cardCounts);
        const total = deckTotalCards(cardCounts);
        const typeCounts = deckPreviewTypeCounts(cardCounts);
        const typeSummary = formatDeckPreviewTypeSummary(typeCounts);
        if (compositionEl) compositionEl.textContent = typeSummary;
        if (typeCountsEl) typeCountsEl.textContent = typeSummary;
        if (stackTotal) stackTotal.textContent = `${total} cards`;
        if (stack) {
            stack.innerHTML = sorted.length
                ? sorted.map(({ entry, card }) => renderDeckPreviewStackRow(card, Number(entry.count) || 1)).join('')
                : '<div class="unlock-card deck-preview-stack-empty"><strong>No cards</strong><span>This deck has no resolvable cards in the current catalog.</span></div>';
        }
        const tiles = sorted.map(({ entry, card }) => {
            const count = Number(entry.count) || 1;
            return renderCardTile(card).replace(
                '<div class="binder-card-shell">',
                `${count > 1 ? `<span class="deck-preview-count">x${count}</span>` : ''}<div class="binder-card-shell">`
            );
        }).join('');
        grid.innerHTML = tiles || '<div class="unlock-card"><strong>No cards to preview</strong><span>This deck has no resolvable cards in the current catalog.</span></div>';
        const openCardFromPreview = (cardId) => {
            state.selectedCardId = cardId;
            closeDeckPreview();
            openCardTray();
            renderDetail();
        };
        grid.querySelectorAll('[data-card-id]').forEach(tile => tile.addEventListener('click', () => openCardFromPreview(tile.dataset.cardId)));
        stack?.querySelectorAll('[data-preview-card-id]').forEach(row => row.addEventListener('click', () => focusDeckPreviewCard(row.dataset.previewCardId)));
        if (sorted.length) {
            focusDeckPreviewCard(sorted[0].card.id);
        }
        modal.classList.remove('hidden');
    }

    function closeDeckPreview() {
        document.getElementById('deckPreviewModal')?.classList.add('hidden');
    }

    function renderDeckBuilderPage() {
        if (state.route !== 'deck-builder') return;
        const lock = document.getElementById('deckBuilderLock');
        const page = document.getElementById('deckBuilderPage');
        const title = document.getElementById('deckBuilderPageTitle');
        const saveBtn = document.getElementById('saveDeckBuilderPageBtn');
        if (!page) return;
        const unlocked = Boolean(state.progression?.customDeckUnlocked);
        const builderAvailable = Boolean(state.options?.cardCatalog?.length);
        const total = builderTotal();
        const trainerId = builderTrainerId();
        const deckElements = builderDeckElements();
        const primaryElement = deckElements[0] || 'NEUTRAL';
        const catalogCards = builderCatalogCards();
        const mobileBuilder = isMobileDeckBuilderViewport();
        if (mobileBuilder && (!state.builderVisibleLimit || state.builderVisibleLimit < 1)) {
            state.builderVisibleLimit = 24;
        }
        const visibleCatalogCards = mobileBuilder
            ? catalogCards.slice(0, Math.min(state.builderVisibleLimit, catalogCards.length))
            : catalogCards;
        const hasMoreCatalogCards = mobileBuilder && visibleCatalogCards.length < catalogCards.length;
        const previewCard = resolveBuilderPreviewCard(catalogCards);
        if (previewCard) state.builderPreviewCardId = previewCard.id;
        if (title) {
            title.textContent = state.editingSavedDeckId ? 'Edit custom deck' : 'Build a custom deck';
        }
        if (saveBtn) {
            saveBtn.disabled = total < 30;
            saveBtn.textContent = state.editingSavedDeckId ? 'Update Deck' : 'Save Deck';
        }
        if (lock) {
            lock.innerHTML = unlocked
                ? '<div class="unlock-card"><strong>Custom deckbuilding unlocked</strong><span>Select cards from your binder, preview them, and add up to 3 copies each.</span></div>'
                : `<div class="unlock-card"><strong>Deck planner available</strong><span>${state.profile?.authenticated ? `${state.progression?.ownedTotal || 0}/30 owned copies. Save-ready custom decks unlock once your binder has 30 owned copies.` : 'Sign in to save decks to your binder. You can still plan and test a custom list here.'}</span></div>`;
        }
        if (!builderAvailable) {
            page.innerHTML = '<div class="unlock-card"><strong>Catalog loading</strong><span>Your binder will appear here once card data is ready.</span></div>';
            return;
        }
        page.innerHTML = `<div class="deck-builder-layout" style="--builder-accent:${elementColor(primaryElement)}">
            <section class="deck-builder-binder deck-builder-workbench">
                <div class="section-head decks-row-head">
                    <div><span class="eyebrow">Binder</span><h2>Your owned cards</h2></div>
                    <span>${mobileBuilder && catalogCards.length ? `${visibleCatalogCards.length} / ${catalogCards.length}` : `${catalogCards.length} cards`}</span>
                </div>
                <div class="deck-builder-binder-list">
                    ${catalogCards.length ? visibleCatalogCards.map(renderBuilderBinderRow).join('') : '<div class="unlock-card builder-empty">No owned cards match these filters.</div>'}
                    ${hasMoreCatalogCards ? `<button class="ghost-btn deck-builder-load-more" type="button" data-builder-load-more>Load more cards (${catalogCards.length - visibleCatalogCards.length})</button>` : ''}
                </div>
            </section>
            <section class="deck-builder-inspector deck-builder-workbench">
                <div class="section-head decks-row-head">
                    <div><span class="eyebrow">Card View</span><h2>${previewCard ? escapeHtml(previewCard.name) : 'Select a card'}</h2></div>
                </div>
                <div class="deck-builder-preview-panel">${renderBuilderPreviewPanel(previewCard)}</div>
                <div class="deck-builder-recommendations">
                    <div class="section-head decks-row-head">
                        <div><span class="eyebrow">Recommended</span><h3>Evolution tree picks</h3></div>
                    </div>
                    ${renderBuilderRecommendations(previewCard)}
                </div>
            </section>
            <aside class="deck-builder-deck-pane deck-builder-workbench">
                <div class="deck-builder-deck-head">
                    <div class="builder-total-ring${total >= 30 ? ' complete' : ''}">
                        <strong>${total}</strong><span>/30</span>
                    </div>
                    <div class="deck-builder-deck-head-copy">
                        <span class="eyebrow">Current Deck</span>
                        <p>${total < 30 ? `${30 - total} more cards needed` : 'Ready to save or play'}</p>
                        <div class="builder-progress-track"><span class="builder-progress-fill" style="width:${Math.min(100, Math.round((total / 30) * 100))}%"></span></div>
                    </div>
                </div>
                <div class="deck-builder-deck-list">${renderBuilderDeckListRows()}</div>
                <div class="builder-form-grid deck-builder-deck-form">
                    <label><span>Deck name</span><input class="search-input" id="builderDeckName" maxlength="40" value="${escapeAttr(builderDeckName())}" placeholder="Custom Binder Deck"></label>
                    <label><span>SiegeKnight</span><select class="search-input" id="builderTrainerSelect">${builderTrainerOptions(trainerId)}</select></label>
                </div>
                <div class="builder-actions-row">
                    <button class="ghost-btn" type="button" id="playCustomBtn"${total < 30 ? ' disabled' : ''}>Play Custom</button>
                    <button class="ghost-btn" type="button" id="clearBuilderBtn"${total ? '' : ' disabled'}>Clear</button>
                </div>
            </aside>
        </div>`;
        renderBuilderFilterTray(catalogCards);
        bindDeckBuilderPageEvents(page);
    }

    // Builder binder filters live in the HUD Filters tray (like the Cards
    // page) to keep the builder page compact. The controls are rendered once
    // and kept in the DOM so typing in the search box never loses focus; only
    // the count label updates on re-render.
    function renderBuilderFilterTray(catalogCards) {
        const body = document.getElementById('builderFilterBody');
        if (!body) return;
        const countLabel = document.getElementById('builderFilterCount');
        if (countLabel) countLabel.textContent = `${(catalogCards || builderCatalogCards()).length} cards`;
        if (body.dataset.ready === '1') return;
        body.dataset.ready = '1';
        body.innerHTML = `<div class="builder-catalog-tools builder-tray-tools">
            <input class="search-input" id="builderSearchInput" type="search" value="${escapeAttr(state.builderSearch)}" placeholder="Search binder cards...">
            <select class="search-input" id="builderElementSelect">
                ${['ALL', ...elementFilterValues().filter(value => value !== 'ALL')].map(value => `<option value="${escapeAttr(value)}"${value === state.builderElementFilter ? ' selected' : ''}>${value === 'ALL' ? 'All elements' : format(value)}</option>`).join('')}
            </select>
            <select class="search-input" id="builderTypeSelect">
                ${['ALL', 'SIEGLING', 'SPELL', 'TRAP'].map(value => `<option value="${escapeAttr(value)}"${value === state.builderTypeFilter ? ' selected' : ''}>${value === 'ALL' ? 'All types' : format(value)}</option>`).join('')}
            </select>
            <select class="search-input" id="builderRaritySelect">
                ${['ALL', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'].map(value => `<option value="${escapeAttr(value)}"${value === state.builderRarityFilter ? ' selected' : ''}>${value === 'ALL' ? 'All rarities' : format(value)}</option>`).join('')}
            </select>
            <select class="search-input" id="builderSortSelect">
                <option value="owned-desc"${state.builderSort === 'owned-desc' ? ' selected' : ''}>Owned first</option>
                <option value="name-asc"${state.builderSort === 'name-asc' ? ' selected' : ''}>Name</option>
                <option value="cost-asc"${state.builderSort === 'cost-asc' ? ' selected' : ''}>Cost low</option>
                <option value="rarity-desc"${state.builderSort === 'rarity-desc' ? ' selected' : ''}>Rarity high</option>
            </select>
        </div>`;
        body.querySelector('#builderSearchInput')?.addEventListener('input', (event) => {
            state.builderSearch = event.target.value.trim().toLowerCase();
            resetBuilderVisibleLimit();
            scheduleDeckBuilderPageRender();
        });
        body.querySelector('#builderElementSelect')?.addEventListener('change', (event) => {
            state.builderElementFilter = event.target.value;
            resetBuilderVisibleLimit();
            renderDeckBuilderPage();
        });
        body.querySelector('#builderTypeSelect')?.addEventListener('change', (event) => {
            state.builderTypeFilter = event.target.value;
            resetBuilderVisibleLimit();
            renderDeckBuilderPage();
        });
        body.querySelector('#builderRaritySelect')?.addEventListener('change', (event) => {
            state.builderRarityFilter = event.target.value;
            resetBuilderVisibleLimit();
            renderDeckBuilderPage();
        });
        body.querySelector('#builderSortSelect')?.addEventListener('change', (event) => {
            state.builderSort = event.target.value;
            resetBuilderVisibleLimit();
            renderDeckBuilderPage();
        });
    }

    function resolveBuilderPreviewCard(catalogCards) {
        const previewId = state.builderPreviewCardId;
        if (previewId) {
            const selected = findCard(previewId);
            if (selected) return selected;
        }
        const inDeck = Object.keys(state.builderCounts).map(id => findCard(id)).filter(Boolean);
        if (inDeck.length) return inDeck[0];
        return catalogCards[0] || null;
    }

    function evolutionLineForCard(cardId) {
        const catalog = state.options?.cardCatalog || [];
        const byId = new Map(catalog.map(card => [card.id, card]));
        const card = byId.get(cardId);
        if (!card) return [];
        const line = [card];
        let cursor = card;
        while (cursor?.evolvesFromId && byId.has(cursor.evolvesFromId)) {
            cursor = byId.get(cursor.evolvesFromId);
            line.unshift(cursor);
        }
        const descendants = [];
        const queue = [cardId];
        const seen = new Set([cardId]);
        while (queue.length) {
            const id = queue.shift();
            catalog.filter(entry => entry.evolvesFromId === id).forEach(child => {
                if (seen.has(child.id)) return;
                seen.add(child.id);
                descendants.push(child);
                queue.push(child.id);
            });
        }
        return [...line, ...descendants];
    }

    function builderRecommendationCards(cardId) {
        if (!cardId) return [];
        const line = evolutionLineForCard(cardId);
        return line.filter(card => {
            if (card.id === cardId) return false;
            const maxCopies = builderCardLimit(card.id);
            const inDeck = state.builderCounts[card.id] || 0;
            return maxCopies > 0 && inDeck < maxCopies && builderTotal() < 30;
        }).slice(0, 8);
    }

    function renderBuilderRecommendations(previewCard) {
        const recommendations = builderRecommendationCards(previewCard?.id);
        if (!previewCard) {
            return '<div class="unlock-card builder-empty">Select a card to see evolution tree recommendations.</div>';
        }
        if (!recommendations.length) {
            return '<div class="unlock-card builder-empty">No related evolution cards available to add right now.</div>';
        }
        const line = evolutionLineForCard(previewCard.id).map(card => escapeHtml(card.name)).join(' → ');
        return `<p class="deck-builder-evolution-line">${line}</p>
            <div class="deck-builder-recommendation-grid">
                ${recommendations.map(card => {
                    const inDeck = state.builderCounts[card.id] || 0;
                    const maxCopies = builderCardLimit(card.id);
                    const canAdd = inDeck < maxCopies && builderTotal() < 30;
                    return `<article class="builder-recommendation-card" style="--el:${elementColor(card.element)}">
                        <button type="button" class="builder-recommendation-main" data-select-builder-card="${escapeAttr(card.id)}">
                            <div class="builder-row-copy">
                                <strong>${escapeHtml(card.name)}</strong>
                                <span>${escapeHtml(format(card.type))} / ${escapeHtml(format(card.element))}</span>
                                <small>${card.evolvesFromId ? `Evolves from ${escapeHtml(card.evolvesFromName || findCard(card.evolvesFromId)?.name || 'base')}` : 'Base form'}</small>
                            </div>
                        </button>
                        <button class="primary-btn" type="button" data-add-builder-card="${escapeAttr(card.id)}"${canAdd ? '' : ' disabled'}>Add</button>
                    </article>`;
                }).join('')}
            </div>`;
    }

    function renderBuilderPreviewPanel(card) {
        if (!card) {
            return '<div class="unlock-card builder-empty">Tap a binder card to inspect it and add copies to your deck.</div>';
        }
        const abilities = card.abilities || (card.ability ? [card.ability] : []);
        const flavorText = creatureDescriptionFor(card);
        const inDeck = state.builderCounts[card.id] || 0;
        const maxCopies = builderCardLimit(card.id);
        const canAdd = maxCopies > 0 && inDeck < maxCopies && builderTotal() < 30;
        const addLabel = builderAddLabel(card.id);
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const cardPreview = (window.SieglingsCardBinderVisual?.renderBinderCardPreview)
            ? window.SieglingsCardBinderVisual.renderBinderCardPreview(card, {
                ownedOverride: ownedCount(card.id),
                ownedLabel: `In deck x${inDeck}`,
                previewClass: 'detail-card-preview deck-builder-detail-preview',
                descriptionText: shopCardDescriptionFor(card)
            })
            : `<div class="binder-card detail-card-preview" style="--el:${elementColor(card.element)}">${renderBinderCardShell(card)}</div>`;
        return `<div class="deck-builder-preview-card" style="--el:${elementColor(card.element)}">
            <div class="detail-card-preview-wrap">${cardPreview}</div>
            <div class="detail-cost-block">
                <span class="detail-cost-label">Energy cost</span>
                ${renderBinderCardEnergyCost(cost, costElement)}
            </div>
            ${flavorText ? `<p class="deck-builder-preview-flavor">${escapeHtml(flavorText)}</p>` : ''}
            <div class="detail-grid">
                ${card.type === 'SIEGLING' ? `<div><span>Health</span><strong>${card.health ?? '-'}</strong></div>
                <div><span>Speed</span><strong>${card.speed ?? '-'}</strong></div>
                <div><span>Evolution</span><strong>${escapeHtml(card.evolvesFromName || card.evolvesFromId || 'Base')}</strong></div>` : ''}
                ${card.type !== 'SIEGLING' ? `<div><span>Cost</span><strong>${card.costAmount ?? 0} ${format(card.costElement || card.element)}</strong></div>` : ''}
            </div>
            ${renderBuilderMoves(card)}
            ${abilities.length ? `<div class="deck-builder-preview-abilities detail-abilities">${abilities.map(a => `<div class="detail-ability-row"><strong>${escapeHtml(a.name || 'Ability')}</strong><p>${escapeHtml(a.description || '')}</p></div>`).join('')}</div>` : ''}
            <div class="builder-stepper deck-builder-preview-actions">
                <button class="ghost-btn" type="button" data-remove-card="${escapeAttr(card.id)}"${inDeck <= 0 ? ' disabled' : ''}>-</button>
                <strong>${inDeck} / ${maxCopies}</strong>
                <button class="primary-btn" type="button" data-add-builder-card="${escapeAttr(card.id)}"${canAdd ? '' : ' disabled'}>${addLabel}</button>
            </div>
        </div>`;
    }

    function builderAddLabel(cardId) {
        const inDeck = state.builderCounts[cardId] || 0;
        const maxCopies = builderCardLimit(cardId);
        if (maxCopies > 0 && inDeck >= maxCopies) return 'Max added';
        if (builderTotal() >= 30) return 'Deck full';
        return 'Add to deck';
    }

    function renderBuilderMoves(card) {
        const moves = Array.isArray(card?.moves) ? card.moves.filter(Boolean) : [];
        if (!moves.length) return '';
        return `<div class="deck-builder-preview-moves">
            <span class="builder-moves-label">Attacks</span>
            ${moves.map(move => {
                const cost = Number(move.energyCost) || 0;
                const costLabel = move.isPassive ? 'Passive' : cost > 0 ? `${cost} Energy` : 'Free';
                return `<div class="builder-move-row">
                    <div class="builder-move-head">
                        <strong>${escapeHtml(move.name || 'Attack')}</strong>
                        <span class="builder-move-cost${move.isPassive ? ' is-passive' : ''}">${costLabel}</span>
                    </div>
                    ${move.description ? `<p>${escapeHtml(move.description)}</p>` : ''}
                </div>`;
            }).join('')}
        </div>`;
    }

    function renderBuilderMobilePreviewPanel(card) {
        if (!card) {
            return '<div class="unlock-card builder-empty">Tap a binder card to inspect it and add copies to your deck.</div>';
        }
        const abilities = card.abilities || (card.ability ? [card.ability] : []);
        const flavorText = creatureDescriptionFor(card);
        const inDeck = state.builderCounts[card.id] || 0;
        const maxCopies = builderCardLimit(card.id);
        const canAdd = maxCopies > 0 && inDeck < maxCopies && builderTotal() < 30;
        const addLabel = builderAddLabel(card.id);
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        return `<div class="deck-builder-preview-card deck-builder-preview-card-compact" style="--el:${elementColor(card.element)}">
            <div class="deck-builder-compact-head">
                <div class="builder-card-mark">${renderElementIcon(card.element)}</div>
                <div>
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${escapeHtml(format(card.type))} / ${escapeHtml(format(card.element))} / ${escapeHtml(format(card.rarity))}</span>
                </div>
            </div>
            <div class="detail-cost-block">
                <span class="detail-cost-label">Energy cost</span>
                ${renderBinderCardEnergyCost(cost, costElement)}
            </div>
            ${flavorText ? `<p class="deck-builder-preview-flavor">${escapeHtml(flavorText)}</p>` : ''}
            <div class="detail-grid">
                ${card.type === 'SIEGLING' ? `<div><span>Health</span><strong>${card.health ?? '-'}</strong></div>
                <div><span>Speed</span><strong>${card.speed ?? '-'}</strong></div>
                <div><span>Evolution</span><strong>${escapeHtml(card.evolvesFromName || card.evolvesFromId || 'Base')}</strong></div>` : ''}
                ${card.type !== 'SIEGLING' ? `<div><span>Cost</span><strong>${card.costAmount ?? 0} ${format(card.costElement || card.element)}</strong></div>` : ''}
            </div>
            ${renderBuilderMoves(card)}
            ${abilities.length ? `<div class="deck-builder-preview-abilities detail-abilities">${abilities.slice(0, 2).map(a => `<div class="detail-ability-row"><strong>${escapeHtml(a.name || 'Ability')}</strong><p>${escapeHtml(a.description || '')}</p></div>`).join('')}</div>` : ''}
            <div class="builder-stepper deck-builder-preview-actions">
                <button class="ghost-btn" type="button" data-remove-card="${escapeAttr(card.id)}"${inDeck <= 0 ? ' disabled' : ''}>-</button>
                <strong>${inDeck} / ${maxCopies}</strong>
                <button class="primary-btn" type="button" data-add-builder-card="${escapeAttr(card.id)}"${canAdd ? '' : ' disabled'}>${addLabel}</button>
            </div>
        </div>`;
    }

    function renderBuilderBinderRow(card) {
        const owned = ownedCount(card.id);
        const count = state.builderCounts[card.id] || 0;
        const maxCopies = builderCardLimit(card.id);
        const total = builderTotal();
        const canAdd = maxCopies > 0 && count < maxCopies && total < 30;
        const activeClass = card.id === state.builderPreviewCardId ? ' is-active' : '';
        return `<article class="deck-builder-binder-row${activeClass}" style="--el:${elementColor(card.element)}">
            <button type="button" class="deck-builder-binder-main" data-select-builder-card="${escapeAttr(card.id)}">
                <div class="builder-card-mark">${renderElementIcon(card.element)}</div>
                <div class="builder-row-copy">
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${escapeHtml(format(card.type))} / ${escapeHtml(format(card.element))} / Owned x${owned}</span>
                    <small>${escapeHtml(format(card.rarity))}${card.evolvesFromId ? ` / Evolves from ${escapeHtml(card.evolvesFromName || findCard(card.evolvesFromId)?.name || 'base')}` : ''}</small>
                </div>
                ${count > 0 ? `<span class="deck-builder-binder-count${count >= maxCopies ? ' is-max' : ''}">In deck x${count}</span>` : ''}
            </button>
            <div class="builder-stepper">
                <button class="ghost-btn" type="button" data-remove-card="${escapeAttr(card.id)}"${count <= 0 ? ' disabled' : ''}>-</button>
                <button class="primary-btn" type="button" data-add-builder-card="${escapeAttr(card.id)}"${canAdd ? '' : ' disabled'}>+</button>
            </div>
        </article>`;
    }

    function renderBuilderDeckListRows() {
        const entries = Object.entries(state.builderCounts);
        if (!entries.length) {
            return '<div class="unlock-card builder-empty">Cards you add will appear here.</div>';
        }
        return entries.sort(([a], [b]) => (findCard(a)?.name || a).localeCompare(findCard(b)?.name || b)).map(([cardId, count]) => {
            const card = findCard(cardId);
            const maxCopies = builderCardLimit(cardId);
            const activeClass = cardId === state.builderPreviewCardId ? ' is-active' : '';
            return `<div class="deck-builder-deck-row${activeClass}" style="--el:${elementColor(card?.element)}">
                <button type="button" class="deck-builder-deck-row-main" data-select-builder-card="${escapeAttr(cardId)}">
                    <div class="builder-card-mark">${renderElementIcon(card?.element)}</div>
                    <div class="builder-row-copy">
                        <strong>${escapeHtml(card?.name || cardId)}</strong>
                        <span>${card ? `${escapeHtml(format(card.type))} / ${escapeHtml(format(card.element))}` : 'Card'}</span>
                    </div>
                    <span class="deck-builder-copy-badge${count >= maxCopies ? ' is-max' : ''}"><strong>${count}</strong>/${maxCopies}</span>
                </button>
                <div class="builder-stepper">
                    <button class="ghost-btn" type="button" data-remove-card="${escapeAttr(cardId)}">-</button>
                    <button class="ghost-btn" type="button" data-add-builder-card="${escapeAttr(cardId)}"${count >= maxCopies || builderTotal() >= 30 ? ' disabled' : ''}>+</button>
                </div>
            </div>`;
        }).join('');
    }

    function bindDeckBuilderPageEvents(root) {
        if (!root) return;
        root.querySelectorAll('[data-select-builder-card]').forEach(btn => btn.addEventListener('click', () => {
            state.builderPreviewCardId = btn.dataset.selectBuilderCard;
            renderDeckBuilderPage();
        }));
        root.querySelectorAll('[data-add-builder-card]').forEach(btn => btn.addEventListener('click', (event) => {
            event.stopPropagation();
            adjustBuilder(btn.dataset.addBuilderCard, 1);
        }));
        root.querySelectorAll('[data-remove-card]').forEach(btn => btn.addEventListener('click', (event) => {
            event.stopPropagation();
            adjustBuilder(btn.dataset.removeCard, -1);
        }));
        root.querySelector('[data-builder-load-more]')?.addEventListener('click', () => {
            state.builderVisibleLimit = Math.max(state.builderVisibleLimit || 24, 24) + 24;
            renderDeckBuilderPage();
        });
        root.querySelector('#builderTrainerSelect')?.addEventListener('change', (event) => {
            localStorage.setItem('sieglingsBuilderTrainerId', event.target.value);
        });
        root.querySelector('#builderDeckName')?.addEventListener('input', (event) => {
            localStorage.setItem('sieglingsBuilderDeckName', event.target.value);
        });
        root.querySelector('#playCustomBtn')?.addEventListener('click', () => {
            if (builderTotal() < 30) return alert('Custom decks need 30 cards.');
            goPlay({ mode: 'solo', customDeckCards: builderCards(), trainerId: builderTrainerId(), loadoutLabel: builderDeckName() });
        });
        root.querySelector('#clearBuilderBtn')?.addEventListener('click', () => {
            state.builderCounts = {};
            state.builderPreviewCardId = null;
            renderDeckBuilderPage();
        });
    }

    // Re-render the builder after a rotation/viewport change so the layout
    // re-resolves cleanly instead of keeping stale landscape sizing in portrait.
    let builderViewportTimer = 0;
    function handleBuilderViewportChange() {
        if (state.route !== 'deck-builder') return;
        window.clearTimeout(builderViewportTimer);
        builderViewportTimer = window.setTimeout(() => renderDeckBuilderPage(), 200);
    }
    window.addEventListener('resize', handleBuilderViewportChange);
    window.addEventListener('orientationchange', handleBuilderViewportChange);

    function isTrainerOwned(trainerId) {
        const trainer = (state.options?.trainers || []).find(item => item.id === trainerId);
        return trainerOwnedLevel(trainerId) > 0 || (!!trainer && trainer.owned !== false);
    }

    function firstOwnedTrainerId() {
        const owned = (state.options?.trainers || []).find(trainer => isTrainerOwned(trainer.id));
        return owned ? owned.id : (state.options?.defaultTrainerId || state.options?.trainers?.[0]?.id || '');
    }

    function builderTrainerId() {
        const saved = localStorage.getItem('sieglingsBuilderTrainerId');
        if (saved && isTrainerOwned(saved)) return saved;
        const preferred = state.options?.defaultTrainerId;
        if (preferred && isTrainerOwned(preferred)) return preferred;
        return firstOwnedTrainerId();
    }

    function builderDeckName() {
        return (localStorage.getItem('sieglingsBuilderDeckName') || 'Custom Binder Deck').slice(0, 40);
    }

    function builderTrainerOptions(selectedId) {
        return (state.options?.trainers || []).map(trainer => {
            const owned = isTrainerOwned(trainer.id);
            const level = Math.max(1, trainerOwnedLevel(trainer.id) || Number(trainer.level) || 1);
            const levelLabel = owned && level > 1 ? ` (Lv ${level})` : '';
            const lockLabel = owned ? '' : ' \u2014 Locked';
            return `<option value="${escapeAttr(trainer.id)}"${trainer.id === selectedId ? ' selected' : ''}${owned ? '' : ' disabled'}>${escapeHtml((trainer.name || trainer.id) + levelLabel + lockLabel)}</option>`;
        }).join('');
    }

    function builderCatalogCards() {
        return [...(state.options?.cardCatalog || [])]
            .filter(card => builderCardLimit(card.id) > 0)
            .filter(card => state.builderElementFilter === 'ALL' || card.element === state.builderElementFilter)
            .filter(card => state.builderTypeFilter === 'ALL' || card.type === state.builderTypeFilter)
            .filter(card => state.builderRarityFilter === 'ALL' || card.rarity === state.builderRarityFilter)
            .filter(card => {
                if (!state.builderSearch) return true;
                const text = `${card.name} ${card.type} ${card.element} ${card.rarity} ${creatureDescriptionFor(card)} ${JSON.stringify(card.abilities || [])}`.toLowerCase();
                return text.includes(state.builderSearch);
            })
            .sort((a, b) => {
                if (state.builderSort === 'name-asc') return a.name.localeCompare(b.name);
                if (state.builderSort === 'cost-asc') return cardEnergyCost(a) - cardEnergyCost(b) || a.name.localeCompare(b.name);
                if (state.builderSort === 'rarity-desc') return (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
                return ownedCount(b.id) - ownedCount(a.id) || a.name.localeCompare(b.name);
            });
    }

    function shopTitleOffers() {
        const unlocked = new Set((state.progression?.playerTitles || []).filter(title => title.unlocked).map(title => title.id));
        return (state.titleCatalog || [])
            .filter(title => title.source === 'SHOP')
            .map(title => ({ ...title, unlocked: unlocked.has(title.id) || Boolean(title.unlocked) }));
    }

    function renderShop() {
        const grid = document.getElementById('shopPackGrid');
        if (!grid) return;
        const starterMode = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
        const starterPacks = state.packs.filter(pack => pack.starterEligible);
        const packs = starterMode ? starterPacks : state.packs;
        const dailyOffers = starterMode ? [] : state.dailyOffers;
        const shopTitles = shopTitleOffers();
        if (dailyOffers.length && !dailyOffers.some(offer => offer.cardId === state.shopPreviewCardId)) {
            state.shopPreviewCardId = dailyOffers[0].cardId;
        }
        grid.innerHTML = `
            ${dailyOffers.length ? `<div class="shop-row-head"><div><span class="eyebrow">Daily Rotation</span><h2>Five cards today</h2></div><span>Refreshes daily</span></div><div class="daily-offer-grid">${dailyOffers.map(renderDailyOfferTile).join('')}</div>` : ''}
            ${shopTitles.length && !starterMode ? `<div class="shop-row-head"><div><span class="eyebrow">Profile Flair</span><h2>Player titles</h2></div><span>Unlock by playing or buy with Siegecoins</span></div><div class="shop-title-grid">${shopTitles.map(renderShopTitleTile).join('')}</div>` : ''}
            <div class="shop-row-head"><div><span class="eyebrow">${starterMode ? 'Starter Pack' : 'Packs'}</span><h2>${starterMode ? 'Choose your first pack' : 'Elemental and type pulls'}</h2></div></div>
            ${packs.length ? packs.map(renderPackTile).join('') : '<div class="unlock-card"><strong>No packs available</strong><span>Pack groups will appear here once the catalog loads.</span></div>'}
        `;
        document.getElementById('shopGoldLabel').innerHTML = renderCoinAmount(state.progression?.gold || 0);
        renderShopCardPreviewModal();
        renderHudTools();
    }

    // Heraldic banner + star — the shared "profile flair / player title" emblem.
    function titleFlairIcon() {
        return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M6 3h12a1 1 0 0 1 1 1v15.6a.6.6 0 0 1-.95.49L12 16.3l-6.05 3.79A.6.6 0 0 1 5 19.6V4a1 1 0 0 1 1-1Z" fill="currentColor" opacity="0.16"/>
            <path d="M6 3h12a1 1 0 0 1 1 1v15.6a.6.6 0 0 1-.95.49L12 16.3l-6.05 3.79A.6.6 0 0 1 5 19.6V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="m12 6.4 1.32 2.67 2.95.43-2.14 2.08.51 2.94L12 15.66l-2.64 1.39.5-2.94-2.13-2.08 2.95-.43L12 6.4Z" fill="currentColor"/>
        </svg>`;
    }

    function renderShopTitleTile(title) {
        const unlocked = Boolean(title.unlocked);
        const price = Number(title.shopPrice) || 0;
        return `<article class="shop-title-tile">
            <span class="shop-title-icon">${titleFlairIcon()}</span>
            <div class="shop-title-copy">
                <span class="shop-title-kicker">${escapeHtml(title.source || 'SHOP')}</span>
                <strong>${escapeHtml(title.label || 'Title')}</strong>
                <p>${escapeHtml(title.description || '')}</p>
            </div>
            <button class="primary-btn" type="button" data-purchase-title-id="${escapeAttr(title.id)}"${unlocked ? ' disabled' : ''}>${unlocked ? 'Owned' : renderCoinAmount(price, '')}</button>
        </article>`;
    }

    async function purchasePlayerTitle(titleId) {
        if (!state.profile?.authenticated) return openAuth();
        const data = await fetchJson('/api/shop/purchase-title', { method: 'POST', body: JSON.stringify({ titleId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        state.titleCatalog = data.titleCatalog || state.titleCatalog;
        renderShop();
        renderGold();
        renderProfile();
    }

    function dailyOfferCard(offer) {
        // SiegeKnight offers resolve from the trainer catalog (knights aren't in
        // the binder card catalog) and render through the knight preview path.
        if (offer.type === 'TRAINER' || offer.type === 'SIEGEKNIGHT') {
            const knight = siegeknightBinderCards().find(entry => entry.id === offer.cardId);
            if (knight) {
                return { ...knight, type: 'SIEGEKNIGHT', rarity: offer.rarity || knight.rarity || 'RARE' };
            }
        }
        const catalogCard = findCard(offer.cardId) || {};
        return {
            ...catalogCard,
            id: offer.cardId,
            name: offer.cardName || catalogCard.name,
            type: offer.type || catalogCard.type,
            element: offer.element || catalogCard.element || 'FIRE',
            rarity: offer.rarity || catalogCard.rarity || 'COMMON',
            notches: catalogCard.notches || [],
            abilities: catalogCard.abilities || (catalogCard.ability ? [catalogCard.ability] : [])
        };
    }

    function selectedShopPreviewCard() {
        const offers = state.dailyOffers || [];
        const offer = offers.find(item => item.cardId === state.shopPreviewCardId) || offers[0];
        return offer ? dailyOfferCard(offer) : null;
    }

    function renderDailyOfferTile(offer) {
        const card = dailyOfferCard(offer);
        const purchased = state.progression?.purchasedDailyOfferIds?.includes(offer.id);
        const owned = ownedCount(card.id);
        const selected = card.id === state.shopPreviewCardId ? ' is-previewed' : '';
        return `<article class="daily-offer-tile${selected}" style="--el:${elementColor(card.element)};--rarity:${rarityColor(card.rarity)}">
            ${renderDailyOfferCardPreview(card, owned)}
            <button class="primary-btn" type="button" data-daily-offer-id="${escapeAttr(offer.id)}" ${purchased ? 'disabled' : ''}>${purchased ? 'Purchased' : renderCoinAmount(offer.price, '')}</button>
        </article>`;
    }

    function renderDailyOfferCardPreview(card, owned) {
        const binderVisual = window.SieglingsCardBinderVisual;
        if (card.type === 'SIEGEKNIGHT') {
            return `<button class="daily-card-preview card-tile binder-card framed-binder-tile knight-binder-tile" type="button" data-shop-preview-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}" aria-label="View ${escapeAttr(card.name || 'daily card')} details">
                ${renderKnightBinderCard(card, { compact: true })}
            </button>`;
        }
        if (binderVisual?.usesFullCardArt?.(card)) {
            return `<button class="daily-card-preview card-tile binder-card framed-binder-tile" type="button" data-shop-preview-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}" aria-label="View ${escapeAttr(card.name || 'daily card')} details">
                ${binderVisual.renderBinderCardTile(card, {
                    ownedOverride: owned,
                    descriptionText: shopCardDescriptionFor(card)
                })}
            </button>`;
        }
        if (binderVisual?.usesFramedCardTemplate?.(card)) {
            return `<button class="daily-card-preview card-tile binder-card framed-binder-tile" type="button" data-shop-preview-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}" aria-label="View ${escapeAttr(card.name || 'daily card')} details">
                ${binderVisual.renderBinderCardTile(card, {
                    ownedOverride: owned,
                    descriptionText: shopCardDescriptionFor(card)
                })}
            </button>`;
        }
        const modeClass = binderVisual?.resolveArtModeClass(card) || '';
        return `<button class="daily-card-preview card-tile binder-card${modeClass}" type="button" data-shop-preview-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}" aria-label="View ${escapeAttr(card.name || 'daily card')} details">
            ${binderVisual?.renderBinderCardShell
                ? binderVisual.renderBinderCardShell(card, { ownedOverride: owned, descriptionText: shopCardDescriptionFor(card) })
                : renderBinderCardShell(card)}
        </button>`;
    }

    function openShopCardPreview(cardId = '') {
        const fallback = selectedShopPreviewCard();
        const nextCardId = cardId || state.shopPreviewCardId || fallback?.id || '';
        if (!nextCardId) return;
        state.shopPreviewCardId = nextCardId;
        state.shopCardPreviewOpen = true;
        renderShop();
    }

    function closeShopCardPreview() {
        state.shopCardPreviewOpen = false;
        renderShopCardPreviewModal();
        renderHudTools();
    }

    function renderShopCardPreviewModal() {
        const modal = document.getElementById('shopCardPreviewModal');
        const body = document.getElementById('shopCardPreviewBody');
        if (!modal || !body) return;
        const card = selectedShopPreviewCard();
        modal.classList.toggle('hidden', !state.shopCardPreviewOpen || !card);
        if (!state.shopCardPreviewOpen || !card) {
            body.innerHTML = '';
            return;
        }
        const isSiegeknight = card.type === 'SIEGEKNIGHT';
        const abilities = card.abilities || (card.ability ? [card.ability] : []);
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const owned = ownedCount(card.id);
        const cardPreview = isSiegeknight
            ? `<div class="knight-detail-preview">${renderKnightBinderCard(card)}</div>`
            : window.SieglingsCardBinderVisual?.renderBinderCardPreview
            ? window.SieglingsCardBinderVisual.renderBinderCardPreview(card, {
                ownedOverride: owned,
                previewClass: 'detail-card-preview shop-card-preview-card',
                compactAbilityLimit: 3,
                summaryMode: 'description',
                descriptionText: shopCardDescriptionFor(card)
            })
            : `<div class="binder-card detail-card-preview" style="--el:${elementColor(card.element)}">${renderBinderCardShell(card)}</div>`;
        body.innerHTML = `
            <div class="shop-card-preview-head">
                <div>
                    <span class="eyebrow">${escapeHtml(format(card.rarity || 'Common'))}</span>
                    <h2 id="shopCardPreviewTitle">${escapeHtml(card.name || 'Daily Card')}</h2>
                    <span>${escapeHtml(format(card.type || 'Card'))} / ${escapeHtml(format(card.element || 'Neutral'))} / Owned x${owned}</span>
                </div>
            </div>
            <div class="shop-card-preview-layout">
                <div class="detail-card-preview-wrap">${cardPreview}</div>
                <div class="shop-card-preview-details">
                    ${isSiegeknight ? '' : `<div class="chip-wrap detail-chip-wrap">${renderActiveNotchChips(card.notches)}</div>
                    <div class="detail-cost-block">
                        <span class="detail-cost-label">Energy cost</span>
                        ${renderBinderCardEnergyCost(cost, costElement)}
                    </div>`}
                    <div class="detail-grid">
                        ${isSiegeknight ? `<div><span>Tier</span><strong>${escapeHtml(card.tier || 'SiegeKnight')}</strong></div>
                        <div><span>Element</span><strong>${format(card.element)}</strong></div>
                        <div><span>Level</span><strong>${Math.max(1, trainerOwnedLevel(card.id) || card.level || 1)}</strong></div>` : ''}
                        ${card.type === 'SIEGLING' ? `<div><span>Health</span><strong>${card.health ?? '-'}</strong></div>
                        <div><span>Speed</span><strong>${card.speed ?? '-'}</strong></div>
                        <div><span>Row</span><strong>${format(card.preferredRow || '-')}</strong></div>
                        <div><span>Evolution</span><strong>${escapeHtml(card.evolvesFromName || card.evolvesFromId || 'Base')}</strong></div>` : ''}
                        ${!isSiegeknight && card.type !== 'SIEGLING' ? `<div><span>Cost</span><strong>${cost} ${format(costElement)}</strong></div>
                        <div><span>Reaction</span><strong>${format(card.requiredReaction || 'None')}</strong></div>
                        <div><span>Row</span><strong>${format(card.preferredRow || 'Any')}</strong></div>` : ''}
                    </div>
                    <div class="detail-flavor" style="--el:${elementColor(card.element)}">
                        <span>Card text</span>
                        <p>${escapeHtml(shopCardDescriptionFor(card))}</p>
                    </div>
                    <h3 class="detail-section-title">${isSiegeknight ? 'SiegeKnight abilities' : 'Moves &amp; card details'}</h3>
                    <div class="detail-abilities">
                        ${abilities.length ? abilities.map(a => `<div class="detail-ability-row"><strong>${escapeHtml(a.name || 'Ability')}</strong><p>${escapeHtml(a.description || '')}</p></div>`).join('') : '<p class="detail-ability-empty">No printed ability.</p>'}
                    </div>
                </div>
            </div>`;
    }

    function renderBinderCardEnergyCost(cost, element) {
        const amount = Number(cost);
        if (!Number.isFinite(amount) || amount <= 0) {
            return '<div class="binder-card-cost binder-card-cost-empty">No energy cost</div>';
        }
        const normalized = String(element || 'NEUTRAL').toLowerCase();
        const label = format(element || 'NEUTRAL');
        const tokensToDraw = Math.min(amount, 12);
        const tokenStyle = notchIconStyle(element || 'NEUTRAL');
        const token = `<span class="energy-token notch-token token-${escapeAttr(normalized)}" style="${tokenStyle}"></span>`;
        let rows = '';
        for (let drawn = 0; drawn < tokensToDraw; drawn += 6) {
            const lineCount = Math.min(6, tokensToDraw - drawn);
            rows += `<span class="binder-card-cost-emblems-row">${token.repeat(lineCount)}</span>`;
        }
        const overflow = amount > tokensToDraw ? `<span class="binder-card-cost-count">+${amount - tokensToDraw}</span>` : '';
        return `<div class="binder-card-cost binder-card-cost-emblems" aria-label="Cost ${amount} ${escapeAttr(label)} energy">
            ${rows}${overflow}
        </div>`;
    }

    function renderShopCardStats(card) {
        const type = String(card?.type || '').toUpperCase();
        if (type === 'SIEGLING') {
            const hp = card.health ?? card.hp ?? '-';
            const speed = card.speed ?? card.spd ?? '-';
            return `<div class="binder-card-stats"><span>HP:${escapeHtml(hp)}</span><span>SPD:${escapeHtml(speed)}</span></div>`;
        }
        if (type === 'SPELL') {
            const reaction = format(card.requiredReaction || 'None');
            const row = card.preferredRow ? format(card.preferredRow) : 'Any row';
            return `<div class="binder-card-stats shop-card-stats-alt"><span>${escapeHtml(reaction)}</span><span>${escapeHtml(row)}</span></div>`;
        }
        if (type === 'TRAP') {
            const reaction = format(card.requiredReaction || 'Trigger');
            const bucket = card.trapBucketAmount
                ? `${card.trapBucketAmount} ${format(card.trapBucketElement || card.element)}`
                : 'Deception set';
            return `<div class="binder-card-stats shop-card-stats-alt"><span>${escapeHtml(reaction)}</span><span>${escapeHtml(bucket)}</span></div>`;
        }
        if (type === 'SIEGEKNIGHT') {
            const level = Math.max(1, trainerOwnedLevel(card.id) || card.level || 1);
            const tier = card.tier || 'SiegeKnight';
            return `<div class="binder-card-stats shop-card-stats-alt"><span>Lv ${level}</span><span>${escapeHtml(tier)}</span></div>`;
        }
        return `<div class="binder-card-stats shop-card-stats-alt"><span>${escapeHtml(format(card.type || 'Card'))}</span><span>${escapeHtml(format(card.element || 'Neutral'))}</span></div>`;
    }

    function shopCardDescriptionFor(card) {
        const flavor = creatureDescriptionFor(card);
        if (flavor && flavor !== 'Description coming soon.') return flavor;
        const abilities = card?.abilities || (card?.ability ? [card.ability] : []);
        const primary = abilities[0];
        if (primary?.description) return polishFlavorText(primary.description);
        if (primary?.name) return primary.name;
        return flavor;
    }

    function renderShopCardDescription(card) {
        const description = shopCardDescriptionFor(card);
        return `<div class="binder-card-description shop-card-description" title="${escapeAttr(description)}">${escapeHtml(description)}</div>`;
    }

    function renderShopCardAbilityLine(card) {
        if (card?.type === 'SIEGEKNIGHT') {
            return trainerOwnedLevel(card.id) > 0 ? renderTrainerXpBar(card.id) : '';
        }
        const abilities = card?.abilities || (card?.ability ? [card.ability] : []);
        const primary = abilities[0];
        if (!primary?.name) return '';
        return `<div class="shop-card-ability">${escapeHtml(primary.name)}</div>`;
    }

    function renderPackTile(pack) {
        const starterMode = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
        const openingThisPack = state.packOpeningPending?.packId === pack.id;
        const openingAnyPack = Boolean(state.packOpeningPending);
        const isStarterChoice = starterMode && pack.starterEligible;
        const primaryElement = pack.elements?.[0] || 'FIRE';
        const image = packImageFor(pack);
        const imageStyle = image ? `--pack-art-image:url('${escapeAttr(image)}');` : '';
        const kicker = pack.starterEligible ? (starterMode ? 'Starter Pack' : 'Element Pack') : 'Pack Group';
        const displayName = pack.starterEligible && !starterMode
            ? `${format(primaryElement)} Element Pack`
            : pack.name;
        // Starter picks and in-progress opens stay a single button. Otherwise show a
        // single pull plus a discounted x10 bundle.
        let actions;
        if (openingThisPack) {
            actions = `<button class="primary-btn" type="button" disabled>Opening...</button>`;
        } else if (isStarterChoice) {
            actions = `<button class="primary-btn" type="button" data-pack-id="${escapeAttr(pack.id)}"${openingAnyPack ? ' disabled' : ''}>Choose Starter</button>`;
        } else {
            const bulkCost = bulkPackCost(pack.price, BULK_PACK_COUNT);
            actions = `<div class="pack-buy-actions">
                <button class="primary-btn pack-buy-btn" type="button" data-pack-id="${escapeAttr(pack.id)}" data-pack-count="1"${openingAnyPack ? ' disabled' : ''}><span class="pack-buy-qty">x1</span>${renderCoinAmount(pack.price, '')}</button>
                <button class="ghost-btn pack-buy-btn pack-buy-bulk" type="button" data-pack-id="${escapeAttr(pack.id)}" data-pack-count="${BULK_PACK_COUNT}"${openingAnyPack ? ' disabled' : ''} title="${BULK_PACK_COUNT} pulls, ${Math.round(BULK_PACK_DISCOUNT * 100)}% off"><span class="pack-buy-qty">x${BULK_PACK_COUNT}</span>${renderCoinAmount(bulkCost, '')}</button>
            </div>`;
        }
        return `<article class="pack-tile ${image ? 'pack-tile-art' : ''}" style="--el:${elementColor(primaryElement)}">
            <button class="pack-odds-btn" type="button" data-pack-odds="${escapeAttr(pack.id)}" aria-label="Drop rates for ${escapeAttr(displayName)}" title="Drop rates">i</button>
            <div class="pack-art" style="${imageStyle}"></div>
            <div class="pack-info">
                <span class="pack-kicker">${kicker}</span>
                <strong>${escapeHtml(displayName)}</strong>
                <span>${pack.elements.map(format).join(' / ')}</span>
                <span>${escapeHtml(formatGameText(pack.description || ''))}</span>
                ${actions}
            </div>
        </article>`;
    }

    // Mirrors PackCatalogService odds so the modal still works when the
    // cached /api/shop/packs payload predates the odds field.
    const FALLBACK_PACK_ODDS = {
        siegeKnight: 0.03,
        cardsPerPack: 5,
        holoPerCard: { COMMON: 0.08, UNCOMMON: 0.06, RARE: 0.04, EPIC: 0.02, LEGENDARY: 0.01 }
    };

    function showPackOdds(packId) {
        const pack = (state.packs || []).find(item => item.id === packId);
        if (!pack) return;
        const odds = pack.odds || {
            ...FALLBACK_PACK_ODDS,
            siegeKnight: pack.id === 'pack_siegeknight' ? 1 : FALLBACK_PACK_ODDS.siegeKnight
        };
        const holo = odds.holoPerCard || FALLBACK_PACK_ODDS.holoPerCard;
        const pct = value => `${Math.round(Number(value || 0) * 1000) / 10}%`;
        const knightLine = Number(odds.siegeKnight) >= 1 ? 'Guaranteed' : pct(odds.siegeKnight);
        const overlay = document.createElement('div');
        overlay.className = 'pack-odds-modal';
        overlay.innerHTML = `<div class="pack-odds-panel panel">
            <div class="section-head">
                <div><span class="eyebrow">Drop Rates</span><h2>${escapeHtml(pack.name)}</h2></div>
                <button class="ghost-btn compact-btn" type="button" data-odds-close>Close</button>
            </div>
            <p class="pack-odds-note">Every pack contains ${odds.cardsPerPack || 5} cards.</p>
            <div class="pack-odds-row"><span>Bonus SiegeKnight</span><strong>${knightLine}</strong></div>
            <p class="pack-odds-note">Holographic finish chance, rolled separately for each card pulled. Rarer cards are rarer holos:</p>
            ${['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'].map(rarity => `<div class="pack-odds-row"><span>${format(rarity)} holo</span><strong>${pct(holo[rarity])}</strong></div>`).join('')}
        </div>`;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-odds-close]')) overlay.remove();
        });
        document.body.appendChild(overlay);
    }

    function packImageFor(pack) {
        const element = String(pack.elements?.[0] || '').toUpperCase();
        const images = {
            FIRE: '/img/packs/starter-fire.jpg',
            EARTH: '/img/packs/starter-earth.jpg',
            WIND: '/img/packs/starter-wind.jpg',
            ICE: '/img/packs/starter-ice.jpg',
            pack_siegeling_random: '/img/packs/siegeling-back.png',
            pack_spell_random: '/img/packs/spell-card-back.png',
            pack_trap_random: '/img/packs/trap-card-back.png',
            pack_siegeknight: SIEGEKNIGHT_CARD_BACK
        };
        const path = images[pack.id] || (pack.starterEligible ? images[element] : '');
        return versionedPackAsset(path);
    }

    function packBackForElement(element, packId = '') {
        const special = {
            pack_siegeling_random: '/img/packs/siegeling-back.png',
            pack_spell_random: '/img/packs/spell-card-back.png',
            pack_trap_random: '/img/packs/trap-card-back.png',
            pack_siegeknight: SIEGEKNIGHT_CARD_BACK
        };
        const specialPath = special[packId];
        if (specialPath) return `url('${versionedPackAsset(specialPath)}')`;
        const images = {
            FIRE: '/img/packs/starter-fire.jpg',
            EARTH: '/img/packs/starter-earth.jpg',
            WIND: '/img/packs/starter-wind.jpg',
            ICE: '/img/packs/starter-ice.jpg'
        };
        const starterPath = images[String(element || '').toUpperCase()];
        if (starterPath) return `url('${versionedPackAsset(starterPath)}')`;
        return "linear-gradient(145deg, #1b2238, #070a12)";
    }

    function renderRooms() {
        const list = document.getElementById('roomList');
        if (!list) return;
        const rooms = filteredRooms();
        const totalOpen = state.rooms.filter(room => !isRoomFull(room)).length;
        const roomOpen = document.getElementById('roomOpenLabel');
        const lobbyFilterOpen = document.getElementById('lobbyFilterOpenLabel');
        const shownCount = document.getElementById('roomShownLabel');
        const quickJoinBtn = document.getElementById('quickJoinBtn');
        const openLabel = `${totalOpen} open`;
        if (roomOpen) roomOpen.textContent = openLabel;
        if (lobbyFilterOpen) lobbyFilterOpen.textContent = openLabel;
        if (shownCount) shownCount.textContent = `${rooms.length} shown`;
        if (quickJoinBtn) quickJoinBtn.disabled = !rooms.some(room => !isRoomFull(room));
        renderSocialActiveLobby();

        list.innerHTML = rooms.length ? rooms.map(room => renderRoomTile(room)).join('') : `<div class="social-empty-state">
            <strong>No open 1v1 lobbies match your filters</strong>
            <span>Create a table and your lobby will appear here for other players.</span>
            <button class="primary-btn" type="button" data-create-empty-lobby>Create Lobby</button>
        </div>`;
        list.querySelectorAll('[data-room-action]').forEach(btn => btn.addEventListener('click', () => {
            const roomId = btn.dataset.roomId;
            if (!roomId) return;
            if (btn.dataset.roomAction === 'join') {
                openLobbyWaitingRoom(roomId);
                return;
            }
            openLobbyWaitingRoom(roomId);
        }));
        list.querySelector('[data-create-empty-lobby]')?.addEventListener('click', createLobbyFromHome);
    }

    function renderRoomTile(room) {
        const element = inferRoomElement(room);
        const color = elementColor(element);
        const full = isRoomFull(room);
        const ownLobby = isOwnLobby(room);
        const playerCount = Number(room.playerCount || room.players?.length || 1);
        const roomId = escapeAttr(room.roomId || '');
        const expiresLabel = formatLobbyExpiry(room.expiresAt);
        const title = ownLobby ? 'My Arena' : escapeHtml(room.name || `${room.hostName || 'Host'}'s Arena`);
        const actionLabel = ownLobby ? 'Open' : (full ? 'Full' : 'Join');
        const action = ownLobby ? 'open' : 'join';
        return `<article class="room-tile social-room-tile${ownLobby ? ' is-own-lobby' : ''}" style="--room-el:${color}">
            <div class="room-emblem" aria-hidden="true">${renderRoomEmblem(element)}</div>
            <div class="room-copy">
                <div class="room-title-line">
                    <span class="room-badge">${escapeHtml(room.format || 'PVP')}</span>
                    ${ownLobby ? '<span class="room-own-badge">Your table</span>' : ''}
                    <strong>${title}</strong>
                </div>
                <span>${escapeHtml(format(element))} table / Best of 1</span>
                <span>${ownLobby ? 'You are hosting' : `Hosted by ${escapeHtml(room.hostName || 'Host')}`} / Code ${escapeHtml(room.roomId || '----')}</span>
                ${expiresLabel ? `<span class="room-expiry">${escapeHtml(expiresLabel)}</span>` : ''}
            </div>
            <div class="room-seat-count"><strong>${playerCount} / 2</strong><span>Players</span></div>
            <button class="${ownLobby || !full ? 'primary-btn' : 'ghost-btn'}" type="button" data-room-id="${roomId}" data-room-action="${action}" ${!ownLobby && full ? 'disabled' : ''}>${actionLabel}</button>
        </article>`;
    }

    function filteredRooms() {
        const query = state.roomSearch;
        const formatFilter = state.roomFormatFilter;
        const elementFilter = state.roomElementFilter;
        return [...state.rooms]
            .filter(room => {
                const element = inferRoomElement(room);
                const haystack = [
                    room.roomId,
                    room.name,
                    room.hostName,
                    room.format,
                    room.status,
                    element
                ].join(' ').toLowerCase();
                if (query && !haystack.includes(query)) return false;
                if (formatFilter !== 'ALL' && !String(room.format || 'PVP').toUpperCase().includes(formatFilter)) return false;
                if (elementFilter !== 'ALL' && element !== elementFilter) return false;
                if (state.roomHideFull && isRoomFull(room)) return false;
                return true;
            })
            .sort((a, b) => {
                if (state.roomSort === 'host') return String(a.hostName || '').localeCompare(String(b.hostName || ''));
                if (state.roomSort === 'players') return Number(b.playerCount || 1) - Number(a.playerCount || 1);
                return String(b.createdAt || b.roomId || '').localeCompare(String(a.createdAt || a.roomId || ''));
            });
    }

    function inferRoomElement(room) {
        const raw = String(room.element || room.requiredElement || room.deckElement || room.elementFilter || room.format || '').toUpperCase();
        return Object.keys(ELEMENT_COLORS).find(element => raw.includes(element)) || 'FIRE';
    }

    function isRoomFull(room) {
        return Number(room.playerCount || room.players?.length || 1) >= 2 || String(room.status || '').toUpperCase() === 'FULL';
    }

    function renderRoomEmblem(element) {
        const icon = elementIconPath(element);
        if (icon) return `<img src="${escapeAttr(icon)}" alt="" aria-hidden="true">`;
        return `<span>${escapeHtml(format(element).slice(0, 1) || 'S')}</span>`;
    }

    function renderSocialActiveLobby() {
        const card = document.getElementById('socialActiveLobby');
        if (!card) return;
        const hostLobby = readHostLobby();
        const name = profileDisplayName();
        const deck = selectedDeckId();
        const shareUrl = hostLobby?.shareUrl || buildSocialRoomShareUrl(hostLobby?.roomId);
        const status = state.hostLobbyStatus;
        const guestWaiting = hostLobby?.roomId && !status?.started;
        if (hostLobby?.roomId) {
            const expiresLabel = formatLobbyExpiry(hostLobby.expiresAt);
            const statusLine = status?.started
                ? 'Match started — opening Play'
                : status?.guestJoined
                    ? 'Opponent in waiting room — confirm loadouts to start'
                    : 'Waiting for an opponent on this invite link';
            card.innerHTML = `<div class="social-active-content">
                <div>
                    <span class="eyebrow">Your Active Lobby</span>
                    <h2>My Arena</h2>
                    <span>Room code <strong>${escapeHtml(hostLobby.roomId)}</strong></span>
                    <span>Deck ready: ${escapeHtml(deck || 'Starter Deck')}</span>
                    ${expiresLabel ? `<span>${escapeHtml(expiresLabel)}</span>` : ''}
                    ${shareUrl ? `<span class="social-invite-url">Invite: <a href="${escapeAttr(shareUrl)}">${escapeHtml(shareUrl)}</a></span>` : ''}
                    <span>${escapeHtml(statusLine)}</span>
                </div>
                <div class="social-active-status"><strong>${status?.guestJoined ? '2' : '1'} / 2</strong><span>${guestWaiting ? 'Share the invite link' : 'Battle ready'}</span></div>
                <div class="friend-actions">
                    <button class="primary-btn" id="activeLobbyOpenBtn" type="button">Open Waiting Room</button>
                    ${shareUrl ? '<button class="ghost-btn" id="activeLobbyCopyBtn" type="button">Copy Invite Link</button>' : ''}
                    <button class="ghost-btn" id="activeLobbyCloseBtn" type="button">Close Lobby</button>
                </div>
            </div>`;
            document.getElementById('activeLobbyOpenBtn')?.addEventListener('click', () => openLobbyWaitingRoom(hostLobby.roomId));
            document.getElementById('activeLobbyCopyBtn')?.addEventListener('click', () => copyLobbyInvite(shareUrl));
            document.getElementById('activeLobbyCloseBtn')?.addEventListener('click', () => closeHostLobby(hostLobby));
            return;
        }
        card.innerHTML = `<div class="social-active-content">
            <div>
                <span class="eyebrow">Your Active Lobby</span>
                <h2>My Arena</h2>
                <span>Deck ready: ${escapeHtml(deck || 'Starter Deck')}</span>
                <span class="social-muted-inline">Lobbies live on Social. When someone joins, Play opens for both players.</span>
            </div>
            <div class="social-active-status"><strong>0 / 2</strong><span>No open table yet</span></div>
            <button class="primary-btn" id="activeLobbyCreateBtn" type="button" ${state.lobbyBusy ? 'disabled' : ''}>${state.lobbyBusy ? 'Creating...' : 'Start Hosting'}</button>
        </div>`;
        document.getElementById('activeLobbyCreateBtn')?.addEventListener('click', createLobbyFromHome);
    }

    function renderFriends() {
        const list = document.getElementById('friendList');
        const count = document.getElementById('friendCountLabel');
        const message = document.getElementById('friendMessage');
        if (!list) return;

        const friends = state.profile?.friends || [];
        const visibleFriends = friends.filter(friend => {
            const text = `${friend.displayName || ''} ${friend.email || ''}`.toLowerCase();
            return !state.friendSearch || text.includes(state.friendSearch);
        });
        if (count) count.textContent = `${friends.length} friend${friends.length === 1 ? '' : 's'}`;
        if (message) {
            message.textContent = state.friendMessage || '';
            message.className = `friend-message ${state.friendMessageType || ''}`.trim();
        }

        if (!state.profile?.authenticated) {
            list.innerHTML = `<div class="social-empty-state"><strong>Sign in to add friends</strong><span>Friends are saved to your account and added by email.</span><button class="primary-btn" type="button" id="socialSignInBtn">Sign In</button></div>`;
            document.getElementById('socialSignInBtn')?.addEventListener('click', openAuth);
            return;
        }

        list.innerHTML = visibleFriends.length
            ? visibleFriends.map(friend => {
                const presence = friendPresenceRow(friend);
                const prefs = presence.profileSettings || {};
                const displayName = resolveFriendDisplayName(friend, presence);
                const online = Boolean(presence.presence?.online);
                const status = presence.presence?.status || 'OFFLINE';
                const lastSeenAt = presence.presence?.lastSeenAt;
                // Online: show live status. Offline: show when they last logged
                // in plus how long ago that was.
                const ago = timeAgoLabel(lastSeenAt);
                const statusLabel = online
                    ? status.replace('_', ' ')
                    : (lastSeenAt ? `Last seen ${formatDateTime(lastSeenAt)}${ago ? ` · ${ago}` : ''}` : 'Offline');
                const email = String(friend.email || '').trim();
                const showEmail = email && displayName.toLowerCase() !== email.toLowerCase();
                const subtitle = showEmail ? `${email} · ${statusLabel}` : statusLabel;
                return `<article class="friend-tile social-friend-tile">
                <div class="friend-avatar-wrap">
                    ${renderPlayerAvatar({
                        displayName,
                        avatarMode: prefs.avatarMode,
                        avatar: prefs.avatar,
                        avatarUrl: prefs.avatarUrl,
                        favoriteElement: prefs.favoriteElement
                    }, 'friend-avatar')}
                    <span class="presence-dot ${online ? (status === 'IN_GAME' ? 'in-game' : 'online') : ''}" title="${escapeHtml(status)}"></span>
                </div>
                <div class="friend-copy">
                    <a class="profile-friend-link friend-name-link" href="${escapeAttr(playerProfilePath(friend.userId || friend.email))}" data-player-profile="${escapeAttr(friend.userId || friend.email)}"><strong>${escapeHtml(displayName)}</strong></a>
                    <span>${escapeHtml(subtitle)}</span>
                </div>
                <div class="friend-actions">
                    <button class="ghost-btn compact-btn friend-message-btn${friendHasUnread(friend.email) ? ' has-unread' : ''}" type="button" data-message-friend="${escapeAttr(friend.email)}">Message${friendHasUnread(friend.email) ? '<span class="friend-msg-dot" aria-label="New messages"></span>' : ''}</button>
                    <button class="ghost-btn compact-btn" type="button" data-view-profile="${escapeAttr(friend.email)}">Profile</button>
                    <button class="ghost-btn compact-btn friend-remove-btn" type="button" data-remove-friend="${escapeAttr(friend.email)}" aria-label="Remove friend" title="Remove friend">&times;</button>
                </div>
            </article>`;
            }).join('')
            : '<div class="social-empty-state"><strong>No friends found</strong><span>Tap the + button above to add a registered player by email.</span></div>';

        list.querySelectorAll('[data-remove-friend]').forEach(btn => btn.addEventListener('click', () => removeFriend(btn.dataset.removeFriend)));
        list.querySelectorAll('[data-view-profile]').forEach(btn => btn.addEventListener('click', () => navigateToPlayerProfile(btn.dataset.viewProfile)));
        list.querySelectorAll('[data-message-friend]').forEach(btn => btn.addEventListener('click', () => openMessageComposer(btn.dataset.messageFriend)));
        bindPlayerProfileLinks(list);
    }

    function renderFriendRequests() {
        const list = document.getElementById('friendRequestList');
        const count = document.getElementById('friendRequestCountLabel');
        const panel = document.getElementById('friendRequestsPanel');
        if (!list) return;

        const incoming = state.profile?.incomingFriendRequests || [];
        const outgoing = state.profile?.outgoingFriendRequests || [];
        const pendingCount = incoming.length;

        if (count) count.textContent = `${pendingCount} pending`;
        const badge = document.getElementById('friendRequestsBadge');
        if (badge) {
            badge.textContent = pendingCount > 9 ? '9+' : String(pendingCount);
            badge.classList.toggle('hidden', !pendingCount);
        }
        document.getElementById('friendRequestsBtn')?.classList.toggle('active', Boolean(state.friendRequestsOpen));
        // The requests block stays hidden unless the player opens it from the
        // bell (it opens automatically when an invite is waiting).
        if (panel) panel.classList.toggle('hidden', !state.profile?.authenticated || !state.friendRequestsOpen);

        if (!state.profile?.authenticated) {
            list.innerHTML = '<div class="social-empty-state"><strong>Sign in to manage requests</strong></div>';
            return;
        }

        if (!incoming.length && !outgoing.length) {
            list.innerHTML = '<div class="social-empty-state"><strong>No pending requests</strong><span>Friend invites you send or receive will show up here.</span></div>';
            return;
        }

        const incomingHtml = incoming.map(request => `<article class="friend-request-tile">
            <div class="friend-request-copy">
                <strong>${escapeHtml(request.displayName || request.peerEmail)}</strong>
                <span>${escapeHtml(request.peerEmail)} wants to be friends</span>
            </div>
            <div class="friend-request-actions">
                <button class="primary-btn compact-btn" type="button" data-accept-request="${escapeAttr(request.fromUserId)}">Accept</button>
                <button class="ghost-btn compact-btn" type="button" data-deny-request="${escapeAttr(request.fromUserId)}">Decline</button>
            </div>
        </article>`).join('');

        const outgoingHtml = outgoing.map(request => `<article class="friend-request-tile">
            <div class="friend-request-copy">
                <strong>${escapeHtml(request.displayName || request.peerEmail)}</strong>
                <span>Request sent · waiting for approval</span>
            </div>
        </article>`).join('');

        list.innerHTML = incomingHtml + outgoingHtml;
        list.querySelectorAll('[data-accept-request]').forEach(btn => btn.addEventListener('click', () => respondToFriendRequest(btn.dataset.acceptRequest, 'accept')));
        list.querySelectorAll('[data-deny-request]').forEach(btn => btn.addEventListener('click', () => respondToFriendRequest(btn.dataset.denyRequest, 'deny')));
    }

    function friendPresenceRow(friend) {
        const key = friend?.userId || friend?.email;
        return key ? (state.friendPresence[key] || {}) : {};
    }

    function resolveFriendDisplayName(friend, presence = friendPresenceRow(friend)) {
        const prefs = presence.profileSettings || {};
        const name = String(prefs.displayName || friend?.displayName || '').trim();
        if (name) return name;
        const email = String(friend?.email || '').trim();
        const at = email.indexOf('@');
        return at > 0 ? email.slice(0, at) : (email || 'Player');
    }

    function friendInitial(friend) {
        return resolveFriendDisplayName(friend).slice(0, 1).toUpperCase();
    }

    function updateProfileSectionHead(viewingOther = false) {
        const head = document.querySelector('#profileSection .section-head');
        if (!head) return;
        const eyebrow = head.querySelector('.eyebrow');
        const title = head.querySelector('h1');
        if (viewingOther) {
            if (eyebrow) eyebrow.textContent = 'Player Profile';
            if (title) title.textContent = 'View a friend’s Siegelings profile';
        } else {
            if (eyebrow) eyebrow.textContent = 'Profile';
            if (title) title.textContent = 'Your profile, friends, and recent battles';
        }
    }

    function bindPlayerProfileLinks(root = document) {
        root.querySelectorAll('[data-player-profile]').forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                navigateToPlayerProfile(link.dataset.playerProfile);
            });
        });
    }

    function renderProfile() {
        const body = document.getElementById('profileSectionBody');
        if (!body) return;
        const viewingId = state.profileUserId;
        const myEmail = normalizePlayerId(state.profile?.user?.email);
        if (viewingId && viewingId !== myEmail) {
            updateProfileSectionHead(true);
            body.innerHTML = '<div class="profile-loading-state"><strong>Loading profile…</strong><span>Fetching player details.</span></div>';
            renderEditProfileModalHost(null);
            void loadPublicProfilePage(viewingId);
            return;
        }
        updateProfileSectionHead(false);
        state.profileUserId = '';
        if (!state.profile?.authenticated) {
            body.innerHTML = `<div class="profile-dashboard profile-signed-out">
                <div class="profile-hero profile-hero-neutral">
                    <div class="profile-hero-content">
                        <div class="profile-avatar">ST</div>
                        <div>
                            <span class="eyebrow">Player Hub</span>
                            <h2>Claim your Siegelings profile</h2>
                            <p>Sign in to save Siegecoins, Remnants, starter packs, owned cards, custom decks, friends, and match history.</p>
                        </div>
                    </div>
                    <button class="primary-btn profile-theme-btn" type="button" id="profileSignInBtn">Sign In</button>
                </div>
            </div>`;
            document.getElementById('profileSignInBtn')?.addEventListener('click', openAuth);
            renderEditProfileModalHost(null);
            return;
        }
        const view = profileViewModel();
        body.innerHTML = `<div class="profile-dashboard" style="${profileThemeStyle(view.theme)}">
            ${renderProfileHero(view)}
            ${renderProfileStats(view)}
            <div class="profile-main-grid">
                ${renderBattleRecordPanel(view)}
                ${renderCollectionSnapshot(view)}
            </div>
            <div class="profile-main-grid profile-main-grid-wide">
                ${renderBattleHistoryList(view)}
                <div class="profile-side-stack">
                    ${renderDeckSnapshot(view)}
                    ${renderFriendsPanel(view)}
                </div>
            </div>
            ${renderAchievementBadges(view)}
        </div>`;
        renderEditProfileModalHost(view);
        bindProfileDashboard();
        bindPlayerProfileLinks(body);
        window.SieglingsCardShowcase?.scheduleFramedSummaryFit?.();
        window.SieglingsCardShowcase?.scheduleSiegeKnightCardFit?.();
    }

    function renderEditProfileModalHost(view) {
        const host = document.getElementById('editProfileModalHost');
        if (!host) return;
        host.innerHTML = state.profileEditOpen && view ? renderEditProfileModal(view) : '';
    }

    function profileViewModel() {
        const user = state.profile?.user || {};
        const prefs = {
            ...defaultProfilePrefs(user),
            ...(state.profilePrefs || {})
        };
        const favoriteElement = normalizeProfileElement(prefs.favoriteElement);
        prefs.favoriteElement = favoriteElement;
        const theme = profileThemeFor(prefs);
        const collection = collectionSummary();
        const savedDecks = state.profile?.savedDecks || [];
        const battles = (state.profile?.matchHistory || []).map((row, index) => normalizeBattle(row, prefs.favoriteElement, index));
        const record = battleRecord(battles);
        return {
            user,
            prefs,
            theme,
            collection,
            savedDecks,
            battles,
            record,
            rank: 'Bronze III',
            level: Math.max(1, Math.floor((state.progression?.ownedTotal || 0) / 12) + 1),
            friendCount: state.profile?.friends?.length || 0
        };
    }

    function defaultProfilePrefs(user = {}) {
        const displayName = user.displayName || 'New Duelist';
        const favoriteElement = starterProfileElement();
        const theme = elementThemes[favoriteElement] || elementThemes.Fire;
        return {
            displayName,
            avatarMode: 'INITIAL',
            avatar: initials(displayName),
            avatarUrl: '',
            favoriteElement,
            profileArtId: '',
            pageArtId: '',
            playerTitle: theme.mood,
            playerTitleId: defaultStarterTitleId(favoriteElement),
            bio: starterProfileBio(favoriteElement),
            preferredCardBack: starterCardBackName(favoriteElement),
            favoriteSiegling: '',
            favoriteSieglingId: starterFavoriteSieglingId(favoriteElement)
        };
    }

    function defaultStarterTitleId(element) {
        const normalized = normalizeProfileElement(element);
        if (normalized === 'Earth') return 'title_starter_earth';
        if (normalized === 'Wind') return 'title_starter_wind';
        if (normalized === 'Ice' || normalized === 'Water') return 'title_starter_ice';
        return 'title_starter_fire';
    }

    function starterFavoriteSieglingId(element) {
        const normalized = normalizeProfileElement(element);
        const ownedCards = state.progression?.ownedCards || {};
        const catalog = state.options?.cardCatalog || [];
        const ownedMatch = catalog.find(card => card.type === 'SIEGLING'
            && normalizeProfileElement(card.element) === normalized
            && Number(ownedCards[card.id] || 0) > 0);
        if (ownedMatch?.id) return ownedMatch.id;
        const catalogMatch = catalog.find(card => card.type === 'SIEGLING'
            && normalizeProfileElement(card.element) === normalized);
        return catalogMatch?.id || '';
    }

    function unlockedPlayerTitles() {
        const fromProgression = (state.progression?.playerTitles || []).filter(title => title.unlocked);
        if (fromProgression.length) return fromProgression;
        return (state.titleCatalog || []).filter(title => title.unlocked);
    }

    // Turn a raw title id (e.g. "title_ach_mission_claim") into readable words
    // so a notification never surfaces the internal key if a label is missing.
    function humanizeTitleId(id) {
        return String(id || '')
            .replace(/^title[_-]/i, '')
            .replace(/^ach[_-]/i, '')
            .replace(/[_-]+/g, ' ')
            .trim()
            .replace(/\b\w/g, ch => ch.toUpperCase()) || 'New title';
    }

    // Prefer the human label from the player's earned titles, then the shop
    // catalog, then a humanized fallback — never the raw id.
    function resolveTitleDisplayName(id) {
        const fromProgression = (state.progression?.playerTitles || []).find(t => t.id === id);
        const fromCatalog = (state.titleCatalog || []).find(t => t.id === id);
        return fromProgression?.label || fromProgression?.name
            || fromCatalog?.label || fromCatalog?.name
            || humanizeTitleId(id);
    }

    function ownedSieglingCards() {
        return (state.options?.cardCatalog || [])
            .filter(card => card.type === 'SIEGLING' && ownedCount(card.id) > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function resolveProfileTitleLabel(prefs) {
        if (prefs?.playerTitle) return prefs.playerTitle;
        const match = unlockedPlayerTitles().find(title => title.id === prefs?.playerTitleId);
        return match?.label || elementThemes[prefs?.favoriteElement || 'Fire']?.mood || 'Ready for the next siege';
    }

    function renderProfileFavoriteSiegling(prefs) {
        const cardData = prefs?.favoriteSieglingCard;
        const cardId = prefs?.favoriteSieglingId || cardData?.id;
        const card = cardId ? (findCard(cardId) || cardData) : null;
        if (!card?.id) {
            return '<div class="profile-favorite-card-empty"><span>No favorite Siegeling selected</span></div>';
        }
        const binderVisual = window.SieglingsCardBinderVisual;
        const favoritePreview = (binderVisual?.usesFullCardArt?.(card) || binderVisual?.usesFramedCardTemplate?.(card))
            ? binderVisual.renderBinderCardPreview(card, {
                ownedOverride: ownedCount(card.id) || Number(card.owned) || 1,
                previewClass: 'detail-card-preview profile-favorite-showcase',
                descriptionText: shopCardDescriptionFor(card)
            })
            : `<div class="profile-favorite-card binder-card" style="--el:${elementColor(card.element)}">
                ${renderBinderCardShell(card, { ownedOverride: ownedCount(card.id) || Number(card.owned) || 1 })}
            </div>`;
        return `<div class="profile-favorite-card-wrap">
            <span class="profile-favorite-kicker">Favorite Siegeling</span>
            ${favoritePreview}
        </div>`;
    }

    function profileTitleSelect(selectedId, prefs) {
        const titles = unlockedPlayerTitles();
        const current = selectedId || prefs?.playerTitleId || '';
        if (!titles.length) {
            return profileInput('Player title', 'playerTitleId', resolveProfileTitleLabel(prefs));
        }
        return `<label><span>Player title</span><select class="search-input" data-profile-field="playerTitleId">
            ${titles.map(title => `<option value="${escapeAttr(title.id)}"${title.id === current ? ' selected' : ''}>${escapeHtml(title.label)}</option>`).join('')}
        </select></label>`;
    }

    function favoriteSieglingSelect(selectedId) {
        const cards = ownedSieglingCards();
        const current = selectedId || '';
        if (!cards.length) {
            return '<label><span>Favorite Siegeling</span><select class="search-input" disabled><option>Own a Siegeling first</option></select></label>';
        }
        return `<label><span>Favorite Siegeling</span><select class="search-input" data-profile-field="favoriteSieglingId">
            ${cards.map(card => `<option value="${escapeAttr(card.id)}"${card.id === current ? ' selected' : ''}>${escapeHtml(card.name)} · ${format(card.rarity)}</option>`).join('')}
        </select></label>`;
    }

    function applyStarterProfileDefaults() {
        const current = state.profilePrefs || {};
        const next = {
            ...defaultProfilePrefs(state.profile?.user || {}),
            displayName: current.displayName || state.profile?.user?.displayName || 'New Duelist',
            avatarMode: current.avatarMode || 'INITIAL',
            avatar: current.avatar || initials(current.displayName || state.profile?.user?.displayName || 'New Duelist'),
            avatarUrl: current.avatarUrl || ''
        };
        state.profilePrefs = next;
        cacheProfilePrefs(next);
    }

    function starterProfileElement() {
        return normalizeProfileElement(starterElementFromPackId(state.progression?.starterPackId) || 'FIRE');
    }

    function starterElementFromPackId(packId) {
        const match = String(packId || '').trim().match(/^pack_([a-z0-9_]+)/i);
        return match ? match[1].split('_')[0] : '';
    }

    function starterFavoriteSiegling(element) {
        const normalized = normalizeProfileElement(element);
        const ownedCards = state.progression?.ownedCards || {};
        const catalog = state.options?.cardCatalog || [];
        const ownedMatch = catalog.find(card => card.type === 'SIEGLING'
            && normalizeProfileElement(card.element) === normalized
            && Number(ownedCards[card.id] || 0) > 0);
        if (ownedMatch?.name) return ownedMatch.name;
        const catalogMatch = catalog.find(card => card.type === 'SIEGLING'
            && normalizeProfileElement(card.element) === normalized);
        if (catalogMatch?.name) return catalogMatch.name;
        return {
            Fire: 'Sundile',
            Earth: 'Applehead',
            Wind: 'Cacty',
            Ice: 'Pylme'
        }[normalized] || `${normalized} Siegeling`;
    }

    function starterCardBackName(element) {
        const normalized = normalizeProfileElement(element);
        const match = PROFILE_CARD_BACKS.find(back => back.element === normalized);
        return match ? match.name : PROFILE_CARD_BACKS[0].name;
    }

    function starterProfileBio(element) {
        return {
            Fire: 'Fire starter chosen. Build around pressure, direct attacks, and strong openings.',
            Earth: 'Earth starter chosen. Build around durability, healing, and strong board lines.',
            Wind: 'Wind starter chosen. Build around tempo, disruption, and fast Siegelings.',
            Ice: 'Ice starter chosen. Build around freezes, control, and resilient board lines.'
        }[normalizeProfileElement(element)] || 'Ready to tune a deck, open a pack, and make the next match count.';
    }

    // The profile color theme always tracks the player's favorite element. The
    // selectable "profile background" is an image (see profileArtId), not a color.
    function profileThemeFor(prefs = {}) {
        const favoriteElement = normalizeProfileElement(prefs.favoriteElement);
        return elementThemes[favoriteElement] || elementThemes.Neutral;
    }

    function profileThemeStyle(theme) {
        return [
            `--profile-accent:${theme.accent}`,
            `--profile-glow:${theme.glow}`,
            `--profile-gradient:${theme.gradient}`,
            `--profile-border:${theme.border}`,
            `--profile-badge:${theme.badge}`
        ].join(';');
    }

    function renderProfileHero(view) {
        const { prefs, user, theme } = view;
        const profileArt = readStoredArt(PROFILE_ART_KEY);
        const profileArtUrl = profileArt ? artImageFor(profileArt) : '';
        return `<section class="profile-hero${profileArtUrl ? ' has-art' : ''}"${profileArtUrl ? ` style="--profile-art:url('${escapeAttr(profileArtUrl)}')"` : ''}>
            <div class="profile-hero-effects" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="profile-hero-content">
                <div class="profile-avatar-wrap">
                    ${renderPlayerAvatar(prefs, 'profile-avatar')}
                    <span class="profile-level">LV ${view.level}</span>
                </div>
                <div class="profile-identity">
                    <div class="profile-hero-topline">
                        ${renderElementBadge(prefs.favoriteElement)}
                        <span class="profile-coin-chip">${renderCoinAmount(state.progression?.gold || 0)}</span>
                        <span class="profile-rank">${escapeHtml(view.rank)}</span>
                    </div>
                    <h2>${escapeHtml(prefs.displayName)}</h2>
                    <p class="profile-email">${escapeHtml(user.email || 'username pending')}</p>
                    <p class="profile-title">${escapeHtml(resolveProfileTitleLabel(prefs))}</p>
                    <p class="profile-bio">${escapeHtml(prefs.bio)}</p>
                </div>
            </div>
            <div class="profile-hero-side">
                <span class="profile-motif">${escapeHtml(theme.motif)}</span>
                <span>${escapeHtml(prefs.preferredCardBack)} card back</span>
                ${renderProfileFavoriteSiegling(prefs)}
                <button class="primary-btn profile-theme-btn" type="button" data-profile-edit>Edit Profile</button>
            </div>
        </section>`;
    }

    function renderProfileStats(view) {
        const { collection, record } = view;
        const stats = [
            ['Cards Owned', collection.ownedTotal, 'Total copies'],
            ['Unique Cards', collection.uniqueOwned, 'Discovered cards'],
            ['Saved Decks', view.savedDecks.length, 'Custom loadouts'],
            ['Wins', record.wins, 'Recorded matches'],
            ['Losses', record.losses, 'Recorded matches'],
            ['Win Rate', `${record.winRate}%`, 'Recent record'],
            ['Current Streak', record.currentStreakLabel, 'Live momentum'],
            ['Rank', view.rank, 'Placeholder ladder']
        ];
        return `<section class="profile-stat-grid">${stats.map(([label, value, hint]) => renderStatCard(label, value, hint)).join('')}</section>`;
    }

    function renderStatCard(label, value, hint) {
        return `<article class="profile-stat-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(hint)}</small>
        </article>`;
    }

    function renderBattleRecordPanel(view) {
        const { record, prefs } = view;
        return `<section class="profile-panel battle-record-panel">
            <div class="profile-panel-head">
                <div><span class="eyebrow">Battle Record</span><h3>Season Snapshot</h3></div>
                <span class="profile-soft-pill">${view.battles.length ? 'Live history' : 'No matches yet'}</span>
            </div>
            <div class="battle-record-layout">
                <div class="win-ring" style="--win:${record.winRate}">
                    <div><strong>${record.winRate}%</strong><span>Win Rate</span></div>
                </div>
                <div class="record-list">
                    <div><span>Total battles</span><strong>${record.total}</strong></div>
                    <div><span>Wins</span><strong>${record.wins}</strong></div>
                    <div><span>Losses</span><strong>${record.losses}</strong></div>
                    <div><span>Best streak</span><strong>${record.bestStreak}</strong></div>
                    <div><span>Most used element</span><strong>${escapeHtml(record.mostUsedElement || prefs.favoriteElement)}</strong></div>
                </div>
            </div>
        </section>`;
    }

    function renderBattleHistoryList(view, reviewable = true) {
        return `<section class="profile-panel battle-history-panel">
            <div class="profile-panel-head">
                <div><span class="eyebrow">Recent Battles</span><h3>Last Match Scroll</h3></div>
                <span class="profile-soft-pill">${view.battles.length} entries</span>
            </div>
            <div class="battle-list">
                ${view.battles.length
                    ? view.battles.map(battle => `<article class="battle-row ${reviewable ? 'battle-row-clickable' : ''} ${battle.result === 'WIN' ? 'is-win' : 'is-loss'}"${reviewable ? ` data-match-index="${battle.index}" role="button" tabindex="0" aria-label="Review match vs ${escapeAttr(battle.opponentName)}"` : ''}>
                        <div class="battle-result">${escapeHtml(battle.result)}</div>
                        <div class="battle-main">
                            <strong>${escapeHtml(battle.opponentName)}</strong>
                            <span>${escapeHtml(battle.opponentType)} / ${escapeHtml(battle.deckUsed)}</span>
                        </div>
                        ${renderElementBadge(battle.element)}
                        <div class="battle-meta"><span>${escapeHtml(battle.date)}</span>${battle.duration ? `<span>${escapeHtml(battle.duration)}</span>` : ''}</div>
                        <div class="battle-reward">${renderCoinAmount(battle.reward, '')}</div>
                    </article>`).join('')
                    : '<div class="social-empty-state"><strong>No battles recorded yet</strong><span>Finish a PVE or PVP match while signed in and it will appear here.</span></div>'}
            </div>
        </section>`;
    }

    function renderCollectionSnapshot(view) {
        const { collection } = view;
        const previewCards = collection.previewCards.length ? collection.previewCards : (state.options?.cardCatalog || []).slice(0, 4);
        return `<section class="profile-panel collection-panel">
            <div class="profile-panel-head">
                <div><span class="eyebrow">Collection Snapshot</span><h3>Cards Owned</h3></div>
                <button class="ghost-btn compact-btn" type="button" data-profile-route="cards">Binder</button>
            </div>
            <div class="collection-meter">
                <div><strong>${collection.completion}%</strong><span>Completion</span></div>
                <div class="profile-progress"><span style="width:${Math.max(4, collection.completion)}%"></span></div>
            </div>
            <div class="collection-facts">
                <div><span>Total copies</span><strong>${collection.ownedTotal}</strong></div>
                <div><span>Unique cards</span><strong>${collection.uniqueOwned}</strong></div>
                <div><span>Rarest owned</span><strong>${escapeHtml(collection.rarestCard)}</strong></div>
                <div><span>Most collected</span><strong>${escapeHtml(collection.mostCollectedElement)}</strong></div>
            </div>
            <div class="mini-card-row">
                ${previewCards.map(card => `<div class="profile-mini-card" style="--el:${elementColor(card?.element)}">
                    <span>${escapeHtml(format(card?.element).slice(0, 1) || '?')}</span>
                    <strong>${escapeHtml(card?.name || 'Locked Slot')}</strong>
                    <small>${escapeHtml(format(card?.rarity || 'Unknown'))}</small>
                </div>`).join('')}
            </div>
        </section>`;
    }

    function renderDeckSnapshot(view) {
        const favorite = view.savedDecks[0];
        const recent = view.savedDecks[1] || favorite;
        return `<section class="profile-panel deck-snapshot-panel">
            <div class="profile-panel-head">
                <div><span class="eyebrow">Saved Decks</span><h3>Loadout Shelf</h3></div>
                <button class="ghost-btn compact-btn" type="button" data-profile-route="decks">Decks</button>
            </div>
            <div class="deck-snapshot-grid">
                <div><span>Saved decks</span><strong>${view.savedDecks.length}</strong></div>
                <div><span>Favorite deck</span><strong>${escapeHtml(favorite?.name || 'No favorite yet')}</strong></div>
                <div><span>Recently used</span><strong>${escapeHtml(recent?.name || 'Build a custom deck')}</strong></div>
            </div>
            ${view.savedDecks.length ? '' : '<p class="profile-muted">No saved custom decks yet. Build a 30-card custom deck from owned cards, then save it here.</p>'}
        </section>`;
    }

    function renderFriendsPanel(view) {
        const friends = state.profile?.friends || [];
        return `<section class="profile-panel friends-panel">
            <div class="profile-panel-head">
                <div><span class="eyebrow">Friends</span><h3>Social Table</h3></div>
                <span class="profile-soft-pill">${view.friendCount} friends</span>
            </div>
            <div class="friend-search-row">
                <input class="search-input" placeholder="Find Players" aria-label="Find Players">
                <button class="primary-btn profile-theme-btn" type="button" data-profile-route="social">Add Friend</button>
            </div>
            <div class="friend-activity">
                ${friends.length ? friends.slice(0, 4).map(friend => {
                    const playerId = friend.userId || friend.email;
                    const label = friend.displayName || friend.email;
                    return `<div class="friend-activity-row">
                        <div class="friend-activity-main">
                            <a class="profile-friend-link" href="${escapeAttr(playerProfilePath(playerId))}" data-player-profile="${escapeAttr(playerId)}"><strong>${escapeHtml(label)}</strong></a>
                            <span>${escapeHtml(friend.email)}</span>
                        </div>
                        <div class="friend-activity-actions">
                            <button class="ghost-btn compact-btn" type="button" data-view-profile="${escapeAttr(playerId)}">Profile</button>
                            <button class="ghost-btn compact-btn" type="button" data-message-friend="${escapeAttr(friend.email)}">Message</button>
                        </div>
                    </div>`;
                }).join('') : '<div class="friend-activity-note"><strong>No friends yet</strong><span>Add friends from the Social page using their email.</span></div>'}
                <div class="friend-activity-note"><strong>Open lobbies</strong><span>Use Social to join rooms or invite friends once room invites are connected.</span></div>
            </div>
        </section>`;
    }

    function achievementHelpers() {
        return {
            findCard,
            normalizeBattle,
            battleRecord
        };
    }

    function evaluateAchievements(view) {
        const api = window.SiegelingsAchievements;
        if (!api) return { featured: [], all: [], unlockedCount: 0, total: 0, byCategory: {} };
        return api.evaluateAll(state, view, achievementHelpers());
    }

    function renderAchievementBadgeTile(achievement, options = {}) {
        const compact = options.compact;
        const unlocked = achievement.unlocked;
        return `<div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}${compact ? ' achievement-badge-compact' : ''}" data-achievement-id="${escapeAttr(achievement.id)}" role="button" tabindex="0" aria-label="${escapeAttr(achievement.title)} — ${unlocked ? 'unlocked' : 'locked'}. View requirements.">
            <span aria-hidden="true">${unlocked ? escapeHtml(achievement.icon || '★') : '−'}</span>
            <strong>${escapeHtml(achievement.title)}</strong>
            <small>${unlocked ? 'Unlocked' : 'Locked'}</small>
        </div>`;
    }

    function renderAchievementBadges(view) {
        const snapshot = evaluateAchievements(view);
        const featured = snapshot.featured.length ? snapshot.featured : snapshot.all.slice(0, 6);
        return `<section class="profile-panel achievement-panel">
            <div class="profile-panel-head">
                <div><span class="eyebrow">Achievements</span><h3>Badge Case</h3></div>
                <button class="ghost-btn compact-btn" type="button" data-achievement-route="">View all (${snapshot.unlockedCount}/${snapshot.total})</button>
            </div>
            <div class="achievement-row achievement-row-featured">
                ${featured.map(item => renderAchievementBadgeTile(item)).join('')}
            </div>
            <p class="profile-muted achievement-panel-note">Six featured badges on your profile. Open the full badge case for ${snapshot.total} goals across collection, remnants, decks, and arena play.</p>
        </section>`;
    }

    function achievementsPath(category = '') {
        const normalized = String(category || '').trim().toLowerCase();
        if (!normalized) return '/achievements';
        return `/achievements/${encodeURIComponent(normalized)}`;
    }

    function navigateAchievementCategory(category = '', options = {}) {
        const path = achievementsPath(category);
        state.route = 'achievements';
        state.achievementCategory = String(category || '').trim().toLowerCase();
        state.activeAchievementId = '';
        state.shopView = 'browse';
        state.profileUserId = '';
        state.profileEditOpen = false;
        if (options.replace) {
            history.replaceState(null, '', path);
        } else {
            history.pushState(null, '', path);
        }
        setActiveRoute();
        renderSections();
        renderRoute();
    }

    function renderAchievements() {
        const body = document.getElementById('achievementsSectionBody');
        if (!body) return;
        if (!state.profile?.authenticated) {
            body.innerHTML = `<div class="achievements-signed-out unlock-card">
                <strong>Sign in to track achievements</strong>
                <span>Your badge cases unlock from wins, collection, remnants, deck building, and arena matches.</span>
                <button class="primary-btn" type="button" id="achievementsSignInBtn">Sign In</button>
            </div>`;
            document.getElementById('achievementsSignInBtn')?.addEventListener('click', openAuth);
            return;
        }
        const view = profileViewModel();
        const snapshot = evaluateAchievements(view);
        const activeCategory = state.achievementCategory;
        const categories = window.SiegelingsAchievements?.CATEGORIES || [];
        const categoryUnlocked = (id) => (snapshot.byCategory[id] || []).filter(a => a.unlocked).length;
        const categoryTotal = (id) => (snapshot.byCategory[id] || []).length;

        if (activeCategory && snapshot.byCategory[activeCategory]) {
            const meta = window.SiegelingsAchievements.categoryMeta(activeCategory);
            const rows = snapshot.byCategory[activeCategory];
            const unlockedInCase = rows.filter(a => a.unlocked).length;
            body.innerHTML = `<div class="achievements-dashboard" style="${profileThemeStyle(view.theme)}">
                <div class="achievements-case-head">
                    <button class="ghost-btn compact-btn" type="button" data-achievement-route="">All badge cases</button>
                    <div>
                        <span class="eyebrow">${escapeHtml(meta.eyebrow)}</span>
                        <h2>${escapeHtml(meta.label)}</h2>
                        <p class="achievements-case-copy">${escapeHtml(meta.description)}</p>
                    </div>
                    <span class="profile-soft-pill">${unlockedInCase}/${rows.length} unlocked</span>
                </div>
                <div class="achievement-grid achievement-grid-extended">
                    ${rows.map(item => renderAchievementBadgeTile(item, { extended: true })).join('')}
                </div>
                <div class="achievement-detail-list">
                    ${rows.map(item => `<article class="achievement-detail-row ${item.unlocked ? 'is-unlocked' : 'is-locked'}" data-achievement-id="${escapeAttr(item.id)}" role="button" tabindex="0" aria-label="${escapeAttr(item.title)} — ${item.unlocked ? 'unlocked' : 'locked'}. View requirements.">
                        <div class="achievement-detail-icon" aria-hidden="true">${escapeHtml(item.unlocked ? item.icon : '−')}</div>
                        <div>
                            <strong>${escapeHtml(item.title)}</strong>
                            <p>${escapeHtml(item.description)}</p>
                        </div>
                        <span class="achievement-detail-status">${item.unlocked ? 'Unlocked' : 'Locked'}</span>
                    </article>`).join('')}
                </div>
            </div>`;
        } else {
            body.innerHTML = `<div class="achievements-dashboard" style="${profileThemeStyle(view.theme)}">
                <div class="achievements-overview-head">
                    <div>
                        <span class="eyebrow">Achievements</span>
                        <h2>Badge Case Hall</h2>
                        <p class="achievements-case-copy">General goals, elemental mastery, card collection, remnants, deck creation, and arena loadouts — each case holds its own badge set.</p>
                    </div>
                    <div class="achievements-overview-stats">
                        <strong>${snapshot.unlockedCount}<span>/${snapshot.total}</span></strong>
                        <small>badges unlocked</small>
                    </div>
                </div>
                <div class="achievement-category-grid">
                    ${categories.map(cat => {
                        const rows = snapshot.byCategory[cat.id] || [];
                        const preview = rows.slice(0, 4);
                        const unlocked = categoryUnlocked(cat.id);
                        return `<section class="achievement-category-card">
                            <div class="achievement-category-head">
                                <div>
                                    <span class="eyebrow">${escapeHtml(cat.eyebrow)}</span>
                                    <h3>${escapeHtml(cat.label)}</h3>
                                    <p>${escapeHtml(cat.description)}</p>
                                </div>
                                <span class="profile-soft-pill">${unlocked}/${categoryTotal(cat.id)}</span>
                            </div>
                            <div class="achievement-row achievement-row-preview">
                                ${preview.map(item => renderAchievementBadgeTile(item, { compact: true })).join('')}
                            </div>
                            <button class="ghost-btn compact-btn" type="button" data-achievement-route="${escapeAttr(cat.id)}">Open badge case</button>
                        </section>`;
                    }).join('')}
                </div>
                <section class="profile-panel achievement-panel achievement-panel-all">
                    <div class="profile-panel-head">
                        <div><span class="eyebrow">Full roster</span><h3>Every badge</h3></div>
                    </div>
                    <div class="achievement-grid achievement-grid-extended">
                        ${snapshot.all.map(item => renderAchievementBadgeTile(item)).join('')}
                    </div>
                </section>
            </div>`;
        }
        bindAchievementRoutes(body);
    }

    function bindAchievementRoutes(root = document) {
        root.querySelectorAll('[data-achievement-route]').forEach(btn => {
            btn.addEventListener('click', () => navigateAchievementCategory(btn.dataset.achievementRoute || ''));
        });
        bindAchievementBadges(root);
    }

    function bindAchievementBadges(root = document) {
        root.querySelectorAll('[data-achievement-id]').forEach(el => {
            el.addEventListener('click', () => openAchievementDetail(el.dataset.achievementId));
            el.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openAchievementDetail(el.dataset.achievementId);
                }
            });
        });
    }

    function openAchievementDetail(id) {
        if (!id) return;
        state.activeAchievementId = String(id);
        renderAchievementDetailHost();
    }

    function closeAchievementDetail() {
        if (!state.activeAchievementId) return;
        state.activeAchievementId = '';
        renderAchievementDetailHost();
    }

    function renderAchievementDetailHost() {
        const host = document.getElementById('achievementDetailHost');
        if (!host) return;
        const id = state.activeAchievementId;
        if (!id) {
            host.innerHTML = '';
            return;
        }
        const view = state.profile?.authenticated ? profileViewModel() : null;
        const snapshot = evaluateAchievements(view);
        const achievement = (snapshot.all || []).find(a => a.id === id);
        if (!achievement) {
            host.innerHTML = '';
            return;
        }
        host.innerHTML = renderAchievementDetailModal(achievement, view);
        const overlay = host.querySelector('.profile-modal');
        overlay?.addEventListener('click', (event) => {
            if (event.target === overlay) closeAchievementDetail();
        });
        host.querySelectorAll('[data-achievement-detail-close]').forEach(btn => {
            btn.addEventListener('click', closeAchievementDetail);
        });
    }

    function renderAchievementDetailModal(achievement, view) {
        const api = window.SiegelingsAchievements;
        const meta = api?.categoryMeta ? api.categoryMeta(achievement.category) : { eyebrow: 'Achievement', label: 'Achievement' };
        const unlocked = achievement.unlocked;
        const measurable = achievement.measurable;
        const current = Number(achievement.progressCurrent) || 0;
        const target = Number(achievement.progressTarget) || 0;
        const pct = Math.max(0, Math.min(100, Number(achievement.progressPct) || 0));
        const progressBlock = measurable
            ? `<div class="achievement-modal-progress">
                    <div class="achievement-modal-progress-head">
                        <span>Progress</span>
                        <strong>${escapeHtml(formatProgressCount(current))} / ${escapeHtml(formatProgressCount(target))}</strong>
                    </div>
                    <div class="achievement-modal-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                        <span style="width:${pct}%"></span>
                    </div>
                    <small>${unlocked ? 'Requirement met.' : `${escapeHtml(formatProgressCount(Math.max(0, target - current)))} to go.`}</small>
                </div>`
            : `<div class="achievement-modal-progress achievement-modal-progress-binary">
                    <small>${unlocked ? 'You have met this requirement.' : 'Complete the requirement above to unlock this badge.'}</small>
                </div>`;
        const rewardTitle = (state.titleCatalog || state.progression?.playerTitles || [])
            .find(title => title.achievementId === achievement.id);
        const rewardBlock = rewardTitle
            ? `<div class="achievement-modal-reward">
                    <span class="eyebrow">Player title reward</span>
                    <p><strong>${escapeHtml(rewardTitle.label)}</strong></p>
                    <small>${escapeHtml(rewardTitle.description || 'Unlock this achievement to earn the title for your profile.')}</small>
                </div>`
            : '';
        return `<div class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="achievementDetailTitle">
            <div class="profile-edit-panel profile-panel achievement-modal-panel" style="${profileThemeStyle(view?.theme || elementThemes.Neutral)}">
                <div class="profile-panel-head">
                    <div><span class="eyebrow">${escapeHtml(meta.eyebrow)} · ${escapeHtml(meta.label)}</span><h3 id="achievementDetailTitle">Badge Requirements</h3></div>
                    <button class="ghost-btn compact-btn" type="button" data-achievement-detail-close>Close</button>
                </div>
                <div class="achievement-modal-body">
                    <div class="achievement-modal-emblem ${unlocked ? 'is-unlocked' : 'is-locked'}" aria-hidden="true">${escapeHtml(unlocked ? (achievement.icon || '★') : '−')}</div>
                    <div class="achievement-modal-headline">
                        <strong>${escapeHtml(achievement.title)}</strong>
                        <span class="achievement-modal-status ${unlocked ? 'is-unlocked' : 'is-locked'}">${unlocked ? 'Unlocked' : 'Locked'}</span>
                    </div>
                </div>
                <div class="achievement-modal-requirement">
                    <span class="eyebrow">Requirement</span>
                    <p>${escapeHtml(achievement.description)}</p>
                </div>
                ${progressBlock}
                ${rewardBlock}
            </div>
        </div>`;
    }

    function formatProgressCount(value) {
        const num = Number(value) || 0;
        return num >= 1000 ? num.toLocaleString() : String(num);
    }

    function renderEditProfileModal(view) {
        const { prefs } = view;
        return `<div class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="editProfileTitle">
            <div class="profile-edit-panel profile-panel">
                <div class="profile-panel-head">
                    <div><span class="eyebrow">Edit Profile</span><h3 id="editProfileTitle">Player Details</h3></div>
                    <button class="ghost-btn compact-btn" type="button" data-profile-close>Close</button>
                </div>
                <div class="profile-edit-grid">
                    ${profileInput('Display name', 'displayName', prefs.displayName)}
                    <label><span>Avatar style</span><select class="search-input" data-profile-field="avatarMode">
                        <option value="INITIAL"${prefs.avatarMode === 'INITIAL' ? ' selected' : ''}>First initial</option>
                        <option value="ELEMENT"${prefs.avatarMode === 'ELEMENT' ? ' selected' : ''}>Favorite element icon</option>
                    </select></label>
                    ${profileInput('Avatar initials', 'avatar', prefs.avatar)}
                    ${profileInput('Avatar image URL', 'avatarUrl', prefs.avatarUrl)}
                    <label><span>Favorite element</span><select class="search-input" data-profile-field="favoriteElement">${PROFILE_ELEMENTS.map(element => `<option value="${element}"${element === prefs.favoriteElement ? ' selected' : ''}>${element}</option>`).join('')}</select></label>
                    ${profileBackgroundSelect(prefs.profileArtId)}
                    ${profileTitleSelect(prefs.playerTitleId, prefs)}
                    ${profileInput('Bio/status message', 'bio', prefs.bio)}
                    ${profileCardBackSelect(prefs.preferredCardBack)}
                    ${favoriteSieglingSelect(prefs.favoriteSieglingId || prefs.favoriteSieglingCard?.id)}
                </div>
                <div class="profile-edit-actions">
                    <button class="ghost-btn" type="button" data-profile-close>Cancel</button>
                    <button class="primary-btn profile-theme-btn" type="button" data-profile-save>Save Profile</button>
                </div>
            </div>
        </div>`;
    }

    function profileInput(label, field, value) {
        return `<label><span>${escapeHtml(label)}</span><input class="search-input" data-profile-field="${escapeAttr(field)}" value="${escapeAttr(value)}"></label>`;
    }

    // Renders the profile background image picker, listing the art gallery pieces.
    // The first option is the default (no image); any saved id not in the loaded
    // catalog is preserved so a slow art fetch never wipes the player's choice.
    function profileBackgroundSelect(selectedId) {
        const current = String(selectedId || '').trim();
        const pieces = (state.loadingArt || []).slice();
        const ids = pieces.map(piece => piece.id);
        const options = [`<option value=""${current ? '' : ' selected'}>Default (no image)</option>`];
        if (current && !ids.includes(current)) {
            options.push(`<option value="${escapeAttr(current)}" selected>${escapeHtml(current)}</option>`);
        }
        pieces.forEach(piece => {
            options.push(`<option value="${escapeAttr(piece.id)}"${piece.id === current ? ' selected' : ''}>${escapeHtml(piece.title || piece.id)}</option>`);
        });
        return `<label><span>Profile background</span><select class="search-input" data-profile-field="profileArtId">${options.join('')}</select></label>`;
    }

    // Renders the preferred card back picker as a dropdown of premade backs.
    // Preserves any existing saved value that isn't part of the premade set.
    function profileCardBackSelect(selected) {
        const current = String(selected || '').trim();
        const names = PROFILE_CARD_BACKS.map(back => back.name);
        if (current && !names.includes(current)) names.unshift(current);
        const options = names.map(name => `<option value="${escapeAttr(name)}"${name === current ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('');
        return `<label><span>Preferred card back</span><select class="search-input" data-profile-field="preferredCardBack">${options}</select></label>`;
    }

    function bindProfileDashboard() {
        document.querySelectorAll('[data-profile-edit]').forEach(btn => btn.addEventListener('click', () => {
            state.profileEditOpen = true;
            renderProfile();
        }));
        document.querySelectorAll('[data-profile-close]').forEach(btn => btn.addEventListener('click', () => {
            state.profileEditOpen = false;
            renderProfile();
        }));
        document.querySelectorAll('[data-profile-save]').forEach(btn => btn.addEventListener('click', saveProfilePrefs));
        document.querySelectorAll('[data-profile-route]').forEach(btn => btn.addEventListener('click', () => navigateHub(btn.dataset.profileRoute)));
        document.querySelectorAll('.friend-activity [data-view-profile]').forEach(btn => btn.addEventListener('click', () => navigateToPlayerProfile(btn.dataset.viewProfile)));
        document.querySelectorAll('.friend-activity [data-message-friend]').forEach(btn => btn.addEventListener('click', () => openMessageComposer(btn.dataset.messageFriend)));
        document.querySelectorAll('.battle-row-clickable[data-match-index]').forEach(row => {
            const index = Number(row.dataset.matchIndex);
            row.addEventListener('click', () => openMatchReview(index));
            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMatchReview(index);
                }
            });
        });
        bindAchievementRoutes(document.getElementById('profileSectionBody') || document);
    }

    // Opens a read-only review of a recorded match (stats + turn-by-turn log),
    // mirroring the match detail surface on the Play screen.
    function openMatchReview(index, source) {
        const entry = (source || state.profile?.matchHistory || [])[index];
        const overlay = document.getElementById('matchReviewOverlay');
        const content = document.getElementById('matchReviewContent');
        if (!entry || !overlay || !content) return;

        const resultLabel = entry.result || 'Result';
        const resultClass = String(resultLabel).toUpperCase().includes('WIN') ? 'win' : 'loss';
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
            ? `<div class="match-detail-log">${logLines.map(line => `<div class="md-log-line">${escapeHtml(line)}</div>`).join('')}</div>`
            : '<div class="match-review-empty">No turn-by-turn breakdown was recorded for this match.</div>';

        content.innerHTML = `
            <div class="match-detail-header result-${resultClass}">
                <div class="match-detail-result history-result-${resultClass}">${escapeHtml(resultLabel)}</div>
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

    function closeMatchReview(event) {
        if (event) {
            const overlay = document.getElementById('matchReviewOverlay');
            if (event.target !== overlay && !event.target.closest('[data-match-review-close]')) {
                return;
            }
        }
        document.getElementById('matchReviewOverlay')?.classList.add('hidden');
    }

    async function saveProfilePrefs() {
        if (!state.profile?.authenticated) return openAuth();
        const next = { ...(state.profilePrefs || defaultProfilePrefs(state.profile?.user || {})) };
        document.querySelectorAll('[data-profile-field]').forEach(input => {
            next[input.dataset.profileField] = input.value.trim();
        });
        next.favoriteElement = normalizeProfileElement(next.favoriteElement);
        next.avatarMode = next.avatarMode === 'ELEMENT' ? 'ELEMENT' : 'INITIAL';
        next.avatar = (next.avatar || initials(next.displayName)).slice(0, 4).toUpperCase();
        if (!next.playerTitleId && next.playerTitle) {
            const legacy = unlockedPlayerTitles().find(title => title.label === next.playerTitle || title.id === next.playerTitle);
            next.playerTitleId = legacy?.id || defaultStarterTitleId(next.favoriteElement);
        }
        if (!next.favoriteSieglingId && next.favoriteSiegling) {
            const legacyCard = ownedSieglingCards().find(card => card.id === next.favoriteSiegling || card.name === next.favoriteSiegling);
            next.favoriteSieglingId = legacyCard?.id || '';
        }
        const data = await fetchJson('/api/profile/settings', { method: 'POST', body: JSON.stringify(next) });
        if (!data) return alert('Could not save profile. Is the server running the latest code with /api/profile/settings?');
        if (data.error) return alert(data.error);
        state.profilePrefs = applyProfileSettingsFromServer(data.profileSettings)
            ? { ...defaultProfilePrefs(state.profile?.user || {}), ...applyProfileSettingsFromServer(data.profileSettings) }
            : next;
        cacheProfilePrefs(state.profilePrefs);
        applyProfileArtFromPrefs(state.profilePrefs);
        if (state.profile?.user && state.profilePrefs?.displayName) {
            state.profile.user.displayName = state.profilePrefs.displayName;
        }
        state.profileEditOpen = false;
        renderProfile();
        renderFriends();
    }

    function renderElementBadge(element) {
        const normalized = normalizeProfileElement(element);
        const theme = elementThemes[normalized] || elementThemes.Neutral;
        const iconPath = elementIconPath(normalized);
        return `<span class="element-badge" style="--badge:${theme.badge};--badge-glow:${theme.glow}">
            ${iconPath ? `<img src="${escapeAttr(iconPath)}" alt="" aria-hidden="true">` : ''}
            <span>${escapeHtml(normalized)}</span>
        </span>`;
    }

    function coinIconMarkup() {
        return `<img class="coin-icon" src="${COIN_ICON_PATH}" alt="" aria-hidden="true">`;
    }

    function renderCoinAmount(value, label = 'Siegecoins') {
        const amount = String(value ?? 0).replace(/\s*(Siegecoins?|Coins?)$/i, '').trim() || '0';
        return `<span class="coin-value">${coinIconMarkup()}<span>${escapeHtml(amount)}</span>${label ? `<small>${escapeHtml(label)}</small>` : ''}</span>`;
    }

    function remnantBalance() {
        const explicit = Number(state.progression?.remnants);
        if (Number.isFinite(explicit)) return Math.max(0, explicit);
        const packHistory = state.progression?.packHistory || [];
        const ownedTotal = state.progression?.ownedTotal || 0;
        return Math.max(0, packHistory.length * 40 + Math.floor(ownedTotal / 3));
    }

    function remnantCraftCost(card) {
        return REMNANT_CRAFT_COSTS[String(card?.rarity || 'COMMON').toUpperCase()] || REMNANT_CRAFT_COSTS.COMMON;
    }

    function playerHolographicCardIds() {
        const raw = state.progression?.holographicCards;
        if (!Array.isArray(raw)) {
            return new Set();
        }
        return new Set(raw.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean));
    }

    function playerOwnsHolographicFinish(card) {
        const cardId = String(card?.id || '').trim().toLowerCase();
        return Boolean(cardId && playerHolographicCardIds().has(cardId));
    }

    function cardShowsPlayerHolographic(card) {
        if (!card) {
            return false;
        }
        if (card.holographic === true) {
            return true;
        }
        return playerOwnsHolographicFinish(card);
    }

    function withPlayerHolographic(card) {
        if (!card) {
            return card;
        }
        const holographic = cardShowsPlayerHolographic(card);
        return holographic === Boolean(card.holographic) ? card : { ...card, holographic };
    }

    function remnantHolographicCost(card) {
        return remnantCraftCost(card) * 4;
    }

    function applyProgressionUpdate(progression) {
        if (!progression) {
            return;
        }
        state.progression = progression;
        if (state.profile?.authenticated) {
            state.profile = { ...state.profile, progression };
            saveCachedAuthProfile(state.profile);
        }
    }

    function playHolographicUnlockAnimation() {
        const wrap = document.querySelector('.detail-card-preview-wrap');
        if (!wrap) {
            return;
        }
        wrap.classList.remove('holographic-unlock-play');
        void wrap.offsetWidth;
        wrap.classList.add('holographic-unlock-play');
        window.setTimeout(() => wrap.classList.remove('holographic-unlock-play'), 2400);
    }

    function binderHolographicOptions() {
        return { playerHolographicIds: playerHolographicCardIds() };
    }

    function collectionSummary() {
        const ownedCards = state.progression?.ownedCards || {};
        const catalog = state.options?.cardCatalog || [];
        const ownedEntries = Object.entries(ownedCards).filter(([, count]) => Number(count) > 0);
        const ownedTotal = state.progression?.ownedTotal || ownedEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
        const uniqueOwned = ownedEntries.length;
        const totalCatalog = catalog.length || 1;
        const ownedCardModels = ownedEntries
            .map(([id, count]) => ({ card: findCard(id), count: Number(count || 0) }))
            .filter(item => item.card);
        const elementCounts = {};
        ownedCardModels.forEach(({ card, count }) => {
            const element = normalizeProfileElement(card.element);
            elementCounts[element] = (elementCounts[element] || 0) + count;
        });
        const mostCollectedElement = Object.entries(elementCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Neutral';
        const rarest = [...ownedCardModels].sort((a, b) => (RARITY_ORDER[b.card.rarity] || 0) - (RARITY_ORDER[a.card.rarity] || 0))[0]?.card;
        const previewCards = ownedCardModels
            .sort((a, b) => (RARITY_ORDER[b.card.rarity] || 0) - (RARITY_ORDER[a.card.rarity] || 0) || b.count - a.count)
            .slice(0, 4)
            .map(item => item.card);
        return {
            ownedTotal,
            uniqueOwned,
            completion: Math.min(100, Math.round((uniqueOwned / totalCatalog) * 100)),
            rarestCard: rarest?.name || 'Undiscovered',
            mostCollectedElement,
            previewCards
        };
    }

    function battleRecord(history) {
        const total = history.length;
        const wins = history.filter(battle => battle.result === 'WIN').length;
        const losses = history.filter(battle => battle.result === 'LOSS').length;
        const winRate = total ? Math.round((wins / total) * 100) : 0;
        let currentType = history[0]?.result;
        let currentCount = 0;
        for (const battle of history) {
            if (battle.result !== currentType) break;
            currentCount += 1;
        }
        let bestStreak = 0;
        let running = 0;
        history.slice().reverse().forEach(battle => {
            if (battle.result === 'WIN') {
                running += 1;
                bestStreak = Math.max(bestStreak, running);
            } else {
                running = 0;
            }
        });
        const elementCounts = {};
        history.forEach(battle => {
            elementCounts[battle.element] = (elementCounts[battle.element] || 0) + 1;
        });
        return {
            total,
            wins,
            losses,
            winRate,
            bestStreak,
            currentStreakLabel: currentCount ? `${currentCount} ${currentType}` : '0',
            mostUsedElement: Object.entries(elementCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
        };
    }

    function normalizeBattle(row, fallbackElement, index) {
        const result = String(row.result || '').toUpperCase().includes('WIN') ? 'WIN' : 'LOSS';
        const matchType = String(row.matchType || '').toUpperCase();
        return {
            result,
            matchType,
            opponentName: row.opponentName || 'Opponent',
            opponentType: matchType.includes('PVP') || matchType.includes('PLAYER') ? 'Player' : 'AI',
            deckUsed: row.loadoutLabel || row.trainerName || 'Battle Loadout',
            element: inferElementFromText(row.loadoutLabel || row.trainerName || '', fallbackElement),
            date: formatProfileDate(row.finishedAt) || '',
            duration: row.turnNumber ? `${row.turnNumber} turns` : '',
            reward: result === 'WIN' ? '+25' : '+5',
            index
        };
    }

    function inferElementFromText(text, fallback) {
        const value = String(text || '').toLowerCase();
        return PROFILE_ELEMENTS.find(element => value.includes(element.toLowerCase())) || normalizeProfileElement(fallback);
    }

    function normalizeProfileElement(element) {
        const raw = String(element || '').trim();
        if (!raw) return 'Fire';
        const upper = raw.toUpperCase();
        const fromServer = {
            FIRE: 'Fire',
            ICE: 'Ice',
            WIND: 'Wind',
            EARTH: 'Earth',
            WATER: 'Water',
            SHADOW: 'Shadow',
            ELECTRIC: 'Electric',
            STORM: 'Electric',
            METAL: 'Metal',
            MECH: 'Metal',
            UNDEAD: 'Undead',
            PSYCHIC: 'Psychic',
            NEUTRAL: 'Neutral'
        };
        if (fromServer[upper]) {
            return PROFILE_ELEMENTS.includes(fromServer[upper]) ? fromServer[upper] : fromServer[upper];
        }
        const normalized = format(raw);
        if (normalized === 'Water' && !PROFILE_ELEMENTS.includes('Water')) return 'Ice';
        return PROFILE_ELEMENTS.includes(normalized) ? normalized : (fromServer[upper] || normalized || 'Fire');
    }

    function initials(name) {
        return String(name || 'ST')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase() || 'ST';
    }

    function formatProfileDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function renderProfileMini() {
        const el = document.getElementById('profileMini');
        if (!el) return;
        if (!state.profile?.authenticated) {
            el.innerHTML = `<strong>Guest</strong><span>Sign in from the HUD to save Siegecoins, Remnants, and owned cards.</span>`;
            return;
        }
        el.innerHTML = `<strong>${escapeHtml(state.profile.user.displayName)}</strong><span>${renderCoinAmount(state.progression?.gold || 0)} / ${state.progression?.ownedTotal || 0} owned copies</span><button class="ghost-btn" type="button" id="logoutBtn">Log out</button>`;
        document.getElementById('logoutBtn')?.addEventListener('click', logout);
    }

    function renderGold() {
        const goldPill = document.getElementById('goldPill');
        if (goldPill) goldPill.innerHTML = renderCoinAmount(state.profile?.authenticated ? (state.progression?.gold || 0) : 100);
        const ownedCountLabel = document.getElementById('ownedCountLabel');
        if (ownedCountLabel) ownedCountLabel.textContent = `${state.progression?.ownedTotal || 0} owned`;
        const authBtn = document.getElementById('authHudBtn');
        if (authBtn) {
            authBtn.textContent = state.profile?.authenticated ? 'Log Out' : 'Sign In';
            authBtn.classList.toggle('is-authenticated', Boolean(state.profile?.authenticated));
        }
    }

    function renderUnlock() {
        const el = document.getElementById('customUnlockCard');
        if (!el) return;
        el.innerHTML = state.progression?.customDeckUnlocked
            ? '<strong>Custom decks unlocked</strong><span>Max 3 copies of any card.</span>'
            : `<strong>Deck builder locked</strong><span>${state.progression?.ownedTotal || 0}/30 owned copies.</span>`;
    }

    /* ── Gacha loading: "spears of light" fly-off animation ──────────────
       Shown while the pull request is in flight. Spears start tinted by the
       pack's element; once the result lands they re-volley in the colour of
       the highest rarity pulled, then the overlay resolves into the reveal. */
    const GACHA_RARITY_RANK = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

    function topPullRarity(cards) {
        return (cards || []).reduce((best, card) => {
            const rank = GACHA_RARITY_RANK.indexOf(String(card.rarity || 'COMMON').toUpperCase());
            return rank > GACHA_RARITY_RANK.indexOf(best) ? GACHA_RARITY_RANK[rank] : best;
        }, 'COMMON');
    }

    function spawnLightSpears(layer, color, count, burst) {
        if (!layer) return;
        for (let i = 0; i < count; i += 1) {
            const spear = document.createElement('span');
            spear.className = `gacha-spear${burst ? ' is-burst' : ''}`;
            spear.style.setProperty('--ang', `${Math.round(Math.random() * 360)}deg`);
            spear.style.setProperty('--delay', `${(Math.random() * (burst ? 0.25 : 0.9)).toFixed(2)}s`);
            spear.style.setProperty('--dur', `${(burst ? 0.55 : 0.9) + Math.random() * 0.5}s`);
            spear.style.setProperty('--len', `${26 + Math.round(Math.random() * 30)}vmin`);
            spear.style.setProperty('--spear-color', color);
            spear.addEventListener('animationend', () => spear.remove());
            layer.appendChild(spear);
        }
    }

    let pendingSpearTimer = 0;

    function startPendingSpears(element) {
        stopPendingSpears();
        const layer = document.querySelector('.pack-opening-pending .gacha-spear-layer');
        if (!layer) return;
        const color = elementColor(element || 'FIRE');
        spawnLightSpears(layer, color, 10);
        pendingSpearTimer = window.setInterval(() => spawnLightSpears(layer, color, 6), 700);
    }

    function stopPendingSpears() {
        if (pendingSpearTimer) {
            window.clearInterval(pendingSpearTimer);
            pendingSpearTimer = 0;
        }
    }

    // Rarity-coloured spear volley on the pending overlay just before the
    // reveal grid replaces it (denser/faster for epic and legendary pulls).
    function finishPendingSpears(cards) {
        stopPendingSpears();
        const overlay = document.querySelector('.pack-opening-pending');
        const layer = overlay?.querySelector('.gacha-spear-layer');
        if (!overlay || !layer) return Promise.resolve();
        const rarity = topPullRarity(cards);
        const color = rarityColor(rarity);
        overlay.style.setProperty('--spear-color', color);
        overlay.classList.add(`is-${rarity.toLowerCase()}`);
        spawnLightSpears(layer, color, rarity === 'LEGENDARY' ? 26 : rarity === 'EPIC' ? 20 : 14, true);
        return new Promise(resolve => window.setTimeout(resolve, 760));
    }

    function packOpenRequestStorageKey() {
        const userId = state.profile?.user?.id || state.profile?.user?.email || 'anonymous';
        return `${PENDING_PACK_OPEN_REQUEST_KEY}:${userId}`;
    }

    function createPackOpenRequestId() {
        try {
            if (window.crypto?.randomUUID) {
                return window.crypto.randomUUID();
            }
        } catch (error) {
            // Fall through to the timestamp/random fallback below.
        }
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function readPendingPackOpenRequest(packId, count) {
        try {
            const raw = localStorage.getItem(packOpenRequestStorageKey());
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (entry?.packId === packId && Number(entry.count) === Number(count) && entry.requestId) {
                return entry;
            }
        } catch (error) {
            // Treat malformed or unavailable storage as no pending retry.
        }
        return null;
    }

    function getOrCreatePackOpenRequestId(packId, count) {
        const pending = readPendingPackOpenRequest(packId, count);
        if (pending?.requestId) return pending.requestId;
        const requestId = createPackOpenRequestId();
        try {
            localStorage.setItem(packOpenRequestStorageKey(), JSON.stringify({
                requestId,
                packId,
                count,
                createdAt: Date.now()
            }));
        } catch (error) {
            // Idempotency still works for the current request; persistence is best effort.
        }
        return requestId;
    }

    function clearPackOpenRequestId(requestId) {
        try {
            const key = packOpenRequestStorageKey();
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const entry = JSON.parse(raw);
            if (!requestId || entry?.requestId === requestId) {
                localStorage.removeItem(key);
            }
        } catch (error) {
            try { localStorage.removeItem(packOpenRequestStorageKey()); } catch (ignored) { /* ignore */ }
        }
    }

    async function choosePack(packId, count = 1) {
        if (!state.profile?.authenticated) {
            openAuth();
            return;
        }
        if (state.packOpeningPending) {
            return;
        }
        const starterMode = state.progression && !state.progression.starterChosen;
        const endpoint = starterMode ? '/api/player/starter-pack' : '/api/shop/open-pack';
        const pack = state.packs.find(item => item.id === packId) || null;
        // Starter pulls are always single; bulk only applies to normal shop buys.
        const packCount = starterMode ? 1 : Math.max(1, Math.min(Number(count) || 1, BULK_PACK_COUNT));
        const requestId = starterMode ? null : getOrCreatePackOpenRequestId(packId, packCount);
        state.packOpeningPending = { packId, startedAt: Date.now(), element: pack?.elements?.[0] || 'FIRE', name: pack?.name || 'Pack', count: packCount };
        state.packOpeningDismissedKey = '';
        navigateHub('shop', { shopView: 'cardpack' });
        renderPackOpeningPending();
        renderShop();

        // Phase 1 — the network call. fetchJson resolves to {error} for
        // network/timeout/HTTP failures, but guard against any unexpected throw so
        // the pending overlay is always torn down.
        let data;
        try {
            data = await fetchJson(endpoint, {
                method: 'POST',
                body: JSON.stringify({ packId, count: packCount, requestId }),
                timeoutMs: PACK_OPEN_TIMEOUT_MS
            });
        } catch (error) {
            data = { error: error?.message || 'Could not open that pack. Please try again.' };
        }

        // The pull never succeeded on the server, so nothing was charged or
        // granted — surface the error and let the player retry safely.
        if (!data || data.error) {
            state.packOpeningPending = null;
            if (!data?.timedOut) clearPackOpenRequestId(requestId);
            hidePackResultDom();
            renderShop();
            syncShopPackView();
            alert(data?.error || 'Could not open that pack. Please try again.');
            return;
        }

        // Phase 2 — commit the server result. The cards are already granted and
        // persisted at this point, so apply progression FIRST. This way a hiccup in
        // the heavy reveal animation can never lose the cards or, worse, surface a
        // "could not open" error that tricks the player into paying for the pack
        // again.
        state.progression = data.progression;
        state.packs = data.packs || state.packs;
        state.dailyOffers = data.dailyOffers || state.dailyOffers;
        state.titleCatalog = data.titleCatalog || state.titleCatalog || state.progression?.playerTitles || [];
        clearPackOpenRequestId(requestId);
        const latest = state.progression?.packHistory?.[0];
        if (latest) {
            pushNotification('pack', `Pack opened: ${pack?.name || latest.packId || 'Card pack'}`, `${(latest.cards || []).length} cards added to your binder.`);
        }
        if (notifSnapshot) notifSnapshot.gold = Number(state.progression?.gold) || notifSnapshot.gold;
        // Tag the freshly pulled cards as "New" until the player opens them.
        detectNewCards();
        state.packOpeningDismissedKey = '';
        state.packReveal = latest ? {
            packId: latest.packId,
            openedAt: latest.openedAt,
            revealed: new Set(),
            dissolvedRemnants: new Set(),
            lastRevealedId: '',
            previewId: '',
            sparkColor: elementColor(latest.cards?.[0]?.element || 'FIRE')
        } : null;
        if (starterMode) {
            const serverPrefs = applyProfileSettingsFromServer(data.profileSettings);
            if (serverPrefs) {
                state.profilePrefs = { ...defaultProfilePrefs(state.profile?.user || {}), ...serverPrefs };
                cacheProfilePrefs(state.profilePrefs);
                applyProfileArtFromPrefs(state.profilePrefs);
            } else {
                applyStarterProfileDefaults();
            }
        }

        // Phase 3 — the (heavy) reveal animation. If anything here throws, the
        // cards are already safely in the binder, so don't strand the player on a
        // half-built overlay: clear it and drop them into the Cards binder where the
        // new pulls are waiting, tagged "New".
        try {
            await finishPendingSpears(latest?.cards || []);
            state.packOpeningPending = null;
            renderPackResult();
            render();
        } catch (revealError) {
            console.error(revealError);
            state.packOpeningPending = null;
            hidePackResultDom();
            render();
            navigateHub('cards');
        }
        void loadDailyMissions().then(() => {
            renderHomeDashboard();
            renderAchievements();
            renderProfile();
        });
    }

    async function purchaseDailyOffer(offerId) {
        if (!state.profile?.authenticated) {
            openAuth();
            return;
        }
        const data = await fetchJson('/api/shop/purchase-card', { method: 'POST', body: JSON.stringify({ offerId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        state.packs = data.packs || state.packs;
        state.dailyOffers = data.dailyOffers || state.dailyOffers;
        state.titleCatalog = data.titleCatalog || state.titleCatalog || state.progression?.playerTitles || [];
        detectNewCards();
        render();
    }

    function packSessionKey(latest) {
        return `${latest.packId || 'pack'}:${latest.openedAt || ''}`;
    }

    function ensurePackResultOverlayRoot(result) {
        if (!result) return;
        // Teleport the reveal to <body> so no ancestor's layout/stacking/transform
        // can confine the fixed full-screen overlay (which clipped the card grid).
        if (result.parentElement !== document.body) {
            document.body.appendChild(result);
        }
    }

    function renderPackResult(options = {}) {
        const result = document.getElementById('packResult');
        const latest = state.progression?.packHistory?.[0];
        if (!result || !latest) return;
        const reveal = ensurePackReveal(latest);
        const cards = packRevealCards(latest);
        const sessionKey = packSessionKey(latest);
        const opening = result.querySelector('.pack-opening');
        const sameSession = opening?.dataset.packKey === sessionKey;
        document.body.classList.add('gacha-active');
        result.classList.remove('hidden');
        ensurePackResultOverlayRoot(result);

        if (!sameSession || options.rebuild) {
            const revealedCount = reveal.revealed.size;
            const heading = gachaHeading(cards[0]?.element || 'FIRE', cards.length);
            const previewCard = reveal.previewId ? cards.find(card => card.revealId === reveal.previewId) : null;
            result.innerHTML = buildPackOpeningMarkup({
                latest,
                cards,
                reveal,
                heading,
                revealedCount,
                previewCard,
                sessionKey
            });
            const stage = result.querySelector('.gacha-stage');
            if (stage) {
                stage.classList.add('is-initial');
                window.setTimeout(() => stage.classList.remove('is-initial'), Math.min(1400, 700 + cards.length * 80));
            }
            if (typeof initGachaParticles === 'function') {
                initGachaParticles(result.querySelector('.pack-opening'), elementColor(cards[0]?.element || 'FIRE'));
            }
            scheduleGachaCardFit();
            return;
        }

        patchPackOpening({ result, latest, cards, reveal });
        scheduleGachaCardFit();
    }

    function renderPackOpeningPending() {
        const result = document.getElementById('packResult');
        if (!result || !state.packOpeningPending) return;
        const element = state.packOpeningPending.element || 'FIRE';
        const packName = state.packOpeningPending.name || 'Pack';
        document.body.classList.add('gacha-active');
        result.classList.remove('hidden');
        ensurePackResultOverlayRoot(result);
        result.innerHTML = `<section class="pack-opening pack-opening-pending" role="status" aria-live="polite" aria-label="Opening ${escapeAttr(packName)}" style="--pack-glow:${elementColor(element)};--spark-glow:${elementColor(element)}">
            <div class="gacha-particles" aria-hidden="true"></div>
            <div class="pack-opening-head">
                <div>
                    <span class="eyebrow">Gacha reveal</span>
                    <h2>Opening ${escapeHtml(packName)}</h2>
                    <p>The seal is breaking. Your cards will appear as soon as the pull resolves.</p>
                </div>
            </div>
            <div class="gacha-spear-layer" aria-hidden="true"></div>
            <div class="gacha-stage gacha-stage-pending">
                <div class="pack-opening-spinner" aria-hidden="true"></div>
                <strong>Drawing cards...</strong>
            </div>
        </section>`;
        startPendingSpears(element);
    }

    function scheduleGachaCardFit() {
        window.SieglingsCardShowcase?.scheduleFramedSummaryFit?.();
        window.SieglingsCardShowcase?.scheduleSiegeKnightCardFit?.();
    }

    function buildPackOpeningMarkup({ latest, cards, reveal, heading, revealedCount, previewCard, sessionKey }) {
        const duplicateRemnants = Number(latest.remnantsFromDuplicates) || cards.reduce((sum, card) => sum + (Number(card.remnantsAwarded) || 0), 0);
        const duplicateCount = cards.filter(card => card.duplicateAtCap).length;
        const duplicateNote = duplicateCount
            ? ` <span class="pack-duplicate-note">${duplicateCount} pull${duplicateCount === 1 ? '' : 's'} at the 3-copy limit become Remnants${duplicateRemnants ? ` (+${duplicateRemnants.toLocaleString()}).` : '.'}</span>`
            : '';
        return `<section class="pack-opening" data-pack-key="${escapeAttr(sessionKey)}" role="dialog" aria-modal="true" aria-label="${escapeAttr(latest.packName)} gacha reveal" style="--pack-glow:${elementColor(cards[0]?.element || 'FIRE')};--spark-glow:${reveal.sparkColor || elementColor(cards[0]?.element || 'FIRE')}">
            <div class="gacha-particles" aria-hidden="true"></div>
            <div class="pack-opening-head">
                <div>
                    <span class="eyebrow">${escapeHtml(heading.eyebrow)}</span>
                    <h2>${escapeHtml(heading.title)}</h2>
                    <p>${escapeHtml(heading.sub)} <span class="pack-progress">${revealedCount}/${cards.length} unsealed</span>${duplicateNote}</p>
                </div>
                <div class="pack-opening-actions">
                    <button class="ghost-btn" type="button" data-reveal-all-pack>Reveal All</button>
                    <button class="primary-btn" type="button" data-clear-pack-result>Done</button>
                </div>
            </div>
            <canvas class="gacha-particles" aria-hidden="true"></canvas>
            <div class="gacha-stage">
                ${cards.map((card, index) => renderRevealCard(card, reveal.revealed.has(card.revealId), latest.packId, index)).join('')}
            </div>
            ${previewCard ? renderRevealPreview(previewCard) : ''}
        </section>`;
    }

    function buildPackTrainerBanner(trainer) {
        if (!trainer) return '';
        const name = escapeHtml(trainer.name || 'SiegeKnight');
        const level = Math.max(1, Number(trainer.level) || 1);
        let tag;
        let detail;
        if (trainer.newlyOwned) {
            tag = 'New SiegeKnight!';
            detail = `${name} joins your roster.`;
        } else if (trainer.leveledUp) {
            tag = `Combined to Lv ${level}!`;
            detail = `${name} grows stronger (+${Math.max(0, level - 1)} to ability effects).`;
        } else {
            const remaining = Math.max(0, (Number(trainer.pointsForNext) || 0) - (Number(trainer.points) || 0));
            tag = 'SiegeKnight Combine Point';
            detail = level >= 5
                ? `${name} is already at max level.`
                : `${name} gains a combine point${remaining ? ` (${remaining} more to Lv ${level + 1}).` : '.'}`;
        }
        return `<div class="pack-trainer-banner">
            <span class="pack-trainer-tag">${escapeHtml(tag)}</span>
            <span class="pack-trainer-detail">${escapeHtml(detail)}</span>
        </div>`;
    }

    function patchPackOpening({ result, latest, cards, reveal }) {
        const opening = result.querySelector('.pack-opening');
        if (!opening) return;
        const elementGlow = elementColor(cards[0]?.element || 'FIRE');
        opening.style.setProperty('--pack-glow', elementGlow);
        opening.style.setProperty('--spark-glow', reveal.sparkColor || elementGlow);
        const progress = opening.querySelector('.pack-progress');
        if (progress) progress.textContent = `${reveal.revealed.size}/${cards.length} unsealed`;

        const stage = opening.querySelector('.gacha-stage');
        if (!stage) return;
        const animateId = reveal.lastRevealedId || '';
        cards.forEach((card, index) => {
            const selector = `[data-reveal-card="${escapeAttr(card.revealId)}"]`;
            let btn = stage.querySelector(selector);
            const revealed = reveal.revealed.has(card.revealId);
            if (!btn) {
                stage.insertAdjacentHTML('beforeend', renderRevealCard(card, revealed, latest.packId, index));
                btn = stage.querySelector(selector);
            }
            if (!btn) return;
            const wasRevealed = btn.classList.contains('is-revealed');
            btn.classList.toggle('is-revealed', revealed);
            if (revealed) hydrateRevealCardFront(btn, card);
            if (revealed && !wasRevealed && animateId === card.revealId) {
                if (card.duplicateAtCap && card.remnantsAwarded > 0 && !reveal.dissolvedRemnants.has(card.revealId)) {
                    window.setTimeout(() => playRemnantDissolve(btn, card, () => renderPackResult()), 720);
                } else {
                    triggerRevealCardAnimation(btn);
                }
            }
            if (reveal.dissolvedRemnants.has(card.revealId)) {
                btn.classList.add('is-remnant-resolved');
                btn.disabled = true;
            }
        });

        const previewCard = reveal.previewId ? cards.find(card => card.revealId === reveal.previewId) : null;
        patchPackPreview(opening, previewCard);
        scheduleGachaCardFit();
    }

    function patchPackPreview(opening, previewCard) {
        const existing = opening.querySelector('.reveal-preview');
        if (!previewCard) {
            existing?.remove();
            return;
        }
        const markup = renderRevealPreview(previewCard);
        if (existing) existing.outerHTML = markup;
        else opening.insertAdjacentHTML('beforeend', markup);
    }

    function triggerRevealCardAnimation(cardEl) {
        if (!cardEl) return;
        cardEl.classList.remove('is-animating');
        void cardEl.offsetWidth;
        cardEl.classList.add('is-animating');
        const finish = (event) => {
            if (event.target !== cardEl) return;
            cardEl.classList.remove('is-animating');
        };
        cardEl.addEventListener('animationend', finish, { once: true });
    }

    function ensurePackReveal(latest) {
        const samePack = state.packReveal
            && state.packReveal.packId === latest.packId
            && state.packReveal.openedAt === latest.openedAt;
        if (!samePack) {
            state.packReveal = {
                packId: latest.packId,
                openedAt: latest.openedAt,
                revealed: new Set(),
                dissolvedRemnants: new Set(),
                lastRevealedId: '',
                previewId: '',
                sparkColor: elementColor(latest.cards?.[0]?.element || 'FIRE')
            };
        } else if (!state.packReveal.dissolvedRemnants) {
            state.packReveal.dissolvedRemnants = new Set();
        }
        return state.packReveal;
    }

    function particleThemeForElement(element) {
        const normalized = String(element || 'FIRE').toUpperCase();
        if (normalized === 'EARTH') return 'earth';
        if (normalized === 'ICE' || normalized === 'WATER') return 'ice';
        if (normalized === 'WIND') return 'wind';
        return 'fire';
    }

    function enrichPackCard(card, index) {
        const catalogCard = findCard(card.id) || {};
        const duplicateAtCap = Boolean(card.duplicateAtCap ?? (card.granted === false && Number(card.remnantsAwarded) > 0));
        const remnantsAwarded = Number(card.remnantsAwarded) || (duplicateAtCap ? duplicateRemnantPreview(card.rarity || catalogCard.rarity) : 0);
        return {
            ...catalogCard,
            ...card,
            revealId: `${card.id || 'card'}-${index}`,
            type: card.type || catalogCard.type,
            element: card.element || catalogCard.element || 'FIRE',
            rarity: card.rarity || catalogCard.rarity || 'COMMON',
            notches: catalogCard.notches || card.notches || [],
            abilities: catalogCard.abilities || card.abilities || [],
            health: catalogCard.health ?? card.health,
            speed: catalogCard.speed ?? card.speed,
            preferredRow: catalogCard.preferredRow || card.preferredRow,
            costAmount: catalogCard.costAmount ?? card.costAmount,
            costElement: catalogCard.costElement || card.costElement || card.element || catalogCard.element,
            duplicateAtCap,
            remnantsAwarded
        };
    }

    function packRevealCards(latest) {
        const cards = (latest?.cards || []).map((card, index) => enrichPackCard(card, index));
        const trainerCard = trainerRevealCard(latest, cards.length);
        return trainerCard ? [...cards, trainerCard] : cards;
    }

    function trainerRevealCard(latest, index) {
        const trainer = latest?.trainer;
        if (!trainer?.id) return null;
        const option = (state.options?.trainers || []).find(item => String(item.id || '').toLowerCase() === String(trainer.id).toLowerCase());
        const element = trainer.element || option?.element || starterElementFromPackId(latest.packId).toUpperCase() || latest.cards?.[0]?.element || 'FIRE';
        const abilityText = (ability) => typeof ability === 'string'
            ? ability
            : (ability?.description || ability?.name || '');
        const abilities = [
            option?.passive ? { name: 'Passive', description: abilityText(option.passive) } : null,
            option?.active ? { name: option.oncePerGame ? 'Ultimate' : 'Active', description: abilityText(option.active) } : null
        ].filter(Boolean);
        return {
            id: trainer.id,
            name: trainer.name || option?.name || 'SiegeKnight',
            type: 'SIEGEKNIGHT',
            element,
            rarity: trainer.rarity || option?.rarity || 'COMMON',
            tier: trainer.tier || option?.tier || 'SiegeKnight',
            level: trainer.level || option?.level || 1,
            owned: true,
            passive: option?.passive,
            active: option?.active,
            oncePerGame: trainer.oncePerGame ?? option?.oncePerGame,
            cardArtUrl: trainer.cardArtUrl || option?.cardArtUrl || '',
            cardArtMode: trainer.cardArtMode || option?.cardArtMode || '',
            cardArtOffsetX: trainer.cardArtOffsetX ?? option?.cardArtOffsetX,
            cardArtOffsetY: trainer.cardArtOffsetY ?? option?.cardArtOffsetY,
            cardArtScale: trainer.cardArtScale ?? option?.cardArtScale,
            cardArtRotation: trainer.cardArtRotation ?? option?.cardArtRotation,
            holographic: trainer.holographic === true || option?.holographic === true,
            abilities,
            description: abilities.map(ability => ability.description).filter(Boolean).join(' '),
            revealId: `${trainer.id || 'trainer'}-${index}`,
            duplicateAtCap: false,
            remnantsAwarded: 0
        };
    }

    function duplicateRemnantPreview(rarity) {
        return DUPLICATE_REMNANT_PREVIEW[String(rarity || 'COMMON').toUpperCase()] || DUPLICATE_REMNANT_PREVIEW.COMMON;
    }

    function isRemnantDissolved(revealId) {
        return Boolean(state.packReveal?.dissolvedRemnants?.has(revealId));
    }

    function renderRevealRemnantFace(card) {
        const remnants = Number(card.remnantsAwarded) || duplicateRemnantPreview(card.rarity);
        return `<span class="reveal-face reveal-front reveal-remnant-face">
            <span class="remnant-dust-layer" aria-hidden="true"></span>
            <span class="remnant-sigil">Rem</span>
            <span class="reveal-card-copy">
                <small>Max copies owned</small>
                <strong>+${escapeHtml(remnants.toLocaleString())} Remnants</strong>
                <span class="reveal-rarity">${escapeHtml(card.name || 'Card')} turned to dust</span>
            </span>
        </span>`;
    }

    function renderRevealCard(card, revealed, packId = '', index = 0) {
        const rarity = card.rarity || 'COMMON';
        const element = card.element || 'FIRE';
        const dissolved = isRemnantDissolved(card.revealId);
        const remnantPull = Boolean(card.duplicateAtCap && card.remnantsAwarded > 0);
        const showRemnantFace = remnantPull && revealed && dissolved;
        const ownedPreview = Math.max(1, Math.min(3, ownedCount(card.id) || (revealed && !remnantPull ? 1 : 0)));
        if (showRemnantFace) {
            return `<button class="reveal-card is-revealed is-remnant-pull is-remnant-resolved rarity-${String(rarity).toLowerCase()}" type="button" data-reveal-card="${escapeAttr(card.revealId)}" data-remnants="${Number(card.remnantsAwarded) || 0}" data-duplicate-at-cap="true" style="--el:${elementColor(element)};--rarity:${rarityColor(rarity)};--pack-back:${packBackForElement(element, packId)};--slot:${index}" disabled aria-label="${escapeAttr(card.name || 'Card')} converted into Remnants">
                <span class="rarity-burst" aria-hidden="true"></span>
                <span class="reveal-dust-burst" aria-hidden="true"></span>
                <span class="reveal-face reveal-back" aria-hidden="true"></span>
                ${renderRevealRemnantFace(card)}
            </button>`;
        }
        return `<button class="reveal-card${revealed ? ' is-revealed' : ''}${remnantPull ? ' is-remnant-pull' : ''} rarity-${String(rarity).toLowerCase()}" type="button" data-reveal-card="${escapeAttr(card.revealId)}" data-remnants="${Number(card.remnantsAwarded) || 0}" data-duplicate-at-cap="${remnantPull ? 'true' : 'false'}" style="--el:${elementColor(element)};--rarity:${rarityColor(rarity)};--pack-back:${packBackForElement(element, packId)};--slot:${index}" aria-label="${revealed ? escapeAttr(card.name || 'Revealed card') : 'Mystery card'}">
            <span class="rarity-burst" aria-hidden="true"></span>
            <span class="reveal-dust-burst" aria-hidden="true"></span>
            <span class="reveal-face reveal-back" aria-hidden="${revealed ? 'true' : 'false'}"></span>
            <span class="reveal-face reveal-front" aria-hidden="${revealed ? 'false' : 'true'}">
                ${revealed ? renderRevealFrontContent(card, ownedPreview) : ''}
            </span>
        </button>`;
    }

    function renderRevealFrontContent(card, ownedPreview) {
        const binderVisual = window.SieglingsCardBinderVisual;
        if (card?.type === 'SIEGEKNIGHT') {
            return `<div class="gacha-card-front gacha-knight-card-front">
                ${renderKnightBinderCard(card, { showOwnership: false, showXp: false, extraClass: 'gacha-knight-card' })}
            </div>`;
        }
        if (card?.type !== 'SIEGEKNIGHT' && binderVisual?.renderBinderCardPreview
            && (binderVisual?.usesFullCardArt?.(card) || binderVisual?.usesFramedCardTemplate?.(card))) {
            return binderVisual.renderBinderCardPreview(card, {
                ownedOverride: ownedPreview,
                previewClass: 'gacha-card-front',
                compactAbilityLimit: 2,
                summaryMode: 'description',
                descriptionText: shopCardDescriptionFor(card)
            });
        }
        return `<div class="card-tile binder-card gacha-card-front" style="--el:${elementColor(card.element || 'FIRE')}">
            ${renderBinderCardShell(card, { ownedOverride: ownedPreview })}
        </div>`;
    }

    function hydrateRevealCardFront(cardEl, card) {
        if (!cardEl || !card) return;
        const remnantPull = Boolean(card.duplicateAtCap && card.remnantsAwarded > 0);
        const ownedPreview = Math.max(1, Math.min(3, ownedCount(card.id) || (!remnantPull ? 1 : 0)));
        const front = cardEl.querySelector('.reveal-front');
        if (front && !front.innerHTML.trim()) {
            front.innerHTML = renderRevealFrontContent(card, ownedPreview);
            scheduleGachaCardFit();
        }
        front?.setAttribute('aria-hidden', 'false');
        cardEl.querySelector('.reveal-back')?.setAttribute('aria-hidden', 'true');
        cardEl.setAttribute('aria-label', card.name || 'Revealed card');
    }

    function spawnRemnantDust(cardEl) {
        const host = cardEl.querySelector('.reveal-dust-burst');
        if (!host) return;
        host.innerHTML = '';
        const count = 18;
        for (let i = 0; i < count; i += 1) {
            const speck = document.createElement('span');
            speck.className = 'remnant-dust-speck';
            const angle = (Math.PI * 2 * i) / count;
            const distance = 28 + Math.random() * 42;
            speck.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
            speck.style.setProperty('--dy', `${Math.sin(angle) * distance - 18}px`);
            speck.style.setProperty('--delay', `${Math.random() * 0.18}s`);
            host.appendChild(speck);
        }
    }

    function playRemnantDissolve(cardEl, card, onDone) {
        if (!cardEl || !card?.duplicateAtCap) {
            onDone?.();
            return;
        }
        cardEl.classList.add('is-revealed', 'is-animating', 'is-dissolving');
        spawnRemnantDust(cardEl);
        window.setTimeout(() => {
            const reveal = state.packReveal;
            if (reveal) reveal.dissolvedRemnants.add(card.revealId);
            cardEl.classList.remove('is-dissolving', 'is-animating', 'is-new-reveal');
            cardEl.classList.add('is-remnant-resolved');
            cardEl.disabled = true;
            const remnants = Number(card.remnantsAwarded) || duplicateRemnantPreview(card.rarity);
            cardEl.innerHTML = `<span class="rarity-burst" aria-hidden="true"></span><span class="reveal-dust-burst" aria-hidden="true"></span>
                <span class="reveal-face reveal-back" aria-hidden="true"></span>
                ${renderRevealRemnantFace(card).trim()}`;
            cardEl.setAttribute('aria-label', `${card.name || 'Card'} converted into ${remnants} Remnants`);
            renderGold();
            onDone?.();
        }, 1180);
    }

    function revealPackCard(revealId, options = {}) {
        const latest = state.progression?.packHistory?.[0];
        if (!latest) return;
        const reveal = ensurePackReveal(latest);
        if (reveal.dissolvedRemnants.has(revealId)) return;
        const card = packRevealCards(latest).find(item => item.revealId === revealId);
        if (!card) return;
        if (reveal.revealed.has(revealId)) return;
        reveal.revealed.add(revealId);
        reveal.lastRevealedId = revealId;
        if (options.openPreview) reveal.previewId = revealId;
        reveal.sparkColor = rarityColor(card?.rarity || 'COMMON');
        reveal.particleElement = card?.element || reveal.particleElement;
        renderPackResult();
    }

    function openPackPreview(revealId) {
        const latest = state.progression?.packHistory?.[0];
        if (!latest) return;
        const reveal = ensurePackReveal(latest);
        reveal.previewId = revealId;
        reveal.lastRevealedId = '';
        const result = document.getElementById('packResult');
        const cards = packRevealCards(latest);
        const opening = result?.querySelector('.pack-opening');
        if (opening && opening.dataset.packKey === packSessionKey(latest)) {
            patchPackPreview(opening, cards.find(card => card.revealId === revealId));
            return;
        }
        renderPackResult();
    }

    function closePackPreview() {
        const reveal = state.packReveal;
        if (!reveal) return;
        reveal.previewId = '';
        reveal.lastRevealedId = '';
        const latest = state.progression?.packHistory?.[0];
        const opening = document.getElementById('packResult')?.querySelector('.pack-opening');
        if (latest && opening && opening.dataset.packKey === packSessionKey(latest)) {
            patchPackPreview(opening, null);
            return;
        }
        renderPackResult();
    }

    function gachaHeading(element, count) {
        const lore = {
            FIRE: { title: 'Relics of the Flame Uncovered', sub: 'Embers stir within the seal — each one waiting to ignite.' },
            EARTH: { title: 'Stones of the Old World Stir', sub: 'Ancient roots tremble — something buried longs to wake.' },
            WIND: { title: 'Whispers of the Gale Gather', sub: 'The air hums with hidden names yet to be spoken.' },
            WATER: { title: 'Tides of the Deep Surface', sub: 'From the abyss, forgotten currents rise to be claimed.' },
            ICE: { title: 'Frostbound Relics Awaken', sub: 'Beneath the rime, sealed power begins to thaw.' },
            SHADOW: { title: 'Secrets of the Veil Emerge', sub: 'Shapes shift in the dark, eager to be seen.' },
            ELECTRIC: { title: 'A Charge of Fates Crackles', sub: 'Static gathers — destiny waits for the spark.' },
            METAL: { title: 'Forged Legacies Unsealed', sub: 'Cold steel remembers the hands that shaped it.' },
            UNDEAD: { title: 'The Restless Are Summoned', sub: 'What was buried does not stay still for long.' },
            PSYCHIC: { title: 'Echoes of the Mind Converge', sub: 'Thoughts not your own press against the seal.' }
        };
        const entry = lore[String(element || '').toUpperCase()] || { title: 'Relics Uncovered', sub: 'Unknown powers wait beyond the seal.' };
        const words = ['no', 'a single', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
        const pulls = words[count] || `${count}`;
        return {
            eyebrow: 'Gacha reveal',
            title: entry.title,
            sub: `${pulls.charAt(0).toUpperCase() + pulls.slice(1)} sealed pulls wait inside — tap each to reveal its fate. ${entry.sub}`
        };
    }

    function renderRevealPreview(card) {
        const element = card.element || 'FIRE';
        const rarity = card.rarity || 'COMMON';
        const binderVisual = window.SieglingsCardBinderVisual;
        if (card?.type === 'SIEGEKNIGHT') {
            return `<div class="reveal-preview" data-preview-backdrop style="--el:${elementColor(element)};--rarity:${rarityColor(rarity)}">
                <div class="reveal-preview-card reveal-preview-card-template" role="dialog" aria-modal="true" aria-label="${escapeAttr(card.name || 'SiegeKnight')} preview">
                    <button class="reveal-preview-close" type="button" data-close-preview aria-label="Back to pack">&times;</button>
                    <div class="reveal-preview-template reveal-preview-template-knight">
                        ${renderKnightBinderCard(card, { showOwnership: false, showXp: false, extraClass: 'gacha-preview-card' })}
                    </div>
                    <button class="ghost-btn reveal-preview-back" type="button" data-close-preview>Back to pack</button>
                </div>
            </div>`;
        }
        if (card?.type !== 'SIEGEKNIGHT' && binderVisual?.renderBinderCardPreview
            && (binderVisual?.usesFullCardArt?.(card) || binderVisual?.usesFramedCardTemplate?.(card))) {
            const ownedPreview = Math.max(1, Math.min(3, ownedCount(card.id) || 1));
            return `<div class="reveal-preview" data-preview-backdrop style="--el:${elementColor(element)};--rarity:${rarityColor(rarity)}">
                <div class="reveal-preview-card reveal-preview-card-template" role="dialog" aria-modal="true" aria-label="${escapeAttr(card.name || 'Card')} preview">
                    <button class="reveal-preview-close" type="button" data-close-preview aria-label="Back to pack">&times;</button>
                    <div class="reveal-preview-template">
                        ${binderVisual.renderBinderCardPreview(card, {
                            ownedOverride: ownedPreview,
                            previewClass: 'detail-card-preview gacha-preview-card',
                            compactAbilityLimit: 3,
                            summaryMode: 'description',
                            descriptionText: shopCardDescriptionFor(card)
                        })}
                    </div>
                    <button class="ghost-btn reveal-preview-back" type="button" data-close-preview>Back to pack</button>
                </div>
            </div>`;
        }
        const isSiegling = card.type === 'SIEGLING';
        const abilities = card.abilities || (card.ability ? [card.ability] : []);
        const flavor = creatureDescriptionFor(card);
        const cost = revealCardEnergyCost(card);
        return `<div class="reveal-preview" data-preview-backdrop style="--el:${elementColor(element)};--rarity:${rarityColor(rarity)}">
            <div class="reveal-preview-card" role="dialog" aria-modal="true" aria-label="${escapeAttr(card.name || 'Card')} preview">
                <button class="reveal-preview-close" type="button" data-close-preview aria-label="Back to pack">&times;</button>
                <div class="reveal-preview-art">
                    ${isSiegling ? renderRevealNotches(card.notches) : ''}
                    ${renderRevealCardArt(element)}
                </div>
                <div class="reveal-preview-body">
                    <small>${escapeHtml(format(card.type))} / ${escapeHtml(format(element))}</small>
                    <h3>${escapeHtml(card.name || 'Unknown Card')}</h3>
                    <span class="reveal-rarity">${escapeHtml(format(rarity))}</span>
                    ${isSiegling ? `<div class="reveal-preview-stats"><span>HP ${escapeHtml(card.health ?? '-')}</span><span>SPD ${escapeHtml(card.speed ?? '-')}</span></div>` : ''}
                    <div class="reveal-preview-cost">${cost > 0 ? `Cost ${cost} ${escapeHtml(format(card.costElement || element))}` : 'No energy cost'}</div>
                    ${flavor ? `<p class="reveal-preview-flavor">${escapeHtml(flavor)}</p>` : ''}
                    ${abilities.length ? abilities.map(a => `<p class="reveal-preview-ability"><strong>${escapeHtml(a.name || 'Ability')}</strong> ${escapeHtml(a.description || '')}</p>`).join('') : ''}
                </div>
                <button class="ghost-btn reveal-preview-back" type="button" data-close-preview>Back to pack</button>
            </div>
        </div>`;
    }

    function revealAllPackCards() {
        const latest = state.progression?.packHistory?.[0];
        if (!latest) return;
        const reveal = ensurePackReveal(latest);
        const cards = packRevealCards(latest);
        cards.forEach(card => reveal.revealed.add(card.revealId));
        reveal.lastRevealedId = '';
        reveal.sparkColor = elementColor(latest.cards?.[0]?.element || 'FIRE');
        reveal.particleElement = latest.cards?.[0]?.element || reveal.particleElement || 'FIRE';
        renderPackResult();
        const result = document.getElementById('packResult');
        cards.filter(card => card.duplicateAtCap && card.remnantsAwarded > 0).forEach((card, order) => {
            window.setTimeout(() => {
                const button = result?.querySelector(`[data-reveal-card="${CSS.escape(card.revealId)}"]`);
                if (button && !reveal.dissolvedRemnants.has(card.revealId)) {
                    playRemnantDissolve(button, card, () => renderPackResult());
                }
            }, 520 + order * 420);
        });
    }

    function hidePackResultDom() {
        stopPendingSpears();
        destroyGachaParticles();
        document.body.classList.remove('gacha-active');
        const result = document.getElementById('packResult');
        if (result) {
            result.classList.add('hidden');
            result.innerHTML = '';
        }
    }

    function shouldShowPackOpening() {
        if (!state.packReveal) return false;
        const latest = state.progression?.packHistory?.[0];
        if (!latest) return false;
        return state.packOpeningDismissedKey !== packSessionKey(latest);
    }

    function syncShopPackView() {
        if (state.route !== 'shop') {
            if (!shouldShowPackOpening()) hidePackResultDom();
            else {
                document.getElementById('packResult')?.classList.add('hidden');
                document.body.classList.remove('gacha-active');
            }
            return;
        }
        if (state.shopView === 'cardpack' && state.packOpeningPending) {
            renderPackOpeningPending();
            return;
        }
        if (state.shopView === 'cardpack' && shouldShowPackOpening()) {
            renderPackResult();
            return;
        }
        hidePackResultDom();
        if (state.shopView === 'cardpack') {
            state.shopView = 'browse';
            history.replaceState(null, '', hubPath('shop', 'browse'));
        }
    }

    function clearPackResult() {
        const latest = state.progression?.packHistory?.[0];
        if (latest) state.packOpeningDismissedKey = packSessionKey(latest);
        state.packReveal = null;
        hidePackResultDom();
        navigateHub('shop', { shopView: 'browse', replace: true });
        renderShop();
    }

    function revealCardEnergyCost(card) {
        const directCost = Number(card?.costAmount);
        if (Number.isFinite(directCost) && directCost > 0) return directCost;
        const trapCost = Number(card?.trapBucketAmount);
        if (Number.isFinite(trapCost) && trapCost > 0) return trapCost;
        const comboCost = Number(card?.requiredComboSize);
        if (Number.isFinite(comboCost) && comboCost > 0) return comboCost;
        return 0;
    }

    function renderRevealNotches(notches = []) {
        const active = new Map((notches || []).map(notch => [String(notch.direction || '').toLowerCase().replace(/_/g, '-'), notch]));
        const directions = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
        return `<span class="reveal-notches" aria-hidden="true">${directions.map(direction => {
            const notch = active.get(direction);
            return `<span class="reveal-notch reveal-notch-${direction}${notch ? ' filled' : ''}" style="${notch ? `--notch:${elementColor(notch.element)}` : ''}"></span>`;
        }).join('')}</span>`;
    }

    function renderRevealCardArt(element) {
        const normalized = String(element || 'FIRE').toUpperCase();
        const iconPath = typeof elementIconPath === 'function' ? elementIconPath(normalized) : '';
        if (iconPath) {
            return `<img class="element-icon-art" src="${escapeAttr(iconPath)}" alt="${escapeAttr(format(normalized))} icon" loading="lazy">`;
        }
        return `<span class="reveal-element-letter">${escapeHtml(format(normalized).slice(0, 1) || '?')}</span>`;
    }

    async function purchaseDeck(deckId) {
        if (!state.profile?.authenticated) return openAuth();
        const data = await fetchJson('/api/shop/purchase-deck', { method: 'POST', body: JSON.stringify({ deckId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        render();
    }

    async function craftSelectedCard(cardId) {
        if (!state.profile?.authenticated) return openAuth();
        const data = await fetchJson('/api/cards/craft', { method: 'POST', body: JSON.stringify({ cardId }) });
        if (data?.error) return alert(data.error);
        if (window.SiegelingsAchievements?.incrementStat) {
            window.SiegelingsAchievements.incrementStat('crafts', 1);
        }
        state.progression = data.progression;
        detectNewCards();
        renderCards();
        renderHomeDashboard();
        renderGold();
        renderProfile();
        renderAchievements();
    }

    async function purchaseHolographicFinish(cardId) {
        if (!state.profile?.authenticated) return openAuth();
        const card = findCard(cardId);
        const holoCost = remnantHolographicCost(card || { rarity: 'COMMON' });
        if (!state.progression?.starterChosen) {
            return alert('Choose a starter pack before upgrading cards.');
        }
        if (remnantBalance() < holoCost) {
            return alert(`You need ${holoCost.toLocaleString()} Remnants for a holographic finish.`);
        }
        const btn = document.getElementById('buyHolographicFinishBtn');
        const btnLabel = btn?.textContent || '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Applying finish...';
        }
        const data = await fetchJson('/api/cards/holographic', { method: 'POST', body: JSON.stringify({ cardId }) });
        if (data?.error) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = btnLabel;
            }
            return alert(data.error);
        }
        if (!data?.progression) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = btnLabel;
            }
            return alert('Unexpected server response. Refresh and try again.');
        }
        applyProgressionUpdate(data.progression);
        playHolographicUnlockAnimation();
        renderCards();
        renderDetail();
        renderHomeDashboard();
        renderGold();
        renderProfile();
    }

    async function buyKnightXp(trainerId) {
        if (!state.profile?.authenticated) return openAuth();
        const data = await fetchJson('/api/knights/buy-xp', { method: 'POST', body: JSON.stringify({ trainerId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        renderCards();
        renderDetail();
        renderHomeDashboard();
        renderGold();
        renderProfile();
    }

    async function saveCustomDeck() {
        if (!state.profile?.authenticated) return openAuth();
        if (!state.progression?.customDeckUnlocked) return alert('Save-ready custom decks unlock once you own 30 total card copies.');
        const cards = builderCards();
        if (cards.length < 30) return alert('Custom decks need 30 cards.');
        const trainerId = builderTrainerId();
        const name = builderDeckName();
        const payload = { trainerId, customDeckCards: cards, name };
        if (state.editingSavedDeckId) payload.id = state.editingSavedDeckId;
        const data = await fetchJson('/api/profile/decks', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (data?.error) return alert(data.error);
        state.profile = data;
        state.progression = data.progression;
        state.editingSavedDeckId = '';
        renderProfile();
        renderDecks();
        navigateHub('decks');
    }

    async function addFriendFromSocial(event) {
        event?.preventDefault();
        if (!state.profile?.authenticated) {
            openAuth();
            return;
        }
        const input = document.getElementById('friendEmailInput');
        const email = input?.value?.trim() || '';
        if (!email) {
            setFriendMessage('Enter a friend email first.', 'error');
            return;
        }
        const data = await fetchJson('/api/profile/friends', { method: 'POST', body: JSON.stringify({ email }) });
        if (data?.error) {
            setFriendMessage(data.error, 'error');
            return;
        }
        state.profile = data;
        state.progression = data.progression || state.progression;
        if (input) input.value = '';
        setFriendMessage('Friend request sent.', 'success');
        renderProfileMini();
        renderFriends();
        renderFriendRequests();
        renderProfile();
    }

    async function respondToFriendRequest(fromUserId, action) {
        if (!state.profile?.authenticated) return openAuth();
        const path = action === 'accept' ? '/api/profile/friends/accept' : '/api/profile/friends/deny';
        const data = await fetchJson(path, { method: 'POST', body: JSON.stringify({ fromUserId }) });
        if (data?.error) {
            setFriendMessage(data.error, 'error');
            return;
        }
        state.profile = data;
        state.progression = data.progression || state.progression;
        setFriendMessage(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.', 'success');
        renderFriends();
        renderFriendRequests();
        renderProfile();
        if (action === 'accept') {
            await refreshFriendPresence();
            renderFriends();
        }
    }

    async function removeFriend(email) {
        if (!state.profile?.authenticated) return openAuth();
        const data = await fetchJson('/api/profile/friends/delete', { method: 'POST', body: JSON.stringify({ email }) });
        if (data?.error) {
            setFriendMessage(data.error, 'error');
            return;
        }
        state.profile = data;
        state.progression = data.progression || state.progression;
        setFriendMessage('Friend removed.', 'success');
        renderFriends();
        renderFriendRequests();
        renderProfile();
    }

    function setFriendMessage(message, type = '') {
        state.friendMessage = message;
        state.friendMessageType = type;
        renderFriends();
    }

    async function createLobbyFromHome() {
        if (state.lobbyBusy) return;
        const existing = readHostLobby();
        if (existing?.roomId) {
            openLobbyWaitingRoom(existing.roomId);
            return;
        }
        if (!state.options?.decks?.length) {
            alert('Deck options are still loading. Try again in a moment.');
            return;
        }
        state.lobbyBusy = true;
        renderSocialActiveLobby();
        try {
            const data = await fetchJson('/api/match/create', {
                method: 'POST',
                body: JSON.stringify(buildSocialMatchBody())
            });
            if (data?.error) {
                alert(data.error);
                return;
            }
            writeHostLobby({
                roomId: data.roomId,
                playerToken: data.playerToken,
                expiresAt: data.expiresAt || null,
                shareUrl: data.shareUrl || buildSocialRoomShareUrl(data.roomId)
            });
            writeLobbySession({
                roomId: data.roomId,
                playerToken: data.playerToken,
                role: 'host'
            });
            saveMultiplayerSession({
                roomId: data.roomId,
                playerToken: data.playerToken,
                viewerSide: data.viewerSide || 'PLAYER'
            });
            state.hostLobbyStatus = data;
            await refreshRooms(true);
            renderSocialActiveLobby();
            ensureHostLobbyPolling();
            openLobbyWaitingRoom(data.roomId, { replace: true });
        } finally {
            state.lobbyBusy = false;
            renderSocialActiveLobby();
        }
    }

    function quickJoinFirstRoom() {
        const room = filteredRooms().find(candidate => !isRoomFull(candidate) && !isOwnLobby(candidate));
        if (!room?.roomId) return;
        openLobbyWaitingRoom(room.roomId);
    }

    async function joinRoomFromHome() {
        const room = document.getElementById('roomCodeInput')?.value?.trim()?.toUpperCase();
        if (!room) return;
        if (isOwnLobbyRoomId(room)) {
            openLobbyWaitingRoom(room);
            return;
        }
        openLobbyWaitingRoom(room);
    }

    function queuePlayLoadout(payload = {}) {
        const savedDeck = selectedSavedDeck();
        const customDeckCards = payload.customDeckCards
            || (savedDeck?.custom && savedDeck.customDeckCards?.length ? savedDeck.customDeckCards : null);
        const loadoutLabel = payload.loadoutLabel
            || (customDeckCards?.length ? (savedDeck?.name || 'Custom Loadout') : '');
        localStorage.setItem(PENDING_LOADOUT_KEY, JSON.stringify({
            createdAt: Date.now(),
            deckId: payload.deckId || selectedDeckId(),
            trainerId: payload.trainerId || selectedTrainerId(),
            mode: payload.mode || 'solo',
            onlineRoomMode: payload.onlineRoomMode || 'join',
            roomId: payload.roomId || '',
            battleLaunch: Boolean(payload.battleLaunch),
            directLoadout: Boolean(payload.directLoadout),
            tutorial: Boolean(payload.tutorial),
            customDeckCards,
            loadoutLabel
        }));
    }

    function goPlay(payload) {
        queuePlayLoadout(payload);
        // The art stays up through the navigation, covering the play page's
        // own startup time.
        showLoadingArtScreen('Heading into battle...');
        window.location.href = '/play';
    }

    function navigateHub(route, options = {}) {
        const hash = options.focus === 'lobby' ? '#socialActiveLobby' : '';
        const nextShopView = route === 'shop' ? (options.shopView || state.shopView || 'browse') : 'browse';
        const achievementCategory = route === 'achievements' ? (options.achievementCategory ?? state.achievementCategory ?? '') : '';
        const nextPath = route === 'achievements'
            ? achievementsPath(achievementCategory)
            : `${hubPath(route, nextShopView)}${hash}`;
        const samePlace = route === state.route
            && (route !== 'shop' || nextShopView === state.shopView)
            && (route !== 'profile' || !state.profileUserId)
            && (route !== 'achievements' || achievementCategory === state.achievementCategory);

        state.route = route;
        state.shopView = nextShopView;
        if (state.activeAchievementId) {
            state.activeAchievementId = '';
            renderAchievementDetailHost();
        }
        if (route === 'profile') {
            state.profileUserId = '';
        }
        if (route === 'achievements') {
            state.achievementCategory = achievementCategory;
        } else {
            state.achievementCategory = '';
        }

        if (options.replace) {
            if (`${location.pathname}${location.hash}` !== nextPath) {
                history.replaceState(null, '', nextPath);
            }
        } else if (!samePlace) {
            history.pushState(null, '', nextPath);
        } else if (`${location.pathname}${location.hash}` !== nextPath) {
            history.replaceState(null, '', nextPath);
        }

        setActiveRoute();
        renderSections();
        renderRoute();
        focusRouteTarget(options.focus);
    }

    function focusRouteTarget(focus) {
        if (focus !== 'lobby') return;
        requestAnimationFrame(() => {
            document.getElementById('socialActiveLobby')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    function routeFocusFromHash() {
        return location.hash === '#socialActiveLobby' ? 'lobby' : '';
    }

    function setActiveRoute() {
        document.querySelectorAll('[data-route]').forEach(link => {
            const route = link.dataset.route;
            const active = route === state.route || (state.route === 'lobby' && route === 'social');
            link.classList.toggle('active', active);
        });
    }

    function isBinderRoute() {
        return state.route === 'cards' || state.route === 'decks';
    }

    function isSocialRoute() {
        return state.route === 'social' || state.route === 'lobby';
    }

    function isFilterRoute() {
        return isBinderRoute() || isSocialRoute() || state.route === 'deck-builder';
    }

    function toggleTray(type) {
        if (type === 'filter' && !isFilterRoute()) return;
        if (type === 'card' && !isBinderRoute()) return;
        if (type === 'filter') {
            state.filterTrayOpen = !state.filterTrayOpen;
            if (state.filterTrayOpen) state.cardTrayOpen = false;
        }
        if (type === 'card') {
            state.cardTrayOpen = !state.cardTrayOpen;
            if (state.cardTrayOpen) state.filterTrayOpen = false;
        }
        renderHudTools();
    }

    function openCardTray() {
        if (!isBinderRoute()) return;
        state.cardTrayOpen = true;
        state.filterTrayOpen = false;
        renderHudTools();
    }

    function closeTrays() {
        state.filterTrayOpen = false;
        state.cardTrayOpen = false;
        renderHudTools();
    }

    function renderHudTools() {
        const binder = isBinderRoute();
        const social = isSocialRoute();
        const shop = state.route === 'shop';
        const filterOpen = state.filterTrayOpen;
        const optionsBtn = document.getElementById('optionsBtn');
        optionsBtn?.classList.toggle('hidden', state.route !== 'home' && state.route !== 'profile');
        // Hide "Join With Code" on the Cards/Decks binder routes; it crowds the
        // HUD there and the same action lives on the Social tab.
        const joinBtn = document.getElementById('joinByCodeBtn');
        joinBtn?.classList.toggle('hidden', binder);
        const builderRoute = state.route === 'deck-builder';
        const filterBtn = document.getElementById('filterTrayBtn');
        const cardBtn = document.getElementById('cardTrayBtn');
        const filterTray = document.getElementById('filterTray');
        const lobbyFilterTray = document.getElementById('lobbyFilterTray');
        const builderFilterTray = document.getElementById('builderFilterTray');
        const cardTray = document.getElementById('detailPanel');
        const backdrop = document.getElementById('trayBackdrop');
        const showFilterHud = binder || social || builderRoute;
        filterBtn?.classList.toggle('hidden', !showFilterHud);
        cardBtn?.classList.toggle('hidden', !(binder || shop));
        if (cardBtn) {
            cardBtn.textContent = 'Card View';
            cardBtn.disabled = shop && !(state.dailyOffers || []).length;
        }
        filterBtn?.classList.toggle('active', showFilterHud && filterOpen);
        cardBtn?.classList.toggle('active', (binder && state.cardTrayOpen) || (shop && state.shopCardPreviewOpen));
        filterTray?.classList.toggle('is-closed', !binder || !filterOpen);
        lobbyFilterTray?.classList.toggle('is-closed', !social || !filterOpen);
        builderFilterTray?.classList.toggle('is-closed', !builderRoute || !filterOpen);
        cardTray?.classList.toggle('is-closed', !binder || !state.cardTrayOpen);
        filterTray?.setAttribute('aria-hidden', String(!binder || !filterOpen));
        lobbyFilterTray?.setAttribute('aria-hidden', String(!social || !filterOpen));
        builderFilterTray?.setAttribute('aria-hidden', String(!builderRoute || !filterOpen));
        cardTray?.setAttribute('aria-hidden', String(!binder || !state.cardTrayOpen));
        const trayOpen = (showFilterHud && filterOpen) || (binder && state.cardTrayOpen);
        backdrop?.classList.toggle('hidden', !trayOpen);
        // Lock the page scroll behind an open tray so touch gestures stay
        // confined to the tray instead of scrolling the background.
        document.body.classList.toggle('tray-open', trayOpen);
    }

    async function fetchJson(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        // Cookie-mode sessions authenticate via the httpOnly cookie (sent
        // automatically); only attach a Bearer header for a real legacy token.
        if (isLegacyBearerToken(state.token)) headers.Authorization = `Bearer ${state.token}`;
        const timeoutMs = Number(options.timeoutMs) || 0;
        const controller = timeoutMs && window.AbortController ? new AbortController() : null;
        const timeout = controller
            ? window.setTimeout(() => controller.abort(), timeoutMs)
            : null;
        const fetchOptions = { credentials: 'same-origin', ...options, headers };
        delete fetchOptions.timeoutMs;
        if (controller) {
            fetchOptions.signal = controller.signal;
        }
        try {
            const resp = await fetch(path, fetchOptions);
            const raw = await resp.text();
            let data = null;
            if (raw) {
                try {
                    data = JSON.parse(raw);
                } catch (parseError) {
                    console.error(parseError);
                    return { error: resp.ok ? 'Unexpected server response.' : (raw.trim() || resp.statusText || 'Request failed') };
                }
            }
            if (!resp.ok) {
                const message = data?.error || data?.message || resp.statusText || 'Request failed';
                return { ...(data || {}), error: message };
            }
            return data;
        } catch (error) {
            console.error(error);
            if (error?.name === 'AbortError') {
                return { error: 'Pack opening is taking too long. Please try again.', timedOut: true };
            }
            return { error: 'Network error. Check your connection and try again.' };
        } finally {
            if (timeout) {
                window.clearTimeout(timeout);
            }
        }
    }

    async function fetchCachedJson(cacheKey, path, ttlMs) {
        const cached = readCache(cacheKey, ttlMs);
        if (cached) return cached;
        const data = await fetchJson(path);
        if (data) writeCache(cacheKey, data);
        return data;
    }

    function applyGameOptions(options) {
        const next = options || { decks: [], trainers: [], cardCatalog: [], liveElements: [] };
        state.options = next;
        state.catalogVersion = Number(next.catalogVersion) || 0;
    }

    // Synchronously seed state from the persisted static caches before any network
    // call, so the first paint of a fresh page load is instant when we've loaded
    // before. loadAll() then revalidates everything in the background.
    function hydrateStaticCachesFromStorage() {
        const options = readCache('gameOptions', STATIC_CACHE_TTL_MS);
        if (options) {
            applyGameOptions(options);
        }
        const packs = readCache('shopPacks', STATIC_CACHE_TTL_MS);
        if (packs) {
            state.packs = packs.packs || [];
            state.dailyOffers = packs.dailyOffers || [];
            state.titleCatalog = packs.titleCatalog || state.titleCatalog || [];
        }
        const descriptions = readCache('creatureDescriptions', STATIC_CACHE_TTL_MS);
        if (descriptions) {
            state.creatureDescriptions = indexCreatureDescriptions(descriptions);
        }
        if (state.options && !state.selectedCardId) {
            state.selectedCardId = state.options.cardCatalog?.[0]?.id || null;
        }
    }

    function bindCatalogSync() {
        if (state.catalogSyncBound || typeof SieglingsCatalogSync === 'undefined') return;
        state.catalogSyncBound = true;
        SieglingsCatalogSync.onCatalogPublished((catalogVersion) => {
            void applyPublishedCatalogVersion(catalogVersion);
        });
    }

    async function syncCatalogIfVersionChanged() {
        const remote = await fetchJson('/api/game/catalog-version');
        if (!remote) return;
        const remoteVersion = Number(remote.catalogVersion) || 0;
        if (remoteVersion === state.catalogVersion && Array.isArray(state.options?.cardCatalog) && state.options.cardCatalog.length) {
            return;
        }
        await refreshLiveCatalog();
    }

    async function applyPublishedCatalogVersion(catalogVersion) {
        const remoteVersion = Number(catalogVersion) || 0;
        if (remoteVersion > 0 && remoteVersion === state.catalogVersion
            && Array.isArray(state.options?.cardCatalog) && state.options.cardCatalog.length) {
            return;
        }
        await refreshLiveCatalog();
    }

    async function refreshLiveCatalog() {
        if (liveCatalogRefreshPromise) {
            return liveCatalogRefreshPromise;
        }
        liveCatalogRefreshPromise = (async () => {
            const data = await fetchJson('/api/game/options');
            if (!data) return;
            applyGameOptions(data);
            writeCache('gameOptions', data);
            render();
        })().finally(() => {
            liveCatalogRefreshPromise = null;
        });
        return liveCatalogRefreshPromise;
    }

    function readCache(cacheKey, ttlMs) {
        try {
            const cached = readCacheEntry(cacheKey);
            if (!cached || Date.now() - cached.savedAt > ttlMs) return null;
            return cached.data;
        } catch (error) {
            return null;
        }
    }

    function writeCache(cacheKey, data) {
        try {
            const entry = { savedAt: Date.now(), data };
            memoryCache[cacheKey] = entry;
            const storage = hubCacheStorage();
            if (storage) storage.setItem(HUB_CACHE_PREFIX + cacheKey, JSON.stringify(entry));
        } catch (error) {
            // Persistent cache is an optimization only — if localStorage is full or
            // unavailable we fall back to the in-memory copy and the network.
        }
    }

    function readCacheEntry(cacheKey) {
        const storage = hubCacheStorage();
        const raw = storage?.getItem(HUB_CACHE_PREFIX + cacheKey);
        return raw ? JSON.parse(raw) : memoryCache[cacheKey];
    }

    // Persist hub caches in localStorage so they survive tab close, app relaunch,
    // and crossing between the hub and the Play page — not just a single tab.
    function hubCacheStorage() {
        try {
            return window.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    // Mirrors the Play page's sign-in popup (game.js buildAuthFormMarkup) so the
    // hub/shop login matches it: ACCOUNT eyebrow, Log In / Register tabs, and a
    // single primary button. Shared style.css supplies the look; the hub wires
    // events via IDs/data-attrs (its code is sandboxed, so no inline onclick).
    function authMarkup() {
        const loading = !!state.authLoading;
        const disabledAttr = loading ? ' disabled' : '';
        if (state.authRegisterStep === 'display-name') {
            return `
                <div class="welcome-eyebrow">ACCOUNT</div>
                <h3>Choose your display name</h3>
                <div class="welcome-auth-meta">${escapeHtml(state.registerDraft.email || '')}</div>
                <label class="online-field">
                    <span>Display Name</span>
                    <input type="text" id="authName" maxlength="20" placeholder="Arena name"${disabledAttr} autofocus>
                </label>
                <div class="welcome-auth-actions">
                    <button class="btn welcome-auth-submit" id="backRegisterBtn" type="button"${disabledAttr}>Back</button>
                    <button class="btn btn-primary welcome-auth-submit" id="confirmRegisterBtn" type="button"${disabledAttr}>${loading ? 'Working...' : 'Confirm'}</button>
                </div>
            `;
        }
        const mode = state.authMode === 'register' ? 'register' : 'login';
        return `
            <div class="welcome-eyebrow">ACCOUNT</div>
            <h3>${mode === 'login' ? 'Pick up where you left off' : 'Save decks with your email'}</h3>
            <div class="welcome-auth-tabs">
                <button class="welcome-auth-tab${mode === 'login' ? ' active' : ''}" type="button" data-auth-mode="login" aria-selected="${mode === 'login'}"${disabledAttr}>Log In</button>
                <button class="welcome-auth-tab${mode === 'register' ? ' active' : ''}" type="button" data-auth-mode="register" aria-selected="${mode === 'register'}"${disabledAttr}>Register</button>
            </div>
            <label class="online-field">
                <span>Email</span>
                <input type="email" id="authEmail" placeholder="you@example.com"${disabledAttr}>
            </label>
            <label class="online-field">
                <span>Password</span>
                <input type="password" id="authPassword" placeholder="At least 6 characters"${disabledAttr}>
            </label>
            <div class="welcome-auth-actions">
                <button class="btn btn-primary welcome-auth-submit" id="authPrimaryBtn" type="button"${disabledAttr}>${loading ? 'Working...' : (mode === 'login' ? 'Log In' : 'Register')}</button>
            </div>
        `;
    }

    function openAuth() {
        if (state.profile?.authenticated) return logout();
        state.authOpen = true;
        state.authMode = 'login';
        state.authRegisterStep = 'credentials';
        state.authDraft = { email: '', password: '' };
        state.authLoading = false;
        renderAuthModal();
    }

    function closeAuth() {
        state.authOpen = false;
        state.authMode = 'login';
        state.authRegisterStep = 'credentials';
        state.registerDraft = { email: '', password: '' };
        state.authDraft = { email: '', password: '' };
        state.authLoading = false;
        renderAuthModal();
    }

    // Preserve whatever the player has typed when flipping the Log In / Register tab.
    function captureAuthDraft() {
        const email = document.getElementById('authEmail');
        const password = document.getElementById('authPassword');
        state.authDraft = {
            email: email ? email.value : (state.authDraft?.email || ''),
            password: password ? password.value : (state.authDraft?.password || '')
        };
    }

    function setAuthMode(mode) {
        captureAuthDraft();
        state.authMode = mode === 'register' ? 'register' : 'login';
        renderAuthModal();
    }

    function syncAuthRouteIntent() {
        if (String(location.pathname || '').replace(/\/+$/, '') !== '/login') return;
        state.authOpen = !state.profile?.authenticated;
        renderAuthModal();
    }

    function renderAuthModal() {
        const modal = document.getElementById('authModal');
        const body = document.getElementById('authPanelBody');
        if (!modal || !body) return;
        modal.classList.toggle('hidden', !state.authOpen);
        if (state.authOpen) {
            body.innerHTML = authMarkup();
            bindAuthForms();
        }
    }

    function bindAuthForms() {
        // Restore typed credentials after a re-render (e.g. switching tab).
        const draft = state.authDraft || { email: '', password: '' };
        const emailInput = document.getElementById('authEmail');
        const passwordInput = document.getElementById('authPassword');
        if (emailInput && draft.email) emailInput.value = draft.email;
        if (passwordInput && draft.password) passwordInput.value = draft.password;

        document.querySelectorAll('[data-auth-mode]').forEach(btn =>
            btn.addEventListener('click', () => setAuthMode(btn.getAttribute('data-auth-mode'))));
        document.getElementById('authPrimaryBtn')?.addEventListener('click', () => {
            if (state.authMode === 'register') beginRegisterDisplayName();
            else submitAuth('login');
        });
        document.getElementById('confirmRegisterBtn')?.addEventListener('click', () => submitAuth('register'));
        document.getElementById('backRegisterBtn')?.addEventListener('click', () => {
            state.authRegisterStep = 'credentials';
            renderAuthModal();
        });
    }

    function beginRegisterDisplayName() {
        const email = (document.getElementById('authEmail')?.value || '').trim();
        const password = document.getElementById('authPassword')?.value || '';
        if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
            alert('Enter a valid email address.');
            return;
        }
        if (!password || password.length < 6) {
            alert('Passwords must be at least 6 characters.');
            return;
        }
        state.registerDraft = { email, password };
        state.authRegisterStep = 'display-name';
        renderAuthModal();
    }

    async function submitAuth(mode) {
        if (state.authLoading) return;
        const onRegisterNameStep = mode === 'register' && state.authRegisterStep === 'display-name';
        const email = onRegisterNameStep ? state.registerDraft.email : (document.getElementById('authEmail')?.value || '');
        const password = onRegisterNameStep ? state.registerDraft.password : (document.getElementById('authPassword')?.value || '');
        const displayName = mode === 'register' ? (document.getElementById('authName')?.value || '') : '';
        const body = mode === 'register'
            ? { email, password, displayName }
            : { email, password };
        // Persist what the user typed so the inputs aren't cleared when the modal
        // re-renders into its "Working..." state.
        if (!onRegisterNameStep) state.authDraft = { email, password };
        state.authLoading = true;
        renderAuthModal();
        const data = await fetchJson(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
        if (data?.error) {
            state.authLoading = false;
            renderAuthModal();
            return alert(data.error);
        }
        state.authLoading = false;
        // Prefer cookie auth in browsers; in a standalone Web App (or when cookies
        // are blocked) keep the real token + Bearer header so auth survives the
        // full-page Home <-> Play navigation.
        state.token = preferredStoredToken(data.token);
        localStorage.setItem(AUTH_TOKEN_KEY, state.token);
        state.profile = data;
        saveCachedAuthProfile(data);
        state.progression = data.progression;
        state.profilePrefs = applyProfileSettingsFromServer(data.profileSettings) || defaultProfilePrefs(data.user || {});
        cacheProfilePrefs(state.profilePrefs);
        applyProfileArtFromPrefs(state.profilePrefs);
        state.profileEditOpen = false;
        state.authOpen = false;
        state.authRegisterStep = 'credentials';
        state.registerDraft = { email: '', password: '' };
        // Close the login UI instantly, then cover the data load with a random
        // loading-screen art piece so the player isn't staring at the form.
        renderAuthModal();
        const loadingShownAt = showLoadingArtScreen('Loading your Siegelings…');
        startPresenceHeartbeat();
        try {
            await ensurePacksLoaded();
            render();
        } finally {
            hideLoadingArtScreen(loadingShownAt);
        }
    }

    async function logout() {
        stopPresenceHeartbeat();
        try {
            await fetchJson('/api/social/presence/offline', { method: 'POST' });
        } catch (_ignored) {
        }
        await fetchJson('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(PROFILE_PREFS_CACHE_KEY);
        clearCachedAuthProfile();
        state.token = '';
        state.profile = null;
        state.progression = null;
        state.profilePrefs = null;
        state.profileEditOpen = false;
        render();
    }

    async function deleteAccount(confirmationText) {
        const btn = document.getElementById('deleteAccountBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
        const data = await fetchJson('/api/auth/delete-account', {
            method: 'POST',
            body: JSON.stringify({ confirmationText })
        });
        if (data?.error) {
            const err = document.getElementById('deleteAccountError');
            if (err) err.textContent = data.error;
            if (btn) { btn.disabled = false; btn.textContent = 'Permanently delete my account'; }
            return;
        }
        stopPresenceHeartbeat();
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(PROFILE_PREFS_CACHE_KEY);
        clearCachedAuthProfile();
        state.token = '';
        state.profile = null;
        state.progression = null;
        state.profilePrefs = null;
        state.profileEditOpen = false;
        closeOptions();
        render();
        alert('Your account and all associated data have been permanently deleted.');
    }

    function adjustBuilder(cardId, delta) {
        if (!state.options?.cardCatalog?.length) return;
        const cardLimit = builderCardLimit(cardId);
        const current = state.builderCounts[cardId] || 0;
        const totalWithoutCard = builderTotal() - current;
        const copyLimit = Math.min(cardLimit, Math.max(0, 30 - totalWithoutCard));
        const next = Math.max(0, Math.min(copyLimit, current + delta));
        if (next) state.builderCounts[cardId] = next;
        else delete state.builderCounts[cardId];
        if (delta > 0 || !state.builderPreviewCardId) state.builderPreviewCardId = cardId;
        if (state.route === 'deck-builder') {
            renderDeckBuilderPage();
        }
    }

    function builderCards() {
        return Object.entries(state.builderCounts).flatMap(([cardId, count]) => Array.from({ length: count }, () => cardId));
    }

    function builderTotal() { return builderCards().length; }
    function builderDeckElements() {
        return [...new Set(builderCards().map(id => findCard(id)?.element).filter(Boolean))].slice(0, 4);
    }
    function builderCardLimit(cardId) {
        const owned = ownedCount(cardId);
        if (owned > 0) return Math.min(3, owned);
        if (!state.profile?.authenticated || !state.progression?.ownedTotal) return 3;
        return 0;
    }
    function selectedCard() { return findCard(state.selectedCardId) || binderCatalog()[0]; }
    function findCard(id) { return binderCatalog().find(card => card.id === id); }
    function ownedCount(id) {
        if (trainerOwnedLevel(id) > 0) return 1;
        return state.progression?.ownedCards?.[id] || 0;
    }

    function renderSiegeknightBinderArt(card) {
        return `<div class="siegeknight-binder-art has-knight-back" style="--knight-card-back:url('${escapeAttr(SIEGEKNIGHT_CARD_BACK)}')" role="img" aria-label="${escapeAttr(card?.name || 'SiegeKnight')} card back"></div>`;
    }
    function selectedSavedDeck() {
        const selected = state.selectedDeckId;
        if (!selected) return null;
        return (state.profile?.savedDecks || []).find(deck => deck.id === selected || deck.deckId === selected) || null;
    }
    function selectedDeckId() {
        const savedDeck = selectedSavedDeck();
        if (savedDeck?.deckId) return savedDeck.deckId;
        if (state.selectedDeckId && (state.options?.decks || []).some(deck => deck.id === state.selectedDeckId)) {
            return state.selectedDeckId;
        }
        return state.options?.defaultDeckId || state.options?.decks?.[0]?.id || 'deck_fire_earth';
    }
    function indexCreatureDescriptions(descriptions) {
        const entries = Array.isArray(descriptions) ? descriptions : [];
        return entries.reduce((out, item) => {
            const description = String(item?.description || '').trim();
            if (!description) return out;
            [item.id, item.name, item.displayName].forEach(key => {
                const normalized = normalizeCreatureKey(key);
                if (normalized) out[normalized] = description;
            });
            return out;
        }, {});
    }
    function normalizeCreatureKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    function creatureDescriptionFor(card) {
        const descriptions = state.creatureDescriptions || {};
        return polishFlavorText(descriptions[normalizeCreatureKey(card?.id)]
            || descriptions[normalizeCreatureKey(card?.name)]
            || String(card?.description || '').trim()
            || 'Description coming soon.');
    }
    function polishFlavorText(value) {
        return String(value || '')
            .replace(/\.{2,}/g, '.')
            .replace(/\s+([,.!?;:])/g, '$1')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
    function renderBinderCardDescription(card) {
        const description = creatureDescriptionFor(card);
        return `<div class="binder-card-description" title="${escapeAttr(description)}">${escapeHtml(description)}</div>`;
    }
    function elementFilterValues() {
        const values = new Set(['ALL', ...(state.options?.liveElements || []), 'NEUTRAL']);
        (state.options?.cardCatalog || []).forEach(card => {
            if (card.element) values.add(card.element);
            (card.notches || []).forEach(notch => notch.element && values.add(notch.element));
        });
        return [...values];
    }
    function cardEnergyCost(card) {
        const directCost = Number(card?.costAmount);
        if (Number.isFinite(directCost) && directCost > 0) return directCost;
        const trapCost = Number(card?.trapBucketAmount);
        if (Number.isFinite(trapCost) && trapCost > 0) return trapCost;
        const comboCost = Number(card?.requiredComboSize);
        if (Number.isFinite(comboCost) && comboCost > 0) return comboCost;
        return 0;
    }
    function matchesEnergyCostFilter(card) {
        const filter = state.energyCostFilter;
        if (filter === 'ALL') return true;
        const cost = cardEnergyCost(card);
        if (filter === 'FREE') return cost === 0;
        if (filter === '5+') return cost >= 5;
        return cost === Number(filter);
    }
    function matchesFinishFilter(card) {
        const filter = state.finishFilter;
        if (filter === 'ALL') return true;
        const holo = cardShowsPlayerHolographic(card);
        return filter === 'HOLOGRAPHIC' ? holo : !holo;
    }
    function formatEnergyCostFilter(value) {
        if (value === 'ALL') return 'All Costs';
        if (value === 'FREE') return 'Free';
        return `${value} Energy`;
    }
    function renderBinderNotches(notches = []) {
        const notchMap = Object.fromEntries(notches.map(notch => [String(notch.direction || '').toUpperCase(), notch]));
        return `<div class="binder-notches" aria-hidden="true">${NOTCH_DIRECTIONS.map(direction => {
            const notch = notchMap[direction];
            return `<span class="binder-notch notch-${direction.toLowerCase().replace(/_/g, '-')}${notch ? ' filled' : ''}" style="${notch ? notchIconStyle(notch.element) : ''}"></span>`;
        }).join('')}</div>`;
    }
    function activeNotches(notches = []) {
        const notchMap = Object.fromEntries(notches.map(notch => [String(notch.direction || '').toUpperCase(), notch]));
        return NOTCH_DIRECTIONS.map(direction => notchMap[direction]).filter(Boolean);
    }
    function shortDirection(direction) {
        return String(direction || '')
            .split('_')
            .map(part => part.charAt(0))
            .join('');
    }
    function renderActiveNotchBadges(notches = []) {
        const active = activeNotches(notches);
        if (!active.length) return '<div class="binder-active-notches empty">No active notches</div>';
        return `<div class="binder-active-notches">${active.map(notch => {
            const direction = String(notch.direction || '').toUpperCase();
            const label = `${format(direction)} ${format(notch.element)}`;
            return `<span class="notch-medallion" style="${notchIconStyle(notch.element)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"></span>`;
        }).join('')}</div>`;
    }
    function renderActiveNotchChips(notches = []) {
        const active = activeNotches(notches);
        if (!active.length) return '<span class="chip">No active notches</span>';
        return active.map(n => `<span class="chip notch-chip" style="${notchIconStyle(n.element)}">${escapeHtml(shortDirection(n.direction))} ${format(n.element)}</span>`).join('');
    }
    function deckAssetForElements(elements = []) {
        const key = DECK_ASSET_KEYS.find(element => elements.includes(element));
        return key ? DECK_ASSET_PATHS[key] : null;
    }
    function parseHubRoute(path) {
        const segments = String(path || '/home').replace(/^\/+/, '').split('/').filter(Boolean);
        const head = segments[0] || 'home';
        if (head === 'lobbies') return { route: 'social', shopView: 'browse', lobbyRoomId: '', profileUserId: '', achievementCategory: '' };
        if (head === 'social' && segments[1] === 'lobby' && segments[2]) {
            return { route: 'lobby', shopView: 'browse', lobbyRoomId: segments[2].trim().toUpperCase(), profileUserId: '', achievementCategory: '' };
        }
        if (head === 'shop') {
            return { route: 'shop', shopView: segments[1] === 'cardpack' ? 'cardpack' : 'browse', lobbyRoomId: '', profileUserId: '', achievementCategory: '' };
        }
        if (head === 'profile') {
            const profileUserId = segments[1] ? decodeURIComponent(segments[1]).trim().toLowerCase() : '';
            return { route: 'profile', shopView: 'browse', lobbyRoomId: '', profileUserId, achievementCategory: '' };
        }
        if (head === 'achievements') {
            const achievementCategory = segments[1] ? decodeURIComponent(segments[1]).trim().toLowerCase() : '';
            return { route: 'achievements', shopView: 'browse', lobbyRoomId: '', profileUserId: '', achievementCategory };
        }
        if (head === 'deck-builder') {
            return { route: 'deck-builder', shopView: 'browse', lobbyRoomId: '', profileUserId: '', achievementCategory: '' };
        }
        if (['cards', 'decks', 'social'].includes(head)) {
            return { route: head, shopView: 'browse', lobbyRoomId: '', profileUserId: '', achievementCategory: '' };
        }
        return { route: 'home', shopView: 'browse', lobbyRoomId: '', profileUserId: '', achievementCategory: '' };
    }

    function normalizePlayerId(userId) {
        return String(userId || '').trim().toLowerCase();
    }

    function playerProfilePath(userId) {
        const normalized = normalizePlayerId(userId);
        if (!normalized) return '/profile';
        const myEmail = normalizePlayerId(state.profile?.user?.email);
        if (myEmail && normalized === myEmail) return '/profile';
        return `/profile/${encodeURIComponent(normalized)}`;
    }

    function navigateToPlayerProfile(userId, options = {}) {
        const path = playerProfilePath(userId);
        state.route = 'profile';
        state.shopView = 'browse';
        state.lobbyRoomId = '';
        state.profileUserId = path === '/profile' ? '' : normalizePlayerId(userId);
        state.profileEditOpen = false;
        closePlayerProfile();
        if (options.replace) {
            history.replaceState(null, '', path);
        } else {
            history.pushState(null, '', path);
        }
        setActiveRoute();
        renderSections();
        renderRoute();
    }

    function hubPath(route, shopView = 'browse') {
        if (route === 'home') return '/home';
        if (route === 'shop' && shopView === 'cardpack') return '/shop/cardpack';
        if (route === 'deck-builder') return '/deck-builder';
        if (route === 'achievements') return '/achievements';
        return `/${route}`;
    }

    function applyRouteFromLocation(path = location.pathname) {
        const parsed = parseHubRoute(path);
        state.route = parsed.route;
        state.shopView = parsed.shopView;
        state.lobbyRoomId = parsed.lobbyRoomId || '';
        state.profileUserId = parsed.profileUserId || '';
        state.achievementCategory = parsed.achievementCategory || '';
        if (state.route === 'shop' && state.shopView === 'cardpack' && !shouldShowPackOpening()) {
            state.shopView = 'browse';
            if (location.pathname !== hubPath('shop', 'browse')) {
                history.replaceState(null, '', hubPath('shop', 'browse'));
            }
        }
    }

    function routeFromPath(path) {
        return parseHubRoute(path).route;
    }
    function elementColor(element) { return ELEMENT_COLORS[element] || '#f05b2f'; }
    function rarityColor(rarity) { return RARITY_COLORS[rarity] || RARITY_COLORS.COMMON; }
    function normalizeCardArtKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    const CARD_ART_OVERRIDES = Object.freeze({
        sundile: '/assets/cards/sundile.jpg'
    });

    function resolveCardArtUrl(card) {
        if (!card) return '';
        const candidates = [card.artKey, card.id, card.definitionId, card.cardId, card.baseId, card.catalogId, card.slug, card.name];
        for (const candidate of candidates) {
            const key = normalizeCardArtKey(candidate);
            if (key && CARD_ART_OVERRIDES[key]) {
                return CARD_ART_OVERRIDES[key];
            }
        }
        return '';
    }

    function renderBinderCardArt(card) {
        if (String(card?.type || '').toUpperCase() === 'SIEGEKNIGHT') {
            return renderSiegeknightBinderArt(card);
        }
        const dashboardArtUrl = String(card?.cardArtUrl || '').trim();
        const dashboardMode = window.SieglingsCardBinderVisual?.normalizeArtMode(card?.cardArtMode) || '';
        if (dashboardArtUrl && dashboardMode && window.SieglingsCardBinderVisual) {
            return window.SieglingsCardBinderVisual.renderBinderCardArt(card);
        }
        const url = resolveCardArtUrl(card);
        if (url) {
            const name = card?.name || 'Card';
            return `<img class="element-icon-art" src="${escapeAttr(url)}" alt="${escapeAttr(name)} art" loading="lazy">`;
        }
        return renderElementIcon(card?.element);
    }

    function elementIconPath(element) {
        return ELEMENT_ICON_PATHS[String(element || '').toUpperCase()] || '';
    }
    function notchIconPath(element) {
        const normalized = String(element || '').toUpperCase();
        return NOTCH_ICON_PATHS[normalized] || elementIconPath(normalized);
    }
    function notchIconStyle(element) {
        const normalized = String(element || 'NEUTRAL').toUpperCase();
        const iconPath = notchIconPath(normalized);
        const color = elementColor(normalized);
        return `--notch:${color};${iconPath ? `--notch-icon:url('${escapeAttr(iconPath)}');` : ''}`;
    }
    function renderElementIcon(element) {
        const normalized = String(element || 'NEUTRAL').toUpperCase();
        const iconPath = elementIconPath(normalized);
        if (iconPath) {
            return `<img class="element-icon-art" src="${escapeAttr(iconPath)}" alt="${escapeAttr(format(normalized))} icon" loading="lazy">`;
        }
        return `<span class="binder-card-fallback-element">${escapeHtml(format(normalized).slice(0, 1) || '?')}</span>`;
    }
    function deckGradient(elements = []) {
        const colors = (elements.length ? elements : ['FIRE']).map(elementColor);
        if (colors.length === 1) return `linear-gradient(145deg, ${colors[0]}, #07101f 82%)`;
        return `linear-gradient(145deg, ${colors.map((color, index) => `${color} ${Math.round(index * 100 / (colors.length - 1))}%`).join(', ')})`;
    }
    function format(value) {
        const normalized = String(value || '');
        if (normalized === 'SIEGLING') return 'Siegeling';
        if (normalized === 'SIEGLINGS') return 'Siegelings';
        if (normalized === 'SIEGEKNIGHT') return 'SiegeKnight';
        if (normalized === 'SPELL') return 'Strategy';
        if (normalized === 'SPELLS') return 'Strategies';
        if (normalized === 'TRAP') return 'Deception';
        if (normalized === 'TRAPS') return 'Deceptions';
        return normalized
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(/\bSiegling\b/g, 'Siegeling')
            .replace(/\bSieglings\b/g, 'Siegelings');
    }
    function formatGameText(value) {
        return String(value || '')
            .replace(/\bSpells\b/g, 'Strategies')
            .replace(/\bSpell\b/g, 'Strategy')
            .replace(/\bTraps\b/g, 'Deceptions')
            .replace(/\bTrap\b/g, 'Deception')
            .replace(/\bSiegling\b/g, 'Siegeling')
            .replace(/\bSieglings\b/g, 'Siegelings')
            .replace(/\bsiegling\b/g, 'siegeling')
            .replace(/\bsieglings\b/g, 'siegelings');
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function escapeAttr(value) { return escapeHtml(value); }

    function applyProfileSettingsFromServer(settings) {
        if (!settings) return null;
        const mapped = {
            displayName: settings.displayName || '',
            avatarMode: settings.avatarMode === 'ELEMENT' ? 'ELEMENT' : 'INITIAL',
            avatar: settings.avatar || '',
            avatarUrl: settings.avatarUrl || '',
            profileArtId: settings.profileArtId || '',
            pageArtId: settings.pageArtId || '',
            playerTitle: settings.playerTitle || '',
            playerTitleId: settings.playerTitleId || settings.playerTitle || '',
            bio: settings.bio || '',
            preferredCardBack: settings.preferredCardBack || '',
            favoriteSiegling: settings.favoriteSiegling || '',
            favoriteSieglingId: settings.favoriteSieglingId || '',
            favoriteSieglingCard: settings.favoriteSieglingCard || null
        };
        const elementSource = settings.favoriteElementLabel || settings.favoriteElement;
        if (elementSource != null && String(elementSource).trim()) {
            mapped.favoriteElement = normalizeProfileElement(elementSource);
        }
        return mapped;
    }

    function hydrateProfilePrefsFromCache() {
        if (!state.token) return;
        try {
            const raw = localStorage.getItem(PROFILE_PREFS_CACHE_KEY);
            if (!raw) return;
            const cached = applyProfileSettingsFromServer(JSON.parse(raw));
            if (cached) state.profilePrefs = cached;
        } catch (_error) {
            localStorage.removeItem(PROFILE_PREFS_CACHE_KEY);
        }
    }

    function cacheProfilePrefs(prefs) {
        if (!prefs || !state.token) return;
        try {
            localStorage.setItem(PROFILE_PREFS_CACHE_KEY, JSON.stringify({
                displayName: prefs.displayName,
                avatarMode: prefs.avatarMode,
                avatar: prefs.avatar,
                avatarUrl: prefs.avatarUrl,
                favoriteElement: prefs.favoriteElement,
                profileArtId: prefs.profileArtId,
                pageArtId: prefs.pageArtId,
                playerTitle: prefs.playerTitle,
                playerTitleId: prefs.playerTitleId,
                bio: prefs.bio,
                preferredCardBack: prefs.preferredCardBack,
                favoriteSiegling: prefs.favoriteSiegling,
                favoriteSieglingId: prefs.favoriteSieglingId
            }));
        } catch (_error) {
            // ignore quota errors
        }
    }

    function profileDisplayName() {
        return state.profilePrefs?.displayName
            || state.profile?.user?.displayName
            || state.profile?.email
            || 'Your Arena';
    }

    function renderPlayerAvatar(prefs = {}, className = 'friend-avatar') {
        const displayName = prefs.displayName || 'Player';
        const mode = prefs.avatarMode === 'ELEMENT' ? 'ELEMENT' : 'INITIAL';
        if (prefs.avatarUrl) {
            return `<img class="player-avatar-img ${escapeAttr(className)}" src="${escapeAttr(prefs.avatarUrl)}" alt="">`;
        }
        if (mode === 'ELEMENT') {
            const iconPath = elementIconPath(normalizeProfileElement(prefs.favoriteElement));
            if (iconPath) {
                return `<div class="player-avatar-element ${escapeAttr(className)}" aria-hidden="true"><img src="${escapeAttr(iconPath)}" alt=""></div>`;
            }
        }
        return `<div class="${escapeAttr(className)}" aria-hidden="true">${escapeHtml((prefs.avatar || initials(displayName)).slice(0, 1))}</div>`;
    }

    function hydrateRoomInviteFromUrl() {
        const params = new URLSearchParams(location.search);
        const room = params.get('room');
        if (!room) return;
        params.delete('room');
        const query = params.toString();
        const roomId = room.trim().toUpperCase();
        const nextPath = `${lobbyPath(roomId)}${query ? `?${query}` : ''}`;
        history.replaceState(null, '', nextPath);
        state.route = 'lobby';
        state.lobbyRoomId = roomId;
        const input = document.getElementById('roomCodeInput');
        if (input) input.value = roomId;
    }

    function buildSocialMatchBody() {
        const savedDeck = selectedSavedDeck();
        const customDeckCards = savedDeck?.custom && savedDeck.customDeckCards?.length ? savedDeck.customDeckCards : null;
        return {
            deckId: selectedDeckId(),
            trainerId: selectedTrainerId(),
            playerName: socialBattleName(),
            customDeckCards,
            loadoutLabel: customDeckCards?.length ? (savedDeck?.name || 'Custom Loadout') : ''
        };
    }

    function selectedTrainerId() {
        const savedDeck = selectedSavedDeck();
        if (savedDeck?.trainerId && isTrainerOwned(savedDeck.trainerId)) {
            return savedDeck.trainerId;
        }
        const preferred = state.options?.defaultTrainerId;
        if (preferred && isTrainerOwned(preferred)) return preferred;
        return firstOwnedTrainerId();
    }

    function socialBattleName() {
        return state.profile?.user?.displayName || loadStoredPlayerName() || 'Player';
    }

    function loadStoredPlayerName() {
        try {
            return localStorage.getItem(PLAYER_NAME_KEY) || '';
        } catch (_error) {
            return '';
        }
    }

    function normalizeRoomId(roomId) {
        return String(roomId || '').trim().toUpperCase();
    }

    function lobbyPath(roomId) {
        const normalized = normalizeRoomId(roomId);
        if (!normalized) return '/social';
        return `/social/lobby/${encodeURIComponent(normalized)}`;
    }

    function buildSocialRoomShareUrl(roomId) {
        if (!roomId) return '';
        return `${location.origin}${lobbyPath(roomId)}`;
    }

    function isOwnLobby(room) {
        if (!room?.roomId) return false;
        return isOwnLobbyRoomId(room.roomId) || (room.hostUserId && room.hostUserId === state.profile?.user?.id);
    }

    function isOwnLobbyRoomId(roomId) {
        if (!roomId) return false;
        const normalized = normalizeRoomId(roomId);
        const hostLobby = readHostLobby();
        if (hostLobby?.roomId && normalizeRoomId(hostLobby.roomId) === normalized) return true;
        const listed = state.rooms.find(entry => normalizeRoomId(entry.roomId) === normalized);
        if (listed && listed.hostUserId && listed.hostUserId === state.profile?.user?.id) return true;
        return false;
    }

    function staleLobbyError(message) {
        const text = String(message || '').toLowerCase();
        return text.includes('room not found')
            || text.includes('lobby has expired')
            || text.includes('lobby has been closed')
            || text.includes('no longer available');
    }

    async function reconnectHostLobbySession(roomId, options = {}) {
        if (!state.token || !roomId) return null;
        const data = await fetchJson('/api/match/reconnect-host', {
            method: 'POST',
            body: JSON.stringify({ roomId })
        });
        if (data?.error) {
            if (!options.silent) alert(data.error);
            return { error: data.error };
        }
        if (!data?.roomId || !data?.playerToken) return null;
        writeHostLobby({
            roomId: data.roomId,
            playerToken: data.playerToken,
            expiresAt: data.expiresAt || null,
            shareUrl: data.shareUrl || buildSocialRoomShareUrl(data.roomId)
        });
        return { roomId: data.roomId, playerToken: data.playerToken, role: 'host' };
    }

    async function replaceStaleHostLobby(roomId, reason = '') {
        if (!state.options?.decks?.length) {
            alert('Deck options are still loading. Try again in a moment.');
            return null;
        }
        if (state.lobbyBusy) return null;
        localStorage.removeItem(HOST_LOBBY_KEY);
        clearLobbySession();
        state.hostLobbyStatus = null;
        state.lobbyStatus = null;
        state.lobbyBusy = true;
        renderSocialActiveLobby();
        try {
            const data = await fetchJson('/api/match/create', {
                method: 'POST',
                body: JSON.stringify(buildSocialMatchBody())
            });
            if (data?.error) {
                alert(`That waiting room is no longer open. ${data.error}`);
                navigateHub('social', { focus: 'lobby', replace: true });
                return null;
            }
            writeHostLobby({
                roomId: data.roomId,
                playerToken: data.playerToken,
                expiresAt: data.expiresAt || null,
                shareUrl: data.shareUrl || buildSocialRoomShareUrl(data.roomId)
            });
            const session = { roomId: data.roomId, playerToken: data.playerToken, role: 'host' };
            writeLobbySession(session);
            saveMultiplayerSession({
                roomId: data.roomId,
                playerToken: data.playerToken,
                viewerSide: data.viewerSide || 'PLAYER'
            });
            state.hostLobbyStatus = data;
            state.lobbyRoomId = normalizeRoomId(data.roomId);
            if (state.lobbyRoomId) {
                history.replaceState(null, '', lobbyPath(state.lobbyRoomId));
            }
            await refreshRooms(true);
            return session;
        } finally {
            state.lobbyBusy = false;
            renderSocialActiveLobby();
            if (reason) {
                console.info('Replaced stale lobby', { roomId, reason });
            }
        }
    }

    function openLobbyWaitingRoom(roomId, options = {}) {
        const normalized = normalizeRoomId(roomId);
        if (!normalized) return;
        state.lobbyRoomId = normalized;
        const nextPath = lobbyPath(normalized);
        if (options.replace) {
            history.replaceState(null, '', nextPath);
        } else if (`${location.pathname}` !== nextPath) {
            history.pushState(null, '', nextPath);
        }
        state.route = 'lobby';
        setActiveRoute();
        renderSections();
        if (options.render !== false) {
            renderRoute();
        }
    }

    async function enterLobbyWaitingRoom() {
        const roomId = state.lobbyRoomId;
        if (!roomId) return;
        renderLobbyWaitingRoom();
        if (!state.options?.decks?.length) {
            await loadAll();
        }
        try {
            const session = await ensureLobbySession(roomId);
            if (!session) return;
            state.lobbySession = session;
            writeLobbySession(session);
            saveMultiplayerSession({
                roomId: session.roomId,
                playerToken: session.playerToken,
                viewerSide: session.role === 'host' ? 'PLAYER' : 'ENEMY'
            });
            await pollLobbyStatusOnce();
            startLobbyPolling();
            void refreshRooms(true);
        } catch (error) {
            console.error('Lobby entry failed', error);
        }
    }

    async function ensureLobbySession(roomId) {
        const normalized = normalizeRoomId(roomId);
        const hostLobby = readHostLobby();
        if (hostLobby?.roomId && normalizeRoomId(hostLobby.roomId) === normalized) {
            const reconnected = await reconnectHostLobbySession(normalized, { silent: true });
            if (reconnected?.playerToken) return reconnected;
            const status = hostLobby.playerToken
                ? await fetchMatchStatus({ roomId: normalized, playerToken: hostLobby.playerToken })
                : null;
            if (status && !status.error) {
                return { roomId: normalized, playerToken: hostLobby.playerToken, role: 'host' };
            }
            const error = reconnected?.error || status?.error;
            if (staleLobbyError(error)) {
                return replaceStaleHostLobby(normalized, error);
            }
            if (error) {
                alert(error);
                return null;
            }
        }
        const saved = readLobbySession();
        if (normalizeRoomId(saved?.roomId) === normalized && saved.playerToken) {
            const status = await fetchMatchStatus(saved);
            if (status && !status.error) {
                return saved;
            }
        }
        if (isOwnLobbyRoomId(normalized)) {
            const reconnected = await reconnectHostLobbySession(normalized);
            if (reconnected?.playerToken) return reconnected;
            if (staleLobbyError(reconnected?.error)) {
                return replaceStaleHostLobby(normalized, reconnected.error);
            }
            return null;
        }
        if (!state.options?.decks?.length) {
            alert('Deck options are still loading. Try again in a moment.');
            return null;
        }
        if (state.lobbyBusy) return null;
        state.lobbyBusy = true;
        try {
            const data = await fetchJson('/api/match/join', {
                method: 'POST',
                body: JSON.stringify({ ...buildSocialMatchBody(), roomId })
            });
            if (data?.error) {
                alert(data.error);
                navigateHub('social');
                return null;
            }
            return { roomId: data.roomId, playerToken: data.playerToken, role: 'guest' };
        } finally {
            state.lobbyBusy = false;
        }
    }

    function readLobbySession() {
        try {
            const raw = localStorage.getItem(LOBBY_SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            return session?.roomId && session?.playerToken ? session : null;
        } catch (_error) {
            return null;
        }
    }

    function writeLobbySession(session) {
        if (!session?.roomId || !session?.playerToken) {
            localStorage.removeItem(LOBBY_SESSION_KEY);
            state.lobbySession = null;
            return;
        }
        localStorage.setItem(LOBBY_SESSION_KEY, JSON.stringify(session));
        state.lobbySession = session;
    }

    function clearLobbySession() {
        localStorage.removeItem(LOBBY_SESSION_KEY);
        state.lobbySession = null;
        state.lobbyStatus = null;
    }

    function currentLobbySession() {
        if (state.lobbySession?.roomId === state.lobbyRoomId) return state.lobbySession;
        const hostLobby = readHostLobby();
        if (hostLobby?.roomId === state.lobbyRoomId) {
            return { roomId: hostLobby.roomId, playerToken: hostLobby.playerToken, role: 'host' };
        }
        const saved = readLobbySession();
        if (saved?.roomId === state.lobbyRoomId) return saved;
        return null;
    }

    function isLobbyChatInputFocused() {
        const input = document.getElementById('lobbyChatInput');
        return Boolean(input && document.activeElement === input);
    }

    function lobbyChatLogHtml(messages = []) {
        const chatLines = (messages || []).slice(-24).map(line => {
            const role = String(line.role || '');
            const css = role === 'system' ? 'system' : '';
            return `<div class="lobby-chat-line ${css}"><strong>${escapeHtml(line.author || 'Player')}:</strong> ${escapeHtml(line.text || '')}</div>`;
        }).join('');
        return chatLines || '<div class="lobby-chat-line system">Say hello while you wait.</div>';
    }

    function renderLobbyChatLog() {
        const chatLog = document.getElementById('lobbyChatLog');
        if (!chatLog) return;
        const nextHtml = lobbyChatLogHtml(state.lobbyStatus?.lobbyChat);
        if (chatLog.innerHTML === nextHtml) return;
        const stickToBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 48;
        chatLog.innerHTML = nextHtml;
        if (stickToBottom) chatLog.scrollTop = chatLog.scrollHeight;
    }

    function lobbyWaitingContext() {
        const status = state.lobbyStatus;
        const session = currentLobbySession();
        const roomId = state.lobbyRoomId || status?.roomId || '';
        const isHost = session?.role === 'host' || status?.viewerIsHost;
        const viewerReady = isHost ? Boolean(status?.hostReady) : Boolean(status?.guestReady);
        const decks = state.options?.decks || [];
        const trainers = state.options?.trainers || [];
        const selectedDeck = status?.players?.find(player => player.role === (isHost ? 'host' : 'guest'))?.deckId || selectedDeckId();
        const selectedTrainer = status?.players?.find(player => player.role === (isHost ? 'host' : 'guest'))?.trainerId || selectedTrainerId();
        const deckOptions = decks.map(deck => `<option value="${escapeAttr(deck.id)}" ${deck.id === selectedDeck ? 'selected' : ''}>${escapeHtml(deck.name)}</option>`).join('');
        const trainerOptions = trainers.map(trainer => {
            const owned = isTrainerOwned(trainer.id);
            const level = Math.max(1, trainerOwnedLevel(trainer.id) || Number(trainer.level) || 1);
            const levelLabel = owned && level > 1 ? ` (Lv ${level})` : '';
            const lockLabel = owned ? '' : ' \u2014 Locked';
            return `<option value="${escapeAttr(trainer.id)}" ${trainer.id === selectedTrainer ? 'selected' : ''}${owned ? '' : ' disabled'}>${escapeHtml(trainer.name + levelLabel + lockLabel)}</option>`;
        }).join('');
        const players = status?.players || [];
        const hostPlayer = players.find(player => player.role === 'host') || { name: status?.hostName || 'Host', ready: false };
        const guestPlayer = players.find(player => player.role === 'guest');
        const statusLabel = status?.started
            ? 'Match starting — opening Play...'
            : !status?.guestJoined
                ? 'Waiting for opponent to join'
                : viewerReady
                    ? 'Waiting for opponent to confirm'
                    : 'Pick your deck and knight, then start match';
        return {
            status,
            session,
            roomId,
            isHost,
            viewerReady,
            selectedDeck,
            selectedTrainer,
            deckOptions,
            trainerOptions,
            hostPlayer,
            guestPlayer,
            statusLabel
        };
    }

    function bindLobbyWaitingRoomControls() {
        document.getElementById('lobbyReadyBtn')?.addEventListener('click', () => void confirmLobbyReady());
        document.getElementById('lobbyLeaveBtn')?.addEventListener('click', () => void leaveLobbyWaitingRoom());
        document.getElementById('lobbyCloseBtn')?.addEventListener('click', () => {
            const hostLobby = readHostLobby();
            if (hostLobby) void closeHostLobby(hostLobby);
        });
        document.getElementById('lobbyChatForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            void sendLobbyChat();
        });
    }

    function updateLobbyWaitingRoom() {
        const root = document.getElementById('lobbyWaitingRoot');
        if (!root || !root.querySelector('#lobbyChatInput')) {
            renderLobbyWaitingRoom();
            return;
        }
        const ctx = lobbyWaitingContext();
        const statusLine = root.querySelector('.lobby-waiting-head .social-muted-inline');
        if (statusLine) statusLine.textContent = `Room ${ctx.roomId} · ${ctx.statusLabel}`;
        const pill = root.querySelector('.lobby-status-pill');
        if (pill) pill.textContent = `${ctx.status?.guestJoined ? '2 / 2' : '1 / 2'} players`;
        const players = root.querySelector('.lobby-players');
        if (players) {
            players.innerHTML = `${renderLobbyPlayerSlot(ctx.hostPlayer, 'Host')}${ctx.guestPlayer
                ? renderLobbyPlayerSlot(ctx.guestPlayer, 'Guest')
                : renderLobbyPlayerSlot({ name: 'Waiting for player...', ready: false }, 'Open slot', true)}`;
        }
        const deckSelect = document.getElementById('lobbyDeckSelect');
        if (deckSelect) {
            deckSelect.disabled = ctx.viewerReady || Boolean(ctx.status?.started);
            if (deckSelect.value !== ctx.selectedDeck) deckSelect.value = ctx.selectedDeck;
        }
        const trainerSelect = document.getElementById('lobbyTrainerSelect');
        if (trainerSelect) {
            trainerSelect.disabled = ctx.viewerReady || Boolean(ctx.status?.started);
            if (trainerSelect.value !== ctx.selectedTrainer) trainerSelect.value = ctx.selectedTrainer;
        }
        const readyBtn = document.getElementById('lobbyReadyBtn');
        if (readyBtn) {
            readyBtn.disabled = !ctx.session || ctx.viewerReady || Boolean(ctx.status?.started);
            readyBtn.textContent = ctx.viewerReady ? 'Ready' : 'Start Match';
        }
        const chatInput = document.getElementById('lobbyChatInput');
        if (chatInput) chatInput.disabled = !ctx.session;
        renderLobbyChatLog();
        let invite = document.getElementById('lobbyInviteLink');
        if (ctx.status?.shareUrl) {
            const inviteHtml = `Invite link: <a href="${escapeAttr(ctx.status.shareUrl)}">${escapeHtml(ctx.status.shareUrl)}</a>`;
            if (invite) {
                invite.innerHTML = inviteHtml;
            } else {
                invite = document.createElement('p');
                invite.id = 'lobbyInviteLink';
                invite.className = 'social-muted-inline';
                invite.innerHTML = inviteHtml;
                root.querySelector('.lobby-chat-compose')?.insertAdjacentElement('afterend', invite);
            }
        } else if (invite) {
            invite.remove();
        }
    }

    function renderLobbyWaitingRoom() {
        const root = document.getElementById('lobbyWaitingRoot');
        if (!root) return;
        const ctx = lobbyWaitingContext();
        const {
            status,
            session,
            roomId,
            isHost,
            viewerReady,
            deckOptions,
            trainerOptions,
            hostPlayer,
            guestPlayer,
            statusLabel
        } = ctx;

        root.innerHTML = `<div class="lobby-waiting-head">
            <div>
                <span class="eyebrow">1v1 Waiting Room</span>
                <h1>${isHost ? 'My Arena' : escapeHtml(`${status?.hostName || 'Host'}'s Arena`)}</h1>
                <span class="social-muted-inline">Room ${escapeHtml(roomId)} · ${escapeHtml(statusLabel)}</span>
            </div>
            <span class="lobby-status-pill">${status?.guestJoined ? '2 / 2' : '1 / 2'} players</span>
        </div>
        <div class="lobby-waiting-grid">
            <section class="lobby-panel">
                <div class="social-panel-head"><div><span class="eyebrow">Players</span><h2>Lobby roster</h2></div></div>
                <div class="lobby-players">
                    ${renderLobbyPlayerSlot(hostPlayer, 'Host')}
                    ${guestPlayer ? renderLobbyPlayerSlot(guestPlayer, 'Guest') : renderLobbyPlayerSlot({ name: 'Waiting for player...', ready: false }, 'Open slot', true)}
                </div>
                <form class="lobby-loadout-form" id="lobbyLoadoutForm">
                    <label>Deck<select class="search-input" id="lobbyDeckSelect" ${viewerReady || status?.started ? 'disabled' : ''}>${deckOptions}</select></label>
                    <label>Knight<select class="search-input" id="lobbyTrainerSelect" ${viewerReady || status?.started ? 'disabled' : ''}>${trainerOptions}</select></label>
                </form>
                <div class="lobby-actions-row">
                    <button class="primary-btn" id="lobbyReadyBtn" type="button" ${!session || viewerReady || status?.started ? 'disabled' : ''}>${viewerReady ? 'Ready' : 'Start Match'}</button>
                    <button class="ghost-btn" id="lobbyLeaveBtn" type="button">Back to Lobbies</button>
                    ${isHost ? '<button class="ghost-btn" id="lobbyCloseBtn" type="button">Close Lobby</button>' : ''}
                </div>
            </section>
            <section class="lobby-panel">
                <div class="social-panel-head"><div><span class="eyebrow">Lobby Chat</span><h2>Say hello</h2></div></div>
                <div class="lobby-chat-log" id="lobbyChatLog">${lobbyChatLogHtml(status?.lobbyChat)}</div>
                <form class="lobby-chat-compose" id="lobbyChatForm">
                    <input class="search-input" id="lobbyChatInput" type="text" maxlength="120" placeholder="Message the lobby" ${session ? '' : 'disabled'}>
                    <button class="primary-btn" type="submit">Send</button>
                </form>
                ${status?.shareUrl ? `<p class="social-muted-inline" id="lobbyInviteLink">Invite link: <a href="${escapeAttr(status.shareUrl)}">${escapeHtml(status.shareUrl)}</a></p>` : ''}
            </section>
        </div>`;

        const chatLog = document.getElementById('lobbyChatLog');
        if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
        bindLobbyWaitingRoomControls();
    }

    function renderLobbyPlayerSlot(player, label, empty = false) {
        const ready = Boolean(player?.ready);
        return `<article class="lobby-player-card${ready ? ' ready' : ''}${empty ? ' empty' : ''}">
            <strong>${escapeHtml(player?.name || label)}</strong>
            <span>${empty ? 'Invite a friend or share your link' : (ready ? 'Ready to battle' : 'Choosing loadout')}</span>
        </article>`;
    }

    async function confirmLobbyReady() {
        const session = currentLobbySession();
        if (!session || state.lobbyBusy) return;
        const deckId = document.getElementById('lobbyDeckSelect')?.value || selectedDeckId();
        const trainerId = document.getElementById('lobbyTrainerSelect')?.value || selectedTrainerId();
        state.lobbyBusy = true;
        try {
            const data = await fetchJson('/api/match/ready', {
                method: 'POST',
                headers: {
                    'X-Room-Id': session.roomId,
                    'X-Player-Token': session.playerToken
                },
                body: JSON.stringify({
                    roomId: session.roomId,
                    playerName: socialBattleName(),
                    deckId,
                    trainerId,
                    loadoutLabel: ''
                })
            });
            if (data?.error) {
                alert(data.error);
                return;
            }
            state.lobbyStatus = data;
            if (data.started) {
                launchOnlineBattleFromSocial(session, data);
                return;
            }
            renderLobbyWaitingRoom();
        } finally {
            state.lobbyBusy = false;
        }
    }

    async function sendLobbyChat() {
        const session = currentLobbySession();
        const input = document.getElementById('lobbyChatInput');
        const message = input?.value?.trim();
        if (!session || !message) return;
        const data = await fetchJson('/api/match/lobby-chat', {
            method: 'POST',
            headers: {
                'X-Room-Id': session.roomId,
                'X-Player-Token': session.playerToken
            },
            body: JSON.stringify({ roomId: session.roomId, message })
        });
        if (data?.error) {
            alert(data.error);
            return;
        }
        if (input) input.value = '';
        if (state.lobbyStatus) {
            state.lobbyStatus.lobbyChat = data.lobbyChat || [];
        }
        renderLobbyChatLog();
    }

    async function leaveLobbyWaitingRoom() {
        const session = currentLobbySession();
        stopLobbyPolling();
        if (session?.role === 'guest' && session.roomId && session.playerToken && !state.lobbyStatus?.started) {
            try {
                const data = await fetchJson('/api/match/leave', {
                    method: 'POST',
                    headers: {
                        'X-Room-Id': session.roomId,
                        'X-Player-Token': session.playerToken
                    },
                    body: JSON.stringify({ roomId: session.roomId })
                });
                if (data?.error) {
                    alert(data.error);
                }
            } catch (error) {
                console.warn('Unable to leave lobby', error);
            }
            try {
                localStorage.removeItem(MULTIPLAYER_SESSION_KEY);
            } catch (_error) {
                // ignore storage failures
            }
        }
        clearLobbySession();
        state.lobbyRoomId = null;
        navigateHub('social');
        void refreshRooms(true);
    }

    function startLobbyPolling() {
        stopLobbyPolling();
        state.lobbyPollTimer = window.setInterval(() => {
            void pollLobbyStatusOnce();
        }, LOBBY_POLL_MS);
    }

    function stopLobbyPolling() {
        if (!state.lobbyPollTimer) return;
        window.clearInterval(state.lobbyPollTimer);
        state.lobbyPollTimer = null;
    }

    async function pollLobbyStatusOnce() {
        const session = currentLobbySession();
        if (!session) return;
        const status = await fetchMatchStatus(session);
        if (!status || status.error || status.closed) {
            if (status?.error || status?.closed) {
                alert(status?.error || 'This lobby has been closed.');
                await leaveLobbyWaitingRoom();
            }
            return;
        }
        state.lobbyStatus = status;
        if (status.started) {
            launchOnlineBattleFromSocial(session, status);
            return;
        }
        if (isLobbyChatInputFocused()) {
            updateLobbyWaitingRoom();
        } else {
            renderLobbyWaitingRoom();
        }
    }

    function saveMultiplayerSession(session) {
        if (!session?.roomId || !session?.playerToken) return;
        try {
            localStorage.setItem(MULTIPLAYER_SESSION_KEY, JSON.stringify(session));
        } catch (_error) {
            // ignore storage failures
        }
    }

    async function fetchMatchStatus(lobby) {
        if (!lobby?.roomId || !lobby?.playerToken) return null;
        return fetchJson('/api/match/status', {
            headers: {
                'X-Room-Id': lobby.roomId,
                'X-Player-Token': lobby.playerToken
            }
        });
    }

    function ensureHostLobbyPolling() {
        if (!readHostLobby()?.roomId) {
            stopHostLobbyPolling();
            return;
        }
        if (state.hostLobbyPollTimer) return;
        state.hostLobbyPollTimer = window.setInterval(() => {
            void checkHostLobbyForBattle();
        }, 3000);
        void checkHostLobbyForBattle();
    }

    function stopHostLobbyPolling() {
        if (!state.hostLobbyPollTimer) return;
        window.clearInterval(state.hostLobbyPollTimer);
        state.hostLobbyPollTimer = null;
    }

    async function checkHostLobbyForBattle() {
        const lobby = readHostLobby();
        if (!lobby?.roomId) {
            stopHostLobbyPolling();
            return;
        }
        const status = await fetchMatchStatus(lobby);
        if (!status || status.error) return;
        state.hostLobbyStatus = status;
        if (status.started) {
            launchOnlineBattleFromSocial(lobby, status);
        }
    }

    function launchOnlineBattleFromSocial(lobby, status) {
        if (!lobby?.roomId || !lobby?.playerToken || state.battleRedirectPending) return;
        state.battleRedirectPending = true;
        saveMultiplayerSession({
            roomId: lobby.roomId,
            playerToken: lobby.playerToken,
            viewerSide: status?.viewerSide || 'PLAYER'
        });
        localStorage.removeItem(HOST_LOBBY_KEY);
        state.hostLobbyStatus = null;
        stopHostLobbyPolling();
        goPlay({
            mode: 'online',
            roomId: lobby.roomId,
            deckId: selectedDeckId(),
            trainerId: selectedTrainerId(),
            battleLaunch: true
        });
    }

    async function copyLobbyInvite(url) {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
        } catch (_error) {
            window.prompt('Copy this invite link:', url);
        }
    }

    function formatLobbyExpiry(expiresAt) {
        if (!expiresAt) return '';
        const remainingMs = new Date(expiresAt).getTime() - Date.now();
        if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Expires soon';
        const minutes = Math.ceil(remainingMs / 60000);
        return `Closes in ${minutes} min`;
    }

    function readHostLobby() {
        try {
            const raw = localStorage.getItem(HOST_LOBBY_KEY);
            if (!raw) return null;
            const lobby = JSON.parse(raw);
            if (!lobby?.roomId) return null;
            if (lobby.expiresAt && new Date(lobby.expiresAt).getTime() <= Date.now()) {
                localStorage.removeItem(HOST_LOBBY_KEY);
                return null;
            }
            return lobby;
        } catch (_error) {
            return null;
        }
    }

    function writeHostLobby(lobby) {
        if (!lobby?.roomId) {
            localStorage.removeItem(HOST_LOBBY_KEY);
            state.hostLobbyStatus = null;
            return;
        }
        localStorage.setItem(HOST_LOBBY_KEY, JSON.stringify(lobby));
    }

    async function closeHostLobby(lobby) {
        if (!lobby?.roomId) return;
        const headers = { 'Content-Type': 'application/json' };
        if (isLegacyBearerToken(state.token)) headers.Authorization = `Bearer ${state.token}`;
        if (lobby.playerToken) {
            headers['X-Room-Id'] = lobby.roomId;
            headers['X-Player-Token'] = lobby.playerToken;
        }
        const data = await fetchJson('/api/match/close', {
            method: 'POST',
            headers,
            body: JSON.stringify({ roomId: lobby.roomId })
        });
        if (data?.error) return alert(data.error);
        localStorage.removeItem(HOST_LOBBY_KEY);
        clearLobbySession();
        state.hostLobbyStatus = null;
        state.battleRedirectPending = false;
        stopHostLobbyPolling();
        stopLobbyPolling();
        await refreshRooms(true);
        renderSocialActiveLobby();
        if (state.route === 'lobby') {
            navigateHub('social');
        }
    }

    function startSocialPolling() {
        stopSocialPolling();
        refreshSocialData(true);
        state.socialPollTimer = window.setInterval(() => refreshSocialData(false), SOCIAL_POLL_MS);
    }

    function stopSocialPolling() {
        if (state.socialPollTimer) {
            window.clearInterval(state.socialPollTimer);
            state.socialPollTimer = null;
        }
    }

    function startPresenceHeartbeat() {
        stopPresenceHeartbeat();
        if (!state.profile?.authenticated) return;
        void sendPresenceHeartbeat();
        state.presenceTimer = window.setInterval(() => sendPresenceHeartbeat(), PRESENCE_HEARTBEAT_MS);
    }

    function stopPresenceHeartbeat() {
        if (state.presenceTimer) {
            window.clearInterval(state.presenceTimer);
            state.presenceTimer = null;
        }
    }

    async function refreshSocialData(forceRooms) {
        if (!state.profile?.authenticated) {
            state.friendPresence = {};
            state.messageThreads = [];
            renderFriends();
            return;
        }
        await syncProfile();
        await Promise.all([
            refreshRooms(state.route === 'social' ? true : forceRooms),
            refreshFriendPresence(),
            refreshMessageThreads(),
            sendPresenceHeartbeat()
        ]);
        if (readHostLobby()?.roomId) {
            await checkHostLobbyForBattle();
        }
        renderFriends();
        renderFriendRequests();
        renderSocialActiveLobby();
    }

    async function sendPresenceHeartbeat() {
        if (!state.profile?.authenticated) return;
        const hostLobby = readHostLobby();
        await fetchJson('/api/social/presence/heartbeat', {
            method: 'POST',
            body: JSON.stringify({
                status: hostLobby?.roomId ? 'IN_GAME' : 'ONLINE',
                currentRoomId: hostLobby?.roomId || null
            })
        });
    }

    async function refreshFriendPresence() {
        const data = await fetchJson('/api/social/presence');
        if (data?.error) return;
        const map = {};
        (data.friends || []).forEach(row => {
            if (row.userId) map[row.userId] = row;
            if (row.email) map[row.email] = row;
        });
        state.friendPresence = map;
    }

    async function refreshMessageThreads() {
        const data = await fetchJson('/api/social/messages/threads');
        if (data?.error) return;
        state.messageThreads = data.threads || [];
    }

    // The standalone thread list is gone — unread chats surface as a blinking
    // badge on each friend's Message button (see friendHasUnread).

    function chatMessageSenderLabel(message, peerId) {
        if (message?.mine) return 'You';
        const senderId = message?.senderId || peerId;
        const friend = (state.profile?.friends || []).find(row => row.email === senderId);
        if (friend?.displayName) return friend.displayName;
        const peer = (state.profile?.friends || []).find(row => row.email === peerId);
        return peer?.displayName || senderId || 'Friend';
    }

    function renderChatMessageBubble(message, peerId) {
        const sender = chatMessageSenderLabel(message, peerId);
        const when = message?.createdAt ? formatDateTime(message.createdAt) : '';
        const timeMarkup = when
            ? `<time class="message-bubble-time" datetime="${escapeAttr(message.createdAt)}">${escapeHtml(when)}</time>`
            : '';
        return `<div class="message-bubble ${message.mine ? 'mine' : 'theirs'}">
            <div class="message-bubble-meta">
                <span class="message-bubble-sender">${escapeHtml(sender)}</span>
                ${timeMarkup}
            </div>
            <div class="message-bubble-text">${escapeHtml(message.text || '')}</div>
        </div>`;
    }

    async function openMessageComposer(peerId, focusInput = true) {
        if (!state.profile?.authenticated) return openAuth();
        state.activeChatPeer = peerId;
        // The chat lives inside the friends modal as a full-screen takeover;
        // opening it from anywhere (friend card, profile page) raises both.
        document.getElementById('friendsModal')?.classList.remove('hidden');
        showFriendsChatView(true);
        const compose = document.getElementById('messageCompose');
        const title = document.getElementById('messageComposeTitle');
        const log = document.getElementById('messageLog');
        const friend = (state.profile?.friends || []).find(row => row.email === peerId);
        if (title) title.textContent = resolveFriendDisplayName(friend || { email: peerId });
        compose?.classList.remove('hidden');
        const data = await fetchJson(`/api/social/messages/with/${encodeURIComponent(peerId)}`);
        if (!data || data?.error) {
            const message = data?.error || 'Could not load this chat.';
            if (log) log.innerHTML = `<div class="social-empty-state">${escapeHtml(message)}</div>`;
            return;
        }
        if (log) {
            log.innerHTML = (data.messages || []).length
                ? data.messages.map(message => renderChatMessageBubble(message, peerId)).join('')
                : '<div class="social-empty-state"><span>Say hello to start the conversation.</span></div>';
            log.scrollTop = log.scrollHeight;
        }
        markChatSeen(peerId);
        if (focusInput) document.getElementById('messageInput')?.focus();
    }

    async function sendChatMessage(event) {
        event?.preventDefault();
        if (!state.activeChatPeer) return;
        const input = document.getElementById('messageInput');
        const text = input?.value?.trim() || '';
        if (!text) return;
        const data = await fetchJson('/api/social/messages/send', {
            method: 'POST',
            body: JSON.stringify({ recipientId: state.activeChatPeer, text })
        });
        if (data?.error) return alert(data.error);
        if (input) input.value = '';
        await refreshMessageThreads();
        await openMessageComposer(state.activeChatPeer, false);
    }

    function publicProfileViewModel(data) {
        const prefs = {
            ...defaultProfilePrefs({ displayName: data.profileSettings?.displayName || 'Player' }),
            ...(data.profileSettings || {})
        };
        const favoriteElement = normalizeProfileElement(prefs.favoriteElement);
        prefs.favoriteElement = favoriteElement;
        const theme = profileThemeFor(prefs);
        const stats = data.stats || {};
        const battles = (data.recentMatches || []).map((row, index) => normalizeBattle(row, favoriteElement, index));
        const record = battleRecord(battles);
        const level = Math.max(1, Number(stats.level) || Math.floor((stats.ownedTotal || 0) / 12) + 1);
        return { prefs, theme, stats, battles, record, level, data };
    }

    function renderPublicProfileHero(view) {
        const { prefs, theme, data } = view;
        const presence = data.presence || {};
        const statusLabel = presence.online ? String(presence.status || 'ONLINE').replace('_', ' ') : 'Offline';
        return `<section class="profile-hero profile-hero-neutral">
            <div class="profile-hero-content">
                <div class="profile-avatar-wrap">
                    ${renderPlayerAvatar(prefs, 'profile-avatar')}
                    <span class="profile-level">LV ${view.level}</span>
                </div>
                <div class="profile-identity">
                    <div class="profile-hero-topline">
                        ${renderElementBadge(prefs.favoriteElement)}
                        <span class="profile-soft-pill">${escapeHtml(statusLabel)}</span>
                    </div>
                    <h2>${escapeHtml(prefs.displayName || data.userId || 'Player')}</h2>
                    <p class="profile-title">${escapeHtml(resolveProfileTitleLabel(prefs))}</p>
                    <p class="profile-bio">${escapeHtml(prefs.bio || '')}</p>
                    ${renderProfileFavoriteSiegling(prefs)}
                    <p class="profile-muted">${escapeHtml(prefs.preferredCardBack || '')} card back</p>
                </div>
            </div>
        </section>`;
    }

    function renderPublicProfileStats(view) {
        const { stats, record } = view;
        const cards = [
            ['Cards Owned', stats.ownedTotal ?? 0, 'Total copies'],
            ['Unique Cards', stats.uniqueOwned ?? 0, 'Discovered'],
            ['Coins', stats.gold ?? 0, 'Wallet'],
            ['Wins', record.wins, 'Recorded matches'],
            ['Losses', record.losses, 'Recorded matches'],
            ['Win Rate', `${record.winRate}%`, 'Recent record']
        ];
        return `<section class="profile-stat-grid">${cards.map(([label, value, hint]) => renderStatCard(label, value, hint)).join('')}</section>`;
    }

    function renderPublicProfileActions(view) {
        const data = view.data;
        const userId = data.userId;
        const myEmail = normalizePlayerId(state.profile?.user?.email);
        const isSelf = Boolean(myEmail && myEmail === normalizePlayerId(userId));
        if (isSelf) {
            return '<p class="profile-muted">This is your profile. Use Edit Profile on your account page to make changes.</p>';
        }
        if (data.isFriend) {
            return `<div class="profile-edit-actions">
                <button class="primary-btn profile-theme-btn" type="button" data-public-profile-message>Message</button>
            </div>`;
        }
        if (data.incomingFriendRequest) {
            return `<div class="profile-edit-actions">
                <button class="primary-btn profile-theme-btn" type="button" data-public-profile-accept>Accept Request</button>
                <button class="ghost-btn profile-theme-btn" type="button" data-public-profile-deny>Decline</button>
            </div><p class="profile-muted" id="publicProfileFriendMsg"></p>`;
        }
        if (data.outgoingFriendRequest) {
            return '<p class="profile-muted">Friend request sent. Waiting for them to accept.</p>';
        }
        return `<div class="profile-edit-actions">
            <button class="primary-btn profile-theme-btn" type="button" data-public-profile-add-friend>Send Friend Request</button>
        </div><p class="profile-muted" id="publicProfileFriendMsg"></p>`;
    }

    function renderPublicProfilePageHtml(view) {
        return `<div class="profile-dashboard public-profile-page" style="${profileThemeStyle(view.theme)}">
            <div class="public-profile-toolbar">
                <button class="ghost-btn compact-btn" type="button" data-public-profile-back>← Back</button>
            </div>
            ${renderPublicProfileHero(view)}
            ${renderPublicProfileStats(view)}
            ${view.battles.length ? renderBattleRecordPanel(view) : ''}
            ${view.battles.length
                ? renderBattleHistoryList(view, true)
                : `<section class="profile-panel"><p class="profile-muted">${view.data.isFriend ? 'No recorded battles yet.' : 'Recent battles are visible once you are friends.'}</p></section>`}
            ${renderPublicProfileActions(view)}
        </div>`;
    }

    function bindPublicProfilePage(view) {
        const body = document.getElementById('profileSectionBody');
        if (!body) return;
        const userId = view.data.userId;
        body.querySelector('[data-public-profile-back]')?.addEventListener('click', () => {
            if (state.profile?.authenticated) {
                navigateHub('profile');
            } else {
                navigateHub('social');
            }
        });
        body.querySelector('[data-public-profile-message]')?.addEventListener('click', () => {
            navigateHub('social');
            openMessageComposer(userId);
        });
        body.querySelector('[data-public-profile-add-friend]')?.addEventListener('click', () => addFriendByEmail(userId, 'publicProfileFriendMsg'));
        body.querySelector('[data-public-profile-accept]')?.addEventListener('click', async () => {
            await respondToFriendRequest(userId, 'accept');
            void loadPublicProfilePage(userId);
        });
        body.querySelector('[data-public-profile-deny]')?.addEventListener('click', async () => {
            await respondToFriendRequest(userId, 'deny');
            navigateHub('profile');
        });
        const matchSource = view.data.recentMatches || [];
        body.querySelectorAll('.battle-row-clickable[data-match-index]').forEach(row => {
            const index = Number(row.dataset.matchIndex);
            row.addEventListener('click', () => openMatchReview(index, matchSource));
            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMatchReview(index, matchSource);
                }
            });
        });
    }

    async function loadPublicProfilePage(userId) {
        const normalized = normalizePlayerId(userId);
        const body = document.getElementById('profileSectionBody');
        if (!body || state.profileUserId !== normalized) return;
        const data = await fetchJson(`/api/social/players/${encodeURIComponent(normalized)}/profile`).catch(() => ({ error: 'Could not load this profile.' }));
        if (state.profileUserId !== normalized) return;
        if (data?.error) {
            body.innerHTML = `<div class="profile-dashboard public-profile-page">
                <div class="public-profile-toolbar">
                    <button class="ghost-btn compact-btn" type="button" data-public-profile-back>← Back</button>
                </div>
                <p class="profile-muted">${escapeHtml(data.error || 'This player could not be found.')}</p>
            </div>`;
            body.querySelector('[data-public-profile-back]')?.addEventListener('click', () => navigateHub(state.profile?.authenticated ? 'profile' : 'social'));
            return;
        }
        const view = publicProfileViewModel(data);
        body.innerHTML = renderPublicProfilePageHtml(view);
        bindPublicProfilePage(view);
    }

    function openPlayerProfile(userId) {
        navigateToPlayerProfile(userId);
    }

    async function addFriendByEmail(email, messageElementId = 'viewProfileFriendMsg') {
        const msg = document.getElementById(messageElementId);
        if (!state.profile?.authenticated) {
            closePlayerProfile();
            openAuth();
            return;
        }
        const data = await fetchJson('/api/profile/friends', { method: 'POST', body: JSON.stringify({ email }) });
        if (data?.error) {
            if (msg) { msg.textContent = data.error; msg.style.color = '#ff7676'; }
            return;
        }
        state.profile = data;
        state.progression = data.progression || state.progression;
        const btn = document.getElementById('viewProfileAddFriendBtn')
            || document.querySelector('[data-public-profile-add-friend]');
        if (btn) { btn.textContent = 'Request Sent'; btn.disabled = true; }
        if (msg) { msg.textContent = 'They will need to accept before you can message.'; msg.style.color = ''; }
        renderFriends();
        renderFriendRequests();
    }

    function closePlayerProfile() {
        state.viewingProfile = null;
        document.getElementById('viewProfileModal')?.classList.add('hidden');
    }

    const GUIDE_SECTIONS = [
        {
            id: 'arena',
            label: 'The Arena',
            title: 'Build links, wake sockets, command momentum',
            html: `<p>Siegelings is a board-first card battle game. Place Siegelings during setup, connect matching notches, then spend the elemental energy those links create.</p>
                <ol class="guide-list">
                    <li><strong>Notches wake sockets.</strong> Each Siegeling has notches on its edges. When a notch lines up with an open socket on the board, it wakes and feeds your energy pool.</li>
                    <li><strong>Matching links strengthen the network.</strong> Connecting notches of the same element between your Siegelings reinforces your board and unlocks stronger plays.</li>
                    <li><strong>Deck choice and SiegeKnight timing shape the plan.</strong> Lead with the right deck, then time your SiegeKnight to swing momentum when the board is set.</li>
                </ol>`
        },
        {
            id: 'app',
            label: 'Using the App',
            title: 'Find your way around the binder hub',
            html: `<ul class="guide-list">
                    <li><strong>Home</strong> — your command hub with collection stats, daily leaderboards, and quick play.</li>
                    <li><strong>Play</strong> — solo PVE and live 1v1 battles after a Social lobby fills.</li>
                    <li><strong>Cards</strong> — your owned binder by default. Use the <em>Show unowned</em> toggle in Filters to browse the full catalog, then filter by element, type, rarity, and energy cost.</li>
                    <li><strong>Decks</strong> — run premade decks right away; custom deckbuilding unlocks once your binder holds 30 owned copies. Save custom lists to your deck binder.</li>
                    <li><strong>Social</strong> — create and join 1v1 lobbies, friends, messaging, and player profiles.</li>
                    <li><strong>Shop</strong> — spend Siegecoins on packs. Opening a pack starts the gacha reveal; tap each card to flip it.</li>
                    <li><strong>Profile</strong> — customize your avatar, favorite element, title, bio, and card back.</li>
                    <li><strong>Options</strong> — this menu: the full guide, your shareable profile QR, and admin access.</li>
                </ul>
                <p class="guide-note">Earn <strong>Remnants</strong> from opening packs and winning matches, then craft specific cards from the Cards menu.</p>`
        },
        {
            id: 'modes',
            label: 'Game Modes',
            title: 'Battle now, Siege coming soon',
            html: `<ul class="guide-list">
                    <li><strong>Battle</strong> — the live mode on the Play table: solo PVE against the AI and live 1v1 PvP once a Social lobby fills. Battle is <em>flat power</em> — every SiegeKnight fights at its base ability values, so matches come down to your deck, your links, and your reads, not your account progress.</li>
                    <li><strong>Siege</strong> (coming soon) — a roguelike run where your SiegeKnight levels matter. The XP you bank on the Cards screen powers up a knight's passive and active abilities, and those bonuses carry into every fight of the run.</li>
                </ul>
                <p class="guide-note">SiegeKnight leveling only affects Siege — it has no effect in Battle, so a fresh account and a maxed one stand on equal footing there. Level your knights now so they are ready when Siege opens.</p>`
        },
        {
            id: 'elements',
            label: 'Elemental Affinity',
            title: 'Elements and how they connect',
            html: `<p>Every Siegeling, spell, and trap belongs to an element. Notches carry an element too — matching the element of a notch to its neighbor forms a stronger link and a cleaner energy feed.</p>
                <div class="guide-elements">
                    <span class="guide-el" style="--gc:#f05b2f">Fire</span>
                    <span class="guide-el" style="--gc:#3c8ed8">Water</span>
                    <span class="guide-el" style="--gc:#7ad9e7">Ice</span>
                    <span class="guide-el" style="--gc:#64c987">Wind</span>
                    <span class="guide-el" style="--gc:#a7773d">Earth</span>
                    <span class="guide-el" style="--gc:#6d4a9e">Shadow</span>
                    <span class="guide-el" style="--gc:#f5cf3d">Electric</span>
                    <span class="guide-el" style="--gc:#aeb5b8">Metal</span>
                    <span class="guide-el" style="--gc:#9f7c73">Undead</span>
                    <span class="guide-el" style="--gc:#db73b4">Psychic</span>
                    <span class="guide-el" style="--gc:#95a5a6">Neutral</span>
                </div>
                <p class="guide-note">Lean into one or two elements so your notches line up and your energy pool stays focused, or splash for flexible answers at the cost of weaker links.</p>`
        },
        {
            id: 'energy',
            label: 'Energy in Battle',
            title: 'How energy is made and spent',
            html: `<ol class="guide-list">
                    <li><strong>Place a Siegeling.</strong> During setup and each turn you commit Siegelings to the board.</li>
                    <li><strong>Notches wake sockets.</strong> A notch touching an open socket wakes it, generating elemental energy of that notch's element into your pool.</li>
                    <li><strong>Matching links compound.</strong> When two Siegelings connect on a shared element, the link feeds energy more efficiently and reinforces both cards.</li>
                    <li><strong>Spend energy.</strong> Energy in your pool pays for abilities, spells, and traps. Most cards cost a specific amount of a specific element — build the pool that matches your hand.</li>
                </ol>
                <p class="guide-note">Energy is generated by your board, not handed out for free — the better your notch network, the more you can spend each turn.</p>`
        },
        {
            id: 'spells-traps',
            label: 'Strategies & Deceptions',
            title: 'One-shot effects and reactive defense',
            html: `<ul class="guide-list">
                    <li><strong>Strategies</strong> are played from your hand for an immediate effect — damage, buffs, energy swings, or board control. They cost energy from your pool and resolve right away.</li>
                    <li><strong>Deceptions</strong> are concealed ahead of time and spring when their condition is met (such as an opponent attacking or playing into them). Set them early, then let your opponent walk into the trigger.</li>
                    <li><strong>Reactions</strong> — some cards require a specific reaction or combo to fire. Check a card's detail panel for its cost element, required reaction, and ability text.</li>
                </ul>
                <p class="guide-note">Hold a trap when you read an incoming play, and chain spells off a strong energy turn for a momentum swing.</p>`
        }
    ];

    function openOptions() {
        state.optionsView = 'menu';
        renderOptions();
        document.getElementById('optionsModal')?.classList.remove('hidden');
    }

    function closeOptions() {
        document.getElementById('optionsModal')?.classList.add('hidden');
    }

    function renderOptions() {
        const body = document.getElementById('optionsBody');
        if (!body) return;
        const view = state.optionsView || 'menu';
        if (view === 'menu') {
            body.innerHTML = `<div class="view-profile-modal-head">
                    <div><span class="eyebrow">Home</span><h2 id="optionsTitle">Settings</h2></div>
                    <button class="ghost-btn compact-btn" type="button" data-options-close>Close</button>
                </div>
                <div class="options-menu">
                    <button class="options-menu-item" type="button" data-options-view="guide">
                        <span class="options-menu-icon">&#128214;</span>
                        <span><strong>Guide</strong><small>Arena, app, modes, elements, energy, spells &amp; traps</small></span>
                    </button>
                    <button class="options-menu-item" type="button" data-options-view="share">
                        <span class="options-menu-icon">&#128279;</span>
                        <span><strong>Share Profile</strong><small>Show a QR code so others can view and friend you</small></span>
                    </button>
                    <button class="options-menu-item" type="button" data-options-view="account">
                        <span class="options-menu-icon">&#128100;</span>
                        <span><strong>Account</strong><small>Manage or permanently delete your account</small></span>
                    </button>
                    <button class="options-menu-item" type="button" data-options-tour>
                        <span class="options-menu-icon">&#129517;</span>
                        <span><strong>New Player Guide</strong><small>Replay the HUD walkthrough and tutorial match offer</small></span>
                    </button>
                    <button class="options-menu-item" type="button" data-options-view="gallery">
                        <span class="options-menu-icon">&#127912;</span>
                        <span><strong>Art Gallery</strong><small>Browse loading screen art, set page and profile backgrounds</small></span>
                    </button>
                    <button class="options-menu-item" type="button" data-options-support>
                        <span class="options-menu-icon">&#127911;</span>
                        <span><strong>Support</strong><small>Join the Discord for help, bug reports, and feedback</small></span>
                    </button>
                    <button class="options-menu-item" type="button" data-options-view="admin">
                        <span class="options-menu-icon">&#9881;</span>
                        <span><strong>Admin</strong><small>Password-protected dashboard access</small></span>
                    </button>
                </div>`;
        } else if (view === 'guide') {
            const activeId = state.guideTab && GUIDE_SECTIONS.some(s => s.id === state.guideTab) ? state.guideTab : GUIDE_SECTIONS[0].id;
            const section = GUIDE_SECTIONS.find(s => s.id === activeId);
            body.innerHTML = `<div class="view-profile-modal-head">
                    <div><span class="eyebrow">Options</span><h2 id="optionsTitle">Guide</h2></div>
                    <button class="ghost-btn compact-btn" type="button" data-options-view="menu">Back</button>
                </div>
                <div class="guide-tabs">
                    ${GUIDE_SECTIONS.map(s => `<button class="guide-tab${s.id === activeId ? ' active' : ''}" type="button" data-guide-tab="${s.id}">${escapeHtml(s.label)}</button>`).join('')}
                </div>
                <div class="guide-content">
                    <h3>${escapeHtml(section.title)}</h3>
                    ${section.html}
                </div>`;
        } else if (view === 'gallery') {
            const pageArt = readStoredArt(PAGE_ART_KEY);
            const profileArt = readStoredArt(PROFILE_ART_KEY);
            const pieces = state.loadingArt || [];
            body.innerHTML = `<div class="view-profile-modal-head">
                    <div><span class="eyebrow">Options</span><h2 id="optionsTitle">Art Gallery</h2></div>
                    <button class="ghost-btn compact-btn" type="button" data-options-view="menu">Back</button>
                </div>
                ${pieces.length ? `<p class="guide-note">Tap a piece to view it full screen. Set any piece as the page background or your profile card art — picking it again switches back to the default look.</p>
                <div class="art-gallery-grid">
                    ${pieces.map(piece => {
                        const thumb = artImageFor(piece, false);
                        const isPage = pageArt?.id === piece.id;
                        const isProfile = profileArt?.id === piece.id;
                        return `<figure class="art-gallery-tile">
                            <button class="art-gallery-thumb" type="button" data-art-view="${escapeAttr(piece.id)}" style="background-image:url('${escapeAttr(thumb)}')" aria-label="View ${escapeAttr(piece.title)} full screen"></button>
                            <figcaption>
                                <strong>${escapeHtml(piece.title)}</strong>
                                <div class="art-gallery-actions">
                                    <button class="ghost-btn compact-btn${isPage ? ' active' : ''}" type="button" data-art-set-page="${escapeAttr(piece.id)}">${isPage ? 'Page bg &#10003;' : 'Page bg'}</button>
                                    <button class="ghost-btn compact-btn${isProfile ? ' active' : ''}" type="button" data-art-set-profile="${escapeAttr(piece.id)}">${isProfile ? 'Profile &#10003;' : 'Profile'}</button>
                                </div>
                            </figcaption>
                        </figure>`;
                    }).join('')}
                </div>
                ${pageArt || profileArt ? '<button class="ghost-btn compact-btn art-gallery-reset" type="button" data-art-clear>Reset backgrounds to default</button>' : ''}`
                : `<p class="guide-note">No art yet. Drop loading screen images into <code>img/art/loading/</code> named like <code>fire-ridge-landscape.png</code> and <code>fire-ridge-portrait.png</code> &mdash; the loading screens, this gallery, and the background pickers fill in automatically.</p>`}`;
        } else if (view === 'share') {
            const email = state.profile?.user?.email || '';
            const authed = Boolean(state.profile?.authenticated && email);
            const link = authed ? `${location.origin}${playerProfilePath(email)}` : '';
            let qrMarkup = '<p class="guide-note">Sign in to generate your shareable profile code.</p>';
            if (authed) {
                if (typeof qrcode === 'function') {
                    try {
                        const qr = qrcode(0, 'M');
                        qr.addData(link);
                        qr.make();
                        qrMarkup = `<div class="share-qr">${qr.createImgTag(5, 8)}</div>`;
                    } catch (err) {
                        qrMarkup = '<p class="guide-note">Could not generate a QR code right now.</p>';
                    }
                } else {
                    qrMarkup = '<p class="guide-note">QR generator unavailable.</p>';
                }
            }
            body.innerHTML = `<div class="view-profile-modal-head">
                    <div><span class="eyebrow">Options</span><h2 id="optionsTitle">Share Profile</h2></div>
                    <button class="ghost-btn compact-btn" type="button" data-options-view="menu">Back</button>
                </div>
                <div class="share-profile">
                    ${qrMarkup}
                    ${authed ? `<p class="guide-note">Scan to open ${escapeHtml(state.profile?.user?.displayName || 'this')} profile, where you can send a friend request.</p>
                    <div class="share-link-row">
                        <input class="search-input" id="shareProfileLink" type="text" readonly value="${escapeAttr(link)}">
                        <button class="primary-btn" type="button" id="copyShareLinkBtn">Copy link</button>
                    </div>` : ''}
                </div>`;
        } else if (view === 'account') {
            const authed = Boolean(state.profile?.authenticated);
            const email = state.profile?.user?.email || '';
            body.innerHTML = `<div class="view-profile-modal-head">
                    <div><span class="eyebrow">Options</span><h2 id="optionsTitle">Account</h2></div>
                    <button class="ghost-btn compact-btn" type="button" data-options-view="menu">Back</button>
                </div>
                ${authed ? `<div class="account-panel">
                    <p class="guide-note">Signed in as <strong>${escapeHtml(email)}</strong>.</p>
                    <div class="account-danger">
                        <h3>Delete account</h3>
                        <p class="guide-note">This permanently removes your account and all associated data &mdash; saved decks, match history, collection progress, friends, and messages. This cannot be undone.</p>
                        <form class="account-danger-form" id="deleteAccountForm">
                            <label class="account-danger-label" for="deleteAccountConfirm">Type <strong>DELETE</strong> to confirm</label>
                            <input class="search-input" id="deleteAccountConfirm" type="text" autocomplete="off" placeholder="DELETE">
                            <p class="admin-error" id="deleteAccountError"></p>
                            <button class="danger-btn" id="deleteAccountBtn" type="submit" disabled>Permanently delete my account</button>
                        </form>
                    </div>
                </div>` : `<p class="guide-note">Sign in to manage your account.</p>`}`;
        } else if (view === 'admin') {
            body.innerHTML = `<div class="view-profile-modal-head">
                    <div><span class="eyebrow">Options</span><h2 id="optionsTitle">Admin</h2></div>
                    <button class="ghost-btn compact-btn" type="button" data-options-view="menu">Back</button>
                </div>
                <form class="admin-access" id="optionsAdminForm">
                    <p class="guide-note">Enter the admin password to open the card dashboard.</p>
                    <input class="search-input" id="optionsAdminPassword" type="password" placeholder="Password" autocomplete="off">
                    <p class="admin-error" id="optionsAdminError"></p>
                    <button class="primary-btn" type="submit">Unlock Dashboard</button>
                </form>`;
        }
    }

    function handleOptionsClick(event) {
        if (event.target.closest('[data-options-close]')) { closeOptions(); return; }
        if (event.target.closest('[data-options-tour]')) {
            closeOptions();
            startOnboardingTour();
            return;
        }
        if (event.target.closest('[data-options-support]')) {
            window.open('https://discord.gg/T4WrHCGJ9b', '_blank', 'noopener,noreferrer');
            return;
        }
        const artView = event.target.closest('[data-art-view]');
        if (artView) { openArtLightbox(artView.dataset.artView); return; }
        const artPage = event.target.closest('[data-art-set-page]');
        if (artPage) { setStoredArt(PAGE_ART_KEY, artPage.dataset.artSetPage); return; }
        const artProfile = event.target.closest('[data-art-set-profile]');
        if (artProfile) { setStoredArt(PROFILE_ART_KEY, artProfile.dataset.artSetProfile); return; }
        if (event.target.closest('[data-art-clear]')) {
            localStorage.removeItem(PAGE_ART_KEY);
            localStorage.removeItem(PROFILE_ART_KEY);
            persistArtSelection(PAGE_ART_KEY, '');
            persistArtSelection(PROFILE_ART_KEY, '');
            applyCustomPageArt();
            renderOptions();
            if (state.route === 'profile') safeRender(renderProfile);
            return;
        }
        const viewBtn = event.target.closest('[data-options-view]');
        if (viewBtn) { state.optionsView = viewBtn.dataset.optionsView; renderOptions(); return; }
        const tabBtn = event.target.closest('[data-guide-tab]');
        if (tabBtn) { state.guideTab = tabBtn.dataset.guideTab; renderOptions(); return; }
        if (event.target.closest('#copyShareLinkBtn')) {
            const input = document.getElementById('shareProfileLink');
            if (input) {
                input.select();
                navigator.clipboard?.writeText(input.value).catch(() => {});
                const btn = document.getElementById('copyShareLinkBtn');
                if (btn) { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 1600); }
            }
        }
    }

    function handleOptionsSubmit(event) {
        if (event.target.closest('#deleteAccountForm')) {
            event.preventDefault();
            const value = (document.getElementById('deleteAccountConfirm')?.value || '').trim();
            const err = document.getElementById('deleteAccountError');
            if (value !== 'DELETE') {
                if (err) err.textContent = 'Type DELETE exactly to confirm.';
                return;
            }
            if (err) err.textContent = '';
            deleteAccount(value);
            return;
        }
        const form = event.target.closest('#optionsAdminForm');
        if (!form) return;
        event.preventDefault();
        const pass = document.getElementById('optionsAdminPassword')?.value || '';
        if (pass === 'Aviators4!') {
            window.location.href = '/card-dashboard.html';
        } else {
            const err = document.getElementById('optionsAdminError');
            if (err) err.textContent = 'Incorrect password.';
        }
    }

    function handleOptionsInput(event) {
        if (event.target.id === 'deleteAccountConfirm') {
            const btn = document.getElementById('deleteAccountBtn');
            if (btn) btn.disabled = event.target.value.trim() !== 'DELETE';
        }
    }

    document.getElementById('closeMessageComposeBtn')?.addEventListener('click', () => {
        state.activeChatPeer = null;
        showFriendsChatView(false);
        // Re-render so the Message button's unread badge clears for the chat
        // that was just read.
        renderFriends();
    });
    document.getElementById('messageSendForm')?.addEventListener('submit', sendChatMessage);

    document.addEventListener('click', (event) => {
        const shopPreviewButton = event.target.closest('[data-shop-preview-card-id]');
        if (shopPreviewButton) {
            openShopCardPreview(shopPreviewButton.dataset.shopPreviewCardId);
            return;
        }
        if (event.target.closest('[data-close-shop-card-preview]') || event.target.matches('[data-shop-card-preview-backdrop]')) {
            closeShopCardPreview();
            return;
        }
        if (event.target.closest('[data-clear-pack-result]')) {
            clearPackResult();
            return;
        }
        const oddsButton = event.target.closest('[data-pack-odds]');
        if (oddsButton) {
            showPackOdds(oddsButton.dataset.packOdds);
            return;
        }
        const packButton = event.target.closest('[data-pack-id]');
        if (packButton) choosePack(packButton.dataset.packId, Number(packButton.dataset.packCount) || 1);
        const dailyOfferButton = event.target.closest('[data-daily-offer-id]');
        if (dailyOfferButton) purchaseDailyOffer(dailyOfferButton.dataset.dailyOfferId);
        const titleButton = event.target.closest('[data-purchase-title-id]');
        if (titleButton) purchasePlayerTitle(titleButton.dataset.purchaseTitleId);
        if (event.target.closest('[data-close-preview]') || event.target.matches('[data-preview-backdrop]')) {
            closePackPreview();
            return;
        }
        if (state.packReveal?.previewId) return;
        const revealButton = event.target.closest('[data-reveal-card]');
        if (revealButton) {
            const revealId = revealButton.dataset.revealCard;
            if (state.packReveal?.dissolvedRemnants?.has(revealId)) return;
            const alreadyRevealed = Boolean(state.packReveal?.revealed?.has?.(revealId));
            if (alreadyRevealed) {
                const latest = state.progression?.packHistory?.[0];
                const card = latest ? packRevealCards(latest).find(item => item.revealId === revealId) : null;
                if (card?.duplicateAtCap && card?.remnantsAwarded > 0) return;
                openPackPreview(revealId);
            } else {
                revealPackCard(revealId, { openPreview: false });
            }
        }
        if (event.target.closest('[data-reveal-all-pack]')) revealAllPackCards();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.shopCardPreviewOpen) {
            closeShopCardPreview();
        }
    });
})();
