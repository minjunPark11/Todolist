# 격자 위에서 한 일과 안 한 일을 가르는 법

> 상태: **구현됨** · 2026-09-04 (D1 = B · D2 = A · D3 = D · D4 = A · D5 = B · D6 = 예, 사용자 승인 — §8.1은 구현하며 바뀐 것)
> (사용자가 넉 장을 주었다: ①②③ 참조 앱의 월·주·일 화면 — 모든 항목 왼쪽에
> 체크박스가 있고, 끝낸 일은 **체크된 채 흐리게 남아 있다** ④ 우리 앱의
> `.gcal-draft-block` — 연한 파란 네모.)
> 대상: `utils/calendarItems.ts` · `components/calendar/{WeekView,MonthView}.tsx` ·
> `components/CalendarView.tsx` · `app/AppPages.tsx` ·
> `styles/{02-calendar,10-calendar-apple}.css` · `components/tasks/TaskCheck.tsx`
> 선행 문서: `CALENDAR_APPLE_DESIGN.md`(§A2/A3 색 파생 · §D1 색은 "어느 달력인가"만 말한다) ·
> `TASK_PRIORITY_CHECKBOX_DESIGN.md`(체크박스의 그림과 색) ·
> `CALENDAR_GEOMETRY_DESIGN.md`(블록 높이는 지속시간이다) ·
> `CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md`(§1 초안 네모의 22%)

## 0. 근거 수준

| 등급 | 무엇 | 표기 |
|---|---|---|
| **관찰** | 스크린샷 4장 (위) | [관찰] |
| **실측** | 코드에서 잰 것 — `--ev-tint` 14%/30% · `.gcal-draft-block` 22% · `MIN_SLOT_HEIGHT 44` · `heightFor`의 24px 바닥 · `--check-size 15px` · `CATEGORY_COLOR_PALETTE` 8색 · `calendarItems.ts:298`의 완료 필터 | [실측] |
| **계산** | 8색 팔레트 각각에 대한 흰 글씨 대비비 (§3.3) | [계산] |
| **결정** | 사용자가 고를 것 여섯 (D1~D6) — 아직 없음 | [결정] |
| **추론** | 참조 앱의 채움 비율 · 좁은 블록에서 무엇을 버릴지 | [추론] |

---

## 1. 먼저 사실 하나 — 끝낸 일은 지금 캘린더에 없다 [실측]

체크박스를 그리기 전에 이것부터다. **완료한 태스크는 캘린더에서 사라진다.**

```ts
// utils/calendarItems.ts:298
if (done && !layers.completed) continue;

// utils/calendarItems.ts:39
export const defaultCalendarLayers: CalendarLayerToggles = {
  task: true,
  completed: false,   // ← 이것
  focusActual: true,
};

// components/CalendarView.tsx:236
layers: defaultCalendarLayers,   // ← 하드코딩. 이 값을 바꾸는 UI는 어디에도 없다.
```

`completed` 토글을 켜는 화면이 **하나도 없다**. 좌측 사이드바에도, 툴바에도, 설정에도
없다. 그러니까 지금 이 앱에서 태스크를 끝내면 그 시간대는 격자에서 그냥 비어 버린다.

이게 왜 설계의 1번인가: [관찰] ①의 참조 앱은 8/28~9/3 줄 전체를 **체크된 채 흐리게**
남겨 두었다. 지난주가 무엇으로 채워져 있었는지가 그 화면의 절반이다. 체크박스는 그
화면을 만드는 도구지, 그 자체가 목적이 아니다. **끝낸 일이 남지 않으면 체크박스는
"누르면 사라지는 버튼"이 된다** — 누른 근거가 화면에서 즉시 지워지므로.

### 1.1 결정 D1 — 끝낸 일을 남길 것인가

| 안 | 무엇 | 대가 |
|---|---|---|
| **A** | `completed: true`를 기본으로. 토글 없음 | 격자가 붐빈다. 되돌릴 길이 없다 |
| **B** | `completed: true` 기본 + 좌측 사이드바에 "완료한 일" 토글 | 사이드바에 줄 하나. 설계·구현 가장 큼 |
| **C** | 현행 유지(`false`) + 체크박스는 "누르면 사라짐" | 체크박스가 취소 불가능한 삭제처럼 읽힌다 |

