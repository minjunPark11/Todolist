// @vitest-environment jsdom
//
// The reminder list, and the two rules about permission it exists to keep
// (spec §6.17, §6.39, §6.40).
//
// `domain/schedule/reminders.test.ts` pins what a reminder MEANS. This is
// about the control: that it is a multi-select rather than a radiogroup, that
// asking the OS happens when the user wants a reminder and not before, and
// that a refusal is reported without the reminder being lost.
//
// It was `ReminderPanel.test.tsx`. What changed with
// SCHEDULE_TIME_FIELD_DESIGN.md §5 is where the list lives and that each row
// now says when it actually falls; what it does was already right.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const notificationAccess = vi.fn();
const requestNotificationPermission = vi.fn();

vi.mock("../../platform", () => ({
  platform: {
    kind: "web",
    notificationAccess: () => notificationAccess(),
    requestNotificationPermission: () => requestNotificationPermission(),
  },
}));

const { ReminderList } = await import("./ReminderList");
const { EMPTY_SCHEDULE, specFromOffer, TIMED_OFFERS } = await import("../../domain/schedule");
const { I18nProvider } = await import("../../i18n");
const { FloatingLayerProvider } = await import("../floating");
import type { ReminderSpec, Schedule } from "../../domain/schedule";

const TIMED: Schedule = { ...EMPTY_SCHEDULE, dueDate: "2026-08-20", startTime: "15:00" };

function renderList(reminders: ReminderSpec[] = []) {
  const onToggle = vi.fn();
  render(
    <I18nProvider lang="en">
      {/* 사용자 지정's hour is a `TimeField`, which is a layer. */}
      <FloatingLayerProvider>
        <ReminderList draft={{ ...TIMED, reminders }} locale="en-US" onToggle={onToggle} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return onToggle;
}

beforeEach(() => {
  notificationAccess.mockResolvedValue("unasked");
  requestNotificationPermission.mockResolvedValue("granted");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the reminder list (§6.17)", () => {
  it("offers checkboxes and not a radiogroup (§6.15)", () => {
    renderList();
    // The shape IS the claim: a radiogroup would drop the previous choice, and
    // a Task is allowed several reminders.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(TIMED_OFFERS.length);
  });

  // §5: the brackets are not decoration — they are `reminderMoment`, which is
  // what turns "1 hour before" into something a reader can check.
  it("says when each one actually falls", () => {
    renderList();
    expect(screen.getByRole("checkbox", { name: "1 hour before (2:00 PM)" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "On time (3:00 PM)" })).toBeTruthy();
  });

  // The labels used to carry the hour themselves — "1 day before, 9:00 AM" —
  // which with §5's brackets would have said it twice on one line.
  it("says the hour once", () => {
    renderList();
    expect(screen.getByRole("checkbox", { name: "1 day before (9:00 AM)" })).toBeTruthy();
  });

  it("shows which are already on", () => {
    renderList([specFromOffer(TIMED_OFFERS[2])]);
    expect(screen.getByRole("checkbox", { name: /1 hour before/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /10 minutes before/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("hands the chosen reminder back", async () => {
    const user = userEvent.setup();
    const onToggle = renderList();
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    expect(onToggle).toHaveBeenCalledWith(specFromOffer(TIMED_OFFERS[2]));
  });

  // §5, and the difference from the reference this app chose deliberately: a
  // toggle lands on the draft, and the editor's 확인 is the only Save.
  it("has no Save of its own", () => {
    renderList();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("adds a reminder at a moment of its own (§6.13)", async () => {
    const user = userEvent.setup();
    const onToggle = renderList();
    // §6.3 keeps it a door of its own rather than a fifth unit in 사용자 지정.
    await user.click(screen.getByRole("button", { name: "At a specific time" }));
    await user.type(screen.getByLabelText("At a specific time"), "2026-09-01T07:30");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ type: "absolute", absoluteAt: "2026-09-01T07:30" }),
    );
  });
});

describe("permission (§6.39, §6.40)", () => {
  it("asks nothing until a reminder is chosen", async () => {
    renderList();
    await waitFor(() => expect(notificationAccess).toHaveBeenCalled());
    // The rule this app was breaking: the prompt used to appear on first load,
    // from `useReminders`, before the user had asked for anything.
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("asks at the moment one is chosen", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it("does not ask again once it has an answer", async () => {
    const user = userEvent.setup();
    notificationAccess.mockResolvedValue("denied");
    renderList();
    await screen.findByRole("status");
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    // Asking after a refusal shows nothing in any browser; a second request is
    // a call the platform silently drops.
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("saves the reminder anyway when permission is refused (§6.40, §26.6.4)", async () => {
    const user = userEvent.setup();
    notificationAccess.mockResolvedValue("denied");
    const onToggle = renderList();
    await screen.findByRole("status");
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("says the reminder is stored and will not be delivered", async () => {
    notificationAccess.mockResolvedValue("denied");
    renderList();
    // §26.6.2's distinction, in the one place the user meets it: this is not
    // "the reminder failed", it is "the reminder is saved and the OS is off".
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("Saved.");
    expect(notice.textContent).toContain("Notifications are turned off");
  });

  it("says something different when the platform has no channel at all", async () => {
    notificationAccess.mockResolvedValue("unsupported");
    renderList();
    expect((await screen.findByRole("status")).textContent).toContain("no way to show notifications");
  });

  it("says nothing while notifications work", async () => {
    notificationAccess.mockResolvedValue("granted");
    renderList();
    await waitFor(() => expect(notificationAccess).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
