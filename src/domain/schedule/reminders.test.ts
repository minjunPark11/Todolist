import { describe, expect, it } from "vitest";
import {
  absoluteSpec,
  ALL_DAY_OFFERS,
  ALL_DAY_REMINDER_TIME,
  addReminder,
  containsReminder,
  offersFor,
  reconcileReminders,
  reminderMoment,
  sortReminders,
  specFromOffer,
  TIMED_OFFERS,
  toggleReminder,
} from "./reminders";
import { presetToSpec } from "./reminder";
import { EMPTY_SCHEDULE, type Schedule } from "./types";

function schedule(over: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, dueDate: "2026-08-20", ...over };
}

const timed = schedule({ startTime: "15:00" });
const allDay = schedule();

const AT_TIME = specFromOffer(TIMED_OFFERS[0]);
const TEN_MINUTES = specFromOffer(TIMED_OFFERS[1]);
const ONE_HOUR = specFromOffer(TIMED_OFFERS[2]);
const DAY_BEFORE = specFromOffer(TIMED_OFFERS[3]);
const ON_DAY = specFromOffer(ALL_DAY_OFFERS[0]);
const WEEK_BEFORE = specFromOffer(ALL_DAY_OFFERS[3]);

describe("what is offered (§6.6, §6.11)", () => {
  it("gives an all-day Task different units, not the timed list filtered", () => {
    // The old panel offered "10 minutes before" on an all-day Task and
    // resolved it against an hour the Task did not have.
    expect(offersFor(timed).map((offer) => offer.id)).toEqual(["at-time", "10m", "1h", "1d-9am"]);
    expect(offersFor(allDay).map((offer) => offer.id)).toEqual(["on-day", "1d-9am", "2d", "1w"]);
  });
});

describe("when a reminder falls (§6.8, §6.12)", () => {
  it("counts back from the start of the schedule", () => {
    expect(reminderMoment(AT_TIME, timed)).toEqual({ date: "2026-08-20", time: "15:00" });
    expect(reminderMoment(ONE_HOUR, timed)).toEqual({ date: "2026-08-20", time: "14:00" });
  });

  it("rolls the date when the offset crosses midnight", () => {
    expect(reminderMoment(ONE_HOUR, schedule({ startTime: "00:30" }))).toEqual({
      date: "2026-08-19",
      time: "23:30",
    });
  });

  it("anchors on the range's start and not its deadline", () => {
    // A reminder is a nudge to begin; firing at the end would be a notice
    // about something already over.
    const range = schedule({ startDate: "2026-08-18", dueDate: "2026-08-20", startTime: "09:00" });
    expect(reminderMoment(AT_TIME, range)?.date).toBe("2026-08-18");
  });

  it("gives a day-based reminder the hour it names, not the Task's (§6.12)", () => {
    // The case an offset alone gets wrong: 1440 minutes before a 22:00 Task is
    // 22:00 the day before, which is not "the morning before".
    const late = schedule({ startTime: "22:00" });
    expect(reminderMoment(DAY_BEFORE, late)).toEqual({
      date: "2026-08-19",
      time: ALL_DAY_REMINDER_TIME,
    });
  });

  it("gives an absolute reminder its own moment, whatever the schedule says", () => {
    const spec = absoluteSpec("2026-09-01T07:30");
    expect(reminderMoment(spec, timed)).toEqual({ date: "2026-09-01", time: "07:30" });
    // §6.27: the Task moving does not move this.
    expect(reminderMoment(spec, schedule({ dueDate: "2027-01-01" }))).toEqual({
      date: "2026-09-01",
      time: "07:30",
    });
  });

  it("answers null when there is no date to count back from", () => {
    expect(reminderMoment(ONE_HOUR, EMPTY_SCHEDULE)).toBeNull();
  });
});

describe("the list (§6.15–§6.19)", () => {
  it("holds several", () => {
    const list = addReminder(addReminder([], ONE_HOUR), TEN_MINUTES);
    expect(list).toHaveLength(2);
  });

  it("refuses a second copy of the same one (§6.16)", () => {
    const list = addReminder(addReminder([], ONE_HOUR), { ...ONE_HOUR });
    expect(list).toHaveLength(1);
  });

  it("tells two different absolute moments apart", () => {
    const list = addReminder(addReminder([], absoluteSpec("2026-09-01T07:30")), absoluteSpec("2026-09-02T07:30"));
    expect(list).toHaveLength(2);
  });

  it("toggles the same one back off (§6.19)", () => {
    expect(toggleReminder(toggleReminder([], ONE_HOUR), ONE_HOUR)).toEqual([]);
  });

  it("puts the earliest first (§6.49)", () => {
    const list = [AT_TIME, DAY_BEFORE, ONE_HOUR];
    expect(sortReminders(list, timed)).toEqual([DAY_BEFORE, ONE_HOUR, AT_TIME]);
  });
});

