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
let selectedBuilderPreviewId = null;
let matchMode = 'solo';
let onlineRoomMode = 'create';
let multiplayerSession = loadSavedMultiplayerSession();
let roomPollHandle = null;
let currentRoomStatus = null;
let mobileInfoTab = 'battle';
let mulliganSelectedIndices = new Set();
let mulliganHandSig = '';
let loadoutErrorMessage = '';
let loadoutStartPending = false;
let lastInteractionCueKey = '';
let hoveredHandCardId = null;
let hoveredBoardCard = null;
let pendingClaimTarget = null;
let lastRenderedPhase = null;
let phaseTransitionTimer = null;
let handTouchGesture = null;
let handAutoScrollFrame = null;
let handAutoScrollDirection = 0;
let handTouchSuppressCardId = null;
let handTouchSuppressUntil = 0;
let lastViewportSignature = '';
const PLAYER_NAME_STORAGE_KEY = 'sieglingsPlayerName';
const AUTH_TOKEN_STORAGE_KEY = 'sieglingsAuthToken';
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const LOADOUT_ACTION_TIMEOUT_MS = 90000;
let welcomeSlideIndex = 0;
let welcomeDismissed = false;
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
    SINGLE_ALLY: 'ally'
};
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
const CARD_ART_BY_KEY = Object.freeze({
    sundile: { url: '/assets/cards/sundile.svg' },
    staticap: {
        url: '/images/cards/Staticap.png',
        crop: 'illustration'
    }
});
const WELCOME_SLIDES = [
    {
        title: '1. Place one Siegling during setup',
        copy: 'Each setup turn starts with fresh energy. Place a Siegling to claim space, then decide whether your remaining energy should become spells, traps, or trainer pressure.',
        visual: `
            <div class="tutorial-visual tutorial-board">
                <div class="tutorial-board-grid">
                    <div class="tutorial-slot"></div>
                    <div class="tutorial-slot"></div>
                    <div class="tutorial-slot"></div>
                    <div class="tutorial-slot active"><span>F</span></div>
                    <div class="tutorial-slot"></div>
                    <div class="tutorial-slot"></div>
                    <div class="tutorial-slot"></div>
                    <div class="tutorial-slot"></div>
                    <div class="tutorial-slot"></div>
                </div>
                <div class="tutorial-caption">One placement creates your anchor point for the turn.</div>
            </div>
        `
    },
    {
        title: '2. Matching notches grow your network',
        copy: 'A new Siegling expands only when its notch meets an opposite notch on a neighbor. Matching these links creates the pathways that power your later actions.',
        visual: `
            <div class="tutorial-visual tutorial-links">
                <div class="tutorial-card fire left"><span></span></div>
                <div class="tutorial-link fire"></div>
                <div class="tutorial-card earth right"><span></span></div>
                <div class="tutorial-caption">Matched sides create a live elemental connection.</div>
            </div>
        `
    },
    {
        title: '3. Edge sockets generate outside energy',
        copy: 'Perimeter sockets only light up when the card on that edge points directly into them. Wake sockets on the board edge to stock your energy pool.',
        visual: `
            <div class="tutorial-visual tutorial-sockets">
                <div class="tutorial-socket-ring left"></div>
                <div class="tutorial-socket-ring right active electric"></div>
                <div class="tutorial-card electric edge"><span></span></div>
                <div class="tutorial-socket-link electric"></div>
                <div class="tutorial-caption">Only the outward-facing notch for that edge activates the socket.</div>
            </div>
        `
    },
    {
        title: '4. Setup spends energy, battle refreshes it',
        copy: 'Spells and traps drain your setup pool, so you cannot spam them. When battle starts, energy restores and your linked board turns into live attacks and abilities.',
        visual: `
            <div class="tutorial-visual tutorial-phase">
                <div class="tutorial-phase-pill">Setup</div>
                <div class="tutorial-energy-row">
                    <span class="tutorial-energy fire"></span>
                    <span class="tutorial-energy fire"></span>
                    <span class="tutorial-energy earth"></span>
                    <span class="tutorial-energy empty"></span>
                </div>
                <div class="tutorial-phase-arrow"></div>
                <div class="tutorial-phase-pill battle">Battle</div>
                <div class="tutorial-energy-row">
                    <span class="tutorial-energy fire"></span>
                    <span class="tutorial-energy fire"></span>
                    <span class="tutorial-energy earth"></span>
                    <span class="tutorial-energy wind"></span>
                </div>
                <div class="tutorial-caption">Spend carefully in setup, then swing hard in battle.</div>
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
    getCardAbilities(card).forEach(ability => {
        const text = formatAbilitySummaryText(ability);
        if (text) {
            entries.push({ text, className: 'card-detail' });
        }
    });

    if (card.type === 'TRAP' && card.trapBucketElement) {
        entries.push({
            text: `Trigger: Opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)}`,
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
    const classes = ['hand-card', elemClass, options.cardClass].filter(Boolean).join(' ');
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
        if (statLine) {
            html += `<div class="card-detail card-stats-line">${escapeHtml(statLine)}</div>`;
        }
        visibleDetailEntries.forEach(entry => {
            html += `<div class="${entry.className}">${escapeHtml(entry.text)}</div>`;
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
    for (const baseUrl of [activeApiBaseUrl, API_BASE_URL, '']) {
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
    const sidebarWidth = desktop
        ? Math.round(clampNumber(viewportWidth * 0.29, 360, Math.min(520, viewportWidth * 0.38)))
        : 420;
    const handWidth = desktop
        ? Math.round(clampNumber(Math.min(sidebarWidth * 0.185, viewportHeight * 0.084), 66, 88))
        : compactLandscape
        ? Math.round(clampNumber(viewportHeight * 0.18, 64, 78))
        : Math.round(clampNumber(Math.min(viewportWidth * 0.16, viewportHeight * 0.19), 52, 138));
    const desktopHandSectionMinHeight = desktop
        ? Math.round(clampNumber((handWidth * cardAspectHeight) + 60, 156, viewportHeight * 0.26))
        : 176;
    const previewCardWidth = desktop
        ? Math.round(clampNumber(Math.min(sidebarWidth * 0.35, viewportHeight * 0.18), 136, 184))
        : Math.round(clampNumber(viewportWidth * 0.38, 152, 220));
    const previewCardMaxHeight = desktop
        ? Math.round(clampNumber(viewportHeight * 0.29, 176, 286))
        : Math.round(clampNumber(viewportHeight * 0.68, 180, 420));
    const overlayWidth = Math.round(clampNumber(viewportWidth * 0.92, 320, 1180));
    const overlayPadding = Math.round(clampNumber(Math.min(viewportWidth, viewportHeight) * 0.026, 14, 28));

    root.style.setProperty('--card-scale', density.toFixed(3));
    root.style.setProperty('--desktop-sidebar-width', `${sidebarWidth}px`);
    root.style.setProperty('--desktop-preview-card-width', `${previewCardWidth}px`);
    root.style.setProperty('--desktop-preview-card-max-height', `${previewCardMaxHeight}px`);
    root.style.setProperty('--desktop-hand-section-min-height', `${desktopHandSectionMinHeight}px`);
    root.style.setProperty('--hand-card-width', `${handWidth}px`);
    root.style.setProperty('--hand-card-overlap', desktop ? '0px' : `${-Math.round(handWidth * 0.25)}px`);
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
    return isDesktopSidebarLayout();
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

    const abilities = getCardAbilities(card);
    if (abilities.length > 0) {
        html += `<div class="ci-ability">${abilities.map(a => escapeHtml(formatAbilitySummaryText(a))).join('<br>')}</div>`;
    }

    if (card.type === 'TRAP' && card.trapBucketElement) {
        html += `<div class="ci-ability">Trigger: Opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)}</div>`;
    } else if (card.costElement && card.costAmount > 0) {
        html += `<div class="ci-ability">Play Cost: ${card.costAmount} ${formatElementLabel(card.costElement)}</div>`;
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
    if (hoveredBoardCard) {
        return hoveredBoardCard;
    }
    const hoveredCard = gameState?.player?.hand?.find(card => card.id === hoveredHandCardId) || null;
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
        const lockReason = getHandCardLockReason(focusedCard);
        if (lockReason) {
            hints.push(lockReason);
        } else if (focusedCard.type === 'SIEGLING') {
            if (focusedCard.evolvesFromName) {
                hints.push(`Play this on top of ${focusedCard.evolvesFromName} to evolve it.`);
            } else if (gameState?.currentPhase === 'SETUP' && !gameState?.playerPlacementUsed) {
                hints.push('Highlighted slots show where this Siegling can be placed.');
            }
        } else if (focusedCard.type === 'TRAP') {
            hints.push('Traps stay hidden until their trigger condition is met.');
        } else if (focusedCard.costElement && focusedCard.costAmount > 0) {
            hints.push(`This costs ${focusedCard.costAmount} ${formatElementLabel(focusedCard.costElement)} to play.`);
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
            <div class="hint-drawer-copy">Select or hover a card to see contextual help.</div>
            <div class="hint-list">
                <div class="hint-item">The eye button lights up when a focused card preview is ready.</div>
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
        return 'Hover or select a hand card to inspect it here.';
    }
    if (card.type === 'SIEGLING') {
        if (card.evolvesFromName) {
            return `Place this on top of ${card.evolvesFromName} to evolve it.`;
        }
        if (gameState?.playerPlacementUsed) {
            return 'You already placed your Siegling for this turn.';
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
    return 'Use the hand selector to keep swapping the highlighted preview card.';
}

function isPlayerHandCard(card) {
    return Boolean(card && gameState?.player?.hand?.some(handCard => handCard.id === card.id));
}

function getFocusedCardSummary(card, lockReason) {
    if (!card) {
        return 'Hover a hand or board card to inspect live costs, lock reasons, and setup timing.';
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
        return gameState?.playerPlacementUsed
            ? 'Placement is already spent this turn.'
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

    const entries = Array.isArray(gameState?.gameLog) ? gameState.gameLog.slice(0, 3) : [];
    if (entries.length === 0) {
        history.innerHTML = '<div class="desktop-history-empty">Latest actions appear here once the match starts.</div>';
        return;
    }

    history.innerHTML = entries.map((entry, index) => `
        <div class="desktop-history-entry${index === 0 ? ' current' : ''}">
            <span class="desktop-history-dot"></span>
            <span>${escapeHtml(entry)}</span>
        </div>
    `).join('');
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
        panel.innerHTML = '<div class="desktop-empty-state">Hover a board card or select a hand card to inspect it here.</div>';
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
    html += `<div class="desktop-preview-description">${escapeHtml(summaryText)}</div>`;
    if (detailEntries.length > 0) {
        html += '<div class="desktop-preview-tag-list">';
        detailEntries.forEach(entry => {
            html += `<div class="desktop-preview-tag">${escapeHtml(entry.text)}</div>`;
        });
        html += '</div>';
    }
    html += `<div class="desktop-preview-note">${escapeHtml(getDesktopPreviewNote(focusedCard, lockReason))}</div>`;
    html += '</div>';
    html += '</div>';

    panel.innerHTML = html;
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

    welcomeOverlay?.classList.toggle('visible', !showingGameplay && !welcomeDismissed);
    loadoutOverlay?.classList.toggle('visible', !showingGameplay && welcomeDismissed);
    if (!gameState?.mulligan?.active) {
        mulliganOverlay?.classList.remove('visible');
    }
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
    authState.loading = true;
    authState.error = '';
    renderWelcomeAuth();

    const body = mode === 'register'
        ? { email, password, displayName }
        : { email, password };
    const data = await fetchJson(apiUrls(`/api/auth/${mode}`), {
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

    authCard.innerHTML = `
        <div class="welcome-auth-tabs">
            <button class="welcome-auth-tab${authMode === 'login' ? ' active' : ''}" type="button" onclick="setAuthMode('login')">Log In</button>
            <button class="welcome-auth-tab${authMode === 'register' ? ' active' : ''}" type="button" onclick="setAuthMode('register')">Register</button>
        </div>
        <div class="welcome-card-kicker">Account</div>
        <h3>${authMode === 'login' ? 'Pick up where you left off' : 'Save decks with your email'}</h3>
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
        <label class="online-field">
            <span>Password</span>
            <input type="password" id="welcomePasswordInput" placeholder="At least 6 characters" value="${escapeHtmlAttribute(draftPassword)}">
        </label>
        ${authState.error ? `<div class="welcome-auth-error">${escapeHtml(authState.error)}</div>` : ''}
        <div class="welcome-auth-actions">
            <button class="btn btn-primary" type="button" ${authState.loading ? 'disabled' : ''} onclick="submitAuth('${authMode}')">
                ${authState.loading ? 'Working...' : (authMode === 'login' ? 'Log In' : 'Create Account')}
            </button>
            <button class="btn" type="button" ${authState.loading ? 'disabled' : ''} onclick="playAsGuest()">Play as Guest</button>
        </div>
    `;

    historyCard.innerHTML = `
        <div class="welcome-card-kicker">Why Sign In</div>
        <h3>Keep your armory between sessions</h3>
        <div class="welcome-benefits">
            <div class="welcome-benefit">Save custom decks and named preset loadouts.</div>
            <div class="welcome-benefit">See your recent wins, losses, and deck history.</div>
            <div class="welcome-benefit">Load the same builds again after you log back in.</div>
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
    return Boolean(gameState && gameState.currentPhase === 'BATTLE');
}

