const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../output/hub-workspaces'); fs.mkdirSync(output, {recursive:true});
const base = process.env.HUB_BASE_URL || 'http://127.0.0.1:8937';
async function fixture(page, screen) {
 await page.goto(base + '/home-redesign-preview.html?screen=profile');
 await page.evaluate(screen => {
  const cards = SiegelingsHomeConcept.cards.slice();
  window.testModel = { cards, sieglings:cards, ownedCards:Object.fromEntries(cards.map(c=>[c.id,3])), deckBuilder:{minDeckSize:6,maxCopies:3},
   knights:[{id:'pyla'},{id:'apollo'}],trainers:[{id:'pyla',name:'Pyla',active:true},{id:'apollo',name:'Ser Apollo',active:true}],
   decks:[{id:'fire',name:'Blazing Core',elements:['FIRE'],cards:cards.slice(0,4).map(c=>({id:c.id,count:3}))}],
   savedDecks:[{id:'saved',name:'My Starter',trainerId:'pyla',customDeckCards:cards.slice(0,4).flatMap(c=>[c.id,c.id,c.id])}],gold:600 };
  window.savedPayloads=[];
  window.SiegelingsHomeLive={post:async(url,payload)=>{savedPayloads.push({url,payload});return {savedDecks:[{id:payload.id || payload.clientDeckId,name:payload.name,trainerId:payload.trainerId,customDeckCards:payload.customDeckCards}]};}};
  window.hub=SiegelingsHomeConcept.mountApp(document.body,{screen,live:testModel,guest:false});
 },screen);
}
async function noOverflow(page, selector) {
 const r=await page.locator(selector).evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth}));
 assert(r.scroll<=r.height+1,`${selector} vertical overflow: ${JSON.stringify(r)}`);
 assert(r.scrollWidth<=r.width+1,`${selector} horizontal overflow: ${JSON.stringify(r)}`);
}
(async()=>{
 const browser=await chromium.launch();
 for(const [width,height] of [[1920,1080],[1313,900],[1024,768],[852,393],[667,375],[390,844],[320,568]]) {
  const page=await browser.newPage({viewport:{width,height}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page,'home');
  if(width>=1024 || width>height) { assert(await page.locator('.sg-stage').isVisible()); assert.equal(await page.locator('.sg-scroll').isVisible(),false); }
  await page.evaluate(()=>hub.show('play',false));
  if(width>=1024 || width>height) { await noOverflow(page,'.sg-scroll'); const rects=await page.locator('.sg-mode').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON())); assert(rects.every(r=>r.y===rects[0].y),'Modes must share one row'); }
  await page.evaluate(()=>hub.show('profile',false)); assert.equal(await page.locator('.sg-profile-nav .sg-gtab-art img').count(),5);
  await page.evaluate(()=>hub.show('auth',false));
  for(const mode of ['login','register']) {
   await page.locator(`[data-auth-mode="${mode}"]`).click();await noOverflow(page,'.sg-scroll');
   const form=await page.locator('.sg-auth').boundingBox();assert(form.y>=48 && form.y+form.height<=height-65,`Form bounds ${JSON.stringify(form)}`);
  }
  await page.screenshot({path:path.join(output,`final-auth-${width}.png`)});
  await page.evaluate(()=>hub.show('decks',false));const initialArt=await page.locator('.sg-deck-backdrop img').getAttribute('src');
  await page.locator('.sg-work-nav [data-deck-panel="saved"]').click(); assert.equal(await page.locator('[data-deck-section="saved"]').count(),1); assert.equal(await page.locator('[data-deck-section="owned"]').count(),0);
  const savedArt=await page.locator('.sg-deck-backdrop img').getAttribute('src');assert.notEqual(initialArt,savedArt);
  await page.locator('.sg-work-nav [data-deck-panel="presets"]').click();assert.equal(await page.locator('[data-deck-section="saved"]').count(),0);
  await page.locator('.sg-work-nav [data-deck-panel="my"]').click();await page.locator('[data-open-builder]').click();
  assert.equal(await page.locator('[data-build-knight]').count(),0);
  await noOverflow(page,'[data-builder]');
  await page.locator('[data-build-add]').first().click();await page.locator('[data-build-add]').first().click();await page.locator('[data-build-add]').first().click();assert(await page.locator('[data-build-add]').first().isDisabled());
  const afterAdd=JSON.parse(await page.evaluate(()=>render_game_to_text()));
  await page.locator('[data-build-page="1"]').click();assert((await page.locator('.sg-build-pager').innerText()).includes('Page 2'));
  await page.locator('[data-build-filter="element"]').selectOption('ICE');
  assert((await page.locator('.sg-build-pager').innerText()).includes('Page 1'));
  await page.locator('[data-build-filter="element"]').selectOption('ALL');
  await page.locator('[data-build-search]').fill('apple');await page.waitForTimeout(350);assert((await page.locator('.sg-build-pocket [data-card]').count())>=1);
  await page.locator('[data-build-search]').fill('');await page.waitForTimeout(350);
  await page.locator('[data-builder-view="review"]').click();assert((await page.locator('.sg-work-head p').innerText()).startsWith('3 cards'));assert.equal(await page.locator('[data-build-remove]').count(),1);
  await page.locator('[data-build-remove]').click();assert((await page.locator('.sg-work-head p').innerText()).startsWith('2 cards'));
  await page.locator('[data-builder-view="save"]').click();await page.locator('[data-build-name]').fill('My Test Deck');await page.locator('[data-build-confirm]').click();assert((await page.locator('[data-build-notice]').innerText()).includes('more cards'));assert.equal(await page.evaluate(()=>savedPayloads.length),0);
  await page.locator('[data-builder-view="auto"]').click();await page.locator('[data-build-auto]').click();assert((await page.locator('.sg-work-head p').innerText()).startsWith('6 cards'));assert.equal(await page.locator('[data-build-knight]').count(),0);
  await page.locator('[data-build-filter="sort"]').selectOption('element');await page.screenshot({path:path.join(output,`final-review-${width}.png`)});
  await page.locator('[data-builder-view="save"]').click();await page.locator('[data-build-knight]').selectOption('apollo');await page.locator('[data-build-confirm]').click();
  await page.waitForFunction(()=>savedPayloads.length===1);const sent=await page.evaluate(()=>savedPayloads[0]);assert.equal(sent.payload.trainerId,'apollo');assert.equal(sent.payload.customDeckCards.length,6);assert.equal(sent.url,'/api/profile/decks');
  assert(await page.locator('[data-build-notice]').isVisible());await noOverflow(page,'[data-builder]');
  assert.deepEqual(errors,[]);console.log(`${width}x${height}: layouts, artwork tabs, filters/paging, copy caps, review/remove, auto build and SiegeKnight save passed`);await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
