(function () {
    const NOTCH_LAYOUT = [
        "TOP_LEFT", "TOP", "TOP_RIGHT",
        "LEFT", "CENTER", "RIGHT",
        "BOTTOM_LEFT", "BOTTOM", "BOTTOM_RIGHT"
    ];

    const DEFAULT_STATUS = {
        message: "Loading the current override file...",
        tone: "warning"
    };

    const state = {
        metadata: null,
        cards: [],
        selectedCardId: null,
        selectedAbilityIndex: 0,
        search: "",
        elementFilter: "ALL",
        dirty: false,
        previewMode: "card",
        validation: [],
        filePath: "",
        source: "Loading...",
        canSaveToProjectFile: false,
        status: { ...DEFAULT_STATUS }
    };

    const refs = {};

    window.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheRefs();
        bindEvents();
        renderAll();
        loadCurrentData();
    }

    function cacheRefs() {
        [
            "reloadCurrentBtn",
            "importFileInput",
            "saveProjectBtn",
            "downloadJsonBtn",
            "copyJsonBtn",
            "newCardBtn",
            "duplicateCardBtn",
            "deleteCardBtn",
            "cardSearchInput",
            "elementFilterSelect",
            "cardList",
            "sourcePill",
            "dirtyPill",
            "cardCountPill",
            "filePathLabel",
            "statusMessage",
            "emptyEditorState",
            "cardEditorContent",
            "cardIdInput",
            "cardNameInput",
            "cardElementSelect",
            "cardRaritySelect",
            "cardHealthInput",
            "cardSpeedInput",
            "cardPreferredRowSelect",
            "cardEvolvesFromInput",
            "cardCostElementSelect",
            "cardCostAmountInput",
            "notchGrid",
            "activeNotchList",
            "addAbilityBtn",
            "duplicateAbilityBtn",
            "deleteAbilityBtn",
            "abilityTabs",
            "abilityNameInput",
            "abilityPassiveSelect",
            "abilityDescriptionInput",
            "abilityTargetTypeSelect",
            "abilityTargetRowField",
            "abilityTargetRowSelect",
            "abilityEffectTypeSelect",
            "abilityEffectValueInput",
            "abilityRequiredElementSelect",
            "abilityRequiredEnergyInput",
            "abilityRequiredReactionSelect",
            "abilityTargetHelper",
            "abilityEffectHelper",
            "cardSummary",
            "jsonPreviewMode",
            "jsonPreview",
            "validationList",
            "cardIdOptions"
        ].forEach((id) => {
            refs[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        refs.reloadCurrentBtn.addEventListener("click", loadCurrentData);
        refs.importFileInput.addEventListener("change", importJsonFile);
        refs.saveProjectBtn.addEventListener("click", saveToProjectFile);
        refs.downloadJsonBtn.addEventListener("click", downloadJson);
        refs.copyJsonBtn.addEventListener("click", copyJson);
        refs.newCardBtn.addEventListener("click", createCard);
        refs.duplicateCardBtn.addEventListener("click", duplicateCard);
        refs.deleteCardBtn.addEventListener("click", deleteCard);
        refs.cardSearchInput.addEventListener("input", (event) => {
            state.search = event.target.value || "";
            renderCardList();
        });
        refs.elementFilterSelect.addEventListener("change", (event) => {
            state.elementFilter = event.target.value || "ALL";
            renderCardList();
        });
        refs.jsonPreviewMode.addEventListener("change", (event) => {
            state.previewMode = event.target.value || "card";
            renderPreview();
        });

        refs.cardList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-card-id]");
            if (!row) {
                return;
            }
            state.selectedCardId = row.dataset.cardId;
            state.selectedAbilityIndex = 0;
            renderAll();
        });

        refs.notchGrid.addEventListener("click", (event) => {
            const button = event.target.closest("[data-notch-direction]");
            if (!button) {
                return;
            }
            const direction = button.dataset.notchDirection;
            if (!direction) {
                return;
            }
            mutateSelectedCard((card) => toggleNotch(card, direction));
        });

        refs.activeNotchList.addEventListener("change", (event) => {
            const select = event.target.closest("[data-notch-index]");
            if (!select) {
                return;
            }
            const notchIndex = Number(select.dataset.notchIndex);
            mutateSelectedCard((card) => {
                if (!card.notches[notchIndex]) {
                    return;
                }
                card.notches[notchIndex].element = select.value;
            });
        });

        refs.activeNotchList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-remove-notch-index]");
            if (!button) {
                return;
            }
            const notchIndex = Number(button.dataset.removeNotchIndex);
            mutateSelectedCard((card) => {
                card.notches.splice(notchIndex, 1);
            });
        });

        refs.addAbilityBtn.addEventListener("click", addAbility);
        refs.duplicateAbilityBtn.addEventListener("click", duplicateAbility);
        refs.deleteAbilityBtn.addEventListener("click", deleteAbility);

        refs.abilityTabs.addEventListener("click", (event) => {
            const tab = event.target.closest("[data-ability-index]");
            if (!tab) {
                return;
            }
            state.selectedAbilityIndex = Number(tab.dataset.abilityIndex) || 0;
            renderEditor();
            renderSummary();
            renderPreview();
            renderButtons();
        });

        bindCardFieldEvents();
        bindAbilityFieldEvents();
    }

    function bindCardFieldEvents() {
        refs.cardIdInput.addEventListener("input", (event) => updateSelectedCardField("id", event.target.value));
        refs.cardNameInput.addEventListener("input", (event) => updateSelectedCardField("name", event.target.value));
        refs.cardElementSelect.addEventListener("change", (event) => {
            mutateSelectedCard((card) => {
                card.element = event.target.value;
                card.notches.forEach((notch) => {
                    if (!notch.element) {
                        notch.element = card.element;
                    }
                });
                if (!card.costElement) {
                    card.costElement = card.element;
                }
            });
        });
        refs.cardRaritySelect.addEventListener("change", (event) => updateSelectedCardField("rarity", event.target.value));
        refs.cardHealthInput.addEventListener("input", (event) => updateSelectedCardField("health", toNumber(event.target.value, 0)));
        refs.cardSpeedInput.addEventListener("input", (event) => updateSelectedCardField("speed", toNumber(event.target.value, 0)));
        refs.cardPreferredRowSelect.addEventListener("change", (event) => updateSelectedCardField("preferredRow", event.target.value));
        refs.cardEvolvesFromInput.addEventListener("input", (event) => updateSelectedCardField("evolvesFromId", event.target.value));
        refs.cardCostElementSelect.addEventListener("change", (event) => updateSelectedCardField("costElement", event.target.value));
        refs.cardCostAmountInput.addEventListener("input", (event) => updateSelectedCardField("costAmount", toNumber(event.target.value, 0)));
    }

    function bindAbilityFieldEvents() {
        refs.abilityNameInput.addEventListener("input", (event) => updateSelectedAbilityField("name", event.target.value));
        refs.abilityPassiveSelect.addEventListener("change", (event) => updateSelectedAbilityField("passive", event.target.value === "true"));
        refs.abilityDescriptionInput.addEventListener("input", (event) => updateSelectedAbilityField("description", event.target.value));
        refs.abilityTargetTypeSelect.addEventListener("change", (event) => {
            mutateSelectedAbility((ability) => {
                ability.targetType = event.target.value;
                applyTargetRule(ability);
            });
        });
        refs.abilityTargetRowSelect.addEventListener("change", (event) => updateSelectedAbilityField("targetRow", event.target.value));
        refs.abilityEffectTypeSelect.addEventListener("change", (event) => updateSelectedAbilityField("effectType", event.target.value));
        refs.abilityEffectValueInput.addEventListener("input", (event) => updateSelectedAbilityField("effectValue", toNumber(event.target.value, 0)));
        refs.abilityRequiredElementSelect.addEventListener("change", (event) => updateSelectedAbilityField("requiredElement", event.target.value));
        refs.abilityRequiredEnergyInput.addEventListener("input", (event) => updateSelectedAbilityField("requiredEnergy", toNumber(event.target.value, 0)));
        refs.abilityRequiredReactionSelect.addEventListener("change", (event) => updateSelectedAbilityField("requiredReaction", event.target.value));
    }

    async function loadCurrentData() {
        setStatus("Loading the current override file...", "warning");
        try {
            const payload = await requestJson(apiUrl("/api/cards/editor"), { method: "GET" });
            if (!payload || payload.error) {
                throw new Error(payload?.error || "Unable to load the current override data.");
            }
            state.metadata = payload.metadata || state.metadata;
            state.filePath = payload.filePath || "";
            state.source = payload.source || "PROJECT_FILE";
            state.canSaveToProjectFile = Boolean(payload.canSaveToProjectFile);
            applyDataSet(payload.data, false);
            setStatus("Loaded the current override file into the dashboard.", "success");
            renderAll();
        } catch (error) {
            setStatus(error.message || "Unable to load the current override file.", "error");
            renderStatus();
            renderValidation();
        }
    }

    function importJsonFile(event) {
        const [file] = event.target.files || [];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                applyDataSet(parsed, true);
                setStatus(`Imported ${file.name}. Review and save when ready.`, "warning");
                renderAll();
            } catch (error) {
                setStatus("That file could not be parsed as Sieglings override JSON.", "error");
                renderStatus();
            } finally {
                refs.importFileInput.value = "";
            }
        };
        reader.readAsText(file);
    }

    async function saveToProjectFile() {
        const errors = state.validation.filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            setStatus("Fix validation errors before saving to the project file.", "error");
            renderStatus();
            renderValidation();
            return;
        }

        if (!state.canSaveToProjectFile) {
            setStatus("This runtime cannot write to the project file. Download the JSON instead.", "error");
            renderStatus();
            return;
        }

        try {
            const payload = await requestJson(apiUrl("/api/cards/editor"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildExportData())
            });
            if (!payload || payload.error) {
                throw new Error(payload?.error || "Unable to save the override file.");
            }
            state.metadata = payload.metadata || state.metadata;
            state.filePath = payload.filePath || state.filePath;
            state.source = payload.source || "PROJECT_FILE";
            state.canSaveToProjectFile = Boolean(payload.canSaveToProjectFile);
            applyDataSet(payload.data, false);
            setStatus("Saved the override JSON back to the project file.", "success");
            renderAll();
        } catch (error) {
            setStatus(error.message || "Unable to save the override file.", "error");
            renderStatus();
        }
    }

    function downloadJson() {
        const json = JSON.stringify(buildExportData(), null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "siegling-overrides.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("Downloaded the current dashboard data as JSON.", "success");
        renderStatus();
    }

    async function copyJson() {
        const json = JSON.stringify(buildExportData(), null, 2);
        try {
            await navigator.clipboard.writeText(json);
            setStatus("Copied the current JSON export to the clipboard.", "success");
        } catch (error) {
            setStatus("Clipboard copy failed. Use the download button instead.", "error");
        }
        renderStatus();
    }

    function createCard() {
        const card = createBlankCard();
        state.cards.unshift(card);
        state.selectedCardId = card.id;
        state.selectedAbilityIndex = 0;
        state.dirty = true;
        setStatus("Created a new card draft.", "warning");
        renderAll();
    }

    function duplicateCard() {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        const copy = normalizeCard({
            ...buildExportCard(card),
            id: createUniqueCardId(`${card.id || "card"}-copy`),
            name: `${card.name || "Unnamed"} Copy`
        });
        state.cards.unshift(copy);
        state.selectedCardId = copy.id;
        state.selectedAbilityIndex = 0;
        state.dirty = true;
        setStatus(`Duplicated ${card.name || card.id || "the card"}.`, "warning");
        renderAll();
    }

    function deleteCard() {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        const label = card.name || card.id || "this card";
        if (!window.confirm(`Delete ${label}?`)) {
            return;
        }
        const index = state.cards.findIndex((entry) => entry.id === card.id);
        state.cards.splice(index, 1);
        state.selectedCardId = state.cards[Math.max(0, index - 1)]?.id || state.cards[0]?.id || null;
        state.selectedAbilityIndex = 0;
        state.dirty = true;
        setStatus(`Deleted ${label}.`, "warning");
        renderAll();
    }

    function addAbility() {
        mutateSelectedCard((card) => {
            card.abilities.push(createBlankAbility(card.element));
            state.selectedAbilityIndex = card.abilities.length - 1;
        });
    }

    function duplicateAbility() {
        const card = getSelectedCard();
        const ability = getSelectedAbility();
        if (!card || !ability) {
            return;
        }
        mutateSelectedCard((selectedCard) => {
            const copy = normalizeAbility({
                ...buildExportAbility(ability),
                name: `${ability.name || "Ability"} Copy`
            }, selectedCard.element);
            selectedCard.abilities.splice(state.selectedAbilityIndex + 1, 0, copy);
            state.selectedAbilityIndex += 1;
        });
    }

    function deleteAbility() {
        const card = getSelectedCard();
        if (!card || card.abilities.length <= 1) {
            setStatus("Each card needs at least one ability.", "warning");
            renderStatus();
            return;
        }
        const ability = getSelectedAbility();
        const label = ability?.name || `Ability ${state.selectedAbilityIndex + 1}`;
        if (!window.confirm(`Delete ${label}?`)) {
            return;
        }
        mutateSelectedCard((selectedCard) => {
            selectedCard.abilities.splice(state.selectedAbilityIndex, 1);
            state.selectedAbilityIndex = Math.max(0, Math.min(state.selectedAbilityIndex, selectedCard.abilities.length - 1));
        });
    }

    function updateSelectedCardField(field, value) {
        mutateSelectedCard((card) => {
            card[field] = typeof value === "string" ? value : value ?? "";
        });
    }

    function updateSelectedAbilityField(field, value) {
        mutateSelectedAbility((ability) => {
            ability[field] = typeof value === "string" ? value : value ?? "";
            if (field === "requiredElement" || field === "requiredReaction") {
                ability[field] = value || "";
            }
        });
    }

    function mutateSelectedCard(mutator) {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        mutator(card);
        state.dirty = true;
        state.validation = validateCards();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        renderAll();
    }

    function mutateSelectedAbility(mutator) {
        const ability = getSelectedAbility();
        if (!ability) {
            return;
        }
        mutator(ability);
        state.dirty = true;
        state.validation = validateCards();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        renderAll();
    }

    function applyDataSet(data, dirty) {
        const cards = Array.isArray(data?.cards) ? data.cards.map((card) => normalizeCard(card)) : [];
        state.cards = cards;
        state.selectedCardId = cards.find((card) => card.id === state.selectedCardId)?.id || cards[0]?.id || null;
        state.selectedAbilityIndex = 0;
        state.dirty = dirty;
        state.validation = validateCards();
    }

    function normalizeCard(card) {
        const baseElement = card?.element || firstMetaValue("elements", "FIRE");
        const abilities = Array.isArray(card?.abilities) && card.abilities.length > 0
            ? card.abilities.map((ability) => normalizeAbility(ability, baseElement))
            : (card?.ability ? [normalizeAbility(card.ability, baseElement)] : [createBlankAbility(baseElement)]);
        return {
            id: String(card?.id || ""),
            name: String(card?.name || ""),
            element: baseElement,
            rarity: card?.rarity || firstMetaValue("rarities", "COMMON"),
            health: toNumber(card?.health, 10),
            speed: toNumber(card?.speed, 5),
            preferredRow: card?.preferredRow || firstMetaValue("rows", "FRONT"),
            evolvesFromId: String(card?.evolvesFromId || ""),
            costElement: card?.costElement || "",
            costAmount: toNumber(card?.costAmount, 0),
            notches: Array.isArray(card?.notches) ? card.notches.map((notch) => normalizeNotch(notch, baseElement)) : [],
            abilities
        };
    }

    function normalizeAbility(ability, fallbackElement) {
        const normalized = {
            name: String(ability?.name || ""),
            description: String(ability?.description || ""),
            targetType: ability?.targetType || firstMetaValue("targetTypes", "SINGLE_ENEMY"),
            targetRow: ability?.targetRow || "",
            targetCount: toNumber(ability?.targetCount, 0),
            effectType: ability?.effectType || firstEffectKey(),
            effectValue: toNumber(ability?.effectValue, 0),
            passive: Boolean(ability?.passive),
            requiredElement: ability?.requiredElement || "",
            requiredEnergy: toNumber(ability?.requiredEnergy, 0),
            requiredReaction: ability?.requiredReaction || ""
        };
        if (!normalized.requiredElement && normalized.requiredEnergy > 0) {
            normalized.requiredElement = fallbackElement || "";
        }
        applyTargetRule(normalized);
        return normalized;
    }

    function normalizeNotch(notch, fallbackElement) {
        return {
            direction: notch?.direction || "TOP",
            element: notch?.element || fallbackElement || firstMetaValue("elements", "FIRE")
        };
    }

    function createBlankCard() {
        const element = firstMetaValue("elements", "FIRE");
        return normalizeCard({
            id: createUniqueCardId("new-siegling"),
            name: "New Siegling",
            element,
            rarity: firstMetaValue("rarities", "COMMON"),
            health: 10,
            speed: 5,
            preferredRow: firstMetaValue("rows", "FRONT"),
            costElement: element,
            costAmount: 0,
            notches: [{ direction: "TOP", element }],
            abilities: [createBlankAbility(element)]
        });
    }

    function createBlankAbility(element) {
        return normalizeAbility({
            name: "New Ability",
            description: "",
            targetType: "SINGLE_ENEMY",
            effectType: firstEffectKey(),
            effectValue: 0,
            passive: false,
            requiredElement: "",
            requiredEnergy: 0,
            requiredReaction: ""
        }, element);
    }

    function toggleNotch(card, direction) {
        const existingIndex = card.notches.findIndex((notch) => notch.direction === direction);
        if (existingIndex >= 0) {
            card.notches.splice(existingIndex, 1);
            return;
        }
        card.notches.push({
            direction,
            element: card.element || firstMetaValue("elements", "FIRE")
        });
        card.notches.sort((left, right) => notchOrder(left.direction) - notchOrder(right.direction));
    }

    function notchOrder(direction) {
        return NOTCH_LAYOUT.indexOf(direction);
    }

    function applyTargetRule(ability) {
        const rule = getTargetRule(ability.targetType);
        ability.targetCount = Number.isFinite(rule.fixedTargetCount) ? rule.fixedTargetCount : 0;
        if (!rule.requiresRow) {
            ability.targetRow = "";
        } else if (!ability.targetRow) {
            ability.targetRow = firstMetaValue("rows", "FRONT");
        }
        if (ability.targetType === "PASSIVE") {
            ability.passive = true;
        }
    }

    function renderAll() {
        state.validation = validateCards();
        renderStatus();
        renderFilterOptions();
        renderCardList();
        renderEditor();
        renderSummary();
        renderPreview();
        renderValidation();
        renderButtons();
        renderCardIdOptions();
    }

    function renderStatus() {
        refs.sourcePill.textContent = state.source === "PROJECT_FILE" ? "Project file" : "Classpath copy";
        refs.dirtyPill.textContent = state.dirty ? "Unsaved changes" : "Saved";
        refs.cardCountPill.textContent = `${state.cards.length} card${state.cards.length === 1 ? "" : "s"}`;
        refs.filePathLabel.textContent = state.filePath ? `Editing: ${state.filePath}` : "No project file path available.";
        refs.statusMessage.textContent = state.status.message;

        refs.sourcePill.className = "status-pill";
        refs.dirtyPill.className = `status-pill ${state.dirty ? "is-dirty" : "is-success"}`;
        refs.cardCountPill.className = `status-pill ${state.validation.some((issue) => issue.severity === "error") ? "is-error" : "is-success"}`;
        if (state.status.tone === "error") {
            refs.sourcePill.classList.add("is-error");
        } else if (state.status.tone === "warning") {
            refs.sourcePill.classList.add("is-warning");
        } else if (state.status.tone === "success") {
            refs.sourcePill.classList.add("is-success");
        }
    }

    function renderFilterOptions() {
        if (!state.metadata) {
            refs.elementFilterSelect.innerHTML = `<option value="ALL">All Elements</option>`;
            return;
        }
        const options = [`<option value="ALL">All Elements</option>`]
            .concat((state.metadata.elements || []).map((element) => `<option value="${element}">${formatEnumLabel(element)}</option>`))
            .join("");
        refs.elementFilterSelect.innerHTML = options;
        refs.elementFilterSelect.value = state.elementFilter;
    }

    function renderCardList() {
        const cards = getFilteredCards();
        if (cards.length === 0) {
            refs.cardList.innerHTML = `<div class="empty-browser">No cards match the current search and element filter.</div>`;
            return;
        }
        refs.cardList.innerHTML = cards.map((card) => {
            const active = card.id === state.selectedCardId ? " active" : "";
            return `
                <div class="card-row${active}" data-card-id="${escapeHtml(card.id)}">
                    <div class="card-row-title">
                        <strong>${escapeHtml(card.name || "Unnamed Card")}</strong>
                        <span class="summary-badge">${escapeHtml(formatEnumLabel(card.element))}</span>
                    </div>
                    <div class="card-meta">${escapeHtml(formatEnumLabel(card.rarity))} | ${card.abilities.length} ability${card.abilities.length === 1 ? "" : "ies"} | HP ${card.health} | SPD ${card.speed}</div>
                    <div class="card-id">${escapeHtml(card.id || "missing-id")}</div>
                </div>
            `;
        }).join("");
    }

    function renderEditor() {
        const card = getSelectedCard();
        const ability = getSelectedAbility();

        refs.emptyEditorState.classList.toggle("hidden", Boolean(card));
        refs.cardEditorContent.classList.toggle("hidden", !card);
        if (!card) {
            refs.cardSummary.innerHTML = `<div class="validation-empty">Select a card to see its live summary.</div>`;
            refs.jsonPreview.value = "";
            return;
        }

        populateSelect(refs.cardElementSelect, state.metadata?.elements || [], card.element);
        populateSelect(refs.cardRaritySelect, state.metadata?.rarities || [], card.rarity);
        populateSelect(refs.cardPreferredRowSelect, state.metadata?.rows || [], card.preferredRow);
        populateSelect(refs.cardCostElementSelect, ["", ...(state.metadata?.elements || [])], card.costElement, true);

        setInputValue(refs.cardIdInput, card.id);
        setInputValue(refs.cardNameInput, card.name);
        setInputValue(refs.cardHealthInput, card.health);
        setInputValue(refs.cardSpeedInput, card.speed);
        setInputValue(refs.cardEvolvesFromInput, card.evolvesFromId);
        setInputValue(refs.cardCostAmountInput, card.costAmount);

        renderNotches(card);
        renderAbilityTabs(card);

        if (!ability) {
            refs.abilityEditor.classList.add("hidden");
            return;
        }

        refs.abilityEditor.classList.remove("hidden");
        populateSelect(refs.abilityTargetTypeSelect, state.metadata?.targetTypes || [], ability.targetType);
        populateSelect(refs.abilityTargetRowSelect, state.metadata?.rows || [], ability.targetRow || firstMetaValue("rows", "FRONT"));
        populateSelect(
            refs.abilityEffectTypeSelect,
            (state.metadata?.effectTypes || []).map((effect) => effect.key),
            ability.effectType,
            false,
            effectLabelMap()
        );
        populateSelect(refs.abilityRequiredElementSelect, ["", ...(state.metadata?.elements || [])], ability.requiredElement, true);
        populateSelect(refs.abilityRequiredReactionSelect, ["", ...(state.metadata?.reactions || [])], ability.requiredReaction, true);

        setInputValue(refs.abilityNameInput, ability.name);
        refs.abilityPassiveSelect.value = ability.passive ? "true" : "false";
        setInputValue(refs.abilityDescriptionInput, ability.description);
        setInputValue(refs.abilityEffectValueInput, ability.effectValue);
        setInputValue(refs.abilityRequiredEnergyInput, ability.requiredEnergy);

        const targetRule = getTargetRule(ability.targetType);
        refs.abilityTargetRowField.classList.toggle("hidden", !targetRule.requiresRow);
        refs.abilityTargetHelper.textContent = buildTargetHelperText(ability, targetRule);
        refs.abilityEffectHelper.textContent = buildEffectHelperText(ability.effectType);
    }

    function renderNotches(card) {
        refs.notchGrid.innerHTML = NOTCH_LAYOUT.map((direction) => {
            if (direction === "CENTER") {
                return `<div class="notch-center">Card</div>`;
            }
            const activeNotch = card.notches.find((notch) => notch.direction === direction);
            return `
                <button class="notch-button${activeNotch ? " active" : ""}" type="button" data-notch-direction="${direction}">
                    ${escapeHtml(shortDirection(direction))}
                </button>
            `;
        }).join("");

        if (card.notches.length === 0) {
            refs.activeNotchList.innerHTML = `<div class="validation-empty">No active notches yet. Toggle directions above to add them.</div>`;
            return;
        }

        refs.activeNotchList.innerHTML = card.notches.map((notch, index) => `
            <div class="notch-row">
                <div class="notch-label">${escapeHtml(formatEnumLabel(notch.direction))}</div>
                <select data-notch-index="${index}">
                    ${buildOptionMarkup(state.metadata?.elements || [], notch.element)}
                </select>
                <button class="btn btn-secondary" type="button" data-remove-notch-index="${index}">Remove</button>
            </div>
        `).join("");
    }

    function renderAbilityTabs(card) {
        refs.abilityTabs.innerHTML = card.abilities.map((ability, index) => `
            <button class="ability-tab${index === state.selectedAbilityIndex ? " active" : ""}" type="button" data-ability-index="${index}">
                <span class="ability-tab-name">${escapeHtml(ability.name || `Ability ${index + 1}`)}</span>
                <span class="ability-tab-meta">${escapeHtml(formatEnumLabel(ability.targetType))} | ${escapeHtml(effectLabel(ability.effectType))}</span>
            </button>
        `).join("");
    }

    function renderSummary() {
        const card = getSelectedCard();
        if (!card) {
            refs.cardSummary.innerHTML = `<div class="validation-empty">Select a card to see a summary.</div>`;
            return;
        }
        const summaryTags = [];
        if (card.evolvesFromId.trim()) {
            summaryTags.push(`Evolves from ${card.evolvesFromId.trim()}`);
        }
        if (card.costAmount > 0) {
            summaryTags.push(`Cost ${card.costAmount} ${formatEnumLabel(card.costElement || card.element)}`);
        }
        if (card.notches.length > 0) {
            summaryTags.push(`${card.notches.length} notch${card.notches.length === 1 ? "" : "es"}`);
        }

        refs.cardSummary.innerHTML = `
            <div class="summary-card-shell">
                <div class="summary-top">
                    <div>
                        <h3>${escapeHtml(card.name || "Unnamed Card")}</h3>
                        <div class="card-summary-copy">${escapeHtml(card.id || "missing-id")}</div>
                    </div>
                    <span class="summary-badge">${escapeHtml(formatEnumLabel(card.element))}</span>
                </div>
                <div class="stat-strip">
                    <span class="stat-chip">Rarity: ${escapeHtml(formatEnumLabel(card.rarity))}</span>
                    <span class="stat-chip">Health: ${card.health}</span>
                    <span class="stat-chip">Speed: ${card.speed}</span>
                    <span class="stat-chip">Row: ${escapeHtml(formatEnumLabel(card.preferredRow))}</span>
                </div>
                <div class="summary-tags">
                    ${summaryTags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("") || `<span class="tag-chip">Base card</span>`}
                </div>
            </div>
            <div class="summary-card-shell">
                <div class="section-kicker">Notches</div>
                <div class="summary-tags">
                    ${card.notches.length > 0
                        ? card.notches.map((notch) => `<span class="tag-chip">${escapeHtml(formatEnumLabel(notch.direction))} ${escapeHtml(formatEnumLabel(notch.element))}</span>`).join("")
                        : `<span class="tag-chip">No notches yet</span>`}
                </div>
            </div>
            <div class="summary-ability-list">
                ${card.abilities.map((ability, index) => `
                    <div class="summary-ability">
                        <strong>${escapeHtml(ability.name || `Ability ${index + 1}`)}</strong>
                        <div class="card-summary-copy">${escapeHtml(ability.description || "No description yet.")}</div>
                        <div class="card-summary-copy">${escapeHtml(describeAbility(ability))}</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderPreview() {
        refs.jsonPreviewMode.value = state.previewMode;
        if (state.previewMode === "card") {
            const card = getSelectedCard();
            refs.jsonPreview.value = card ? JSON.stringify(buildExportCard(card), null, 2) : "";
            return;
        }
        refs.jsonPreview.value = JSON.stringify(buildExportData(), null, 2);
    }

    function renderValidation() {
        if (state.validation.length === 0) {
            refs.validationList.innerHTML = `<div class="validation-empty">No validation issues right now.</div>`;
            return;
        }
        refs.validationList.innerHTML = state.validation.map((issue) => `
            <div class="validation-item ${issue.severity}">
                <span class="validation-severity">${escapeHtml(issue.severity)}</span>
                <div>${escapeHtml(issue.message)}</div>
            </div>
        `).join("");
    }

    function renderButtons() {
        const hasCard = Boolean(getSelectedCard());
        const hasAbility = Boolean(getSelectedAbility());
        const hasErrors = state.validation.some((issue) => issue.severity === "error");
        refs.duplicateCardBtn.disabled = !hasCard;
        refs.deleteCardBtn.disabled = !hasCard;
        refs.addAbilityBtn.disabled = !hasCard;
        refs.duplicateAbilityBtn.disabled = !hasAbility;
        refs.deleteAbilityBtn.disabled = !hasAbility || getSelectedCard()?.abilities.length <= 1;
        refs.saveProjectBtn.disabled = !state.canSaveToProjectFile || hasErrors || !state.dirty;
    }

    function renderCardIdOptions() {
        refs.cardIdOptions.innerHTML = state.cards
            .map((card) => `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name)}</option>`)
            .join("");
    }

    function getFilteredCards() {
        const search = state.search.trim().toLowerCase();
        return state.cards.filter((card) => {
            const elementMatch = state.elementFilter === "ALL" || card.element === state.elementFilter;
            const searchMatch = !search
                || card.name.toLowerCase().includes(search)
                || card.id.toLowerCase().includes(search);
            return elementMatch && searchMatch;
        });
    }

    function getSelectedCard() {
        return state.cards.find((card) => card.id === state.selectedCardId) || null;
    }

    function getSelectedAbility() {
        const card = getSelectedCard();
        if (!card || card.abilities.length === 0) {
            return null;
        }
        state.selectedAbilityIndex = Math.max(0, Math.min(state.selectedAbilityIndex, card.abilities.length - 1));
        return card.abilities[state.selectedAbilityIndex];
    }

    function validateCards() {
        const issues = [];
        const ids = new Map();
        state.cards.forEach((card) => {
            const trimmedId = card.id.trim();
            if (!trimmedId) {
                issues.push(issue("error", `${card.name || "A card"} is missing an id.`));
            } else {
                ids.set(trimmedId, (ids.get(trimmedId) || 0) + 1);
            }
            if (!card.name.trim()) {
                issues.push(issue("error", `${trimmedId || "A card"} is missing a name.`));
            }
            if (!card.element) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} is missing an element.`));
            }
            if (!card.rarity) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} is missing a rarity.`));
            }
            if (card.health <= 0) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} must have health above 0.`));
            }
            if (card.speed < 0) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} cannot have negative speed.`));
            }
            if (card.notches.length === 0) {
                issues.push(issue("warn", `${trimmedId || card.name || "A card"} has no notches yet.`));
            }
            if (card.evolvesFromId.trim() && card.costAmount <= 0) {
                issues.push(issue("warn", `${trimmedId || card.name || "A card"} evolves from another card but has no cost amount.`));
            }
            if (card.costAmount > 0 && !card.costElement) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} needs a cost element when cost amount is above 0.`));
            }
            if (!card.abilities.length) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} needs at least one ability.`));
            }
            card.abilities.forEach((ability, index) => {
                const label = `${trimmedId || card.name || "A card"} ability ${index + 1}`;
                if (!ability.name.trim()) {
                    issues.push(issue("error", `${label} is missing a name.`));
                }
                if (!ability.description.trim()) {
                    issues.push(issue("warn", `${label} has no description yet.`));
                }
                if (!ability.targetType) {
                    issues.push(issue("error", `${label} is missing a target type.`));
                }
                if (getTargetRule(ability.targetType).requiresRow && !ability.targetRow) {
                    issues.push(issue("error", `${label} needs a target row because it targets a row.`));
                }
                if (!ability.effectType) {
                    issues.push(issue("error", `${label} is missing an effect type.`));
                }
                if (!effectByKey()[ability.effectType]) {
                    issues.push(issue("error", `${label} uses unsupported effect type ${ability.effectType}.`));
                }
                if (ability.requiredEnergy < 0) {
                    issues.push(issue("error", `${label} cannot require negative energy.`));
                }
                if (ability.requiredEnergy > 0 && !ability.requiredElement && !ability.requiredReaction) {
                    issues.push(issue("warn", `${label} spends energy but has no required element or reaction set.`));
                }
            });
        });

        ids.forEach((count, id) => {
            if (count > 1) {
                issues.push(issue("error", `Card id '${id}' is duplicated ${count} times.`));
            }
        });
        return issues;
    }

    function buildExportData() {
        return {
            cards: state.cards.map((card) => buildExportCard(card))
        };
    }

    function buildExportCard(card) {
        const exported = {
            id: card.id.trim(),
            name: card.name.trim(),
            element: card.element,
            rarity: card.rarity,
            health: toNumber(card.health, 0),
            speed: toNumber(card.speed, 0),
            notches: card.notches.map((notch) => ({
                direction: notch.direction,
                element: notch.element || card.element
            })),
            preferredRow: card.preferredRow,
            abilities: card.abilities.map((ability) => buildExportAbility(ability))
        };

        if (card.evolvesFromId.trim()) {
            exported.evolvesFromId = card.evolvesFromId.trim();
        }
        if (card.costAmount > 0) {
            exported.costElement = card.costElement || card.element;
            exported.costAmount = toNumber(card.costAmount, 0);
        }

        return exported;
    }

    function buildExportAbility(ability) {
        const rule = getTargetRule(ability.targetType);
        const exported = {
            name: ability.name.trim(),
            description: ability.description.trim(),
            targetType: ability.targetType,
            targetCount: rule.fixedTargetCount,
            effectType: ability.effectType,
            effectValue: toNumber(ability.effectValue, 0),
            passive: Boolean(ability.passive),
            requiredEnergy: toNumber(ability.requiredEnergy, 0)
        };

        if (rule.requiresRow && ability.targetRow) {
            exported.targetRow = ability.targetRow;
        }
        if (ability.requiredElement) {
            exported.requiredElement = ability.requiredElement;
        }
        if (ability.requiredReaction) {
            exported.requiredReaction = ability.requiredReaction;
        }
        return exported;
    }

    function buildTargetHelperText(ability, rule) {
        const rowNote = rule.requiresRow
            ? ` Current row: ${formatEnumLabel(ability.targetRow || firstMetaValue("rows", "FRONT"))}.`
            : "";
        const targetCountNote = rule.fixedTargetCount === 0
            ? " Target count is handled automatically for this target type."
            : ` Target count is fixed at ${rule.fixedTargetCount}.`;
        return `${rule.helperText}${rowNote}${targetCountNote}`;
    }

    function buildEffectHelperText(effectType) {
        const effect = effectByKey()[effectType];
        if (!effect) {
            return "Choose an effect type the rules engine understands.";
        }
        const targetHints = Array.isArray(effect.targetHints) && effect.targetHints.length > 0
            ? ` Typical targets: ${effect.targetHints.map(formatEnumLabel).join(", ")}.`
            : "";
        return `${effect.description}${targetHints}`;
    }

    function describeAbility(ability) {
        const pieces = [
            ability.passive ? "Passive" : "Activated",
            `${effectLabel(ability.effectType)} -> ${describeAbilityTarget(ability)}`
        ];
        if (ability.requiredEnergy > 0) {
            if (ability.requiredElement) {
                pieces.push(`Cost ${ability.requiredEnergy} ${formatEnumLabel(ability.requiredElement)}`);
            } else if (ability.requiredReaction) {
                pieces.push(`Needs ${ability.requiredReaction}`);
            } else {
                pieces.push(`Cost ${ability.requiredEnergy} energy`);
            }
        } else if (ability.requiredReaction) {
            pieces.push(`Needs ${ability.requiredReaction}`);
        }
        return pieces.join(" | ");
    }

    function describeAbilityTarget(ability) {
        switch (ability.targetType) {
            case "SINGLE_ENEMY":
                return "1 enemy";
            case "ALL_ENEMIES":
                return "all enemies";
            case "ROW_ENEMIES":
                return `all enemies in ${formatEnumLabel(ability.targetRow || firstMetaValue("rows", "FRONT"))}`;
            case "SINGLE_ALLY":
                return "1 ally";
            case "ALL_ALLIES":
                return "all allies";
            case "ROW_ALLIES":
                return `all allies in ${formatEnumLabel(ability.targetRow || firstMetaValue("rows", "FRONT"))}`;
            case "ENEMY_PLAYER":
                return "the enemy player";
            case "SELF":
                return "self";
            case "PASSIVE":
                return "passive aura";
            default:
                return ability.targetType || "unknown target";
        }
    }

    function getTargetRule(targetType) {
        const rules = state.metadata?.targetRules || {};
        return rules[targetType] || { requiresRow: false, fixedTargetCount: 0, helperText: "No targeting rule found for this selection." };
    }

    function effectByKey() {
        return Object.fromEntries((state.metadata?.effectTypes || []).map((effect) => [effect.key, effect]));
    }

    function effectLabelMap() {
        return Object.fromEntries((state.metadata?.effectTypes || []).map((effect) => [effect.key, effect.label]));
    }

    function effectLabel(key) {
        return effectLabelMap()[key] || formatEnumLabel(key || "");
    }

    function buildOptionMarkup(values, currentValue, customLabels) {
        return values.map((value) => {
            const selected = value === currentValue ? " selected" : "";
            const label = customLabels?.[value] || formatEnumLabel(value);
            return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
        }).join("");
    }

    function populateSelect(select, values, currentValue, allowBlank, customLabels) {
        const items = allowBlank ? ["", ...values.filter((value) => value !== "")] : values;
        const previous = select.value;
        const optionMarkup = items.map((value) => {
            const label = value === "" ? "None" : (customLabels?.[value] || formatEnumLabel(value));
            return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
        }).join("");
        if (select.dataset.options !== optionMarkup) {
            select.innerHTML = optionMarkup;
            select.dataset.options = optionMarkup;
        }
        const desired = currentValue ?? previous ?? "";
        select.value = items.includes(desired) ? desired : (allowBlank ? "" : items[0] || "");
    }

    function setInputValue(input, value) {
        const desired = value == null ? "" : String(value);
        if (document.activeElement !== input && input.value !== desired) {
            input.value = desired;
        }
    }

    function firstMetaValue(key, fallback) {
        return state.metadata?.[key]?.[0] || fallback;
    }

    function firstEffectKey() {
        return state.metadata?.effectTypes?.[0]?.key || "damage";
    }

    function createUniqueCardId(base) {
        const slugBase = slugify(base || "card");
        let candidate = slugBase;
        let counter = 2;
        const existingIds = new Set(state.cards.map((card) => card.id));
        while (existingIds.has(candidate)) {
            candidate = `${slugBase}-${counter}`;
            counter += 1;
        }
        return candidate;
    }

    function apiUrl(path) {
        const base = String(window.SIEGLINGS_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
        return base ? `${base}${path}` : path;
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || `Request failed with status ${response.status}.`);
        }
        return data;
    }

    function setStatus(message, tone) {
        state.status = { message, tone };
    }

    function issue(severity, message) {
        return { severity, message };
    }

    function toNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function slugify(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "card";
    }

    function formatEnumLabel(value) {
        return String(value || "")
            .toLowerCase()
            .split("_")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    function shortDirection(direction) {
        switch (direction) {
            case "TOP_LEFT":
                return "TL";
            case "TOP":
                return "T";
            case "TOP_RIGHT":
                return "TR";
            case "LEFT":
                return "L";
            case "RIGHT":
                return "R";
            case "BOTTOM_LEFT":
                return "BL";
            case "BOTTOM":
                return "B";
            case "BOTTOM_RIGHT":
                return "BR";
            default:
                return direction;
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
