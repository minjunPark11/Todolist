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
    // Finish the HTTPS navigation before asking the browser to open the app.
    // A bare 302 to a custom scheme has no fallback when the browser does not
    // launch it. A real link also gives the launch a fresh user gesture.
    const link = `focusflow://${CALLBACK_ROUTE}?${params.toString()}`
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    res.status(200).end(req.method === "HEAD" ? undefined : `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FocusFlow로 돌아가기</title><style>
:root{font-family:system-ui,sans-serif;color:#202334;background:#f4f5fa}
body{margin:0;min-height:100vh;display:grid;place-items:center}
main{box-sizing:border-box;width:min(480px,calc(100% - 32px));padding:32px;background:white;border:1px solid #dfe2ec;border-radius:16px}
h1{font-size:24px;line-height:1.4;margin:12px 0}p{line-height:1.7;color:#50566a}
a{display:inline-block;background:#5058c9;color:white;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600}
a:hover{background:#3d44a8}a:focus-visible{outline:3px solid #202334;outline-offset:4px}
</style></head><body><main><strong>FocusFlow</strong><h1>앱으로 돌아가 연결을 마무리하세요</h1>
<p>아래 버튼을 눌러 FocusFlow로 돌아가세요. 연결 결과는 앱에서 확인할 수 있습니다.</p>
<a href="${link}">FocusFlow 열기</a>
<p>앱이 열리지 않으면 FocusFlow가 설치되어 있는지 확인한 뒤 버튼을 다시 눌러 주세요.</p>
</main></body></html>`);
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
