// What this Scope shows, as a dialog
// (SCOPE_VIEW_OPTIONS_DESIGN.md §1.2, phase 3).
//
// A dialog rather than more rows in the ⋯ because of what these are: the menu
// holds things that DO something to the Scope — switch its view, hide its
// finished work — and these are settings that stay set. The reference app
// draws the same split, and this app already has it one level up (the Matrix
// box's ⋯ opens an editor for the same reason).
//
// NOT a `ConfirmModal`, which was the first attempt and gave the dialog a
// `Cancel` beside a `Close`: two buttons doing one thing, because that
// component is built for a question with two answers and this has none. Every
// row commits as it is touched, so the only control is the way out — the same
// shell `ListManager` uses, which is this app's shape for a dialog that is not
// a question.
//
// Each row is its own card with the label on the left and the value on the
// right, which is §1.2's arrangement. Only the rows this Scope can answer are
// drawn — a Scope with no Board has nothing to say about a Board's column
// width, and §15.5 sends that case to hide rather than to disable.
import { useT } from "../../i18n";
import type { ScopeViewOptions } from "../../domain/view/scopeViewOptions";

export function ScopeViewOptionsDialog({
  options,
  onChange,
  onClose,
}: {
  options: ScopeViewOptions;
  onChange: (patch: Partial<ScopeViewOptions>) => void;
  onClose: () => void;
}) {
  const { t } = useT();

  return (
    <div className="tm-manager-scrim" onMouseDown={onClose}>
      <div
        className="tm-view-options-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("tasks.viewOptions")}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="tm-manager-head">
          <h2>{t("tasks.viewOptions")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </header>

        <div className="tm-view-options">
          <div className="tm-view-option">
            <span className="tm-view-option-label">{t("tasks.showInputBox")}</span>
            <button
              type="button"
              className={`tm-switch${options.showInputBox ? " is-on" : ""}`}
              role="switch"
              aria-checked={options.showInputBox}
              aria-label={t("tasks.showInputBox")}
              onClick={() => onChange({ showInputBox: !options.showInputBox })}
            >
              <span className="tm-switch-knob" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
