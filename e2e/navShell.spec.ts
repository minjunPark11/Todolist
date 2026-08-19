// The Nav Shell in a real browser (spec §2.48 / §3.85, audit P0-12).
//
// Everything in this file is here because jsdom cannot answer it. The unit
// layer is already dense — three axe passes, the sidebar's pure rules, the
// route registry — so a browser spec that re-asserted an aria-label would cost
// CI time and catch nothing. What is left needs one of four things jsdom does
// not have:
//
//   LAYOUT      a viewport with a width, so the responsive mode is real and a
//               column has a measurable size
//   POINTERS    a drag that produces pointermove events at real coordinates
//   STORAGE     a reload that goes through localStorage the way the user's
//               next morning does
//   NAVIGATION  history the browser owns, not a mocked URL string
//
// RAIL-02 and RAIL-07 are asserted as §2.48 states them — but only since
// D-29. D-25 had made the Rail's Search a page navigation, and both cases had
// to be written backwards; using the app settled it the other way. The one
// difference that remains is which surface answers: it is the Command Menu,
// reached from the magnifier and from Ctrl/Cmd+K, rather than a Search
// overlay of its own.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const WIDTH_KEY = "focusflow-sidebar-width";
const COLLAPSED_KEY = "focusflow-sidebar-collapsed";
const DEFAULT_WIDTH = 248;
const MIN_WIDTH = 216;
const MAX_WIDTH = 360;

/** The width the layout is actually using, read off the frame (not declared). */
async function sidebarWidth(page: Page): Promise<number> {
  const box = await page.locator("#context-sidebar").boundingBox();
  return Math.round(box?.width ?? 0);
}

function rail(page: Page, name: string) {
  return page.locator(".global-rail").getByRole("button", { name, exact: true });
}

/** A pointer drag, in the steps the handle's own listeners need to see. */
async function dragHandle(page: Page, byX: number): Promise<void> {
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  const box = await handle.boundingBox();
  if (!box) throw new Error("no resize handle to drag");
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  // More than one move: the drag reads deltas, and a single jump would pass
  // even if the handler only ever looked at the final position.
  await page.mouse.move(startX + byX / 2, y, { steps: 5 });
  await page.mouse.move(startX + byX, y, { steps: 5 });
  await page.mouse.up();
}

