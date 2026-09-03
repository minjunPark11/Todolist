// The second ask for a List, now that the Trash is where it is asked
// (TRASH_PERMANENT_DELETE_DESIGN.md §16.4).
//
// The words are `ListManager`'s, which is where this question lived before —
// it says how many Tasks go with the List, because that is the fact "delete"
// hides and the reason this cascade is allowed at all (§6.56): the user asked
// for it from a surface that spelled out what it would take.
//
// A file of its own beside `TaskDeleteForeverGate` and `TrashEmptyGate`, for
// the reason those two are files: one place per action decides what it asks
// and in what words, rather than each screen that offers it deciding again.
import { ConfirmModal } from "../kit";
import { taskCountInList } from "../../domain/spaces/lifecycle";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";
import type { List, Task } from "../../types";

export function ListDeleteForeverGate({
  list,
  tasks,
  onCancel,
  onConfirm,
}: {
  /** Null closes the gate — the same shape `TaskDeleteForeverGate` uses. */
  list: List | null;
  tasks: Task[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (!list) return null;

  return (
    <ConfirmModal
      title={t("tasks.listDeleteForeverTitle", {
        list: listDisplayName(list, t("tasks.defaultList"), t("tasks.inbox")),
      })}
      body={t("tasks.listDeleteForeverBody", { count: taskCountInList(tasks, list.id) })}
      confirmLabel={t("tasks.menu.deleteForever")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
