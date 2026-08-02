"""Layout check for the siege battle screen across viewports.

Serves static/ and injects a mock battle DOM (adventure.js needs the backend,
so fetch is stubbed to never resolve and the boot stays on the loading screen).
Asserts the landscape full-bleed arena now applies to tablet/desktop, that the
floating chrome stays inside the viewport, and that portrait is untouched.
"""
import http.server
import functools
import os
import socketserver
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = r"A:\New folder\OneDrive\Desktop\Sieglings\siege-fullscreen-desktop"
STATIC = os.path.join(ROOT, "src", "main", "resources", "static")
OUT = os.path.join(ROOT, "output", "web-game", "siege-desktop-landscape")
CHROME = os.path.expandvars(
    r"%LOCALAPPDATA%\ms-playwright\chromium-1217\chrome-win64\chrome.exe")
PORT = 8941

MOCK = r"""
() => {
  document.querySelectorAll('.siege-screen').forEach(s => s.classList.add('hidden'));
  const bs = document.getElementById('battleScreen');
  bs.classList.remove('hidden');
  document.body.dataset.screen = 'battleScreen';

  document.getElementById('knightPlate').className = 'knight-plate el-FIRE';
  document.getElementById('knightPlate').innerHTML =
    '<div class="kp-head"><span class="kp-name">\u{1F6E1}\uFE0F Pyla</span><span class="kp-hp">40/40</span></div>' +
    '<div class="kp-hpbar"><div class="kp-hpfill" style="width:100%"></div></div>' +
    '<div class="kp-chargebar"><div class="kp-chargefill" style="width:55%"></div>' +
    '<span class="kp-chargetext">\u26A1 11/20</span></div>' +
    '<div class="knight-bag-row">' +
    '<button type="button" class="knight-bag-btn">\u{1F4DC} Revive Card</button>' +
    '<button type="button" class="knight-bag-btn">\u{1F489} Healing Potion</button></div>';

  document.getElementById('speedTrack').innerHTML =
    '<div class="track-round">R3</div><div class="track-lanes">' +
    '<div class="track-lane you"><span class="lane-label">YOU <b>6</b></span>' +
    '<div class="lane-bar"><div class="lane-fill" style="width:75%"></div>' +
    '<span class="lane-runner el-WATER" style="left:calc(75% - 9px)">\u{1F4A7}</span></div></div>' +
    '<div class="track-lane them leads"><span class="lane-label">FOE <b>8</b></span>' +
    '<div class="lane-bar"><div class="lane-fill" style="width:100%"></div>' +
    '<span class="lane-runner el-WIND" style="left:calc(100% - 9px)">\u{1F32A}</span>' +
    '<span class="lane-flag">\u{1F3C1}</span></div></div></div>' +
    '<div class="track-first them">Enemy first</div>';

  const sprite = (side, el, name, hp, max, extra) =>
    '<div class="sprite ' + side + ' ' + el + '">' +
      '<div class="sp-plate"><div class="sp-name">' + name +
        ' <span class="sp-el">\u2726</span></div>' +
        '<div class="sp-hpbar"><div class="sp-hpfill" style="width:' +
        Math.round(100 * hp / max) + '%"></div></div>' +
        '<div class="sp-tags"><span class="sp-hp">' + hp + '/' + max + '</span></div>' +
        (extra || '') +
      '</div>' +
      '<div class="sp-art sp-art-fallback"><span>\u25C6</span></div>' +
      '<div class="sp-shadow"></div></div>';

  document.getElementById('enemyRow').innerHTML =
    sprite('enemy', 'el-WIND', 'Gale Shrike', 18, 30,
           '<div class="sp-intent-line">\u26944 \u2192 Shellpack</div>');
  document.getElementById('allyRow').innerHTML =
    sprite('ally', 'el-WATER', '<span class="sp-lvl">Lv1</span>Shellpack', 66, 74,
           '<div class="sp-gauge"><div class="sp-gaugefill" style="width:40%"></div>' +
           '<span class="sp-gaugetext">\u{1F31F} 2/5</span></div>');

  document.getElementById('battleLog').innerHTML =
    '<div class="lg">Shellpack uses Bubble Blast on Gale Shrike.</div>' +
    '<div class="lg">Gale Shrike hits Shellpack for 4.</div>' +
    '<div class="lg-more">\u2630 ledger</div>';
  document.getElementById('battleHint').textContent =
    'Drag a card onto the battlefield to play it (5 AP left), or End Turn.';

  const card = (cost, name, owner, eff, desc, el) =>
    '<div class="playcard ' + el + '"><div class="pc-cost">' + cost + '</div>' +
    '<div class="pc-name">' + name + '</div>' +
    '<div class="pc-owner">' + owner + '</div>' +
    '<div class="pc-eff dmg">' + eff + '</div>' +
    '<div class="pc-desc">' + desc + '</div></div>';
  document.getElementById('handRow').innerHTML =
    card(0, 'Bubble Blast', '\u{1F4A7} Shellpack', '\u2716 3 dmg', 'Deal 1 damage to 1 enemy', 'el-WATER') +
    card(2, 'Evolve: Torqlander', 'Shellpack', 'Evolve!', 'Shellpack evolves into Torqlander for the rest of the battle.', 'el-METAL') +
    card(0, 'Bubble Blast', '\u{1F4A7} Shellpack', '\u2716 3 dmg', 'Deal 1 damage to 1 enemy', 'el-WATER') +
    card(2, 'Pyla: Kindlers Touch', '\u{1F525} Pyla', '\u271A Heal 3 (all)', 'Heal a select row of Allies +1', 'el-FIRE');

  const ap = document.getElementById('apDisplay');
  ap.innerHTML = '<span class="ap-label">AP</span>' +
    '<span class="ap-pip full"></span><span class="ap-pip full"></span>' +
    '<span class="ap-pip full"></span><span class="ap-pip full"></span>' +
    '<span class="ap-pip full"></span>';
  document.getElementById('deckCounts').textContent = '\u{1F0CF}0 \u00B7 \u270B4 \u00B7 \u{1F5D1}0';
  const ult = document.getElementById('knightUltBtn');
  ult.classList.remove('hidden');
  ult.textContent = '\u26A1 11/20';
  document.getElementById('endTurnBtn').textContent = 'End Turn';
}
"""

