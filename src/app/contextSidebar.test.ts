import { describe, expect, it } from "vitest";
import {
  CONTEXT_SIDEBAR_DEFAULT_WIDTH,
  CONTEXT_SIDEBAR_MAX_WIDTH,
  CONTEXT_SIDEBAR_MIN_WIDTH,
  clampContextSidebarWidth,
  contextSidebarModeFor,
  effectiveContextSidebarWidth,
  readStoredWidth,
  widthAfterKey,
} from "./contextSidebar";
import { PAGE_ROUTES } from "./pageRoute";

describe("contextSidebar", () => {
  describe("width clamp (§3.7)", () => {
    it("holds the range", () => {
      expect(clampContextSidebarWidth(100)).toBe(CONTEXT_SIDEBAR_MIN_WIDTH);
      expect(clampContextSidebarWidth(9000)).toBe(CONTEXT_SIDEBAR_MAX_WIDTH);
      expect(clampContextSidebarWidth(280)).toBe(280);
    });

    it("survives a number that is not one", () => {
      expect(clampContextSidebarWidth(Number.NaN)).toBe(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
    });

    // §3.7: dragging past the minimum is not a collapse gesture.
    it("does not turn an under-minimum drag into zero", () => {
      expect(clampContextSidebarWidth(12)).toBe(CONTEXT_SIDEBAR_MIN_WIDTH);
      expect(clampContextSidebarWidth(-400)).toBe(CONTEXT_SIDEBAR_MIN_WIDTH);
    });
  });

  describe("mode (§3.3, D-14)", () => {
    it("gives the Global Modules no sidebar", () => {
      // D-19: Matrix joins them — it crosses every Space, so no one Scope's
      // sidebar describes it.
      expect(contextSidebarModeFor(PAGE_ROUTES.board)).toBe("none");
      expect(contextSidebarModeFor(PAGE_ROUTES.calendar)).toBe("none");
      expect(contextSidebarModeFor(PAGE_ROUTES.focus)).toBe("none");
      expect(contextSidebarModeFor(PAGE_ROUTES.settings)).toBe("none");
    });

    // The Projects and Goals pages are gone, and so is the Space tree their
    // addresses named. Every one of those links now resolves to Today, which
    // shows the Tasks sidebar — so an old bookmark lands somewhere whole
    // rather than on a page with no navigation.
    it("keeps the Tasks sidebar on the retired Projects and Goals addresses", () => {
      expect(contextSidebarModeFor("/projects")).toBe("tasks");
      expect(contextSidebarModeFor("/goals")).toBe("tasks");
      expect(contextSidebarModeFor("/s/space-1")).toBe("tasks");
    });

    it("keeps the Tasks sidebar everywhere else", () => {
      for (const path of [PAGE_ROUTES.today, "/today", "/list/l1", "/search"]) {
        expect(contextSidebarModeFor(path)).toBe("tasks");
      }
    });
  });

  describe("effective width (§3.30)", () => {
    it("is zero with no sidebar and zero when collapsed", () => {
      expect(effectiveContextSidebarWidth({ mode: "none", width: 300, visibility: "expanded" })).toBe(0);
      expect(effectiveContextSidebarWidth({ mode: "tasks", width: 300, visibility: "collapsed" })).toBe(0);
    });

    it("is the chosen width when shown", () => {
      expect(effectiveContextSidebarWidth({ mode: "tasks", width: 300, visibility: "expanded" })).toBe(300);
    });

    // §3.28: collapsing must not eat the number the user picked.
    it("returns the remembered width after a collapse and expand", () => {
      const collapsed = { mode: "tasks", width: 304, visibility: "collapsed" } as const;
      expect(effectiveContextSidebarWidth(collapsed)).toBe(0);
      expect(effectiveContextSidebarWidth({ ...collapsed, visibility: "expanded" })).toBe(304);
    });
  });

  describe("stored width (§3.58)", () => {
    it("recovers from anything it did not write", () => {
      expect(readStoredWidth(null)).toBe(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
      expect(readStoredWidth("")).toBe(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
      expect(readStoredWidth("wide please")).toBe(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
      // A width nobody can drag back into range.
      expect(readStoredWidth("4")).toBe(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
      expect(readStoredWidth("4000")).toBe(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
      // And "0", which is what a collapse-as-width bug would leave behind.
      expect(readStoredWidth("0")).toBe(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
    });

    it("keeps a width it did write", () => {
      expect(readStoredWidth("300")).toBe(300);
      expect(readStoredWidth(String(CONTEXT_SIDEBAR_MIN_WIDTH))).toBe(CONTEXT_SIDEBAR_MIN_WIDTH);
      expect(readStoredWidth(String(CONTEXT_SIDEBAR_MAX_WIDTH))).toBe(CONTEXT_SIDEBAR_MAX_WIDTH);
    });
  });

  describe("keyboard resize (§3.20)", () => {
    it("steps by 16, and by 32 with Shift", () => {
      expect(widthAfterKey(248, "ArrowLeft", false)).toBe(232);
      expect(widthAfterKey(248, "ArrowRight", false)).toBe(264);
      expect(widthAfterKey(248, "ArrowLeft", true)).toBe(216);
      expect(widthAfterKey(248, "ArrowRight", true)).toBe(280);
    });

    it("jumps to the ends", () => {
      expect(widthAfterKey(248, "Home", false)).toBe(CONTEXT_SIDEBAR_MIN_WIDTH);
      expect(widthAfterKey(248, "End", false)).toBe(CONTEXT_SIDEBAR_MAX_WIDTH);
    });

    it("clamps at the ends instead of running past them", () => {
      expect(widthAfterKey(CONTEXT_SIDEBAR_MIN_WIDTH, "ArrowLeft", true)).toBe(CONTEXT_SIDEBAR_MIN_WIDTH);
      expect(widthAfterKey(CONTEXT_SIDEBAR_MAX_WIDTH, "ArrowRight", true)).toBe(CONTEXT_SIDEBAR_MAX_WIDTH);
    });

    it("ignores keys that are not resize keys", () => {
      expect(widthAfterKey(248, "a", false)).toBeNull();
      expect(widthAfterKey(248, "ArrowUp", false)).toBeNull();
    });
  });
});
