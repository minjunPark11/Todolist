// @vitest-environment jsdom
// The cursor is the device's, the list is the account's
// (MULTI_DEVICE_SYNC_DESIGN.md §5).
//
// One cursor shared between the web app and the desktop app meant the first to
// poll consumed the incremental changes and moved the position past them; the
// other asked from there, got an empty answer, and never learned what had
// happened. These pin the split — and that the split did NOT touch the list,
// which still has to be shared or a calendar ticked on one machine would not be
// ticked on the other.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  calls: [] as { table: string; op: string; payload?: unknown; filters: Record<string, unknown> }[],
}));

vi.mock("../services/supabaseClient", () => {
  function chain(table: string, op: string, payload?: unknown) {
    const filters: Record<string, unknown> = {};
    const call = { table, op, payload, filters };
    state.calls.push(call);
    const link = {
      select: () => link,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return link;
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
        const rows = (state.rows[table] ?? []).filter((row) =>
          Object.entries(filters).every(([column, value]) => (row as Record<string, unknown>)[column] === value),
        );
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return link;
  }
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => ({
        select: () => chain(table, "select"),
        upsert: (payload: unknown) => chain(table, "upsert", payload),
        delete: () => chain(table, "delete"),
      }),
    },
  };
});

import { readGoogleSources, saveGoogleSyncToken, setGoogleSourceSelected } from "./googleCalendarSources";
import { deviceId } from "./deviceId";

beforeEach(() => {
  state.rows = {};
  state.calls = [];
});
afterEach(() => vi.clearAllMocks());

const source = {
  calendar_id: "work@example.com",
  summary: "Work",
  color: "#123456",
  writable: true,
  selected: true,
};

describe("reading the sources", () => {
  it("takes the cursor belonging to this device", async () => {
    state.rows.google_calendar_sources = [source];
    state.rows.google_calendar_device_cursors = [
      { device_id: "some-other-machine", calendar_id: "work@example.com", sync_token: "theirs" },
      { device_id: deviceId(), calendar_id: "work@example.com", sync_token: "ours" },
    ];

    const [read] = await readGoogleSources();
    expect(read.syncToken).toBe("ours");
  });

  it("starts from nothing when only another device has a cursor", async () => {
    // The case that was broken: this device must list in full rather than
    // resume from a position it never reached.
    state.rows.google_calendar_sources = [source];
    state.rows.google_calendar_device_cursors = [
      { device_id: "some-other-machine", calendar_id: "work@example.com", sync_token: "theirs" },
    ];

    const [read] = await readGoogleSources();
    expect(read.syncToken).toBeUndefined();
    // And the list itself is still the account's — the split did not copy it.
    expect(read.selected).toBe(true);
    expect(read.summary).toBe("Work");
  });
});

describe("writing the cursor", () => {
  it("writes it against this device", async () => {
    await saveGoogleSyncToken("work@example.com", "tok-2");
    const write = state.calls.find((call) => call.op === "upsert");
    expect(write?.table).toBe("google_calendar_device_cursors");
    expect(write?.payload).toMatchObject({
      user_id: "user-1",
      device_id: deviceId(),
      calendar_id: "work@example.com",
      sync_token: "tok-2",
    });
  });

  it("clears every device's cursor when a calendar is turned off", async () => {
    // Nobody is reading that stream while it is off, on any machine, so every
    // stored position names a place whose intervening changes are gone.
    await setGoogleSourceSelected("work@example.com", false);

    const remove = state.calls.find((call) => call.op === "delete");
    expect(remove?.table).toBe("google_calendar_device_cursors");
    expect(remove?.filters).toEqual({ user_id: "user-1", calendar_id: "work@example.com" });
    // No device_id filter: this is deliberately all of them.
    expect(remove?.filters).not.toHaveProperty("device_id");
  });

  it("leaves the cursors alone when a calendar is turned on", async () => {
    await setGoogleSourceSelected("work@example.com", true);
    expect(state.calls.some((call) => call.op === "delete")).toBe(false);
  });
});

describe("this device's name for itself", () => {
  it("is stable across calls", () => {
    expect(deviceId()).toBe(deviceId());
    expect(deviceId()).not.toHaveLength(0);
  });
});
