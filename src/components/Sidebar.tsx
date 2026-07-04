import { ReactNode, useState } from "react";
import type { PageId, Project, Task } from "../types";
import { todayValue } from "../utils/date";
import { getTodayBuckets } from "../utils/planner";
import { useT } from "../i18n";
import { MotionCollapse } from "./motion/MotionCollapse";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  tasks: Task[];
  projects: Project[];
  selectedProjectId: string;
  userEmail: string;
  dueReviewCount?: number;
  showCounts?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectProject: (projectId: string) => void;
  onAddProject: (name: string) => void;
  onOpenSettings: () => void;
  search: ReactNode;
}

type IconName =
  | "today"
  | "calendar"
  | "projects"
  | "focus"
  | "planning"
  | "study"
  | "archive"
  | "settings"
  | "gear";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const paths: Record<IconName, ReactNode> = {
    today: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <line x1="4" y1="9" x2="20" y2="9" />
        <circle cx="12" cy="14.5" r="2" />
      </>
    ),
    calendar: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
        <line x1="8" y1="13" x2="8" y2="13.01" />
        <line x1="12" y1="13" x2="12" y2="13.01" />
        <line x1="16" y1="13" x2="16" y2="13.01" />
        <line x1="8" y1="17" x2="8" y2="17.01" />
        <line x1="12" y1="17" x2="12" y2="17.01" />
      </>
    ),
    projects: (
      <>
        <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
        <path d="M4 12l8 4.5 8-4.5" />
        <path d="M4 16.5l8 4.5 8-4.5" />
      </>
    ),
    focus: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </>
    ),
    planning: (
      <>
        <rect x="4" y="5" width="6" height="14" rx="1" />
        <rect x="14" y="5" width="6" height="9" rx="1" />
      </>
    ),
    study: (
      <>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z" />
      </>
    ),
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12a1 1 0 001 1h10a1 1 0 001-1V7" />
        <path d="M9 11h6" />
        <path d="M8 4h8l1 3H7z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export function Sidebar({
  activePage,
  onNavigate,
  tasks,
  projects,
  selectedProjectId,
  userEmail,
  dueReviewCount = 0,
  showCounts = true,
  collapsed,
  onToggleCollapse,
  onSelectProject,
  onAddProject,
  onOpenSettings,
  search,
}: SidebarProps) {
  const { t } = useT();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [newProject, setNewProject] = useState("");
  const today = todayValue();
  const isOpen = (task: Task) => task.status !== "done" && task.status !== "archived";

  const buckets = getTodayBuckets(tasks, today);
  const todayCount =
    buckets.waiting.length +
    buckets.inProgress.length +
    buckets.overdue.length +
    buckets.focus.length +
    buckets.dueToday.length +
    buckets.scheduledToday.length;
  const activeProjectCount = projects.filter((project) => project.status !== "archived").length;

  const primaryNav: Array<{ id: PageId; label: string; icon: IconName; count: number }> = [
    { id: "today", label: t("sidebar.today"), icon: "today", count: todayCount },
    { id: "planning", label: t("sidebar.planning"), icon: "planning", count: 0 },
    { id: "calendar", label: t("sidebar.calendar"), icon: "calendar", count: 0 },
    { id: "projects", label: t("sidebar.spaces"), icon: "projects", count: activeProjectCount + dueReviewCount },
    { id: "focus", label: t("sidebar.focus"), icon: "focus", count: tasks.filter((task) => task.activeSessionId).length },
  ];
  const secondaryNav: Array<{ id: PageId; label: string; icon: IconName; count: number }> = [
    { id: "archive", label: t("sidebar.archive"), icon: "archive", count: 0 },
    { id: "settings", label: t("sidebar.settings"), icon: "settings", count: 0 },
  ];

  const initial = (userEmail || "Junghoon").charAt(0).toUpperCase();

  const renderNavItem = (item: { id: PageId; label: string; icon: IconName; count: number }) => (
    <button
      key={item.id}
      className={activePage === item.id ? "side-item active" : "side-item"}
      title={collapsed ? item.label : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <span className="side-item-icon">
        <Icon name={item.icon} />
      </span>
      <span className="side-item-label">{item.label}</span>
      {showCounts && item.count > 0 ? <span className="side-item-badge">{item.count}</span> : null}
    </button>
  );

  function submitNewProject() {
    const trimmed = newProject.trim();
    if (!trimmed) {
      return;
    }
    onAddProject(trimmed);
    setNewProject("");
  }

  const collapseLabel = collapsed ? t("sidebar.expand") : t("sidebar.collapse");

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <span className="brand-mark">F</span>
        <strong>{t("sidebar.brand")}</strong>
        <button
          type="button"
          className="side-icon-btn side-collapse-btn"
          aria-label={collapseLabel}
          title={collapseLabel}
          onClick={onToggleCollapse}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? "scaleX(-1)" : "none" }}
          >
            <path d="M12 5l-6 7 6 7" />
            <path d="M18 5l-6 7 6 7" />
          </svg>
        </button>
      </div>

      <div className="side-profile">
        <span className="side-avatar">{initial}</span>
        <span className="side-name">{userEmail || "Junghoon"}</span>
        <button className="side-icon-btn" aria-label={t("sidebar.settingsAria")} onClick={onOpenSettings}>
          <Icon name="gear" />
        </button>
      </div>

      <div className="global-search">{search}</div>

      <nav className="side-list">{primaryNav.map(renderNavItem)}</nav>

      <div className="side-section">
        <button className="side-section-title" onClick={() => setProjectsOpen((open) => !open)}>
          <span className="side-chevron" style={{ transform: projectsOpen ? "rotate(90deg)" : "none" }}>
            &rsaquo;
          </span>
          {t("sidebar.projectShortcuts")}
        </button>
        <MotionCollapse open={projectsOpen}>
          <div className="side-list">
            {projects.map((project) => {
              const count = tasks.filter((task) => task.projectId === project.id && isOpen(task)).length;
              const active = activePage === "projects" && selectedProjectId === project.id;
              return (
                <button
                  key={project.id}
                  className={active ? "side-item active" : "side-item"}
                  onClick={() => onSelectProject(project.id)}
                >
                  <span className="side-dot" style={{ backgroundColor: project.color }} />
                  <span className="side-item-label">{project.name}</span>
                  {count > 0 ? <span className="side-item-badge">{count}</span> : null}
                </button>
              );
            })}
            <form
              className="side-add"
              onSubmit={(event) => {
                event.preventDefault();
                submitNewProject();
              }}
            >
              <input
                placeholder={t("sidebar.addProjectPlaceholder")}
                value={newProject}
                onChange={(event) => setNewProject(event.target.value)}
              />
            </form>
          </div>
        </MotionCollapse>
      </div>

      <nav className="side-list side-list-secondary">{secondaryNav.map(renderNavItem)}</nav>
    </aside>
  );
}
