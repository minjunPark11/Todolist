// 기간 범위와 하루 축 (FOCUS_TABS_AND_RECORD_DESIGN.md §7.2.0 · §5.2).
//
// 여기서 잡으려는 것은 날짜 셈의 두 가지 흔한 함정이다.
//
//   · 로컬 자정으로 셈하면 실행 기기의 시간대가 결과를 흔든다. 사용자가 고른
//     시간대와 다른 답이 나오고, 그건 CI 와 개발자 노트북에서 다르게 나온다.
//   · 자정을 넘는 구간을 자르지 않으면 23:50→00:10 이 축을 **거꾸로** 가로지른다.
import { describe, expect, it } from "vitest";
import {
  focusByTask,
  focusDailyTotals,
  focusHeatLevel,
  focusHeatmapWeeks,
  focusMinuteOfDay,
  focusPeriodRange,
  focusTimelineSpans,
  focusTrendDays,
} from "./records";
import type { FocusSession } from "../../types";

/** 이 파일에 필요한 만큼의 세션. 나머지 필드는 계산에 닿지 않는다. */
function session(
  id: string,
  segments: Array<[string, string]>,
): FocusSession {
  return {
    id,
    taskId: null,
    title: "",
    mode: "focus",
    status: "completed",
    durationMinutes: 0,
    accumulatedSeconds: 0,
    completed: true,
    startAt: "",
    endAt: "",
    startedAt: segments[0]?.[0] ?? "",
    endedAt: segments[segments.length - 1]?.[1] ?? "",
    pausedAt: "",
    segments: segments.map(([startAt, endAt]) => ({ startAt, endAt })),
    source: "focus_page",
    projectId: "",
    projectName: "",
    focusNote: "",
    createdAt: "",
    updatedAt: "",
  } as FocusSession;
}

