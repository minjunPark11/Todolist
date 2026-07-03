import { useEffect, useMemo, useState } from "react";
import type { ConceptNote, FocusSession, Project, Task, TaskDraft } from "../../types";
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
import {
  deriveSpaceActivities,
  formatSeconds,
  getNextActionTask,
  getRecentSpaceFocusSessions,
  getSpaceCalendarItems,
  getSpaceSignal,
  getSpaceTaskCounts,
  getSpaceTasks,
  getSpaceSessions,
  getTodaySpaceFocusSeconds,
  getUpcomingSpaceItems,
  getWeekSpaceFocusSeconds,
  isTaskUnscheduled,
  spaceTaskTag,
} from "../../lib/spaceSelectors";
import { useSpaceHubData } from "../../hooks/useSpaceHubData";
import { addDays, formatDate, getWeekStart, todayValue } from "../../utils/date";
import { SpaceOverviewTab } from "./SpaceOverviewTab";
import { SpaceCalendarTab, SpaceFocusTab, SpaceTasksTab } from "./SpaceWorkTabs";
import { SpaceNotesTab, SpaceRecordsTab } from "./SpaceNotesRecordsTabs";
import {
  AddSpaceNoteModal,
  AddSpaceTaskModal,
  DeleteSpaceConfirmModal,
  FocusConflictModal,
  FocusStartPickerModal,
  ManualRecordModal,
  ScheduleSpaceTaskModal,
  ScheduleSuggestionModal,
  type ScheduleInput,
  type ScheduleSuggestion,
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
  conceptNotes: ConceptNote[];
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
  showToast: (toast: ToastState) => void;
};

