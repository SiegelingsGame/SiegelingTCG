/*
 * Binder filter-chrome default-state guard.
 *
 * The Collection screen used to mount with its three rows of filter pills
 * expanded, which cost ~198px - most of the first screen of card art - before
 * a player had asked to narrow anything. They start collapsed behind the tools
 * row's toggle now.
 *
 * Collapsing them introduces one trap worth pinning: a player can open the
 * rows, set a filter, then collapse them again, leaving a narrowed grid with
 * nothing on screen saying so. The toggle therefore carries the same active-
 * filter count the scrolled-state FAB does, and that is asserted here too.
 *
 *   node tests/binder-filters-collapsed-check.cjs
 * Serve the statics first, e.g.
 *   (cd src/main/resources/static && python3 -m http.server 8777)
 */
const {chromium} = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.argv[2] || 'http://localhost:8777';
(async () => {
  const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  let fail = 0;
  const ck = (ok,l,d) => { if(!ok) fail++; console.log((ok?'  PASS  ':'  FAIL  ')+l+(d?' -> '+d:'')); };
  for (const vp of [{n:'phone 390x844',width:390,height:844,dsf:3,mob:true},
                    {n:'desktop 1920x1080',width:1920,height:1080,dsf:1,mob:false}]) {
    const p = await b.newPage({viewport:{width:vp.width,height:vp.height}, deviceScaleFactor:vp.dsf, isMobile:vp.mob, hasTouch:vp.mob});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto(BASE + '/home-next.html?screen=collection', {waitUntil:'networkidle'}).catch(()=>{});
    await p.waitForSelector('[data-filters]', {state:'attached', timeout:20000});
    await p.evaluate(()=>{ setInterval(function(){var r=document.querySelector('.ig-root'); if(r) r.remove();}, 100); });
    await p.waitForTimeout(700);
    const m = () => p.evaluate(() => {
      const f=document.querySelector('[data-filters]'), t=document.querySelector('[data-filter-toggle]');
      const g=document.querySelector('[data-grid]'), bd=document.querySelector('[data-filter-toggle-badge]');
      return {open:f.classList.contains('open'), h:Math.round(f.getBoundingClientRect().height),
              toggleOn:t.classList.contains('on'), hasFilters:t.classList.contains('has-filters'),
              badge: bd && !bd.hidden ? bd.textContent : null,
              gridTop:Math.round(g.getBoundingClientRect().top), cards:g.children.length};
    });
    console.log('\n'+vp.n);
    const load = await m();
    ck(load.open===false && load.h===0, 'filters collapsed on load', JSON.stringify(load));
    ck(load.toggleOn===false, 'toggle not lit on load');
    ck(load.cards>0, 'cards painted anyway', load.cards+' cards');
    await p.click('[data-filter-toggle]'); await p.waitForTimeout(600);
    const open = await m();
    ck(open.open===true && open.h>100, 'toggle opens the rows', JSON.stringify(open));
    ck(open.gridTop-load.gridTop>150, 'collapsed state gives the grid the space back', (open.gridTop-load.gridTop)+'px');
    // set a filter, then collapse: the toggle must still say the grid is narrowed
    await p.click('[data-el="FIRE"]'); await p.waitForTimeout(400);
    const filtered = await m();
    ck(filtered.cards < load.cards || filtered.badge==='1', 'filter applied', JSON.stringify({cards:filtered.cards, badge:filtered.badge}));
    await p.click('[data-filter-toggle]'); await p.waitForTimeout(600);
    const collapsed = await m();
    ck(collapsed.open===false, 'toggle closes the rows again');
    ck(collapsed.hasFilters===true && collapsed.badge==='1',
       'collapsed toggle still reports the active filter', JSON.stringify({has:collapsed.hasFilters, badge:collapsed.badge}));
    ck(errs.length===0, 'no page errors', errs.join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fail ? '\n'+fail+' FAILURE(S)' : '\nAll checks passed.');
  process.exit(fail?1:0);
})();
