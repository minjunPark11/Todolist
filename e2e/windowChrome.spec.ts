// The app-drawn window caption, in a browser that has no window to caption
// (WINDOW_TOP_ROW_DESIGN.md §5).
//
// Everything about the caption row is keyed on `[data-window-chrome="custom"]`,
// and only the desktop build sets it — so Playwright, which opens the browser
// build, sees none of it. That is the point of the attribute and also the
// problem with testing it: the rules that matter here are exactly the ones no
// suite was running.
//
// So this spec sets the attribute itself and measures what the stylesheet then
// does. It cannot test the two things that belong to the OS — whether dragging
// moves the window, whether the buttons minimize it — and it does not pretend
// to; what it holds is the geometry those buttons need to be usable, which is
// what broke when the row was empty and would break again if a reservation
// went missing.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

/** 46 × 3, Windows' own caption metrics. */
const BUTTONS_W = 138;

async function asDesktopApp(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.dataset.windowChrome = "custom";
  });
}

async function padRight(page: Page, selector: string): Promise<number> {
  return page.evaluate((css) => {
    const el = document.querySelector(css);
    return el ? Number.parseFloat(getComputedStyle(el).paddingRight) : -1;
  }, selector);
}

test.describe("the desktop build's caption row", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop window is the one with a caption");

  test("reserves no band — the app starts at the window edge", async ({ page }) => {
    await openApp(page);
    await page.goto("/today");
    await asDesktopApp(page);

    // Before §3 these three began at y=48: 32px of empty caption and the
    // page's own 16. The 32 is what went.
    const tops = await page.evaluate(() => {
      const y = (css: string) => {
        const el = document.querySelector(css);
        return el ? Math.round(el.getBoundingClientRect().top) : -1;
      };
      return {
        rail: y(".global-rail button"),
        sidebar: y(".tm-sidebar .tm-section"),
        title: y(".tm-header"),
        bodyPadding: getComputedStyle(document.querySelector(".app-frame-body")!).paddingTop,
      };
    });

    expect(tops.rail).toBe(16);
    expect(tops.sidebar).toBe(16);
    expect(tops.title).toBe(16);
    expect(tops.bodyPadding).toBe("0px");
  });

  test("paints nothing of its own — the columns reach the top edge", async ({ page }) => {
    await openApp(page);
    await page.goto("/today");
    await asDesktopApp(page);

    // The fill was a gradient imitating the columns, and it is what put a
    // white band over a grey page (§2). Its absence is the fix.
    await expect(page.locator(".window-titlebar-fill")).toHaveCount(0);
    // And the full-width drag strip, which at z-index 70 would now be sitting
    // on the sidebar's first row.
    await expect(page.locator(".window-titlebar-drag")).toHaveCount(0);
  });

  test("keeps the buttons' width clear on every row that reaches that edge", async ({ page }) => {
    await openApp(page);

    for (const [path, selector] of [
      ["/board", ".ff-page-head"],
      ["/calendar", ".gcal-toolbar"],
      ["/focus", ".foc-header"],
      ["/settings", ".ff-page-head"],
    ] as const) {
      await page.goto(path);
      await asDesktopApp(page);
      expect(await padRight(page, selector), `${path} keeps the buttons clear`).toBeGreaterThanOrEqual(
        BUTTONS_W,
      );
    }
  });

  test("gives the Detail column the same clearance, since it is the right-most", async ({ page }) => {
    await openApp(page);
    await page.goto("/today");
    await asDesktopApp(page);
    // Nothing to open on an empty account; a Task is added the way the other
    // specs add one.
    const field = page.getByRole("textbox", { name: "Add a task" });
    await field.fill("Under the buttons");
    await field.press("Enter");
    await page.getByRole("button", { name: "Open Under the buttons" }).click();
    await asDesktopApp(page);

    await expect(page.locator(".tm-drawer.is-inline-drawer")).toBeVisible();
    expect(await padRight(page, ".tm-drawer.is-inline-drawer .tm-drawer-head")).toBeGreaterThanOrEqual(
      BUTTONS_W,
    );
  });

  test("changes nothing without the attribute", async ({ page }) => {
    // The browser build is the same app; this is the guard that says so.
    await openApp(page);
    await page.goto("/board");

    expect(await padRight(page, ".ff-page-head")).toBeLessThan(BUTTONS_W);
    const top = await page.evaluate(() =>
      Math.round(document.querySelector(".global-rail button")!.getBoundingClientRect().top),
    );
    expect(top).toBe(16);
  });
});
