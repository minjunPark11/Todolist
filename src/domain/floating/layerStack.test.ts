import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  descendantIds,
  dismissedByPointer,
  orphanedByOwner,
  pushLayer,
  removeLayer,
  topDismissable,
  zIndexOf,
} from "./layerStack";
import type { Layer } from "./types";
import { Z } from "./zIndex";

function popover(id: string, extra: Partial<Layer> = {}): Layer {
  return { id, type: "popover", ...extra };
}

function ids(stack: Layer[]) {
  return stack.map((layer) => layer.id);
}

/** Priority open, then Date opened from the same property header. */
function twoPrimaries() {
  return pushLayer(pushLayer([], popover("priority")), popover("date"));
}

/** Schedule popover with a Reminder sub-popover inside it (§19.24). */
function nested() {
  return pushLayer(pushLayer([], popover("schedule")), popover("reminder", { parentId: "schedule" }));
}

describe("pushLayer (§19.23, §19.69)", () => {
  it("closes the sibling primary rather than opening two at once", () => {
    expect(ids(twoPrimaries())).toEqual(["date"]);
  });

  it("keeps a parent when its child opens", () => {
    expect(ids(nested())).toEqual(["schedule", "reminder"]);
  });

  it("replaces a layer re-pushed under the same id instead of stacking it", () => {
    const stack = pushLayer(pushLayer([], popover("date")), popover("date"));
    expect(ids(stack)).toEqual(["date"]);
  });

  it("lets a tooltip and a popover coexist", () => {
    const stack = pushLayer(pushLayer([], { id: "tip", type: "tooltip" }), popover("date"));
    expect(ids(stack)).toEqual(["tip", "date"]);
  });

  // §19.66: More Menu → Delete recurring → Scope dialog. The menu goes first;
  // the two do not linger half-overlapping.
  it("closes the menu that opened a modal", () => {
    const stack = pushLayer(pushLayer([], { id: "more", type: "menu" }), { id: "scope", type: "modal" });
    expect(ids(stack)).toEqual(["scope"]);
  });

  // §19.67: the popover belongs to the dialog, so the dialog stays.
  it("keeps a modal when a popover opens inside it", () => {
    const withModal = pushLayer([], { id: "scope", type: "modal" });
    const stack = pushLayer(withModal, popover("date", { parentId: "scope" }));
    expect(ids(stack)).toEqual(["scope", "date"]);
  });

  it("closes a sibling sub-popover, not the parent", () => {
    const stack = pushLayer(nested(), popover("repeat", { parentId: "schedule" }));
    expect(ids(stack)).toEqual(["schedule", "repeat"]);
  });

  // Dropping the evicted layer alone would strand its child on a trigger that
  // is no longer drawn.
  it("takes an evicted layer's children with it", () => {
    const stack = pushLayer(nested(), popover("priority"));
    expect(ids(stack)).toEqual(["priority"]);
  });
});

describe("removeLayer", () => {
  it("closes descendants with their parent", () => {
    expect(ids(removeLayer(nested(), "schedule"))).toEqual([]);
  });

  it("leaves the parent standing when the child closes (§19.25)", () => {
    expect(ids(removeLayer(nested(), "reminder"))).toEqual(["schedule"]);
  });
});

describe("ancestorIds / descendantIds", () => {
  it("reads ancestors nearest first", () => {
    const deep = pushLayer(nested(), popover("custom", { parentId: "reminder" }));
    expect(ancestorIds(deep, "custom")).toEqual(["reminder", "schedule"]);
    expect(descendantIds(deep, "schedule")).toEqual(["reminder", "custom"]);
  });

  // A malformed parentId must not hang the window it is drawn in.
  it("does not loop forever on a cycle", () => {
    const cyclic: Layer[] = [
      { id: "a", type: "popover", parentId: "b" },
      { id: "b", type: "popover", parentId: "a" },
    ];
    expect(ancestorIds(cyclic, "a")).toEqual(["b"]);
  });
});

