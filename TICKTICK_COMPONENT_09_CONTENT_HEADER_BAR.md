# TickTick 역설계 #09 — Content Header Bar (`.tl-bar`)

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **본문 상단 헤더 바** — 사이드바 토글 · 뷰 이름 · 우측 액션
작성일: 2026-08-20

Component 01~08에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 인용한다.

**대상 선정 이유**: 셸 지도(rail / sidebar / list / detail)에서 마지막으로 남은 구조 조각이고, 우리 앱의 `--shell-header-h: 56px`와 직접 비교된다.

## 0. 측정 조건 · 이번 회차에 일어난 사고와 복구

| 항목 | 값 |
|---|---|
| viewport | **1387 × 713 CSS px** (dpr 2) |
| 테마 / 로케일 | dark / ko |
| 측정 화면 | `오늘`(리스트 뷰)과 `기본함`(칸반 뷰) 양쪽 |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · 실제 마우스 hover |

### 0.1 측정 중 발생한 사고

측정 도중 **브라우저 뷰포트가 145 × 54 CSS px로 급락**했다(외곽 창은 1100×800으로 보고됨 → 페이지 줌이 7배 이상으로 튄 상태). Component 02·05에서 겪은 줌 이상의 극단적 재발이며, **내 조작으로 만든 상태가 아니고 줌 단축키는 도구에서 차단돼 되돌릴 수단이 없었다.**

그 상태에서 TickTick이 **좁은 폭 레이아웃으로 전환**했고, 그 과정에서 **저장된 사이드바 폭이 240 → 130.5로 덮어써졌다.**

### 0.2 복구

| 항목 | 조치 | 결과 |
|---|---|---|
| 뷰포트 | 페이지 새로고침 | **1387 × 713 복구** |
| Rail | — | **50 복구** |
| **사이드바 폭 130.5** | **앱 자체 드래그**로 240까지 되돌림(localStorage를 직접 쓰지 않았다) | **240 복구** (`leftListWidth = "240"`) |
| 사이드바 접힘 | — | `isLeftListHide = "false"` |
| detail 폭 | — | `35.976%` 유지 |
| 화면 | 기본함으로 복원 | `#p/inbox/kanban` |
| Component 04 테스트 데이터 | — | `ZZ Folder` + 리스트 3개 유지 |

**데이터는 변경하지 않았다.** 헤더의 정렬·더보기 메뉴는 열지 않았고, 사이드바 토글은 복구 목적으로만 눌렀다.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §9에 적는다.

---

## 1. 구조

```
HEADER.tl-bar                                          616 × 64 @290,0  (리스트 뷰)
│   px-[20px] pt-[15px] pb-[15px]
│   flex · items-center · justify-between · relative
│   배경 없음 · border 없음 · box-shadow 없음
│
├ BUTTON#left-menu-t.left-menu-t.mr-[6px].w-[20px].h-[20px].flex-none   20 × 20 @310,22
│   └ DIV.relative.flex.items-center.group.bgIconWrapper_aJONI
│       ├ DIV.absolute.opacity-0.z-0.bg.bg-grey-5      30 × 30 @305,17  radius 8   ← hover 배경
│       └ svg.icon-sidebar-collapse.w-[20px].h-[20px]  20 × 20   → #sidebar-collapse
│
├ DIV.tl-bar-project-name.overflow-hidden.max-w-[calc(100%-100px)]      52 × 34 @332,15
│   └ DIV.tl-des.select-enabled.font-semibold.flex-auto                 40 × 28 @338,18
│           "오늘"   20px / 600 / line-height 28
│
└ DIV.tl-bar-action-bar.flex-auto.items-center.h-[18px]                 502 × 18 @384,23
    ├ DIV.tl-bar-action.tl-bar-share-action.flex-auto                   410 × 0  (비어 있음)
    └ DIV.flex.items-center                                             92 × 20 @794,22
        ├ DIV  → svg.icon-light            20 × 20 @794   #light         (+ hover 배경 30×30)
        ├ DIV.mr-[16px] → .tl-bar-action   20 × 20 @830   #sort          (+ hover 배경)
        └ DIV → .tl-bar-action > A         20 × 20 @866   #more-titlebar (+ hover 배경)
```

---

## 2. Geometry

### 2.1 높이 — 뷰에 따라 다르다

| 뷰 | 헤더 높이 | padding | 아이콘 수 |
|---|---|---|---|
| **칸반**(`#p/inbox/kanban`) | **49** | **`15px 20px 0px`** | 3 (collapse · sort · more) |
| **리스트**(`#q/today/tasks`) | **64** | **`15px 20px`** | 4 (collapse · **light** · sort · more) |

산술: 콘텐츠(프로젝트 이름 블록) **34** 고정 + 상단 15 + 하단 **0 또는 15**.

