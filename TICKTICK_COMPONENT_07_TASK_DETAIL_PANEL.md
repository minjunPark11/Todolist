# TickTick 역설계 #07 — Task Detail Panel (우측 pane)

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **본문 우측의 태스크 상세 패널(`.g-right`)**
작성일: 2026-08-20

Component 01(Sidebar Row) · 02(Shell) · 03(Section Header) · 04(Folder Tree) · 05(Resize/Collapse) · 06(Task List Row)에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 인용한다.

**대상 선정 이유**: rail / sidebar / list에 이은 **네 번째 주요 영역**이고, 우리 앱에서도 detail column 작업이 진행 중이다(`e2e/taskDetailColumn.spec.ts`).

## 0. 측정 조건 · 복구

| 항목 | 값 |
|---|---|
| viewport | **1387 × 713 CSS px** (dpr 2) |
| 테마 / 로케일 | dark / ko |
| sidebar | 240, expanded |
| 측정 화면 | `오늘`(Today) 리스트 뷰 + 태스크 1개 선택 |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()`(`::before` 포함) · 실제 마우스 hover · 합성 이벤트 드래그(§5) |

**세션에 가한 변경과 복구**

| 변경 | 복구 |
|---|---|
| 태스크 1개 선택(해시 이동) | 기본함(`#p/inbox/kanban`)으로 복원 |
| **detail 패널 폭 36% → 19.1%(320px) → 36%** | **35.976%로 복원** (원래 36%, 렌더 폭 481→481, 잔차 0.3px 이내) |
| — | sidebar 240 · expanded 유지, Component 04 테스트 데이터 유지 |

**데이터는 변경하지 않았다.** 상세 패널은 제목·설명·날짜·우선순위가 전부 편집 가능한 화면이라, **편집 필드를 클릭하지 않고 읽기와 hover만** 했다. 체크박스도 누르지 않았다.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §11에 적는다.

---

## 1. 셸에서의 위치 — 4열 구조

리스트 뷰의 최상위는 **4열**이다.

| 영역 | 클래스 | x | width | 폭의 출처 |
|---|---|---|---|---|
| Global Rail | `.g-left` | 0 | **50** | 유틸리티 `w-[50px]` |
| Sidebar | `.g-left` | 50 | **240** | 인라인 px (Component 05) |
| Task list | **`.tasklist.g-center`** | 290 | **616** | `flex-1` — 남는 공간 |
| **Detail** | **`.g-right`** | **906** | **481** | **인라인 `width: 36%`** |

**[Observed] detail 패널의 폭은 px가 아니라 백분율이다.** 클래스 `w-[36%]` + 인라인 `style="width: 36%"`이며, 기준은 부모(뷰포트 − rail = 1337)다. 1337 × 0.36 = 481.3 ✔

**[Observed] `min-w-[320px]`가 함께 걸려 있다.**

**[Inference]** 기존 `TICKTICK_FIDELITY_AUDIT.md`가 1440 뷰포트에서 detail을 "500px 고정"으로 적었는데, 36% 규칙으로 계산하면 (1440−50)×0.36 = **500.4**다. 즉 **500px은 고정값이 아니라 그 뷰포트에서의 36%**였던 것으로 보인다. → §12 R-12.

---

## 2. 패널이 항상 존재한다

**[Observed] 태스크를 선택하지 않아도 `.g-right`는 렌더돼 있고 폭 481을 차지한다.** 선택이 없으면 내부에 `.empty-detail-wrapper`가 들어가고, `#icon-empty-task-detail-1/2/3` 세 개의 장식 SVG가 하단 중앙 기준으로 배치된다.

태스크를 선택하면 `.g-right`에 **`has-detail` 클래스가 추가**되고 내용이 교체된다. 폭은 변하지 않는다.

**[Inference]** 선택 여부와 무관하게 열 폭이 고정이므로 **리스트 컬럼의 폭이 선택에 따라 흔들리지 않는다.** 우리 앱이 detail을 조건부로 띄우는 것과 구조적으로 다른 지점이다(Component 02 §2.9에서 지적한 그 차이).

