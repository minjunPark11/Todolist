import type { FocusSession } from "../../types";

export function focusDate(ms: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Find a date boundary in instant space, including 23/25-hour DST days. */
function nextBoundary(ms: number, timezone: string): number {
  const date = focusDate(ms, timezone);
  let lo = ms,
    hi = ms + 48 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((hi + lo) / 2);
    if (focusDate(mid, timezone) === date) lo = mid;
    else hi = mid;
  }
  return hi;
}
export function recordedMs(
  session: FocusSession,
  from: string,
  to: string,
  timezone: string,
): number {
  if (session.status !== "completed" || session.mode !== "focus") return 0;
  let sum = 0;
  for (const segment of session.segments) {
    let cursor = Date.parse(segment.startAt);
    const end = Date.parse(segment.endAt);
    if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor)
      continue;
    while (cursor < end) {
      const date = focusDate(cursor, timezone);
      if (date > to) break;
      const partEnd = Math.min(end, nextBoundary(cursor, timezone));
      if (date >= from) sum += partEnd - cursor;
      cursor = partEnd;
    }
  }
  return sum;
}
export function focusRecords(
  sessions: FocusSession[],
  from: string,
  to: string,
  timezone: string,
  taskFilter = "all",
) {
  return sessions
    .filter(
      (s) =>
        s.status === "completed" &&
        s.mode === "focus" &&
        (taskFilter === "all" ||
          (taskFilter === "unassigned"
            ? s.taskId === null || s.taskId === ""
            : s.taskId === taskFilter)),
    )
    .map((session) => ({
      session,
      ms: recordedMs(session, from, to, timezone),
    }))
    .filter(
      ({ session, ms }) =>
        ms > 0 ||
        (!session.segments.length &&
          focusDate(
            Date.parse(session.endedAt || session.startedAt),
            timezone,
          ) >= from &&
          focusDate(
            Date.parse(session.endedAt || session.startedAt),
            timezone,
          ) <= to),
    )
    .sort(
      (a, b) =>
        (b.session.endedAt || b.session.endAt).localeCompare(
          a.session.endedAt || a.session.endAt,
        ) || a.session.id.localeCompare(b.session.id),
    );
}

/* ==========================================================================
   기간 (FOCUS_TABS_AND_RECORD_DESIGN.md §7.2.0)

   기간 칩이 범위의 **길이**를 정하고 날짜 내비가 그 범위를 **옮긴다**. 둘이
   함께 "지금 무엇을 보고 있나" 의 답 하나를 만들므로 계산도 한 함수가 한다.

   날짜 문자열로 셈하고 `Date.UTC` 로만 자정을 잡는다 — 로컬 자정을 쓰면
   실행 기기의 시간대가 결과를 흔들고, 그건 사용자가 고른 시간대와 다르다.
   ========================================================================== */
export type FocusPeriod = "today" | "week" | "month" | "all";

/** `YYYY-MM-DD` 를 UTC 자정의 ms 로. 그 반대는 `isoDate`. */
function utcNoon(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 고른 기간과 그 기간을 `offset` 만큼 옮긴 범위.
 *
 * `offset` 은 칸 단위다 — 하루, 한 주, 한 달. `all` 은 옮길 것이 없으므로
 * `offset` 을 무시한다 (§7.2.0 이 그때 날짜 내비를 비활성으로 두는 이유다).
 */
export function focusPeriodRange(
  period: FocusPeriod,
  offset: number,
  today: string,
): { from: string; to: string } {
  if (period === "all") return { from: "0000-01-01", to: "9999-12-31" };
  const day = 86400000;
  if (period === "today") {
    const at = isoDate(utcNoon(today) + offset * day);
    return { from: at, to: at };
  }
  if (period === "week") {
    const base = utcNoon(today) + offset * 7 * day;
    // 주는 월요일에 시작한다. `getUTCDay()` 의 일요일 0 을 7 로 밀어 계산한다.
    const monday = base - ((new Date(base).getUTCDay() + 6) % 7) * day;
    return { from: isoDate(monday), to: isoDate(monday + 6 * day) };
  }
  const [y, m] = today.split("-").map(Number);
  const first = Date.UTC(y, m - 1 + offset, 1);
  const last = Date.UTC(
    new Date(first).getUTCFullYear(),
    new Date(first).getUTCMonth() + 1,
    0,
  );
  return { from: isoDate(first), to: isoDate(last) };
}

/** 사용자의 시간대에서 그 순간이 하루의 몇 분째인지. */
export function focusMinuteOfDay(ms: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ms);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // 자정을 24 로 주는 구현이 있다. 하루의 시작은 0 이다.
  return (get("hour") % 24) * 60 + get("minute");
}

export interface FocusTimelineSpan {
  sessionId: string;
  /** 하루 축 위의 자리, 0~1. */
  start: number;
  end: number;
  seconds: number;
}

/**
 * 범위 안의 실행 구간을 **하루 24시간 축** 위에 접는다.
 *
 * 여러 날을 고르면 그 날들의 구간이 한 축 위에 겹쳐 놓인다 — 카드가 묻는 것이
 * "며칠에" 가 아니라 "하루 중 언제" 이기 때문이다. 자정을 넘는 구간은 두 조각으로
 * 갈라진다. 그러지 않으면 23:50→00:10 이 축을 거꾸로 가로지른다.
 */
