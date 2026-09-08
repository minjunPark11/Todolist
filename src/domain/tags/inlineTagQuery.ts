// The `#…` the caret is standing in, if it is standing in one
// (TASK_DETAIL_TAG_INPUT_DESIGN.md §3.5).
//
// Pure, and deliberately the whole decision: whether the menu is open, what it
// is filtering by, and which characters disappear when something is picked all
// come from this one answer. What sits above it opens and closes a popover.
import { isUserTag } from "./tags";

export interface InlineTagQuery {
  /** What has been typed after the `#`. Empty right after the `#` itself. */
  query: string;
  /** Index of the `#`, and one past the last character of the token. */
  from: number;
  to: number;
}

/**
 * `("본문 #학", 4)` → `{ query: "학", from: 3, to: 4 }`.
 *
 * The rules are the quick add's (`splitInlineTags`), for the reason that one
 * rule described in one sentence is worth more than two that are nearly the
 * same:
 *
 * - The `#` STARTS a word. `C#` is a task about the letter C, not a tag.
 * - No whitespace between the `#` and the caret. A space ends the token, and
 *   typing on after it is writing a sentence, not choosing a tag.
 * - `space:`/`group:` markers are not user tags, so a caret inside one opens
 *   nothing (`isUserTag`).
 */
export function inlineTagQuery(text: string, caret: number): InlineTagQuery | null {
  if (caret < 0 || caret > text.length) return null;

  // Walk back from the caret to the `#`, refusing at the first thing that ends
  // a token. Backwards because the token is behind the caret; forwards would
  // have to find its start first, which is this loop anyway.
  let index = caret - 1;
  while (index >= 0) {
    const char = text[index]!;
    if (char === "#") break;
    if (/\s/u.test(char)) return null;
    index -= 1;
  }
  if (index < 0) return null;

  const before = index > 0 ? text[index - 1]! : "";
  if (before && !/\s/u.test(before)) return null;

  const query = text.slice(index + 1, caret);
  // An empty query is a `#` just typed: the menu opens on everything, which is
  // what a picker with no filter shows anyway.
  if (query && !isUserTag(query)) return null;
  return { query, from: index, to: caret };
}

/**
 * The text with the token taken out.
 *
 * Only the token — `본문 #학` becomes `본문 ` and not `본문`. The space in front
 * of the `#` was the user's typing and the caret is about to sit after it.
 */
export function withoutTagToken(text: string, token: InlineTagQuery): string {
  return `${text.slice(0, token.from)}${text.slice(token.to)}`;
}
