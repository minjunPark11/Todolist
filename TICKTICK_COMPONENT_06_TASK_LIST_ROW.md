# TickTick 역설계 #06 — Task List Row (본문 리스트 뷰)

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **본문(main content) 리스트 뷰의 태스크 행 1개**
작성일: 2026-08-20

Component 01(Sidebar Row) · 02(Shell) · 03(Section Header) · 04(Folder Tree) · 05(Resize/Collapse)에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 인용한다.

**대상 선정 이유**: 01~05가 전부 사이드바였다. 태스크 행은 할 일 앱에서 가장 자주 보는 컴포넌트이고, 우리 앱의 최대 부채(`DESIGN_ELEMENT_INVENTORY.md` §2.10.1 — 행 구현 5벌·높이 4종)와 직접 맞물린다.

## 0. 측정 조건 · 복구

| 항목 | 값 |
|---|---|
| viewport | **1387 × 713 CSS px** (dpr 2) |
| 테마 / 로케일 | dark (`body.dark`) / ko |
| sidebar | 240, expanded |
| 측정 화면 | **`오늘`(Today) = `#q/today/tasks`** — 리스트 뷰 |
| 태스크 컬럼 | x 290 – 905.7 (폭 615.7) |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · 실제 마우스 hover · 실제 클릭 · `Range` 텍스트 실측 |

**세션에 가한 변경**: 뷰 이동만 했다(Today → Fidelity Audit → 해야 하는 일 → 기본함). 태스크 행을 **한 번 클릭해 선택**했고(디테일 패널이 열림), 측정 후 원래 보시던 **기본함(`#p/inbox/kanban`)으로 복원**했다. **체크박스는 절대 누르지 않았다** — 실제 태스크가 완료 처리되기 때문이다. 데이터 변경 없음. Component 04의 테스트 데이터(`ZZ Folder` + 리스트 3개)도 그대로다.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §12에 적는다.

---

## 1. 분석 대상 고정

| 항목 | 값 |
|---|---|
| 제목 | **`LAC Lab 6`** |
| 위치 | Today 뷰 `오늘 목` 섹션의 첫 행, y = 351 |
| `taskid` | `…000234` |
| 구성 | 체크박스(우선순위 낮음) · 제목 1줄 · 날짜 힌트(`오늘`) · hover 액션 2개 |
| 선택 이유 | 제목이 짧아 한 줄로 끝나고, 날짜 힌트가 있어 트레일링 슬롯을 함께 볼 수 있다 |

같은 뷰의 다른 5개 행도 함께 쟀다(우선순위 변형·힌트 개수 변형·habit 변형 확인용).

---

## 2. DOM 구조

### 2.1 실제 트리

```
LI.task.taskItemWrapper_36-ES.relative.block.transition.duration-200
│   [taskid=…, order=…, data-ui-type=0]    position: absolute; top: 232px
│   615.7 × 40  @290,351
└ DIV.l-task.group.relative.flex.flex-col.z-[1].h-full   [tabindex="0"]
  │   615.7 × 40,  padding-left 18
  ├ SPAN.drag.w-[12px].h-[12px].invisible.group-hover:visible   absolute  12×12 @293
  │   └ svg.icon-drag.text-grey-40.hover:text-grey → #drag        cursor: move
  ├ DIV.l-task-bg …absolute.top-0.left-0.bottom-0.z-0            ★ 배경 전용 레이어
  │      .ml-[18px].right-[18px].rounded-[10px]
  │      .group-hover:bg-grey-4 .dark:group-hover:bg-grey-5       581.7 × 40 @306
  ├ DIV.t-line.absolute.left-0.h-[1px].bottom-0.z-10             ★ 행 구분선
  │      .bg-grey-5 .group-hover:invisible   margin-left 58        527.7 × 1 @348,390
  ├ DIV.t-menu-toggle.invisible.absolute.top-1/2.z-[11]           12×12 @889.7
  │   └ svg.icon-more-for-task.text-grey-40.hover:text-grey → #more-for-task
  ├ DIV.t-inner.task-inner.relative.leading-[40px].flex.items-center
  │   │   597.7 × 40 @308,  padding-right 20
  │   ├ SPAN.t-check.check-toggle.cr-pointer.absolute.h-[40px].flex.items-center
  │   │   │   17 × 40 @324      ← 히트 영역은 행 전체 높이
  │   │   ├ SPAN.checker.avoid-event
  │   │   │   └ svg.icon-checkbox.i-4.text-priority-low  17×17 @324,362.5
  │   │   │       └ use #checkbox        글리프 14.9 × 14.9
  │   │   └ svg.icon-hover-checkbox.i-4.i-sml.hidden      (display: none)
  │   └ DIV.flex-auto.h-full.overflow-hidden   537.7 @348
  │       └ DIV.flex-auto.flex.h-full
  │           ├ DIV.title-wrap.h-full.mr-[5px].flex-auto   496.7 @348
  │           │   └ DIV.title.text-def.line-left.ap-inline-editor.flex.items-center.py-[8px]
  │           └ DIV.tips.flex-none.flex.items-center.mr-[12px]   24 × 40 @849.7
  │               └ SPAN.tip.date-hint.t-date.mr-[4px].last:mr-0   24 × 18 @849.7,362
  │                   └ SPAN.text-xs.leading-normal.font-normal.whitespace-nowrap
  └ DIV.absolute    3 × 40 @306      (좌측 3px 레인)
```

