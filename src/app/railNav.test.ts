import { describe, expect, it } from "vitest";
import { RAIL_DESTINATIONS, TASKS_HOME, isTasksLocation, railItemFor } from "./railNav";
import { PAGE_ROUTES } from "./pageRoute";

describe("railNav", () => {
  // §2.47's Route-to-Rail matrix, rewritten for this repo's routes (audit D-03).
  it("lights Tasks for everything that is not one of the three Global Modules", () => {
    for (const path of [
      PAGE_ROUTES.today,
      PAGE_ROUTES.projects,
      PAGE_ROUTES.board,
      PAGE_ROUTES.archive,
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
    expect(isTasksLocation(PAGE_ROUTES.board)).toBe(true);
    expect(isTasksLocation(PAGE_ROUTES.calendar)).toBe(false);
    expect(isTasksLocation(PAGE_ROUTES.focus)).toBe(false);
    expect(isTasksLocation(PAGE_ROUTES.settings)).toBe(false);
  });

  it("sends the fixed items to their own page", () => {
    expect(railItemFor(RAIL_DESTINATIONS.calendar)).toBe("calendar");
    expect(railItemFor(RAIL_DESTINATIONS.focus)).toBe("focus");
    expect(railItemFor(RAIL_DESTINATIONS.settings)).toBe("settings");
  });

  it("falls back into the Tasks Module, not the legacy Today page", () => {
    expect(TASKS_HOME).toBe("/today");
    expect(railItemFor(TASKS_HOME)).toBe("tasks");
  });
});
