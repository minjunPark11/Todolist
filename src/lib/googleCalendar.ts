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
import { DEPLOYED_WEB_ORIGIN, type PendingConnect } from "../domain/calendar/googleSync/connectFlow";
import { isTauriRuntime } from "../platform/tauri";
import { supabase } from "../services/supabaseClient";
import { readGoogleTaskSyncState } from "./googleTaskSyncState";
import { GOOGLE_SYNC_PROTOCOL, GOOGLE_SYNC_PROTOCOL_HEADER, GOOGLE_SYNC_POLICY_EVENT, type GoogleSyncPolicyReason } from "../domain/calendar/googleSync/protocol";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** The name the dedicated calendar carries in the user's Google account. */
export const DEDICATED_CALENDAR_NAME = "FocusFlow";

export interface GoogleConnection {
  /** The dedicated calendar (§4.1). Everything in and out is scoped to it. */
  calendarId: string;
  /** Which Google account this is, so the settings screen can name it. */
  accountEmail: string;
  labelsSupported?: boolean | null;
}

/**
 * Why something did not work, in the terms the card has words for.
 *
 * A reason and not a message: the strings belong in the catalogue, and a
 * message from Google is rarely in the user's language.
 *
 * `signedOut` and `rejected` are both 401s and are deliberately two reasons,
 * because they are two different repairs. `signedOut` is "there is no session"
 * and signing in fixes it. `rejected` is "there IS a session and the server
 * would not take it" — which signing in again cannot fix, because the token it
 * mints is refused for the same reason the last one was. Telling that reader to
 * sign in sends them round a loop they cannot leave.
 */
export type FailureReason = "signedOut" | "rejected" | "network" | "google" | "store" | "identityMismatch" | "identityUnavailable" | "calendarVerification" | "lifecycleBusy" | "lifecycleRecovery" | "syncInProgress" | "outboundInFlight" | "reviewsUnresolved" | "bindingChanged" | GoogleSyncPolicyReason;

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
  writeConnection: (connection: GoogleConnection, timezone: string) => Promise<void>;
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
    .select("*")
    .maybeSingle();
  if (error) throw new GoogleCalendarError("store", error.message);
  if (!data?.calendar_id) return null;
  return { calendarId: data.calendar_id as string, accountEmail: (data.account_email as string) || "", labelsSupported: typeof data.labels_supported === "boolean" ? data.labels_supported : null };
}

async function supabaseWriteConnection(connection: GoogleConnection, timezone: string): Promise<void> {
  await callOwnApi("/api/google/calendar", defaultDeps, {
    calendarId: connection.calendarId,
    ...(timezone ? { timezone } : {}),
  });
}

/** Native HTTP reaches the deployed API instead of the desktop asset origin. */
export async function googleCalendarFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isTauriRuntime()) return fetch(input, init);
  const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
  const url = typeof input === "string" ? new URL(input, DEPLOYED_WEB_ORIGIN).href : input;
  return nativeFetch(url, init);
}

export const GOOGLE_LABELS_STATUS = "focusflow:google-labels-status";
export const GOOGLE_SYNC_FINISHED = "focusflow:google-sync-finished";
export const GOOGLE_SYNC_REQUESTED = "focusflow:google-sync-requested";
export async function saveLabelsSupported(calendarId: string, supported: boolean | null): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase.from("google_calendar_connections").update({ labels_supported: supported })
    .eq("user_id", data.user.id).eq("calendar_id", calendarId);
  if (error) throw new GoogleCalendarError("store", error.message);
}

export const GOOGLE_CONNECTION_CHANGED = "focusflow:google-connection-changed";

export function notifyGoogleConnectionChanged() {
  window.dispatchEvent(new Event(GOOGLE_CONNECTION_CHANGED));
}

export const defaultDeps: GoogleCalendarDeps = {
  fetch: googleCalendarFetch,
  authToken: supabaseToken,
  readConnection: supabaseReadConnection,
  writeConnection: supabaseWriteConnection,
};

/**
 * What a refusal from one of our own endpoints means to the card.
 *
 * Every 401 used to read as `signedOut`, and that was wrong for all but one of
 * them. `requireUser` refuses for two quite different reasons and says which in
 * `code`: `missing_token` is a request that carried no bearer at all, and
 * `invalid_token` is a bearer the verifier would not accept — a token signed
 * with an algorithm this deployment refuses, signed with a key its JWKS does
 * not publish, or issued by a different Supabase project than the one the
 * functions are configured for (`server/mcp/jwks.ts`).
 *
 * Only the first is a session problem. The rest are deployment problems that
 * every future sign-in reproduces exactly, and a card that answers them with
 * "sign in first" hides the one fact that would end the search — which is why
 * the server's own words travel with this (see `describe` in the card).
 */
