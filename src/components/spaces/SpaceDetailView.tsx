import { useEffect, useMemo, useState } from "react";
import type { FocusSession, Folder, GoalSchedule, LearningPath, List, Milestone, Project, Task, TaskDraft } from "../../types";
import type { ToastState } from "../kit";
import type { PageId } from "../../types";
import {
  SPACE_TABS,
  type SpaceHubType,
  type SpaceLike,
  type SpaceTab,
} from "../../lib/spaceHubTypes";
import { getSpacePreset, resolveTaskGroups } from "../../lib/spaceTypeConfig";
import { useT } from "../../i18n";
import { presetText, tabText, hubTypeText, upcomingKindText } from "../../lib/spaceHubI18n";
import {
  deriveSpaceActivities,
  formatSeconds,
  getNextActionTask,
  getRecentSpaceFocusSessions,
  getSpaceSignal,
  getSpaceTaskCounts,
  getSpaceTasks,
  getSpaceSessions,
  getTodaySpaceFocusSeconds,
  getUpcomingSpaceItems,
  getWeekSpaceFocusSeconds,
  spaceTaskTag,
} from "../../lib/spaceSelectors";
import { useSpaceHubData } from "../../hooks/useSpaceHubData";
import { formatDate, getWeekStart, todayValue } from "../../utils/date";
import { SpaceOverviewTab } from "./SpaceOverviewTab";
import { GoalQuickAdd, StatusManager } from "./SpaceViewTools";
import { BoardView, type BoardColumn } from "../BoardView";
import { projectItems, type Item } from "../../domain/view/item";
import { goalDropFor, patchForColumn } from "../../domain/view/board";
import { axisGroupIds, type GroupContext, type ViewSpec } from "../../domain/view/viewSpec";
import { showsGoals, specForSpaceView, type SpaceViewId } from "../../domain/view/spaceViews";
import { statusesWithCustom } from "../../domain/spaces/membership";
import { DEFAULT_STATUSES } from "../../domain/spaces/hierarchy";
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

