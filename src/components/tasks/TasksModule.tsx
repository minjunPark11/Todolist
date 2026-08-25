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
  CheckItem,
  Folder,
  List,
  ListSection,
  SavedFilter,
  SidebarFolder,
  Space,
  Tag,
  Task,
  TaskContentMode,
  TaskDailyPlan,
  TaskTag,
} from "../../types";
import type { TaskScopeRef, TaskViewKind } from "../../domain/tasks/scopeRegistry";
import { scopeRegistry } from "../../domain/tasks/scopeRegistry";
import { queryScopeCount, queryScopeTasks, type ScopeContext } from "../../domain/tasks/scopeQuery";
import { parseSearchUrl, searchUrlFor, taskUrlFor, urlForSearchResult, parseTaskUrl } from "../../app/taskScopeUrl";
import { taskLinkFor } from "../../app/taskLink";
import type { TaskActivityEntry } from "../../domain/tasks/activity";
import { copyText } from "../../lib/copyText";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { namedRecordMissing, titleFor } from "../../domain/tasks/scopeTitle";
import { useT } from "../../i18n";
import { TasksSidebarSlot } from "../shell/TasksSidebarSlot";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { TaskDrawer } from "./TaskDrawer";
import type { CreateResolution } from "../../domain/tasks/createResolver";
import type { TaskChild } from "../../domain/tasks/children";
import { ancestorsOf, canAddChild } from "../../domain/tasks/hierarchy";
import type { TaskMutation } from "../../domain/tasks/mutations";
import {
  completeTask,
  markWontDo,
  moveTaskToSection,
  pinTask,
  reopenTask,
  restoreTask,
  setTaskDueDate,
  setTaskPriority,
  trashTask,
  unmarkWontDo,
  unpinTask,
} from "../../domain/tasks/mutations";
import { canRunTaskAction, taskActions, type TaskActionId } from "../../domain/tasks/actions";
import { ContextMenu, type ContextMenuState } from "../common/ContextMenu";
import { useFloatingLayerOwner } from "../floating";
import { useTaskDetailWidth } from "../../hooks/useTaskDetailWidth";
import { priorityChange } from "../../domain/tasks/priority";
import type { ReminderSpec, Schedule, ScheduleIssue } from "../../domain/schedule";
import { addDays } from "../../utils/date";
import { isInboxList } from "../../domain/spaces/hierarchy";
import { listIdFor } from "../../domain/spaces/membership";
import { isCompleted } from "../../domain/tasks/taskState";
import { folderIdFor } from "../../domain/tasks/sidebarFolders";
import { INBOX_COLUMNS, inboxBucketOf, listBoardColumns, moveToInboxBucket, type InboxBucket } from "../../domain/tasks/board";
import { placeTask, sortByManualOrder } from "../../domain/tasks/sortKey";
import { sectionIdFor } from "../../domain/tasks/sections";
import { TaskBoard } from "./TaskBoard";
import { TaskRowContent } from "./TaskRowContent";
import { TaskGanttView } from "../TaskGanttView";
import { projectItems } from "../../domain/view/item";
import { specForSpaceView } from "../../domain/view/spaceViews";
import { groupRank, type GroupContext, type ViewSpec } from "../../domain/view/viewSpec";
import { createListPayload, type CreateListDraft } from "../../domain/tasks/createListDraft";
import { resolveListView } from "../../domain/tasks/listView";
import { useResponsiveMode, useViewportHeightVar } from "./useResponsiveMode";
import { detailIsFullScreen, sidebarPresentationFor, taskDetailPresentationFor } from "../../domain/tasks/responsive";
import type { SearchCollections, SearchResult } from "../../domain/tasks/search";
import { flattenGroups, PAGE_LIMITS, searchAll } from "../../domain/tasks/search";
import { platform } from "../../platform";
import { SEARCH_KINDS, type SearchKind } from "../../domain/tasks/search";

