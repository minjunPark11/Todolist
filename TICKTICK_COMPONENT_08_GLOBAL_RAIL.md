# TickTick 역설계 #08 — Global Rail (최좌측 앱 내비게이션)

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **최좌측 50px 앱 전역 내비게이션 레일(`.sidebar_2byOi`)**
작성일: 2026-08-20

Component 01~07에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 인용한다.

**대상 선정 이유**: Component 02·05에서 Rail은 **바깥에서만**(폭 50, 배경 `rgb(36,36,36)`, 아이콘 10개, collapse에 불변) 쟀고 내부는 한 번도 열지 않았다. 그리고 Component 01 §12.2가 **"Rail 폭 우리 56 vs TickTick 50, 아이콘 우리 24 vs 28 — 함께 조정해야 한다"**를 미결로 남겼다. 이 문서가 그 미결을 닫는다.

## 0. 측정 조건 · 복구

| 항목 | 값 |
|---|---|
| viewport | **1387 × 713 CSS px** (dpr 2) |
| 테마 / 로케일 | dark / ko |
| 측정 화면 | 기본함(`#p/inbox/kanban`) — Rail의 **List 항목이 활성**인 상태 |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · 실제 마우스 hover · 실제 Tab 키 |

**세션에 가한 변경**: **없다.** Rail 항목을 클릭하지 않았고(다른 뷰로 이동하지 않음), hover와 Tab 포커스만 했다. 화면·데이터·설정 전부 그대로다. sidebar 240 · expanded, Component 04의 테스트 데이터, Component 07에서 복원한 detail 폭도 유지된다.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §10에 적는다.

---

## 1. 구조

```
DIV.g-left.flex-none.flex.overflow-hidden                          50 × 713 @0,0
└ DIV.sidebar_2byOi                                                50 × 713
  │   w-[50px] · pb-[11px] · h-full · flex flex-col · flex-none · items-center
  │   z-[5] (l-low:z-[4])
  │   dark:bg-left-sidebar-bg-color   → rgb(36,36,36)
  │   border-r border-solid border-grey-5 → 1px rgba(255,255,255,0.05)
  │
  ├ DIV.t-user.user.w-[32px].h-[32px].flex-none.mt-[16px]           32 × 32 @9,16
  │   └ DIV.relative.h-full.w-full.cursor-pointer
  │       ├ IMG.w-[32px].h-[32px].rounded-[6px]                     32 × 32
  │       └ svg.icon-user-icon.absolute.text-[#aeaeae]              10 × 10 @34,13
  │             └ use #user-icon                                    (아바타 우상단 배지)
  │
  ├ DIV.flex-auto.w-full.flex.flex-col.items-center                 49 × 493 @0,59
  │   └ (내비 항목 6개, 아래 §2 구조 반복)
  │       #list-sidebar     → href #p/inbox/kanban   ← 현재 활성
  │       #calendar-sidebar → href #c/all/calendar/m
  │       (원형 래퍼)        → href #focus            아이콘 22×22 (변형)
  │       #search-sidebar   → href #s
  │       #matrix-sidebar   → href #m/all/matrix
  │       #habit-sidebar    → href #q/all/habit
  │
  └ DIV.flex-none                                                   48 × 150 @1,552
      ├ DIV.relative  (동기화)      아이콘 #sidebar-sync        30 × 30, tabIndex −1
      ├ DIV.relative > BUTTON       아이콘 #notification-sidebar 28 × 28, tabIndex 0
      └ DIV.relative > BUTTON       아이콘 #question-sidebar     28 × 28, tabIndex 0
```

### 1.1 내비 항목 하나의 내부 (3겹)

```
DIV.relative.px-[4px].py-[5px]              48 × 50     ← 자리(슬롯)
 └ DIV.relative.w-[40px].h-[40px]           40 × 40     ← 히트 영역 경계
     └ A.block.relative.w-[40px].h-[40px].px-[6px].py-[6px]
         └ svg.w-[28px].h-[28px].text-white.opacity-40  28 × 28   ← 아이콘
```

산술이 정확히 맞는다:

```
48 = 40 + 4×2   (슬롯 좌우 패딩 4)
50 = 40 + 5×2   (슬롯 상하 패딩 5)
28 = 40 − 6×2   (앵커 패딩 6)
```

---

## 2. Geometry

### 2.1 가로

