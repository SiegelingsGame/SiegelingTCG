const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path');
const out=path.resolve(__dirname,'../output/profile-layout');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch();
for(const [width,height] of [[1313,900],[1920,1080],[1024,768],[844,390],[667,375],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.SHIELD_BASE_URL || 'http://127.0.0.1:8937')+'/home-redesign-preview.html?screen=profile');
 for(const guest of [true,false]){
  await page.evaluate(guest=>{window.hub=SiegelingsHomeConcept.mountApp(document.body,{screen:'profile',guest,live:guest?null:{displayName:'Alex the Siegelord',profileSettings:{displayName:'Alex the Siegelord',playerTitle:'Champion of the Elemental Realms',bio:'Building a legendary collection and meeting friends in the arena. '.repeat(3)},matchHistory:[],siegeHistory:[]}});},guest);
  await page.waitForTimeout(400);
  const backdrop = await page.locator('.sg-profile-backdrop').boundingBox();
  assert.equal(backdrop.width, width); assert.equal(backdrop.height, height);
  assert.equal(await page.locator('.sg-crest-bg').isVisible(), false);
  assert.equal(await page.locator('.sg-profile-backdrop img').getAttribute('src'), await page.locator('.sg-crest-bg').getAttribute('src'));

  // Every orientation is one screen now: portrait as well as landscape.
  const layout=await page.locator('.sg-scroll').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth}));
  assert(layout.scroll<=layout.height+1,JSON.stringify(layout));assert(layout.scrollWidth<=layout.width+1);
  // The crest's details ride in the header strip on landscape/desktop, so
  // the crest block itself is hidden; every block still shown must fit.
  for(const el of await page.locator('[data-prof-block]').all()){const r=await el.boundingBox();if(!r)continue;assert(r.y>=0&&r.y+r.height<=height,JSON.stringify(r));}
  if(width>=1024||width>height){
   const head=await page.locator('.sg-prof-head').boundingBox();assert(head&&head.y>=0&&head.y+head.height<=60,'header strip '+JSON.stringify(head));
  }
  // Recent matches swaps the profile for its history in the same space, not a popup.
  await page.locator('[data-profile-history]').click();await page.waitForTimeout(500);
  assert(await page.locator('.sg-prof-layout.is-history [data-prof-block="history"]').isVisible());
  const hist=await page.locator('[data-prof-block="history"]').boundingBox();assert(hist.y>=0&&hist.y+hist.height<=height,'history '+JSON.stringify(hist));
  await page.keyboard.press('Escape');await page.waitForTimeout(350);
  assert.equal(await page.locator('.sg-prof-layout.is-history').count(),0);
  // Screens swap a frame after the tap (page-transitions.js), so wait for it.
  const view=(attr,v)=>page.waitForFunction(([a,v])=>{const app=document.querySelector('.sg-app');return app&&app.getAttribute(a)===v;},[attr,v],{timeout:5000});
  await page.locator('.sg-profile-nav [data-social-goto="friends"]').click();await view('data-social-view','friends');
  await page.locator('.sg-profile-nav [data-social-goto="messages"]').click();await view('data-social-view','messages');
  // From Friends/Messages, Recent matches opens the profile on its history.
  await page.locator('[data-profile-history]').click();await page.waitForSelector('.sg-prof-layout.is-history',{timeout:5000});
  await page.locator('.sg-profile-nav [data-screen="lobbies"]').click();await view('data-screen','lobbies');
  for(const dest of ['home','social','help','profile']){
   await page.locator('.sn-fab').click();await page.waitForFunction(()=>document.querySelector('.sn-root').dataset.state==='open');
   await page.locator(`[data-destination="${dest}"]`).click();await page.waitForFunction(dest=>document.querySelector('.sg-app').dataset.screen===dest,dest);
   // The page isn't hit-tested while a page transition plays; let it finish.
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-vt-fx'),null,{timeout:5000});
  }
  if(!guest){await page.locator('[data-prof-open="look"]:visible').first().click();assert(await page.locator('[data-prof-sheet]').evaluate(e=>e.classList.contains('open')));await page.locator('[data-prof-close]').first().click();}
  await page.waitForTimeout(500);await page.screenshot({path:path.join(out,`${width}-${guest?'guest':'member'}.png`)});
 }
 assert.deepEqual(errors,[]);console.log(`${width}x${height}: guest/member layout, social links, history, customization and shield routes passed`);await page.close();
}await browser.close()})().catch(e=>{console.error(e);process.exit(1)});

