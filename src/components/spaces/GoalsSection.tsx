// Goals as a Domain Section (SPACES_REDESIGN_II §50E).
//
// It was a board until STEP 8 named it a Section and STEP 10 gave it a screen.
// A Goal is not a Task read a different way: it carries milestones, a planning
// period and a deadline that answer different questions, and none of those
// survives being drawn as a card in a status column.
//
// Progress comes from `goalProgress` and nowhere else (§50E.8). Milestones are
// the Goal's own structure, so their completion IS its progress; a Goal with
// none and no linked tasks shows no bar at all rather than a number invented
// to fill the space (T-GL07).
import { useMemo, useState } from "react";
import type { LearningPath, Project, Task } from "../../types";
import { goalProgress } from "../../domain/horizons/goalDetails";
import { EmptyState } from "../kit";
import { useT } from "../../i18n";

interface GoalsSectionProps {
  /** Already narrowed to the scope by the caller. */
  goals: LearningPath[];
  tasks: Task[];
  projects: Project[];
  /** Shown per card only when the scope spans more than one Project (§50E.17). */
  showProjectContext: boolean;
  onOpenGoal: (goalId: string) => void;
  onCreateGoal?: (goal: string) => void;
  /** Heading level for the section title. Defaults to h2; use h1 when this is
   *  the page's top-level content (e.g. the global /goals screen). */
  headingAs?: "h1" | "h2";
}

export function GoalsSection({
  goals,
  tasks,
  projects,
  showProjectContext,
  onOpenGoal,
  onCreateGoal,
  headingAs = "h2",
}: GoalsSectionProps) {
  const Title = headingAs;
  const { t } = useT();
  const [draft, setDraft] = useState("");

  const projectName = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  // §50E.13: nearest deadline first, then the ones without one. A Goal with no
  // date is not urgent, but it is not gone either.
  const { active, completed } = useMemo(() => {
    const byDeadline = (a: LearningPath, b: LearningPath) =>
      (a.deadlineDate || "9999-12-31").localeCompare(b.deadlineDate || "9999-12-31");
    return {
      active: goals.filter((goal) => !goal.completedAt).sort(byDeadline),
      completed: goals
        .filter((goal) => goal.completedAt)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    };
  }, [goals]);

  return (
    <div className="gls">
      <header className="gls-head">
        <div>
          <Title>{t("goals.title")}</Title>
          <p>{t("goals.subtitle")}</p>
        </div>
        {onCreateGoal ? (
          <form
            className="gls-add"
            onSubmit={(event) => {
              event.preventDefault();
              const value = draft.trim();
              if (!value) return;
              onCreateGoal(value);
              setDraft("");
            }}
          >
            <input
              value={draft}
              placeholder={t("goals.addPlaceholder")}
              aria-label={t("goals.addPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="ff-btn ff-btn-sm">
              {t("goals.add")}
            </button>
          </form>
        ) : null}
      </header>

      {goals.length === 0 ? (
        <EmptyState icon="🎯" title={t("goals.empty")} text={t("goals.emptyHint")} />
      ) : (
        <>
          <section className="gls-group">
            <h3>
              {t("goals.active")} <span className="gls-count">{active.length}</span>
            </h3>
            {active.length === 0 ? (
              <p className="gls-none">{t("goals.noneActive")}</p>
            ) : (
              <ul className="gls-list">
                {active.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    tasks={tasks}
                    projectName={showProjectContext ? projectName.get(goal.projectId ?? "") : undefined}
                    onOpen={() => onOpenGoal(goal.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          {completed.length > 0 ? (
            <section className="gls-group is-completed">
              <h3>
                {t("goals.completed")} <span className="gls-count">{completed.length}</span>
              </h3>
              <ul className="gls-list">
                {completed.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    tasks={tasks}
                    projectName={showProjectContext ? projectName.get(goal.projectId ?? "") : undefined}
                    onOpen={() => onOpenGoal(goal.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  tasks,
  projectName,
  onOpen,
}: {
  goal: LearningPath;
  tasks: Task[];
  projectName?: string;
  onOpen: () => void;
}) {
  const { t } = useT();
  const progress = goalProgress(goal, tasks);
  // Case A of §50E.8: milestones are the Goal's own structure. Case C when it
  // has none — the bar is hidden, not filled with a guess.
  const percent =
    progress.milestonesTotal > 0
      ? Math.round((progress.milestonesDone / progress.milestonesTotal) * 100)
      : null;

  return (
    <li className={`gls-card${goal.completedAt ? " is-done" : ""}`}>
      <button type="button" className="gls-card-title" onClick={onOpen}>
        {goal.completedAt ? "✓ " : ""}
        {goal.goal}
      </button>

      {percent !== null ? (
        <div className="gls-progress">
          {/* Both a bar and the number: a bar alone carries the value in
              length only, which §49A.7 does not accept on its own. */}
          <div
            className="gls-bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("goals.progressLabel", { title: goal.goal })}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="gls-percent">{percent}%</span>
        </div>
      ) : null}

      <p className="gls-meta">
        {projectName ? <span className="gls-chip">{projectName}</span> : null}
        {goal.deadlineDate ? <span>{t("goals.due", { date: goal.deadlineDate })}</span> : null}
        {progress.milestonesTotal > 0 ? (
          <span>
            {t("goals.milestones", { done: progress.milestonesDone, total: progress.milestonesTotal })}
          </span>
        ) : null}
        {/* Linked tasks are referenced, never copied (T-GL11). */}
        {progress.tasksTotal > 0 ? (
          <span>{t("goals.linkedTasks", { done: progress.tasksDone, total: progress.tasksTotal })}</span>
        ) : null}
      </p>
    </li>
  );
}
