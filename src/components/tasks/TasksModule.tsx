// The Tasks Module shell (TickTick plan Implementation Phase 3, §16.26).
//
// The first screen built on the registry: what it may show, what it contains,
// and what its address is are all read from `scopeRegistry`, `scopeQuery` and
// `taskScopeUrl` rather than decided here. §12.26 forbids this file from
// re-deriving a product rule out of the path, so it does not know which
// Scopes allow Board, which have counts, or where `/` goes.
//
// List rendering only, per §16.26 — Board and the rich Drawer come later.
import { useEffect, useMemo, useState } from "react";
import type {
  Folder,
  List,
  ListSection,
  Project,
  SavedFilter,
  SidebarFolder,
  Space,
  Tag,
  Task,
  TaskDailyPlan,
  TaskTag,
} from "../../types";
import type { TaskScopeRef, TaskViewKind } from "../../domain/tasks/scopeRegistry";
import { scopeRegistry } from "../../domain/tasks/scopeRegistry";
import { queryScopeCount, queryScopeTasks, type ScopeContext } from "../../domain/tasks/scopeQuery";
import { parseSearchUrl, searchUrlFor, taskUrlFor, urlForSearchResult, parseTaskUrl } from "../../app/taskScopeUrl";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";
import { TasksSidebar } from "./TasksSidebar";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { TaskDrawer } from "./TaskDrawer";
import type { CreateResolution } from "../../domain/tasks/createResolver";
import type { TaskChild } from "../../domain/tasks/children";
import type { TaskMutation } from "../../domain/tasks/mutations";
import { applyPatch, completeTask, leavesScope, moveTaskToSection, reopenTask, trashTask } from "../../domain/tasks/mutations";
import { isInboxList } from "../../domain/spaces/hierarchy";
import { listIdFor } from "../../domain/spaces/membership";
import { folderIdFor } from "../../domain/tasks/sidebarFolders";
import { INBOX_COLUMNS, inboxBucketOf, listBoardColumns, moveToInboxBucket, type InboxBucket } from "../../domain/tasks/board";
import { placeTask, sortByManualOrder } from "../../domain/tasks/sortKey";
import { sectionIdFor } from "../../domain/tasks/sections";
import { TaskBoard } from "./TaskBoard";
import { CommandPalette } from "./CommandPalette";
import { ListManager } from "./ListManager";
import { CreateListModal } from "./CreateListModal";
import { createListPayload, type CreateListDraft } from "../../domain/tasks/createListDraft";
import { useResponsiveMode, useViewportHeightVar } from "./useResponsiveMode";
import { detailIsFullScreen, sidebarPresentationFor, taskDetailPresentationFor } from "../../domain/tasks/responsive";
import type { SearchCollections, SearchResult } from "../../domain/tasks/search";
import { flattenGroups, PAGE_LIMITS, searchAll } from "../../domain/tasks/search";
import type { TaskCommand } from "../../domain/tasks/commands";
import type { RecentEntry } from "./CommandPalette";
import type { RecentState } from "../../domain/tasks/recents";
import { NO_RECENTS, rememberScope, rememberTask, sanitizeRecents } from "../../domain/tasks/recents";
import { platform } from "../../platform";
import { SEARCH_KINDS, type SearchKind } from "../../domain/tasks/search";

/** §10.44: local to this device, and not part of the account's data. */
const RECENTS_KEY = "focusflow.tasks.recents.v1";