interface TasksModuleProps {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  sidebarFolders: SidebarFolder[];
  savedFilters: SavedFilter[];
  listSections: ListSection[];
  /** Searched by §10.16, and navigated to through the Spaces routes. */
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
  /**
   * §10.41/§10.42's other half, handed in rather than held here (D-25).
   *
   * The Command Menu captures a title and Quick Add commits it. The menu is
   * above this Module now, so the title arrives as a prop and the Module says
   * when it has been spent — otherwise the same text would be re-seeded into
   * Quick Add every time the user came back to a Scope.
   */
  draftTitle: string;
  onDraftConsumed: () => void;
  /** Everything the Drawer can change about the Task it has open (§16.28). */
  drawer: {
    childrenOf: (taskId: string) => TaskChild[];
    onUpdate: (taskId: string, patch: Partial<Task>) => void;
    onMoveToList: (taskId: string, listId: string) => void;
    /**
     * The whole schedule in one write (§5), returning whatever the domain
     * refused. The editor keeps the draft open on a refusal, so an empty
     * array is the only thing that means "written".
     */
    onCommitSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
    /** §13.39, by name — §13.41's inline create has no id yet. */
    onToggleTag: (taskId: string, name: string) => void;
    onAddSubtask: (taskId: string, title: string) => void;
    onToggleSubtask: (id: string) => void;
    onDeleteSubtask: (id: string) => void;
    /** The Task's checklist and everything that edits it (spec §11). */
    checkItemsFor: (taskId: string) => CheckItem[];
    onSetContentMode: (taskId: string, mode: TaskContentMode) => void;
    onAddCheckItem: (taskId: string, text: string) => void;
    onAddCheckItems: (taskId: string, texts: string[]) => void;
    onRenameCheckItem: (itemId: string, text: string) => void;
    onToggleCheckItem: (itemId: string) => void;
    onDeleteCheckItem: (itemId: string) => void;
    /**
     * §25.7's history, already ordered — the same shape as `checkItemsFor`
     * above and for the same reason: the ordering is the domain's, and this
     * needs collections the Module does not hold (the focus sessions).
     */
    activityFor: (taskId: string) => TaskActivityEntry[];
    /** This Task's reminders (§6.3), for the Schedule popover. */
    remindersFor: (taskId: string) => ReminderSpec[];
  };
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
    sidebarFolderId?: string;
  }) => Promise<string> | string;
  /** Makes a sidebar group and answers its id (Add List design §6.32). */
  onCreateSidebarFolder: (name: string) => Promise<string> | string;
  /** §13.23/§6.56: restoring a List, and the one hard delete in the app. */
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
  /**
   * §25.6's entry point, and only that.
   *
   * The Detail hands over a Task id and the focus engine owns everything
   * after it — the timer, pause and resume, the statistics. That division is
   * §25.6's prohibition written as a prop: a Detail that took a mode or a
   * duration here would be the panel starting to implement the engine.
   */
  onStartFocus: (taskId: string) => void;
  /**
   * §15.9's Duplicate. Makes the copy and hands back the way to take it back.
   *
   * A callback rather than the new id, because undoing a Duplicate is not a
   * patch to one Task: it removes a whole copied subtree with its checklist
   * and its Tag relations, and only the store knows which records those were
   * (§15.57). Null when there was nothing to copy.
   */
  onDuplicate: (taskId: string) => (() => void) | null;
  /**
   * True while a focus session is already running or paused.
   *
   * `startFocusSession` returns without doing anything when one is, so the
   * menu row would otherwise be a button that quietly did nothing. §15.5 asks
   * for disabled with a reason instead.
   */
  focusBusy: boolean;
}

/**
 * The actions the Detail draws as controls of its own (§15.3).
 *
 * Only completion: the schedule, Priority, the List and Tags are property rows
 * rather than registry actions, so there is nothing there for the menu to
 * repeat.
 */
const DETAIL_PROMOTED_ACTIONS: TaskActionId[] = ["complete", "reopen"];

