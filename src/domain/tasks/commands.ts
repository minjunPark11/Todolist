// What the palette can RUN, as opposed to what it can find
// (TickTick plan §10.32-§10.34, Gate 8).
//
// §10.1 keeps the two apart inside one box: search asks what you are looking
// for, a command asks what you want done. They share an input and nothing
// else — which is why a command is a record here with its own availability
// rule, rather than a row the search results happen to include.
//
// Gate 8 asks for two things about availability, and they are not the same
// thing: a command the user cannot run must not be OFFERED, and must not RUN
// if it is somehow asked for anyway. Hiding a row is presentation; refusing
// to execute is the actual rule. `availableCommands` does the first,
// `canRunCommand` the second, and both read one predicate.
import type { TaskScopeRef, TaskViewKind } from "./scopeRegistry";
import { scopeRegistry } from "./scopeRegistry";

export type CommandId =
  | "goToday"
  | "goUpcoming"
  | "goInbox"
  | "goCompleted"
  | "goTrash"
  | "viewBoard"
  | "viewList"
  | "openSearch";

export interface CommandContext {
  /**
   * Where the user is standing — §10.34's context-aware commands.
   *
   * `null` since D-25: the menu is global now, so it is opened from Calendar,
   * Focus and the Spaces pages too, and none of those is a Scope. Nothing is
   * invented to fill the gap — a command that needs a Scope is simply not
   * offered there, which is the same rule §10.33 already applies inside the
   * Module.
   */
  scope: TaskScopeRef | null;
  view: TaskViewKind | null;
}

/** Where a command lands. `null` when the context it needed has gone (D-25). */
export type CommandTarget = { scope: TaskScopeRef; view?: TaskViewKind } | { search: true };

export interface TaskCommand {
  id: CommandId;
  labelKey: string;
  /** §10.33: the result has to be predictable, so every command is a destination. */
  target: (ctx: CommandContext) => CommandTarget | null;
  /** §10.33: a command that cannot do anything here is not shown. */
  enabled: (ctx: CommandContext) => boolean;
}

/** True when this Scope offers that View at all (§12.4, read from the registry). */
function allows(scope: TaskScopeRef, view: TaskViewKind): boolean {
  return scopeRegistry[scope.kind].allowedViews.includes(view);
}

const COMMANDS: TaskCommand[] = [
  {
    id: "goToday",
    labelKey: "commands.goToday",
    target: () => ({ scope: { kind: "today" } }),
    // Already there is not a destination. §10.33 asks for a predictable
    // result, and "nothing happens" is predictable in the wrong way.
    enabled: (ctx) => ctx.scope?.kind !== "today",
  },
  {
    id: "goUpcoming",
    labelKey: "commands.goUpcoming",
    target: () => ({ scope: { kind: "upcoming" } }),
    enabled: (ctx) => ctx.scope?.kind !== "upcoming",
  },
  {
    id: "goInbox",
    labelKey: "commands.goInbox",
    target: () => ({ scope: { kind: "inbox" } }),
    enabled: (ctx) => ctx.scope?.kind !== "inbox",
  },
  {
    id: "goCompleted",
    labelKey: "commands.goCompleted",
    target: () => ({ scope: { kind: "completed" } }),
    enabled: (ctx) => ctx.scope?.kind !== "completed",
  },
  {
    id: "goTrash",
    labelKey: "commands.goTrash",
    target: () => ({ scope: { kind: "trash" } }),
    enabled: (ctx) => ctx.scope?.kind !== "trash",
  },
  {
    id: "viewBoard",
    labelKey: "commands.viewBoard",
    target: (ctx) => (ctx.scope ? { scope: ctx.scope, view: "board" } : null),
    // §10.33's own example: offered only where the current Scope supports a
    // Board. Today has no Board, so the command is absent there rather than
    // present and inert. Outside a Scope entirely there is nothing to switch
    // the View of, so the same rule hides it (D-25).
    enabled: (ctx) => ctx.scope !== null && ctx.view !== "board" && allows(ctx.scope, "board"),
  },
  {
    id: "viewList",
    labelKey: "commands.viewList",
    target: (ctx) => (ctx.scope ? { scope: ctx.scope, view: "list" } : null),
    enabled: (ctx) => ctx.scope !== null && ctx.view !== "list" && allows(ctx.scope, "list"),
  },
  {
    id: "openSearch",
    labelKey: "commands.openSearch",
    target: () => ({ search: true }),
    enabled: () => true,
  },
];

/** Commands runnable from here, in registry order, matching the query (§10.36). */
export function availableCommands(query: string, ctx: CommandContext, label: (key: string) => string): TaskCommand[] {
  const needle = query.trim().toLowerCase();
  return COMMANDS.filter((command) => {
    if (!command.enabled(ctx)) return false;
    if (!needle) return false;
    return label(command.labelKey).toLowerCase().includes(needle);
  });
}

/**
 * Gate 8's other half: the same predicate, asked at the moment of execution.
 *
 * A caller that kept a stale list — the palette open while the Scope changed
 * underneath it — would otherwise run a command that is no longer offered.
 * Checking twice is not redundant; the two questions are asked at different
 * times about different states.
 */
export function canRunCommand(id: CommandId, ctx: CommandContext): boolean {
  const command = COMMANDS.find((candidate) => candidate.id === id);
  return Boolean(command && command.enabled(ctx));
}

export function commandById(id: CommandId): TaskCommand | undefined {
  return COMMANDS.find((command) => command.id === id);
}

export const ALL_COMMAND_IDS: CommandId[] = COMMANDS.map((command) => command.id);
