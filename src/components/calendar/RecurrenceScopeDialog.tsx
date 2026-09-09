// "This occurrence, this and after, or all of them?"
//
// RECURRING_OCCURRENCE_EDIT_DESIGN.md §8. The question every calendar app asks,
// and it has to be asked because the same drag means three different writes
// (§6) — there is no answer the app can pick that is right more often than not.
//
// Not a ConfirmModal: that one asks yes/no, and rounding three answers to two
// would be choosing for the user in the one place the design says not to.
import { useState } from "react";
import { Modal } from "../kit";
import { useT } from "../../i18n";
import type { OccurrenceScope } from "../../domain/tasks/occurrenceEdit";

export interface RecurrenceScopeRequest {
  /** The occurrence id the edit came in on. */
  occurrenceId: string;
  /** Editing or removing — the copy differs, the three choices do not. */
  intent: "edit" | "delete";
}

/**
 * `defaultScope` is "this" deliberately. Someone who clicked one occurrence out
 * of a series meant that one; offering "all" first would make the destructive
 * reading the easy one. §11 leaves this open to revisit on real use.
 */
export function RecurrenceScopeDialog({
  intent,
  onChoose,
  onCancel,
}: {
  intent: RecurrenceScopeRequest["intent"];
  onChoose: (scope: OccurrenceScope) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [scope, setScope] = useState<OccurrenceScope>("this");

  const options: { value: OccurrenceScope; label: string }[] = [
    { value: "this", label: t("recurrence.scope.this") },
    { value: "following", label: t("recurrence.scope.following") },
    { value: "all", label: t("recurrence.scope.all") },
  ];

  return (
    <Modal
      title={intent === "delete" ? t("recurrence.scope.deleteTitle") : t("recurrence.scope.editTitle")}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ff-btn" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={intent === "delete" ? "ff-btn ff-btn-danger" : "ff-btn ff-btn-primary"}
            onClick={() => onChoose(scope)}
          >
            {t("common.confirm")}
          </button>
        </>
      }
    >
      <div className="ff-recurrence-scope" role="radiogroup" aria-label={t("recurrence.scope.editTitle")}>
        {options.map((option) => (
          <label key={option.value} className="ff-recurrence-scope-row">
            <input
              type="radio"
              name="recurrence-scope"
              value={option.value}
              checked={scope === option.value}
              onChange={() => setScope(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
