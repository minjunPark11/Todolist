// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useGoogleOutboundSync } from "./useGoogleOutboundSync";
import type { Task } from "../types";
const mocks = vi.hoisted(() => ({ read: vi.fn(), token: vi.fn(), run: vi.fn() }));
vi.mock("../lib/googleCalendar", () => ({
  readConnection: mocks.read, currentAccessToken: mocks.token,
  ensureDedicatedCalendar: vi.fn(), notifyGoogleConnectionChanged: vi.fn(),
  GOOGLE_CONNECTION_CHANGED: "focusflow:google-connection-changed",
}));
vi.mock("../lib/googleCalendarOutbound", () => ({ runOutbound: mocks.run }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("starts syncing after connecting without a reload and stops after disconnecting", async () => {
  mocks.read.mockResolvedValue(null);
  mocks.token.mockResolvedValue("access");
  mocks.run.mockResolvedValue({ expired: false });
  renderHook(() => useGoogleOutboundSync({
    tasks: [{ id: "task", title: "Test", dueDate: "2026-09-06" } as Task],
    timezone: "Asia/Shanghai", tombstones: [], signedIn: true, onResult: vi.fn(),
  }));
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(mocks.run).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue({ calendarId: "new-calendar" });
  await act(async () => { window.dispatchEvent(new Event("focusflow:google-connection-changed")); });
  expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.run.mock.calls[0][0].calendarId).toBe("new-calendar");
  mocks.read.mockResolvedValue(null);
  await act(async () => { window.dispatchEvent(new Event("focusflow:google-connection-changed")); });
  expect(mocks.run).toHaveBeenCalledTimes(1);
});

// Naming the event before it is made, and writing the name down FIRST
// (GOOGLE_SYNC_HARDENING_DESIGN.md §3.4).
//
// The order is the fix. A reservation recorded after the request would be
// exactly as useless as no reservation at all: the case it exists for is the
// one where the response never arrives.
it("writes the reserved id down before the create goes out", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal" });
  mocks.token.mockResolvedValue("access");
  const order: string[] = [];
  mocks.run.mockImplementation(async () => {
    order.push("run");
    return { expired: false, mapped: [], unlinked: [], clearedOrphans: [], failed: 0 };
  });
  const onResult = vi.fn((result: { reserved?: readonly unknown[] }) => {
    order.push(result.reserved ? "reserved" : "outcome");
  });

  renderHook(() => useGoogleOutboundSync({
    tasks: [{ id: "task", title: "Test", dueDate: "2026-09-06" } as Task],
    timezone: "Asia/Seoul", tombstones: [], signedIn: true, onResult,
  }));
  await act(async () => { window.dispatchEvent(new Event("focus")); });

  expect(order).toEqual(["reserved", "run", "outcome"]);
  // And the id the pass sends is the one it just wrote down.
  const reserved = onResult.mock.calls[0][0] as { reserved: { googleReservedEventId: string }[] };
  expect(mocks.run.mock.calls[0][0].plan.create[0].googleReservedEventId).toBe(
    reserved.reserved[0].googleReservedEventId,
  );
});

it("does not reserve again for a task that already has one", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal" });
  mocks.token.mockResolvedValue("access");
  mocks.run.mockResolvedValue({ expired: false, mapped: [], unlinked: [], clearedOrphans: [], failed: 0 });
  const onResult = vi.fn();

  renderHook(() => useGoogleOutboundSync({
    tasks: [{ id: "task", title: "Test", dueDate: "2026-09-06", googleReservedEventId: "ffkept" } as Task],
    timezone: "Asia/Seoul", tombstones: [], signedIn: true, onResult,
  }));
  await act(async () => { window.dispatchEvent(new Event("focus")); });

  expect(onResult.mock.calls.every(([result]) => !(result as { reserved?: unknown }).reserved)).toBe(true);
  expect(mocks.run.mock.calls[0][0].plan.create[0].googleReservedEventId).toBe("ffkept");
});
