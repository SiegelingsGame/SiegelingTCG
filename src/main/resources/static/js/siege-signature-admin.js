/* Signature Ultimate panel for the card dashboard.
 *
 * A fully evolved Siegeling carries a Signature Ultimate where its Evolution
 * card used to be. Two layers are editable: the type-wide card every Siegeling
 * of an element inherits, and each individual's own card on top of that.
 *
 * Blank means inherited: every input's placeholder is what the row resolves to
 * without an edit (type row → built-in, Siegeling row → its type row), so an
 * untouched screen publishes nothing. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeSignaturePanel');
    if (!host) return;

    var FIELDS = ['name', 'effect', 'value', 'target', 'actionCost', 'status', 'statusChance', 'description'];
    var data = null;
    var dirty = {};   // key -> { field: value|'' }
    var resets = {};  // key -> true
    var search = '';
    var elementFilter = 'ALL';
    var onlyEdited = false;

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function allRows() {
        return (data.elements || []).concat(data.sieglings || []);
    }

    function rowByKey(key) {
        var rows = allRows();
        for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i];
        return null;
    }

    /* Saved override for one field, or '' when the row inherits it. */
    function saved(row, field) {
        if (!row.override || row.override[field] == null) return '';
        return String(row.override[field]);
    }

    function shown(row, field) {
        if (resets[row.key]) return '';
        var pending = dirty[row.key];
        if (pending && Object.prototype.hasOwnProperty.call(pending, field)) return pending[field];
        return saved(row, field);
    }

    function pendingCount() {
        var n = Object.keys(dirty).length;
        for (var k in resets) if (resets.hasOwnProperty(k) && !dirty[k]) n++;
        return n;
    }

    function select(row, field, values, label) {
        var current = shown(row, field);
        var inherited = row.inherited[field];
        return '<label class="siege-sig-box' + (current === '' ? '' : ' is-set') + '">' +
            '<span>' + label + '</span>' +
            '<select data-key="' + escapeHtml(row.key) + '" data-field="' + field + '">' +
            '<option value="">↳ ' + escapeHtml(inherited) + '</option>' +
            values.map(function (v) {
                return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + v + '</option>';
            }).join('') + '</select></label>';
    }

    function input(row, field, label, type, max) {
        var current = shown(row, field);
        var inherited = row.inherited[field];
        return '<label class="siege-sig-box' + (type === 'text' ? ' wide' : '') + (current === '' ? '' : ' is-set') + '">' +
            '<span>' + label + '</span>' +
            '<input type="' + type + '" data-key="' + escapeHtml(row.key) + '" data-field="' + field + '"' +
            (type === 'number' ? ' min="0" max="' + max + '"' : ' maxlength="' + max + '"') +
            ' value="' + escapeHtml(current) + '" placeholder="' + escapeHtml(inherited) + '" ' +
            'title="Inherited: ' + escapeHtml(inherited) + '. Leave blank to inherit." /></label>';
    }

    function summary(r) {
        var s = r.effect + ' ' + (r.value != null ? r.value : '') + ' → ' + r.target + ' · ' + r.actionCost + ' AP';
        if (r.status && r.status !== 'NONE' && r.statusChance) s += ' · ' + r.statusChance + '% ' + r.status;
        return s;
    }

    function rowMarkup(row, isElement) {
        var touched = !!dirty[row.key] || !!resets[row.key];
        var edited = !!row.override && !resets[row.key];
        var title = isElement
            ? '<b>' + escapeHtml(row.element) + ' type</b><small>Every ' + escapeHtml(row.element.toLowerCase()) +
              ' Siegeling inherits this</small>'
            : '<b>' + escapeHtml(row.name) + '</b><small>' + escapeHtml(row.element) + ' · stage ' + row.stage +
              ' · <code>' + escapeHtml(row.key) + '</code></small>';
        return '<div class="siege-sig-row' + (edited ? ' is-override' : '') + (touched ? ' is-dirty' : '') +
            '" data-row="' + escapeHtml(row.key) + '">' +
            '<div class="siege-sig-head"><i class="siege-move-el" data-el="' + escapeHtml(row.element) + '">' +
            escapeHtml(row.element) + '</i><div class="siege-sig-title">' + title + '</div>' +
            '<div class="siege-sig-live" title="What this card resolves to right now">✦ ' +
            escapeHtml(row.resolved.name) + ' — ' + escapeHtml(summary(row.resolved)) + '</div>' +
            (edited ? '<button type="button" class="siege-move-revert">reset</button>' : '') + '</div>' +
            '<div class="siege-sig-boxes">' +
            input(row, 'name', 'Name', 'text', 40) +
            select(row, 'effect', data.effects || [], 'Effect') +
            input(row, 'value', 'Value', 'number', data.maxValue || 99) +
            select(row, 'target', data.targets || [], 'Target') +
            input(row, 'actionCost', 'AP', 'number', data.maxActionCost || 5) +
            select(row, 'status', ['NONE'].concat(data.statuses || []), 'Status') +
            input(row, 'statusChance', 'Chance %', 'number', 100) +
            input(row, 'description', 'Flavor text', 'text', 220) +
            '</div></div>';
    }

    function visibleSieglings() {
        var q = search.trim().toLowerCase();
        return (data.sieglings || []).filter(function (row) {
            if (elementFilter !== 'ALL' && row.element !== elementFilter) return false;
            if (onlyEdited && !row.override && !dirty[row.key]) return false;
            if (!q) return true;
            return (row.name || '').toLowerCase().indexOf(q) >= 0 ||
                (row.key || '').toLowerCase().indexOf(q) >= 0 ||
                (row.resolved.name || '').toLowerCase().indexOf(q) >= 0;
        });
    }

    function render() {
        var pending = pendingCount();
        var elements = (data.elements || []).filter(function (row) {
            return elementFilter === 'ALL' || row.element === elementFilter;
        });
        var sieglings = visibleSieglings();
        var source = data.source === 'FIRESTORE'
            ? 'Publishes live to Firestore'
            : 'Publishes to the local project file (no Firestore credentials here)';
        var who = data.updatedBy ? ' · last edited by ' + escapeHtml(data.updatedBy) : '';
        var elementNames = ['ALL'].concat((data.elements || []).map(function (r) { return r.element; }));

        host.innerHTML =
            '<p class="siege-class-note">When a Siegeling reaches its <strong>final form</strong> — by playing its ' +
            'Evolution card, a Marshal Ultimate, or an Evolution sigil — its Evolution card turns into its ' +
            '<strong>Signature Ultimate</strong>: a once-per-battle card unlocked by spending ' + (data.gauge || 5) +
            ' AP of its own moves. Edit the <em>type</em> rows to change every Siegeling of an element, or a ' +
            'Siegeling row to give one individual its own card. Blank boxes inherit (placeholder shows what). ' +
            'Requires an editor login; saves apply to battles started afterwards. <em>' + source + who + '</em></p>' +
            '<div class="siege-move-toolbar">' +
            '<input type="search" id="siegeSigSearch" placeholder="Search Siegeling or ultimate" value="' +
            escapeHtml(search) + '" />' +
            '<select id="siegeSigElement">' + elementNames.map(function (v) {
                return '<option value="' + v + '"' + (v === elementFilter ? ' selected' : '') + '>' +
                    (v === 'ALL' ? 'All types' : v) + '</option>';
            }).join('') + '</select>' +
            '<label class="siege-effect-filter"><input type="checkbox" id="siegeSigOnlyEdited"' +
            (onlyEdited ? ' checked' : '') + ' /> Show only edited</label>' +
            '<span class="siege-effect-count">' + sieglings.length + ' final-form Siegeling' +
            (sieglings.length === 1 ? '' : 's') + ' shown</span></div>' +
            '<h4 class="siege-sig-heading">Type ultimates</h4>' +
            '<div class="siege-sig-list">' + elements.map(function (r) { return rowMarkup(r, true); }).join('') + '</div>' +
            '<h4 class="siege-sig-heading">Individual ultimates</h4>' +
            '<div class="siege-sig-list">' + (sieglings.length
                ? sieglings.map(function (r) { return rowMarkup(r, false); }).join('')
                : '<p class="siege-move-empty">No Siegelings match that filter.</p>') + '</div>' +
            '<div class="siege-effect-bar' + (pending ? ' is-active' : '') + '">' +
            '<span class="siege-effect-bar-text">' +
            (pending ? pending + ' unsaved change' + (pending === 1 ? '' : 's') : 'No unsaved changes') + '</span>' +
            '<span class="siege-class-status" id="siegeSigStatus"></span>' +
            '<button type="button" id="siegeSigRevert"' + (pending ? '' : ' disabled') + '>Discard</button>' +
            '<button type="button" id="siegeSigSave" class="primary"' + (pending ? '' : ' disabled') +
            '>Publish changes</button></div>';
        bind();
    }

    function onEdit(control) {
        var key = control.getAttribute('data-key');
        var field = control.getAttribute('data-field');
        var row = rowByKey(key);
        var value = control.value.trim();
        delete resets[key];
        var pending = dirty[key] || (dirty[key] = {});
        pending[field] = value;
        if (value === saved(row, field)) delete pending[field];
        if (!Object.keys(pending).length) delete dirty[key];
        control.parentNode.classList.toggle('is-set', value !== '');
        var rowEl = host.querySelector('.siege-sig-row[data-row="' + key + '"]');
        if (rowEl) rowEl.classList.toggle('is-dirty', !!dirty[key]);
        refreshBar();
    }

    function bind() {
        Array.prototype.forEach.call(host.querySelectorAll('[data-field]'), function (control) {
            control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', function () {
                onEdit(control);
            });
        });
        Array.prototype.forEach.call(host.querySelectorAll('.siege-move-revert'), function (btn) {
            btn.addEventListener('click', function () {
                var key = btn.closest('.siege-sig-row').getAttribute('data-row');
                delete dirty[key];
                resets[key] = true;
                render();
            });
        });
        var searchInput = document.getElementById('siegeSigSearch');
        if (searchInput) searchInput.addEventListener('input', function () {
            search = searchInput.value;
            render();
            var again = document.getElementById('siegeSigSearch');
            if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        });
        var el = document.getElementById('siegeSigElement');
        if (el) el.addEventListener('change', function () { elementFilter = el.value; render(); });
        var only = document.getElementById('siegeSigOnlyEdited');
        if (only) only.addEventListener('change', function () { onlyEdited = only.checked; render(); });
        var save = document.getElementById('siegeSigSave');
        if (save) save.addEventListener('click', publish);
        var discard = document.getElementById('siegeSigRevert');
        if (discard) discard.addEventListener('click', function () { dirty = {}; resets = {}; render(); });
    }

    /** Updates the save bar without re-rendering: a re-render would steal focus mid-typing. */
    function refreshBar() {
        var pending = pendingCount();
        var bar = host.querySelector('.siege-effect-bar');
        if (!bar) return;
        bar.classList.toggle('is-active', pending > 0);
        bar.querySelector('.siege-effect-bar-text').textContent = pending
            ? pending + ' unsaved change' + (pending === 1 ? '' : 's') : 'No unsaved changes';
        document.getElementById('siegeSigSave').disabled = !pending;
        document.getElementById('siegeSigRevert').disabled = !pending;
    }

    function publish() {
        var status = document.getElementById('siegeSigStatus');
        var rows = [];
        for (var k in resets) if (resets.hasOwnProperty(k) && !dirty[k]) rows.push({ key: k, reset: true });
        for (var key in dirty) {
            if (!dirty.hasOwnProperty(key)) continue;
            var patch = { key: key };
            FIELDS.forEach(function (f) {
                if (Object.prototype.hasOwnProperty.call(dirty[key], f)) patch[f] = dirty[key][f];
            });
            rows.push(patch);
        }
        if (!rows.length) return;
        status.textContent = 'Publishing…';
        fetch('/api/siege/signatures/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ signatures: rows })
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body && body.error ? body.error : 'Save failed (' + r.status + ')');
                data = body;
                dirty = {};
                resets = {};
                render();
                var done = document.getElementById('siegeSigStatus');
                done.textContent = '✓ published';
                setTimeout(function () { if (done.textContent === '✓ published') done.textContent = ''; }, 2200);
            });
        }).catch(function (e) {
            // The edits stay on screen so nothing typed is lost to a failed save.
            status.textContent = '✗ ' + e.message;
        });
    }

    fetch('/api/siege/signatures').then(function (r) { return r.json(); }).then(function (body) {
        data = body;
        render();
    }).catch(function () {
        host.innerHTML = '<p class="siege-class-note">Could not load Siege Signature Ultimates.</p>';
    });
})();
