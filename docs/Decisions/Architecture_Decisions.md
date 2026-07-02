# Architecture Decisions

## 2026-07-02 - AI Gateway Provider Order

Decision: AI calls use a single gateway entry point at `C:\Users\minju\Todolist\src\lib\ai\gateway.ts`.

Provider order:

1. `ollamaProvider` in `C:\Users\minju\Todolist\src\lib\ai\providers\ollamaProvider.ts`
2. `remoteOllamaProvider` in `C:\Users\minju\Todolist\src\lib\ai\providers\remoteOllamaProvider.ts`
3. `serverProvider` in `C:\Users\minju\Todolist\src\lib\ai\providers\serverProvider.ts`

Rationale:

- Keep local Ollama as the default path.
- Keep remote Ollama as the explicit fallback enabled by `VITE_REMOTE_OLLAMA_ENABLED=true`.
- Allow a configured server endpoint via `VITE_AI_SERVER_URL` as the final fallback.
- Avoid UI components importing or calling provider implementations directly.

Follow-up:

- Provider availability currently depends on each provider's own `isAvailable()` check.
- Server provider should remain free of browser-exposed secrets; `VITE_AI_SERVER_URL` should point to a protected backend gateway, not a paid provider API directly.
