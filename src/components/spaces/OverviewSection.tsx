// Overview (SPACES_REDESIGN_II §50), for a Space or a Project.
//
// One layout system, not two screens (§50.14). Only the Main column's first
// card changes with the scope: a Space summarises its Projects, a Project its
// Lists. Everything else — the KPI row, Recently updated, Upcoming, Goals,
// Horizons — is the same component family reading the same scope.
//
// Every number comes from the Task set the caller resolved, which is the set
// the Board and the List see (§50.4). An Overview with its own query is an
// Overview that can disagree with the screen next to it.
import { useMemo } from "react";
import type { LearningPath, Task } from "../../types";
import type { SpaceTab } from "../../lib/spaceHubTypes";
import { goalProgress } from "../../domain/horizons/goalDetails";
import { isTaskDone, isTaskOverdue } from "../../lib/spaceSelectors";
import { EmptyState } from "../kit";
import { useT } from "../../i18n";

/** A row in the Main column's first card: a Project, or a List. */
export interface OverviewChild {
  id: string;
  name: string;
  /** Tasks that belong to it, already resolved by the caller. */
  tasks: Task[];
}

interface OverviewSectionProps {
  /** Canonical set for this scope — the same one every view here reads. */
  tasks: Task[];
  goals: LearningPath[];
  today: string;
  /** "Projects" at a Space, "Lists" at a Project (§50.14). */
  childLabel: string;
  children: OverviewChild[];
  onOpenChild: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenGoal: (goalId: string) => void;
  onOpenTab: (tab: SpaceTab) => void;
}

export function OverviewSection({
  tasks,
  goals,
  today,
  childLabel,
  children,
  onOpenChild,
  onOpenTask,
  onOpenGoal,
  onOpenTab,
}: OverviewSectionProps) {
  const { t } = useT();

  const summary = useMemo(() => {
    const open = tasks.filter((task) => !isTaskDone(task));
    return {
      open: open.length,
      inProgress: tasks.filter((task) => task.status === "doing").length,
      completed: tasks.filter(isTaskDone).length,
      overdue: tasks.filter((task) => isTaskOverdue(task, today)).length,
    };
  }, [tasks, today]);

  const recent = useMemo(
    () => [...tasks].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 5),
    [tasks],
  );

  const upcoming = useMemo(() => {
    // Overdue work belongs to the Overdue card, not mixed into what is coming
    // (§50.10). This lists only dates that have not passed.
    return tasks
      .filter((task) => !isTaskDone(task) && task.dueDate && task.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 3);
  }, [tasks, today]);

  const activeGoals = useMemo(() => goals.filter((goal) => !goal.completedAt), [goals]);

  return (
    <div className="ovs">
      <div className="ovs-summary">
        <MetricCard label={t("overview.open")} value={summary.open} tone="neutral" />
        <MetricCard label={t("overview.inProgress")} value={summary.inProgress} tone="active" />
        <MetricCard label={t("overview.completed")} value={summary.completed} tone="done" />
        <MetricCard label={t("overview.overdue")} value={summary.overdue} tone="danger" />
      </div>

      <div className="ovs-body">
        <div className="ovs-main">
          <section className="ovs-card">
            <h3>{childLabel}</h3>
            {children.length === 0 ? (
              <p className="ovs-none">{t("overview.noChildren")}</p>
            ) : (
              <ul className="ovs-rows">
                {children.map((child) => {
                  const open = child.tasks.filter((task) => !isTaskDone(task)).length;
                  const done = child.tasks.filter(isTaskDone).length;
                  // §50.7: a container with nothing in it has no progress —
                  // calling that 100% would report finished work that never
                  // existed.
                  const percent =
                    child.tasks.length > 0 ? Math.round((done / child.tasks.length) * 100) : null;
                  return (
                    <li key={child.id}>
                      <button type="button" className="ovs-row" onClick={() => onOpenChild(child.id)}>
                        <span className="ovs-row-name">{child.name}</span>
                        <span className="ovs-row-open">{open}</span>
                        <span className="ovs-row-progress">
                          {percent === null ? (
                            <span className="ovs-muted">—</span>
                          ) : (
                            <>
                              <span className="ovs-bar">
                                <span style={{ width: `${percent}%` }} />
                              </span>
                              <span className="ovs-percent">{percent}%</span>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ovs-card">
            <h3>{t("overview.recent")}</h3>
            {recent.length === 0 ? (
              <p className="ovs-none">{t("overview.noRecent")}</p>
            ) : (
              <ul className="ovs-rows">
                {recent.map((task) => (
                  <li key={task.id}>
                    <button type="button" className="ovs-row" onClick={() => onOpenTask(task.id)}>
                      <span className="ovs-row-name">{task.title}</span>
                      <span className="ovs-muted">{task.updatedAt.slice(0, 10)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* §50.13 — fixed order: what is next, what we are aiming at, what is
            piled up by time frame. */}
        <aside className="ovs-aside">
          <section className="ovs-card">
            <h3>{t("overview.upcoming")}</h3>
            {upcoming.length === 0 ? (
              <p className="ovs-none">{t("overview.noUpcoming")}</p>
            ) : (
              <ul className="ovs-rows">
                {upcoming.map((task) => (
                  <li key={task.id}>
                    <button type="button" className="ovs-row" onClick={() => onOpenTask(task.id)}>
                      <span className="ovs-date">{task.dueDate.slice(5)}</span>
                      <span className="ovs-row-name">{task.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ovs-card">
            <h3>
              {t("overview.goals")}
              <button type="button" className="ovs-more" onClick={() => onOpenTab("goals")}>
                {t("overview.seeAll")}
              </button>
            </h3>
            {activeGoals.length === 0 ? (
              <p className="ovs-none">{t("overview.noGoals")}</p>
            ) : (
              <ul className="ovs-rows">
                {activeGoals.slice(0, 2).map((goal) => {
                  const progress = goalProgress(goal, tasks);
                  const percent =
                    progress.milestonesTotal > 0
                      ? Math.round((progress.milestonesDone / progress.milestonesTotal) * 100)
                      : null;
                  return (
                    <li key={goal.id}>
                      <button type="button" className="ovs-row" onClick={() => onOpenGoal(goal.id)}>
                        <span className="ovs-row-name">{goal.goal}</span>
                        {percent !== null ? <span className="ovs-percent">{percent}%</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* A Horizons card stood here: the five periods, life to day, with
              a count each and a link to the section that drew them as columns.
              Both are gone (domain/view/spaceNav.ts). */}
        </aside>
      </div>

      {tasks.length === 0 && children.length === 0 ? (
        <EmptyState icon="🗂" title={t("overview.empty")} text={t("overview.emptyHint")} />
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`ovs-metric is-${tone}`}>
      <span className="ovs-metric-label">{label}</span>
      <strong className="ovs-metric-value">{value}</strong>
    </div>
  );
}