---

## 3. DOM 구조

```
DIV.g-right[.has-detail]  w-[36%] min-w-[320px] overflow-hidden        481 × 713 @906
├ DIV.hide-in-print.absolute.inset-0.pointer-events-none
│   └ DIV.absolute.inset-0.dark:bg-screen-background      bg rgb(28,28,28)   ← 배경 페인트 레이어
├ DIV.detail-dragger.absolute.w-[5px].h-full.left-0.z-10  cursor: ew-resize   5 × 713 @906
├ A.right-menu-t.z-[3].absolute.hidden                    (display: none)
└ DIV.detail-view-wrapper.relative.h-full
  │   border-l 1px  ·  border-grey-5 / dark:border-grey-10
  └ DIV.b-h.h-full > DIV.b-h.h-full
      └ DIV.task-detail.taskDetailInner_ermSP.flex.flex-col.h-full     480 × 713 @907
          ├ DIV.header.td-header.borderBottomBefore.py-[9px].px-[20px].mt-[8px].priority-low
          │   │                                                        480 × 48 @907,8
          │   ├ DIV.task-progress-wrapper.absolute.inset-0
          │   │   ├ DIV.task-progress.h-[2px].bg-primary.opacity-[.85]
          │   │   │      transition-transform duration-200 ease-in-out        ← 진행률 바
          │   │   └ DIV.task-progress-ruler-wrapper  (내부 ruler는 hidden)
          │   └ DIV.toolBar.td-bar > DIV.td-btns.flex                  440 × 30 @927,17
          │       ├ DIV.btn-item.td-check        29 × 30 @927
          │       ├ DIV.btn-item.td-timecard     375 × 30 @956   flex-auto   "오늘, 8월20일"
          │       └ DIV.btn-item.td-priority     36 × 30 @1331
          ├ DIV.body.td-body.flex-auto.overflow-hidden                 480 × 609 @907,56
          │   └ DIV.content-editor.h-full
          │       └ DIV.content.td-content.antiscroll-wrap
          │           ├ DIV.antiscroll-inner.overflow-auto             ← 스크롤 주체
          │           │   ├ DIV.caption-section.td-caption  pt-[16px] px-[20px]   480 × 49
          │           │   │   └ DIV.flex  440 × 29 @927,72
          │           │   │       ├ DIV.line-left.flex-auto   417 @927
          │           │   │       │   └ DIV.MDEditor.title.task-title       ← 제목
          │           │   │       └ DIV.switch-mode  18 × 26 @1348
          │           │   ├ DIV.container-section > DIV.td-editor.center-section
          │           │   │   ├ DIV.td-task-text  pad 4/4/24            ← 설명 영역
          │           │   │   │   └ DIV.td-content.editor-with-link.text-s  472 @911
          │           │   │   ├ DIV.section.center-section > .attachment-file
          │           │   │   └ DIV.section.detail-tag-view  pt-0 px-[20px] pb-[8px]
          │           │   └ … (comments 등, 현재 높이 0)
          │           └ DIV.antiscroll-scrollbar-vertical   6px 오버레이
          └ DIV.footer.td-footer.flex-none                             480 × 48 @907,665
              └ DIV.toolBar.h-[48px].leading-[48px].mr-[20px].flex     460 @907
                  ├ DIV.td-item.project-setting  230 × 48 @907   (아이콘 #move-list 18×18 @927)
                  └ DIV.td-items.flex  86 @1281
                      ├ DIV.td-item.mr-[16px]  18 × 18 @1281   #td-footer-markdown
                      ├ DIV.td-item.mr-[16px]  18 × 18 @1315   #td-footer-comment
                      └ DIV.td-item.more       18 × 18 @1349   #more-titlebar
```

### 3.1 단순화

