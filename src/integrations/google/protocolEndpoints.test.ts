import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), exchange: vi.fn(), refresh: vi.fn(), write: vi.fn() }));
vi.mock("./lifecycle", async importOriginal => ({ ...await importOriginal<typeof import("./lifecycle")>(),
  withGoogleLifecycle: vi.fn().mockImplementation((_user, _kind, work) => work({ remoteStarted() {}, remoteSettled() {} })),
}));
vi.mock("./calendarBinding", async importOriginal => ({
  ...await importOriginal<typeof import("./calendarBinding")>(), bindDedicatedCalendar: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./identity", async importOriginal => ({
  ...await importOriginal<typeof import("./identity")>(),
  verifyGoogleIdentity: vi.fn().mockResolvedValue({ subject: "sub", email: "" }),
  storeVerifiedGoogleGrant: mocks.write,
}));
vi.mock("../../integrations/google", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "user" }),
  readGoogleOAuthEnv: vi.fn().mockReturnValue({}),
  readRefreshToken: vi.fn().mockResolvedValue("refresh"),
  refreshAccessToken: mocks.refresh, exchangeCode: mocks.exchange, writeRefreshToken: mocks.write,
  GoogleOAuthError: class extends Error {}, UnauthorizedError: class extends Error {},
}));
vi.mock("../../integrations/google/protocol", async importOriginal => ({
  ...await importOriginal<typeof import("../../integrations/google/protocol")>(), authorizeGoogleToken: mocks.authorize,
}));
import token from "../../functions/google/token";
import connect from "../../functions/google/connect";
import { GoogleSyncProtocolError } from "../../integrations/google/protocol";
import { GoogleIdentityError, verifyGoogleIdentity } from "./identity";
import calendar from "../../functions/google/calendar";
import { bindDedicatedCalendar } from "./calendarBinding";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockReset();
  mocks.write.mockReset();
  vi.mocked(verifyGoogleIdentity).mockResolvedValue({ subject: "sub", email: "" });
  mocks.authorize.mockResolvedValue(undefined);
  mocks.exchange.mockResolvedValue({ accessToken: "private-token", refreshToken: "refresh", expiresIn: 3600, scope: "openid email" });
  mocks.refresh.mockResolvedValue({ accessToken: "private-token", expiresIn: 3600 });
});
function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
}
it("binds only the authenticated user's calendar and never accepts client credentials", async () => {
  const res = response();
  await calendar({ method: "POST", headers: {}, body: { userId: "other", calendarId: "cal", accessToken: "untrusted" } }, res);
  expect(bindDedicatedCalendar).toHaveBeenCalledWith("user", "cal", "");
  expect(res.json).toHaveBeenCalledWith({ bound: true });
});
it("blocks calendar binding when the protocol gate fails", async () => {
  mocks.authorize.mockRejectedValueOnce(new GoogleSyncProtocolError("google_sync_update_required", 426, "Update", 2));
  const res = response();
  await calendar({ method: "POST", headers: {}, body: { calendarId: "cal" } }, res);
  expect(bindDedicatedCalendar).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(426);
});
it("stores only the server verified identity on a successful connection", async () => {
  const res = response();
  await connect({ method: "POST", headers: {}, body: { code: "code", subject: "forged" } }, res);
  expect(mocks.write).toHaveBeenCalledWith("user", "refresh", "openid email", { subject: "sub", email: "" });
  expect(res.status).toHaveBeenCalledWith(200);
});
it("does not store or release tokens when Google identity verification fails", async () => {
  vi.mocked(verifyGoogleIdentity).mockRejectedValueOnce(new GoogleIdentityError("google_identity_unavailable", 502));
  const res = response();
  await connect({ method: "POST", headers: {}, body: { code: "code" } }, res);
  expect(mocks.write).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(502);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain("private-token");
});
it("reports an account mismatch without releasing the new access token", async () => {
  mocks.write.mockRejectedValueOnce(new GoogleIdentityError("google_identity_reconnect_required", 409));
  const res = response();
  await connect({ method: "POST", headers: {}, body: { code: "code" } }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain("private-token");
});
it.each([token, connect])("blocks before OAuth when the policy denies the client", async handler => {
  mocks.authorize.mockRejectedValueOnce(new GoogleSyncProtocolError("google_sync_update_required", 426, "Update", 2));
  const res = response();
  await handler({ method: "POST", headers: {}, body: { code: "code" } }, res);
  expect(res.status).toHaveBeenCalledWith(426);
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it.each([token, connect])("withholds a minted token if the final check fails", async handler => {
  mocks.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new GoogleSyncProtocolError("google_sync_update_required", 426, "Update", 2));
  const res = response();
  await handler({ method: "POST", headers: {}, body: { code: "code" } }, res);
  expect(mocks.authorize).toHaveBeenLastCalledWith("user", 1, 3600);
  expect(res.status).toHaveBeenCalledWith(426);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain("private-token");
  expect(mocks.write).not.toHaveBeenCalled();
});

it("forwards the account's zone to the binding", async () => {
  const res = response();
  await calendar({ method: "POST", headers: {}, body: { calendarId: "cal", timezone: "America/Denver" } }, res);
  expect(bindDedicatedCalendar).toHaveBeenCalledWith("user", "cal", "America/Denver");
});

it("drops a zone this runtime cannot build rather than letting the RPC raise on it", async () => {
  // The RPC does reject a name that is not a zone — as an exception, which is
  // a 502 by the time it reaches the reader. A client typo is not an outage.
  const res = response();
  await calendar({ method: "POST", headers: {}, body: { calendarId: "cal", timezone: "Mars/Olympus_Mons" } }, res);
  expect(bindDedicatedCalendar).toHaveBeenCalledWith("user", "cal", "");
});

it.each([[42], [null], [{}], ["   "]])("ignores a zone that is not a name at all: %j", async (zone) => {
  const res = response();
  await calendar({ method: "POST", headers: {}, body: { calendarId: "cal", timezone: zone } }, res);
  expect(bindDedicatedCalendar).toHaveBeenCalledWith("user", "cal", "");
});

it("passes the refusal's reason back to the client", async () => {
  // Without it the card says "could not verify the calendar" for a re-pin that
  // failed because a review is open — sending someone to the wrong screen.
  const { CalendarBindingError } = await import("./calendarBinding");
  vi.mocked(bindDedicatedCalendar).mockRejectedValueOnce(new CalendarBindingError(409, undefined, "reviews-unresolved"));
  const res = response();
  await calendar({ method: "POST", headers: {}, body: { calendarId: "cal", timezone: "Asia/Seoul" } }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: "reviews-unresolved" }));
});

it("says nothing extra when the refusal had no reason", async () => {
  const { CalendarBindingError } = await import("./calendarBinding");
  vi.mocked(bindDedicatedCalendar).mockRejectedValueOnce(new CalendarBindingError(409));
  const res = response();
  await calendar({ method: "POST", headers: {}, body: { calendarId: "cal" } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.not.objectContaining({ reason: expect.anything() }));
});
