import { ReactNode, useState } from "react";
import { MatrixPage } from "../components/MatrixPage";
import { CalendarView } from "../components/CalendarView";
import { FocusPage } from "../components/FocusPage";
import { SettingsPage } from "../components/SettingsPage";
import { TodayPage, type TodayIntent } from "../components/TodayPage";
import type { ToastState } from "../components/kit";
import type { usePlannerData } from "../hooks/usePlannerData";
import type { CalendarShareState } from "../lib/calendarShare";
import type { AutoBackupState } from "./useAutoBackup";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import type { AppUpdateStatus } from "../platform";
import type { AppSettings, ExternalCalendar, ExternalCalendarEvent, PageId, Task } from "../types";

type Planner = ReturnType<typeof usePlannerData>;

type AppPagesProps = {
  activePage: PageId;
  /**
   * The Tasks the user can see (audit D-24 axis 2, P0-4b-5).
   *
   * `planner.tasks` is still here and still the whole set. The difference is
   * the question being asked: this one is for screens that DRAW or OFFER
   * tasks, and it has already dropped the ones whose owning List was archived
   * or deleted. Lookups — an export, a reminder — want the full set, because
   * a hidden Task has not stopped existing.
   */
  visibleTasks: Task[];
  planner: Planner;
  appSettings: AppSettings;
  todayIntent: TodayIntent;
  onTodayIntentHandled: () => void;
  renderTaskDetail: () => ReactNode;
  showToast: (toast: ToastState) => void;
  handleArchiveTasks: (taskIds: string[]) => void;
  requestDeleteTask: (taskId: string) => void;
  viewTaskInCalendar: (taskId: string) => void;
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
  autoBackup: AutoBackupState;
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
  visibleTasks,
  appSettings,
  todayIntent,
  onTodayIntentHandled,
  renderTaskDetail,
  showToast,
  handleArchiveTasks,
  requestDeleteTask,
  viewTaskInCalendar,
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
  autoBackup,
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
    // Today has no side-by-side task-detail panel — the grid always uses the
    // full-width (no-detail) layout. Clicking a task instead opens the
    // shared TaskDetail as a right-side overlay drawer.
    return (
      <section className="page-grid no-detail tdy-grid">
        <TodayPage
          tasks={visibleTasks}
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
        <MatrixPage
          tasks={visibleTasks}
          lists={planner.lists}
          selectedTaskId={planner.selectedTask?.id ?? ""}
          onOpenTask={planner.selectTask}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onToggleDone={planner.toggleTaskDone}
          quadrantViews={appSettings.matrixQuadrantViews}
          quadrantRules={appSettings.matrixQuadrantRules}
          tags={planner.tags}
          onChangeQuadrantRule={(quadrant, rule) =>
            planner.updateAppSettings({
              matrixQuadrantRules: { ...appSettings.matrixQuadrantRules, [quadrant]: rule },
            })
          }
          onApplyRulePreset={(rules) => planner.updateAppSettings({ matrixQuadrantRules: rules })}
          onChangeQuadrantView={(quadrant, view) =>
            planner.updateAppSettings({
              matrixQuadrantViews: { ...appSettings.matrixQuadrantViews, [quadrant]: view },
            })
          }
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
          externalCalendars={externalCalendars}
          externalCalendarEvents={externalCalendarEvents}
          focusSessions={planner.focusSessions}
          onUpdateExternalCalendar={onUpdateExternalCalendar}
          onUpdateTask={planner.updateTask}
          onUpdateTaskSchedule={planner.updateTaskSchedule}
          onCreateTask={planner.createTask}
          onDeleteTask={requestDeleteTask}
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
        tags={planner.tags}
        taskTags={planner.taskTags}
        focusSessions={planner.focusSessions}
        activeSession={planner.activeFocusSession}
        settings={focusSettings}
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

  return (
    <SettingsPage
      settings={appSettings}
      focusSettings={focusSettings}
      onUpdateFocusSettings={onUpdateFocusSettings}
      autoBackup={autoBackup}
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
