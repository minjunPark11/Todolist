// The second ask, for the one action with no way back
// (TRASH_PERMANENT_DELETE_DESIGN.md §3.3).
//
// A component for the same reason `TaskUndoStrip` is one: `useTaskCommands` is
// a hook two surfaces call, and a question nobody draws is a hard delete that
// happens on one click. Both shells render this beside the strip, so the words
// and the number of asks are the same wherever the row was chosen from.
//
// The sentence is modelled on `ListManager`'s, which is the app's other hard
// delete: it says the thing the verb hides. There the fact was how many Tasks
// go with the List; here it is that the subtasks do NOT go — a reader who
// expects a cascade would otherwise be deleting a parent to clear its children
// and finding them still there.
import { ConfirmModal } from "../kit";
import { useT } from "../../i18n";
import type { Task } from "../../types";

export function TaskDeleteForeverGate({
  task,
  onCancel,
  onConfirm,
}: {
  task: Task | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (!task) return null;

  return (
    <ConfirmModal
      title={t("tasks.deleteForeverTitle")}
      body={t("tasks.deleteForeverBody")}
      confirmLabel={t("tasks.menu.deleteForever")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
