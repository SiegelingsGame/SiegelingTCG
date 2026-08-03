(function () {
    'use strict';

    var sections = Array.prototype.slice.call(document.querySelectorAll('.help-section'));
    var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc-nav a'));
    var chipLinks = Array.prototype.slice.call(document.querySelectorAll('.help-chip-nav a'));
    var searchInput = document.getElementById('helpSearch');

    function setActive(id) {
        tocLinks.forEach(function (link) {
            link.classList.toggle('is-active', link.getAttribute('href') === '#' + id);
        });
    }

    function onScroll() {
        var marker = window.scrollY + 100;
        var current = sections[0] && sections[0].id;
        sections.forEach(function (section) {
            if (section.classList.contains('is-hidden')) return;
            if (section.offsetTop <= marker) current = section.id;
        });
        if (current) setActive(current);
    }

    function filterSections(query) {
        var q = String(query || '').trim().toLowerCase();
        sections.forEach(function (section) {
            if (!q) {
                section.classList.remove('is-hidden');
                return;
            }
            var keywords = (section.getAttribute('data-help-keywords') || '').toLowerCase();
            var text = (section.textContent || '').toLowerCase();
            var match = keywords.indexOf(q) !== -1 || text.indexOf(q) !== -1;
            section.classList.toggle('is-hidden', !match);
        });
        onScroll();
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            filterSections(searchInput.value);
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Respect hash on load after layout.
    if (location.hash) {
        var target = document.querySelector(location.hash);
        if (target) {
            requestAnimationFrame(function () {
                target.scrollIntoView({ block: 'start' });
            });
        }
    }

    // Chip nav already uses hash links; keep focus tidy on mobile.
    chipLinks.concat(tocLinks).forEach(function (link) {
        link.addEventListener('click', function () {
            var id = (link.getAttribute('href') || '').replace('#', '');
            if (id) setActive(id);
        });
    });
}());