**[Observed] 헤더 높이가 고정이 아니다.** `padding-bottom`이 칸반에서 0, 리스트에서 15로 달라 15px 차이가 난다. Component 02가 잰 49는 **칸반 뷰의 값**이었다.

**[Inference]** 칸반은 바로 아래에 컬럼 헤더(`미분류`·`일정` 등)가 오고, 리스트는 태스크 행이 바로 온다. 아래 콘텐츠의 자체 여백 유무에 맞춰 헤더가 하단 패딩을 조절하는 것으로 보인다. **다만 다른 뷰(캘린더·매트릭스 등)는 확인하지 않았다.**

### 2.2 가로 (리스트 뷰, 본문 290 – 906)

| 요소 | x | width | 본문 기준 |
|---|---|---|---|
| 헤더 | 290 | 616 | — |
| **토글 버튼** | **310** | 20 | **좌측 인셋 +20** |
| 프로젝트 이름 래퍼 | 332 | 52 | 토글 + `mr-[6px]` → 310+20+6 = 336? 실측 332 |
| 프로젝트 이름 텍스트 | 338 | 40 | |
| 액션 바 | 384 | 502 | `flex-auto` |
| 우측 아이콘 1 (light) | **794** | 20 | |
| 우측 아이콘 2 (sort) | **830** | 20 | 스텝 **36** = 20 + `mr-[16px]` |
| 우측 아이콘 3 (more) | **866** | 20 | 우측 끝 886 = **−20** |

**[Observed] 좌우 인셋이 20px로 동일하다.** Component 07의 detail 패널과 같은 값이다.

**[Observed] 우측 아이콘 스텝은 36(아이콘 20 + 간격 16)**이고, Component 07 footer의 스텝(18 + 16 = 34)과 다르다 — 아이콘 크기가 달라서다(헤더 20 / detail footer 18).

---

## 3. Typography

| 항목 | 값 |
|---|---|
| 뷰 이름 (`.tl-des`) | **20px / 600 / line-height 28** |
| 색 | `rgb(255,255,255)` |
| 클래스 | `font-semibold` |
| 래퍼 | `max-width: calc(100% - 100px)`, `overflow: hidden` |

**[Observed] `max-width: calc(100% - 100px)`**로 이름이 길어도 우측 액션 자리(100px)를 침범하지 않는다.

이 시리즈의 타이포를 한자리에 모으면:

| 위치 | size / weight / line-height |
|---|---|
| 섹션 헤더 (C03) | 12 / 700 / 16 |
| 사이드바 행 (C01) | 14 / 400 / 20 |
| 태스크 행 (C06) | 14 / 400 / 24 |
| 상세 제목 (C07) | 19 / 700 / 27 |
| **본문 헤더 이름 (C09)** | **20 / 600 / 28** |

**[Observed] 화면에서 가장 큰 글자는 본문 헤더의 뷰 이름(20px)이다.** 상세 패널 제목(19px)보다도 1px 크다.

---

## 4. 아이콘 버튼 — hover 배경 레이어

각 아이콘 버튼은 **아이콘 + 그 뒤에 깔린 배경 레이어** 2겹이다.

| 항목 | 값 |
|---|---|
| 아이콘 | **20 × 20** |
| **hover 배경 레이어** | **30 × 30**, 아이콘 기준 상하좌우 **5px씩 확장** |
| 배경 radius | **8px** |
| 배경 색 | **`rgba(255,255,255,0.05)`** (`bg-grey-5`) |
| 배경 opacity | **0 → 1** (hover 시) |
| **transition** | **`all / 0s`** — 즉시 |
| 아이콘 색 | `rgb(255,255,255)`, hover에서 변화 없음 |
| 래퍼 클래스 | `bgIconWrapper_aJONI` + `group` |

**[Observed] 헤더 아이콘에는 hover 배경이 있다.** 이는 Component 07(detail 툴바 — hover 배경 없음)·Component 08(Rail — 불투명도만)과 **다른 세 번째 방식**이다.

**[Observed] 히트 영역과 시각 영역이 어긋난다.** 버튼 요소 자체는 20×20인데 hover 배경은 30×30이다. 즉 **보이는 배경보다 실제 클릭 영역이 작다.**

**[Inference]** 배경 레이어가 `position: absolute`로 버튼 밖으로 5px씩 삐져나오게 만든 구조다. 시각적으로는 30px 타깃처럼 보이지만 실제로는 20px만 눌린다 — 의도라기보다 구현상의 부작용으로 보인다.

### 4.1 `i-o-36` / `i-h-o-54` — 확인 실패

`#sort`와 `#more-titlebar` 아이콘에는 `i-o-36 i-h-o-54` 클래스가 붙어 있다(이름상 "opacity 36% / hover 54%"로 읽힌다). 그러나 실측한 computed 값은 **전부 1**이었다:

