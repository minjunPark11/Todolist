import type { Project } from "../../types";
import type { CalendarLayerToggles, ProjectFilter } from "../../utils/calendarItems";
import { getDayNumber, getMonthGrid, getMonthLabel, todayValue } from "../../utils/date";
import { useT } from "../../i18n";

interface CalendarLeftSidebarProps {
  anchor: string;
  datesWithItems: Set<string>;
  onSelectDate: (date: string) => void;
  layers: CalendarLayerToggles;
  onToggleLayer: (key: keyof CalendarLayerToggles) => void;
  projects: Project[];
  projectFilter: ProjectFilter;
  onToggleProject: (projectId: string) => void;
  onSelectAllProjects: () => void;
  onCreateClick: () => void;
  collapsed: boolean;
  onExpand: () => void;
}

const LAYER_ITEMS: Array<{ key: keyof CalendarLayerToggles; labelKey: string }> = [
  { key: "task", labelKey: "calendar.layerTasks" },
  { key: "deadline", labelKey: "calendar.layerDeadlines" },
  { key: "studyReview", labelKey: "calendar.layerStudyReviews" },
  { key: "projectDeadline", labelKey: "calendar.layerProjects" },
  { key: "completed", labelKey: "calendar.layerCompleted" },
];

export function CalendarLeftSidebar({
  anchor,
  datesWithItems,
  onSelectDate,
  layers,
  onToggleLayer,
  projects,
  projectFilter,
  onToggleProject,
  onSelectAllProjects,
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

      <div className="gcal-sidebar-section">
        <h3>{t("calendar.layers")}</h3>
        {LAYER_ITEMS.map((item) => (
          <label key={item.key} className="gcal-layer-toggle">
            <input
              type="checkbox"
              checked={layers[item.key]}
              onChange={() => onToggleLayer(item.key)}
            />
            {t(item.labelKey)}
          </label>
        ))}
      </div>

      <div className="gcal-sidebar-section">
        <h3>{t("calendar.projects")}</h3>
        <label className="gcal-layer-toggle">
          <input
            type="checkbox"
            checked={projectFilter === "all"}
            onChange={onSelectAllProjects}
          />
          {t("calendar.allProjects")}
        </label>
        {projects.map((project) => (
          <label key={project.id} className="gcal-layer-toggle">
            <input
              type="checkbox"
              checked={projectFilter === "all" || projectFilter.has(project.id)}
              onChange={() => onToggleProject(project.id)}
            />
            <span className="gcal-project-dot" style={{ backgroundColor: project.color }} />
            {project.name}
          </label>
        ))}
      </div>
    </aside>
  );
}