// The frame is a desktop three-column layout; the narrow cases say so.
test.describe("the Context Sidebar frame", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "persistent only above 1024 (§15.14)");

  test("CS-01 — a drag moves the sidebar and Main, and never the Rail", async ({ page }) => {
    await openApp(page);
    expect(await sidebarWidth(page)).toBe(DEFAULT_WIDTH);
    const mainBefore = (await page.locator(".tm-main").boundingBox())?.width ?? 0;
    const railBefore = (await page.locator(".global-rail").boundingBox())?.width ?? 0;

    await dragHandle(page, 40);

    expect(await sidebarWidth(page)).toBe(DEFAULT_WIDTH + 40);
    const mainAfter = (await page.locator(".tm-main").boundingBox())?.width ?? 0;
    // §3.13: the sidebar takes its width from Main, not from the window.
    expect(Math.round(mainBefore - mainAfter)).toBe(40);
    // §2.3.3, the invariant the whole frame rests on.
    expect((await page.locator(".global-rail").boundingBox())?.width).toBe(railBefore);
    expect(railBefore).toBe(56);
  });

  test("CS-02 — dragging far left stops at the minimum and does not collapse", async ({ page }) => {
    await openApp(page);
    await dragHandle(page, -600);

    expect(await sidebarWidth(page)).toBe(MIN_WIDTH);
    // §3.7/§3.22: passing the minimum is not a way to collapse. Collapsing is
    // a decision the user makes with a button, not one a slip of the hand makes.
    await expect(page.locator(".app-frame")).not.toHaveClass(/is-sidebar-collapsed/);
    await expect(page.locator("#context-sidebar")).toBeVisible();
  });

  test("CS-03 — dragging far right stops at the maximum", async ({ page }) => {
    await openApp(page);
    await dragHandle(page, 600);

    expect(await sidebarWidth(page)).toBe(MAX_WIDTH);
  });

  test("CS-04 — double-clicking the handle returns to the default", async ({ page }) => {
    await openApp(page);
    await dragHandle(page, 88);
    expect(await sidebarWidth(page)).toBe(336);

    await page.getByRole("separator", { name: "Resize sidebar" }).dblclick();

    // §3.19: back to the DEFAULT, not to the width before the last drag.
    expect(await sidebarWidth(page)).toBe(DEFAULT_WIDTH);
  });

  test("CS-11 — the separator resizes from the keyboard", async ({ page }) => {
    await openApp(page);
    const handle = page.getByRole("separator", { name: "Resize sidebar" });
    await handle.focus();

    await handle.press("ArrowRight");
    expect(await sidebarWidth(page)).toBe(264);
    await handle.press("ArrowLeft");
    expect(await sidebarWidth(page)).toBe(DEFAULT_WIDTH);
    // §3.20's ends, which a drag can only approach.
    await handle.press("End");
    expect(await sidebarWidth(page)).toBe(MAX_WIDTH);
    await handle.press("Home");
    expect(await sidebarWidth(page)).toBe(MIN_WIDTH);
  });

  test("CS-05 — collapsing keeps the width it had", async ({ page }) => {
    await openApp(page);
    await dragHandle(page, 72);
    expect(await sidebarWidth(page)).toBe(320);

    await page.keyboard.press("Control+\\");
    await expect(page.locator(".app-frame")).toHaveClass(/is-sidebar-collapsed/);
    await page.keyboard.press("Control+\\");

    // §3.28: width and visibility are independent. Storing "collapsed" as a
    // width of 0 is the bug this separation exists to prevent.
    expect(await sidebarWidth(page)).toBe(320);
  });

  test("CS-12 — Ctrl/Cmd+\\ toggles, and the expand button is the way back", async ({ page }) => {
    await openApp(page);

    await page.keyboard.press("Control+\\");
    await expect(page.locator(".app-frame")).toHaveClass(/is-sidebar-collapsed/);
    // §3.24: the sidebar's own collapse control went with it, so the way back
    // has to live outside it.
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    await expect(expand).toBeVisible();
    await expect(expand).toHaveAttribute("aria-expanded", "false");

    await expand.click();
    await expect(page.locator(".app-frame")).not.toHaveClass(/is-sidebar-collapsed/);
    expect(await sidebarWidth(page)).toBe(DEFAULT_WIDTH);
  });

  test("CS-07 — a module without a sidebar hides it, and Tasks gets its width back", async ({ page }) => {
    await openApp(page);
    await dragHandle(page, 56);
    expect(await sidebarWidth(page)).toBe(304);

    await rail(page, "Calendar").click();
    await expect(page).toHaveURL(/\/calendar$/);
    // §2.16: a Global Module owns its whole width.
    await expect(page.locator("#context-sidebar")).toHaveCount(0);
    expect((await page.locator(".global-rail").boundingBox())?.width).toBe(56);

    await rail(page, "Tasks").click();
    await expect(page.locator("#context-sidebar")).toBeVisible();
    expect(await sidebarWidth(page)).toBe(304);
  });

  // Not in §3.85, and the reason it is here is §3.68: persistence is written
  // to localStorage, and a reload is the only way to find out whether the app
  // reads back what it wrote. Every assertion above would pass on an app that
  // forgot everything the moment the tab closed.
  test("the width and the collapse survive a reload", async ({ page }) => {
    await openApp(page);
    await dragHandle(page, 40);
    expect(await sidebarWidth(page)).toBe(288);

    await page.reload();
    await expect(page.locator("#context-sidebar")).toBeVisible();
    expect(await sidebarWidth(page)).toBe(288);
    expect(await page.evaluate((key) => localStorage.getItem(key), WIDTH_KEY)).toBe("288");

    await page.keyboard.press("Control+\\");
    await expect(page.locator(".app-frame")).toHaveClass(/is-sidebar-collapsed/);
    await page.reload();

    await expect(page.locator(".app-frame")).toHaveClass(/is-sidebar-collapsed/);
    expect(await page.evaluate((key) => localStorage.getItem(key), COLLAPSED_KEY)).toBe("1");
    // And the width is still remembered underneath the collapse (§3.28).
    expect(await page.evaluate((key) => localStorage.getItem(key), WIDTH_KEY)).toBe("288");
  });

  /**
   * The two shells at one scale, and the header line actually straight.
   *
   * `.app-shell > main` carried `zoom: 0.9` and the Tasks Module's grid did
   * not, so the same sidebar stood beside content at two sizes and crossing
   * between them jumped it by 11%. Only a browser can answer this — jsdom
   * computes no layout, so a zoom is invisible to it, which is why it lasted.
   */
  test("both shells render their content at the same scale", async ({ page }) => {
    await openApp(page);

    const scaleOf = async () =>
      page.evaluate(() => {
        const main = document.querySelector(".tm-main") ?? document.querySelector(".app-shell > main");
        const probe = document.createElement("div");
        probe.style.cssText = "width:100px;height:10px;position:absolute;visibility:hidden";
        main!.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return Math.round(width);
      });

    const tasks = await scaleOf();
    await rail(page, "Calendar").click();
    await expect(page).toHaveURL(/\/calendar$/);
    const legacy = await scaleOf();

    // A 100px box is 100px on both, or one of them is being scaled.
    expect({ tasks, legacy }).toEqual({ tasks: 100, legacy: 100 });
  });

  /**
   * The bug this catches shipped in two releases.
   *
   * `.app-shell`'s other children take no grid track — the mobile menu button
   * is `display: none` above 1024, and the AI chat and toast stack are
   * `position: fixed`. So on a module with no sidebar (§3.3's `none`) `main`
   * was the only grid item, auto-placement dropped it into the first column,
   * and §3.30 makes that column 0px. Calendar, Focus, Matrix and Settings all
   * rendered their content 64px wide against the Rail.
   *
   * Every unit test passed the whole time: jsdom computes no grid.
   */
  test("Main fills the content column on a module with no sidebar", async ({ page }) => {
    await openApp(page);

    for (const item of ["Calendar", "Focus", "Matrix", "Settings"]) {
      await rail(page, item).click();
      await expect(page.locator('.app-frame[data-sidebar-mode="none"]')).toHaveCount(1);

      const width = await page.locator(".app-shell > main").evaluate((el) => Math.round(el.getBoundingClientRect().width));
      const viewport = page.viewportSize()!.width;
      // Everything but the 56px Rail, give or take a scrollbar.
      expect({ item, wide: width > viewport - 100 }).toEqual({ item, wide: true });
    }
  });

  test("the Main header starts on the same line as the sidebar (§7, P0-6)", async ({ page }) => {
    await openApp(page);

    const offset = await page.evaluate(() => {
      const header = document.querySelector(".tm-header")!.getBoundingClientRect();
      const firstRow = document.querySelector("#context-sidebar .tm-row")!.getBoundingClientRect();
      return Math.round(header.top - firstRow.top);
    });

    // P0-6 matched the two heights and left the top edges to chance; they were
    // eight pixels out of true, which reads as a design choice until measured.
    expect(offset).toBe(0);
  });

  test("a stored width the app never wrote recovers to the default (§3.58)", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key as string, "4"), WIDTH_KEY);
    await openApp(page);

    // A sidebar stuck at 4px cannot be dragged back, which is why this is
    // recovery and not clamping.
    expect(await sidebarWidth(page)).toBe(DEFAULT_WIDTH);
  });
});