| 측정 대상 | opacity | fill-opacity | stroke-opacity | filter |
|---|---|---|---|---|
| `svg.icon-sort` | 1 | 1 | 1 | none |
| `svg.icon-more-titlebar` | 1 | 1 | 1 | none |
| `<use>` 요소 | 1 | — | — | — |
| 빈 div에 `i-o-36`만 적용(probe) | 1 | 1 | — | — |

**따라서 이 클래스가 실제로 무엇을 하는지 확정하지 못했다.** 스프라이트 심볼 내부(shadow tree)의 path에 적용될 가능성이 있으나 그쪽은 `getComputedStyle`로 도달할 수 없다. 시각 확인을 위한 확대 스크린샷도 렌더러 타임아웃으로 실패했다. **미확정으로 남긴다.**

---

## 5. Surface / Boundary

| 항목 | 값 |
|---|---|
| 배경 | **없음** (`rgba(0,0,0,0)`) — 본문 배경이 그대로 비친다 |
| **border-bottom** | **없음** (0px) |
| box-shadow | **없음** |
| position | `relative` (sticky 아님) |
| z-index | `auto` |

**[Observed] 헤더와 본문 사이에 경계선이 전혀 없다.** Component 07의 detail 패널 헤더가 `::before`로 1px 선을 그렸던 것과 대조된다.

**[Inference]** 본문은 헤더 아래로 스크롤되는 영역이 아니라 **자체 스크롤 컨테이너**를 갖기 때문에(C06의 가상 리스트), 헤더가 콘텐츠 위로 겹칠 일이 없어 경계선이 필요 없는 것으로 보인다.

---

## 6. 우발적으로 관찰된 좁은 폭 레이아웃

§0.1의 사고로 뷰포트가 **145 × 54**가 되었을 때, TickTick이 좁은 폭 레이아웃으로 전환하는 것을 관찰했다. **의도한 측정이 아니고 조건도 비정상이라 참고로만 기록한다.**

| 항목 | 정상(1387) | 좁은 폭(145) |
|---|---|---|
| **Global Rail** | 50, 존재 | **`.sidebar_2byOi`가 DOM에서 사라짐** (폭 0) |
| 사이드바 | flex 아이템, 240 | **`position: absolute; z-index: 5`**, 폭 130.5 |
| 사이드바 그림자 | 없음 | **`box-shadow: rgba(25,25,25,0.05) 8px 0 8px`** |
| **backdrop** | 없음 | **`DIV.fixed.z-[4].top-0.left-0.right-0.bottom-0.bg…`** 추가됨 |
| 본문 | x 290 | **x 0**, 전체 폭 |
| 저장된 사이드바 폭 | 240 | **130.5로 덮어써짐** |

**[Observed] 좁은 폭에서는 (a) Rail이 사라지고 (b) 사이드바가 backdrop을 동반한 오버레이가 되며 (c) 그림자가 생긴다.** Component 02 §13에서 "데스크톱 폭에서는 overlay 방식이 아니다"라고 했는데, **충분히 좁아지면 overlay로 바뀐다**는 것이 확인됐다.

**[Observed] 그 전환 과정에서 저장된 사이드바 폭이 덮어써진다.** 사용자가 창을 크게 줄였다가 되돌리면 원래 폭을 잃는다.

**breakpoint는 확정하지 못했다** — 145px 한 지점만 관찰했고 뷰포트를 제어할 수 없다.

---

## 7. Fidelity Specification

```
CONTENT HEADER BAR

Container
  tag                 : <header>
  height              : 콘텐츠 34 + padding-top 15 + padding-bottom(뷰에 따라 0 또는 15)
                        → 칸반 49 / 리스트 64
  padding             : 15px 20px (칸반은 하단 0)
  layout              : flex, items-center, justify-between
  background          : 없음 (본문 배경이 비침)
  border-bottom       : 없음
  box-shadow          : 없음
  position            : relative (sticky 아님)

Left
  sidebar toggle      : 20 × 20, 좌측 인셋 20
                        아이콘 #sidebar-collapse ↔ #sidebar-expand 교체
                        margin-right 6

View name
  font                : 20px / 600 / line-height 28
  color               : 전경색 100%
  max-width           : calc(100% - 100px)  ← 우측 액션 자리를 침범하지 않는다
  overflow            : hidden

Right actions
  아이콘              : 20 × 20
  간격                : margin-right 16 → 스텝 36
  우측 인셋           : 20
  구성                : 뷰에 따라 다름 (칸반 2개 / 리스트 3개)

Icon button (공통)
  히트 영역           : 20 × 20  ← 버튼 요소 자체
  hover 배경          : 30 × 30, radius 8, 전경색 5% 알파, opacity 0 → 1
                        (아이콘보다 상하좌우 5px 크다 = 보이는 것보다 히트가 작다)
  transition          : 없음 (0s)
  아이콘 색           : 전경색 100%, hover에서 변화 없음

Narrow layout (비정상 조건에서 관찰, breakpoint 미확정)
  Rail                : 사라진다
  사이드바            : position absolute + z-index 5 + 그림자, backdrop(fixed z-4) 동반
  본문                : 전체 폭
  주의                : 전환 시 저장된 사이드바 폭이 덮어써진다
```

