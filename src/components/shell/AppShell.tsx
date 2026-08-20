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

      {/* Both of the frame's own controls, in one named group.
          They were bare children of `.app-frame` before, which put them
          outside every landmark — axe's `region` rule on the running app,
          and the one thing the shell's own axe test did not catch because it
          only failed on serious and critical. These two controls belong to
          the frame rather than to the Rail, the sidebar or the page, so they
          get a named landmark of their own. Positioning is unchanged — both
          are absolutely positioned against `.app-frame`, and this wrapper is
          `display: contents`.

          `region` and not `toolbar`: a toolbar is a widget, and the rule being
          answered is "is every part of the page inside a LANDMARK". Measured
          rather than assumed — `toolbar` was tried first and axe still flagged
          the wrapper itself. */}
      <div className="app-frame-chrome" role="region" aria-label={t("shell.chrome")}>
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

      {/* §3.52 / §3.24. Both halves of the one-control-in-two-places invariant
          live here now that SpaceSidebar (which used to own the collapse button)
          is gone. AppShell already owns sidebar.toggleCollapsed, so both
          buttons belong here rather than inside each sidebar component. */}
      {hasSidebar && !collapsed ? (
        <button
          type="button"
          className="context-sidebar-collapse"
          aria-label={t("sidebar.collapse")}
          aria-expanded={true}
          aria-controls={CONTEXT_SIDEBAR_ID}
          onClick={sidebar.toggleCollapsed}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
      ) : (
        hasSidebar ? (
          <button
            type="button"
            className="context-sidebar-expand"
            aria-label={t("sidebar.expand")}
            aria-expanded={false}
            aria-controls={CONTEXT_SIDEBAR_ID}
            onClick={sidebar.toggleCollapsed}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
        ) : null
      )}
      </div>
    </div>
  );
}
