import { describe, it, expect, vi } from "vitest";
import { authorizeGoogleToken, requestedGoogleProtocol } from "./protocol";
const env = { url: "https://example.supabase.co", serviceRoleKey: "test-key" };
describe("Google token protocol gate", () => {
  it("treats released clients as v1 and rejects ambiguous capabilities", () => {
    expect(requestedGoogleProtocol({})).toBe(1);
    expect(requestedGoogleProtocol({ "X-FocusFlow-Google-Sync-Protocol": "2" })).toBe(2);
    for (const value of ["3", "1,2", ["1", "2"], ""]) {
      expect(() => requestedGoogleProtocol({ "x-focusflow-google-sync-protocol": value })).toThrow();
    }
  });
  it("records the lifetime before token release", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ allowed: true, minimumProtocol: 1 })));
    await authorizeGoogleToken("user", 1, 3600, fetcher, env);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ p_user_id: "user", p_protocol: 1, p_expires_in: 3600 });
  });
  it("returns an upgrade error for a denied client", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ allowed: false, minimumProtocol: 2 })));
    await expect(authorizeGoogleToken("user", 1, null, fetcher, env)).rejects.toMatchObject({ status: 426, minimumProtocol: 2 });
  });
  it.each([null, {}, { allowed: true, minimumProtocol: "1" }])("fails closed on malformed policy %j", async body => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(authorizeGoogleToken("user", 1, null, fetcher, env)).rejects.toMatchObject({ status: 503 });
  });
  it("fails closed on unavailable migration and network errors", async () => {
    for (const fetcher of [vi.fn().mockResolvedValue(new Response("missing", { status: 404 })), vi.fn().mockRejectedValue(new Error("offline"))]) {
      await expect(authorizeGoogleToken("user", 1, null, fetcher, env)).rejects.toMatchObject({ status: 503 });
    }
  });
});
