import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "../../..");
const rootDir = path.join(repoDir, "src/main/resources/static");
const outDir = scriptDir;
fs.mkdirSync(outDir, { recursive: true });

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/game/options") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      defaultDeckId: "deck_test",
      defaultTrainerId: "trainer_test",
      decks: [{ id: "deck_test", name: "Test Deck", elements: ["FIRE"], description: "Scroll check deck." }],
      trainers: [{ id: "trainer_test", name: "Test Knight", element: "FIRE", rarity: "COMMON", passiveDescription: "Scroll check knight." }],
      cardCatalog: [],
      deckBuilder: { maxCopies: 3, minCards: 5, maxCards: 30 },
    }));
    return;
  }
  if (url.pathname === "/api/cards/editor") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: { cards: [] } }));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({}));
    return;
  }

  const routeFiles = new Map([
    ["/", "landing.html"],
    ["/play", "index.html"],
    ["/home", "home.html"],
    ["/cards", "home.html"],
    ["/decks", "home.html"],
    ["/lobbies", "home.html"],
    ["/profile", "home.html"],
    ["/shop", "home.html"],
  ]);

  const routeFile = routeFiles.get(url.pathname);
  if (routeFile) {
    sendFile(res, path.join(rootDir, routeFile));
    return;
  }

  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "").replace(/^(\.\.[\\/])+/, "");
  const filePath = path.join(rootDir, safePath);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  sendFile(res, filePath);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ headless: true });
const consoleErrors = [];
const pageErrors = [];

async function measure(page, label, scrollTargetSelector, bottomContentSelector) {
  await page.evaluate((selector) => {
    const target = document.querySelector(selector) || document.scrollingElement;
    if (target) target.scrollTop = target.scrollHeight;
  }, scrollTargetSelector);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: false });
  return page.evaluate(({ scrollTargetSelector, bottomContentSelector }) => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        display: getComputedStyle(el).display,
      };
    };
    const target = document.querySelector(scrollTargetSelector) || document.scrollingElement;
    const navRect = rect(".play-hub-nav") || rect(".home-nav");
    const bottomRect = rect(bottomContentSelector);
    const scrollRemaining = target
      ? Math.round(target.scrollHeight - target.scrollTop - target.clientHeight)
      : null;

    return {
      path: location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
      scrollTargetSelector,
      scrollRemaining,
      nav: navRect,
      bottomContent: bottomRect,
      clearsHud: Boolean(navRect && bottomRect && bottomRect.bottom <= navRect.top - 2),
      isScrollableToEnd: scrollRemaining !== null && scrollRemaining <= 2,
    };
  }, { scrollTargetSelector, bottomContentSelector });
}

async function openMobile(pathname, label) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`${label}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => pageErrors.push(`${label}: ${String(err)}`));
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  return page;
}

const results = [];

const playPage = await openMobile("/play", "play");
await playPage.evaluate(() => {
  const shell = document.querySelector(".welcome-shell");
  const overlay = document.querySelector(".welcome-overlay");
  if (shell) shell.scrollTop = shell.scrollHeight;
  if (overlay) overlay.scrollTop = overlay.scrollHeight;
});
results.push(await measure(playPage, "play-welcome-bottom", ".welcome-shell", ".welcome-footer"));
await playPage.close();

for (const route of ["/home", "/cards", "/decks", "/lobbies", "/profile", "/shop"]) {
  const label = route.slice(1);
  const page = await openMobile(route, label);
  results.push(await measure(page, `${label}-bottom`, ".home-main", ".hub-grid"));
  await page.close();
}

await browser.close();
server.close();

const failed = results.filter((result) => !result.clearsHud || !result.isScrollableToEnd);
const summary = { baseUrl, results, consoleErrors, pageErrors, failed };
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

if (failed.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  throw new Error("Scroll HUD clearance check failed");
}

console.log(JSON.stringify(summary, null, 2));
