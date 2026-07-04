import type { MiniFocusTimerSnapshot } from "../lib/miniFocusTimer";

export type PlatformKind = "web" | "desktop";
export type FocusTrayAction = "pause" | "resume" | "finish";
export type FocusTrayActionPayload = {
  action: FocusTrayAction;
  sessionId: string;
};

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
}
