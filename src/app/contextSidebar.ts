// The Context Sidebar's frame: how wide, whether shown, and in which mode
// (Nav Shell spec §3, audit D-05, D-07, D-14).
//
// Everything here is pure so the rules can be tested without a DOM. The React
// state that uses them is `hooks/useContextSidebar.ts`.
//
// The sidebar could also be COLLAPSED, and the rule then was that width and
// visibility stayed independent — storing "collapsed" as width 0 would have
// lost the number the user picked. The collapse control is gone (AppShell), so
// only the width is left, and the rule has nothing left to separate.
import { pageForPath } from "./pageRoute";

/** §3.6, verbatim. */
export const CONTEXT_SIDEBAR_DEFAULT_WIDTH = 248;
export const CONTEXT_SIDEBAR_MIN_WIDTH = 216;
export const CONTEXT_SIDEBAR_MAX_WIDTH = 360;

/**
 * The Context Sidebar's element id (§3.52, P0-11).
 *
 * Collapse and expand are ONE control that happens to be drawn in two places:
 * the collapse button lives inside the sidebar, and the expand button has to
 * live outside it because a collapsed sidebar takes its own button away with
 * it (§3.24). A screen reader can only be told they are the same control by
 * both naming the same region — hence a constant rather than `useId`, which
 * would hand the two components different strings.
 *
 * Whichever sidebar the current mode renders carries this id. They never
 * co-exist, so it stays unique.
 */
export const CONTEXT_SIDEBAR_ID = "context-sidebar";

/** §3.20's arrow-key step, and its Shift multiplier. */
export const CONTEXT_SIDEBAR_STEP = 16;
export const CONTEXT_SIDEBAR_BIG_STEP = 32;

export const WIDTH_STORAGE_KEY = "focusflow-sidebar-width";

/**
 * D-14 added a third, `space`, for the Space/Project tree that stood in this
 * slot on SpaceHub. SPACE_REMOVAL_IA stage 6 removed the tree, and the member
 * went with it: a mode nothing returns is a branch every reader has to check
 * and no screen can reach.
 */
export type ContextSidebarMode = "tasks" | "none";

export interface ContextSidebarRuntime {
  mode: ContextSidebarMode;
  width: number;
}

/** §3.7. Dragging past the minimum stops there; it is not a way to hide it. */
export function clampContextSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(CONTEXT_SIDEBAR_MAX_WIDTH, Math.max(CONTEXT_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/**
 * Which sidebar the current address wants (§3.3).
 *
 * Back to the two the spec asked for. D-14 made this a three-way choice so
 * SpaceHub could put the Space/Project tree in the same slot; stage 6 removed
 * the tree, and Projects and Goals are pages behind the Tasks sidebar's own
 * doors — so they show the sidebar they were opened from. The question left
 * is only whether a page has a sidebar at all.
 */
export function contextSidebarModeFor(path: string): ContextSidebarMode {
  switch (pageForPath(path)) {
    // §2.16: a Global Module owns its whole width. Matrix joins them under
    // D-19 — it crosses every Space, so no one Scope's sidebar describes it,
    // and it carries its own scope selector in the page instead.
    case "board":
    case "calendar":
    case "focus":
    case "settings":
      return "none";
    default:
      return "tasks";
  }
}

/** §3.30. The number the layout actually uses. */
export function effectiveContextSidebarWidth({ mode, width }: ContextSidebarRuntime): number {
  if (mode === "none") return 0;
  return clampContextSidebarWidth(width);
}

/**
 * §3.58: a stored width that is missing, corrupt or out of range recovers to
 * the default rather than to whatever `parseInt` made of it. A sidebar stuck
 * at 4px cannot be dragged back, so this is a real trap and not just tidiness.
 */
export function readStoredWidth(raw: string | null): number {
  if (raw === null || raw.trim() === "") return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  // Out of range means a value this app never wrote — treat it as absent
  // rather than clamping it, which would silently accept 4000 as 360.
  if (parsed < CONTEXT_SIDEBAR_MIN_WIDTH || parsed > CONTEXT_SIDEBAR_MAX_WIDTH) {
    return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
  }
  return Math.round(parsed);
}

/** §3.20's key table, as a pure step. Returns the new width, already clamped. */
export function widthAfterKey(
  width: number,
  key: string,
  shift: boolean,
): number | null {
  const step = shift ? CONTEXT_SIDEBAR_BIG_STEP : CONTEXT_SIDEBAR_STEP;
  switch (key) {
    case "ArrowLeft":
      return clampContextSidebarWidth(width - step);
    case "ArrowRight":
      return clampContextSidebarWidth(width + step);
    case "Home":
      return CONTEXT_SIDEBAR_MIN_WIDTH;
    case "End":
      return CONTEXT_SIDEBAR_MAX_WIDTH;
    default:
      return null;
  }
}
