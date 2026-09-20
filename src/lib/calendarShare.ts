import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type { List, Task } from "../types";
import { isTaskActive } from "../domain/tasks/scopeQuery";

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

/**
 * 이 기기를 떠나는 것 전부.
 *
 * 나가는 것은 **제목 · 날짜 · 시각** 셋뿐이다. 설명도, 체크리스트도, 태그도,
 * 어느 목록에 있는지도 실리지 않는다 — 링크를 받은 사람은 구독자이지
 * 동료가 아니다.
 *
 * 나가는 자격은 `isTaskActive` 다. 전에는 `isTaskAlive` 였고, 그 둘의 차이가
 * 이 파일의 문제였다: `isTaskAlive` 는 할 일 자신의 상태만 보므로
 * **휴지통에 버린 목록과 보관한 목록의 할 일이 그대로 나간다** [실측].
 * 실제로 새지는 않았다 — 부르는 쪽이 `isTaskActive` 로 한 번 거른 목록을
 * 넘기고 있었기 때문이다. 그러나 무엇이 밖으로 나가는지를 정하는 파일이
 * 자기보다 약한 규칙을 들고 있고, 맞는 규칙은 부르는 쪽에만 있었다.
 * 부르는 쪽이 하나 더 생기거나 그 한 줄이 바뀌는 순간이 곧 사고다.
 *
 * 그래서 규칙을 여기로 가져온다. 목록을 함께 받는 것이 그 값이다 — 목록을
 * 버리는 것은 그 안의 할 일에 아무것도 쓰지 않으므로(§6.56), 할 일만 봐서는
 * 알 수 없다.
 *
 * 완료한 것은 나간다. 끝난 일도 그날 있었던 일이고, 달력은 그것을 적는
 * 물건이다 (`taskState.isTaskAlive` 의 주석이 같은 것을 말한다).
 */
export function buildCalendarShareSnapshot(input: { tasks: Task[]; lists: List[] }): CalendarShareSnapshot {
  const events: SharedCalendarEvent[] = [];

  input.tasks.forEach((task) => {
    if (!task.title || !isTaskActive(task, input.lists)) return;
    // One event per task. This used to emit two — a timed block on the work
    // day and a separate all-day deadline marker — because the record carried
    // both dates. It carries one now (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7
    // Phase 11), and emitting the same day twice under two titles would put a
    // duplicate in every subscriber's calendar.
    if (isDate(task.dueDate)) {
      events.push({
        uid: `task-scheduled-${task.id}`,
        title: task.title,
        date: task.dueDate,
        startTime: isTime(task.startTime) ? task.startTime : undefined,
        endTime: isTime(task.endTime) ? task.endTime : undefined,
      });
    }
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
  // 스냅샷도 같이 지운다.
  //
  // `enabled: false` 만 쓰면 행은 그대로 남는다 — 끄기 전에 마지막으로 올린
  // 제목·날짜 묶음을 통째로 들고. 주소는 그 순간 404 가 되므로
  // (`functions/calendar/[token].ts` 가 `enabled=is.true` 로 찾는다) 새지는
  // 않지만, 남겨둘 이유도 없다: 다시 켜는 길은 `publishCurrentCalendarShare`
  // 하나뿐이고 그것은 언제나 새 스냅샷을 올린다. 즉 이 `data` 는 두 번 다시
  // 읽히지 않는 사본이다.
  //
  // 이 파일은 취소에 대해 이미 같은 태도를 적어뒀다 — "취소는 곧바로 들어야
  // 한다"(캐시 헤더). 껐는데 내용이 그대로 남아 있는 것은 그 태도와 어긋난다.
  const { error } = await supabase
    .from("calendar_shares")
    .update({ enabled: false, data: {}, updated_at: now })
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