> **권장 B.** A는 되돌릴 수 없고 C는 §5의 상태(끝낸 일)를 그릴 대상이 아예 없다.
> B의 토글 자리는 이미 있다 — `CalendarLeftSidebar`의 "My Calendars" 위. 켠 상태를
> 기본값으로 두고, 붐비면 끄면 된다.

---

## 2. 블록은 `<button>`이다 — 안에 체크박스를 넣을 수 없다 [실측]

```tsx
// WeekView.tsx:925 — 시간 블록
<motion.button type="button" className="gcal-time-block" …>
// WeekView.tsx:696 — 종일 칩
<motion.button type="button" className="gcal-chip" …>
// MonthView.tsx:126 — 월간 칩
<motion.button type="button" className="gcal-month-chip" …>
```

셋 다 `<button>`이고, HTML의 `<button>`은 **interactive content를 자손으로 가질 수
없다**. `<input type="checkbox">`를 그 안에 쓰면 명세 위반이고, 파서가 고쳐 놓는 DOM은
우리가 쓴 것과 다르다. 클릭도 겹친다 — 바깥 버튼이 팝업을 여는 동안 안쪽 상자가
완료를 쓴다.

지금 블록 안에 있는 `.gcal-resize-handle`은 `<span role="presentation">`이라 이 규칙에
걸리지 않는다. 체크박스는 다르다.

### 2.1 결정 D2 — 무엇으로 바꿀 것인가

| 안 | 구조 | 얻는 것 | 잃는 것 |
|---|---|---|---|
| **A** | 블록을 `<div role="button" tabIndex={0}>`으로 바꾸고 안에 진짜 `<input type="checkbox">` | 체크박스의 접근성이 공짜(Space 토글·`:checked`·"체크박스, 선택 안 됨") | 블록 쪽의 Enter/Space 처리를 손으로 써야 한다 |
| **B** | 블록은 `<button>` 그대로, 체크박스를 **형제**로 블록 위에 절대배치 | 블록 코드 무변경 | 좌표를 두 곳에서 계산. 겹침 레이아웃에서 어긋난다 |
| **C** | `<span role="checkbox" tabIndex={0}>`을 블록 안에 | 구조 무변경 | 키보드·상태·스크린리더를 전부 손으로. `TaskCheck.tsx`가 "그러지 말자"고 쓴 그것 |

> **권장 A.** `TaskCheck.tsx`의 주석이 C를 이미 한 번 기각했다 — "`<span
> role="checkbox">`로 바꾸는 건 그 전부를 손으로 다시 짓는 일이고, 요청은 색이었다".
> 여기서도 요청은 체크박스지 접근성 재구현이 아니다. A에서 블록이 잃는 것은 작다:
> `<button>`이 공짜로 주던 건 Enter/Space→click과 `type="button"`뿐이고,
> 그건 `onKeyDown` 네 줄이다.

---

## 3. 색 — 지금 얼마나 흐린가 [실측]

```css
/* 10-calendar-apple.css:14 */
.gcal-time-block { --ev-tint: 14%; --ev-ink: 74%; }
[data-theme="dark"] .gcal-time-block { --ev-tint: 30%; --ev-ink: 55%; }
background: color-mix(in srgb, var(--ev-color) var(--ev-tint), transparent);

/* 02-calendar.css:733 — 초안 네모 ([관찰] ④가 이것) */
.gcal-draft-block { background: color-mix(in srgb, var(--color-primary) 22%, transparent); }
```

**섞은 결과** (기본 파랑 `#0066cc`, 액센트 `#007aff`):

| 무엇 | 배합 | 캔버스 | 결과 |
|---|---|---|---|
| 블록 · 라이트 | 14% | `#ffffff` | `#dbeaf8` |
| 블록 · 다크 | 30% | `#101012` | `#0b2a4a` |
| 초안 네모 · 라이트 | 22% | `#ffffff` | `#c7e2ff` ← [관찰] ④ |
| 칩(종일/월간) · 라이트 | 16% | `#ffffff` | `#d6e7f7` |

이게 "흐리다"의 정체다. 14%는 색이 아니라 **색의 기억**이다. [관찰] ②③의 참조 앱은
같은 자리를 60~70%로 칠한다.

### 3.1 왜 이렇게 되어 있나

