// @vitest-environment jsdom
//
// Phase 4's shell rules, at the level a test without layout can see them:
// what the resize handle reports, and that a Task leaving the query does not
// take its Detail with it (§1.28).
//
// The pixels are not here. jsdom computes no layout, so "the header actually
// stays put while the content scrolls" is e2e's; what IS checkable is that the
// header and the scroll region are separate boxes, which is the structural
// half of §1.7.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { List, Task } from "../../types";
import { taskActions } from "../../domain/tasks/actions";
import {
  TASK_DETAIL_DEFAULT_WIDTH,
  TASK_DETAIL_MAX_WIDTH,
  TASK_DETAIL_MIN_WIDTH,
  TASK_DETAIL_STEP,
  TASK_DETAIL_WIDTH_KEY,
} from "../../app/taskDetailWidth";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { useTaskDetailWidth } from "../../hooks/useTaskDetailWidth";
import { TaskDrawer } from "./TaskDrawer";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const NOW = "2026-08-25T00:00:00.000Z";

const inbox: List = {
  id: "list-inbox",
  projectId: "",
  kind: "inbox",
  name: "Inbox",
  order: -1,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    priority: "none",
    listId: inbox.id,
    parentTaskId: "",
    projectId: "",
    tags: [],
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    ...overrides,
  } as Task;
}

/**
 * Stands in for the Module, which owns the width so the reserved empty column
 * can be exactly as wide as the real pane.
 */
function Harness({ presentation }: { presentation: "inline-drawer" | "right-sheet" }) {
  const resize = useTaskDetailWidth();
  const noop = () => {};
  return (
    <div style={{ ["--tm-detail-w" as string]: `${resize.width}px` }}>
        <TaskDrawer
          presentation={presentation}
          task={task()}
          lists={[inbox]}
          folders={[]}
          tags={[]}
          taskTags={[]}
          onToggleTag={noop}
          children={[]}
          checkItems={[]}
          ancestors={[]}
          canAddSubtask
          today="2026-08-25"
          onClose={noop}
          onUpdate={noop}
          onComplete={noop}
          onMoveToList={noop}
          onSetPriority={noop}
          onCommitSchedule={() => []}
          onAddSubtask={noop}
          onToggleSubtask={noop}
          onDeleteSubtask={noop}
          reminders={[]}
          actions={taskActions({ task: task() })}
          onRunAction={noop}
          activity={null}
          onCloseActivity={noop}
          onSetContentMode={noop}
          onAddCheckItem={noop}
          onAddCheckItems={noop}
          onRenameCheckItem={noop}
          onToggleCheckItem={noop}
          onDeleteCheckItem={noop}
          onOpenTask={noop}
          blockerOptions={[]}
          blocking={[]}
          resize={resize}
        />
    </div>
  );
}

function renderDrawer(presentation: "inline-drawer" | "right-sheet" = "inline-drawer") {
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <Harness presentation={presentation} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
}

const handle = () => screen.getByRole("separator", { name: "Resize the task detail" });
const pane = () => document.querySelector(".tm-drawer") as HTMLElement;
/** The Module stands in for this: the element the width variable is set on. */
const widthHost = () => pane().parentElement as HTMLElement;

describe("the resize handle (§1.12, §1.13)", () => {
  it("reports the range it can be dragged through", () => {
    renderDrawer();
    expect(handle().getAttribute("aria-valuemin")).toBe(String(TASK_DETAIL_MIN_WIDTH));
    expect(handle().getAttribute("aria-valuemax")).toBe(String(TASK_DETAIL_MAX_WIDTH));
    expect(handle().getAttribute("aria-valuenow")).toBe(String(TASK_DETAIL_DEFAULT_WIDTH));
  });

  // §1.12 is a desktop rule. The other presentations cover the list rather
  // than sitting beside it, so there is nothing for a drag to change.
  it("is absent where the pane is not a column beside the list", () => {
    renderDrawer("right-sheet");
    expect(screen.queryByRole("separator", { name: "Resize the task detail" })).toBeNull();
  });

  // The handle is on the pane's LEFT edge, so left widens.
  it("widens on ArrowLeft and narrows on ArrowRight", () => {
    renderDrawer();
    fireEvent.keyDown(handle(), { key: "ArrowLeft" });
    expect(handle().getAttribute("aria-valuenow")).toBe(String(TASK_DETAIL_DEFAULT_WIDTH + TASK_DETAIL_STEP));
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(handle().getAttribute("aria-valuenow")).toBe(String(TASK_DETAIL_DEFAULT_WIDTH));
  });

  it("leaves keys it does not use to whatever is listening", () => {
    renderDrawer();
    const event = fireEvent.keyDown(handle(), { key: "Tab" });
    // `fireEvent` returns false when preventDefault was called.
    expect(event).toBe(true);
  });

  it("puts the width where both the pane and the empty column can read it", () => {
    renderDrawer();
    expect(widthHost().style.getPropertyValue("--tm-detail-w")).toBe(`${TASK_DETAIL_DEFAULT_WIDTH}px`);
    fireEvent.keyDown(handle(), { key: "Home" });
    expect(widthHost().style.getPropertyValue("--tm-detail-w")).toBe(`${TASK_DETAIL_MAX_WIDTH}px`);
  });
});

describe("width persistence (§1.14)", () => {
  it("saves the width as a UI preference, not on the Task", () => {
    renderDrawer();
    fireEvent.keyDown(handle(), { key: "End" });
    expect(localStorage.getItem(TASK_DETAIL_WIDTH_KEY)).toBe(String(TASK_DETAIL_MIN_WIDTH));
  });

  it("restores what was stored", () => {
    localStorage.setItem(TASK_DETAIL_WIDTH_KEY, "520");
    renderDrawer();
    expect(handle().getAttribute("aria-valuenow")).toBe("520");
  });

  // A pane stuck at a width nobody can see is worse than one that forgot.
  it("recovers from a stored value that makes no sense", () => {
    localStorage.setItem(TASK_DETAIL_WIDTH_KEY, "not-a-width");
    renderDrawer();
    expect(handle().getAttribute("aria-valuenow")).toBe(String(TASK_DETAIL_DEFAULT_WIDTH));
  });

  it("resets to the default on a double-click, not to the last width", () => {
    localStorage.setItem(TASK_DETAIL_WIDTH_KEY, "600");
    renderDrawer();
    fireEvent.doubleClick(handle());
    expect(handle().getAttribute("aria-valuenow")).toBe(String(TASK_DETAIL_DEFAULT_WIDTH));
  });
});

describe("the property header (§1.7)", () => {
  // The structural half: the header is not inside the box that scrolls. That
  // is what makes `position: sticky` on it mean anything, and it is what was
  // wrong before — the whole pane scrolled, header included.
  it("sits outside the scrolling region", () => {
    renderDrawer();
    const header = pane().querySelector(".tm-drawer-head");
    const scroller = pane().querySelector(".tm-drawer-scroll");
    expect(header).not.toBeNull();
    expect(scroller).not.toBeNull();
    expect(scroller?.contains(header!)).toBe(false);
  });

  // §1.7 draws `□ │ date │ ⚑` as one row, so all three live in the header
  // rather than as stacked property rows further down.
  it("holds Complete, the schedule and Priority", () => {
    renderDrawer();
    const header = pane().querySelector(".tm-drawer-head") as HTMLElement;
    expect(header.querySelector("input[type='checkbox']")).not.toBeNull();
    expect(header.querySelector(".sched-trigger")).not.toBeNull();
    expect(header.querySelector(".tm-priority-trigger")).not.toBeNull();
  });
});
