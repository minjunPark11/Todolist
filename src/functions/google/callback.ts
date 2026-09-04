// Step 2: Google comes back here (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// A BOUNCE, and nothing more. It holds no secret, talks to nobody, and cannot
// tell which FocusFlow user this is — the redirect is a top-level navigation,
// so the Supabase session in the app's localStorage never reaches it.
//
// That limitation is what shapes the whole flow, and it turns out well: the
// code is handed back to the app, which HAS a session, and the app posts it to
// /api/google/connect. So the one endpoint that holds the client secret is
// also the one that knows who is asking.
//
// This is also the only reason `focusflow://` works at all. Google will not
// redirect to a custom scheme for a desktop client (§4.4, chain step 1); it
// redirects to this https address, and this hands off to the scheme.
import { CALLBACK_LANDING_PATH, CALLBACK_ROUTE } from "../../domain/calendar/googleSync/connectFlow";
import { decodeOAuthState } from "../../integrations/google";
import { readAppUrl } from "../../server/mcp";

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

  const state = decodeOAuthState(first(req.query?.state));
  if (!state) {
    // Nowhere safe to send this. Without a state we do not know whether the
    // caller wanted a web page or a desktop app, and guessing would hand an
    // unknown party's code to whichever we picked.
    res.status(400).end("This sign-in link is not one we started.");
    return;
  }

  // Google reports a refusal in `error` and never sends a code with it. Carried
  // through rather than swallowed: "you pressed Cancel" and "something broke"
  // deserve different words, and only the app can say them in the user's
  // language.
  const error = first(req.query?.error);
  const code = first(req.query?.code);

  const params = new URLSearchParams({ state: state.nonce });
  if (error) params.set("error", error);
  else if (code) params.set("code", code);
  else params.set("error", "no_code");

  if (state.platform === "desktop") {
    // Registered by the installer from tauri.conf.json, and by
    // `register_all()` in development (src-tauri/src/main.rs).
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", `focusflow://${CALLBACK_ROUTE}?${params.toString()}`);
    res.status(302).end();
    return;
  }

  const appUrl = readAppUrl();
  if (!appUrl) {
    res.status(500).end("This deployment has not been told its own address (APP_URL).");
    return;
  }

  // The hash and not the query string: a code in the query is written to server
  // logs, `Referer` headers and browser history. In the fragment it stays in
  // the tab, and the app strips it as soon as it has read it.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", `${appUrl}${CALLBACK_LANDING_PATH}#${CALLBACK_ROUTE}?${params.toString()}`);
  res.status(302).end();
}
