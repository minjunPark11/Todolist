// The Tags property row and its picker (spec §13.36–§13.41, §13.55–§13.59).
//
// The third feature on the layer system, and the first multi-select one. That
// is the whole difference from the List picker: §13.40 says a tag picker does
// NOT close on each choice, because ticking three tags is one intention and
// three closes would be three trips back to the trigger.
//
// The chips outside the surface are §13.55: a tag can be taken off without
// opening anything, which is the common case once the tagging is done.
import { useId, useMemo, useState } from "react";
import type { Tag, Task, TaskTag } from "../../types";
import { tagCreateOffer, tagNameRefusal, tagPickerOptions } from "../../domain/tags/tagPicker";
import { tagsForTask } from "../../domain/tags/tags";
import { isRovingKey, rovingNext } from "../../domain/tasks/rovingChoice";
import { Popover, PopoverContent, PopoverTrigger } from "../floating";
import { useT } from "../../i18n";

export interface TagPickerProps {
  task: Task;
  tags: Tag[];
  taskTags: TaskTag[];
  /**
   * Toggles one tag by name — adding it, creating it first if it is new
   * (§13.42), or taking the relation off (§13.45).
   *
   * By name rather than by id, because §13.41's inline create has no id yet
   * and a caller that had to invent one would be deciding something
   * `toggleTaskTag` already decides.
   */
  onToggle: (name: string) => void;
  restoreFocusTo?: () => HTMLElement | null;
}

export function TagPicker({ task, tags, taskTags, onToggle, restoreFocusTo }: TagPickerProps) {
  const { t } = useT();
  const held = tagsForTask(task.id, tags, taskTags);

  return (
    <div className="tm-tags-row">
      {/* §13.55: each chip carries its own removal, so taking a tag off does
          not mean opening the picker and finding it again. §13.53's colour is
          supplemental — the name is always written out. */}
      <ul className="tm-tag-chips">
        {held.map((tag) => (
          <li key={tag.id}>
            <span className="tm-tag-chip">
              {`#${tag.name}`}
              <button
                type="button"
                className="tm-tag-chip-remove"
                aria-label={t("tasks.removeTag", { value: tag.name })}
                onClick={() => onToggle(tag.name)}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>

      <Popover placement="bottom-end" ownerTaskId={task.id} restoreFocusTo={restoreFocusTo}>
        <PopoverTrigger className="tm-tag-add" aria-label={t("tasks.addTag")}>
          +
        </PopoverTrigger>
        <PopoverContent
          label={t("tasks.tags")}
          className="tm-tag-surface"
          /* Same reasoning as the List picker: the field is the entry point,
             and §13.57 says typing filters. */
          focusOnOpen="always"
        >
          <TagOptions task={task} tags={tags} taskTags={taskTags} onToggle={onToggle} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TagOptions({
  task,
  tags,
  taskTags,
  onToggle,
}: {
  task: Task;
  tags: Tag[];
  taskTags: TaskTag[];
  onToggle: (name: string) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const id = useId();

  const options = useMemo(
    () => tagPickerOptions(task.id, tags, taskTags, query),
    [task.id, tags, taskTags, query],
  );
  const offer = tagCreateOffer(query, tags);
  // Only worth saying once something has been typed. "A tag needs a name" is
  // not news to someone who has not started.
  const refusal = query.trim() ? tagNameRefusal(query) : null;

  const rows = useMemo(
    () => [...options.map((option) => option.tag.name), ...(offer ? [offer] : [])],
    [options, offer],
  );
  const [activeName, setActiveName] = useState("");
  const active = rows.includes(activeName) ? activeName : (rows[0] ?? "");

  /**
   * §13.40: the surface stays open.
   *
   * The query is cleared instead, because after ticking a tag the field's
   * contents describe a search that has already been answered — leaving it
   * would hide every other tag behind a filter the user is finished with.
   */
  function toggle(name: string) {
    onToggle(name);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && active) {
      event.preventDefault();
      toggle(active);
      return;
    }
    if (!isRovingKey(event.key)) return;
    const next = rovingNext(rows, active, event.key);
    if (!next) return;
    event.preventDefault();
    setActiveName(next);
  }

  return (
    <div className="tm-tag-picker" onKeyDown={onKeyDown}>
      <input
        className="tm-tag-search"
        type="text"
        role="combobox"
        value={query}
        placeholder={t("tasks.searchOrCreateTag")}
        aria-label={t("tasks.searchOrCreateTag")}
        aria-expanded
        aria-controls={`${id}-options`}
        aria-activedescendant={active ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        onChange={(event) => setQuery(event.target.value)}
      />

      {/* §13.35's refusal, said rather than merely enforced. Without this the
          Create row simply never appears and the reader is left guessing what
          is wrong with what they typed. */}
      {refusal ? (
        <p className="tm-tag-refusal" role="status">
          {t(`tasks.tagRefusal.${refusal}`)}
        </p>
      ) : null}

      <div
        id={`${id}-options`}
        className="tm-tag-options"
        role="listbox"
        // §13.38: several may be on at once, which is what tells a screen
        // reader that ticking one does not untick the last.
        aria-multiselectable
        aria-label={t("tasks.tags")}
      >
        {options.map(({ tag, selected }) => (
          <button
            key={tag.id}
            id={`${id}-${tag.name}`}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={-1}
            className={`tm-tag-option${selected ? " is-selected" : ""}${
              tag.name === active ? " is-active" : ""
            }`}
            onClick={() => toggle(tag.name)}
            onMouseEnter={() => setActiveName(tag.name)}
          >
            <span className="tm-tag-check" aria-hidden="true">
              {selected ? "✓" : ""}
            </span>
            {`#${tag.name}`}
          </button>
        ))}

        {/* §13.41. Inside the listbox rather than beside it, so the arrow keys
            reach it: creating a tag is how the list is extended, and a row the
            keyboard cannot land on is a row a keyboard user does not have. */}
        {offer ? (
          <button
            key="create"
            id={`${id}-${offer}`}
            type="button"
            role="option"
            aria-selected={false}
            tabIndex={-1}
            className={`tm-tag-option is-create${offer === active ? " is-active" : ""}`}
            onClick={() => toggle(offer)}
            onMouseEnter={() => setActiveName(offer)}
          >
            <span className="tm-tag-check" aria-hidden="true">
              +
            </span>
            {t("tasks.createTag", { value: offer })}
          </button>
        ) : null}

        {options.length === 0 && !offer && !refusal ? (
          <p className="tm-tag-empty">{t("tasks.noTagsYet")}</p>
        ) : null}
      </div>
    </div>
  );
}
