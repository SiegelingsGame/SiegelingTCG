/* A focused tour above the Knight popup; the arena coach stays underneath. */
(() => {
    const steps = [
        ['trainerAbilityCardPreview', 'Card view', 'Your SiegeKnight’s card shows its artwork and abilities.'],
        ['trainerAbilityRank', 'Rank', 'This shows your Knight’s rank. Squire Bob is a SiegeSquire.'],
        ['trainerAbilityElement', 'Element', 'This is your Knight’s element. Each ability explains which allies or targets it affects.'],
        ['trainerAbilityRarity', 'Rarity', 'This shows the card’s rarity, such as Common, Uncommon or Rare.'],
        ['trainerAbilityDescription', 'Passive ability', 'Your passive ability works automatically whenever its conditions are met.'],
        ['trainerAbilityCopy', 'Active ability', 'Tap Use to activate this ability. The message below shows when it is available and whether you need to choose a target.']
    ];
    let layer, frame, index = 0;
    function stop() {
        cancelAnimationFrame(frame);
        frame = null;
        layer?.remove();
        layer = null;
    }
    function show(next) {
        if (next >= steps.length) { stop(); return; }
        index = Math.max(0, next);
        const [, title, copy] = steps[index];
        layer.querySelector('h4').textContent = title;
        layer.querySelector('p').textContent = copy;
        layer.querySelector('.knight-tour-count').textContent = `${index + 1} / ${steps.length}`;
        layer.querySelector('[data-back]').disabled = index === 0;
        layer.querySelector('[data-next]').textContent = index === steps.length - 1 ? 'Done' : 'Next';
        document.getElementById(steps[index][0])?.scrollIntoView({block: 'nearest'});
    }
    function position() {
        const target = document.getElementById(steps[index][0]);
        if (!layer || document.getElementById('trainerAbilityOverlay')?.classList.contains('hidden')) { stop(); return; }
        if (target) {
            const r = target.getBoundingClientRect();
            const tip = layer.querySelector('.knight-tour-tip');
            const ring = layer.querySelector('.knight-tour-ring');
            const h = tip.offsetHeight;
            const w = tip.offsetWidth;
            const vw = document.documentElement.clientWidth;
            const vh = window.innerHeight;
            const above = r.top >= h + 36;
            const left = Math.max(10, Math.min(vw - w - 10, r.left + r.width / 2 - w / 2));
            const top = Math.max(10, Math.min(vh - h - 10, above ? r.top - h - 28 : r.bottom + 28));
            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
            Object.assign(ring.style, {left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`});
            const x = Math.max(left + 16, Math.min(left + w - 16, r.left + r.width / 2));
            layer.querySelector('.knight-tour-arrow').setAttribute('d', `M ${x} ${above ? top + h : top} L ${r.left + r.width / 2} ${above ? r.top - 5 : r.bottom + 5}`);
        }
        frame = requestAnimationFrame(position);
    }
    function start() {
        stop();
        layer = document.createElement('div');
        layer.className = 'knight-tour';
        layer.innerHTML = `<svg aria-hidden="true"><defs><marker id="knightTourArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#80ffc1"/></marker></defs><path class="knight-tour-arrow" marker-end="url(#knightTourArrow)"/></svg><div class="knight-tour-ring"></div><section class="knight-tour-tip" role="region" aria-label="SiegeKnight tutorial"><button class="knight-tour-dismiss" aria-label="Dismiss Knight tutorial">×</button><div aria-live="polite"><small class="knight-tour-count"></small><h4></h4><p></p></div><nav aria-label="Tutorial steps"><button data-back>Back</button><button data-next>Next</button></nav></section>`;
        document.body.append(layer);
        layer.querySelector('.knight-tour-dismiss').onclick = stop;
        layer.querySelector('[data-back]').onclick = () => show(index - 1);
        layer.querySelector('[data-next]').onclick = () => show(index + 1);
        show(0);
        position();
    }
    window.KnightTutorial = {start, stop};
})();
