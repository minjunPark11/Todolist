// The Tasks Module shell (TickTick plan Implementation Phase 3, §16.26).
//
// The first screen built on the registry: what it may show, what it contains,
// and what its address is are all read from `scopeRegistry`, `scopeQuery` and
// `taskScopeUrl` rather than decided here. §12.26 forbids this file from
// re-deriving a product rule out of the path, so it does not know which
// Scopes allow Board, which have counts, or where `/` goes.
//
// List rendering only, per §16.26 — Board and the rich Drawer come later.
import { useMemo, useState } from "react";
import type { Folder, List, SavedFilter, SidebarFolder, Tag, Task, TaskDailyPlan, TaskTag } from "../../types";
import type { TaskScopeRef, TaskViewKind } from "../../domain/tasks/scopeRegistry";
import { scopeRegistry } from "../../domain/tasks/scopeRegistry";
import { queryScopeCount, queryScopeTasks, type ScopeContext } from "../../domain/tasks/scopeQuery";
import { parseTaskUrl, taskUrlFor } from "../../app/taskScopeUrl";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";
import { TasksSidebar } from "./TasksSidebar";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { TaskDrawer } from "./TaskDrawer";
import type { CreateResolution } from "../../domain/tasks/createResolver";
import type { TaskChild } from "../../domain/tasks/children";
import type { TaskMutation } from "../../domain/tasks/mutations";
import { applyPatch, completeTask, leavesScope, reopenTask, trashTask } from "../../domain/tasks/mutations";
import { isInboxList } from "../../domain/spaces/hierarchy";
import { folderIdFor } from "../../domain/tasks/sidebarFolders";

interface TasksModuleProps {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  sidebarFolders: SidebarFolder[];
  savedFilters: SavedFilter[];
  dailyPlans: TaskDailyPlan[];
  tags: Tag[];
  taskTags: TaskTag[];
  today: string;
  /** Path plus query, exactly as the address bar has it. */
  url: string;
  onNavigate: (url: string, mode?: "push" | "replace") => void;
  /** The account is still being read; the Scope has no answer yet (§16.26). */
  loading?: boolean;
  /** Last sync failure, if any — the Scope is showing what it has (§9.43). */
  error?: string;
  /** Commits what `resolveCreateContext` decided (§12.16). */
  onCreate: (title: string, resolution: CreateResolution) => void;
  /** Everything the Drawer can change about the Task it has open (§16.28). */
  drawer: {
    childrenOf: (taskId: string) => TaskChild[];
    onUpdate: (taskId: string, patch: Partial<Task>) => void;
    onMoveToList: (taskId: string, listId: string) => void;
    onAddSubtask: (taskId: string, title: string) => void;
    onToggleSubtask: (id: string) => void;
    onDeleteSubtask: (id: string) => void;
  };
  /**
   * Applies a described mutation and hands back the way to undo it (§16.29).
   *
   * The Module decides WHAT changes and whether the Task has left the Scope;
   * the caller owns the store.
   */
  onMutate: (taskId: string, patch: Partial<Task>) => void;
}

