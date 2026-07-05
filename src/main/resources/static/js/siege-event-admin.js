/* Siege map event creation panel for the card dashboard. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeEventPanel');
    if (!host) return;

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function choiceRow(index, outcomes, preset) {
        preset = preset || {};
        var opts = (outcomes || []).map(function (o) {
            var sel = preset.outcome === o.code ? ' selected' : '';
            return '<option value="' + escapeHtml(o.code) + '"' + sel + '>' + escapeHtml(o.code) + '</option>';
        }).join('');
        return '<div class="siege-event-choice-row" data-choice="' + index + '">' +
            '<input class="ev-choice-label" placeholder="Choice label" maxlength="60" value="' + escapeHtml(preset.label || '') + '">' +
            '<select class="ev-choice-outcome" title="Outcome type — click ⓘ for details">' + opts + '</select>' +
            '<input class="ev-choice-value" type="number" min="0" max="999" value="' + (preset.value != null ? preset.value : 0) + '" title="Outcome value">' +
            '<input class="ev-choice-flavor" placeholder="Result text (flavor)" maxlength="120" value="' + escapeHtml(preset.flavor || '') + '">' +
            '</div>';
    }

    function render(data) {
        var outcomes = data.outcomes || [];
        var events = data.events || [];
        var rows = events.map(function (ev) {
            var choiceSummary = (ev.choices || []).map(function (c) {
                return escapeHtml(c.label) + ' → <code>' + escapeHtml(c.outcome) + '</code>' +
                    (c.value ? ' (' + c.value + ')' : '');
            }).join('<br>');
            return '<tr><td>' + (ev.icon || '') + '</td><td>' + escapeHtml(ev.title) +
                '<div class="card-meta">' + escapeHtml(ev.prompt || '') + '</div></td>' +
                '<td>' + choiceSummary + '</td></tr>';
        }).join('');

        host.innerHTML =
            '<p class="siege-class-note">Create map events for Siege mode. Events appear on random Event nodes during a run. ' +
            'Click <strong>ⓘ</strong> on the section header for outcome reference. Requires an editor login.</p>' +
            '<div class="siege-event-form">' +
            '<input id="evTitle" placeholder="Event title" maxlength="48" style="min-width:180px">' +
            '<input id="evIcon" placeholder="Icon (emoji)" maxlength="4" style="width:80px">' +
            '<input id="evPrompt" placeholder="Prompt text shown to the player" maxlength="200" style="flex:1;min-width:220px">' +
            '</div>' +
            '<div class="siege-event-choices-head"><span>Label</span><span>Outcome <button type="button" class="dash-info-btn dash-info-btn-tiny" data-info-topic="siege-events" title="Outcome reference" aria-label="Outcome reference">ⓘ</button></span><span>Value</span><span>Flavor</span></div>' +
            '<div class="siege-event-choices" id="evChoices">' +
            choiceRow(0, outcomes) + choiceRow(1, outcomes) + choiceRow(2, outcomes) +
            '</div>' +
            '<div class="siege-event-form">' +
            '<button id="evCreate" type="button">Create Event</button>' +
            '<span id="evStatus" class="siege-class-status"></span></div>' +
            '<table class="siege-class-table"><thead><tr><th></th><th>Event</th><th>Choices</th></tr></thead>' +
            '<tbody>' + (rows || '<tr><td colspan="3">No events yet.</td></tr>') + '</tbody></table>';

        document.getElementById('evCreate').addEventListener('click', create);
    }

    function readChoices() {
        var rows = host.querySelectorAll('.siege-event-choice-row');
        var choices = [];
        Array.prototype.forEach.call(rows, function (row) {
            var label = (row.querySelector('.ev-choice-label')?.value || '').trim();
            if (!label) return;
            choices.push({
                label: label,
                outcome: row.querySelector('.ev-choice-outcome')?.value || 'NOTHING',
                value: parseInt(row.querySelector('.ev-choice-value')?.value, 10) || 0,
                flavor: (row.querySelector('.ev-choice-flavor')?.value || '').trim()
            });
        });
        return choices;
    }

    function create() {
        var status = document.getElementById('evStatus');
        var choices = readChoices();
        if (choices.length < 2) {
            status.textContent = '✗ Add at least 2 choices.';
            return;
        }
        status.textContent = '…';
        fetch('/api/siege/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({
                title: document.getElementById('evTitle').value,
                icon: document.getElementById('evIcon').value,
                prompt: document.getElementById('evPrompt').value,
                choices: choices
            })
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data && data.error ? data.error : 'Create failed (' + r.status + ')');
                render(data);
                var s = document.getElementById('evStatus');
                if (s) { s.textContent = '✓ created'; setTimeout(function () { s.textContent = ''; }, 1600); }
            });
        }).catch(function (e) { status.textContent = '✗ ' + e.message; });
    }

    fetch('/api/siege/events').then(function (r) { return r.json(); }).then(render)
        .catch(function () { host.innerHTML = '<p class="siege-class-note">Could not load Siege events.</p>'; });
})();
