// The bar that says how far down you are, on the app whose page is what
// scrolls.
//
// 01-base.css hides every native scrollbar so a scrolling column is as wide as
// a still one, and for a long time nothing replaced it. This spec is the
// replacement's behaviour, and the reason it is a spec rather than a look is
// that the interesting rules are about WHEN it is not there.
//
// TICKTICK_COMPONENT_02 §4.1 timed the reference: hovering the scrolling area
// does not show it, hovering the bar itself does not show it, an actual scroll
// does, and it fades 1.8–2.2s after the pointer leaves. A bar that appeared on
// hover would pass every geometry check here and still be the wrong component.
import { expect, test } from "@playwright/test";
import { openApp } from "./addList.helpers";

const BAR = ".page-scrollbar";

/** Short enough that the shell's own 720px minimum overflows it. */
const SHORT = { width: 1440, height: 320 };

async function opacityOf(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel as string);
    return el ? parseFloat(getComputedStyle(el).opacity) : -1;
  }, BAR);
}

test.describe("the page scrollbar", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "one shell width is enough for a scroll rule");

  test("is not drawn at all when the page fits", async ({ page }) => {
    await openApp(page);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await expect(page.locator(BAR)).toHaveCount(0);
  });

  test("waits for a scroll — hovering the page is not enough", async ({ page }) => {
    await openApp(page);
    await page.setViewportSize(SHORT);
    await expect(page.locator(BAR)).toHaveCount(1);

    // §4.1's first two rows: the pointer over the area, and then over the bar
    // itself, both leave it hidden.
    await page.mouse.move(700, 160);
    await page.waitForTimeout(500);
    expect(await opacityOf(page), "hovering the page revealed it").toBe(0);

    const box = await page.locator(BAR).boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(20, box!.height / 2));
    await page.waitForTimeout(500);
    expect(await opacityOf(page), "hovering the bar revealed it").toBe(0);
  });

  test("appears on a real scroll and goes away on its own", async ({ page }) => {
    await openApp(page);
    await page.setViewportSize(SHORT);

    await page.mouse.move(700, 160);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => opacityOf(page), { timeout: 2000 }).toBe(1);

    // §4.1 measured the fade starting between 1.8 and 2.2 seconds, over 0.3s.
    await expect.poll(() => opacityOf(page), { timeout: 5000 }).toBe(0);
  });

  test("is the shape §4 measured, and reports the position it should", async ({ page }) => {
    await openApp(page);
    await page.setViewportSize(SHORT);
    // The bar is mounted by a measurement that runs after the resize, so it
    // is not on the page the instant the viewport changes.
    await expect(page.locator(BAR)).toHaveCount(1);

    const shape = await page.evaluate((sel) => {
      const el = document.querySelector(sel as string) as HTMLElement;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        width: box.width,
        radius: style.borderTopLeftRadius,
        fromRight: window.innerWidth - box.right,
        position: style.position,
        pointerEvents: style.pointerEvents,
        transition: style.transition,
        children: el.children.length,
        top: box.top,
      };
    }, BAR);

    expect(shape.width).toBe(6);
    expect(shape.radius).toBe("7px");
    expect(shape.fromRight).toBe(2);
    expect(shape.position).toBe("fixed");
    // Nothing to grab: §4.1 kept the bar invisible under the pointer, so it
    // was never something a reader could aim at.
    expect(shape.pointerEvents).toBe("none");
    expect(shape.transition).toBe("opacity 0.3s");
    // No track, no arrows — the reference's bar has no children either.
    expect(shape.children).toBe(0);
    expect(shape.top).toBe(2);

    // At the bottom the thumb is flush with the lower edge, which is what the
    // 670-in-673 sample in §4 requires.
    await page.mouse.move(700, 160);
    await page.mouse.wheel(0, 5000);
    await expect.poll(() => opacityOf(page), { timeout: 2000 }).toBe(1);
    const atEnd = await page.evaluate((sel) => {
      const box = (document.querySelector(sel as string) as HTMLElement).getBoundingClientRect();
      return { bottom: box.bottom, viewport: window.innerHeight };
    }, BAR);
    expect(atEnd.bottom).toBeCloseTo(atEnd.viewport, 0);
  });
});
