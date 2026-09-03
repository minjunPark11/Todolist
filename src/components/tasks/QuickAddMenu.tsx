// The quick add's `⌄` — everything a task can be given before it exists
// (QUICK_ADD_INPUT_BOX_DESIGN.md §4).
//
// It writes nothing. Every row hands a value back to the draft the form is
// holding, and the draft is laid over `resolveCreateContext`'s answer at commit
// time (§5.1) — which is why nothing here has to know what a Scope decided.
// Priority, the List and the Tags are the three things the Scope was deciding
// SILENTLY; this is where a person overrules it.
//
// The two submenus are nested Popovers, not a second menu system. §19.24's
// stack is built for this: a layer registers its parent, a press inside a
// child keeps its ancestors open (`dismissedByPointer` walks `ancestorIds`),
// and Escape peels one at a time.
import type { List, SidebarFolder, Tag, TaskPriority } from "../../types";
import { PRIORITY_LEVELS } from "../../domain/tasks/priority";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { ListOptions } from "./ListPicker";
import { TagOptions } from "./TagPicker";
import { useT } from "../../i18n";

export interface QuickAddMenuProps {
  priority: TaskPriority;
  onPriority: (level: TaskPriority) => void;
  /** The List the task would land in — the resolver's answer or the draft's. */
  listId: string;
  lists: List[];
  folders: SidebarFolder[];
  onList: (listId: string) => void;
  tags: Tag[];
  /** Names, because a tag typed here may not exist yet (§5). */
  tagNames: string[];
  onToggleTag: (name: string) => void;
  isNote: boolean;
  onToggleNote: () => void;
}

export function QuickAddMenu({
  priority,
  onPriority,
  listId,
  lists,
  folders,
  onList,
  tags,
  tagNames,
  onToggleTag,
  isNote,
  onToggleNote,
}: QuickAddMenuProps) {
  const { t } = useT();

  return (
    <Popover type="menu" placement="bottom-end">
      <PopoverTrigger className="tm-quickadd-more" aria-label={t("tasks.quickAdd.more")}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
          <path
            d="M6.5 9.5l5.5 5.5 5.5-5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </PopoverTrigger>

      <PopoverContent label={t("tasks.quickAdd.more")} className="ff-context-menu tm-quickadd-menu">
        <PriorityRow current={priority} onChange={onPriority} />

        <div className="ff-context-menu-divider" role="separator" />

        {/* The List, named rather than labelled: the row says where the task
            is going, which is the same sentence the placeholder says and the
            reason §10.3 put the List's name in the field at all. */}
        <Popover placement="right-start">
          <PopoverTrigger className="ff-context-menu-item tm-quickadd-row">
            <span className="ff-context-menu-label">{nameOf(lists, listId, t("tasks.inbox"))}</span>
            <span className="tm-quickadd-row-more" aria-hidden="true">
              ›
            </span>
          </PopoverTrigger>
          <PopoverContent label={t("tasks.addList")} className="tm-list-surface" focusOnOpen="always">
            <ListOptions currentId={listId} lists={lists} folders={folders} onMove={onList} />
          </PopoverContent>
        </Popover>

        <Popover placement="right-start">
          <PopoverTrigger className="ff-context-menu-item tm-quickadd-row">
            <span className="ff-context-menu-label">
              {t("tasks.tags")}
              {/* What is already on the draft, where there is anything — a row
                  that said only "Tags" would make the reader open it to find
                  out whether they had already answered. */}
              {tagNames.length > 0 ? <small>{tagNames.map((name) => `#${name}`).join(" ")}</small> : null}
            </span>
            <span className="tm-quickadd-row-more" aria-hidden="true">
              ›
            </span>
          </PopoverTrigger>
          <PopoverContent label={t("tasks.tags")} className="tm-tag-surface" focusOnOpen="always">
            <TagOptions selectedNames={tagNames} tags={tags} onToggle={onToggleTag} />
          </PopoverContent>
        </Popover>

        <div className="ff-context-menu-divider" role="separator" />

        <NoteToggle isNote={isNote} onToggle={onToggleNote} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * §4's four flags, as a row rather than a list.
 *
 * The Detail's popover draws the same four as labelled rows, and that is the
 * right shape there — it is the only thing in that surface. Here the levels
 * are one line of a menu, and four rows would make Priority as tall as
 * everything else put together. The COLOURS are the same either way: both read
 * `--priority-*` (TASK_PRIORITY_CHECKBOX_DESIGN.md §3), which is the part that
 * would actually hurt to have twice.
 */
function PriorityRow({
  current,
  onChange,
}: {
  current: TaskPriority;
  onChange: (level: TaskPriority) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();

  return (
    <div className="tm-quickadd-priority" role="radiogroup" aria-label={t("tasks.priority")}>
      <span className="tm-quickadd-menu-head">{t("tasks.priority")}</span>
      <div className="tm-quickadd-flags">
        {/* Highest first, which is the order the reference draws and the order
            a row of swatches reads in: the loudest colour is the one being
            looked for. */}
        {[...PRIORITY_LEVELS].reverse().map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={level === current}
            aria-label={t(`tasks.priority.${level}`)}
            title={t(`tasks.priority.${level}`)}
            className={`tm-quickadd-flag is-${level}${level === current ? " is-current" : ""}`}
            onClick={() => {
              close();
              onChange(level);
            }}
          >
            <span aria-hidden="true">{level === "none" ? "⚐" : "⚑"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Separate so choosing can close the surface it is inside (§19.90). */
function NoteToggle({ isNote, onToggle }: { isNote: boolean; onToggle: () => void }) {
  const { t } = useT();
  const { close } = usePopoverSurface();

  return (
    <button
      type="button"
      role="menuitem"
      className="ff-context-menu-item"
      onClick={() => {
        close();
        onToggle();
      }}
    >
      <span className="ff-context-menu-label">
        {t(isNote ? "tasks.quickAdd.toTask" : "tasks.quickAdd.toNote")}
      </span>
    </button>
  );
}

function nameOf(lists: List[], listId: string, fallback: string): string {
  return lists.find((list) => list.id === listId)?.name ?? fallback;
}
