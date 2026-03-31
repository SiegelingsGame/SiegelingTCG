let gameState = null;
let selectedCard = null;
let targetMode = false;
let targetContext = null;
let gameOptions = null;
let selectedDeckId = null;
let selectedTrainerId = null;
let loadoutMode = 'preset';
let builderCounts = {};
let builderElementFilter = 'ALL';
let builderTypeFilter = 'ALL';
let matchMode = 'solo';
let onlineRoomMode = 'create';
let multiplayerSession = loadSavedMultiplayerSession();
let roomPollHandle = null;
let currentRoomStatus = null;
let mobileInfoTab = 'battle';

const ROW_NAMES = ['Back', 'Middle', 'Front'];
const TARGET_TYPES = {
    SINGLE_ENEMY: 'enemy',
    SINGLE_ALLY: 'ally'
};
const ENERGY_ORDER = [
    ['fire', 'Fire'],
    ['earth', 'Earth'],
    ['wind', 'Wind'],
    ['water', 'Water'],
    ['shadow', 'Shadow'],
    ['electric', 'Electric']
];
const API_BASE_URL = normalizeApiBaseUrl(
    window.SIEGLINGS_CONFIG?.apiBaseUrl || window.SIEGLINGS_API_BASE || ''
);

function normalizeApiBaseUrl(baseUrl) {
    return (baseUrl || '').replace(/\/+$/, '');
}

function apiUrl(path) {
    if (!path.startsWith('/')) {
        return `${API_BASE_URL}/${path}`;
    }
    return `${API_BASE_URL}${path}`;
}

