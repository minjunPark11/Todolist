// The MCP server itself: one HTTP request in, one JSON body out.
//
// Stateless, per §8.3 — no session id, no SSE stream, no server-initiated
// anything. A Vercel function is not kept alive between requests, so a session
// this server remembered would be a session it forgot half the time, and every
// V1 tool is a short read that has no use for one.
//
// Written as a pure function of a request object rather than against Node's
// `req`/`res` so the whole protocol can be tested without a socket, and so
// moving this to a Supabase Edge Function later means replacing the adapter
// and nothing else.
import { createRepository, type TableReader } from "../data/repository";
import { resolveTimezone } from "../data/context";
import type { QueryContext } from "../data/queries/shared";
import { ServerError } from "../errors";
import { bearerFrom, UnauthorizedError, type TokenVerifier, type VerifiedToken } from "./auth";
import { readArgs } from "./args";
import {
  consoleSink,
  countCalendars,
  countItems,
  userHash,
  type LogSink,
  type McpLogRecord,
} from "./logging";
import {
  failure,
  isNotification,
  parseRpcBody,
  RPC_INTERNAL_ERROR,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_PARSE_ERROR,
  success,
  type RpcRequest,
  type RpcResponse,
} from "./jsonRpc";
import { listableTools, type ToolDefinition, type ToolInputSchema } from "./registry";

export const SERVER_NAME = "focusflow";
export const SERVER_VERSION = "0.1.0";

/** Newest first. An unknown request version is answered with the newest. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/** §16.1. Serialized, per tool answer. */
export const MAX_RESULT_BYTES = 256 * 1024;

const ENCODER = new TextEncoder();

/**
 * How big an answer really is, on the wire.
 *
 * `JSON.stringify(x).length` counts UTF-16 code units, and the constant above
 * says BYTES. For ASCII those are the same number, which is why the ceiling
 * looked correct for as long as nobody measured it in this app's own language
 * [실측]: the largest answer that got past the old check was
 *
 *   영문   262088 코드단위 = 262088 바이트  (상한의 1.00배)
 *   한글   262126 코드단위 = 510426 바이트  (상한의 1.95배)
 *   이모지 262082 코드단위 = 469154 바이트  (상한의 1.79배)
 *
 * 한글 제목을 쓰는 사람에게만 상한이 두 배로 열려 있었다 — 상한이 지키려던
 * 것(모델의 창, 응답 한 덩어리의 크기)은 코드 단위가 아니라 바이트로 세는
 * 것들이다.
 */
function byteLength(value: unknown): number {
  return ENCODER.encode(JSON.stringify(value)).length;
}

export interface McpHttpRequest {
  method: string;
  headers: Record<string, string | undefined>;
  /** Already-parsed JSON, or the raw string. */
  body: unknown;
}

export interface McpHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface McpDeps {
  tools: Map<string, ToolDefinition>;
  verifier: TokenVerifier;
  /** Where a verified caller's rows come from. Fixtures in tests. */
  readerFor: (token: VerifiedToken) => TableReader;
  loadExternal?: QueryContext["loadExternal"];
  now?: () => Date;
  log?: LogSink;
  newRequestId?: () => string;
  /**
   * The RFC 9728 document a 401 points at. Absent until Phase 5 publishes one,
   * in which case the challenge is a bare `Bearer` — enough to say "you need a
   * token", not enough for a connector to discover where to get one.
   */
  resourceMetadataUrl?: string;
}

/**
 * Every tool gains this argument.
 *
 * M1's second fallback: the account's own zone is preferred, but a client that
 * knows the user's zone can supply it, and that is better than the refusal
 * that follows when neither exists. Injected centrally rather than declared
 * thirteen times — and stripped centrally too, so no handler has to know it
 * was ever there.
 */
const TIMEZONE_ARGUMENT = {
  timezone: {
    type: "string",
    description:
      "IANA time zone (e.g. Asia/Seoul). Only used when the account has not recorded one; without either, the call is refused rather than guessed.",
  },
} as const;

function publishedSchema(schema: ToolInputSchema): ToolInputSchema {
  return { ...schema, properties: { ...schema.properties, ...TIMEZONE_ARGUMENT } };
}

