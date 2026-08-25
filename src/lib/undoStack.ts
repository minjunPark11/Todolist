// Global undo registry for Ctrl+Z. Stores restore snapshots of whichever
// data store changed, pushed right before each user-facing mutation. Rapid
// consecutive pushes (one user action fanning out to several stores) merge
// into one group so a single Ctrl+Z reverts the whole action.
/**
 * Restores one store to a previous snapshot.
 *
 * Returning `false` DECLINES: the snapshot describes a store that no longer
 * exists, so applying it would not undo an edit — it would overwrite whatever
 * replaced it. Spec §16.21 states the rule generally: a late answer must not
 * be written over state that has moved on. An entry pushed before a remote
 * load lands is exactly that, and restoring it would take the account's
 * records off this device and then, on the next save, off the account.
 */
type UndoFn = () => boolean | void;

interface UndoGroup {
  fns: UndoFn[];
  at: number;
}

const stack: UndoGroup[] = [];
const LIMIT = 100;
const GROUP_WINDOW_MS = 150;

export function pushUndo(fn: UndoFn) {
  const now = Date.now();
  const last = stack[stack.length - 1];
  if (last && now - last.at <= GROUP_WINDOW_MS) {
    last.fns.push(fn);
    last.at = now;
    return;
  }
  stack.push({ fns: [fn], at: now });
  if (stack.length > LIMIT) stack.shift();
}

// Runs the newest group's restores (newest first, so the oldest snapshot in
// the group wins). Returns false when there is nothing to undo.
//
// A group whose restores all decline is discarded and the next one tried, so
// Ctrl+Z reaches the newest edit it can still undo instead of doing nothing
// visible while the caller reports success.
export function popUndo(): boolean {
  for (;;) {
    const group = stack.pop();
    if (!group) return false;
    let applied = false;
    for (let index = group.fns.length - 1; index >= 0; index -= 1) {
      if (group.fns[index]() !== false) applied = true;
    }
    if (applied) return true;
  }
}