---

## 8. Component 01~09 Shared Rules 갱신

| 후보 규칙 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 상태 |
|---|---|---|---|---|---|---|---|---|---|---|
| **전경색 1개 × 알파로 위계** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **9/9** |
| **그림자 없음** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **9/9**※ |
| **SVG 스프라이트 + currentColor** | ✔ | — | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | **7/7** |
| **20px 가로 인셋(본문 계열)** | — | — | — | — | — | — | ✔ | — | ✔ | **2/2** |
| **색은 토큰 / 치수는 임의값** | ✔ | ✔ | 부분 반례 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **8.5/9** |

※ 단 §6에서 좁은 폭 오버레이 사이드바에 그림자가 관찰됐다 — **정상 폭에서만 성립하는 규칙**으로 범위가 좁아진다.

### 8.1 액션 hover 표현이 영역마다 다르다 — 세 가지 방식

| 영역 | hover 표현 |
|---|---|
| 사이드바 (C01·C03·C04) | 아이콘 opacity **40% → 100%**, 행 배경 3% |
| Rail (C08) | 아이콘 opacity **40% → 60%** (배경 없음) |
| detail 툴바 (C07) | **아무 변화 없음** |
| **본문 헤더 (C09)** | **30×30 배경 5% 알파, radius 8** (아이콘 색 불변) |

**[Observed] 아이콘 버튼의 hover 표현에 공통 규칙이 없다.** 네 영역이 네 가지 방식을 쓴다.

**[Inference]** Component 06의 R-9(hover 알파가 사이드바 3% / 본문 5%)에 이어, **"영역마다 규칙 세트가 다르다"는 그림이 다시 확인된다.** 이 시리즈에서 전역 상수로 부를 수 있는 것은 색 체계(전경색 × 알파)와 스프라이트 아이콘 방식 정도로 좁혀진다.

### 8.2 Conflict / Revision Candidate (R-16 ~ R-17)

| # | 기존 서술 | 09의 관찰 | 성격 |
|---|---|---|---|
| **R-16** | **C02 §5** — "본문 헤더 `HEADER.tl-bar`, 높이 **49**, padding `15px 20px 0`" | 49는 **칸반 뷰의 값**이다. 리스트 뷰에서는 **64**(padding `15px 20px`) | **범위 축소.** 헤더 높이는 뷰에 따라 다르다 |
| **R-17** | **C02 §13** — "데스크톱 폭에서는 drawer/overlay 방식이 아니다" | 145px 뷰포트에서 **사이드바가 backdrop + 그림자를 동반한 오버레이로 전환**되고 Rail이 사라진다 | **범위 축소.** 충분히 좁아지면 overlay가 된다. breakpoint는 미확정 |

---

## 9. 이 분석이 확인하지 않은 것

- **`i-o-36` / `i-h-o-54` 클래스의 실제 효과** — §4.1. computed 값은 전부 1이었고 스프라이트 내부는 도달 불가, 확대 스크린샷도 실패.
- **정렬·더보기 메뉴의 내용** — 메뉴를 열지 않았다.
- **칸반·리스트 외 다른 뷰의 헤더**(캘린더·매트릭스·습관 등) — 높이와 액션 구성이 또 다를 가능성이 있다.
- **좁은 폭 레이아웃의 breakpoint** — 145px 한 지점만 우발적으로 관찰.
- **헤더 아이콘의 focus 상태** — 미측정.
- **`.tl-bar-share-action`** — 폭 410에 높이 0인 빈 요소였다. 공유 기능이 있는 리스트에서 무엇이 들어가는지 미확인.
- **라이트 테마**, **원본 CSS 규칙**(CORS) — 01~08과 동일.

---

## 10. 이 문서가 남긴 상태

| 항목 | 상태 |
|---|---|
| Component 01~08 문서 | **수정하지 않음.** 충돌·보강 후보는 §8.2에만 기록 |
| 우리 앱 코드 | **수정하지 않음** |
| viewport | 1387 × 713 (새로고침으로 복구) |
| Rail / 사이드바 | 50 / **240 (복구 완료)**, expanded |
| detail 폭 | 35.976% |
| 화면 | 기본함(`#p/inbox/kanban`) |
| Component 04 테스트 데이터 | `ZZ Folder` + 리스트 3개 유지 |
| 태스크 데이터 | 변경 없음 |
