// @vitest-environment jsdom
//
// 시간 · 알림 · 반복 answer where they are asked
// (SCHEDULE_TIME_FIELD_DESIGN.md §4, §10).
//
// The claim under test is not "a list appears" — it is that the CALENDAR is
// still there while it does. §2.15's subpanels wiped the grid away to ask for
// an hour, and §4.1 is the reversal of exactly that.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_SCHEDULE, type Schedule } from "../../domain/schedule";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { ScheduleEditor } from "./ScheduleEditor";

/**
 * The wall clock, frozen — and it has to be.
 *
 * `ScheduleEditor.openTime` fills an EMPTY start with `nextWholeHour(now)`
 * (§3.3), which is the one place in that component that reads a clock. So what
 * this file sees when it opens 시간 depends on the hour the suite is run in,
 * and two of the tests below choose `1:00 PM` — the suggestion between 12:01
 * and 13:00, where "choose a time" stops being a change at all.
 *
 * [실측] It broke exactly there: at 11:53 the field opened on `12:00` and the
 * file passed; at 12:13 it opened on `1:00 PM`, the option came back already
 * selected, and both tests failed. 09:20 is an hour with no meaning to any
 * test here, which is the point — the suggestion is `10:00` and nothing
 * chooses it.
 *
 * `toFake: ["Date"]` and nothing else. Faking the timers would take
 * `setTimeout` with them, and `userEvent` schedules its own.
 */
const FROZEN = new Date("2026-09-03T09:20:00");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TODAY = "2026-09-03";
const DATED: Schedule = { ...EMPTY_SCHEDULE, dueDate: TODAY };

function setup(schedule: Schedule = DATED) {
  const onCommit = vi.fn(() => []);
  const onClose = vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <ScheduleEditor
          taskId="t1"
          locale="en-US"
          schedule={schedule}
          today={TODAY}
          onCommit={onCommit}
          onClose={onClose}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onCommit, onClose, user: userEvent.setup() };
}

const calendar = () => document.querySelector(".sched-cal");
const row = (name: RegExp) => screen.getByRole("button", { name });
/**
 * An option by the time it carries, not by the text it shows.
 *
 * The chosen option draws a `✓` inside itself, so an exact match on
 * `textContent` finds NOTHING precisely when the value looked for is the one
 * already in the field — and `find` returning `undefined` then reads as "the
 * click did nothing" rather than as "the lookup missed". `data-time` is on
 * every option for this, and it is the stored value rather than the locale's
 * rendering of it.
 */
const timeOption = (time: string) => {
  const found = screen.getAllByRole("option").find((option) => option.dataset.time === time);
  if (!found) throw new Error(`no time option for ${time}`);
  return found;
};

describe("the three rows open in place (§4.1)", () => {
  it("keeps the calendar while 시간 is open", async () => {
    const { user } = setup();
    expect(calendar()).toBeTruthy();

    await user.click(row(/^Time/));

    expect(calendar()).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Starts" })).toBeTruthy();
    // The screen it used to be: a title and a way back.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("keeps the calendar while 알림 is open", async () => {
    const { user } = setup();
    await user.click(row(/^Reminder/));

    expect(calendar()).toBeTruthy();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  // §4.3: the user asked for two, and 반복 came along so that three rows that
  // look alike do not behave in two different ways.
  it("keeps the calendar while 반복 is open", async () => {
    const { user } = setup();
    await user.click(row(/^Repeat/));

    expect(calendar()).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Repeat" })).toBeTruthy();
  });

  it("says which rows are open, which is what turns the chevron", async () => {
    const { user } = setup();
    const repeat = row(/^Repeat/);
    expect(repeat.getAttribute("aria-expanded")).toBe("false");

    await user.click(repeat);
    expect(screen.getByRole("button", { name: /^Repeat/ }).getAttribute("aria-expanded")).toBe("true");
  });

  // None of the three qualifies anything until there is a date to qualify
  // (INV-03, INV-06, INV-07).
  it("offers none of them without a date", () => {
    setup(EMPTY_SCHEDULE);
    expect(row(/^Time/)).toHaveProperty("disabled", true);
    expect(row(/^Reminder/)).toHaveProperty("disabled", true);
    expect(row(/^Repeat/)).toHaveProperty("disabled", true);
  });
});

describe("the clock fills an empty start, and only an empty one (§3.3)", () => {
  it("opens on the whole hour after now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 19, 15));
    setup();

    // `fireEvent`, not `userEvent`: the latter schedules its own delays on the
    // timers this test has just frozen.
    fireEvent.click(row(/^Time/));

    expect(screen.getByRole("combobox", { name: "Starts" })).toHaveProperty("value", "8:00 PM");
  });

  it("leaves a time that is already there alone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 19, 15));
    setup({ ...DATED, startTime: "13:00" });

    fireEvent.click(row(/^Time/));

    // The line between a suggestion and a value that moves with the clock:
    // reopening this editor an hour later must not shift what was chosen.
    expect(screen.getByRole("combobox", { name: "Starts" })).toHaveProperty("value", "1:00 PM");
  });
});

