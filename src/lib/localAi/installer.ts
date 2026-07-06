// ModelInstaller orchestration (LOCAL_AI_SYSTEM_DESIGN.md §6). The heavy
// lifting (streaming, resume, sha256, cancellation) lives in Rust
// (src-tauri/src/local_ai.rs); this module owns the catalog-side policy:
// a model without a verified URL + hash is not downloadable, period.
import { platform } from "../../platform";
import { isAllowedDownloadUrl } from "./modelCatalog";
import type { LocalModelOption, ModelDownloadOutcome } from "./types";

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

export async function deleteInstalledModel(fileName: string): Promise<void> {
  await platform.localAi.deleteModel(fileName);
}
