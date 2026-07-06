import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { appDataDir, join as joinPath } from "@tauri-apps/api/path";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  mkdir,
  readDir,
  readTextFile as fsReadTextFile,
  stat as fsStat,
  watch as watchFs,
} from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MiniFocusTimerSnapshot } from "../lib/miniFocusTimer";
import type {
  HardwareProfile,
  InstalledModelFile,
  LocalAiRuntimeStatus,
  ModelDownloadOutcome,
  ModelDownloadProgress,
} from "../lib/localAi/types";
import { webPlatform } from "./web";
import type {
  FocusTrayActionPayload,
  PlatformAdapter,
  PlatformFileEntry,
  ScanMarkdownFilesOptions,
} from "./types";

const KNOWLEDGE_DB_FILENAME = "knowledge_index.db";

function baseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function hasAllowedExtension(name: string, extensions: string[]) {
  const lower = name.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

async function scanDirectory(
  root: string,
  currentDir: string,
  options: ScanMarkdownFilesOptions,
  results: PlatformFileEntry[],
): Promise<void> {
  if (options.maxFiles && results.length >= options.maxFiles) return;

  const entries = await readDir(currentDir);
  for (const entry of entries) {
    if (options.maxFiles && results.length >= options.maxFiles) return;
    // Symlinks are skipped so a vault can never read outside the folder the
    // user actually picked (read-only, scoped access — design principle 7).
    if (entry.isSymlink) continue;

    if (entry.isDirectory) {
      if (options.excludedFolders.includes(entry.name)) continue;
      const childDir = await joinPath(currentDir, entry.name);
      await scanDirectory(root, childDir, options, results);
      continue;
    }

    if (!entry.isFile || !hasAllowedExtension(entry.name, options.extensions)) continue;

    const fullPath = await joinPath(currentDir, entry.name);
    const info = await fsStat(fullPath).catch(() => null);
    const relativePath = fullPath.startsWith(root)
      ? fullPath.slice(root.length).replace(/^[\\/]+/, "")
      : fullPath;
    results.push({
      path: fullPath,
      relativePath,
      size: info?.size ?? 0,
      modifiedAt: info?.mtime ? info.mtime.getTime() : 0,
    });
  }
}

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

  async openExternal(url) {
    await openUrl(url);
  },

  files: {
    supported() {
      return true;
    },

    async pickFolder() {
      const selected = await openFolderDialog({ directory: true, multiple: false });
      if (typeof selected !== "string") return null;
      await tauriPlatform.files.grantAccess(selected);
      return selected;
    },

    async grantAccess(path) {
      // The fs plugin scope is deny-all by default (see
      // capabilities/default.json); this extends it to exactly the folder
      // the user chose. Required on every app start too, since Tauri does
      // not persist the scope dialog.open() grants across restarts.
      await invoke("grant_vault_read_access", { path });
    },

    async scanMarkdownFiles(root, options) {
      const results: PlatformFileEntry[] = [];
      await scanDirectory(root, root, options, results);
      return results;
    },

    async readTextFile(path, maxBytes) {
      if (maxBytes) {
        const info = await fsStat(path).catch(() => null);
        if (info && info.size > maxBytes) {
          throw new Error(`File exceeds the ${maxBytes}-byte limit (${info.size} bytes): ${path}`);
        }
      }
      return fsReadTextFile(path);
    },

    async getFileMetadata(path) {
      const info = await fsStat(path).catch(() => null);
      if (!info) return null;
      return {
        path,
        relativePath: baseName(path),
        size: info.size,
        modifiedAt: info.mtime ? info.mtime.getTime() : 0,
      };
    },

    async getDefaultKnowledgeDbPath() {
      const dir = await appDataDir();
      return joinPath(dir, KNOWLEDGE_DB_FILENAME);
    },

    async ensureKnowledgeDbDir() {
      const dir = await appDataDir();
      await mkdir(dir, { recursive: true });
    },

    async watchVault(path, onChange) {
      return watchFs([path], () => onChange(), { recursive: true, delayMs: 2000 });
    },
  },

  localAi: {
    supported() {
      return true;
    },

    async getHardwareProfile() {
      // Consent gate lives in the UI: only the Local AI Setup screen calls
      // this, after the user clicks "내 기기 검사하기" (design principle 5).
      return invoke<HardwareProfile>("get_local_ai_hardware_profile");
    },

    async getModelsDir() {
      return invoke<string>("get_local_ai_models_dir");
    },

    async listInstalledModels() {
      return invoke<InstalledModelFile[]>("list_local_ai_models");
    },

    async getRuntimeStatus() {
      return invoke<LocalAiRuntimeStatus>("get_local_ai_runtime_status");
    },

    async downloadModel(request) {
      return invoke<ModelDownloadOutcome>("download_local_ai_model", {
        modelId: request.modelId,
        url: request.url,
        expectedSha256: request.expectedSha256,
        fileName: request.fileName,
      });
    },

    async cancelDownload(modelId) {
      await invoke("cancel_local_ai_download", { modelId });
    },

    async deleteModel(fileName) {
      await invoke("delete_local_ai_model", { fileName });
    },

    async subscribeDownloadProgress(handler) {
      return listen<ModelDownloadProgress>("local-ai://download-progress", (event) => {
        handler(event.payload);
      });
    },

    async startServer(modelFileName, preferredPort, binaryPathOverride) {
      return invoke<LocalAiRuntimeStatus>("start_local_ai_server", {
        modelFileName,
        preferredPort,
        binaryPathOverride,
      });
    },

    async stopServer() {
      await invoke("stop_local_ai_server");
    },

    async isServerInstalled() {
      return invoke<boolean>("is_local_ai_server_installed");
    },

    async installServer(url, expectedSha256) {
      return invoke<ModelDownloadOutcome>("install_local_ai_server", {
        url,
        expectedSha256,
      });
    },
  },
};
