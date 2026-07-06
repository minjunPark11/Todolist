// Local AI (managed llama-server) shared types. Settings here are deliberately
// NOT part of AppSettings: serverPort/externalServerUrl/modelsDirOverride are
// device-specific and must never sync to Supabase (see
// LOCAL_AI_SYSTEM_DESIGN.md §10, same rule as KnowledgeSettings).

// Result of the on-demand hardware scan (src-tauri/src/local_ai.rs). Only ever
// collected after the user clicks "내 기기 검사하기" (design principle 5) and
// never persisted or sent off-device — it exists to feed the recommender and
// the analysis screen.
export interface HardwareProfile {
  os: string; // "windows" | "macos" | "linux" (std::env::consts::OS)
  arch: string; // "x86_64" | "aarch64" ...
  cpuCoreCount: number; // logical cores
  totalRamGb: number | null; // null = detection failed → conservative pick
  availableDiskGb: number | null; // free space on the models-dir disk
  // TODO(Phase 1+): GPU detection (wgpu adapter name, NVML VRAM). Always null
  // from the current Rust command — see LOCAL_AI_SYSTEM_DESIGN.md §3.
  gpu: { name: string; vramGb: number | null } | null;
}

export type ModelTier = "light" | "recommended" | "coding" | "highPerformance";

export interface LocalModelOption {
  id: string;
  displayName: string;
  family: string;
  parameterSize: "3B" | "7B" | "8B" | "14B";
  quantization: "Q4_K_M" | "Q5_K_M" | "Q8_0";
  recommendedTier: ModelTier;
  estimatedSizeGb: number;
  minRamGb: number;
  recommendedRamGb: number;
  // i18n key (localAi.model.*) — render with t(model.description).
  description: string;
  // TODO(release): finalize official GGUF URLs (allowlisted hosts only) and
  // sha256 hashes before shipping the installer. Undefined = download blocked.
  downloadUrl?: string;
  expectedSha256?: string;
}

// Matches the i18n translate() signature so the recommender can build
// localized reason/warning strings while staying a pure function.
export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export interface ModelRecommendation {
  primary: LocalModelOption;
  alternatives: LocalModelOption[];
  reason: string;
  warnings: string[];
}

// A *.gguf file found in the app-local models directory.
export interface InstalledModelFile {
  fileName: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number; // epoch ms, 0 when unknown
}

// Stub until Phase 3 wires the actual sidecar (LOCAL_AI_SYSTEM_DESIGN.md §7):
// the Rust command currently always reports running=false.
export interface LocalAiRuntimeStatus {
  running: boolean;
  pid: number | null;
  port: number | null;
}

// Payload of the "local-ai://download-progress" Tauri event, emitted by the
// Rust downloader while a model streams in (throttled to ~300ms).
export interface ModelDownloadProgress {
  modelId: string;
  receivedBytes: number;
  totalBytes: number | null;
}

export type ModelDownloadOutcome = "completed" | "cancelled";

export interface ModelDownloadRequest {
  modelId: string;
  url: string;
  expectedSha256: string;
  fileName: string;
}

export type LocalAiLaunchMode = "on-demand" | "on-app-start" | "external";

export interface LocalAiSettings {
  launchMode: LocalAiLaunchMode;
  // Preferred llama-server port. Not hard-coded anywhere else: the runtime
  // probes upward from this value when it is taken and reports the real port
  // via LocalAiRuntimeStatus.
  serverPort: number;
  // Only used when launchMode === "external" (Ollama / LM Studio / LocalAI).
  externalServerUrl: string;
  // Catalog id of the model chosen during setup. "" = setup not done.
  selectedModelId: string;
  // "" = platform default (<app-local-data>/models). LOCAL ONLY — never sync.
  modelsDirOverride: string;
  // Advanced: explicit llama-server binary path. "" = auto-resolve
  // (<app-local-data>/bin, then PATH). LOCAL ONLY — never sync.
  serverBinaryPathOverride: string;
  // ISO timestamp of the moment the user clicked "내 기기 검사하기".
  // "" = consent never given; the hardware scan must not run.
  hardwareConsentGrantedAt: string;
}

export const DEFAULT_LOCAL_AI_PORT = 39281;

export const DEFAULT_LOCAL_AI_SETTINGS: LocalAiSettings = {
  launchMode: "on-demand",
  serverPort: DEFAULT_LOCAL_AI_PORT,
  externalServerUrl: "",
  selectedModelId: "",
  modelsDirOverride: "",
  serverBinaryPathOverride: "",
  hardwareConsentGrantedAt: "",
};

const LAUNCH_MODES: LocalAiLaunchMode[] = ["on-demand", "on-app-start", "external"];

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65535;
}

export function normalizeLocalAiSettings(raw: unknown): LocalAiSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<LocalAiSettings>;
  return {
    launchMode: LAUNCH_MODES.includes(value.launchMode as LocalAiLaunchMode)
      ? (value.launchMode as LocalAiLaunchMode)
      : DEFAULT_LOCAL_AI_SETTINGS.launchMode,
    serverPort: isValidPort(value.serverPort) ? value.serverPort : DEFAULT_LOCAL_AI_SETTINGS.serverPort,
    externalServerUrl:
      typeof value.externalServerUrl === "string" ? value.externalServerUrl : DEFAULT_LOCAL_AI_SETTINGS.externalServerUrl,
    selectedModelId:
      typeof value.selectedModelId === "string" ? value.selectedModelId : DEFAULT_LOCAL_AI_SETTINGS.selectedModelId,
    modelsDirOverride:
      typeof value.modelsDirOverride === "string" ? value.modelsDirOverride : DEFAULT_LOCAL_AI_SETTINGS.modelsDirOverride,
    serverBinaryPathOverride:
      typeof value.serverBinaryPathOverride === "string"
        ? value.serverBinaryPathOverride
        : DEFAULT_LOCAL_AI_SETTINGS.serverBinaryPathOverride,
    hardwareConsentGrantedAt:
      typeof value.hardwareConsentGrantedAt === "string"
        ? value.hardwareConsentGrantedAt
        : DEFAULT_LOCAL_AI_SETTINGS.hardwareConsentGrantedAt,
  };
}
