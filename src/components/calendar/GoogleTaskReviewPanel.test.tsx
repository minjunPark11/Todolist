// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { GoogleTaskReviewPanel } from "./GoogleTaskReviewPanel";
import { publishGoogleTaskSync, readGoogleTaskSyncState } from "../../lib/googleTaskSyncState";
import { parseGoogleTaskSnapshot } from "../../lib/googleTaskInboundSnapshot";

const fields = { title: "App title", description: "Local notes", startDate: "", dueDate: "2026-09-09", startTime: "", endTime: "" };
const source = { id: "event", etag: "etag", summary: "Google title", description: "Google notes", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } };
const run = vi.fn();
beforeEach(() => {
  run.mockReset().mockResolvedValue(undefined);
  const snapshot = parseGoogleTaskSnapshot({ userId: "u", generation: "g", calendarId: "c", syncRevision: 1,
    timezone: "Asia/Seoul", inboxListId: "inbox", syncToken: "token", tasks: [{ id: "t", revision: 2, data: fields }],
    mappings: [{ generation: "g", calendar_id: "c", event_id: "event", task_id: "t", state: "active" }],
    records: [{ generation: "g", calendar_id: "c", event_id: "event", revision: 3, source, decision: { kind: "conflict", local: fields, remote: { ...fields, title: "Google title" } } }],
  }, "u", "g");
  publishGoogleTaskSync({ enabled: true, busy: false, pending: false, error: "", snapshot, run });
});
afterEach(() => { cleanup(); publishGoogleTaskSync({ enabled: false, busy: false, pending: false, error: "", snapshot: null }); });
const mount = () => render(<I18nProvider lang="en"><GoogleTaskReviewPanel /></I18nProvider>);
it("identifies the occurrence whose remote changes blocked automatic sending", () => {
  // Not an alert, and not paired with `error`: the pass that found this one
  // finished, and every occurrence it did not name was sent.
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), occurrenceConflicts: [{ title: "Weekly meeting", date: "2026-09-16" }] });
  mount();
  const said = screen.getAllByRole("status").map(node => node.textContent).join(" ");
  expect(said).toContain("Weekly meeting");
  expect(said).toContain("2026-09-16");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("names every skipped occurrence, not just the first", () => {
  // The whole point of skipping rather than throwing: one occurrence nobody
  // reconciles must not hide the others behind it.
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), occurrenceConflicts: [
    { title: "Weekly meeting", date: "2026-09-16" },
    { title: "Standup", date: "2026-09-17" },
  ] });
  mount();
  const said = screen.getAllByRole("status").map(node => node.textContent).join(" ");
  expect(said).toContain("Weekly meeting");
  expect(said).toContain("Standup");
  // One review comes from the fixture, so the two skipped occurrences take the
  // heading to three: they are counted as work waiting on a person, which is
  // what they are.
  expect(screen.getByRole("heading", { level: 4 }).textContent).toContain("(3)");
});

