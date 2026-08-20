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

const BAR = ".overlay-scrollbar.is-page";

/** Short enough that the shell's own 720px minimum overflows it. */
const SHORT = { width: 1440, height: 320 };

async function opacityIn(page: import("@playwright/test").Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel as string);
    return el ? parseFloat(getComputedStyle(el).opacity) : -1;
  }, selector);
}

const opacityOf = (page: import("@playwright/test").Page) => opacityIn(page, BAR);

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

// The calendar's time grid scrolls inside itself, and an element — unlike the
// page — has an outside. So this is where §4.1's rule can be kept literally:
// after a scroll the bar stays for as long as the pointer is in the grid, and
// only starts fading once it leaves. The page's bar had to approximate that
// with "when scrolling stops", because a window has no outside to leave.
test.describe("the calendar's own scrollbar", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the time grid needs a desktop column");

  const GRID = ".gcal-timegrid .overlay-scrollbar";

  /**
   * On the calendar, with the arrival scroll finished and the bar back down.
   *
   * The view scrolls itself to the current hour when it mounts. That is a real
   * scroll, so it shows the bar — and waiting only for the bar to read 0 is
   * not enough, because "0" is also what it reads in the moment BEFORE that
   * scroll happens. On a cold start, where the first compile pushed the
   * arrival scroll out by seconds, a test could pass that wait, hover the
   * grid, and then watch the auto-scroll reveal the bar underneath it. So the
   * scroll position has to stop moving first, and only then the opacity.
   */
  async function openCalendar(page: import("@playwright/test").Page) {
    await openApp(page);
    await page.locator(".global-rail").getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(page.locator(".gcal-time-scroll")).toBeVisible();

    const scrollTop = () =>
      page.evaluate(() => document.querySelector(".gcal-time-scroll")?.scrollTop ?? -1);
    await expect
      .poll(
        async () => {
          const first = await scrollTop();
          await page.waitForTimeout(150);
          return first === (await scrollTop());
        },
        { timeout: 10000 },
      )
      .toBe(true);

    await expect.poll(() => opacityIn(page, GRID), { timeout: 6000 }).toBe(0);
  }

  test("stays hidden until the grid is actually scrolled", async ({ page }) => {
    await openCalendar(page);

    const box = (await page.locator(".gcal-time-scroll").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    expect(await opacityIn(page, GRID), "hovering the grid revealed it").toBe(0);

    await page.mouse.wheel(0, 240);
    await expect.poll(() => opacityIn(page, GRID), { timeout: 2000 }).toBe(1);
  });

  test("stays while the pointer is in the grid, and leaves when it leaves", async ({ page }) => {
    await openCalendar(page);

    const box = (await page.locator(".gcal-time-scroll").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
    await expect.poll(() => opacityIn(page, GRID), { timeout: 2000 }).toBe(1);

    // §4.1 watched it hold for 3.5 seconds with the pointer inside. The page's
    // bar would be long gone by now.
    await page.waitForTimeout(3000);
    expect(await opacityIn(page, GRID), "it faded while the pointer was still inside").toBe(1);

    await page.mouse.move(box.x - 40, box.y + box.height / 2);
    await expect.poll(() => opacityIn(page, GRID), { timeout: 5000 }).toBe(0);
  });

  test("is drawn against the grid, not against the window", async ({ page }) => {
    await openCalendar(page);

    const geometry = await page.evaluate((sel) => {
      const bar = document.querySelector(sel as string) as HTMLElement;
      const scroller = document.querySelector(".gcal-time-scroll") as HTMLElement;
      const b = bar.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      return {
        position: getComputedStyle(bar).position,
        width: b.width,
        fromScrollerRight: s.right - b.right,
        height: b.height,
        expected: (scroller.clientHeight * scroller.clientHeight) / scroller.scrollHeight,
      };
    }, GRID);

    expect(geometry.position).toBe("absolute");
    expect(geometry.width).toBe(6);
    expect(geometry.fromScrollerRight).toBe(2);
    expect(geometry.height).toBeCloseTo(geometry.expected, 1);
  });
});
