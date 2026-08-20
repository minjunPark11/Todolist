# TickTick 역설계 #13 — Kanban Board (컬럼 + 카드)

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **칸반 보드의 컬럼(`.column`)과 카드(`.l-task`)**
작성일: 2026-08-20

Component 01~12에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 인용한다.

**대상 선정 이유**: 마지막으로 남은 주요 뷰 타입이고, 우리 앱의 `BoardPage.tsx` / `TaskBoard.tsx` / `.board-*`와 대응한다. 무엇보다 **Component 06의 리스트 행과 같은 컴포넌트(`.l-task`)가 여기서 카드로 렌더된다** — 같은 컴포넌트를 두 형태로 쓰는 방법을 볼 수 있다.

## 0. 측정 조건 · 안전 조치

| 항목 | 값 |
|---|---|
| viewport | **1387 × 713 CSS px** (dpr 2) |
| 테마 / 로케일 | dark / ko |
| 측정 화면 | `기본함`(`#p/inbox/kanban`) — 이미 칸반 뷰 |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · 실제 마우스 hover |

**세션에 가한 변경: 없다.** 화면 이동도 하지 않았고(이미 칸반이었다), 카드를 클릭하거나 드래그하지 않았으며 체크박스도 누르지 않았다. hover만 했다.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §8에 적는다.

---

## 1. 보드 셸 구조

```
DIV.tasklist.tasks (본문)                                1097 × 713 @290
├ HEADER.tl-bar                                          1097 × 49    (Component 09)
│    ※ 칸반에는 퀵애드 바가 없다 — 리스트 뷰의 .tl-quick 자리가 비어 있다
└ DIV.column-list.columnList_3i9Zg.ui-sortable           1097 × 664 @290,49
   └ DIV.column-list-wrap.h-full.**column-size-m**
      └ DIV.column-list-inner.antiscroll-inner.flex.flex-row
         │    overflow-x: auto   scrollWidth 1152 / clientWidth 1097
         ├ ARTICLE.column.tl-container.flex-shrink-0     282 × 652 @302
         ├ ARTICLE.column …                              282 × 652 @584
         └ ARTICLE.column …                              282 × 652 @866
```

**[Observed] 컬럼 사이 간격이 0이다.** 302 / 584 / 866, 폭 282씩 — 정확히 붙어 있다. 시각적 간격은 **카드의 좌우 인셋 12px**이 만든다.

**[Observed] `column-size-m`이라는 크기 modifier가 래퍼에 붙어 있다.** 282는 "m" 크기의 값이다. 다른 크기(s / l)가 있을 것으로 보이나 **확인하지 않았다.**

**[Observed] 칸반에는 상단 퀵애드가 없다.** 리스트 뷰의 `.tl-quick`(Component 10) 자리가 없고, 대신 **컬럼 헤더마다 `+` 버튼**이 있다.

---

## 2. Column

```
ARTICLE.column.tl-container.flex-shrink-0.h-full.relative.overflow-visible
│     282 × 652   배경 없음 · 보더 없음 · radius 0 · padding 0
└ DIV.column-inner.absolute.inset-0
   └ DIV.column-main.flex.flex-col
      ├ DIV.hover-mask.hidden.absolute.inset-0            ← 드래그 오버 표시(숨김)
      │     border 1px solid rgb(71,114,250) · bg rgba(71,114,250,0.05) · radius 12
      ├ HEADER.column-header.flex-none                    282 × 40 @302,49
      │   └ DIV.tl-bar.flex.items-center.justify-between  padding 14px 12px 6px 8px
      │       ├ DIV.tl-title                              210 × 26 @310,60
      │       │   ├ H5.tl-des.text-s.truncate.font-semibold  "미분류"  14px / 600
      │       │   ├ DIV.absolute.inset-0.invisible.group-hover:visible  ← 인라인 이름편집
      │       │   └ P.text-xs.font-normal.text-grey-40    "1"  12px / 40%
      │       └ A.column-quick-add-trigger                18 × 18 @528
      │           ├ DIV.bg (hover 배경)                    28 × 28 @523, opacity 0
      │           └ svg.icon-add.text-grey-60             18 × 18, 색 60%
      └ MAIN.column-tasklist.overflow-hidden.flex.flex-col  282 × 610 @302,91
          └ DIV.task-list-body.tl-body                     282 × 602
              └ (antiscroll-inner: scrollHeight 3652 / clientHeight 602)
```

