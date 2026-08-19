import { ReactNode, useState } from "react";
import { BoardPage } from "../components/BoardPage";
import { CalendarView } from "../components/CalendarView";
import { FocusPage } from "../components/FocusPage";
import { GoalDetailDrawer } from "../components/horizons/GoalDetailDrawer";
import { SpacesPage } from "../components/SpacesPage";
import { SettingsPage } from "../components/SettingsPage";
import { TodayPage, type TodayIntent } from "../components/TodayPage";
import type { ToastState } from "../components/kit";
import type { usePlannerData } from "../hooks/usePlannerData";
import type { CalendarShareState } from "../lib/calendarShare";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import type { KnowledgeSettings } from "../lib/knowledge/types";
import type { AppUpdateStatus } from "../platform";
import type { AppSettings, ExternalCalendar, ExternalCalendarEvent, PageId, Project, Task } from "../types";

type Planner = ReturnType<typeof usePlannerData>;

type AppPagesProps = {
  activePage: PageId;
  /**
   * The Tasks the user can see (audit D-24 axis 2, P0-4b-5).
   *
   * `planner.tasks` is still here and still the whole set. The difference is
   * the question being asked: this one is for screens that DRAW or OFFER
   * tasks, and it has already dropped the ones whose owning List was archived
   * or deleted. Lookups — a goal's linked task, an export — want the full set,
   * because a hidden Task has not stopped existing.
   */
  visibleTasks: Task[];
  planner: Planner;
  appSettings: AppSettings;
  activeProjects: Project[];
  selectedProjectId: string;
  /** What the tree selected, as a view scope (§16). */
  viewScope: { spaceId?: string; projectId?: string; folderId?: string; listId?: string };
  onClearScope: () => void;
  onSelectList: (listId: string) => void;
  onSelectSpace: (spaceId: string) => void;
  isProjectDetailOpen: boolean;
  onCloseSpace: () => void;
  todayIntent: TodayIntent;
  onTodayIntentHandled: () => void;
  renderTaskDetail: () => ReactNode;
  showToast: (toast: ToastState) => void;
  handleArchiveTask: (taskId: string) => void;
  handleArchiveTasks: (taskIds: string[]) => void;
  handleArchiveProject: (projectId: string) => void;
  requestDeleteTask: (taskId: string) => void;
  requestDeleteProject: (projectId: string) => void;
  // Immediate delete for flows that already confirmed (space delete modal).
  deleteProjectNow: (projectId: string) => void;
  openProjectFromCalendar: (projectId: string) => void;
  viewTaskInCalendar: (taskId: string) => void;
  openCalendarForProject: (projectId?: string) => void;
  calendarFocusProjectId: string;
  onNavigate: (page: PageId) => void;
  exportJson: () => void;
  handleImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importMessage: string;
  appVersion: string;
  updateStatus: AppUpdateStatus | { status: "checking" } | { status: "installing"; latestVersion?: string };
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  requestResetAllData: () => void;
  focusSettings: FocusUserSettings;
  onUpdateFocusSettings: (patch: Partial<FocusUserSettings>) => void;
  onStopFocus: (sessionId: string, completeTask?: boolean) => void;
  externalCalendars: ExternalCalendar[];
  externalCalendarEvents: ExternalCalendarEvent[];
  onAddExternalCalendar: (input: { name: string; icsUrl: string; color: string }) => void;
  onUpdateExternalCalendar: (calendarId: string, patch: Partial<ExternalCalendar>) => void;
  onDeleteExternalCalendar: (calendarId: string) => void;
  onSyncExternalCalendar: (calendarId: string) => void;
  onSyncAllExternalCalendars: () => void;
  calendarShare: CalendarShareState;
  onEnableCalendarShare: () => void;
  onDisableCalendarShare: () => void;
  onRegenerateCalendarShare: () => void;
  onPublishCalendarShare: () => void;
  knowledgeSettings: KnowledgeSettings;
  onUpdateKnowledgeSettings: (patch: Partial<KnowledgeSettings>) => void;
  isKnowledgeDesktop: boolean;
  accountSlot: ReactNode;
};

