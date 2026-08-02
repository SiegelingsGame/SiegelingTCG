"""Verifies the Siege enemy shade treatment.

Renders the battle screen with the SAME bright art on an ally and an enemy, then
proves the enemy cutout is the Keep's violet-black shade: the SVG filter is the
one actually applied, and the rendered pixels are far darker and hue-shifted
toward violet while the ally's art is untouched.
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
OUT = os.path.join(ROOT, "output", "web-game", "siege-shade-enemies")
CHROME = os.path.expandvars(
    r"%LOCALAPPDATA%\ms-playwright\chromium-1217\chrome-win64\chrome.exe")
PORT = 8942


def bright_creature_png():
    """A saturated blob with alpha — stands in for uploaded card art, which lives
    in Firebase Storage and is not in the static bundle."""
    size = 160
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    cx = cy = size / 2
    for y in range(size):
        for x in range(size):
            dx, dy = (x - cx) / (size * 0.42), (y - cy) / (size * 0.46)
            if dx * dx + dy * dy <= 1.0:
                # A bright orange->cyan ramp: strongly saturated, clearly light.
                t = y / size
                px[x, y] = (int(255 - 90 * t), int(150 + 60 * t), int(40 + 180 * t), 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


MOCK = """
(artUrl) => {
  document.querySelectorAll('.siege-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('battleScreen').classList.remove('hidden');
  document.body.dataset.screen = 'battleScreen';

  document.getElementById('knightPlate').className = 'knight-plate el-FIRE';
  document.getElementById('knightPlate').innerHTML =
    '<div class="kp-head"><span class="kp-name">Pyla</span><span class="kp-hp">40/40</span></div>' +
    '<div class="kp-hpbar"><div class="kp-hpfill" style="width:100%"></div></div>';
  document.getElementById('speedTrack').innerHTML =
    '<div class="track-round">R3</div><div class="track-lanes"></div>';

  const sprite = (side, el, name, art) =>
    '<div class="sprite ' + side + ' ' + el + '">' +
      '<div class="sp-plate"><div class="sp-name">' + name + '</div>' +
        '<div class="sp-hpbar"><div class="sp-hpfill" style="width:60%"></div></div></div>' +
      '<div class="sp-art"><img src="' + art + '" alt=""></div>' +
      '<div class="sp-shadow"></div></div>';

  document.getElementById('enemyRow').innerHTML =
    sprite('enemy', 'el-WATER', '<span class="sp-shade">Shade</span>Shellpack', artUrl);
  document.getElementById('allyRow').innerHTML =
    sprite('ally', 'el-WATER', 'Shellpack', artUrl);
  document.getElementById('battleHint').textContent = 'Drag a card onto the battlefield.';
  document.getElementById('handRow').innerHTML = '';
  document.getElementById('battleLog').innerHTML = '<div class="lg">Battle joined.</div>';
  document.getElementById('deckCounts').textContent = '';
  document.getElementById('apDisplay').innerHTML = '';
}
"""

PROBE = """
() => {
  const enemy = document.querySelector('.sprite.enemy .sp-art img');
  const ally = document.querySelector('.sprite.ally .sp-art img');
  const box = n => { const b = n.getBoundingClientRect();
                     return {x: b.x, y: b.y, w: b.width, h: b.height}; };
  const plate = document.querySelector('.sprite.enemy .sp-name');
  return {
    nameText: plate.textContent.trim(),
    // .sp-name ellipsises on overflow, so scrollWidth > clientWidth means the
    // creature's name is being cut off on the plate.
    nameFits: plate.scrollWidth <= plate.clientWidth + 1,
    defsPresent: Boolean(document.getElementById('paper-siegling-shadow')),
    defsRect: box(document.querySelector('.siege-svg-defs')),
    enemyFilter: getComputedStyle(enemy).filter,
    allyFilter: getComputedStyle(ally).filter,
    enemyTransform: getComputedStyle(enemy).transform,
    enemyBox: box(enemy), allyBox: box(ally),
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    vw: window.innerWidth, vh: window.innerHeight,
  };
}
"""


def sample(png_path, box, scale):
    """Mean colour of the opaque middle of a sprite's art box."""
    im = Image.open(png_path).convert("RGB")
    x, y, w, h = (int(v * scale) for v in (box["x"], box["y"], box["w"], box["h"]))
    crop = im.crop((x + w // 4, y + h // 4, x + w - w // 4, y + h - h // 4))
    px = list(crop.getdata())
    n = len(px)
    return tuple(sum(c[i] for c in px) / n for i in range(3))


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=STATIC)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    os.makedirs(OUT, exist_ok=True)
    art = bright_creature_png()
    httpd = serve()
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        for name, w, h in [("desktop-1920x1080", 1920, 1080), ("phone-landscape-844x390", 844, 390)]:
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            errors = []
            # adventure.js is parsed and run by the page load, so a syntax error in it
            # shows up here rather than needing a separate `node --check`.
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script("window.fetch = () => new Promise(() => {});")
            page.goto(f"http://127.0.0.1:{PORT}/adventure.html?v=check", wait_until="load")
            page.evaluate(MOCK, art)
            page.wait_for_timeout(300)
            m = page.evaluate(PROBE)
            shot = os.path.join(OUT, name + ".png")
            page.screenshot(path=shot)
            page.close()

            enemy_rgb = sample(shot, m["enemyBox"], 1)
            ally_rgb = sample(shot, m["allyBox"], 1)

            def check(cond, msg):
                if not cond:
                    failures.append(f"[{name}] {msg}")

            print(f"\n== {name} ({w}x{h})")
            print(f"   defs present: {m['defsPresent']}  defs rect: {m['defsRect']}")
            print(f"   enemy filter: {m['enemyFilter']}")
            print(f"   ally  filter: {m['allyFilter']}")
            print(f"   enemy mean rgb: {tuple(round(c) for c in enemy_rgb)}")
            print(f"   ally  mean rgb: {tuple(round(c) for c in ally_rgb)}")

            check(m["defsPresent"], "the #paper-siegling-shadow filter is missing from the page")
            check(m["defsRect"]["w"] == 0 and m["defsRect"]["h"] == 0,
                  f"the defs carrier takes layout space: {m['defsRect']}")
            check("paper-siegling-shadow" in m["enemyFilter"],
                  f"enemy art is not using the shade filter: {m['enemyFilter']}")
            check(m["allyFilter"] == "none",
                  f"ally art should be untouched, got {m['allyFilter']}")
            check("matrix(-1" in m["enemyTransform"],
                  f"enemy art should still be mirrored, got {m['enemyTransform']}")

            e_lum = 0.2126 * enemy_rgb[0] + 0.7152 * enemy_rgb[1] + 0.0722 * enemy_rgb[2]
            a_lum = 0.2126 * ally_rgb[0] + 0.7152 * ally_rgb[1] + 0.0722 * ally_rgb[2]
            check(e_lum < a_lum * 0.45,
                  f"enemy art is not appreciably darker ({e_lum:.0f} vs ally {a_lum:.0f})")
            # Violet: blue leads red leads green, and the source art had blue lowest.
            check(enemy_rgb[2] > enemy_rgb[1] and enemy_rgb[0] > enemy_rgb[1],
                  f"enemy art is not hue-shifted to violet: {tuple(round(c) for c in enemy_rgb)}")
            check(ally_rgb[1] > ally_rgb[2] or ally_rgb[0] > 120,
                  f"ally art lost its own colour: {tuple(round(c) for c in ally_rgb)}")
            check(m["scrollW"] <= m["vw"] + 1 and m["scrollH"] <= m["vh"] + 1,
                  "the page scrolls (the defs SVG may be taking space)")
            check(not errors, f"page errors: {errors}")
            check(m["nameFits"], "the enemy plate name is still truncated")
            print(f"   enemy plate name: {m['nameText']!r} fits={m['nameFits']}")
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
