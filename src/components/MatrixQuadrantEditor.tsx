// Editing a box: what it is CALLED, and what gets INTO it.
//
// The reference app's ⋯ menu has a fourth row, 편집, and behind it a rule
// editor: which lists, which tags, which dates, which priorities make up a
// quadrant (TICKTICK_MATRIX_DESIGN.md §22.1). This dialog is both halves of
// that — the three fields Phase 5 shipped, and the four conditions §23
// designed — separated by one rule.
//
// The divider is the whole layout argument. Above it is a box's NAME, which
// cannot break anything. Below it is a box's CONTENTS, which can: a condition
// makes `quadrantForTask` partial (a task can match no box) and can want
// something a drag is forbidden to write. Those costs are paid elsewhere —
// the line under the grid, and the boxes that refuse a card — and this dialog
// is where they are incurred, so it says which half of itself is which.
//
// What is NOT here is the reference's fifth row, 작업 유형 (과제 · 노트): this
// app has no Note record to filter for (§22.4).
import { useId, useMemo, useState } from "react";
import { Modal, useAutoFocus } from "./kit";
import type { List, Tag, TaskPriority } from "../types";
import {
  MATRIX_LABEL_MAX,
  MATRIX_QUADRANT_COLORS,
  sanitizeMatrixView,
  type MatrixQuadrantView,
} from "../domain/view/matrixGroups";
import {
  DEFAULT_MATRIX_RULES,
  MATRIX_RULE_PRESETS,
  type MatrixQuadrantRules,
  type MatrixRulePresetId,
} from "../domain/view/matrixRules";
import { rulesOverlap, sanitizeRule, type ViewRule } from "../domain/view/viewRules";
import { MATRIX_QUADRANTS, type MatrixQuadrant } from "../utils/eisenhower";
import { listColorHex } from "../domain/tasks/listColor";
import { useT } from "../i18n";

/** The five date buckets, in the order the box headers already draw them. */
const DATE_BUCKET_OPTIONS = ["overdue", "today", "tomorrow", "later", "none"] as const;
const PRIORITY_OPTIONS: readonly TaskPriority[] = ["high", "medium", "low", "none"];
const PRESET_IDS: readonly MatrixRulePresetId[] = ["priority", "timeAndPriority"];

interface MatrixQuadrantEditorProps {
  quadrant: MatrixQuadrant;
  /** The box's built-in name and second line — what an empty field means. */
  defaultName: string;
  defaultHint: string;
  view: MatrixQuadrantView;
  /** All four in force, so this one can say which others it collides with. */
  rules: MatrixQuadrantRules;
  lists: List[];
  tags: Tag[];
  onSave: (view: MatrixQuadrantView, rule: ViewRule) => void;
  /** Replaces all four rules at once — see the note on the preset row. */
  onApplyPreset: (preset: MatrixRulePresetId) => void;
  onClose: () => void;
}

