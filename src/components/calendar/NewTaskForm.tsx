import { FormEvent, useState } from "react";
import type { CalendarCategoryGroup } from "../../lib/calendarCategories";
import type { CalendarDraftBlock } from "../../utils/calendarTime";
import { formatDate } from "../../utils/date";
import { useAutoFocus } from "../kit";
import { useT } from "../../i18n";

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
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [dueDate, setDueDate] = useState("");
  const titleRef = useAutoFocus<HTMLInputElement>();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    onCreate({ title: title.trim() || t("calendar.newEventDefaultTitle"), categoryId, dueDate });
  }

  return (
    <form className="gcal-newtask-form" onSubmit={submit}>
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
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
          placeholder={t("calendar.newEventDefaultTitle")}
        />
      </label>

      <div className="gcal-newtask-when">
        <span className="gcal-newtask-when-label">{t("calendar.when")}</span>
        <strong>{formatDate(draft.date, lang)}</strong>
        <span>
          {draft.startTime} – {draft.endTime}
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

      <label>
        <span>{t("common.dueDate")}</span>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          placeholder={t("calendar.optional")}
        />
      </label>

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
