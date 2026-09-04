import { useT } from "../../i18n";
import type { ReactNode } from "react";

type CalendarMode = "month" | "week" | "day" | "year";

interface CalendarToolbarProps {
  mode: CalendarMode;
  /** The period on screen — "September 2026", "Aug 30 – Sep 5, 2026". */
  rangeLabel: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onModeChange: (mode: CalendarMode) => void;
  /** The `⋯` panel: colour axis and what the grid draws. */
  viewOptions?: ReactNode;
}

const MODES: Array<{ id: CalendarMode; labelKey: string }> = [
  { id: "day", labelKey: "calendar.day" },
  { id: "week", labelKey: "calendar.week" },
  { id: "month", labelKey: "calendar.month" },
  { id: "year", labelKey: "calendar.yearMode" },
];

/**
 * One row: where you are on the left, how you look at it on the right
 * (CALENDAR_LAYOUT_V4_DESIGN.md §3).
 *
 * The range used to have a line of its own below this
 * (`CALENDAR_GEOMETRY_DESIGN.md` R2). R2's complaint was that the period was a
 * 15px heading — smaller than the date cells under it — and its fix was to
 * move it out and give it 26px. Only half of that was necessary: the size was
 * the problem, the line was the remedy. It keeps the size and comes back here,
 * which returns about 44px to the grid — and on a week grid vertical space is
 * hours.
 *
 * `☰` and `+` are gone from this row. Create is a named button at the top of
 * the sidebar now (§4), and the sidebar toggle went with it, because the left
 * of this row belongs to the navigation and the period.
 */
export function CalendarToolbar({
  mode,
  rangeLabel,
  onToday,
  onPrev,
  onNext,
  onModeChange,
  viewOptions,
}: CalendarToolbarProps) {
  const { t } = useT();
  return (
    // Doubles as the window caption on the desktop build (§3.3).
    <div className="gcal-toolbar" data-tauri-drag-region>
      <div className="gcal-toolbar-left">
        <div className="gcal-nav">
          <button type="button" aria-label={t("calendar.previous")} onClick={onPrev}>
            ‹
          </button>
          <button type="button" className="gcal-today-btn" onClick={onToday}>
            {t("calendar.today")}
          </button>
          <button type="button" aria-label={t("calendar.next")} onClick={onNext}>
            ›
          </button>
        </div>
        {/* Still the largest glyph on the screen, which is R2's actual rule.
            No caret beside it: the reference draws one, and we have nothing to
            hang off it that the mini month does not already do (§3.1, H3). */}
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
        {/* The reference has a search field between these two. It is not here
            because a field that cannot be typed into is worse than no field,
            and filtering the grid by a query is a feature rather than a layout
            (§5, H5). The gap it would take is this one. */}
        {viewOptions}
      </div>
    </div>
  );
}
