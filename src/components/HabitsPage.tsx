import { FormEvent, useMemo, useState } from "react";
import type { Habit, HabitFrequency, HabitLog } from "../types";
import { getRecentDays, todayValue } from "../utils/date";

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
        <h1>Habits</h1>
        <div className="stat-pill">{habits.length} habits</div>
      </header>
      <form className="habit-form" onSubmit={handleSubmit}>
        <input
          placeholder="Add a habit..."
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as HabitFrequency)}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <button type="submit">Add habit</button>
      </form>
      <div className="habit-list">
        {habits.length === 0 ? <p className="empty-state">No habits yet.</p> : null}
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
                  <p>{habit.description || `${habit.frequency} habit`}</p>
                </div>
              </div>
              <button
                className={todayLog ? "habit-check done" : "habit-check"}
                onClick={() => onToggleHabit(habit.id, today)}
              >
                {todayLog ? "Done" : "Check"}
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
                <span>day streak</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
