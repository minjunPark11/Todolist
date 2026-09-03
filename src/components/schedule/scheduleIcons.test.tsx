// @vitest-environment jsdom
//
// The Schedule Editor's icons are drawings, not text
// (TASK_DETAIL_SCHEDULE_BODY_DESIGN.md G1).
//
// An emoji here failed three ways at once: the glyph was the operating
// system's rather than one this app chose, the colour was the font's so it
// could not dim with a disabled row, and the size was the type scale's so the
// density layer moved it. What pins the fix is not "there are SVGs" — it is
// that nothing in this editor renders as a character the platform draws.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_SCHEDULE } from "../../domain/schedule";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { ScheduleEditor } from "./ScheduleEditor";

afterEach(cleanup);

/** Anything in the pictographic planes, which is what an OS draws for itself. */
const PICTOGRAPHS = /\p{Extended_Pictographic}/u;

function setup() {
  const { container } = render(
    <I18nProvider lang="en">
      {/* The 알림 and 반복 rows hang their lists off the layer system now
          (SCHEDULE_TIME_FIELD_DESIGN.md §4.1), so the editor needs the
          provider its own popover already gives it in the app. */}
      <FloatingLayerProvider>
        <ScheduleEditor
          taskId="t1"
          locale="en-US"
          schedule={EMPTY_SCHEDULE}
          today="2026-08-29"
          onCommit={() => []}
          onClose={() => {}}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return container;
}

describe("the schedule editor's icons", () => {
  it("draws every quick date rather than spelling it in emoji", () => {
    const container = setup();
    const quick = Array.from(container.querySelectorAll(".sched-quick-item"));
    expect(quick).toHaveLength(4);
    for (const button of quick) {
      expect(button.querySelector(".sched-quick-icon svg"), button.textContent ?? "").toBeTruthy();
    }
  });

  it("draws the three summary rows too", () => {
    const container = setup();
    const rows = Array.from(container.querySelectorAll(".sched-row"));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.querySelector(".sched-row-icon svg")).toBeTruthy();
    }
  });

  it("has no pictographic character anywhere in it", () => {
    const container = setup();
    // The chevron `›` and the labels are fine — they are letters and marks the
    // app's own font renders. What must not be here is a glyph the platform
    // substitutes its own picture for.
    expect(PICTOGRAPHS.test(container.textContent ?? "")).toBe(false);
  });

  it("lets the icons take the colour of whatever they sit in", () => {
    // The reason the emoji had to go: a disabled row dims its text, and an
    // emoji stayed bright inside it. `currentColor` is what makes the icon
    // part of the row rather than a sticker on it.
    const container = setup();
    const strokes = Array.from(container.querySelectorAll(".sched-row-icon svg [stroke]"));
    expect(strokes.length).toBeGreaterThan(0);
    for (const path of strokes) {
      expect(path.getAttribute("stroke")).toBe("currentColor");
    }
  });

  it("says '7' in the +7 icon, because that is the whole meaning of it", () => {
    const container = setup();
    const plus7 = container.querySelectorAll(".sched-quick-item")[2];
    expect(plus7.querySelector("svg text")?.textContent).toBe("7");
  });
});