export function TasksModule(props: TasksModuleProps) {
  const { t } = useT();
  const {
    tasks,
    lists,
    folders,
    sidebarFolders,
    savedFilters,
    listSections,
    dailyPlans,
    tags,
    taskTags,
    today,
    url,
    onNavigate,
  } = props;

  /**
   * What just happened, and the way back from it if there is one.
   *
   * One at a time, and it is the last thing that happened (§9.40 keeps the
   * stack out of the MVP). It held only undos before; §15.21 needs the same
   * strip to say "Link copied", which has nothing to undo, and §15.22 needs it
   * to show a URL the reader can select when the clipboard refused. So `run`
   * became optional and `text` arrived beside it — §15.69's point that a menu
   * hands its result to one feedback layer rather than growing its own.
   */
  const [notice, setNotice] = useState<{
    labelKey: string;
    run?: () => void;
    /** Shown verbatim, for a value that is not a translatable phrase. */
    text?: string;
  } | null>(null);
  /** The row being dragged, so the ones under it know a drop is coming. */
  const [dragTaskId, setDragTaskId] = useState("");
  /** Whose history is open (§25.7), or "" for none. */
  const [activityTaskId, setActivityTaskId] = useState("");
  /** The open context menu, or none. One at a time, like the notice above it. */
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  // §15.3. Presentation only: nothing below reads this to decide what a Scope
  // contains, which is what keeps §15.9 true — the URL means the same thing at
  // every width.
  const mode = useResponsiveMode();
  useViewportHeightVar();
  const sidebar = sidebarPresentationFor(mode);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ctx: ScopeContext = useMemo(
    () => ({ tasks, lists, dailyPlans, taskTags, today, savedFilters }),
    [tasks, lists, dailyPlans, taskTags, today, savedFilters],
  );

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

  /**
   * §13.9's resolve, and the only place it happens.
   *
   * Opening a List means opening it the way its owner set it up. The URL layer
   * stays List-agnostic on purpose — `parseTaskUrl` takes a string and nothing
   * else, and teaching it about records would make one address mean different
   * screens for different accounts. So the stored key is resolved HERE, on the
   * way in, and the address that results says which View it is. `/list/l1`
   * still means the registry's default; `?view=board` is written when the List
   * asked for something else.
   */
  function go(next: TaskScopeRef) {
    const policy = scopeRegistry[next.kind];
    const owner = next.kind === "list" ? lists.find((list) => list.id === next.id) : undefined;
    onNavigate(taskUrlFor({ scope: next, view: resolveListView(owner?.defaultViewKey, policy), taskId: "" }));
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

  // §19.21, §19.74: a popover opened from a Task's Detail closes when the
  // Detail moves on. Told from here because this is where the answer is — the
  // layer system is deliberately given the id and nothing else. `openedTask`
  // rather than `state.taskId` so an id that names nothing counts as no owner,
  // which is the same reading the Drawer takes one line above.
  useFloatingLayerOwner(openedTask?.id ?? null);

  // §1.12–§1.14. Owned by the Module because the empty column needs the same
  // number the pane uses; the Drawer gets the handle's behaviour passed in.
  const detailWidth = useTaskDetailWidth();

  /**
   * Apply a mutation, and offer the undo that goes with it.
   *
   * It used to close the Drawer when the Task left the Scope, on the reading
   * that a Detail hanging over a row no longer in the list is a broken state.
   * §1.28 decides the opposite, and says so four more times — §3's acceptance
   * list spells out "완료로 query에서 사라져도 Detail은 유지된다". The Detail is
   * not a tooltip for a row; it is the Task, and the Task is still there.
   *
   * The case that settles it is the ordinary one: ticking Done on the Task you
   * are reading, in Today. The old behaviour took the panel away at the exact
   * moment you might want to add a note about what you just finished, and the
   * way back was to find a row that had by then been filtered out.
   *
   * §1.27 is untouched and still closes — a DELETED Task has no Detail to
   * show, which is a different thing from one that no longer matches a filter.
   *
   * The undo comes from the mutation rather than from inverting the patch, so
   * pressing it restores what was there and not an approximation (§9.35).
   */
  function mutate(target: Task, mutation: TaskMutation) {
    props.onMutate(target.id, mutation.patch);
    setNotice({
      labelKey: mutation.labelKey,
      run: () => props.onMutate(target.id, mutation.undo),
    });
  }

  /**
   * Completion from the row, which is where it belongs (audit L-13).
   *
   * The reference finishes a Task from the list; this app could only do it
   * from the Detail, so the most common thing anyone does here cost opening a
   * panel first. It is the Drawer's own mutation rather than a second one, so
   * the two cannot come to disagree about what `done` writes (§12.12) — and
   * the undo arrives with it.
   */
  function toggleDone(task: Task) {
    mutate(task, isCompleted(task) ? reopenTask(task) : completeTask(task, new Date().toISOString()));
  }

  /**
   * Run one registry action (§15.64), whoever asked for it.
   *
   * The Task is read from the store again rather than taken from the menu that
   * was clicked. §15.67 is the reason: a menu is a picture of the state it
   * opened in, and a sync landing while it hangs there can trash the Task,
   * finish it, or start a focus session somewhere else. `canRunTaskAction`
   * asks the registry the same question a second time, and an action that is
   * no longer allowed is dropped rather than applied to a Task that no longer
   * looks like the one the reader chose it for.
   *
   * Every arm that changes the Task goes through `mutate`, so every one of
   * them arrives with the Undo §15.56 and §17 expect. Start Focus does not —
   * it starts a session rather than editing the Task, and §15.55's list of
   * optimistic, reversible actions does not include it.
   */
  function runTaskAction(target: Task, id: TaskActionId) {
    const task = tasks.find((row) => row.id === target.id);
    if (!task || !canRunTaskAction(id, task, { focusBusy: props.focusBusy })) return;
    const now = new Date().toISOString();

    switch (id) {
      case "pin":
        return mutate(task, pinTask(task, now));
      case "unpin":
        return mutate(task, unpinTask(task));
      case "complete":
        return mutate(task, completeTask(task, now));
      case "reopen":
        return mutate(task, reopenTask(task));
      case "wontDo":
        return mutate(task, markWontDo(task, now));
      case "restart":
        return mutate(task, unmarkWontDo(task));
      case "trash":
        return mutate(task, trashTask(task, now));
      case "restore":
        return mutate(task, restoreTask(task));
      case "duplicate": {
        // §15.54's double-trigger cannot happen from here: the menu closes on
        // the click that chose the row, and the copy is one synchronous store
        // write rather than a request that could still be in flight.
        const discard = props.onDuplicate(task.id);
        if (discard) setNotice({ labelKey: "tasks.undoDuplicated", run: discard });
        return;
      }
      case "copyLink":
        return copyTaskLink(task.id);
      case "activities":
        // Kept per Task rather than as a boolean: the Detail is reused across
        // Tasks (§1.26), so a flag would leave the panel open on the next one
        // showing the history of the one before it.
        return setActivityTaskId(task.id);
      case "startFocus":
        return props.onStartFocus(task.id);
    }
  }

  /**
   * §15.19: the Task's deep link, on the clipboard.
   *
   * Not a mutation (§15.58) — nothing about the Task changes, so there is no
   * patch and nothing to undo, and the strip below says so by drawing no Undo
   * button. §15.21 asks for both outcomes to be reported and §15.22 refuses to
   * let a refusal end in silence, which is what the URL in the failure notice
   * is for: it can still be selected and copied by hand.
   *
   * The origin is the running app's. On the desktop build that is the shell's
   * own, so the link opens the Task here rather than anywhere a colleague
   * could follow — the honest answer while there is no configured public base
   * URL to build a shareable link from.
   */
  function copyTaskLink(taskId: string) {
    const link = taskLinkFor(window.location.origin, state, taskId);
    void copyText(link).then((copied) =>
      setNotice(
        copied
          ? { labelKey: "tasks.linkCopied" }
          : { labelKey: "tasks.linkCopyFailed", text: link },
      ),
    );
  }

  /** The registry's answer for this Task, as rows a menu can draw. */
  function actionItemsFor(task: Task, groupIds: readonly string[], promoted?: TaskActionId[]) {
    return taskActions({ task, promoted, focusBusy: props.focusBusy })
      .filter((group) => groupIds.includes(group.id))
      .map((group) => ({
        id: group.id,
        items: group.items.map((item) => ({
          id: item.id,
          label: t(item.labelKey),
          danger: item.danger,
          disabled: Boolean(item.disabledReasonKey),
          hint: item.disabledReasonKey ? t(item.disabledReasonKey) : undefined,
          run: () => runTaskAction(task, item.id),
        })),
      }));
  }

  /**
   * Dropping a row onto another puts it in that one's place.
   *
   * `placeTask` renumbers between neighbours instead of rewriting the list, so
   * a reorder writes two or three rows rather than the Scope. Only where there
   * IS a manual order to change: a smart list sorted by date has none, and a
   * drag there would mean nothing to keep.
   */
  /**
   * What a Task can be told to do without opening it.
   *
   * The same list wherever it is opened from — a right-click on a row, the
   * row's ⋯ button, a right-click on a Board card. Building it here rather
   * than in the menu component is what makes that true: the menu knows how to
   * be a menu, and this knows what a Task is.
   *
   * Everything on it goes through `mutate`, so everything on it can be undone.
   */
  function taskMenuAt(task: Task, x: number, y: number): ContextMenuState {
    const priorities: Array<Task["priority"]> = ["high", "medium", "low", "none"];
    return {
      x,
      y,
      label: t("tasks.rowMenu", { title: task.title }),
      // §15.42's order, with the registry's groups around the two choice sets
      // this menu adds. Complete, Won't Do and Trash used to be written out
      // here by hand — which is how the row menu came to offer a trashed Task
      // "Move to trash" and never to offer Pin or Start Focus at all.
      sections: [
        ...actionItemsFor(task, ["quick", "work"]),
        {
          id: "priority",
          items: priorities.map((level) => ({
            id: `priority-${level}`,
            label: t(`priority.${level}`),
            selected: task.priority === level,
            icon: level === "none" ? null : <span className={`tm-menu-flag is-${level}`} />,
            run: () => mutate(task, setTaskPriority(task, level)),
          })),
        },
        {
          id: "date",
          items: [
            { id: "date-today", label: t("tasks.menu.dueToday"), run: () => mutate(task, setTaskDueDate(task, today)) },
            {
              id: "date-tomorrow",
              label: t("tasks.menu.dueTomorrow"),
              run: () => mutate(task, setTaskDueDate(task, addDays(today, 1))),
            },
            // Only where there is one to clear: an item that does nothing is
            // an item the reader has to rule out every time they open this.
            ...(task.dueDate
              ? [{ id: "date-clear", label: t("tasks.menu.clearDue"), run: () => mutate(task, setTaskDueDate(task, "")) }]
              : []),
          ],
        },
        ...actionItemsFor(task, ["status", "danger"]),
      ],
    };
  }

  function reorderOnto(ordered: Task[], draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const targetIndex = ordered.findIndex((task) => task.id === targetId);
    if (targetIndex < 0) return;
    for (const row of placeTask(ordered, draggedId, targetIndex)) {
      props.onMutate(row.id, { order: row.order });
    }
  }

  // §5.28: an id that names nothing is a broken link, not an empty Scope. The
  // difference matters — "this List has no tasks" and "this List is gone" ask
  // the reader to do different things.
  const missing = namedRecordMissing(scope, lists, folders, sidebarFolders, tags, savedFilters);
  const title = missing ? t("tasks.missingTitle") : titleFor(scope, lists, folders, sidebarFolders, tags, savedFilters, t);
  const rows = missing ? [] : queryScopeTasks(scope, ctx);
  const count = missing ? 0 : queryScopeCount(scope, ctx);
  /**
   * The list in the order the user arranged it, where the Scope has one.
   *
   * The Board has read `sortKey` since it was built; the list view showed
   * whatever order the store handed back, so dragging a card in one view and
   * looking at the other showed two different lists of the same Tasks.
   */
  const listRows = policy.canManualReorder ? sortByManualOrder(rows) : rows;

  const searchCollections: SearchCollections = {
    tasks,
    lists,
    folders,
    sidebarFolders,
    tags,
    savedFilters,
  };

  /** §10.17/§10.18: a result opens at its OWN canonical place, Drawer and all. */
  function openResult(result: SearchResult) {
    onNavigate(urlForSearchResult(result, lists));
  }

  // The Board's two adapters (§16.30). The component below knows about
  // columns and cards; which command a drop is belongs here, because it is the
  // only thing the two Boards do not share.
  const boardListId = scope.kind === "list" ? scope.id : "";
  const columns = scope.kind === "inbox" ? INBOX_COLUMNS : listBoardColumns(boardListId, listSections);

  // The timeline's three arguments, built from the rows the Scope already
  // chose.
  const ganttItems = useMemo(
    () => projectItems({ tasks: rows, lists, today, tags, taskTags }),
    [rows, lists, today, tags, taskTags],
  );
  const ganttSpec: ViewSpec = useMemo(
    // The scope is passed empty on purpose: `queryScopeTasks` has already
    // answered "which Tasks", and naming it again here would be the same
    // narrowing done twice — with two chances to disagree (§12.19).
    () => specForSpaceView("gantt", {}, title),
    [title],
  );
  const ganttContext: GroupContext = useMemo(
    () => ({
      today,
      taskById: new Map(rows.map((task) => [task.id, task])),
      // D10: the order the user arranged Lists in outranks the alphabet, and
      // the sidebar and this timeline have to agree about it.
      groupRank: groupRank(ganttSpec.groupBy, { lists, folders }),
    }),
    [today, rows, ganttSpec.groupBy, lists, folders],
  );
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
      /**
       * §1.14's width, set HERE rather than on the Drawer.
       *
       * Two elements need it and only one of them is the Drawer: the reserved
       * empty column (audit D1-1) has to be exactly as wide as the real pane,
       * or opening a Task makes the list jump — which is the bug that column
       * exists to prevent. Setting it on the shell is what lets both inherit
       * one number.
       */
      style={{ ["--tm-detail-w" as string]: `${detailWidth.width}px` }}
    >
      {/* §15.15/§15.16: an overlay Sidebar is a layer the user opened, so it
          has something to dismiss it with. A persistent one has nothing to
          close and renders no scrim. */}
      {sidebar === "overlay" && sidebarOpen ? (
        <div className="tm-scrim" onMouseDown={() => setSidebarOpen(false)} aria-hidden />
      ) : null}

      {/* D-21: the same component the legacy shell renders when the mode is
          `tasks`, so crossing between the two shells no longer swaps the
          sidebar. Its dialogs and their state travel with it. */}
      {/* §3.50: over the content it is a drawer, beside it a landmark. */}
      <TasksSidebarSlot
        drawer={sidebar === "overlay" ? { open: sidebarOpen, onClose: () => setSidebarOpen(false) } : null}
        tasks={tasks}
        lists={lists}
        folders={folders}
        sidebarFolders={sidebarFolders}
        tags={tags}
        savedFilters={savedFilters}
        dailyPlans={dailyPlans}
        taskTags={taskTags}
        today={today}
        current={searchQuery === null ? scope : null}
        onNavigateUrl={onNavigate}
        onBeforeNavigate={() => setSidebarOpen(false)}
        onCreateList={props.onCreateList}
        onCreateSidebarFolder={props.onCreateSidebarFolder}
        onRestoreList={props.lifecycle.onRestoreList}
        onPermanentlyDeleteList={props.lifecycle.onPermanentlyDeleteList}
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
          {/* A Search button stood here. The Global Rail carries the app's one
              search entry point now (§2.14), and two of them a few centimetres
              apart — opening different things — was the duplication P0-6 is
              for. Ctrl/Cmd+K still opens the palette; P0-9 puts the two behind
              one door. */}
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
                  {t(`tasks.view.${view}`)}
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
            draftTitle={props.draftTitle}
            onCreate={(title, resolution) => {
              props.onDraftConsumed();
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
        ) : rows.length === 0 && state.view === "list" ? (
          <p className="tm-state" role="status">
            {t(emptyKeyFor(scope.kind))}
          </p>
        ) : state.view === "gantt" ? (
          /* §50C.29's rule kept: every Scope that offers a timeline mounts the
             ONE renderer. It is scope-free by construction — `items` arrive
             already narrowed, here by `queryScopeTasks`, so the Scope decides
             membership exactly as it does for the list and the board and the
             timeline never asks a second question about it. */
          <TaskGanttView
            items={ganttItems}
            spec={ganttSpec}
            context={ganttContext}
            today={today}
            tasks={tasks}
            groupLabel={(groupId) => {
              const owner = lists.find((list) => list.id === groupId);
              return owner ? listDisplayName(owner, t("list.defaultName")) : t("timeline.ungrouped");
            }}
            selectedTaskId={state.taskId}
            onOpenItem={(item) => openTask(item.sourceId)}
            onUpdateTask={props.drawer.onUpdate}
          />
        ) : state.view === "board" ? (
          <TaskBoard
            columns={columns}
            tasksIn={tasksIn}
            columnOf={columnOf}
            openTaskId={state.taskId}
            onOpen={openTask}
            onDrop={dropOnBoard}
            onToggleDone={toggleDone}
            canReorder={policy.canManualReorder}
            onContextMenu={(task, x, y) => setMenu(taskMenuAt(task, x, y))}
          />
        ) : (
          <ul className="tm-list" aria-label={title}>
            {listRows.map((task) => {
              const done = isCompleted(task);
              return (
                <li
                  key={task.id}
                  className={["tm-task", task.id === state.taskId ? "is-open" : "", dragTaskId === task.id ? "is-dragging" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  draggable={policy.canManualReorder}
                  onDragStart={(event) => {
                    setDragTaskId(task.id);
                    event.dataTransfer.effectAllowed = "move";
                    // The Calendar and the Matrix both listen for this type, so
                    // a row dragged out of the list still lands on them.
                    event.dataTransfer.setData("text/task", task.id);
                  }}
                  onDragOver={(event) => {
                    if (!policy.canManualReorder || !dragTaskId) return;
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (!policy.canManualReorder || !dragTaskId) return;
                    event.preventDefault();
                    reorderOnto(listRows, dragTaskId, task.id);
                    setDragTaskId("");
                  }}
                  onDragEnd={() => setDragTaskId("")}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu(taskMenuAt(task, event.clientX, event.clientY));
                  }}
                >
                  {/* The handle is the affordance, not the mechanism — the whole
                      row is draggable, and this is what says so (audit L-17). */}
                  {policy.canManualReorder ? <span className="tm-task-handle" aria-hidden="true" /> : null}
                  <TaskRowContent task={task} onOpen={openTask} onToggleDone={toggleDone} />
                  {/* The other half of L-17, and the reason the menu is a
                      component: a right-click is not discoverable and does not
                      exist on a touch screen, so the same menu needs a button
                      to open it. Anchored to the button rather than the
                      pointer, which is where the reader is looking. */}
                  <button
                    type="button"
                    className="tm-task-menu"
                    aria-haspopup="menu"
                    aria-label={t("tasks.rowMenu", { title: task.title })}
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      setMenu(taskMenuAt(task, box.left, box.bottom + 4));
                    }}
                  >
                    ⋯
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </>
        )}
      </main>

      {/* The Detail column is RESERVED, not conditional — audit D1-1(a).
       *
       * It was rendered only while a Task was open, and because it is a grid
       * item in an `auto` track, opening one took 400px out of the list: the
       * column measured 1136 with nothing selected and 672 with something,
       * so every row re-laid-out on every click. The width change had no
       * transition either, so it landed in a single frame.
       *
       * Reserving the track fixes both at once, and it is the shape the
       * reference product has: the column is always there and draws an empty
       * state when nothing is selected.
       *
       * Only for `inline-drawer`. In the other three presentations the Detail
       * is an overlay, a sheet or the whole screen (§15.17) — it takes no
       * track, so there is nothing to reserve and an empty panel would be a
       * surface floating over the page. */}
      {!openedTask && taskDetailPresentationFor(mode) === "inline-drawer" ? (
        <aside
          className="tm-drawer is-inline-drawer is-empty"
          aria-label={t("tasks.drawerLabel")}
        >
          <p className="tm-drawer-empty">{t("tasks.drawerEmpty")}</p>
        </aside>
      ) : null}

      {openedTask ? (
        <TaskDrawer
          presentation={taskDetailPresentationFor(mode)}
          /* No `key` on the Drawer — §1.26 forbids exactly what one produces.
             Keying the pane by Task id remounts the whole panel on every
             switch, which is "Pane close/reopen" from that section's list of
             things to avoid: the entrance animation replays, the scroll
             position resets, and a fast walk down a list flickers.

             Nothing is lost by dropping it. The text fields already take
             `resetKey={task.id}` (§9), the schedule editor is keyed inside
             `SchedulePicker`, and the one remaining piece of per-Task local
             state — the checklist's draft row — is keyed on its own component.
             Remount what holds the state, not the surface around it. */
          task={openedTask}
          lists={lists}
          folders={sidebarFolders}
          tags={tags}
          taskTags={taskTags}
          onToggleTag={(name) => props.drawer.onToggleTag(openedTask.id, name)}
          children={props.drawer.childrenOf(openedTask.id)}
          onClose={closeTask}
          onUpdate={(patch) => props.drawer.onUpdate(openedTask.id, patch)}
          onMoveToList={(listId) => props.drawer.onMoveToList(openedTask.id, listId)}
          // §8.8's no-op is decided in the domain, so the Drawer never has to
          // compare the values itself. Through `mutate` like every other
          // change, which is what gives it the Undo §8.36 asks for and the
          // §12.21 check for a Task that has just left the Scope.
          today={today}
          // §5.51: the editor keeps the draft open when the domain refuses it,
          // so the issues have to come back rather than being swallowed here.
          onCommitSchedule={props.drawer.onCommitSchedule}
          onSetPriority={(level) => {
            const change = priorityChange(openedTask, level);
            if (change) mutate(openedTask, change);
          }}
          onAddSubtask={(title) => props.drawer.onAddSubtask(openedTask.id, title)}
          onToggleSubtask={props.drawer.onToggleSubtask}
          onDeleteSubtask={props.drawer.onDeleteSubtask}
          checkItems={props.drawer.checkItemsFor(openedTask.id)}
          reminders={props.drawer.remindersFor(openedTask.id)}
          onSetContentMode={(mode) => props.drawer.onSetContentMode(openedTask.id, mode)}
          onAddCheckItem={(text) => props.drawer.onAddCheckItem(openedTask.id, text)}
          onAddCheckItems={(texts) => props.drawer.onAddCheckItems(openedTask.id, texts)}
          onRenameCheckItem={props.drawer.onRenameCheckItem}
          onToggleCheckItem={props.drawer.onToggleCheckItem}
          onDeleteCheckItem={props.drawer.onDeleteCheckItem}
          // The breadcrumb is computed against every Task, not the Scope's
          // visible rows: an ancestor filtered out of the current view is
          // still where this Task came from.
          ancestors={ancestorsOf(openedTask.id, tasks)}
          onOpenTask={openTask}
          canAddSubtask={canAddChild(openedTask.id, tasks)}
          resize={detailWidth}
          onComplete={() =>
            mutate(
              openedTask,
              isCompleted(openedTask)
                ? reopenTask(openedTask)
                : completeTask(openedTask, new Date().toISOString()),
            )
          }
          /* §15.3: Complete is drawn in the header as a checkbox, so it is
             promoted out of the menu rather than repeated inside it. Reopen
             goes with it — it is the same checkbox, unticked. */
          actions={taskActions({
            task: openedTask,
            promoted: DETAIL_PROMOTED_ACTIONS,
            focusBusy: props.focusBusy,
          })}
          onRunAction={(id) => runTaskAction(openedTask, id)}
          activity={
            activityTaskId === openedTask.id ? props.drawer.activityFor(openedTask.id) : null
          }
          onCloseActivity={() => setActivityTaskId("")}
        />
      ) : null}

      {menu ? <ContextMenu state={menu} onClose={() => setMenu(null)} /> : null}

      {/* §9.36: the strip is where the way back lives, and it says what it
          would undo rather than just offering the word.

          The Undo button is drawn only when there IS one. Copy Link changes
          no Task (§15.58), so offering to undo it would be offering to undo
          nothing — and a button that does nothing reads as one that failed. */}
      {notice ? (
        <div className="tm-undo" role="status">
          <span>{t(notice.labelKey)}</span>
          {/* §15.22's fallback: when the clipboard refused, the URL is put
              where it can be selected and copied by hand, rather than the
              action ending with an apology and nothing to act on. */}
          {notice.text ? <input className="tm-undo-value" readOnly value={notice.text} /> : null}
          {notice.run ? (
            <button
              type="button"
              onClick={() => {
                notice.run?.();
                setNotice(null);
              }}
            >
              {t("app.undo")}
            </button>
          ) : null}
          <button type="button" onClick={() => setNotice(null)} aria-label={t("common.close")}>
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
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
        placeholder={t("tasks.searchPlaceholder")}
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
          next move, where the menu offers to create the thing instead. */}
      {query.trim() && total === 0 ? (
        <p className="tm-state" role="status">
          {t("tasks.searchPageEmpty", { query: query.trim() })}
        </p>
      ) : null}

      {/* D-25 split searching from navigating, and left the second half with
          no way to be discovered — Ctrl/Cmd+K is advertised nowhere. This is
          where the person hunting for something already is, so it is where
          the other tool gets mentioned. Only before they have typed: once a
          query is running, a tip about a different surface is an interruption. */}
      {!query.trim() ? <p className="tm-state">{t("tasks.searchMenuHint")}</p> : null}

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
