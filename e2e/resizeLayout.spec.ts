import { expect, test } from '@playwright/test';
import { openApp } from './addList.helpers';

test('desktop pages fit while the window is resized', async ({ page }) => {
  test.setTimeout(60_000);
  await openApp(page);
  for (const path of ['/today', '/calendar', '/focus', '/board', '/settings']) {
    await page.goto(path);
    await page.evaluate(() => { document.documentElement.dataset.windowChrome = 'custom'; });
    for (const width of [1440, 1280, 1279, 1100, 1024, 1023, 980, 901, 900, 768, 640, 1440]) {
      await page.setViewportSize({ width, height: 480 });
      await page.waitForTimeout(250);
      const geometry = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        bodyWidth: document.querySelector('.app-frame-body')?.getBoundingClientRect().width,
        legacyMainWidth: document.querySelector('.app-shell > main')?.getBoundingClientRect().width,
        titleTop: document.querySelector('.ff-page-title')?.getBoundingClientRect().top,
        menuBottom: document.querySelector('.mobile-menu-button')?.getBoundingClientRect().bottom,
      }));
      expect.soft(geometry.scroll, `${path} at ${width}`).toBeLessThanOrEqual(width + 1);
      if (path !== '/today') {
        expect.soft(geometry.legacyMainWidth, `${path} uses full content width at ${width}`).toBeCloseTo(geometry.bodyWidth!, 0);
      }
      if (path === '/settings' && [980, 640].includes(width)) {
        if (width === 640) expect(geometry.titleTop).toBeGreaterThan(geometry.menuBottom!);
        await page.screenshot({ path: `test-results/settings-resize-${width}.png` });
      }
    }
  }
});
