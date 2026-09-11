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
  { id: "purple", expected: "#af52de" },
  { id: "green", expected: "#34c759" },
  { id: "orange", expected: "#ff9500" },
  { id: "pink", expected: "#ff2d55" },
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
});
