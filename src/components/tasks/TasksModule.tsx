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
import type {
  Folder,
  List,
  ListSection,
  SavedFilter,
  SidebarFolder,
  Tag,
  Task,
  TaskDailyPlan,
  TaskTag,
  TaskTemplate,
} from "../../types";
import type { TaskScopeRef, TaskViewKind } from "../../domain/tasks/scopeRegistry";
import { scopeRegistry } from "../../domain/tasks/scopeRegistry";
import { queryScopeCount, queryScopeTasks, type ScopeContext } from "../../domain/tasks/scopeQuery";
import {
  parseSearchUrl,
  searchUrlFor,
  taskUrlFor,
  urlForSearchResult,
  parseTaskUrl,
} from "../../app/taskScopeUrl";
import { taskLinkFor } from "../../app/taskLink";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { namedRecordMissing, titleFor } from "../../domain/tasks/scopeTitle";
import { useT } from "../../i18n";
import { TasksSidebarSlot } from "../shell/TasksSidebarSlot";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { TaskDetailPane } from "./TaskDetailPane";
import { TaskUndoStrip } from "./TaskUndoStrip";
import { TaskDeleteForeverGate } from "./TaskDeleteForeverGate";
import { TrashEmptyGate } from "./TrashEmptyGate";
import { MoreMenu, type MoreMenuItem } from "../kit";
import {
  scopeHasViewOptions,
  scopeOptionKey,
  viewOptionsFor,
  type ScopeViewOptions,
} from "../../domain/view/scopeViewOptions";
import { ScopeViewOptionsDialog } from "./ScopeViewOptionsDialog";
import { emptyTrash as emptyTrashSummary, trashedTaskIds, type TrashSummary } from "../../domain/tasks/trash";
import type { TaskDetailBundle } from "./taskDetailBundle";
import { useTaskCommands } from "../../hooks/useTaskCommands";
import type { CreateResolution } from "../../domain/tasks/createResolver";
import type { TaskMutation } from "../../domain/tasks/mutations";
import { moveTaskToSection, setTaskDueDate, setTaskPriority } from "../../domain/tasks/mutations";
import { taskActions, type TaskActionId } from "../../domain/tasks/actions";
import { ContextMenu, type ContextMenuState } from "../common/ContextMenu";
import { useFloatingLayerOwner } from "../floating";
import { useTaskDetailWidth } from "../../hooks/useTaskDetailWidth";
import { addDays } from "../../utils/date";
import { isInboxList } from "../../domain/spaces/hierarchy";
import { listIdFor } from "../../domain/spaces/membership";
import { isCompleted, isTrashed } from "../../domain/tasks/taskState";
import { folderIdFor } from "../../domain/tasks/sidebarFolders";
import {
  createInInboxBucket,
  createInListSection,
  inboxBucketOf,
  listBoardColumns,
  moveToInboxBucket,
  type InboxBucket,
  type InboxColumnNames,
} from "../../domain/tasks/board";
import {
  NO_LIST_COLUMN,
  boardAxisFor,
  createInListColumn,
  listAxisColumnOf,
  listAxisColumns,
  moveToListColumn,
} from "../../domain/tasks/boardAxis";
import { canCommit, resolveCreateContext } from "../../domain/tasks/createResolver";
import { placeTask, sortByManualOrder } from "../../domain/tasks/sortKey";
import { sectionIdFor } from "../../domain/tasks/sections";
import { TaskBoard } from "./TaskBoard";
import { TrashLists } from "./TrashLists";
import { binnedLists } from "../../domain/spaces/lifecycle";
import { ListDeleteForeverGate } from "./ListDeleteForeverGate";
import { TaskRowContent } from "./TaskRowContent";
import { TaskGanttView } from "../TaskGanttView";
import { projectItems } from "../../domain/view/item";
import { specForSpaceView } from "../../domain/view/spaceViews";
import { groupRank, type GroupContext, type ViewSpec } from "../../domain/view/viewSpec";
import { DEFAULT_GROUP_VIEW, groupTasks } from "../../domain/view/viewGroups";
import { EMPTY_INBOX_RULE, type InboxColumnRules } from "../../domain/view/inboxColumnRules";
import {
  addInboxColumn,
  columnAsksForDate,
  columnOfTask,
  dropOutcomeForColumnId,
  moveInboxColumn,
  removeInboxColumn,
  renameInboxColumn,
  resolveInboxColumns,
  setInboxColumnRule,
  type InboxColumn,
} from "../../domain/view/inboxColumns";
import { InboxColumnDialog, type InboxColumnDraft } from "./InboxColumnDialog";
import { resolveListView } from "../../domain/tasks/listView";
import { useResponsiveMode, useViewportHeightVar } from "./useResponsiveMode";
import {
  detailIsFullScreen,
  sidebarPresentationFor,
  taskDetailPresentationFor,
} from "../../domain/tasks/responsive";
import type { SearchCollections, SearchResult } from "../../domain/tasks/search";
import { flattenGroups, PAGE_LIMITS, searchAll } from "../../domain/tasks/search";
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
   * What the user calls each Inbox board column, and how a new name is saved.
   *
   * Handed in rather than read here: these live in the account's settings and
   * this Module does not own settings — the same arrangement the Matrix's box
   * names have. Absent means the columns keep their built-in labels and the
   * header is not editable.
   */
  inboxColumnNames?: InboxColumnNames;
  onRenameInboxColumn?: (bucket: InboxBucket, name: string) => void;
  /**
   * What each Inbox column CONTAINS (design §6, phase 3).
   *
   * Absent reads as the three date buckets this app has always drawn, so an
   * account that has never edited a column behaves exactly as it did — which
   * is the property `inboxColumnRules.test.ts` pins shape by shape.
   */
  inboxColumnRules?: Partial<InboxColumnRules>;
  /**
   * The Inbox's columns as the user has arranged them (design §6, phase 5).
   *
   * Absent means the account predates the controls, and `resolveInboxColumns`
   * assembles the three built-ins out of the two phase-3 keys instead —
   * migration on read, because there is no schema and the load path is the
   * only migration this store has.
   */
  inboxColumns?: unknown;
  onSetInboxColumns?: (columns: InboxColumn[]) => void;
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
  /**
   * Everything the Detail can change about the Task it has open (§16.28).
   *
   * Spelled out in `taskDetailBundle.ts` rather than here, because this
   * Module is no longer the only thing that assembles one — `App.tsx` builds
   * the same bundle for the pages the legacy panel still serves
   * (TASK_DETAIL_PANEL_MERGE_DESIGN.md §5).
   */
  drawer: TaskDetailBundle;
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
   * §3.1's way out of the Trash. The store guards it on `deletedAt`, so this
   * module hands over an id and does not have to re-check where the Task is.
   */
  onDeleteForever: (taskId: string) => void;
  /** §3.3's whole Trash, gone. Answers with how many actually went. */
  /** Returns what it removed, which is what the confirmation said (§16.5). */
  onEmptyTrash: () => TrashSummary;
  /**
   * What each Scope shows, and how to change one (§3.3).
   *
   * The whole map rather than this Scope's slice: the module knows which Scope
   * it is drawing and `viewOptionsFor` is the one place that reads a key, so
   * handing a slice would mean the caller worked the key out too.
   */
  scopeViewOptions?: Record<string, ScopeViewOptions>;
  onSetScopeViewOptions: (next: Record<string, ScopeViewOptions>) => void;
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
   * §25.8. Saves the Task's shape and answers with the template's id.
   *
   * An id rather than a callback, unlike Duplicate above, because taking this
   * back is one record by one id — there is no subtree to work out.
   */
  onSaveAsTemplate: (taskId: string) => string;
  onDeleteTemplate: (templateId: string) => void;
  /** §25.8's saved shapes, offered by Quick Add. */
  templates: TaskTemplate[];
  onUseTemplate: (templateId: string, resolution: CreateResolution) => void;
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
 * The three views, drawn (§13.4).
 *
 * Line art on the 24-viewBox grid at stroke 1.9, like the rest of the app's
 * icons — an emoji would be the platform's drawing in the font's colour, and
 * none of the three shapes below exists as one anyway.
 *
 * Each says what its view LOOKS like rather than what it is called: rows for
 * the list, columns for the Board, staggered bars for the timeline. That is
 * what makes three unlabelled squares readable, and it is why the button
 * still carries the name for anyone who cannot see them.
 */
