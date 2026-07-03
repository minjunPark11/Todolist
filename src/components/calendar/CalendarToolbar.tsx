import { useT } from "../../i18n";

type CalendarMode = "month" | "week" | "day" | "year";

interface CalendarToolbarProps {
  mode: CalendarMode;
  rangeLabel: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onModeChange: (mode: CalendarMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  aiDisabled: boolean;
  onAiClick: () => void;
}

const MODES: Array<{ id: CalendarMode; labelKey: string }> = [
  { id: "day", labelKey: "calendar.day" },
  { id: "week", labelKey: "calendar.week" },
  { id: "month", labelKey: "calendar.month" },
  { id: "year", labelKey: "calendar.yearMode" },
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
  aiDisabled,
  onAiClick,
}: CalendarToolbarProps) {
  const { t } = useT();
  return (
    <div className="gcal-toolbar">
      <div className="gcal-toolbar-left">
        <button
          type="button"
          className="gcal-icon-btn"
          aria-label={sidebarCollapsed ? t("calendar.showSidebar") : t("calendar.hideSidebar")}
          onClick={onToggleSidebar}
        >
          ☰
        </button>
        <span className="gcal-title">{t("calendar.title")}</span>
        <button type="button" className="gcal-today-btn" onClick={onToday}>
          {t("calendar.today")}
        </button>
        <div className="gcal-nav">
          <button type="button" aria-label={t("calendar.previous")} onClick={onPrev}>
            ‹
          </button>
          <button type="button" aria-label={t("calendar.next")} onClick={onNext}>
            ›
          </button>
        </div>
        <h2 className="gcal-range-label">{rangeLabel}</h2>
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
        <button type="button" className="gcal-icon-btn" aria-label={t("calendar.search")} disabled>
          🔍
        </button>
        <button type="button" className="gcal-icon-btn" aria-label={t("calendar.settingsAria")} disabled>
          ⚙
        </button>
        <button
          type="button"
          className="gcal-ai-btn"
          onClick={onAiClick}
          disabled={aiDisabled}
          title={t("calendar.suggestSchedule")}
        >
          AI
        </button>
      </div>
    </div>
  );
}
