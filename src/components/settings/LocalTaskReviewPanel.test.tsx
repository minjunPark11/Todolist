// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { LocalTaskReviewPanel } from "./LocalTaskReviewPanel";
import { publishGoogleTaskSync, readGoogleTaskSyncState } from "../../lib/googleTaskSyncState";
const mount = () => render(<I18nProvider lang="en"><LocalTaskReviewPanel /></I18nProvider>);
afterEach(() => { cleanup(); publishGoogleTaskSync({ enabled: false, busy: false, pending: false, error: "", snapshot: null }); });
it("reports automatic merges alongside remaining device conflicts, including them in the heading", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), enabled: true, autoMergedCount: 3,
    localConflicts: [{ id: "local", local: null, remote: null }] });
  mount();
  expect(screen.getByText("Latest sync: 3 tasks automatically merged · 1 device conflicts remaining").getAttribute("role")).toBe("status");
  expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("(1)");
});

it("keeps Google failures out of the device review", () => {
  publishGoogleTaskSync({ ...readGoogleTaskSyncState(), enabled: true, autoMergedCount: 0, error: "failed" });
  mount();
  expect(screen.getByText("Latest sync: 0 tasks automatically merged · 0 device conflicts remaining")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not show another account's merge summary after reset", () => {
  publishGoogleTaskSync({ enabled: true, busy: false, pending: false, error: "", snapshot: null });
  mount();
  expect(screen.queryByText(/automatically merged/)).toBeNull();
});

it("resolves device conflicts without a Google snapshot", () => {
  const resolveLocal = vi.fn();
  const conflict = { id: "local", local: null, remote: null };
  publishGoogleTaskSync({ enabled: true, busy: false, pending: false, error: "", snapshot: null, localConflicts: [conflict], resolveLocal });
  mount();
  fireEvent.click(screen.getByText(/Changes from another device/));
  fireEvent.click(screen.getByRole("button", { name: "Use saved version" }));
  expect(resolveLocal).toHaveBeenCalledWith(conflict, "remote");
});
