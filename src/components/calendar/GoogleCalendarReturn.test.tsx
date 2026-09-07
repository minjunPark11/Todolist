// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GoogleCalendarReturn } from "./GoogleCalendarReturn";

const mocks = vi.hoisted(() => ({ take: vi.fn(), subscribe: vi.fn(), pending: vi.fn() }));
vi.mock("../../platform", () => ({ platform: { kind: "desktop", deepLink: mocks } }));
vi.mock("../../lib/googleCalendar", () => ({ readPendingConnect: mocks.pending }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  history.replaceState(null, "", "/settings");
  mocks.pending.mockReturnValue({ nonce: "test", platform: "desktop" });
  mocks.take.mockResolvedValue(null);
  mocks.subscribe.mockResolvedValue(vi.fn());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("recovers a native callback when the event is missed", async () => {
  await act(async () => { render(<GoogleCalendarReturn />); });
  mocks.take.mockResolvedValueOnce("focusflow://google-calendar?state=test&code=fixture");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(location.hash).toContain("code=fixture");
});

it("checks a pending return when the native window receives focus", async () => {
  await act(async () => { render(<GoogleCalendarReturn />); });
  mocks.take.mockResolvedValueOnce("focusflow://google-calendar?state=test&error=access_denied");
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(location.hash).toContain("error=access_denied");
});

it("keeps recovery available if event subscription fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.subscribe.mockRejectedValueOnce(new Error("subscription failed"));
  await act(async () => { render(<GoogleCalendarReturn />); });
  mocks.take.mockResolvedValueOnce("focusflow://google-calendar?state=test&code=fixture");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(location.hash).toContain("code=fixture");
  log.mockRestore();
});

it("stops polling when no connection is pending or the bridge unmounts", async () => {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<GoogleCalendarReturn />); });
  mocks.take.mockClear();
  mocks.pending.mockReturnValue(null);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(mocks.take).not.toHaveBeenCalled();
  view.unmount();
  mocks.pending.mockReturnValue({ nonce: "test", platform: "desktop" });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(mocks.take).not.toHaveBeenCalled();
});