### 2.2 단순화

```
TaskRow (LI, absolute positioned)
 └ .l-task (group, tabindex 0)
     ├ DragHandle    (12×12, 좌측 밖, hover 시 등장)
     ├ BackgroundLayer (별도 div, radius 10, 좌우 18 inset)   ← hover/selected 배경
     ├ Separator      (1px, 제목 x부터 시작, hover 시 사라짐)
     ├ MoreButton     (12×12, 우측, hover 시 등장)
     └ Inner
         ├ Checkbox   (17×17 아이콘 / 17×40 히트)
         ├ Title      (flex-auto, 2줄까지 자람)
         └ Tips       (날짜·메모·반복 힌트, 우측 정렬)
```

### 2.3 각 요소의 역할

| 요소 | 역할 | 근거 |
|---|---|---|
| `LI.task` | **위치 담당자.** `position: absolute` + `top`으로 배치된다(가상 리스트 방식). 시각 속성 없음 | `top: 232px`, 배경·보더 없음 |
| `.l-task` | 상태 그룹(`group`)이자 **포커스 대상**(`tabindex=0`). 자기 배경은 없다 | bg transparent |
| **`.l-task-bg`** | **배경만 그리는 전용 레이어.** hover/selected 색이 여기 칠해진다. radius 10, 좌우 18px 안쪽으로 들어와 있다 | `rounded-[10px]`, `ml-[18px] right-[18px]` |
| **`.t-line`** | **행 구분선.** 보더가 아니라 1px 높이의 별도 div. **제목 x(348)에서 시작**해 행 좌측 끝까지 가지 않는다 | `margin-left: 58px`, `h-[1px]` |
| `.t-menu-toggle` | 컨텍스트 메뉴 트리거. 평소 `visibility: hidden` | `invisible` + `group-hover:visible` |
| `.drag` | 드래그 핸들. **행 좌측 바깥**(x 293)에 있어 배경 레이어 밖이다 | `cursor: move` |
| `.t-check` | 체크박스. **아이콘은 17×17이지만 히트 영역은 17×40**(행 전체 높이) | `h-[40px]` |
| `.title` | 제목. `white-space: pre-wrap`이라 **말줄임이 아니라 줄바꿈**한다 | `pre-wrap`, `overflow: hidden` |
| `.tips` | 날짜·메모·반복 등 힌트 묶음. `flex-none`으로 우측 고정 | `mr-[12px]` |
| 좌측 3px div | 미확인 (선택/우선순위 레인으로 추정되나 어떤 상태에서도 칠해지지 않았다) | **미측정** |

---

## 3. Geometry

### 3.1 가로 (태스크 컬럼 290 – 905.7)

| 요소 | x | width | right |
|---|---|---|---|
| `LI` / `.l-task` | **290** | **615.7** | 905.7 |
| `.drag` | **293** | 12 | 305 |
| **`.l-task-bg`** | **306** | **581.7** | **887.7** |
| 좌측 3px 레인 | 306 | 3 | 309 |
| `.t-inner` | 308 | 597.7 | 905.7 |
| **체크박스** | **324** | **17** | 341 |
| **제목** | **348** | **496.7** | 844.7 |
| **`.t-line`** | **348** | 527.7 | 875.7 |
| `.tips` | **849.7** | **24** | 873.7 |
| `.t-menu-toggle` | **889.7** | 12 | 901.7 |

행 우측(905.7) 기준 오프셋: more −4 · tips −32 · 배경 −18 · inner padding-right 20.

