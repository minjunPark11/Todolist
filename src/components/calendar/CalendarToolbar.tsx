import { useT } from "../../i18n";

type CalendarMode = "month" | "week" | "day" | "year";

interface CalendarToolbarProps {
  mode: CalendarMode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onModeChange: (mode: CalendarMode) => void;
  /** Create lives in the toolbar, not as a block button atop the sidebar. */
  onCreate: () => void;
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
      {/* R2: the segmented control is centred, and centring needs a matching
          weight on the other side rather than a nudge. */}
      <div className="gcal-toolbar-spacer" aria-hidden="true" />
    </div>
  );
}
