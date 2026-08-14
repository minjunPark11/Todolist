import { useMemo, useState } from "react";
import type { BoardList, GoalSchedule, LearningPath } from "../../types";
import { anchorForGoalUnit } from "../../domain/horizons/goalSchedule";
import { todayValue } from "../../utils/date";
import { useT } from "../../i18n";

export function SpaceGoalsTab({
  boardId, paths, lists, onCreateGoal, onCreateList, onUpdateList, onArchiveList, onMoveGoal,
  onUpdatePath, onOpenGoal,
}: {
  boardId: string;
  paths: LearningPath[];
  lists: BoardList[];
  onCreateGoal: (input: { goal: string; projectId: string; boardListId?: string; schedule?: GoalSchedule }) => void;
  onCreateList: (name: string) => void;
  onUpdateList: (listId: string, patch: { name?: string; order?: number }) => void;
  onArchiveList: (listId: string) => void;
  onMoveGoal: (pathId: string, listId?: string) => void;
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onOpenGoal: (pathId: string) => void;
}) {
  const { t } = useT();
  const activeLists = lists.filter((list) => !list.archivedAt).sort((a, b) => a.order - b.order);
  const boardGoals = useMemo(() => paths.filter((path) => path.projectId === boardId), [boardId, paths]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalListId, setGoalListId] = useState("");
  const [listTitle, setListTitle] = useState("");
  const [draggingId, setDraggingId] = useState("");

  function goalsFor(listId?: string) {
    return boardGoals
      .filter((goal) => (goal.boardListId ?? "") === (listId ?? ""))
      .sort((a, b) => (a.boardOrder ?? Number.MAX_SAFE_INTEGER) - (b.boardOrder ?? Number.MAX_SAFE_INTEGER));
  }

  function submitGoal(event: React.FormEvent) {
    event.preventDefault();
    const goal = goalTitle.trim();
    if (!goal || !boardId) return;
    onCreateGoal({ goal, projectId: boardId, boardListId: goalListId || undefined, schedule: { unit: "unscheduled" } });
    setGoalTitle("");
  }

  const sections: Array<{ id?: string; name: string; list?: BoardList }> = [
    { name: t("spaceGoals.unsorted") },
    ...activeLists.map((list) => ({ id: list.id, name: list.name, list })),
  ];

  return <section className="sdv-goals">
    <header className="sdv-goals-head"><div><h2>{t("spaceGoals.title")}</h2><p>{t("spaceGoals.subtitle")}</p></div></header>
    <div className="sdv-goals-create">
      <form onSubmit={submitGoal}><input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder={t("spaceGoals.goalPlaceholder")} /><select value={goalListId} onChange={(e) => setGoalListId(e.target.value)}><option value="">{t("spaceGoals.unsorted")}</option>{activeLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select><button type="submit">+ {t("spaceGoals.addGoal")}</button></form>
      <form onSubmit={(event) => { event.preventDefault(); if (listTitle.trim()) onCreateList(listTitle); setListTitle(""); }}><input value={listTitle} onChange={(e) => setListTitle(e.target.value)} placeholder={t("spaceGoals.listPlaceholder")} /><button type="submit">+ {t("spaceGoals.addList")}</button></form>
    </div>
    <div className="sdv-goal-lists">{sections.map((section) => {
      const goals = goalsFor(section.id);
      return <section key={section.id ?? "unsorted"} className="sdv-goal-list" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggingId) onMoveGoal(draggingId, section.id); setDraggingId(""); }}>
        <header>{section.list ? <input defaultValue={section.name} aria-label={t("spaceGoals.listName")} onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== section.name) onUpdateList(section.id!, { name }); }} /> : <strong>{section.name}</strong>}<span>{goals.length}</span>{section.list ? <div><button type="button" disabled={section.list.order === 0} onClick={() => onUpdateList(section.id!, { order: section.list!.order - 1 })}>↑</button><button type="button" disabled={section.list.order === activeLists.length - 1} onClick={() => onUpdateList(section.id!, { order: section.list!.order + 1 })}>↓</button><button type="button" onClick={() => onArchiveList(section.id!)}>{t("common.archive")}</button></div> : null}</header>
        <div className="sdv-goal-list-items">{goals.map((goal) => <article key={goal.id} draggable onDragStart={() => setDraggingId(goal.id)} onDragEnd={() => setDraggingId("")} className={`sdv-goal-item${goal.completedAt ? " is-done" : ""}`}>
          <button type="button" className={`hz-check${goal.completedAt ? " checked" : ""}`} aria-label={t("horizons.markDone")} onClick={() => onUpdatePath(goal.id, { completedAt: goal.completedAt ? undefined : new Date().toISOString() })}>{goal.completedAt ? "✓" : ""}</button>
          <button type="button" className="sdv-goal-title" onClick={() => onOpenGoal(goal.id)}>{goal.goal}</button>
          <select aria-label={t("spaceGoals.moveToList")} value={goal.boardListId ?? ""} onChange={(e) => onMoveGoal(goal.id, e.target.value || undefined)}><option value="">{t("spaceGoals.unsorted")}</option>{activeLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select>
          <GoalPlanControl goal={goal} onUpdate={(schedule) => onUpdatePath(goal.id, { schedule })} />
        </article>)}</div>
        {goals.length === 0 ? <p className="sdv-goal-list-empty">{t("spaceGoals.emptyList")}</p> : null}
      </section>;
    })}</div>
  </section>;
}

function GoalPlanControl({ goal, onUpdate }: { goal: LearningPath; onUpdate: (schedule: GoalSchedule) => void }) {
  const { t } = useT();
  const schedule = goal.schedule ?? { unit: "unscheduled" as const };
  const [unit, setUnit] = useState<GoalSchedule["unit"]>(schedule.unit);
  const [date, setDate] = useState("startDate" in schedule ? schedule.startDate : todayValue());
  function apply(nextUnit = unit, nextDate = date) {
    if (nextUnit === "unscheduled" || nextUnit === "life") onUpdate({ unit: nextUnit });
    else onUpdate({ unit: nextUnit, startDate: anchorForGoalUnit(nextUnit, nextDate) ?? nextDate });
  }
  return <div className="sdv-goal-plan"><select aria-label={t("spaceGoals.plan")} value={unit} onChange={(e) => { const next = e.target.value as GoalSchedule["unit"]; setUnit(next); apply(next, date); }}>{["unscheduled", "life", "year", "month", "week", "day"].map((value) => <option key={value} value={value}>{t(`goalDetail.schedule.${value}`)}</option>)}</select>{unit !== "unscheduled" && unit !== "life" ? <input aria-label={t("goalDetail.startDate")} type="date" value={date} onChange={(e) => { setDate(e.target.value); apply(unit, e.target.value); }} /> : null}</div>;
}