```
DetailPanel (.g-right, 36% 폭, min 320)
 ├ ResizeHandle   (좌측 5px)
 ├ Border         (좌측 1px)
 └ TaskDetail (flex column)
     ├ Header  48   : [체크] [날짜·시간 (flex-auto)] [우선순위]   + 하단 1px + 진행률 2px
     ├ Body    flex : 스크롤 영역 — 제목 → 설명 → 첨부 → 태그 → 댓글
     └ Footer  48   : [리스트 선택 (좌)]              [MD] [댓글] [더보기] (우)
```

---

## 4. Geometry

### 4.1 세로 3단

| 영역 | y | height | 비고 |
|---|---|---|---|
| (패널 상단 여백) | 0 – 8 | **8** | `.td-header`의 `margin-top: 8px` |
| **Header** | **8 – 56** | **48** | padding `9px 20px` |
| **Body** | **56 – 665** | **609** | `flex-auto`, 스크롤 |
| **Footer** | **665 – 713** | **48** | `flex-none` |

### 4.2 가로 인셋 — 20px 하나로 통일

| 요소 | x | 패널(907) 기준 | 우측(1387) 기준 |
|---|---|---|---|
| Header 툴바 | 927 | **+20** | 끝 1367 = **−20** |
| 제목 | 927 | **+20** | — |
| 설명(`.td-content`) | 911 | +4 | — |
| 태그 섹션 | `px-[20px]` | **+20** | **−20** |
| Footer 리스트 아이콘 | 927 | **+20** | — |
| Footer 우측 마지막 아이콘 | 1349 | — | 끝 1367 = **−20** |

**[Observed] 좌우 인셋이 전부 20px이다.** 예외는 설명 편집 영역(`.td-task-text`가 자체 padding 4px를 갖는다).

### 4.3 툴바 아이템

| 위치 | 아이템 | 크기 | 아이콘 |
|---|---|---|---|
| Header | `.td-check` | **29 × 30** | `#wont-do-filled`(현재 미표시) |
| Header | `.td-timecard` | **375 × 30** (`flex-auto`) | `#date-unselected` **20 × 20**, 색 `rgb(71,114,250)` |
| Header | `.td-priority` | **36 × 30** | `#priority-1` **20 × 20** |
| Footer | `.project-setting` | **230 × 48** | `#move-list` **18 × 18** |
| Footer | markdown | **18 × 18** | `#td-footer-markdown` |
| Footer | comment | **18 × 18** | `#td-footer-comment` |
| Footer | more | **18 × 18** | `#more-titlebar` |

Footer 우측 3개는 `mr-[16px]` 간격이고 x는 1281 / 1315 / 1349 → **간격 34 = 아이콘 18 + 16.**

---

## 5. Resize

detail 패널도 **자체 리사이즈 핸들**을 갖는다.

| 항목 | 값 |
|---|---|
| 요소 | `DIV.detail-dragger.absolute.w-[5px].h-full.**left-0**.z-10` |
| 위치 | 패널 **좌측** 끝 5px (사이드바 핸들은 우측이었다) |
| cursor | `ew-resize` (인라인 style) |
| z-index | **10** (사이드바 핸들은 2) |
| 배경 | 투명, hover 시각 변화 확인 안 함 |

### 5.1 드래그 실측

Component 05와 동일한 방법(합성 pointer/mouse + 이동 사이 시간 간격)으로 구동했다.

| pointer clientX | 인라인 width | 렌더 폭 | 리스트 컬럼 |
|---|---|---|---|
| (시작) | `36%` | 481.3 | 615.7 |
| 1000 | **`28.9454%`** | 387 | 710 |
| 1100 | **`21.466%`** | **320** | 777 |
| 1200 | `19.1174%` | **320** | 777 |
| 1280 | `19.1174%` | **320** | 777 |
| 1340 | `19.1174%` | **320** | 777 |

**[Observed] 폭이 백분율로 갱신된다.** 사이드바가 px를 쓰는 것(Component 05)과 다르다.

