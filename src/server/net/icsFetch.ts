// Fetching a URL the user gave us, from a server we own.
//
// That sentence is the whole security problem: a subscription URL is user
// input, and a server that follows it can be pointed at the metadata endpoint
// of the machine it runs on, at a database on the private network, or at
// localhost. The guard below is the same one `api/ics.js` has applied since
// the ICS proxy was written; this module is the canonical copy, and
// `icsFetch.test.ts` pins the host families so the two cannot quietly drift
// apart. (The proxy adopts this module when Phase 4 brings TypeScript into
// `api/`; until then the test is what keeps them honest.)

export const MAX_ICS_BYTES = 5_000_000;
/** Per subscription. The whole-request budget is the caller's business. */
export const ICS_TIMEOUT_MS = 8_000;

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local")) return true;
  // IPv6 literals (the URL parser keeps the brackets) — blocked wholesale
  // rather than range by range, because the ways of writing a loopback or
  // link-local address in IPv6 are many and easy to get wrong.
  if (host.includes(":") || host.startsWith("[")) return true;
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

/** A subscription URL as something safe to hand to `fetch`, or nothing. */
export function normalizeIcsUrl(raw: string): URL | null {
  let target: URL;
  try {
    target = new URL(String(raw).replace(/^webcal:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  if (isBlockedHost(target.hostname)) return null;
  return target;
}

export class IcsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcsFetchError";
  }
}

export interface IcsFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Injected in tests; the real one is `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * The calendar text, or an error whose message is safe to show a user.
 *
 * `redirect: "follow"` is deliberate and is also the guard's blind spot: a
 * host that passes the check can redirect to one that would not. Vercel's
 * fetch does not expose per-hop hooks, so the mitigation that matters is the
 * one already here — nothing from the response is executed, stored, or
 * trusted beyond being parsed as text/calendar.
 */
export async function fetchIcsText(url: URL, options: IcsFetchOptions = {}): Promise<string> {
  const { timeoutMs = ICS_TIMEOUT_MS, maxBytes = MAX_ICS_BYTES, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "FocusFlow-Calendar/1.0 (+ics-sync)",
        Accept: "text/calendar, text/plain, */*",
      },
    });
  } catch (error) {
    throw new IcsFetchError(
      error instanceof Error && error.name === "TimeoutError" ? "Calendar request timed out." : "Calendar request failed.",
    );
  }

  if (!response.ok) throw new IcsFetchError(`Calendar returned HTTP ${response.status}.`);

  const text = await response.text();
  if (text.length > maxBytes) throw new IcsFetchError("Calendar feed is too large.");
  if (!text.toUpperCase().includes("BEGIN:VCALENDAR")) {
    throw new IcsFetchError("That URL did not return a calendar.");
  }
  return text;
}
