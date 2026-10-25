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

  if(width>=1024||width>height){
   const layout=await page.locator('.sg-scroll').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth}));
   assert(layout.scroll<=layout.height+1,JSON.stringify(layout));assert(layout.scrollWidth<=layout.width+1);
   // The crest's details ride in the header strip on landscape/desktop, so
   // the crest block itself is hidden; every block still shown must fit.
   for(const el of await page.locator('[data-prof-block]:not([data-prof-block="recent"])').all()){const r=await el.boundingBox();if(!r)continue;assert(r.y>=0&&r.y+r.height<=height,JSON.stringify(r));}
   const head=await page.locator('.sg-prof-head').boundingBox();assert(head&&head.y>=0&&head.y+head.height<=60,'header strip '+JSON.stringify(head));
  }
  await page.locator('[data-profile-history]').click();assert(await page.locator('dialog.sg-profile-history').isVisible());await page.keyboard.press('Escape');
  await page.locator('.sg-profile-nav [data-social-goto="friends"]').click();assert.equal(await page.locator('.sg-app').getAttribute('data-social-view'),'friends');
  await page.locator('.sg-profile-nav [data-social-goto="messages"]').click();assert.equal(await page.locator('.sg-app').getAttribute('data-social-view'),'messages');
  await page.locator('.sg-profile-nav [data-screen="lobbies"]').click();assert.equal(await page.locator('.sg-app').getAttribute('data-screen'),'lobbies');
  for(const dest of ['home','social','help','profile']){
   await page.locator('.sn-fab').click();await page.waitForFunction(()=>document.querySelector('.sn-root').dataset.state==='open');
   await page.locator(`[data-destination="${dest}"]`).click();await page.waitForFunction(dest=>document.querySelector('.sg-app').dataset.screen===dest,dest);
  }
  if(!guest){await page.locator('[data-prof-open="look"]:visible').first().click();assert(await page.locator('[data-prof-sheet]').evaluate(e=>e.classList.contains('open')));await page.locator('[data-prof-close]').first().click();}
  await page.waitForTimeout(500);await page.screenshot({path:path.join(out,`${width}-${guest?'guest':'member'}.png`)});
 }
 assert.deepEqual(errors,[]);console.log(`${width}x${height}: guest/member layout, social links, history, customization and shield routes passed`);await page.close();
}await browser.close()})().catch(e=>{console.error(e);process.exit(1)});