export function AppPages({
  activePage,
  planner,
  visibleTasks,
  appSettings,
  activeProjects,
  selectedProjectId,
  viewScope,
  onClearScope,
  onSelectList,
  onSelectSpace,
  isProjectDetailOpen,
  onCloseSpace,
  todayIntent,
  onTodayIntentHandled,
  renderTaskDetail,
  showToast,
  handleArchiveTask,
  handleArchiveTasks,
  handleArchiveProject,
  requestDeleteTask,
  requestDeleteProject,
  deleteProjectNow,
  openProjectFromCalendar,
  viewTaskInCalendar,
  openCalendarForProject,
  calendarFocusProjectId,
  onNavigate,
  exportJson,
  handleImport,
  importMessage,
  appVersion,
  updateStatus,
  onCheckUpdate,
  onInstallUpdate,
  requestResetAllData,
  focusSettings,
  onUpdateFocusSettings,
  onStopFocus,
  externalCalendars,
  externalCalendarEvents,
  onAddExternalCalendar,
  onUpdateExternalCalendar,
  onDeleteExternalCalendar,
  onSyncExternalCalendar,
  onSyncAllExternalCalendars,
  calendarShare,
  onEnableCalendarShare,
  onDisableCalendarShare,
  onRegenerateCalendarShare,
  onPublishCalendarShare,
  knowledgeSettings,
  onUpdateKnowledgeSettings,
  isKnowledgeDesktop,
  accountSlot,
}: AppPagesProps) {
  const [selectedGoal, setSelectedGoal] = useState<{ pathId: string; milestoneId?: string } | null>(null);
  const selectedGoalPath = selectedGoal
    ? planner.learningPaths.find((path) => path.id === selectedGoal.pathId) ?? null
    : null;

  function openGoal(pathId: string, milestoneId?: string) {
    planner.selectTask("");
    setSelectedGoal({ pathId, milestoneId });
  }

  function openTaskFromGoal(taskId: string) {
    setSelectedGoal(null);
    planner.selectTask(taskId);
  }

  const goalDrawer = selectedGoalPath ? (
    <GoalDetailDrawer
      path={selectedGoalPath}
      initialMilestoneId={selectedGoal?.milestoneId}
      projects={activeProjects}
      tasks={planner.tasks}
      onClose={() => setSelectedGoal(null)}
      onUpdatePath={planner.updateLearningPath}
      onDeletePath={planner.deleteLearningPath}
      onAddMilestone={planner.addMilestone}
      onUpdateMilestone={planner.updateMilestone}
      onDeleteMilestone={planner.deleteMilestone}
      onCreateTaskFromMilestone={planner.createTaskFromMilestone}
      onOpenTask={openTaskFromGoal}
    />
  ) : null;

  function pageGridClass(extra = "") {
    const base = planner.selectedTask ? "page-grid" : "page-grid no-detail";
    return extra ? `${base} ${extra}` : base;
  }

  if (activePage === "today") {
    // Today has no side-by-side task-detail panel — the grid always uses the
    // full-width (no-detail) layout. Clicking a task instead opens the
    // shared TaskDetail as a right-side overlay drawer.
    return (
      <section className="page-grid no-detail tdy-grid">
        <TodayPage
          tasks={visibleTasks}
          projects={activeProjects}
          dailyPlans={planner.dailyPlans}
          lists={planner.lists}
          onSetBuckets={planner.setTodayBuckets}
          onOpenTask={planner.selectTask}
          onToggleDone={planner.toggleTaskDone}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onArchiveTasks={handleArchiveTasks}
          onNavigate={onNavigate}
          onScheduleInCalendar={viewTaskInCalendar}
          showCompleted={appSettings.showCompletedInToday}
          onToggleShowCompleted={() =>
            planner.updateAppSettings({ showCompletedInToday: !appSettings.showCompletedInToday })
          }
          intent={todayIntent}
          onIntentHandled={onTodayIntentHandled}
          showToast={showToast}
        />
        {planner.selectedTask ? (
          <div className="tdy-detail-overlay" onClick={() => planner.selectTask("")}>
            <div className="tdy-detail-drawer" onClick={(event) => event.stopPropagation()}>
              {renderTaskDetail()}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (activePage === "board") {
    return (
      <section className={pageGridClass()}>
        <BoardPage
          tasks={visibleTasks}
          projects={planner.projects}
          lists={planner.lists}
          learningPaths={planner.learningPaths}
          selectedTaskId={planner.selectedTask?.id ?? ""}
          onOpenTask={planner.selectTask}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onUpdatePath={planner.updateLearningPath}
          onMoveGoalToStatus={planner.moveGoalToStatus}
          showToast={showToast}
        />
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "calendar") {
    return (
      <section className="gcal-page-shell">
        <CalendarView
          tasks={visibleTasks}
          projects={activeProjects}
              externalCalendars={externalCalendars}
          externalCalendarEvents={externalCalendarEvents}
          focusSessions={planner.focusSessions}
          onUpdateExternalCalendar={onUpdateExternalCalendar}
          onUpdateProject={planner.updateProject}
            initialProjectId={calendarFocusProjectId}
          onUpdateTask={planner.updateTask}
          onUpdateTaskSchedule={planner.updateTaskSchedule}
          onCreateTask={planner.createTask}
          onDeleteTask={requestDeleteTask}
          onOpenProject={openProjectFromCalendar}
          onClearTaskSelection={() => planner.selectTask("")}
          showToast={showToast}
        />
      </section>
    );
  }

  if (activePage === "focus") {
    return (
      <FocusPage
        tasks={visibleTasks}
        projects={activeProjects}
        focusSessions={planner.focusSessions}
        activeSession={planner.activeFocusSession}
        settings={focusSettings}
        onUpdateSettings={onUpdateFocusSettings}
        onStartFocus={planner.startFocusSession}
        onPauseFocus={planner.pauseFocusSession}
        onResumeFocus={planner.resumeFocusSession}
        onStopFocus={onStopFocus}
        onDeleteFocusSession={planner.deleteFocusSession}
        onUpdateFocusNote={planner.updateFocusSessionNote}
        onCompleteTask={planner.completeTask}
        onOpenTask={planner.selectTask}
        onNavigate={onNavigate}
      />
    );
  }

  if (activePage === "projects") {
    return (
      <>
      <SpacesPage
        onRestoreProject={planner.restoreProject}
        onDeleteProject={requestDeleteProject}
        projects={planner.projects}
        tasks={visibleTasks}
        lists={planner.lists}
        paths={planner.learningPaths}
        onUpdatePath={planner.updateLearningPath}
        onUpdateMilestone={planner.updateMilestone}
        onCreateGoal={planner.createLearningPath}
        onOpenGoal={openGoal}
        onCreateStatus={planner.createStatus}
        onUpdateStatus={planner.updateStatus}
        onArchiveStatus={planner.archiveStatus}
        spaces={planner.spaces}
        onMoveGoalToStatus={planner.moveGoalToStatus}
        onDeletePath={planner.deleteLearningPath}
        onAddMilestone={planner.addMilestone}
        onDeleteMilestone={planner.deleteMilestone}
        onCreateTaskFromMilestone={planner.createTaskFromMilestone}
        focusSessions={planner.focusSessions}
        activeFocusSession={planner.activeFocusSession}
        onCompleteTask={planner.completeTask}
        onArchiveTask={handleArchiveTask}
        onStartFocus={planner.startFocusSession}
        onNavigate={onNavigate}
        onOpenCalendar={openCalendarForProject}
        selectedProjectId={selectedProjectId}
        detailOpen={isProjectDetailOpen}
        viewScope={viewScope}
        folders={planner.folders}
        onClearScope={onClearScope}
        onSelectList={onSelectList}
        onOpenProject={onSelectSpace}
        onOpenTask={planner.selectTask}
        onToggleDone={planner.toggleTaskDone}
        onUpdateTask={planner.updateTask}
        onUpdateTaskSchedule={planner.updateTaskSchedule}
        onCreateTask={planner.createTask}
        onUpdateProject={planner.updateProject}
        onRequestDeleteProject={deleteProjectNow}
        showToast={showToast}
      />
      {goalDrawer}
      {planner.selectedTask ? (
        <div className="tdy-detail-overlay" onClick={() => planner.selectTask("")}>
          <div className="tdy-detail-drawer" onClick={(event) => event.stopPropagation()}>{renderTaskDetail()}</div>
        </div>
      ) : null}
      </>
    );
  }

  return (
    <SettingsPage
      settings={appSettings}
      onUpdate={planner.updateAppSettings}
      onExport={exportJson}
      onImport={handleImport}
      onReset={requestResetAllData}
      importMessage={importMessage}
      appVersion={appVersion}
      updateStatus={updateStatus}
      onCheckUpdate={onCheckUpdate}
      onInstallUpdate={onInstallUpdate}
      accountSlot={accountSlot}
      tasks={planner.tasks}
      onUpdateTask={planner.updateTask}
      projects={planner.projects}
      onUpdateProject={planner.updateProject}
      externalCalendars={externalCalendars}
      onAddExternalCalendar={onAddExternalCalendar}
      onUpdateExternalCalendar={onUpdateExternalCalendar}
      onDeleteExternalCalendar={onDeleteExternalCalendar}
      onSyncExternalCalendar={onSyncExternalCalendar}
      onSyncAllExternalCalendars={onSyncAllExternalCalendars}
      calendarShare={calendarShare}
      onEnableCalendarShare={onEnableCalendarShare}
      onDisableCalendarShare={onDisableCalendarShare}
      onRegenerateCalendarShare={onRegenerateCalendarShare}
      onPublishCalendarShare={onPublishCalendarShare}
      knowledgeSettings={knowledgeSettings}
      onUpdateKnowledgeSettings={onUpdateKnowledgeSettings}
      isKnowledgeDesktop={isKnowledgeDesktop}
    />
  );
}
