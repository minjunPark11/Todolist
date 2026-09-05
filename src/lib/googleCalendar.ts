// Talking to the two sides of the connection: our endpoints, and Google's
// calendar API (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.1, §4.4).
//
// The I/O around `domain/calendar/googleSync/connectFlow.ts`, which holds the
// judgement. Everything here takes its dependencies as an argument so the flow
// can be tested end to end without a network, a Supabase session or a Google
// account — the defaults are the real thing and are built once, below.
//
// Note what this file never holds: a refresh token. The client is given an
// access token good for an hour and asks for another when it expires
// (`api/google/token`), which is what lets the long-lived credential stay on
// the server where no browser can read it.
import type { PendingConnect } from "../domain/calendar/googleSync/connectFlow";
import { supabase } from "../services/supabaseClient";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** The name the dedicated calendar carries in the user's Google account. */
export const DEDICATED_CALENDAR_NAME = "FocusFlow";

export interface GoogleConnection {
  /** The dedicated calendar (§4.1). Everything in and out is scoped to it. */
  calendarId: string;
  /** Which Google account this is, so the settings screen can name it. */
  accountEmail: string;
}

/**
 * Why something did not work, in the terms the card has words for.
 *
 * A reason and not a message: the strings belong in the catalogue, and a
 * message from Google is rarely in the user's language.
 */
export type FailureReason = "signedOut" | "network" | "google" | "store";

export class GoogleCalendarError extends Error {
  constructor(
    readonly reason: FailureReason,
    message: string,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

export interface GoogleCalendarDeps {
  fetch: typeof fetch;
  /** The Supabase session's token, or null when nobody is signed in. */
  authToken: () => Promise<string | null>;
  readConnection: () => Promise<GoogleConnection | null>;
  writeConnection: (connection: GoogleConnection) => Promise<void>;
}

async function supabaseToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function supabaseReadConnection(): Promise<GoogleConnection | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("calendar_id, account_email")
    .maybeSingle();
  if (error) throw new GoogleCalendarError("store", error.message);
  if (!data?.calendar_id) return null;
  return { calendarId: data.calendar_id as string, accountEmail: (data.account_email as string) || "" };
}

async function supabaseWriteConnection(connection: GoogleConnection): Promise<void> {
  if (!supabase) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");

  const { error } = await supabase.from("google_calendar_connections").upsert(
    { user_id: userId, calendar_id: connection.calendarId, account_email: connection.accountEmail },
    { onConflict: "user_id" },
  );
  if (error) throw new GoogleCalendarError("store", error.message);
}

export const defaultDeps: GoogleCalendarDeps = {
  fetch: (input, init) => fetch(input, init),
  authToken: supabaseToken,
  readConnection: supabaseReadConnection,
  writeConnection: supabaseWriteConnection,
};

/** One of our own endpoints, called as the signed-in user. */
async function callOwnApi(path: string, deps: GoogleCalendarDeps, body?: unknown): Promise<unknown> {
  const token = await deps.authToken();
  if (!token) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");

  let response: Response;
  try {
    response = await deps.fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new GoogleCalendarError("network", "Could not reach the FocusFlow server.");
  }

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    // 401 from these endpoints means the FocusFlow session is gone, which is a
    // different repair from "Google said no" — the card sends them to sign in.
    const reason: FailureReason = response.status === 401 ? "signedOut" : "google";
    throw new GoogleCalendarError(reason, payload?.error || `Request failed (${response.status}).`);
  }
  return payload;
}

