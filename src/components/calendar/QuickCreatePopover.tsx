import { FormEvent, useState } from "react";
import type { CalendarCategoryGroup } from "../../lib/calendarCategories";
import { formatDate } from "../../utils/date";
import { Modal, useAutoFocus } from "../kit";
import { useT } from "../../i18n";

export interface QuickCreateDefaults {
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
}

export interface QuickCreateResult {
  title: string;
  type: "task" | "deadline";
  date: string;
  startTime: string;
  endTime: string;
  categoryId: string;
}

interface QuickCreatePopoverProps {
  defaults: QuickCreateDefaults;
  categoryGroups: CalendarCategoryGroup[];
  initialCategoryId: string;
  onClose: () => void;
  onSave: (result: QuickCreateResult) => void;
}

export function QuickCreatePopover({ defaults, categoryGroups, initialCategoryId, onClose, onSave }: QuickCreatePopoverProps) {
  const { t, lang } = useT();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"task" | "deadline">("task");
  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startTime ?? "");
  const [endTime, setEndTime] = useState(defaults.endTime ?? "");
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const titleRef = useAutoFocus<HTMLInputElement>();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = title.trim() || t("calendar.newEventDefaultTitle");
    onSave({ title: trimmed, type, date, startTime, endTime, categoryId });
  }

  return (
    <Modal
      title={
        defaults.allDay
          ? t("calendar.newItemOn", { date: formatDate(defaults.date, lang) })
          : t("calendar.newTaskOn", { date: formatDate(defaults.date, lang) })
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ff-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => submit()}>
            {t("common.save")}
          </button>
        </>
      }
    >
      <form className="gcal-quick-create-form" onSubmit={submit}>
        <label>
          <span>{t("common.titleLabel")}</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onClose();
            }}
            placeholder={t("calendar.newEventDefaultTitle")}
          />
        </label>

        {defaults.allDay ? (
          <label>
            <span>{t("calendar.type")}</span>
            <select value={type} onChange={(event) => setType(event.target.value as "task" | "deadline")}>
              <option value="task">{t("calendar.typeTaskScheduled")}</option>
              <option value="deadline">{t("calendar.typeDeadline")}</option>
            </select>
          </label>
        ) : null}

        <label>
          <span>{t("calendar.date")}</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        {!defaults.allDay ? (
          <>
            <label>
              <span>{t("calendar.startTime")}</span>
              <input type="time" step={600} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label>
              <span>{t("calendar.endTime")}</span>
              <input type="time" step={600} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </>
        ) : null}

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
      </form>
    </Modal>
  );
}