**[Observed] 컬럼 자체는 완전히 투명하다.** 배경도 보더도 radius도 padding도 없다. Trello 류의 "회색 컬럼 판" 방식이 아니다.

**[Observed] 컬럼 헤더가 `.tl-bar` 클래스를 재사용한다.** 본문 헤더(Component 09)와 같은 클래스지만 값이 다르다:

| | 본문 헤더 (C09) | **컬럼 헤더 (C13)** |
|---|---|---|
| 높이 | 49 / 64 | **40** |
| padding | `15px 20px` | **`14px 12px 6px 8px`** (비대칭) |
| 제목 태그 | `DIV.tl-des` | **`H5.tl-des`** |
| 제목 | **20px / 600** | **14px / 600** |
| 카운트 | 없음 | **12px / 전경색 40%** |

**[Observed] 컬럼 세로 스크롤은 antiscroll 패턴이다** — 네이티브 스크롤바 폭 0, scrollHeight 3652 / clientHeight 602. Component 02(사이드바)·07(상세)와 같은 구조다.

**[Observed] 보드는 가로로도 스크롤한다** — `overflow-x: auto`, scrollWidth 1152 / clientWidth 1097.

### 2.1 드래그 오버 표시

`.hover-mask`는 평소 `display: none`이고, 스타일은:

| 항목 | 값 |
|---|---|
| border | **1px solid `rgb(71,114,250)`** (accent) |
| background | **`rgba(71,114,250,0.05)`** (accent 5%) |
| radius | **12** |
| inset | 0 (컬럼 전체) |

**[Inference]** 카드를 컬럼 위로 끌어왔을 때 컬럼 전체를 accent 테두리로 감싸는 표시로 보인다. **드래그를 수행하지 않았으므로 실제로 나타나는 것은 보지 못했다.**

---

## 3. Card — 리스트 행과 같은 컴포넌트, 다른 옷

카드는 Component 06의 리스트 행과 **완전히 같은 클래스 트리**(`li.task.taskItemWrapper_36-ES` → `.l-task` → `.l-task-bg` / `.t-inner` / `.title` / `.tips`)를 쓴다. 달라지는 것은 아래 표가 전부다.

| 속성 | **리스트 행 (C06)** | **칸반 카드 (C13)** |
|---|---|---|
| `li` 클래스 | `… relative block **transition duration-200**` | `… relative block **px-[12px] py-[4px]**` |
| `li` 크기 | 615.7 × 40 | **282 × 70** (1줄+날짜) / **48** (1줄만) |
| `.l-task` | 615.7 × 40 | **258 × 62** |
| **`.l-task-bg` 배경** | **투명** (hover에서 5%) | **`rgb(36,36,36)` 불투명 (항상)** |
| `.l-task-bg` 인셋 | 좌우 **18** | **0** (카드 전체를 채움) |
| bg radius | 10 | **10** (동일) |
| **`.t-line` 구분선** | **1px, 있음** | **없음** |
| `.t-inner` padding | `0 20px 0 0` | **`0 12px 0 0`** |
| 제목 line-height | **24** | **20** |
| 제목 padding | `8px 0` | **`10px 0`** |
| 제목 white-space | pre-wrap | pre-wrap (동일) |
| **날짜/힌트 위치** | 제목과 **같은 줄, 우측** | **두 번째 줄** (`.tips` padding `0 20px 0 41px`) |
| **드래그 핸들** | 있음(hover) | **없음** |
| **more 버튼** | 있음(hover) | **없음** |
| 체크박스 | 17 × 40 | 17 × 40 (동일) |
| **hover** | 배경 5% | **변화 없음** |