**[Observed] 320px에서 멈추는 것은 CSS `min-width: 320px` 때문이다.** 흥미롭게도 **인라인 백분율은 320 아래로도 계속 내려간다**(21.466% → 19.1174%). 즉 JS가 클램프하지 않고 CSS가 렌더만 막는다.

**[Inference]** 그래서 저장된 값(19.1174%)이 실제 렌더 폭(320px)과 일치하지 않는 구간이 생긴다. 더 넓은 뷰포트로 옮기면 19.1%가 320보다 커지면서 사용자가 마지막에 본 폭과 다르게 복원될 수 있다. **이 시나리오는 확인하지 못했다**(뷰포트 제어 불가).

### 5.2 Persistence

| 키 | 값 |
|---|---|
| **`<account>/rightViewWidthPercent`** | `19.11742707554226` → 복원 후 `35.97606581899775` |

**[Observed] 사이드바(`leftListWidth`, px)와 detail(`rightViewWidthPercent`, %)이 서로 다른 단위로 저장된다.**

---

## 6. Boundary / Surface

| 항목 | 값 |
|---|---|
| 패널 배경 | 자체 배경 없음. 내부 `absolute inset-0` 레이어가 `rgb(28,28,28)`로 칠한다 |
| **좌측 경계** | **1px `rgba(255,255,255,0.1)`** (`.detail-view-wrapper`의 `border-l`, `dark:border-grey-10`) |
| **Header 하단 경계** | **`::before` 의사요소** — `position: absolute`, `height: 1px`, `left/right: 0`, `bottom: 0`, `background: rgba(255,255,255,0.1)` |
| Footer 상단 경계 | **없음** (`border-top: 0`) |
| box-shadow | **없음** |

**[Observed] 경계 알파가 10%다.** Component 02에서 잰 사이드바→본문 경계(6%)·rail→사이드바(5%)보다 **진하다.** Component 06의 태스크 행 구분선(5%)과도 다르다.

**[Observed] Header의 하단 선은 보더가 아니라 `::before`다.** 클래스 이름도 `borderBottomBefore`로 그렇게 말한다.

**[Inference]** 진행률 바(`.task-progress`, 2px)가 Header 하단에 겹쳐 놓이기 때문에, 보더 대신 의사요소로 깔아 두 레이어가 같은 자리에서 겹치도록 한 것으로 보인다.

---

## 7. Typography

| 요소 | size | weight | line-height | color |
|---|---|---|---|---|
| **제목** (`.task-title.MDEditor`) | **19px** | **700** | **27px** | `rgb(255,255,255)` |
| **설명** (`.td-content.text-s`) | **14px** | 400 | **21px** | `rgb(255,255,255)` |
| Header 날짜 (`.td-timecard`) | **14px** | 400 | — | `rgb(255,255,255)` |
| 패널 기본 | 14px | 400 | 21px | `rgb(255,255,255)` |

**[Observed] 제목 19/700은 이 시리즈에서 처음 보는 조합이다.**

| 비교 | size / weight / line-height |
|---|---|
| 사이드바 행 라벨 (C01) | 14 / 400 / 20 |
| 섹션 헤더 (C03) | 12 / 700 / 16 |
| 태스크 행 제목 (C06) | 14 / 400 / 24 |
| **상세 패널 제목 (C07)** | **19 / 700 / 27** |

**[Inference]** 같은 태스크의 제목이 리스트에서는 14/400, 상세에서는 19/700이다. 목록은 **훑는 화면**, 상세는 **읽고 편집하는 화면**이라는 역할 차이를 타이포로 표현한 것으로 보인다.

---

## 8. Body 스크롤

| 항목 | 값 |
|---|---|
| 스크롤 주체 | `.td-body .antiscroll-inner` (`overflow-y: auto`) |
| **네이티브 스크롤바 폭** | **0** (`scrollbar-width: none`) |
| 오버레이 스크롤바 | `.antiscroll-scrollbar-vertical` — **6px, radius 7, `rgba(255,255,255,0.3)`, `right: 2px`, opacity 0, `transition: opacity 0.3s`** |

