import { expect, it } from "vitest";
import { acquireTaskRevisionOwnership } from "./taskRevisionOwnership";

it("excludes a second tab until the owner releases its lock", async () => {
  const owned = new Set<string>();
  const locks = { request: async (name: string, _options: unknown, run: (lock: unknown) => Promise<void>) => {
    if (owned.has(name)) return run(null);
    owned.add(name);
    try { await run({ name }); } finally { owned.delete(name); }
  } } as unknown as LockManager;
  const release = await acquireTaskRevisionOwnership("u", locks);
  await expect(acquireTaskRevisionOwnership("u", locks)).rejects.toThrow("Another tab");
  const releaseOtherAccount = await acquireTaskRevisionOwnership("other", locks);
  releaseOtherAccount(); release();
  await new Promise((done) => setTimeout(done, 0));
  const takeOver = await acquireTaskRevisionOwnership("u", locks); takeOver();
});

it("does not silently enable an uncoordinated outbox without Web Locks", async () => {
  // Null prevents the environment default from being evaluated in a Node test.
  await expect(acquireTaskRevisionOwnership("u", null as unknown as LockManager)).rejects.toThrow("Web Locks");
});
