// Naming a column and saying what gets into it
// (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 5).
//
// The reference app's ⋯ menu has 이름 바꾸기 and two 열 추가 rows, and a
// column added by the second pair needs conditions before it can hold
// anything — membership here is DERIVED (§4.1's B), so a column with no rule
// is a column nothing can ever be in. That is why adding and editing are one
// dialog: the moment of creation is the moment the question has to be asked.
//
// Only the DATE row is offered, and that is a decision rather than an
// omission. §6.24 says an Inbox column is a statement about WHEN; the shared
// rule vocabulary also carries lists, tags and priorities because the Matrix
// needs them, but this board cannot WRITE any of those on a drop (Gate 7) — so
// offering them here would be offering conditions whose only effect is to make
// the column refuse cards. A stored rule that names one still works and still
// refuses; nothing here can create one.
import { useState } from "react";
import { Modal } from "../kit";
import { COLUMN_NAME_MAX } from "../../domain/tasks/board";
import type { DateBucket } from "../../domain/view/matrixGroups";
import type { InboxColumnRule } from "../../domain/view/inboxColumnRules";
import { useT } from "../../i18n";

/** In the order the group headers inside a column already draw them. */
const DATE_BUCKETS: readonly DateBucket[] = ["overdue", "today", "tomorrow", "later", "none", "someday"];

export interface InboxColumnDraft {
  name: string;
  rule: InboxColumnRule;
}

export function InboxColumnDialog({
  title,
  initial,
  placeholder,
  onSave,
  onClose,
}: {
  title: string;
  initial: InboxColumnDraft;
  /** The built-in name, where the column has one — what an empty field means. */
  placeholder: string;
  onSave: (draft: InboxColumnDraft) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial.name);
  const [buckets, setBuckets] = useState<DateBucket[]>(initial.rule.dateBuckets);

  // A column with no date condition matches every task, and first-match-wins
  // means it would empty every column to its right. Nobody means that, so it
  // is not offered — the dialog asks for the answer instead of accepting a
  // silence that would take the board apart.
  const ready = buckets.length > 0;

  function toggle(bucket: DateBucket) {
    setBuckets((current) =>
      current.includes(bucket) ? current.filter((entry) => entry !== bucket) : [...current, bucket],
    );
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ff-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="ff-btn is-primary"
            disabled={!ready}
            onClick={() => onSave({ name, rule: { ...initial.rule, dateBuckets: buckets } })}
          >
            {t("common.save")}
          </button>
        </>
      }
    >
      <div className="tm-column-dialog">
        <label className="tm-column-dialog-field">
          <span>{t("tasks.columnName")}</span>
          <input
            autoFocus
            value={name}
            maxLength={COLUMN_NAME_MAX}
            placeholder={placeholder}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        {/* The divider is the layout's whole argument, as it is in the Matrix's
            editor: above it a name, which cannot break anything, and below it
            what the column HOLDS, which can — a condition decides where every
            card on this board sits. */}
        <hr className="tm-column-dialog-rule" />

        <div className="tm-column-dialog-field">
          <span id="tm-column-dates">{t("tasks.columnDates")}</span>
          <div className="tm-column-dialog-choices" role="group" aria-labelledby="tm-column-dates">
            {DATE_BUCKETS.map((bucket) => (
              <label key={bucket} className="tm-column-dialog-choice">
                <input type="checkbox" checked={buckets.includes(bucket)} onChange={() => toggle(bucket)} />
                {t(`matrix.group.${bucket}`)}
              </label>
            ))}
          </div>
        </div>

        {!ready ? (
          <p className="tm-column-dialog-hint" role="status">
            {t("tasks.columnNeedsDates")}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