describe("what survives a schedule change (§6.26–§6.33)", () => {
  it("leaves an offset alone when the Task simply moves (§6.26)", () => {
    // The offset is the stored thing, so following the Task is what NOT
    // touching it does.
    const moved = schedule({ dueDate: "2026-09-05", startTime: "13:00" });
    expect(reconcileReminders([ONE_HOUR], moved)).toEqual([ONE_HOUR]);
    expect(reminderMoment(ONE_HOUR, moved)).toEqual({ date: "2026-09-05", time: "12:00" });
  });

  it("drops everything when the date goes (§6.30, §6.31)", () => {
    // Absolute ones too: V1 chooses predictable over clever, because a
    // reminder on a Task with no date is a thing the app has no screen for.
    expect(reconcileReminders([ONE_HOUR, absoluteSpec("2026-09-01T07:30")], EMPTY_SCHEDULE)).toEqual([]);
  });

  it("drops minute reminders when the Task becomes all-day (§6.33)", () => {
    expect(reconcileReminders([AT_TIME, TEN_MINUTES, ONE_HOUR], allDay)).toEqual([]);
  });

  it("keeps a day-based reminder across that conversion, with an hour to land on", () => {
    const [kept] = reconcileReminders([DAY_BEFORE], allDay);
    expect(kept.offsetMinutes).toBe(1440);
    expect(kept.allDayTime).toBe(ALL_DAY_REMINDER_TIME);
  });

  it("keeps the hour a day-based reminder names when the Task is timed", () => {
    // §6.32 asks for the opposite and this app cannot give it: `1d-9am` is one
    // of the TIMED offers too, stored the same way, so stripping the hour here
    // would rewrite the row the reader had just ticked and show it unticked.
    // Reproduced in the browser before this test existed.
    const [kept] = reconcileReminders([DAY_BEFORE], timed);
    expect(kept).toEqual(DAY_BEFORE);
    expect(reminderMoment(kept, timed)).toEqual({ date: "2026-08-19", time: ALL_DAY_REMINDER_TIME });
  });

  it("does not let a conversion produce two rows that mean the same thing", () => {
    // Two day-based reminders that differ only in the hour they name are two
    // reminders; two that agree are one. §6.16 has to hold after a reconcile
    // and not only after an add.
    expect(reconcileReminders([DAY_BEFORE, { ...DAY_BEFORE }], timed)).toHaveLength(1);
  });

  it("leaves an absolute reminder untouched while the Task still has a date (§6.27)", () => {
    const spec = absoluteSpec("2026-09-01T07:30");
    expect(reconcileReminders([spec], schedule({ dueDate: "2026-12-25" }))).toEqual([spec]);
  });

  it("keeps a week-before reminder on an all-day Task", () => {
    expect(reconcileReminders([WEEK_BEFORE], allDay)).toEqual([WEEK_BEFORE]);
  });
});

describe("the retired preset (§6.3)", () => {
  it("becomes the reminder it always meant", () => {
    expect(presetToSpec("1h")).toEqual(ONE_HOUR);
    expect(presetToSpec("at-time")).toEqual(AT_TIME);
    // The one that needed §6.12's extra field.
    expect(presetToSpec("1d-9am")).toEqual(DAY_BEFORE);
  });

  it("reads none, absent and junk as no reminder", () => {
    expect(presetToSpec("none")).toBeNull();
    expect(presetToSpec(undefined)).toBeNull();
    expect(presetToSpec("2 fortnights")).toBeNull();
  });

  it("fires a migrated reminder at exactly the moment it used to", () => {
    // The migration is worthless if it moves anyone's reminders. 22:00 is the
    // case the old code special-cased, so it is the one worth pinning.
    const late = schedule({ startTime: "22:00" });
    expect(reminderMoment(presetToSpec("1d-9am")!, late)).toEqual({ date: "2026-08-19", time: "09:00" });
    expect(reminderMoment(presetToSpec("10m")!, late)).toEqual({ date: "2026-08-20", time: "21:50" });
  });
});

describe("containsReminder", () => {
  it("compares meaning and not identity", () => {
    expect(containsReminder([ONE_HOUR], { ...ONE_HOUR })).toBe(true);
    expect(containsReminder([ONE_HOUR], TEN_MINUTES)).toBe(false);
  });
});