interface TasksModuleProps {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  sidebarFolders: SidebarFolder[];
  savedFilters: SavedFilter[];
  listSections: ListSection[];
  /** Searched by §10.16, and navigated to through the Spaces routes. */
  projects: Project[];
  spaces: Space[];
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
  /** §13.23/§6.56: restoring a List, and the one hard delete in the app. */
  /**
   * Creates the List and answers with its id (Add List design §1.10).
   *
   * It returns the id because the flow does not end at the record: the Module
   * has to select the new List and open it, and §17.2 calls anything short of
   * that unfinished. Rejecting means the draft is kept and shown again.
   */
  onCreateList: (payload: {
    name: string;
    color?: string;
    defaultViewKey?: string;
    folderId?: string;
  }) => Promise<string> | string;
  lifecycle: {
    onArchiveList: (listId: string) => void;
    onTrashList: (listId: string) => void;
    onRestoreList: (listId: string) => void;
    onPermanentlyDeleteList: (listId: string) => void;
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
  const {
    tasks,
    lists,
    folders,
    sidebarFolders,
    savedFilters,
    listSections,
    projects,
    spaces,
    dailyPlans,
    tags,
    taskTags,
    today,
    url,
    onNavigate,
  } = props;

  // One undo at a time, and it is the last thing that happened (§9.40 keeps
  // the stack out of the MVP).
  const [undo, setUndo] = useState<{ labelKey: string; run: () => void } | null>(null);
  // §10.23: the palette is UI state and nothing about it is in the URL.
  const [paletteOpen, setPaletteOpen] = useState(false);
  // §10.41's other half: the palette captures a title, Quick Add commits it.
  const [captured, setCaptured] = useState("");
  // §13.25: a management surface, not a Scope — so it is state here and not a
  // tenth route.
  const [managing, setManaging] = useState(false);
  // §0.7 R0-3: the dialog is UI state and nothing about it is in the URL, the
  // same treatment §10.23 gives the palette. `null` is §1.5's S1 (CLOSED);
  // a string is the Folder it was started from, "" for the Lists header.
  const [creatingListIn, setCreatingListIn] = useState<string | null>(null);
  // §15.3. Presentation only: nothing below reads this to decide what a Scope
  // contains, which is what keeps §15.9 true — the URL means the same thing at
  // every width.
  const mode = useResponsiveMode();
  useViewportHeightVar();
  const sidebar = sidebarPresentationFor(mode);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // §10.44: a device preference, not account data. Nothing here is worth
  // syncing, and a list of what someone opened is worth less to them than it
  // would be to anyone reading over their shoulder.
  const [recents, setRecents] = useState<RecentState>(() => {
    try {
      return sanitizeRecents(JSON.parse(platform.storage.getSync(RECENTS_KEY) ?? "null"));
    } catch {
      return NO_RECENTS;
    }
  });

  const ctx: ScopeContext = useMemo(
    () => ({ tasks, lists, dailyPlans, taskTags, today, savedFilters }),
    [tasks, lists, dailyPlans, taskTags, today, savedFilters],
  );

  // §10.6. The shortcut is caught here rather than on a button, because the
  // palette is reachable from anywhere in the module and a focused input must
  // not swallow it.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // §10.19: the Search Page opens inside this shell. It is not a Scope — no
  // registry entry, no allowed views, nothing to count — so it is read from
  // the URL separately and the sidebar highlights nothing while it is open.
  const searchQuery = parseSearchUrl(url);

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

  // §10.43. Recorded from the URL rather than from the click that caused it,
  // so a place reached by Back or by a pasted link counts the same as one
  // reached from the sidebar.
  useEffect(() => {
    if (searchQuery !== null) return;
    setRecents((current) => rememberScope(current, scope));
  }, [searchQuery, scope.kind, "id" in scope ? scope.id : ""]);

  useEffect(() => {
    if (!state.taskId) return;
    setRecents((current) => rememberTask(current, state.taskId));
  }, [state.taskId]);

  useEffect(() => {
    platform.storage.setSync(RECENTS_KEY, JSON.stringify(recents));
  }, [recents]);

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

  const searchCollections: SearchCollections = {
    tasks,
    lists,
    folders,
    sidebarFolders,
    tags,
    savedFilters,
    projects,
    spaces,
  };

  // §10.43's five and five, with anything whose record has gone left out —
  // a recent row that opens a deleted Task is worse than one row fewer.
  const recentEntries: RecentEntry[] = [
    ...recents.scopes
      .filter((entry) => !namedRecordMissing(entry, lists, folders, sidebarFolders, tags, savedFilters))
      .map((entry) => ({
        key: `scope:${entry.kind}:${"id" in entry ? entry.id : ""}`,
        label: titleFor(entry, lists, folders, sidebarFolders, tags, savedFilters, t),
        url: taskUrlFor({ scope: entry, view: "list", taskId: "" }),
      })),
    ...recents.taskIds
      .map((taskId) => tasks.find((task) => task.id === taskId))
      .filter((task): task is Task => Boolean(task) && !task!.deletedAt)
      .map((task) => ({
        key: `task:${task.id}`,
        label: task.title,
        sublabel: t("tasks.recentTask"),
        url: urlForSearchResult(
          { kind: "task", id: task.id, title: task.title, ownerListId: listIdFor(task, lists) },
          lists,
          projects,
        ),
      })),
  ];

  /** §10.17/§10.18: a result opens at its OWN canonical place, Drawer and all. */
  function openResult(result: SearchResult) {
    setPaletteOpen(false);
    onNavigate(urlForSearchResult(result, lists, projects));
  }

  function runCommand(command: TaskCommand) {
    setPaletteOpen(false);
    const target = command.target({ scope, view: state.view });
    if ("search" in target) {
      onNavigate(searchUrlFor(""));
      return;
    }
    onNavigate(taskUrlFor({ scope: target.scope, view: target.view ?? "list", taskId: "" }));
  }

  // The Board's two adapters (§16.30). The component below knows about
  // columns and cards; which command a drop is belongs here, because it is the
  // only thing the two Boards do not share.
  const boardListId = scope.kind === "list" ? scope.id : "";
  const columns = scope.kind === "inbox" ? INBOX_COLUMNS : listBoardColumns(boardListId, listSections);
  const columnOf = (task: Task) =>
    scope.kind === "inbox" ? (inboxBucketOf(task) as string) : sectionIdFor(task, lists, listSections);
  const tasksIn = (columnId: string) => sortByManualOrder(rows.filter((task) => columnOf(task) === columnId));

  /**
   * A card was dropped, in two parts: which column it is now in, and where in
   * that column it sits.
   *
   * The first part is the canonical command — different per Board, which is
   * Gate 7 — and it is the one that gets the Undo, because it is the one that
   * changed something about the Task rather than about the view. The second is
   * `sortKey`: a renumbered neighbour keeps its place relative to everything
   * else, so it needs no undo of its own.
   */
  function dropOnBoard(taskId: string, columnId: string, index: number, date?: string) {
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;

    const from = columnOf(target);
    const mutation =
      from === columnId
        ? null
        : scope.kind === "inbox"
          ? moveToInboxBucket(target, columnId as InboxBucket, date)
          : moveTaskToSection(target, columnId, lists, listSections);
    // Null means the domain refused the drop — a date that was never supplied,
    // or a Section belonging to another List. Nothing is written, and the card
    // stays where it was rather than moving to a column it does not belong in.
    if (from !== columnId && !mutation) return;

    // Ordered against the column as it will be, not as it is: a card arriving
    // from another column is not in these rows yet.
    const column = tasksIn(columnId).filter((task) => task.id !== taskId);
    const placed = [...column.slice(0, index), target, ...column.slice(index)];
    const moves = placeTask(placed, taskId, index);
    const ownOrder = moves.find((row) => row.id === taskId);
    for (const row of moves) {
      if (row.id !== taskId) props.onMutate(row.id, { order: row.order });
    }

    if (mutation) {
      mutate(target, {
        patch: { ...mutation.patch, ...(ownOrder ? { order: ownOrder.order } : {}) },
        undo: { ...mutation.undo, ...(ownOrder ? { order: target.order } : {}) },
        labelKey: mutation.labelKey,
      });
    } else if (ownOrder) {
      props.onMutate(taskId, { order: ownOrder.order });
    }
  }

  return (
    <section
      className={`tm-shell is-${mode} sidebar-${sidebar}${sidebarOpen ? " sidebar-open" : ""}${
        openedTask && detailIsFullScreen(mode) ? " detail-full" : ""
      }`}
    >
      {/* §15.15/§15.16: an overlay Sidebar is a layer the user opened, so it
          has something to dismiss it with. A persistent one has nothing to
          close and renders no scrim. */}
      {sidebar === "overlay" && sidebarOpen ? (
        <div className="tm-scrim" onMouseDown={() => setSidebarOpen(false)} aria-hidden />
      ) : null}

      <TasksSidebar
        ctx={ctx}
        folders={folders}
        sidebarFolders={sidebarFolders}
        tags={tags}
        savedFilters={savedFilters}
        onManageLists={() => setManaging(true)}
        onCreateList={() => setCreatingListIn("")}
        current={searchQuery === null ? scope : null}
        onNavigate={(next) => {
          setSidebarOpen(false);
          go(next);
        }}
      />

      <main className="tm-main">
        {searchQuery !== null ? (
          <SearchPage
            query={searchQuery}
            collections={searchCollections}
            onQueryChange={(next) => onNavigate(searchUrlFor(next), "replace")}
            onPick={openResult}
          />
        ) : (
        <>
        <header className="tm-header">
          {/* §15.23: the way back to navigation, where the Sidebar is not a
              column. Absent on desktop, where it would open what is already
              open. */}
          {sidebar === "overlay" ? (
            <button
              type="button"
              className="tm-menu-open"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              {t("tasks.openNav")}
            </button>
          ) : null}
          <button type="button" className="tm-search-open" onClick={() => setPaletteOpen(true)}>
            {t("tasks.openSearch")}
          </button>
          <h1 className="tm-title">{title}</h1>
          {!missing && count > 0 ? (
            <span className="tm-title-count" aria-label={t("tasks.countLabel", { count })}>
              {count}
            </span>
          ) : null}

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

          {/* §13.21/§13.22 from the List's own screen, which is where the
              plan puts them. The Inbox is not offered either one: it is the
              floor a Task falls back to, so putting it away would leave the
              account with nowhere to capture (§6.5). Both are soft — the
              Tasks are not touched, and Manage is where they come back. */}
          {scope.kind === "list" && !missing && !isInboxList(lists.find((list) => list.id === scope.id) ?? { kind: "regular" }) ? (
            <div className="tm-scope-actions">
              <button type="button" onClick={() => props.lifecycle.onArchiveList(scope.id)}>
                {t("tasks.archiveList")}
              </button>
              <button type="button" onClick={() => props.lifecycle.onTrashList(scope.id)}>
                {t("tasks.deleteList")}
              </button>
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
                ? lists.filter((list) => folderIdFor(list) === scope.id && !list.archivedAt && !list.deletedAt)
                : []
            }
            tags={tags}
            savedFilters={savedFilters}
            draftTitle={captured}
            onCreate={(title, resolution) => {
              setCaptured("");
              props.onCreate(title, resolution);
            }}
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
        ) : rows.length === 0 && state.view !== "board" ? (
          <p className="tm-state" role="status">
            {t(emptyKeyFor(scope.kind))}
          </p>
        ) : state.view === "board" ? (
          <TaskBoard
            columns={columns}
            tasksIn={tasksIn}
            columnOf={columnOf}
            openTaskId={state.taskId}
            onOpen={openTask}
            onDrop={dropOnBoard}
            canReorder={policy.canManualReorder}
          />
        ) : (
          <ul className="tm-list" aria-label={title}>
            {rows.map((task) => (
              <li key={task.id} className={`tm-task${task.id === state.taskId ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="tm-task-open"
                  // §16.34: a row opens a Task, and a screen reader should say
                  // so rather than reading the title as if it were a heading.
                  aria-label={t("tasks.openTask", { title: task.title })}
                  onClick={() => openTask(task.id)}
                >
                  <span className={`tm-task-title${task.status === "done" ? " is-done" : ""}`}>
                    {task.title}
                  </span>
                  {task.dueDate ? <span className="tm-task-due">{task.dueDate}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        </>
        )}
      </main>

      {creatingListIn !== null ? (
        <CreateListModal
          contextFolderId={creatingListIn}
          onClose={() => setCreatingListIn(null)}
          onSubmit={async (draft: CreateListDraft) => {
            const listId = await props.onCreateList(createListPayload(draft));
            // A creation that answers with no id has not produced a List to
            // open; treating it as success would close the dialog over a draft
            // that went nowhere (§1.12).
            if (!listId) throw new Error("");
            setCreatingListIn(null);
            // §1.10, and §17.2's real finish line: the record is not the end,
            // being in the new List ready to type is. The URL layer already
            // knows how to say that, so no new routing rule is invented here.
            onNavigate(taskUrlFor({ scope: { kind: "list", id: listId }, view: "list", taskId: "" }));
          }}
        />
      ) : null}

      {managing ? (
        <ListManager
          lists={lists}
          tasks={tasks}
          onRestore={props.lifecycle.onRestoreList}
          onPermanentlyDelete={props.lifecycle.onPermanentlyDeleteList}
          onClose={() => setManaging(false)}
        />
      ) : null}

      {paletteOpen ? (
        <CommandPalette
          collections={searchCollections}
          ctx={{ scope, view: state.view }}
          recents={recentEntries}
          onClose={() => setPaletteOpen(false)}
          onPickResult={openResult}
          onRunCommand={runCommand}
          onOpenUrl={(next) => {
            setPaletteOpen(false);
            onNavigate(next);
          }}
          onSeeAll={(query) => {
            setPaletteOpen(false);
            onNavigate(searchUrlFor(query));
          }}
          onCapture={(title) => {
            // §10.41: owner = Inbox, and the user lands where the task would
            // go rather than being told after the fact.
            setPaletteOpen(false);
            setCaptured(title);
            onNavigate(taskUrlFor({ scope: { kind: "inbox" }, view: "list", taskId: "" }));
          }}
        />
      ) : null}

      {openedTask ? (
        <TaskDrawer
          presentation={taskDetailPresentationFor(mode)}
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

/**
 * The full Search Page (§10.19-§10.21).
 *
 * The query is in the URL and the input is bound to it, so a refresh, a back
 * button and a shared link all show the same results — which is the whole
 * reason §10.21 puts it there. Typing replaces rather than pushes: every
 * keystroke as a history entry would make Back mean "delete one character".
 */
function SearchPage({
  query,
  collections,
  onQueryChange,
  onPick,
}: {
  query: string;
  collections: SearchCollections;
  onQueryChange: (query: string) => void;
  onPick: (result: SearchResult) => void;
}) {
  const { t } = useT();
  // §10.22: the type filter is local state. It is worth having and not worth
  // sharing — `q` is the part of a search someone would send to someone else.
  const [kind, setKind] = useState<SearchKind | "all">("all");
  const all = searchAll(query, collections, { inbox: t("tasks.inbox"), defaultList: t("tasks.defaultList") }, PAGE_LIMITS);
  const groups = kind === "all" ? all : all.filter((group) => group.kind === kind);
  const total = flattenGroups(all).length;

  return (
    <section className="tm-search">
      <header className="tm-header">
        <h1>{t("tasks.searchTitle")}</h1>
        {total > 0 ? <span className="tm-count">{total}</span> : null}
      </header>

      <input
        className="tm-search-input"
        type="search"
        autoFocus
        value={query}
        placeholder={t("tasks.palettePlaceholder")}
        onChange={(event) => onQueryChange(event.target.value)}
      />

      {/* §10.20: only the types that actually matched, so the row is not a
          list of dead ends. */}
      {total > 0 ? (
        <div className="tm-search-kinds">
          {(["all", ...SEARCH_KINDS.filter((candidate) => all.some((group) => group.kind === candidate))] as const).map(
            (candidate) => (
              <button
                key={candidate}
                type="button"
                className={`tm-chip${candidate === kind ? " is-current" : ""}`}
                onClick={() => setKind(candidate)}
              >
                {candidate === "all" ? t("tasks.filterAll") : t(`tasks.group.${candidate}`)}
              </button>
            ),
          )}
        </div>
      ) : null}

      {/* §10.46: the full page names what was searched for and suggests the
          next move, where the palette offers to create the thing instead. */}
      {query.trim() && total === 0 ? (
        <p className="tm-state" role="status">
          {t("tasks.searchPageEmpty", { query: query.trim() })}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.kind} className="tm-search-group">
          <h2>
            {t(`tasks.group.${group.kind}`)} <span className="tm-count">{group.results.length}</span>
          </h2>
          <ul className="tm-list">
            {group.results.map((result) => (
              <li key={`${result.kind}:${result.id}`} className="tm-task">
                <button type="button" className="tm-task-open" onClick={() => onPick(result)}>
                  <span className={`tm-task-title${result.completed ? " is-done" : ""}`}>{result.title}</span>
                  {result.subtitle ? <span className="tm-task-due">{result.subtitle}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
