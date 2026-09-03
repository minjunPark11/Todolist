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
//
// Three numbers since §16.5, because the Trash holds Lists too and the work
// inside them is invisible to the first one.
import { ConfirmModal } from "../kit";
import type { TrashSummary } from "../../domain/tasks/trash";
import { useT } from "../../i18n";

export function TrashEmptyGate({
  summary,
  onCancel,
  onConfirm,
}: {
  /** What is about to go. Nothing in it at all means the gate is closed. */
  summary: TrashSummary | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (!summary || (summary.tasks <= 0 && summary.lists <= 0)) return null;

  return (
    <ConfirmModal
      title={t("tasks.emptyTrashTitle")}
      body={[
        t("tasks.emptyTrashBody", { n: summary.tasks }),
        // Said only when there is a List to say it about, and said SEPARATELY
        // from the task count on purpose (§16.5): the work inside a trashed
        // List carries no `deletedAt`, so it is not in the first number and
        // never was. Folding the two together would produce one number that
        // matches neither the rows on screen nor what is about to go.
        summary.lists > 0
          ? t("tasks.emptyTrashLists", { lists: summary.lists, tasks: summary.tasksWithLists })
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      confirmLabel={t("tasks.emptyTrashAction")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
