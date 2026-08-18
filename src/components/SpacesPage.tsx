// What `/s/...` draws: the Space screen, or the Project screen inside it.
//
// This file used to be a screen of its own — a searchable grid of cards, one
// per Project, labelled as spaces, under an AI briefing that ranked them.
// SPACES_CLICKUP_UI_DESIGN U1 decided the tree IS the space explorer, and
// v0.9.1 took the grid's nav item away; what was left could only be reached by
// the "back" button on the two screens below, which is to say by leaving the
// place you were looking at to arrive somewhere that listed it again.
//
// The grid is gone, and with it the briefing, the signal list, the card menu
// and the multi-step add dialog. The dialog is worth a line of its own: it
// collected an objective, a deadline, milestones, first tasks, a learning
// goal, topics, a tracking style and custom sections, and `submitAdd` passed
// four of them to `onCreateProject` and dropped the rest on the floor.
//
// What routes to the two screens is all that remains, so this file no longer
// derives anything a Project does not already say.
import { useMemo } from "react";
import type {
  FocusSession,
  Folder,
  GoalSchedule,
  LearningPath,
  List,
  Milestone,
  PageId,
  Project,
  Task,
  TaskDraft,
} from "../types";
// The stored work area. Aliased because `SpaceLike` below is the shape the
// Project screen wants — a different thing that had the name first.
import type { Space as SpaceRecord } from "../types";
import { SpaceDetailView } from "./spaces/SpaceDetailView";
import { SpaceScreen } from "./spaces/SpaceScreen";
import { SpaceScopedView } from "./spaces/SpaceScopedView";
import type { SpaceLike } from "../lib/spaceHubTypes";
import { projectsInSpace } from "../domain/spaces/spaces";
import { EmptyState, type ToastState } from "./kit";
import { todayValue } from "../utils/date";
import { useT } from "../i18n";
import type { Schedule, ScheduleIssue } from "../domain/schedule";

type SpacesPageProps = {
  projects: Project[];
  /** The work areas above them, for the Space level (§51). */
  spaces: SpaceRecord[];
  tasks: Task[];
  // The board's time axis (SPACES_BOARD_DESIGN.md D2).
  paths: LearningPath[];
  lists: List[];
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onCreateGoal: (input: { goal: string; projectId: string; boardListId?: string; schedule?: GoalSchedule }) => void;
  onOpenGoal: (pathId: string, milestoneId?: string) => void;
  onCreateStatus: (projectId: string, name: string) => void;
  onUpdateStatus: (projectId: string, listId: string, patch: { name?: string; order?: number }) => void;
  onArchiveStatus: (projectId: string, listId: string) => void;
  onMoveGoalToStatus: (pathId: string, listId?: string) => void;
  // Passed straight through to the Horizons section, which is the Horizons
  // screen opened at a scope rather than a second implementation of it.
  onDeletePath: (pathId: string) => void;
  onAddMilestone: (pathId: string, input: { title: string }) => void;
  onDeleteMilestone: (pathId: string, milestoneId: string) => void;
  onCreateTaskFromMilestone: (pathId: string, milestoneId: string, title: string) => void;
  focusSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  selectedProjectId: string;
  viewScope: { spaceId?: string; projectId?: string; folderId?: string; listId?: string };
  folders: Folder[];
  onClearScope: () => void;
  onSelectList: (listId: string) => void;
  detailOpen: boolean;
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onUpdateTaskSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
  onCreateTask: (draft: TaskDraft) => string;
  onCompleteTask: (id: string) => void;
  onArchiveTask: (id: string) => void;
  onStartFocus: (taskId: string, source?: FocusSession["source"]) => void;
  onNavigate: (page: PageId) => void;
  // Opens the main Calendar, optionally pre-filtered to one project.
  onOpenCalendar: (projectId?: string) => void;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onRequestDeleteProject: (id: string) => void;
  showToast: (toast: ToastState) => void;
};

/**
 * The Project screen's view of a Project.
 *
 * `deriveProjectSpaces` stood here and computed a status, a "main signal", an
 * AI priority, an activity count, a relative-time label and a topic list — all
 * of it read by the card grid and none of it by the screen, which wants the
 * four fields below. The description is passed raw: the screen supplies its own
 * default line when it is empty, so a fallback here only overwrote one with
 * the other.
 */
function spaceCardFor(project: Project): SpaceLike {
  return {
    // The Project id, unprefixed. A `project-space-` prefix used to live here,
    // which made this screen name every space differently from the tree and
    // the URL (`/s/:spaceId`), so the two had to be reconciled at every
    // boundary (SPACES_REDESIGN_II §0.3.8).
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
  };
}

