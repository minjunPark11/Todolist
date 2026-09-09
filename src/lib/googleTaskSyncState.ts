import type { GoogleTaskChoice, GoogleTaskSnapshot } from "./googleTaskCoordinator";
import type { Task } from "../types";
export interface LocalTaskConflict { id: string; local: Task | null; remote: { id: string; revision: number; data: Task } | null }
export interface GoogleTaskSyncState {
  enabled: boolean; busy: boolean; pending: boolean; error: "" | "changed" | "failed";
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