### 3.2 세로

| 항목 | 값 |
|---|---|
| **행 높이** | **40** (1줄 제목 기준) |
| **행 pitch** | **40** — 행 사이 간격 **0**. 구분선 1px이 행 안쪽 맨 아래에 얹힌다 |
| 제목 라인박스 | line-height **24**, padding **8 / 8** → 24 + 16 = 40 ✔ |
| 체크박스 아이콘 | 17 × 17, y 362.5 (행 중앙) |
| 날짜 힌트 | 18 높이, y 362 |
| 구분선 | y 390 (행 bottom 391의 1px 위) |

**[Observed]** 같은 뷰의 6개 행이 **전부 높이 40**이었다. 섹션 헤더를 사이에 둔 구간만 간격이 84로 벌어졌고(헤더 28~44 + 행), 행끼리는 예외 없이 40이다.

**[Observed]** 제목이 2줄이 되면 행이 커지는 구조다(`pre-wrap` + `py-[8px]` → 24×2 + 16 = **64**). 다만 이번 6개 행에는 2줄짜리가 없어 **64는 계산값이고 실측하지 못했다.**

---

## 4. Box Model 요약

| 속성 | LI | .l-task | .l-task-bg | .t-inner | .title | .tips |
|---|---|---|---|---|---|---|
| display | block | flex(column) | block | flex | flex | flex |
| position | **absolute** | relative | **absolute** | relative | static | static |
| width | 615.7 | 615.7 | 581.7 | 597.7 | 496.7 | 24 |
| height | 40 | 40 | 40 | 40 | 40 | 40 |
| margin | 0 | 0 | **0 0 0 18px** | 0 | 0 | **0 12px 0 0** |
| padding | 0 | **0 0 0 18px** | 0 | **0 20px 0 0** | **8px 0** | 0 |
| border | 0 | 0 | 0 | 0 | 0 | 0 |
| **border-radius** | 0 | 0 | **10px** | 0 | 0 | 0 |
| overflow | visible | visible | visible | hidden | hidden | hidden |
| z-index | auto | 1 | **0** | auto | auto | auto |
| **transition** | **0.2s** (§8) | all/0s | **all/0s** | all/0s | all/0s | all/0s |

**[Observed] 행 어디에도 `border`가 없다.** 구분선은 별도 요소이고, 배경은 또 다른 별도 요소다. 즉 **하나의 행이 세 레이어**(위치 LI / 콘텐츠 inner / 배경·구분선)로 나뉘어 있다.

---

## 5. Typography

| 항목 | **제목** | **날짜 힌트** |
|---|---|---|
| 요소 | `DIV.title.text-def` | `SPAN.text-xs` |
| font-size | **14px** | **12px** |
| font-weight | **400** | **400** |
| line-height | **24px** | **18px** |
| letter-spacing | normal | normal |
| color | `rgb(255,255,255)` (`text-def`) | **`rgb(71,114,250)`** (오늘 마감이라 액센트) |
| white-space | **`pre-wrap`** | `nowrap` |
| text-overflow | `clip` (**ellipsis 아님**) | — |
| overflow | hidden | visible |
| 렌더 텍스트 폭 | 61.6 (박스 496.7) | — |

**[Observed] 제목은 말줄임하지 않고 줄바꿈한다.** 사이드바 행 라벨이 `nowrap + ellipsis`였던 것(Component 01)과 **정반대**다.

**[Inference]** 사이드바 라벨은 "어디로 갈지 고르는 이름"이라 잘려도 되지만, 태스크 제목은 **내용 자체**라 잘리면 안 된다는 판단으로 보인다. 그래서 행 높이를 고정하지 않고 제목이 늘어나면 행이 자라게 했다.

---

## 6. Checkbox와 우선순위

| 항목 | 값 |
|---|---|
| 히트 영역 | **17 × 40** (`SPAN.t-check`, 행 전체 높이) |
| 아이콘 박스 | **17 × 17** |
| 렌더 글리프 | **14.9 × 14.9** |
| 방식 | SVG 스프라이트 `<use xlink:href="#checkbox">` |
| 색 | **우선순위 토큰이 그대로 들어간다** |
| hover 전용 아이콘 | `svg.icon-hover-checkbox.hidden` — DOM에 있으나 `display: none` |

### 6.1 우선순위 팔레트 — 실측

