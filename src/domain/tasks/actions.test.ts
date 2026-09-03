import { describe, expect, it } from "vitest";
import { canRunTaskAction, taskActions, type TaskActionContext, type TaskActionId } from "./actions";
import type { TaskStateFields } from "./taskState";

function ids(task: TaskStateFields, ctx: Omit<TaskActionContext, "task"> = {}): TaskActionId[] {
  return taskActions({ task, ...ctx }).flatMap((group) => group.items.map((item) => item.id));
}

const OPEN: TaskStateFields = { status: "open" };

describe("taskActions", () => {
  it("offers an open Task the actions §15.4 lists for one", () => {
    expect(ids(OPEN)).toEqual([
      // Pin, Duplicate, Save as template and Copy link led this list until
      // TASK_MENU_TRIM_DESIGN.md took the whole `quick` group.
      "startFocus",
      "activities",
      "complete",
      "wontDo",
      "trash",
    ]);
  });

  it("keeps the groups in §15.42's order, with Delete alone at the end", () => {
    const groups = taskActions({ task: OPEN });
    expect(groups.map((group) => group.id)).toEqual(["work", "status", "danger"]);
    // §15.29: its own group, and §15.30's destructive marking travels with it
    // so a surface does not have to know which id is the dangerous one.
    expect(groups[groups.length - 1].items).toEqual([
      expect.objectContaining({ id: "trash", danger: true }),
    ]);
  });

  it("swaps Complete for Reopen once the Task is finished, and keeps Won't Do", () => {
    const finished = ids({ status: "completed", completedAt: "2026-08-25T10:00:00.000Z" });
    expect(finished).toContain("reopen");
    expect(finished).not.toContain("complete");
    // §15.4's second table: a finished Task can still be given up on.
    expect(finished).toContain("wontDo");
  });

  it("offers a Won't Do Task the way back, and completing it", () => {
    const given = ids({ status: "open", wontDoAt: "2026-08-25T10:00:00.000Z" });
    expect(given).toContain("restart");
    expect(given).not.toContain("wontDo");
    expect(given).toContain("complete");
  });

  it("reads a legacy `archived` record as given up on", () => {
    // The three spellings `isWontDo` accepts are the point: a record written
    // before `wontDoAt` existed must not be offered "Mark won't do" again.
    expect(ids({ status: "archived" })).toContain("restart");
  });

  // Pin/Unpin, Duplicate, Save as template and Copy link were the whole of the
  // `quick` group, and it is gone (TASK_MENU_TRIM_DESIGN.md §1). The two tests
  // that stood here read the pin toggle off `pinnedAt`; what replaces them is
  // the one fact left to hold — the menu never offers any of the five, in any
  // state, including the state that used to be the reason for half of them.
  it("offers none of the five the menu no longer has", () => {
    const gone = ["pin", "unpin", "duplicate", "saveAsTemplate", "copyLink"];
    const pinned = ids({ status: "open", pinnedAt: "2026-08-25T10:00:00.000Z" });
    for (const state of [ids(OPEN), pinned, ids({ status: "completed" })]) {
      expect(state.filter((id) => gone.includes(id))).toEqual([]);
    }
  });

  it("leaves a pinned Task the same menu as any other (§15.7)", () => {
    // The record still carries `pinnedAt` — nothing migrates it away — and it
    // must not change what the menu says.
    expect(ids({ status: "open", pinnedAt: "2026-08-25T10:00:00.000Z" })).toEqual(ids(OPEN));
  });

  it("leaves a trashed Task only what still means something", () => {
    // Not disabled rows: §15.5 hides an action that has no reason to exist
    // here. The Detail used to draw "Move to trash" for a Task already in the
    // Trash, where its only effect was to rewrite the timestamp.
    expect(ids({ status: "open", deletedAt: "2026-08-25T10:00:00.000Z" })).toEqual([
      "activities",
      "restore",
      "deleteForever",
    ]);
  });

  // The two are the same verb at two depths, so they must never be offered at
  // once: a menu with both would be asking the reader to notice which of two
  // adjacent red rows is the one that cannot be taken back
  // (TRASH_PERMANENT_DELETE_DESIGN.md §3.1).
  it("never offers Trash and Delete forever together", () => {
    const live = ids(OPEN);
    expect(live).toContain("trash");
    expect(live).not.toContain("deleteForever");

    const trashed = ids({ status: "open", deletedAt: "2026-08-25T10:00:00.000Z" });
    expect(trashed).toContain("deleteForever");
    expect(trashed).not.toContain("trash");
  });

  // §15.66's re-ask is the last thing standing between a stale dialog and a
  // hard delete on a Task somebody else has already restored.
  it("refuses Delete forever the moment the Task leaves the Trash", () => {
    const trashed = { status: "open", deletedAt: "2026-08-25T10:00:00.000Z" } as const;
    expect(canRunTaskAction("deleteForever", trashed)).toBe(true);
    expect(canRunTaskAction("deleteForever", { ...trashed, deletedAt: "" })).toBe(false);
    expect(canRunTaskAction("deleteForever", undefined)).toBe(false);
  });

  it("hides Start Focus for work that is over, and disables it with a reason while a session runs", () => {
    expect(ids({ status: "completed" })).not.toContain("startFocus");
    expect(ids({ status: "open", wontDoAt: "2026-08-25T10:00:00.000Z" })).not.toContain("startFocus");

    const busy = taskActions({ task: OPEN, focusBusy: true })
      .flatMap((group) => group.items)
      .find((item) => item.id === "startFocus");
    // §15.5: still offered, because it will be possible again in a minute —
    // and it says why, which is what separates that case from hiding it.
    expect(busy?.disabledReasonKey).toBe("tasks.menu.focusBusy");
  });

  it("drops the actions a surface already draws itself (§15.3)", () => {
    const detail = ids(OPEN, { promoted: ["complete", "reopen"] });
    expect(detail).not.toContain("complete");
    // Only those: promoting one action does not thin out the rest.
    expect(detail).toContain("wontDo");
    expect(detail).toContain("trash");
  });

  it("never emits an empty group", () => {
    for (const task of [OPEN, { status: "completed" }, { deletedAt: "x" }] satisfies TaskStateFields[]) {
      for (const group of taskActions({ task })) expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("gives every action a label of its own", () => {
    const labels = taskActions({ task: OPEN }).flatMap((g) => g.items.map((i) => i.labelKey));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((key) => key.length > 0)).toBe(true);
  });
});

describe("canRunTaskAction", () => {
  it("refuses a Task that is no longer there (§15.67)", () => {
    // The menu was drawn from a Task that a sync has since removed. §15.67
    // says the menu's picture of the world is not the truth to act on.
    expect(canRunTaskAction("trash", undefined)).toBe(false);
  });

  it("refuses an action the current state hides", () => {
    expect(canRunTaskAction("complete", { status: "completed" })).toBe(false);
    expect(canRunTaskAction("trash", { deletedAt: "2026-08-25T10:00:00.000Z" })).toBe(false);
    expect(canRunTaskAction("startFocus", OPEN, { focusBusy: true })).toBe(false);
  });

  it("allows an action a surface promoted out of its menu", () => {
    // `promoted` says where a row is drawn, not whether the command may run —
    // the Detail's Complete checkbox is exactly this case.
    expect(canRunTaskAction("complete", OPEN)).toBe(true);
  });
});
