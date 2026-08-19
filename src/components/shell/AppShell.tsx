// The one frame both shells now live in (Nav Shell spec §3.4, audit R.5.1).
//
// Before this, the app had two top-level layouts that shared nothing: the
// Tasks Module's `.tm-shell` grid and the legacy `.app-shell` grid, chosen by
// a route test in `App.tsx`. Whatever was added to one had to be added to the
// other, and the Rail would have been the third thing to get built twice.
//
// So the Rail moves out and up. It is drawn once, here, and whichever shell
// answers the current route renders beside it — not inside it. §3.4 is
// explicit that the three regions are siblings: nesting the Context Sidebar
// inside the Rail, or the Rail inside Main, is what makes a 56px column start
// inheriting a page's scroll, zoom and stacking context.
//
// Unifying the two INNER shells into one Context Sidebar frame is P0-3. This
// file only has to stop them disagreeing about what is outside them.
import type { ReactNode } from "react";

interface AppShellProps {
  /** The Global Rail. Always the first region, always 56px (§2.3.3). */
  rail: ReactNode;
  /** The shell that answered the route: the Tasks Module or the legacy page. */
  children: ReactNode;
}

export function AppShell({ rail, children }: AppShellProps) {
  return (
    <div className="app-frame">
      {rail}
      <div className="app-frame-body">{children}</div>
    </div>
  );
}
