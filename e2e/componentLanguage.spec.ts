// One component language, measured in a real browser (plan V-6).
//
// V-6's acceptance test is a sentence about the future — "a new screen can be
// built without reaching for tdy-, foc- or gcal- classes" — which nothing can
// assert directly. What CAN be asserted is the half that makes it true: every
// legacy name and the canonical one resolve to the same computed style. If they
// do, `.ff-card` is a complete substitute for all of them, and the sentence
// follows.
//
// The probes are injected rather than found on a page. A card's appearance is
// a property of the stylesheet, not of whether today's account happens to have
// a Space with a metric on it — and the families that only render behind data
// are exactly the ones that drifted, because nobody was looking at them.
import { expect, test } from "@playwright/test";
import { openApp } from "./addList.helpers";

/** What 21-components.css claims are the same thing. */
const CARDS = [
  "ff-card",
  "tdy-card",
  "foc-card",
  "sdv-card",
  "sdv-metric-card",
  "summary-card",
  "settings-card",
  "panel-section",
  "focus-summary",
  "focus-timer-card",
  "topic-card",
  "project-tasks",
];

/** Same claim, for the button — base, primary and the small size. */
const BUTTONS = {
  base: ["ff-btn", "tdy-btn", "sdv-btn"],
  primary: ["ff-btn ff-btn-primary", "tdy-btn tdy-btn-navy", "sdv-btn sdv-btn-primary", "primary-action"],
  small: ["ff-btn ff-btn-sm", "tdy-btn tdy-btn-sm", "sdv-btn sdv-btn-sm"],
};

/** And for the field. `.ff-field` on a div proves the class alone carries it. */
const FIELDS = ["ff-field", "tdy-capture-input", "tm-quickadd-title", "tm-modal-input"];

/**
 * The computed appearance of one class, with no content and no page around it.
 *
 * Layout properties are left out on purpose: a metric card is a column and a
 * board card is a row, and V-6 is not trying to make those the same. What it
 * unifies is the SURFACE — what the thing is made of.
 */
async function appearanceOf(
  page: import("@playwright/test").Page,
  classNames: string[],
  tag = "div",
  includeHeight = false,
) {
  return page.evaluate(([names, tagName, withHeight]) => {
    const host = document.createElement("div");
    (document.querySelector("main") ?? document.body).appendChild(host);
    const seen: Record<string, string> = {};
    for (const name of names) {
      const probe = document.createElement(tagName);
      probe.className = name;
      host.appendChild(probe);
      const style = getComputedStyle(probe);
      // Height is deliberately absent for cards: `.sdv-metric-card` sets a
      // 140px minimum because of what goes in it, and V-6 is not trying to
      // make a metric tile the same size as a settings panel. What it makes
      // the same is the surface. The controls add their own height check
      // below, where the height IS the point.
      seen[name] = [
        style.backgroundColor,
        `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        style.borderTopLeftRadius,
        `${style.paddingTop}/${style.paddingRight}/${style.paddingBottom}/${style.paddingLeft}`,
        style.boxShadow,
        withHeight ? style.height : "",
      ].join(" | ");
    }
    host.remove();
    return seen;
  }, [classNames, tag, includeHeight] as const);
}

test.describe("the component language (§V.3, V-6)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop presentation is the one the tokens are written for");

  for (const theme of ["light", "dark"] as const) {
    test(`every card name is the same card — ${theme}`, async ({ page }) => {
      await openApp(page, { theme });

      const appearance = await appearanceOf(page, CARDS);
      const canonical = appearance["ff-card"];
      expect(canonical, "the canonical card resolves to something").not.toContain("rgba(0, 0, 0, 0) | 0px");

      for (const name of CARDS) {
        expect(appearance[name], `.${name} is not the same surface as .ff-card`).toBe(canonical);
      }
    });
  }

  test("every button name is the same button, per variant", async ({ page }) => {
    await openApp(page);

    for (const [variant, names] of Object.entries(BUTTONS)) {
      const appearance = await appearanceOf(page, names, "button", true);
      const canonical = appearance[names[0]];
      for (const name of names) {
        expect(appearance[name], `.${name} is not the same ${variant} button`).toBe(canonical);
      }
    }
  });

  test("the primary button is the accent, not a second brand colour", async ({ page }) => {
    await openApp(page);

    // Today's primary used to be `--tdy-navy`. Two primaries in two colours
    // is the thing this stage exists to end, and the accent is the one the
    // user can change (§11.3).
    const appearance = await appearanceOf(page, ["ff-btn ff-btn-primary", "tdy-btn tdy-btn-navy"], "button");
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
    expect(accent).not.toBe("");
    for (const value of Object.values(appearance)) {
      expect(value).toContain("rgb(0, 122, 255)");
    }
  });

  test("every field name is the same field", async ({ page }) => {
    await openApp(page);

    const appearance = await appearanceOf(page, FIELDS, "div", true);
    const canonical = appearance["ff-field"];
    for (const name of FIELDS) {
      expect(appearance[name], `.${name} is not the same field as .ff-field`).toBe(canonical);
    }
  });
});
