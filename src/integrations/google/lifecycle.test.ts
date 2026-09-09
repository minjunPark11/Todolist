import { expect, it, vi } from "vitest";
import { withGoogleLifecycle } from "./lifecycle";
const env = { url: "https://db.example", serviceRoleKey: "service" };
const reply = (value: unknown) => new Response(JSON.stringify(value));
it("finishes only after the remote operation has settled", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ acquired: true })).mockResolvedValueOnce(reply({ finished: true }));
  const value = await withGoogleLifecycle("user", "connect", async op => { op.remoteStarted(); op.remoteSettled(); return "result"; }, fetcher, env);
  expect(value).toBe("result");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).p_state).toBe("completed");
});
it("quarantines an uncertain external result and does not run it twice", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ acquired: true })).mockResolvedValueOnce(reply({ finished: true }));
  const work = vi.fn(async op => { op.remoteStarted(); throw new Error("response lost"); });
  await expect(withGoogleLifecycle("user", "disconnect", work, fetcher, env)).rejects.toMatchObject({ status: 503 });
  expect(work).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).p_state).toBe("uncertain");
});
it.each([false, true])("does not call Google when another operation blocks the gate (uncertain=%s)", async uncertain => {
  const fetcher = vi.fn().mockResolvedValue(reply({ acquired: false, uncertain }));
  const work = vi.fn();
  await expect(withGoogleLifecycle("user", "connect", work, fetcher, env)).rejects.toMatchObject({ status: uncertain ? 503 : 409 });
  expect(work).not.toHaveBeenCalled();
});
it("retries only idempotent DB receipts with the same ID after response loss", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("begin response lost"))
    .mockResolvedValueOnce(reply({ acquired: true })).mockRejectedValueOnce(new Error("finish response lost"))
    .mockResolvedValueOnce(reply({ finished: true }));
  const work = vi.fn(async () => "done");
  expect(await withGoogleLifecycle("user", "connect", work, fetcher, env)).toBe("done");
  expect(work).toHaveBeenCalledTimes(1);
  const ids = fetcher.mock.calls.map(call => JSON.parse(call[1].body).p_operation_id);
  expect(new Set(ids).size).toBe(1);
});
it("can release after an error before any external request", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ acquired: true })).mockResolvedValueOnce(reply({ finished: true }));
  await expect(withGoogleLifecycle("user", "connect", async () => { throw new Error("validation failed"); }, fetcher, env)).rejects.toThrow("validation failed");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).p_state).toBe("completed");
});