| 항목 | 값 |
|---|---|
| Rail 폭 | **50** (`w-[50px]`, 우측 1px 보더 포함) |
| 슬롯 | **48** (x 1 – 49) |
| 히트 영역(`A`) | **40 × 40** (x 5 – 45) |
| **아이콘** | **28 × 28** (x 11 – 39) |
| 아이콘 좌우 여백 | 11 / 11 → **정확히 중앙** |
| 아바타 | **32 × 32** (x 9 – 41), radius **6** |
| 아바타 배지 | **10 × 10** @ (34, 13) — 아바타 우상단에 겹침, 색 `rgb(174,174,174)` |

### 2.2 세로 — 전 구간 50px 스텝

| y | 요소 |
|---|---|
| 0 | Rail 상단 |
| **16** | 아바타 (`mt-[16px]`), 32 높이 → 48에서 끝 |
| **59** | 내비 1 (List) ← 아바타 끝에서 **11px** 띄움 |
| 109 | 내비 2 (Calendar) |
| 159 | 내비 3 (Focus) |
| 209 | 내비 4 (Search) |
| 259 | 내비 5 (Matrix) |
| 309 | 내비 6 (Habit) |
| … | `flex-auto`가 남는 공간을 흡수 |
| **552** | 하단 1 (Sync) |
| 602 | 하단 2 (Notification) |
| 652 | 하단 3 (Help) |
| 702 | 마지막 항목 끝 |
| **713** | Rail 끝 (`pb-[11px]`) |

**[Observed] 항목 스텝이 상단 묶음과 하단 묶음 모두 정확히 50이다.** 항목 높이 50 + 간격 0이며, 별도 margin은 쓰지 않는다.

**[Observed] 아바타 아래 11px과 Rail 하단 패딩 11px이 같은 값이다.**

**[Inference]** 위아래를 같은 11px로 맞춘 것은 아바타 묶음과 하단 도구 묶음을 **대칭으로 끼워 넣으려는** 배치로 보인다. 가운데 내비 묶음만 `flex-auto`로 늘어난다.

---

## 3. Surface / Boundary

| 항목 | 값 |
|---|---|
| 배경 | **`rgb(36,36,36)`** (`dark:bg-left-sidebar-bg-color`) |
| 우측 경계 | **1px `rgba(255,255,255,0.05)`** (`border-grey-5`) |
| box-shadow | **없음** |
| z-index | **5** |
| 항목 배경 | **어느 상태에서도 없음** (`rgba(0,0,0,0)`) |
| 항목 radius | **어느 상태에서도 0** |

**[Observed] Rail은 사이드바·본문(`rgb(28,28,28)`)보다 8단계 밝다.** Component 02에서 확인한 것과 동일하며, 이번에도 변함없다.

**[Observed] 항목에 배경도 radius도 전혀 없다.** 사이드바 행(radius 10 + 배경 알파)이나 태스크 행(radius 10 배경 레이어)과 완전히 다르다.

---

## 4. States — 불투명도 하나로만 표현한다

실제 마우스 hover / 실제 Tab 키로 측정했다.

| Property | A. normal | B. hover | C. active(현재 페이지) | D. focus-visible |
|---|---|---|---|---|
| **아이콘 opacity** | **0.4** | **0.6** | **1.0** | **0.4 (변화 없음)** |
| 아이콘 color | `rgb(255,255,255)` | 동일 | 동일 | 동일 |
| 항목 배경 | 없음 | **없음** | **없음** | **없음** |
| radius | 0 | 0 | 0 | 0 |
| box-shadow | none | none | none | none |
| **outline** | none | none | none | **`auto 1px rgb(71,114,250)`, offset 1px** |
| 인디케이터 바/점 | **없음** | 없음 | **없음** | — |

**[Observed] 상태 표현이 오직 아이콘 불투명도 40% → 60% → 100% 세 단계다.** 배경도, 굵기도, 색상 변화도, 좌측 활성 바도 없다.

**[Observed] focus-visible에서 아이콘은 밝아지지 않는다.** 링만 생긴다. hover와 focus의 표현이 분리돼 있다.

**[Observed] 포커스 링 offset이 1px다.** Component 01·03·04의 사이드바 계열은 **offset 0**이었다.

**[Inference]** offset 1은 40×40 히트 영역 바깥으로 링을 1px 밀어내 28px 아이콘과 겹치지 않게 하려는 조정으로 보인다.

---

## 5. Accessibility — 이 시리즈에서 처음 나온 aria

