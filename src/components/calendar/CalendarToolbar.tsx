type CalendarMode = "month" | "week" | "day";

interface CalendarToolbarProps {
  mode: CalendarMode;
  rangeLabel: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onModeChange: (mode: CalendarMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const MODES: Array<{ id: CalendarMode; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function CalendarToolbar({
  mode,
  rangeLabel,
  sidebarCollapsed,
  onToggleSidebar,
  onModeChange,
  onToday,
  onPrev,
  onNext,
}: CalendarToolbarProps) {
  return (
    <div className="gcal-toolbar">
      <div className="gcal-toolbar-left">
        <button
          type="button"
          className="gcal-icon-btn"
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={onToggleSidebar}
        >
          ☰
        </button>
        <span className="gcal-title">Calendar</span>
        <button type="button" className="gcal-today-btn" onClick={onToday}>
          Today
        </button>
        <div className="gcal-nav">
          <button type="button" aria-label="Previous" onClick={onPrev}>
            ‹
          </button>
          <button type="button" aria-label="Next" onClick={onNext}>
            ›
          </button>
        </div>
        <h2 className="gcal-range-label">{rangeLabel}</h2>
      </div>
      <div className="gcal-toolbar-right">
        <button type="button" className="gcal-icon-btn" aria-label="Search" disabled>
          🔍
        </button>
        <button type="button" className="gcal-icon-btn" aria-label="Help" disabled>
          ?
        </button>
        <button type="button" className="gcal-icon-btn" aria-label="Settings" disabled>
          ⚙
        </button>
        <div className="gcal-modes">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={mode === option.id ? "active" : ""}
              onClick={() => onModeChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
