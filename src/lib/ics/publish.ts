// 공유 캘린더가 내놓는 ICS — `parse.ts` 의 반대쪽.
//
// 오래 `api/calendar/[token].js` 안에 손으로 쓴 채 들어 있었다. 손으로 쓴
// `api/**` 는 번들러가 건드리지 않으므로 타입도 검사도 닿지 않았고, 읽는
// 쪽(`parse.ts`)은 검사가 두 파일이나 되는데 쓰는 쪽은 하나도 없었다. 둘을
// 나란히 두면 왕복을 잴 수 있다 — 이 파일의 검사가 그렇게 한다.
//
// 재보니 세 군데가 어긋나 있었다 [실측 — 생성기를 그대로 돌리고, 그 결과를
// 이 앱 자신의 `parseIcsEvents` 로 되읽었다].
import type { CalendarShareSnapshot, SharedCalendarEvent } from "../calendarShare";

/**
 * RFC 5545 §3.1 — 한 줄은 **75 옥텟**을 넘지 않는다. 넘으면 CRLF 와 공백
 * 하나로 접고, 읽는 쪽이 그 공백을 떼어 잇는다.
 *
 * 접는 코드가 아예 없었다. 한글 제목은 스물몇 자에서 이 선을 넘으므로
 * 드문 경우가 아니라 보통의 경우다 — 검증에 쓴 제목 하나가 191 옥텟짜리
 * 한 줄로 나갔다. 이 앱의 파서는 접힌 줄을 펼 줄 알아서(그쪽에는
 * `unfoldIcsLines` 가 있다) 되읽기는 됐지만, 구독하는 쪽이 이 앱이라는
 * 보장은 없다.
 */
const MAX_OCTETS = 75;

/** 브라우저 번들에 딸려 들어가도 괜찮도록 `Buffer` 를 쓰지 않는다. */
const encoder = new TextEncoder();

function fold(line: string): string {
  const pieces: string[] = [];
  let current = "";
  let used = 0;
  // 코드 포인트 단위로 돈다. 옥텟으로 자르면 한 글자가 반으로 갈린다.
  for (const character of line) {
    const size = encoder.encode(character).length;
    // 이어지는 줄은 맨 앞의 공백 하나도 75 에 든다.
    const budget = pieces.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (used > 0 && used + size > budget) {
      pieces.push(current);
      current = "";
      used = 0;
    }
    current += character;
    used += size;
  }
  pieces.push(current);
  return pieces.join("\r\n ");
}

/**
 * RFC 5545 §3.3.11 의 TEXT — 역슬래시 · 쉼표 · 세미콜론 · 줄바꿈.
 *
 * 줄바꿈 처리가 `\n` 만 보고 있었다. 홀로 선 CR 은 그대로 나갔고, 줄을 CRLF
 * 로 잇는 파일 안에 날것의 CR 이 박히면 그 자리에서 줄이 끊긴다. 이 앱의
 * 파서로 되읽어 보면 CR 뒤의 글자가 통째로 사라졌다 [실측]:
 *
 *   보낸 것   "캐리지리턴\r다음"
 *   돌아온 것 "캐리지리턴"
 *
 * 윈도우에서 복사한 글을 제목에 붙이면 닿는 경로다.
 */
function escapeText(value: string): string {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    // CRLF · CR · LF 를 한 가지로 모으고 나서 한 번에 바꾼다.
    .replace(/\r\n|\r|\n/g, "\\n");
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function compactDate(value: string): string {
  return value.replace(/-/g, "");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * 끝나는 시각. 날짜가 같다는 보장이 없다.
 *
 * 전에는 시각만 계산하고 날짜는 시작과 같은 것을 썼으며, 한 시간을 더하는
 * 함수가 `Math.min(hour + 1, 23)` 으로 **23 시에 붙잡혀 있었다.** 그래서
 * 끝 시각이 없는 23:30 일정은 이렇게 나갔다 [실측]:
 *
 *   DTSTART:20260818T233000
 *   DTEND:20260818T233000
 *
 * 길이 0 짜리다. 저녁에 시각만 적어둔 할 일이면 닿는 경로이고, 구독하는
 * 달력에는 한 시간짜리 일정이 아니라 점 하나로 들어간다.
 *
 * 자정을 넘는 일정도 같은 자리에서 틀렸다. 23:00~01:00 은 끝이 시작보다
 * 앞이므로 DTEND 가 DTSTART 보다 이른 일정이 되는데, 그것은 RFC 가 아예
 * 허용하지 않는 모양이다.
 */
function endMoment(date: string, startTime: string, endTime: unknown): { date: string; time: string } {
  if (isTime(endTime)) {
    // 같거나 앞서면 다음 날로 넘어간 것이다.
    return endTime > startTime ? { date, time: endTime } : { date: addDays(date, 1), time: endTime };
  }
  const [hour, minute] = startTime.split(":").map(Number);
  const next = hour + 1;
  return next > 23 ? { date: addDays(date, 1), time: `${pad(next - 24)}:${pad(minute)}` } : { date, time: `${pad(next)}:${pad(minute)}` };
}

function floating(date: string, time: string): string {
  return `${compactDate(date)}T${time.replace(":", "")}00`;
}

function toUtcStamp(value: string): string {
  const date = new Date(value);
  const usable = Number.isNaN(date.getTime()) ? new Date() : date;
  return usable.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function isValidEvent(event: unknown): event is SharedCalendarEvent {
  const record = event as Record<string, unknown> | null;
  return Boolean(
    record?.uid && record?.title && typeof record?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date),
  );
}

function eventToIcs(event: SharedCalendarEvent, updatedAt: string): string[] {
  const stamp = toUtcStamp(updatedAt);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}@focusflow`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (isTime(event.startTime)) {
    const end = endMoment(event.date, event.startTime, event.endTime);
    lines.push(`DTSTART:${floating(event.date, event.startTime)}`);
    lines.push(`DTEND:${floating(end.date, end.time)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`);
  }

  lines.push("END:VEVENT");
  return lines;
}

/** 스냅샷 하나를 구독할 수 있는 달력 한 장으로. */
export function createIcs(snapshot: CalendarShareSnapshot | null | undefined, fallbackUpdatedAt: string): string {
  const generatedAt = snapshot?.generatedAt || fallbackUpdatedAt;
  const events = Array.isArray(snapshot?.events) ? snapshot.events.filter(isValidEvent) : [];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FocusFlow//Calendar Share//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:FocusFlow",
    ...events.flatMap((event) => eventToIcs(event, generatedAt)),
    "END:VCALENDAR",
  ];
  // 접는 것은 마지막에 한 번. 모든 줄이 대상이다 — 긴 것은 제목뿐이 아니고,
  // UID 도 사람이 정한 글자를 담을 수 있다.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
