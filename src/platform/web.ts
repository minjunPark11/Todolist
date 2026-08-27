import {
  openMiniFocusTimer,
  supportsMiniFocusTimer,
  updateMiniFocusTimer,
  type MiniFocusTimerSnapshot,
} from "../lib/miniFocusTimer";
import type { PlatformAdapter, PlatformFileEntry } from "./types";

function filesUnsupported(): never {
  throw new Error("Local file access is only available in the desktop app.");
}

function backupsUnsupported(): never {
  // Not a silent no-op: a backup that quietly did not happen is worse than one
  // that says it cannot. There is no honest web version either — a copy inside
  // the origin's own storage dies with the data it was meant to outlive.
  throw new Error("Automatic backups are only available in the desktop app.");
}

function localAiUnsupported(): never {
  throw new Error("Local AI runtime is only available in the desktop app.");
}

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

  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  files: {
    supported() {
      return false;
    },
    async pickFolder() {
      return null;
    },
    async grantAccess() {
      filesUnsupported();
    },
    async scanMarkdownFiles(): Promise<PlatformFileEntry[]> {
      filesUnsupported();
    },
    async readTextFile() {
      filesUnsupported();
    },
    async getFileMetadata() {
      filesUnsupported();
    },
    async getDefaultKnowledgeDbPath() {
      filesUnsupported();
    },
    async ensureKnowledgeDbDir() {
      filesUnsupported();
    },
    async watchVault() {
      filesUnsupported();
    },
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

  localAi: {
    supported() {
      return false;
    },
    async getHardwareProfile() {
      localAiUnsupported();
    },
    async getModelsDir() {
      localAiUnsupported();
    },
    async listInstalledModels() {
      localAiUnsupported();
    },
    async getRuntimeStatus() {
      localAiUnsupported();
    },
    async downloadModel() {
      localAiUnsupported();
    },
    async cancelDownload() {
      localAiUnsupported();
    },
    async deleteModel() {
      localAiUnsupported();
    },
    async subscribeDownloadProgress() {
      return () => undefined;
    },
    async startServer() {
      localAiUnsupported();
    },
    async stopServer() {
      localAiUnsupported();
    },
    async startEmbeddingServer() {
      localAiUnsupported();
    },
    async stopEmbeddingServer() {
      localAiUnsupported();
    },
    async getEmbeddingRuntimeStatus() {
      localAiUnsupported();
    },
    async getPlatform() {
      localAiUnsupported();
    },
    async isServerInstalled() {
      return false;
    },
    async getServerRuntimeVersion() {
      return null;
    },
    async installServer() {
      localAiUnsupported();
    },
  },
};
