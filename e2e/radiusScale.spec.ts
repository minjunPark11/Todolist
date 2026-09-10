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
 * V-4 moved it into the Rail and the AI feature it opened has since been
 * removed, so there is nothing to exempt.
 */
// Matched with `closest` rather than against the element’s own class list:
// several of these paint their shape onto an unclassed child, and a check that
// only read the element it landed on would report that child as an offender.
const ALLOWED_OFF_SCALE = [
  ".ff-toggle", // a switch uses a pill track and circular thumb to express its two positions
  ".gcal-col-date", // a calendar day is a circle wherever this idiom appears (V-Q3)
  ".gcal-mini-day", // the same idiom, in the mini month
  ".gcal-cat-badge", // §11.2 keeps the pill for badges and counts
  ".gcal-now-badge",
  ".gcal-taskpanel-rail-badge",
  ".foc-group-title small", // the count beside a Focus group, same pill
  ".ff-board-count", // and the one on a Matrix quadrant
  ".ff-matrix-roman", // the quadrant's numeral, the same pill as the count beside it
  ".ff-projbadge", // §11.2's pill again, this time carrying a Project's name
  // The Focus anchor: the one line that says what the clock is measuring. A pill
  // because I1 kept `--radius-pill` as a SHAPE rather than a corner, and this is
  // that shape doing what it does everywhere else here — naming one thing.
  ".focus-anchor",
  ".ff-check", // a completion control is a circle; 6px on 22px is a different control
  ".ff-color-swatch", // a colour is a dot, not a control
  ".tm-swatch", // the same dot, in the Add List dialog
  ".tm-tag-chip", // a tag is a badge — §11.2's pill again, beside the ones above
  ".tm-tag-add", // and the button that adds one has to be the shape it adds
  '[class*="tm-preview-"]', // a thumbnail of a layout, drawn at a fraction of the size
];

/**
 * 이행 중인 스케일 (SWISS_MINIMAL_DESIGN.md I1-B).
 *
 * 목적지는 `[4]` 하나다 — 8/10/12는 세 개의 값이 아니라 세 개의 '거의 같은'
 * 값이었고, 스위스는 그것을 하나로 접는다. 6은 애초에 §11.39가 세운 다섯 중
 * 하나였다.
 *
 * 이행 중에는 `[4, 6, 8, 10, 12]`였다 — 토큰을 부르는 자리는 먼저 4로 왔고 리터럴을
 * 박은 자리는 옛 값에 남아 있었으므로, 그때 좁혔다면 아직 손대지 않은 파일이 이 스펙을
 * 빨갛게 만들었을 것이다. 잘못된 것을 잡는 게 아니라 순서를 잡는 실패였을 것이다.
 *
 * `src/styles/scale.test.ts`의 CEILING이 비었으므로 약속대로 좁혔다. 그 테스트는
 * 선언을 읽고 이 스펙은 화면을 재므로 둘은 여전히 중복이 아니다 — 위 헤더가 말하듯
 * grep은 덮어쓰인 규칙을 못 본다.
 */
const SCALE = [4];

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

/**
 * A task, and a tag on it.
 *
 * The tag matters: the two pill entries in the allow list above are for shapes
 * this spec could not see, because an account with no tags draws no chip and
 * no `+` — the exceptions were being written for something the sweep never
 * reached. `#` in the quick add attaches one as the title is typed
 * (`splitInlineTags`), so it costs a token rather than a fixture.
 */
async function addTask(page: Page, title: string): Promise<void> {
  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill(`${title} #radius`);
  await field.press("Enter");
  await expect(page.getByRole("button", { name: `Open ${title}` })).toBeVisible();
  await expect(page.locator(".tm-tag-chip").first()).toBeVisible();
}

/**
 * An exception is a line that stops the sweep looking, so each one is paired
 * with a measurement that does.
 *
 * Without this, `.tm-tag-chip` could quietly become a 6px rectangle and the
 * spec would stay green — the allow list would be saying "do not look" where
 * it was meant to say "this one is a pill".
 */
async function expectPill(page: Page, selector: string): Promise<void> {
  const shape = await page.locator(selector).first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { radius: parseFloat(style.borderTopLeftRadius), height: el.getBoundingClientRect().height };
  });
  expect(shape.height, `${selector} has a height to measure`).toBeGreaterThan(0);
  expect(shape.radius, `${selector} is a pill`).toBeGreaterThanOrEqual(shape.height / 2);
}

test.describe("the radius scale (§11.39)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop presentation is where all five languages are on screen");

  test("every shape wider than a decoration is on the scale", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Measure the corners");

    for (const route of ["/today", "/calendar", "/focus", "/board", "/planning", "/settings", `/list/${LIST.id}`]) {
      await page.goto(route);
      await expect(page.locator(".global-rail")).toBeVisible();

      const offenders = await offScaleShapes(page, SCALE, ALLOWED_OFF_SCALE);
      expect(offenders, `${route} draws a shape outside {${SCALE.join(", ")}}`).toEqual([]);
    }
  });

  test("settings switches retain their pill track and circular thumb", async ({ page }) => {
    await openApp(page);
    await page.goto("/settings");
    await expectPill(page, ".ff-toggle");
    const thumb = page.locator(".ff-toggle-knob").first();
    await expect(thumb).toHaveCSS("border-radius", "50%");
    const box = await thumb.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(box!.height);
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

    // The other half of the two entries added to the allow list: the Detail is
    // where both are on screen at once.
    await expectPill(page, ".tm-drawer-tags .tm-tag-chip");
    await expectPill(page, ".tm-tag-add");

    await page.keyboard.press("Control+k");
    await expect(page.locator(".cmd-menu")).toBeVisible();
    expect(await offScaleShapes(page, SCALE, ALLOWED_OFF_SCALE), "the Command Menu").toEqual([]);
  });
});
