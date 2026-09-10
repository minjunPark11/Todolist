import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  FocusFlow,
  FocusSession,
  List,
  Tag,
  Task,
  TaskTag,
} from "../types";
import { tagNamesForTask } from "../domain/tags/tags";
import { isTaskOpen } from "../domain/tasks/taskState";
import {
  breakRemaining,
  DEFAULT_POMODORO,
  focusDisplaySeconds,
  sanitizePomodoro,
  type FocusCommand,
} from "../domain/focus/engine";
import {
  focusDate,
  focusRecords,
  focusPeriodRange,
  focusTimelineSpans,
  focusDailyTotals,
  focusHeatmapWeeks,
  focusTrendDays,
  focusHeatLevel,
  focusByTask,
  type FocusPeriod,
} from "../domain/focus/records";
import { visibleQueue } from "../domain/focus/queue";
import { OverlayScrollbar } from "./common/OverlayScrollbar";
import { formatFocusDuration, useNowTick } from "../lib/focusTimer";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { platform } from "../platform";
import { useT } from "../i18n";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface FocusPageProps {
  tasks: Task[];
  tags: Tag[];
  taskTags: TaskTag[];
  lists: List[];
  focusSessions: FocusSession[];
  activeSession: FocusSession | null;
  flow: FocusFlow | null;
  settings: FocusUserSettings;
  timezone: string;
  command: (command: FocusCommand) => boolean;
  ready: boolean;
  error: string;
  onRetry: () => void;
  onCompleteTask: (id: string) => void;
  onOpenTask: (id: string) => void;
  /** 집중할 순서 — 저장된 taskId 배열 (FOCUS_LAYOUT_DESIGN.md Phase 2). */
  queue: string[];
  onAddToQueue: (taskId: string) => void;
  onRemoveFromQueue: (taskId: string) => void;
  onMoveInQueue: (taskId: string, targetIndex: number) => void;
  onUpdateSettings: (patch: Partial<FocusUserSettings>) => void;
}
export function FocusIcon({
  name,
}: {
  name:
    | "play"
    | "pause"
    | "stop"
    | "search"
    | "expand"
    | "mini"
    | "records"
    | "note"
    | "clock"
    | "more"
    | "close"
    | "chevron";
}) {
  const paths: Record<typeof name, ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    mini: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M13 13h5v4h-5z" />
      </>
    ),
    records: <path d="M4 20h17M7 16V9m5 7V4m5 12v-6" />,
    note: (
      <>
        <path d="m5 16-1 4 4-1L20 7l-3-3Z" />
        <path d="m14 7 3 3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function FocusDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div
      className="focus-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="focus-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <FocusIcon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function FocusPage({
  queue,
  onAddToQueue,
  onRemoveFromQueue,
  onMoveInQueue,
  tasks,
  tags,
  taskTags,
  lists,
  focusSessions,
  activeSession,
  flow,
  settings,
  timezone,
  command,
  ready,
  error,
  onRetry,
  onCompleteTask,
  onOpenTask,
  onUpdateSettings,
}: FocusPageProps) {
  const { lang } = useT();
  const l = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [view, setView] = useState<"timer" | "records">("timer");
  const [immersive, setImmersive] = useState(false);
  const wasImmersive = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (wasImmersive.current && !immersive) root.current?.querySelector<HTMLButtonElement>("[data-immersive-toggle]")?.focus();
    wasImmersive.current = immersive;
  }, [immersive]);
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">("stopwatch");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resultId, setResultId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [gapEnd, setGapEnd] = useState("");
  const [showGap, setShowGap] = useState(false);
  const [message, setMessage] = useState("");
  const today = focusDate(Date.now(), timezone);
  /* 기간 칩이 길이를 정하고 날짜 내비가 그것을 옮긴다 (§7.2.0). `from`/`to` 를
     각각 들고 있던 자리다 — 두 날짜를 따로 두면 "이번 주" 같은 한 덩어리를
     사용자가 손으로 맞춰야 했다. */
  const [period, setPeriod] = useState<FocusPeriod>("today");
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(20);
  const { from, to } = useMemo(
    () => focusPeriodRange(period, offset, today),
    [period, offset, today],
  );
  const now = useNowTick(
    activeSession?.status === "running" || flow?.phase === "break_running",
  );
  const prefs = settings.pomodoro ?? DEFAULT_POMODORO;
  const selected = tasks.find((t) => t.id === selectedId && isTaskOpen(t));
  const result = focusSessions.find((s) => s.id === resultId),
    detail = focusSessions.find((s) => s.id === detailId),
    note = focusSessions.find((s) => s.id === noteId);
  const previous = useRef(activeSession?.id);
  const previousPhase = useRef(flow?.phase);
  useEffect(() => {
    if (previousPhase.current?.startsWith("break_") && flow?.phase === "next_ready") setResultId(null);
    previousPhase.current = flow?.phase;
  }, [flow?.phase]);
  useEffect(() => { setNoteDraft(focusSessions.find(s => s.id === noteId)?.focusNote ?? ""); }, [noteId]);
  useEffect(() => {
    if (previous.current && !activeSession) {
      const ended = focusSessions.find(
        (s) => s.id === previous.current && s.status === "completed",
      );
      if (ended) setResultId(ended.id);
    }
    previous.current = activeSession?.id;
  }, [activeSession, focusSessions]);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);
  useEffect(() => {
    document.body.classList.toggle("focus-stage-visible", view === "timer");
    return () => document.body.classList.remove("focus-stage-visible");
  }, [view]);
  useEffect(() => {
    if (!immersive) return;
    const app = document.getElementById("root");
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    return () => {
      if (app) app.inert = wasInert;
    };
  }, [immersive]);
  useFocusTrap(root, {
    enabled: immersive && !picker && !noteId && !showSettings && !showGap,
  });
  const candidates = useMemo(() => {
    const score = (t: Task) =>
      (t.dueDate && t.dueDate <= today ? 4 : 0) +
      (t.startDate && t.startDate <= today && t.dueDate >= today ? 2 : 0) +
      (tagNamesForTask(t, tags, taskTags).some((n) =>
        /study|공부|복습|review/i.test(n),
      )
        ? 1
        : 0);
    return tasks
      .filter(isTaskOpen)
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          (b.lastFocusedAt ?? "").localeCompare(a.lastFocusedAt ?? ""),
      )
      .slice(0, 3);
  }, [tasks, tags, taskTags, today]);
  /* 저장된 순서에서 지금 보여줄 것만. 지우는 경로가 여럿이라 읽을 때 거른다 —
     이유는 `domain/focus/queue`의 주석에 있다 (결정 9). */
  const queueTasks = useMemo(() => visibleQueue(queue, tasks), [queue, tasks]);
  const queuedIds = useMemo(() => new Set(queueTasks.map((t) => t.id)), [queueTasks]);
  const [dragId, setDragId] = useState("");

  /* 인라인 작업 메모 (FOCUS_LAYOUT_DESIGN.md Phase 3.5).

     저장 모델을 새로 만들지 않는다 — 메모는 예전부터 세션의 것이고
     (`FocusSession.focusNote`), 이 카드는 그 값을 다이얼로그 대신 자리에서
     편집할 뿐이다. 대상은 다이얼로그를 열던 세 진입점과 같은 규칙이다:
     지금 도는 세션, 없으면 방금 끝난 것. 둘 다 없으면 적을 곳이 없다. */
  const queueRef = useRef<HTMLDivElement | null>(null);
  const choices = useMemo(
    () =>
      tasks
        .filter((t) => !t.deletedAt && (picker === "start" || picker === "queue" ? isTaskOpen(t) : true))
        // 결정 7: 큐에 이미 있는 것은 고를 수 없다. 고르게 두면 아무 일도
        // 일어나지 않는 버튼이 되고, 그건 고장과 구별되지 않는다.
        .filter((t) => picker !== "queue" || !queuedIds.has(t.id))
        .filter((t) =>
          `${t.title} ${lists.find((x) => x.id === t.listId)?.name ?? ""} ${tagNamesForTask(t, tags, taskTags).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          (b.lastFocusedAt ?? "").localeCompare(a.lastFocusedAt ?? ""),
        ),
    [tasks, picker, query, lists, tags, taskTags],
  );
  const rows = useMemo(
    () => focusRecords(focusSessions, from, to, timezone, filter),
    [focusSessions, from, to, timezone, filter],
  );
  const counted = rows.filter((r) => r.ms > 0),
    total = counted.reduce((n, r) => n + r.ms, 0) / 1000;
  /* 비교 기준은 **직전 동일 기간**이다 (§5.5). 기간 칩과 뜻이 맞고 라벨에 그대로
     쓸 수 있다 — "어제보다", "지난주보다". 무엇 대비인지 화면이 말하지 않는
     숫자는 값이 아니라 장식이다. */
  const priorPeriod = useMemo(() => {
    if (period === "all") return null;
    const range = focusPeriodRange(period, offset - 1, today);
    const rows = focusRecords(focusSessions, range.from, range.to, timezone, filter);
    const counted = rows.filter((r) => r.ms > 0);
    return {
      seconds: counted.reduce((n, r) => n + r.ms, 0) / 1000,
      sessions: counted.length,
    };
  }, [focusSessions, period, offset, today, timezone, filter]);
  const spans = useMemo(
    () => focusTimelineSpans(focusSessions, from, to, timezone),
    [focusSessions, from, to, timezone],
  );
  /* 라벨은 겹치지 않을 때만 그린다 (§5.3.1). 값이 큰 구간부터 자리를 갖고, 이미
     놓인 라벨에 너무 가까워지는 것은 그리지 않는다 — 하루가 한 줄에 펼쳐지면
     30분과 38분의 길이 차이는 7px 이라 읽히지 않으므로 라벨이 답해야 하는데,
     열 세션이면 그 라벨들이 서로를 덮는다. `spans` 가 이미 긴 것부터다. */
  const timelineMarks = useMemo(() => {
    const placed: number[] = [];
    return spans.map((span) => {
      const center = (span.start + span.end) / 2;
      const clear = placed.every((at) => Math.abs(at - center) > 0.045);
      if (clear) placed.push(center);
      return { ...span, label: clear };
    });
  }, [spans]);
  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [lang, timezone],
  );
  /** 세션이 실제로 돈 구간의 처음과 끝. 목록이 타임라인을 풀어 쓴 것이므로. */
  const clockRange = (session: FocusSession) => {
    const first = session.segments[0]?.startAt || session.startedAt;
    const last =
      session.segments[session.segments.length - 1]?.endAt || session.endedAt;
    if (!first || !last) return "—";
    return `${timeFormat.format(new Date(first))} – ${timeFormat.format(new Date(last))}`;
  };
  const longestRow = counted.length
    ? counted.reduce((best, r) => (r.ms > best.ms ? r : best))
    : null;
  const longestWhen = longestRow ? clockRange(longestRow.session) : "—";
  /* "무엇 대비" 를 말하지 않는 숫자는 값이 아니라 장식이다 (§5.5). */
  const comparison = (() => {
    const previousLabel =
      period === "today"
        ? l("어제", "yesterday")
        : period === "week"
          ? l("지난주", "last week")
          : l("지난달", "last month");
    if (!priorPeriod || !priorPeriod.seconds)
      return l("비교할 기록이 아직 없어요", "No earlier period to compare");
    const delta = Math.round(((total - priorPeriod.seconds) / priorPeriod.seconds) * 100);
    if (delta === 0) return l(`${previousLabel}와 비슷해요`, `About the same as ${previousLabel}`);
    return delta > 0
      ? l(`${previousLabel}보다 ${delta}% 더 집중했어요`, `${delta}% more than ${previousLabel}`)
      : l(`${previousLabel}보다 ${-delta}% 적어요`, `${-delta}% less than ${previousLabel}`);
  })();
  /* 작업별 몫 — 같은 rows 를 다시 접는다. 새 집계 모델을 만들지 않는다. */
  const byTask = useMemo(() => focusByTask(rows).slice(0, 6), [rows]);
  /* 히트맵과 추이는 고른 기간이 아니라 그 **끝을 기준으로 한 최근 N** 을 본다 —
     카드가 "최근 4주" 라고 말하기 때문이다. 날짜 내비를 옮기면 이 기준도 함께
     옮겨서 화면의 모든 조각이 같은 순간을 이야기한다. */
  const anchor = period === "all" ? today : to > today ? today : to;
  const heatWeeks = useMemo(() => focusHeatmapWeeks(anchor, 4), [anchor]);
  const trendDays = useMemo(() => focusTrendDays(anchor, 7), [anchor]);
  const patternTotals = useMemo(
    () => focusDailyTotals(focusSessions, heatWeeks[0][0], anchor, timezone),
    [focusSessions, heatWeeks, anchor, timezone],
  );
  const heatMax = useMemo(
    () => Math.max(0, ...heatWeeks.flat().map((d) => patternTotals[d] ?? 0)),
    [heatWeeks, patternTotals],
  );
  /* 축의 위쪽 끝. 두 가지를 맞춘다.

     하나는 바닥이다 — 1시간을 최소로 두지 않으면 30분짜리 하루가 축을 가득
     채워서 "많이 했다" 로 읽힌다.

     또 하나는 눈금이 **읽히는 수**여야 한다는 것이다. 최댓값을 그냥 셋으로
     나누면 2.6h·1.7h·0.9h 같은 눈금이 나온다. 한 단을 30분의 배수로 올려서
     0·1h·2h·3h 처럼 세게 만든다. */
  const trendStep = Math.max(
    1800,
    Math.ceil(Math.max(3600, ...trendDays.map((d) => patternTotals[d] ?? 0)) / 3 / 1800) * 1800,
  );
  const trendMax = trendStep * 3;
  const trendTick = (seconds: number) =>
    seconds === 0
      ? "0"
      : seconds % 3600 === 0
        ? `${seconds / 3600}h`
        : `${(seconds / 3600).toFixed(1)}h`;
  const trendPoints = useMemo(() => {
    const left = 60,
      right = 830,
      top = 24,
      bottom = 138;
    const weekday = new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
      timeZone: "UTC",
      weekday: "short",
    });
    return trendDays.map((date, index) => {
      const seconds = patternTotals[date] ?? 0;
      return {
        date,
        seconds,
        last: index === trendDays.length - 1,
        x: left + ((right - left) * index) / Math.max(1, trendDays.length - 1),
        y: bottom - (bottom - top) * Math.min(1, seconds / trendMax),
        label: `${weekday.format(new Date(`${date}T12:00:00Z`))} ${Number(date.slice(8))}`,
      };
    });
  }, [trendDays, patternTotals, trendMax, lang]);
  const trendLine = trendPoints
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const trendArea = trendPoints.length
    ? `${trendLine} L${trendPoints[trendPoints.length - 1].x.toFixed(1)} 138 L${trendPoints[0].x.toFixed(1)} 138 Z`
    : "";
  const trendSummary = l(
    `최근 7일 집중 시간. 마지막 날 ${formatFocusDuration(trendPoints[trendPoints.length - 1]?.seconds ?? 0, true)}`,
    `Focus over the last 7 days. Latest ${formatFocusDuration(trendPoints[trendPoints.length - 1]?.seconds ?? 0, true)}`,
  );
  const rangeLabel = useMemo(() => {
    if (period === "all") return l("전체 기간", "All time");
    const locale = lang === "ko" ? "ko-KR" : "en-US";
    const at = (date: string) => new Date(`${date}T12:00:00Z`);
    if (period === "today")
      return new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        dateStyle: "full",
      }).format(at(from));
    if (period === "month")
      return new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
      }).format(at(from));
    const short = new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
    return `${short.format(at(from))} – ${short.format(at(to))}`;
  }, [period, from, to, lang]);
  const titleOf = (s?: FocusSession) => {
    if (!s?.taskId) return l("작업 미지정", "No task assigned");
    const linked = tasks.find(t => t.id === s.taskId);
    const title = linked?.title || s.title || l("집중", "Focus");
    return !linked || linked.deletedAt ? `${title} · ${l("삭제된 작업", "Deleted task")}` : title;
  };
  const run = (c: FocusCommand) => {
    setMessage("");
    return command(c);
  };
  const start = (taskId = selected?.id ?? null) => {
    if (activeSession || (flow && flow.phase !== "next_ready")) {
      setMessage(
        l(
          "진행 중인 집중 또는 휴식이 있어요.",
          "A focus session or break is already active.",
        ),
      );
      return;
    }
    if (
      run({
        type: "start",
        taskId,
        mode: flow ? "pomodoro" : mode,
        settings: prefs,
      })
    )
      setResultId(null);
  };
  const openPicker = (id: string) => {
    setQuery("");
    setPicker(id);
  };
  const isBreak = Boolean(flow?.phase.startsWith("break_"));
  /* 도는 세션이 정한 측정 방식. 이것이 있으면 상대 탭은 잠긴다 (§3).
     지금까지는 측정 토글을 세션 중에 **렌더하지 않아서** 그 사실을 말했는데,
     탭 줄은 늘 보이므로 이유를 말할 자리가 필요해졌다. */
  const lockedMode: "stopwatch" | "pomodoro" | null = activeSession
    ? (activeSession.measurementMode ?? "stopwatch")
    : flow
      ? "pomodoro"
      : null;
  /* 새로고침하면 `mode` 는 기본값으로 돌아가지만 세션은 살아 있다. 선택된 탭이
     화면에 도는 것과 달라지지 않게 맞춘다. */
  useEffect(() => {
    if (lockedMode && lockedMode !== mode) setMode(lockedMode);
  }, [lockedMode]);
  const tab = view === "records" ? "records" : mode;
  const lockedReason = l(
    "집중 중에는 측정 방식을 바꿀 수 없어요. 종료한 뒤 바꿔 주세요.",
    "You cannot switch timers mid-session. Finish this one first.",
  );
  const selectTab = (next: "stopwatch" | "pomodoro" | "records") => {
    if (next !== "records" && lockedMode && lockedMode !== next) {
      setMessage(lockedReason);
      return;
    }
    setMessage("");
    if (next === "records") {
      setView("records");
      return;
    }
    setView("timer");
    setMode(next);
  };
  const display = activeSession
    ? focusDisplaySeconds(activeSession, now)
    : isBreak && flow
      ? breakRemaining(flow, now)
      : flow || mode === "pomodoro"
        ? (flow?.settings ?? prefs).focusMinutes * 60
        : 0;
  /* 포모도로 탭은 "지금 무슨 블록인지" 와 "얼마나 왔는지" 를 함께 말한다 (§4.3).
     휴식은 별도 화면이 아니라 이 둘의 값이 바뀐 상태다 — 라벨 한 줄과 막대가
     같은 자리에서 다른 것을 가리킬 뿐이다. */
  const inPomodoro = tab === "pomodoro" || Boolean(flow) || isBreak;
  /* 포모도로에서는 블록이 끝나는 순간 `result` 가 생기고 곧바로 휴식이 시작된다 —
     그래서 `result` 가 있다는 것만으로는 결과 화면이 아니다. 결과는 도는 것이
     아무것도 없을 때뿐이다. */
  const showingResult = Boolean(result) && !activeSession && !isBreak;
  const blockTotal =
    isBreak && flow
      ? flow.breakSeconds
      : (activeSession?.targetSeconds ??
        (flow?.settings ?? prefs).focusMinutes * 60);
  /* 시계는 남은 시간을 세므로 진행률은 그 여집합이다. */
  const blockProgress =
    blockTotal > 0 ? Math.min(1, Math.max(0, 1 - display / blockTotal)) : 0;
  const blockLabel = (() => {
    if (isBreak && flow) {
      const long = flow.completedBlocks % flow.settings.longBreakEvery === 0;
      return `${long ? l("긴 휴식", "Long break") : l("짧은 휴식", "Short break")} · ${Math.round(flow.breakSeconds / 60)}${l("분", " min")}`;
    }
    const minutes = Math.round(blockTotal / 60);
    const cycle = flow
      ? ` · ${flow.completedBlocks % flow.settings.longBreakEvery}/${flow.settings.longBreakEvery}`
      : "";
    return `${l("집중 세션", "Focus block")} · ${minutes}${l("분", " min")}${cycle}`;
  })();
  async function openMini() {
    if (!activeSession && !isBreak) return;
    const ok = await platform.miniFocusTimer.open({
      sessionId: activeSession?.id ?? flow!.id,
      phase: activeSession ? "focus" : "break",
      revision: activeSession?.revision ?? flow?.revision ?? 0,
      title: activeSession ? titleOf(activeSession) : l("휴식 중", "Break"),
      time: formatFocusDuration(display),
      status:
        activeSession?.status === "running" || flow?.phase === "break_running"
          ? "running"
          : "paused",
    });
    if (!ok)
      setMessage(
        l(
          "팝업을 허용한 뒤 미니 창을 다시 열어 주세요.",
          "Allow popups and try the mini window again.",
        ),
      );
  }
  const stage = (
    <>
      {inPomodoro && !showingResult && (
        <p className="focus-eyebrow">{blockLabel}</p>
      )}
      {/* 앵커 — 여섯 상태에서 **자리가 변하지 않는 유일한 요소**다. 유휴에서 고르는
          자리와 세션 중에 읽는 자리가 같아야 "시계가 무엇을 재는지" 가 한 곳에서
          답해진다. 그래서 작업명은 여기에만 있다 (§4.1). */}
      {!isBreak &&
        (activeSession ? (
          /* 세션 중에는 읽기 전용. 24px 헤드라인이던 시절에는 작업을 고르지 않은
             세션이 "No task assigned" 를 화면에서 두 번째로 큰 글자로 외쳤다.
             측정 방식을 말하던 eyebrow 도 뺀다 — 이제 탭이 그것을 말한다. */
          <p className="focus-anchor is-static">
            <span className="focus-anchor-dot" aria-hidden="true" />
            <span>{titleOf(activeSession)}</span>
          </p>
        ) : result ? (
          <button
            className="focus-anchor"
            onClick={() => openPicker(result.id)}
          >
            <span className="focus-anchor-dot" aria-hidden="true" />
            <span>{titleOf(result)}</span>
            <FocusIcon name="chevron" />
          </button>
        ) : (
          <button
            className="focus-anchor"
            onClick={() => openPicker("start")}
          >
            <span className="focus-anchor-dot" aria-hidden="true" />
            <span>
              {selected?.title ??
                l("작업 선택 (선택 사항)", "Choose a task (optional)")}
            </span>
            <FocusIcon name="chevron" />
          </button>
        ))}

      {/* 시계는 자리를 지킨다. 세션이 끝나도 화면이 바뀌는 것이 아니라 이 칸의 값이
          바뀐다 (§4.2) — 종료가 화면 전환으로 느껴지지 않게. */}
      <div className="focus-time" aria-label={l("타이머", "Timer")}>
        {formatFocusDuration(
          showingResult && result ? result.accumulatedSeconds : display,
        )}
      </div>

      {/* 막대는 시계가 말한 것을 한 번 더 그린다. **휴식이어도 색을 바꾸지 않는다** —
          무엇인지는 위의 라벨이 말하고, 색이 상태를 나르기 시작하면 이 화면의
          파랑이 다시 둘이 된다. */}
      {inPomodoro && !showingResult && (
        <div
          className="focus-progress"
          role="progressbar"
          aria-label={blockLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(blockProgress * 100)}
        >
          <span style={{ width: `${blockProgress * 100}%` }} />
        </div>
      )}
      {/* 상태는 시계 아래다. 위에 두면 시계에 닿기 전에 읽어야 하는 줄이 하나 더
          생기는데, 이 화면에서 사람이 보러 온 것은 시계다. */}
      {activeSession && (
        <p className="focus-status" role="status">
          {activeSession.recoveryRequired
            ? l("복구됨 · 일시정지", "Recovered · Paused")
            : activeSession.status === "paused"
              ? l("일시정지됨", "Paused")
              : l("집중 중", "Focusing")}
        </p>
      )}
      {isBreak && flow && (
        <p className="focus-status" role="status">
          {flow.phase === "break_ready"
            ? l("휴식 준비", "Ready for a break")
            : flow.phase === "break_paused"
              ? l("휴식 일시정지", "Break paused")
              : l("휴식 중", "Taking a break")}
        </p>
      )}
      {showingResult && (
        <p className="focus-status" role="status">
          {l("집중이 기록되었어요", "Focus recorded")}
        </p>
      )}
      {activeSession ? (
        <>
          {activeSession.recoveryRequired && (
            <div className="focus-recovery">
              <p>
                {l(
                  "마지막 저장 시점까지 보존했어요. 저장 이후의 공백은 포함하지 않았어요.",
                  "Saved time is preserved. The unsaved gap is excluded.",
                )}
              </p>
              <button
                onClick={() => {
                  const date = new Date();
                  setGapEnd(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                  setShowGap(true);
                }}
              >
                {l("공백 확인", "Review gap")}
              </button>
            </div>
          )}
          {/* 주 버튼은 언제나 하나다 (§4 규칙 1). 위계가 자리에서 결정되므로
              두 번째 액션이 색으로 눈에 띌 이유가 없다 — 지금까지는 실행 중에
              주 버튼이 아예 없고 화면에서 가장 강한 색이 빨간 '종료' 였다. */}
          <button
            className="focus-primary"
            onClick={() =>
              run({
                type: activeSession.status === "paused" ? "resume" : "pause",
                id: activeSession.id,
              })
            }
          >
            <FocusIcon
              name={activeSession.status === "paused" ? "play" : "pause"}
            />
            {activeSession.status === "paused"
              ? l("재개", "Resume")
              : l("일시정지", "Pause")}
          </button>
          <div className="focus-secondary">
            {/* 종료는 danger 를 벗는다 (§4 규칙 2). 집중을 끝내는 것은 성공적
                완료이지 파괴가 아니다 — 빨강은 되돌릴 수 없는 삭제에만 남긴다. */}
            <button
              className="focus-text-button"
              onClick={() => run({ type: "finish", id: activeSession.id })}
            >
              <FocusIcon name="stop" />
              {l("세션 종료", "Finish")}
            </button>
            <button
              className="focus-text-button"
              onClick={() => setNoteId(activeSession.id)}
            >
              <FocusIcon name="note" />
              {activeSession.focusNote
                ? l("메모 있음", "Edit note")
                : l("메모", "Note")}
            </button>
          </div>
        </>
      ) : isBreak && flow ? (
        <>
          {/* 무슨 휴식인지는 위의 라벨이 이미 말했다. 여기서는 같은 규칙이다 —
              주 버튼 하나, 나머지는 중립 (§4 규칙 1·2). */}
          <button
            className="focus-primary"
            onClick={() =>
              run({
                type:
                  flow.phase === "break_running"
                    ? "break_pause"
                    : flow.phase === "break_ready"
                      ? "break_start"
                      : "break_resume",
                id: flow.id,
              })
            }
          >
            {flow.phase === "break_running"
              ? l("일시정지", "Pause")
              : flow.phase === "break_ready"
                ? l("휴식 시작", "Start break")
                : l("휴식 재개", "Resume break")}
          </button>
          <div className="focus-secondary">
            <button
              className="focus-text-button"
              onClick={() => {
                run({ type: "break_end", id: flow.id });
                setResultId(null);
              }}
            >
              {/* 아직 시작하지 않은 휴식을 '종료' 한다는 말은 틀리다 —
                  그건 건너뛰는 것이다. 명령은 같고 이름만 상태를 따른다. */}
              {flow.phase === "break_ready"
                ? l("휴식 건너뛰기", "Skip break")
                : l("휴식 종료", "End break")}
            </button>
          </div>
          <p className="focus-muted">
            {flow.settings.autoFocus
              ? l(
                  "휴식이 끝나면 다음 집중이 자동 시작됩니다.",
                  "The next focus starts automatically.",
                )
              : l(
                  "다음 집중은 준비되었을 때 시작하세요.",
                  "Start the next focus when you are ready.",
                )}
          </p>
          {flow.lastSessionId && (
            <button
              className="focus-text-button"
              onClick={() => setNoteId(flow.lastSessionId)}
            >
              <FocusIcon name="note" />
              {l("방금 집중 메모", "Note for last focus")}
            </button>
          )}
        </>
      ) : result ? (
        /* 결과는 화면이 아니라 상태다 (§4.2). 상태 줄·앵커·시계는 위에서 이미
           같은 자리에 값만 바꿔 그렸으므로 여기 남는 것은 액션뿐이다. */
        <>
          <button
            className="focus-primary"
            onClick={() =>
              start(
                result.taskId &&
                  tasks.some((t) => t.id === result.taskId && isTaskOpen(t))
                  ? result.taskId
                  : null,
              )
            }
          >
            <FocusIcon name="play" />
            {l("다시 집중 시작", "Focus again")}
          </button>
          <div className="focus-secondary">
            <button
              className="focus-text-button"
              onClick={() => setNoteId(result.id)}
            >
              {l("메모 추가", "Edit note")}
            </button>
            {result.taskId &&
              tasks.some((t) => t.id === result.taskId && isTaskOpen(t)) && (
                <button
                  className="focus-text-button"
                  onClick={() => onCompleteTask(result.taskId!)}
                >
                  {l("작업 완료", "Complete task")}
                </button>
              )}
            <button
              className="focus-text-button"
              onClick={() => {
                if (flow) run({ type: "flow_end", id: flow.id });
                setResultId(null);
              }}
            >
              {l("마치기", "Done")}
            </button>
          </div>
        </>
      ) : (
        <>
          <button className="focus-primary" onClick={() => start()}>
            <FocusIcon name="play" />
            {flow
              ? l("다음 집중 시작", "Start next focus")
              : l("집중 시작", "Start focus")}
          </button>
          <p className="focus-muted">
            {l(
              "작업을 선택하지 않아도 시작할 수 있어요.",
              "You can start without choosing a task.",
            )}
          </p>
          {/* 길이는 위의 라벨이 말하므로, 여기는 그것을 바꾸러 가는 문이다.
             시계 위에 있던 "25 min focus · 5 min break" 는 값이면서 링크라
             무엇을 하는 자리인지 말하지 않았다. */}
          {inPomodoro && (
            <div className="focus-secondary">
              <button
                className="focus-text-button"
                onClick={() => setShowSettings(true)}
              >
                {l("포모도로 설정", "Pomodoro settings")}
              </button>
            </div>
          )}
          {flow && (
            <button
              className="focus-text-button"
              onClick={() => run({ type: "flow_end", id: flow.id })}
            >
              {l("마치기", "End flow")}
            </button>
          )}
        </>
      )}
    </>
  );
  const content = (
    <div
      ref={root}
      className={`foc-page focus-page-v2${immersive ? " focus-immersive" : ""}`}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          immersive &&
          !picker &&
          !noteId &&
          !showSettings &&
          !showGap &&
          !detailId &&
          !deleteId
        )
          setImmersive(false);
      }}
    >
      <header className="focus-page-header" data-tauri-drag-region>
        <div className="focus-page-title">
          <h1>
            {view === "records"
              ? l("집중 기록", "Focus records")
              : l("집중", "Focus")}
          </h1>
          {/* 부제는 타이머 탭의 것이다. 기록 탭은 카드 넷이 각자 부제를 달고
              있어서, 페이지 부제가 그 위에 한 겹 더 얹히는 설명이 된다. */}
          {view !== "records" && (
            <p>
              {l(
                "지금, 더 깊이 집중해 보세요.",
                "Make room for your next moment of focus.",
              )}
            </p>
          )}
        </div>
        {/* 셋을 같은 높이에 둔다 (§1). 측정 방식은 화면 안의 토글이었고 기록은
            머리글의 버튼이어서, 세 개가 서로 다른 층위에 흩어져 있었다. */}
        {!immersive && (
          <div
            className="focus-tabs"
            role="tablist"
            aria-label={l("집중 화면", "Focus views")}
          >
            {(["stopwatch", "pomodoro", "records"] as const).map((id) => {
              const locked = id !== "records" && Boolean(lockedMode) && lockedMode !== id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  /* `disabled` 가 아니라 `aria-disabled` 다. 진짜 `disabled` 는 초점을
                     받지 못해서, 탭으로 훑는 사람은 그 탭이 있다는 것도 왜 잠겼는지도
                     듣지 못한다.

                     그리고 이유는 **누르기 전에** 닿아야 한다. 처음엔 누르면 말하게
                     했는데, 보조기술도 자동화 도구도 `aria-disabled` 를 "누를 수 없음"
                     으로 읽어서 누르는 일 자체가 일어나지 않는다 — 그 설계에서는 이유가
                     영원히 도착하지 않는 사람이 생긴다. 그래서 설명을 컨트롤에 붙인다:
                     보조기술은 `aria-describedby` 로, 마우스는 `title` 로, 그래도 누른
                     사람에게는 `selectTab` 이 한 번 더. */
                  aria-disabled={locked || undefined}
                  aria-describedby={locked ? "focus-tab-lock" : undefined}
                  title={locked ? lockedReason : undefined}
                  onClick={() => selectTab(id)}
                >
                  {id === "stopwatch"
                    ? l("타이머", "Timer")
                    : id === "pomodoro"
                      ? l("포모도로", "Pomodoro")
                      : l("기록", "Records")}
                </button>
              );
            })}
            {lockedMode && (
              <p id="focus-tab-lock" className="tm-visually-hidden">
                {lockedReason}
              </p>
            )}
          </div>
        )}
        <nav aria-label={l("집중 도구", "Focus tools")}>
          {/* 큐는 화면에서 빠졌지 없어진 것이 아니다 (§4.4). 여는 문을 머리글에
              두는 이유는 가운데 스택을 늘리지 않기 위해서다 — 그 스택은 시계와
              그것을 움직이는 것들만 담는다. */}
          {!immersive && (
            <button onClick={() => setShowQueue(true)}>
              <FocusIcon name="records" />
              {l("작업 큐", "Task queue")}
              {queueTasks.length > 0 && ` (${queueTasks.length})`}
            </button>
          )}
          {settings.showMiniTimerButton && (
            <button
              aria-label={l("미니 창", "Mini timer")}
              title={l("미니 창", "Mini timer")}
              disabled={!activeSession && !isBreak}
              onClick={() => void openMini()}
            >
              <FocusIcon name="mini" />
            </button>
          )}
          <button
            data-immersive-toggle
            onClick={() => {
              setView("timer");
              setImmersive(!immersive);
            }}
          >
            <FocusIcon name="expand" />
            {immersive
              ? l("몰입 종료 · Esc", "Exit immersion · Esc")
              : l("몰입 보기", "Immersive view")}
          </button>
          <button
            aria-label={l("집중 설정", "Focus settings")}
            title={l("집중 설정", "Focus settings")}
            onClick={() => setShowSettings(true)}
          >
            <FocusIcon name="more" />
          </button>
        </nav>
      </header>
      {error && (
        <div className="focus-error" role="alert">
          {l(
            "기록 저장 실패 · 다시 시도해 주세요.",
            "Could not save focus. Please retry.",
          )}{" "}
          <span>{error}</span>
          <button onClick={onRetry}>{l("다시 시도", "Retry")}</button>
        </div>
      )}
      {/* 안내는 실패가 아니다 — 탭 잠금처럼 아무것도 잘못되지 않은 경우가 여기로
          온다. 지금까지 `.focus-error` 를 입고 나왔다 (§4 규칙 3). */}
      {message && (
        <p role="status" className="focus-notice">
          {message}
        </p>
      )}
      {view === "timer" ? (
        /* 타이머·포모도로 화면에는 시계 하나만 있다. 큐·요약·메모가 옆에 서 있던
           것을 뺐다 — 큐는 `•••` 의 다이얼로그로, 요약은 이미 같은 숫자를 갖고 있는
           기록 탭으로, 메모는 원래의 다이얼로그 경로로 돌아간다 (§2·§3.1). */
        <div className="focus-layout">
          <section
            className="focus-stage"
            aria-label={l("집중 타이머", "Focus timer")}
          >
            <fieldset disabled={!ready || Boolean(error)}>{stage}</fieldset>
          </section>
        </div>
      ) : (
        <section className="focus-records">
          {/* 기간과 날짜는 같은 일을 한다 — 칩이 범위의 길이를 정하고 내비가 그
              범위를 옮긴다. 다른 줄에 있으면 그 관계가 끊긴다 (§7.2.0). */}
          <div className="focus-record-toolbar">
            <div className="focus-chips" role="group" aria-label={l("기간", "Period")}>
              {(
                [
                  ["today", l("오늘", "Today")],
                  ["week", l("이번 주", "This week")],
                  ["month", l("이번 달", "This month")],
                  ["all", l("전체", "All")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={period === id}
                  onClick={() => {
                    setPeriod(id);
                    setOffset(0);
                    setLimit(20);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="focus-datenav">
              <button
                aria-label={l("이전 기간", "Previous period")}
                disabled={period === "all"}
                onClick={() => {
                  setOffset(offset - 1);
                  setLimit(20);
                }}
              >
                ‹
              </button>
              <span className="focus-datenav-label">{rangeLabel}</span>
              <button
                aria-label={l("다음 기간", "Next period")}
                /* 앞으로 가는 길은 지금까지만 있다 — 미래에는 기록이 없다. */
                disabled={period === "all" || offset >= 0}
                onClick={() => {
                  setOffset(offset + 1);
                  setLimit(20);
                }}
              >
                ›
              </button>
            </div>
          </div>

          {/* 히어로 숫자는 뷰당 하나다 (§5.2). 넷이 같은 크기면 무엇을 먼저 볼지
              화면이 말하지 않는다. */}
          <section className="focus-kpis" aria-label={l("집중 요약", "Focus summary")}>
            <div className="focus-kpi is-hero">
              <span className="focus-kpi-label">{l("집중 시간", "Focused")}</span>
              <strong>{total ? formatFocusDuration(total, true) : "—"}</strong>
              <span className="focus-kpi-note">{comparison}</span>
            </div>
            {(
              [
                [
                  l("완료 세션", "Sessions"),
                  String(counted.length),
                  priorPeriod?.sessions
                    ? `${l("직전 기간", "Previous period")} ${priorPeriod.sessions}`
                    : l("완료된 세션", "Completed sessions"),
                ],
                [
                  l("평균 세션", "Average session"),
                  counted.length ? formatFocusDuration(total / counted.length, true) : "—",
                  l("세션당 평균", "Per session"),
                ],
                [
                  l("가장 긴 집중", "Longest"),
                  counted.length
                    ? formatFocusDuration(Math.max(...counted.map((r) => r.ms)) / 1000, true)
                    : "—",
                  longestWhen,
                ],
              ] as const
            ).map(([label, value, note]) => (
              <div className="focus-kpi" key={label}>
                <span className="focus-kpi-label">{label}</span>
                <strong>{value}</strong>
                <span className="focus-kpi-note">{note}</span>
              </div>
            ))}
          </section>

          <section className="focus-card" aria-label={l("집중 타임라인", "Focus timeline")}>
            <header className="focus-card-head">
              <div>
                <h2>{l("집중 타임라인", "Focus timeline")}</h2>
                <p>
                  {period === "today"
                    ? l("하루 중 집중이 있었던 시간을 보여줍니다.", "When in the day the focus happened.")
                    : l("기간 안의 집중을 하루 24시간 위에 겹쳐 보여줍니다.", "The period's focus, folded onto one 24-hour axis.")}
                </p>
              </div>
              <span className="focus-card-meta">
                {l("세션", "Sessions")} {counted.length} · {formatFocusDuration(total, true)}
              </span>
            </header>
            <div className="focus-timeline">
              {/* 눈금은 축과 같은 범위를 말해야 한다. 트랙이 0~24시를 쓰므로
                  라벨도 00 에서 시작한다 — 06 부터 붙였더니 09:20 의 구간이
                  14시 자리에 그려졌다 [실측]. 3시간마다 여덟 칸, 아홉 눈금. */}
              <div className="focus-timeline-hours" aria-hidden="true">
                {["00", "03", "06", "09", "12", "15", "18", "21"].map((h) => (
                  <span key={h} data-hour={`${h}:00`} />
                ))}
              </div>
              <div className="focus-timeline-track">
                {timelineMarks.map((span, index) => (
                  <span
                    key={`${span.sessionId}-${index}`}
                    className="focus-timeline-span"
                    style={{
                      left: `${span.start * 100}%`,
                      width: `${Math.max(span.end - span.start, 0.004) * 100}%`,
                    }}
                    title={formatFocusDuration(span.seconds, true)}
                  >
                    {span.label && <b>{formatFocusDuration(span.seconds, true)}</b>}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* 왼쪽이 합계, 오른쪽이 낱개다. 막대가 "오늘의 집중이 어디에 쓰였나" 를
              한 화면으로 답하고 목록이 "언제 무엇을 했나" 로 그것을 펼친다 —
              위의 KPI → 타임라인이 이미 그린 순서를 한 번 더 쓴다. */}
          <div className="focus-record-pair">
          <section className="focus-card" aria-label={l("작업별 집중 시간", "Focus by task")}>
            <header className="focus-card-head">
              <div>
                <h2>{l("작업별 집중 시간", "Focus by task")}</h2>
                <p>{l("이 기간의 집중이 어떤 작업에 쓰였는지", "Where the period's focus went")}</p>
              </div>
            </header>
            {!byTask.length ? (
              <p className="focus-record-empty">
                {l("아직 나눌 집중이 없어요.", "Nothing to break down yet.")}
              </p>
            ) : (
              <div className="focus-bars">
                {byTask.map((row) => {
                  const name =
                    (row.taskId && tasks.find((t) => t.id === row.taskId)?.title) ||
                    l("작업 미지정", "No task assigned");
                  return (
                    <div className="focus-bar-row" key={row.taskId ?? "none"}>
                      <div className="focus-bar-top">
                        <span className="focus-bar-name" title={name}>
                          {name}
                        </span>
                        <span>
                          <b>{formatFocusDuration(row.seconds, true)}</b>{" "}
                          <small>{Math.round(row.share * 100)}%</small>
                        </span>
                      </div>
                      {/* 막대는 단색이다 (§5.3) — 이름이 이미 각 줄을 구별한다. */}
                      <div
                        className="focus-bar"
                        role="img"
                        aria-label={`${name} ${formatFocusDuration(row.seconds, true)} (${Math.round(row.share * 100)}%)`}
                      >
                        <span style={{ width: `${Math.max(row.share * 100, 1)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="focus-card" aria-label={l("세션 기록", "Session records")}>
            <header className="focus-card-head">
              <div>
                <h2>{l("세션 기록", "Session records")}</h2>
                <p>
                  {l("각 세션에서 어떤 작업에 집중했는지", "Which task each session went to")}
                  {" · "}
                  {timezone}
                </p>
              </div>
              <label className="focus-card-meta">
                <span className="tm-visually-hidden">{l("작업으로 거르기", "Filter by task")}</span>
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setLimit(20);
                  }}
                >
                  <option value="all">{l("전체 작업", "All tasks")}</option>
                  <option value="unassigned">{l("작업 미지정", "Unassigned")}</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            </header>
            {!rows.length && (
              <p className="focus-record-empty">
                {l("이 기간의 집중 기록이 없어요.", "No focus records in this period.")}
              </p>
            )}
            {rows.slice(0, limit).map(({ session: s, ms }) => (
              <button
                className="focus-record-row"
                key={s.id}
                onClick={() => setDetailId(s.id)}
              >
                {/* 언제 → 무엇 → 얼마나. 시각이 앞에 오는 것은 이 목록이
                    타임라인 카드가 그린 것을 풀어 쓴 것이기 때문이다. */}
                <span className="focus-record-when">{clockRange(s)}</span>
                <strong>{titleOf(s)}</strong>
                <span className="focus-record-tags">
                  {(() => {
                    const task = s.taskId ? tasks.find((t) => t.id === s.taskId) : undefined;
                    return task ? tagNamesForTask(task, tags, taskTags) : [];
                  })()
                    .slice(0, 2)
                    .map((name) => (
                      <span className="tm-tag-chip" key={name}>
                        {name}
                      </span>
                    ))}
                </span>
                <span className="focus-record-duration">
                  {s.segments.length
                    ? formatFocusDuration(ms / 1000, true)
                    : l("구간 없음", "No segments")}
                </span>
                <span className="focus-record-more" aria-hidden="true">
                  {s.focusNote ? <FocusIcon name="note" /> : "···"}
                </span>
              </button>
            ))}
            {rows.length > limit && (
              <div className="focus-secondary">
                <button
                  className="focus-text-button"
                  onClick={() => setLimit(limit + 20)}
                >
                  {l("더 보기", "Load more")}
                </button>
              </div>
            )}
          </section>
          </div>

          {/* 집중 패턴 — 전폭이다. 히트맵은 셀 크기가 정해지면 폭이 정해지므로
              `auto`, 남는 전부는 추이가 가진다. 격자는 셀이 커진다고 더 읽히지
              않지만 선은 가로가 길수록 기울기가 읽힌다. */}
          <section className="focus-card" aria-label={l("집중 패턴", "Focus pattern")}>
            <header className="focus-card-head">
              <div>
                <h2>{l("집중 패턴", "Focus pattern")}</h2>
                <p>
                  {l("최근 4주의 패턴과 지난 7일의 추이", "The last four weeks, and the last seven days")}
                </p>
              </div>
            </header>
            <div className="focus-pattern">
              <div className="focus-heatwrap">
                <div>
                  <div className="focus-heat-days" aria-hidden="true">
                    <span />
                    {[
                      l("월", "M"), l("화", "T"), l("수", "W"), l("목", "T"),
                      l("금", "F"), l("토", "S"), l("일", "S"),
                    ].map((d, i) => (
                      <span key={i}>{d}</span>
                    ))}
                  </div>
                  {heatWeeks.map((week) => (
                    <div className="focus-heat-row" key={week[0]}>
                      <span className="focus-heat-label">
                        {week[0].slice(5).replace("-", ".")} –{" "}
                        {week[6].slice(5).replace("-", ".")}
                      </span>
                      {week.map((date) => {
                        const seconds = patternTotals[date] ?? 0;
                        const level = focusHeatLevel(seconds, heatMax);
                        return (
                          <span
                            key={date}
                            className={`focus-heat-cell is-${level}`}
                            title={`${date} · ${seconds ? formatFocusDuration(seconds, true) : l("기록 없음", "No focus")}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                  {/* 순차 램프에는 스케일 범례가 붙는다 (§5.3). */}
                  <p className="focus-heat-legend">
                    {l("적음", "Less")}
                    {[0, 1, 2, 3, 4].map((level) => (
                      <i key={level} className={`focus-heat-cell is-${level}`} />
                    ))}
                    {l("많음", "More")}
                  </p>
                </div>
              </div>
              <div className="focus-trend">
                <h3>{l("최근 7일 집중 시간", "Focus over the last 7 days")}</h3>
                <svg viewBox="0 0 860 186" role="img" aria-label={trendSummary}>
                  {[0, 1, 2, 3].map((i) => (
                    <line
                      key={i}
                      className="focus-trend-grid"
                      x1="44"
                      x2="850"
                      y1={24 + i * 38}
                      y2={24 + i * 38}
                    />
                  ))}
                  {[3, 2, 1, 0].map((step, i) => (
                    <text key={step} className="focus-trend-axis" x="22" y={28 + i * 38}>
                      {trendTick(step * trendStep)}
                    </text>
                  ))}
                  <path className="focus-trend-area" d={trendArea} />
                  <path className="focus-trend-line" d={trendLine} />
                  {trendPoints.map((point) => (
                    <circle
                      key={point.date}
                      className="focus-trend-mark"
                      cx={point.x}
                      cy={point.y}
                      r={point.last ? 5 : 4}
                    >
                      <title>{`${point.date} · ${point.seconds ? formatFocusDuration(point.seconds, true) : l("기록 없음", "No focus")}`}</title>
                    </circle>
                  ))}
                  {trendPoints.map((point) => (
                    <text
                      key={`x-${point.date}`}
                      className="focus-trend-axis"
                      x={point.x}
                      y="168"
                      textAnchor="middle"
                    >
                      {point.label}
                    </text>
                  ))}
                </svg>
              </div>
            </div>
          </section>
        </section>
      )}
      {picker && (
        <FocusDialog
          title={
            picker === "queue"
              ? l("큐에 추가할 작업", "Add a task to the queue")
              : l("작업 선택", "Choose a task")
          }
          onClose={() => {
            const from = picker;
            setPicker(null);
            if (from === "queue") setShowQueue(true);
          }}
        >
          <input
            className="focus-search"
            aria-label={l("작업 검색", "Search tasks")}
            placeholder={l(
              "작업, 리스트, 태그 검색…",
              "Search tasks, lists, tags…",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="focus-choice-list">
            {/* "작업 없이 집중"은 시작의 선택지이지 큐의 항목이 아니다 —
                담을 것이 없는 줄을 큐에 넣을 수는 없다. */}
            {(picker === "queue" ? choices : [null, ...choices]).map((t) => (
              <button
                key={t?.id ?? "none"}
                onClick={() => {
                  if (picker === "queue") {
                    if (t) onAddToQueue(t.id);
                    setShowQueue(true);
                  } else if (picker === "start") setSelectedId(t?.id ?? null);
                  else {
                    const s = focusSessions.find((s) => s.id === picker);
                    if (
                      !run({
                        type: "link",
                        id: picker,
                        taskId: t?.id ?? null,
                        revision: s?.revision,
                      })
                    )
                      return;
                  }
                  setPicker(null);
                }}
              >
                <span>
                  {t?.title ?? l("작업 없이 집중", "Focus without a task")}
                </span>
                <small>
                  {t
                    ? `${lists.find((x) => x.id === t.listId)?.name ?? ""}${!isTaskOpen(t) ? l(" · 완료", " · Completed") : ""}`
                    : ""}
                </small>
              </button>
            ))}
          </div>
        </FocusDialog>
      )}
      {note && (
        <FocusDialog
          title={l("집중 메모", "Focus note")}
          onClose={() => { if (run({ type: "note", id: note.id, note: noteDraft })) setNoteId(null); }}
        >
          <p>{titleOf(note)}</p>
          <textarea
            aria-label={l("메모", "Note")}
            value={noteDraft}
            onChange={(e) =>
              { setNoteDraft(e.target.value); run({ type: "note", id: note.id, note: e.target.value }); }
            }
            rows={7}
          />
          <button onClick={() => { if (run({ type: "note", id: note.id, note: noteDraft })) setNoteId(null); }}>{l("닫기", "Close")}</button>
        </FocusDialog>
      )}
      {detail && !picker && !note && !deleteId && (
        <FocusDialog
          title={l("집중 기록 상세", "Focus record")}
          onClose={() => setDetailId(null)}
        >
          <h3>{titleOf(detail)}</h3>
          <p>
            {formatFocusDuration(detail.accumulatedSeconds)} ·{" "}
            {detail.measurementMode === "pomodoro" ? "Pomodoro" : "Stopwatch"}
          </p>
          <p className="focus-muted">
            {detail.focusNote || l("메모 없음", "No note")}
          </p>
          <div className="focus-segments">
            {detail.segments.length
              ? detail.segments.map((s, i) => (
                  <p key={i}>
                    {new Date(s.startAt).toLocaleString(lang, {
                      timeZone: timezone,
                    })}{" "}
                    →{" "}
                    {new Date(s.endAt).toLocaleString(lang, {
                      timeZone: timezone,
                    })}
                  </p>
                ))
              : l(
                  "구간 정보 없음 · 기존 시간은 보존됩니다.",
                  "No segment data. Original duration is preserved.",
                )}
          </div>
          <div className="focus-main-actions">
            <button onClick={() => openPicker(detail.id)}>
              {l("작업 연결 변경", "Change task")}
            </button>
            <button onClick={() => setNoteId(detail.id)}>
              {l("메모", "Note")}
            </button>
            <button
              className="focus-danger"
              onClick={() => setDeleteId(detail.id)}
            >
              {l("삭제", "Delete")}
            </button>
          </div>
        </FocusDialog>
      )}
      {deleteId && (
        <FocusDialog
          title={l("집중 기록을 삭제할까요?", "Delete this focus record?")}
          onClose={() => setDeleteId(null)}
        >
          <p>
            {l(
              "연결 작업의 실제 시간에서도 차감됩니다.",
              "This duration is also removed from its linked task.",
            )}
          </p>
          <div className="focus-main-actions">
            <button onClick={() => setDeleteId(null)}>
              {l("취소", "Cancel")}
            </button>
            <button
              className="focus-danger"
              onClick={() => {
                const s = focusSessions.find((s) => s.id === deleteId);
                if (
                  run({ type: "delete", id: deleteId, revision: s?.revision })
                ) {
                  setDeleteId(null);
                  setDetailId(null);
                }
              }}
            >
              {l("삭제", "Delete")}
            </button>
          </div>
        </FocusDialog>
      )}
      {/* 설계는 드로어라고 적었지만 이 파일에 이미 초점 가둠·Escape·백드롭을 갖춘
          다이얼로그가 있다. 드로어를 새로 만들면 그 셋을 다시 짓게 되므로, 여기서는
          있는 관용구를 쓴다 — 큐는 열어서 순서를 고치고 닫는 일이지 켜두는 패널이
          아니라서 대화상자로도 같은 일을 한다. */}
      {/* 설계는 드로어라고 적었지만 이 파일에 이미 초점 가둠·Escape·백드롭을 갖춘
          다이얼로그가 있다. 드로어를 새로 만들면 그 셋을 다시 짓게 되므로 있는
          관용구를 쓴다 — 큐는 열어서 순서를 고치고 닫는 일이지 켜두는 패널이 아니라서
          대화상자로도 같은 일을 한다 (§4.4 에서 벗어난 곳, 이유는 여기 적는다). */}
      {showQueue && (
        <FocusDialog
          title={`${l("작업 큐", "Task queue")} ${queueTasks.length}`}
          onClose={() => setShowQueue(false)}
        >
          <p className="focus-muted">
            {l(
              "집중할 순서를 직접 만들어 두세요.",
              "Put the work in the order you will do it.",
            )}
          </p>
          {/* `position: relative` 는 장식이 아니라 OverlayScrollbar 의 요구다 —
              그 컴포넌트는 엄지를 스크롤러의 가장 가까운 positioned 조상에 놓는다. */}
          <div className="focus-queue-scroller" ref={queueRef}>
            {queueTasks.length === 0 ? (
              <p className="focus-queue-empty">
                {l(
                  "아직 큐가 비어 있어요. 작업을 추가해 순서를 만들어 보세요.",
                  "The queue is empty. Add a task to start building your order.",
                )}
              </p>
            ) : (
              queueTasks.map((t, index) => (
                <article
                  key={t.id}
                  className={dragId === t.id ? "is-dragging" : undefined}
                  draggable
                  onDragStart={(event) => {
                    setDragId(t.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/task", t.id);
                  }}
                  onDragOver={(event) => {
                    if (!dragId) return;
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (!dragId) return;
                    event.preventDefault();
                    onMoveInQueue(dragId, index);
                    setDragId("");
                  }}
                  onDragEnd={() => setDragId("")}
                >
                  {/* 손잡이는 알림이지 기구가 아니다 — 줄 전체가 끌린다. */}
                  <span className="focus-queue-handle" aria-hidden="true" />
                  <button
                    className="focus-candidate-play"
                    aria-label={`${l("이 작업으로", "Start")} ${mode === "pomodoro" ? l("포모도로 시작", "pomodoro") : l("스톱워치 시작", "stopwatch")}: ${t.title}`}
                    onClick={() => {
                      setShowQueue(false);
                      start(t.id);
                    }}
                  >
                    <FocusIcon name="play" />
                  </button>
                  <button
                    className="foc-task-main"
                    /* 작업의 상세를 여는 것은 큐를 떠나는 일이다 — 대화상자를
                       열어둔 채 그 뒤에서 패널이 열리면 어느 쪽이 지금 화면인지
                       알 수 없다. */
                    onClick={() => {
                      setShowQueue(false);
                      onOpenTask(t.id);
                    }}
                  >
                    <strong>{t.title}</strong>
                  </button>
                  <span className="focus-task-label">
                    {lists.find((x) => x.id === t.listId)?.name ?? ""}
                  </span>
                  {/* 결정 12: 새 예상 시간 모델을 만들지 않는다. 이 숫자는 지금까지
                      이 작업에 **쌓인** 집중 시간이다. */}
                  <small title={l("지금까지 집중한 시간", "Focused so far")}>
                    {formatFocusDuration(t.actualSeconds, true)}
                  </small>
                  <button
                    className="focus-queue-remove"
                    aria-label={`${l("큐에서 빼기", "Remove from queue")}: ${t.title}`}
                    onClick={() => onRemoveFromQueue(t.id)}
                  >
                    ×
                  </button>
                </article>
              ))
            )}
            <OverlayScrollbar scrollerRef={queueRef} />
          </div>
          <div className="focus-secondary">
            <button
              className="focus-text-button"
              /* 한 번에 하나의 모달만. 둘이 겹치면 뒤엣것의 백드롭이 앞엣것의
                 클릭을 가로챈다 — 쌓임 순서에 기대는 대신 닫고 연다. */
              onClick={() => {
                setShowQueue(false);
                openPicker("queue");
              }}
            >
              + {l("작업 추가", "Add task")}
            </button>
          </div>
        </FocusDialog>
      )}
      {showSettings && (
        <FocusDialog
          title={l("집중 설정", "Focus settings")}
          onClose={() => setShowSettings(false)}
        >
          <p className="focus-muted">
            {flow
              ? l(
                  "시간과 자동 시작 변경은 다음 새 흐름부터 적용됩니다.",
                  "Timing changes apply to the next new flow.",
                )
              : l(
                  "스톱워치는 제한 없이 실제 시간을 기록합니다.",
                  "The stopwatch records time without a target.",
                )}
          </p>
          {(
            [
              ["focusMinutes", l("집중 (분)", "Focus (minutes)"), 180],
              [
                "shortBreakMinutes",
                l("짧은 휴식 (분)", "Short break (minutes)"),
                60,
              ],
              [
                "longBreakMinutes",
                l("긴 휴식 (분)", "Long break (minutes)"),
                60,
              ],
              [
                "longBreakEvery",
                l("긴 휴식 간격 (회)", "Long break interval"),
                8,
              ],
            ] as const
          ).map(([key, label, max]) => (
            <label className="focus-setting-row" key={key}>
              {label}
              <input
                type="number"
                min={key === "longBreakEvery" ? 2 : 1}
                max={max}
                value={prefs[key]}
                onChange={(e) =>
                  onUpdateSettings({
                    pomodoro: sanitizePomodoro({
                      ...prefs,
                      [key]: Number(e.target.value),
                    }),
                  })
                }
              />
            </label>
          ))}
          {(
            [
              [
                "autoBreak",
                l("집중 종료 후 휴식 자동 시작", "Start breaks automatically"),
              ],
              [
                "autoFocus",
                l(
                  "휴식 종료 후 다음 집중 자동 시작",
                  "Start next focus automatically",
                ),
              ],
            ] as const
          ).map(([key, label]) => (
            <label className="focus-setting-row" key={key}>
              {label}
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) =>
                  onUpdateSettings({
                    pomodoro: { ...prefs, [key]: e.target.checked },
                  })
                }
              />
            </label>
          ))}
          <p className="focus-muted">
            {l(
              "자동 집중을 켜면 부재 중에도 시간이 기록될 수 있어요.",
              "Automatic focus may record time while you are away.",
            )}
          </p>
          <label className="focus-setting-row">
            {l("알림음", "Sound")}
            <input
              type="checkbox"
              checked={settings.soundEnabled ?? true}
              onChange={(e) =>
                onUpdateSettings({ soundEnabled: e.target.checked })
              }
            />
          </label>
          <label className="focus-setting-row">
            {l("음량", "Volume")}
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.soundVolume ?? 0.4}
              onChange={(e) =>
                onUpdateSettings({ soundVolume: Number(e.target.value) })
              }
            />
          </label>
          <button
            onClick={() =>
              void platform
                .requestNotificationPermission()
                .then((ok) =>
                  setMessage(
                    ok === "granted"
                      ? l("알림이 허용되었습니다.", "Notifications enabled.")
                      : l(
                          "브라우저 또는 시스템 설정에서 알림을 허용해 주세요.",
                          "Allow notifications in browser or system settings.",
                        ),
                  ),
                )
            }
          >
            {l("알림 권한 요청", "Enable notifications")}
          </button>
        </FocusDialog>
      )}
      {showGap && activeSession && (
        <FocusDialog
          title={l("저장 공백 확인", "Review unsaved gap")}
          onClose={() => setShowGap(false)}
        >
          <p>
            {l(
              "저장 이후에도 계속 집중했다면, 실제로 집중을 마친 시각을 선택하세요. 다른 집중 기록과 겹치는 시간은 추가할 수 없어요.",
              "If you kept focusing after the last save, choose when you actually stopped. Time overlapping another record cannot be added.",
            )}
          </p>
          <label>
            {l("종료 시각", "End time")} · {Intl.DateTimeFormat().resolvedOptions().timeZone}
            <input type="datetime-local" value={gapEnd} onChange={(e) => setGapEnd(e.target.value)} />
          </label>
          <button
            onClick={() => {
              const end = Date.parse(gapEnd);
              if (!Number.isFinite(end) || end > Date.now()) { setMessage(l("현재 이전의 종료 시각을 선택해 주세요.", "Choose a valid end time before now.")); return; }
              const start = Date.parse(activeSession.checkpointAt ?? activeSession.pausedAt);
              if (end <= start || focusSessions.some(s => s.id !== activeSession.id && s.segments.some(g => Date.parse(g.startAt) < end && Date.parse(g.endAt) > start))) {
                setMessage(l("마지막 저장 이후이며 다른 기록과 겹치지 않는 시각을 선택해 주세요.", "Choose a time after the last save without overlapping another record."));
                return;
              }
              if (run({ type: "recover_gap", id: activeSession.id, endAt: new Date(end).toISOString() })) setShowGap(false);
            }}
          >
            {l("확인한 시간 추가", "Add confirmed time")}
          </button>
        </FocusDialog>
      )}
    </div>
  );
  return immersive ? createPortal(content, document.body) : content;
}
