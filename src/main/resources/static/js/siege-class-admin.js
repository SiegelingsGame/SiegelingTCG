/* Siege roguelike class assignment panel for the card dashboard.
 * Self-contained: renders into #siegeClassPanel, reads the editor auth token
 * from the same localStorage key the dashboard uses, and talks to
 * /api/siege/classes. Assignments override each knight's default class. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeClassPanel');
    if (!host) return;

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function load() {
        fetch('/api/siege/classes')
            .then(function (r) { return r.json(); })
            .then(render)
            .catch(function () {
                host.innerHTML = '<p class="siege-class-note">Could not load Siege classes.</p>';
            });
    }

    function assign(trainerId, passive, statusEl) {
        statusEl.textContent = '…';
        fetch('/api/siege/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ trainerId: trainerId, passive: passive })
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data && data.error ? data.error : 'Save failed (' + r.status + ')');
                statusEl.textContent = '✓ saved';
                setTimeout(function () { statusEl.textContent = ''; }, 1800);
            });
        }).catch(function (e) {
            statusEl.textContent = '✗ ' + e.message;
        });
    }

    function render(data) {
        var classes = data.classes || [];
        var rows = (data.knights || []).map(function (k) {
            var opts = ['<option value="DEFAULT">Default (' + escapeHtml(k.className) + ')</option>']
                .concat(classes.map(function (c) {
                    var sel = k.overridden && c.id === k.passive ? ' selected' : '';
                    return '<option value="' + c.id + '"' + sel + '>' + escapeHtml(c.name) + '</option>';
                })).join('');
            return '<tr data-id="' + escapeHtml(k.id) + '">' +
                '<td>' + escapeHtml(k.name) + '</td>' +
                '<td>' + escapeHtml(k.element) + '</td>' +
                '<td><select class="siege-class-select">' + opts + '</select></td>' +
                '<td class="siege-class-status"></td></tr>';
        }).join('');
        host.innerHTML =
            '<p class="siege-class-note">Assign each SiegeKnight’s roguelike class for Siege mode ' +
            '(Bulwark, Warlord, Vanguard, Warden, Quartermaster, Marshal — Marshal starts with an extra Siegeling). ' +
            'Requires an editor login; assignments apply immediately to new runs.</p>' +
            '<table class="siege-class-table"><thead><tr><th>Knight</th><th>Element</th><th>Class</th><th></th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>';
        Array.prototype.forEach.call(host.querySelectorAll('tr[data-id]'), function (tr) {
            var select = tr.querySelector('.siege-class-select');
            var status = tr.querySelector('.siege-class-status');
            select.addEventListener('change', function () {
                assign(tr.getAttribute('data-id'), select.value, status);
            });
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    load();
})();
