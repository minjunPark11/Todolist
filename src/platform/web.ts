import {
  openMiniFocusTimer,
  supportsMiniFocusTimer,
  updateMiniFocusTimer,
  type MiniFocusTimerSnapshot,
} from "../lib/miniFocusTimer";
import type { PlatformAdapter } from "./types";

function backupsUnsupported(): never {
  // Not a silent no-op: a backup that quietly did not happen is worse than one
  // that says it cannot. There is no honest web version either — a copy inside
  // the origin's own storage dies with the data it was meant to outlive.
  throw new Error("Automatic backups are only available in the desktop app.");
}

export const webPlatform: PlatformAdapter = {
  kind: "web",

  storage: {
    async get(key) {
      return window.localStorage.getItem(key);
    },
    async set(key, value) {
      window.localStorage.setItem(key, value);
    },
    async remove(key) {
      window.localStorage.removeItem(key);
    },
    getSync(key) {
      return window.localStorage.getItem(key);
    },
    setSync(key, value) {
      window.localStorage.setItem(key, value);
    },
    removeSync(key) {
      window.localStorage.removeItem(key);
    },
  },

  async notify(options) {
    if (!("Notification" in window) || window.Notification.permission !== "granted") return false;
    try {
      new window.Notification(options.title, { body: options.body });
      return true;
    } catch {
      return false;
    }
  },

  async notificationAccess() {
    if (!("Notification" in window)) return "unsupported";
    // `default` is the browser's word for "never asked"; §6.39 wants that told
    // apart from a refusal, because only one of the two is worth asking about.
    return window.Notification.permission === "default" ? "unasked" : window.Notification.permission;
  },

  async requestNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (window.Notification.permission !== "default") return window.Notification.permission;
    const result = await window.Notification.requestPermission().catch(() => "denied" as const);
    return result === "granted" ? "granted" : "denied";
  },

  aiFetch(input, init) {
    return window.fetch(input, init);
  },

  async getAppVersion() {
    return __APP_VERSION__;
  },

  /**
   * There is nothing to update. A web build IS its latest version — a reload
   * is the whole install — so the honest answer is that this platform has no
   * update to check for.
   *
   * It used to `fetch` GitHub's `latest.json` from the page. That request is
   * cross-origin to github.com with no CORS header, so in a browser it could
   * only ever reject, and the settings screen carried a standing "Could not
   * check for updates. Failed to fetch" that described the browser rather
   * than the app. The settings row asks `platform.kind` and does not offer the
   * button here, so this is the belt to that pair of braces.
   */
  async checkForUpdate() {
    return { status: "unavailable" as const, message: "The web app updates itself." };
  },

  /** Unreachable from the settings row, which is desktop-only; kept because
      the interface has the method and the releases page is the right door. */
  async installUpdate() {
    await webPlatform.openExternal("https://github.com/minjunPark11/Todolist/releases/latest");
  },

  miniFocusTimer: {
    supported() {
      return supportsMiniFocusTimer();
    },
    async open(snapshot: MiniFocusTimerSnapshot) {
      return openMiniFocusTimer(snapshot);
    },
    async update(snapshot: MiniFocusTimerSnapshot) {
      updateMiniFocusTimer(snapshot);
    },
    async clear() {
      updateMiniFocusTimer({
        sessionId: "",
        title: "Focus session",
        time: "--:--",
        status: "cancelled",
      });
    },
    async getSnapshot() {
      return null;
    },
    async dispatchAction() {
      return undefined;
    },
    async subscribeSnapshot() {
      return () => undefined;
    },
    async subscribeAction() {
      return () => undefined;
    },
  },

  // The web build's OAuth callback is an ordinary redirect back into the page,
  // so there is no scheme to catch (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
  deepLink: {
    async take() {
      return null;
    },
    async subscribe() {
      return () => undefined;
    },
  },

  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  backups: {
    supported() {
      return false;
    },
    async dir() {
      return backupsUnsupported();
    },
    async list() {
      return backupsUnsupported();
    },
    async read() {
      return backupsUnsupported();
    },
    async write() {
      return backupsUnsupported();
    },
    async reveal() {
      return backupsUnsupported();
    },
  },
};
