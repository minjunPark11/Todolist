// The one frame both shells now live in (Nav Shell spec §3.4, audit R.5.1).
//
// Before this, the app had two top-level layouts that shared nothing: the
// Tasks Module's `.tm-shell` grid and the legacy `.app-shell` grid, chosen by
// a route test in `App.tsx`. Whatever was added to one had to be added to the
// other, and the Rail would have been the third thing to get built twice.
//
// So the Rail moved out and up. It is drawn once, here, and whichever shell
// answers the current route renders beside it — not inside it. §3.4 is
// explicit that the three regions are siblings: nesting the Context Sidebar
// inside the Rail, or the Rail inside Main, is what makes a 56px column start
// inheriting a page's scroll, zoom and stacking context.
//
// P0-3 added the Context Sidebar's FRAME — its width, its collapse, its
// resize handle and its mode — without moving either shell's sidebar out of
// its own grid (D-17). The frame publishes `--context-sidebar-w` and both
// grids read it, so there is one number and one place that changes it.
import type { ReactNode } from "react";
import {
  CONTEXT_SIDEBAR_ID,
  CONTEXT_SIDEBAR_MAX_WIDTH,
  CONTEXT_SIDEBAR_MIN_WIDTH,
} from "../../app/contextSidebar";
import type { ContextSidebarState } from "../../hooks/useContextSidebar";
import { useT } from "../../i18n";

interface AppShellProps {
  /** The Global Rail. Always the first region, always 56px (§2.3.3). */
  rail: ReactNode;
  sidebar: ContextSidebarState;
  /** The shell that answered the route: the Tasks Module or the legacy page. */
  children: ReactNode;
}

export function AppShell({ rail, sidebar, children }: AppShellProps) {
  const { t } = useT();
  const collapsed = sidebar.visibility === "collapsed";
  const hasSidebar = sidebar.mode !== "none";

  return (
    <div
      className={[
        "app-frame",
        hasSidebar && collapsed ? "is-sidebar-collapsed" : "",
        sidebar.isResizing ? "is-sidebar-resizing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-sidebar-mode={sidebar.mode}
      style={{ "--context-sidebar-w": `${sidebar.effectiveWidth}px` } as React.CSSProperties}
    >
      {rail}
      <div className="app-frame-body">{children}</div>

      {/* §3.15/§3.20. Absolutely positioned at the sidebar's right edge rather
          than rendered inside it, because the sidebar still belongs to the
          inner shell's grid — the handle has to reach across that boundary. */}
      {hasSidebar && !collapsed ? (
        <div
          className="context-sidebar-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("shell.resizeSidebar")}
          aria-valuemin={CONTEXT_SIDEBAR_MIN_WIDTH}
          aria-valuemax={CONTEXT_SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebar.width}
          tabIndex={0}
          onPointerDown={(event) => {
            // Left button only: a right-click here is a context menu, not a drag.
            if (event.button !== 0) return;
            event.preventDefault();
            sidebar.beginResize(event.clientX);
          }}
          onDoubleClick={sidebar.resetWidth}
          onKeyDown={(event) => {
            if (sidebar.resizeByKey(event.key, event.shiftKey)) event.preventDefault();
          }}
        />
      ) : null}

      {/* §3.24: with the sidebar gone, its own collapse button went with it,
          so the way back has to live outside it. The spec puts this in the
          Main Header's left utility slot; the headers here belong to two
          different shells, so the App Shell draws it at the same spot instead
          — which keeps the ownership §3.24 actually cares about. */}
      {hasSidebar && collapsed ? (
        <button
          type="button"
          className="context-sidebar-expand"
          aria-label={t("sidebar.expand")}
          /* §3.52. The sidebar is still in the tree when collapsed — the frame
             hides it with `display: none` rather than unmounting it — so this
             names a region that exists, and `false` is the truth about it. */
          aria-expanded={false}
          aria-controls={CONTEXT_SIDEBAR_ID}
          onClick={sidebar.toggleCollapsed}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