| 우선순위 | 클래스 | 색 |
|---|---|---|
| 없음 | `text-grey-40` | **`rgba(255,255,255,0.4)`** |
| 낮음 | `text-priority-low` | **`rgb(71,114,250)`** |
| 보통 | `text-priority-medium` | **`rgb(250,168,12)`** |
| 높음 | `text-priority-high` | **`rgb(225,62,57)`** |

**[Observed] 우선순위는 별도 배지가 아니라 체크박스 색으로만 표현된다.** 같은 뷰에서 `text-grey-40`(1개) · `text-priority-medium`(3개) · `text-priority-low`(1개)를 실제로 확인했다.

**[Inference]** 우선순위 표시를 위해 가로 공간을 전혀 쓰지 않는 방법이다. 이미 반드시 있어야 하는 요소(체크박스)에 색을 얹었다. 다만 **색만으로 전달**하므로 색각 이상 사용자에게는 구분이 어렵다.

### 6.2 변형 — habit 행

`운동` 행은 체크박스가 없었다.

| 항목 | 값 |
|---|---|
| 컨테이너 | `SPAN.t-check…**habit-icon**` — 폭 **20**(체크박스 행은 17) |
| 내용 | `I.icon_habit.icon-habit_daily_check_in` **20 × 20**, `<svg>` 아님 |
| 행 높이 | 40 (동일) |

**[Observed] 습관(habit) 항목은 같은 슬롯에 다른 컨트롤이 들어가며, 슬롯 폭만 17→20으로 달라진다.** 행 높이·제목 x는 그대로다.

---

## 7. Tips 슬롯 (트레일링 힌트)

관찰된 힌트 종류:

| 클래스 | 내용 |
|---|---|
| `tip date-hint t-date` | 마감일 (`오늘`, `4월20일`, `5월20일` …) |
| `tip note-hint` | 메모 있음 표시 |
| `tip repeat-hint` | 반복 일정 표시 |

| 항목 | 값 |
|---|---|
| 묶음(`.tips`) | `flex-none`, `margin-right: 12`, 우측 고정 |
| 개별 힌트 간격 | `mr-[4px]`, 마지막만 `last:mr-0` |
| 한 행 최대 관찰치 | **3개**(note + repeat + date) — 그래도 **행 높이는 40 유지** |

**[Observed] 힌트가 늘어나면 `.tips` 폭이 커지고 제목 폭이 그만큼 줄어든다.** 행 높이나 우측 정렬은 변하지 않는다.

---

## 8. States

실제 마우스 hover / 실제 클릭 / 프로그램 포커스로 측정했다.

| Property | A. normal | B. hover | C. selected | D. selected+hover | E. focus-visible |
|---|---|---|---|---|---|
| 배경(`.l-task-bg`) | `rgba(0,0,0,0)` | **`rgba(255,255,255,0.05)`** | **`rgba(255,255,255,0.08)`** | `rgba(255,255,255,0.08)` | **변화 없음** |
| 배경 radius | 10px | 10px | 10px | 10px | 10px |
| 배경 범위 | x 306 – 887.7 | 동일 | 동일 | 동일 | 동일 |
| **구분선(`.t-line`)** | **visible** | **hidden** | **hidden** | hidden | visible |
| 드래그 핸들 | hidden | **visible** | hidden | **visible** | hidden |
| more 버튼 | hidden | **visible** | hidden | **visible** | hidden |
| 제목 색 | `rgb(255,255,255)` | 동일 | 동일 | 동일 | 동일 |
| 제목 장식 | `none` | none | none | none | none |
| 체크박스 색 | 우선순위색 | 동일 | 동일 | 동일 | 동일 |
| 날짜 색 | `rgb(71,114,250)` | 동일 | 동일 | 동일 | 동일 |
| **outline** | none | none | none | none | **none** |
| box-shadow | none | none | none | none | **none** |
| LI 클래스 | `task taskItemWrapper…` | 동일 | **`… active selected …`** | 동일 | 변화 없음 |
| URL | `#q/today/tasks` | 동일 | **`…/tasks/<taskid>`** | 동일 | 변화 없음 |

### 8.1 세 가지 중요한 발견

**(1) 선택된 행은 hover에 반응하지 않는다.** C와 D가 동일하다(둘 다 0.08). Component 01의 사이드바 행과 같은 규칙이다.

**(2) 구분선이 hover/selected에서 사라진다.** 배경이 칠해지는 순간 그 행의 아래 선이 `visibility: hidden`이 된다.
**[Inference]** radius 10인 배경 위로 1px 직선이 가로지르면 모서리가 잘려 보인다. 선을 감추는 쪽을 택한 것으로 보인다.

