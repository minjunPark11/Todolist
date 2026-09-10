// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
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
const mount = () => render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard /></FloatingLayerProvider></I18nProvider>);

// The pinned zone is picked here, and picking is the whole action.
//
// It used to be a button that said "align to the app setting", which made one
// action into three: go to another screen, change another value, come back,
// press. The number that is wrong belongs on the screen where its consequence
// lives, editable there.

/** The picker, and the modal that stands between a pick and what it costs. */
const zoneTrigger = () => {
  if (!screen.queryByRole("button", { name: /^Sync time zone:/ })) fireEvent.click(screen.getByText("Connection settings"));
  return screen.getByRole("button", { name: /^Sync time zone:/ });
};
/** What the closed picker says it is set to. */
const shownZone = () => zoneTrigger().textContent ?? "";

/**
 * Open the picker, type at it, and take the match.
 *
 * Typed rather than scrolled to on purpose: the search is the feature. A
 * native select only matched from the start of the option text, so reaching
 * Shanghai meant typing "Asia/Sha" — slash included — and knowing which
 * region the city is filed under.
 */
function pick(zone: string) {
  fireEvent.click(zoneTrigger());
  fireEvent.change(screen.getByRole("combobox"), { target: { value: zone.split("/").pop() ?? zone } });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(zone.replace("/", "\\/")) }));
}
const CONFIRM = { name: "Change it" };

it("spends nothing until the choice is confirmed", async () => {
  // Unlike Google's own time-zone setting this is not free: it re-reads the
  // calendar and rewrites the times of everything imported from it. A select
  // that did that on change would do it to a mis-click.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Europe/London" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Shanghai");
  expect(mocks.align).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.align).not.toHaveBeenCalled();
  expect(shownZone()).toContain("Europe/London");
});

it("pins the picked zone and holds every other action while it does", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", syncTimezone: "Europe/London" });
  let complete!: () => void;
  mocks.align.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Europe/London" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Shanghai");
  fireEvent.click(screen.getByRole("button", CONFIRM));
  expect(mocks.align).toHaveBeenCalledWith("cal", "Asia/Shanghai");
  expect(zoneTrigger().hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Disconnect" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Sync now" }).hasAttribute("disabled")).toBe(true);
  await act(async () => complete());
  expect(await screen.findByText(/Google sync time zone is now Asia\/Shanghai/)).toBeTruthy();
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.ensure).not.toHaveBeenCalled();
});

it("moves the account's own zone with it, and only once the pin took", async () => {
  // Every date this app stores is a bare wall-clock string, so there is one
  // correct value for the pair. Writing the account's half first would leave
  // the app claiming a zone the calendar had refused.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", syncTimezone: "Europe/London" });
  const onTimezoneChange = vi.fn();
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Europe/London" onTimezoneChange={onTimezoneChange} /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Shanghai");
  fireEvent.click(screen.getByRole("button", CONFIRM));
  await waitFor(() => expect(onTimezoneChange).toHaveBeenCalledWith("Asia/Shanghai"));
});

it("leaves the account's zone alone when the pin was refused", async () => {
  const { GoogleCalendarError } = await import("../../lib/googleCalendar");
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", syncTimezone: "Europe/London" });
  mocks.align.mockRejectedValueOnce(new GoogleCalendarError("reviewsUnresolved", "blocked"));
  const onTimezoneChange = vi.fn();
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Europe/London" onTimezoneChange={onTimezoneChange} /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Shanghai");
  fireEvent.click(screen.getByRole("button", CONFIRM));
  await screen.findByRole("alert");
  expect(onTimezoneChange).not.toHaveBeenCalled();
});

it("keeps the connection and lets the pick be made again after a refusal", async () => {
  const { GoogleCalendarError } = await import("../../lib/googleCalendar");
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "email", syncTimezone: "Europe/London" });
  mocks.align.mockRejectedValueOnce(new GoogleCalendarError("reviewsUnresolved", "blocked"));
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Europe/London" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Seoul");
  fireEvent.click(screen.getByRole("button", CONFIRM));
  expect((await screen.findByRole("alert")).textContent).toContain("Resolve the pending items");
  expect(screen.getByRole("button", { name: "Disconnect" }).hasAttribute("disabled")).toBe(false);
  pick("Asia/Seoul");
  fireEvent.click(screen.getByRole("button", CONFIRM));
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

// What the picker shows, and when there is one at all.

