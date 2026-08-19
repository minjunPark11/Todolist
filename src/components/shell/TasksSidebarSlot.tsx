// The Tasks sidebar, packaged so that anything can render it (audit D-21).
//
// The problem this solves: P0-3 gave the shell a `mode`, but the mode only
// decided how wide the sidebar was and whether it showed — WHICH sidebar
// rendered was still decided by `App.tsx`'s `parseTaskScope` branch. So
// `/archive` reported `mode: "tasks"` and drew the legacy sidebar, and a row
// pointing at it from the Tasks sidebar would have swapped the sidebar out
// from under the click.
//
// `TasksSidebar` could not simply be rendered by both callers, because two
// pieces of state and two dialogs hang off it. They live here now, with it,
// rather than in whichever shell happens to be on screen — which is also what
// stops the Tasks Module from being the only place that can open Manage.
import { useState } from "react";
import type {
  Folder,
  List,
  SavedFilter,
  SidebarFolder,
  Tag,
  Task,
  TaskDailyPlan,
  TaskTag,
} from "../../types";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { scopeRegistry } from "../../domain/tasks/scopeRegistry";
import type { ScopeContext } from "../../domain/tasks/scopeQuery";
import { resolveListView } from "../../domain/tasks/listView";
import { taskUrlFor } from "../../app/taskScopeUrl";
import { createListPayload, type CreateListDraft } from "../../domain/tasks/createListDraft";
import { TasksSidebar, type TasksSidebarPage } from "../tasks/TasksSidebar";
import { ListManager } from "../tasks/ListManager";
import { CreateListModal } from "../tasks/CreateListModal";

export interface TasksSidebarSlotProps {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  sidebarFolders: SidebarFolder[];
  tags: Tag[];
  savedFilters: SavedFilter[];
  dailyPlans: TaskDailyPlan[];
  taskTags: TaskTag[];
  today: string;
  /** The Scope the sidebar should mark, or null off any Scope (Search, Archive). */
  current: TaskScopeRef | null;
  /** A row that is an address rather than a Scope, or null. */
  currentPage: TasksSidebarPage | null;
  /** Navigates to a full Tasks URL — path and query both (§5.62). */
  onNavigateUrl: (url: string) => void;
  onOpenPage: (page: TasksSidebarPage) => void;
  /** Called before navigating, so an overlay sidebar can close itself. */
  onBeforeNavigate?: () => void;
  onCreateList: (payload: {
    name: string;
    color?: string;
    defaultViewKey?: string;
    sidebarFolderId?: string;
  }) => Promise<string> | string;
  onCreateSidebarFolder: (name: string) => Promise<string> | string;
  onRestoreList: (listId: string) => void;
  onPermanentlyDeleteList: (listId: string) => void;
}

export function TasksSidebarSlot({
  tasks,
  lists,
  folders,
  sidebarFolders,
  tags,
  savedFilters,
  dailyPlans,
  taskTags,
  today,
  current,
  currentPage,
  onNavigateUrl,
  onOpenPage,
  onBeforeNavigate,
  onCreateList,
  onCreateSidebarFolder,
  onRestoreList,
  onPermanentlyDeleteList,
}: TasksSidebarSlotProps) {
  // §13.25: a management surface, not a Scope — so it is state here and not a
  // tenth route.
  const [managing, setManaging] = useState(false);
  // §0.7 R0-3: the dialog is UI state and nothing about it is in the URL, the
  // same treatment §10.23 gives the palette. `null` is §1.5's S1 (CLOSED);
  // a string is the Folder it was started from, "" for the Lists header.
  const [creatingListIn, setCreatingListIn] = useState<string | null>(null);

  const ctx: ScopeContext = { tasks, lists, dailyPlans, taskTags, today, savedFilters };

  /**
   * A Scope's own address (§5.63).
   *
   * A List's stored `defaultViewKey` is resolved HERE, on the way in, so the
   * address that results says which View it is rather than leaving the screen
   * to consult a preference the URL does not mention.
   */
  function go(next: TaskScopeRef) {
    const policy = scopeRegistry[next.kind];
    const owner = next.kind === "list" ? lists.find((list) => list.id === next.id) : undefined;
    onBeforeNavigate?.();
    onNavigateUrl(
      taskUrlFor({ scope: next, view: resolveListView(owner?.defaultViewKey, policy), taskId: "" }),
    );
  }

  return (
    <>
      <TasksSidebar
        ctx={ctx}
        folders={folders}
        sidebarFolders={sidebarFolders}
        tags={tags}
        savedFilters={savedFilters}
        onManageLists={() => setManaging(true)}
        onCreateList={(contextFolderId) => setCreatingListIn(contextFolderId)}
        current={current}
        currentPage={currentPage}
        onNavigate={go}
        onOpenPage={(page) => {
          onBeforeNavigate?.();
          onOpenPage(page);
        }}
      />

      {creatingListIn !== null ? (
        <CreateListModal
          contextFolderId={creatingListIn}
          folders={sidebarFolders}
          onCreateFolder={onCreateSidebarFolder}
          onClose={() => setCreatingListIn(null)}
          onSubmit={async (draft: CreateListDraft) => {
            const payload = createListPayload(draft);
            const listId = await onCreateList(payload);
            // A creation that answers with no id has not produced a List to
            // open; treating it as success would close the dialog over a draft
            // that went nowhere (§1.12).
            if (!listId) throw new Error("");
            setCreatingListIn(null);
            // §1.10, and §17.2's real finish line: the record is not the end,
            // being in the new List ready to type is. §1.10 ends in the View
            // the user just chose, not in the default one — being sent
            // somewhere other than what you picked, one second after picking
            // it, reads as the choice not having been taken.
            onNavigateUrl(
              taskUrlFor({
                scope: { kind: "list", id: listId },
                view: resolveListView(payload.defaultViewKey, scopeRegistry.list),
                taskId: "",
              }),
            );
          }}
        />
      ) : null}

      {managing ? (
        <ListManager
          lists={lists}
          tasks={tasks}
          onRestore={onRestoreList}
          onPermanentlyDelete={onPermanentlyDeleteList}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </>
  );
}
