import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), detach: vi.fn(), revoke: vi.fn() }));
vi.mock("./lifecycle", async importOriginal => ({ ...await importOriginal<typeof import("./lifecycle")>(),
  withGoogleLifecycle: vi.fn().mockImplementation((_user, _kind, work) => work({ remoteStarted() {}, remoteSettled() {} })),
}));
vi.mock("../../integrations/google", () => ({ requireUser: vi.fn().mockResolvedValue({ userId: "user" }),
  readGoogleOAuthEnv: vi.fn().mockReturnValue({}),
  revokeToken: mocks.revoke, UnauthorizedError: class extends Error {} }));
vi.mock("./oauth", async importOriginal => ({ ...await importOriginal<typeof import("./oauth")>(), confirmGoogleRevocation: vi.fn().mockResolvedValue(true) }));
vi.mock("./store", async importOriginal => ({ ...await importOriginal<typeof import("./store")>(),
  readDisconnectSnapshot: mocks.read, disconnectStoredCalendar: mocks.detach }));
import handler from "../../functions/google/disconnect";
import { TokenStoreError } from "./store";
const snapshot = { refreshToken: "refresh", grantVersion: "version", generation: "generation" };
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue(snapshot); mocks.revoke.mockResolvedValue(true); mocks.detach.mockReset(); });
function response() { return { status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn(), setHeader: vi.fn() }; }
it("keeps the inspected snapshot when Google revocation is unconfirmed", async () => {
  mocks.revoke.mockResolvedValueOnce(false);
  const res = response(); await handler({ method: "POST", headers: {} }, res);
  expect(mocks.detach).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(503);
});
it("does not report success or retry a stale detach against the new connection", async () => {
  mocks.detach.mockRejectedValueOnce(new TokenStoreError("Connection changed", 409));
  const res = response(); await handler({ method: "POST", headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(mocks.detach).toHaveBeenCalledTimes(1);
});
