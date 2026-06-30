export type TaskStatus = "todo" | "in_progress" | "waiting" | "blocked" | "done";
export type TaskPriority = "none" | "low" | "medium" | "high";
export type TaskLevel = "high" | "low";
export type RepeatType = "none" | "daily" | "weekly" | "monthly";
export type HabitFrequency = "daily" | "weekly";
export type FocusMode = "focus" | "short_break" | "long_break";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  projectId: string;
  tags: string[];
  notes: string;
  importance: TaskLevel;
  urgency: TaskLevel;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  blockedByTaskId: string;
  repeatType: RepeatType;
  repeatInterval: number;
  repeatDays: number[];
  repeatEndDate: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Habit {
  id: string;
  name: string;
  description: string;
  frequency: HabitFrequency;
  targetCount: number;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
}

export interface FocusSession {
  id: string;
  taskId: string;
  mode: FocusMode;
  durationMinutes: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  priority: TaskPriority;
  projectId: string;
  tags: string[];
  notes: string;
  subtasks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlannerSettings {
  id: string;
  theme: "system" | "light" | "dark";
  createdAt: string;
  updatedAt: string;
}

export interface PlannerData {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  taskTemplates: TaskTemplate[];
  settings: PlannerSettings;
}

export type PageId =
  | "today"
  | "inbox"
  | "tasks"
  | "board"
  | "calendar"
  | "matrix"
  | "projects"
  | "dashboard"
  | "habits"
  | "focus"
  | "settings";

export interface TaskDraft {
  title: string;
  description?: string;
  dueDate?: string;
  projectId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  tags?: string[];
  notes?: string;
  importance?: TaskLevel;
  urgency?: TaskLevel;
  blockedByTaskId?: string;
  repeatType?: RepeatType;
  repeatInterval?: number;
  repeatDays?: number[];
  repeatEndDate?: string;
}