describe("topDismissable (§19.25, §19.92, §19.93)", () => {
  it("names the child, so one Escape closes one layer", () => {
    const stack = nested();
    expect(topDismissable(stack)?.id).toBe("reminder");
    expect(topDismissable(removeLayer(stack, "reminder"))?.id).toBe("schedule");
  });

  // Which is how the Drawer underneath still answers its own Escape.
  it("names nothing when nothing is open", () => {
    expect(topDismissable([])).toBeNull();
  });

  // §19.68: a Toast must not eat the Escape meant for the popover under it.
  it("ignores toasts and tooltips", () => {
    const stack: Layer[] = [popover("date"), { id: "saved", type: "toast" }, { id: "tip", type: "tooltip" }];
    expect(topDismissable(stack)?.id).toBe("date");
  });
});

describe("dismissedByPointer (§19.26, §19.27)", () => {
  it("closes everything when the pointer lands outside all of it", () => {
    expect(dismissedByPointer(nested(), [])).toEqual(["reminder", "schedule"]);
  });

  // The rule §19.26 exists for: a click in the child is not outside the parent.
  it("keeps the parent when the pointer lands in its child", () => {
    expect(dismissedByPointer(nested(), ["reminder"])).toEqual([]);
  });

  it("closes the child when the pointer lands in the parent", () => {
    expect(dismissedByPointer(nested(), ["schedule"])).toEqual(["reminder"]);
  });

  it("closes topmost first, so a child's callback runs before its parent's", () => {
    expect(dismissedByPointer(nested(), [])).toEqual(["reminder", "schedule"]);
  });

  // §19.55: a dialog covers what is under it, so nothing below it was clicked
  // outside of, and backdrop dismissal is the dialog's own business. The
  // popover the dialog opened is still ordinary.
  it("stops at a modal", () => {
    const stack = pushLayer(pushLayer([], { id: "scope", type: "modal" }), popover("date", { parentId: "scope" }));
    expect(dismissedByPointer(stack, [])).toEqual(["date"]);
    expect(dismissedByPointer(stack, ["date"])).toEqual([]);
  });

  it("leaves toasts alone (§19.68)", () => {
    const stack: Layer[] = [popover("date"), { id: "saved", type: "toast" }];
    expect(dismissedByPointer(stack, [])).toEqual(["date"]);
  });
});

describe("orphanedByOwner (§19.21, §19.74)", () => {
  it("closes the layer belonging to the Task that is no longer shown", () => {
    const stack = pushLayer([], popover("date", { ownerTaskId: "t1" }));
    expect(orphanedByOwner(stack, "t2")).toEqual(["date"]);
    expect(orphanedByOwner(stack, "t1")).toEqual([]);
  });

  it("leaves a layer that belongs to no Task", () => {
    expect(orphanedByOwner(pushLayer([], popover("sidebar")), "t2")).toEqual([]);
  });

  it("closes them when the Detail closes entirely", () => {
    const stack = pushLayer([], popover("date", { ownerTaskId: "t1" }));
    expect(orphanedByOwner(stack, null)).toEqual(["date"]);
  });
});

describe("zIndexOf (§19.4, §19.64, §19.67)", () => {
  it("gives a free-standing popover its band", () => {
    expect(zIndexOf(pushLayer([], popover("date")), "date")).toBe(Z.popover);
  });

  it("puts a submenu above the menu that opened it", () => {
    const stack = pushLayer(pushLayer([], { id: "more", type: "menu" }), {
      id: "move",
      type: "menu",
      parentId: "more",
    });
    expect(zIndexOf(stack, "move")).toBeGreaterThan(zIndexOf(stack, "more"));
  });

  // The failure §19.67 names: a popover's band is below a modal's, so taking
  // the band alone would render it behind the dialog that opened it.
  it("lifts a popover opened from a modal above the modal", () => {
    const stack = pushLayer(pushLayer([], { id: "scope", type: "modal" }), popover("date", { parentId: "scope" }));
    expect(zIndexOf(stack, "date")).toBeGreaterThan(Z.modal);
  });

  it("keeps nesting inside its own band", () => {
    let stack = pushLayer([], popover("a"));
    for (const [child, parent] of [["b", "a"], ["c", "b"], ["d", "c"]]) {
      stack = pushLayer(stack, popover(child, { parentId: parent }));
    }
    expect(zIndexOf(stack, "d")).toBeLessThan(Z.menu);
  });
});
