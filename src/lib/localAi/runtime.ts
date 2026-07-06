// AiRuntimeManager (LOCAL_AI_SYSTEM_DESIGN.md §7): decides whether a local
// OpenAI-compatible endpoint is ready before an AI feature runs, spawning the
// managed llama-server sidecar when it isn't. External mode never spawns
// anything — it only health-checks the user's own server.
import { useEffect } from "react";
import { platform } from "../../platform";
import { findModelById, LOCAL_MODEL_CATALOG } from "./modelCatalog";
import { withTimeout } from "../ai/http";
import { loadLocalAiSettings } from "./settings";
import type { InstalledModelFile, LocalAiSettings, LocalModelOption } from "./types";

// llama-server can take tens of seconds to load a multi-GB GGUF; /health
// stays 503 until the model is ready.
const MANAGED_READY_TIMEOUT_MS = 60_000;
const MANAGED_READY_POLL_INTERVAL_MS = 1_000;
const MANAGED_IDLE_SHUTDOWN_MS = 10 * 60_000;

let idleShutdownTimer: number | null = null;
let lastManagedActivityAt = 0;

export type EnsureAiReadyResult =
  | { ok: true; baseUrl: string }
  | {
      ok: false;
      // Drives which screen the UI routes to: setup, download, or settings.
      reason:
        | "unsupported"
        | "external-unreachable"
        | "model-not-installed"
        | "engine-not-installed"
        | "server-not-running";
      message: string;
    };

// GET /v1/models is answered by every backend we target (llama-server,
// Ollama, LM Studio, LocalAI), which makes it the one health probe that works
// for external mode regardless of which server the user runs.
export async function checkServerHealth(baseUrl: string, timeoutMs = 2000): Promise<boolean> {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await platform.aiFetch(`${baseUrl.replace(/\/$/, "")}/v1/models`, {
      method: "GET",
      signal: timeout.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    timeout.clear();
  }
}

// Managed mode probes llama-server's dedicated /health endpoint, which
// reports 503 while the model is still loading and 200 once inference is
// actually available.
async function checkManagedHealth(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await platform.aiFetch(`${baseUrl}/health`, {
      method: "GET",
      signal: timeout.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    timeout.clear();
  }
}

async function waitForManagedReady(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkManagedHealth(baseUrl)) return true;
    await new Promise((resolve) => window.setTimeout(resolve, MANAGED_READY_POLL_INTERVAL_MS));
  }
  return false;
}

