// The Task's body, and the `#` menu that stands in it
// (TASK_DETAIL_TAG_INPUT_DESIGN.md §3).
//
// The field itself is the shared `DeferredTextarea`; what this adds is a menu
// that opens where the caret is standing in a `#…` token, and closes when it
// is not. The whole decision about whether that is happening comes from one
// pure function (`inlineTagQuery`), so this file is about opening a popover
// and putting a name where a token was.
import { useRef, useState } from "react";
import type { Tag, Task, TaskTag } from "../../types";
import { inlineTagQuery, withoutTagToken, type InlineTagQuery } from "../../domain/tags/inlineTagQuery";
import { tagCreateOffer, tagOptionsFor } from "../../domain/tags/tagPicker";
import { tagsForTask, tagKeyFor } from "../../domain/tags/tags";
import { DeferredTextarea, type TextFieldControl } from "../kit";
import { FloatingMenu, rectOfElement } from "../floating";
import { useT } from "../../i18n";

interface TaskBodyFieldProps {
  task: Task;
  tags: Tag[];
  taskTags: TaskTag[];
  /** The Detail's own toggle. §3.8 is why this file never calls it to REMOVE. */
  onToggleTag: (name: string) => void;
  onCommit: (description: string) => void;
}

export function TaskBodyField({ task, tags, taskTags, onToggleTag, onCommit }: TaskBodyFieldProps) {
  const { t } = useT();
  const box = useRef<HTMLTextAreaElement | null>(null);
  const control = useRef<TextFieldControl | null>(null);
  const [token, setToken] = useState<InlineTagQuery | null>(null);

  const held = tagsForTask(task.id, tags, taskTags);
  const heldKeys = new Set(held.map((tag) => tagKeyFor(tag.name)));
  const options = token ? tagOptionsFor(held.map((tag) => tag.name), tags, token.query) : [];
  // The create row is `TagPicker`'s (§13.41): it is how the list is extended,
  // and refusing to extend it from here would be the same picker with a rule
  // nobody could see.
  const offer = token ? tagCreateOffer(token.query, tags) : null;

  /** Reads the caret after every change to it — typing, clicking, arrowing. */
  function readCaret() {
    const el = box.current;
    if (!el) return;
    setToken(inlineTagQuery(el.value, el.selectionStart ?? 0));
  }

  /**
   * §3.8: attach, never toggle.
   *
   * The Detail's chip-side callback is a toggle, and a toggle here would take
   * the tag OFF when someone types the name of a tag the task already has —
   * which is the opposite of what typing a name means.
   */
  function attach(name: string) {
    if (!token) return;
    if (!heldKeys.has(tagKeyFor(name))) onToggleTag(name);
    // Tag first, text second (§3.7): the write that attaches re-renders this
    // Detail, and a text edit made before it can be lost in that render.
    control.current?.replace(token.from, token.to, "");
    setToken(null);
    const el = box.current;
    if (el) {
      el.focus();
      const caret = token.from;
      // The caret goes where the token was, not to the end: the sentence is
      // usually being written from that point on.
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
    }
  }

  return (
    <>
      <DeferredTextarea
        value={task.description}
        // One line, and then as many as the writing needs (§6).
        rows={1}
        autoGrow
        textareaRef={box}
        controlRef={control}
        placeholder={t("taskDetail.addDescription")}
        onCommit={onCommit}
        resetKey={task.id}
        aria-label={t("tasks.description")}
        onInput={readCaret}
        onClick={readCaret}
        onKeyUp={readCaret}
        onBlur={() => setToken(null)}
        onKeyDown={(event) => {
          if (!token) return;
          // Escape closes the menu and leaves the text alone. It does not
          // reach the Detail: a menu on top is what Escape is about (Q2).
          if (event.key === "Escape") {
            event.stopPropagation();
            setToken(null);
            return;
          }
          // §3.6: the Enter that ends a Korean composition is a candidate
          // being chosen, not a tag. Without this the first Enter of every
          // composed name picks whatever the menu happened to be showing.
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          const first = options[0]?.tag.name ?? offer;
          if (!first) return;
          event.preventDefault();
          attach(first);
        }}
      />

      {token && (options.length > 0 || offer) ? (
        <FloatingMenu
          label={t("tasks.tags")}
          // The field's own box, not the caret's: measuring a caret inside a
          // textarea means mirroring its text in a hidden element and matching
          // the font, the wrapping and the scroll (§3.4). The menu is a line or
          // two from the caret either way.
          anchor={rectOfElement(box.current) ?? { x: 0, y: 0 }}
          placement="bottom-start"
          ownerTaskId={task.id}
          onDismiss={() => setToken(null)}
          className="ff-context-menu tm-tag-inline-menu"
        >
          {options.map(({ tag, selected }) => (
            <button
              key={tag.id}
              type="button"
              role="menuitem"
              className={`tm-tag-option${selected ? " is-selected" : ""}`}
              // `mousedown`, not `click`: the field blurs on the way to a
              // click, and the blur closes the menu before it lands.
              onMouseDown={(event) => {
                event.preventDefault();
                attach(tag.name);
              }}
            >
              <span className="tm-tag-check" aria-hidden="true">
                {selected ? "✓" : ""}
              </span>
              {tag.name}
            </button>
          ))}
          {offer ? (
            <button
              type="button"
              role="menuitem"
              className="tm-tag-option is-create"
              onMouseDown={(event) => {
                event.preventDefault();
                attach(offer);
              }}
            >
              <span className="tm-tag-check" aria-hidden="true">
                +
              </span>
              {t("tasks.createTag", { value: offer })}
            </button>
          ) : null}
        </FloatingMenu>
      ) : null}
    </>
  );
}
