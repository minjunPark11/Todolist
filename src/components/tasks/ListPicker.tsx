// The List property row and its picker (spec §13.8–§13.11, §13.26–§13.28).
//
// Second feature on the layer system, and it needs more of the primitive than
// Priority did: a search field inside the surface (§13.26), groups whose
// headings cannot be chosen (§13.10), and a list long enough to scroll inside
// its own max-height (§19.17).
//
// A child Task gets a sentence instead of a control. §13.15 refuses to move a
// child on its own and §13.16 refuses to detach it as a side effect, so there
// is nothing for the picker to do — and §16.28 is explicit that a control must
// not appear and then refuse. The line says why, so its absence is not a
// mystery.
import { useId, useMemo, useRef, useState } from "react";
import type { List, SidebarFolder, Task } from "../../types";
import { canMoveToList, listPickerGroups, selectableLists } from "../../domain/tasks/listPicker";
import { listIdFor } from "../../domain/spaces/membership";
import { isRovingKey, rovingNext } from "../../domain/tasks/rovingChoice";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { useT } from "../../i18n";

export interface ListPickerProps {
  task: Task;
  lists: List[];
  folders: SidebarFolder[];
  /** Given the chosen List. A re-select is filtered by the domain (§13.11). */
  onMove: (listId: string) => void;
  restoreFocusTo?: () => HTMLElement | null;
}

export function ListPicker({ task, lists, folders, onMove, restoreFocusTo }: ListPickerProps) {
  const { t } = useT();
  // The List as the domain answers it, not the raw field: a Task whose
  // `listId` is empty still belongs somewhere (§13.4, §13.5).
  const currentId = listIdFor(task, lists);
  const current = lists.find((list) => list.id === currentId);
  const currentName = current?.name ?? t("tasks.listUnknown");

  if (!canMoveToList(task)) {
    return (
      <p className="tm-drawer-field-static">
        {currentName}
        <span className="tm-drawer-field-note">{t("tasks.listFollowsParent")}</span>
      </p>
    );
  }

  return (
    <Popover placement="bottom-end" ownerTaskId={task.id} restoreFocusTo={restoreFocusTo}>
      <PopoverTrigger
        className="tm-list-trigger"
        // §13.8's affordance names what it holds, so a reader is not told only
        // that there is a button next to the word "List".
        aria-label={t("tasks.listCurrent", { value: currentName })}
      >
        <span className="tm-list-trigger-icon" aria-hidden="true">
          🗂
        </span>
        {currentName}
      </PopoverTrigger>

      <PopoverContent
        label={t("tasks.moveToList")}
        className="tm-list-surface"
        /* §13.27: the search field is the widget's entry point, whether the
           picker was opened by pointer or by key. */
        focusOnOpen="always"
      >
        <ListOptions currentId={currentId} lists={lists} folders={folders} onMove={onMove} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The chooser itself, which knows nothing about Tasks
 * (QUICK_ADD_INPUT_BOX_DESIGN.md §6).
 *
 * Exported because the quick add has no Task to move — it has a draft with a
 * List id in it, and that is exactly what this already takes. Drawing a second
 * chooser there is how the folder grouping and the search would come to differ
 * between the two places a List is picked.
 */
export function ListOptions({
  currentId,
  lists,
  folders,
  onMove,
}: {
  currentId: string;
  lists: List[];
  folders: SidebarFolder[];
  onMove: (listId: string) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();
  const [query, setQuery] = useState("");
  const optionsRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const groups = useMemo(() => listPickerGroups(lists, folders, query), [lists, folders, query]);
  const selectable = useMemo(() => selectableLists(groups), [groups]);

  // Where the arrow keys are. Held as an ID rather than an index so that
  // filtering the list cannot silently move the cursor onto a different List:
  // an id that has been filtered away simply stops matching, and the ring
  // starts again from the top.
  const [activeId, setActiveId] = useState(currentId);
  const active = selectable.some((list) => list.id === activeId) ? activeId : (selectable[0]?.id ?? "");

  function choose(listId: string) {
    close();
    onMove(listId);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && active) {
      // §13.27: Enter chooses, from the search field as well as from the list.
      // Typing a name and pressing Enter is the whole point of the search.
      event.preventDefault();
      choose(active);
      return;
    }
    if (!isRovingKey(event.key)) return;
    const next = rovingNext(
      selectable.map((list) => list.id),
      active,
      event.key,
    );
    if (!next) return;
    event.preventDefault();
    setActiveId(next);
    optionsRef.current?.querySelector<HTMLElement>(`[data-list="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="tm-list-picker" onKeyDown={onKeyDown}>
      {/* §13.26, §13.27. Focus stays in the field while the arrows move
          through the list below — that is what lets someone type a name and
          steer to it without reaching for the mouse.

          Which makes this a combobox, not a text field beside a list: the
          option the arrows are on has to be announced without focus moving to
          it, and `aria-activedescendant` is the only thing that does that.
          Without it a screen reader would report every keystroke and never the
          List being pointed at. */}
      <input
        className="tm-list-search"
        type="text"
        role="combobox"
        value={query}
        placeholder={t("tasks.searchLists")}
        aria-label={t("tasks.searchLists")}
        aria-expanded
        aria-controls={`${id}-options`}
        aria-activedescendant={active ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        onChange={(event) => setQuery(event.target.value)}
      />

      <div
        ref={optionsRef}
        id={`${id}-options`}
        className="tm-list-options"
        role="listbox"
        aria-label={t("tasks.moveToList")}
      >
        {groups.map((group) => (
          <div key={group.folder?.id ?? "ungrouped"} className="tm-list-group" role="group" aria-label={group.folder?.name}>
            {/* §13.10: a heading, not a selection target. `role="presentation"`
                keeps it out of the listbox's options rather than leaving a row
                a reader can arrow onto and then not choose. */}
            {group.folder ? (
              <div className="tm-list-group-head" role="presentation">
                {group.folder.name}
              </div>
            ) : null}

            {group.lists.map((list) => (
              <button
                key={list.id}
                id={`${id}-${list.id}`}
                type="button"
                role="option"
                data-list={list.id}
                aria-selected={list.id === currentId}
                tabIndex={-1}
                className={`tm-list-option${list.id === currentId ? " is-selected" : ""}${
                  list.id === active ? " is-active" : ""
                }`}
                onClick={() => choose(list.id)}
                onMouseEnter={() => setActiveId(list.id)}
              >
                {/* §13.11's check. Text as well as the tick, because a mark
                    with no name beside it is the same problem §8.29 names. */}
                <span className="tm-list-check" aria-hidden="true">
                  {list.id === currentId ? "✓" : ""}
                </span>
                {list.name}
              </button>
            ))}
          </div>
        ))}

        {/* §19.82: an empty surface says why it is empty. A picker that goes
            blank while someone is typing reads as broken. */}
        {groups.length === 0 ? <p className="tm-list-empty">{t("tasks.noListsMatch")}</p> : null}
      </div>
    </div>
  );
}
