// Motion stops when either side asks for it — the setting, or the machine.
//
// The app has always had a "Reduce motion" toggle, and 01-base.css turned
// every transition and animation off when it was on. What it did not have was
// the other half: a reader whose operating system already says "reduce
// motion" got the full set unless they found this app's toggle and said it a
// second time. An accessibility preference the user has already expressed
// once should not need saying twice.
//
// The reason this needs a spec rather than a line of CSS is what the fix
// uncovered. The suppression was also being applied through
// `[data-reduce-motion]` in 19-app-shell.css — presence, not value — and
// App.tsx writes that attribute on every render as "true" OR "false". So the
// selector matched always, and the sidebar's collapse tween in
// 08-calendar-categories.css had never run for anyone. A CSS mistake that
// silently disables motion looks exactly like a design decision, which is why
// the "motion is ON when nobody asked to reduce it" half is tested here too.
import { expect, test } from "@playwright/test";
import { openApp } from "./addList.helpers";

/** The longest transition-duration any visible element declares. */
async function longestTransition(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    let longest = 0;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      for (const part of getComputedStyle(el).transitionDuration.split(",")) {
        const seconds = parseFloat(part);
        if (Number.isFinite(seconds)) longest = Math.max(longest, seconds);
      }
    }
    return longest;
  });
}

test.describe("reduced motion", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop shell is where the tweens are");

  test("the operating system's preference is enough on its own", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page);

    // The app's own toggle is untouched and therefore off: this is the OS
    // preference acting alone, which is the case that used to be ignored.
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "false");
    expect(await longestTransition(page), "something on screen still tweens").toBe(0);
  });

  test("and motion is left alone when neither side asks", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openApp(page);

    // §3.18's tween on the Context Sidebar column. Asserted as "greater than
    // zero" rather than 0.16s because the point is that it runs at all — it
    // did not, for as long as the attribute was matched by presence.
    // Either shell, whichever this module renders — §3.18 states the tween on
    // both, and the bug suppressed both.
    const shell = await page.evaluate(() => {
      const el = document.querySelector(".app-frame .app-shell, .app-frame .tm-shell");
      return el ? { cls: el.className, duration: getComputedStyle(el).transitionDuration } : null;
    });
    expect(shell, "neither shell is on the page").not.toBeNull();
    expect(parseFloat(shell!.duration), "the sidebar column no longer tweens at all").toBeGreaterThan(0);
  });
});
