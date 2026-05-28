import { test, expect } from '@playwright/test';

const VIEWPORTS = [
    { width: 390, height: 844, name: 'iphone-14' },
    { width: 375, height: 812, name: 'iphone-se' },
    { width: 360, height: 800, name: 'android-narrow' },
    { width: 320, height: 568, name: 'iphone-se-1g' },
];

const FIXTURE_SECTIONS = [
    '[data-fixture="friend-tile"]',
    '[data-fixture="friend-request"]',
    '[data-fixture="social-active"]',
    '[data-fixture="social-room"]',
    '[data-fixture="deck-tile"]',
];

function rectsOverlap(a, b, tolerance = 2) {
    return !(
        a.right <= b.left + tolerance ||
        a.left >= b.right - tolerance ||
        a.bottom <= b.top + tolerance ||
        a.top >= b.bottom - tolerance
    );
}

function overlapArea(a, b) {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width <= 0 || height <= 0) return 0;
    return width * height;
}

async function collectTextButtonOverlaps(page, rootSelector) {
    return page.evaluate(({ rootSelector, tolerance }) => {
        const overlaps = [];
        const roots = document.querySelectorAll(rootSelector);

        roots.forEach((root) => {
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
    }, { rootSelector, tolerance: 2 });
}

for (const viewport of VIEWPORTS) {
    test(`mobile layout has no text/button overlap at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/mobile-overlap-fixture.html');
        await page.waitForLoadState('networkidle');

        const overlaps = [];
        for (const selector of FIXTURE_SECTIONS) {
            overlaps.push(...await collectTextButtonOverlaps(page, selector));
        }

        expect(overlaps, `Overlapping text/button pairs at ${viewport.width}px`).toEqual([]);
    });
}

test('friend subtitle truncates instead of widening the row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/mobile-overlap-fixture.html');

    const subtitle = page.locator('[data-fixture="friend-tile"] .friend-copy span');
    const box = await subtitle.boundingBox();
    const tile = await page.locator('[data-fixture="friend-tile"] .social-friend-tile').boundingBox();

    expect(box).toBeTruthy();
    expect(tile).toBeTruthy();
    expect(box.width).toBeLessThanOrEqual(tile.width - 42 - 20);
});
