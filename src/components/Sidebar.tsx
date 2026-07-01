import { ReactNode, useState } from "react";
import type { PageId, Project, Task } from "../types";
import { todayValue } from "../utils/date";
import { getTodayBuckets } from "../utils/planner";
import { useT } from "../i18n";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  tasks: Task[];
  projects: Project[];
  selectedProjectId: string;
  userEmail: string;
  dueReviewCount?: number;
  showCounts?: boolean;
  onSelectProject: (projectId: string) => void;
  onAddProject: (name: string) => void;
  onOpenSettings: () => void;
  search: ReactNode;
}

type IconName =
  | "inbox"
  | "today"
  | "calendar"
  | "projects"
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
    inbox: (
      <>
        <path d="M4 13l2.4-7h11.2L20 13" />
        <path d="M4 13v5a1 1 0 001 1h14a1 1 0 001-1v-5" />
        <path d="M4 13h4l1.5 2.5h5L16 13h4" />
      </>
    ),
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
      <path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
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
  const inboxCount = tasks.filter((task) => task.status === "inbox").length;
  const activeProjectCount = projects.filter((project) => project.status !== "archived").length;

  const primaryNav: Array<{ id: PageId; label: string; icon: IconName; count: number }> = [
    { id: "inbox", label: t("sidebar.inbox"), icon: "inbox", count: inboxCount },
    { id: "today", label: t("sidebar.today"), icon: "today", count: todayCount },
    { id: "calendar", label: t("sidebar.calendar"), icon: "calendar", count: 0 },
    { id: "projects", label: t("sidebar.projects"), icon: "projects", count: activeProjectCount },
    { id: "planning", label: t("sidebar.planning"), icon: "planning", count: 0 },
    { id: "study", label: t("sidebar.study"), icon: "study", count: dueReviewCount },
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

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <span className="brand-mark">F</span>
        <strong>{t("sidebar.brand")}</strong>
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
        {projectsOpen ? (
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
        ) : null}
      </div>

      <nav className="side-list side-list-secondary">{secondaryNav.map(renderNavItem)}</nav>
    </aside>
  );
}
