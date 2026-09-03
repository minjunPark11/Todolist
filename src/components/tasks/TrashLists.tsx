// The Lists in the Trash (TRASH_PERMANENT_DELETE_DESIGN.md §16.3, §16.4).
//
// §13.25 kept these off this screen and put them behind a `Manage` button in
// the sidebar, on the argument that mixing containers into the Task Trash
// would make "restore" mean two things. §16.2 reversed it: it means "get this
// back" in both cases, the two live in separate labelled sections so nobody
// has to tell them apart by eye, and what the separation actually bought was a
// screen nobody could find. A deleted List was the one thing in this app that
// could be thrown away and not be in the Trash.
//
// No Detail, and that is the decision §16.4 makes rather than an omission. A
// Task's two answers are in its Detail's footer because a Task HAS a Detail;
// opening a List means going to its tasks, and a List in the bin has nowhere
// to go. Two answers do not earn a screen — so they are on the row, in the
// order the Task's footer uses: Restore carries the word and Delete forever
// carries only the icon, because the destructive half is the one you should
// have to aim at.
import type { List, Task } from "../../types";
import { binnedLists, isArchived, taskCountInList } from "../../domain/spaces/lifecycle";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";

export function TrashLists({
  lists,
  tasks,
  onRestore,
  onDeleteForever,
}: {
  lists: List[];
  tasks: Task[];
  onRestore: (listId: string) => void;
  /** Opens the gate; the caller owns the question and the answer. */
  onDeleteForever: (listId: string) => void;
}) {
  const { t } = useT();
  const binned = binnedLists(lists);
  // Absent, not empty. A heading over nothing is a permanent report that the
  // account has no deleted Lists, on a screen about what it does have.
  if (binned.length === 0) return null;

  return (
    <section className="tm-trash-lists" aria-label={t("tasks.trashListsTitle")}>
      <h2 className="tm-trash-lists-head">
        {t("tasks.trashListsTitle")}
        <span className="tm-count">{binned.length}</span>
      </h2>
      <ul className="tm-list">
        {binned.map((list) => (
          <li key={list.id} className="tm-task tm-trash-list">
            <span className="tm-task-title">{listDisplayName(list, t("tasks.defaultList"), t("tasks.inbox"))}</span>
            {/* What the row is really about: restoring this brings back
                everything inside it, and deleting it takes all of that. The
                number is the same one `taskCountInList` gives the gate, so the
                row and the question cannot disagree. */}
            <span className="tm-task-due">
              {t("tasks.trashListTaskCount", { count: taskCountInList(tasks, list.id) })}
            </span>
            {/* Archiving is gone (§16.6). A List still carrying that state is
                a leftover, and saying so is what stops the reader wondering
                why they cannot remember deleting it. */}
            {isArchived(list) ? <span className="tm-trash-list-tag">{t("tasks.trashListArchived")}</span> : null}
            <button type="button" className="tm-drawer-restore" onClick={() => onRestore(list.id)}>
              <RestoreIcon />
              {t("tasks.menu.restore")}
            </button>
            <button
              type="button"
              className="tm-drawer-delete-forever"
              aria-label={t("tasks.menu.deleteForever")}
              title={t("tasks.menu.deleteForever")}
              onClick={() => onDeleteForever(list.id)}
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* The same two icons the Task's footer uses, on the same 24-viewBox grid at
   stroke 1.9 — the gestures are the same, so the drawings are. */
function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M4.5 6.5h15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6.5 6.5l1 12.2h9l1-12.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M12 16.2V9.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9.4 12.2L12 9.6l2.6 2.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M4.5 6.5h15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9.5 6.5V4.8h5v1.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M6.5 6.5l1 12.2h9l1-12.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M10.3 10v5.5M13.7 10v5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