export async function handleMcpHttp(request: McpHttpRequest, deps: McpDeps): Promise<McpHttpResponse> {
  const method = request.method.toUpperCase();

  // A GET is a client asking to open a server-to-client stream. There is not
  // one, and saying so plainly is better than an empty stream that never
  // sends anything (the spec allows this exact refusal).
  if (method === "GET") {
    return { status: 405, headers: { Allow: "POST" }, body: { error: "This server does not open SSE streams." } };
  }
  if (method === "DELETE") {
    // Session teardown, for a session that was never created.
    return { status: 204, headers: {}, body: null };
  }
  if (method !== "POST") {
    return { status: 405, headers: { Allow: "POST" }, body: { error: "Use POST." } };
  }

  const log = deps.log ?? consoleSink;
  const now = deps.now ?? (() => new Date());
  const requestId = (deps.newRequestId ?? defaultRequestId)();
  const startedAt = Date.now();

  let verified: VerifiedToken;
  try {
    const bearer = bearerFrom(request.headers.authorization ?? request.headers.Authorization);
    if (!bearer) throw new UnauthorizedError("missing_token", "This endpoint needs an access token.");
    verified = await deps.verifier.verify(bearer);
  } catch (error) {
    // 401 은 **토큰에 대한 판정일 때만**이다.
    //
    // 전에는 확인 중에 난 모든 오류가 401 이었고 그 메시지가 본문에 그대로
    // 실렸다. 그래서 서버에 환경 변수가 없는 배포는 모양만 맞는 JWT 에
    // 이렇게 답했다 [실측]: `401` · `error="invalid_token"` ·
    // `{"error":"SUPABASE_URL and SUPABASE_ANON_KEY must be set ..."}`.
    //
    // 두 가지가 한꺼번에 틀렸다. 붙어 있는 에이전트는 토큰을 고치면 될
    // 일이라 믿고 재인증을 영원히 돈다 — 어떤 토큰으로도 낫지 않는데.
    // 그리고 서버의 설정 사정이 인증도 안 된 호출자에게 나간다.
    if (!(error instanceof UnauthorizedError)) {
      // 왜인지는 운영자의 로그로만 간다. `McpLogRecord` 에 자유 문구 자리를
      // 두지 않는 것은 §16.2 의 결정이므로(거기에 사적인 것이 섞여 들어올
      // 자리를 만들지 않는다) 이유는 따로 적는다.
      console.error(JSON.stringify({
        scope: "mcp",
        requestId,
        event: "verifier-unavailable",
        reason: error instanceof Error ? error.message : String(error),
      }));
      log({ requestId, method: "auth", outcome: "error", errorCode: "INTERNAL", latencyMs: Date.now() - startedAt });
      return {
        status: 503,
        // 다시 와도 된다고 말하되, 재인증하라고는 하지 않는다 —
        // `WWW-Authenticate` 를 붙이지 않는 것이 그 뜻이다.
        headers: { "Retry-After": "30" },
        body: { error: "This server cannot verify access tokens right now." },
      };
    }
    log({ requestId, method: "auth", outcome: "error", errorCode: "UNAUTHORIZED", latencyMs: Date.now() - startedAt });
    return {
      status: 401,
      headers: { "WWW-Authenticate": challenge(error.reason, deps.resourceMetadataUrl) },
      body: { error: error.message },
    };
  }

  let parsed;
  try {
    parsed = parseRpcBody(request.body);
  } catch (error) {
    log({ requestId, method: "parse", outcome: "error", errorCode: "PROTOCOL", latencyMs: Date.now() - startedAt });
    return {
      status: 400,
      headers: {},
      body: failure(null, RPC_PARSE_ERROR, error instanceof Error ? error.message : "Malformed request."),
    };
  }

  // Opened on first use, once, and shared by every call in the batch — the
  // repository's cache is what makes six tools one read per table.
  //
  // Lazy because `initialize` and `tools/list` must answer for a client that
  // has not been anywhere near an account yet. Reading settings during the
  // handshake would make a misconfigured deployment look like a server that
  // does not speak MCP.
  const timezoneHint = timezoneHintIn(parsed.requests);
  let opened: Promise<QueryContext | ContextFailure> | null = null;
  const openContext = () => (opened ??= buildQueryContext(verified, deps, now, timezoneHint));

  const responses: RpcResponse[] = [];
  for (const rpc of parsed.requests) {
    const response = await dispatch(rpc, { deps, openContext, verified, requestId, log, startedAt });
    if (response) responses.push(response);
  }

  // A batch of nothing but notifications gets 202 and an empty body, which is
  // what the spec asks for and what stops a client waiting on a reply that is
  // never coming.
  if (responses.length === 0) return { status: 202, headers: {}, body: null };

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: parsed.batch ? responses : responses[0],
  };
}

