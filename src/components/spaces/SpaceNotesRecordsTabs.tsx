import { useState } from "react";
import type { SpaceActivity, SpaceNote, SpaceTypePreset } from "../../lib/spaceHubTypes";
import { relativeTime } from "../../lib/spaceSelectors";
import { useT } from "../../i18n";
import { presetText, noteTypeText, recordTypeText } from "../../lib/spaceHubI18n";

// === Notes tab (§24) ===
export function SpaceNotesTab({
  preset,
  notes,
  onAddNote,
  onOpenNote,
}: {
  preset: SpaceTypePreset;
  notes: SpaceNote[];
  onAddNote: () => void;
  onOpenNote: (noteId: string) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const noteTypes = Array.from(new Set([...preset.noteTypes, ...notes.map((note) => note.type)]));
  const normalizedQuery = query.trim().toLowerCase();
  const visible = notes.filter((note) => {
    if (typeFilter !== "all" && note.type !== typeFilter) return false;
    if (!normalizedQuery) return true;
    return `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <section className="sdv-card sdv-tab-panel">
      <header className="sdv-toolbar">
        <input
          type="search"
          placeholder={t("spaceHub.search.notes")}
          aria-label={t("spaceHub.aria.searchNotes")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label={t("spaceHub.aria.noteTypeFilter")} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">{t("spaceHub.filter.allTypes")}</option>
          {noteTypes.map((type) => (
            <option key={type} value={type}>
              {noteTypeText(t, type)}
            </option>
          ))}
        </select>
        <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddNote}>
          {presetText(t, preset.addNoteLabel)}
        </button>
      </header>

      {notes.length === 0 ? (
        <div className="sdv-empty">
          <p>{t("spaceHub.empty.noNotes")}</p>
          <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddNote}>
            {presetText(t, preset.addNoteLabel)}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="sdv-empty-inline">{t("spaceHub.empty.noNotesMatch")}</p>
      ) : (
        <div className="sdv-note-grid">
          {visible.map((note) => (
            <button key={note.id} type="button" className="sdv-note-card" onClick={() => onOpenNote(note.id)}>
              <span className="sdv-note-type">{noteTypeText(t, note.type)}</span>
              <strong>{note.title}</strong>
              {note.body ? <p>{note.body.slice(0, 120)}</p> : null}
              <small>
                {note.url ? "🔗 " : ""}
                {relativeTime(note.updatedAt, t)}
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

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
