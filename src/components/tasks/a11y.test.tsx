// @vitest-environment jsdom
//
// Gate 11's "critical accessibility violation 0", measured rather than asserted.
//
// Phase 11's first pass fixed accessibility by reading the code — names on the
// list and board columns, a combobox over a listbox in the palette, labels on
// the column-move selects. Reading finds what you think to look for. This runs
// axe over the Tasks Module's real surfaces instead, and fails the suite on any
// violation axe rates serious or critical.
//
// What this cannot see is worth stating: jsdom computes no layout and paints
// nothing, so `color-contrast` is off here (it has no pixels to sample) and
// anything about focus order under a real compositor is still a human check.
// The rules that remain — names, roles, relationships, duplicate ids, list and
// heading structure — are the ones that were checked by eye before.
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import axe from "axe-core";
import type { List, ListSection, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { TasksModule } from "./TasksModule";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T09:00:00.000Z`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "",
    categoryId: "",
    parentTaskId: "",
    tags: [],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 0,
    activeSessionId: "",
    lastFocusedAt: "",
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 0,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  } as Task;
}

const inboxList: List = {
  id: "list-inbox",
  projectId: "",
  kind: "inbox",
  name: "Inbox",
  order: -1,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const workList: List = {
  id: "l1",
  projectId: "p1",
  kind: "regular",
  name: "Work",
  order: 0,
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};
const doingSection: ListSection = {
  id: "sec1",
  listId: "l1",
  name: "Doing",
  createdAt: NOW,
  updatedAt: NOW,
};

const tasks: Task[] = [
  task({ id: "t1", listId: "l1", title: "Write the release notes", dueDate: TODAY, priority: "high" }),
  task({ id: "t2", listId: "l1", title: "Review the migration audit", sectionId: "sec1" }),
  task({ id: "t3", listId: "list-inbox", title: "Something captured on the way home" }),
  task({ id: "t4", listId: "l1", title: "Finished earlier today", status: "done", completedAt: NOW }),
] as Task[];

function renderModule(url: string) {
  return render(
    <I18nProvider lang="ko">
      <TasksModule
        tasks={tasks}
        lists={[inboxList, workList]}
        folders={[]}
        sidebarFolders={[]}
        savedFilters={[]}
        listSections={[doingSection]}
        projects={[]}
        spaces={[]}
        dailyPlans={[]}
        tags={[]}
        taskTags={[]}
        today={TODAY}
        url={url}
        onNavigate={() => {}}
        onCreate={() => {}}
        onCreateList={() => "list-new"}
        drawer={{
          childrenOf: () => [],
          onUpdate: () => {},
          onMoveToList: () => {},
          onAddSubtask: () => {},
          onToggleSubtask: () => {},
          onDeleteSubtask: () => {},
        }}
        lifecycle={{
          onArchiveList: () => {},
          onTrashList: () => {},
          onRestoreList: () => {},
          onPermanentlyDeleteList: () => {},
        }}
        onMutate={() => {}}
      />
    </I18nProvider>,
  );
}

/** Violations axe rates serious or critical — Gate 11's bar, not every nit. */
async function seriousViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // No layout, no pixels: axe cannot sample colours in jsdom.
      "color-contrast": { enabled: false },
      // The Module is mounted alone here; "is there one main landmark on the
      // page" is a question about the app shell, which owns the other regions.
      region: { enabled: false },
    },
  });
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.html.slice(0, 120)),
    }));
}

afterEach(cleanup);

describe("Tasks Module accessibility (Gate 11)", () => {
  const surfaces: Array<[name: string, url: string]> = [
    ["Today", "/today"],
    ["Upcoming", "/upcoming"],
    ["Inbox", "/inbox"],
    ["a List as a list", "/list/l1"],
    ["a List as a board", "/list/l1?view=board"],
    ["a List as a timeline", "/list/l1?view=gantt"],
    ["the Inbox as a timeline", "/inbox?view=gantt"],
    ["a List with the Task Detail open", "/list/l1?task=t1"],
    ["a board with the Task Detail open", "/list/l1?view=board&task=t1"],
    ["Completed", "/completed"],
    ["Trash", "/trash"],
    ["Search", "/search?q=release"],
  ];

  for (const [name, url] of surfaces) {
    it(`has no serious or critical violation on ${name}`, async () => {
      const { container } = renderModule(url);
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("has no serious or critical violation with the Add List dialog open", async () => {
    const user = userEvent.setup();
    const { container } = renderModule("/today");
    // §0.7 R0-3 keeps the dialog out of the URL, so it is opened the way a
    // user opens it — from the Lists header.
    await user.click(container.querySelector<HTMLElement>('.tm-section-action[aria-label]')!);

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("has no serious or critical violation with the Command Palette open", async () => {
    const user = userEvent.setup();
    const { container } = renderModule("/list/l1");
    // §10.23: the palette is UI state, so there is no URL that renders it —
    // it has to be opened the way a user opens it.
    await user.keyboard("{Control>}k{/Control}");

    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
    expect(await seriousViolations(container)).toEqual([]);
  });
});

// Two guards on the tests above, because a screen that renders nothing and a
// screen with nothing wrong produce the same empty list of violations.
describe("the accessibility check itself", () => {
  it("is looking at a rendered Module, not an empty container", () => {
    const { container } = renderModule("/list/l1?view=board&task=t1");

    // Sidebar, board columns, the task rows and the open Detail.
    expect(container.textContent).toContain("Write the release notes");
    expect(container.querySelectorAll("button").length).toBeGreaterThan(5);
  });

  it("reports the violations it is meant to catch", async () => {
    const broken = document.createElement("div");
    broken.innerHTML = '<button></button><img src="x.png"><input type="text">';
    document.body.appendChild(broken);

    const found = await seriousViolations(broken);

    expect(found.map((violation) => violation.id).sort()).toEqual(["button-name", "image-alt", "label"]);
  });
});
