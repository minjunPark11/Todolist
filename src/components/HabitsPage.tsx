import { FormEvent, useMemo, useState } from "react";
import type { Habit, HabitFrequency, HabitLog } from "../types";
import { getRecentDays, todayValue } from "../utils/date";
import { useT } from "../i18n";

interface HabitsPageProps {
  habits: Habit[];
  habitLogs: HabitLog[];
  onAddHabit: (name: string, frequency: HabitFrequency) => void;
  onToggleHabit: (habitId: string, date: string) => void;
}

export function getHabitStreak(habitId: string, habitLogs: HabitLog[]): number {
  let streak = 0;
  let date = todayValue();

  while (habitLogs.some((log) => log.habitId === habitId && log.date === date && log.completed)) {
    streak += 1;
    const current = new Date(`${date}T00:00:00`);
    current.setDate(current.getDate() - 1);
    date = current.toISOString().slice(0, 10);
  }

  return streak;
}

export function HabitsPage({ habits, habitLogs, onAddHabit, onToggleHabit }: HabitsPageProps) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");
  const today = todayValue();
  const recentDays = useMemo(() => getRecentDays(7), []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onAddHabit(name, frequency);
    setName("");
    setFrequency("daily");
  }

  return (
    <section className="content-stack">
      <header className="page-header">
        <h1>{t("habits.title")}</h1>
        <div className="stat-pill">{t("habits.habitCount", { n: habits.length })}</div>
      </header>
      <form className="habit-form" onSubmit={handleSubmit}>
        <input
          placeholder={t("habits.addHabitPlaceholder")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as HabitFrequency)}
        >
          <option value="daily">{t("habits.daily")}</option>
          <option value="weekly">{t("habits.weekly")}</option>
        </select>
        <button type="submit">{t("habits.addHabit")}</button>
      </form>
      <div className="habit-list">
        {habits.length === 0 ? <p className="empty-state">{t("habits.noHabitsYet")}</p> : null}
        {habits.map((habit) => {
          const todayLog = habitLogs.find(
            (log) => log.habitId === habit.id && log.date === today && log.completed,
          );
          const streak = getHabitStreak(habit.id, habitLogs);

          return (
            <article key={habit.id} className="habit-card">
              <div className="habit-card-main">
                <span className="habit-dot" style={{ backgroundColor: habit.color }} />
                <div>
                  <h2>{habit.name}</h2>
                  <p>
                    {habit.description ||
                      (habit.frequency === "daily" ? t("habits.dailyHabit") : t("habits.weeklyHabit"))}
                  </p>
                </div>
              </div>
              <button
                className={todayLog ? "habit-check done" : "habit-check"}
                onClick={() => onToggleHabit(habit.id, today)}
              >
                {todayLog ? t("common.done") : t("habits.check")}
              </button>
              <div className="habit-week">
                {recentDays.map((date) => {
                  const completed = habitLogs.some(
                    (log) => log.habitId === habit.id && log.date === date && log.completed,
                  );
                  return (
                    <button
                      key={date}
                      className={completed ? "day-dot done" : "day-dot"}
                      title={date}
                      onClick={() => onToggleHabit(habit.id, date)}
                    >
                      {new Date(`${date}T00:00:00`).getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="habit-streak">
                <strong>{streak}</strong>
                <span>{t("habits.streakDays", { n: streak })}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
