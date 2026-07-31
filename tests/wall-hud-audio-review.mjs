import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || '', '.codex');
const { chromium } = require(path.join(codexHome, 'skills/develop-web-game/node_modules/playwright'));
const outputDir = path.resolve('output/web-game/wall-hud-audio');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
});
const results = [];

async function run(name, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: viewport.width < 800,
    isMobile: viewport.width < 800
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem('sieglingsKeepMusicOn', '1'));
  // A looping audio request can keep the network busy indefinitely; the Keep's own
  // loading sentinel is the deterministic readiness signal for this interaction test.
  await page.goto('http://127.0.0.1:8961/keep.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('keepLoading')?.classList.contains('hidden'));

  const initial = await page.evaluate(() => ({
    track: JSON.parse(window.render_game_to_text()).music,
    src: document.getElementById('keepTheme')?.getAttribute('src')
  }));
  assert.equal(initial.track.track, 'keep', `${name}: Keep text state should begin on the Keep theme`);
  assert.match(initial.src, /sieglings-theme\.mp3/, `${name}: Keep audio source should begin on the Keep theme`);

  // The compact Keep map intentionally layers its journey caption over part of this
  // destination; dispatch the button's click so this review starts at the requested Wall state.
  await page.locator('.front-hotspot').dispatchEvent('click');
  await page.waitForFunction(() => {
    const audio = document.getElementById('keepTheme');
    return document.getElementById('keepApp')?.classList.contains('front-view-active')
      && audio?.getAttribute('src')?.includes('sieglings-battle-theme.mp3');
  });
  await page.waitForTimeout(750);

  const front = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const visible = selector => {
      const node = document.querySelector(selector);
      const style = node ? getComputedStyle(node) : null;
      return Boolean(node && style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().width > 0);
    };
    const audio = document.getElementById('keepTheme');
    return {
      overflowX: document.documentElement.scrollWidth - innerWidth,
      header: rect('.keep-header'),
      resources: rect('.keep-resource-bar'),
      actions: rect('.keep-header-actions'),
      toolbar: rect('.front-view-toolbar'),
      resourcesVisible: visible('.keep-resource-bar'),
      actionsVisible: visible('.keep-header-actions'),
      controls: [...document.querySelectorAll('.keep-header-actions button')].map(button => ({
        label: button.getAttribute('aria-label'),
        rect: button.getBoundingClientRect().toJSON()
      })),
      audio: {
        src: audio?.getAttribute('src'),
        currentSrc: audio?.currentSrc,
        duration: audio?.duration,
        paused: audio?.paused,
        readyState: audio?.readyState,
        error: audio?.error ? { code: audio.error.code, message: audio.error.message } : null
      },
      text: JSON.parse(window.render_game_to_text())
    };
  });

  assert.equal(front.overflowX, 0, `${name}: Wall HUD must not create horizontal overflow`);
  assert.equal(front.resourcesVisible, true, `${name}: Keep resource HUD is hidden at the Wall`);
  assert.equal(front.actionsVisible, true, `${name}: Keep header controls are hidden at the Wall`);
  assert.match(front.audio.src, /sieglings-battle-theme\.mp3/, `${name}: Wall did not select the battle theme`);
  assert.ok(Number.isFinite(front.audio.duration) && front.audio.duration > 10, `${name}: supplied battle MP3 did not decode`);
  assert.equal(front.audio.paused, false, `${name}: battle theme did not begin after entering the Wall`);
  assert.equal(front.text.music.track, 'battle', `${name}: text state does not report the battle track`);
  assert.equal(front.text.music.enabled, true, `${name}: persisted music preference was lost`);
  for (const control of front.controls) {
    assert.ok(control.rect.left >= 0 && control.rect.right <= viewport.width + 0.5,
      `${name}: header control ${control.label} is outside the viewport`);
  }
  if (viewport.width < 800) {
    assert.ok(front.toolbar.top >= front.resources.bottom - 0.5,
      `${name}: Front toolbar overlaps the Keep resources (${front.toolbar.top} < ${front.resources.bottom})`);
  }
  await page.screenshot({ path: path.join(outputDir, `${name}-wall-hud.png`), fullPage: false });

  await page.locator('#musicToggle').click();
  await page.waitForFunction(() => document.getElementById('keepTheme')?.paused);
  const muted = await page.evaluate(() => JSON.parse(window.render_game_to_text()).music);
  assert.equal(muted.enabled, false, `${name}: shared music toggle did not mute the battle track`);

  await page.locator('#musicToggle').click();
  await page.waitForFunction(() => !document.getElementById('keepTheme')?.paused);
  await page.locator('#frontReturn').click();
  await page.waitForFunction(() => document.getElementById('keepTheme')?.getAttribute('src')?.includes('sieglings-theme.mp3'));
  const returned = await page.evaluate(() => ({
    front: document.getElementById('keepApp')?.classList.contains('front-view-active'),
    audio: document.getElementById('keepTheme')?.getAttribute('src'),
    music: JSON.parse(window.render_game_to_text()).music
  }));
  assert.equal(returned.front, false, `${name}: Return to Keep left Front mode active`);
  assert.match(returned.audio, /sieglings-theme\.mp3/, `${name}: Return to Keep did not restore its theme`);
  assert.equal(returned.music.track, 'keep', `${name}: text state did not return to the Keep track`);
  assert.deepEqual(errors, [], `${name}: browser errors: ${errors.join(' | ')}`);

  results.push({ name, viewport, front, muted, returned });
  await context.close();
}

await run('portrait', { width: 390, height: 844 });
await run('narrow-portrait', { width: 320, height: 568 });
await run('desktop', { width: 1440, height: 900 });
await browser.close();
fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ name, front }) => ({
  name,
  resourceBottom: front.resources.bottom,
  toolbarTop: front.toolbar.top,
  battleDuration: front.audio.duration,
  battlePlaying: !front.audio.paused
})), null, 2));
