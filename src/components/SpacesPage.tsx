// What `/projects` and `/s/...` draws: the Projects home or the Project screen.
//
// SPACE_REMOVAL_IA Stage 6: the Space-level screen and its tree are gone.
// `/s/:spaceId` (legacy deep links) now fall through to the Projects home the
// same way an unknown selection does; `/s/:id/p/:pid` still opens the Project
// it names. `SpaceScreen` and `SpaceScopedView` are deleted.
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
import { SpaceDetailView } from "./spaces/SpaceDetailView";
import { ProjectsHome } from "./projects/ProjectsHome";
import type { SpaceLike } from "../lib/spaceHubTypes";
import type { ToastState } from "./kit";
import { useT } from "../i18n";
import type { Schedule, ScheduleIssue } from "../domain/schedule";

type SpacesPageProps = {
  projects: Project[];
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
  /** D-20: a Space's archived Projects are restored from the Space itself. */
  onRestoreProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
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
  /**
   * The three the Projects home needs and the two screens above it did not
   * (D-1). They were the tree's row menu, which is why they had never been
   * passed to this file: managing a Project meant opening the sidebar.
   */
  onCreateProject: (name: string) => void;
  onArchiveProject: (projectId: string) => void;
  onTogglePinProject: (projectId: string) => void;
  /** D-2. Straight through to the Project screen, which is where they belong. */
  onCreateFolder: (projectId: string, name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onArchiveFolder: (folderId: string) => void;
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
  onRestoreProject,
  onDeleteProject,
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
  onCreateProject,
  onArchiveProject,
  onTogglePinProject,
  onCreateFolder,
  onRenameFolder,
  onArchiveFolder,
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
        onCreateFolder={onCreateFolder}
        onRenameFolder={onRenameFolder}
        onArchiveFolder={onArchiveFolder}
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

  // Nothing named — which used to be an accident (archive the Space you are
  // standing in, or follow a link to one that is gone) answered with "Pick
  // something on the left". SPACE_REMOVAL_IA D-1 makes it the address's own
  // screen: this is where Projects are made and managed, so arriving with
  // nothing selected is arriving, not failing.
  return (
    <div className="ff-page">
      <ProjectsHome
        projects={projects}
        tasks={tasks}
        onOpen={onOpenProject}
        onCreate={onCreateProject}
        onRename={(projectId, name) => onUpdateProject(projectId, { name })}
        onTogglePin={onTogglePinProject}
        onArchive={onArchiveProject}
        onRestore={onRestoreProject}
        onDelete={onDeleteProject}
      />
    </div>
  );
}
