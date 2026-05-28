"""Mobile layout overlap checks for home.css fixture tiles."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("playwright is required: pip install playwright && playwright install chromium", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT / "src" / "main" / "resources" / "static"
FIXTURE = STATIC_DIR / "mobile-overlap-fixture.html"

VIEWPORTS = [
    (390, 844, "iphone-14"),
    (375, 812, "iphone-se"),
    (360, 800, "android-narrow"),
    (320, 568, "iphone-se-1g"),
]

FIXTURE_SECTIONS = [
    '[data-fixture="friend-tile"]',
    '[data-fixture="friend-request"]',
    '[data-fixture="social-active"]',
    '[data-fixture="social-room"]',
    '[data-fixture="deck-tile"]',
]

OVERLAP_SCRIPT = """
({ rootSelector, tolerance }) => {
    const overlaps = [];
    document.querySelectorAll(rootSelector).forEach((root) => {
        const fixture = root.getAttribute('data-fixture') || rootSelector;
        const textNodes = root.querySelectorAll('strong, span, a, p, h1, h2, h3, em, small');
        const buttons = root.querySelectorAll('button, .primary-btn, .ghost-btn');
        textNodes.forEach((textEl) => {
            if (textEl.closest('button')) return;
            const text = (textEl.textContent || '').trim();
            if (!text) return;
            const textRect = textEl.getBoundingClientRect();
            if (textRect.width < 1 || textRect.height < 1) return;
            buttons.forEach((button) => {
                if (button.contains(textEl)) return;
                const buttonRect = button.getBoundingClientRect();
                if (buttonRect.width < 1 || buttonRect.height < 1) return;
                const overlapWidth = Math.min(textRect.right, buttonRect.right) - Math.max(textRect.left, buttonRect.left);
                const overlapHeight = Math.min(textRect.bottom, buttonRect.bottom) - Math.max(textRect.top, buttonRect.top);
                if (overlapWidth <= tolerance || overlapHeight <= tolerance) return;
                overlaps.push({
                    fixture,
                    text: text.slice(0, 80),
                    button: (button.textContent || '').trim().slice(0, 40),
                });
            });
        });
    });
    return overlaps;
}
"""


async def collect_overlaps(page, selector: str) -> list[dict]:
    return await page.evaluate(OVERLAP_SCRIPT, {"rootSelector": selector, "tolerance": 2})


async def run() -> None:
    if not FIXTURE.exists():
        raise SystemExit(f"Missing fixture: {FIXTURE}")

    failures: list[str] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        page = await browser.new_page()
        url = FIXTURE.resolve().as_uri()

        for width, height, name in VIEWPORTS:
            await page.set_viewport_size({"width": width, "height": height})
            await page.goto(url, wait_until="networkidle")

            overlaps: list[dict] = []
            for selector in FIXTURE_SECTIONS:
                overlaps.extend(await collect_overlaps(page, selector))

            if overlaps:
                details = "\n".join(
                    f"  - [{item['fixture']}] text={item['text']!r} button={item['button']!r}"
                    for item in overlaps
                )
                failures.append(f"{name} ({width}px):\n{details}")
            else:
                print(f"PASS {name} ({width}x{height})")

        await page.set_viewport_size({"width": 390, "height": 844})
        await page.goto(url, wait_until="networkidle")
        subtitle = page.locator('[data-fixture="friend-tile"] .friend-copy span')
        tile = page.locator('[data-fixture="friend-tile"] .social-friend-tile')
        subtitle_box = await subtitle.bounding_box()
        tile_box = await tile.bounding_box()
        if not subtitle_box or not tile_box:
            failures.append("friend subtitle truncation: missing bounding boxes")
        elif subtitle_box["width"] > tile_box["width"] - 42 - 20:
            failures.append(
                "friend subtitle truncation: "
                f"subtitle width {subtitle_box['width']:.1f}px exceeds available row width"
            )
        else:
            print("PASS friend subtitle stays within row width")

        await browser.close()

    if failures:
        print("\nFAILURES:")
        print("\n\n".join(failures))
        raise SystemExit(1)

    print("\nAll mobile overlap checks passed.")


if __name__ == "__main__":
    asyncio.run(run())
