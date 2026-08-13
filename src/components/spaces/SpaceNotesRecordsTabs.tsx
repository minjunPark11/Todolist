import { useState } from "react";
import type { SpaceActivity } from "../../lib/spaceHubTypes";
import { relativeTime } from "../../lib/spaceSelectors";
import { useT } from "../../i18n";
import { recordTypeText } from "../../lib/spaceHubI18n";

// Notes tab moved to SpaceNotesPanel.tsx (popup + split view spec).

// === Records tab (§25) ===
type RecordFilter = "all" | "task" | "focus" | "note" | "manual";

const filterMatch: Record<Exclude<RecordFilter, "all">, (type: SpaceActivity["type"]) => boolean> = {
  task: (type) => type.startsWith("task_"),
  focus: (type) => type.startsWith("focus_"),
  note: (type) => type.startsWith("note_"),
  manual: (type) => type === "manual_record" || type === "ai_suggestion_applied",
};

export function SpaceRecordsTab({
  activities,
  onAddManualRecord,
  onOpenTask,
  onOpenSession,
  onOpenNote,
}: {
  activities: SpaceActivity[];
  onAddManualRecord: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenNote: (noteId: string) => void;
}) {
  const { t } = useT();
  const [filter, setFilter] = useState<RecordFilter>("all");
  const visible = activities.filter((activity) => filter === "all" || filterMatch[filter](activity.type));

  return (
    <section className="sdv-card sdv-tab-panel">
      <header className="sdv-toolbar">
        <div className="sdv-chip-row" role="tablist" aria-label={t("spaceHub.aria.recordFilters")}>
          {(["all", "task", "focus", "note", "manual"] as RecordFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "sdv-chip active" : "sdv-chip"}
              onClick={() => setFilter(item)}
            >
              {t(`spaceHub.recordFilter.${item}`)}
            </button>
          ))}
        </div>
        <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddManualRecord}>
          {t("spaceHub.action.manualRecord")}
        </button>
      </header>

      {visible.length === 0 ? (
        <div className="sdv-empty">
          <p>{t("spaceHub.empty.noRecords")}</p>
        </div>
      ) : (
        <ul className="sdv-activity-list sdv-full-timeline">
          {visible.map((activity) => (
            <li key={activity.id}>
              <button
                type="button"
                onClick={() => {
                  if (activity.relatedTaskId) onOpenTask(activity.relatedTaskId);
                  else if (activity.relatedSessionId) onOpenSession(activity.relatedSessionId);
                  else if (activity.relatedNoteId) onOpenNote(activity.relatedNoteId);
                }}
              >
                <span className={`sdv-record-type sdv-record-${activity.type}`}>{recordTypeText(t, activity.type)}</span>
                <span className="sdv-activity-body">
                  <strong>{activity.title}</strong>
                  {activity.description ? <em>{activity.description}</em> : null}
                </span>
                <small>{relativeTime(activity.createdAt, t)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