| 항목 | 값 |
|---|---|
| 내비 항목 태그 | **`<a href="#…">`** (진짜 링크) |
| tabIndex | **0** — 6개 전부 키보드 도달 가능 |
| **`aria-current`** | **활성 항목의 `<a>`에 `aria-current="page"`** |
| 그 외 aria | 없음 (`aria-label`·`role`·`title` 전부 없음) |
| **tooltip** | **1초 hover 후에도 나타나지 않았다** |
| 하단 Sync | `DIV`, **tabIndex −1** — 키보드 도달 불가 |
| 하단 Notification / Help | `<button>`, tabIndex 0 |
| accessible name | **없음** — 아이콘만 있고 텍스트·`aria-label`·`title`이 전부 없다 |

**[Observed] `aria-current="page"`는 Component 01~07을 통틀어 처음 발견된 aria 속성이다.** 사이드바 행(C01)·섹션 헤더(C03)·폴더(C04)는 전부 aria가 0개였고, 선택 상태를 `data-selected`(스타일 훅도 아닌 JS 마커)로만 들고 있었다.

**[Observed] 그럼에도 각 항목에 이름이 없다.** 스크린리더는 "링크"라고만 읽고 어디로 가는 링크인지 알 수 없다. 툴팁도 없어 **마우스 사용자도 아이콘 의미를 추측해야 한다.**

**[Inference]** `aria-current`만 있고 이름이 없는 조합은, 접근성을 의도해서 넣었다기보다 **라우터 라이브러리가 활성 링크에 자동으로 붙여준 결과**일 가능성이 있다. 다만 확인할 수단이 없다.

---

## 6. 아이콘 시스템

| 항목 | 값 |
|---|---|
| 방식 | **SVG 스프라이트** (`<use xlink:href="#…">`) — Component 01·03·04와 동일 |
| 표준 크기 | **28 × 28** |
| 색 | `text-white` → `rgb(255,255,255)`, 밝기는 `opacity`로 조절 |
| 사용된 심볼 | `#list-sidebar` · `#calendar-sidebar` · `#search-sidebar` · `#matrix-sidebar` · `#habit-sidebar` · `#sidebar-sync` · `#notification-sidebar` · `#question-sidebar` · `#user-icon` |

### 6.1 크기 예외 2건

| 항목 | 크기 | 비고 |
|---|---|---|
| Focus(3번째) | **22 × 22** | `svg`가 아니라 `DIV.circleWrapper_ScweA` — 포모도로 진행 원형이 들어가는 자리로 보인다 |
| Sync(하단 1번째) | **30 × 30** | 다른 하단 항목(28)보다 2px 크다. 회전 애니메이션 래퍼(`animation_1FJ…`)를 가진다 |

**[Observed] 28이 표준이고 22·30 두 개의 예외가 있다.** 둘 다 정적 아이콘이 아니라 **상태를 그리는 요소**(진행 원형 / 회전 스피너)라는 공통점이 있다.

---

## 7. 우리 앱과의 직접 비교 — Component 01의 미결 해소

| 항목 | **TickTick** | **우리 앱** | 조치 |
|---|---|---|---|
| Rail 폭 | **50** | `--rail-w: 56px` | **50으로** |
| 항목 히트 영역 | **40 × 40** | `--rail-item: 40px` | **이미 일치** |
| 항목 슬롯 | 48 × 50 | (미정의) | 슬롯 개념 도입 |
| **아이콘** | **28 × 28** | **24 × 24** (`19-app-shell.css:249`) | **28로** |
| 아이콘 여백(히트−아이콘) | 6 (40−28)/2 | 8 (40−24)/2 | 6으로 |
| 세로 스텝 | **50** | (미정의) | 50 도입 |
| 항목 배경/radius | **없음 / 0** | 확인 필요 | 없애는 방향 |
| 상태 표현 | opacity 0.4 / 0.6 / 1.0 | 확인 필요 | 이 3단 채택 검토 |
| 배경색 | `rgb(36,36,36)` — 사이드바보다 **밝다** | `--bg-rail: #0a0a0c` — 사이드바(`#0d0d0f`)보다 **어둡다** | **방향이 반대** |

**[Observed] 우리 앱과 TickTick은 Rail 밝기 방향이 정반대다.** TickTick은 Rail(36)이 사이드바(28)보다 밝고, 우리는 Rail(`#0a0a0c`)이 사이드바(`#0d0d0f`)보다 어둡다.

