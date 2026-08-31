// One component language, measured in a real browser (plan V-6).
//
// V-6's acceptance test is a sentence about the future — "a new screen can be
// built without reaching for tdy-, foc- or gcal- classes" — which nothing can
// assert directly. What CAN be asserted is the half that makes it true: every
// legacy name still in use and the canonical one resolve to the same computed
// style. If they do, `.ff-card` is a complete substitute for all of them, and
// the sentence follows.
//
// "Still in use" is doing real work in that sentence. The lists below once
// held names no screen rendered, and equality between two names that never
// reach the DOM proves nothing about either of them.
//
// The probes are injected rather than found on a page. A card's appearance is
// a property of the stylesheet, not of whether today's account happens to have
// a Space with a metric on it — and the families that only render behind data
// are exactly the ones that drifted, because nobody was looking at them.
import { expect, test } from "@playwright/test";
import { openApp } from "./addList.helpers";

/**
 * What 21-components.css claims are the same thing.
 *
 * This list used to be twelve. Eight of the names on it — `.summary-card`,
 * `.panel-section`, `.focus-summary`, `.focus-timer-card`, `.topic-card`,
 * `.project-tasks`, `.sdv-card`, `.settings-card` — turned out to have no
 * call site anywhere in the app, so the equality this file was proving about
 * them was an equality between two things nobody drew. They were deleted from
 * the stylesheet and from here together; an alias earns its line by being said
 * somewhere.
 *
 * `.settings-card` outlasted the other seven by a round because a comment in
 * App.tsx still names it. The settings screens render `.ff-settings-card`; the
 * bare name was also sharing a rule with the legacy task Detail, where its
 * four-column grid template was quietly capping that panel's content at 160px
 * (TASK_CONTENT_MODE_DESIGN.md §12.2).
 *
 * `.ff-card` has no call site either and stays anyway, because it is the name
 * a new card is supposed to reach for. What keeps it honest is the last test
 * in this file, which builds a screen out of the canonical names and checks
 * that each one draws something.
 */
const CARDS = ["ff-card", "tdy-card", "foc-card", "sdv-metric-card"];

/** Same claim, for the button — base, primary and the small size. */
const BUTTONS = {
  base: ["ff-btn", "tdy-btn", "sdv-btn"],
  primary: ["ff-btn ff-btn-primary", "tdy-btn tdy-btn-navy", "sdv-btn sdv-btn-primary"],
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

  test("a screen can be built out of the canonical names alone", async ({ page }) => {
    await openApp(page);

    // V-6's acceptance sentence, as close to literal as a test can get: put a
    // card, a row, a field and both buttons on the page using nothing but the
    // `ff-` vocabulary, and check that each one actually drew something. A
    // name that resolves to nothing would still pass the equality tests above
    // if every legacy name resolved to nothing too.
    const drawn = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = `
        <section class="ff-card">
          <div class="ff-row"><span>a row</span></div>
          <input class="ff-field" />
          <button class="ff-btn">secondary</button>
          <button class="ff-btn ff-btn-primary">primary</button>
        </section>`;
      (document.querySelector("main") ?? document.body).appendChild(host);
      const read = (selector: string) => {
        const el = host.querySelector(selector) as HTMLElement;
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return {
          background: style.backgroundColor,
          radius: style.borderTopLeftRadius,
          height: Math.round(box.height),
          padded: style.paddingLeft !== "0px",
        };
      };
      const result = {
        card: read(".ff-card"),
        row: read(".ff-row"),
        field: read(".ff-field"),
        button: read(".ff-btn"),
        primary: read(".ff-btn-primary"),
      };
      host.remove();
      return result;
    });

    expect(drawn.card.radius).toBe("10px");
    expect(drawn.card.padded).toBe(true);
    expect(drawn.row.height).toBe(32);
    expect(drawn.field.height).toBe(32);
    expect(drawn.button.height).toBe(32);
    // The primary is the only one of the five that is allowed to be loud.
    expect(drawn.primary.background).toBe("rgb(0, 122, 255)");
    expect(drawn.button.background).not.toBe(drawn.primary.background);
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
