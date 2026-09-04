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

/**
 * Where notification permission stands (§6.38, §6.40).
 *
 * Four values and not a boolean, because the three ways of "no" call for
 * different words: `unasked` means the app has not asked yet and §6.39 says it
 * should not until the user wants a reminder; `denied` means they said no and
 * §6.40 says the reminder is stored anyway; `unsupported` means the platform
 * has no channel at all, which is nobody's decision to reverse.
 */
export type NotificationAccess = "granted" | "denied" | "unasked" | "unsupported";

/** One file in the app's backup folder (SETTINGS_REVIEW.md 4.6). */
export interface BackupFile {
  name: string;
  path: string;
  size: number;
  /** Milliseconds since the epoch, so it compares with `Date.now()`. */
  modifiedAt: number;
}

/**
 * Automatic backups, desktop only.
 *
 * Every method is a Rust command, so this surface cannot be pointed anywhere
 * else: no method takes a directory, and the one that takes a file name only
 * accepts names this app generated. The whole path lives in Rust for that
 * reason.
 *
 * On the web every method other than `supported()` rejects. There is no honest
 * web implementation: a copy kept in the origin's own storage disappears with
 * the data it was meant to outlive.
 */
export interface PlatformBackups {
  supported(): boolean;
  dir(): Promise<string>;
  list(): Promise<BackupFile[]>;
  read(name: string): Promise<string>;
  /** `stamp` names the file; `keep` is how many survive, 0 for all. */
  write(contents: string, stamp: string, keep: number): Promise<BackupFile>;
  /** Shows the folder in the OS file manager. */
  reveal(): Promise<void>;
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
  /**
   * Whether a reminder could be DELIVERED right now (spec §6.38).
   *
   * Deliberately a different question from whether one is stored. Chapter 26
   * §26.6.2 is about being able to tell those two apart: "the reminder never
   * saved" is a data bug and "there was no way to send it" is a platform fact,
   * and a UI that cannot distinguish them tells the user the wrong thing about
   * both.
   */
  notificationAccess(): Promise<NotificationAccess>;
  /**
   * Ask, and answer with what the user said.
   *
   * The result matters because §6.39 asks at the moment of intent rather than
   * at startup — the caller has a reminder in hand and needs to know whether
   * to say anything about it.
   */
  requestNotificationPermission(): Promise<NotificationAccess>;
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
  backups: PlatformBackups;
  deepLink: PlatformDeepLink;
}

/**
 * `focusflow://` URLs the OS hands this app
 * (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
 *
 * Desktop only. The web build never needs one — its OAuth callback is an
 * ordinary https redirect back into the page — so `take` answers null and
 * `subscribe` unsubscribes nothing.
 *
 * Note what `subscribe` does NOT deliver: the URL. It fires with no payload,
 * and the handler is expected to call `take`. One consumption point, because
 * the same link can arrive by several roads (argv, a single-instance forward,
 * the platform's own event) and an OAuth code spent twice reads as a failed
 * connection.
 */
export interface PlatformDeepLink {
  /** The waiting URL, handed over once. Null when there is none. */
  take(): Promise<string | null>;
  /** Called when one arrives while the app is already up. Returns an unsubscribe. */
  subscribe(handler: () => void): Promise<() => void>;
}