의도가 있었다. `CALENDAR_APPLE_DESIGN.md` §A2/A3은 Apple 캘린더를 참조로 삼았고,
Apple은 **연한 틴트 + 색이 밴 글씨**를 쓴다. 그 판단은 틀리지 않았다 — 다만 참조가
달랐을 뿐이다. 사용자가 이번에 가져온 참조는 Google 캘린더 계열의 **진한 채움 + 흰
글씨**다. 바꾸는 것은 취향이 아니라 참조의 교체이고, 그러면 §A2/A3의 문장도 같이
고쳐야 한다.

### 3.2 팔레트는 8색으로 고정되어 있다 [실측]

```ts
// lib/calendar/categoryModel.ts:53
export const CATEGORY_COLOR_PALETTE =
  ["#0066cc", "#34c759", "#ff2d55", "#ff9500", "#af52de", "#5856d6", "#00b8a9", "#8e8e93"];
```

임의의 색이 아니라 여덟 개다. 그래서 대비를 **미리 다 계산할 수 있다**.

### 3.3 그런데 "불투명 채움 + 흰 글씨"는 여덟 중 여섯에서 실패한다 [계산]

WCAG 상대휘도로 계산한 대비비. 블록 글씨는 11px/10px라 **4.5:1**이 기준이다 —
큰 글씨 예외(3:1)를 쓸 수 없다.

| 색 | 이름 | 흰 글씨 | 검정 글씨 | 읽히는 쪽 |
|---|---|---|---|---|
| `#5856d6` | 남보라 | **5.65** ✅ | 3.72 ❌ | 흰 |
| `#0066cc` | 파랑 | **5.57** ✅ | 3.77 ❌ | 흰 |
| `#af52de` | 보라 | 4.13 ❌ | **5.08** ✅ | 검정 |
| `#ff2d55` | 분홍 | 3.65 ❌ | **5.76** ✅ | 검정 |
| `#8e8e93` | 회색 | 3.26 ❌ | **6.44** ✅ | 검정 |
| `#00b8a9` | 청록 | 2.49 ❌ | **8.43** ✅ | 검정 |
| `#34c759` | 초록 | 2.22 ❌ | **9.46** ✅ | 검정 |
| `#ff9500` | 주황 | 2.20 ❌ | **9.55** ✅ | 검정 |

**흰 글씨를 고정하면 여덟 중 여섯이 읽히지 않는다.** 참조 앱도 이걸 통과하지 못한다
([관찰] ③의 올리브색 "Collect a delivery" 위 흰 글씨는 약 2.5:1). 우리 문서들은 4.5:1을
여러 번 근거로 써 왔으므로, 참조를 그대로 베끼면 그 기준을 버리는 셈이다.

**그런데 오른쪽 열이 답을 준다.** 흰 글씨에서 떨어진 여섯이 검정 글씨에서는 **전부
5.08 이상**으로 통과한다. 즉 불투명 채움 자체가 문제가 아니라 **잉크를 하나로 고정한
것**이 문제다. 색마다 읽히는 쪽을 고르면 팔레트 여덟 색 전부가 통과한다 — D3-C가
성립하는 근거가 이 열이다.

### 3.4 결정 D3 — 어떻게 진하게 할 것인가

| 안 | 채움 | 글씨 | 대비 |
|---|---|---|---|
| **A** 틴트만 올림 | 라이트 14→30%, 다크 30→62% | 지금대로 `--ev-ink` 혼합 | 유지 가능 |
| **B** 불투명 채움 | `--ev-color` 100% | 흰색 고정 | 8색 중 6색 실패 ❌ |
| **C** 잉크 자동 선택 | `--ev-color` 100% | 색의 밝기로 흰/검정 자동 | 전 색 통과 (최저 5.08) ✅ |
| **D** 하이브리드 | **안 한 일 = 진한 채움 · 한 일 = 옅은 틴트** | 각각 C·현행 | 전 색 통과 ✅ |

