"""Verifies Siege battlefield sprites are sized by their authored size band.

adventure.js puts the server's band on `data-size` and adventure.css maps it to
`--sprite-scale` (SMALL 1 / MEDIUM 1.19 / LARGE 1.48 / GIGANTIC 1.93 — keep.css's
resident ratios renormalised so SMALL is 1.0). The band is resolved from the card
a unit is *drawn* from (Combatant#getDisplayCardId), which is what shades and
mercs lacked when a stage-3 boss and a rented Kilokong stood as short as a starter.

This renders every band on both sides at three viewports and checks what the CSS
has to hold: the scale reaches enemies as well as allies, the art grows with its
box, and a GIGANTIC sprite still fits inside .battle-stage rather than being
cropped by its `overflow:hidden`.
"""
import base64
import functools
import http.server
import io
import os
import socketserver
import sys
import threading
from PIL import Image
from playwright.sync_api import sync_playwright

# Derived from this file's location, not hardcoded: the repo is checked out as
# several git worktrees and a pinned path silently verifies the wrong one.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, "src", "main", "resources", "static")
OUT = os.path.join(ROOT, "output", "web-game", "siege-sprite-scale")
CHROME = os.path.expandvars(
    r"%LOCALAPPDATA%\ms-playwright\chromium-1217\chrome-win64\chrome.exe")
PORT = 8943

