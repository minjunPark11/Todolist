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

/**
 * The computed appearance of one class, with no content and no page around it.
 *
 * Layout properties are left out on purpose: a metric card is a column and a
 * board card is a row, and V-6 is not trying to make those the same. What it
 * unifies is the SURFACE — what the thing is made of.
 */
async function appearanceOf(page: import("@playwright/test").Page, classNames: string[]) {
  return page.evaluate((names) => {
    const host = document.createElement("div");
    (document.querySelector("main") ?? document.body).appendChild(host);
    const seen: Record<string, string> = {};
    for (const name of names) {
      const probe = document.createElement("div");
      probe.className = name;
      host.appendChild(probe);
      const style = getComputedStyle(probe);
      seen[name] = [
        style.backgroundColor,
        `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        style.borderTopLeftRadius,
        `${style.paddingTop}/${style.paddingRight}/${style.paddingBottom}/${style.paddingLeft}`,
        style.boxShadow,
      ].join(" | ");
    }
    host.remove();
    return seen;
  }, classNames);
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
});
