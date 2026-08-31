/* Per-card Siege tuning panel for the card dashboard.
 * The Ability Effects panel sets the shared rules; this one overrides a single
 * card on top of them. Every row shows the value it inherits from its effect
 * beside the value in play, so an editor can always see what clearing the
 * override would restore. Edits batch into one publish, like the effects panel. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeCardPanel');
    if (!host) return;

    var FIELD_LABEL = {
        value: 'Value',
        actionCost: 'AP',
        durationRounds: 'Duration',
        statusChance: 'Status %'
    };

    var data = null;
    var dirty = {};      // moveId -> { field: valueOrNull }
    var resets = {};     // moveId -> true
    var filters = { text: '', element: '', effect: '', onlySet: false };

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function cardById(id) {
        for (var i = 0; i < (data.cards || []).length; i++) {
            if (data.cards[i].moveId === id) return data.cards[i];
        }
        return null;
    }

    function shown(card, field) {
        if (resets[card.moveId]) return card.defaults[field];
        var pending = dirty[card.moveId];
        if (pending && Object.prototype.hasOwnProperty.call(pending, field)) {
            return pending[field] == null ? card.defaults[field] : pending[field];
        }
        return card[field];
    }

    function shownExcluded(card) {
        if (resets[card.moveId]) return false;
        var pending = dirty[card.moveId];
        if (pending && Object.prototype.hasOwnProperty.call(pending, 'excluded')) {
            return !!pending.excluded;
        }
        return !!card.excluded;
    }

    function pendingCount() {
        var n = Object.keys(dirty).length;
        for (var id in resets) {
            if (resets.hasOwnProperty(id) && !dirty[id]) n++;
        }
        return n;
    }

    function visibleCards() {
        var text = filters.text.trim().toLowerCase();
        return (data.cards || []).filter(function (c) {
            if (filters.element && c.element !== filters.element) return false;
            if (filters.effect && c.effect !== filters.effect) return false;
            if (filters.onlySet && !c.isOverride && !dirty[c.moveId]) return false;
            if (!text) return true;
            return (c.name + ' ' + c.moveId + ' ' + (c.owners || []).join(' ')).toLowerCase().indexOf(text) >= 0;
        });
    }

    function fieldCell(card, field) {
        if ((card.fields || []).indexOf(field) < 0) return '';
        var value = shown(card, field);
        var def = card.defaults[field];
        return '<label class="siege-card-field' + (value !== def ? ' is-set' : '') + '">' +
            '<span>' + FIELD_LABEL[field] + '</span>' +
            '<input type="number" min="0" max="99" data-card="' + escapeHtml(card.moveId) + '" ' +
            'data-field="' + field + '" value="' + value + '" placeholder="' + def + '" ' +
            'title="Inherited from the effect: ' + def + '" />' +
            '<small>def ' + def + '</small></label>';
    }

    function row(card) {
        var touched = !!dirty[card.moveId] || !!resets[card.moveId];
        var overridden = card.isOverride && !resets[card.moveId];
        var excluded = shownExcluded(card);
        var owners = (card.owners || []).length
            ? escapeHtml((card.owners || []).slice(0, 3).join(', ')) +
              ((card.owners || []).length > 3 ? ' +' + (card.owners.length - 3) : '')
            : '<em>reward pool only</em>';
        return '<div class="siege-card-row' + (overridden ? ' is-override' : '') +
            (touched ? ' is-dirty' : '') + (excluded ? ' is-excluded' : '') +
            '" data-row="' + escapeHtml(card.moveId) + '">' +
            '<div class="siege-card-id">' +
            '<b>' + escapeHtml(card.name) + '</b>' +
            '<span class="siege-card-tags">' + escapeHtml(card.element || '') + ' · ' +
            escapeHtml(card.effect) + '</span>' +
            '<span class="siege-card-owners">' + owners + '</span></div>' +
            '<div class="siege-card-fields">' +
            ['value', 'actionCost', 'durationRounds', 'statusChance']
                .map(function (f) { return fieldCell(card, f); }).join('') +
            '</div>' +
            '<div class="siege-card-actions">' +
            '<label class="siege-card-exclude" title="Keep this card out of Siege entirely. ' +
            'The board move is untouched.">' +
            '<input type="checkbox" data-exclude="' + escapeHtml(card.moveId) + '"' +
            (excluded ? ' checked' : '') + ' /> exclude</label>' +
            (overridden ? '<button type="button" class="siege-card-reset">reset</button>' : '') +
            '</div></div>';
    }

    function options(values, selected) {
        return ['<option value="">All</option>'].concat(values.map(function (v) {
            return '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '</option>';
        })).join('');
    }

    function render() {
        var cards = data.cards || [];
        var elements = [];
        var effects = [];
        cards.forEach(function (c) {
            if (c.element && elements.indexOf(c.element) < 0) elements.push(c.element);
            if (effects.indexOf(c.effect) < 0) effects.push(c.effect);
        });
        elements.sort();
        effects.sort();
        var visible = visibleCards();
        var pending = pendingCount();

        host.innerHTML =
            '<p class="siege-class-note">Override a <b>single Siege card</b> on top of the shared ' +
            'Ability Effects rules — its magnitude, AP, buff duration or status chance. Each box shows ' +
            'what the card inherits underneath ("def"); clear a box to go back to it. Nothing here ' +
            'touches the printed board move: the same Siegeling keeps its card on the battle table. ' +
            '<b>Exclude</b> keeps a card out of Siege entirely. Requires an editor login; saves apply ' +
            'to battles started afterwards.</p>' +
            '<div class="siege-card-toolbar">' +
            '<input type="search" id="siegeCardSearch" placeholder="Search name, id or Siegeling…" ' +
            'value="' + escapeHtml(filters.text) + '" />' +
            '<select id="siegeCardElement">' + options(elements, filters.element) + '</select>' +
            '<select id="siegeCardEffect">' + options(effects, filters.effect) + '</select>' +
            '<label class="siege-effect-filter"><input type="checkbox" id="siegeCardOnlySet"' +
            (filters.onlySet ? ' checked' : '') + ' /> Only changed</label>' +
            '<span class="siege-card-count">' + visible.length + ' of ' + cards.length + ' cards · ' +
            (data.overrideCount || 0) + ' overridden</span></div>' +
            '<div class="siege-card-list">' +
            (visible.length ? visible.map(row).join('')
                : '<p class="siege-class-note">No cards match that filter.</p>') +
            '</div>' +
            '<div class="siege-effect-bar' + (pending ? ' is-active' : '') + '">' +
            '<span class="siege-effect-bar-text">' +
            (pending ? pending + ' unsaved card' + (pending === 1 ? '' : 's') : 'No unsaved changes') +
            '</span><span class="siege-class-status" id="siegeCardStatus"></span>' +
            '<button type="button" id="siegeCardDiscard"' + (pending ? '' : ' disabled') + '>Discard</button>' +
            '<button type="button" id="siegeCardSave" class="primary"' + (pending ? '' : ' disabled') +
            '>Publish changes</button></div>';
        bind();
    }

    function markDirty(moveId) {
        var el = host.querySelector('.siege-card-row[data-row="' + moveId + '"]');
        if (el) el.classList.toggle('is-dirty', !!dirty[moveId] || !!resets[moveId]);
        refreshBar();
    }

    function bind() {
        bindRows();
        var search = document.getElementById('siegeCardSearch');
        search.addEventListener('input', function () {
            filters.text = search.value;
            renderList();
        });
        document.getElementById('siegeCardElement').addEventListener('change', function () {
            filters.element = this.value; render();
        });
        document.getElementById('siegeCardEffect').addEventListener('change', function () {
            filters.effect = this.value; render();
        });
        document.getElementById('siegeCardOnlySet').addEventListener('change', function () {
            filters.onlySet = this.checked; render();
        });
        document.getElementById('siegeCardSave').addEventListener('click', publish);
        document.getElementById('siegeCardDiscard').addEventListener('click', function () {
            dirty = {}; resets = {}; render();
        });
    }

    /** Repaints only the list, so typing in the search box keeps its caret. */
    function renderList() {
        var visible = visibleCards();
        var list = host.querySelector('.siege-card-list');
        list.innerHTML = visible.length ? visible.map(row).join('')
            : '<p class="siege-class-note">No cards match that filter.</p>';
        var count = host.querySelector('.siege-card-count');
        if (count) {
            count.textContent = visible.length + ' of ' + (data.cards || []).length + ' cards · ' +
                (data.overrideCount || 0) + ' overridden';
        }
        bindRows();
    }

    /**
     * Row listeners. Assigned rather than added so calling this again after a
     * list-only repaint cannot stack a second copy on a surviving node.
     */
    function bindRows() {
        Array.prototype.forEach.call(host.querySelectorAll('input[data-field]'), function (input) {
            input.oninput = function () {
                var id = input.getAttribute('data-card');
                var field = input.getAttribute('data-field');
                var card = cardById(id);
                var raw = input.value.trim();
                var value = raw === '' ? null : parseInt(raw, 10);
                if (raw !== '' && isNaN(value)) return;
                delete resets[id];
                var pending = dirty[id] || (dirty[id] = {});
                pending[field] = value;
                if (value === card[field]) delete pending[field];
                if (!Object.keys(pending).length) delete dirty[id];
                input.parentNode.classList.toggle('is-set', Number(input.value) !== card.defaults[field]);
                markDirty(id);
            };
        });
        Array.prototype.forEach.call(host.querySelectorAll('input[data-exclude]'), function (box) {
            box.onchange = function () {
                var id = box.getAttribute('data-exclude');
                var card = cardById(id);
                delete resets[id];
                var pending = dirty[id] || (dirty[id] = {});
                pending.excluded = box.checked;
                if (!!card.excluded === box.checked) delete pending.excluded;
                if (!Object.keys(pending).length) delete dirty[id];
                var el = host.querySelector('.siege-card-row[data-row="' + id + '"]');
                if (el) el.classList.toggle('is-excluded', box.checked);
                markDirty(id);
            };
        });
        Array.prototype.forEach.call(host.querySelectorAll('.siege-card-reset'), function (btn) {
            btn.onclick = function () {
                var id = btn.closest('.siege-card-row').getAttribute('data-row');
                delete dirty[id];
                resets[id] = true;
                render();
            };
        });
    }

    function refreshBar() {
        var pending = pendingCount();
        var bar = host.querySelector('.siege-effect-bar');
        if (!bar) return;
        bar.classList.toggle('is-active', pending > 0);
        bar.querySelector('.siege-effect-bar-text').textContent = pending
            ? pending + ' unsaved card' + (pending === 1 ? '' : 's')
            : 'No unsaved changes';
        document.getElementById('siegeCardSave').disabled = !pending;
        document.getElementById('siegeCardDiscard').disabled = !pending;
    }

    function publish() {
        var status = document.getElementById('siegeCardStatus');
        var cards = [];
        for (var id in resets) {
            if (resets.hasOwnProperty(id) && !dirty[id]) cards.push({ moveId: id, reset: true });
        }
        for (var moveId in dirty) {
            if (!dirty.hasOwnProperty(moveId)) continue;
            var patch = { moveId: moveId };
            for (var f in dirty[moveId]) {
                if (dirty[moveId].hasOwnProperty(f)) patch[f] = dirty[moveId][f];
            }
            cards.push(patch);
        }
        status.textContent = 'Publishing…';
        fetch('/api/siege/cards/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ cards: cards })
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body && body.error ? body.error : 'Save failed (' + r.status + ')');
                data = body;
                dirty = {}; resets = {};
                render();
                var el = document.getElementById('siegeCardStatus');
                el.textContent = '✓ published';
                setTimeout(function () {
                    if (el.textContent === '✓ published') el.textContent = '';
                }, 2200);
            });
        }).catch(function (e) {
            // Edits stay on screen so a refused save loses nothing.
            status.textContent = '✗ ' + e.message;
        });
    }

    fetch('/api/siege/cards').then(function (r) { return r.json(); }).then(function (body) {
        data = body;
        render();
    }).catch(function () {
        host.innerHTML = '<p class="siege-class-note">Could not load Siege cards.</p>';
    });
})();
