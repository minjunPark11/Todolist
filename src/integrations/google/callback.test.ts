import { afterEach, expect, it, vi } from "vitest";
import handler from "../../functions/google/callback";

afterEach(() => vi.unstubAllEnvs());

function call(query: Record<string, string>, method = "GET") {
  const result = { status: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    status(code: number) { result.status = code; return res; },
    setHeader(name: string, value: string) { result.headers[name] = value; },
    json(body: unknown) { result.body = JSON.stringify(body); },
    end(body?: string) { result.body = body ?? ""; },
  };
  handler({ method, query }, res);
  return result;
}

const nonce = "0123456789abcdef0123456789abcdef";

it("finishes desktop navigation with a user-activated app link instead of a bare redirect", () => {
  const result = call({ state: `${nonce}.desktop`, code: 'code&"<script>' });
  expect(result.status).toBe(200);
  expect(result.headers.Location).toBeUndefined();
  expect(result.headers["Content-Type"]).toBe("text/html; charset=utf-8");
  expect(result.headers["Cache-Control"]).toBe("no-store");
  expect(result.headers["Referrer-Policy"]).toBe("no-referrer");
  expect(result.body).toContain(`href="focusflow://google-calendar?state=${nonce}&amp;code=code%26%22%3Cscript%3E"`);
  expect(result.body).not.toContain("<script>");
});

it("returns cancellation to the app without claiming the connection succeeded", () => {
  const result = call({ state: `${nonce}.desktop`, error: "access_denied", code: "ignored" });
  expect(result.body).toContain("&amp;error=access_denied");
  expect(result.body).not.toContain("code=ignored");
});

it("keeps web callbacks on the settings page", () => {
  vi.stubEnv("APP_URL", "https://example.com");
  const result = call({ state: `${nonce}.web`, code: "code" });
  expect(result.status).toBe(302);
  expect(result.headers.Location).toBe(`https://example.com/settings#google-calendar?state=${nonce}&code=code`);
});

it("does not render an app link for invalid state", () => {
  expect(call({ state: "invalid", code: "code" }).status).toBe(400);
});

it("omits the body for desktop HEAD requests", () => {
  const result = call({ state: `${nonce}.desktop`, code: "code" }, "HEAD");
  expect(result.status).toBe(200);
  expect(result.body).toBe("");
});
