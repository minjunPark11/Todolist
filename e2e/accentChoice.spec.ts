// The accent the user picked is the accent on screen (spec §4.7's setting).
//
// Written because breaking it left no trace anywhere else. The reference layer
// (POLISHED_REFERENCE_PARITY_DESIGN.md §5.3) set `--accent` on `:root`, which
// has the same specificity as `01-base.css`'s `[data-accent="purple"]` and
// loads after it — so every choice but the default silently resolved to the
// reference's indigo. Every screenshot still looked right, because the default
// IS blue; only picking another colour showed it, and nothing did.
//
// Measured through `getComputedStyle` rather than by looking at a button: the
// question is which declaration wins the cascade, and a button's colour is one
// of many things that answer it.
import { expect, test } from "@playwright/test";
import { openApp } from "./addList.helpers";

const CHOICES = [
  // The default, carrying §4.4's corrected value rather than the old #0064d2.
  { id: "blue", expected: "#556be7" },
  // The other four carry the tone they were re-picked in — Apple's system
  // colours could not hold text or a focus outline at the contrast the app
  // needs (25-reference.css §나머지 넷도 같은 톤으로). The ratios are measured
  // by `src/styles/contrast.test.ts`; what this spec still asks is the older
  // question, and the one that grep cannot answer: does the choice REACH the
  // screen, or does a later layer eat it.
  { id: "purple", expected: "#ac36d3" },
  { id: "green", expected: "#1c7d49" },
  { id: "orange", expected: "#ab5726" },
  { id: "pink", expected: "#cd2d62" },
] as const;

/**
 * The same question in the dark, where the answer used to be "no".
 *
 * The bug this file was written about had a twin one layer down and it lived
 * three months longer. `25-reference.css`'s `[data-theme="dark"]` block is
 * (0,1,0) — the same specificity as `[data-accent="green"]` and later in the
 * file — so in the dark theme all five choices resolved to the reference's
 * indigo. Exactly the shape described at the top of this file, missed for
 * exactly the same reason: the default IS blue, so every dark screenshot looked
 * right.
 *
 * The values are the light ones turned around. `01-base.css` puts it in a line:
 * "잉크는 '더 어두운 색'이 아니라 '읽히는 색'이다. 라이트에서 그 방향은
 * 아래쪽이었지만 다크에서는 위쪽이다." The ratios are measured by
 * `src/styles/contrast.test.ts`; what this spec asks is only whether the choice
 * survives the cascade.
 */
const DARK_CHOICES = [
  { id: "blue", expected: "#8d9cf2" },
  { id: "purple", expected: "#d47ff0" },
  { id: "green", expected: "#15b761" },
  { id: "orange", expected: "#ea874d" },
  { id: "pink", expected: "#ef7ba2" },
] as const;

test.describe("the accent colour setting", () => {
  for (const { id, expected } of CHOICES) {
    test(`${id} reaches the screen`, async ({ page }) => {
      await openApp(page);
      // Written the way the app writes it, then re-read: this is about the
      // stylesheet, not about the settings screen's own controls.
      await page.evaluate((accent) => {
        document.documentElement.dataset.accent = accent;
      }, id);

      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase(),
      );
      expect(accent, `[data-accent="${id}"] draws its own colour`).toBe(expected);
    });
  }

  for (const { id, expected } of DARK_CHOICES) {
    test(`${id} reaches the screen in the dark`, async ({ page }) => {
      await openApp(page);
      await page.evaluate((accent) => {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.dataset.accent = accent;
      }, id);

      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase(),
      );
      expect(accent, `[data-theme="dark"][data-accent="${id}"] draws its own colour`).toBe(expected);
    });
  }

  // The other half: the picker has to show the colour it applies. Blue drifted
  // through two accent changes saying `#007aff` while the app drew something
  // else, and nothing noticed because a swatch is only ever compared to itself.
  test("every swatch shows the colour it would apply", async ({ page }) => {
    await openApp(page);
    await page.goto("/settings");

    for (const { id, expected } of CHOICES) {
      const swatch = await page
        .locator(`.ff-color-swatch[aria-label="${id}"]`)
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      // `rgb(r, g, b)` from the browser, against the hex the CSS declares.
      const [r, g, b] = expected
        .slice(1)
        .match(/../g)!
        .map((h) => Number.parseInt(h, 16));
      expect(swatch, `the ${id} swatch matches the accent it sets`).toBe(`rgb(${r}, ${g}, ${b})`);
    }
  });
});
