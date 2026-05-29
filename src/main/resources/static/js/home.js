(function () {
    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    const PROFILE_PREFS_CACHE_KEY = 'sieglingsProfilePrefsCache';
    const PENDING_LOADOUT_KEY = 'sieglingsPendingLoadout';
    const HUB_CACHE_PREFIX = 'sieglingsHomeCache:';
    const STATIC_CACHE_TTL_MS = 10 * 60 * 1000;
    const ROOM_CACHE_TTL_MS = 20 * 1000;
    const HOST_LOBBY_KEY = 'sieglingsHostLobby';
    const LOBBY_SESSION_KEY = 'sieglingsLobbySession';
    const MULTIPLAYER_SESSION_KEY = 'sieglingsMultiplayerSession';
    const LOBBY_POLL_MS = 2000;
    const PLAYER_NAME_KEY = 'sieglingsPlayerName';
    const SOCIAL_POLL_MS = 6 * 1000;
    const PRESENCE_HEARTBEAT_MS = 45 * 1000;
    const COIN_ICON_PATH = '/img/ui/home-stats/siegecoin.png';
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
    const elementThemes = {
        Fire: {
            accent: '#ff6a2a',
            glow: 'rgba(255, 106, 42, 0.34)',
            gradient: 'linear-gradient(135deg, rgba(74, 10, 20, 0.98), rgba(157, 41, 17, 0.82) 52%, rgba(255, 128, 30, 0.34))',
            border: 'rgba(255, 126, 56, 0.55)',
            badge: 'linear-gradient(135deg, #ff8a2a, #f43f1c)',
            mood: 'Blazing Core Duelist',
            motif: 'Ember Covenant'
        },
        Ice: {
            accent: '#7ad9e7',
            glow: 'rgba(122, 217, 231, 0.32)',
            gradient: 'linear-gradient(135deg, rgba(10, 24, 54, 0.98), rgba(23, 78, 129, 0.82) 54%, rgba(155, 231, 255, 0.28))',
            border: 'rgba(146, 232, 255, 0.55)',
            badge: 'linear-gradient(135deg, #b8f3ff, #3c8ed8)',
            mood: 'Frostglass Tactician',
            motif: 'Crystal Wake'
        },
        Wind: {
            accent: '#64c987',
            glow: 'rgba(100, 201, 135, 0.31)',
            gradient: 'linear-gradient(135deg, rgba(6, 45, 45, 0.98), rgba(17, 120, 92, 0.78) 55%, rgba(150, 255, 180, 0.24))',
            border: 'rgba(132, 236, 170, 0.52)',
            badge: 'linear-gradient(135deg, #96ffb4, #19a974)',
            mood: 'Gale-Thread Strategist',
            motif: 'Spiral Canopy'
        },
        Earth: {
            accent: '#d0a65f',
            glow: 'rgba(208, 166, 95, 0.29)',
            gradient: 'linear-gradient(135deg, rgba(22, 41, 25, 0.98), rgba(82, 67, 35, 0.82) 55%, rgba(199, 160, 89, 0.28))',
            border: 'rgba(208, 166, 95, 0.55)',
            badge: 'linear-gradient(135deg, #d0a65f, #537a3a)',
            mood: 'Mossgold Sentinel',
            motif: 'Rootbound Reliquary'
        },
        Neutral: {
            accent: '#b8c0cc',
            glow: 'rgba(184, 192, 204, 0.25)',
            gradient: 'linear-gradient(135deg, rgba(12, 17, 28, 0.98), rgba(48, 56, 72, 0.84) 55%, rgba(218, 226, 238, 0.2))',
            border: 'rgba(210, 218, 230, 0.45)',
            badge: 'linear-gradient(135deg, #d8dee8, #5f6b7a)',
            mood: 'Astral Core Adept',
            motif: 'Silver Nexus'
        }
    };

    const state = {
        route: 'home',
        token: localStorage.getItem(AUTH_TOKEN_KEY) || '',
        profile: null,
        progression: null,
        options: null,
        packs: [],
        dailyOffers: [],
        creatureDescriptions: {},
        rooms: [],
        selectedCardId: null,
        search: '',
        elementFilter: 'ALL',
        typeFilter: 'ALL',
        rarityFilter: 'ALL',
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
        builderSort: 'owned-desc',
        friendMessage: '',
        friendMessageType: '',
        selectedDeckId: '',
        filterTrayOpen: false,
        cardTrayOpen: false,
        authOpen: false,
        authRegisterStep: 'credentials',
        registerDraft: { email: '', password: '' },
        profileEditOpen: false,
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
        packOpeningDismissedKey: '',
        shopView: 'browse',
        catalogVersion: 0,
        catalogSyncBound: false,
        profileUserId: '',
        leaderboardTab: 'wins',
        leaderboardPeriod: 'daily'
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
        hydrateRoomInviteFromUrl();
        applyRouteFromLocation();
        setActiveRoute();
        renderSections();
        renderHudTools();
        renderGold();
        renderHomeDashboard();
        bindCatalogSync();
        try {
            await loadAll();
            await syncCatalogIfVersionChanged();
            render();
            focusRouteTarget(routeFocusFromHash());
            syncAuthRouteIntent();
            ensureHostLobbyPolling();
        } catch (err) {
            console.error('Init load failed', err);
        } finally {
            openSharedProfileFromUrl();
        }
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
        document.getElementById('playNowBtn')?.addEventListener('click', () => goPlay({ mode: 'solo' }));
        document.getElementById('startPveBtn')?.addEventListener('click', () => goPlay({ mode: 'solo' }));
        document.getElementById('createLobbyBtn')?.addEventListener('click', createLobbyFromHome);
        document.getElementById('shopShortcutBtn')?.addEventListener('click', () => navigateHub('shop'));
        document.getElementById('joinByCodeBtn')?.addEventListener('click', () => navigateHub('social'));
        document.getElementById('joinRoomBtn')?.addEventListener('click', joinRoomFromHome);
        document.getElementById('refreshRoomsBtn')?.addEventListener('click', () => refreshRooms(true));
        document.getElementById('socialCreateLobbyBtn')?.addEventListener('click', createLobbyFromHome);
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
        document.getElementById('cardTrayBtn')?.addEventListener('click', () => toggleTray('card'));
        document.getElementById('optionsBtn')?.addEventListener('click', () => openOptions());
        document.getElementById('supportBtn')?.addEventListener('click', () => {
            window.open('https://discord.gg/T4WrHCGJ9b', '_blank', 'noopener,noreferrer');
        });
        document.getElementById('optionsModal')?.addEventListener('click', (event) => {
            if (event.target.id === 'optionsModal') { closeOptions(); return; }
            handleOptionsClick(event);
        });
        document.getElementById('optionsModal')?.addEventListener('submit', handleOptionsSubmit);
        document.getElementById('trayBackdrop')?.addEventListener('click', closeTrays);
        document.getElementById('authHudBtn')?.addEventListener('click', openAuth);
        document.getElementById('closeAuthBtn')?.addEventListener('click', closeAuth);
        document.getElementById('closeDeckPreviewBtn')?.addEventListener('click', closeDeckPreview);
        document.getElementById('deckPreviewModal')?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) closeDeckPreview();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeDeckPreview();
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
            }
        });
    }

    async function loadAll() {
        const [options, packs, descriptions, profile, leaderboards] = await Promise.all([
            fetchCachedJson('gameOptions', '/api/game/options', STATIC_CACHE_TTL_MS),
            fetchCachedJson('shopPacks', '/api/shop/packs', STATIC_CACHE_TTL_MS),
            fetchCachedJson('creatureDescriptions', '/assets/creature-descriptions.json', STATIC_CACHE_TTL_MS),
            syncProfile(),
            fetchCachedJson('leaderboards', '/api/leaderboards', STATIC_CACHE_TTL_MS)
        ]);
        applyGameOptions(options);
        state.packs = packs?.packs || [];
        state.dailyOffers = packs?.dailyOffers || [];
        state.creatureDescriptions = indexCreatureDescriptions(descriptions);
        state.leaderboards = leaderboards || null;
        state.leaderboardsError = leaderboards?.error || '';
        if (!state.selectedCardId) {
            state.selectedCardId = state.options.cardCatalog?.[0]?.id || null;
        }
        await refreshRooms();
    }

    async function syncProfile() {
        if (!state.token) {
            state.profile = null;
            state.progression = null;
            state.profilePrefs = null;
            state.profileEditOpen = false;
            stopPresenceHeartbeat();
            return null;
        }
        const data = await fetchJson('/api/auth/me');
        if (!data?.authenticated) {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            state.token = '';
            state.profile = null;
            state.progression = null;
            state.profilePrefs = null;
            state.profileEditOpen = false;
            stopPresenceHeartbeat();
            return null;
        }
        state.profile = data;
        state.progression = data.progression || null;
        startPresenceHeartbeat();
        const serverPrefs = applyProfileSettingsFromServer(data.profileSettings);
        if (serverPrefs) {
            state.profilePrefs = { ...defaultProfilePrefs(data.user || {}), ...serverPrefs };
            cacheProfilePrefs(state.profilePrefs);
        } else if (!state.profilePrefs) {
            state.profilePrefs = defaultProfilePrefs(data.user || {});
        }
        return data;
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
        } else if (state.route === 'social') {
            renderRooms();
            renderFriends();
            renderFriendRequests();
            renderMessageThreads();
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
            ['profile', 'profileSection'],
            ['shop', 'shopSection']
        ].forEach(([route, sectionId]) => {
            const active = state.route === route || (route === 'social' && state.route === 'lobby');
            document.getElementById(sectionId)?.classList.toggle('hidden', !active);
        });
        if (!isBinderRoute()) {
            state.filterTrayOpen = false;
            state.cardTrayOpen = false;
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
        renderFilter('typeFilters', ['ALL', 'SIEGLING', 'SPELL', 'TRAP'], state.typeFilter, (value) => {
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

    function renderCards() {
        const cards = filteredCards();
        const grids = [
            ['allCardGrid', cards]
        ];
        grids.forEach(([id, list]) => {
            const grid = document.getElementById(id);
            if (!grid) return;
            grid.innerHTML = list.length
                ? list.map(renderCardTile).join('')
                : `<div class="unlock-card binder-empty"><strong>No owned cards match these filters</strong><span>${state.showUnowned ? 'Try another search or filter.' : 'Use Show unowned to browse the full catalog.'}</span></div>`;
            grid.querySelectorAll('[data-card-id]').forEach(tile => tile.addEventListener('click', () => {
                state.selectedCardId = tile.dataset.cardId;
                openCardTray();
                renderCards();
                renderDetail();
            }));
        });
        const allCount = document.getElementById('allCardCount');
        if (allCount) {
            const ownedVisible = cards.filter(card => ownedCount(card.id) > 0).length;
            allCount.textContent = state.showUnowned ? `${cards.length} cards / ${ownedVisible} owned` : `${cards.length} owned cards`;
        }
        renderDetail();
        renderUnlock();
    }

    function filteredCards() {
        const cards = [...(state.options?.cardCatalog || [])].filter(card => {
            if (!state.showUnowned && ownedCount(card.id) <= 0) return false;
            if (state.elementFilter !== 'ALL' && card.element !== state.elementFilter) return false;
            if (state.typeFilter !== 'ALL' && card.type !== state.typeFilter) return false;
            if (state.rarityFilter !== 'ALL' && card.rarity !== state.rarityFilter) return false;
            if (!matchesEnergyCostFilter(card)) return false;
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
        const owned = Number.isFinite(options.ownedOverride) ? options.ownedOverride : ownedCount(card.id);
        const typeLabel = [format(card.type), format(card.element)].filter(Boolean).join(' / ');
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const isSiegling = card.type === 'SIEGLING';
        return `${isSiegling ? renderBinderNotches(card.notches) : ''}
            ${window.SieglingsCardBinderVisual?.renderBinderCardOverlay(card) || ''}
            <div class="binder-card-shell">
                <div class="binder-card-header">
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${escapeHtml(typeLabel)}</span>
                </div>
                <div class="binder-card-art">
                    ${(window.SieglingsCardBinderVisual?.renderBinderCardArt(card)) || renderBinderCardArt(card)}
                </div>
                <div class="binder-card-body shop-card-body">
                    ${renderShopCardStats(card)}
                    <div class="binder-card-meta">${escapeHtml(format(card.rarity))} / ${owned ? `Owned x${owned}` : 'Unowned'}</div>
                    ${renderBinderCardEnergyCost(cost, costElement)}
                    ${renderShopCardAbilityLine(card)}
                    ${renderShopCardDescription(card)}
                </div>
            </div>`;
    }

    function renderCardTile(card) {
        const selected = card.id === state.selectedCardId ? ' selected' : '';
        const modeClass = window.SieglingsCardBinderVisual?.resolveArtModeClass(card) || '';
        return `<button class="card-tile binder-card${selected}${modeClass}" type="button" data-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}">
            ${renderBinderCardShell(card)}
        </button>`;
    }

    function renderDetail() {
        const panel = document.getElementById('detailPanel');
        const card = selectedCard();
        if (!panel) return;
        if (!card) {
            panel.innerHTML = '<div class="unlock-card"><strong>Card details loading</strong><span>Select a card from Cards or Decks to inspect art, abilities, notches, and energy costs.</span></div>';
            return;
        }
        const abilities = card.abilities || (card.ability ? [card.ability] : []);
        const flavorText = creatureDescriptionFor(card);
        const craftCost = remnantCraftCost(card);
        const remnants = remnantBalance();
        const canCraft = state.profile?.authenticated && state.progression?.starterChosen && remnants >= craftCost;
        const craftLabel = state.profile?.authenticated
            ? `Craft for ${craftCost.toLocaleString()} Remnants`
            : 'Sign in to craft';
        panel.innerHTML = `
            <div class="detail-art art" style="--el:${elementColor(card.element)}">${(window.SieglingsCardBinderVisual?.renderBinderCardArt(card)) || renderBinderCardArt(card)}</div>
            <span class="eyebrow">${format(card.type)} / ${format(card.element)}</span>
            <h2>${escapeHtml(card.name)}</h2>
            <div class="chip-wrap">
                <span class="chip">Owned x${ownedCount(card.id)}</span>
                <span class="chip">${format(card.rarity)}</span>
                ${renderActiveNotchChips(card.notches)}
            </div>
            ${flavorText ? `
                <div class="detail-flavor" style="--el:${elementColor(card.element)}">
                    <span>Background</span>
                    <p>${escapeHtml(flavorText)}</p>
                </div>
            ` : ''}
            <div class="detail-grid">
                ${card.type === 'SIEGLING' ? `<div><span>Health</span><strong>${card.health ?? '-'}</strong></div>
                <div><span>Speed</span><strong>${card.speed ?? '-'}</strong></div>
                <div><span>Row</span><strong>${format(card.preferredRow || '-')}</strong></div>
                <div><span>Evolution</span><strong>${escapeHtml(card.evolvesFromName || card.evolvesFromId || 'Base')}</strong></div>` : ''}
                <div><span>Cost</span><strong>${card.costAmount ?? 0} ${format(card.costElement || card.element)}</strong></div>
                <div><span>Reaction</span><strong>${format(card.requiredReaction || 'None')}</strong></div>
            </div>
            <h3>Abilities</h3>
            ${abilities.length ? abilities.map(a => `<p><strong>${escapeHtml(a.name || 'Ability')}</strong><br>${escapeHtml(a.description || '')}</p>`).join('') : '<p>No printed ability.</p>'}
            <div class="craft-card-action">
                <button class="primary-btn" type="button" id="craftSelectedCard"${canCraft || !state.profile?.authenticated ? '' : ' disabled'}>${escapeHtml(craftLabel)}</button>
                <span>${escapeHtml(remnants.toLocaleString())} Remnants available</span>
            </div>
            ${state.route === 'deck-builder' ? '<button class="primary-btn" type="button" id="addSelectedToBuilder">Add to deck</button>' : ''}
        `;
        document.getElementById('craftSelectedCard')?.addEventListener('click', () => craftSelectedCard(card.id));
        document.getElementById('addSelectedToBuilder')?.addEventListener('click', () => {
            if (state.route !== 'deck-builder') {
                openDeckBuilder();
            }
            adjustBuilder(card.id, 1);
        });
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
        const missionLog = homeMissionLog();
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
                        <span class="reset-pill">Resets in 06:45:12</span>
                    </div>
                    <div class="mission-list">
                        ${missions.map(renderMissionRow).join('')}
                    </div>
                    <button class="ghost-btn command-wide-btn" type="button" data-home-action="missions">View All Missions</button>
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
            ['spellsCast', 'Spells'],
            ['trapsSprung', 'Traps'],
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
        const history = state.profile?.matchHistory || [];
        const pvpWins = history.filter(row => String(row.matchType || '').toUpperCase().includes('PVP') && String(row.result || '').toUpperCase().includes('WIN')).length;
        const openedPacks = state.progression?.packHistory?.length || 0;
        const coins = state.progression?.gold || 0;
        return [
            { icon: 'X', title: 'Win 3 PVP Matches', current: Math.min(3, pvpWins), target: 3, reward: 150 },
            { icon: 'P', title: 'Open 2 Packs', current: Math.min(2, openedPacks), target: 2, reward: 100 },
            { icon: coinIconMarkup(), iconMarkup: true, title: 'Earn 300 Siegecoins', current: Math.min(300, coins), target: 300, reward: 150 }
        ];
    }

    function renderMissionRow(mission) {
        const pct = mission.target ? Math.min(100, Math.round((mission.current / mission.target) * 100)) : 0;
        return `<div class="mission-row">
            <span class="mission-icon">${mission.iconMarkup ? mission.icon : escapeHtml(mission.icon)}</span>
            <div class="mission-copy">
                <strong>${escapeHtml(mission.title)}</strong>
                <div class="mission-progress"><span style="width:${pct}%"></span></div>
            </div>
            <span class="mission-count">${escapeHtml(mission.current)} / ${escapeHtml(mission.target)}</span>
            <span class="mission-reward">${renderCoinAmount(mission.reward, '')}</span>
        </div>`;
    }

    function homeMissionLog() {
        const history = state.profile?.matchHistory || [];
        const packHistory = state.progression?.packHistory || [];
        const rows = [];
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
                queuePlayLoadout({ mode: 'solo' });
                if (!directLink) return goPlay({ mode: 'solo' });
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
            if (action === 'missions') return root.querySelector('.daily-missions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    function showDeckPreview({ eyebrow, name, sub, cardCounts }) {
        const modal = document.getElementById('deckPreviewModal');
        const grid = document.getElementById('deckPreviewGrid');
        if (!modal || !grid) return;
        const titleEl = document.getElementById('deckPreviewTitle');
        const eyebrowEl = document.getElementById('deckPreviewEyebrow');
        const subEl = document.getElementById('deckPreviewSub');
        if (eyebrowEl) eyebrowEl.textContent = eyebrow || 'Deck';
        if (titleEl) titleEl.textContent = name || 'Deck';
        if (subEl) subEl.textContent = sub || '';
        const tiles = (cardCounts || []).map(entry => {
            const card = findCard(entry.id);
            if (!card) return '';
            const count = Number(entry.count) || 1;
            return renderCardTile(card).replace(
                '<div class="binder-card-shell">',
                `${count > 1 ? `<span class="deck-preview-count">x${count}</span>` : ''}<div class="binder-card-shell">`
            );
        }).filter(Boolean).join('');
        grid.innerHTML = tiles || '<div class="unlock-card"><strong>No cards to preview</strong><span>This deck has no resolvable cards in the current catalog.</span></div>';
        grid.querySelectorAll('[data-card-id]').forEach(tile => tile.addEventListener('click', () => {
            state.selectedCardId = tile.dataset.cardId;
            closeDeckPreview();
            openCardTray();
            renderDetail();
        }));
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
                    <span>${catalogCards.length} cards</span>
                </div>
                <div class="builder-catalog-tools">
                    <input class="search-input" id="builderSearchInput" type="search" value="${escapeAttr(state.builderSearch)}" placeholder="Search binder cards...">
                    <select class="search-input" id="builderElementSelect">
                        ${['ALL', ...elementFilterValues().filter(value => value !== 'ALL')].map(value => `<option value="${escapeAttr(value)}"${value === state.builderElementFilter ? ' selected' : ''}>${value === 'ALL' ? 'All elements' : format(value)}</option>`).join('')}
                    </select>
                    <select class="search-input" id="builderTypeSelect">
                        ${['ALL', 'SIEGLING', 'SPELL', 'TRAP'].map(value => `<option value="${escapeAttr(value)}"${value === state.builderTypeFilter ? ' selected' : ''}>${value === 'ALL' ? 'All types' : format(value)}</option>`).join('')}
                    </select>
                    <select class="search-input" id="builderSortSelect">
                        <option value="owned-desc"${state.builderSort === 'owned-desc' ? ' selected' : ''}>Owned first</option>
                        <option value="name-asc"${state.builderSort === 'name-asc' ? ' selected' : ''}>Name</option>
                        <option value="cost-asc"${state.builderSort === 'cost-asc' ? ' selected' : ''}>Cost low</option>
                        <option value="rarity-desc"${state.builderSort === 'rarity-desc' ? ' selected' : ''}>Rarity high</option>
                    </select>
                </div>
                <div class="deck-builder-binder-list">
                    ${catalogCards.length ? catalogCards.map(renderBuilderBinderRow).join('') : '<div class="unlock-card builder-empty">No owned cards match these filters.</div>'}
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
                    <div>
                        <span class="eyebrow">Current Deck</span>
                        <p>${total < 30 ? `${30 - total} more cards needed` : 'Ready to save or play'}</p>
                    </div>
                </div>
                <div class="builder-form-grid deck-builder-deck-form">
                    <label><span>Deck name</span><input class="search-input" id="builderDeckName" maxlength="40" value="${escapeAttr(builderDeckName())}" placeholder="Custom Binder Deck"></label>
                    <label><span>SiegeKnight</span><select class="search-input" id="builderTrainerSelect">${builderTrainerOptions(trainerId)}</select></label>
                </div>
                <div class="builder-actions-row">
                    <button class="ghost-btn" type="button" id="playCustomBtn"${total < 30 ? ' disabled' : ''}>Play Custom</button>
                    <button class="ghost-btn" type="button" id="clearBuilderBtn"${total ? '' : ' disabled'}>Clear</button>
                </div>
                <div class="deck-builder-deck-list">${renderBuilderDeckListRows()}</div>
            </aside>
        </div>`;
        bindDeckBuilderPageEvents(page);
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
                            <strong>${escapeHtml(card.name)}</strong>
                            <span>${escapeHtml(format(card.type))} / ${escapeHtml(format(card.element))}</span>
                            <small>${card.evolvesFromId ? `Evolves from ${escapeHtml(card.evolvesFromName || findCard(card.evolvesFromId)?.name || 'base')}` : 'Base form'}</small>
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
        return `<div class="deck-builder-preview-card" style="--el:${elementColor(card.element)}">
            <div class="detail-art art">${renderBinderCardArt(card)}</div>
            <span class="eyebrow">${format(card.type)} / ${format(card.element)}</span>
            <h3>${escapeHtml(card.name)}</h3>
            <div class="chip-wrap">
                <span class="chip">Owned x${ownedCount(card.id)}</span>
                <span class="chip">In deck x${inDeck}</span>
                <span class="chip">${format(card.rarity)}</span>
            </div>
            ${flavorText ? `<p class="deck-builder-preview-flavor">${escapeHtml(flavorText)}</p>` : ''}
            <div class="detail-grid">
                ${card.type === 'SIEGLING' ? `<div><span>Health</span><strong>${card.health ?? '-'}</strong></div>
                <div><span>Speed</span><strong>${card.speed ?? '-'}</strong></div>
                <div><span>Evolution</span><strong>${escapeHtml(card.evolvesFromName || card.evolvesFromId || 'Base')}</strong></div>` : ''}
                <div><span>Cost</span><strong>${card.costAmount ?? 0} ${format(card.costElement || card.element)}</strong></div>
            </div>
            ${abilities.length ? `<div class="deck-builder-preview-abilities">${abilities.map(a => `<p><strong>${escapeHtml(a.name || 'Ability')}</strong><br>${escapeHtml(a.description || '')}</p>`).join('')}</div>` : ''}
            <div class="builder-stepper deck-builder-preview-actions">
                <button class="ghost-btn" type="button" data-remove-card="${escapeAttr(card.id)}"${inDeck <= 0 ? ' disabled' : ''}>-</button>
                <strong>${inDeck} / ${maxCopies}</strong>
                <button class="primary-btn" type="button" data-add-builder-card="${escapeAttr(card.id)}"${canAdd ? '' : ' disabled'}>Add to deck</button>
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
                <div>
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${escapeHtml(format(card.type))} / ${escapeHtml(format(card.element))} / Owned x${owned}</span>
                    <small>${escapeHtml(format(card.rarity))}${card.evolvesFromId ? ` / Evolves from ${escapeHtml(card.evolvesFromName || findCard(card.evolvesFromId)?.name || 'base')}` : ''}</small>
                </div>
                <span class="deck-builder-binder-count">x${count}</span>
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
                    <div><strong>${escapeHtml(card?.name || cardId)}</strong><span>${count} / ${maxCopies} copies</span></div>
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
        root.querySelector('#builderSearchInput')?.addEventListener('input', (event) => {
            state.builderSearch = event.target.value.trim().toLowerCase();
            renderDeckBuilderPage();
        });
        root.querySelector('#builderElementSelect')?.addEventListener('change', (event) => {
            state.builderElementFilter = event.target.value;
            renderDeckBuilderPage();
        });
        root.querySelector('#builderTypeSelect')?.addEventListener('change', (event) => {
            state.builderTypeFilter = event.target.value;
            renderDeckBuilderPage();
        });
        root.querySelector('#builderSortSelect')?.addEventListener('change', (event) => {
            state.builderSort = event.target.value;
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

    function isTrainerOwned(trainerId) {
        const trainer = (state.options?.trainers || []).find(item => item.id === trainerId);
        return !!trainer && trainer.owned !== false;
    }

    function firstOwnedTrainerId() {
        const owned = (state.options?.trainers || []).find(trainer => trainer.owned !== false);
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
            const owned = trainer.owned !== false;
            const level = Math.max(1, Number(trainer.level) || 1);
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

    function renderShop() {
        const grid = document.getElementById('shopPackGrid');
        if (!grid) return;
        const starterMode = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
        const starterPacks = state.packs.filter(pack => pack.starterEligible);
        const packs = starterMode ? starterPacks : state.packs;
        const dailyOffers = starterMode ? [] : state.dailyOffers;
        grid.innerHTML = `
            ${dailyOffers.length ? `<div class="shop-row-head"><div><span class="eyebrow">Daily Rotation</span><h2>Five cards today</h2></div><span>Refreshes daily</span></div><div class="daily-offer-grid">${dailyOffers.map(renderDailyOfferTile).join('')}</div>` : ''}
            <div class="shop-row-head"><div><span class="eyebrow">${starterMode ? 'Starter Pack' : 'Packs'}</span><h2>${starterMode ? 'Choose your first pack' : 'Elemental and type pulls'}</h2></div></div>
            ${packs.length ? packs.map(renderPackTile).join('') : '<div class="unlock-card"><strong>No packs available</strong><span>Pack groups will appear here once the catalog loads.</span></div>'}
        `;
        document.getElementById('shopGoldLabel').innerHTML = renderCoinAmount(state.progression?.gold || 0);
    }

    function renderDailyOfferTile(offer) {
        const catalogCard = findCard(offer.cardId) || {};
        const card = {
            ...catalogCard,
            id: offer.cardId,
            name: offer.cardName || catalogCard.name,
            type: offer.type || catalogCard.type,
            element: offer.element || catalogCard.element || 'FIRE',
            rarity: offer.rarity || catalogCard.rarity || 'COMMON',
            notches: catalogCard.notches || [],
            abilities: catalogCard.abilities || (catalogCard.ability ? [catalogCard.ability] : [])
        };
        const purchased = state.progression?.purchasedDailyOfferIds?.includes(offer.id);
        const owned = ownedCount(card.id);
        const typeLabel = [format(card.type), format(card.element)].filter(Boolean).join(' / ');
        const isSiegling = card.type === 'SIEGLING';
        return `<article class="daily-offer-tile" style="--el:${elementColor(card.element)};--rarity:${rarityColor(card.rarity)}">
            <div class="daily-card-front binder-card daily-card-compact">
                ${isSiegling ? renderBinderNotches(card.notches) : ''}
                <div class="binder-card-shell">
                    <div class="binder-card-header">
                        <strong>${escapeHtml(card.name || 'Daily Card')}</strong>
                        <span>${escapeHtml(typeLabel)}</span>
                    </div>
                    <div class="binder-card-art">${renderBinderCardArt(card)}</div>
                    <div class="binder-card-body shop-card-body">
                        ${renderShopCardStats(card)}
                        <div class="binder-card-meta">${escapeHtml(format(card.rarity))} / Owned x${owned}</div>
                        ${renderBinderCardEnergyCost(cardEnergyCost(card), card.costElement || card.trapBucketElement || card.element)}
                        ${renderShopCardAbilityLine(card)}
                        ${renderShopCardDescription(card)}
                    </div>
                </div>
            </div>
            <button class="primary-btn" type="button" data-daily-offer-id="${escapeAttr(offer.id)}" ${purchased ? 'disabled' : ''}>${purchased ? 'Purchased' : renderCoinAmount(offer.price, '')}</button>
        </article>`;
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
                : 'Trap set';
            return `<div class="binder-card-stats shop-card-stats-alt"><span>${escapeHtml(reaction)}</span><span>${escapeHtml(bucket)}</span></div>`;
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
        const abilities = card?.abilities || (card?.ability ? [card.ability] : []);
        const primary = abilities[0];
        if (!primary?.name) return '';
        return `<div class="shop-card-ability">${escapeHtml(primary.name)}</div>`;
    }

    function renderPackTile(pack) {
        const starterMode = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
        const label = starterMode && pack.starterEligible ? 'Choose Starter' : renderCoinAmount(pack.price, '');
        const primaryElement = pack.elements?.[0] || 'FIRE';
        const image = packImageFor(pack);
        const imageStyle = image ? `background-image: url('${image}');` : '';
        const kicker = pack.starterEligible ? (starterMode ? 'Starter Pack' : 'Element Pack') : 'Pack Group';
        const displayName = pack.starterEligible && !starterMode
            ? `${format(primaryElement)} Element Pack`
            : pack.name;
        return `<article class="pack-tile ${image ? 'pack-tile-art' : ''}" style="--el:${elementColor(primaryElement)}">
            <div class="pack-art" style="${imageStyle}"></div>
            <div class="pack-info">
                <span class="pack-kicker">${kicker}</span>
                <strong>${escapeHtml(displayName)}</strong>
                <span>${pack.elements.map(format).join(' / ')}</span>
                <span>${escapeHtml(formatGameText(pack.description || ''))}</span>
                <button class="primary-btn" type="button" data-pack-id="${escapeAttr(pack.id)}">${label}</button>
            </div>
        </article>`;
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
            pack_trap_random: '/img/packs/trap-card-back.png'
        };
        if (images[pack.id]) return images[pack.id];
        return pack.starterEligible ? images[element] : '';
    }

    function packBackForElement(element, packId = '') {
        const special = {
            pack_siegeling_random: "url('/img/packs/siegeling-back.png')",
            pack_spell_random: "url('/img/packs/spell-card-back.png')",
            pack_trap_random: "url('/img/packs/trap-card-back.png')"
        };
        if (special[packId]) return special[packId];
        const images = {
            FIRE: "url('/img/packs/starter-fire.jpg')",
            EARTH: "url('/img/packs/starter-earth.jpg')",
            WIND: "url('/img/packs/starter-wind.jpg')",
            ICE: "url('/img/packs/starter-ice.jpg')"
        };
        return images[String(element || '').toUpperCase()] || "linear-gradient(145deg, #1b2238, #070a12)";
    }

    function renderRooms() {
        const list = document.getElementById('roomList');
        if (!list) return;
        const rooms = filteredRooms();
        const totalOpen = state.rooms.filter(room => !isRoomFull(room)).length;
        const roomCount = document.getElementById('roomCountLabel');
        const shownCount = document.getElementById('roomShownLabel');
        const quickJoinBtn = document.getElementById('quickJoinBtn');
        if (roomCount) roomCount.textContent = `${totalOpen} open`;
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
                const statusLabel = online ? status.replace('_', ' ') : 'Offline';
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
                    <button class="ghost-btn compact-btn" type="button" data-view-profile="${escapeAttr(friend.email)}">Profile</button>
                    <button class="ghost-btn compact-btn" type="button" data-message-friend="${escapeAttr(friend.email)}">Message</button>
                    <button class="ghost-btn compact-btn" type="button" data-remove-friend="${escapeAttr(friend.email)}">Remove</button>
                </div>
            </article>`;
            }).join('')
            : '<div class="social-empty-state"><strong>No friends found</strong><span>Add a registered player by email to start your list.</span></div>';

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
        if (panel) panel.classList.toggle('hidden', !state.profile?.authenticated);

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
        const theme = elementThemes[favoriteElement] || elementThemes.Neutral;
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
        return {
            displayName,
            avatarMode: 'INITIAL',
            avatar: initials(displayName),
            avatarUrl: '',
            favoriteElement: 'Fire',
            playerTitle: elementThemes.Fire.mood,
            bio: 'Ready to tune a deck, open a pack, and make the next match count.',
            preferredCardBack: 'Molten Sigil',
            favoriteSiegling: 'Sundile'
        };
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
        return `<section class="profile-hero">
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
                    <p class="profile-title">${escapeHtml(prefs.playerTitle || theme.mood)}</p>
                    <p class="profile-bio">${escapeHtml(prefs.bio)}</p>
                </div>
            </div>
            <div class="profile-hero-side">
                <span class="profile-motif">${escapeHtml(theme.motif)}</span>
                <span>${escapeHtml(prefs.preferredCardBack)} card back</span>
                <span>Favorite Siegeling: ${escapeHtml(prefs.favoriteSiegling)}</span>
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

    function renderBattleHistoryList(view) {
        return `<section class="profile-panel battle-history-panel">
            <div class="profile-panel-head">
                <div><span class="eyebrow">Recent Battles</span><h3>Last Match Scroll</h3></div>
                <span class="profile-soft-pill">${view.battles.length} entries</span>
            </div>
            <div class="battle-list">
                ${view.battles.length
                    ? view.battles.map(battle => `<article class="battle-row ${battle.result === 'WIN' ? 'is-win' : 'is-loss'}">
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
                    return `<div><a class="profile-friend-link" href="${escapeAttr(playerProfilePath(playerId))}" data-player-profile="${escapeAttr(playerId)}"><strong>${escapeHtml(label)}</strong></a><span>${escapeHtml(friend.email)}</span></div>`;
                }).join('') : '<div><strong>No friends yet</strong><span>Add friends from the Social page using their email.</span></div>'}
                <div><strong>Open lobbies</strong><span>Use Social to join rooms or invite friends once room invites are connected.</span></div>
            </div>
        </section>`;
    }

    function renderAchievementBadges(view) {
        const achievements = [
            ['First Win', view.record.wins > 0],
            ['Element Specialist', true],
            ['Collector', view.collection.uniqueOwned >= 10],
            ['Deck Builder', view.savedDecks.length > 0],
            ['Win Streak', view.record.bestStreak >= 3]
        ];
        return `<section class="profile-panel achievement-panel">
            <div class="profile-panel-head"><div><span class="eyebrow">Achievements</span><h3>Badge Case</h3></div></div>
            <div class="achievement-row">
                ${achievements.map(([label, unlocked]) => `<div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}">
                    <span>${unlocked ? '*' : '-'}</span>
                    <strong>${escapeHtml(label)}</strong>
                    <small>${unlocked ? 'Unlocked' : 'Locked'}</small>
                </div>`).join('')}
            </div>
        </section>`;
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
                    ${profileInput('Player title', 'playerTitle', prefs.playerTitle)}
                    ${profileInput('Bio/status message', 'bio', prefs.bio)}
                    ${profileInput('Preferred card back', 'preferredCardBack', prefs.preferredCardBack)}
                    ${profileInput('Favorite Siegeling', 'favoriteSiegling', prefs.favoriteSiegling)}
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
        if (!next.playerTitle) next.playerTitle = elementThemes[next.favoriteElement].mood;
        const data = await fetchJson('/api/profile/settings', { method: 'POST', body: JSON.stringify(next) });
        if (!data) return alert('Could not save profile. Is the server running the latest code with /api/profile/settings?');
        if (data.error) return alert(data.error);
        state.profilePrefs = applyProfileSettingsFromServer(data.profileSettings)
            ? { ...defaultProfilePrefs(state.profile?.user || {}), ...applyProfileSettingsFromServer(data.profileSettings) }
            : next;
        cacheProfilePrefs(state.profilePrefs);
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
            opponentName: row.opponentName || 'Opponent',
            opponentType: matchType.includes('PVP') || matchType.includes('PLAYER') ? 'Player' : 'AI',
            deckUsed: row.loadoutLabel || row.trainerName || 'Battle Loadout',
            element: inferElementFromText(row.loadoutLabel || row.trainerName || '', fallbackElement),
            date: formatProfileDate(row.finishedAt) || '',
            duration: row.turnNumber ? `${row.turnNumber} turns` : '',
            reward: result === 'WIN' ? '+25' : '+5'
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
        document.getElementById('goldPill').innerHTML = renderCoinAmount(state.profile?.authenticated ? (state.progression?.gold || 0) : 100);
        document.getElementById('ownedCountLabel').textContent = `${state.progression?.ownedTotal || 0} owned`;
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

    async function choosePack(packId) {
        if (!state.profile?.authenticated) {
            openAuth();
            return;
        }
        const starterMode = state.progression && !state.progression.starterChosen;
        const endpoint = starterMode ? '/api/player/starter-pack' : '/api/shop/open-pack';
        const data = await fetchJson(endpoint, { method: 'POST', body: JSON.stringify({ packId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        state.packs = data.packs || state.packs;
        state.dailyOffers = data.dailyOffers || state.dailyOffers;
        const latest = state.progression?.packHistory?.[0];
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
        renderPackResult();
        navigateHub('shop', { shopView: 'cardpack' });
        render();
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
        render();
    }

    function packSessionKey(latest) {
        return `${latest.packId || 'pack'}:${latest.openedAt || ''}`;
    }

    function renderPackResult(options = {}) {
        const result = document.getElementById('packResult');
        const latest = state.progression?.packHistory?.[0];
        if (!result || !latest) return;
        const reveal = ensurePackReveal(latest);
        const cards = latest.cards.map((card, index) => enrichPackCard(card, index));
        const sessionKey = packSessionKey(latest);
        const opening = result.querySelector('.pack-opening');
        const sameSession = opening?.dataset.packKey === sessionKey;
        document.body.classList.add('gacha-active');
        result.classList.remove('hidden');

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
            return;
        }

        patchPackOpening({ result, latest, cards, reveal });
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
            ${buildPackTrainerBanner(latest.trainer)}
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
        return `<button class="reveal-card${revealed ? ' is-revealed' : ''}${remnantPull ? ' is-remnant-pull' : ''} rarity-${String(rarity).toLowerCase()}" type="button" data-reveal-card="${escapeAttr(card.revealId)}" data-remnants="${Number(card.remnantsAwarded) || 0}" data-duplicate-at-cap="${remnantPull ? 'true' : 'false'}" style="--el:${elementColor(element)};--rarity:${rarityColor(rarity)};--pack-back:${packBackForElement(element, packId)};--slot:${index}">
            <span class="rarity-burst" aria-hidden="true"></span>
            <span class="reveal-dust-burst" aria-hidden="true"></span>
            <span class="reveal-face reveal-back">
                <strong>Tap to reveal</strong>
                <small>${remnantPull ? 'May become Remnants' : `${escapeHtml(format(rarity))} pulse`}</small>
            </span>
            <span class="reveal-face reveal-front">
                <div class="card-tile binder-card gacha-card-front" style="--el:${elementColor(element)}">
                    ${renderBinderCardShell(card, { ownedOverride: ownedPreview })}
                </div>
            </span>
        </button>`;
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
        const index = latest.cards.findIndex((card, cardIndex) => `${card.id || 'card'}-${cardIndex}` === revealId);
        const card = index >= 0 ? enrichPackCard(latest.cards[index], index) : null;
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
        const cards = latest.cards.map((card, index) => enrichPackCard(card, index));
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
        const pulses = words[count] || `${count}`;
        return {
            eyebrow: 'Gacha reveal',
            title: entry.title,
            sub: `${pulses.charAt(0).toUpperCase() + pulses.slice(1)} ancient pulses resonate within — tap each to reveal its fate. ${entry.sub}`
        };
    }

    function renderRevealPreview(card) {
        const element = card.element || 'FIRE';
        const rarity = card.rarity || 'COMMON';
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
        const cards = latest.cards.map((card, index) => enrichPackCard(card, index));
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
        state.progression = data.progression;
        renderCards();
        renderHomeDashboard();
        renderGold();
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
        localStorage.setItem(PENDING_LOADOUT_KEY, JSON.stringify({
            createdAt: Date.now(),
            deckId: payload.deckId || selectedDeckId(),
            trainerId: payload.trainerId || state.options?.defaultTrainerId || state.options?.trainers?.[0]?.id,
            mode: payload.mode || 'solo',
            onlineRoomMode: payload.onlineRoomMode || 'join',
            roomId: payload.roomId || '',
            battleLaunch: Boolean(payload.battleLaunch),
            customDeckCards: payload.customDeckCards || null,
            loadoutLabel: payload.loadoutLabel || ''
        }));
    }

    function goPlay(payload) {
        queuePlayLoadout(payload);
        window.location.href = '/play';
    }

    function navigateHub(route, options = {}) {
        const hash = options.focus === 'lobby' ? '#socialActiveLobby' : '';
        const nextShopView = route === 'shop' ? (options.shopView || state.shopView || 'browse') : 'browse';
        const nextPath = `${hubPath(route, nextShopView)}${hash}`;
        const samePlace = route === state.route
            && (route !== 'shop' || nextShopView === state.shopView)
            && (route !== 'profile' || !state.profileUserId);

        state.route = route;
        state.shopView = nextShopView;
        if (route === 'profile') {
            state.profileUserId = '';
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

    function toggleTray(type) {
        if (!isBinderRoute()) return;
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
        const optionsBtn = document.getElementById('optionsBtn');
        optionsBtn?.classList.toggle('hidden', state.route !== 'home');
        const filterBtn = document.getElementById('filterTrayBtn');
        const cardBtn = document.getElementById('cardTrayBtn');
        const filterTray = document.getElementById('filterTray');
        const cardTray = document.getElementById('detailPanel');
        const backdrop = document.getElementById('trayBackdrop');
        filterBtn?.classList.toggle('hidden', !binder);
        cardBtn?.classList.toggle('hidden', !binder);
        filterBtn?.classList.toggle('active', binder && state.filterTrayOpen);
        cardBtn?.classList.toggle('active', binder && state.cardTrayOpen);
        filterTray?.classList.toggle('is-closed', !binder || !state.filterTrayOpen);
        cardTray?.classList.toggle('is-closed', !binder || !state.cardTrayOpen);
        filterTray?.setAttribute('aria-hidden', String(!binder || !state.filterTrayOpen));
        cardTray?.setAttribute('aria-hidden', String(!binder || !state.cardTrayOpen));
        backdrop?.classList.toggle('hidden', !binder || (!state.filterTrayOpen && !state.cardTrayOpen));
    }

    async function fetchJson(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (state.token) headers.Authorization = `Bearer ${state.token}`;
        try {
            const resp = await fetch(path, { ...options, headers });
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
            return { error: 'Network error. Check your connection and try again.' };
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
            const storage = browserSessionStorage();
            if (storage) storage.setItem(HUB_CACHE_PREFIX + cacheKey, JSON.stringify(entry));
        } catch (error) {
            // Session cache is an optimization only.
        }
    }

    function readCacheEntry(cacheKey) {
        const storage = browserSessionStorage();
        const raw = storage?.getItem(HUB_CACHE_PREFIX + cacheKey);
        return raw ? JSON.parse(raw) : memoryCache[cacheKey];
    }

    function browserSessionStorage() {
        try {
            return window.sessionStorage || null;
        } catch (error) {
            return null;
        }
    }

    function authMarkup() {
        if (state.authRegisterStep === 'display-name') {
            return `<div class="auth-card">
                <strong>Choose your display name</strong>
                <span>Confirm how other duelists will see you (${escapeHtml(state.registerDraft.email || '')}).</span>
                <input class="search-input" id="authName" maxlength="20" placeholder="Display name" autofocus>
                <button class="primary-btn" id="confirmRegisterBtn" type="button">Confirm</button>
                <button class="ghost-btn" id="backRegisterBtn" type="button">Back</button>
            </div>`;
        }
        return `<div class="auth-card">
            <strong>Sign in to save progression</strong>
            <span>Starter packs, Siegecoins, Remnants, owned cards, and custom decks require an account. New players start with ${renderCoinAmount(100)}.</span>
            <input class="search-input" id="authEmail" type="email" placeholder="Email">
            <input class="search-input" id="authPassword" type="password" placeholder="Password">
            <button class="primary-btn" id="loginBtn" type="button">Log In</button>
            <button class="ghost-btn" id="registerBtn" type="button">Register</button>
        </div>`;
    }

    function openAuth() {
        if (state.profile?.authenticated) return logout();
        state.authOpen = true;
        renderAuthModal();
    }

    function closeAuth() {
        state.authOpen = false;
        state.authRegisterStep = 'credentials';
        state.registerDraft = { email: '', password: '' };
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
        document.querySelectorAll('#loginBtn').forEach(btn => btn.addEventListener('click', () => submitAuth('login')));
        document.querySelectorAll('#registerBtn').forEach(btn => btn.addEventListener('click', () => beginRegisterDisplayName()));
        document.querySelectorAll('#confirmRegisterBtn').forEach(btn => btn.addEventListener('click', () => submitAuth('register')));
        document.querySelectorAll('#backRegisterBtn').forEach(btn => btn.addEventListener('click', () => {
            state.authRegisterStep = 'credentials';
            renderAuthModal();
        }));
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
        const onRegisterNameStep = mode === 'register' && state.authRegisterStep === 'display-name';
        const email = onRegisterNameStep ? state.registerDraft.email : (document.getElementById('authEmail')?.value || '');
        const password = onRegisterNameStep ? state.registerDraft.password : (document.getElementById('authPassword')?.value || '');
        const displayName = mode === 'register' ? (document.getElementById('authName')?.value || '') : '';
        const body = mode === 'register'
            ? { email, password, displayName }
            : { email, password };
        const data = await fetchJson(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
        if (data?.error) return alert(data.error);
        state.token = data.token || '';
        localStorage.setItem(AUTH_TOKEN_KEY, state.token);
        state.profile = data;
        state.progression = data.progression;
        state.profilePrefs = applyProfileSettingsFromServer(data.profileSettings) || defaultProfilePrefs(data.user || {});
        cacheProfilePrefs(state.profilePrefs);
        state.profileEditOpen = false;
        state.authOpen = false;
        startPresenceHeartbeat();
        state.authRegisterStep = 'credentials';
        state.registerDraft = { email: '', password: '' };
        await ensurePacksLoaded();
        render();
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
        state.token = '';
        state.profile = null;
        state.progression = null;
        state.profilePrefs = null;
        state.profileEditOpen = false;
        render();
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
        if (!state.builderPreviewCardId) state.builderPreviewCardId = cardId;
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
    function selectedCard() { return findCard(state.selectedCardId) || state.options?.cardCatalog?.[0]; }
    function findCard(id) { return (state.options?.cardCatalog || []).find(card => card.id === id); }
    function ownedCount(id) { return state.progression?.ownedCards?.[id] || 0; }
    function selectedDeckId() { return state.options?.defaultDeckId || state.options?.decks?.[0]?.id || 'deck_fire_earth'; }
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
        if (head === 'lobbies') return { route: 'social', shopView: 'browse', lobbyRoomId: '', profileUserId: '' };
        if (head === 'social' && segments[1] === 'lobby' && segments[2]) {
            return { route: 'lobby', shopView: 'browse', lobbyRoomId: segments[2].trim().toUpperCase(), profileUserId: '' };
        }
        if (head === 'shop') {
            return { route: 'shop', shopView: segments[1] === 'cardpack' ? 'cardpack' : 'browse', lobbyRoomId: '', profileUserId: '' };
        }
        if (head === 'profile') {
            const profileUserId = segments[1] ? decodeURIComponent(segments[1]).trim().toLowerCase() : '';
            return { route: 'profile', shopView: 'browse', lobbyRoomId: '', profileUserId };
        }
        if (head === 'deck-builder') {
            return { route: 'deck-builder', shopView: 'browse', lobbyRoomId: '', profileUserId: '' };
        }
        if (['cards', 'decks', 'social'].includes(head)) {
            return { route: head, shopView: 'browse', lobbyRoomId: '', profileUserId: '' };
        }
        return { route: 'home', shopView: 'browse', lobbyRoomId: '', profileUserId: '' };
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
        return `/${route}`;
    }

    function applyRouteFromLocation(path = location.pathname) {
        const parsed = parseHubRoute(path);
        state.route = parsed.route;
        state.shopView = parsed.shopView;
        state.lobbyRoomId = parsed.lobbyRoomId || '';
        state.profileUserId = parsed.profileUserId || '';
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
        return normalized
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(/\bSiegling\b/g, 'Siegeling')
            .replace(/\bSieglings\b/g, 'Siegelings');
    }
    function formatGameText(value) {
        return String(value || '')
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
            playerTitle: settings.playerTitle || '',
            bio: settings.bio || '',
            preferredCardBack: settings.preferredCardBack || '',
            favoriteSiegling: settings.favoriteSiegling || ''
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
                playerTitle: prefs.playerTitle,
                bio: prefs.bio,
                preferredCardBack: prefs.preferredCardBack,
                favoriteSiegling: prefs.favoriteSiegling
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
        return {
            deckId: selectedDeckId(),
            trainerId: selectedTrainerId(),
            playerName: socialBattleName(),
            loadoutLabel: ''
        };
    }

    function selectedTrainerId() {
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

    function lobbyPath(roomId) {
        if (!roomId) return '/social';
        return `/social/lobby/${encodeURIComponent(String(roomId).trim().toUpperCase())}`;
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
        const normalized = String(roomId).trim().toUpperCase();
        const hostLobby = readHostLobby();
        if (hostLobby?.roomId && hostLobby.roomId.toUpperCase() === normalized) return true;
        return false;
    }

    function openLobbyWaitingRoom(roomId, options = {}) {
        const normalized = String(roomId || '').trim().toUpperCase();
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
        renderRoute();
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
        const hostLobby = readHostLobby();
        if (hostLobby?.roomId === roomId && hostLobby.playerToken) {
            return { roomId, playerToken: hostLobby.playerToken, role: 'host' };
        }
        const saved = readLobbySession();
        if (saved?.roomId === roomId && saved.playerToken) {
            const status = await fetchMatchStatus(saved);
            if (status && !status.error) {
                return saved;
            }
        }
        if (isOwnLobbyRoomId(roomId)) {
            alert('Reconnect from the device that created this lobby, or create a new table.');
            navigateHub('social', { focus: 'lobby' });
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
            const owned = trainer.owned !== false;
            const level = Math.max(1, Number(trainer.level) || 1);
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
        document.getElementById('lobbyLeaveBtn')?.addEventListener('click', () => leaveLobbyWaitingRoom());
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
                await fetchJson('/api/match/leave', {
                    method: 'POST',
                    headers: {
                        'X-Room-Id': session.roomId,
                        'X-Player-Token': session.playerToken
                    },
                    body: JSON.stringify({ roomId: session.roomId })
                });
            } catch (error) {
                console.warn('Unable to leave lobby', error);
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
        if (!status || status.error) {
            if (status?.error) {
                alert(status.error);
                leaveLobbyWaitingRoom();
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
        if (state.token) headers.Authorization = `Bearer ${state.token}`;
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
            renderMessageThreads();
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
        renderMessageThreads();
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

    function renderMessageThreads() {
        const list = document.getElementById('messageThreadList');
        const count = document.getElementById('messageThreadCount');
        const compose = document.getElementById('messageCompose');
        if (!list) return;
        if (count) count.textContent = `${state.messageThreads.length} thread${state.messageThreads.length === 1 ? '' : 's'}`;
        if (!state.profile?.authenticated) {
            list.innerHTML = '<div class="social-empty-state"><strong>Sign in to message friends</strong></div>';
            compose?.classList.add('hidden');
            return;
        }
        if (!state.messageThreads.length) {
            list.innerHTML = '<div class="social-empty-state"><strong>No messages yet</strong><span>Open a friend profile and tap Message to start chatting.</span></div>';
            return;
        }
        list.innerHTML = state.messageThreads.map(thread => {
            const friend = (state.profile?.friends || []).find(row => row.email === thread.peerId);
            const label = friend?.displayName || thread.peerId;
            return `<button class="message-thread-btn" type="button" data-open-thread="${escapeAttr(thread.peerId)}">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(thread.lastMessage || 'No messages yet')}</span>
            </button>`;
        }).join('');
        list.querySelectorAll('[data-open-thread]').forEach(btn => btn.addEventListener('click', () => openMessageComposer(btn.dataset.openThread)));
        if (state.activeChatPeer) {
            openMessageComposer(state.activeChatPeer, false);
        }
    }

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
        const compose = document.getElementById('messageCompose');
        const title = document.getElementById('messageComposeTitle');
        const log = document.getElementById('messageLog');
        const friend = (state.profile?.friends || []).find(row => row.email === peerId);
        if (title) title.textContent = `Chat with ${friend?.displayName || peerId}`;
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
        renderMessageThreads();
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
        const theme = elementThemes[favoriteElement] || elementThemes.Neutral;
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
                    <p class="profile-title">${escapeHtml(prefs.playerTitle || theme.mood)}</p>
                    <p class="profile-bio">${escapeHtml(prefs.bio || '')}</p>
                    <p class="profile-muted">Favorite Siegeling: ${escapeHtml(prefs.favoriteSiegling || '—')}</p>
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
                ? renderBattleHistoryList(view)
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
            label: 'Spells & Traps',
            title: 'One-shot effects and reactive defense',
            html: `<ul class="guide-list">
                    <li><strong>Spells</strong> are cast from your hand for an immediate effect — damage, buffs, energy swings, or board control. They cost energy from your pool and resolve right away.</li>
                    <li><strong>Traps</strong> are set ahead of time and spring when their condition is met (such as an opponent attacking or playing into them). Set them early, then let your opponent walk into the trigger.</li>
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
                        <span><strong>Guide</strong><small>Arena, app, elements, energy, spells &amp; traps</small></span>
                    </button>
                    <button class="options-menu-item" type="button" data-options-view="share">
                        <span class="options-menu-icon">&#128279;</span>
                        <span><strong>Share Profile</strong><small>Show a QR code so others can view and friend you</small></span>
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

    document.getElementById('closeMessageComposeBtn')?.addEventListener('click', () => {
        state.activeChatPeer = null;
        document.getElementById('messageCompose')?.classList.add('hidden');
        renderMessageThreads();
    });
    document.getElementById('messageSendForm')?.addEventListener('submit', sendChatMessage);

    document.addEventListener('click', (event) => {
        if (event.target.closest('[data-clear-pack-result]')) {
            clearPackResult();
            return;
        }
        const packButton = event.target.closest('[data-pack-id]');
        if (packButton) choosePack(packButton.dataset.packId);
        const dailyOfferButton = event.target.closest('[data-daily-offer-id]');
        if (dailyOfferButton) purchaseDailyOffer(dailyOfferButton.dataset.dailyOfferId);
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
                const index = latest?.cards?.findIndex((card, cardIndex) => `${card.id || 'card'}-${cardIndex}` === revealId) ?? -1;
                const card = index >= 0 ? enrichPackCard(latest.cards[index], index) : null;
                if (card?.duplicateAtCap && card?.remnantsAwarded > 0) return;
                openPackPreview(revealId);
            } else {
                revealPackCard(revealId, { openPreview: false });
            }
        }
        if (event.target.closest('[data-reveal-all-pack]')) revealAllPackCards();
    });
})();