export function MatrixQuadrantEditor({
  quadrant,
  defaultName,
  defaultHint,
  view,
  rules,
  lists,
  tags,
  onSave,
  onApplyPreset,
  onClose,
}: MatrixQuadrantEditorProps) {
  const { t } = useT();
  const [name, setName] = useState(view.name ?? "");
  const [hint, setHint] = useState(view.hint ?? "");
  const [color, setColor] = useState(view.color ?? "");
  const [rule, setRule] = useState<ViewRule>(rules[quadrant]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const nameRef = useAutoFocus<HTMLInputElement>();
  // The footer's Save submits the form it is not inside. `form=` is what that
  // attribute is for, and it buys Enter-to-save without a second Save button —
  // which is what a hidden submit inside the form would be, to a screen reader
  // reading the dialog out.
  const formId = useId();

  /**
   * Which other boxes could claim the same task as this draft.
   *
   * Live rather than on save: an overlap is a consequence of what is being
   * typed, and telling someone about it after they have committed is telling
   * them too late. It does NOT block saving — an app that refuses the
   * arrangement someone asked for is worse than one that resolves it
   * predictably and says how (§23.4).
   */
  const collisions = useMemo(
    () =>
      MATRIX_QUADRANTS.filter(
        (other) => other !== quadrant && rulesOverlap(rule, rules[other]),
      ),
    [quadrant, rule, rules],
  );

  function save() {
    // Through the same gates a stored record passes: the dialog and a synced
    // record then cannot disagree about what "" or an unknown value means.
    onSave(sanitizeMatrixView({ ...view, name, hint, color }), sanitizeRule(rule));
    onClose();
  }

  function reset() {
    setName("");
    setHint("");
    setColor("");
    setRule(DEFAULT_MATRIX_RULES[quadrant]);
  }

  const changed =
    Boolean(name || hint || color) ||
    ruleDiffers(rule, DEFAULT_MATRIX_RULES[quadrant]);

  const patchRule = (patch: Partial<ViewRule>) =>
    setRule((current) => ({ ...current, ...patch }));

  return (
    <Modal
      title={t("matrix.edit.title", { quadrant: defaultName })}
      onClose={onClose}
      footer={
        <>
          {/* Clearing the fields is what returns a box to its defaults, and an
              empty input does not say so. One button says it out loud. */}
          <button
            type="button"
            className="ff-btn-ghost ff-matrix-edit-reset"
            disabled={!changed}
            onClick={reset}
          >
            {t("matrix.edit.reset")}
          </button>
          <button
            type="button"
            className="ff-btn-ghost"
            aria-expanded={presetsOpen}
            onClick={() => setPresetsOpen((value) => !value)}
          >
            {t("matrix.edit.presets")}
          </button>
          <button type="button" className="ff-btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form={formId} className="ff-btn-primary">
            {t("common.save")}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="ff-matrix-edit"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="ff-matrix-edit-field">
          <span>{t("matrix.edit.name")}</span>
          {/* The built-in name as the placeholder, so an empty field shows
              what leaving it empty will get you. */}
          <input
            ref={nameRef}
            value={name}
            placeholder={defaultName}
            maxLength={MATRIX_LABEL_MAX}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="ff-matrix-edit-field">
          <span>{t("matrix.edit.hint")}</span>
          <input
            value={hint}
            placeholder={defaultHint}
            maxLength={MATRIX_LABEL_MAX}
            onChange={(event) => setHint(event.target.value)}
          />
        </label>

        <div className="ff-matrix-edit-field">
          <span id={`${formId}-color`}>{t("matrix.edit.color")}</span>
          <div className="ff-matrix-edit-colors" role="radiogroup" aria-labelledby={`${formId}-color`}>
            {["", ...MATRIX_QUADRANT_COLORS].map((value) => (
              <button
                key={value || "default"}
                type="button"
                role="radio"
                aria-checked={color === value}
                aria-label={value ? t(`tasks.color.${value}`) : t("matrix.edit.colorDefault")}
                className={`ff-matrix-edit-swatch${color === value ? " is-on" : ""}${value ? "" : " is-default"}`}
                style={value ? { background: listColorHex(value) } : undefined}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
        </div>

        {/* Above: what the box is called. Below: what gets into it. Only the
            second half can hide a task, and the line is where that starts. */}
        <p className="ff-matrix-edit-divider">{t("matrix.edit.conditions")}</p>

        <RuleDimension
          label={t("matrix.edit.lists")}
          options={lists.map((list) => ({ value: list.id, label: list.name }))}
          selected={rule.listIds}
          onChange={(listIds) => patchRule({ listIds })}
        />
        <RuleDimension
          label={t("matrix.edit.tags")}
          options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
          selected={rule.tagIds}
          onChange={(tagIds) => patchRule({ tagIds })}
          // A tag row on an account with no tags is a row of one dead option.
          hideWhenEmpty
        />
        <RuleDimension
          label={t("matrix.edit.dates")}
          // The same five words the group headers inside a box use, so "the
          // box that takes overdue work" reads the same in both places.
          options={DATE_BUCKET_OPTIONS.map((bucket) => ({
            value: bucket,
            label: t(`matrix.group.${bucket}`),
          }))}
          selected={rule.dateBuckets}
          onChange={(dateBuckets) => patchRule({ dateBuckets: dateBuckets as ViewRule["dateBuckets"] })}
        />
        <RuleDimension
          label={t("matrix.edit.priorities")}
          options={PRIORITY_OPTIONS.map((priority) => ({
            value: priority,
            label: t(`priority.${priority}`),
          }))}
          selected={rule.priorities}
          onChange={(priorities) => patchRule({ priorities: priorities as TaskPriority[] })}
        />

        {collisions.length > 0 ? (
          <p className="ff-matrix-edit-warning" role="status">
            {t("matrix.edit.overlap", {
              others: collisions.map((other) => t(`matrix.q${other}`)).join(", "),
              winner: t(`matrix.q${winnerOf(quadrant, collisions)}`),
            })}
          </p>
        ) : null}

        {presetsOpen ? (
          <div className="ff-matrix-edit-presets">
            {/* Said plainly, because it is the one control here that reaches
                past the box the dialog is about. */}
            <p>{t("matrix.edit.presetsAll")}</p>
            {PRESET_IDS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="ff-btn-ghost"
                onClick={() => {
                  onApplyPreset(preset);
                  onClose();
                }}
              >
                {t(`matrix.preset.${preset}`)}
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

/** Whichever of the colliding boxes comes first — reading order wins (§23.4). */
function winnerOf(quadrant: MatrixQuadrant, collisions: MatrixQuadrant[]): MatrixQuadrant {
  return [quadrant, ...collisions].reduce((first, candidate) =>
    MATRIX_QUADRANTS.indexOf(candidate) < MATRIX_QUADRANTS.indexOf(first) ? candidate : first,
  );
}

function ruleDiffers(a: ViewRule, b: ViewRule): boolean {
  const same = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((value) => y.includes(value));
  return !(
    same(a.listIds, b.listIds) &&
    same(a.tagIds, b.tagIds) &&
    same(a.dateBuckets, b.dateBuckets) &&
    same(a.priorities, b.priorities)
  );
}

/**
 * One condition, as a set of values.
 *
 * "전체" is not a ninth value — it is the EMPTY selection, which is how a rule
 * says "no constraint on this dimension" (§23.1). So it is drawn as an option
 * and behaves as one: choosing it clears the others, and clearing the last
 * member lands back on it. One representation, one control.
 *
 * Checkboxes rather than the reference's dropdowns. A dropdown that holds a
 * multiple selection is a widget this app does not have, and building one to
 * hold four fixed priorities would be a lot of machinery for a row that fits
 * on a line. Lists and tags get the same treatment and scroll instead.
 */
function RuleDimension({
  label,
  options,
  selected,
  onChange,
  hideWhenEmpty = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  hideWhenEmpty?: boolean;
}) {
  const { t } = useT();
  const groupId = useId();

  if (hideWhenEmpty && options.length === 0) return null;

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];
    onChange(next);
  }

  return (
    <div className="ff-matrix-edit-field">
      <span id={groupId}>{label}</span>
      <div className="ff-matrix-edit-choices" role="group" aria-labelledby={groupId}>
        <label className="ff-matrix-edit-choice">
          <input
            type="checkbox"
            checked={selected.length === 0}
            onChange={() => onChange([])}
          />
          {t("matrix.edit.any")}
        </label>
        {options.map((option) => (
          <label key={option.value} className="ff-matrix-edit-choice">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
