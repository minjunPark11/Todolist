import type { RawPlannerData } from "../types";
import { addDays, todayValue } from "../utils/date";

const now = new Date().toISOString();
const today = todayValue();

export const sampleData: RawPlannerData = {
  projects: [
    {
      id: "project-fnirs",
      name: "fNIRS Thesis",
      description: "Consumer-grade fNIRS 기반 지속 인증 연구 및 논문 작성 프로젝트.",
      color: "#af52de",
      type: "project",
      dueDate: addDays(today, 62),
      pinned: true,
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "project-its",
      name: "ITS Presentation",
      description: "Conference presentation slides and script.",
      color: "#ff9500",
      type: "project",
      dueDate: addDays(today, 4),
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "project-todoapp",
      name: "Todo App Development",
      description: "Personal productivity app build.",
      color: "#34c759",
      type: "project",
      order: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "project-leetcode",
      name: "LeetCode Study",
      description: "Daily coding practice.",
      color: "#007aff",
      type: "project",
      order: 3,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "project-personal",
      name: "Personal",
      description: "Daily life and personal admin.",
      color: "#8e8e93",
      type: "area",
      order: 4,
      createdAt: now,
      updatedAt: now,
    },
  ],
  tasks: [
    // --- Inbox (unsorted capture) ---
    { id: "task-revise-its", title: "Revise ITS presentation script", status: "inbox", priority: "medium", tags: [], createdAt: addDays(today, 0) + "T09:30:00.000Z", updatedAt: now },
    { id: "task-vercel", title: "Fix Vercel branch setting", status: "inbox", priority: "high", tags: [], createdAt: addDays(today, 0) + "T09:20:00.000Z", updatedAt: now },
    { id: "task-claude-output", title: "Check Claude Code output", status: "inbox", priority: "none", tags: [], createdAt: addDays(today, 0) + "T08:40:00.000Z", updatedAt: now },
    { id: "task-grad-gown", title: "Email professor about graduation gown", status: "inbox", priority: "none", tags: [], createdAt: new Date(Date.now() - 2 * 60000).toISOString(), updatedAt: now },
    { id: "task-study-notes", title: "Organize study notes", status: "inbox", priority: "low", tags: ["study"], createdAt: new Date(Date.now() - 28 * 60000).toISOString(), updatedAt: now },

    // --- Focus today ---
    { id: "task-fnirs-preprocess", title: "Finish fNIRS data preprocessing", status: "todo", priority: "high", projectId: "project-fnirs", scheduledDate: today, isFocus: true, importance: "high", urgency: "high", tags: ["fnirs"], createdAt: now, updatedAt: now },

    // --- Due today ---
    { id: "task-its-slides", title: "ITS Presentation final slides", status: "todo", priority: "high", projectId: "project-its", dueDate: today, importance: "high", urgency: "high", tags: [], createdAt: now, updatedAt: now },
    { id: "task-reply-smith", title: "Reply to Prof. Smith's email", status: "todo", priority: "medium", dueDate: today, tags: [], createdAt: now, updatedAt: now },

    // --- Scheduled today ---
    { id: "task-leetcode-daily", title: "LeetCode – Daily Challenge", status: "todo", priority: "low", projectId: "project-leetcode", scheduledDate: today, tags: ["study"], createdAt: now, updatedAt: now },
    { id: "task-read-papers", title: "Read research papers", status: "todo", priority: "medium", projectId: "project-fnirs", scheduledDate: today, importance: "high", urgency: "low", tags: ["fnirs"], createdAt: now, updatedAt: now },

    // --- In progress ---
    { id: "task-impl-auth", title: "Implement authentication", status: "doing", priority: "high", projectId: "project-todoapp", importance: "high", urgency: "high", tags: [], createdAt: now, updatedAt: now },
    { id: "task-intro-chapter", title: "Write introduction chapter", status: "doing", priority: "medium", projectId: "project-fnirs", importance: "high", urgency: "low", tags: ["fnirs"], createdAt: now, updatedAt: now },

    // --- Waiting ---
    { id: "task-lab-data", title: "Data from lab (EEG experiment)", status: "waiting", priority: "medium", projectId: "project-fnirs", waitingReason: "Waiting for lab", tags: ["fnirs"], createdAt: now, updatedAt: now },

    // --- Overdue ---
    { id: "task-weekly-report", title: "Submit weekly report", status: "todo", priority: "high", projectId: "project-its", dueDate: addDays(today, -2), importance: "high", urgency: "high", tags: [], createdAt: now, updatedAt: now },

    // --- Done today ---
    { id: "task-meditation", title: "Morning meditation", status: "done", priority: "none", projectId: "project-personal", completedAt: today + "T07:30:00.000Z", tags: [], createdAt: now, updatedAt: now },
    { id: "task-review-notes", title: "Review yesterday's notes", status: "done", priority: "low", projectId: "project-fnirs", completedAt: today + "T08:00:00.000Z", tags: ["fnirs"], createdAt: now, updatedAt: now },
  ],
  subtasks: [
    {
      id: "subtask-auth-login",
      taskId: "task-impl-auth",
      title: "Build login form",
      completed: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "subtask-auth-session",
      taskId: "task-impl-auth",
      title: "Persist session token",
      completed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "subtask-fnirs-filter",
      taskId: "task-fnirs-preprocess",
      title: "Apply bandpass filter",
      completed: false,
      createdAt: now,
      updatedAt: now,
    },
  ],
  habits: [
    {
      id: "habit-water",
      name: "Drink water",
      description: "Keep a simple hydration streak.",
      frequency: "daily",
      targetCount: 1,
      color: "#0066cc",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "habit-walk",
      name: "Walk outside",
      description: "A short walk is enough.",
      frequency: "daily",
      targetCount: 1,
      color: "#1f9d55",
      createdAt: now,
      updatedAt: now,
    },
  ],
  habitLogs: [
    {
      id: "habit-log-water-today",
      habitId: "habit-water",
      date: today,
      completed: true,
    },
    {
      id: "habit-log-walk-yesterday",
      habitId: "habit-walk",
      date: addDays(today, -1),
      completed: true,
    },
  ],
  focusSessions: [
    {
      id: "focus-sample-today",
      taskId: "task-plan-week",
      mode: "focus",
      durationMinutes: 25,
      completed: true,
      startedAt: now,
      endedAt: now,
    },
  ],
  taskTemplates: [
    {
      id: "template-weekly-review",
      name: "Weekly review",
      title: "Run weekly review",
      description: "Clear inbox, check projects, and choose priorities.",
      priority: "medium",
      projectId: "project-personal",
      tags: ["planning"],
      notes: "Keep it under 30 minutes.",
      subtasks: ["Clear inbox", "Review projects", "Pick next priorities"],
      createdAt: now,
      updatedAt: now,
    },
  ],
  settings: {
    id: "settings",
    theme: "system",
    createdAt: now,
    updatedAt: now,
  },
};