> **권장 D.** 이유가 세 가지다.
> 1. **색의 세기가 뜻을 갖는다.** 진하면 남은 일, 옅으면 끝난 일. §5의 상태 표가
>    색 하나로 절반 그려진다.
> 2. 4.5:1을 지킨다 — 진한 쪽은 C의 잉크 규칙, 옅은 쪽은 지금 이미 통과한 값.
> 3. §A2/A3의 `color-mix` 구조를 버리지 않는다. 바뀌는 건 `--ev-tint`의 **값**과
>    `--ev-ink`가 임계 위에서 `--text-primary`로 넘어간다는 규칙 하나다.
>
> C의 "자동"은 CSS가 못 한다(`color-contrast()`는 지원이 없다). 순수 함수 하나로 짓는다:
> ```ts
> // domain/calendar/readableInk.ts
> /** 이 채움 위에서 읽히는 글씨색. 팔레트 8색 전부에 대한 테스트가 붙는다. */
> export function readableInkOn(hex: string): "light" | "dark";
> ```
> 이건 도메인 순수 함수라 테스트가 쉽고, `item.color`가 이미 계산되는 자리
> (`calendarItems.ts`)에서 한 번 부르면 CSS로 넘길 값 하나가 나온다.

---

## 4. 체크박스가 들어갈 자리가 있는가 [실측]

블록 높이는 지속시간이다. 잰 값:

```ts
// utils/calendarTime.ts:49
export const MIN_SLOT_HEIGHT = 44;        // 시간당 최소 44px
// WeekView.tsx:253
Math.max(((endMin - startMin) / 60) * slotHeight, 24)   // 블록 높이 바닥 24px
// utils/eventBlock.ts
const BLOCK_CHROME = 14;  // 테두리 2×2 + 패딩 5×2
const TIGHT_CHROME = 6;   // is-tight일 때
const TITLE_LINE = 14; const TIME_LINE = 13;
// 01-base.css:14
--check-size: 15px;
```

| 지속시간 | 블록 높이(최소 슬롯) | 지금 그리는 것 | 15px 상자가 들어가나 |
|---|---|---|---|
| 15분 | 24px (바닥에 걸림) | 제목만 (`is-tight`) | 24−15 = 9px 남음 → **들어간다** |
| 30분 | 24px (22→바닥) | 제목만 (`is-tight`) | 들어간다 |
| 45분 | 33px | 제목만 | 들어간다 |
| 1시간 | 44px | 제목 + 시간 | 들어간다 |

**세로로는 다 들어간다.** 문제는 세 가지다.

1. **블록이 지금 세로 배치다.** `02-calendar.css:757`이 `flex-direction: column`
   (제목 위, 시간 아래). 체크박스가 붙으려면 바깥이 가로 한 줄
   `[상자][제목/시간 세로묶음]`이 되어야 한다. 구조 변경이다.
2. **가로 폭.** 15px + 간격 6px = 21px를 제목에서 뺏는다. 주간 7열에서 한 열은
   [실측] 148px였다. 21px는 그 14%다 — 제목이 그만큼 일찍 잘린다.
3. **터치 최소 크기.** 15px 상자는 손가락 대상이 아니다. 목록 행이 쓰는 방법을
   그대로 가져온다 — `.tm-task-check`가 `align-self: stretch; padding: 0 6px`로
   **상자는 15px, 누를 수 있는 곳은 행 전체 높이**로 만든다(`17-tasks-module.css:387`).
   블록에서도 같게: 상자는 15px, 히트 영역은 블록 높이 × 27px.

### 4.1 결정 D4 — 좁은 블록에서 무엇을 버리나

| 안 | 24px(15·30분) 블록 |
|---|---|
| **A** | 체크박스도 그린다 — 제목이 21px 짧아진다 |
| **B** | 체크박스를 빼고 제목만 — 15분 일정은 격자에서 완료할 수 없다 |
| **C** | 체크박스만 그리고 제목은 툴팁으로 |

> **권장 A.** B는 "어떤 일정은 체크가 안 된다"는 규칙을 하나 더 만든다 — 사용자가
> 왜인지 알 방법이 없는 규칙이다. C는 제목이 없으면 무엇을 체크하는지 모른다.
> A의 대가(제목 21px)는 `text-overflow: ellipsis`가 이미 처리하고 있다.

### 4.2 설계가 놓친 것 — 줄바꿈이 제목을 먹는다

"제목이 21px 짧아진다"까지는 맞았고, 그 대가를 ellipsis가 치른다는 것도 맞았다. 놓친
것은 **시간 줄**이다. 상자가 27px를 가져가자 좁은 주간 열에서 `8:00 AM – 9:00 AM`이 두
줄로 넘어갔고, 세로 flex는 넘치기 전에 형제를 먼저 줄이므로 44px 블록이 **3px짜리
제목**을 그렸다.

