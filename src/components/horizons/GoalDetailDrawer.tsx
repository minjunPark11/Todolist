import { useEffect, useMemo, useRef, useState } from "react";
import type { GoalLink, GoalSchedule, LearningPath, Milestone, Project, Task } from "../../types";
import { connectedGoalTasks, goalProgress, isAllowedGoalUrl, MAX_GOAL_LINKS } from "../../domain/horizons/goalDetails";
import { platform } from "../../platform";
import { useT } from "../../i18n";

type GoalDraft = {
  goal: string;
  description: string;
  successCriteria: string;
  tags: string;
  links: GoalLink[];
  projectId: string;
  boardListId: string;
  scheduleUnit: GoalSchedule["unit"];
  scheduleDate: string;
  deadlineDate: string;
};

function toDraft(path: LearningPath): GoalDraft {
  const schedule = path.schedule ?? { unit: "unscheduled" as const };
  return {
    goal: path.goal,
    description: path.description ?? "",
    successCriteria: path.successCriteria ?? "",
    tags: (path.tags ?? []).join(", "),
    links: path.links ?? [],
    projectId: path.projectId ?? "",
    boardListId: path.boardListId ?? "",
    scheduleUnit: schedule.unit,
    scheduleDate: "startDate" in schedule ? schedule.startDate : "",
    deadlineDate: path.deadlineDate ?? "",
  };
}

function scheduleForUnit(unit: GoalSchedule["unit"], date: string): GoalSchedule {
  if (unit === "unscheduled" || unit === "life") return { unit };
  return date
    ? { unit, startDate: date }
    : { unit: "unscheduled" };
}

function scheduleFromDraft(draft: GoalDraft): GoalSchedule {
  return scheduleForUnit(draft.scheduleUnit, draft.scheduleDate);
}

