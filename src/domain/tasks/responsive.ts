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

/**
 * The fifth presentation, and the only one the map above cannot produce
 * (BOARD_TASK_POPUP_DESIGN.md §4; renamed and resized by
 * CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §3).
 *
 * It was `center-modal` — 720x640 in the middle of a dimmed screen. The name
 * said where it went, and where it goes has changed: beside the row that
 * opened it, at 440x360, with nothing dimmed behind it. A popup that covers
 * the board it was opened from answers "show me this task" by taking the
 * board away.
 *
 * Every entry in that map answers one question — how much room is there — and
 * a centred popup is not an answer to it. It is an answer to a different one:
 * can the surface underneath give up width at all. A list's rows can (they
 * reflow, and the reserved empty column keeps them from jumping); a Board's
 * columns cannot — they are `flex: none` at a fixed width, so what a Detail
 * column takes is not each card's width but the NUMBER of columns still on
 * screen. Measured at 1280: the shell became `248px 502px 480px` and the Board
 * kept 438 of the 982 it could have had, with its second column clipped.
 */
export type TaskDetailPresentation =
  | (typeof TASK_DETAIL_PRESENTATION)[ResponsiveMode]
  | "anchored-popover";

/**
 * Where the Detail was opened FROM — not how it should be drawn (§4.1).
 *
 * Deliberately not the view key. `state.view` grows (`list`, `board`,
 * `timeline`, whatever comes next) and this function must not grow with it:
 * the one fact it needs is whether the surface can yield width, and that is
 * these words. A surface that wants the popup joins this union rather than
 * being folded into `"board"`.
 *
 * `matrix` is the second to join. Its four quadrants are one grid that has to
 * stay four boxes: what a Detail column takes there is not each card's width
 * but the grid's, and at 1280 the two right-hand quadrants were what paid for
 * it. The same fact as the Board's columns, arrived at from a different shape,
 * which is why it is a word of its own rather than a rename.
 *
 * `calendar` is the third, and the plainest: a week grid is seven columns of
 * an hour scale, and a column taken off the right takes a DAY with it.
 */
export type TaskDetailSurface = "list" | "board" | "matrix" | "calendar";

export function taskDetailPresentationFor(
  mode: ResponsiveMode,
  surface: TaskDetailSurface = "list",
): TaskDetailPresentation {
  /* Mobile is the exception, and not an oversight. At 375px a centred popup is
     a full-screen surface with wasted margins, and §15.21's answer — the
     Detail owns the screen — is already the right one there. `detail-full`
     hangs off it too, so leaving mobile alone is what keeps that class's
     value unchanged by this whole change. */
  if (surface !== "list" && mode !== "mobile") return "anchored-popover";
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