PROBE = r"""
() => {
  const r = id => {
    const n = document.getElementById(id) || document.querySelector(id);
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return {x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom};
  };
  const stage = document.getElementById('battleStage');
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    stagePos: getComputedStyle(stage).position,
    playcardW: getComputedStyle(document.querySelector('.playcard')).width,
    descShown: getComputedStyle(document.querySelector('.pc-desc')).display,
    spriteW: getComputedStyle(document.querySelector('.sprite')).width,
    appMaxW: getComputedStyle(document.querySelector('.siege-app')).maxWidth,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    stage: r('battleStage'), plate: r('knightPlate'), log: r('battleLog'),
    hand: r('handRow'), endTurn: r('endTurnBtn'), hud: r('battleHud'),
    hint: r('battleHint'), topbar: r('.siege-topbar'), track: r('speedTrack'),
  };
}
"""

VIEWPORTS = [
    ("desktop-1920x1080", 1920, 1080, True),
    ("laptop-1366x768", 1366, 768, True),
    ("ipad-landscape-1180x820", 1180, 820, True),
    ("ipad-landscape-1024x768", 1024, 768, True),
    ("phone-landscape-844x390", 844, 390, True),
    ("phone-portrait-390x844", 390, 844, False),
    ("ipad-portrait-820x1180", 820, 1180, False),
]


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=STATIC)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    os.makedirs(OUT, exist_ok=True)
    httpd = serve()
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        for name, w, h, landscape in VIEWPORTS:
            page = browser.new_page(viewport={"width": w, "height": h},
                                    device_scale_factor=1)
            # Boot fetches the run from /api/siege; stub it so the page never
            # redirects to /play and simply idles on the loading screen.
            page.add_init_script("window.fetch = () => new Promise(() => {});")
            page.goto(f"http://127.0.0.1:{PORT}/adventure.html?v=check",
                      wait_until="load")
            page.evaluate(MOCK)
            page.wait_for_timeout(250)
            m = page.evaluate(PROBE)
            page.screenshot(path=os.path.join(OUT, name + ".png"))
            page.close()

            def check(cond, msg):
                if not cond:
                    failures.append(f"[{name}] {msg}")

            print(f"\n== {name} ({w}x{h})")
            print(f"   stage pos={m['stagePos']} rect={m['stage']}")
            print(f"   playcard={m['playcardW']} sprite={m['spriteW']} "
                  f"desc={m['descShown']} appMaxW={m['appMaxW']}")
            if landscape:
                check(m["stagePos"] == "absolute", "arena is not the full-bleed overlay")
                check(m["stage"]["w"] >= m["vw"] - 40,
                      f"arena width {m['stage']['w']} << viewport {m['vw']}")
                check(m["stage"]["h"] >= m["vh"] - 40,
                      f"arena height {m['stage']['h']} << viewport {m['vh']}")
                for key in ("plate", "log", "hand", "endTurn", "hud", "track"):
                    b = m[key]
                    check(b["right"] <= m["vw"] + 1 and b["bottom"] <= m["vh"] + 1
                          and b["x"] >= -1 and b["y"] >= -1,
                          f"{key} outside viewport: {b}")
                check(m["plate"]["right"] <= m["log"]["x"],
                      "knight plate overlaps the ledger pill")
                check(m["track"]["right"] <= m["log"]["x"] + 1,
                      "speed track overlaps the ledger pill")
                check(m["hand"]["y"] >= m["plate"]["bottom"],
                      "hand fan overlaps the knight plate")
                check(m["endTurn"]["y"] >= m["hint"]["bottom"],
                      "End Turn overlaps the hint banner")
                check(m["scrollW"] <= m["vw"] + 1, "page scrolls horizontally")
                check(m["scrollH"] <= m["vh"] + 1, "page scrolls vertically")
            else:
                check(m["stagePos"] != "absolute",
                      "portrait was switched to the full-bleed overlay")
                check(m["appMaxW"] == "1120px", "portrait lost its column cap")
        browser.close()
    httpd.shutdown()

    print("\n---")
    if failures:
        print("FAILURES:")
        for f in failures:
            print(" ", f)
        sys.exit(1)
    print("all checks passed")


main()
