/* Shared Siege ability-effect settings panel for the card dashboard.
 * Renders into #siegeEffectPanel and talks to /api/siege/effects. Each row is
 * one Effect and carries only the knobs that effect actually reads, so an edit
 * here changes every Siege card using that effect at once. Overridden values
 * are marked; Reset returns a row to the built-in balance. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeEffectPanel');
    if (!host) return;

    /* Column order is fixed so the table reads the same for every effect; a row
     * shows a dash where its effect does not use that knob. */
    var FIELDS = [
        { key: 'valueBonus', label: 'Value bonus', title: 'Added to the printed board value when the move becomes a Siege card.' },
        { key: 'valueCap', label: 'Value cap', title: 'Ceiling on the magnitude. 0 means uncapped.' },
        { key: 'minActionCost', label: 'Min AP', title: 'AP floor for cards with this effect, however cheap the board version is.' },
        { key: 'durationRounds', label: 'Duration', title: 'Rounds a buff or shield from this effect holds.' }
    ];

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function post(path, body, statusEl) {
        statusEl.textContent = '…';
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data && data.error ? data.error : 'Save failed (' + r.status + ')');
                return data;
            });
        }).catch(function (e) {
            statusEl.textContent = '✗ ' + e.message;
            throw e;
        });
    }

    function saved(statusEl) {
        statusEl.textContent = '✓ saved';
        setTimeout(function () { if (statusEl.textContent === '✓ saved') statusEl.textContent = ''; }, 1800);
    }

    function cell(row, field) {
        if ((row.fields || []).indexOf(field.key) < 0) {
            return '<td class="siege-effect-na">—</td>';
        }
        var def = (row.defaults || {})[field.key];
        var changed = row[field.key] !== def;
        return '<td>' +
            '<input class="siege-effect-input' + (changed ? ' is-override' : '') + '" type="number" ' +
            'data-field="' + field.key + '" value="' + row[field.key] + '" min="0" max="99" ' +
            'title="Default ' + def + '" />' +
            '<span class="siege-effect-default">def ' + def + '</span></td>';
    }

    function render(data) {
        var rows = (data.effects || []).map(function (row) {
            var editable = (row.fields || []).length > 0;
            return '<tr data-effect="' + escapeHtml(row.effect) + '">' +
                '<td><b>' + escapeHtml(row.label) + '</b><br><small>' + escapeHtml(row.effect) + '</small></td>' +
                FIELDS.map(function (f) { return cell(row, f); }).join('') +
                '<td>' + (editable
                    ? '<button type="button" class="siege-effect-save">Save</button> ' +
                      '<button type="button" class="siege-effect-reset"' +
                      (row.isOverride ? '' : ' disabled') + '>Reset</button>'
                    : '<span class="siege-effect-na">no settings</span>') +
                '</td><td class="siege-class-status"></td></tr>';
        }).join('');

        var globals = (data.globals || []).map(function (g) {
            return '<tr data-global="' + escapeHtml(g.key) + '">' +
                '<td><b>' + escapeHtml(g.label) + '</b><br><small>' + escapeHtml(g.description) + '</small></td>' +
                '<td><input class="siege-effect-input' + (g.isOverride ? ' is-override' : '') +
                '" type="number" value="' + g.value + '" min="0" max="100" title="Default ' + g.defaultValue + '" />' +
                '<span class="siege-effect-default">def ' + g.defaultValue + '</span></td>' +
                '<td><button type="button" class="siege-effect-save-global">Save</button></td>' +
                '<td class="siege-class-status"></td></tr>';
        }).join('');

        var source = data.source === 'FIRESTORE'
            ? 'Saved live to Firestore'
            : 'Saved to the local project file (no Firestore credentials here)';
        var who = data.updatedBy ? ' · last edited by ' + escapeHtml(data.updatedBy) : '';

        host.innerHTML =
            '<p class="siege-class-note">Shared settings for every Siege ability of a given effect — ' +
            'change one row and every card using that effect follows. <b>Value bonus</b> is added to the ' +
            'printed board value when a move becomes a Siege card, <b>value cap</b> is its ceiling, ' +
            '<b>min AP</b> is the price floor, and <b>duration</b> is how many rounds a granted buff or ' +
            'shield holds. Blank cells mean the effect does not use that knob. Requires an editor login; ' +
            'saves apply to battles started afterwards. <em>' + source + who + '</em></p>' +
            '<table class="siege-class-table siege-effect-table"><thead><tr><th>Effect</th>' +
            FIELDS.map(function (f) {
                return '<th title="' + escapeHtml(f.title) + '">' + f.label + '</th>';
            }).join('') +
            '<th></th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<h4 class="siege-effect-subhead">Cross-effect settings</h4>' +
            '<table class="siege-class-table siege-effect-table"><thead><tr><th>Setting</th><th>Value</th>' +
            '<th></th><th></th></tr></thead><tbody>' + globals + '</tbody></table>';

        bind();
    }

    function bind() {
        Array.prototype.forEach.call(host.querySelectorAll('tr[data-effect]'), function (tr) {
            var status = tr.querySelector('.siege-class-status');
            var saveBtn = tr.querySelector('.siege-effect-save');
            var resetBtn = tr.querySelector('.siege-effect-reset');
            if (saveBtn) {
                saveBtn.addEventListener('click', function () {
                    var body = { effect: tr.getAttribute('data-effect') };
                    Array.prototype.forEach.call(tr.querySelectorAll('.siege-effect-input'), function (input) {
                        var raw = input.value.trim();
                        // An emptied box clears that one knob back to its default,
                        // which is why the field is sent as null rather than skipped.
                        body[input.getAttribute('data-field')] = raw === '' ? null : parseInt(raw, 10);
                    });
                    post('/api/siege/effects', body, status).then(function (data) {
                        render(data);
                        var again = host.querySelector('tr[data-effect="' + tr.getAttribute('data-effect') + '"] .siege-class-status');
                        if (again) saved(again);
                    }).catch(function () { /* message already shown */ });
                });
            }
            if (resetBtn) {
                resetBtn.addEventListener('click', function () {
                    post('/api/siege/effects/reset', { effect: tr.getAttribute('data-effect') }, status)
                        .then(render).catch(function () { /* message already shown */ });
                });
            }
        });
        Array.prototype.forEach.call(host.querySelectorAll('tr[data-global]'), function (tr) {
            var status = tr.querySelector('.siege-class-status');
            tr.querySelector('.siege-effect-save-global').addEventListener('click', function () {
                var raw = tr.querySelector('.siege-effect-input').value.trim();
                post('/api/siege/effects/global', {
                    key: tr.getAttribute('data-global'),
                    value: raw === '' ? null : parseInt(raw, 10)
                }, status).then(function (data) {
                    render(data);
                    var again = host.querySelector('tr[data-global="' + tr.getAttribute('data-global') + '"] .siege-class-status');
                    if (again) saved(again);
                }).catch(function () { /* message already shown */ });
            });
        });
    }

    fetch('/api/siege/effects').then(function (r) { return r.json(); }).then(render)
        .catch(function () {
            host.innerHTML = '<p class="siege-class-note">Could not load Siege ability effects.</p>';
        });
})();