describe("focusPeriodRange", () => {
  it("오늘은 하루이고, 옮기면 하루씩 간다", () => {
    expect(focusPeriodRange("today", 0, "2026-09-10")).toEqual({
      from: "2026-09-10",
      to: "2026-09-10",
    });
    expect(focusPeriodRange("today", -1, "2026-09-10")).toEqual({
      from: "2026-09-09",
      to: "2026-09-09",
    });
  });

  it("주는 월요일에 시작한다 — 일요일이 앞이 아니라 뒤다", () => {
    // 2026-09-10 은 목요일.
    expect(focusPeriodRange("week", 0, "2026-09-10")).toEqual({
      from: "2026-09-07",
      to: "2026-09-13",
    });
    // 일요일에서 재도 같은 주를 가리켜야 한다. `getUTCDay()` 의 일요일 0 을
    // 그대로 쓰면 여기서 한 주가 앞으로 밀린다.
    expect(focusPeriodRange("week", 0, "2026-09-13")).toEqual({
      from: "2026-09-07",
      to: "2026-09-13",
    });
    expect(focusPeriodRange("week", -1, "2026-09-10")).toEqual({
      from: "2026-08-31",
      to: "2026-09-06",
    });
  });

  it("달은 길이가 제각각이고 해를 넘는다", () => {
    expect(focusPeriodRange("month", 0, "2026-09-10")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    // 2 월. 2028 은 윤년이다.
    expect(focusPeriodRange("month", 0, "2028-02-15")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    // 1 월에서 뒤로 가면 작년 12 월이다.
    expect(focusPeriodRange("month", -1, "2026-01-20")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    // 31 일에서 재도 그 달이다 — 짧은 달로 넘어가지 않는다.
    expect(focusPeriodRange("month", 0, "2026-01-31")).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  it("전체는 옮길 것이 없다", () => {
    const a = focusPeriodRange("all", 0, "2026-09-10");
    expect(focusPeriodRange("all", -5, "2026-09-10")).toEqual(a);
    expect(a.from < "1970-01-01" && a.to > "2100-01-01").toBe(true);
  });
});

describe("focusMinuteOfDay", () => {
  it("사용자의 시간대로 잰다 — 실행 기기의 것이 아니라", () => {
    const at = Date.parse("2026-09-10T00:30:00Z");
    expect(focusMinuteOfDay(at, "UTC")).toBe(30);
    expect(focusMinuteOfDay(at, "Asia/Seoul")).toBe(9 * 60 + 30);
  });

  it("자정은 하루의 끝이 아니라 시작이다", () => {
    expect(focusMinuteOfDay(Date.parse("2026-09-10T00:00:00Z"), "UTC")).toBe(0);
  });
});

describe("focusTimelineSpans", () => {
  it("구간을 하루 축 위의 자리로 바꾼다", () => {
    const spans = focusTimelineSpans(
      [session("s1", [["2026-09-10T06:00:00Z", "2026-09-10T07:00:00Z"]])],
      "2026-09-10",
      "2026-09-10",
      "UTC",
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBeCloseTo(6 / 24, 5);
    expect(spans[0].end).toBeCloseTo(7 / 24, 5);
    expect(spans[0].seconds).toBe(3600);
  });

  it("자정을 넘는 구간은 갈라진다 — 축을 거꾸로 가로지르지 않는다", () => {
    const spans = focusTimelineSpans(
      [session("s1", [["2026-09-10T23:50:00Z", "2026-09-11T00:10:00Z"]])],
      "2026-09-10",
      "2026-09-11",
      "UTC",
    );
    expect(spans).toHaveLength(2);
    for (const span of spans) expect(span.end).toBeGreaterThan(span.start);
    const late = spans.find((s) => s.start > 0.9)!;
    expect(late.end).toBeCloseTo(1, 5);
    const early = spans.find((s) => s.start === 0)!;
    expect(early.end).toBeCloseTo(10 / 1440, 5);
  });

  it("여러 날이 한 축 위에 접힌다 — 카드가 묻는 것은 '하루 중 언제' 다", () => {
    const spans = focusTimelineSpans(
      [
        session("s1", [["2026-09-09T09:00:00Z", "2026-09-09T09:30:00Z"]]),
        session("s2", [["2026-09-10T09:00:00Z", "2026-09-10T09:30:00Z"]]),
      ],
      "2026-09-09",
      "2026-09-10",
      "UTC",
    );
    expect(spans).toHaveLength(2);
    expect(spans[0].start).toBeCloseTo(spans[1].start, 5);
  });

  it("범위 밖은 세지 않는다", () => {
    expect(
      focusTimelineSpans(
        [session("s1", [["2026-09-08T09:00:00Z", "2026-09-08T09:30:00Z"]])],
        "2026-09-10",
        "2026-09-10",
        "UTC",
      ),
    ).toEqual([]);
  });

  it("긴 것이 먼저 온다 — 라벨은 그 순서로 자리를 갖는다 (§5.3.1)", () => {
    const spans = focusTimelineSpans(
      [
        session("short", [["2026-09-10T09:00:00Z", "2026-09-10T09:10:00Z"]]),
        session("long", [["2026-09-10T14:00:00Z", "2026-09-10T15:00:00Z"]]),
      ],
      "2026-09-10",
      "2026-09-10",
      "UTC",
    );
    expect(spans.map((s) => s.sessionId)).toEqual(["long", "short"]);
  });
});

describe("focusDailyTotals", () => {
  it("날짜별로 모으고, 범위 밖은 담지 않는다", () => {
    const totals = focusDailyTotals(
      [
        session("a", [["2026-09-09T09:00:00Z", "2026-09-09T09:30:00Z"]]),
        session("b", [["2026-09-10T09:00:00Z", "2026-09-10T09:10:00Z"]]),
        session("c", [["2026-09-10T14:00:00Z", "2026-09-10T14:20:00Z"]]),
        session("out", [["2026-09-11T09:00:00Z", "2026-09-11T09:30:00Z"]]),
      ],
      "2026-09-09",
      "2026-09-10",
      "UTC",
    );
    expect(totals).toEqual({ "2026-09-09": 1800, "2026-09-10": 1800 });
  });

  it("자정을 넘는 구간은 두 날에 나뉜다", () => {
    const totals = focusDailyTotals(
      [session("a", [["2026-09-09T23:50:00Z", "2026-09-10T00:10:00Z"]])],
      "2026-09-09",
      "2026-09-10",
      "UTC",
    );
    expect(totals["2026-09-09"]).toBe(600);
    expect(totals["2026-09-10"]).toBe(600);
  });
});

describe("focusHeatmapWeeks", () => {
  it("월요일에 시작하는 주가 오래된 것부터 쌓인다", () => {
    const weeks = focusHeatmapWeeks("2026-09-10", 4);
    expect(weeks).toHaveLength(4);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 마지막 줄은 앵커가 든 주다.
    expect(weeks[3][0]).toBe("2026-09-07");
    expect(weeks[3]).toContain("2026-09-10");
    // 위로 갈수록 오래된 주다.
    expect(weeks[0][0]).toBe("2026-08-17");
  });

  it("앵커가 일요일이어도 그 주가 마지막 줄이다", () => {
    const weeks = focusHeatmapWeeks("2026-09-13", 4);
    expect(weeks[3][0]).toBe("2026-09-07");
    expect(weeks[3][6]).toBe("2026-09-13");
  });
});

describe("focusTrendDays", () => {
  it("앵커로 끝나는 N 일이 오래된 것부터", () => {
    const days = focusTrendDays("2026-09-10", 7);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-09-04");
    expect(days[6]).toBe("2026-09-10");
  });

  it("달을 거슬러 올라간다", () => {
    expect(focusTrendDays("2026-03-02", 7)[0]).toBe("2026-02-24");
  });
});

describe("focusHeatLevel", () => {
  it("최댓값 대비 비율로 네 단을 나눈다 — 없음은 0 이다", () => {
    expect(focusHeatLevel(0, 100)).toBe(0);
    expect(focusHeatLevel(20, 100)).toBe(1);
    expect(focusHeatLevel(40, 100)).toBe(2);
    expect(focusHeatLevel(70, 100)).toBe(3);
    expect(focusHeatLevel(100, 100)).toBe(4);
  });

  it("최댓값이 없으면 색도 없다", () => {
    expect(focusHeatLevel(30, 0)).toBe(0);
  });
});

describe("focusByTask", () => {
  it("많은 것부터, 몫과 함께", () => {
    const rows = [
      { session: { ...session("a", []), taskId: "t1" }, ms: 3600000 },
      { session: { ...session("b", []), taskId: "t2" }, ms: 1200000 },
      { session: { ...session("c", []), taskId: "t1" }, ms: 1200000 },
    ];
    const shares = focusByTask(rows);
    expect(shares.map((s) => s.taskId)).toEqual(["t1", "t2"]);
    expect(shares[0].seconds).toBe(4800);
    expect(shares[0].share).toBeCloseTo(4800 / 6000, 5);
  });

  it("작업 없는 세션은 하나로 모인다", () => {
    const rows = [
      { session: { ...session("a", []), taskId: null }, ms: 600000 },
      { session: { ...session("b", []), taskId: "" as unknown as null }, ms: 600000 },
    ];
    expect(focusByTask(rows)).toEqual([{ taskId: null, seconds: 1200, share: 1 }]);
  });

  it("세지 않는 줄은 빼고 센다", () => {
    expect(focusByTask([{ session: session("a", []), ms: 0 }])).toEqual([]);
  });
});
