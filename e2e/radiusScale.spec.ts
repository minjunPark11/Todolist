// The §11.39 radius scale, measured in a real browser (plan V-2).
//
// The app was running eight shapes at once — 6·8·10·12·14·18·999·50% — because
// five component languages each brought their own card, button and input. This
// asserts the shapes that reach the screen, not the ones the stylesheets
// declare: a rule can be overridden, scoped to a breakpoint or simply never
// rendered, and only the first of those is visible to a grep.
//
// Everything outside the scale has to be named here, with the reason §11 gives
// for it. That is the point of the allow list — an exception nobody wrote down
// is how a scale of five values becomes a scale of eight again.
//
// The screens carry DATA. An empty account renders none of the cards, rows or
// dialogs that carried the off-scale radii, so a spec that skipped the seeding
// would have passed against the palette this change replaced.
import { expect, test, type Page } from "@playwright/test";
import { openApp, openFromHeader, nameField, dialog } from "./addList.helpers";

const LIST = { id: "list-radius", name: "Radius" };

/**
 * Shapes that stay off the scale, each for a reason §11 gives.
 *
 * The FAB used to be listed here as the one entry that was not a decision.
 * V-4 made it one: the 56px accent circle is gone and the AI panel opens from
 * a Rail utility, so there is nothing to exempt.
 */
// Matched with `closest` rather than against the element’s own class list:
// several of these paint their shape onto an unclassed child, and a check that
// only read the element it landed on would report that child as an offender.
const ALLOWED_OFF_SCALE = [
  ".gcal-col-date", // a calendar day is a circle wherever this idiom appears (V-Q3)
  ".gcal-mini-day", // the same idiom, in the mini month
  ".gcal-cat-badge", // §11.2 keeps the pill for badges and counts
  ".gcal-now-badge",
  ".gcal-taskpanel-rail-badge",
  ".foc-group-title small", // the count beside a Focus group, same pill
  ".ff-board-count", // and the one on a Matrix quadrant
  ".rail-avatar-initial", // §11.40: Avatar round
  ".ff-color-swatch", // a colour is a dot, not a control
  ".tm-swatch", // the same dot, in the Add List dialog
  '[class*="tm-preview-"]', // a thumbnail of a layout, drawn at a fraction of the size
];

const SCALE = [6, 8, 10, 12];

interface Offender {
  cls: string;
  radius: string;
  size: string;
}

/**
 * Every shape on screen that is wider than a decoration.
 *
 * The 20px floor is the plan's: below it are dots, markers and the 3px corners
 * on a preview thumbnail, where a radius is a texture rather than a shape.
 */
async function offScaleShapes(page: Page, scale: number[], allowed: string[]): Promise<Offender[]> {
  return page.evaluate(
    ([values, allowList]) => {
      const seen = new Map<string, { cls: string; radius: string; size: string }>();
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const box = el.getBoundingClientRect();
        if (box.width < 20 || box.height < 8) continue;
        const style = getComputedStyle(el);
        const classes = String((el as HTMLElement).className ?? "").trim().split(/\s+/);
        if ((allowList as string[]).some((sel) => el.closest(sel))) continue;
        for (const radius of [style.borderTopLeftRadius, style.borderBottomRightRadius]) {
          if (!radius || radius === "0px") continue;
          const rounded = Math.round(parseFloat(radius));
          if (!radius.includes("%") && (values as number[]).includes(rounded)) continue;
          const cls = classes[0] || el.tagName.toLowerCase();
          seen.set(`${cls}|${radius}`, {
            cls,
            radius,
            size: `${Math.round(box.width)}x${Math.round(box.height)}`,
          });
        }
      }
      return Array.from(seen.values());
    },
    [scale, allowed] as const,
  );
}

async function addTask(page: Page, title: string): Promise<void> {
  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill(title);
  await field.press("Enter");
  await expect(page.getByRole("button", { name: `Open ${title}` })).toBeVisible();
}

test.describe("the radius scale (§11.39)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop presentation is where all five languages are on screen");

  test("every shape wider than a decoration is on the scale", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Measure the corners");

    for (const route of ["/today", "/calendar", "/focus", "/board", "/spaces", "/planning", "/settings", `/list/${LIST.id}`]) {
      await page.goto(route);
      await expect(page.locator(".global-rail")).toBeVisible();

      const offenders = await offScaleShapes(page, SCALE, ALLOWED_OFF_SCALE);
      expect(offenders, `${route} draws a shape outside {6, 8, 10, 12}`).toEqual([]);
    }
  });

  test("the layers that open over the app are on it too", async ({ page }) => {
    await openApp(page, { lists: [LIST] });

    // A dialog and a Task Detail are the two surfaces the sweep above cannot
    // reach: neither is in the tree until something opens it.
    await openFromHeader(page);
    await expect(dialog(page)).toBeVisible();
    await expect(nameField(page)).toBeVisible();
    expect(await offScaleShapes(page, SCALE, ALLOWED_OFF_SCALE), "the Add List dialog").toEqual([]);
    await page.keyboard.press("Escape");

    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Open me");
    await page.getByRole("button", { name: "Open Open me" }).click();
    await expect(page.locator(".tm-drawer.is-empty")).toHaveCount(0);
    expect(await offScaleShapes(page, SCALE, ALLOWED_OFF_SCALE), "the Task Detail").toEqual([]);

    await page.keyboard.press("Control+k");
    await expect(page.locator(".cmd-menu")).toBeVisible();
    expect(await offScaleShapes(page, SCALE, ALLOWED_OFF_SCALE), "the Command Menu").toEqual([]);
  });
});