**(3) 키보드 포커스에 시각 표시가 전혀 없다.** `.l-task`는 `tabindex="0"`이고 `:focus-visible`도 매칭되지만, **outline `none` · box-shadow `none` · 배경 변화 없음 · 구분선 그대로**였다. 선택되지 않은 행에서 확인한 결과다.

**[Observed]** 이는 Component 01·03·04에서 확인된 `outline: auto 1px rgb(71,114,250)`(사이드바 행·`+` 버튼·폴더 행)과 **다르다.** 태스크 행만 포커스 링이 없다.

---

## 9. Transition

| 요소 | transition-property | duration | timing |
|---|---|---|---|
| **`LI.task`** | `color, background-color, border-color, …, opacity, box-shadow, transform, filter …` | **0.2s** | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `.l-task` | all | **0s** | ease |
| **`.l-task-bg`** | all | **0s** | ease |
| `.t-line` | all | 0s | ease |
| `.title` / `.tips` / `.t-check` / `.drag` / `.t-menu-toggle` | all | 0s | ease |

**[Observed] `LI`에는 진짜 0.2s 전환이 걸려 있다**(Tailwind `transition duration-200`). Component 01~05에서 "사이드바는 전부 0s"였던 것과 **처음으로 다른 지점**이다.

**[Observed] 그런데 hover 배경을 실제로 그리는 `.l-task-bg`는 `0s`다.** 그리고 `LI` 자신은 배경이 없다(transparent).

**[Inference]** 따라서 **hover 배경 변화는 즉시**이고, `LI`의 0.2s는 이 경로에서 눈에 보이는 효과가 없을 가능성이 높다 — 드래그/정렬 시 `transform` 전환용으로 걸어둔 것으로 보인다(`LI`가 `position: absolute` + `top`으로 배치되는 가상 리스트라 재정렬 애니메이션이 필요하다). **다만 재정렬을 실제로 일으켜 확인하지는 않았다.**

---

## 10. Token / Utility 추적

| 값 | 분류 | 상세 |
|---|---|---|
| hover 배경 `rgba(255,255,255,0.05)` | **A. 토큰** | `dark:group-hover:bg-grey-5` → `--color-grey` × `--opacity-variant-grey-5` |
| (라이트 테마용) `bg-grey-4` | A | `rgba(255,255,255,0.04)` — 다크에서는 `-5`가 덮어씀 |
| selected 배경 `rgba(255,255,255,0.08)` | A + C | 조건부 클래스(`active selected`) |
| 구분선 `rgba(255,255,255,0.05)` | A | `bg-grey-5` |
| 제목 색 | A | `text-def` → `rgb(255,255,255)` |
| 우선순위 3색 | **A** | `--color-priority-high/medium/low` |
| 우선순위 없음 | A | `text-grey-40` → 전경색 40% |
| 날짜 힌트 색 | A | `rgb(71,114,250)` = `--color-primary` |
| radius 10 | **B. 유틸리티 임의값** | `rounded-[10px]` |
| 행 높이 40 | **D. layout-derived** | `leading-[40px]` + 제목 24 + padding 16 |
| 좌우 inset 18 | B | `ml-[18px] right-[18px]`, `pl-[18px]` |
| 구분선 시작 58 | B | `margin-left: 58px` (= 18 + 40) |
| 아이콘 12 / 체크 17 | B | `w-[12px]`, `i-4` |
| 전환 0.2s | B | Tailwind `transition duration-200` |

**[Observed] Component 01~05과 같은 색 체계를 그대로 쓴다.** 새로 등장한 것은 **우선순위 3색**뿐이고, 그것도 이미 `body`에 정의돼 있던 토큰이다(Component 01 §5.2에서 확인).

---

## 11. Sidebar Row(C01)와의 직접 비교

