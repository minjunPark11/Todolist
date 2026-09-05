import { describe, expect, it } from "vitest";
import {
  PAGE_ROUTES,
  TASKS_HOME,
  bootRedirectFor,
  namesAPage,
  pageForPath,
  pageUrlFor,
  pathForDefaultView,
  TASKS_INBOX,
  pathForPage,
  returnToFromSearch,
  taskIdForPageUrl,
} from "./pageRoute";
import { parseTaskScope } from "./taskScopeUrl";
import type { PageId } from "../types";

// Four, not five. The Today PAGE and its `/app` are gone: the app had two
// Today screens and P0-2 is closed — the Tasks Module's Scope is the one that
// survived, so every address that is not one of these four belongs to the
// Module.
const PAGES: PageId[] = ["calendar", "board", "focus", "settings"];

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

  // The Space tree's own addresses went with the Projects feature. They are
  // not in RETIRED_ROUTES — those are exact paths and these carry ids — so
  // they are simply not pages, and the boot redirect moves them.
  it("names no page for an old tree selection", () => {
    expect(pageForPath("/s/space-1")).toBeNull();
    expect(pageForPath("/s/space-1/p/project-1/l/list-1")).toBeNull();
  });

  it("names no page for an address it does not know", () => {
    // It used to answer `today` here, which drew the Today page at whatever
    // address it was handed. There is no page to fall back to now.
    expect(pageForPath("/")).toBeNull();
    expect(pageForPath("/index.html")).toBeNull();
    expect(pageForPath("/whatever-this-was")).toBeNull();
  });

  it("ignores a trailing slash", () => {
    expect(pageForPath("/calendar/")).toBe("calendar");
    expect(namesAPage("/settings/")).toBe(true);
  });

  it("separates naming a page from falling back to one", () => {
    expect(namesAPage(PAGE_ROUTES.calendar)).toBe(true);
    expect(namesAPage("/")).toBe(false);
    expect(namesAPage("/index.html")).toBe(false);
    expect(namesAPage("/s/space-1")).toBe(false);
  });

  describe("default start page", () => {
    it("maps the settings values that still have a page", () => {
      expect(pathForDefaultView("/calendar")).toBe(PAGE_ROUTES.calendar);
      expect(pathForDefaultView("/board")).toBe(PAGE_ROUTES.board);
      expect(pathForDefaultView("/focus")).toBe(PAGE_ROUTES.focus);
      expect(pathForDefaultView("/today")).toBe(TASKS_HOME);
    });

    // The bug this replaced: `/inbox` fell through to Today, so the picker had
    // two options that went to the same place and the one that said Inbox was
    // the one that did not go there.
    it("opens the Inbox on its own address, not on Today", () => {
      expect(pathForDefaultView("/inbox")).toBe(TASKS_INBOX);
      expect(pathForDefaultView("/inbox")).not.toBe(pathForDefaultView("/today"));
      expect(namesAPage(TASKS_INBOX)).toBe(true);
    });

    // Both are stored by installs that predate the current page set.
    it("lands the retired values on the Tasks Module", () => {
      expect(pathForDefaultView("/planning")).toBe(PAGE_ROUTES.board);
      expect(pathForDefaultView("/projects")).toBe(TASKS_HOME);
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
      expect(bootRedirectFor("/board", "/calendar")).toBe("");
      expect(bootRedirectFor("/today", "/calendar")).toBe("");
    });

    it("leaves the auth screen alone", () => {
      expect(bootRedirectFor("/login", "/calendar")).toBe("");
    });

    // A retired address is a REDIRECT now, not a page drawn at someone else's
    // URL. It outranks the start page — the reader asked for something
    // specific, and what replaced it is more specific than their default.
    it("moves a retired address to what replaced it", () => {
      expect(bootRedirectFor("/archive", "/calendar")).toBe(TASKS_HOME);
      expect(namesAPage("/archive")).toBe(false);
      expect(pageForPath("/archive")).toBeNull();
    });

    // `/app` is the newest of them: the Today PAGE's own address. Links to it
    // are in bookmarks, in the consent screen, and in a desktop client that
    // remembers where it was.
    it("moves every retired address to the Tasks Module", () => {
      for (const retired of ["/app", "/projects", "/goals", "/spaces", "/archive"]) {
        expect(bootRedirectFor(retired, "/calendar")).toBe(TASKS_HOME);
        expect(pageForPath(retired)).toBeNull();
      }
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

  // TASK_DETAIL_PANEL_MERGE_DESIGN.md §8. The Detail used to live in
  // `usePlannerData`, where a reload lost it and Back walked past it.
  describe("the open Task in a page's address", () => {
    const HOLDERS: PageId[] = ["board", "focus", "calendar"];

    it("round-trips on every page that draws a Detail", () => {
      for (const page of HOLDERS) {
        expect(taskIdForPageUrl(pageUrlFor(page, "t1"))).toBe("t1");
      }
    });

    it("keeps the page it was written on", () => {
      for (const page of HOLDERS) {
        expect(pageForPath(pageUrlFor(page, "t1").split("?")[0])).toBe(page);
      }
    });

    // Settings renders no pane, so a `?task=` on it would be a promise the
    // page cannot keep. It is neither written nor read. The Calendar left this
    // list when its blocks began opening the app's own Detail
    // (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §5).
    it("refuses the pages that draw no Detail", () => {
      expect(pageUrlFor("settings", "t1")).toBe(PAGE_ROUTES.settings);
      expect(taskIdForPageUrl("/settings?task=t1")).toBe("");
    });

    // The Module carries its own `?task=` and reads it with `parseTaskUrl`.
    // Answering here as well would give one address two owners, which is the
    // shape of the bug this whole change exists to remove.
    it("does not answer for a Tasks Module address", () => {
      expect(taskIdForPageUrl("/list/l1?view=board&task=t1")).toBe("");
      expect(taskIdForPageUrl("/today?task=t1")).toBe("");
    });

    it("writes nothing when nothing is open", () => {
      for (const page of HOLDERS) {
        expect(pageUrlFor(page)).toBe(PAGE_ROUTES[page]);
        expect(taskIdForPageUrl(PAGE_ROUTES[page])).toBe("");
      }
    });

    // Ids are generated, but a link is a value from the address bar and this
    // one is written back into an address.
    it("survives an id that needs escaping", () => {
      const id = "a b&c=d?e#f";
      expect(taskIdForPageUrl(pageUrlFor("board", id))).toBe(id);
    });
  });
});

describe("returnToFromSearch", () => {
  it("carries a path back", () => {
    expect(returnToFromSearch("?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc")).toBe(
      "/oauth/consent?authorization_id=abc",
    );
  });

  it("answers nothing when nobody asked", () => {
    expect(returnToFromSearch("")).toBeNull();
    expect(returnToFromSearch("?other=1")).toBeNull();
  });

  it("refuses to send a freshly signed-in user off-site", () => {
    // An open redirect on a login page is how a link that looks like this
    // app's own sign-in ends somewhere else, with the user believing they got
    // there through us.
    expect(returnToFromSearch("?returnTo=https%3A%2F%2Fevil.example%2Fx")).toBeNull();
    expect(returnToFromSearch("?returnTo=%2F%2Fevil.example%2Fx")).toBeNull();
    expect(returnToFromSearch("?returnTo=javascript%3Aalert(1)")).toBeNull();
  });
});
