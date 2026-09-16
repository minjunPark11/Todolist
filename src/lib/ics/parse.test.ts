// 남이 준 바이트로 만든 달력.
//
// `parseIcsEvents` 는 이 앱이 통제하지 않는 유일한 입력을 읽는다 — 외부 캘린더
// URL 이 돌려주는 ICS 다. 그 바이트는 잘려 있을 수도, 규격을 어길 수도, 그냥
// 쓰레기일 수도 있다. `./recurrence` 에는 검사가 있었지만 파서 자체에는 없었다.
//
// 스물한 가지로 때려보니 스무 가지는 우아하게 넘어갔고 하나가 던졌다: 자릿수만
// 맞는 날짜(`99999999T000000Z`)에서 `RangeError: Invalid time value`. 정규식은
// year=9999 · month=99 · day=99 를 통과시키고, 그 `Date` 는 Invalid 가 되며
// `toISOString()` 이 던진다.
//
// 그 하나가 왜 큰가: 던지면 그 **이벤트 하나가 아니라 피드 전체의 파싱이 죽는다**.
// 서버 경로(`server/data/calendar/icsSource.ts`)는 이 호출을 `try` 로 감싸므로
// 그 달력이 `ok: false` 로 떨어지지만, 앱 경로(`lib/externalCalendars.ts:180`)는
// 감싸지 않는다 — 달력 하나가 통째로 사라진다.
//
// 이 파일이 지키는 것은 **파서의 계약**이다: 못 읽으면 `null` 을 주고, 못 읽는
// 이벤트는 건너뛰고, 나머지는 살린다.
import { describe, expect, it } from "vitest";
import { parseIcsDate, parseIcsEvents } from "./parse";

const wrap = (body: string) => `BEGIN:VCALENDAR\n${body}\nEND:VCALENDAR`;
const event = (body: string) => wrap(`BEGIN:VEVENT\n${body}\nEND:VEVENT`);

describe("읽을 수 없는 날짜", () => {
  it("자릿수만 맞는 날짜에 던지지 않는다", () => {
    // `99999999` 는 `\d{8}` 이 아니라 `\d{4}\d{2}\d{2}` 로 갈라져 month=99 가 된다.
    expect(() => parseIcsDate("99999999T000000Z")).not.toThrow();
    expect(parseIcsDate("99999999T000000Z"), "못 읽으면 null 이 이 함수의 답이다").toBeNull();
    expect(parseIcsDate("20261332T000000Z"), "13월 32일도 마찬가지다").toBeNull();
  });

  it("한 이벤트의 날짜가 망가져도 나머지는 살아남는다", () => {
    const feed = wrap(
      [
        "BEGIN:VEVENT\nUID:broken\nDTSTART:99999999T000000Z\nSUMMARY:망가진 것\nEND:VEVENT",
        "BEGIN:VEVENT\nUID:good\nDTSTART:20260101T090000Z\nSUMMARY:멀쩡한 것\nEND:VEVENT",
      ].join("\n"),
    );

    let events: ReturnType<typeof parseIcsEvents> = [];
    expect(() => {
      events = parseIcsEvents(feed, "cal");
    }, "날짜 하나가 달력 전체를 죽이면 안 된다").not.toThrow();

    expect(events.map((e) => e.title)).toEqual(["멀쩡한 것"]);
  });
});

describe("남이 준 바이트를 견딘다", () => {
  const hostile: [string, string][] = [
    ["빈 문자열", ""],
    ["VEVENT 가 없다", wrap("")],
    ["중간에 잘렸다", "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART:20260101T09"],
    ["END 만 있다", "END:VEVENT\nEND:VEVENT"],
    ["날짜가 글자다", event("UID:a\nDTSTART:안녕하세요\nSUMMARY:x")],
    ["DTSTART 가 없다", event("UID:b\nSUMMARY:x")],
    ["DTSTART 가 비었다", event("UID:c\nDTSTART:\nSUMMARY:x")],
    ["음수처럼 보인다", event("UID:e\nDTSTART:-0001231T000000Z")],
    ["첫 줄이 접혀 있다", " 앞줄이 없는데 접혔다\nBEGIN:VEVENT\nUID:g\nDTSTART:20260101T090000Z\nEND:VEVENT"],
    ["COUNT 가 십억이다", event("UID:h\nDTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;COUNT=999999999")],
    ["INTERVAL 이 0 이다", event("UID:i\nDTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;INTERVAL=0")],
    ["INTERVAL 이 음수다", event("UID:j\nDTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;INTERVAL=-5")],
    ["FREQ 가 헛소리다", event("UID:k\nDTSTART:20260101T090000Z\nRRULE:FREQ=FORTNIGHTLY")],
    ["BYDAY 에 숫자가 있다", event("UID:l\nDTSTART:20260101T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=1,2,글자")],
    ["TZID 가 화성이다", event("UID:m\nDTSTART;TZID=Mars/Olympus:20260101T090000")],
    ["EXDATE 가 쓰레기다", event("UID:n\nDTSTART:20260101T090000Z\nEXDATE:쓰레기,,20260102T090000Z")],
    ["제목에 제어문자가 있다", event(`UID:o\nDTSTART:20260101T090000Z\nSUMMARY:${String.fromCharCode(0, 7, 27)}위험`)],
    ["역슬래시가 이만 개다", event("UID:p\nDTSTART:20260101T090000Z\nSUMMARY:" + "\\\\".repeat(20000))],
    ["접힌 줄이 오만 번이다", "BEGIN:VEVENT\nUID:f\nDTSTART:20260101T090000Z\nSUMMARY:x\n" + " y".repeat(50000) + "\nEND:VEVENT"],
  ];

  it.each(hostile)("%s", (_label, text) => {
    expect(() => parseIcsEvents(text, "cal")).not.toThrow();
  });

  it("만 개짜리 피드를 제때 읽는다", () => {
    const feed = wrap(
      Array.from(
        { length: 10_000 },
        (_, i) => `BEGIN:VEVENT\nUID:u${i}\nDTSTART:20260101T090000Z\nSUMMARY:e${i}\nEND:VEVENT`,
      ).join("\n"),
    );

    const started = Date.now();
    const events = parseIcsEvents(feed, "cal");
    const elapsed = Date.now() - started;

    expect(events).toHaveLength(10_000);
    // 실측 100~140ms. 1초는 "선형이 이차가 되면 잡는다"는 뜻의 천장이지 목표가
    // 아니다 — 기계마다 다른 숫자에 검사를 걸지 않으려고 넉넉히 둔다.
    expect(elapsed, `만 개에 ${elapsed}ms 걸렸다 — 선형이 아니게 됐을 수 있다`).toBeLessThan(1000);
  });
});
