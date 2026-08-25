import { useCallback, useEffect, useRef, useState } from "react";

// Free-text fields used to write straight into the planner store on every
// keystroke. One character then cost a full store replacement, a synchronous
// JSON.stringify of the entire dataset into localStorage, and a debounced
// upload — so typing a paragraph re-serialized the whole database dozens of
// times, and the cost grew with the user's data.
//
// This keeps the text in local state and commits it once the user pauses or
// leaves the field, which turns "per keystroke" back into "per edit".
//
// The commit is captured at edit time rather than read at flush time: the same
// TaskDetail instance is reused across tasks, so a pending edit must land on
// the record it was typed into even if the selection has already moved on.
//
// Task Detail spec §9 asks for four more things a draft has to do, all of them
// MUST, and all of them impossible while the field commits per keystroke:
// Enter commits, Escape abandons, an IME's composition Enter does neither, and
// a required field refuses to commit itself empty. They live here rather than
// at each call site so that the Title, the Description and every field after
// them cannot answer the same question differently.

export interface DeferredTextFieldOptions {
  resetKey?: string;
  delayMs?: number;
  /**
   * One logical line (spec §9.24): Enter commits instead of inserting a break,
   * and pasted newlines collapse to spaces rather than arriving as a title
   * with a hidden second line in it.
   */
  singleLine?: boolean;
  /**
   * Refuse to commit an empty value (spec §9.21).
   *
   * Reverting rather than rejecting, because a Title cleared and left is the
   * user changing their mind about editing — not asking for a nameless Task.
   */
  required?: boolean;
}

/** One logical line: every kind of break becomes a single space (spec §9.24). */
function flattenLines(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ");
}

export function useDeferredTextField(
  value: string,
  commit: (next: string) => void,
  options: DeferredTextFieldOptions = {},
) {
  const { resetKey = "", delayMs = 400, singleLine = false, required = false } = options;
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ value: string; commit: (next: string) => void } | null>(null);
  // The canonical value, for Escape to come back to. A ref and not the closure
  // variable: `revert` is handed to a keydown handler that outlives the render
  // it was made in.
  const canonicalRef = useRef(value);
  canonicalRef.current = value;
  // §9.26: an IME fires `keydown` with Enter to COMMIT the composition, and
  // treating that as "the user is done with the field" ends the edit halfway
  // through a Korean or Japanese word.
  const composingRef = useRef(false);

  const discard = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    discard();
    if (!pending) return;
    // §9.21. The draft goes back to what is stored, so the field shows the
    // Task's real title rather than the empty box the user walked away from.
    if (required && pending.value.trim() === "") {
      setDraft(canonicalRef.current);
      return;
    }
    pending.commit(pending.value);
  }, [discard, required]);

  /** §9.22: Escape abandons the draft and puts the stored value back. */
  const revert = useCallback(() => {
    discard();
    setDraft(canonicalRef.current);
  }, [discard]);

  // Switching records: land any in-flight edit on the old record first, then
  // show the new one's text.
  useEffect(() => {
    flush();
    setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Adopt changes made elsewhere (a sync pulling in a remote edit) — but never
  // while the user has uncommitted keystrokes, or their typing would be
  // overwritten mid-word.
  useEffect(() => {
    if (pendingRef.current === null) setDraft(value);
  }, [value]);

  // An unmount mid-edit (closing the detail drawer) must not drop the text.
  useEffect(() => () => flush(), [flush]);

  const onChange = useCallback(
    (next: string) => {
      const text = singleLine ? flattenLines(next) : next;
      setDraft(text);
      pendingRef.current = { value: text, commit };
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, delayMs);
    },
    [commit, delayMs, flush, singleLine],
  );

  const onKeyDown = useCallback(
    (event: { key: string; nativeEvent?: { isComposing?: boolean }; preventDefault: () => void }) => {
      // Two readings of "still composing", because neither is reliable alone:
      // `isComposing` is absent on some synthetic events, and the composition
      // handlers do not fire in every test environment.
      const composing = composingRef.current || event.nativeEvent?.isComposing === true;

      if (event.key === "Enter" && singleLine) {
        if (composing) return;
        event.preventDefault();
        flush();
        return;
      }

      if (event.key === "Escape") {
        // Only when there is something to abandon. Escape in a field the user
        // has not typed in belongs to whatever is above it — the Drawer, a
        // popover — and swallowing it there would leave them with no way out
        // (spec §18.14: one Escape closes one layer).
        if (composing || pendingRef.current === null) return;
        event.preventDefault();
        revert();
      }
    },
    [flush, revert, singleLine],
  );

  /**
   * §9.24, and the reason `onChange` cannot do this alone.
   *
   * An `<input>` drops line breaks out of pasted text before any handler sees
   * `value` — and it drops them without putting anything in their place, so
   * "First\nSecond" arrives as "FirstSecond" with the two words run together.
   * Reading the clipboard instead is the only point at which the breaks still
   * exist to be turned into spaces.
   */
  const onPaste = useCallback(
    (event: {
      clipboardData: { getData: (format: string) => string } | null;
      currentTarget: { value: string; selectionStart: number | null; selectionEnd: number | null };
      defaultPrevented?: boolean;
      preventDefault: () => void;
    }) => {
      // Someone above already took this paste — the checklist splits a
      // multi-line paste into items (§11.33), which is a different answer to
      // the same event and it gets to give it.
      if (!singleLine || event.defaultPrevented) return;
      const pasted = event.clipboardData?.getData("text") ?? "";
      if (!/[\r\n\u2028\u2029]/.test(pasted)) return;

      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      onChange(`${target.value.slice(0, start)}${flattenLines(pasted)}${target.value.slice(end)}`);
    },
    [onChange, singleLine],
  );

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composingRef.current = false;
  }, []);

  return {
    value: draft,
    onChange,
    onBlur: flush,
    onKeyDown,
    onPaste,
    onCompositionStart,
    onCompositionEnd,
  };
}