**[Inference]** Component 01의 조치 항목("폭 56→50")을 **아이콘 24→28과 반드시 함께** 해야 하는 이유가 수치로 확인됐다. 폭만 50으로 줄이면 40px 히트 영역 좌우 여백이 8→5로 줄고, 24px 아이콘은 그대로라 **더 작고 더 빽빽해진다.** 두 값을 같이 옮겨야 TickTick의 밀도(아이콘이 히트 영역의 70%를 채움)에 도달한다.

---

## 8. Fidelity Specification

```
GLOBAL RAIL

Container
  width               : 50px (우측 1px 보더 포함)
  height              : 뷰포트 전체
  background          : 전용 표면색 — 사이드바/본문보다 한 단계 밝게
                        (다크 기준 rail 36,36,36 vs 나머지 28,28,28)
  right border        : 1px, 전경색 5% 알파
  box-shadow          : 없음
  z-index             : 5 (사이드바·본문 위)
  padding-bottom      : 11px
  layout              : flex column, items-center
                        [아바타] [내비 flex-auto] [하단 도구]

Avatar
  size                : 32 × 32,  radius 6
  margin-top          : 16
  badge               : 10 × 10, 우상단에 겹침, 중성 회색

Nav item (3겹)
  슬롯                : 48 × 50   (padding 5 / 4)
  히트 영역           : 40 × 40
  아이콘              : 28 × 28   (앵커 padding 6)
  배경 / radius       : 없음 / 0  ← 어느 상태에서도
  세로 스텝           : 50 (간격 0)
  요소                : <a href>, tabindex 0

States (아이콘 opacity 단독으로 표현)
  normal              : 0.4
  hover               : 0.6
  active (현재 페이지): 1.0
  focus-visible       : outline auto 1px accent, offset 1px
                        (아이콘 밝기는 변하지 않는다)
  인디케이터 바/점    : 없음

Vertical rhythm
  rail top → 아바타   : 16
  아바타 → 첫 내비    : 11
  내비 항목 간        : 50 (스텝)
  마지막 항목 → 하단  : 11 (padding-bottom)

Bottom cluster
  구조                : 같은 48 × 50 슬롯, 스텝 50
  아이콘              : 28 × 28 (Sync만 30 × 30)
  opacity             : 0.4
  Sync                : tabindex −1 (키보드 도달 불가)
  Notification / Help : <button>, tabindex 0

Accessibility (관찰된 그대로)
  활성 항목           : aria-current="page"
  accessible name     : 없음 (텍스트·aria-label·title 전무)
  tooltip             : 없음
```

---

## 9. Component 01~08 Candidate Shared Rules

| 후보 규칙 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| **전경색 1개(흰색) × 알파로 위계** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **8/8** |
| **그림자 없음** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **8/8** |
| **SVG 스프라이트 + currentColor** | ✔ | — | ✔ | ✔ | — | ✔ | ✔ | ✔ | **6/6** |
| **경계는 1px 하이라인** | — | ✔ | — | — | ✔ | ✔ | ✔ | ✔ | **5/5** |
| **색은 토큰 / 치수는 임의값** | ✔ | ✔ | 부분 반례 | ✔ | ✔ | ✔ | ✔ | ✔ | **7.5/8** |
| **focus-visible = `auto 1px` accent** | ✔(off 0) | — | ✔(off 0) | ✔(off 0) | — | **✘ 없음** | — | ✔(**off 1**) | **4/5, offset 불일치** |
| **액션/아이콘 40% → 강조 시 100%** | ✔ | — | ✔ | ✔ | — | — | — | **✔(0.4/0.6/1.0)** | **4/4** |
| **상태는 클래스, `data-*`는 style hook 아님** | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | **6/6** |
| ~~aria 사실상 없음~~ | ✔ | — | ✔ | ✔ | ✔ | (부분) | — | **✘ `aria-current`** | **깨짐 → §9.2** |

### 9.1 "40% 전경색"이 이 시리즈의 진짜 상수에 가깝다

지금까지 40%가 나온 곳: 사이드바 행의 카운트·more(C01), 섹션 헤더 chevron·`+`(C03), 폴더 disclosure·more(C04), **Rail 아이콘 기본값(C08)**.
반면 hover 알파(3% vs 5%)와 경계 알파(5/6/10%)는 위치마다 달랐다.

**[Inference] "비활성 보조 요소 = 전경색 40%"가 알파 계열 중 가장 일관된 값으로 보인다.** 다만 이것도 규칙으로 확정하기에는 본문 영역 표본이 부족하다(C06·C07의 보조 아이콘은 100%였다).

