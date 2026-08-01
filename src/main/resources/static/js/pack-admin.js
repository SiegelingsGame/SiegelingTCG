/* Shop pack availability panel for the card dashboard.
 * Lists every pack this build knows about from /api/shop/packs/availability and lets an
 * authenticated editor switch each one on or off. Deactivated packs disappear from the
 * hub shop and can no longer be opened. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('packAvailabilityPanel');
    if (!host) return;

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function titleCase(s) {
        var lower = String(s || '').toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    function rowId(packId, suffix) {
        return 'packRow_' + String(packId).replace(/[^a-zA-Z0-9_]/g, '_') + '_' + suffix;
    }

    function render(data) {
        var packs = data.packs || [];
        if (!packs.length) {
            host.innerHTML = '<p class="siege-class-note">No packs are configured for this build.</p>';
            return;
        }
        var activeCount = packs.filter(function (pack) { return pack.active !== false; }).length;

        var rows = packs.map(function (pack) {
            var active = pack.active !== false;
            var elements = (pack.elements || []).map(titleCase).join(' / ');
            return '<tr class="pack-availability-row' + (active ? '' : ' is-inactive') + '" id="' + rowId(pack.id, 'tr') + '">' +
                '<td>' +
                '<strong>' + escapeHtml(pack.name || pack.id) + '</strong>' +
                '<span class="pack-availability-id">' + escapeHtml(pack.id) + '</span>' +
                '<span class="pack-availability-desc">' + escapeHtml(pack.description || '') + '</span>' +
                '</td>' +
                '<td>' + escapeHtml(elements) + '</td>' +
                '<td>' + escapeHtml(String(pack.price == null ? '' : pack.price)) + '</td>' +
                '<td>' + (pack.starterEligible ? 'Starter' : '—') + '</td>' +
                '<td class="pack-availability-toggle-cell">' +
                '<label class="pack-availability-toggle">' +
                '<input type="checkbox" id="' + rowId(pack.id, 'input') + '" data-pack-id="' + escapeHtml(pack.id) + '"' + (active ? ' checked' : '') + ' />' +
                '<span>' + (active ? 'Active' : 'Off') + '</span>' +
                '</label>' +
                '<span id="' + rowId(pack.id, 'status') + '" class="siege-class-status"></span>' +
                '</td>' +
                '</tr>';
        }).join('');

        host.innerHTML =
            '<p class="siege-class-note">Switch individual shop packs on or off. Deactivated packs vanish from the hub shop ' +
            'and can no longer be opened or bought in bulk; at least one pack — and one starter-eligible pack — must stay active. ' +
            'Requires an editor login. Players may keep seeing an old list for up to 24 hours because the hub caches the pack ' +
            'catalog locally.</p>' +
            '<p class="siege-class-note">' + activeCount + ' of ' + packs.length + ' packs active.</p>' +
            '<div class="pack-availability-table-wrap">' +
            '<table class="siege-class-table pack-availability-table">' +
            '<thead><tr><th>Pack</th><th>Elements</th><th>Price</th><th>Starter</th><th>Available</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>' +
            '</div>';

        packs.forEach(function (pack) {
            var input = document.getElementById(rowId(pack.id, 'input'));
            if (input) {
                input.addEventListener('change', function () { save(pack.id, input.checked); });
            }
        });
    }

    function save(packId, active) {
        var status = document.getElementById(rowId(packId, 'status'));
        if (status) status.textContent = '…';
        fetch('/api/shop/packs/availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ packId: packId, active: active })
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data && data.error ? data.error : 'Save failed (' + r.status + ')');
                render(data);
                var s = document.getElementById(rowId(packId, 'status'));
                if (s) {
                    s.textContent = active ? '✓ activated' : '✓ deactivated';
                    setTimeout(function () { s.textContent = ''; }, 1600);
                }
            });
        }).catch(function (e) {
            // Snap the checkbox back so it never shows a state the server rejected.
            var input = document.getElementById(rowId(packId, 'input'));
            if (input) input.checked = !active;
            var s = document.getElementById(rowId(packId, 'status'));
            if (s) s.textContent = '✗ ' + e.message;
        });
    }

    fetch('/api/shop/packs/availability').then(function (r) { return r.json(); }).then(render)
        .catch(function () { host.innerHTML = '<p class="siege-class-note">Could not load pack availability.</p>'; });
})();
