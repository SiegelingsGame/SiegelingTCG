/* Per-move Siege tuning panel for the card dashboard.
 *
 * The Ability Effects panel next door rebalances every card of an effect at
 * once; this one names a single move's numbers. A list rather than that panel's
 * tile grid, because there are ~180 playable moves and the job here is "find
 * Ember, change its damage" — so search and filters come first and the row is
 * narrow enough that the derived number sits right beside the box.
 *
 * Blank means derived: the input's placeholder is what Siege works out from the
 * board card, so an untouched screen publishes nothing and reads as the live
 * balance. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeMovePanel');
    if (!host) return;

    /* Server state, and the edits made on top of it — kept apart so the panel can
     * show what changed, discard without a reload, and send only what moved. */
    var data = null;
    var dirty = {};        // moveId -> { value?: n|null, actionCost?: n|null }
    var resets = {};       // moveId -> true
    var search = '';
    var elementFilter = 'ALL';
    var effectFilter = 'ALL';
    var onlyChanged = false;
    /* The pool is larger than the roster: a move no Siegeling carries can still
       reach Siege as an enemy ability or a reward card, so it is listed — but
       "the moves my Siegelings play" is the common job, so it leads. */
    var onlyCarried = false;

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function moveRow(id) {
        for (var i = 0; i < (data.moves || []).length; i++) {
            if (data.moves[i].moveId === id) return data.moves[i];
        }
        return null;
    }

    /* What a box shows right now: the pending edit if there is one, else what the
     * server holds. A pinned number is shown; a derived one is left blank so the
     * placeholder (the derived value) reads as the answer. */
    function shown(row, field) {
        var over = field === 'value' ? 'overrideValue' : 'overrideActionCost';
        if (resets[row.moveId]) return '';
        var pending = dirty[row.moveId];
        if (pending && Object.prototype.hasOwnProperty.call(pending, field)) {
            return pending[field] == null ? '' : pending[field];
        }
        return row[over] == null ? '' : row[over];
    }

    function derived(row, field) {
        return field === 'value' ? row.derivedValue : row.derivedActionCost;
    }

    function pendingCount() {
        var n = Object.keys(dirty).length;
        for (var id in resets) {
            if (resets.hasOwnProperty(id) && !dirty[id]) n++;
        }
        return n;
    }

    function box(row, field, label) {
        var value = shown(row, field);
        var def = derived(row, field);
        var max = field === 'value' ? (data.maxValue || 99) : (data.maxActionCost || 5);
        return '<label class="siege-move-box' + (value === '' ? '' : ' is-set') + '">' +
            '<span class="siege-move-box-name">' + label + '</span>' +
            '<input type="number" data-move="' + escapeHtml(row.moveId) + '" data-field="' + field + '" ' +
            'value="' + value + '" min="0" max="' + max + '" placeholder="' + def + '" ' +
            'title="Derived: ' + def + '. Leave blank to keep deriving." />' +
            '<span class="siege-move-derived">der ' + def + '</span></label>';
    }

    function usedByText(row) {
        var names = row.usedBy || [];
        if (!names.length) return 'On no Siegeling yet';
        if (names.length <= 2) return 'On ' + names.join(', ');
        return 'On ' + names.length + ' Siegelings';
    }

    function listRow(row) {
        var touched = !!dirty[row.moveId] || !!resets[row.moveId];
        var pinned = row.isOverride && !resets[row.moveId];
        return '<div class="siege-move-row' + (pinned ? ' is-override' : '') +
            (touched ? ' is-dirty' : '') + '" data-row="' + escapeHtml(row.moveId) + '">' +
            '<div class="siege-move-id">' +
            '<b>' + escapeHtml(row.name) + '</b>' +
            '<span class="siege-move-tags">' +
            '<i class="siege-move-el" data-el="' + escapeHtml(row.element || '') + '">' +
            escapeHtml(row.element || '—') + '</i>' +
            '<i class="siege-move-effect">' + escapeHtml(row.effect) + '</i></span>' +
            '<code>' + escapeHtml(row.moveId) + '</code>' +
            '<small title="' + escapeHtml((row.usedBy || []).join(', ')) + '">' +
            escapeHtml(usedByText(row)) + ' · board ' + row.boardValue + ' / ' +
            row.boardEnergyCost + ' energy</small>' +
            '</div>' +
            '<div class="siege-move-boxes">' +
            (row.editsValue
                ? box(row, 'value', 'Damage / value')
                : '<span class="siege-move-novalue" title="' + escapeHtml(row.effect) +
                  ' does what it does regardless of any number">no magnitude</span>') +
            box(row, 'actionCost', 'AP cost') +
            (pinned ? '<button type="button" class="siege-move-revert" ' +
                'title="Return this move to its derived numbers">reset</button>' : '') +
            '</div></div>';
    }

    function carried(row) {
        return (row.usedBy || []).length > 0;
    }

    function visibleRows() {
        var q = search.trim().toLowerCase();
        return (data.moves || []).filter(function (row) {
            if (onlyChanged && !row.isOverride && !dirty[row.moveId]) return false;
            if (onlyCarried && !carried(row)) return false;
            if (elementFilter !== 'ALL' && row.element !== elementFilter) return false;
            if (effectFilter !== 'ALL' && row.effect !== effectFilter) return false;
            if (!q) return true;
            return (row.name || '').toLowerCase().indexOf(q) >= 0 ||
                   (row.moveId || '').toLowerCase().indexOf(q) >= 0 ||
                   (row.usedBy || []).join(' ').toLowerCase().indexOf(q) >= 0;
        }).sort(function (a, b) {
            // Pinned first (the edits being reviewed), then moves a Siegeling
            // actually carries, then alphabetically — the pool is 300+ long and
            // catalog order means nothing to the person scanning it.
            var ap = (a.isOverride || dirty[a.moveId]) ? 0 : 1;
            var bp = (b.isOverride || dirty[b.moveId]) ? 0 : 1;
            if (ap !== bp) return ap - bp;
            var ac = carried(a) ? 0 : 1, bc = carried(b) ? 0 : 1;
            if (ac !== bc) return ac - bc;
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    function options(values, selected) {
        return values.map(function (v) {
            return '<option value="' + escapeHtml(v) + '"' +
                (v === selected ? ' selected' : '') + '>' +
                escapeHtml(v === 'ALL' ? 'All' : v) + '</option>';
        }).join('');
    }

    function distinct(key) {
        var seen = {}, out = ['ALL'];
        (data.moves || []).forEach(function (row) {
            var v = row[key];
            if (v && !seen[v]) { seen[v] = true; out.push(v); }
        });
        return out;
    }

    function render() {
        var pending = pendingCount();
        var rows = visibleRows();
        var pinnedCount = (data.moves || []).filter(function (r) { return r.isOverride; }).length;
        var source = data.source === 'FIRESTORE'
            ? 'Publishes live to Firestore'
            : 'Publishes to the local project file (no Firestore credentials here)';
        var who = data.updatedBy ? ' · last edited by ' + escapeHtml(data.updatedBy) : '';

        host.innerHTML =
            '<p class="siege-class-note">Set what a single Siegeling move costs and does <strong>in Siege' +
            '</strong>, without touching its board card. Each box shows the derived number as its ' +
            'placeholder — leave it blank and the move keeps following the card; type a number and Siege ' +
            'uses that instead. Only playable moves are listed: a passive never becomes a Siege card. ' +
            'A move no Siegeling carries yet is still here — Siege draws on the same pool for enemy ' +
            'abilities and reward cards. ' +
            'Requires an editor login; saves apply to battles started afterwards. ' +
            '<em>' + source + who + '</em></p>' +
            '<div class="siege-move-toolbar">' +
            '<input type="search" id="siegeMoveSearch" placeholder="Search move, id, or Siegeling" ' +
            'value="' + escapeHtml(search) + '" />' +
            '<select id="siegeMoveElement">' + options(distinct('element'), elementFilter) + '</select>' +
            '<select id="siegeMoveEffect">' + options(distinct('effect'), effectFilter) + '</select>' +
            '<label class="siege-effect-filter"><input type="checkbox" id="siegeMoveOnlyCarried"' +
            (onlyCarried ? ' checked' : '') + ' /> On a Siegeling</label>' +
            '<label class="siege-effect-filter"><input type="checkbox" id="siegeMoveOnlySet"' +
            (onlyChanged ? ' checked' : '') + ' /> Show only pinned</label>' +
            '<span class="siege-effect-count">' + pinnedCount + ' move' + (pinnedCount === 1 ? '' : 's') +
            ' pinned · ' + rows.length + ' shown</span>' +
            '</div>' +
            '<div class="siege-move-list">' +
            (rows.length ? rows.map(listRow).join('')
                : '<p class="siege-move-empty">No moves match that filter.</p>') +
            '</div>' +
            '<div class="siege-effect-bar' + (pending ? ' is-active' : '') + '">' +
            '<span class="siege-effect-bar-text">' +
            (pending ? pending + ' unsaved change' + (pending === 1 ? '' : 's') : 'No unsaved changes') +
            '</span>' +
            '<span class="siege-class-status" id="siegeMoveStatus"></span>' +
            '<button type="button" id="siegeMoveRevert"' + (pending ? '' : ' disabled') + '>Discard</button>' +
            '<button type="button" id="siegeMoveSave" class="primary"' + (pending ? '' : ' disabled') +
            '>Publish changes</button></div>';
        bind();
    }

    function bind() {
        Array.prototype.forEach.call(host.querySelectorAll('input[data-field]'), function (input) {
            input.addEventListener('input', function () {
                var id = input.getAttribute('data-move');
                var field = input.getAttribute('data-field');
                var row = moveRow(id);
                var raw = input.value.trim();
                var value = raw === '' ? null : parseInt(raw, 10);
                if (raw !== '' && isNaN(value)) return;
                // Typing in a row takes it out of "reset": the editor is naming
                // numbers again, not clearing the row.
                delete resets[id];
                var pending = dirty[id] || (dirty[id] = {});
                pending[field] = value;
                // Back to exactly what the server holds? Then it is not a change.
                var saved = field === 'value' ? row.overrideValue : row.overrideActionCost;
                if (value === saved || (value == null && saved == null)) delete pending[field];
                if (!Object.keys(pending).length) delete dirty[id];
                input.parentNode.classList.toggle('is-set', raw !== '');
                var rowEl = host.querySelector('.siege-move-row[data-row="' + id + '"]');
                if (rowEl) rowEl.classList.toggle('is-dirty', !!dirty[id]);
                refreshBar();
            });
        });
        Array.prototype.forEach.call(host.querySelectorAll('.siege-move-revert'), function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.closest('.siege-move-row').getAttribute('data-row');
                delete dirty[id];
                resets[id] = true;
                render();
            });
        });
        var searchInput = document.getElementById('siegeMoveSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                search = searchInput.value;
                render();
                // A re-render replaces the field, so put the caret back where it was.
                var again = document.getElementById('siegeMoveSearch');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            });
        }
        var el = document.getElementById('siegeMoveElement');
        if (el) el.addEventListener('change', function () { elementFilter = el.value; render(); });
        var eff = document.getElementById('siegeMoveEffect');
        if (eff) eff.addEventListener('change', function () { effectFilter = eff.value; render(); });
        var only = document.getElementById('siegeMoveOnlySet');
        if (only) only.addEventListener('change', function () { onlyChanged = only.checked; render(); });
        var carriedOnly = document.getElementById('siegeMoveOnlyCarried');
        if (carriedOnly) carriedOnly.addEventListener('change', function () {
            onlyCarried = carriedOnly.checked;
            render();
        });
        var save = document.getElementById('siegeMoveSave');
        if (save) save.addEventListener('click', publish);
        var discard = document.getElementById('siegeMoveRevert');
        if (discard) discard.addEventListener('click', function () {
            dirty = {};
            resets = {};
            render();
        });
    }

    /** Updates the save bar without re-rendering: a re-render would steal focus mid-typing. */
    function refreshBar() {
        var pending = pendingCount();
        var bar = host.querySelector('.siege-effect-bar');
        if (!bar) return;
        bar.classList.toggle('is-active', pending > 0);
        bar.querySelector('.siege-effect-bar-text').textContent = pending
            ? pending + ' unsaved change' + (pending === 1 ? '' : 's')
            : 'No unsaved changes';
        document.getElementById('siegeMoveSave').disabled = !pending;
        document.getElementById('siegeMoveRevert').disabled = !pending;
    }

    function publish() {
        var status = document.getElementById('siegeMoveStatus');
        var moves = [];
        for (var id in resets) {
            if (resets.hasOwnProperty(id) && !dirty[id]) moves.push({ moveId: id, reset: true });
        }
        for (var moveId in dirty) {
            if (!dirty.hasOwnProperty(moveId)) continue;
            var patch = { moveId: moveId };
            for (var f in dirty[moveId]) {
                if (dirty[moveId].hasOwnProperty(f)) patch[f] = dirty[moveId][f];
            }
            moves.push(patch);
        }
        if (!moves.length) return;
        status.textContent = 'Publishing…';
        fetch('/api/siege/moves/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ moves: moves })
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body && body.error ? body.error : 'Save failed (' + r.status + ')');
                data = body;
                dirty = {};
                resets = {};
                render();
                var el = document.getElementById('siegeMoveStatus');
                el.textContent = '✓ published';
                setTimeout(function () {
                    if (el.textContent === '✓ published') el.textContent = '';
                }, 2200);
            });
        }).catch(function (e) {
            // The edits stay on screen so nothing typed is lost to a failed save.
            status.textContent = '✗ ' + e.message;
        });
    }

    fetch('/api/siege/moves').then(function (r) { return r.json(); }).then(function (body) {
        data = body;
        render();
    }).catch(function () {
        host.innerHTML = '<p class="siege-class-note">Could not load Siege move tuning.</p>';
    });
})();
