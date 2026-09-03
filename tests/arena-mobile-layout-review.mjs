import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/AlexTillman/AppData/Local/CodexTools/playwright-runtime/node_modules/playwright');

const baseUrl = process.env.ARENA_REVIEW_BASE_URL || 'http://127.0.0.1:8931';
const outputDir = new URL('../output/web-game/arena-mobile-layout/', import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

const lobbyMarkup = `
<div class="home-shell">
    <nav class="home-nav">
        <a class="brand" href="#"><span class="brand-mark"></span><span><strong>Siegelings TCG</strong><small>Card Binder Home</small></span></a>
        <button class="hud-notif-btn" type="button" aria-label="Notifications">!</button>
        <div class="nav-tabs">
            <a href="#">Home</a><a href="#">Play</a><a href="#">Keep</a><a href="#">Cards</a>
            <a href="#">Decks</a><a class="active" href="#">Social</a><a href="#">Profile</a><a href="#">Shop</a>
        </div>
        <div class="nav-actions">
            <span class="gold-pill">809 Siegecoins</span>
            <button class="ghost-btn" type="button">Filters</button>
            <button class="primary-btn" type="button">Play</button>
            <button class="ghost-btn" type="button">Friends</button>
            <button class="ghost-btn" type="button">Join With Code</button>
            <button class="ghost-btn" type="button">Log Out</button>
        </div>
        <button class="hud-minimize-btn" type="button" aria-label="Minimize HUD">⌄</button>
    </nav>
    <main class="home-main">
        <section class="browser-panel panel lobby-section" id="lobbySection">
            <div class="lobby-waiting-root" id="lobbyWaitingRoot">
                <div class="lobby-waiting-head">
                    <div>
                        <span class="eyebrow">1v1 Waiting Room</span>
                        <h1>My Arena</h1>
                        <span class="social-muted-inline">Room 9DXNQ3 · Waiting for opponent to join</span>
                    </div>
                    <span class="lobby-status-pill">1 / 2 players</span>
                </div>
                <div class="lobby-waiting-grid">
                    <section class="lobby-panel">
                        <div class="social-panel-head"><div><span class="eyebrow">Players</span><h2>Lobby roster</h2></div></div>
                        <div class="lobby-players">
                            <article class="lobby-player-card"><strong>Roc</strong><span>Choosing loadout</span></article>
                            <article class="lobby-player-card empty"><strong>Waiting for player...</strong><span>Invite a friend or share your link</span></article>
                        </div>
                        <form class="lobby-loadout-form">
                            <label>Deck<select class="search-input"><option>Blazing Core With A Long Deck Name</option></select></label>
                            <label>Knight<select class="search-input"><option>Pyla The Flame Commander</option></select></label>
                        </form>
                        <div class="lobby-actions-row">
                            <button class="primary-btn" type="button">Start Match</button>
                            <button class="ghost-btn" type="button">Back to Lobbies</button>
                            <button class="ghost-btn" type="button">Close Lobby</button>
                        </div>
                    </section>
                    <section class="lobby-panel">
                        <div class="social-panel-head"><div><span class="eyebrow">Lobby Chat</span><h2>Say hello</h2></div></div>
                        <div class="lobby-chat-log"><div class="lobby-chat-line system">Say hello while you wait.</div></div>
                        <form class="lobby-chat-compose">
                            <input class="search-input" type="text" placeholder="Message the lobby">
                            <button class="primary-btn" type="submit">Send</button>
                        </form>
                        <p class="social-muted-inline" id="lobbyInviteLink">Invite link: <a href="#">https://siegelingstcgtesting.web.app/social/lobby/9DXNQ3</a></p>
                    </section>
                </div>
            </div>
        </section>
    </main>
</div>`;

const viewports = [
    { width: 390, height: 844, name: 'portrait-390x844' },
    { width: 320, height: 568, name: 'portrait-320x568' },
    { width: 1920, height: 1080, name: 'desktop-1920x1080' }
];

const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
        });

        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${baseUrl}/css/home.css?v=119"></head><body>${lobbyMarkup}</body></html>`, { waitUntil: 'networkidle' });
        await page.evaluate(() => {
            window.render_game_to_text = () => JSON.stringify({
                screen: 'lobbyWaitingRoom',
                room: '9DXNQ3',
                players: ['Roc', 'Open slot'],
                controls: ['Start Match', 'Back to Lobbies', 'Close Lobby', 'Send']
            });
        });

        const initial = await page.evaluate(() => {
            const targets = [
                '.lobby-section', '.lobby-waiting-head', '.lobby-status-pill',
                ...Array.from(document.querySelectorAll('.lobby-player-card, .lobby-loadout-form .search-input, .lobby-actions-row button, .lobby-chat-compose > *, #lobbyInviteLink')).map(element => element)
            ];
            const resolved = targets.map(target => typeof target === 'string' ? document.querySelector(target) : target).filter(Boolean);
            return {
                viewportWidth: innerWidth,
                documentScrollWidth: document.documentElement.scrollWidth,
                mainClientWidth: document.querySelector('.home-main').clientWidth,
                mainScrollWidth: document.querySelector('.home-main').scrollWidth,
                outside: resolved.map(element => {
                    const rect = element.getBoundingClientRect();
                    return { selector: element.id || element.className, left: rect.left, right: rect.right };
                }).filter(rect => rect.left < -0.5 || rect.right > innerWidth + 0.5),
                textState: window.render_game_to_text()
            };
        });

        assert.equal(initial.documentScrollWidth, viewport.width, `${viewport.name}: document widened`);
        assert.equal(initial.mainScrollWidth, initial.mainClientWidth, `${viewport.name}: arena widened its scroll area`);
        assert.deepEqual(initial.outside, [], `${viewport.name}: controls were clipped horizontally`);
        assert.match(initial.textState, /lobbyWaitingRoom/, `${viewport.name}: text state did not match the room`);
        assert.deepEqual(errors, [], `${viewport.name}: browser errors`);

        await page.screenshot({ path: fileURLToPath(new URL(`${viewport.name}-top.png`, outputDir)) });

        if (viewport.width <= 900) {
            const bottom = await page.evaluate(() => {
                const main = document.querySelector('.home-main');
                main.scrollTop = main.scrollHeight;
                const invite = document.getElementById('lobbyInviteLink').getBoundingClientRect();
                const hud = document.querySelector('.home-nav').getBoundingClientRect();
                return { inviteTop: invite.top, inviteBottom: invite.bottom, hudTop: hud.top, maxScroll: main.scrollTop };
            });
            assert.ok(bottom.maxScroll > 0, `${viewport.name}: arena did not provide vertical scrolling`);
            assert.ok(bottom.inviteTop >= 0, `${viewport.name}: final arena content scrolled above the viewport`);
            assert.ok(bottom.inviteBottom <= bottom.hudTop - 6, `${viewport.name}: final arena content remained hidden behind the HUD`);
            await page.screenshot({ path: fileURLToPath(new URL(`${viewport.name}-bottom.png`, outputDir)) });
        }

        await page.close();
    }
} finally {
    await browser.close();
}

console.log('Arena portrait layout review passed.');