export function GoalDetailDrawer({
  path,
  initialMilestoneId,
  projects,
  tasks,
  onClose,
  onUpdatePath,
  onDeletePath,
  onAddMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onCreateTaskFromMilestone,
  onOpenTask,
}: {
  path: LearningPath;
  initialMilestoneId?: string;
  projects: Project[];
  tasks: Task[];
  onClose: () => void;
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onDeletePath: (pathId: string) => void;
  onAddMilestone: (pathId: string, input: { title: string; doneCriteria?: string }) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onDeleteMilestone: (pathId: string, milestoneId: string) => void;
  onCreateTaskFromMilestone: (pathId: string, milestoneId: string, title: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(path));
  const [newLink, setNewLink] = useState({ title: "", url: "" });
  const [linkError, setLinkError] = useState("");
  const [newMilestone, setNewMilestone] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const connectedTasks = useMemo(() => connectedGoalTasks(path, tasks), [path, tasks]);
  const progress = useMemo(() => goalProgress(path, tasks), [path, tasks]);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    return () => previousFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!editing) setDraft(toDraft(path));
  }, [editing, path]);

  useEffect(() => {
    if (!initialMilestoneId) return;
    document.getElementById(`goal-milestone-${initialMilestoneId}`)?.scrollIntoView({ block: "nearest" });
  }, [initialMilestoneId]);

  function closeOrCancel() {
    if (editing) {
      setDraft(toDraft(path));
      setEditing(false);
      return;
    }
    onClose();
  }

  function save() {
    const goal = draft.goal.trim();
    if (!goal) return;
    onUpdatePath(path.id, {
      goal,
      description: draft.description,
      successCriteria: draft.successCriteria,
      tags: draft.tags.split(/[\n,]/).map((tag) => tag.trim()).filter(Boolean),
      links: draft.links,
      projectId: draft.projectId || undefined,
      boardListId: draft.boardListId || undefined,
      schedule: scheduleFromDraft(draft),
      deadlineDate: draft.deadlineDate || undefined,
    });
    setEditing(false);
  }

  function addLink() {
    const url = newLink.url.trim();
    if (!isAllowedGoalUrl(url)) {
      setLinkError(t("goalDetail.invalidLink"));
      return;
    }
    if (draft.links.length >= MAX_GOAL_LINKS) return;
    setDraft((current) => ({
      ...current,
      links: [...current.links, { id: crypto.randomUUID(), title: newLink.title.trim() || url, url }],
    }));
    setNewLink({ title: "", url: "" });
    setLinkError("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOrCancel();
      return;
    }
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return (
    <div className="goal-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeOrCancel()}>
      <aside
        ref={drawerRef}
        className="goal-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-detail-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="goal-drawer-head">
          <div className="goal-drawer-title">
            <button
              type="button"
              className={`hz-check${path.completedAt ? " checked" : ""}`}
              aria-label={path.completedAt ? t("horizons.markNotDone") : t("horizons.markDone")}
              onClick={() => onUpdatePath(path.id, { completedAt: path.completedAt ? undefined : new Date().toISOString() })}
            >
              {path.completedAt ? "✓" : ""}
            </button>
            <div>
              <span>{t("goalDetail.eyebrow")}</span>
              <h2 id="goal-detail-title">{path.goal}</h2>
            </div>
          </div>
          <div className="goal-drawer-head-actions">
            {editing ? (
              <><button type="button" onClick={closeOrCancel}>{t("common.cancel")}</button><button type="button" className="primary" onClick={save}>{t("common.save")}</button></>
            ) : <button type="button" onClick={() => setEditing(true)}>{t("common.edit")}</button>}
            <button type="button" aria-label={t("common.close")} onClick={closeOrCancel}>×</button>
          </div>
        </header>

        <div className="goal-drawer-body">
          <section className="goal-progress" aria-label={t("goalDetail.progress")}>
            <div><strong>{progress.milestonesDone}/{progress.milestonesTotal}</strong><span>{t("goalDetail.milestones")}</span></div>
            <div><strong>{progress.tasksDone}/{progress.tasksTotal}</strong><span>{t("goalDetail.connectedTasks")}</span></div>
          </section>

          {editing ? (
            <section className="goal-detail-form">
              <label>{t("goalDetail.title")}<input value={draft.goal} maxLength={300} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} /></label>
              <label>{t("horizons.board")}<select value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value, boardListId: "" })}><option value="">{t("horizons.noBoard")}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              {draft.projectId ? <label>{t("spaceGoals.status")}<select value={draft.boardListId} onChange={(e) => setDraft({ ...draft, boardListId: e.target.value })}><option value="">{t("spaceGoals.unsorted")}</option>{(projects.find((project) => project.id === draft.projectId)?.boardLists ?? []).filter((list) => !list.archivedAt).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label> : null}
              <div className="goal-detail-grid">
                <label>{t("goalDetail.period")}<select value={draft.scheduleUnit} onChange={(e) => setDraft({ ...draft, scheduleUnit: e.target.value as GoalSchedule["unit"] })}>{["unscheduled", "life", "year", "month", "week", "day"].map((unit) => <option key={unit} value={unit}>{t(`goalDetail.schedule.${unit}`)}</option>)}</select></label>
                {!['unscheduled', 'life'].includes(draft.scheduleUnit) ? <label>{t("goalDetail.startDate")}<input type="date" value={draft.scheduleDate} onChange={(e) => setDraft({ ...draft, scheduleDate: e.target.value })} /></label> : null}
                <label>{t("common.dueDate")}<input type="date" value={draft.deadlineDate} onChange={(e) => setDraft({ ...draft, deadlineDate: e.target.value })} /></label>
              </div>
              <label>{t("common.description")}<textarea maxLength={4000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              <label>{t("goalDetail.successCriteria")}<textarea maxLength={2000} value={draft.successCriteria} onChange={(e) => setDraft({ ...draft, successCriteria: e.target.value })} /></label>
              <label>{t("goalDetail.tags")}<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder={t("goalDetail.tagsHint")} /></label>

              <div className="goal-links-editor">
                <strong>{t("goalDetail.links")}</strong>
                {draft.links.map((link) => <div key={link.id} className="goal-link-row"><span>{link.title}</span><button type="button" onClick={() => setDraft({ ...draft, links: draft.links.filter((item) => item.id !== link.id) })}>×</button></div>)}
                {draft.links.length < MAX_GOAL_LINKS ? <div className="goal-link-add"><input value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })} placeholder={t("goalDetail.linkTitle")} /><input value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} placeholder="https://…" /><button type="button" onClick={addLink}>{t("common.add")}</button></div> : null}
                {linkError ? <p className="goal-field-error">{linkError}</p> : null}
              </div>
            </section>
          ) : (
            <section className="goal-detail-read">
              <div className="goal-detail-facts"><span>{projects.find((project) => project.id === path.projectId)?.name ?? t("horizons.noBoard")}</span><span>{t(`goalDetail.schedule.${path.schedule?.unit ?? "unscheduled"}`)}</span>{path.deadlineDate ? <span>{t("goalDetail.due", { date: path.deadlineDate })}</span> : null}</div>
              <section><h3>{t("common.description")}</h3><p>{path.description || t("goalDetail.emptyDescription")}</p></section>
              <section><h3>{t("goalDetail.successCriteria")}</h3><p>{path.successCriteria || t("goalDetail.emptySuccess")}</p></section>
              {path.tags?.length ? <div className="goal-tags">{path.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
              {path.links?.length ? <section><h3>{t("goalDetail.links")}</h3><div className="goal-link-list">{path.links.map((link) => <button type="button" key={link.id} onClick={() => platform.openExternal(link.url)}>{link.title} ↗</button>)}</div></section> : null}
            </section>
          )}

          <section className="goal-detail-section">
            <h3>{t("goalDetail.milestones")}</h3>
            <form className="goal-milestone-add" onSubmit={(event) => { event.preventDefault(); const title = newMilestone.trim(); if (!title) return; onAddMilestone(path.id, { title }); setNewMilestone(""); }}><input value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} placeholder={t("horizons.milestonePlaceholder")} /><button type="submit">{t("common.add")}</button></form>
            <div className="goal-milestones">{path.milestones.map((milestone) => <MilestoneRow key={milestone.id} pathId={path.id} milestone={milestone} highlighted={milestone.id === initialMilestoneId} onUpdate={onUpdateMilestone} onDelete={onDeleteMilestone} onMaterialise={onCreateTaskFromMilestone} />)}</div>
          </section>

          <section className="goal-detail-section">
            <h3>{t("goalDetail.connectedTasks")}</h3>
            {connectedTasks.length ? <div className="goal-task-list">{connectedTasks.map((task) => <button type="button" key={task.id} onClick={() => onOpenTask(task.id)}><span className={task.status === "done" ? "done" : ""}>{task.title}</span><small>{t(`status.${task.status}`)}{task.dueDate ? ` · ${task.dueDate}` : ""}</small></button>)}</div> : <p className="goal-empty">{t("goalDetail.noTasks")}</p>}
          </section>

          <footer className="goal-danger-zone">
            {confirmDelete ? <><span>{t("goalDetail.deleteConfirm")}</span><button type="button" className="danger" onClick={() => { onDeletePath(path.id); onClose(); }}>{t("common.delete")}</button><button type="button" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</button></> : <button type="button" className="danger-text" onClick={() => setConfirmDelete(true)}>{t("goalDetail.deleteGoal")}</button>}
          </footer>
        </div>
      </aside>
    </div>
  );
}

