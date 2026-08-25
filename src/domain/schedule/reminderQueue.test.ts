import { describe, expect, it } from "vitest";
import { keyMoment, pruneSeen, reminderKey, sweepReminders, type ReminderTaskSource } from "./reminderQueue";
import { specFromOffer, TIMED_OFFERS } from "./reminders";

const NOW = { date: "2026-08-19", time: "18:00" };

const AT_TIME = specFromOffer(TIMED_OFFERS[0]);
const TEN_MINUTES = specFromOffer(TIMED_OFFERS[1]);
const ONE_HOUR = specFromOffer(TIMED_OFFERS[2]);

function task(overrides: Partial<ReminderTaskSource> = {}): ReminderTaskSource {
  return {
    id: "t1",
    title: "분기 보고서 정리",
    dueDate: "2026-08-19",
    startTime: "18:00",
    reminders: [AT_TIME],
    ...overrides,
  };
}

describe("sweepReminders", () => {
  it("fires a reminder whose moment has arrived", () => {
    const { due } = sweepReminders([task()], NOW, new Set());
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ taskId: "t1", title: "분기 보고서 정리" });
  });

  it("says nothing about a reminder still in the future", () => {
    const { due, expired } = sweepReminders([task({ startTime: "18:30" })], NOW, new Set());
    expect(due).toEqual([]);
    expect(expired).toEqual([]);
  });

  it("ignores a task with no reminder set", () => {
    expect(sweepReminders([task({ reminders: [] })], NOW, new Set()).due).toEqual([]);
  });

  it("fires every reminder a Task has, not just one (§6.15)", () => {
    // The reason the sweep is a loop now. A Task reminded at the time AND ten
    // minutes before is two firings, and the moment is in the key, so they do
    // not collapse into each other.
    const both = task({ startTime: "18:10", reminders: [AT_TIME, TEN_MINUTES] });
    const { due } = sweepReminders([both], NOW, new Set());
    expect(due.map((entry) => entry.at.time)).toEqual(["18:00"]);

    const later = sweepReminders([both], { date: "2026-08-19", time: "18:10" }, new Set());
    expect(later.due.map((entry) => entry.at.time).sort()).toEqual(["18:00", "18:10"]);
  });

  it("leaves a disabled reminder unsent and unrecorded (§6.40)", () => {
    const off = task({ reminders: [{ ...AT_TIME, enabled: false }] });
    const { due, expired } = sweepReminders([off], NOW, new Set());
    expect(due).toEqual([]);
    expect(expired).toEqual([]);
  });

  // The point of the `seen` set: a thirty-second tick must not re-announce the
  // same moment two thousand times a day.
  it("does not fire the same moment twice", () => {
    const first = sweepReminders([task()], NOW, new Set());
    const seen = new Set(first.due.map((entry) => entry.key));
    expect(sweepReminders([task()], NOW, seen).due).toEqual([]);
  });

  // Reopening a laptop must not dump a week of notifications.
  it("buries a reminder that came due long ago instead of firing it", () => {
    const { due, expired } = sweepReminders([task({ dueDate: "2026-08-12" })], NOW, new Set());
    expect(due).toEqual([]);
    expect(expired).toEqual([reminderKey("t1", { date: "2026-08-12", time: "18:00" })]);
  });

  it("still fires one that is only a little late", () => {
    expect(sweepReminders([task({ startTime: "17:45" })], NOW, new Set()).due).toHaveLength(1);
  });

  it("respects the grace window it is given", () => {
    const late = [task({ startTime: "17:45" })];
    expect(sweepReminders(late, NOW, new Set(), 10).due).toEqual([]);
    expect(sweepReminders(late, NOW, new Set(), 10).expired).toHaveLength(1);
  });

  // The schedule stays on the record when a task is finished, so the silence
  // has to come from here.
  it("says nothing about a task that is done, archived or deleted", () => {
    for (const dead of [{ status: "done" }, { status: "archived" }, { archivedAt: "x" }, { deletedAt: "x" }]) {
      expect(sweepReminders([task(dead)], NOW, new Set()).due).toEqual([]);
    }
  });

  // Rescheduling has to produce a new firing, or a task moved to a later time
  // would be silent because its old time already fired.
  it("fires again when the task is moved to a new time", () => {
    const seen = new Set([reminderKey("t1", { date: "2026-08-19", time: "18:00" })]);
    const moved = task({ startTime: "17:55" });
    expect(sweepReminders([moved], NOW, seen).due).toHaveLength(1);
  });

  it("resolves an offset rather than the schedule's own time", () => {
    const { due } = sweepReminders([task({ startTime: "19:00", reminders: [ONE_HOUR] })], NOW, new Set());
    expect(due[0].at).toEqual({ date: "2026-08-19", time: "18:00" });
  });
});

describe("reminderKey / keyMoment", () => {
  it("round-trips the moment", () => {
    const at = { date: "2026-08-19", time: "18:00" };
    expect(keyMoment(reminderKey("t1", at))).toEqual(at);
  });

  it("returns null for anything else", () => {
    expect(keyMoment("t1|garbage")).toBeNull();
    expect(keyMoment("no-separator")).toBeNull();
  });
});

describe("pruneSeen", () => {
  it("keeps recent keys and drops old ones", () => {
    const recent = reminderKey("t1", { date: "2026-08-18", time: "09:00" });
    const ancient = reminderKey("t2", { date: "2026-01-01", time: "09:00" });
    expect(pruneSeen([recent, ancient], NOW)).toEqual([recent]);
  });

  it("keeps a key for a moment still ahead", () => {
    const future = reminderKey("t1", { date: "2026-09-01", time: "09:00" });
    expect(pruneSeen([future], NOW)).toEqual([future]);
  });

  it("drops unparseable keys rather than growing forever", () => {
    expect(pruneSeen(["junk"], NOW)).toEqual([]);
  });
});
