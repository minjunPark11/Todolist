import { describe, expect, it } from "vitest";
import {
  PAGE_ROUTES,
  bootRedirectFor,
  namesAPage,
  pageForPath,
  pathForDefaultView,
  pathForPage,
} from "./pageRoute";
import { parseTaskScope } from "./taskScopeUrl";
import type { PageId } from "../types";

const PAGES: PageId[] = ["today", "projects", "calendar", "board", "archive", "focus", "settings"];

describe("pageRoute", () => {
  it("round-trips every page through its address", () => {
    for (const page of PAGES) {
      expect(pageForPath(pathForPage(page))).toBe(page);
    }
  });

  it("gives every page a distinct address", () => {
    const paths = PAGES.map(pathForPage);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // The reason this file may not use `/today` for the legacy Today page: the
  // Tasks Module gets the first look at the path, so a page whose address is
  // also a Scope segment would never render.
  it("never collides with a Tasks Scope", () => {
    for (const page of PAGES) {
      expect(parseTaskScope(pathForPage(page))).toBeNull();
    }
  });

  it("reads a tree selection as the Spaces page", () => {
    expect(pageForPath("/s/space-1")).toBe("projects");
    expect(pageForPath("/s/space-1/p/project-1")).toBe("projects");
    expect(pageForPath("/s/space-1/p/project-1/l/list-1")).toBe("projects");
  });

  it("falls back to Today for an address it does not know", () => {
    expect(pageForPath("/")).toBe("today");
    expect(pageForPath("/index.html")).toBe("today");
    expect(pageForPath("/whatever-this-was")).toBe("today");
  });

  it("ignores a trailing slash", () => {
    expect(pageForPath("/calendar/")).toBe("calendar");
    expect(namesAPage("/settings/")).toBe(true);
  });

  it("separates naming a page from falling back to one", () => {
    expect(namesAPage(PAGE_ROUTES.today)).toBe(true);
    expect(namesAPage("/")).toBe(false);
    expect(namesAPage("/index.html")).toBe(false);
    expect(namesAPage("/s/space-1")).toBe(true);
  });

  describe("default start page", () => {
    it("maps the settings values that still have a page", () => {
      expect(pathForDefaultView("/calendar")).toBe(PAGE_ROUTES.calendar);
      expect(pathForDefaultView("/board")).toBe(PAGE_ROUTES.board);
      expect(pathForDefaultView("/focus")).toBe(PAGE_ROUTES.focus);
      expect(pathForDefaultView("/today")).toBe(PAGE_ROUTES.today);
    });

    // Both are stored by installs that predate the current page set.
    it("lands the retired values on Today", () => {
      expect(pathForDefaultView("/planning")).toBe(PAGE_ROUTES.board);
      expect(pathForDefaultView("/projects")).toBe(PAGE_ROUTES.today);
      expect(pathForDefaultView("/inbox")).toBe(PAGE_ROUTES.today);
    });
  });

  describe("boot redirect", () => {
    it("applies the setting when the address names nothing", () => {
      expect(bootRedirectFor("/", "/calendar")).toBe("/calendar");
      expect(bootRedirectFor("/index.html", "/focus")).toBe("/focus");
    });

    it("does not fire when the setting already matches", () => {
      expect(bootRedirectFor("/calendar", "/calendar")).toBe("");
    });

    it("lets a deep link outrank the setting", () => {
      expect(bootRedirectFor("/s/space-1/p/project-1", "/calendar")).toBe("");
      expect(bootRedirectFor("/board", "/calendar")).toBe("");
      expect(bootRedirectFor(PAGE_ROUTES.today, "/calendar")).toBe("");
    });

    it("leaves the auth screen alone", () => {
      expect(bootRedirectFor("/login", "/calendar")).toBe("");
    });

    // Caught in the browser, not here, the first time: every one of these is a
    // Tasks Module address, and a redirect that only knew about PAGE_ROUTES
    // answered a deep link into the Module by bouncing to the start page.
    it("leaves a Tasks Module deep link alone", () => {
      for (const path of [
        "/today",
        "/upcoming",
        "/inbox",
        "/completed",
        "/trash",
        "/list/list-1",
        "/folder/folder-1",
        "/tag/tag-1",
        "/filter/filter-1",
        "/search",
      ]) {
        expect(bootRedirectFor(path, "/calendar")).toBe("");
        expect(namesAPage(path)).toBe(true);
      }
    });
  });
});
