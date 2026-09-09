import { expect, it, vi } from "vitest";
import { verifyGoogleIdentity, storeVerifiedGoogleGrant } from "./identity";
const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const env = { url: "https://example.supabase.co", serviceRoleKey: "key" };
it("reads Google's subject using the server token, with redirects disabled", async () => {
  const fetcher = reply({ sub: "subject", email: "new@example.com", email_verified: true });
  expect(await verifyGoogleIdentity("access", fetcher)).toEqual({ subject: "subject", email: "new@example.com" });
  expect(fetcher).toHaveBeenCalledWith("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: "Bearer access" }, redirect: "error" });
});
it("does not substitute email for a missing subject or trust an unverified email", async () => {
  await expect(verifyGoogleIdentity("access", reply({ email: "user@example.com", email_verified: true }))).rejects.toMatchObject({ status: 502 });
  expect(await verifyGoogleIdentity("access", reply({ sub: "subject", email: "unverified" }))).toEqual({ subject: "subject", email: "" });
});
it.each([null, {}, { sub: "" }, { sub: 123 }, { sub: " padded " }])("rejects malformed identity %j", async body => {
  await expect(verifyGoogleIdentity("access", reply(body))).rejects.toMatchObject({ code: "google_identity_unavailable" });
});
it("fails closed and keeps tokens out of errors", async () => {
  await expect(verifyGoogleIdentity("access", vi.fn().mockRejectedValue(new Error("secret")))).rejects.not.toThrow("secret");
  await expect(storeVerifiedGoogleGrant("user", "refresh", "scope", { subject: "subject", email: "" }, reply({ error: "refresh" }, 500), env)).rejects.toMatchObject({ code: "google_identity_unavailable" });
});
it("distinguishes identity mismatch from unavailable policy", async () => {
  const identity = { subject: "subject", email: "" };
  await expect(storeVerifiedGoogleGrant("user", "refresh", "scope", identity, reply({ stored: false, reason: "identity-mismatch" }), env)).rejects.toMatchObject({ status: 409 });
  await expect(storeVerifiedGoogleGrant("user", "refresh", "scope", identity, reply({ stored: true }), env)).resolves.toBeUndefined();
  await expect(storeVerifiedGoogleGrant("user", "refresh", "scope", identity, reply({}), env)).rejects.toMatchObject({ status: 502 });
});
