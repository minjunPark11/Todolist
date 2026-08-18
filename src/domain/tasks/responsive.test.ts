import { describe, expect, it } from "vitest";
import {
  detailIsFullScreen,
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_MODES,
  responsiveModeFor,
  sidebarPresentationFor,
  taskDetailPresentationFor,
} from "./responsive";
import { canonicalizeTaskUrl, parseTaskUrl, taskUrlFor } from "../../app/taskScopeUrl";

describe("responsiveModeFor — §15.3's table", () => {
  it("puts each boundary in the mode the plan names", () => {
    expect(responsiveModeFor(390)).toBe("mobile");
    expect(responsiveModeFor(767)).toBe("mobile");
    expect(responsiveModeFor(RESPONSIVE_BREAKPOINTS.mobile)).toBe("tablet");
    expect(responsiveModeFor(1023)).toBe("tablet");
    expect(responsiveModeFor(RESPONSIVE_BREAKPOINTS.desktop)).toBe("compactDesktop");
    expect(responsiveModeFor(1279)).toBe("compactDesktop");
    expect(responsiveModeFor(RESPONSIVE_BREAKPOINTS.wideDesktop)).toBe("wideDesktop");
    expect(responsiveModeFor(1920)).toBe("wideDesktop");
  });

  it("answers something for a nonsense width rather than nothing", () => {
    expect(responsiveModeFor(0)).toBe("mobile");
  });
});

describe("the presentation registries — §15.17/§15.14", () => {
  it("gives every mode a Task Detail presentation", () => {
    expect(RESPONSIVE_MODES.map(taskDetailPresentationFor)).toEqual([
      "full-screen",
      "right-sheet",
      "overlay-drawer",
      "inline-drawer",
    ]);
  });

  it("makes the Sidebar a sheet below the desktop widths", () => {
    expect(RESPONSIVE_MODES.map(sidebarPresentationFor)).toEqual([
      "overlay",
      "overlay",
      "persistent",
      "persistent",
    ]);
  });

  it("puts the Rail-hiding full-screen detail on mobile only (§15.13)", () => {
    expect(RESPONSIVE_MODES.filter(detailIsFullScreen)).toEqual(["mobile"]);
  });
});

// §15.9, the invariant the whole layer serves — and Gate 10's premise.
describe("presentation is not navigation", () => {
  const url = "/list/lst_abm?view=board&task=tsk_1";

  it("means the same thing at every width", () => {
    const state = parseTaskUrl(url);
    expect(state).toEqual({ scope: { kind: "list", id: "lst_abm" }, view: "board", taskId: "tsk_1" });
    // Nothing about the mode is an input to the URL, so the same state
    // serialises identically whatever the screen is doing.
    for (const width of [390, 900, 1440]) {
      expect(responsiveModeFor(width)).toBeTruthy();
      expect(taskUrlFor(state!)).toBe(url);
      expect(canonicalizeTaskUrl(url)).toBe(url);
    }
  });

  it("keeps `?view=board` on a phone rather than dropping it", () => {
    // §15.9 forbids exactly this rewrite. The Board renders as a horizontally
    // scrolling strip on mobile (§15.33); it does not stop being the view.
    expect(canonicalizeTaskUrl("/list/lst_abm?view=board")).toBe("/list/lst_abm?view=board");
  });
});
