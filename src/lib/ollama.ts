const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

export type OllamaChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function getOllamaBaseUrl() {
  const configured = import.meta.env.VITE_OLLAMA_URL as string | undefined;
  return (configured?.trim() || DEFAULT_OLLAMA_URL).replace(/\/$/, "");
}

function getOllamaModel() {
  const configured = import.meta.env.VITE_OLLAMA_MODEL as string | undefined;
  return configured?.trim() || DEFAULT_OLLAMA_MODEL;
}

export async function askOllamaChat(messages: OllamaChatMessage[]): Promise<string> {
  const baseUrl = getOllamaBaseUrl();
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getOllamaModel(),
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are FocusFlow's local AI assistant. Be practical, concise, and helpful. You can discuss planning, studying, coding, and the user's app, but never claim that you changed app data unless the user explicitly asks and a tool actually did it.",
          },
          ...messages,
        ],
      }),
    });
  } catch {
    throw new Error(
      `Could not reach Ollama at ${baseUrl}. Make sure Ollama is running and this app origin is allowed by OLLAMA_ORIGINS.`,
    );
  }

  const data = (await response.json().catch(() => null)) as OllamaChatResponse | null;

  if (!response.ok) {
    throw new Error(data?.error ?? `Ollama request failed with status ${response.status}.`);
  }

  const content = data?.message?.content?.trim();
  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return content;
}

export async function askOllama(prompt: string): Promise<string> {
  return askOllamaChat([{ role: "user", content: prompt }]);
}
