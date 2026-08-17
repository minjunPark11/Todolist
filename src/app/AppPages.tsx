import { ReactNode, useState } from "react";
import { ArchivePage } from "../components/ArchivePage";
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
import type { AppSettings, ExternalCalendar, ExternalCalendarEvent, PageId, Project } from "../types";

type Planner = ReturnType<typeof usePlannerData>;

type AppPagesProps = {
  activePage: PageId;
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
          tasks={planner.tasks}
          projects={activeProjects}
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
          tasks={planner.tasks}
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

  if (activePage === "archive") {
    return (
      <section className={pageGridClass()}>
        <ArchivePage
          tasks={planner.tasks}
          projects={planner.projects}
          lists={planner.lists}
          learningPaths={planner.learningPaths}
          onOpenTask={planner.selectTask}
          onRestoreTask={planner.restoreTask}
          onRestoreProject={planner.restoreProject}
          onDeleteTask={requestDeleteTask}
          onDeleteProject={requestDeleteProject}
        />
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "calendar") {
    return (
      <section className="gcal-page-shell">
        <CalendarView
          tasks={planner.tasks}
          projects={activeProjects}
              externalCalendars={externalCalendars}
          externalCalendarEvents={externalCalendarEvents}
          focusSessions={planner.focusSessions}
          onUpdateExternalCalendar={onUpdateExternalCalendar}
          onUpdateProject={planner.updateProject}
            initialProjectId={calendarFocusProjectId}
          onUpdateTask={planner.updateTask}
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
        tasks={planner.tasks}
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
        projects={planner.projects}
        tasks={planner.tasks}
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
        subtasks={planner.subtasks}
        focusSessions={planner.focusSessions}
        activeFocusSession={planner.activeFocusSession}
        onCompleteTask={planner.completeTask}
        onArchiveTask={handleArchiveTask}
        onStartFocus={planner.startFocusSession}
        onNavigate={onNavigate}
        onOpenCalendar={openCalendarForProject}
        selectedTaskId={planner.selectedTask?.id ?? ""}
        taskDetail={renderTaskDetail()}
        selectedProjectId={selectedProjectId}
        detailOpen={isProjectDetailOpen}
        viewScope={viewScope}
        folders={planner.folders}
        onClearScope={onClearScope}
        onSelectList={onSelectList}
        onOpenProject={onSelectSpace}
        onCloseProject={onCloseSpace}
        onOpenTask={planner.selectTask}
        onToggleDone={planner.toggleTaskDone}
        onUpdateTask={planner.updateTask}
        onCreateTask={planner.createTask}
        onCreateProject={planner.createProject}
        onUpdateProject={planner.updateProject}
        onToggleStar={planner.toggleProjectPinned}
        onArchiveProject={handleArchiveProject}
        onRequestDeleteProject={deleteProjectNow}
        onSaveNotes={(id, value) => planner.updateProject(id, { notes: value })}
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
