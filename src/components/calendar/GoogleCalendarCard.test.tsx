// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { GoogleCalendarCard } from "./GoogleCalendarCard";
import { routeGoogleCalendarReturn } from "./GoogleCalendarReturn";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), exchange: vi.fn(), ensure: vi.fn(), open: vi.fn(), align: vi.fn(),
  getSession: vi.fn(), authListener: vi.fn(),
}));
vi.mock("../../services/supabaseClient", () => ({ supabase: { auth: {
  getSession: mocks.getSession,
  onAuthStateChange: mocks.authListener,
} } }));
vi.mock("../../platform", () => ({ platform: { kind: "desktop", openExternal: mocks.open } }));
vi.mock("./GoogleCalendarSourceList", () => ({ GoogleCalendarSourceList: () => null }));
vi.mock("../../lib/googleCalendar", async () => ({
  ...await vi.importActual<typeof import("../../lib/googleCalendar")>("../../lib/googleCalendar"),
  readConnection: mocks.read,
  exchangeCodeForAccess: mocks.exchange,
  ensureDedicatedCalendar: mocks.ensure,
  alignGoogleTimezone: mocks.align,
}));

beforeEach(() => {
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
const mount = () => render(<I18nProvider lang="en"><GoogleCalendarCard /></I18nProvider>);

it("aligns the existing calendar to the selected zone and prevents overlapping actions", async () => {
  // The pinned zone has to disagree for the action to be offered at all — see
  // the visibility tests at the end of this file.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", syncTimezone: "Europe/London" });
  let complete!: () => void;
  mocks.align.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="Asia/Shanghai" /></I18nProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Align time zone" }));
  expect(mocks.align).toHaveBeenCalledWith("cal", "Asia/Shanghai");
  expect(screen.getByRole("button", { name: "Aligning time zone…" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Disconnect" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Sync now" }).hasAttribute("disabled")).toBe(true);
  await act(async () => complete());
  expect(await screen.findByText(/Google sync time zone is now Asia\/Shanghai/)).toBeTruthy();
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.ensure).not.toHaveBeenCalled();
});

it("keeps the connection and offers retry after unresolved reviews block alignment", async () => {
  const { GoogleCalendarError } = await import("../../lib/googleCalendar");
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", syncTimezone: "Europe/London" });
  mocks.align.mockRejectedValueOnce(new GoogleCalendarError("reviewsUnresolved", "blocked"));
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="Asia/Seoul" /></I18nProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Align time zone" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Resolve the pending items");
  expect(screen.getByRole("button", { name: "Disconnect" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Align time zone" }));
  await screen.findByText(/Google sync time zone is now Asia\/Seoul/);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps the retained connection's disconnect action after an identity mismatch", async () => {
  const { GoogleCalendarError } = await import("../../lib/googleCalendar");
  mocks.read.mockResolvedValue({ calendarId: "old-calendar", accountEmail: "old@example.com" });
  mocks.exchange.mockRejectedValueOnce(new GoogleCalendarError("identityMismatch", "Mismatch"));
  mount();
  await screen.findByRole("button", { name: "Disconnect" });
  localStorage.setItem("focusflow.google.pendingConnect", JSON.stringify({ nonce: "abc", platform: "desktop" }));
  act(() => routeGoogleCalendarReturn("focusflow://google-calendar?state=abc&code=one"));
  await screen.findByText("The existing Google account could not be matched. Disconnect the existing connection before connecting another account.");
  expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  expect(mocks.ensure).not.toHaveBeenCalled();
});

it("preserves the upgrade explanation after a failed manual sync", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email" });
  const { GOOGLE_SYNC_FINISHED } = await import("../../lib/googleCalendar");
  const { GOOGLE_SYNC_POLICY_EVENT } = await import("../../domain/calendar/googleSync/protocol");
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
  act(() => {
    window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_POLICY_EVENT, { detail: { reason: "updateRequired" } }));
    window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_FINISHED, { detail: { ok: false } }));
  });
  expect(screen.getByText("Update FocusFlow to continue syncing Google Calendar.").getAttribute("role")).toBe("alert");
});

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
  expect(screen.getByRole("status").textContent).toBe("Not connected");
});


it("explains unsupported labels and reports manual sync progress", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", labelsSupported: false });
  const { GOOGLE_SYNC_REQUESTED, GOOGLE_SYNC_FINISHED } = await import("../../lib/googleCalendar");
  const requested = vi.fn();
  window.addEventListener(GOOGLE_SYNC_REQUESTED, requested);
  mount();
  await screen.findByText("This Google account does not support event labels. Events still sync, without list colors.");
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
  expect(requested).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Syncing…" }).hasAttribute("disabled")).toBe(true);
  act(() => { window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_FINISHED, { detail: { ok: true } })); });
  expect(screen.getByText("Events synced.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sync now" }).hasAttribute("disabled")).toBe(false);
  window.removeEventListener(GOOGLE_SYNC_REQUESTED, requested);
});

// When the alignment is offered at all.
//
// Unconditionally it is a button that re-reads the whole calendar for no
// reason, and it says nothing about whether anything is wrong. The pinned zone
// disagreeing with the account's is the one failure in this sync that is
// otherwise silent — events arrive at the wrong hour and every screen is
// internally consistent about it, because both numbers are right in their own
// zone. Naming the pinned zone is the diagnosis, so the row IS the feature and
// the button is only its verb.
const ALIGN = { name: "Align time zone" };

it("names the pinned zone when it disagrees with the account's", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="Asia/Seoul" /></I18nProvider>);
  const note = await screen.findByText(/pinned to Europe\/London/);
  expect(note.textContent).toContain("Asia/Seoul");
  expect(screen.getByRole("button", ALIGN)).toBeTruthy();
});

it("stays quiet when the two already agree", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Asia/Seoul" });
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="Asia/Seoul" /></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(screen.queryByRole("button", ALIGN)).toBeNull();
});

it("stays quiet when the connection predates the pinned zone", async () => {
  // "" is what a row written before `sync_timezone` existed reads as. Offering
  // to change a zone nobody can see would be asking about something invisible.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "" });
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="Asia/Seoul" /></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(screen.queryByRole("button", ALIGN)).toBeNull();
});

it("stays quiet when the account has no zone of its own to offer", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="" /></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(screen.queryByRole("button", ALIGN)).toBeNull();
});

it("drops the warning once the connection reports the new zone", async () => {
  // Read back rather than assumed: hiding the card's own warning on an
  // assumption would be claiming an alignment it never confirmed.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  mocks.align.mockImplementationOnce(async () => {
    mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Asia/Seoul" });
  });
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="Asia/Seoul" /></I18nProvider>);
  fireEvent.click(await screen.findByRole("button", ALIGN));
  await waitFor(() => expect(screen.queryByRole("button", ALIGN)).toBeNull());
  expect(await screen.findByText(/Google sync time zone is now Asia\/Seoul/)).toBeTruthy();
});

it("keeps the warning when the server accepted nothing", async () => {
  // The read is the card's only evidence. An unchanged zone means the warning
  // still applies, whatever the call returned.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><GoogleCalendarCard timezone="Asia/Seoul" /></I18nProvider>);
  fireEvent.click(await screen.findByRole("button", ALIGN));
  await screen.findByText(/Google sync time zone is now Asia\/Seoul/);
  expect(screen.getByRole("button", ALIGN)).toBeTruthy();
});
