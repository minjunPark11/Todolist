import { ReactNode, useState } from "react";
import type { PageId, Project, Task } from "../types";
import { addDays, isThisWeek, todayValue } from "../utils/date";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  tasks: Task[];
  projects: Project[];
  selectedProjectId: string;
  userEmail: string;
  onSelectProject: (projectId: string) => void;
  onAddProject: (name: string) => void;
  onOpenSettings: () => void;
  search: ReactNode;
}

type IconName =
  | "all"
  | "today"
  | "tomorrow"
  | "next7"
  | "calendar"
  | "inbox"
  | "board"
  | "matrix"
  | "dashboard"
  | "habits"
  | "focus"
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
    all: (
      <>
        <line x1="9" y1="6" x2="20" y2="6" />
        <line x1="9" y1="12" x2="20" y2="12" />
        <line x1="9" y1="18" x2="20" y2="18" />
        <circle cx="4.5" cy="6" r="1" />
        <circle cx="4.5" cy="12" r="1" />
        <circle cx="4.5" cy="18" r="1" />
      </>
    ),
    today: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <line x1="4" y1="9" x2="20" y2="9" />
        <circle cx="12" cy="14.5" r="2" />
      </>
    ),
    tomorrow: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <line x1="4" y1="9" x2="20" y2="9" />
        <path d="M9 15h6m0 0l-2-2m2 2l-2 2" />
      </>
    ),
    next7: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="9" y1="13" x2="9" y2="17" />
        <line x1="12" y1="13" x2="12" y2="17" />
        <line x1="15" y1="13" x2="15" y2="17" />
      </>
    ),
    calendar: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 13l2.4-7h11.2L20 13" />
        <path d="M4 13v5a1 1 0 001 1h14a1 1 0 001-1v-5" />
        <path d="M4 13h4l1.5 2.5h5L16 13h4" />
      </>
    ),
    board: (
      <>
        <rect x="4" y="5" width="6" height="14" rx="1" />
        <rect x="14" y="5" width="6" height="9" rx="1" />
      </>
    ),
    matrix: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </>
    ),
    dashboard: (
      <>
        <line x1="5" y1="20" x2="5" y2="13" />
        <line x1="12" y1="20" x2="12" y2="7" />
        <line x1="19" y1="20" x2="19" y2="11" />
      </>
    ),
    habits: (
      <>
        <path d="M5 13l4 4L19 7" />
      </>
    ),
    focus: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
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
  onSelectProject,
  onAddProject,
  onOpenSettings,
  search,
}: SidebarProps) {
  const [listsOpen, setListsOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [newList, setNewList] = useState("");

  const today = todayValue();
  const tomorrow = addDays(today, 1);
  const isOpen = (task: Task) => task.status !== "done";

  const smartLists: Array<{ id: PageId; label: string; icon: IconName; count: number }> = [
    { id: "tasks", label: "All", icon: "all", count: tasks.filter(isOpen).length },
    {
      id: "today",
      label: "Today",
      icon: "today",
      count: tasks.filter((task) => isOpen(task) && task.dueDate === today).length,
    },
    {
      id: "tomorrow",
      label: "Tomorrow",
      icon: "tomorrow",
      count: tasks.filter((task) => isOpen(task) && task.dueDate === tomorrow).length,
    },
    {
      id: "next7",
      label: "Next 7 Days",
      icon: "next7",
      count: tasks.filter((task) => isOpen(task) && isThisWeek(task.dueDate)).length,
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: "calendar",
      count: tasks.filter((task) => isOpen(task) && Boolean(task.dueDate)).length,
    },
    {
      id: "inbox",
      label: "Inbox",
      icon: "inbox",
      count: tasks.filter((task) => !task.projectId && !task.dueDate).length,
    },
  ];

  const moreItems: Array<{ id: PageId; label: string; icon: IconName }> = [
    { id: "board", label: "Board", icon: "board" },
    { id: "matrix", label: "Matrix", icon: "matrix" },
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "habits", label: "Habits", icon: "habits" },
    { id: "focus", label: "Focus", icon: "focus" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  const initial = (userEmail || "Guest").charAt(0).toUpperCase();

  function submitNewList() {
    const trimmed = newList.trim();
    if (!trimmed) {
      return;
    }
    onAddProject(trimmed);
    setNewList("");
  }

  return (
    <aside className="sidebar">
      <div className="side-profile">
        <span className="side-avatar">{initial}</span>
        <span className="side-name">{userEmail || "Guest"}</span>
        <button className="side-icon-btn" aria-label="Settings" onClick={onOpenSettings}>
          <Icon name="gear" />
        </button>
      </div>

      <div className="global-search">{search}</div>

      <nav className="side-list">
        {smartLists.map((item) => (
          <button
            key={item.id}
            className={activePage === item.id ? "side-item active" : "side-item"}
            onClick={() => onNavigate(item.id)}
          >
            <span className="side-item-icon">
              <Icon name={item.icon} />
            </span>
            <span className="side-item-label">{item.label}</span>
            {item.count > 0 ? <span className="side-item-badge">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <div className="side-section">
        <button className="side-section-title" onClick={() => setListsOpen((open) => !open)}>
          <span className="side-chevron" style={{ transform: listsOpen ? "rotate(90deg)" : "none" }}>
            ›
          </span>
          Lists
        </button>
        {listsOpen ? (
          <div className="side-list">
            {projects.map((project) => {
              const count = tasks.filter(
                (task) => task.projectId === project.id && isOpen(task),
              ).length;
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
                submitNewList();
              }}
            >
              <input
                placeholder="+ Add List"
                value={newList}
                onChange={(event) => setNewList(event.target.value)}
              />
            </form>
          </div>
        ) : null}
      </div>

      <div className="side-section">
        <button className="side-section-title" onClick={() => setMoreOpen((open) => !open)}>
          <span className="side-chevron" style={{ transform: moreOpen ? "rotate(90deg)" : "none" }}>
            ›
          </span>
          More
        </button>
        {moreOpen ? (
          <nav className="side-list">
            {moreItems.map((item) => (
              <button
                key={item.id}
                className={activePage === item.id ? "side-item active" : "side-item"}
                onClick={() => onNavigate(item.id)}
              >
                <span className="side-item-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="side-item-label">{item.label}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>
    </aside>
  );
}
