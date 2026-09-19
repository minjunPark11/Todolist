// What a tool is, and which ones this build admits to having.
//
// The `mode` field is §9.4's preparation for V2: write tools will be
// registered the same way and excluded from `tools/list` while V1 is what
// ships.
//
// 자물쇠는 둘이다 — 이제는 정말로.
//
// 이 주석은 오랫동안 "그 배제가 안전장치가 아니라, OAuth 클라이언트의 쓰기를
// 데이터베이스가 거절하는 것이 안전장치다 (§6.5) — 자물쇠가 둘이다"라고 적고
// 있었다. 그런 정책은 없었다 [실측, pg_policies]: 쓰기 정책 45개 중
// `client_id` 를 보는 것 0개, `auth.jwt()` 를 보는 것 0개. 자물쇠는
// 하나였고, 그 하나가 이 파일에 있었다.
//
// 047_oauth_client_write_lock 이 두 번째를 채웠다. `public` 의 모든 표(31개)
// 에 문장 단위 트리거가 붙어, 토큰에 `client_id` 클레임이 있으면 그 문장을
// 42501 로 거절한다. RLS 정책이 아니라 트리거인 것은, 이 스키마의
// `security definer` 함수 57개가 전부 `rolbypassrls` 인 `postgres` 소유라
// 정책이 **아예 적용되지 않는** 길이 있기 때문이다 — PostgREST 는 그
// 함수들을 RPC 로 노출한다. 적용 뒤 실측: 앱 세션 토큰 통과, service_role
// 통과, 클레임 없음 통과, 커넥터 토큰은 UPDATE·DELETE·definer RPC 전부
// 막힘, 31/31.
//
// 그러니 아래 `listableTools` 와 `tools/call` 의 `mode !== "read"` 검사는
// 이제 **첫 번째** 자물쇠다. 두 번째가 생겼다고 이쪽이 덜 중요해지지는
// 않는다: "그런 도구는 없다"고 말하는 것과 "써봤자 데이터베이스가
// 거절한다"는 것은 다른 일이고, 모델을 멈추게 하는 것은 앞의 것이다.
// handler.test.ts 의 "hides a write tool, and refuses to call it" 가 이쪽을,
// oauthWriteLock.test.ts 가 저쪽이 새로 생기는 표에서 빠지지 않는지를
// 붙잡는다.
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
