// §9.36: the strip is where the way back lives, and it says what it would undo
// rather than just offering the word.
//
// A component because `useTaskCommands` is a hook two surfaces call, and a
// notice nobody draws is a change nobody can take back. The Tasks module drew
// this inline while it was the only caller.
import { useT } from "../../i18n";
import type { TaskNotice } from "../../hooks/useTaskCommands";

export function TaskUndoStrip({
  notice,
  onDismiss,
}: {
  notice: TaskNotice | null;
  onDismiss: () => void;
}) {
  const { t } = useT();
  if (!notice) return null;

  return (
    <div className="tm-undo" role="status">
      <span>{t(notice.labelKey)}</span>
      {/* §15.22's fallback: when the clipboard refused, the URL is put where it
          can be selected and copied by hand, rather than the action ending
          with an apology and nothing to act on. */}
      {notice.text ? <input className="tm-undo-value" readOnly value={notice.text} /> : null}
      {/* Drawn only when there IS one. Copy Link changes no Task (§15.58), so
          offering to undo it would be offering to undo nothing — and a button
          that does nothing reads as one that failed. */}
      {notice.run ? (
        <button
          type="button"
          onClick={() => {
            notice.run?.();
            onDismiss();
          }}
        >
          {t("app.undo")}
        </button>
      ) : null}
      <button type="button" onClick={onDismiss} aria-label={t("common.close")}>
        ×
      </button>
    </div>
  );
}