export function focusTimelineSpans(
  sessions: FocusSession[],
  from: string,
  to: string,
  timezone: string,
): FocusTimelineSpan[] {
  const spans: FocusTimelineSpan[] = [];
  for (const session of sessions) {
    if (session.status !== "completed" || session.mode !== "focus") continue;
    for (const segment of session.segments) {
      let cursor = Date.parse(segment.startAt);
      const end = Date.parse(segment.endAt);
      if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor) continue;
      while (cursor < end) {
        const date = focusDate(cursor, timezone);
        if (date > to) break;
        const partEnd = Math.min(end, nextBoundary(cursor, timezone));
        if (date >= from) {
          const startMinute = focusMinuteOfDay(cursor, timezone);
          // 조각의 끝이 자정이면 그 날의 1440 분이다 — 다음 날의 0 분이 아니라.
          const endMinute =
            partEnd === nextBoundary(cursor, timezone)
              ? 1440
              : focusMinuteOfDay(partEnd, timezone);
          if (endMinute > startMinute)
            spans.push({
              sessionId: session.id,
              start: startMinute / 1440,
              end: endMinute / 1440,
              seconds: (partEnd - cursor) / 1000,
            });
        }
        cursor = partEnd;
      }
    }
  }
  // 긴 것이 먼저 자리를 갖는다 — 라벨을 그릴 때 그 순서가 필요하다 (§5.3.1).
  return spans.sort((a, b) => b.seconds - a.seconds || a.start - b.start);
}

/* ==========================================================================
   집중 패턴 (FOCUS_TABS_AND_RECORD_DESIGN.md §5.2)

   히트맵과 추이는 고른 기간이 아니라 **그 기간의 끝을 기준으로 한 최근 N**을
   본다 — 카드가 "최근 4주" 라고 말하기 때문이다. 날짜 내비를 옮기면 그 기준도
   함께 옮겨서, 화면의 모든 조각이 같은 순간을 이야기하게 둔다.
   ========================================================================== */

/** 날짜별 집중 초. 범위 밖은 담기지 않는다. */
export function focusDailyTotals(
  sessions: FocusSession[],
  from: string,
  to: string,
  timezone: string,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const session of sessions) {
    if (session.status !== "completed" || session.mode !== "focus") continue;
    for (const segment of session.segments) {
      let cursor = Date.parse(segment.startAt);
      const end = Date.parse(segment.endAt);
      if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor) continue;
      while (cursor < end) {
        const date = focusDate(cursor, timezone);
        if (date > to) break;
        const partEnd = Math.min(end, nextBoundary(cursor, timezone));
        if (date >= from) totals[date] = (totals[date] ?? 0) + (partEnd - cursor) / 1000;
        cursor = partEnd;
      }
    }
  }
  return totals;
}

/**
 * 히트맵의 날짜 격자. 월요일에 시작하는 주가 `weeks` 줄, 오래된 것이 위다.
 *
 * 마지막 줄은 `anchor` 가 든 주다 — 그 주의 남은 날들도 자리를 갖는다. 빈 칸이
 * 있어야 "아직 오지 않은 날" 과 "집중하지 않은 날" 이 같은 격자 위에서 구별된다.
 */
export function focusHeatmapWeeks(anchor: string, weeks: number): string[][] {
  const day = 86400000;
  const [y, m, d] = anchor.split("-").map(Number);
  const at = Date.UTC(y, m - 1, d);
  const monday = at - ((new Date(at).getUTCDay() + 6) % 7) * day;
  const rows: string[][] = [];
  for (let week = weeks - 1; week >= 0; week -= 1) {
    const start = monday - week * 7 * day;
    rows.push(
      Array.from({ length: 7 }, (_, i) => new Date(start + i * day).toISOString().slice(0, 10)),
    );
  }
  return rows;
}

/** 추이의 가로축. `anchor` 로 끝나는 `days` 일, 오래된 것이 먼저. */
export function focusTrendDays(anchor: string, days: number): string[] {
  const day = 86400000;
  const [y, m, d] = anchor.split("-").map(Number);
  const at = Date.UTC(y, m - 1, d);
  return Array.from({ length: days }, (_, i) =>
    new Date(at - (days - 1 - i) * day).toISOString().slice(0, 10),
  );
}

/**
 * 순차 램프의 단 (0~4). 0 은 "없음" 이고 1~4 가 램프다.
 *
 * 사분위가 아니라 **최댓값 대비 비율**이다. 사분위는 값이 몇 개 없을 때 한 칸의
 * 이동으로 전체가 다시 칠해지는데, 히트맵은 하루가 늘 때마다 색이 흔들리면
 * "꾸준한가" 를 읽을 수 없다.
 */
export function focusHeatLevel(seconds: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0 || max <= 0) return 0;
  const share = seconds / max;
  if (share <= 0.25) return 1;
  if (share <= 0.5) return 2;
  if (share <= 0.75) return 3;
  return 4;
}

export interface FocusTaskShare {
  taskId: string | null;
  seconds: number;
  /** 0~1. 이 기간 전체에서 이 작업이 차지한 몫. */
  share: number;
}

/** 작업별 집중 시간, 많은 것부터. */
export function focusByTask(
  rows: Array<{ session: FocusSession; ms: number }>,
): FocusTaskShare[] {
  const totals = new Map<string | null, number>();
  for (const { session, ms } of rows) {
    if (ms <= 0) continue;
    const key = session.taskId || null;
    totals.set(key, (totals.get(key) ?? 0) + ms / 1000);
  }
  const sum = [...totals.values()].reduce((n, v) => n + v, 0);
  return [...totals.entries()]
    .map(([taskId, seconds]) => ({ taskId, seconds, share: sum ? seconds / sum : 0 }))
    .sort((a, b) => b.seconds - a.seconds);
}
