import { ReactNode } from "react";
import { ArchivePage } from "../components/ArchivePage";
import { CalendarView } from "../components/CalendarView";
import { EisenhowerPage } from "../components/EisenhowerPage";
import { FocusPage } from "../components/FocusPage";
import { SpacesPage } from "../components/SpacesPage";
import { SettingsPage } from "../components/SettingsPage";
import { StudyPage } from "../components/StudyPage";
import { TodayPage, type TodayIntent } from "../components/TodayPage";
import type { ToastState } from "../components/kit";
import type { usePlannerData } from "../hooks/usePlannerData";
import type { CalendarShareState } from "../lib/calendarShare";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import type { AppUpdateStatus } from "../platform";
import type { AppSettings, ExternalCalendar, ExternalCalendarEvent, PageId, Project } from "../types";

type Planner = ReturnType<typeof usePlannerData>;

type AppPagesProps = {
  activePage: PageId;
  planner: Planner;
  appSettings: AppSettings;
  activeProjects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  isProjectDetailOpen: boolean;
  setIsProjectDetailOpen: (open: boolean) => void;
  studyTab: "topics" | "notes" | "reviews";
  setStudyTab: (tab: "topics" | "notes" | "reviews") => void;
  studyFocusNoteId: string;
  setStudyFocusNoteId: (id: string) => void;
  todayIntent: TodayIntent;
  onTodayIntentHandled: () => void;
  renderTaskDetail: () => ReactNode;
  showToast: (toast: ToastState) => void;
  handleArchiveTask: (taskId: string) => void;
  handleArchiveProject: (projectId: string) => void;
  requestDeleteTask: (taskId: string) => void;
  requestDeleteProject: (projectId: string) => void;
  // Immediate delete for flows that already confirmed (space delete modal).
  deleteProjectNow: (projectId: string) => void;
  openProjectFromCalendar: (projectId: string) => void;
  openStudyReviewFromCalendar: (noteId: string) => void;
  viewTaskInCalendar: (taskId: string) => void;
  openCalendarForProject: (projectId?: string) => void;
  calendarFocusProjectId: string;
  onNavigate: (page: PageId) => void;
  exportJson: () => void;
  handleImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importMessage: string;
  appVersion: string;
  updateStatus: AppUpdateStatus | { status: "checking" };
  onCheckUpdate: () => void;
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
  accountSlot: ReactNode;
};

export function AppPages({
  activePage,
  planner,
  appSettings,
  activeProjects,
  selectedProjectId,
  setSelectedProjectId,
  isProjectDetailOpen,
  setIsProjectDetailOpen,
  studyTab,
  setStudyTab,
  studyFocusNoteId,
  setStudyFocusNoteId,
  todayIntent,
  onTodayIntentHandled,
  renderTaskDetail,
  showToast,
  handleArchiveTask,
  handleArchiveProject,
  requestDeleteTask,
  requestDeleteProject,
  deleteProjectNow,
  openProjectFromCalendar,
  openStudyReviewFromCalendar,
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
  accountSlot,
}: AppPagesProps) {
  function pageGridClass(extra = "") {
    const base = planner.selectedTask ? "page-grid" : "page-grid no-detail";
    return extra ? `${base} ${extra}` : base;
  }

  if (activePage === "today") {
    // Today has no task-detail side panel — the grid always uses the
    // full-width (no-detail) layout.
    return (
      <section className="page-grid no-detail tdy-grid">
        <TodayPage
          tasks={planner.tasks}
          projects={activeProjects}
          conceptNotes={planner.conceptNotes}
          onOpenTask={planner.selectTask}
          onToggleDone={planner.toggleTaskDone}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onArchiveTask={handleArchiveTask}
          onNavigate={onNavigate}
          onOpenProject={openProjectFromCalendar}
          onScheduleInCalendar={viewTaskInCalendar}
          intent={todayIntent}
          onIntentHandled={onTodayIntentHandled}
          showToast={showToast}
        />
      </section>
    );
  }

  if (activePage === "planning") {
    return (
      <section className={pageGridClass()}>
        <EisenhowerPage
          tasks={planner.tasks}
          projects={activeProjects}
          selectedTaskId={planner.selectedTask?.id ?? ""}
          onOpenTask={planner.selectTask}
          onToggleDone={planner.toggleTaskDone}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onScheduleInCalendar={viewTaskInCalendar}
          showToast={showToast}
        />
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "study") {
    return (
      <section className={pageGridClass()}>
        <StudyPage
          topics={planner.studyTopics}
          notes={planner.conceptNotes}
          tab={studyTab}
          onChangeTab={setStudyTab}
          onCreateTopic={planner.createTopic}
          onDeleteTopic={planner.deleteTopic}
          onCreateNote={planner.createNote}
          onUpdateNote={planner.updateNote}
          onDeleteNote={planner.deleteNote}
          onMarkReviewed={planner.markNoteReviewed}
          showToast={showToast}
          focusNoteId={studyFocusNoteId}
          onFocusNoteHandled={() => setStudyFocusNoteId("")}
        />
      </section>
    );
  }

  if (activePage === "archive") {
    return (
      <section className={pageGridClass()}>
        <ArchivePage
          tasks={planner.tasks}
          projects={planner.projects}
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
          conceptNotes={planner.conceptNotes}
          studyTopics={planner.studyTopics}
          externalCalendars={externalCalendars}
          externalCalendarEvents={externalCalendarEvents}
          focusSessions={planner.focusSessions}
          onUpdateExternalCalendar={onUpdateExternalCalendar}
          initialProjectId={calendarFocusProjectId}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onDeleteTask={requestDeleteTask}
          onOpenProject={openProjectFromCalendar}
          onOpenStudyReview={openStudyReviewFromCalendar}
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
        onUpdateFocusNote={planner.updateFocusSessionNote}
        onCompleteTask={planner.completeTask}
        onOpenTask={planner.selectTask}
        onNavigate={onNavigate}
      />
    );
  }

  if (activePage === "projects") {
    return (
      <SpacesPage
        projects={planner.projects}
        tasks={planner.tasks}
        subtasks={planner.subtasks}
        studyTopics={planner.studyTopics}
        conceptNotes={planner.conceptNotes}
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
        onOpenProject={(id) => {
          setSelectedProjectId(id);
          setIsProjectDetailOpen(true);
          planner.selectTask("");
        }}
        onCloseProject={() => {
          setIsProjectDetailOpen(false);
          planner.selectTask("");
        }}
        onOpenTask={planner.selectTask}
        onToggleDone={planner.toggleTaskDone}
        onUpdateTask={planner.updateTask}
        onCreateTask={planner.createTask}
        onCreateProject={planner.createProject}
        onCreateTopic={planner.createTopic}
        onUpdateProject={planner.updateProject}
        onUpdateTopic={planner.updateTopic}
        onToggleStar={planner.toggleProjectPinned}
        onArchiveProject={handleArchiveProject}
        onRequestDeleteProject={deleteProjectNow}
        onDeleteTopic={planner.deleteTopic}
        onSaveNotes={(id, value) => planner.updateProject(id, { notes: value })}
        showToast={showToast}
      />
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
      accountSlot={accountSlot}
      tasks={planner.tasks}
      onUpdateTask={planner.updateTask}
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
    />
  );
}
