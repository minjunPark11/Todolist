import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import start from "./start";

/**
 * 연결의 첫 걸음이 실패했을 때, 그 실패를 누가 읽는가.
 *
 * 이 주소는 fetch 로 불리지 않는다. 앱이 `window.location.assign` 으로 통째로
 * 넘어오거나(웹) 시스템 브라우저를 여는 곳이다(데스크톱, §4.4). 그래서 여기서
 * 돌려주는 것은 화면 전체가 된다 — 앱은 이미 사라진 뒤다.
 *
 * 그런데 두 실패가 JSON 이었다. 설정이 안 된 배포에서 "연결"을 누르면 앱이
 * 사라지고 그 자리에 `{"error":"...missing env: GOOGLE_CLIENT_ID..."}` 가 떴다.
 * 누른 사람에게는 읽을 것도, 돌아갈 길도 없다.
 *
 * JSON 을 없앨 수는 없다 — §12.1 의 확인 절차가 이 응답의 본문으로 설정이
 * 끝났는지를 판정하고, 빠진 변수 이름이 거기 있어야 한다. 그래서 읽는 쪽을
 * 보고 나눈다. 이 파일은 그 **둘 다** 를 고정한다: 한쪽만 고치면 사람이 못
 * 읽거나 운영자의 확인 절차가 죽는다.
 */

function response() {
  const headers: Record<string, string> = {};
  return {
    headers,
    body: "" as string,
    payload: undefined as unknown,
    code: 0,
    status(value: number) { this.code = value; return this; },
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    json(value: unknown) { this.payload = value; },
    end(value?: string) { this.body = value ?? ""; },
  };
}

const GOOD_STATE = "a1b2c3d4e5f60718.web";
const BROWSER = { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
const CURL = { accept: "*/*" };

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("연결 시작 — 설정이 안 된 배포", () => {
  it("브라우저에는 읽을 문장과 돌아갈 길을 준다", () => {
    const res = response();
    start({ method: "GET", query: { state: GOOD_STATE }, headers: BROWSER }, res);

    expect(res.code).toBe(500);
    expect(res.headers["content-type"], "JSON 으로 주면 브라우저가 날 것을 그린다").toContain("text/html");
    expect(res.body).toContain("not set up on this server");
    expect(res.body, "돌아갈 길이 없으면 앱이 사라진 채로 끝난다").toContain('href="/"');
    expect(res.body, "누른 사람이 할 수 있는 일이 아니다 — 변수 이름은 운영자의 답이다").not.toContain("GOOGLE_CLIENT_ID");
    expect(res.payload, "본문을 둘로 보내면 안 된다").toBeUndefined();
  });

  it("curl 에는 지금까지와 똑같은 JSON 을 준다 — §12.1 의 확인 절차", () => {
    const res = response();
    start({ method: "GET", query: { state: GOOD_STATE }, headers: CURL }, res);

    expect(res.code).toBe(500);
    const error = (res.payload as { error?: string })?.error ?? "";
    expect(error, "빠진 변수 이름이 본문에 있어야 설정이 끝났는지 판정할 수 있다").toContain("GOOGLE_CLIENT_ID");
    expect(error).toContain("GOOGLE_CLIENT_SECRET");
    expect(error).toContain("GOOGLE_REDIRECT_URI");
    expect(res.body, "JSON 을 기다리는 쪽에 HTML 을 주면 안 된다").toBe("");
  });

  it("Accept 가 아예 없으면 JSON 이다 — 기계가 기본값이다", () => {
    const res = response();
    start({ method: "GET", query: { state: GOOD_STATE } }, res);
    expect(res.code).toBe(500);
    expect((res.payload as { error?: string })?.error).toContain("missing env");
  });
});

describe("연결 시작 — 우리가 시작하지 않은 링크", () => {
  it("브라우저에는 무엇을 하라는지 말한다", () => {
    const res = response();
    start({ method: "GET", query: { state: "쓰레기" }, headers: BROWSER }, res);

    expect(res.code).toBe(400);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("not one we started");
    expect(res.body, "여기서도 돌아갈 길은 있어야 한다").toContain('href="/"');
  });

  it("curl 에는 JSON 이다", () => {
    const res = response();
    start({ method: "GET", query: { state: "쓰레기" }, headers: CURL }, res);
    expect(res.code).toBe(400);
    expect((res.payload as { error?: string })?.error).toBe("Missing or malformed state.");
  });
});

describe("자기 점검", () => {
  it("설정이 끝나 있으면 구글로 보낸다 — 브라우저든 아니든", () => {
    // 위 검사들이 "언제나 실패 페이지를 그리면" 전부 통과한다. 성공하는 길이
    // 여전히 성공하는지를 같이 고정한다.
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://example.com/api/google/callback");

    for (const headers of [BROWSER, CURL]) {
      const res = response();
      start({ method: "GET", query: { state: GOOD_STATE }, headers }, res);
      expect(res.code).toBe(302);
      expect(res.headers.location).toContain("accounts.google.com");
      expect(res.headers.location, "state 는 그대로 실려 가야 돌아올 때 우리 것인지 안다").toContain(encodeURIComponent(GOOD_STATE));
      expect(res.headers["cache-control"], "한 번 쓰는 state 가 캐시되면 다음 시도가 잊힌 nonce 로 돌아온다").toBe("no-store");
    }
  });

  it("GET 이 아니면 거절한다", () => {
    const res = response();
    start({ method: "POST", query: { state: GOOD_STATE }, headers: BROWSER }, res);
    expect(res.code).toBe(405);
    expect(res.headers.allow).toBe("GET, HEAD");
  });
});
