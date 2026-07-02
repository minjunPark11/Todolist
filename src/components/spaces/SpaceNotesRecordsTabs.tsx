import { useState } from "react";
import type { SpaceActivity, SpaceNote, SpaceTypePreset } from "../../lib/spaceHubTypes";
import { relativeTime } from "../../lib/spaceSelectors";

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
          placeholder="Search notes..."
          aria-label="Search notes in this Space"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="Note type filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          {noteTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddNote}>
          {preset.addNoteLabel}
        </button>
      </header>

      {notes.length === 0 ? (
        <div className="sdv-empty">
          <p>No notes yet. Add feedback, meeting notes, or reference links.</p>
          <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddNote}>
            {preset.addNoteLabel}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="sdv-empty-inline">No notes match this filter.</p>
      ) : (
        <div className="sdv-note-grid">
          {visible.map((note) => (
            <button key={note.id} type="button" className="sdv-note-card" onClick={() => onOpenNote(note.id)}>
              <span className="sdv-note-type">{note.type}</span>
              <strong>{note.title}</strong>
              {note.body ? <p>{note.body.slice(0, 120)}</p> : null}
              <small>
                {note.url ? "🔗 " : ""}
                {relativeTime(note.updatedAt)}
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
  const [filter, setFilter] = useState<RecordFilter>("all");
  const visible = activities.filter((activity) => filter === "all" || filterMatch[filter](activity.type));

  return (
    <section className="sdv-card sdv-tab-panel">
      <header className="sdv-toolbar">
        <div className="sdv-chip-row" role="tablist" aria-label="Record filters">
          {(["all", "task", "focus", "note", "manual"] as RecordFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "sdv-chip active" : "sdv-chip"}
              onClick={() => setFilter(item)}
            >
              {item === "all" ? "All" : item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddManualRecord}>
          + Manual record
        </button>
      </header>

      {visible.length === 0 ? (
        <div className="sdv-empty">
          <p>No records yet. Task, focus, and note activity will collect here automatically.</p>
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
                <span className={`sdv-record-type sdv-record-${activity.type}`}>{activity.type.replace(/_/g, " ")}</span>
                <span className="sdv-activity-body">
                  <strong>{activity.title}</strong>
                  {activity.description ? <em>{activity.description}</em> : null}
                </span>
                <small>{relativeTime(activity.createdAt)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