function catalogDownloadFileName(model: LocalModelOption): string {
  if (!model.downloadUrl) return "";
  try {
    const pathname = new URL(model.downloadUrl).pathname;
    return decodeURIComponent(pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

export function installedFileMatchesModel(fileName: string, model: LocalModelOption): boolean {
  const normalized = fileName.toLowerCase();
  const catalogFileName = `${model.id}.gguf`.toLowerCase();
  const sourceFileName = catalogDownloadFileName(model).toLowerCase();
  return normalized === catalogFileName || normalized.startsWith(`${model.id.toLowerCase()}.`) || Boolean(sourceFileName && normalized === sourceFileName);
}

export function findInstalledFileForModel(model: LocalModelOption, installed: InstalledModelFile[]): InstalledModelFile | null {
  return installed.find((file) => installedFileMatchesModel(file.fileName, model)) ?? null;
}

export function findFirstInstalledCatalogModel(
  installed: InstalledModelFile[],
): { model: LocalModelOption; file: InstalledModelFile } | null {
  for (const model of LOCAL_MODEL_CATALOG) {
    const file = findInstalledFileForModel(model, installed);
    if (file) return { model, file };
  }
  return null;
}

// The installed file for the selected catalog model. Matching accepts both the
// managed installer file name ("<catalog-id>.gguf") and the upstream GGUF file
// name, so manually placed/downloaded models are still recognized.
export function findInstalledModelFile(
  settings: LocalAiSettings,
  installed: InstalledModelFile[],
): InstalledModelFile | null {
  if (!settings.selectedModelId || !findModelById(settings.selectedModelId)) return null;
  const model = findModelById(settings.selectedModelId);
  return model ? findInstalledFileForModel(model, installed) : null;
}

export function isSelectedModelInstalled(settings: LocalAiSettings, installed: InstalledModelFile[]): boolean {
  return findInstalledModelFile(settings, installed) !== null;
}

export function managedBaseUrl(settings: LocalAiSettings): string {
  return `http://127.0.0.1:${settings.serverPort}`;
}

export function recordManagedLocalAiActivity(settings = loadLocalAiSettings()): void {
  if (settings.launchMode === "external" || !platform.localAi.supported()) return;

  lastManagedActivityAt = Date.now();
  if (idleShutdownTimer !== null) {
    window.clearTimeout(idleShutdownTimer);
  }
  idleShutdownTimer = window.setTimeout(() => {
    const idleForMs = Date.now() - lastManagedActivityAt;
    if (idleForMs < MANAGED_IDLE_SHUTDOWN_MS) {
      idleShutdownTimer = window.setTimeout(() => {
        idleShutdownTimer = null;
        void platform.localAi.stopServer().catch(() => undefined);
      }, MANAGED_IDLE_SHUTDOWN_MS - idleForMs);
      return;
    }
    idleShutdownTimer = null;
    void platform.localAi.stopServer().catch(() => undefined);
  }, MANAGED_IDLE_SHUTDOWN_MS);
}

export async function ensureAiReady(settings: LocalAiSettings): Promise<EnsureAiReadyResult> {
  if (settings.launchMode === "external") {
    const baseUrl = settings.externalServerUrl.trim().replace(/\/$/, "");
    if (baseUrl && (await checkServerHealth(baseUrl))) {
      return { ok: true, baseUrl };
    }
    return {
      ok: false,
      reason: "external-unreachable",
      message: "외부 AI 서버에 연결할 수 없어요. 서버 주소와 실행 상태를 확인해주세요.",
    };
  }

  if (!platform.localAi.supported()) {
    return {
      ok: false,
      reason: "unsupported",
      message: "로컬 AI 실행은 데스크톱 앱에서만 지원돼요. 웹에서는 외부 서버 연결을 사용해주세요.",
    };
  }

  const installed = await platform.localAi.listInstalledModels().catch(() => []);
  const installedFile =
    findInstalledModelFile(settings, installed) ??
    (!settings.selectedModelId ? findFirstInstalledCatalogModel(installed)?.file ?? null : null);
  if (!installedFile) {
    return {
      ok: false,
      reason: "model-not-installed",
      message: "로컬 AI 모델이 아직 설치되지 않았어요. 설정에서 모델을 다운로드해주세요.",
    };
  }

  // Fast paths: the server may already be serving — either on the preferred
  // port or on the one a previous start probed to (port conflicts, §7.5).
  const preferredUrl = managedBaseUrl(settings);
  if (await checkManagedHealth(preferredUrl)) {
    recordManagedLocalAiActivity(settings);
    return { ok: true, baseUrl: preferredUrl };
  }
  const status = await platform.localAi.getRuntimeStatus().catch(() => null);
  if (status?.running && status.port) {
    const runningUrl = `http://127.0.0.1:${status.port}`;
    if (await waitForManagedReady(runningUrl, MANAGED_READY_TIMEOUT_MS)) {
      recordManagedLocalAiActivity(settings);
      return { ok: true, baseUrl: runningUrl };
    }
  }

  let startedPort: number;
  try {
    const started = await platform.localAi.startServer(
      installedFile.fileName,
      settings.serverPort,
      settings.serverBinaryPathOverride,
    );
    startedPort = started.port ?? settings.serverPort;
  } catch (error) {
    // The most common start failure on a fresh managed setup is a missing
    // engine binary. When there's no path override (so we'd rely on the
    // managed bin dir) and nothing is installed there, guide the user to the
    // one-click installer instead of surfacing the raw path error. A binary on
    // PATH would have started fine, so reaching here with none installed means
    // installing the engine is the actual fix.
    const engineInstalled = await platform.localAi.isServerInstalled().catch(() => true);
    if (!engineInstalled && !settings.serverBinaryPathOverride.trim()) {
      return {
        ok: false,
        reason: "engine-not-installed",
        message: "로컬 AI 엔진이 아직 설치되지 않았어요. 설정 → 로컬 AI에서 \"엔진 설치\"를 눌러주세요.",
      };
    }
    return {
      ok: false,
      reason: "server-not-running",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const baseUrl = `http://127.0.0.1:${startedPort}`;
  if (await waitForManagedReady(baseUrl, MANAGED_READY_TIMEOUT_MS)) {
    recordManagedLocalAiActivity(settings);
    return { ok: true, baseUrl };
  }
  return {
    ok: false,
    reason: "server-not-running",
    message: "로컬 AI 서버가 제한 시간 안에 준비되지 않았어요. 모델 크기에 따라 잠시 후 다시 시도해주세요.",
  };
}

// Pre-warms the managed server when the user opted into "앱 시작 시 미리
// 실행". Mounted once from App; a failure here is non-fatal — on-demand
// startup will retry when an AI feature is actually used.
export function useLocalAiAutostart() {
  useEffect(() => {
    const settings = loadLocalAiSettings();
    if (settings.launchMode !== "on-app-start" || !platform.localAi.supported()) return;
    void ensureAiReady(settings).catch(() => undefined);
  }, []);
}
