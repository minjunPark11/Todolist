// Full-mode embeddings: always the local Ollama instance (KNOWLEDGE_BASE_DESIGN.md
// principles 9-10 — never a remote provider). See design §4.6.
//
// NOTE: chat no longer uses Ollama (the managed llama-server replaced it,
// LOCAL_AI_SYSTEM_DESIGN.md Phase 4), but Full-mode embeddings still do until
// the llama-server embedding backend lands (Phase 5). This module is the only
// remaining Ollama dependency, so the base-URL helper lives here now.
import { withTimeout } from "../ai/http";
import { platform } from "../../platform";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

function getOllamaBaseUrl() {
  const configured = import.meta.env.VITE_OLLAMA_URL as string | undefined;
  return (configured?.trim() || DEFAULT_OLLAMA_URL).replace(/\/$/, "");
}

// Lists models installed on the local Ollama instance so the Settings UI can
// tell whether the configured embedding model is available. Empty array =
// Ollama offline or no models.
export async function listOllamaModels(): Promise<string[]> {
  const baseUrl = getOllamaBaseUrl();
  const timeout = withTimeout(2500);
  try {
    const response = await platform.aiFetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: timeout.signal,
    });
    if (!response.ok) return [];
    const data = (await response.json().catch(() => null)) as OllamaTagsResponse | null;
    return (data?.models ?? [])
      .map((entry) => entry.name ?? entry.model ?? "")
      .filter((name): name is string => name.length > 0);
  } catch {
    return [];
  } finally {
    timeout.clear();
  }
}

export interface EmbeddingProvider {
  isAvailable(): Promise<boolean>;
  embed(texts: string[]): Promise<number[][]>;
  modelName(): string;
  dimensions(): number | null;
}

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  error?: string;
};

// Ollama model names come back as e.g. "bge-m3:latest"; a bare configured
// name ("bge-m3") should still match that installed tag. Exported so Settings
// UI can check candidate embedding models against listOllamaModels() output.
export function modelNameMatches(installedName: string, configuredName: string): boolean {
  const installedBase = installedName.split(":")[0];
  const configuredBase = configuredName.split(":")[0];
  return installedBase === configuredBase;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model: string;
  private dims: number | null = null;

  constructor(model: string) {
    this.model = model;
  }

  modelName() {
    return this.model;
  }

  dimensions() {
    return this.dims;
  }

  async isAvailable(): Promise<boolean> {
    const baseUrl = getOllamaBaseUrl();
    const timeout = withTimeout(2500);
    try {
      const response = await platform.aiFetch(`${baseUrl}/api/tags`, {
        method: "GET",
        signal: timeout.signal,
      });
      if (!response.ok) return false;
      const data = (await response.json().catch(() => null)) as OllamaTagsResponse | null;
      const installedNames = (data?.models ?? []).map((entry) => entry.name ?? entry.model ?? "");
      return installedNames.some((name) => modelNameMatches(name, this.model));
    } catch {
      return false;
    } finally {
      timeout.clear();
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];

    const baseUrl = getOllamaBaseUrl();
    const response = await platform.aiFetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    const data = (await response.json().catch(() => null)) as OllamaEmbedResponse | null;
    if (!response.ok) {
      throw new Error(data?.error ?? `Ollama embedding request failed with status ${response.status}.`);
    }
    const embeddings = data?.embeddings;
    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error("Ollama returned an unexpected embedding response.");
    }

    if (this.dims === null && embeddings[0]) {
      this.dims = embeddings[0].length;
    }
    return embeddings;
  }
}
