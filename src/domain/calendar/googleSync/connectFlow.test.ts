import { describe, expect, it } from "vitest";
import {
  CALLBACK_ROUTE,
  hrefWithoutCallback,
  newNonce,
  parseCallback,
  resolveCallback,
  startPath,
} from "./connectFlow";

const pending = { nonce: "a1b2c3d4e5f60718", platform: "web" as const };

describe("the nonce", () => {
  it("is hex the server's state parser will accept", () => {
    const nonce = newNonce((size) => new Uint8Array(size).fill(0xab));
    expect(nonce).toBe("ab".repeat(16));
    expect(nonce).toMatch(/^[a-f0-9]{16,64}$/);
  });

  it("pads a byte that is one digit", () => {
    expect(newNonce(() => Uint8Array.from([1, 2]))).toBe("0102");
  });
});

describe("where the flow begins", () => {
  it("carries the nonce and the platform as one state", () => {
    expect(startPath(pending)).toBe("/api/google/start?state=a1b2c3d4e5f60718.web");
  });

  it("says desktop when that is who asked", () => {
    expect(startPath({ ...pending, platform: "desktop" })).toContain(".desktop");
  });
});

describe("reading the callback", () => {
  it("reads the web fragment", () => {
    expect(parseCallback(`https://app.example/settings#${CALLBACK_ROUTE}?state=abc&code=xyz`)).toEqual({
      nonce: "abc",
      code: "xyz",
    });
  });

  it("reads the desktop deep link", () => {
    expect(parseCallback(`focusflow://${CALLBACK_ROUTE}?state=abc&error=access_denied`)).toEqual({
      nonce: "abc",
      error: "access_denied",
    });
  });

  it("reads a bare fragment", () => {
    expect(parseCallback(`#${CALLBACK_ROUTE}?state=abc&code=xyz`)?.code).toBe("xyz");
  });

  it("is null for anything that is not the callback", () => {
    expect(parseCallback("https://app.example/settings")).toBeNull();
    expect(parseCallback("focusflow://something-else?state=abc")).toBeNull();
    expect(parseCallback("")).toBeNull();
    expect(parseCallback(null)).toBeNull();
  });

  it("is null without a state, because there is nothing to check it against", () => {
    expect(parseCallback(`#${CALLBACK_ROUTE}?code=xyz`)).toBeNull();
  });
});

describe("deciding what a callback means", () => {
  it("hands over a code when the nonce is the one we sent", () => {
    expect(resolveCallback(pending, { nonce: pending.nonce, code: "xyz" })).toEqual({ kind: "code", code: "xyz" });
  });

  it("ignores a code arriving under someone else's nonce", () => {
    expect(resolveCallback(pending, { nonce: "not-ours", code: "xyz" })).toEqual({ kind: "ignored" });
  });

  it("ignores a code when no flow was started here", () => {
    expect(resolveCallback(null, { nonce: pending.nonce, code: "xyz" })).toEqual({ kind: "ignored" });
  });

  it("tells a refusal apart from a failure", () => {
    expect(resolveCallback(pending, { nonce: pending.nonce, error: "access_denied" })).toEqual({ kind: "cancelled" });
    expect(resolveCallback(pending, { nonce: pending.nonce, error: "server_error" })).toEqual({
      kind: "failed",
      reason: "server_error",
    });
  });

  it("fails when nothing came back at all", () => {
    expect(resolveCallback(pending, { nonce: pending.nonce })).toEqual({ kind: "failed", reason: "no_code" });
  });
});

describe("clearing the address", () => {
  it("drops the fragment so a reload cannot spend the code twice", () => {
    expect(hrefWithoutCallback(`https://app.example/settings#${CALLBACK_ROUTE}?state=a&code=b`)).toBe(
      "https://app.example/settings",
    );
  });

  it("leaves an address with no fragment alone", () => {
    expect(hrefWithoutCallback("https://app.example/settings")).toBe("https://app.example/settings");
  });
});
