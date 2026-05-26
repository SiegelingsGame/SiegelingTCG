(function () {
    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    const PROFILE_PREFS_CACHE_KEY = 'sieglingsProfilePrefsCache';
    const PENDING_LOADOUT_KEY = 'sieglingsPendingLoadout';
    const HUB_CACHE_PREFIX = 'sieglingsHomeCache:';
    const STATIC_CACHE_TTL_MS = 10 * 60 * 1000;
    const ROOM_CACHE_TTL_MS = 20 * 1000;
    const HOST_LOBBY_KEY = 'sieglingsHostLobby';
    const SOCIAL_POLL_MS = 12 * 1000;
    const COIN_ICON_PATH = '/img/ui/siegel-coin.png';
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
        sort: 'owned-desc',
        roomSearch: '',
        roomFormatFilter: 'ALL',
        roomElementFilter: 'ALL',
        roomSort: 'newest',
        roomHideFull: false,
        friendSearch: '',
        builderCounts: {},
        friendMessage: '',
        friendMessageType: '',
        filterTrayOpen: false,
        cardTrayOpen: false,
        authOpen: false,
        profileEditOpen: false,
        profilePrefs: null,
        friendPresence: {},
        messageThreads: [],
        activeChatPeer: null,
        viewingProfile: null,
        socialPollTimer: null,
        packReveal: null,
        catalogVersion: 0
    };

    let liveCatalogRefreshPromise = null;

    window.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        hydrateProfilePrefsFromCache();
        state.route = routeFromPath(location.pathname);
        setActiveRoute();
        renderSections();
        renderHudTools();
        renderGold();
        renderHomeDashboard();
        await loadAll();
        if (isBinderRoute()) {
            await refreshLiveCatalog();
        }
        render();
        syncAuthRouteIntent();
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
        document.getElementById('saveCustomDeckBtn')?.addEventListener('click', saveCustomDeck);
        document.getElementById('filterTrayBtn')?.addEventListener('click', () => toggleTray('filter'));
        document.getElementById('cardTrayBtn')?.addEventListener('click', () => toggleTray('card'));
        document.getElementById('trayBackdrop')?.addEventListener('click', closeTrays);
        document.getElementById('authHudBtn')?.addEventListener('click', openAuth);
        document.getElementById('closeAuthBtn')?.addEventListener('click', closeAuth);
        document.querySelectorAll('[data-home-focus]').forEach((btn) => {
            btn.addEventListener('click', () => navigateHub(btn.dataset.homeFocus === 'matches' ? 'social' : btn.dataset.homeFocus === 'builder' ? 'decks' : 'home'));
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
            state.route = routeFromPath(location.pathname);
            setActiveRoute();
            renderSections();
            renderRoute();
            syncAuthRouteIntent();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isBinderRoute()) {
                void refreshLiveCatalog();
            }
        });
    }

    async function loadAll() {
        const [options, packs, descriptions, profile] = await Promise.all([
            fetchCachedJson('gameOptions', '/api/game/options', STATIC_CACHE_TTL_MS),
            fetchCachedJson('shopPacks', '/api/shop/packs', STATIC_CACHE_TTL_MS),
            fetchCachedJson('creatureDescriptions', '/assets/creature-descriptions.json', STATIC_CACHE_TTL_MS),
            syncProfile()
        ]);
        applyGameOptions(options);
        state.packs = packs?.packs || [];
        state.dailyOffers = packs?.dailyOffers || [];
        state.creatureDescriptions = indexCreatureDescriptions(descriptions);
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
            return null;
        }
        state.profile = data;
        state.progression = data.progression || null;
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
        safeRender(renderHomeDashboard);
        safeRender(renderShop);
        safeRender(renderProfile);
        safeRender(renderRooms);
        safeRender(renderFriends);
        safeRender(renderGold);
        safeRender(renderHudTools);
        safeRender(renderAuthModal);
    }

    function renderRoute() {
        if (state.route === 'cards' || state.route === 'decks') {
            void refreshLiveCatalog();
            return;
        }
        if (state.route === 'home') {
            renderHomeDashboard();
        } else if (state.route === 'shop') {
            renderShop();
        } else if (state.route === 'profile') {
            renderProfile();
        } else if (state.route === 'social') {
            renderRooms();
            renderFriends();
            renderMessageThreads();
            startSocialPolling();
        } else {
            stopSocialPolling();
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
        ['home', 'cards', 'decks', 'social', 'profile', 'shop'].forEach((route) => {
            document.getElementById(`${route}Section`)?.classList.toggle('hidden', state.route !== route);
        });
        if (!isBinderRoute()) {
            state.filterTrayOpen = false;
            state.cardTrayOpen = false;
        }
        renderHudTools();
    }

    function renderFilters() {
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
            grid.innerHTML = list.map(renderCardTile).join('');
            grid.querySelectorAll('[data-card-id]').forEach(tile => tile.addEventListener('click', () => {
                state.selectedCardId = tile.dataset.cardId;
                openCardTray();
                renderCards();
                renderDetail();
            }));
        });
        const allCount = document.getElementById('allCardCount');
        if (allCount) allCount.textContent = `${cards.length} cards`;
        renderDetail();
        renderUnlock();
    }

    function filteredCards() {
        const cards = [...(state.options?.cardCatalog || [])].filter(card => {
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

    function renderCardTile(card) {
        const selected = card.id === state.selectedCardId ? ' selected' : '';
        const owned = ownedCount(card.id);
        const typeLabel = [format(card.type), format(card.element)].filter(Boolean).join(' / ');
        const hp = card.health ?? card.hp ?? '-';
        const speed = card.speed ?? card.spd ?? '-';
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const isSiegling = card.type === 'SIEGLING';
        return `<button class="card-tile binder-card${selected}" type="button" data-card-id="${escapeAttr(card.id)}" style="--el:${elementColor(card.element)}">
            ${isSiegling ? renderBinderNotches(card.notches) : ''}
            <div class="binder-card-shell">
                <div class="binder-card-header">
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${escapeHtml(typeLabel)}</span>
                </div>
                <div class="binder-card-art">
                    ${renderElementIcon(card.element)}
                </div>
                <div class="binder-card-body">
                    ${isSiegling ? `<div class="binder-card-stats"><span>HP:${escapeHtml(hp)}</span><span>SPD:${escapeHtml(speed)}</span></div>` : ''}
                    <div class="binder-card-meta">${escapeHtml(format(card.rarity))} / ${owned ? `Owned x${owned}` : 'Unowned'}</div>
                    <div class="binder-card-cost">${cost > 0 ? `Cost ${cost} ${escapeHtml(format(costElement))}` : 'No energy cost'}</div>
                    ${isSiegling ? renderBinderCardDescription(card) : ''}
                </div>
            </div>
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
        panel.innerHTML = `
            <div class="detail-art art" style="--el:${elementColor(card.element)}">${renderElementIcon(card.element)}</div>
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
            <button class="primary-btn" type="button" id="addSelectedToBuilder">Add to Custom Deck</button>
        `;
        document.getElementById('addSelectedToBuilder')?.addEventListener('click', () => adjustBuilder(card.id, 1));
    }

    function renderHomeDashboard() {
        const el = document.getElementById('homeDashboard');
        if (!el) return;
        const collection = collectionSummary();
        const ownedTotal = state.progression?.ownedTotal || 0;
        const coins = state.profile?.authenticated ? (state.progression?.gold || 0) : 100;
        const savedDecks = state.profile?.savedDecks || [];
        const packHistory = state.progression?.packHistory || [];
        const packFragments = Math.max(0, packHistory.length * 25 + Math.floor(ownedTotal / 3));
        const customSlotsUsed = savedDecks.length;
        const customSlotsMax = 20;
        const recentRooms = state.rooms.slice(0, 4);
        const featuredPacks = state.packs.slice(0, 4);
        const recentDecks = savedDecks.slice(0, 3);
        const missions = homeDailyMissions();
        const missionLog = homeMissionLog();
        el.innerHTML = `
            <section class="command-hero">
                <div class="command-hero-copy">
                    <span class="eyebrow">Welcome back, ${escapeHtml(state.profile?.user?.displayName || 'Siegelord')}</span>
                    <h2>Your Siege Awaits</h2>
                    <p>Battle, build, collect, and keep your daily momentum moving from one command table.</p>
                </div>
                <div class="command-hero-actions">
                    <button class="ghost-btn command-hero-btn" type="button" data-home-action="cards"><span>Cards</span>Owned Cards</button>
                    <button class="primary-btn command-hero-btn" type="button" data-home-action="pve"><span>Play</span>Start Match</button>
                    <button class="ghost-btn command-hero-btn" type="button" data-home-action="decks"><span>Deck</span>Deck Builder</button>
                </div>
            </section>

            <section class="command-action-row">
                <button class="command-action-card fire" type="button" data-home-action="pve">
                    <span class="command-action-icon">PVE</span>
                    <strong>PVE Battle</strong>
                    <small>Fight AI opponents and earn Coins.</small>
                    <span class="command-action-arrow">&gt;</span>
                </button>
                <button class="command-action-card water" type="button" data-home-action="create-lobby">
                    <span class="command-action-icon">1v1</span>
                    <strong>Create 1v1 Lobby</strong>
                    <small>Host a PVP room and challenge a friend.</small>
                    <span class="command-action-arrow">&gt;</span>
                </button>
                <button class="command-action-card shadow" type="button" data-home-action="shop">
                    <span class="command-action-icon">Pack</span>
                    <strong>Open Packs</strong>
                    <small>Discover new cards and grow your collection.</small>
                    <span class="command-action-arrow">&gt;</span>
                </button>
            </section>

            <section class="command-count-row">
                ${homeCountTile(coinIconMarkup(), 'Coins', coins.toLocaleString(), 'Available', true)}
                ${homeCountTile('Card', 'Owned Card Copies', ownedTotal.toLocaleString(), 'Total copies')}
                ${homeCountTile('Deck', 'Custom Deck Slots', `${customSlotsUsed} / ${customSlotsMax}`, 'Slots used')}
                ${homeCountTile('Frag', 'Pack Fragments', packFragments.toLocaleString(), 'Fragments')}
                ${homeCountTile('Set', 'Collection', `${collection.completion}%`, 'Set completion')}
            </section>

            <section class="command-grid">
                <article class="command-panel quick-play-panel">
                    <div class="command-panel-head"><div><span class="eyebrow">Quick Play</span><h3>Jump into battle</h3></div></div>
                    <p>Choose a match mode and start playing with your current loadout.</p>
                    <div class="quick-play-actions">
                        <button class="command-mode-card active" type="button" data-home-action="pve"><strong>PVE Battle</strong><span>Fight AI opponents</span></button>
                        <button class="command-mode-card" type="button" data-home-action="social"><strong>Browse Social</strong><span>Join open rooms</span></button>
                    </div>
                </article>

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
                    <p>Review owned cards, inspect notches, and turn your collection into stronger decks.</p>
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

    function homeCountTile(icon, label, value, hint, iconIsMarkup = false) {
        return `<article class="command-count-card">
            <span class="count-icon">${iconIsMarkup ? icon : escapeHtml(icon)}</span>
            <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><em>${escapeHtml(hint)}</em></div>
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
            { icon: coinIconMarkup(), iconMarkup: true, title: 'Earn 300 Coins', current: Math.min(300, coins), target: 300, reward: 150 }
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
        root.querySelectorAll('[data-home-action]').forEach(btn => btn.addEventListener('click', () => {
            const action = btn.dataset.homeAction;
            if (action === 'pve') return goPlay({ mode: 'solo' });
            if (action === 'create-lobby') return createLobbyFromHome();
            if (action === 'card') {
                state.selectedCardId = btn.dataset.cardId;
                navigateHub('cards');
                openCardTray();
                renderCards();
                renderDetail();
                return;
            }
            if (action === 'cards') return navigateHub('cards');
            if (action === 'decks') return navigateHub('decks');
            if (action === 'social') return navigateHub('social');
            if (action === 'shop') return navigateHub('shop');
            if (action === 'missions') return root.querySelector('.daily-missions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }));
    }

    function renderDecks() {
        const grid = document.getElementById('deckGrid');
        if (!grid) return;
        grid.innerHTML = (state.options?.decks || []).map(renderPremadeDeckTile).join('');
        grid.querySelectorAll('[data-play-deck]').forEach(btn => btn.addEventListener('click', () => goPlay({ mode: 'solo', deckId: btn.dataset.playDeck })));
        grid.querySelectorAll('[data-buy-deck]').forEach(btn => btn.addEventListener('click', () => purchaseDeck(btn.dataset.buyDeck)));
        renderBuilder();
        renderSavedDecks();
    }

    function renderPremadeDeckTile(deck) {
        const price = deck.elements.length <= 1 ? 300 : deck.elements.length >= 4 ? 700 : 450;
        const owned = state.progression?.purchasedDeckIds?.includes(deck.id);
        const primary = deck.elements?.[0] || 'FIRE';
        const accent = elementColor(primary);
        const elementLabels = deck.elements.map(format).join(' / ');
        const visual = deckAssetForElements(deck.elements);
        const artStyle = visual?.back ? `;--deck-art:url('${visual.back}')` : '';
        return `<article class="deck-tile hub-deck-card${visual ? ' has-deck-art' : ''}" style="--deck-accent:${accent};--deck-bg:${deckGradient(deck.elements)}${artStyle}">
            <span class="deck-card-state">${owned ? 'Purchased' : 'Premade'}</span>
            <div class="deck-card-body">
                <strong class="deck-card-name">${escapeHtml(deck.name)}</strong>
                <span class="deck-card-elements">${escapeHtml(elementLabels)}</span>
                <span class="deck-card-desc">${escapeHtml(deck.description || 'Ready-to-play battle deck.')}</span>
            </div>
            <div class="deck-card-actions">
                <button class="primary-btn" type="button" data-play-deck="${escapeAttr(deck.id)}">Play</button>
                <button class="ghost-btn" type="button" data-buy-deck="${escapeAttr(deck.id)}">${owned ? 'Owned' : renderCoinAmount(price, '')}</button>
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
        grid.innerHTML = savedDecks.length ? savedDecks.map(renderSavedDeckTile).join('') : '<div class="unlock-card"><strong>No saved custom decks yet</strong><span>Build a 30-card custom deck from owned cards, then save it here.</span></div>';
        grid.querySelectorAll('[data-play-custom-deck]').forEach(btn => btn.addEventListener('click', () => {
            const deck = savedDecks.find(item => item.id === btn.dataset.playCustomDeck);
            if (!deck) return;
            goPlay({ mode: 'solo', deckId: deck.deckId, customDeckCards: deck.customDeckCards || null, trainerId: deck.trainerId, loadoutLabel: deck.name });
        }));
    }

    function renderSavedDeckTile(deck) {
        const cardIds = deck.customDeckCards || [];
        const elements = [...new Set(cardIds.map(id => findCard(id)?.element).filter(Boolean))].slice(0, 4);
        const fallbackDeck = (state.options?.decks || []).find(item => item.id === deck.deckId);
        const displayElements = elements.length ? elements : (fallbackDeck?.elements || ['FIRE']);
        const accent = elementColor(displayElements[0]);
        const visual = deckAssetForElements(displayElements);
        const artStyle = visual?.back ? `;--deck-art:url('${visual.back}')` : '';
        return `<article class="deck-tile hub-deck-card custom-saved-deck${visual ? ' has-deck-art' : ''}" style="--deck-accent:${accent};--deck-bg:${deckGradient(displayElements)}${artStyle}">
            <span class="deck-card-state">${deck.custom ? 'Custom' : 'Saved'}</span>
            <div class="deck-card-body">
                <strong class="deck-card-name">${escapeHtml(deck.name || 'Saved Deck')}</strong>
                <span class="deck-card-elements">${displayElements.map(format).join(' / ')}</span>
                <span class="deck-card-desc">${deck.custom ? `${cardIds.length} owned cards` : escapeHtml(deck.deckName || 'Premade loadout')} / ${escapeHtml(deck.trainerName || 'SiegeKnight')}</span>
            </div>
            <div class="deck-card-actions">
                <button class="primary-btn" type="button" data-play-custom-deck="${escapeAttr(deck.id)}">Play</button>
            </div>
        </article>`;
    }

    function renderBuilder() {
        const lock = document.getElementById('deckBuilderLock');
        const panel = document.getElementById('builderPanel');
        const unlocked = Boolean(state.progression?.customDeckUnlocked);
        lock.innerHTML = unlocked
            ? '<div class="unlock-card"><strong>Custom deckbuilding unlocked</strong><span>Use owned cards with max 3 copies each.</span></div>'
            : `<div class="unlock-card"><strong>Own 30 total card copies to build custom decks.</strong><span>${state.progression?.ownedTotal || 0}/30 owned copies. Play premade decks and open packs to unlock.</span></div>`;
        panel.innerHTML = unlocked
            ? `<div class="section-head"><h2>Custom Deck Draft (${builderTotal()}/30)</h2><button class="primary-btn" type="button" id="playCustomBtn">Play Custom</button></div><div class="builder-list">${Object.entries(state.builderCounts).map(([cardId, count]) => {
                const card = findCard(cardId);
                return `<div class="card-tile"><div class="art" style="--el:${elementColor(card?.element)}"></div><div><strong>${escapeHtml(card?.name || cardId)}</strong><span>${count} copies</span><button class="ghost-btn" type="button" data-remove-card="${escapeAttr(cardId)}">Remove</button></div></div>`;
            }).join('') || '<div class="unlock-card">Select owned cards from the browser to start building.</div>'}</div>`
            : '';
        document.getElementById('playCustomBtn')?.addEventListener('click', () => goPlay({ mode: 'solo', customDeckCards: builderCards(), loadoutLabel: 'Custom Binder Deck' }));
        panel.querySelectorAll('[data-remove-card]').forEach(btn => btn.addEventListener('click', () => adjustBuilder(btn.dataset.removeCard, -1)));
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
            rarity: offer.rarity || catalogCard.rarity || 'COMMON'
        };
        const purchased = state.progression?.purchasedDailyOfferIds?.includes(offer.id);
        const owned = ownedCount(card.id);
        const typeLabel = [format(card.type), format(card.element)].filter(Boolean).join(' / ');
        const hp = card.health ?? card.hp ?? '-';
        const speed = card.speed ?? card.spd ?? '-';
        const isSiegling = card.type === 'SIEGLING';
        return `<article class="daily-offer-tile" style="--el:${elementColor(card.element)};--rarity:${rarityColor(card.rarity)}">
            <div class="daily-card-front binder-card daily-card-compact">
                ${isSiegling ? renderBinderNotches(card.notches) : ''}
                <div class="binder-card-shell">
                    <div class="binder-card-header">
                        <strong>${escapeHtml(card.name || 'Daily Card')}</strong>
                        <span>${escapeHtml(typeLabel)}</span>
                    </div>
                    <div class="binder-card-art">${renderElementIcon(card.element)}</div>
                    <div class="binder-card-body">
                        ${isSiegling ? `<div class="binder-card-stats"><span>HP:${escapeHtml(hp)}</span><span>SPD:${escapeHtml(speed)}</span></div>` : ''}
                        <div class="binder-card-meta">${escapeHtml(format(card.rarity))} / Owned x${owned}</div>
                        <div class="binder-card-cost">${cardEnergyCost(card) > 0 ? `Cost ${cardEnergyCost(card)} ${escapeHtml(format(card.costElement || card.element))}` : 'No energy cost'}</div>
                    </div>
                </div>
            </div>
            <button class="primary-btn" type="button" data-daily-offer-id="${escapeAttr(offer.id)}" ${purchased ? 'disabled' : ''}>${purchased ? 'Purchased' : renderCoinAmount(offer.price, '')}</button>
        </article>`;
    }

    function renderPackTile(pack) {
        const starterMode = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
        const label = starterMode && pack.starterEligible ? 'Choose Starter' : renderCoinAmount(pack.price, '');
        const primaryElement = pack.elements?.[0] || 'FIRE';
        const image = packImageFor(pack);
        const imageStyle = image
            ? `background-image: linear-gradient(180deg, rgba(5, 8, 18, 0) 44%, rgba(5, 8, 18, 0.84) 100%), url('${image}');`
            : '';
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
        list.querySelectorAll('[data-room-id]').forEach(btn => btn.addEventListener('click', () => {
            document.getElementById('roomCodeInput').value = btn.dataset.roomId;
            joinRoomFromHome();
        }));
        list.querySelector('[data-create-empty-lobby]')?.addEventListener('click', createLobbyFromHome);
    }

    function renderRoomTile(room) {
        const element = inferRoomElement(room);
        const color = elementColor(element);
        const full = isRoomFull(room);
        const playerCount = Number(room.playerCount || room.players?.length || 1);
        const status = full ? 'Full' : escapeHtml(room.status || 'Open');
        const roomId = escapeAttr(room.roomId || '');
        const expiresLabel = formatLobbyExpiry(room.expiresAt);
        return `<article class="room-tile social-room-tile" style="--room-el:${color}">
            <div class="room-emblem" aria-hidden="true">${renderRoomEmblem(element)}</div>
            <div class="room-copy">
                <div class="room-title-line">
                    <span class="room-badge">${escapeHtml(room.format || 'PVP')}</span>
                    <strong>${escapeHtml(room.name || `${room.hostName || 'Host'}'s Arena`)}</strong>
                </div>
                <span>${escapeHtml(format(element))} table / Best of 1</span>
                <span>Hosted by ${escapeHtml(room.hostName || 'Host')} / Code ${escapeHtml(room.roomId || '----')}</span>
                ${expiresLabel ? `<span class="room-expiry">${escapeHtml(expiresLabel)}</span>` : ''}
            </div>
            <div class="room-seat-count"><strong>${playerCount} / 2</strong><span>Players</span></div>
            <button class="${full ? 'ghost-btn' : 'primary-btn'}" type="button" data-room-id="${roomId}" ${full ? 'disabled' : ''}>${status === 'Full' ? 'Full' : 'Join'}</button>
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
        if (hostLobby?.roomId) {
            const expiresLabel = formatLobbyExpiry(hostLobby.expiresAt);
            card.innerHTML = `<div class="social-active-content">
                <div>
                    <span class="eyebrow">Your Active Lobby</span>
                    <h2>${escapeHtml(name)}'s table</h2>
                    <span>Room code <strong>${escapeHtml(hostLobby.roomId)}</strong></span>
                    <span>Deck ready: ${escapeHtml(deck || 'Starter Deck')}</span>
                    ${expiresLabel ? `<span>${escapeHtml(expiresLabel)}</span>` : ''}
                </div>
                <div class="social-active-status"><strong>1 / 2</strong><span>Waiting for opponent</span></div>
                <div class="friend-actions">
                    <button class="primary-btn" id="activeLobbyResumeBtn" type="button">Open Table</button>
                    <button class="ghost-btn" id="activeLobbyCloseBtn" type="button">Close Lobby</button>
                </div>
            </div>`;
            document.getElementById('activeLobbyResumeBtn')?.addEventListener('click', () => goPlay({
                mode: 'online',
                onlineRoomMode: 'create',
                roomId: hostLobby.roomId,
                deckId: selectedDeckId()
            }));
            document.getElementById('activeLobbyCloseBtn')?.addEventListener('click', () => closeHostLobby(hostLobby));
            return;
        }
        card.innerHTML = `<div class="social-active-content">
            <div>
                <span class="eyebrow">Your Active Lobby</span>
                <h2>${escapeHtml(name)}'s table</h2>
                <span>Deck ready: ${escapeHtml(deck || 'Starter Deck')}</span>
            </div>
            <div class="social-active-status"><strong>0 / 2</strong><span>No open table yet</span></div>
            <button class="primary-btn" id="activeLobbyCreateBtn" type="button">Start Hosting</button>
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
                const presence = state.friendPresence[friend.email] || {};
                const prefs = presence.profileSettings || {};
                const online = Boolean(presence.presence?.online);
                const status = presence.presence?.status || 'OFFLINE';
                return `<article class="friend-tile social-friend-tile">
                <div class="friend-avatar-wrap">
                    ${renderPlayerAvatar({
                        displayName: prefs.displayName || friend.displayName || friend.email,
                        avatarMode: prefs.avatarMode,
                        avatar: prefs.avatar,
                        avatarUrl: prefs.avatarUrl,
                        favoriteElement: prefs.favoriteElement
                    }, 'friend-avatar')}
                    <span class="presence-dot ${online ? (status === 'IN_GAME' ? 'in-game' : 'online') : ''}" title="${escapeHtml(status)}"></span>
                </div>
                <div class="friend-copy">
                    <strong>${escapeHtml(prefs.displayName || friend.displayName || friend.email)}</strong>
                    <span>${escapeHtml(friend.email)} · ${online ? escapeHtml(status.replace('_', ' ')) : 'Offline'}</span>
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
        list.querySelectorAll('[data-view-profile]').forEach(btn => btn.addEventListener('click', () => openPlayerProfile(btn.dataset.viewProfile)));
        list.querySelectorAll('[data-message-friend]').forEach(btn => btn.addEventListener('click', () => openMessageComposer(btn.dataset.messageFriend)));
    }

    function friendInitial(friend) {
        return String(friend.displayName || friend.email || 'S').trim().slice(0, 1).toUpperCase();
    }

    function renderProfile() {
        const body = document.getElementById('profileSectionBody');
        if (!body) return;
        if (!state.profile?.authenticated) {
            body.innerHTML = `<div class="profile-dashboard profile-signed-out">
                <div class="profile-hero profile-hero-neutral">
                    <div class="profile-hero-content">
                        <div class="profile-avatar">ST</div>
                        <div>
                            <span class="eyebrow">Player Hub</span>
                            <h2>Claim your Siegelings profile</h2>
                            <p>Sign in to save Coins, starter packs, owned cards, custom decks, friends, and match history.</p>
                        </div>
                    </div>
                    <button class="primary-btn profile-theme-btn" type="button" id="profileSignInBtn">Sign In</button>
                </div>
            </div>`;
            document.getElementById('profileSignInBtn')?.addEventListener('click', openAuth);
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
            ${state.profileEditOpen ? renderEditProfileModal(view) : ''}
        </div>`;
        bindProfileDashboard();
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
        const realHistory = (state.profile?.matchHistory || []).map((row, index) => normalizeBattle(row, prefs.favoriteElement, index));
        const battles = realHistory.length ? realHistory : mockBattles(prefs.favoriteElement);
        const record = battleRecord(battles);
        return {
            user,
            prefs,
            theme,
            collection,
            savedDecks,
            battles,
            usingMockBattles: !realHistory.length,
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
                ${view.usingMockBattles ? '<span class="profile-soft-pill">Sample history</span>' : '<span class="profile-soft-pill">Live history</span>'}
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
                ${view.battles.map(battle => `<article class="battle-row ${battle.result === 'WIN' ? 'is-win' : 'is-loss'}">
                    <div class="battle-result">${escapeHtml(battle.result)}</div>
                    <div class="battle-main">
                        <strong>${escapeHtml(battle.opponentName)}</strong>
                        <span>${escapeHtml(battle.opponentType)} / ${escapeHtml(battle.deckUsed)}</span>
                    </div>
                    ${renderElementBadge(battle.element)}
                    <div class="battle-meta"><span>${escapeHtml(battle.date)}</span><span>${escapeHtml(battle.duration)}</span></div>
                    <div class="battle-reward">${renderCoinAmount(battle.reward, '')}</div>
                </article>`).join('')}
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
                ${friends.length ? friends.slice(0, 4).map(friend => `<div><strong>${escapeHtml(friend.displayName || friend.email)}</strong><span>${escapeHtml(friend.email)}</span></div>`).join('') : '<div><strong>No friends yet</strong><span>Add friends from the Social page using their email.</span></div>'}
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

    function renderCoinAmount(value, label = 'Coins') {
        const amount = String(value ?? 0).replace(/\s*Coins?$/i, '').trim() || '0';
        return `<span class="coin-value">${coinIconMarkup()}<span>${escapeHtml(amount)}</span>${label ? `<small>${escapeHtml(label)}</small>` : ''}</span>`;
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
            date: formatProfileDate(row.finishedAt) || `Match ${index + 1}`,
            duration: row.turnNumber ? `${row.turnNumber} turns` : '8 min',
            reward: result === 'WIN' ? '+25' : '+5'
        };
    }

    function mockBattles(favoriteElement) {
        return [
            ['WIN', 'Mira of Glasspeak', 'AI', 'Starter Clash', favoriteElement, 'Today', '7 min', '+25'],
            ['LOSS', 'Rowan Vale', 'Player', 'Root and Spark', 'Earth', 'Yesterday', '11 min', '+5'],
            ['WIN', 'Cinder Scout', 'AI', 'Molten Trial', 'Fire', 'May 22', '9 min', '+25'],
            ['WIN', 'Aster Gale', 'Player', 'Skyhook Tempo', 'Wind', 'May 20', '6 min', '+25'],
            ['LOSS', 'Frost Regent', 'AI', 'Crystal Ward', 'Ice', 'May 18', '13 min', '+5']
        ].map(([result, opponentName, opponentType, deckUsed, element, date, duration, reward]) => ({
            result,
            opponentName,
            opponentType,
            deckUsed,
            element,
            date,
            duration,
            reward
        }));
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
            el.innerHTML = `<strong>Guest</strong><span>Sign in from the HUD to save Coins and owned cards.</span>`;
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
        state.packReveal = latest ? {
            packId: latest.packId,
            openedAt: latest.openedAt,
            revealed: new Set()
        } : null;
        renderPackResult();
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

    function renderPackResult() {
        const result = document.getElementById('packResult');
        const latest = state.progression?.packHistory?.[0];
        if (!result || !latest) return;
        const reveal = ensurePackReveal(latest);
        const cards = latest.cards.map((card, index) => enrichPackCard(card, index));
        const revealedCount = reveal.revealed.size;
        result.classList.remove('hidden');
        result.innerHTML = `<section class="pack-opening" style="--pack-glow:${elementColor(cards[0]?.element || 'FIRE')}">
            <div class="pack-opening-head">
                <div>
                    <span class="eyebrow">Gacha reveal</span>
                    <h2>${escapeHtml(latest.packName)} opened</h2>
                    <p>${revealedCount}/${cards.length} cards revealed. Flip cards one at a time, or reveal the whole pack.</p>
                </div>
                <div class="pack-opening-actions">
                    <button class="ghost-btn" type="button" data-reveal-all-pack>Reveal All</button>
                    <button class="primary-btn" type="button" data-clear-pack-result>Done</button>
                </div>
            </div>
            <div class="gacha-stage">
                ${cards.map(card => renderRevealCard(card, reveal.revealed.has(card.revealId), latest.packId)).join('')}
            </div>
        </section>`;
    }

    function ensurePackReveal(latest) {
        const samePack = state.packReveal
            && state.packReveal.packId === latest.packId
            && state.packReveal.openedAt === latest.openedAt;
        if (!samePack) {
            state.packReveal = {
                packId: latest.packId,
                openedAt: latest.openedAt,
                revealed: new Set()
            };
        }
        return state.packReveal;
    }

    function enrichPackCard(card, index) {
        const catalogCard = findCard(card.id) || {};
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
            costElement: catalogCard.costElement || card.costElement || card.element || catalogCard.element
        };
    }

    function renderRevealCard(card, revealed, packId = '') {
        const rarity = card.rarity || 'COMMON';
        const element = card.element || 'FIRE';
        const isSiegling = card.type === 'SIEGLING';
        return `<button class="reveal-card ${revealed ? 'is-revealed' : ''} rarity-${String(rarity).toLowerCase()}" type="button" data-reveal-card="${escapeAttr(card.revealId)}" style="--el:${elementColor(element)};--rarity:${rarityColor(rarity)};--pack-back:${packBackForElement(element, packId)}">
            <span class="rarity-burst" aria-hidden="true"></span>
            <span class="reveal-face reveal-back">
                <span class="pack-back-sigil">${escapeHtml(format(element).slice(0, 1) || '?')}</span>
                <strong>Tap to reveal</strong>
                <small>${escapeHtml(format(rarity))} pulse</small>
            </span>
            <span class="reveal-face reveal-front">
                ${isSiegling ? renderRevealNotches(card.notches) : ''}
                <span class="reveal-card-art">${renderRevealCardArt(element)}</span>
                <span class="reveal-card-copy">
                    <small>${escapeHtml(format(card.type))} / ${escapeHtml(format(element))}</small>
                    <strong>${escapeHtml(card.name || 'Unknown Card')}</strong>
                    <span class="reveal-rarity">${escapeHtml(format(rarity))}</span>
                    ${isSiegling ? `<span class="reveal-stats">HP ${escapeHtml(card.health ?? '-')} / SPD ${escapeHtml(card.speed ?? '-')}</span>` : ''}
                    <span class="reveal-cost">${revealCardEnergyCost(card) > 0 ? `Cost ${revealCardEnergyCost(card)} ${escapeHtml(format(card.costElement || element))}` : 'No energy cost'}</span>
                </span>
            </span>
        </button>`;
    }

    function revealPackCard(revealId) {
        const latest = state.progression?.packHistory?.[0];
        if (!latest) return;
        ensurePackReveal(latest).revealed.add(revealId);
        renderPackResult();
    }

    function revealAllPackCards() {
        const latest = state.progression?.packHistory?.[0];
        if (!latest) return;
        const reveal = ensurePackReveal(latest);
        latest.cards.forEach((card, index) => reveal.revealed.add(`${card.id || 'card'}-${index}`));
        renderPackResult();
    }

    function clearPackResult() {
        state.packReveal = null;
        const result = document.getElementById('packResult');
        if (result) {
            result.classList.add('hidden');
            result.innerHTML = '';
        }
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

    async function saveCustomDeck() {
        if (!state.profile?.authenticated) return openAuth();
        const cards = builderCards();
        if (cards.length < 30) return alert('Custom decks need 30 cards.');
        const trainerId = state.options?.defaultTrainerId || state.options?.trainers?.[0]?.id;
        const data = await fetchJson('/api/profile/decks', {
            method: 'POST',
            body: JSON.stringify({ trainerId, customDeckCards: cards, name: 'Custom Binder Deck' })
        });
        if (data?.error) return alert(data.error);
        state.profile = data;
        state.progression = data.progression;
        renderProfile();
        renderDecks();
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
        setFriendMessage('Friend added.', 'success');
        renderProfileMini();
        renderFriends();
        renderProfile();
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
        renderProfile();
    }

    function setFriendMessage(message, type = '') {
        state.friendMessage = message;
        state.friendMessageType = type;
        renderFriends();
    }

    function createLobbyFromHome() {
        goPlay({ mode: 'online', onlineRoomMode: 'create', deckId: selectedDeckId() });
    }

    function quickJoinFirstRoom() {
        const room = filteredRooms().find(candidate => !isRoomFull(candidate));
        if (!room?.roomId) return;
        const input = document.getElementById('roomCodeInput');
        if (input) input.value = room.roomId;
        joinRoomFromHome();
    }

    function joinRoomFromHome() {
        const room = document.getElementById('roomCodeInput')?.value?.trim()?.toUpperCase();
        if (!room) return;
        goPlay({ mode: 'online', onlineRoomMode: 'join', roomId: room, deckId: selectedDeckId() });
    }

    function goPlay(payload) {
        localStorage.setItem(PENDING_LOADOUT_KEY, JSON.stringify({
            createdAt: Date.now(),
            deckId: payload.deckId || selectedDeckId(),
            trainerId: payload.trainerId || state.options?.defaultTrainerId || state.options?.trainers?.[0]?.id,
            mode: payload.mode || 'solo',
            onlineRoomMode: payload.onlineRoomMode || 'create',
            roomId: payload.roomId || '',
            customDeckCards: payload.customDeckCards || null,
            loadoutLabel: payload.loadoutLabel || ''
        }));
        window.location.href = '/play';
    }

    function navigateHub(route) {
        if (route === state.route) {
            if (route === 'cards' || route === 'decks') {
                void refreshLiveCatalog();
            }
            return;
        }
        state.route = route;
        history.pushState(null, '', route === 'home' ? '/home' : `/${route}`);
        setActiveRoute();
        renderSections();
        renderRoute();
    }

    function setActiveRoute() {
        document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === state.route));
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
            return await resp.json();
        } catch (error) {
            console.error(error);
            return null;
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

    async function refreshLiveCatalog() {
        if (liveCatalogRefreshPromise) {
            return liveCatalogRefreshPromise;
        }
        liveCatalogRefreshPromise = (async () => {
            const data = await fetchJson('/api/game/options');
            if (!data) return;
            applyGameOptions(data);
            writeCache('gameOptions', data);
            if (state.route === 'cards') {
                renderCards();
            } else if (state.route === 'decks') {
                renderDecks();
            }
            safeRender(renderHomeDashboard);
            safeRender(renderProfileMini);
            safeRender(renderUnlock);
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
        return `<div class="auth-card">
            <strong>Sign in to save progression</strong>
            <span>Starter packs, Coins, owned cards, and custom decks require an account. New players start with ${renderCoinAmount(100)}.</span>
            <input class="search-input" id="authEmail" type="email" placeholder="Email">
            <input class="search-input" id="authName" placeholder="Display name for register">
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
        document.querySelectorAll('#registerBtn').forEach(btn => btn.addEventListener('click', () => submitAuth('register')));
    }

    async function submitAuth(mode) {
        const email = document.getElementById('authEmail')?.value || '';
        const password = document.getElementById('authPassword')?.value || '';
        const displayName = document.getElementById('authName')?.value || '';
        const data = await fetchJson(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password, displayName }) });
        if (data?.error) return alert(data.error);
        state.token = data.token || '';
        localStorage.setItem(AUTH_TOKEN_KEY, state.token);
        state.profile = data;
        state.progression = data.progression;
        state.profilePrefs = applyProfileSettingsFromServer(data.profileSettings) || defaultProfilePrefs(data.user || {});
        cacheProfilePrefs(state.profilePrefs);
        state.profileEditOpen = false;
        state.authOpen = false;
        await ensurePacksLoaded();
        render();
    }

    async function logout() {
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
        if (!state.progression?.customDeckUnlocked) return navigateHub('decks');
        const owned = ownedCount(cardId);
        const current = state.builderCounts[cardId] || 0;
        const next = Math.max(0, Math.min(3, owned, current + delta));
        if (next) state.builderCounts[cardId] = next;
        else delete state.builderCounts[cardId];
        navigateHub('decks');
        renderBuilder();
    }

    function builderCards() {
        return Object.entries(state.builderCounts).flatMap(([cardId, count]) => Array.from({ length: count }, () => cardId));
    }

    function builderTotal() { return builderCards().length; }
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
    function routeFromPath(path) {
        const route = String(path || '/home').replace(/^\/+/, '').split('/')[0] || 'home';
        if (route === 'lobbies') return 'social';
        return ['cards', 'decks', 'social', 'profile', 'shop'].includes(route) ? route : 'home';
    }
    function elementColor(element) { return ELEMENT_COLORS[element] || '#f05b2f'; }
    function rarityColor(rarity) { return RARITY_COLORS[rarity] || RARITY_COLORS.COMMON; }
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
        await refreshRooms(true);
        renderSocialActiveLobby();
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

    async function refreshSocialData(forceRooms) {
        if (!state.profile?.authenticated) {
            state.friendPresence = {};
            state.messageThreads = [];
            renderFriends();
            renderMessageThreads();
            return;
        }
        await Promise.all([
            refreshRooms(forceRooms),
            refreshFriendPresence(),
            refreshMessageThreads(),
            sendPresenceHeartbeat()
        ]);
        renderFriends();
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
        if (data?.error) {
            if (log) log.innerHTML = `<div class="social-empty-state">${escapeHtml(data.error)}</div>`;
            return;
        }
        if (log) {
            log.innerHTML = (data.messages || []).length
                ? data.messages.map(message => `<div class="message-bubble ${message.mine ? 'mine' : 'theirs'}">${escapeHtml(message.text)}</div>`).join('')
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

    async function openPlayerProfile(userId) {
        const data = await fetchJson(`/api/social/players/${encodeURIComponent(userId)}/profile`);
        if (data?.error) return alert(data.error);
        state.viewingProfile = data;
        const modal = document.getElementById('viewProfileModal');
        const body = document.getElementById('viewProfileBody');
        if (!modal || !body) return;
        const prefs = data.profileSettings || {};
        const theme = elementThemes[normalizeProfileElement(prefs.favoriteElement)] || elementThemes.Fire;
        body.innerHTML = `<div class="view-profile-modal-head">
            <div>
                <span class="eyebrow">Player Profile</span>
                <h2 id="viewProfileTitle">${escapeHtml(prefs.displayName || userId)}</h2>
                <p class="profile-title">${escapeHtml(prefs.playerTitle || theme.mood)}</p>
            </div>
            <button class="ghost-btn compact-btn" type="button" id="closeViewProfileBtn">Close</button>
        </div>
        <div class="profile-dashboard" style="${profileThemeStyle(theme)}">
            <section class="profile-hero profile-hero-neutral">
                <div class="profile-hero-content">
                    <div class="profile-avatar-wrap">${renderPlayerAvatar(prefs, 'profile-avatar')}</div>
                    <div class="profile-identity">
                        ${renderElementBadge(prefs.favoriteElement)}
                        <p class="profile-bio">${escapeHtml(prefs.bio || '')}</p>
                        <p class="profile-muted">Favorite Siegeling: ${escapeHtml(prefs.favoriteSiegling || '—')}</p>
                        <p class="profile-muted">${escapeHtml(prefs.preferredCardBack || '')} card back</p>
                        <p class="profile-muted">Status: ${escapeHtml((data.presence?.online ? data.presence.status : 'OFFLINE').replace('_', ' '))}</p>
                    </div>
                </div>
            </section>
            <section class="profile-stat-grid">
                ${renderStatCard('Cards Owned', data.stats?.ownedTotal ?? 0, 'Total copies')}
                ${renderStatCard('Unique Cards', data.stats?.uniqueOwned ?? 0, 'Discovered')}
                ${renderStatCard('Coins', data.stats?.gold ?? 0, 'Wallet')}
                ${renderStatCard('Level', data.stats?.level ?? 1, 'Collector rank')}
            </section>
            ${data.isFriend ? `<div class="profile-edit-actions">
                <button class="primary-btn profile-theme-btn" type="button" id="viewProfileMessageBtn">Message</button>
            </div>` : '<p class="profile-muted">Add this player as a friend to send messages.</p>'}
        </div>`;
        modal.classList.remove('hidden');
        document.getElementById('closeViewProfileBtn')?.addEventListener('click', closePlayerProfile);
        document.getElementById('viewProfileMessageBtn')?.addEventListener('click', () => {
            closePlayerProfile();
            navigateHub('social');
            openMessageComposer(userId);
        });
    }

    function closePlayerProfile() {
        state.viewingProfile = null;
        document.getElementById('viewProfileModal')?.classList.add('hidden');
    }

    document.getElementById('closeMessageComposeBtn')?.addEventListener('click', () => {
        state.activeChatPeer = null;
        document.getElementById('messageCompose')?.classList.add('hidden');
        renderMessageThreads();
    });
    document.getElementById('messageSendForm')?.addEventListener('submit', sendChatMessage);

    document.addEventListener('click', (event) => {
        const packButton = event.target.closest('[data-pack-id]');
        if (packButton) choosePack(packButton.dataset.packId);
        const dailyOfferButton = event.target.closest('[data-daily-offer-id]');
        if (dailyOfferButton) purchaseDailyOffer(dailyOfferButton.dataset.dailyOfferId);
        const revealButton = event.target.closest('[data-reveal-card]');
        if (revealButton) revealPackCard(revealButton.dataset.revealCard);
        if (event.target.closest('[data-reveal-all-pack]')) revealAllPackCards();
        if (event.target.closest('[data-clear-pack-result]')) clearPackResult();
    });
})();
