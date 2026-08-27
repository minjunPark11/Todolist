// The only place in the server layer that talks to Supabase.
//
// Two rules hold this file's shape (§5, §7.4):
//
//   1. Every read goes out under the USER's access token, so RLS is what
//      decides which rows come back. There is no code path here that can read
//      another account's row, because there is no code path that can name one.
//   2. The service_role key is never used. It bypasses RLS entirely, and one
//      accidental use in a data path would turn a per-user reader into a
//      whole-database reader. `assertNotServiceRole` makes that a startup
//      failure rather than a silent superpower.
//
// The jsonb schema (id text, user_id uuid, data jsonb, PK only) means the
// server cannot filter by field (B2). So it does exactly what the app does on
// boot: reads the tables a question needs, whole, and decides in memory.
import type { PlannerData, RawPlannerData } from "../../types";
import { collectionTables } from "../../domain/sync/buildSyncPlan";
import { normalizeData } from "../../domain/plannerData/normalize";
import { upstreamUnavailable } from "../errors";
import type { RequestContext } from "./context";

/**
 * What a tool may read. An allowlist rather than "every table": the five
 * orphaned tables (§3.1 — habits, habit_logs, study_topics, concept_notes,
 * space_notes) hold records from removed features, and their absence from
 * this list is itself the defence. A tool cannot leak what it cannot name.
 */
export const READABLE_TABLES = [
  "tasks",
  "subtasks",
  "check_items",
  "projects",
  "lists",
  "spaces",
  "folders",
  "list_sections",
  "tags",
  "task_tags",
  "focus_sessions",
  "daily_plans",
  "reminders",
  "settings",
] as const;

export type ReadableTable = (typeof READABLE_TABLES)[number];

/**
 * Rows per table, per request (R3). A personal account is nowhere near this;
 * the cap exists so one pathological account cannot hold a serverless
 * function open until it times out. Exceeding it is reported, never silent
 * (§15's "no quiet truncation").
 */
export const ROW_CAP = 5000;

export interface SyncStateRow {
  lastSyncedAt?: string;
  lastSeenAt?: string;
  /** "web" | "desktop" — a label, never a device identifier (§11.2). */
  platform?: string;
}

export interface PlannerSlice {
  /**
   * Normalized through the app's own gate, so the server reads a record the
   * same way the screen does. Collections that were NOT requested are empty
   * here — check `loaded` before concluding anything from an empty array.
   */
  data: PlannerData;
  loaded: ReadonlySet<ReadableTable>;
  /** Tables that hit ROW_CAP. */
  truncated: ReadableTable[];
  /** Tables this project has not migrated yet (optional ones only). */
  missing: ReadableTable[];
  syncState: SyncStateRow | null;
  /**
   * The zone as the ACCOUNT holds it — before normalization, and absent when
   * the account holds none.
   *
   * `data.appSettings.timezone` cannot answer this. `normalizeAppSettings`
   * fills an empty one with `DEFAULT_APP_SETTINGS.timezone`, which is the
   * running machine's zone — a sensible default on a device, and on a server
   * exactly the guess M1 forbids. Reading it there would have the server
   * silently answer "today" in Vercel's zone for an account that never
   * recorded one, which is the failure mode that produces a confident,
   * day-shifted answer instead of a refusal.
   */
  storedTimezone?: string;
}

/**
 * The I/O seam. Everything above this line is pure, which is what lets the
 * whole query layer be tested against fixtures with no network and no
 * account — Phase 3's point: prove the data before adding auth.
 */
export interface TableReader {
  /** The `data` jsonb of every row this user may see, capped. */
  readTable(table: ReadableTable, limit: number): Promise<ReadTableResult>;
}

export interface ReadTableResult {
  rows: unknown[];
  /** The table does not exist in this project (an un-migrated optional one). */
  missing?: boolean;
}

const TABLE_TO_KEY = new Map<string, keyof PlannerData>(
  collectionTables.map(([key, table]) => [table, key as keyof PlannerData]),
);

export interface Repository {
  loadSlice(tables: readonly ReadableTable[]): Promise<PlannerSlice>;
}

/**
 * A repository is per-request, and so is its cache: two queries called for one
 * question read `tasks` once, and nothing is remembered past the response.
 * Caching across requests would mean serving one user's rows to the next.
 */