function isMobileLayout() {
    return window.matchMedia('(max-width: 900px)').matches;
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

function getJoinRoomCodeFromUrl() {
    return new URLSearchParams(window.location.search).get('room');
}

function isOpeningPlacementOnlyTurn() {
    return gameState
        && gameState.turnNumber === 1
        && gameState.currentPhase === 'SETUP'
        && gameState.activeSide === 'PLAYER'
        && gameState.firstPlayer === 'PLAYER'
        && gameState.setupTurnsTakenThisRound === 0;
}

async function api(endpoint, method = 'POST', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (multiplayerSession?.roomId && multiplayerSession?.playerToken) {
        opts.headers['X-Room-Id'] = multiplayerSession.roomId;
        opts.headers['X-Player-Token'] = multiplayerSession.playerToken;
    }
    if (body) opts.body = JSON.stringify(body);

    try {
        const resp = await fetch(apiUrl('/api/game/' + endpoint), opts);
        const data = await resp.json();
        if (data.error) {
            console.error(data.error);
            return null;
        }

        gameState = data;
        render();
        return data;
    } catch (e) {
        console.error('API error:', e);
        return null;
    }
}

async function fetchJson(url, options = {}) {
    try {
        const resp = await fetch(url, options);
        return await resp.json();
    } catch (e) {
        console.error('API error:', e);
        return null;
    }
}

async function loadGameOptions() {
    try {
        const data = await fetchJson(apiUrl('/api/game/options'));
        if (!data) return;
        gameOptions = data;
        selectedDeckId = data.defaultDeckId;
        selectedTrainerId = data.defaultTrainerId;
        builderCounts = {};
        loadoutMode = 'preset';
        hydrateOnlineStateFromUrl();
        renderLoadoutOptions();
        updateLoadoutSummary();
        const resumed = await resumeMultiplayerSession();
        if (!resumed) {
            document.getElementById('loadoutOverlay').classList.add('visible');
        }
    } catch (e) {
        console.error('Failed to load game options:', e);
    }
}

async function newGame() {
    clearMultiplayerSession();
    selectedCard = null;
    clearTargetMode();
    document.getElementById('gameOverOverlay').classList.remove('visible');
    const body = loadoutMode === 'builder'
        ? { trainerId: selectedTrainerId, customDeckCards: getBuilderSelectedCards() }
        : { deckId: selectedDeckId, trainerId: selectedTrainerId };
    const started = await api('new', 'POST', body);
    if (!started) {
        return;
    }
    document.getElementById('loadoutOverlay').classList.remove('visible');
}

function openLoadoutSelector() {
    clearMultiplayerSession();
    gameState = null;
    document.getElementById('gameOverOverlay').classList.remove('visible');
    if (!gameOptions) {
        loadGameOptions();
        return;
    }
    renderLoadoutOptions();
    updateLoadoutSummary();
    document.getElementById('loadoutOverlay').classList.add('visible');
}

function selectDeckOption(deckId) {
    selectedDeckId = deckId;
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function selectTrainerOption(trainerId) {
    selectedTrainerId = trainerId;
    renderLoadoutOptions();
    updateLoadoutSummary();
}

function switchLoadoutMode(mode) {
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
        gameState = data;
        document.getElementById('loadoutOverlay').classList.remove('visible');
        render();
    } else {
        renderLoadoutOptions();
        updateLoadoutSummary();
        document.getElementById('loadoutOverlay').classList.add('visible');
    }
    return true;
}

async function fetchRoomStatus() {
    if (!multiplayerSession?.roomId || !multiplayerSession?.playerToken) {
        return null;
    }

    return fetchJson(apiUrl('/api/match/status'), {
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
            gameState = data;
            document.getElementById('loadoutOverlay').classList.remove('visible');
            render();
        } else {
            renderLoadoutOptions();
            updateLoadoutSummary();
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

function adjustBuilderCard(cardId, delta) {
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

    const deckEl = document.getElementById('deckOptions');
    const trainerEl = document.getElementById('trainerOptions');
    const soloMatchTab = document.getElementById('soloMatchTab');
    const onlineMatchTab = document.getElementById('onlineMatchTab');
    const onlineMatchPanel = document.getElementById('onlineMatchPanel');
    const hostRoomTab = document.getElementById('hostRoomTab');
    const joinRoomTab = document.getElementById('joinRoomTab');
    const roomCodeField = document.getElementById('roomCodeField');
    const presetTab = document.getElementById('presetTab');
    const builderTab = document.getElementById('builderTab');
    const presetPanel = document.getElementById('presetLoadoutPanel');
    const builderPanel = document.getElementById('builderLoadoutPanel');

    deckEl.innerHTML = gameOptions.decks.map(deck => {
        const selected = deck.id === selectedDeckId ? ' selected' : '';
        const elementLabels = deck.elements.map(formatElementLabel).join(' / ');
        return `<button class="loadout-option${selected}" onclick="selectDeckOption('${deck.id}')">
            <span class="loadout-name">${deck.name}</span>
            <span class="loadout-tags">${elementLabels}</span>
            <span class="loadout-desc">${deck.description}</span>
        </button>`;
    }).join('');

    trainerEl.innerHTML = gameOptions.trainers.map(trainer => {
        const selected = trainer.id === selectedTrainerId ? ' selected' : '';
        return `<button class="loadout-option${selected}" onclick="selectTrainerOption('${trainer.id}')">
            <span class="loadout-name">${trainer.name}</span>
            <span class="loadout-tags">${formatElementLabel(trainer.element)} ${trainer.rarity}</span>
            <span class="loadout-desc">Passive: ${trainer.passive || 'None'}</span>
            <span class="loadout-desc">Active: ${trainer.active || 'None'}</span>
        </button>`;
    }).join('');

    soloMatchTab.classList.toggle('active', matchMode === 'solo');
    onlineMatchTab.classList.toggle('active', matchMode === 'online');
    onlineMatchPanel.classList.toggle('hidden', matchMode !== 'online');
    hostRoomTab.classList.toggle('active', onlineRoomMode === 'create');
    joinRoomTab.classList.toggle('active', onlineRoomMode === 'join');
    roomCodeField.classList.toggle('hidden', onlineRoomMode !== 'join');

    presetTab.classList.toggle('active', loadoutMode === 'preset');
    builderTab.classList.toggle('active', loadoutMode === 'builder');
    presetPanel.classList.toggle('hidden', loadoutMode !== 'preset');
    builderPanel.classList.toggle('hidden', loadoutMode !== 'builder');
    renderDeckBuilder();
    renderOnlineStatus();
}

function renderOnlineStatus() {
    const statusEl = document.getElementById('onlineStatus');
    if (!statusEl) return;

    if (matchMode !== 'online') {
        statusEl.innerHTML = 'Create a room or join an invite link to play with another person.';
        return;
    }

    if (!currentRoomStatus?.roomId) {
        statusEl.innerHTML = onlineRoomMode === 'create'
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
    const elementFiltersEl = document.getElementById('builderElementFilters');
    const typeFiltersEl = document.getElementById('builderTypeFilters');
    if (!catalogEl || !deckListEl || !elementFiltersEl || !typeFiltersEl) {
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

    catalogEl.innerHTML = filteredCards.map(card => {
        const count = builderCounts[card.id] || 0;
        const disabledAdd = count >= gameOptions.deckBuilder.maxCopies ? 'disabled' : '';
        const disabledSub = count === 0 ? 'disabled' : '';
        const costText = card.requiredComboSize
            ? `Combo ${card.requiredComboSize}${card.requiredComboSignature ? `: ${card.requiredComboSignature.replaceAll('+', ' / ')}` : ''}`
            : (card.costElement ? `${formatElementLabel(card.costElement)} ${card.costAmount}` : 'Free');
        const text = card.type === 'SIEGLING'
            ? `${card.attack}/${card.defense}/${card.speed} | ${card.preferredRow || 'ANY'}${card.evolvesFromName ? ` | Evolves from ${card.evolvesFromName}` : ''}`
            : (card.ability?.description || 'No effect text');
        return `<div class="builder-card-row">
            <div class="builder-card-main">
                <div class="builder-card-title">
                    <span class="energy-token solid-token token-${card.element.toLowerCase()} builder-token"></span>
                    <span>${card.name}</span>
                    <span class="builder-card-copy">x${count}</span>
                </div>
                <div class="builder-card-meta">${card.type} | ${formatElementLabel(card.element)} | ${card.rarity} | ${costText}</div>
                <div class="builder-card-text">${text}</div>
            </div>
            <div class="builder-card-controls">
                <button class="builder-stepper" ${disabledSub} onclick="adjustBuilderCard('${card.id}', -1)">-</button>
                <button class="builder-stepper" ${disabledAdd} onclick="adjustBuilderCard('${card.id}', 1)">+</button>
            </div>
        </div>`;
    }).join('');

    const chosenCards = getChosenBuilderCards();
    deckListEl.innerHTML = chosenCards.length > 0
        ? chosenCards.map(({ card, count }) => `<div class="builder-deck-row">
            <span>${card.name}</span>
            <span>x${count}</span>
        </div>`).join('')
        : `<div class="builder-empty">Add cards from the catalog to build your deck.</div>`;
}

function updateLoadoutSummary() {
    const summary = document.getElementById('loadoutSummary');
    const startBtn = document.getElementById('btnStartLoadout');
    if (!gameOptions) {
        summary.textContent = 'Loading deck and SiegeKnight choices...';
        if (startBtn) startBtn.disabled = true;
        return;
    }

    const deck = gameOptions.decks.find(item => item.id === selectedDeckId);
    const trainer = gameOptions.trainers.find(item => item.id === selectedTrainerId);
    if (!trainer) {
        summary.textContent = 'Choose a deck and SiegeKnight to begin.';
        if (startBtn) startBtn.disabled = true;
        return;
    }

    const startButtonLabel = matchMode === 'online'
        ? (onlineRoomMode === 'create' ? 'Create Room' : 'Join Room')
        : 'Start Match';
    if (startBtn) startBtn.textContent = startButtonLabel;

    if (matchMode === 'online' && currentRoomStatus?.roomId && !currentRoomStatus.started) {
        summary.innerHTML = `Room <strong>${currentRoomStatus.roomId}</strong> is ready. Waiting for your opponent to join.`;
        if (startBtn) startBtn.disabled = true;
        return;
    }

    if (loadoutMode === 'builder') {
        const cardCount = getBuilderCardCount();
        const elementList = collectBuilderElements();
        const valid = cardCount >= gameOptions.deckBuilder.minDeckSize;
        summary.innerHTML = `${matchMode === 'online' ? 'Online' : 'Deck Builder'}: <strong>${cardCount}</strong> cards selected${elementList ? ` | Elements: <strong>${elementList}</strong>` : ''} | SiegeKnight: <strong>${trainer.name}</strong>`;
        if (!valid) {
            summary.innerHTML += ` | Add at least <strong>${gameOptions.deckBuilder.minDeckSize}</strong> cards to start.`;
        }
        if (startBtn) {
            startBtn.disabled = !valid || (matchMode === 'online' && onlineRoomMode === 'join' && !getCurrentRoomCode());
        }
        return;
    }

    if (!deck) {
        summary.textContent = 'Choose a preset deck and SiegeKnight to begin.';
        if (startBtn) startBtn.disabled = true;
        return;
    }

    summary.innerHTML = `${matchMode === 'online' ? 'Online deck' : 'Deck'}: <strong>${deck.name}</strong> | SiegeKnight: <strong>${trainer.name}</strong>`;
    if (startBtn) {
        startBtn.disabled = matchMode === 'online' && onlineRoomMode === 'join' && !getCurrentRoomCode();
    }
}

async function startSelectedGame() {
    if (!selectedTrainerId) return;
    if (loadoutMode === 'preset' && !selectedDeckId) return;
    if (loadoutMode === 'builder' && getBuilderCardCount() < gameOptions.deckBuilder.minDeckSize) return;
    if (matchMode === 'online') {
        if (onlineRoomMode === 'create') {
            await createRoom();
        } else {
            await joinRoom();
        }
        return;
    }
    await newGame();
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
        ? { trainerId: selectedTrainerId, customDeckCards: getBuilderSelectedCards() }
        : { deckId: selectedDeckId, trainerId: selectedTrainerId };
}

async function createRoom() {
    const body = {
        ...getSelectedLoadoutBody(),
        playerName: getCurrentPlayerName()
    };
    const data = await fetchJson(apiUrl('/api/match/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
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
}

async function joinRoom() {
    const roomId = getCurrentRoomCode();
    if (!roomId) return;

    const body = {
        ...getSelectedLoadoutBody(),
        roomId,
        playerName: getCurrentPlayerName()
    };
    const data = await fetchJson(apiUrl('/api/match/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
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
        gameState = data;
        document.getElementById('loadoutOverlay').classList.remove('visible');
        render();
    } else {
        renderLoadoutOptions();
        updateLoadoutSummary();
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

function getBuilderSelectedCards() {
    const cards = [];
    for (const [cardId, count] of Object.entries(builderCounts)) {
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
    await api('draw');
}

async function executeBattle() {
    selectedCard = null;
    clearTargetMode();
    await api('battle');
}

async function endTurn() {
    selectedCard = null;
    clearTargetMode();
    await api('endturn');
}

async function placeCard(row, col) {
    if (!selectedCard) return;
    await api('place', 'POST', { cardId: selectedCard.id, row, col });
    selectedCard = null;
}

async function castSpell(cardId, targetRow, targetCol) {
    await api('cast', 'POST', { cardId, targetRow, targetCol });
    selectedCard = null;
    clearTargetMode();
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
    await api('trainer', 'POST', { targetRow, targetCol });
    clearTargetMode();
}

async function submitBattleAction(abilityIndex, targetRow = -1, targetCol = -1) {
    await api('battle/action', 'POST', { abilityIndex, targetRow, targetCol });
    clearTargetMode();
}

function render() {
    if (!gameState) return;

    document.getElementById('turnNumber').textContent = gameState.turnNumber;
    document.getElementById('phaseBadge').textContent = gameState.currentPhase;
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

    const phase = gameState.currentPhase;
    const over = gameState.gameOver;
    const playerActive = gameState.activeSide === 'PLAYER';
    document.getElementById('btnDraw').disabled = over || !playerActive || phase !== 'DRAW';
    document.getElementById('btnBattle').disabled = true;
    document.getElementById('btnEndTurn').disabled = over || !playerActive || phase !== 'SETUP';

    document.getElementById('playerHealth').textContent = gameState.player.health;
    document.getElementById('enemyHealth').textContent = gameState.enemy.health;

    renderEnergy('playerEnergy', gameState.player);
    renderEnergy('enemyEnergy', gameState.enemy);

    document.getElementById('playerDeckSize').textContent = gameState.player.deckSize;
    document.getElementById('enemyDeckSize').textContent = gameState.enemy.deckSize;
    document.getElementById('enemyHandSize').textContent = gameState.enemy.handSize;

    renderTrainer('playerTrainer', gameState.player.trainer, true);
    renderTrainer('enemyTrainer', gameState.enemy.trainer, false);

    renderBoard('enemyGrid', gameState.enemyBoard, false);
    renderBoard('playerGrid', gameState.playerBoard, true);
    renderHand();
    renderLog();
    renderBattlePanel();
    renderElementKey();
    syncMobileInfoTab();

    if (gameState.gameOver) {
        document.getElementById('gameOverOverlay').classList.add('visible');
        const title = gameState.winner === 'Draw'
            ? 'DRAW'
            : (gameState.winner === (gameState.playerName || 'Player') ? 'VICTORY!' : 'DEFEAT');
        document.getElementById('gameOverTitle').textContent = title;
        document.getElementById('gameOverMsg').textContent = gameState.winner === 'Draw'
            ? 'Both players were defeated.'
            : `${gameState.winner} wins!`;
    }
}

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

function formatComboPoint(point) {
    const labels = (point.elements || []).map(formatElementLabel).join(' + ');
    return `<div class="combo-point-line">Combo-${point.size}: ${labels}</div>`;
}

function formatElementLabel(element) {
    return (element || '').charAt(0) + (element || '').slice(1).toLowerCase();
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
        tokens.push({
            type: 'combo',
            elements: comboPoint.elements || [],
            label: `Combo-${comboPoint.size}: ${(comboPoint.elements || []).map(formatElementLabel).join(' + ')}`
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
    html += `<div class="name">${trainer.name}</div>`;
    if (trainer.passive) {
        html += `<div class="effect">Passive: ${trainer.passive.description}</div>`;
    }
    if (trainer.active) {
        html += `<div class="effect">Active: ${trainer.active.description}</div>`;
        if (isPlayer) {
            const canUseTrainer = trainer.canUseActive && !isOpeningPlacementOnlyTurn();
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
    let html = '';

    for (const r of rowOrder) {
        for (let c = 0; c < 3; c++) {
            const cell = board[r][c];
            const isLegal = isPlayer && !targetMode && selectedCard && selectedCard.type === 'SIEGLING'
                && legalPlacements.some(p => p[0] === r && p[1] === c);
            const isTargetable = isTargetCell(isPlayer, cell);
            const isActing = gameState.pendingBattle && cell && gameState.pendingBattle.instanceId === cell.instanceId;

            let classes = 'board-cell';
            if (isLegal) classes += ' legal';
            if (cell) classes += ' has-card';
            if (isTargetable) classes += ' targetable';
            if (isActing) classes += ' active-attacker';

            let events = '';
            if (isLegal) {
                events = `onclick="placeCard(${r}, ${c})"`;
            } else if (isTargetable) {
                events = `onclick="onTargetSelected(${r}, ${c})"`;
            } else if (cell) {
                events = `onmouseenter="showTooltipBoard(event, ${isPlayer}, ${r}, ${c})" onmouseleave="hideTooltip()"`;
            }

            html += `<div class="${classes}" ${events} data-row="${r}" data-col="${c}">`;
            if (c === 0) {
                html += `<div class="row-tag">${ROW_NAMES[r]}</div>`;
            }

            if (cell) {
                const elemClass = cell.element.toLowerCase();
                html += `<div class="board-card ${elemClass}">`;
                html += `<div class="card-name">${cell.name}</div>`;
                html += renderNotches(cell.notches, { board, row: r, col: c, isPlayer, isBoard: true, legalPlacements });
                html += `<div class="hp-bar"><div class="hp-fill" style="width:${(cell.hp / cell.maxHp) * 100}%"></div></div>`;
                html += `<div class="card-stats">`;
                html += `<span class="stat stat-hp">${cell.hp}</span>`;
                html += `<span class="stat stat-atk">${cell.atk}</span>`;
                html += `<span class="stat stat-def">${cell.def}</span>`;
                html += `<span class="stat stat-spd">${cell.spd}</span>`;
                html += `</div>`;
                if (cell.statuses && cell.statuses.length > 0) {
                    html += `<div class="status-icons">${cell.statuses.join(' ')}</div>`;
                }
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

    if (row < 0 || row > 2 || col < 0 || col > 2) {
        return 'external';
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
    if (!gameState.player.hand || gameState.player.hand.length === 0) {
        container.innerHTML = '<div style="color:var(--text-dim);font-size:0.8em;">No cards in hand</div>';
        return;
    }

    let html = '';
    for (const card of gameState.player.hand) {
        const elemClass = card.element.toLowerCase();
        const isSelected = selectedCard && selectedCard.id === card.id;
        const selClass = isSelected ? ' selected' : '';
        const openingLocked = isOpeningPlacementOnlyTurn() && card.type !== 'SIEGLING';
        const interactionClass = openingLocked ? ' opening-locked' : '';
        const onclick = openingLocked ? '' : `onclick="selectCard('${card.id}')"`;
        const onmouseenter = openingLocked ? '' : `onmouseenter="showTooltipHand(event, '${card.id}')" onmouseleave="hideTooltip()"`;

        html += `<div class="hand-card ${elemClass}${selClass}${interactionClass}" ${onclick} ${onmouseenter}>`;

        /* ── corner notch orbs (matching card template) ── */
        html += `<div class="card-corner-notches">`;
        html += `<span class="corner-orb top-left"></span>`;
        html += `<span class="corner-orb top-right"></span>`;
        html += `<span class="corner-orb bottom-left"></span>`;
        html += `<span class="corner-orb bottom-right"></span>`;
        html += `</div>`;

        /* ── upper art area with element + type/rarity badge ── */
        html += `<div class="card-art-area">`;
        html += `<div class="card-element-label">${formatElementLabel(card.element)}</div>`;
        html += `<div class="card-rarity-badge">${card.rarity}</div>`;
        if (card.type === 'SIEGLING') {
            html += renderNotches(card.notches, { isBoard: false });
        }
        html += `</div>`;

        /* ── bottom info panel ── */
        html += `<div class="card-info-panel">`;

        if (card.type === 'SIEGLING') {
            html += `<div class="card-stat-row">`;
            html += `<span class="card-stat-item"><span class="stat-icon">&#10084;</span>${card.health}</span>`;
            html += `<span class="card-stat-item"><span class="stat-icon">&#9876;</span>${card.attack}</span>`;
            html += `<span class="card-stat-item"><span class="stat-icon">&#128737;</span>${card.defense}</span>`;
            html += `<span class="card-stat-item"><span class="stat-icon">&#9889;</span>${card.speed}</span>`;
            html += `</div>`;
        }

        /* ── ability area ── */
        html += `<div class="card-ability-area">`;
        if (card.ability) {
            html += `<div class="card-ability-text">${card.ability.description}</div>`;
        }
        if (card.type === 'TRAP') {
            html += `<div class="card-cost-text" style="color:${getElementCssVar(card.trapBucketElement)}">Trigger: Opponent has ${card.trapBucketAmount} ${card.trapBucketElement}</div>`;
        } else if (card.costElement && card.costAmount > 0) {
            html += `<div class="card-cost-text" style="color:${getElementCssVar(card.costElement)}">Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}</div>`;
        }
        if (card.requiredComboSize) {
            const comboLabel = card.requiredComboSignature
                ? card.requiredComboSignature.split('+').map(formatElementLabel).join(' + ')
                : `${card.requiredComboSize}-element combo`;
            html += `<div class="card-cost-text combo-cost">Combo: ${comboLabel}</div>`;
        }
        if (card.requiredReaction) {
            html += `<div class="card-cost-text" style="color:var(--accent)">Requires: ${card.requiredReaction}</div>`;
        }
        if (card.evolvesFromName) {
            html += `<div class="card-cost-text" style="color:var(--text-dim)">Evolves from ${card.evolvesFromName}</div>`;
        }
        if (openingLocked) {
            html += `<div class="card-cost-text" style="color:var(--accent)">Turn 1: placements only</div>`;
        }
        html += `</div>`; /* end ability area */

        html += `</div>`; /* end info panel */
        html += `</div>`; /* end hand-card */
    }

    container.innerHTML = html;
}

function renderLog() {
    const log = document.getElementById('gameLog');
    if (!gameState.gameLog) return;

    let html = '';
    for (const entry of gameState.gameLog) {
        html += `<div class="log-entry">${entry}</div>`;
    }
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
}

function renderBattlePanel() {
    const panel = document.getElementById('battleActionPanel');
    const pending = gameState.pendingBattle;

    if (!pending) {
        if (gameState.currentPhase === 'BATTLE' && gameState.battleWaitingOn === 'ENEMY') {
            if (isMobileLayout()) {
                mobileInfoTab = 'battle';
            }
            panel.innerHTML = 'Waiting for your opponent to choose a battle ability.';
            return;
        }
        panel.innerHTML = 'Start battle to choose abilities for your Sieglings.';
        return;
    }

    if (isMobileLayout()) {
        mobileInfoTab = 'battle';
    }

    let html = `<div class="battle-attacker"><strong>${pending.name}</strong> is acting.</div>`;
    if (targetMode && targetContext && targetContext.mode === 'battle') {
        html += `<div class="battle-hint">${targetContext.message}</div>`;
    } else {
        html += `<div class="battle-hint">Choose an ability to resolve.</div>`;
    }

    for (const ability of pending.abilities) {
        const disabled = ability.affordable ? '' : 'disabled';
        const label = `${ability.name} (${ability.requiredEnergy} ${ability.requiredElement || 'NEUTRAL'})`;
        html += `<button class="battle-ability-btn" ${disabled} onclick="chooseBattleAbility(${ability.index})">${label}</button>`;
        html += `<div class="battle-ability-desc">${ability.description}</div>`;
    }

    panel.innerHTML = html;
}

function chooseBattleAbility(index) {
    const pending = gameState.pendingBattle;
    if (!pending) return;

    const ability = pending.abilities.find(a => a.index === index);
    if (!ability || !ability.affordable) return;

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
        message: `Select a ${targetSide} target for ${ability.name}.`
    };
    render();
}

function boardHasTargets(side) {
    const board = side === 'enemy' ? gameState.enemyBoard : gameState.playerBoard;
    return board.some(row => row.some(cell => cell));
}

function getSelectedLegalPlacements() {
    if (gameState.playerPlacementUsed) {
        return [];
    }

    if (!selectedCard || selectedCard.type !== 'SIEGLING') {
        return gameState.legalPlacements || [];
    }

    const board = gameState.playerBoard;
    const placements = [];
    if (selectedCard.evolvesFromId) {
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const cell = board[row][col];
                if (cell && cell.cardId === selectedCard.evolvesFromId) {
                    placements.push([row, col]);
                }
            }
        }
        return placements;
    }

    const hasAnySiegling = board.some(row => row.some(cell => cell));

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            if (board[row][col]) continue;

            if (!hasAnySiegling || canSelectedCardLinkAt(row, col, board)) {
                placements.push([row, col]);
            }
        }
    }

    return placements;
}

function canSelectedCardLinkAt(row, col, board) {
    return selectedCard.notches.some(notch => {
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

function selectCard(cardId) {
    if (gameState.currentPhase !== 'SETUP') return;

    const card = gameState.player.hand.find(c => c.id === cardId);
    if (!card) return;
    if (isOpeningPlacementOnlyTurn() && card.type !== 'SIEGLING') return;

    if (selectedCard && selectedCard.id === cardId) {
        selectedCard = null;
        clearTargetMode();
        updateSelectedInfo(null);
        render();
        return;
    }

    selectedCard = card;
    clearTargetMode();

    if (isActionCard(card)) {
        if (abilityNeedsTarget(card.ability)) {
            targetMode = true;
            targetContext = {
                mode: 'spell',
                side: getAbilityTargetSide(card.ability),
                message: `Select a target for ${card.name}.`,
                callback: (row, col) => castSpell(card.id, row, col)
            };
            updateSelectedInfo(card, targetContext.message);
            render();
            return;
        } else {
            castSpell(card.id, -1, -1);
            return;
        }
    }

    updateSelectedInfo(card);
    render();
}

function isTargetCell(isPlayer, cell) {
    if (!targetMode || !targetContext || !cell) return false;
    if (targetContext.side === 'enemy') return !isPlayer;
    if (targetContext.side === 'ally') return isPlayer;
    return false;
}

function onTargetSelected(row, col) {
    if (!targetMode || !targetContext) return;

    if (targetContext.mode === 'battle') {
        submitBattleAction(targetContext.abilityIndex, row, col);
        return;
    }

    if (typeof targetContext.callback === 'function') {
        targetContext.callback(row, col);
    }
}

function onTrainerUse() {
    const trainer = gameState.player.trainer;
    if (!trainer || !trainer.active) return;
    if (isOpeningPlacementOnlyTurn()) return;

    if (abilityNeedsTarget(trainer.active)) {
        targetMode = true;
        targetContext = {
            mode: 'trainer',
            side: getAbilityTargetSide(trainer.active),
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
        el.innerHTML = 'Click a card in your hand to select it.';
        return;
    }

    if (isMobileLayout() && !gameState?.pendingBattle) {
        mobileInfoTab = 'selected';
    }

    let html = '';
    if (msg) {
        html += `<div style="color:var(--accent);font-weight:bold;margin-bottom:4px;">${msg}</div>`;
    }
    if (card) {
        html += `<strong>${card.name}</strong> (${card.type})<br>`;
        if (card.type === 'SIEGLING') {
            html += `HP:${card.health} ATK:${card.attack} DEF:${card.defense} SPD:${card.speed}<br>`;
            html += card.evolvesFromName
                ? `<span style="color:var(--accent)">Place this on top of ${card.evolvesFromName} to evolve it.</span>`
                : gameState.playerPlacementUsed
                ? '<span style="color:var(--accent)">You already placed your Siegling for this turn.</span>'
                : '<span style="color:var(--accent)">Highlighted bubbles show where this card can expand next.</span>';
        }
        if (card.ability) {
            html += `<em>${card.ability.description}</em><br>`;
        }
        if (card.evolvesFromName) {
            html += `Evolves from ${card.evolvesFromName}<br>`;
        }
        if (card.type === 'TRAP') {
            html += `Trigger: Opponent must have ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)} energy.<br>`;
        } else if (card.costElement && card.costAmount > 0) {
            html += `Play Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}<br>`;
        }
    }

    el.innerHTML = html;
}

function showTooltipBoard(event, isPlayer, row, col) {
    const board = isPlayer ? gameState.playerBoard : gameState.enemyBoard;
    const cell = board[row][col];
    if (!cell) return;

    const tt = document.getElementById('cardTooltip');
    document.getElementById('ttName').textContent = `${cell.name} (${cell.element})`;
    document.getElementById('ttName').style.color = getElementCssVar(cell.element);
    document.getElementById('ttStats').innerHTML =
        `<span class="stat stat-hp">HP: ${cell.hp}/${cell.maxHp}</span>` +
        `<span class="stat stat-atk">ATK: ${cell.atk}</span>` +
        `<span class="stat stat-def">DEF: ${cell.def}</span>` +
        `<span class="stat stat-spd">SPD: ${cell.spd}</span>`;
    document.getElementById('ttAbility').textContent = cell.ability || '';

    positionTooltip(event, tt);
    tt.classList.add('visible');
}

function showTooltipHand(event, cardId) {
    const card = gameState.player.hand.find(c => c.id === cardId);
    if (!card) return;

    const tt = document.getElementById('cardTooltip');
    document.getElementById('ttName').textContent = `${card.name} (${card.element})`;
    document.getElementById('ttName').style.color = getElementCssVar(card.element);

    let statsHtml = '';
    if (card.type === 'SIEGLING') {
        statsHtml =
            `<span class="stat stat-hp">HP: ${card.health}</span>` +
            `<span class="stat stat-atk">ATK: ${card.attack}</span>` +
            `<span class="stat stat-def">DEF: ${card.defense}</span>` +
            `<span class="stat stat-spd">SPD: ${card.speed}</span>`;
    }
    document.getElementById('ttStats').innerHTML = statsHtml;

    let abilityText = card.ability ? card.ability.description : '';
    if (card.type === 'TRAP') {
        abilityText += ` [Trigger: Opponent has ${card.trapBucketAmount} ${card.trapBucketElement}]`;
    } else if (card.costElement && card.costAmount > 0) {
        abilityText += ` [Play Cost: ${card.costAmount} ${card.costElement}]`;
    }
    if (card.evolvesFromName) {
        abilityText += ` [Evolves from ${card.evolvesFromName}]`;
    }
    if (card.requiredComboSize) {
        const comboLabel = card.requiredComboSignature
            ? card.requiredComboSignature.split('+').map(formatElementLabel).join(' + ')
            : `${card.requiredComboSize}-element combo`;
        abilityText += ` [Combo: ${comboLabel}]`;
    }
    document.getElementById('ttAbility').textContent = abilityText;

    positionTooltip(event, tt);
    tt.classList.add('visible');
}

function positionTooltip(event, tt) {
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

function getElementCssVar(element) {
    switch (element) {
        case 'FIRE': return 'var(--fire)';
        case 'EARTH': return 'var(--earth)';
        case 'WIND': return 'var(--wind)';
        case 'WATER': return 'var(--water)';
        case 'SHADOW': return 'var(--shadow)';
        case 'ELECTRIC': return 'var(--electric)';
        default: return 'var(--neutral)';
    }
}

function clearTargetMode() {
    targetMode = false;
    targetContext = null;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        selectedCard = null;
        clearTargetMode();
        updateSelectedInfo(null);
        render();
    }
});

window.addEventListener('resize', syncMobileInfoTab);

loadGameOptions();
