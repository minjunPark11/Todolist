// @vitest-environment jsdom
//
// 사용자 지정 알림 (SCHEDULE_TIME_FIELD_DESIGN.md §6, §10).
//
// Two things are being pinned. First that the four units land on the model
// that already exists — §6.1 claims no new field is needed, and this is where
// that claim is either true or not. Second that the preview says the same
// moment the list's brackets do, which §6.4 asks for because a form doing its
// own arithmetic is how one reminder ends up described two ways.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_SCHEDULE, reminderMoment, type Schedule } from "../../domain/schedule";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { ReminderCustom } from "./ReminderCustom";

afterEach(cleanup);

const ALL_DAY: Schedule = { ...EMPTY_SCHEDULE, dueDate: "2026-09-03" };
const TIMED: Schedule = { ...ALL_DAY, startTime: "20:00" };

function setup(draft: Schedule = ALL_DAY) {
  const onAdd = vi.fn();
  const onCancel = vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <ReminderCustom draft={draft} locale="en-US" onAdd={onAdd} onCancel={onCancel} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onAdd, onCancel, user: userEvent.setup() };
}

async function choose(user: ReturnType<typeof userEvent.setup>, unit: string, count: string) {
  await user.selectOptions(screen.getByLabelText("Unit"), unit);
  const field = screen.getByLabelText("How many");
  await user.clear(field);
  await user.type(field, count);
}

describe("사용자 지정 (§6.1)", () => {
  // §6.11's rule, and it is not cosmetic: `reconcileReminders` drops a minute
  // reminder on an all-day Task, so offering one here would accept a choice,
  // preview it, and lose it on the next edit.
  it("offers only 일 and 주 on an all-day task", () => {
    setup(ALL_DAY);
    const units = [...screen.getByLabelText<HTMLSelectElement>("Unit").options].map((o) => o.value);
    expect(units).toEqual(["day", "week"]);
  });

  it("offers all four once the task has a time", () => {
    setup(TIMED);
    const units = [...screen.getByLabelText<HTMLSelectElement>("Unit").options].map((o) => o.value);
    expect(units).toEqual(["minute", "hour", "day", "week"]);
  });

  it("turns a unit and a count into the model that already exists", async () => {
    const { onAdd, user } = setup();
    await choose(user, "day", "2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // §10's row: 일 × 2 + 09:00.
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "relative", offsetMinutes: 2880, allDayTime: "09:00" }),
    );
  });

  it("counts a week as seven days, which is all `reminderMoment` needs", async () => {
    const { onAdd, user } = setup();
    await choose(user, "week", "1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ offsetMinutes: 10080 }));
    // Same weekday, by arithmetic rather than by a rule.
    const spec = onAdd.mock.calls[0][0];
    expect(reminderMoment(spec, ALL_DAY)?.date).toBe("2026-08-27");
  });

  // §6.2, and it is the same distinction as `allDayTime === null`, so the form
  // and the data cannot disagree about it.
  it("asks for an hour on 일 and 주, and not on 분 and 시간", async () => {
    const { user } = setup(TIMED);
    expect(screen.queryByLabelText("Remind me at")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Unit"), "day");
    expect(screen.getByLabelText("Remind me at")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Unit"), "hour");
    expect(screen.queryByLabelText("Remind me at")).toBeNull();
  });

  it("leaves a minute reminder counting back from the task's own time", async () => {
    const { onAdd, user } = setup(TIMED);
    await choose(user, "minute", "30");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const spec = onAdd.mock.calls[0][0];
    expect(spec.allDayTime).toBeNull();
    expect(reminderMoment(spec, TIMED)).toEqual({ date: "2026-09-03", time: "19:30" });
  });
});

describe("the preview (§6.4)", () => {
  it("says the moment `reminderMoment` says", async () => {
    const { user } = setup(TIMED);
    await choose(user, "minute", "30");

    const preview = screen.getByText(/30 minutes early/);
    // 20:00 on Sep 3, minus thirty minutes.
    expect(preview.textContent).toContain("7:30 PM");
    expect(preview.textContent).toContain("Sep 3");
  });

  it("writes one of something in the singular", async () => {
    const { user } = setup(TIMED);
    await choose(user, "hour", "1");
    expect(screen.getByText(/1 hour early/)).toBeTruthy();
  });

  // §6.4: the disabled row said this by being dead. The form says it.
  it("names the missing date instead of going quiet", async () => {
    const { user } = setup(EMPTY_SCHEDULE);
    await choose(user, "day", "1");
    expect(screen.getByText(/Pick a date first/)).toBeTruthy();
  });

  it("refuses a count that is not a whole number of anything", async () => {
    const { user } = setup(TIMED);
    await user.clear(screen.getByLabelText("How many"));
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/whole number/)).toBeTruthy();
  });
});

describe("Save and Cancel (§5)", () => {
  it("keeps them, because this one has a middle state", async () => {
    const { onAdd, onCancel, user } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