test.describe("the Global Rail", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the Rail's own cases are desktop");

  test("RAIL-01 — Tasks returns to the Scope you left, not to a home page", async ({ page }) => {
    await openApp(page);
    await page.goto("/completed");
    await expect(page.locator(".tm-shell")).toBeVisible();

    await rail(page, "Calendar").click();
    await expect(page).toHaveURL(/\/calendar$/);
    await rail(page, "Tasks").click();

    // D-15. Session-scoped on purpose: a cold start belongs to the start-page
    // setting, but crossing to Calendar and back is one errand.
    await expect(page).toHaveURL(/\/completed/);
  });

  /**
   * RAIL-01b — the way out of SpaceHub.
   *
   * The Tasks sidebar has a row into SpaceHub; SpaceHub replaces that sidebar
   * with the Space tree, and D-14 took the tree's own `오늘` row away on the
   * grounds that the Rail's Tasks item answers it better. It did not: §2.11's
   * "already Tasks" guard read the Rail's highlight, SpaceHub lights Tasks,
   * and so the only door out of a screen the sidebar invites you into was the
   * browser's Back button — which the packaged desktop app does not draw.
   *
   * A browser case rather than a unit one: what makes it a trap is the real
   * history and the real sidebar swap, and both are NAVIGATION.
   */
  test("RAIL-01b — Tasks leads back out of Spaces, which has no way of its own", async ({ page }) => {
    await openApp(page);
    await page.goto("/completed");
    await expect(page.locator(".tm-shell")).toBeVisible();

    // The doorway as the user meets it: a row in the Tasks sidebar.
    await page.locator("#context-sidebar").getByRole("button", { name: "Spaces", exact: true }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    // The sidebar is the tree now, and nothing on it goes back to the module.
    await expect(page.locator(".space-sidebar")).toBeVisible();

    await rail(page, "Tasks").click();
    await expect(page).toHaveURL(/\/completed/);
  });

  /**
   * One List, one address.
   *
   * A List used to have two: `/list/:id` in the Tasks Module, and
   * `/s/:sp/p/:pj/l/:id` in the Space shell, which drew the same record on a
   * different screen behind a different sidebar. Which one you got depended on
   * which door you came through, and the Space one was the half with no way
   * back. The tree is a route to the List now, not a second place to read it.
   */
  test("a List in the Space tree opens the List, not a second screen of it", async ({ page }) => {
    await openApp(page, {
      spaces: [{ id: "sp-1", name: "School" }],
      projects: [{ id: "pj-1", name: "ABM", spaceId: "sp-1" }],
      lists: [
        { id: "l-1", name: "Reading", projectId: "pj-1" },
        { id: "l-2", name: "Writing", projectId: "pj-1" },
      ],
    });

    await page.locator("#context-sidebar").getByRole("button", { name: "Spaces", exact: true }).click();
    await expect(page.locator(".space-sidebar")).toBeVisible();

    // One work area, so the tree starts at the Project (U2 one level up) —
    // opening it is the only step between the sidebar and a List.
    await page.locator(".spt-space-row").filter({ hasText: "ABM" }).getByRole("button", { name: "Expand" }).click();
    await page.locator(".space-sidebar").getByRole("button", { name: "Reading" }).click();

    await expect(page).toHaveURL(/\/list\/l-1$/);
    // And the sidebar came back with it, which is what makes it a route.
    await expect(page.locator(".tm-sidebar")).toBeVisible();
  });

  /**
   * RAIL-02, as §2.48 wrote it.
   *
   * This is the case D-29 exists for. Under D-25 the magnifier changed four
   * things at once — the URL, the Rail's active item, the sidebar and the
   * whole shell — none of which the user asked for by wanting to search.
   */
  test("RAIL-02 — Search opens over where you are and does not navigate", async ({ page }) => {
    await openApp(page);
    await rail(page, "Calendar").click();
    await expect(page).toHaveURL(/\/calendar$/);

    await rail(page, "Search").click();

    await expect(page.locator(".cmd-menu")).toBeVisible();
    // Nothing behind it moved.
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.locator(".global-rail [aria-current='page']")).toHaveAttribute("aria-label", "Calendar");
    // §2.14 still holds: opening it does not make Search the active module.
    await expect(rail(page, "Search")).not.toHaveAttribute("aria-current", "page");
    // §2.33/§11.24: the button that was pressed is the one that reacts.
    await expect(rail(page, "Search")).toHaveAttribute("aria-expanded", "true");
  });

  test("the menu still hands the query to the Search Page, from its last row", async ({ page }) => {
    await openApp(page);
    await rail(page, "Search").click();
    await page.locator(".cmd-menu-input").fill("inbox");

    await page.getByRole("button", { name: "See all results" }).click();

    // The one place the menu routes, and the user chose it (§10.45).
    await expect(page).toHaveURL(/\/search\?q=inbox/);
    await expect(page.locator(".cmd-menu")).toHaveCount(0);
  });

  test("RAIL-03 — the Account popover does not move you", async ({ page }) => {
    await openApp(page);
    await rail(page, "Calendar").click();
    await expect(page).toHaveURL(/\/calendar$/);

    await rail(page, "Account").click();
    await expect(page.locator('.global-rail [role="menu"]')).toBeVisible();

    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.locator(".global-rail [aria-current='page']")).toHaveAttribute("aria-label", "Calendar");
  });

  test("RAIL-05 — the global Calendar is the Calendar item, and Tasks goes quiet", async ({ page }) => {
    await openApp(page);
    await rail(page, "Calendar").click();

    const active = page.locator(".global-rail [aria-current='page']");
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("aria-label", "Calendar");
  });

  test("RAIL-06 / CS-06 — clicking Tasks while in Tasks does nothing at all", async ({ page }) => {
    await openApp(page);
    await page.goto("/completed");
    await expect(page.locator(".tm-shell")).toBeVisible();
    const before = await sidebarWidth(page);

    await rail(page, "Tasks").click();

    // D-15's second half: re-clicking the module you are in must not toggle
    // the sidebar and must not throw you back to a home Scope.
    await expect(page).toHaveURL(/\/completed/);
    await expect(page.locator(".app-frame")).not.toHaveClass(/is-sidebar-collapsed/);
    expect(await sidebarWidth(page)).toBe(before);
  });

  /**
   * RAIL-07, re-aimed by D-25.
   *
   * There is no Search overlay left to Escape. The Command Menu is the
   * surface that opens over the page now, and the behaviour §2.48 was asking
   * for — Escape closes it, focus goes back where it came from — is what the
   * menu owes.
   */
  test("RAIL-07 — Escape closes the Command Menu and leaves the page alone", async ({ page }) => {
    await openApp(page);
    await page.goto("/completed");
    await expect(page.locator(".tm-shell")).toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(page.locator(".cmd-menu")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator(".cmd-menu")).toHaveCount(0);
    // §10.23/§10.40: the menu wrote nothing to the address bar and left the
    // Scope behind it untouched.
    await expect(page).toHaveURL(/\/completed/);
  });

  test("the menu opens over a module that has no sidebar at all", async ({ page }) => {
    await openApp(page);
    await rail(page, "Calendar").click();
    await expect(page).toHaveURL(/\/calendar$/);

    // D-25's whole point: Ctrl/Cmd+K used to live inside the Tasks Module and
    // could not be reached from here.
    await page.keyboard.press("Control+k");
    await expect(page.locator(".cmd-menu")).toBeVisible();
  });
});

