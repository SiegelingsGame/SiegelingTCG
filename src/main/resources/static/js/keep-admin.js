/* My Keep tuning panel for the card dashboard.
 * Edits the live Keep balance document at /api/keep/tuning: workshop output, construction
 * cost/time, resident buff percentages (including the rapport ladder), tool and decoration
 * blueprints, and the Enclave rapport tasks. Every field is an override — leaving one blank
 * keeps the value the game ships with, which is shown as the input's placeholder. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('keepTuningPanel');
    if (!host) return;

    var loaded = null;      // last server response (tuning + defaults + provenance)
    var model = null;       // working copy the form mutates
    var taskElement = 'FIRE';
    var section = 'buildings';

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function titleCase(value) {
        var lower = String(value || '').toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    function num(value) {
        var parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
    }
    function intOrNull(value) {
        var parsed = parseInt(value, 10);
        return isNaN(parsed) ? null : parsed;
    }
    function status(message, tone) {
        var node = document.getElementById('keepTuningStatus');
        if (!node) return;
        node.textContent = message || '';
        node.className = 'siege-class-status' + (tone ? ' tone-' + tone : '');
    }

    /** "verdant_fiber 12, stone 4" <-> { verdant_fiber: 12, stone: 4 } */
    function costsToText(costs) {
        if (!costs) return '';
        return Object.keys(costs).map(function (id) { return id + ' ' + costs[id]; }).join(', ');
    }
    function textToCosts(text) {
        var out = {};
        String(text || '').split(',').forEach(function (chunk) {
            var parts = chunk.trim().split(/[\s:=]+/).filter(Boolean);
            if (parts.length < 2) return;
            var amount = parseInt(parts[1], 10);
            if (!isNaN(amount) && amount > 0) out[parts[0]] = amount;
        });
        return Object.keys(out).length ? out : null;
    }

    function emptyModel() {
        return { buildings: [], projects: [], buffs: {}, recipes: [], tasks: { elements: {}, residents: {} } };
    }

    function normalizeModel(tuning) {
        var out = emptyModel();
        if (!tuning) return out;
        out.buildings = (tuning.buildings || []).slice();
        out.projects = (tuning.projects || []).slice();
        out.buffs = tuning.buffs ? JSON.parse(JSON.stringify(tuning.buffs)) : {};
        out.recipes = (tuning.recipes || []).slice();
        out.tasks = {
            elements: (tuning.tasks && tuning.tasks.elements) ? JSON.parse(JSON.stringify(tuning.tasks.elements)) : {},
            residents: (tuning.tasks && tuning.tasks.residents) ? JSON.parse(JSON.stringify(tuning.tasks.residents)) : {}
        };
        return out;
    }

    function findRow(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
        return null;
    }
    function upsert(list, id, field, value) {
        var row = findRow(list, id);
        if (!row) { row = { id: id }; list.push(row); }
        row[field] = value;
        // A row whose every override is empty is the same as no row at all.
        var live = Object.keys(row).some(function (key) {
            return key !== 'id' && row[key] !== null && row[key] !== undefined && row[key] !== '';
        });
        if (!live) list.splice(list.indexOf(row), 1);
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    var SECTIONS = [
        { id: 'buildings', label: 'Building Output' },
        { id: 'projects', label: 'Construction Costs' },
        { id: 'buffs', label: 'Siegeling Buffs' },
        { id: 'recipes', label: 'Decorations & Tools' },
        { id: 'tasks', label: 'Enclave Tasks' }
    ];

    function render() {
        if (!loaded) {
            host.innerHTML = '<p class="siege-class-note">Loading the live Keep tuning…</p>';
            return;
        }
        var provenance = 'Source: ' + escapeHtml(loaded.source || 'UNKNOWN')
            + (loaded.updatedBy ? ' · last saved by ' + escapeHtml(loaded.updatedBy) : '')
            + (loaded.updatedAt ? ' · ' + escapeHtml(String(loaded.updatedAt).slice(0, 19).replace('T', ' ')) : '');
        host.innerHTML =
            '<p class="siege-class-note">Every field here is an <strong>override</strong>. Leave one blank and My Keep uses the value it ships with, shown as the placeholder. Saving publishes to every live keep. Requires an editor login.</p>' +
            '<div class="keep-tuning-provenance">' + provenance + '</div>' +
            '<div class="keep-tuning-tabs">' + SECTIONS.map(function (item) {
                return '<button type="button" class="keep-tuning-tab' + (section === item.id ? ' active' : '') +
                    '" data-keep-section="' + item.id + '">' + escapeHtml(item.label) + '</button>';
            }).join('') + '</div>' +
            '<div class="keep-tuning-body">' + sectionMarkup() + '</div>' +
            '<div class="keep-tuning-actions">' +
            '<button type="button" class="btn btn-primary" id="keepTuningSaveBtn">Save Keep Tuning</button>' +
            '<button type="button" class="btn btn-secondary" id="keepTuningResetBtn">Reset Everything To Defaults</button>' +
            '<span id="keepTuningStatus" class="siege-class-status"></span>' +
            '</div>';
        bind();
    }

    function sectionMarkup() {
        if (section === 'buildings') return buildingsMarkup();
        if (section === 'projects') return projectsMarkup();
        if (section === 'buffs') return buffsMarkup();
        if (section === 'recipes') return recipesMarkup();
        return tasksMarkup();
    }

    function buildingsMarkup() {
        var defaults = (loaded.defaults && loaded.defaults.buildings) || [];
        return '<p class="siege-class-note">Base production of each workshop, before facility level, tools, resident affinity, rapport, and the favorite bonus multiply it.</p>' +
            '<div class="keep-tuning-table-wrap"><table class="siege-class-table"><thead><tr>' +
            '<th>Workshop</th><th>Material</th><th>Per minute</th><th>Storage</th></tr></thead><tbody>' +
            defaults.map(function (row) {
                var override = findRow(model.buildings, row.id) || {};
                return '<tr><th>' + escapeHtml(row.name) + '</th><td>' + escapeHtml(row.resourceName) + '</td>' +
                    '<td><input type="number" step="0.01" min="0" data-keep-building="' + row.id + '" data-field="ratePerMinute" placeholder="' + row.ratePerMinute + '" value="' + (override.ratePerMinute == null ? '' : override.ratePerMinute) + '"></td>' +
                    '<td><input type="number" step="1" min="1" data-keep-building="' + row.id + '" data-field="storage" placeholder="' + row.storage + '" value="' + (override.storage == null ? '' : override.storage) + '"></td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    function projectsMarkup() {
        var defaults = (loaded.defaults && loaded.defaults.projects) || [];
        return '<p class="siege-class-note">Timber price and build time for every construction project. Material costs are fixed by the project and are shown for reference.</p>' +
            '<div class="keep-tuning-table-wrap"><table class="siege-class-table"><thead><tr>' +
            '<th>Project</th><th>Timber</th><th>Seconds</th><th>Materials</th></tr></thead><tbody>' +
            defaults.map(function (row) {
                var override = findRow(model.projects, row.id) || {};
                return '<tr><th>' + escapeHtml(row.name) + '<small>' + escapeHtml(row.id) + '</small></th>' +
                    '<td><input type="number" step="1" min="0" data-keep-project="' + row.id + '" data-field="timberCost" placeholder="' + row.timberCost + '" value="' + (override.timberCost == null ? '' : override.timberCost) + '"></td>' +
                    '<td><input type="number" step="1" min="1" data-keep-project="' + row.id + '" data-field="seconds" placeholder="' + row.seconds + '" value="' + (override.seconds == null ? '' : override.seconds) + '"></td>' +
                    '<td class="keep-tuning-muted">' + escapeHtml(costsToText(row.materialCosts) || '—') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    function buffsMarkup() {
        var defaults = (loaded.defaults && loaded.defaults.buffs) || {};
        var buffs = model.buffs || {};
        function field(key, label, hint) {
            return '<label class="keep-tuning-field"><span>' + escapeHtml(label) + '</span>' +
                '<input type="number" step="1" min="0" data-keep-buff="' + key + '" placeholder="' + escapeHtml(String(defaults[key])) + '" value="' + (buffs[key] == null ? '' : buffs[key]) + '">' +
                '<small>' + escapeHtml(hint) + '</small></label>';
        }
        var rarities = Object.keys(defaults.favoritePercentByRarity || {});
        var favorite = buffs.favoritePercentByRarity || {};
        return '<p class="siege-class-note">Percentages a Siegeling contributes. <strong>Rapport</strong> multiplies whichever of these a resident already grants: at step 10% a rapport-5 partner gives 1.5x its affinity bonus and 1.5x its favorite bonus, so the gap between a Common and a Legendary favorite widens with rapport instead of flattening.</p>' +
            '<div class="keep-tuning-grid">' +
            field('facilityAffinityPercent', 'Workshop affinity', 'Resident whose element matches the workshop.') +
            field('facilityNeutralPercent', 'Neutral helper', 'Neutral-element resident at any workshop.') +
            field('woodlotAffinityPercent', 'Woodlot affinity', 'Earth/Wind/Water/Light resident at the Woodlot.') +
            field('toolTierPercent', 'Per crafted tool', 'Each of the five room tools adds this much output.') +
            field('elementalNetworkPercent', 'Insulated channels', 'Keep-wide workshop bonus from the network upgrade.') +
            field('rapportStepPercent', 'Rapport step', 'Buff multiplier added per rapport level.') +
            '</div>' +
            '<h4 class="keep-tuning-subhead">Favorite Siegeling bonus by rarity</h4>' +
            '<div class="keep-tuning-grid">' + rarities.map(function (rarity) {
                return '<label class="keep-tuning-field"><span>' + titleCase(rarity) + '</span>' +
                    '<input type="number" step="1" min="0" data-keep-favorite="' + rarity + '" placeholder="' + defaults.favoritePercentByRarity[rarity] + '" value="' + (favorite[rarity] == null ? '' : favorite[rarity]) + '"></label>';
            }).join('') + '</div>' +
            '<h4 class="keep-tuning-subhead">Rapport level thresholds</h4>' +
            '<label class="keep-tuning-field keep-tuning-wide"><span>Points needed per level (level 0 first)</span>' +
            '<input type="text" id="keepRapportThresholds" placeholder="' + escapeHtml((defaults.rapportThresholds || []).join(', ')) + '" value="' + escapeHtml((buffs.rapportThresholds || []).join(', ')) + '">' +
            '<small>Comma separated and ascending. The list length sets the maximum rapport level.</small></label>';
    }

    function recipesMarkup() {
        var defaults = (loaded.defaults && loaded.defaults.recipes) || [];
        var rooms = {};
        defaults.forEach(function (row) { (rooms[row.roomId] = rooms[row.roomId] || []).push(row); });
        return '<p class="siege-class-note">Blueprint display copy and material costs for every craftable tool and decoration, grouped by the room that hosts it.</p>' +
            Object.keys(rooms).map(function (roomId) {
                return '<h4 class="keep-tuning-subhead">' + escapeHtml(titleCase(roomId.replace(/_/g, ' '))) + '</h4>' +
                    '<div class="keep-tuning-table-wrap"><table class="siege-class-table"><thead><tr>' +
                    '<th>Blueprint</th><th>Name</th><th>Effect label</th><th>Costs</th></tr></thead><tbody>' +
                    rooms[roomId].map(function (row) {
                        var override = findRow(model.recipes, row.id) || {};
                        return '<tr><th>' + escapeHtml(row.type) + (row.tier ? ' ' + row.tier + '/5' : '') + '<small>' + escapeHtml(row.id) + '</small></th>' +
                            '<td><input type="text" data-keep-recipe="' + row.id + '" data-field="name" placeholder="' + escapeHtml(row.name) + '" value="' + escapeHtml(override.name || '') + '"></td>' +
                            '<td><input type="text" data-keep-recipe="' + row.id + '" data-field="bonusLabel" placeholder="' + escapeHtml(row.bonusLabel || '') + '" value="' + escapeHtml(override.bonusLabel || '') + '"></td>' +
                            '<td><input type="text" data-keep-recipe-costs="' + row.id + '" placeholder="' + escapeHtml(costsToText(row.costs)) + '" value="' + escapeHtml(costsToText(override.costs)) + '"></td></tr>';
                    }).join('') + '</tbody></table></div>';
            }).join('');
    }

    function tasksMarkup() {
        var defaults = loaded.defaults || {};
        var elements = Object.keys(defaults.elementTasks || {});
        if (elements.indexOf(taskElement) < 0) taskElement = elements[0] || 'FIRE';
        var shipped = (defaults.elementTasks || {})[taskElement] || [];
        var override = (model.tasks.elements || {})[taskElement] || null;
        var residents = Object.keys(model.tasks.residents || {});
        return '<p class="siege-class-note">Enclave residents offer tasks that pay rapport. A Siegeling gets its element ladder plus one personal bond task chosen from its card id, so two residents of the same element never offer the same set. Override an element to change every Siegeling that uses it, or override a single card id to replace that Siegeling\'s whole ladder.</p>' +
            '<div class="keep-tuning-grid">' +
            '<label class="keep-tuning-field"><span>Element</span><select id="keepTaskElement">' +
            elements.map(function (element) {
                return '<option value="' + element + '"' + (element === taskElement ? ' selected' : '') + '>' + titleCase(element) + '</option>';
            }).join('') + '</select></label>' +
            '<div class="keep-tuning-field"><span>Element ladder</span>' +
            '<div class="keep-tuning-inline">' +
            '<button type="button" class="btn btn-secondary" id="keepTaskLoadDefaults">Start from shipped</button>' +
            '<button type="button" class="btn btn-secondary" id="keepTaskClear"' + (override ? '' : ' disabled') + '>Clear override</button>' +
            '</div></div></div>' +
            taskTableMarkup(override || shipped, override ? 'element' : '', taskElement, !override) +
            '<h4 class="keep-tuning-subhead">Per-Siegeling ladders</h4>' +
            '<div class="keep-tuning-inline"><input type="text" id="keepTaskResidentId" placeholder="Siegeling card id (e.g. emberling)">' +
            '<button type="button" class="btn btn-secondary" id="keepTaskAddResident">Add ladder</button></div>' +
            residents.map(function (residentId) {
                return '<h5 class="keep-tuning-subhead">' + escapeHtml(residentId) +
                    ' <button type="button" class="btn btn-secondary" data-keep-task-remove-resident="' + escapeHtml(residentId) + '">Remove</button></h5>' +
                    taskTableMarkup(model.tasks.residents[residentId], 'resident', residentId, false);
            }).join('') +
            '<h4 class="keep-tuning-subhead">Personal bond tasks (read only)</h4>' +
            '<div class="keep-tuning-table-wrap"><table class="siege-class-table"><thead><tr><th>Task</th><th>Event</th><th>Goal</th><th>Rewards</th></tr></thead><tbody>' +
            (defaults.bondTasks || []).map(function (task) {
                return '<tr><th>' + escapeHtml(task.name) + '<small>' + escapeHtml(task.id) + '</small></th><td>' + escapeHtml(task.event) +
                    '</td><td>' + task.goal + '</td><td class="keep-tuning-muted">+' + task.rapport + ' rapport · ' + task.gold + 'g · ' + task.remnants + 'r</td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    function taskTableMarkup(tasks, scope, key, readOnly) {
        var events = (loaded.defaults && loaded.defaults.taskEvents) || [];
        var rows = (tasks || []).map(function (task, index) {
            var disabled = readOnly ? ' disabled' : '';
            return '<tr>' +
                '<td><input type="text" data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="id" value="' + escapeHtml(task.id || '') + '"' + disabled + '></td>' +
                '<td><select data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="event"' + disabled + '>' +
                events.map(function (event) {
                    return '<option value="' + event + '"' + (event === task.event ? ' selected' : '') + '>' + escapeHtml(event.replace(/_/g, ' ').toLowerCase()) + '</option>';
                }).join('') + '</select></td>' +
                '<td><input type="number" min="1" step="1" data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="goal" value="' + (task.goal == null ? '' : task.goal) + '"' + disabled + '></td>' +
                '<td><input type="text" data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="name" value="' + escapeHtml(task.name || '') + '"' + disabled + '></td>' +
                '<td><input type="text" data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="description" value="' + escapeHtml(task.description || '') + '"' + disabled + '></td>' +
                '<td><input type="number" min="0" step="1" data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="rapport" value="' + (task.rapport == null ? '' : task.rapport) + '"' + disabled + '></td>' +
                '<td><input type="number" min="0" step="1" data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="gold" value="' + (task.gold == null ? '' : task.gold) + '"' + disabled + '></td>' +
                '<td><input type="number" min="0" step="1" data-keep-task="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '" data-field="remnants" value="' + (task.remnants == null ? '' : task.remnants) + '"' + disabled + '></td>' +
                '<td>' + (readOnly ? '' : '<button type="button" class="btn btn-secondary" data-keep-task-remove="' + scope + '" data-key="' + escapeHtml(key) + '" data-index="' + index + '">×</button>') + '</td></tr>';
        }).join('');
        return '<div class="keep-tuning-table-wrap"><table class="siege-class-table keep-task-table"><thead><tr>' +
            '<th>Task id</th><th>Event</th><th>Goal</th><th>Name</th><th>Description</th><th>Rapport</th><th>Gold</th><th>Remnants</th><th></th>' +
            '</tr></thead><tbody>' + (rows || '<tr><td colspan="9" class="keep-tuning-muted">No tasks.</td></tr>') + '</tbody></table>' +
            (readOnly ? '<p class="keep-tuning-muted">Showing the shipped ladder. Use “Start from shipped” to begin editing it.</p>'
                : '<button type="button" class="btn btn-secondary" data-keep-task-add="' + scope + '" data-key="' + escapeHtml(key) + '">Add task</button>') +
            '</div>';
    }

    // ── Binding ───────────────────────────────────────────────────────────────

    function bind() {
        host.querySelectorAll('[data-keep-section]').forEach(function (button) {
            button.addEventListener('click', function () { section = button.dataset.keepSection; render(); });
        });
        host.querySelectorAll('[data-keep-building]').forEach(function (input) {
            input.addEventListener('change', function () {
                upsert(model.buildings, input.dataset.keepBuilding, input.dataset.field,
                    input.value === '' ? null : num(input.value));
            });
        });
        host.querySelectorAll('[data-keep-project]').forEach(function (input) {
            input.addEventListener('change', function () {
                upsert(model.projects, input.dataset.keepProject, input.dataset.field,
                    input.value === '' ? null : intOrNull(input.value));
            });
        });
        host.querySelectorAll('[data-keep-buff]').forEach(function (input) {
            input.addEventListener('change', function () {
                if (input.value === '') delete model.buffs[input.dataset.keepBuff];
                else model.buffs[input.dataset.keepBuff] = intOrNull(input.value);
            });
        });
        host.querySelectorAll('[data-keep-favorite]').forEach(function (input) {
            input.addEventListener('change', function () {
                model.buffs.favoritePercentByRarity = model.buffs.favoritePercentByRarity || {};
                if (input.value === '') delete model.buffs.favoritePercentByRarity[input.dataset.keepFavorite];
                else model.buffs.favoritePercentByRarity[input.dataset.keepFavorite] = intOrNull(input.value);
                if (!Object.keys(model.buffs.favoritePercentByRarity).length) delete model.buffs.favoritePercentByRarity;
            });
        });
        var thresholds = document.getElementById('keepRapportThresholds');
        if (thresholds) thresholds.addEventListener('change', function () {
            var parsed = thresholds.value.split(',').map(function (part) { return parseInt(part.trim(), 10); })
                .filter(function (value) { return !isNaN(value); });
            if (parsed.length > 1) model.buffs.rapportThresholds = parsed;
            else delete model.buffs.rapportThresholds;
        });
        host.querySelectorAll('[data-keep-recipe]').forEach(function (input) {
            input.addEventListener('change', function () {
                upsert(model.recipes, input.dataset.keepRecipe, input.dataset.field, input.value.trim() || null);
            });
        });
        host.querySelectorAll('[data-keep-recipe-costs]').forEach(function (input) {
            input.addEventListener('change', function () {
                upsert(model.recipes, input.dataset.keepRecipeCosts, 'costs', textToCosts(input.value));
            });
        });
        bindTaskControls();
        var saveBtn = document.getElementById('keepTuningSaveBtn');
        var resetBtn = document.getElementById('keepTuningResetBtn');
        if (saveBtn) saveBtn.addEventListener('click', save);
        if (resetBtn) resetBtn.addEventListener('click', resetAll);
    }

    function taskList(scope, key) {
        if (scope === 'resident') return model.tasks.residents[key] || (model.tasks.residents[key] = []);
        return model.tasks.elements[key] || (model.tasks.elements[key] = []);
    }

    function bindTaskControls() {
        var select = document.getElementById('keepTaskElement');
        if (select) select.addEventListener('change', function () { taskElement = select.value; render(); });
        var load = document.getElementById('keepTaskLoadDefaults');
        if (load) load.addEventListener('click', function () {
            var shipped = ((loaded.defaults || {}).elementTasks || {})[taskElement] || [];
            model.tasks.elements[taskElement] = JSON.parse(JSON.stringify(shipped));
            render();
        });
        var clear = document.getElementById('keepTaskClear');
        if (clear) clear.addEventListener('click', function () {
            delete model.tasks.elements[taskElement];
            render();
        });
        var addResident = document.getElementById('keepTaskAddResident');
        if (addResident) addResident.addEventListener('click', function () {
            var input = document.getElementById('keepTaskResidentId');
            var id = (input && input.value || '').trim();
            if (!id) { status('Enter a Siegeling card id first.', 'error'); return; }
            var shipped = ((loaded.defaults || {}).elementTasks || {})[taskElement] || [];
            model.tasks.residents[id] = JSON.parse(JSON.stringify(shipped));
            render();
        });
        host.querySelectorAll('[data-keep-task-remove-resident]').forEach(function (button) {
            button.addEventListener('click', function () {
                delete model.tasks.residents[button.dataset.keepTaskRemoveResident];
                render();
            });
        });
        host.querySelectorAll('[data-keep-task]').forEach(function (input) {
            if (input.disabled) return;
            input.addEventListener('change', function () {
                var list = taskList(input.dataset.keepTask, input.dataset.key);
                var row = list[Number(input.dataset.index)];
                if (!row) return;
                var field = input.dataset.field;
                if (field === 'goal' || field === 'rapport' || field === 'gold' || field === 'remnants') {
                    row[field] = input.value === '' ? null : intOrNull(input.value);
                } else {
                    row[field] = input.value.trim();
                }
            });
        });
        host.querySelectorAll('[data-keep-task-add]').forEach(function (button) {
            button.addEventListener('click', function () {
                taskList(button.dataset.keepTaskAdd, button.dataset.key).push({
                    id: 'custom_' + (taskList(button.dataset.keepTaskAdd, button.dataset.key).length + 1),
                    event: 'TIMBER_COLLECTION', goal: 3, name: 'A Task Together',
                    description: '{name} asks for a hand around the sanctuary.', rapport: 2, gold: 90, remnants: 20
                });
                render();
            });
        });
        host.querySelectorAll('[data-keep-task-remove]').forEach(function (button) {
            button.addEventListener('click', function () {
                taskList(button.dataset.keepTaskRemove, button.dataset.key).splice(Number(button.dataset.index), 1);
                render();
            });
        });
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    function payload() {
        var tasks = {};
        if (Object.keys(model.tasks.elements).length) tasks.elements = model.tasks.elements;
        if (Object.keys(model.tasks.residents).length) tasks.residents = model.tasks.residents;
        return {
            buildings: model.buildings,
            projects: model.projects,
            buffs: Object.keys(model.buffs).length ? model.buffs : null,
            recipes: model.recipes,
            tasks: Object.keys(tasks).length ? tasks : null
        };
    }

    function save() {
        status('Saving…');
        fetch('/api/keep/tuning', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ tuning: payload() })
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) throw new Error(data && data.error ? data.error : 'Save failed (' + response.status + ')');
                apply(data);
                status('✓ Saved — live in every keep', 'success');
            });
        }).catch(function (error) { status('✗ ' + error.message, 'error'); });
    }

    function resetAll() {
        status('Resetting…');
        fetch('/api/keep/tuning/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() }
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) throw new Error(data && data.error ? data.error : 'Reset failed (' + response.status + ')');
                apply(data);
                status('✓ Every override cleared', 'success');
            });
        }).catch(function (error) { status('✗ ' + error.message, 'error'); });
    }

    function apply(data) {
        loaded = data;
        model = normalizeModel(data.tuning);
        render();
    }

    fetch('/api/keep/tuning')
        .then(function (response) { return response.json(); })
        .then(apply)
        .catch(function (error) {
            host.innerHTML = '<p class="siege-class-note">Keep tuning could not be loaded: ' + escapeHtml(error.message) + '</p>';
        });
}());
