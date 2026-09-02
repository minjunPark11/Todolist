// Archived Lists and Deleted Lists (TickTick plan §13.25, §16.32).
//
// Deliberately not a Scope. §13.25 says so twice over: it does not join §12's
// registry of nine, and a deleted List must not appear as a row in the Task
// Trash. The two would look alike and mean different things — the Task Trash
// is what the USER threw away, while a deleted List is a container whose
// Tasks were never touched (§6.56). Restoring from one screen brings back one
// Task; restoring from this one brings back everything that was inside.
//
// Permanent delete used to be the only place in the app that hard-deletes
// anything. It is not any more — the Trash has two of its own since
// TRASH_PERMANENT_DELETE_DESIGN.md §3.1: one Task, from its Detail's footer or
// its row menu, and the whole Trash from that screen's header.
//
// What survived the change is the rule this comment was really about. A hard
// delete asks twice, and the confirmation says the number going with it,
// because that is the fact the user needs and the one the word "delete" hides.
// All three say it.
import { useState } from "react";
import type { List, Task } from "../../types";
import { archivedLists, deletedLists, taskCountInList } from "../../domain/spaces/lifecycle";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";

interface ListManagerProps {
  lists: List[];
  tasks: Task[];
  onRestore: (listId: string) => void;
  onPermanentlyDelete: (listId: string) => void;
  onClose: () => void;
}

export function ListManager({ lists, tasks, onRestore, onPermanentlyDelete, onClose }: ListManagerProps) {
  const { t } = useT();
  // The second step of the two-step. One id at a time: a screen with several
  // rows armed at once is a screen where the wrong one gets pressed.
  const [confirming, setConfirming] = useState("");

  const archived = archivedLists(lists);
  const deleted = deletedLists(lists);

  function name(list: List): string {
    return listDisplayName(list, t("tasks.defaultList"), t("tasks.inbox"));
  }

  return (
    <div className="tm-manager-scrim" onMouseDown={onClose}>
      <div
        className="tm-manager"
        role="dialog"
        aria-modal="true"
        aria-label={t("tasks.managerTitle")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tm-manager-head">
          <h2>{t("tasks.managerTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </header>

        <section className="tm-manager-group">
          <h3>{t("tasks.managerArchived")}</h3>
          {archived.length === 0 ? (
            <p className="tm-state">{t("tasks.managerNoArchived")}</p>
          ) : (
            <ul className="tm-list">
              {archived.map((list) => (
                <li key={list.id} className="tm-task">
                  <span className="tm-task-title">{name(list)}</span>
                  <span className="tm-task-due">{t("tasks.managerTaskCount", { count: taskCountInList(tasks, list.id) })}</span>
                  <button type="button" onClick={() => onRestore(list.id)}>
                    {t("tasks.managerRestore")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tm-manager-group">
          <h3>{t("tasks.managerDeleted")}</h3>
          {deleted.length === 0 ? (
            <p className="tm-state">{t("tasks.managerNoDeleted")}</p>
          ) : (
            <ul className="tm-list">
              {deleted.map((list) => (
                <li key={list.id} className="tm-task">
                  <span className="tm-task-title">{name(list)}</span>
                  <span className="tm-task-due">{t("tasks.managerTaskCount", { count: taskCountInList(tasks, list.id) })}</span>
                  <button type="button" onClick={() => onRestore(list.id)}>
                    {t("tasks.managerRestore")}
                  </button>
                  {confirming === list.id ? (
                    <>
                      {/* The count is repeated here on purpose: this is the
                          sentence the user is agreeing to. */}
                      <span className="tm-manager-warn">
                        {t("tasks.managerConfirm", { count: taskCountInList(tasks, list.id) })}
                      </span>
                      <button
                        type="button"
                        className="tm-manager-danger"
                        onClick={() => {
                          onPermanentlyDelete(list.id);
                          setConfirming("");
                        }}
                      >
                        {t("tasks.managerDeleteForever")}
                      </button>
                      <button type="button" onClick={() => setConfirming("")}>
                        {t("common.cancel")}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="tm-manager-danger" onClick={() => setConfirming(list.id)}>
                      {t("tasks.managerDeleteForever")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