test.describe("below the desktop breakpoint", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, "the overlay cases need a narrow viewport");

  test("CS-08 — the sidebar is not a column, and opens over Main", async ({ page }) => {
    await openApp(page);

    // §15.14: the mode is read from the viewport, not from a stored preference.
    await expect(page.locator(".tm-shell")).toHaveClass(/sidebar-overlay/);
    const trigger = page.locator(".tm-menu-open");
    await expect(trigger).toBeVisible();

    await trigger.click();

    await expect(page.locator(".tm-shell")).toHaveClass(/sidebar-open/);
    await expect(page.locator("#context-sidebar")).toBeVisible();
    // §15.16: something to dismiss it with, because it is a layer.
    await expect(page.locator(".tm-scrim")).toBeVisible();
  });

  test("a closed drawer is out of the tab order, not merely off-screen (P0-11)", async ({ page }) => {
    await openApp(page);

    // The defect D-27 found: `transform` moves a panel out of sight and leaves
    // every row of it reachable by Tab. Only a real browser resolves this —
    // jsdom computes no styles, so `visibility` is invisible to it.
    await expect(page.locator("#context-sidebar")).toBeHidden();
    await expect(page.locator("#context-sidebar .tm-row").first()).toBeHidden();
  });

  test("CS-09 — choosing somewhere in the drawer navigates AND closes it", async ({ page }) => {
    await openApp(page);
    await page.locator(".tm-menu-open").click();
    await expect(page.locator(".tm-shell")).toHaveClass(/sidebar-open/);

    await page.locator("#context-sidebar").getByRole("button", { name: /Completed/ }).click();

    await expect(page).toHaveURL(/\/completed/);
    // A drawer left open over the page it just navigated to hides the answer
    // the user asked for.
    await expect(page.locator(".tm-shell")).not.toHaveClass(/sidebar-open/);
  });

  /**
   * The defect P0-12 turned up on its first run, and the reason it is worth a
   * case of its own rather than a fixed selector.
   *
   * Making the drawer a dialog (§3.50) gave the app two `aria-modal` surfaces
   * that could be open together: the drawer, and a dialog opened from inside
   * it. A screen reader told twice that everything else is inert has no way
   * to know which one meant it. The drawer was only ever the route to that
   * button, so it now gets out of the way the same as it does for navigation.
   */
  test("a dialog opened from the drawer replaces it, rather than stacking on it", async ({ page }) => {
    await openApp(page);
    await page.locator(".tm-menu-open").click();
    await expect(page.locator(".tm-shell")).toHaveClass(/sidebar-open/);
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Add list", exact: true }).click();

    await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
    await expect(page.getByRole("dialog", { name: "New list" })).toBeVisible();
    await expect(page.locator(".tm-shell")).not.toHaveClass(/sidebar-open/);
  });

  /**
   * A media query decides this, so only a real browser can answer it — and
   * the query is about the POINTER, not the width. §15.4 is explicit: a
   * narrow window with a mouse and a tablet are the same mode and want
   * different targets, so the floor is read from `(pointer: coarse)` rather
   * than from the viewport this describe block is guarded on.
   *
   * `.tm-section-action` was in neither list: every row beside it got 44px on
   * touch, and it stayed 19x19 — the smallest target in the shell was the one
   * a finger had to hit.
   */
  test("no control in the drawer is under the floor for this pointer (§15.12)", async ({ page }) => {
    await openApp(page);
    await page.locator(".tm-menu-open").click();
    await expect(page.locator(".tm-shell")).toHaveClass(/sidebar-open/);

    const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
    // 44 for a finger (§15.12); 24 for a pointer that can be aimed, which is
    // WCAG 2.2's own minimum.
    const floor = coarse ? 44 : 24;

    const tooSmall = await page.locator("#context-sidebar button").evaluateAll((nodes, min) =>
      nodes
        .map((node) => {
          const box = node.getBoundingClientRect();
          return { name: node.textContent?.trim().slice(0, 12) ?? "", w: Math.round(box.width), h: Math.round(box.height) };
        })
        .filter((box) => box.w > 0 && (box.w < min || box.h < min)),
      floor,
    );

    expect({ floor, tooSmall }).toEqual({ floor, tooSmall: [] });
  });

  test("§3.50 — the open drawer is a modal, and Escape gives focus back", async ({ page }) => {
    await openApp(page);
    const trigger = page.locator(".tm-menu-open");
    await trigger.click();

    const drawer = page.locator("#context-sidebar");
    await expect(drawer).toHaveAttribute("role", "dialog");
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(drawer.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");

    await expect(page.locator(".tm-shell")).not.toHaveClass(/sidebar-open/);
    // Closing should feel like coming back, not like landing at the top of
    // the document.
    await expect(trigger).toBeFocused();
  });
});