interface DispatchScope {
  deps: McpDeps;
  openContext: () => Promise<QueryContext | ContextFailure>;
  verified: VerifiedToken;
  requestId: string;
  log: LogSink;
  startedAt: number;
}

/** A time zone that could not be resolved is not fatal until a tool runs. */
interface ContextFailure {
  error: ServerError;
}

function isContextFailure(value: QueryContext | ContextFailure): value is ContextFailure {
  return (value as ContextFailure).error instanceof ServerError;
}

async function dispatch(rpc: RpcRequest, scope: DispatchScope): Promise<RpcResponse | null> {
  const { deps, requestId, log, startedAt } = scope;
  const id = rpc.id ?? null;

  switch (rpc.method) {
    case "initialize": {
      const asked = (rpc.params?.protocolVersion as string | undefined) ?? "";
      const version = SUPPORTED_PROTOCOL_VERSIONS.includes(asked as never)
        ? asked
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      logOne(log, scope, { method: rpc.method, outcome: "ok" });
      return success(id, {
        protocolVersion: version,
        // No `resources` and no `prompts`: this server has neither, and
        // advertising an empty capability invites a client to ask for a list
        // that will always be empty.
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "FocusFlow is this user's own task and calendar data. Everything it returns is a fact about their records — it never ranks or recommends. Start with get_current_context.",
      });
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return isNotification(rpc) ? null : success(id, {});

    case "tools/list": {
      logOne(log, scope, { method: rpc.method, outcome: "ok" });
      return success(id, {
        tools: listableTools(deps.tools).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: publishedSchema(tool.inputSchema),
        })),
      });
    }

    case "tools/call":
      return callTool(rpc, scope);

    default: {
      if (isNotification(rpc)) return null;
      logOne(log, scope, { method: rpc.method, outcome: "error", errorCode: "PROTOCOL" });
      return failure(id, RPC_METHOD_NOT_FOUND, `This server has no method "${rpc.method}".`);
    }
  }
}

async function callTool(rpc: RpcRequest, scope: DispatchScope): Promise<RpcResponse> {
  const { deps } = scope;
  const id = rpc.id ?? null;
  const name = typeof rpc.params?.name === "string" ? rpc.params.name : "";
  const tool = deps.tools.get(name);

  if (!tool || tool.mode !== "read") {
    // A write tool is not "forbidden", it is absent — which is the honest
    // answer while V1 ships, and the one that stops a model retrying.
    logOne(scope.log, scope, { method: rpc.method, tool: name, outcome: "error", errorCode: "PROTOCOL" });
    return failure(id, RPC_INVALID_REQUEST, `This server has no tool called "${name}".`);
  }

  let args;
  try {
    args = readArgs(rpc.params?.arguments);
  } catch (error) {
    return toolError(id, error, scope, name);
  }

  // Pulled out before the tool sees it, so no handler has to declare it.
  const { timezone: _timezoneHint, ...toolArgs } = args;
  void _timezoneHint;

  try {
    const context = await scope.openContext();
    if (isContextFailure(context)) throw context.error;
    const result = await tool.handler(toolArgs, context);
    const { payload, truncated } = capResult(result);
    logOne(scope.log, scope, {
      method: rpc.method,
      tool: name,
      outcome: "ok",
      resultItemCount: countItems(payload),
      queryLength: typeof toolArgs.query === "string" ? toolArgs.query.length : undefined,
      externalCalendars: countCalendars(payload),
    });
    return success(id, {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload as Record<string, unknown>,
      ...(truncated ? { _meta: { truncated: true } } : {}),
    });
  } catch (error) {
    return toolError(id, error, scope, name);
  }
}

/**
 * A tool failure is a RESULT, not a protocol error (§15).
 *
 * The difference matters to the reader on the other end: a JSON-RPC error is
 * something the client swallows, while `isError` content reaches the model,
 * which can then tell the user "that task doesn't exist" instead of "the tool
 * failed".
 */
