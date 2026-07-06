// AiRuntimeManager (LOCAL_AI_SYSTEM_DESIGN.md §7): decides whether a local
// OpenAI-compatible endpoint is ready before an AI feature runs, and — once
// Phase 3 lands — starts the llama-server sidecar when it isn't. Phase 0 can
// already verify external servers and an out-of-band llama-server, but never
// spawns anything.
import { platform } from "../../platform";
import { findModelById } from "./modelCatalog";
import { withTimeout } from "../ai/providers/ollamaProvider";
import type { InstalledModelFile, LocalAiSettings } from "./types";

export type EnsureAiReadyResult =
  | { ok: true; baseUrl: string }
  | {
      ok: false;
      // Drives which screen the UI routes to: setup, download, or settings.
      reason: "unsupported" | "external-unreachable" | "model-not-installed" | "server-not-running";
      message: string;
    };

// GET /v1/models is answered by every backend we target (llama-server,
// Ollama, LM Studio, LocalAI), which makes it the one health probe that works
// for both managed and external modes.
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

export function managedBaseUrl(settings: LocalAiSettings): string {
  // The sidecar may end up on a higher port when serverPort is taken; once
  // Phase 3 lands this must prefer LocalAiRuntimeStatus.port over settings.
  return `http://127.0.0.1:${settings.serverPort}`;
}

// True when the model file the user picked during setup actually exists in
// the models directory. Matching is by catalog id prefix on the file name —
// the Phase 2 installer names files "<catalog-id>.gguf" to keep this trivial.
export function isSelectedModelInstalled(settings: LocalAiSettings, installed: InstalledModelFile[]): boolean {
  if (!settings.selectedModelId || !findModelById(settings.selectedModelId)) return false;
  return installed.some((file) => file.fileName.toLowerCase().startsWith(settings.selectedModelId.toLowerCase()));
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
  if (!isSelectedModelInstalled(settings, installed)) {
    return {
      ok: false,
      reason: "model-not-installed",
      message: "로컬 AI 모델이 아직 설치되지 않았어요. 설정에서 모델을 다운로드해주세요.",
    };
  }

  const baseUrl = managedBaseUrl(settings);
  if (await checkServerHealth(baseUrl)) {
    return { ok: true, baseUrl };
  }

  // TODO(Phase 3): spawn the llama-server sidecar here
  // (invoke("start_local_ai_server")), then poll checkServerHealth() for up
  // to ~30s while the model loads. Until then we can only report the state.
  return {
    ok: false,
    reason: "server-not-running",
    message: "로컬 AI 서버가 실행되고 있지 않아요. (자동 실행은 다음 단계에서 지원될 예정이에요.)",
  };
}
