// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useGoogleTaskSync } from "./useGoogleTaskSync";
import { readGoogleTaskSyncState } from "../lib/googleTaskSyncState";

vi.mock("../services/supabaseClient", () => ({ supabase: {}, supabaseUrl: "" }));
afterEach(cleanup);

function input() {
  let count = 3;
  return { enabled: true, accountKey: "first", tasks: [],
    bridge: vi.fn(async () => null) as unknown as Parameters<typeof useGoogleTaskSync>[0]["bridge"],
    conflicts: () => [{ id: "t", local: null, remote: null }], resolveConflict: vi.fn(),
    takeAutoMergedCount: vi.fn(() => { const value = count; count = 0; return value; }),
  };
}

it("publishes the completed pass's merges and does not carry them into the next pass", async () => {
  const props = input(); renderHook(() => useGoogleTaskSync(props));
  await act(async () => { await readGoogleTaskSyncState().run!(); });
  expect(readGoogleTaskSyncState()).toMatchObject({ autoMergedCount: 3, busy: false, localConflicts: [{ id: "t" }] });
  await act(async () => { await readGoogleTaskSyncState().run!(); });
  expect(readGoogleTaskSyncState().autoMergedCount).toBe(0);
});

it("reports merges without hiding a later failure", async () => {
  const props = input(); props.bridge = vi.fn(async () => { throw new Error("offline"); });
  renderHook(() => useGoogleTaskSync(props));
  await act(async () => { await readGoogleTaskSyncState().run!(); });
  expect(readGoogleTaskSyncState()).toMatchObject({ autoMergedCount: 3, error: "failed", errorDetail: "offline" });
});

it("does not consume or publish the next account's count from an old pass", async () => {
  const props = input(); let finish!: () => void;
  props.bridge = (() => new Promise<void>(resolve => { finish = resolve; })) as unknown as typeof props.bridge;
  const { rerender } = renderHook(value => useGoogleTaskSync(value), { initialProps: props });
  let run!: Promise<void>;
  act(() => { run = readGoogleTaskSyncState().run!(); });
  rerender({ ...props, accountKey: "second" });
  await act(async () => { finish(); await run; });
  expect(readGoogleTaskSyncState().autoMergedCount).toBeUndefined();
  expect(props.takeAutoMergedCount).not.toHaveBeenCalled();
});