function MilestoneRow({ pathId, milestone, highlighted, onUpdate, onDelete, onMaterialise }: {
  pathId: string; milestone: Milestone; highlighted: boolean;
  onUpdate: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onDelete: (pathId: string, milestoneId: string) => void;
  onMaterialise: (pathId: string, milestoneId: string, title: string) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [criteria, setCriteria] = useState(milestone.doneCriteria);
  const initialSchedule = milestone.schedule;
  const [scheduleUnit, setScheduleUnit] = useState<"inherit" | GoalSchedule["unit"]>(initialSchedule?.unit ?? "inherit");
  const [scheduleDate, setScheduleDate] = useState(initialSchedule && "startDate" in initialSchedule ? initialSchedule.startDate : "");
  const [deadlineDate, setDeadlineDate] = useState(milestone.deadlineDate ?? "");
  const [deleting, setDeleting] = useState(false);
  const done = Boolean(milestone.completedAt);
  return <article id={`goal-milestone-${milestone.id}`} className={`goal-milestone${highlighted ? " highlighted" : ""}`}>
    <button type="button" className={`hz-check${done ? " checked" : ""}`} onClick={() => onUpdate(pathId, milestone.id, { completedAt: done ? undefined : new Date().toISOString() })}>{done ? "✓" : ""}</button>
    <div>{editing ? <>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={t("goalDetail.doneCriteria")} />
      <div className="goal-milestone-timing">
        <select value={scheduleUnit} onChange={(e) => setScheduleUnit(e.target.value as "inherit" | GoalSchedule["unit"])}>
          <option value="inherit">{t("goalDetail.schedule.inherit")}</option>
          {["life", "year", "month", "week", "day"].map((unit) => <option key={unit} value={unit}>{t(`goalDetail.schedule.${unit}`)}</option>)}
        </select>
        {!['inherit', 'life'].includes(scheduleUnit) ? <input aria-label={t("goalDetail.startDate")} type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} /> : null}
        <input aria-label={t("common.dueDate")} type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
      </div>
      <div className="goal-milestone-actions"><button type="button" onClick={() => {
        if (title.trim()) onUpdate(pathId, milestone.id, {
          title: title.trim(), doneCriteria: criteria.trim(),
          schedule: scheduleUnit === "inherit" ? undefined : scheduleForUnit(scheduleUnit, scheduleDate),
          deadlineDate: deadlineDate || undefined,
        });
        setEditing(false);
      }}>{t("common.save")}</button><button type="button" onClick={() => setEditing(false)}>{t("common.cancel")}</button></div>
    </> : <><strong>{milestone.title}</strong>{milestone.doneCriteria ? <p>{milestone.doneCriteria}</p> : null}<div className="goal-milestone-actions"><button type="button" onClick={() => setEditing(true)}>{t("common.edit")}</button><button type="button" onClick={() => onMaterialise(pathId, milestone.id, milestone.title)}>{t("horizons.materialise")}</button>{deleting ? <><button type="button" className="danger" onClick={() => onDelete(pathId, milestone.id)}>{t("common.confirm")}</button><button type="button" onClick={() => setDeleting(false)}>{t("common.cancel")}</button></> : <button type="button" className="danger-text" onClick={() => setDeleting(true)}>{t("common.delete")}</button>}</div></>}</div>
  </article>;
}
