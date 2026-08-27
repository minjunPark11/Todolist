// Is there anything in this account for an AI to read?
//
// M2, and the one product rule this whole feature adds. FocusFlow is
// local-first: the device holds the truth and the account is a mirror that
// only runs while signed in (B1). Someone can therefore connect Claude to an
// account that is empty, or three weeks behind, and every answer it gives will
// be wrong in a way it cannot detect.
//
// The gate is deliberately at ONE moment — the connection — and nowhere after
// it. Blocking tool calls later would not fix a stale account, it would only
// stop the user using what they asked for; §11.2's freshness metadata carries
// that job instead. Here, at the only point where a person is present and
// paying attention, a block is something they can act on.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReadinessState =
  /** Rows are there and a device has reconciled with them recently enough. */
  | "ready"
  /** The account holds nothing: this person has never synced. */
  | "empty"
  /** Rows are there, but nothing has checked in for a long time. */
  | "stale"
  /** The question could not be asked — treated as blocking, not as ready. */
  | "unknown";

export interface AccountReadiness {
  state: ReadinessState;
  taskCount: number;
  lastSeenAt?: string;
  lastSyncedAt?: string;
}

/** Older than this and the account is not worth connecting an AI to. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export async function readAccountReadiness(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<AccountReadiness> {
  try {
    // `head: true` asks Postgres for the count and none of the rows: this page
    // has no business reading anybody's tasks, including the reader's own.
    const [{ count, error: countError }, { data: syncRow, error: syncError }] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }),
      supabase.from("settings").select("data").eq("id", "sync_state").maybeSingle(),
    ]);
    if (countError || syncError) return { state: "unknown", taskCount: 0 };

    const sync = (syncRow?.data ?? {}) as { lastSeenAt?: string; lastSyncedAt?: string };
    const readiness: AccountReadiness = {
      state: "ready",
      taskCount: count ?? 0,
      ...(sync.lastSeenAt ? { lastSeenAt: sync.lastSeenAt } : {}),
      ...(sync.lastSyncedAt ? { lastSyncedAt: sync.lastSyncedAt } : {}),
    };

    if (readiness.taskCount === 0) return { ...readiness, state: "empty" };

    const stamps = [sync.lastSeenAt, sync.lastSyncedAt]
      .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)))
      .sort();
    const newest = stamps[stamps.length - 1];
    // Rows but no stamp at all: written by a client from before the stamp
    // existed. Not a reason to block — the rows are the evidence that syncing
    // happened — but not a reason to claim freshness either.
    if (!newest) return { ...readiness, state: "ready" };

    return { ...readiness, state: now.getTime() - Date.parse(newest) > STALE_AFTER_MS ? "stale" : "ready" };
  } catch {
    return { state: "unknown", taskCount: 0 };
  }
}

/**
 * Only an empty account blocks.
 *
 * A stale one is warned about and allowed: the user may know exactly why (a
 * laptop that has been shut for a fortnight), and refusing would leave them
 * with no way to proceed short of opening the app on a machine they do not
 * have. An empty one is different — there is literally nothing to read, so
 * connecting produces an assistant that confidently says "you have nothing on
 * today" forever.
 */
export function blocksApproval(readiness: AccountReadiness): boolean {
  return readiness.state === "empty" || readiness.state === "unknown";
}
