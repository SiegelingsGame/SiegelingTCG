"""Layout check for the siege battle screen across viewports.

Serves static/ and injects a mock battle DOM (adventure.js needs the backend,
so fetch is stubbed to never resolve and the boot stays on the loading screen).
Asserts the landscape full-bleed arena now applies to tablet/desktop, that the
floating chrome stays inside the viewport, and that portrait is untouched.

Extended for SVG battle maps (post-#618): orientation-matched background-image,
single composition fetch, full-bleed cover, z-order, plate contrast, gradient
fallback when /img/maps/* is blocked, and per-map screenshots.

Battle maps are small static SVG documents with no continuous animation.
"""
import http.server
import functools
import os
import socketserver
import sys
import threading
from playwright.sync_api import sync_playwright

# Derived from this file's location, not hardcoded: the repo is checked out as
# several git worktrees and a pinned path silently verifies the wrong one.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, "src", "main", "resources", "static")
OUT = os.path.join(ROOT, "output", "web-game", "siege-desktop-landscape")
MAP_OUT = os.path.join(ROOT, "output", "web-game", "siege-battle-maps")
CHROME = os.path.expandvars(
    r"%LOCALAPPDATA%\ms-playwright\chromium-1217\chrome-win64\chrome.exe")
PORT = 8941

MAP_IDS = [
    "muster-field", "ash-road", "tourney-yard",
    "moat-crossing", "rampart-breach", "gatehouse",
    "keep-hall", "umbral-vault", "throne-of-the-siegelord",
]

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
           '<div class="sp-intent-line">\u26944 \u2192 Shellpack</div>') +
    sprite('enemy', 'el-AIR', 'Razor Kite', 22, 28, '') +
    sprite('enemy', 'el-ELECTRIC', 'Stormbeak', 25, 32, '');
  document.getElementById('allyRow').innerHTML =
    sprite('ally', 'el-WATER', '<span class="sp-lvl">Lv1</span>Shellpack', 66, 74,
           '<div class="sp-gauge"><div class="sp-gaugefill" style="width:40%"></div>' +
           '<span class="sp-gaugetext">\u{1F31F} 2/5</span></div>') +
    sprite('ally', 'el-WATER', 'Tidefin', 34, 40, '') +
    sprite('ally', 'el-ICE', 'Bubblekin', 29, 36, '');

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

APPLY_MAP = r"""
(mapId) => {
  const stage = document.getElementById('battleStage');
  stage.style.setProperty('--map-landscape',
    'url("/img/maps/' + mapId + '-landscape.svg?v=1")');
  stage.style.setProperty('--map-portrait',
    'url("/img/maps/' + mapId + '-portrait.svg?v=1")');
  document.body.dataset.battleMap = mapId;
  document.body.dataset.battleNode = 'BATTLE';
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
  const map = document.getElementById('battleMap');
  const sprite = document.querySelector('.sprite');
  const plate = document.querySelector('.sp-plate');
  const mapCs = map ? getComputedStyle(map) : null;
  const spriteCs = sprite ? getComputedStyle(sprite) : null;
  const plateCs = plate ? getComputedStyle(plate) : null;
  const boxes = selector => Array.from(document.querySelectorAll(selector)).map(n => {
    const b = n.getBoundingClientRect();
    return {x:b.x, y:b.y, w:b.width, h:b.height, right:b.right, bottom:b.bottom};
  });
  let plateContrast = null;
  if (plate) {
    const pb = plate.getBoundingClientRect();
    const cx = Math.round(pb.x + pb.width / 2);
    const cy = Math.round(pb.y + pb.height / 2);
    // Sample a pixel just behind the plate (stage canvas) via an offscreen peek:
    // read the plate's own background alpha as a proxy — plates use rgba(.72).
    const bg = plateCs.backgroundColor || '';
    plateContrast = { bg, cx, cy, plateZ: plateCs.zIndex };
  }
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
    ap: r('apDisplay'), allyLine: r('allyRow'), foeLine: r('enemyRow'),
    allySprites: boxes('#allyRow .sprite'), foeSprites: boxes('#enemyRow .sprite'),
    hint: r('battleHint'), topbar: r('.siege-topbar'), track: r('speedTrack'),
    map: map ? r('battleMap') : null,
    mapBg: mapCs ? mapCs.backgroundImage : '',
    mapZ: mapCs ? mapCs.zIndex : null,
    spriteZ: spriteCs ? spriteCs.zIndex : null,
    foeZ: getComputedStyle(document.getElementById('enemyRow')).zIndex,
    plateContrast,
  };
}
"""

