import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { blocksApproval, readAccountReadiness, STALE_AFTER_MS } from "./accountReadiness";

const NOW = new Date("2026-08-28T01:00:00.000Z");

/**
 * The two calls the gate makes, and nothing else. Built by hand rather than
 * with a mocking library so the shape being relied on is visible: a counting
 * select that returns no rows, and one settings row.
 */
function client(input: {
  count?: number | null;
  countError?: boolean;
  sync?: Record<string, unknown> | null;
  syncError?: boolean;
  throws?: boolean;
}): SupabaseClient {
  return {
    from(table: string) {
      if (input.throws) throw new Error("network");
      if (table === "tasks") {
        return {
          select: async () => ({ count: input.count ?? null, error: input.countError ? { message: "no" } : null }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: input.sync === undefined ? null : input.sync ? { data: input.sync } : null,
              error: input.syncError ? { message: "no" } : null,
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("readAccountReadiness", () => {
  it("is ready when the account holds work and a device checked in recently", async () => {
    const readiness = await readAccountReadiness(
      client({ count: 42, sync: { lastSeenAt: "2026-08-27T23:00:00.000Z" } }),
      NOW,
    );

    expect(readiness).toMatchObject({ state: "ready", taskCount: 42 });
  });

  it("is empty when nothing was ever synced up", async () => {
    // The case the gate exists for: connect now and the assistant answers
    // "you have nothing today" forever, with total confidence.
    const readiness = await readAccountReadiness(client({ count: 0, sync: null }), NOW);

    expect(readiness.state).toBe("empty");
    expect(blocksApproval(readiness)).toBe(true);
  });

  it("is stale when no device has checked in for a long time", async () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000).toISOString();
    const readiness = await readAccountReadiness(client({ count: 5, sync: { lastSeenAt: old } }), NOW);

    expect(readiness.state).toBe("stale");
    // Warned about, not blocked: the user may know exactly why, and refusing
    // would leave them no way through.
    expect(blocksApproval(readiness)).toBe(false);
  });

  it("measures from the later of the two stamps", async () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000).toISOString();
    const readiness = await readAccountReadiness(
      client({ count: 5, sync: { lastSyncedAt: old, lastSeenAt: "2026-08-27T23:00:00.000Z" } }),
      NOW,
    );

    expect(readiness.state).toBe("ready");
  });

  it("accepts rows with no stamp at all", async () => {
    // Written by a client from before the stamp existed. The rows are the
    // evidence that syncing happened.
    const readiness = await readAccountReadiness(client({ count: 5, sync: {} }), NOW);
    expect(readiness.state).toBe("ready");
  });

  it("blocks when it could not tell", async () => {
    // "Unknown" must not read as "fine". This is the one moment a person is
    // present to fix it.
    expect(blocksApproval(await readAccountReadiness(client({ countError: true }), NOW))).toBe(true);
    expect(blocksApproval(await readAccountReadiness(client({ throws: true }), NOW))).toBe(true);
  });
});
