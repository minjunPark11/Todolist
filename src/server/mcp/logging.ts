// What a request is allowed to leave behind (§16.2).
//
// The list of what is NOT logged is the important half: task titles, note and
// description text, event titles and locations, focus notes, the search query
// itself, the user's email, any part of an access token, and the ICS URL. A
// log is the one place where private data survives the request, gets copied to
// a third-party aggregator, and is read by people the user never agreed to.
//
// What is left is enough to answer the operational questions — which tool is
// slow, which is failing, whether a client is looping — and nothing else. The
// search query is recorded as a LENGTH, because "the query was 4 characters"
// explains a bad result set and "the query was `divorce lawyer`" is a
// confidence the user did not give us.
import type { ServerErrorCode } from "../errors";

export interface McpLogRecord {
  requestId: string;
  /** The OAuth client, which identifies an app and not a person. */
  clientId?: string;
  /** First 8 characters of a hash of `sub`, when operations needs a subject. */
  userHash?: string;
  tool?: string;
  method: string;
  outcome: "ok" | "error";
  errorCode?: ServerErrorCode | "PROTOCOL" | "UNAUTHORIZED" | "INTERNAL";
  latencyMs: number;
  /** How many rows the answer carried, not what was in them. */
  resultItemCount?: number;
  /** Length only. Never the query. */
  queryLength?: number;
  externalCalendars?: { ok: number; failed: number };
}

export type LogSink = (record: McpLogRecord) => void;

/** JSON on stdout, which is what a serverless platform collects. */
export const consoleSink: LogSink = (record) => {
  console.info(JSON.stringify({ scope: "mcp", ...record }));
};

/**
 * Eight hex characters of a hash — enough to tell two users' requests apart in
 * a log while being no use for identifying either of them.
 *
 * Not cryptographic, and does not need to be: a `sub` is a UUID, so this is
 * shortening an already-opaque value rather than protecting a secret.
 */
export function userHash(userId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Rows in an answer, when the answer is shaped like a list. */
export function countItems(result: unknown): number | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  for (const key of ["items", "entries", "blocks"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.length;
  }
  return undefined;
}

export function countCalendars(result: unknown): { ok: number; failed: number } | undefined {
  const statuses = (result as { meta?: { externalCalendars?: Array<{ ok: boolean }> } } | undefined)?.meta
    ?.externalCalendars;
  if (!statuses) return undefined;
  return {
    ok: statuses.filter((status) => status.ok).length,
    failed: statuses.filter((status) => !status.ok).length,
  };
}