function isPlacementSelectionActive() {
    return Boolean(
        gameState
        && gameState.currentPhase === 'SETUP'
        && selectedCard
        && selectedCard.type === 'SIEGLING'
        && !gameState.playerPlacementUsed
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
            if (cell && cell.cardId === card.evolvesFromId) {
                placements.push([row, col]);
            }
        }
    }
    return placements;
}

function getLegalPlacementsForCard(card, board = gameState?.playerBoard || []) {
    if (gameState?.playerPlacementUsed || !card || card.type !== 'SIEGLING') {
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

function getHandCardLockReason(card) {
    if (!gameState || !card) {
        return '';
    }
    if (gameState.currentPhase === 'MULLIGAN') {
        return 'Choose cards to redraw (optional) or keep your opening hand.';
    }
    if (isHandHiddenForPhase()) {
        return 'Hand hidden during battle.';
    }
    if (targetMode) {
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
    if (isActionCard(card) && !abilityHasAvailableTarget(card.ability)) {
        const targetSide = getAbilityTargetSide(card.ability);
        return targetSide ? `No ${targetSide} targets are available right now.` : 'This card has no valid target right now.';
    }
    if (gameState.playerPlacementUsed && card.type === 'SIEGLING') {
        return 'You already played a Siegling this turn.';
    }
    if (card.type === 'SIEGLING' && card.evolvesFromId && getEvolutionPlacements(card).length === 0) {
        return `Needs ${card.evolvesFromName || 'its base form'} on your board first.`;
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
            label: 'Placement Used',
            message: 'Your Siegling play is spent for this turn. Use spells, traps, or your trainer next.'
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
            label: 'Battle Phase',
            message: gameState.pendingBattle
                ? 'Choose a battle ability for the acting Siegling. Use the Battle button to reopen the speed queue if needed.'
                : 'Battle is resolving in speed order. Your hand is hidden until the next setup turn.'
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

    body.classList.toggle('targeting-active', targetingActive);
    body.classList.toggle('placement-active', placementActive);
    body.classList.toggle('battle-phase-active', handHidden);

    boardArea?.classList.toggle('targeting-active', targetingActive);
    boardArea?.classList.toggle('placement-active', placementActive);

    handArea?.classList.toggle('battle-hidden', handHidden);
    handArea?.classList.toggle('interaction-locked', targetingActive);

    renderInteractionBanner();
    renderHintPanel();
    syncActionBarAttention();
    maybeTriggerInteractionFeedback();
}

function resetInteractionState(shouldRender = true) {
    selectedCard = null;
    hoveredBoardCard = null;
    closeClaimPopup();
    clearTargetMode();
    updateSelectedInfo(null);
    if (shouldRender) {
        render();
    }
}

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
        return null;
    }
    if (data.error) {
        console.error(data.error);
        return null;
    }

    gameState = data;
    render();
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
        const [data] = await Promise.all([
            fetchJson(apiUrls('/api/game/options'), {}, LOADOUT_ACTION_TIMEOUT_MS),
            syncAuthProfile(true)
        ]);
        if (!data) {
            showLoadoutLoadingError('Unable to load deck and SiegeKnight choices. The backend is unavailable right now. Press retry once it comes back.');
            syncEntryOverlays();
            return;
        }
        gameOptions = data;
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

async function newGame() {
    clearMultiplayerSession();
    selectedCard = null;
    clearTargetMode();
    document.getElementById('gameOverOverlay').classList.remove('visible');
    const body = getSelectedLoadoutBody();
    const started = await api('new', 'POST', body, LOADOUT_ACTION_TIMEOUT_MS);
    if (!started) {
        return;
    }
}

function openLoadoutSelector() {
    clearMultiplayerSession();
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

    deckEl.innerHTML = gameOptions.decks.map(deck => {
        const selected = deck.id === selectedDeckId ? ' selected' : '';
        const bg = buildDeckBackground(deck.elements);
        const borderColor = buildDeckBorderColors(deck.elements);
        const elementLabels = deck.elements.map(formatElementLabel).join(' / ');
        const elClasses = deck.elements.map(e => 'el-' + e.toLowerCase()).join(' ');

        /* Build spine bands â€“ each element gets its own colored band with a sigil inside */
        const spineBands = deck.elements.map(el => {
            const c = getElementHex(el);
            return `<div class="spine-band" style="background:${c}"></div>`;
        }).join('');
        const faceSigils = buildDeckFaceSigils(deck.elements);

        return `<button class="deck-card${selected} ${elClasses}" style="--deck-bg:${bg};--deck-border:${borderColor}" onclick="selectDeckOption('${deck.id}')">
            <div class="deck-card-spine">${spineBands}</div>
            ${faceSigils}
            <div class="deck-card-body">
                <span class="deck-card-name">${deck.name}</span>
                <span class="deck-card-elements">${elementLabels}</span>
                <span class="deck-card-desc">${deck.description}</span>
            </div>
        </button>`;
    }).join('');

    trainerEl.innerHTML = gameOptions.trainers.map(trainer => {
        const selected = trainer.id === selectedTrainerId ? ' selected' : '';
        const elHex = getElementHex(trainer.element);
        const sigil = getTrainerSigil(trainer);
        const rarityClass = (trainer.rarity || 'common').toLowerCase();
        const tier = formatTrainerTier(trainer.tier);
        const activeLabel = trainer.oncePerGame ? 'Ultimate' : 'Active';
        return `<button class="knight-card${selected} el-${trainer.element.toLowerCase()}" style="--knight-color:${elHex}" onclick="selectTrainerOption('${trainer.id}')">
            <div class="knight-card-sigil">${sigil}</div>
            <div class="knight-card-portrait">
                <div class="knight-card-icon">${getElementSigil(trainer.element)}</div>
            </div>
            <div class="knight-card-body">
                <span class="knight-card-name">${trainer.name}</span>
                <span class="knight-card-meta"><span class="knight-element">${formatElementLabel(trainer.element)}</span> <span class="knight-tier tier-${tier.toLowerCase()}">${tier}</span> <span class="knight-rarity rarity-${rarityClass}">${trainer.rarity}</span></span>
                <span class="knight-card-ability">Passive: ${trainer.passive || 'None'}</span>
                <span class="knight-card-ability">${activeLabel}: ${trainer.active || 'None'}</span>
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
        loadoutKicker.textContent = 'Before the Match';
        loadoutTitle.textContent = 'Choose Your Loadout';
        loadoutSubtitle.textContent = 'Pick a preset deck or build your own custom list from the full seven-element card pool, then choose a SiegeKnight.';
        inviteRoomBadge.classList.add('hidden');
        playerIdentityNote.textContent = 'Set your online display name now so it is ready when you host or join later.';
    }

    soloMatchTab.classList.toggle('active', matchMode === 'solo');
    onlineMatchTab.classList.toggle('active', matchMode === 'online');
    soloMatchTab.classList.toggle('hidden', inviteFlow);
    onlineMatchTab.classList.toggle('hidden', inviteFlow);
    onlineMatchPanel.classList.toggle('hidden', matchMode !== 'online');
    hostRoomTab.classList.toggle('active', onlineRoomMode === 'create');
    joinRoomTab.classList.toggle('active', onlineRoomMode === 'join');
    hostRoomTab.classList.toggle('hidden', inviteFlow);
    joinRoomTab.classList.toggle('hidden', inviteFlow);
    roomCodeField.classList.toggle('hidden', inviteFlow || onlineRoomMode !== 'join');

    presetTab.classList.toggle('active', loadoutMode === 'preset');
    builderTab.classList.toggle('active', loadoutMode === 'builder');
    presetPanel.classList.toggle('hidden', loadoutMode !== 'preset');
    builderPanel.classList.toggle('hidden', loadoutMode !== 'builder');
    renderDeckBuilder();
    renderOnlineStatus();
    renderSavedDecks();
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
    return 'Start Match';
}

function getLoadoutStartButtonBusyLabel() {
    if (matchMode === 'online') {
        return onlineRoomMode === 'create' ? 'Creating Room...' : (isInviteJoinFlow() ? 'Joining Match...' : 'Joining Room...');
    }
    return 'Starting Match...';
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
    if (card.ability?.description) {
        html += `<div class="card-detail">${card.ability.description}</div>`;
    }
    if (card.type === 'TRAP' && card.trapBucketElement) {
        html += `<div class="card-cost">Trigger: Opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)}</div>`;
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
    closeClaimPopup();
    closeTrainerAbilityPopup();
    clearTargetMode();
    openBattlePanel(true);
}

function openBattlePanel(forceOpen = false) {
    renderBattlePanel();
    if (activeDrawer === 'battle') {
        if (forceOpen) {
            return;
        }
        closeDrawer();
        return;
    }
    openDrawer('battle');
}

async function endTurn() {
    selectedCard = null;
    closeClaimPopup();
    clearTargetMode();
    await api('endturn');
}

async function placeCard(row, col) {
    if (!selectedCard) return;
    const data = await api('place', 'POST', { cardId: selectedCard.id, row, col });
    if (!data) return;
    resetInteractionState();
}

async function claimBoardCard(row, col) {
    clearTargetMode();
    const data = await api('claim', 'POST', { row, col });
    if (!data) return;
    resetInteractionState();
}

async function castSpell(cardId, targetRow, targetCol) {
    const data = await api('cast', 'POST', { cardId, targetRow, targetCol });
    if (!data) return;
    resetInteractionState();
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
    const data = await api('battle/action', 'POST', { abilityIndex, targetRow, targetCol });
    if (!data) return;
    resetInteractionState();
}

function render() {
    if (!gameState) return;
    updateResponsiveLayoutVars();

    const phase = gameState.currentPhase;
    const previousPhase = lastRenderedPhase;
    const phaseChanged = Boolean(previousPhase && previousPhase !== phase);
    lastRenderedPhase = phase;

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
    const btnTrainerAbility = document.getElementById('btnTrainerAbility');
    const btnEndTurn = document.getElementById('btnEndTurn');
    const battlePhaseActive = phase === 'BATTLE' && !over;
    btnDraw.disabled = over || !playerActive || phase !== 'DRAW';
    btnEndTurn.disabled = over || !playerActive || phase !== 'SETUP';
    btnDraw.classList.toggle('hidden', battlePhaseActive);
    btnBattle.classList.toggle('hidden', !battlePhaseActive);

    const playerBattlePending = phase === 'BATTLE'
        && gameState.pendingBattle
        && gameState.battleWaitingOn === 'PLAYER';
    const enemyBattlePending = phase === 'BATTLE' && gameState.battleWaitingOn === 'ENEMY';
    let battleLabel = 'Auto Battle';
    let battleTitle = 'Battle starts automatically after both players finish Setup. Use this to review the speed queue.';
    if (phase === 'BATTLE') {
        if (playerBattlePending) {
            battleLabel = 'Act Now';
            battleTitle = 'Open the battle action list for the Siegling that is currently acting by speed.';
        } else if (enemyBattlePending) {
            battleLabel = 'Enemy Acts';
            battleTitle = 'Open battle status while the opponent resolves the current speed action.';
        } else {
            battleLabel = 'Battle Live';
            battleTitle = 'Open battle status. Sieglings resolve abilities in speed order until the phase ends.';
        }
    }
    btnBattle.disabled = over;
    btnBattle.textContent = battleLabel;
    btnBattle.title = battleTitle;
    btnBattle.setAttribute('aria-label', battleTitle);
    btnBattle.classList.toggle('ab-urgent', playerBattlePending);

    // Highlight the active phase button
    btnDraw.classList.toggle('ab-active', phase === 'DRAW' && playerActive && !over);
    btnBattle.classList.toggle('ab-active', phase === 'BATTLE' && !over);
    btnEndTurn.classList.toggle('ab-active', phase === 'SETUP' && playerActive && !over);

    document.getElementById('playerHealth').textContent = gameState.player.health;
    document.getElementById('enemyHealth').textContent = gameState.enemy.health;

    renderEnergyTopBar('playerEnergy', gameState.player);
    renderEnergyTopBar('enemyEnergy', gameState.enemy);

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
        btnTrainerAbility.textContent = trainer?.tier === 'SiegeLord' ? 'Lord' : 'Knight';
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
            const isTargetable = isTargetCell(isPlayer, cell);
            const isActing = gameState.pendingBattle && cell && gameState.pendingBattle.instanceId === cell.instanceId;
            const isClaimable = isPlayer && cell && claimableSieglings.some(p => p[0] === r && p[1] === c);

            let classes = 'board-cell';
            if (isLegal) classes += ' legal';
            if (cell) classes += ' has-card';
            if (isTargetable) classes += ' targetable';
            if (isActing) classes += ' active-attacker';
            if (isClaimable) classes += ' claimable';

            let events = '';
            if (isLegal) {
                events = `onclick="placeCard(${r}, ${c})" ontouchend="handleBoardCellTouch(event, ${isPlayer}, ${r}, ${c})"`;
            } else if (isTargetable) {
                events = `onclick="onTargetSelected(${r}, ${c})" ontouchend="handleBoardCellTouch(event, ${isPlayer}, ${r}, ${c})"`;
            } else if (isClaimable) {
                events = `onclick="openClaimPopup(${r}, ${c})" ontouchend="handleBoardCellTouch(event, ${isPlayer}, ${r}, ${c})" onmouseenter="handleBoardCardPointerEnter(${isPlayer}, ${r}, ${c});showTooltipBoard(event, ${isPlayer}, ${r}, ${c})" onmouseleave="handleBoardCardPointerLeave(${isPlayer}, ${r}, ${c});hideTooltip()"`;
            } else if (cell) {
                events = `onmouseenter="handleBoardCardPointerEnter(${isPlayer}, ${r}, ${c});showTooltipBoard(event, ${isPlayer}, ${r}, ${c})" onmouseleave="handleBoardCardPointerLeave(${isPlayer}, ${r}, ${c});hideTooltip()"`;
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
                    html += `<div class="claim-prompt">Claim</div>`;
                }
                html += renderBoardNotches(cell.notches, { board, row: r, col: c, isPlayer, legalPlacements });
                html += renderCardArt(cell, 'board');
                html += `<div class="bc-inner">`;
                html += `<div class="bc-name-box"><span class="card-name">${cell.name}</span></div>`;
                if (cell.statuses && cell.statuses.length > 0) {
                    html += `<div class="status-icons">${cell.statuses.join(' ')}</div>`;
                }
                html += `<div class="bc-stats-box">`;
                html += `<div class="hp-bar"><div class="hp-fill" style="width:${(cell.hp / cell.maxHp) * 100}%"></div></div>`;
                html += `<div class="card-stats">`;
                html += `<span class="stat stat-hp">${cell.hp}/${cell.maxHp}</span>`;
                html += `<span class="stat stat-spd">${cell.spd}</span>`;
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
}

function renderLinkConnectors(gridId, board, isPlayer) {
    const grid = document.getElementById(gridId);
    grid.querySelectorAll('.link-connector, .external-energy-point').forEach(el => el.remove());

    const rowOrder = isPlayer ? [2, 1, 0] : [0, 1, 2];
    const links = [];
    const activeExternalSockets = new Map();
    const cellRefs = new Map();

    for (let displayRow = 0; displayRow < rowOrder.length; displayRow++) {
        const boardRow = rowOrder[displayRow];
        for (let col = 0; col < 3; col++) {
            const cellEl = grid.children[displayRow * 3 + col];
            if (cellEl) {
                cellRefs.set(`${boardRow}:${col}`, cellEl);
            }
        }
    }

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

    const gridRect = grid.getBoundingClientRect();

    for (const link of links) {
        const fromCell = cellRefs.get(`${link.fromRow}:${link.fromCol}`);
        const toCell = cellRefs.get(`${link.toRow}:${link.toCol}`);
        if (!fromCell || !toCell) continue;

        const fromRect = fromCell.getBoundingClientRect();
        const toRect = toCell.getBoundingClientRect();

        const fromX = fromRect.left + fromRect.width / 2 - gridRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - gridRect.top;
        const toX = toRect.left + toRect.width / 2 - gridRect.left;
        const toY = toRect.top + toRect.height / 2 - gridRect.top;

        const dx = link.toCol - link.fromCol;
        const dy = link.toRow - link.fromRow;
        const isHorizontal = dy === 0;
        const isVertical = dx === 0;
        const fromGridRow = rowOrder.indexOf(link.fromRow);
        const toGridRow = rowOrder.indexOf(link.toRow);

        let startX, startY, endX, endY;
        if (isHorizontal) {
            startX = Math.min(fromRect.right, toRect.right) - gridRect.left;
            endX = Math.max(fromRect.left, toRect.left) - gridRect.left;
            if (dx > 0) { startX = fromRect.right - gridRect.left; endX = toRect.left - gridRect.left; }
            else { startX = toRect.right - gridRect.left; endX = fromRect.left - gridRect.left; }
            startY = fromY;
            endY = toY;
        } else if (isVertical) {
            startX = fromX;
            endX = toX;
            const fromBottom = fromRect.bottom - gridRect.top;
            const toTop = toRect.top - gridRect.top;
            const fromTop = fromRect.top - gridRect.top;
            const toBottom = toRect.bottom - gridRect.top;
            if (fromGridRow < toGridRow) { startY = fromBottom; endY = toTop; }
            else { startY = toBottom; endY = fromTop; }
        } else {
            startX = dx > 0 ? fromRect.right - gridRect.left : fromRect.left - gridRect.left;
            endX = dx > 0 ? toRect.left - gridRect.left : toRect.right - gridRect.left;
            startY = fromGridRow < toGridRow ? fromRect.bottom - gridRect.top : fromRect.top - gridRect.top;
            endY = fromGridRow < toGridRow ? toRect.top - gridRect.top : toRect.bottom - gridRect.top;
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

        const cellRect = cellEl.getBoundingClientRect();
        const point = getExternalSocketPoint(gridRect, cellRect, socket.side);
        const activeSocket = activeExternalSockets.get(socket.key);

        if (activeSocket) {
            const anchor = getCellEdgeAnchor(gridRect, cellRect, activeSocket.direction);
            appendExternalLink(grid, anchor, point, getElementHex(activeSocket.element));
        }

        appendExternalEnergyPoint(grid, point, activeSocket?.element || null);
    }
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

function getCellEdgeAnchor(gridRect, cellRect, direction) {
    const centerX = cellRect.left + cellRect.width / 2 - gridRect.left;
    const centerY = cellRect.top + cellRect.height / 2 - gridRect.top;
    switch (direction) {
        case 'LEFT':
            return { x: cellRect.left - gridRect.left, y: centerY };
        case 'RIGHT':
            return { x: cellRect.right - gridRect.left, y: centerY };
        case 'TOP':
            return { x: centerX, y: cellRect.top - gridRect.top };
        case 'BOTTOM':
            return { x: centerX, y: cellRect.bottom - gridRect.top };
        default:
            return { x: centerX, y: centerY };
    }
}

function getExternalSocketPoint(gridRect, cellRect, side) {
    const centerX = cellRect.left + cellRect.width / 2 - gridRect.left;
    const centerY = cellRect.top + cellRect.height / 2 - gridRect.top;
    const offset = Math.max(12, Math.round(Math.min(cellRect.width, cellRect.height) * 0.12));

    switch (side) {
        case 'left':
            return { x: cellRect.left - gridRect.left - offset, y: centerY };
        case 'right':
            return { x: cellRect.right - gridRect.left + offset, y: centerY };
        case 'top':
            return { x: centerX, y: cellRect.top - gridRect.top - offset };
        case 'bottom':
            return { x: centerX, y: cellRect.bottom - gridRect.top + offset };
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
    if (isHandHiddenForPhase()) {
        container.innerHTML = '<div class="hand-phase-mask">Hand hidden during battle phase. Resolve battle actions to see your hand again.</div>';
        return;
    }
    if (!gameState.player.hand || gameState.player.hand.length === 0) {
        container.innerHTML = '<div style="color:var(--text-dim);font-size:0.8em;">No cards in hand</div>';
        return;
    }

    let html = '';
    for (const card of gameState.player.hand) {
        const elemClass = card.element.toLowerCase();
        const isSelected = selectedCard && selectedCard.id === card.id;
        const lockReason = getHandCardLockReason(card);
        const openingLocked = isOpeningPlacementOnlyTurn() && card.type !== 'SIEGLING';
        const placementLocked = gameState.playerPlacementUsed && card.type === 'SIEGLING';
        const interactionClass = [
            isSelected ? ' selected' : '',
            lockReason ? ' interaction-locked' : '',
            openingLocked ? ' opening-locked' : '',
            placementLocked ? ' placement-locked' : '',
            targetMode ? ' target-lock' : ''
        ].join('');
        const onclick = `onclick="selectCard('${card.id}')"`
        const hoverEvents = `onmouseenter="handleHandCardPointerEnter(event, '${card.id}')" onmouseleave="handleHandCardPointerLeave('${card.id}')"`;
        const touchEvents = `ontouchstart="handleHandCardTouchStart(event, '${card.id}')" ontouchmove="handleHandCardTouchMove(event, '${card.id}')" ontouchend="handleHandCardTouchEnd(event, '${card.id}')"`;
        const fallbackArtLabel = card.type === 'SIEGLING'
            ? formatElementLabel(card.element)
            : `${formatElementLabel(card.element)} ${card.type}`.trim();
        html += `<div class="hand-card ${elemClass}${interactionClass}" data-card-id="${escapeHtml(card.id)}" ${onclick} ${hoverEvents} ${touchEvents}>`;
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
        if (card.ability?.description) {
            html += `<div class="card-detail">${escapeHtml(card.ability.description)}</div>`;
        }
        if (card.type === 'TRAP' && card.trapBucketElement) {
            html += `<div class="card-cost">Trigger: Opponent has ${card.trapBucketAmount} ${formatElementLabel(card.trapBucketElement)}</div>`;
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
}

function handleHandCardPointerEnter(event, cardId) {
    if (isMobileLayout()) {
        return;
    }
    hoveredHandCardId = cardId;
    updateHandLiftLayer();
    syncFocusedCardUi();
    showTooltipHand(event, cardId);
}

function handleHandCardPointerLeave(cardId) {
    if (isMobileLayout()) {
        return;
    }
    if (hoveredHandCardId === cardId) {
        hoveredHandCardId = null;
    }
    updateHandLiftLayer();
    syncFocusedCardUi();
    hideTooltip();
}

function handleHandCardTouchStart(event, cardId) {
    if (!isMobileLayout()) {
        return;
    }
    const touch = event.changedTouches?.[0];
    if (!touch) {
        return;
    }
    handTouchGesture = {
        cardId,
        x: touch.clientX,
        y: touch.clientY,
        moved: false
    };
}

function handleHandCardTouchMove(event, cardId) {
    if (!isMobileLayout() || !handTouchGesture || handTouchGesture.cardId !== cardId) {
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

function handleHandCardTouchEnd(event, cardId) {
    if (!isMobileLayout()) {
        return;
    }
    const shouldSelect = Boolean(handTouchGesture && handTouchGesture.cardId === cardId && !handTouchGesture.moved);
    handTouchGesture = null;
    if (!shouldSelect) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectCard(cardId);
    handTouchSuppressCardId = cardId;
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
        const selected = mulliganSelectedIndices.has(index) ? ' mulligan-card-selected' : '';
        const interactive = gameState.mulligan.youPending ? ' role="button" tabindex="0"' : '';
        const click = gameState.mulligan.youPending ? ` onclick="toggleMulliganCard(${index})"` : '';
        return `
        <div class="mulligan-card ${card.element.toLowerCase()}${selected}"${interactive}${click}>
            <div class="mulligan-card-name">${escapeHtml(card.name)}</div>
            <div class="mulligan-card-type">${escapeHtml(formatElementLabel(card.element))} ${escapeHtml(card.type)}</div>
            <div class="mulligan-card-text">${escapeHtml(card.ability?.description || getBuilderCardSummaryText(card))}</div>
        </div>`;
    }).join('');
}

function renderLog() {
    const log = document.getElementById('gameLog');
    if (!log || !gameState?.gameLog) {
        renderDesktopActionHistory();
        return;
    }

    let html = '';
    for (const entry of gameState.gameLog) {
        html += `<div class="log-entry">${escapeHtml(entry)}</div>`;
    }
    log.innerHTML = html;
    log.scrollTop = 0;
    renderDesktopActionHistory();
}

function renderBattlePanel() {
    const panels = [
        document.getElementById('battleActionPanel'),
        document.getElementById('desktopBattleActionPanel')
    ].filter(Boolean);
    if (panels.length === 0 || !gameState) {
        return;
    }
    const setPanelHtml = (html) => {
        panels.forEach(panel => {
            panel.innerHTML = html;
        });
    };
    const pending = gameState.pendingBattle;

    if (!pending) {
        if (gameState.currentPhase === 'BATTLE' && gameState.battleWaitingOn === 'ENEMY') {
            setPanelHtml('Battle is live. Waiting for your opponent to finish the current speed action.');
            return;
        }
        if (gameState.currentPhase === 'BATTLE') {
            setPanelHtml('Battle is resolving. The next available Siegling will act in speed order.');
            return;
        }
        setPanelHtml('Battle starts automatically after both players press End Turn. When it begins, Sieglings act from highest speed to lowest speed.');
        return;
    }

    if (isMobileLayout() && activeDrawer !== 'battle' && !isBattleTargetSelectionActive()) {
        mobileInfoTab = 'battle';
        openDrawer('battle');
    }

    let html = `<div class="battle-attacker"><strong>${pending.name}</strong> is acting now from the battle speed order.</div>`;
    if (targetMode && targetContext && targetContext.mode === 'battle') {
        html += `<div class="battle-hint">${targetContext.message} You can also pass to skip this action.</div>`;
    } else {
        html += `<div class="battle-hint">Choose an ability to resolve or pass this Siegling's action.</div>`;
    }

    const sortedAbilities = getSortedBattleAbilities(pending.abilities);
    for (const ability of sortedAbilities) {
        const disabled = ability.affordable ? '' : 'disabled';
        const label = `${ability.name} (${formatBattleAbilityCost(ability)})`;
        html += `<button class="battle-ability-btn" ${disabled} onclick="chooseBattleAbility(${ability.index})">${label}</button>`;
        html += `<div class="battle-ability-desc">${ability.description}</div>`;
    }
    html += `<button class="battle-ability-btn battle-pass-btn" type="button" onclick="passBattleAction()">Pass</button>`;
    html += `<div class="battle-ability-desc">Skip this card's action and move to the next acting Siegling.</div>`;

    setPanelHtml(html);
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
    if (activeDrawer === 'battle') {
        closeDrawer(true);
    }
    render();
}

function passBattleAction() {
    if (!gameState?.pendingBattle) {
        return;
    }
    submitBattleAction(-1, -1, -1);
}

function boardHasTargets(side) {
    const board = side === 'enemy' ? gameState.enemyBoard : gameState.playerBoard;
    return board.some(row => row.some(cell => cell));
}

function abilityHasAvailableTarget(ability) {
    const targetSide = getAbilityTargetSide(ability);
    return !targetSide || boardHasTargets(targetSide);
}

function getSelectedLegalPlacements() {
    const evolutionCardSelected = Boolean(selectedCard?.evolvesFromId);
    if (gameState.playerPlacementUsed || (countBoardSieglings() >= 5 && !evolutionCardSelected)) {
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

function selectCard(cardId) {
    if (gameState.currentPhase !== 'SETUP') return;
    if (isMobileLayout() && handTouchSuppressCardId === cardId && Date.now() < handTouchSuppressUntil) {
        handTouchSuppressCardId = null;
        handTouchSuppressUntil = 0;
        return;
    }

    const card = gameState.player.hand.find(c => c.id === cardId);
    if (!card) return;

    if (selectedCard && selectedCard.id === cardId) {
        selectedCard = null;
        clearTargetMode();
        updateSelectedInfo(null);
        render();
        return;
    }

    const lockReason = getHandCardLockReason(card);

    selectedCard = card;
    clearTargetMode();

    if (lockReason) {
        updateSelectedInfo(card, lockReason);
        render();
        return;
    }

    if (isActionCard(card)) {
        const targetSide = getAbilityTargetSide(card.ability);
        const needsExplicitTarget = Boolean(targetSide);
        if (needsExplicitTarget) {
            targetMode = true;
            targetContext = {
                mode: 'spell',
                side: targetSide,
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
        el.innerHTML = 'Click a card in your hand to select it.';
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
        const lockReason = getHandCardLockReason(card);
        html += `<div class="selected-card-panel">`;
        html += renderShowcaseCard(card, {
            cardClass: 'selected-preview-card',
            artVariant: 'selected'
        });
        html += `<div class="selected-preview-copy">`;
        if (lockReason) {
            html += `<span style="color:var(--accent)">${escapeHtml(lockReason)}</span>`;
        } else if (card.type === 'SIEGLING') {
            html += card.evolvesFromName
                ? `<span style="color:var(--accent)">Place this on top of ${card.evolvesFromName} to evolve it.</span>`
                : gameState.playerPlacementUsed
                ? '<span style="color:var(--accent)">You already placed your Siegling for this turn.</span>'
                : '<span style="color:var(--accent)">Highlighted bubbles show where this card can expand next.</span>';
        }
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
    const targetable = isTargetCell(isPlayer, cell);
    const claimable = isPlayer && isClaimableBoardCell(cell, true);
    if (!legalPlacement && !targetable && !claimable) {
        return;
    }
    event.preventDefault();
    if (legalPlacement) {
        placeCard(row, col);
        return;
    }
    if (targetable) {
        onTargetSelected(row, col);
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
    document.getElementById('ttStats').innerHTML =
        `<span class="stat stat-hp">HP: ${cell.hp}/${cell.maxHp}</span>` +
        `<span class="stat stat-spd">SPD: ${cell.spd}</span>`;
    let abilityText = cell.ability || '';
    if (isClaimableBoardCell(cell, isPlayer)) {
        abilityText += `${abilityText ? ' ' : ''}[Claim: Gain 1 temporary ${formatElementLabel(cell.element)} energy this turn]`;
    }
    document.getElementById('ttAbility').textContent = abilityText;

    positionTooltip(event, tt);
    tt.classList.add('visible');
}

function showTooltipHand(event, cardId) {
    if (isDesktopSidebarLayout() || isMobileLayout()) {
        return;
    }
    const card = gameState.player.hand.find(c => c.id === cardId);
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
    const lockReason = getHandCardLockReason(card);
    if (lockReason) {
        abilityText += ` [Unavailable: ${lockReason}]`;
    }
    document.getElementById('ttAbility').textContent = abilityText;

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

function getLiftedHandCardId() {
    return hoveredHandCardId || selectedCard?.id || null;
}

function handleHandSelectorPointerMove(event) {
    if (!isDesktopSidebarLayout()) {
        stopHandSelectorAutoScroll();
        return;
    }
    const tray = document.getElementById('handTray');
    const cards = document.getElementById('playerHand');
    if (!tray || !cards || cards.scrollWidth <= cards.clientWidth + 4) {
        stopHandSelectorAutoScroll();
        return;
    }
    const rect = tray.getBoundingClientRect();
    const threshold = Math.max(36, Math.min(92, rect.width * 0.12));
    let direction = 0;
    if (event.clientX <= rect.left + threshold) {
        direction = -1;
    } else if (event.clientX >= rect.right - threshold) {
        direction = 1;
    }
    if (direction === handAutoScrollDirection) {
        return;
    }
    stopHandSelectorAutoScroll();
    if (direction === 0) {
        return;
    }
    handAutoScrollDirection = direction;
    const tick = () => {
        const row = document.getElementById('playerHand');
        if (!row || handAutoScrollDirection === 0) {
            handAutoScrollFrame = null;
            return;
        }
        row.scrollLeft += handAutoScrollDirection * 12;
        handAutoScrollFrame = window.requestAnimationFrame(tick);
    };
    handAutoScrollFrame = window.requestAnimationFrame(tick);
}

function stopHandSelectorAutoScroll() {
    handAutoScrollDirection = 0;
    if (handAutoScrollFrame) {
        window.cancelAnimationFrame(handAutoScrollFrame);
        handAutoScrollFrame = null;
    }
}

function getHandCardSourceElement(cardId) {
    return Array.from(document.querySelectorAll('#playerHand .hand-card[data-card-id]'))
        .find(card => card.dataset.cardId === cardId) || null;
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

    const cardId = getLiftedHandCardId();
    if (!cardId) {
        return;
    }

    const source = getHandCardSourceElement(cardId);
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
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDrawer(true);
        closeClaimPopup();
        closeTrainerAbilityPopup();
        selectedCard = null;
        clearTargetMode();
        updateSelectedInfo(null);
        render();
    }
});

window.addEventListener('resize', () => {
    updateResponsiveLayoutVars(true);
    stopHandSelectorAutoScroll();
    hoveredBoardCard = null;
    syncMobileInfoTab();
    syncFocusedCardUi();
});

window.addEventListener('resize', () => {
    updateResponsiveLayoutVars(true);
    const desktopBattleDrawerVisible = document.getElementById('desktopBattleDrawer')?.classList.contains('visible');
    const mobileBattleDrawerVisible = document.getElementById('drawerBattle')?.classList.contains('visible');
    if (!shouldUseDesktopBattleDrawer() && desktopBattleDrawerVisible) {
        closeDrawer(true);
    } else if (shouldUseDesktopBattleDrawer() && mobileBattleDrawerVisible) {
        closeDrawer(true);
        openDrawer('battle');
    }
    syncFocusedCardUi();
    renderDesktopDeckPreview();
    updateHandLiftLayer();
});

window.addEventListener('orientationchange', () => {
    updateResponsiveLayoutVars(true);
    syncFocusedCardUi();
    renderDesktopDeckPreview();
    updateHandLiftLayer();
});

updateResponsiveLayoutVars(true);
renderDesktopMenuMeta();
renderDesktopActionHistory();
renderWelcomeTutorial();
renderWelcomeAuth();
syncEntryOverlays();
loadGameOptions();

