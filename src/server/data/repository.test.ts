import { describe, expect, it } from "vitest";
import { assertNotServiceRole, createRepository, readSupabaseEnv, ROW_CAP } from "./repository";
import { fixtureReader, settingsRows, task } from "../test/fixtures";

describe("loadSlice", () => {
  it("normalizes rows through the app's own gate", async () => {
    // The stored record carries almost nothing; every other field is what the
    // normalizer fills in. A server reading raw jsonb would see `tags:
    // undefined` and crash, or `status: undefined` and call the task open by
    // accident — the same record, two different answers (§24).
    const repo = createRepository(fixtureReader({ tasks: [{ id: "t1", title: "Bare" }] }));
    const slice = await repo.loadSlice(["tasks"]);

    expect(slice.data.tasks).toHaveLength(1);
    expect(slice.data.tasks[0]).toMatchObject({ id: "t1", title: "Bare", status: "open", tags: [] });
  });

  it("reads each table once however many queries ask for it", async () => {
    const reads = new Map<never, number>();
    const repo = createRepository(fixtureReader({ tasks: [task()] }, { reads: reads as never }));

    await repo.loadSlice(["tasks", "lists"]);
    await repo.loadSlice(["tasks", "projects"]);

    expect(reads.get("tasks" as never)).toBe(1);
  });

  it("splits the three settings singletons apart", async () => {
    const repo = createRepository(
      fixtureReader({
        settings: settingsRows({
          settings: { theme: "dark" },
          appSettings: { timezone: "Europe/Berlin" },
          syncState: { lastSyncedAt: "2026-08-28T00:00:00.000Z", platform: "desktop" },
        }),
      }),
    );
    const slice = await repo.loadSlice(["settings"]);

    expect(slice.data.settings.theme).toBe("dark");
    expect(slice.data.appSettings.timezone).toBe("Europe/Berlin");
    expect(slice.syncState).toEqual({ lastSyncedAt: "2026-08-28T00:00:00.000Z", platform: "desktop" });
  });

  it("reports a table the project has not migrated instead of calling it empty", async () => {
    const repo = createRepository(fixtureReader({ tasks: [task()] }, { missing: ["reminders"] }));
    const slice = await repo.loadSlice(["tasks", "reminders"]);

    expect(slice.missing).toEqual(["reminders"]);
    expect(slice.loaded.has("reminders")).toBe(false);
  });

  it("cuts an oversized table off and says so", async () => {
    const rows = Array.from({ length: ROW_CAP + 5 }, (_, index) => task({ id: `t${index}` }));
    const repo = createRepository(fixtureReader({ tasks: rows }));
    const slice = await repo.loadSlice(["tasks"]);

    expect(slice.data.tasks).toHaveLength(ROW_CAP);
    expect(slice.truncated).toEqual(["tasks"]);
  });

  it("leaves collections nobody asked for empty, and says which were loaded", async () => {
    const repo = createRepository(fixtureReader({ tasks: [task()], projects: [{ id: "p1", name: "Thesis" }] }));
    const slice = await repo.loadSlice(["tasks"]);

    expect(slice.data.projects).toEqual([]);
    expect(slice.loaded.has("projects")).toBe(false);
  });
});

describe("the service_role guard", () => {
  // R6: the key sits in the same origin as the app, so eventually somebody
  // passes the wrong one. It bypasses RLS completely — every account at once —
  // which is worth failing loudly on the first request.
  const serviceRoleKey = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`;
  const anonKey = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.sig`;

  it("refuses a key whose payload says service_role", () => {
    expect(() => assertNotServiceRole(serviceRoleKey)).toThrow(/service_role/);
  });

  it("accepts an anon key", () => {
    expect(() => assertNotServiceRole(anonKey)).not.toThrow();
  });

  it("says nothing about a key it cannot decode", () => {
    expect(() => assertNotServiceRole("not-a-jwt")).not.toThrow();
  });

  it("refuses it through the env reader too", () => {
    expect(() =>
      readSupabaseEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: serviceRoleKey } as never),
    ).toThrow(/service_role/);
  });
});
