// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { GoogleCalendarCard } from "./GoogleCalendarCard";
import { routeGoogleCalendarReturn } from "./GoogleCalendarReturn";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), exchange: vi.fn(), ensure: vi.fn(), open: vi.fn(),
  getSession: vi.fn(), authListener: vi.fn(),
}));
vi.mock("../../services/supabaseClient", () => ({ supabase: { auth: {
  getSession: mocks.getSession,
  onAuthStateChange: mocks.authListener,
} } }));
vi.mock("../../platform", () => ({ platform: { kind: "desktop", openExternal: mocks.open } }));
vi.mock("../../lib/googleCalendar", async () => ({
  ...await vi.importActual<typeof import("../../lib/googleCalendar")>("../../lib/googleCalendar"),
  readConnection: mocks.read,
  exchangeCodeForAccess: mocks.exchange,
  ensureDedicatedCalendar: mocks.ensure,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  history.replaceState(null, "", "/settings");
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user" } } } });
  mocks.authListener.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.read.mockResolvedValue(null);
  mocks.open.mockResolvedValue(undefined);
  mocks.exchange.mockResolvedValue("access");
  mocks.ensure.mockResolvedValue({ calendarId: "cal", accountEmail: "person@example.com" });
});
afterEach(cleanup);
const mount = () => render(<I18nProvider lang="en"><GoogleCalendarCard /></I18nProvider>);

it("shows loading, then a persistent connected status and account", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "person@example.com" });
  mount();
  expect(screen.getByRole("status").textContent).toBe("Checking connection…");
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Connected"));
  expect(screen.getByText("Connected as person@example.com.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
});

it("reports a failed status read and can retry without pretending it is disconnected", async () => {
  mocks.read.mockRejectedValueOnce(new Error("offline"));
  mount();
  await screen.findByRole("alert");
  expect(screen.getByRole("status").textContent).toBe("Could not check connection");
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Not connected"));
});

it("recovers when the external browser cannot be opened", async () => {
  mocks.open.mockRejectedValueOnce(new Error("cannot open"));
  mount();
  await waitFor(() => expect(screen.getByRole("button", { name: "Connect" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByRole("alert");
  expect(localStorage.getItem("focusflow.google.pendingConnect")).toBeNull();
  expect(screen.getByRole("button", { name: "Connect" }).hasAttribute("disabled")).toBe(false);
});

it("finishes a desktop return and does not let a late initial read overwrite success", async () => {
  let finishRead!: (value: null) => void;
  mocks.read.mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
  mount();
  await waitFor(() => expect(mocks.read).toHaveBeenCalled());
  localStorage.setItem("focusflow.google.pendingConnect", JSON.stringify({ nonce: "abc", platform: "desktop" }));
  act(() => routeGoogleCalendarReturn("focusflow://google-calendar?state=abc&code=one"));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Connected"));
  await act(async () => finishRead(null));
  expect(screen.getByRole("status").textContent).toBe("Connected");
  expect(mocks.exchange).toHaveBeenCalledTimes(1);
  expect(location.hash).toBe("");
});

it("routes a verified return from another page, but ignores a mismatched nonce", () => {
  history.replaceState(null, "", "/today");
  localStorage.setItem("focusflow.google.pendingConnect", JSON.stringify({ nonce: "abc", platform: "desktop" }));
  routeGoogleCalendarReturn("focusflow://google-calendar?state=wrong&code=one");
  expect(location.pathname).toBe("/today");
  routeGoogleCalendarReturn("focusflow://google-calendar?state=abc&code=one");
  expect(location.pathname).toBe("/settings");
  expect(location.hash).toContain("google-calendar?");
});
