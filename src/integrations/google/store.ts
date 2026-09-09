// The refresh token, in the one table nothing in a browser can read
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4.1).
//
// PostgREST over plain fetch, for the reason `repository.ts` gives: supabase-js
// is a client library that manages a session, and none of that is wanted where
// the credential arrives per request. Here there is a second reason — the
// purity test bans that package from `src/server/**` outright.
import { readServiceRoleEnv, type ServiceRoleEnv } from "./env";

export class TokenStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TokenStoreError";
  }
}

export interface DisconnectSnapshot { refreshToken: string | null; grantVersion: string | null; generation: string | null }
export async function readDisconnectSnapshot(userId: string, fetchImpl: typeof fetch = fetch,
  env: ServiceRoleEnv = readServiceRoleEnv()): Promise<DisconnectSnapshot> {
  const response = await request(env, "rpc/read_google_disconnect_snapshot", {
    method: "POST", headers: headers(env), body: JSON.stringify({ p_user_id: userId }),
  }, fetchImpl);
  const body = await response.json().catch(() => null) as DisconnectSnapshot | null;
  if (!body || ![body.refreshToken, body.grantVersion, body.generation].every(v => v === null || typeof v === "string") ||
    ((body.refreshToken === null) !== (body.grantVersion === null))) throw new TokenStoreError("Could not verify the connection to disconnect.", 502);
  return body;
}
export async function disconnectStoredCalendar(userId: string, snapshot: DisconnectSnapshot,
  fetchImpl: typeof fetch = fetch, env: ServiceRoleEnv = readServiceRoleEnv()): Promise<void> {
  const response = await request(env, "rpc/disconnect_google_calendar", {
    method: "POST", headers: headers(env), body: JSON.stringify({ p_user_id: userId,
      p_grant_version: snapshot.grantVersion, p_generation: snapshot.generation }),
  }, fetchImpl);
  const body = await response.json().catch(() => null) as { disconnected?: unknown } | null;
  if (body?.disconnected === false) throw new TokenStoreError("The Google connection changed. Check it and retry disconnecting.", 409);
  if (body?.disconnected !== true) throw new TokenStoreError("Could not confirm Google disconnection.", 502);
}

function headers(env: ServiceRoleEnv, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: env.serviceRoleKey,
    Authorization: `Bearer ${env.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(
  env: ServiceRoleEnv,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(`${env.url}/rest/v1/${path}`, init);
  } catch {
    throw new TokenStoreError("Could not reach the database.", 502);
  }
  if (!response.ok) {
    // The body can carry the refresh token on a failed write. It is not put in
    // the message and not logged.
    throw new TokenStoreError(`Token store request failed (${response.status}).`, 502);
  }
  return response;
}

/**
 * The stored refresh token, or null when this user has never connected.
 *
 * Null and not an error: "not connected" is an ordinary state the settings
 * screen draws, not a failure.
 */
export async function readRefreshToken(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  env: ServiceRoleEnv = readServiceRoleEnv(),
): Promise<string | null> {
  const response = await request(
    env,
    `google_calendar_tokens?user_id=eq.${encodeURIComponent(userId)}&select=refresh_token`,
    { headers: headers(env) },
    fetchImpl,
  );
  const rows = (await response.json()) as Array<{ refresh_token?: unknown }>;
  const token = rows[0]?.refresh_token;
  return typeof token === "string" && token ? token : null;
}

/**
 * Replaces this user's token.
 *
 * An upsert and not an insert: reconnecting is an ordinary thing to do, and the
 * old grant is dead by then — a unique-violation on the second connect would be
 * a bug users hit by pressing the button twice.
 */
export async function writeRefreshToken(
  userId: string,
  refreshToken: string,
  scope: string,
  fetchImpl: typeof fetch = fetch,
  env: ServiceRoleEnv = readServiceRoleEnv(),
): Promise<void> {
  await request(
    env,
    "google_calendar_tokens",
    {
      method: "POST",
      headers: headers(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ user_id: userId, refresh_token: refreshToken, scope }),
    },
    fetchImpl,
  );
}

/** Disconnecting. Succeeds whether or not a row was there. */
export async function deleteRefreshToken(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  env: ServiceRoleEnv = readServiceRoleEnv(),
): Promise<void> {
  await request(
    env,
    `google_calendar_tokens?user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: headers(env, { Prefer: "return=minimal" }) },
    fetchImpl,
  );
}

/**
 * The connection row, removed by the same key.
 *
 * The user could delete this one themselves — it has policies (§4.4.1) — but
 * disconnect does it here so that the two rows cannot come apart. A connection
 * row with no token behind it is an app that says "connected" and can do
 * nothing.
 */
export async function deleteConnection(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  env: ServiceRoleEnv = readServiceRoleEnv(),
): Promise<void> {
  await request(
    env,
    `google_calendar_connections?user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: headers(env, { Prefer: "return=minimal" }) },
    fetchImpl,
  );
}

/**
 * The chosen calendars, removed with the rest of the connection (§6.1).
 *
 * A source list outliving its grant is a settings screen offering to sync
 * calendars the account can no longer reach, with cursors pointing into a
 * history nothing may read. Reconnecting re-lists them in a second.
 */
export async function deleteSources(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  env: ServiceRoleEnv = readServiceRoleEnv(),
): Promise<void> {
  await request(
    env,
    `google_calendar_sources?user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: headers(env, { Prefer: "return=minimal" }) },
    fetchImpl,
  );
}
