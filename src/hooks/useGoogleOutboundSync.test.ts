// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareGoogleTasks, useGoogleOutboundSync, type GoogleOutboundSyncInput } from "./useGoogleOutboundSync";
import { planOutbound } from "../domain/calendar/googleSync/outboundPlan";
import type { Project, Tag, Task, TaskTag } from "../types";

const mocks = vi.hoisted(() => ({ read: vi.fn(), token: vi.fn(), save: vi.fn(), labels: vi.fn(), outbound: vi.fn() }));
vi.mock("../lib/googleCalendar", () => ({
  currentAccessToken: mocks.token, readConnection: mocks.read, saveLabelsSupported: mocks.save,
  googleCalendarFetch: vi.fn(), GOOGLE_CONNECTION_CHANGED: "connection", GOOGLE_LABELS_STATUS: "labels",
  GOOGLE_SYNC_REQUESTED: "manual", GOOGLE_SYNC_FINISHED: "finished",
}));
vi.mock("../lib/googleCalendarLabels", () => ({ runLabels: mocks.labels }));
vi.mock("../lib/googleCalendarOutbound", () => ({ runOutbound: mocks.outbound }));
const task = { id: "t", title: "Title", description: "Body", tags: ["urgent"], projectId: "p", dueDate: "2026-09-08", updatedAt: "2026-09-08", googleEventId: "event", googleSyncedAt: "2026-09-08" } as Task;
const labels = { supported: true, failed: false, mappings: [{ projectId: "p", googleLabelId: "label" }], overflow: 0 };
const emptyResult = { mapped: [], unlinked: [], clearedOrphans: [], failed: 0, expired: false };
const input = (): GoogleOutboundSyncInput => ({ tasks: [task], projects: [{ id: "p", googleLabelId: "label" } as Project], tags: [], taskTags: [], timezone: "Asia/Seoul", signedIn: true, tombstones: [], onResult: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", labelsSupported: true });
  mocks.token.mockResolvedValue("token"); mocks.save.mockResolvedValue(undefined);
  mocks.labels.mockResolvedValue(labels); mocks.outbound.mockResolvedValue(emptyResult);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1800); }); };

it("plans a one-time metadata upgrade and then stops", () => {
  // The key changed shape when tags stopped going to Google, and that is the
  // migration: every already-synced task mismatches once, takes one PATCH, and
  // comes back with a description carrying no `--- FocusFlow ---` block.
  const [prepared] = prepareGoogleTasks([task], labels);
  expect(planOutbound([prepared]).update).toHaveLength(1);
  const synced = { ...task, googleMetadataKey: prepared.metadataKey };
  expect(planOutbound(prepareGoogleTasks([synced], labels)).update).toHaveLength(0);
  // A List's label is not on the Task, so this is what still has to be caught
  // without `updatedAt` moving.
  expect(prepareGoogleTasks([{ ...synced, projectId: "inbox" }], labels)[0].eventLabelId).toBeNull();
});

it("runs labels before events and stops making requests after the metadata is recorded", async () => {
  const props = input();
  const { rerender } = renderHook((value) => useGoogleOutboundSync(value), { initialProps: props });
  await tick();
  expect(mocks.labels.mock.invocationCallOrder[0]).toBeLessThan(mocks.outbound.mock.invocationCallOrder[0]);
  const prepared = mocks.outbound.mock.calls[0][0].plan.update[0];
  expect(prepared.eventLabelId).toBe("label");
  rerender({ ...props, tasks: [{ ...task, googleMetadataKey: prepared.metadataKey }] });
  await tick();
  expect(mocks.token).toHaveBeenCalledTimes(1);
  expect(mocks.outbound).toHaveBeenCalledTimes(1);
});

it("skips labels on an unsupported account and retries them on manual sync", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", labelsSupported: false });
  renderHook(() => useGoogleOutboundSync(input()));
  await tick();
  expect(mocks.labels).not.toHaveBeenCalled();
  expect(mocks.outbound.mock.calls[0][0]).toMatchObject({ labelsSupported: false });
  await act(async () => { window.dispatchEvent(new Event("manual")); });
  expect(mocks.labels).toHaveBeenCalledTimes(1);
});

it("does not apply results after signing out during a pass", async () => {
  let resolve!: (value: typeof emptyResult) => void;
  mocks.outbound.mockReturnValue(new Promise((done) => { resolve = done; }));
  const props = input();
  const { rerender } = renderHook((value) => useGoogleOutboundSync(value), { initialProps: props });
  await tick();
  rerender({ ...props, signedIn: false });
  await act(async () => { resolve(emptyResult); });
  expect(props.onResult).not.toHaveBeenCalled();
});
