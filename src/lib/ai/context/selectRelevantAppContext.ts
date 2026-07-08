// Relevance selection half of the AI context pipeline: turns the full app
// dataset into a bounded "context pack" (RelevantAppContext) of the records
// most likely to matter for the current request. Serialization to prompt text
// lives in summarizeContextForPrompt.ts; buildAiContext.ts composes the two.
// The AI Assistant MVP can call this directly to get structured (not yet
// stringified) context, or swap the selection strategy per intent.
import type {
  AppSettings,
  ConceptNote,
  FocusSession,
  Habit,
  HabitLog,
  PageId,
  PlannerSettings,
  Project,
  RecentItem,
  StudyTopic,
  Subtask,
  Task,
  TaskTemplate,
} from "../../../types";
import { addDays, todayValue } from "../../../utils/date";
import { buildPlanVsActual } from "../../../utils/planVsActual";
import type { AgentIntent } from "../agent/intent";
import { AI_CONTEXT_LIMITS } from "./limits";

export type AiContextInput = {
  currentPage: PageId;
  userId?: string;
  intent?: AgentIntent;
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  studyTopics: StudyTopic[];
  conceptNotes: ConceptNote[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  activeSessionId: string;
  taskTemplates: TaskTemplate[];
  recentItems: RecentItem[];
  settings: PlannerSettings;
  appSettings: AppSettings;
  calendarContextText?: string;
};

// Compact, JSON-serializable slice of app data selected for one AI request.
// Slim records are Record<string, unknown> because omitEmpty drops unset
// fields; the prompt header explains that omission to the model.
export type RelevantAppContext = {
  currentPage: PageId;
  currentUserId: string;
  intent: AgentIntent;
  date: string;
  limits: typeof AI_CONTEXT_LIMITS;
  summary: Record<string, number>;
  planVsActualLast14Days: ReturnType<typeof buildPlanVsActual>;
  data: {
    tasks: Record<string, unknown>[];
    projects: Record<string, unknown>[];
    subtasks: Record<string, unknown>[];
    studyTopics: Record<string, unknown>[];
    conceptNotes: Record<string, unknown>[];
    habits: Record<string, unknown>[];
    habitLogs: Record<string, unknown>[];
    focusSessions: Record<string, unknown>[];
    activeSessionId: string;
    taskTemplates: Record<string, unknown>[];
    recentItems: RecentItem[];
    settings: PlannerSettings;
    appSettings: AppSettings;
  };
};

function trimField(text: string) {
  const max = AI_CONTEXT_LIMITS.textFieldCharacters;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Drops falsy and empty-array fields so records serialize compactly; the
// context header tells the model that omitted fields mean unset/false/empty.
function omitEmpty(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === undefined || value === null || value === "" || value === false || value === 0) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

function slimTask(task: Task) {
  return omitEmpty({
    id: task.id,
    title: task.title,
    description: trimField(task.description),
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    startTime: task.startTime,
    endTime: task.endTime,
    projectId: task.projectId,
    tags: task.tags,
    notes: trimField(task.notes),
    importance: task.importance,
    urgency: task.urgency,
    isFocus: task.isFocus,
    estimatedMinutes: task.estimatedMinutes,
    isSomeday: task.isSomeday,
    waitingReason: trimField(task.waitingReason),
    blockedByTaskId: task.blockedByTaskId,
    repeatType: task.repeatType === "none" ? "" : task.repeatType,
    completedAt: task.completedAt,
  });
}

// Nearest future date the task is actionable on (scheduled or due), "" if none.
function nextDateOf(task: Task, today: string): string {
  return [task.scheduledDate, task.dueDate].filter((date) => date && date > today).sort()[0] ?? "";
}

// Bucketed relevance selection per the limits: overdue, today, upcoming,
// recently completed, then recently touched active tasks — deduped in that
// priority order. Dumping every task blew past the local model's context
// window as soon as real data accumulated.
function selectTasks(tasks: Task[], today: string): Task[] {
  const live = tasks.filter((task) => !task.deletedAt && task.status !== "archived");
  const active = live.filter((task) => task.status !== "done");

  const overdue = active
    .filter((task) => task.dueDate && task.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, AI_CONTEXT_LIMITS.overdueTasks);
  const todays = active
    .filter((task) => task.scheduledDate === today || task.dueDate === today)
    .slice(0, AI_CONTEXT_LIMITS.todayTasks);
  const upcoming = active
    .filter((task) => nextDateOf(task, today) !== "")
    .sort((a, b) => nextDateOf(a, today).localeCompare(nextDateOf(b, today)))
    .slice(0, AI_CONTEXT_LIMITS.upcomingTasks);
  const recentDone = live
    .filter((task) => task.status === "done" && task.completedAt.slice(0, 10) >= addDays(today, -6))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, AI_CONTEXT_LIMITS.recentDoneTasks);

  const picked = new Map<string, Task>();
  for (const task of [...overdue, ...todays, ...upcoming, ...recentDone]) {
    picked.set(task.id, task);
  }

  const otherActive = active
    .filter((task) => !picked.has(task.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, AI_CONTEXT_LIMITS.otherActiveTasks);
  for (const task of otherActive) {
    picked.set(task.id, task);
  }

  return [...picked.values()];
}

export function selectRelevantAppContext(input: AiContextInput): RelevantAppContext {
  const today = todayValue();
  const intent = input.intent ?? "general_chat";
  const activityCutoff = addDays(today, -(AI_CONTEXT_LIMITS.activityWindowDays - 1));

  const tasks = selectTasks(input.tasks, today);
  const taskIds = new Set(tasks.map((task) => task.id));

  return {
    currentPage: input.currentPage,
    currentUserId: input.userId || "local-user",
    intent,
    date: today,
    limits: AI_CONTEXT_LIMITS,
    summary: {
      taskCount: input.tasks.length,
      projectCount: input.projects.length,
      subtaskCount: input.subtasks.length,
      studyTopicCount: input.studyTopics.length,
      conceptNoteCount: input.conceptNotes.length,
      habitCount: input.habits.length,
      habitLogCount: input.habitLogs.length,
      focusSessionCount: input.focusSessions.length,
      taskTemplateCount: input.taskTemplates.length,
      recentItemCount: input.recentItems.length,
    },
    // Planned blocks vs. focus-measured execution, precomputed for the last
    // 14 days so the model can compare/analyze without re-deriving it from
    // raw sessions.
    planVsActualLast14Days: buildPlanVsActual(
      input.tasks,
      input.focusSessions,
      addDays(today, -13),
      today,
    ),
    data: {
      tasks: tasks.map(slimTask),
      projects: input.projects
        .filter((project) => project.status !== "archived")
        .slice(0, AI_CONTEXT_LIMITS.projects)
        .map((project) =>
          omitEmpty({
            id: project.id,
            name: project.name,
            description: trimField(project.description),
            type: project.type,
            status: project.status,
            dueDate: project.dueDate,
            pinned: project.pinned,
          }),
        ),
      subtasks: input.subtasks
        .filter((subtask) => taskIds.has(subtask.taskId))
        .slice(0, AI_CONTEXT_LIMITS.subtasks)
        .map((subtask) =>
          omitEmpty({
            id: subtask.id,
            taskId: subtask.taskId,
            title: subtask.title,
            completed: subtask.completed,
          }),
        ),
      studyTopics: input.studyTopics
        .filter((topic) => topic.status !== "archived")
        .slice(0, AI_CONTEXT_LIMITS.studyTopics)
        .map((topic) =>
          omitEmpty({
            id: topic.id,
            name: topic.name,
            category: topic.category,
            description: trimField(topic.description),
            status: topic.status,
          }),
        ),
      conceptNotes: [...input.conceptNotes]
        .filter((note) => !note.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, AI_CONTEXT_LIMITS.recentNotes)
        .map((note) =>
          omitEmpty({
            id: note.id,
            topicId: note.topicId,
            title: note.title,
            noteType: note.noteType,
            summary: trimField(note.summary),
            difficulty: note.difficulty,
            reviewStatus: note.reviewStatus,
            nextReviewDate: note.nextReviewDate,
            tags: note.tags,
            updatedAt: note.updatedAt,
          }),
        ),
      habits: input.habits.slice(0, AI_CONTEXT_LIMITS.habits).map((habit) =>
        omitEmpty({
          id: habit.id,
          name: habit.name,
          description: trimField(habit.description),
          frequency: habit.frequency,
          targetCount: habit.targetCount,
        }),
      ),
      habitLogs: input.habitLogs
        .filter((log) => log.date >= activityCutoff)
        .map((log) => omitEmpty({ habitId: log.habitId, date: log.date, completed: log.completed })),
      focusSessions: [...input.focusSessions]
        .filter((session) => (session.startedAt || session.startAt).slice(0, 10) >= activityCutoff)
        .sort((a, b) => (b.startedAt || b.startAt).localeCompare(a.startedAt || a.startAt))
        .slice(0, AI_CONTEXT_LIMITS.focusSessions)
        .map((session) =>
          omitEmpty({
            id: session.id,
            taskId: session.taskId,
            title: session.title,
            mode: session.mode,
            status: session.status,
            durationMinutes: session.durationMinutes,
            accumulatedSeconds: session.accumulatedSeconds,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            projectName: session.projectName,
            focusNote: trimField(session.focusNote),
          }),
        ),
      activeSessionId: input.activeSessionId,
      taskTemplates: input.taskTemplates.slice(0, AI_CONTEXT_LIMITS.taskTemplates).map((template) =>
        omitEmpty({
          id: template.id,
          name: template.name,
          title: template.title,
          priority: template.priority,
          tags: template.tags,
        }),
      ),
      recentItems: input.recentItems.slice(0, AI_CONTEXT_LIMITS.recentItems),
      settings: input.settings,
      appSettings: input.appSettings,
    },
  };
}
