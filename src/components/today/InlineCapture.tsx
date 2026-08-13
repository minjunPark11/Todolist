import { FormEvent, RefObject, useMemo, useState } from "react";
import type { Project } from "../../types";
import { formatDate } from "../../utils/date";
import { parseQuickCapture, type QuickParseResult } from "../../utils/quickParse";
import { formatMinuteOfDay, parseTimeToMinutes } from "../../utils/todayView";
import { useT } from "../../i18n";

interface InlineCaptureProps {
  projects: Project[];
  today: string;
  /** Persisted: on = the capture becomes a Today task, off = an Inbox item. */
  addToToday: boolean;
  onToggleAddToToday: () => void;
  onCapture: (parsed: QuickParseResult) => void;
  onOpenDetails: (title: string) => void;
  inputRef: RefObject<HTMLInputElement>;
}

export function InlineCapture({
  projects,
  today,
  addToToday,
  onToggleAddToToday,
  onCapture,
  onOpenDetails,
  inputRef,
}: InlineCaptureProps) {
  const { t, lang } = useT();
  const [value, setValue] = useState("");

  // Parsed live so the chips below show what the app understood before the
  // capture is stored — a misread is visible rather than silent.
  const parsed = useMemo(
    () => parseQuickCapture(value, { projects, today }),
    [value, projects, today],
  );
  const canSave = Boolean(parsed.title.trim() || value.trim());

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSave) return;
    onCapture(parsed);
    setValue("");
  }

  const project = parsed.projectId
    ? projects.find((candidate) => candidate.id === parsed.projectId)
    : undefined;
  const startMin = parsed.startTime ? parseTimeToMinutes(parsed.startTime) : undefined;
  const chips = [
    parsed.scheduledDate
      ? { key: "scheduled", label: formatDate(parsed.scheduledDate, lang) }
      : null,
    parsed.dueDate ? { key: "due", label: `~ ${formatDate(parsed.dueDate, lang)}` } : null,
    startMin !== undefined ? { key: "time", label: formatMinuteOfDay(startMin, lang) } : null,
    project ? { key: "project", label: project.name } : null,
    parsed.priority ? { key: "priority", label: t(`priority.${parsed.priority}`) } : null,
  ].filter((chip): chip is { key: string; label: string } => chip !== null);

  return (
    <form className="tdy-capture" onSubmit={submit}>
      <div className="tdy-capture-row">
        <span className="tdy-capture-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <input
          ref={inputRef}
          className="tdy-capture-input"
          value={value}
          placeholder={t("todayv.capturePlaceholder")}
          aria-label={t("todayv.capturePlaceholder")}
          aria-describedby="tdy-capture-hint"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setValue("");
              return;
            }
            // Alt/Option+Enter hands the current text to the full form.
            if (event.key === "Enter" && event.altKey) {
              event.preventDefault();
              onOpenDetails(parsed.title.trim() || value.trim());
              setValue("");
            }
          }}
        />
        <button
          type="button"
          className={`tdy-capture-toggle${addToToday ? " is-on" : ""}`}
          aria-pressed={addToToday}
          title={addToToday ? t("todayv.captureTargetToday") : t("todayv.captureTargetInbox")}
          onClick={onToggleAddToToday}
        >
          {addToToday ? t("common.today") : t("status.inbox")}
        </button>
        <button type="submit" className="tdy-btn tdy-btn-navy tdy-btn-sm" disabled={!canSave}>
          {t("common.add")}
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="tdy-capture-chips">
          {chips.map((chip) => (
            <span key={chip.key} className="tdy-capture-chip">
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}

      <p className="tdy-capture-hint" id="tdy-capture-hint">
        {t("todayv.captureHint")}
      </p>
    </form>
  );
}