it("still says a failure is a failure when the pass did not finish", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "failed" });
  mount();
  expect(screen.getByRole("alert")).toBeTruthy();
});
it("compares both versions and sends the displayed record and task revisions", () => {
  mount(); fireEvent.click(screen.getByText(/Google title — Conflicting/));
  expect(screen.getByText("Local notes")).toBeTruthy(); expect(screen.getByText("Google notes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Use app content" }));
  expect(run).toHaveBeenCalledWith({ eventId: "event", generation: "g", recordRevision: 3, taskRevision: 2, source, choice: "app" });
});
it("disables choices during submission and offers feedback", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), busy: true }); mount();
  fireEvent.click(screen.getByText(/Google title — Conflicting/));
  expect((screen.getByRole("button", { name: "Use Google content" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Syncing…")).toBeTruthy();
});
it("keeps a stale selection visible with a refresh action", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "changed" }); mount();
  expect(screen.getByRole("alert").textContent).toContain("Content changed");
  fireEvent.click(screen.getByRole("button", { name: "Refresh and sync" })); expect(run).toHaveBeenCalledWith();
});
it("hides all previous-account content when disabled", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), enabled: false }); mount();
  expect(screen.queryByText("Google title")).toBeNull();
});
it("shows recurrence differences only after shared-content conflicts are resolved", () => {
  const state = readGoogleTaskSyncState(), snapshot = state.snapshot!;
  snapshot.tasks.get("t")!.data.repeatType = "weekly";
  snapshot.records[0].decision = { kind: "acknowledge" };
  publishGoogleTaskSync({ ...state, snapshot }); mount();
  fireEvent.click(screen.getByRole("button", { name: "Apply app repeat rule" }));
  expect(run).toHaveBeenCalledWith({ choice: "recurrence", generation: "g", eventId: "event", recordRevision: 3, taskRevision: 2, source });
  expect(screen.getByText(/entire series/)).toBeTruthy();
  expect(screen.getByText("Every 1 week(s)")).toBeTruthy();
});
it("copies only the selected historical task using the displayed generation and revision", () => {
  const state = readGoogleTaskSyncState(), snapshot = state.snapshot!;
  snapshot.historicalTaskIds.add("t"); snapshot.snapshots[0].eventId = ""; snapshot.records = [];
  publishGoogleTaskSync({ ...state, snapshot }); mount();
  fireEvent.click(screen.getByRole("button", { name: "Copy to this calendar" }));
  expect(run).toHaveBeenCalledWith({ choice: "transfer", generation: "g", taskId: "t", taskRevision: 2, eventId: "", recordRevision: 0, source: {} });
  expect(screen.getByText(/original calendar stays/)).toBeTruthy();
  expect(screen.getByText("Tasks from another connection (1)")).toBeTruthy();
  expect(screen.getByText(/calendar c\./)).toBeTruthy();
});

it("says what was actually thrown, not only that something was", async () => {
  // "Could not finish syncing" is true of every failure and useful for none.
  // A lost lease, a connection needing attention, another window holding the
  // lock, a snapshot that would not parse — one sentence, four fixes. The only
  // way anyone learned which was to open a browser console, which is not a
  // thing to ask of the person the sync belongs to.
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "failed",
    errorDetail: "Google task sync is running in another window." });
  mount();
  const said = screen.getByRole("alert").textContent ?? "";
  expect(said).toContain("Sync could not finish");
  expect(said).toContain("running in another window");
});

it("says only the sentence when nothing was thrown with a message", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "failed" });
  mount();
  expect(screen.getByRole("alert").textContent).not.toContain("(");
});

it("blames the conflicts on this screen, not the network", async () => {
  // The sentence that sent a whole afternoon into the database. Four device
  // conflicts sitting twenty pixels lower were the reason nothing would sync,
  // and the screen said to check the connection.
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "failed",
    errorDetail: "Task revision sync is blocked.",
    localConflicts: [
      { id: "a", local: null, remote: null },
      { id: "b", local: null, remote: null },
    ] });
  mount();
  const said = screen.getByRole("alert").textContent ?? "";
  expect(said).toContain("2 conflicting edit");
  expect(said).not.toContain("Check the connection");
  // And it does not also recite the internal message: the list below is the
  // explanation, and a second sentence about revisions only muddies it.
  expect(said).not.toContain("Task revision sync is blocked.");
});

it("still says check the connection when nothing on the screen explains it", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "failed", localConflicts: [] });
  mount();
  expect(screen.getByRole("alert").textContent).toContain("Check the connection");
});

it("links to account review instead of rendering device conflicts inside Google", () => {
  const open = vi.fn();
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), autoMergedCount: 3, localConflicts: [{ id: "local", local: null, remote: null }] });
  render(<I18nProvider lang="en"><GoogleTaskReviewPanel onOpenDeviceReview={open} /></I18nProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Review 1 device conflicts" }));
  expect(open).toHaveBeenCalledOnce();
  expect(screen.queryByText(/automatically merged/)).toBeNull();
  expect(screen.queryByText("Use saved version")).toBeNull();
  expect(screen.getByRole("heading", { level: 4 }).textContent).toContain("(1)");
});
