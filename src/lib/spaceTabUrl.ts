// Which view a scope screen has open, carried in the address.
//
// The Project screen had this and the Space screen did not: its tab was plain
// component state, so a reload or a shared link always landed on Overview
// while the same link into a Project opened the view it named. One behaviour
// now, in one place, rather than the same effect written twice and drifting.
//
// The scope decides what is legal, not just what is spelled correctly:
// `?view=board` names a real view, but a Space offers no Board (§0.3.3), so it
// falls back rather than selecting a tab the bar does not draw.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SpaceTab } from "./spaceHubTypes";
import { isSpaceNavId, navItemsForScope, type NavScopeKind } from "../domain/view/spaceNav";

const DEFAULT_TAB: SpaceTab = "overview";

function readTab(allowed: ReadonlySet<SpaceTab>): SpaceTab {
  const params = new URLSearchParams(window.location.search);
  // `?view=` is the parameter (U3). `?tab=` is still read so links made before
  // that change land where they meant to; only the new name is ever written.
  const legacy = params.get("tab");
  const value = params.get("view") ?? (legacy === "tasks" ? "board" : legacy);
  if (!isSpaceNavId(value) || !allowed.has(value)) return DEFAULT_TAB;
  return value;
}

/**
 * The open tab, kept in `?view=`.
 *
 * `scope` is a string rather than a list of ids so the effect below has a
 * stable dependency without every caller having to memoise one.
 */
export function useTabInUrl(scope: NavScopeKind): [SpaceTab, (next: SpaceTab) => void] {
  const allowed = useMemo(
    () => new Set(navItemsForScope(scope).map((item) => item.id)),
    [scope],
  );
  const [tab, setTabState] = useState<SpaceTab>(() => readTab(allowed));

  useEffect(() => {
    function handlePopState() {
      setTabState(readTab(allowed));
    }
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Leave the URL clean when navigating away from the scope screen.
      const url = new URL(window.location.href);
      if (url.searchParams.has("tab")) {
        url.searchParams.delete("tab");
        window.history.replaceState(null, "", url.toString());
      }
    };
  }, [allowed]);

  const setTab = useCallback(
    (next: SpaceTab) => {
      setTabState((current) => {
        if (next === current) return current;
        const url = new URL(window.location.href);
        url.searchParams.set("view", next);
        // The old key would otherwise sit there naming a different view than
        // the one on screen, and win on the next reload.
        url.searchParams.delete("tab");
        window.history.pushState(null, "", url.toString());
        return next;
      });
    },
    [],
  );

  return [tab, setTab];
}
