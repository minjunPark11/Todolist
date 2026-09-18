import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 캘린더의 시간대가 저장소를 건너는가 (046).
 *
 * 구글은 `calendarList` 에서 캘린더마다 `timeZone` 을 준다. 그 값이 있어야
 * 인바운드가 `defaultTimezone` 을 넘길 수 있고, 그것은 자기 시간대를 말하지
 * 않는 일정에 붙는 라벨이 된다 (`inboundPlan.test.ts` 가 그쪽을 본다).
 *
 * 019 테이블에는 그 컬럼이 없었다. `listGoogleCalendars` 는 값을 읽어왔고
 * `GoogleCalendarSummary` 는 자리를 갖고 있었는데, 그 사이의 저장소만 비어
 * 있었으므로 `rowToSource` 가 채울 것이 없었고 매 패스가 라벨 없이 돌았다.
 *
 * 그래서 이 파일이 보는 것은 **왕복**이다: 써넣은 것이 읽어서 돌아오는가,
 * 그리고 구글이 시간대를 말하지 않은 캘린더는 없는 채로 돌아오는가.
 */

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  upsert: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("../services/supabaseClient", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      expect(table).toBe("google_calendar_sources");
      return { select: mocks.select, upsert: mocks.upsert };
    },
  },
}));

import { readGoogleSources, rememberGoogleCalendars } from "./googleCalendarSources";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } } });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.select.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.clearAllMocks());

/** 마지막 호출의 인자. `Array.prototype.at` 은 이 프로젝트의 lib 밖이다. */
function lastCall(fn: { mock: { calls: unknown[][] } }): unknown[] | undefined {
  const { calls } = fn.mock;
  return calls.length ? calls[calls.length - 1] : undefined;
}

/** 마지막 upsert 가 이 캘린더에 대해 쓴 행. */
function written(calendarId: string): Record<string, unknown> | undefined {
  const rows = lastCall(mocks.upsert)?.[0] as Record<string, unknown>[] | undefined;
  return rows?.find((row) => row.calendar_id === calendarId);
}

describe("캘린더의 시간대", () => {
  it("구글이 말한 시간대를 적어두고, 읽으면 그대로 돌아온다", async () => {
    await rememberGoogleCalendars([
      { calendarId: "person@example.com", summary: "개인", color: "#123456", writable: true, timezone: "Asia/Seoul", primary: true },
    ]);
    expect(written("person@example.com")?.timezone, "적어두지 않으면 읽을 것이 없다").toBe("Asia/Seoul");

    mocks.select.mockResolvedValue({
      data: [{ calendar_id: "person@example.com", summary: "개인", color: "#123456", writable: true, selected: true, sync_token: null, timezone: "Asia/Seoul" }],
      error: null,
    });
    const [source] = await readGoogleSources();
    expect(source.timezone, "인바운드는 이 값을 defaultTimezone 으로 넘긴다").toBe("Asia/Seoul");
  });

  it("읽을 때 그 컬럼을 실제로 달라고 한다", async () => {
    await readGoogleSources();
    // 위 검사는 가짜 행을 직접 만들어 넣으므로, 진짜 질의가 이 컬럼을
    // 빼먹어도 통과한다. 질의 자체를 본다.
    expect(String(lastCall(mocks.select)?.[0])).toContain("timezone");
  });

  it("구글이 시간대를 말하지 않으면 없는 채로 남는다 — 그물의 자기 점검", async () => {
    // 위 둘이 "무엇이든 시간대를 채우면" 통과한다면, 모르는 것을 지어내는
    // 구현도 통과한다. 빈 값은 빈 채로 와야 한다 — `moment()` 는 라벨이
    // 없으면 붙이지 않고, 그것이 지어낸 지역보다 낫다.
    await rememberGoogleCalendars([
      { calendarId: "holidays", summary: "공휴일", color: "#999999", writable: false, primary: false },
    ]);
    expect(written("holidays")?.timezone, "빈 문자열이 019 의 summary·color 와 같은 모양이다").toBe("");

    mocks.select.mockResolvedValue({
      data: [{ calendar_id: "holidays", summary: "공휴일", color: "#999999", writable: false, selected: false, sync_token: null, timezone: "" }],
      error: null,
    });
    const [source] = await readGoogleSources();
    expect(source.timezone, "빈 값에 키를 두면 인바운드가 빈 지역을 넘긴다").toBeUndefined();
  });

  it("사람이 고른 것은 덮지 않는다 — 시간대는 구글의 것이고 선택은 사람의 것이다", async () => {
    mocks.select.mockResolvedValue({
      data: [{ calendar_id: "person@example.com", summary: "개인", color: "#123456", writable: true, selected: true, sync_token: "tok", timezone: "Asia/Seoul" }],
      error: null,
    });
    await rememberGoogleCalendars([
      { calendarId: "person@example.com", summary: "개인 (새 이름)", color: "#654321", writable: true, timezone: "Europe/Berlin", primary: true },
    ]);

    const row = written("person@example.com");
    expect(row?.timezone, "옮겨간 캘린더는 따라와야 한다").toBe("Europe/Berlin");
    expect(row?.summary).toBe("개인 (새 이름)");
    expect(row, "이미 있는 행의 selected 를 다시 쓰면 읽던 캘린더가 조용히 꺼진다").not.toHaveProperty("selected");
  });
});