### 3.1 카드 레이아웃 산술

```
li.task            282 × 70      px-[12px] py-[4px]
 └ .l-task         258 × 62      (282 − 12×2,  70 − 4×2)
     ├ 제목 줄     258 × 40      (.t-inner, line-height 40)
     └ .tips 줄    258 × 22      padding 0 20px 0 41px
                                 41 = 체크박스 좌측 인셋 + 체크 17 + 간격
```

카드 사이 세로 간격 = `py-[4px]` × 2 = **8**. 실측으로 확인: 완료 섹션의 두 카드가 y 263 / 311(둘 다 높이 48)로 붙어 있고, 시각적 카드는 8px 떨어진다.

### 3.2 카드는 왜 카드로 보이는가

**[Observed] 카드다움을 만드는 것은 딱 두 가지다.**

1. `.l-task-bg`가 **불투명 `rgb(36,36,36)`**로 항상 칠해진다(리스트에서는 투명).
2. `li`의 `px-12 py-4`가 카드 사이에 여백을 만든다.

radius(10)와 컴포넌트 트리는 리스트와 동일하다.

**[Inference]** 같은 컴포넌트를 **배경 레이어의 색과 인셋, 그리고 래퍼 패딩만 바꿔** 행 ↔ 카드로 전환한다. Component 06에서 "배경을 별도 레이어로 뽑은 이유"를 추측했는데, **여기가 그 이유로 보인다** — 배경 레이어가 독립돼 있어야 인셋 18 → 0, 투명 → 불투명으로 바꾸는 것만으로 형태가 바뀐다.

---

## 4. Surface — `rgb(36,36,36)`의 네 번째 용례

| 곳 | 용도 |
|---|---|
| Global Rail (C02·C08) | 전역 내비 표면 |
| 컨텍스트 메뉴 (C11) | 떠 있는 레이어 |
| **칸반 카드 (C13)** | **콘텐츠 카드** |
| (라이트 테마 대응값) `--color-left-sidebar-bg-color` = 36,36,36 | |

**[Observed] `rgb(36,36,36)`은 "화면 배경(28)보다 한 단계 올라간 표면"으로 세 종류의 서로 다른 요소에 쓰인다.**

**[Inference]** 다크 테마에서 이 제품의 표면 위계는 사실상 **2단**이다 — 28(바닥)과 36(올라간 것). 나머지 위계는 전부 알파 채움으로 만든다. 모달만 예외적으로 28을 쓴다(Component 12).

---

## 5. States

| Property | 카드 normal | **카드 hover** |
|---|---|---|
| 배경 | `rgb(36,36,36)` | **변화 없음** |
| radius | 10 | 10 |
| box-shadow | **none** | **none** |
| 제목 색 | `rgb(255,255,255)` | 변화 없음 |
| 드래그 핸들 / more | **없음** | **없음** |
| `li` transition | **0.2s** | — |

**[Observed] 카드는 hover에서 아무 변화가 없다.** 그림자도 배경 변화도 리프트도 없다. 미완료 카드와 완료 카드 양쪽에서 확인했다.

**[Observed] 완료된 카드는 `li`에 `checked` 클래스가 붙는다.** 높이가 40(1줄)로 줄고 드래그/more가 없다.

**[Inference]** 카드에 hover 피드백이 전혀 없는 것은 **드래그 대상이라는 성격** 때문으로 보인다 — 커서를 올리는 것 자체가 흔한 동작이라 매번 반응하면 시끄럽다. 다만 클릭 가능하다는 단서도 함께 사라진다.

---

## 6. 컬럼 헤더의 `+` 버튼

| 항목 | 값 |
|---|---|
| 요소 | `A.column-quick-add-trigger.inline-block.w-[18px]` |
| 크기 | **18 × 18** |
| 아이콘 | `#add`, 색 **`rgba(255,255,255,0.6)`** (`text-grey-60`) |
| **hover 배경** | **28 × 28**, `opacity: 0` → hover 시 표시 (Component 09의 헤더 아이콘과 같은 `bgIconWrapper` 패턴) |
| 위치 | 컬럼 우측, x=528 (컬럼 302 + 226) |

