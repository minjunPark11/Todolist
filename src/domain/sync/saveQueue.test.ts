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

  // What the manual sync button waits on before it downloads
  // (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §2.2, F1-B): pulling the account
  // on top of unsent edits is how a user's own click loses their work.
  describe("drain", () => {
    it("settles immediately when there is nothing to upload", async () => {
      const { perform } = deferredPerform();
      const queue = createSaveQueue({ perform });
      await expect(queue.drain()).resolves.toEqual({ ok: true });
    });

    it("waits for the run in flight", async () => {
      const { calls, perform } = deferredPerform();
      const queue = createSaveQueue({ perform });
      queue.request("a");

      let settled = false;
      const drained = queue.drain().then((result) => {
        settled = true;
        return result;
      });
      await flush();
      expect(settled).toBe(false);

      calls[0].resolve();
      await expect(drained).resolves.toEqual({ ok: true });
    });

    // The queue coalesces, so a payload that arrived mid-flight has NOT been
    // uploaded when the first run finishes. Settling there would hand the
    // caller a false "everything is up".
    it("keeps waiting for work that arrived mid-flight", async () => {
      const { calls, perform } = deferredPerform();
      const queue = createSaveQueue({ perform });
      queue.request("a");

      let settled = false;
      const drained = queue.drain().then((result) => {
        settled = true;
        return result;
      });
      queue.request("b");

      calls[0].resolve();
      await flush();
      expect(settled).toBe(false);
      expect(calls[1].payload).toBe("b");

      calls[1].resolve();
      await expect(drained).resolves.toEqual({ ok: true });
    });

    // The retry is still scheduled; the caller is told not to keep waiting on
    // it, which is not the same as the upload being abandoned.
    it("reports failure rather than waiting out the backoff", async () => {
      const { calls, perform } = deferredPerform();
      const queue = createSaveQueue({ perform, scheduleRetry: () => {} });
      queue.request("a");
      const drained = queue.drain();

      calls[0].reject(new Error("offline"));
      await expect(drained).resolves.toEqual({ ok: false });
    });

    it("does not hang when the account it was saving for goes away", async () => {
      const { perform } = deferredPerform();
      const queue = createSaveQueue({ perform });
      queue.request("a");
      const drained = queue.drain();
      queue.reset();
      await expect(drained).resolves.toEqual({ ok: true });
    });

    it("answers a waiter once, not again on the next run", async () => {
      const { calls, perform } = deferredPerform();
      const queue = createSaveQueue({ perform });
      queue.request("a");

      let settlements = 0;
      void queue.drain().then(() => {
        settlements += 1;
      });
      calls[0].resolve();
      await flush();

      queue.request("b");
      calls[1].resolve();
      await flush();

      expect(settlements).toBe(1);
    });
  });
});
