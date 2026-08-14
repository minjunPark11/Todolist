import { useEffect, useState, type CSSProperties } from "react";
import { CATEGORY_COLOR_PALETTE, type CalendarCategory, type CalendarCategoryGroup } from "../../lib/calendarCategories";
import { getDayNumber, getMonthGrid, getMonthLabel, todayValue } from "../../utils/date";
import { useT } from "../../i18n";

interface CalendarLeftSidebarProps {
  anchor: string;
  datesWithItems: Set<string>;
  onSelectDate: (date: string) => void;
  // Category spec §3.1: the sidebar only *uses* categories — checkbox =
  // show/hide, row click = pick the default category for new events.
  // Add / rename / delete live in Settings. Recoloring is the one exception:
  // the ⋯ button opens an inline palette and the color writes back to the
  // category's source entity (same paths as the settings modal).
  groups: CalendarCategoryGroup[];
  activeCategoryId: string;
  isCategoryVisible: (categoryId: string) => boolean;
  onToggleCategory: (category: CalendarCategory) => void;
  onSelectCategory: (category: CalendarCategory) => void;
  onRecolorCategory: (category: CalendarCategory, color: string) => void;
  collapsed: boolean;
  onExpand: () => void;
}

export function CalendarLeftSidebar({
  anchor,
  datesWithItems,
  onSelectDate,
  groups,
  activeCategoryId,
  isCategoryVisible,
  onToggleCategory,
  onSelectCategory,
  onRecolorCategory,
  collapsed,
  onExpand,
}: CalendarLeftSidebarProps) {
  const { t, lang } = useT();
  const today = todayValue();
  // Category id whose inline recolor palette is open ("" = none).
  const [paletteFor, setPaletteFor] = useState("");

  useEffect(() => {
    if (!paletteFor) return;
    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".gcal-cat-palette-wrap")) return;
      setPaletteFor("");
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setPaletteFor("");
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [paletteFor]);
  const anchorDate = new Date(`${anchor}T00:00:00`);
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const cells = getMonthGrid(year, month);

  // Collapsed: a slim icon rail (expand only) instead of hiding the sidebar
  // entirely, so the calendar keeps its left anchor and stays quick to reopen.
  // Create is not repeated here — it lives in the toolbar, which is visible in
  // both states.
  if (collapsed) {
    return (
      <aside className="gcal-sidebar is-rail">
        <button
          type="button"
          className="gcal-icon-btn"
          aria-label={t("calendar.expandSidebar")}
          title={t("calendar.expandSidebar")}
          onClick={onExpand}
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <aside className="gcal-sidebar">
      {groups.map((group) => (
        <div key={group.type} className="gcal-sidebar-section">
          <h3>{t(`calendar.group.${group.type}`)}</h3>
          {group.categories.length === 0 ? (
            <p className="gcal-sidebar-empty">{t(`calendar.groupEmpty.${group.type}`)}</p>
          ) : null}
          {group.categories.map((category) => {
            const active = category.id === activeCategoryId;
            const rowClasses = ["gcal-cat-row"];
            if (active) rowClasses.push("is-active");
            if (category.isReadOnly) rowClasses.push("is-readonly");
            return (
              <div
                key={category.id}
                className={rowClasses.join(" ")}
                role="button"
                tabIndex={0}
                style={active ? { background: `${category.color}1a` } : undefined}
                onClick={() => onSelectCategory(category)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectCategory(category);
                  }
                }}
              >
                {/* §16.3: the checkbox must never trigger the row's select.
                    The checkbox carries the category color itself (Apple
                    Calendar style), so no separate color dot. */}
                <input
                  type="checkbox"
                  checked={isCategoryVisible(category.id)}
                  style={{ "--cat-color": category.color } as CSSProperties}
                  aria-label={t("calendar.toggleCategoryAria", { name: category.name })}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onToggleCategory(category)}
                />
                <span className="gcal-cat-name">{category.name}</span>
                {category.isDefault ? <span className="gcal-cat-badge">{t("calendar.defaultBadge")}</span> : null}
                {category.isReadOnly ? <span className="gcal-cat-badge">{t("calendar.readOnlyBadge")}</span> : null}
                <span className="gcal-cat-palette-wrap">
                  <button
                    type="button"
                    className="gcal-cat-menu-btn"
                    aria-label={t("calendar.recolorAria", { name: category.name })}
                    aria-expanded={paletteFor === category.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPaletteFor(paletteFor === category.id ? "" : category.id);
                    }}
                  >
                    ⋯
                  </button>
                  {paletteFor === category.id ? (
                    <div className="gcal-cat-palette" role="radiogroup" aria-label={t("calendar.recolorAria", { name: category.name })} onClick={(event) => event.stopPropagation()}>
                      {CATEGORY_COLOR_PALETTE.map((color) => (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={category.color.toLowerCase() === color}
                          className={category.color.toLowerCase() === color ? "gcal-cat-swatch active" : "gcal-cat-swatch"}
                          style={{ background: color }}
                          aria-label={color}
                          onClick={() => {
                            onRecolorCategory(category, color);
                            setPaletteFor("");
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        className="gcal-cat-swatch-custom"
                        value={/^#[0-9a-fA-F]{6}$/.test(category.color) ? category.color : "#0066cc"}
                        aria-label={t("calendar.recolorCustomAria")}
                        onChange={(event) => onRecolorCategory(category, event.target.value)}
                      />
                    </div>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {/* The calendar list is what this sidebar is for, so it comes first.
          The mini month is a date jumper — Calendar.app has no such thing in
          its sidebar, but removing it would leave no quick way to jump, so it
          stays and only gives up the top slot (D5). */}
      <div className="gcal-mini-month">
        <div className="gcal-mini-month-head">{getMonthLabel(year, month, lang)}</div>
        <div className="gcal-mini-month-grid">
          {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
            <span key={`${label}-${index}`} className="gcal-mini-weekday">
              {label}
            </span>
          ))}
          {cells.map((cell) => {
            const classes = ["gcal-mini-day"];
            if (!cell.inMonth) classes.push("is-outside");
            if (cell.date === today) classes.push("is-today");
            if (cell.date === anchor) classes.push("is-selected");
            return (
              <button
                key={cell.date}
                type="button"
                className={classes.join(" ")}
                onClick={() => onSelectDate(cell.date)}
              >
                {getDayNumber(cell.date)}
                {datesWithItems.has(cell.date) ? <span className="gcal-mini-dot" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