**[Observed] 사이드바(Component 02 §4)와 완전히 동일한 antiscroll 패턴이다.** 폭·radius·색·페이드 시간이 전부 같다.

---

## 9. States / Transition

| 요소 | hover 시 배경 | radius | 아이콘 색 변화 | transition |
|---|---|---|---|---|
| Header `.td-priority` | **없음** (`rgba(0,0,0,0)`) | 0 | 없음 (흰색 유지) | `all / 0s` |
| Footer `more` | **없음** | 0 | 없음 (흰색 유지) | `all / 0s` |
| `.task-progress` | — | — | — | **`transform` / 0.2s / ease-in-out** |

**[Observed] 툴바 아이템에 hover 배경·radius가 없다.** 아이콘 색도 이미 100% 흰색이라 hover에서 변화가 관찰되지 않았다. (Component 01·03의 사이드바 액션이 40%→100%로 밝아지던 것과 다르다 — 여기는 처음부터 100%다.)

**[Observed] 진행률 바에는 진짜 200ms 전환이 걸려 있다** (`transition-transform duration-200 ease-in-out`). Component 06의 `LI` 0.2s에 이어 **본문 영역에서 두 번째로 발견된 실제 전환**이다.

**측정 한계**: hover에서 배경·radius·아이콘 색만 확인했다. outline·focus 상태는 재지 않았다.

---

## 10. Token / Utility 추적

| 값 | 분류 | 상세 |
|---|---|---|
| 패널 폭 36% | **B + F** | 유틸리티 `w-[36%]` + 인라인 % + localStorage `rightViewWidthPercent` |
| min 320px | **B (CSS)** | `min-w-[320px]` — JS 클램프가 아니다 |
| 좌측 경계 10% | **A. 토큰** | `dark:border-grey-10` → `--color-grey` × `--opacity-variant-grey-10` |
| Header 하단선 10% | A | `::before` 배경, 같은 알파 |
| 진행률 바 색 | **A** | `bg-primary` → `--color-primary` = `rgb(71,114,250)`, `opacity-[.85]` |
| 날짜 아이콘 색 | A | 같은 accent |
| 배경 `rgb(28,28,28)` | A | `dark:bg-screen-background` |
| 오버레이 스크롤바 | A + B | 30% 알파 / 6px / radius 7 |
| 인셋 20px | B | `px-[20px]`, `mr-[20px]`, `pt-[16px]` |
| 3단 높이 48 / 48 | B | `h-[48px]`, `py-[9px]` + 콘텐츠 30 |
| 제목 19/700/27 | **D. layout/타이포 유틸** | 별도 토큰 아님 |
| 아이콘 18 / 20 | B | `w-[18px]`, 20×20 |

**[Observed] 새로 등장한 색 토큰은 없다.** 전부 Component 01~06에서 확인된 계열이다.

---

## 11. 이 분석이 확인하지 않은 것

- **편집 상호작용 일체** — 제목/설명 클릭, 날짜 피커, 우선순위 메뉴, 리스트 이동 드롭다운. 전부 **데이터를 바꿀 수 있어 열지 않았다.**
- **focus / focus-visible 상태** — 툴바 아이템·편집 영역 모두 미측정.
- **완료(completed) 태스크의 상세 화면**, **하위작업(subtask) 목록**, **첨부·댓글 섹션** — 현재 태스크에 해당 데이터가 없어 높이 0이었다.
- **진행률 바가 실제로 채워진 모습** — 이 태스크는 진행률 0이라 폭 0이었다.
- **`.td-check`의 아이콘** — `#wont-do-filled`을 참조하는데 렌더 크기가 0이었다. 어떤 조건에서 보이는지 확인 못 함.
- **저장된 %가 min-width 미만일 때 다른 뷰포트에서 어떻게 복원되는지** (§5.1) — 뷰포트 제어 불가.
- **패널을 접거나 숨기는 컨트롤** — `A.right-menu-t`가 `display: none`으로 존재한다. 어떤 조건에서 나타나는지 미확인.
- **라이트 테마**, **원본 CSS 규칙**(CORS) — 01~06과 동일한 제약.