describe("Escape peels one layer at a time (§4.2)", () => {
  it("closes the time list and leaves the field", async () => {
    const { user } = setup();
    await user.click(row(/^Time/));
    const field = screen.getByRole("combobox", { name: "Starts" });
    expect(screen.getAllByRole("listbox").length).toBe(1);

    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryAllByRole("listbox")).toHaveLength(0);
    expect(screen.getByRole("combobox", { name: "Starts" })).toBeTruthy();
  });

  it("closes the field on the next Escape, and the editor stays", async () => {
    const { user, onClose } = setup();
    await user.click(row(/^Time/));
    const field = screen.getByRole("combobox", { name: "Starts" });

    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByRole("combobox", { name: "Starts" })).toBeNull();
    expect(row(/^Time/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// SCHEDULE_TIME_FIELD_DESIGN.md §13. Three asks that are one behaviour: a time
// you choose is a time you are finished choosing.
describe("choosing a time is the end of it (§13.2)", () => {
  it("folds the row and writes what was chosen", async () => {
    const { user } = setup();
    await user.click(row(/^Time/));

    await user.click(timeOption("13:00"));

    // The field is gone: the row is a summary again, and the summary is the
    // value. Before §13.2 the field stayed open and grew a second one.
    expect(screen.queryByRole("combobox", { name: "Starts" })).toBeNull();
    expect(row(/1:00 PM/)).toBeTruthy();
  });

  it("asks no second question — no 종료 field appears", async () => {
    const { user } = setup();
    await user.click(row(/^Time/));

    await user.click(timeOption("13:00"));
    // ...and not even after reopening the row: an end is drawn only where one
    // already exists (D1-B).
    await user.click(row(/1:00 PM/));

    expect(screen.getByRole("combobox", { name: "Starts" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Ends" })).toBeNull();
  });

  it("keeps an end that is already there editable", async () => {
    const { user } = setup({ ...DATED, startTime: "09:00", endTime: "17:00" });
    await user.click(row(/9:00 AM/));

    expect(screen.getByRole("combobox", { name: "Ends" })).toHaveProperty("value", "5:00 PM");
  });

  it("draws none of the four preset times (§13.1)", async () => {
    const { user } = setup();
    await user.click(row(/^Time/));

    expect(document.querySelector(".sched-time-presets")).toBeNull();
    expect(screen.queryByRole("button", { name: "9:00 AM" })).toBeNull();
  });
});

// §13.3. The stylesheet paints the colour; what this file can hold is which
// rows are told they have an answer in them.
describe("a row the reader has answered says so (§13.3)", () => {
  const isSet = (name: RegExp) => row(name).className.includes("is-set");

  it("marks none of the three on an empty schedule", () => {
    setup();
    expect(isSet(/^Time/)).toBe(false);
    expect(isSet(/^Reminder/)).toBe(false);
    expect(isSet(/^Repeat/)).toBe(false);
  });

  it("marks the time once there is one", () => {
    setup({ ...DATED, startTime: "13:00" });
    expect(isSet(/1:00 PM/)).toBe(true);
    expect(isSet(/^Reminder/)).toBe(false);
  });

  it("marks the reminder once one is set", () => {
    setup({ ...DATED, reminders: [{ type: "relative", offsetMinutes: 0, absoluteAt: null, allDayTime: null, enabled: true }] });
    expect(isSet(/^Reminder/)).toBe(true);
  });

  it("marks the repeat, but not for `없음`", () => {
    setup({ ...DATED, repeat: "weekly" });
    expect(isSet(/^Repeat/)).toBe(true);

    cleanup();
    setup({ ...DATED, repeat: "none" });
    expect(isSet(/^Repeat/)).toBe(false);
  });
});
