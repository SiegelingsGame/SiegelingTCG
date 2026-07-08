/* Siege item creation panel for the card dashboard.
 * Lists items from /api/siege/items and lets an authenticated editor create
 * new carryable items (VITALITY / ATTACK / SPEED / SHIELD). */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeItemPanel');
    if (!host) return;

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function render(data) {
        var kinds = data.kinds || ['VITALITY', 'ATTACK', 'SPEED', 'SHIELD'];
        var rows = (data.items || []).map(function (it) {
            return '<tr><td>' + (it.icon || '') + '</td><td>' + escapeHtml(it.name) +
                '</td><td>' + escapeHtml(it.kind) + '</td><td>' + it.value +
                '</td><td>' + escapeHtml(it.effect || '') + '</td></tr>';
        }).join('');
        var opts = kinds.map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('');
        host.innerHTML =
            '<p class="siege-class-note">Create carryable Siege items. Each Siegeling can hold one; ' +
            'VITALITY raises max HP while equipped, ATTACK/SPEED/SHIELD apply at battle start, ' +
            'EVOLUTION sigils auto-evolve at battle start (EVOLUTION2 requires a 3-stage line). ' +
            'Requires an editor login.</p>' +
            '<div class="siege-item-form">' +
            '<input id="siItemName" placeholder="Name" maxlength="28" />' +
            '<input id="siItemIcon" placeholder="Icon (emoji)" maxlength="4" style="width:90px" />' +
            '<select id="siItemKind">' + opts + '</select>' +
            '<input id="siItemValue" type="number" value="10" min="1" max="99" style="width:80px" />' +
            '<button id="siItemCreate" type="button">Create</button>' +
            '<span id="siItemStatus" class="siege-class-status"></span></div>' +
            '<table class="siege-class-table"><thead><tr><th></th><th>Item</th><th>Kind</th><th>Value</th><th>Effect</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>';
        document.getElementById('siItemCreate').addEventListener('click', create);
    }

    function create() {
        var status = document.getElementById('siItemStatus');
        status.textContent = '…';
        fetch('/api/siege/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({
                name: document.getElementById('siItemName').value,
                icon: document.getElementById('siItemIcon').value,
                kind: document.getElementById('siItemKind').value,
                value: parseInt(document.getElementById('siItemValue').value, 10) || 1
            })
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data && data.error ? data.error : 'Create failed (' + r.status + ')');
                render(data);
                var s = document.getElementById('siItemStatus');
                if (s) { s.textContent = '✓ created'; setTimeout(function () { s.textContent = ''; }, 1600); }
            });
        }).catch(function (e) { status.textContent = '✗ ' + e.message; });
    }

    fetch('/api/siege/items').then(function (r) { return r.json(); }).then(render)
        .catch(function () { host.innerHTML = '<p class="siege-class-note">Could not load Siege items.</p>'; });
})();
