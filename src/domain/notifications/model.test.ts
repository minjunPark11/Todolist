import { describe, expect, it } from "vitest";
import {
  addNotification,
  markAllRead,
  MAX_NOTIFICATIONS,
  pruneNotifications,
  sanitizeNotifications,
  sortNotifications,
  unreadCount,
  type AppNotification,
} from "./model";

const NOW = Date.parse("2026-09-04T12:00:00.000Z");

function entry(patch: Partial<AppNotification> & { id: string }): AppNotification {
  return {
    kind: "reminder",
    title: "Reminder",
    body: "Something is due",
    at: new Date(NOW).toISOString(),
    readAt: "",
    ...patch,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("the notification list", () => {
  it("is newest first, whatever order it arrived in", () => {
    const sorted = sortNotifications([
      entry({ id: "old", at: daysAgo(3) }),
      entry({ id: "new", at: daysAgo(0) }),
      entry({ id: "mid", at: daysAgo(1) }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("counts what has not been read", () => {
    expect(
      unreadCount([entry({ id: "a" }), entry({ id: "b", readAt: daysAgo(0) }), entry({ id: "c" })]),
    ).toBe(2);
  });
});

// F6. Two limits because either alone leaves a hole: a count lets a quiet
// account keep last year's notices, an age lets a noisy day grow without end.
describe("the cap", () => {
  it("drops anything older than thirty days", () => {
    const kept = pruneNotifications(
      [entry({ id: "fresh", at: daysAgo(29) }), entry({ id: "stale", at: daysAgo(31) })],
      NOW,
    );
    expect(kept.map((item) => item.id)).toEqual(["fresh"]);
  });

  it("keeps only the newest two hundred", () => {
    const many = Array.from({ length: MAX_NOTIFICATIONS + 40 }, (_, index) =>
      entry({ id: `n-${index}`, at: new Date(NOW - index * 1000).toISOString() }),
    );
    const kept = pruneNotifications(many, NOW);
    expect(kept).toHaveLength(MAX_NOTIFICATIONS);
    // The oldest forty are the ones that went.
    expect(kept[kept.length - 1].id).toBe(`n-${MAX_NOTIFICATIONS - 1}`);
  });

  it("applies on the way in, so the store never holds more than the cap", () => {
    const full = Array.from({ length: MAX_NOTIFICATIONS }, (_, index) =>
      entry({ id: `n-${index}`, at: new Date(NOW - (index + 1) * 1000).toISOString() }),
    );
    const next = addNotification(full, entry({ id: "newest" }), NOW);
    expect(next).toHaveLength(MAX_NOTIFICATIONS);
    expect(next[0].id).toBe("newest");
  });
});

describe("reading", () => {
  it("marks the whole list at once — opening the panel is the read", () => {
    const read = markAllRead([entry({ id: "a" }), entry({ id: "b" })], "2026-09-04T12:00:00.000Z");
    expect(unreadCount(read)).toBe(0);
  });

  it("leaves an already-read entry's timestamp alone", () => {
    const earlier = daysAgo(2);
    const read = markAllRead(
      [entry({ id: "a", readAt: earlier }), entry({ id: "b" })],
      "2026-09-04T12:00:00.000Z",
    );
    expect(read[0].readAt).toBe(earlier);
  });

  // Identity, so a store built on it does not notify subscribers for a no-op.
  it("returns the same array when there was nothing to read", () => {
    const list = [entry({ id: "a", readAt: daysAgo(1) })];
    expect(markAllRead(list, "2026-09-04T12:00:00.000Z")).toBe(list);
  });
});

describe("what comes back from storage", () => {
  it("drops records that cannot be placed or named", () => {
    const kept = sanitizeNotifications([
      { id: "ok", kind: "reminder", title: "t", body: "b", at: daysAgo(0), readAt: "" },
      { id: "", kind: "reminder", at: daysAgo(0) },
      { id: "unknown-kind", kind: "somethingElse", at: daysAgo(0) },
      { id: "no-time", kind: "reminder" },
      { id: "bad-time", kind: "reminder", at: "not a date" },
      "not an object",
      null,
    ]);
    expect(kept.map((item) => item.id)).toEqual(["ok"]);
  });

  it("keeps one of each id", () => {
    const kept = sanitizeNotifications([
      { id: "dup", kind: "reminder", title: "first", at: daysAgo(0) },
      { id: "dup", kind: "reminder", title: "second", at: daysAgo(1) },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("first");
  });

  it("survives a value that is not a list at all", () => {
    expect(sanitizeNotifications(null)).toEqual([]);
    expect(sanitizeNotifications({ nope: true })).toEqual([]);
  });
});
