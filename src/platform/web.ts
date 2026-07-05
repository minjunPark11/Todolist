import {
  openMiniFocusTimer,
  supportsMiniFocusTimer,
  updateMiniFocusTimer,
  type MiniFocusTimerSnapshot,
} from "../lib/miniFocusTimer";
import type { PlatformAdapter } from "./types";

function compareVersions(a: string, b: string) {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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

  async requestNotificationPermission() {
    if (!("Notification" in window) || window.Notification.permission !== "default") return;
    await window.Notification.requestPermission().catch(() => undefined);
  },

  aiFetch(input, init) {
    return window.fetch(input, init);
  },

  async getAppVersion() {
    return __APP_VERSION__;
  },

  async checkForUpdate(currentVersion) {
    try {
      const response = await window.fetch("https://github.com/minjunPark11/Todolist/releases/latest/download/latest.json", {
        cache: "no-store",
      });
      if (!response.ok) {
        return { status: "unavailable", message: `Update check failed (${response.status})` };
      }
      const latest = (await response.json()) as { version?: unknown };
      const latestVersion = typeof latest.version === "string" ? latest.version : "";
      if (!latestVersion) {
        return { status: "unavailable", message: "Latest version metadata is unavailable." };
      }
      return compareVersions(latestVersion, currentVersion) > 0
        ? { status: "available", latestVersion }
        : { status: "current", latestVersion };
    } catch (error) {
      return { status: "unavailable", message: error instanceof Error ? error.message : "Update check failed." };
    }
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

  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
};
