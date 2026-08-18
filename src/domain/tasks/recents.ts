// What the palette shows before anything is typed (TickTick plan §10.43-§10.45).
//
// §10.8 asks for recent items and then draws a line under it: "과도한 추천
// 알고리즘은 넣지 않는다". Most recent first, deduplicated, capped. Anything
// cleverer would have to be explained to the user, and a palette that opens on
// a guess is slower to trust than one that opens on a fact.
//
// Two things are deliberately NOT here. Search terms are not remembered
// (§10.45) — a task title is often the most private text in the app, and a
// list of what someone looked for is worth more to a shoulder-surfer than the
// tasks are. And this is not navigation history (§10.44): Back walks a stack,
// this is a set of places, and the two disagree the moment the user goes back.
import type { TaskScopeRef } from "./scopeRegistry";
import { TASK_SCOPE_KINDS, scopeRegistry } from "./scopeRegistry";

/** §10.43: five of each, not five in total. */
export const RECENT_LIMIT = 5;

export type RecentItem =
  | { kind: "scope"; scope: TaskScopeRef }
  | { kind: "task"; taskId: string };

export interface RecentState {
  scopes: TaskScopeRef[];
  taskIds: string[];
}

export const NO_RECENTS: RecentState = { scopes: [], taskIds: [] };

function sameScope(a: TaskScopeRef, b: TaskScopeRef): boolean {
  if (a.kind !== b.kind) return false;
  return ("id" in a ? a.id : "") === ("id" in b ? b.id : "");
}

/**
 * Move a Scope to the front, or add it there.
 *
 * Returns the same object when nothing moved, so a re-render that reports the
 * Scope it is already showing does not write to storage or re-render the
 * palette behind it.
 */
export function rememberScope(state: RecentState, scope: TaskScopeRef): RecentState {
  if (state.scopes[0] && sameScope(state.scopes[0], scope)) return state;
  const rest = state.scopes.filter((candidate) => !sameScope(candidate, scope));
  return { ...state, scopes: [scope, ...rest].slice(0, RECENT_LIMIT) };
}

export function rememberTask(state: RecentState, taskId: string): RecentState {
  if (!taskId || state.taskIds[0] === taskId) return state;
  const rest = state.taskIds.filter((candidate) => candidate !== taskId);
  return { ...state, taskIds: [taskId, ...rest].slice(0, RECENT_LIMIT) };
}

/**
 * Read what was stored, keeping only what this build can still act on.
 *
 * A Scope kind the registry no longer defines, or a malformed entry, is
 * dropped rather than repaired: the list is a convenience, and a wrong row in
 * it navigates somewhere the user did not ask to go.
 */
export function sanitizeRecents(raw: unknown): RecentState {
  if (!raw || typeof raw !== "object") return NO_RECENTS;
  const record = raw as { scopes?: unknown; taskIds?: unknown };
  const scopes: TaskScopeRef[] = [];
  if (Array.isArray(record.scopes)) {
    for (const entry of record.scopes) {
      if (!entry || typeof entry !== "object") continue;
      const { kind, id } = entry as { kind?: unknown; id?: unknown };
      if (typeof kind !== "string" || !TASK_SCOPE_KINDS.includes(kind as TaskScopeRef["kind"])) continue;
      const policy = scopeRegistry[kind as TaskScopeRef["kind"]];
      if (policy.hasId) {
        if (typeof id !== "string" || !id) continue;
        scopes.push({ kind: policy.kind, id } as TaskScopeRef);
      } else {
        scopes.push({ kind: policy.kind } as TaskScopeRef);
      }
      if (scopes.length === RECENT_LIMIT) break;
    }
  }
  const taskIds = Array.isArray(record.taskIds)
    ? record.taskIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, RECENT_LIMIT)
    : [];
  return { scopes, taskIds };
}
