// @vitest-environment jsdom
//
// A Folder's screen, divided by the Lists it holds
// (FOLDER_TREE_AND_VIEW_DESIGN.md §5).
//
// `listGroups.test.ts` proves the grouping rule. This proves the SCREEN asks
// it — and that the two views of one Folder agree about the Lists in it, which
// is the whole reason §5.2 made the order a single function.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { List, SidebarFolder, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TasksModule } from "./TasksModule";
import { DEFAULT_SCOPE_VIEW_OPTIONS, type ScopeViewOptions } from "../../domain/view/scopeViewOptions";

const TODAY = "2026-09-03";

afterEach(cleanup);

function task(id: string, title: string, listId: string): Task {
  return {
    id,
    title,
    status: "todo",
    priority: "none",
    dueDate: TODAY,
    listId,
    sectionId: "",
    projectId: "",
    tags: [],
    notes: "",
    order: 0,
    createdAt: `${TODAY}T09:00:00.000Z`,
    updatedAt: `${TODAY}T09:00:00.000Z`,
    completedAt: "",
  } as unknown as Task;
}

function list(id: string, name: string, order: number, extra: Partial<List> = {}): List {
  return {
    id,
    name,
    order,
    projectId: "",
    kind: "regular",
    isDefault: false,
    createdAt: `${TODAY}T09:00:00.000Z`,
    updatedAt: `${TODAY}T09:00:00.000Z`,
    ...extra,
  } as unknown as List;
}

const folders: SidebarFolder[] = [
  { id: "f1", name: "School", sortKey: 0, createdAt: `${TODAY}T09:00:00.000Z`, updatedAt: `${TODAY}T09:00:00.000Z` },
];

/** Three Lists in one Folder; `Idle` holds nothing. */
const lists = [
  list("list-home", "Home", 0, { sidebarFolderId: "f1" }),
  list("list-work", "Work", 1, { sidebarFolderId: "f1" }),
  list("list-idle", "Idle", 2, { sidebarFolderId: "f1" }),
];

function renderModule(
  tasks: Task[],
  extra: {
    url?: string;
    lists?: List[];
    sidebarFolders?: SidebarFolder[];
    onCreate?: (title: string, resolution: unknown) => void;
    scopeViewOptions?: Record<string, ScopeViewOptions>;
    onSetScopeViewOptions?: (next: Record<string, ScopeViewOptions>) => void;
  } = {},
) {
  const onCreate = extra.onCreate ?? vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TasksModule
          tasks={tasks}
          lists={extra.lists ?? lists}
          folders={[]}
          sidebarFolders={extra.sidebarFolders ?? []}
          savedFilters={[]}
          listSections={[]}
          dailyPlans={[]}
          tags={[]}
          taskTags={[]}
          today={TODAY}
          url={extra.url ?? "/folder/f1"}
          onNavigate={() => {}}
          onStartFocus={() => {}}
          onDeleteForever={() => {}}
          onEmptyTrash={() => ({ tasks: 0, lists: 0, tasksWithLists: 0 })}
          scopeViewOptions={extra.scopeViewOptions}
          onSetScopeViewOptions={extra.onSetScopeViewOptions ?? (() => {})}
          onDuplicate={() => null}
          focusBusy={false}
          onCreate={onCreate}
          draftTitle=""
          onDraftConsumed={() => {}}
          onCreateList={() => "list-new"}
          onCreateSidebarFolder={() => "sf-new"}
          drawer={{
            childrenOf: () => [],
            onUpdate: () => {},
            onMoveToList: () => {},
            onCommitSchedule: () => [],
            onToggleTag: () => {},
            onAddSubtask: () => {},
            onToggleSubtask: () => {},
            onDeleteSubtask: () => {},
            checkItemsFor: () => [],
            onSetContentMode: () => {},
            onAddCheckItem: () => {},
            onAddCheckItems: () => {},
            onRenameCheckItem: () => {},
            onToggleCheckItem: () => {},
            onDeleteCheckItem: () => {},
            activityFor: () => [],
            remindersFor: () => [],
          }}
          lifecycle={{
            onTrashList: () => {},
            onRestoreList: () => {},
            onPermanentlyDeleteList: () => {},
          }}
          onSaveAsTemplate={() => "tpl-1"}
          onDeleteTemplate={() => {}}
          templates={[]}
          onUseTemplate={() => {}}
          onMutate={vi.fn()}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onCreate };
}


const groupNames = () => [...document.querySelectorAll(".tm-listgroup-name")].map((el) => el.textContent);