export function createRepository(reader: TableReader): Repository {
  const cache = new Map<ReadableTable, ReadTableResult>();

  async function read(table: ReadableTable): Promise<ReadTableResult> {
    const cached = cache.get(table);
    if (cached) return cached;
    const result = await reader.readTable(table, ROW_CAP + 1);
    cache.set(table, result);
    return result;
  }

  return {
    async loadSlice(tables) {
      const requested = [...new Set(tables)];
      const partial: RawPlannerData = {};
      const loaded = new Set<ReadableTable>();
      const truncated: ReadableTable[] = [];
      const missing: ReadableTable[] = [];
      let syncState: SyncStateRow | null = null;
      let storedTimezone: string | undefined;

      const results = await Promise.all(
        requested.map(async (table) => [table, await read(table)] as const),
      );

      for (const [table, result] of results) {
        if (result.missing) {
          missing.push(table);
          continue;
        }
        loaded.add(table);

        let rows = result.rows;
        if (rows.length > ROW_CAP) {
          truncated.push(table);
          rows = rows.slice(0, ROW_CAP);
        }

        if (table === "settings") {
          // Three singletons in one table, told apart by their id — which the
          // row payload does not carry, so the reader hands them back tagged.
          for (const row of rows as Array<{ id?: unknown; data?: unknown }>) {
            if (!row || typeof row !== "object") continue;
            if (row.id === "settings") {
              partial.settings = row.data as RawPlannerData["settings"];
            }
            if (row.id === "app_settings") {
              const appState = row.data as { appSettings?: { timezone?: unknown } } | undefined;
              partial.appSettings = appState?.appSettings as RawPlannerData["appSettings"];
              const zone = appState?.appSettings?.timezone;
              if (typeof zone === "string" && zone.trim()) storedTimezone = zone.trim();
            }
            if (row.id === "sync_state") {
              syncState = (row.data ?? null) as SyncStateRow | null;
            }
          }
          continue;
        }

        const key = TABLE_TO_KEY.get(table);
        if (key) partial[key] = rows as never;
      }

      return {
        // The same gate the app applies on load. Without it the server would
        // read raw jsonb — records missing every field a normalizer fills in —
        // and answer questions about them differently from the screen.
        data: normalizeData(partial),
        loaded,
        truncated,
        missing,
        syncState,
        ...(storedTimezone ? { storedTimezone } : {}),
      };
    },
  };
}

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * A service_role key is a JWT whose payload says so. Reading it here costs a
 * base64 decode and turns R6 — the key lives in the same origin, so someone
 * will eventually pass it in — from a silent, total RLS bypass into a refusal
 * at the first request.
 */
export function assertNotServiceRole(key: string): void {
  const payload = key.split(".")[1];
  if (!payload) return;
  let role: unknown;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { role?: unknown };
    role = decoded.role;
  } catch {
    // A key we cannot decode is not evidence of anything. Only a decoded
    // service_role is, and that is checked outside this catch so the throw
    // below cannot be swallowed by it.
    return;
  }
  if (role === "service_role") {
    throw new Error(
      "The server data layer was given a service_role key. It bypasses RLS and must never reach a user-facing read.",
    );
  }
}

export function readSupabaseEnv(env: NodeJS.ProcessEnv = process.env): SupabaseEnv {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set for the server data layer.");
  }
  assertNotServiceRole(anonKey);
  return { url, anonKey };
}

/**
 * PostgREST over plain fetch rather than supabase-js.
 *
 * supabase-js is a client library: it manages a session, refreshes tokens, and
 * remembers who is signed in. None of that is wanted here — the session is the
 * caller's, it arrives per request, and it must not be remembered between two.
 * What is left is one GET with two headers, which is what this is.
 */
export function supabaseTableReader(
  ctx: RequestContext,
  env: SupabaseEnv = readSupabaseEnv(),
): TableReader {
  return {
    async readTable(table, limit) {
      const columns = table === "settings" ? "id,data" : "data";
      const url = `${env.url}/rest/v1/${table}?select=${columns}&limit=${limit}`;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            apikey: env.anonKey,
            Authorization: `Bearer ${ctx.accessToken}`,
            Accept: "application/json",
          },
        });
      } catch {
        throw upstreamUnavailable();
      }

      if (!response.ok) {
        // An optional table the project never migrated: the app treats this as
        // "not there yet" rather than as a failure, and so does this.
        if (response.status === 404 || (await isMissingTable(response))) {
          return { rows: [], missing: true };
        }
        throw upstreamUnavailable();
      }

      const body = (await response.json()) as Array<{ id?: string; data?: unknown }>;
      // Only the payload is kept for a collection. The id and user_id are the
      // storage's business, and user_id is the same value on every row RLS let
      // through.
      return {
        rows: table === "settings" ? body : body.map((row) => row?.data),
      };
    },
  };
}

async function isMissingTable(response: Response): Promise<boolean> {
  try {
    const body = (await response.clone().json()) as { code?: unknown; message?: unknown };
    const message = typeof body.message === "string" ? body.message.toLowerCase() : "";
    return body.code === "PGRST205" || message.includes("could not find the table");
  } catch {
    return false;
  }
}
