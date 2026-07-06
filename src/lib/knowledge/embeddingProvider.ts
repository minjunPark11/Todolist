// Full-mode embeddings use the same local AI boundary as chat: managed
// llama-server, or an explicitly configured localhost OpenAI-compatible
// endpoint. Remote endpoints are rejected so Obsidian-derived text never
// leaves the device (KNOWLEDGE_BASE_DESIGN.md principles 9-10).
import { platform } from "../../platform";
import { withTimeout } from "../ai/http";
import { findFirstInstalledCatalogModel, findInstalledModelFile } from "../localAi/runtime";
import { loadLocalAiSettings } from "../localAi/settings";
import { findModelById } from "../localAi/modelCatalog";
import { ensureAiReady } from "../localAi/runtime";
import type { LocalAiSettings } from "../localAi/types";

const EMBEDDING_TIMEOUT_MS = 60_000;

export interface EmbeddingProvider {
  isAvailable(): Promise<boolean>;
  embed(texts: string[]): Promise<number[][]>;
  modelName(): string;
  dimensions(): number | null;
}

type OpenAiEmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  embeddings?: number[][];
  error?: { message?: string } | string;
};

function isLocalHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

function isLocalEndpoint(settings: LocalAiSettings): boolean {
  if (settings.launchMode !== "external") return true;
  try {
    return isLocalHostname(new URL(settings.externalServerUrl).hostname);
  } catch {
    return false;
  }
}

function errorMessageOf(data: OpenAiEmbeddingResponse | null): string | undefined {
  if (!data?.error) return undefined;
  return typeof data.error === "string" ? data.error : data.error.message;
}

function normalizeEmbeddings(data: OpenAiEmbeddingResponse | null): number[][] | null {
  if (data?.embeddings) return data.embeddings;
  const embeddings = data?.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item));
  return embeddings?.length ? embeddings : null;
}

async function resolveManagedEmbeddingModel(settings: LocalAiSettings): Promise<string | null> {
  const installed = await platform.localAi.listInstalledModels().catch(() => []);
  if (!settings.selectedModelId) {
    return findFirstInstalledCatalogModel(installed)?.model.id ?? null;
  }
  if (!findModelById(settings.selectedModelId)) return null;
  const file = findInstalledModelFile(settings, installed);
  return file ? settings.selectedModelId : null;
}

async function resolveEmbeddingModel(settings: LocalAiSettings): Promise<string | null> {
  if (!isLocalEndpoint(settings)) return null;
  if (settings.launchMode === "external") {
    return settings.selectedModelId || "local";
  }
  return resolveManagedEmbeddingModel(settings);
}

export async function resolveEmbeddingStoreModelName(): Promise<string | null> {
  const settings = loadLocalAiSettings();
  const model = await resolveEmbeddingModel(settings);
  return model ? `local-ai:${model}` : null;
}

// Settings UI helper. A non-empty array means the local endpoint is configured
// enough for Full RAG to try indexing; the actual /v1/embeddings call still
// performs the definitive check.
export async function listEmbeddingModels(): Promise<string[]> {
  const settings = loadLocalAiSettings();
  const model = await resolveEmbeddingModel(settings);
  return model ? [model] : [];
}

export function modelNameMatches(installedName: string, configuredName: string): boolean {
  if (configuredName === "local-ai") return installedName.length > 0;
  return installedName === configuredName;
}

export class LlamaServerEmbeddingProvider implements EmbeddingProvider {
  private configuredModel: string;
  private resolvedModel: string | null = null;
  private baseUrl: string | null = null;
  private dims: number | null = null;

  constructor(model: string) {
    this.configuredModel = model;
  }

  modelName() {
    return this.resolvedModel ? `local-ai:${this.resolvedModel}` : this.configuredModel;
  }

  dimensions() {
    return this.dims;
  }

  private async prepare(): Promise<boolean> {
    const settings = loadLocalAiSettings();
    if (!isLocalEndpoint(settings)) return false;

    const model = await resolveEmbeddingModel(settings);
    if (!model) return false;

    const ready = await ensureAiReady(settings);
    if (!ready.ok) return false;

    this.resolvedModel = model;
    this.baseUrl = ready.baseUrl.replace(/\/$/, "");
    return true;
  }

  async isAvailable(): Promise<boolean> {
    return this.prepare();
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    if (!(await this.prepare()) || !this.baseUrl || !this.resolvedModel) {
      throw new Error("Local AI embedding backend is not ready. Install a local AI model and try again.");
    }

    const timeout = withTimeout(EMBEDDING_TIMEOUT_MS);
    try {
      const response = await platform.aiFetch(`${this.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: timeout.signal,
        body: JSON.stringify({
          model: this.resolvedModel,
          input: texts,
        }),
      });

      const data = (await response.json().catch(() => null)) as OpenAiEmbeddingResponse | null;
      if (!response.ok) {
        throw new Error(errorMessageOf(data) ?? `Local AI embedding request failed with status ${response.status}.`);
      }

      const embeddings = normalizeEmbeddings(data);
      if (!embeddings || embeddings.length !== texts.length) {
        throw new Error("Local AI returned an unexpected embedding response.");
      }

      if (this.dims === null && embeddings[0]) {
        this.dims = embeddings[0].length;
      }
      return embeddings;
    } finally {
      timeout.clear();
    }
  }
}

export function createEmbeddingProvider(model: string): EmbeddingProvider {
  return new LlamaServerEmbeddingProvider(model);
}
