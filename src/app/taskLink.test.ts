import { describe, expect, it } from "vitest";
import { taskLinkFor } from "./taskLink";
import { parseTaskUrl } from "./taskScopeUrl";
import type { TaskNavigationState } from "./taskScopeUrl";

const ORIGIN = "https://app.example.com";

const inList: TaskNavigationState = {
  scope: { kind: "list", id: "l1" },
  view: "list",
  taskId: "t1",
};

describe("taskLinkFor (§15.19, §15.20)", () => {
  it("names the Task", () => {
    expect(taskLinkFor(ORIGIN, inList, "t1")).toBe("https://app.example.com/list/l1?task=t1");
  });

  it("names it even when the state it was copied from had no Task open", () => {
    // The Board is this case: a card's ⋯ opens a menu without navigating, so
    // the address bar still says the List. Copying that would hand someone a
    // link to a screen and let them hunt for the row.
    const board: TaskNavigationState = { scope: { kind: "list", id: "l1" }, view: "board", taskId: "" };
    expect(taskLinkFor(ORIGIN, board, "t9")).toContain("task=t9");
  });

  it("keeps the View it was copied from (§15.20's context)", () => {
    const board: TaskNavigationState = { scope: { kind: "list", id: "l1" }, view: "board", taskId: "t1" };
    expect(taskLinkFor(ORIGIN, board, "t1")).toBe("https://app.example.com/list/l1?view=board&task=t1");
  });

  it("produces a link this app can read back", () => {
    // The round trip is the whole claim: a link that cannot be parsed is a
    // link that opens the wrong thing.
    const link = taskLinkFor(ORIGIN, inList, "t1");
    const parsed = parseTaskUrl(link.slice(ORIGIN.length));
    expect(parsed).toEqual({ scope: { kind: "list", id: "l1" }, view: "list", taskId: "t1" });
  });

  it("does not double the slash when the origin carries one", () => {
    expect(taskLinkFor("https://app.example.com/", inList, "t1")).toBe(
      "https://app.example.com/list/l1?task=t1",
    );
  });

  it("escapes an id that would otherwise change the address", () => {
    expect(taskLinkFor(ORIGIN, inList, "a b&view=board")).toContain("task=a%20b%26view%3Dboard");
  });
});
