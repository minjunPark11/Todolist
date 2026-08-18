import { useEffect, useMemo, useState } from "react";
import type { FocusSession, Folder, GoalSchedule, LearningPath, List, Milestone, Project, Task, TaskDraft } from "../../types";
import type { ToastState } from "../kit";
import type { PageId } from "../../types";
import {
  type SpaceLike,
  type SpaceTab,
} from "../../lib/spaceHubTypes";
import { isTaskView, navItemsForScope } from "../../domain/view/spaceNav";
import { useT } from "../../i18n";
import { SPACE_TASK_GROUPS, tabText, upcomingKindText } from "../../lib/spaceHubI18n";
import { useTabInUrl } from "../../lib/spaceTabUrl";
import {
  formatSeconds,
  getNextActionTask,
  getSpaceSignal,
  getSpaceTaskCounts,
  getSpaceTasks,
  getSpaceSessions,
  getTodaySpaceFocusSeconds,
  getUpcomingSpaceItems,
  getWeekSpaceFocusSeconds,
} from "../../lib/spaceSelectors";
import { useSpaceHubData } from "../../hooks/useSpaceHubData";
import { formatDate, getWeekStart, todayValue } from "../../utils/date";
import { OverviewSection, type OverviewChild } from "./OverviewSection";
import { GoalQuickAdd, StatusManager } from "./SpaceViewTools";
import { BoardView, type BoardColumn } from "../BoardView";
import { TaskListView } from "../TaskListView";
import { TaskGanttView } from "../TaskGanttView";
import { TaskCalendarView } from "../TaskCalendarView";
import { GoalsSection } from "./GoalsSection";
import { statusPatch } from "../../domain/view/board";
import { projectItems, type Item } from "../../domain/view/item";
import { goalDropFor, patchForColumn } from "../../domain/view/board";
import { groupRank, type GroupContext, type ViewSpec } from "../../domain/view/viewSpec";
import { showsGoals, specForSpaceView, type SpaceViewId } from "../../domain/view/spaceViews";
import { listIdFor, statusesWithCustom } from "../../domain/spaces/membership";
import { activeLists, DEFAULT_STATUSES, listDisplayName, statusDisplayLabel } from "../../domain/spaces/hierarchy";
import {
  AddSpaceTaskModal,
  DeleteSpaceConfirmModal,
  FocusConflictModal,
  FocusStartPickerModal,
  type SpaceTaskInput,
} from "./SpaceModals";
import {
  SessionDetailDrawer,
  SpaceSettingsDrawer,
  TaskDetailDrawer,
} from "./SpaceDrawers";
import type { Schedule, ScheduleIssue } from "../../domain/schedule";

export type SpaceDetailViewProps = {
  space: SpaceLike;
  tasks: Task[];
  projects: Project[];
  // Board time axis (SPACES_BOARD_DESIGN.md D2).
  paths: LearningPath[];
  viewScope: { spaceId?: string; projectId?: string; folderId?: string; listId?: string };
  folders: Folder[];
  /** Widens the view back to the whole Space without touching the tree. */
  onClearScope: () => void;
  /** Narrows to one List — the same selector the tree uses (§50.8). */
  onSelectList: (listId: string) => void;
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onCreateGoal: (input: { goal: string; projectId: string; boardListId?: string; schedule?: GoalSchedule }) => void;
  onOpenGoal: (pathId: string, milestoneId?: string) => void;
  onCreateStatus: (projectId: string, name: string) => void;
  onUpdateStatus: (projectId: string, listId: string, patch: { name?: string; order?: number }) => void;
  onArchiveStatus: (projectId: string, listId: string) => void;
  onMoveGoalToStatus: (pathId: string, listId?: string) => void;
  onDeletePath: (pathId: string) => void;
  onAddMilestone: (pathId: string, input: { title: string }) => void;
  onDeleteMilestone: (pathId: string, milestoneId: string) => void;
  onCreateTaskFromMilestone: (pathId: string, milestoneId: string, title: string) => void;
  onToggleTaskDone: (taskId: string) => void;
  // Read only by the Tasks board, to resolve an Item's List. Passed rather
  // than defaulted to [] so a future grouping on that axis is not silently wrong.
  lists: List[];
  focusSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  onCreateTask: (draft: TaskDraft) => string;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onUpdateTaskSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
  onCompleteTask: (id: string) => void;
  onArchiveTask: (id: string) => void;
  onStartFocus: (taskId: string, source?: FocusSession["source"]) => void;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onDeleteSpace: () => void;
  onNavigate: (page: PageId) => void;
  // Opens the main Calendar page with this space's project filter pre-applied.
  onOpenCalendar: () => void;
  showToast: (toast: ToastState) => void;
};

