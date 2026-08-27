// The MCP server, assembled.
//
// Everything above this file is injectable — the verifier, the row reader, the
// clock, the log sink — because that is what makes the protocol testable
// without a socket and the queries testable without an account. This is where
// the real ones are chosen.
import { readSupabaseEnv, supabaseTableReader } from "../data/repository";
import { loadExternalEvents } from "../data/calendar/icsSource";
import type { TokenVerifier } from "./auth";
import { handleMcpHttp, type McpDeps, type McpHttpRequest, type McpHttpResponse } from "./handler";
import { supabaseTokenVerifier } from "./jwks";
import { issuerFor, protectedResourceUrl, readAppUrl } from "./protectedResource";
import { createRegistry } from "./registry";
import { readTools } from "./tools/read";

export { handleMcpHttp, type McpHttpRequest, type McpHttpResponse } from "./handler";
export { createRegistry, type ToolDefinition } from "./registry";
export { readTools } from "./tools/read";
export { protectedResourceMetadata, readAppUrl } from "./protectedResource";

export const toolRegistry = createRegistry(readTools);

/**
 * The verifier, built on first use.
 *
 * Lazy because reading the environment at module load turns a missing variable
 * into an import error, and an import error on a serverless function is a
 * blank 500 with nothing in it. Built here, the same problem is a logged
 * failure with a message.
 */
function lazySupabaseVerifier(): TokenVerifier {
  let inner: TokenVerifier | null = null;
  return {
    async verify(bearer) {
      inner ??= supabaseTokenVerifier({ issuer: issuerFor(readSupabaseEnv().url) });
      return inner.verify(bearer);
    },
  };
}

/** Production wiring. */
export function createMcpDeps(overrides: Partial<McpDeps> = {}): McpDeps {
  const appUrl = readAppUrl();
  return {
    tools: toolRegistry,
    verifier: lazySupabaseVerifier(),
    ...(appUrl ? { resourceMetadataUrl: protectedResourceUrl(appUrl) } : {}),
    readerFor: (token) =>
      supabaseTableReader({
        userId: token.userId,
        accessToken: token.accessToken,
        ...(token.clientId ? { clientId: token.clientId } : {}),
        // The reader needs neither; the queries resolve them per request.
        timezone: "",
        now: new Date(),
      }),
    loadExternal: (calendars) => loadExternalEvents(calendars),
    ...overrides,
  };
}

export async function serveMcp(request: McpHttpRequest, deps = createMcpDeps()): Promise<McpHttpResponse> {
  return handleMcpHttp(request, deps);
}
