// The §11.6 surface hierarchy, measured in a real browser (plan V-1, V-3).
//
// Two things are guarded here, and neither is observable anywhere else in the
// suite: jsdom loads no stylesheet, so `getComputedStyle` there answers with
// the empty string and every assertion below would pass on an app that draws
// nothing at all.
//
// V-1 is an ORDER, not four numbers. Pinning `#0a0a0c` would fail the next
// time the palette is tuned and would still pass if all three surfaces moved
// together — which is the one case that must not happen. So the assertion is
// `rail < sidebar < canvas` by relative luminance, in both themes.
//
// The screens are chosen for the reason the plan's §V.4 records: on a screen
// with cards, a white card rescues the ordering and hides an inverted chrome.
// Calendar, Focus and Matrix have nothing but the canvas, so they are where
// the hierarchy is actually decided.
//
// V-3 is about colour rather than order. §11.38 allows a shadow on popovers
// and dialogs only, and no clause in §11 allows a coloured one — the blue glow
// this replaced was hardcoded in two component sheets rather than in the token
// it was blamed on, so the check walks the rendered tree instead of the CSS.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const LIST = { id: "list-surfaces", name: "Surfaces" };

/** Card-less screens: the canvas is the only thing the chrome is compared to. */
const CANVAS_ONLY = ["/calendar", "/focus", "/board"] as const;

interface Surfaces {
  rail: number | null;
  sidebar: number | null;
  canvas: number | null;
}

/**
 * Relative luminance of what each surface actually paints.
 *
 * The walk up the ancestors matters: a column that sets no background of its
 * own shows its parent's, and the surface a user sees is the one that ends the
 * walk — not the `transparent` the element itself declares.
 */
async function luminance(page: Page): Promise<Surfaces> {
  return page.evaluate(() => {
    const opaque = (el: Element | null): [number, number, number] | null => {
      let node: Element | null = el;
      while (node) {
        const parsed = getComputedStyle(node).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (parsed) {
          const parts = parsed[1].split(",").map(Number);
          if (parts.length < 4 || parts[3] > 0.99) return [parts[0], parts[1], parts[2]];
        }
        node = node.parentElement;
      }
      return null;
    };
    const relative = (rgb: [number, number, number] | null): number | null => {
      if (!rgb) return null;
      const channel = (value: number): number => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    };
    return {
      rail: relative(opaque(document.querySelector(".global-rail"))),
      sidebar: relative(opaque(document.querySelector(".space-sidebar, .tm-sidebar"))),
      // `main` rather than a shell-specific selector on purpose: the Tasks
      // module draws its own frame (`main.tm-main`) and the legacy pages draw
      // the app shell's, and D-30's lesson is that a measurement that only
      // ever visits one of the two shells answers for half the app.
      canvas: relative(opaque(document.querySelector("main"))),
    };
  });
}

test.describe("the surface hierarchy (§11.6)", () => {
  // The Rail and the Context Sidebar are columns only above the desktop
  // breakpoint. Below it the sidebar is a sheet over Main (§15.14), so there
  // is no three-surface stack to order.
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "three columns exist above 1024 only");

  for (const theme of ["light", "dark"] as const) {
    test(`navigation sinks below the content — ${theme}, on the screens with no cards`, async ({ page }) => {
      await openApp(page, { lists: [LIST], theme });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      for (const route of CANVAS_ONLY) {
        await page.goto(route);
        await expect(page.locator(".global-rail")).toBeVisible();

        const { rail, canvas } = await luminance(page);
        expect(rail, `${route} draws a Rail`).not.toBeNull();
        expect(canvas, `${route} draws a canvas`).not.toBeNull();
        expect(rail!, `${route} (${theme}): the Rail is darker than the canvas`).toBeLessThan(canvas!);
      }
    });

    test(`Rail < sidebar < canvas where all three are on screen — ${theme}`, async ({ page }) => {
      await openApp(page, { lists: [LIST], theme });
      await page.goto(`/list/${LIST.id}`);
      await expect(page.locator(".tm-sidebar")).toBeVisible();

      const { rail, sidebar, canvas } = await luminance(page);
      expect(rail!).toBeLessThan(sidebar!);
      expect(sidebar!).toBeLessThan(canvas!);
    });
  }

  test("no shadow on screen has a colour, and the chrome has none at all", async ({ page }) => {
    await openApp(page, { lists: [LIST] });

    for (const route of [...CANVAS_ONLY, `/list/${LIST.id}`, "/today"]) {
      await page.goto(route);
      await expect(page.locator(".global-rail")).toBeVisible();

      const found = await page.evaluate(() => {
        const coloured: string[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          const shadow = getComputedStyle(el).boxShadow;
          if (!shadow || shadow === "none") continue;
          for (const match of shadow.matchAll(/rgba?\(([^)]+)\)/g)) {
            const [r, g, b] = match[1].split(",").map(Number);
            if (!(r === g && g === b)) coloured.push(`${el.className}: ${shadow}`);
          }
        }
        const chrome = [".global-rail", ".tm-sidebar", ".space-sidebar"]
          .map((sel) => document.querySelector(sel))
          .filter((el): el is Element => el !== null)
          .filter((el) => getComputedStyle(el).boxShadow !== "none")
          .map((el) => String(el.className));
        return { coloured, chrome };
      });

      expect(found.coloured, `${route} draws a coloured shadow`).toEqual([]);
      expect(found.chrome, `${route} puts a shadow on the chrome (§11.38)`).toEqual([]);
    }
  });
});