| Property | **Sidebar Row (C01)** | **Task Row (C06)** | 차이 |
|---|---|---|---|
| 행 높이 | **36** | **40** | +4 |
| 행 pitch | 38 (36 + 2) | **40 (간격 0)** | 구조 다름 |
| 배경 radius | 10 | **10** | 같음 |
| 배경을 그리는 요소 | 행 버튼 자신 | **별도 레이어(`.l-task-bg`)** | 다름 |
| 배경 좌우 inset | 10(바깥) + 12(패딩) | **18(좌우 동일)** | 다름 |
| **hover 배경** | **3%** | **5%** | **다름** |
| **selected 배경** | **8%** | **8%** | 같음 |
| selected+hover | 변화 없음 | **변화 없음** | 같음 |
| 구분선 | **없음** | **1px 5%, hover 시 사라짐** | 다름 |
| 라벨 | 14/400, **nowrap + ellipsis** | 14/400, **pre-wrap 줄바꿈** | 다름 |
| 라벨 line-height | 20 | **24** | +4 |
| 아이콘 슬롯 | 20×20 | 체크박스 17×17 | 다름 |
| 트레일링 | 24px 슬롯, count↔more 교대 | tips(가변) + more 별도 | 다름 |
| 액션 등장 | hover/focus에서 opacity 0→1 | hover에서 **visibility** hidden→visible | 방식 다름 |
| **포커스 링** | **`auto 1px` accent** | **없음** | **다름** |
| transition | 0s | LI 0.2s / 배경 0s | 다름 |

**[Observed] 두 행은 같은 컴포넌트가 아니다.** 공유하는 것은 **radius 10과 selected 8%** 정도이고, 높이·hover 알파·라벨 처리·포커스·구분선이 전부 다르다.

**[Inference]** 사이드바 행은 "고르는 것", 태스크 행은 "읽고 처리하는 것"이라는 역할 차이가 그대로 반영된 것으로 보인다. 태스크 행이 4px 높고 line-height가 4 큰 것, 제목을 자르지 않는 것, 구분선을 두는 것 모두 **읽기**를 위한 선택으로 읽힌다.

---

## 12. 이 분석이 확인하지 않은 것

- **completed(완료) 상태** — 리스트 뷰에 완료 태스크가 보이는 화면을 찾지 못했다. 이 계정의 다른 리스트는 대부분 kanban 뷰이고, 뷰 모드를 바꾸는 것은 지속되는 UI 상태 변경이라 하지 않았다. **취소선·색 변화·체크박스 변화 전부 미측정.**
- **2줄 제목 행의 실제 높이** — 계산상 64지만 이번 6개 행에 2줄짜리가 없었다.
- **`:active`(누름)** — 마우스 다운 유지 측정 수단 없음(01~05와 동일).
- **aria 속성 전수 스캔** — 태스크 행에 대해 `tabindex=0`과 "포커스해도 아무 표시 없음"만 확인했고, `role`/`aria-*` 목록은 열거하지 않았다.
- **좌측 3px 레인의 정체** — 어떤 상태에서도 칠해지지 않아 용도를 확정하지 못했다.
- **드래그 재정렬** — 수행하지 않았다. `LI`의 0.2s 전환이 여기 쓰이는지는 추론이다.
- **체크박스 hover 아이콘**(`icon-hover-checkbox`) — `display:none`이라 어떤 조건에서 나타나는지 확인 못 했다.
- **라이트 테마**, **원본 CSS 규칙**(CORS) — 01~05와 동일한 제약.

---

## 13. Fidelity Specification

관찰된 TickTick 동작만 적는다. 개선안은 Appendix A.

```
TASK LIST ROW (본문 리스트 뷰)

Row
  height              : 40px (제목 1줄). 제목이 늘면 행이 자란다
  pitch               : 40px — 행 사이 간격 0
  positioning         : LI가 absolute + top으로 배치 (가상 리스트)
  border              : 없음
  focusable           : .l-task에 tabindex 0

Background layer (별도 요소)
  좌우 inset          : 18px (양쪽 동일)
  radius              : 10px
  normal              : 없음
  hover               : 전경색 5% 알파
  selected            : 전경색 8% 알파
  selected + hover    : selected와 동일 (변화 없음)
  전환                : 없음 (즉시)

Separator (별도 요소, 보더 아님)
  두께 / 색           : 1px / 전경색 5% 알파
  좌측 시작           : 제목의 x와 동일 (행 좌측 끝이 아님)
  우측 끝             : 배경 레이어보다 12px 안쪽
  hover / selected    : 감춘다 (visibility: hidden)

Checkbox
  히트 영역           : 17 × 행 전체 높이(40)
  아이콘 박스         : 17 × 17,  글리프 14.9 × 14.9
  색                  : 우선순위 토큰을 그대로 사용
                        없음 전경색 40% / 낮음 파랑 / 보통 주황 / 높음 빨강
  우선순위 전용 배지  : 없음 (색이 유일한 표현)

Title
  font                : 14px / 400 / line-height 24
  padding             : 8px 0
  줄바꿈              : pre-wrap — 말줄임하지 않고 다음 줄로 넘긴다
  color               : 전경색 100%

Tips (트레일링 힌트)
  종류                : 날짜 · 메모 · 반복 (한 행에 3개까지 관찰)
  배치                : flex-none, 우측 고정, 서로 4px 간격, 묶음 오른쪽 12px
  날짜 typography     : 12px / 400 / line-height 18
  날짜 색             : 오늘 마감 = accent
  힌트가 늘면         : 제목 폭이 줄고, 행 높이·우측 정렬은 불변

Hover actions
  drag handle         : 12 × 12, 행 좌측 바깥(배경 레이어 밖)
  more button         : 12 × 12, 행 우측
  등장 방식           : visibility hidden → visible (opacity 아님)
  등장 조건           : 행 hover

States
  focus-visible       : 시각 표시 없음 (outline·shadow·배경 전부 변화 없음)
  pressed             : 정의 확인 못 함
  completed           : 미측정

Transition
  LI                  : 0.2s cubic-bezier(0.4,0,0.2,1) — 재정렬용으로 추정
  배경·구분선·나머지  : 없음 (0s). hover 배경 변화는 즉시

Variant
  habit 항목          : 체크박스 대신 20×20 아이콘. 슬롯 폭만 17→20, 나머지 동일
```

