// Editing what a box IS CALLED — not what it means.
//
// The reference app's ⋯ menu has a fourth row, "편집", and behind it a rule
// editor: which lists, which tags, which time range, which priority make up a
// quadrant (TICKTICK_MATRIX_DESIGN.md §20.2). This dialog deliberately opens
// only the first third of that door.
//
// §20.4 is the reason. Rules on time make `quadrantOf` partial — a task can
// match no box and vanish — and rules on lists make the reverse map write a
// task's MEMBERSHIP, so one drag would move a task between lists. That is the
// same class of accident D1 exists to prevent (§4.2). Names and colours change
// none of it: the box still means one priority, still derives its contents,
// and still writes one field when a card is dropped on it.
//
// So what is here is the part that is purely the user's own words. "지금 하기"
// is not everyone's word for Ⅰ.
import { useId, useState } from "react";
import { Modal, useAutoFocus } from "./kit";
import {
  MATRIX_LABEL_MAX,
  MATRIX_QUADRANT_COLORS,
  sanitizeMatrixView,
  type MatrixQuadrantView,
} from "../domain/view/matrixGroups";
import { listColorHex } from "../domain/tasks/listColor";
import { useT } from "../i18n";

interface MatrixQuadrantEditorProps {
  /** The box's built-in name and second line — what an empty field means. */
  defaultName: string;
  defaultHint: string;
  view: MatrixQuadrantView;
  onSave: (view: MatrixQuadrantView) => void;
  onClose: () => void;
}

export function MatrixQuadrantEditor({
  defaultName,
  defaultHint,
  view,
  onSave,
  onClose,
}: MatrixQuadrantEditorProps) {
  const { t } = useT();
  const [name, setName] = useState(view.name ?? "");
  const [hint, setHint] = useState(view.hint ?? "");
  const [color, setColor] = useState(view.color ?? "");
  const nameRef = useAutoFocus<HTMLInputElement>();
  // The footer's Save submits the form it is not inside. `form=` is what that
  // attribute is for, and it buys Enter-to-save without a second Save button —
  // which is what a hidden submit inside the form would be, to a screen reader
  // reading the dialog out.
  const formId = useId();

  function save() {
    // Through the same gate a stored record passes: the dialog and a synced
    // record then cannot disagree about what "" and 41 characters mean.
    onSave(sanitizeMatrixView({ ...view, name, hint, color }));
    onClose();
  }

  const changed = Boolean(name || hint || color);

  return (
    <Modal
      title={t("matrix.edit.title", { quadrant: defaultName })}
      onClose={onClose}
      footer={
        <>
          {/* Clearing three fields is what returns a box to its defaults, and
              an empty input does not say so. One button says it out loud. */}
          <button
            type="button"
            className="ff-btn-ghost ff-matrix-edit-reset"
            disabled={!changed}
            onClick={() => {
              setName("");
              setHint("");
              setColor("");
            }}
          >
            {t("matrix.edit.reset")}
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
          <span id="ff-matrix-edit-color">{t("matrix.edit.color")}</span>
          <div className="ff-matrix-edit-colors" role="radiogroup" aria-labelledby="ff-matrix-edit-color">
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
      </form>
    </Modal>
  );
}
