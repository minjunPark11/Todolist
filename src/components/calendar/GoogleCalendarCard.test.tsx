// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { GoogleCalendarCard } from "./GoogleCalendarCard";
import { routeGoogleCalendarReturn } from "./GoogleCalendarReturn";
import { publishGoogleTaskSync } from "../../lib/googleTaskSyncState";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), exchange: vi.fn(), ensure: vi.fn(), open: vi.fn(), align: vi.fn(),
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
  alignGoogleTimezone: mocks.align,
}));

beforeEach(() => {
  publishGoogleTaskSync({ enabled: false, busy: false, pending: false, error: "", snapshot: null });
  vi.clearAllMocks();
  localStorage.clear();
  history.replaceState(null, "", "/settings");
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user" } } } });
  mocks.authListener.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.read.mockResolvedValue(null);
  mocks.align.mockResolvedValue(undefined);
  mocks.open.mockResolvedValue(undefined);
  mocks.exchange.mockResolvedValue("access");
  mocks.ensure.mockResolvedValue({ calendarId: "cal", accountEmail: "person@example.com" });
});
afterEach(cleanup);
const mount = () => render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard /></FloatingLayerProvider></I18nProvider>);

it("keeps failure details reachable when a sync fails before returning its snapshot", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "person@example.com" });
  publishGoogleTaskSync({ enabled: true, busy: false, pending: false, error: "failed", errorDetail: "SYNC_BUSY", snapshot: null });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Google sync review" }));
  expect(screen.getByText(/SYNC_BUSY/)).toBeTruthy();
});

it("keeps the retained connection's disconnect action after an identity mismatch", async () => {
  const { GoogleCalendarError } = await import("../../lib/googleCalendar");
  mocks.read.mockResolvedValue({ calendarId: "old-calendar", accountEmail: "old@example.com" });
  mocks.exchange.mockRejectedValueOnce(new GoogleCalendarError("identityMismatch", "Mismatch"));
  mount();
  await screen.findByRole("button", { name: "Disconnect", hidden: true });
  localStorage.setItem("focusflow.google.pendingConnect", JSON.stringify({ nonce: "abc", platform: "desktop" }));
  act(() => routeGoogleCalendarReturn("focusflow://google-calendar?state=abc&code=one"));
  await screen.findByText("The existing Google account could not be matched. Disconnect the existing connection before connecting another account.");
  expect(screen.getByRole("button", { name: "Disconnect", hidden: true })).toBeTruthy();
  expect(mocks.ensure).not.toHaveBeenCalled();
});

it("preserves the upgrade explanation after a failed manual sync", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email" });
  const { GOOGLE_SYNC_FINISHED } = await import("../../lib/googleCalendar");
  const { GOOGLE_SYNC_POLICY_EVENT } = await import("../../domain/calendar/googleSync/protocol");
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Sync now", hidden: true }));
  act(() => {
    window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_POLICY_EVENT, { detail: { reason: "updateRequired" } }));
    window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_FINISHED, { detail: { ok: false } }));
  });
  expect(screen.getByText("Update FocusFlow to continue syncing Google Calendar.").getAttribute("role")).toBe("alert");
});

it("shows loading, then a persistent connected status and account", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "person@example.com" });
  mount();
  expect(document.querySelector("[data-connection-status]")?.textContent).toBe("Checking connection…");
  await waitFor(() => expect(document.querySelector("[data-connection-status]")?.textContent).toBe("Connected"));
  expect(screen.getByText("Connected as person@example.com.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Disconnect", hidden: true })).toBeTruthy();
});

it("reports a failed status read and can retry without pretending it is disconnected", async () => {
  mocks.read.mockRejectedValueOnce(new Error("offline"));
  mount();
  await screen.findByRole("alert");
  expect(document.querySelector("[data-connection-status]")?.textContent).toBe("Could not check connection");
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(document.querySelector("[data-connection-status]")?.textContent).toBe("Not connected"));
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
  await waitFor(() => expect(document.querySelector("[data-connection-status]")?.textContent).toBe("Connected"));
  await act(async () => finishRead(null));
  expect(document.querySelector("[data-connection-status]")?.textContent).toBe("Connected");
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

// The card used to answer every 401 with "Sign in to FocusFlow first." — to a
// reader whose session was fine and whose token the server had refused. The
// advice was a loop: the next sign-in mints a token refused for the same
// reason. What ends the loop is the server's own sentence, which names which
// check refused and is the only thing here that points at the fix.
it("does not tell a signed-in reader to sign in when the server refused the session", async () => {
  const { GoogleCalendarError } = await vi.importActual<typeof import("../../lib/googleCalendar")>(
    "../../lib/googleCalendar",
  );
  mocks.exchange.mockRejectedValueOnce(
    new GoogleCalendarError("rejected", "Tokens signed with HS256 are not accepted here."),
  );
  mount();
  await waitFor(() => expect(mocks.read).toHaveBeenCalled());
  localStorage.setItem("focusflow.google.pendingConnect", JSON.stringify({ nonce: "abc", platform: "desktop" }));
  act(() => routeGoogleCalendarReturn("focusflow://google-calendar?state=abc&code=one"));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Tokens signed with HS256 are not accepted here.");
  expect(alert.textContent).not.toContain("Sign in to FocusFlow first.");
  expect(document.querySelector("[data-connection-status]")?.textContent).toBe("Not connected");
});


it("explains unsupported labels and reports manual sync progress", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", labelsSupported: false });
  const { GOOGLE_SYNC_REQUESTED, GOOGLE_SYNC_FINISHED } = await import("../../lib/googleCalendar");
  const requested = vi.fn();
  window.addEventListener(GOOGLE_SYNC_REQUESTED, requested);
  mount();
  await screen.findByText("This Google account does not support event labels. Events still sync, without list colors.");
  fireEvent.click(screen.getByRole("button", { name: "Sync now", hidden: true }));
  expect(requested).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Syncing…" }).hasAttribute("disabled")).toBe(true);
  act(() => { window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_FINISHED, { detail: { ok: true } })); });
  expect(screen.getByText("Events synced.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sync now", hidden: true }).hasAttribute("disabled")).toBe(false);
  window.removeEventListener(GOOGLE_SYNC_REQUESTED, requested);
});

// What the picker shows, and when there is one at all.


it("uses the general setting without a second timezone picker or an always-open review", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "person@example.com", syncTimezone: "UTC" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Shanghai" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByText("Connected as person@example.com.");
  expect(screen.queryByRole("button", { name: /^Sync time zone:/ })).toBeNull();
  expect(screen.queryByRole("region", { name: "Google sync review" })).toBeNull();
  expect(mocks.align).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Connection settings"));
  expect(screen.getAllByRole("button", { name: "Sync now" })).toHaveLength(1);
});