---

## 14. Component 01~06 Candidate Shared Rules

**2개 이상에서 반복 확인된 것만.** 아직 Design Token으로 확정하지 않는다.

| 후보 규칙 | 01 | 02 | 03 | 04 | 05 | 06 | 상태 |
|---|---|---|---|---|---|---|---|
| **전경색 1개(흰색) × 알파로 위계** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **6/6** |
| **그림자 없음** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **6/6** |
| **selected 배경 = 전경색 8%** | ✔ | — | — | ✔ | — | ✔ | **3/3** |
| **선택된 행은 hover에 반응하지 않음** | ✔ | — | — | — | — | ✔ | **2/2** |
| **행 radius 10px** | ✔ | — | ✘(헤더 6) | ✔ | — | ✔ | **3/3** |
| **액션은 평소 숨김 → hover에서 등장** | ✔ | — | ✔ | ✔ | — | ✔ | **4/4** |
| **경계/구분은 1px 하이라인** | — | ✔ | — | — | ✔ | ✔ | **3/3** |
| **색은 토큰 / 치수는 임의값** | ✔ | ✔ | 부분 반례 | ✔ | ✔ | ✔ | **5.5/6** |
| **`data-*`는 style hook 아님, 상태는 클래스** | ✔ | — | ✔ | ✔ | ✔ | ✔ | **5/5** |
| **aria 사실상 없음 / 이름 없는 아이콘 버튼** | ✔ | — | ✔ | ✔ | ✔ | (부분) | **4/4** |
| ~~**hover 배경 = 전경색 3%**~~ | 3% | — | 3% | 3% | — | **5%** | **깨짐 → §14.2** |
| ~~**focus ring = `auto 1px` accent**~~ | ✔ | — | ✔ | ✔ | — | **없음** | **깨짐 → §14.2** |
| ~~**transition 없음(전부 0s)**~~ | ✔ | ✔(예외 1) | ✔ | ✔ | ✔ | **LI 0.2s** | **약화 → §14.2** |

### 14.1 spacing grid — 계속 유보

06에서 새로 나온 값: 40 · 18 · 17 · 12 · 5 · 58 · 24 · 20. **5와 17이 홀수**다(Component 05의 5px 핸들에 이어 두 번째·세 번째 홀수).

→ **"2px 격자"조차 예외가 누적되고 있다.** 여섯 컴포넌트를 봤지만 여전히 **격자 규칙을 확정하지 않는다.**

### 14.2 Conflict / Revision Candidate (R-9 ~ R-11)

기존 문서는 수정하지 않고 후보만 기록한다. (Component 04의 R-1~R-5, 05의 R-6~R-8에 이어 번호를 잇는다.)

