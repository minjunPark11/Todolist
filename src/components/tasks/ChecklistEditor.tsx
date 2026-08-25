// A Task's checklist, as the user edits it (spec §11.21–§11.36).
//
// The shape this settles on, and why: existing lines are records, and the row
// at the bottom is a DRAFT — not an entity, not an empty record waiting to be
// filled. §11.22 offers two ways to create a line and recommends the second
// (create on the first real text); §11.23 warns about empty rows accumulating;
// §11.27 and §11.30 then spend two sections deleting the empty entities the
// first approach creates. A permanent draft row means none is ever created, so
// those three rules are satisfied by construction rather than by cleanup.
//
// That also settles Enter (§11.26). "Commit, create the next, focus it" is the
// loop, and on the draft row it is exactly that. On an existing row it moves
// down to the next line instead of inserting an empty one in the middle —
// same motion for the user, no record that §11.27 would then have to remove.
import { useEffect, useRef, useState } from "react";
import type { CheckItem } from "../../types";
import { useT } from "../../i18n";
import { DeferredInput } from "../kit";

export interface ChecklistEditorProps {
  /** Already in display order — this component does not decide the order. */
  items: CheckItem[];
  onAdd: (text: string) => void;
  /** One transaction, so a paste is one Undo (§11.34). */
  onAddMany: (texts: string[]) => void;
  onRename: (itemId: string, text: string) => void;
  onToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

/** Where focus should go after the next render. The draft row has no id. */
type FocusTarget = { kind: "item"; id: string } | { kind: "draft" } | null;

const LINE_BREAK = /[\r\n\u2028\u2029]/;

/** A pasted block, as the lines it should become (§11.33). */
function pastedLines(text: string): string[] {
  return text
    .split(/\r?\n|[\u2028\u2029]/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function ChecklistEditor({
  items,
  onAdd,
  onAddMany,
  onRename,
  onToggle,
  onDelete,
}: ChecklistEditorProps) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const rowRefs = useRef(new Map<string, HTMLInputElement>());
  const draftRef = useRef<HTMLInputElement>(null);

  // Focus follows the edit rather than the render: after Enter, after a
  // delete, after a Backspace that removed a line. Doing it in an effect is
  // what makes it land on the row that exists NOW — the id being focused may
  // have been created by the same action.
  useEffect(() => {
    if (!focusTarget) return;
    const field = focusTarget.kind === "draft" ? draftRef.current : rowRefs.current.get(focusTarget.id);
    if (field) {
      field.focus();
      // The caret goes to the end, because arriving at a line means continuing
      // it — §11.28's "이전 item 끝으로 focus 이동".
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
    setFocusTarget(null);
  }, [focusTarget, items]);

  /** The row after `index`, or the draft when there is none. */
  function next(index: number): FocusTarget {
    const after = items[index + 1];
    return after ? { kind: "item", id: after.id } : { kind: "draft" };
  }

  function commitDraft(text: string) {
    const trimmed = text.trim();
    // §11.31: whitespace-only is empty, and an empty draft is a row the user
    // is still thinking about rather than a line.
    if (trimmed === "") return false;
    onAdd(trimmed);
    setDraft("");
    return true;
  }

  return (
    <div className="tm-checklist">
      <ul className="tm-checklist-items">
        {items.map((item, index) => (
          <li key={item.id} className={item.checked ? "is-checked" : ""}>
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => onToggle(item.id)}
              // Labelled by its own line, so a screen reader announces which
              // one is being ticked. A line with no text yet falls back to a
              // string of its own rather than the text field's — two controls
              // in a row answering to the same name is not a label.
              aria-label={item.text || t("tasks.checklist.toggle")}
            />
            <DeferredInput
              className="tm-checklist-text"
              value={item.text}
              resetKey={item.id}
              aria-label={t("tasks.checklist.item")}
              ref={(field: HTMLInputElement | null) => {
                if (field) rowRefs.current.set(item.id, field);
                else rowRefs.current.delete(item.id);
              }}
              // §11.30: a line renamed to nothing is a line the user removed.
              // Reaching zero characters is the gesture; there is no separate
              // "empty item" state for it to fall into.
              onCommit={(text) => (text.trim() === "" ? onDelete(item.id) : onRename(item.id, text))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  setFocusTarget(next(index));
                  return;
                }
                // §11.28. Only on an empty line — §11.29 is explicit that
                // Backspace in text is text editing, not a delete.
                if (event.key === "Backspace" && event.currentTarget.value === "") {
                  event.preventDefault();
                  onDelete(item.id);
                  const previous = items[index - 1];
                  setFocusTarget(previous ? { kind: "item", id: previous.id } : { kind: "draft" });
                }
              }}
            />
            <button
              type="button"
              className="tm-checklist-remove"
              onClick={() => onDelete(item.id)}
              aria-label={t("common.delete")}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {/* Not a record. It becomes one when it has text (§11.22, §11.23). */}
      <div className="tm-checklist-draft">
        <input
          ref={draftRef}
          value={draft}
          placeholder={t("tasks.checklist.add")}
          aria-label={t("tasks.checklist.add")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            // §11.27: Enter on an empty row ends the editing rather than
            // leaving something behind.
            if (!commitDraft(draft)) event.currentTarget.blur();
          }}
          // §11.30: what was typed is not lost by clicking away.
          onBlur={() => commitDraft(draft)}
          // §11.33/§11.34: several lines pasted are several items, made in one
          // step so that one Ctrl+Z takes back the paste.
          onPaste={(event) => {
            const text = event.clipboardData?.getData("text") ?? "";
            if (!LINE_BREAK.test(text)) return;
            event.preventDefault();
            const lines = pastedLines(text);
            if (lines.length === 0) return;
            // Anything already typed goes in first, so the draft row is not
            // silently discarded by a paste into it.
            const pending = draft.trim();
            setDraft("");
            onAddMany(pending === "" ? lines : [pending, ...lines]);
          }}
        />
      </div>

      {/* §11.21: an empty checklist says so, rather than showing a bare row
          and leaving the user to guess whether anything is there. */}
      {items.length === 0 ? <p className="tm-checklist-empty">{t("tasks.checklist.empty")}</p> : null}
    </div>
  );
}
