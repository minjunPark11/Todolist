// Shared fetch-abort helper for AI endpoints (chat providers, embedding
// provider, local AI health checks).
export function withTimeout(milliseconds: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), milliseconds);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
}
