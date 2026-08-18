// Which shape the screen is in, and what that changes (TickTick plan §15).
//
// §15.9 is the invariant everything here serves: responsive rendering is NOT
// a cause of URL canonicalization. Narrow the window and
// `/list/l1?view=board&task=t1` stays exactly that — the Drawer becomes a
// full-screen surface, the Scope, the view and the open Task do not move.
// Nothing in this file is read by a query, a count or a command, which is what
// makes Gate 10's "same Golden Journey, same domain results" true by
// construction rather than by testing three widths and hoping.
//
// §15.4 also insists on a separation this module keeps: viewport width and
// input modality are different questions. Width decides the MODE; whether the
// user is pointing with a finger is `(pointer: coarse)` and belongs in CSS.
// A 1024px window with a mouse and a 1024px tablet are the same mode and want
// different hit targets.

/** §15.3, verbatim. */
export const RESPONSIVE_BREAKPOINTS = {
  mobile: 768,
  desktop: 1024,
  wideDesktop: 1280,
} as const;

export const RESPONSIVE_MODES = ["mobile", "tablet", "compactDesktop", "wideDesktop"] as const;
export type ResponsiveMode = (typeof RESPONSIVE_MODES)[number];

export function responsiveModeFor(width: number): ResponsiveMode {
  if (width < RESPONSIVE_BREAKPOINTS.mobile) return "mobile";
  if (width < RESPONSIVE_BREAKPOINTS.desktop) return "tablet";
  if (width < RESPONSIVE_BREAKPOINTS.wideDesktop) return "compactDesktop";
  return "wideDesktop";
}

/**
 * §15.17's registry. Presentation only — it decides where the Task Detail is
 * drawn and nothing about what is fetched, queried or commanded.
 */
export const TASK_DETAIL_PRESENTATION = {
  wideDesktop: "inline-drawer",
  compactDesktop: "overlay-drawer",
  tablet: "right-sheet",
  mobile: "full-screen",
} as const;

export type TaskDetailPresentation = (typeof TASK_DETAIL_PRESENTATION)[ResponsiveMode];

export function taskDetailPresentationFor(mode: ResponsiveMode): TaskDetailPresentation {
  return TASK_DETAIL_PRESENTATION[mode];
}

/**
 * §15.14: the Sidebar is a column on desktop and a sheet below it.
 *
 * Overlay is not "hidden" — the difference matters for focus and for Escape.
 * An overlay Sidebar is a layer the user opened and can dismiss; a persistent
 * one is part of the page and never traps anything.
 */
export function sidebarPresentationFor(mode: ResponsiveMode): "persistent" | "overlay" {
  return mode === "mobile" || mode === "tablet" ? "overlay" : "persistent";
}

/** Whether the Task Detail covers the screen (§15.21) — the Rail goes with it (§15.13). */
export function detailIsFullScreen(mode: ResponsiveMode): boolean {
  return taskDetailPresentationFor(mode) === "full-screen";
}