### 9.2 Conflict / Revision Candidate (R-14 ~ R-15)

기존 문서는 수정하지 않고 후보만 기록한다. (R-1~R-5는 C04, R-6~R-8은 C05, R-9~R-11은 C06, R-12~R-13은 C07.)

| # | 기존 서술 | 08의 관찰 | 성격 |
|---|---|---|---|
| **R-14** | **C01 §13 / C03 §13 / C04 §19** — "aria 속성이 하나도 없다"가 4/4로 반복 확인 | Rail의 **활성 항목에 `aria-current="page"`가 있다** | **범위 축소.** aria가 완전히 없는 것은 아니다. 다만 accessible name은 여전히 없다 |
| **R-15** | **C01 §12 / C03 / C04** — focus ring은 `outline: auto 1px rgb(71,114,250)`, **offset 0** | Rail은 같은 링이지만 **offset 1px** | **보강.** 링 스타일은 공통, offset은 요소마다 다르다 |

또한 Component 01 §12.2의 미결(**"Rail 폭 50 vs 우리 56, 아이콘 24 vs 28"**)은 §7에서 수치가 확정됐다 — **미결 해소.**

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다.**

1. **Rail 항목에 이름을 준다.** TickTick은 accessible name도 툴팁도 없어, 스크린리더는 "링크"로만 읽고 신규 사용자는 아이콘을 추측해야 한다. `aria-label` + hover 툴팁을 붙인다.
2. **`aria-current="page"`는 그대로 채택한다.** 이 시리즈에서 유일하게 제대로 된 접근성 처리다.
3. **폭 50과 아이콘 28을 함께 옮긴다.** §7에서 확인했듯 폭만 줄이면 오히려 나빠진다.
4. **Rail 밝기 방향은 우리 것을 유지할지 결정이 필요하다.** TickTick은 Rail이 더 밝고 우리는 더 어둡다. 우리 방향(어두운 Rail)은 Component 02 V-1에서 "내비가 콘텐츠보다 어둡게"라는 원칙으로 이미 정한 것이므로, **TickTick을 따라 뒤집을 이유는 없다.** 이건 fidelity가 아니라 선택의 문제다.
5. **Sync 항목을 키보드로 도달 가능하게 한다.** TickTick은 `tabindex: -1`이다.
6. **상태 3단(0.4 / 0.6 / 1.0)은 채택할 만하다.** 배경 없이 불투명도만으로 3단을 만드는 것은 간결하고, 다크/라이트 양쪽에서 그대로 동작한다.
7. **활성 표시에 좌측 바를 추가할지 검토한다.** TickTick은 opacity 100%만으로 활성을 표시하는데, 40%→100%는 옆눈으로는 구분이 쉽지 않다. 2~3px 좌측 인디케이터를 더하면 스캔이 쉬워진다 — 다만 이건 TickTick과 달라지는 선택이다.

---

## 10. 이 분석이 확인하지 않은 것

- **다른 뷰에서의 활성 항목** — Rail 항목을 클릭하지 않았다(다른 화면으로 이동하지 않기 위해). 활성 표현이 항목마다 같은지는 List 항목 하나로만 확인했다.
- **Focus(3번째) 항목의 원형 래퍼** — 포모도로가 실행 중일 때 어떻게 그려지는지 미측정.
- **Sync 아이콘의 회전 애니메이션** — 래퍼 클래스(`animation_1FJ…`)만 확인했고 실제 회전은 관찰하지 못했다(Component 07에서 본 1500ms 애니메이션이 이것으로 추정되나 확인 안 함).
- **알림 배지(숫자/점)** — 현재 알림이 없어 배지가 렌더되지 않았다.
- **`:active`(누름)** — 01~07과 동일한 제약.
- **좁은 뷰포트에서 Rail이 숨는지** — 뷰포트 제어 불가(C02·C05와 동일).
- **라이트 테마**, **원본 CSS 규칙**(CORS).

---

## 11. 이 문서가 남긴 상태

| 항목 | 상태 |
|---|---|
| Component 01~07 문서 | **수정하지 않음.** 충돌·보강 후보는 §9.2에만 기록 |
| 우리 앱 코드 | **수정하지 않음** |
| TickTick 세션 | **변경 없음** — 클릭 없이 hover/Tab만 했다 |
| 화면 / sidebar / detail | 기본함 · 240 expanded · detail 35.976% (전부 유지) |
| Component 04 테스트 데이터 | `ZZ Folder` + 리스트 3개 유지 |
