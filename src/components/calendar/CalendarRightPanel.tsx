// Day-view-only detail panel (spec §7.7): selected event detail, new-event
// form while a draft is pending, or an empty state. No mini calendar, no
// backlog — week/month/year views render no right panel at all.
import { ReactNode } from "react";
import type { Project } from "../../types";
import type { CalendarDraftBlock } from "../../utils/calendarTime";
import { NewTaskForm, type NewTaskFormResult } from "./NewTaskForm";
import { useT } from "../../i18n";

interface DayDetailPanelProps {
  draft: CalendarDraftBlock | null;
  taskDetail: ReactNode;
  projects: Project[];
  onCancelDraft: () => void;
  onCreateFromDraft: (result: NewTaskFormResult) => void;
}

export function DayDetailPanel({ draft, taskDetail, projects, onCancelDraft, onCreateFromDraft }: DayDetailPanelProps) {
  const { t } = useT();

  if (draft) {
    return (
      <aside className="gcal-panel" data-calendar-interactive="true">
        <NewTaskForm
          key={`${draft.date}-${draft.startTime}-${draft.endTime}`}
          draft={draft}
          projects={projects}
          onCancel={onCancelDraft}
          onCreate={onCreateFromDraft}
        />
      </aside>
    );
  }

  if (taskDetail) {
    return (
      <aside className="gcal-panel" data-calendar-interactive="true">
        {taskDetail}
      </aside>
    );
  }

  return (
    <aside className="gcal-panel gcal-panel-empty" data-calendar-interactive="true">
      <strong>{t("calendar.detailEmptyTitle")}</strong>
      <p>{t("calendar.detailEmptyBody")}</p>
    </aside>
  );
}