export function TasksModule(props: TasksModuleProps) {
  const { t } = useT();
  const { tasks, lists, folders, sidebarFolders, savedFilters, dailyPlans, tags, taskTags, today, url, onNavigate } =
    props;

  // One undo at a time, and it is the last thing that happened (§9.40 keeps
  // the stack out of the MVP).
  const [undo, setUndo] = useState<{ labelKey: string; run: () => void } | null>(null);

  const ctx: ScopeContext = useMemo(
    () => ({ tasks, lists, dailyPlans, taskTags, today, savedFilters }),
    [tasks, lists, dailyPlans, taskTags, today, savedFilters],
  );

  // The URL is the state. Nothing mirrors it into a field here, so the back
  // button restores a Scope by doing what it already does to the address bar
  // (§5.25, Gate 3's last line).
  const state = parseTaskUrl(url) ?? { scope: { kind: "today" } as TaskScopeRef, view: "list" as TaskViewKind, taskId: "" };
  const scope = state.scope;
  const policy = scopeRegistry[scope.kind];

  function go(next: TaskScopeRef) {
    onNavigate(taskUrlFor({ scope: next, view: "list", taskId: "" }));
  }

  function setView(view: TaskViewKind) {
    onNavigate(taskUrlFor({ ...state, view }), "replace");
  }

  // Opening the Drawer is a push and closing it is a pop, which is what makes
  // one Back close it (§16.28 Gate 5) rather than leave the Scope behind.
  function openTask(taskId: string) {
    onNavigate(taskUrlFor({ ...state, taskId }));
  }

  function closeTask() {
    onNavigate(taskUrlFor({ ...state, taskId: "" }));
  }

  // The open Task is read from the URL, so a reload reopens it. An id that
  // names nothing simply opens nothing — §5.30 refuses to make a dead link an
  // error the reader has to dismiss.
  const openedTask = state.taskId ? tasks.find((task) => task.id === state.taskId) : undefined;

  /**
   * §12.21, in one place: apply, then ask whether the Task still belongs here.
   *
   * A Task that has left the Scope takes the Drawer with it — leaving it open
   * over a row that is no longer in the list is the state §4.64 refuses. The
   * undo comes from the mutation rather than from inverting the patch, so
   * pressing it restores what was there and not an approximation (§9.35).
   */
  function mutate(target: Task, mutation: TaskMutation) {
    props.onMutate(target.id, mutation.patch);
    const left = leavesScope(target, applyPatch(target, mutation.patch), scope, ctx);
    if (left && target.id === state.taskId) closeTask();
    setUndo({
      labelKey: mutation.labelKey,
      run: () => props.onMutate(target.id, mutation.undo),
    });
  }

  // §5.28: an id that names nothing is a broken link, not an empty Scope. The
  // difference matters — "this List has no tasks" and "this List is gone" ask
  // the reader to do different things.
  const missing = namedRecordMissing(scope, lists, folders, sidebarFolders, tags, savedFilters);
  const title = missing ? t("tasks.missingTitle") : titleFor(scope, lists, folders, sidebarFolders, tags, savedFilters, t);
  const rows = missing ? [] : queryScopeTasks(scope, ctx);
  const count = missing ? 0 : queryScopeCount(scope, ctx);

  return (
    <section className="tm-shell">
      <TasksSidebar
        ctx={ctx}
        folders={folders}
        sidebarFolders={sidebarFolders}
        tags={tags}
        savedFilters={savedFilters}
        current={scope}
        onNavigate={go}
      />

      <main className="tm-main">
        <header className="tm-header">
          <h1 className="tm-title">{title}</h1>
          {!missing && count > 0 ? <span className="tm-title-count">{count}</span> : null}

          {/* §16.26 Gate 3: only the views the Scope allows are offered. The
              selector is absent entirely where there is nothing to choose,
              rather than shown with one disabled option. */}
          {policy.allowedViews.length > 1 ? (
            <div className="tm-views" role="group" aria-label={t("tasks.viewLabel")}>
              {policy.allowedViews.map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`tm-view${view === state.view ? " is-current" : ""}`}
                  aria-pressed={view === state.view}
                  onClick={() => setView(view)}
                >
                  {t(view === "board" ? "tasks.viewBoard" : "tasks.viewList")}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {!missing && !props.loading ? (
          <TaskQuickAdd
            scope={scope}
            inboxListId={lists.find(isInboxList)?.id ?? ""}
            today={today}
            folderLists={
              scope.kind === "folder"
                ? lists.filter((list) => folderIdFor(list) === scope.id && !list.archivedAt)
                : []
            }
            tags={tags}
            savedFilters={savedFilters}
            onCreate={props.onCreate}
          />
        ) : null}

        {props.error ? (
          <p className="tm-state is-error" role="status">
            {props.error}
          </p>
        ) : null}

        {props.loading ? (
          <p className="tm-state" role="status">
            {t("tasks.loading")}
          </p>
        ) : missing ? (
          <p className="tm-state" role="status">
            {t("tasks.missingHint")}
          </p>
        ) : rows.length === 0 ? (
          <p className="tm-state" role="status">
            {t(emptyKeyFor(scope.kind))}
          </p>
        ) : state.view === "board" ? (
          // Board is Phase 7 (§16.30). The Scope allows it, so the selector
          // offers it; saying so is better than rendering a list under the
          // wrong label.
          <p className="tm-state" role="status">
            {t("tasks.boardLater")}
          </p>
        ) : (
          <ul className="tm-list">
            {rows.map((task) => (
              <li key={task.id} className={`tm-task${task.id === state.taskId ? " is-open" : ""}`}>
                <button type="button" className="tm-task-open" onClick={() => openTask(task.id)}>
                  <span className={`tm-task-title${task.status === "done" ? " is-done" : ""}`}>
                    {task.title}
                  </span>
                  {task.dueDate ? <span className="tm-task-due">{task.dueDate}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {openedTask ? (
        <TaskDrawer
          key={openedTask.id}
          task={openedTask}
          lists={lists}
          children={props.drawer.childrenOf(openedTask.id)}
          onClose={closeTask}
          onUpdate={(patch) => props.drawer.onUpdate(openedTask.id, patch)}
          onMoveToList={(listId) => props.drawer.onMoveToList(openedTask.id, listId)}
          onAddSubtask={(title) => props.drawer.onAddSubtask(openedTask.id, title)}
          onToggleSubtask={props.drawer.onToggleSubtask}
          onDeleteSubtask={props.drawer.onDeleteSubtask}
          onComplete={() =>
            mutate(
              openedTask,
              openedTask.status === "done"
                ? reopenTask(openedTask)
                : completeTask(openedTask, new Date().toISOString()),
            )
          }
          onTrash={() => mutate(openedTask, trashTask(openedTask, new Date().toISOString()))}
        />
      ) : null}

      {/* §9.36: the toast is where the way back lives, and it says what it
          would undo rather than just offering the word. */}
      {undo ? (
        <div className="tm-undo" role="status">
          <span>{t(undo.labelKey)}</span>
          <button
            type="button"
            onClick={() => {
              undo.run();
              setUndo(null);
            }}
          >
            {t("app.undo")}
          </button>
          <button type="button" onClick={() => setUndo(null)} aria-label={t("common.close")}>
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
}

function namedRecordMissing(
  scope: TaskScopeRef,
  lists: List[],
  folders: Folder[],
  sidebarFolders: SidebarFolder[],
  tags: Tag[],
  savedFilters: SavedFilter[],
): boolean {
  switch (scope.kind) {
    case "list":
      return !lists.some((list) => list.id === scope.id);
    // Either kind of group — the sidebar's own or the domain's — is a record
    // the link can name, and the Scope reads both through `folderIdFor`.
    case "folder":
      return !folders.some((folder) => folder.id === scope.id) && !sidebarFolders.some((folder) => folder.id === scope.id);
    case "tag":
      return !tags.some((tag) => tag.id === scope.id);
    case "filter":
      return !savedFilters.some((filter) => filter.id === scope.id);
    default:
      return false;
  }
}

function titleFor(
  scope: TaskScopeRef,
  lists: List[],
  folders: Folder[],
  sidebarFolders: SidebarFolder[],
  tags: Tag[],
  savedFilters: SavedFilter[],
  t: (key: string) => string,
): string {
  switch (scope.kind) {
    case "list": {
      const list = lists.find((entry) => entry.id === scope.id);
      // Through `listDisplayName`, so the Inbox reads in the user's language
      // rather than under the name the app stored it with (§6.7).
      return list ? listDisplayName(list, t("tasks.defaultList"), t("tasks.inbox")) : scope.id;
    }
    case "folder":
      return (
        sidebarFolders.find((entry) => entry.id === scope.id)?.name ??
        folders.find((entry) => entry.id === scope.id)?.name ??
        scope.id
      );
    case "tag":
      return tags.find((entry) => entry.id === scope.id)?.name ?? scope.id;
    // The Filter's own name, because that is what the user called this
    // question — the generic word is only for one that names no record.
    case "filter":
      return savedFilters.find((entry) => entry.id === scope.id)?.name ?? t("tasks.filter");
    default:
      return t(`tasks.${scope.kind}`);
  }
}

function emptyKeyFor(kind: TaskScopeRef["kind"]): string {
  // Each Scope's empty state says something about that Scope (§7.75), because
  // "no tasks" over Trash and over Today mean opposite things.
  switch (kind) {
    case "today":
      return "tasks.emptyToday";
    case "upcoming":
      return "tasks.emptyUpcoming";
    case "inbox":
      return "tasks.emptyInbox";
    case "completed":
      return "tasks.emptyCompleted";
    case "trash":
      return "tasks.emptyTrash";
    case "filter":
      return "tasks.emptyFilter";
    default:
      return "tasks.empty";
  }
}
