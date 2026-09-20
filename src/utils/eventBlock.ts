// What fits inside an event block.
//
// The block's height is the event's duration, so how much text it can hold is
// not a style question — it is arithmetic on a number the grid computed.
// CALENDAR_GEOMETRY_DESIGN R1 halved the hour row and then let it follow the
// window, which made short events shorter than the two lines they were drawing:
// a 30-minute event is 26px at a 52px row, and 26px cannot hold a 14px title
// plus a 13px time under 14px of chrome.
//
// METRICS §2.4 recorded that Calendar.app shows the time line "only when the
// block is tall enough". This is that rule, with our own numbers in it.

/** 2px inset border and 5px padding, top and bottom (R5). */
const BLOCK_CHROME = 14;
/** The same chrome once the block is too short to spend 5px on padding. */
const TIGHT_CHROME = 6;
const TITLE_LINE = 14;
const TIME_LINE = 13;

/** Both lines fit, so the time is worth drawing. */
export function blockShowsTime(height: number): boolean {
  return height - BLOCK_CHROME >= TITLE_LINE + TIME_LINE;
}

/**
 * Even the title does not fit at full padding.
 *
 * The block gives the padding up rather than the title: a 15-minute event is
 * 24px, which holds a title at 1px of padding and nothing at 5.
 */
export function blockIsTight(height: number): boolean {
  return height - BLOCK_CHROME < TITLE_LINE && height - TIGHT_CHROME >= TITLE_LINE;
}

/**
 * 제목이 쓸 수 있는 줄 수.
 *
 * `blockShowsTime` 은 시간 줄을 그릴지를 높이로 정한다. 제목은 그 질문을 한
 * 번도 받지 않았고, 그래서 블록이 아무리 높아도 늘 한 줄이었다 [실측,
 * 생산 빌드 1440x900]:
 *
 *   블록 높이 78px · 제목 상자 99x14px · 제목이 원한 너비 189px / 243px
 *   → 52% 와 41% 만 보이고 나머지는 잘렸다. 그 블록 안에서 44px 이 비어 있었다.
 *
 * 이 모듈의 머리말이 적어둔 대로 "블록이 담을 수 있는 글의 양은 스타일
 * 질문이 아니라 격자가 계산한 숫자에 대한 산술"이다. 제목도 같은 산술을
 * 받는다.
 *
 * 세 줄에서 끊는 것은 두 시간짜리 블록이 글 벽이 되지 않게 하기 위해서다 —
 * 블록은 일정을 알아보는 자리이지 읽는 자리가 아니다.
 */
export function blockTitleLines(height: number): number {
  const room = height - BLOCK_CHROME - (blockShowsTime(height) ? TIME_LINE : 0);
  return Math.max(1, Math.min(3, Math.floor(room / TITLE_LINE)));
}