| # | 기존 서술 | 06의 관찰 | 성격 |
|---|---|---|---|
| **R-9** | **C01·C03·C04** — "hover 배경 = 전경색 **3%**"가 3/3으로 가장 견고한 후보 중 하나 | 태스크 행의 hover는 **5%**(`bg-grey-5`)다 | **범위 축소.** 3%는 **사이드바 한정** 규칙이고 전역 상수가 아니다. 본문은 5%를 쓴다 |
| **R-10** | **C01 §4 / C03 §7 / C04 §5.2** — "focus-visible = `outline: auto 1px rgb(71,114,250)`, offset 0"이 3/3 | 태스크 행은 `tabindex=0`이고 `:focus-visible`도 매칭되지만 **아무것도 그리지 않는다** | **범위 축소 + 결함.** 포커스 링은 사이드바 계열에만 있다. 본문 태스크 행은 키보드 포커스가 **보이지 않는다** |
| **R-11** | **C01~C05** — "transition 없음(0s)"이 5/5로 가장 견고한 후보 | 태스크 `LI`에 **0.2s cubic-bezier(0.4,0,0.2,1)** 전환이 걸려 있다 | **약화.** 다만 hover 배경을 그리는 `.l-task-bg`는 0s여서 **체감상 즉시**다. "상태 전환은 즉시, 위치 전환에는 0.2s"로 다듬을 후보 |

**[Inference]** R-9·R-10을 합치면, **사이드바와 본문이 서로 다른 규칙 세트를 쓴다**는 그림이 나온다. 여섯 컴포넌트 중 다섯이 사이드바였기 때문에 그동안 "전역 규칙"처럼 보였던 항목들이, 본문을 한 번 보자마자 셋이나 깨졌다. **앞으로의 shared rule은 "사이드바 규칙"과 "본문 규칙"을 구분해서 세는 편이 정확해 보인다.**

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다.**

1. **태스크 행에 포커스 링을 준다.** TickTick은 키보드 포커스가 전혀 보이지 않는다(R-10). 사이드바에서 쓰는 `outline: 1px accent`를 본문에도 동일하게 적용한다.
2. **우선순위를 색 단독으로 표현하지 않는다.** 체크박스 색만으로는 색각 이상 사용자가 구분할 수 없다. 우리 앱은 이미 제목 뒤 플래그 아이콘을 쓰고 있으므로(`.tm-task-priority`) 그 방향을 유지하되, 체크박스 색과 **병행**하는 편이 낫다.
3. **구분선을 hover에서 감추는 처리는 채택할 만하다.** radius 배경과 1px 직선이 겹칠 때 생기는 어색함을 깔끔하게 없앤다. 우리 `.tm-task`는 `border-bottom`을 쓰는데, 같은 문제가 생기면 이 방식이 답이다.
4. **배경을 별도 레이어로 뽑는 것은 우리에겐 과할 수 있다.** TickTick이 그렇게 한 이유는 좌우 18px inset과 radius를 유지하면서 드래그 핸들을 배경 밖에 두기 위해서로 보인다. 드래그 핸들을 행 안에 둔다면 `.tm-task`에 직접 배경을 칠해도 된다.
5. **제목은 말줄임 대신 줄바꿈으로.** 우리 `.tm-task-title`은 현재 `nowrap + ellipsis`다. 태스크 제목은 내용이므로 2줄까지 허용하는 편이 낫다. 다만 행 높이가 가변이 되므로 가상 리스트를 쓴다면 높이 계산을 함께 손봐야 한다.
6. **행 높이 36 vs 40.** 우리 `.tm-task`는 36이다. TickTick 본문은 40이고 line-height도 24(우리는 20)다. 읽는 화면이라는 점을 감안하면 **40/24로 올리는 것**을 검토할 만하다 — 다만 이건 Component 01에서 사이드바를 36으로 맞추자고 한 것과 **별개 결정**이다.
7. **hover 알파를 영역별로 나눈다.** 사이드바 3% / 본문 5%라는 TickTick의 구분은 근거가 있어 보인다(본문이 더 넓어 같은 알파면 약해 보인다). 우리도 한 값으로 통일하기보다 두 값을 두는 편이 나을 수 있다.

---

## 15. 이 문서가 남긴 상태

| 항목 | 상태 |
|---|---|
| Component 01~05 문서 | **수정하지 않음.** 충돌·보강 후보는 §14.2에만 기록 |
| 우리 앱 코드 | **수정하지 않음** |
| TickTick 화면 | **기본함(`#p/inbox/kanban`)으로 복원** |
| sidebar | 240 · expanded (Component 05에서 복원한 상태 유지) |
| Component 04 테스트 데이터 | `ZZ Folder` + 리스트 3개 **그대로 유지**(폴더 펼침). 삭제 원하시면 알려주시면 지운다 |
| 태스크 데이터 | **변경 없음.** 체크박스를 누르지 않았다 |