describe("a Folder's list view (§5)", () => {
  it("draws one group per List, in the sidebar's order", () => {
    renderModule([task("t1", "Write it up", "list-work")], { sidebarFolders: folders });
    expect(groupNames()).toEqual(["Home", "Work", "Idle"]);
  });

  // §5.3, and the same answer the Board gives: a Folder IS the set of its
  // Lists, so an empty one is the answer to "where else could this go".
  it("keeps the empty Lists", () => {
    renderModule([task("t1", "Write it up", "list-work")], { sidebarFolders: folders });
    const idle = document.querySelectorAll(".tm-listgroup")[2] as HTMLElement;
    expect(within(idle).getByText("Idle")).toBeTruthy();
    expect(idle.querySelectorAll(".tm-task")).toHaveLength(0);
  });

  it("puts each row under the List that owns it, and counts the group", () => {
    renderModule([task("t1", "Write it up", "list-work"), task("t2", "Buy milk", "list-home")], {
      sidebarFolders: folders,
    });
    const [home, work] = [...document.querySelectorAll(".tm-listgroup")] as HTMLElement[];
    expect(within(home).getByText("Buy milk")).toBeTruthy();
    expect(within(work).getByText("Write it up")).toBeTruthy();
    expect(within(home).getByText("1")).toBeTruthy();
  });

  // §5.4, and deliberately unlike the reference: the heading directly above
  // already IS that name.
  it("names the List once, on the heading and not on every row", () => {
    renderModule([task("t1", "Write it up", "list-work")], { sidebarFolders: folders });
    const work = [...document.querySelectorAll(".tm-listgroup")][1] as HTMLElement;
    expect(work.querySelector(".tm-task-list")).toBeNull();
  });

  // §13.4 made it a control and §11 answer 2 still holds: it folds, and it
  // does NOT navigate. Both at once is why it is a button inside a heading —
  // in the outline for a reader skipping by heading, a control for everyone
  // else.
  it("makes the heading a fold, and not a door", () => {
    renderModule([task("t1", "Write it up", "list-work")], { sidebarFolders: folders });
    const head = document.querySelector(".tm-listgroup-head") as HTMLElement;
    expect(head.tagName).toBe("H3");

    const fold = head.querySelector("button") as HTMLButtonElement;
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    // A door would be a link or would move the Scope; this is neither.
    expect(head.querySelector("a")).toBeNull();
  });

  it("folds a group away, count and all left standing", () => {
    const onSet = vi.fn();
    renderModule([task("t1", "Write it up", "list-work")], { sidebarFolders: folders, onSetScopeViewOptions: onSet });
    // The first heading is `Home`, which is where the sidebar order puts it.
    const head = document.querySelector(".tm-listgroup-head") as HTMLElement;
    fireEvent.click(head.querySelector("button") as HTMLButtonElement);

    // Remembered, per Folder (§13.4) — which is what makes this a settings
    // write rather than a `useState`.
    expect(onSet).toHaveBeenCalledTimes(1);
    const written = onSet.mock.calls[0][0] as Record<string, { collapsedListIds: string[] }>;
    expect(Object.values(written)[0].collapsedListIds).toEqual(["list-home"]);
  });

  it("draws no rows for a group that is folded", () => {
    renderModule([task("t1", "Write it up", "list-work")], {
      sidebarFolders: folders,
      scopeViewOptions: {
        "folder:f1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, collapsedListIds: ["list-work"] },
      },
    });
    const work = [...document.querySelectorAll(".tm-listgroup")][1] as HTMLElement;

    expect(work.querySelector(".tm-task")).toBeNull();
    // The count survives the fold: putting a List aside without losing sight
    // of how much is in it is most of what folding is for.
    expect(work.querySelector(".tm-count")?.textContent).toBe("1");
    expect(work.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
  });

  // A Folder with no tasks at all says so, rather than drawing three empty
  // headings. §5.3's "keep the empty Lists" is about a Folder that HAS work in
  // it; a Folder with none has one thing to say and says it once.
  it("says a Folder is empty rather than drawing headings over nothing", () => {
    renderModule([], { sidebarFolders: folders });
    expect(document.querySelector(".tm-listgroups")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("leaves every other Scope flat", () => {
    renderModule([task("t1", "Write it up", "list-work")], { url: "/today", sidebarFolders: folders });
    expect(document.querySelector(".tm-listgroups")).toBeNull();
    expect(document.querySelector(".tm-list")).toBeTruthy();
  });
});

describe("the Folder's quick add (§4)", () => {
  it("says it will land in the top List without being asked", () => {
    renderModule([], { sidebarFolders: folders });
    const field = screen.getByRole("textbox", { name: /^Add a task/ }) as HTMLInputElement;
    expect(field.placeholder).toBe("Add a task to Home");
  });

  // The top is the sidebar's top, not `order`'s — §4.2 and §5.2 are the same
  // answer read twice.
  it("follows the sidebar's own order when the user has arranged one", () => {
    renderModule([task("t1", "Write it up", "list-work")], {
      sidebarFolders: folders,
      lists: [
        list("list-home", "Home", 0, { sidebarFolderId: "f1", sidebarSortKey: 2 }),
        list("list-work", "Work", 1, { sidebarFolderId: "f1", sidebarSortKey: 1 }),
      ],
    });
    expect((screen.getByRole("textbox", { name: /^Add a task/ }) as HTMLInputElement).placeholder).toBe(
      "Add a task to Work",
    );
    expect(groupNames()).toEqual(["Work", "Home"]);
  });
});
