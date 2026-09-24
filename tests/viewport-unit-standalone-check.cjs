/*
 * viewport-unit.js must not treat every installed app as an iOS home-screen
 * launch. display-mode: standalone is also a desktop or Android window, and
 * screen.height there includes the taskbar / title bar / status bar. Raising
 * --sg-vh to that height (when the shortfall is <= 200px) makes the shell
 * taller than the window, and the scroll pin keeps the clipped bottom HUD
 * from being scrolled back into view.
 *
 * The screen-height correction stays on for navigator.standalone, which is
 * the iOS home-screen case the correction was added for.
 *
 *   node tests/viewport-unit-standalone-check.cjs [baseUrl]
 * Serve the statics first, e.g.
 *   (cd src/main/resources/static && python3 -m http.server 8931)
 */
const fs = require('fs');
const { chromium } = loadPlaywright();

const BASE = process.argv[2] || 'http://127.0.0.1:8931';

function loadPlaywright() {
  const candidates = [
    '/opt/node22/lib/node_modules/playwright',
    '/opt/node22/lib/node_modules/playwright-core',
    'playwright',
    'playwright-core'
  ];
  for (let i = 0; i < candidates.length; i++) {
    try { return require(candidates[i]); } catch (e) { /* try the next */ }
  }
  throw new Error('playwright is not installed');
}

function chromePath() {
  const candidates = ['/opt/pw-browsers/chromium', '/usr/local/bin/google-chrome', '/usr/bin/google-chrome'];
  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return undefined;
}

