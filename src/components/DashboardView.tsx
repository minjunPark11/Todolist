import { useMemo, useState } from "react";
import type { FocusSession, Habit, HabitLog, Project, Task } from "../types";
import { getHabitStreak } from "./HabitsPage";
import { addDays, getWeekStart, todayValue } from "../utils/date";
import { useT } from "../i18n";

interface DashboardViewProps {
  tasks: Task[];
  projects: Project[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  onExport: () => void;
}

type DashTab = "overview" | "tasks" | "focus";
type TrendPeriod = "day" | "week" | "month";

interface SeriesPoint {
  label: string;
  value: number;
}

interface Bucket {
  key: string;
  label: string;
  matches: (date: string) => boolean;
}

const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });
const weekdayFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });
const dayMonthFormatter = new Intl.DateTimeFormat("en", { month: "numeric", day: "numeric" });

function asDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function buildBuckets(period: TrendPeriod, today: string): Bucket[] {
  if (period === "day") {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(today, index - 6);
      return {
        key: day,
        label: weekdayFormatter.format(asDate(day)),
        matches: (date: string) => date === day,
      };
    });
  }

  if (period === "week") {
    const start = getWeekStart(today);
    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = addDays(start, (index - 7) * 7);
      const weekEnd = addDays(weekStart, 6);
      return {
        key: weekStart,
        label: dayMonthFormatter.format(asDate(weekStart)),
        matches: (date: string) => date >= weekStart && date <= weekEnd,
      };
    });
  }

  const base = asDate(today);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: monthFormatter.format(date),
      matches: (value: string) => value.slice(0, 7) === key,
    };
  });
}

