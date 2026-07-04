import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MiniFocusTimerSnapshot } from "../lib/miniFocusTimer";
import { webPlatform } from "./web";
import type { FocusTrayActionPayload, PlatformAdapter } from "./types";

type TauriGlobal = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  const tauriWindow = window as TauriGlobal;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

export const tauriPlatform: PlatformAdapter = {
  ...webPlatform,
  kind: "desktop",

  async notify(options) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (!granted) return false;
      sendNotification(options);
      return true;
    } catch {
      return webPlatform.notify(options);
    }
  },

  async requestNotificationPermission() {
    try {
      if (!(await isPermissionGranted())) {
        await requestPermission();
      }
    } catch {
      await webPlatform.requestNotificationPermission();
    }
  },

  async aiFetch(input, init) {
    return tauriFetch(input, init);
  },

  miniFocusTimer: {
    supported() {
      return true;
    },
    async open(snapshot) {
      await invoke("open_focus_mini_timer", { snapshot }).catch(() => {
        void tauriPlatform.miniFocusTimer.update(snapshot);
      });
      return true;
    },
    async update(snapshot) {
      await invoke("update_focus_tray", { snapshot }).catch(() => undefined);
    },
    async clear() {
      await invoke("clear_focus_tray").catch(() => undefined);
    },
    async getSnapshot() {
      return invoke<MiniFocusTimerSnapshot | null>("get_focus_tray_snapshot").catch(() => null);
    },
    async dispatchAction(payload) {
      await invoke("dispatch_focus_tray_action", { action: payload.action, sessionId: payload.sessionId }).catch(() => undefined);
    },
    async subscribeSnapshot(handler) {
      return listen<MiniFocusTimerSnapshot | null>("focus-tray-update", (event) => {
        handler(event.payload);
      });
    },
    async subscribeAction(handler) {
      return listen<FocusTrayActionPayload>("focus-tray-action", (event) => {
        handler(event.payload);
      });
    },
  },

  async openExternal(url) {
    await openUrl(url);
  },
};