type ModalState =
  | { kind: "none" }
  | { kind: "add_task" }
  | { kind: "focus_picker" }
  | { kind: "focus_conflict" }
  | { kind: "delete_space" };

type DrawerState =
  | { kind: "none" }
  | { kind: "task"; taskId: string }
  | { kind: "session"; sessionId: string }
  | { kind: "settings" };


export function SpaceDetailView({
  space,
  tasks,
  projects,
  paths,
  viewScope,
  folders,
  onClearScope,
  onSelectList,
  onUpdatePath,
  onUpdateMilestone,
  onCreateGoal,
  onOpenGoal,
  onCreateStatus,
  onUpdateStatus,
  onArchiveStatus,
  onMoveGoalToStatus,
  onDeletePath,
  onAddMilestone,
  onDeleteMilestone,
  onCreateTaskFromMilestone,
  onToggleTaskDone,
  lists,
  focusSessions,
  activeFocusSession,
  onCreateTask,
  onUpdateTask,
  onUpdateTaskSchedule,
  onCompleteTask,
  onArchiveTask,
  onStartFocus,
  onUpdateProject,
  onDeleteSpace,
  onNavigate,
  onOpenCalendar,
  showToast,
}: SpaceDetailViewProps) {
  const { t } = useT();
  const hub = useSpaceHubData();
  const [tab, setTab] = useTabInUrl("project");
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "none" });
  const today = todayValue();
  const weekStart = getWeekStart(today);
  // This screen is opened at a Project or below, so the bar it draws is the
  // Project one. The Space-level bar (which drops Board — §0.3.3) belongs to
  // the Space screen, STEP 10.
  const navItems = useMemo(() => navItemsForScope("project"), []);
  const config = hub.getConfig(space.id);

  const displayName = space.name;
  const displayDescription = space.description;
  const displayColor = space.color;

  // A space IS its Project, so its id is the Project id (SPACES_REDESIGN_II
  // §0.3.8). This used to arrive as a separate `sourceId` beside a `sourceRef`
  // discriminator, which was the same value carried twice under two names.
  const projectId = space.id;
  const spaceTasks = useMemo(() => getSpaceTasks(tasks, projectId), [tasks, projectId]);
  const spaceSessions = useMemo(
    () => getSpaceSessions(focusSessions, spaceTasks, projectId),
    [focusSessions, spaceTasks, projectId],
  );

  // === Tasks board (CLICKUP_IMPORT_DESIGN §4.2: filter{space} + groupBy status) ===
  //
  // Built from `spaceTasks` rather than re-filtering by `spaceId` in the spec:
  // membership is resolved once, in one place, and the engine is handed the
  // answer. There is exactly one rule to resolve now — the Project behind the
  // space (SPACES_REDESIGN_II §0.3.7).
  const sourceProject = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const boardStatuses = useMemo(
    () => (sourceProject ? statusesWithCustom(sourceProject) : DEFAULT_STATUSES),
    [sourceProject],
  );
  // Every source is projected once; which of them a view shows is its
  // `filter.sources` (spaceViews.ts), not a second projection per screen.
  const spaceGoals = useMemo(
    () => paths.filter((path) => path.projectId && path.projectId === projectId),
    [paths, projectId],
  );
  const boardItems = useMemo(
    () =>
      projectItems({ tasks: spaceTasks, paths: spaceGoals, projects, lists, today })
        // Archived work belongs in the Archive, not as a column here.
        .filter((item) => item.statusId !== "archived"),
    [spaceTasks, spaceGoals, projects, lists, today],
  );
  // Same view, opened at whatever level the tree is standing on (§16).
  //
  // The Project level contributes no filter of its own because membership was
  // already resolved into `spaceTasks` above; naming it again would be the
  // same narrowing done twice. This screen is per-Project, so a Space scope
  // never reaches it — that view is STEP 10's.
  const scopeFilter = useMemo(
    () =>
      viewScope.listId !== undefined
        ? { listId: viewScope.listId }
        : viewScope.folderId !== undefined
          ? { folderId: viewScope.folderId }
          : {},
    [viewScope.listId, viewScope.folderId],
  );
  const scopeName = useMemo(() => {
    if (viewScope.listId !== undefined) {
      return listDisplayName(lists.find((list) => list.id === viewScope.listId), t("list.defaultName"));
    }
    if (viewScope.folderId !== undefined) {
      return folders.find((folder) => folder.id === viewScope.folderId)?.name ?? "";
    }
    return "";
  }, [viewScope.listId, viewScope.folderId, lists, folders]);

  /**
   * The Tasks the header and its cards are about.
   *
   * `spaceTasks` is the whole Project. Standing on a Folder or a List narrows
   * the view below it, and the header used to keep answering for the Project:
   * counts that disagreed with what was on screen, and a Next Action that
   * recommended a Task the view was not showing. The Project's NAME stays —
   * that is what you are inside — but its numbers follow the scope.
   */
  const scopedTasks = useMemo(() => {
    if (viewScope.listId !== undefined) {
      return spaceTasks.filter((task) => listIdFor(task, lists) === viewScope.listId);
    }
    if (viewScope.folderId !== undefined) {
      const inFolder = new Set(
        lists.filter((list) => list.folderId === viewScope.folderId).map((list) => list.id),
      );
      return spaceTasks.filter((task) => inFolder.has(listIdFor(task, lists)));
    }
    return spaceTasks;
  }, [spaceTasks, lists, viewScope.listId, viewScope.folderId]);

  /** The Lists the Overview's progress rows cover — the same narrowing. */
  const scopedLists = useMemo(() => {
    const all = activeLists(lists, projectId);
    if (viewScope.listId !== undefined) return all.filter((list) => list.id === viewScope.listId);
    if (viewScope.folderId !== undefined) {
      return all.filter((list) => list.folderId === viewScope.folderId);
    }
    return all;
  }, [lists, projectId, viewScope.listId, viewScope.folderId]);

  const activeView: SpaceViewId = isTaskView(tab) ? tab : "board";
  const boardSpec: ViewSpec = useMemo(
    () => specForSpaceView(activeView, scopeFilter, tabText(t, activeView)),
    [activeView, scopeFilter, t],
  );
  const boardContext: GroupContext = useMemo(
    () => ({
      today,
      taskById: new Map(spaceTasks.map((task) => [task.id, task])),
      // D10: the user's arrangement outranks the alphabet, and every view on
      // this screen has to agree about it. `groupRank` answers undefined for
      // an axis nobody arranged (status, horizon), so passing it always is
      // cheaper than deciding per view which one needs it.
      groupRank: groupRank(boardSpec.groupBy, { projects, lists, folders }),
    }),
    [today, spaceTasks, boardSpec.groupBy, projects, lists, folders],
  );

  /**
   * A board's columns are its axis spelled out, and the axis is the Space's
   * statuses. A `groupBy: "horizon"` branch stood here drawing the five fixed
   * periods; no spec this screen builds ever asked for that axis, and Horizons
   * is gone besides.
   */
  const boardColumns: BoardColumn[] = useMemo(() => {
    return boardStatuses
      .filter((status) => status.id !== "archived")
      .map((status) => ({
        id: status.id,
        label: statusDisplayLabel(status, t),
        color: status.color,
      }));
  }, [boardSpec.groupBy, boardStatuses, t]);

  function handleBoardDrop(item: Item, columnId: string) {
    // Only the status axis has an inverse here; dropping onto a horizon would
    // have to invent a date the user never chose (domain/view/board.ts).
    if (boardSpec.groupBy !== "status") return;
    if (item.source === "goal") {
      const goal = paths.find((path) => path.id === item.sourceId);
      if (!goal) return;
      const drop = goalDropFor(goal, columnId, boardStatuses);
      if (drop.kind === "complete") onUpdatePath(goal.id, { completedAt: new Date().toISOString() });
      else if (drop.kind === "file") {
        onMoveGoalToStatus(goal.id, drop.listId);
        if (goal.completedAt) onUpdatePath(goal.id, { completedAt: undefined });
      }
      return;
    }
    const task = boardContext.taskById.get(item.sourceId);
    if (!task) return;
    const patch = patchForColumn("status", task, columnId, { today, statuses: boardStatuses });
    if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
  }

  const counts = getSpaceTaskCounts(scopedTasks, today);
  const nextAction = getNextActionTask(scopedTasks, config, today);
  const signal = getSpaceSignal(scopedTasks, spaceSessions, t, today);
  // Focus time stays the Project's. A session is matched by its own
  // `projectId` as well as by its Task (getSpaceSessions), so there is no
  // honest way to attribute one to a Folder — and "how long have I worked on
  // this Project" is the question the card asks either way.
  const todayFocusSeconds = getTodaySpaceFocusSeconds(spaceSessions, today);
  const weekFocusSeconds = getWeekSpaceFocusSeconds(spaceSessions, weekStart);
  const upcoming = getUpcomingSpaceItems(scopedTasks, today);
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (modal.kind !== "none") setModal({ kind: "none" });
      else if (drawer.kind !== "none") setDrawer({ kind: "none" });
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [modal.kind, drawer.kind, tab]);

  // === Handlers (§31) ===

  // The Lists of this Project, each with the Tasks that resolve to it. Rows
  // for the Overview's first card (§50.5); membership comes from `listIdFor`
  // via the projection rather than being counted a second way here.
  const overviewChildren: OverviewChild[] = useMemo(() => {
    const listIdOf = new Map(boardItems.map((item) => [item.sourceId, item.listId]));
    return scopedLists.map((list) => ({
      id: list.id,
      name: listDisplayName(list, t("list.defaultName")),
      tasks: scopedTasks.filter((task) => listIdOf.get(task.id) === list.id),
    }));
  }, [scopedLists, boardItems, scopedTasks, t]);

  /** §50.8: a List row narrows the scope to that List. */
  function openListRow(listId: string) {
    onSelectList(listId);
  }

  /** One route into the shared detail surface, whatever view opened it (§49A.4). */
  function openItem(item: Item) {
    if (item.source === "task") openTaskDrawer(item.sourceId);
    else if (item.source === "goal") onOpenGoal(item.sourceId);
    else if (item.source === "milestone") onOpenGoal(item.parentId, item.sourceId);
  }

  function handleCreateSpaceTask(input: SpaceTaskInput) {
    const tags: string[] = [];
    if (input.group) tags.push(`group:${input.group}`);
    onCreateTask({
      title: input.title,
      status: "todo",
      priority: input.priority,
      dueDate: input.dueDate,
      notes: input.notes,
      projectId,
      tags,
    });
    showToast({ message: t("spaceHub.toast.taskAdded", { name: displayName }) });
    setModal({ kind: "none" });
  }


  function handleStartFocus(taskId?: string) {
    // Only one active FocusSession at a time (§33.9).
    if (activeFocusSession) {
      setModal({ kind: "focus_conflict" });
      return;
    }
    const targetId = taskId ?? nextAction?.id;
    if (!targetId) {
      setModal({ kind: "focus_picker" });
      return;
    }
    onStartFocus(targetId, "focus_page");
    showToast({ message: t("spaceHub.toast.focusStarted") });
    setModal({ kind: "none" });
  }

  function handleCompleteTask(taskId: string) {
    onCompleteTask(taskId);
    showToast({ message: t("spaceHub.toast.taskCompleted") });
  }

  // Sub-tasks are full Tasks (one level deep): they inherit the parent's
  // space/project linkage and group tag so they stay inside this space, and
  // they carry their own priority/dueDate so Eisenhower can classify them.
  function handleCreateSubtask(parent: Task, title: string) {
    const inheritedTags = parent.tags.filter((tag) => tag.startsWith("space:") || tag.startsWith("group:"));
    onCreateTask({
      title,
      status: "todo",
      projectId: parent.projectId,
      parentTaskId: parent.id,
      tags: inheritedTags,
    });
    showToast({ message: t("spaceHub.toast.subtaskAdded", { title: parent.title }) });
  }

  function handlePinNextAction(taskId: string) {
    hub.updateConfig(space.id, { pinnedNextActionTaskId: taskId });
    showToast({ message: t("spaceHub.toast.pinned") });
  }

  function handleOpenGlobalAi() {
    window.dispatchEvent(
      new CustomEvent("focusflow:open-ai-chat", {
        detail: { draft: t("spaceHub.ai.boardPrompt", { name: displayName }) },
      }),
    );
  }

  function handleSaveSettings(input: {
    name: string;
    description: string;
    color: string;
    overviewCards: typeof config.overviewCards;
    defaults: typeof config.defaults;
  }) {
    hub.updateConfig(space.id, {
      overviewCards: input.overviewCards,
      defaults: input.defaults,
    });
    if (projectId) {
      onUpdateProject(projectId, { name: input.name, description: input.description, color: input.color });
    }
    showToast({ message: t("spaceHub.toast.settingsSaved") });
    setDrawer({ kind: "none" });
  }

  function handleDeleteSpace() {
    setModal({ kind: "none" });
    setDrawer({ kind: "none" });
    onDeleteSpace();
  }

  const openTaskDrawer = (taskId: string) => setDrawer({ kind: "task", taskId });
  // Falls back to the full task list because a task can reach this drawer from
  // the board's horizon rows while carrying a different projectId — it belongs
  // to a goal on this board, not to the board directly (SPACES_BOARD_DESIGN D3).
  // Without the fallback that card would open an empty drawer.
  const drawerTask =
    drawer.kind === "task"
      ? spaceTasks.find((task) => task.id === drawer.taskId) ?? tasks.find((task) => task.id === drawer.taskId) ?? null
      : null;
  const drawerSession = drawer.kind === "session" ? spaceSessions.find((session) => session.id === drawer.sessionId) ?? null : null;

  return (
    <div className="sdv-page" style={{ ["--sdv-accent" as string]: displayColor }}>
      {/* A "back to Spaces" button stood here and returned to the card grid.
          The grid is gone — the tree is how you leave, and it is still there. */}

      {/* Space Header Card (§7) */}
      <header className="sdv-header-card">
        <div className="sdv-header-identity">
          <span className="sdv-space-icon" style={{ background: displayColor }} aria-hidden="true">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1>{displayName}</h1>
            {/* The Project's own words when it has them, the default line when
                it does not. This used to prefix the description with the space
                TYPE — "프로젝트 공간 · …" — which named a distinction the app
                no longer draws, in a third vocabulary again ("area" stored,
                "Custom" displayed). */}
            <p className="sdv-header-subtitle">
              {displayDescription || t("spaceHub.preset.subtitleProject")}
            </p>
            <p className="sdv-header-counts">
              {/* `open`, not `total`. The tree badge beside this counts what
                  is left, and one Project reading 4 in the sidebar and 5 in
                  its own header is two numbers for one thing. The other two
                  figures on this line are about work still to do, so the
                  headline was the odd one out. */}
              {t("spaceHub.header.tasksScheduled", { total: counts.open, scheduled: counts.scheduled })} ·{" "}
              <span className={counts.overdue > 0 ? "sdv-overdue" : ""}>{t("spaceHub.header.overdue", { n: counts.overdue })}</span>
            </p>
          </div>
        </div>
        <div className="sdv-header-actions">
          <button type="button" className="sdv-btn" onClick={() => setModal({ kind: "add_task" })}>
            {t("spaceHub.preset.addTask")}
          </button>
          <button type="button" className="sdv-btn sdv-btn-primary" onClick={() => handleStartFocus()}>
            {t("spaceHub.preset.startFocus")}
          </button>
          <span className={`sdv-status-pill sdv-status-${signal.status}`}>{signal.label}</span>
          <button type="button" className="sdv-btn" onClick={handleOpenGlobalAi}>
            ✦ {t("spaceHub.action.askAi")}
          </button>
          <button
            type="button"
            className="sdv-btn sdv-btn-icon"
            aria-label={t("spaceHub.aria.settings")}
            onClick={() => setDrawer({ kind: "settings" })}
          >
            <span className="sdv-more-dots" aria-hidden="true">...</span>
          </button>
        </div>
      </header>

      {/* Overview metric cards (§8-12) */}
      <section className="sdv-metric-grid" aria-label={t("spaceHub.aria.overviewCards")}>
        {config.overviewCards.nextAction ? (
          <article className="sdv-metric-card">
            <h3>{t("spaceHub.preset.nextAction")}</h3>
            {nextAction ? (
              <>
                <strong className="sdv-metric-title">{nextAction.title}</strong>
                {nextAction.dueDate ? <small>{t("spaceHub.est.due", { date: formatDate(nextAction.dueDate) })}</small> : null}
                <div className="sdv-metric-actions">
                  <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={() => handleStartFocus(nextAction.id)}>
                    {t("spaceHub.preset.startFocus")}
                  </button>
                </div>
              </>
            ) : (
              <p className="sdv-empty-inline">{t("spaceHub.empty.noOpenTasks")}</p>
            )}
          </article>
        ) : null}
        {config.overviewCards.signal ? (
          <article className="sdv-metric-card">
            <h3>{t("spaceHub.preset.currentSignal")}</h3>
            <strong className={`sdv-metric-title sdv-signal-${signal.status}`}>{signal.label}</strong>
            <small>{signal.detail}</small>
          </article>
        ) : null}
        {config.overviewCards.focusTime ? (
          <article className="sdv-metric-card">
            <h3>{t("spaceHub.preset.projectFocus")}</h3>
            <strong className="sdv-metric-title">{t("spaceHub.focus.thisWeek", { time: formatSeconds(weekFocusSeconds) })}</strong>
            <small>
              {t("spaceHub.focus.todayGoal", {
                today: formatSeconds(todayFocusSeconds),
                pct: Math.min(100, Math.round((weekFocusSeconds / Math.max(config.defaults.weeklyFocusGoalSeconds, 1)) * 100)),
                goal: formatSeconds(config.defaults.weeklyFocusGoalSeconds),
              })}
            </small>
            <div
              className="sdv-progress"
              role="progressbar"
              aria-valuenow={Math.min(100, Math.round((weekFocusSeconds / Math.max(config.defaults.weeklyFocusGoalSeconds, 1)) * 100))}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                style={{
                  width: `${Math.min(100, (weekFocusSeconds / Math.max(config.defaults.weeklyFocusGoalSeconds, 1)) * 100)}%`,
                }}
              />
            </div>
          </article>
        ) : null}
        {config.overviewCards.upcoming ? (
          <article className="sdv-metric-card">
            <h3>{t("spaceHub.preset.upcoming")}</h3>
            {upcoming.length === 0 ? (
              <p className="sdv-empty-inline">{t("spaceHub.empty.nothingUpcoming")}</p>
            ) : (
              <ul className="sdv-upcoming-list">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <span className={`sdv-upcoming-kind sdv-kind-${item.kind}`}>{upcomingKindText(t, item.kind)}</span>
                    <span className="sdv-upcoming-title">{item.title}</span>
                    <small>{formatDate(item.when)}</small>
                  </li>
                ))}
              </ul>
            )}
            <div className="sdv-metric-actions">
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={onOpenCalendar}>
                {t("spaceHub.action.openCalendar")} ↗
              </button>
            </div>
            <p className="sdv-upcoming-hint">ⓘ {t("spaceHub.upcoming.hint")}</p>
          </article>
        ) : null}
      </section>

      {/* One flat View Bar (§14). The Section/Task View split is internal —
          the reader is not asked to classify what they are clicking, so there
          is no second navigation row and exactly one item is active. */}
      <nav className="sdv-tab-nav" role="tablist" aria-label={t("spaceHub.aria.sections")}>
        {navItems.map(({ id: item }) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {tabText(t, item)}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
        {/* The time axis that used to sit here is the Horizons view now: same
            items, `groupBy:"horizon"`, one tab across (D2/U4). Overview is
            what is moving, not where everything sits. */}
        {/* §50.14: the same Overview the Space screen mounts. Only the Main
            column's first card changes with the level — Lists here, Projects
            there — so the two are one component with a different argument. */}
        <OverviewSection
          // Its "recently updated" and "upcoming" cards are about the work in
          // view, so they narrow with the scope like the header does. Goals do
          // not: a Goal belongs to the Project, and the Goals section shows the
          // Project's whatever scope you stand on.
          tasks={scopedTasks}
          goals={spaceGoals}
          today={today}
          childLabel={t("overview.lists")}
          children={overviewChildren}
          onOpenChild={openListRow}
          onOpenTask={openTaskDrawer}
          onOpenGoal={onOpenGoal}
          onOpenTab={setTab}
        />
        </>
      ) : null}
      {/* One panel for every view. What differs between them is the spec, and
          the spec is data (spaceViews.ts) — so a fourth view is a row in a
          table, not another branch here. */}
      {tab !== "overview" ? (
        <>
          <div className="sdv-view-bar">
            {/* A narrowed board and an empty one look identical without this.
                The scope comes from the tree, which may be collapsed or off
                screen, so the view has to say what it is showing. */}
            {scopeName ? (
              <p className="sdv-scope">
                {scopeName}
                <button type="button" onClick={onClearScope}>{t("scope.clear")}</button>
              </p>
            ) : null}
            {showsGoals(activeView) && projectId ? (
              <>
                <GoalQuickAdd
                  onCreate={(goal) =>
                    onCreateGoal({ goal, projectId, schedule: { unit: "unscheduled" } })
                  }
                />
                <StatusManager
                  statuses={sourceProject?.boardLists ?? []}
                  onCreate={(name) => onCreateStatus(projectId, name)}
                  onRename={(statusId, name) => onUpdateStatus(projectId, statusId, { name })}
                  onReorder={(statusId, order) => onUpdateStatus(projectId, statusId, { order })}
                  onArchive={(statusId) => onArchiveStatus(projectId, statusId)}
                />
              </>
            ) : null}
          </div>
          {tab === "goals" ? (
            <GoalsSection
              goals={spaceGoals}
              tasks={spaceTasks}
              projects={projects}
              // One Project in scope, so its name on every card would be the
              // same word repeated (§50E.17). The Space screen sets this.
              showProjectContext={false}
              onOpenGoal={onOpenGoal}
              onCreateGoal={
                projectId
                  ? (goal) => onCreateGoal({ goal, projectId, schedule: { unit: "unscheduled" } })
                  : undefined
              }
            />
          ) : tab === "calendar" ? (
            <TaskCalendarView
              tasks={spaceTasks}
              projects={projects}
              today={today}
              onOpenTask={openTaskDrawer}
              onUpdateTask={onUpdateTask}
              onUpdateTaskSchedule={onUpdateTaskSchedule}
            />
          ) : tab === "gantt" ? (
            <TaskGanttView
              items={boardItems}
              spec={boardSpec}
              context={boardContext}
              today={today}
              projects={projects}
              tasks={tasks}
              groupLabel={(groupId) => {
                const list = lists.find((candidate) => candidate.id === groupId);
                return list ? listDisplayName(list, t("list.defaultName")) : t("timeline.ungrouped");
              }}
              onOpenItem={openItem}
              onUpdateTask={onUpdateTask}
            />
          ) : tab === "list" ? (
            <TaskListView
              items={boardItems}
              spec={boardSpec}
              context={boardContext}
              statuses={boardStatuses}
              lists={lists}
              today={today}
              onOpenItem={openItem}
              onPatchTask={onUpdateTask}
              onSetStatus={(item, statusId) => {
                const task = boardContext.taskById.get(item.sourceId);
                if (!task) return;
                const patch = statusPatch(task, statusId, boardStatuses);
                if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
              }}
              onCreateTask={(title) =>
                onCreateTask({ title, status: "todo", projectId, listId: viewScope.listId ?? "" })
              }
            />
          ) : (
            <BoardView
              items={boardItems}
              spec={boardSpec}
              context={boardContext}
              columns={boardColumns}
              projects={projects}
              today={today}
              otherLabel={t("board.other")}
              onOpenItem={openItem}
              onDropItem={handleBoardDrop}
            />
          )}
        </>
      ) : null}
      {/* Modals (§32) */}
      {modal.kind === "add_task" ? (
        <AddSpaceTaskModal
          groups={SPACE_TASK_GROUPS}
          onSubmit={handleCreateSpaceTask}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "focus_picker" ? (
        <FocusStartPickerModal
          spaceTasks={spaceTasks}
          onPick={(taskId) => handleStartFocus(taskId)}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "focus_conflict" ? (
        <FocusConflictModal
          onGoToFocus={() => {
            setModal({ kind: "none" });
            onNavigate("focus");
          }}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "delete_space" ? (
        <DeleteSpaceConfirmModal
          spaceName={displayName}
          onConfirm={handleDeleteSpace}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {/* Drawers (§32.4-32.7, §28) */}
      {drawerTask ? (
        <TaskDetailDrawer
          task={drawerTask}
          parentTask={drawerTask.parentTaskId ? spaceTasks.find((task) => task.id === drawerTask.parentTaskId) ?? null : null}
          childTasks={spaceTasks.filter((task) => task.parentTaskId === drawerTask.id)}
          projects={projects}
          sessions={spaceSessions.filter((session) => session.taskId === drawerTask.id)}
          isPinned={config.pinnedNextActionTaskId === drawerTask.id}
          onStartFocus={() => handleStartFocus(drawerTask.id)}
          onComplete={() => {
            handleCompleteTask(drawerTask.id);
            setDrawer({ kind: "none" });
          }}
          onPin={() => handlePinNextAction(drawerTask.id)}
          onArchive={() => {
            onArchiveTask(drawerTask.id);
            setDrawer({ kind: "none" });
          }}
          onAddChildTask={(title) => handleCreateSubtask(drawerTask, title)}
          onToggleChildDone={handleCompleteTask}
          onOpenTask={(taskId) => setDrawer({ kind: "task", taskId })}
          onClose={() => setDrawer({ kind: "none" })}
        />
      ) : null}
      {drawerSession ? (
        <SessionDetailDrawer
          session={drawerSession}
          task={spaceTasks.find((task) => task.id === drawerSession.taskId) ?? null}
          onClose={() => setDrawer({ kind: "none" })}
        />
      ) : null}
      {drawer.kind === "settings" ? (
        <SpaceSettingsDrawer
          name={displayName}
          description={displayDescription}
          color={displayColor}
          overviewCards={config.overviewCards}
          defaults={config.defaults}
          onSave={handleSaveSettings}
          onRequestDelete={() => setModal({ kind: "delete_space" })}
          onClose={() => setDrawer({ kind: "none" })}
        />
      ) : null}
    </div>
  );
}