/** Google's calendar API, as the user, with the short-lived token. */
async function callGoogle(
  path: string,
  accessToken: string,
  deps: GoogleCalendarDeps,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  let response: Response;
  try {
    response = await deps.fetch(`${GOOGLE_CALENDAR_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new GoogleCalendarError("network", "Could not reach Google.");
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, body };
}

/**
 * Turns the code from the callback into a stored grant, and hands back the
 * hour-long access token that comes with it.
 */
export async function exchangeCodeForAccess(code: string, deps: GoogleCalendarDeps = defaultDeps): Promise<string> {
  const payload = (await callOwnApi("/api/google/connect", deps, { code })) as { accessToken?: string } | null;
  const accessToken = payload?.accessToken;
  if (!accessToken) throw new GoogleCalendarError("google", "Google did not return an access token.");
  return accessToken;
}

/**
 * A fresh access token for a connection that already exists.
 *
 * `connected: false` is an ordinary answer — it is every account that has never
 * connected — so it comes back as null rather than as a thrown error.
 */
export async function currentAccessToken(deps: GoogleCalendarDeps = defaultDeps): Promise<string | null> {
  const payload = (await callOwnApi("/api/google/token", deps)) as
    | { connected?: boolean; accessToken?: string }
    | null;
  if (!payload?.connected || !payload.accessToken) return null;
  return payload.accessToken;
}

/** Revokes the grant and removes both rows. */
export async function disconnect(deps: GoogleCalendarDeps = defaultDeps): Promise<{ revoked: boolean }> {
  const payload = (await callOwnApi("/api/google/disconnect", deps)) as { revoked?: boolean } | null;
  return { revoked: payload?.revoked !== false };
}

/**
 * The dedicated "FocusFlow" calendar, made if it is not there (§4.1).
 *
 * Reuses the stored one when the account still has it, because pressing
 * Connect a second time should not leave a trail of empty calendars behind.
 * A calendar the user deleted in Google comes back as a 404 here and a new one
 * is made — the stored id is a note of theirs, not the record of record.
 *
 * The account's address comes from the primary calendar, whose id IS the
 * email. That costs no extra scope, unlike asking the userinfo endpoint.
 */
export async function ensureDedicatedCalendar(
  accessToken: string,
  deps: GoogleCalendarDeps = defaultDeps,
): Promise<GoogleConnection> {
  const stored = await deps.readConnection();

  let calendarId = "";
  if (stored?.calendarId) {
    const existing = await callGoogle(`/calendars/${encodeURIComponent(stored.calendarId)}`, accessToken, deps);
    if (existing.ok) calendarId = stored.calendarId;
    else if (existing.status !== 404 && existing.status !== 410) {
      throw new GoogleCalendarError("google", `Could not read the FocusFlow calendar (${existing.status}).`);
    }
  }

  if (!calendarId) {
    const created = await callGoogle("/calendars", accessToken, deps, {
      method: "POST",
      body: JSON.stringify({ summary: DEDICATED_CALENDAR_NAME }),
    });
    const id = created.body?.id;
    if (!created.ok || typeof id !== "string" || !id) {
      throw new GoogleCalendarError("google", `Could not create the FocusFlow calendar (${created.status}).`);
    }
    calendarId = id;
  }

  const primary = await callGoogle("/calendars/primary", accessToken, deps);
  const email = typeof primary.body?.id === "string" ? primary.body.id : (stored?.accountEmail ?? "");

  const connection: GoogleConnection = { calendarId, accountEmail: email };
  await deps.writeConnection(connection);
  return connection;
}

/** What the settings card draws before anything is pressed. */
export async function readConnection(deps: GoogleCalendarDeps = defaultDeps): Promise<GoogleConnection | null> {
  return deps.readConnection();
}

/**
 * The flow this client started, kept where a full page navigation cannot lose
 * it — the web half leaves the app entirely and comes back to a fresh mount.
 *
 * It lives here rather than inside the settings card because two screens need
 * it now. The card spends it, and the settings page READS it to decide which
 * tab to open on: a code that comes back to a screen with nobody listening is
 * a connection that silently does not happen, and the card is only listening
 * while the Calendar tab is the one drawn.
 */
const PENDING_KEY = "focusflow.google.pendingConnect";

export function readPendingConnect(): PendingConnect | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingConnect>;
    if (typeof parsed?.nonce !== "string" || (parsed.platform !== "web" && parsed.platform !== "desktop")) return null;
    return { nonce: parsed.nonce, platform: parsed.platform };
  } catch {
    return null;
  }
}

export function writePendingConnect(pending: PendingConnect | null): void {
  try {
    if (pending) window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // A browser that refuses storage cannot hold a nonce, and without one the
    // callback is unverifiable. Better to fail on the way back, where there is
    // something to say, than to pretend the flow started.
  }
}