function buildSeries(
  entries: Array<{ date: string; weight: number }>,
  period: TrendPeriod,
  today: string,
): SeriesPoint[] {
  const buckets = buildBuckets(period, today);
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: entries
      .filter((entry) => entry.date && bucket.matches(entry.date))
      .reduce((total, entry) => total + entry.weight, 0),
  }));
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="kpi-delta flat">0</span>;
  }
  const up = delta > 0;
  return (
    <span className={up ? "kpi-delta up" : "kpi-delta down"}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

function KpiCard({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: number | string;
  delta?: number;
  sub?: string;
}) {
  return (
    <article className="kpi-card">
      <span className="kpi-label">{label}</span>
      <div className="kpi-value-row">
        <strong className="kpi-value">{value}</strong>
        {delta !== undefined ? <DeltaBadge delta={delta} /> : null}
      </div>
      {sub ? <span className="kpi-sub">{sub}</span> : null}
    </article>
  );
}

function BarCard({ title, items }: { title: string; items: SeriesPoint[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <section className="dash-card">
      <h2>{title}</h2>
      <div className="bar-list">
        {items.map((item) => (
          <div key={item.label} className="bar-row">
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
            <div className="bar-track">
              <span style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendCard({
  title,
  series,
  period,
  onPeriodChange,
}: {
  title: string;
  series: SeriesPoint[];
  period: TrendPeriod;
  onPeriodChange: (period: TrendPeriod) => void;
}) {
  const { t } = useT();
  const [hover, setHover] = useState<number | null>(null);
  const count = series.length;
  const max = Math.max(...series.map((point) => point.value), 1);

  const points = series.map((point, index) => {
    const x = count > 1 ? (index / (count - 1)) * 100 : 50;
    const y = 38 - (point.value / max) * 34;
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const firstX = points[0]?.[0] ?? 0;
  const lastX = points[points.length - 1]?.[0] ?? 100;
  const area = `${line} L${lastX} 40 L${firstX} 40 Z`;

  return (
    <section className="dash-card trend-card">
      <div className="dash-card-head">
        <h2>{title}</h2>
        <div className="dash-tabs small">
          {(["day", "week", "month"] as TrendPeriod[]).map((option) => (
            <button
              key={option}
              className={period === option ? "active" : ""}
              onClick={() => onPeriodChange(option)}
            >
              {option === "day" ? t("dashboard.periodDay") : option === "week" ? t("dashboard.periodWeek") : t("dashboard.periodMonth")}
            </button>
          ))}
        </div>
      </div>
      <div className="trend-chart">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="trend-svg">
          <path className="trend-area" d={area} />
          <path className="trend-line" d={line} vectorEffect="non-scaling-stroke" />
          {hover !== null && points[hover] ? (
            <line
              className="trend-guide"
              x1={points[hover][0]}
              y1="0"
              x2={points[hover][0]}
              y2="40"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <div className="trend-bands">
          {series.map((point, index) => (
            <div
              key={point.label + index}
              className="trend-band"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover((current) => (current === index ? null : current))}
            />
          ))}
        </div>
        {hover !== null && series[hover] ? (
          <div
            className="trend-tooltip"
            style={{ left: `${count > 1 ? (hover / (count - 1)) * 100 : 50}%` }}
          >
            <strong>{series[hover].value}</strong>
            <span>{series[hover].label}</span>
          </div>
        ) : null}
      </div>
      <div className="trend-axis">
        {series.map((point, index) => (
          <span key={point.label + index}>{point.label}</span>
        ))}
      </div>
    </section>
  );
}

export function DashboardView({
  tasks,
  projects,
  habits,
  habitLogs,
  focusSessions,
  onExport,
}: DashboardViewProps) {
  const { t } = useT();
  const [tab, setTab] = useState<DashTab>("overview");
  const [period, setPeriod] = useState<TrendPeriod>("day");

  const today = todayValue();
  const yesterday = addDays(today, -1);
  const weekStart = getWeekStart(today);
  const lastWeekStart = addDays(weekStart, -7);

  const stats = useMemo(() => {
    const done = (task: Task) => task.status === "done";
    const completedOn = (date: string) =>
      tasks.filter((task) => task.completedAt.slice(0, 10) === date).length;
    const completedBetween = (start: string, end: string) =>
      tasks.filter((task) => {
        const day = task.completedAt.slice(0, 10);
        return day >= start && day <= end;
      }).length;
    const createdOn = (date: string) =>
      tasks.filter((task) => task.createdAt.slice(0, 10) === date).length;

    const focusMinutesOn = (date: string) =>
      focusSessions
        .filter(
          (session) =>
            session.completed &&
            session.mode === "focus" &&
            session.startedAt.slice(0, 10) === date,
        )
        .reduce((total, session) => total + session.durationMinutes, 0);
    const focusMinutesBetween = (start: string, end: string) =>
      focusSessions
        .filter((session) => {
          const day = session.startedAt.slice(0, 10);
          return (
            session.completed && session.mode === "focus" && day >= start && day <= end
          );
        })
        .reduce((total, session) => total + session.durationMinutes, 0);

    const total = tasks.length;
    const completed = tasks.filter(done).length;

    return {
      total,
      completed,
      open: tasks.filter((task) => !done(task)).length,
      overdue: tasks.filter((task) => !done(task) && task.dueDate && task.dueDate < today).length,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      completedToday: completedOn(today),
      completedTodayDelta: completedOn(today) - completedOn(yesterday),
      completedThisWeek: completedBetween(weekStart, addDays(weekStart, 6)),
      completedThisWeekDelta:
        completedBetween(weekStart, addDays(weekStart, 6)) -
        completedBetween(lastWeekStart, addDays(lastWeekStart, 6)),
      createdToday: createdOn(today),
      createdTodayDelta: createdOn(today) - createdOn(yesterday),
      focusToday: focusMinutesOn(today),
      focusTodayDelta: focusMinutesOn(today) - focusMinutesOn(yesterday),
      focusThisWeek: focusMinutesBetween(weekStart, addDays(weekStart, 6)),
      focusThisWeekDelta:
        focusMinutesBetween(weekStart, addDays(weekStart, 6)) -
        focusMinutesBetween(lastWeekStart, addDays(lastWeekStart, 6)),
      focusSessionsTotal: focusSessions.filter(
        (session) => session.completed && session.mode === "focus",
      ).length,
    };
  }, [tasks, focusSessions, today, yesterday, weekStart, lastWeekStart]);

  const completedSeries = useMemo(
    () =>
      buildSeries(
        tasks
          .filter((task) => task.completedAt)
          .map((task) => ({ date: task.completedAt.slice(0, 10), weight: 1 })),
        period,
        today,
      ),
    [tasks, period, today],
  );

  const focusSeries = useMemo(
    () =>
      buildSeries(
        focusSessions
          .filter((session) => session.completed && session.mode === "focus")
          .map((session) => ({
            date: session.startedAt.slice(0, 10),
            weight: session.durationMinutes,
          })),
        period,
        today,
      ),
    [focusSessions, period, today],
  );

  const statusCounts = (["todo", "doing", "waiting", "done"] as const).map(
    (status) => ({
      label: t(`status.${status}`),
      value: tasks.filter((task) => task.status === status).length,
    }),
  );
  const priorityCounts = (["none", "low", "medium", "high"] as const).map((priority) => ({
    label: t(`priority.${priority}`),
    value: tasks.filter((task) => task.priority === priority).length,
  }));
  const projectCounts = [
    ...projects.map((project) => ({
      label: project.name,
      value: tasks.filter((task) => task.projectId === project.id).length,
    })),
    { label: t("status.inbox"), value: tasks.filter((task) => !task.projectId).length },
  ];

  const tabs: Array<{ id: DashTab; labelKey: string }> = [
    { id: "overview", labelKey: "dashboard.tabOverview" },
    { id: "tasks", labelKey: "dashboard.tabTasks" },
    { id: "focus", labelKey: "dashboard.tabFocus" },
  ];

  return (
    <section className="content-stack dashboard-dark">
      <header className="dash-topbar">
        <h1>{t("dashboard.title")}</h1>
        <div className="dash-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
        <button className="dash-export" onClick={onExport}>
          {t("dashboard.export")}
        </button>
      </header>

      {tab === "overview" ? (
        <>
          <div className="kpi-grid">
            <KpiCard
              label={t("dashboard.completedToday")}
              value={stats.completedToday}
              delta={stats.completedTodayDelta}
              sub={t("dashboard.totalCount", { n: stats.completed })}
            />
            <KpiCard label={t("dashboard.openTasks")} value={stats.open} sub={t("dashboard.totalCount", { n: stats.total })} />
            <KpiCard label={t("dashboard.overdue")} value={stats.overdue} sub={t("dashboard.needsAttention")} />
            <KpiCard label={t("dashboard.completion")} value={`${stats.completionRate}%`} sub={t("dashboard.allTasks")} />
          </div>
          <TrendCard
            title={t("dashboard.completedTasks")}
            series={completedSeries}
            period={period}
            onPeriodChange={setPeriod}
          />
          <div className="dash-grid">
            <BarCard title={t("dashboard.byStatus")} items={statusCounts} />
            <BarCard title={t("dashboard.byPriority")} items={priorityCounts} />
            <BarCard title={t("dashboard.byProject")} items={projectCounts} />
            <BarCard
              title={t("dashboard.habitStreaks")}
              items={habits.map((habit) => ({
                label: habit.name,
                value: getHabitStreak(habit.id, habitLogs),
              }))}
            />
          </div>
        </>
      ) : null}

      {tab === "tasks" ? (
        <>
          <div className="kpi-grid">
            <KpiCard
              label={t("dashboard.completedToday")}
              value={stats.completedToday}
              delta={stats.completedTodayDelta}
              sub={t("dashboard.totalCount", { n: stats.completed })}
            />
            <KpiCard
              label={t("dashboard.completedThisWeek")}
              value={stats.completedThisWeek}
              delta={stats.completedThisWeekDelta}
              sub={t("dashboard.vsLastWeek")}
            />
            <KpiCard
              label={t("dashboard.createdToday")}
              value={stats.createdToday}
              delta={stats.createdTodayDelta}
              sub={t("dashboard.totalCount", { n: stats.total })}
            />
            <KpiCard label={t("dashboard.openTasks")} value={stats.open} sub={t("dashboard.overdueCount", { n: stats.overdue })} />
          </div>
          <TrendCard
            title={t("dashboard.completedTasks")}
            series={completedSeries}
            period={period}
            onPeriodChange={setPeriod}
          />
          <div className="dash-grid">
            <BarCard title={t("dashboard.byStatus")} items={statusCounts} />
            <BarCard title={t("dashboard.byPriority")} items={priorityCounts} />
            <BarCard title={t("dashboard.byProject")} items={projectCounts} />
          </div>
        </>
      ) : null}

      {tab === "focus" ? (
        <>
          <div className="kpi-grid">
            <KpiCard
              label={t("dashboard.focusToday")}
              value={`${stats.focusToday}m`}
              delta={stats.focusTodayDelta}
              sub={t("dashboard.minutes")}
            />
            <KpiCard
              label={t("dashboard.focusThisWeek")}
              value={`${stats.focusThisWeek}m`}
              delta={stats.focusThisWeekDelta}
              sub={t("dashboard.vsLastWeek")}
            />
            <KpiCard
              label={t("dashboard.sessions")}
              value={stats.focusSessionsTotal}
              sub={t("dashboard.completedFocus")}
            />
          </div>
          <TrendCard
            title={t("dashboard.focusMinutesTitle")}
            series={focusSeries}
            period={period}
            onPeriodChange={setPeriod}
          />
        </>
      ) : null}
    </section>
  );
}
