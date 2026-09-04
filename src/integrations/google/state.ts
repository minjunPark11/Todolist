// The OAuth `state` parameter (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// Pure. It carries two things through a round trip the server keeps no memory
// of: a nonce the CLIENT invented, and which platform asked — the one bit the
// callback needs in order to know whether to bounce back into a web page or
// out to `focusflow://`.
//
// The nonce is not checked here and is not stored anywhere on the server. The
// client that started the flow is the only party that knows what it sent, and
// it compares on the way back. That is the whole CSRF story, and it is enough
// because of what happens NEXT: a code is worthless until it is posted to
// /api/google/connect with a Supabase session, so a code smuggled into someone
// else's browser cannot attach a Google account to their FocusFlow account
// unless their own client agrees to send it — which the nonce check is what
// stops.

export type OAuthPlatform = "web" | "desktop";

export interface OAuthState {
  nonce: string;
  platform: OAuthPlatform;
}

/** Nonces are hex from `crypto.getRandomValues`; nothing else is accepted. */
const NONCE = /^[a-f0-9]{16,64}$/i;

export function encodeOAuthState(state: OAuthState): string {
  return `${state.nonce}.${state.platform}`;
}

/**
 * Reads a `state` we produced, or null.
 *
 * Null for anything unexpected rather than a thrown error or a default: the
 * only caller is the callback, and a `state` it did not write is either a stale
 * link or someone probing. Both deserve the same flat refusal, and defaulting
 * the platform would send an attacker's code to whichever destination we
 * guessed.
 */
export function decodeOAuthState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const nonce = raw.slice(0, separator);
  const platform = raw.slice(separator + 1);
  if (!NONCE.test(nonce)) return null;
  if (platform !== "web" && platform !== "desktop") return null;

  return { nonce, platform };
}