---

## 12. Fidelity Specification

```
TASK DETAIL PANEL

Shell 위치
  4열 구조          : Rail 50 / Sidebar 240(px) / List flex-1 / Detail 36%
  존재 조건         : 항상 존재. 선택이 없으면 빈 상태 일러스트를 그린다
                      (선택 여부로 폭이 변하지 않는다)
  선택 시           : 루트에 has-detail 클래스 추가

Panel
  width             : 36% (부모 = viewport − rail)
  min-width         : 320px  ← CSS. JS는 클램프하지 않는다
  background        : 전용 페인트 레이어가 화면 배경색으로 칠함
  left border       : 1px, 전경색 10% 알파
  box-shadow        : 없음
  resize handle     : 좌측 5px, ew-resize, z-index 10
  persistence       : localStorage <account>/rightViewWidthPercent (백분율)

Layout (세로 3단)
  top gap           : 8px  (header의 margin-top)
  header            : 48px, padding 9px 20px
  body              : flex-auto, 자체 스크롤
  footer            : 48px
  가로 인셋         : 좌우 20px (설명 편집 영역만 예외적으로 4px)

Header
  하단 경계         : ::before 의사요소, 1px, 전경색 10% 알파
  진행률 바         : 하단 2px, accent 색 opacity .85
                      transition: transform 200ms ease-in-out
  아이템            : [체크 29×30] [날짜 flex-auto 30] [우선순위 36×30]
  아이콘            : 20 × 20
  날짜 typography   : 14px / 400, accent 아이콘

Body
  스크롤            : 내부 antiscroll (네이티브 폭 0)
  오버레이 스크롤바 : 6px, radius 7, 전경색 30%, opacity 0 → 스크롤 시 표시, 0.3s 페이드
  제목              : 19px / 700 / line-height 27
  설명              : 14px / 400 / line-height 21
  섹션 패딩         : caption pt 16 / px 20 / pb 4,  태그 섹션 px 20 pb 8

Footer
  상단 경계         : 없음
  좌측              : 리스트 선택 (아이콘 18×18, 좌측 인셋 20)
  우측              : 아이콘 3개 18×18, 간격 16 (피치 34), 우측 인셋 20

States
  툴바 아이템 hover : 배경 없음, radius 없음, 아이콘 색 변화 없음(이미 100%)
  transition        : 진행률 바만 200ms. 나머지 0s
```

---

## 13. Component 01~07 Candidate Shared Rules

| 후보 규칙 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 상태 |
|---|---|---|---|---|---|---|---|---|
| **전경색 1개(흰색) × 알파로 위계** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **7/7** |
| **그림자 없음** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **7/7** |
| **경계는 1px 하이라인** | — | ✔ | — | — | ✔ | ✔ | ✔ | **4/4** |
| **antiscroll 오버레이 스크롤바(6/7/30%/0.3s)** | — | ✔ | — | — | — | — | ✔ | **2/2** |
| **색은 토큰 / 치수는 임의값** | ✔ | ✔ | 부분 반례 | ✔ | ✔ | ✔ | ✔ | **6.5/7** |
| **상태는 클래스, `data-*`는 style hook 아님** | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✔ | **6/6** |
| **영역마다 자체 5px `ew-resize` 핸들** | — | ✔ | — | — | ✔ | — | ✔ | **3/3** |
| ~~transition 없음~~ | ✔ | ✔ | ✔ | ✔ | ✔ | **LI 0.2s** | **진행바 0.2s** | **본문에서 반복 반증** |

### 13.1 하이라인 알파가 하나가 아니다

지금까지 실측한 1px 경계의 알파를 모으면:

| 위치 | 알파 | 출처 |
|---|---|---|
| Rail → Sidebar | **5%** | C02 |
| Sidebar 내부 구분선 | **10%** | C02 |
| Sidebar → Main | **6%** | C02 |
| 태스크 행 구분선 | **5%** | C06 |
| **Detail 좌측 경계** | **10%** | C07 |
| **Detail header 하단** | **10%** | C07 |

