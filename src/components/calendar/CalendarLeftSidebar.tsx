import type { CSSProperties } from "react";
import type { CalendarCategory, CalendarCategoryGroup } from "../../lib/calendarCategories";
import { getDayNumber, getMonthGrid, getMonthLabel, todayValue } from "../../utils/date";
import { useT } from "../../i18n";

interface CalendarLeftSidebarProps {
  anchor: string;
  datesWithItems: Set<string>;
  onSelectDate: (date: string) => void;
  // Category spec §3.1: the sidebar only *uses* categories — checkbox =
  // show/hide, row click = pick the default category for new events.
  // Add / rename / delete live in Settings.
  groups: CalendarCategoryGroup[];
  activeCategoryId: string;
  isCategoryVisible: (categoryId: string) => boolean;
  onToggleCategory: (category: CalendarCategory) => void;
  onSelectCategory: (category: CalendarCategory) => void;
  onCreateClick: () => void;
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
  onCreateClick,
  collapsed,
  onExpand,
}: CalendarLeftSidebarProps) {
  const { t, lang } = useT();
  const today = todayValue();
  const anchorDate = new Date(`${anchor}T00:00:00`);
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const cells = getMonthGrid(year, month);

  // Collapsed: a slim icon rail (expand + create) instead of hiding the
  // sidebar entirely, so the calendar keeps its left anchor and stays quick
  // to reopen.
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
        <button
          type="button"
          className="gcal-create-btn is-rail"
          aria-label={t("calendar.createAria")}
          title={t("calendar.createAria")}
          onClick={onCreateClick}
        >
          +
        </button>
      </aside>
    );
  }

  return (
    <aside className="gcal-sidebar">
      <button type="button" className="gcal-create-btn" onClick={onCreateClick}>
        {t("calendar.create")}
      </button>

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
              </div>
            );
          })}
        </div>
      ))}

    </aside>
  );
}
