// Step 1 of the OAuth round trip (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// The app navigates here and this redirects to Google. Building the authorize
// URL on the server is why NO client id reaches the bundle: one secret-free
// variable fewer to keep in `.env`, `release.yml` and GitHub Secrets at once,
// which is exactly the shape of the v0.1.4 outage.
//
// Unauthenticated on purpose. It leaks nothing — the client id is public by
// definition and appears in the browser's address bar a moment later — and
// requiring a bearer token here is impossible anyway: this is a top-level
// navigation, not a fetch, so no header comes with it.
import { authorizeUrl, decodeOAuthState, readGoogleOAuthEnv } from "../../integrations/google";

interface AdapterRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface AdapterResponse {
  status(code: number): AdapterResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(body?: string): void;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function handler(req: AdapterRequest, res: AdapterResponse): void {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }

  // Validated here rather than only on the way back, so a malformed `state`
  // fails on this side of Google's consent screen — where the message can say
  // what happened, instead of after the user has approved something.
  const state = first(req.query?.state);
  if (!decodeOAuthState(state)) {
    res.status(400).json({ error: "Missing or malformed state." });
    return;
  }

  let env;
  try {
    env = readGoogleOAuthEnv();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Not configured." });
    return;
  }

  // No caching: the URL carries a one-shot state, and a cached 302 would send
  // the next attempt back with a nonce the client has already forgotten.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", authorizeUrl(env, state as string));
  res.status(302).end();
}