**[Observed] Component 09의 본문 헤더 아이콘과 같은 구조인데 크기만 다르다** — 헤더는 아이콘 20 / 배경 30, 여기는 아이콘 18 / 배경 28. 둘 다 **배경이 아이콘보다 상하좌우 5px 크다.**

---

## 7. Fidelity Specification

```
KANBAN BOARD

Board
  가로 스크롤          : column-list-inner, overflow-x auto (antiscroll)
  퀵애드 바            : 없음 — 컬럼 헤더의 + 버튼이 대신한다
  컬럼 크기 modifier   : 래퍼에 column-size-* (관찰값 m = 282)

Column
  width               : 282 (size m)
  간격                : 0 — 컬럼끼리 붙어 있다
  배경 / 보더 / radius : 전부 없음 (완전 투명)
  세로 스크롤          : 컬럼 본문이 자체 스크롤 (antiscroll, 네이티브 폭 0)

Column header
  height              : 40
  padding             : 14px 12px 6px 8px (비대칭)
  제목                : 14px / 600, truncate
  카운트              : 12px / 전경색 40%
  + 버튼              : 18 × 18, 아이콘 전경색 60%
                        hover 배경 28 × 28 (아이콘보다 5px씩 큼), opacity 0 → 1
  드래그 오버 표시     : 컬럼 전체에 1px accent 보더 + accent 5% 배경 + radius 12
                        (평소 display:none, 실제 동작은 미확인)

Card  (리스트 행과 같은 컴포넌트)
  래퍼 padding        : 12px 좌우 / 4px 상하  → 카드 간 세로 간격 8
  카드 크기           : 컬럼 폭 − 24
  배경                : 올라간 표면색으로 **항상 불투명**  ← 리스트 행과의 핵심 차이
  radius              : 10
  box-shadow          : 없음
  구분선              : 없음
  내부 padding        : 우측 12
  제목                : 14px / line-height 20 / padding 10px 0 / pre-wrap
  날짜·힌트           : **두 번째 줄**, 좌측 인셋 41 (제목 시작선에 맞춤)
  드래그 핸들 / more  : 없음
  hover               : 변화 없음
  완료 카드           : li에 checked 클래스, 높이 축소

행 ↔ 카드 전환 규칙 (관찰된 것)
  1. 배경 레이어: 인셋 18 → 0, 투명 → 불투명
  2. 래퍼: transition duration-200 → px-12 py-4
  3. 구분선 제거, 날짜를 두 번째 줄로, line-height 24 → 20
```

---

## 8. 이 분석이 확인하지 않은 것

- **드래그 동작 전체** — 카드 이동, `.hover-mask`가 실제로 나타나는 모습, placeholder, 드롭 결과. 데이터가 바뀌므로 수행하지 않았다.
- **`column-size-*`의 다른 값** — s / l이 있는지, 어떻게 바뀌는지.
- **컬럼 추가(`새로운 섹션`)** — 오른쪽 끝에 있으나 누르지 않았다.
- **컬럼 헤더의 인라인 이름 편집** — `group-hover:visible` 오버레이가 있으나 열지 않았다.
- **카드 선택 상태** — 카드를 클릭하지 않았다(리스트 뷰에서는 `active selected`였다. 칸반에서도 같은지 미확인).
- **카드에 태그·우선순위·하위작업이 있을 때의 렌더** — 현재 카드들에 해당 데이터가 적었다.
- **컬럼 접기** — 있는지 확인하지 않았다.
- **라이트 테마**, **원본 CSS 규칙**(CORS) — 01~12와 동일.

---

## 9. Component 01~13 갱신

### 9.1 같은 컴포넌트를 두 형태로 쓰는 방법 — 이번 회차의 핵심

