// Global Goals screen (SPACE_REMOVAL_IA D-4).
//
// "목표는 프로젝트 밖에서 태어난다." — Goals come before Projects in the loop
// (막힘 → 목표 → 프로젝트화 → 정보수집 → 계획 → 실행). Putting the door
// inside a Project would require a Project to exist first, which closes the
// loop entrance. This screen opens before any Project is chosen.
//
// Creating a goal here carries no projectId — it can be linked to a Project
// later via GoalDetailDrawer. showProjectContext is true because the list
// spans all Projects and each card must say which one it belongs to.
import type { LearningPath, Project, Task } from "../../types";
import { GoalsSection } from "../spaces/GoalsSection";

interface GoalsPageProps {
  goals: LearningPath[];
  tasks: Task[];
  projects: Project[];
  onOpenGoal: (goalId: string) => void;
  onCreateGoal: (goal: string) => void;
}

export function GoalsPage({ goals, tasks, projects, onOpenGoal, onCreateGoal }: GoalsPageProps) {
  return (
    <div className="ff-page">
      <GoalsSection
        goals={goals}
        tasks={tasks}
        projects={projects}
        showProjectContext={true}
        headingAs="h1"
        onOpenGoal={onOpenGoal}
        onCreateGoal={onCreateGoal}
      />
    </div>
  );
}
