// The Tasks Module shell (TickTick plan Implementation Phase 3, §16.26).
//
// The first screen built on the registry: what it may show, what it contains,
// and what its address is are all read from `scopeRegistry`, `scopeQuery` and
// `taskScopeUrl` rather than decided here. §12.26 forbids this file from
// re-deriving a product rule out of the path, so it does not know which
// Scopes allow Board, which have counts, or where `/` goes.
//
// List rendering only, per §16.26 — Board and the rich Drawer come later.
import { useMemo } from "react";
import type { Folder, List, Tag, Task, TaskDailyPlan, TaskTag } from "../../types";
import type { TaskScopeRef, TaskViewKind } from "../../domain/tasks/scopeRegistry";
import { scopeRegistry } from "../../domain/tasks/scopeRegistry";
import { queryScopeCount, queryScopeTasks, type ScopeContext } from "../../domain/tasks/scopeQuery";
import { parseTaskUrl, taskUrlFor } from "../../app/taskScopeUrl";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";
import { TasksSidebar } from "./TasksSidebar";

interface TasksModuleProps {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
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
}

export function TasksModule(props: TasksModuleProps) {
  const { t } = useT();
  const { tasks, lists, folders, dailyPlans, tags, taskTags, today, url, onNavigate } = props;

  const ctx: ScopeContext = useMemo(
    () => ({ tasks, lists, dailyPlans, taskTags, today }),
    [tasks, lists, dailyPlans, taskTags, today],
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

  // §5.28: an id that names nothing is a broken link, not an empty Scope. The
  // difference matters — "this List has no tasks" and "this List is gone" ask
  // the reader to do different things.
  const missing = namedRecordMissing(scope, lists, folders, tags);
  const title = missing ? t("tasks.missingTitle") : titleFor(scope, lists, folders, tags, t);
  const rows = missing ? [] : queryScopeTasks(scope, ctx);
  const count = missing ? 0 : queryScopeCount(scope, ctx);

  return (
    <section className="tm-shell">
      <TasksSidebar ctx={ctx} folders={folders} tags={tags} current={scope} onNavigate={go} />

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
              <li key={task.id} className="tm-task">
                <span className={`tm-task-title${task.status === "done" ? " is-done" : ""}`}>{task.title}</span>
                {task.dueDate ? <span className="tm-task-due">{task.dueDate}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </section>
  );
}

function namedRecordMissing(scope: TaskScopeRef, lists: List[], folders: Folder[], tags: Tag[]): boolean {
  switch (scope.kind) {
    case "list":
      return !lists.some((list) => list.id === scope.id);
    case "folder":
      return !folders.some((folder) => folder.id === scope.id);
    case "tag":
      return !tags.some((tag) => tag.id === scope.id);
    // A Filter names a record that cannot exist yet, so "missing" would be
    // true for every one of them and say nothing. Its own empty state covers it.
    default:
      return false;
  }
}

function titleFor(
  scope: TaskScopeRef,
  lists: List[],
  folders: Folder[],
  tags: Tag[],
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
      return folders.find((entry) => entry.id === scope.id)?.name ?? scope.id;
    case "tag":
      return tags.find((entry) => entry.id === scope.id)?.name ?? scope.id;
    case "filter":
      return t("tasks.filter");
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
