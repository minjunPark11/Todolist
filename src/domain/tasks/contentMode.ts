// Turning prose into a checklist, and back (spec §11.6–§11.20).
//
// The rule the whole chapter is built around is §11.7's: silent data loss is
// forbidden. A mode toggle is not a view switch — it moves the user's words
// between two different places — so both directions here are written to be
// reversible, and the caller applies them as one transaction (§11.14) that
// one Undo takes back (§11.15).
//
// The reverse direction is where the spec offers a choice. §11.18 says V1 may
// simply drop which lines were ticked, and calls the Markdown checkbox form a
// "권장 확장안" for editors with a Markdown representation. This takes the
// extension: dropping the ticks is irreversible, and an Undo that cannot
// restore what it undid is not one. Writing `- [x]` costs the user some
// syntax in their text and keeps the information; losing it costs them the
// state of every finished line.
//
// §11.20 draws the line that makes this safe: text that LOOKS like a checkbox
// is never silently read as one. Nothing here runs on load, on save, or on a
// keystroke — only when the user asks for the conversion.
import type { CheckItem } from "../../types";

/** One line of a checklist, before it becomes a record. */
export interface CheckItemDraft {
  text: string;
  checked: boolean;
}

// A Markdown checkbox, which is what this module writes on the way out and so
// the first thing it looks for on the way back in. The marker is required —
// `[x]` alone in a sentence is not a checkbox.
const CHECKBOX = /^[-*+]\s+\[([ xX])\](?:\s+(.*))?$/;
// A bullet. The marker has to be followed by a space or nothing at all:
// without that, "-5 degrees below" loses its minus sign, which is §11.10's
// "과도하게 제거하지 않는다".
const BULLET = /^[-*+•](?:\s+(.*))?$/;
// An ordered-list prefix (§11.11). Same reasoning: "1.5x speed" keeps its
// number, because what follows the dot is a digit rather than a space.
const ORDERED = /^\d+[.)](?:\s+(.*))?$/;

/**
 * The lines a Description becomes (§11.8).
 *
 * Blank lines are separators, not items (§11.9); text is trimmed (§11.32);
 * and a line that is nothing but a bullet marker produces no item rather than
 * an empty one (§11.31).
 */
export function checkItemDraftsFromText(description: string): CheckItemDraft[] {
  const drafts: CheckItemDraft[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;

    const checkbox = CHECKBOX.exec(line);
    if (checkbox) {
      const text = (checkbox[2] ?? "").trim();
      if (text !== "") drafts.push({ text, checked: checkbox[1] !== " " });
      continue;
    }

    // One prefix, not both: "- 1. Prepare" is a bullet whose text starts with
    // a number, and stripping twice would silently edit the user's line.
    // A marker with nothing after it is a bullet the user had not filled in
    // yet, so the group can legitimately be empty — hence the explicit match
    // check rather than `?? line`, which would put the marker back.
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    const stripped = bullet ? bullet[1] ?? "" : ordered ? ordered[1] ?? "" : line;
    const text = stripped.trim();
    if (text !== "") drafts.push({ text, checked: false });
  }
  return drafts;
}

/**
 * The Description a checklist becomes (§11.17, §11.19).
 *
 * Markdown checkbox form, so `checkItemDraftsFromText` reads it back exactly
 * — the ticks included. That round trip is what makes the conversion Undoable
 * in both directions rather than only forwards.
 */
export function descriptionFromCheckItems(items: CheckItem[]): string {
  return items.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`).join("\n");
}

/**
 * The records those drafts become.
 *
 * Keys are spaced (`sortKey`) rather than indices, so a line dropped between
 * two others later needs one write instead of renumbering the list — the same
 * contract `sortKeyForNewCheckItem` follows.
 */
export function checkItemsFromDrafts(
  taskId: string,
  drafts: CheckItemDraft[],
  createId: (index: number) => string,
  now: string,
  step = 1000,
): CheckItem[] {
  return drafts.map((draft, index) => ({
    id: createId(index),
    taskId,
    text: draft.text,
    checked: draft.checked,
    completedAt: draft.checked ? now : "",
    sortKey: index * step,
    createdAt: now,
    updatedAt: now,
  }));
}
