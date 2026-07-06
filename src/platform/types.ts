import type { MiniFocusTimerSnapshot } from "../lib/miniFocusTimer";

export type PlatformKind = "web" | "desktop";
export type FocusTrayAction = "pause" | "resume" | "finish";
export type FocusTrayActionPayload = {
  action: FocusTrayAction;
  sessionId: string;
};
export type AppUpdateStatus =
  | { status: "current"; latestVersion?: string }
  | { status: "available"; latestVersion: string }
  | { status: "unavailable"; message?: string };

// A file discovered under a scanned root (e.g. an Obsidian vault). `relativePath`
// is relative to the root passed to `scanMarkdownFiles`; when returned from
// `getFileMetadata` (no root context) it falls back to the file's base name.
export interface PlatformFileEntry {
  path: string;
  relativePath: string;
  size: number;
  modifiedAt: number;
}

export interface ScanMarkdownFilesOptions {
  extensions: string[];
  excludedFolders: string[];
  maxFiles?: number;
}

// Read-only, desktop-only file access used by the local knowledge-base
// feature (see KNOWLEDGE_BASE_DESIGN.md). Never exposes a write path — the
// Obsidian vault is treated as a read-only source (design principles 7-8).
export interface PlatformFiles {
  supported(): boolean;
  // Opens a native folder picker and grants this session read access to the
  // chosen folder. Returns null if the user cancels.
  pickFolder(): Promise<string | null>;
  // Re-grants read access to a previously chosen folder. Needed because the
  // OS-level scope granted by pickFolder() is not persisted across app
  // restarts — call this on load whenever a saved vault path exists.
  grantAccess(path: string): Promise<void>;
  scanMarkdownFiles(root: string, options: ScanMarkdownFilesOptions): Promise<PlatformFileEntry[]>;
  // Rejects if the file exceeds maxBytes (checked via metadata before reading).
  readTextFile(path: string, maxBytes?: number): Promise<string>;
  getFileMetadata(path: string): Promise<PlatformFileEntry | null>;
  getDefaultKnowledgeDbPath(): Promise<string>;
  // Creates the directory that getDefaultKnowledgeDbPath()'s file lives in,
  // if it doesn't already exist. Must be called before opening the default
  // knowledge DB — Tauri does not guarantee the app data dir pre-exists.
  ensureKnowledgeDbDir(): Promise<void>;
}

export interface PlatformAdapter {
  kind: PlatformKind;
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    getSync(key: string): string | null;
    setSync(key: string, value: string): void;
    removeSync(key: string): void;
  };
  notify(options: { title: string; body?: string }): Promise<boolean>;
  requestNotificationPermission(): Promise<void>;
  aiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  getAppVersion(): Promise<string>;
  checkForUpdate(currentVersion: string): Promise<AppUpdateStatus>;
  installUpdate(): Promise<void>;
  miniFocusTimer: {
    supported(): boolean;
    open(snapshot: MiniFocusTimerSnapshot): Promise<boolean>;
    update(snapshot: MiniFocusTimerSnapshot): Promise<void>;
    clear(): Promise<void>;
    getSnapshot(): Promise<MiniFocusTimerSnapshot | null>;
    dispatchAction(payload: FocusTrayActionPayload): Promise<void>;
    subscribeSnapshot(handler: (snapshot: MiniFocusTimerSnapshot | null) => void): Promise<() => void>;
    subscribeAction(handler: (payload: FocusTrayActionPayload) => void): Promise<() => void>;
  };
  openExternal(url: string): Promise<void>;
  files: PlatformFiles;
}