`blockShowsTime`은 시간 줄을 그릴지를 **높이**로 판단한다(`eventBlock.ts`). 폭은 그
함수의 소관이 아니고, 제목이 늘 그래 왔듯 ellipsis의 몫이다. 그래서 두 줄 모두
`flex: none` + `nowrap` + `ellipsis`로 고정했다 — 한 줄이 다른 줄의 값을 치르지 않게.

---

## 5. 상태 설계 — 사용자가 물은 것

체크박스가 **붙는 항목**: `layer === "task"` 뿐이다. 외부 캘린더(`external`)와 실제
집중 시간(`focus-actual`)에는 붙지 않는다 — 전자는 우리 것이 아니고, 후자는 이미 지난
시간의 기록이라 "할 일"이 아니다. 자리도 비우지 않는다(캘린더 블록은 목록 행이
아니라서 서로 왼쪽 정렬을 맞출 이유가 없다).

| # | 상태 | 조건 | 체크박스 | 블록 채움 | 제목 | 커서 |
|---|---|---|---|---|---|---|
| 1 | **안 한 일 · 기본** | task · !done | 1.5px 테두리, 속 비었음 | 진한 채움 (D3) | 잉크색 (D3) | 상자 `pointer` / 블록 `grab` |
| 2 | 안 한 일 · 상자 hover | | 테두리 한 단계 진하게 + 속에 6% 채움 | **변화 없음** | | `pointer` |
| 3 | 안 한 일 · 블록 hover | | 변화 없음 | `--ev-tint-hover`로 한 단계 | | `grab` |
| 4 | 안 한 일 · 키보드 초점 | `:focus-visible` | 2px 링, offset 2 (`--ff-focus-ring`) | | | |
| 5 | 안 한 일 · 누르는 중 | `:active` | 테두리 색 유지, 속 12% | | | |
| 6 | **한 일** | task · done | 회색(`--text-tertiary`) 채움 + 흰 체크 | 옅은 틴트로 후퇴 | `--text-muted` | `pointer` |
| 7 | 한 일 · 블록 hover | | | 한 단계만 복귀 | | |
| 8 | 한 일 · 상자 hover | | 테두리 살짝 밝게 (되돌릴 수 있다는 신호) | | | `pointer` |
| 9 | **붙지 않음 · 외부** | `layer === "external"` | 없음 | 점선 테두리 유지 | | `default` |
| 10 | **붙지 않음 · 집중 기록** | `layer === "focus-actual"` | 없음 | 빗금 유지 | | `default` |
| 11 | 드래그 중 | `.gcal-move-block` | 없음(미리보기다) | 진한 채움 | | `grabbing` |
| 12 | 크기 조절 중 | `.is-resizing` | 그대로, 반응 없음 | `opacity: .85` | | `ns-resize` |

### 5.1 체크박스는 무슨 색인가 — 결정 D5

목록 행의 상자(`.tm-check`)는 **우선순위 색**으로 테두리를 그린다
(`TASK_PRIORITY_CHECKBOX_DESIGN.md` §4). 캘린더 블록은 이미 **카테고리 색**으로
칠해져 있다. 그대로 가져오면 한 상자 안에서 두 색 체계가 싸운다.

| 안 | 테두리 색 | 뜻 |
|---|---|---|
| **A** | 우선순위 색 | 목록·매트릭스와 같은 상자. 카테고리 채움 위에 다른 색이 뜬다 |
| **B** | 잉크색 상속(`currentColor`) | 블록과 한 몸으로 읽힌다. 우선순위는 캘린더에서 안 보임 |
| **C** | 중립 흰/검정 (D3의 잉크와 같이) | 가장 조용하다 |

> **권장 B.** `CALENDAR_APPLE_DESIGN.md` §D1이 이미 정한 규칙이 있다 — "색은 **어느
> 달력인가**만 말하고, 층은 **모양**으로 읽는다". 캘린더에서 우선순위를 색으로 말하기
> 시작하면 그 규칙이 깨지고, 같은 블록에서 카테고리색·우선순위색 둘 중 뭘 보고 있는지
> 아무도 모르게 된다. `currentColor`면 규칙도 지키고 코드도 한 줄이다.
> (매트릭스가 `showPriority={false}`로 같은 판단을 이미 한 적이 있다.)

### 5.2 끝낸 일은 지금 이미 흐려져 있다 [실측]

