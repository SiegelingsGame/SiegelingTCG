const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const output = path.resolve(__dirname, '../output/shield-summoning');
fs.mkdirSync(output, {recursive:true});
// Serve src/main/resources/static locally; override SHIELD_BASE_URL if needed.
(async () => {
 const browser = await chromium.launch({headless:true});
 for (const [width,height] of [[390,844],[1920,1080],[320,568],[844,390]]) {
  const page = await browser.newPage({viewport:{width,height}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.SHIELD_BASE_URL || 'http://127.0.0.1:8937') + '/home-redesign-preview.html?screen=play');
  await page.evaluate(()=>{ window.hub = SiegelingsHomeConcept.mountApp(document.body,{screen:'play',guest:true}); window.originalApp=document.querySelector('.sg-app'); });
  const fab=page.locator('.sn-fab');
  await fab.click(); await page.waitForTimeout(820);
  await page.waitForFunction(()=>document.querySelector('.sn-root').dataset.state === 'open');
  assert.equal(await page.evaluate(()=>window.originalApp===document.querySelector('.sg-app')),true);
  assert.equal(await page.locator('.sg-app').evaluate(e=>e.inert),true);
  const geometry=await page.locator('.sn-option').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,scroll:b.scrollWidth,client:b.clientWidth}}));
  geometry.forEach(r=>{assert(r.x>=0 && r.right<=width && r.y>=0 && r.bottom<=height,JSON.stringify(r));assert(r.h>=44,JSON.stringify(r));assert(r.scroll<=r.client+1,'text overflow '+JSON.stringify(r));});
  await page.screenshot({path:path.join(output,`open-${width}.png`)});
  await page.keyboard.press('Escape'); await page.waitForTimeout(380);
  await page.waitForFunction(()=>document.querySelector('.sn-overlay').hidden);
  assert.equal(await page.locator('.sg-app').evaluate(e=>e.inert),false);
  // Reversal at activation, manifestation, and menu reveal must settle once.
  for (const delay of [35,210,520]) {
   await fab.click(); await page.waitForTimeout(delay); await fab.click(); await page.waitForTimeout(45); await fab.click(); await page.waitForTimeout(820);
   await page.waitForFunction(()=>document.querySelector('.sn-root').dataset.state === 'open');
   await page.locator('[data-destination="play"]').click(); await page.waitForTimeout(380);
   assert.equal(await page.evaluate(()=>window.originalApp===document.querySelector('.sg-app')),true,'same destination remounted');
  }
  await fab.click(); await page.waitForTimeout(800);
  await page.locator('[data-destination="settings"]').click(); await page.waitForTimeout(400);
  await page.waitForFunction(()=>hub.currentScreen() === 'settings');
  assert.equal(await page.locator('.sn-root').count(),1);
  await page.emulateMedia({reducedMotion:'reduce'});
  await fab.click(); await page.waitForTimeout(160);
  await page.waitForFunction(()=>document.querySelector('.sn-root').dataset.state === 'open');
  await fab.click(); await page.waitForTimeout(140);
  await page.waitForFunction(()=>document.querySelector('.sn-overlay').hidden);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,height,geometry,status:'passed'})); await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
