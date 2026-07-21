(function () {
    'use strict';

    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    const COOKIE_SESSION_VALUE = 'cookie';
    const apiBase = String(window.SIEGLINGS_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
    const TUTORIAL_KEY = 'sieglingsKeepTutorialSeen';
    const TUTORIAL_STEPS = [
        {
            art: '⌂', kicker: 'Welcome, Keeper', title: 'The Wounded Ground',
            body: 'This land was stripped bare by the war. Your Keep is a promise to give more than you take. Rebuild at your own pace — everything here keeps growing while you are away.'
        },
        {
            art: '▰', kicker: 'Grow and gather', title: 'The Woodlot works for you',
            body: 'The Restorative Woodlot produces timber over time — the READY counter at the top shows how much is waiting. Tap Collect to store it. Cultivation, never clear-cutting.'
        },
        {
            art: '⚒', kicker: 'Restore the sanctuary', title: 'Spend timber on Projects',
            body: 'Open Projects and spend timber to raise ruined buildings. Construction finishes on its own, even while you are offline, and every finished project changes the land itself.'
        },
        {
            art: '▤', kicker: 'Step inside and listen', title: 'Buildings open up',
            body: 'Tap any building to step inside it. Read recovered letters in the Chronicle, display memorabilia, and answer the Voices — your choices shape trust, never your production.'
        },
        {
            art: '✦', kicker: 'Choose what comes next', title: 'Build an elemental workshop',
            body: 'After restoring the Storehouse, choose which elemental workshop to build first. Each makes a different material used to craft other buildings, production tools, Keep bonuses, and decorations you can place inside.'
        }
    ];

    const state = {
        snapshot: null,
        panel: '',
        interior: '',
        tutorialStep: -1,
        loreFilter: 'ALL',
        expandedLoreId: '',
        activeConversationId: '',
        receivedAtMs: Date.now(),
        debugTimeOffsetMs: 0,
        busy: false,
        discoveryQueue: [],
        discoveryTimer: null,
        completionRefreshPending: false,
        constructionCollapsed: false,
        selectedStation: 'woodlot',
        selectedRelationshipId: '',
        inventoryFilter: 'ALL',
        pendingOfflineReport: null,
        offlineVisible: false,
        testMode: Boolean(window.__KEEP_TEST_SNAPSHOT__)
    };

    const elementColors = {
        FIRE: '#ff6a3d', WATER: '#4da8ff', EARTH: '#c09a65', WIND: '#96ffb4', ICE: '#76e6ff',
        SHADOW: '#9b6bd0', ELECTRIC: '#ffe63c', METAL: '#b7c0c8', UNDEAD: '#9e8aad',
        PSYCHIC: '#d0a7ff', LIGHT: '#ffe9a8', POISON: '#84c55b', NEUTRAL: '#c8b997'
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        if (state.testMode) {
            applySnapshot(clone(window.__KEEP_TEST_SNAPSHOT__), false);
            hideLoading();
        } else {
            await loadSnapshot();
        }
        maybeShowTutorial();
        maybeShowOfflineReport();
        window.setInterval(updateLiveState, 1000);
    }

    function bindEvents() {
        document.addEventListener('click', handleClick);
        document.getElementById('panelClose')?.addEventListener('click', closePanel);
        document.getElementById('panelScrim')?.addEventListener('click', closePanel);
        document.getElementById('dialogueClose')?.addEventListener('click', closeDialogue);
        document.getElementById('dialogueOverlay')?.addEventListener('click', (event) => {
            if (event.target.id === 'dialogueOverlay') closeDialogue();
        });
        document.getElementById('collectButton')?.addEventListener('click', collectTimber);
        document.getElementById('fullscreenButton')?.addEventListener('click', toggleFullscreen);
        document.getElementById('discoveryOpen')?.addEventListener('click', openLatestDiscovery);
        document.getElementById('interiorExit')?.addEventListener('click', closeInterior);
        document.getElementById('helpButton')?.addEventListener('click', () => openTutorial(0));
        document.getElementById('tutorialSkip')?.addEventListener('click', finishTutorial);
        document.getElementById('tutorialNext')?.addEventListener('click', tutorialAdvance);
        document.getElementById('offlineDismiss')?.addEventListener('click', dismissOfflineReport);
        // iOS Safari can leave the document scrolled after a rotation even with
        // overflow hidden, hiding the fixed header; snap back whenever it happens.
        window.addEventListener('resize', resetViewportScroll);
        window.addEventListener('orientationchange', () => {
            resetViewportScroll();
            window.setTimeout(resetViewportScroll, 250);
            window.setTimeout(resetViewportScroll, 700);
        });
        window.addEventListener('scroll', resetViewportScroll, { passive: true });
        document.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'f' && !isTyping(event.target)) toggleFullscreen();
            if (event.key === 'Escape') {
                if (!document.getElementById('keepTutorial')?.classList.contains('hidden')) finishTutorial();
                else if (!document.getElementById('dialogueOverlay')?.classList.contains('hidden')) closeDialogue();
                else if (state.panel) closePanel();
                else closeInterior();
            }
        });
    }

    function resetViewportScroll() {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        const main = document.querySelector('.keep-main');
        if (main?.scrollLeft || main?.scrollTop) main.scrollTo(0, 0);
    }

    function handleClick(event) {
        if (event.target.closest('#constructionToggle')) {
            toggleConstructionBanner();
            return;
        }
        const panelTrigger = event.target.closest('[data-open-panel]');
        if (panelTrigger) {
            if (panelTrigger.dataset.selectStation) state.selectedStation = panelTrigger.dataset.selectStation;
            openPanel(panelTrigger.dataset.openPanel);
            return;
        }
        const building = event.target.closest('[data-building]');
        if (building) {
            if (building.dataset.building === 'facilities') openPanel('facilities');
            else openInterior(building.dataset.building);
            return;
        }
        const enterFacility = event.target.closest('[data-enter-facility]');
        if (enterFacility) {
            openInterior(enterFacility.dataset.enterFacility);
            return;
        }
        const stationChoice = event.target.closest('[data-resident-station]');
        if (stationChoice) {
            state.selectedStation = stationChoice.dataset.residentStation || 'woodlot';
            renderPanel();
            return;
        }
        const inventoryFilter = event.target.closest('[data-inventory-filter]');
        if (inventoryFilter) {
            state.inventoryFilter = inventoryFilter.dataset.inventoryFilter || 'ALL';
            renderPanel();
            return;
        }
        const relationship = event.target.closest('[data-relationship-id]');
        if (relationship) {
            const id = relationship.dataset.relationshipId || '';
            state.selectedRelationshipId = state.selectedRelationshipId === id ? '' : id;
            renderPanel();
            return;
        }
        const filter = event.target.closest('[data-lore-filter]');
        if (filter) {
            state.loreFilter = filter.dataset.loreFilter || 'ALL';
            renderPanel();
            return;
        }
        const lore = event.target.closest('[data-lore-id]');
        if (lore && !event.target.closest('[data-memorabilia-id]')) {
            void openLore(lore.dataset.loreId);
            return;
        }
        const memorabilia = event.target.closest('[data-memorabilia-id]');
        if (memorabilia) {
            event.stopPropagation();
            void toggleMemorabilia(memorabilia.dataset.memorabiliaId, memorabilia.dataset.displayed !== 'true');
            return;
        }
        const invite = event.target.closest('[data-invite-resident]');
        if (invite) {
            void inviteResident(invite.dataset.inviteResident, invite.dataset.stationId || state.selectedStation);
            return;
        }
        const stationCollect = event.target.closest('[data-collect-station]');
        if (stationCollect) {
            void collectStation(stationCollect.dataset.collectStation);
            return;
        }
        const reward = event.target.closest('[data-claim-keep-reward]');
        if (reward) {
            void claimReward(reward.dataset.claimKeepReward);
            return;
        }
        const craft = event.target.closest('[data-craft-recipe]');
        if (craft) {
            void craftRecipe(craft.dataset.craftRecipe);
            return;
        }
        const decoration = event.target.closest('[data-place-decoration]');
        if (decoration) {
            void placeDecoration(decoration.dataset.roomId, decoration.dataset.placeDecoration,
                decoration.dataset.displayed !== 'true');
            return;
        }
        const build = event.target.closest('[data-start-build]');
        if (build) {
            void startBuild(build.dataset.startBuild);
            return;
        }
        const conversation = event.target.closest('[data-conversation-id]');
        if (conversation) {
            openConversation(conversation.dataset.conversationId);
            return;
        }
        const choice = event.target.closest('[data-dialogue-choice]');
        if (choice) {
            void chooseDialogue(choice.dataset.dialogueChoice);
            return;
        }
        if (event.target.closest('[data-dialogue-done]')) closeDialogue();
        if (event.target.closest('[data-collect-inline]')) void collectTimber();
    }

    async function loadSnapshot(announceDiscoveries = false) {
        const data = await fetchJson('/api/keep');
        if (data?.error) {
            showGate(data.error);
            hideLoading();
            return;
        }
        applySnapshot(data, announceDiscoveries);
        hideLoading();
    }

    async function perform(path, payload) {
        if (state.busy || !state.snapshot) return null;
        state.busy = true;
        document.body.classList.add('keep-busy');
        try {
            const previous = state.snapshot;
            const data = await fetchJson(path, {
                method: 'POST',
                body: JSON.stringify({
                    ...payload,
                    requestId: requestId(),
                    expectedVersion: Number(previous.stateVersion) || 0
                })
            });
            if (data?.error) {
                if (data.status === 409 && !state.testMode) {
                    await loadSnapshot();
                }
                showNotice(data.error, 'Keep update');
                return null;
            }
            applySnapshot(data, true);
            return data;
        } finally {
            state.busy = false;
            document.body.classList.remove('keep-busy');
        }
    }

    async function collectTimber() {
        if (projectedAvailable() <= 0) return;
        await collectStation('woodlot');
    }

    async function collectStation(stationId) {
        const station = stationById(stationId);
        if (!station || projectedStationAvailable(station) <= 0) return;
        await perform('/api/keep/collect', { stationId });
    }

    async function inviteResident(residentId, stationId) {
        const station = stationById(stationId);
        const current = station?.residentId || '';
        await perform('/api/keep/resident', { stationId, residentId: current === residentId ? '' : residentId });
    }

    async function claimReward(rewardId) {
        const data = await perform('/api/keep/reward', { rewardId });
        if (data?.rewardClaimed) {
            const reward = data.rewardClaimed;
            showNotice(`+${number(reward.gold)} Siegecoins · +${number(reward.remnants)} Remnants`, 'Sanctuary reward');
        }
    }

    async function startBuild(buildId) {
        const data = await perform('/api/keep/build', { buildId });
        if (data) openPanel('projects');
    }

    async function openLore(loreId) {
        const item = loreById(loreId);
        if (!item) return;
        state.expandedLoreId = state.expandedLoreId === loreId ? '' : loreId;
        if (!item.read) {
            await perform('/api/keep/lore/read', { loreId });
            state.expandedLoreId = loreId;
        } else {
            renderPanel();
        }
    }

    async function toggleMemorabilia(loreId, displayed) {
        await perform('/api/keep/memorabilia', { loreId, displayed });
    }

    function openConversation(conversationId) {
        const conversation = conversationById(conversationId);
        if (!conversation) return;
        state.activeConversationId = conversation.id;
        const portrait = document.getElementById('dialoguePortrait');
        portrait?.classList.toggle('is-archivist', conversation.npcId === 'archivist_pell');
        portrait?.classList.toggle('is-visitor', String(conversation.kind || '').toUpperCase() === 'VISITOR');
        text('dialogueRole', conversation.npcRole);
        text('dialogueName', conversation.npcName);
        text('dialogueKicker', conversation.kicker);
        text('dialoguePrompt', conversation.prompt);
        const summary = document.getElementById('dialogueSummary');
        if (summary) {
            summary.textContent = '';
            summary.classList.add('hidden');
        }
        const choices = document.getElementById('dialogueChoices');
        if (choices) {
            choices.innerHTML = (conversation.choices || []).map((choice) => {
                const cost = choiceCostHint(choice);
                const disabled = choice.affordable === false;
                const rng = choice.hasRng ? '<i class="choice-rng">chance</i>' : '';
                return `<button type="button" data-dialogue-choice="${escapeAttr(choice.id)}" ${disabled ? 'disabled' : ''}>
                    <span>${escapeHtml(choice.label)}</span>
                    ${cost || rng ? `<small>${escapeHtml(cost)}${cost && rng ? ' · ' : ''}${rng ? 'chance' : ''}</small>` : ''}
                </button>`;
            }).join('');
        }
        document.getElementById('dialogueOverlay')?.classList.remove('hidden');
    }

    function choiceCostHint(choice) {
        const parts = [];
        if (number(choice.timberCost) > 0) parts.push(`${number(choice.timberCost)} timber`);
        for (const cost of choice.materialCosts || []) {
            if (number(cost.amount) > 0) parts.push(`${number(cost.amount)} ${cost.name || cost.id}`);
        }
        return parts.join(' · ');
    }

    async function chooseDialogue(choiceId) {
        const conversationId = state.activeConversationId;
        const data = await perform('/api/keep/dialogue/choose', { conversationId, choiceId });
        if (!data) return;
        const result = data.dialogueResult || {};
        text('dialoguePrompt', result.response || 'The conversation settles into a thoughtful silence.');
        const summary = document.getElementById('dialogueSummary');
        if (summary) {
            summary.textContent = result.summary || '';
            summary.classList.toggle('hidden', !result.summary);
        }
        if (result.summary && result.summary !== 'No stores changed.') {
            showNotice(result.summary, result.npcName || 'Visitor');
        }
        const choices = document.getElementById('dialogueChoices');
        if (choices) choices.innerHTML = '<button type="button" data-dialogue-done>Return to the keep</button>';
        renderPanel();
    }

    function closeDialogue() {
        state.activeConversationId = '';
        document.getElementById('dialogueOverlay')?.classList.add('hidden');
    }

    function applySnapshot(next, announceDiscoveries) {
        if (!next || typeof next !== 'object') return;
        const previousLore = new Set((state.snapshot?.lore || []).map((item) => item.id));
        state.snapshot = next;
        if (next.offlineReport) state.pendingOfflineReport = clone(next.offlineReport);
        state.receivedAtMs = Date.now() + state.debugTimeOffsetMs;
        renderAll();
        if (announceDiscoveries) {
            const ids = Array.isArray(next.newLoreUnlocks)
                ? next.newLoreUnlocks
                : (next.lore || []).map((item) => item.id).filter((id) => !previousLore.has(id));
            enqueueDiscoveries(ids);
        }
    }

    function renderAll() {
        const snapshot = state.snapshot;
        if (!snapshot) return;
        text('keepName', snapshot.keepName || 'My Keep');
        text('chapterLabel', `Chapter ${roman(snapshot.chapter?.number || 1)} · ${snapshot.chapter?.title || 'The Wounded Ground'}`);
        text('timberAmount', `${number(snapshot.resources?.timber)}/${number(snapshot.resources?.timberCapacity)}`);
        const materials = snapshot.resources?.materials || [];
        text('materialAmount', `${materials.reduce((sum, item) => sum + number(item.amount), 0)}/${number(snapshot.resources?.materialCapacity) * Math.max(1, materials.length)}`);

        const scene = document.getElementById('keepScene');
        const visual = snapshot.visualState || {};
        if (scene) {
            scene.dataset.healingStage = String(number(visual.healingStage));
            scene.dataset.archiveRestored = String(Boolean(visual.archiveRestored));
            scene.dataset.woodlotLevel = String(number(visual.woodlotLevel) || 1);
            scene.dataset.storehouseLevel = String(number(visual.storehouseLevel));
            scene.dataset.gardenLevel = String(number(visual.gardenLevel));
            scene.dataset.forgeLevel = String(number(visual.forgeLevel));
            scene.dataset.fridgeLevel = String(number(visual.fridgeLevel));
            scene.dataset.generatorLevel = String(number(visual.generatorLevel));
            scene.classList.toggle('is-building-archive', snapshot.activeConstruction?.id === 'restore_archive');
            scene.classList.toggle('is-building-woodlot', snapshot.activeConstruction?.id === 'woodlot_level_2');
        }
        const builtFacilities = ['garden', 'forge', 'fridge', 'generator']
            .filter((id) => number(visual[`${id}Level`]) > 0).length;
        text('quarterLabel', builtFacilities ? `${builtFacilities}/4 facilities restored` : 'Foundations awaiting restoration');

        const station = snapshot.station || {};
        text('woodlotLabel', `Level ${number(station.level) || 1} · ${formatRate(station.ratePerMinute)}/min`);
        const resident = station.resident;
        const worker = document.getElementById('residentWorker');
        worker?.classList.toggle('hidden', !resident);
        setResidentOverlayArt(document.getElementById('residentWorkerArt'), resident);

        const archiveRestored = Boolean(visual.archiveRestored);
        text('archiveName', archiveRestored ? 'Living Archive' : 'Ruined Archive');
        text('archiveLabel', archiveRestored ? 'Letters, relics, and remembered voices' : 'Records buried beneath the stones');
        const archiveUnread = (snapshot.lore || []).some((item) => !item.read && item.id !== 'charter_three_promises');
        document.getElementById('archiveAlert')?.classList.toggle('hidden', !archiveRestored || !archiveUnread);
        const root = loreById('memorabilia_petrified_root');
        document.getElementById('memorabiliaPlinth')?.classList.toggle('hidden', !root?.displayed);

        const unread = number(snapshot.unreadLoreCount);
        text('unreadBadge', unread);
        document.getElementById('unreadBadge')?.classList.toggle('hidden', unread <= 0);
        document.getElementById('conversationDot')?.classList.toggle('hidden', !(snapshot.availableConversations || []).length);
        renderConstruction();
        updateLiveCounters();
        if (state.panel) renderPanel();
        if (state.interior) renderInterior();
        resetViewportScroll();
    }

    function updateLiveState() {
        if (!state.snapshot) return;
        if (state.testMode) completeMockConstructionIfReady();
        updateLiveCounters();
        const construction = state.snapshot.activeConstruction;
        if (construction && constructionRemaining() <= 0 && !state.testMode && !state.completionRefreshPending) {
            state.completionRefreshPending = true;
            window.setTimeout(async () => {
                await loadSnapshot(true);
                state.completionRefreshPending = false;
            }, 800);
        }
    }

    function updateLiveCounters() {
        if (!state.snapshot) return;
        const available = projectedAvailable();
        const totalReady = (state.snapshot.stations || [state.snapshot.station]).reduce(
            (sum, station) => sum + projectedStationAvailable(station), 0);
        text('stationAvailable', totalReady);
        text('collectAmount', `${available} timber`);
        const collect = document.getElementById('collectButton');
        if (collect) collect.disabled = available <= 0 || number(state.snapshot.resources?.timber) >= number(state.snapshot.resources?.timberCapacity) || state.busy;
        document.getElementById('productionReady')?.classList.toggle('hidden', available <= 0);
        renderConstruction();
        if (state.panel.startsWith('building:woodlot') || state.panel === 'projects' || state.panel === 'facilities'
                || state.panel === 'residents' || state.interior === 'woodlot') updatePanelLiveValues();
    }

    function renderConstruction() {
        const construction = state.snapshot?.activeConstruction;
        const banner = document.getElementById('constructionBanner');
        banner?.classList.toggle('hidden', !construction);
        if (!construction) return;
        const option = (state.snapshot.buildOptions || []).find((item) => item.id === construction.id);
        text('constructionName', option?.name || projectName(construction.id));
        const remaining = constructionRemaining();
        text('constructionTimer', formatDuration(remaining));
        const started = Date.parse(construction.startedAt || '') || nowMs();
        const completes = Date.parse(construction.completesAt || '') || nowMs();
        const progress = completes <= started ? 1 : clamp((nowMs() - started) / (completes - started), 0, 1);
        const bar = document.getElementById('constructionProgress');
        if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
        renderConstructionCollapseState();
    }

    function toggleConstructionBanner() {
        state.constructionCollapsed = !state.constructionCollapsed;
        renderConstructionCollapseState();
    }

    function renderConstructionCollapseState() {
        const banner = document.getElementById('constructionBanner');
        const toggle = document.getElementById('constructionToggle');
        banner?.classList.toggle('is-collapsed', state.constructionCollapsed);
        if (!toggle) return;
        const expanded = !state.constructionCollapsed;
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', expanded ? 'Collapse construction status' : 'Expand construction status');
        const icon = toggle.querySelector('[aria-hidden="true"]');
        if (icon) icon.textContent = expanded ? '−' : '+';
    }

    function openPanel(panel) {
        state.panel = panel || '';
        document.querySelector('.keep-main')?.classList.add('panel-open');
        document.getElementById('keepPanel')?.setAttribute('aria-hidden', 'false');
        renderPanel();
    }

    function closePanel() {
        state.panel = '';
        document.querySelector('.keep-main')?.classList.remove('panel-open');
        document.getElementById('keepPanel')?.setAttribute('aria-hidden', 'true');
    }

    function renderPanel() {
        if (!state.snapshot || !state.panel) return;
        const body = document.getElementById('panelBody');
        if (!body) return;
        if (state.panel.startsWith('building:')) {
            const id = state.panel.split(':')[1];
            renderBuildingPanel(id, body);
        } else if (state.panel === 'residents') {
            setPanelHeading('Covenant residents', 'Invite a partner');
            body.innerHTML = residentsMarkup();
        } else if (state.panel === 'projects') {
            setPanelHeading('Restoration projects', 'Build the promise');
            body.innerHTML = projectsMarkup();
        } else if (state.panel === 'facilities') {
            setPanelHeading('Elemental Quarter', 'Shared work, willing hands');
            body.innerHTML = facilitiesMarkup();
        } else if (state.panel === 'chronicle') {
            setPanelHeading('The Living Chronicle', 'Letters & memorabilia');
            body.innerHTML = chronicleMarkup();
        } else if (state.panel === 'conversations') {
            setPanelHeading('Voices of the sanctuary', 'Conversations');
            body.innerHTML = conversationsMarkup();
        } else if (state.panel === 'inventory') {
            setPanelHeading('Keep inventory', 'Raw & manufactured');
            body.innerHTML = inventoryMarkup();
        }
    }

    function renderBuildingPanel(id, body) {
        const heading = buildingHeading(id);
        setPanelHeading(heading.title, heading.kicker);
        body.innerHTML = buildingMarkup(id);
    }

    function buildingHeading(id) {
        if (id === 'woodlot') {
            const station = state.snapshot.station || {};
            return { title: 'Restorative Woodlot', kicker: `Level ${number(station.level) || 1}` };
        }
        if (id === 'archive') {
            const restored = Boolean(state.snapshot.visualState?.archiveRestored);
            return { title: restored ? 'Living Archive' : 'Ruined Archive', kicker: restored ? 'Recovered voices' : 'Buried history' };
        }
        const station = stationById(id);
        if (station) return { title: station.name, kicker: `Level ${number(station.level)} · ${station.resourceName || 'Elemental workshop'}` };
        return { title: 'Covenant Hall', kicker: 'The three promises' };
    }

    function buildingMarkup(id) {
        if (id === 'woodlot') {
            const station = state.snapshot.station || {};
            return `
                <p class="panel-intro">The grove is cultivated with resident Siegelings. Fallen limbs and willing growth replace clear-cutting.</p>
                <section class="detail-card">
                    <h3>${escapeHtml(String(projectedAvailable()))} timber ready</h3>
                    <div class="meter"><i data-live-woodlot-meter style="width:${woodlotFill()}%"></i></div>
                    <div class="cost-row"><span>${escapeHtml(formatRate(station.ratePerMinute))} per minute</span><strong>${escapeHtml(String(station.storageCapacity || 0))} storage</strong></div>
                    <div class="button-row"><button class="panel-button" type="button" data-collect-inline ${projectedAvailable() <= 0 ? 'disabled' : ''}>Collect timber</button><button class="panel-button secondary" type="button" data-open-panel="residents">Invite resident</button></div>
                </section>
                ${station.resident ? `<section class="detail-card"><span class="eyebrow">Current partner</span><h3>${escapeHtml(station.resident.name)}</h3><p>${escapeHtml(station.resident.affinityLabel || '')}. Invited residents remain available in decks and expeditions.</p></section>` : `<div class="empty-state">No resident has been invited. The Woodlot still produces normally.</div>`}`;
        }
        if (id === 'archive') {
            const restored = Boolean(state.snapshot.visualState?.archiveRestored);
            return restored
                ? `<p class="panel-intro">Letters, artifacts, and translated memories are preserved with their disagreements intact.</p><section class="detail-card"><h3>${number(state.snapshot.lore?.length)} discoveries</h3><p>${number(state.snapshot.unreadLoreCount)} entries remain unread. Memorabilia displayed here also appears in the sanctuary scene.</p><div class="button-row"><button class="panel-button" type="button" data-open-panel="chronicle">Open Chronicle</button><button class="panel-button secondary" type="button" data-open-panel="conversations">Speak with visitors</button></div></section>`
                : `<p class="panel-intro">A collapsed record hall lies beneath the eastern wall. Its stones protect letters from the Age Before Cards.</p>${projectsMarkup()}`;
        }
        if (stationById(id)) return facilityInteriorMarkup(id);
        return `<p class="panel-intro">The sanctuary is founded on Stewardship, Consent, and Shelter.</p><section class="detail-card"><h3>The Keeper's Charter</h3><p>No Siegeling will be compelled to labor or fight. The land will be repaired rather than consumed, and those hunted by Akhar may seek refuge here.</p><div class="button-row"><button class="panel-button" type="button" data-open-panel="chronicle">Read the charter</button></div></section>${craftingMarkup('great_hall')}`;
    }

    function facilityInteriorMarkup(id) {
        const station = stationById(id) || {};
        const ready = projectedStationAvailable(station);
        return `<p class="panel-intro">${facilityInteriorDescription(id)}</p>
            <section class="detail-card"><h3>${ready} ${escapeHtml(station.resourceName || 'materials')} ready</h3>
            <div class="meter"><i data-station-meter="${escapeAttr(id)}" style="width:${stationFill(station)}%"></i></div>
            <div class="cost-row"><span>${escapeHtml(formatRate(station.ratePerMinute))} per minute</span><strong>${number(station.storageCapacity)} local storage</strong></div>
            <div class="button-row"><button class="panel-button" type="button" data-collect-station="${escapeAttr(id)}" ${ready <= 0 ? 'disabled' : ''}>Collect ${escapeHtml(station.resourceName || 'materials')}</button><button class="panel-button secondary" type="button" data-open-panel="residents" data-select-station="${escapeAttr(id)}">Assign resident</button></div></section>
            ${craftingMarkup(id)}`;
    }

    function craftingMarkup(roomId) {
        const recipes = (state.snapshot.recipes || []).filter((item) => item.roomId === roomId && item.available);
        const decoration = (state.snapshot.decorations || []).find((item) => item.roomId === roomId && item.crafted);
        const cards = recipes.length ? recipes.map((recipe) => `<section class="craft-card ${recipe.crafted ? 'is-crafted' : ''}">
            <span class="craft-type">${escapeHtml(recipe.type)}</span><h3>${escapeHtml(recipe.name)}</h3><p>${escapeHtml(recipe.description || '')}</p>
            <small>${escapeHtml(recipe.bonus || '')}</small><div class="craft-costs">${(recipe.costs || []).map((cost) => `<span>${materialIcon(cost.id)} ${number(cost.amount)} ${escapeHtml(cost.name)}</span>`).join('')}</div>
            <button class="panel-button" type="button" data-craft-recipe="${escapeAttr(recipe.id)}" ${recipe.canCraft ? '' : 'disabled'}>${recipe.crafted ? 'Crafted' : recipe.canCraft ? 'Craft item' : 'Gather materials'}</button>
        </section>`).join('') : '<div class="empty-state">This room has no available blueprints yet.</div>';
        const placement = decoration ? `<section class="decoration-control"><span><small>Interior decoration</small><strong>${escapeHtml(decoration.name)}</strong></span><button class="panel-button secondary" type="button" data-place-decoration="${escapeAttr(decoration.id)}" data-room-id="${escapeAttr(roomId)}" data-displayed="${String(Boolean(decoration.displayed))}">${decoration.displayed ? 'Store decoration' : 'Place decoration'}</button></section>` : '';
        return `<div class="crafting-section"><span class="eyebrow">Workshop blueprints</span>${cards}${placement}</div>`;
    }

    function facilityInteriorDescription(id) {
        return ({
            garden: 'Living beds turn patient cultivation into Verdant Fiber for weaving, tools, and restorative construction.',
            forge: 'A consent-bound hearth shapes Ember Ingots without forcing a resident to remain at the bellows.',
            fridge: 'Frost-lined vaults preserve food and form Frost Crystals without draining the surrounding water.',
            generator: 'Balanced elemental currents condense into Storm Cells that power advanced tools and shared upgrades.'
        })[id] || 'A workshop built around partnership.';
    }

    function openInterior(id) {
        if (!state.snapshot || !id) return;
        state.interior = id;
        closePanel();
        const interior = document.getElementById('keepInterior');
        if (interior) {
            interior.dataset.room = id;
            interior.setAttribute('aria-hidden', 'false');
        }
        renderInterior();
    }

    function closeInterior() {
        state.interior = '';
        document.getElementById('keepInterior')?.setAttribute('aria-hidden', 'true');
    }

    function renderInterior() {
        if (!state.snapshot || !state.interior) return;
        const interior = document.getElementById('keepInterior');
        if (!interior) return;
        const heading = buildingHeading(state.interior);
        text('interiorTitle', heading.title);
        text('interiorKicker', heading.kicker);
        interior.dataset.archiveRestored = String(Boolean(state.snapshot.visualState?.archiveRestored));
        const resident = state.interior === 'woodlot' ? state.snapshot.station?.resident : stationById(state.interior)?.resident;
        document.getElementById('interiorResident')?.classList.toggle('hidden', !resident);
        setResidentOverlayArt(document.getElementById('interiorResidentArt'), resident);
        text('interiorResidentName', resident ? resident.name : '');
        interior.querySelectorAll('[data-facility-resident]').forEach((node) => node.classList.toggle('hidden', !resident));
        interior.querySelectorAll('[data-facility-resident-art]').forEach((node) => setResidentOverlayArt(node, resident));
        interior.querySelectorAll('[data-facility-resident-name]').forEach((node) => { node.textContent = resident?.name || ''; });
        const placed = state.snapshot.placedDecorations || {};
        interior.querySelectorAll('[data-decoration-art]').forEach((node) => {
            node.classList.toggle('is-placed', placed[state.interior] === node.dataset.decorationArt);
        });
        const root = loreById('memorabilia_petrified_root');
        document.getElementById('interiorPlinth')?.classList.toggle('hidden', !root?.displayed);
        const actions = document.getElementById('interiorActions');
        if (actions) actions.innerHTML = buildingMarkup(state.interior);
    }

    function maybeShowTutorial() {
        if (!state.snapshot) return;
        let seen = '';
        try { seen = localStorage.getItem(TUTORIAL_KEY) || ''; } catch (error) { seen = ''; }
        if (!seen) openTutorial(0);
    }

    function openTutorial(step) {
        state.tutorialStep = clamp(number(step), 0, TUTORIAL_STEPS.length - 1);
        renderTutorial();
        document.getElementById('keepTutorial')?.classList.remove('hidden');
    }

    function renderTutorial() {
        const stepDef = TUTORIAL_STEPS[state.tutorialStep];
        if (!stepDef) return;
        text('tutorialArt', stepDef.art);
        text('tutorialKicker', stepDef.kicker);
        text('tutorialTitle', stepDef.title);
        text('tutorialBody', stepDef.body);
        const dots = document.getElementById('tutorialDots');
        if (dots) dots.innerHTML = TUTORIAL_STEPS.map((item, index) => `<i class="${index === state.tutorialStep ? 'active' : ''}"></i>`).join('');
        const next = document.getElementById('tutorialNext');
        if (next) next.textContent = state.tutorialStep >= TUTORIAL_STEPS.length - 1 ? 'Begin' : 'Next';
        document.getElementById('tutorialSkip')?.classList.toggle('hidden', state.tutorialStep >= TUTORIAL_STEPS.length - 1);
    }

    function tutorialAdvance() {
        if (state.tutorialStep >= TUTORIAL_STEPS.length - 1) finishTutorial();
        else openTutorial(state.tutorialStep + 1);
    }

    function finishTutorial() {
        state.tutorialStep = -1;
        try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (error) { /* private browsing */ }
        document.getElementById('keepTutorial')?.classList.add('hidden');
        maybeShowOfflineReport();
    }

    async function craftRecipe(recipeId) {
        const data = await perform('/api/keep/craft', { recipeId });
        if (data?.crafted) showNotice(`${data.crafted.name} is ready.`, 'Crafting complete');
    }

    async function placeDecoration(roomId, decorationId, displayed) {
        await perform('/api/keep/decoration', { roomId, decorationId, displayed });
    }

    function maybeShowOfflineReport() {
        if (!state.pendingOfflineReport || !document.getElementById('keepTutorial')?.classList.contains('hidden')) return;
        const report = state.pendingOfflineReport;
        text('offlineDuration', `Away for ${formatAwayDuration(report.awaySeconds)}. Here is what changed.`);
        const rows = [];
        for (const item of report.produced || []) {
            const icon = item.resource === 'TIMBER' ? '▰' : '✦';
            rows.push(offlineRow(icon, `+${number(item.amount)} ${item.resourceName || titleCase(item.resource)}`, item.stationName || item.stationId));
        }
        for (const name of report.completedProjects || []) rows.push(offlineRow('⚒', 'Construction complete', name));
        for (const title of report.loreFound || []) rows.push(offlineRow('▤', 'Lore discovered', title));
        for (const name of report.capsReached || []) rows.push(offlineRow('!', 'Storage reached capacity', `${name} stopped until collected`, true));
        const results = document.getElementById('offlineResults');
        if (results) results.innerHTML = rows.join('') || offlineRow('✓', 'The Keep held steady', 'No stores were lost.');
        document.getElementById('offlineOverlay')?.classList.remove('hidden');
        state.offlineVisible = true;
    }

    function offlineRow(icon, heading, detail, warning = false) {
        return `<div class="offline-result ${warning ? 'warning' : ''}"><i>${escapeHtml(icon)}</i><span><strong>${escapeHtml(heading)}</strong><small>${escapeHtml(detail)}</small></span></div>`;
    }

    function dismissOfflineReport() {
        document.getElementById('offlineOverlay')?.classList.add('hidden');
        state.pendingOfflineReport = null;
        state.offlineVisible = false;
    }

    function facilitiesMarkup() {
        const facilities = (state.snapshot.stations || []).filter((station) => station.id !== 'woodlot');
        const intro = '<p class="panel-intro">Every workshop has its own resident slot. Matching elements increase output by 20%; Neutral residents lend a 5% bonus anywhere.</p>';
        if (!facilities.length) return `${intro}<div class="empty-state">Restore the Storehouse, then plant the Covenant Garden to open the Elemental Quarter.</div>${rewardsMarkup()}`;
        return `${intro}<div class="facility-grid">${facilities.map((station) => {
            const ready = projectedStationAvailable(station);
            const full = ready >= number(station.storageCapacity);
            return `<section class="facility-card ${full ? 'is-full' : ''}">
                <span class="facility-icon facility-${escapeAttr(station.id)}">${facilityIcon(station.id)}</span>
                <span class="eyebrow">Level ${number(station.level)} · ${escapeHtml(formatRate(station.ratePerMinute))}/min</span>
                <h3>${escapeHtml(station.name)}</h3>
                <p>${ready}/${number(station.storageCapacity)} ${escapeHtml(station.resourceName || 'materials')} ready${full ? ' · Storage full' : ''}</p>
                <div class="meter"><i data-station-meter="${escapeAttr(station.id)}" style="width:${stationFill(station)}%"></i></div>
                <small>Affinity: ${escapeHtml((station.affinityNames || []).join(', '))}</small>
                <div class="facility-resident">${station.resident ? `${residentAvatarContent(station.resident)} <span><strong>${escapeHtml(station.resident.name)}</strong><small>${escapeHtml(station.resident.affinityLabel || '')}</small></span>` : '<span><strong>Open resident slot</strong><small>Production continues at base rate</small></span>'}</div>
                <div class="button-row"><button class="panel-button" type="button" data-collect-station="${escapeAttr(station.id)}" ${ready <= 0 ? 'disabled' : ''}>Collect ${ready}</button><button class="panel-button secondary" type="button" data-open-panel="residents" data-select-station="${escapeAttr(station.id)}">Assign</button><button class="panel-button secondary" type="button" data-enter-facility="${escapeAttr(station.id)}">Enter & craft</button></div>
            </section>`;
        }).join('')}</div>${rewardsMarkup()}`;
    }

    function rewardsMarkup() {
        const milestones = state.snapshot.milestones || [];
        const tribute = state.snapshot.weeklyTribute || {};
        const milestoneCards = milestones.map((item) => `<section class="reward-card ${item.claimed ? 'is-claimed' : ''}">
            <span><small>${item.claimed ? 'Claimed' : item.complete ? 'Complete' : 'Milestone'}</small><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description || '')}</p></span>
            <span class="reward-value">${number(item.reward?.gold)} Siegecoins<br>${number(item.reward?.remnants)} Remnants</span>
            <button class="panel-button" type="button" data-claim-keep-reward="${escapeAttr(item.id)}" ${item.canClaim ? '' : 'disabled'}>${item.claimed ? 'Claimed' : item.complete ? 'Claim' : 'In progress'}</button>
        </section>`).join('');
        const tributeTime = tribute.ready ? 'Ready now' : tribute.nextClaimAt ? `Returns ${formatDateTime(tribute.nextClaimAt)}` : 'Build the Elemental Generator';
        return `<div class="rewards-section"><span class="eyebrow">Keep rewards</span>${milestoneCards}<section class="reward-card tribute-card">
            <span><small>Weekly sanctuary tribute</small><strong>A Gift Returned</strong><p>${escapeHtml(tributeTime)}</p></span>
            <span class="reward-value">${number(tribute.reward?.gold)} Siegecoins<br>${number(tribute.reward?.remnants)} Remnants</span>
            <button class="panel-button" type="button" data-claim-keep-reward="weekly_tribute" ${tribute.ready ? '' : 'disabled'}>${tribute.ready ? 'Claim tribute' : 'Not ready'}</button>
        </section></div>`;
    }

    function residentsMarkup() {
        const residents = state.snapshot.residents || [];
        const stations = state.snapshot.stations || [state.snapshot.station];
        if (!stations.some((station) => station?.id === state.selectedStation)) state.selectedStation = stations[0]?.id || 'woodlot';
        const station = stationById(state.selectedStation) || {};
        const stationTabs = `<div class="station-tabs">${stations.map((item) => `<button class="${item.id === state.selectedStation ? 'active' : ''}" type="button" data-resident-station="${escapeAttr(item.id)}">${escapeHtml(item.name)}</button>`).join('')}</div>`;
        if (!residents.length) return `${stationTabs}<div class="empty-state">Owned Siegeling cards introduce their evolution family to the sanctuary. Choose a starter pack to meet your first residents.</div>`;
        return `${stationTabs}<p class="panel-intro">Assigning a resident to ${escapeHtml(station.name || 'this station')} moves it from any previous work slot. Cards remain available in decks and expeditions.</p>${residents.map((resident) => {
            const assigned = assignmentFor(resident.id);
            const invited = station.residentId === resident.id;
            const affinity = residentAffinity(resident, station);
            let action;
            if (invited) {
                action = `<button class="panel-button secondary" type="button" data-station-id="${escapeAttr(station.id || 'woodlot')}" data-invite-resident="${escapeAttr(resident.id)}">Rest</button>`;
            } else if (assigned) {
                // Already working elsewhere — show the post, not a second Assign that looks free.
                action = `<button class="panel-button secondary assigned-elsewhere" type="button" data-resident-station="${escapeAttr(assigned.id)}" title="Open ${escapeAttr(assigned.name || 'station')}">${escapeHtml(`At ${shortStationName(assigned)}`)}</button>`;
            } else {
                action = `<button class="panel-button" type="button" data-station-id="${escapeAttr(station.id || 'woodlot')}" data-invite-resident="${escapeAttr(resident.id)}">Assign</button>`;
            }
            return `<section class="resident-card ${invited ? 'is-invited' : assigned ? 'is-assigned-elsewhere' : ''}">
                <span class="resident-avatar" style="--resident-color:${escapeAttr(elementColors[resident.element] || elementColors.NEUTRAL)}">${residentAvatarContent(resident)}</span>
                <span class="resident-copy"><h3>${escapeHtml(resident.name)}</h3><small>${escapeHtml(resident.element)} · ${escapeHtml(affinity)}</small></span>
                ${action}
            </section>`;
        }).join('')}`;
    }

    function residentsMarkupLegacy() {
        const residents = state.snapshot.residents || [];
        if (!residents.length) return '<div class="empty-state">Owned Siegeling cards will introduce their evolution family to the sanctuary. Choose a starter pack to meet your first residents.</div>';
        const current = state.snapshot.station?.residentId || '';
        return `<p class="panel-intro">Invitations never lock a card. Affinity reflects what a resident enjoys doing—not its rarity or power.</p>${residents.map((resident) => {
            const invited = current === resident.id;
            return `<section class="resident-card ${invited ? 'is-invited' : ''}">
                <span class="resident-avatar" style="--resident-color:${escapeAttr(elementColors[resident.element] || elementColors.NEUTRAL)}">${residentAvatarContent(resident)}</span>
                <span class="resident-copy"><h3>${escapeHtml(resident.name)}</h3><small>${escapeHtml(resident.element)} · ${escapeHtml(resident.affinityLabel || '')}</small></span>
                <button class="panel-button ${invited ? 'secondary' : ''}" type="button" data-invite-resident="${escapeAttr(resident.id)}">${invited ? 'Rest' : 'Invite'}</button>
            </section>`;
        }).join('')}`;
    }

    function projectsMarkup() {
        const construction = state.snapshot.activeConstruction;
        let projects = '';
        if (construction) {
            projects = `<section class="project-card"><span class="eyebrow">In progress</span><h3>${escapeHtml(projectName(construction.id))}</h3><p>The site changes through foundations, scaffolding, and completion. No progress is lost while you are away.</p><div class="meter"><i data-live-construction-meter style="width:${constructionPercent()}%"></i></div><div class="cost-row"><span data-live-construction-time>${escapeHtml(formatDuration(constructionRemaining()))}</span><strong>Workers active</strong></div></section>`;
        } else {
            const options = state.snapshot.buildOptions || [];
            projects = options.length ? options.map((option) => {
                const costs = [`▰ ${number(option.timberCost)} timber`];
                for (const cost of option.materialCosts || []) costs.push(`${materialIcon(cost.id)} ${number(cost.amount)} ${cost.name}`);
                const shortages = [];
                if (number(state.snapshot.resources?.timber) < number(option.timberCost)) shortages.push('timber');
                for (const cost of option.materialCosts || []) {
                    if (number(materialById(cost.id)?.amount) < number(cost.amount)) shortages.push(cost.name);
                }
                return `<section class="project-card"><span class="eyebrow">Visible restoration</span><h3>${escapeHtml(option.name)}</h3><p>${escapeHtml(option.description || '')}</p>
                    <div class="cost-row"><span>${escapeHtml(formatDuration(option.durationSeconds))}</span><strong>${escapeHtml(costs.join(' · '))}</strong></div>
                    <div class="button-row"><button class="panel-button" type="button" data-start-build="${escapeAttr(option.id)}" ${option.canStart ? '' : 'disabled'}>${option.canStart ? 'Begin project' : `Need ${escapeHtml(shortages.join(' & ') || 'prior project')}`}</button></div></section>`;
            }).join('') : '<div class="empty-state">Every current restoration is complete. Weekly tribute and resident affinities keep the sanctuary useful while future chapters arrive.</div>';
        }
        return `${projects}${rewardsMarkup()}`;
    }

    function projectsMarkupLegacy() {
        const construction = state.snapshot.activeConstruction;
        if (construction) {
            return `<section class="project-card"><span class="eyebrow">In progress</span><h3>${escapeHtml(projectName(construction.id))}</h3><p>The site changes through foundations, scaffolding, and completion. No progress is lost while you are away.</p><div class="meter"><i data-live-construction-meter style="width:${constructionPercent()}%"></i></div><div class="cost-row"><span data-live-construction-time>${escapeHtml(formatDuration(constructionRemaining()))}</span><strong>Workers active</strong></div></section>`;
        }
        const options = state.snapshot.buildOptions || [];
        if (!options.length) return '<div class="empty-state">The first restoration chain is complete. Future milestones will open the Warehouse, gardens, walls, and elemental workshops.</div>';
        return options.map((option) => `<section class="project-card">
            <span class="eyebrow">Visible restoration</span><h3>${escapeHtml(option.name)}</h3><p>${escapeHtml(option.description || '')}</p>
            <div class="cost-row"><span>${escapeHtml(formatDuration(option.durationSeconds))}</span><strong>▰ ${number(option.timberCost)} timber</strong></div>
            <div class="button-row"><button class="panel-button" type="button" data-start-build="${escapeAttr(option.id)}" ${option.canStart ? '' : 'disabled'}>${option.canStart ? 'Begin project' : `Need ${number(option.timberCost)} timber`}</button></div>
        </section>`).join('');
    }

    function chronicleMarkup() {
        const tabs = [
            ['ALL', 'All'], ['LETTER', 'Letters'], ['MEMORABILIA', 'Relics'], ['CHRONICLE', 'Chronicle']
        ];
        const entries = (state.snapshot.lore || []).filter((item) => state.loreFilter === 'ALL' || item.type === state.loreFilter);
        return `<div class="lore-tabs">${tabs.map(([id, label]) => `<button class="${state.loreFilter === id ? 'active' : ''}" type="button" data-lore-filter="${id}">${label}</button>`).join('')}</div>
            ${entries.length ? entries.map(loreCardMarkup).join('') : '<div class="empty-state">No discoveries in this collection yet. Production, construction, and conversations uncover new records.</div>'}`;
    }

    function loreCardMarkup(item) {
        const expanded = state.expandedLoreId === item.id;
        const memorabilia = item.type === 'MEMORABILIA';
        return `<article class="lore-card ${item.read ? '' : 'unread'} ${expanded ? 'expanded' : ''}" data-lore-id="${escapeAttr(item.id)}">
            ${memorabilia && expanded ? '<div class="memorabilia-figure"><span class="root-art"></span></div>' : ''}
            <span class="eyebrow">${escapeHtml(typeLabel(item.type))}</span><h3>${escapeHtml(item.title)}</h3>
            <div class="card-meta"><span>${escapeHtml(item.perspective || 'Unknown source')}</span><span>${escapeHtml(item.era || '')}</span></div>
            <p>${escapeHtml(item.summary || '')}</p>
            ${expanded ? `<p class="lore-body">${escapeHtml(item.body || '')}</p><small>${escapeHtml(item.source || '')}</small>${memorabilia ? `<div class="button-row"><button class="panel-button ${item.displayed ? 'secondary' : ''}" type="button" data-memorabilia-id="${escapeAttr(item.id)}" data-displayed="${String(Boolean(item.displayed))}">${item.displayed ? 'Return to collection' : 'Display in keep'}</button></div>` : ''}` : ''}
        </article>`;
    }

    function conversationsMarkup() {
        const conversations = state.snapshot.availableConversations || [];
        const relationships = state.snapshot.relationships || [];
        const available = conversations.length
            ? conversations.map((conversation) => {
                const visitor = String(conversation.kind || '').toUpperCase() === 'VISITOR';
                return `<section class="conversation-card ${visitor ? 'is-visitor' : ''}" data-conversation-id="${escapeAttr(conversation.id)}"><span class="npc-mini">${escapeHtml(initials(conversation.npcName))}</span><span><small>${escapeHtml(visitor ? 'Road visitor' : conversation.npcRole)}</small><h3>${escapeHtml(conversation.npcName)}</h3><p>${escapeHtml(conversation.kicker || 'Waiting to speak')}</p>${visitor ? '<em class="visitor-tag">Trade · gift · risk</em>' : ''}</span></section>`;
            }).join('')
            : '<div class="empty-state">No one is waiting to speak. Lore discoveries and the road draw new visitors with trades, gifts, and risks.</div>';
        const bonds = relationships.length
            ? `<span class="eyebrow">Relationships</span><p class="panel-intro relationship-hint">Select a voice to view where they stand — from wary distance to bonded trust.</p>${relationships.map((item) => relationshipCardMarkup(item)).join('')}`
            : '';
        return `<p class="panel-intro">Story voices shape the Chronicle. Road and yard visitors bring RNG slices of Siegeling daily life—breakfast, nests, play, chores—where timber and materials can be gained, traded, or lost.</p>${available}${bonds}`;
    }

    function relationshipCardMarkup(item) {
        const selected = state.selectedRelationshipId === item.npcId;
        const trust = Math.max(0, number(item.trust));
        const trustMax = Math.max(1, number(item.trustMax) || 7);
        const fill = Math.round(clamp(trust / trustMax, 0, 1) * 100);
        const stage = item.stage || relationshipStage(trust);
        const feeling = trust >= 7 ? 'They stand with you.'
            : trust >= 3 ? 'They trust your word.'
                : trust >= 1 ? 'They know your name.'
                    : 'They keep their distance.';
        return `<button class="relationship-card ${selected ? 'is-selected' : ''}" type="button" data-relationship-id="${escapeAttr(item.npcId)}" aria-expanded="${selected ? 'true' : 'false'}">
            <span class="relationship-head"><strong>${escapeHtml(item.npcName)}</strong><span class="relationship-stage">${escapeHtml(stage)}</span></span>
            <span class="relationship-spectrum" role="meter" aria-valuemin="0" aria-valuemax="${trustMax}" aria-valuenow="${trust}" aria-label="${escapeAttr(`${item.npcName} relationship: ${stage}`)}">
                <span class="spectrum-ends" aria-hidden="true"><i>Distant</i><i>Bonded</i></span>
                <span class="spectrum-track"><i style="width:${fill}%"></i><em style="left:${fill}%"></em></span>
                <span class="spectrum-labels" aria-hidden="true"><i>Wary</i><i>Acquainted</i><i>Trusted</i><i>Bonded</i></span>
            </span>
            ${selected ? `<span class="relationship-detail"><small>Trust ${trust}/${trustMax}</small><p>${escapeHtml(feeling)}</p></span>` : ''}
        </button>`;
    }

    function inventoryMarkup() {
        const resources = state.snapshot.resources || {};
        const materials = resources.materials || [];
        const recipes = state.snapshot.recipes || [];
        const crafted = recipes.filter((item) => item.crafted);
        const filter = state.inventoryFilter || 'ALL';
        const tabs = [
            ['ALL', 'All'],
            ['RAW', 'Raw'],
            ['CRAFTED', 'Manufactured']
        ];
        const showRaw = filter === 'ALL' || filter === 'RAW';
        const showCrafted = filter === 'ALL' || filter === 'CRAFTED';
        const timberCap = number(resources.timberCapacity);
        const materialCap = number(resources.materialCapacity);
        const rawCards = `
            <section class="inventory-card raw-card">
                <span class="inventory-icon" aria-hidden="true">▰</span>
                <span class="inventory-copy"><small>Raw · Woodlot</small><h3>Timber</h3>
                <div class="meter"><i style="width:${Math.round(clamp(number(resources.timber) / Math.max(1, timberCap), 0, 1) * 100)}%"></i></div>
                <strong>${number(resources.timber)} / ${timberCap}</strong></span>
            </section>
            ${materials.map((item) => `<section class="inventory-card raw-card">
                <span class="inventory-icon" aria-hidden="true">${materialIcon(item.id)}</span>
                <span class="inventory-copy"><small>Raw · ${escapeHtml(facilityTitle(item.facilityId))}</small><h3>${escapeHtml(item.name)}</h3>
                <div class="meter"><i style="width:${Math.round(clamp(number(item.amount) / Math.max(1, number(item.capacity) || materialCap), 0, 1) * 100)}%"></i></div>
                <strong>${number(item.amount)} / ${number(item.capacity) || materialCap}</strong></span>
            </section>`).join('')}`;
        const craftedCards = crafted.length
            ? crafted.map((item) => `<section class="inventory-card crafted-card">
                <span class="inventory-icon" aria-hidden="true">${craftedIcon(item.type)}</span>
                <span class="inventory-copy"><small>Manufactured · ${escapeHtml(titleCase(item.type || 'item'))}</small><h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.bonus || item.description || 'Ready in the Keep.')}</p>
                <strong>×${Math.max(1, number(item.count))}</strong></span>
            </section>`).join('')
            : '<div class="empty-state">No manufactured goods yet. Craft tools, bonuses, and decorations inside restored workshops.</div>';
        return `<p class="panel-intro">Raw stocks come from the Woodlot and elemental workshops. Manufactured goods are crafted items held by the Keep.</p>
            <div class="lore-tabs inventory-tabs">${tabs.map(([id, label]) => `<button class="${filter === id ? 'active' : ''}" type="button" data-inventory-filter="${id}">${label}</button>`).join('')}</div>
            ${showRaw ? `<span class="eyebrow">Raw materials</span>${rawCards}` : ''}
            ${showCrafted ? `<span class="eyebrow">Manufactured</span>${craftedCards}` : ''}`;
    }

    function updatePanelLiveValues() {
        document.querySelectorAll('[data-live-woodlot-meter]').forEach((meter) => { meter.style.width = `${woodlotFill()}%`; });
        document.querySelectorAll('[data-station-meter]').forEach((meter) => {
            meter.style.width = `${stationFill(stationById(meter.dataset.stationMeter))}%`;
        });
        document.querySelectorAll('[data-live-construction-time]').forEach((time) => { time.textContent = formatDuration(constructionRemaining()); });
        document.querySelectorAll('[data-live-construction-meter]').forEach((meter) => { meter.style.width = `${constructionPercent()}%`; });
    }

    function setPanelHeading(title, kicker) {
        text('panelTitle', title);
        text('panelKicker', kicker);
    }

    function enqueueDiscoveries(ids) {
        for (const id of ids || []) {
            const item = loreById(id);
            if (item && !state.discoveryQueue.some((queued) => queued.id === id)) state.discoveryQueue.push(item);
        }
        showNextDiscovery();
    }

    function showNextDiscovery() {
        const toast = document.getElementById('discoveryToast');
        if (!toast || !state.discoveryQueue.length || !toast.classList.contains('hidden')) return;
        const item = state.discoveryQueue[0];
        toast.dataset.loreId = item.id;
        text('discoveryTitle', item.title);
        document.getElementById('discoveryOpen')?.classList.remove('hidden');
        toast.classList.remove('hidden');
        clearTimeout(state.discoveryTimer);
        state.discoveryTimer = window.setTimeout(dismissDiscovery, 6500);
    }

    function dismissDiscovery() {
        const toast = document.getElementById('discoveryToast');
        toast?.classList.add('hidden');
        state.discoveryQueue.shift();
        window.setTimeout(showNextDiscovery, 180);
    }

    function openLatestDiscovery() {
        const id = document.getElementById('discoveryToast')?.dataset.loreId || '';
        dismissDiscovery();
        state.loreFilter = 'ALL';
        openPanel('chronicle');
        if (id) void openLore(id);
    }

    function showNotice(message, heading) {
        const toast = document.getElementById('discoveryToast');
        if (!toast) return;
        clearTimeout(state.discoveryTimer);
        toast.dataset.loreId = '';
        const small = toast.querySelector('small');
        if (small) small.textContent = heading || 'My Keep';
        text('discoveryTitle', message || 'Something changed.');
        document.getElementById('discoveryOpen')?.classList.add('hidden');
        toast.classList.remove('hidden');
        state.discoveryTimer = window.setTimeout(() => toast.classList.add('hidden'), 4200);
    }

    function showGate(message) {
        text('gateMessage', message || 'Sign in and choose a starter pack to begin rebuilding My Keep.');
        document.getElementById('keepGate')?.classList.remove('hidden');
    }

    function hideLoading() {
        document.getElementById('keepLoading')?.classList.add('hidden');
    }

    async function fetchJson(path, options = {}) {
        if (state.testMode) return mockApi(path, options);
        const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token && token !== COOKIE_SESSION_VALUE) headers.Authorization = `Bearer ${token}`;
        try {
            const response = await fetch(`${apiBase}${path}`, { credentials: 'same-origin', ...options, headers });
            const raw = await response.text();
            let data = {};
            if (raw) {
                try {
                    data = JSON.parse(raw);
                } catch (error) {
                    data = { error: response.ok ? 'My Keep received an unexpected server response.' : (response.statusText || 'Request failed.') };
                }
            }
            if (!response.ok) data = { ...data, error: data.error || response.statusText || 'Request failed.', status: response.status };
            return data;
        } catch (error) {
            console.error(error);
            return { error: 'My Keep could not reach the server. Check your connection and try again.' };
        }
    }

    function mockApi(path, options) {
        if (typeof window.__KEEP_TEST_API__ === 'function') {
            return Promise.resolve(window.__KEEP_TEST_API__(path, options, clone(state.snapshot)));
        }
        const snapshot = clone(state.snapshot || window.__KEEP_TEST_SNAPSHOT__);
        delete snapshot.newLoreUnlocks;
        if (!options?.method || options.method === 'GET') return Promise.resolve(snapshot);
        const body = options.body ? JSON.parse(options.body) : {};
        snapshot.stateVersion = number(snapshot.stateVersion) + 1;
        snapshot.serverTime = new Date(nowMs()).toISOString();
        if (path.endsWith('/collect')) {
            const stationId = body.stationId || 'woodlot';
            const station = (snapshot.stations || [snapshot.station]).find((item) => item.id === stationId) || snapshot.station;
            const amount = projectedStationAvailable(station);
            if (stationId === 'woodlot') {
                snapshot.resources.timber = Math.min(snapshot.resources.timberCapacity, snapshot.resources.timber + amount);
                snapshot.station.collectCount = number(snapshot.station.collectCount) + 1;
                if (snapshot.station.collectCount === 1) mockUnlock(snapshot, 'letter_forester_maren');
                if (snapshot.station.collectCount >= 3) mockUnlock(snapshot, 'memorabilia_petrified_root');
            } else {
                const material = (snapshot.resources.materials || []).find((item) => item.id === station.resource);
                if (material) material.amount = Math.min(number(material.capacity || snapshot.resources.materialCapacity), number(material.amount) + amount);
            }
            station.available = 0;
            snapshot.collected = { resource: stationId === 'woodlot' ? 'TIMBER' : 'ESSENCE', amount, stationId };
        } else if (path.endsWith('/resident')) {
            const stationId = body.stationId || 'woodlot';
            const stations = snapshot.stations || [snapshot.station];
            for (const item of stations) {
                if (item.residentId === body.residentId) { item.residentId = ''; item.resident = null; }
            }
            const station = stations.find((item) => item.id === stationId) || snapshot.station;
            station.residentId = body.residentId || '';
            station.resident = (snapshot.residents || []).find((item) => item.id === body.residentId) || null;
        } else if (path.endsWith('/build')) {
            const option = (snapshot.buildOptions || []).find((item) => item.id === body.buildId);
            if (option) {
                snapshot.resources.timber -= option.timberCost;
                for (const cost of option.materialCosts || []) {
                    const material = (snapshot.resources.materials || []).find((item) => item.id === cost.id);
                    if (material) material.amount = Math.max(0, number(material.amount) - number(cost.amount));
                }
                snapshot.activeConstruction = {
                    id: option.id,
                    startedAt: new Date(nowMs()).toISOString(),
                    completesAt: new Date(nowMs() + option.durationSeconds * 1000).toISOString(),
                    remainingSeconds: option.durationSeconds,
                    progress: 0
                };
                snapshot.buildOptions = [];
            }
        } else if (path.endsWith('/lore/read')) {
            const entry = (snapshot.lore || []).find((item) => item.id === body.loreId);
            if (entry && !entry.read) {
                entry.read = true;
                snapshot.unreadLoreCount = Math.max(0, number(snapshot.unreadLoreCount) - 1);
            }
        } else if (path.endsWith('/memorabilia')) {
            const entry = (snapshot.lore || []).find((item) => item.id === body.loreId);
            if (entry) entry.displayed = Boolean(body.displayed);
        } else if (path.endsWith('/dialogue/choose')) {
            const conversation = (snapshot.availableConversations || []).find((item) => item.id === body.conversationId);
            const choice = conversation?.choices?.find((item) => item.id === body.choiceId);
            snapshot.availableConversations = (snapshot.availableConversations || []).filter((item) => item.id !== body.conversationId);
            if (number(choice?.timberCost) > 0) {
                snapshot.resources.timber = Math.max(0, number(snapshot.resources.timber) - number(choice.timberCost));
            }
            for (const cost of choice?.materialCosts || []) {
                const material = (snapshot.resources.materials || []).find((item) => item.id === cost.id);
                if (material) material.amount = Math.max(0, number(material.amount) - number(cost.amount));
            }
            snapshot.dialogueResult = {
                npcId: conversation?.npcId,
                npcName: conversation?.npcName,
                kind: conversation?.kind || 'STORY',
                response: choice?.response || 'The sanctuary remembers your answer.',
                summary: choiceCostHint(choice || {}) ? `Spent ${choiceCostHint(choice)}.` : 'No stores changed.'
            };
        } else if (path.endsWith('/reward')) {
            const item = (snapshot.milestones || []).find((milestone) => milestone.id === body.rewardId);
            const reward = item?.reward || snapshot.weeklyTribute?.reward || {};
            snapshot.resources.gold = number(snapshot.resources.gold) + number(reward.gold);
            snapshot.resources.remnants = number(snapshot.resources.remnants) + number(reward.remnants);
            if (item) { item.claimed = true; item.canClaim = false; }
            if (body.rewardId === 'weekly_tribute' && snapshot.weeklyTribute) snapshot.weeklyTribute.ready = false;
            snapshot.rewardClaimed = { id: body.rewardId, gold: number(reward.gold), remnants: number(reward.remnants) };
        } else if (path.endsWith('/craft')) {
            const recipe = (snapshot.recipes || []).find((item) => item.id === body.recipeId);
            if (recipe) {
                for (const cost of recipe.costs || []) {
                    const material = (snapshot.resources.materials || []).find((item) => item.id === cost.id);
                    if (material) material.amount = Math.max(0, number(material.amount) - number(cost.amount));
                }
                recipe.crafted = true; recipe.canCraft = false; recipe.count = 1;
                const decoration = (snapshot.decorations || []).find((item) => item.id === recipe.id);
                if (decoration) decoration.crafted = true;
                snapshot.crafted = { id: recipe.id, name: recipe.name, type: recipe.type };
            }
        } else if (path.endsWith('/decoration')) {
            snapshot.placedDecorations = snapshot.placedDecorations || {};
            if (body.displayed) snapshot.placedDecorations[body.roomId] = body.decorationId;
            else if (snapshot.placedDecorations[body.roomId] === body.decorationId) delete snapshot.placedDecorations[body.roomId];
            const decoration = (snapshot.decorations || []).find((item) => item.id === body.decorationId);
            if (decoration) decoration.displayed = Boolean(body.displayed);
        }
        window.__KEEP_TEST_SNAPSHOT__ = clone(snapshot);
        return Promise.resolve(snapshot);
    }

    function mockUnlock(snapshot, id) {
        const catalog = window.__KEEP_TEST_LORE_CATALOG__ || [];
        const entry = catalog.find((item) => item.id === id);
        if (entry && !(snapshot.lore || []).some((item) => item.id === id)) {
            snapshot.lore.push(clone(entry));
            snapshot.unreadLoreCount = number(snapshot.unreadLoreCount) + 1;
            snapshot.newLoreUnlocks = [...(snapshot.newLoreUnlocks || []), id];
        }
    }

    function completeMockConstructionIfReady() {
        const snapshot = state.snapshot;
        const construction = snapshot?.activeConstruction;
        if (!construction || constructionRemaining() > 0) return;
        if (construction.id === 'restore_archive') {
            snapshot.visualState.archiveRestored = true;
            const archive = (snapshot.buildings || []).find((item) => item.id === 'archive');
            if (archive) { archive.level = 1; archive.status = 'COMPLETE'; archive.name = 'Living Archive'; }
            mockUnlock(snapshot, 'chronicle_living_elements');
            mockUnlock(snapshot, 'letter_pre_covenant_watch');
        } else if (construction.id === 'woodlot_level_2') {
            snapshot.visualState.woodlotLevel = 2;
            snapshot.station.level = 2;
            snapshot.station.ratePerMinute *= 2;
            mockUnlock(snapshot, 'letter_green_covenant');
        }
        snapshot.activeConstruction = null;
        snapshot.stateVersion = number(snapshot.stateVersion) + 1;
        applySnapshot(snapshot, true);
    }

    function projectedAvailable() {
        return projectedStationAvailable(state.snapshot?.station);
    }

    function projectedStationAvailable(station) {
        if (!station) return 0;
        const elapsedMinutes = Math.max(0, (nowMs() - state.receivedAtMs) / 60000);
        return Math.min(number(station.storageCapacity), number(station.available) + Math.floor(elapsedMinutes * number(station.ratePerMinute)));
    }

    function stationById(id) {
        return (state.snapshot?.stations || [state.snapshot?.station]).find((station) => station?.id === id) || null;
    }

    function assignmentFor(residentId) {
        if (!residentId) return null;
        return (state.snapshot?.stations || []).find((station) => station?.residentId === residentId)
            || (state.snapshot?.station?.residentId === residentId ? state.snapshot.station : null);
    }

    function shortStationName(station) {
        const shorts = {
            woodlot: 'Woodlot', garden: 'Garden', forge: 'Forge', fridge: 'Fridge', generator: 'Generator'
        };
        if (station?.id && shorts[station.id]) return shorts[station.id];
        return String(station?.name || 'station')
            .replace(/^Restorative\s+/i, '')
            .replace(/^Covenant\s+/i, '')
            .replace(/^Accord\s+/i, '')
            .replace(/^Frost\s+/i, '')
            .replace(/^Elemental\s+/i, '');
    }

    function facilityTitle(id) {
        return ({ woodlot: 'Woodlot', garden: 'Garden', forge: 'Forge', fridge: 'Fridge', generator: 'Generator' })[id] || titleCase(id || 'workshop');
    }

    function craftedIcon(type) {
        return ({ TOOL: '⚒', BONUS: '✦', DECORATION: '◇' })[String(type || '').toUpperCase()] || '◆';
    }

    function relationshipStage(trust) {
        const value = Math.max(0, number(trust));
        if (value >= 7) return 'Bonded';
        if (value >= 3) return 'Trusted';
        if (value >= 1) return 'Acquainted';
        return 'Wary';
    }

    function materialById(id) {
        return (state.snapshot?.resources?.materials || []).find((item) => item.id === id) || null;
    }

    function materialIcon(id) {
        return ({ verdant_fiber: '❧', ember_ingot: '◆', frost_crystal: '❄', storm_cell: '⚡' })[id] || '✦';
    }

    function stationFill(station) {
        return Math.round(clamp(projectedStationAvailable(station) / Math.max(1, number(station?.storageCapacity)), 0, 1) * 100);
    }

    function facilityIcon(id) {
        return ({ garden: '❧', forge: '♨', fridge: '❄', generator: '⚡', woodlot: '♧' })[id] || '✦';
    }

    function residentAffinity(resident, station) {
        const affinities = station?.affinities || (station?.id === 'woodlot' ? ['EARTH', 'WIND', 'WATER', 'LIGHT'] : []);
        if (affinities.includes(resident.element)) return `${titleCase(resident.element)} affinity · +${station?.id === 'woodlot' ? 15 : 20}%`;
        if (resident.element === 'NEUTRAL' && station?.id !== 'woodlot') return 'Neutral affinity · +5%';
        return 'Normal rate';
    }

    function constructionRemaining() {
        const completes = Date.parse(state.snapshot?.activeConstruction?.completesAt || '');
        return Number.isFinite(completes) ? Math.max(0, Math.ceil((completes - nowMs()) / 1000)) : 0;
    }

    function constructionPercent() {
        const construction = state.snapshot?.activeConstruction;
        if (!construction) return 0;
        const started = Date.parse(construction.startedAt || '') || nowMs();
        const completes = Date.parse(construction.completesAt || '') || nowMs();
        return Math.round(clamp((nowMs() - started) / Math.max(1, completes - started), 0, 1) * 100);
    }

    function woodlotFill() {
        return Math.round(clamp(projectedAvailable() / Math.max(1, number(state.snapshot?.station?.storageCapacity)), 0, 1) * 100);
    }

    function nowMs() { return Date.now() + state.debugTimeOffsetMs; }
    function loreById(id) { return (state.snapshot?.lore || []).find((item) => item.id === id); }
    function conversationById(id) { return (state.snapshot?.availableConversations || []).find((item) => item.id === id); }
    function projectName(id) {
        const names = {
            restore_archive: 'Restore the Living Archive', woodlot_level_2: 'Cultivate the Woodlot',
            raise_storehouse: 'Raise the Covenant Storehouse', build_garden: 'Plant the Covenant Garden',
            build_forge: 'Kindle the Accord Forge', build_fridge: 'Raise the Frost Fridge',
            build_generator: 'Tune the Elemental Generator', storehouse_level_2: 'Vault the Storehouse'
        };
        if (names[id]) return names[id];
        if (String(id).endsWith('_level_2')) return `Expand the ${titleCase(String(id).replace('_level_2', '').replaceAll('_', ' '))}`;
        return 'Construction project';
    }
    function typeLabel(type) { return type === 'LETTER' ? 'Recovered letter' : type === 'MEMORABILIA' ? 'Memorabilia' : 'Chronicle'; }
    function formatRate(value) { const rate = number(value); return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0$/, ''); }

    function formatDuration(seconds) {
        let remaining = Math.max(0, Math.round(number(seconds)));
        const days = Math.floor(remaining / 86400); remaining %= 86400;
        const hours = Math.floor(remaining / 3600); remaining %= 3600;
        const minutes = Math.floor(remaining / 60); const secs = remaining % 60;
        if (days) return `${days}d ${hours}h`;
        if (hours) return `${hours}h ${minutes}m`;
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    function formatAwayDuration(seconds) {
        const total = Math.max(0, Math.round(number(seconds)));
        const days = Math.floor(total / 86400);
        const hours = Math.floor((total % 86400) / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        if (days) return `${days}d ${hours}h`;
        if (hours) return `${hours}h ${minutes}m`;
        return `${Math.max(1, minutes)}m`;
    }

    function formatDateTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'later' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function titleCase(value) {
        return String(value || '').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function residentAvatarContent(resident) {
        if (resident?.artUrl) return `<img src="${escapeAttr(resident.artUrl)}" alt="">`;
        return escapeHtml(initials(resident?.name || 'S'));
    }

    /** Scene residents use Siege-style standing overlay cutouts when art is available. */
    function setResidentOverlayArt(node, resident) {
        if (!node) return;
        node.classList.toggle('has-overlay-art', Boolean(resident?.artUrl));
        node.innerHTML = resident ? residentAvatarContent(resident) : '';
    }

    function initials(value) {
        return String(value || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    }

    function roman(value) { return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][Math.max(0, Math.min(8, number(value) - 1))] || 'I'; }
    function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function text(id, value) { const node = document.getElementById(id); if (node) node.textContent = String(value ?? ''); }
    function isTyping(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
    function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
    function requestId() { return window.crypto?.randomUUID?.() || `keep-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
            else await document.exitFullscreen?.();
        } catch (error) {
            console.warn('Fullscreen unavailable', error);
        }
    }

    window.advanceTime = function (ms) {
        state.debugTimeOffsetMs += Math.max(0, number(ms));
        if (state.testMode) completeMockConstructionIfReady();
        updateLiveCounters();
    };

    window.render_game_to_text = function () {
        const snapshot = state.snapshot;
        if (!snapshot) return JSON.stringify({
            mode: 'keep',
            status: document.getElementById('keepGate')?.classList.contains('hidden') ? 'loading' : 'sign-in-required'
        });
        return JSON.stringify({
            mode: 'keep',
            coordinateSystem: 'The keep scene uses viewport percentages; origin is top-left, x increases right, y increases down.',
            chapter: snapshot.chapter,
            resources: {
                timber: number(snapshot.resources?.timber), timberCapacity: number(snapshot.resources?.timberCapacity),
                materials: (snapshot.resources?.materials || []).map((item) => ({ id: item.id, amount: number(item.amount), capacity: number(item.capacity) })),
                siegecoins: number(snapshot.resources?.gold), remnants: number(snapshot.resources?.remnants)
            },
            station: {
                id: 'woodlot', level: number(snapshot.station?.level), availableTimber: projectedAvailable(),
                capacity: number(snapshot.station?.storageCapacity), ratePerMinute: number(snapshot.station?.ratePerMinute),
                invitedResident: snapshot.station?.resident?.name || null
            },
            buildings: (snapshot.buildings || []).map((item) => ({ id: item.id, level: item.level, status: item.status })),
            stations: (snapshot.stations || []).map((station) => ({
                id: station.id, level: number(station.level), available: projectedStationAvailable(station),
                capacity: number(station.storageCapacity), ratePerMinute: number(station.ratePerMinute),
                resident: station.resident?.name || null, affinities: station.affinities || []
            })),
            milestones: (snapshot.milestones || []).map((item) => ({ id: item.id, complete: Boolean(item.complete), claimed: Boolean(item.claimed), canClaim: Boolean(item.canClaim) })),
            weeklyTribute: snapshot.weeklyTribute || null,
            recipes: (snapshot.recipes || []).map((item) => ({ id: item.id, roomId: item.roomId, type: item.type, crafted: Boolean(item.crafted), canCraft: Boolean(item.canCraft) })),
            relationships: (snapshot.relationships || []).map((item) => ({
                npcId: item.npcId, npcName: item.npcName, stage: item.stage,
                trust: number(item.trust), trustMax: number(item.trustMax) || 7
            })),
            selectedRelationshipId: state.selectedRelationshipId || null,
            inventoryFilter: state.inventoryFilter || 'ALL',
            placedDecorations: snapshot.placedDecorations || {},
            construction: snapshot.activeConstruction ? { id: snapshot.activeConstruction.id, remainingSeconds: constructionRemaining(), progressPercent: constructionPercent(), collapsed: state.constructionCollapsed } : null,
            activePanel: state.panel || null,
            interior: state.interior || null,
            tutorialVisible: !document.getElementById('keepTutorial')?.classList.contains('hidden'),
            offlineReportVisible: state.offlineVisible,
            unreadLore: number(snapshot.unreadLoreCount),
            discoveries: (snapshot.lore || []).map((item) => ({ id: item.id, type: item.type, title: item.title, read: Boolean(item.read), displayed: Boolean(item.displayed) })),
            availableConversations: (snapshot.availableConversations || []).map((item) => ({ id: item.id, npc: item.npcName }))
        });
    };
})();