```css
/* 02-calendar.css:804 */
.gcal-time-block.is-done { opacity: 0.72; filter: saturate(0.72); }
/* 10-calendar-apple.css:114 — hover가 filter를 지우지 않도록 다시 씀 */
.gcal-time-block.is-done:hover { filter: saturate(0.72); }
```

`is-done` 배선은 이미 다 되어 있다 — `calendarItems.ts`가 `done`을 실어 보내고,
세 뷰가 전부 클래스를 붙인다. **§1의 필터 때문에 그 코드가 한 번도 화면에 나온 적이
없을 뿐이다.** D1을 B로 정하면 이 규칙들이 그날 처음 켜진다.

취소선은 넣지 않는다 — `TICKTICK_COMPONENT_06 §16`이 이미 "흐림 + 채도 낮춤이 같은
말을 한 번 하는 것"이라고 정했고, `02-calendar.css:812`의 주석이 그걸 인용하고 있다.

---

## 6. 제스처 충돌 — 상자를 누르는 것이 다른 셋을 깨우지 않게

블록 근처에서 `pointerdown`을 듣는 것이 셋이다.

| 무엇 | 어디 | 하는 일 |
|---|---|---|
| 시간대 드래그 선택 | `.gcal-time-col`의 `handlePointerDown` (WeekView:334) | 새 일정 초안 |
| 블록 이동 | 블록의 `startMove` (WeekView:942) | 드래그로 옮기기 |
| 크기 조절 | `.gcal-resize-handle` (WeekView:984) | 시작/끝 늘리기 |

**열의 선택은 이미 막혀 있다** [실측]:

```ts
// utils/calendarTime.ts:126
export function shouldStartTimeSelection(target: EventTarget | null): boolean {
  if (el.closest('[data-calendar-interactive="true"]')) return false;
  if (el.closest("button, input, textarea, select, a")) return false;   // ← input
  return true;
}
```

`<input type="checkbox">`면 두 번째 줄에 걸려 자동으로 통과한다. **막아야 하는 것은
블록 자신의 이동**이다. 상자에 필요한 것:

```tsx
onPointerDown={(e) => e.stopPropagation()}   // startMove가 안 깨어나게
onClick={(e) => e.stopPropagation()}         // 팝업/디테일이 안 열리게
onChange={() => onToggleDone(item.sourceId)} // 여기서만 쓴다
```

`suppressClickRef` 패턴(WeekView:437)은 여기선 필요 없다 — 그건 드래그 끝의 클릭을
지우는 장치고, 체크박스는 드래그를 시작한 적이 없다.

한 가지 더: 블록에 `touch-action: none`(`02-calendar.css:768`)이 걸려 있다. 상자에는
`touch-action: manipulation`을 되돌려 줘야 터치에서 탭이 먹는다.

---

## 7. 무엇을 저장하는가 — 이미 있는 길로

새 쓰기 경로를 만들지 않는다. `usePlannerData`에 정답이 이미 있다:

```ts
// hooks/usePlannerData.ts:1310
function toggleTaskDone(taskId: string) { … }
```

이게 하는 일 — 캘린더가 직접 `updateTask({status})`를 쓰면 **전부 놓치는 것들**이다:

- `status`와 `completedAt`을 **함께** 쓴다 (§12.12: 완료가 두 곳에 저장돼 어긋난 사고)
- **반복 태스크**를 안다 — `planRecurringCompletion`으로 다음 회차를 만들고 이번
  회차를 넘긴다 (`usePlannerData.ts:1319`, `:1335`)
- `setData`를 지나므로 **Ctrl+Z 실행취소가 공짜로 붙는다** (`usePlannerData.ts:296`)

배선 한 줄씩:

```tsx
// app/AppPages.tsx:195 — CalendarView에 넘긴다
onToggleTaskDone={planner.toggleTaskDone}
// components/CalendarView.tsx — props에 추가하고 WeekView/MonthView로 통과
```

`CalendarView`가 지금 받는 `onUpdateTask`로 대신하지 않는다. 반복 태스크를 캘린더에서
체크하면 다음 회차가 안 생기는 버그가 정확히 그 지름길에서 나온다.

### 7.1 반복 태스크를 체크하면 블록이 옮겨 간다