function toolError(id: RpcResponse["id"], error: unknown, scope: DispatchScope, tool: string): RpcResponse {
  if (error instanceof ServerError) {
    logOne(scope.log, scope, { method: "tools/call", tool, outcome: "error", errorCode: error.code });
    return success(id, {
      content: [{ type: "text", text: `${error.code}: ${error.message}` }],
      structuredContent: { error: { code: error.code, message: error.message } },
      isError: true,
    });
  }

  // Anything else is ours and stays ours: an upstream stack trace tells the
  // user nothing and an attacker something.
  //
  // The reason IS written to the platform log, because "that tool failed" with
  // no cause anywhere is undebuggable — and because the errors that carry
  // user-facing text are `ServerError`s, which returned above and never reach
  // this line. What lands here is our own breakage: a missing environment
  // variable, a bad deploy.
  logOne(scope.log, scope, { method: "tools/call", tool, outcome: "error", errorCode: "INTERNAL" });
  console.error("[mcp] tool failed", {
    tool,
    requestId: scope.requestId,
    reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
  return failure(id, RPC_INTERNAL_ERROR, "That tool failed.");
}

/**
 * §16.1's response ceiling, enforced by trimming lists rather than by
 * refusing.
 *
 * Half of a day's calendar is a usable answer if it says it is half; an error
 * is not an answer at all. The trimming is announced twice — in `meta` for the
 * model, and in `_meta` for the client.
 */
export function capResult(result: unknown): { payload: unknown; truncated: boolean } {
  if (byteLength(result) <= MAX_RESULT_BYTES) return { payload: result, truncated: false };
  if (!result || typeof result !== "object") return { payload: result, truncated: false };

  const payload = { ...(result as Record<string, unknown>) };
  const arrayKeys = Object.keys(payload).filter((key) => Array.isArray(payload[key]));

  // Halve the longest list, repeatedly, until it fits. Ten rounds takes any
  // plausible answer under the cap; the guard is against a shape that has no
  // lists to trim at all.
  for (let round = 0; round < 10 && byteLength(payload) > MAX_RESULT_BYTES; round += 1) {
    const longest = arrayKeys
      .map((key) => ({ key, length: (payload[key] as unknown[]).length }))
      .sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length === 0) break;
    payload[longest.key] = (payload[longest.key] as unknown[]).slice(0, Math.floor(longest.length / 2));
  }

  const meta = payload.meta;
  if (meta && typeof meta === "object") {
    payload.meta = { ...(meta as Record<string, unknown>), truncated: true };
  }
  return { payload, truncated: true };
}

/**
 * The zone a caller offered, if any call in the batch offered one.
 *
 * The context is built once per HTTP request, so the hint has to be found
 * before dispatch. Taking the first one is right for the case that exists —
 * one client, one user, one zone — and a batch whose calls disagreed about
 * what zone the user is in would be a client bug either way.
 */
function timezoneHintIn(requests: RpcRequest[]): string | undefined {
  for (const request of requests) {
    const args = request.params?.arguments as { timezone?: unknown } | undefined;
    if (typeof args?.timezone === "string" && args.timezone.trim()) return args.timezone.trim();
  }
  return undefined;
}

async function buildQueryContext(
  verified: VerifiedToken,
  deps: McpDeps,
  now: () => Date,
  timezoneHint?: string,
): Promise<QueryContext | ContextFailure> {
  const repo = createRepository(deps.readerFor(verified));
  const request = {
    userId: verified.userId,
    accessToken: verified.accessToken,
    ...(verified.clientId ? { clientId: verified.clientId } : {}),
    timezone: "",
    now: now(),
  };

  try {
    // Read through the same repository the tools will use, so this costs no
    // extra round trip: `settings` is in every tool's table set anyway.
    const slice = await repo.loadSlice(["settings"]);
    // `storedTimezone`, not `data.appSettings.timezone`: the normalizer fills
    // an empty one with this machine's zone, and answering "today" in the
    // server's zone is the guess M1 exists to forbid.
    request.timezone = resolveTimezone(slice.storedTimezone, timezoneHint);
  } catch (error) {
    if (error instanceof ServerError) return { error };
    throw error;
  }

  return { request, repo, ...(deps.loadExternal ? { loadExternal: deps.loadExternal } : {}) };
}

function challenge(reason: "missing_token" | "invalid_token", resourceMetadataUrl?: string): string {
  const parts = [reason === "invalid_token" ? 'error="invalid_token"' : ""].filter(Boolean);
  if (resourceMetadataUrl) parts.push(`resource_metadata="${resourceMetadataUrl}"`);
  return parts.length > 0 ? `Bearer ${parts.join(", ")}` : "Bearer";
}

function logOne(log: LogSink, scope: DispatchScope, record: Partial<McpLogRecord> & { method: string; outcome: "ok" | "error" }): void {
  log({
    requestId: scope.requestId,
    ...(scope.verified.clientId ? { clientId: scope.verified.clientId } : {}),
    userHash: userHash(scope.verified.userId),
    latencyMs: Date.now() - scope.startedAt,
    ...record,
  });
}

function defaultRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
