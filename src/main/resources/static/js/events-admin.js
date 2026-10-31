/* Daily Battle rotation for the card dashboard (Events page).
 * Edits /api/events/daily-battles: one row per day of the rotation (seven to
 * start), each naming the opponent, their SiegeKnight and preset deck, and the
 * card they are known for. A blank featured card means "the deck's strongest
 * Siegeling", which the server works out. The rotation walks the list one row
 * per UTC day; the row marked Today is the one players face now. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var GATE_KEY = 'sieglingsCardDashboardGate';
    var host = document.getElementById('dailyBattlePanel');
    if (!host) return;

    var loaded = null;   // last server response: battles + decks + trainers
    var rows = [];       // working copy the form edits
    var busy = false;

    function read(key) {
        try { return window.localStorage.getItem(key) || ''; } catch (e) { return ''; }
    }
    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function status(message, tone) {
        var node = document.getElementById('dailyBattleStatus');
        if (!node) return;
        node.textContent = message || '';
        node.className = 'siege-class-status' + (tone ? ' tone-' + tone : '');
    }

    function deckById(id) {
        var decks = (loaded && loaded.decks) || [];
        for (var i = 0; i < decks.length; i++) if (decks[i].id === id) return decks[i];
        return null;
    }

    function options(list, selected, labelFn, blank) {
        return (blank ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (item) {
            return '<option value="' + esc(item.id) + '"' + (item.id === selected ? ' selected' : '') + '>' + esc(labelFn(item)) + '</option>';
        }).join('');
    }

    function render() {
        if (!loaded) {
            host.innerHTML = '<p class="siege-class-status">Loading the rotation…</p>';
            return;
        }
        var decks = loaded.decks || [];
        var trainers = loaded.trainers || [];
        host.innerHTML =
            '<p class="field-hint">One battle per UTC day, in this order, then it starts over. ' +
              'Leave Featured card blank to feature the deck’s strongest Siegeling.' +
              (loaded.persistent ? '' : ' <strong>Firestore is not connected here: edits last until the server restarts.</strong>') + '</p>' +
            '<div class="daily-battle-rows">' + rows.map(function (r, i) {
                var deck = deckById(r.deckId);
                var cards = deck ? deck.cards : [];
                return '<fieldset class="daily-battle-row' + (i === loaded.todayIndex ? ' is-today' : '') + '" data-row="' + i + '">' +
                    '<legend>Day ' + (i + 1) + (i === loaded.todayIndex ? ' · Today' : '') + '</legend>' +
                    '<label>Opponent name<input data-field="opponentName" maxlength="40" value="' + esc(r.opponentName || '') + '" placeholder="Their SiegeKnight’s name"></label>' +
                    '<label>Title<input data-field="title" maxlength="60" value="' + esc(r.title || '') + '" placeholder="The deck’s name"></label>' +
                    '<label>SiegeKnight<select data-field="trainerId">' + options(trainers, r.trainerId, function (t) { return t.name + ' (' + t.element + ')'; }) + '</select></label>' +
                    '<label>Preset deck<select data-field="deckId">' + options(decks, r.deckId, function (d) { return d.name + ' · ' + d.elements.join('/'); }) + '</select></label>' +
                    '<label>Featured card<select data-field="featuredCardId">' + options(cards, r.featuredCardId, function (c) { return c.name; }, 'Strongest in deck') + '</select></label>' +
                    '<label class="is-wide">Blurb<input data-field="blurb" maxlength="200" value="' + esc(r.blurb || '') + '" placeholder="Optional line under their name"></label>' +
                    '<div class="daily-battle-row-actions">' +
                      '<button type="button" class="btn btn-secondary" data-move="-1"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
                      '<button type="button" class="btn btn-secondary" data-move="1"' + (i === rows.length - 1 ? ' disabled' : '') + '>↓</button>' +
                      '<button type="button" class="btn btn-secondary" data-remove' + (rows.length <= 1 ? ' disabled' : '') + '>Remove</button>' +
                    '</div>' +
                '</fieldset>';
            }).join('') + '</div>' +
            '<div class="inline-actions">' +
              '<button type="button" class="btn btn-secondary" data-add>+ Add a day</button>' +
              '<button type="button" class="btn btn-secondary" data-revert>Revert</button>' +
              '<button type="button" class="btn btn-primary" data-save>Save rotation</button>' +
            '</div>' +
            '<p id="dailyBattleStatus" class="siege-class-status"></p>';
    }

    function fromServer(data) {
        loaded = data;
        rows = (data.battles || []).map(function (b) {
            var stored = b.stored || {};
            // Blank fields stay blank so their fallbacks (knight name, deck name,
            // strongest card) keep following the catalog.
            return {
                id: b.id, opponentName: stored.opponentName || '', title: stored.title || '',
                trainerId: b.trainerId, deckId: b.deckId, featuredCardId: stored.featuredCardId || '', blurb: b.blurb || ''
            };
        });
        render();
    }

    function refresh() {
        fetch('/api/events/daily-battles').then(function (r) { return r.json(); }).then(function (data) {
            if (!data || data.error) throw new Error((data && data.error) || 'Could not load the rotation.');
            fromServer(data);
        }).catch(function (err) {
            host.innerHTML = '<p class="siege-class-status tone-error">✗ ' + esc(err.message) + '</p>';
        });
    }

    function save() {
        if (busy) return;
        busy = true;
        status('Saving…');
        fetch('/api/events/daily-battles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': read(TOKEN_KEY), 'X-Card-Editor-Gate': read(GATE_KEY) },
            body: JSON.stringify({ battles: rows })
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok || data.error) throw new Error(data && data.error ? data.error : 'Save failed (' + response.status + ')');
                refresh();
                setTimeout(function () { status('✓ Saved — live on the Events page', 'success'); }, 300);
            });
        }).catch(function (error) { status('✗ ' + error.message, 'error'); })
          .then(function () { busy = false; });
    }

    host.addEventListener('input', function (e) {
        var field = e.target.getAttribute && e.target.getAttribute('data-field');
        var row = e.target.closest && e.target.closest('[data-row]');
        if (!field || !row) return;
        var r = rows[Number(row.getAttribute('data-row'))];
        r[field] = e.target.value;
        // A new deck has different cards: the featured pick resets to "strongest".
        if (field === 'deckId') { r.featuredCardId = ''; render(); }
    });
    host.addEventListener('click', function (e) {
        var row = e.target.closest && e.target.closest('[data-row]');
        var i = row ? Number(row.getAttribute('data-row')) : -1;
        var move = e.target.closest && e.target.closest('[data-move]');
        if (move && i >= 0) {
            var j = i + Number(move.getAttribute('data-move'));
            var t = rows[i]; rows[i] = rows[j]; rows[j] = t;
            render();
            return;
        }
        if (e.target.closest && e.target.closest('[data-remove]') && i >= 0) { rows.splice(i, 1); render(); return; }
        if (e.target.closest && e.target.closest('[data-add]')) {
            var last = rows[rows.length - 1] || {};
            rows.push({ id: 'daily-' + Date.now().toString(36), opponentName: '', title: '', trainerId: last.trainerId,
                deckId: last.deckId, featuredCardId: '', blurb: '' });
            render();
            return;
        }
        if (e.target.closest && e.target.closest('[data-revert]')) { fromServer(loaded); return; }
        if (e.target.closest && e.target.closest('[data-save]')) save();
    });

    window.SiegelingsEventsAdmin = { refresh: refresh };
    render();
})();
