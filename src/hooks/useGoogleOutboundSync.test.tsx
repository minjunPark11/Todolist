// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useGoogleOutboundSync } from "./useGoogleOutboundSync";
import type { Task } from "../types";
const mocks = vi.hoisted(() => ({ read: vi.fn(), token: vi.fn(), run: vi.fn() }));
vi.mock("../lib/googleCalendar", () => ({
  readConnection: mocks.read, currentAccessToken: mocks.token,
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
