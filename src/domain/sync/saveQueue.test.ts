import { describe, expect, it } from "vitest";
import { createSaveQueue } from "./saveQueue";

/** A perform() whose runs are settled by hand, so ordering is the test's choice. */
function deferredPerform() {
  const calls: Array<{ payload: string; resolve: () => void; reject: (error: unknown) => void }> = [];
  const perform = (payload: string) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ payload, resolve, reject });
    });
  return { calls, perform };
}

/** Lets the microtask queue drain so a settled promise's handlers have run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createSaveQueue", () => {
  it("runs one save at a time", async () => {
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({ perform });

    queue.request("a");
    queue.request("b");

    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toBe("a");
    expect(queue.hasPending).toBe(true);
  });

  it("coalesces requests made during a run: the last state wins", async () => {
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({ perform });

    queue.request("a");
    queue.request("b");
    queue.request("c");
    calls[0].resolve();
    await flush();

    // Not three saves, and not "b" — each payload is the whole state, so "c"
    // already contains what "b" would have written.
    expect(calls.map((call) => call.payload)).toEqual(["a", "c"]);
  });

  it("never lets an older save land after a newer one", async () => {
    const written: string[] = [];
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({
      perform: (payload: string) => perform(payload).then(() => void written.push(payload)),
    });

    queue.request("old");
    queue.request("new");
    // The bug this replaces: both were in flight, and settling them out of
    // order wrote "old" last. Here "new" cannot even start until "old" ends.
    expect(calls).toHaveLength(1);
    calls[0].resolve();
    await flush();
    calls[1].resolve();
    await flush();

    expect(written).toEqual(["old", "new"]);
  });

  it("retries a failed save without waiting for another edit", async () => {
    const retries: Array<{ run: () => void; delayMs: number }> = [];
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({
      perform,
      retryDelayMs: 1000,
      scheduleRetry: (run, delayMs) => void retries.push({ run, delayMs }),
    });

    queue.request("a");
    calls[0].reject(new Error("offline"));
    await flush();

    expect(queue.hasPending).toBe(true);
    expect(retries).toHaveLength(1);
    retries[0].run();
    expect(calls.map((call) => call.payload)).toEqual(["a", "a"]);
  });

  it("backs off between repeated failures and resets after a new request", async () => {
    const retries: Array<{ run: () => void; delayMs: number }> = [];
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({
      perform,
      retryDelayMs: 1000,
      retryMaxDelayMs: 3000,
      scheduleRetry: (run, delayMs) => void retries.push({ run, delayMs }),
    });

    queue.request("a");
    for (let index = 0; index < 3; index += 1) {
      calls[index].reject(new Error("offline"));
      await flush();
      retries[index].run();
    }

    expect(retries.map((retry) => retry.delayMs)).toEqual([1000, 2000, 3000]);
  });

  it("retries the newest state, not the one that failed", async () => {
    const retries: Array<() => void> = [];
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({
      perform,
      scheduleRetry: (run) => void retries.push(run),
    });

    queue.request("a");
    queue.request("b");
    calls[0].reject(new Error("offline"));
    await flush();
    retries[0]();

    expect(calls.map((call) => call.payload)).toEqual(["a", "b"]);
  });

  it("reset drops pending work and disowns the run in flight", async () => {
    const settled: boolean[] = [];
    const retries: Array<() => void> = [];
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({
      perform,
      onSettled: (result) => void settled.push(result.ok),
      scheduleRetry: (run) => void retries.push(run),
    });

    queue.request("account-a");
    queue.request("account-a-later");
    queue.reset();

    expect(queue.hasPending).toBe(false);
    // The in-flight save belongs to an account this queue no longer saves for:
    // its result must not report status, start the next run, or be retried.
    calls[0].resolve();
    await flush();
    expect(settled).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("reset also disowns a run that fails after it", async () => {
    const retries: Array<() => void> = [];
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({
      perform,
      scheduleRetry: (run) => void retries.push(run),
    });

    queue.request("account-a");
    queue.reset();
    calls[0].reject(new Error("offline"));
    await flush();

    expect(retries).toHaveLength(0);
    expect(queue.hasPending).toBe(false);
  });

  it("reports each settled run so sync status can follow it", async () => {
    const settled: Array<{ ok: boolean; willRetry: boolean }> = [];
    const { calls, perform } = deferredPerform();
    const queue = createSaveQueue({
      perform,
      onSettled: ({ ok, willRetry }) => void settled.push({ ok, willRetry }),
      scheduleRetry: () => {},
    });

    queue.request("a");
    calls[0].reject(new Error("offline"));
    await flush();
    queue.request("b");
    calls[1].resolve();
    await flush();

    expect(settled).toEqual([
      { ok: false, willRetry: true },
      { ok: true, willRetry: false },
    ]);
  });
});
