import { describe, expect, it } from "vitest";
import { RAIL_DESTINATIONS, TASKS_HOME, isTasksLocation, railItemFor } from "./railNav";
import { PAGE_ROUTES } from "./pageRoute";

describe("railNav", () => {
  // §2.47's Route-to-Rail matrix, rewritten for this repo's routes (audit D-03).
  it("lights Tasks for everything that is not a Global Module", () => {
    for (const path of [
      PAGE_ROUTES.today,
      "/projects",
      "/today",
      "/upcoming",
      "/inbox",
      "/list/list-1",
      "/tag/tag-1",
      "/completed",
      "/trash",
      "/search",
      "/s/space-1/p/project-1",
    ]) {
      expect(railItemFor(path)).toBe("tasks");
    }
  });

  it("lights each Global Module on its own route", () => {
    // D-19: Matrix is a Global Feature, not a Scope's Board view. The route
    // keeps its old name on purpose — the rename is of the feature.
    expect(railItemFor(PAGE_ROUTES.board)).toBe("matrix");
    expect(railItemFor(PAGE_ROUTES.calendar)).toBe("calendar");
    expect(railItemFor(PAGE_ROUTES.focus)).toBe("focus");
    expect(railItemFor(PAGE_ROUTES.settings)).toBe("settings");
  });

  // §1.24 INV-05: a Project Calendar is inside Tasks and must not light the
  // Global Calendar. The Scope's `?view=calendar` is exactly that case.
  it("does not light Calendar for a Scope's calendar view", () => {
    expect(isTasksLocation("/list/list-1?view=calendar")).toBe(true);
    expect(railItemFor("/list/list-1")).toBe("tasks");
  });

  it("remembers Tasks addresses and nothing else", () => {
    expect(isTasksLocation("/list/list-1?view=board&task=t1")).toBe(true);
    // Matrix is its own module now, so returning to Tasks must not land there.
    expect(isTasksLocation(PAGE_ROUTES.board)).toBe(false);
    expect(isTasksLocation(PAGE_ROUTES.calendar)).toBe(false);
    expect(isTasksLocation(PAGE_ROUTES.focus)).toBe(false);
    expect(isTasksLocation(PAGE_ROUTES.settings)).toBe(false);
  });

  it("sends the fixed items to their own page", () => {
    expect(railItemFor(RAIL_DESTINATIONS.matrix)).toBe("matrix");
    expect(railItemFor(RAIL_DESTINATIONS.calendar)).toBe("calendar");
    expect(railItemFor(RAIL_DESTINATIONS.focus)).toBe("focus");
    expect(railItemFor(RAIL_DESTINATIONS.settings)).toBe("settings");
  });

  it("falls back into the Tasks Module, not the legacy Today page", () => {
    expect(TASKS_HOME).toBe("/today");
    expect(railItemFor(TASKS_HOME)).toBe("tasks");
  });

  // `isTasksDoorway` went with the Projects and Goals pages: they were the
  // only Tasks addresses the Tasks item had to be able to LEAVE rather than
  // return to, and every Tasks address is a Scope now.
});