Component 06에서 "왜 배경을 별도 레이어(`.l-task-bg`)로 뽑았을까"를 추론만 했는데, 이번에 **답이 나왔다.**

| | 리스트 행 | 칸반 카드 |
|---|---|---|
| 컴포넌트 트리 | **동일** | **동일** |
| 배경 레이어 인셋 | 18 | **0** |
| 배경 레이어 색 | 투명 → hover 5% | **불투명 36** |
| 래퍼 패딩 | 0 | **12 / 4** |

**[Inference] 배경을 요소 자신이 아니라 별도 레이어로 두었기 때문에, 같은 컴포넌트가 "행"과 "카드" 두 형태를 가질 수 있다.** 배경이 `.l-task`에 직접 칠해져 있었다면 인셋과 불투명도를 이렇게 바꾸기 어려웠을 것이다.

**우리 앱에 주는 함의**: 우리 `.tm-task`는 배경을 요소에 직접 칠한다. 보드 뷰(`TaskBoard.tsx`)와 리스트 뷰가 **별도 컴포넌트로 갈라져 있는 것**(인벤토리 §2.10.1의 "행 구현 5벌")이 이 구조적 차이에서 비롯됐을 가능성이 있다.

### 9.2 Shared Rules 갱신

| 후보 규칙 | 상태 |
|---|---|
| **전경색 1개 × 알파로 위계** | **13/13** |
| **흐름 안 요소에 그림자 없음** | **13/13** (카드에도 없다 — 카드인데 그림자가 없다는 점이 특징) |
| **antiscroll 오버레이 스크롤바** | C02 · C07 · **C13** → **3/3** |
| **아이콘 hover 배경 = 아이콘 + 5px씩** | C09(20/30) · **C13(18/28)** → **2/2** |
| **`rgb(36,36,36)` = 올라간 표면** | C02 rail · C11 메뉴 · **C13 카드** → **3/3** |

### 9.3 Conflict / Revision Candidate — 없음

이번 회차에서 기존 문서와 충돌하는 관찰은 없었다. Component 06의 미해결 추론(배경 레이어의 이유)이 §9.1에서 해소됐다.

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다.**

1. **행과 카드를 한 컴포넌트로 통합한다.** §9.1이 방법을 보여준다 — 배경을 별도 레이어로 뽑고, 인셋·불투명도·래퍼 패딩만 뷰별로 바꾼다. 우리 인벤토리의 "행 구현 5벌" 문제에 직접 쓰이는 처방이다.
2. **카드에 hover 피드백을 준다.** TickTick 카드는 hover에서 아무 변화가 없어 클릭 가능하다는 단서가 없다. 아주 약한 배경 상승(예: 36 → 40)이나 1px 보더 정도면 충분하다.
3. **컬럼 헤더 패딩 `14 12 6 8`은 따라가지 않는다.** 네 방향이 전부 다른 값이다. 우리는 대칭으로 둔다.
4. **드래그 오버 표시(accent 보더 + 5% 배경 + radius 12)는 채택할 만하다.** 명확하고 절제돼 있다.
5. **컬럼 간격 0 + 카드 인셋 12 구조도 채택할 만하다.** 컬럼에 배경을 주지 않으므로 보드가 가벼워 보인다.
6. **날짜를 두 번째 줄로 내리는 것은 카드에서만.** 리스트에서는 같은 줄 우측이 맞다 — 폭이 좁은 카드에서 제목과 날짜가 경쟁하지 않게 하는 처리다.

---

## 10. 이 문서가 남긴 상태

| 항목 | 상태 |
|---|---|
| Component 01~12 문서 | **수정하지 않음** |
| 우리 앱 코드 | **수정하지 않음** |
| TickTick 데이터 | **변경 없음.** 클릭·드래그·체크 없음, hover만 |
| 화면 / 셸 | 기본함 칸반 · Rail 50 · 사이드바 240 · viewport 1387×713 |
| Component 04 테스트 데이터 | `ZZ Folder` + 리스트 3개 유지 |
