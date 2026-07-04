import {
  openMiniFocusTimer,
  supportsMiniFocusTimer,
  updateMiniFocusTimer,
  type MiniFocusTimerSnapshot,
} from "../lib/miniFocusTimer";
import type { PlatformAdapter } from "./types";

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
