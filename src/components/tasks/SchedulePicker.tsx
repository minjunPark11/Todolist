// The Schedule property row in the Task Detail (spec §5, Phase 3's
// "ScheduleEditor 연결").
//
// Almost nothing here is new, and that is the point: the editor, its reducer,
// its calendar, its time and reminder and repeat panels were all finished
// already and reachable only from the legacy detail panel. This is the trigger
// and the surface that put them where §5 says they belong.
//
// What it does NOT do is re-implement any of it. The Drawer's `<input
// type="date">` could set a due date and nothing else — no time, no range, no
// reminder, no repeat — so the Task Detail and the legacy panel disagreed
// about what a schedule was. One editor, one `updateTaskSchedule`, one answer.
import type { Task } from "../../types";
import type { ReminderSpec, Schedule, ScheduleIssue } from "../../domain/schedule";
import { formatScheduleTrigger, overdueDays, scheduleFromTask } from "../../domain/schedule";
import { isCompleted } from "../../domain/tasks/taskState";
import { ScheduleEditor } from "../schedule/ScheduleEditor";
import { CalendarIcon } from "../schedule/icons";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { useT } from "../../i18n";

export interface SchedulePickerProps {
  task: Task;
  /**
   * This Task's reminders (§6.3).
   *
   * Passed in rather than read off the Task, because they are rows now. The
   * editor needs them in the draft it opens — a reminder the reader cannot see
   * in the panel is a reminder they will remove by accident.
   */
  reminders: ReminderSpec[];
  /** Today as the domain's `YYYY-MM-DD`, for "is this overdue" and the like. */
  today: string;
  /** Returns whatever was wrong; empty means it was written (§5.51). */
  onCommit: (taskId: string, next: Schedule) => ScheduleIssue[];
  restoreFocusTo?: () => HTMLElement | null;
  /**
   * Shows the schedule without offering to edit it
   * (TRASH_PERMANENT_DELETE_DESIGN.md §14).
   *
   * Same reason as `PriorityPicker.readOnly`: the label, the lateness and
   * the red are worked out here, and a static twin elsewhere would be a
   * second copy of all three.
   */
  readOnly?: boolean;
}

export function SchedulePicker({ task, reminders, today, onCommit, restoreFocusTo, readOnly }: SchedulePickerProps) {
  const { t, lang } = useT();
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const schedule = scheduleFromTask({ ...task, reminders });
  const label = formatScheduleTrigger(schedule, today, locale);
  const late = isCompleted(task) ? 0 : overdueDays(schedule, today);
  const lateLabel = t("schedule.overdueDays", { days: late });

  // A Task with no schedule says nothing rather than inviting one: the
  // trigger's empty state is the invitation, and there is nothing to accept.
  if (readOnly) {
    if (!label) return null;
    return (
      <span
        className={`sched-trigger is-readonly${late > 0 ? " is-late" : ""}`}
        aria-label={t("tasks.scheduleCurrent", { value: late > 0 ? `${label}, ${lateLabel}` : label })}
      >
        <CalendarIcon size={14} />
        {label}
        {late > 0 ? <span className="sched-trigger-late">{lateLabel}</span> : null}
      </span>
    );
  }

  return (
    // §19.11: bottom-start. The calendar is the widest surface in the Detail,
    // and hanging it from the leading edge keeps it over the panel rather than
    // pushed against the window — where `shift` would then have to rescue it
    // on every open.
    <Popover placement="bottom-start" ownerTaskId={task.id} restoreFocusTo={restoreFocusTo}>
      <PopoverTrigger
        className={`sched-trigger${label ? "" : " is-empty"}${late > 0 ? " is-late" : ""}`}
        // §5.53: the trigger says what the schedule IS, so an empty one reads
        // as an invitation rather than as a control with a missing value.
        aria-label={
          label
            ? t("tasks.scheduleCurrent", { value: late > 0 ? `${label}, ${lateLabel}` : label })
            : t("schedule.trigger")
        }
      >
        {/* Drawn rather than a `content: "🗓"` on a pseudo-element, for the
            reasons the editor's other seven moved (design G1) — and because a
            glyph in CSS cannot follow the trigger's own colour when it turns
            red. */}
        <CalendarIcon size={14} />
        {label || t("schedule.trigger")}
        {/* How late, spelled out. The date is already red on an overdue task,
            but red says THAT it is late and not by how much — and "5월 20일"
            costs the reader a subtraction to find out. Not shown on finished
            work: a task completed last week is not late by any of its dates,
            which is the rule `groupIdOf` follows too. */}
        {late > 0 ? <span className="sched-trigger-late">{lateLabel}</span> : null}
      </PopoverTrigger>

      <PopoverContent label={t("taskDetail.schedule")} className="sched-surface">
        <ScheduleSurface task={task} locale={locale} schedule={schedule} today={today} onCommit={onCommit} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Separated only so the editor's `onClose` can be the surface's own close.
 *
 * The reason matters (§19.95): confirming a schedule is a `selection`, not a
 * dismissal, and the editor already refuses to close on a validation failure —
 * so a close arriving from here always means the draft was accepted.
 */
function ScheduleSurface({
  task,
  locale,
  schedule,
  today,
  onCommit,
}: {
  task: Task;
  locale: string;
  schedule: Schedule;
  today: string;
  onCommit: (taskId: string, next: Schedule) => ScheduleIssue[];
}) {
  const { close } = usePopoverSurface();
  return (
    <ScheduleEditor
      // The Drawer is reused across Tasks, so the reducer is re-seeded rather
      // than carrying one Task's draft into the next one's editor.
      key={task.id}
      taskId={task.id}
      locale={locale}
      schedule={schedule}
      today={today}
      onCommit={onCommit}
      onClose={() => close("selection")}
    />
  );
}
