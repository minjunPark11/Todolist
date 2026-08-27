// JSON-RPC 2.0, the small part of it that MCP over HTTP actually uses.
//
// Written here rather than taken from the official SDK, deliberately. What the
// SDK is worth is sessions, SSE streams, resumption and server-initiated
// notifications — and §8.3 says this server has none of those: Vercel does not
// keep an instance alive, and every V1 tool is a short read. What is left of
// the protocol is an envelope, five methods, and an error code table.
//
// The gain is not fewer bytes. It is that the whole protocol layer is a pure
// function of a request object, so the tests below it need no server, no
// socket and no clock — the same property that let Phase 3 be finished before
// any of this existed.

export const JSONRPC_VERSION = "2.0";

/** An id may be a string or a number; a notification has none at all. */
export type RpcId = string | number | null;

export interface RpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: RpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcSuccess {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RpcId;
  result: unknown;
}

export interface RpcFailure {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RpcId;
  error: { code: number; message: string; data?: unknown };
}

export type RpcResponse = RpcSuccess | RpcFailure;

/** The standard codes. MCP adds no others at the envelope level. */
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export function success(id: RpcId, result: unknown): RpcSuccess {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function failure(id: RpcId, code: number, message: string, data?: unknown): RpcFailure {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

/**
 * A request is a notification when it carries no id, and a notification gets
 * no reply — not even an error one. `notifications/initialized` is the case
 * that matters: answering it puts an unmatched response on the wire and some
 * clients treat that as a protocol violation.
 */
export function isNotification(request: RpcRequest): boolean {
  return request.id === undefined;
}

export interface ParsedBody {
  /** One request, or a batch. Batches are legal and clients do send them. */
  requests: RpcRequest[];
  batch: boolean;
}

export function parseRpcBody(body: unknown): ParsedBody {
  const raw = typeof body === "string" ? JSON.parse(body) : body;
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) throw new SyntaxError("Empty batch.");
  return { requests: list.map(asRequest), batch: Array.isArray(raw) };
}

function asRequest(value: unknown): RpcRequest {
  if (!value || typeof value !== "object") throw new SyntaxError("A request must be an object.");
  const record = value as Record<string, unknown>;
  if (record.jsonrpc !== JSONRPC_VERSION) throw new SyntaxError('Every request needs "jsonrpc": "2.0".');
  if (typeof record.method !== "string" || !record.method) throw new SyntaxError("A request needs a method.");
  const id = record.id;
  if (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number") {
    throw new SyntaxError("An id must be a string or a number.");
  }
  return {
    jsonrpc: JSONRPC_VERSION,
    method: record.method,
    ...(id === undefined ? {} : { id: id as RpcId }),
    ...(record.params && typeof record.params === "object"
      ? { params: record.params as Record<string, unknown> }
      : {}),
  };
}
