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
    }

    function handleClick(event) {
        const panelTrigger = event.target.closest('[data-open-panel]');
        if (panelTrigger) {
            openPanel(panelTrigger.dataset.openPanel);
            return;
        }
        const building = event.target.closest('[data-building]');
        if (building) {
            openInterior(building.dataset.building);
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
            void inviteResident(invite.dataset.inviteResident);
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
        await perform('/api/keep/collect', {});
    }

    async function inviteResident(residentId) {
        const current = state.snapshot?.station?.residentId || '';
        await perform('/api/keep/resident', { residentId: current === residentId ? '' : residentId });
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
        text('dialogueRole', conversation.npcRole);
        text('dialogueName', conversation.npcName);
        text('dialogueKicker', conversation.kicker);
        text('dialoguePrompt', conversation.prompt);
        const choices = document.getElementById('dialogueChoices');
        if (choices) {
            choices.innerHTML = (conversation.choices || []).map((choice) =>
                `<button type="button" data-dialogue-choice="${escapeAttr(choice.id)}">${escapeHtml(choice.label)}</button>`
            ).join('');
        }
        document.getElementById('dialogueOverlay')?.classList.remove('hidden');
    }

    async function chooseDialogue(choiceId) {
        const conversationId = state.activeConversationId;
        const data = await perform('/api/keep/dialogue/choose', { conversationId, choiceId });
        if (!data) return;
        const result = data.dialogueResult || {};
        text('dialoguePrompt', result.response || 'The conversation settles into a thoughtful silence.');
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

        const scene = document.getElementById('keepScene');
        const visual = snapshot.visualState || {};
        if (scene) {
            scene.dataset.healingStage = String(number(visual.healingStage));
            scene.dataset.archiveRestored = String(Boolean(visual.archiveRestored));
            scene.dataset.woodlotLevel = String(number(visual.woodlotLevel) || 1);
            scene.classList.toggle('is-building-archive', snapshot.activeConstruction?.id === 'restore_archive');
            scene.classList.toggle('is-building-woodlot', snapshot.activeConstruction?.id === 'woodlot_level_2');
        }

        const station = snapshot.station || {};
        text('woodlotLabel', `Level ${number(station.level) || 1} · ${formatRate(station.ratePerMinute)}/min`);
        const resident = station.resident;
        const worker = document.getElementById('residentWorker');
        worker?.classList.toggle('hidden', !resident);
        const workerArt = document.getElementById('residentWorkerArt');
        if (workerArt) workerArt.innerHTML = resident ? residentAvatarContent(resident) : '';

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
        text('stationAvailable', available);
        text('collectAmount', `${available} timber`);
        const collect = document.getElementById('collectButton');
        if (collect) collect.disabled = available <= 0 || number(state.snapshot.resources?.timber) >= number(state.snapshot.resources?.timberCapacity) || state.busy;
        document.getElementById('productionReady')?.classList.toggle('hidden', available <= 0);
        renderConstruction();
        if (state.panel.startsWith('building:woodlot') || state.panel === 'projects' || state.interior === 'woodlot') updatePanelLiveValues();
    }

    function renderConstruction() {
        const construction = state.snapshot?.activeConstruction;
        const banner = document.getElementById('constructionBanner');
        banner?.classList.toggle('hidden', !construction);
        if (!construction) return;
        const option = (state.snapshot.buildOptions || []).find((item) => item.id === construction.id);
        const names = { restore_archive: 'Restoring the Living Archive', woodlot_level_2: 'Cultivating the Woodlot' };
        text('constructionName', option?.name || names[construction.id] || 'Construction underway');
        const remaining = constructionRemaining();
        text('constructionTimer', formatDuration(remaining));
        const started = Date.parse(construction.startedAt || '') || nowMs();
        const completes = Date.parse(construction.completesAt || '') || nowMs();
        const progress = completes <= started ? 1 : clamp((nowMs() - started) / (completes - started), 0, 1);
        const bar = document.getElementById('constructionProgress');
        if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
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
        } else if (state.panel === 'chronicle') {
            setPanelHeading('The Living Chronicle', 'Letters & memorabilia');
            body.innerHTML = chronicleMarkup();
        } else if (state.panel === 'conversations') {
            setPanelHeading('Voices of the sanctuary', 'Conversations');
            body.innerHTML = conversationsMarkup();
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
        return `<p class="panel-intro">The sanctuary is founded on Stewardship, Consent, and Shelter.</p><section class="detail-card"><h3>The Keeper's Charter</h3><p>No Siegeling will be compelled to labor or fight. The land will be repaired rather than consumed, and those hunted by Akhar may seek refuge here.</p><div class="button-row"><button class="panel-button" type="button" data-open-panel="chronicle">Read the charter</button></div></section>`;
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
        const resident = state.snapshot.station?.resident;
        document.getElementById('interiorResident')?.classList.toggle('hidden', !resident);
        const art = document.getElementById('interiorResidentArt');
        if (art) art.innerHTML = resident ? residentAvatarContent(resident) : '';
        text('interiorResidentName', resident ? resident.name : '');
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
    }

    function residentsMarkup() {
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
            ? conversations.map((conversation) => `<section class="conversation-card" data-conversation-id="${escapeAttr(conversation.id)}"><span class="npc-mini">${escapeHtml(initials(conversation.npcName))}</span><span><small>${escapeHtml(conversation.npcRole)}</small><h3>${escapeHtml(conversation.npcName)}</h3><p>${escapeHtml(conversation.kicker || 'Waiting to speak')}</p></span></section>`).join('')
            : '<div class="empty-state">No one is waiting to speak. New construction and discoveries draw different voices to the sanctuary.</div>';
        const bonds = relationships.length
            ? `<span class="eyebrow">Relationships</span>${relationships.map((item) => `<div class="relationship-card"><strong>${escapeHtml(item.npcName)}</strong><span>${escapeHtml(item.stage)}</span></div>`).join('')}`
            : '';
        return `<p class="panel-intro">Conversations preserve conflicting perspectives. Your answers change trust and the sanctuary's memory, never its production rate.</p>${available}${bonds}`;
    }

    function updatePanelLiveValues() {
        document.querySelectorAll('[data-live-woodlot-meter]').forEach((meter) => { meter.style.width = `${woodlotFill()}%`; });
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
            const amount = projectedAvailable();
            snapshot.resources.timber = Math.min(snapshot.resources.timberCapacity, snapshot.resources.timber + amount);
            snapshot.station.available = 0;
            snapshot.station.collectCount = number(snapshot.station.collectCount) + 1;
            snapshot.collected = { resource: 'TIMBER', amount };
            if (snapshot.station.collectCount === 1) mockUnlock(snapshot, 'letter_forester_maren');
            if (snapshot.station.collectCount >= 3) mockUnlock(snapshot, 'memorabilia_petrified_root');
        } else if (path.endsWith('/resident')) {
            snapshot.station.residentId = body.residentId || '';
            snapshot.station.resident = (snapshot.residents || []).find((item) => item.id === body.residentId) || null;
            snapshot.station.ratePerMinute = snapshot.station.resident?.preferredAtWoodlot ? 1.15 * snapshot.station.level : snapshot.station.level;
        } else if (path.endsWith('/build')) {
            const option = (snapshot.buildOptions || []).find((item) => item.id === body.buildId);
            if (option) {
                snapshot.resources.timber -= option.timberCost;
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
            snapshot.dialogueResult = { npcId: conversation?.npcId, npcName: conversation?.npcName, response: choice?.response || 'The sanctuary remembers your answer.' };
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
        const station = state.snapshot?.station;
        if (!station) return 0;
        const elapsedMinutes = Math.max(0, (nowMs() - state.receivedAtMs) / 60000);
        return Math.min(number(station.storageCapacity), number(station.available) + Math.floor(elapsedMinutes * number(station.ratePerMinute)));
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
    function projectName(id) { return id === 'restore_archive' ? 'Restore the Living Archive' : id === 'woodlot_level_2' ? 'Cultivate the Woodlot' : 'Construction project'; }
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

    function residentAvatarContent(resident) {
        if (resident?.artUrl) return `<img src="${escapeAttr(resident.artUrl)}" alt="">`;
        return escapeHtml(initials(resident?.name || 'S'));
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
            resources: { timber: number(snapshot.resources?.timber), timberCapacity: number(snapshot.resources?.timberCapacity) },
            station: {
                id: 'woodlot', level: number(snapshot.station?.level), availableTimber: projectedAvailable(),
                capacity: number(snapshot.station?.storageCapacity), ratePerMinute: number(snapshot.station?.ratePerMinute),
                invitedResident: snapshot.station?.resident?.name || null
            },
            buildings: (snapshot.buildings || []).map((item) => ({ id: item.id, level: item.level, status: item.status })),
            construction: snapshot.activeConstruction ? { id: snapshot.activeConstruction.id, remainingSeconds: constructionRemaining(), progressPercent: constructionPercent() } : null,
            activePanel: state.panel || null,
            interior: state.interior || null,
            tutorialVisible: !document.getElementById('keepTutorial')?.classList.contains('hidden'),
            unreadLore: number(snapshot.unreadLoreCount),
            discoveries: (snapshot.lore || []).map((item) => ({ id: item.id, type: item.type, title: item.title, read: Boolean(item.read), displayed: Boolean(item.displayed) })),
            availableConversations: (snapshot.availableConversations || []).map((item) => ({ id: item.id, npc: item.npcName }))
        });
    };
})();
