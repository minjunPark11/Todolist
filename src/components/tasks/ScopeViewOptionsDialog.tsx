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
import {
  SCOPE_DATE_BY,
  SCOPE_KANBAN_SIZES,
  type ScopeDateBy,
  type ScopeKanbanSize,
  type ScopeViewOptions,
} from "../../domain/view/scopeViewOptions";

export function ScopeViewOptionsDialog({
  options,
  hasBoard,
  onChange,
  onClose,
}: {
  options: ScopeViewOptions;
  /**
   * Whether this Scope can draw a Board (§3.6).
   *
   * Two of the eight can (§2.1), and the two rows below that act on columns
   * are drawn only there. §15.5: an action with nothing to do here is absent,
   * not greyed — and a `Show Input Box` on a Scope with no columns was a
   * switch that flipped and changed nothing.
   */
  hasBoard: boolean;
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
            <span className="tm-view-option-label">{t("tasks.showDateBy")}</span>
            {/* A `<select>` and not a popover: two choices, no icons, and the
                platform's own control already says "there are other values
                behind this one". */}
            <select
              className="tm-view-option-value"
              value={options.dateBy}
              aria-label={t("tasks.showDateBy")}
              onChange={(event) => onChange({ dateBy: event.target.value as ScopeDateBy })}
            >
              {SCOPE_DATE_BY.map((value) => (
                <option key={value} value={value}>
                  {t(`tasks.dateBy.${value}`)}
                </option>
              ))}
            </select>
          </div>

          {hasBoard ? (
            <div className="tm-view-option">
              <span className="tm-view-option-label">{t("tasks.kanbanSize")}</span>
              {/* §3.6: the WIDTH of a column, not the height of a card. The
                  Board scrolls sideways, so the question a size answers is how
                  many columns fit — a card's height is its content's. */}
              <select
                className="tm-view-option-value"
                value={options.kanbanSize}
                aria-label={t("tasks.kanbanSize")}
                onChange={(event) =>
                  onChange({ kanbanSize: event.target.value as ScopeKanbanSize })
                }
              >
                {SCOPE_KANBAN_SIZES.map((value) => (
                  <option key={value} value={value}>
                    {t(`tasks.kanbanSize.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {hasBoard ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