export type SpaceDetailViewProps = {
  space: SpaceLike;
  tasks: Task[];
  projects: Project[];
  // Board time axis (SPACES_BOARD_DESIGN.md D2).
  paths: LearningPath[];
  viewScope: { spaceId?: string; folderId?: string; listId?: string };
  folders: Folder[];
  /** Widens the view back to the whole Space without touching the tree. */
  onClearScope: () => void;
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onCreateGoal: (input: { goal: string; projectId: string; boardListId?: string; schedule?: GoalSchedule }) => void;
  onOpenGoal: (pathId: string, milestoneId?: string) => void;
  onCreateStatus: (projectId: string, name: string) => void;
  onUpdateStatus: (projectId: string, listId: string, patch: { name?: string; order?: number }) => void;
  onArchiveStatus: (projectId: string, listId: string) => void;
  onMoveGoalToStatus: (pathId: string, listId?: string) => void;
  onToggleTaskDone: (taskId: string) => void;
  // Read only by the Tasks board, to resolve an Item's List. Passed rather
  // than defaulted to [] so a future grouping on that axis is not silently wrong.
  lists: List[];
  focusSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  onBack: () => void;
  onCreateTask: (draft: TaskDraft) => string;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
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

const DEFAULT_STATUS_IDS = new Set(DEFAULT_STATUSES.map((status) => status.id));

/**
 * `?view=` is the parameter now (U3). `?tab=` is still read so links made before
 * this change land where they meant to; only the new name is ever written.
 */
function readTabFromUrl(): SpaceTab {
  const params = new URLSearchParams(window.location.search);
  const legacy = params.get("tab");
  const value = params.get("view") ?? (legacy === "tasks" ? "board" : legacy);
  return SPACE_TABS.includes(value as SpaceTab) ? (value as SpaceTab) : "overview";
}

export function SpaceDetailView({
  space,
  tasks,
  projects,
  paths,
  viewScope,
  folders,
  onClearScope,
  onUpdatePath,
  onUpdateMilestone,
  onCreateGoal,
  onOpenGoal,
  onCreateStatus,
  onUpdateStatus,
  onArchiveStatus,
  onMoveGoalToStatus,
  onToggleTaskDone,
  lists,
  focusSessions,
  activeFocusSession,
  onBack,
  onCreateTask,
  onUpdateTask,
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
  const [tab, setTabState] = useState<SpaceTab>(readTabFromUrl);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "none" });
  const today = todayValue();
  const weekStart = getWeekStart(today);
  const config = hub.getConfig(space.id);
  const hubType = (["project", "personal", "custom"].includes(space.type) ? space.type : "custom") as SpaceHubType;
  const preset = getSpacePreset(hubType);
  const groups = resolveTaskGroups(preset);

  const displayName = space.name;
  const displayDescription = space.description || preset.headerSubtitle;
  const displayColor = space.color;

  const sourceProjectId = space.sourceRef === "project" ? space.sourceId : undefined;
  const spaceTasks = useMemo(() => getSpaceTasks(tasks, space.id, sourceProjectId), [tasks, space.id, sourceProjectId]);
  const spaceSessions = useMemo(
    () => getSpaceSessions(focusSessions, spaceTasks, sourceProjectId),
    [focusSessions, spaceTasks, sourceProjectId],
  );
  const activities = useMemo(
    () => deriveSpaceActivities(space.id, spaceTasks, spaceSessions, hub.activities, t),
    [space.id, spaceTasks, spaceSessions, hub.activities, t],
  );

  // === Tasks board (CLICKUP_IMPORT_DESIGN §4.2: filter{space} + groupBy status) ===
  //
  // Built from `spaceTasks` rather than filtered by `spaceId` in the spec,
  // because membership here is not always projectId — a Space with no source
  // project claims its tasks by tag (getSpaceTasks). Resolving membership
  // first and handing the engine the answer keeps that one rule in one place.
  const sourceProject = sourceProjectId ? projects.find((p) => p.id === sourceProjectId) : undefined;
  const boardStatuses = useMemo(
    () => (sourceProject ? statusesWithCustom(sourceProject) : DEFAULT_STATUSES),
    [sourceProject],
  );
  // Every source is projected once; which of them a view shows is its
  // `filter.sources` (spaceViews.ts), not a second projection per screen.
  const spaceGoals = useMemo(
    () => paths.filter((path) => path.projectId && path.projectId === sourceProjectId),
    [paths, sourceProjectId],
  );
  const boardItems = useMemo(
    () =>
      projectItems({ tasks: spaceTasks, paths: spaceGoals, projects, lists, today })
        // Archived work belongs in the Archive, not as a column here.
        .filter((item) => item.statusId !== "archived"),
    [spaceTasks, spaceGoals, projects, lists, today],
  );
  const boardContext: GroupContext = useMemo(
    () => ({ today, taskById: new Map(spaceTasks.map((task) => [task.id, task])) }),
    [today, spaceTasks],
  );
  // Same view, opened at whatever level the tree is standing on (§16). The
  // Space level contributes no filter of its own: membership was already
  // resolved into `spaceTasks` above, and filtering by `spaceId` again would
  // drop the tag-claimed tasks of a Space with no project behind it.
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
      return lists.find((list) => list.id === viewScope.listId)?.name ?? "";
    }
    if (viewScope.folderId !== undefined) {
      return folders.find((folder) => folder.id === viewScope.folderId)?.name ?? "";
    }
    return "";
  }, [viewScope.listId, viewScope.folderId, lists, folders]);

  const activeView: SpaceViewId = tab === "overview" ? "board" : tab;
  const boardSpec: ViewSpec = useMemo(
    () => specForSpaceView(activeView, scopeFilter, tabText(t, activeView)),
    [activeView, scopeFilter, t],
  );

  /**
   * A board's columns are its axis spelled out. Status columns come from the
   * Space; horizon columns are the five fixed periods, drawn even when empty
   * because the perspective IS the product (HORIZONS_DESIGN D8).
   */
  const boardColumns: BoardColumn[] = useMemo(() => {
    if (boardSpec.groupBy === "horizon") {
      return (axisGroupIds("horizon") ?? []).map((horizon) => ({
        id: horizon,
        label: t(`horizons.${horizon}`),
      }));
    }
    return boardStatuses
      .filter((status) => status.id !== "archived")
      .map((status) => ({
        id: status.id,
        // A default status has a translation; a column the Space named does not.
        label: DEFAULT_STATUS_IDS.has(status.id) ? t(`status.${status.id}`) : status.label,
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

  const counts = getSpaceTaskCounts(spaceTasks, today);
  const nextAction = getNextActionTask(spaceTasks, config, today);
  const signal = getSpaceSignal(hubType, spaceTasks, spaceSessions, t, today);
  const todayFocusSeconds = getTodaySpaceFocusSeconds(spaceSessions, today);
  const weekFocusSeconds = getWeekSpaceFocusSeconds(spaceSessions, weekStart);
  const upcoming = getUpcomingSpaceItems(spaceTasks, today);
  const recentSessions = getRecentSpaceFocusSessions(spaceSessions, 3);
  // View <-> URL query sync (U3): pushState on change, restore on popstate.
  function setTab(next: SpaceTab) {
    if (next === tab) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    // The old key would otherwise sit there naming a different view than the
    // one on screen, and win on the next reload.
    url.searchParams.delete("tab");
    window.history.pushState(null, "", url.toString());
    setTabState(next);
  }

  useEffect(() => {
    function handlePopState() {
      setTabState(readTabFromUrl());
    }
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Leave the URL clean when navigating away from the detail view.
      const url = new URL(window.location.href);
      if (url.searchParams.has("tab")) {
        url.searchParams.delete("tab");
        window.history.replaceState(null, "", url.toString());
      }
    };
  }, []);

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

  function handleCreateSpaceTask(input: SpaceTaskInput) {
    const tags: string[] = [];
    if (!sourceProjectId) tags.push(spaceTaskTag(space.id));
    if (input.group) tags.push(`group:${input.group}`);
    onCreateTask({
      title: input.title,
      status: "todo",
      priority: input.priority,
      dueDate: input.dueDate,
      notes: input.notes,
      projectId: sourceProjectId ?? "",
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
    if (sourceProjectId) {
      onUpdateProject(sourceProjectId, { name: input.name, description: input.description, color: input.color });
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
      <button type="button" className="sdv-back" onClick={onBack}>
        <span aria-hidden="true">←</span> {t("spaceHub.backToSpaces")}
      </button>

      {/* Space Header Card (§7) */}
      <header className="sdv-header-card">
        <div className="sdv-header-identity">
          <span className="sdv-space-icon" style={{ background: displayColor }} aria-hidden="true">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1>{displayName}</h1>
            <p className="sdv-header-subtitle">
              {preset.headerSubtitle === displayDescription
                ? presetText(t, displayDescription)
                : t("spaceHub.headerSubtitle", { type: hubTypeText(t, hubType), desc: displayDescription })}
            </p>
            <p className="sdv-header-counts">
              {t("spaceHub.header.tasksScheduled", { total: counts.total, scheduled: counts.scheduled })} ·{" "}
              <span className={counts.overdue > 0 ? "sdv-overdue" : ""}>{t("spaceHub.header.overdue", { n: counts.overdue })}</span>
            </p>
          </div>
        </div>
        <div className="sdv-header-actions">
          <button type="button" className="sdv-btn" onClick={() => setModal({ kind: "add_task" })}>
            {presetText(t, preset.addTaskLabel)}
          </button>
          <button type="button" className="sdv-btn sdv-btn-primary" onClick={() => handleStartFocus()}>
            {presetText(t, preset.startFocusLabel)}
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
            <h3>{presetText(t, preset.nextActionLabel)}</h3>
            {nextAction ? (
              <>
                <strong className="sdv-metric-title">{nextAction.title}</strong>
                {nextAction.dueDate ? <small>{t("spaceHub.est.due", { date: formatDate(nextAction.dueDate) })}</small> : null}
                <div className="sdv-metric-actions">
                  <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={() => handleStartFocus(nextAction.id)}>
                    {presetText(t, preset.startFocusLabel)}
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
            <h3>{presetText(t, preset.signalLabel)}</h3>
            <strong className={`sdv-metric-title sdv-signal-${signal.status}`}>{signal.label}</strong>
            <small>{signal.detail}</small>
          </article>
        ) : null}
        {config.overviewCards.focusTime ? (
          <article className="sdv-metric-card">
            <h3>{presetText(t, preset.focusTimeLabel)}</h3>
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
            <h3>{presetText(t, preset.upcomingLabel)}</h3>
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

      {/* Tab navigation (§13) */}
      <nav className="sdv-tab-nav" role="tablist" aria-label={t("spaceHub.aria.sections")}>
        {SPACE_TABS.map((item) => (
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
        <SpaceOverviewTab
          preset={preset}
          spaceTasks={spaceTasks}
          activities={activities}
          recentSessions={recentSessions}
          onOpenTask={openTaskDrawer}
          onToggleDone={handleCompleteTask}
          onStartFocus={handleStartFocus}
          onAddTask={() => setModal({ kind: "add_task" })}
          onOpenSession={(sessionId) => setDrawer({ kind: "session", sessionId })}
          onOpenFocusPage={() => onNavigate("focus")}
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
            {showsGoals(activeView) && sourceProjectId ? (
              <>
                <GoalQuickAdd
                  onCreate={(goal) =>
                    onCreateGoal({ goal, projectId: sourceProjectId, schedule: { unit: "unscheduled" } })
                  }
                />
                <StatusManager
                  statuses={sourceProject?.boardLists ?? []}
                  onCreate={(name) => onCreateStatus(sourceProjectId, name)}
                  onRename={(statusId, name) => onUpdateStatus(sourceProjectId, statusId, { name })}
                  onReorder={(statusId, order) => onUpdateStatus(sourceProjectId, statusId, { order })}
                  onArchive={(statusId) => onArchiveStatus(sourceProjectId, statusId)}
                />
              </>
            ) : null}
          </div>
          <BoardView
            items={boardItems}
            spec={boardSpec}
            context={boardContext}
            columns={boardColumns}
            projects={projects}
            today={today}
            otherLabel={t("board.other")}
            onOpenItem={(item: Item) => {
              if (item.source === "task") openTaskDrawer(item.sourceId);
              else if (item.source === "goal") onOpenGoal(item.sourceId);
              else if (item.source === "milestone") onOpenGoal(item.parentId, item.sourceId);
            }}
            onDropItem={handleBoardDrop}
          />
        </>
      ) : null}
      {/* Modals (§32) */}
      {modal.kind === "add_task" ? (
        <AddSpaceTaskModal
          preset={preset}
          groups={groups.map((group) => group.label)}
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
          isProject={Boolean(sourceProjectId)}
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