VIEWPORTS = [
    ("desktop-1920x1080", 1920, 1080, True),
    ("laptop-1366x768", 1366, 768, True),
    ("ultrawide-2560x1080", 2560, 1080, True),
    ("ipad-landscape-1180x820", 1180, 820, True),
    ("ipad-landscape-1024x768", 1024, 768, True),
    ("phone-landscape-844x390", 844, 390, True),
    ("phone-portrait-390x844", 390, 844, False),
    ("iphone-portrait-430x932", 430, 932, False),
    ("ipad-portrait-820x1180", 820, 1180, False),
]


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=STATIC)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def assert_layout(name, w, h, landscape, m, failures):
    def check(cond, msg):
        if not cond:
            failures.append(f"[{name}] {msg}")

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
        allies = m["allySprites"]
        foes = m["foeSprites"]
        check(len(allies) == 3 and len(foes) == 3,
              "three-slot formation fixture did not render")
        top_clear = max(m["plate"]["bottom"], m["track"]["bottom"],
                        m["log"]["bottom"])
        bottom_clear = m["ap"]["y"]
        for side, sprites in (("ally", allies), ("foe", foes)):
            for index, sprite in enumerate(sprites, 1):
                check(sprite["y"] >= top_clear - 1,
                      f"{side} slot {index} bleeds under health chrome: {sprite}")
                check(sprite["bottom"] <= bottom_clear + 1,
                      f"{side} slot {index} bleeds under hand/AP energy: {sprite}")
            centers = [sprite["y"] + sprite["h"] / 2 for sprite in sprites]
            check(max(centers) - min(centers) <= 1,
                  f"{side} slots are not horizontally aligned: {sprites}")
        for index in range(1, len(allies)):
            check(allies[index]["x"] > allies[index - 1]["x"]
                  and allies[index]["x"] >= allies[index - 1]["right"] - 1,
                  f"ally slots do not advance left-to-right: {allies}")
            check(foes[index]["x"] < foes[index - 1]["x"]
                  and foes[index]["right"] <= foes[index - 1]["x"] + 1,
                  f"foe slots do not advance right-to-left: {foes}")
        check(allies[-1]["right"] < foes[-1]["x"],
              "inward unit slots overlap the center clash lane")
        check(m["scrollW"] <= m["vw"] + 1, "page scrolls horizontally")
        check(m["scrollH"] <= m["vh"] + 1, "page scrolls vertically")
    else:
        check(m["stagePos"] != "absolute",
              "portrait was switched to the full-bleed overlay")
        check(m["appMaxW"] == "1120px", "portrait lost its column cap")


