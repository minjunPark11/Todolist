import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { MiniFocusTimerSnapshot } from "../lib/miniFocusTimer";
import { webPlatform } from "./web";
import type { BackupFile, FocusTrayActionPayload, PlatformAdapter } from "./types";

type TauriGlobal = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  const tauriWindow = window as TauriGlobal;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

/**
 * A refusal seen in this session (§6.38).
 *
 * The Tauri notification plugin exposes `isPermissionGranted` and nothing that
 * reports the opposite, so "not granted" covers both "never asked" and "said
 * no". Remembering the answer to our own request is what lets §6.40's notice
 * appear at all on the desktop; it is not persisted, because the OS setting is
 * the truth and a stale copy of it would be worse than asking again.
 */
let deniedThisSession = false;

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

  async notificationAccess() {
    try {
      if (await isPermissionGranted()) return "granted";
      // The plugin can say "granted" and nothing else — there is no check that
      // reports a refusal — so a remembered "denied" from a request in this
      // session is the only way this build knows about one.
      return deniedThisSession ? "denied" : "unasked";
    } catch {
      return webPlatform.notificationAccess();
    }
  },

  async requestNotificationPermission() {
    try {
      if (await isPermissionGranted()) return "granted";
      const permission = await requestPermission();
      deniedThisSession = permission !== "granted";
      return permission === "granted" ? "granted" : "denied";
    } catch {
      return webPlatform.requestNotificationPermission();
    }
  },

  async aiFetch(input, init) {
    return tauriFetch(input, init);
  },

  async getAppVersion() {
    return getVersion().catch(() => webPlatform.getAppVersion());
  },

  async checkForUpdate(currentVersion) {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      return update ? { status: "available", latestVersion: update.version } : { status: "current", latestVersion: currentVersion };
    } catch (error) {
      return { status: "unavailable", message: error instanceof Error ? error.message : "Update check failed." };
    }
  },

  async installUpdate() {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      throw new Error("No update is available.");
    }
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
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

  // GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4. The URL comes from a Rust command and
  // not from the event payload: `main.rs` parks it in one slot so that a link
  // arriving by two roads at once is still consumed once.
  deepLink: {
    async take() {
      return (await invoke<string | null>("take_pending_deep_link")) ?? null;
    },
    async subscribe(handler) {
      return listen("deep-link", () => {
        handler();
      });
    },
  },

  async openExternal(url) {
    await openUrl(url);
  },

  // SETTINGS_REVIEW.md 4.6. Every call is a Rust command: the frontend never
  // names a directory, so this surface cannot be pointed anywhere else.
  backups: {
    supported() {
      return true;
    },
    async dir() {
      return invoke<string>("get_backups_dir");
    },
    async list() {
      return invoke<BackupFile[]>("list_backups");
    },
    async read(name) {
      return invoke<string>("read_backup", { name });
    },
    async write(contents, stamp, keep) {
      return invoke<BackupFile>("write_backup", { contents, stamp, keep });
    },
    async reveal() {
      const dir = await invoke<string>("get_backups_dir");
      await revealItemInDir(dir);
    },
  },
};
