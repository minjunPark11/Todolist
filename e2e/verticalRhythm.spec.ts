// The vertical rhythm, measured in a real browser (plan V-5).
//
// Three grids used to overlap that are not multiples of each other: sidebar
// rows at 30, the Rail at 40, and legacy controls anywhere from 24 to 42. This
// asserts the two the design has clauses for, and names the Rail as the third.
//
// The value is 36 for navigation rows rather than the 32 the plan first
// proposed. §4.86 sets the nav row and the tree rhythm at 36 and the create
// row at 32, and §11.2 — the definition the whole scorecard is written against
// — says "36px navigation rhythm" in as many words. The 30px it replaces cited
// §2.29, which is Pointer Behavior and says nothing about heights.
//
// Controls keep 32: `--density-control-h` is 32, a button is not a navigation
// row, and §4.86 puts the create row at 32 alongside the 36 ones.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const LIST = { id: "list-rhythm", name: "Rhythm" };

/**
 * Heights that stay off the grid, each with the reason §11 or §2 gives.
 *
 * The FAB was listed here and in the radius spec while V-4 was open. It is
 * gone as of V-4, and so are both lines.
 */
const ALLOWED_OFF_GRID = [
  ".rail-item", // §2.5 sets the Rail at 40: an icon-only column may hold its own rhythm
  ".gcal-mini-day", // a day cell in the mini month, sized by the grid it sits in
  ".ff-color-swatch", // a colour is a dot, not a control
  ".gcal-taskpanel-rail-btn", // a vertical tab, read top to bottom rather than along a row
  // The small size, 28px. Not a stray: §4.87 gives a section action exactly
  // that number, and V-6 made one `-sm` out of the three the families had.
  ".ff-btn-sm",
  ".sdv-btn-sm",
  ".foc-task-main", // a task row carrying a title AND a meta line: the grid is for single-line rows
  ".motion-task-row", // the same two-line row, on the Matrix
  ".tm-task-open", // a Task row is content: its hit target is as tall as the row, not as the grid
  // The quick add's input, which stopped being a CONTROL when the row became
  // one (TICKTICK_COMPONENT_10_QUICK_ADD.md §10): the 32px box around it is
  // what sits on the grid, and the input is the text inside it, 30 tall
  // because the row's 1px border is its own. It measured 32 until §10.10 —
  // as a field, drawing a second box inside the first.
  ".tm-quickadd-title",
  // The same clause, for the two controls that sit BESIDE that input inside
  // the same 32px box (QUICK_ADD_INPUT_BOX_DESIGN.md §8): the row is the
  // control on the grid, and the date chip and the caret are what it holds.
  // A 32px chip inside a 32px row would have to overflow it.
  ".tm-quickadd-date",
  ".tm-quickadd-more",
  // The Matrix box header. Its two icon buttons are 28px section actions
  // (§4.87), sized against the 22px badge they sit beside rather than against
  // the 32px grid — the same clause `.ff-btn-sm` above is listed under.
  ".ff-matrix-cell-add",
  ".ff-matrix-cell-menu",
  // The Board column's `+`, same clause and same 28px. Component 13 §6 measured
  // the reference at an 18px glyph in a 28px background, which is where the
  // number came from before §4.87 was consulted — the two agreed.
  ".tm-column-add",
  ".tm-column-menu",
  // The column's title, which doubles as the rename control — drawn as the
  // heading it replaces, so it is measured as one. The input it opens is NOT
  // listed: that one is a control and sits on the 32px grid.
  ".tm-column-rename",
  // A group heading inside a box. It is a button only because it collapses;
  // what it draws is a label and a count, so it is content like `.motion-task-row`.
  ".ff-matrix-group-head",
  // The Board column's "완료" group, which is the same thing one screen over:
  // a heading and a count that happen to collapse, and the link that asks for
  // the rest of them.
  ".tm-column-done-head",
  ".tm-column-done-more",
];

interface Offender {
  cls: string;
  height: number;
  where: "navigation" | "control";
}

/**
 * Every control on screen, bucketed by which grid it belongs to.
 *
 * A control inside the Context Sidebar is a navigation row; the same element
 * in Main is a control. That is the whole distinction §4.86 draws, so the
 * measurement has to draw it too rather than collecting one flat set.
 */
async function offGrid(page: Page, allowed: string[]): Promise<Offender[]> {
  return page.evaluate((allowList) => {
    const NAV = 36;
    const CONTROL = 32;
    const CREATE = 32;
    const SECTION_ACTION = 28;
    const found = new Map<string, { cls: string; height: number; where: "navigation" | "control" }>();
    const selector = 'button, input:not([type="checkbox"]):not([type="radio"]), select, [role="button"]';
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const box = el.getBoundingClientRect();
      if (box.height < 12 || box.width < 24) continue;
      if ((allowList as string[]).some((sel) => el.closest(sel))) continue;
      const height = Math.round(box.height);
      const inSidebar = !!el.closest(".tm-sidebar, .space-sidebar");
      const allowedHeights = inSidebar ? [NAV, CREATE, SECTION_ACTION] : [CONTROL];
      if (allowedHeights.includes(height)) continue;
      const cls = String((el as HTMLElement).className ?? "").trim().split(/\s+/)[0] || el.tagName.toLowerCase();
      found.set(`${cls}|${height}`, { cls, height, where: inSidebar ? "navigation" : "control" });
    }
    return Array.from(found.values());
  }, allowed);
}

test.describe("the vertical rhythm (§4.86, §11.2)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the coarse-pointer floor is §15.12's, and navShell already holds it");

  test("navigation rows are 36 and controls are 32, on both shells", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    const field = page.getByRole("textbox", { name: "Add a task" });
    await field.fill("Measure the rows");
    await field.press("Enter");
    await expect(page.getByRole("button", { name: "Open Measure the rows" })).toBeVisible();

    for (const route of ["/today", "/calendar", "/focus", "/board", "/planning", "/settings", `/list/${LIST.id}`]) {
      await page.goto(route);
      await expect(page.locator(".global-rail")).toBeVisible();

      expect(await offGrid(page, ALLOWED_OFF_GRID), `${route} draws a control off the grid`).toEqual([]);
    }
  });

  test("40px belongs to the Rail and to nothing else", async ({ page }) => {
    await openApp(page, { lists: [LIST] });

    for (const route of ["/today", "/calendar", `/list/${LIST.id}`]) {
      await page.goto(route);
      await expect(page.locator(".global-rail")).toBeVisible();

      const strays = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll("button, [role='button'], a"))) {
          const box = el.getBoundingClientRect();
          if (Math.round(box.height) !== 40 || box.width < 24) continue;
          if (el.closest(".rail-item")) continue;
          out.push(String((el as HTMLElement).className ?? "").trim() || el.tagName.toLowerCase());
        }
        return out;
      });
      expect(strays, `${route} has a 40px control outside the Rail`).toEqual([]);
    }
  });
});
