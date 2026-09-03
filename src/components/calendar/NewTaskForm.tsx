import { FormEvent, useState } from "react";
import type { CalendarCategoryGroup } from "../../lib/calendarCategories";
import type { CalendarDraftBlock } from "../../utils/calendarTime";
import { formatDate } from "../../utils/date";
import { useAutoFocus } from "../kit";
import { useT } from "../../i18n";
import { formatClockRange } from "../../utils/clock";
import { useTimeFormat } from "../../utils/appPrefs";
import { EMPTY_SCHEDULE, type Schedule } from "../../domain/schedule";
import { ScheduleEditor } from "../schedule/ScheduleEditor";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";

export interface NewTaskFormResult {
  title: string;
  categoryId: string;
  dueDate: string;
}

interface NewTaskFormProps {
  draft: CalendarDraftBlock;
  categoryGroups: CalendarCategoryGroup[];
  initialCategoryId: string;
  onCancel: () => void;
  onCreate: (result: NewTaskFormResult) => void;
}

// CALENDAR_V3_DESIGN.md §3/§6: draft time info lives in CalendarView state;
// this form only owns "what" (title/category/dueDate), so Cancel/remount never
// touches the draft's time range. The category select is pre-filled with the
// sidebar's active category (category spec §11.1); an empty title falls back
// to the default event title instead of blocking creation (§17.4).
export function NewTaskForm({ draft, categoryGroups, initialCategoryId, onCancel, onCreate }: NewTaskFormProps) {
  const { t, lang } = useT();
  const timeFormat = useTimeFormat();
  const clockLocale = lang === "ko" ? "ko" : "en";
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [dueDate, setDueDate] = useState("");
  const titleRef = useAutoFocus<HTMLInputElement>();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    onCreate({ title: title.trim() || t("calendar.newEventDefaultTitle"), categoryId, dueDate });
  }

  return (
    <form
      className="gcal-newtask-form"
      onSubmit={submit}
      onKeyDown={(event) => {
        /* Only keys pressed in the form itself. The date button below opens a
           surface that React portals out of this DOM subtree but still bubbles
           events through — without this check, Escape inside the calendar
           would cancel the whole form and Enter would submit it from under the
           reader (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §2.3). */
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (event.defaultPrevented) return;
        // Enter creates the task from any field, not just the submit button.
        // isComposing: an Enter that commits Korean IME composition must not
        // submit — only the next real Enter does.
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          submit();
        }
        if (event.key === "Escape") onCancel();
      }}
    >
      <header className="gcal-newtask-head">
        <h2>{t("calendar.quickCreateTitle")}</h2>
        <button type="button" className="ff-icon-btn" aria-label={t("calendar.cancelNewTaskAria")} onClick={onCancel}>
          ✕
        </button>
      </header>

      <label>
        <span>{t("common.titleLabel")}</span>
        <input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("calendar.newEventDefaultTitle")}
        />
      </label>

      <div className="gcal-newtask-when">
        <span className="gcal-newtask-when-label">{t("calendar.when")}</span>
        <strong>{formatDate(draft.date, lang)}</strong>
        <span>
          {formatClockRange(draft.startTime, draft.endTime, timeFormat, clockLocale)}
        </span>
      </div>

      <label>
        <span>{t("calendar.categoryLabel")}</span>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categoryGroups.map((group) =>
            group.categories.length === 0 ? null : (
              <optgroup key={group.type} label={t(`calendar.group.${group.type}`)}>
                {group.categories.map((category) => (
                  <option key={category.id} value={category.id} disabled={category.isReadOnly}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
      </label>

      {/* §2.3: the app's own calendar, not the OS's `mm/dd/yyyy`. It was the
          one control on this form that belonged to no screen in this app, and
          we already have the picker — the Task Detail and the quick add both
          open it. `dateOnly` shuts its 시간·알림·반복 rows: this task's time
          is the block the reader just dragged, and the editor must not offer
          a second answer to it. */}
      <div className="gcal-newtask-due">
        <span>{t("common.dueDate")}</span>
        <Popover placement="bottom-start">
          <PopoverTrigger className={`gcal-newtask-duebtn${dueDate ? " is-set" : ""}`}>
            {dueDate ? formatDate(dueDate, lang) : t("calendar.optional")}
          </PopoverTrigger>
          <PopoverContent label={t("common.dueDate")} className="sched-surface">
            <DueDateSurface
              dueDate={dueDate}
              today={draft.date}
              locale={lang}
              onPick={setDueDate}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="gcal-newtask-actions">
        <button type="button" className="ff-btn" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="ff-btn ff-btn-primary">
          {t("calendar.createTask")}
        </button>
      </div>
    </form>
  );
}

/** Separated so 확인 and 취소 can close the surface they are inside (§19.90). */
function DueDateSurface({
  dueDate,
  today,
  locale,
  onPick,
}: {
  dueDate: string;
  today: string;
  locale: string;
  onPick: (date: string) => void;
}) {
  const { close } = usePopoverSurface();
  // Seeded once, from whatever the button is currently saying — the same
  // reason `QuickAddDate` seeds: an editor that opened empty beside a button
  // that says a date would disable 확인 until the reader re-picked that date.
  const [seed] = useState<Schedule>(() =>
    dueDate ? { ...EMPTY_SCHEDULE, dueDate } : EMPTY_SCHEDULE,
  );

  return (
    <ScheduleEditor
      // No Task yet; the editor only hands this back to `onCommit`.
      taskId=""
      locale={locale}
      schedule={seed}
      today={today}
      dateOnly
      onCommit={(_taskId, next) => {
        onPick(next.dueDate ?? "");
        return [];
      }}
      onClose={() => close("selection")}
      onCancel={() => close("escape")}
    />
  );
}
