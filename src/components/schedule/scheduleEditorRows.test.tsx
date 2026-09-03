// @vitest-environment jsdom
//
// 시간 · 알림 · 반복 answer where they are asked
// (SCHEDULE_TIME_FIELD_DESIGN.md §4, §10).
//
// The claim under test is not "a list appears" — it is that the CALENDAR is
// still there while it does. §2.15's subpanels wiped the grid away to ask for
// an hour, and §4.1 is the reversal of exactly that.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_SCHEDULE, type Schedule } from "../../domain/schedule";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { ScheduleEditor } from "./ScheduleEditor";

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
