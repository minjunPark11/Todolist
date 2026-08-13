// Global undo registry for Ctrl+Z. Stores restore snapshots of whichever
// data store changed, pushed right before each user-facing mutation. Rapid
// consecutive pushes (one user action fanning out to several stores) merge
// into one group so a single Ctrl+Z reverts the whole action.
type UndoFn = () => void;

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
export function popUndo(): boolean {
  const group = stack.pop();
  if (!group) return false;
  for (let index = group.fns.length - 1; index >= 0; index -= 1) group.fns[index]();
  return true;
}