`planRecurringCompletion`이 다음 회차를 만들므로, 화요일 블록을 체크하면 그 블록이
회색이 되는 게 아니라 **다음 주 화요일로 사라졌다 나타난다**. 목록에서는 이미 그렇게
동작하지만, 격자에서는 눈에 훨씬 크게 띈다. 토스트로 말해 줄 것:
`calendar.toastRecurringRolled` — "다음 반복으로 넘겼어요 · {날짜}".

---

## 8. 월간 칩과 종일 칩

같은 규칙, 작은 치수.

| | 시간 블록 | 종일 칩 | 월간 칩 |
|---|---|---|---|
| 상자 크기 | 15px | 13px | 12px |
| 히트 영역 | 블록 높이 × 27px | 칩 높이 × 24px | 칩 높이 × 22px |
| 끝낸 표시 | `opacity .72` + `saturate .72` | 10% 틴트 + `opacity .6` (기존) | 같음 |

월간 칩은 [관찰] ①에서 가장 붐비는 자리다 — 한 칸에 넷까지 들어간다. 12px 상자 +
4px 간격이 제목에서 16px를 가져간다. `chipCapFor`(`utils/monthCell.ts`)가 이미 칸 높이로
개수를 줄이고 있으므로 넘치는 문제는 새로 생기지 않는다.

### 8.1 상자가 점을 대신한다 — 구현하며 바뀐 것

설계는 "상자가 점 앞에 온다"고 썼는데, 만들어 보니 그렇게 되지 않는다. `::before`는
자식들보다 먼저 그려지므로 순서는 **점, 상자, 제목**이 되고, 화면에서 가장 조밀한
자리에 6px 간격으로 표식이 둘 서게 된다 — `CALENDAR_APPLE_DESIGN.md` §B2가 알약을
없애면서 지우려던 바로 그것을, 글리프 하나씩 되돌리는 꼴이다.

그래서 시간 있는 월간 칩에서는 **상자가 점을 대신한다**. 하나의 표식이 두 가지를 다
말한다: 색은 어느 달력인가, 체크는 끝났는가. 여기가 D5-B의 유일한 예외다 — 시간 있는
월간 칩은 채움이 없어서 잉크가 셀의 본문색이고, 그걸 상속하면 달력을 전혀 말하지 못한다.
D5-B가 지키려던 규칙은 "한 블록이 두 색 체계를 동시에 보이지 않는다"이고, 이 자리에는
애초에 색 체계가 하나뿐이다.

외부 일정과 집중 기록은 점과 링을 그대로 둔다 — 상자를 받지 않으므로 대신할 것이 없다.

---

## 9. 접근성

- 상자는 `<input type="checkbox">`다 — Space 토글, `:checked`, "체크박스, 선택됨"이
  전부 공짜다 (`TaskCheck.tsx`의 근거를 그대로 승계).
- 이름은 상자가 스스로 말한다: `aria-label={t("calendar.checkAria", { title })}` (`{{title}}` in the string) —
  "제품 리뷰 완료로 표시". 블록에 제목이 보이더라도 상자는 자기 이름을 갖는다.
- 탭 순서: 블록 → 상자 → (다음 블록). 상자가 블록 **안**이므로 자연히 그렇게 된다.
- `forced-colors`: `.tm-check`가 이미 `CanvasText`/`Highlight` 규칙을 갖고 있다
  (`17-tasks-module.css:470`). 캘린더 상자가 `.tm-check`를 재사용하면 따라온다.
- 축소 모션: 체크 시 애니메이션을 넣지 않는다. 넣는다면 `useMotionEnabled()` 뒤에.

---

## 10. 새 문자열

| 키 | 한국어 | English |
|---|---|---|
| `calendar.checkAria` | "{{title}} 완료로 표시" | "Mark {{title}} complete" |
| `calendar.uncheckAria` | "{{title}} 완료 취소" | "Mark {{title}} not complete" |
| `calendar.layerCompleted` | "완료한 일" | "Completed" |
| `calendar.toastRecurringRolled` | "다음 반복으로 넘겼어요 · {{date}}" | "Rolled to the next repeat · {{date}}" |

---

## 11. 무엇을 테스트하는가

**단위 (vitest)**
- `readableInkOn`: 팔레트 8색 전부 + 흰색 + 검정 → 대비 4.5:1 통과 (D3-C/D를 고를 때)
- `buildCalendarItems`: `layers.completed = true`에서 끝낸 태스크가 남는다 (D1)

