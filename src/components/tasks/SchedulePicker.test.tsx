// @vitest-environment jsdom
//
// The connection, not the editor. What the editor does with a draft is already
// covered by `domain/schedule`'s reducer tests and its own panels; what is new
// is that the Detail can reach it at all, and that the surface and the editor
// agree about when it closes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "../../types";
import type { Schedule } from "../../domain/schedule";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { SchedulePicker } from "./SchedulePicker";

afterEach(cleanup);

const TODAY = "2026-08-25";

function setup(taskOverrides: Partial<Task> = {}, issues: string[] = []) {
  const onCommit = vi.fn(() => issues as never[]);
  const task = {
    id: "t1",
    title: "Task",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    ...taskOverrides,
  } as Task;
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <SchedulePicker task={task} today={TODAY} onCommit={onCommit} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return onCommit;
}

const trigger = () => screen.getByRole("button", { name: /schedule|date and reminder/i });
const surface = () => screen.queryByRole("dialog", { name: "Schedule" });

describe("the property row (§5.53)", () => {
  it("invites a schedule when there is none", () => {
    setup();
    expect(screen.getByRole("button", { name: "Date and Reminder" })).not.toBeNull();
  });

  it("carries the schedule in its accessible name once there is one", () => {
    setup({ dueDate: "2026-09-01" });
    expect(trigger().getAttribute("aria-label")).toMatch(/^Schedule, /);
  });
});

describe("reaching the editor (Phase 3)", () => {
  it("opens the real editor rather than a date field", () => {
    setup();
    fireEvent.click(trigger());
    expect(surface()).not.toBeNull();
    // The editor's own calendar, which the `<input type="date">` never had.
    expect(surface()?.querySelector(".sched-editor")).not.toBeNull();
  });

  it("portals it out of the Detail, like every other property surface", () => {
    setup();
    fireEvent.click(trigger());
    expect(surface()?.closest("#floating-layer-root")).not.toBeNull();
  });

  it("closes on Escape without writing anything", () => {
    const onCommit = setup();
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(surface()).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("closes on an outside pointer without writing anything", () => {
    const onCommit = setup();
    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);
    expect(surface()).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
