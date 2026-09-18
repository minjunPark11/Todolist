// What a tool is, and which ones this build admits to having.
//
// The `mode` field is §9.4's preparation for V2: write tools will be
// registered the same way and excluded from `tools/list` while V1 is what
// ships.
//
// 이 주석은 전에 "그 배제가 안전장치가 아니라, OAuth 클라이언트의 쓰기를
// 데이터베이스가 거절하는 것이 안전장치다 (§6.5) — 자물쇠가 둘이다"라고
// 적혀 있었다. 자물쇠는 하나다 [실측]. 실제 데이터베이스에 물어보면:
//
//   public 스키마의 쓰기 정책        45개 (표 23개)
//   그중 client_id 를 보는 것         0개
//   그중 auth.jwt() 를 보는 것        0개
//
// 정책은 전부 `auth.uid() = user_id` 만 본다. OAuth 로 발급된 토큰과 앱
// 자신의 세션 토큰은 데이터베이스가 볼 때 구별되지 않으므로, 커넥터가 쥔
// 토큰은 PostgREST 에 직접 대고 지울 수도 있다 — 이 서버를 거치지 않고.
//
// 그러니 지금 읽기 전용을 지키는 것은 **이 배제 하나뿐이다**. 그것이
// 안전장치가 아니라고 적어 두면, 있지도 않은 두 번째 자물쇠를 믿고 이
// 하나를 느슨하게 만들게 된다. 아래 `listableTools` 와 `tools/call` 의
// `mode !== "read"` 검사가 유일한 자물쇠이고, handler.test.ts 의
// "hides a write tool, and refuses to call it" 이 그것을 붙잡고 있다.
import type { QueryContext } from "../data/queries/shared";
import type { Args } from "./args";

export type ToolMode = "read" | "write";

/** JSON Schema, as MCP requires it: an object schema per tool. */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: string;
  mode: ToolMode;
  /** What the model reads when deciding whether to call this. */
  description: string;
  inputSchema: ToolInputSchema;
  handler: (args: Args, ctx: QueryContext) => Promise<unknown>;
}

/**
 * The sentence appended to every tool's description.
 *
 * §11.2 asks for the staleness rule to be stated where the model will read it,
 * and this is the only place a model reliably reads: the tool list. A rule
 * that lives only in our documentation governs nobody's behaviour.
 */
export const FRESHNESS_NOTE =
  "Every answer carries meta.freshness. When staleness is \"stale\", say how long ago the account last synced before answering; when it is \"unknown\", say the data may be incomplete.";

export function describe(text: string): string {
  return `${text} ${FRESHNESS_NOTE}`;
}

export function createRegistry(tools: ToolDefinition[]): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>();
  for (const tool of tools) {
    if (registry.has(tool.name)) throw new Error(`Two tools are called ${tool.name}.`);
    registry.set(tool.name, tool);
  }
  return registry;
}

/** What `tools/list` returns: read tools only, in a stable order. */
export function listableTools(registry: Map<string, ToolDefinition>): ToolDefinition[] {
  return [...registry.values()].filter((tool) => tool.mode === "read");
}
