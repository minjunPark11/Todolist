// Fixtures for the server layer's tests.
//
// The whole point of Phase 3 is that these questions can be answered — and
// proved — before any of the authentication exists. So the seam the tests use
// is the same one production uses: a `TableReader`. No network, no account, no
// Supabase, no clock.
import type { ReadableTable, ReadTableResult, TableReader } from "../data/repository";
import { createRepository } from "../data/repository";
import type { RequestContext } from "../data/context";
import type { QueryContext } from "../data/queries/shared";
import type { ExternalEventsResult } from "../data/calendar/icsSource";

export type TableRows = Partial<Record<ReadableTable, unknown[]>>;

export interface FixtureOptions {
  /** Tables this project has not migrated — the reader reports them absent. */
  missing?: ReadableTable[];
  /** Counts reads per table, so the per-request cache can be proved. */
  reads?: Map<ReadableTable, number>;
}

export function fixtureReader(rows: TableRows, options: FixtureOptions = {}): TableReader {
  return {
    async readTable(table): Promise<ReadTableResult> {
      options.reads?.set(table, (options.reads.get(table) ?? 0) + 1);
      if (options.missing?.includes(table)) return { rows: [], missing: true };
      return { rows: rows[table] ?? [] };
    },
  };
}

export interface FixtureContextOptions extends FixtureOptions {
  now?: Date;
  timezone?: string;
  external?: ExternalEventsResult;
  loadExternal?: QueryContext["loadExternal"];
}

/** 10:00 in Seoul, which is a different DAY from the same instant in Denver. */
export const DEFAULT_NOW = new Date("2026-08-28T01:00:00.000Z");
export const DEFAULT_TIMEZONE = "Asia/Seoul";

export function fixtureRequest(options: FixtureContextOptions = {}): RequestContext {
  return {
    userId: "user-a",
    accessToken: "token-a",
    timezone: options.timezone ?? DEFAULT_TIMEZONE,
    now: options.now ?? DEFAULT_NOW,
  };
}

export function fixtureContext(rows: TableRows, options: FixtureContextOptions = {}): QueryContext {
  const external = options.external;
  return {
    request: fixtureRequest(options),
    repo: createRepository(fixtureReader(rows, options)),
    loadExternal:
      options.loadExternal ??
      // Absent means "no subscriptions were read", which is not the same as
      // "there are none" — a query that asks for external events without a
      // loader would otherwise silently report an empty calendar.
      (external ? async () => external : async () => ({ events: [], statuses: [], partial: false })),
  };
}

/** A settings table with the three singleton rows, any of which may be left out. */
export function settingsRows(input: {
  settings?: Record<string, unknown>;
  appSettings?: Record<string, unknown>;
  syncState?: Record<string, unknown>;
}): unknown[] {
  const rows: unknown[] = [];
  if (input.settings) rows.push({ id: "settings", data: input.settings });
  if (input.appSettings) rows.push({ id: "app_settings", data: { appSettings: input.appSettings } });
  if (input.syncState) rows.push({ id: "sync_state", data: input.syncState });
  return rows;
}

export function task(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "task-1",
    title: "Write the chapter",
    status: "open",
    priority: "none",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}
