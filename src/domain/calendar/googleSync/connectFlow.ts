// The connect round trip, as the client sees it
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// Pure, and deliberately so: this is the half of OAuth that decides whether a
// code is ours to spend, and it should be provable without a browser, a server
// or a Google account. What it does NOT do is talk to anything — `lib/
// googleCalendar.ts` is the I/O around it.
//
// The nonce is the whole CSRF story on this side. The server keeps no memory
// of the flow (see `integrations/google/state.ts`), so the only party who can
// say "yes, I started this" is the client that invented the nonce, and that
// judgement is `resolveCallback`.

/**
 * The fragment the callback bounces back to, on both platforms.
 *
 * `focusflow://google-calendar?...` on the desktop and `/settings#google-
 * calendar?...` on the web — the same word, so one parser reads both.
 */
export const CALLBACK_ROUTE = "google-calendar";

/**
 * Where the web callback lands.
 *
 * The Settings page and not the root, because the card that finishes the job
 * is drawn there: a code that arrives on a screen with nobody listening is a
 * connection that silently does not happen. The desktop has no equivalent
 * problem — the deep link wakes the app wherever it was.
 */
export const CALLBACK_LANDING_PATH = "/settings";

export type OAuthPlatform = "web" | "desktop";

export interface PendingConnect {
  nonce: string;
  platform: OAuthPlatform;
}

export interface CallbackParams {
  nonce: string;
  code?: string;
  error?: string;
}

export type ConnectOutcome =
  /** A code we started the flow for. Spend it. */
  | { kind: "code"; code: string }
  /** The user pressed Cancel on Google's screen. Not an error. */
  | { kind: "cancelled" }
  /** Google refused, or came back with nothing. */
  | { kind: "failed"; reason: string }
  /**
   * Not ours: no flow was pending, or the nonce does not match. Silence is the
   * right answer — a code smuggled into this browser must not be spent, and
   * saying so would tell whoever sent it that the address works.
   */
  | { kind: "ignored" };

/** 16 bytes as hex, which is what `integrations/google/state.ts` will accept. */
export function newNonce(randomBytes: (size: number) => Uint8Array): string {
  return Array.from(randomBytes(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Where the app navigates to begin. The server builds the consent URL. */
export function startPath(pending: PendingConnect): string {
  return `/api/google/start?state=${encodeURIComponent(`${pending.nonce}.${pending.platform}`)}`;
}

/**
 * The deployment the whole round trip runs through.
 *
 * Written down rather than read from an environment variable, and rather than
 * taken from `window.location.origin`, because neither can be right. The
 * desktop app's origin is `tauri.localhost` and a dev server's is
 * `localhost:5173`, and Google will redirect to exactly one address — the
 * production callback registered on the OAuth client (`GOOGLE_REDIRECT_URI`,
 * see `integrations/google/env.ts`). A flow begun anywhere else would come
 * back here anyway, so it may as well begin here.
 *
 * A `VITE_` variable was the alternative and is what §12.1-2 turned down: a
 * value that has to be kept the same in `.env`, `release.yml` and GitHub
 * Secrets at once is the shape of the v0.1.4 outage.
 */
export const DEPLOYED_WEB_ORIGIN = "https://todolist-three-gray-92.vercel.app";

/** The absolute address to send someone to, on either platform. */
export function consentUrl(pending: PendingConnect): string {
  return `${DEPLOYED_WEB_ORIGIN}${startPath(pending)}`;
}

/**
 * The callback's parameters, out of whatever carried them.
 *
 * Takes a whole href, a bare fragment, or a `focusflow://` URL, because the
 * three arrive by different roads and differ only in what precedes the route.
 * Anything without the route is null rather than an error: most page loads and
 * every unrelated deep link land here.
 */
export function parseCallback(raw: string | null | undefined): CallbackParams | null {
  if (!raw) return null;
  const at = raw.indexOf(`${CALLBACK_ROUTE}?`);
  if (at < 0) return null;

  const query = new URLSearchParams(raw.slice(at + CALLBACK_ROUTE.length + 1));
  const nonce = (query.get("state") || "").trim();
  if (!nonce) return null;

  const code = (query.get("code") || "").trim();
  const error = (query.get("error") || "").trim();
  return { nonce, ...(code ? { code } : {}), ...(error ? { error } : {}) };
}

/**
 * What to do about a callback, given the flow this client started.
 *
 * The nonce is compared before anything else is read. A mismatch is `ignored`
 * and not `failed`, because the two mean different things to the person: a
 * failure is theirs to retry, and this is not theirs at all.
 */
export function resolveCallback(pending: PendingConnect | null, callback: CallbackParams | null): ConnectOutcome {
  if (!callback) return { kind: "ignored" };
  if (!pending || pending.nonce !== callback.nonce) return { kind: "ignored" };

  // Google's word for "the user said no". Every other error is something they
  // could not have chosen, so only this one gets the gentle wording.
  if (callback.error === "access_denied") return { kind: "cancelled" };
  if (callback.error) return { kind: "failed", reason: callback.error };
  if (!callback.code) return { kind: "failed", reason: "no_code" };
  return { kind: "code", code: callback.code };
}

/**
 * The address with the callback taken out of it.
 *
 * The code lives in the fragment so it stays out of logs and `Referer`
 * headers, and it should not outlive its use in the address bar either — a
 * reload that re-reads a spent code would report a failed connection.
 */
export function hrefWithoutCallback(href: string): string {
  const hash = href.indexOf("#");
  if (hash < 0) return href;
  return href.slice(0, hash) || "/";
}
