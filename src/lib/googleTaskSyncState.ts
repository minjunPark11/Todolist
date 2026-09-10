import type { GoogleTaskChoice, GoogleTaskSnapshot } from "./googleTaskCoordinator";
import type { Task } from "../types";
export interface LocalTaskConflict { id: string; local: Task | null; remote: { id: string; revision: number; data: Task } | null }
export interface GoogleTaskSyncState {
  /** Distinct tasks merged since the preceding review pass, including local saves.
   * This measures merges, not successful uploads. Reset with the account. */
  autoMergedCount?: number;
  /**
   * Occurrences this pass could not send, and why a person has to look.
   *
   * A list and not a single value, and set from a completed pass rather than
   * from a caught error: the pass SKIPS these and carries on, so several can
   * pile up in one run and none of them means the sync failed.
   */
  occurrenceConflicts?: { title: string; date: string }[];
  enabled: boolean; busy: boolean; pending: boolean; error: "" | "changed" | "failed";
  /**
   * What was actually thrown, when something was.
   *
   * `error` says which sentence to show and that sentence is the same for
   * every cause. This is the one fact that separates them, and without it the
   * only way to learn why a sync will not run is to open a browser console —
   * which is not a thing to ask of the person the sync belongs to.
   */
  errorDetail?: string;
  snapshot: GoogleTaskSnapshot | null;
  run?: (choice?: GoogleTaskChoice) => Promise<void>;
  cancel?: (operationId: string) => Promise<void>;
  localConflicts?: LocalTaskConflict[];
  resolveLocal?: (conflict: LocalTaskConflict, choice: "local" | "remote" | "copy") => Promise<void>;
}
let state: GoogleTaskSyncState = { enabled: false, busy: false, pending: false, error: "", snapshot: null };
const listeners = new Set<() => void>();
export const readGoogleTaskSyncState = () => state;
export const subscribeGoogleTaskSync = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function publishGoogleTaskSync(update: GoogleTaskSyncState) { state = update; listeners.forEach(listener => listener()); }
