import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../integrations/google", () => ({ requireUser: vi.fn().mockResolvedValue({ userId: "verified-user" }), UnauthorizedError: class extends Error {} }));
vi.mock("./taskOutbound", () => ({ executeGoogleTaskOutbound: mocks.execute }));
import handler from "../../functions/google/task-write";
const operationId = "00000000-0000-0000-0000-000000000001";
const headers = { "x-focusflow-google-sync-protocol": "2" };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn(), setHeader: vi.fn() });
beforeEach(() => { mocks.execute.mockReset(); mocks.execute.mockResolvedValue({ state: "completed" }); });
it("uses only authenticated user and reserved operation ID, ignoring injected Google credentials or desired content", async () => {
  const res = response();
  await handler({ method: "POST", headers, body: { operationId, userId: "victim", accessToken: "injected", fields: { title: "unreserved" } } }, res);
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith("verified-user", operationId);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
});
it("keeps the protocol 1 path unable to dispatch", async () => {
  const res = response(); await handler({ method: "POST", headers: {}, body: { operationId } }, res);
  expect(res.status).toHaveBeenCalledWith(426); expect(mocks.execute).not.toHaveBeenCalled();
});
it.each([null, {}, { operationId: "not-a-uuid" }, "malformed JSON"])("rejects invalid request %j", async body => {
  const res = response(); await handler({ method: "POST", headers, body }, res);
  expect(res.status).toHaveBeenCalledWith(400); expect(mocks.execute).not.toHaveBeenCalled();
});
it("reports a pending operation without exposing server credentials or asking the client to resend PATCH", async () => {
  const res = response(); mocks.execute.mockResolvedValue({ state: "pending" });
  await handler({ method: "POST", headers, body: { operationId } }, res);
  expect(res.status).toHaveBeenCalledWith(202); expect(res.json).toHaveBeenCalledWith({ state: "pending" });
});
it("sanitizes internal errors", async () => {
  const res = response(); mocks.execute.mockRejectedValue(Error("refresh-token-secret"));
  await handler({ method: "POST", headers, body: { operationId } }, res);
  expect(res.status).toHaveBeenCalledWith(503); expect(JSON.stringify(res.json.mock.calls)).not.toContain("secret");
});
it("does not dispatch through GET", async () => {
  const res = response(); await handler({ method: "GET", headers, body: { operationId } }, res);
  expect(res.status).toHaveBeenCalledWith(405); expect(mocks.execute).not.toHaveBeenCalled();
});