# Card art lives in Firebase Storage, not the static bundle. A tall figure is the
# honest stand-in here: sprite height is what is being measured, and a square blob
# would let a too-tall box pass by leaving transparent padding.
def creature_png():
    w, h = 120, 200
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            dx = (x - w / 2) / (w * 0.40)
            dy = (y - h / 2) / (h * 0.48)
            if dx * dx + dy * dy <= 1.0:
                t = y / h
                px[x, y] = (int(255 - 90 * t), int(150 + 60 * t), int(40 + 180 * t), 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# Mirrors adventure.js renderSpriteLine: the class list, the plate, and the one
# line under test — `data-size` set from the served band, for BOTH sides.
MOCK = """
([artUrl, foes, allies]) => {
  document.querySelectorAll('.siege-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('battleScreen').classList.remove('hidden');
  document.body.dataset.screen = 'battleScreen';
  document.body.dataset.battleNode = 'BOSS';

  document.getElementById('knightPlate').className = 'knight-plate el-FIRE';
  document.getElementById('knightPlate').innerHTML =
    '<div class="kp-head"><span class="kp-name">Pyla</span><span class="kp-hp">40/40</span></div>' +
    '<div class="kp-hpbar"><div class="kp-hpfill" style="width:100%"></div></div>';
  document.getElementById('speedTrack').innerHTML =
    '<div class="track-round">R3</div><div class="track-lanes"></div>';

  const line = (host, side, units) => {
    host.innerHTML = '';
    units.forEach(u => {
      const sp = document.createElement('div');
      sp.className = 'sprite ' + side + ' el-' + u.el;
      if (u.size) sp.dataset.size = u.size;
      sp.innerHTML =
        '<div class="sp-plate">' +
          '<div class="sp-name">' + u.name + ' <span class="sp-el">*</span></div>' +
          '<div class="sp-hpbar"><div class="sp-hpfill" style="width:60%"></div></div>' +
          '<div class="sp-tags"><span class="sp-hp">61/204</span></div>' +
          (side === 'enemy' ? '<div class="sp-intent-line">&#9876;18 &#8594; notch 1</div>' : '') +
        '</div>' +
        '<div class="sp-art"><img src="' + artUrl + '" alt=""></div>' +
        '<div class="sp-shadow"></div>';
      host.appendChild(sp);
    });
  };
  line(document.getElementById('enemyRow'), 'enemy', foes);
  line(document.getElementById('allyRow'), 'ally', allies);

  document.getElementById('battleHint').textContent = 'Drag a card onto the battlefield.';
  document.getElementById('handRow').innerHTML = '';
  document.getElementById('battleLog').innerHTML = '<div class="lg">Battle joined.</div>';
  document.getElementById('deckCounts').textContent = '';
  document.getElementById('apDisplay').innerHTML = '';
}
"""

PROBE = """
() => {
  const box = n => { const b = n.getBoundingClientRect();
                     return {x: b.x, y: b.y, w: b.width, h: b.height,
                             top: b.top, bottom: b.bottom, left: b.left, right: b.right}; };
  const read = sel => Array.from(document.querySelectorAll(sel)).map(sp => ({
    size: sp.dataset.size || 'SMALL',
    scale: getComputedStyle(sp).getPropertyValue('--sprite-scale').trim() || '1',
    sprite: box(sp),
    art: box(sp.querySelector('.sp-art')),
    img: box(sp.querySelector('.sp-art img')),
  }));
  return {
    stage: box(document.getElementById('battleStage')),
    foes: read('.sprite.enemy'),
    allies: read('.sprite.ally'),
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    vw: window.innerWidth, vh: window.innerHeight,
  };
}
"""

VIEWPORTS = [
    ("phone-portrait-390x844", 390, 844),
    ("phone-landscape-844x390", 844, 390),
    ("desktop-1920x1080", 1920, 1080),
]

# keep.css's bands renormalised to SMALL = 1.0; the CSS must agree with these or
# the Keep and the battlefield disagree about how big the same creature is.
EXPECTED = {"SMALL": 1.0, "MEDIUM": 1.19, "LARGE": 1.48, "GIGANTIC": 1.93}

# Both reported cases: a boss wearing LARGE stage-3 art (Squire Odo / Generoot) and
# a rented merc whose card is LARGE without being far along a line (Kilokong).
# Allies repeat the full ladder so both sides are proven to use the same rule.
FOES = [{"el": "EARTH", "name": "Squire Odo", "size": "LARGE"},
        {"el": "WATER", "name": "Shade of Shellpack", "size": "SMALL"}]
ALLIES = [{"el": "FIRE", "name": "Emberling", "size": "SMALL"},
          {"el": "WATER", "name": "Claw Queen", "size": "MEDIUM"},
          {"el": "ELECTRIC", "name": "Kilokong (Merc)", "size": "LARGE"},
          {"el": "SHADOW", "name": "Umbral Titan", "size": "GIGANTIC"}]


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=STATIC)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    os.makedirs(OUT, exist_ok=True)
    art = creature_png()
    httpd = serve()
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        for name, w, h in VIEWPORTS:
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            errors = []
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script("window.fetch = () => new Promise(() => {});")
            page.goto(f"http://127.0.0.1:{PORT}/adventure.html?v=check", wait_until="load")
            page.evaluate(MOCK, [art, FOES, ALLIES])
            page.wait_for_timeout(300)
            m = page.evaluate(PROBE)
            page.screenshot(path=os.path.join(OUT, name + ".png"))
            page.close()

            def check(cond, msg):
                if not cond:
                    failures.append(f"[{name}] {msg}")

            by_band = {s["size"]: s for s in m["foes"] + m["allies"]}
            boss = by_band["LARGE"]
            grunt = next(s for s in m["foes"] if s["size"] == "SMALL")
            biggest = by_band["GIGANTIC"]

            print(f"\n== {name} ({w}x{h})  stage rect "
                  f"{m['stage']['w']:.0f}x{m['stage']['h']:.0f}")
            for s in m["foes"] + m["allies"]:
                side = "foe " if s in m["foes"] else "ally"
                print(f"   {side} {s['size']:<9} scale={s['scale']:<6}"
                      f" art {s['art']['w']:.0f}x{s['art']['h']:.0f}"
                      f"  img h={s['img']['h']:.0f}  top={s['sprite']['top']:.0f}"
                      f" bottom={s['sprite']['bottom']:.0f}")

            for s in m["foes"] + m["allies"]:
                want = EXPECTED[s["size"]]
                check(abs(float(s["scale"]) - want) < 0.001,
                      f"{s['size']} should compute --sprite-scale {want}, got {s['scale']}")

            # The band has to reach the pixels, not just the custom property: a foe
            # marked LARGE must actually measure larger than a SMALL one.
            ratio = boss["art"]["h"] / max(1.0, grunt["art"]["h"])
            check(abs(ratio - EXPECTED["LARGE"]) < 0.06,
                  f"a LARGE foe should be {EXPECTED['LARGE']}x a SMALL foe, got {ratio:.2f}")
            ally_large = next(s for s in m["allies"] if s["size"] == "LARGE")
            check(abs(ally_large["art"]["h"] - boss["art"]["h"]) <= 1,
                  "both sides must scale alike: a LARGE ally and a LARGE foe differ "
                  f"({ally_large['art']['h']:.0f} vs {boss['art']['h']:.0f})")
            check(boss["img"]["h"] > grunt["img"]["h"] + 10,
                  "the art itself did not grow, only its box")

            # .battle-stage is overflow:hidden, so anything outside it is silently
            # cropped — a boss with its head cut off is not a fixed boss.
            for label, s in (("LARGE foe", boss), ("GIGANTIC ally", biggest)):
                check(s["sprite"]["top"] >= m["stage"]["top"] - 1,
                      f"{label} is clipped at the top of the arena "
                      f"({s['sprite']['top']:.0f} < {m['stage']['top']:.0f})")
                check(s["sprite"]["bottom"] <= m["stage"]["bottom"] + 1,
                      f"{label} overflows the bottom of the arena "
                      f"({s['sprite']['bottom']:.0f} > {m['stage']['bottom']:.0f})")
                check(s["sprite"]["left"] >= m["stage"]["left"] - 1
                      and s["sprite"]["right"] <= m["stage"]["right"] + 1,
                      f"{label} overflows the arena horizontally: {s['sprite']}")

            check(m["scrollW"] <= m["vw"] + 1 and m["scrollH"] <= m["vh"] + 1,
                  f"the page scrolls ({m['scrollW']}x{m['scrollH']} vs {m['vw']}x{m['vh']})")
            check(not errors, f"page errors: {errors}")
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
