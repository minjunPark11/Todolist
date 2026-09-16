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
  headers?: Record<string, string | string[] | undefined>;
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

/**
 * 이 요청을 **사람이 보고 있는가**.
 *
 * 이 주소는 fetch 로 불리지 않는다. 앱이 `window.location.assign` 으로
 * 통째로 넘어오거나(웹), 시스템 브라우저를 여는 곳이다(데스크톱, §4.4).
 * 그래서 여기서 돌려주는 것은 화면 전체가 된다 — 앱은 이미 사라진 뒤다.
 *
 * 아래 두 실패는 JSON 이었다. 설정이 안 된 배포에서 "연결"을 누르면 앱이
 * 사라지고 그 자리에
 *
 *   {"error":"Google Calendar sync is not configured (missing env: ...)."}
 *
 * 이 떴다. 누른 사람에게는 읽을 것이 없고, 돌아갈 길도 없다.
 *
 * 그렇다고 JSON 을 없앨 수는 없다. §12.1 의 확인 절차가 이 응답의 본문으로
 * 설정이 끝났는지를 판정하고, 빠진 변수 이름이 거기 있어야 한다. 그래서
 * 읽는 쪽을 보고 나눈다 — 브라우저에는 문장을, `curl` 에는 지금까지와
 * 똑같은 JSON 을.
 */
function wantsHtml(req: AdapterRequest): boolean {
  return (first(req.headers?.accept) ?? "").includes("text/html");
}

/**
 * 돌아갈 길이 있는 한 문장.
 *
 * 빠진 환경 변수 이름은 담지 않는다. 그것은 운영자가 `curl` 로 물을 때의
 * 답이고, 연결 버튼을 누른 사람이 할 수 있는 일이 아니다. 링크는 상대
 * 경로다 — 이 페이지는 앱과 같은 원본에서 서빙되고, `APP_URL` 이 비어 있는
 * 것이 바로 이 실패의 원인일 수 있다.
 */
function page(title: string, body: string): string {
  const escape = (text: string) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    padding: 24px; }
  main { max-width: 34rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1rem; opacity: .85; }
</style></head><body><main>
<h1>${escape(title)}</h1>
<p>${escape(body)}</p>
<p><a href="/">Back to FocusFlow</a></p>
</main></body></html>`;
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
    if (wantsHtml(req)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(400).end(
        page(
          "This sign-in link is not one we started",
          "Open FocusFlow and press Connect there. A link opened on its own cannot begin a connection.",
        ),
      );
      return;
    }
    res.status(400).json({ error: "Missing or malformed state." });
    return;
  }

  let env;
  try {
    env = readGoogleOAuthEnv();
  } catch (error) {
    if (wantsHtml(req)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(500).end(
        page(
          "Google Calendar sync is not set up on this server",
          "Nothing is wrong with your account. Whoever runs this deployment has to finish the Google setup before the connection can begin.",
        ),
      );
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Not configured." });
    return;
  }

  // No caching: the URL carries a one-shot state, and a cached 302 would send
  // the next attempt back with a nonce the client has already forgotten.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", authorizeUrl(env, state as string));
  res.status(302).end();
}
