import { describe, expect, it } from "vitest";
import type { List } from "../../types";
import { LIST_COLOR_PRESETS } from "../tasks/listColor";
import {
  colorForList,
  colorForTask,
  NEUTRAL_LIST_COLOR,
  PRIORITY_COLOR,
  sanitizeColorBy,
} from "./itemColor";
import {
  BLOCK_INK_DARK,
  BLOCK_INK_LIGHT,
  contrastRatio,
  darkenForWhiteInk,
  readableInkOn,
  WHITE_INK_TARGET,
} from "./readableInk";

function list(patch: Partial<List> & { id: string }): List {
  return {
    projectId: "",
    kind: "regular",
    name: "List",
    order: 0,
    isDefault: false,
    color: "",
    createdAt: "",
    updatedAt: "",
    ...patch,
  } as List;
}

describe("the colour a List gives its blocks", () => {
  it("uses the colour its owner picked, preset or custom", () => {
    expect(colorForList(list({ id: "a", color: "green" }))).toBe("#30a46c");
    expect(colorForList(list({ id: "b", color: "#123456" }))).toBe("#123456");
  });

  // E1-C. The alternative was a grey or an accent for every unpainted List,
  // which on an account that has never opened the colour picker means the
  // whole grid is one colour again — the thing this change exists to end.
  it("makes one up for a List nobody painted, from the same eight presets", () => {
    const colour = colorForList(list({ id: "list-groceries" }));
    expect(LIST_COLOR_PRESETS.map((preset) => preset.hex)).toContain(colour);
  });

  it("gives the same List the same colour every time, on every device", () => {
    const first = colorForList(list({ id: "list-groceries" }));
    const second = colorForList(list({ id: "list-groceries", name: "renamed", order: 9 }));
    expect(second).toBe(first);
  });

  it("spreads ids across the palette rather than favouring one", () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, index) => colorForList(list({ id: `list-${index}` }))),
    );
    // Not a claim about distribution quality — just that the hash is not
    // collapsing to one or two buckets, which a bad mix would.
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("leaves the Inbox neutral — nobody named it, so its hue would say nothing", () => {
    expect(colorForList(list({ id: "list-inbox", kind: "inbox" }))).toBe(NEUTRAL_LIST_COLOR);
  });

  it("is neutral for a List that is not there", () => {
    expect(colorForList(undefined)).toBe(NEUTRAL_LIST_COLOR);
  });
});

// `colorForTask` is the fill, and a fill carries white text
// (CALENDAR_FILL_READABILITY_DESIGN.md §7), so what comes out of here has been
// through `darkenForWhiteInk`. These assert the axis it read, not the raw hex
// — the darkening has its own tests in `readableInk.test.ts`.
describe("which axis the fill reads", () => {
  const listsById = new Map([["l1", list({ id: "l1", color: "purple" })]]);

  it("reads the List by default", () => {
    // Purple already clears white text, so it comes through untouched and the
    // axis is visible in the value.
    expect(colorForTask({ colorBy: "list", listId: "l1", priority: "high", listsById })).toBe("#8e4ec6");
  });

  it("reads the priority when asked to", () => {
    expect(colorForTask({ colorBy: "priority", listId: "l1", priority: "high", listsById })).toBe(
      darkenForWhiteInk(PRIORITY_COLOR.high),
    );
  });

  it("treats a task with no priority as `none` rather than as an error", () => {
    expect(colorForTask({ colorBy: "priority", listId: "l1", priority: undefined, listsById })).toBe(
      darkenForWhiteInk(PRIORITY_COLOR.none),
    );
  });

  it("hands back a fill white text can be read on, whichever axis it read", () => {
    const cases = [
      colorForTask({ colorBy: "list", listId: "l1", priority: "none", listsById }),
      colorForTask({ colorBy: "list", listId: "missing", priority: "none", listsById }),
      colorForTask({ colorBy: "priority", listId: "l1", priority: "medium", listsById }),
    ];
    for (const fill of cases) {
      expect(contrastRatio(fill, BLOCK_INK_LIGHT), fill).toBeGreaterThanOrEqual(WHITE_INK_TARGET);
    }
  });

  it("falls back to the List for a stored value that never was", () => {
    expect(sanitizeColorBy("tag")).toBe("list");
    expect(sanitizeColorBy(undefined)).toBe("list");
    expect(sanitizeColorBy("priority")).toBe("priority");
  });
});

// The claim the solid fills rest on, now that a second palette can reach them.
// `readableInk.test.ts` makes it for the category palette; these are the two
// that arrived with this change.
describe("every colour a block can now be", () => {
  const everything = [
    ...LIST_COLOR_PRESETS.map((preset) => preset.hex),
    ...Object.values(PRIORITY_COLOR),
    NEUTRAL_LIST_COLOR,
  ];

  it("is readable with the ink chosen for it", () => {
    for (const colour of everything) {
      const ink = readableInkOn(colour) === "light" ? BLOCK_INK_LIGHT : BLOCK_INK_DARK;
      expect(contrastRatio(colour, ink), `${colour} with ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // `--priority-low` clears the bar by 0.05. Lightening that token at all puts
  // it under, and this is the test that would say so.
  it("clears it by the least on priority low, which is the one to watch", () => {
    const ratio = contrastRatio(PRIORITY_COLOR.low, BLOCK_INK_DARK);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(4.7);
  });
});
