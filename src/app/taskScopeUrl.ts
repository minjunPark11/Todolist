// The Tasks Module's URL contract (TickTick plan §5.35, §5.43, §16.24).
//
// One screen, one URL. `/inbox?view=list` and `/inbox` are the same place, so
// only one of them may exist — otherwise a shared link, a back button and a
// sidebar click produce three strings for one destination and the code that
// compares them starts guessing.
//
// Every rule here comes from the registry rather than from a condition written
// next to a screen (§12.20, §12.26). What is allowed, what the default is, and
// whether the Scope names a record are all read from `scopeRegistry`.
//
// This module does NOT own the whole address bar. The Spaces routes
// (`/s/:spaceId/p/:projectId/...`, app/spaceSelection) are a different module's
// (§5.56), so a path this one does not recognise is left alone rather than
// swept to `/today` — that answer belongs to the shell, once there is one.
import type { TaskScopeRef, TaskViewKind } from "../domain/tasks/scopeRegistry";
import { policyFor, scopeRegistry, TASK_SCOPE_KINDS } from "../domain/tasks/scopeRegistry";

/** What the address bar says, once parsed (§5.43). */
export interface TaskNavigationState {
  scope: TaskScopeRef;
  view: TaskViewKind;
  /** The Task whose Drawer is open (§5.15), or "" for none. */
  taskId: string;
}

const BY_SEGMENT = new Map(
  TASK_SCOPE_KINDS.map((kind) => [scopeRegistry[kind].segment, scopeRegistry[kind]] as const),
);

function splitPath(path: string): string[] {
  return path.split("/").filter((part) => part.length > 0);
}

/**
 * Syntactic only — no record is looked up, so this stays pure and a component
 * may call it during render. Whether the id names anything is §5.28's
 * question, answered where the collections are.
 *
 * `null` means "not a Tasks Module path", which is different from "a broken
 * one": the caller must be able to tell a Spaces route from a typo.
 */
export function parseTaskScope(path: string): TaskScopeRef | null {
  const parts = splitPath(path);
  if (parts.length === 0) return null;
  const policy = BY_SEGMENT.get(parts[0]);
  if (!policy) return null;

  if (!policy.hasId) {
    // `/completed/anything` is not the Completed screen with a stray tail; it
    // is a path this module does not define.
    return parts.length === 1 ? ({ kind: policy.kind } as TaskScopeRef) : null;
  }
  if (parts.length !== 2) return null;
  const id = decodeURIComponent(parts[1]);
  if (!id) return null;
  return { kind: policy.kind, id } as TaskScopeRef;
}

export function pathForTaskScope(ref: TaskScopeRef): string {
  const policy = policyFor(ref);
  if (!policy.hasId) return `/${policy.segment}`;
  // §5.68: ids go through encoding rather than into the path as typed — a tag
  // is named by the user and can hold anything.
  return `/${policy.segment}/${encodeURIComponent((ref as { id: string }).id)}`;
}

/**
 * §5.66: a URL may say `?view=list&view=board`. One of them has to win, and
 * the plan asks for the choice to be fixed by a test rather than left to
 * whichever parser runs. First value wins.
 */
function firstParam(params: URLSearchParams, key: string): string {
  return params.getAll(key).find((value) => value.length > 0) ?? "";
}

export function parseTaskUrl(url: string): TaskNavigationState | null {
  const [path, query = ""] = url.split("?");
  const scope = parseTaskScope(path);
  if (!scope) return null;
  const params = new URLSearchParams(query);
  return {
    scope,
    // An unknown or disallowed view resolves to the Scope's default (§5.65).
    view: resolveViewFor(scope, firstParam(params, "view")),
    taskId: firstParam(params, "task"),
  };
}

function resolveViewFor(scope: TaskScopeRef, requested: string): TaskViewKind {
  const policy = policyFor(scope);
  return policy.allowedViews.some((allowed) => allowed === requested)
    ? (requested as TaskViewKind)
    : policy.defaultView;
}

/**
 * The single URL for a place (§5.35).
 *
 * The default view is omitted rather than spelled out, so `/inbox` is the only
 * way to say Inbox-as-a-list. Query order is fixed — `view` then `task` — so
 * two equal states cannot produce two strings. Everything the module does not
 * manage is dropped (§5.67).
 */
export function taskUrlFor(state: TaskNavigationState): string {
  const policy = policyFor(state.scope);
  const path = pathForTaskScope(state.scope);
  const query: string[] = [];
  const view = resolveViewFor(state.scope, state.view);
  if (view !== policy.defaultView) query.push(`view=${view}`);
  if (state.taskId) query.push(`task=${encodeURIComponent(state.taskId)}`);
  return query.length > 0 ? `${path}?${query.join("&")}` : path;
}

/**
 * Tidy a URL into the one form that means it, or `null` when the path is not
 * this module's to tidy.
 *
 * `/` is the exception the plan names (§16.24 Gate 1, §1.18): the app's front
 * door is Today. Applying this is `replaceState`, never a push (§5.36) —
 * cleaning a URL is not somewhere the user navigated to and must not be a
 * place the back button can return them to.
 */
export function canonicalizeTaskUrl(url: string): string | null {
  const [path] = url.split("?");
  if (splitPath(path).length === 0) return "/today";
  const state = parseTaskUrl(url);
  if (!state) return null;
  return taskUrlFor(state);
}