function ViewIcon({ view }: { view: TaskViewKind }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      {view === "list" ? (
        <>
          <path d="M9 6.5h11M9 12h11M9 17.5h11" {...stroke} />
          <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" {...stroke} strokeWidth={2.6} />
        </>
      ) : null}
      {view === "board" ? (
        <>
          <path d="M5 4.5h4v15H5zM15 4.5h4v10h-4z" {...stroke} strokeLinejoin="round" />
        </>
      ) : null}
      {view === "gantt" ? (
        <>
          <path d="M4.5 6.5h9M8 12h11M4.5 17.5h7" {...stroke} />
        </>
      ) : null}
    </svg>
  );
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
    dailyPlans,
    tags,
    taskTags,
    today,
    url,
    onNavigate,
  } = props;

  /** The row being dragged, so the ones under it know a drop is coming. */
  const [dragTaskId, setDragTaskId] = useState("");
  /** The open context menu, or none. One at a time, like the notice above it. */
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  /**
   * The column dialog, and which question it is asking.
   *
   * Adding and editing are the same dialog because a column added without
   * conditions is a column nothing can ever be in — membership here is derived
   * (design §4.1), so creation and the question have to be one step. Nothing is
   * written until it is confirmed: the alternative is a column that exists for
   * as long as the dialog is open and swallows the board if it is cancelled.
   */
  const [dialog, setDialog] = useState<
    { mode: "edit"; columnId: string } | { mode: "add"; beside: { id: string; side: "left" | "right" } | null } | null
  >(null);
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

  /**
   * What the Scope's ⋯ offers (§3.2).
   *
   * §16.26 Gate 3 moves in with the selector: only the views the Scope allows
   * are offered, and where there is nothing to choose the section is absent
   * rather than drawn with one row. Six of the eight Scopes have one view
   * (§2.1), so on those the menu is empty and does not appear at all — which
   * is the same rule the header applied, one level up.
   *
   * Rows with a ✓ rather than the reference's row of icons: this app's menus
   * are rows, the Today axis picker chose the same shape, and a new menu
   * primitive is not what this phase is for (§5 Q6).
   */
  /** This Scope's five, or the defaults where nobody has set any (§3.3). */
  const viewOptions = viewOptionsFor(props.scopeViewOptions, scope);

  function patchViewOptions(patch: Partial<ScopeViewOptions>) {
    const key = scopeOptionKey(scope);
    if (!key) return;
    props.onSetScopeViewOptions({
      ...(props.scopeViewOptions ?? {}),
      [key]: { ...viewOptions, ...patch },
    });
  }

  // §5.28: an id that names nothing is a broken link, not an empty Scope. The
  // difference matters — "this List has no tasks" and "this List is gone" ask
  // the reader to do different things.
  const missing = namedRecordMissing(scope, lists, folders, sidebarFolders, tags, savedFilters);
  /*
   * `prefix()` stood here — a `✓ ` glued to the front of a row's LABEL.
   *
   * Two things were wrong with it and they are the same thing twice
   * (SCOPE_VIEW_OPTIONS_DESIGN.md §14.2). A menu row that means "on" was
   * saying so with a decorative character inside its text, while the element
   * stayed a plain `menuitem` with no `aria-checked` — so the state was
   * announced to nobody. And a two-state setting drawn as a state needs the
   * reader to work out what pressing it does.
   *
   * Both rows say what pressing them WILL DO now, and flip when it is done.
   * That makes them actions, which is what `menuitem` already claimed.
   */
  /**
   * What a List can be told, or nothing for every other Scope.
   *
   * `Archive list` stood above `Delete` until §16.6. It was a SECOND soft
   * state whose only door back was the same hidden dialog `Delete`'s was — so
   * it was the weaker copy of its neighbour, and the reader had to choose
   * between two words for one outcome. Delete is the one that survives,
   * because it is the one the Trash now shows and takes back.
   */
  function listActionsFor(ref: TaskScopeRef): MoreMenuItem[] | null {
    if (ref.kind !== "list" || missing) return null;
    if (isInboxList(lists.find((list) => list.id === ref.id) ?? { kind: "regular" })) return null;
    return [
      { separator: true },
      { label: t("tasks.deleteList"), danger: true, onClick: () => props.lifecycle.onTrashList(ref.id) },
    ];
  }
  /**
   * Whose child this row is, or nothing where it is not one.
   *
   * Empty when the parent is gone as well: `removeTasksForever` promotes
   * children to top level, so a row pointing at a record that no longer
   * exists means the store is mid-something, not that the reader needs a
   * dangling name.
   */
  function parentTitleOf(task: Task): string {
    if (!task.parentTaskId) return "";
    return tasks.find((row) => row.id === task.parentTaskId)?.title ?? "";
  }

  const scopeMenuItems: MoreMenuItem[] = [
    // The views, first and as icons (§3.2). Absent where there is nothing to
    // choose — §16.26 Gate 3, one level up from where it used to live: a
    // single-option selector is not a choice, and the three finished-work
    // Scopes have one view (and no menu to put it in either).
    ...(policy.allowedViews.length > 1
      ? [
          {
            heading: t("tasks.viewLabel"),
            choices: policy.allowedViews.map((view) => ({
              id: view,
              label: t(`tasks.view.${view}`),
              icon: <ViewIcon view={view} />,
              selected: view === state.view,
              onClick: () => setView(view),
            })),
          } as MoreMenuItem,
          { separator: true } as MoreMenuItem,
        ]
      : []),
    // Only on the Board: the list view already leaves finished work out of
    // its query (`isActive`), so there is nothing on that screen for this to
    // hide. §15.5 again — the same clause that took `Kanban Size` off the
    // Scopes with no columns.
    ...(state.view === "board"
      ? [
          {
            label: t(viewOptions.hideCompleted ? "tasks.showCompleted" : "tasks.hideCompleted"),
            onClick: () => patchViewOptions({ hideCompleted: !viewOptions.hideCompleted }),
          } as MoreMenuItem,
        ]
      : []),
    {
      label: t(viewOptions.showDetails ? "tasks.hideDetails" : "tasks.showDetails"),
      onClick: () => patchViewOptions({ showDetails: !viewOptions.showDetails }),
    },
    { separator: true },
    /**
     * The dialog. Q4's other half is gone with the Scope it was for.
     *
     * Two of the dialog's three rows act on COLUMNS, so a Scope with no Board
     * would have opened a scrim and a modal to show a single line — and Q4
     * brought that line into the menu as two marked rows instead. There is no
     * such Scope left: every Scope that has this menu has a Board now
     * (TASK_VIEWS_EVERYWHERE_DESIGN.md §2), so the two rows served nobody and
     * `Task Time` has one door again rather than two.
     */
    { label: t("tasks.viewOptions"), onClick: () => setViewOptionsOpen(true) },
    /**
     * §13.21/§13.22, at the bottom (Q7).
     *
     * They stood in the header as two words and 152px, in front of the four
     * icons. The reference app's third group is this — what to do with the
     * LIST rather than with what it shows — and a menu is where an action
     * taken once in a list's life belongs.
     *
     * The Inbox is offered neither: it is the floor a Task falls back to, so
     * putting it away would leave the account with nowhere to capture (§6.5).
     * Both stay soft — the Tasks are not touched and Manage is where they
     * come back — which is why neither asks twice.
     */
    ...(listActionsFor(scope) ?? []),
  ];

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
   * Everything a Task can be told to do, and the strip that says what just
   * happened (`hooks/useTaskCommands`).
   *
   * It was 130 lines of this file: the notice, `mutate`, the registry switch
   * and the clipboard. It left because the Detail is no longer only opened
   * here — and a second copy of that switch is how two surfaces come to
   * disagree about what "Won't Do" writes
   * (TASK_DETAIL_PANEL_MERGE_DESIGN.md §5).
   *
   * The link is built HERE and handed down, because the address is this
   * surface's: a Task in the Tasks module lives at `?task=` under a Scope,
   * and a page that keeps the open Task in memory has a different one to
   * offer (§15.19).
   */
  /**
   * Whether the "empty the trash" question is on screen (§3.3).
   *
   * The count comes from the domain rather than from the Scope's row count,
   * and that is not pedantry: the Trash list hides child Tasks
   * (`scopeQuery` drops anything with a `parentTaskId`), so a reader could be
   * shown "3" and lose five. §7.1 put the counting inside `emptyTrash` for
   * exactly this — the screen must not count differently from what is about to
   * be deleted.
   */
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  /** Which List the second ask is open for, or "" (§16.4). */
  const [deletingList, setDeletingList] = useState("");
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);

  /**
   * What the Trash holds, as the two numbers the header reads (§16.5).
   *
   * The count comes from the domain rather than from the Scope's row count,
   * and that is not pedantry: the Trash list hides child Tasks, so a reader
   * could be shown "3" and lose five. The List half is here for the same
   * reason — the header's button has to appear when the only thing in the
   * Trash is a List, and the question has to say what that costs.
   */
  const trashedCount = trashedTaskIds(tasks).length;
  const binnedListIds = binnedLists(lists).map((list) => list.id);
  const trashSummary = useMemo(
    () => emptyTrashSummary({ tasks, subtasks: [], checkItems: [], taskTags: [], reminders: [] }, binnedListIds).summary,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, binnedListIds.join(",")],
  );

  const commands = useTaskCommands({
    tasks,
    focusBusy: props.focusBusy,
    onMutate: props.onMutate,
    onDuplicate: props.onDuplicate,
    onSaveAsTemplate: props.onSaveAsTemplate,
    onDeleteTemplate: props.onDeleteTemplate,
    onStartFocus: props.onStartFocus,
    onDeleteForever: props.onDeleteForever,
    linkFor: (taskId) => taskLinkFor(window.location.origin, state, taskId),
  });
  // Pulled out by name because the rows and the two menus below call them on
  // every line; the Detail takes `commands` whole.
  const { mutate, toggleDone, runTaskAction } = commands;

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
        // Neither of the two while the Task is in the Trash
        // (TRASH_PERMANENT_DELETE_DESIGN.md §15, Q5).
        //
        // §14 froze exactly these on the Detail — priority and the schedule
        // change what a Task IS, and a deleted Task's lifecycle is settled —
        // and this menu was the back door left open. Seven rows here undid
        // the rule the panel beside them was keeping.
        //
        // The comment above is the same lesson one layer up: the registry
        // learned that a trashed Task has four actions, and these two
        // sections, written out by hand, did not. Hand-written items are how
        // the row menu once offered a trashed Task `Move to trash`.
        ...(isTrashed(task)
          ? []
          : [
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
            ]),
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
  /**
   * The Inbox's columns, from whatever the account holds.
   *
   * A list the user arranged (phase 5), or the three built-ins assembled out
   * of phase 3's two keys, or the defaults. `resolveInboxColumns` decides
   * which — the migration is a read, so an account that never opens these
   * controls is never rewritten.
   */
  const inboxColumns = useMemo(
    () =>
      resolveInboxColumns(props.inboxColumns, {
        rules: props.inboxColumnRules,
        names: props.inboxColumnNames,
      }),
    [props.inboxColumns, props.inboxColumnRules, props.inboxColumnNames],
  );

  const boardListId = scope.kind === "list" ? scope.id : "";
  /**
   * Which question this Scope's columns answer
   * (TASK_VIEWS_EVERYWHERE_DESIGN.md §2.1).
   *
   * Read once and branched on everywhere below, rather than five separate
   * `scope.kind === "inbox"` tests: the columns, the card's column, the drop
   * and the create are FOUR HALVES OF ONE ANSWER, and a screen that asks the
   * question four times is a screen where three of them can drift.
   */
  const axis = boardAxisFor(scope);
  const columns =
    axis === "inboxRules"
      ? // The Board draws columns; the Inbox's are a list the user arranged, so
        // they are translated into that shape here rather than the Board being
        // taught a second model. `requiresDate` is derived from the rule now —
        // a column asks for a day only when its own conditions cannot name one.
        inboxColumns.map((column) => ({
          id: column.id,
          ...(column.labelKey ? { labelKey: column.labelKey } : {}),
          ...(column.name ? { name: column.name } : {}),
          requiresDate: columnAsksForDate(column),
        }))
      : axis === "sections"
        ? listBoardColumns(boardListId, listSections)
        : // The Lists this Scope gathered, which is the only column model that
          // means anything where the rows come from several of them. Built from
          // `rows` — the Scope's own answer — so a column cannot appear for
          // work the screen is not showing.
          listAxisColumns(scope, rows, { lists }, { defaultList: t("list.defaultName"), inbox: t("tasks.inbox") });

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
  /**
   * The rules in force, and the context a rule is asked against.
   *
   * The Inbox's columns are RULES now (design §6, phase 3) rather than
   * `inboxBucketOf` reading two fields. Under the defaults the two answer
   * identically — that is a test, not a hope — and what changes is that a
   * column can now be edited into one that leaves a task matching nothing.
   * `null` is that answer, and the row below the board is where it is drawn.
   */
  const ruleContext = (task: Task) => ({ today, listId: listIdFor(task, lists) });

  const columnOf = (task: Task) =>
    axis === "inboxRules"
      ? (columnOfTask(task, inboxColumns, ruleContext(task)) ?? "")
      : axis === "sections"
        ? sectionIdFor(task, lists, listSections)
        : listAxisColumnOf(task, columns, lists);
  const tasksIn = (columnId: string) => sortByManualOrder(rows.filter((task) => columnOf(task) === columnId));

  /**
   * The tasks the columns between them do not take (design §3, §6 phase 4).
   *
   * Empty while nobody has edited a rule, and it has to be standing BEFORE
   * anybody can — phase 5's delete button is what makes it reachable, and a
   * task in the account and on no screen is the worst bug a to-do app has.
   *
   * Inbox only: a List Board's columns are Sections, membership is stored on
   * the task, and the unsectioned default takes everything that has none.
   */
  const unmatched = useMemo(
    () =>
      scope.kind === "inbox"
        ? rows.filter((task) => columnOfTask(task, inboxColumns, { today, listId: listIdFor(task, lists) }) === null)
        : [],
    [scope.kind, rows, inboxColumns, today, lists],
  );

  /**
   * The rows the reference app puts behind a column's ⋯, and why they can
   * exist only now.
   *
   * Rename was answerable from the start — a name moves nothing. The other
   * four all end with tasks somewhere they were not, and two of them (delete,
   * and an added column that takes work off its neighbours) can leave a task
   * matching NO column at all. Phase 4's remainder row is what makes that a
   * report rather than a disappearance, which is why this menu comes after it.
   */
  function columnMenuAt(columnId: string, x: number, y: number): ContextMenuState | null {
    const column = inboxColumns.find((candidate) => candidate.id === columnId);
    if (!column || !props.onSetInboxColumns) return null;
    const name = column.name ?? t(column.labelKey ?? "tasks.sectionDefault");
    const at = inboxColumns.findIndex((candidate) => candidate.id === columnId);
    const write = (next: InboxColumn[]) => props.onSetInboxColumns?.(next);
    return {
      x,
      y,
      label: t("tasks.columnMenu", { column: name }),
      sections: [
        {
          id: "column",
          items: [
            { id: "conditions", label: t("tasks.column.conditions"), run: () => setDialog({ mode: "edit", columnId }) },
            {
              id: "add-left",
              label: t("tasks.column.addLeft"),
              run: () => setDialog({ mode: "add", beside: { id: columnId, side: "left" } }),
            },
            {
              id: "add-right",
              label: t("tasks.column.addRight"),
              run: () => setDialog({ mode: "add", beside: { id: columnId, side: "right" } }),
            },
          ],
        },
        {
          id: "move",
          items: [
            {
              id: "move-left",
              label: t("tasks.column.moveLeft"),
              disabled: at === 0,
              run: () => write(moveInboxColumn(inboxColumns, columnId, -1)),
            },
            {
              id: "move-right",
              label: t("tasks.column.moveRight"),
              disabled: at === inboxColumns.length - 1,
              run: () => write(moveInboxColumn(inboxColumns, columnId, +1)),
            },
          ],
        },
        {
          id: "danger",
          items: [
            {
              id: "delete",
              label: t("tasks.column.delete"),
              danger: true,
              // §15.5's pairing — disabled AND told why. The last column stays:
              // a board with none is one every task falls out of, and no undo
              // makes that a state worth reaching in one click.
              disabled: inboxColumns.length <= 1,
              hint: inboxColumns.length <= 1 ? t("tasks.column.deleteLast") : undefined,
              run: () => write(removeInboxColumn(inboxColumns, columnId)),
            },
          ],
        },
      ],
    };
  }

  function columnNameOf(columnId: string): string {
    const column = inboxColumns.find((candidate) => candidate.id === columnId);
    return column?.name ?? t(column?.labelKey ?? "tasks.sectionDefault");
  }

  /** What the dialog opens holding: this column's answers, or a blank one. */
  function dialogDraft(open: NonNullable<typeof dialog>): InboxColumnDraft {
    if (open.mode === "add") return { name: "", rule: EMPTY_INBOX_RULE };
    const column = inboxColumns.find((candidate) => candidate.id === open.columnId);
    return { name: column?.name ?? "", rule: column?.rule ?? EMPTY_INBOX_RULE };
  }

  /**
   * Confirming it — and the two halves land together.
   *
   * A name and a rule are separate claims (they are stored apart for exactly
   * that reason), but here they are one answer to one question, so one write
   * carries both. Adding does not touch the board until this runs: a column
   * that existed while the dialog was open would swallow the board if the
   * dialog were cancelled.
   */
  function saveColumnDialog(open: NonNullable<typeof dialog>, draft: InboxColumnDraft) {
    if (!props.onSetInboxColumns) return;
    if (open.mode === "add") {
      props.onSetInboxColumns(addInboxColumn(inboxColumns, open.beside, draft));
      return;
    }
    const renamed = renameInboxColumn(inboxColumns, open.columnId, draft.name);
    props.onSetInboxColumns(setInboxColumnRule(renamed, open.columnId, draft.rule));
  }

  /**
   * Whether a column would take this card, asked while it is still in the air.
   *
   * The same question the drop itself asks, so a column cannot light up and
   * then quietly do nothing — the Matrix learned this at §23.5 and the answer
   * is the same one.
   */
  function boardDropOutcome(taskId: string, columnId: string) {
    // The List axis has exactly one refusal, and it is the one column that is
    // not a place: `리스트 없음` reports rows whose List is archived or gone,
    // and there is no field to write that would put a card there on purpose.
    if (axis === "lists") return columnId === NO_LIST_COLUMN ? "noList" : null;
    if (axis !== "inboxRules") return null;
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return null;
    const outcome = dropOutcomeForColumnId(target, inboxColumns, columnId, ruleContext(target));
    return outcome.accepted ? null : outcome.reason;
  }

  /**
   * What a drop into an Inbox column writes, and its Undo.
   *
   * A column that asks for a day keeps asking (§6.25) — the prompt supplies
   * one, and a day the user typed beats the day a rule would have picked. With
   * no prompt the rule decides, and a rule that cannot be satisfied without
   * touching a List, a tag or a priority refuses instead (Gate 7).
   *
   * The undo is the two fields the patch can reach, always both: restoring
   * only what changed would leave the other holding whatever the drop made of
   * it, and the pair is what §6.23 keeps consistent.
   */
  function inboxDropMutation(target: Task, columnId: string, date?: string): TaskMutation | null {
    if (date) return moveToInboxBucket(target, columnId as InboxBucket, date);
    const outcome = dropOutcomeForColumnId(target, inboxColumns, columnId, ruleContext(target));
    if (!outcome.accepted) return null;
    const undo = { isSomeday: target.isSomeday, dueDate: target.dueDate };
    // Named for what the drop actually did, not for which column it landed in
    // — under an edited rule those are no longer the same thing.
    const labelKey = outcome.patch.isSomeday
      ? "tasks.undoSomeday"
      : outcome.patch.dueDate
        ? "tasks.undoDateChanged"
        : "tasks.undoMoved";
    return { patch: outcome.patch, undo, labelKey };
  }

  /**
   * The Scope's finished work, which `rows` does not carry.
   *
   * §12.4's `active` excludes it and §12.14 needs that to stay true — the
   * sidebar count is this query's row count, and a count that included last
   * month's finished tasks is a number nobody can read. So the Board asks a
   * second time with the precondition relaxed rather than the first query
   * being widened for everyone, and the two halves are drawn apart: open work
   * in the column, finished work in the column's own "완료" group.
   *
   * Newest first, and it is `groupTasks` that says so — inside "완료"
   * every deadline is settled, and what the reader is looking for is the thing
   * they just ticked.
   */
  const finishedRows = useMemo(
    () =>
      state.view === "board" && !viewOptions.hideCompleted
        ? queryScopeTasks(scope, ctx, { finished: true }).filter(isCompleted)
        : [],
    [state.view, scope, ctx, viewOptions.hideCompleted],
  );
  const finishedIn = (columnId: string) =>
    groupTasks(
      finishedRows.filter((task) => columnOf(task) === columnId),
      today,
      { ...DEFAULT_GROUP_VIEW, groupBy: "none" },
    ).find((group) => group.id === "completed")?.tasks ?? [];

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
        : axis === "inboxRules"
          ? inboxDropMutation(target, columnId, date)
          : axis === "sections"
            ? moveTaskToSection(target, columnId, lists, listSections)
            : moveToListColumn(target, columnId, { lists, sections: listSections });
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

  /**
   * A task typed into a column's `+`, and the Board's third adapter.
   *
   * §12.16 forbids an entry point working out the owner for itself, so the
   * Scope's resolution is computed first and the column only narrows it —
   * exactly as `dropOnBoard` lets the Scope decide which command a drag is.
   * The narrowing is per Board (Gate 7), which is why there are two functions
   * here and not one with the column id.
   */
  function createInColumn(columnId: string, title: string, date: string) {
    const base = resolveCreateContext(scope, {
      inboxListId: lists.find(isInboxList)?.id ?? "",
      today,
      savedFilters,
    });
    if (!base.enabled) return;
    const resolution =
      axis === "inboxRules"
        ? createInInboxBucket(base, columnId as InboxBucket, date)
        : axis === "sections"
          ? createInListSection(base, columnId)
          : // The column names the List, which is how a Folder's "ask which
            // List" (`createOwner: "requiresList"`) gets answered by typing
            // rather than by a dialog.
            createInListColumn(base, columnId);
    // §12.16's last line, restated where it can actually be violated: a
    // resolution still missing something is not committed. The form does not
    // let this happen; the check is here because the form is not the rule.
    if (!canCommit(resolution)) return;
    props.onCreate(title, resolution);
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

          {/* §1.2: one icon button at the far end of the Trash's own header,
              and nowhere else. Absent while the Trash is empty — a button
              whose whole job is to remove things has nothing to say when
              there is nothing to remove. */}
          {scope.kind === "trash" && (trashedCount > 0 || binnedListIds.length > 0) ? (
            <div className="tm-scope-actions">
              <button
                type="button"
                className="tm-scope-danger"
                aria-label={t("tasks.emptyTrashAction")}
                title={t("tasks.emptyTrashAction")}
                onClick={() => setEmptyingTrash(true)}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <path d="M4.5 6.5h15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M9.5 6.5V4.8h5v1.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                  <path d="M6.5 6.5l1 12.2h9l1-12.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                  <path d="M10.3 10v5.5M13.7 10v5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : null}

          {/* The view selector was here, as three 32px squares (§13.4). It is
              in the ⋯ menu now (TASK_VIEWS_EVERYWHERE_DESIGN.md §3.1): the
              squares used to appear on two Scopes out of nine and now qualify
              on seven, which is the condition §13.4's "icons cost the header
              nothing" argument was making. The cost is real and taken
              knowingly — switching view is two presses now, not one. */}

          {/* The Scope's own menu (SCOPE_VIEW_OPTIONS_DESIGN.md §3.2).
              Everything that says what this Scope SHOWS lives behind it,
              starting with the view — which stood in the header as three text
              buttons and is one press further away now, in exchange for a
              header that is a title and a count.

              Absent on the three Scopes that are finished work: half of what
              this menu will hold loses its meaning there, and "완료 숨기기" on
              the Completed Scope is a button that empties the screen (§3.1). */}
          {scopeHasViewOptions(scope.kind) && scopeMenuItems.length > 0 ? (
            <MoreMenu items={scopeMenuItems} label={t("tasks.scopeMenu")} />
          ) : null}
        </header>

        {!missing && !props.loading ? (
          <TaskQuickAdd
            scope={scope}
            lists={lists}
            inboxListId={lists.find(isInboxList)?.id ?? ""}
            today={today}
            folderLists={
              scope.kind === "folder"
                ? lists.filter((list) => folderIdFor(list) === scope.id && !list.archivedAt && !list.deletedAt)
                : []
            }
            tags={tags}
            savedFilters={savedFilters}
            templates={props.templates}
            onUseTemplate={props.onUseTemplate}
            draftTitle={props.draftTitle}
            onCreate={(title, resolution) => {
              props.onDraftConsumed();
              props.onCreate(title, resolution);
            }}
          />
        ) : null}

        {/* The Trash's other half (§16.3). Above the Tasks because restoring a
            List brings back everything inside it — the bigger undo is the one
            to see before picking rows out of the smaller one. */}
        {scope.kind === "trash" && !props.loading ? (
          <TrashLists
            lists={lists}
            tasks={tasks}
            onRestore={props.lifecycle.onRestoreList}
            onDeleteForever={setDeletingList}
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
        ) : rows.length === 0 && state.view === "list" && !(scope.kind === "trash" && binnedListIds.length > 0) ? (
          /* "휴지통이 비어 있습니다" over a Trash holding two Lists is a
             sentence the screen above it contradicts (§16.3). The Lists are
             the content in that case, and an empty state belongs to a screen
             with nothing on it. */
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
            /* §3.4: through `mutate`, so a drag on the timeline can be
               taken back like everything on the row's menu. It was
               `props.drawer.onUpdate` — a raw patch, no undo. */
            onMutateTask={mutate}
          />
        ) : state.view === "board" ? (
          <TaskBoard
            columns={columns}
            tasksIn={tasksIn}
            columnOf={columnOf}
            openTaskId={state.taskId}
            showInputBox={viewOptions.showInputBox}
            dateBy={viewOptions.dateBy}
            kanbanSize={viewOptions.kanbanSize}
            showDetails={viewOptions.showDetails}
            today={today}
            onOpen={openTask}
            onDrop={dropOnBoard}
            onCreate={createInColumn}
            finishedIn={finishedIn}
            unmatched={unmatched}
            dropRefusal={boardDropOutcome}
            onColumnMenu={
              scope.kind === "inbox" && props.onSetInboxColumns
                ? (columnId, x, y) => setMenu(columnMenuAt(columnId, x, y))
                : undefined
            }
            onAddColumn={
              scope.kind === "inbox" && props.onSetInboxColumns
                ? () => setDialog({ mode: "add", beside: null })
                : undefined
            }
            onRename={
              // Only the Inbox's columns are the user's to name here. A List's
              // are Sections — records with a name of their own, and renaming
              // one is a write to that record rather than to a setting.
              scope.kind === "inbox" && props.onRenameInboxColumn
                ? (columnId, name) => props.onRenameInboxColumn?.(columnId as InboxBucket, name)
                : undefined
            }
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
                  <TaskRowContent
                    task={task}
                    today={today}
                    dateBy={viewOptions.dateBy}
                    showDetails={viewOptions.showDetails}
                    /* Only ever non-empty in the Trash: that is the one Scope
                       a child is a row in (§13). */
                    parentTitle={parentTitleOf(task)}
                    onOpen={openTask}
                    onToggleDone={toggleDone}
                  />
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
       * surface floating over the page.
       *
       * And NOT on the Board. What the reservation buys is that the rows do
       * not move when a Task is opened, and a Board's cards cannot move: the
       * columns are `flex: none` at a fixed width and the Board scrolls
       * sideways rather than shrinking (§15). So the 480px buys nothing there
       * and costs everything — measured at 1280: the shell was
       * `248px 502px 480px`, which left the Board 438px of the 982 it could
       * have had, with the second column clipped at the edge. Opening a Task
       * narrows the Board's viewport instead, which is the same thing that
       * happens when the window is resized and is what its scroll is for. */}
      {!openedTask && state.view !== "board" && taskDetailPresentationFor(mode) === "inline-drawer" ? (
        <aside
          className="tm-drawer is-inline-drawer is-empty"
          aria-label={t("tasks.drawerLabel")}
        >
          <p className="tm-drawer-empty">{t("tasks.drawerEmpty")}</p>
        </aside>
      ) : null}

      {/* Everything between "here is a Task" and the Drawer's thirty-odd
          props is `TaskDetailPane`. It moved out with the commands above,
          and for the same reason: the derivations it does — the ancestors,
          the blockers, the registry's answer for this Task — are what the
          other four pages were missing, not the collections
          (TASK_DETAIL_PANEL_MERGE_DESIGN.md §5). */}
      {openedTask ? (
        <TaskDetailPane
          task={openedTask}
          presentation={taskDetailPresentationFor(mode)}
          resize={detailWidth}
          today={today}
          tasks={tasks}
          lists={lists}
          folders={sidebarFolders}
          tags={tags}
          taskTags={taskTags}
          bundle={props.drawer}
          commands={commands}
          focusBusy={props.focusBusy}
          onClose={closeTask}
          onOpenTask={openTask}
        />
      ) : null}

      {menu ? <ContextMenu state={menu} onClose={() => setMenu(null)} /> : null}

      {dialog ? (
        <InboxColumnDialog
          title={
            dialog.mode === "edit"
              ? t("tasks.columnEdit", { column: columnNameOf(dialog.columnId) })
              : t("tasks.columnNew")
          }
          placeholder={dialog.mode === "edit" ? columnNameOf(dialog.columnId) : t("tasks.columnNewName")}
          initial={dialogDraft(dialog)}
          onClose={() => setDialog(null)}
          onSave={(draft) => {
            saveColumnDialog(dialog, draft);
            setDialog(null);
          }}
        />
      ) : null}

      {/* §9.36 lives in its own component now, because `useTaskCommands`
          is a hook two surfaces call and a notice nobody draws is a change
          nobody can take back. */}
      <TaskUndoStrip notice={commands.notice} onDismiss={() => commands.setNotice(null)} />
      <TaskDeleteForeverGate
        task={commands.pendingDeleteForever}
        onCancel={commands.cancelDeleteForever}
        onConfirm={commands.confirmDeleteForever}
      />
      {viewOptionsOpen ? (
        <ScopeViewOptionsDialog
          options={viewOptions}
          onChange={patchViewOptions}
          onClose={() => setViewOptionsOpen(false)}
        />
      ) : null}
      <ListDeleteForeverGate
        list={lists.find((list) => list.id === deletingList) ?? null}
        tasks={tasks}
        onCancel={() => setDeletingList("")}
        onConfirm={() => {
          props.lifecycle.onPermanentlyDeleteList(deletingList);
          setDeletingList("");
        }}
      />
      <TrashEmptyGate
        summary={emptyingTrash ? trashSummary : null}
        onCancel={() => setEmptyingTrash(false)}
        onConfirm={() => {
          setEmptyingTrash(false);
          props.onEmptyTrash();
        }}
      />
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