export function SpacesPage({
  projects,
  spaces,
  lists,
  onOpenTask,
  paths,
  onUpdatePath,
  onUpdateMilestone,
  onCreateGoal,
  onOpenGoal,
  onCreateStatus,
  onUpdateStatus,
  onArchiveStatus,
  onMoveGoalToStatus,
  onDeletePath,
  onAddMilestone,
  onDeleteMilestone,
  onCreateTaskFromMilestone,
  onToggleDone,
  tasks,
  focusSessions,
  activeFocusSession,
  selectedProjectId,
  viewScope,
  folders,
  onClearScope,
  onSelectList,
  detailOpen,
  onOpenProject,
  onCreateTask,
  onUpdateTask,
  onUpdateTaskSchedule,
  onCompleteTask,
  onArchiveTask,
  onStartFocus,
  onNavigate,
  onOpenCalendar,
  onUpdateProject,
  onRequestDeleteProject,
  showToast,
}: SpacesPageProps) {
  const { t } = useT();
  // The open tab is the Space screen's own business now, and it keeps it in
  // the URL (lib/spaceTabUrl.ts) rather than in state that a reload forgets.

  // One lookup: the tree's id and the URL's `:spaceId` are both the Project
  // id, so there is no second namespace to fall back through.
  const selectedSpace = useMemo(() => {
    const project = projects.find(
      (candidate) => candidate.id === selectedProjectId && candidate.status !== "archived",
    );
    return project ? spaceCardFor(project) : undefined;
  }, [projects, selectedProjectId]);

  // The Space the URL names, when it names one. `viewScope.spaceId` is filled
  // only by a Space selection — a Project selection fills `projectId`.
  const selectedSpaceRecord = viewScope.spaceId
    ? spaces.find((space) => space.id === viewScope.spaceId && !space.archivedAt)
    : undefined;

  // The Space level (§51). `/s/:spaceId` has been routable since STEP 6.
  if (selectedSpaceRecord) {
    return (
      <SpaceScreen
        space={selectedSpaceRecord}
        projects={projects}
        tasks={tasks}
        goals={paths}
        today={todayValue()}
        onOpenProject={onOpenProject}
        onOpenTask={onOpenTask}
        onOpenGoal={onOpenGoal}
        renderView={(tab, scoped) => (
          <SpaceScopedView
            tab={tab}
            scoped={scoped}
            // Scoped, not the whole collection. `scoped` already holds only
            // this Space's Items, but the views also OFFER Projects — the goal
            // card's board picker most visibly — and an unscoped list let a
            // goal be filed into another Space's Project, after which it
            // vanished from the view that moved it.
            projects={projectsInSpace(projects, selectedSpaceRecord.id)}
            lists={lists}
            folders={folders}
            onOpenTask={onOpenTask}
            onOpenGoal={onOpenGoal}
            onUpdateTask={onUpdateTask}
            onUpdateTaskSchedule={onUpdateTaskSchedule}
          />
        )}
      />
    );
  }

  if (detailOpen && selectedSpace) {
    return (
      <SpaceDetailView
        viewScope={viewScope}
        folders={folders}
        onClearScope={onClearScope}
        onSelectList={onSelectList}
        space={selectedSpace}
        tasks={tasks}
        lists={lists}
        projects={projects}
        paths={paths}
        onUpdatePath={onUpdatePath}
        onUpdateMilestone={onUpdateMilestone}
        onCreateGoal={onCreateGoal}
        onOpenGoal={onOpenGoal}
        onCreateStatus={onCreateStatus}
        onUpdateStatus={onUpdateStatus}
        onArchiveStatus={onArchiveStatus}
        onMoveGoalToStatus={onMoveGoalToStatus}
        onDeletePath={onDeletePath}
        onAddMilestone={onAddMilestone}
        onDeleteMilestone={onDeleteMilestone}
        onCreateTaskFromMilestone={onCreateTaskFromMilestone}
        onToggleTaskDone={onToggleDone}
        focusSessions={focusSessions}
        activeFocusSession={activeFocusSession}
        onCreateTask={onCreateTask}
        onUpdateTask={onUpdateTask}
        onUpdateTaskSchedule={onUpdateTaskSchedule}
        onCompleteTask={onCompleteTask}
        onArchiveTask={onArchiveTask}
        onStartFocus={onStartFocus}
        onUpdateProject={onUpdateProject}
        onDeleteSpace={() => onRequestDeleteProject(selectedSpace.id)}
        onNavigate={onNavigate}
        onOpenCalendar={() => onOpenCalendar(selectedSpace.id)}
        showToast={showToast}
      />
    );
  }

  // Nothing named, which the tree cannot ask for — every row it offers selects
  // something. It is reachable anyway: archive the Space you are standing in,
  // or follow a link to one that is gone. Saying so beats a blank panel.
  return (
    <div className="ff-page">
      <EmptyState icon="🗂" title={t("spaces.noSelection")} text={t("spaces.noSelectionHint")} />
    </div>
  );
}
