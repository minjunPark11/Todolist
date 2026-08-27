// What a tool is, and which ones this build admits to having.
//
// The `mode` field is §9.4's preparation for V2: write tools will be
// registered the same way and excluded from `tools/list` while V1 is what
// ships. That exclusion is not the safety measure — the database refusing
// writes from an OAuth client is (§6.5). Two locks, because an application
// mistake should not be the only thing between a reader and a delete.
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