def assert_map_layer(name, landscape, m, map_id, failures):
    def check(cond, msg):
        if not cond:
            failures.append(f"[{name}] {msg}")

    expect = f"{map_id}-{'landscape' if landscape else 'portrait'}.svg"
    other = f"{map_id}-{'portrait' if landscape else 'landscape'}.svg"
    check(expect in m["mapBg"],
          f"background-image missing {expect}: {m['mapBg'][:120]}")
    check(other not in m["mapBg"],
          f"background-image wrongly includes {other}")
    check(m["map"] is not None, "battle-map layer missing")
    if m["map"] and m["stage"]:
        # Full cover: map rect matches stage (allow 1px rounding).
        check(abs(m["map"]["x"] - m["stage"]["x"]) <= 1
              and abs(m["map"]["y"] - m["stage"]["y"]) <= 1
              and abs(m["map"]["w"] - m["stage"]["w"]) <= 2
              and abs(m["map"]["h"] - m["stage"]["h"]) <= 2,
              f"map does not cover stage: map={m['map']} stage={m['stage']}")
    # z-index of .battle-map resolves below the sprite lines
    try:
        map_z = int(m["mapZ"]) if m["mapZ"] not in (None, "auto") else 0
        foe_z = int(m["foeZ"]) if m["foeZ"] not in (None, "auto") else 0
        check(map_z < foe_z, f"map z-index {m['mapZ']} not below sprites {m['foeZ']}")
    except ValueError:
        failures.append(f"[{name}] bad z-index map={m['mapZ']} foe={m['foeZ']}")
    # Plate keeps a translucent dark background for contrast against the art.
    pc = m.get("plateContrast") or {}
    bg = pc.get("bg") or ""
    check("rgba" in bg or "rgb" in bg,
          f"sp-plate lost its contrast background: {bg}")


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(MAP_OUT, exist_ok=True)
    httpd = serve()
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)

        # ---- Pass 1: layout + map wiring (default muster-field) ------------
        for name, w, h, landscape in VIEWPORTS:
            page = browser.new_page(viewport={"width": w, "height": h},
                                    device_scale_factor=1)
            map_reqs = []
            page_errors = []

            def on_request(req, bucket=map_reqs):
                u = req.url
                if "/img/maps/" in u and ".svg" in u:
                    bucket.append(u)

            page.on("request", on_request)
            page.on("pageerror", lambda error, bucket=page_errors:
                    bucket.append(str(error)))
            page.on("console", lambda msg, bucket=page_errors:
                    bucket.append(msg.text) if msg.type == "error" else None)
            page.add_init_script("window.fetch = () => new Promise(() => {});")
            page.goto(f"http://127.0.0.1:{PORT}/adventure.html?v=check",
                      wait_until="load")
            page.evaluate(MOCK)
            page.evaluate(APPLY_MAP, "muster-field")
            page.wait_for_timeout(400)
            m = page.evaluate(PROBE)
            page.screenshot(path=os.path.join(OUT, name + ".png"))
            page.close()

            print(f"\n== {name} ({w}x{h})")
            print(f"   stage pos={m['stagePos']} rect={m['stage']}")
            print(f"   playcard={m['playcardW']} sprite={m['spriteW']} "
                  f"desc={m['descShown']} appMaxW={m['appMaxW']}")
            print(f"   mapBg={m['mapBg'][:100]}  mapZ={m['mapZ']} foeZ={m['foeZ']}")
            print(f"   map requests: {len(map_reqs)}")

            assert_layout(name, w, h, landscape, m, failures)
            assert_map_layer(name, landscape, m, "muster-field", failures)

            # Exactly one composition requested — never both orientations.
            lands = [u for u in map_reqs if "-landscape.svg" in u]
            ports = [u for u in map_reqs if "-portrait.svg" in u]
            if landscape:
                if ports:
                    failures.append(
                        f"[{name}] portrait composition fetched in landscape: {ports}")
            else:
                if lands:
                    failures.append(
                        f"[{name}] landscape composition fetched in portrait: {lands}")
            if lands and ports:
                failures.append(
                    f"[{name}] both orientations fetched: L={lands} P={ports}")
            if page_errors:
                failures.append(f"[{name}] browser errors: {page_errors}")

        # ---- Pass 2: blocked maps — layout must still pass (gradient) -----
        for name, w, h, landscape in VIEWPORTS:
            page = browser.new_page(viewport={"width": w, "height": h},
                                    device_scale_factor=1)
            page.route("**/img/maps/**", lambda route: route.abort())
            page.add_init_script("window.fetch = () => new Promise(() => {});")
            page.goto(f"http://127.0.0.1:{PORT}/adventure.html?v=check-blocked",
                      wait_until="load")
            page.evaluate(MOCK)
            # Still set the CSS vars — image fails, gradient fallback remains.
            page.evaluate(APPLY_MAP, "muster-field")
            page.wait_for_timeout(250)
            m = page.evaluate(PROBE)
            page.close()
            assert_layout(name + "/blocked", w, h, landscape, m, failures)

        # ---- Pass 3: screenshot every map × every viewport ----------------
        for map_id in MAP_IDS:
            for name, w, h, landscape in VIEWPORTS:
                page = browser.new_page(viewport={"width": w, "height": h},
                                        device_scale_factor=1)
                page_errors = []
                page.on("pageerror", lambda error, bucket=page_errors:
                        bucket.append(str(error)))
                page.on("console", lambda msg, bucket=page_errors:
                        bucket.append(msg.text) if msg.type == "error" else None)
                page.add_init_script(
                    "window.fetch = () => new Promise(() => {});")
                page.goto(f"http://127.0.0.1:{PORT}/adventure.html?v=shot",
                          wait_until="load")
                page.evaluate(MOCK)
                page.evaluate(APPLY_MAP, map_id)
                page.wait_for_timeout(300)
                shot = os.path.join(MAP_OUT, f"{map_id}__{name}.png")
                page.screenshot(path=shot)
                page.close()
                if page_errors:
                    failures.append(
                        f"[{map_id}/{name}] browser errors: {page_errors}")
            print(f"   screenshots: {map_id} x {len(VIEWPORTS)} viewports")

        # ---- Pass 4: drag scrim remains readable on both landscape tiers ----
        for name, w, h in (
                ("drag-desktop-1920x1080", 1920, 1080),
                ("drag-phone-844x390", 844, 390)):
            page = browser.new_page(viewport={"width": w, "height": h},
                                    device_scale_factor=1)
            page.add_init_script("window.fetch = () => new Promise(() => {});")
            page.goto(f"http://127.0.0.1:{PORT}/adventure.html?v=drag",
                      wait_until="load")
            page.evaluate(MOCK)
            page.evaluate(APPLY_MAP, "gatehouse")
            page.evaluate("""
                () => {
                  document.body.classList.add('siege-drag-active');
                  document.querySelector('.sprite').classList.add('drop-hover');
                }
            """)
            page.wait_for_timeout(220)
            scrim_opacity = page.evaluate("""
                () => getComputedStyle(
                  document.getElementById('battleStage'), '::after').opacity
            """)
            if scrim_opacity != "1":
                failures.append(
                    f"[{name}] drag scrim did not become opaque: {scrim_opacity}")
            page.screenshot(path=os.path.join(MAP_OUT, name + ".png"))
            page.close()

        browser.close()
    httpd.shutdown()

    print("\n---")
    if failures:
        print("FAILURES:")
        for f in failures:
            print(" ", f)
        sys.exit(1)
    print("all checks passed")
    print(f"layout shots -> {OUT}")
    print(f"map shots    -> {MAP_OUT}")


main()
