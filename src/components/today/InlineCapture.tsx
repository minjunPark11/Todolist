import { FormEvent, RefObject, useMemo, useState } from "react";
import { formatDate } from "../../utils/date";
import { parseQuickCapture, type QuickParseResult } from "../../utils/quickParse";
import { formatMinuteOfDay, parseTimeToMinutes } from "../../utils/todayView";
import { useT } from "../../i18n";

interface InlineCaptureProps {
  today: string;
  /** Persisted: on = the capture becomes a Today task, off = an Inbox item. */
  addToToday: boolean;
  onToggleAddToToday: () => void;
  onCapture: (parsed: QuickParseResult) => void;
  onOpenDetails: (title: string) => void;
  inputRef: RefObject<HTMLInputElement>;
}

export function InlineCapture({
  today,
  addToToday,
  onToggleAddToToday,
  onCapture,
  onOpenDetails,
  inputRef,
}: InlineCaptureProps) {
  const { t, lang } = useT();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  /**
   * Whether the row shows its controls (§3.3).
   *
   * The reference app's Today has one add affordance and it is a single quiet
   * line at the top of the list; ours was a card with a toggle, a button and a
   * hint under it, standing open every day whether or not anybody typed. So it
   * folds: `+ 작업 추가` until it is asked for, everything it had once it is.
   *
   * `value` counts as well as focus. Text typed and then clicked away from is
   * still a capture in progress, and folding the Add button away under it
   * would be taking the control back mid-sentence.
   */
  const expanded = focused || value.trim().length > 0;

  // Parsed live so the chips below show what the app understood before the
  // capture is stored — a misread is visible rather than silent.
  const parsed = useMemo(
    () => parseQuickCapture(value, { today }),
    [value, today],
  );
  const canSave = Boolean(parsed.title.trim() || value.trim());

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSave) return;
    onCapture(parsed);
    setValue("");
  }

  const startMin = parsed.startTime ? parseTimeToMinutes(parsed.startTime) : undefined;
  const chips = [
    parsed.relativeDate
      ? { key: "scheduled", label: formatDate(parsed.relativeDate, lang) }
      : null,
    parsed.dueDate ? { key: "due", label: `~ ${formatDate(parsed.dueDate, lang)}` } : null,
    startMin !== undefined ? { key: "time", label: formatMinuteOfDay(startMin, lang) } : null,
    parsed.priority ? { key: "priority", label: t(`priority.${parsed.priority}`) } : null,
  ].filter((chip): chip is { key: string; label: string } => chip !== null);

  return (
    <form className={`tdy-capture${expanded ? " is-open" : ""}`} onSubmit={submit}>
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
          placeholder={expanded ? t("todayv.capturePlaceholder") : t("todayv.addRow")}
          // The label does not fold with the row: a screen reader meets the
          // same control either way, and "작업 추가" is what it is for.
          aria-label={t("todayv.addRow")}
          aria-describedby="tdy-capture-hint"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Empty already? Then Escape means "I am done here", and the row
              // folds. With text in it, Escape clears and the row stays open —
              // one key doing two things is what the hint line promises.
              if (!value) event.currentTarget.blur();
              setValue("");
              return;
            }
            if (event.key !== "Enter") return;

            // Enter is handled here rather than left to the form's implicit
            // submission, because a Korean/Japanese IME also fires Enter to
            // commit the in-flight composition. Implicit submission cannot
            // tell the two apart and would store a half-composed title, so
            // every Enter is intercepted and only the non-composing one saves.
            // The commit itself rides on compositionend and is unaffected.
            event.preventDefault();
            if (event.nativeEvent.isComposing) return;

            // Alt/Option+Enter hands the current text to the full form.
            if (event.altKey) {
              onOpenDetails(parsed.title.trim() || value.trim());
              setValue("");
              return;
            }
            submit();
          }}
        />
        {expanded ? (
          <>
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
          </>
        ) : null}
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

      {expanded ? (
        <p className="tdy-capture-hint" id="tdy-capture-hint">
          {t("todayv.captureHint")}
        </p>
      ) : null}
    </form>
  );
}