function failureFor(status: number, code: string | undefined, reason?: string): FailureReason {
  if (status === 409 && code === "google_calendar_verification_failed") {
    if (reason === "sync-in-progress") return "syncInProgress";
    if (reason === "outbound-in-flight") return "outboundInFlight";
    if (reason === "reviews-unresolved") return "reviewsUnresolved";
    if (reason === "generation-changed" || reason === "grant-changed") return "bindingChanged";
  }
  if (code === "google_lifecycle_blocked" && status === 409) return "lifecycleBusy";
  if (code === "google_lifecycle_blocked" && status === 503) return "lifecycleRecovery";
  if ((status === 409 || status === 502) && code === "google_calendar_verification_failed") return "calendarVerification";
  if (status === 409 && code === "google_identity_reconnect_required") return "identityMismatch";
  if (status === 502 && code === "google_identity_unavailable") return "identityUnavailable";
  if (status === 426 && code === "google_sync_update_required") return "updateRequired";
  if (status === 503 && code === "google_sync_policy_unavailable") return "policyUnavailable";
  if (status !== 401) return "google";
  return code === "invalid_token" ? "rejected" : "signedOut";
}

/** One of our own endpoints, called as the signed-in user. */
async function callOwnApi(path: string, deps: GoogleCalendarDeps, body?: unknown): Promise<unknown> {
  const token = await deps.authToken();
  if (!token) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");

  let response: Response;
  try {
    response = await deps.fetch(path, {
      method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", [GOOGLE_SYNC_PROTOCOL_HEADER]: deps === defaultDeps && readGoogleTaskSyncState().enabled ? "2" : GOOGLE_SYNC_PROTOCOL },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new GoogleCalendarError("network", "Could not reach the FocusFlow server.");
  }

  const payload = (await response.json().catch(() => null)) as { error?: string; code?: string; reason?: string } | null;
  if (typeof window !== "undefined" && (path === "/api/google/token" || path === "/api/google/connect")) {
    const reason = failureFor(response.status, payload?.code);
    if (response.ok || reason === "updateRequired" || reason === "policyUnavailable") {
      window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_POLICY_EVENT, { detail: { reason: response.ok ? null : reason } }));
    }
  }
  if (!response.ok) {
    throw new GoogleCalendarError(
      failureFor(response.status, payload?.code, payload?.reason),
      payload?.error || `Request failed (${response.status}).`,
    );
  }
  return payload;
}

/** Rebind the existing calendar without replacing its grant or generation. */
export async function alignGoogleTimezone(calendarId: string, timezone: string, deps: GoogleCalendarDeps = defaultDeps): Promise<void> {
  await callOwnApi("/api/google/calendar", deps, { calendarId, timezone });
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
  timezone = "",
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

  // Reconnecting must not make a SECOND FocusFlow calendar.
  //
  // The stored row is the app's memory of which calendar is ours, and it is
  // not the only place the answer exists — the account itself has a calendar
  // called FocusFlow, put there by this code. Without this lookup, a
  // disconnect (or a device that connects before the row is readable) creates
  // another one, and then the same work is in Google twice: the events written
  // before the reconnect sit in the old calendar with nothing to update them.
  //
  // Matched on the name this file writes and on ownership — a calendar
  // someone shared with the account happens to be called FocusFlow is not
  // ours to write into.
  if (!calendarId) {
    const list = await callGoogle("/users/me/calendarList?maxResults=250", accessToken, deps);
    const items = Array.isArray(list.body?.items) ? (list.body.items as Record<string, unknown>[]) : [];
    const mine = items.find(
      (item) =>
        item.summary === DEDICATED_CALENDAR_NAME &&
        item.accessRole === "owner" &&
        typeof item.id === "string" &&
        item.id,
    );
    if (mine) calendarId = mine.id as string;
  }

  if (!calendarId) {
    // The zone is sent at creation, not left to Google's default, because the
    // default is the account's setting AT THAT MOMENT and the calendar keeps
    // it forever. A calendar made on a machine that disagreed with its owner
    // — travelling, on a VPN — pins that disagreement into every event that
    // ever syncs through it, and 025 refuses to re-bind a different zone.
    const created = await callGoogle("/calendars", accessToken, deps, {
      method: "POST",
      body: JSON.stringify({ summary: DEDICATED_CALENDAR_NAME, ...(timezone ? { timeZone: timezone } : {}) }),
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
  await deps.writeConnection(connection, timezone);
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
