import type { ReactNode } from "react";
import { useT } from "../../i18n";

type CalendarMode = "month" | "week" | "day" | "year";

interface CalendarToolbarProps {
  mode: CalendarMode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onModeChange: (mode: CalendarMode) => void;
  /** Create lives in the toolbar, not as a block button atop the sidebar. */
  onCreate: () => void;
  /** The `⋯` panel (design §6). Passed in so the toolbar stays presentational. */
  viewOptions?: ReactNode;
}

const MODES: Array<{ id: CalendarMode; labelKey: string }> = [
  { id: "day", labelKey: "calendar.day" },
  { id: "week", labelKey: "calendar.week" },
  { id: "month", labelKey: "calendar.month" },
  { id: "year", labelKey: "calendar.yearMode" },
];

export function CalendarToolbar({
  mode,
  sidebarCollapsed,
  onToggleSidebar,
  onModeChange,
  onCreate,
  viewOptions,
}: CalendarToolbarProps) {
  const { t } = useT();
  return (
    // Doubles as the window caption on the desktop build (§3.3).
    <div className="gcal-toolbar" data-tauri-drag-region>
      <div className="gcal-toolbar-left">
        <button
          type="button"
          className="gcal-icon-btn"
          aria-label={sidebarCollapsed ? t("calendar.showSidebar") : t("calendar.hideSidebar")}
          onClick={onToggleSidebar}
        >
          ☰
        </button>
        {/* The page title said "Calendar" while the app sidebar already had
            Calendar selected. Dropped; the range label carries the heading. */}
        <button
          type="button"
          className="gcal-icon-btn gcal-create-icon-btn"
          aria-label={t("calendar.createAria")}
          title={t("calendar.createAria")}
          onClick={onCreate}
        >
          +
        </button>
      </div>
      <div className="gcal-toolbar-right">
        <div className="gcal-modes">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={mode === option.id ? "active" : ""}
              onClick={() => onModeChange(option.id)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>
      {/* R2 put an empty spacer here because centring the segmented control
          needs a matching weight on the other side rather than a nudge. The
          weight is a real control now (COLOR_SOURCE design §6.1), which is
          what R2's note was describing the absence of. */}
      <div className="gcal-toolbar-spacer">{viewOptions}</div>
    </div>
  );
}
