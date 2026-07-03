import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type { ConceptNote, Project, Task } from "../types";

export type CalendarShareStatus = "unavailable" | "idle" | "loading" | "saving" | "ready" | "error";

export interface CalendarShareState {
  enabled: boolean;
  token: string;
  url: string;
  updatedAt: string;
  status: CalendarShareStatus;
  error: string;
}

export interface SharedCalendarEvent {
  uid: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
}

export interface CalendarShareSnapshot {
  version: 1;
  generatedAt: string;
  events: SharedCalendarEvent[];
}

export const emptyCalendarShareState: CalendarShareState = {
  enabled: false,
  token: "",
  url: "",
  updatedAt: "",
  status: isSupabaseConfigured ? "idle" : "unavailable",
  error: "",
};

type ShareRow = {
  token: string;
  enabled: boolean;
  updated_at: string | null;
};

export function createShareToken() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getCalendarShareUrl(token: string) {
  if (!token) return "";
  return `${window.location.origin}/api/calendar/${token}.ics`;
}

export function buildCalendarShareSnapshot(input: {
  tasks: Task[];
  projects: Project[];
  conceptNotes: ConceptNote[];
}): CalendarShareSnapshot {
  const events: SharedCalendarEvent[] = [];

  input.tasks.forEach((task) => {
    if (!task.title || task.status === "archived") return;
    if (isDate(task.scheduledDate)) {
      events.push({
        uid: `task-scheduled-${task.id}`,
        title: task.title,
        date: task.scheduledDate,
        startTime: isTime(task.startTime) ? task.startTime : undefined,
        endTime: isTime(task.endTime) ? task.endTime : undefined,
      });
    }
    if (isDate(task.dueDate) && task.dueDate !== task.scheduledDate) {
      events.push({
        uid: `task-due-${task.id}`,
        title: `마감: ${task.title}`,
        date: task.dueDate,
      });
    }
  });

  input.projects.forEach((project) => {
    if (!project.name || !isDate(project.dueDate)) return;
    const dueDate = project.dueDate;
    events.push({
      uid: `project-due-${project.id}`,
      title: `프로젝트 마감: ${project.name}`,
      date: dueDate,
    });
  });

  input.conceptNotes.forEach((note) => {
    if (!note.title || !isDate(note.nextReviewDate)) return;
    const nextReviewDate = note.nextReviewDate;
    events.push({
      uid: `review-${note.id}`,
      title: `복습: ${note.title}`,
      date: nextReviewDate,
    });
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    events,
  };
}

export async function loadCalendarShare(): Promise<CalendarShareState> {
  if (!supabase) return emptyCalendarShareState;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ...emptyCalendarShareState, status: "unavailable", error: "로그인이 필요합니다." };
  }

  const { data, error } = await supabase
    .from("calendar_shares")
    .select("token, enabled, updated_at")
    .eq("user_id", userData.user.id)
    .maybeSingle<ShareRow>();

  if (error) throw new Error(formatCalendarShareError(error));
  if (!data) return { ...emptyCalendarShareState, status: "idle" };

  return {
    enabled: Boolean(data.enabled),
    token: data.token,
    url: getCalendarShareUrl(data.token),
    updatedAt: data.updated_at ?? "",
    status: "ready",
    error: "",
  };
}

export async function publishCalendarShare(input: {
  token: string;
  enabled: boolean;
  snapshot: CalendarShareSnapshot;
}): Promise<CalendarShareState> {
  if (!supabase) throw new Error("Supabase 설정이 필요합니다.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("로그인이 필요합니다.");

  const now = new Date().toISOString();
  const { error } = await supabase.from("calendar_shares").upsert(
    {
      user_id: userData.user.id,
      token: input.token,
      enabled: input.enabled,
      data: input.snapshot,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(formatCalendarShareError(error));

  return {
    enabled: input.enabled,
    token: input.token,
    url: getCalendarShareUrl(input.token),
    updatedAt: now,
    status: "ready",
    error: "",
  };
}

export async function disableCalendarShare(token: string): Promise<CalendarShareState> {
  if (!supabase) throw new Error("Supabase 설정이 필요합니다.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("로그인이 필요합니다.");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("calendar_shares")
    .update({ enabled: false, updated_at: now })
    .eq("user_id", userData.user.id);
  if (error) throw new Error(formatCalendarShareError(error));

  return {
    enabled: false,
    token,
    url: getCalendarShareUrl(token),
    updatedAt: now,
    status: "ready",
    error: "",
  };
}

function isDate(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isTime(value?: string): value is string {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

function formatCalendarShareError(error: { message?: string; code?: string; details?: string }) {
  const message = error.message || error.details || "공유 링크 작업에 실패했습니다.";
  if (error.code === "42P01" || message.includes("calendar_shares") || message.includes("does not exist")) {
    return "공유 테이블이 아직 없습니다. Supabase에 003_calendar_shares.sql 마이그레이션을 적용해주세요.";
  }
  if (message.toLowerCase().includes("row-level security")) {
    return "공유 테이블 권한 정책이 맞지 않습니다. calendar_shares RLS 정책을 확인해주세요.";
  }
  return message;
}
