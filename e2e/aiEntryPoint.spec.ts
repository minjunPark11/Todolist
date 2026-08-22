// The AI entry point, in a real browser (plan V-4).
//
// The FAB it replaces was a 56px circle of 100%-saturation accent, fixed to the
// corner of every legacy page — the loudest thing on screen, for the feature
// furthest from what the app is for (§11.67). It is a Rail utility now, one row
// under Search, which is the same shape of thing: a panel that opens over
// wherever you are rather than a place you go (§2.14).
//
// Three of these assertions exist because moving it broke something that the
// FAB had hidden. The panel was rendered inside the legacy branch only, so a
// Rail button — which is above both shells — opened nothing at all on the
// Tasks Module's routes. And the panel used to stay in the DOM after closing,
// invisible and still taking clicks.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const LIST = { id: "list-ai", name: "AI" };

function aiButton(page: Page) {
  return page.getByRole("button", { name: "AI assistant" });
}

test.describe("the AI entry point (§2.14, §11.67)", () => {
  // 768 rather than the usual 1024: the Rail is hidden below 767 and present
  // at every width above it, so the tablet viewport belongs on this side.
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "the Rail carries the entry point above 767px");

  test("opens over both shells, and does not navigate", async ({ page }) => {
    await openApp(page, { lists: [LIST] });

    // One route from each shell. The Tasks Module is the half the FAB never
    // reached, so a spec that only visited the legacy pages would have passed
    // on a button that did nothing.
    for (const route of [`/list/${LIST.id}`, "/calendar"]) {
      await page.goto(route);
      const before = new URL(page.url()).pathname;

      await aiButton(page).click();
      await expect(page.locator(".ollama-chat-panel")).toBeVisible();
      expect(new URL(page.url()).pathname, "opening the panel is not a navigation").toBe(before);
      await expect(aiButton(page)).toHaveAttribute("aria-expanded", "true");

      // Closed from inside the panel rather than from the Rail: under 900px
      // the panel is `calc(100vw - 28px)` and covers the Rail it was opened
      // from, so the button that opens it is not always the one that closes
      // it. The panel's own close is the affordance that always is.
      await page.getByRole("button", { name: "Close AI chat" }).click();
      // Count, not visibility: the regression this guards left the panel in
      // the tree at opacity 0 with `pointer-events: auto`, which is invisible
      // to a visibility assertion and very much not invisible to a click.
      await expect(page.locator(".ollama-chat-panel")).toHaveCount(0);
      await expect(aiButton(page)).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("no page carries a large saturated fill fixed to it", async ({ page }) => {
    await openApp(page, { lists: [LIST] });

    for (const route of ["/today", "/calendar", "/focus", "/board", `/list/${LIST.id}`]) {
      await page.goto(route);
      await expect(page.locator(".global-rail")).toBeVisible();

      const loud = await page.evaluate(() => {
        const saturation = (r: number, g: number, b: number): number => {
          const max = Math.max(r, g, b) / 255;
          const min = Math.min(r, g, b) / 255;
          if (max === min) return 0;
          const lightness = (max + min) / 2;
          return lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
        };
        const found: string[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          const style = getComputedStyle(el);
          if (style.position !== "fixed") continue;
          const box = el.getBoundingClientRect();
          if (box.width <= 40 && box.height <= 40) continue;
          const parsed = style.backgroundColor.match(/rgba?\(([^)]+)\)/);
          if (!parsed) continue;
          const [r, g, b, a] = parsed[1].split(",").map(Number);
          if (a !== undefined && a < 0.5) continue;
          if (saturation(r, g, b) < 0.6) continue;
          found.push(`${String((el as HTMLElement).className)}: ${style.backgroundColor}`);
        }
        return found;
      });
      expect(loud, `${route} pins a saturated fill to the viewport`).toEqual([]);
    }
  });

  test("and the small-screen launcher stays out of the way here", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);

    // Two entry points on one screen would be the FAB problem again, in a
    // quieter colour.
    await expect(page.locator(".ollama-chat-launcher")).toBeHidden();
  });
});

test.describe("the AI entry point below the Rail's breakpoint", () => {
  // Under 767px the Rail is `display: none` — the legacy hamburger and the
  // Module's overlay sidebar cover navigation there, and §2.39's mobile shell
  // is still to come. Moving the AI entry point into the Rail therefore took
  // it off the screen entirely at these widths, which is what this catches.
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "the Rail carries it above 767px");

  test("is reachable, and is not the accent circle", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);

    await expect(page.locator(".global-rail")).toBeHidden();

    const launcher = page.locator(".ollama-chat-launcher");
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.locator(".ollama-chat-panel")).toBeVisible();
    await launcher.click();
    await expect(page.locator(".ollama-chat-panel")).toHaveCount(0);

    const shape = await launcher.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return { radius: style.borderTopLeftRadius, size: Math.round(box.width), background: style.backgroundColor };
    });
    expect(shape.size).toBe(40);
    expect(shape.radius).toBe("10px");
  });
});