function installStub(page, opts) {
  return page.addInitScript((o) => {
    try {
      Object.defineProperty(navigator, 'standalone', {
        configurable: true,
        get: function () { return o.ios; }
      });
    } catch (e) { /* some browsers expose standalone as a constant */ }
    const orig = window.matchMedia.bind(window);
    window.matchMedia = function (q) {
      const s = String(q);
      if (s.indexOf('display-mode') !== -1 && s.indexOf('standalone') !== -1) {
        return {
          matches: o.displayStandalone,
          media: s,
          addListener: function () {},
          removeListener: function () {},
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () { return false; },
          onchange: null
        };
      }
      return orig(q);
    };
    const screen = { width: o.screenW, height: o.screenH, availWidth: o.screenW, availHeight: o.screenH };
    try {
      Object.defineProperty(window, 'screen', { configurable: true, get: function () { return screen; } });
    } catch (e2) { /* leave the real screen */ }
  }, opts);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function readShell(page) {
  return page.evaluate(() => {
    const sg = getComputedStyle(document.documentElement).getPropertyValue('--sg-vh').trim();
    const nav = document.querySelector('.sg-nav');
    const bar = document.querySelector('.action-bar');
    const overlay = document.querySelector('.loadout-overlay');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return {
      sg: sg,
      innerHeight: window.innerHeight,
      nav: box(nav),
      bar: box(bar),
      overlayHeight: overlay ? getComputedStyle(overlay).height : null
    };
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  async function open(viewport, opts, url) {
    const page = await browser.newPage({ viewport: viewport });
    await installStub(page, opts);
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    return page;
  }

  // Desktop installed app, maximized: full width, 72px short of the monitor.
  const desktop = await open(
    { width: 1920, height: 1008 },
    { ios: false, displayStandalone: true, screenW: 1920, screenH: 1080 },
    '/home-next.html'
  );
  await desktop.waitForSelector('.sg-nav button[data-nav="collection"]');
  await desktop.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('gone');
  });
  const desktopShell = await readShell(desktop);
  assert(desktopShell.sg === '1008px', 'desktop PWA --sg-vh should stay the window height, got ' + desktopShell.sg);
  assert(desktopShell.nav && desktopShell.nav.bottom <= desktopShell.innerHeight + 1,
    'desktop hub nav extends past the window: bottom ' + (desktopShell.nav && desktopShell.nav.bottom));
  const collection = await desktop.locator('.sg-nav button[data-nav="collection"]').boundingBox();
  const hit = await desktop.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y);
    const btn = el && el.closest ? el.closest('[data-nav]') : null;
    return btn ? btn.getAttribute('data-nav') : null;
  }, { x: collection.x + collection.width / 2, y: collection.y + collection.height / 2 });
  assert(hit === 'collection', 'collection tab is not what a click would hit, got ' + hit);
  await desktop.mouse.click(collection.x + collection.width / 2, collection.y + collection.height / 2);
  await desktop.waitForFunction(() => {
    const btn = document.querySelector('.sg-nav button[data-nav="collection"]');
    return btn && btn.classList.contains('on') && location.pathname === '/cards';
  });
  await desktop.screenshot({ path: '/tmp/viewport-desktop-pwa-nav.png' });
  await desktop.close();

  // Android-style installed app: status bar makes the window shorter than the screen.
  const phone = await open(
    { width: 390, height: 800 },
    { ios: false, displayStandalone: true, screenW: 390, screenH: 844 },
    '/home-next.html'
  );
  await phone.waitForSelector('.sg-nav');
  await phone.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('gone');
  });
  const phoneShell = await readShell(phone);
  assert(phoneShell.sg === '800px', 'android PWA --sg-vh should stay the window height, got ' + phoneShell.sg);
  assert(phoneShell.nav && phoneShell.nav.top >= 0 && phoneShell.nav.bottom <= phoneShell.innerHeight + 1,
    'phone hub nav is outside the window: ' + JSON.stringify(phoneShell.nav));
  await phone.screenshot({ path: '/tmp/viewport-android-pwa-nav.png' });
  await phone.close();

  // Battle table in the same desktop installed window.
  const play = await open(
    { width: 1920, height: 1008 },
    { ios: false, displayStandalone: true, screenW: 1920, screenH: 1080 },
    '/play.html'
  );
  await play.waitForSelector('.action-bar');
  const playShell = await readShell(play);
  assert(playShell.sg === '1008px', 'battle --sg-vh should stay the window height, got ' + playShell.sg);
  assert(playShell.bar && playShell.bar.bottom <= playShell.innerHeight + 1,
    'battle action bar extends past the window: bottom ' + (playShell.bar && playShell.bar.bottom));
  assert(playShell.overlayHeight === '1008px',
    'loadout overlay should match the window, got ' + playShell.overlayHeight);
  await play.close();

  // iOS home screen still fills a viewport that launched short of the glass.
  const ios = await open(
    { width: 390, height: 790 },
    { ios: true, displayStandalone: true, screenW: 390, screenH: 844 },
    '/home-next.html'
  );
  await ios.waitForSelector('.sg-nav');
  const iosShell = await readShell(ios);
  assert(iosShell.sg === '844px', 'iOS home screen should still raise --sg-vh to the glass, got ' + iosShell.sg);
  await ios.close();

  // A keyboard-sized gap must not be treated as the launch bug, even on iOS.
  const keyboard = await open(
    { width: 390, height: 500 },
    { ios: true, displayStandalone: true, screenW: 390, screenH: 844 },
    '/home-next.html'
  );
  await keyboard.waitForTimeout(100);
  const keyboardShell = await readShell(keyboard);
  assert(keyboardShell.sg === '500px', 'a 344px shortfall must not raise --sg-vh, got ' + keyboardShell.sg);
  await keyboard.close();

  // An ordinary browser tab never takes the screen height.
  const tab = await open(
    { width: 390, height: 790 },
    { ios: false, displayStandalone: false, screenW: 390, screenH: 844 },
    '/home-next.html'
  );
  await tab.waitForTimeout(100);
  const tabShell = await readShell(tab);
  assert(tabShell.sg === '790px', 'browser tab --sg-vh should stay the window height, got ' + tabShell.sg);
  await tab.close();

  await browser.close();
  console.log('viewport-unit standalone check passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
