import { describe, expect, it } from "vitest";
import { createIcs } from "./publish";
import { parseIcsEvents, unfoldIcsLines } from "./parse";
import type { CalendarShareSnapshot, SharedCalendarEvent } from "../calendarShare";

/**
 * 공유 캘린더가 내놓는 것을, 이 앱 자신이 되읽을 수 있는가.
 *
 * 쓰는 쪽은 오래 `api/calendar/[token].js` 안에 손으로 쓴 채 있었다 — 손으로
 * 쓴 `api/**` 는 번들러가 건드리지 않으므로 `tsc` 도 `vitest` 도 닿지 않는
 * 자리다. 읽는 쪽에는 검사가 둘이나 있었고 쓰는 쪽에는 하나도 없었다.
 *
 * 그 비대칭이 남긴 것 셋을 여기서 고정한다. 셋 다 생성기를 그대로 돌리고
 * 결과를 `parseIcsEvents` 로 되읽어 확인한 것이다 [실측].
 */

const NOW = "2026-08-18T00:00:00.000Z";

function calendarOf(events: SharedCalendarEvent[]): string {
  const snapshot: CalendarShareSnapshot = { version: 1, generatedAt: NOW, events };
  return createIcs(snapshot, NOW);
}

/** 한 줄이 실제로 몇 옥텟인지. 접기는 글자가 아니라 옥텟으로 센다. */
function octets(line: string): number {
  return new TextEncoder().encode(line).length;
}

describe("공유 캘린더가 내놓는 ICS", () => {
  it("끝 시각이 없는 늦은 밤 일정이 길이 0 이 되지 않는다", () => {
    // `Math.min(hour + 1, 23)` 로 한 시간을 더하던 자리가 23 시에 붙잡혀
    // 있었다. 23:30 일정은 DTSTART 와 DTEND 가 같은 값으로 나갔고, 구독하는
    // 달력에는 한 시간짜리가 아니라 점 하나로 들어갔다.
    const ics = calendarOf([{ uid: "late", title: "늦은 일정", date: "2026-08-18", startTime: "23:30" }]);
    expect(ics).toContain("DTSTART:20260818T233000");
    expect(ics, "다음 날 00:30 이어야 한다").toContain("DTEND:20260819T003000");

    const [event] = parseIcsEvents(ics, "cal");
    expect(event.start).not.toBe(event.end);
  });

  it("자정을 넘는 일정의 끝은 다음 날이다", () => {
    // 끝이 시작보다 앞서면 날이 바뀐 것이다. 같은 날짜를 쓰면 DTEND 가
    // DTSTART 보다 이른 일정이 되는데, RFC 가 아예 허용하지 않는 모양이다.
    const ics = calendarOf([{ uid: "over", title: "야근", date: "2026-08-18", startTime: "23:00", endTime: "01:00" }]);
    expect(ics).toContain("DTSTART:20260818T230000");
    expect(ics).toContain("DTEND:20260819T010000");
  });

  it("긴 줄은 75 옥텟에서 접히고, 펴면 원래대로 돌아온다", () => {
    // 접는 코드가 아예 없었다. 한글 제목은 스물몇 자에서 이 선을 넘으므로
    // 드문 경우가 아니다 — 검증에 쓴 제목 하나가 191 옥텟짜리 한 줄로
    // 나갔다 (RFC 5545 §3.1).
    const title = `회의 ${"아주 긴 제목을 가진 일정입니다 ".repeat(4)}`;
    const ics = calendarOf([{ uid: "long", title, date: "2026-08-19" }]);

    const tooLong = ics.split("\r\n").filter((line) => octets(line) > 75);
    expect(tooLong, `75 옥텟을 넘는 줄이 남았다:\n${tooLong.join("\n")}`).toEqual([]);

    // 접는 것만으로는 부족하다 — 펴서 **한 글자도 다르지 않아야** 한다.
    // 뒤에 붙은 공백까지 그대로다: 접을 때 넣는 공백은 이어지는 줄의 맨
    // 앞이고, 펴는 쪽은 그 하나만 떼므로 내용의 공백은 건드리지 않는다.
    // (`parseIcsEvents` 로 되읽으면 제목이 trim 되는데, 그것은 그 함수의
    // 일이지 접기의 일이 아니다 — 여기서 펴는 쪽을 직접 보는 이유다.)
    const summary = unfoldIcsLines(ics).find((line) => line.startsWith("SUMMARY:"));
    expect(summary?.slice("SUMMARY:".length)).toBe(title);
  });

  it("글자를 옥텟 한가운데서 자르지 않는다 — 그물의 자기 점검", () => {
    // 75 에서 무조건 자르면 한글 한 글자가 반으로 갈리고, 펴도 돌아오지
    // 않는다. 길이만 재는 위 검사는 그 구현으로도 통과한다.
    const title = "가".repeat(120);
    const ics = calendarOf([{ uid: "cut", title, date: "2026-08-19" }]);
    expect(ics).not.toContain("�");
    const summary = unfoldIcsLines(ics).find((line) => line.startsWith("SUMMARY:"));
    expect(summary?.slice("SUMMARY:".length)).toBe(title);
  });

  it("캐리지 리턴이 든 제목이 잘리지 않는다", () => {
    // `\n` 만 보고 있어서 홀로 선 CR 은 그대로 나갔다. 줄을 CRLF 로 잇는
    // 파일 안의 날것의 CR 은 그 자리에서 줄을 끊는다:
    //
    //   보낸 것   "캐리지리턴\r다음"
    //   돌아온 것 "캐리지리턴"
    const ics = calendarOf([{ uid: "cr", title: "캐리지리턴\r다음", date: "2026-08-21" }]);
    const [event] = parseIcsEvents(ics, "cal");
    expect(event.title, "CR 뒤의 글자가 사라지면 안 된다").toBe("캐리지리턴\n다음");
  });

  it("RFC 가 escape 하라는 글자들을 escape 한다", () => {
    const title = "쉼표, 세미콜론; 백슬래시\\ 끝";
    const ics = calendarOf([{ uid: "esc", title, date: "2026-08-20" }]);
    const summary = unfoldIcsLines(ics).find((line) => line.startsWith("SUMMARY:")) ?? "";
    expect(summary).toContain("\\,");
    expect(summary, "세미콜론을 놓치면 파라미터 구분자로 읽힌다").toContain("\\;");
    expect(summary).toContain("\\\\");
    expect(parseIcsEvents(ics, "cal")[0].title).toBe(title);
  });

  it("종일 일정과 빈 달력은 그대로다 — 그물의 자기 점검", () => {
    // 위의 것들이 "아무것도 안 내놓는" 구현으로도 통과하지 않게 한다.
    const ics = calendarOf([{ uid: "day", title: "종일", date: "2026-08-22" }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260822");
    expect(ics, "종일 일정의 끝은 다음 날이다 (배타적)").toContain("DTEND;VALUE=DATE:20260823");
    expect(parseIcsEvents(ics, "cal")).toHaveLength(1);

    const empty = createIcs({ version: 1, generatedAt: NOW, events: [] }, NOW);
    expect(empty.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(empty.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(parseIcsEvents(empty, "cal")).toHaveLength(0);
  });
});
