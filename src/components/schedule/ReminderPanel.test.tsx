// @vitest-environment jsdom
//
// The reminder panel, and the two rules about permission it exists to keep
// (spec §6.17, §6.39, §6.40).
//
// `domain/schedule/reminders.test.ts` pins what a reminder MEANS. This is
// about the control: that it is a multi-select rather than a radiogroup, that
// asking the OS happens when the user wants a reminder and not before, and
// that a refusal is reported without the reminder being lost.
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

const { ReminderPanel } = await import("./ReminderPanel");
const { EMPTY_SCHEDULE, specFromOffer, TIMED_OFFERS } = await import("../../domain/schedule");
const { I18nProvider } = await import("../../i18n");
import type { ReminderSpec, Schedule } from "../../domain/schedule";

const TIMED: Schedule = { ...EMPTY_SCHEDULE, dueDate: "2026-08-20", startTime: "15:00" };

function renderPanel(reminders: ReminderSpec[] = []) {
  const onToggle = vi.fn();
  render(
    <I18nProvider lang="en">
      <ReminderPanel draft={{ ...TIMED, reminders }} onToggle={onToggle} onBack={() => {}} />
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

describe("the reminder panel (§6.17)", () => {
  it("offers checkboxes and not a radiogroup (§6.15)", () => {
    renderPanel();
    // The shape IS the claim: a radiogroup would drop the previous choice, and
    // a Task is allowed several reminders.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(TIMED_OFFERS.length);
  });

  it("shows which are already on", () => {
    renderPanel([specFromOffer(TIMED_OFFERS[2])]);
    expect(screen.getByRole("checkbox", { name: /1 hour before/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /10 minutes before/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("hands the chosen reminder back", async () => {
    const user = userEvent.setup();
    const onToggle = renderPanel();
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    expect(onToggle).toHaveBeenCalledWith(specFromOffer(TIMED_OFFERS[2]));
  });

  it("adds a reminder at a moment of its own (§6.13)", async () => {
    const user = userEvent.setup();
    const onToggle = renderPanel();
    const field = screen.getByLabelText("At a specific time");
    await user.type(field, "2026-09-01T07:30");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ type: "absolute", absoluteAt: "2026-09-01T07:30" }),
    );
  });
});

describe("permission (§6.39, §6.40)", () => {
  it("asks nothing until a reminder is chosen", async () => {
    renderPanel();
    await waitFor(() => expect(notificationAccess).toHaveBeenCalled());
    // The rule this app was breaking: the prompt used to appear on first load,
    // from `useReminders`, before the user had asked for anything.
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("asks at the moment one is chosen", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it("does not ask again once it has an answer", async () => {
    const user = userEvent.setup();
    notificationAccess.mockResolvedValue("denied");
    renderPanel();
    await screen.findByRole("status");
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    // Asking after a refusal shows nothing in any browser; a second request is
    // a call the platform silently drops.
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("saves the reminder anyway when permission is refused (§6.40, §26.6.4)", async () => {
    const user = userEvent.setup();
    notificationAccess.mockResolvedValue("denied");
    const onToggle = renderPanel();
    await screen.findByRole("status");
    await user.click(screen.getByRole("checkbox", { name: /1 hour before/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("says the reminder is stored and will not be delivered", async () => {
    notificationAccess.mockResolvedValue("denied");
    renderPanel();
    // §26.6.2's distinction, in the one place the user meets it: this is not
    // "the reminder failed", it is "the reminder is saved and the OS is off".
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("Saved.");
    expect(notice.textContent).toContain("Notifications are turned off");
  });

  it("says something different when the platform has no channel at all", async () => {
    notificationAccess.mockResolvedValue("unsupported");
    renderPanel();
    expect((await screen.findByRole("status")).textContent).toContain("no way to show notifications");
  });

  it("says nothing while notifications work", async () => {
    notificationAccess.mockResolvedValue("granted");
    renderPanel();
    await waitFor(() => expect(notificationAccess).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
