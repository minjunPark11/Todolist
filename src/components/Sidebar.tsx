import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Folder, List, PageId, Project, Space, Task } from "../types";
import { SpaceTree } from "./sidebar/SpaceTree";
import type { Selection } from "../app/spaceSelection";
import { listIdFor } from "../domain/spaces/membership";
import { todayValue } from "../utils/date";
import { getTodayBuckets } from "../utils/planner";
import { useT } from "../i18n";
import { MotionCollapse } from "./motion/MotionCollapse";
import { reducedTransition, transitions } from "../motion/transitions";
import { useMotionEnabled } from "../motion/reducedMotion";

// The rail collapse only applies on desktop (the mobile overlay menu ignores
// it), so the JS-driven pieces need the same breakpoint the CSS uses.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 861px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 861px)");
    const onChange = () => setIsDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  tasks: Task[];
  projects: Project[];
  /** The work areas the tree files Projects under (STEP 11). */
  spaces: Space[];
  selectedProjectId: string;
  userEmail: string;
  showCounts?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  folders: Folder[];
  lists: List[];
  selection: Selection;
  onSelectProject: (projectId: string) => void;
  onSelectSpace: (spaceId: string) => void;
  onCreateSpace: (name: string) => void;
  /** A Project is created inside a Space, so the id is required. */
  onCreateProject: (spaceId: string, name: string) => void;
  onRenameSpace: (spaceId: string, name: string) => void;
  onArchiveSpace: (spaceId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onArchiveProject: (projectId: string) => void;
  onTogglePinProject: (projectId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onSelectFolder: (spaceId: string, folderId: string) => void;
  onCreateList: (spaceId: string, name: string, folderId?: string) => void;
  onCreateFolder: (spaceId: string, name: string) => void;
  onRenameList: (listId: string, name: string) => void;
  onArchiveList: (listId: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onArchiveFolder: (folderId: string) => void;
  onMoveItemToList: (itemKey: string, listId: string) => void;
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
  showCounts = true,
  collapsed,
  onToggleCollapse,
  folders,
  lists,
  selection,
  onSelectProject,
  spaces,
  onSelectSpace,
  onCreateSpace,
  onCreateProject,
  onRenameSpace,
  onArchiveSpace,
  onRenameProject,
  onArchiveProject,
  onTogglePinProject,
  onSelectList,
  onSelectFolder,
  onCreateList,
  onCreateFolder,
  onRenameList,
  onArchiveList,
  onRenameFolder,
  onArchiveFolder,
  onMoveItemToList,
  onAddProject,
  onOpenSettings,
  search,
}: SidebarProps) {
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  const isDesktop = useIsDesktop();
  const railed = collapsed && isDesktop;
  // Open when there is something to show. Collapsed-by-default hid the one
  // place tasks are grouped by category, so the grouping looked missing to
  // anyone who had projects; with none, the empty section stays folded.
  const [projectsOpen, setProjectsOpen] = useState(() => projects.length > 0);
  const [newProject, setNewProject] = useState("");
  const today = todayValue();
  const isOpen = (task: Task) => task.status !== "done" && task.status !== "archived";

  const buckets = getTodayBuckets(tasks, today);
  const todayCount =
    buckets.waiting.length +
    buckets.inProgress.length +
    buckets.overdue.length +
    buckets.dueToday.length;
  const openCountsBySpace = new Map<string, number>();
  // A second map rather than deriving the Project number by summing this one.
  // `listIdFor` answers "" for a Task whose Project has no List at all, and an
  // archived List keeps its Tasks — so the sum is not always the Project's
  // total, and the badge a user already reads must not start drifting to make
  // a new one easier to compute.
  const openCountsByList = new Map<string, number>();
  for (const task of tasks) {
    if (!task.projectId || !isOpen(task)) continue;
    openCountsBySpace.set(task.projectId, (openCountsBySpace.get(task.projectId) ?? 0) + 1);
    const listId = listIdFor(task, lists);
    if (listId) openCountsByList.set(listId, (openCountsByList.get(listId) ?? 0) + 1);
  }

  // The two screens the day actually runs on stay at the top. Everything else
  // is reached occasionally, so it moves below the project list rather than
  // competing for the same glance — nothing is removed, only reordered.
  // Nav Shell audit D-16: the Global Rail owns the modules now, so the rows
  // that named one are gone from here — Calendar, Focus, Settings, and the
  // board that D-19 reclassified as Matrix. Keeping both would have given
  // every module two doors a centimetre apart, and §12.131 splits "add the
  // Rail" and "move the sidebar's content" into two steps for exactly this.
  //
  // Timeline and Horizons left earlier for the same kind of reason: both are
  // reached inside a scope now — the Gantt view and the Horizons section of
  // the View Bar (domain/view/spaceNav.ts).
  //
  // A "공간" entry stood here too and opened a card grid of Projects labelled
  // as spaces. SPACES_CLICKUP_UI_DESIGN U1 decided to remove it — the tree IS
  // the space explorer — and the decision went unexecuted. Adding a real Space
  // above Project turned the leftover into a contradiction: one word naming
  // two levels, with a badge counting the other one.
  //
  // What is left is places, not modules: Today and Archive both live inside
  // Tasks, and §1.5 forbids either from becoming a Rail item.
  const primaryNav: Array<{ id: PageId; label: string; icon: IconName; count: number }> = [
    { id: "today", label: t("sidebar.today"), icon: "today", count: todayCount },
  ];
  const secondaryNav: Array<{ id: PageId; label: string; icon: IconName; count: number }> = [
    { id: "archive", label: t("sidebar.archive"), icon: "archive", count: 0 },
  ];

  const signedInUserEmail = userEmail.trim();
  const initial = signedInUserEmail.charAt(0).toUpperCase();

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
        {/* layout (FLIP) tweens the row→column rearrangement of the rail
            header instead of letting the logo and button teleport. */}
        <motion.span
          className="brand-mark brand-mark-image"
          layout={motionEnabled ? "position" : false}
          layoutDependency={railed}
          transition={motionEnabled ? transitions.soft : reducedTransition}
        >
          <img className="brand-mark-img" src="/icon_focustodo.png" alt="" aria-hidden="true" />
        </motion.span>
        <AnimatePresence initial={false}>
          {!railed ? (
            <motion.strong
              layout={motionEnabled ? "position" : false}
              layoutDependency={railed}
              initial={motionEnabled ? { opacity: 0 } : false}
              animate={motionEnabled ? { opacity: 1 } : undefined}
              exit={motionEnabled ? { opacity: 0 } : undefined}
              transition={motionEnabled ? transitions.fast : reducedTransition}
            >
              {t("sidebar.brand")}
            </motion.strong>
          ) : null}
        </AnimatePresence>
        <motion.button
          type="button"
          className="side-icon-btn side-collapse-btn"
          aria-label={collapseLabel}
          title={collapseLabel}
          onClick={onToggleCollapse}
          layout={motionEnabled ? "position" : false}
          layoutDependency={railed}
          transition={motionEnabled ? transitions.soft : reducedTransition}
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
        </motion.button>
      </div>

      {signedInUserEmail ? (
        <div className="side-profile">
          <span className="side-avatar">{initial}</span>
          <span className="side-name">{signedInUserEmail}</span>
        </div>
      ) : null}

      <div className="global-search">{search}</div>

      <nav className="side-list">{primaryNav.map(renderNavItem)}</nav>

      <div className="side-section">
        <button className="side-section-title" onClick={() => setProjectsOpen((open) => !open)}>
          <span className="side-chevron" style={{ transform: projectsOpen ? "rotate(90deg)" : "none" }}>
            &rsaquo;
          </span>
          {t("tree.section")}
        </button>
        <MotionCollapse open={projectsOpen && !railed}>
          <div className="side-list">
            {/* The flat shortcut list this replaces could name a Space but
                nothing inside one (U1). The tree is its superset. */}
            <SpaceTree
              workAreas={spaces}
              projects={projects}
              folders={folders}
              lists={lists}
              selection={selection}
              counts={showCounts ? openCountsBySpace : undefined}
              listCounts={showCounts ? openCountsByList : undefined}
              onSelectSpace={onSelectSpace}
              onSelectProject={onSelectProject}
              onCreateSpace={onCreateSpace}
              onCreateProject={onCreateProject}
              onRenameSpace={onRenameSpace}
              onArchiveSpace={onArchiveSpace}
              onRenameProject={onRenameProject}
              onArchiveProject={onArchiveProject}
              onTogglePinProject={onTogglePinProject}
              onSelectList={onSelectList}
              onSelectFolder={onSelectFolder}
              onCreateList={onCreateList}
              onCreateFolder={onCreateFolder}
              onRenameList={onRenameList}
              onArchiveList={onArchiveList}
              onRenameFolder={onRenameFolder}
              onArchiveFolder={onArchiveFolder}
              onMoveItemToList={onMoveItemToList}
            />
            {/* The flat "add project" field that stood here could not say
                which Space the Project belonged to. Creation moved inside the
                tree, under the Space it lands in. */}
          </div>
        </MotionCollapse>
      </div>

      <nav className="side-list side-list-secondary">{secondaryNav.map(renderNavItem)}</nav>
    </aside>
  );
}
