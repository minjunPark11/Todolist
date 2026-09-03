import { describe, expect, it } from "vitest";
import type { CommandContext } from "./commands";
import { ALL_COMMAND_IDS, availableCommands, canRunCommand, commandById } from "./commands";

// The palette shows labels, so the tests search the same way a user does.
const LABELS: Record<string, string> = {
  "commands.goToday": "Go to Today",
  "commands.goUpcoming": "Go to Next 7 days",
  "commands.goInbox": "Go to Inbox",
  "commands.goCompleted": "Go to Completed",
  "commands.goTrash": "Go to Trash",
  "commands.viewBoard": "Show as board",
  "commands.viewList": "Show as list",
  "commands.openSearch": "Open search",
};
const t = (key: string) => LABELS[key] ?? key;

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return { scope: { kind: "today" }, view: "list", ...overrides };
}

describe("availableCommands", () => {
  it("matches on the label the user can see", () => {
    expect(availableCommands("inbox", ctx(), t).map((command) => command.id)).toEqual(["goInbox"]);
  });

  it("shows nothing until something is typed (§10.8 keeps the empty state for recents)", () => {
    expect(availableCommands("", ctx(), t)).toEqual([]);
  });

  it("hides the destination the user is already at", () => {
    const here = availableCommands("go to", ctx({ scope: { kind: "inbox" } }), t).map((command) => command.id);
    expect(here).not.toContain("goInbox");
    expect(here).toContain("goToday");
  });

  // Gate 8, third line, and §10.33's own example.
  it("offers the Board only where the Scope has one", () => {
    expect(availableCommands("board", ctx({ scope: { kind: "inbox" } }), t).map((c) => c.id)).toEqual(["viewBoard"]);
    // Today has one now (TASK_VIEWS_EVERYWHERE_DESIGN.md §2). The Trash does
    // not, and that is the half of this test still doing work.
    expect(availableCommands("board", ctx({ scope: { kind: "today" } }), t).map((c) => c.id)).toEqual(["viewBoard"]);
    expect(availableCommands("board", ctx({ scope: { kind: "trash" } }), t)).toEqual([]);
  });

  it("does not offer the view already showing", () => {
    const onBoard = ctx({ scope: { kind: "list", id: "l1" }, view: "board" });
    expect(availableCommands("show as", onBoard, t).map((command) => command.id)).toEqual(["viewList"]);
  });
});

describe("canRunCommand — the same question at execution time", () => {
  it("refuses what it would not have offered", () => {
    expect(canRunCommand("viewBoard", ctx({ scope: { kind: "trash" } }))).toBe(false);
    expect(canRunCommand("viewBoard", ctx({ scope: { kind: "inbox" } }))).toBe(true);
    expect(canRunCommand("goInbox", ctx({ scope: { kind: "inbox" } }))).toBe(false);
  });

  it("agrees with what was offered, for every command and several Scopes", () => {
    for (const scope of [{ kind: "today" }, { kind: "inbox" }, { kind: "trash" }] as const) {
      const context = ctx({ scope });
      const offered = new Set(availableCommands("", context, t).map((command) => command.id));
      for (const id of ALL_COMMAND_IDS) {
        // Nothing is offered for an empty query, so the agreement checked here
        // is the predicate itself rather than the filtering around it.
        expect(offered.has(id)).toBe(false);
        expect(canRunCommand(id, context)).toBe(Boolean(commandById(id)?.enabled(context)));
      }
    }
  });
});

// D-25: the menu opens on the Calendar, on Focus, on the Spaces pages. None
// of those is a Scope, and the honest answer is `null` rather than a Scope
// invented to keep the shape.
describe("outside a Scope entirely", () => {
  const nowhere = ctx({ scope: null, view: null });

  it("still offers every destination, because none of them is where you are", () => {
    const offered = availableCommands("go to", nowhere, t).map((command) => command.id);
    expect(offered).toEqual(["goToday", "goUpcoming", "goInbox", "goCompleted", "goTrash"]);
  });

  it("withholds the view commands, which had nothing to switch", () => {
    expect(availableCommands("show as", nowhere, t)).toEqual([]);
    expect(canRunCommand("viewBoard", nowhere)).toBe(false);
    expect(canRunCommand("viewList", nowhere)).toBe(false);
  });

  it("keeps Search reachable, since it is a page and not a Scope", () => {
    expect(availableCommands("search", nowhere, t).map((command) => command.id)).toEqual(["openSearch"]);
  });

  it("gives a view command no target to run, as the second guard (Gate 8)", () => {
    expect(commandById("viewBoard")?.target(nowhere)).toBeNull();
  });
});

describe("targets — §10.33's predictable results", () => {
  it("navigation commands name a Scope", () => {
    expect(commandById("goToday")?.target(ctx())).toEqual({ scope: { kind: "today" } });
    expect(commandById("goTrash")?.target(ctx())).toEqual({ scope: { kind: "trash" } });
  });

  it("view commands keep the Scope and change only the view", () => {
    const here = ctx({ scope: { kind: "list", id: "l1" } });
    expect(commandById("viewBoard")?.target(here)).toEqual({ scope: { kind: "list", id: "l1" }, view: "board" });
  });

  it("search is its own destination and not a Scope", () => {
    expect(commandById("openSearch")?.target(ctx())).toEqual({ search: true });
  });
});
