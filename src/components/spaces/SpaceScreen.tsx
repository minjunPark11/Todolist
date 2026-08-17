// The Space level (SPACES_REDESIGN_II §51, §50.14).
//
// `/s/:spaceId` has been a valid route since STEP 6 and had nothing to draw;
// this is what it draws. The Space is the work area several Projects belong
// to, so its screen answers "what is in here and how is it going" across all
// of them.
//
// It shares the Project screen's shell and its Overview component. What
// differs is the level: the Main column's first card lists Projects rather
// than Lists, and the View Bar drops Board — statuses belong to a Project, so
// a Space holding two of them has no defined column set (§0.3.3).
import { useMemo } from "react";
import type { LearningPath, Project, Space, Task } from "../../types";
import type { SpaceTab } from "../../lib/spaceHubTypes";
import { navItemsForScope } from "../../domain/view/spaceNav";
import { projectsInSpace, spaceIdForProject } from "../../domain/spaces/spaces";
import { tabText } from "../../lib/spaceHubI18n";
import { isTaskDone } from "../../lib/spaceSelectors";
import { OverviewSection, type OverviewChild } from "./OverviewSection";
import { useT } from "../../i18n";

interface SpaceScreenProps {
  space: Space;
  projects: Project[];
  tasks: Task[];
  goals: LearningPath[];
  today: string;
  tab: SpaceTab;
  onChangeTab: (tab: SpaceTab) => void;
  onOpenProject: (projectId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenGoal: (goalId: string) => void;
  /** Rendered for every tab but `overview`, so the Space owns only its own. */
  renderView: (tab: SpaceTab, scoped: { tasks: Task[]; goals: LearningPath[] }) => React.ReactNode;
}

export function SpaceScreen({
  space,
  projects,
  tasks,
  goals,
  today,
  tab,
  onChangeTab,
  onOpenProject,
  onOpenTask,
  onOpenGoal,
  renderView,
}: SpaceScreenProps) {
  const { t } = useT();

  const navItems = useMemo(() => navItemsForScope("space"), []);

  const spaceProjects = useMemo(() => projectsInSpace(projects, space.id), [projects, space.id]);

  // Membership through the Project relation, never a copy on the Task (§43,
  // T-HZ11). Moving a Project between Spaces stays one row because of this.
  const projectIds = useMemo(() => new Set(spaceProjects.map((project) => project.id)), [spaceProjects]);

  const spaceTasks = useMemo(
    () =>
      tasks.filter(
        (task) => task.status !== "archived" && !task.deletedAt && projectIds.has(task.projectId),
      ),
    [tasks, projectIds],
  );

  const spaceGoals = useMemo(
    () => goals.filter((goal) => goal.projectId && projectIds.has(goal.projectId)),
    [goals, projectIds],
  );

  const openTaskCount = useMemo(
    () => spaceTasks.filter((task) => !isTaskDone(task)).length,
    [spaceTasks],
  );

  const children: OverviewChild[] = useMemo(
    () =>
      spaceProjects.map((project) => ({
        id: project.id,
        name: project.name,
        tasks: spaceTasks.filter((task) => task.projectId === project.id),
      })),
    [spaceProjects, spaceTasks],
  );

  return (
    <div className="sdv-detail spc">
      <header className="sdv-header">
        {/* A "back to Spaces" button stood here and returned to the card grid.
            The grid is gone — the tree is how you leave, and it never went
            away while you were here. */}
        <div className="sdv-header-main">
          <span className="sdv-header-icon" style={{ background: space.color }} aria-hidden="true">
            {space.name.slice(0, 2)}
          </span>
          <div>
            <h1>{space.name}</h1>
            <p className="sdv-header-subtitle">
              {space.description || t("space.subtitle", { n: spaceProjects.length })}
            </p>
            <p className="sdv-header-counts">
              {/* Open work, which is what the tree badge beside it counts.
                  `spaceTasks` already drops archived, so this is the same
                  predicate the sidebar applies. */}
              {t("space.counts", { projects: spaceProjects.length, tasks: openTaskCount })}
            </p>
          </div>
        </div>
      </header>

      {/* Same flat bar as the Project screen, minus Board (§0.3.3). The order
          never changes — an item is absent, not moved. */}
      <nav className="sdv-tab-nav" role="tablist" aria-label={t("spaceHub.aria.sections")}>
        {navItems.map(({ id }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => onChangeTab(id)}
          >
            {tabText(t, id)}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <OverviewSection
          tasks={spaceTasks}
          goals={spaceGoals}
          today={today}
          childLabel={t("overview.projects")}
          children={children}
          onOpenChild={onOpenProject}
          onOpenTask={onOpenTask}
          onOpenGoal={onOpenGoal}
          onOpenTab={onChangeTab}
        />
      ) : (
        renderView(tab, { tasks: spaceTasks, goals: spaceGoals })
      )}
    </div>
  );
}

/** Exported for the route: which Space a path names, if the account has one. */
export function findSpaceForRoute(spaces: Space[], spaceId: string): Space | undefined {
  return spaces.find((space) => space.id === spaceId && !space.archivedAt);
}

/** True when a Project belongs to the Space — the one membership rule. */
export function projectInSpace(project: Project, spaceId: string): boolean {
  return spaceIdForProject(project) === spaceId;
}
