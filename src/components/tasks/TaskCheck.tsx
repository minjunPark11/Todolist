// The box that finishes a Task, and says what priority it has while it waits
// (TASK_PRIORITY_CHECKBOX_DESIGN.md §4).
//
// One element, so why a component: the priority → class mapping is the whole
// point, and it is needed in two places that are otherwise nothing alike — a
// row's 40px-tall hit area and the Detail's `□ Done` label. Written twice, the
// two could come to disagree about which levels get a colour, which is the
// same failure the palette had before §3 gave it one home.
//
// It stays an `<input type="checkbox">`. `appearance: none` replaces the
// PICTURE and nothing else: Space still toggles, the wrapping `<label>` still
// targets it, `:checked` and `:disabled` still describe it, and a screen
// reader still calls it a checkbox. Swapping in a `<span role="checkbox">`
// would mean rebuilding all of that by hand, and the ask was a colour.
import type { TaskPriority } from "../../types";

export interface TaskCheckProps {
  /**
   * The level to draw, which is not always the Task's.
   *
   * The matrix passes `none` deliberately: its quadrants ARE the priority, so
   * a row there does not repeat it (`MatrixPage.tsx`, `showPriority={false}`).
   * One switch for the flag and the colour together — the question both answer
   * is "does this row say its own priority", and a row that answered it twice
   * differently would be worse than either answer.
   */
  priority: TaskPriority;
  checked: boolean;
  /** Frozen rather than absent — a trashed Task's completion is a fact (§14). */
  disabled?: boolean;
  /** Said in full, because the box carries no visible text of its own. */
  label: string;
  onToggle: () => void;
}

export function TaskCheck({ priority, checked, disabled, label, onToggle }: TaskCheckProps) {
  return (
    <input
      type="checkbox"
      className={`tm-check is-${priority}`}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      /* Not the level. The flag beside it already carries that for assistive
         tech (`aria-label={t('priority.high')}`), and a reader told the
         priority twice in one row has to work out whether it heard two facts
         or one. */
      onChange={onToggle}
    />
  );
}