it("shows the zone the connection is pinned to, not the account's", async () => {
  // The point of putting it here: the value that is wrong is the one on
  // screen. A picker that showed the app's zone would agree with itself while
  // events kept arriving at the wrong hour.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(shownZone()).toContain("Europe/London");
});

it("says out loud that the two disagree, which the picker alone cannot", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  const note = await screen.findByText(/pinned to Europe\/London/);
  expect(note.textContent).toContain("Asia/Seoul");
});

it("keeps the picker but drops the warning once they agree", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Asia/Seoul" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(zoneTrigger()).toBeTruthy();
  expect(screen.queryByText(/pinned to/)).toBeNull();
});

it("offers no picker when the connection predates the pinned zone", async () => {
  // "" is what a row written before `sync_timezone` existed reads as, and a
  // picker with nothing to show is worse than none.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(screen.queryByRole("button", { name: /^Sync time zone:/ })).toBeNull();
});

it("still offers the picker when the account has no zone of its own", async () => {
  // The pinned zone is the one being edited here; the account's is what the
  // pick will set. Not knowing the second is no reason to hide the first.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(shownZone()).toContain("Europe/London");
  expect(screen.queryByText(/pinned to/)).toBeNull();
});

it("offers a pinned zone this build has never heard of rather than silently showing another", async () => {
  // `normalizeAppSettings` keeps such a name on purpose. A select with no
  // option matching its value falls back to the first one in the list, which
  // here would be some African city the reader has never chosen.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Mars/Olympus_Mons" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  expect(shownZone()).toContain("Mars/Olympus_Mons");
});

it("moves the picker to the new zone once the connection reports it", async () => {
  // Read back rather than assumed: a card that moved its own picker on an
  // assumption would be claiming a pin it never confirmed.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  mocks.align.mockImplementationOnce(async () => {
    mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Asia/Seoul" });
  });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Seoul");
  fireEvent.click(screen.getByRole("button", CONFIRM));
  await waitFor(() => expect(shownZone()).toContain("Asia/Seoul"));
});

it("leaves the picker where it was when the server accepted nothing", async () => {
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Seoul");
  fireEvent.click(screen.getByRole("button", CONFIRM));
  await screen.findByText(/Google sync time zone is now Asia\/Seoul/);
  expect(shownZone()).toContain("Europe/London");
});

// The report that brought this in: the confirmation appeared, [Change it] was
// pressed, and the pinned zone stayed exactly where it was with nothing to
// read anywhere on the screen.

it("says a sync is in the way rather than doing nothing", async () => {
  // The picker is disabled while a pass runs, but the confirmation is a modal
  // and outlives that: open it, have a background pass start underneath, press
  // the button. This used to return without a word.
  const { publishGoogleTaskSync, readGoogleTaskSyncState } = await import("../../lib/googleTaskSyncState");
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });

  fireEvent.click(zoneTrigger());
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Seoul" } });
  fireEvent.click(screen.getByRole("option", { name: /Asia\/Seoul/ }));
  act(() => publishGoogleTaskSync({ ...readGoogleTaskSyncState(), enabled: true, busy: true }));
  fireEvent.click(screen.getByRole("button", CONFIRM));

  expect(mocks.align).not.toHaveBeenCalled();
  expect((await screen.findByRole("alert")).textContent).toContain("A sync is running");
  act(() => publishGoogleTaskSync({ ...readGoogleTaskSyncState(), enabled: false, busy: false }));
});

it("answers beside the picker, not at the bottom of the card", async () => {
  // The card's shared notice line renders past the calendar list and the
  // review panel. An answer to a control in the first row was arriving several
  // hundred pixels below it, which reads exactly like nothing happening.
  mocks.read.mockResolvedValue({ calendarId: "cal", accountEmail: "e", syncTimezone: "Europe/London" });
  render(<I18nProvider lang="en"><FloatingLayerProvider><GoogleCalendarCard timezone="Asia/Seoul" /></FloatingLayerProvider></I18nProvider>);
  await screen.findByRole("button", { name: "Sync now" });
  pick("Asia/Seoul");
  fireEvent.click(screen.getByRole("button", CONFIRM));

  const said = await screen.findByText(/Google sync time zone is now Asia\/Seoul/);
  // Between the picker and the manual sync button — the block it belongs to.
  expect(zoneTrigger().compareDocumentPosition(said) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sync now" }).compareDocumentPosition(said) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});
