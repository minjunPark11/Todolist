// The Schedule domain's public surface (design §19.5).
//
// Phase 1 of SCHEDULE_EDITOR_PHASE0_AUDIT.md §7: the meaning of a schedule,
// fixed in code and tests, with no UI and no persistence attached. Nothing
// here imports React, Supabase, a browser API, or the `Task` type itself
// (design §19.3).
//
// Phase 2 adds the Task adapter, the one file here that knows the record's
// three date fields and its `""` sentinel (taskSchedule.ts).
//
// Still to come: reminder DELIVERY. The panel stores an intent and
// `reminderInstant` resolves it to a moment; nothing fires it yet (audit D5).
export type {
  LocalDate,
  LocalTime,
  RangeStage,
  ReminderPreset,
  RepeatPreset,
  Schedule,
  ScheduleDraft,
  ScheduleMode,
} from "./types";
export {
  EMPTY_SCHEDULE,
  isLocalDate,
  isLocalTime,
  isReminderPreset,
  isRepeatPreset,
  REMINDER_PRESETS,
  REPEAT_PRESETS,
} from "./types";

export type { QuickDateKey } from "./quickDate";
export { applyQuickDate, QUICK_DATES, quickTargetDate, tonightTime } from "./quickDate";

export { availableReminders, reconcileReminder, reminderInstant } from "./reminder";

export type { DueReminder, LocalMoment, ReminderSweep, ReminderTaskSource } from "./reminderQueue";
export { GRACE_MINUTES, keyMoment, pruneSeen, reminderKey, sweepReminders } from "./reminderQueue";

export type { RepeatFields, RepeatSource } from "./recurrence";
export { repeatPresetFromTask, repeatPresetToFields } from "./recurrence";

export { draftFromSchedule, getScheduleMode, setScheduleMode, toDateMode, toDurationMode } from "./scheduleMode";

export {
  addDays,
  clearSchedule,
  clearTime,
  daysBetween,
  selectDate,
  setEndTime,
  setStartTime,
  shiftSchedule,
} from "./scheduleCommands";

export {
  getRangeStage,
  hasSchedule,
  isOverdue,
  isAllDay,
  isTimed,
  scheduleSpan,
  scheduleSpanDays,
} from "./scheduleQueries";

export { normalizeSchedule } from "./normalizeSchedule";

export type { ScheduleIssue, ScheduleIssueCode } from "./validateSchedule";
export { isConfirmable, isValidSchedule, validateDraft, validateSchedule } from "./validateSchedule";

export { isDirty, schedulesEqual } from "./scheduleEquality";

export { formatLocalTime, formatScheduleTrigger, formatTimeSummary } from "./scheduleFormatting";

export type { ScheduleUpdatePlan } from "./updateTaskSchedule";
export { planScheduleUpdate } from "./updateTaskSchedule";

export type { EditorPanel, ScheduleEditorAction, ScheduleEditorState } from "./editorState";
export type { CalendarCell, CellSelection } from "./calendarCells";
export { gridStart, monthGrid, WEEK_LENGTH } from "./calendarCells";

export {
  CLOSED,
  draftSchedule,
  initialMonth,
  monthOf,
  scheduleEditorReducer,
  stepMonth,
} from "./editorState";

export type { ScheduleShape, TaskScheduleSource } from "./taskSchedule";
export {
  classifyTaskSchedule,
  countScheduleShapes,
  scheduleFromTask,
  scheduleToTaskPatch,
} from "./taskSchedule";