**[Observed] 5% · 6% · 10% 세 값이 쓰인다.** "1px 하이라인"은 공통이지만 **알파는 공통 상수가 아니다.**

**[Inference]** 큰 영역 경계(rail·sidebar→main)는 5~6%로 약하고, **패널 안쪽 구분과 detail 경계는 10%로 진하다.** 다만 태스크 행 구분선이 5%인 것이 이 가설과 어긋난다(행 구분도 "안쪽"이다). 규칙으로 세우기에는 근거가 부족하다.

### 13.2 Conflict / Revision Candidate (R-12 ~ R-13)

기존 문서는 수정하지 않고 후보만 기록한다. (R-1~R-5는 C04, R-6~R-8은 C05, R-9~R-11은 C06.)

| # | 기존 서술 | 07의 관찰 | 성격 |
|---|---|---|---|
| **R-12** | **`TICKTICK_FIDELITY_AUDIT.md` §1.1** — "Detail pane 500px 고정" / **C02 §2.1**이 이를 인용 | detail 폭은 **`36%` + `min-width 320px`**다. 1440 뷰포트에서 (1440−50)×0.36 = **500.4** → 500은 그 뷰포트에서의 36%였다 | **정정.** 고정 px이 아니다 |
| **R-13** | **C02 §3** — 사이드바→본문 경계 6%, rail→사이드바 5%를 근거로 "경계는 약한 1px 하이라인" | detail 경계와 header 하단선은 **10%**다 | **범위 축소.** 알파는 위치마다 다르다(§13.1) |

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다.**

1. **detail 폭을 %가 아니라 px + clamp로 둔다.** TickTick은 %로 저장하면서 JS 클램프를 하지 않아, 저장값이 `min-width` 미만으로 내려가는 구간이 생긴다(§5.1). 우리는 px로 저장하고 저장 시점에 clamp하는 편이 안전하다.
2. **detail을 항상 렌더하는 구조는 채택할 만하다.** 선택 여부로 리스트 컬럼 폭이 흔들리지 않는 것은 실제로 편하다. 빈 상태를 어떻게 그릴지만 정하면 된다.
3. **툴바 아이템에 hover 피드백을 준다.** TickTick은 배경도 색 변화도 없다. 최소한 전경색 3~5% 배경 + radius 6 정도를 권한다.
4. **Header 하단선을 `::before`로 만들 필요는 없다.** TickTick이 그렇게 한 이유는 진행률 바와 겹치기 위해서로 보인다. 진행률 바가 없다면 평범한 `border-bottom`으로 충분하다.
5. **제목 19/700은 우리 타입 스케일에 맞춰 조정한다.** 우리는 `--density-title: 20px`이 이미 있다. 19를 그대로 베끼기보다 20/700으로 맞추는 편이 스케일이 덜 늘어난다.
6. **경계 알파를 한 값으로 정한다.** TickTick은 5/6/10% 세 값을 쓰는데 규칙성이 약하다(§13.1). 우리는 `--border-subtle` 하나로 통일하고, 강조가 필요한 곳만 `--border-strong`을 쓰는 현재 구조를 유지하는 편이 낫다.

---

## 14. 이 문서가 남긴 상태

| 항목 | 상태 |
|---|---|
| Component 01~06 문서 | **수정하지 않음.** 충돌·보강 후보는 §13.2에만 기록 |
| 우리 앱 코드 | **수정하지 않음** |
| TickTick 화면 | 기본함(`#p/inbox/kanban`) |
| sidebar | 240 · expanded |
| **detail 폭** | **35.976% (원래 36%)** — 렌더 폭 481로 동일, 저장값만 소수점 잔차 |
| Component 04 테스트 데이터 | `ZZ Folder` + 리스트 3개 유지 |
| 태스크 데이터 | **변경 없음.** 편집 필드를 열지 않았다 |
