// The second ask, for the one action that removes many things at once
// (TRASH_PERMANENT_DELETE_DESIGN.md §3.3).
//
// A file of its own beside `TaskDeleteForeverGate` for the same reason that
// one exists: what a hard delete asks, and in what words, belongs in one place
// per action rather than inline at whichever screen happens to offer it.
//
// The sentence says the NUMBER, which is `ListManager`'s rule — the fact the
// verb hides. "Empty" is a word that costs nothing to read and everything to
// undo, and a reader who does not know whether the trash holds three or thirty
// is agreeing to something they cannot picture.
import { ConfirmModal } from "../kit";
import { useT } from "../../i18n";

export function TrashEmptyGate({
  count,
  onCancel,
  onConfirm,
}: {
  /** How many Tasks are about to go. Zero means the gate is closed. */
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (count <= 0) return null;

  return (
    <ConfirmModal
      title={t("tasks.emptyTrashTitle")}
      body={t("tasks.emptyTrashBody", { n: count })}
      confirmLabel={t("tasks.emptyTrashAction")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
