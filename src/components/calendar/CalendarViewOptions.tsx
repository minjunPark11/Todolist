// The `⋯` panel: what the grid draws, and what it reads the colour from
// (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §6).
//
// These three answers were in two other places. "Completed work" was a row in
// the left column and "Focus records" was a category in it — which meant the
// column asked two different kinds of question with the same kind of
// checkbox: "whose calendar is this" for a List, and "draw this layer at all"
// for those two. TickTick puts the second kind behind `⋯`, and the reason
// holds here: a filter over your calendars and a switch over the whole grid
// are not the same control.
//
// Colour is here rather than in Settings because it is a way of LOOKING at
// this screen, and because the effect is behind the panel — you change it and
// see the grid change.
import type { CalendarViewOptions } from "../../types";
import { Popover, PopoverContent, PopoverTrigger } from "../floating";
import { useT } from "../../i18n";

interface CalendarViewOptionsProps {
  options: CalendarViewOptions;
  onChange: (patch: Partial<CalendarViewOptions>) => void;
}

export function CalendarViewOptionsMenu({ options, onChange }: CalendarViewOptionsProps) {
  const { t } = useT();

  return (
    <Popover placement="bottom-end">
      <PopoverTrigger
        className="gcal-icon-btn gcal-viewopts-btn"
        aria-label={t("calendar.viewOptions")}
        title={t("calendar.viewOptions")}
      >
        ⋯
      </PopoverTrigger>
      <PopoverContent label={t("calendar.viewOptions")} className="gcal-viewopts">
        <div className="gcal-viewopts-group" role="group" aria-labelledby="gcal-colorby-head">
          <h4 id="gcal-colorby-head">{t("calendar.colorBy")}</h4>
          {/* A radio group, not a select: there are two of them and both fit,
              so the reader can see the choice instead of opening it. */}
          {(["list", "priority"] as const).map((axis) => (
            <label key={axis} className="gcal-viewopts-radio">
              <input
                type="radio"
                name="gcal-colorby"
                checked={options.colorBy === axis}
                onChange={() => onChange({ colorBy: axis })}
              />
              <span>{t(`calendar.colorBy.${axis}`)}</span>
            </label>
          ))}
        </div>

        <div className="gcal-viewopts-group" role="group" aria-labelledby="gcal-show-head">
          <h4 id="gcal-show-head">{t("calendar.showHeading")}</h4>
          <label className="gcal-viewopts-check">
            <input
              type="checkbox"
              checked={options.showCompleted}
              onChange={() => onChange({ showCompleted: !options.showCompleted })}
            />
            <span>{t("calendar.layerCompleted")}</span>
          </label>
          <label className="gcal-viewopts-check">
            <input
              type="checkbox"
              checked={options.showFocusRecords}
              onChange={() => onChange({ showFocusRecords: !options.showFocusRecords })}
            />
            <span>{t("calendar.layerFocusRecords")}</span>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
