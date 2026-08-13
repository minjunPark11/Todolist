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
export function useDeferredTextField(
  value: string,
  commit: (next: string) => void,
  options: { resetKey?: string; delayMs?: number } = {},
) {
  const { resetKey = "", delayMs = 400 } = options;
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ value: string; commit: (next: string) => void } | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) pending.commit(pending.value);
  }, []);

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
      setDraft(next);
      pendingRef.current = { value: next, commit };
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, delayMs);
    },
    [commit, delayMs, flush],
  );

  return { value: draft, onChange, onBlur: flush };
}
