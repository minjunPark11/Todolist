// ModelInstaller orchestration (LOCAL_AI_SYSTEM_DESIGN.md §6). The heavy
// lifting (streaming, resume, sha256, cancellation) lives in Rust
// (src-tauri/src/local_ai.rs); this module owns the catalog-side policy:
// a model without a verified URL + hash is not downloadable, period.
import { platform } from "../../platform";
import { isAllowedDownloadUrl } from "./modelCatalog";
import { resolveServerRuntimeAsset } from "./serverRuntimeCatalog";
import type { LocalModelOption, ModelDownloadOutcome } from "./types";

// Progress and cancellation for the runtime install reuse the model-download
// channel under this id (see Rust SERVER_RUNTIME_DOWNLOAD_ID).
export const SERVER_RUNTIME_DOWNLOAD_ID = "llama-server-runtime";

// The installer names files "<catalog-id>.gguf" so installed-state checks
// (runtime.ts isSelectedModelInstalled, the settings UI) stay a prefix match.
export function modelFileName(model: LocalModelOption): string {
  return `${model.id}.gguf`;
}

export function isModelDownloadable(model: LocalModelOption): boolean {
  return Boolean(model.downloadUrl && model.expectedSha256 && isAllowedDownloadUrl(model.downloadUrl));
}

export async function startModelDownload(model: LocalModelOption): Promise<ModelDownloadOutcome> {
  if (!model.downloadUrl || !model.expectedSha256) {
    throw new Error(`Model ${model.id} has no verified download URL/hash yet.`);
  }
  if (!isAllowedDownloadUrl(model.downloadUrl)) {
    throw new Error(`Model ${model.id} download URL is not allowlisted.`);
  }
  return platform.localAi.downloadModel({
    modelId: model.id,
    url: model.downloadUrl,
    expectedSha256: model.expectedSha256,
    fileName: modelFileName(model),
  });
}

export async function cancelModelDownload(modelId: string): Promise<void> {
  await platform.localAi.cancelDownload(modelId);
}

// True when a pinned llama-server build exists for this platform (so the UI can
// offer the install action instead of a "not available" message).
export function isServerRuntimeAvailable(): boolean {
  return resolveServerRuntimeAsset() !== null;
}

// Downloads + extracts the managed llama-server for this platform. Throws if no
// asset is pinned for it; the Rust side verifies the sha256 on install.
export async function installServerRuntime(): Promise<ModelDownloadOutcome> {
  const asset = resolveServerRuntimeAsset();
  if (!asset) {
    throw new Error("No llama-server runtime is available for this platform yet.");
  }
  if (!isAllowedDownloadUrl(asset.downloadUrl)) {
    throw new Error("The runtime download URL is not allowlisted.");
  }
  return platform.localAi.installServer(asset.downloadUrl, asset.expectedSha256);
}

export async function cancelServerRuntimeInstall(): Promise<void> {
  await platform.localAi.cancelDownload(SERVER_RUNTIME_DOWNLOAD_ID);
}

export async function deleteInstalledModel(fileName: string): Promise<void> {
  await platform.localAi.deleteModel(fileName);
}