**E2E (playwright)** — 브라우저의 주장이라 jsdom에서 못 한다
- 블록의 체크박스를 눌러도 **팝업이 열리지 않는다** (§6의 stopPropagation)
- 블록의 체크박스를 눌러도 **블록이 이동하지 않는다** (§6의 startMove)
- 열의 빈 곳을 끌면 여전히 초안이 생긴다 (`shouldStartTimeSelection` 회귀)
- 24px 블록(15분)에서 상자와 제목이 둘 다 보인다 (§4.1-A)
- 끝낸 블록이 격자에 남고 흐리다 (§1 + §5.2)
- 진한 채움 위 제목이 4.5:1을 넘는다 — 팔레트 8색 각각 (§3.3)

> ⚠️ `e2e/calendarCreate.spec.ts`가 최근 시각 의존으로 깨진 적이 있다(v0.22.0 릴리스
> 중단). 새 스펙의 좌표는 스크롤 위치에서 재지 말고 `dragOutABlock`이 지금 쓰는
> 방식(스티키 헤더 아래 밴드 측정)을 따를 것.

---

## 12. 구현 순서

각 단계가 혼자서 화면에 보이는 결과를 낸다.

1. **끝낸 일을 남긴다** (§1, D1) — `CalendarView`에 `layers` 상태 + 사이드바 토글.
   이 한 단계로 `is-done` 규칙이 처음 켜지고, 체크박스 없이도 화면이 달라진다.
2. **색을 정한다** (§3, D3) — `--ev-tint` 값과 잉크 규칙. `readableInkOn` + 테스트.
3. **블록 구조를 바꾼다** (§2, D2) — `<button>` → `<div role="button">`, 안쪽을
   가로 배치로. 체크박스는 아직 없음. 회귀만 확인.
4. **체크박스를 넣는다** (§4·§5·§6) — 시간 블록 먼저.
5. **배선한다** (§7) — `toggleTaskDone`을 `AppPages` → `CalendarView` → 뷰까지.
6. **칩에 넣는다** (§8) — 종일 · 월간.

---

## 13. 결정 목록

| | 질문 | 안 | 권장 |
|---|---|---|---|
| **D1** | 끝낸 일을 격자에 남기나 | A 항상 / B 기본 켬 + 토글 / C 현행(사라짐) | **B** |
| **D2** | 블록을 무엇으로 바꾸나 | A div+진짜 input / B 형제 절대배치 / C span role | **A** |
| **D3** | 어떻게 진하게 하나 | A 틴트만 / B 불투명+흰글씨 / C 잉크 자동 / D 하이브리드 | **D** |
| **D4** | 24px 블록에서 | A 체크박스 유지 / B 제목만 / C 상자만 | **A** |
| **D5** | 상자 테두리 색 | A 우선순위 / B 잉크 상속 / C 중립 | **B** |
| **D6** | 초안 네모(§3, [관찰] ④)도 같이 진하게 하나 | 예 / 아니오 | **예** (22% → D3의 값) |

전부 권장안대로 승인되어 §12 순서로 구현했다. 구현하며 설계와 달라진 것 하나(§8.1)와,
설계가 예상하지 못한 것 하나(§4.2)는 아래에 적었다.

### 13.1 실제로 만들어진 것

| 무엇 | 어디 |
|---|---|
| 완료 레이어 토글 | `lib/calendar/categoryModel.ts`(`showCompleted`) · `lib/calendarCategories.ts`(`toggleShowCompleted`) · `CalendarLeftSidebar`의 "보기" 절 |
| 잉크 선택 | `domain/calendar/readableInk.ts` + `readableInk.test.ts`(6개) |
| 색 변수 전달 | `components/calendar/eventColorVars.ts` — `--ev-color`와 `--ev-ink-auto`를 한 곳에서 |
| 키보드 활성화 | `components/calendar/blockActivation.ts` |
| 체크박스 | `components/calendar/CalendarItemCheck.tsx` |
| 채움·상태 규칙 | `styles/10-calendar-apple.css` 끝의 세 절 |
| 회귀 방지 | `e2e/calendarCheckbox.spec.ts`(9개) |

`layers` 하드코딩이 사라진 자리는 `CalendarView.tsx`의 `useMemo` 하나다. 완료 레이어만
설정이고 나머지 둘은 여전히 기본값을 쓴다 — 바꿀 이유가 아직 없다.
