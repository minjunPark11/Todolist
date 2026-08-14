import { useEffect, useMemo, useState } from "react";
import type { FocusSession, LearningPath, Milestone, Project, Task, TaskDraft } from "../../types";
import type { ToastState } from "../kit";
import type { PageId } from "../../types";
import {
  SPACE_TABS,
  type SpaceHubType,
  type SpaceLike,
  type SpaceNote,
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
import { SpaceHorizons } from "./SpaceHorizons";
import { SpaceFocusTab, SpaceTasksTab } from "./SpaceWorkTabs";
import { SpaceRecordsTab } from "./SpaceNotesRecordsTabs";
import { NoteQuickCreateModal, SpaceNotesView, type NotesPanelMode } from "./SpaceNotesPanel";
import {
  AddSpaceTaskModal,
  DeleteSpaceConfirmModal,
  FocusConflictModal,
  FocusStartPickerModal,
  ManualRecordModal,
  type SpaceTaskInput,
} from "./SpaceModals";
import {
  NoteDetailDrawer,
  SessionDetailDrawer,
  SpaceAiDrawer,
  SpaceSettingsDrawer,
  TaskDetailDrawer,
} from "./SpaceDrawers";

export type SpaceDetailViewProps = {
  space: SpaceLike;
  tasks: Task[];
  projects: Project[];
  // Board time axis (SPACES_BOARD_DESIGN.md D2).
  paths: LearningPath[];
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onCreateGoal: (input: { goal: string; projectId: string }) => void;
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
  | { kind: "add_note" }
  | { kind: "manual_record" }
  | { kind: "focus_picker" }
  | { kind: "focus_conflict" }
  | { kind: "delete_space" };

type DrawerState =
  | { kind: "none" }
  | { kind: "task"; taskId: string }
  | { kind: "session"; sessionId: string }
  | { kind: "note"; noteId: string }
  | { kind: "ai" }
  | { kind: "settings" };

function readTabFromUrl(): SpaceTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return SPACE_TABS.includes(value as SpaceTab) ? (value as SpaceTab) : "overview";
}

export function SpaceDetailView({
  space,
  tasks,
  projects,
  paths,
  onUpdatePath,
  onUpdateMilestone,
  onCreateGoal,
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
  // Notes popup/split-view spec (§4): panel mode + selection + fullscreen are
  // separate so fullscreen only changes presentation, never edit state.
  const [notesPanelMode, setNotesPanelMode] = useState<NotesPanelMode>("split");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isNotesSplitFullscreen, setIsNotesSplitFullscreen] = useState(false);
  const [aiSummary, setAiSummary] = useState<{ state: "idle" | "loading" | "ready" | "error"; text: string; tips: string[] }>({
    state: "idle",
    text: "",
    tips: [],
  });

  const today = todayValue();
  const weekStart = getWeekStart(today);
  const config = hub.getConfig(space.id);
  const hubType = (["project", "personal", "custom"].includes(space.type) ? space.type : "custom") as SpaceHubType;
  const preset = getSpacePreset(hubType);
  const groups = resolveTaskGroups(preset, config);
  const visibleGroups = groups.filter((group) => !group.hidden);

  const displayName = config.nameOverride || space.name;
  const displayDescription = config.descriptionOverride || space.description || preset.headerSubtitle;
  const displayColor = config.colorOverride || space.color;

  const sourceProjectId = space.sourceRef === "project" ? space.sourceId : undefined;
  const spaceTasks = useMemo(() => getSpaceTasks(tasks, space.id, sourceProjectId), [tasks, space.id, sourceProjectId]);
  const spaceSessions = useMemo(
    () => getSpaceSessions(focusSessions, spaceTasks, sourceProjectId),
    [focusSessions, spaceTasks, sourceProjectId],
  );
  const spaceNotes = useMemo(
    () =>
      hub.notes
        .filter((note) => note.spaceId === space.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [hub.notes, space.id],
  );
  const activities = useMemo(
    () => deriveSpaceActivities(space.id, spaceTasks, spaceSessions, spaceNotes, hub.activities, t),
    [space.id, spaceTasks, spaceSessions, spaceNotes, hub.activities, t],
  );

  const counts = getSpaceTaskCounts(spaceTasks, today);
  const nextAction = getNextActionTask(spaceTasks, config, today);
  const signal = getSpaceSignal(hubType, spaceTasks, spaceSessions, t, today);
  const todayFocusSeconds = getTodaySpaceFocusSeconds(spaceSessions, today);
  const weekFocusSeconds = getWeekSpaceFocusSeconds(spaceSessions, weekStart);
  const upcoming = getUpcomingSpaceItems(spaceTasks, today);
  const recentSessions = getRecentSpaceFocusSessions(spaceSessions, 3);
  // Tab <-> URL query sync (§3.2): pushState on change, restore on popstate.
  function setTab(next: SpaceTab) {
    if (next === tab) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
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
      // The quick note popup owns ESC (save/discard rules) via a capture listener.
      if (modal.kind === "add_note") return;
      if (modal.kind !== "none") setModal({ kind: "none" });
      else if (drawer.kind !== "none") setDrawer({ kind: "none" });
      // Notes spec §20.4: fullscreen exits first, then split falls back to home.
      else if (isNotesSplitFullscreen) setIsNotesSplitFullscreen(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [modal.kind, drawer.kind, isNotesSplitFullscreen, tab, notesPanelMode]);

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

  // === Notes popup + split view handlers (NOTES_POPUP_SPLIT spec) ===

  function openNoteInSplit(noteId: string) {
    if (tab !== "notes") setTab("notes");
    setSelectedNoteId(noteId);
    setNotesPanelMode("split");
  }

  function closeNotesSplit() {
    setNotesPanelMode("split");
    setSelectedNoteId(null);
    setIsNotesSplitFullscreen(false);
  }

  function handleQuickNoteCreate(draft: { title: string; body: string }): string {
    return hub.addNote(space.id, { title: draft.title, body: draft.body, type: "Quick Note" });
  }

  function handleQuickNoteClose(savedNoteId: string | null) {
    setModal({ kind: "none" });
    if (savedNoteId) showToast({ message: t("spaceHub.toast.noteAdded") });
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

  // AI summary is generated only on explicit user action (§2.3) and is
  // computed locally from current space data.
  function handleGenerateAiSummary() {
    setAiSummary({ state: "loading", text: "", tips: [] });
    window.setTimeout(() => {
      const tips: string[] = [];
      if (counts.overdue > 0) tips.push(t("spaceHub.tip.overdue", { n: counts.overdue }));
      if (upcoming[0]) tips.push(t("spaceHub.tip.prepare", { title: upcoming[0].title, date: formatDate(upcoming[0].when) }));
      if (tips.length === 0) tips.push(t("spaceHub.tip.onTrack"));
      setAiSummary({
        state: "ready",
        text: t("spaceHub.aiSummary.text", {
          label: signal.label,
          detail: signal.detail,
          focus: formatSeconds(weekFocusSeconds),
          open: counts.open,
          overdue: counts.overdue,
        }),
        tips,
      });
    }, 500);
  }

  function handleGenerateNextAction() {
    const candidate = getNextActionTask(spaceTasks, { ...config, pinnedNextActionTaskId: undefined }, today);
    if (!candidate) {
      showToast({ message: t("spaceHub.toast.noRecommend") });
      return;
    }
    handlePinNextAction(candidate.id);
  }

  function handleManualRecord(input: { title: string; description: string }) {
    hub.addActivity(space.id, { type: "manual_record", title: input.title, description: input.description });
    showToast({ message: t("spaceHub.toast.recordAdded") });
    setModal({ kind: "none" });
  }

  function handleSaveSettings(input: {
    name: string;
    description: string;
    color: string;
    groups: typeof groups;
    overviewCards: typeof config.overviewCards;
    defaults: typeof config.defaults;
  }) {
    hub.updateConfig(space.id, {
      nameOverride: input.name !== space.name ? input.name : undefined,
      descriptionOverride: input.description !== space.description ? input.description : undefined,
      colorOverride: input.color !== space.color ? input.color : undefined,
      sectionGroups: input.groups,
      overviewCards: input.overviewCards,
      defaults: input.defaults,
    });
    if (sourceProjectId) {
      onUpdateProject(sourceProjectId, { name: input.name, description: input.description });
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
  const drawerNote = drawer.kind === "note" ? spaceNotes.find((note) => note.id === drawer.noteId) ?? null : null;

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
          <button type="button" className="sdv-btn" onClick={() => setModal({ kind: "add_note" })}>
            {presetText(t, preset.addNoteLabel)}
          </button>
          <button type="button" className="sdv-btn sdv-btn-primary" onClick={() => handleStartFocus()}>
            {presetText(t, preset.startFocusLabel)}
          </button>
          <span className={`sdv-status-pill sdv-status-${signal.status}`}>{signal.label}</span>
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
            <div className="sdv-metric-actions">
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => setTab("records")}>
                {t("spaceHub.action.viewDetails")}
              </button>
            </div>
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
        {/* Where this board stands across time, before the task/activity
            cards answer "what is moving" (SPACES_BOARD_DESIGN.md D2). */}
        <SpaceHorizons
          boardId={space.sourceRef === "project" ? space.sourceId ?? "" : ""}
          paths={paths}
          tasks={tasks}
          projects={projects}
          onUpdatePath={onUpdatePath}
          onUpdateMilestone={onUpdateMilestone}
          onCreateGoal={onCreateGoal}
          onOpenTask={openTaskDrawer}
          onOpenHorizons={() => onNavigate("horizons")}
        />
        <SpaceOverviewTab
          preset={preset}
          spaceTasks={spaceTasks}
          activities={activities}
          recentSessions={recentSessions}
          spaceNotes={spaceNotes}
          aiSummary={aiSummary}
          onOpenTask={openTaskDrawer}
          onToggleDone={handleCompleteTask}
          onStartFocus={handleStartFocus}
          onAddTask={() => setModal({ kind: "add_task" })}
          onAddNote={() => setModal({ kind: "add_note" })}
          onOpenNote={(noteId) => setDrawer({ kind: "note", noteId })}
          onOpenNoteInSplit={openNoteInSplit}
          onOpenSession={(sessionId) => setDrawer({ kind: "session", sessionId })}
          onOpenTab={(next) => {
            // "View all" from the overview notes card lands on the notes Home list (§24.5).
            if (next === "notes") closeNotesSplit();
            setTab(next);
          }}
          onGenerateAiSummary={handleGenerateAiSummary}
          onGenerateNextAction={handleGenerateNextAction}
        />
        </>
      ) : null}
      {tab === "tasks" ? (
        <SpaceTasksTab
          preset={preset}
          groups={visibleGroups}
          spaceTasks={spaceTasks}
          onOpenTask={openTaskDrawer}
          onToggleDone={handleCompleteTask}
          onStartFocus={handleStartFocus}
          onAddTask={() => setModal({ kind: "add_task" })}
        />
      ) : null}
      {tab === "focus" ? (
        <SpaceFocusTab
          preset={preset}
          spaceTasks={spaceTasks}
          spaceSessions={spaceSessions}
          activeFocusSession={activeFocusSession}
          weeklyGoalSeconds={config.defaults.weeklyFocusGoalSeconds}
          onStartFocus={handleStartFocus}
          onOpenSession={(sessionId) => setDrawer({ kind: "session", sessionId })}
          onOpenFocusPage={() => onNavigate("focus")}
        />
      ) : null}
      {tab === "notes" ? (
        <SpaceNotesView
          preset={preset}
          notes={spaceNotes}
          mode={notesPanelMode}
          selectedNoteId={selectedNoteId}
          isFullscreen={isNotesSplitFullscreen}
          onSelectNote={(noteId) => {
            setSelectedNoteId(noteId);
            setNotesPanelMode("split");
          }}
          onCloseSplit={closeNotesSplit}
          onToggleFullscreen={() => setIsNotesSplitFullscreen((current) => !current)}
          onAddNote={() => setModal({ kind: "add_note" })}
          onUpdateNote={(noteId, patch) => hub.updateNote(noteId, patch)}
          onDeleteNote={(noteId) => {
            hub.deleteNote(noteId);
            showToast({ message: t("spaceHub.toast.noteDeleted") });
          }}
        />
      ) : null}
      {tab === "records" ? (
        <SpaceRecordsTab
          activities={activities}
          onAddManualRecord={() => setModal({ kind: "manual_record" })}
          onOpenTask={(taskId) => (spaceTasks.some((task) => task.id === taskId) ? openTaskDrawer(taskId) : undefined)}
          onOpenSession={(sessionId) => setDrawer({ kind: "session", sessionId })}
          onOpenNote={(noteId) => setDrawer({ kind: "note", noteId })}
        />
      ) : null}

      {/* Floating AI button (§26) */}
      <button type="button" className="sdv-floating-ai" aria-label={t("spaceHub.aria.aiAssistant")} onClick={() => setDrawer({ kind: "ai" })}>
        ✦
      </button>

      {/* Modals (§32) */}
      {modal.kind === "add_task" ? (
        <AddSpaceTaskModal
          preset={preset}
          groups={visibleGroups.map((group) => group.label)}
          onSubmit={handleCreateSpaceTask}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "add_note" ? (
        <NoteQuickCreateModal
          onCreate={handleQuickNoteCreate}
          onUpdate={(noteId, patch) => hub.updateNote(noteId, patch)}
          onDelete={(noteId) => hub.deleteNote(noteId)}
          onClose={handleQuickNoteClose}
          onOpenInSplit={(noteId) => {
            setModal({ kind: "none" });
            openNoteInSplit(noteId);
          }}
        />
      ) : null}
      {modal.kind === "manual_record" ? (
        <ManualRecordModal onSubmit={handleManualRecord} onClose={() => setModal({ kind: "none" })} />
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
          notes={spaceNotes.filter((note) => note.relatedTaskId === drawerTask.id)}
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
          onOpenNote={(noteId) => setDrawer({ kind: "note", noteId })}
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
      {drawerNote ? (
        <NoteDetailDrawer
          note={drawerNote}
          relatedTask={spaceTasks.find((task) => task.id === drawerNote.relatedTaskId) ?? null}
          onUpdate={(patch: Partial<SpaceNote>) => hub.updateNote(drawerNote.id, patch)}
          onDelete={() => {
            hub.deleteNote(drawerNote.id);
            setDrawer({ kind: "none" });
            showToast({ message: t("spaceHub.toast.noteDeleted") });
          }}
          onClose={() => setDrawer({ kind: "none" })}
        />
      ) : null}
      {drawer.kind === "ai" ? (
        <SpaceAiDrawer
          spaceName={displayName}
          signal={signal}
          counts={counts}
          nextAction={nextAction}
          upcoming={upcoming}
          weekFocusSeconds={weekFocusSeconds}
          onGenerateNextAction={handleGenerateNextAction}
          onClose={() => setDrawer({ kind: "none" })}
        />
      ) : null}
      {drawer.kind === "settings" ? (
        <SpaceSettingsDrawer
          name={displayName}
          description={displayDescription}
          color={displayColor}
          groups={groups}
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
