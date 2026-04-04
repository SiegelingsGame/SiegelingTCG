const { chromium } = require("C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright");
(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const failures = [];
  page.on('response', async (response) => {
    if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() });
  });
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'networkidle' });
  console.log(JSON.stringify(failures, null, 2));
  await browser.close();
})();