type ModalState =
  | { kind: "none" }
  | { kind: "add_task" }
  | { kind: "add_note" }
  | { kind: "schedule"; taskId: string }
  | { kind: "manual_record" }
  | { kind: "focus_picker" }
  | { kind: "focus_conflict" }
  | { kind: "delete_space" }
  | { kind: "ai_schedule_preview"; suggestions: ScheduleSuggestion[] };

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
  conceptNotes,
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
  showToast,
}: SpaceDetailViewProps) {
  const hub = useSpaceHubData();
  const [tab, setTabState] = useState<SpaceTab>(readTabFromUrl);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "none" });
  const [aiSummary, setAiSummary] = useState<{ state: "idle" | "loading" | "ready" | "error"; text: string; tips: string[] }>({
    state: "idle",
    text: "",
    tips: [],
  });

  const today = todayValue();
  const weekStart = getWeekStart(today);
  const config = hub.getConfig(space.id);
  const hubType = (["project", "study", "research", "personal", "custom"].includes(space.type) ? space.type : "custom") as SpaceHubType;
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
  const reviewNotes = useMemo(
    () => (space.sourceRef === "study" ? conceptNotes.filter((note) => note.topicId === space.sourceId && !note.deletedAt) : []),
    [conceptNotes, space.sourceRef, space.sourceId],
  );
  const spaceNotes = useMemo(
    () =>
      hub.notes
        .filter((note) => note.spaceId === space.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [hub.notes, space.id],
  );
  const activities = useMemo(
    () => deriveSpaceActivities(space.id, spaceTasks, spaceSessions, spaceNotes, hub.activities),
    [space.id, spaceTasks, spaceSessions, spaceNotes, hub.activities],
  );

  const counts = getSpaceTaskCounts(spaceTasks, today);
  const nextAction = getNextActionTask(spaceTasks, config, today);
  const signal = getSpaceSignal(hubType, spaceTasks, spaceSessions, reviewNotes, today);
  const todayFocusSeconds = getTodaySpaceFocusSeconds(spaceSessions, today);
  const weekFocusSeconds = getWeekSpaceFocusSeconds(spaceSessions, weekStart);
  const upcoming = getUpcomingSpaceItems(spaceTasks, reviewNotes, today);
  const weekCalendarItems = getSpaceCalendarItems(spaceTasks, reviewNotes, weekStart, addDays(weekStart, 6));
  const recentSessions = getRecentSpaceFocusSessions(spaceSessions, 3);
  const unscheduledTasks = spaceTasks.filter(isTaskUnscheduled);

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
      if (modal.kind !== "none") setModal({ kind: "none" });
      else if (drawer.kind !== "none") setDrawer({ kind: "none" });
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [modal.kind, drawer.kind]);

  // === Handlers (§31) ===

  function handleCreateSpaceTask(input: SpaceTaskInput) {
    const tags: string[] = [];
    if (!sourceProjectId) tags.push(spaceTaskTag(space.id));
    if (input.group) tags.push(`group:${input.group}`);
    if (input.durationMinutes) tags.push(`est:${input.durationMinutes}`);
    onCreateTask({
      title: input.title,
      status: "todo",
      priority: input.priority,
      dueDate: input.dueDate,
      notes: input.notes,
      projectId: sourceProjectId ?? "",
      tags,
    });
    showToast({ message: `Task added to ${displayName}.` });
    setModal({ kind: "none" });
  }

  function handleCreateSpaceNote(input: Parameters<typeof hub.addNote>[1]) {
    hub.addNote(space.id, input);
    showToast({ message: "Note added." });
    setModal({ kind: "none" });
  }

  function handleScheduleTask(taskId: string, input: ScheduleInput) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    onUpdateTask(taskId, {
      scheduledDate: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      status: task.status === "inbox" ? "todo" : task.status,
    });
    hub.addActivity(space.id, {
      type: "task_scheduled",
      title: `Task scheduled: ${task.title}`,
      description: `${formatDate(input.date)} ${input.startTime}`,
      relatedTaskId: taskId,
    });
    showToast({ message: "Task scheduled." });
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
    showToast({ message: "Focus started." });
    setModal({ kind: "none" });
  }

  function handleCompleteTask(taskId: string) {
    onCompleteTask(taskId);
    showToast({ message: "Task completed." });
  }

  function handlePinNextAction(taskId: string) {
    hub.updateConfig(space.id, { pinnedNextActionTaskId: taskId });
    showToast({ message: "Pinned as next action." });
  }

  // AI summary is generated only on explicit user action (§2.3) and is
  // computed locally from current space data.
  function handleGenerateAiSummary() {
    setAiSummary({ state: "loading", text: "", tips: [] });
    window.setTimeout(() => {
      const tips: string[] = [];
      if (counts.overdue > 0) tips.push(`Handle ${counts.overdue} overdue task${counts.overdue > 1 ? "s" : ""} first.`);
      if (unscheduledTasks.length > 0) tips.push(`Place ${Math.min(unscheduledTasks.length, 3)} unscheduled tasks on the calendar.`);
      if (weekFocusSeconds < config.defaults.weeklyFocusGoalSeconds / 2)
        tips.push(`Reserve a ${config.defaults.defaultDurationMinutes}m focus block today to stay on the weekly goal.`);
      if (upcoming[0]) tips.push(`Prepare for "${upcoming[0].title}" (${formatDate(upcoming[0].when)}).`);
      if (tips.length === 0) tips.push("Everything looks on track. Keep the current rhythm.");
      setAiSummary({
        state: "ready",
        text: `${signal.label}: ${signal.detail}. This week ${formatSeconds(weekFocusSeconds)} focused, ${counts.open} open tasks (${counts.unscheduled} unscheduled, ${counts.overdue} overdue).`,
        tips,
      });
    }, 500);
  }

  function buildScheduleSuggestions(): ScheduleSuggestion[] {
    // Naive placement preview: spread unscheduled tasks from 14:00 today.
    let hour = 14;
    return unscheduledTasks.slice(0, 3).map((task) => {
      const est = Number(task.tags.find((tag) => tag.startsWith("est:"))?.slice(4)) || config.defaults.defaultDurationMinutes;
      const startTime = `${String(hour).padStart(2, "0")}:00`;
      const endMinutes = hour * 60 + est;
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
      hour = Math.floor(endMinutes / 60) + 1;
      return { taskId: task.id, title: task.title, date: today, startTime, endTime };
    });
  }

  function handleAiSuggestSchedule() {
    const suggestions = buildScheduleSuggestions();
    if (suggestions.length === 0) {
      showToast({ message: "No unscheduled tasks to place." });
      return;
    }
    setModal({ kind: "ai_schedule_preview", suggestions });
  }

  function handleApplyAiSchedule(suggestions: ScheduleSuggestion[]) {
    for (const suggestion of suggestions) {
      const task = tasks.find((item) => item.id === suggestion.taskId);
      if (!task) continue;
      onUpdateTask(suggestion.taskId, {
        scheduledDate: suggestion.date,
        startTime: suggestion.startTime,
        endTime: suggestion.endTime,
        status: task.status === "inbox" ? "todo" : task.status,
      });
    }
    hub.addActivity(space.id, {
      type: "ai_suggestion_applied",
      title: `AI schedule applied: ${suggestions.length} task${suggestions.length > 1 ? "s" : ""} placed`,
      description: suggestions.map((item) => item.title).join(", "),
    });
    showToast({ message: `${suggestions.length} tasks scheduled.` });
    setModal({ kind: "none" });
  }

  function handleGenerateNextAction() {
    const candidate = getNextActionTask(spaceTasks, { ...config, pinnedNextActionTaskId: undefined }, today);
    if (!candidate) {
      showToast({ message: "No open tasks to recommend." });
      return;
    }
    handlePinNextAction(candidate.id);
  }

  function handleManualRecord(input: { title: string; description: string }) {
    hub.addActivity(space.id, { type: "manual_record", title: input.title, description: input.description });
    showToast({ message: "Record added." });
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
    showToast({ message: "Space settings saved." });
    setDrawer({ kind: "none" });
  }

  function handleDeleteSpace() {
    setModal({ kind: "none" });
    setDrawer({ kind: "none" });
    onDeleteSpace();
  }

  const openTaskDrawer = (taskId: string) => setDrawer({ kind: "task", taskId });
  const openScheduleModal = (taskId: string) => setModal({ kind: "schedule", taskId });
  const drawerTask = drawer.kind === "task" ? spaceTasks.find((task) => task.id === drawer.taskId) ?? null : null;
  const drawerSession = drawer.kind === "session" ? spaceSessions.find((session) => session.id === drawer.sessionId) ?? null : null;
  const drawerNote = drawer.kind === "note" ? spaceNotes.find((note) => note.id === drawer.noteId) ?? null : null;

  const estOf = (task: Task) =>
    Number(task.tags.find((tag) => tag.startsWith("est:"))?.slice(4)) || config.defaults.defaultDurationMinutes;

  return (
    <div className="sdv-page" style={{ ["--sdv-accent" as string]: displayColor }}>
      <button type="button" className="sdv-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to Spaces
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
              {preset.headerSubtitle === displayDescription ? displayDescription : `${capitalize(hubType)} Space · ${displayDescription}`}
            </p>
            <p className="sdv-header-counts">
              {counts.total} tasks · {counts.scheduled} scheduled ·{" "}
              <span className={counts.overdue > 0 ? "sdv-overdue" : ""}>{counts.overdue} overdue</span>
            </p>
          </div>
        </div>
        <div className="sdv-header-actions">
          <button type="button" className="sdv-btn" onClick={() => setModal({ kind: "add_task" })}>
            {preset.addTaskLabel}
          </button>
          <button type="button" className="sdv-btn" onClick={() => setModal({ kind: "add_note" })}>
            {preset.addNoteLabel}
          </button>
          <button
            type="button"
            className="sdv-btn"
            onClick={() => {
              const target = unscheduledTasks[0];
              if (target) openScheduleModal(target.id);
              else showToast({ message: "No unscheduled tasks in this Space." });
            }}
          >
            {preset.scheduleLabel}
          </button>
          <button type="button" className="sdv-btn sdv-btn-primary" onClick={() => handleStartFocus()}>
            {preset.startFocusLabel}
          </button>
          <span className={`sdv-status-pill sdv-status-${signal.status}`}>{signal.label}</span>
          <button
            type="button"
            className="sdv-btn sdv-btn-icon"
            aria-label="Space settings"
            onClick={() => setDrawer({ kind: "settings" })}
          >
            ⋯
          </button>
        </div>
      </header>

      {/* Overview metric cards (§8-12) */}
      <section className="sdv-metric-grid" aria-label="Space overview cards">
        {config.overviewCards.nextAction ? (
          <article className="sdv-metric-card">
            <h3>{preset.nextActionLabel}</h3>
            {nextAction ? (
              <>
                <strong className="sdv-metric-title">{nextAction.title}</strong>
                <small>
                  {estOf(nextAction)}m estimated
                  {nextAction.dueDate ? ` · due ${formatDate(nextAction.dueDate)}` : ""}
                </small>
                <div className="sdv-metric-actions">
                  <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={() => handleStartFocus(nextAction.id)}>
                    {preset.startFocusLabel}
                  </button>
                  <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => openScheduleModal(nextAction.id)}>
                    Schedule
                  </button>
                </div>
              </>
            ) : (
              <p className="sdv-empty-inline">No open tasks. Add the first one.</p>
            )}
          </article>
        ) : null}
        {config.overviewCards.signal ? (
          <article className="sdv-metric-card">
            <h3>{preset.signalLabel}</h3>
            <strong className={`sdv-metric-title sdv-signal-${signal.status}`}>{signal.label}</strong>
            <small>{signal.detail}</small>
            <div className="sdv-metric-actions">
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => setTab("records")}>
                View details
              </button>
            </div>
          </article>
        ) : null}
        {config.overviewCards.focusTime ? (
          <article className="sdv-metric-card">
            <h3>{preset.focusTimeLabel}</h3>
            <strong className="sdv-metric-title">{formatSeconds(weekFocusSeconds)} this week</strong>
            <small>
              Today {formatSeconds(todayFocusSeconds)} · goal{" "}
              {Math.min(100, Math.round((weekFocusSeconds / Math.max(config.defaults.weeklyFocusGoalSeconds, 1)) * 100))}% of{" "}
              {formatSeconds(config.defaults.weeklyFocusGoalSeconds)}
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
            <h3>{preset.upcomingLabel}</h3>
            {upcoming.length === 0 ? (
              <p className="sdv-empty-inline">Nothing coming up this week.</p>
            ) : (
              <ul className="sdv-upcoming-list">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <span className={`sdv-upcoming-kind sdv-kind-${item.kind}`}>{item.kind}</span>
                    <span className="sdv-upcoming-title">{item.title}</span>
                    <small>{formatDate(item.when)}</small>
                  </li>
                ))}
              </ul>
            )}
            <div className="sdv-metric-actions">
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => setTab("calendar")}>
                Open calendar
              </button>
            </div>
          </article>
        ) : null}
      </section>

      {/* Tab navigation (§13) */}
      <nav className="sdv-tab-nav" role="tablist" aria-label="Space sections">
        {SPACE_TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {capitalize(item)}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <SpaceOverviewTab
          preset={preset}
          spaceTasks={spaceTasks}
          activities={activities}
          calendarItems={weekCalendarItems}
          recentSessions={recentSessions}
          spaceNotes={spaceNotes}
          aiSummary={aiSummary}
          estOf={estOf}
          onOpenTask={openTaskDrawer}
          onToggleDone={handleCompleteTask}
          onStartFocus={handleStartFocus}
          onSchedule={openScheduleModal}
          onAddTask={() => setModal({ kind: "add_task" })}
          onAddNote={() => setModal({ kind: "add_note" })}
          onOpenNote={(noteId) => setDrawer({ kind: "note", noteId })}
          onOpenSession={(sessionId) => setDrawer({ kind: "session", sessionId })}
          onOpenFullCalendar={() => onNavigate("calendar")}
          onOpenTab={setTab}
          onGenerateAiSummary={handleGenerateAiSummary}
          onAiSuggestSchedule={handleAiSuggestSchedule}
          onGenerateNextAction={handleGenerateNextAction}
        />
      ) : null}
      {tab === "tasks" ? (
        <SpaceTasksTab
          preset={preset}
          groups={visibleGroups}
          spaceTasks={spaceTasks}
          estOf={estOf}
          onOpenTask={openTaskDrawer}
          onToggleDone={handleCompleteTask}
          onStartFocus={handleStartFocus}
          onSchedule={openScheduleModal}
          onAddTask={() => setModal({ kind: "add_task" })}
        />
      ) : null}
      {tab === "calendar" ? (
        <SpaceCalendarTab
          spaceTasks={spaceTasks}
          reviewNotes={reviewNotes}
          onOpenTask={openTaskDrawer}
          onSchedule={openScheduleModal}
          onOpenFullCalendar={() => onNavigate("calendar")}
        />
      ) : null}
      {tab === "focus" ? (
        <SpaceFocusTab
          preset={preset}
          spaceTasks={spaceTasks}
          spaceSessions={spaceSessions}
          activeFocusSession={activeFocusSession}
          weeklyGoalSeconds={config.defaults.weeklyFocusGoalSeconds}
          estOf={estOf}
          onStartFocus={handleStartFocus}
          onOpenSession={(sessionId) => setDrawer({ kind: "session", sessionId })}
          onOpenFocusPage={() => onNavigate("focus")}
        />
      ) : null}
      {tab === "notes" ? (
        <SpaceNotesTab
          preset={preset}
          notes={spaceNotes}
          onAddNote={() => setModal({ kind: "add_note" })}
          onOpenNote={(noteId) => setDrawer({ kind: "note", noteId })}
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
      <button type="button" className="sdv-floating-ai" aria-label="Open Space AI assistant" onClick={() => setDrawer({ kind: "ai" })}>
        ✦
      </button>

      {/* Modals (§32) */}
      {modal.kind === "add_task" ? (
        <AddSpaceTaskModal
          preset={preset}
          groups={visibleGroups.map((group) => group.label)}
          defaultDuration={config.defaults.defaultDurationMinutes}
          onSubmit={handleCreateSpaceTask}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "add_note" ? (
        <AddSpaceNoteModal
          preset={preset}
          spaceTasks={spaceTasks}
          onSubmit={handleCreateSpaceNote}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "schedule" ? (
        <ScheduleSpaceTaskModal
          taskId={modal.taskId}
          spaceTasks={spaceTasks}
          defaultDuration={config.defaults.defaultDurationMinutes}
          estOf={estOf}
          onSubmit={handleScheduleTask}
          onClose={() => setModal({ kind: "none" })}
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
      {modal.kind === "ai_schedule_preview" ? (
        <ScheduleSuggestionModal
          suggestions={modal.suggestions}
          onApply={handleApplyAiSchedule}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}

      {/* Drawers (§32.4-32.7, §28) */}
      {drawerTask ? (
        <TaskDetailDrawer
          task={drawerTask}
          projects={projects}
          sessions={spaceSessions.filter((session) => session.taskId === drawerTask.id)}
          notes={spaceNotes.filter((note) => note.relatedTaskId === drawerTask.id)}
          estMinutes={estOf(drawerTask)}
          isPinned={config.pinnedNextActionTaskId === drawerTask.id}
          onStartFocus={() => handleStartFocus(drawerTask.id)}
          onSchedule={() => openScheduleModal(drawerTask.id)}
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
            showToast({ message: "Note deleted." });
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
          onSuggestSchedule={() => {
            setDrawer({ kind: "none" });
            handleAiSuggestSchedule();
          }}
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
