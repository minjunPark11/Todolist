import { CSSProperties, ReactNode, useState } from "react";
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
import type { TaskDetailPresentation } from "../domain/tasks/responsive";
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
  /**
   * The open Task, and how to open one — read from and written to `?task=`
   * (TASK_DETAIL_PANEL_MERGE_DESIGN.md §8).
   *
   * The id rather than the Task: what these grids and their pages need is
   * "which one", and the row that draws itself as open is comparing ids. The
   * Task itself is `App`'s, because `App` is what renders the pane.
   */
  openedTaskId: string;
  onOpenTask: (taskId: string) => void;
  /**
   * Whether the Detail is a COLUMN or a layer over the page (§15.17).
   *
   * The only thing about it these grids care about. Three of the four
   * presentations are `position: fixed` and take no track; `inline-drawer` is
   * a grid item and needs one.
   */
  detailPresentation: TaskDetailPresentation;
  /** §1.12's stored width, so the reserved track and the pane agree. */
  detailWidth: number;
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
  openedTaskId,
  onOpenTask,
  detailPresentation,
  detailWidth,
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
  /**
   * The Detail is a column only where §15.17 says it is one.
   *
   * It used to be "a Task is open, therefore there is a second column", which
   * was true while the panel was this half of the app's own. The Drawer has
   * four presentations and three of them cover the page instead — so on a
   * narrow window the grid stays full width and the Detail floats above it,
   * which is the shape the Tasks module has had all along
   * (TASK_DETAIL_PANEL_MERGE_DESIGN.md §6).
   */
  const detailIsColumn = Boolean(openedTaskId) && detailPresentation === "inline-drawer";

  function pageGridClass(extra = "") {
    const base = detailIsColumn ? "page-grid" : "page-grid no-detail";
    return extra ? `${base} ${extra}` : base;
  }

  /**
   * `--tm-detail-w` is the Drawer's own variable (§1.12). The Tasks module
   * sets it on its shell; these pages set it on the grid, so the column the
   * pane sits in is exactly as wide as the pane.
   */
  const gridStyle = { ["--tm-detail-w"]: `${detailWidth}px` } as CSSProperties;

  if (activePage === "today") {
    // Today had no side-by-side Detail: the grid was pinned to the full-width
    // layout and a click opened the legacy panel inside a scrim of this page's
    // own (`.tdy-detail-overlay`). That scrim was a fifth presentation of a
    // component that already had four, and it is gone — Today's Detail is now
    // the same column, overlay, sheet or full screen every other Task gets.
    return (
      <section className={pageGridClass("tdy-grid")} style={gridStyle}>
        <TodayPage
          tasks={visibleTasks}
          dailyPlans={planner.dailyPlans}
          lists={planner.lists}
          onSetBuckets={planner.setTodayBuckets}
          onOpenTask={onOpenTask}
          openedTaskId={openedTaskId}
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
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "board") {
    return (
      <section className={pageGridClass()} style={gridStyle}>
        <MatrixPage
          tasks={visibleTasks}
          lists={planner.lists}
          selectedTaskId={openedTaskId}
          onOpenTask={onOpenTask}
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
          showToast={showToast}
        />
      </section>
    );
  }

  if (activePage === "focus") {
    // Focus handed `selectTask` to every task row and drew nothing with the
    // selection — the click set state no one read (PANEL_MERGE §6.1). It is
    // the same grid Today and the Matrix use, so the fix is the grid, not a
    // fifth presentation of a pane that already has four.
    return (
      <section className={pageGridClass("foc-grid")} style={gridStyle}>
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
          onOpenTask={onOpenTask}
          onNavigate={onNavigate}
        />
        {renderTaskDetail()}
      </section>
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
